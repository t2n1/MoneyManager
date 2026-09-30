// Bốn module "ngoài Bản tin cũ": Sắp tới phải chi, Nợ / cho vay, Mục tiêu tiết kiệm, Gửi
// tiền về nhà. Mỗi panel TỰ tải nguồn của mình qua hooks/queries.ts — nên người chưa thêm
// module nào trong số này không trả thêm một request nào khi mở Bản tin.
//
// Không tự tính số: phần xếp hàng ở boardPanels.ts, phần tính tiền là hàm sẵn có của từng
// mảng (collectCommitments, debtSummary/debtBalance, goalForecast, remittanceStats).
import { useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Upload } from 'lucide-react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, EmptyState, LimitBar, Money, Num, SectionTitle, Select, STATUS_FILL } from '../../components/ui'
import {
  useAccountBalances,
  useAccounts,
  useDebtPayments,
  useDebts,
  usePlannedExpenses,
  useProfile,
  useRates,
  useRecurringRules,
  useSavingsGoals,
} from '../../hooks/queries'
import { CHART_TEXT_2XS, CHART_TEXT_XS } from '../../lib/chartText'
import { addDaysISO, addMonths, dayMonthLabel, monthKeyForDate, toISODate } from '../../lib/dates'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import { usePrivacyMode } from '../../lib/privacy'
import { convertToBase } from '../../lib/rates'
import { accountLabel, numLocale, tr } from '../../i18n'
import { collectCommitments, commitmentDueLabel } from '../budgets/commitments'
import { debtSummary } from '../debts/aggregate'
import { accountMonthlyGrowth, goalForecast, goalSpeedMonths } from '../assets/goals'
import { useAccountCurrentValues } from '../assets/useAccountCurrentValues'
import type { TransactionRow } from '../../types/database.types'
import type { ImportHandoff } from '../import/ImportCsvPage'
import { UPCOMING_DAYS, debtRows, lastEntryByAccount, remittanceMonths, remittanceYear, upcomingRows } from './boardPanels'

/** Trần dòng — Bản tin là chỗ liếc; danh sách đủ nằm ở trang của từng mảng. */
const MAX_ROWS = 7

const LINK = '-my-2 py-2 text-2xs font-medium text-fg-accent hover:underline'

function Head({ title, to, linkText, children }: { title: string; to: string; linkText: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
      <SectionTitle className="min-w-0">{title}</SectionTitle>
      <div className="ml-auto flex items-baseline gap-3">
        {children}
        <Link to={to} className={LINK}>
          {linkText}
        </Link>
      </div>
    </div>
  )
}

const pct = (r: number) => `${Math.round(r * 100).toLocaleString(numLocale())}%`

// ---- Sắp tới phải chi ----------------------------------------------------------------

