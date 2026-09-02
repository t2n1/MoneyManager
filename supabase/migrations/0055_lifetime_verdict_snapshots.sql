-- ============================================================
-- Sổ Chi Tiêu — Migration 0055: Lịch sử KẾT LUẬN của tab Tương lai
--
-- VÌ SAO PHẢI SNAPSHOT, KHÔNG TÍNH LẠI
-- Câu "Đủ tới hết đời · FIRE 2045" là kết luận của bản chiếu HÔM NAY. Ba tháng sau
-- người dùng chỉ còn thấy kết luận mới, không có cách nào biết nó đã trôi từ đâu tới:
--   1. Kịch bản đổi theo thời gian (sửa chặng, thêm mốc, đổi lợi suất) và không có
--      lịch sử phiên bản của kịch bản — chiếu lại "kịch bản như hồi tháng 6" là không
--      thể.
--   2. Tài sản khởi điểm lấy từ tài sản ròng hôm nay, và tỷ giá quá khứ không dựng lại
--      được — cùng lý do migration 0020 (networth_snapshots) và 0048 (health_snapshots).
--
-- Nên: ghi lại kết luận ĐÃ TÍNH, mỗi tháng một dòng cho MỖI kịch bản, upsert khi mở tab
-- Tương lai. Chỉ ghi từ bản ĐÃ LƯU (không ghi bản nháp, không ghi lúc bật cú sốc) để
-- lịch sử là kế hoạch thật, không phải những lần vặn thử.
--
-- Lưu cả `end_age` và `display_currency`: hai dòng khác tuổi chiếu hoặc khác tiền hiển
-- thị thì "tài sản lúc cuối" không so được với nhau — và không lưu thì sáu tháng sau
-- không còn cách nào biết điều đó.
-- ============================================================

create table if not exists public.lifetime_verdict_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scenario_id uuid not null,
  -- Ngày đầu của THÁNG TÀI CHÍNH, không phải ngày ghi: một tháng một dòng mỗi kịch bản.
  month_on date not null,
  -- Năm đạt tự do tài chính theo quy tắc rút 4%. null = không đạt trong bản chiếu.
  fire_year int,
  -- Năm đầu tiên nhánh bi quan xuống dưới 0. null = không năm nào.
  negative_year int,
  end_age smallint not null check (end_age between 30 and 120),
  -- Tài sản ròng nhánh trung tâm lúc `end_age`, minor units của `display_currency`.
  assets_end_minor bigint not null,
  display_currency text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (scenario_id, user_id) references public.life_scenarios (id, user_id) on delete cascade,
  unique (user_id, scenario_id, month_on)
);

create index if not exists lifetime_verdict_snapshots_user_idx
  on public.lifetime_verdict_snapshots (user_id, scenario_id, month_on);

alter table public.lifetime_verdict_snapshots enable row level security;

-- `drop policy if exists` trước khi tạo — quy ước của 0026/0029/0039/0048.
drop policy if exists "own rows" on public.lifetime_verdict_snapshots;
create policy "own rows" on public.lifetime_verdict_snapshots
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
