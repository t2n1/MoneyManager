-- ============================================================
-- Sổ Chi Tiêu — Migration 0039: NHÓM nhãn
--
-- Nhãn đang là một mớ phẳng: "Người yêu", "Bạn bè", "Tokyo", "Về VN 2026" nằm
-- chung một hàng chip, mắt phải tự phân loại mỗi lần nhập. Nhóm biến ô chọn nhãn
-- thành mấy CÂU HỎI riêng — "Với ai?", "Ở đâu?" — mỗi câu một hàng chip.
--
-- Vì sao là CỘT trên `tags` chứ không phải bảng nối: "với ai" và "ở đâu" là hai
-- câu hỏi khác nhau, một nhãn chỉ trả lời được một câu. Cần trả lời cả hai thì
-- đó vốn là hai nhãn. Bảng nối chỉ đẻ ra cảnh cùng một chip vẽ ở hai section.
--
-- FK một cột (không phải composite (id, user_id) như transaction_tags): composite
-- + `on delete set null` sẽ set null CẢ user_id — mà cột đó not null, nên xoá nhóm
-- sẽ nổ lỗi thay vì thả nhãn ra. Cùng-user được đảm bảo bằng RLS: id nhóm của
-- người khác không đọc được nên không có đường chọn vào.
-- ============================================================

create table if not exists public.tag_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.tag_groups enable row level security;

drop policy if exists "own rows" on public.tag_groups;
create policy "own rows" on public.tag_groups
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Nhãn ngoài nhóm = null, app xếp chúng vào mục "Khác". Xoá nhóm thì nhãn rơi về
-- null, KHÔNG mất nhãn và không mất transaction_tags — đây là điểm khác nhau giữa
-- "dẹp cái nhóm" và "xoá cái nhãn", phải giữ cho rạch ròi.
alter table public.tags
  add column if not exists group_id uuid;

alter table public.tags drop constraint if exists tags_group_id_fkey;
alter table public.tags
  add constraint tags_group_id_fkey
  foreign key (group_id) references public.tag_groups (id) on delete set null;

create index if not exists tags_group_idx on public.tags (user_id, group_id);

comment on column public.tags.group_id is
  'Nhóm của nhãn (tag_groups). null = ngoài nhóm — vẫn dùng bình thường, chỉ nằm ở mục "Khác" cuối ô chọn nhãn.';

-- ------------------------------------------------------------
-- Seed 2 nhóm cho người dùng HIỆN CÓ. Idempotent theo unique(user_id, name).
-- ------------------------------------------------------------
insert into public.tag_groups (user_id, name, sort_order)
select p.user_id, g.name, g.ord
from public.profiles p
cross join (values ('Với ai?', 0), ('Ở đâu?', 1)) as g(name, ord)
on conflict (user_id, name) do nothing;

-- ------------------------------------------------------------
-- Người dùng MỚI.
--
-- Cố ý KHÔNG định nghĩa lại handle_new_user() như các migration trước: thân hàm
-- đó nay dài ~150 dòng danh mục, chép lại mỗi lần thêm một thứ nhỏ là cách chắc
-- nhất để hai bản trôi khác nhau. Trigger riêng trên `profiles` chạy trong cùng
-- transaction với handle_new_user (nó insert profiles ở dòng đầu), nên user mới
-- vẫn có đủ 2 nhóm ngay khi đăng ký.
-- ------------------------------------------------------------
create or replace function public.seed_tag_groups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tag_groups (user_id, name, sort_order) values
    (new.user_id, 'Với ai?', 0),
    (new.user_id, 'Ở đâu?', 1)
  on conflict (user_id, name) do nothing;
  return new;
end;
$$;

drop trigger if exists seed_tag_groups on public.profiles;
create trigger seed_tag_groups
  after insert on public.profiles
  for each row execute function public.seed_tag_groups();
