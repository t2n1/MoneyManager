-- Mô hình ngân sách "1 cấp": chỉ danh mục LÁ (không có con) mới được đặt hạn mức
-- trực tiếp. Hạn mức của danh mục MẸ = tổng hạn mức các con, tính ở tầng ứng
-- dụng (không lưu). Dọn các hạn mức lỡ đặt thẳng vào danh mục mẹ theo thiết kế
-- cũ (nơi chi tiêu con bị gộp lên mẹ) để tránh trùng lặp và số liệu khó hiểu.
delete from public.budgets b
where exists (
  select 1
  from public.categories c
  where c.parent_id = b.category_id
    and coalesce(c.is_archived, false) = false
);
