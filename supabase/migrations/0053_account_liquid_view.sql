-- ============================================================
-- Sổ Chi Tiêu — Migration 0053: lộ accounts.is_liquid ra VIEW account_balances
--
-- LỖI ĐANG SỬA
-- 0047 thêm cột `accounts.is_liquid` và cả app đọc nó qua `features/assets/liquidity.ts`.
-- Nhưng view `account_balances` liệt kê cột RÕ RÀNG chứ không `a.*`, nên cột mới KHÔNG tự
-- chảy qua — và 0047 đã quên bước dựng lại view (0050 sau đó dựng lại view cho
-- `last_reconciled_at` nhưng vẫn không thêm `is_liquid`).
--
-- Hệ quả: mọi thứ đọc `accounts` thì đúng (form tài khoản, dấu "rút ngay?" ở Cài đặt,
-- khối "phần giữ lại đi đâu" ở Báo cáo → Quyết định), còn mọi thứ đọc VIEW thì
-- `is_liquid` là `undefined`:
--   * `buildHealthSnapshot` → `liquidAssets` vẫn suy từ `type`, nên tiền gửi CÓ KỲ HẠN
--     vẫn bị đếm là tiền tiêu ngay được — đúng con số mà 0047 sinh ra để sửa.
--   * `liquidityInferredAccounts` → tab Sức khỏe đếm TOÀN BỘ tài khoản là "chưa khai",
--     nên lời nhắc "N tài khoản chưa khai rút ra được ngay" KHÔNG BAO GIỜ tắt: khai hết
--     ở Cài đặt rồi mà con số vẫn đứng nguyên.
--   * `earmarked.ts` → phần gom cho mục tiêu tiết kiệm cũng cùng rổ sai đó.
--
-- Vì `LiquidityInput.is_liquid` là trường TUỲ CHỌN (`?: boolean | null`) nên
-- `AccountBalanceRow` thiếu cột vẫn hợp kiểu — tsc xanh, số sai lặng lẽ. Guard mới ở
-- tests/accountBalancesView.test.ts canh đúng chỗ đó.
--
-- Thân view giữ NGUYÊN bản 0050_account_reconciled.sql, chỉ thêm một dòng cột.
-- ============================================================

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
  a.is_liquid,
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
