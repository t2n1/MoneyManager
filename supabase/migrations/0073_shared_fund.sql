-- Quỹ chung hai người: một tài khoản chung, mỗi người góp theo TỪNG PHẦN (tiền nhà, ăn
-- uống, điện nước ga…), quỹ chi từ tài khoản đó.
--
-- Vẫn là bước "một người ghi sổ cho cả hai" của 0064: không đụng RLS, không có login thứ
-- hai. Người góp là `transactions.owner` đã có (mine/partner); cái còn thiếu chỉ là
-- khoản góp này góp CHO PHẦN NÀO, và tài khoản nào là quỹ chung.
--
-- Vì sao cột riêng `fund_part_id` mà không dùng lại `category_id`: khoản góp là CHUYỂN
-- KHOẢN, mà check hình dạng giao dịch ở 0001 bắt chuyển khoản có `category_id is null`.
-- Nới check đó là để màn Danh mục / Ngân sách nào lọc theo category_id mà quên lọc type
-- đếm tiền góp thành tiền chi — hai lần cho cùng một đồng (lúc góp và lúc quỹ chi). Cột
-- riêng thì không ai đọc nhầm được.

-- Tên người kia, để giao diện nói "Hạnh góp" thay vì "người ấy góp". Rỗng = chưa đặt →
-- giao diện dùng chữ "Người ấy".
alter table public.profiles
  add column if not exists partner_name text not null default ''
    check (char_length(partner_name) <= 40);

-- Tài khoản quỹ chung — MỘT tài khoản (người dùng chốt 2026-09-30). null = chưa đặt →
-- màn Quỹ chung chỉ hướng dẫn cách đặt.
alter table public.profiles
  add column if not exists shared_fund_account_id uuid;
-- Composite FK như mọi tham chiếu tài khoản khác (0001): chặn trỏ sang tài khoản của
-- user khác. `set null (cột)`: xoá tài khoản thì chỉ gỡ cài đặt, không đụng user_id.
alter table public.profiles
  drop constraint if exists profiles_shared_fund_account_fkey;
alter table public.profiles
  add constraint profiles_shared_fund_account_fkey
    foreign key (shared_fund_account_id, user_id)
    references public.accounts (id, user_id)
    on delete set null (shared_fund_account_id);

-- Khoản góp này góp cho phần nào (một danh mục chi). Chỉ có nghĩa trên chuyển khoản VÀO
-- quỹ chung (hoặc rút RA khỏi một phần). null = không phải khoản góp / chưa gán phần.
alter table public.transactions
  add column if not exists fund_part_id uuid;
alter table public.transactions
  drop constraint if exists transactions_fund_part_fkey;
alter table public.transactions
  add constraint transactions_fund_part_fkey
    foreign key (fund_part_id, user_id)
    references public.categories (id, user_id)
    on delete set null (fund_part_id);
alter table public.transactions
  drop constraint if exists transactions_fund_part_transfer_only;
alter table public.transactions
  add constraint transactions_fund_part_transfer_only
    check (fund_part_id is null or type = 'transfer');

-- Góp cố định hằng tháng đi bằng giao dịch định kỳ, nên quy tắc cũng phải mang được
-- người góp và phần góp để chép xuống từng kỳ nó sinh ra.
alter table public.recurring_rules
  add column if not exists owner public.tx_owner not null default 'mine';
alter table public.recurring_rules
  add column if not exists fund_part_id uuid;
alter table public.recurring_rules
  drop constraint if exists recurring_rules_fund_part_fkey;
alter table public.recurring_rules
  add constraint recurring_rules_fund_part_fkey
    foreign key (fund_part_id, user_id)
    references public.categories (id, user_id)
    on delete set null (fund_part_id);
alter table public.recurring_rules
  drop constraint if exists recurring_rules_fund_part_transfer_only;
alter table public.recurring_rules
  add constraint recurring_rules_fund_part_transfer_only
    check (fund_part_id is null or type = 'transfer');

comment on column public.profiles.partner_name is
  'Tên người kia trong sổ hai người (0064). Rỗng = giao diện ghi "Người ấy".';
comment on column public.profiles.shared_fund_account_id is
  'Tài khoản quỹ chung hai người. null = chưa đặt.';
comment on column public.transactions.fund_part_id is
  'Khoản góp quỹ chung này góp cho phần (danh mục chi) nào. Chỉ trên chuyển khoản.';
