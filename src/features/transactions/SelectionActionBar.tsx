import { useEffect } from 'react'
import { Trash2 } from 'lucide-react'

interface Props {
  /** Số giao dịch đang chọn. */
  count: number
  /** Mọi giao dịch trong danh sách đang xem đều đã chọn. */
  allSelected: boolean
  /** Bấm "Chọn tất cả" / "Bỏ chọn hết". */
  onToggleAll: () => void
  /** Bấm nút Xóa (đã trừ trường hợp count = 0 — nút tự khóa). */
  onDelete: () => void
}

/**
 * Thanh thao tác dưới màn hình cho chế độ chọn nhiều (dùng chung Tìm kiếm + Sổ GD).
 *
 * z-[25] nằm trong dải KHUNG APP (<40), dưới mọi sheet/lớp phủ (40) và dưới hộp
 * thoại/toast (50) — xem tests/overlayLayers.test.ts. Từ bản 1a, thanh tab dưới nằm
 * TRONG luồng (không `fixed`, không z-index) nên nó không còn tranh chỗ với thanh này;
 * cờ `data-selection-bar` vẫn giữ vì hai thanh cùng chiếm đáy màn thì chồng nội dung.
 */
export function SelectionActionBar({ count, allSelected, onToggleAll, onDelete }: Props) {
  // Ẩn thanh tab dưới suốt lúc thanh này đang mở: cả hai chiếm đáy màn, mà thanh này
  // `fixed` nên nó phủ lên thanh tab — người dùng thấy một dải nút Xóa đè lên nửa dãy
  // tab. Đặt cờ ở <html> (luật ẩn nằm trong index.css) để cả Sổ và Tìm kiếm dùng
  // chung, không phải luồn prop qua AppLayout.
  useEffect(() => {
    document.documentElement.dataset.selectionBar = 'on'
    return () => {
      delete document.documentElement.dataset.selectionBar
    }
  }, [])

  return (
    <div className="fixed inset-x-0 bottom-0 z-[25] border-t border-border-subtle bg-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <span className="text-sm font-medium text-fg-primary">Đã chọn {count}</span>
        {/* -my-2 + px-2: vùng chạm 44px mà không nong thanh ra — trước đây nút này chỉ
            cao 20px, ngay cạnh nút Xóa. */}
        <button
          type="button"
          onClick={onToggleAll}
          className="-my-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-green-700 dark:text-green-400"
        >
          {allSelected ? 'Bỏ chọn hết' : 'Chọn tất cả'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={count === 0}
          className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 active:scale-95 disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
          Xóa ({count})
        </button>
      </div>
    </div>
  )
}
