// Bốn khối nhỏ của tab "Tháng này" (26a) mà bản trước không có:
//   · OutflowTiersCard  — thu ra theo BA đường (khối 01)
//   · SameDaysCard      — so tháng này với tháng trước, CÙNG SỐ NGÀY (khối 03)
//   · KeptWhereCard     — phần không tiêu đã đi đâu (khối 04)
//   · RemainingCard     — mấy ngày còn lại của kỳ (khối 04)
//   · MoreCountList     — "Mở thêm": danh sách ĐẾM thay bốn thẻ rời (cột phụ)
//
// Gộp vào một file vì cả năm đều nhỏ, đều chỉ bày số đã tính sẵn ở monthReport.ts, và
// đều chỉ có một nơi gọi. Tách năm file là năm lần mở file để đọc một khối 30 dòng.

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Card, Money, Num, deltaTone, signedPct } from '../../components/ui'
import { Guide } from '../../components/Guide'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { dayMonthLabel } from '../../lib/dates'
import type { KeptDestinations, OutflowTier, RemainingPlan, SpendShape } from './monthReport'

function PanelTitle({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
      <h3 className="min-w-0 text-[0.8125rem] font-semibold text-fg-primary">{children}</h3>
      {meta !== undefined && <span className="shrink-0 text-2xs text-fg-muted">{meta}</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------------
// Khối 01 · Ra theo ba đường
// ---------------------------------------------------------------------------------

const TIER_BAR: Record<OutflowTier['key'], string> = {
  expense: 'bg-money-out',
  transfer: 'bg-fg-warn',
  kept: 'bg-money-in',
}

export function OutflowTiersCard({
  tiers,
  income,
  base,
  approx = false,
}: {
  tiers: readonly OutflowTier[]
  income: number
  base: CurrencyCode
  approx?: boolean
}) {
  return (
    <Card as="section" elevation="panel" padding="panel">
      <PanelTitle meta="% thu nhập">Tiền vào ra theo ba đường</PanelTitle>

      {/* MỘT thanh ba khúc, không ba thanh riêng: ba khúc trên một trục nói ngay "cộng lại
          bằng thu", còn ba thanh rời thì mỗi thanh có mẫu số riêng và không cộng được. */}
      {income > 0 && (
        <div
          aria-hidden
          className="mb-3 flex h-2 overflow-hidden rounded-full bg-surface-sunken"
        >
          {tiers.map((t) =>
            t.amount > 0 ? (
              <span
                key={t.key}
                className={TIER_BAR[t.key]}
                style={{ width: `${Math.max(0, (t.amount / income) * 100)}%` }}
              />
            ) : null,
          )}
        </div>
      )}

      <dl className="flex flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-border-subtle pb-2">
          <dt className="text-[0.8125rem] text-fg-secondary">Thu</dt>
          <dd>
            <Money amount={income} currency={base} tone="in" approx={approx} className="text-sm font-semibold" />
          </dd>
        </div>
        {tiers.map((t) => (
          <div
            key={t.key}
            className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-border-subtle py-2 last:border-0 last:pb-0"
          >
            <dt className="flex min-w-0 items-baseline gap-1.5">
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${TIER_BAR[t.key]}`} />
              <span className="text-[0.8125rem] text-fg-primary">{t.label}</span>
              {t.note && <span className="text-2xs text-fg-muted">· {t.note}</span>}
            </dt>
            <dd className="flex shrink-0 items-baseline gap-2">
              <Money
                amount={t.amount}
                currency={base}
                approx={approx}
                className="text-[0.8125rem]"
              />
              <span className="w-9 text-right text-xs">
                <Num tone="muted">{t.pct === null ? '—' : `${t.pct}%`}</Num>
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <Guide className="mt-2 text-2xs text-fg-muted">
        Khoản chuyển tài sản (gửi về VN, điều chỉnh số dư) là <b>tầng riêng</b>, không nằm
        trong chi tiêu và cũng không tính là phần để lại ở Nhật. Ba tầng cộng lại đúng bằng
        thu của kỳ.
      </Guide>
    </Card>
  )
}

// ---------------------------------------------------------------------------------
// Khối 03 · So cùng số ngày
// ---------------------------------------------------------------------------------

export function SameDaysCard({
  days,
  current,
  prior,
  priorFull,
  currentLabel,
  priorLabel,
  base,
}: {
  days: number
  current: SpendShape
  prior: SpendShape
  /** Chi TRỌN tháng trước — chỉ làm ngữ cảnh, KHÔNG phải mẫu số. */
  priorFull: number
  currentLabel: string
  priorLabel: string
  base: CurrencyCode
}) {
  const money = (v: number) => formatMoney(Math.round(v), base)
  const pct = (now: number, before: number) =>
    before > 0 ? Math.round(((now - before) / before) * 100) : null

  const rows: { label: string; before: string; now: string; delta: number | null }[] = [
    {
      label: 'Chi tiêu',
      before: money(prior.total),
      now: money(current.total),
      delta: pct(current.total, prior.total),
    },
    {
      label: 'Biến đổi',
      before: money(prior.variable),
      now: money(current.variable),
      delta: pct(current.variable, prior.variable),
    },
    {
      label: 'Số lần chi',
      before: String(prior.count),
      now: String(current.count),
      delta: pct(current.count, prior.count),
    },
    {
      label: 'Trung vị mỗi lần',
      before: prior.median === null ? '—' : money(prior.median),
      now: current.median === null ? '—' : money(current.median),
      delta:
        current.median !== null && prior.median !== null ? pct(current.median, prior.median) : null,
    },
  ]

  return (
    <Card as="section" elevation="panel" padding="panel">
      <PanelTitle meta={`${days} ngày đầu kỳ`}>So trực tiếp — cùng số ngày</PanelTitle>

      <div
        role="table"
        aria-label={`So ${days} ngày đầu ${currentLabel} với ${days} ngày đầu ${priorLabel}`}
      >
        <div
          role="row"
          className="grid grid-cols-[minmax(0,1fr)_minmax(4.5rem,auto)_minmax(4.5rem,auto)_minmax(3.5rem,auto)] items-baseline gap-x-2 border-b border-border-panel pb-1.5 text-2xs uppercase tracking-[.1em] text-fg-muted"
        >
          <span role="columnheader" />
          <span role="columnheader" className="text-right">
            {priorLabel}
          </span>
          <span role="columnheader" className="text-right">
            {currentLabel}
          </span>
          <span role="columnheader" className="text-right">
            Δ
          </span>
        </div>
        {rows.map((r) => (
          <div
            key={r.label}
            role="row"
            className="grid grid-cols-[minmax(0,1fr)_minmax(4.5rem,auto)_minmax(4.5rem,auto)_minmax(3.5rem,auto)] items-baseline gap-x-2 border-b border-border-subtle py-2 last:border-0"
          >
            <span role="cell" className="min-w-0 truncate text-[0.8125rem] text-fg-secondary">
              {r.label}
            </span>
            <span role="cell" className="text-right text-xs">
              <Num tone="muted">{r.before}</Num>
            </span>
            <span role="cell" className="text-right text-xs">
              <Num>{r.now}</Num>
            </span>
            <span role="cell" className="text-right text-xs">
              <Num tone={deltaTone(r.delta)}>{signedPct(r.delta)}</Num>
            </span>
          </div>
        ))}
      </div>

      {/* Câu này KHÔNG đi qua <Guide>: nó là lý do cả bảng tồn tại. Ở chế độ Gọn mà mất nó
          thì người đọc thấy hai cột số và tự giả định cột trước là CẢ tháng. */}
      <p className="mt-2.5 text-2xs text-fg-secondary">
        Cả {priorLabel} chi <b>{money(priorFull)}</b> — con số đó chỉ để làm ngữ cảnh. Mọi Δ ở
        trên so trên đúng {days} ngày của cả hai kỳ.
      </p>
    </Card>
  )
}

// ---------------------------------------------------------------------------------
// Khối 04 · Phần không tiêu đã đi đâu
// ---------------------------------------------------------------------------------

export function KeptWhereCard({
  data,
  nameOf,
}: {
  data: KeptDestinations
  nameOf: (accountId: string) => string
}) {
  if (data.rows.length === 0) return null
  const liquidShare = (() => {
    // Không tự đoán tài khoản nào là "tiêu dùng": chỉ nói phần LỚN NHẤT chiếm bao nhiêu,
    // và để người đọc nhìn tên. Suy sai loại tài khoản rồi phán "gần một nửa vẫn ở chỗ
    // tiêu" là một câu sai mang giọng chắc chắn.
    const top = data.rows.find((r) => r.pct !== null)
    return top ? { name: nameOf(top.accountId), pct: top.pct as number } : null
  })()

  return (
    <Card as="section" elevation="panel" padding="panel">
      <PanelTitle meta="số dư đổi trong kỳ">Phần không tiêu đã đi đâu</PanelTitle>

      <ul className="flex flex-col">
        {data.rows.map((r) => (
          <li
            key={r.accountId}
            className="grid grid-cols-[minmax(0,1fr)_minmax(6rem,auto)_2.75rem] items-baseline gap-x-2 border-b border-border-subtle py-2 last:border-0 last:pb-0"
          >
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="min-w-0 truncate text-[0.8125rem] text-fg-primary">
                {nameOf(r.accountId)}
              </span>
              {!r.includeInTotals && (
                <span className="shrink-0 text-3xs text-fg-muted">ngoài tổng</span>
              )}
            </span>
            {/* ĐƠN VỊ GỐC, không quy đổi: "+₫4,590,000" nói đúng cái đã xảy ra. Quy đổi chỉ
                dùng để tính phần trăm ở cột bên. */}
            <Money
              amount={r.delta}
              currency={r.currency}
              tone={r.delta >= 0 ? 'in' : 'out'}
              showSign
              className="text-right text-xs"
            />
            <span className="text-right text-xs">
              <Num tone="muted">{r.pct === null ? '—' : `${r.pct}%`}</Num>
            </span>
          </li>
        ))}
      </ul>

      {liquidShare && (
        <p className="mt-2.5 text-2xs text-fg-secondary">
          Phần lớn nhất nằm ở <b>{liquidShare.name}</b> ({liquidShare.pct}% phần tăng).
        </p>
      )}
      <Guide className="mt-1.5 text-2xs text-fg-muted">
        Cộng từ biến động số dư từng tài khoản trong kỳ, không phải từ thu − chi — nên nó
        khớp với cột số dư ở màn Tài sản. Phần trăm tính trên tổng các tài khoản TĂNG; dòng
        giảm in số âm và không có phần trăm.
        {data.hasMissingRate && ' Một phần chưa quy đổi được (đang chờ tỷ giá).'}
      </Guide>
    </Card>
  )
}

// ---------------------------------------------------------------------------------
// Khối 04 · Mấy ngày còn lại
// ---------------------------------------------------------------------------------

export function RemainingCard({ plan, base }: { plan: RemainingPlan; base: CurrencyCode }) {
  const rows = [
    { label: 'Đã cam kết · định kỳ chưa trừ', value: plan.committed, tone: 'out' as const },
    {
      label: `Nhịp dự kiến · ${formatMoney(plan.dailyPace, base)} × ${plan.daysLeft}`,
      value: plan.expected,
      tone: 'out' as const,
    },
  ]
  return (
    <Card as="section" elevation="panel" padding="panel">
      <PanelTitle meta={`hết kỳ ${dayMonthLabel(plan.lastISO)}`}>
        {plan.daysLeft} ngày còn lại
      </PanelTitle>

      <ul className="flex flex-col">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-border-subtle py-2"
          >
            <span className="min-w-0 text-[0.8125rem] text-fg-secondary">{r.label}</span>
            <Money amount={r.value} currency={base} tone={r.tone} className="shrink-0 text-xs" />
          </li>
        ))}
        <li className="flex flex-wrap items-baseline justify-between gap-x-2 pt-2">
          <span className="text-[0.8125rem] font-semibold text-fg-primary">Còn tự do</span>
          <Money
            amount={plan.free}
            currency={base}
            tone={plan.free >= 0 ? 'in' : 'out'}
            className="shrink-0 text-lg font-medium"
          />
        </li>
      </ul>

      <Guide className="mt-2 text-2xs text-fg-muted">
        Nhịp dự kiến suy từ chính kỳ này, nên nếu phần đã trôi có một chuyến đi thì nhịp
        đang bị kéo lên. Con số “còn tự do” là thu đã nhận trừ chi đã tiêu, trừ cam kết và
        trừ nhịp dự kiến — âm nghĩa là theo nhịp này kỳ sẽ hụt.
      </Guide>
    </Card>
  )
}

// ---------------------------------------------------------------------------------
// Cột phụ · "Mở thêm"
// ---------------------------------------------------------------------------------

export interface MoreItem {
  label: string
  /** Con số quyết định của mục đó — mono, canh phải. */
  value: string
  /** Neo trong trang (`#sec-…`) hoặc route. */
  to: string
}

/**
 * Bốn thẻ rời của bản trước rút thành MỘT danh sách đếm.
 *
 * Bốn thẻ đó không thẻ nào là câu người ta mở Báo cáo để hỏi, nhưng cả bốn đều chiếm chiều
 * cao như thẻ chính. Ở dạng danh sách chúng vẫn dẫn tới đúng chỗ mà chỉ tốn bốn dòng.
 */
export function MoreCountList({ items }: { items: readonly MoreItem[] }) {
  if (items.length === 0) return null
  return (
    <Card as="section" elevation="panel" padding="none">
      <h3 className="border-b border-border-panel px-4 py-3 text-[0.8125rem] font-semibold text-fg-primary">
        Mở thêm
      </h3>
      <ul>
        {items.map((m) => (
          <li key={m.label} className="border-b border-border-subtle last:border-0">
            <Link
              to={m.to}
              className="flex min-h-11 items-center gap-2 px-4 py-2 transition hover:bg-surface-sunken"
            >
              <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-fg-secondary">
                {m.label}
              </span>
              <span className="shrink-0 text-xs">
                <Num>{m.value}</Num>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" strokeWidth={1.6} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
