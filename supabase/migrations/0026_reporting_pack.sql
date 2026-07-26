-- ============================================================
-- Sổ Chi Tiêu — Migration 0026: Gói báo cáo tài chính cá nhân
-- Gom mọi trường mới cần cho đợt báo cáo (khối 0–10) vào một lần chạy:
--   profiles  : lương theo giờ, lạm phát năm, thuế lãi vốn (cho XIRR thực)
--   accounts  : loại 'fixed' (tài sản cố định + khấu hao), ưu đãi thuế NISA/iDeCo
--   transactions: is_refund (hoàn tiền = CHI ÂM, không phải thu nhập)
--   tags / transaction_tags: nhãn cắt ngang danh mục (vd "Về VN 2026")
-- View account_balances nạp lại: cộng thêm cột mới + xử lý dấu của hoàn tiền.
-- ============================================================

-- ------------------------------------------------------------
-- 1. profiles — tham số cá nhân cho các chỉ số nâng cao
-- ------------------------------------------------------------
alter table public.profiles
  -- Thu nhập mỗi GIỜ làm (minor units theo base_currency) — quy đổi "món này =
  -- mấy giờ làm". null = chưa khai báo, UI ẩn phần quy đổi.
  add column if not exists hourly_wage bigint check (hourly_wage is null or hourly_wage > 0),
  -- Lạm phát năm dùng để tính lợi nhuận THỰC (basis points; 250 = 2.50%/năm).
  -- null = chưa đặt, UI chỉ hiện lợi nhuận danh nghĩa.
  add column if not exists annual_inflation_bps int
    check (annual_inflation_bps is null or annual_inflation_bps between -10000 and 100000),
  -- Thuế lãi vốn áp lên phần LỜI khi tính lợi nhuận sau thuế.
  -- Mặc định 2032 bps = 20.32% (Nhật: 20.315% 所得税+住民税+復興特別所得税).
  add column if not exists capital_gains_tax_bps int not null default 2032
    check (capital_gains_tax_bps between 0 and 10000);

-- ------------------------------------------------------------
-- 2. accounts — tài sản cố định (khấu hao) + tài khoản ưu đãi thuế
-- ------------------------------------------------------------
alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts
  add constraint accounts_type_check
  check (type in ('cash', 'bank', 'card', 'ic', 'ewallet', 'investment', 'fixed'));

alter table public.accounts
  -- Tài sản cố định: số tháng khấu hao tuyến tính từ giá mua về salvage_value.
  -- null = không khấu hao tự động (giá trị = số dư sổ hoặc snapshot nhập tay).
  add column if not exists depreciation_months int
    check (depreciation_months is null or depreciation_months > 0),
  -- Mốc bắt đầu khấu hao (ngày mua). null = chưa đặt → không khấu hao.
  add column if not exists depreciation_from date,
  -- Giá trị còn lại khi hết vòng đời (minor units); xe/đồng hồ hiếm khi về 0.
  add column if not exists salvage_value bigint not null default 0
    check (salvage_value >= 0),
  -- Tài khoản ưu đãi thuế Nhật: hạn mức nạp theo NĂM cần theo dõi.
  add column if not exists tax_shelter text
    check (tax_shelter in ('nisa_tsumitate', 'nisa_growth', 'ideco')),
  -- Hạn mức nạp mỗi năm (minor units theo currency tài khoản); null = chưa đặt.
  add column if not exists shelter_annual_limit bigint
    check (shelter_annual_limit is null or shelter_annual_limit > 0);

-- ------------------------------------------------------------
-- 3. transactions — hoàn tiền
-- ------------------------------------------------------------
-- Hoàn tiền (trả hàng, hủy vé, hoàn phí): tiền chảy NGƯỢC về ví nhưng KHÔNG
-- phải thu nhập. Ghi là type='expense' + is_refund=true, amount vẫn > 0; mọi
-- nơi cộng chi phải trừ đi khoản này (helper expenseSign ở tầng ứng dụng), và
-- view số dư cộng thay vì trừ.
alter table public.transactions
  add column if not exists is_refund boolean not null default false;

alter table public.transactions drop constraint if exists transactions_refund_check;
alter table public.transactions
  add constraint transactions_refund_check
  check (not is_refund or type = 'expense');

-- Cần cho composite FK từ transaction_tags (đảm bảo nhãn & giao dịch cùng user)
alter table public.transactions drop constraint if exists transactions_id_user_key;
alter table public.transactions add constraint transactions_id_user_key unique (id, user_id);

-- ------------------------------------------------------------
-- 4. tags — nhãn cắt ngang danh mục
-- ------------------------------------------------------------
-- Danh mục trả lời "tiêu vào việc gì" (1 giá trị, có cây cha–con). Nhãn trả lời
-- "thuộc dịp/dự án nào" (nhiều giá trị, phẳng): "Về VN 2026", "Đám cưới",
-- "Chuyển nhà". Không thay thế nhau.
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  -- Khóa màu (app tự ánh xạ sang mã màu); giữ text để không phải migrate khi đổi bảng màu.
  color text not null default 'gray',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table if not exists public.transaction_tags (
  transaction_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (transaction_id, tag_id),
  foreign key (transaction_id, user_id)
    references public.transactions (id, user_id) on delete cascade,
  foreign key (tag_id, user_id)
    references public.tags (id, user_id) on delete cascade
);

create index if not exists transaction_tags_tag_idx on public.transaction_tags (user_id, tag_id);

alter table public.tags enable row level security;
alter table public.transaction_tags enable row level security;

drop policy if exists "own rows" on public.tags;
create policy "own rows" on public.tags
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own rows" on public.transaction_tags;
create policy "own rows" on public.transaction_tags
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ------------------------------------------------------------
-- 5. Nạp lại view account_balances
--    Đổi so với 0016: (a) hoàn tiền CỘNG vào số dư thay vì trừ,
--    (b) lộ thêm cột khấu hao + ưu đãi thuế để tầng ứng dụng tính giá trị
--        tài sản cố định mà không phải join thêm bảng accounts.
-- ------------------------------------------------------------
drop view if exists public.account_balances;

create view public.account_balances
with (security_invoker = true) as
select
  a.id,
  a.user_id,
  a.name,
  a.type,
  a.currency,
  a.asset_group,
  a.is_hidden,
  a.include_in_totals,
  a.credit_limit,
  a.statement_day,
  a.payment_due_day,
  a.payment_account_id,
  a.is_archived,
  a.sort_order,
  a.initial_balance as cost_basis,
  a.depreciation_months,
  a.depreciation_from,
  a.salvage_value,
  a.tax_shelter,
  a.shelter_annual_limit,
  mv.market_value,
  a.initial_balance
    + coalesce(sum(
        case
          when t.type = 'income'   and t.account_id    = a.id then  t.amount
          -- Hoàn tiền: tiền quay lại ví → cộng (chi âm)
          when t.type = 'expense'  and t.account_id    = a.id and t.is_refund then  t.amount
          when t.type = 'expense'  and t.account_id    = a.id then -t.amount
          when t.type = 'transfer' and t.account_id    = a.id then -t.amount
          when t.type = 'transfer' and t.to_account_id = a.id then coalesce(t.to_amount, t.amount)
          else 0
        end
      ), 0) as balance
from public.accounts a
left join public.transactions t
  on t.user_id = a.user_id
 and (t.account_id = a.id or t.to_account_id = a.id)
left join lateral (
  select v.market_value
  from public.account_valuations v
  where v.account_id = a.id
  order by v.valued_on desc, v.created_at desc
  limit 1
) mv on true
group by a.id, mv.market_value;