export function UpcomingPanel({ todayISO }: { todayISO: string }) {
  const { base, rates } = useRates()
  const { data: accounts = [], isSuccess: accountsReady } = useAccounts()
  const { data: rules = [], isSuccess: rulesReady, isError: rulesFailed } = useRecurringRules()
  const { data: planned = [], isSuccess: plannedReady, isError: plannedFailed } = usePlannedExpenses()
  const ready = accountsReady && rulesReady && plannedReady

  const report = useMemo(() => {
    if (!ready) return null
    const r = rates ?? {}
    const currencyOf = (id: string): CurrencyCode => accounts.find((a) => a.id === id)?.currency ?? base
    // Cùng hàm với tab Ngân sách và khối Hôm nay: kỳ đã sinh giao dịch, khoản sắp chi đã
    // ghi hay đã bỏ đều đã được loại sẵn ở đó.
    return collectCommitments(rules, planned, { start: todayISO, end: addDaysISO(todayISO, UPCOMING_DAYS + 1) }, currencyOf, (amount, c) =>
      convertToBase(amount, c, base, r),
    )
  }, [ready, rules, planned, todayISO, accounts, base, rates])

  const rows = report ? upcomingRows(report.items) : []

  return (
    <Card elevation="panel" padding="panel" as="section" className="min-w-0">
      <Head title={tr('Sắp tới phải chi')} to="/recurring" linkText={tr('Định kỳ →')}>
        {report && report.total > 0 && <Money amount={report.total} currency={base} approx={report.hasMissingRate} />}
      </Head>
      <p className="mt-0.5 text-2xs text-fg-muted">{tr('{n} ngày tới · định kỳ và khoản sắp chi', { n: UPCOMING_DAYS })}</p>
      {!report ? (
        <EmptyState compact>{rulesFailed || plannedFailed ? tr('Chưa tải được dữ liệu.') : tr('Đang tải…')}</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState compact>{tr('Không có khoản nào phải chi trong {n} ngày tới.', { n: UPCOMING_DAYS })}</EmptyState>
      ) : (
        <ul className="mt-2 divide-y divide-border-subtle">
          {rows.slice(0, MAX_ROWS).map((c) => (
            <li key={c.key} className="flex items-baseline gap-2 py-2 text-sm">
              <Num tone="muted" className="w-14 shrink-0 text-2xs">
                {commitmentDueLabel(c)}
              </Num>
              <span className="min-w-0 flex-1 truncate text-fg-primary">
                {c.title}
                {c.times > 1 && <span className="text-fg-muted"> ×{c.times}</span>}
              </span>
              {c.unknownAmount ? (
                <span className="text-2xs text-fg-muted">{tr('chưa rõ số')}</span>
              ) : (
                <Money amount={c.amount} currency={base} tone="out" />
              )}
            </li>
          ))}
          {rows.length > MAX_ROWS && (
            <li className="pt-2 text-2xs text-fg-muted">{tr('và {n} khoản nữa', { n: rows.length - MAX_ROWS })}</li>
          )}
        </ul>
      )}
    </Card>
  )
}

// ---- Nợ / cho vay --------------------------------------------------------------------

