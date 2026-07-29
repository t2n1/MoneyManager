import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  useAccounts,
  useBudgetReport,
  useBudgets,
  useCategories,
  useCopyBudgetsFromPreviousMonth,
  useMonthTransactions,
  useProfile,
  useRates,
} from '../../hooks/queries'
import { monthKeyString, type MonthKey } from '../../lib/dates'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import {
  categoryBreakdown,
  classificationBreakdown,
  foldUncategorized,
  sumIncomeExpense,
} from '../reports/aggregate'
import { showToast } from '../../lib/dialog'
import { BudgetEditSheet } from './BudgetEditSheet'
import { buildBudgetDisplay, type BudgetChildRow } from './budgetDisplay'
import type { BudgetStatus } from './progress'
import { MonthPaceCharts, SpendPaceSection, useMonthPace } from '../reports/monthPace'
import { axisProgress } from './axisTargets'
import { AxisTargetsCard } from './AxisTargetsCard'

const BAR_COLOR: Record<BudgetStatus, string> = {
  ok: 'bg-green-500',
  warn: 'bg-amber-500',
  over: 'bg-red-500',
}
const TEXT_COLOR: Record<BudgetStatus, string> = {
  ok: 'text-gray-800 dark:text-gray-100',
  warn: 'text-amber-600',
  over: 'text-red-700 dark:text-red-400',
}

/** Thanh tiến độ + % dùng chung. */
function ProgressBar({ ratio, status }: { ratio: number; status: BudgetStatus }) {
  const pct = Math.round(ratio * 100)
  return (
    <div
      className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div
        className={`h-full rounded-full ${BAR_COLOR[status]}`}
        style={{ width: `${Math.min(ratio * 100, 100)}%` }}
      />
    </div>
  )
}

