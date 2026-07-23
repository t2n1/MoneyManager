-- ============================================================
-- Sổ Chi Tiêu — GỘP TẤT CẢ MIGRATIONS (0001 → 0024)
-- Dán toàn bộ file này vào Supabase SQL Editor rồi bấm Run.
-- Chạy 1 lần cho project mới. Idempotent một phần (dùng if not exists).
-- ============================================================


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0001_init.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0002_budgets.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- Sổ Chi Tiêu — Migration 0002: bảng budgets (ngân sách tháng)
-- Hạn mức chi theo danh mục cho từng tháng. Lưu theo base_currency.
-- ============================================================

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null,
  -- "YYYY-MM" theo MonthKey (tôn trọng month_start_day). VD: '2026-07'
  month_key text not null check (month_key ~ '^\d{4}-\d{2}$'),
  -- Minor units theo base_currency (JPY = yên). Không bao giờ dùng float.
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite FK: chặn tham chiếu danh mục của user khác
  foreign key (category_id, user_id) references public.categories (id, user_id),
  -- Một danh mục chỉ có 1 hạn mức cho mỗi tháng → upsert theo khóa này
  unique (user_id, category_id, month_key)
);

create index idx_budget_user_month on public.budgets (user_id, month_key);

alter table public.budgets enable row level security;

create policy "own rows" on public.budgets
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger set_updated_at
  before update on public.budgets
  for each row
  execute function extensions.moddatetime (updated_at);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0003_asset_group.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- Sổ Chi Tiêu — Migration 0003: nhóm tài sản (asset_group)
-- Người dùng tự phân loại tài khoản (Tiêu dùng, Tiết kiệm, Đầu tư…)
-- để trang Tài sản tổng hợp & vẽ tỷ trọng theo nhóm.
-- ============================================================

-- 1. Cột mới trên accounts (nullable = chưa phân nhóm)
alter table public.accounts
  add column if not exists asset_group text;

-- 2. Nạp lại view số dư để lộ asset_group.
--    Phải drop + create vì đổi danh sách cột của view.
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

-- 3. Seed tài khoản mặc định kèm nhóm cho user mới.
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

  insert into public.accounts (user_id, name, type, currency, asset_group, sort_order) values
    (new.id, 'Tiền mặt',   'cash', 'JPY', 'Tiêu dùng', 0),
    (new.id, 'Ngân hàng',  'bank', 'JPY', 'Tiêu dùng', 1),
    (new.id, 'Đầu tư VN',  'bank', 'VND', 'Đầu tư',    2),
    (new.id, 'Dự trữ USD', 'bank', 'USD', 'Dự phòng',  3);

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0004_asset_group_settings.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- Sổ Chi Tiêu — Migration 0004: cài đặt nhóm tài sản
-- Thành viên nhóm vẫn là chuỗi accounts.asset_group; bảng này lưu
-- thuộc tính riêng của từng nhóm: thứ tự, có tính vào tổng, ẩn/hiện.
-- Nhóm không có bản ghi → dùng mặc định (tính vào tổng, không ẩn).
-- ============================================================

create table if not exists public.asset_group_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  include_in_totals boolean not null default true,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.asset_group_settings enable row level security;

-- Mỗi người chỉ đọc/ghi cài đặt của chính mình.
create policy "asset_group_settings_select_own"
  on public.asset_group_settings for select
  using (auth.uid() = user_id);

create policy "asset_group_settings_insert_own"
  on public.asset_group_settings for insert
  with check (auth.uid() = user_id);

create policy "asset_group_settings_update_own"
  on public.asset_group_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "asset_group_settings_delete_own"
  on public.asset_group_settings for delete
  using (auth.uid() = user_id);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0005_account_visibility.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0006_category_parent.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- Sổ Chi Tiêu — Migration 0006: danh mục con (subcategories)
-- Thêm quan hệ cha–con 1 cấp cho categories.
--   parent_id null  → danh mục chính (cha)
--   parent_id set   → danh mục con của cha đó
-- Quy ước ứng dụng (không ràng buộc bằng SQL): chỉ 1 cấp — danh mục con
-- không có con của riêng nó.
-- ============================================================

