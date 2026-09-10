# Đối chiếu sao kê thẻ — để số trên app trùng số của nhà thẻ

Ngày: 2026-09-10 · Thẻ đo thật: `Credit Paypay`
(`fc153b57-ca2c-4f9e-8abc-787ffcb9602a`, `statement_day=31`, `payment_due_day=27`).
Nguồn số: 13 file `~/Downloads/credit/Paypay/detail{YYYYMM}(4342).csv` ghép với bản sao lưu
`~/Downloads/so-chi-tieu-backup-2026-09-10.json` (12.250 giao dịch).

## 1. Quyết định đã chốt

| | |
|---|---|
| Mục tiêu | Con số trên panel thẻ **trùng con số app PayPay**, mọi kỳ |
| Hướng | **A** — app *nhớ* số hoá đơn thật, không cố tự tính ra nó |
| Lưu gì | Chỉ **tổng hoá đơn mỗi kỳ**. KHÔNG lưu từng dòng sao kê |
| Đối chiếu | Chạy lúc nạp file, so từng dòng, không cất kết quả |
| Sổ | **Không** đẻ dòng bù tự động. App chỉ ra chỗ sai, người dùng quyết |
| Ngoài phạm vi | Số dư nợ thẻ, máy tự-trả-thẻ, báo cáo chi tiêu — **không đổi** |

User đã chốt cả sáu mục trong hội thoại 2026-09-10, sau khi xem bản mẫu panel bằng số thật
của kỳ 7月.

## 2. Vì sao "dọn dữ liệu cho sạch" KHÔNG đạt mục tiêu

Đây là lý do tồn tại của cả spec này, nên nó đứng trước mọi thứ khác.

Đã so **từng dòng** 8 kỳ (hoá đơn 1–8/2026, ~200 dòng). Kết quả: chỉ **4 dòng là ghi sai
thật**. Phần lệch còn lại đến từ bốn khác biệt **cấu trúc** giữa hai cách đếm, và cả hai
cách đều đúng theo nghĩa riêng của nó:

| Nguyên nhân | Bằng chứng đã đo |
|---|---|
| **Hoàn tiền lệch đúng một kỳ** | Sổ ghi ngày được hoàn; PayPay cấn qua `調整額` ở kỳ TRƯỚC. Ba lần: −961 (sổ 3月/thẻ 2月), −1.165 (sổ 4月/thẻ 3月), −4.207 (sổ 6月/thẻ 5月) |
| **`チャージ` nạp ví PayPay** | Kỳ 2月 thiếu 4.000 (08/01) + 2.000 (26/01). Thẻ tính là khoản quẹt; sổ coi là chuyển tiền giữa hai ví của user |
| **Ranh giới ngày** | Uniqlo 5.060: sổ 30/06, thẻ 03/07 → hai kỳ khác nhau. Google One 2.900 (sổ 30/07) sẽ rơi vào hoá đơn 9月 |
| **TEMU `再計算`** | Kỳ 6月: sổ giữ đủ 6 dòng gốc + hoàn (net −2.881), thẻ gói lại thành một dòng `ＴＥＭＵ（再計算）` 3.476 **không có ngày** |

Nguyên nhân thứ nhất một mình đã bảo đảm hai số **không bao giờ bằng nhau**: tháng nào cũng
có khoản hoàn mới đè lên khoản cũ, nên phần lệch không về 0 dù sổ hoàn hảo.

⇒ App **phải biết số của chính sao kê**. Không có đường nào khác.

### Hệ quả thứ hai: nút "Chỉnh cho khớp" hiện tại là một cái bẫy

`monthAdjustPlan` ([cardMonthCharge.ts:195](../../../src/features/assets/cardMonthCharge.ts:195))
hỏi tổng thật rồi đẻ một khoản bù. Nếu kỳ 7月 user đã bấm nút đó, số trên màn hình khớp app
PayPay ngay — **và hai dòng 23.000 ghi sai bị chôn dưới khoản bù**, danh mục sai, báo cáo sai,
mà tổng thì xanh. Spec này KHÔNG bỏ nút đó, nhưng đặt cạnh nó một đường đi tốt hơn.

