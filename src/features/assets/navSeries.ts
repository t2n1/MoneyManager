// Đường đi của danh mục cổ phiếu VN theo TỪNG PHIÊN — thuần, không React, test được.
//
// Vì sao không dùng `investHistory.ts` (đã có sẵn): file đó chạy trên `account_valuations`,
// tức ảnh chụp mà cron ghi. Cron ấy mới bật 05/08/2026 nên chỉ có ~22 phiên — không đủ để
// đứng cạnh VN-Index. File này DỰNG LẠI quá khứ từ sổ lệnh + giá đóng cửa từng phiên, nên
// đường chạy từ lệnh mua đầu tiên. Hai file trả lời hai câu khác nhau và cả hai đều đúng:
// `investHistory` gộp mọi tài khoản đầu tư (cả quỹ JPY) cho trang Tài sản; file này chỉ cổ
// phiếu VN, cho trang Đầu tư.
//
// HAI THANG GIÁ, và trộn chúng là cái bẫy đắt nhất ở file này. `stock_price_history.close`
// là giá ĐÃ ĐIỀU CHỈNH cổ tức/chia tách (dchart.ts và comment cột đều nói thẳng): mọi phiên
// cũ bị chia lùi theo những lần chia tách SAU đó. Còn `stock_trades` ghi GIÁ THẬT đã trả và
// SỐ CỔ THẬT lúc ấy, rồi cổ phiếu thưởng vào sổ thành một lệnh `adjust` riêng. Nên cùng một
// đợt chia thưởng được đếm hai lần: một lần nằm sẵn trong giá, một lần là số cổ thêm vào.
//
// Hệ quả nếu `flow` chỉ lấy tiền mặt từ sổ: một lệnh mua bơm vào theo giá THẬT nhưng cổ
// phiếu vào `nav` theo giá ĐÃ ĐIỀU CHỈNH (thấp hơn), TWR đọc khoảng chênh thành lỗ ngay
// trong phiên mua. Sổ thật (10/09/2026) có hơn hai mươi lệnh mua, và khu Hiệu quả in
// "Tổng lợi nhuận −77,5%" cho một danh mục đang lời +38%. Không màn nào báo, không test
// nào bắt — hai con số đều là số thật, chỉ khác thang.
//
// Chữa bằng cách đo phần lệnh dời đi BẰNG CHÍNH GIÁ CỦA CHUỖI: định giá danh mục trước và
// sau lệnh bằng giá cùng một phiên, hiệu số đó vào `flow`, rồi trừ đi tiền mặt lệnh ăn
// (phần ấy đã nằm trong `cash`). Đợt chia thưởng vì thế cũng tự bị bóc: số cổ tăng mà giá
// không rơi, nên chênh lệch rơi hết vào `flow` thay vì thành lãi.
//
// KHÔNG chép lại phép cộng dồn giá vốn. `holdingsFromTrades` và `brokerCash` được gọi lại
// trên từng tiền tố sổ lệnh. Chậm hơn một chút (2.500 phiên × vài chục lệnh) nhưng đổi lại
// mép phải của chuỗi này KHÔNG THỂ lệch với con số khu Giá trị đang in — một bản phép tính
// thứ hai là chuyện sớm muộn lệch nhau, đúng lý lẽ đã ghi ở `asTrade`.
//
// MỘT chỗ cố ý khác `buildPortfolio`, và nói ra để người sau khỏi tưởng là lỗi: file này
// ĐỔ CHUNG sổ lệnh của mọi tài khoản vào một lượt `holdingsFromTrades`, còn `portfolio.ts`
// tính riêng từng tài khoản rồi mới gộp (lý lẽ ở đầu file đó: bán ở tài khoản A phải trừ
// theo giá vốn của A). Khác biệt CHỈ hiện ra ở `costBasis`, mà `costBasis` ở đây chỉ dùng
// làm số tạm khi một mã thiếu giá — còn KHỐI LƯỢNG, thứ vẽ ra cả biểu đồ, thì hai cách cho
// y hệt nhau. Nên `stockValue` khi có giá và `cash` luôn khớp `buildPortfolio` (có test đối
// chiếu). Điều kiện để lệch: cùng một mã nằm ở hai tài khoản, ĐÃ bán một phần, VÀ phiên đó
// thiếu giá — lúc đó con số đã là số tạm và đã có tên mã trong `missingPrices`.
import { brokerCash, holdingsFromTrades, type Holding, type Trade } from './holdings'

