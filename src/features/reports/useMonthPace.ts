// Hook "nhịp chi trong tháng" — TÁCH KHỎI monthPace.tsx có chủ ý: Bản tin (màn mở đầu
// tiên mỗi ngày) chỉ cần CON SỐ dự báo từ hook này, còn monthPace.tsx import recharts
// (~340KB) cho ba khối biểu đồ của trang Ngân sách/Báo cáo. Để chung một file thì mở
// trang chủ là tải cả thư viện vẽ mà màn đó không vẽ gì bằng nó (mọi biểu đồ Bản tin
// đều vẽ tay — xem CashflowStrip). Ai cần biểu đồ thì import monthPace.tsx như cũ.
import { useMemo } from 'react'
import {
  useAccounts,
  useBudgetReport,
  useCategories,
  useMonthTransactions,
  useProfile,
  useRates,
  useTransferCategoryIds,
  useTrips,
} from '../../hooks/queries'
import {
  addDaysISO,
  daysBetween,
  getMonthRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase } from '../../lib/rates'
import { cumulativeDailyBalance, dailyExpenseTotals } from './aggregate'
import { ngayDiVang } from './ngayDiVang'
import { forecastMonthEnd, type Forecast } from './insights'

export interface MonthPace {
  base: CurrencyCode
  /** Chi từng ngày cho TRỌN tháng (nền cho cả 2 khối chi tiêu) */
  monthDaily: ReturnType<typeof dailyExpenseTotals>
  /** Có ít nhất một ngày phát sinh chi */
  hasSpend: boolean
  /** Số ngày tính vào đường thực chi: tới hôm nay nếu là tháng hiện tại, cả tháng nếu đã qua */
  paceDaysElapsed: number
  /** Tổng số ngày của tháng đang xem — cùng với paceDaysElapsed cho ra "đã trôi bao nhiêu phần tháng" */
  paceDaysInMonth: number
  /** Tháng đang xem có phải tháng hiện tại không. Không suy được từ hai số trên:
   *  ngày cuối tháng thì paceDaysElapsed cũng bằng paceDaysInMonth. */
  isCurrentMonth: boolean
  totalBudgeted: number
  /** Số dòng hạn mức tính vào tổng (nhóm/lá độc lập — KHÔNG tính mốc con) */
  budgetedCount: number
  /** Chi từng ngày CHỈ của các mục đã đặt hạn mức — null khi chưa đặt hạn mức nào.
   *  Phải cùng phạm vi với totalBudgeted thì đường "Đã chi" mới so được với đường
   *  "Ngân sách": lấy toàn bộ chi (kể cả mục chưa đặt) đem so là mọi người dùng chỉ
   *  đặt vài hạn mức đều thấy cảnh báo vượt khổng lồ — và thôi tin cả thẻ. */
  budgetDaily: ReturnType<typeof dailyExpenseTotals> | null
  /** Dự báo cuối tháng trên TOÀN BỘ chi — chỉ có ở tháng hiện tại */
  forecast: Forecast | null
  /** Dự báo cuối tháng RIÊNG phần đã đặt hạn mức — cùng phạm vi với totalBudgeted */
  budgetForecast: Forecast | null
  /** Có khoản ngoại tệ chưa quy đổi được → số liệu là xấp xỉ */
  forecastApprox: boolean
  cashflowData: { label: string; balance: number }[]
  hasCashflow: boolean
  hasMissingRate: boolean
}

