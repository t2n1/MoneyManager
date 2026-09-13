# Đối chiếu sao kê thẻ, đợt 2 — Rakuten, trang riêng, sửa tại chỗ, nhớ dòng đã xem

Ngày: 2026-09-13 · Nối tiếp [2026-09-10-doi-chieu-sao-ke-the-design.md](2026-09-10-doi-chieu-sao-ke-the-design.md)
(đợt 1, đã lên `master` trọn 7 task). Đợt 1 giữ nguyên mọi quyết định nền: app *nhớ* số hoá
đơn thật trong `card_bills`, chỉ lưu tổng mỗi kỳ, không đẻ dòng bù, không tự sửa giao dịch
khi lưu hoá đơn.

Số đo thật: 28 file `~/Downloads/credit/enavi{YYYYMM}({3737|2565}).csv` (hai thẻ Rakuten),
13 file PayPay, bản sao lưu `so-chi-tieu-backup-2026-09-10.json`.

## 1. Quyết định đã chốt (hội thoại 2026-09-13)

| | |
|---|---|
| Phạm vi | Bốn ý user chọn, làm lần lượt: **(1)** đọc Rakuten enavi, **(2)** bấm dòng lệch là sửa được, **(3)** nhớ dòng đã xem, **(4)** giao diện |
| Hình thức | **Trang riêng** `/assets/account/:accountId/sao-ke`, thay màn trượt `ImportStatementSheet` (gỡ hẳn) |
| Bố cục | Kết hợp B + C: bảng tổng quan mọi kỳ ở trên, kỳ đang chọn hiện **bảng ghép đôi** sổ ↔ thẻ ở dưới. User duyệt trên bản mẫu bằng số thật |
| Hàng "giải thích được" | Nằm **trong** bảng ghép đôi, chữ nghiêng có nhãn, không thu gọn |
| Hai thẻ Rakuten | **Cộng** thành một hoá đơn cho tài khoản "Credit Rakuten", hiện tách từng thẻ |
| Nhớ dòng đã xem | Lưu **trên chính dòng `card_bills`** của kỳ đó (cột jsonb), không bảng mới |
| Ngoài phạm vi | EPOS (chưa có file), PDF Visa (enavi 2565 đã đủ), số dư thẻ, máy tự-trả-thẻ, báo cáo — **không đổi** |

## 2. Ba phát hiện từ dữ liệu thật quyết định thiết kế

Đo ngày 2026-09-13 trên file `enavi202607` và sổ tháng 6/2026 của "Credit Rakuten"
(`463618a9-967e-4727-9d98-29abe4863790`, `statement_day=31`, `payment_due_day=27`).

1. **Hai file một kỳ, code đợt 1 đè mất một.** `dedupeByPeriod` khoá theo `closeISO`, "bản nạp
   sau thắng". Rakuten tháng 7: file 3737 = 165.429, file 2565 = 880. Nạp cả hai thì hoá đơn
   lưu là 880 hoặc 165.429 tuỳ thứ tự file — cả hai đều sai. Phải **gộp theo nguồn**.
   Kiểm chéo: PDF `statement_202607.pdf` ghi "2026年07月ご請求金額 880円 楽天カード（Visa）"
   = Σ cột `7月支払金額` của file 2565. Cột đó là số hoá đơn.
2. **Quẹt thẳng thẻ khớp sổ 15/15; Rakuten Pay thì không khớp dòng nào.** Sao kê ghi
   `楽天キャッシュ　チャージ` (nạp ví) ngày D; sổ ghi từng món ngày D−1. Đo: nạp 2.376 ngày
   22/06 = sổ 21/06 có 1.051 + 1.325. Nạp 1.485 ngày 23/06 = sổ 22/06 (42.165) trừ khoản quẹt
   thẳng 40.680 đã ghép. Luật phải chạy **sau** vòng ghép 1-1 và chỉ trên dòng sổ **chưa ghép**.
   Không phải nạp nào cũng có nhóm khớp (24/06 nạp 1.000, sổ 23/06 chỉ 278): ví Rakuten Cash
   có số dư, nên phần dư là thật, không phải lỗi sổ.
