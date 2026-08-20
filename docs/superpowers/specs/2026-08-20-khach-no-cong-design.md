# Khách nợ công — nợ phải thu không kèm dòng tiền

**Ngày:** 2026-08-20
**Trạng thái:** thiết kế, chờ duyệt trước khi lập kế hoạch thực thi
**Soát lại:** 2026-08-20 — đối chiếu từng câu với code, ra 8 chỗ bản đầu nói thiếu (§3, §4, §5b, §9)

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

**`src/types/database.types.ts` viết TAY** (đầu file: "Khi schema đổi: cập nhật file này
cùng lúc với migration"). Hai cột mới phải thêm vào `DebtRow` **trong cùng commit** với
0049 — không có bước sinh type tự động nào đỡ cho việc này.

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

Sáu thứ **phải sửa** (bản đầu của spec này chỉ kể hai — soát lại 2026-08-20 ra thêm bốn):

1. **`writes: 'debtOnly'`** là giá trị mới của `EntryShape['writes']`. `roleSave` gọi
   `createDebt` **không truyền `transaction`**, kèm `origin: 'earned'` và
   `income_category_id`. `tests/../entryShape.test.ts` ("tam dang di qua
   createTransaction, hai dang di qua createDebtPayment") phải cập nhật số đếm.
2. **HAI cổng tài khoản, không phải một.**
   - `entryGate` đòi tài khoản cho mọi dạng: `if (!s.hasAccount) return 'Còn thiếu: tài khoản.'`
   - `handleSubmit` đòi lần nữa: `if (!canSave || (!plannedMode && !effectiveAccountId)) return`

   Cả hai phải mở cho dạng này, đọc từ bảng (`shape.writes !== 'debtOnly'`) chứ không
   thêm một cờ song song kiểu `plannedMode`. Sửa một cổng mà quên cổng kia thì nút Lưu
   sáng lên rồi bấm không có gì xảy ra — im lặng, không câu báo nào.
   Kéo theo: **`RoleBase.accountId` đang là `string`** (không nullable). Dạng này không
   có tài khoản nào, nên trường đó phải thành `string | null`.
3. **`counterpartyLabelOf` có `default: undefined`**, và `undefined` nghĩa là "dạng này
   KHÔNG có ô counterparty". Quên thêm `case 'owed'` thì ô "ai nợ bạn" **không hiện**,
   mà TypeScript không báo gì — trong khi `saveVerbOf` (switch không có `default`) thì
   trình biên dịch bắt ngay. Hai switch cùng nhận `EntryKind` mà một cái im một cái nói:
   chỗ im là chỗ phải tự nhớ. Nhãn: `'Ai nợ bạn'`.
4. **`kindMissing`** phải thêm `'owed'` vào nhánh `lend`/`borrow` (đòi tên người nợ).
   Không thêm thì lưu được một khoản nợ không tên — mà tên chính là khóa cộng dồn.
5. **Ô loại tiền riêng.** `saveDebtCore` lấy loại tiền của khoản nợ từ `base.srcCurrency`,
   mà `srcCurrency = activeAccounts.find(a => a.id === effectiveAccountId)?.currency ?? 'JPY'`.
   Không có tài khoản → rơi về **'JPY' đóng cứng**, tức người làm thêm ăn tiền VND sẽ có
   một khoản nợ ghi bằng JPY mà không ai nói gì. Dạng này cần ô chọn loại tiền riêng,
   đúng lối `PlannedFields` đã làm cho ô "Ước tính": select riêng, gieo MỘT lần từ ví mặc
   định rồi không đạp lên lựa chọn của người dùng nữa.
6. **`withTransaction` phải ép `false` và ẩn công tắc.** Nó nghĩa là "có tạo giao dịch
   giải ngân thật" — với dạng này thì không bao giờ. Lưu ý ngược: `categoryPickerOf` đang
   trả `'none'` khi `!withTransaction`, nhưng chỉ cho `lend`/`borrow` (khóa theo kind),
   nên lưới danh mục thu của dạng này KHÔNG bị tắt theo. Ai sửa hàm đó thành khóa theo
   `withTransaction` cho mọi dạng sẽ làm biến mất ô chọn danh mục thu — và cùng lúc phá
   ràng buộc `debts_earned_needs_income_category`, tức lỗi hiện ra ở tầng DB.

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

## 5b. Cộng dồn theo tên — chỗ trộn hai loại nợ

`saveDebtCore` cộng dồn vào khoản nợ đang mở đầu tiên khớp **cùng chiều + cùng loại tiền
+ cùng tên** (`norm(d.counterparty) === norm(counterparty)`).

Với dạng mới, luật đó **làm mất dữ liệu một cách âm thầm**: bạn đang cho "Anh Hai" vay
tiền mặt (khoản nợ `origin = null`), rồi ghi "Anh Hai nợ tiền công" — số tiền công bị
nhập vào đúng khoản cho vay cũ, và vì khoản đó `origin` là `null`, **mọi lần trả sau đó
đều bị đếm là dòng tiền nợ, không vào Thu**. Không có câu báo nào; chỉ là tháng đó thiếu
tiền.

Nên vị từ khớp phải thêm `origin`, và khi `origin = 'earned'` thì thêm cả
`income_category_id`:

```
d.origin === newOrigin && (newOrigin !== 'earned' || d.income_category_id === newCategoryId)
```

Không khớp thì **tạo khoản nợ mới**. Cùng một người có thể có hai dòng (tiền cho vay và
tiền công) và đó là ĐÚNG: hai khoản đó thanh toán theo hai cách khác nhau, gộp lại là nói
sai một trong hai.

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
| Cộng dồn (§5b) | Cùng tên + cùng chiều + cùng tiền nhưng khác `origin` → KHÔNG gộp, tạo khoản mới. Đây là ca lỗi âm thầm, phải có test riêng. |
| Loại tiền | Dạng này không đọc `srcCurrency`: không có ví nào thì khoản nợ vẫn ghi đúng loại tiền người dùng chọn, không rơi về 'JPY'. |
| Hai cổng tài khoản | `entryGate` **và** `handleSubmit` đều cho qua khi không có ví. |
| Hàng chip | Đo lại bề rộng `ORDER.in` 4 chip ở 375px (mobile thật, không đoán). |

Không có test render (repo không có hạ tầng đó): chốt cấu trúc đi qua test đọc file
trong `tests/`, đúng nếp `entryStructure.test.ts`.

## 9. Không làm (cố ý)

- **Không** thêm cột Chi/Thu vào `planned_expenses`. Người dùng đã chọn đường danh sách
  Nợ; làm cả hai là hai chỗ cùng nói một khoản rồi lệch nhau.
- **Không** làm dồn tích (ghi thu ngay lúc làm việc, trước khi nhận tiền). Cả app chạy
  cơ sở tiền mặt: thu nhập hiện lên đúng tháng tiền về. Đổi điều đó là đổi ý nghĩa của
  mọi báo cáo đã có.
- **Không** lãi/trả góp/phí cho khoản `earned`. `debts` có `interest_bps` và số kỳ, và
  `DebtValue` có `fee` — nhưng tiền công không sinh lãi, và `fee` ở đó là **phí giải
  ngân**, mà dạng này không giải ngân gì. Bày ba ô đó ra là mời nhập thứ vô nghĩa.
- **Không** cho sửa `origin` sau khi tạo (§3).
