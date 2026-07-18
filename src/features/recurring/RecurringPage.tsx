import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRightLeft, ChevronLeft, Pause, Play, Plus, Trash2 } from 'lucide-react'
import {
  useAccounts,
  useCategories,
  useDeleteRecurringRule,
  useRecurringRules,
  useRunRecurringCatchUp,
  useUpdateRecurringRule,
} from '../../hooks/queries'
import { addDaysISO, toISODate } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { nextDueDate, type RecurringFrequency } from '../../lib/recurring'
import type { RecurringRuleRow } from '../../types/database.types'
import { RecurringFormSheet } from './RecurringFormSheet'

const FREQ_LABEL: Record<RecurringFrequency, string> = {
  weekly: 'Hàng tuần',
  monthly: 'Hàng tháng',
  yearly: 'Hàng năm',
}
const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

const AMOUNT_COLOR: Record<RecurringRuleRow['type'], string> = {
  expense: 'text-red-600 dark:text-red-400',
  income: 'text-green-600 dark:text-green-400',
  transfer: 'text-gray-500 dark:text-gray-400',
}

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

/** "Hàng tháng · ngày 25" / "Hàng tuần · Thứ 2" / "Hàng năm · 25/12" */
function scheduleLabel(rule: RecurringRuleRow): string {
  const [, m, d] = rule.start_on.split('-').map(Number)
  if (rule.frequency === 'weekly')
    return `${FREQ_LABEL.weekly} · ${WEEKDAYS[new Date(rule.start_on + 'T00:00:00').getDay()]}`
  if (rule.frequency === 'monthly') return `${FREQ_LABEL.monthly} · ngày ${d}`
  return `${FREQ_LABEL.yearly} · ${d}/${m}`
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
  const [sheet, setSheet] = useState<{ open: boolean; rule: RecurringRuleRow | null }>({
    open: false,
    rule: null,
  })

  const accountOf = (id: string | null) => accounts.find((a) => a.id === id)
  const categoryOf = (id: string | null) => categories.find((c) => c.id === id)

  async function togglePause(rule: RecurringRuleRow) {
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
  }

  async function handleDelete(rule: RecurringRuleRow) {
    if (!window.confirm('Xóa quy tắc định kỳ này? Giao dịch đã sinh vẫn được giữ lại.')) return
    await del.mutateAsync(rule.id)
  }

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="flex items-center gap-1 rounded-lg bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-600 dark:text-gray-300 shadow-sm active:scale-95"
          aria-label="Quay lại Cài đặt"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-lg font-bold text-gray-800 dark:text-gray-100">
          Giao dịch định kỳ
        </h1>
        <button
          type="button"
          onClick={() => setSheet({ open: true, rule: null })}
          className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm active:scale-95"
        >
          <Plus className="h-4 w-4" /> Thêm
        </button>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">Đang tải…</p>
      ) : rules.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
          Chưa có quy tắc nào. Thêm ở đây hoặc chọn "Lặp lại" khi nhập giao dịch.
        </p>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-sm dark:divide-gray-800 dark:bg-gray-900">
          {rules.map((rule) => {
            const acc = accountOf(rule.account_id)
            const cat = categoryOf(rule.category_id)
            const next = nextDueDate(rule)
            return (
              <div
                key={rule.id}
                className={`flex items-center gap-2 px-3 py-3 ${rule.is_paused ? 'opacity-50' : ''}`}
              >
                <span className="text-xl">
                  {rule.type === 'transfer' ? (
                    <ArrowRightLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  ) : (
                    cat?.icon
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setSheet({ open: true, rule })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm text-gray-800 dark:text-gray-100">
                    {rule.type === 'transfer'
                      ? `${acc?.name ?? '?'} → ${accountOf(rule.to_account_id)?.name ?? '?'}`
                      : (cat?.name ?? '?')}
                    {rule.note && (
                      <span className="text-gray-400 dark:text-gray-500"> · {rule.note}</span>
                    )}
                  </span>
                  <span className="block text-xs text-gray-400 dark:text-gray-500">
                    {scheduleLabel(rule)} ·{' '}
                    {rule.is_paused ? 'Tạm dừng' : next ? `kỳ tới ${fmtDate(next)}` : 'Đã kết thúc'}
                  </span>
                </button>
                <span className={`text-sm font-semibold ${AMOUNT_COLOR[rule.type]}`}>
                  {formatMoney(rule.amount, acc?.currency ?? 'JPY')}
                </span>
                <button
                  type="button"
                  onClick={() => togglePause(rule)}
                  aria-label={rule.is_paused ? 'Chạy lại' : 'Tạm dừng'}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-gray-800"
                >
                  {rule.is_paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(rule)}
                  aria-label="Xóa"
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-gray-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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