alter table public.categories
  add column parent_id uuid,
  -- Composite FK: cha phải cùng user (khớp mẫu ở transactions).
  -- on delete cascade: xóa cha → xóa luôn các con.
  add constraint categories_parent_fk
    foreign key (parent_id, user_id)
    references public.categories (id, user_id)
    on delete cascade,
  -- Không tự làm cha của chính mình.
  add constraint categories_parent_not_self
    check (parent_id is null or parent_id <> id);

create index idx_categories_parent on public.categories (user_id, parent_id);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0007_debts.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- Sổ Chi Tiêu — Migration 0007: nợ / cho vay (backlog mục F)
-- Theo dõi khoản nợ với đối tác ngoài hệ thống tài khoản + lịch sử trả từng phần.
-- Nợ KHÔNG tự đổi số dư: mọi biến động tiền vẫn là 1 dòng transactions;
-- debt_payments chỉ TRỎ tới giao dịch đó (transaction_id).
-- ============================================================

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  counterparty text not null,
  -- i_owe = mình nợ người ta · owed_to_me = người ta nợ mình
  direction text not null check (direction in ('i_owe', 'owed_to_me')),
  -- Tệ của khoản nợ (ISO 4217); tiền lưu minor units theo tệ này
  currency text not null default 'JPY' check (currency ~ '^[A-Z]{3}$'),
  principal bigint not null check (principal > 0),
  due_on date,
  status text not null default 'open' check (status in ('open', 'settled')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Cho composite FK từ debt_payments
  unique (id, user_id)
);

create index idx_debts_user on public.debts (user_id, status);

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  debt_id uuid not null,
  amount bigint not null check (amount > 0),
  paid_on date not null default current_date,
  -- Giao dịch thật nếu lần trả này có chuyển tiền; null = ghi nhận suông.
  -- FK đơn cột + on delete set null: xóa giao dịch ở sổ không làm hỏng lịch sử nợ.
  transaction_id uuid references public.transactions (id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now(),
  -- Composite FK: chặn tham chiếu khoản nợ của user khác. Xóa nợ → xóa payment.
  foreign key (debt_id, user_id) references public.debts (id, user_id) on delete cascade
);

create index idx_debt_payments_debt on public.debt_payments (user_id, debt_id);

alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;

create policy "own rows" on public.debts
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own rows" on public.debt_payments
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger set_updated_at
  before update on public.debts
  for each row
  execute function extensions.moddatetime (updated_at);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0008_recurring_rules.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- Sổ Chi Tiêu — Migration 0008: giao dịch định kỳ
-- Bảng recurring_rules + cột transactions.recurring_rule_id
-- + partial unique index chống sinh trùng khi 2 thiết bị cùng catch-up.
-- ============================================================

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('expense', 'income', 'transfer')),
  -- Minor units theo currency của tài khoản nguồn (như transactions)
  amount bigint not null check (amount > 0),
  to_amount bigint check (to_amount > 0),
  category_id uuid,
  account_id uuid not null,
  to_account_id uuid,
  note text not null default '',
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  -- Kỳ đến hạn ĐẦU TIÊN; anchor cho ngày-trong-tháng / thứ-trong-tuần
  start_on date not null,
  -- null = vô hạn; kỳ đến hạn > end_on không sinh
  end_on date,
  is_paused boolean not null default false,
  -- Kỳ đến hạn cuối đã sinh; null = chưa sinh kỳ nào
  last_generated_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (to_account_id, user_id) references public.accounts (id, user_id),
  -- Hình dạng theo loại — y hệt bảng transactions
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

alter table public.recurring_rules enable row level security;

create policy "own rows" on public.recurring_rules
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger set_updated_at
  before update on public.recurring_rules
  for each row
  execute function extensions.moddatetime (updated_at);

-- FK đơn cột + on delete set null: xóa rule giữ nguyên giao dịch cũ (mất liên
-- kết). Composite FK không dùng được vì user_id NOT NULL (cùng lý do
-- debt_payments.transaction_id ở migration 0007).
alter table public.transactions
  add column recurring_rule_id uuid references public.recurring_rules (id) on delete set null;

