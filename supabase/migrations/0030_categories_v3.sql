-- ============================================================
-- Sổ Chi Tiêu — Migration 0030: bổ sung danh mục (rà soát 2026-07-28)
-- Thêm: Điện thoại, Bãi đỗ xe, nhóm Du lịch, nhóm Giấy tờ & Pháp lý, thu Bán đồ cũ.
-- Đổi tên "Tài chính & Đầu tư" -> "Tài chính": mua đầu tư nay là CHUYỂN KHOẢN sang
-- tài khoản type='investment' (0016), ghi thành khoản chi là đếm hai lần. Danh mục
-- này giữ vai trò duy nhất: các khoản PHÍ tài chính (phí chuyển tiền, phí ngân
-- hàng, phí thẻ, lãi vay). Cố ý KHÔNG thêm danh mục con để phí luôn có đúng một
-- đích đến.
--
-- Về sort_order: người dùng HIỆN CÓ chỉ được thêm số ở cuối dải (49+), không đụng
-- thứ tự họ đã tự sắp. Người dùng MỚI (trigger seed) dùng dải đánh lại có khoảng
-- trống, chèn xen đúng chỗ. Hai bên khác số nhưng cùng thứ tự hiển thị mong muốn;
-- sort_order vốn là của riêng từng người nên lệch số không sao.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Đổi tên "Tài chính & Đầu tư" -> "Tài chính"
-- ------------------------------------------------------------
update public.categories
set name = 'Tài chính', icon = '🏦'
where type = 'expense' and name = 'Tài chính & Đầu tư';

-- Nhãn 2 trục: phí thì tránh không được (thiết yếu) nhưng số tiền thay đổi (biến đổi).
-- Chỉ đặt khi còn trống, không đè phân loại người dùng đã tự chọn.
update public.categories
set need_level = 'essential', cost_type = 'variable'
where type = 'expense' and name = 'Tài chính' and parent_id is null
  and need_level is null and cost_type is null;

-- ------------------------------------------------------------
-- 2. Đẩy "Khác" xuống cuối để nhóm mới không nằm sau nó
-- Chỉ đụng hàng còn nguyên sort_order mặc định (48 / 4) — ai đã tự sắp thì giữ.
-- ------------------------------------------------------------
update public.categories set sort_order = 99
where type = 'expense' and name = 'Khác' and parent_id is null and sort_order = 48;

update public.categories set sort_order = 9
where type = 'income' and name = 'Khác' and sort_order = 4;

-- ------------------------------------------------------------
-- 3. Bổ sung danh mục cho người dùng HIỆN CÓ (idempotent theo tên)
-- ------------------------------------------------------------

-- 3a. Danh mục con gắn vào nhóm cha sẵn có. `parents` là danh sách tên ứng viên
-- theo thứ tự ưu tiên: bộ danh mục 0017 dùng "Nhà ở", bộ cũ 0001 dùng "Nhà cửa".
-- Không tìm thấy cha nào thì vẫn thêm, đứng ở cấp một (left join).
insert into public.categories (user_id, name, type, icon, parent_id, sort_order, need_level, cost_type)
select p.user_id, d.name, 'expense', d.icon, par.id, d.ord, d.need_level, d.cost_type
from public.profiles p
cross join (values
  ('Điện thoại', '📱', array['Nhà ở', 'Nhà cửa'], 49, 'essential', 'fixed'),
  ('Bãi đỗ xe',  '🅿️', array['Đi lại'],           50, 'essential', 'fixed')
) as d(name, icon, parents, ord, need_level, cost_type)
left join lateral (
  select c.id
  from public.categories c
  where c.user_id = p.user_id and c.type = 'expense' and c.parent_id is null
    and c.name = any(d.parents)
  order by array_position(d.parents, c.name)
  limit 1
) par on true
where not exists (
  select 1 from public.categories x
  where x.user_id = p.user_id and x.type = 'expense' and x.name = d.name
);

-- 3b. Nhóm cha mới
insert into public.categories (user_id, name, type, icon, parent_id, sort_order)
select p.user_id, d.name, 'expense', d.icon, null, d.ord
from public.profiles p
cross join (values
  ('Du lịch',           '🧳', 51),
  ('Giấy tờ & Pháp lý', '📄', 56)
) as d(name, icon, ord)
where not exists (
  select 1 from public.categories x
  where x.user_id = p.user_id and x.type = 'expense' and x.name = d.name
);

