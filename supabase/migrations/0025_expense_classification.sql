-- ============================================================
-- Sổ Chi Tiêu — Migration 0025: Phân loại chi tiêu 2 trục
-- need_level: essential (thiết yếu) | flexible (linh hoạt)
-- cost_type:  fixed (cố định)       | variable (biến đổi)
-- Cả hai nullable, chỉ dùng cho danh mục Chi lá.
-- ============================================================

alter table public.categories
  add column if not exists need_level text
    check (need_level in ('essential','flexible')),
  add column if not exists cost_type text
    check (cost_type in ('fixed','variable'));

-- Backfill nhãn cho danh mục MẶC ĐỊNH của người dùng hiện có (khớp theo tên
-- danh mục con ở seed 0017). Chỉ chạm hàng expense đang null để không đè phân
-- loại người dùng đã tự đặt.
update public.categories c set
  need_level = v.need_level,
  cost_type  = v.cost_type
from (values
  -- Nhà ở
  ('Tiền nhà','essential','fixed'),
  ('Nội thất','flexible','variable'),
  ('Đồ bếp','flexible','variable'),
  ('Đồ vệ sinh cá nhân','essential','variable'),
  ('Điện','essential','variable'),
  ('Nước','essential','variable'),
  ('Gas','essential','variable'),
  -- Ăn uống
  ('Bữa sáng','essential','variable'),
  ('Bữa trưa','essential','variable'),
  ('Bữa tối','essential','variable'),
  ('Ăn ngoài','flexible','variable'),
  ('Đồ uống','flexible','variable'),
  ('Đi chợ','essential','variable'),
  -- Giao tế
  ('Bạn bè','flexible','variable'),
  ('Tình cảm','flexible','variable'),
  -- Đi lại
  ('Xe buýt','essential','variable'),
  ('Tàu điện','essential','variable'),
  ('Taxi','flexible','variable'),
  ('Ô tô','essential','variable'),
  ('Luup','flexible','variable'),
  -- Thời trang
  ('Quần áo','flexible','variable'),
  ('Giày dép','flexible','variable'),
  ('Phụ kiện','flexible','variable'),
  ('Mỹ phẩm','flexible','variable'),
  ('Giặt là','essential','variable'),
  -- Sở thích
  ('Cây cối','flexible','variable'),
  ('Nhiếp ảnh','flexible','variable'),
  ('Đăng ký','flexible','fixed'),
  ('Thể thao','flexible','variable'),
  -- Sức khỏe
  ('Gym','flexible','fixed'),
  ('Bệnh viện','essential','variable'),
  ('Thuốc','essential','variable'),
  ('Thuốc lá','flexible','variable'),
  -- Giáo dục
  ('Thi cử','essential','variable'),
  ('Học phí','essential','fixed'),
  ('Sách vở','essential','variable'),
  -- Quà tặng
  ('Quà','flexible','variable'),
  ('Hỗ trợ gia đình','essential','fixed')
) as v(name, need_level, cost_type)
where c.type = 'expense'
  and c.parent_id is not null
  and c.need_level is null
  and c.name = v.name;