-- Mỗi rule mỗi ngày đến hạn chỉ có 1 giao dịch — chống 2 thiết bị sinh trùng
create unique index idx_tx_recurring_due
  on public.transactions (recurring_rule_id, occurred_on)
  where recurring_rule_id is not null;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0009_credit_card.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0010_card_payment_source.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0011_debt_disbursement.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- Sổ Chi Tiêu — Migration 0011: giao dịch giải ngân khi tạo khoản nợ
-- Lúc tạo khoản nợ có thể chuyển tiền thật (cho vay = chi, mình nợ = thu).
-- debts.disbursement_transaction_id TRỎ tới giao dịch đó (nếu có).
-- FK đơn cột + on delete set null: xóa giao dịch ở sổ không làm hỏng khoản nợ.
-- ============================================================

alter table public.debts
  add column disbursement_transaction_id uuid
    references public.transactions (id) on delete set null;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0012_account_types_jp.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0013_remittance.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- Sổ Chi Tiêu — Migration 0013: Gửi tiền về Việt Nam
-- Mỗi lần gửi là MỘT giao dịch (transfer = chuyển tài sản sang TK VND, hoặc
-- expense = hỗ trợ gia đình). 4 cột dưới chỉ dùng khi is_remittance=true.
-- Số dư/Tài sản ròng tự đúng vì gửi tiền chính là giao dịch — view balance
-- KHÔNG cần sửa (không đọc các cột này).
-- ============================================================

alter table public.transactions
  add column if not exists is_remittance boolean not null default false;
alter table public.transactions
  add column if not exists remit_service text;         -- Wise / SBI Remit / Brastel / DCOM / Khác
alter table public.transactions
  add column if not exists remit_fee_jpy bigint;       -- phí dịch vụ (minor units JPY = yên)
alter table public.transactions
  add column if not exists remit_received_vnd bigint;  -- số VND người nhận nhận được (minor units VND = đồng)


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0014_debt_flow.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- Sổ Chi Tiêu — Migration 0014: Dòng tiền nợ/cho vay (is_debt_flow)
-- Đánh dấu giao dịch là "dòng tiền cho vay / trả nợ / trả hộ" chứ không phải
-- chi tiêu/thu nhập thật. Số dư & Tài sản ròng VẪN tính (tiền thật đã dịch
-- chuyển) — view balance không đọc cột này nên không cần sửa. Chỉ báo cáo
-- Chi/Thu bỏ qua các giao dịch này để không bị phồng số liệu.
--
-- Không backfill: chỉ áp dụng cho giao dịch tạo từ nay. Các khoản cho vay/trả
-- nợ cũ giữ nguyên trong báo cáo như trước.
-- ============================================================

alter table public.transactions
  add column if not exists is_debt_flow boolean not null default false;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0015_card_due_day_view.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0016_investment_valuation.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0017_default_categories_v2.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 0017: Bộ danh mục mặc định mới cho người dùng MỚI.
