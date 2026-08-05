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

/**
 * Mọi mã đã từng xuất hiện trong sổ lệnh — không lọc theo tài khoản "đủ điều kiện tự
 * chạy" (khác `loadPortfolioAccounts`), không phân biệt còn giữ hay đã bán sạch.
 *
 * ĐỔI VAI TRÒ (2026-08-06): việc 1 giờ hút giá cho CẢ sàn HOSE (HOSE_SYMBOLS), không
 * chỉ mã trong sổ lệnh — một mã vừa mua hôm nay nhờ vậy có giá ngay, không phải đợi
 * lượt cron kế tiếp. Hàm này KHÔNG còn quyết định mã nào ĐƯỢC hút (đó là việc của
 * HOSE_SYMBOLS) — nó chỉ còn quyết định ƯU TIÊN gọi Yahoo trước cho mã nào
 * (buildFetchOrder trong prices.ts): 403 mã là hơn 20 lô gọi tuần tự, nếu Yahoo giới
 * hạn tốc độ giữa chừng thì lô gọi SAU là lô hỏng, nên mã người dùng thực sự đang giữ
 * phải được xếp trước. Đừng xoá hàm này chỉ vì thấy universe đã có sẵn mọi mã — nó vẫn
 * còn việc, chỉ là việc khác trước.
 */
export async function loadTradedSymbols(sb: SupabaseClient): Promise<string[]> {
  const rows = await readAll(sb, 'stock_trades')
  const symbols = new Set<string>()
  for (const r of rows) {
    if (typeof r.symbol === 'string' && r.symbol.trim()) symbols.add(r.symbol.trim().toUpperCase())
  }
  return [...symbols].sort()
}
