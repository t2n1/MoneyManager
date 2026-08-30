-- ============================================================
-- Sổ Chi Tiêu — Migration 0054: ví tiền của tài khoản chứng khoán VN
--
-- VẤN ĐỀ
-- Người dùng mua cổ phiếu bằng tiền trong tài khoản ngân hàng VN nhưng chỉ ghi SỔ LỆNH,
-- không ghi dòng tiền nào rời khỏi ngân hàng. Hai hệ quả, cả hai đều âm thầm:
--   * `brokerCash` (= số dư sổ của tài khoản chứng khoán − tiền đã bỏ ra mua) ra ÂM, nên
--     `portfolioValue` trả null và stock-refresh bỏ qua tài khoản với lý do
--     `tien-chua-dau-tu-am` → cổ phiếu VN gần như không đóng góp gì vào Tổng tài sản.
--   * Số dư ngân hàng cao hơn tiền thật đúng bằng tổng tiền đã mua cổ phiếu.
-- Hai cái sai gần như triệt tiêu nhau nên nó chưa bao giờ "kêu" — lệch đúng bằng phần
-- lời/lỗ chưa bán.
--
-- CÁCH SỬA: sửa ở SỔ, không sửa ở phép tính. Khai ví tiền một lần; từ đó mỗi lệnh cổ
-- phiếu kéo theo một chuyển khoản THẬT giữa ví và tài khoản chứng khoán (xem
-- src/features/assets/stockTradePosting.ts). `brokerCash`, `aggregate.ts` và edge
-- function `stock-refresh` không đổi một dòng nào — chúng tự đúng khi sổ đã đúng.
-- ============================================================

alter table public.accounts
  add column cash_account_id uuid references public.accounts(id) on delete set null;

comment on column public.accounts.cash_account_id is
  'Tài khoản đang giữ tiền mặt của tài khoản đầu tư này (cùng loại tiền). null = không khai.';

alter table public.transactions
  add column stock_trade_id uuid references public.stock_trades(id) on delete cascade;

comment on column public.transactions.stock_trade_id is
  'Lệnh cổ phiếu đã sinh ra dòng tiền này. on delete cascade: xoá lệnh thì dòng tiền tự đi theo.';

-- Một lệnh không bao giờ có hai dòng tiền — nhờ nó, nút "ghi bù" bấm hai lần vẫn an toàn.
create unique index transactions_stock_trade_id_key
  on public.transactions (stock_trade_id) where stock_trade_id is not null;

-- ------------------------------------------------------------
-- Dựng lại view: nó liệt kê cột RÕ RÀNG chứ không `a.*`, nên `alter table add column`
-- KHÔNG làm cột mới chảy qua. Đúng cái bẫy mà 0053 sinh ra để sửa (0047 thêm
-- `is_liquid` rồi quên bước này, và suốt 6 migration mọi thứ đọc view nhận `undefined`).
-- Thân view viết đủ nên bản này tự đứng được, không phụ thuộc 0053 đã chạy hay chưa.
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
  a.is_liquid,
  a.credit_limit,
  a.statement_day,
  a.payment_due_day,
  a.payment_account_id,
  a.cash_account_id,
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
