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
