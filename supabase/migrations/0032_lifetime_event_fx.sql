-- ============================================================
-- Sổ Chi Tiêu — Migration 0032: tỷ giá riêng cho SỰ KIỆN của Lifetime
-- life_phases đã có fx_to_display (migration 0031), life_events thì không — nên
-- engine không có con số nào để quy đổi một sự kiện khác tiền cả với chặng LẪN với
-- đơn vị hiển thị, và phải đoán bằng tỷ giá 1.
--
-- Ca thật làm lộ chỗ hở: nhận 年金 ¥1.100.000/năm trong khi đã sang Mỹ. Đơn vị hiển
-- thị USD, chặng cũng USD (fx_to_display của chặng là 1 vì $→$), chỉ sự kiện là JPY.
-- Tỷ giá 1 cho ra $1.100.000 thay vì $7.337 — sai 150 lần, và sai IM LẶNG vì không
-- có ràng buộc nào bắt được.
--
-- Cách chữa: mỗi khoản tiền tự mang tỷ giá của nó. Sau migration này engine không
-- còn nhánh if nào liên quan tới tiền tệ của sự kiện.
--
-- Cùng quy ước với life_phases.fx_to_display: là GIẢ ĐỊNH người dùng khai, không
-- phải tỷ giá spot từ lib/rates.ts.
-- ============================================================

-- default 1 để dòng đã có không hỏng: sự kiện cùng tiền với đơn vị hiển thị (đa số)
-- thì tỷ giá không được dùng tới, nên 1 là giá trị đúng chứ không phải giá trị tạm.
alter table public.life_events
  add column fx_to_display numeric not null default 1 check (fx_to_display > 0);

comment on column public.life_events.fx_to_display is
  '1 đơn vị currency của sự kiện = bao nhiêu đơn vị display_currency, theo MAJOR units.';
