// Nguồn DUY NHẤT của khối "Cơ cấu chi so với mốc" (50/30/20).
//
// Tách khỏi BudgetView vì giờ có hai chỗ hiện cùng con số: khối đầy đủ ở tab Ngân
// sách và dải gọn ở tab Sổ. Hai chỗ tính riêng là sớm muộn cũng lệch nhau — mà lệch
// kiểu này thì không ai phát hiện, chỉ thấy "app báo hai số khác nhau".
import { useMemo } from 'react'
import {
  useAccounts,
  useCategories,
  useMonthTransactions,
  useProfile,
  useRangeTransactions,
  useRates,
  useTransferCategoryIds,
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
import {
  categoryBreakdown,
  classificationBreakdown,
  foldUncategorized,
  monthlySeries,
  sumIncomeExpense,
} from '../reports/aggregate'
import {
  axisProgress,
  axisSlices,
  baselineIncome,
  BASELINE_MONTHS,
  type AxisProgress,
} from './axisTargets'
import { resolveMethod } from './budgetMethods'

/**
 * Cơ cấu chi của `monthKey` so với mốc trong hồ sơ. null = chưa đủ dữ liệu để nói
 * gì (không có thu, cũng không có nền để ước tính).
 *
 * Nền thu nhập CHỈ hút thêm dữ liệu khi đang xem tháng dở — xem `axisProgress`.
 * Tháng đã qua không tốn thêm truy vấn nào.
 */
export function useAxisProgress(monthKey: MonthKey): AxisProgress | null {
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: monthTxs = [] } = useMonthTransactions(monthKey)
  const { base, rates } = useRates()
  const transferIds = useTransferCategoryIds()

  const monthStartDay = profile?.month_start_day ?? 1
  const currentKey = monthKeyForDate(toISODate(new Date()), monthStartDay)
  const isCurrentMonth = monthKeyString(monthKey) === monthKeyString(currentKey)

  // BASELINE_MONTHS tháng ĐỨNG TRƯỚC tháng đang xem. Không gồm chính nó: tháng dở
  // là thứ ta đang tìm mẫu số cho, lấy nó làm nền là lấy câu trả lời làm câu hỏi.
  const baseMonths = useMemo(
    () =>
      Array.from({ length: BASELINE_MONTHS }, (_, i) =>
        addMonths(monthKey, i - BASELINE_MONTHS),
      ),
    [monthKey],
  )
  const baseRange = useMemo(
    () => ({
      start: getMonthRange(baseMonths[0], monthStartDay).start,
      end: getMonthRange(baseMonths[baseMonths.length - 1], monthStartDay).end,
    }),
    [baseMonths, monthStartDay],
  )
  const { data: baseTxs = [] } = useRangeTransactions(
    baseRange,
    !!profile && isCurrentMonth,
  )

  return useMemo(() => {
    const currencyOf = (id: string): CurrencyCode =>
      accounts.find((a) => a.id === id)?.currency ?? base
    const r = rates ?? {}
    const method = resolveMethod(profile)

    const sums = sumIncomeExpense(monthTxs, currencyOf, base, r, transferIds)
    const expense = categoryBreakdown(monthTxs, 'expense', currencyOf, base, r, transferIds)
    // foldUncategorized: khoản chi thiếu danh mục vẫn phải nằm trong "chưa phân loại"
    const cls = foldUncategorized(
      classificationBreakdown(expense.slices, categories),
      sums.expense,
    )

    const baseline = isCurrentMonth
      ? baselineIncome(
          monthlySeries(baseTxs, baseMonths, monthStartDay, currencyOf, base, r, transferIds)
            .points,
        )
      : null

    return axisProgress(
      sums.income,
      cls,
      method,
      baseline,
      // Cùng một `expense.slices` đã dùng để cộng tổng — dòng khoản và danh sách xổ ra
      // không thể lệch nhau.
      axisSlices(expense.slices, categories, method),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    monthTxs,
    baseTxs,
    baseMonths,
    monthStartDay,
    isCurrentMonth,
    categories,
    accounts,
    base,
    rates,
    profile,
  ])
}
