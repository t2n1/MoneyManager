// "Nhịp chi trong tháng": chi tích lũy vs ngân sách, dòng tiền tích lũy, lịch chi tiêu.
// Ba khối này trả lời cùng một câu hỏi — "tháng này đang đi nhanh hay chậm so với
// mức cho phép" — nên gom vào tab Ngân sách thay vì để lẫn trong tab Thấu hiểu.
// Tab Thấu hiểu vẫn dùng `forecast` cho ô thống kê "Dự báo cuối tháng".

import { useMemo } from 'react'
import { Guide } from '../../components/Guide'
import { useDensity } from '../../hooks/useDensity'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import { convertToBase } from '../../lib/rates'
import { cumulativeDailyBalance, dailyExpenseTotals } from './aggregate'
import { ngayDiVang } from './ngayDiVang'
import { pickBudgetVerdict } from './budgetVerdict'
import { forecastMonthEnd, type Forecast } from './insights'
import { SpendVsBudgetCard } from './SpendVsBudgetCard'
import { Card, SectionTitle } from '../../components/ui'
import { CHART_TEXT_2XS, CHART_TEXT_XS } from '../../lib/chartText'

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

/**
 * Khối "đang đi nhanh hay chậm" — đặt ngay dưới dòng Tổng ngân sách vì nó trả lời
 * cùng câu hỏi đó bằng một câu chữ, không bắt người đọc tự suy từ biểu đồ.
 */
/** Nén câu số dài ở chế độ Gọn: giữ con số, bỏ mệnh đề giải thích. */
export function SpendPaceSection({ pace }: { pace: MonthPace }) {
  const { visual } = useDensity()
  const {
    monthDaily, budgetDaily, hasSpend, paceDaysElapsed,
    totalBudgeted, budgetedCount, forecast, base,
  } = pace
  if (!hasSpend) return null
  // Có hạn mức → biểu đồ và câu kết luận đều chỉ tính phạm vi đã đặt hạn mức.
  // Lấy TOÀN BỘ chi đem so với hạn mức của vài mục là so lệch phạm vi: ai mới đặt
  // vài hạn mức cũng thấy "vượt" khổng lồ, và thôi tin cả thẻ.
  const scoped = totalBudgeted > 0 && budgetDaily !== null
  return (
    <div className="flex flex-col gap-2">
      <SpendVsBudgetCard
        points={scoped ? budgetDaily.points : monthDaily.points}
        daysElapsed={paceDaysElapsed}
        totalBudgeted={totalBudgeted}
        base={base}
        scopeNote={
          scoped
            ? `Chỉ tính ${budgetedCount} mục đã đặt hạn mức — khoản của mục chưa đặt không vẽ ở đây.`
            : undefined
        }
      />
      {forecast && (
        <Card>
          {/* GHI RÕ PHẠM VI. `forecast.spentSoFar` là TOÀN BỘ chi, còn biểu đồ ngay trên
              nó lại chỉ vẽ phần đã đặt hạn mức — hai phạm vi trong một thẻ. Đo trên demo
              hai số lệch ¥47,054 (¥239,245 so với ¥192,191) mà trước đây không có chữ nào
              nói vì sao, nên đọc thành "thẻ này tự mâu thuẫn". */}
          <p className="text-sm text-fg-muted">
            {scoped ? 'Cả tháng đã chi ' : 'Đã chi '}
            {formatMoney(forecast.spentSoFar, base)} sau {forecast.daysElapsed}/
            {forecast.daysInMonth} ngày{scoped ? ' — gồm cả mục chưa đặt hạn mức.' : '.'}
          </p>
          {/* Nói KHOẢNG chứ không một con số: cùng một mức chi trung bình, người tiêu đều
              mỗi ngày và người dồn vào cuối tuần cho ra độ tin cậy khác hẳn nhau. */}
          {forecast.hasRange && (
            <p className="mt-1 text-sm text-fg-secondary">
              {visual ? (
                <>
                  Cuối tháng ≈ <b>{formatMoney(forecast.projected, base)}</b> (
                  {formatMoney(forecast.low, base)}–{formatMoney(forecast.high, base)})
                </>
              ) : (
                <>
                  Cuối tháng ước chừng <b>{formatMoney(forecast.low, base)}</b> –{' '}
                  <b>{formatMoney(forecast.high, base)}</b>, sát nhất là{' '}
                  {formatMoney(forecast.projected, base)}.
                </>
              )}
            </p>
          )}
        </Card>
      )}
    </div>
  )
}

/**
 * Câu phán quyết "với đà này có thủng trần không" — render ở thẻ TỔNG NGÂN SÁCH, không
 * ở đây.
 *
 * Vì sao tách khỏi khối trên: đo trên mobile 375×812, câu này nằm ở y=803 trong khi mép
 * gấp (mép trên thanh nav `fixed`) ở y=732. Người mở trang trên điện thoại thấy con số
 * "còn ¥…" to nhất màn ở y=347 và KHÔNG thấy câu nói tháng này vẫn thủng, trừ khi cuộn.
 * Hai vế của cùng một câu trả lời mà một vế trên mép gấp, một vế dưới. Đưa nó lên đứng
 * ngay cạnh con số nó nói tới là cách duy nhất kéo được lên trên mép gấp.
 *
 * Phép chọn nằm ở `pickBudgetVerdict` (thuần, có phép thử) — ở đây chỉ có chữ.
 */
