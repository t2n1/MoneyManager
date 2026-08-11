import { useState } from 'react'
import { useCategories, useCreateCategory, useCreateTransaction } from '../../hooks/queries'
import {
  addDaysISO,
  dayMonthLabel,
  formatMonthLabel,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { showToast } from '../../lib/dialog'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { ActionButton, Money } from '../../components/ui'
import { useEscClose } from '../../hooks/useEscClose'
import { MoneyField } from '../../components/MoneyField'
import type { AccountRow } from '../../types/database.types'
import { monthAdjustDate, monthAdjustPlan } from './cardMonthCharge'
import { ADJUST_CATEGORY_ICON, ADJUST_CATEGORY_NAME, findAdjustCategory } from './reconcile'

interface Props {
  account: AccountRow
  monthKey: MonthKey
  /** Tổng tiền quẹt app đang tính cho tháng này (dương). */
  charged: number
  /** Ngày đầu khoảng đang xem (`getMonthRange().start`). */
  rangeStartISO: string
  /** Ngày đầu tháng kế của khoảng đang xem (mốc loại trừ của `getMonthRange`). */
  rangeEndISO: string
  onClose: () => void
}

/**
 * Sheet "Chỉnh cho khớp": gõ tổng tiền THẬT của tháng theo sao kê thẻ, app tạo
 * một giao dịch bù phần chênh ghi vào chính tháng đó.
 *
 * Khác `ReconcileSheet` ở chỗ nó chỉnh MỘT THÁNG chứ không chỉnh tổng nợ hôm nay
 * — sai ở tháng 6 thì bù vào tháng 6, không đẩy hết chênh lệch về hôm nay.
 */
export function CardMonthAdjustSheet({
  account,
  monthKey,
  charged,
  rangeStartISO,
  rangeEndISO,
  onClose,
}: Props) {
  useEscClose(onClose)
  const create = useCreateTransaction()
  const createCategory = useCreateCategory()
  const { data: categories = [] } = useCategories()
  const currency = account.currency as CurrencyCode

  const todayISO = toISODate(new Date())
  const lastDayISO = addDaysISO(rangeEndISO, -1)
  const suggestedDate = monthAdjustDate({ rangeStartISO, rangeEndISO, todayISO })
  const monthLabel = formatMonthLabel(monthKey)
  // "1/8 – 31/8": kỳ sao kê thường KHÁC tháng lịch cùng tên, nên chỗ nào nhắc tới
  // khoảng thời gian đều ghi ngày ra thay vì mượn tên tháng.
  const periodLabel = `${dayMonthLabel(rangeStartISO)} – ${dayMonthLabel(lastDayISO)}`

  const [entered, setEntered] = useState(charged)
  const [occurredOn, setOccurredOn] = useState(suggestedDate)
  const [saving, setSaving] = useState(false)

  const { diff, type } = monthAdjustPlan({ charged, entered })
  const canSave = diff !== 0 && !saving

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      // Chi/thu bắt buộc có danh mục — dùng chung danh mục bù với "Điều chỉnh số dư"
      const categoryId =
        findAdjustCategory(categories, type)?.id ??
        (
          await createCategory.mutateAsync({
            name: ADJUST_CATEGORY_NAME,
            type,
            icon: ADJUST_CATEGORY_ICON,
          })
        ).id
      await create.mutateAsync({
        type,
        amount: Math.abs(diff),
        to_amount: null,
        category_id: categoryId,
        account_id: account.id,
        to_account_id: null,
        occurred_on: occurredOn,
        note: `Điều chỉnh sao kê ${monthLabel.toLowerCase()}`,
        exclude_from_stats: true,
      })
      onClose()
    } catch (err) {
      showToast(`Không lưu được: ${(err as Error).message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-bold text-fg-primary">Chỉnh cho khớp sao kê</h2>
        <p className="mb-3 text-xs text-fg-muted">
          {account.name} · sao kê {monthLabel.toLowerCase()} ({periodLabel}) · app đang tính{' '}
          {formatMoney(charged, currency)}
        </p>

        {/* <span>: MoneyField có hai ô (chạm/desktop), tên đến từ `ariaLabel`. */}
        <span className="mb-1 block text-xs font-medium text-fg-muted">
          Tổng thật trên sao kê
        </span>
        <div className="mb-3">
          <MoneyField
            value={entered}
            onChange={setEntered}
            currency={currency}
            ariaLabel="Tổng thật trên sao kê"
            onEnter={handleSubmit}
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-lg font-semibold outline-green-500 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        <label className="mb-1 block text-xs font-medium text-fg-muted" htmlFor="month-adjust-date">
          Ghi vào ngày
        </label>
        {/* Kẹp trong kỳ: khoản bù rơi sang tháng khác thì tháng này vẫn lệch */}
        <input
          id="month-adjust-date"
          type="date"
          value={occurredOn}
          min={rangeStartISO}
          max={lastDayISO}
          onChange={(e) => setOccurredOn(e.target.value)}
          className="mb-1 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm outline-green-500"
        />
        <p className="mb-3 text-xs text-fg-muted">
          {suggestedDate === todayISO
            ? 'Ghi vào hôm nay — vẫn nằm trong kỳ.'
            : `Ghi vào ngày chốt kỳ (${dayMonthLabel(lastDayISO)}), để khoản bù nằm đúng trong kỳ.`}{' '}
          Chỉ chọn được ngày trong kỳ {periodLabel}.
        </p>

        <div className="mb-3 rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm">
          <div className="flex items-center justify-between text-fg-muted">
            <span>Chênh lệch</span>
            {/* Không in dấu +/−: câu giải thích ngay dưới đã nói rõ chiều, mà dấu
                của <Money> gắn với tone (out → '-') nên "thiếu tiền" sẽ ra dấu ngược */}
            <Money
              amount={Math.abs(diff)}
              currency={currency}
              tone={diff === 0 ? 'neutral' : diff > 0 ? 'out' : 'in'}
              className="font-semibold"
            />
          </div>
          <p className="mt-1 text-xs text-fg-muted">
            {diff === 0
              ? 'Số đã khớp — không cần chỉnh.'
              : diff > 0
                ? 'App đang thiếu — sẽ thêm một khoản chi bù vào thẻ (không tính vào thống kê).'
                : 'App đang thừa — sẽ thêm một khoản thu bù vào thẻ (không tính vào thống kê).'}
          </p>
        </div>

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Hủy
          </button>
          <ActionButton variant="primary" onClick={handleSubmit} disabled={!canSave}>
            {saving ? 'Đang lưu…' : 'Chỉnh'}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
