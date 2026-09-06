# Gộp "Danh mục" và "Phân loại chi tiêu" thành một trang

Ngày 06/09/2026.

## Vì sao

Hai mục Cài đặt đang sửa **cùng một bảng** `categories`:

| | `/settings/categories` | `/settings/categories/classify` |
|---|---|---|
| Sửa | tên, icon, cha/con, Chi/Thu, **`kind`, `need_level`, `cost_type`** | **`need_level`, `cost_type`** |
| Hình | cây cha/con, kéo–thả, cha thu gọn sẵn | danh sách phẳng, một nhãn mỗi dòng, bảng chọn trồi lên |

Ba cửa cho một câu hỏi. Trang Danh mục còn phải in một dòng cảnh báo dẫn sang trang kia
(`CategoriesPage.tsx:490`) — dấu hiệu hai màn đáng lẽ là một.

Cái **không** được vứt: trang Phân loại là một **dây chuyền** (lọc "chưa xong", "Lưu · mục
kế tiếp →", "Áp cho cả nhóm"). Gộp mà mất mạch bấm liền đó thì gộp xong lại chậm hơn cũ.

## Hình sau khi gộp

Một trang duy nhất `/settings/categories`, một cây.

### 1. Menu Cài đặt còn 7 mục

Bỏ mục "Phân loại chi tiêu" khỏi `SETTINGS_NAV`.

`/settings/categories/classify` **không xoá** — chuyển hướng sang `/settings/categories`,
**giữ nguyên query string** (`?todo=1`, `?ids=a,b,c`). Tám chỗ đang link tới nó không phải
sửa dòng nào:

- `budgets/AxisTargetsCard.tsx:215`, `budgets/PlanningView.tsx:1379` (kèm `?ids=`)
- `categories/CategoriesPage.tsx:498`, `health/weakestAction.ts:226`
- `reports/SpendClassificationCard.tsx:82`, `settings/BudgetMethodSheet.tsx:222`
- `notifications/types.ts:375`

Vào trang qua đường đó thì bộ lọc "Chưa phân loại" bật sẵn (`?todo=1` do PlanningView và
weakestAction gửi), tức người dùng rơi thẳng vào dây chuyền như trước.

### 2. Một dòng, hai vùng bấm

Cây giữ nguyên mọi thứ đang có: cha thu gọn sẵn, kéo–thả cha và con, lưu trữ, "Mở hết".
Thêm **nhãn phân loại bấm được** ở cuối dòng.

- bấm **tên** → form "Sửa danh mục" (danh tính)
- bấm **nhãn** → bảng chọn (ý nghĩa)

Nhãn thay `CostTag` hiện tại. `CostTag` chỉ nói *CỐ ĐỊNH / BIẾN ĐỔI / CHƯA GẮN* — một
trục; nhãn mới dùng `summaryLabel` nên nói cả hai (`Thiết yếu · Cố định`,
`Linh hoạt · Chưa`, `Chưa phân loại`), nhìn một lượt là biết dòng nào còn thiếu.

Dòng **không** có nhãn: danh mục Thu, danh mục dòng chảy, danh mục `kind = 'transfer'` —
xem mục 5.

### 3. Bật bộ lọc = quay lại dây chuyền

Chip "Chưa phân loại · N" ở đầu trang (trạng thái nằm ở URL `?todo=1`, như trang cũ).
Bật thì cây **duỗi phẳng**: chỉ còn dòng chưa xong, cha tự mở, header nhóm mang nút
"Áp cho cả nhóm". Bảng chọn giữ nguyên mạch "Lưu · mục kế tiếp →" / "Bỏ qua".

**Đánh đổi có chủ ý:** khi lọc thì **tắt kéo–thả** — kéo trong một danh sách đã lọc là thả
sai vị trí. Trang Phân loại hiện nay vốn cũng không kéo được, nên không mất gì.

`?ids=` từ mặt lập kế hoạch cũng lọc theo đúng cách đó, kèm dòng "Đang xem N danh mục từ
Ngân sách · Xem tất cả" như trang cũ.

### 4. Form "Sửa danh mục" chỉ còn danh tính

Còn: tên, biểu tượng, danh mục cha, Chi/Thu, bảng emoji, Xoá.

Bỏ khỏi form cả ba khối phân loại — `kind`, `need_level`, `cost_type` — chuyển hết vào
bảng chọn. `kind` đi cùng vì nó là câu hỏi cùng họ, và đặt nó làm **hàng đầu tiên** của
bảng chọn thì chọn "Chuyển tài sản" xong hai trục kia tự ẩn, đúng luật `canClassify` hiện
có.

Thêm danh mục **Chi** mới xong → bảng chọn tự trồi lên ngay, nên không thêm bước nào so
với hiện tại.

**Hệ quả đã cân nhắc:** danh mục Chi **đã lưu trữ** không còn sửa được nhãn (cây không vẽ
nhãn cho dòng đã lưu trữ, `classifiableExpenses` vốn đã loại chúng). Muốn sửa thì Khôi phục
trước. Chấp nhận: nhãn của danh mục đã lưu trữ không được đọc ở bất kỳ báo cáo nào.

### 5. Chữa hai lỗi đếm

`classifiableExpenses` (`leaf.ts:96`) hiện chỉ lọc `type === 'expense' && !is_archived`.
Nó đang đòi phân loại hai nhóm **không bao giờ được đọc**:

- **Danh mục dòng chảy** — *Cho vay, Trả nợ, Điều chỉnh số dư*: giao dịch của chúng luôn
  mang `is_debt_flow` hoặc `exclude_from_stats`, mà `categoryBreakdown`
  (`aggregate.ts:79`) bỏ qua đúng hai cờ đó ngay dòng lọc đầu tiên → slice không bao giờ
  chứa chúng → `classificationBreakdown` không bao giờ đọc `need_level` của chúng.
- **Danh mục `kind = 'transfer'`**: `aggregate.ts:84` loại thẳng khỏi cơ cấu chi.

Ba danh mục dòng chảy Chi là app tự tạo, nên mọi sổ đều có → **ba việc cần làm không tồn
tại**, nằm vĩnh viễn trong con số "chưa phân loại".

Sửa: `classifiableExpenses` loại thêm `isFlowCategory(c)` và `c.kind === 'transfer'`.
Đồng bộ với `costBadge` — hàm đó **đã** không vẽ nhãn cho danh mục dòng chảy, và chú thích
của nó đã ghi đúng lý do ("dựng ra một việc cần làm không tồn tại").

Hai chỗ ăn theo, tự đúng lên mà không phải sửa:

- `reports/MonthView.tsx:412` — số trên thẻ "Phân loại N danh mục" ở Báo cáo.
- bộ đếm "N/M xong" và chip "Chưa phân loại · N" của chính trang này.

## Kiến trúc file

| File | Việc |
|---|---|
| `categories/ClassifySheet.tsx` | **mới** — bảng chọn (kind + 2 trục), tách nguyên khối từ `ClassifyCategoriesPage` |
| `categories/CategoriesPage.tsx` | nhãn bấm được, chip lọc, chế độ duỗi phẳng, bỏ 3 khối phân loại khỏi form |
| `categories/ClassifyCategoriesPage.tsx` | **xoá** |
| `categories/leaf.ts` | `classifiableExpenses` loại flow + transfer |
| `categories/classifyFlow.ts` | giữ nguyên — `summaryLabel`, `isClassified`, `nextTodo` dùng lại y nguyên |
| `categories/costBadge.ts` → `categoryCounts.ts` | `costBadge` VÀ `missingCostCount` đều hết chỗ dùng (dòng cảnh báo nay đếm bằng `isClassified`) → xoá cả hai; file đổi tên theo hàm còn lại |
| `settings/SettingsLayout.tsx` | bỏ 1 mục khỏi `SETTINGS_NAV` |
| `App.tsx` | route classify → `<Navigate>` giữ query string |

`CategoriesPage.tsx` đang 874 dòng. Tách bảng chọn ra file riêng để nó không phình lên
~1.300 — cùng lý do với mọi lần tách khác trong repo: file to thì sửa hay hỏng chỗ khác.

`ClassificationToggle` **giữ nguyên** — `accounts/AccountFormSheet.tsx:417` còn dùng cho
`is_liquid`.

## Kiểm

- `leaf.test.ts` — thêm ca: danh mục dòng chảy và `kind = 'transfer'` không nằm trong
  `classifiableExpenses`.
- `categoryCounts.test.ts` — bỏ phần `costBadge` và `missingCostCount`, giữ `categoryCounts`.
- `classifyFlow.test.ts` — không đổi.
- `npm test` phải xanh, gồm cả `designSystem.test.ts` (`<PageHeader>`, `<SectionTitle>`,
  `<Select>`, `<ActionButton>`, cấm giá trị tuỳ ý).
- `tsc -b` (không phải `tsc --noEmit` — lệnh đó không kiểm gì trong repo này).
- Mở app xem thật: chế độ **Sáng**, cỡ chữ **1,25× ở 375px**, và biểu thức JSX in ra đúng
  giá trị chứ không phải chuỗi `{...}` — ba thứ test nguồn không bắt được.

## Đã sửa thêm khi dựng

Hàng danh mục trên cây VỠ ở 375px cỡ chữ 1,25× — đo được: năm phần tử cố định của hàng
(tay nắm, mũi mở, biểu tượng, Thêm con, Lưu trữ) ăn 294 trên 343px, cụm tên còn **49px**
nên tên bị cắt còn ba chữ cái và dòng "8 danh mục con" xếp thành ba tầng.

**Không phải do bản gộp**: ẩn nhãn mới đi bằng CSS thì cụm tên vẫn 49px. Nhưng nhãn làm nó
lộ ra rõ hơn, và đây đúng là hàng đang vẽ lại, nên sửa luôn: hàng thành `flex-wrap` và cụm
tên có sàn `min-w-24`. Cỡ chữ thường mọi thứ vẫn vừa một dòng; chỉ khi không đủ chỗ thì hai
nút hành động mới rơi xuống tầng dưới.

Cùng lý do, ô gạt Chi/Thu đổi từ `flex-1` trơn sang `flex-1 basis-40`: trong hàng
`flex-wrap`, basis 0 nghĩa là ba control nào cũng "vừa" một dòng rồi ô gạt teo dưới bề rộng
chữ của nó — "Chi Thu" đè lên "Mở hết".