-- 3c. Danh mục con của hai nhóm vừa tạo ở 3b
insert into public.categories (user_id, name, type, icon, parent_id, sort_order, need_level, cost_type)
select p.user_id, d.name, 'expense', d.icon,
       (select c.id from public.categories c
         where c.user_id = p.user_id and c.type = 'expense'
           and c.parent_id is null and c.name = d.parent
         limit 1),
       d.ord, d.need_level, d.cost_type
from public.profiles p
cross join (values
  ('Vé máy bay',              '✈️', 'Du lịch',           52, 'flexible',  'variable'),
  ('Khách sạn',               '🏨', 'Du lịch',           53, 'flexible',  'variable'),
  ('Tham quan & ăn chơi',     '🎡', 'Du lịch',           54, 'flexible',  'variable'),
  ('Quà mang về',             '🍡', 'Du lịch',           55, 'flexible',  'variable'),
  ('Visa & lưu trú',          '🛂', 'Giấy tờ & Pháp lý', 57, 'essential', 'variable'),
  ('Hộ chiếu & lãnh sự',      '🛃', 'Giấy tờ & Pháp lý', 58, 'essential', 'variable'),
  ('Dịch thuật & công chứng', '✍️', 'Giấy tờ & Pháp lý', 59, 'essential', 'variable')
) as d(name, icon, parent, ord, need_level, cost_type)
where not exists (
  select 1 from public.categories x
  where x.user_id = p.user_id and x.type = 'expense' and x.name = d.name
);

-- 3d. Danh mục Thu mới
insert into public.categories (user_id, name, type, icon, parent_id, sort_order)
select p.user_id, 'Bán đồ cũ', 'income', '♻️', null, 4
from public.profiles p
where not exists (
  select 1 from public.categories x
  where x.user_id = p.user_id and x.type = 'income' and x.name = 'Bán đồ cũ'
);

