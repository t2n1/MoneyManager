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
