-- ============================================================
-- Sổ Chi Tiêu — Migration 0028: chống trùng "Tự động trả thẻ"
-- Con trỏ accounts.card_autopay_through (migration 0010) chỉ chống trùng TRONG
-- một lượt chạy: hai thiết bị mở app cùng lúc đều đọc con trỏ cũ trước khi bên
-- nào kịp ghi con trỏ mới → mỗi bên sinh một giao dịch trả thẻ y hệt nhau.
-- Số tiền còn khớp nhau vì tính theo dư nợ tại ngày CHỐT sao kê (trước ngày trả),
-- nên lần trả đầu không làm lệch con số của lần thứ hai.
--
-- Chốt chặn thật đặt ở đây: mỗi thẻ + mỗi ngày đến hạn chỉ 1 giao dịch tự trả —
-- y như idx_tx_recurring_due đã làm cho giao dịch định kỳ (migration 0008).
-- ============================================================

-- 1. Dọn các cặp đã lỡ sinh trùng: giữ dòng CŨ NHẤT của mỗi (thẻ, ngày đến hạn),
-- xóa các bản sao sinh sau. Chỉ đụng tới chuyển khoản mang đúng ghi chú tự trả.
with autopay as (
  select
    id,
    row_number() over (
      partition by user_id, to_account_id, occurred_on
      order by created_at, id
    ) as rn
  from public.transactions
  where type = 'transfer'
    and note = 'Tự động trả thẻ'
    and to_account_id is not null
)
delete from public.transactions t
using autopay a
where t.id = a.id
  and a.rn > 1;

-- 2. Từ nay Postgres tự chặn. insertCardAutopay bắt lỗi 23505 và bỏ qua im lặng
-- (giống insertRecurringOccurrence), nên thiết bị chậm chân không báo lỗi ra UI.
create unique index if not exists idx_tx_card_autopay_due
  on public.transactions (to_account_id, occurred_on)
  where type = 'transfer' and note = 'Tự động trả thẻ' and to_account_id is not null;

comment on index public.idx_tx_card_autopay_due is
  'Mỗi thẻ mỗi ngày đến hạn chỉ 1 giao dịch tự trả — chống 2 thiết bị sinh trùng.';
