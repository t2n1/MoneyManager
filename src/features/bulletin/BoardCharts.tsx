// Các module BIỂU ĐỒ của bảng Bản tin. Mỗi module một câu hỏi, nhiều cách xem cùng một
// dữ liệu — đổi cách xem bằng dải nút ở góc thẻ, lựa chọn nhớ theo từng module (board.ts).
//
// Không tự tính số: nhận hàng đã xếp sẵn từ boardCharts.ts. Thẻ luôn cao đúng bằng ô lưới
// (`h-full`) — người dùng kéo giãn ô thì biểu đồ nở theo.
import type { ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartArea,
  ChartBar,
  ChartColumn,
  ChartLine,
  ChartPie,
  Diff,
  List,
  Percent,
  type LucideIcon,
} from 'lucide-react'
import { Card, EmptyState, Money, Num, SectionTitle, SegmentedControl } from '../../components/ui'
import { CHART_TEXT_2XS, CHART_TEXT_XS } from '../../lib/chartText'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import { usePrivacyMode } from '../../lib/privacy'
import { numLocale, tr } from '../../i18n'
import type { ModuleView } from './board'
import type { CashflowRow, CumulativeRow, NetWorthRow, SliceRow } from './boardCharts'

// Màu biểu đồ: biến palette v4 đi thẳng vào thuộc tính SVG (docs/design-system.md, "Màu
// biểu đồ") — không thêm hex đời v3 vào trần của guardrail.
const INCOME = 'var(--color-green-600)'
const EXPENSE = 'var(--color-red-500)'
const RATE = 'var(--color-sky-600)'
const WORTH = 'var(--color-sky-600)'
const PACE = 'var(--fg-muted)'

const TICK = { fontSize: CHART_TEXT_2XS, fill: 'var(--fg-muted)' }
const TOOLTIP_STYLE = { borderRadius: 8, fontSize: CHART_TEXT_XS }
const CURSOR = { fill: 'rgba(148,163,184,0.15)' }

const ICONS: Record<string, LucideIcon> = {
  bars: ChartColumn,
  hbars: ChartBar,
  line: ChartLine,
  area: ChartArea,
  net: Diff,
  rate: Percent,
  donut: ChartPie,
  list: List,
}

interface FrameProps {
  title: string
  views?: ModuleView[]
  view: string
  onView: (v: string) => void
  /** Có khoản chưa quy đổi được → số chỉ là ước chừng (≈), không bao giờ quy 1:1. */
  approx?: boolean
  pending?: boolean
  failed?: boolean
  /** Có dữ liệu nhưng rỗng — câu nói ra chính trạng thái đó. */
  empty?: string | null
  /** Biểu đồ ngang (thanh) thì icon nằm ngang. */
  horizontalBars?: boolean
  children: ReactNode
}

function ChartFrame({ title, views, view, onView, approx, pending, failed, empty, horizontalBars, children }: FrameProps) {
  return (
    <Card elevation="panel" padding="panel" as="section" className="flex h-full min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <SectionTitle className="min-w-0">
          {title}
          {approx && (
            <span className="ml-1 font-normal text-fg-muted" title={tr('Có khoản chưa quy đổi được — số chỉ là ước chừng')}>
              ≈
            </span>
          )}
        </SectionTitle>
        {views && views.length > 1 && (
          <SegmentedControl
            size="sm"
            stretch={false}
            label={tr('Cách xem {title}', { title })}
            value={view}
            onChange={onView}
            items={views.map((v) => {
              const Icon = ICONS[v.id === 'bars' && horizontalBars ? 'hbars' : v.id] ?? ChartColumn
              return {
                value: v.id,
                label: (
                  <span className="flex items-center justify-center" title={v.label}>
                    <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                    <span className="sr-only">{v.label}</span>
                  </span>
                ),
              }
            })}
          />
        )}
      </div>
      <div className="mt-2 min-h-0 flex-1">
        {pending || failed ? (
          <EmptyState compact>{failed ? tr('Chưa tải được dữ liệu.') : tr('Đang tải…')}</EmptyState>
        ) : empty ? (
          <EmptyState compact>{empty}</EmptyState>
        ) : (
          children
        )}
      </div>
    </Card>
  )
}

interface ChartBase {
  title: string
  views?: ModuleView[]
  view: string
  onView: (v: string) => void
  base: CurrencyCode
  approx?: boolean
  pending?: boolean
  failed?: boolean
}

