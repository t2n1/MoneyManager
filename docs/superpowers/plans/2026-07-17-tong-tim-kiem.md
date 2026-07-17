# Tổng thu/chi ở trang Tìm kiếm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiện tổng thu + tổng chi (quy đổi tiền gốc) của kết quả lọc trên trang Tìm kiếm.

**Architecture:** Thêm một hàm thuần `sumIncomeExpense` vào `aggregate.ts` (tái dùng file tổng hợp báo cáo, có unit test), rồi gọi trong `SearchPage.tsx` để hiện thanh tổng dưới dòng "N kết quả".

**Tech Stack:** React 19, TanStack Query, TypeScript, Tailwind, Vitest.

## Global Constraints

- Chuyển khoản (`type === 'transfer'`) KHÔNG tính vào tổng.
- Quy đổi mọi số tiền về `base_currency` qua `convertToBase`; thiếu tỷ giá → bỏ giao dịch đó + đặt `hasMissingRate = true`.
- Ẩn thanh tổng khi cả `income === 0` và `expense === 0`.
- Có ngoại tệ (`hasForeign`) → thêm tiền tố "≈" trước số.
- Text tiếng Việt; kiểu dáng theo các thẻ sẵn có (nền trắng, bo góc, `shadow-sm`).

---

### Task 1: Hàm thuần `sumIncomeExpense` + test

**Files:**
- Modify: `src/features/reports/aggregate.ts` (thêm interface + hàm cuối file)
- Test: `src/features/reports/aggregate.test.ts` (thêm describe mới)

**Interfaces:**
- Consumes: `CurrencyOf`, `convertToBase`, `Rates`, `CurrencyCode`, `TransactionRow` — đều đã import/khai báo sẵn trong `aggregate.ts`.
- Produces:
  ```ts
  export interface IncomeExpenseSum {
    income: number   // minor units base
    expense: number  // minor units base
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

- [ ] **Step 1: Viết test thất bại**

Thêm `sumIncomeExpense` vào dòng import từ `'./aggregate'` (hiện là `import { categoryBreakdown, monthlySeries } from './aggregate'` → thêm `sumIncomeExpense`). Rồi thêm describe mới vào cuối `src/features/reports/aggregate.test.ts` (tái dùng `tx`, `currencyOf`, `RATES` đã có sẵn trong file):

```ts
describe('sumIncomeExpense (base = JPY)', () => {
  it('cộng thu/chi quy đổi base, bỏ qua chuyển khoản', () => {
    const txs = [
      tx({ type: 'income', amount: 280_000 }),
      tx({ type: 'expense', amount: 850 }),
      tx({ type: 'expense', amount: 1_650_000, account_id: 'vnd' }), // → ¥10.000
      tx({ type: 'transfer', amount: 30_000, to_account_id: 'vnd' }), // bỏ qua
    ]
    const r = sumIncomeExpense(txs, currencyOf, 'JPY', RATES)
    expect(r.income).toBe(280_000)
    expect(r.expense).toBe(10_850)
    expect(r.hasForeign).toBe(true)
    expect(r.hasMissingRate).toBe(false)
  })

  it('thiếu tỷ giá → bỏ giao dịch đó, đánh dấu hasMissingRate', () => {
    const txs = [
      tx({ type: 'expense', amount: 850 }),
      tx({ type: 'expense', amount: 1_650_000, account_id: 'vnd' }),
    ]
    const r = sumIncomeExpense(txs, currencyOf, 'JPY', { JPY: 1 })
    expect(r.expense).toBe(850)
    expect(r.income).toBe(0)
    expect(r.hasMissingRate).toBe(true)
  })

  it('cùng tiền gốc thì không đánh dấu ngoại tệ', () => {
    const txs = [tx({ type: 'income', amount: 100 }), tx({ type: 'expense', amount: 40 })]
    const r = sumIncomeExpense(txs, currencyOf, 'JPY', RATES)
    expect(r).toEqual({ income: 100, expense: 40, hasForeign: false, hasMissingRate: false })
  })
})
```

- [ ] **Step 2: Chạy test để chắc chắn nó fail**

Run: `npm test -- aggregate`
Expected: FAIL — `sumIncomeExpense is not a function` / không export.

- [ ] **Step 3: Cài đặt hàm**

Thêm vào cuối `src/features/reports/aggregate.ts`:

```ts
export interface IncomeExpenseSum {
  /** minor units theo base currency */
  income: number
  expense: number
  hasForeign: boolean
  hasMissingRate: boolean
}

