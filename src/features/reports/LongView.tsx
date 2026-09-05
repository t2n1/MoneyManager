// Tab "Dài hạn" — bản 27a. Thay TrendsView + MultiYearView + dải điều hướng năm.
//
// VÌ SAO DỰNG LẠI
// Bản trước bày BA khoảng thời gian cùng lúc trên một màn hình: công tắc ghi "12T", dải
// điều hướng ghi "Năm 2026", biểu đồ vẽ 24 tháng. Ba con số thời gian không khớp nhau,
// và không có gì nói cái nào đang chi phối cái gì.
//
// Tệ hơn: hai trong ba nút công tắc là BẢN SAO. App có 24 tháng dữ liệu, nên "3N" và
// "Tất cả" render y hệt nhau — và còn y hệt tới 08/2027. 27a chốt: công tắc suy từ dữ
// liệu thật (`longScopeOptions`), và mốc thứ ba chỉ hiện khi dữ liệu vượt 36 tháng.
//
// ĐÃ BỎ, mỗi cái một lý do:
//   · dải điều hướng "‹ Năm 2026 ›"      → đá nhau với công tắc phạm vi
//   · thẻ "Thời điểm nếp sống đổi hẳn"    → một dòng chữ, giờ là MỐC vẽ trên biểu đồ
//   · thẻ "Tháng 10 vốn là tháng nặng"    → một dòng chữ về một tháng, giờ là panel 12 cột
//   · thẻ "Lạm phát của riêng bạn"        → đổi tên thành "Rổ quen thuộc" (B14.1)
//   · thẻ "Thu nhập tăng thì chi phình?"  → bỏ hẳn hệ số co giãn (B14.2)
//   · bảng theo năm cắt ở 6 dòng          → in đủ, thêm cột "So mức nền"

