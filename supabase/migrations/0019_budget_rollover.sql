-- ============================================================
-- Sổ Chi Tiêu — Migration 0019: Ngân sách nâng cao — dồn hạn mức (backlog mục AH)
-- Cờ rollover (opt-in từng danh mục): phần hạn mức chưa tiêu tháng trước được cộng
-- thêm vào hạn mức tháng này. Tính ở tầng ứng dụng (buildBudgetReport); cột chỉ lưu
-- lựa chọn bật/tắt của từng hạn mức.
-- ============================================================

alter table public.budgets
  add column if not exists rollover boolean not null default false;
