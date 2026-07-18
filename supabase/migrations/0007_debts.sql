-- ============================================================
-- Sổ Chi Tiêu — Migration 0007: nợ / cho vay (backlog mục F)
-- Theo dõi khoản nợ với đối tác ngoài hệ thống tài khoản + lịch sử trả từng phần.
-- Nợ KHÔNG tự đổi số dư: mọi biến động tiền vẫn là 1 dòng transactions;
-- debt_payments chỉ TRỎ tới giao dịch đó (transaction_id).
-- ============================================================

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  counterparty text not null,
  -- i_owe = mình nợ người ta · owed_to_me = người ta nợ mình
  direction text not null check (direction in ('i_owe', 'owed_to_me')),
  -- Tệ của khoản nợ (ISO 4217); tiền lưu minor units theo tệ này
  currency text not null default 'JPY' check (currency ~ '^[A-Z]{3}$'),
  principal bigint not null check (principal > 0),
  due_on date,
  status text not null default 'open' check (status in ('open', 'settled')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Cho composite FK từ debt_payments
  unique (id, user_id)
);

create index idx_debts_user on public.debts (user_id, status);

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  debt_id uuid not null,
  amount bigint not null check (amount > 0),
  paid_on date not null default current_date,
  -- Giao dịch thật nếu lần trả này có chuyển tiền; null = ghi nhận suông.
  -- FK đơn cột + on delete set null: xóa giao dịch ở sổ không làm hỏng lịch sử nợ.
  transaction_id uuid references public.transactions (id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now(),
  -- Composite FK: chặn tham chiếu khoản nợ của user khác. Xóa nợ → xóa payment.
  foreign key (debt_id, user_id) references public.debts (id, user_id) on delete cascade
);

create index idx_debt_payments_debt on public.debt_payments (user_id, debt_id);

alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;

create policy "own rows" on public.debts
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own rows" on public.debt_payments
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger set_updated_at
  before update on public.debts
  for each row
  execute function extensions.moddatetime (updated_at);
