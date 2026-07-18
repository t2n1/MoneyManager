import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, TriangleAlert } from 'lucide-react'
import { useBudgetAlert, useCreateTransaction, useDeleteTransaction } from '../../hooks/queries'
import type { TransactionType } from '../../types/database.types'
import { TransactionForm } from './TransactionForm'

/** Màn hình mặc định khi mở app — nhập một giao dịch phải < 5 giây. */
export function EntryPage() {
  const navigate = useNavigate()
  const create = useCreateTransaction()
  const del = useDeleteTransaction()
  const { overCount } = useBudgetAlert()
  const [searchParams] = useSearchParams()
  const qType = searchParams.get('type')
  const initialType: TransactionType | undefined =
    qType === 'income' || qType === 'expense' ? qType : undefined
  const [toast, setToast] = useState<{ text: string; undoId?: string } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  async function handleUndo(id: string) {
    clearTimeout(toastTimer.current)
    await del.mutateAsync(id)
    setToast({ text: 'Đã hoàn tác' })
    toastTimer.current = setTimeout(() => setToast(null), 1500)
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:h-dvh lg:p-6">
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-1 rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 shadow-sm active:scale-95"
          aria-label="Đóng, quay lại Sổ giao dịch"
        >
          <ChevronLeft className="h-5 w-5" /> Đóng
        </button>
        <h1 className="flex-1 text-center text-base font-bold text-gray-800 dark:text-gray-100">Nhập giao dịch</h1>
        <span className="w-[4.5rem]" />
      </div>
      {overCount > 0 && (
        <Link
          to="/reports?view=budget"
          className="mb-2 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/30 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-400"
        >
          <TriangleAlert className="h-4 w-4" /> {overCount} danh mục vượt ngân sách tháng này — xem chi tiết ›
        </Link>
      )}
      <TransactionForm
        submitLabel="Lưu"
        continueLabel="Tiếp tục"
        initialType={initialType}
        // Lưu: ghi giao dịch rồi quay về Sổ GD
        onSubmit={async (values) => {
          await create.mutateAsync(values)
          navigate('/')
        }}
        // Tiếp tục: ghi giao dịch, hiện toast (kèm hoàn tác) rồi ở lại nhập tiếp
        onContinue={async (values) => {
          const row = await create.mutateAsync(values)
          setToast({ text: 'Đã lưu ✓', undoId: row.id })
          clearTimeout(toastTimer.current)
          toastTimer.current = setTimeout(() => setToast(null), 5000)
        }}
      />
      {toast && (
        <div className="fixed inset-x-0 top-4 z-50 flex justify-center">
          <div className="flex items-center gap-3 rounded-full bg-gray-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
            <span>{toast.text}</span>
            {toast.undoId && (
              <button
                type="button"
                onClick={() => handleUndo(toast.undoId!)}
                className="rounded-full bg-white/20 px-2 py-0.5 text-white active:scale-95"
              >
                Hoàn tác
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
