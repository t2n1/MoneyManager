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
