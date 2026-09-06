// "Nhịp chi trong tháng": chi tích lũy vs ngân sách, dòng tiền tích lũy, lịch chi tiêu.
// Ba khối này trả lời cùng một câu hỏi — "tháng này đang đi nhanh hay chậm so với
// mức cho phép" — nên gom vào tab Ngân sách thay vì để lẫn trong tab Thấu hiểu.
// Tab Thấu hiểu vẫn dùng `forecast` cho ô thống kê "Dự báo cuối tháng".
//
// PHÉP TÍNH (useMonthPace) nằm ở ./useMonthPace.ts, KHÔNG ở đây — file này import
// recharts (~340KB) cho các khối biểu đồ, còn Bản tin chỉ cần con số của hook. Để
// chung thì mở trang chủ là tải cả thư viện vẽ không dùng tới.

import { Guide } from '../../components/Guide'
import { useDensity } from '../../hooks/useDensity'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCompact, formatMoney } from '../../lib/money'
import { pickBudgetVerdict } from './budgetVerdict'
import { SpendVsBudgetCard } from './SpendVsBudgetCard'
import { Card, SectionTitle } from '../../components/ui'
import { CHART_TEXT_2XS, CHART_TEXT_XS } from '../../lib/chartText'
import type { MonthPace } from './useMonthPace'

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
