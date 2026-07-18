-- ============================================================
-- Sổ Chi Tiêu — Migration 0003: nhóm tài sản (asset_group)
-- Người dùng tự phân loại tài khoản (Tiêu dùng, Tiết kiệm, Đầu tư…)
-- để trang Tài sản tổng hợp & vẽ tỷ trọng theo nhóm.
-- ============================================================

-- 1. Cột mới trên accounts (nullable = chưa phân nhóm)
alter table public.accounts
  add column if not exists asset_group text;

-- 2. Nạp lại view số dư để lộ asset_group.
--    Phải drop + create vì đổi danh sách cột của view.
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
  a.is_archived,
  a.sort_order,
  a.initial_balance
    + coalesce(sum(
        case
          when t.type = 'income'   and t.account_id    = a.id then  t.amount
          when t.type = 'expense'  and t.account_id    = a.id then -t.amount
          when t.type = 'transfer' and t.account_id    = a.id then -t.amount
          -- Xuyên tệ: bên nhận cộng to_amount (minor units của tài khoản đích)
          when t.type = 'transfer' and t.to_account_id = a.id then coalesce(t.to_amount, t.amount)
          else 0
        end
      ), 0) as balance
from public.accounts a
left join public.transactions t
  on t.user_id = a.user_id
 and (t.account_id = a.id or t.to_account_id = a.id)
group by a.id;

-- 3. Seed tài khoản mặc định kèm nhóm cho user mới.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );

  insert into public.accounts (user_id, name, type, currency, asset_group, sort_order) values
    (new.id, 'Tiền mặt',   'cash', 'JPY', 'Tiêu dùng', 0),
    (new.id, 'Ngân hàng',  'bank', 'JPY', 'Tiêu dùng', 1),
    (new.id, 'Đầu tư VN',  'bank', 'VND', 'Đầu tư',    2),
    (new.id, 'Dự trữ USD', 'bank', 'USD', 'Dự phòng',  3);

  insert into public.categories (user_id, name, type, icon, sort_order) values
    -- Danh mục chi
    (new.id, 'Ăn uống',             'expense', '🍜', 0),
    (new.id, 'Đi lại',              'expense', '🚌', 1),
    (new.id, 'Mua sắm',             'expense', '🛍️', 2),
    (new.id, 'Hóa đơn & tiện ích',  'expense', '🧾', 3),
    (new.id, 'Nhà cửa',             'expense', '🏠', 4),
    (new.id, 'Sức khỏe',            'expense', '💊', 5),
    (new.id, 'Giải trí',            'expense', '🎮', 6),
    (new.id, 'Giáo dục',            'expense', '📚', 7),
    (new.id, 'Quà tặng & từ thiện', 'expense', '🎁', 8),
    (new.id, 'Khác',                'expense', '📦', 9),
    -- Danh mục thu
    (new.id, 'Lương',      'income', '💰', 0),
    (new.id, 'Thưởng',     'income', '🎉', 1),
    (new.id, 'Được tặng',  'income', '🧧', 2),
    (new.id, 'Đầu tư',     'income', '📈', 3),
    (new.id, 'Khác',       'income', '💵', 4);

  return new;
end;
$$;
