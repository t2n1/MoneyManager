-- ============================================================
-- Sổ Chi Tiêu — Migration 0009: Thẻ tín dụng
-- Thẻ tín dụng là một loại tài khoản (type='card'). Chi tiêu bằng thẻ =
-- giao dịch chi trên tài khoản thẻ → số dư âm dần = số đang nợ. Trả thẻ =
-- chuyển khoản ngân hàng → thẻ. Máy tính số dư/chuyển khoản dùng lại y nguyên.
-- Số dư thẻ (thường âm) KHÔNG nằm trong Tổng tài sản (gộp); được trừ trong
-- Tài sản ròng cùng nhóm với nợ/cho vay — xử lý ở tầng ứng dụng (aggregate.ts).
-- ============================================================

-- 1. Cho phép type = 'card' (constraint inline của 0001 tên mặc định accounts_type_check)
alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts
  add constraint accounts_type_check check (type in ('cash', 'bank', 'card'));

-- 2. Trường riêng của thẻ (đều nullable, chỉ dùng khi type='card')
alter table public.accounts
  -- Hạn mức tín dụng: minor units theo currency của thẻ. null = không đặt.
  add column if not exists credit_limit bigint;
alter table public.accounts
  -- Ngày chốt sao kê hằng tháng (1..31). null = chưa đặt.
  add column if not exists statement_day int check (statement_day between 1 and 31);
alter table public.accounts
  -- Ngày đến hạn thanh toán hằng tháng (1..31). null = chưa đặt.
  add column if not exists payment_due_day int check (payment_due_day between 1 and 31);

-- 3. Nạp lại view số dư để lộ credit_limit (cho "còn dùng được" ở trang Tài sản)
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
