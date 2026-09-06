// Đường đi của danh mục cổ phiếu VN theo TỪNG PHIÊN — thuần, không React, test được.
//
// Vì sao không dùng `investHistory.ts` (đã có sẵn): file đó chạy trên `account_valuations`,
// tức ảnh chụp mà cron ghi. Cron ấy mới bật 05/08/2026 nên chỉ có ~22 phiên — không đủ để
// đứng cạnh VN-Index. File này DỰNG LẠI quá khứ từ sổ lệnh + giá đóng cửa từng phiên, nên
// đường chạy từ lệnh mua đầu tiên. Hai file trả lời hai câu khác nhau và cả hai đều đúng:
// `investHistory` gộp mọi tài khoản đầu tư (cả quỹ JPY) cho trang Tài sản; file này chỉ cổ
// phiếu VN, cho trang Đầu tư.
//
// KHÔNG chép lại phép cộng dồn giá vốn. `holdingsFromTrades` và `brokerCash` được gọi lại
// trên từng tiền tố sổ lệnh. Chậm hơn một chút (2.500 phiên × vài chục lệnh) nhưng đổi lại
// mép phải của chuỗi này KHÔNG THỂ lệch với con số khu Giá trị đang in — một bản phép tính
// thứ hai là chuyện sớm muộn lệch nhau, đúng lý lẽ đã ghi ở `asTrade`.
import { brokerCash, holdingsFromTrades, type Trade } from './holdings'

/**
 * Một lần số dư sổ của danh mục thay đổi.
 *
 * `external` là ranh giới quan trọng nhất của cả file: nó quyết định khoản đó có bị BÓC ra
 * khỏi phép tính lợi nhuận hay không.
 * - `true` — chuyển khoản nạp/rút. Tiền mới, không phải lãi. Phải bóc ra, không thì nạp
 *   thêm tiền sẽ trông như đầu tư giỏi.
 * - `false` — cổ tức tiền, phí lưu ký. Đó LÀ lãi/lỗ của danh mục. Bóc ra là xoá đúng phần
 *   lợi nhuận mà người dùng thật sự nhận được.
 */
export interface LedgerEntry {
  /** ISO date */
  date: string
  /** đồng; dương = vào danh mục */
  delta: number
  external: boolean
}

export interface NavPoint {
  /** ISO date — một phiên của sàn */
  date: string
  /** đồng — cổ phiếu theo giá đóng cửa phiên đó; mã thiếu giá tạm tính theo giá vốn */
  stockValue: number
  /** đồng — tiền chưa mua gì tại phiên đó */
  cash: number
  /** stockValue + cash */
  nav: number
  /** đồng — tiền từ NGOÀI vào (dương) / ra (âm), dồn từ sau phiên trước tới hết phiên này */
  flow: number
}

export interface NavSeriesResult {
  points: NavPoint[]
  /** Mã từng phải tạm tính theo giá vốn vì thiếu giá, sắp theo tên. */
  missingPrices: string[]
}

/** Đổi số dư sổ của MỘT tài khoản do một giao dịch — cùng bảng nhánh với view account_balances. */
function delta(
  t: { type: string; amount: number; to_amount: number | null; account_id: string; to_account_id: string | null },
  accountId: string,
): number {
  if (t.account_id === accountId) {
    if (t.type === 'income') return t.amount
    if (t.type === 'expense' || t.type === 'transfer') return -t.amount
  }
  if (t.type === 'transfer' && t.to_account_id === accountId) return t.to_amount ?? t.amount
  return 0
}

/**
 * Sổ giao dịch → `LedgerEntry[]`.
 *
 * Tham số khai theo HÌNH DẠNG, không `import type { TransactionRow }` — cùng lý do đã ghi
 * ở `asTrade`: file thuần trong thư mục này bị gói vào edge function, kéo `database.types`
 * vào là kéo cả cây kiểu của app.
 *
 * Chuyển khoản GIỮA hai tài khoản trong danh mục ra hai dòng triệt tiêu nhau và cả hai đều
 * `external: false`. Không phải tiền mới — chỉ là tiền đổi chỗ trong cùng danh mục; đánh
 * dấu `true` sẽ làm phép tính lợi nhuận bóc ra một dòng tiền không hề tồn tại.
 */
export function toLedger(
  transactions: {
    type: string
    amount: number
    to_amount: number | null
    account_id: string
    to_account_id: string | null
    occurred_on: string
  }[],
  accountIds: Set<string>,
): LedgerEntry[] {
  const out: LedgerEntry[] = []
  for (const t of transactions) {
    const caHaiChan =
      t.type === 'transfer' &&
      accountIds.has(t.account_id) &&
      t.to_account_id != null &&
      accountIds.has(t.to_account_id)

    for (const id of accountIds) {
      const d = delta(t, id)
      if (d === 0) continue
      out.push({
        date: t.occurred_on,
        delta: d,
        external: t.type === 'transfer' && !caHaiChan,
      })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export function navSeries(input: {
  /** Các phiên cần tính, TĂNG DẦN — lịch giao dịch của sàn, lấy từ chuỗi VN-Index. */
  sessions: string[]
  trades: Trade[]
  /** symbol → { ngày phiên → đồng/cổ }. Chỉ chứa phiên CÓ giá. */
  prices: Map<string, Map<string, number>>
  ledger: LedgerEntry[]
  /** đồng — `accounts.initial_balance`, tiền đã có trước khi dùng app. */
  openingBalance: number
}): NavSeriesResult {
  const { sessions, trades, prices, ledger, openingBalance } = input

  const lenhTheoNgay = trades.slice().sort((a, b) => a.tradedOn.localeCompare(b.tradedOn))
  const soTheoNgay = ledger.slice().sort((a, b) => a.date.localeCompare(b.date))

  // Giá GẦN NHẤT đã biết của từng mã, mang sang phiên sau khi phiên này không có bar.
  // Mã tạm ngừng giao dịch một phiên mà tụt giá trị về 0 là vẽ ra một cú lỗ không có thật.
  const giaGanNhat = new Map<string, number>()
  const thieuGia = new Set<string>()

  let iLenh = 0
  let iSo = 0
  let soDu = openingBalance

  const points: NavPoint[] = sessions.map((date) => {
    while (iLenh < lenhTheoNgay.length && lenhTheoNgay[iLenh].tradedOn <= date) iLenh++

    let flow = 0
    while (iSo < soTheoNgay.length && soTheoNgay[iSo].date <= date) {
      const e = soTheoNgay[iSo++]
      soDu += e.delta
      if (e.external) flow += e.delta
    }

    for (const [symbol, theoNgay] of prices) {
      const p = theoNgay.get(date)
      if (p != null) giaGanNhat.set(symbol, p)
    }

    const daMua = lenhTheoNgay.slice(0, iLenh)
    const { holdings } = holdingsFromTrades(daMua)

    let stockValue = 0
    for (const h of holdings) {
      const gia = giaGanNhat.get(h.symbol)
      if (gia == null) {
        // Cùng cách app đang xử lý thiếu giá ở `portfolioValue`: tạm tính theo giá vốn và
        // nói ra tên mã, thay vì âm thầm bỏ mã đó khỏi tổng.
        thieuGia.add(h.symbol)
        stockValue += h.costBasis
      } else {
        stockValue += h.quantity * gia
      }
    }

    const cash = brokerCash(soDu, daMua)
    return { date, stockValue, cash, nav: stockValue + cash, flow }
  })

  return { points, missingPrices: [...thieuGia].sort() }
}
