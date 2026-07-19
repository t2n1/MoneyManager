-- ============================================================
-- Sổ Chi Tiêu — Migration 0017: Loại trừ giao dịch khỏi thống kê (backlog mục AM)
-- Cờ exclude_from_stats: giao dịch vẫn ảnh hưởng SỐ DƯ tài khoản nhưng KHÔNG tính
-- vào báo cáo/ngân sách/insight (hoàn tiền, mua hộ, bút toán điều chỉnh số dư — mục X).
-- Khác is_debt_flow (dành riêng dòng nợ/cho vay); cả hai đều bị loại khỏi Chi/Thu.
-- ============================================================

alter table public.transactions
  add column if not exists exclude_from_stats boolean not null default false;
