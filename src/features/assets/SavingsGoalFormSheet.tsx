import { useId, useState } from 'react'
import { useCreateSavingsGoal, useDeleteSavingsGoal, useUpdateSavingsGoal } from '../../hooks/queries'
import { type CurrencyCode } from '../../lib/money'
import { MoneyField } from '../../components/MoneyField'
import { DateField } from '../../components/DateField'
import type { AccountRow, SavingsGoalRow } from '../../types/database.types'
import { confirmDialog } from '../../lib/dialog'
import { useEscClose } from '../../hooks/useEscClose'
import { SectionTitle, Select, actionButtonClass } from '../../components/ui'
import { accountLabel, tr } from '../../i18n'

interface Props {
  accounts: AccountRow[]
  /** Có giá trị = sửa; không = tạo mới */
  goal?: SavingsGoalRow
  onClose: () => void
}

/** Sheet tạo/sửa mục tiêu tiết kiệm (mục AD). */
export function SavingsGoalFormSheet({ accounts, goal, onClose }: Props) {
  useEscClose(onClose)
  const uid = useId()
  const create = useCreateSavingsGoal()
  const update = useUpdateSavingsGoal()
  const del = useDeleteSavingsGoal()

  const [name, setName] = useState(goal?.name ?? '')
  const [accountId, setAccountId] = useState(goal?.account_id ?? accounts[0]?.id ?? '')
  const [target, setTarget] = useState(goal?.target_amount ?? 0)
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? '')
  const [note, setNote] = useState(goal?.note ?? '')
  const [saving, setSaving] = useState(false)

  const currency = (accounts.find((a) => a.id === accountId)?.currency ?? 'JPY') as CurrencyCode
  const canSave = name.trim() !== '' && !!accountId && target > 0 && !saving

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      const input = {
        name: name.trim(),
        account_id: accountId,
        target_amount: target,
        target_date: targetDate || null,
        note: note.trim(),
      }
      if (goal) await update.mutateAsync({ id: goal.id, patch: input })
      else await create.mutateAsync(input)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!goal) return
    if (!(await confirmDialog({ title: tr('Xóa mục tiêu này?'), danger: true, confirmLabel: tr('Xóa') }))) return
    setSaving(true)
    try {
      await del.mutateAsync(goal.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm dark:text-gray-100'

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle role="block" className="mb-3">
          {goal ? tr('Sửa mục tiêu') : tr('Mục tiêu tiết kiệm mới')}
        </SectionTitle>

        <label htmlFor={`${uid}-name`} className="mb-1 block text-sm font-medium text-fg-muted">{tr('Tên mục tiêu')}</label>
        <input id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('Ví dụ: Quỹ du lịch')} className={`mb-3 ${field}`} />

        <label htmlFor={`${uid}-acc`} className="mb-1 block text-sm font-medium text-fg-muted">{tr('Theo dõi qua tài khoản')}</label>
        <Select id={`${uid}-acc`} value={accountId} onChange={(e) => setAccountId(e.target.value)} wrapClassName="mb-3 w-full">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {accountLabel(a.name)} ({a.currency})
            </option>
          ))}
        </Select>

        {/* <span>: MoneyField có hai ô (chạm/desktop), tên đến từ `ariaLabel`. */}
        <span className="mb-1 block text-sm font-medium text-fg-muted">{tr('Số tiền đích')}</span>
        <div className="mb-3">
          <MoneyField
            value={target}
            onChange={setTarget}
            currency={currency}
            ariaLabel={tr('Số tiền đích')}
            onEnter={handleSubmit}
            className={`text-right font-semibold ${field}`}
          />
        </div>

        {/* <span> chứ không <label>: ô ngày là <button>, tên đi qua ariaLabel. */}
        <span className="mb-1 block text-sm font-medium text-fg-muted">
          {tr('Hạn hoàn thành')} <span className="text-fg-muted">{tr('(không bắt buộc)')}</span>
        </span>
        <DateField
          ariaLabel={tr('Hạn hoàn thành')}
          value={targetDate}
          onChange={setTargetDate}
          clearable
          className={`mb-3 ${field}`}
        />

        <label htmlFor={`${uid}-note`} className="mb-1 block text-sm font-medium text-fg-muted">
          {tr('Ghi chú')} <span className="text-fg-muted">{tr('(không bắt buộc)')}</span>
        </label>
        <input id={`${uid}-note`} value={note} onChange={(e) => setNote(e.target.value)} className={`mb-4 ${field}`} />

        <div className="flex items-center justify-between gap-2">
          {goal ? (
            <button type="button" onClick={handleDelete} disabled={saving} className={actionButtonClass('danger')}>
              {tr('Xóa')}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="min-h-11 rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-surface-sunken">
              {tr('Hủy')}
            </button>
            <button type="button" onClick={handleSubmit} disabled={!canSave} className={actionButtonClass('primary')}>
              {saving ? tr('Đang lưu…') : tr('Lưu')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
