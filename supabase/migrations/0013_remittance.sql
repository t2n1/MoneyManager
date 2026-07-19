-- ============================================================
-- Sổ Chi Tiêu — Migration 0013: Gửi tiền về Việt Nam
-- Mỗi lần gửi là MỘT giao dịch (transfer = chuyển tài sản sang TK VND, hoặc
-- expense = hỗ trợ gia đình). 4 cột dưới chỉ dùng khi is_remittance=true.
-- Số dư/Tài sản ròng tự đúng vì gửi tiền chính là giao dịch — view balance
-- KHÔNG cần sửa (không đọc các cột này).
-- ============================================================

alter table public.transactions
  add column if not exists is_remittance boolean not null default false;
alter table public.transactions
  add column if not exists remit_service text;         -- Wise / SBI Remit / Brastel / DCOM / Khác
alter table public.transactions
  add column if not exists remit_fee_jpy bigint;       -- phí dịch vụ (minor units JPY = yên)
alter table public.transactions
  add column if not exists remit_received_vnd bigint;  -- số VND người nhận nhận được (minor units VND = đồng)