3. **ETC ghi trễ 5 tuần.** `enavi202607` chứa 4 dòng ETC ngày 17/05 (34 dòng ETC trên toàn
   bộ 28 file). Phép ghép đợt 1 lọc rổ sổ theo đúng kỳ và chỉ nhìn kỳ liền kề trong 7 ngày
   ⇒ báo "thẻ có, sổ không" dù sổ có đúng dòng 17/05. Phải ghép **trên cả lô một lượt**.

## 3. Blast radius

- `AccountDetailPage`: consumer duy nhất là route ở [src/App.tsx:194](../../../src/App.tsx:194)
  (`impact` luôn báo 0 cho trang lazy — đã biết). Đổi ở đây: nút "Nạp sao kê" thành
  `navigate(...)`, bỏ state `showImportStatement`, bỏ import `ImportStatementSheet`.
- `reconcileStatement`: caller duy nhất là `ImportStatementSheet` (sẽ gỡ) và test. Chữ ký
  **đổi** sang nhận cả lô (§6). Test đợt 1 (`statementReconcile.test.ts`, 160 dòng) phải
  chuyển sang API mới và **vẫn xanh về mặt kết quả** — bốn luật PayPay không được đổi hành vi.
- `ParsedStatement` (`paypayStatement.ts`): thêm trường `source`. Consumer: `statementNeighbours`,
  sheet (gỡ), test.
- `card_bills`: thêm cột ⇒ migration + `database.types.ts` + `repo.ts` + hai bản repo +
  `backupImport`/`exportTables` + test của chúng. Compiler canh hai bản repo.
- **Không đụng** `cardMonthCharge`, `cardStatementSplit`, `runCardAutopayCatchUp`,
  `src/mcp/` ⇒ **không cần** `bundle:rules` lẫn `bundle:mcp`.
- Design system: trang mới đi qua `<PageHeader>`, `<SectionTitle>`, `<ActionButton>`,
  `<Money>`/`<Num>`, token có tên. `tests/designSystem.test.ts` canh ở mức nguồn; chế độ Sáng
  và cỡ chữ 1,25× phải **mở app xem**.

## 4. Đợt 1 — Đọc Rakuten enavi và gộp hai thẻ

### 4.1 `src/features/assets/statementLine.ts` — kiểu chung tách ra

`StatementLine` và `ParsedStatement` chuyển từ `paypayStatement.ts` sang file này (paypay
re-export để không đổi import cũ). `ParsedStatement` thêm:

```ts
/** Nguồn của bản này trong một tài khoản: đuôi số thẻ lấy từ tên file ("3737", "4342"),
 *  không có thì tên file. Hai bản cùng kỳ KHÁC nguồn thì gộp; CÙNG nguồn thì bản sau thắng. */
source: string
/** Nhãn hiện cho người dùng: "Master 3737", "Visa 2565", "PayPay 4342". */
sourceLabel: string
```

`StatementLine` thêm `kind: 'purchase' | 'adjustment' | 'topup' | 'recalculated' | 'installment-later' | 'investment'`
thay cho `isAdjustment: boolean` (giữ `isAdjustment` là getter tương thích trong đợt này để
diff nhỏ; xoá ở đợt 4 khi dọn). Bộ đọc **gắn nhãn**, phép ghép **đọc nhãn** — luật nhận dạng
theo tên (`チャージ`, `再計算`) dời từ `statementReconcile` về từng bộ đọc, vì mỗi nhà thẻ
viết tên một kiểu: PayPay là `チャージ` trơn, Rakuten là `楽天キャッシュ　チャージ`.

### 4.2 `src/features/assets/rakutenStatement.ts` — bộ đọc enavi

Đầu vào: `text`, `fileName`, `card: {statementDay, paymentDueDay}`. Đầu ra `ParsedStatement | null`.

Bố cục đã xác minh trên 28 file:

```
"利用日","利用店名・商品名","利用者","支払方法","利用金額","手数料/利息","支払総額",
"N月支払金額",["当月請求額",]"M月繰越残高",["N月以降請求額",]"新規サイン"
```

- **Tra cột theo tên, không theo vị trí.** Số cột là 10, 11 hoặc 12 tuỳ file. Cột tiền hoá đơn
  là cột **duy nhất** khớp `/^\d{1,2}月支払金額$/`. Nhận dạng file: header có `利用日`, `利用店名・商品名`,
  `新規サイン` và một cột khớp regex trên — đăng ký vào `FORMATS` của
  [statementFormat.ts](../../../src/features/import/statementFormat.ts) với `id: 'rakuten'`
  để trang nhập CSV giao dịch cũng nhận ra (nó đọc `利用金額` dương = chi, giống PayPay).
