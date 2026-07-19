# Thiết kế: Tối ưu app cho người Việt sống ở Nhật

Ngày: 2026-07-19

## Bối cảnh

Người dùng sống ở Nhật, muốn app sát đời sống tài chính ở Nhật hơn. App đã có nền
tảng tốt: tiền gốc mặc định JPY, định dạng ¥ theo chuẩn Nhật (dấu phẩy hàng nghìn),
`month_start_day` chỉnh được (hợp lương trả ngày 25).

Yêu cầu được tách thành 4 tính năng độc lập; **#1 (hiển thị theo 万) đã bị loại khỏi
phạm vi**. Tài liệu này đặc tả 3 tính năng còn lại:

- **#2** — Thêm loại tài khoản kiểu Nhật (IC giao thông, Ví điện tử)
- **#3** — Bộ danh mục chi tiêu kiểu Nhật (nút bổ sung)
- **#4** — Gửi tiền về Việt Nam

Ngoài phạm vi: đơn vị 万/億, định dạng ngày kiểu Nhật, niên hiệu Reiwa.

---

## #2 — Loại tài khoản kiểu Nhật

### Quyết định
- Thêm 2 loại: `ic` (**IC giao thông** — Suica/PASMO/ICOCA) và `ewallet`
  (**Ví điện tử** — PayPay/Rakuten Pay/LINE Pay).
- Cả hai là **tài sản** (số dư dương), giống `cash`/`bank` về mặt tính toán. Chỉ
  `card` mới là công nợ — không thay đổi logic đó.

### Thay đổi
1. **`src/types/database.types.ts`**: mở rộng union
   `AccountType = 'cash' | 'bank' | 'card' | 'ic' | 'ewallet'`.
2. **Migration `supabase/migrations/0012_account_types_jp.sql`**:
   ```sql
   alter table public.accounts drop constraint if exists accounts_type_check;
   alter table public.accounts
     add constraint accounts_type_check
     check (type in ('cash', 'bank', 'card', 'ic', 'ewallet'));
   ```
   View `account_balances` đọc `a.type` chung → **không cần sửa view**.
3. **`src/features/assets/aggregate.ts`**: bổ sung `ACCOUNT_TYPE_LABELS`:
   - `ic: 'IC giao thông'`, `ewallet: 'Ví điện tử'`.
   Vì là `Record<AccountType, string>`, TypeScript sẽ bắt buộc điền đủ (an toàn biên dịch).
4. **`src/components/icons.tsx`**: bổ sung `ICONS` (cũng là `Record<AccountType, …>`):
   - `ic` → `TrainFront` (lucide), `ewallet` → `Wallet` (lucide).
5. **`src/features/accounts/AccountsPage.tsx`**: thêm 2 `<option>` trong select "Loại":
   `<option value="ic">IC giao thông</option>`, `<option value="ewallet">Ví điện tử</option>`.

### Ảnh hưởng sẵn có
- Biểu đồ "Theo loại" (đã có) tự sinh lát cho `ic`/`ewallet` qua `assetTypeGroups` +
  `ACCOUNT_TYPE_LABELS`. Không cần sửa `AssetsPage`.
- `CardLiability` chỉ nhận `type === 'card'` → `ic`/`ewallet` không bị coi là nợ.

### Kiểm thử
- `aggregate.test.ts`: thêm ca có tài khoản `ic`/`ewallet` → xuất hiện thành nhóm loại
  riêng, cộng vào tổng.

---

## #3 — Bộ danh mục kiểu Nhật

### Quyết định
- **Nút "Thêm bộ danh mục Nhật"** trong trang Danh mục (`CategoriesPage`).
- **Bổ sung** (không thay/không xóa): chỉ thêm danh mục **còn thiếu**, so khớp theo
  `(name, type)` không phân biệt hoa/thường + dấu. Danh mục đã tồn tại bị bỏ qua.
- Nhãn **tiếng Việt** (không kèm chữ Nhật trong ngoặc).

### Bộ danh mục (đề xuất)
Cấu trúc cha → con. Icon emoji.

**Chi (expense):**
- 🏠 Nhà ở
  - Tiền nhà
  - Phí quản lý
  - Gas
- 🚆 Đi lại *(cha có thể đã tồn tại → dùng lại, chỉ thêm con thiếu)*
  - Vé tháng
  - Nạp IC
- 🧾 Hóa đơn & tiện ích *(dùng lại nếu có)*
  - NHK
- 🍜 Ăn uống *(dùng lại nếu có)*
  - Konbini
- 🛡️ Bảo hiểm & lương hưu
  - Bảo hiểm y tế
  - Nenkin
- 🏛️ Thuế
  - Thuế thị dân
  - Thuế thu nhập
