# Chi chưa ghi sổ — thiết kế

> **Ngày:** 2026-09-05 · **Trạng thái:** chờ duyệt · **Khảo sát:**
> [notes/2026-09-05-chi-chua-ghi-so-khao-sat.md](../notes/2026-09-05-chi-chua-ghi-so-khao-sat.md)

## 1. Vấn đề

Tổng **Chi** của tháng đang là **sàn, không phải tổng**. Số dư thì đúng.

Đường đi làm nó lệch:

1. Người dùng đếm tiền trong ví, bấm **Điều chỉnh số dư**, gõ số thật.
2. [reconcilePlan()](../../../src/features/assets/reconcile.ts) lấy chênh lệch, sinh một giao dịch bù.
3. Giao dịch bù mang `exclude_from_stats: true`
   ([ReconcileSheet.tsx:111](../../../src/features/assets/ReconcileSheet.tsx:111)) và danh mục
   `'Điều chỉnh số dư'` — thuộc `CategoryKind = 'transfer'`, mà định nghĩa của loại đó là
   *"tiền vẫn của mình, chỉ đứng ở chỗ khác"*
   ([database.types.ts:19](../../../src/types/database.types.ts:19)).

Với ví tiền mặt, câu ở bước 3 **sai**. Tiền không đứng ở chỗ khác — nó đã tiêu, chỉ là không ai
ghi lại. Hệ quả: tháng nào quên ghi nhiều thì tháng đó trông rẻ, và Ngân sách còn báo "chưa vượt
hạn mức" trong khi ví đã cạn.

Phần hụt bị giấu kỹ tới mức chính MCP server cũng không thấy: truy vấn mọi khoản
`'Điều chỉnh số dư'` trong 12 tháng trả về **rỗng**, vì `exclude_from_stats` lọc chúng ra trước.

## 2. Quyết định đã chốt với người dùng

| # | Quyết định |
|---|-----------|
| 1 | Phần hụt **cộng vào tổng Chi**, và hiện thành **một dòng riêng** trong bảng danh mục (cách C). Lý do: nó kéo bảng **gần** khớp tổng hơn, và đặt con số không-biết vào đúng chỗ mắt so được với các khoản thật. Xem đính chính ở §2b. |
| 2 | Ngân sách: phán quyết **giữ nguyên phạm vi cũ**; phần chưa ghi đứng thành **một dòng cảnh báo riêng bên cạnh**. Xem §5.3 — bản chốt đầu tiên ("ăn vào hạn mức tổng") dựa trên một giả định sai và đã bị bác. |
| 3 | Bù trên **thẻ tín dụng: loại**. Đó là lệch sao kê, không phải tiền mặt quên ghi — khoản quẹt thẻ vốn đã vào sổ qua import. |
| 4 | Chiều **thu** (đếm ra nhiều hơn sổ = ghi thừa một khoản chi): **đối xứng**. Bù trừ trong tháng; dư ra thì dòng đổi tên `Ghi thừa` và **trừ** vào tổng, không làm tròn về 0. |
| 5 | Không đổi schema. |

### 2b. Hai đính chính sau khi đọc code

Cả hai đều phát hiện lúc viết kế hoạch thi công, sau khi bản chốt đầu tiên đã xong. Ghi lại
nguyên văn thay vì sửa lặng lẽ, vì bản sai đã được dùng để quyết định.

**Đính chính 1 — "bảng danh mục cộng lại đúng bằng tổng Chi" là SAI.**
Tính chất đó hiện không tồn tại. Chú thích ở
[MonthCategoryTable.tsx:47](../../../src/features/reports/MonthCategoryTable.tsx:47) nói rõ tổng
chân bảng là *"tổng THẬT (gồm cả khoản không có danh mục), không phải tổng của mấy dòng trên"*.
Cách C vẫn đúng, nhưng vì lý do khác: thêm dòng này kéo bảng **gần** khớp tổng hơn trước, chứ
không phải giữ một tính chất đã có.

