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
  useFxHistory,
  useProfile,
  useRangeTransactions,
  useRecurringRules,
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
import { remitTrueCost, remittanceStats, remittanceTiming } from '../remittance/aggregate'
import { categoryBreakdown, monthlySeries } from './aggregate'
import {
  findRegime,
  halfSpans,
  keptShareOfTotal,
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
import { GiaDoiBacCard } from './GiaDoiBacCard'
import { TripGapCard } from './TripGapCard'
import { CHART_TEXT_3XS, CHART_TEXT_XS } from '../../lib/chartText'
import { EmptyState, SectionTitle } from '../../components/ui'
import { numLocale, tr } from '../../i18n'
import { trn } from '../../i18n/react'

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
  const { data: recurringRules = [] } = useRecurringRules()

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
  // `spans` là hai khoảng tháng THẬT của hai nửa, cắt cùng luật với halfPeriodShift —
  // nhãn phải nói ra chúng, không thì "Tỷ lệ giữ lại tăng từ 20% lên 30%" không nói được
  // là của những tháng nào (và nửa sau có gồm tháng đang dở hay không).
  const { shift, spans } = useMemo(() => {
    const win = active.slice(Math.max(0, active.length - scopeMonths * 2))
    return {
      shift: halfPeriodShift(
        win.map((p) => p.income),
        win.map((p) => p.expense),
      ),
      spans: halfSpans(win.map((p) => p.key)),
    }
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
  const remitTxsInScope = useMemo(
    () =>
      txs.filter((t) => {
        if (!t.is_remittance) return false
        const k = monthKeyForDate(t.occurred_on, monthStartDay)
        return remit.months.some((m) => m.key.year === k.year && m.key.month === k.month)
      }),
    [txs, remit.months, monthStartDay],
  )

  const remitRate = useMemo(() => {
    const stats = remittanceStats(remitTxsInScope)
    const timing = remittanceTiming(remitTxsInScope, stats.avgRate)
    if (timing.length < 2 || stats.avgRate === null) return null
    const sorted = [...timing].sort((a, b) => b.vsAvgPct - a.vsAvgPct)
    return { stats, best: sorted[0], worst: sorted[sorted.length - 1] }
  }, [remitTxsInScope])

  /**
   * Chi phí THẬT của việc chuyển tiền = phí + phần ẩn trong tỷ giá, so với tỷ giá thị
   * trường CÙNG NGÀY từ fx_history (khác remitRate ở trên: kia so với trung bình của
   * chính mình). Chỉ hỏi bảng khi khối Gửi về VN có gì để nói.
   */
  const fxTo = toISODate(new Date())
  const fxFrom = useMemo(() => {
    const first = remit.months[0]?.key
    if (!first) return fxTo
    return `${first.year}-${String(first.month).padStart(2, '0')}-01`
  }, [remit.months, fxTo])
  const { data: fxDays = [] } = useFxHistory(fxFrom, fxTo, remitTxsInScope.length > 0)
  const remitCost = useMemo(() => {
    if (remitTxsInScope.length === 0 || fxDays.length === 0) return null
    const c = remitTrueCost(remitTxsInScope, fxDays)
    return c.items.length > 0 ? c : null
  }, [remitTxsInScope, fxDays])

  // Biểu đồ LUÔN vẽ cả 24 tháng; phạm vi chỉ quyết định phần nào là "kỳ đang xem".
  const rolling = useMemo(() => rollingAverage(active.map((p) => p.expense), ROLL), [active])
  const chartData = active.map((p, i) => ({
    label: monthLabel(p.key),
    expense: p.expense,
    rolling: rolling[i],
  }))

  const money = (v: number) => formatMoney(Math.round(v), base)
  const avgIncome = dataMonths > 0 ? active.reduce((s, p) => s + p.income, 0) / dataMonths : 0
  // Ô "Giữ lại": ĐÚNG phạm vi đang chọn như ô "Chi N tháng" bên cạnh, chỉ tháng đã xong,
  // chia trên TỔNG thu — xem keptShareOfTotal cho ba chỗ bản cũ sai.
  const kept = keptShareOfTotal(active, anchor, scopeMonths)
  const keptRatio = kept?.ratio ?? null

  if (!isFetched) {
    return <EmptyState>{tr('Đang tải…')}</EmptyState>
  }
  if (dataMonths === 0) {
    return (
      <EmptyState>
        {tr('Chưa có giao dịch nào trong {n} tháng gần đây.', { n: WINDOW })}
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
      {trn('Mức chi đã đổi nếp một lần vào {month} và giữ nguyên từ đó — {baseline}/tháng thay cho {before}.', {
        month: <b>{monthLabel(regime.key)}</b>,
        baseline: <b>{money(regime.baseline)}</b>,
        before: <b>{money(regime.before)}</b>,
      })}
      {table.totalDeltaPct !== null &&
        (() => {
          const vars = {
            n: scopeMonths,
            delta: (
              <b className={table.totalDeltaPct >= 0 ? 'text-money-out' : 'text-money-in'}>
                {signedPct(Math.round(table.totalDeltaPct))}
              </b>
            ),
          }
          return (
            <>
              {' '}
              {splitByRegime
                ? trn('{n} tháng qua chi {delta} so với {n} tháng trước đó; phần chênh phần lớn đến từ chính cú đổi nếp đó, không phải từ việc siết dần.', vars)
                : trn('{n} tháng qua chi {delta} so với {n} tháng trước đó.', vars)}
            </>
          )
        })()}
    </>
  ) : table.totalDeltaPct !== null ? (
    trn('{n} tháng qua chi {total}, {delta} so với {n} tháng trước đó. Chưa có cú đổi nếp nào đủ rõ trong {months} tháng.', {
      n: scopeMonths,
      total: <b>{money(table.total)}</b>,
      delta: (
        <b className={table.totalDeltaPct >= 0 ? 'text-money-out' : 'text-money-in'}>
          {signedPct(Math.round(table.totalDeltaPct))}
        </b>
      ),
      months: dataMonths,
    })
  ) : (
    tr('Có {n} tháng dữ liệu — chưa đủ 24 tháng để so cùng kỳ năm trước.', { n: dataMonths })
  )

  return (
    <div className="flex flex-col gap-2.5">
      {/* Thẻ hỏi chuyến đi đứng ĐẦU tab: đây là nơi duy nhất có cả năm giao dịch trong
          tay để dò cả dải cũ, và câu hỏi này quyết định mọi mốc so phía dưới đúng hay
          lệch. Không có dải nào thì component tự trả null — tab y hệt hôm nay. */}
      <TripGapCard txs={txs} windowStartISO={range.start} todayISO={todayISO} />
      {/* Khoản lặp đều đã đổi giá — đứng cạnh thẻ chuyến đi vì cùng loại câu hỏi
          nhiều-tháng; không có bậc nào thì component tự trả null. */}
      <GiaDoiBacCard
        txs={txs}
        rules={recurringRules}
        categories={categories}
        currencyOf={currencyOf}
        base={base}
        rates={r}
      />
      {series.hasMissingRate && (
        <div className="rounded-lg bg-state-warn-bg p-2 text-sm text-state-warn-fg">
          {tr('Một phần giao dịch ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên số liệu có thể thiếu.')}
        </div>
      )}

      {/* Công tắc phạm vi. MỘT mốc thì không vẽ công tắc: một nút không phải công tắc, nó
          chỉ là một cái nhãn giả vờ bấm được. */}
      {scopeTabs.length > 1 && (
        <SegmentedControl
          items={scopeTabs}
          value={activeScope.key}
          onChange={setScope}
          label={tr('Phạm vi')}
          stretch="lg"
        />
      )}

      <Num tone="muted" className="text-2xs">
        {tr('{from} – {to} · {n} tháng có giao dịch', {
          from: monthLabel(active[0].key),
          to: monthLabel(active[dataMonths - 1].key),
          n: dataMonths,
        })}
      </Num>

      <ConclusionLine
        tone={regime && regime.changePct !== null && regime.changePct < 0 ? 'good' : 'info'}
        short={
          regime
            ? tr('Đổi nếp {month} · nền {amount}', { month: monthLabel(regime.key), amount: money(regime.baseline) })
            : tr('{n} tháng · {amount}', { n: scopeMonths, amount: money(table.total) })
        }
      >
        {conclusion}
      </ConclusionLine>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile label={tr('Chi {n} tháng', { n: scopeMonths })} center>
          <Swap on={table.total}>
            <Money amount={table.total} currency={base} tone="out" compact />
          </Swap>
        </StatTile>
        <StatTile label={tr('Mức nền hiện tại')} center>
          <Swap on={regime?.baseline ?? null}>
            {regime ? (
              <Money amount={regime.baseline} currency={base} compact />
            ) : (
              <span className="text-fg-muted">—</span>
            )}
          </Swap>
        </StatTile>
        <StatTile
          label={tr('Giữ lại / tổng thu')}
          note={
            kept
              ? tr('{n} tháng đã xong · {from}–{to}', {
                  n: kept.months,
                  from: monthLabel(kept.from),
                  to: monthLabel(kept.to),
                })
              : tr('chưa có tháng nào xong')
          }
          center
        >
          <Swap on={keptRatio}>{keptRatio === null ? '—' : pctText(keptRatio)}</Swap>
        </StatTile>
        <StatTile label={tr('Tháng nặng nhất')} center>
          <Swap on={seasonal.heaviest?.month ?? null}>
            {seasonal.heaviest ? tr('Tháng {m}', { m: seasonal.heaviest.month }) : '—'}
          </Swap>
        </StatTile>
      </div>

      {/* ---------------------------------------------------------------- 01 */}
      <ReportBlock no="01" title={tr('Mức chi đang đi về đâu')}>
        <Card as="section" elevation="panel" padding="panel">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-2xs text-fg-muted">
              {trn('{n} tháng · {scope}', {
                n: dataMonths,
                scope: <b className="text-fg-secondary">{tr('{n} tháng gần nhất là kỳ đang xem', { n: scopeMonths })}</b>,
              })}
            </span>
            {/* Chú giải đặt TRÊN biểu đồ, không ở dưới: ở dưới thì mắt phải rời hình rồi
                quay lại, và trên mobile nó rơi khỏi màn cùng lúc với trục X. */}
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-fg-muted">
              <span className="flex items-center gap-1">
                <span aria-hidden className="h-0.5 w-4 rounded bg-money-out" />
                {tr('Trung bình {n} tháng', { n: ROLL })}
              </span>
              <span className="flex items-center gap-1">
                <span aria-hidden className="h-px w-4 rounded bg-fg-muted" />
                {tr('Từng tháng')}
              </span>
              {regime && (
                <span className="flex items-center gap-1">
                  <span aria-hidden className="h-px w-4 border-t border-dashed border-fg-warn" />
                  {tr('Mức nền {amount}', { amount: money(regime.baseline) })}
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
                    label={{ value: tr('Nếp cũ'), position: 'insideTopLeft', fontSize: CHART_TEXT_3XS, fill: 'var(--fg-muted)' }}
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
                    n === 'rolling' ? tr('Trung bình {n} tháng', { n: ROLL }) : tr('Chi tháng đó'),
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
                      value: tr('Đổi nếp · {month}', { month: monthLabel(regime.key) }),
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
              {trn('Từ {month} tới nay mức nền là {baseline}/tháng — nếp mới đã đứng {since}.', {
                month: monthLabel(regime.key),
                baseline: <b>{money(regime.baseline)}</b>,
                since: <b>{tr('{n} tháng', { n: regime.monthsSince })}</b>,
              })}{' '}
              {table.overCount > 0 &&
                trn('Trong {n} tháng của kỳ, {over} vượt mức nền.', {
                  n: scopeMonths,
                  over: <b>{tr('{n} tháng', { n: table.overCount })}</b>,
                })}
            </p>
          )}
          <ExplainBox label={tr('Cách đọc')}>
            <p>
              {trn('Đọc {red} (trung bình {n} tháng) chứ không đọc đường xám: đường xám nhấp nhô vì những lý do vặt của từng tháng, và mắt sẽ bám vào cái nhấp nhô đó.', {
                red: <b>{tr('đường đỏ')}</b>,
                n: ROLL,
              })}
            </p>
            <p>
              {trn('{baseline} là TRUNG VỊ chi kể từ cú đổi nếp, không phải trung bình. Trung bình bị một chuyến đi kéo lên, rồi mọi tháng bình thường đều nằm dưới “mức nền” — một mốc mà phần lớn dữ liệu nằm dưới thì không còn là mốc.', {
                baseline: <b>{tr('Mức nền')}</b>,
              })}
            </p>
          </ExplainBox>
        </Card>
      </ReportBlock>

      {/* ---------------------------------------------------------------- 02 */}
      <ReportBlock no="02" title={tr('Từng tháng, so với chính tháng đó năm ngoái')}>
        <Card as="section" elevation="panel" padding="none">
          <div
            role="table"
            aria-label={tr('Chi từng tháng của {n} tháng gần nhất, so cùng tháng năm trước', { n: scopeMonths })}
          >
            <div
              role="row"
              className="grid grid-cols-[minmax(3.5rem,auto)_minmax(0,1fr)_minmax(5.5rem,auto)_minmax(5.5rem,auto)_minmax(4rem,auto)] items-center gap-x-2 border-b border-border-panel bg-surface-chrome px-4 py-2.5 text-2xs uppercase tracking-label text-fg-muted"
            >
              <span role="columnheader">{tr('Tháng')}</span>
              <span role="columnheader" className="min-w-0">
                {tr('So mức nền')}
              </span>
              <span role="columnheader" className="text-right">
                {tr('Chi')}
              </span>
              <span role="columnheader" className="text-right">
                {tr('Năm ngoái')}
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
                      <span className="text-2xs text-fg-muted">{tr('chưa có mức nền')}</span>
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
                {tr('{n} th', { n: scopeMonths })}
              </span>
              <span role="cell" className="min-w-0 truncate text-2xs text-fg-muted">
                {regime ? tr('vạch vàng là mức nền {amount}', { amount: money(regime.baseline) }) : ''}
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
              {trn('Cột Δ đổi dấu ở giữa bảng {why} đang so, không phải vì chi đang tăng lại. Những tháng “năm ngoái” của nửa dưới bảng thuộc nếp cũ.', {
                why: <b>{tr('vì cú đổi nếp {month} nằm giữa hai đoạn', { month: regime ? monthLabel(regime.key) : '' })}</b>,
              })}
            </p>
          )}
        </Card>
      </ReportBlock>

      {/* Mùa vụ: 12 cột thay một dòng chữ về một tháng */}
      <Card as="section" elevation="panel" padding="panel">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <SectionTitle as="h3">{tr('Tháng nào vốn nặng')}</SectionTitle>
          <span className="text-2xs text-fg-muted">{tr('TB {n} tháng', { n: dataMonths })}</span>
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
            {trn('Tháng {m} trung bình {avg}, nặng hơn thường lệ {pct} — phần vượt {excess}.', {
              m: seasonal.heaviest.month,
              avg: <b>{money(seasonal.heaviest.avg)}</b>,
              pct: <b className="text-money-out">{Math.round(seasonal.heaviest.heavierPct)}%</b>,
              excess: money(seasonal.heaviest.avg - seasonal.overall),
            })}
            {seasonal.heaviest.occurrences < 2 &&
              tr(' Mới xuất hiện một lần nên đây chưa phải một nếp mùa vụ.')}
          </p>
        ) : (
          <p className="mt-2 text-sm text-fg-muted">{tr('Chưa đủ dữ liệu để nói tháng nào nặng.')}</p>
        )}
        <Guide className="mt-1.5 text-2xs text-fg-muted">
          {tr('Cột viền nét đứt = tháng chưa có dữ liệu, khác hẳn tháng chi 0đ. Một tháng chỉ xuất hiện một lần thì đó là một tháng, không phải một nếp.')}
        </Guide>
      </Card>

      {/* Rổ quen thuộc (B14.1) */}
      <Card as="section" elevation="panel" padding="panel">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <SectionTitle as="h3">
            {tr('Rổ quen thuộc tốn bao nhiêu')}
          </SectionTitle>
          <span className="text-2xs text-fg-muted">
            {tr('{n} tháng vs {n} tháng trước', { n: scopeMonths })}
          </span>
        </div>
        {basket === null ? (
          <p className="text-sm text-fg-muted">
            {tr('Cần {need} tháng dữ liệu để so hai đoạn bằng nhau; hiện có {have}.', {
              need: scopeMonths * 2,
              have: dataMonths,
            })}
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
              {tr('Cùng {n} nhóm chi quen thuộc: kỳ này {current}, kỳ trước {previous}. Rổ này chiếm {pct}% tổng chi kỳ này.', {
                n: basket.basketSize,
                current: money(basket.currentTotal),
                previous: money(basket.previousTotal),
                pct: Math.round(basket.coverage * 100),
              })}
            </p>
            <p className="mt-1.5 text-sm font-medium text-fg-warn">{BASKET_COST_CAVEAT}</p>
          </>
        )}
      </Card>

      {/* ---------------------------------------------------------------- 03 */}
      <ReportBlock no="03" title={tr('Thu và chi đi cùng nhau tới đâu')}>
        <Card as="section" elevation="panel" padding="panel">
          {shift === null ? (
            <p className="text-sm text-fg-muted">
              {tr('Cần ít nhất 4 tháng dữ liệu để chia hai nửa kỳ.')}
            </p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <SectionTitle as="h3">
                  {tr('Thu {incomeDir} {income}%, chi {expenseDir} {expense}%', {
                    incomeDir: shift.incomeChangePct >= 0 ? tr('tăng') : tr('giảm'),
                    income: Math.abs(Math.round(shift.incomeChangePct)),
                    expenseDir: shift.expenseChangePct >= 0 ? tr('tăng') : tr('giảm'),
                    expense: Math.abs(Math.round(shift.expenseChangePct)),
                  })}
                </SectionTitle>
                <span className="text-2xs text-fg-muted">
                  {tr('TB tháng')} ·{' '}
                  {spans
                    ? tr('nửa trước {beforeFrom}–{beforeTo} · nửa sau {afterFrom}–{afterTo}', {
                        beforeFrom: monthLabel(spans.before.from),
                        beforeTo: monthLabel(spans.before.to),
                        afterFrom: monthLabel(spans.after.from),
                        afterTo: monthLabel(spans.after.to),
                      })
                    : tr('{n} th vs {n} th trước', { n: shift.monthsPerHalf })}
                  {/* Nửa sau luôn kết thúc ở tháng NÀY — đang dở thì nói ra, không thì chi
                      của nó trông thấp giả và tỷ lệ giữ lại nửa sau phồng lên. */}
                  {spans &&
                    spans.after.to.year === anchor.year &&
                    spans.after.to.month === anchor.month &&
                    tr(' (tháng này chưa hết)')}
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
                    { label: tr('Thu · nửa trước'), v: shift.incomeBefore, tone: 'bg-money-in/40' },
                    { label: tr('Thu · nửa sau'), v: shift.incomeAfter, tone: 'bg-money-in' },
                    { label: tr('Chi · nửa trước'), v: shift.expenseBefore, tone: 'bg-money-out/40' },
                    { label: tr('Chi · nửa sau'), v: shift.expenseAfter, tone: 'bg-money-out' },
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
                  {/* Kỳ tính nói ra ngay trong câu: hai tỷ lệ này là trên TỔNG thu của từng
                      nửa (khoảng tháng in ở góc phải), không phải của tháng này. */}
                  {/* `pctText`, không phải `${n}%`: tỷ lệ giữ lại ÂM là chuyện thật (chi
                      vượt thu) và `${-3}%` của JS ra "-3%" với dấu hyphen.
                      "lên"/"xuống" phải theo chiều: "giảm từ 33% lên 0%" là câu đã in ra
                      thật trên production 09/2026. */}
                  {shift.keptRateAfter >= shift.keptRateBefore
                    ? trn('Tỷ lệ giữ lại (trên tổng thu mỗi nửa) {dir} từ {before} ở nửa trước lên {after} ở nửa sau.', {
                        dir: <b>{tr('tăng')}</b>,
                        before: <b>{pctText(shift.keptRateBefore)}</b>,
                        after: <b>{pctText(shift.keptRateAfter)}</b>,
                      })
                    : trn('Tỷ lệ giữ lại (trên tổng thu mỗi nửa) {dir} từ {before} ở nửa trước xuống {after} ở nửa sau.', {
                        dir: <b>{tr('giảm')}</b>,
                        before: <b>{pctText(shift.keptRateBefore)}</b>,
                        after: <b>{pctText(shift.keptRateAfter)}</b>,
                      })}
                </p>
              )}
              {splitByRegime && (
                <p className="mt-2 rounded-lg bg-state-warn-bg px-2 py-1.5 text-2xs text-state-warn-fg">
                  {trn('Cả hai đoạn đều bị cú đổi nếp {month} cắt ngang, nên bốn con số trên nói về {two} — không phải về phản ứng của chi với thu.', {
                    month: regime ? monthLabel(regime.key) : '',
                    two: <b>{tr('hai nếp sống khác nhau')}</b>,
                  })}
                </p>
              )}
              <ExplainBox label={tr('Vì sao không còn hệ số co giãn')}>
                <p>
                  {(() => {
                    const vars = { down: <i>{tr('giảm')}</i>, up: <i>{tr('tăng')}</i>, n: dataMonths }
                    return regime
                      ? trn('Bản trước lấy đúng cặp số này rồi kết luận “thu tăng ¥100 thì tiêu thêm ¥91”. Không suy được, hai lý do: dữ liệu là thu {down} nên ngoại suy sang thu {up} là sai chiều; và trong {n} tháng chỉ có một lần đổi nếp — một điểm không dựng được hệ số.', vars)
                      : trn('Bản trước lấy đúng cặp số này rồi kết luận “thu tăng ¥100 thì tiêu thêm ¥91”. Không suy được, hai lý do: dữ liệu là thu {down} nên ngoại suy sang thu {up} là sai chiều; và trong {n} tháng chỉ có không lần đổi nếp — một điểm không dựng được hệ số.', vars)
                  })()}
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
            <SectionTitle as="h3">{tr('Gửi về VN')}</SectionTitle>
            <span className="text-2xs text-fg-muted">
              {tr('{n} tháng · ngoài chi tiêu', { n: scopeMonths })}
            </span>
          </div>
          <Money
            amount={remit.total}
            currency={base}
            className="text-kpi font-medium tracking-number"
          />
          <p className="mt-1 text-sm text-fg-secondary">
            {tr('{sent}/{total} tháng có gửi', { sent: remit.sent, total: remit.months.length })}
            {avgIncome > 0 &&
              tr(' · {pct}% thu nhập', { pct: Math.round((remit.total / (avgIncome * remit.months.length)) * 100) })}
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
            {trn('Thường lệ {amount} mỗi tháng', { amount: <b>{money(remit.usual)}</b> })}
            {remit.skippedMonths.length > 0 &&
              tr(', bỏ {months}', { months: remit.skippedMonths.map((m) => monthLabel(m.key)).join(', ') })}
            {remit.unusual.length > 0 &&
              tr('; khác mức thường lệ ở {months}', {
                months: remit.unusual.map((m) => `${monthLabel(m.key)} (${money(m.amount)})`).join(', '),
              })}
            .
          </p>
          {/* Tỷ giá: chỉ hiện khi có ĐỦ HAI lần gửi ghi cả số VND nhận. Một lần thì không
              có gì để so, và in "được giá nhất" cho một lần duy nhất là một câu rỗng. */}
          {remitRate !== null && (
            <div className="mt-2.5 border-t border-border-subtle pt-2.5">
              <p className="text-sm text-fg-secondary">
                {trn('Tỷ giá thực nhận trung bình {rate} mỗi ¥.', {
                  rate: (
                    <b>
                      <Num>{Math.round(remitRate.stats.avgRate as number).toLocaleString(numLocale())}</Num> ₫
                    </b>
                  ),
                })}
              </p>
              <ul className="mt-1 flex flex-col gap-0.5 text-2xs text-fg-muted">
                <li>
                  {trn('Được giá nhất: {date} {pct} so trung bình — thêm {gain}', {
                    date: <b>{dayMonthLabel(remitRate.best.date)}</b>,
                    pct: <Num tone="in">{signedPct(Math.round(remitRate.best.vsAvgPct * 10) / 10)}</Num>,
                    gain: <b>{Math.round(remitRate.best.gainVsAvgVnd).toLocaleString(numLocale())} ₫</b>,
                  })}
                </li>
                <li>
                  {trn('Thiệt nhất: {date} {pct} so trung bình', {
                    date: <b>{dayMonthLabel(remitRate.worst.date)}</b>,
                    pct: <Num tone="out">{signedPct(Math.round(remitRate.worst.vsAvgPct * 10) / 10)}</Num>,
                  })}
                </li>
              </ul>
            </div>
          )}
          {/* Chi phí thật — phí niêm yết chỉ là phần nhìn thấy; phần ẩn nằm ở khoảng
              cách giữa tỷ giá được áp và tỷ giá thị trường cùng ngày (Chặng 14 của giáo
              trình đã đối chiếu). Ba dòng số, không phải đoạn văn. */}
          {remitCost !== null && (
            <div className="mt-2.5 border-t border-border-subtle pt-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-fg-secondary">
                  {trn('Chi phí thật ({count} tính được)', {
                    count: <Num>{tr('{n} lần', { n: remitCost.items.length })}</Num>,
                  })}
                </span>
                <span className="text-sm font-medium">
                  <Money amount={remitCost.totalCostJpy} currency={base} tone="out" />{' '}
                  {remitCost.totalSentJpy > 0 && (
                    <Num tone="muted">
                      · {signedPct(Math.round((remitCost.totalCostJpy / remitCost.totalSentJpy) * 1000) / 10)}
                    </Num>
                  )}
                </span>
              </div>
              <ul className="mt-1 flex flex-col gap-0.5 text-2xs text-fg-muted">
                <li className="flex items-baseline justify-between gap-2">
                  <span>{tr('Phí niêm yết')}</span>
                  <Money amount={remitCost.totalFeeJpy} currency={base} tone="muted" />
                </li>
                <li className="flex items-baseline justify-between gap-2">
                  <span>
                    {remitCost.totalFxLossJpy >= 0
                      ? tr('Ẩn trong tỷ giá (so thị trường cùng ngày)')
                      : tr('Được giá hơn thị trường cùng ngày')}
                  </span>
                  {/* Money.showSign đòi số DƯƠNG, chiều nằm ở tone (xem Money.tsx) —
                      truyền số có dấu vào đây là dấu bị lật. */}
                  <Money
                    amount={Math.abs(remitCost.totalFxLossJpy)}
                    currency={base}
                    tone={remitCost.totalFxLossJpy >= 0 ? 'out' : 'in'}
                    showSign
                  />
                </li>
              </ul>
            </div>
          )}
          <Guide className="mt-1.5 text-2xs text-fg-muted">
            {trn('Đọc theo cờ {flag} trên từng giao dịch, nên nó gồm cả lần ghi dạng chuyển khoản lẫn lần ghi dạng chi. Con số này KHÔNG nằm trong tổng chi tiêu của các khối trên — xem tầng riêng ở tab Tháng này.', {
              flag: <b>{tr('gửi về VN')}</b>,
            })}
            {remitRate === null &&
              tr(' Phần so tỷ giá cần ít nhất hai lần gửi có ghi số VND người nhận thực nhận.')}
            {remitCost !== null && (
              <>
                {' '}
                {tr('Chi phí thật so với tỷ giá thị trường app tự ghi mỗi phiên (có từ cuối 07/2026); số ẩn ÂM nghĩa là lần đó đổi được giá hơn thị trường.')}
              </>
            )}
          </Guide>
          {/* NGOÀI <Guide>, cùng lý do với KeptWhereCard: "Chi phí thật" ở trên đang thiếu
              đúng những lần này, và chế độ Gọn (mặc định) ẩn Guide. */}
          {remitCost !== null && remitCost.missingRateCount > 0 && (
            <p className="mt-1.5 text-2xs text-state-warn-fg">
              {trn('{count} cũ hơn lịch sử tỷ giá nên chưa tính vào chi phí thật.', {
                count: <Num tone="warn">{tr('{n} lần gửi', { n: remitCost.missingRateCount })}</Num>,
              })}
            </p>
          )}
        </Card>
      )}

      {/* E-ink + Gọn: bỏ ghi chú phương pháp, chỉ giữ cảnh báo thiếu danh mục. */}
      {categories.length === 0 && (
        <p className="hidden px-1 pb-2 text-2xs text-fg-secondary eink-gon:block">
          {tr('Chưa có danh mục nào')}
        </p>
      )}
      <p className="px-1 pb-2 text-2xs text-fg-muted eink-gon:hidden">
        {tr('{n} tháng có giao dịch · quy đổi ≈ {base}', { n: dataMonths, base })}
        {regime && tr(' · mức nền = trung vị từ {month}', { month: monthLabel(regime.key) })}
        {categories.length === 0 && tr(' · chưa có danh mục nào')}
      </p>
    </div>
  )
}