- **Tháng hoá đơn** = N trong tên cột. **Năm** = năm của `利用日` muộn nhất trong file; nếu
  N < tháng của ngày đó thì +1 (quẹt tháng 12, hoá đơn tháng 1). Đưa `{year, month}` cho
  `cardBillingRange` của chính thẻ, y như PayPay.
- **Kiểm chéo tên file**: `enavi(\d{4})(\d{2})` nếu khớp mẫu mà lệch với tháng suy ra thì
  `dueDateMismatch = true` (tái dùng cờ chặn lưu của đợt 1; nhãn cảnh báo trên trang nói
  "tên file và nội dung không cùng kỳ"). Không có cột ngày trả nên **không** kiểm `dueISO`.
- **Dòng bỏ qua**: `利用日` rỗng (dòng phụ tuyến ETC), dòng không có số ở cột hoá đơn.
- **`total` = Σ cột `N月支払金額`**. Với trả góp, cột này là nửa của tháng — đúng số Rakuten đòi.
- **Gắn `kind`**:
  - tên (NFKC, bỏ trắng) chứa `楽天キャッシュチャージ` → `topup`, `amount` = cột hoá đơn.
  - `支払方法` khớp `/\((\d+)回目\)/` với số > 1 → `installment-later`. Dòng `(1回目)` →
    `purchase` nhưng `amount` **để ghép** = `利用金額` (giá đầy đủ, vì sổ ghi cả món một lần),
    còn phần vào `total` vẫn là cột hoá đơn. ⇒ `StatementLine` thêm `billed: number` (phần
    vào hoá đơn) tách khỏi `amount` (phần để ghép); PayPay đặt `billed = amount`.
    `total = Σ billed`.
  - tên chứa `楽天証券` → `investment`.
  - còn lại → `purchase`. Không có `adjustment` trong enavi (hoàn tiền là dòng âm thường,
    `amount < 0`, khớp sổ `is_refund` qua `signedAmount` như PayPay).
- `source` = nhóm `\((\d{4})\)` trong tên file; `sourceLabel`: 3737 → "Master 3737",
  2565 → "Visa 2565", khác → "Thẻ ····NNNN". PayPay: 4342 → "PayPay 4342". (Bảng đuôi→tên
  chỉ là nhãn hiển thị; không có trong DB, không cần cài đặt.)

### 4.3 `statementNeighbours.ts` → `statementBatch.ts`

`dedupeByPeriod` đổi luật: khoá `${closeISO}|${source}` để khử trùng file; rồi **gộp** các bản
cùng `closeISO` khác `source` thành một `MergedStatement`:

```ts
interface MergedStatement {
  range: CardBillingRange
  total: number                      // Σ total các nguồn
  parts: { source; sourceLabel; total }[]   // để hiện "Master 165.429 · Visa 880"
  lines: StatementLine[]             // nối, mỗi dòng nhớ source
  dueDateMismatch: boolean           // OR các nguồn
}
```

`billRowsFor` nhận `MergedStatement[]`. `withNeighbours` **bỏ** — §6 ghép toàn cục thay thế.

### 4.4 Bốn luật "giải thích được" mới (trong `statementReconcile`, §6)

| Nhận ra bằng | `cause` | Nhãn |
|---|---|---|
| Dòng thẻ `kind='topup'` ngày D chưa ghép; tồn tại tổ hợp 1–4 dòng sổ **chưa ghép** ngày D−1 (ưu tiên) hoặc D, tổng đúng bằng | `wallet-topup` (dùng lại) | "Nạp ví Rakuten Pay = {n} món sổ ngày {D−1}" |
| Dòng thẻ `kind='installment-later'` | `installment` | "{tên} — trả góp lần {k}, sổ đã ghi cả món" |
| Dòng thẻ `kind='investment'` | `investment` | "{tên} — mua quỹ, theo dõi riêng" |
| Dòng thẻ ngày trước `range.start` ghép được dòng sổ cùng số trong ±4 ngày ở kỳ **bất kỳ** đã nạp | `late-posting` | "{tên} — nhà thẻ ghi trễ, thuộc kỳ {M}" |

