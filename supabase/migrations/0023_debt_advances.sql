-- ============================================================
-- Sổ Chi Tiêu — Migration 0023: cho vay / vay tiếp cùng một người (cộng dồn, mục F)
-- Khi chọn người đã có ở màn Nhập, số tiền mới được ghi thành một bút toán
-- debt_payments với amount ÂM = "giải ngân thêm" → làm TĂNG số còn lại của khoản.
-- (amount DƯƠNG vẫn là trả bớt như cũ.) Vì vậy nới ràng buộc amount > 0 thành
-- amount <> 0 (vẫn cấm 0 — bút toán rỗng vô nghĩa).
-- ============================================================

alter table public.debt_payments
  drop constraint if exists debt_payments_amount_check;

alter table public.debt_payments
  add constraint debt_payments_amount_check check (amount <> 0);
