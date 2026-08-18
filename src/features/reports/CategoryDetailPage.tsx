import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { BackLink } from '../../components/BackLink'
import { Card, IconButton, Money } from '../../components/ui'
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
  formatMonthLabel,
  formatYearLabel,
  getMonthRange,
  getYearRange,
  monthKeyForDate,
  monthKeyString,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { categoryMonthlySeries, sumIncomeExpense } from './aggregate'
import { filterCategoryPeriodTxs } from './categoryDetail'
import { CategoryLineChart } from './CategoryLineChart'
import { TransactionItem } from '../transactions/TransactionItem'
import { EditTransactionSheet } from '../transactions/EditTransactionSheet'
import type { TransactionRow } from '../../types/database.types'

type Period = 'month' | 'year'

/** Đọc 'YYYY-MM' thành MonthKey; null nếu không hợp lệ. */
function parseYm(s: string | null): MonthKey | null {
  if (!s) return null
  const [y, m] = s.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return null
  return { year: y, month: m }
}

export function CategoryDetailPage() {
  const { categoryId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const period: Period = searchParams.get('period') === 'year' ? 'year' : 'month'

  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  const transferIds = useTransferCategoryIds()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [], isFetched: catsFetched } = useCategories()

  const category = categories.find((c) => c.id === categoryId)
  const kind: 'expense' | 'income' = category?.type === 'income' ? 'income' : 'expense'

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base

  // Kỳ đang xem (đọc từ URL, thiếu thì lấy hiện tại).
  const activeMonthKey =
    parseYm(searchParams.get('ym')) ?? monthKeyForDate(toISODate(new Date()), monthStartDay)
  const yearParam = Number(searchParams.get('year'))
  const activeYear =
    Number.isFinite(yearParam) && yearParam > 0
      ? yearParam
      : monthKeyForDate(toISODate(new Date()), monthStartDay).year

  // Cửa sổ vẽ đường (rộng) và kỳ hiển thị danh sách (hẹp).
  const windowMonths = useMemo<MonthKey[]>(
    () =>
      period === 'month'
        ? Array.from({ length: 6 }, (_, i) => addMonths(activeMonthKey, i - 5))
        : Array.from({ length: 12 }, (_, i) => ({ year: activeYear, month: i + 1 })),
    [period, activeMonthKey, activeYear],
  )
  const windowRange = useMemo(
    () =>
      period === 'month'
        ? {
            start: getMonthRange(windowMonths[0], monthStartDay).start,
            end: getMonthRange(activeMonthKey, monthStartDay).end,
          }
        : getYearRange(activeYear, monthStartDay),
    [period, windowMonths, activeMonthKey, activeYear, monthStartDay],
  )
  const periodRange = useMemo(
    () =>
      period === 'month'
        ? getMonthRange(activeMonthKey, monthStartDay)
        : getYearRange(activeYear, monthStartDay),
    [period, activeMonthKey, activeYear, monthStartDay],
  )

  const { data: windowTxs = [], isFetched: txsFetched } = useRangeTransactions(
    windowRange,
    !!profile && !!category,
  )

  const trend = useMemo(
    () =>
      categoryMonthlySeries(
        windowTxs,
        windowMonths,
        kind,
        new Set([categoryId]),
        monthStartDay,
        currencyOf,
        base,
        rates ?? {},
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [windowTxs, windowMonths, kind, categoryId, monthStartDay, accounts, base, rates],
  )
  const periodTxs = useMemo(
    () => filterCategoryPeriodTxs(windowTxs, categoryId, kind, periodRange.start, periodRange.end),
    [windowTxs, categoryId, kind, periodRange],
  )
  const sums = useMemo(
    () => sumIncomeExpense(periodTxs, currencyOf, base, rates ?? {}, transferIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodTxs, accounts, base, rates],
  )
  const total = kind === 'expense' ? sums.expense : sums.income
  const missingRate = trend.hasMissingRate || sums.hasMissingRate

  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const accountOf = (id: string | null) => accounts.find((a) => a.id === id)
  const categoryOf = (id: string | null) => categories.find((c) => c.id === id)

  // Gom danh sách theo ngày (đã sắp mới→cũ nên thứ tự ngày giữ nguyên).
  const days = useMemo(() => {
    const map = new Map<string, TransactionRow[]>()
    for (const t of periodTxs) {
      const list = map.get(t.occurred_on) ?? []
      list.push(t)
      map.set(t.occurred_on, list)
    }
    return [...map.entries()]
  }, [periodTxs])

  const stepPeriod = (delta: number) =>
    setSearchParams(
      (prev) => {
        if (period === 'month') {
          prev.set('ym', monthKeyString(addMonths(activeMonthKey, delta)))
        } else {
          prev.set('year', String(activeYear + delta))
        }
        return prev
      },
      { replace: true },
    )

  // Màn này giờ có hai đường vào. Không có `from` thì mặc định về Báo cáo như cũ —
  // vào từ Ngân sách mà bấm Quay lại lại rơi sang tab khác thì coi như lạc.
  const fromBudget = searchParams.get('from') === 'budget'
  const axisParam = searchParams.get('axis')
  const backTo = fromBudget
    ? `/budget?ym=${monthKeyString(activeMonthKey)}` + (axisParam ? `&axis=${axisParam}` : '')
    : `/reports?view=charts&period=${period}&` +
      (period === 'month' ? `ym=${monthKeyString(activeMonthKey)}` : `year=${activeYear}`)

  const lineColor = kind === 'expense' ? '#ef4444' : '#16a34a'
  const labelOf = (k: MonthKey) =>
    period === 'month' ? `${k.year}/${k.month}` : String(k.month)
  const periodLabel =
    period === 'month' ? formatMonthLabel(activeMonthKey) : formatYearLabel(activeYear)

  // Danh mục không tồn tại (link cũ / gõ tay) → báo nhẹ, không để trắng trang.
  if (catsFetched && !category) {
    return (
      <div className="p-3 lg:p-6">
        <BackLink
          to={backTo}
          aria-label="Quay lại"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-fg-accent"
        >
          <ChevronLeft className="h-5 w-5" /> {fromBudget ? 'Về ngân sách' : 'Về báo cáo'}
        </BackLink>
        <p className="py-16 text-center text-sm text-fg-muted">Không tìm thấy danh mục này.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-3 lg:p-6">
      {/* Thanh đầu: quay lại + tên danh mục */}
      <div className="flex items-center gap-2">
        <BackLink to={backTo} aria-label="Quay lại" />
        <h1 className="flex min-w-0 flex-1 items-center gap-2 text-lg font-bold text-fg-primary">
          {category?.icon && <span>{category.icon}</span>}
          <span className="truncate">{category?.name ?? '…'}</span>
        </h1>
      </div>

      {/* Mũi chuyển kỳ + tổng */}
      <Card as="section">
        <div className="flex items-center justify-between">
          <IconButton onClick={() => stepPeriod(-1)} aria-label={period === 'month' ? 'Tháng trước' : 'Năm trước'}>
            <ChevronLeft className="h-5 w-5" />
          </IconButton>
          <span className="text-base font-semibold text-fg-primary">{periodLabel}</span>
          <IconButton onClick={() => stepPeriod(1)} aria-label={period === 'month' ? 'Tháng sau' : 'Năm sau'}>
            <ChevronRight className="h-5 w-5" />
          </IconButton>
        </div>
        <p className="mt-1 text-center">
          <span className="text-xs text-fg-muted">{kind === 'expense' ? 'Đã chi' : 'Đã thu'} · </span>
          <Money
            amount={total}
            currency={base}
            tone={kind === 'expense' ? 'out' : 'in'}
            approx={sums.hasForeign}
            className="text-xl font-bold"
          />
        </p>
      </Card>

      {missingRate && (
        <div className="rounded-lg bg-state-warn-bg text-state-warn-fg p-2 text-xs">
          Một phần giao dịch ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

      {/* Graph xu hướng của riêng danh mục */}
      <Card as="section">
        <CategoryLineChart
          points={trend.points}
          base={base}
          color={lineColor}
          labelOf={labelOf}
          title={period === 'month' ? 'Xu hướng 6 tháng gần nhất' : `Xu hướng 12 tháng ${activeYear}`}
        />
      </Card>

      {/* Danh sách giao dịch trong kỳ */}
      <section>
        <h2 className="mb-2 px-1 text-sm font-semibold text-fg-muted">
          Giao dịch {periodLabel.toLowerCase()}
          {txsFetched && <span className="font-normal"> · {periodTxs.length} khoản</span>}
        </h2>
        {!txsFetched ? (
          <p className="py-10 text-center text-sm text-fg-muted">Đang tải…</p>
        ) : days.length === 0 ? (
          <p className="py-10 text-center text-sm text-fg-muted">
            Không có giao dịch trong {periodLabel.toLowerCase()}.
          </p>
        ) : (
          days.map(([day, txs]) => (
            <section key={day} className="mb-3">
              <div className="mb-1 px-1 text-xs font-medium text-fg-muted">{day}</div>
              <Card padding="none" className="divide-y divide-border-subtle overflow-hidden">
                {txs.map((tx) => (
                  <TransactionItem
                    key={tx.id}
                    tx={tx}
                    categoryOf={categoryOf}
                    accountOf={accountOf}
                    base={base}
                    onClick={() => setEditing(tx)}
                  />
                ))}
              </Card>
            </section>
          ))
        )}
      </section>

      {editing && <EditTransactionSheet tx={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
