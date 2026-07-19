# Kế hoạch: Tự động trả thẻ tín dụng theo tài khoản nguồn

## Bối cảnh
Người dùng muốn: mỗi thẻ tín dụng gắn **một tài khoản ngân hàng nguồn**; vào **ngày đến hạn**
app **tự sinh giao dịch trả thẻ** với số tiền = **dư nợ tại ngày chốt sao kê**; và đối chiếu
"tài khoản nguồn có đủ tiền không". Việc này THAY THẾ mô hình "quỹ chung"
(`available_for_card_payment`) đã làm trước đó — sẽ gỡ bỏ.

## Quyết định thiết kế (đã chốt / kỹ thuật)
1. **Số tiền trả** = dư nợ tại ngày chốt sao kê = −(số dư thẻ tính đến hết `statement_day`
   của kỳ đó). Đã trừ các lần trả trước (vì chúng có occurred_on trước mốc chốt kế tiếp) → không double.
   Chỉ trả khi > 0. ⇒ **bắt buộc có `statement_day` + `payment_due_day`** mới bật được tự trả.
2. **Thiếu tiền** → vẫn tạo giao dịch (tài khoản nguồn có thể âm), UI cảnh báo (đỏ).
3. **Cùng loại tiền**: tài khoản nguồn phải cùng currency với thẻ (tránh đoán tỷ giá khi tạo CK).
   Form chỉ liệt kê tài khoản không-phải-thẻ, cùng currency.
4. **Không backfill lịch sử**: khi bật, đặt `card_autopay_through = hôm nay` → chỉ sinh kỳ tương lai.
5. **Chống trùng**: con trỏ `card_autopay_through` trên thẻ (giống `last_generated_on` của định kỳ).
   Robust cho 1 thiết bị; đa thiết bị có cửa sổ đua nhỏ (chấp nhận, như định kỳ trước khi có index).

## Schema (viết lại migration 0010 — CHƯA áp dụng ở đâu)
- `accounts.payment_account_id uuid null references accounts(id) on delete set null` — tài khoản nguồn của thẻ.
- `accounts.card_autopay_through date null` — ngày đến hạn cuối đã sinh giao dịch tự trả.
- Bỏ `available_for_card_payment`. View `account_balances` lộ thêm `payment_account_id`.

## Engine `src/lib/cardAutopay.ts` (thuần, có test)
- `dueDatesToGenerate(dueDay, through, today)` → danh sách ngày đến hạn (monthly) trong (through, today].
- `statementCloseFor(dueDate, statementDay)` → mốc chốt sao kê = ngày `statementDay` gần nhất TRƯỚC dueDate.
- `runCardAutopayCatchUp(repo, today)`:
  - với mỗi thẻ có đủ payment_account_id + statement_day + payment_due_day:
    - mỗi dueDate: tính owed = −(balance thẻ tính đến hết closeDate) qua `searchTransactions`;
    - owed > 0 → tạo transfer nguồn→thẻ (amount = owed, cùng currency), occurred_on = dueDate;
    - cập nhật `card_autopay_through = dueDate` (kể cả khi owed=0, để không xét lại).
- Gọi trong catch-up khi mở app (cạnh `runRecurringCatchUp`), gộp số đã tạo vào toast.

## UI
- **Form tài khoản (thẻ)**: bỏ toggle "Dùng để trả nợ thẻ"; thêm select **"Tài khoản trả thẻ"**
  (tùy chọn; hiện gợi ý cần điền statement/due day nếu chọn). Không phải thẻ: không có gì mới.
- **Trang Tài sản (mục Thẻ)**: mỗi thẻ hiển thị "Trả từ: <tài khoản>" + đối chiếu số dư nguồn
  vs dư nợ hiện tại → badge Đủ/Chưa đủ. Bỏ box "quỹ chung".

## aggregate.ts
- Gỡ `cardPaymentFunds` / `cardPaymentFundsHasMissingRate`.
- `CardLiability` thêm `paymentAccountId: string | null` để UI tra tài khoản nguồn.

## Test
- `cardAutopay.test.ts`: dueDates, statementClose (giáp ranh tháng), catch-up sinh đúng số tiền,
  không double qua nhiều kỳ, owed<=0 bỏ qua nhưng vẫn tiến con trỏ.
- Cập nhật `aggregate.test.ts` (bỏ test pool, giữ paymentAccountId).
