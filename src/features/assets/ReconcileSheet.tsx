import { useState } from 'react'
import { useCategories, useCreateCategory, useCreateTransaction } from '../../hooks/queries'
import { dayMonthLabel, toISODate } from '../../lib/dates'
import { showToast } from '../../lib/dialog'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import { ActionButton } from '../../components/ui'
import { MoneyField } from '../../components/MoneyField'
import { DateField } from '../../components/DateField'
import type { AccountRow } from '../../types/database.types'
import { useEscClose } from '../../hooks/useEscClose'
import {
  ADJUST_CATEGORY_ICON,
  ADJUST_CATEGORY_NAME,
  CARD_RECONCILE_NOTE,
  cardDebt,
  defaultAdjustDate,
  findAdjustCategory,
  reconcilePlan,
} from './reconcile'

interface Props {
  account: AccountRow
  /** Số dư sổ hiện tại (minor units theo currency tài khoản). Thẻ đang nợ → âm. */
  currentBalance: number
  /** Thẻ: nợ ĐÃ CHỐT chờ rút (cardStatementSplit.billed). null/0 = không có. */
  billedPending?: number | null
  /** Ngày sẽ bị rút phần đã chốt — để câu cảnh báo nói rõ mốc. */
  billedDueISO?: string | null
  onClose: () => void
}

/**
 * Sheet "Điều chỉnh số dư" (mục X): nhập số dư THỰC TẾ → app tạo một giao dịch
 * điều chỉnh (thu/chi) bù phần chênh lệch. Giao dịch này mang exclude_from_stats=true
 * nên KHÔNG lọt vào báo cáo/ngân sách/insight, nhưng vẫn khớp lại số dư tài khoản.
 *
 * Thẻ tín dụng nhập theo SỐ ĐANG NỢ (dương) cho khớp cách app hiển thị thẻ ở mọi
 * nơi khác; phần đổi dấu nằm trong reconcilePlan.
 */
