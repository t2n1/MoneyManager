// Chia một giao dịch thành nhiều dòng.
//
// Phép tính (và bất biến "tổng các phần = số gốc") nằm trọn ở splitTransaction.ts, 16
// test. Ở đây chỉ có ô nhập và câu chữ.
//
// KHÔNG có quan hệ cha–con trong DB: thay một dòng bằng N dòng. Xem lý do ở đầu
// splitTransaction.ts.

import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ActionButton, Money, SectionTitle, Select, actionButtonClass } from '../../components/ui'
import { Guide } from '../../components/Guide'
import { MoneyField } from '../../components/MoneyField'
import { useCategories, useCreateTransaction, useDeleteTransaction } from '../../hooks/queries'
import { showToast } from '../../lib/dialog'
import type { CurrencyCode } from '../../lib/money'
import type { TransactionRow } from '../../types/database.types'
import { evenSplit, planSplit, MIN_PARTS, type SplitPart } from './splitTransaction'

interface Props {
  tx: TransactionRow
  currency: CurrencyCode
  onClose: () => void
  /** Gọi sau khi chia xong — nơi gọi đóng luôn form sửa đang mở phía sau. */
  onDone: () => void
}

export function SplitSheet({ tx, currency, onClose, onDone }: Props) {
  const { data: categories = [] } = useCategories()
  const create = useCreateTransaction()
  const del = useDeleteTransaction()
  const [dangChay, setDangChay] = useState(false)

  const [parts, setParts] = useState<SplitPart[]>(() => {
    const chia = evenSplit(tx.amount, MIN_PARTS)
    return chia.map((amount) => ({ amount, categoryId: tx.category_id, note: tx.note }))
  })

  const plan = useMemo(() => planSplit(tx.amount, parts), [tx.amount, parts])

  const catOptions = categories
    .filter((c) => c.type === tx.type && !c.is_archived)
    .map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }))

  const setPart = (i: number, patch: Partial<SplitPart>) =>
    setParts((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  const themPhan = () =>
    setParts((prev) => [...prev, { amount: 0, categoryId: tx.category_id, note: tx.note }])

  const boPhan = (i: number) =>
    setParts((prev) => (prev.length <= MIN_PARTS ? prev : prev.filter((_, j) => j !== i)))

  const chiaDeu = () => {
    const chia = evenSplit(tx.amount, parts.length)
    setParts((prev) => prev.map((p, i) => ({ ...p, amount: chia[i] ?? 0 })))
  }

  async function handleSplit() {
    if (plan.error !== null || dangChay) return
    setDangChay(true)
    try {
      // TẠO TRƯỚC, XOÁ SAU. Ngược lại thì một lỗi mạng giữa chừng làm mất hẳn giao dịch
      // gốc mà chưa có dòng nào thay thế — người dùng mất số đã ghi. Theo thứ tự này,
      // ca xấu nhất là thừa vài dòng, và thừa thì nhìn thấy được để sửa.
      for (const p of plan.parts) {
        await create.mutateAsync({
          type: tx.type,
          amount: p.amount,
          to_amount: null,
          category_id: p.categoryId,
          account_id: tx.account_id,
          to_account_id: tx.to_account_id,
          occurred_on: tx.occurred_on,
          note: p.note,
          is_refund: tx.is_refund,
          is_debt_flow: tx.is_debt_flow,
        })
      }
      await del.mutateAsync(tx.id)
    } catch {
      setDangChay(false)
      return
    }
    showToast(`Đã chia thành ${plan.parts.length} dòng`, 'success')
    onDone()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 lg:items-center lg:p-6 animate-overlay-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="split-title"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface-page p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <SectionTitle id="split-title">Chia giao dịch</SectionTitle>
          <Money amount={tx.amount} currency={currency} className="text-sm font-semibold" />
        </div>
        <Guide className="mb-3 text-2xs text-fg-muted">
          Một lần đi siêu thị gồm đồ ăn và đồ dùng nhà thì đây là chỗ tách chúng ra. Giao
          dịch gốc được thay bằng {plan.parts.length} dòng cộng lại <b>đúng bằng</b> nó —
          phần cuối luôn tự nhận số dư nên không bao giờ lệch một đồng.
        </Guide>

        <ul className="flex flex-col gap-2">
          {parts.map((p, i) => {
            const laCuoi = i === parts.length - 1
            return (
              <li key={i} className="rounded-lg border border-border-panel p-2.5">
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="mb-0.5 block text-2xs text-fg-muted">
                      {laCuoi ? `Phần ${i + 1} · phần còn lại` : `Phần ${i + 1}`}
                    </span>
                    {laCuoi ? (
                      // Phần cuối KHÔNG nhập được: nó luôn là số dư. Cho gõ thì người
                      // dùng sẽ gõ, rồi tổng lệch — mà bất biến của cả tính năng này là
                      // tổng không bao giờ lệch.
                      <Money
                        amount={plan.parts[i]?.amount ?? 0}
                        currency={currency}
                        tone={plan.error === null ? 'neutral' : 'out'}
                        className="block py-2 text-lg"
                      />
                    ) : (
                      <MoneyField
                        currency={currency}
                        value={p.amount}
                        onChange={(v) => setPart(i, { amount: v })}
                        autoOpen={false}
                        ariaLabel={`Số tiền phần ${i + 1}`}
                      />
                    )}
                  </div>
                  {parts.length > MIN_PARTS && (
                    <button
                      type="button"
                      onClick={() => boPhan(i)}
                      aria-label={`Bỏ phần ${i + 1}`}
                      className="mb-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-fg-muted hover:text-money-out"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <label className="mt-2 block text-2xs text-fg-muted">
                  Danh mục
                  <Select
                    value={p.categoryId ?? ''}
                    onChange={(e) => setPart(i, { categoryId: e.target.value || null })}
                    wrapClassName="mt-0.5 block w-full"
                    className="w-full"
                  >
                    <option value="">— chưa chọn —</option>
                    {catOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </label>
              </li>
            )
          })}
        </ul>

        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={themPhan} className={actionButtonClass('outline')}>
            <Plus className="h-4 w-4" /> Thêm phần
          </button>
          <button type="button" onClick={chiaDeu} className={actionButtonClass('outline')}>
            Chia đều
          </button>
        </div>

        {/* Câu lỗi KHÔNG bọc Guide: nó nói ra chính lý do nút Chia đang tắt. */}
        {plan.error !== null && (
          <p className="mt-2 rounded-md bg-state-bad-bg px-2 py-1.5 text-sm text-money-out">
            {plan.error}
          </p>
        )}

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-sunken"
          >
            Huỷ
          </button>
          <ActionButton
            variant="primary"
            onClick={handleSplit}
            disabled={plan.error !== null || dangChay}
          >
            {dangChay ? 'Đang chia…' : `Chia thành ${plan.parts.length} dòng`}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
