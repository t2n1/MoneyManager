// Dựng lại `NotificationInput` từ Postgres — bản chạy trên server của những gì
// `src/features/notifications/useNotifications.ts` làm bằng các hook TanStack Query.
//
// Ràng buộc: KHÔNG tự tính gì cả. Mọi phép tính đi qua hàm thuần trong `_rules.js`
// (gói từ src/). Ở đây chỉ có đọc bảng và xếp dữ liệu vào đúng ô — nếu bạn thấy mình
// đang viết phép cộng trừ tiền hay ngày ở file này thì phép đó thuộc về src/.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  addDaysISO,
  addMonths,
  buildBudgetReport,
  buildLifetimeInput,
  buildTagBudgetReport,
  carryFromPreviousMonth,
  earliestNeededDate,
  fetchAllPages,
  getMonthRange,
  missingRateCurrencies,
  monthKeyForDate,
  monthKeyString,
  PAGE_SIZE,
  RECENT_TXS_DAYS,
  splitTxWindows,
  // deno-lint-ignore no-explicit-any
} from './_rules.js'

// deno-lint-ignore no-explicit-any
type Row = any

/** Kết quả đọc dữ liệu: hoặc đủ để chạy bộ luật, hoặc một lý do để bỏ lượt này. */
export type LoadResult =
  | { ok: true; input: Row }
  | { ok: false; skip: string }

/**
 * Định dạng tiền cho thông báo đẩy.
 *
 * KHÔNG dùng `formatMoney` của app: hàm đó đọc trạng thái chế độ riêng tư toàn cục
 * (mục J của spec) nên không tồn tại ngoài trình duyệt. Bản này luôn hiện số thật —
 * chế độ riêng tư là để che màn hình trước mặt người khác, còn thông báo đẩy thì chính
 * chủ mới mở khoá máy để đọc.
 */
function serverFormatMoney(minor: number, currency: string): string {
  const zeroDecimal = currency === 'JPY' || currency === 'VND'
  const value = zeroDecimal ? minor : minor / 100
  return `${value.toLocaleString('vi-VN', {
    maximumFractionDigits: zeroDecimal ? 0 : 2,
  })} ${currency === 'JPY' ? '¥' : currency === 'VND' ? '₫' : currency}`
}

/** Đọc hết một bảng của user, có phân trang và thứ tự ổn định. */
function readAll(sb: SupabaseClient, table: string, userId: string, orderBy = 'id') {
  return fetchAllPages<Row>((from: number, to: number) =>
    sb
      .from(table)
      .select('*')
      .eq('user_id', userId)
      // Thứ tự đơn trị là bắt buộc khi phân trang: thiếu nó thì hai trang liền nhau có
      // thể trả cùng một dòng hai lần và bỏ sót dòng khác (xem src/data/paging.ts).
      .order(orderBy, { ascending: true })
      .range(from, to),
  )
}