import { useMemo, useState } from 'react'
import {
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ExplainBox } from '../../components/ExplainBox'
import { Guide } from '../../components/Guide'
import {
  Card,
  Money,
  Num,
  SegmentedControl,
  StatTile,
  Swap,
  deltaTone,
  signedPct,
  type SegmentedItem,
} from '../../components/ui'
import { ConclusionLine } from '../../components/VerdictNote'
import {
  useAccounts,
  useCategories,
  useProfile,
  useRangeTransactions,
  useRates,
  useTransferCategoryIds,
} from '../../hooks/queries'
import {
  addMonths,
  dayMonthLabel,
  getMonthRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import { remittanceStats, remittanceTiming } from '../remittance/aggregate'
import { categoryBreakdown, monthlySeries } from './aggregate'
import {
  findRegime,
  longScopeOptions,
  longTable,
  monthAverages,
  regimeSplitsComparison,
  remitMonthlyTotals,
  remitStrip,
  type LongScopeKey,
} from './longRange'
import { BASKET_COST_CAVEAT, basketCost, halfPeriodShift, rollingAverage } from './trends'
import { ReportBlock } from './ReportBlock'
import { CHART_TEXT_3XS, CHART_TEXT_XS } from '../../lib/chartText'
import { EmptyState, SectionTitle } from '../../components/ui'

/** Cửa sổ phân tích: 24 tháng là mức tối thiểu để so cùng kỳ (12 + 12). */
const WINDOW = 24
const ROLL = 3

const monthLabel = (k: MonthKey) => `${k.year}/${String(k.month).padStart(2, '0')}`

/** Tỷ lệ 0..1 → "40%" / "−3%". Dấu trừ THẬT, không phải hyphen (§G). */
const pctText = (ratio: number) => {
  const n = Math.round(ratio * 100)
  return n < 0 ? `−${Math.abs(n)}%` : `${n}%`
}
const MONTH_SHORT = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

export function LongView() {
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  const r = rates ?? {}
  const transferIds = useTransferCategoryIds()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base

  const todayISO = toISODate(new Date())
  const anchor = monthKeyForDate(todayISO, monthStartDay)
  const months = useMemo(
    () => Array.from({ length: WINDOW }, (_, i) => addMonths(anchor, i - (WINDOW - 1))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchor.year, anchor.month],
  )
  const range = useMemo(
    () => ({
      start: getMonthRange(months[0], monthStartDay).start,
      end: getMonthRange(anchor, monthStartDay).end,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [months, monthStartDay, anchor.year, anchor.month],
  )
  const { data: txs = [], isFetched } = useRangeTransactions(range, !!profile)

  const series = useMemo(
    () => monthlySeries(txs, months, monthStartDay, currencyOf, base, r, transferIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txs, months, monthStartDay, accounts, base, rates, transferIds],
  )

  // Chỉ tính từ tháng đầu tiên CÓ giao dịch — tháng trống phía trước là "chưa dùng app",
  // không phải "tháng không tiêu gì".
  const active = useMemo(() => {
    const i = series.points.findIndex((p) => p.income > 0 || p.expense > 0)
    return i < 0 ? [] : series.points.slice(i)
  }, [series])
  const dataMonths = active.length

  const regime = useMemo(() => findRegime(active), [active])
  const scopeOptions = useMemo(
    () => longScopeOptions(active, regime?.index ?? null),
    [active, regime],
  )

  const [scope, setScope] = useState<LongScopeKey>('12m')
  // Mốc đang chọn có thể biến mất khi dữ liệu đổi (thêm tháng, cú đổi nếp dịch chỗ) — rơi
  // về mốc đầu thay vì render một phạm vi không còn trong danh sách.
  const activeScope = scopeOptions.find((o) => o.key === scope) ?? scopeOptions[0]
  const scopeMonths = activeScope?.months ?? Math.min(12, dataMonths)

  const table = useMemo(
    () => longTable(active, scopeMonths, regime?.baseline ?? null),
    [active, scopeMonths, regime],
  )
  const splitByRegime = useMemo(
    () => regimeSplitsComparison(active, regime?.index ?? null, scopeMonths),
    [active, regime, scopeMonths],
  )
  const seasonal = useMemo(() => monthAverages(active), [active])

  // Hai nửa kỳ: chỉ lấy phạm vi đang xem × 2 để "nửa trước" đúng là kỳ liền trước.
  const shift = useMemo(() => {
    const win = active.slice(Math.max(0, active.length - scopeMonths * 2))
    return halfPeriodShift(
      win.map((p) => p.income),
      win.map((p) => p.expense),
    )
  }, [active, scopeMonths])

  // Rổ quen thuộc: hai đoạn `scopeMonths` liền nhau, so theo danh mục.
  const basket = useMemo(() => {
    // `scopeMonths <= 0` phải kiểm RIÊNG: lượt render đầu tiên (chưa tải xong) có
    // active.length = 0 VÀ scopeMonths = 0, và `0 < 0` là false — điều kiện dưới một mình
    // sẽ để lọt, rồi `active[0]` là undefined và cả tab trắng màn.
    if (scopeMonths <= 0 || active.length < scopeMonths * 2) return null
    const splitKey = active[active.length - scopeMonths].key
    const splitISO = getMonthRange(splitKey, monthStartDay).start
    const toMap = (list: typeof txs) =>
      new Map(
        categoryBreakdown(list, 'expense', currencyOf, base, r, transferIds).slices.map((s) => [
          s.categoryId,
          s.amount,
        ]),
      )
    return basketCost(
      toMap(txs.filter((t) => t.occurred_on >= splitISO)),
      toMap(txs.filter((t) => t.occurred_on < splitISO)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, active, scopeMonths, monthStartDay, accounts, base, rates, transferIds])

  // Gửi về VN — đọc cờ `is_remittance` trên giao dịch (migration 0013).
  // `remitMonthlyTotals` (longRange.ts) là bước filter/convert/bucket DUY NHẤT cho cả
  // tab này và form Nhập (RemitFields' 12-month strip) — không tự viết lại ở đây nữa,
  // xem chú thích tại định nghĩa của nó về vụ lệch fallback đã xảy ra thật.
  const remit = useMemo(() => {
    const amountOf = remitMonthlyTotals(txs, accounts, base, r, monthStartDay)
    const keys = active.slice(Math.max(0, active.length - scopeMonths)).map((p) => p.key)
    return remitStrip(keys, amountOf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, active, scopeMonths, monthStartDay, accounts, base, rates])

  /**
   * TỶ GIÁ của từng lần gửi — phần mà bản dựng lại gần bỏ mất.
   *
   * `RemittanceSection` cũ (đã xoá cùng bản dựng lại) có một khối "lần gửi được giá nhất /
   * thiệt nhất", và README §R8 ghi rõ nó là lý do khối này thuộc về Dài hạn: so tỷ giá chỉ
   * có nghĩa khi có nhiều lần gửi. Bản vẽ 27a chỉ vẽ dải 12 cột nên khi dựng theo bản vẽ,
   * phần này rơi ra ngoài — mà nó không trùng với bất kỳ con số nào của dải.
   *
   * Không cần nhập tỷ giá thị trường ở đâu cả: số VND người nhận THỰC NHẬN đã là tỷ giá
   * thật. Chỉ những lần gửi có ghi đủ hai đầu (số JPY gửi + số VND nhận) mới vào phép so.
   */
  const remitRate = useMemo(() => {
    const inScope = txs.filter((t) => {
      if (!t.is_remittance) return false
      const k = monthKeyForDate(t.occurred_on, monthStartDay)
      return remit.months.some((m) => m.key.year === k.year && m.key.month === k.month)
    })
    const stats = remittanceStats(inScope)
    const timing = remittanceTiming(inScope, stats.avgRate)
    if (timing.length < 2 || stats.avgRate === null) return null
    const sorted = [...timing].sort((a, b) => b.vsAvgPct - a.vsAvgPct)
    return { stats, best: sorted[0], worst: sorted[sorted.length - 1] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, remit.months, monthStartDay])

  // Biểu đồ LUÔN vẽ cả 24 tháng; phạm vi chỉ quyết định phần nào là "kỳ đang xem".
  const rolling = useMemo(() => rollingAverage(active.map((p) => p.expense), ROLL), [active])
  const chartData = active.map((p, i) => ({
    label: monthLabel(p.key),
    expense: p.expense,
    rolling: rolling[i],
  }))

  const money = (v: number) => formatMoney(Math.round(v), base)
  const avgIncome = dataMonths > 0 ? active.reduce((s, p) => s + p.income, 0) / dataMonths : 0
  const avgExpense = dataMonths > 0 ? active.reduce((s, p) => s + p.expense, 0) / dataMonths : 0
  const keptPct = avgIncome > 0 ? Math.round(((avgIncome - avgExpense) / avgIncome) * 100) : null

  if (!isFetched) {
    return <EmptyState>Đang tải…</EmptyState>
  }
  if (dataMonths === 0) {
    return (
      <EmptyState>
        Chưa có giao dịch nào trong {WINDOW} tháng gần đây.
      </EmptyState>
    )
  }

  const scopeTabs: readonly SegmentedItem<LongScopeKey>[] = scopeOptions.map((o) => ({
    value: o.key,
    label: o.label,
  }))

  // Câu kết luận: cú đổi nếp là chuyện lớn nhất của tab này khi nó có; không có thì nói về
  // mức chi so kỳ trước. KHÔNG đi qua <Guide> — nó là dữ liệu, không phải chữ dạy (§D4).
  const conclusion = regime ? (
    <>
      Mức chi đã đổi nếp một lần vào <b>{monthLabel(regime.key)}</b> và giữ nguyên từ đó —{' '}
      <b>{money(regime.baseline)}</b>/tháng thay cho <b>{money(regime.before)}</b>.
      {table.totalDeltaPct !== null && (
        <>
          {' '}
          {scopeMonths} tháng qua chi{' '}
          <b className={table.totalDeltaPct >= 0 ? 'text-money-out' : 'text-money-in'}>
            {signedPct(Math.round(table.totalDeltaPct))}
          </b>{' '}
          so với {scopeMonths} tháng trước đó
          {splitByRegime && '; phần chênh phần lớn đến từ chính cú đổi nếp đó, không phải từ việc siết dần'}
          .
        </>
      )}
    </>
  ) : table.totalDeltaPct !== null ? (
    <>
      {scopeMonths} tháng qua chi <b>{money(table.total)}</b>,{' '}
      <b className={table.totalDeltaPct >= 0 ? 'text-money-out' : 'text-money-in'}>
        {signedPct(Math.round(table.totalDeltaPct))}
      </b>{' '}
      so với {scopeMonths} tháng trước đó. Chưa có cú đổi nếp nào đủ rõ trong {dataMonths} tháng.
    </>
  ) : (
    <>Có {dataMonths} tháng dữ liệu — chưa đủ 24 tháng để so cùng kỳ năm trước.</>
  )

  return (
    <div className="flex flex-col gap-2.5">
      {series.hasMissingRate && (
        <div className="rounded-lg bg-state-warn-bg p-2 text-sm text-state-warn-fg">
          Một phần giao dịch ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên số liệu có thể
          thiếu.
        </div>
      )}

      {/* Công tắc phạm vi. MỘT mốc thì không vẽ công tắc: một nút không phải công tắc, nó
          chỉ là một cái nhãn giả vờ bấm được. */}
      {scopeTabs.length > 1 && (
        <SegmentedControl
          items={scopeTabs}
          value={activeScope.key}
          onChange={setScope}
          label="Phạm vi"
          stretch="lg"
        />
      )}

      <Num tone="muted" className="text-2xs">
        {monthLabel(active[0].key)} – {monthLabel(active[dataMonths - 1].key)} · {dataMonths} tháng
        có giao dịch
      </Num>

      <ConclusionLine
        tone={regime && regime.changePct !== null && regime.changePct < 0 ? 'good' : 'info'}
        short={
          regime
            ? `Đổi nếp ${monthLabel(regime.key)} · nền ${money(regime.baseline)}`
            : `${scopeMonths} tháng · ${money(table.total)}`
        }
      >
        {conclusion}
      </ConclusionLine>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile label={`Chi ${scopeMonths} tháng`} center>
          <Swap on={table.total}>
            <Money amount={table.total} currency={base} tone="out" compact />
          </Swap>
        </StatTile>
        <StatTile label="Mức nền hiện tại" center>
          <Swap on={regime?.baseline ?? null}>
            {regime ? (
              <Money amount={regime.baseline} currency={base} compact />
            ) : (
              <span className="text-fg-muted">—</span>
            )}
          </Swap>
        </StatTile>
        <StatTile label="Giữ lại trung bình" center>
          <Swap on={keptPct}>{keptPct === null ? '—' : `${keptPct}%`}</Swap>
        </StatTile>
        <StatTile label="Tháng nặng nhất" center>
          <Swap on={seasonal.heaviest?.month ?? null}>
            {seasonal.heaviest ? `Tháng ${seasonal.heaviest.month}` : '—'}
          </Swap>
        </StatTile>
      </div>

      {/* ---------------------------------------------------------------- 01 */}
      <ReportBlock no="01" title="Mức chi đang đi về đâu">
        <Card as="section" elevation="panel" padding="panel">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-2xs text-fg-muted">
              {dataMonths} tháng · <b className="text-fg-secondary">{scopeMonths} tháng gần nhất là kỳ đang xem</b>
            </span>
            {/* Chú giải đặt TRÊN biểu đồ, không ở dưới: ở dưới thì mắt phải rời hình rồi
                quay lại, và trên mobile nó rơi khỏi màn cùng lúc với trục X. */}
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-fg-muted">
              <span className="flex items-center gap-1">
                <span aria-hidden className="h-0.5 w-4 rounded bg-money-out" />
                Trung bình {ROLL} tháng
              </span>
              <span className="flex items-center gap-1">
                <span aria-hidden className="h-px w-4 rounded bg-fg-muted" />
                Từng tháng
              </span>
              {regime && (
                <span className="flex items-center gap-1">
                  <span aria-hidden className="h-px w-4 border-t border-dashed border-fg-warn" />
                  Mức nền {money(regime.baseline)}
                </span>
              )}
            </span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                {/* Nửa trái tô nền tối = "nếp cũ". Vùng, không phải một vạch: cú đổi nếp
                    chia biểu đồ thành hai đoạn có ý nghĩa khác nhau, và một vạch đơn không
                    nói được rằng cả phần bên trái thuộc một nếp sống khác. */}
                {regime && regime.index > 0 && (
                  <ReferenceArea
                    x1={chartData[0].label}
                    x2={chartData[regime.index].label}
                    fill="var(--surface-sunken)"
                    fillOpacity={0.65}
                    label={{ value: 'Nếp cũ', position: 'insideTopLeft', fontSize: CHART_TEXT_3XS, fill: 'var(--fg-muted)' }}
                  />
                )}
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: CHART_TEXT_3XS, fill: 'var(--fg-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(dataMonths / 6) - 1)}
                />
                <YAxis
                  tickFormatter={(v: number) => formatCompact(v, base)}
                  tick={{ fontSize: CHART_TEXT_3XS, fill: 'var(--fg-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  formatter={(v, n) => [
                    formatMoney(Number(v), base),
                    n === 'rolling' ? `Trung bình ${ROLL} tháng` : 'Chi tháng đó',
                  ]}
                  contentStyle={{ borderRadius: 8, fontSize: CHART_TEXT_XS }}
                />
                {regime && (
                  <ReferenceLine
                    y={regime.baseline}
                    stroke="var(--fg-warn)"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                  />
                )}
                {regime && (
                  <ReferenceLine
                    x={chartData[regime.index].label}
                    stroke="var(--fg-warn)"
                    strokeWidth={1.5}
                    label={{
                      value: `Đổi nếp · ${monthLabel(regime.key)}`,
                      position: 'insideTopRight',
                      fontSize: CHART_TEXT_3XS,
                      fill: 'var(--fg-warn)',
                    }}
                  />
                )}
                <Line type="monotone" dataKey="expense" stroke="var(--fg-muted)" strokeWidth={1.5} dot={false} />
                <Line
                  type="monotone"
                  dataKey="rolling"
                  stroke="var(--money-out)"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {regime && (
            <p className="mt-2 text-sm text-fg-secondary">
              Từ {monthLabel(regime.key)} tới nay mức nền là <b>{money(regime.baseline)}</b>/tháng —
              nếp mới đã đứng <b>{regime.monthsSince} tháng</b>.{' '}
              {table.overCount > 0 && (
                <>
                  Trong {scopeMonths} tháng của kỳ, <b>{table.overCount} tháng</b> vượt mức nền.
                </>
              )}
            </p>
          )}
          <ExplainBox label="Cách đọc">
            <p>
              Đọc <b>đường đỏ</b> (trung bình {ROLL} tháng) chứ không đọc đường xám: đường xám
              nhấp nhô vì những lý do vặt của từng tháng, và mắt sẽ bám vào cái nhấp nhô đó.
            </p>
            <p>
              <b>Mức nền</b> là TRUNG VỊ chi kể từ cú đổi nếp, không phải trung bình. Trung bình
              bị một chuyến đi kéo lên, rồi mọi tháng bình thường đều nằm dưới “mức nền” — một
              mốc mà phần lớn dữ liệu nằm dưới thì không còn là mốc.
            </p>
          </ExplainBox>
        </Card>
      </ReportBlock>

      {/* ---------------------------------------------------------------- 02 */}
      <ReportBlock no="02" title="Từng tháng, so với chính tháng đó năm ngoái">
        <Card as="section" elevation="panel" padding="none">
          <div
            role="table"
            aria-label={`Chi từng tháng của ${scopeMonths} tháng gần nhất, so cùng tháng năm trước`}
          >
            <div
              role="row"
              className="grid grid-cols-[minmax(3.5rem,auto)_minmax(0,1fr)_minmax(5.5rem,auto)_minmax(5.5rem,auto)_minmax(4rem,auto)] items-center gap-x-2 border-b border-border-panel bg-surface-chrome px-4 py-2.5 text-2xs uppercase tracking-label text-fg-muted"
            >
              <span role="columnheader">Tháng</span>
              <span role="columnheader" className="min-w-0">
                So mức nền
              </span>
              <span role="columnheader" className="text-right">
                Chi
              </span>
              <span role="columnheader" className="text-right">
                Năm ngoái
              </span>
              <span role="columnheader" className="text-right">
                Δ
              </span>
            </div>
            <ul>
              {table.rows.map((row) => (
                <li
                  key={monthLabel(row.key)}
                  role="row"
                  className="grid grid-cols-[minmax(3.5rem,auto)_minmax(0,1fr)_minmax(5.5rem,auto)_minmax(5.5rem,auto)_minmax(4rem,auto)] items-center gap-x-2 border-b border-border-subtle px-4 py-2 last:border-0"
                >
                  <span role="cell" className="text-sm">
                    <Num tone="muted">{monthLabel(row.key)}</Num>
                  </span>
                  {/* Thanh + VẠCH MỐC ở 100%: thanh một mình chỉ nói "tháng này nhiều hơn
                      tháng kia", còn vạch mốc mới nói "vượt hay chưa vượt nền". */}
                  <span role="cell" className="min-w-0">
                    {row.vsBaseline === null ? (
                      <span className="text-2xs text-fg-muted">chưa có mức nền</span>
                    ) : (
                      <span className="relative block h-2 overflow-hidden rounded-full bg-surface-sunken">
                        <span
                          className={`block h-full rounded-full ${
                            row.overBaseline ? 'bg-money-out' : 'bg-money-in/70'
                          }`}
                          style={{ width: `${Math.min(100, row.vsBaseline * 50)}%` }}
                        />
                        <span
                          aria-hidden
                          className="absolute top-0 h-2 w-0.5 bg-fg-warn"
                          style={{ left: '50%' }}
                        />
                      </span>
                    )}
                  </span>
                  <span role="cell" className="text-right">
                    <Money amount={row.expense} currency={base} className="text-sm" />
                  </span>
                  <span role="cell" className="text-right">
                    {row.yearAgo === null ? (
                      <Num tone="muted" className="text-sm">
                        —
                      </Num>
                    ) : (
                      <Money
                        amount={row.yearAgo}
                        currency={base}
                        className="text-sm text-fg-muted"
                      />
                    )}
                  </span>
                  <span role="cell" className="text-right text-sm">
                    <Num tone={deltaTone(row.deltaPct === null ? null : Math.round(row.deltaPct))}>
                      {signedPct(row.deltaPct === null ? null : Math.round(row.deltaPct))}
                    </Num>
                  </span>
                </li>
              ))}
            </ul>
            <div
              role="row"
              className="grid grid-cols-[minmax(3.5rem,auto)_minmax(0,1fr)_minmax(5.5rem,auto)_minmax(5.5rem,auto)_minmax(4rem,auto)] items-center gap-x-2 bg-surface-chrome px-4 py-2.5"
            >
              <span role="cell" className="text-2xs font-semibold text-fg-secondary">
                {scopeMonths} th
              </span>
              <span role="cell" className="min-w-0 truncate text-2xs text-fg-muted">
                {regime ? `vạch vàng là mức nền ${money(regime.baseline)}` : ''}
              </span>
              <span role="cell" className="text-right">
                <Money
                  amount={table.total}
                  currency={base}
                  tone="out"
                  className="text-sm font-semibold"
                />
              </span>
              <span role="cell" className="text-right">
                {table.yearAgoTotal === null ? (
                  <Num tone="muted" className="text-sm">
                    —
                  </Num>
                ) : (
                  <Money
                    amount={table.yearAgoTotal}
                    currency={base}
                    className="text-sm text-fg-muted"
                  />
                )}
              </span>
              <span role="cell" className="text-right text-sm">
                <Num
                  tone={deltaTone(
                    table.totalDeltaPct === null ? null : Math.round(table.totalDeltaPct),
                  )}
                >
                  {signedPct(
                    table.totalDeltaPct === null ? null : Math.round(table.totalDeltaPct),
                  )}
                </Num>
              </span>
            </div>
          </div>

          {/* CÂU BẮT BUỘC khi cú đổi nếp nằm giữa hai đoạn so sánh. KHÔNG bọc <Guide>:
              thiếu nó thì bảng đọc ra một xu hướng không tồn tại — nửa đầu Δ dương, nửa
              sau Δ âm, và người đọc kết luận "chi đang tăng lại". */}
          {splitByRegime && (
            <p className="border-t border-border-panel px-4 py-2.5 text-2xs text-state-warn-fg">
              Cột Δ đổi dấu ở giữa bảng <b>vì cú đổi nếp {regime && monthLabel(regime.key)} nằm giữa
              hai đoạn</b> đang so, không phải vì chi đang tăng lại. Những tháng “năm ngoái” của
              nửa dưới bảng thuộc nếp cũ.
            </p>
          )}
        </Card>
      </ReportBlock>

      {/* Mùa vụ: 12 cột thay một dòng chữ về một tháng */}
      <Card as="section" elevation="panel" padding="panel">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <SectionTitle as="h3">Tháng nào vốn nặng</SectionTitle>
          <span className="text-2xs text-fg-muted">TB {dataMonths} tháng</span>
        </div>
        <ul className="flex items-end gap-1" aria-hidden>
          {seasonal.months.map((m) => {
            const max = Math.max(...seasonal.months.map((x) => x.avg), 1)
            const heaviest = seasonal.heaviest?.month === m.month
            return (
              <li key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span
                  className={`w-full rounded-t ${
                    m.occurrences === 0
                      ? 'border border-dashed border-border-strong bg-transparent'
                      : heaviest
                        ? 'bg-fg-warn'
                        : 'bg-money-out/45'
                  }`}
                  style={{ height: `${m.occurrences === 0 ? 6 : Math.max(4, (m.avg / max) * 64)}px` }}
                />
                <span className={`text-2xs ${heaviest ? 'text-fg-warn' : 'text-fg-muted'}`}>
                  {MONTH_SHORT[m.month - 1]}
                </span>
              </li>
            )
          })}
        </ul>
        {seasonal.heaviest && seasonal.heaviest.heavierPct !== null ? (
          <p className="mt-2 text-sm text-fg-secondary">
            Tháng {seasonal.heaviest.month} trung bình <b>{money(seasonal.heaviest.avg)}</b>, nặng
            hơn thường lệ{' '}
            <b className="text-money-out">{Math.round(seasonal.heaviest.heavierPct)}%</b> — phần
            vượt {money(seasonal.heaviest.avg - seasonal.overall)}.
            {seasonal.heaviest.occurrences < 2 &&
              ' Mới xuất hiện một lần nên đây chưa phải một nếp mùa vụ.'}
          </p>
        ) : (
          <p className="mt-2 text-sm text-fg-muted">Chưa đủ dữ liệu để nói tháng nào nặng.</p>
        )}
        <Guide className="mt-1.5 text-2xs text-fg-muted">
          Cột viền nét đứt = tháng chưa có dữ liệu, khác hẳn tháng chi 0đ. Một tháng chỉ xuất
          hiện một lần thì đó là một tháng, không phải một nếp.
        </Guide>
      </Card>

      {/* Rổ quen thuộc (B14.1) */}
      <Card as="section" elevation="panel" padding="panel">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <SectionTitle as="h3">
            Rổ quen thuộc tốn bao nhiêu
          </SectionTitle>
          <span className="text-2xs text-fg-muted">
            {scopeMonths} tháng vs {scopeMonths} tháng trước
          </span>
        </div>
        {basket === null ? (
          <p className="text-sm text-fg-muted">
            Cần {scopeMonths * 2} tháng dữ liệu để so hai đoạn bằng nhau; hiện có {dataMonths}.
          </p>
        ) : (
          <>
            <Num
              tone={basket.rate > 0 ? 'out' : 'in'}
              className="text-kpi font-medium tracking-number"
            >
              {signedPct(Math.round(basket.rate * 1000) / 10)}
            </Num>
            <p className="mt-1 text-sm text-fg-secondary">
              Cùng {basket.basketSize} nhóm chi quen thuộc: kỳ này {money(basket.currentTotal)}, kỳ
              trước {money(basket.previousTotal)}. Rổ này chiếm{' '}
              {Math.round(basket.coverage * 100)}% tổng chi kỳ này.
            </p>
            <p className="mt-1.5 text-sm font-medium text-fg-warn">{BASKET_COST_CAVEAT}</p>
          </>
        )}
      </Card>

      {/* ---------------------------------------------------------------- 03 */}
      <ReportBlock no="03" title="Thu và chi đi cùng nhau tới đâu">
        <Card as="section" elevation="panel" padding="panel">
          {shift === null ? (
            <p className="text-sm text-fg-muted">
              Cần ít nhất 4 tháng dữ liệu để chia hai nửa kỳ.
            </p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <SectionTitle as="h3">
                  Thu {shift.incomeChangePct >= 0 ? 'tăng' : 'giảm'}{' '}
                  {Math.abs(Math.round(shift.incomeChangePct))}%, chi{' '}
                  {shift.expenseChangePct >= 0 ? 'tăng' : 'giảm'}{' '}
                  {Math.abs(Math.round(shift.expenseChangePct))}%
                </SectionTitle>
                <span className="text-2xs text-fg-muted">
                  TB tháng · {shift.monthsPerHalf} th vs {shift.monthsPerHalf} th trước
                </span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {(() => {
                  const max = Math.max(
                    shift.incomeBefore,
                    shift.incomeAfter,
                    shift.expenseBefore,
                    shift.expenseAfter,
                    1,
                  )
                  return [
                    { label: 'Thu · nửa trước', v: shift.incomeBefore, tone: 'bg-money-in/40' },
                    { label: 'Thu · nửa sau', v: shift.incomeAfter, tone: 'bg-money-in' },
                    { label: 'Chi · nửa trước', v: shift.expenseBefore, tone: 'bg-money-out/40' },
                    { label: 'Chi · nửa sau', v: shift.expenseAfter, tone: 'bg-money-out' },
                  ].map((b) => (
                    <li
                      key={b.label}
                      className="grid grid-cols-[minmax(0,7rem)_1fr_minmax(5.25rem,auto)] items-center gap-2"
                    >
                      <span className="min-w-0 truncate text-2xs text-fg-muted">{b.label}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                        <span
                          className={`block h-full rounded-full ${b.tone}`}
                          style={{ width: `${(b.v / max) * 100}%` }}
                        />
                      </span>
                      <span className="text-right">
                        <Money amount={b.v} currency={base} className="text-sm" />
                      </span>
                    </li>
                  ))
                })()}
              </ul>
              {shift.keptRateBefore !== null && shift.keptRateAfter !== null && (
                <p className="mt-2.5 text-sm text-fg-primary">
                  Tỷ lệ giữ lại{' '}
                  <b>{shift.keptRateAfter >= shift.keptRateBefore ? 'tăng' : 'giảm'}</b> từ{' '}
                  {/* `pctText`, không phải `${n}%`: tỷ lệ giữ lại ÂM là chuyện thật (chi
                      vượt thu) và `${-3}%` của JS ra "-3%" với dấu hyphen. */}
                  <b>{pctText(shift.keptRateBefore)}</b>{' '}
                  {/* "lên"/"xuống" phải theo chiều: "giảm từ 33% lên 0%" là câu đã in ra
                      thật trên production 09/2026. */}
                  {shift.keptRateAfter >= shift.keptRateBefore ? 'lên' : 'xuống'}{' '}
                  <b>{pctText(shift.keptRateAfter)}</b>.
                </p>
              )}
              {splitByRegime && (
                <p className="mt-2 rounded-lg bg-state-warn-bg px-2 py-1.5 text-2xs text-state-warn-fg">
                  Cả hai đoạn đều bị cú đổi nếp {regime && monthLabel(regime.key)} cắt ngang, nên
                  bốn con số trên nói về <b>hai nếp sống khác nhau</b> — không phải về phản ứng
                  của chi với thu.
                </p>
              )}
              <ExplainBox label="Vì sao không còn hệ số co giãn">
                <p>
                  Bản trước lấy đúng cặp số này rồi kết luận “thu tăng ¥100 thì tiêu thêm ¥91”.
                  Không suy được, hai lý do: dữ liệu là thu <i>giảm</i> nên ngoại suy sang thu{' '}
                  <i>tăng</i> là sai chiều; và trong {dataMonths} tháng chỉ có{' '}
                  {regime ? 'một' : 'không'} lần đổi nếp — một điểm không dựng được hệ số.
                </p>
              </ExplainBox>
            </>
          )}
        </Card>
      </ReportBlock>

      {/* Gửi về VN — khối THẬT, không còn là một dòng chữ nhỏ ngoài mọi thẻ */}
      {remit.sent > 0 && (
        <Card as="section" elevation="panel" padding="panel">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <SectionTitle as="h3">Gửi về VN</SectionTitle>
            <span className="text-2xs text-fg-muted">
              {scopeMonths} tháng · ngoài chi tiêu
            </span>
          </div>
          <Money
            amount={remit.total}
            currency={base}
            className="text-kpi font-medium tracking-number"
          />
          <p className="mt-1 text-sm text-fg-secondary">
            {remit.sent}/{remit.months.length} tháng có gửi
            {avgIncome > 0 && (
              <>
                {' '}
                · {Math.round((remit.total / (avgIncome * remit.months.length)) * 100)}% thu nhập
              </>
            )}
          </p>
          <ul className="mt-2.5 flex items-end gap-1" aria-hidden>
            {remit.months.map((m) => {
              const max = Math.max(...remit.months.map((x) => x.amount), 1)
              return (
                <li key={monthLabel(m.key)} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span
                    className={`w-full rounded-t ${
                      m.skipped
                        ? 'border border-dashed border-border-strong bg-transparent'
                        : m.amount > remit.usual
                          ? 'bg-fg-warn'
                          : 'bg-money-in/60'
                    }`}
                    style={{ height: `${m.skipped ? 6 : Math.max(4, (m.amount / max) * 48)}px` }}
                  />
                  <span className="text-2xs text-fg-muted">{MONTH_SHORT[m.key.month - 1]}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-2xs text-fg-secondary">
            Thường lệ <b>{money(remit.usual)}</b> mỗi tháng
            {remit.skippedMonths.length > 0 && (
              <>
                , bỏ {remit.skippedMonths.map((m) => monthLabel(m.key)).join(', ')}
              </>
            )}
            {remit.unusual.length > 0 && (
              <>
                ; khác mức thường lệ ở{' '}
                {remit.unusual.map((m) => `${monthLabel(m.key)} (${money(m.amount)})`).join(', ')}
              </>
            )}
            .
          </p>
          {/* Tỷ giá: chỉ hiện khi có ĐỦ HAI lần gửi ghi cả số VND nhận. Một lần thì không
              có gì để so, và in "được giá nhất" cho một lần duy nhất là một câu rỗng. */}
          {remitRate !== null && (
            <div className="mt-2.5 border-t border-border-subtle pt-2.5">
              <p className="text-sm text-fg-secondary">
                Tỷ giá thực nhận trung bình{' '}
                <b>
                  <Num>{Math.round(remitRate.stats.avgRate as number).toLocaleString('vi-VN')}</Num> ₫
                </b>{' '}
                mỗi ¥.
              </p>
              <ul className="mt-1 flex flex-col gap-0.5 text-2xs text-fg-muted">
                <li>
                  Được giá nhất: <b>{dayMonthLabel(remitRate.best.date)}</b>{' '}
                  <Num tone="in">{signedPct(Math.round(remitRate.best.vsAvgPct * 10) / 10)}</Num> so
                  trung bình — thêm{' '}
                  <b>{Math.round(remitRate.best.gainVsAvgVnd).toLocaleString('vi-VN')} ₫</b>
                </li>
                <li>
                  Thiệt nhất: <b>{dayMonthLabel(remitRate.worst.date)}</b>{' '}
                  <Num tone="out">{signedPct(Math.round(remitRate.worst.vsAvgPct * 10) / 10)}</Num>{' '}
                  so trung bình
                </li>
              </ul>
            </div>
          )}
          <Guide className="mt-1.5 text-2xs text-fg-muted">
            Đọc theo cờ <b>gửi về VN</b> trên từng giao dịch, nên nó gồm cả lần ghi dạng chuyển
            khoản lẫn lần ghi dạng chi. Con số này KHÔNG nằm trong tổng chi tiêu của các khối
            trên — xem tầng riêng ở tab Tháng này.
            {remitRate === null &&
              ' Phần so tỷ giá cần ít nhất hai lần gửi có ghi số VND người nhận thực nhận.'}
          </Guide>
        </Card>
      )}

      <p className="px-1 pb-2 text-2xs text-fg-muted">
        {dataMonths} tháng có giao dịch · quy đổi ≈ {base}
        {regime && <> · mức nền = trung vị từ {monthLabel(regime.key)}</>}
        {categories.length === 0 && ' · chưa có danh mục nào'}
      </p>
    </div>
  )
}
