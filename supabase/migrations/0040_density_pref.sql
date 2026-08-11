-- ============================================================
-- Sổ Chi Tiêu — Migration 0040: chế độ trình bày theo HỒ SƠ
--
-- Cài đặt → Cách trình bày: "Gọn" (ít chữ, nhìn hình là hiểu) / "Đầy đủ" (có câu
-- kết luận và cách tính). Lần đầu ship nó nằm ở localStorage, cùng nhóm với Sáng/Tối
-- và Cỡ chữ. Đổi sang cột hồ sơ vì nó KHÁC hai cái kia về bản chất:
--
--   Sáng/Tối, Cỡ chữ — phụ thuộc THIẾT BỊ (màn hình sáng ngoài trời, chữ to trên
--                      điện thoại). Đặt riêng từng máy là đúng.
--   Cách trình bày   — phụ thuộc NGƯỜI. Ai đã đọc hết hướng dẫn thì đọc rồi ở mọi
--                      máy; bắt bật lại trên từng thiết bị là bắt làm việc vô nghĩa.
--
-- text + check chứ không phải enum: hai giá trị này là chuyện TRÌNH BÀY, và thêm mức
-- thứ ba sau này (vd "rất gọn") chỉ nên là sửa một dòng check, không phải `alter type`
-- (không chạy được trong transaction cùng các câu khác ở Postgres cũ).
--
-- Mặc định 'visual' khớp DEFAULT_DENSITY ở src/lib/density.ts. Hai chỗ này phải
-- cùng giá trị: lệch nhau thì người dùng mới thấy app nhảy chế độ ngay khi hồ sơ về.
-- ============================================================

alter table public.profiles
  add column if not exists density_pref text not null default 'visual';

alter table public.profiles drop constraint if exists profiles_density_pref_check;
alter table public.profiles
  add constraint profiles_density_pref_check
  check (density_pref in ('visual', 'full'));

comment on column public.profiles.density_pref is
  'Cách trình bày: visual = Gọn (ẩn chữ hướng dẫn, nén kết luận thành chip), full = Đầy đủ. Theo NGƯỜI nên nằm ở đây, không phải localStorage như theme/font-scale.';