-- Thay danh sách danh mục seed trong handle_new_user bằng bộ chuẩn hoá kiểu
-- "Money Manager" (dịch tiếng Việt), lần đầu có cả DANH MỤC CON cho nhóm Chi.
-- Nhóm Thu giữ nguyên. Không đụng dữ liệu của người dùng hiện có.
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

  -- Nhóm cha (Chi) + toàn bộ nhóm Thu. sort_order chừa khoảng cho danh mục con.
  insert into public.categories (user_id, name, type, icon, parent_id, sort_order) values
    (new.id, 'Nhà ở',              'expense', '🏠', null, 0),
    (new.id, 'Ăn uống',            'expense', '🍜', null, 8),
    (new.id, 'Giao tế',            'expense', '👫', null, 15),
    (new.id, 'Đi lại',             'expense', '🚆', null, 18),
    (new.id, 'Thời trang',         'expense', '🧥', null, 24),
    (new.id, 'Sở thích',           'expense', '🌱', null, 30),
    (new.id, 'Sức khỏe',           'expense', '🧘', null, 35),
    (new.id, 'Tài chính & Đầu tư', 'expense', '📊', null, 40),
    (new.id, 'Giáo dục',           'expense', '📔', null, 41),
    (new.id, 'Quà tặng',           'expense', '🎁', null, 45),
    (new.id, 'Khác',               'expense', '📦', null, 48),
    (new.id, 'Lương',      'income', '💰', null, 0),
    (new.id, 'Thưởng',     'income', '🎉', null, 1),
    (new.id, 'Được tặng',  'income', '🧧', null, 2),
    (new.id, 'Đầu tư',     'income', '📈', null, 3),
    (new.id, 'Khác',       'income', '💵', null, 4);

  -- Danh mục con (Chi): tra parent_id theo tên nhóm cha vừa tạo.
  insert into public.categories (user_id, name, type, icon, parent_id, sort_order)
  select new.id, d.name, 'expense', d.icon,
         (select id from public.categories p
           where p.user_id = new.id and p.type = 'expense'
             and p.name = d.parent and p.parent_id is null),
         d.ord
  from (values
    ('Tiền nhà',            '🔑', 'Nhà ở',       1),
    ('Nội thất',            '🛋️', 'Nhà ở',       2),
    ('Đồ bếp',              '🍳', 'Nhà ở',       3),
    ('Đồ vệ sinh cá nhân',  '🧴', 'Nhà ở',       4),
    ('Điện',                '💡', 'Nhà ở',       5),
    ('Nước',                '🚰', 'Nhà ở',       6),
    ('Gas',                 '🔥', 'Nhà ở',       7),
    ('Bữa sáng',            '🥐', 'Ăn uống',     9),
    ('Bữa trưa',            '🍱', 'Ăn uống',    10),
    ('Bữa tối',             '🍚', 'Ăn uống',    11),
    ('Ăn ngoài',            '🍽️', 'Ăn uống',    12),
    ('Đồ uống',             '🥤', 'Ăn uống',    13),
    ('Đi chợ',              '🛒', 'Ăn uống',    14),
    ('Bạn bè',              '🧑‍🤝‍🧑', 'Giao tế',  16),
    ('Tình cảm',            '💑', 'Giao tế',    17),
    ('Xe buýt',             '🚌', 'Đi lại',     19),
    ('Tàu điện',            '🚉', 'Đi lại',     20),
    ('Taxi',                '🚕', 'Đi lại',     21),
    ('Ô tô',                '🚗', 'Đi lại',     22),
    ('Luup',                '🛴', 'Đi lại',     23),
    ('Quần áo',             '👕', 'Thời trang', 25),
    ('Giày dép',            '👟', 'Thời trang', 26),
    ('Phụ kiện',            '👜', 'Thời trang', 27),
    ('Mỹ phẩm',             '💄', 'Thời trang', 28),
    ('Giặt là',             '🧺', 'Thời trang', 29),
    ('Cây cối',             '🪴', 'Sở thích',   31),
    ('Nhiếp ảnh',           '📷', 'Sở thích',   32),
    ('Đăng ký',             '📺', 'Sở thích',   33),
    ('Thể thao',            '⚽', 'Sở thích',   34),
    ('Gym',                 '🏋️', 'Sức khỏe',   36),
    ('Bệnh viện',           '🏥', 'Sức khỏe',   37),
    ('Thuốc',               '💊', 'Sức khỏe',   38),
    ('Thuốc lá',            '🚬', 'Sức khỏe',   39),
    ('Thi cử',              '📝', 'Giáo dục',   42),
    ('Học phí',             '🏫', 'Giáo dục',   43),
    ('Sách vở',             '📚', 'Giáo dục',   44),
    ('Quà',                 '🎀', 'Quà tặng',   46),
    ('Hỗ trợ gia đình',     '👪', 'Quà tặng',   47)
  ) as d(name, icon, parent, ord);

  return new;
