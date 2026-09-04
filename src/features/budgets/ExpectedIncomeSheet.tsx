import { useState } from 'react'
import { useDeleteMonthPlan, useRates, useUpsertMonthPlan } from '../../hooks/queries'
import { useEscClose } from '../../hooks/useEscClose'
import { MoneyField, MONEY_FIELD_CLASS } from '../../components/MoneyField'
import { Guide } from '../../components/Guide'
import { ActionButton, SectionTitle } from '../../components/ui'
import { formatMoney } from '../../lib/money'

interface Props {
  monthKey: string
  monthLabel: string
  /** số đang khai; null = đang dùng số trung bình */
  declared: number | null
  /** trung bình các tháng đã đóng sổ; null = chưa đủ dữ liệu */
  baseline: number | null
  onClose: () => void
}

/**
 * Khai thu dự kiến cho một tháng (migration 0041).
 *
 * Bỏ số khai là XOÁ hẳn dòng, không phải gõ 0: 0 ở đây là con số thật (tháng nghỉ
 * không lương), khác hẳn ô hạn mức nơi 0 mang nghĩa "bỏ trần này đi".
 */
export function ExpectedIncomeSheet({
  monthKey,
  monthLabel,
  declared,
  baseline,
  onClose,
}: Props) {
  useEscClose(onClose)
  const { base } = useRates()
  const upsert = useUpsertMonthPlan()
  const remove = useDeleteMonthPlan()
  const [amount, setAmount] = useState(declared ?? baseline ?? 0)

  async function handleSave() {
    try {
      await upsert.mutateAsync({ monthKey, expectedIncome: amount })
    } catch {
      // Lưu hỏng thì GIỮ sheet mở (toast lỗi toàn cục đã báo) — đóng sheet mà không
      // lưu được thì người dùng tưởng xong.
      return
    }
    onClose()
  }

  async function handleReset() {
    try {
      await remove.mutateAsync(monthKey)
    } catch {
      return
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl bg-surface-page p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle role="block">Thu dự kiến {monthLabel}</SectionTitle>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-sunken"
          >
            Đóng
          </button>
        </div>

        <Guide className="mb-2 text-sm text-fg-muted">
          Cả kế hoạch chia từ con số này. Tháng có thưởng thì khai tay — số trung bình
          của mấy tháng trước không biết trước được khoản thưởng.
        </Guide>

        {/* <span>: MoneyField có hai ô (chạm/desktop), tên đến từ `ariaLabel`. */}
        <span className="mb-1 block text-sm font-medium text-fg-muted">
          Số dự kiến ({base})
        </span>
        <MoneyField
          value={amount}
          onChange={setAmount}
          currency={base}
          ariaLabel="Thu dự kiến của tháng"
          onEnter={handleSave}
          className={MONEY_FIELD_CLASS}
        />

        {baseline !== null && (
          <ActionButton onClick={() => setAmount(baseline)} className="mt-2">
            Dùng {formatMoney(baseline, base)} (trung bình 3 tháng)
          </ActionButton>
        )}

        <div className="mt-4 flex gap-2">
          {declared !== null && (
            <ActionButton onClick={handleReset}>Bỏ số khai</ActionButton>
          )}
          <ActionButton variant="primary" onClick={handleSave} className="flex-1">
            Lưu
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