Nạp ví **không** tìm được nhóm ⇒ không rải lẻ: gom mọi dòng `topup` chưa ghép của kỳ thành
**một** hàng trong phần cần xem: "Nạp ví Rakuten Pay chưa ghép được ({n} lần, ¥{Σ})", không
có nút Sửa/Thêm (không biết thêm gì), chỉ có Bỏ qua. Lý do: ví có số dư, đây thường không phải
lỗi sổ, nhưng giấu hẳn thì một tháng quên ghi cả tuần Rakuten Pay cũng biến mất.

Bốn luật PayPay giữ nguyên hành vi; `isTopUp`/`isRecalculated` chuyển thành đọc `kind`
(PayPay reader gắn `topup` cho `チャージ`, `recalculated` cho `(再計算)` — thêm `'recalculated'`
vào union `kind`).

### 4.5 Test đợt 1

- `rakutenStatement.test.ts` — fixture nội dòng: header 10 cột và 12 cột cùng ra kết quả;
  cột `N月支払金額` tra theo tên; năm suy đúng ca quẹt 12 → hoá đơn 1; dòng ETC phụ bị bỏ;
  trả góp: `1回目` có `amount = 利用金額`, `billed = nửa`, `2回目` là `installment-later`;
  `楽天キャッシュ　チャージ` → `topup`; `楽天証券` → `investment`; `total = Σ billed`;
  tên file lệch kỳ ⇒ `dueDateMismatch`.
- `statementBatch.test.ts` — hai nguồn cùng kỳ gộp tổng và `parts`; cùng nguồn hai lần chỉ
  tính một; ba nguồn ba kỳ ra ba bản.
- `statementFormat.test.ts` (đã có) — thêm ca nhận `rakuten`.

## 5. Đợt 2 — Trang riêng và sửa tại chỗ

### 5.1 Route và trang

- [src/App.tsx](../../../src/App.tsx): `lazy` + `<Route path="/assets/account/:accountId/sao-ke">`
  đặt ngay dưới route trang thẻ ở `:194`. Không va với `LegacyAccountRedirect` (`/assets/:accountId`,
  `:249`) vì React Router v6 khớp đủ đoạn đường dẫn.
- `src/features/assets/StatementReconcilePage.tsx`: `<PageHeader>` "Đối chiếu sao kê",
  phụ đề tên thẻ, nút quay lại về trang thẻ. Không phải thẻ, hoặc thẻ thiếu ngày chốt/ngày trả
  ⇒ trang hiện đúng câu nhắc khai ngày (tái dùng câu ở `AccountDetailPage:~888`) và ô chọn
  file bị vô hiệu.
- `AccountDetailPage`: nút "Nạp sao kê" → `navigate(\`/assets/account/${id}/sao-ke\`)`.
  Gỡ `ImportStatementSheet.tsx` và state liên quan. Nút "Chỉnh cho khớp" giữ nguyên.

### 5.2 Dữ liệu trên trang

- `useCardBills()` (đã có) ⇒ các kỳ đã lưu của thẻ ⇒ **bảng tổng quan luôn có nội dung**,
  kể cả khi chưa chọn file. Cột "Sổ" của kỳ đã lưu mà chưa nạp file: tính bằng
  `cardMonthCharge` cho kỳ đó nếu giao dịch kỳ đó đã ở trong cửa sổ truy vấn; không thì "—"
  và tình trạng "Đã lưu, chưa nạp file lần này". Không mở rộng cửa sổ truy vấn chỉ để lấp
  cột này — trang này không phải trang báo cáo.
- File đã bóc nằm trong `useState` của trang (không persist). Cửa sổ `useSearchTransactions`
  = `[min(range.start, min(line.iso)) − 0, FAR_FUTURE)`, mở rộng xuống ngày dòng sớm nhất
  vì §2.3 (ETC ghi trễ nằm ngoài kỳ).
- Kỳ đang chọn: `useState<closeISO>`, mặc định là kỳ **muộn nhất còn dòng cần xem**, không có
  thì kỳ muộn nhất.

### 5.3 Bấm dòng lệch

