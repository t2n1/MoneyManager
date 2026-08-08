-- ============================================================
-- Sổ Chi Tiêu — Migration 0038: Khoản SẮP CHI
--
-- Gộp hai nhu cầu vốn tưởng là hai thứ:
--   "nhắc tôi đóng phí vệ sinh 20/8"     — có hạn cụ thể, xong là hết
--   "sửa nhà khoảng tháng 10, chừng 300k" — mới là dự tính, chưa chốt ngày
-- Chúng chỉ khác nhau ở ĐỘ CHẮC CHẮN, không khác về bản chất: cả hai đều là tiền
-- CHƯA tiêu mà sẽ phải tiêu. Tách làm hai bảng thì người dùng phải nhớ "cái này ghi
-- ở đâu", và một khoản dự tính lúc chốt được ngày sẽ phải chuyển nhà.
--
-- KHÁC recurring_rules kiểu 'remind' (0037): cái kia LẶP MÃI theo chu kỳ. Cái này là
-- một lần — xong thì thôi. Nhét cả hai vào recurring_rules nghĩa là mọi khoản một lần
-- đều phải mang một `frequency` giả.
--
-- KHÁC debts (0007): nợ có NGƯỜI ĐỐI ỨNG và có thể trả nhiều lần. Đây chỉ là một việc
-- phải chi, không nợ ai cả.
-- ============================================================

create table public.planned_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  -- Ước tính (minor units theo `currency`). 0 = chưa biết bao nhiêu — hợp lệ, vì
  -- "tìm nhà mới" là việc có thật mà chưa ai đoán nổi giá.
  amount bigint not null default 0 check (amount >= 0),
  currency text not null default 'JPY' check (currency ~ '^[A-Z]{3}$'),
  due_on date not null,
  -- 'day'   = đúng ngày này (phí vệ sinh 20/8)
  -- 'month' = chỉ biết tháng; `due_on` khi đó là ngày 1 của tháng và MÀN HÌNH phải in
  --           "tháng 10/2026" chứ không in "01/10/2026" — in ngày cụ thể cho một dự
  --           tính mơ hồ là bịa ra độ chính xác không có.
  due_precision text not null default 'day' check (due_precision in ('day', 'month')),
  -- null = KHÔNG nhắc (chỉ nằm trong danh sách để nhìn). 0 = nhắc đúng ngày đến hạn.
  remind_days_before int check (remind_days_before between 0 and 60),
  category_id uuid,
  account_id uuid,
  status text not null default 'planned' check (status in ('planned', 'done', 'dropped')),
  -- Giao dịch đã ghi khi chi thật. Xoá giao dịch đó thì cột này về null chứ không xoá
  -- khoản dự tính: kế hoạch vẫn còn, chỉ là bút toán bị gỡ.
  transaction_id uuid,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (category_id, user_id) references public.categories (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete set null,
  -- Đã đánh dấu xong thì phải có bút toán, và ngược lại — không thì danh sách có dòng
  -- "đã chi" mà sổ không có đồng nào rời ví.
  constraint planned_done_needs_tx check (
    (status = 'done') = (transaction_id is not null)
  ),
  -- 'month' luôn neo vào ngày 1: hai khoản cùng tháng phải so sánh được với nhau, và
  -- mọi phép gom theo tháng chỉ cần đọc due_on chứ không phải tự cắt chuỗi.
  constraint planned_month_anchored check (
    due_precision <> 'month' or extract(day from due_on) = 1
  )
);

create index planned_expenses_user_idx on public.planned_expenses (user_id, status, due_on);

alter table public.planned_expenses enable row level security;

create policy "own rows" on public.planned_expenses
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger set_updated_at
  before update on public.planned_expenses
  for each row
  execute function extensions.moddatetime (updated_at);