## 3. Blast radius (đã đo)

`impact({target:'AccountDetailPage', direction:'upstream'})` báo **0 caller** — đúng như đã
biết: mọi trang đều lazy-load nên `impact` luôn báo 0 cho trang (index còn đang chậm 33 commit).
Số dùng được lấy bằng text search:

- **Consumer thật duy nhất của `AccountDetailPage`:** [src/App.tsx:194](../../../src/App.tsx:194)
  (route `/assets/account/:accountId`, lazy import ở `:30`). Không ai khác import nó.
- **Thêm method vào `Repo`** ([src/data/repo.ts](../../../src/data/repo.ts)) là thay đổi có
  compiler canh: thiếu ở `supabaseRepo` hoặc `demoRepo` là lỗi biên dịch (CLAUDE.md).
- **Không đụng** `cardStatementSplit`, `cardMonthCharge`, `cardBillingRange`,
  `runCardAutopayCatchUp`. Chữ ký giữ nguyên ⇒ **không cần** `npm run bundle:rules`.
- Không đụng `src/mcp/` ⇒ **không cần** `npm run bundle:mcp`.

## 4. Bảng mới — migration `0070_card_statements.sql`

```sql
create table public.card_statements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  close_date date   not null,   -- ngày chốt kỳ = danh tính của kỳ
  due_date   date   not null,   -- ngày bị rút, ĐÃ dời T7/CN
  total      bigint not null,   -- minor units, số hoá đơn nhà thẻ đòi
  created_at timestamptz not null default now(),
  unique (account_id, close_date)
);
```

RLS đúng khuôn `0058_trips.sql`:

