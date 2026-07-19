-- ============================================================
-- Sổ Chi Tiêu — Migration 0015: Lộ ngày chốt / ngày trả thẻ ra view số dư
-- Trang Tài sản hiển thị "ngày trả kế tiếp" của thẻ tín dụng (payment_due_day,
-- dời Thứ 7/CN sang Thứ 2 ở tầng app). View account_balances bổ sung
-- statement_day + payment_due_day (đã có sẵn trên bảng accounts từ 0009/0010).
-- Chỉ đổi danh sách cột select — logic tính balance giữ nguyên.
-- ============================================================

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
  a.statement_day,
  a.payment_due_day,
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
