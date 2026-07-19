-- ============================================================
-- Sổ Chi Tiêu — Migration 0012: Loại tài khoản kiểu Nhật
-- Thêm 'ic' (IC giao thông: Suica/PASMO/ICOCA) và 'ewallet' (Ví điện tử:
-- PayPay/Rakuten Pay/LINE Pay). Cả hai là TÀI SẢN (số dư dương), xử lý y hệt
-- cash/bank ở tầng ứng dụng. View số dư đọc a.type chung nên KHÔNG cần sửa.
-- ============================================================

alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts
  add constraint accounts_type_check
  check (type in ('cash', 'bank', 'card', 'ic', 'ewallet'));
