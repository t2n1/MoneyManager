-- ============================================================
-- Sổ Chi Tiêu — Migration 0001: schema khởi tạo
-- Chạy trên Supabase SQL Editor (hoặc `supabase db push`).
-- Gồm: 4 bảng + constraints + indexes, RLS, view số dư,
--      trigger seed dữ liệu mặc định, trigger updated_at.
-- ============================================================

-- Extension moddatetime (tự cập nhật updated_at)
create extension if not exists moddatetime with schema extensions;

-- ------------------------------------------------------------
-- 1. Bảng
-- ------------------------------------------------------------

-- profiles: 1-1 với auth.users
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- Tiền tệ quy đổi cho tổng quan/báo cáo (ISO 4217)
  base_currency text not null default 'JPY' check (base_currency ~ '^[A-Z]{3}$'),
  -- Ngày bắt đầu "tháng" tùy chỉnh (GĐ3). 1..28 để tháng nào cũng hợp lệ.
  month_start_day int not null default 1 check (month_start_day between 1 and 28),
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('cash', 'bank')),
  -- Mỗi tài khoản một loại tiền cố định (ISO 4217); giao dịch theo tiền của tài khoản.
  currency text not null default 'JPY' check (currency ~ '^[A-Z]{3}$'),
  -- Đơn vị nhỏ nhất của currency: JPY = yên, VND = đồng, USD = cent
  initial_balance bigint not null default 0,
  sort_order int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  -- Cho composite FK từ transactions: đảm bảo tài khoản thuộc đúng user
  unique (id, user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('expense', 'income')),
  icon text not null default '📦',
  sort_order int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('expense', 'income', 'transfer')),
  -- Minor units theo currency của tài khoản nguồn. Không bao giờ dùng float.
  amount bigint not null check (amount > 0),
  -- Chuyển khoản XUYÊN TỆ: số tiền nhận được ở tài khoản đích (minor units
  -- theo currency của tài khoản đích). NULL = cùng loại tiền, dùng amount.
  to_amount bigint check (to_amount > 0),
  category_id uuid,
  account_id uuid not null,
  to_account_id uuid,
  occurred_on date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite FK: chặn client tham chiếu danh mục/tài khoản của user khác
  foreign key (category_id, user_id) references public.categories (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (to_account_id, user_id) references public.accounts (id, user_id),
  -- Hình dạng dữ liệu theo loại giao dịch:
  --   transfer: có to_account_id (khác account_id), không có category
  --   expense/income: có category, không có to_account_id
  check (
    (
      type = 'transfer'
      and to_account_id is not null
      and category_id is null
      and to_account_id <> account_id
    )
    or
    (
      type <> 'transfer'
      and to_account_id is null
      and to_amount is null
      and category_id is not null
    )
  )
);

create index idx_tx_user_date on public.transactions (user_id, occurred_on desc);
create index idx_tx_user_cat on public.transactions (user_id, category_id);

-- ------------------------------------------------------------
-- 2. Row Level Security
-- ------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

-- (select auth.uid()) thay vì auth.uid() trực tiếp: Postgres cache initplan,
-- tránh gọi hàm cho từng dòng — best practice hiệu năng của Supabase.

create policy "own rows" on public.profiles
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own rows" on public.accounts
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own rows" on public.categories
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own rows" on public.transactions
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ------------------------------------------------------------
-- 3. View số dư tài khoản
-- ------------------------------------------------------------
-- security_invoker: view chạy với quyền của người gọi → RLS của bảng gốc áp dụng.

create view public.account_balances
with (security_invoker = true) as
select
  a.id,
  a.user_id,
  a.name,
  a.type,
  a.currency,
  a.is_archived,
  a.sort_order,
  a.initial_balance
    + coalesce(sum(
        case
          when t.type = 'income'   and t.account_id    = a.id then  t.amount
          when t.type = 'expense'  and t.account_id    = a.id then -t.amount
          when t.type = 'transfer' and t.account_id    = a.id then -t.amount
          -- Xuyên tệ: bên nhận cộng to_amount (minor units của tài khoản đích)
          when t.type = 'transfer' and t.to_account_id = a.id then coalesce(t.to_amount, t.amount)
          else 0
        end
      ), 0) as balance
from public.accounts a
left join public.transactions t
  on t.user_id = a.user_id
 and (t.account_id = a.id or t.to_account_id = a.id)
group by a.id;

-- ------------------------------------------------------------
-- 4. Trigger updated_at
-- ------------------------------------------------------------

create trigger set_updated_at
  before update on public.transactions
  for each row
  execute function extensions.moddatetime (updated_at);

-- ------------------------------------------------------------
-- 5. Seed dữ liệu mặc định khi user đăng ký lần đầu
-- ------------------------------------------------------------
-- SECURITY DEFINER vì chạy trong context của supabase_auth_admin,
-- cần quyền ghi vào public. search_path cố định để an toàn.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );

  insert into public.accounts (user_id, name, type, currency, sort_order) values
    (new.id, 'Tiền mặt',   'cash', 'JPY', 0),
    (new.id, 'Ngân hàng',  'bank', 'JPY', 1),
    (new.id, 'Đầu tư VN',  'bank', 'VND', 2),
    (new.id, 'Dự trữ USD', 'bank', 'USD', 3);

  insert into public.categories (user_id, name, type, icon, sort_order) values
    -- Danh mục chi
    (new.id, 'Ăn uống',             'expense', '🍜', 0),
    (new.id, 'Đi lại',              'expense', '🚌', 1),
    (new.id, 'Mua sắm',             'expense', '🛍️', 2),
    (new.id, 'Hóa đơn & tiện ích',  'expense', '🧾', 3),
    (new.id, 'Nhà cửa',             'expense', '🏠', 4),
    (new.id, 'Sức khỏe',            'expense', '💊', 5),
    (new.id, 'Giải trí',            'expense', '🎮', 6),
    (new.id, 'Giáo dục',            'expense', '📚', 7),
    (new.id, 'Quà tặng & từ thiện', 'expense', '🎁', 8),
    (new.id, 'Khác',                'expense', '📦', 9),
    -- Danh mục thu
    (new.id, 'Lương',      'income', '💰', 0),
    (new.id, 'Thưởng',     'income', '🎉', 1),
    (new.id, 'Được tặng',  'income', '🧧', 2),
    (new.id, 'Đầu tư',     'income', '📈', 3),
    (new.id, 'Khác',       'income', '💵', 4);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
