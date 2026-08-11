// Mặt LẬP KẾ HOẠCH của tab Ngân sách — hiện khi tháng đang xem CHƯA BẮT ĐẦU.
//
// Bốn khối thay cho chín khối của mặt theo dõi. Cần để ý, nhịp chi, dự báo cuối tháng,
// dòng tiền tích luỹ, lịch nhiệt và cơ cấu chi THỰC TẾ đều biến mất — tháng chưa xảy
// ra thì chúng rỗng, hiện ra chỉ tổ chiếm chỗ của phần đang thực sự làm việc.

import { useMemo, useState } from 'react'
import { Pencil, PiggyBank, Target, TriangleAlert } from 'lucide-react'
import { ActionButton, Card, Money } from '../../components/ui'
import { Guide } from '../../components/Guide'
import {
  useAccountBalances,
  useCategories,
  useCopyBudgetsFromPreviousMonth,
  useRates,
  useSavingsGoals,
  useUpsertBudget,
} from '../../hooks/queries'
import { formatMonthLabel, monthKeyString, type MonthKey } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { convertToBase } from '../../lib/rates'
import { confirmDialog, showToast } from '../../lib/dialog'
import { monthlyNeeded } from '../assets/goals'
import type { AxisKey } from './axisTargets'
import { BudgetEditSheet } from './BudgetEditSheet'
import { ExpectedIncomeSheet } from './ExpectedIncomeSheet'
import { usePlanning } from './usePlanning'

const AXIS_LABEL: Record<AxisKey, string> = {
  essential: 'Thiết yếu',
  flexible: 'Linh hoạt',
  savings: 'Để dành',
}

