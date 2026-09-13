// Thêm một giao dịch vào sổ TỪ một dòng sao kê: ngày, tiền, thẻ, tên quán đã điền, người
// dùng chỉ chọn danh mục rồi lưu. Đây là nửa còn lại của "Sửa" trên trang đối chiếu:
// "sổ có, thẻ không" thì mở EditTransactionSheet; "thẻ có, sổ không" thì mở màn này.
//
// `initial` là TransactionRow GIẢ (id rỗng) do `prefillFromLine` dựng — hợp đồng đã ghi
// ở chú thích `initialTagIds` của TransactionForm. `showRefundOption` bật để dòng thẻ âm
// (đã điền `is_refund`) hiện đúng ô tích, người dùng thấy và đổi được.

import { useEffect, useRef } from 'react'
import { SectionTitle } from '../../components/ui'
import { useCreateTransaction } from '../../hooks/queries'
import { useEscClose } from '../../hooks/useEscClose'
import type { TransactionRow } from '../../types/database.types'
import { TransactionForm } from '../transactions/TransactionForm'

interface Props {
  initial: TransactionRow
  onClose: () => void
  /** Gọi SAU khi lưu thành công — trang đếm số lần sửa để nhắc "Chỉnh số nợ". */
  onSaved: () => void
}

export function AddFromStatementSheet({ initial, onClose, onSaved }: Props) {
  useEscClose(onClose)
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [])
  const create = useCreateTransaction()

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center lg:p-6 animate-overlay-in"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-from-stm-title"
        tabIndex={-1}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface-page p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none lg:max-w-5xl lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle role="block" id="add-from-stm-title">
            Thêm vào sổ từ sao kê
          </SectionTitle>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-sunken"
          >
            Đóng
          </button>
        </div>
        <TransactionForm
          initial={initial}
          showRefundOption
          submitLabel="Thêm vào sổ"
          onSubmit={async (values) => {
            await create.mutateAsync(values)
            onSaved()
            onClose()
          }}
        />
      </div>
    </div>
  )
}
