-- ============================================================
-- Sổ Chi Tiêu — Migration 0042: NHÃN cho quy tắc định kỳ
--
-- Form Nhập cho chọn nhãn và cho đặt "Lặp lại" cùng lúc, nhưng quy tắc định kỳ
-- không có chỗ nào giữ nhãn — nên nhãn vừa chọn rơi mất, và mọi giao dịch do quy
-- tắc sinh ra về sau đều không nhãn. Tiền nhà, thuê xe, phí thuê bao là đúng loại
-- khoản người ta muốn gắn nhãn nhất (theo nhà / theo xe / theo dự án).
--
-- Vì sao BẢNG NỐI chứ không phải cột `tag_ids uuid[]` trên recurring_rules:
-- engine catch-up chạy KHÔNG có người ngồi trước máy (mở app là nó sinh bù mọi kỳ
-- lỡ). Mảng uuid không có khoá ngoại, nên xoá một nhãn là mảng còn lại id chết →
-- lần sinh sau chèn transaction_tags với tag_id không tồn tại → FK nổ → giao dịch
-- định kỳ ÂM THẦM ngừng sinh. Bảng nối có cascade lo việc đó: xoá nhãn là liên kết
-- tự biến mất, engine không bao giờ thấy id chết.
--
-- Khoá ngoại composite (id, user_id) như transaction_tags — cùng lý do: nhãn và
-- quy tắc phải cùng một người, chặn ở tầng DB chứ không chỉ RLS.
-- ============================================================

create table if not exists public.recurring_rule_tags (
  rule_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (rule_id, tag_id),
  foreign key (rule_id, user_id)
    references public.recurring_rules (id, user_id) on delete cascade,
  foreign key (tag_id, user_id)
    references public.tags (id, user_id) on delete cascade
);

-- Tra theo nhãn: "quy tắc nào đang gắn nhãn này" (dùng khi xoá/gộp nhãn).
create index if not exists recurring_rule_tags_tag_idx
  on public.recurring_rule_tags (user_id, tag_id);

alter table public.recurring_rule_tags enable row level security;

drop policy if exists "own rows" on public.recurring_rule_tags;
create policy "own rows" on public.recurring_rule_tags
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
