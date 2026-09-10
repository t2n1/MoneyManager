-- ============================================================
-- Sổ Gạo — Migration 0070: Hoá đơn thẻ tín dụng do NHÀ THẺ đòi
--
-- VÌ SAO CẦN: app tự tính "quẹt trong kỳ" từ giao dịch trong sổ, nhưng con số đó
-- KHÔNG BAO GIỜ bằng số nhà thẻ đòi, kể cả khi sổ hoàn hảo. Đo trên 8 kỳ PayPay
-- (1-8/2026): hoàn tiền bị nhà thẻ cấn ở kỳ TRƯỚC kỳ mà sổ ghi, `チャージ` nạp ví là
-- khoản quẹt với thẻ nhưng là chuyển tiền nội bộ với sổ, và ranh giới ngày lệch nhau.
-- Ba thứ đó là khác biệt cấu trúc giữa hai cách đếm, không phải lỗi ghi chép.
-- ⇒ Muốn hiện đúng số nhà thẻ thì phải LƯU nó, không thể suy ra.
--
-- TÊN `card_bills` chứ không `card_statements`: repo đã có `cardStatement.ts` và
-- `useCardStatements.ts` mang nghĩa khác hẳn (chia dư nợ hôm nay thành đã chốt/chưa
-- chốt). Thứ lưu ở đây là SỐ TIỀN BỊ ĐÒI = hoá đơn.
--
-- Xem thêm: docs/superpowers/specs/2026-09-10-doi-chieu-sao-ke-the-design.md
-- ============================================================

create table public.card_bills (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  close_date date   not null,
  due_date   date   not null,
  total      bigint not null,
  created_at timestamptz not null default now(),
  unique (account_id, close_date)
);

alter table public.card_bills enable row level security;

create policy "own rows" on public.card_bills
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on column public.card_bills.close_date is
  'Ngày chốt kỳ — danh tính của kỳ. Khoá theo ngày chốt chứ không theo tháng: tháng là khái niệm của màn hình, và thẻ đổi ngày chốt giữa chừng sẽ làm khoá-theo-tháng gộp nhầm hai kỳ.';
comment on column public.card_bills.due_date is
  'Ngày tiền rời tài khoản, ĐÃ dời T7/CN sang ngày làm việc.';
comment on column public.card_bills.total is
  'Số hoá đơn nhà thẻ đòi, minor units. CHO PHÉP ÂM: kỳ được hoàn nhiều hơn tiêu là trạng thái có thật.';
