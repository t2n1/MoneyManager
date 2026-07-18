# Nhóm "Thấu hiểu tài chính" (R, S, U, W) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm tab "Thấu hiểu" ở trang Báo cáo với 4 chỉ số tính client-side: dự báo cuối tháng (R), so sánh tháng theo danh mục (S), dòng tiền tích lũy (W), phát hiện chi bất thường (U).

**Architecture:** Logic thuần bổ sung vào `src/lib/dates.ts` (helper ngày), `src/features/reports/insights.ts` (R, U) và `src/features/reports/aggregate.ts` (S, W). UI gom vào component mới `src/features/reports/InsightsView.tsx` (tự fetch qua hooks sẵn có, giống `BudgetView`); `ReportsPage.tsx` chỉ thêm 1 tab và **chuyển** section "Sức khỏe tài chính" sang component mới. Không đổi schema, không đụng tầng repo.

**Tech Stack:** React 19 + TypeScript, TanStack Query, Recharts, Tailwind, Vitest, oxlint.

## Global Constraints

- Không đổi `schema`, không đụng tầng `repo` — chỉ đọc/tính dữ liệu sẵn có.
- Tiền lưu **minor units** (số nguyên); quy đổi base qua `convertToBase`; thiếu tỷ giá → cờ `hasMissingRate`, KHÔNG mất dòng.
- Mọi mốc "tháng" đi qua `getMonthRange` / `monthKeyForDate` (tôn trọng `month_start_day`).
- Hàm thuần **không gọi `new Date()`** để lấy giờ hiện tại — `today` truyền vào (test tất định).
- UI tiếng Việt. Sau mỗi task: `npm run build`, `npm run lint`, `npm test` phải sạch.
- Mỗi task = **1 commit**, lời nhắn commit **không dấu**.
- Test framework: Vitest. Chạy 1 file: `npx vitest run <path>`. Chạy tất cả: `npm test`.

---

## Task 1: Tab "Thấu hiểu" + Dự báo cuối tháng (R)

**Files:**
- Modify: `src/lib/dates.ts` (thêm `daysBetween`)
- Test: `src/lib/dates.test.ts` (thêm describe `daysBetween`)
- Modify: `src/features/reports/insights.ts` (thêm `Forecast`, `forecastMonthEnd`)
- Test: `src/features/reports/insights.test.ts` (thêm describe `forecastMonthEnd`)
- Create: `src/features/reports/InsightsView.tsx` (Sức khỏe chuyển sang + thẻ Dự báo)
- Modify: `src/features/reports/ReportsPage.tsx` (thêm tab, bỏ section Sức khỏe khỏi tab Biểu đồ)

**Interfaces:**
- Produces:
  - `daysBetween(aISO: string, bISO: string): number` — số ngày nguyên (b − a).
  - `forecastMonthEnd(spentSoFar: number, daysElapsed: number, daysInMonth: number): Forecast | null` với `Forecast = { projected: number; spentSoFar: number; daysElapsed: number; daysInMonth: number }`.
  - `InsightsView({ monthKey }: { monthKey: MonthKey })` — component render các chỉ số cho tháng đang xem.

- [ ] **Step 1: Viết test thất bại cho `daysBetween`**

Trong `src/lib/dates.test.ts`, thêm `daysBetween` vào dòng import từ `./dates` và thêm khối:

```ts
describe('daysBetween', () => {
  it('cùng ngày = 0', () => expect(daysBetween('2026-07-10', '2026-07-10')).toBe(0))
  it('cách 1 ngày = 1', () => expect(daysBetween('2026-07-10', '2026-07-11')).toBe(1))
  it('qua ranh giới tháng', () => expect(daysBetween('2026-07-31', '2026-08-01')).toBe(1))
  it('cả tháng 7 = 31 ngày', () => expect(daysBetween('2026-07-01', '2026-08-01')).toBe(31))
  it('âm khi b trước a', () => expect(daysBetween('2026-07-11', '2026-07-10')).toBe(-1))
})
```

- [ ] **Step 2: Chạy test để chắc nó fail**

Run: `npx vitest run src/lib/dates.test.ts`
Expected: FAIL — `daysBetween is not a function` / không export.

- [ ] **Step 3: Cài `daysBetween`**

Thêm vào cuối `src/lib/dates.ts`:

```ts
/** Số ngày nguyên giữa 2 ngày ISO 'YYYY-MM-DD' (bISO − aISO), theo mốc UTC 00:00. */
export function daysBetween(aISO: string, bISO: string): number {
  const a = Date.parse(aISO + 'T00:00:00Z')
  const b = Date.parse(bISO + 'T00:00:00Z')
  return Math.round((b - a) / 86_400_000)
}
```

- [ ] **Step 4: Chạy test để chắc pass**

Run: `npx vitest run src/lib/dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Viết test thất bại cho `forecastMonthEnd`**

Trong `src/features/reports/insights.test.ts`, thêm `forecastMonthEnd` vào dòng import từ `./insights` và thêm khối:

```ts
describe('forecastMonthEnd', () => {
  it('nội suy giữa tháng: chi 10.000 sau 10/30 ngày → 30.000', () => {
    expect(forecastMonthEnd(10_000, 10, 30)?.projected).toBe(30_000)
  })
  it('daysElapsed = 0 → null', () => expect(forecastMonthEnd(5_000, 0, 30)).toBeNull())
  it('daysInMonth = 0 → null', () => expect(forecastMonthEnd(5_000, 5, 0)).toBeNull())
  it('hết tháng → projected ≈ spentSoFar', () => {
    expect(forecastMonthEnd(30_000, 30, 30)?.projected).toBe(30_000)
  })
})
```

- [ ] **Step 6: Chạy test để chắc nó fail**

Run: `npx vitest run src/features/reports/insights.test.ts`
Expected: FAIL — `forecastMonthEnd is not a function`.

- [ ] **Step 7: Cài `forecastMonthEnd`**

Thêm vào cuối `src/features/reports/insights.ts`:

```ts
export interface Forecast {
  /** dự báo tổng chi cuối tháng (base, minor units) */
  projected: number
  spentSoFar: number
  daysElapsed: number
  daysInMonth: number
}