/**
 * Tiền mặt một lệnh ăn vào (dương) hoặc nhả ra (âm) — ĐÚNG phép mà `brokerCash` trừ đi,
 * viết lại ở đây chỉ để lấy phần của MỘT lệnh thay vì của cả sổ.
 */
function tienMatLenhAn(t: Trade): number {
  if (t.kind === 'buy') return t.quantity * t.price + t.fee
  if (t.kind === 'sell') return -(t.quantity * t.price - t.fee - t.tax)
  return 0
}

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
  /**
   * đồng — phần `nav` đổi mà KHÔNG phải lợi nhuận, dồn từ sau phiên trước tới hết phiên
   * này. Hai nguồn: tiền từ ngoài nạp vào / rút ra, và giá trị cổ phiếu mà lệnh trong
   * phiên dời vào/ra danh mục.
   */
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
 *
 * KHOẢN BÙ SỐ DƯ (`exclude_from_stats`) cũng là `external`, dù nó là thu/chi. Nó không
 * phải lãi hay lỗ — nó là câu "sổ ghi sai, đây là số thật", và quy một lời thú nhận sổ
 * sách thành lợi suất là đổ lỗi ghi chép lên thành tích đầu tư. Đã xảy ra trên sổ thật
 * (10/09/2026): một khoản bù 9.059.506 đ — phần cổ tức đã dùng mua cổ phiếu mà mô hình
 * "mỗi lệnh mua được nạp tiền mới từ ví" không diễn tả nổi — làm khu Hiệu quả in ngay
 * "1 tuần −2,9%" cho một phiên chẳng có gì xảy ra.
 *
 * Đánh đổi đã cân: phí lưu ký quên ghi rồi bù bằng đối chiếu cũng thôi bị tính là lỗ.
 * Chấp nhận được — phí ghi đúng chỗ (một dòng chi bình thường) thì vẫn vào lỗ như cũ,
 * còn khoản bù vốn đã mang cờ "không tính vào Thu/Chi" ở mọi màn khác.
 */
export function toLedger(
  transactions: {
    type: string
    amount: number
    to_amount: number | null
    account_id: string
    to_account_id: string | null
    occurred_on: string
    /** Khoản bù của `ReconcileSheet` mang `true` — xem lý lẽ ở chú thích hàm. */
    exclude_from_stats?: boolean | null
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
        // `caHaiChan` thắng trước: tiền đổi chỗ trong cùng danh mục không bao giờ là
        // tiền ngoài, dù dòng đó có cờ gì.
        external: caHaiChan
          ? false
          : t.type === 'transfer' || t.exclude_from_stats === true,
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
  /** Danh mục ở phiên TRƯỚC — để đo phần `nav` mà lệnh trong phiên này dời đi. */
  let giuTruoc: Holding[] = []

  const points: NavPoint[] = sessions.map((date) => {
    for (const [symbol, theoNgay] of prices) {
      const p = theoNgay.get(date)
      if (p != null) giaGanNhat.set(symbol, p)
    }

    let tienLenhAn = 0
    while (iLenh < lenhTheoNgay.length && lenhTheoNgay[iLenh].tradedOn <= date) {
      tienLenhAn += tienMatLenhAn(lenhTheoNgay[iLenh++])
    }

    let flow = 0
    while (iSo < soTheoNgay.length && soTheoNgay[iSo].date <= date) {
      const e = soTheoNgay[iSo++]
      soDu += e.delta
      if (e.external) flow += e.delta
    }

    const daMua = lenhTheoNgay.slice(0, iLenh)
    const { holdings } = holdingsFromTrades(daMua)

    // Cùng cách app đang xử lý thiếu giá ở `portfolioValue`: tạm tính theo giá vốn và
    // nói ra tên mã, thay vì âm thầm bỏ mã đó khỏi tổng.
    const dinhGia = (hs: Holding[]) => {
      let tong = 0
      for (const h of hs) {
        const gia = giaGanNhat.get(h.symbol)
        if (gia == null) {
          thieuGia.add(h.symbol)
          tong += h.costBasis
        } else {
          tong += h.quantity * gia
        }
      }
      return tong
    }

    // Định giá danh mục CŨ bằng giá HÔM NAY: hiệu số hai bên là đúng phần mà lệnh dời
    // đi, đã bóc sạch biến động giá trong phiên.
    const stockValue = dinhGia(holdings)
    flow += stockValue - dinhGia(giuTruoc) - tienLenhAn
    giuTruoc = holdings

    const cash = brokerCash(soDu, daMua)
    return { date, stockValue, cash, nav: stockValue + cash, flow }
  })

  return { points, missingPrices: [...thieuGia].sort() }
}
