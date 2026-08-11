// Thêm / sửa một khoản sắp chi.
//
// Ba quyết định của form, theo thứ tự người ta nghĩ: chi cái gì → khoảng bao nhiêu →
// khi nào (và có cần app kêu không). Số tiền để trống được: "tìm nhà mới" là việc có
// thật mà chưa ai đoán nổi giá, bắt điền là ép bịa một con số.
import { useState } from 'react'
import { Guide } from '../../components/Guide'
import { MoneyField } from '../../components/MoneyField'
import { ActionButton } from '../../components/ui'
import { useEscClose } from '../../hooks/useEscClose'
import {
  useCategories,
  useCreatePlannedExpense,
  useDeletePlannedExpense,
  useRates,
  useUpdatePlannedExpense,
} from '../../hooks/queries'
import { CURRENCIES, type CurrencyCode } from '../../lib/currencies'
import { confirmDialog, showToast } from '../../lib/dialog'
import { toISODate } from '../../lib/dates'
import type { DuePrecision, PlannedExpenseRow } from '../../types/database.types'

const PRECISION: readonly (readonly [DuePrecision, string, string])[] = [
  ['day', 'Đúng ngày', 'Biết chắc ngày nào — vd hạn đóng phí 20/8'],
  ['month', 'Khoảng tháng', 'Mới biết tháng, chưa chốt ngày — vd sửa nhà tháng 10'],
]

