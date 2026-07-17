# Thiết kế: Tổng thu/chi ở trang Tìm kiếm

Ngày: 2026-07-17

## Mục tiêu

Trang Tìm kiếm hiện chỉ hiện "N kết quả". Thêm một thanh tổng cho biết **tổng thu**
và **tổng chi** của các giao dịch đang khớp bộ lọc, quy đổi về tiền gốc.

## Phạm vi

**Trong phạm vi**
- Tính tổng thu + tổng chi của kết quả lọc, quy đổi về `base_currency`.
- Hiển thị thanh tổng ngay dưới dòng "N kết quả".

**Ngoài phạm vi**
- Không thêm số "chênh lệch" (Thu − Chi) — đã chốt chỉ Thu + Chi.
- Không đụng logic lọc/tìm kiếm hiện có.

## Quyết định thiết kế

1. **Chuyển khoản không tính** vào tổng (nhất quán với `monthlySeries` trong báo cáo).
2. **Ẩn thanh tổng** khi cả Thu = 0 và Chi = 0 → tự ẩn khi lọc toàn chuyển khoản
   hoặc không có kết quả (tránh hiện ¥0 / ¥0 vô nghĩa).
3. **Đa tiền tệ**: quy đổi qua `convertToBase`. Có ngoại tệ → thêm dấu "≈" trước số.
   Thiếu tỷ giá cho giao dịch nào → bỏ qua giao dịch đó + đặt cờ `hasMissingRate`,
   hiển thị dòng nhắc nhỏ (giống trang Báo cáo).

## Chi tiết kỹ thuật

### 1. Hàm thuần — `src/features/reports/aggregate.ts` (tái dùng)

Thêm:

```ts
export interface IncomeExpenseSum {
  /** minor units theo base currency */
  income: number
  expense: number
  hasForeign: boolean
  hasMissingRate: boolean
}

export function sumIncomeExpense(
  txs: TransactionRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): IncomeExpenseSum
```

- Duyệt `txs`: `type === 'transfer'` → bỏ qua.
- `cur = currencyOf(t.account_id)`; `cur !== base` → `hasForeign = true`.
- `v = convertToBase(t.amount, cur, base, rates)`; `null` → `hasMissingRate = true`, bỏ qua.
- Cộng `v` vào `income` hoặc `expense` theo `t.type`.

Đặt cùng file với `categoryBreakdown`/`monthlySeries` vì cùng nhóm tổng hợp báo cáo.

### 2. Unit test — `src/features/reports/aggregate.test.ts`

- Thu + chi cùng tiền gốc → tổng đúng, `hasForeign=false`, `hasMissingRate=false`.
- Có giao dịch ngoại tệ (có tỷ giá) → quy đổi đúng, `hasForeign=true`.
- Ngoại tệ thiếu tỷ giá → giao dịch đó bị bỏ, `hasMissingRate=true`.
- Có chuyển khoản trong danh sách → không ảnh hưởng income/expense.

### 3. Giao diện — `src/features/transactions/SearchPage.tsx`

- `useRates()` đã cho `base` và `rates`; `accounts` đã có. Dựng `currencyOf` trả
  `accounts.find(a => a.id === id)?.currency ?? base` (fallback base nếu không thấy,
  giống ReportsPage) và tính:
  ```ts
  const totals = useMemo(
    () => sumIncomeExpense(results, currencyOf, base, rates ?? {}),
    [results, accounts, base, rates],
  )
  ```
- Dưới dòng "N kết quả": nếu `totals.income > 0 || totals.expense > 0` thì hiện thanh:
  - "Thu" + số (xanh, `text-green-600`), "Chi" + số (đỏ, `text-red-600`),
    `formatMoney(_, base)`, thêm "≈" khi `totals.hasForeign`.
  - Nếu `totals.hasMissingRate`: dòng nhắc nhỏ màu hổ phách
    "Một phần ngoại tệ chưa quy đổi được (đang chờ tỷ giá)".
- Kiểu dáng theo các thẻ sẵn có (nền trắng, bo góc, shadow-sm).

## Rủi ro

Thấp. Chỉ thêm hiển thị dựa trên dữ liệu đã tải; không sửa dữ liệu, không đổi query.
