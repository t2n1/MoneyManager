// Nguồn dữ liệu cho bảng "Phương pháp nào hợp với tôi?" trong Cài đặt.
//
// Gộp thu/chi của BASELINE_MONTHS tháng ĐÃ HOÀN TẤT gần nhất (không tính tháng đang
// dở — tháng dở thiếu nửa kỳ, ướm vào là cơ cấu nào cũng "đạt" một cách rỗng) rồi ướm
// vào từng phương pháp bằng `methodFit`. Tỷ lệ tính trên TỔNG cả kỳ chứ không trung
// bình các tỷ lệ tháng — cùng lý do với `savingsRateVerdict`: tháng thu ít mà nặng
// bằng tháng thu nhiều là sai trọng số.
//
// `undefined` = đang tải, `null` = không có đồng thu nào trong kỳ (chưa ướm được).
import { useMemo } from 'react'
import {
  useAccounts,
  useCategories,
  useProfile,
  useRangeTransactions,
  useRates,
  useTransferCategoryIds,
} from '../../hooks/queries'
import { addMonths, getMonthRange, monthKeyForDate, toISODate } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import {
  categoryBreakdown,
  classificationBreakdown,
  foldUncategorized,
  sumIncomeExpense,
} from '../reports/aggregate'
import { BASELINE_MONTHS } from './axisTargets'
import { BUDGET_METHODS, resolveMethod } from './budgetMethods'
import { methodFit, type MethodFit } from './methodFit'

export interface MethodFitData {
  fits: MethodFit[]
  /** thu TRUNG BÌNH THÁNG của kỳ ướm (base minor) — để quy "X% ≈ ¥Y/tháng" */
  avgIncome: number
}

export function useMethodFit(): MethodFitData | null | undefined {
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { base, rates } = useRates()
  const transferIds = useTransferCategoryIds()

  const monthStartDay = profile?.month_start_day ?? 1
  // BASELINE_MONTHS tháng đứng TRƯỚC tháng hiện tại — cùng cửa sổ với nền thu nhập
  // của tab Ngân sách, để hai chỗ nói về cùng một quá khứ.
  const range = useMemo(() => {
    const current = monthKeyForDate(toISODate(new Date()), monthStartDay)
    return {
      start: getMonthRange(addMonths(current, -BASELINE_MONTHS), monthStartDay).start,
      end: getMonthRange(addMonths(current, -1), monthStartDay).end,
    }
  }, [monthStartDay])
  const { data: txs, isPending } = useRangeTransactions(range, !!profile)

  return useMemo(() => {
    if (!profile || isPending || txs === undefined) return undefined
    const currencyOf = (id: string): CurrencyCode =>
      accounts.find((a) => a.id === id)?.currency ?? base
    const r = rates ?? {}

    const sums = sumIncomeExpense(txs, currencyOf, base, r, transferIds)
    const expense = categoryBreakdown(txs, 'expense', currencyOf, base, r, transferIds)
    const cls = foldUncategorized(
      classificationBreakdown(expense.slices, categories),
      sums.expense,
    )

    // Dòng của phương pháp ĐANG DÙNG mang mốc đã chỉnh (resolveMethod), các phương pháp
    // còn lại mang mốc chuẩn — đúng con số từng dòng sẽ hiện nếu được chọn.
    const resolved = resolveMethod(profile)
    const methods = BUDGET_METHODS.map((m) => (m.id === resolved.id ? resolved : m))

    const fits = methodFit(sums.income, cls, methods, expense.slices, categories)
    if (fits === null) return null
    return { fits, avgIncome: Math.round(sums.income / BASELINE_MONTHS) }
  }, [profile, isPending, txs, accounts, categories, base, rates, transferIds])
}
