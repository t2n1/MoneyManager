// Đường đi của danh mục đầu tư theo thời gian — thuần, không React, test được.
//
// Hai đường, một mốc thời gian:
//   giá trị thị trường  — từ `account_valuations` (cron ghi mỗi phiên)
//   tiền đã bỏ vào      — số dư sổ (nạp − rút) tại đúng ngày đó, dựng lại từ sổ giao dịch
//
// Vì sao đường thứ hai là SỐ DƯ SỔ chứ không phải "chỉ các lần chuyển khoản từ ví ngoài"
// (định nghĩa mà ô Hiệu quả đầu tư dùng cho XIRR): số dư sổ là mốc mà `assetBreakdown`
// dùng để ra "Lãi/lỗ đầu tư (gồm đã bán)" ở khối xanh trang Tài sản. Chọn nó thì khoảng
// cách hai đường ở MÉP PHẢI bằng đúng con số ấy — biểu đồ tự đối chiếu được với một số
// đang hiện trên cùng trang. Chọn định nghĩa kia thì khoảng cách không bằng con số nào
// người dùng nhìn thấy ở đâu cả.
//
// Cộng dồn giao dịch phải KHỚP TỪNG DÒNG với view `account_balances` (migration 0016) —
// lệch một nhánh là đường "tiền đã bỏ vào" ở mép phải không trùng số dư sổ mà mọi màn
// khác đang in.
import type { AccountValuationRow, TransactionRow } from '../../types/database.types'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'

/** Lịch sử đầu tư hiếm khi dài hơn 10 năm với app ghi tay — đủ để XIRR chuẩn. */
export const LOOKBACK_YEARS = 10

/**
 * Khoảng giao dịch mà MỌI khu đầu tư đọc. Một hàm chung chứ không hai biểu thức giống
 * nhau: `useRangeTransactions` khoá cache theo đúng chuỗi start/end, nên hai khu nằm cạnh
 * nhau trên cùng một tab mà lệch một ngày là hai lượt đọc cả sổ thay vì một.
 */
export function investTxRange(todayISO: string): { start: string; end: string } {
  const year = Number(todayISO.slice(0, 4))
  return { start: `${year - LOOKBACK_YEARS}-01-01`, end: `${year + 1}-01-01` }
}

export interface InvestHistoryAccount {
  id: string
  currency: CurrencyCode
  /** `accounts.initial_balance` — tiền đã bỏ vào TRƯỚC khi dùng app. */
  initialBalance: number
}

export interface InvestHistoryPoint {
  /** ISO date — một ngày có ít nhất một tài khoản được định giá. */
  date: string
  /** base minor: tổng giá trị thị trường của những tài khoản ĐÃ có định giá tới ngày này. */
  value: number
  /** base minor: tổng số dư sổ của ĐÚNG những tài khoản đó tại ngày này. */
  cost: number
}

export interface InvestHistoryResult {
  points: InvestHistoryPoint[]
  /** Có tài khoản bị bỏ khỏi ít nhất một mốc vì thiếu tỷ giá → hai đường thiếu một phần. */
  hasMissingRate: boolean
}

/** Đổi số dư sổ của một tài khoản do MỘT giao dịch — cùng bảng nhánh với view account_balances. */
function delta(t: TransactionRow, accountId: string): number {
  if (t.account_id === accountId) {
    if (t.type === 'income') return t.amount
    if (t.type === 'expense' || t.type === 'transfer') return -t.amount
  }
  if (t.type === 'transfer' && t.to_account_id === accountId) return t.to_amount ?? t.amount
  return 0
}

/**
 * Ngày mà một tài khoản CHƯA có định giá nào thì tài khoản đó bị loại khỏi cả hai đường
 * tại ngày đó, chứ không đóng góp 0 vào đường giá trị.
 *
 * Đóng góp 0 sẽ vẽ ra một cú lỗ khổng lồ rồi biến mất: tiền nạp vào tài khoản đã nằm
 * trong đường "tiền đã bỏ vào" từ ngày chuyển khoản, còn giá trị thị trường thì phải đợi
 * lượt cron đầu tiên mới có. Khoảng giữa hai mốc đó là một khoảng trắng của DỮ LIỆU, và
 * vẽ nó thành khoảng cách giữa hai đường là biến chỗ chưa biết thành một khoản lỗ.
 */
export function investHistory(input: {
  accounts: InvestHistoryAccount[]
  valuations: Pick<AccountValuationRow, 'account_id' | 'valued_on' | 'market_value'>[]
  transactions: TransactionRow[]
  base: CurrencyCode
  rates: Rates
}): InvestHistoryResult {
  const { accounts, valuations, transactions, base, rates } = input
  const ids = new Set(accounts.map((a) => a.id))

  // Định giá của riêng các tài khoản đang xét, xếp theo ngày tăng dần.
  const theoTk = new Map<string, { valuedOn: string; value: number }[]>()
  for (const v of valuations) {
    if (!ids.has(v.account_id)) continue
    const list = theoTk.get(v.account_id) ?? []
    list.push({ valuedOn: v.valued_on, value: v.market_value })
    theoTk.set(v.account_id, list)
  }
  for (const list of theoTk.values()) list.sort((a, b) => a.valuedOn.localeCompare(b.valuedOn))

  const dates = [...new Set([...theoTk.values()].flatMap((l) => l.map((v) => v.valuedOn)))].sort()

  // Giao dịch của riêng các tài khoản đang xét, xếp theo ngày tăng dần — để cộng dồn một
  // lượt duy nhất qua các mốc thay vì quét lại cả sổ ở mỗi mốc.
  const soGiaoDich = transactions
    .filter((t) => ids.has(t.account_id) || (t.to_account_id != null && ids.has(t.to_account_id)))
    .slice()
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))

  const soDu = new Map(accounts.map((a) => [a.id, a.initialBalance]))
  const viTriDinhGia = new Map(accounts.map((a) => [a.id, -1]))
  let iGiaoDich = 0
  let hasMissingRate = false

  const points: InvestHistoryPoint[] = dates.map((date) => {
    while (iGiaoDich < soGiaoDich.length && soGiaoDich[iGiaoDich].occurred_on <= date) {
      const t = soGiaoDich[iGiaoDich++]
      for (const a of accounts) {
        const d = delta(t, a.id)
        if (d !== 0) soDu.set(a.id, (soDu.get(a.id) ?? 0) + d)
      }
    }

    let value = 0
    let cost = 0
    for (const a of accounts) {
      const list = theoTk.get(a.id)
      if (!list) continue
      let i = viTriDinhGia.get(a.id) ?? -1
      while (i + 1 < list.length && list[i + 1].valuedOn <= date) i++
      viTriDinhGia.set(a.id, i)
      if (i < 0) continue // chưa có định giá nào tới ngày này → tài khoản chưa lên biểu đồ

      const v = convertToBase(list[i].value, a.currency, base, rates)
      const c = convertToBase(soDu.get(a.id) ?? 0, a.currency, base, rates)
      if (v === null || c === null) {
        hasMissingRate = true
        continue
      }
      value += v
      cost += c
    }
    return { date, value, cost }
  })

  return { points, hasMissingRate }
}
