# Cơ cấu danh mục dạng cây (cha → con) + biểu đồ đường

Ngày: 2026-07-24

## Mục tiêu

Ở phần báo cáo, khối "Cơ cấu theo danh mục" hiện đang gộp mọi danh mục (cả cha
lẫn con) thành một danh sách phẳng xếp theo số tiền. Đổi thành:

- Hiển thị **danh mục cha** trước.
- Bấm vào một cha → xổ ra **danh mục con** của nó, kèm **biểu đồ đường** thể hiện
  số tiền của danh mục vừa bấm theo từng tháng.
- Bấm vào một con → biểu đồ đường đổi sang con đó.

Áp dụng cho cả chế độ **Tháng** và **Năm** (cùng dùng `CategoryBreakdownCard`).

## Quyết định thiết kế (đã chốt với người dùng)

1. **Khung thời gian biểu đồ đường:** theo khung đang xem — chế độ Tháng vẽ 6
   tháng gần nhất, chế độ Năm vẽ 12 tháng của năm đó. Khớp với biểu đồ cột sẵn có.
2. **Bấm danh mục con:** con cũng bấm được và có biểu đồ đường riêng.
3. **Giao dịch gán thẳng vào cha** (không thuộc con nào): khi xổ ra, hiện thành một
   dòng **"(trực tiếp)"** trong danh sách con, để tổng các con khớp tổng của cha.
4. **Accordion:** mỗi lúc chỉ mở một cha; bấm cha khác thì cha cũ tự đóng.
5. **Vị trí biểu đồ:** nằm ngay dưới dòng cha vừa bấm, phía trên danh sách con.
   Có tiêu đề ghi rõ đang xem danh mục nào.

## Bối cảnh code hiện tại

- `src/features/reports/aggregate.ts`
  - `categoryBreakdown(txs, kind, currencyOf, base, rates)` → `Breakdown` gồm
    `slices: { categoryId, amount }[]` (đã quy đổi base, xếp giảm dần), `total`,
    `hasForeign`, `hasMissingRate`. Gộp theo `t.category_id` bất kể cha hay con.
  - `monthlySeries(...)` → chuỗi thu/chi theo tháng (nền cho `MonthlyBarsCard`).
- `src/features/reports/CategoryBreakdownCard.tsx`: render `breakdown.slices`
  phẳng, gộp đuôi thành "Khác" khi vượt `MAX_ROWS = 8`, có tab Chi/Thu.
- `src/features/reports/ReportsPage.tsx`: dùng card ở cả Tháng (`breakdown` từ
  `monthTxs`) và Năm (`yearBreakdown` từ `yearTxs`). Đã fetch sẵn `rangeTxs` (6
  tháng, chỉ khi Tháng + Biểu đồ) và `yearTxs` (12 tháng).
- `CategoryRow` có `parent_id: string | null` (null = cha; có giá trị = con 1 cấp).
- `MonthlyBarsCard.tsx`: mẫu dùng Recharts + tooltip theo dark mode qua
  `.recharts-default-tooltip` trong `index.css`.

## Tầng dữ liệu — thêm vào `aggregate.ts`

Hai hàm thuần, không phụ thuộc React, có unit test.

### `groupByParent(slices, categories)`

Biến `CategorySlice[]` (phẳng) thành nhóm theo cha.

```ts
export interface ParentGroup {
  parentId: string       // id danh mục cha (hoặc chính danh mục mồ côi)
  total: number          // base minor: trực tiếp + tổng các con
  direct: number         // base minor: giao dịch gán thẳng vào cha (>= 0)
  children: CategorySlice[] // các con có số tiền > 0, xếp giảm dần
}

export function groupByParent(
  slices: CategorySlice[],
  categories: CategoryRow[],
): ParentGroup[]
```

Quy tắc:
- Với mỗi slice, tra `categories` theo `categoryId`.
  - Nếu tìm thấy và có `parent_id` → cộng vào `children` của cha đó.
  - Nếu tìm thấy và `parent_id == null` → cộng vào `direct` của chính nó (là cha).
  - Nếu **không** tìm thấy danh mục (mồ côi, ví dụ đã xoá) → coi như một cha đứng
    riêng với `direct = amount`, `children = []`.
- Một cha có thể có con nhưng bản thân không có giao dịch trực tiếp → `direct = 0`.
- Một cha có `direct > 0` nhưng không con → `children = []`.
- `total = direct + sum(children.amount)`.
- Trả về danh sách cha xếp theo `total` giảm dần; `children` xếp theo `amount`
  giảm dần.
- Chỉ đưa vào kết quả những cha có `total > 0`.

### `categoryMonthlySeries(txs, months, kind, ids, monthStartDay, currencyOf, base, rates)`

Tổng tiền (đã quy đổi base) theo từng tháng trong `months`, chỉ cho các giao dịch
có `category_id ∈ ids` và `type === kind`.

```ts
export interface CategoryMonthlyPoint { key: MonthKey; amount: number }
export interface CategoryMonthlySeries {
  points: CategoryMonthlyPoint[]
  hasMissingRate: boolean
}

export function categoryMonthlySeries(
  txs: TransactionRow[],
  months: MonthKey[],
  kind: 'expense' | 'income',
  ids: Set<string>,
  monthStartDay: number,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): CategoryMonthlySeries
```

