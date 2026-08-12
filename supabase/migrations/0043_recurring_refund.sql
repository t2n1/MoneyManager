-- ============================================================
-- Sổ Chi Tiêu — Migration 0043: cờ HOÀN TIỀN cho quy tắc định kỳ
--
-- Form Nhập cho tích "Đây là khoản hoàn tiền" và cho đặt "Lặp lại" cùng lúc, nhưng
-- quy tắc định kỳ không có cột nào giữ cờ đó — nên mọi kỳ sinh ra là một khoản CHI
-- THƯỜNG, tức mỗi tháng cộng thêm tiền vào Chi thay vì trừ ra. Có khoản hoàn tiền
-- lặp thật: hoàn thuế nhà hằng tháng, hoàn phí thẻ, cashback định kỳ.
--
-- Ràng buộc y như trên `transactions` (0026): is_refund chỉ có nghĩa với CHI. Đặt
-- được cờ này cho một quy tắc thu/chuyển khoản là sinh ra giao dịch mà chính DB
-- không nhận (transactions_refund_expense_only), tức quy tắc chết âm thầm ở lần
-- catch-up — thà chặn ngay tại quy tắc.
-- ============================================================

alter table public.recurring_rules
  add column if not exists is_refund boolean not null default false;

alter table public.recurring_rules
  drop constraint if exists recurring_refund_expense_only;
alter table public.recurring_rules
  add constraint recurring_refund_expense_only
  check (not is_refund or type = 'expense');