export function BudgetVerdictLine({ pace }: { pace: MonthPace }) {
  const { visual } = useDensity()
  const verdict = pickBudgetVerdict(pace)
  if (!verdict) return null
  const { base } = pace

  if (verdict.kind === 'unset') {
    return (
      <Guide className="mt-2 text-sm text-fg-muted">
        Đặt ngân sách tháng để so sánh với dự báo.
      </Guide>
    )
  }

  const { totalBudgeted, budgetedCount } = verdict
  if (verdict.kind === 'over') {
    return (
      <p className="mt-2 rounded-lg bg-state-bad-bg px-2 py-1.5 text-sm text-money-out">
        {visual ? (
          <>
            Với đà này sẽ vượt trần {formatMoney(totalBudgeted, base)} khoảng{' '}
            <b>{formatMoney(verdict.overBy, base)}</b>
          </>
        ) : (
          <>
            Riêng {budgetedCount} mục đã đặt hạn mức: với đà này sẽ vượt tổng hạn mức
            ({formatMoney(totalBudgeted, base)}) khoảng {formatMoney(verdict.overBy, base)}.
          </>
        )}
      </p>
    )
  }
  if (verdict.kind === 'near') {
    return (
      <p className="mt-2 rounded-lg bg-state-warn-bg text-state-warn-fg px-2 py-1.5 text-sm">
        {visual ? (
          <>Với đà này có thể vượt trần {formatMoney(totalBudgeted, base)}</>
        ) : (
          <>
            Riêng {budgetedCount} mục đã đặt hạn mức: có thể vượt tổng hạn mức
            ({formatMoney(totalBudgeted, base)}) — còn tuỳ mấy ngày cuối tháng chi thế nào.
          </>
        )}
      </p>
    )
  }
  return (
    <p className="mt-2 rounded-lg bg-accent-muted-bg px-2 py-1.5 text-sm text-fg-accent">
      {visual ? (
        <>Với đà này vẫn trong trần {formatMoney(totalBudgeted, base)}</>
      ) : (
        <>
          Riêng {budgetedCount} mục đã đặt hạn mức: với đà này vẫn trong tổng hạn mức
          ({formatMoney(totalBudgeted, base)}).
        </>
      )}
    </p>
  )
}

/**
 * Dòng tiền tích lũy trong tháng — biểu đồ mô tả, để cuối cột (dưới phần bấm được).
 *
 * Tách khỏi lịch chi tiêu (từng chung một `MonthPaceCharts`) vì từ B10 hai thẻ này
 * đứng ở HAI CỘT khác nhau: trang Ngân sách có bốn panel dồn cột phải trong khi cột
 * trái hết sớm, chừa ~1000px trống. Gộp chúng trong một component nghĩa là không tách
 * được — nên chỗ tách nằm ở đây, không phải một cái `order-*` ở nơi gọi.
 */
export function CumulativeCashflowCard({ pace }: { pace: MonthPace }) {
  const { cashflowData, hasCashflow, base } = pace
  if (!hasCashflow) return null
  return (
    <>
      {hasCashflow && (
        <Card as="section">
          <SectionTitle className="mb-2">
            Dòng tiền tích lũy trong tháng
          </SectionTitle>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {/* right: 14 chứ không 8 — điểm cuối của LineChart nằm ĐÚNG mép phải vùng vẽ,
                  nhãn trục x canh giữa theo nó, nên nửa nhãn ("8/31" rộng ~22px) tràn ra
                  ngoài svg và bị cắt. Đo được cắt 3px ở cả hai biểu đồ đường của màn Ngân
                  sách. Biểu đồ CỘT không bị: cột thụt vào khỏi mép nên nhãn còn chỗ. */}
              <LineChart data={cashflowData} margin={{ top: 8, right: 14, left: -8, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: CHART_TEXT_2XS, fill: 'var(--fg-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  interval={4}
                />
                {/* width 56 chứ không 44: dòng tiền tích lũy ÂM là chuyện thường (tiền
                    nhà ngày 1), và nhãn "-13.8万" rộng hơn 44px nên bị cắt mất "-1" —
                    trục đọc thành "2.6万" trong khi số thật là -12.6万 (đo được trên
                    production 09/2026). */}
                <YAxis
                  tickFormatter={(v: number) => formatCompact(v, base)}
                  tick={{ fontSize: CHART_TEXT_2XS, fill: 'var(--fg-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <ReferenceLine y={0} stroke="var(--fg-muted)" />
                <Tooltip
                  formatter={(v) => formatMoney(Number(v), base)}
                  labelFormatter={(l) => String(l)}
                  contentStyle={{ borderRadius: 8, fontSize: CHART_TEXT_XS, border: '1px solid #e5e7eb' }}
                />
                {/* sky-600 chứ không sky-500: sky-500 chỉ 2,77:1 trên nền trắng, dưới
                    ngưỡng 3:1 cho đối tượng đồ hoạ. sky-600 đạt 4,02:1 / 4,41:1. */}
                <Line type="monotone" dataKey="balance" stroke="var(--color-sky-600)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </>
  )
}

// ĐÃ XOÁ: `MonthSpendCalendar` (lịch chi tiêu ô vuông đậm/nhạt) và `SpendHeatmapCard`.
// Nó vẽ ĐÚNG bộ số của thẻ "Chi từng ngày" nay ở trang Bản tin — mà lịch chỉ đọc ra
// đậm/nhạt còn đường đọc ra ngay ngày nào vọt lên, tức là ngày cần đi tra. Một bộ số
// không vẽ hai lần. `pace.monthDaily` vẫn ở lại: `SpendPaceSection` dùng nó.
