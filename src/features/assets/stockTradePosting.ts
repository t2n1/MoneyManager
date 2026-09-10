// Một lệnh cổ phiếu ghi vào sổ thành dòng tiền nào — thuần, test được, KHÔNG React.
//
// Cùng vai với `debts/debtPaymentPosting.ts`: đây là chỗ DUY NHẤT quyết định việc đó, và
// nó nằm dưới cả hai cửa ghi (form ghi lệnh, nút ghi bù) cùng cả hai repo (Supabase,
// demo). Để quyết định này ở tầng gọi thì mỗi cửa phải tự nhớ, và cửa nào quên thì số dư
// ngân hàng lặng lẽ cao hơn tiền thật — đúng cái sai mà cả đợt này sinh ra để sửa.
import type { StockTradeRow } from '../../types/database.types'

/**
 * Đúng những cột mà một lệnh quyết định — hẹp hơn `NewTransaction` một cách CỐ Ý.
 *
 * `NewTransaction` còn mang `tag_ids` (bảng liên kết riêng, không phải cột) và
 * `recurring_rule_id`; đưa nguyên nó vào `insert` của PostgREST là bị chốt
 * `RejectExcessProperties` chặn. Hẹp lại cũng nói thẳng ra rằng dòng tiền này không mang
 * nhãn, không thuộc quy tắc định kỳ nào.
 */
export interface StockTradeTransfer {
  type: 'transfer'
  amount: number
  to_amount: null
  category_id: null
  account_id: string
  to_account_id: string
  occurred_on: string
  note: string
}

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
  tx: StockTradeTransfer
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
): StockTradeTransfer | null {
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

/**
 * Đúng những cột cần để nhận ra một dòng nạp/rút tự ghi. Khai theo HÌNH DẠNG, cùng lý do
 * đã ghi ở `StockTradeCash`.
 */
export interface FundingTx {
  type: string
  amount: number
  to_amount: number | null
  account_id: string
  to_account_id: string | null
  /** `undefined` cũng được: hàng từ backup cũ chưa có cột này (migration 0054). */
  stock_trade_id?: string | null
}

/** Tiền nạp/rút mà NGƯỜI DÙNG tự ghi giữa tài khoản đầu tư và ví của nó. */
export interface HandWrittenFunding {
  /** Số dòng. 0 = sổ chỉ có dòng do lệnh sinh ra. */
  count: number
  /** đồng — ròng vào tài khoản đầu tư (nạp − rút). */
  net: number
}

/**
 * Sổ đã có bộ nạp/rút tự ghi nào chưa?
 *
 * Đây là cái mà "Ghi bù" KHÔNG thấy, và là lý do nút đó từng nhân đôi 208 triệu tiền nạp
 * trong sổ thật (10/09/2026). `thieuDongTien` dò dòng đã có bằng cột
 * `transactions.stock_trade_id`; dòng người dùng tự ghi không mang cột đó, nên nút coi
 * như chưa có gì và ghi thêm một bộ nữa. Tài khoản đầu tư nhận tiền hai lần, và phần thừa
 * nổi lên ở ô "Tiền chưa mua" — trông y như tiền thật đang nằm ở công ty chứng khoán.
 *
 * KHÔNG dò trùng theo (ngày, số tiền): bộ tự ghi là một lần chuyển tiền THẬT gộp nhiều
 * lệnh, ngày và số tiền đều không khớp lệnh nào (sổ thật: nạp 114.904.969 cho hai lệnh
 * tổng 116.089.500). Dò kiểu đó vừa bỏ sót vừa dễ khớp nhầm. Cái chắc chắn đúng là dấu
 * hiệu CẤU TRÚC: một chuyển khoản giữa tài khoản đầu tư và đúng cái ví nó đã khai mà
 * không do lệnh nào sinh ra thì chỉ có thể là người dùng tự ghi.
 *
 * Đếm theo GIAO DỊCH chứ không theo từng tài khoản: hai tài khoản chứng khoán trỏ chung
 * một ví là chuyện bình thường, mà một dòng chuyển khoản chỉ thuộc đúng một cặp — cộng
 * theo tài khoản là đếm hai lần đúng cái lỗi file này sinh ra để chặn.
 */
export function handWrittenFunding(
  accounts: WalletAccount[],
  transactions: FundingTx[],
): HandWrittenFunding {
  const capVi = new Map<string, string>()
  for (const a of accounts) {
    if (a.cash_account_id && a.cash_account_id !== a.id) capVi.set(a.id, a.cash_account_id)
  }
  let count = 0
  let net = 0
  for (const t of transactions) {
    if (t.type !== 'transfer' || t.stock_trade_id || !t.to_account_id) continue
    // Ví → đầu tư: nạp. Số cộng vào là số TỚI NƠI (`to_amount`), cùng nhánh mà view
    // `account_balances` dùng cho chân nhận.
    if (capVi.get(t.to_account_id) === t.account_id) {
      count++
      net += t.to_amount ?? t.amount
    } else if (capVi.get(t.account_id) === t.to_account_id) {
      count++
      net -= t.amount
    }
  }
  return { count, net }
}
