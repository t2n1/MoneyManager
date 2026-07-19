-- ============================================================
-- Sổ Chi Tiêu — Migration 0010: Tự động trả thẻ theo tài khoản nguồn
-- Mỗi thẻ tín dụng có thể gắn MỘT tài khoản nguồn (payment_account_id). Vào ngày
-- đến hạn (payment_due_day) app tự sinh giao dịch chuyển khoản nguồn→thẻ với số
-- tiền = dư nợ tại ngày chốt sao kê (statement_day). card_autopay_through là con
-- trỏ kỳ đã sinh (giống last_generated_on của định kỳ) để không sinh trùng.
-- Việc sinh giao dịch + đối chiếu "đủ tiền trả?" xử lý ở tầng ứng dụng.
-- ============================================================

-- 1. Tài khoản nguồn trả thẻ + con trỏ kỳ đã tự trả
alter table public.accounts
  -- Tài khoản (không phải thẻ, cùng currency) dùng để trả cho thẻ này. Xóa tài
  -- khoản nguồn → set null (thẻ vẫn còn, chỉ ngừng tự trả).
  add column if not exists payment_account_id uuid references public.accounts(id) on delete set null;
alter table public.accounts
  -- Ngày đến hạn cuối đã tự sinh giao dịch trả. null = chưa bật / chưa sinh kỳ nào.
  add column if not exists card_autopay_through date;

-- 2. Nạp lại view số dư để lộ payment_account_id (trang Tài sản tra tài khoản nguồn)
drop view if exists public.account_balances;

create view public.account_balances
with (security_invoker = true) as
select
  a.id,
  a.user_id,
  a.name,
  a.type,
  a.currency,
  a.asset_group,
  a.is_hidden,
  a.include_in_totals,
  a.credit_limit,
  a.payment_account_id,
  a.is_archived,
  a.sort_order,
  a.initial_balance
    + coalesce(sum(
        case
          when t.type = 'income'   and t.account_id    = a.id then  t.amount
          when t.type = 'expense'  and t.account_id    = a.id then -t.amount
          when t.type = 'transfer' and t.account_id    = a.id then -t.amount
          when t.type = 'transfer' and t.to_account_id = a.id then coalesce(t.to_amount, t.amount)
          else 0
        end
      ), 0) as balance
from public.accounts a
left join public.transactions t
  on t.user_id = a.user_id
 and (t.account_id = a.id or t.to_account_id = a.id)
group by a.id;
