-- ============================================================
-- Sổ Chi Tiêu — Migration 0021: nợ có lãi suất / trả góp (mục AG)
-- Thêm lãi suất năm (basis points, số nguyên: 550 = 5.50%/năm) và số kỳ trả góp.
-- Cả hai NULL = khoản nợ thường (không tính lịch trả). Không có tiền → dùng integer,
-- lịch trả dự kiến tính ở client (amortization) để tránh phụ thuộc cách tính lãi.
-- ============================================================

alter table public.debts
  add column interest_bps integer,
  add column term_months integer;
