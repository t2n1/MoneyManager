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
import { tr } from '../../i18n'
import { trn } from '../../i18n/react'

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
  // "Có hạn mức" = có dòng ngân sách (`budgetedCount`), không phải tổng trần > 0: trần ¥0
  // là trần thật, và biểu đồ của nó vẫn phải chỉ vẽ phạm vi đã đặt.
  const scoped = budgetedCount > 0 && budgetDaily !== null
  return (
    <div className="flex flex-col gap-2">
      <SpendVsBudgetCard
        points={scoped ? budgetDaily.points : monthDaily.points}
        daysElapsed={paceDaysElapsed}
        totalBudgeted={totalBudgeted}
        hasBudget={scoped}
        base={base}
        scopeNote={
          scoped
            ? tr('Chỉ tính {n} mục đã đặt hạn mức — khoản của mục chưa đặt không vẽ ở đây.', { n: budgetedCount })
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
            {/* "tới hôm nay" chứ không "sau 23/30 ngày": cặp số đó là mẫu số của DỰ BÁO
                (đã bỏ ngày đi vắng), không phải lịch — in ra thì nó cãi với nhãn kỳ "đã
                qua 22 ngày · còn 8 ngày (kể cả hôm nay)" ở đầu trang (lib/dates periodDays). */}
            {scoped
              ? tr('Cả tháng đã chi {amount} tính tới hôm nay — gồm cả mục chưa đặt hạn mức.', {
                  amount: formatMoney(forecast.spentSoFar, base),
                })
              : tr('Đã chi {amount} tính tới hôm nay.', { amount: formatMoney(forecast.spentSoFar, base) })}
          </p>
          {/* Nói KHOẢNG chứ không một con số: cùng một mức chi trung bình, người tiêu đều
              mỗi ngày và người dồn vào cuối tuần cho ra độ tin cậy khác hẳn nhau. */}
          {forecast.hasRange && (
            <p className="mt-1 text-sm text-fg-secondary">
              {visual ? (
                trn('Cuối tháng ≈ {projected} ({low}–{high})', {
                  projected: <b>{formatMoney(forecast.projected, base)}</b>,
                  low: formatMoney(forecast.low, base),
                  high: formatMoney(forecast.high, base),
                })
              ) : (
                trn('Cuối tháng ước chừng {low} – {high}, sát nhất là {projected}.', {
                  low: <b>{formatMoney(forecast.low, base)}</b>,
                  high: <b>{formatMoney(forecast.high, base)}</b>,
                  projected: formatMoney(forecast.projected, base),
                })
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
        {tr('Đặt ngân sách tháng để so sánh với dự báo.')}
      </Guide>
    )
  }

  const { totalBudgeted, budgetedCount } = verdict
  if (verdict.kind === 'over') {
    return (
      <p className="mt-2 rounded-lg bg-state-bad-bg px-2 py-1.5 text-sm text-money-out">
        {visual ? (
          trn('Với đà này sẽ vượt trần {cap} khoảng {over}', {
            cap: formatMoney(totalBudgeted, base),
            over: <b>{formatMoney(verdict.overBy, base)}</b>,
          })
        ) : (
          tr('Riêng {n} mục đã đặt hạn mức: với đà này sẽ vượt tổng hạn mức ({cap}) khoảng {over}.', {
            n: budgetedCount,
            cap: formatMoney(totalBudgeted, base),
            over: formatMoney(verdict.overBy, base),
          })
        )}
      </p>
    )
  }
  if (verdict.kind === 'near') {
    return (
      <p className="mt-2 rounded-lg bg-state-warn-bg text-state-warn-fg px-2 py-1.5 text-sm">
        {visual ? (
          tr('Với đà này có thể vượt trần {cap}', { cap: formatMoney(totalBudgeted, base) })
        ) : (
          tr('Riêng {n} mục đã đặt hạn mức: có thể vượt tổng hạn mức ({cap}) — còn tuỳ mấy ngày cuối tháng chi thế nào.', {
            n: budgetedCount,
            cap: formatMoney(totalBudgeted, base),
          })
        )}
      </p>
    )
  }
  return (
    <p className="mt-2 rounded-lg bg-accent-muted-bg px-2 py-1.5 text-sm text-fg-accent">
      {visual ? (
        tr('Với đà này vẫn trong trần {cap}', { cap: formatMoney(totalBudgeted, base) })
      ) : (
        tr('Riêng {n} mục đã đặt hạn mức: với đà này vẫn trong tổng hạn mức ({cap}).', {
          n: budgetedCount,
          cap: formatMoney(totalBudgeted, base),
        })
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
            {tr('Dòng tiền tích lũy trong tháng')}
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
