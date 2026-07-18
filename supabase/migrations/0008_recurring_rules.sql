-- ============================================================
-- Sổ Chi Tiêu — Migration 0008: giao dịch định kỳ
-- Bảng recurring_rules + cột transactions.recurring_rule_id
-- + partial unique index chống sinh trùng khi 2 thiết bị cùng catch-up.
-- ============================================================

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('expense', 'income', 'transfer')),
  -- Minor units theo currency của tài khoản nguồn (như transactions)
  amount bigint not null check (amount > 0),
  to_amount bigint check (to_amount > 0),
  category_id uuid,
  account_id uuid not null,
  to_account_id uuid,
  note text not null default '',
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  -- Kỳ đến hạn ĐẦU TIÊN; anchor cho ngày-trong-tháng / thứ-trong-tuần
  start_on date not null,
  -- null = vô hạn; kỳ đến hạn > end_on không sinh
  end_on date,
  is_paused boolean not null default false,
  -- Kỳ đến hạn cuối đã sinh; null = chưa sinh kỳ nào
  last_generated_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (to_account_id, user_id) references public.accounts (id, user_id),
  -- Hình dạng theo loại — y hệt bảng transactions
  check (
    (
      type = 'transfer'
      and to_account_id is not null
      and category_id is null
      and to_account_id <> account_id
    )
    or
    (
      type <> 'transfer'
      and to_account_id is null
      and to_amount is null
      and category_id is not null
    )
  )
);

alter table public.recurring_rules enable row level security;

create policy "own rows" on public.recurring_rules
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger set_updated_at
  before update on public.recurring_rules
  for each row
  execute function extensions.moddatetime (updated_at);

-- FK đơn cột + on delete set null: xóa rule giữ nguyên giao dịch cũ (mất liên
-- kết). Composite FK không dùng được vì user_id NOT NULL (cùng lý do
-- debt_payments.transaction_id ở migration 0007).
alter table public.transactions
  add column recurring_rule_id uuid references public.recurring_rules (id) on delete set null;

-- Mỗi rule mỗi ngày đến hạn chỉ có 1 giao dịch — chống 2 thiết bị sinh trùng
create unique index idx_tx_recurring_due
  on public.transactions (recurring_rule_id, occurred_on)
  where recurring_rule_id is not null;
