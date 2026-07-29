import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Target } from 'lucide-react'
import {
  useAccountBalances,
  useAccounts,
  useProfile,
  useRangeTransactions,
  useRates,
  useSavingsGoals,
} from '../../hooks/queries'
import { earmarkedForGoals } from '../health/earmarked'
import {
  addMonths,
  formatMonthLabel,
  getMonthRange,
  monthKeyForDate,
  toISODate,
} from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import type { SavingsGoalRow } from '../../types/database.types'
import { accountMonthlyGrowth, goalForecast } from './goals'
import { SavingsGoalFormSheet } from './SavingsGoalFormSheet'

/** Số tháng lịch sử dùng để đo tốc độ tích lũy. */
const SPEED_MONTHS = 6

/** Số ngày còn lại tới hạn (âm = quá hạn); null nếu không đặt hạn. */
function daysLeft(targetDate: string | null, todayISO: string): number | null {
  if (!targetDate) return null
  return Math.round((Date.parse(targetDate) - Date.parse(todayISO)) / 86_400_000)
}

/** Khu "Mục tiêu tiết kiệm" trên trang Tài sản (mục AD). */
export function SavingsGoalsSection() {
  const { data: goals = [] } = useSavingsGoals()
  const { data: accounts = [] } = useAccounts()
  const { data: balances = [] } = useAccountBalances()
  const { data: profile } = useProfile()
  const [sheet, setSheet] = useState<{ open: boolean; goal?: SavingsGoalRow }>({ open: false })

  const monthStartDay = profile?.month_start_day ?? 1
  const todayISO = toISODate(new Date())
  const currentMonth = monthKeyForDate(todayISO, monthStartDay)

  // Tốc độ tích lũy đo trên các tháng ĐÃ HOÀN TẤT — tháng đang chạy dở luôn thiếu
  // tiền nên sẽ kéo tốc độ xuống và làm ngày dự kiến xa hơn thực tế.
  const speedMonths = useMemo(
    () =>
      Array.from({ length: SPEED_MONTHS }, (_, i) => addMonths(currentMonth, i - SPEED_MONTHS)),
    [currentMonth],
  )
  const speedRange = useMemo(
    () => ({
      start: getMonthRange(speedMonths[0], monthStartDay).start,
      end: getMonthRange(speedMonths[speedMonths.length - 1], monthStartDay).end,
    }),
    [speedMonths, monthStartDay],
  )
  const { data: txs = [] } = useRangeTransactions(speedRange, goals.length > 0 && !!profile)

  // Tiền đã gom cho mục tiêu thì không còn sẵn cho lúc mất thu nhập. Trang Sức
  // khỏe trừ đúng con số này khỏi quỹ dự phòng, nên tính bằng chung một hàm để
  // hai trang không bao giờ nói hai số khác nhau.
  const { base, rates } = useRates()
  const earmarked = useMemo(
    () => earmarkedForGoals(goals, balances, base, rates ?? {}),
    [goals, balances, base, rates],
  )

  const selectableAccounts = accounts.filter((a) => !a.is_archived)

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-green-800 dark:text-green-400" />
        <h2 className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
          Mục tiêu tiết kiệm
        </h2>
        <button
          type="button"
          onClick={() => setSheet({ open: true })}
          disabled={selectableAccounts.length === 0}
          className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white active:scale-95 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Thêm
        </button>
      </div>

      {goals.length === 0 ? (
        <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
          Chưa có mục tiêu nào. Đặt một đích tiết kiệm để theo dõi tiến độ.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {goals.map((g) => {
            const bal = balances.find((b) => b.id === g.account_id)
            const currency = bal?.currency ?? 'JPY'
            const growth = accountMonthlyGrowth(g.account_id, txs, speedMonths, monthStartDay)
            const f = goalForecast(
              bal?.balance ?? 0,
              g.target_amount,
              growth,
              currentMonth,
              g.target_date,
              monthStartDay,
            )
            const pct = Math.round(f.ratio * 100)
            const dl = daysLeft(g.target_date, todayISO)
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setSheet({ open: true, goal: g })}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {g.name}
                  </span>
                  <span
                    className={`text-xs font-semibold ${f.done ? 'text-green-800 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}
                  >
                    {pct}%
                  </span>
                </button>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className={`h-full rounded-full ${f.done ? 'bg-green-500' : 'bg-green-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span className="tabular-nums">
                    {formatMoney(f.current, currency)} / {formatMoney(g.target_amount, currency)}
                  </span>
                  {dl != null && (
                    <span className={dl < 0 ? 'text-red-500' : ''}>
                      {dl < 0 ? `Quá hạn ${-dl} ngày` : dl === 0 ? 'Đến hạn hôm nay' : `Còn ${dl} ngày`}
                    </span>
                  )}
                </div>

                {/* Dự báo: bao giờ đạt với tốc độ hiện tại */}
                {!f.done && (
                  <p className="mt-1 text-[0.6875rem] leading-relaxed">
                    {f.etaMonth === null ? (
                      <span className="text-gray-500 dark:text-gray-400">
                        {f.monthlyGrowth < 0
                          ? `Số dư đang giảm ${formatMoney(-f.monthlyGrowth, currency)}/tháng — chưa tiến về đích.`
                          : 'Chưa đo được tốc độ tích lũy. Chuyển tiền đều đặn vào tài khoản này để app dự báo ngày đạt.'}
                      </span>
                    ) : (
                      <span
                        className={
                          f.vsDeadline === 'behind'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-gray-500 dark:text-gray-400'
                        }
                      >
                        Đang thêm {formatMoney(f.monthlyGrowth, currency)}/tháng → dự kiến đạt{' '}
                        <b>{formatMonthLabel(f.etaMonth).toLowerCase()}</b>
                        {f.vsDeadline === 'behind' && ' — trễ hơn hạn bạn đặt'}
                        {f.vsDeadline === 'ahead' && ' — kịp hạn'}.
                      </span>
                    )}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {earmarked.total > 0 && (
        <p className="mt-3 border-t border-gray-100 pt-2.5 text-[0.6875rem] leading-relaxed text-gray-500 dark:border-gray-800 dark:text-gray-400">
          <b className="tabular-nums text-gray-700 dark:text-gray-200">
            {earmarked.hasMissingRate ? '≈ ' : ''}
            {formatMoney(earmarked.total, base)}
          </b>{' '}
          trong số dư đang có chủ cho các mục tiêu trên. Trang{' '}
          <Link to="/health" className="font-medium text-green-700 dark:text-green-400">
            Sức khỏe tài chính
          </Link>{' '}
          trừ khoản này ra để biết quỹ dự phòng thật sự tự do còn bao nhiêu tháng.
        </p>
      )}

      {sheet.open && (
        <SavingsGoalFormSheet
          accounts={selectableAccounts}
          goal={sheet.goal}
          onClose={() => setSheet({ open: false })}
        />
      )}
    </section>
  )
}