export function PlanningView({ monthKey }: { monthKey: MonthKey }) {
  const monthKeyStr = monthKeyString(monthKey)
  const monthLabel = formatMonthLabel(monthKey)
  const { base, rates } = useRates()
  const { data: categories = [] } = useCategories()
  const { data: goals = [] } = useSavingsGoals()
  const { data: balances = [] } = useAccountBalances()
  const data = usePlanning(monthKey)
  const copy = useCopyBudgetsFromPreviousMonth()
  const upsert = useUpsertBudget()

  const [editing, setEditing] = useState<string | null>(null)
  const [incomeOpen, setIncomeOpen] = useState(false)

  const catOf = (id: string) => categories.find((c) => c.id === id)

  // Mục tiêu tiết kiệm gửi sang đúng MỘT con số: cần để riêng bao nhiêu mỗi tháng.
  // Trang này không cần biết mục tiêu tên gì hay tới bao giờ — chuyện đó ở tab Tài sản.
  const goalNeed = useMemo(() => {
    let sum = 0
    for (const g of goals) {
      const bal = balances.find((b) => b.id === g.account_id)
      const need = monthlyNeeded(
        Math.max(0, g.target_amount - Math.max(0, bal?.balance ?? 0)),
        g.target_date,
        monthKey,
        1,
      )
      if (need === null) continue
      const v = convertToBase(need, bal?.currency ?? base, base, rates ?? {})
      if (v !== null) sum += v
    }
    return sum
  }, [goals, balances, monthKey, base, rates])

  // Danh mục lá đáng bày ra: đã đặt hạn mức, hoặc từng chi trong lịch sử (có gợi ý).
  // Tiền to lên đầu — lập kế hoạch thì bắt đầu từ chỗ tốn nhất.
  const rows = useMemo(() => {
    const leaves = categories.filter(
      (c) => c.type === 'expense' && !c.is_archived && !categories.some((k) => k.parent_id === c.id && !k.is_archived),
    )
    return leaves
      .map((c) => ({
        cat: c,
        budgeted: data.budgetedByCat.get(c.id) ?? 0,
        suggestion: data.suggestions.get(c.id) ?? null,
        committed: data.commitments.byCategory.get(c.id) ?? 0,
      }))
      .filter((r) => r.budgeted > 0 || (r.suggestion?.average ?? 0) > 0 || r.committed > 0)
      .sort((a, b) => {
        const av = a.budgeted || a.suggestion?.average || a.committed
        const bv = b.budgeted || b.suggestion?.average || b.committed
        return bv - av
      })
  }, [categories, data])

  async function handleCopy() {
    let n: number
    try {
      n = await copy.mutateAsync(monthKeyStr)
    } catch {
      return
    }
    showToast(
      n > 0 ? `Đã chép ${n} hạn mức từ tháng trước` : 'Tháng trước không có hạn mức để chép',
      n > 0 ? 'success' : 'info',
    )
  }

  const pending = rows.filter((r) => r.budgeted === 0 && (r.suggestion?.average ?? 0) > 0)

  async function handleUseAllSuggestions() {
    if (pending.length === 0) return
    const ok = await confirmDialog({
      title: `Đặt hạn mức cho ${pending.length} danh mục?`,
      message: 'Dùng số trung bình 3 tháng cho những mục chưa đặt. Sửa lại từng mục sau vẫn được.',
      confirmLabel: 'Đặt hết',
    })
    if (!ok) return
    try {
      for (const r of pending) {
        await upsert.mutateAsync({
          categoryId: r.cat.id,
          monthKey: monthKeyStr,
          amount: r.suggestion!.average,
        })
      }
    } catch {
      return
    }
    showToast(`Đã đặt ${pending.length} hạn mức`, 'success')
  }

  const { summary } = data
  const over = summary.unallocated < 0

  return (
    <div className="flex flex-col gap-3">
      {data.hasMissingRate && (
        <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          Một phần cam kết ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
        <div className="contents lg:flex lg:flex-col lg:gap-3">
          {/* 1 — Còn chưa phân bổ. Song sinh với "Còn lại" của mặt theo dõi: cùng chỗ,
              cùng cỡ chữ, đổi nghĩa. Mắt không phải học lại cách đọc trang. */}
          <Card as="section" className="order-1">
            <p className="mb-2 text-xs font-medium text-fg-accent">
              Tháng chưa bắt đầu · đang lập kế hoạch
            </p>
            {summary.incomeSource === 'unknown' ? (
              <>
                <p className="text-sm text-fg-secondary">
                  Chưa biết tháng này thu bao nhiêu nên chưa chia được. Khai một số dự kiến
                  là cả kế hoạch chạy.
                </p>
                <ActionButton
                  variant="primary"
                  onClick={() => setIncomeOpen(true)}
                  className="mt-2"
                >
                  Khai thu dự kiến
                </ActionButton>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <Money
                    amount={Math.abs(summary.unallocated)}
                    currency={base}
                    tone={over ? 'out' : 'neutral'}
                    className="text-3xl font-bold leading-none tracking-tight"
                  />
                  <span className="text-xs text-fg-secondary">
                    {summary.unallocated > 0
                      ? 'chưa phân bổ'
                      : summary.unallocated === 0
                        ? 'đã chia hết'
                        : 'chia quá tay'}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className={`h-full rounded-full ${over ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{
                      width: `${
                        summary.income > 0
                          ? Math.min(100, (summary.allocated / summary.income) * 100)
                          : 100
                      }%`,
                    }}
                  />
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-2 text-xs text-fg-secondary">
                  <button
                    type="button"
                    onClick={() => setIncomeOpen(true)}
                    className="-my-2 inline-flex min-h-11 items-center gap-1 text-left"
                  >
                    <span>
                      Thu dự kiến{' '}
                      <b className="font-semibold text-fg-primary">
                        {formatMoney(summary.income, base)}
                      </b>{' '}
                      <span className="text-fg-muted">
                        {summary.incomeSource === 'declared' ? 'tự khai' : 'TB 3 tháng'}
                      </span>
                    </span>
                    <Pencil className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden />
                  </button>
                  <span className="shrink-0">đã chia {formatMoney(summary.allocated, base)}</span>
                </div>
              </>
            )}
          </Card>

          {/* 2 — Cơ cấu theo KẾ HOẠCH. Dòng "Để dành" chính là phần chưa phân bổ ở trên
              (xem planSummary): nâng một hạn mức là hai chỗ nhúc nhích cùng nhau vì
              chúng là một phép tính, không phải hai phép được canh cho khớp. */}
          {summary.axis && (
            <Card as="section" className="order-2">
              <h2 className="mb-2 text-sm font-semibold text-fg-muted">Cơ cấu theo kế hoạch</h2>
              <ul className="space-y-3">
                {summary.axis.lines.map((l) => {
                  const barPct = Math.min(Math.max(l.share, 0) * 100, 100)
                  const markPct = Math.min(l.targetShare * 100, 100)
                  return (
                    <li key={l.key}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="text-fg-primary">{AXIS_LABEL[l.key]}</span>
                        <span
                          className={`text-xs font-medium ${l.ok ? 'text-money-in' : 'text-fg-warn'}`}
                        >
                          {Math.round(l.share * 100)}%
                          <span className="ml-1 font-normal text-fg-muted">
                            {l.direction === 'cap' ? 'tối đa' : 'tối thiểu'}{' '}
                            {Math.round(l.targetShare * 100)}%
                          </span>
                        </span>
                      </div>
                      <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken">
                        <div
                          className={`h-full rounded-full ${l.ok ? 'bg-green-500' : 'bg-amber-500'}`}
                          style={{ width: `${barPct}%` }}
                        />
                        <div
                          className="absolute top-0 h-2 w-0.5 bg-gray-500 dark:bg-gray-300"
                          style={{ left: `${markPct}%` }}
                          aria-hidden
                        />
                      </div>
                      <div className="mt-0.5 flex justify-between text-xs text-fg-muted">
                        <span className={l.ok ? '' : 'text-fg-warn'}>
                          {formatMoney(Math.round(l.actual), base)}
                          {l.key === 'savings' && (
                            <span className="ml-1 text-fg-accent">= phần chưa phân bổ</span>
                          )}
                        </span>
                        <span>
                          {l.direction === 'cap' ? 'trần' : 'sàn'} {formatMoney(l.target, base)}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>

              {goalNeed > 0 && (
                <p className="mt-3 border-t border-border-subtle pt-2 text-xs text-fg-secondary">
                  <Target className="mr-1 inline h-3.5 w-3.5 -translate-y-px" aria-hidden />
                  Mục tiêu tiết kiệm cần {formatMoney(goalNeed, base)}/tháng —{' '}
                  {summary.unallocated >= goalNeed ? (
                    <span className="text-money-in">kế hoạch này đủ.</span>
                  ) : (
                    <span className="text-fg-warn">
                      còn thiếu {formatMoney(goalNeed - summary.unallocated, base)}.
                    </span>
                  )}
                </p>
              )}

              {summary.axis.unclassified > 0 && (
                <p className="mt-3 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  {formatMoney(Math.round(summary.axis.unclassified), base)} hạn mức thuộc danh
                  mục chưa phân loại nên hai dòng đầu đang thiếu.
                </p>
              )}
            </Card>
          )}

          {/* 3 — Đã cam kết. KHÔNG cộng vào "đã chia": cam kết là thực tế, hạn mức là
              kế hoạch. Việc của khối này là chỉ ra chỗ kế hoạch không phủ nổi thực tế. */}
          {data.commitments.items.length > 0 && (
            <Card as="section" className="order-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-fg-muted">Đã cam kết</h2>
                <span className="text-sm font-semibold text-fg-primary">
                  {formatMoney(data.commitments.total, base)}
                </span>
              </div>
              <Guide className="mb-2 text-xs text-fg-muted">
                Tiền chắc chắn ra trong tháng — hạn mức phải phủ được. Số này không cộng vào
                phần đã chia ở trên.
              </Guide>
              <ul className="divide-y divide-border-subtle">
                {data.commitments.items.map((it) => {
                  const c = it.categoryId ? catOf(it.categoryId) : null
                  return (
                    <li key={it.key} className="py-1.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-fg-primary">{it.title}</span>
                        <span className="shrink-0 text-fg-primary">
                          {it.unknownAmount ? (
                            <span className="text-xs text-fg-muted">chưa biết</span>
                          ) : (
                            formatMoney(it.amount, base)
                          )}
                        </span>
                      </div>
                      <p className="text-2xs text-fg-muted">
                        {it.kind === 'recurring' ? 'định kỳ' : 'sắp chi'}
                        {it.times > 1 && ` ×${it.times}`}
                        {c ? ` → ${c.name}` : ' · chưa gắn danh mục'}
                      </p>
                    </li>
                  )
                })}
              </ul>

              {data.gaps.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {data.gaps.map((g) => (
                    <li key={g.categoryId}>
                      <button
                        type="button"
                        onClick={() => setEditing(g.categoryId)}
                        className="flex min-h-11 w-full items-center gap-2 rounded-lg bg-amber-50 px-2 py-1.5 text-left text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      >
                        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1">
                          Hạn mức {catOf(g.categoryId)?.name ?? 'danh mục'} đang{' '}
                          {formatMoney(g.budgeted, base)}, không phủ nổi{' '}
                          {formatMoney(g.committed, base)} đã cam kết.{' '}
                          <span className="underline">Nâng lên {formatMoney(g.committed, base)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-3">
          {/* 4 — Danh sách hạn mức, mỗi dòng kèm gợi ý từ lịch sử. */}
          <Card as="section" className="order-4">
            <h2 className="mb-2 text-sm font-semibold text-fg-muted">Hạn mức tháng này</h2>
            <div className="mb-2 flex gap-2">
              <ActionButton onClick={handleCopy} className="flex-1">
                Chép tháng trước
              </ActionButton>
              <ActionButton
                onClick={handleUseAllSuggestions}
                disabled={pending.length === 0}
                className="flex-1"
              >
                Dùng hết gợi ý{pending.length > 0 ? ` (${pending.length})` : ''}
              </ActionButton>
            </div>

            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg-muted">
                Chưa có gì để gợi ý — cần ít nhất một tháng đã ghi chép.
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {rows.map((r) => (
                  <li key={r.cat.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(r.cat.id)}
                      className="flex min-h-11 w-full items-center justify-between gap-2 py-1.5 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg-primary">
                          {r.cat.icon} {r.cat.name}
                        </span>
                        <span className="block text-2xs text-fg-muted">
                          {r.suggestion
                            ? `TB 3 tháng ${formatMoney(r.suggestion.average, base)} · cao nhất ${formatMoney(r.suggestion.max, base)}`
                            : 'chưa có lịch sử'}
                          {r.committed > 0 && (
                            <span className="text-fg-warn">
                              {' · '}
                              {formatMoney(r.committed, base)} đã cam kết
                            </span>
                          )}
                        </span>
                      </span>
                      {r.budgeted > 0 ? (
                        <span className="shrink-0 text-sm font-medium text-fg-primary">
                          {formatMoney(r.budgeted, base)}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-border-strong px-3 py-1 text-2xs font-medium text-fg-secondary">
                          đặt {formatMoney(r.suggestion?.average ?? 0, base)} +
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Cả dòng là chữ để DẠY nên bọc <Guide> từ ngoài: bọc mỗi phần chữ thì ở
              chế độ Gọn còn trơ lại một cái icon không nói gì. */}
          <Guide className="order-5 flex items-start gap-1.5 px-1 text-2xs text-fg-muted">
            <PiggyBank className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Kế hoạch không cần chốt: tháng {monthLabel} bắt đầu là trang này tự chuyển sang
              theo dõi, dùng đúng những hạn mức bạn vừa đặt.
            </span>
          </Guide>
        </div>
      </div>

      {editing && (
        <BudgetEditSheet
          key={editing}
          monthKey={monthKeyStr}
          categoryId={editing}
          categoryLabel={`${catOf(editing)?.icon ?? '📦'} ${catOf(editing)?.name ?? ''}`}
          current={data.budgetedByCat.get(editing) ?? 0}
          budgetId={data.budgetIdByCat.get(editing)}
          suggestion={data.suggestions.get(editing) ?? null}
          onClose={() => setEditing(null)}
        />
      )}

      {incomeOpen && (
        <ExpectedIncomeSheet
          monthKey={monthKeyStr}
          monthLabel={monthLabel}
          declared={data.declared}
          baseline={data.baseline}
          onClose={() => setIncomeOpen(false)}
        />
      )}
    </div>
  )
}
