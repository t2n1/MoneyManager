// Banner "không tải được dữ liệu" toàn cục — vá lớp câm của mọi trang cùng lúc.
//
// Vì sao cần: mọi trang đọc dữ liệu theo mẫu `const { data = [] } = useQuery(...)`
// và không trang nào render isError. Với app tiền bạc thì đó là bug nghiêm trọng:
// query lỗi (mất mạng, RLS đổi, migration lệch) hiển thị Y HỆT "không có dữ liệu"
// — sổ trống, nợ ¥0, tài sản ¥0. Người dùng không có cách nào phân biệt.
//
// Đặt MỘT chỗ ở AppLayout thay vì sửa ~20 trang: theo dõi thẳng QueryCache, hễ có
// query ĐANG được trang nào đó dùng (observers > 0) rơi vào trạng thái lỗi là hiện.
// Trang nào muốn xử lý lỗi tinh hơn vẫn tự render isError được — banner chỉ là sàn.
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useSyncExternalStore } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { ActionButton } from './ui'

export function QueryErrorBanner() {
  const qc = useQueryClient()

  const subscribe = useCallback(
    (cb: () => void) => qc.getQueryCache().subscribe(cb),
    [qc],
  )
  // Snapshot là boolean (primitive) nên useSyncExternalStore không re-render thừa.
  const hasError = useSyncExternalStore(
    subscribe,
    () =>
      qc
        .getQueryCache()
        .getAll()
        .some((q) => q.state.status === 'error' && q.getObserversCount() > 0),
    () => false,
  )

  if (!hasError) return null

  return (
    <div
      role="alert"
      className="mx-3 mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-state-bad-fg lg:mx-6 dark:border-red-900 dark:bg-red-950/40 print:hidden"
    >
      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">
        Không tải được một phần dữ liệu — số liệu đang hiển thị có thể thiếu.
      </span>
      {/* <ActionButton> chứ không viết tay: guardrail đếm `active:scale-95` viết tay,
          và dáng "outline" trên nền banner đỏ vẫn đọc được. */}
      <ActionButton
        onClick={() =>
          qc.refetchQueries({
            predicate: (q) => q.state.status === 'error' && q.getObserversCount() > 0,
          })
        }
      >
        <RefreshCw className="h-4 w-4" aria-hidden />
        Thử lại
      </ActionButton>
    </div>
  )
}