export function ReconcileSheet({
  account,
  currentBalance,
  billedPending,
  billedDueISO,
  onClose,
}: Props) {
  useEscClose(onClose)
  const create = useCreateTransaction()
  const createCategory = useCreateCategory()
  const { data: categories = [] } = useCategories()
  const currency = account.currency as CurrencyCode
  const isCard = account.type === 'card'
  const shown = isCard ? cardDebt(currentBalance) : currentBalance

  const todayISO = toISODate(new Date())
  // Thẻ: lùi về ngày chốt sao kê để engine tự-trả nhìn thấy khoản bù (xem
  // defaultAdjustDate). Người dùng vẫn sửa được nếu muốn ghi ngày khác.
  const suggestedDate = defaultAdjustDate({
    isCard,
    statementDay: account.statement_day,
    paymentDueDay: account.payment_due_day,
    todayISO,
  })

  const [entered, setEntered] = useState(shown)
  const [occurredOn, setOccurredOn] = useState(suggestedDate)
  const [saving, setSaving] = useState(false)

  const { diff, type } = reconcilePlan({ isCard, currentBalance, entered })
  const canSave = diff !== 0 && !saving

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      // Chi/thu bắt buộc có danh mục — dùng danh mục bù riêng, tạo lần đầu nếu chưa có
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
        note: isCard ? CARD_RECONCILE_NOTE : 'Điều chỉnh số dư',
        exclude_from_stats: true,
      })
      onClose()
    } catch (err) {
      // Không nuốt lỗi: trước đây sheet chỉ đứng im, người dùng không biết vì sao
      showToast(`Không lưu được: ${(err as Error).message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-bold text-fg-primary">
          {isCard ? 'Điều chỉnh số nợ' : 'Điều chỉnh số dư'}
        </h2>
        <p className="mb-3 text-xs text-fg-muted">
          {account.name} · {isCard ? 'sổ đang ghi nợ' : 'số dư sổ hiện tại'}{' '}
          {formatMoney(shown, currency)} ({CURRENCIES[currency].label})
        </p>

        {/* Bẫy hay gặp: điều chỉnh tổng nợ mà quên kỳ đã chốt chờ rút → dòng
            "Kỳ này" về 0 như thể không phải trả, người dùng tưởng app hỏng. */}
        {isCard && (billedPending ?? 0) > 0 && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            Thẻ đang có kỳ <b>đã chốt chờ rút</b>: {formatMoney(billedPending ?? 0, currency)}
            {billedDueISO ? ` vào ${dayMonthLabel(billedDueISO)}` : ''}. Số "đang nợ thực tế" phải
            gồm cả khoản này — nhập thiếu thì dòng "Kỳ này" sẽ về {formatMoney(0, currency)} như
            thể không phải trả.
          </p>
        )}

        {/* <span>: MoneyField có hai ô (chạm/desktop), tên đến từ `ariaLabel`. */}
        <span className="mb-1 block text-xs font-medium text-fg-muted">
          {isCard ? 'Số đang nợ thực tế' : 'Số dư thực tế'}
        </span>
        <div className="mb-3">
          <MoneyField
            value={entered}
            onChange={setEntered}
            currency={currency}
            ariaLabel={isCard ? 'Số đang nợ thực tế' : 'Số dư thực tế'}
            onEnter={handleSubmit}
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-lg font-semibold outline-green-500 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        {/* <span> chứ không <label>: ô ngày là <button>, tên đi qua ariaLabel. */}
        <span className="mb-1 block text-xs font-medium text-fg-muted">Ghi vào ngày</span>
        <DateField
          ariaLabel="Ghi vào ngày"
          value={occurredOn}
          max={todayISO}
          onChange={setOccurredOn}
          className="mb-1 w-full px-3 py-2"
        />
        {/* Chỉ giải thích khi ngày mặc định KHÁC hôm nay — tức là thẻ có đủ ngày
            chốt/đến hạn và mốc chốt đã qua. Ví thường không cần đọc đoạn này. */}
        <p className="mb-3 text-xs text-fg-muted">
          {occurredOn === suggestedDate && suggestedDate !== todayISO
            ? 'Mặc định là ngày chốt sao kê gần nhất, để lần tự trả thẻ kế tiếp rút đúng số.'
            : occurredOn > suggestedDate && suggestedDate !== todayISO
              ? 'Ghi sau ngày chốt sao kê: lần tự trả thẻ kế tiếp sẽ KHÔNG thấy khoản bù này.'
              : 'Số dư khớp lại kể từ ngày này.'}
        </p>

        <div className="mb-3 rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm">
          <div className="flex items-center justify-between text-fg-muted">
            <span>{isCard ? 'Nợ thay đổi' : 'Chênh lệch'}</span>
            <span
              className={`tabular-nums font-semibold ${
                diff === 0
                  ? 'text-fg-muted'
                  : diff > 0
                    ? 'text-money-in'
                    : 'text-money-out'
              }`}
            >
              {/* Thẻ: diff âm nghĩa là nợ TĂNG, nên đảo dấu hiển thị cho dễ đọc */}
              {diff === 0 ? '' : (isCard ? diff < 0 : diff > 0) ? '+' : '−'}
              {formatMoney(Math.abs(diff), currency)}
            </span>
          </div>
          <p className="mt-1 text-xs text-fg-muted">
            {diff === 0
              ? isCard
                ? 'Số nợ đã khớp — không cần điều chỉnh.'
                : 'Số dư đã khớp — không cần điều chỉnh.'
              : isCard
                ? `Nợ thật ${diff > 0 ? 'ít' : 'nhiều'} hơn sổ — sẽ tạo một giao dịch bù trên thẻ (không tính vào thống kê).`
                : `Sẽ tạo một giao dịch ${diff > 0 ? 'thu' : 'chi'} điều chỉnh (không tính vào thống kê).`}
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
            {saving ? 'Đang lưu…' : 'Điều chỉnh'}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