// Lề trái của mọi biểu đồ ở đây là 0, KHÔNG âm như vài thẻ của Báo cáo: nhãn "7.5万" hay
// "100%" dài hơn "15万", và lề âm cắt mất chữ số đầu — đo được "00%" và ".5万".
const moneyAxis = (base: CurrencyCode) => ({
  tickFormatter: (v: number) => formatCompact(v, base),
  tick: TICK,
  axisLine: false,
  tickLine: false,
  width: 48,
})

const moneyTooltip = (base: CurrencyCode) => ({
  formatter: (v: unknown, name: unknown) => [formatMoney(Number(v), base), String(name)] as [string, string],
  contentStyle: TOOLTIP_STYLE,
  cursor: CURSOR,
})

// ---- Thu & chi theo tháng --------------------------------------------------------------

export function CashflowChart({ rows, ...p }: ChartBase & { rows: CashflowRow[] }) {
  usePrivacyMode()
  const { base, view } = p
  const empty = rows.every((r) => r.income === 0 && r.expense === 0) ? tr('Chưa có thu chi nào trong các tháng này.') : null
  const x = <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} />
  const margin = { top: 8, right: 4, left: 0, bottom: 0 }
  let chart: ReactNode
  if (view === 'line' || view === 'area') {
    const C = view === 'line' ? LineChart : AreaChart
    chart = (
      <C data={rows} margin={margin}>
        {x}
        <YAxis {...moneyAxis(base)} />
        <Tooltip {...moneyTooltip(base)} />
        {view === 'line' ? (
          <>
            <Line type="monotone" dataKey="income" name={tr('Thu')} stroke={INCOME} strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="expense" name={tr('Chi')} stroke={EXPENSE} strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
          </>
        ) : (
          <>
            <Area type="monotone" dataKey="income" name={tr('Thu')} stroke={INCOME} fill={INCOME} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
            <Area type="monotone" dataKey="expense" name={tr('Chi')} stroke={EXPENSE} fill={EXPENSE} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
          </>
        )}
      </C>
    )
  } else if (view === 'net') {
    chart = (
      <BarChart data={rows} margin={margin}>
        {x}
        <YAxis {...moneyAxis(base)} />
        <Tooltip {...moneyTooltip(base)} />
        <ReferenceLine y={0} stroke={PACE} />
        <Bar dataKey="net" name={tr('Thu − chi')} radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {rows.map((r, i) => (
            <Cell key={i} fill={r.net < 0 ? EXPENSE : INCOME} />
          ))}
        </Bar>
      </BarChart>
    )
  } else if (view === 'rate') {
    chart = (
      <LineChart data={rows} margin={margin}>
        {x}
        <YAxis tickFormatter={(v: number) => `${v}%`} tick={TICK} axisLine={false} tickLine={false} width={44} />
        <Tooltip formatter={(v) => [`${Number(v)}%`, tr('Giữ lại')]} contentStyle={TOOLTIP_STYLE} />
        <ReferenceLine y={0} stroke={PACE} strokeDasharray="3 3" />
        {/* Tháng chưa có thu → null: đường ĐỨT ở đó thay vì cắm xuống 0%. */}
        <Line type="monotone" dataKey="rate" name={tr('Giữ lại')} stroke={RATE} strokeWidth={2} dot={{ r: 2.5 }} connectNulls={false} isAnimationActive={false} />
      </LineChart>
    )
  } else {
    chart = (
      <BarChart data={rows} margin={margin}>
        {x}
        <YAxis {...moneyAxis(base)} />
        <Tooltip {...moneyTooltip(base)} />
        <Bar dataKey="income" name={tr('Thu')} fill={INCOME} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="expense" name={tr('Chi')} fill={EXPENSE} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    )
  }
  return (
    <ChartFrame {...p} empty={empty}>
      <ResponsiveContainer width="100%" height="100%">
        {chart}
      </ResponsiveContainer>
    </ChartFrame>
  )
}

// ---- Chi luỹ kế trong tháng ------------------------------------------------------------

export function CumulativeChart({ rows, ...p }: ChartBase & { rows: CumulativeRow[] }) {
  usePrivacyMode()
  const { base, view } = p
  const empty = rows.every((r) => !r.daily) ? tr('Tháng này chưa ghi khoản chi nào.') : null
  const hasPace = rows.some((r) => r.pace !== null)
  const margin = { top: 8, right: 4, left: 0, bottom: 0 }
  const x = <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
  const pace = hasPace && (
    <Line type="linear" dataKey="pace" name={tr('Nhịp hạn mức')} stroke={PACE} strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
  )
  return (
    <ChartFrame {...p} empty={empty}>
      <ResponsiveContainer width="100%" height="100%">
        {view === 'bars' ? (
          <BarChart data={rows} margin={margin}>
            {x}
            <YAxis {...moneyAxis(base)} />
            <Tooltip {...moneyTooltip(base)} />
            <Bar dataKey="daily" name={tr('Chi trong ngày')} fill={EXPENSE} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        ) : (
          <ComposedChart data={rows} margin={margin}>
            {x}
            <YAxis {...moneyAxis(base)} />
            <Tooltip {...moneyTooltip(base)} />
            {view === 'line' ? (
              <Line type="monotone" dataKey="cum" name={tr('Đã chi')} stroke={EXPENSE} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
            ) : (
              <Area type="monotone" dataKey="cum" name={tr('Đã chi')} stroke={EXPENSE} fill={EXPENSE} fillOpacity={0.15} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
            )}
            {pace}
          </ComposedChart>
        )}
      </ResponsiveContainer>
    </ChartFrame>
  )
}

