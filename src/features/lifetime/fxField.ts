// Ô "tỷ giá giả định" của một DÒNG Lifetime (chặng đời / sự kiện) — hai quyết định
// thuần, dùng chung cho `PhaseFormSheet` và `EventFormSheet`.
//
// VÌ SAO ĐỨNG RIÊNG MỘT FILE: hai sheet kia không có file test nào, và luật ở đây là
// đúng chỗ đã sai một lần rồi (xem `fxAfterCurrencyChange`). Một luật viết hai lần
// trong hai component không test được là cách chắc chắn nhất để nó lệch nhau lần nữa.
import type { CurrencyCode } from '../../lib/currencies'

/**
 * Giá trị ô tỷ giá sau khi người dùng đổi TIỀN CỦA CHÍNH DÒNG ĐÓ.
 *
 * `fx_to_display` là "1 đơn vị tiền của dòng = bao nhiêu đơn vị tiền hiển thị". Đổi
 * tiền của dòng là đổi VẾ TRÁI của câu đó, nên con số cũ không còn nghĩa gì: khai
 * `0,0057` cho ₫1 ≈ ¥0,0057 rồi đổi dòng sang USD thì nó thành "$1 = ¥0,0057", và
 * `amount_minor` bị đọc lại theo đơn vị mới ngay cùng lúc — 60.000.000 vừa là ₫60 triệu
 * thì giờ là $600.000,00. KHÔNG guard nào bắt được: banner ở `LifetimePage` và dấu amber
 * ở hai sheet đều chỉ đếm `fx_to_display === 1`.
 *
 * Nên:
 * - Tiền dòng TRÙNG tiền hiển thị → `'1'`. Đây là giá trị ĐÚNG, không phải ô bỏ quên:
 *   `convertLifetimeMinor` short-circuit khi `from === to` nên tỷ giá bị bỏ qua hẳn.
 * - Tiền dòng KHÁC tiền hiển thị → `''` (rỗng). `isFxValid('')` là false nên nút Lưu bị
 *   chặn, và đó là kết quả ĐÚNG: sau khi đổi tiền thì tỷ giá thật sự là chưa biết. Đặt
 *   `'1'` ở đây sẽ là một con số hợp lệ, lưu được, và sai — đúng cái lớp lỗi này.
 *
 * CHỈ gọi khi tiền của dòng THẬT SỰ đổi (trong `onChange` của ô chọn tiền), không gọi
 * lúc mount: dòng đang sửa mang tỷ giá đã khai đúng từ trước, xoá nó đi là bắt người
 * dùng khai lại mỗi lần mở form.
 */
export function fxAfterCurrencyChange(
  rowCurrency: CurrencyCode,
  displayCurrency: CurrencyCode,
): string {
  return rowCurrency === displayCurrency ? '1' : ''
}

/** Ô tỷ giá hợp lệ: một số hữu hạn LỚN HƠN 0 (khớp `check (fx_to_display > 0)` của DB).
 *  `Number('')` là 0 nên ô rỗng tự động không hợp lệ — xem `fxAfterCurrencyChange`. */
export function isFxValid(fx: string): boolean {
  const n = Number(fx)
  return Number.isFinite(n) && n > 0
}
