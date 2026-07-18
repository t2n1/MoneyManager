-- ============================================================
-- Sổ Chi Tiêu — Migration 0005: ẩn / không-tính-tổng theo TÀI KHOẢN
-- Bổ sung cho cài đặt cấp nhóm (0004): mỗi tài khoản có thể tự ẩn khỏi
-- trang Tài sản hoặc không cộng vào Tổng tài sản, độc lập với nhóm.
-- ============================================================

-- 1. Hai cột mới trên accounts (mặc định: hiện + tính vào tổng)
alter table public.accounts
  add column if not exists is_hidden boolean not null default false;
alter table public.accounts
  add column if not exists include_in_totals boolean not null default true;

-- 2. Nạp lại view số dư để lộ 2 cột mới.
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
