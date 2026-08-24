# Redesign v5 — trang Tài sản → Tương lai

Bản vẽ: Claude Design `00ddb792`, file `Tuong Lai - Redesign v5.dc.html`.
So với `Tuong Lai - Redesign.dc.html` (v1, đã dựng ở commit 25314d2 + 97ad85a).

## v5 đổi gì so với v1

1. **BỎ HẲN DRAWER.** Trình sửa kịch bản không còn là `<aside role="dialog">` mà là một
   thẻ nằm THẲNG trong trang, ngay dưới đồ thị, có dải tab.
2. **Bỏ cột phải.** v1 là lưới 2 cột (đồ thị | Giả định+Stress+Mẫu). v5 một cột dọc.
3. **Thanh nháp dán vào đầu thẻ đồ thị** (`border-radius: 12px 12px 0 0; border-bottom:
   none`) thay vì đứng rời ở đầu trang.
4. **Dải chip kịch bản**: `flex-wrap` thay cho `overflow-x: auto`; bỏ dòng tóm tắt
   `FIRE … · âm từ …` trên từng chip, thay bằng `title` (tooltip).
5. **Bỏ nút "Sửa kịch bản"** ở hàng hành động (không còn gì để mở).

## Thẻ "Sửa kịch bản" — 5 tab

Header: `Sửa kịch bản` · ô tên · badge ★ · `edFooterNote` · nút ⋮ (menu 3 mục như cũ).
Dải tab (`role="tablist"`, gạch chân xanh khi chọn), mỗi tab có badge đếm:

| tab | badge | nội dung |
|---|---|---|
| Chặng đời | số chặng | dải tỉ lệ + thẻ chặng (năm · tên · **Tiền** · thu · chi · xoá), meta + chip "Số thật", breakdown mục chi, "+ Thêm chặng" + thanh trượt **tuổi nghỉ hưu** |
| Sự kiện | số mốc | hàng mốc (loại · tên · từ → đến · **ký hiệu tiền** · số tiền · xoá) + chip mẫu |
| Khởi điểm & lợi suất | `x%` | tài sản khởi điểm (Dương/Nợ ròng + ký hiệu tiền) · lợi suất · dải dao động · `minReturnFoot` |
| Stress test | `n bật` | 6 công tắc, mở ra ô Năm / ô phụ ngay dưới |
| Cách đọc & phạm vi | — | giá hôm nay/danh nghĩa + lạm phát · chiếu đến tuổi · năm sinh · tiền hiển thị · `fxNote` |

Lưu/Bỏ nháp KHÔNG có trong thẻ này — chúng nằm ở thanh nháp dán trên đồ thị.

## XUNG ĐỘT: mô hình tiền tệ

v5 đổi mô hình, không chỉ đổi giao diện:

| | repo hiện tại | v5 |
|---|---|---|
| Tiền của CHẶNG | `life_phases.currency` | `p.cur` (giống) |
| Tiền của MỐC | `life_events.currency` — khai riêng | **suy ra** từ chặng chứa `startYear` (`curAt`) |
| Tỷ giá | `fx_to_display` mỗi dòng — người dùng tự khai, là giả định DÀI HẠN | một bảng `this.fx` cứng của app (tỷ giá HÔM NAY), dùng cho mọi năm |

Hai hệ quả nếu theo v5 nguyên văn:
- Mốc mất quyền có tiền riêng. Mà `presets.ts` CÓ mẫu ép cứng VND ("Hỗ trợ bố mẹ ở VN")
  nằm trong chặng ¥ — và comment đầu file ghi rõ bản trước để mốc rơi về tiền của chặng
  chính là LỖI ĐÃ SỬA.
- Tỷ giá giả định dài hạn người dùng đã khai bị thay bằng tỷ giá hôm nay → mọi con số
  của kịch bản đa tiền tệ đổi lặng lẽ. 30 file trong `src/` đụng `fx_to_display`.
