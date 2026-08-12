// Đọc Postgres và xếp dữ liệu vào đúng ô cho `_funds.js`.
//
// Ràng buộc: KHÔNG tự tính gì cả — giống loadInput.ts của stock-refresh và của
// push-notify. Nếu bạn thấy mình đang viết phép cộng trừ tiền hay ngày ở file này thì
// phép đó thuộc về src/features/assets/fundHoldings.ts.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { FundRef } from './navs.ts'

// deno-lint-ignore no-explicit-any
type Row = any

/** Một tài khoản đủ điều kiện tự chạy, kèm sổ lệnh quỹ của nó. */
export interface FundAccount {
  userId: string
  accountId: string
  /** shape khớp `FundTrade` của fundHoldings.ts */
  trades: {
    assocFundCd: string
    kind: 'buy' | 'sell' | 'adjust'
    /** 約定日 */
    tradedOn: string
    units: number
    nav: number
    amount: number
  }[]
  /**
   * true nếu tài khoản này CŨNG có dòng trong `stock_trades`. Không phải trường hợp thật
   * hiện nay, nhưng cộng 口数 của quỹ với số cổ phiếu là trộn hai hệ đơn vị — im lặng
   * cộng sai còn tệ hơn bỏ qua, nên index.ts bỏ qua tài khoản này với lý do riêng.
   */
  coCaSoLenhCoPhieu: boolean
}

/** Đọc hết một bảng, phân trang, thứ tự đơn trị (xem src/data/paging.ts). */
async function readAll(sb: SupabaseClient, table: string, orderBy: string): Promise<Row[]> {
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
 * Cả danh bạ quỹ, không chỉ quỹ đang giữ.
 *
 * Vì sao cả danh bạ: (1) quỹ vừa được thêm có giá ngay, không đợi lượt cron kế tiếp;
 * (2) chế độ lấp lịch sử cần NAV của cả những quỹ đã bán hết từ lâu — sáu trong tám quỹ
 * của chủ app thuộc loại đó.
 */
export async function loadFundRegistry(sb: SupabaseClient): Promise<FundRef[]> {
  const rows = await readAll(sb, 'funds', 'assoc_fund_cd')
  return rows
    .filter((r) => typeof r.assoc_fund_cd === 'string' && typeof r.isin_cd === 'string')
    .map((r) => ({ assocFundCd: r.assoc_fund_cd as string, isinCd: r.isin_cd as string }))
}

/**
 * Mã quỹ đã từng xuất hiện trong sổ lệnh — quyết định THỨ TỰ ưu tiên gọi (xem
 * buildFundFetchOrder), không quyết định quỹ nào được hút (đó là loadFundRegistry).
 * Không lọc theo tài khoản đủ điều kiện, không phân biệt còn giữ hay đã bán sạch.
 */
export async function loadHeldFundCodes(sb: SupabaseClient): Promise<string[]> {
  const rows = await readAll(sb, 'fund_trades', 'id')
  const ma = new Set<string>()
  for (const r of rows) {
    if (typeof r.assoc_fund_cd === 'string' && r.assoc_fund_cd.trim())
      ma.add(r.assoc_fund_cd.trim())
  }
  return [...ma].sort()
}

/**
 * Tài khoản đủ điều kiện tự chạy: loại 'investment', tiền **JPY**, chưa lưu trữ, và có ít
 * nhất một dòng sổ lệnh quỹ. Không có nút bật/tắt — ghi lệnh vào là chạy.
 *
 * KHÁC `loadPortfolioAccounts` của stock-refresh ở đúng hai chỗ: lọc `JPY` thay vì `VND`,
 * và KHÔNG đọc `balance` — mô hình quỹ không có tiền mặt nên số dư sổ không tham gia phép
 * tính nào (xem fundHoldings.ts, lý do 3).
 */
export async function loadFundAccounts(sb: SupabaseClient): Promise<FundAccount[]> {
  const [balances, fundTrades, stockTrades] = await Promise.all([
    readAll(sb, 'account_balances', 'id'),
    readAll(sb, 'fund_trades', 'id'),
    readAll(sb, 'stock_trades', 'id'),
  ])

  const theoTaiKhoan = new Map<string, FundAccount['trades']>()
  for (const t of fundTrades) {
    const list = theoTaiKhoan.get(t.account_id) ?? []
    list.push({
      assocFundCd: t.assoc_fund_cd,
      kind: t.kind,
      tradedOn: t.traded_on,
      units: Number(t.units),
      nav: Number(t.nav),
      amount: Number(t.amount),
    })
    theoTaiKhoan.set(t.account_id, list)
  }

  const coCoPhieu = new Set<string>(stockTrades.map((t) => t.account_id as string))

  const out: FundAccount[] = []
  for (const b of balances) {
    if (b.type !== 'investment' || b.currency !== 'JPY' || b.is_archived) continue
    const list = theoTaiKhoan.get(b.id)
    if (!list || list.length === 0) continue
    out.push({
      userId: b.user_id,
      accountId: b.id,
      trades: list,
      coCaSoLenhCoPhieu: coCoPhieu.has(b.id),
    })
  }
  return out
}