**Đính chính 2 — không có "hạn mức TỔNG của tháng".**
`totalBudgeted` chỉ là tổng các trần người dùng đã đặt, và
[budgetVerdict.ts:8](../../../src/features/reports/budgetVerdict.ts:8) **cố ý** so nó chỉ với chi
của chính các mục đó, kèm hậu quả đã ghi sẵn: *"ai mới đặt vài hạn mức cũng thấy 'vượt' khổng lồ,
rồi thôi tin cả thẻ"*. Phần "Chưa ghi rõ" không thuộc danh mục nào nên trộn vào phán quyết chính
là lỗi lệch phạm vi mà đoạn code đó được viết ra để chặn. Bản chốt mới ở §5.3.

## 3. Kiến trúc: đầu vào riêng, không sửa hàm dùng chung

### Vì sao không sửa thẳng `sumIncomeExpense` / `categoryBreakdown`

Đo bằng tìm chữ (**không** dùng GitNexus — xem §7):

- `sumIncomeExpense` — **11 file** gọi
- `categoryBreakdown` — **15 file** gọi

Trải trên `features/budgets`, `features/notifications`, `features/reports`,
`features/transactions`, và **`src/mcp/tools/`**.

Sửa thẳng hai hàm này sẽ đổi lặng lẽ cả những chỗ ta KHÔNG muốn đổi: mục tiêu trục ngân sách
(`axisTargets`), độ vừa phương pháp (`useMethodFit`), luật thông báo nhịp chi (`rhythmRules`), và
câu trả lời của MCP server — kéo theo phải chạy lại `npm run bundle:mcp` cho bundle đã commit
`api/mcp.mjs`.

**Thay vào đó:** phần "chưa ghi rõ" là một đầu vào RIÊNG. Chỉ ba chỗ đã chốt mới đọc nó. 19 chỗ
còn lại giữ nguyên hành vi cũ. Mỗi màn hình đổi số là do ta cố ý cho nó đổi.

### Điều làm thiết kế này rẻ

`exclude_from_stats` **không** bị lọc lúc lấy dữ liệu. `repo.listTransactions(range)` trả về đủ
mọi dòng trong khoảng ([queries.ts:186](../../../src/hooks/queries.ts:186)); việc lọc nằm bên
trong từng hàm tính ([aggregate.ts:73](../../../src/features/reports/aggregate.ts:73), và các
dòng 179, 274, 320, 382, 438, 486).

Nên các khoản bù **đã nằm sẵn trong mảng giao dịch mà màn Báo cáo đang cầm**. Module mới nhận
đúng mảng đó:

- không sửa `repo` · không sửa `queries.ts` · không thêm truy vấn · không đổi schema · không đụng MCP.

## 4. Module mới: `src/features/reports/chiChuaGhi.ts`

Toán thuần, không JSX, có unit test — đúng quy ước "toán thuần nằm ngoài React" trong `CLAUDE.md`.

```ts
export interface ChiChuaGhi {
  /** Ròng, quy về tiền tệ gốc. Dương = tiêu mà chưa ghi. Âm = đã ghi thừa. */
  net: number
  /** 'chua_ghi' khi net > 0 · 'ghi_thua' khi net < 0 · null khi net === 0 */
  huong: 'chua_ghi' | 'ghi_thua' | null
  /** Số lần đối chiếu đã gộp vào con số này. 0 = tháng không đối chiếu lần nào. */
  soLanDoiChieu: number
  /** true = có khoản bù bị bỏ vì thiếu tỷ giá. UI phải hiện `≈`. */
  hasMissingRate: boolean
  /** Ngày đối chiếu gần nhất trong tháng, ISO. null = không có lần nào. */
  lanCuoiISO: string | null
}
```

### Nhận ra khoản bù

Một dòng được tính khi thoả **tất cả**:

