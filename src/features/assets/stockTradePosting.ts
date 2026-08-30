// Một lệnh cổ phiếu ghi vào sổ thành dòng tiền nào — thuần, test được, KHÔNG React.
//
// Cùng vai với `debts/debtPaymentPosting.ts`: đây là chỗ DUY NHẤT quyết định việc đó, và
// nó nằm dưới cả hai cửa ghi (form ghi lệnh, nút ghi bù) cùng cả hai repo (Supabase,
// demo). Để quyết định này ở tầng gọi thì mỗi cửa phải tự nhớ, và cửa nào quên thì số dư
// ngân hàng lặng lẽ cao hơn tiền thật — đúng cái sai mà cả đợt này sinh ra để sửa.
import type { NewTransaction } from '../../data/repo'
import type { StockTradeRow } from '../../types/database.types'

/** Phần của một lệnh quyết định dòng tiền. Nhận `Pick` để test khỏi phải dựng cả hàng. */
export type StockTradeCash = Pick<
  StockTradeRow,
  'kind' | 'symbol' | 'quantity' | 'price' | 'fee' | 'tax' | 'traded_on'
>

/** Tài khoản đầu tư kèm ví đã khai (hoặc chưa). */
export interface WalletAccount {
  id: string
  cash_account_id: string | null
}

/** Một lệnh còn thiếu dòng tiền, kèm sẵn giao dịch để ghi. */
export interface PendingTransfer {
  tradeId: string
  tx: NewTransaction
}

/**
 * Lệnh này thành chuyển khoản nào giữa ví và tài khoản chứng khoán.
 *
 * Trả `null` — tức KHÔNG ghi gì — ở bốn ca, và không ca nào là lỗi:
 * - **chưa khai ví**: hành vi cũ giữ nguyên y hệt, app không đoán hộ người dùng tiền đi
 *   ra từ đâu;
 * - **ví trỏ về chính tài khoản đó**: `assertTxShape` của demoRepo và CHECK của Postgres
 *   đều từ chối chuyển khoản về chính nó;
 * - **lệnh `adjust`**: gộp/tách cổ phiếu không có đồng nào đổi chủ;
 * - **tiền về ≤ 0 khi bán**: ghi một dòng 0 đồng không nói thêm được gì, còn ghi số âm là
 *   đổi chiều tiền một cách lặng lẽ.
 */
export function stockTradeCashFlow(
  trade: StockTradeCash,
  investAccountId: string,
  cashAccountId: string | null | undefined,
): NewTransaction | null {
  if (!cashAccountId || cashAccountId === investAccountId) return null
  if (trade.kind === 'adjust') return null

  const muaVao = trade.kind === 'buy'
  const gross = trade.quantity * trade.price
  const amount = muaVao ? gross + trade.fee : gross - trade.fee - trade.tax
  if (!(amount > 0)) return null

  return {
    type: 'transfer',
    amount,
    // Cùng VND cả hai đầu nên không có tỷ giá nào phải ghi. Ví khác loại tiền CỐ Ý không
    // được hỗ trợ: nó là chuyển khoản xuyên tệ, cần tỷ giá tại từng lệnh.
    to_amount: null,
    category_id: null,
    account_id: muaVao ? cashAccountId : investAccountId,
    to_account_id: muaVao ? investAccountId : cashAccountId,
    occurred_on: trade.traded_on,
    note: `${muaVao ? 'Mua' : 'Bán'} ${trade.quantity} ${trade.symbol}`,
  }
}

/**
 * Những lệnh đáng có dòng tiền mà chưa có.
 *
 * CÙNG MỘT hàm trả lời cả "thiếu bao nhiêu" lẫn "ghi những gì", nên dải cảnh báo và nút
 * ghi bù không thể nói hai số khác nhau. Lệnh `adjust` và lệnh bán có tiền về ≤ 0 tự rơi
 * ra vì `stockTradeCashFlow` trả `null` — chúng vốn không thiếu gì.
 */
export function missingTradeTransfers(
  accounts: WalletAccount[],
  trades: StockTradeRow[],
  daCoDongTien: Set<string>,
): PendingTransfer[] {
  const viTheoTaiKhoan = new Map(accounts.map((a) => [a.id, a.cash_account_id]))
  const ra: PendingTransfer[] = []
  for (const t of trades) {
    if (daCoDongTien.has(t.id)) continue
    if (!viTheoTaiKhoan.has(t.account_id)) continue
    const tx = stockTradeCashFlow(t, t.account_id, viTheoTaiKhoan.get(t.account_id))
    if (tx) ra.push({ tradeId: t.id, tx })
  }
  return ra
}