/** Giao dịch trong một khoảng ngày, phân trang. */
function readTxRange(sb: SupabaseClient, userId: string, startISO: string, endISO: string) {
  return fetchAllPages<Row>((from: number, to: number) =>
    sb
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .gte('occurred_on', startISO)
      .lte('occurred_on', endISO)
      .order('occurred_on', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )
}

/**
 * @param todayISO Hôm nay theo LỊCH ĐỊA PHƯƠNG của user (không phải ngày UTC).
 *   Người ở Nhật lúc 8 giờ sáng ngày 5 thì UTC còn là ngày 4 — lấy ngày UTC là mọi
 *   luật "tháng này", "quá hạn mấy ngày" lệch một ngày mỗi sáng.
 */
export async function loadNotificationInput(
  sb: SupabaseClient,
  profile: Row,
  todayISO: string,
): Promise<LoadResult> {
  const userId = profile.user_id
  const base = profile.base_currency
  const monthStartDay = profile.month_start_day

  const [accounts, categories, debts, recurringRules, savingsGoals, plannedExpenses, networthSnapshots] =
    await Promise.all([
      // account_balances là VIEW (không có cột id để sắp) — sắp theo name cho ổn định.
      fetchAllPages<Row>((from: number, to: number) =>
        sb
          .from('account_balances')
          .select('*')
          .eq('user_id', userId)
          .order('name', { ascending: true })
          .range(from, to),
      ),
      readAll(sb, 'categories', userId),
      readAll(sb, 'debts', userId),
      readAll(sb, 'recurring_rules', userId),
      readAll(sb, 'savings_goals', userId),
      readAll(sb, 'planned_expenses', userId),
      readAll(sb, 'networth_snapshots', userId),
    ])

  // --- Tỷ giá ---
  // Không gọi API tỷ giá ngoài từ đây: app đã tích `fx_history` mỗi lần người dùng mở
  // app (migration 0029 dựng bảng này chính cho lúc này). Dùng dòng mới nhất.
  const { data: fxRows, error: fxError } = await sb
    .from('fx_history')
    .select('*')
    .eq('user_id', userId)
    .eq('base', base)
    .order('on_date', { ascending: false })
    .limit(1)
  if (fxError) throw new Error(`Đọc fx_history lỗi: ${fxError.message}`)
  const rates: Record<string, number> = fxRows?.[0]?.rates ?? {}

  // Có tài khoản khác loại tiền gốc mà KHÔNG có tỷ giá → bỏ lượt này. Quyết định là hàm
  // thuần `missingRateCurrencies` (src/features/notifications/pushInputPlan.ts) vì đây là
  // chỗ sai âm thầm: buildBudgetReport chỉ bỏ qua giao dịch không quy đổi được rồi bật
  // cờ, nên push vẫn gửi, chỉ là số thiếu.
  const thieuTyGia = missingRateCurrencies(
    accounts.map((a: Row) => a.currency as string),
    base,
    rates,
  )
  if (thieuTyGia.length > 0)
    return { ok: false, skip: `chưa có tỷ giá cho ${thieuTyGia.join(', ')}` }

  // --- Ngân sách ---
  // Trên trình duyệt phần này là useBudgetReport; hai hàm thuần bên dưới mới là ruột
  // của nó, và đây gọi thẳng chúng để chuông với push không bao giờ nói lệch nhau.
  const thisMonth = monthKeyForDate(todayISO, monthStartDay)
  const prevMonth = addMonths(thisMonth, -1)

  const [budgets, prevBudgets] = await Promise.all([
    sb.from('budgets').select('*').eq('user_id', userId).eq('month_key', monthKeyString(thisMonth)),
    sb.from('budgets').select('*').eq('user_id', userId).eq('month_key', monthKeyString(prevMonth)),
  ])
  if (budgets.error) throw new Error(`Đọc budgets lỗi: ${budgets.error.message}`)
  if (prevBudgets.error) throw new Error(`Đọc budgets tháng trước lỗi: ${prevBudgets.error.message}`)

  const currencyByAccount = new Map<string, string>(
    accounts.map((a: Row) => [a.id as string, a.currency as string]),
  )
  const currencyOf = (id: string): string => currencyByAccount.get(id) ?? base

  const parentById = new Map<string, string | null>(
    categories.map((c: Row) => [c.id as string, c.parent_id as string | null]),
  )
  const parentOf = (categoryId: string): string | null => parentById.get(categoryId) ?? null

  // Giao dịch: MỘT lần đọc phủ cả ba cửa sổ (tháng này, tháng trước, N ngày gần đây), rồi
  // cắt trong bộ nhớ — rẻ hơn ba lần đi mạng cho ba khoảng chồng nhau.
  //
  // Cả mốc đọc và phép cắt đều là hàm thuần có test (pushInputPlan.ts). Bản viết tay ở
  // đây trước đó ghép chuỗi `'<YYYY-MM>-01'` cho đầu tháng trước, và với
  // month_start_day = 25 thì mốc đó MUỘN hơn thật 24 ngày → đọc thiếu giao dịch và phần
  // hạn mức dồn bị tính hụt, không lỗi nào báo.
  const soonestNeeded = earliestNeededDate(todayISO, monthStartDay, RECENT_TXS_DAYS)
  const allTxs = await readTxRange(sb, userId, soonestNeeded, addDaysISO(todayISO, 1))
  const { monthTxs, prevMonthTxs, recentTxs } = splitTxWindows(
    allTxs,
    todayISO,
    monthStartDay,
    RECENT_TXS_DAYS,
  )

  const hasRollover = (budgets.data ?? []).some((b: Row) => b.rollover)
  const carry = hasRollover
    ? carryFromPreviousMonth(prevBudgets.data ?? [], prevMonthTxs, currencyOf, base, rates, parentOf)
    : new Map<string, number>()
  const budgetReport = buildBudgetReport(
    budgets.data ?? [],
    monthTxs,
    currencyOf,
    base,
    rates,
    parentOf,
    carry,
  )

  // --- Trần theo nhãn ---
  // Đọc CẢ ĐỜI sổ chứ không dùng cửa sổ giao dịch ở trên: trần kiểu 'total' hỏi
  // "cả chuyến đã tiêu bao nhiêu", mà chuyến đó có thể bắt đầu từ năm ngoái.
  // Chỉ đọc khi thật sự có nhãn đặt trần — người không dùng tính năng này không
  // phải trả giá một lượt quét bảng nối ở mỗi lượt push.
  const tags = await readAll(sb, 'tags', userId)
  const hasTagBudget = tags.some((t: Row) => t.budget_amount != null && t.budget_amount > 0)
  const tagSpendRows = hasTagBudget
    ? await fetchAllPages<Row>((from: number, to: number) =>
        sb
          .from('transaction_tags')
          .select('tag_id, transactions!inner(id, amount, account_id, occurred_on, is_refund)')
          .eq('user_id', userId)
          .eq('transactions.type', 'expense')
          .not('transactions.is_debt_flow', 'is', true)
          .not('transactions.exclude_from_stats', 'is', true)
          .order('transaction_id', { ascending: true })
          .order('tag_id', { ascending: true })
          .range(from, to),
      )
    : []
  const monthRange = getMonthRange(thisMonth, monthStartDay)
  const tagBudgets = buildTagBudgetReport({
    tags,
    // Làm phẳng hình dạng lồng của PostgREST về đúng TagSpendRow — không phải phép
    // tính, chỉ là đổi hình dạng, nên vẫn giữ được ràng buộc "không tính gì ở đây".
    rows: tagSpendRows.map((r: Row) => ({
      tag_id: r.tag_id,
      transaction_id: r.transactions.id,
      amount: r.transactions.amount,
      account_id: r.transactions.account_id,
      occurred_on: r.transactions.occurred_on,
      is_refund: r.transactions.is_refund ?? false,
    })),
    currencyOf,
    base,
    rates,
    monthStart: monthRange.start,
    monthEnd: monthRange.end,
  }).lines

  // --- Lifetime ---
  const [scenarios, phases, events] = await Promise.all([
    readAll(sb, 'life_scenarios', userId),
    readAll(sb, 'life_phases', userId),
    readAll(sb, 'life_events', userId),
  ])
  const lifetime = buildLifetimeInput({
    scenarios,
    phases,
    events,
    birthYear: profile.birth_year,
    annualInflationBps: profile.annual_inflation_bps,
    todayISO,
  })

  return {
    ok: true,
    input: {
      todayISO,
      monthStartDay,
      base,
      rates,
      formatMoney: serverFormatMoney,
      currencyOf,
      accounts,
      categories,
      debts,
      recurringRules,
      budgetReport,
      tagBudgets,
      savingsGoals,
      plannedExpenses,
      networthSnapshots,
      recentTxs,
      lifetime,
      offTypes: profile.notif_off ?? [],
    },
  }
}

export { PAGE_SIZE }
