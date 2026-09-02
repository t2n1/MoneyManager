-- ============================================================
-- Sổ Chi Tiêu — Migration 0056: người thân nhận tiền + người nhận của mỗi lần gửi
--                                + năm đã khai khấu trừ người phụ thuộc
--
-- VÌ SAO
-- Khấu trừ 国外居住親族 (NTA No.1180) tính RIÊNG TỪNG NGƯỜI: người thân 30–69 tuổi phải
-- nhận ≥ ¥380.000/năm từ chính người nộp thuế, có chứng từ tới tên người đó. Sổ hiện gộp
-- mọi lần gửi thành một dòng "gửi về VN" nên không trả lời được "mẹ đã nhận bao nhiêu".
--
-- `relatives` — một người một dòng; `birth_year` BẮT BUỘC vì tuổi quyết định ngưỡng và
-- mức khấu trừ; không có năm sinh thì không nói được gì về người này nên không cho lưu.
-- KHÔNG có cột thu nhập của người thân (điều kiện ≤ 58万): app không biết và không nên
-- đoán, màn hình chỉ in câu hỏi.
--
-- `transactions.remit_recipient_id` — on delete SET NULL, không cascade: xoá một người
-- không được xoá lịch sử gửi tiền. Lần gửi trở về "chưa biết gửi cho ai". KHÔNG backfill:
-- null = chưa gán, màn Quyền lợi đếm số này ra và nói thẳng.
--
-- `profiles.fuyo_claimed_years` — năm nào đã nộp giấy/đã khai thì app thôi nhắc. Mảng
-- năm chứ không phải bảng: một người một hồ sơ mỗi năm, không truy vấn nào nối theo nó.
--
-- View `account_balances` (0053) KHÔNG cần dựng lại — đã kiểm 2026-09-03: view đọc
-- transactions qua left join và chỉ đụng t.type, t.account_id, t.to_account_id, t.amount,
-- t.to_amount, t.is_refund bằng tên, không có t.*.
-- ============================================================

create table if not exists public.relatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  birth_year smallint not null check (birth_year between 1900 and 2100),
  relationship text not null check (relationship in
    ('parent', 'spouse', 'child', 'sibling', 'grandparent', 'other')),
  -- ISO-2. Luật chỉ áp cho người KHÔNG cư trú ở Nhật; người thân đã sang Nhật thì rẽ sang
  -- luật khác — đặt 'JP' để bộ kiểm bỏ qua và nói rõ.
  country text not null default 'VN',
  is_archived boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists relatives_user_idx on public.relatives (user_id, sort_order);

alter table public.relatives enable row level security;
drop policy if exists "own rows" on public.relatives;
create policy "own rows" on public.relatives
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.transactions
  add column if not exists remit_recipient_id uuid
    references public.relatives (id) on delete set null;

create index if not exists transactions_remit_recipient_idx
  on public.transactions (user_id, remit_recipient_id)
  where remit_recipient_id is not null;

comment on column public.transactions.remit_recipient_id is
  'Người thân nhận lần gửi tiền này (chỉ có nghĩa khi is_remittance). null = chưa gán. '
  'Nuôi: features/quyen-loi/fuyo.ts (khấu trừ 国外居住親族 tính riêng từng người).';

alter table public.profiles
  add column if not exists fuyo_claimed_years smallint[] not null default '{}';

comment on column public.profiles.fuyo_claimed_years is
  'Năm thuế đã nộp giấy 扶養控除 cho công ty / đã khai với sở thuế. App thôi nhắc năm đó. '
  'Nuôi: features/quyen-loi/refund.ts và luật benefit-fuyo-shortfall.';
