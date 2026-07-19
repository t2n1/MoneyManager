-- ============================================================
-- Sổ Chi Tiêu — Migration 0016: Giá trị tài sản đầu tư (backlog mục AE)
-- Thêm loại tài khoản 'investment' (quỹ, cổ phiếu, lướt sóng, vàng, crypto).
-- Số dư từ giao dịch = VỐN GỐC RÒNG (nạp − rút); giá thị trường lên xuống KHÔNG
-- phản ánh qua giao dịch. Bảng account_valuations lưu ẢNH CHỤP giá trị thị trường
-- theo ngày. Lãi/lỗ chưa thực hiện = market_value − balance, tính ở tầng ứng dụng.
-- KHÔNG tạo giao dịch ảo → ledger thu/chi giữ nguyên sạch (Báo cáo không đổi).
-- View account_balances lộ thêm market_value (snapshot mới nhất) để Tổng tài sản /
-- Tài sản ròng phản ánh giá thị trường.
-- ============================================================

-- 1. Cho phép type = 'investment'
alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts
  add constraint accounts_type_check
  check (type in ('cash', 'bank', 'card', 'ic', 'ewallet', 'investment'));

-- 2. Bảng ảnh chụp giá trị thị trường
create table public.account_valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null,
  valued_on date not null default current_date,
  -- Giá trị thị trường: minor units theo currency của TÀI KHOẢN. Luôn ≥ 0.
  market_value bigint not null check (market_value >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  -- Composite FK: đảm bảo tài khoản thuộc đúng user; xóa tài khoản → xóa valuations
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  -- Mỗi tài khoản mỗi ngày một giá trị (upsert đè)
  unique (account_id, valued_on)
);

create index account_valuations_account_idx
  on public.account_valuations (account_id, valued_on desc);

-- RLS: mỗi user chỉ thấy/sửa hàng của mình
alter table public.account_valuations enable row level security;

create policy "own rows" on public.account_valuations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Nạp lại view account_balances — bổ sung market_value (snapshot mới nhất).
--    Logic tính balance giữ NGUYÊN; chỉ thêm 1 cột qua lateral join.
--    null = tài khoản chưa có snapshot nào (kể cả không phải đầu tư).
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
  mv.market_value,
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
left join lateral (
  select v.market_value
  from public.account_valuations v
  where v.account_id = a.id
  order by v.valued_on desc, v.created_at desc
  limit 1
) mv on true
group by a.id, mv.market_value;
