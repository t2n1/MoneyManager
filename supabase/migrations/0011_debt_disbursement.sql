-- ============================================================
-- Sổ Chi Tiêu — Migration 0011: giao dịch giải ngân khi tạo khoản nợ
-- Lúc tạo khoản nợ có thể chuyển tiền thật (cho vay = chi, mình nợ = thu).
-- debts.disbursement_transaction_id TRỎ tới giao dịch đó (nếu có).
-- FK đơn cột + on delete set null: xóa giao dịch ở sổ không làm hỏng khoản nợ.
-- ============================================================

alter table public.debts
  add column disbursement_transaction_id uuid
    references public.transactions (id) on delete set null;
