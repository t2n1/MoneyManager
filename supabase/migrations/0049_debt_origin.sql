-- ============================================================
-- Sổ Chi Tiêu — Migration 0049: debts.origin + debts.income_category_id
--
-- VÌ SAO CẦN HAI CỘT NÀY
-- "Khách nợ tôi tiền công" là một khoản owed_to_me KHÔNG có đồng nào rời ví. Ghi được
-- khoản đó thì tầng dữ liệu đã làm được (createDebt nhận `transaction` là tuỳ chọn),
-- nhưng LÚC KHÁCH TRẢ thì sai: createDebtPayment đóng cứng is_debt_flow = true, mà cờ
-- đó bị loại khỏi MỌI báo cáo Chi/Thu.
--   · Tiền cho vay: đúng — tiền vốn của mình, ra rồi về, không phải chi/thu thật.
--   · Tiền công:    sai — lúc khách trả là thu nhập thật lần đầu vào tài sản. Ghi như
--                   nợ thường thì số dư ví tăng mà "Thu" của tháng vẫn 0.
--
-- NULLABLE có chủ ý, và KHÔNG backfill.
-- null = "chưa ai nói", và lúc đó app chạy y như hôm nay. Mọi khoản nợ đang có không
-- đổi một con số nào. Cùng lối với categories.kind (0046) và accounts.is_liquid (0047).
--
-- KHÔNG suy origin từ `disbursement_transaction_id IS NULL`. Phép suy đó sai một ca có
-- thật: cho vay tiền mặt từ trước, giờ mới ghi vào app — không có giao dịch giải ngân,
-- mà vẫn là tiền cho vay. Suy như vậy thì lần người ta trả lại bị đếm thành thu nhập.
-- ============================================================

alter table public.debts
  add column if not exists origin text,
  add column if not exists income_category_id uuid;

-- drop-rồi-add (đúng lối 0023): `add constraint` không có `if not exists`, nên chạy lại
-- migration mà không drop trước là lỗi "already exists".
alter table public.debts
  drop constraint if exists debts_origin_check,
  drop constraint if exists debts_earned_needs_income_category,
  drop constraint if exists debts_earned_is_receivable,
  drop constraint if exists debts_income_category_fk;

alter table public.debts
  add constraint debts_origin_check
    check (origin is null or origin in ('lent', 'earned')),
  -- 'earned' mà thiếu danh mục thu thì lúc khách trả không biết ghi vào đâu — hàng đó
  -- không dùng được. Cùng tinh thần với planned_done_needs_tx (0038).
  add constraint debts_earned_needs_income_category
    check (origin is distinct from 'earned' or income_category_id is not null),
  -- Không ai "làm ra" một khoản MÌNH nợ.
  add constraint debts_earned_is_receivable
    check (origin is distinct from 'earned' or direction = 'owed_to_me'),
  add constraint debts_income_category_fk
    foreign key (income_category_id, user_id) references public.categories (id, user_id);

comment on column public.debts.origin is
  '''earned'' = người ta nợ vì mình đã làm việc (tiền công) → lần trả ghi thành THU thật, '
  'không mang cờ is_debt_flow. ''lent'' = đã xác nhận là tiền mình đưa ra. '
  'null = chưa ai nói → xử như ''lent''. Chỉ đặt lúc TẠO, không cho sửa.';

comment on column public.debts.income_category_id is
  'Danh mục THU cho mọi lần trả của khoản origin = ''earned''. Chọn một lần lúc ghi nợ '
  'nên khách trả ba lần cũng vào cùng một chỗ.';
