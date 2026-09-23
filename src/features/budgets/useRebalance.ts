// Gom dữ liệu cho `planRebalance` — chỉ lắp ráp, KHÔNG có luật nào ở đây.
// Mọi phép tính nằm trong rebalance.ts (thuần, có test); hook này chỉ đi lấy số, đúng
// khuôn usePlanning/useSuggestions.
import { useMemo } from 'react'
import {
  useAccounts,
  useBudgetReport,
  useBudgets,
  useCategories,
  useMonthTransactions,
  useProfile,
  useRates,
  useTransferCategoryIds,
} from '../../hooks/queries'
import {
  addDaysISO,
  daysBetween,
  getMonthRange,
  monthKeyForDate,
  monthKeyString,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { dailyExpenseTotals } from '../reports/aggregate'
import { planRebalance, type RebalanceLine, type RebalanceProposal } from './rebalance'
import { useCommitments } from './useCommitments'

/** null khi không phải tháng hiện tại, chưa có báo cáo, hoặc chưa có gì đáng đề nghị. */
export function useRebalance(monthKey: MonthKey): RebalanceProposal | null {
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  const transferIds = useTransferCategoryIds()
  const { data: accounts = [] } = useAccounts()
  const { data: monthTxs = [] } = useMonthTransactions(monthKey)
  const { data: categories = [] } = useCategories()
  const { data: budgets = [] } = useBudgets(monthKeyString(monthKey))
  const { report } = useBudgetReport(monthKey)
  // CÙNG nguồn với khối "Còn phải trả" ngay dưới đề nghị. Hai khối đọc hai nguồn thì
  // một khối bảo nhóm còn dư, khối kia bảo nhóm còn nợ — đúng lỗi đã gặp với Nhà ở.
  const commitments = useCommitments(monthKey)
  const r = rates ?? {}

  return useMemo(() => {
    if (!report) return null

    const todayISO = toISODate(new Date())
    const currentKey = monthKeyForDate(todayISO, monthStartDay)
    // Tháng tương lai chưa có chi thật, tháng đã qua thì cân lại cũng vô nghĩa.
    if (monthKey.year !== currentKey.year || monthKey.month !== currentKey.month) return null

    const range = getMonthRange(monthKey, monthStartDay)
    const daysInMonth = daysBetween(range.start, range.end)
    const daysElapsed = Math.min(daysBetween(range.start, todayISO) + 1, daysInMonth)
    const lastISO = addDaysISO(range.start, daysElapsed - 1)

    const currencyOf = (id: string): CurrencyCode =>
      accounts.find((a) => a.id === id)?.currency ?? base
    const catById = new Map(categories.map((c) => [c.id, c]))
    const amountOf = new Map(budgets.map((b) => [b.category_id, b.amount]))

    const lines: RebalanceLine[] = report.lines
      // Mốc theo dõi KHÔNG vào tổng — gom vào đây là đếm hai lần chính nó và cha nó.
      .filter((l) => !l.isMarker)
      .map((l) => {
        const cat = catById.get(l.categoryId)
        // `l.spent` của một dòng NHÓM là chi của cả cha lẫn con (xem progress.ts:
        // groupSpent). Chuỗi ngày phải cùng phạm vi đó, nếu không dự báo sẽ tính khoảng
        // tin cậy trên một tập giao dịch nhỏ hơn chính con số nó đang giải thích.
        const ids = new Set([l.categoryId])
        for (const c of categories) if (c.parent_id === l.categoryId) ids.add(c.id)
        const cua = monthTxs.filter((t) => t.category_id !== null && ids.has(t.category_id))

        // Cố định đọc theo cost_type của CHÍNH danh mục giao dịch, KHÔNG thừa kế từ cha —
        // cùng quy tắc với useMonthPace. Trần hay đặt ở nhóm (`Nhà ở`, cost_type null)
        // còn `fixed` nằm ở con (`Tiền nhà`); đọc ở dòng hạn mức là bỏ sót, và nhóm bị
        // báo vượt gấp mấy lần sự thật.
        const laCoDinh = (t: (typeof cua)[number]) =>
          t.category_id !== null && catById.get(t.category_id)?.cost_type === 'fixed'
        // Đi qua dailyExpenseTotals cho cả hai vế để dùng chung đúng một bộ lọc
        // (bỏ chuyển khoản, dòng nợ, khoản loại khỏi thống kê) và đúng một phép quy đổi.
        const chuoi = (txs: typeof cua) =>
          dailyExpenseTotals(txs, range.start, lastISO, currencyOf, base, r, transferIds)
        const coDinh = chuoi(cua.filter(laCoDinh))

        return {
          categoryId: l.categoryId,
          name: cat?.name ?? l.categoryId,
          // `budgeted` đã gồm phần dồn; `amount` là tiền của riêng tháng này và là
          // trần thật cho việc rút.
          amount: amountOf.get(l.categoryId) ?? l.budgeted,
          budgeted: l.budgeted,
          spent: l.spent,
          fixedSpent: coDinh.points.reduce((s, p) => s + p.expense, 0),
          // Chỉ phần biến đổi: độ chênh của khoản trả một-lần không nói gì về mấy ngày còn lại.
          daily: chuoi(cua.filter((t) => !laCoDinh(t))).points.map((p) => p.expense),
        }
      })

    return planRebalance({
      lines,
      daysElapsed,
      daysInMonth,
      committedByCat: commitments.byCategory,
      parentOf: (id) => catById.get(id)?.parent_id ?? null,
    })
  }, [report, monthKey, monthStartDay, accounts, categories, budgets, monthTxs, base, r, transferIds, commitments.byCategory])
}
