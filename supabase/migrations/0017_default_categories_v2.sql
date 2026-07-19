-- 0017: Bộ danh mục mặc định mới cho người dùng MỚI.
-- Thay danh sách danh mục seed trong handle_new_user bằng bộ chuẩn hoá kiểu
-- "Money Manager" (dịch tiếng Việt), lần đầu có cả DANH MỤC CON cho nhóm Chi.
-- Nhóm Thu giữ nguyên. Không đụng dữ liệu của người dùng hiện có.
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

  -- Nhóm cha (Chi) + toàn bộ nhóm Thu. sort_order chừa khoảng cho danh mục con.
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

  -- Danh mục con (Chi): tra parent_id theo tên nhóm cha vừa tạo.
  insert into public.categories (user_id, name, type, icon, parent_id, sort_order)
  select new.id, d.name, 'expense', d.icon,
         (select id from public.categories p
           where p.user_id = new.id and p.type = 'expense'
             and p.name = d.parent and p.parent_id is null),
         d.ord
  from (values
    ('Tiền nhà',            '🔑', 'Nhà ở',       1),
    ('Nội thất',            '🛋️', 'Nhà ở',       2),
    ('Đồ bếp',              '🍳', 'Nhà ở',       3),
    ('Đồ vệ sinh cá nhân',  '🧴', 'Nhà ở',       4),
    ('Điện',                '💡', 'Nhà ở',       5),
    ('Nước',                '🚰', 'Nhà ở',       6),
    ('Gas',                 '🔥', 'Nhà ở',       7),
    ('Bữa sáng',            '🥐', 'Ăn uống',     9),
    ('Bữa trưa',            '🍱', 'Ăn uống',    10),
    ('Bữa tối',             '🍚', 'Ăn uống',    11),
    ('Ăn ngoài',            '🍽️', 'Ăn uống',    12),
    ('Đồ uống',             '🥤', 'Ăn uống',    13),
    ('Đi chợ',              '🛒', 'Ăn uống',    14),
    ('Bạn bè',              '🧑‍🤝‍🧑', 'Giao tế',  16),
    ('Tình cảm',            '💑', 'Giao tế',    17),
    ('Xe buýt',             '🚌', 'Đi lại',     19),
    ('Tàu điện',            '🚉', 'Đi lại',     20),
    ('Taxi',                '🚕', 'Đi lại',     21),
    ('Ô tô',                '🚗', 'Đi lại',     22),
    ('Luup',                '🛴', 'Đi lại',     23),
    ('Quần áo',             '👕', 'Thời trang', 25),
    ('Giày dép',            '👟', 'Thời trang', 26),
    ('Phụ kiện',            '👜', 'Thời trang', 27),
    ('Mỹ phẩm',             '💄', 'Thời trang', 28),
    ('Giặt là',             '🧺', 'Thời trang', 29),
    ('Cây cối',             '🪴', 'Sở thích',   31),
    ('Nhiếp ảnh',           '📷', 'Sở thích',   32),
    ('Đăng ký',             '📺', 'Sở thích',   33),
    ('Thể thao',            '⚽', 'Sở thích',   34),
    ('Gym',                 '🏋️', 'Sức khỏe',   36),
    ('Bệnh viện',           '🏥', 'Sức khỏe',   37),
    ('Thuốc',               '💊', 'Sức khỏe',   38),
    ('Thuốc lá',            '🚬', 'Sức khỏe',   39),
    ('Thi cử',              '📝', 'Giáo dục',   42),
    ('Học phí',             '🏫', 'Giáo dục',   43),
    ('Sách vở',             '📚', 'Giáo dục',   44),
    ('Quà',                 '🎀', 'Quà tặng',   46),
    ('Hỗ trợ gia đình',     '👪', 'Quà tặng',   47)
  ) as d(name, icon, parent, ord);

  return new;
end;
$$;