| Hàng | Nút | Mở gì |
|---|---|---|
| Sổ có, thẻ không | **Sửa** | `EditTransactionSheet` với `tx` — đổi tài khoản hoặc xoá đều làm ở đó |
| Thẻ có, sổ không | **Thêm vào sổ** | Sheet mới `AddFromStatementSheet` bọc `TransactionForm` với `initial` là `TransactionRow` giả (`id: ''`, `account_id` = thẻ, `occurred_on` = `line.iso`, `amount` = `|line.amount|`, `note` = tên quán, `type: 'expense'`, `is_refund = line.amount < 0`), `submitLabel: 'Thêm vào sổ'`, `onSubmit` → `useCreateTransaction`. Cách "form điền sẵn bằng row giả" đã là hợp đồng ghi trong chú thích `initialTagIds` của `TransactionForm`. |
| Hoàn tiền thẻ có, sổ không | **Thêm vào sổ** | như trên, `is_refund: true` |
| Giải thích được | không nút | |
| Cụm nạp ví chưa ghép | chỉ **Bỏ qua** | |

Sheet đóng ⇒ `invalidateTransactionData` đã chạy ⇒ `useSearchTransactions` refetch ⇒ phép
ghép chạy lại trên file còn trong bộ nhớ. Không cần nối dây gì thêm.

**Nhắc "Chỉnh số nợ"**: trang giữ `useState<number>` đếm số lần sửa/thêm/xoá thành công trong
phiên; > 0 thì hiện một dòng nhắc dịu (không phải cảnh báo) cạnh nút Lưu: "Đã sửa {n} dòng.
Số dư thẻ đổi theo — nhớ Chỉnh số nợ trên trang thẻ." Lý do ở ghi chú `so-gao-sao-ke-the-master-enavi`:
thẻ này ghim bằng "Điều chỉnh số nợ", thêm chi cũ là nợ đội lên.

## 6. Phép ghép toàn cục — `statementReconcile.ts` đổi chữ ký

```ts
export function reconcileBatch(
  statements: MergedStatement[],      // đã sắp theo closeISO
  ledger: LedgerTx[],                 // MỘT thẻ, phủ [min(range.start, min iso), ∞)
  cardId: string,
): Map<closeISO, ReconcileResult>
```

Thứ tự:

1. **Ghép 1-1 toàn cục**: mọi dòng thẻ (mọi kỳ) × mọi dòng sổ, theo `amount`, ưu tiên lệch
   ngày ít nhất trong ±4 ngày; vòng hai bỏ giới hạn ngày nhưng đòi dòng sổ nằm trong kỳ của
   dòng thẻ. Cặp ghép được **gán về kỳ của dòng thẻ**. Đây là chỗ `late-posting` và `date-edge`
   sinh ra: dòng sổ 30/06 ghép dòng thẻ 03/07 (kỳ 8月) ⇒ kỳ 7月 không còn "sổ thừa", kỳ 8月
   ghi một hàng `date-edge` chữ nghiêng. Không còn phải nhìn "kỳ liền kề" — cả lô là một rổ.
   Gán `cause` cho cặp đã ghép: dòng sổ nằm **trong** kỳ của dòng thẻ ⇒ khớp thường (không
   `cause`); nằm ngoài kỳ nhưng cách ranh giới kỳ ≤ 7 ngày ⇒ `date-edge`; xa hơn ⇒ `late-posting`.
2. **Nạp ví** (§4.4) trên dòng sổ chưa ghép của D−1 rồi D.
3. **`merged-rows`**, **`refund-shifted`**, `installment`, `investment`, `recalculated` như cũ,
   đọc `kind`.
4. Phần còn lại: dòng sổ chưa ghép → `extraInLedger` của kỳ chứa `occurred_on`; dòng thẻ chưa
   ghép → `missingFromLedger` của kỳ file; hoàn tiền/`adjustment` → `refundDiffs`; `topup`
   chưa ghép → `unmatchedTopups: {count, total}` (trường mới trong `ReconcileResult`).

`ReconcileResult` thêm `pairs: { ledger?: LedgerTx; line?: StatementLine; cause?: ExplainedCause }[]`
— chính là bảng ghép đôi của giao diện; `matchedCount`, `extraInLedger`, `missingFromLedger`,
`explained` dẫn xuất từ `pairs` (giữ để test cũ và bảng tổng quan dùng).