```sql
alter table public.card_statements enable row level security;
create policy "own rows" on public.card_statements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**Vì sao khoá theo `close_date` chứ không theo tháng:** `cardBillingRange` đã trả `closeISO`
cho mỗi tháng, nên panel tra một phát là ra. Tháng là khái niệm của màn hình; ngày chốt là
khái niệm của kỳ. Thẻ đổi ngày chốt giữa chừng thì khoá theo tháng sẽ gộp nhầm hai kỳ.

**`total` cho phép âm** (kỳ được hoàn nhiều hơn tiêu). Không `check (total > 0)`.

Đổi schema là đổi hai file (CLAUDE.md): migration + `src/types/database.types.ts` **cùng một
commit**, vì file types viết tay, không codegen.

## 5. Tầng dữ liệu

Đúng khuôn `accountValuations` — đường đi đã có sẵn, chỉ nhân bản:

| File | Thêm gì |
|---|---|
| `src/types/database.types.ts` | `CardStatementRow` + nhánh trong `Database` |
| `src/data/repo.ts` | `getCardStatements(): Promise<CardStatementRow[]>`, `upsertCardStatements(rows: NewCardStatement[]): Promise<CardStatementRow[]>`, với `NewCardStatement = Pick<CardStatementRow, 'account_id' \| 'close_date' \| 'due_date' \| 'total'>` — `user_id` do tầng repo tự điền, feature không truyền |
| `src/data/supabaseRepo.ts` | Hai method thật. Đọc trọn bảng qua `fetchAllPages` |
| `src/data/demoRepo.ts` | Hai method bản demo |
| `src/hooks/queries.ts` | `useCardStatements()` + `useUpsertCardStatements()`, **invalidation nằm ngay cạnh `mutationFn`** |
| `src/data/backupImport.ts` | `cardStatements` vào cả xuất lẫn nhập |

Feature code gọi qua hook, không gọi `repo` trực tiếp.

## 6. Hai module toán thuần

Theo quy ước "toán thuần nằm ngoài React": file `.ts`, không JSX, có unit test.

### `src/features/assets/paypayStatement.ts`

Đọc một file CSV PayPay → `{ dueMonth, dueDateFromFile, total, lines }`.

Bố cục cột đã xác minh trên cả 13 file:

```
0 利用日/キャンセル日  1 利用店名・商品名  2 利用者      3 決済方法  4 支払区分
5 利用金額            6 手数料           7 支払総額    8 当月支払金額
9 翌月以降繰越金額     10 調整額          11 当月お支払日
```

- **`total` = Σcol8 + Σcol10.** Khớp tuyệt đối 8/8 kỳ với số app PayPay. KHÔNG phải Σcol5.
- **Dòng có thu** = `col8 !== ''`. Tương đương dấu `*` ở `col2` (`本人*`) — đúng 100% trên
  13 file, nhưng dùng col8 vì nó là con số, không phải quy ước hiển thị.
- **`調整額`** thành *dòng ảo riêng* mang dấu âm, gắn vào ngày của dòng nó đậu. Đây chính là
  chỗ phép so đầu tiên của tôi làm sai: lọc theo col8 rồi bỏ quên col10 ⇒ báo nhầm "hoàn tiền
  lệch kỳ" cho những khoản thật ra khớp.
- **Dòng không có ngày** (`ＴＥＭＵ（再計算）`) nhận `closeISO` của kỳ.
- Nhận dạng file PayPay: dùng lại `detectStatementFormat`
  ([statementFormat.ts](../../../src/features/import/statementFormat.ts)) — `needles` đã có sẵn.

**Kỳ nào:** chỉ lấy **năm + tháng** của `col11`, rồi đưa cho
`cardBillingRange({monthKey, statementDay, paymentDueDay})` của chính thẻ đó tính `closeISO`
và `dueISO`. KHÔNG đưa thẳng `col11` cho `statementCloseFor`: `col11` là ngày **đã dời** cuối
tuần (`detail202606` ghi 2026/6/29 vì 27/6 rơi Chủ nhật), còn `statementCloseFor` đòi ngày
**chưa dời**.

**Tự kiểm:** `cardBillingRange(...).dueISO` phải bằng `col11`. Lệch ⇒ ngày chốt / ngày trả
khai trong app sai — báo cho user, đừng lưu im lặng.

### `src/features/assets/statementReconcile.ts`

Ghép `lines` với giao dịch trong sổ thuộc kỳ đó → ba nhóm: `matched`, `extraInLedger`,
`missingFromLedger`.

- Ghép 1-1 theo **số tiền**, ưu tiên lệch ngày ít nhất trong ±4 ngày; vòng hai bỏ giới hạn ngày
  nhưng vẫn trong kỳ. Mỗi dòng chỉ ghép một lần.
- Loại khỏi rổ sổ: transfer trả nợ thẻ, và `note === CARD_RECONCILE_NOTE`
  ([reconcile.ts:81](../../../src/features/assets/reconcile.ts:81)) — đúng luật `cardMonthCharge`
  đang dùng, để hai chỗ không nói hai kiểu.
- Hoàn tiền trong sổ là `type='expense'` + `is_refund=true`, **không phải income** — dấu âm suy
  từ `is_refund`.

**Tự nhận ra bốn nguyên nhân cấu trúc** (§2) và xếp chúng sang nhóm "giải thích được", tách
khỏi nhóm "cần xem":

| Nhận ra bằng | Xếp vào |
|---|---|
| Dòng sổ thừa khớp số với một `調整額` ở kỳ **liền kề** | hoàn tiền lệch kỳ |
| Dòng thẻ thiếu tên chứa `チャージ` | nạp ví PayPay |
| Dòng sổ thừa khớp số với dòng thẻ thiếu ở kỳ **liền kề** | lệch ranh giới ngày |
| Dòng thẻ thiếu tên chứa `（再計算）` | TEMU tính lại |

Ba trong bốn luật cần nhìn **kỳ liền kề** ⇒ màn nạp phải cho **chọn nhiều file một lúc**, và
đối chiếu chạy trên cả tập vừa nạp.

## 7. Giao diện

### Panel thẻ — `AccountDetailPage.tsx`

Kỳ **đã có** sao kê (số thật của 7月):

```
Hoá đơn PayPay                  ¥158.429     ← từ card_statements
Bị rút 27/07
────────────────────────────────────────
Sổ tính được                    ¥214.439     ← cardMonthCharge, như hiện nay
Lệch                        +¥56.010  ▸      ← mở bảng đối chiếu
```

Kỳ **chưa có** sao kê: giữ nguyên panel hiện tại, không bịa số.

Ràng buộc giao diện (docs/design-system.md): mọi con số qua `<Money>`; tiêu đề qua
`<SectionTitle>`; nút qua `<ActionButton>`; **không chêm giá trị tuỳ ý** — mọi màu/cỡ/bán kính
phải là token đã đặt tên. Dòng "Lệch" khi ≠ 0 dùng thang cảnh báo `state-warn-*` đã có.

### Nút "Nạp sao kê"

Đặt cạnh "Chỉnh cho khớp" sẵn có. Chọn nhiều file → bảng xem trước:

```
detail202607  →  kỳ 01/06–30/06, bị rút 27/07,  hoá đơn ¥158.429
   Cần bạn xem (4 dòng, 54.250)
      + sổ có, thẻ không:  10/06  ¥23.000  (trống)
      + sổ có, thẻ không:  27/06  ¥23.000  Tiền ks
      + sổ có, thẻ không:  16/06   ¥4.950  (trống)
      − thẻ có, sổ không:  … (nếu có)
   Giải thích được, bỏ qua (2 dòng)
      lệch ranh giới ngày: 30/06 ¥5.060 Quần áo → thẻ ghi 03/07
      TEMU tính lại:       ¥5.148 + ¥732 → sổ ghi gộp ¥5.880
