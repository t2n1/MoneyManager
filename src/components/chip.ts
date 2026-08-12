// Token cho chip trong form Nhập. Tách khỏi TransactionForm.tsx vì TagPicker cũng cần
// CHIP_OFF, mà TransactionForm đã `import TagPicker` — nhập ngược lại là vòng tròn.
//
// Chép tay sang TagPicker thì sớm muộn một bên đổi màu hoặc độ cao mà bên kia không
// đổi, rồi hai chip cạnh nhau trong cùng một form nhìn ra hai kiểu.

/**
 * Dáng chip bật/tắt hình chữ nhật (nút "Lặp lại" và nút "Nhắc sau" cạnh ô ngày).
 *
 * Gom lại vì hai nút đứng SÁT nhau: chép tay hai bản thì sớm muộn một cái quên
 * `transition` hoặc `active:scale-95` và bấm vào thấy hai kiểu phản hồi khác nhau.
 */
export const CHIP_BASE =
  'flex min-h-11 shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-sm transition active:scale-95'

/**
 * Trạng thái TẮT / chưa chọn: xám trung tính. Bật thì mới lên màu.
 *
 * Token chứ không viết lại cặp sáng/tối bằng tay (từ nhánh fix/toan-bo-audit). Đổi ở
 * đây là đủ, khỏi sửa từng chip.
 */
export const CHIP_OFF = 'border-border-strong bg-surface text-fg-muted'
