-- ============================================================
-- Sổ Chi Tiêu — Migration 0014: Dòng tiền nợ/cho vay (is_debt_flow)
-- Đánh dấu giao dịch là "dòng tiền cho vay / trả nợ / trả hộ" chứ không phải
-- chi tiêu/thu nhập thật. Số dư & Tài sản ròng VẪN tính (tiền thật đã dịch
-- chuyển) — view balance không đọc cột này nên không cần sửa. Chỉ báo cáo
-- Chi/Thu bỏ qua các giao dịch này để không bị phồng số liệu.
--
-- Không backfill: chỉ áp dụng cho giao dịch tạo từ nay. Các khoản cho vay/trả
-- nợ cũ giữ nguyên trong báo cáo như trước.
-- ============================================================

alter table public.transactions
  add column if not exists is_debt_flow boolean not null default false;