/** Gom toàn bộ phép tính nhịp chi của MỘT tháng. Dùng chung cho tab Ngân sách và Thấu hiểu. */
export function useMonthPace(monthKey: MonthKey): MonthPace {
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  const transferIds = useTransferCategoryIds()
  // Ngày đi vắng (chuyến đi) — chỉ dự báo dùng, biểu đồ giữ nguyên. Xem chỗ forecast.
  const { data: trips = [] } = useTrips()
  const vang = useMemo(() => ngayDiVang(trips), [trips])
  const r = rates ?? {}
  const { data: accounts = [] } = useAccounts()
  const { data: monthTxs = [] } = useMonthTransactions(monthKey)
  const { data: categories = [] } = useCategories()
  const { report } = useBudgetReport(monthKey)

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base

  const todayISO = toISODate(new Date())
  const currentKey = monthKeyForDate(todayISO, monthStartDay)
  const isCurrentMonth = monthKey.year === currentKey.year && monthKey.month === currentKey.month

  const range = getMonthRange(monthKey, monthStartDay)
  const daysInMonth = daysBetween(range.start, range.end)
  const daysElapsed = Math.min(daysBetween(range.start, todayISO) + 1, daysInMonth)

  // Chi cố định đọc theo cost_type của CHÍNH danh mục giao dịch — cùng quy tắc với
  // classificationBreakdown (không thừa kế từ cha).
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const isFixed = (categoryId: string | null) =>
    categoryId !== null && catById.get(categoryId)?.cost_type === 'fixed'

  // Phạm vi ngân sách: giao dịch thuộc một dòng hạn mức tính-vào-tổng (lá/nhóm),
  // trực tiếp hoặc qua danh mục cha. Mốc con (isMarker) không mở rộng phạm vi —
  // nó đã nằm trong trần của cha.
  const budgetRoots = useMemo(
    () => new Set((report?.lines ?? []).filter((l) => !l.isMarker).map((l) => l.categoryId)),
    [report],
  )
  const inBudgetScope = (t: { category_id: string | null }) => {
    if (t.category_id === null) return false
    if (budgetRoots.has(t.category_id)) return true
    const parent = catById.get(t.category_id)?.parent_id
    return parent != null && budgetRoots.has(parent)
  }

  // Dự báo cuối tháng: phần biến đổi nội suy theo tốc độ tới hôm nay, phần cố định
  // (đã trả một-lần-mỗi-tháng) cộng nguyên — xem chú thích forecastMonthEnd.
  // (bỏ dòng tiền trả nợ và giao dịch nội bộ exclude_from_stats)
  let spentSoFar = 0
  let fixedSoFar = 0
  let budgetSpentSoFar = 0
  let budgetFixedSoFar = 0
  let forecastApprox = false
  for (const t of monthTxs) {
    if (t.type !== 'expense' || t.is_debt_flow || t.exclude_from_stats || t.occurred_on > todayISO) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, r)
    if (v === null) {
      forecastApprox = true
      continue
    }
    spentSoFar += v
    const fixed = isFixed(t.category_id)
    if (fixed) fixedSoFar += v
    if (inBudgetScope(t)) {
      budgetSpentSoFar += v
      if (fixed) budgetFixedSoFar += v
    }
  }
  const monthLastISO = addDaysISO(range.end, -1)
  const monthDaily = useMemo(
    () => dailyExpenseTotals(monthTxs, range.start, monthLastISO, currencyOf, base, r, transferIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, range.start, monthLastISO, accounts, base, rates],
  )
  // Chi từng ngày CHỈ của phạm vi ngân sách — cho đường "Đã chi" của biểu đồ
  // "Chi tích lũy vs ngân sách" (đường "Ngân sách" vẽ từ totalBudgeted cùng phạm vi).
  const budgetDaily = useMemo(
    () =>
      budgetRoots.size > 0
        ? dailyExpenseTotals(
            monthTxs.filter(inBudgetScope),
            range.start,
            monthLastISO,
            currencyOf,
            base,
            r,
            transferIds,
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, budgetRoots, catById, range.start, monthLastISO, accounts, base, rates],
  )
  // Chuỗi ngày CHỈ GỒM phần biến đổi — độ chênh của khoản cố định trả-một-lần không
  // nói gì về mấy ngày còn lại nên không được vào phép đo khoảng.
  const variableDaily = useMemo(
    () =>
      dailyExpenseTotals(
        monthTxs.filter((t) => !isFixed(t.category_id)),
        range.start, monthLastISO, currencyOf, base, r, transferIds,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, catById, range.start, monthLastISO, accounts, base, rates],
  )
  const budgetVariableDaily = useMemo(
    () =>
      budgetRoots.size > 0
        ? dailyExpenseTotals(
            monthTxs.filter((t) => inBudgetScope(t) && !isFixed(t.category_id)),
            range.start, monthLastISO, currencyOf, base, r, transferIds,
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, budgetRoots, catById, range.start, monthLastISO, accounts, base, rates],
  )

  // Dự báo đứng SAU các chuỗi ngày vì nó cần chi từng ngày để đo độ chênh — chỉ lấy
  // những ngày ĐÃ trôi, ngày chưa tới thì bằng 0 và sẽ kéo độ chênh xuống sai.
  //
  // NGÀY ĐI VẮNG (chuyến đi) bị bỏ khỏi đầu vào dự báo — cả tử (chuỗi ngày, số ngày đã
  // trôi) lẫn mẫu (số ngày của tháng): 7 ngày số 0 giữa tháng không nói "nhịp chi chậm
  // lại", nó nói "không có ai ở nhà". monthDaily/budgetDaily cho BIỂU ĐỒ giữ nguyên.
  const nKeepMonth = monthDaily.points.filter((p) => !vang.has(p.date)).length
  const vpKeep = variableDaily.points
    .slice(0, daysElapsed)
    .filter((p) => !vang.has(p.date))
  const forecast = isCurrentMonth
    ? forecastMonthEnd(
        spentSoFar,
        vpKeep.length,
        nKeepMonth,
        vpKeep.map((p) => p.expense),
        fixedSoFar,
      )
    : null
  const bvpKeep =
    budgetVariableDaily === null
      ? null
      : budgetVariableDaily.points.slice(0, daysElapsed).filter((p) => !vang.has(p.date))
  const budgetForecast =
    isCurrentMonth && bvpKeep !== null
      ? forecastMonthEnd(
          budgetSpentSoFar,
          bvpKeep.length,
          nKeepMonth,
          bvpKeep.map((p) => p.expense),
          budgetFixedSoFar,
        )
      : null

  // Dòng tiền tích lũy chỉ vẽ tới hôm nay ở tháng hiện tại (tránh đường phẳng cuối tháng)
  const cashLastISO = isCurrentMonth ? todayISO : monthLastISO
  const cashflow = useMemo(
    () => cumulativeDailyBalance(monthTxs, range.start, cashLastISO, currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, range.start, cashLastISO, accounts, base, rates],
  )

  return {
    base,
    monthDaily,
    hasSpend: monthDaily.points.some((p) => p.expense > 0),
    paceDaysElapsed: isCurrentMonth ? daysElapsed : daysInMonth,
    paceDaysInMonth: daysInMonth,
    isCurrentMonth,
    totalBudgeted: report?.totalBudgeted ?? 0,
    budgetedCount: budgetRoots.size,
    budgetDaily,
    forecast,
    budgetForecast,
    forecastApprox,
    cashflowData: cashflow.points.map((p) => ({
      label: `${Number(p.date.slice(5, 7))}/${Number(p.date.slice(8))}`,
      balance: p.balance,
    })),
    hasCashflow: cashflow.points.some((p) => p.balance !== 0),
    hasMissingRate: forecastApprox || cashflow.hasMissingRate || monthDaily.hasMissingRate,
  }
}
