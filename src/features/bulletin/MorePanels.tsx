// Các module Bản tin thêm đợt 2026-09-30: Quỹ chung, Sắp chi, Nợ & cho vay, Khoản chi lớn
// nhất, Lịch chi tiêu, Sức khỏe tài chính, Gửi tiền về VN, Ngân sách theo nhãn (vỏ rỗng).
//
// Cùng khuôn với các panel sẵn có (QuyenLoiPanel, BudgetPanel): một thẻ, tiêu đề + một lối
// "Xem →" sang màn gốc, trạng thái rỗng là MỘT câu + một hành động. Mỗi panel là chỗ LIẾC,
// không phải bản sao của màn gốc — muốn đọc kỹ thì bấm sang.
//
// Panel nào cần dữ liệu trang Bản tin CHƯA tải thì tự gọi hook (Nợ, Sức khỏe, Quỹ chung):
// module không nằm trên trang thì không render, nên không ai trả tiền tải cho thứ mình
// không xem. Panel dùng dữ liệu trang ĐÃ có (giao dịch tháng, chi từng ngày) thì nhận qua
// props — không tải lần hai. Toán thuần ở moreModules.ts.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, Money, Num, SectionTitle, Sparkline, StatusChip } from '../../components/ui'
import { EstimateMark } from '../../components/EstimateMark'
import { useDebtPayments, useDebts, useHealthSnapshots, useRates } from '../../hooks/queries'
import { formatMonthLabel, type MonthKey } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase } from '../../lib/rates'
import type { Rates } from '../../lib/rates'
import type { AccountRow, CategoryRow, PlannedExpenseRow, TransactionRow } from '../../types/database.types'
import { tr } from '../../i18n'
import { trn } from '../../i18n/react'
import { debtSummary, remainingOf } from '../debts/aggregate'
import { verdictFromScore } from '../health/health'
import { plannedOutlook, plannedRowStatus } from '../planned/planned'
import { remittanceStats } from '../remittance/aggregate'
import type { DaySpend } from '../reports/dailySpike'
import { monthGrid } from '../recurring/billCalendar'
import { FundAlertLine } from '../sharedFund/FundAlertLine'
import { mineSharePct, total } from '../sharedFund/sharedFund'
import { useSharedFund } from '../sharedFund/useSharedFund'
import { TagBudgetsCard } from '../tags/TagBudgetsCard'
import type { TagBudgetReport } from '../tags/budget'
import { TransactionItem } from '../transactions/TransactionItem'
import { bigExpenses, healthGlance, heatCells, heatSummary, type HeatLevel } from './moreModules'

function Head({ title, to, cta }: { title: string; to: string; cta: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <SectionTitle className="min-w-0">{title}</SectionTitle>
      <Link to={to} className="-my-2 shrink-0 py-2 text-2xs font-medium text-fg-accent hover:underline">
        {cta}
      </Link>
    </div>
  )
}

const Muted = ({ children }: { children: React.ReactNode }) => <p className="mt-3 text-sm text-fg-muted">{children}</p>

// ---- Quỹ chung -------------------------------------------------------------------------

/** Số phần hiện tối đa — chỗ liếc; đủ danh sách ở màn Quỹ chung. */
const FUND_PARTS = 4

