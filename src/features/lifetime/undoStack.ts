// Hoàn tác MỘT BẬC, chỉ cho việc XOÁ.
//
// Phạm vi hẹp là có chủ ý (đúng bản vẽ 1c): xoá là thao tác duy nhất mất dữ liệu mà
// không có đường nào lần lại được. Sửa và kéo thì con số cũ vẫn còn trên màn, và bản
// nháp chưa ghi vào DB nên "Bỏ" ở thanh nháp đã là đường lùi.
//
// `now` truyền vào chứ không gọi `Date.now()` bên trong: test thời gian mà phải chờ
// thật 9 giây thì hoặc test chậm, hoặc phải giả lập đồng hồ.
//
// Thuần, không import React.

/** Cửa sổ hoàn tác — 9 giây, đúng thời lượng toast của bản vẽ. */
export const UNDO_WINDOW_MS = 9_000

export interface UndoEntry<T> {
  /** Câu hiện trên toast, ví dụ: `Đã xoá mốc "Mua nhà"`. */
  label: string
  snapshot: T
  /** Mốc thời gian lúc chụp, ms. */
  at: number
}

export function makeUndo<T>() {
  let entry: UndoEntry<T> | null = null
  const conHan = (now: number) => entry !== null && now - entry.at < UNDO_WINDOW_MS
  return {
    push(label: string, snapshot: T, now = Date.now()): UndoEntry<T> {
      entry = { label, snapshot, at: now }
      return entry
    },
    /** Xem mà không lấy — dùng để quyết định có vẽ toast hay không. */
    peek(now = Date.now()): UndoEntry<T> | null {
      return conHan(now) ? entry : null
    },
    /** Lấy ra và DỌN: bấm Hoàn tác hai lần không được hoàn tác hai lần. */
    take(now = Date.now()): UndoEntry<T> | null {
      const e = conHan(now) ? entry : null
      entry = null
      return e
    },
    clear() {
      entry = null
    },
  }
}
