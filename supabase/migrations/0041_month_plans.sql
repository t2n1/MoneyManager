-- ============================================================
-- Sổ Chi Tiêu — Migration 0041: THU DỰ KIẾN của một tháng
--
-- Mặt lập kế hoạch của tab Ngân sách chia thu nhập ra thành hạn mức. Mẫu số của
-- phép chia đó tới nay luôn là `baselineIncome()` — trung bình thu của 3 tháng đã
-- hoàn tất. Trung bình chạy được với tháng bình thường, nhưng mù đúng lúc quan trọng
-- nhất: tháng có ボーナス ở Nhật lệch hẳn hai, ba tháng lương, và trung bình 3 tháng
-- trước đó không hề biết nó sắp tới. Lập kế hoạch cho tháng thưởng bằng mẫu số của
-- tháng thường là lập sai ngay từ dòng đầu.
--
-- Nên bảng này lưu ĐÚNG MỘT thứ: "tôi biết tháng này thu bao nhiêu". Không có nó thì
-- app vẫn chạy y như cũ bằng số trung bình — đây là phần ĐÈ LÊN, không phải phần bắt
-- buộc khai.
--
-- Vì sao là bảng riêng chứ không phải cột của `budgets`: budgets khoá theo
-- (user, DANH MỤC, tháng) nên không có chỗ nào treo một con số của cả tháng. Nhét vào
-- đó phải bịa ra một dòng danh mục giả, và mọi phép cộng tổng hạn mức sẽ phải nhớ mà
-- loại nó ra — sớm muộn có chỗ quên.
--
-- expected_income >= 0 chứ không phải > 0: tháng nghỉ không lương thu = 0 là số THẬT,
-- và kế hoạch lúc đó vẫn phải tính được (chia 0 đồng thì mọi hạn mức đều là bội chi —
-- đúng cái người ta cần thấy). Khác hẳn budgets.amount > 0, nơi 0 mang nghĩa "xoá".
-- Ở đây bỏ đè là XOÁ DÒNG, một hành động riêng, không phải gõ số 0.
-- ============================================================

create table if not exists public.month_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- "YYYY-MM" theo MonthKey (tôn trọng month_start_day). VD: '2026-09'
  month_key text not null check (month_key ~ '^\d{4}-\d{2}$'),
  -- Minor units theo base_currency. Không bao giờ dùng float.
  expected_income bigint not null check (expected_income >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Mỗi tháng nhiều nhất một số thu dự kiến → upsert theo khoá này
  unique (user_id, month_key)
);

create index if not exists idx_month_plan_user_month
  on public.month_plans (user_id, month_key);

alter table public.month_plans enable row level security;

drop policy if exists "own rows" on public.month_plans;
create policy "own rows" on public.month_plans
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop trigger if exists set_updated_at on public.month_plans;
create trigger set_updated_at
  before update on public.month_plans
  for each row
  execute function extensions.moddatetime (updated_at);

comment on table public.month_plans is
  'Thu dự kiến của một tháng, do người dùng khai tay. Vắng dòng = dùng trung bình 3 tháng đã hoàn tất (baselineIncome).';