1. `exclude_from_stats === true`
2. danh mục của nó có `name === ADJUST_CATEGORY_NAME` (tra qua `category_id`)
3. tài khoản thuộc **danh sách cho phép**: `'cash' | 'bank' | 'ic' | 'ewallet'`

Điều kiện 3 dùng **danh sách cho phép, không phải danh sách loại trừ**. Nó loại thẻ tín dụng
(quyết định 3) và loại luôn `'investment'` / `'fixed'` — biến động giá trị ở đó không phải tiêu
tiền. Dùng `account.type` chứ không dùng `note === CARD_RECONCILE_NOTE`: kiểu tài khoản là dữ
liệu có cấu trúc, chuỗi ghi chú thì người dùng sửa được.

### Cộng lại

- Dòng `type === 'expense'` → **+** `amount`
- Dòng `type === 'income'` → **−** `amount`
- Quy về tiền tệ gốc bằng [`convertToBase`](../../../src/lib/rates.ts:98). Trả `null` (thiếu tỷ
  giá) → **loại dòng đó ra và bật `hasMissingRate`**, không bao giờ quy 1:1. Đây là quy ước toàn
  repo, 69 file đang theo.

## 5. Ba chỗ tiêu thụ

### 5.1 Tổng Chi ở Báo cáo tháng

`monthReport.ts` cộng `net` vào tổng chi trước khi dựng `outflowTiers`. Phần "để lại" tự giảm
tương ứng — đó là điểm chính: tiền đã ra khỏi ví thì không còn là tiền để lại.

### 5.2 Dòng trong bảng danh mục

`MonthCategoryTable.tsx` nhận thêm **một prop riêng**, KHÔNG phải một phần tử nhét vào mảng
`rows`. Lý do: `MonthTableRow` bắt buộc có `deltaPct`, `spark`, `budgeted`, `fixed` — dòng giả
sẽ khiến cột Δ in ra "mới" và cột Hạn mức in ra một trạng thái không có thật. Prop riêng cũng
chính là thứ thoả yêu cầu "phải nhìn ra ngay là nó khác các dòng kia" ở cuối mục này.

Dòng chèn vào đúng vị trí theo **trị tuyệt đối** của số tiền khi bảng đang sắp theo tiền — dòng
`Ghi thừa` mang số âm, xếp theo số có dấu sẽ đẩy nó xuống đáy bảng trong khi độ lớn của nó mới là
thứ đáng chú ý. Khi bảng sắp theo tên hoặc theo Δ, dòng này đứng **cuối cùng**: nó không có tên
để so và không có Δ để so.

Nhãn:

- `huong === 'chua_ghi'` → **Chưa ghi rõ**
- `huong === 'ghi_thua'` → **Ghi thừa** (số âm)
- `huong === null` hoặc `soLanDoiChieu === 0` → **không hiện dòng nào**

Dòng này **không bấm vào được** như danh mục thật (không có trang chi tiết để mở), nhưng phải
mang một dấu hiệu nhìn ra ngay là nó khác các dòng kia — nó là phần *không biết*, không phải một
danh mục.

### 5.3 Dòng cảnh báo cạnh phán quyết ngân sách

`pickBudgetVerdict` và `MonthPace` **không đổi một dòng nào**. Phần chưa ghi đứng riêng, ngay
dưới câu phán:

> Với đà này sẽ vượt trần ¥4.000 *(tính trên 6 mục có hạn mức)*
> ⚠ Ngoài ra ¥18.000 chưa rõ tiêu vào đâu — không nằm trong phán quyết trên

Vế *"không nằm trong phán quyết trên"* là bắt buộc, không phải chữ trang trí: thiếu nó thì người
đọc tự cộng hai số và tưởng mình vượt ¥22.000.

Dòng này hiện **kể cả khi phán quyết là `unset` hoặc `null`** — chưa đặt hạn mức nào không có
nghĩa là không cần biết ví đang hụt. Nó **không** hiện khi `soLanDoiChieu === 0`.

## 6. Các ca biên phải xử đúng