Dòng sổ nằm ngoài mọi kỳ đã nạp (vd. tháng 5 khi chỉ nạp 6–8) nhưng ghép được dòng thẻ ghi
trễ ⇒ ghép bình thường. Không ghép được ⇒ **bỏ qua**, không báo — nó không thuộc kỳ nào đang xem.

Test: `statementReconcile.test.ts` viết lại theo `reconcileBatch`; **bốn ca PayPay cũ giữ
nguyên kỳ vọng**; thêm: ETC 17/05 trong file 7月 ghép sổ 17/05 (`late-posting`); nạp ví D−1
hai món; nạp ví không nhóm ⇒ `unmatchedTopups`; `1回目` ghép theo giá đầy đủ; một dòng sổ không
bao giờ ghép hai dòng thẻ ở hai kỳ.

## 7. Đợt 3 — Nhớ dòng đã xem

### 7.1 Migration `0071_card_bills_review.sql`

```sql
alter table public.card_bills
  add column dismissed jsonb not null default '[]'::jsonb,
  add column reviewed  boolean not null default false;
```

`dismissed`: mảng chuỗi khoá dòng. Dòng sổ: `"tx:<uuid>"`. Dòng thẻ: `"stm:<iso>|<amount>|<name NFKC>"`.
Cụm nạp ví: `"topups:<closeISO>"`. Khoá thẻ không có `source` — cùng ngày, cùng tiền, cùng tên
ở hai thẻ là cùng một thứ theo nghĩa người đọc, và trùng như vậy hiếm. Hoàn tiền phía sổ
không có id giao dịch nên dùng khoá riêng `"rtx:<iso>|<amount>|<note>"`. Dòng trùng base key
trong cùng một kỳ (vd ba dòng thẻ cùng ngày/tiền/tên) được đánh số hậu tố `#k` (k ≥ 2, dòng
thứ nhất giữ nguyên) để mỗi dòng có một khoá lưu riêng — xem `keysFor`.

`database.types.ts` cùng commit: `CardBillRow` thêm hai trường; `Insert` cho phép thiếu (default,
vì DB đã có `default '[]'::jsonb` / `default false`); `Update` thêm `dismissed | reviewed`.
`NewCardBill` đòi **đủ** hai trường mới, không optional (khớp §7.2 — repo không đọc-rồi-ghi
nên không có chỗ nào để tự điền thiếu; `Insert` là type của Supabase, khác `NewCardBill`).

### 7.2 Repo

- `upsertCardBills` giữ chữ ký; `on conflict` cập nhật đủ bốn cột `due_date, total, dismissed, reviewed`.
  `NewCardBill` đòi **đủ** hai trường mới (không optional). Việc "giữ dấu cũ khi chỉ lưu tổng"
  là của **feature**: trang luôn có `useCardBills()` trong cache, nên `billRowsFor` nhận thêm
  danh sách bill hiện có và chép `dismissed`/`reviewed` của kỳ trùng vào dòng gửi đi. Repo
  không đọc-rồi-ghi, không `coalesce` — một câu upsert như đợt 1.
- `backupImport`/`exportTables`: hai cột đi theo, test bổ sung ca có/không có cột (sao lưu
  cũ thiếu cột ⇒ mặc định `[]`/`false`).

### 7.3 Hành vi

- Nút **Bỏ qua** trên hàng cần xem / hoàn tiền / cụm nạp ví ⇒ `upsertCardBills([{...bill kỳ đó, dismissed: [...cũ, khoá]}])`
  **ngay**, không đợi "Lưu N kỳ". Kỳ chưa có bill ⇒ bản upsert này tạo bill luôn (total từ
  file). Kỳ `dueDateMismatch` ⇒ nút vô hiệu, cùng lý do chặn lưu.
- Hàng đã bỏ qua nằm cuối bảng ghép đôi, mờ, có nút **Xem lại** (xoá khoá).
- **Bỏ qua hết phần còn lại kỳ này**: một lần cho mọi hàng cần xem + hoàn tiền + cụm nạp ví.
- `reviewed` = `true` khi kỳ có bill và **không còn** hàng nào chưa xử lý (cần xem, hoàn tiền,
  cụm nạp ví đều đã ghép/giải thích/bỏ qua). Tính lại và ghi **mỗi lần** trang upsert kỳ đó
  (bấm Bỏ qua, Xem lại, hoặc Lưu N kỳ). Dấu tự gỡ khi lần nạp sau lại có dòng mới.
