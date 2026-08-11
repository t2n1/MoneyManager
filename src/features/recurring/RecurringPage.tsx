import { useMemo, useState } from 'react'
import { Guide } from '../../components/Guide'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRightLeft, ChevronLeft, Pause, Play, Plus, Sparkles, Trash2, X } from 'lucide-react'
import {
  useAccounts,
  useCategories,
  useCreateRecurringRule,
  useDeleteRecurringRule,
  useRangeTransactions,
  useRecurringRules,
  useRunRecurringCatchUp,
  useUpdateRecurringRule,
} from '../../hooks/queries'
import { addDaysISO, toISODate } from '../../lib/dates'
import { confirmDialog, showToast } from '../../lib/dialog'
import { formatMoney } from '../../lib/money'
import { billStatuses, nextDueDate, type RecurringFrequency } from '../../lib/recurring'
import { detectRecurring, ruleKey, type RecurringSuggestion } from '../../lib/recurringRadar'
import type { RecurringRuleRow } from '../../types/database.types'
import { RecurringFormSheet } from './RecurringFormSheet'

const RADAR_DISMISS_KEY = 'sct-radar-dismissed'

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RADAR_DISMISS_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

/** Kỳ đến hạn kế tiếp sau lần cuối (để rule không sinh trùng giao dịch quá khứ). */
function nextStartOn(lastDate: string, frequency: 'weekly' | 'monthly'): string {
  if (frequency === 'weekly') return addDaysISO(lastDate, 7)
  const [y, m, d] = lastDate.split('-').map(Number)
  return toISODate(new Date(y, m, d))
}

const FREQ_LABEL: Record<RecurringFrequency, string> = {
  weekly: 'Hàng tuần',
  monthly: 'Hàng tháng',
  yearly: 'Hàng năm',
}
const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

