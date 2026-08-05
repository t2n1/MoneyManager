// Đọc Postgres và xếp dữ liệu vào đúng ô cho `_holdings.js`.
//
// Ràng buộc: KHÔNG tự tính gì cả — giống loadInput.ts của push-notify. Nếu bạn thấy
// mình đang viết phép cộng trừ tiền ở file này thì phép đó thuộc về src/.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

// deno-lint-ignore no-explicit-any
type Row = any

/** Một tài khoản đủ điều kiện tự chạy, kèm sổ lệnh của nó. */
export interface PortfolioAccount {
  userId: string
  accountId: string
  /** số dư sổ (minor units VND) từ view account_balances */
  balance: number
  /** shape khớp `Trade` của holdings.ts */
  trades: {
    symbol: string
    kind: 'buy' | 'sell' | 'adjust'
    tradedOn: string
    quantity: number
    price: number
    fee: number
    tax: number
  }[]
}

/** Đọc hết một bảng, phân trang, thứ tự đơn trị (xem src/data/paging.ts). */
async function readAll(sb: SupabaseClient, table: string, orderBy = 'id'): Promise<Row[]> {
  const PAGE = 1_000
  const out: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select('*')
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

/**
 * Tài khoản đủ điều kiện tự chạy: loại 'investment', tiền VND, chưa lưu trữ, và có ít
 * nhất một dòng sổ lệnh. Không có nút bật/tắt — ghi lệnh vào là chạy (quyết định 5).
 */
export async function loadPortfolioAccounts(sb: SupabaseClient): Promise<PortfolioAccount[]> {
  const [balances, trades] = await Promise.all([
    readAll(sb, 'account_balances'),
    readAll(sb, 'stock_trades'),
  ])

  const byAccount = new Map<string, PortfolioAccount['trades']>()
  for (const t of trades) {
    const list = byAccount.get(t.account_id) ?? []
    list.push({
      symbol: t.symbol,
      kind: t.kind,
      tradedOn: t.traded_on,
      quantity: Number(t.quantity),
      price: Number(t.price),
      fee: Number(t.fee),
      tax: Number(t.tax),
    })
    byAccount.set(t.account_id, list)
  }

  const out: PortfolioAccount[] = []
  for (const b of balances) {
    if (b.type !== 'investment' || b.currency !== 'VND' || b.is_archived) continue
    const list = byAccount.get(b.id)
    if (!list || list.length === 0) continue
    out.push({
      userId: b.user_id,
      accountId: b.id,
      balance: Number(b.balance),
      trades: list,
    })
  }
  return out
}