export function SharedFundPanel({ monthKey }: { monthKey: MonthKey }) {
  const { fundId, currency, partner, summary, alerts, catName, isPending, isError } = useSharedFund(monthKey)
  const head = <Head title={tr('Quỹ chung · {month}', { month: formatMonthLabel(monthKey) })} to="/quy-chung" cta={tr('Mở Quỹ chung →')} />

  if (!fundId)
    return (
      <Card elevation="panel" padding="panel" as="section" className="min-w-0">
        <Head title={tr('Quỹ chung')} to="/settings" cta={tr('Cài đặt →')} />
        <Muted>{tr('Chưa đặt quỹ chung. Vào Cài đặt, chọn “Hai người” rồi chọn tài khoản quỹ chung.')}</Muted>
      </Card>
    )
  if (isError || isPending || !summary)
    return (
      <Card elevation="panel" padding="panel" as="section" className="min-w-0">
        {head}
        <Muted>{isError ? tr('Không tải được dữ liệu. Thử lại sau.') : tr('Đang tải…')}</Muted>
      </Card>
    )

  const pct = mineSharePct(summary.contributed)
  const parts = summary.parts.slice(0, FUND_PARTS)
  return (
    <Card elevation="panel" padding="panel" as="section" className="min-w-0">
      {head}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-sm text-fg-secondary">
          {trn('Góp {amount}', { amount: <Money amount={total(summary.contributed)} currency={currency} className="font-medium text-fg-primary" /> })}
        </p>
        <p className="text-sm text-fg-secondary">
          {trn('Còn trong quỹ {amount}', {
            amount: (
              <Money
                amount={summary.balance}
                currency={currency}
                tone={summary.balance === 0 ? 'neutral' : 'bySign'}
                className="font-medium"
              />
            ),
          })}
        </p>
      </div>
      {pct !== null && (
        <>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
            <div className="bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 flex justify-between gap-2 text-2xs text-fg-muted">
            <span>
              {tr('Mình')} <Num>{pct}</Num>%
            </span>
            <span>
              {partner} <Num>{100 - pct}</Num>%
            </span>
          </div>
        </>
      )}
      {alerts.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {alerts.slice(0, 2).map((a) => (
            <FundAlertLine key={a.partId} alert={a} name={catName(a.partId)} currency={currency} />
          ))}
        </div>
      )}
      {parts.length === 0 ? (
        <Muted>{tr('Chưa có khoản góp nào.')}</Muted>
      ) : (
        <ul className="mt-2 divide-y divide-border-subtle">
          {parts.map((p) => (
            <li key={p.partId ?? 'none'} className="flex items-baseline justify-between gap-2 py-1.5">
              <span className="min-w-0 truncate text-sm text-fg-secondary">{catName(p.partId)}</span>
              <Money amount={p.balance} currency={currency} tone={p.balance === 0 ? 'neutral' : 'bySign'} className="text-sm" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ---- Sắp chi ---------------------------------------------------------------------------

const PLANNED_ROWS = 5
/** "Từ nay tới hết N tháng nữa" — cùng mốc với đầu trang Sắp chi. */
const PLANNED_MONTHS = 3

export function PlannedPanel({
  rows,
  todayISO,
  base,
  rates,
  pending,
}: {
  rows: readonly PlannedExpenseRow[]
  todayISO: string
  base: CurrencyCode
  rates: Rates
  pending: boolean
}) {
  const open = useMemo(
    () => rows.filter((r) => r.status === 'planned').sort((a, b) => (a.due_on < b.due_on ? -1 : a.due_on > b.due_on ? 1 : 0)),
    [rows],
  )
  const outlook = useMemo(() => plannedOutlook([...rows], todayISO, PLANNED_MONTHS, base, rates), [rows, todayISO, base, rates])
  return (
    <Card elevation="panel" padding="panel" as="section" className="min-w-0">
      <Head title={tr('Sắp chi')} to="/planned" cta={tr('Xem tất cả →')} />
      {pending ? (
        <Muted>{tr('Đang tải…')}</Muted>
      ) : open.length === 0 ? (
        <Muted>
          {tr('Chưa có khoản sắp chi nào.')}{' '}
          <Link to="/planned" className="font-medium text-fg-accent hover:underline">
            {tr('Thêm khoản sắp chi')}
          </Link>
        </Muted>
      ) : (
        <>
          <p className="mt-2 text-sm text-fg-secondary">
            {trn('{n} khoản tới hết {m} tháng nữa · {amount}', {
              n: <Num>{outlook.count}</Num>,
              m: <Num>{PLANNED_MONTHS}</Num>,
              amount: <Money amount={outlook.totalBase} currency={base} className="font-medium text-fg-primary" />,
            })}
            {outlook.hasMissingRate && <EstimateMark reason={tr('Có khoản chưa quy đổi được tỷ giá')} />}
          </p>
          <ul className="mt-1.5 divide-y divide-border-subtle">
            {open.slice(0, PLANNED_ROWS).map((r) => {
              const st = plannedRowStatus(r, todayISO)
              return (
                <li key={r.id} className="flex items-baseline justify-between gap-2 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-fg-primary">{r.title}</span>
                    <span className={`text-2xs ${st.level === 'overdue' ? 'text-money-out' : st.level === 'soon' ? 'text-fg-warn' : 'text-fg-muted'}`}>
                      {st.label}
                    </span>
                  </span>
                  {r.amount > 0 && <Money amount={r.amount} currency={r.currency} className="shrink-0 text-sm" />}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Card>
  )
}

// ---- Nợ & cho vay ----------------------------------------------------------------------

const DEBT_ROWS = 4

export function DebtsPanel() {
  const { data: debts = [], isPending: debtsPending, isError } = useDebts()
  const { data: payments = [], isPending: paymentsPending } = useDebtPayments()
  const { base, rates } = useRates()
  const pending = debtsPending || paymentsPending
  const sum = useMemo(() => debtSummary(debts, payments, base, rates ?? {}), [debts, payments, base, rates])
  const open = useMemo(
    () =>
      debts
        .filter((d) => d.status === 'open')
        .map((d) => {
          const remaining = remainingOf(d, payments)
          return { d, remaining, baseVal: convertToBase(remaining, d.currency, base, rates ?? {}) }
        })
        .filter((x) => x.remaining > 0)
        .sort((a, b) => (b.baseVal ?? 0) - (a.baseVal ?? 0)),
    [debts, payments, base, rates],
  )

  return (
    <Card elevation="panel" padding="panel" as="section" className="min-w-0">
      <Head title={tr('Nợ & cho vay')} to="/debts" cta={tr('Xem tất cả →')} />
      {pending ? (
        <Muted>{isError ? tr('Không tải được dữ liệu. Thử lại sau.') : tr('Đang tải…')}</Muted>
      ) : !sum.hasOpen ? (
        <Muted>{tr('Không có khoản nợ nào đang mở.')}</Muted>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <p className="text-2xs text-fg-muted">{tr('Mình đang nợ')}</p>
              <Money amount={sum.iOwe} currency={base} tone={sum.iOwe ? 'out' : 'neutral'} className="text-base font-medium" />
            </div>
            <div>
              <p className="text-2xs text-fg-muted">{tr('Người khác nợ mình')}</p>
              <Money amount={sum.owedToMe} currency={base} tone={sum.owedToMe ? 'in' : 'neutral'} className="text-base font-medium" />
            </div>
          </div>
          {sum.hasMissingRate && (
            <p className="mt-1 text-2xs text-fg-muted">
              <EstimateMark reason={tr('Có khoản chưa quy đổi được tỷ giá')} /> {tr('Có khoản chưa quy đổi được tỷ giá')}
            </p>
          )}
          <ul className="mt-2 divide-y divide-border-subtle">
            {open.slice(0, DEBT_ROWS).map(({ d, remaining }) => (
              <li key={d.id}>
                <Link to={`/debts/${d.id}`} className="flex items-baseline justify-between gap-2 py-1.5 transition hover:bg-surface-sunken">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-fg-primary">{d.counterparty}</span>
                    <span className="text-2xs text-fg-muted">{d.direction === 'i_owe' ? tr('mình nợ') : tr('nợ mình')}</span>
                  </span>
                  <Money amount={remaining} currency={d.currency} tone={d.direction === 'i_owe' ? 'out' : 'in'} className="shrink-0 text-sm" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

// ---- Khoản chi lớn nhất ----------------------------------------------------------------

const BIG_ROWS = 5

export function BigSpendPanel({
  txs,
  monthKey,
  base,
  rates,
  currencyOf,
  transferIds,
  categoryOf,
  accountOf,
  onPick,
  pending,
  failed,
}: {
  txs: TransactionRow[]
  monthKey: MonthKey
  base: CurrencyCode
  rates: Rates
  currencyOf: (accountId: string) => CurrencyCode
  transferIds: ReadonlySet<string>
  categoryOf: (id: string | null) => CategoryRow | undefined
  accountOf: (id: string | null) => AccountRow | undefined
  onPick: (t: TransactionRow) => void
  pending: boolean
  failed: boolean
}) {
  const { items, hasMissingRate } = useMemo(
    () => bigExpenses(txs, BIG_ROWS, (t) => convertToBase(t.amount, currencyOf(t.account_id), base, rates), transferIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txs, base, rates, transferIds],
  )
  return (
    <Card elevation="panel" padding="panel" as="section" className="min-w-0">
      <Head title={tr('Khoản chi lớn nhất · {month}', { month: formatMonthLabel(monthKey) })} to="/so" cta={tr('Mở Sổ →')} />
      {pending ? (
        <Muted>{failed ? tr('Chưa tải được giao dịch tháng này.') : tr('Đang tải…')}</Muted>
      ) : items.length === 0 ? (
        <Muted>{tr('Tháng này chưa ghi khoản chi nào.')}</Muted>
      ) : (
        <>
          <ul className="mt-1 divide-y divide-border-subtle">
            {items.map(({ tx }) => (
              <li key={tx.id}>
                <TransactionItem tx={tx} categoryOf={categoryOf} accountOf={accountOf} base={base} onClick={() => onPick(tx)} />
              </li>
            ))}
          </ul>
          {hasMissingRate && (
            <p className="mt-1 text-2xs text-fg-muted">{tr('Có khoản chưa quy đổi được tỷ giá — chưa xếp vào danh sách.')}</p>
          )}
        </>
      )}
    </Card>
  )
}

// ---- Lịch chi tiêu (bản đồ nhiệt) -------------------------------------------------------

// Nấc màu: cùng sắc "chi" (money-out) đậm dần — không đổi sắc giữa các nấc, để mắt đọc
// độ đậm như một thang, không phải bốn loại khác nhau.
const HEAT_BG: Record<HeatLevel, string> = {
  0: 'bg-surface-sunken',
  1: 'bg-money-out/20',
  2: 'bg-money-out/40',
  3: 'bg-money-out/65',
  4: 'bg-money-out',
}
const HEAT_WORD: Record<HeatLevel, string> = {
  0: tr('không chi'),
  1: tr('chi ít'),
  2: tr('chi vừa'),
  3: tr('chi nhiều'),
  4: tr('chi rất nhiều'),
}
const WEEKDAYS = [tr('T2'), tr('T3'), tr('T4'), tr('T5'), tr('T6'), tr('T7'), tr('CN')]

export function HeatmapPanel({
  days,
  typical,
  range,
  todayISO,
  monthKey,
  base,
  pending,
  failed,
}: {
  days: readonly DaySpend[]
  typical: number
  range: { start: string; end: string }
  todayISO: string
  monthKey: MonthKey
  base: CurrencyCode
  pending: boolean
  failed: boolean
}) {
  const cells = useMemo(() => heatCells(days, typical, todayISO), [days, typical, todayISO])
  const byDate = useMemo(() => new Map(cells.map((c) => [c.date, c])), [cells])
  const weeks = useMemo(() => monthGrid(range.start, range.end), [range.start, range.end])
  const sum = heatSummary(cells)
  return (
    <Card elevation="panel" padding="panel" as="section" className="min-w-0">
      <Head title={tr('Lịch chi tiêu · {month}', { month: formatMonthLabel(monthKey) })} to="/so" cta={tr('Mở Sổ →')} />
      {pending ? (
        <Muted>{failed ? tr('Chưa tải được giao dịch tháng này.') : tr('Đang tải…')}</Muted>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-7 gap-1" role="grid" aria-label={tr('Lịch chi tiêu')}>
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-center text-2xs text-fg-muted" aria-hidden>
                {w}
              </span>
            ))}
            {weeks.flat().map((iso, i) => {
              const c = iso ? byDate.get(iso) : undefined
              if (!iso || !c) return <span key={`x${i}`} aria-hidden />
              const day = Number(iso.slice(8, 10))
              const label = c.future ? tr('ngày {d} — chưa tới', { d: day }) : tr('ngày {d} — {level}', { d: day, level: HEAT_WORD[c.level] })
              return (
                <span
                  key={iso}
                  role="gridcell"
                  aria-label={label}
                  title={label}
                  className={`flex aspect-square items-center justify-center rounded-sm font-mono text-2xs tabular-nums ${
                    c.future ? 'border border-dashed border-border-panel text-fg-disabled' : `${HEAT_BG[c.level]} ${c.level === 4 ? 'text-fg-inverse' : 'text-fg-primary'}`
                  } ${iso === todayISO ? 'ring-2 ring-accent' : ''}`}
                >
                  {/* Nhãn ngày của lịch, không phải con số tiền/đếm — cùng cách BillCalendarCard
                      in ngày. Không qua <Num>: nó tự đặt màu chữ và đè màu tương phản của ô. */}
                  {day}
                </span>
              )
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-2xs text-fg-muted">
            <span>
              {trn('{a} ngày có chi · {b} ngày không chi', { a: <Num>{sum.spendDays}</Num>, b: <Num>{sum.zeroDays}</Num> })}
            </span>
            <span className="flex items-center gap-1" aria-hidden>
              {tr('ít')}
              {([1, 2, 3, 4] as const).map((l) => (
                <span key={l} className={`size-2.5 rounded-sm ${HEAT_BG[l]}`} />
              ))}
              {tr('nhiều')}
            </span>
          </div>
          {typical > 0 && (
            <p className="mt-1 text-2xs text-fg-muted">
              {trn('Ngày thường {amount} — đậm hơn là chi nhiều hơn mức đó.', { amount: <Money amount={typical} currency={base} /> })}
            </p>
          )}
        </>
      )}
    </Card>
  )
}

// ---- Sức khỏe tài chính -------------------------------------------------------------------

export function HealthPanel() {
  const { data: rows = [], isPending, isError } = useHealthSnapshots()
  const g = useMemo(() => healthGlance(rows), [rows])
  const verdict = g ? verdictFromScore(g.score) : null
  return (
    <Card elevation="panel" padding="panel" as="section" className="min-w-0">
      <Head title={tr('Sức khỏe tài chính')} to="/reports?view=health" cta={tr('Xem chi tiết →')} />
      {isPending ? (
        <Muted>{isError ? tr('Không tải được dữ liệu. Thử lại sau.') : tr('Đang tải…')}</Muted>
      ) : !g || !verdict ? (
        <Muted>
          {tr('Chưa chấm điểm lần nào.')}{' '}
          <Link to="/reports?view=health" className="font-medium text-fg-accent hover:underline">
            {tr('Mở Sức khỏe để chấm')}
          </Link>
        </Muted>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
            <p className="flex items-end gap-1">
              <Num tone="neutral" className="text-kpi font-medium tracking-number">
                {g.score}
              </Num>
              <span className="pb-0.5 text-sm text-fg-muted">/100</span>
            </p>
            <StatusChip tone={verdict === 'unknown' ? 'info' : verdict}>{verdict === 'good' ? tr('Tốt') : verdict === 'warn' ? tr('Cần chú ý') : tr('Rủi ro')}</StatusChip>
            <Sparkline values={g.history} label={tr('Điểm các tháng gần đây')} className="ml-auto" />
          </div>
          <p className="mt-1 text-2xs text-fg-muted">
            {g.delta === null
              ? tr('Chấm tháng {month}.', { month: formatMonthLabel({ year: Number(g.monthOn.slice(0, 4)), month: Number(g.monthOn.slice(5, 7)) }) })
              : g.delta === 0
                ? tr('Bằng lần chấm trước.')
                : trn('{sign}{n} điểm so với lần chấm trước.', { sign: g.delta > 0 ? '+' : '−', n: <Num>{Math.abs(g.delta)}</Num> })}
            {g.coverage < 1 && ` ${tr('Mới chấm được {pct}% chỉ số.', { pct: Math.round(g.coverage * 100) })}`}
          </p>
        </>
      )}
    </Card>
  )
}

// ---- Gửi tiền về VN ------------------------------------------------------------------------

export function RemittancePanel({ txs, pending, failed }: { txs: TransactionRow[]; pending: boolean; failed: boolean }) {
  const st = useMemo(() => remittanceStats(txs), [txs])
  return (
    <Card elevation="panel" padding="panel" as="section" className="min-w-0">
      <Head title={tr('Gửi tiền về VN · 12 tháng')} to="/reports?view=long" cta={tr('Xem chi tiết →')} />
      {pending ? (
        <Muted>{failed ? tr('Không tải được dữ liệu. Thử lại sau.') : tr('Đang tải…')}</Muted>
      ) : st.count === 0 ? (
        <Muted>{tr('12 tháng qua chưa ghi lần gửi tiền về VN nào.')}</Muted>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
          <div>
            <p className="text-2xs text-fg-muted">{tr('Đã gửi ({n} lần)', { n: st.count })}</p>
            <Money amount={st.totalSentJpy} currency="JPY" className="text-base font-medium" />
          </div>
          <div>
            <p className="text-2xs text-fg-muted">{tr('Người nhận nhận')}</p>
            <Money amount={st.totalReceivedVnd} currency="VND" tone="in" className="text-base font-medium" />
          </div>
          <div>
            <p className="text-2xs text-fg-muted">{tr('Tổng phí')}</p>
            <Money amount={st.totalFeeJpy} currency="JPY" tone={st.totalFeeJpy ? 'out' : 'neutral'} className="text-sm" />
          </div>
          <div>
            <p className="text-2xs text-fg-muted">{tr('Tỷ giá trung bình')}</p>
            <p className="text-sm text-fg-primary">
              {st.avgRate === null ? '—' : trn('{rate} ₫/¥', { rate: <Num>{st.avgRate.toFixed(1)}</Num> })}
            </p>
          </div>
        </div>
      )}
    </Card>
  )
}

// ---- Ngân sách theo nhãn --------------------------------------------------------------------

/** TagBudgetsCard tự ẩn khi không có dòng nào — module cần một câu thay vì một ô trống. */
export function TagBudgetsPanel({ data, base }: { data: TagBudgetReport; base: CurrencyCode }) {
  if (data.lines.length > 0) return <TagBudgetsCard data={data} base={base} />
  return (
    <Card elevation="panel" padding="panel" as="section" className="min-w-0">
      <Head title={tr('Ngân sách theo nhãn')} to="/settings/tags" cta={tr('Nhãn →')} />
      <Muted>{tr('Chưa đặt hạn mức cho nhãn nào. Đặt trần cho một chuyến đi hay một dự án ở trang Nhãn.')}</Muted>
    </Card>
  )
}
