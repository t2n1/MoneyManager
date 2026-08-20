# Khách nợ công — nợ phải thu không kèm dòng tiền

**Ngày:** 2026-08-20
**Trạng thái:** thiết kế, chờ duyệt trước khi lập kế hoạch thực thi

## 1. Vấn đề

Người dùng làm thêm, khách chưa trả tiền công. Màn Nhập không ghi được việc này, và
hai đường có sẵn đều nói sai chuyện:

| Đường có sẵn | Vì sao sai |
| --- | --- |
| **Cho vay** (`lend`) | `writes: 'transaction', txType: 'expense'` — luôn ghi một khoản **chi rút khỏi ví**. Tiền công thì không có đồng nào rời ví. |
| **Sẽ thu** (pha thứ hai của `PHASE_LABEL.in`) | Đã khai trong code nhưng không có đường tới: `planned_expenses` không có cột phân biệt Chi/Thu/Chuyển, nên bật lên là ghi ra một dòng trông y hệt "Sẽ chi". |

Tầng dữ liệu thì **đã sẵn sàng**: `createDebt(input)` nhận `input.transaction` là tuỳ
chọn — không truyền thì khoản nợ được tạo với `disbursement_transaction_id = null`.
Chỉ UI là không có đường đi tới đó; nút "+ Thêm" ở trang Nợ cũng trỏ về
`/entry?role=debt`, tức về đúng màn Nhập.

### Cái bẫy nằm sâu hơn