/** Nội suy tuyến tính chi cả tháng theo tốc độ tới nay. Đầu vào không hợp lệ → null. */
export function forecastMonthEnd(
  spentSoFar: number,
  daysElapsed: number,
  daysInMonth: number,
): Forecast | null {
  if (daysElapsed < 1 || daysInMonth < 1) return null
  const projected = Math.round((spentSoFar / daysElapsed) * daysInMonth)
  return { projected, spentSoFar, daysElapsed, daysInMonth }
}
```

- [ ] **Step 8: Chạy test để chắc pass**

Run: `npx vitest run src/features/reports/insights.test.ts`
Expected: PASS.

- [ ] **Step 9: Tạo `InsightsView.tsx` (Sức khỏe + Dự báo)**

Tạo `src/features/reports/InsightsView.tsx`:

```tsx
import { useMemo } from 'react'
import {
  useAccounts,
  useBudgetReport,
  useCategories,
  useMonthTransactions,
  useProfile,
  useRangeTransactions,
  useRates,
} from '../../hooks/queries'
import {
  addMonths,
  daysBetween,
  getMonthRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { convertToBase } from '../../lib/rates'
import { categoryBreakdown, monthlySeries } from './aggregate'
import { buildInsights, forecastMonthEnd, noSpendStreak, savingsRate } from './insights'

export function InsightsView({ monthKey }: { monthKey: MonthKey }) {
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  const r = rates ?? {}
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: monthTxs = [] } = useMonthTransactions(monthKey)
  const { report } = useBudgetReport(monthKey)

  // 6 tháng gần nhất (gồm tháng đang xem) — nền cho so sánh (S) và bất thường (U)
  const sixMonths = useMemo(
    () => Array.from({ length: 6 }, (_, i) => addMonths(monthKey, i - 5)),
    [monthKey],
  )
  const sixMonthRange = useMemo(
    () => ({
      start: getMonthRange(sixMonths[0], monthStartDay).start,
      end: getMonthRange(monthKey, monthStartDay).end,
    }),
    [sixMonths, monthKey, monthStartDay],
  )
  const { data: rangeTxs = [] } = useRangeTransactions(sixMonthRange, !!profile)

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base
  const categoryOf = (id: string) => categories.find((c) => c.id === id)

  const series = useMemo(
    () => monthlySeries(rangeTxs, sixMonths, monthStartDay, currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, sixMonths, monthStartDay, accounts, base, rates],
  )
  const expenseBreakdown = useMemo(
    () => categoryBreakdown(monthTxs, 'expense', currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, accounts, base, rates],
  )

  // --- Sức khỏe tài chính (V, Q) — chuyển từ ReportsPage ---
  const todayISO = toISODate(new Date())
  const currentKey = monthKeyForDate(todayISO, monthStartDay)
  const isCurrentMonth = monthKey.year === currentKey.year && monthKey.month === currentKey.month
  const thisPoint = series.points[series.points.length - 1]
  const prevPoint = series.points[series.points.length - 2]
  const rate = thisPoint ? savingsRate(thisPoint.income, thisPoint.expense) : null
  const streak = useMemo(
    () => (isCurrentMonth ? noSpendStreak(monthTxs, todayISO, monthStartDay) : null),
    [monthTxs, monthStartDay, isCurrentMonth, todayISO],
  )
  const topSlice = expenseBreakdown.slices[0]
  const topCat = topSlice ? categoryOf(topSlice.categoryId) : undefined
  const insights = buildInsights(
    {
      expenseThis: thisPoint?.expense ?? 0,
      expensePrev: prevPoint?.expense ?? 0,
      topCategoryName: topCat?.name ?? null,
      topCategoryAmount: topSlice?.amount ?? 0,
      expenseTotal: expenseBreakdown.total,
    },
    (m) => formatMoney(m, base),
  )
  const hasHealth = rate !== null || (streak !== null && streak > 0) || insights.length > 0

  // --- Dự báo cuối tháng (R) — chỉ tháng hiện tại ---
  const range = getMonthRange(monthKey, monthStartDay)
  const daysInMonth = daysBetween(range.start, range.end)
  const daysElapsed = Math.min(daysBetween(range.start, todayISO) + 1, daysInMonth)
  let spentSoFar = 0
  let forecastApprox = false
  for (const t of monthTxs) {
    if (t.type !== 'expense' || t.occurred_on > todayISO) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, r)
    if (v === null) {
      forecastApprox = true
      continue
    }
    spentSoFar += v
  }
  const forecast = isCurrentMonth ? forecastMonthEnd(spentSoFar, daysElapsed, daysInMonth) : null
  const totalBudgeted = report?.totalBudgeted ?? 0

  const hasMissingRate = series.hasMissingRate || expenseBreakdown.hasMissingRate || forecastApprox
  const hasAny = hasHealth || forecast

  return (
    <div className="flex flex-col gap-3">
      {hasMissingRate && (
        <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
          Một phần giao dịch ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

      {hasHealth && (
        <section className="rounded-xl bg-white p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-gray-500">Sức khỏe tài chính</h2>
          <div className="mb-2 flex gap-2">
            {rate !== null && (
              <div className="flex-1 rounded-lg bg-gray-50 p-2 text-center">
                <div className={`text-lg font-bold ${rate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {Math.round(rate * 100)}%
                </div>
                <div className="text-[11px] text-gray-500">Tỷ lệ tiết kiệm</div>
              </div>
            )}
            {streak !== null && (
              <div className="flex-1 rounded-lg bg-gray-50 p-2 text-center">
                <div className="text-lg font-bold text-gray-800">{streak}</div>
                <div className="text-[11px] text-gray-500">Ngày liên tiếp không chi</div>
              </div>
            )}
          </div>
          {insights.length > 0 && (
            <ul className="space-y-1">
              {insights.map((i) => (
                <li key={i.id} className="rounded-lg bg-green-50 px-2 py-1.5 text-xs text-gray-700">
                  {i.text}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {forecast && (
        <section className="rounded-xl bg-white p-3 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-500">Dự báo cuối tháng</h2>
          <div className="text-2xl font-bold text-gray-800">
            {forecastApprox ? '≈ ' : ''}
            {formatMoney(forecast.projected, base)}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Đã chi {formatMoney(forecast.spentSoFar, base)} sau {forecast.daysElapsed}/
            {forecast.daysInMonth} ngày
          </p>
          {totalBudgeted > 0 ? (
            forecast.projected > totalBudgeted ? (
              <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">
                Với đà này bạn sẽ vượt ngân sách {formatMoney(forecast.projected - totalBudgeted, base)}.
              </p>
            ) : (
              <p className="mt-2 rounded-lg bg-green-50 px-2 py-1.5 text-xs text-green-700">
                Với đà này bạn vẫn trong ngân sách ({formatMoney(totalBudgeted, base)}).
              </p>
            )
          ) : (
            <p className="mt-2 text-xs text-gray-400">Đặt ngân sách tháng để so sánh với dự báo.</p>
          )}
        </section>
      )}

      {!hasAny && (
        <p className="py-10 text-center text-sm text-gray-400">Chưa đủ dữ liệu để phân tích.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 10: Nối tab "Thấu hiểu" vào `ReportsPage.tsx` và bỏ section Sức khỏe khỏi tab Biểu đồ**

Trong `src/features/reports/ReportsPage.tsx`:

1. Thêm import (cạnh `import { BudgetView } ...`):

```tsx
import { InsightsView } from './InsightsView'
```

2. Đổi state `view` để nhận `'insights'`:

```tsx
  const [view, setView] = useState<'charts' | 'insights' | 'budget'>(
    searchParams.get('view') === 'budget'
      ? 'budget'
      : searchParams.get('view') === 'insights'
        ? 'insights'
        : 'charts',
  )
```

3. Trong dải nút chọn tab, thêm nút "Thấu hiểu" **giữa** nút Biểu đồ và Ngân sách:

```tsx
        <button
          type="button"
          onClick={() => setView('insights')}
          className={`flex-1 rounded-md py-1.5 ${view === 'insights' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
        >
          Thấu hiểu
        </button>
```

4. **Xóa** phần tính toán Sức khỏe (khối bắt đầu bằng comment `// --- Sức khỏe tài chính + thẻ gợi ý (V, Q) ---` cho tới hết dòng `const hasHealth = ...`), gồm các biến: `expenseBreakdown`, `thisPoint`, `prevPoint`, `rate`, `todayISO`, `currentKey`, `isCurrentMonth`, `streak`, `topSlice`, `topCat`, `insights`, `hasHealth`. Cũng **xóa** import không còn dùng: `buildInsights, noSpendStreak, savingsRate` (dòng `import { buildInsights, ... } from './insights'`) và `monthKeyForDate` **chỉ khi** không còn chỗ khác dùng (còn dùng ở `activeMonthKey` — GIỮ `monthKeyForDate`, `toISODate`). Kiểm lại: sau khi xóa, `formatMoney` vẫn dùng ở JSX biểu đồ → giữ. Xóa import `buildInsights, savingsRate, noSpendStreak`.

5. **Xóa** khối JSX section "Sức khỏe tài chính" trong nhánh `view === 'charts'` (từ `{hasHealth && (` tới `)}` tương ứng).

6. Thêm nhánh render tab mới cạnh `{view === 'budget' && <BudgetView monthKey={activeMonthKey} />}`:

```tsx
      {view === 'insights' && <InsightsView monthKey={activeMonthKey} />}
```

- [ ] **Step 11: Kiểm tra build + lint + test**

Run: `npm run build` → sạch (không lỗi TS, không import thừa).
Run: `npm run lint` → sạch.
Run: `npm test` → tất cả PASS.

Nếu lint báo biến/không import thừa còn sót ở `ReportsPage.tsx`, dọn cho sạch.

- [ ] **Step 12: Commit**

```bash
git add src/lib/dates.ts src/lib/dates.test.ts src/features/reports/insights.ts src/features/reports/insights.test.ts src/features/reports/InsightsView.tsx src/features/reports/ReportsPage.tsx
git commit -m "Bao cao: tab Thau hieu + du bao cuoi thang run-rate (R)"
```

---

## Task 2: So sánh tháng theo danh mục (S)

**Files:**
- Modify: `src/features/reports/aggregate.ts` (thêm `categoryComparison`)
- Test: `src/features/reports/aggregate.test.ts` (thêm describe `categoryComparison`)
- Modify: `src/features/reports/InsightsView.tsx` (thêm bảng so sánh)

**Interfaces:**
- Consumes: `CurrencyOf`, `Rates`, `convertToBase`, `MonthKey`, `addMonths`, `monthKeyForDate` (đã có).
- Produces:
  - `categoryComparison(txs, activeMonth, monthStartDay, currencyOf, base, rates): CategoryComparison`
  - `CategoryComparisonRow = { categoryId: string; thisMonth: number; prevMonth: number; avg3: number; deltaPct: number | null; isNew: boolean }`
  - `CategoryComparison = { rows: CategoryComparisonRow[]; hasMissingRate: boolean }`

- [ ] **Step 1: Viết test thất bại**

Trong `src/features/reports/aggregate.test.ts`, thêm `categoryComparison` vào dòng import từ `./aggregate` và thêm:

```ts
describe('categoryComparison (base = JPY)', () => {
  const active = { year: 2026, month: 7 }
  it('gom theo tháng/danh mục, avg3 chia 3 kể cả tháng thiếu, delta đúng dấu', () => {
    const txs = [
      tx({ type: 'expense', amount: 1200, category_id: 'food', occurred_on: '2026-07-05' }),
      tx({ type: 'expense', amount: 1000, category_id: 'food', occurred_on: '2026-06-05' }),
      tx({ type: 'expense', amount: 800, category_id: 'food', occurred_on: '2026-05-05' }),
      tx({ type: 'income', amount: 999, category_id: 'x', occurred_on: '2026-07-05' }), // bỏ (income)
    ]
    const r = categoryComparison(txs, active, 1, currencyOf, 'JPY', RATES)
    // avg3 = (T6 1000 + T5 800 + T4 0) / 3 = 600 ; delta = (1200-1000)/1000 = 20%
    expect(r.rows).toEqual([
      { categoryId: 'food', thisMonth: 1200, prevMonth: 1000, avg3: 600, deltaPct: 20, isNew: false },
    ])
    expect(r.hasMissingRate).toBe(false)
  })
  it('danh mục mới (tháng trước = 0) → isNew, deltaPct null', () => {
    const txs = [tx({ type: 'expense', amount: 500, category_id: 'new', occurred_on: '2026-07-05' })]
    const r = categoryComparison(txs, active, 1, currencyOf, 'JPY', RATES)
    expect(r.rows[0]).toMatchObject({ categoryId: 'new', prevMonth: 0, deltaPct: null, isNew: true })
  })
  it('sắp theo thisMonth giảm dần', () => {
    const txs = [
      tx({ type: 'expense', amount: 300, category_id: 'a', occurred_on: '2026-07-05' }),
      tx({ type: 'expense', amount: 900, category_id: 'b', occurred_on: '2026-07-05' }),
    ]
    const r = categoryComparison(txs, active, 1, currencyOf, 'JPY', RATES)
    expect(r.rows.map((x) => x.categoryId)).toEqual(['b', 'a'])
  })
  it('thiếu tỷ giá → cờ hasMissingRate', () => {
    const txs = [tx({ type: 'expense', amount: 1_650_000, category_id: 'x', occurred_on: '2026-07-05', account_id: 'vnd' })]
    const r = categoryComparison(txs, active, 1, currencyOf, 'JPY', { JPY: 1 })
    expect(r.hasMissingRate).toBe(true)
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó fail**

Run: `npx vitest run src/features/reports/aggregate.test.ts`
Expected: FAIL — `categoryComparison is not a function`.

- [ ] **Step 3: Cài `categoryComparison`**

Trong `src/features/reports/aggregate.ts`: thêm `addMonths` vào dòng import từ `../../lib/dates` (hiện: `import { monthKeyForDate, type MonthKey } from '../../lib/dates'` → `import { addMonths, monthKeyForDate, type MonthKey } from '../../lib/dates'`). Rồi thêm vào cuối file:

```ts
export interface CategoryComparisonRow {
  categoryId: string
  thisMonth: number // base minor
  prevMonth: number // base minor
  avg3: number // TB tổng chi của M-1, M-2, M-3 (tháng thiếu tính 0)
  deltaPct: number | null // (thisMonth - prevMonth)/prevMonth * 100; null nếu prevMonth = 0
  isNew: boolean // prevMonth = 0 && thisMonth > 0
}

export interface CategoryComparison {
  rows: CategoryComparisonRow[] // sắp theo thisMonth giảm dần
  hasMissingRate: boolean
}

/**
 * So sánh chi theo danh mục: tháng đang xem vs tháng trước vs TB 3 tháng trước.
 * Chỉ tính expense có category_id; ▲▼% so tháng trước; avg3 là cột tham chiếu.
 */
export function categoryComparison(
  txs: TransactionRow[],
  activeMonth: MonthKey,
  monthStartDay: number,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): CategoryComparison {
  const m0 = monthId(activeMonth)
  const m1 = monthId(addMonths(activeMonth, -1))
  const m2 = monthId(addMonths(activeMonth, -2))
  const m3 = monthId(addMonths(activeMonth, -3))
  const byCat = new Map<string, Map<string, number>>()
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type !== 'expense' || !t.category_id) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    const mid = monthId(monthKeyForDate(t.occurred_on, monthStartDay))
    if (mid !== m0 && mid !== m1 && mid !== m2 && mid !== m3) continue
    const inner = byCat.get(t.category_id) ?? new Map<string, number>()
    inner.set(mid, (inner.get(mid) ?? 0) + v)
    byCat.set(t.category_id, inner)
  }
  const rows: CategoryComparisonRow[] = []
  for (const [categoryId, inner] of byCat) {
    const thisMonth = inner.get(m0) ?? 0
    const prevMonth = inner.get(m1) ?? 0
    const avg3 = Math.round(((inner.get(m1) ?? 0) + (inner.get(m2) ?? 0) + (inner.get(m3) ?? 0)) / 3)
    if (thisMonth === 0 && prevMonth === 0 && avg3 === 0) continue
    const deltaPct = prevMonth > 0 ? Math.round(((thisMonth - prevMonth) / prevMonth) * 100) : null
    const isNew = prevMonth === 0 && thisMonth > 0
    rows.push({ categoryId, thisMonth, prevMonth, avg3, deltaPct, isNew })
  }
  rows.sort((a, b) => b.thisMonth - a.thisMonth)
  return { rows, hasMissingRate }
}
```

- [ ] **Step 4: Chạy test để chắc pass**

Run: `npx vitest run src/features/reports/aggregate.test.ts`
Expected: PASS.

- [ ] **Step 5: Thêm bảng So sánh vào `InsightsView.tsx`**

1. Thêm `categoryComparison` vào import từ `./aggregate`:

```tsx
import { categoryBreakdown, categoryComparison, monthlySeries } from './aggregate'
```

2. Thêm tính toán (sau `expenseBreakdown`):

```tsx
  const comparison = useMemo(
    () => categoryComparison(rangeTxs, monthKey, monthStartDay, currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, monthKey, monthStartDay, accounts, base, rates],
  )
```

3. Cập nhật cờ thiếu tỷ giá và `hasAny`:

```tsx
  const hasMissingRate =
    series.hasMissingRate || expenseBreakdown.hasMissingRate || forecastApprox || comparison.hasMissingRate
  const hasAny = hasHealth || forecast || comparison.rows.length > 0
```

4. Thêm section (sau thẻ `{forecast && (...)}`, trước `{!hasAny && (...)}`):

```tsx
      {comparison.rows.length > 0 && (
        <section className="rounded-xl bg-white p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-gray-500">So sánh chi theo danh mục</h2>
          <ul className="space-y-2">
            {comparison.rows.map((row) => {
              const cat = categoryOf(row.categoryId)
              return (
                <li key={row.categoryId} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                    {cat?.icon ?? '📦'} {cat?.name ?? '?'}
                  </span>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1 text-sm font-medium text-gray-800">
                      {formatMoney(row.thisMonth, base)}
                      {row.isNew ? (
                        <span className="rounded bg-sky-50 px-1 text-[10px] text-sky-600">mới</span>
                      ) : row.deltaPct !== null && row.deltaPct !== 0 ? (
                        <span className={`text-[11px] ${row.deltaPct > 0 ? 'text-red-500' : 'text-green-600'}`}>
                          {row.deltaPct > 0 ? '▲' : '▼'}
                          {Math.abs(row.deltaPct)}%
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      Trước {formatMoney(row.prevMonth, base)} · TB3 {formatMoney(row.avg3, base)}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
```

- [ ] **Step 6: Kiểm tra build + lint + test**

Run: `npm run build` → sạch. `npm run lint` → sạch. `npm test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/reports/aggregate.ts src/features/reports/aggregate.test.ts src/features/reports/InsightsView.tsx
git commit -m "Bao cao: so sanh thang theo danh muc (S)"
```

---

## Task 3: Dòng tiền tích lũy trong tháng (W)

**Files:**
- Modify: `src/lib/dates.ts` (thêm `addDaysISO`)
- Test: `src/lib/dates.test.ts` (thêm describe `addDaysISO`)
- Modify: `src/lib/money.ts` (thêm `formatCompact` dùng chung)
- Modify: `src/features/reports/ReportsPage.tsx` (dùng `formatCompact` từ money thay bản cục bộ)
- Modify: `src/features/reports/aggregate.ts` (thêm `cumulativeDailyBalance`)
- Test: `src/features/reports/aggregate.test.ts` (thêm describe `cumulativeDailyBalance`)
- Modify: `src/features/reports/InsightsView.tsx` (thêm biểu đồ đường)

**Interfaces:**
- Produces:
  - `addDaysISO(iso: string, delta: number): string`
  - `formatCompact(minor: number, currency: CurrencyCode): string` (trong `money.ts`)
  - `cumulativeDailyBalance(txs, startISO, lastISO, currencyOf, base, rates): CumulativeCashflow`
  - `CashflowPoint = { date: string; balance: number }`
  - `CumulativeCashflow = { points: CashflowPoint[]; hasMissingRate: boolean }`

- [ ] **Step 1: Viết test thất bại cho `addDaysISO`**

Trong `src/lib/dates.test.ts`, thêm `addDaysISO` vào import từ `./dates` và thêm:

```ts
describe('addDaysISO', () => {
  it('cộng 1 ngày', () => expect(addDaysISO('2026-07-10', 1)).toBe('2026-07-11'))
  it('trừ 1 ngày qua ranh giới tháng', () => expect(addDaysISO('2026-08-01', -1)).toBe('2026-07-31'))
  it('delta 0 giữ nguyên', () => expect(addDaysISO('2026-07-10', 0)).toBe('2026-07-10'))
})
```

- [ ] **Step 2: Chạy test để chắc nó fail**

Run: `npx vitest run src/lib/dates.test.ts`
Expected: FAIL — `addDaysISO is not a function`.

- [ ] **Step 3: Cài `addDaysISO`**

Thêm vào `src/lib/dates.ts`:

```ts
/** Cộng/trừ số ngày vào ngày ISO 'YYYY-MM-DD', trả ISO mới (mốc UTC). */
export function addDaysISO(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step 4: Chạy test để chắc pass**

Run: `npx vitest run src/lib/dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Chuyển `formatCompact` sang `money.ts`**

Thêm vào cuối `src/lib/money.ts`:

```ts
/** minor units → nhãn ngắn cho trục biểu đồ (¥300k, 1.5M…). Giữ dấu âm. */
export function formatCompact(minor: number, currency: CurrencyCode): string {
  const major = minor / 10 ** CURRENCIES[currency].decimals
  const abs = Math.abs(major)
  if (abs >= 1_000_000) return `${(major / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${Math.round(major / 1_000)}k`
  return String(Math.round(major))
}
```

Trong `src/features/reports/ReportsPage.tsx`: **xóa** hàm `formatCompact` cục bộ (khối `function formatCompact(...) { ... }` gần đầu file) và thêm `formatCompact` vào import từ `../../lib/money`:

```tsx
import { CURRENCIES, formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
```

(Nếu sau khi xóa, `CURRENCIES` không còn dùng ở `ReportsPage.tsx` thì bỏ khỏi import — kiểm bằng lint.)

- [ ] **Step 6: Viết test thất bại cho `cumulativeDailyBalance`**

Trong `src/features/reports/aggregate.test.ts`, thêm `cumulativeDailyBalance` vào import từ `./aggregate` và thêm:

```ts
describe('cumulativeDailyBalance (base = JPY)', () => {
  it('cộng dồn theo ngày, ngày trống giữ số dư, bỏ chuyển khoản', () => {
    const txs = [
      tx({ type: 'income', amount: 1000, occurred_on: '2026-07-01' }),
      tx({ type: 'expense', amount: 300, occurred_on: '2026-07-02' }),
      tx({ type: 'transfer', amount: 500, occurred_on: '2026-07-02', to_account_id: 'vnd' }), // bỏ
      tx({ type: 'expense', amount: 200, occurred_on: '2026-07-04' }),
    ]
    const r = cumulativeDailyBalance(txs, '2026-07-01', '2026-07-04', currencyOf, 'JPY', RATES)
    expect(r.points).toEqual([
      { date: '2026-07-01', balance: 1000 },
      { date: '2026-07-02', balance: 700 },
      { date: '2026-07-03', balance: 700 },
      { date: '2026-07-04', balance: 500 },
    ])
    expect(r.hasMissingRate).toBe(false)
  })
  it('thiếu tỷ giá → cờ hasMissingRate, khoản đó không tính', () => {
    const txs = [
      tx({ type: 'expense', amount: 1_650_000, occurred_on: '2026-07-01', account_id: 'vnd' }),
    ]
    const r = cumulativeDailyBalance(txs, '2026-07-01', '2026-07-01', currencyOf, 'JPY', { JPY: 1 })
    expect(r.hasMissingRate).toBe(true)
    expect(r.points).toEqual([{ date: '2026-07-01', balance: 0 }])
  })
})
```

- [ ] **Step 7: Chạy test để chắc nó fail**

Run: `npx vitest run src/features/reports/aggregate.test.ts`
Expected: FAIL — `cumulativeDailyBalance is not a function`.

- [ ] **Step 8: Cài `cumulativeDailyBalance`**

Thêm vào cuối `src/features/reports/aggregate.ts`:

```ts
export interface CashflowPoint {
  date: string
  balance: number // base minor, tích lũy
}

export interface CumulativeCashflow {
  points: CashflowPoint[]
  hasMissingRate: boolean
}

/**
 * Số dư chạy theo ngày (thu +, chi −, bắt đầu từ 0) từ startISO tới lastISO (đều gồm).
 * Chuyển khoản KHÔNG tính. Ngày không có giao dịch giữ nguyên số dư.
 */
export function cumulativeDailyBalance(
  txs: TransactionRow[],
  startISO: string,
  lastISO: string,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): CumulativeCashflow {
  const netByDay = new Map<string, number>()
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type === 'transfer') continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    const signed = t.type === 'income' ? v : -v
    netByDay.set(t.occurred_on, (netByDay.get(t.occurred_on) ?? 0) + signed)
  }
  const points: CashflowPoint[] = []
  let balance = 0
  const cur = new Date(startISO + 'T00:00:00Z')
  const last = new Date(lastISO + 'T00:00:00Z')
  while (cur <= last) {
    const iso = cur.toISOString().slice(0, 10)
    balance += netByDay.get(iso) ?? 0
    points.push({ date: iso, balance })
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return { points, hasMissingRate }
}
```

- [ ] **Step 9: Chạy test để chắc pass**

Run: `npx vitest run src/features/reports/aggregate.test.ts`
Expected: PASS.

- [ ] **Step 10: Thêm biểu đồ đường vào `InsightsView.tsx`**

1. Thêm imports:

```tsx
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
```

Cập nhật import dates để có `addDaysISO`:

```tsx
import {
  addDaysISO,
  addMonths,
  daysBetween,
  getMonthRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
```

Cập nhật import money để có `formatCompact`:

```tsx
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
```

Thêm import helper cashflow:

```tsx
import { categoryBreakdown, categoryComparison, cumulativeDailyBalance, monthlySeries } from './aggregate'
```

2. Thêm tính toán (sau `comparison`); lưu ý `range` đã khai báo ở phần R:

```tsx
  const cashLastISO = isCurrentMonth ? todayISO : addDaysISO(range.end, -1)
  const cashflow = useMemo(
    () => cumulativeDailyBalance(monthTxs, range.start, cashLastISO, currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, range.start, cashLastISO, accounts, base, rates],
  )
  const cashflowData = cashflow.points.map((p) => ({ day: Number(p.date.slice(8)), balance: p.balance }))
  const hasCashflow = cashflow.points.some((p) => p.balance !== 0)
```

3. Cập nhật cờ thiếu tỷ giá và `hasAny`:

```tsx
  const hasMissingRate =
    series.hasMissingRate ||
    expenseBreakdown.hasMissingRate ||
    forecastApprox ||
    comparison.hasMissingRate ||
    cashflow.hasMissingRate
  const hasAny = hasHealth || forecast || comparison.rows.length > 0 || hasCashflow
```

4. Thêm section (sau bảng So sánh, trước `{!hasAny && ...}`):

```tsx
      {hasCashflow && (
        <section className="rounded-xl bg-white p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-gray-500">Dòng tiền tích lũy trong tháng</h2>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cashflowData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  interval={4}
                />
                <YAxis
                  tickFormatter={(v: number) => formatCompact(v, base)}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <ReferenceLine y={0} stroke="#e5e7eb" />
                <Tooltip
                  formatter={(v) => formatMoney(Number(v), base)}
                  labelFormatter={(l) => `Ngày ${l}`}
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                />
                <Line type="monotone" dataKey="balance" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
```

- [ ] **Step 11: Kiểm tra build + lint + test**

Run: `npm run build` → sạch. `npm run lint` → sạch (kiểm import `CURRENCIES` thừa ở ReportsPage nếu có). `npm test` → PASS.

- [ ] **Step 12: Commit**

```bash
git add src/lib/dates.ts src/lib/dates.test.ts src/lib/money.ts src/features/reports/ReportsPage.tsx src/features/reports/aggregate.ts src/features/reports/aggregate.test.ts src/features/reports/InsightsView.tsx
git commit -m "Bao cao: dong tien tich luy trong thang (W)"
```

---

## Task 4: Phát hiện chi bất thường (U)

**Files:**
- Modify: `src/features/reports/insights.ts` (thêm `median`, `detectAnomalies`)
- Test: `src/features/reports/insights.test.ts` (thêm describe `median`, `detectAnomalies`)
- Modify: `src/features/reports/InsightsView.tsx` (thêm danh sách bất thường)

**Interfaces:**
- Consumes: `CurrencyOf` (từ `./aggregate`), `Rates`, `convertToBase`, `CurrencyCode`.
- Produces:
  - `median(nums: number[]): number`
  - `detectAnomalies(currentTxs, historyTxs, currencyOf, base, rates, opts?): { anomalies: Anomaly[]; hasMissingRate: boolean }`
  - `Anomaly = { transactionId: string; categoryId: string; amount: number; median: number; ratio: number }`
  - `AnomalyOptions = { threshold: number; minSamples: number }` (mặc định `{ threshold: 3, minSamples: 5 }`)

- [ ] **Step 1: Viết test thất bại**

Trong `src/features/reports/insights.test.ts`, thêm `detectAnomalies, median` vào import từ `./insights`. Thêm import + helper dựng giao dịch chi (đặt sau import hiện có; `TransactionRow` đã import ở đầu file):

```ts
import type { Rates } from '../../lib/rates'
import type { CurrencyCode } from '../../lib/money'

const RATES: Rates = { JPY: 1, VND: 165, USD: 0.0065 }
const currencyOf = (id: string): CurrencyCode => (id === 'vnd' ? 'VND' : 'JPY')
let aseq = 0
const etx = (amount: number, category_id: string | null, extra: Partial<TransactionRow> = {}): TransactionRow => ({
  id: `a${aseq++}`,
  user_id: 'u',
  type: 'expense',
  amount,
  to_amount: null,
  category_id,
  account_id: 'jpy',
  to_account_id: null,
  occurred_on: '2026-07-10',
  note: '',
  created_at: '',
  updated_at: '',
  ...extra,
})

describe('median', () => {
  it('lẻ', () => expect(median([3, 1, 2])).toBe(2))
  it('chẵn', () => expect(median([1, 2, 3, 4])).toBe(2.5))
  it('rỗng → 0', () => expect(median([])).toBe(0))
})

describe('detectAnomalies (base = JPY)', () => {
  it('khoản ≥3× trung vị bị gắn cờ; danh mục < minSamples bị bỏ', () => {
    const history = [
      etx(1000, 'shop'), etx(1000, 'shop'), etx(1000, 'shop'), etx(1000, 'shop'), etx(1000, 'shop'),
      etx(500, 'food'), etx(500, 'food'), etx(500, 'food'), // chỉ 3 mẫu
    ]
    const current = [
      etx(5000, 'shop'), // 5× median 1000 → bất thường
      etx(1200, 'shop'), // 1.2× → không
      etx(9000, 'food'), // food < 5 mẫu → bỏ qua
    ]
    const r = detectAnomalies(current, history, currencyOf, 'JPY', RATES)
    expect(r.anomalies.map((a) => a.transactionId)).toEqual([current[0].id])
    expect(r.anomalies[0].ratio).toBeCloseTo(5)
    expect(r.hasMissingRate).toBe(false)
  })
  it('sắp theo ratio giảm dần', () => {
    const history = Array.from({ length: 5 }, () => etx(1000, 'shop'))
    const current = [etx(3000, 'shop'), etx(6000, 'shop')]
    const r = detectAnomalies(current, history, currencyOf, 'JPY', RATES)
    expect(r.anomalies.map((a) => Math.round(a.ratio))).toEqual([6, 3])
  })
  it('thiếu tỷ giá ở khoản hiện tại → cờ hasMissingRate, không gắn bất thường', () => {
    const history = Array.from({ length: 5 }, () => etx(1000, 'shop'))
    const current = [etx(1_000_000, 'shop', { account_id: 'vnd' })]
    const r = detectAnomalies(current, history, currencyOf, 'JPY', { JPY: 1 })
    expect(r.hasMissingRate).toBe(true)
    expect(r.anomalies).toEqual([])
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó fail**

Run: `npx vitest run src/features/reports/insights.test.ts`
Expected: FAIL — `detectAnomalies is not a function`.

- [ ] **Step 3: Cài `median` + `detectAnomalies`**

Ở đầu `src/features/reports/insights.ts`, thêm import (cạnh import hiện có):

```ts
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { CurrencyOf } from './aggregate'
```

Thêm vào cuối `src/features/reports/insights.ts`:

```ts
/** Trung vị của mảng số. Mảng rỗng → 0. */
export function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

export interface Anomaly {
  transactionId: string
  categoryId: string
  amount: number // base minor (khoản hiện tại)
  median: number // base minor (trung vị lịch sử danh mục)
  ratio: number // amount / median
}

export interface AnomalyOptions {
  threshold: number
  minSamples: number
}

/**
 * Giao dịch chi bất thường: lớn hơn `threshold`× trung vị lịch sử cùng danh mục,
 * chỉ xét danh mục có `>= minSamples` giao dịch lịch sử. historyTxs KHÔNG gồm tháng đang xem.
 */
export function detectAnomalies(
  currentTxs: TransactionRow[],
  historyTxs: TransactionRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  opts: AnomalyOptions = { threshold: 3, minSamples: 5 },
): { anomalies: Anomaly[]; hasMissingRate: boolean } {
  const history = new Map<string, number[]>()
  for (const t of historyTxs) {
    if (t.type !== 'expense' || !t.category_id) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) continue
    const arr = history.get(t.category_id) ?? []
    arr.push(v)
    history.set(t.category_id, arr)
  }
  const medianByCat = new Map<string, number>()
  for (const [cat, arr] of history) {
    if (arr.length >= opts.minSamples) medianByCat.set(cat, median(arr))
  }

  const anomalies: Anomaly[] = []
  let hasMissingRate = false
  for (const t of currentTxs) {
    if (t.type !== 'expense' || !t.category_id) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    const med = medianByCat.get(t.category_id)
    if (med === undefined || med <= 0) continue
    if (v >= opts.threshold * med) {
      anomalies.push({
        transactionId: t.id,
        categoryId: t.category_id,
        amount: v,
        median: med,
        ratio: v / med,
      })
    }
  }
  anomalies.sort((a, b) => b.ratio - a.ratio)
  return { anomalies, hasMissingRate }
}
```

- [ ] **Step 4: Chạy test để chắc pass**

Run: `npx vitest run src/features/reports/insights.test.ts`
Expected: PASS.

- [ ] **Step 5: Thêm danh sách bất thường vào `InsightsView.tsx`**

1. Thêm `detectAnomalies` vào import từ `./insights`:

```tsx
import { buildInsights, detectAnomalies, forecastMonthEnd, noSpendStreak, savingsRate } from './insights'
```

2. Thêm tính toán (sau `cashflow`):

```tsx
  const historyTxs = useMemo(
    () => rangeTxs.filter((t) => t.occurred_on < range.start),
    [rangeTxs, range.start],
  )
  const anomalyResult = useMemo(
    () => detectAnomalies(monthTxs, historyTxs, currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, historyTxs, accounts, base, rates],
  )
  const anomalies = anomalyResult.anomalies.slice(0, 5)
```

3. Cập nhật cờ thiếu tỷ giá và `hasAny`:

```tsx
  const hasMissingRate =
    series.hasMissingRate ||
    expenseBreakdown.hasMissingRate ||
    forecastApprox ||
    comparison.hasMissingRate ||
    cashflow.hasMissingRate ||
    anomalyResult.hasMissingRate
  const hasAny = hasHealth || forecast || comparison.rows.length > 0 || hasCashflow || anomalies.length > 0
```

4. Thêm section (sau biểu đồ W, trước `{!hasAny && ...}`):

```tsx
      {anomalies.length > 0 && (
        <section className="rounded-xl bg-white p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-gray-500">Chi tiêu bất thường</h2>
          <ul className="space-y-1">
            {anomalies.map((a) => {
              const cat = categoryOf(a.categoryId)
              return (
                <li
                  key={a.transactionId}
                  className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate text-gray-700">
                    {cat?.icon ?? '📦'} {cat?.name ?? '?'}
                  </span>
                  <span className="shrink-0 font-medium text-gray-800">{formatMoney(a.amount, base)}</span>
                  <span className="shrink-0 text-amber-600">gấp {Math.round(a.ratio)}× thường ngày</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
```

- [ ] **Step 6: Kiểm tra build + lint + test**

Run: `npm run build` → sạch. `npm run lint` → sạch. `npm test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/reports/insights.ts src/features/reports/insights.test.ts src/features/reports/InsightsView.tsx
git commit -m "Bao cao: phat hien giao dich bat thuong (U)"
```

---

## Nghiệm thu cuối (thủ công, demo mode)

Sau Task 4, mở bản xem trước (mobile), tab Báo cáo → **Thấu hiểu**:

- Tab Biểu đồ **không còn** section "Sức khỏe tài chính"; nó xuất hiện ở đầu tab Thấu hiểu.
- Tháng hiện tại: thấy thẻ **Dự báo cuối tháng** (ẩn khi xem tháng cũ). Có đặt ngân sách → câu "vượt/trong ngân sách" đúng màu.
- Bảng **So sánh chi theo danh mục**: ▲ đỏ khi tăng, ▼ xanh khi giảm (so tháng trước), cột "Trước / TB3"; danh mục mới có nhãn "mới".
- Biểu đồ **Dòng tiền tích lũy**: đường chạy theo ngày; tháng hiện tại dừng ở hôm nay, tháng cũ vẽ hết tháng.
- Tạo 1 khoản chi rất lớn ở danh mục có ≥5 giao dịch cũ → xuất hiện trong **Chi tiêu bất thường**; khoản thường thì không.
- Chuyển tài khoản sang loại tiền chưa có tỷ giá (nếu thử được) → banner "chưa quy đổi được" hiện, không mất dòng.

## Self-review (đã kiểm khi viết plan)

- **Phủ spec:** R → Task 1; S → Task 2; W → Task 3; U → Task 4; tab mới + chuyển Sức khỏe → Task 1. Đủ.
- **Không placeholder:** mọi step có code/lệnh cụ thể.
- **Nhất quán kiểu:** `Forecast`, `CategoryComparison(Row)`, `CumulativeCashflow`/`CashflowPoint`, `Anomaly`/`AnomalyOptions`, `daysBetween`, `addDaysISO`, `formatCompact`, `median`, `detectAnomalies` — dùng đồng nhất giữa các task; `CurrencyOf` nhập từ `./aggregate`.
