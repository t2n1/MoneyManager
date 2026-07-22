import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { NewTransaction } from '../../data'
import {
  useAccounts,
  useCategories,
  useCreateDebt,
  useCreateTransaction,
  useDeleteTransaction,
} from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { CURRENCIES, formatMoney, parseMoney } from '../../lib/money'

interface Props {
  onClose: () => void
}

/**
 * Sheet "Trả hộ / chia bill": mình trả cả hóa đơn, một phần là người khác nợ lại.
 * Tách thành 2 bút toán: (1) chi phần của mình (vào báo cáo bình thường), và
 * (2) khoản cho vay phần người khác kèm giải ngân có cờ is_debt_flow — trừ số dư
 * tài khoản nhưng KHÔNG lọt vào báo cáo Chi/Thu.
 */
export function SplitBillSheet({ onClose }: Props) {
  const createTx = useCreateTransaction()
  const createDebt = useCreateDebt()
  const deleteTx = useDeleteTransaction()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.is_archived),
    [accounts],
  )
  const expenseCategories = useMemo(
    () => categories.filter((c) => !c.is_archived && c.type === 'expense'),
    [categories],
  )

  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [totalDigits, setTotalDigits] = useState('')
  const [othersDigits, setOthersDigits] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [occurredOn, setOccurredOn] = useState(toISODate(new Date()))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMore, setShowMore] = useState(false)

  // Điền mặc định khi dữ liệu về / thay đổi
  useEffect(() => {
    if (!activeAccounts.some((a) => a.id === accountId)) {
      setAccountId(activeAccounts[0]?.id ?? '')
    }
  }, [accountId, activeAccounts])
  useEffect(() => {
    if (!expenseCategories.some((c) => c.id === categoryId)) {
      setCategoryId(expenseCategories[0]?.id ?? '')
    }
  }, [categoryId, expenseCategories])

  const currency = activeAccounts.find((a) => a.id === accountId)?.currency ?? 'JPY'
  const total = totalDigits === '' ? 0 : Number(totalDigits)
  const others = othersDigits === '' ? 0 : Number(othersDigits)
  const mine = total - others

  const canSave =
    total > 0 &&
    others > 0 &&
    others <= total &&
    counterparty.trim().length > 0 &&
    !!accountId &&
    !!categoryId &&
    !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    // Phần của mình = chi thật (chỉ tạo khi > 0; trả hộ 100% thì bỏ qua)
    let ownTxId: string | null = null
    try {
      if (mine > 0) {
        const ownTx: NewTransaction = {
          type: 'expense',
          amount: mine,
          to_amount: null,
          category_id: categoryId,
          account_id: accountId,
          to_account_id: null,
          occurred_on: occurredOn,
          note: note.trim() || `Trả hộ · ${counterparty.trim()}`,
        }
        const row = await createTx.mutateAsync(ownTx)
        ownTxId = row.id
      }
      // Phần người khác = khoản cho vay + giải ngân (repo tự gắn cờ is_debt_flow)
      await createDebt.mutateAsync({
        counterparty: counterparty.trim(),
        direction: 'owed_to_me',
        currency,
        principal: others,
        due_on: null,
        note: note.trim(),
        transaction: {
          type: 'expense',
          amount: others,
          to_amount: null,
          category_id: categoryId,
          account_id: accountId,
          to_account_id: null,
          occurred_on: occurredOn,
          note: note.trim() || `Cho vay (trả hộ) · ${counterparty.trim()}`,
        },
      })
      onClose()
    } catch (e) {
      // Bồi hoàn: nếu đã tạo chi của mình mà tạo khoản nợ hỏng thì xóa lại
      if (ownTxId) {
        try {
          await deleteTx.mutateAsync(ownTxId)
        } catch {
          /* để nguyên: người dùng có thể xóa tay nếu cần */
        }
      }
      setError(e instanceof Error ? e.message : 'Lưu thất bại, thử lại.')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white dark:bg-gray-900 p-4 lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-bold text-gray-800 dark:text-gray-100">Trả hộ / chia bill</h2>
        <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
          Phần cho vay không tính vào báo cáo Chi/Thu.
        </p>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Tổng đã trả
        </label>
        <input
          inputMode="numeric"
          autoFocus
          value={total === 0 ? '' : formatMoney(total, currency)}
          onChange={(e) => {
            const parsed = String(parseMoney(e.target.value))
            setTotalDigits(parsed === '0' ? '' : parsed)
          }}
          placeholder={formatMoney(0, currency)}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-lg font-semibold outline-green-500"
        />

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Trả từ tài khoản
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm"
            >
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {CURRENCIES[a.currency].symbol}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Danh mục (phần của mình)
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm"
            >
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Phần người khác nợ lại
        </label>
        <input
          inputMode="numeric"
          value={others === 0 ? '' : formatMoney(others, currency)}
          onChange={(e) => {
            const parsed = String(parseMoney(e.target.value))
            setOthersDigits(parsed === '0' ? '' : parsed)
          }}
          placeholder={formatMoney(0, currency)}
          className="mb-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-lg font-semibold outline-green-500"
        />
        {total > 0 && others > 0 && (
          others > total ? (
            <p className="mb-3 text-xs text-red-600 dark:text-red-400">
              Phần người khác không được lớn hơn tổng.
            </p>
          ) : (
            <p className="mb-3 text-right text-xs text-gray-500 dark:text-gray-400">
              Phần của mình (tính vào chi tiêu):{' '}
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                {formatMoney(mine, currency)}
              </span>
            </p>
          )
        )}

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Ai nợ mình
        </label>
        <input
          value={counterparty}
          onChange={(e) => setCounterparty(e.target.value)}
          placeholder="Tên người"
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-green-500"
        />

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
          {showMore ? 'Ẩn bớt' : 'Thêm chi tiết'}
        </button>
        {showMore && (
          <div className="mt-2">
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Ngày</label>
            <input
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm outline-green-500"
            />

            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Ghi chú (không bắt buộc)
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: ăn trưa cùng"
              className="mb-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-green-500"
            />
          </div>
        )}

        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}