/** Tổng thu + tổng chi (đã quy đổi base). Chuyển khoản KHÔNG tính. */
export function sumIncomeExpense(
  txs: TransactionRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): IncomeExpenseSum {
  let income = 0
  let expense = 0
  let hasForeign = false
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type === 'transfer') continue
    const cur = currencyOf(t.account_id)
    if (cur !== base) hasForeign = true
    const v = convertToBase(t.amount, cur, base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    if (t.type === 'income') income += v
    else expense += v
  }
  return { income, expense, hasForeign, hasMissingRate }
}
```

- [ ] **Step 4: Chạy test để chắc chắn nó pass**

Run: `npm test -- aggregate`
Expected: PASS (3 case mới + các test aggregate cũ vẫn xanh).

- [ ] **Step 5: Commit**

```bash
git add src/features/reports/aggregate.ts src/features/reports/aggregate.test.ts
git commit -m "GD-timkiem: sumIncomeExpense o aggregate (tong thu/chi quy doi base)"
```

---

### Task 2: Hiện thanh tổng trong `SearchPage`

**Files:**
- Modify: `src/features/transactions/SearchPage.tsx`

**Interfaces:**
- Consumes: `sumIncomeExpense`, `IncomeExpenseSum` (Task 1); `formatMoney`, `CurrencyCode` từ `src/lib/money.ts`; `useRates()` (đã trả `{ base, rates }`).

- [ ] **Step 1: Sửa import + lấy thêm `rates`**

Trong `src/features/transactions/SearchPage.tsx`:

(a) Đổi dòng import money (hiện `import { CURRENCIES } from '../../lib/money'`) thành:

```tsx
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
```

(b) Thêm import hàm tổng (đặt cạnh các import feature khác, ví dụ dưới dòng import `TransactionItem`):

```tsx
import { sumIncomeExpense } from '../reports/aggregate'
```

(c) Đổi `const { base } = useRates()` thành:

```tsx
  const { base, rates } = useRates()
```

- [ ] **Step 2: Tính tổng**

Trong `SearchPage`, ngay dưới dòng `const categoryOf = ...` (khoảng dòng 76), thêm:

```tsx
  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base

  const totals = useMemo(
    () => sumIncomeExpense(results, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, accounts, base, rates],
  )
```

(`useMemo` đã được import ở đầu file.)

- [ ] **Step 3: Hiện thanh tổng dưới dòng "N kết quả"**

Ngay SAU khối `<p ...>{isLoading ? 'Đang tìm…' : \`${results.length} kết quả\`}</p>` (khoảng dòng 206-208), thêm:

```tsx
      {(totals.income > 0 || totals.expense > 0) && (
        <div className="mb-3 rounded-xl bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Thu</span>
            <span className="font-semibold text-green-600">
              {totals.hasForeign ? '≈ ' : ''}
              {formatMoney(totals.income, base)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-gray-500">Chi</span>
            <span className="font-semibold text-red-600">
              {totals.hasForeign ? '≈ ' : ''}
              {formatMoney(totals.expense, base)}
            </span>
          </div>
          {totals.hasMissingRate && (
            <p className="mt-2 text-xs text-amber-700">
              Một phần ngoại tệ chưa quy đổi được (đang chờ tỷ giá).
            </p>
          )}
        </div>
      )}
```

- [ ] **Step 4: Kiểm tra biên dịch + lint**

Run: `npm run build`
Expected: PASS — không lỗi TypeScript.

Run: `npm run lint`
Expected: PASS (không lỗi mới).

- [ ] **Step 5: Kiểm thử tay trên dev server**

Mở dev server, vào Sổ GD → Tìm kiếm (hoặc mở thẳng `/search`). Kiểm tra:
- Có kết quả thu/chi → thanh tổng hiện Thu (xanh) + Chi (đỏ), số quy đổi tiền gốc.
- Lọc loại "Chuyển khoản" (chỉ còn CK) → thanh tổng ẩn.
- Nếu có tài khoản ngoại tệ trong kết quả → có tiền tố "≈".

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/SearchPage.tsx
git commit -m "GD-timkiem: thanh tong thu/chi tren trang Tim kiem"
```

---

## Self-Review

**Spec coverage:**
- Hàm `sumIncomeExpense` + quy đổi + bỏ CK + missing rate → Task 1. ✔
- Unit test (cùng tiền, ngoại tệ, thiếu tỷ giá, bỏ CK) → Task 1. ✔
- Thanh tổng Thu + Chi, ẩn khi cả hai = 0 → Task 2 Step 3. ✔
- "≈" khi có ngoại tệ; dòng nhắc khi thiếu tỷ giá → Task 2 Step 3. ✔
- `currencyOf` fallback base → Task 2 Step 2. ✔

**Placeholder scan:** Không có TBD/TODO; mọi bước có code/lệnh cụ thể. ✔

**Type consistency:** `sumIncomeExpense`, `IncomeExpenseSum`, `currencyOf`, `totals` nhất quán giữa 2 task; `useRates()` trả `{ base, rates }` khớp cách dùng ở ReportsPage. ✔
