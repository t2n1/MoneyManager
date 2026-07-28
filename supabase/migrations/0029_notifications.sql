-- ============================================================
-- Sổ Chi Tiêu — Migration 0029: Thông báo trong app
-- Thông báo KHÔNG lưu nội dung — nội dung tính tại chỗ trên máy từ dữ liệu sẵn có.
-- Bảng này chỉ nhớ "mã nào đã đọc / đã tắt", để hai thiết bị không báo lại chồng nhau.
-- fx_history chỉ tích dữ liệu cho luật "tỷ giá đẹp" ở đợt sau; đợt này không ai đọc nó.
-- ============================================================

create table if not exists public.notification_state (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  -- Mã thông báo. Việc-cần-làm: '<type>:<id>' (không kèm kỳ).
  -- Tin-để-biết: '<type>:<id>:<kỳ>'. Xem mục B của spec.
  key          text        not null,
  read_at      timestamptz,
  dismissed_at timestamptz,
  -- Chưa dùng; chừa sẵn cho push ở đợt sau (khỏi migration lần hai).
  pushed_at    timestamptz,
  created_at   timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists notification_state_cleanup_idx
  on public.notification_state (user_id, created_at);

alter table public.notification_state enable row level security;

drop policy if exists "own rows" on public.notification_state;
create policy "own rows" on public.notification_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Loại thông báo đã tắt; mảng rỗng = bật hết.
alter table public.profiles
  add column if not exists notif_off text[] not null default '{}';

-- Lịch sử tỷ giá theo ngày (một dòng mỗi ngày mỗi base).
create table if not exists public.fx_history (
  user_id uuid  not null references auth.users (id) on delete cascade,
  on_date date  not null,
  base    text  not null,
  -- { "VND": 172.5, "USD": 0.0064 } — major units, 1 base đổi được bao nhiêu.
  rates   jsonb not null,
  primary key (user_id, on_date, base)
);

alter table public.fx_history enable row level security;

drop policy if exists "own rows" on public.fx_history;
create policy "own rows" on public.fx_history
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