-- ------------------------------------------------------------
-- 4. Người dùng MỚI: cập nhật seed trong handle_new_user
-- ------------------------------------------------------------
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
    (new.id, 'Nhà ở',              'expense', '🏠', null,  0),
    (new.id, 'Ăn uống',            'expense', '🍜', null, 10),
    (new.id, 'Giao tế',            'expense', '👫', null, 18),
    (new.id, 'Đi lại',             'expense', '🚆', null, 22),
    (new.id, 'Thời trang',         'expense', '🧥', null, 30),
    (new.id, 'Sở thích',           'expense', '🌱', null, 37),
    (new.id, 'Sức khỏe',           'expense', '🧘', null, 43),
    (new.id, 'Tài chính',          'expense', '🏦', null, 49),
    (new.id, 'Giáo dục',           'expense', '📔', null, 51),
    (new.id, 'Du lịch',            'expense', '🧳', null, 56),
    (new.id, 'Giấy tờ & Pháp lý',  'expense', '📄', null, 62),
    (new.id, 'Quà tặng',           'expense', '🎁', null, 67),
    (new.id, 'Khác',               'expense', '📦', null, 71),
    (new.id, 'Lương',      'income', '💰', null, 0),
    (new.id, 'Thưởng',     'income', '🎉', null, 1),
    (new.id, 'Được tặng',  'income', '🧧', null, 2),
    (new.id, 'Đầu tư',     'income', '📈', null, 3),
    (new.id, 'Bán đồ cũ',  'income', '♻️', null, 4),
    (new.id, 'Khác',       'income', '💵', null, 5);

  -- "Tài chính" không có con nên bản thân nó là danh mục lá -> cần nhãn 2 trục.
  update public.categories
  set need_level = 'essential', cost_type = 'variable'
  where user_id = new.id and type = 'expense' and name = 'Tài chính';

  -- Danh mục con (Chi): tra parent_id theo tên nhóm cha vừa tạo.
  insert into public.categories (user_id, name, type, icon, parent_id, sort_order, need_level, cost_type)
  select new.id, d.name, 'expense', d.icon,
         (select id from public.categories p
           where p.user_id = new.id and p.type = 'expense'
             and p.name = d.parent and p.parent_id is null),
         d.ord, d.need_level, d.cost_type
  from (values
    ('Tiền nhà',                '🔑', 'Nhà ở',              1, 'essential','fixed'),
    ('Nội thất',                '🛋️', 'Nhà ở',              2, 'flexible','variable'),
    ('Đồ bếp',                  '🍳', 'Nhà ở',              3, 'flexible','variable'),
    ('Đồ vệ sinh cá nhân',      '🧴', 'Nhà ở',              4, 'essential','variable'),
    ('Điện',                    '💡', 'Nhà ở',              5, 'essential','variable'),
    ('Nước',                    '🚰', 'Nhà ở',              6, 'essential','variable'),
    ('Gas',                     '🔥', 'Nhà ở',              7, 'essential','variable'),
    ('Điện thoại',              '📱', 'Nhà ở',              8, 'essential','fixed'),
    ('Bữa sáng',                '🥐', 'Ăn uống',           11, 'essential','variable'),
    ('Bữa trưa',                '🍱', 'Ăn uống',           12, 'essential','variable'),
    ('Bữa tối',                 '🍚', 'Ăn uống',           13, 'essential','variable'),
    ('Ăn ngoài',                '🍽️', 'Ăn uống',           14, 'flexible','variable'),
    ('Đồ uống',                 '🥤', 'Ăn uống',           15, 'flexible','variable'),
    ('Đi chợ',                  '🛒', 'Ăn uống',           16, 'essential','variable'),
    ('Bạn bè',                  '🧑‍🤝‍🧑', 'Giao tế',         19, 'flexible','variable'),
    ('Tình cảm',                '💑', 'Giao tế',           20, 'flexible','variable'),
    ('Xe buýt',                 '🚌', 'Đi lại',            23, 'essential','variable'),
    ('Tàu điện',                '🚉', 'Đi lại',            24, 'essential','variable'),
    ('Taxi',                    '🚕', 'Đi lại',            25, 'flexible','variable'),
    ('Ô tô',                    '🚗', 'Đi lại',            26, 'essential','variable'),
    ('Bãi đỗ xe',               '🅿️', 'Đi lại',            27, 'essential','fixed'),
    ('Luup',                    '🛴', 'Đi lại',            28, 'flexible','variable'),
    ('Quần áo',                 '👕', 'Thời trang',        31, 'flexible','variable'),
    ('Giày dép',                '👟', 'Thời trang',        32, 'flexible','variable'),
    ('Phụ kiện',                '👜', 'Thời trang',        33, 'flexible','variable'),
    ('Mỹ phẩm',                 '💄', 'Thời trang',        34, 'flexible','variable'),
    ('Giặt là',                 '🧺', 'Thời trang',        35, 'essential','variable'),
    ('Cây cối',                 '🪴', 'Sở thích',          38, 'flexible','variable'),
    ('Nhiếp ảnh',               '📷', 'Sở thích',          39, 'flexible','variable'),
    ('Đăng ký',                 '📺', 'Sở thích',          40, 'flexible','fixed'),
    ('Thể thao',                '⚽', 'Sở thích',          41, 'flexible','variable'),
    ('Gym',                     '🏋️', 'Sức khỏe',          44, 'flexible','fixed'),
    ('Bệnh viện',               '🏥', 'Sức khỏe',          45, 'essential','variable'),
    ('Thuốc',                   '💊', 'Sức khỏe',          46, 'essential','variable'),
    ('Thuốc lá',                '🚬', 'Sức khỏe',          47, 'flexible','variable'),
    ('Thi cử',                  '📝', 'Giáo dục',          52, 'essential','variable'),
    ('Học phí',                 '🏫', 'Giáo dục',          53, 'essential','fixed'),
    ('Sách vở',                 '📚', 'Giáo dục',          54, 'essential','variable'),
    ('Vé máy bay',              '✈️', 'Du lịch',           57, 'flexible','variable'),
    ('Khách sạn',               '🏨', 'Du lịch',           58, 'flexible','variable'),
    ('Tham quan & ăn chơi',     '🎡', 'Du lịch',           59, 'flexible','variable'),
    ('Quà mang về',             '🍡', 'Du lịch',           60, 'flexible','variable'),
    ('Visa & lưu trú',          '🛂', 'Giấy tờ & Pháp lý', 63, 'essential','variable'),
    ('Hộ chiếu & lãnh sự',      '🛃', 'Giấy tờ & Pháp lý', 64, 'essential','variable'),
    ('Dịch thuật & công chứng', '✍️', 'Giấy tờ & Pháp lý', 65, 'essential','variable'),
    ('Quà',                     '🎀', 'Quà tặng',          68, 'flexible','variable'),
    ('Hỗ trợ gia đình',         '👪', 'Quà tặng',          69, 'essential','fixed')
  ) as d(name, icon, parent, ord, need_level, cost_type);

  return new;
end;
$$;