- ✈️ Về Việt Nam
  - Gửi tiền về VN
  - Vé máy bay về VN

**Thu (income):**
- Làm thêm
- Hoàn thuế

> Ghi chú: "Gửi tiền về VN" (chi) là danh mục dùng cho luồng #4 chế độ *Hỗ trợ gia đình*.
> Nếu người dùng chưa bấm nút bộ Nhật, #4 vẫn tự tạo danh mục này khi cần (xem #4).

### Thay đổi
1. **`src/features/categories/japanPreset.ts`** (mới): khai báo thuần dữ liệu bộ danh
   mục trên (mảng cha, mỗi cha có children), export để tái dùng + test.
2. **Repo method `addJapanCategoryPreset(): Promise<number>`** (trả số danh mục đã thêm):
   - Interface trong `src/data/repo.ts`.
   - `supabaseRepo` + `demoRepo` cùng cài. Thuật toán:
     1. Đọc danh mục hiện có → tập tên chuẩn hóa theo type.
     2. Với mỗi cha thiếu: tạo cha (parent_id=null). Với cha đã có: lấy id sẵn.
     3. Tạo các con thiếu với `parent_id` = id cha tương ứng.
     4. Bỏ qua mọi mục đã tồn tại. Trả tổng số đã tạo.
   - Chuẩn hóa tên: `.trim().toLocaleLowerCase('vi')` + bỏ dấu (tái dùng tiện ích so
     khớp đã có trong `filter.ts` nếu phù hợp).
3. **Hook `useAddJapanCategoryPreset`** trong `src/hooks/queries.ts`: gọi repo, invalidate
   `['categories']`.
4. **`CategoriesPage.tsx`**: nút "Thêm bộ danh mục Nhật" (có xác nhận), sau khi chạy hiện
   thông báo "Đã thêm N danh mục" (hoặc "Bộ danh mục Nhật đã đầy đủ" nếu N=0).

### Kiểm thử
- `japanPreset` test: gọi hàm gộp thuần (nếu tách được logic "tính mục thiếu") → với danh
  mục hiện có gồm vài mục trùng, chỉ trả về phần thiếu; không nhân đôi.

---

## #4 — Gửi tiền về Việt Nam

### Quyết định
- Lưu bằng cách **mở rộng bảng `transactions`** (không thêm bảng). Mỗi lần gửi là **một
  giao dịch** có gắn cờ → số dư/Tài sản ròng tự đúng.
- Mỗi lần gửi tự chọn **kiểu**:
  - **Chuyển tài sản** → `transfer` JPY→TK VND của người dùng (không giảm Tài sản ròng).
  - **Hỗ trợ gia đình** → `expense` danh mục "Gửi tiền về VN" (giảm Tài sản ròng).

### Mô hình dữ liệu
Migration `supabase/migrations/0013_remittance.sql` — thêm vào `transactions` (đều nullable):
```sql
alter table public.transactions
  add column if not exists is_remittance boolean not null default false;
alter table public.transactions
  add column if not exists remit_service text;         -- Wise / SBI Remit / Brastel / DCOM / Khác
alter table public.transactions
  add column if not exists remit_fee_jpy bigint;       -- phí dịch vụ (minor units JPY = yên)
alter table public.transactions
  add column if not exists remit_received_vnd bigint;  -- số VND người nhận nhận được (minor units VND = đồng)
```
- `src/types/database.types.ts`: `TransactionRow` thêm 4 trường; `NewTransaction`
  (`repo.ts`) thêm `is_remittance`, `remit_service`, `remit_fee_jpy`, `remit_received_vnd`
  (mặc định false/null để mọi nơi tạo giao dịch cũ vẫn hợp lệ).
- **Quy ước số tiền:** `amount` = số thực sự **rời tài khoản JPY** = *số gửi + phí*;
  `remit_fee_jpy` = phí; ⇒ *số gửi gốc* = `amount − remit_fee_jpy`. Tách phí riêng để
  thống kê sạch và hiển thị được phí trong lịch sử.
- Ánh xạ theo kiểu:
  - *Chuyển tài sản*: `type='transfer'`, `account_id`=TK JPY nguồn, `to_account_id`=TK VND
    đích, `amount`=số gửi + phí, `to_amount`=VND nhận, `remit_fee_jpy`=phí,
    `remit_received_vnd`=VND nhận (đồng bộ `to_amount`), `is_remittance=true`.
  - *Hỗ trợ gia đình*: `type='expense'`, `account_id`=TK JPY nguồn, `amount`=số gửi + phí,
    `category_id`=id "Gửi tiền về VN" (chi), `remit_fee_jpy`=phí,
    `remit_received_vnd`=VND nhận, `is_remittance=true`, `to_account_id`=null.

