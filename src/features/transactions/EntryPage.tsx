import { useEffect, useRef, useState } from 'react'
import { useCreateTransaction } from '../../hooks/queries'
import { TransactionForm } from './TransactionForm'

/** Màn hình mặc định khi mở app — nhập một giao dịch phải < 5 giây. */
export function EntryPage() {
  const create = useCreateTransaction()
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col p-3 lg:h-dvh lg:p-6">
      <TransactionForm
        submitLabel="Lưu"
        resetAfterSubmit
        onSubmit={async (values) => {
          await create.mutateAsync(values)
          setToast('Đã lưu ✓')
          clearTimeout(toastTimer.current)
          toastTimer.current = setTimeout(() => setToast(null), 1500)
        }}
      />
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center">
          <div className="rounded-full bg-gray-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}
