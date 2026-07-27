-- ============================================================
-- Sổ Chi Tiêu — Migration 0029: từ khoá nhận diện cho danh mục
-- Sao kê thẻ (Rakuten, PayPay…) chỉ có TÊN CỬA HÀNG, không có danh mục. Trang nhập
-- CSV đoán theo hai đường: lịch sử (đã từng ghi đúng tên cửa hàng đó) và từ khoá
-- gắn trên danh mục — cột này là chỗ lưu từ khoá.
--
-- Mỗi từ khoá là một chuỗi cần XUẤT HIỆN trong ghi chú, so sau khi bỏ dấu và hạ
-- chữ thường (làm ở tầng ứng dụng, xem features/import/classify.ts). Từ khoá dài
-- hơn thắng, để "ファミリーマート 渋谷" ăn trước "ファミリーマート".
-- ============================================================

alter table public.categories
  add column if not exists import_keywords text[] not null default '{}';

comment on column public.categories.import_keywords is
  'Từ khoá nhận diện tên cửa hàng khi nhập CSV (chuỗi con, bỏ dấu, không phân biệt hoa thường).';