end;
$$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0018_savings_goals.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- Sổ Chi Tiêu — Migration 0018: Mục tiêu tiết kiệm (backlog mục AD)
-- Mỗi mục tiêu gắn với MỘT tài khoản; tiến độ = số dư tài khoản đó / target_amount
-- (cùng currency với tài khoản). target_date tùy chọn để nhắc thời hạn.
-- ============================================================

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  account_id uuid not null,
  -- Đích cần đạt: minor units theo currency của tài khoản. > 0.
  target_amount bigint not null check (target_amount > 0),
  target_date date,
  note text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  -- Composite FK: tài khoản thuộc đúng user; xóa tài khoản → xóa mục tiêu
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade
);

create index savings_goals_user_idx on public.savings_goals (user_id, sort_order);

alter table public.savings_goals enable row level security;

create policy "own rows" on public.savings_goals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0019_budget_rollover.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- Sổ Chi Tiêu — Migration 0019: Ngân sách nâng cao — dồn hạn mức (backlog mục AH)
-- Cờ rollover (opt-in từng danh mục): phần hạn mức chưa tiêu tháng trước được cộng
-- thêm vào hạn mức tháng này. Tính ở tầng ứng dụng (buildBudgetReport); cột chỉ lưu
-- lựa chọn bật/tắt của từng hạn mức.
-- ============================================================

alter table public.budgets
  add column if not exists rollover boolean not null default false;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0020_networth_snapshots.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- Sổ Chi Tiêu — Migration 0020: Lịch sử tài sản ròng (backlog mục AF)
-- Ảnh chụp tài sản ròng (đã quy đổi base currency) theo ngày. Số dư quá khứ tính
-- lại được từ giao dịch, NHƯNG tỷ giá quá khứ thì không → phải snapshot. App ghi
-- một snapshot/ngày khi mở trang Tài sản (upsert theo ngày).
-- ============================================================

create table public.networth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  snapshot_on date not null default current_date,
  -- Tài sản ròng quy đổi base currency (minor units); có thể âm.
  net_worth bigint not null,
  created_at timestamptz not null default now(),
  unique (user_id, snapshot_on)
);

create index networth_snapshots_user_idx
  on public.networth_snapshots (user_id, snapshot_on);

alter table public.networth_snapshots enable row level security;

create policy "own rows" on public.networth_snapshots
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0021_debt_interest.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- Sổ Chi Tiêu — Migration 0021: nợ có lãi suất / trả góp (mục AG)
-- Thêm lãi suất năm (basis points, số nguyên: 550 = 5.50%/năm) và số kỳ trả góp.
-- Cả hai NULL = khoản nợ thường (không tính lịch trả). Không có tiền → dùng integer,
-- lịch trả dự kiến tính ở client (amortization) để tránh phụ thuộc cách tính lãi.
-- ============================================================

alter table public.debts
  add column interest_bps integer,
  add column term_months integer;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0022_exclude_from_stats.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- Sổ Chi Tiêu — Migration 0022: Loại trừ giao dịch khỏi thống kê (backlog mục AM)
-- (Đổi số từ 0017 → 0022 vì trùng số với 0017_default_categories_v2 làm song song.)
-- Cờ exclude_from_stats: giao dịch vẫn ảnh hưởng SỐ DƯ tài khoản nhưng KHÔNG tính
-- vào báo cáo/ngân sách/insight (hoàn tiền, mua hộ, bút toán điều chỉnh số dư — mục X).
-- Khác is_debt_flow (dành riêng dòng nợ/cho vay); cả hai đều bị loại khỏi Chi/Thu.
-- ============================================================

alter table public.transactions
  add column if not exists exclude_from_stats boolean not null default false;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0023_debt_advances.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 0024_budget_leaf_only.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Mô hình ngân sách "1 cấp": chỉ danh mục LÁ (không có con) mới được đặt hạn mức
-- trực tiếp. Hạn mức của danh mục MẸ = tổng hạn mức các con, tính ở tầng ứng
-- dụng (không lưu). Dọn các hạn mức lỡ đặt thẳng vào danh mục mẹ theo thiết kế
-- cũ (nơi chi tiêu con bị gộp lên mẹ) để tránh trùng lặp và số liệu khó hiểu.
delete from public.budgets b
where exists (
  select 1
  from public.categories c
  where c.parent_id = b.category_id
    and coalesce(c.is_archived, false) = false
);