### Danh mục "Gửi tiền về VN"
- Form đảm bảo tồn tại danh mục chi "Gửi tiền về VN" trước khi tạo expense: nếu chưa có
  thì tạo (icon ✈️/💸). Dùng lại nếu bộ #3 đã tạo.

### Form nhập "Gửi tiền về VN"
`src/features/remittance/RemittanceFormSheet.tsx` (sheet, giống DebtPaymentSheet):
- Ngày (mặc định hôm nay)
- Kiểu: Chuyển tài sản / Hỗ trợ gia đình (segmented)
- TK nguồn (JPY, không phải card, không archived)
- (Nếu Chuyển tài sản) TK đích VND — nếu chưa có TK VND nào: nhắc tạo trước
- Số gửi (JPY) — bàn phím kiểu ATM như các form khác
- Phí (JPY) — mặc định 0
- Số nhận (VND)
- Dịch vụ (select: Wise / SBI Remit / Brastel / DCOM / Khác)
- Người nhận / ghi chú (→ `note`)
- Hiển thị **tỷ giá tức thời** = VND nhận ÷ (số gửi) để người dùng đối chiếu.
- Lưu → `createTransaction` với ánh xạ ở trên.

### Trang "Gửi tiền về VN"
`src/features/remittance/RemittancePage.tsx`, route `/settings/remittance`, có mục vào từ
`SettingsPage` (bắt buộc). Không thêm link ở trang Tài sản trong phạm vi này.
- Thẻ tổng (giao dịch `is_remittance` trong năm dương lịch hiện tại):
  **Đã gửi năm nay** = Σ(`amount` − `remit_fee_jpy`) (số gửi gốc, JPY) ·
  **Tổng phí** = Σ `remit_fee_jpy` · **Tổng VND** = Σ `remit_received_vnd` ·
  **Tỷ giá thực nhận TB** = ΣVND ÷ Σ(số gửi gốc).
- Danh sách lịch sử (mới nhất trước): ngày, dịch vụ, JPY → VND, tỷ giá, kiểu, người nhận.
  Mỗi dòng mở lại để sửa/xóa (đi qua `updateTransaction`/`deleteTransaction`).
- Nút "＋ Gửi tiền" mở form.
- Dữ liệu: hook `useRemittances(year)` gọi `searchTransactions` theo khoảng năm rồi lọc
  `is_remittance`, HOẶC thêm cờ vào `TxFilter`. **Quyết định:** lọc phía client sau khi
  `searchTransactions` theo khoảng ngày cả năm (đơn giản, khối lượng nhỏ).

### Hàm tổng hợp thuần (test được)
`src/features/remittance/aggregate.ts`:
```ts
export interface RemittanceStats {
  totalSentJpy: number       // Σ (amount − remit_fee_jpy) — số gửi gốc
  totalFeeJpy: number        // Σ remit_fee_jpy
  totalReceivedVnd: number   // Σ remit_received_vnd
  avgRate: number | null     // totalReceivedVnd / totalSentJpy; null nếu totalSentJpy = 0
  count: number
}
export function remittanceStats(txs: TransactionRow[]): RemittanceStats
```
- Chỉ nhận giao dịch đã lọc `is_remittance`. Không phụ thuộc React. `remit_fee_jpy` null
  coi như 0.

### Kiểm thử
- `remittance/aggregate.test.ts`: tổng JPY/VND, tỷ giá TB, rỗng → avgRate null, bỏ giao
  dịch không phải remittance.

---

## Thứ tự thực thi
Làm lần lượt, mỗi tính năng có kế hoạch + kiểm thử riêng:
1. **#2** (nền tảng, migration nhỏ, ăn khớp biểu đồ "Theo loại").
2. **#3** (dữ liệu + nút; tạo sẵn danh mục "Gửi tiền về VN" cho #4).
3. **#4** (lớn nhất; phụ thuộc danh mục ở #3 nhưng tự tạo được nếu thiếu).

## Rủi ro & lưu ý
- Hai repo (`demoRepo`, `supabaseRepo`) phải đồng bộ cho mọi method mới.
- Migration đổi CHECK constraint: chạy trên Supabase thật; demoRepo chỉ cần nới union type.
- `NewTransaction` thêm field: rà mọi nơi tạo giao dịch (debt, recurring, card autopay,
  entry) để không vỡ kiểu — đặt default false/null.
- Tỷ giá "thực nhận" là dữ liệu người dùng nhập (không phải tỷ giá thị trường của
  `rates.ts`) — đó là chủ ý (phản ánh tỷ giá dịch vụ chuyển tiền).
