# Thiết kế: Báo cáo theo năm

Ngày: 2026-07-19

## Bối cảnh

Màn Báo cáo (`src/features/reports/ReportsPage.tsx`) hiện chỉ xem theo **tháng**:
- Header điều hướng tháng (◄ Tháng 7/2026 ►).
- 3 tab: **Biểu đồ | Thấu hiểu | Ngân sách** — tất cả theo tháng.

Yêu cầu (mục A trong `docs/backlog-tinh-nang.md`): thêm chế độ xem **cả năm** bên
cạnh báo cáo tháng — tổng thu/chi/số dư, biểu đồ cột 12 tháng, cơ cấu danh mục cả năm.

Tính năng **thuần đọc + UI**: không đổi schema, không đụng repo. Tái dùng các hàm
tổng hợp sẵn có trong `src/features/reports/aggregate.ts` và helper ngày trong
`src/lib/dates.ts`.

---

## Điều hướng

Thêm nút gạt (segmented control) **`Tháng | Năm`** ngay dưới header, phía trên hàng tab.
State mới `period: 'month' | 'year'` (mặc định `'month'`).

- **`period === 'month'`** (như hiện tại):
  - Header = bộ chọn tháng (◄ Tháng 7/2026 ►).
  - Hiện hàng tab Biểu đồ / Thấu hiểu / Ngân sách và nội dung tương ứng.
- **`period === 'year'`**:
  - Header = bộ chọn năm (◄ **Năm 2026** ►), 2 nút lùi/tới đổi năm ±1.
  - **Ẩn hàng tab** (Thấu hiểu & Ngân sách vốn theo tháng, không có nghĩa ở năm).
  - Hiện thẳng nội dung năm (4 thành phần bên dưới).

Toggle Chi/Thu của biểu đồ cơ cấu danh mục (state `kind` đã có) **dùng chung** cho cả
hai chế độ.

## "Năm" = năm tài chính

Năm tôn trọng `month_start_day` (giống tháng). Năm `Y` = 12 "tháng tài chính" liên tiếp
từ `(Y, 1)` đến `(Y, 12)`.

Thêm 2 helper vào `src/lib/dates.ts`:

```ts
/** Khoảng ngày của cả năm tài chính Y: từ đầu tháng (Y,1) tới cuối tháng (Y,12) (end loại trừ). */
export function getYearRange(year: number, monthStartDay = 1): MonthRange {
  const start = getMonthRange({ year, month: 1 }, monthStartDay).start
  const end = getMonthRange({ year, month: 12 }, monthStartDay).end
  return { start, end }
}

/** Nhãn năm hiển thị. */
export function formatYearLabel(year: number): string {
  return `Năm ${year}`
}
```

Lưu ý: `getYearRange` định nghĩa qua `getMonthRange` nên tự động nhất quán với ranh giới
tháng tài chính. `end` là ngày **loại trừ** (giống `MonthRange` hiện có).

## Dữ liệu

State `year: number` (mặc định năm dương lịch của "tháng hiện tại", tức
`monthKeyForDate(today, monthStartDay).year`).

Một lần fetch:
```ts
const yearRange = useMemo(() => getYearRange(year, monthStartDay), [year, monthStartDay])
const { data: yearTxs = [] } = useRangeTransactions(yearRange, !!profile && period === 'year')
```
`enabled` chỉ bật khi ở chế độ Năm để không tải thừa khi xem Tháng. Cả 4 thành phần tính
từ cùng `yearTxs` — **không thêm query mới**.

## Nội dung chế độ Năm

Mảng 12 tháng của năm (dùng cho biểu đồ cột và có thể tái dùng):
```ts
const twelveMonths = useMemo(
  () => Array.from({ length: 12 }, (_, i) => ({ year, month: i + 1 })),
  [year],
)
```

### 1. Thẻ tổng năm (Thu / Chi / Số dư) + TB tháng + tỷ lệ tiết kiệm
- `sumIncomeExpense(yearTxs, currencyOf, base, rates)` → `{ income, expense }`.
- **Thu** = income · **Chi** = expense · **Số dư ròng** = income − expense (có thể âm).
- **Chi TB/tháng** = `Math.round(expense / 12)`.
- **Tỷ lệ tiết kiệm** = `income > 0 ? Math.round((income - expense) / income * 100) : null`
  (hiển thị "—" khi null).
- Định dạng qua `formatMoney` / `formatCompact` như hiện tại; tiền tệ = base.

### 2. Biểu đồ cột 12 tháng
- `monthlySeries(yearTxs, twelveMonths, monthStartDay, currencyOf, base, rates)`.
- Nhãn trục X = số tháng `1..12` (`String(p.key.month)`), khác biểu đồ 6 tháng dùng `M/YY`.
- Tái dùng nguyên `BarChart` (cột thu xanh, chi đỏ) — chỉ đổi nguồn `barData` và nhãn.

### 3. Cơ cấu danh mục cả năm
- `categoryBreakdown(yearTxs, kind, currencyOf, base, rates)` — gom cả 12 tháng.
- Tái dùng nguyên `PieChart` + danh sách chú thích (legend) như chế độ tháng, kèm toggle
  Chi/Thu dùng chung state `kind`.

### 4. Cảnh báo thiếu tỷ giá
- Tái dùng cờ `hasMissingRate` / `hasForeign` từ `sumIncomeExpense`, `monthlySeries`,
  `categoryBreakdown` (đã có sẵn) → hiển thị banner amber như chế độ tháng.

## Phạm vi (YAGNI)

- **Không** cho bấm cột tháng để nhảy về xem tháng đó (giữ gọn, có thể thêm sau).
- **Không** có chế độ Năm cho tab Thấu hiểu / Ngân sách (bản chất theo tháng).
- **Không** thêm biểu đồ mới ngoài 4 thành phần trên.

## Thay đổi mã

1. **`src/lib/dates.ts`**: thêm `getYearRange`, `formatYearLabel`.
2. **`src/features/reports/ReportsPage.tsx`**:
   - State `period`, `year`.
   - Toggle `Tháng | Năm`; header đổi theo `period`; ẩn hàng tab khi Năm.
   - Fetch `yearTxs`; dựng thẻ tổng, biểu đồ cột 12 tháng, cơ cấu danh mục năm.
   - Tách các khối biểu đồ (pie + bar) thành đoạn dùng lại được cho cả tháng/năm nếu
     giúp file gọn; nếu không, giữ nội tuyến nhưng tránh lặp nhiều.

Không đụng `src/data/repo.ts`, migration, hay `aggregate.ts` (chỉ tái dùng).

## Kiểm thử

- **`src/lib/dates.test.ts`**: `getYearRange`
  - `monthStartDay = 1`: `getYearRange(2026, 1)` = `{ start: '2026-01-01', end: '2027-01-01' }`.
  - `monthStartDay = 25`: `getYearRange(2026, 25)` = `{ start: '2026-01-25', end: '2027-01-25' }`.
- Logic tổng hợp (`sumIncomeExpense`, `monthlySeries`, `categoryBreakdown`) đã có test
  trong `aggregate.test.ts` — không cần lặp lại, chỉ đảm bảo dùng đúng tham số.

## Ràng buộc dự án (nhắc lại)

- Tiền lưu minor units (`bigint`), quy đổi base qua `convertToBase`; không dùng float.
- UI tiếng Việt; mobile bottom tab / desktop sidebar (không đổi).
- Màn nặng (Recharts) đã lazy-load ở tầng route — không phát sinh thêm.
- Sau khi làm: `npm run build` + `npm run lint` + `npm test` phải sạch; 1 commit,
  message không dấu.