export function DebtsPanel({ view }: { view: string }) {
  const { base, rates } = useRates()
  const { data: debts = [], isSuccess: debtsReady, isError: debtsFailed } = useDebts()
  const { data: payments = [], isSuccess: paysReady, isError: paysFailed } = useDebtPayments()
  const ready = debtsReady && paysReady
  const rows = useMemo(() => (ready ? debtRows(debts, payments) : []), [ready, debts, payments])
  const sum = useMemo(() => (ready ? debtSummary(debts, payments, base, rates ?? {}) : null), [ready, debts, payments, base, rates])

  return (
    <Card elevation="panel" padding="panel" as="section" className="min-w-0">
      <Head title={tr('Nợ / cho vay')} to="/debts" linkText={tr('Xem tất cả →')} />
      {!sum ? (
        <EmptyState compact>{debtsFailed || paysFailed ? tr('Chưa tải được dữ liệu.') : tr('Đang tải…')}</EmptyState>
      ) : !sum.hasOpen ? (
        <EmptyState compact>{tr('Không còn khoản nợ nào đang mở.')}</EmptyState>
      ) : view === 'summary' ? (
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <dt className="text-2xs text-fg-muted">{tr('Mình còn nợ')}</dt>
            <dd className="text-kpi font-mono tracking-number">
              <Money amount={sum.iOwe} currency={base} tone="out" approx={sum.hasMissingRate} />
            </dd>
          </div>
          <div>
            <dt className="text-2xs text-fg-muted">{tr('Người ta còn nợ mình')}</dt>
            <dd className="text-kpi font-mono tracking-number">
              <Money amount={sum.owedToMe} currency={base} tone="in" approx={sum.hasMissingRate} />
            </dd>
          </div>
          <div className="col-span-2 border-t border-border-subtle pt-2 text-sm">
            <dt className="inline text-fg-muted">{tr('Ròng')} </dt>
            <dd className="inline">
              <Money amount={sum.net} currency={base} tone={sum.net < 0 ? 'out' : 'in'} approx={sum.hasMissingRate} />
            </dd>
          </div>
        </dl>
      ) : (
        <ul className="mt-2 divide-y divide-border-subtle">
          {rows.slice(0, MAX_ROWS).map((d) => (
            <li key={d.id}>
              <Link to={`/debts/${d.id}`} className="block py-2 hover:bg-surface-sunken">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-fg-primary">{d.counterparty}</span>
                  <span className="shrink-0 text-2xs text-fg-muted">
                    {d.direction === 'i_owe' ? tr('mình nợ') : tr('nợ mình')}
                    {d.dueOn && ` · ${tr('hạn {date}', { date: dayMonthLabel(d.dueOn) })}`}
                  </span>
                  <Money amount={d.remaining} currency={d.currency} tone={d.direction === 'i_owe' ? 'out' : 'in'} />
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <LimitBar ratio={d.paidRatio} size="xs" fillClassName={STATUS_FILL.good} className="flex-1" />
                  <Num tone="muted" className="w-10 shrink-0 text-right text-2xs">
                    {pct(d.paidRatio)}
                  </Num>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ---- Mục tiêu tiết kiệm --------------------------------------------------------------

export function GoalsPanel({ txs, txsReady }: { txs: TransactionRow[]; txsReady: boolean }) {
  const { data: goals = [], isSuccess: goalsReady, isError: goalsFailed } = useSavingsGoals()
  const { data: balances = [], isSuccess: balReady } = useAccountBalances()
  const { data: profile } = useProfile()
  const currentValues = useAccountCurrentValues()
  const monthStartDay = profile?.month_start_day ?? 1
  const currentMonth = monthKeyForDate(toISODate(new Date()), monthStartDay)
  // Cùng cửa sổ đo tốc độ với trang Tài sản và tab Quyết định (`goalSpeedMonths`) — ba màn
  // đo ba cửa sổ khác nhau là ba màn nói ba ngày đạt khác nhau cho cùng một mục tiêu.
  const speedMonths = useMemo(() => goalSpeedMonths(currentMonth), [currentMonth.year, currentMonth.month]) // eslint-disable-line react-hooks/exhaustive-deps
  const ready = goalsReady && balReady

  return (
    <Card elevation="panel" padding="panel" as="section" className="min-w-0">
      <Head title={tr('Mục tiêu tiết kiệm')} to="/assets" linkText={tr('Tài sản →')} />
      {!ready ? (
        <EmptyState compact>{goalsFailed ? tr('Chưa tải được dữ liệu.') : tr('Đang tải…')}</EmptyState>
      ) : goals.length === 0 ? (
        <EmptyState compact>{tr('Chưa có mục tiêu nào.')}</EmptyState>
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {goals.slice(0, MAX_ROWS).map((g) => {
            const bal = balances.find((b) => b.id === g.account_id)
            const currency = bal?.currency ?? 'JPY'
            const cv = currentValues.get(g.account_id)
            const f = goalForecast(
              cv?.value ?? bal?.balance ?? 0,
              g.target_amount,
              txsReady ? accountMonthlyGrowth(g.account_id, txs, speedMonths, monthStartDay) : null,
              currentMonth,
              g.target_date,
              monthStartDay,
            )
            const eta = f.done
              ? tr('đã đạt')
              : f.etaMonth
                ? tr('dự kiến {m}/{y}', { m: f.etaMonth.month, y: f.etaMonth.year })
                : txsReady
                  ? tr('chưa tới được theo đà này')
                  : ''
            return (
              <li key={g.id}>
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-fg-primary">{g.name}</span>
                  <Money amount={f.current} currency={currency} />
                  <span className="text-2xs text-fg-muted">/</span>
                  <Money amount={f.target} currency={currency} compact />
                </div>
                <LimitBar
                  ratio={f.ratio}
                  size="sm"
                  className="mt-1.5"
                  fillClassName={f.vsDeadline === 'behind' ? STATUS_FILL.warn : STATUS_FILL.good}
                  warn={f.vsDeadline === 'behind'}
                  label={g.name}
                  valueText={pct(f.ratio)}
                />
                <p className="mt-1 flex justify-between gap-2 text-2xs text-fg-muted">
                  <Num tone="muted">{pct(f.ratio)}</Num>
                  <span className={f.vsDeadline === 'behind' ? 'text-fg-warn' : undefined}>
                    {eta}
                    {f.vsDeadline === 'behind' && ` · ${tr('trễ hạn')}`}
                  </span>
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// ---- Gửi tiền về nhà -----------------------------------------------------------------

const REMIT = 'var(--color-sky-600)'

export function RemittancePanel({
  txs,
  pending,
  failed,
  view,
  monthStartDay,
}: {
  txs: TransactionRow[]
  pending: boolean
  failed: boolean
  view: string
  monthStartDay: number
}) {
  usePrivacyMode()
  const todayISO = toISODate(new Date())
  const current = monthKeyForDate(todayISO, monthStartDay)
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => addMonths(current, i - 11)),
    [current.year, current.month], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const rows = useMemo(() => remittanceMonths(txs, months, monthStartDay), [txs, months, monthStartDay])
  const year = Number(todayISO.slice(0, 4))
  const ys = useMemo(() => remittanceYear(txs, year), [txs, year])

  return (
    <Card elevation="panel" padding="panel" as="section" className="flex h-full min-w-0 flex-col">
      <Head title={tr('Gửi tiền về nhà')} to="/quyen-loi" linkText={tr('Quyền lợi →')} />
      <div className="mt-2 min-h-0 flex-1">
        {pending || failed ? (
          <EmptyState compact>{failed ? tr('Chưa tải được dữ liệu.') : tr('Đang tải…')}</EmptyState>
        ) : rows.every((r) => r.count === 0) && ys.count === 0 ? (
          <EmptyState compact>{tr('Chưa ghi lần gửi tiền nào trong 12 tháng qua.')}</EmptyState>
        ) : view === 'summary' ? (
          <dl className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <dt className="text-2xs text-fg-muted">{tr('Đã gửi năm {y}', { y: year })}</dt>
              <dd className="text-kpi font-mono tracking-number">
                <Money amount={ys.totalSentJpy} currency="JPY" />
              </dd>
            </div>
            <div>
              <dt className="text-2xs text-fg-muted">{tr('Số lần')}</dt>
              <dd className="text-sm">
                <Num>{ys.count.toLocaleString(numLocale())}</Num>
              </dd>
            </div>
            <div>
              <dt className="text-2xs text-fg-muted">{tr('Phí')}</dt>
              <dd className="text-sm">
                <Money amount={ys.totalFeeJpy} currency="JPY" tone="out" />
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-2xs text-fg-muted">{tr('Người nhận đã nhận')}</dt>
              <dd className="text-sm">
                <Money amount={ys.totalReceivedVnd} currency="VND" />
              </dd>
            </div>
          </dl>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: CHART_TEXT_2XS, fill: 'var(--fg-muted)' }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={(v: number) => formatCompact(v, 'JPY')}
                tick={{ fontSize: CHART_TEXT_2XS, fill: 'var(--fg-muted)' }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                formatter={(v, name) => [formatMoney(Number(v), 'JPY'), String(name)]}
                contentStyle={{ borderRadius: 8, fontSize: CHART_TEXT_XS }}
                cursor={{ fill: 'rgba(148,163,184,0.15)' }}
              />
              <Bar dataKey="sent" name={tr('Đã gửi')} fill={REMIT} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}

// ---- Nhập sao kê thẻ -----------------------------------------------------------------

/**
 * Cửa vào NHANH của trang Nhập CSV (/settings/import) — không phải bản thứ hai của nó.
 * Toàn bộ phần khó (nhận dạng sao kê PayPay/Rakuten, Shift-JIS, khử trùng lặp giữa các
 * tháng, gợi ý danh mục theo quán) nằm ở đó; nhét lại vào một ô lưới là hai luồng nhập
 * sớm muộn lệch nhau. Module này chỉ: chọn thẻ, nhận file (bấm chọn hoặc thả vào), rồi
 * chuyển sang trang nhập với file và thẻ đã chọn sẵn.
 *
 * Dòng "đã ghi tới" đọc từ dải giao dịch trang đã tải — nhìn là biết thẻ nào đang thiếu
 * sao kê tháng nào mà không phải mở từng thẻ.
 */
export function CardImportPanel({ txs, txsReady }: { txs: TransactionRow[]; txsReady: boolean }) {
  const navigate = useNavigate()
  const { data: accounts = [], isSuccess: accountsReady } = useAccounts()
  const cards = useMemo(() => accounts.filter((a) => a.type === 'card' && !a.is_archived), [accounts])
  const last = useMemo(() => lastEntryByAccount(txs), [txs])
  const [picked, setPicked] = useState('')
  const [over, setOver] = useState(false)
  const accountId = picked || cards[0]?.id || ''

  const go = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => /\.csv$/i.test(f.name) || f.type === 'text/csv')
    if (files.length === 0) return
    const state: ImportHandoff = { files, accountId: accountId || undefined }
    navigate('/settings/import', { state })
  }
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setOver(false)
    go(e.dataTransfer.files)
  }

  return (
    <Card elevation="panel" padding="panel" as="section" className="min-w-0">
      <Head title={tr('Nhập sao kê thẻ')} to="/settings/import" linkText={tr('Nhập CSV →')} />
      {!accountsReady ? (
        <EmptyState compact>{tr('Đang tải…')}</EmptyState>
      ) : cards.length === 0 ? (
        <EmptyState compact>
          {tr('Chưa có tài khoản thẻ tín dụng nào.')}{' '}
          <Link to="/settings/accounts" className="font-medium text-fg-accent hover:underline">
            {tr('Thêm thẻ')}
          </Link>
        </EmptyState>
      ) : (
        <div className="mt-2 flex flex-col gap-2.5">
          {cards.length > 1 && (
            <Select aria-label={tr('Thẻ nhận sao kê')} value={accountId} onChange={(e) => setPicked(e.target.value)} wrapClassName="w-full">
              {cards.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a.name)}
                </option>
              ))}
            </Select>
          )}
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-5 text-center text-sm transition focus-within:ring-2 focus-within:ring-accent ${
              over ? 'border-accent bg-accent-soft text-fg-accent' : 'border-border-strong text-fg-secondary hover:bg-surface-sunken'
            }`}
          >
            <Upload className="h-5 w-5" aria-hidden />
            <span className="font-medium">{tr('Chọn hoặc thả file CSV sao kê')}</span>
            <span className="text-2xs text-fg-muted">{tr('Rakuten Card, PayPay Card tự nhận dạng · chọn được nhiều tháng')}</span>
            <input type="file" multiple accept=".csv,text/csv" className="sr-only" onChange={(e) => go(e.target.files)} />
          </label>
          <ul className="divide-y divide-border-subtle">
            {cards.map((a) => {
              const d = last.get(a.id)
              return (
                <li key={a.id} className="flex items-baseline gap-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate text-fg-primary">{accountLabel(a.name)}</span>
                  <span className="shrink-0 text-2xs text-fg-muted">
                    {!txsReady ? tr('Đang tải…') : d ? tr('đã ghi tới {date}', { date: dayMonthLabel(d) }) : tr('chưa có giao dịch')}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Card>
  )
}
