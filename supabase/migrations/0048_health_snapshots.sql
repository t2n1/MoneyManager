-- ============================================================
-- Sổ Chi Tiêu — Migration 0048: Lịch sử điểm sức khỏe (bản vẽ 27b mục 5)
--
-- VÌ SAO PHẢI SNAPSHOT, KHÔNG TÍNH LẠI
-- `buildHealthSnapshot` là hàm thuần và nhận `months` + `today`, nên về lý thuyết
-- chiếu lại quá khứ được. Nhưng nó không ra đúng con số của quá khứ:
--
--   1. TỶ GIÁ QUÁ KHỨ không tính lại được — cùng lý do migration 0020 phải snapshot
--      tài sản ròng. Ba trong sáu chỉ số có mẫu số quy đổi base.
--   2. SỐ DƯ HÔM NAY là điểm neo. `account_balances` chỉ có số dư hiện tại; muốn số
--      dư của tháng 3 thì phải lùi từ hôm nay qua từng giao dịch — và giao dịch nhập
--      muộn (ghi hôm nay cho một khoản tháng 3) làm phép lùi đó ra một con số mà
--      tháng 3 chưa từng thấy.
--   3. NGƯỠNG và TRỌNG SỐ có thể đổi. Điểm 58 của tháng 3 là điểm theo bộ luật lúc
--      đó; chiếu lại bằng bộ luật hôm nay là so hai thước khác nhau rồi gọi hiệu số
--      của chúng là "xu hướng".
--
-- Nên: ghi lại điểm ĐÃ TÍNH, mỗi tháng một dòng, upsert khi mở tab Sức khỏe.
--
-- Lưu cả `coverage`: một điểm chấm trên 4/6 chỉ số không so được với điểm chấm trên
-- 6/6, và không lưu thì sáu tháng sau không còn cách nào biết điều đó.
-- ============================================================

create table if not exists public.health_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Ngày đầu của THÁNG TÀI CHÍNH được chấm, không phải ngày chấm: một tháng chỉ có
  -- một điểm, và mở tab ba lần trong tháng thì ghi đè chứ không sinh ba dòng.
  month_on date not null,
  -- 0..100.
  score smallint not null check (score between 0 and 100),
  -- Phần trọng số đã chấm được, basis points (10000 = đủ sáu chỉ số).
  coverage_bps int not null default 10000 check (coverage_bps between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month_on)
);

create index if not exists health_snapshots_user_idx
  on public.health_snapshots (user_id, month_on);

alter table public.health_snapshots enable row level security;

-- `drop policy if exists` trước khi tạo — quy ước của 0026/0029/0039. `create policy`
-- không có dạng `if not exists`, nên thiếu dòng này thì lần chạy lại thứ hai gãy ở lỗi
-- 42710 (duplicate_object) và kéo theo cả migration dừng giữa đường.
drop policy if exists "own rows" on public.health_snapshots;
create policy "own rows" on public.health_snapshots
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
