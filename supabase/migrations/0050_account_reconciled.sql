-- ============================================================
-- Sổ Chi Tiêu — Migration 0050: accounts.last_reconciled_at
--
-- VÌ SAO CẦN CỘT NÀY
-- App đang SUY "lần đối chiếu gần nhất" từ sự tồn tại của một giao dịch bù thuộc
-- danh mục "Điều chỉnh số dư" trong 30 ngày (dataRules.reconcileStaleRule và
-- notifications/reliability.ts). Phép suy đó bỏ sót đúng cái ca mà người ghi chép
-- cẩn thận rơi vào nhiều nhất: **mở sheet Đối chiếu, thấy số dư ĐÃ KHỚP**.
--
-- Khớp thì không có gì để bù → không có giao dịch → không có dấu vết → tài khoản
-- vẫn bị đếm là "chưa đối chiếu quá 30 ngày", và khối Độ tin cậy dữ liệu vẫn trừ
-- điểm. Chỉ số chỉ tăng được khi sổ SAI rồi bù — thưởng cho sổ lệch, phạt sổ đúng.
-- Nút "Điều chỉnh" cũng tắt khi chênh lệch bằng 0, nên người dùng không có đường
-- nào ghi nhận là mình đã kiểm.
--
-- Không thể lách bằng giao dịch 0 đồng: 0001_init.sql có `check (amount > 0)`, và
-- một bút toán rỗng trong Sổ cũng là rác đọc lên không hiểu.
--
-- NULLABLE, KHÔNG backfill.
-- null = "chưa từng đối chiếu qua cột này", và lúc đó app rơi về phép suy từ giao
-- dịch bù như cũ (dữ liệu trước migration này vẫn đọc đúng). Backfill một mốc giả
-- sẽ xoá mất phân biệt giữa "người dùng đã xác nhận" và "app đang đoán" — đúng cái
-- phân biệt cột này sinh ra để có. Cùng lối với categories.kind (0046) và
-- accounts.is_liquid (0047).
--
-- LÀ timestamptz CHỨ KHÔNG PHẢI date, và ghi theo ĐỒNG HỒ LÚC BẤM, không theo ô
-- "Ghi vào ngày" của sheet. Hai mốc trả lời hai câu khác nhau: ô ngày nói giao dịch
-- bù nằm ở đâu trong sổ (thẻ tín dụng còn lùi về ngày chốt sao kê — xem
-- reconcile.defaultAdjustDate), còn cột này nói LẦN CUỐI NGƯỜI DÙNG SO SỔ VỚI THỰC
-- TẾ là khi nào. Lấy ô ngày làm mốc kiểm thì mọi lần đối chiếu thẻ sẽ tự khai là đã
-- cũ vài tuần ngay lúc vừa bấm xong.
-- ============================================================

alter table public.accounts
  add column if not exists last_reconciled_at timestamptz;

comment on column public.accounts.last_reconciled_at is
  'Lần cuối người dùng so số dư sổ với số dư thực tế qua sheet Đối chiếu — ghi CẢ KHI '
  'đã khớp (không sinh giao dịch bù nào). null = chưa lần nào → app suy từ giao dịch '
  'bù trong danh mục "Điều chỉnh số dư" như trước 0050. '
  'Nuôi: reconcileStaleRule (chuông) và khối Độ tin cậy dữ liệu.';

-- ------------------------------------------------------------
-- Dựng lại VIEW account_balances để lộ cột mới.
--
-- View liệt kê cột RÕ RÀNG chứ không `a.*`, nên cột mới KHÔNG tự chảy qua. Edge
-- function push-notify đọc bộ luật qua chính view này (functions/push-notify/
-- loadInput.ts), nên thiếu bước này thì chuông push vẫn dùng phép suy cũ trong khi
-- app trong máy đã đọc cột mới — hai nơi nói hai kiểu về cùng một tài khoản.
--
-- Thân view giữ NGUYÊN bản 0026_reporting_pack.sql, chỉ thêm một dòng cột.
-- ------------------------------------------------------------
drop view if exists public.account_balances;

create view public.account_balances
with (security_invoker = true) as
select
  a.id,
  a.user_id,
  a.name,
  a.type,
  a.currency,
  a.asset_group,
  a.is_hidden,
  a.include_in_totals,
  a.credit_limit,
  a.statement_day,
  a.payment_due_day,
  a.payment_account_id,
  a.is_archived,
  a.sort_order,
  a.last_reconciled_at,
  a.initial_balance as cost_basis,
  a.depreciation_months,
  a.depreciation_from,
  a.salvage_value,
  a.tax_shelter,
  a.shelter_annual_limit,
  mv.market_value,
  a.initial_balance
    + coalesce(sum(
        case
          when t.type = 'income'   and t.account_id    = a.id then  t.amount
          -- Hoàn tiền: tiền quay lại ví → cộng (chi âm)
          when t.type = 'expense'  and t.account_id    = a.id and t.is_refund then  t.amount
          when t.type = 'expense'  and t.account_id    = a.id then -t.amount
          when t.type = 'transfer' and t.account_id    = a.id then -t.amount
          when t.type = 'transfer' and t.to_account_id = a.id then coalesce(t.to_amount, t.amount)
          else 0
        end
      ), 0) as balance
from public.accounts a
left join public.transactions t
  on t.user_id = a.user_id
 and (t.account_id = a.id or t.to_account_id = a.id)
left join lateral (
  select v.market_value
  from public.account_valuations v
  where v.account_id = a.id
  order by v.valued_on desc, v.created_at desc
  limit 1
) mv on true
group by a.id, mv.market_value;
