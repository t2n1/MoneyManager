// "LỚP nào đang TRÊN CÙNG" của console Tương lai — THUẦN, không React, không DOM. Cùng lý
// do tách `consoleKeys.ts` khỏi `useConsoleKeys.ts`: một luật xếp lớp nằm rải trong
// `if/else` bên trong `closeTop` là một luật KHÔNG PHÉP THỬ NÀO ĐỌC RA được thứ tự.
//
// VÌ SAO FILE NÀY TỒN TẠI (Finding 3, review 2026-09-09). Bug thật: chọn một mốc, mở bộ
// chọn icon/màu trong dock, bấm `Esc` — popover đóng ĐÚNG, nhưng cả panel dock cũng đóng
// theo (mất luôn lựa chọn), vì popover báo "tôi đã xử lý Esc" bằng CƠ CHẾ RIÊNG của nó
// (`stopPropagation`, xem PlanDockParts.tsx) còn `useConsoleKeys.ts` chỉ đọc MỘT cơ chế
// (`e.defaultPrevented`). Hai lớp cùng tồn tại mà báo hiệu bằng hai ngôn ngữ khác nhau —
// và không có gì trong repo THẤY được rằng chúng lệch nhau, vì luật xếp lớp không phải một
// hàm, chỉ là vài dòng `if` rải trong `closeTop`.
//
// File này không SỬA bug đó (bản sửa nằm ở PlanDockParts.tsx: đổi sang `preventDefault` +
// pha capture, đúng cơ chế mà `useConsoleKeys` đã đọc). Việc của file này là làm thứ tự ưu
// tiên "lớp nào đóng trước" thành MỘT hàm thuần có test, để một lớp mới thêm sau (ngăn kéo
// danh sách mốc, một popover thứ hai…) không lặp lại kiểu lỗi "hai cơ chế báo hiệu khác
// nhau, không ai thấy" — thêm lớp mới chỉ cần thêm một dòng vào đây và một ca test.

export type ConsoleLayer = 'quick' | 'pick' | 'hints' | 'drawer' | 'sel' | 'none'

export interface LayerState {
  /** Bảng chọn nhanh đang mở (`TimelinePlot` → `QuickAddBoard`, `TuongLaiPage`'s `quick`). */
  quick: boolean
  /**
   * Popover icon/màu đang mở trong dock (`IdentityRow.pick !== null`, `PlanDockParts.tsx`).
   *
   * Lớp này KHÔNG chạy qua `closeTop`/`topLayer` trong wiring THẬT hôm nay: popover đóng
   * bằng `Esc` CỦA RIÊNG NÓ, ở pha CAPTURE, `preventDefault()` TRƯỚC khi sự kiện tới được
   * listener của trang (xem lời ghi ở `PlanDockParts.tsx` — đó chính là cách sửa Finding 3,
   * không phải hàm này). `pick` luôn được truyền `false` từ `TuongLaiPage` vì trạng thái đó
   * sống trong `IdentityRow`, không có ở tầng trang. Có mặt ở đây để: (1) người đọc thấy
   * đúng layer này tồn tại trong ngăn xếp — không phải một ngoại lệ giấu kín, và (2) test
   * khoá được thứ tự ưu tiên nếu một ngày `pick` được nối dây thật lên trang.
   */
  pick: boolean
  /** Panel gợi ý đang mở (nút "?" đầu trang, `hintsOpen`). */
  hints: boolean
  /**
   * Ngăn kéo danh sách mốc — CHƯA DỰNG (`PlanListDrawer`, xem lời ghi ở `TuongLaiPage`).
   * Luôn `false` hôm nay; có mặt để thứ tự ưu tiên đã đúng sẵn khi nó được dựng, không
   * phải chèn thêm một dòng `if` giữa các dòng cũ lúc đó.
   */
  drawer: boolean
  /** Có đang chọn một chặng/mốc không (`sel.type !== 'none'`). */
  sel: boolean
}

/**
 * Lớp NGOÀI CÙNG đang mở, theo thứ tự ưu tiên `Esc` phải đóng (README, bảng "Bàn phím"):
 *
 *   bảng chọn nhanh → popover dock → panel gợi ý → ngăn kéo mốc → lựa chọn → không có gì
 *
 * Thứ tự LÀ luật, đừng sắp lại cho gọn mắt — lý do từng cặp:
 * - `quick` trước `pick`: bảng chọn nhanh là lớp phủ TRÊN CÙNG toàn trang (z-40, xem
 *   `TuongLaiPage`), che cả dock nên che luôn popover của nó.
 * - `pick` trước `hints`/`sel`: popover lồng BÊN TRONG panel dock (chỉ hiện khi `sel` đã
 *   chọn một mốc) — đóng nó trước là đúng cấp lồng, và là chính bug của Finding 3 (đóng
 *   popover không được kéo theo đóng cả `sel`).
 * - `hints` trước `drawer`/`sel`: panel gợi ý là lớp phủ riêng, độc lập với việc có đang
 *   chọn gì hay không — đóng nó không đụng tới lựa chọn.
 * - `sel` cuối cùng: bỏ chọn là hành động ÍT ưu tiên nhất, chỉ chạy khi không còn lớp phủ
 *   nào khác đang mở.
 */
export function topLayer(s: LayerState): ConsoleLayer {
  if (s.quick) return 'quick'
  if (s.pick) return 'pick'
  if (s.hints) return 'hints'
  if (s.drawer) return 'drawer'
  if (s.sel) return 'sel'
  return 'none'
}
