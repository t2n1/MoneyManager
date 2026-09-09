// Luật BÀN PHÍM của console Tương lai — THUẦN, không React, không DOM.
//
// VÌ SAO TÁCH KHỎI `useConsoleKeys.ts`. Repo này KHÔNG có công cụ test DOM (không jsdom,
// không @testing-library — xem đầu `tests/lifetimeLaneReviewFixes.test.ts`), nên một luật
// bàn phím nằm trong thân một `useEffect` là một luật KHÔNG kiểm được: nó chỉ còn được
// canh bằng cách đọc chuỗi trong file nguồn, thứ không thấy được lỗi thứ tự nhánh. Đưa
// toàn bộ phần QUYẾT ĐỊNH ra một hàm nhận một object phẳng thì mỗi luật có một phép thử
// thật bằng số, và cái hook chỉ còn việc nối dây.
//
// LUẬT ĐẮT NHẤT Ở ĐÂY, nói ra ngay đầu file vì nó là thứ dễ mất nhất khi ai đó thêm phím:
// KHÔNG bắt phím khi con trỏ đang ở trong `input`/`textarea`/contenteditable — TRỪ `⌘Z`.
// Hệ quả cụ thể nếu quên: gõ số vào một ô trong dock rồi bấm Backspace để xoá một chữ số
// sẽ XOÁ LUÔN cái mốc đang sửa (README, bảng "Bàn phím"; spec §11).

/** Việc mà một cú bấm phím yêu cầu trang làm. `'none'` = không phải phím của màn này. */
export type ConsoleKeyAction =
  | { type: 'none' }
  /** Đóng thứ đang mở trên cùng: bảng nhanh → panel gợi ý → bỏ chọn. */
  | { type: 'close' }
  /** Xoá thứ đang chọn (có hoàn tác). */
  | { type: 'delete' }
  | { type: 'undo' }
  /** Dời một năm: thứ đang chọn, hoặc vạch rê chuột khi không chọn gì. */
  | { type: 'nudge'; step: -1 | 1 }

/**
 * Đủ dùng cho `KeyboardEvent` thật (nó thoả hình dạng này về cấu trúc) và cho một object
 * phẳng trong test. `editable` do chỗ gọi tính bằng `isEditableTarget` — hàm này không
 * chạm DOM.
 */
export interface ConsoleKeyInput {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  /** Tiêu điểm đang ở trong một chỗ GÕ CHỮ. */
  editable?: boolean
}

/**
 * Phần tử đang nhận tiêu điểm có phải chỗ gõ chữ không.
 *
 * Nhận `unknown` và dò bằng thuộc tính (`tagName`, `isContentEditable`) chứ không
 * `instanceof HTMLElement`: `instanceof` cần một `window` thật, và cả file này tồn tại để
 * KHÔNG cần một cái.
 *
 * `SELECT` cũng tính là chỗ gõ: ←/→ trong một `<select>` là đổi lựa chọn, không phải dời
 * một mốc trên trục.
 *
 * `closest('[contenteditable]')` là nhánh cuối vì `isContentEditable` chỉ đúng trên chính
 * phần tử đó; tiêu điểm có thể đang ở một `<span>` nằm TRONG một vùng contenteditable.
 */
export function isEditableTarget(target: unknown): boolean {
  if (target === null || typeof target !== 'object') return false
  const el = target as { tagName?: unknown; isContentEditable?: unknown; closest?: unknown }
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : ''
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable === true) return true
  if (typeof el.closest === 'function') {
    return (el.closest as (s: string) => unknown).call(el, '[contenteditable]:not([contenteditable="false"])') !== null
  }
  return false
}

/** Phím này có phải `⌘Z`/`Ctrl+Z` không. `⇧⌘Z` (làm lại) KHÔNG tính — app chưa có làm lại,
 *  và nuốt nó là lấy mất phím "làm lại" của ô nhập đang có tiêu điểm. */
function isUndo(e: ConsoleKeyInput): boolean {
  return (e.metaKey === true || e.ctrlKey === true) && e.shiftKey !== true && e.key.toLowerCase() === 'z'
}

/**
 * Một cú bấm phím → việc phải làm. Thứ tự các nhánh LÀ luật, đừng sắp lại cho gọn mắt:
 * `⌘Z` phải đứng TRƯỚC phép chặn `editable`, không thì hoàn tác chết ngay khi tiêu điểm
 * còn nằm trong ô vừa gõ — mà đó là chỗ tiêu điểm hầu như luôn ở sau một lần sửa.
 */
export function consoleKeyAction(e: ConsoleKeyInput): ConsoleKeyAction {
  if (isUndo(e)) return { type: 'undo' }
  if (e.editable === true) return { type: 'none' }
  // Phím tắt của TRÌNH DUYỆT/HỆ ĐIỀU HÀNH không được nuốt: `⌘←` là lùi lịch sử,
  // `Alt+Backspace` là xoá một từ. Chỉ phím TRẦN mới là phím của màn này.
  if (e.metaKey === true || e.ctrlKey === true || e.altKey === true) return { type: 'none' }
  if (e.key === 'Escape') return { type: 'close' }
  if (e.key === 'Delete' || e.key === 'Backspace') return { type: 'delete' }
  if (e.key === 'ArrowLeft') return { type: 'nudge', step: -1 }
  if (e.key === 'ArrowRight') return { type: 'nudge', step: 1 }
  return { type: 'none' }
}
