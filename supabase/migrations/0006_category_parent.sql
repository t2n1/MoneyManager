-- ============================================================
-- Sổ Chi Tiêu — Migration 0006: danh mục con (subcategories)
-- Thêm quan hệ cha–con 1 cấp cho categories.
--   parent_id null  → danh mục chính (cha)
--   parent_id set   → danh mục con của cha đó
-- Quy ước ứng dụng (không ràng buộc bằng SQL): chỉ 1 cấp — danh mục con
-- không có con của riêng nó.
-- ============================================================

alter table public.categories
  add column parent_id uuid,
  -- Composite FK: cha phải cùng user (khớp mẫu ở transactions).
  -- on delete cascade: xóa cha → xóa luôn các con.
  add constraint categories_parent_fk
    foreign key (parent_id, user_id)
    references public.categories (id, user_id)
    on delete cascade,
  -- Không tự làm cha của chính mình.
  add constraint categories_parent_not_self
    check (parent_id is null or parent_id <> id);

create index idx_categories_parent on public.categories (user_id, parent_id);
