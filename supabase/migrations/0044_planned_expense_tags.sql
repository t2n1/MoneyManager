-- ============================================================
-- Sổ Chi Tiêu — Migration 0044: NHÃN cho khoản sắp chi (lời nhắc)
--
-- "Nhắc sau" ở form Nhập gõ y như một giao dịch — kể cả chọn nhãn — nhưng
-- planned_expenses không có chỗ giữ nhãn, nên nhãn vừa chọn rơi mất. Mà nhãn là
-- thứ đáng giữ nhất ở đây: lời nhắc "đóng tiền học cho con" thuộc nhãn "Con", và
-- lúc ghi thật thì nhãn phải đi theo vào giao dịch chứ không phải gõ lại.
--
-- Bảng nối (không phải cột mảng) — cùng lý do với recurring_rule_tags ở 0042: xoá
-- một nhãn thì liên kết tự biến mất, không để lại id chết cho đường ghi tự động.
--
-- `unique (id, user_id)` thêm vào planned_expenses: khoá ngoại composite cần nó.
-- `id` đã là khoá chính nên ràng buộc này không loại thêm dòng nào — nó chỉ tạo
-- index để FK (planned_id, user_id) trỏ vào được, đúng cách recurring_rules và
-- transactions đang làm.
-- ============================================================

alter table public.planned_expenses
  drop constraint if exists planned_expenses_id_user_key;
alter table public.planned_expenses
  add constraint planned_expenses_id_user_key unique (id, user_id);

create table if not exists public.planned_expense_tags (
  planned_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (planned_id, tag_id),
  foreign key (planned_id, user_id)
    references public.planned_expenses (id, user_id) on delete cascade,
  foreign key (tag_id, user_id)
    references public.tags (id, user_id) on delete cascade
);

create index if not exists planned_expense_tags_tag_idx
  on public.planned_expense_tags (user_id, tag_id);

alter table public.planned_expense_tags enable row level security;

drop policy if exists "own rows" on public.planned_expense_tags;
create policy "own rows" on public.planned_expense_tags
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