const AMOUNT_COLOR: Record<RecurringRuleRow['type'], string> = {
  expense: 'text-money-out',
  income: 'text-money-in',
  transfer: 'text-fg-muted',
}

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${y}/${Number(m)}/${Number(d)}`
}

/** "Hàng tháng · ngày 25" / "Hàng tuần · Thứ 2" / "Hàng năm · 12/25" (tháng/ngày) */
function scheduleLabel(rule: RecurringRuleRow): string {
  const [, m, d] = rule.start_on.split('-').map(Number)
  if (rule.frequency === 'weekly')
    return `${FREQ_LABEL.weekly} · ${WEEKDAYS[new Date(rule.start_on + 'T00:00:00').getDay()]}`
  if (rule.frequency === 'monthly') return `${FREQ_LABEL.monthly} · ngày ${d}`
  return `${FREQ_LABEL.yearly} · ${m}/${d}`
}

/** Màn quản lý giao dịch định kỳ (Cài đặt → Giao dịch định kỳ). */
export function RecurringPage() {
  const navigate = useNavigate()
  const { data: rules = [], isLoading } = useRecurringRules()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const update = useUpdateRecurringRule()
  const del = useDeleteRecurringRule()
  const catchUp = useRunRecurringCatchUp()
  const createRule = useCreateRecurringRule()
  const [sheet, setSheet] = useState<{ open: boolean; rule: RecurringRuleRow | null }>({
    open: false,
    rule: null,
  })
  const [dismissed, setDismissed] = useState<string[]>(readDismissed)

  const accountOf = (id: string | null) => accounts.find((a) => a.id === id)
  const categoryOf = (id: string | null) => categories.find((c) => c.id === id)

  // Radar (mục T): quét 180 ngày gần nhất tìm khoản lặp đều chưa có quy tắc.
  const today = toISODate(new Date())
  const radarRange = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 180)
    return { start: toISODate(d), end: addDaysISO(today, 1) }
  }, [today])
  const { data: historyTxs = [] } = useRangeTransactions(radarRange)
  const suggestions = useMemo(() => {
    const existing = new Set(
      rules.map((r) => ruleKey(r.type, r.account_id, r.category_id, r.amount)),
    )
    return detectRecurring(historyTxs, existing, today).filter((s) => !dismissed.includes(s.key))
  }, [historyTxs, rules, today, dismissed])

  // Khoản kiểu NHẮC đang tới hạn / quá hạn — tra theo id để gắn vào đúng dòng.
  const billByRule = useMemo(
    () => new Map(billStatuses(rules, today).map((b) => [b.ruleId, b])),
    [rules, today],
  )

  function dismissSuggestion(key: string) {
    const next = [...dismissed, key]
    setDismissed(next)
    try {
      localStorage.setItem(RADAR_DISMISS_KEY, JSON.stringify(next))
    } catch {
      // bỏ qua
    }
  }

  async function createFromSuggestion(s: RecurringSuggestion) {
    try {
      await createRule.mutateAsync({
        type: s.type,
        amount: s.amount,
        to_amount: null,
        category_id: s.category_id,
        account_id: s.account_id,
        to_account_id: null,
        note: s.note,
        frequency: s.frequency,
        start_on: nextStartOn(s.lastDate, s.frequency),
        end_on: null,
      })
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Thao tác thất bại, thử lại.', 'error')
    }
  }

  async function togglePause(rule: RecurringRuleRow) {
    try {
      if (rule.is_paused) {
        // Bật lại: các kỳ rơi vào lúc tạm dừng KHÔNG sinh bù — đẩy last_generated_on
        // lên hôm qua (nếu đang cũ hơn) rồi catch-up để kỳ đến hạn hôm nay sinh ngay
        const yesterday = addDaysISO(toISODate(new Date()), -1)
        const last =
          rule.last_generated_on && rule.last_generated_on > yesterday
            ? rule.last_generated_on
            : yesterday
        await update.mutateAsync({ id: rule.id, patch: { is_paused: false, last_generated_on: last } })
        await catchUp.mutateAsync()
      } else {
        await update.mutateAsync({ id: rule.id, patch: { is_paused: true } })
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Thao tác thất bại, thử lại.', 'error')
    }
  }

  async function handleDelete(rule: RecurringRuleRow) {
    if (
      !(await confirmDialog({
        title: 'Xóa quy tắc định kỳ này?',
        message: 'Giao dịch đã sinh vẫn được giữ lại.',
        danger: true,
        confirmLabel: 'Xóa',
      }))
    )
      return
    try {
      await del.mutateAsync(rule.id)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Thao tác thất bại, thử lại.', 'error')
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-1 rounded-lg bg-surface px-2 py-1.5 text-sm text-fg-secondary shadow-sm active:scale-95"
          aria-label="Quay lại Sổ"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-lg font-bold text-fg-primary">
          Giao dịch định kỳ
        </h1>
        {/* Khoản MỘT LẦN là anh em với khoản lặp mãi — ai đang ở đây tìm chỗ ghi
            "đóng phí vệ sinh 20/8" thì phải thấy lối sang. */}
        <Link to="/planned" className="shrink-0 text-xs font-medium text-fg-accent">
          Sắp chi
        </Link>
        <button
          type="button"
          onClick={() => setSheet({ open: true, rule: null })}
          className="flex items-center gap-1 rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm active:scale-95"
        >
          <Plus className="h-4 w-4" /> Thêm
        </button>
      </div>

      {suggestions.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20">
          <h2 className="flex items-center gap-1.5 px-3 pt-3 text-sm font-bold text-green-800 dark:text-green-200">
            <Sparkles className="h-4 w-4" /> Gợi ý khoản định kỳ
          </h2>
          <p className="px-3 pt-0.5 text-xs text-green-700/80 dark:text-green-300/80">
            Phát hiện từ lịch sử — tạo quy tắc để tự sinh giao dịch kỳ tới.
          </p>
          <ul className="mt-2 divide-y divide-green-100 dark:divide-green-900/50">
            {suggestions.map((s) => {
              const acc = accountOf(s.account_id)
              const cat = categoryOf(s.category_id)
              return (
                <li key={s.key} className="flex items-center gap-2 px-3 py-2.5">
                  <span className="text-lg">{cat?.icon ?? '🔁'}</span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg-primary">
                      {cat?.name ?? '?'}
                      {s.note && <span className="text-fg-muted"> · {s.note}</span>}
                    </span>
                    <span className="block text-xs text-fg-muted">
                      {formatMoney(s.amount, acc?.currency ?? 'JPY')} ·{' '}
                      {s.frequency === 'monthly' ? 'hàng tháng' : 'hàng tuần'} · {s.occurrences} lần
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => createFromSuggestion(s)}
                    className="shrink-0 rounded-lg bg-green-700 px-2.5 py-1 text-xs font-semibold text-white active:scale-95"
                  >
                    Tạo
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissSuggestion(s.key)}
                    aria-label="Bỏ qua gợi ý"
                    className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-green-700/60 hover:text-green-700 dark:text-green-300/60"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-fg-muted">Đang tải…</p>
      ) : rules.length === 0 ? (
        <p className="py-8 text-center text-sm text-fg-muted">
          Chưa có quy tắc nào.
          <Guide as="span"> Thêm ở đây hoặc chọn "Lặp lại" khi nhập giao dịch.</Guide>
        </p>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-surface shadow-sm dark:divide-gray-800 ">
          {rules.map((rule) => {
            const acc = accountOf(rule.account_id)
            const cat = categoryOf(rule.category_id)
            const next = nextDueDate(rule)
            const bill = billByRule.get(rule.id)
            return (
              <div key={rule.id} className={rule.is_paused ? 'opacity-50' : ''}>
              <div className="flex items-center gap-2 px-3 py-3">
                <span className="text-xl">
                  {rule.type === 'transfer' ? (
                    <ArrowRightLeft className="h-5 w-5 text-fg-muted" />
                  ) : (
                    cat?.icon
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setSheet({ open: true, rule })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm text-fg-primary">
                    {rule.type === 'transfer'
                      ? `${acc?.name ?? '?'} → ${accountOf(rule.to_account_id)?.name ?? '?'}`
                      : (cat?.name ?? '?')}
                    {rule.note && (
                      <span className="text-fg-muted"> · {rule.note}</span>
                    )}
                  </span>
                  <span className="block text-xs text-fg-muted">
                    {scheduleLabel(rule)} ·{' '}
                    {rule.is_paused ? 'Tạm dừng' : next ? `kỳ tới ${fmtDate(next)}` : 'Đã kết thúc'}
                    {rule.mode === 'remind' && ' · chỉ nhắc'}
                  </span>
                </button>
                <span className={`text-sm font-semibold ${AMOUNT_COLOR[rule.type]}`}>
                  {formatMoney(rule.amount, acc?.currency ?? 'JPY')}
                </span>
                <button
                  type="button"
                  onClick={() => togglePause(rule)}
                  aria-label={rule.is_paused ? 'Chạy lại' : 'Tạm dừng'}
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  {rule.is_paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(rule)}
                  aria-label="Xóa"
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>

              {/* Khoản kiểu NHẮC đang tới hạn — dải riêng chiếm hết bề ngang thay vì
                  một nút chen vào hàng trên: đây là việc phải làm, không phải một
                  thao tác phụ ngang hàng với nút tạm dừng / xoá. */}
              {bill && (
                <Link
                  to={`/entry?rule=${rule.id}&on=${bill.dueISO}`}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-medium ${
                    bill.daysLeft < 0
                      ? 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    {bill.daysLeft < 0
                      ? `Chưa ghi kỳ ${fmtDate(bill.dueISO)}`
                      : bill.daysLeft === 0
                        ? `Hôm nay tới hạn kỳ ${fmtDate(bill.dueISO)}`
                        : `${bill.daysLeft} ngày nữa tới hạn kỳ ${fmtDate(bill.dueISO)}`}
                    {bill.overdueCount > 1 && ` · đang nợ ${bill.overdueCount} kỳ`}
                  </span>
                  <span className="shrink-0 rounded-lg bg-white/70 px-2 py-1 dark:bg-black/20">
                    Ghi khoản này
                  </span>
                </Link>
              )}
              </div>
            )
          })}
        </div>
      )}

      {sheet.open && (
        <RecurringFormSheet rule={sheet.rule} onClose={() => setSheet({ open: false, rule: null })} />
      )}
    </div>
  )
}
