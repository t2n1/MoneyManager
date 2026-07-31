// Chế độ "chọn nhiều" cho danh sách giao dịch (dùng chung Tìm kiếm + Sổ giao dịch).
// Phần logic tập hợp tách thành hàm THUẦN để unit-test; hook chỉ bọc useState.
import { useState } from 'react'

/** Bật/tắt một id trong tập đã chọn. Trả về Set MỚI (không sửa tại chỗ). */
export function toggleId(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** Gộp tất cả ids vào tập (chọn tất cả trong danh sách đang xem). */
export function addAll(selected: ReadonlySet<string>, ids: string[]): Set<string> {
  const next = new Set(selected)
  for (const id of ids) next.add(id)
  return next
}

/** Mọi id trong danh sách đang xem đều đã được chọn (danh sách rỗng → false). */
export function areAllSelected(selected: ReadonlySet<string>, ids: string[]): boolean {
  return ids.length > 0 && ids.every((id) => selected.has(id))
}

export interface TxSelection {
  /** Đang ở chế độ chọn hay không. */
  selecting: boolean
  /** Số giao dịch đang chọn. */
  count: number
  selectedIds: string[]
  isSelected: (id: string) => boolean
  enter: () => void
  /** Thoát chế độ chọn và xóa sạch lựa chọn. */
  exit: () => void
  toggle: (id: string) => void
  /** Chọn tất cả ids đang hiển thị (gộp thêm vào lựa chọn hiện có). */
  selectAll: (ids: string[]) => void
  clear: () => void
}

export function useTxSelection(): TxSelection {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  return {
    selecting,
    count: selected.size,
    selectedIds: [...selected],
    isSelected: (id) => selected.has(id),
    enter: () => setSelecting(true),
    exit: () => {
      setSelecting(false)
      setSelected(new Set())
    },
    toggle: (id) => setSelected((s) => toggleId(s, id)),
    selectAll: (ids) => setSelected((s) => addAll(s, ids)),
    clear: () => setSelected(new Set()),
  }
}
