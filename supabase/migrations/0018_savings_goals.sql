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