- `AccountDetailPage` panel: `bill.reviewed && billGap !== 0` ⇒ nhãn "Lệch — đã xem hết",
  `tone="neutral"`, số vẫn hiện. Chưa reviewed ⇒ như đợt 1 (`tone="warn"`).

## 8. Đợt 4 — Giao diện trang (đã duyệt trên bản mẫu)

Mở [docs/design-system.md](../../design-system.md) trước khi viết: khuôn màn Phần I, tám bước.

**Bảng tổng quan** (một `<table>` trong `<Card>`, cuộn ngang trong chính nó):
`Kỳ · Bị rút · Hoá đơn · Sổ · Lệch · Tình trạng`. Trên < 640px bỏ `Bị rút` và `Sổ`.
Tình trạng: "✓ Đã đối chiếu" (`state-ok`), "{n} cần xem" (`state-warn`), "Đã lưu, chưa nạp file
lần này" (muted), "Khớp hết" (ok, chưa reviewed vì chưa có gì để bỏ qua ⇒ Lưu sẽ set reviewed).
Hàng đang chọn nền `surface-sunken`. Rakuten: dưới số hoá đơn một dòng `text-2xs` "Master 165.429 · Visa 880".

**Khối kỳ đang chọn**: `<SectionTitle>` "{Kỳ} · quẹt {start} – {close} · bị rút {due}"; cụm
segmented "Chỉ dòng lệch | Tất cả {n} cặp" (dùng họ control "chọn 1 trong N" của design system,
không tự viết); thanh tỉ lệ khớp = một `div` hai token màu, không thư viện; hàng chữ nhỏ
"Hoá đơn ¥… · Khớp a/b dòng · Sổ ¥…".

**Bảng ghép đôi**: cột `Sổ | ↔ | Thẻ | nút`. Hàng lệch nền `state-warn-bg`; hàng giải thích được
chữ nghiêng + `<span>` nhãn viền (`tag`), không nút; hàng đã khớp (chỉ khi "Tất cả") mờ; hàng
đã bỏ qua cuối bảng, mờ, nút Xem lại. Mọi tiền qua `<Money>`, mọi đếm qua `<Num>`. Trên
< 640px mỗi cặp là một ô hai dòng (sổ trên, thẻ dưới), nút ở góc phải — `grid` đổi template,
không hai bộ markup.

**Cuối trang**: dòng nhắc Chỉnh số nợ (§5.3) · nút "Bỏ qua hết phần còn lại kỳ này" · `<ActionButton variant="primary">`
"Lưu {n} kỳ".

Kiểm bằng mắt sau khi code (không test nào bắt được): chế độ Sáng, cỡ chữ 1,25× ở 375px, và
không có chuỗi JSX bị biến thành text.

## 9. Trình tự giao

Mỗi đợt một PR-able commit chain, đợt sau chạy được trên đợt trước:

1. Đợt 1: kiểu chung + bộ đọc Rakuten + gộp nguồn + `reconcileBatch` (§4, §6). Màn trượt cũ
   vẫn chạy nhờ adapter mỏng, hoá đơn Rakuten lưu được ngay từ đây.
2. Đợt 2: trang riêng, gỡ sheet, Sửa / Thêm vào sổ (§5).
3. Đợt 3: migration + Bỏ qua + reviewed + panel (§7).
4. Đợt 4: bố cục cuối (§8) và dọn `isAdjustment` tương thích.

Sau mỗi đợt: `npm test`, `tsc -b` (không `--noEmit`), `detect_changes()` trước commit.

## 10. Việc tay còn lại, ngoài code

- Bốn dòng PayPay ghi sai từ đợt 1 (54.250円) vẫn chưa sửa — đợt 2 xong là bấm Sửa ngay trên trang.
- Sau khi sửa hàng loạt dòng Rakuten cũ: bấm **Chỉnh số nợ** trên trang thẻ.
- EPOS: chưa có file sao kê; khi có thì thêm một bộ đọc theo khuôn §4.2.
