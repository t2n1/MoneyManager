// "Nhịp chi trong tháng": chi tích lũy vs ngân sách, dòng tiền tích lũy, lịch chi tiêu.
// Ba khối này trả lời cùng một câu hỏi — "tháng này đang đi nhanh hay chậm so với
// mức cho phép" — nên gom vào tab Ngân sách thay vì để lẫn trong tab Thấu hiểu.
// Tab Thấu hiểu vẫn dùng `forecast` cho ô thống kê "Dự báo cuối tháng".

import { useMemo } from 'react'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  useAccounts,
  useBudgetReport,
  useMonthTransactions,
  useProfile,
  useRates,
} from '../../hooks/queries'
import {
  addDaysISO,
  daysBetween,
  getMonthRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import { convertToBase } from '../../lib/rates'
import { cumulativeDailyBalance, dailyExpenseTotals } from './aggregate'
import { forecastMonthEnd, type Forecast } from './insights'
import { SpendVsBudgetCard } from './SpendVsBudgetCard'
import { SpendHeatmapCard } from './SpendHeatmapCard'

export interface MonthPace {
  base: CurrencyCode
  /** Chi từng ngày cho TRỌN tháng (nền cho cả 2 khối chi tiêu) */
  monthDaily: ReturnType<typeof dailyExpenseTotals>
  /** Có ít nhất một ngày phát sinh chi */
  hasSpend: boolean
  /** Số ngày tính vào đường thực chi: tới hôm nay nếu là tháng hiện tại, cả tháng nếu đã qua */
  paceDaysElapsed: number
  totalBudgeted: number
  /** Dự báo cuối tháng — chỉ có ở tháng hiện tại */
  forecast: Forecast | null
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
  const r = rates ?? {}
  const { data: accounts = [] } = useAccounts()
  const { data: monthTxs = [] } = useMonthTransactions(monthKey)
  const { report } = useBudgetReport(monthKey)

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base

  const todayISO = toISODate(new Date())
  const currentKey = monthKeyForDate(todayISO, monthStartDay)
  const isCurrentMonth = monthKey.year === currentKey.year && monthKey.month === currentKey.month

  const range = getMonthRange(monthKey, monthStartDay)
  const daysInMonth = daysBetween(range.start, range.end)
  const daysElapsed = Math.min(daysBetween(range.start, todayISO) + 1, daysInMonth)

  // Dự báo cuối tháng: nội suy theo tốc độ chi tới hôm nay (bỏ dòng tiền trả nợ)
  let spentSoFar = 0
  let forecastApprox = false
  for (const t of monthTxs) {
    if (t.type !== 'expense' || t.is_debt_flow || t.occurred_on > todayISO) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, r)
    if (v === null) {
      forecastApprox = true
      continue
    }
    spentSoFar += v
  }
  const forecast = isCurrentMonth ? forecastMonthEnd(spentSoFar, daysElapsed, daysInMonth) : null

  const monthLastISO = addDaysISO(range.end, -1)
  const monthDaily = useMemo(
    () => dailyExpenseTotals(monthTxs, range.start, monthLastISO, currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, range.start, monthLastISO, accounts, base, rates],
  )

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
    totalBudgeted: report?.totalBudgeted ?? 0,
    forecast,
    forecastApprox,
    cashflowData: cashflow.points.map((p) => ({
      label: `${Number(p.date.slice(8))}/${Number(p.date.slice(5, 7))}`,
      balance: p.balance,
    })),
    hasCashflow: cashflow.points.some((p) => p.balance !== 0),
    hasMissingRate: forecastApprox || cashflow.hasMissingRate || monthDaily.hasMissingRate,
  }
}

/**
 * Khối "đang đi nhanh hay chậm" — đặt ngay dưới dòng Tổng ngân sách vì nó trả lời
 * cùng câu hỏi đó bằng một câu chữ, không bắt người đọc tự suy từ biểu đồ.
 */
export function SpendPaceSection({ pace }: { pace: MonthPace }) {
  const { monthDaily, hasSpend, paceDaysElapsed, totalBudgeted, forecast, base } = pace
  if (!hasSpend) return null
  return (
    <div className="flex flex-col gap-2">
      <SpendVsBudgetCard
        points={monthDaily.points}
        daysElapsed={paceDaysElapsed}
        totalBudgeted={totalBudgeted}
        base={base}
      />
      {forecast && (
        <div className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Đã chi {formatMoney(forecast.spentSoFar, base)} sau {forecast.daysElapsed}/
            {forecast.daysInMonth} ngày.
          </p>
          {totalBudgeted > 0 ? (
            forecast.projected > totalBudgeted ? (
              <p className="mt-2 rounded-lg bg-red-50 dark:bg-red-900/30 px-2 py-1.5 text-xs text-money-out">
                Với đà này bạn sẽ vượt ngân sách {formatMoney(forecast.projected - totalBudgeted, base)}.
              </p>
            ) : (
              <p className="mt-2 rounded-lg bg-green-50 dark:bg-green-900/30 px-2 py-1.5 text-xs text-green-700 dark:text-green-400">
                Với đà này bạn vẫn trong ngân sách ({formatMoney(totalBudgeted, base)}).
              </p>
            )
          ) : (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Đặt ngân sách tháng để so sánh với dự báo.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Hai biểu đồ mô tả — để cuối tab, dưới danh sách hạn mức (phần bấm được). */
export function MonthPaceCharts({ pace }: { pace: MonthPace }) {
  const { cashflowData, hasCashflow, monthDaily, hasSpend, base } = pace
  if (!hasCashflow && !hasSpend) return null
  return (
    <>
      {hasCashflow && (
        <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
            Dòng tiền tích lũy trong tháng
          </h2>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cashflowData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  interval={4}
                />
                <YAxis
                  tickFormatter={(v: number) => formatCompact(v, base)}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <ReferenceLine y={0} stroke="#9ca3af" />
                <Tooltip
                  formatter={(v) => formatMoney(Number(v), base)}
                  labelFormatter={(l) => `Ngày ${l}`}
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                />
                <Line type="monotone" dataKey="balance" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
      {hasSpend && <SpendHeatmapCard points={monthDaily.points} base={base} />}
    </>
  )
}