`createDebtPayment` đóng cứng `is_debt_flow: true` cho mọi giao dịch trả nợ, và cờ đó
bị **loại khỏi mọi báo cáo Chi/Thu** (`tests/../aggregate.test.ts`: "is_debt_flow bị
loại khỏi mọi báo cáo").

- Với tiền **cho vay**: đúng. Tiền vốn là của bạn, đi ra rồi quay về, cả hai chiều đều
  không phải chi/thu thật.
- Với tiền **công**: sai. Lúc khách trả, đó là thu nhập thật lần đầu vào tài sản của
  bạn. Nếu ghi như nợ thường thì số dư ví tăng mà "Thu" của tháng vẫn 0 — báo cáo
  thiếu đúng phần tiền làm thêm.

Nên việc này **không phải** chỉ thêm một chip. Chỗ phải sửa là ngữ nghĩa của lần trả.

## 2. Quyết định của người dùng

1. Theo dõi ở **danh sách Nợ**, gom theo tên người, **trả nhiều lần được** — không phải
   một dòng "thu dự kiến" nhẹ.
2. Lúc khách trả, khoản đó **tính vào Thu** của tháng khách trả, với danh mục **chọn
   sẵn từ lúc ghi nợ** (không hỏi lại mỗi lần trả).
3. Trong màn Nhập: **chip mới ở "Tiền vào"**, tên **"Khách nợ công"**.

## 3. Mô hình dữ liệu — migration 0049

```sql
alter table public.debts
  add column if not exists origin text
    check (origin in ('lent', 'earned')),
  add column if not exists income_category_id uuid;

alter table public.debts
  add constraint debts_earned_needs_income_category
    check (origin is distinct from 'earned' or income_category_id is not null),
  add constraint debts_earned_is_receivable
    check (origin is distinct from 'earned' or direction = 'owed_to_me'),
  add constraint debts_income_category_fk
    foreign key (income_category_id, user_id) references public.categories (id, user_id);
```

**`origin` nullable, không backfill.** `null` = "chưa ai nói", và lúc đó app chạy y như
hôm nay. Mọi khoản nợ đang có của người dùng không đổi một con số nào. Cùng lối với
`categories.kind` (0046) và `accounts.is_liquid` (0047): cột mới nullable, giá trị null
nghĩa là chưa quyết, và app không được im lặng đoán.

**Không suy `origin` từ `disbursement_transaction_id IS NULL`.** Phép suy đó sai một ca
có thật: cho vay tiền mặt năm ngoái, giờ mới ghi vào app — không có giao dịch giải ngân,
mà vẫn là tiền cho vay. Suy như vậy thì lần khách trả lại bị đếm thành thu nhập. Cột
phải nói thẳng.

**Hai ràng buộc là bắt buộc, không phải cho đẹp.** `earned` mà thiếu
`income_category_id` thì lúc khách trả không biết ghi vào danh mục nào — dòng dữ liệu
đó không dùng được. `earned` mà `direction = 'i_owe'` là vô nghĩa: không ai "làm ra" một
khoản mình nợ. Cùng tinh thần với `planned_done_needs_tx` (0038).

**Chỉ dạng `owed` ghi `origin`, và chỉ ghi giá trị `'earned'`.** Mọi đường tạo nợ khác
(`lend`, `borrow`, và `DebtEditSheet`) để `origin` là `null` — tức "chưa ai nói", tức
hành vi hôm nay. KHÔNG đi ghi `'lent'` cho các đường cũ: giá trị đó không đổi cách ghi
sổ của bất kỳ chỗ nào (nhánh `earned` là nhánh duy nhất có hành vi khác), nên ghi nó chỉ
là thêm một cách viết thứ hai cho cùng một nghĩa. `'lent'` có trong `check` để dành cho
lúc nào thật cần phân biệt "đã xác nhận là tiền cho vay" với "chưa ai nói".

**`origin` chỉ đặt lúc TẠO, không cho sửa.** Đổi `lent` → `earned` sau khi đã có lần trả
sẽ để lại các lần trả cũ mang cờ cũ, tức một khoản nợ mà nửa số lần trả tính vào Thu và
nửa kia không. `DebtEditSheet` không bày cột này.

## 4. Màn Nhập — chip "Khách nợ công"

Dòng mới trong `SHAPES` (`entryShape.ts`):

```ts
owed: {
  kind: 'owed', direction: 'in', label: 'Khách nợ công',
  hint: 'Chưa có đồng nào vào ví — chỉ ghi người ta nợ bạn.',
  categoryPicker: 'user', capBase: 'none', amountLabel: 'Số tiền công',
  writes: 'debtOnly', txType: null,
  roleSeed: { role: 'debt', debtDirection: 'owed_to_me' },
}
```

`ORDER.in` thành `['earn', 'owed', 'collect', 'borrow']` — "Khách nợ công" đứng cạnh
"Người trả lại", vì đó là đôi tạo-rồi-thu của cùng một khoản. Hàng chip "Tiền vào" đang
có 3 chip; thêm chip thứ 4 phải **đo lại** bề rộng ở 375px (hàng chip đã từng phải bỏ
nhãn "Dạng" để vừa một dòng — xem spec 2026-08-19).

Ba thứ đi theo bảng, không cần code riêng:

- **Lưới danh mục THU** hiện đúng sẵn: `const type = shape.txType ?? (shape.direction === 'in' ? 'income' : 'expense')` — `txType: null` + `direction: 'in'` ra `income`. Danh mục người dùng chọn ở lưới này chính là `income_category_id`.
- **Field người nợ / ngày đến hạn** đến từ `roleSeed.role = 'debt'` → `DebtDetailInputs` đã có.
- **Màu số tiền** đọc `shape.txType` thô (`null` → trung tính), đúng: chưa có đồng nào đổi chỗ.

Hai thứ **phải sửa**:

1. **`writes: 'debtOnly'`** là giá trị mới của `EntryShape['writes']`. `roleSave` gọi
   `createDebt` **không truyền `transaction`**, kèm `origin: 'earned'` và
   `income_category_id`. `tests/../entryShape.test.ts` ("tam dang di qua
   createTransaction, hai dang di qua createDebtPayment") phải cập nhật số đếm.
2. **Cổng Lưu**: `entryGate` đang đòi tài khoản cho **mọi** dạng
   (`if (!s.hasAccount) return 'Còn thiếu: tài khoản.'`). Dạng này không ghi giao dịch
   nên không có tài khoản nào để đòi. Sửa thành `if (shape.writes !== 'debtOnly' && !s.hasAccount)` — đọc từ bảng, không thêm một cờ song song. Hàng "tài khoản + ngày"
   trên màn cũng ẩn, cùng cách "Sẽ chi" đang ẩn nó.

Bắt buộc để Lưu: số tiền, tên người nợ, danh mục thu. Ngày đến hạn và ghi chú tuỳ chọn.

## 5. Lúc khách trả — chỗ sửa cái sai

Tách quyết định ra một hàm thuần, `src/features/debts/debtPaymentPosting.ts`:

```ts
/**
 * Lần trả này ghi vào sổ như thế nào. Đọc `origin` của khoản nợ, không đoán.
 * `proposedCategoryId` là danh mục người gọi đã dựng sẵn trong `input.transaction`
 * (hôm nay: danh mục tự gán của dòng tiền nợ, `DEBT_FLOW_CATEGORY_NAMES.collect`).
 */
export function debtPaymentPosting(
  debt: Pick<DebtRow, 'origin' | 'income_category_id'>,
  proposedCategoryId: string | null,
): { isDebtFlow: boolean; categoryId: string | null }
```

- `origin === 'earned'` → `{ isDebtFlow: false, categoryId: debt.income_category_id }`.
  Giao dịch thu **thật**: vào Thu của tháng khách trả, vào đúng danh mục, hiện trong Sổ.
  Danh mục của khoản nợ **đè** danh mục người gọi dựng: một khoản nợ tiền công thì mọi
  lần trả của nó phải vào cùng một chỗ, không phụ thuộc cửa nào ghi.
- còn lại, **kể cả `null`** → `{ isDebtFlow: true, categoryId: proposedCategoryId }` — y
  như hôm nay, không đụng gì tới đường cũ.

`createDebtPayment` đọc khoản nợ rồi gọi hàm này. Quyết định nằm ở **một chỗ duy nhất**,
nên cả hai cửa tự đúng theo: màn Nhập → "Người trả lại" (`collect`), và
`DebtPaymentSheet` ở trang Nợ. Không cửa nào phải tự nhớ.

Ba ca biên tự đúng, không cần code thêm:

- **Trả góp nhiều lần** → mỗi lần một khoản thu đúng số đã nhận.
- **Tha nợ** (đánh `settled` không trả) → không có lần trả nào, nên không có thu nào.
- **Ghi nhận suông** (`PaymentValue.withTransaction = false`) → không có giao dịch, nên
  không có thu; số nợ vẫn giảm. Người dùng tự chịu, giống hôm nay.

## 6. Báo cáo — không sửa gì

Giao dịch thu không mang cờ `is_debt_flow` nên nó chảy vào Thu và vào phân tích theo
danh mục **qua đúng đường đã có**. Không có nhánh riêng nào cho "thu từ nợ" — đó là lý do
sửa ở tầng ghi chứ không ở tầng đọc.

Số nợ chưa trả vẫn chỉ nằm ở tổng hợp nợ (`owedToMe`), không phồng số dư tài khoản nào.
Sau khi trả: ví tăng, nợ còn lại giảm — không đếm hai lần.

## 7. Trang Nợ — một chỗ phải nói rõ

Thẻ tổng ở `DebtsPage` đang ghi **"Cho vay"**. Khi có khoản `earned`, con số đó thành
tổng của hai thứ khác bản chất (tiền tôi đưa ra + tiền công chưa nhận). Đổi nhãn thành
**"Người ta nợ tôi"**, và mỗi dòng `origin = 'earned'` mang một chip nhỏ **"tiền công"** —
vì đó đúng là khác biệt làm đổi cách ghi sổ, người dùng phải nhìn thấy được.

## 8. Kiểm thử

| Chốt | Cách |
| --- | --- |
| `debtPaymentPosting` | Hàm thuần: `earned` → thu thật + danh mục của nợ; `lent` và `null` → cờ nợ + danh mục tự gán. Invert-check phải đỏ. |
| `entryShape` | `owed` có `writes: 'debtOnly'`, `txType: null`, `direction: 'in'`; `ORDER.in` chứa nó; số đếm theo `writes` cập nhật. |
| Cổng Lưu | `entryGate`: `owed` không đòi tài khoản; vẫn đòi số tiền + tên người nợ + danh mục thu. |
| `roleSave` | Dạng `owed` gọi `createDebt` **không** kèm `transaction`, có `origin: 'earned'` + `income_category_id`. |
| Báo cáo | `aggregate`: giao dịch thu từ nợ `earned` **có** vào Thu; từ nợ `lent`/`null` thì không. |
| Hàng chip | Đo lại bề rộng `ORDER.in` 4 chip ở 375px (mobile thật, không đoán). |

Không có test render (repo không có hạ tầng đó): chốt cấu trúc đi qua test đọc file
trong `tests/`, đúng nếp `entryStructure.test.ts`.

## 9. Không làm (cố ý)

- **Không** thêm cột Chi/Thu vào `planned_expenses`. Người dùng đã chọn đường danh sách
  Nợ; làm cả hai là hai chỗ cùng nói một khoản rồi lệch nhau.
- **Không** làm dồn tích (ghi thu ngay lúc làm việc, trước khi nhận tiền). Cả app chạy
  cơ sở tiền mặt: thu nhập hiện lên đúng tháng tiền về. Đổi điều đó là đổi ý nghĩa của
  mọi báo cáo đã có.
- **Không** lãi/trả góp cho khoản `earned`. `debts` có `interest_bps` và số kỳ, nhưng
  tiền công không sinh lãi; bày hai ô đó ra là mời nhập một thứ vô nghĩa.
- **Không** cho sửa `origin` sau khi tạo (§3).