export function BudgetView({ monthKey }: { monthKey: MonthKey }) {
  const monthKeyStr = monthKeyString(monthKey)
  const { base } = useRates()
  const { report, isLoading } = useBudgetReport(monthKey)
  const { data: budgets = [] } = useBudgets(monthKeyStr)
  const { data: categories = [] } = useCategories()
  const copy = useCopyBudgetsFromPreviousMonth()
  // Gọi trước mọi early-return để giữ đúng thứ tự hook
  const pace = useMonthPace(monthKey)

  // --- Cơ cấu chi so với mốc (thiết yếu / linh hoạt / tiết kiệm) ---
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const { data: monthTxs = [] } = useMonthTransactions(monthKey)
  const { rates } = useRates()
  const axis = useMemo(() => {
    const currencyOf = (id: string): CurrencyCode =>
      accounts.find((a) => a.id === id)?.currency ?? base
    const r = rates ?? {}
    const sums = sumIncomeExpense(monthTxs, currencyOf, base, r)
    const expense = categoryBreakdown(monthTxs, 'expense', currencyOf, base, r)
    // foldUncategorized: khoản chi thiếu danh mục vẫn phải nằm trong "chưa phân loại"
    const cls = foldUncategorized(
      classificationBreakdown(expense.slices, categories),
      sums.expense,
    )
    return axisProgress(sums.income, cls, {
      essentialBps: profile?.target_essential_bps ?? 5000,
      flexibleBps: profile?.target_flexible_bps ?? 3000,
      savingsBps: profile?.target_savings_bps ?? 2000,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthTxs, categories, accounts, base, rates, profile])

  // Danh mục đang sửa hạn mức (null = đóng sheet)
  const [editing, setEditing] = useState<{
    categoryId: string
    current: number
    rollover?: boolean
    budgetId?: string
    hint?: string
  } | null>(null)
  // Các nhóm cha đang xổ (mở accordion). Mặc định thu gọn.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const catOf = (id: string) => categories.find((c) => c.id === id)

  // Câu giải thích hạn mức đang đặt thuộc loại nào — tránh nhầm "con cộng thêm vào cha".
  function hintFor(categoryId: string): string | undefined {
    const c = catOf(categoryId)
    if (!c) return undefined
    if (c.parent_id) {
      const parent = catOf(c.parent_id)
      const parentCapped = budgets.some((b) => b.category_id === c.parent_id)
      return parentCapped
        ? `Chỉ là mốc theo dõi bên trong trần của ${parent?.name ?? 'nhóm cha'} — không cộng thêm vào trần đó, cũng không cộng vào tổng ngân sách.`
        : `${parent?.name ?? 'Nhóm cha'} chưa có trần chung, nên hạn mức này tính vào tổng ngân sách. Trần của nhóm = tổng hạn mức các mục con.`
    }
    const hasChildren = categories.some((k) => k.parent_id === categoryId && !k.is_archived)
    return hasChildren
      ? 'Trần chung cho cả nhóm: tính mọi khoản chi của các mục con và chi ghi thẳng vào nhóm.'
      : undefined
  }

  // Mở sheet đặt/sửa hạn mức cho một danh mục (dùng amount gốc, không gồm phần dồn).
  function openEdit(categoryId: string) {
    const b = budgets.find((x) => x.category_id === categoryId)
    setEditing({
      categoryId,
      current: b?.amount ?? 0,
      rollover: b?.rollover,
      budgetId: b?.id,
      hint: hintFor(categoryId),
    })
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCopy() {
    const n = await copy.mutateAsync(monthKeyStr)
    showToast(
      n > 0 ? `Đã chép ${n} hạn mức từ tháng trước` : 'Tháng trước không có hạn mức để chép',
      n > 0 ? 'success' : 'info',
    )
  }

  if (isLoading || !report) {
    return <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">Đang tải…</p>
  }

  const totalPct = report.totalBudgeted > 0 ? (report.totalSpent / report.totalBudgeted) * 100 : 0

  const expenseCats = categories
    .filter((c) => c.type === 'expense' && !c.is_archived)
    .sort((a, b) => a.sort_order - b.sort_order)
  const { items, unbudgeted } = buildBudgetDisplay(expenseCats, report)

  // Một dòng con bên trong nhóm (khi xổ ra).
  const childRow = (child: BudgetChildRow) => {
    const pct = child.marker ? Math.round(child.marker.ratio * 100) : null
    return (
      <li key={child.cat.id}>
        <button type="button" onClick={() => openEdit(child.cat.id)} className="w-full text-left">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-gray-700 dark:text-gray-300">
              {child.cat.icon} {child.cat.name}
            </span>
            {child.marker ? (
              <span className={`text-xs ${TEXT_COLOR[child.marker.status]}`}>{pct}%</span>
            ) : (
              <span className="text-xs text-gray-500 dark:text-gray-400">Đặt mốc +</span>
            )}
          </div>
          {child.marker ? (
            <>
              <ProgressBar ratio={child.marker.ratio} status={child.marker.status} />
              <div className="mt-0.5 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span className={TEXT_COLOR[child.marker.status]}>
                  {formatMoney(child.marker.spent, base)}
                </span>
                <span>{formatMoney(child.marker.budgeted, base)}</span>
              </div>
            </>
          ) : (
            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Đã chi {formatMoney(child.spent, base)}
            </div>
          )}
        </button>
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {(report.hasMissingRate || pace.hasMissingRate) && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 p-2 text-xs text-amber-700 dark:text-amber-300">
          Một phần chi ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

      {/* Cơ cấu chi theo trục — trả lời "chi thế này có lành mạnh không",
          khác với dòng tổng bên dưới trả lời "có vượt hạn mức không" */}
      {axis && <AxisTargetsCard data={axis} base={base} />}

      {/* Dòng tổng */}
      <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400">Tổng ngân sách</h2>
          <span className="flex gap-2 text-xs font-medium">
            {report.warnCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400">{report.warnCount} sắp vượt</span>
            )}
            {report.overCount > 0 && (
              <span className="text-red-700 dark:text-red-400">{report.overCount} danh mục vượt</span>
            )}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className={`text-lg font-bold ${TEXT_COLOR[report.totalStatus]}`}>
            {formatMoney(report.totalSpent, base)}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            / {formatMoney(report.totalBudgeted, base)}
          </span>
        </div>
        <ProgressBar ratio={totalPct / 100} status={report.totalStatus} />
        <button
          type="button"
          onClick={handleCopy}
          className="mt-3 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Chép hạn mức tháng trước
        </button>
      </section>

      {/* Đang đi nhanh hay chậm so với hạn mức — ngay dưới dòng tổng */}
      <SpendPaceSection pace={pace} />

      {/* Danh mục / nhóm có hạn mức */}
      {items.length > 0 && (
        <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
          <ul className="space-y-3">
            {items.map((item) => {
              if (item.kind === 'leaf') {
                const pct = Math.round(item.line.ratio * 100)
                return (
                  <li key={item.cat.id}>
                    <button
                      type="button"
                      onClick={() => openEdit(item.cat.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">
                          {item.cat.icon} {item.cat.name}
                        </span>
                        <span className={`text-xs ${TEXT_COLOR[item.line.status]}`}>{pct}%</span>
                      </div>
                      <ProgressBar ratio={item.line.ratio} status={item.line.status} />
                      <div className="mt-0.5 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span className={TEXT_COLOR[item.line.status]}>
                          {formatMoney(item.line.spent, base)}
                        </span>
                        <span>
                          {formatMoney(item.line.budgeted, base)}
                          {item.line.carried > 0 && (
                            <span className="ml-1 text-green-800 dark:text-green-400">
                              (dồn +{formatMoney(item.line.carried, base)})
                            </span>
                          )}
                        </span>
                      </div>
                    </button>
                  </li>
                )
              }

              const pct = Math.round(item.ratio * 100)
              const isOpen = expanded.has(item.cat.id)
              return (
                <li key={item.cat.id}>
                  <div className="flex items-stretch gap-1">
                    {/* Nút xổ/thu con */}
                    <button
                      type="button"
                      onClick={() => toggle(item.cat.id)}
                      aria-label={isOpen ? 'Thu gọn' : 'Xem các mục con'}
                      aria-expanded={isOpen}
                      className="shrink-0 rounded p-0.5 text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    {/* Vùng chính: đặt/sửa trần nhóm */}
                    <button
                      type="button"
                      onClick={() => openEdit(item.cat.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium text-gray-800 dark:text-gray-100">
                          {item.cat.icon} {item.cat.name}
                          <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                            {item.capped ? 'trần nhóm' : `${item.children.length} mục con`}
                          </span>
                        </span>
                        <span className={`text-xs ${TEXT_COLOR[item.status]}`}>{pct}%</span>
                      </div>
                      <ProgressBar ratio={item.ratio} status={item.status} />
                      <div className="mt-0.5 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span className={TEXT_COLOR[item.status]}>
                          {formatMoney(item.spent, base)}
                        </span>
                        <span>{formatMoney(item.budgeted, base)}</span>
                      </div>
                    </button>
                  </div>
                  {/* Mốc con chỉ chia nhỏ bên trong trần cha; cộng lại vượt trần thì nhắc. */}
                  {item.capped && item.markerTotal > item.budgeted && (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      Mốc các mục con cộng lại {formatMoney(item.markerTotal, base)}, vượt trần nhóm{' '}
                      {formatMoney(item.budgeted, base)}.
                    </p>
                  )}
                  {isOpen && (
                    <ul className="mt-2 space-y-2 border-l border-gray-100 dark:border-gray-800 pl-3">
                      {item.children.map(childRow)}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Nhóm / lá chưa đặt hạn mức */}
      {unbudgeted.length > 0 && (
        <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
            Chưa đặt hạn mức
          </h2>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            Bấm tên nhóm để đặt trần chung, hoặc xổ ra (▸) để đặt riêng cho từng mục con — khi đó
            trần nhóm là tổng các con.
          </p>
          <ul className="flex flex-col gap-2">
            {unbudgeted.map(({ cat: c, children }) => {
              const isOpen = expanded.has(c.id)
              return (
                <li key={c.id}>
                  <div className="flex items-center gap-1">
                    {children.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggle(c.id)}
                        aria-label={isOpen ? 'Thu gọn' : 'Xem các mục con'}
                        aria-expanded={isOpen}
                        className="shrink-0 rounded p-0.5 text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(c.id)}
                      className="rounded-full border border-dashed border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      {c.icon} {c.name} +
                    </button>
                  </div>
                  {isOpen && children.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2 border-l border-gray-100 dark:border-gray-800 pl-3">
                      {children.map((k) => (
                        <li key={k.id}>
                          <button
                            type="button"
                            onClick={() => openEdit(k.id)}
                            className="rounded-full border border-dashed border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            {k.icon} {k.name} +
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Biểu đồ mô tả — dưới danh sách hạn mức vì không bấm được */}
      <MonthPaceCharts pace={pace} />

      {editing && (
        <BudgetEditSheet
          key={editing.categoryId}
          monthKey={monthKeyStr}
          categoryId={editing.categoryId}
          categoryLabel={`${catOf(editing.categoryId)?.icon ?? '📦'} ${catOf(editing.categoryId)?.name ?? ''}`}
          current={editing.current}
          currentRollover={editing.rollover}
          budgetId={editing.budgetId}
          hint={editing.hint}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
