// Nguồn DUY NHẤT của mặt lập kế hoạch (tab Ngân sách, tháng chưa bắt đầu).
//
// Gom bốn thứ vốn nằm rải rác ba trang khác nhau: thu dự kiến, hạn mức đang đặt,
// cam kết đã biết (định kỳ + sắp chi), và gợi ý số từ lịch sử.

import { useMemo } from 'react'
import {
  useAccounts,
  useBudgets,
  useCategories,
  useMonthPlan,
  usePlannedExpenses,
  useProfile,
  useRangeTransactions,
  useRates,
  useRecurringRules,
} from '../../hooks/queries'
import {
  addMonths,
  getMonthRange,
  monthKeyForDate,
  monthKeyString,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase } from '../../lib/rates'
import { categoryBreakdown, monthlySeries } from '../reports/aggregate'
import { baselineIncome, BASELINE_MONTHS } from './axisTargets'
import { collectCommitments, coverageGaps, type CommitmentReport, type CoverageGap } from './commitments'
import { planSummary, type PlanSummary } from './planning'
import { suggestLimits, type Suggestion } from './suggest'
import { tagPlanLines, type TagPlanLine } from '../tags/budget'
import { useTagBudgets } from '../tags/useTagBudgets'

export interface PlanningData {
  summary: PlanSummary
  /** số người dùng tự khai; null = chưa khai */
  declared: number | null
  /** trung bình các tháng đã đóng sổ; null = chưa đủ dữ liệu */
  baseline: number | null
  commitments: CommitmentReport
  /** danh mục có cam kết vượt hạn mức đang đặt */
  gaps: CoverageGap[]
  suggestions: Map<string, Suggestion>
  /** hạn mức đang đặt theo danh mục — cho danh sách và cho phép đối chiếu */
  budgetedByCat: Map<string, number>
  /** id dòng hạn mức theo danh mục — sheet cần nó để xoá được */
  budgetIdByCat: Map<string, string>
  /** trần theo nhãn quy về "tháng này còn tiêu được bao nhiêu" */
  tagPlan: TagPlanLine[]
  /** riêng cờ thiếu tỷ giá của phần nhãn — nó tính trên chi CẢ ĐỜI, khác nguồn với cam kết */
  tagHasMissingRate: boolean
  hasMissingRate: boolean
}

/**
 * Dữ liệu để lập kế hoạch cho `monthKey`.
 *
 * Cửa sổ lịch sử là BASELINE_MONTHS tháng ĐÃ ĐÓNG SỔ gần nhất tính từ HÔM NAY, không
 * phải mấy tháng đứng ngay trước tháng đang lập. Lập kế hoạch cho tháng 12 mà lấy
 * tháng 9–11 làm nền là lấy ba tháng chưa xảy ra; còn tháng đang chạy dở thì luôn
 * thiếu tiền nên kéo mọi con số xuống thấp hơn thực tế.
 */
export function usePlanning(monthKey: MonthKey): PlanningData {
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { base, rates } = useRates()
  const monthKeyStr = monthKeyString(monthKey)
  const { data: budgets = [] } = useBudgets(monthKeyStr)
  const { data: plan } = useMonthPlan(monthKeyStr)
  const { data: rules = [] } = useRecurringRules()
  const { data: planned = [] } = usePlannedExpenses()
  // Dựng cho ĐÚNG tháng đang lập: trần kỳ 'monthly' phải soi vào tháng đó (chưa tiêu
  // gì → còn nguyên trần), còn kỳ 'total' vốn tính cả đời nên không phụ thuộc kỳ nào.
  const tagBudgets = useTagBudgets(monthKey)

  const monthStartDay = profile?.month_start_day ?? 1
  const currentKey = monthKeyForDate(toISODate(new Date()), monthStartDay)

  const histMonths = useMemo(
    () => Array.from({ length: BASELINE_MONTHS }, (_, i) => addMonths(currentKey, i - BASELINE_MONTHS)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentKey.year, currentKey.month],
  )
  const histRange = useMemo(
    () => ({
      start: getMonthRange(histMonths[0], monthStartDay).start,
      end: getMonthRange(histMonths[histMonths.length - 1], monthStartDay).end,
    }),
    [histMonths, monthStartDay],
  )
  const { data: histTxs = [] } = useRangeTransactions(histRange, !!profile)

  const planRange = useMemo(
    () => getMonthRange(monthKey, monthStartDay),
    [monthKey, monthStartDay],
  )

  return useMemo(() => {
    const currencyOf = (id: string): CurrencyCode =>
      accounts.find((a) => a.id === id)?.currency ?? base
    const r = rates ?? {}
    const convert = (amount: number, c: CurrencyCode) => convertToBase(amount, c, base, r)

    const baseline = baselineIncome(
      monthlySeries(histTxs, histMonths, monthStartDay, currencyOf, base, r).points,
    )

    // Chi theo danh mục của TỪNG tháng lịch sử — nền của mọi gợi ý.
    const perMonth = histMonths.map((mk) => {
      const rng = getMonthRange(mk, monthStartDay)
      const txs = histTxs.filter((t) => t.occurred_on >= rng.start && t.occurred_on < rng.end)
      return {
        monthKey: monthKeyString(mk),
        slices: categoryBreakdown(txs, 'expense', currencyOf, base, r).slices,
      }
    })

    const parentOf = (id: string) => categories.find((c) => c.id === id)?.parent_id ?? null
    const summary = planSummary(
      plan?.expected_income ?? null,
      baseline,
      budgets,
      categories,
      {
        essentialBps: profile?.target_essential_bps ?? 5000,
        flexibleBps: profile?.target_flexible_bps ?? 3000,
        savingsBps: profile?.target_savings_bps ?? 2000,
      },
      parentOf,
    )

    const commitments = collectCommitments(rules, planned, planRange, currencyOf, convert)
    const budgetedByCat = new Map(budgets.map((b) => [b.category_id, b.amount]))

    return {
      summary,
      declared: plan?.expected_income ?? null,
      baseline,
      commitments,
      gaps: coverageGaps(commitments.byCategory, budgetedByCat, parentOf),
      suggestions: suggestLimits(perMonth),
      budgetedByCat,
      budgetIdByCat: new Map(budgets.map((b) => [b.category_id, b.id])),
      tagPlan: tagPlanLines(tagBudgets.lines),
      tagHasMissingRate: tagBudgets.hasMissingRate,
      hasMissingRate: commitments.hasMissingRate,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    histTxs,
    histMonths,
    planRange,
    monthStartDay,
    budgets,
    plan,
    rules,
    planned,
    tagBudgets,
    categories,
    accounts,
    base,
    rates,
    profile,
  ])
}
