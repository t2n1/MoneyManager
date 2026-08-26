-- ============================================================
-- Sổ Chi Tiêu — Migration 0052: hạn mức ¥0 là hợp lệ
--
-- 0002 khai `amount bigint not null check (amount > 0)`, nên đặt hạn mức 0 nhận về
-- `new row for relation "budgets" violates check constraint "budgets_amount_check"`.
--
-- Nhưng ¥0 là một lời khai THẬT và khác hẳn "chưa đặt hạn mức":
--   · chưa đặt hạn mức → tiêu bao nhiêu cũng không ai nhắc
--   · hạn mức ¥0       → "tháng này tôi chắc chắn không tiêu ở đây", tiêu một đồng là vượt
-- Không có cách nào diễn đạt lời khai thứ hai bằng cách xoá dòng, nên nó phải là một dòng
-- với `amount = 0`.
--
-- Vẫn chặn số ÂM: hạn mức âm không có nghĩa gì, và `>= 0` giữ nguyên tác dụng chặn dữ liệu
-- rác của ràng buộc cũ.
--
-- Đi cùng ba thay đổi phía app, không tách ra được:
--   · progress.ts       — `ratio` của hạn mức 0 có chi là 'over', không phải 'ok'
--   · BudgetEditSheet   — gõ 0 LƯU 0, không còn là xoá (xoá dùng nút Xóa)
--   · PlanningView      — `budgetHint` xét CÓ DÒNG, không xét `> 0`
--
-- Chạy: dán vào Supabase SQL Editor rồi bấm Run. An toàn khi chạy lại nhiều lần.
-- ============================================================

alter table public.budgets
  drop constraint if exists budgets_amount_check;

alter table public.budgets
  add constraint budgets_amount_check check (amount >= 0);