// ---- Tài sản ròng qua các tháng --------------------------------------------------------

export function NetWorthChart({ rows, ...p }: ChartBase & { rows: NetWorthRow[] }) {
  usePrivacyMode()
  const { base, view } = p
  const empty = rows.length === 0 ? tr('Chưa có lần chụp tài sản ròng nào.') : null
  const margin = { top: 8, right: 4, left: 0, bottom: 0 }
  const x = <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} />
  const tip = moneyTooltip(base)
  return (
    <ChartFrame {...p} empty={empty}>
      <ResponsiveContainer width="100%" height="100%">
        {view === 'bars' ? (
          <BarChart data={rows} margin={margin}>
            {x}
            <YAxis {...moneyAxis(base)} />
            <Tooltip {...tip} />
            <Bar dataKey="value" name={tr('Tài sản ròng')} radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {rows.map((r, i) => (
                <Cell key={i} fill={r.value < 0 ? EXPENSE : WORTH} />
              ))}
            </Bar>
          </BarChart>
        ) : view === 'line' ? (
          <LineChart data={rows} margin={margin}>
            {x}
            <YAxis {...moneyAxis(base)} domain={['auto', 'auto']} />
            <Tooltip {...tip} />
            <Line type="monotone" dataKey="value" name={tr('Tài sản ròng')} stroke={WORTH} strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
          </LineChart>
        ) : (
          <AreaChart data={rows} margin={margin}>
            {x}
            <YAxis {...moneyAxis(base)} domain={['auto', 'auto']} />
            <Tooltip {...tip} />
            <Area type="monotone" dataKey="value" name={tr('Tài sản ròng')} stroke={WORTH} fill={WORTH} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </ChartFrame>
  )
}

// ---- Biểu đồ lát: danh mục / cơ cấu tài sản -------------------------------------------

const pctText = (share: number) =>
  `${(share * 100).toLocaleString(numLocale(), { maximumFractionDigits: share < 0.1 ? 1 : 0 })}%`

function Legend({ rows, base, bars }: { rows: SliceRow[]; base: CurrencyCode; bars?: boolean }) {
  const max = Math.max(...rows.map((r) => r.share))
  return (
    <ul className="flex min-w-0 flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.id} className="min-w-0">
          <div className="flex items-baseline gap-2 text-sm">
            {/* Chấm chú giải trỏ vào ĐÚNG màu đã tô cho lát (docs/design-system.md). */}
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-fg-primary">{r.name}</span>
            <Num tone="muted" className="text-2xs">{pctText(r.share)}</Num>
            <Money amount={r.amount} currency={base} />
          </div>
          {bars && (
            <div className="mt-1 ml-4.5 h-1.5 rounded-full" style={{ width: `${(r.share / max) * 100}%`, backgroundColor: r.color }} aria-hidden />
          )}
        </li>
      ))}
    </ul>
  )
}

export function SliceChart({ rows, emptyText, ...p }: ChartBase & { rows: SliceRow[]; emptyText: string }) {
  usePrivacyMode()
  const { base, view } = p
  return (
    <ChartFrame {...p} horizontalBars empty={rows.length === 0 ? emptyText : null}>
      {view === 'donut' ? (
        <div className="flex h-full min-h-0 items-center gap-3">
          <div className="aspect-square h-full max-h-full max-w-1/2 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius="58%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                  isAnimationActive={false}
                  stroke="var(--surface)"
                  strokeWidth={2}
                >
                  {rows.map((r) => (
                    <Cell key={r.id} fill={r.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, name) => [formatMoney(Number(v), base), String(name)]} contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="h-full min-w-0 flex-1 overflow-y-auto py-1">
            <Legend rows={rows} base={base} />
          </div>
        </div>
      ) : (
        <div className="h-full overflow-y-auto">
          <Legend rows={rows} base={base} bars={view === 'bars'} />
        </div>
      )}
    </ChartFrame>
  )
}
