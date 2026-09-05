-- Chuyến đi (spec 2026-09-05-chuyen-di): dải ngày người dùng đi vắng.
-- `dismissed = true` KHÔNG phải một chuyến — nó là trí nhớ "đã hỏi về dải này rồi,
-- người dùng nói không phải", để app không hỏi lại. Mọi phép tính chỉ lấy dismissed = false.
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  start_on date not null,
  end_on date not null,
  label text not null default '',
  -- ISO-2 nơi đến. Đợt 1 chưa tính gì từ nó; đợt 2b cần để biết quy đổi sang tiền nào.
  country text not null default 'VN',
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint trips_range_ok check (end_on >= start_on)
);

create index if not exists trips_user_idx on public.trips (user_id, start_on);

alter table public.trips enable row level security;
drop policy if exists "own rows" on public.trips;
create policy "own rows" on public.trips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