```

Bấm lưu → chỉ ghi `card_statements`. **Không** tự sửa/xoá giao dịch nào.

## 8. Ngoài phạm vi (nói rõ để khỏi hiểu nhầm)

- Số dư nợ thẻ, `cardStatementSplit`, `runCardAutopayCatchUp` — **không đổi**. Chúng vẫn chạy
  trên giao dịch thật.
- Báo cáo chi tiêu, ngân sách, danh mục — **không đổi**.
- Sửa đường nhập CSV giao dịch (`ImportCsvPage`) để đọc `当月支払金額` — **việc riêng**, không
  nằm trong spec này. Nó chỉ chữa cột bên trái từ nay về sau.
- Thẻ khác (Rakuten, EPOS): bảng và tầng dữ liệu dùng chung được ngay; riêng bộ đọc file thì
  spec này chỉ làm PayPay.

## 9. Test

- `paypayStatement.test.ts` — fixture CSV nội dòng (KHÔNG đọc `~/Downloads`): tổng = Σcol8 +
  Σcol10; bỏ dòng không thu; `調整額` thành dòng âm; dòng không ngày nhận `closeISO`; `col11`
  đã dời cuối tuần vẫn ra đúng kỳ.
- `statementReconcile.test.ts` — bốn luật "giải thích được", mỗi luật một ca; ghép 1-1 không
  dùng lại một dòng hai lần; hoàn tiền `is_refund` mang dấu âm.
- `npm test` sẵn có canh design-system và bundle.

Không quên: `tsc -b` (không phải `tsc --noEmit` — lệnh kia xanh giả ở repo này).

## 10. Việc tay còn lại, ngoài code

Bốn dòng ghi sai đã tìm ra, tổng **54.250円**. App sẽ chỉ ra chúng nhưng không tự sửa:

| Kỳ | Ngày | Số tiền | Ghi chú trong sổ |
|---|---|---:|---|
| 7月 | 10/06 | 23.000 | *(trống)* |
| 7月 | 27/06 | 23.000 | Tiền ks |
| 7月 | 16/06 | 4.950 | *(trống)* — sổ có 4 lần, thẻ 3 lần |
| 6月 | 23/05 | 3.300 | *(trống)* |

Cần user xác nhận từng khoản: tiêu thật bằng cách khác (đổi tài khoản), hay ghi trùng (xoá).
