// Token cho chip trong form Nhập. Tách khỏi TransactionForm.tsx vì TagPicker cũng cần
// CHIP_OFF, mà TransactionForm đã `import TagPicker` — nhập ngược lại là vòng tròn.
//
// Chép tay sang TagPicker thì sớm muộn một bên đổi màu hoặc độ cao mà bên kia không
// đổi, rồi hai chip cạnh nhau trong cùng một form nhìn ra hai kiểu.
//
// `CHIP_BASE` và `CHIP_ON` đã xoá cùng hai nút chúng dựng nên — nút bật/tắt "Lặp lại" và
// nút "Nhắc sau" cạnh ô ngày: dropdown Lặp lại giờ là một dòng dẫn sang
// `RecurringFormSheet`, còn "Nhắc sau" thành segmented "Đã chi | Sẽ chi" trên một dòng
// riêng. Chỉ trạng thái TẮT còn được dùng lại (TagPicker).

/**
 * Trạng thái TẮT / chưa chọn của một chip: xám trung tính. Bật thì mới lên màu.
 *
 * Token chứ không viết lại cặp sáng/tối bằng tay (từ nhánh fix/toan-bo-audit). Đổi ở
 * đây là đủ, khỏi sửa từng chip.
 */
export const CHIP_OFF = 'border-border-strong bg-surface text-fg-muted'
