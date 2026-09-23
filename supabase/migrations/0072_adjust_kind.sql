-- ============================================================
-- Sổ Gạo — Migration 0072: dấu "khoản bù" trên giao dịch
--
-- VÌ SAO CẦN: trang chi tiết thẻ tách khoản bù TỔNG NỢ ("Điều chỉnh số nợ") khỏi tổng
-- "Quẹt trong kỳ" và bảng "số bị rút". Tới giờ nó được nhận ra bằng đúng một thứ: ghi chú
-- bằng y chuỗi 'Điều chỉnh số nợ'. Danh mục không phân biệt được (cả "Điều chỉnh số nợ"
-- lẫn "Chỉnh cho khớp" dùng chung danh mục 'Điều chỉnh số dư'), adjust_is_spend luôn false
-- với thẻ. Người dùng sửa ghi chú là khoản bù bị tính thành tiền quẹt → số bị rút sai.
--
-- GIÁ TRỊ (định nghĩa ở src/types/database.types.ts: AdjustKind):
--   'balance'          sheet "Điều chỉnh số nợ / số dư" — bù TỔNG nợ/số dư hôm nay
--   'statement_month'  sheet "Chỉnh cho khớp" — bù tổng quẹt của MỘT kỳ sao kê (vẫn tính
--                      là tiền quẹt)
--   null               giao dịch thường. App đọc null thì rơi về so ghi chú như cũ, nên
--                      dòng nào backfill bỏ sót vẫn được nhận y như trước migration.
--
-- Nullable, không default: đa số giao dịch không phải khoản bù.
-- Chạy lại nhiều lần vẫn an toàn (idempotent).
-- ============================================================

alter table public.transactions
  add column if not exists adjust_kind text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_adjust_kind_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_adjust_kind_check
      check (adjust_kind is null or adjust_kind in ('balance', 'statement_month'));
  end if;
end $$;

comment on column public.transactions.adjust_kind is
  'Khoản bù sinh từ nút nào: balance = "Điều chỉnh số nợ/số dư" (bù tổng), statement_month = "Chỉnh cho khớp" (bù một kỳ sao kê). null = giao dịch thường hoặc khoản bù cũ — app nhận bằng ghi chú.';

-- ------------------------------------------------------------
-- BACKFILL: đóng dấu các khoản bù đã có, theo đúng ghi chú mà app đã ghi.
-- Chỉ đụng dòng CHƯA có dấu, không phải chuyển khoản, và nằm trong danh mục bù
-- 'Điều chỉnh số dư' (nơi cả hai sheet ghi vào). Dòng ghi chú trùng chữ mà nằm ở danh mục
-- khác thì để null — app vẫn nhận nó bằng ghi chú như trước, số không đổi.
-- ------------------------------------------------------------

update public.transactions t
set adjust_kind = 'balance'
from public.categories c
where t.category_id = c.id
  and c.name = 'Điều chỉnh số dư'
  and t.adjust_kind is null
  and t.type <> 'transfer'
  and t.note in ('Điều chỉnh số nợ', 'Điều chỉnh số dư');

update public.transactions t
set adjust_kind = 'statement_month'
from public.categories c
where t.category_id = c.id
  and c.name = 'Điều chỉnh số dư'
  and t.adjust_kind is null
  and t.type <> 'transfer'
  and t.note like 'Điều chỉnh sao kê %';
