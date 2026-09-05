-- Phí quản lý quỹ (信託報酬) — %/năm lưu bằng PHẦN TRIỆU (ppm) để giữ 4 chữ số lẻ
-- của con số Nhật niêm yết: 0,0938%/năm = 938 ppm. bps (phần vạn) không đủ mịn —
-- 0,0938% = 9,38 bps không phải số nguyên.
--
-- null = chưa khai. Người dùng khai MỘT LẦN ở tab Quỹ (trang Đầu tư); app không tự
-- đoán vì mỗi quỹ mỗi mức và nguồn công bố không có API.
alter table public.funds
  add column if not exists expense_ratio_ppm integer
  check (expense_ratio_ppm is null or (expense_ratio_ppm >= 0 and expense_ratio_ppm <= 30000));

comment on column public.funds.expense_ratio_ppm is
  '信託報酬 %/năm × 10.000 (ppm). 0,0938%/năm = 938. null = chưa khai.';
