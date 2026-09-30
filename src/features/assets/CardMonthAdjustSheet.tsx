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
import { ActionButton, Money, SectionTitle } from '../../components/ui'
import { useEscClose } from '../../hooks/useEscClose'
import { MoneyField } from '../../components/MoneyField'
import { DateField } from '../../components/DateField'
import type { AccountRow } from '../../types/database.types'
import { monthAdjustDate, monthAdjustPlan } from './cardMonthCharge'
import { ADJUST_CATEGORY_ICON, ADJUST_CATEGORY_NAME, findAdjustCategory } from './reconcile'
import { tr } from '../../i18n'

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
        note: `Điều chỉnh sao kê ${monthLabel.toLowerCase()}`, // i18n-ignore — ghi chú lưu vào DB cùng giao dịch
        // Khoản bù của MỘT kỳ — vẫn tính là tiền quẹt, kể cả khi ghi chú bị sửa trùng
        // chữ "Điều chỉnh số nợ" (isBalanceAdjust).
        adjust_kind: 'statement_month',
        exclude_from_stats: true,
      })
      onClose()
    } catch (err) {
      showToast(tr('Không lưu được: {error}', { error: (err as Error).message }), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle role="block" className="mb-1">{tr('Chỉnh cho khớp sao kê')}</SectionTitle>
        <p className="mb-3 text-sm text-fg-muted">
          {tr('{name} · sao kê {month} ({period}) · app đang tính {amount}', {
            name: account.name,
            month: monthLabel.toLowerCase(),
            period: periodLabel,
            amount: formatMoney(charged, currency),
          })}
        </p>

        {/* <span>: MoneyField có hai ô (chạm/desktop), tên đến từ `ariaLabel`. */}
        <span className="mb-1 block text-sm font-medium text-fg-muted">
          {tr('Tổng thật trên sao kê')}
        </span>
        <div className="mb-3">
          <MoneyField
            value={entered}
            onChange={setEntered}
            currency={currency}
            ariaLabel={tr('Tổng thật trên sao kê')}
            onEnter={handleSubmit}
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-lg font-semibold dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        {/* <span> chứ không <label>: ô ngày là <button>, tên đi qua ariaLabel. */}
        <span className="mb-1 block text-sm font-medium text-fg-muted">{tr('Ghi vào ngày')}</span>
        {/* Kẹp trong kỳ: khoản bù rơi sang tháng khác thì tháng này vẫn lệch */}
        <DateField
          ariaLabel={tr('Ghi vào ngày')}
          value={occurredOn}
          min={rangeStartISO}
          max={lastDayISO}
          onChange={setOccurredOn}
          className="mb-1 w-full px-3 py-2"
        />
        <p className="mb-3 text-sm text-fg-muted">
          {suggestedDate === todayISO
            ? tr('Ghi vào hôm nay — vẫn nằm trong kỳ.')
            : tr('Ghi vào ngày chốt kỳ ({date}), để khoản bù nằm đúng trong kỳ.', {
                date: dayMonthLabel(lastDayISO),
              })}{' '}
          {tr('Chỉ chọn được ngày trong kỳ {period}.', { period: periodLabel })}
        </p>

        <div className="mb-3 rounded-lg bg-surface-sunken px-3 py-2 text-sm">
          <div className="flex items-center justify-between text-fg-muted">
            <span>{tr('Chênh lệch')}</span>
            {/* Không in dấu +/−: câu giải thích ngay dưới đã nói rõ chiều, mà dấu
                của <Money> gắn với tone (out → '-') nên "thiếu tiền" sẽ ra dấu ngược */}
            <Money
              amount={Math.abs(diff)}
              currency={currency}
              tone={diff === 0 ? 'neutral' : diff > 0 ? 'out' : 'in'}
              className="font-semibold"
            />
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {diff === 0
              ? tr('Số đã khớp — không cần chỉnh.')
              : diff > 0
                ? tr('App đang thiếu — sẽ thêm một khoản chi bù vào thẻ (không tính vào thống kê).')
                : tr('App đang thừa — sẽ thêm một khoản thu bù vào thẻ (không tính vào thống kê).')}
          </p>
        </div>

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-surface-sunken"
          >
            {tr('Hủy')}
          </button>
          <ActionButton variant="primary" onClick={handleSubmit} disabled={!canSave}>
            {saving ? tr('Đang lưu…') : tr('Chỉnh')}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