-- Người dùng MỚI: gán nhãn ngay trong trigger seed. Cập nhật khối insert danh
-- mục con của handle_new_user để kèm need_level/cost_type.
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

  insert into public.accounts (user_id, name, type, currency, sort_order) values
    (new.id, 'Tiền mặt',   'cash', 'JPY', 0),
    (new.id, 'Ngân hàng',  'bank', 'JPY', 1),
    (new.id, 'Đầu tư VN',  'bank', 'VND', 2),
    (new.id, 'Dự trữ USD', 'bank', 'USD', 3);

  insert into public.categories (user_id, name, type, icon, parent_id, sort_order) values
    (new.id, 'Nhà ở',              'expense', '🏠', null, 0),
    (new.id, 'Ăn uống',            'expense', '🍜', null, 8),
    (new.id, 'Giao tế',            'expense', '👫', null, 15),
    (new.id, 'Đi lại',             'expense', '🚆', null, 18),
    (new.id, 'Thời trang',         'expense', '🧥', null, 24),
    (new.id, 'Sở thích',           'expense', '🌱', null, 30),
    (new.id, 'Sức khỏe',           'expense', '🧘', null, 35),
    (new.id, 'Tài chính & Đầu tư', 'expense', '📊', null, 40),
    (new.id, 'Giáo dục',           'expense', '📔', null, 41),
    (new.id, 'Quà tặng',           'expense', '🎁', null, 45),
    (new.id, 'Khác',               'expense', '📦', null, 48),
    (new.id, 'Lương',      'income', '💰', null, 0),
    (new.id, 'Thưởng',     'income', '🎉', null, 1),
    (new.id, 'Được tặng',  'income', '🧧', null, 2),
    (new.id, 'Đầu tư',     'income', '📈', null, 3),
    (new.id, 'Khác',       'income', '💵', null, 4);

  insert into public.categories (user_id, name, type, icon, parent_id, sort_order, need_level, cost_type)
  select new.id, d.name, 'expense', d.icon,
         (select id from public.categories p
           where p.user_id = new.id and p.type = 'expense'
             and p.name = d.parent and p.parent_id is null),
         d.ord, d.need_level, d.cost_type
  from (values
    ('Tiền nhà',            '🔑', 'Nhà ở',       1, 'essential','fixed'),
    ('Nội thất',            '🛋️', 'Nhà ở',       2, 'flexible','variable'),
    ('Đồ bếp',              '🍳', 'Nhà ở',       3, 'flexible','variable'),
    ('Đồ vệ sinh cá nhân',  '🧴', 'Nhà ở',       4, 'essential','variable'),
    ('Điện',                '💡', 'Nhà ở',       5, 'essential','variable'),
    ('Nước',                '🚰', 'Nhà ở',       6, 'essential','variable'),
    ('Gas',                 '🔥', 'Nhà ở',       7, 'essential','variable'),
    ('Bữa sáng',            '🥐', 'Ăn uống',     9, 'essential','variable'),
    ('Bữa trưa',            '🍱', 'Ăn uống',    10, 'essential','variable'),
    ('Bữa tối',             '🍚', 'Ăn uống',    11, 'essential','variable'),
    ('Ăn ngoài',            '🍽️', 'Ăn uống',    12, 'flexible','variable'),
    ('Đồ uống',             '🥤', 'Ăn uống',    13, 'flexible','variable'),
    ('Đi chợ',              '🛒', 'Ăn uống',    14, 'essential','variable'),
    ('Bạn bè',              '🧑‍🤝‍🧑', 'Giao tế',  16, 'flexible','variable'),
    ('Tình cảm',            '💑', 'Giao tế',    17, 'flexible','variable'),
    ('Xe buýt',             '🚌', 'Đi lại',     19, 'essential','variable'),
    ('Tàu điện',            '🚉', 'Đi lại',     20, 'essential','variable'),
    ('Taxi',                '🚕', 'Đi lại',     21, 'flexible','variable'),
    ('Ô tô',                '🚗', 'Đi lại',     22, 'essential','variable'),
    ('Luup',                '🛴', 'Đi lại',     23, 'flexible','variable'),
    ('Quần áo',             '👕', 'Thời trang', 25, 'flexible','variable'),
    ('Giày dép',            '👟', 'Thời trang', 26, 'flexible','variable'),
    ('Phụ kiện',            '👜', 'Thời trang', 27, 'flexible','variable'),
    ('Mỹ phẩm',             '💄', 'Thời trang', 28, 'flexible','variable'),
    ('Giặt là',             '🧺', 'Thời trang', 29, 'essential','variable'),
    ('Cây cối',             '🪴', 'Sở thích',   31, 'flexible','variable'),
    ('Nhiếp ảnh',           '📷', 'Sở thích',   32, 'flexible','variable'),
    ('Đăng ký',             '📺', 'Sở thích',   33, 'flexible','fixed'),
    ('Thể thao',            '⚽', 'Sở thích',   34, 'flexible','variable'),
    ('Gym',                 '🏋️', 'Sức khỏe',   36, 'flexible','fixed'),
    ('Bệnh viện',           '🏥', 'Sức khỏe',   37, 'essential','variable'),
    ('Thuốc',               '💊', 'Sức khỏe',   38, 'essential','variable'),
    ('Thuốc lá',            '🚬', 'Sức khỏe',   39, 'flexible','variable'),
    ('Thi cử',              '📝', 'Giáo dục',   42, 'essential','variable'),
    ('Học phí',             '🏫', 'Giáo dục',   43, 'essential','fixed'),
    ('Sách vở',             '📚', 'Giáo dục',   44, 'essential','variable'),
    ('Quà',                 '🎀', 'Quà tặng',   46, 'flexible','variable'),
    ('Hỗ trợ gia đình',     '👪', 'Quà tặng',   47, 'essential','fixed')
  ) as d(name, icon, parent, ord, need_level, cost_type);

  return new;
end;
$$;