| Ca | Xử lý |
|----|-------|
| **Tháng không đối chiếu lần nào** (`soLanDoiChieu === 0`) | Không hiện dòng nào, không đổi tổng. Tuyệt đối không hiện "¥0 chưa ghi" — đó là *không biết*, không phải *bằng không*. |
| **Khoảng chưa kiểm** | Đối chiếu lần cuối ngày 20 thì ngày 21–31 chưa ai kiểm. Con số này **tự nó cũng là sàn**. UI không được ngụ ý nó đã đủ; dùng `lanCuoiISO` để nói rõ đã kiểm tới đâu. |
| **Ngày quy thuộc tháng nào** | Tính theo ngày của dòng bù. Tiền có thể đã tiêu rải rác từ tháng trước, nhưng **không rải số ra**: rải là bịa dữ liệu không ai đo được. Đây là hạn chế đã biết, ghi ra để sau này không ai tưởng là lỗi. |
| **Thiếu tỷ giá** | Loại dòng đó, bật `hasMissingRate`, UI hiện `≈`. Không quy 1:1. |
| **Nhiều ví cùng đối chiếu trong tháng** | Cộng dồn tất cả thành một con số ròng. |
| **`net === 0`** | Không hiện dòng (đối chiếu khớp chằn chặn là tin tốt, không phải thông tin cần chỗ trên bảng). |

## 7. Ghi chú về GitNexus

`impact()` trả `impactedCount: 0` cho **cả hai** hàm — sai. Index cũ 5 commit, FTS extension
không nạp được nên tìm theo từ khoá hỏng. Chính tool tự đánh dấu `epistemic: "lower-bound"` và
`riskNote` bảo *"confirm with a text search before treating the change as safe"*.

Con số 11 và 15 file trong §3 là từ tìm chữ. **Ai sửa mục này về sau: chạy lại
`node .gitnexus/run.cjs analyze` trước khi tin `impact()`.**

## 8. Ngoài phạm vi

- Không nhắc người dùng đi đối chiếu (Bản tin đã có khối "Độ tin cậy dữ liệu" làm việc đó).
- Không đoán phần hụt tiêu vào danh mục nào.
- Không đụng thẻ tín dụng, đầu tư, tài sản cố định.
- Không đổi cách MCP trả lời — mục này cố ý không chạm vào `src/mcp/`.

## 9. Kiểm thử

Unit test cho `chiChuaGhi.ts` (thuần, không cần render):

- ví tiền mặt, một lần bù chiều chi → `net > 0`, `huong === 'chua_ghi'`
- một lần bù chiều thu → `net < 0`, `huong === 'ghi_thua'`
- hai lần ngược chiều trong tháng → bù trừ đúng
- bù trên thẻ tín dụng → bị loại, `soLanDoiChieu === 0`
- bù trên tài khoản đầu tư → bị loại
- dòng `exclude_from_stats` nhưng danh mục khác (hoàn tiền, dòng neo phiếu lương) → **không** tính
- thiếu tỷ giá → dòng bị loại, `hasMissingRate === true`
- tháng trống → `net === 0`, `soLanDoiChieu === 0`, `huong === null`

Test cho dòng cảnh báo ngân sách (§5.3): hiện khi `soLanDoiChieu > 0` kể cả lúc phán quyết là
`unset`/`null`; **không** hiện khi `soLanDoiChieu === 0`. Và một phép thử canh bất biến: giá trị
`totalBudgeted` cùng kết quả `pickBudgetVerdict` **không đổi** trước và sau khi có phần chưa ghi —
đây là bất biến §2b đính chính 2 tồn tại để bảo vệ.

Sau khi code: `npm run build` (`tsc -b` — **không** dùng `tsc --noEmit`, lệnh đó không kiểm gì ở
repo này), `npm test`, `npm run lint`. Và **mở app xem mắt** — guardrail nguồn không bắt được chế
độ Sáng, cỡ chữ 1,25× ở 375px, và biểu thức JSX bị biến thành chuỗi.
