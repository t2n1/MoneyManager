# Dựng lại màn Nhập giao dịch — trục `tiền ra · tiền vào · đổi chỗ`

Ngày: 2026-08-19

Nguồn: gói bàn giao `design_handoff_1a_console` (B22–B29) + bản vẽ `So Gao Redesign.dc.html`
lượt `34a`–`34d`, `37a`, `37b`.

> Mọi con số bố cục trong spec này **đo trên bản demo đang chạy** ở `360×780` và `320×780`,
> không lấy từ gói bàn giao. Chỗ nào là phỏng đoán đều ghi rõ. Số tiền trong ví dụ là
> số của bản vẽ, dùng để kiểm độ dài — **không phải dữ liệu đưa vào code**.

## Vấn đề

Màn Nhập có **sáu loại giao dịch chia làm hai hệ**: `Chi · Thu · Chuyển khoản` ở segmented
giữa màn, còn `Trả hộ · Cho vay/Ghi nợ · Gửi về VN` nằm sau nút "Đặc biệt ⌄" portal vào
header ([TransactionForm.tsx:744](../../../src/features/transactions/TransactionForm.tsx#L744)).
Mỗi mục sau dropdown **thay hẳn form**: đổi nhãn ô số tiền, đổi field, ẩn/hiện lưới danh
mục, đổi cả layout nút Lưu.

Và trục cũ vỡ ở hai chỗ: "gửi cho gia đình" xếp vào Chuyển khoản dù tiền **rời khỏi tài
sản**, "mình nợ" xếp vào Chuyển khoản dù số dư **tăng**.

Đo được: form đang **tràn 227px** (nội dung `659px` trong khung cuộn `432px`) trước khi
thêm bất cứ thứ gì.

## Ba chỗ gói bàn giao ghi sai — đã đối chiếu code

Ghi lại để người đọc gói không dựng trùng thứ đã có.

**1 · `family_support` / `own_vn_account` KHÔNG thiếu.** Gói gọi đây là "cờ thật sự phải
thêm" và là "nguyên nhân tài sản ròng đang đếm sai". Không đúng:
[`entryRoles.ts:53`](../../../src/features/transactions/entryRoles.ts#L53) có
`RemitValue.kind: 'expense' | 'transfer'`, bày ra thành segmented `Hỗ trợ gia đình |
Chuyển tài sản`, và [`roleSave.ts:429`](../../../src/features/transactions/roleSave.ts#L429)
ghi hai đường khác nhau thật: `kind:'expense'` → khoản chi vào danh mục "Gửi tiền về VN"
(tài sản ròng **giảm**); `kind:'transfer'` → chuyển khoản JPY→tài khoản VND (**không
giảm**). **Tài sản ròng đang đếm đúng.** Việc còn lại chỉ là bố cục.

**2 · Lãi suất + số kỳ ở Cho vay/Ghi nợ đã có.** `DebtValue.interestPct` /
`termMonths` → `interest_bps` / `term_months`
([`roleSave.ts:419`](../../../src/features/transactions/roleSave.ts#L419)), ghi từ cả form
Nhập lẫn `DebtEditSheet`. Bảng "sắp theo tiền lãi" ở tab Quyết định chạy được ngay.

**3 · Bốn mục B25 đã sửa từ trước.** Tile danh mục cao **58px** (gói ghi 93px) · `NumPad`
đã 4 cột và **đã có phím `000`** · câu "Còn thiếu…" **đã** ghim cạnh nút Lưu chứ không nằm
dưới lưới 13 danh mục, kèm chú thích giải thích ("ghim cạnh nút để không bao giờ bị cuộn
khuất") · nút Lưu không dùng `opacity-40`, đã dùng token.

## Năm quyết định của chủ sổ (2026-08-19)

1. **"Hỗ trợ gia đình" giữ nguyên là chi tiêu, vẫn chịu trần.** `flowCategories.ts` đúng;
   **B15.1 và B23 của gói phải viết lại theo code**, không phải ngược lại. Chi tháng 8 giữ
   ở `¥252,236`. Không thêm cờ exclude, không sửa `reports/aggregate.ts`.
2. **Giữ segmented `Đã chi | Sẽ chi`** trên form Nhập làm đường vào thứ hai cho
   `planned_expenses`.
3. **Bỏ dropdown "Lặp lại"** khỏi form Nhập, thay bằng dòng dẫn sang `RecurringFormSheet`.
4. **Emoji danh mục là dữ liệu người dùng** — giữ, không đổi sang `lucide`.
5. **Đủ 10 dạng**, gồm cả hai dạng trả nợ (xem dưới).

## Vì sao 10 dạng, không 9

Bảng B23 liệt kê chín dạng, tám trong đó map thẳng vào `(type, role)` đã có. Dạng thứ
chín — "Người trả lại" — form Nhập chưa có đường nào; hiện phải đi **Nợ → mở khoản → Ghi
trả** ([`DebtDetailPage.tsx:248`](../../../src/features/debts/DebtDetailPage.tsx#L248)).

Nhưng bảng của gói **thiếu một dạng đối xứng**: nó có "Người trả lại" ở tiền vào mà
**không có "Tôi trả nợ"** ở tiền ra, dù `DebtPaymentSheet` ghi được cả hai chiều
(`txType === 'expense' ? 'Trả nợ' : 'Thu nợ'`). Thêm một chiều mà bỏ chiều kia thì hàng
chip lại vô quy tắc — đúng cái bệnh B23 sinh ra để chữa. Nên: **cả hai, hoặc không cái
nào.** Chủ sổ chọn cả hai.

## `repay` / `collect` — bốn ràng buộc lấy từ `DebtPaymentSheet`

Đây là phần duy nhất của gói phải viết code mới, nên đọc kỹ form đang có trước khi dựng.
`NewDebtPayment` **bọc luôn `transaction` bên trong**
([`DebtPaymentSheet.tsx:80`](../../../src/features/debts/DebtPaymentSheet.tsx#L80)) và một
lần `createPayment.mutateAsync` ra cả hai — **không migration, không bút toán tay.**

Bốn ràng buộc bắt buộc giữ:

1. **Chọn khoản nợ TRƯỚC, chọn tài khoản SAU.** `matchingAccounts` chỉ nhận tài khoản
   **cùng loại tiền với khoản nợ** ("v1 tránh xuyên tệ"). Nên ở hai dạng này danh sách tài
   khoản **phụ thuộc khoản nợ đã chọn** — ngược thứ tự thì picker hiện ví sai rồi phải lọc
   lại dưới chân người dùng. Đây là **dạng duy nhất** có field phụ thuộc nhau, và nó phá
   luật "hai hàng đầu không xê" nếu đặt ô chọn nợ lên trên ô số tiền → đặt nó **dưới** ô số
   tiền, cùng chỗ các field riêng của vai trò hiện nay.
2. **Cần hai hook, không một.** `remainingOf(debt, payments)` đòi cả `useDebts()` **và**
   `useDebtPayments()`. Form Nhập hiện chỉ gọi `useDebts()`.
3. **Giữ công tắc `withTransaction`.** Sheet có lựa chọn "ghi sổ nợ thôi" vs "trừ tiền
   thật"; bỏ nó ở form Nhập là làm đường vào mới **yếu hơn** đường nó nhân bản — đúng cái
   lỗi B28.2 lấy làm lý do bỏ dropdown Lặp.
4. **Số tiền mặc định — phải chốt.** Sheet điền sẵn **toàn bộ số còn lại**
   (`useState(Math.max(remaining, 0))`), còn form Nhập thì ô số tiền nhận focus và **để
   trống**. Hai nếp trái nhau. Spec chọn: **điền sẵn số còn lại khi chọn khoản nợ**, vì trả
   đủ là ca thường và người dùng vẫn gõ đè được — nhưng ghi ra đây vì nó là chỗ hai form dễ
   lệch nhau nhất.

## `37b` không dùng được

`37b` mang dấu "BẢN CHỐT" nhưng mô tả cấu trúc **khác** bảng quy tắc B23: nó đặt **một**
chip "Gửi về VN" dưới **Tiền ra** rồi hỏi tiếp "Tiền này cho ai" bằng hai thẻ radio. Nếu
chip nằm dưới *Tiền ra* mà chọn "Vào tài khoản của tôi ở VN" thì màn đang nói *tiền ra*
trong khi bút toán là *đổi chỗ* — **đúng cái vết B22 mở đầu bằng.**

→ Lấy **cấu trúc của B23** (hai chip ở hai hướng khác nhau). Giữ lại thứ hay nhất của
`37b`: **hai dòng hệ quả** làm chữ phụ trên chip, để lựa chọn tự giải thích.

- `family` → "Tiền cho đi — tính là chi tiêu, vào trần."
- `ownvn` → "Vẫn là tiền của bạn — chỉ đổi đồng tiền."

## `B23.3` sai hai lần — không bỏ ô counterparty

Gói viết: *"Bỏ field 'Chia với ai'. Nhãn `ai` chính là người nợ."* Không làm.

```
roleSave.ts:203  (d.id === v.existingDebtId || (!!counterparty && norm(d.counterparty) === norm(counterparty)))
```

`counterparty` là **khóa nối**: app dùng tên đã chuẩn hóa để tìm khoản nợ đang mở mà
**cộng dồn** vào. Nhãn không có dòng nào trong `debts`, không có `DebtDetailPage`, không
đòi được nợ. Bỏ ô đó là mất đúng cái người dùng cần.

Và `TagPicker` bị ẩn ở vai trò **không phải tùy hứng**: `RoleBase`
([`roleSave.ts:14`](../../../src/features/transactions/roleSave.ts#L14)) **không có
`tag_ids`** — đường ống chưa có. Ẩn đi là lựa chọn thật thà, đúng như chú thích trong code
("thà không hiện còn hơn nhận rồi âm thầm bỏ").

→ **Giữ ô counterparty, đặt tên thật theo từng dạng**: "Ai nợ mình" (`split`) · "Cho ai
vay" (`lend`) · "Vay của ai" (`borrow`). Ở `repay`/`collect` ô đó thành **hộp chọn khoản
nợ đang mở**, không gõ tay.
→ **Sửa bug thật: thêm `tagIds` vào `RoleBase`**, để nhãn chạy được ở cả 10 dạng thay vì
ẩn ở 5 dạng.

## Mô hình — `kind` là state duy nhất, bảng thuần dẫn xuất ra bút toán

Một module thuần `entryShape.ts` giữ bảng 10 dòng. Form **chỉ đọc bảng**, không tự quyết.
`type` / `role` / `roleSeed` thành giá trị **dẫn xuất lúc lưu**, không còn là state.

Hai cột điều khiển hành vi có **giá trị định nghĩa sẵn**, không phải chữ tự do:

- `categoryPicker: 'user' | 'auto' | 'none'` — `user` = lưới danh mục **hiện**, người dùng
  chọn tay · `auto` = app tự gán, lưới **ẩn** · `none` = giao dịch không có danh mục.
- `capBase: 'full' | 'myShare' | 'none'` — cơ sở tính cảnh báo trần: toàn bộ số tiền · chỉ
  phần mình chịu · không cảnh báo.

| `kind` | Hướng | Nhãn chip | `categoryPicker` | `capBase` | Nhãn ô tiền | Dẫn xuất | Đếm vào đâu |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `spend` | ra | Chi thường | `user` (expense) | `full` | Số tiền | `expense` | Chi tiêu |
| `split` | ra | Trả hộ | `user` (expense) | `myShare` | Tổng đã trả | `expense` + `split` | Chi tiêu (phần mình) + khoản phải thu |
| `family` | ra | Gửi gia đình | `auto` ("Gửi tiền về VN") | `full` | Số gửi | `expense` + `remit{kind:'expense'}` | Chi tiêu · tầng gửi về VN |
| `lend` | ra | Cho vay | `auto` ("Cho vay") | `none` | Số tiền gốc | `expense` + `debt{owed_to_me}` | Khoản phải thu |
| `repay` | ra | Tôi trả nợ | `auto` ("Trả nợ") | `none` | Số trả | `createDebtPayment` | Giảm nợ mình nợ |
| `earn` | vào | Thu thường | `user` (income) | `none` | Số tiền | `income` | Thu nhập |
| `collect` | vào | Người trả lại | `auto` ("Thu nợ") | `none` | Số nhận lại | `createDebtPayment` | Giảm khoản phải thu |
| `borrow` | vào | Vay được | `auto` ("Đi vay") | `none` | Số tiền gốc | `income` + `debt{i_owe}` | Nợ · nuôi `debts` |
| `move` | đổi chỗ | Giữa ví của tôi | `none` | `none` | Chuyển đi | `transfer` | Không đâu · phí là một khoản chi |
| `ownvn` | đổi chỗ | Tài khoản tôi ở VN | `none` | `none` | Số gửi | `transfer` + `remit{kind:'transfer'}` | Không đâu · chỉ đổi đồng tiền |

**Không migration nào.** Mười dạng đều dẫn về bút toán đã có.

**Quy tắc duy nhất thay cho ba hành vi cũ:** lưới danh mục hiện **khi và chỉ khi**
`categoryPicker === 'user'`. Cảnh báo trần hiện **khi và chỉ khi** `capBase !== 'none'`.

Hai chỗ spec cố ý lệch gói, cả hai đều ở dòng `family`:

1. **`capBase: 'full'`** — B23 ghi "không trần", chủ sổ chốt **có** (quyết định 1).
2. Vì `family` có `categoryPicker: 'auto'` mà `capBase: 'full'`, nó là **dạng duy nhất**
   cảnh báo trần hiện lên cho một danh mục người dùng **không tự chọn**. B24 viết "cảnh báo
   trần chỉ hiện khi có danh mục" — với `family` thì có danh mục, chỉ là app gán. Câu cảnh
   báo phải **gọi tên danh mục ra** ("Gửi tiền về VN đã vượt trần…") vì người dùng không
   thấy nó ở đâu trên màn. Bốn dạng `auto` còn lại đều `capBase: 'none'` nên không gặp
   chuyện này.

Bốn tên danh mục `auto` của nhóm nợ lấy đúng từ `debtFlowCategoryId(kind, direction)`
([`roleSave.ts:75`](../../../src/features/transactions/roleSave.ts#L75)) — không đặt lại
tên: `disburse`+`owed_to_me` → "Cho vay" · `disburse`+`i_owe` → "Đi vay" ·
`repay`+`owed_to_me` → "Thu nợ" · `repay`+`i_owe` → "Trả nợ". Sắc thái: ở `lend`/`borrow`,
`categoryId` chỉ được gán khi `withTransaction` bật; tắt nó thì **không có giao dịch nào**
nên cũng không có danh mục — `categoryPicker` đọc là `'none'` ở nhánh đó. `entryShape` phải
khai `categoryPicker` là **hàm của `kind` + `withTransaction`**, không phải hằng số cho mọi
dạng.

## Bố cục — số đo thật, không phải số của gói

Đo trên demo ở `360×780`:

| Khối | Gói ghi | **Đo được** |
| --- | --- | --- |
| header | — | **44** |
| segmented (track) | 52 | **48** |
| segmented (một ô) | 44 | **42** ⚠️ |
| ô số tiền | 64 | **67** |
| tile danh mục | 62 | **58** |
| lưới 13 tile · **4 cột** | — | **250** |
| lưới 13 tile · **3 cột** | — | **314** |
| `NumPad` | — | **188** (4 hàng × 44 + 3 gap) |
| hàng nút Lưu | — | **50** |
| ghi chú / hoàn tiền (mỗi hàng) | — | **44** |

**Hai chỗ phải sửa từ bảng này:**

⚠️ **Ô segmented đang 42px, B22 đòi đúng 44px** (control chính của màn, không nằm trong
danh sách miễn trừ vùng chạm). Thiếu 2px.

Nhưng **không sửa size dùng chung**: 42px là size `md` (`px-1 py-2.5`) của
`ui/SegmentedControl.tsx`, và **11 file khác đang dùng** component đó (Tài sản, Đầu tư, Báo
cáo, Sổ, `RecurringFormSheet`, `roleFields`…). Sửa `md` là đổi chiều cao ở cả 11 màn để
chữa một màn. → **Thêm `size: 'lg'` = `py-3`** (12×2 + line-height 20 = 44px), chỉ hàng
hướng của màn Nhập dùng nó. Hàng `Đã chi | Sẽ chi` cũng dùng `lg` (B28 đòi 44px).

⚠️ **B22 đòi lưới 3 cột và tự phá lý lẽ của nó.** Lý do gói nêu: *"13 tile ở mobile là 5
hàng, không ai cuộn hết."* Nhưng **3 cột MỚI là 5 hàng; 4 cột là 4 hàng** — đo được 250px
so với 314px. Đổi sang 3 cột làm cái vấn đề nó viện ra **nặng thêm 64px**. → **Giữ 4 cột.**
Cách chữa thật là **thu lưới còn một hàng**, không phải đổi số cột.

### Hàng danh mục — chỗ ba tài liệu nói ba kiểu

`34a` vẽ **không có lưới nào**, chỉ hàng "Gần đây" + dòng "Danh mục khác, ghi chú, nhãn".
B22 viết "lưới 3 cột và **chỉ hiện hàng chứa mục đang chọn**". B25 viết "bấm tile → mở
danh mục con **tại chỗ**".

Cộng chiều cao mới thấy chỉ có một cách khớp cả ba. Ba khối ghim (header 44 + segmented 50
+ hàng Dạng 71 ở ca xấu nhất) và hai khối đáy (`NumPad` 188 + nút Lưu 50 + dòng "Còn
thiếu" 18) ăn **421px** của 780 → vùng cuộn còn **359px**. Lưới 4 cột một mình đã 250px.

→ **Hàng danh mục = 3 chip "Gần đây" + chip `Khác ⌄`**, cao 42px. Bấm `Khác ⌄` thì lưới
4 cột **bung ra tại chỗ** (inline — B25 cấm modal), tile 58px, badge **số danh mục con**
thay chevron. Chọn xong lưới thu lại, chip vừa chọn nằm luôn ở hàng. Bấm tile có con thì
con bung thành hàng chip tại chỗ.

Hệ quả: dòng gộp còn lại chỉ là **"Ghi chú, nhãn"** — bỏ chữ "Danh mục khác" khỏi nhãn đó,
vì danh mục đã có hàng riêng và một nhãn hứa hai đường vào lại là bệnh cũ. Desktop giữ
nguyên cột phải.

### Ngân sách chiều cao — trước và sau

| | px |
| --- | --- |
| **Vùng cuộn có được** | **359** |
| ô số tiền | 67 |
| hàng danh mục (Gần đây + `Khác ⌄`) | 42 |
| cảnh báo trần danh mục | 44 |
| tài khoản + ngày | 44 |
| ghi chú, nhãn | 44 |
| **cộng** | **241** |
| **còn thừa** | **118** |

Hiện tại: **tràn 227px**. Sau: **thừa 118px** — trong khi *thêm* hàng Dạng. Đây là lý lẽ
mạnh nhất của bố cục này, và nó đo được.

Lưới bung ra thì `241 + 250 = 491` → tràn 132px. Đúng ý: đó là trạng thái tạm, và nó cuộn.

### Thứ tự dọc, giống nhau ở cả 10 dạng

```
segmented   Tiền ra  ·  Tiền vào  ·  Đổi chỗ         ô 44px, track 50px
Dạng        [chip] [chip] [chip] …                   chip 32px, wrap
ô số tiền   ¥ ␣␣␣␣␣␣␣␣ 3,480|                        67px, caret, ¥ mờ trái
──────── từ đây mới đổi theo dạng ────────
danh mục    🍜 Cơm ngoài  🍜 Đi chợ  🚃 Đi lại  Khác ⌄
cảnh báo    ⚠ Ăn uống đã vượt ¥7,327. Lưu là ¥10,807.
tài khoản   Credit Paypay ⌄            18/08
ghi chú     + Ghi chú, nhãn ⌄
──────── ghim đáy ────────
NumPad
Lưu và nhập tiếp  |  Lưu · ¥3,480 vào Cơm ngoài
```

**Hai hàng đầu không bao giờ xê** ở bất kỳ dạng nào. B22 nói "luôn đứng y một chỗ", nên cài
đúng nghĩa chữ: **segmented và hàng Dạng ra khỏi vùng cuộn**, ghim trên cùng như `NumPad` +
nút Lưu ghim đáy. Hiện chúng nằm *trong* vùng cuộn. Ở trạng thái thường không thấy khác
(nội dung 241px < vùng cuộn 359px nên không có gì cuộn cả) — khác chỉ lộ ra lúc lưới danh
mục bung, và đó đúng là lúc hai hàng đó phải còn đứng.

### Bề rộng ở 360px và 320px — đo bằng `scrollWidth`

Hàng chip, font 12px, padding 20px, gap 6px, chỗ có 336px:

| Hướng | Chip | Tổng | Dòng |
| --- | --- | --- | --- |
| Tiền ra | Chi thường 79 · Trả hộ 54 · Gửi gia đình 85 · Cho vay 63 · Tôi trả nợ 71 | **376** | **2** |
| Tiền vào | Thu thường 82 · Người trả lại 86 · Vay được 70 | **250** | 1 |
| Đổi chỗ | Giữa ví của tôi 97 · Tài khoản tôi ở VN 118 | **221** | 1 |

Tiền ra 2 dòng → hàng Dạng cao ~71px ở ca xấu nhất, khớp con số gói kê. **Không rút nhãn**
để ép một dòng.

Mỗi chip **phải** `white-space: nowrap`, hàng chip **phải** `flex-wrap: wrap`. Áp cùng quy
tắc cho mọi dòng meta (ví dụ `🍜 Cơm ngoài · Credit Paypay · 18/08`).

**Trục mới xoá luôn cái vá dưới-340px.** Ở 320px ô segmented rộng 96,7px. Nhãn cũ "Chuyển
khoản" cần **99px** ở font 14px → **thiếu 2,3px**, và nó không tràn ngang mà **xuống dòng,
đẩy ô từ 42px lên 62px**. Gói kê hạ chữ về 11,5px (cần 82,7px) — đúng. Nhưng nhãn mới dài
nhất là "Tiền vào": **79,6px kể cả icon 14px và gap** → vừa ở 320px với font 14px nguyên.
**Không cần hạ cỡ chữ.**

## Cảnh báo ngân sách (B24)

Bỏ dải đỏ `overCount` ở đầu `EntryPage` — nó hiện ở **mọi** dạng, kể cả sáu dạng không
thuộc danh mục nào, và tô đỏ dòng đầu lúc người ta đang ghi một khoản.

Thay bằng cảnh báo về **đúng danh mục vừa chọn**, chỉ hiện sau khi chọn:

> ⚠️ Ăn uống đã vượt trần ¥7,327. Cộng ¥4,200 phần mình chịu thì thành ¥11,527.

Ở `split` con số cộng vào là **phần mình chịu**, không phải tổng đã trả — chưa có hàm nào
tính cái đó, `categoryAlert.ts` là chỗ mới.

Màu: nền `#1c1508` viền `#4a3a12` chữ `#ffd07a` — đo được **12,55:1**, dư sức AA.

## Nút Lưu (B25)

Một layout ở cả 10 dạng: `200px` "Lưu và nhập tiếp" + phần còn lại "Lưu · …" (primary).
Nhãn nhắc lại việc sẽ làm — "Lưu · gửi ¥30,000 cho gia đình", "Lưu · chi ¥4,200 + phải thu
¥8,200". **Khi chưa đủ thì nhãn nói thiếu gì** — `entryValidation.ts` đã tính sẵn chuỗi
đó, chỉ chưa ai đưa lên nút.

**Một bug contrast thật, đã tính lại chứ không tin gói:**

```
src/index.css:291   --accent-muted-fg: #6b8f78;
```

| Cặp màu | Tỷ lệ | AA (16px semibold cần 4,5) |
| --- | --- | --- |
| `#6b8f78` trên `#0d3a1d` — **dark, hiện tại** | **3,55:1** | **trượt** |
| `#7fae8e` trên `#0d3a1d` — dark, đề nghị | **5,09:1** | đạt |
| `green-700 #15803d` trên `green-100 #dcfce7` — **light, hiện tại** | **4,57:1** | đạt, **sát mép** |

Gói chỉ nói dark. Light đạt nhưng dư 0,07 — ghi lại để lần sau đổi token xanh thì biết nó
đang đứng ở đâu. Sửa dark thành `#7fae8e`.

## Ô số tiền (B25)

Cao 67px (đã đủ), nhưng còn thiếu ba thứ: **`¥` mờ tách bên trái** (hiện `¥0` là một chuỗi
đã format, canh phải) · **caret** · **viền focus luôn có**, không chỉ khi `multiAmount`.
Nhận focus **ngay khi mở màn** — desktop đã có `autoFocus`, mobile thì `activeField` mặc
định là `'main'` nên chỉ cần vẽ viền.

## Sẽ chi (`37a`) — khớp `PlannedFormSheet.tsx`, không bịa

Segmented `Đã chi | Sẽ chi` một dòng riêng, ô 44px, nhãn đi theo hướng:

| Hướng | Đã xảy ra | Sẽ xảy ra | Nhãn ngày |
| --- | --- | --- | --- |
| Tiền ra | Đã chi | Sẽ chi | Ngày đến hạn / Tháng dự kiến |
| Tiền vào | Đã thu | Sẽ thu | Dự kiến |
| Đổi chỗ | Đã chuyển | Sẽ chuyển | Dự kiến |

Chữ chính xác, lấy từ form thật: **Chi cái gì** (placeholder "Ví dụ: đóng phí vệ sinh") ·
**Ước tính** *(để trống nếu chưa biết)* + ô chọn loại tiền · **Chắc tới đâu** → `Đúng ngày`
| `Khoảng tháng` · **Nhắc tôi** (ô tick + ô số ngày tự do 0–99, "0 = đúng ngày đến hạn";
tắt → "Không kêu gì cả — chỉ nằm trong danh sách để bạn nhìn") · Danh mục **không bắt
buộc**, dropdown "— Chưa chọn —", chỉ danh mục `expense` chưa lưu trữ · Ghi chú ·
`TagPicker`.

**Mặc định khi thêm mới: "Nhắc tôi" BẬT, 0 ngày** (vì `planned?.remind_days_before !== null`
với `planned = null` cho ra `true`).

**Không có ô tài khoản.** Payload đúng bằng `{title, amount, currency, due_on,
due_precision, remind_days_before, category_id, note, tag_ids}`. Khoản sắp chi chưa trừ
tiền nên chưa cần biết trừ từ đâu; chọn tài khoản là việc của lúc xác nhận đã chi.

**Không có ô Lặp.** Cuối form một dòng *"Khoản này lặp lại? → Tạo quy tắc"* dẫn sang
`RecurringFormSheet`.

Năm hệ quả phải cài đủ: chỉ cần có tên là lưu được (focus vào **ô tên**, không ô số tiền) ·
**không đổi số dư** · **không vào trần**, không vào tổng chi, không vào con số nào của Báo
cáo kỳ này · **không có cờ hoàn tiền** · tới hạn thành việc trên Bản tin **chỉ khi**
`remind_days_before ≠ null`.

Hai ràng buộc DB phải giữ: `'month'` **neo `due_on` về ngày 1** (ép ở client để không nhận
lỗi Postgres từ một ô người dùng không thấy) · `remind_days_before` chỉ nhận 0–99.

`PlannedFormSheet` neo ngày 1 ở **hai chỗ**, không một: trong `onChange` của ô ngày
([dòng 211](../../../src/features/planned/PlannedFormSheet.tsx#L211)) **và** lại lần nữa lúc
submit ([dòng 85](../../../src/features/planned/PlannedFormSheet.tsx#L85), qua
`firstOfMonth`). `PlannedFields` phải làm đủ cả hai — làm một chỗ thì đổi `Đúng ngày` →
`Khoảng tháng` sau khi đã chọn ngày 17 sẽ lọt `due_on` giữa tháng. Ô ngày dùng
`type="month"` nguyên bản của trình duyệt khi `precision === 'month'`, không phải ô chữ.

Ba chuỗi đã chết, không dùng lại: "Khoản sắp tới" · "Tạo lời nhắc · …" · "Tên lời nhắc".
Chữ "nhắc" chỉ xuất hiện ở **đúng một chỗ**: ô tích "Nhắc tôi" và dòng phụ của nó.

## Số VND tự suy (B26)

`useRates()` đã có tỷ giá, chưa ai dùng ở màn này — ba ô `Số gửi · Phí · Số nhận (VND)`
đang để trắng cho người dùng tự nhân tay.

Module thuần `remitDerive.ts`: nhập Số gửi thì suy `≈ ₫4,590,000`, **sửa được** khi bên
nhận báo số thật, in kèm tỷ giá và giờ cập nhật. Hiện rõ hai dòng: trừ khỏi tài khoản
`¥30,800` (số gửi + phí) → bên nhận nhận `≈ ₫4,590,000`. Dùng lại hàm quy đổi của Tài sản —
**không viết lại**.

> **Sửa 2026-08-20 — bản đầu của mục này dạy sai phép tính.** Nó viết "trừ phí còn `¥29,200`
> → `≈ ₫4,467,600`", tức coi ô "Số gửi" là số GỘP. Không phải: quy ước của app là ô đó giữ số
> RÒNG. `roleSave.ts` ghi `const amount = base.amount + v.fee` ("amount = số gửi + phí"), nên
> `base.amount` — cái mà ô "Số gửi" chuyền vào — CHÍNH LÀ số gửi; `remittance/aggregate.ts`
> lấy lại nó bằng `amount − fee`; và bản demo ghi `amount: 30_000`, `remit_fee_jpy: 500`,
> `remit_received_vnd: 29_500 × 166`. Quan hệ chốt: **received = số gửi × rate**, `30.000 ×
> 153 = 4.590.000`. Trừ phí lần nữa lúc suy là trừ HAI LẦN — người nhận hụt đúng `phí ×
> rate`, và ở dạng `ownvn` thì `to_amount: v.received` làm chính ví VND bị ghi thiếu.

Cột phụ thêm dải **12 tháng** để thấy chuỗi đều, cùng dữ liệu với khối "Gửi về VN" ở tab
Dài hạn.

Dữ liệu đã có sẵn: `is_remittance` · `remit_fee_jpy` · `remit_received_vnd`. **B26 chỉ còn
là việc UI.**

## Ba trạng thái bắt buộc

1. **Hàng "Gần đây"** (`34a`) — 3 danh mục dùng nhiều nhất, **một chạm đặt cả nhóm và danh
   mục con**. Module thuần `recentCategories.ts`.
2. **Bàn số riêng** (`34b`) — **đã có** và đã đúng: `NumPad` 4 cột, phím `000`, ghim đáy
   cùng nút Lưu. `34b` muốn nút Lưu nằm *trong* lưới bàn số chiếm 2 hàng; bản đang chạy để
   nó ngay dưới, cùng tác dụng và giữ được cả nút "Lưu và nhập tiếp". **Không đổi.**
3. **Sau khi lưu** (`34c`) — `onContinue` đã ở lại màn, đã giữ tài khoản + ngày, đã có
   Hoàn tác. Còn thiếu: đếm **"3 khoản lượt này"**, danh sách **"Vừa ghi"**, nút **"Xong ·
   về Bản tin"**.

## Ba thứ không chạm

- **`recurring/monthlyLoad.ts`** — bốn quyết định thu hẹp có lý do viết sẵn (chỉ
  `mode:'auto'` · bỏ tạm dừng · bỏ hết hạn · chỉ chi; tuần quy về tháng là **52/12**).
- **`planned/planned.ts`** — `plannedDue` / `groupPlannedByMonth` / `plannedOutlook`.
- **`debts/aggregate.ts`** — `debtSummary` / `remainingOf` / `repaidOf` / `disbursedOf`.

## File

**Mới — sáu module thuần, test không cần render:**

| File | Việc |
| --- | --- |
| `entryShape.ts` + test | bảng 10 dạng; test đọc y như bảng trong spec |
| `recentCategories.ts` + test | 3 danh mục dùng nhiều nhất |
| `categoryAlert.ts` + test | cảnh báo trần theo danh mục, tính **phần mình** |
| `remitDerive.ts` + test | suy VND từ tỷ giá |
| `DirectionTabs.tsx` | segmented hướng + hàng chip Dạng |
| `CategoryRow.tsx` | Gần đây + `Khác ⌄` + lưới bung tại chỗ |
| `PlannedFields.tsx` | Sẽ chi, khớp `PlannedFormSheet` |

**Sửa:**

| File | Việc |
| --- | --- |
| `TransactionForm.tsx` | thay `TYPE_TABS`/`DEBT_TABS`/`REMIT_TABS`/`roleTrigger` bằng `DirectionTabs`; đọc `entryShape`; xóa `REPEAT_*` |
| `EntryPage.tsx` | bỏ dải `overCount`, bỏ `roleSlot`, bỏ `onSubmitRecurring` + `catchUp` |
| `entryValidation.ts` | nhận `kind` thay `(type, role)` |
| `roleSave.ts` | `tagIds` vào `RoleBase`; thêm `saveDebtPayment` cho `repay`/`collect` |
| `entryRoles.ts` | `roleTxType`/`roleAmountLabel`/`roleHidesCategoryGrid` chuyển sang `entryShape` rồi xóa |
| `roleFields.tsx` | nhãn counterparty theo dạng; `RemitFields` dùng `remitDerive` |
| `index.css` | `--accent-muted-fg: #7fae8e` (dark) |
| `ui/SegmentedControl.tsx` | **thêm** `size: 'lg'` = `py-3` (44px); **không sửa** `md` |

`TransactionForm.tsx` đang **66KB / hơn 1400 dòng**. Bảy PR này **rút ròng** ra khỏi nó.

## Bảy PR

| # | Việc | Rủi ro |
| --- | --- | --- |
| 1 | `entryShape.ts` + bảng 10 dạng + test. **Không đổi UI.** | không |
| 2 | B22/B23: hàng hướng + hàng Dạng, bỏ "Đặc biệt", nút Lưu một layout, `tagIds` vào `RoleBase` | **cao — PR gốc** |
| 3 | Hai dạng `repay`/`collect` + `saveDebtPayment` + `useDebtPayments` | vừa — code mới thật, và **dạng duy nhất có field phụ thuộc nhau** |
| 4 | B28: segmented Đã chi/Sẽ chi, bỏ dropdown Lặp → dòng "Tạo quy tắc" | vừa |
| 5 | B24/B25: cảnh báo theo danh mục, hàng Gần đây + `Khác ⌄`, ô số tiền, contrast, ô segmented 44px | vừa |
| 6 | B26: suy VND + dải 12 tháng | thấp |
| 7 | `34c`: đếm khoản lượt này, danh sách "Vừa ghi", nút "Xong · về Bản tin" | thấp |

PR 1 đứng riêng có chủ ý: bảng B23 thành một file test chạy xanh **trước khi** ai chạm vào
JSX. Bảng sai thì sai lúc còn rẻ.

## Mốc test và bán kính vỡ

Chạy `npx vitest run` trước khi sửa gì: **2476 test / 155 file, xanh hết**. Mọi PR phải về
lại con số này hoặc cao hơn.

Đo bán kính của việc đổi `entryValidation` sang nhận `kind`:

| File | Test | Chạm `role` | Nghĩa |
| --- | --- | --- | --- |
| `entryValidation.test.ts` | 27 | 14 | ~nửa file phải viết lại theo `kind` |
| `roleSave.test.ts` | 54 | 2 | gần như không đụng — `saveSplit`/`saveDebtEntry`/`saveRemit` **giữ nguyên**, chỉ `RoleBase` thêm `tagIds` và thêm `saveDebtPayment` |

Chỉ **7 file** import `entryValidation` / `entryRoles`, 5 trong số đó nằm cùng thư mục
`transactions/`. Bán kính đóng — đây là lý do PR 2 dám làm một lượt.

## Kiểm

**Đếm được:**
- Control chọn loại = **1** ở mọi trạng thái.
- Không còn nút nào tên "Đặc biệt"; không còn tab con "Hỗ trợ gia đình / Tài sản của mình".
- Ở 360px ba hướng vừa một hàng không cắt chữ; hàng chip **xuống dòng** chứ không ngắt giữa
  từ.
- Ô segmented đo được **đúng 44px** ở cả 360px và 320px — ở 320px **không nhảy lên 62px**
  (nhãn không xuống dòng), và trang không tràn ngang.
- Vùng cuộn ở 360×780 **không tràn** khi lưới đang thu.

**Hành vi:**
- Bật `Sẽ chi` → số dư **không đổi**, trần **không đổi**, ô hoàn tiền **biến mất**.
- Tắt "Nhắc tôi" → **không** sinh việc nào trên Bản tin.
- Khoản lưu từ form Nhập và khoản lưu từ `PlannedPage` ra **cùng một dòng** trong danh sách
  sắp chi.
- Chọn nhãn ở **cả 10 dạng** → lưu xong đếm được đúng số liên kết (hiện 5 dạng ra 0).
- `repay`/`collect` → `debtSummary().net` đổi đúng chiều, `remainingOf` giảm.
- `family` vẫn vào tổng chi và vẫn chịu trần (quyết định 1) — chi tháng 8 giữ `¥252,236`.

**Cỡ chữ lớn:** bật `--app-font-scale` "Rất lớn" ở 360px → chip không ngắt giữa từ, tiêu đề
không lệch tâm, picker tài khoản không teo còn 36px.
