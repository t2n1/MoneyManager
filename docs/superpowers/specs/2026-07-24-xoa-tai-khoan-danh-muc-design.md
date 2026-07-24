# Xóa tài khoản & Xóa danh mục

## Bối cảnh

Hiện app chỉ có **Lưu trữ** (ẩn nhưng giữ lịch sử) cho tài khoản và danh mục,
chưa có cách **xóa hẳn**. Người dùng cần xóa những mục tạo nhầm hoặc không còn
cần giữ.

Ràng buộc khóa ngoại trong Postgres:
- `transactions.account_id` / `to_account_id` → `accounts`: chặn xóa (RESTRICT).
- `transactions.category_id` → `categories`: chặn xóa (RESTRICT).
- `recurring_rules.account_id` / `to_account_id` / `category_id`: chặn xóa (RESTRICT).
- `budgets.category_id` → `categories`: chặn xóa (RESTRICT).
- `savings_goals.account_id` → `accounts`: ON DELETE CASCADE.
- `account_valuations.account_id` → `accounts`: ON DELETE CASCADE.
- `accounts.payment_account_id` → `accounts`: ON DELETE SET NULL.
- `categories.parent_id` → `categories`: ON DELETE CASCADE (xóa cha → xóa con).

## Nguyên tắc: chỉ xóa khi trống

Không bao giờ xóa kèm dữ liệu người dùng. Nếu còn mục tham chiếu tới → **chặn xóa**
và gợi ý dùng Lưu trữ. Trường hợp "còn dùng" chính là lý do đã có Lưu trữ; Xóa
dành cho mục hoàn toàn chưa có dữ liệu.

### Tài khoản — xóa được khi KHÔNG có
- Giao dịch nào có `account_id` hoặc `to_account_id` trỏ tới nó.
- Giao dịch định kỳ nào có `account_id` hoặc `to_account_id` trỏ tới nó.
- Mục tiêu tiết kiệm nào gắn `account_id` với nó.
- Tài khoản (thẻ) nào đang dùng nó làm `payment_account_id` (tài khoản trả thẻ).
- Bản cập nhật giá trị đầu tư (`account_valuations`) nào của nó.

### Danh mục — xóa được khi KHÔNG có
- Giao dịch nào có `category_id` trỏ tới nó (kể cả con của nó).
- Giao dịch định kỳ nào có `category_id` trỏ tới nó.
- Ngân sách (`budgets`) nào gắn `category_id` với nó.

**Danh mục cha có con:** nếu **cả cha và tất cả con đều trống** theo quy tắc trên
→ xóa cả cha lẫn con trong một thao tác. Nếu bất kỳ mục nào (cha hoặc một con)
còn dữ liệu → chặn toàn bộ, không xóa gì.

## Giao diện

**Vị trí nút Xóa:** trong hộp **Sửa tài khoản** / **Sửa danh mục** (không phải
ngoài danh sách), nút **"Xóa"** màu đỏ ở góc dưới trái, tách khỏi cụm Hủy/Lưu để
tránh bấm nhầm. Chỉ hiện khi đang **sửa** (có mục), không hiện khi **thêm mới**.
Ngoài danh sách giữ nguyên nút "Lưu trữ".

**Luồng:**
1. Bấm "Xóa" → hộp xác nhận đỏ (`confirmDialog` với `danger: true`):
   tiêu đề "Xóa tài khoản «Tên»?" / "Xóa danh mục «Tên»?", nội dung
   "Không thể hoàn tác." (danh mục cha có con: thêm "Xóa cả N danh mục con.").
2. Người dùng đồng ý → gọi mutation xóa.
3. Nếu repo báo lỗi "còn dữ liệu" → hiện toast đỏ nói rõ lý do, ví dụ:
   *"Không xóa được: còn giao dịch dùng tài khoản này. Hãy Lưu trữ thay vì Xóa."*
   Ô Sửa vẫn mở.
4. Nếu xóa xong → đóng ô Sửa, hiện toast thành công.

Việc kiểm tra trống nằm ở tầng dữ liệu (repo) để dùng chung cho cả hai bản; UI
chỉ hiển thị xác nhận rồi bắt lỗi. Chấp nhận việc hộp xác nhận hiện trước khi biết
chặn hay không — đổi lại code đơn giản, một đường đi.

## Tầng dữ liệu (Repo)

Thêm vào interface `Repo`:
- `deleteAccount(id: string): Promise<void>`
- `deleteCategory(id: string): Promise<void>`

Cả hai kiểm tra "trống" trước; nếu không trống thì `throw new Error(<thông điệp tiếng Việt>)`
nêu đúng loại dữ liệu đang chặn (giao dịch / định kỳ / ngân sách / mục tiêu / trả thẻ).
Nếu trống thì xóa.

- **demoRepo** (localStorage): đếm tham chiếu trong các mảng `transactions`,
  `recurringRules`, `budgets`, `savingsGoals`, `accountValuations`, `accounts`.
  Với danh mục cha: gom cha + các con (theo `parent_id`), kiểm tra tất cả rồi
  xóa hết trong một lần `save`.
- **supabaseRepo**: đếm bằng truy vấn `count` (head) trên từng bảng; nếu trống thì
  `delete`. Với danh mục cha trống: xóa cha, để FK `on delete cascade` xóa con
  (đã kiểm tra con trống trước nên cascade không bị RESTRICT chặn).

## Hook

Thêm `useDeleteAccount()` và `useDeleteCategory()` trong `hooks/queries.ts`:
- `useDeleteAccount`: `onSettled` gọi `invalidateAccounts` (accounts + balances).
- `useDeleteCategory`: `onSettled` invalidate `['categories']` (và `['budgets']`
  cho chắc, dù danh mục có ngân sách thì đã bị chặn).

## Kiểm thử

Unit test cho demoRepo:
- Xóa tài khoản trống → thành công.
- Xóa tài khoản còn giao dịch / định kỳ / mục tiêu / đang là nguồn trả thẻ /
  còn valuation → throw, dữ liệu không đổi.
- Xóa danh mục trống → thành công.
- Xóa danh mục còn giao dịch / định kỳ / ngân sách → throw.
- Xóa cha khi cha + mọi con đều trống → xóa hết cha lẫn con.
- Xóa cha khi một con còn giao dịch → throw, không xóa gì.

## Ngoài phạm vi (YAGNI)

- Không có "xóa kèm mọi thứ" hay "chuyển rồi xóa" — chỉ xóa khi trống.
- Không hoàn tác (undo) sau xóa; đã có xác nhận đỏ trước khi xóa.