/** Ngày 1 của tháng chứa `iso` — kiểu 'month' luôn neo vào đó (migration 0038). */
const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`

interface Props {
  /** null = thêm mới */
  planned: PlannedExpenseRow | null
  onClose: () => void
}

export function PlannedFormSheet({ planned, onClose }: Props) {
  useEscClose(onClose)
  const { base } = useRates()
  const { data: categories = [] } = useCategories()
  const create = useCreatePlannedExpense()
  const update = useUpdatePlannedExpense()
  const remove = useDeletePlannedExpense()

  const [title, setTitle] = useState(planned?.title ?? '')
  const [amount, setAmount] = useState(planned?.amount ?? 0)
  const [currency, setCurrency] = useState<CurrencyCode>(planned?.currency ?? base)
  const [precision, setPrecision] = useState<DuePrecision>(planned?.due_precision ?? 'day')
  const [dueOn, setDueOn] = useState(planned?.due_on ?? toISODate(new Date()))
  const [remind, setRemind] = useState(planned?.remind_days_before !== null)
  const [remindDays, setRemindDays] = useState(String(planned?.remind_days_before ?? 0))
  const [categoryId, setCategoryId] = useState<string | null>(planned?.category_id ?? null)
  const [note, setNote] = useState(planned?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const expenseCats = categories.filter((c) => c.type === 'expense' && !c.is_archived)
  const canSave = title.trim().length > 0 && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const input = {
        title: title.trim(),
        amount,
        currency,
        // Kiểu 'month' phải neo ngày 1 — ràng buộc ở DB, nhưng ép ở đây để người dùng
        // không bao giờ nhận một lỗi từ Postgres vì một ô mà họ không thấy.
        due_on: precision === 'month' ? firstOfMonth(dueOn) : dueOn,
        due_precision: precision,
        remind_days_before: remind ? (Number(remindDays) || 0) : null,
        category_id: categoryId,
        note: note.trim(),
      }
      if (planned) await update.mutateAsync({ id: planned.id, patch: input })
      else await create.mutateAsync(input)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lưu thất bại, thử lại.')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!planned) return
    if (
      !(await confirmDialog({
        title: `Xóa "${planned.title}"?`,
        message: 'Chỉ xóa khỏi danh sách sắp chi. Giao dịch đã ghi (nếu có) vẫn giữ nguyên.',
        danger: true,
        confirmLabel: 'Xóa',
      }))
    )
      return
    try {
      await remove.mutateAsync(planned.id)
      showToast('Đã xóa khoản sắp chi')
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Thao tác thất bại, thử lại.', 'error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-fg-primary">
          {planned ? 'Sửa khoản sắp chi' : 'Thêm khoản sắp chi'}
        </h2>

        <label className="mb-1 block text-xs font-medium text-fg-muted" htmlFor="planned-title">
          Chi cái gì
        </label>
        <input
          id="planned-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ví dụ: đóng phí vệ sinh"
          className="mb-3 w-full rounded-lg border border-border-strong px-3 py-2 text-base outline-green-500 sm:text-sm"
        />

        {/* <span>: hàng này có HAI ô (MoneyField + chọn loại tiền) nên không có một đích
            duy nhất cho `htmlFor`; mỗi ô tự mang tên qua `ariaLabel`. */}
        <span className="mb-1 block text-xs font-medium text-fg-muted">
          Ước tính <span className="text-fg-muted">(để trống nếu chưa biết)</span>
        </span>
        <div className="mb-3 flex gap-2">
          <MoneyField
            value={amount}
            onChange={setAmount}
            currency={currency}
            autoOpen={false}
            ariaLabel="Số tiền ước tính"
            className="flex-1 rounded-lg border border-border-strong px-3 py-2 text-right text-sm font-semibold outline-green-500"
          />
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            aria-label="Loại tiền"
            className="w-24 shrink-0 rounded-lg border border-border-strong bg-surface px-2 py-2 text-sm"
          >
            {Object.keys(CURRENCIES).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Nhãn cho một HÀNG NÚT → <span> + role="group" mang tên. */}
        <span className="mb-1 block text-xs font-medium text-fg-muted">Chắc tới đâu</span>
        <div
          role="group"
          aria-label="Chắc tới đâu"
          className="mb-1 flex overflow-hidden rounded-lg border border-border-strong"
        >
          {PRECISION.map(([value, label, title2]) => (
            <button
              key={value}
              type="button"
              title={title2}
              onClick={() => setPrecision(value)}
              aria-pressed={precision === value}
              className={`min-h-11 flex-1 px-2 text-sm font-medium ${
                precision === value
                  ? 'bg-green-700 text-white'
                  : 'text-fg-secondary hover:bg-surface-sunken'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mb-3 text-xs text-fg-muted">
          {precision === 'day'
            ? 'Danh sách hiện đúng ngày này.'
            : 'Danh sách chỉ hiện tháng — không bịa ra một ngày cụ thể.'}
        </p>

        <label className="mb-1 block text-xs font-medium text-fg-muted" htmlFor="planned-due">
          {precision === 'day' ? 'Ngày đến hạn' : 'Tháng dự kiến'}
        </label>
        <input
          id="planned-due"
          type={precision === 'day' ? 'date' : 'month'}
          value={precision === 'day' ? dueOn : dueOn.slice(0, 7)}
          onChange={(e) =>
            setDueOn(precision === 'day' ? e.target.value : `${e.target.value}-01`)
          }
          className="mb-3 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm outline-green-500"
        />

        <label className="mb-1 flex min-h-11 items-center gap-2 text-sm text-fg-primary">
          <input
            type="checkbox"
            checked={remind}
            onChange={(e) => setRemind(e.target.checked)}
            className="h-4 w-4 accent-green-700"
          />
          Nhắc tôi
        </label>
        {remind ? (
          <div className="mb-3 flex items-center gap-2">
            <label className="text-xs text-fg-muted" htmlFor="planned-remind">
              Nhắc trước
            </label>
            <input
              id="planned-remind"
              inputMode="numeric"
              value={remindDays}
              onChange={(e) => setRemindDays(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
              className="w-16 rounded-lg border border-border-strong px-2 py-1.5 text-right text-base outline-green-500 sm:text-sm"
            />
            <span className="text-xs text-fg-muted">ngày (0 = đúng ngày đến hạn)</span>
          </div>
        ) : (
          <Guide className="mb-3 text-xs text-fg-muted">
            Không kêu gì cả — chỉ nằm trong danh sách để bạn nhìn.
          </Guide>
        )}

        <label className="mb-1 block text-xs font-medium text-fg-muted" htmlFor="planned-cat">
          Danh mục <span className="text-fg-muted">(không bắt buộc)</span>
        </label>
        <select
          id="planned-cat"
          value={categoryId ?? ''}
          onChange={(e) => setCategoryId(e.target.value || null)}
          className="mb-3 w-full rounded-lg border border-border-strong bg-surface px-2 py-2 text-sm"
        >
          <option value="">— Chưa chọn —</option>
          {expenseCats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-xs font-medium text-fg-muted" htmlFor="planned-note">
          Ghi chú <span className="text-fg-muted">(không bắt buộc)</span>
        </label>
        <input
          id="planned-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mb-3 w-full rounded-lg border border-border-strong px-3 py-2 text-base outline-green-500 sm:text-sm"
        />

        {error && <p className="mb-2 text-xs text-money-out">{error}</p>}

        <div className="flex gap-2">
          {planned && (
            <ActionButton onClick={handleDelete} className="text-money-out">
              Xóa
            </ActionButton>
          )}
          <ActionButton onClick={onClose} className="ml-auto">
            Hủy
          </ActionButton>
          <ActionButton variant="primary" onClick={handleSave} disabled={!canSave}>
            Lưu
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
