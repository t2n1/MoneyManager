-- ============================================================
-- Sổ Chi Tiêu — Migration 0031: Lifetime (chiếu tài sản ròng cả đời)
-- Kịch bản = CHẶNG ĐỜI (thu chi nền) + SỰ KIỆN (khoản có ngày đầu/cuối).
-- Chặng đời CỐ Ý không buộc theo quốc gia: cưới vợ, sinh con, vợ nghỉ làm
-- cũng đổi thu chi nền y như đổi nước. `country` chỉ là thuộc tính, để trống được.
-- Lương hưu là SỰ KIỆN chứ không phải cột trên chặng — người dùng đóng 年金 ở Nhật
-- nhưng nhận khi đã sang Mỹ, gắn vào chặng là mô hình sai.
-- ============================================================

-- Năm sinh: cần để đổi năm ↔ tuổi. Nullable — chưa khai thì màn Lifetime hỏi.
alter table public.profiles
  add column birth_year int check (birth_year between 1900 and 2100);

create table public.life_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  -- Đơn vị của đồ thị và bảng năm. Chặng đời nhập theo tiền bản địa rồi quy về đây.
  display_currency text not null default 'JPY',
  end_age int not null default 90 check (end_age between 50 and 120),
  -- Lợi suất THỰC (đã trừ lạm phát). Âm được: gửi ngân hàng Nhật thời lạm phát.
  real_return_bps int not null default 200 check (real_return_bps between -500 and 2000),
  -- Nửa độ rộng dải dao động: chạy lại engine với realReturn ± giá trị này.
  band_spread_bps int not null default 150 check (band_spread_bps between 0 and 1000),
  starting_assets_minor bigint not null default 0,
  -- false = giá hôm nay (mặc định). true = giá danh nghĩa.
  nominal_terms boolean not null default false,
  is_primary boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  -- Cho bảng con dùng composite FK (cùng khuôn accounts ← savings_goals ở 0018)
  unique (id, user_id)
);

create index life_scenarios_user_idx on public.life_scenarios (user_id, sort_order);

create table public.life_phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scenario_id uuid not null,
  -- Không có end_year: chặng sau bắt đầu thì chặng trước kết thúc.
  start_year int not null check (start_year between 1900 and 2200),
  label text not null default '',
  -- 'JP' | 'US' | 'VN' | ... | null. KHÔNG ràng buộc enum: chặng có thể là "Cưới".
  country text,
  currency text not null,
  annual_income_minor bigint not null default 0 check (annual_income_minor >= 0),
  annual_expense_minor bigint not null default 0 check (annual_expense_minor >= 0),
  -- 1 đơn vị `currency` = bao nhiêu đơn vị display_currency, tính theo MAJOR units.
  -- Là GIẢ ĐỊNH người dùng khai, không phải tỷ giá spot từ lib/rates.ts.
  fx_to_display numeric not null default 1 check (fx_to_display > 0),
  created_at timestamptz not null default now(),
  foreign key (scenario_id, user_id) references public.life_scenarios (id, user_id) on delete cascade,
  -- Hai chặng cùng năm bắt đầu thì engine không biết chọn cái nào.
  unique (scenario_id, start_year)
);

create index life_phases_scenario_idx on public.life_phases (scenario_id, start_year);

create table public.life_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scenario_id uuid not null,
  start_year int not null check (start_year between 1900 and 2200),
  -- null = đến hết đời (lương hưu). Ngược lại phải >= start_year.
  end_year int check (end_year between 1900 and 2200),
  kind text not null check (kind in ('income', 'expense')),
  -- Số MỖI NĂM trong khoảng, không phải tổng cả khoảng.
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null,
  label text not null,
  note text not null default '',
  -- Có tăng theo lạm phát hay không. 年金 = false, học phí = true.
  inflate boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (scenario_id, user_id) references public.life_scenarios (id, user_id) on delete cascade,
  check (end_year is null or end_year >= start_year)
);

create index life_events_scenario_idx on public.life_events (scenario_id, start_year);

alter table public.life_scenarios enable row level security;
alter table public.life_phases enable row level security;
alter table public.life_events enable row level security;

create policy "own rows" on public.life_scenarios
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.life_phases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.life_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