Quy tắc (nhất quán với các hàm khác trong file):
- Bỏ qua giao dịch `is_debt_flow`, `exclude_from_stats`, hoặc không có
  `category_id`, hoặc `type !== kind`, hoặc `category_id ∉ ids`.
- Quy đổi base qua `convertToBase`; thiếu tỷ giá → `hasMissingRate = true`, bỏ qua.
- Gom theo tháng bằng `monthKeyForDate(t.occurred_on, monthStartDay)`.
- Mỗi tháng trong `months` đều có điểm (tháng trống = 0).

Dùng:
- Line của **cha**: `ids = { parentId, ...idCon }` (khớp thanh của cha).
- Line của **con**: `ids = { childId }`.
- Line của dòng **"(trực tiếp)"**: `ids = { parentId }` (chỉ giao dịch gán thẳng cha).

## Nguồn dữ liệu cho biểu đồ đường (không gọi thêm mạng)

`ReportsPage` đã có sẵn dữ liệu nhiều tháng:
- Chế độ **Tháng**: `rangeTxs` (6 tháng) + mảng `sixMonths`.
- Chế độ **Năm**: `yearTxs` (12 tháng) + mảng `twelveMonths`.

`ReportsPage` dựng một callback truyền xuống card:

```ts
lineFor: (ids: string[]) => { points: CategoryMonthlyPoint[]; label: (k: MonthKey) => string }
```

Hoặc đơn giản hơn: truyền xuống card đủ nguyên liệu để tự tính —
`lineTxs`, `lineMonths`, `monthStartDay`, `currencyOf`, `rates`, `base`,
`labelOf` — rồi card gọi `categoryMonthlySeries` khi có danh mục được chọn.
Chọn phương án callback `lineSeries(ids: string[]): CategoryMonthlySeries` +
`lineLabelOf(k)` để card không phải biết về txs/rates (giữ card gọn).

## Giao diện — `CategoryBreakdownCard.tsx`

Props thêm:
- `lineSeries: (ids: string[]) => CategoryMonthlySeries`
- `lineLabelOf: (k: MonthKey) => string`

State nội bộ:
- `openParentId: string | null` — cha đang mở (accordion, mở một cái).
- `selectedId: string | null` — danh mục đang vẽ line (cha hoặc con hoặc
  `${parentId}:direct` cho dòng trực tiếp). Khi mở cha, mặc định `selectedId` = cha.

Cấu trúc render:
1. Header (tiêu đề + tổng + tab Chi/Thu) — giữ nguyên.
2. Danh sách **cha** (từ `groupByParent`), mỗi cha là một nút:
   - thanh %, icon + tên, %, số tiền (như hàng hiện tại).
   - Vẫn gộp đuôi thành "Khác" khi số cha > `MAX_ROWS + 1` (Khác không bấm được,
     không xổ).
3. Ngay dưới cha đang mở:
   - **Biểu đồ đường** của `selectedId` (tiêu đề: "Xu hướng — {tên danh mục}").
   - Danh sách **con** (mỗi con là nút, có thanh % so với tổng của cha) + dòng
     **"(trực tiếp)"** nếu `direct > 0` (cũng là nút chọn để xem line).
4. Bấm cha đang mở lần nữa → đóng (`openParentId = null`).

Tách phần vẽ đường thành component nhỏ `CategoryLineChart` (Recharts
`LineChart`), tái dùng phong cách tooltip/trục/màu như `MonthlyBarsCard`
(một đường, màu theo `kind`: chi = đỏ `#ef4444`, thu = xanh `#16a34a`).

Trạng thái rỗng: nếu không có cha nào → vẫn hiện "Chưa có chi tiêu/thu nhập
trong {periodNoun}" như cũ.

Đổi accordion (Tháng ↔ Năm hoặc đổi tab Chi/Thu): reset `openParentId`,
`selectedId` về null để tránh trỏ vào danh mục không còn trong danh sách.

## Test

`aggregate.test.ts` (đã tồn tại) thêm ca cho:
- `groupByParent`:
  - con gộp vào cha đúng; tổng cha = trực tiếp + tổng con.
  - cha chỉ có trực tiếp (không con); cha chỉ có con (direct = 0).
  - danh mục mồ côi → thành cha riêng.
  - xếp thứ tự cha theo total, con theo amount.
  - bỏ cha có total = 0.
- `categoryMonthlySeries`:
  - gom đúng theo tháng, tháng trống = 0.
  - lọc theo `ids` và `kind`; bỏ `is_debt_flow`/`exclude_from_stats`.
  - `hasMissingRate` khi thiếu tỷ giá.

## Phạm vi (YAGNI)

- Không đổi tầng fetch/hook — dùng lại `rangeTxs`/`yearTxs` đã có.
- Không thêm cấp danh mục sâu hơn 1 (dữ liệu chỉ 1 cấp cha–con).
- Không thêm tuỳ chọn đổi khung thời gian line (cố định theo khung đang xem).
- Không đổi logic gộp "Khác" (giữ ngưỡng `MAX_ROWS`, chỉ chuyển sang áp cho cha).
