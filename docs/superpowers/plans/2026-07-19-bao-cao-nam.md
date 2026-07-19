# Báo cáo theo năm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm chế độ xem báo cáo cả năm (nút gạt Tháng ⇄ Năm) vào màn Báo cáo, hiển thị tổng thu/chi/số dư năm, TB tháng, tỷ lệ tiết kiệm, biểu đồ cột 12 tháng và cơ cấu danh mục cả năm.

**Architecture:** Thuần đọc + UI, không đụng schema/repo. Thêm 2 helper ngày (`getYearRange`, `formatYearLabel`). Tách 2 khối biểu đồ sẵn có (cơ cấu danh mục + cột thu/chi) thành component dùng chung cho cả tháng và năm, rồi thêm state `period`/`year` + nội dung năm vào `ReportsPage`. Mọi số liệu tái dùng nguyên `categoryBreakdown` / `monthlySeries` / `sumIncomeExpense` trong `reports/aggregate.ts`.

**Tech Stack:** React + TypeScript + Recharts + TanStack Query + Vitest.

## Global Constraints

- Tiền lưu minor units (`bigint`), quy đổi base qua `convertToBase`; **không dùng float** cho tiền.
- Đa tiền tệ JPY/VND/USD; tiền tệ theo tài khoản (`currencyOf`).
- Mọi truy vấn theo tháng/năm tôn trọng `month_start_day` qua `getMonthRange` / `getYearRange`.
- UI tiếng Việt. Tính năng này **không đụng** `src/data/repo.ts`, migration, hay `src/features/reports/aggregate.ts` (chỉ tái dùng).
- Sau mỗi task: `npm run build`, `npm run lint`, `npm test` phải sạch.
- Mỗi task 1 commit, message **không dấu** (ví dụ: `Bao cao nam: ...`).
- Tránh chạm các file phiên khác đang làm feature #2 (accounts, icons, categories, remittance, assets/aggregate, cardAutopay). Plan này chỉ chạm `src/lib/dates.ts`, `src/lib/dates.test.ts`, `src/features/reports/*`.

---

## File Structure

- `src/lib/dates.ts` — **modify**: thêm `getYearRange`, `formatYearLabel`.
- `src/lib/dates.test.ts` — **modify**: test 2 helper mới.
- `src/features/reports/CategoryBreakdownCard.tsx` — **create**: card cơ cấu danh mục (pie + legend + toggle Chi/Thu), dùng cho cả tháng và năm.
- `src/features/reports/MonthlyBarsCard.tsx` — **create**: card biểu đồ cột thu/chi theo tháng, dùng cho cả 6 tháng và 12 tháng.
- `src/features/reports/ReportsPage.tsx` — **modify**: dùng 2 card mới cho chế độ tháng; thêm nút gạt Tháng|Năm + điều hướng năm + nội dung năm.

---

## Task 1: Helper năm trong dates.ts

**Files:**
- Modify: `src/lib/dates.ts`
- Test: `src/lib/dates.test.ts`

**Interfaces:**
- Consumes: `getMonthRange(key: MonthKey, monthStartDay?: number): MonthRange`, `MonthRange` (đã có).
- Produces:
  - `getYearRange(year: number, monthStartDay?: number): MonthRange` — khoảng ngày cả năm tài chính (`start` gồm, `end` loại trừ).
  - `formatYearLabel(year: number): string` — trả `"Năm <year>"`.

- [ ] **Step 1: Viết test thất bại**

Thêm `getYearRange` và `formatYearLabel` vào import ở đầu `src/lib/dates.test.ts` (chèn theo thứ tự bảng chữ cái trong danh sách import hiện có), rồi thêm 2 describe block sau vào cuối file:

```ts
describe('getYearRange', () => {
  it('năm dương lịch chuẩn (monthStartDay = 1)', () => {
    expect(getYearRange(2026, 1)).toEqual({
      start: '2026-01-01',
      end: '2027-01-01',
    })
  })

  it('năm tài chính bắt đầu ngày 25 (lệch sang năm sau)', () => {
    expect(getYearRange(2026, 25)).toEqual({
      start: '2026-01-25',
      end: '2027-01-25',
    })
  })

  it('mặc định monthStartDay = 1', () => {
    expect(getYearRange(2030)).toEqual({
      start: '2030-01-01',
      end: '2031-01-01',
    })
  })
})

describe('formatYearLabel', () => {
  it('nhãn năm tiếng Việt', () => {
    expect(formatYearLabel(2026)).toBe('Năm 2026')
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run src/lib/dates.test.ts`
Expected: FAIL — `getYearRange is not a function` / `formatYearLabel is not a function`.

- [ ] **Step 3: Cài đặt tối thiểu**

Thêm vào cuối `src/lib/dates.ts`:

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

- [ ] **Step 4: Chạy test để xác nhận đạt**

Run: `npx vitest run src/lib/dates.test.ts`
Expected: PASS (tất cả case, gồm cả getMonthRange cũ).

- [ ] **Step 5: Lint + build**

Run: `npm run lint && npm run build`
Expected: sạch, không lỗi.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dates.ts src/lib/dates.test.ts
git commit -m "Bao cao nam: helper getYearRange + formatYearLabel"
```

---

## Task 2: Component CategoryBreakdownCard

Tách khối "Cơ cấu theo danh mục" (pie + legend + toggle Chi/Thu) khỏi `ReportsPage` thành component dùng chung. Chưa rewire `ReportsPage` (làm ở Task 4) — task này chỉ tạo file mới, đảm bảo build sạch.

**Files:**
- Create: `src/features/reports/CategoryBreakdownCard.tsx`

**Interfaces:**
- Consumes: `Breakdown` từ `./aggregate` (`{ slices: {categoryId,amount}[], total, hasForeign, hasMissingRate }`); `CategoryRow` từ `../../types/database.types`; `formatMoney`, `formatCompact`, `CurrencyCode` từ `../../lib/money`.
- Produces: component `CategoryBreakdownCard(props)` với props:
  - `breakdown: Breakdown`
  - `categories: CategoryRow[]`
  - `base: CurrencyCode`
  - `kind: 'expense' | 'income'`
  - `onKindChange: (kind: 'expense' | 'income') => void`
  - `periodNoun: string` (ví dụ `'tháng này'` / `'năm này'`)

- [ ] **Step 1: Tạo file component**

Tạo `src/features/reports/CategoryBreakdownCard.tsx`:

```tsx
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import type { CategoryRow } from '../../types/database.types'
import type { Breakdown } from './aggregate'

// Bảng màu cho lát bánh (lặp lại nếu > 12 danh mục)
const PALETTE = [
  '#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
]

interface Props {
  breakdown: Breakdown
  categories: CategoryRow[]
  base: CurrencyCode
  kind: 'expense' | 'income'
  onKindChange: (kind: 'expense' | 'income') => void
  periodNoun: string
}

export function CategoryBreakdownCard({
  breakdown,
  categories,
  base,
  kind,
  onKindChange,
  periodNoun,
}: Props) {
  const pieData = breakdown.slices.map((s, i) => {
    const cat = categories.find((c) => c.id === s.categoryId)
    return {
      name: cat?.name ?? '?',
      icon: cat?.icon ?? '📦',
      value: s.amount,
      color: PALETTE[i % PALETTE.length],
      pct: breakdown.total > 0 ? (s.amount / breakdown.total) * 100 : 0,
    }
  })
  const approx = breakdown.hasForeign ? '≈ ' : ''

  return (
    <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400">Cơ cấu theo danh mục</h2>
        <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => onKindChange('expense')}
            className={`rounded-md px-3 py-1 ${kind === 'expense' ? 'bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Chi
          </button>
          <button
            type="button"
            onClick={() => onKindChange('income')}
            className={`rounded-md px-3 py-1 ${kind === 'income' ? 'bg-white dark:bg-gray-900 text-green-600 dark:text-green-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Thu
          </button>
        </div>
      </div>

      {pieData.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
          Chưa có {kind === 'expense' ? 'chi tiêu' : 'thu nhập'} trong {periodNoun}
        </p>
      ) : (
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <div className="relative h-48 w-48 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={80}
                  paddingAngle={1}
                  strokeWidth={0}
                >
                  {pieData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => formatMoney(Number(v), base)}
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] text-gray-400 dark:text-gray-500">Tổng</span>
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                {approx}
                {formatCompact(breakdown.total, base)}
              </span>
            </div>
          </div>

          <ul className="flex-1 space-y-1.5 self-stretch">
            {pieData.map((d) => (
              <li key={d.name} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: d.color }}
                />
                <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
                  {d.icon} {d.name}
                </span>
                <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{d.pct.toFixed(0)}%</span>
                <span className="shrink-0 font-medium text-gray-800 dark:text-gray-100">
                  {formatMoney(d.value, base)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Build + lint**

Run: `npm run build && npm run lint`
Expected: sạch. (Component chưa được dùng — chấp nhận; sẽ dùng ở Task 4. Nếu lint báo "unused", bỏ qua vì file export sẽ được import ở Task 4; không thêm eslint-disable.)

- [ ] **Step 3: Commit**

```bash
git add src/features/reports/CategoryBreakdownCard.tsx
git commit -m "Bao cao nam: tach component CategoryBreakdownCard"
```

---

## Task 3: Component MonthlyBarsCard

Tách khối biểu đồ cột thu/chi thành component nhận `series` + hàm tạo nhãn trục X. Chưa rewire `ReportsPage`.

**Files:**
- Create: `src/features/reports/MonthlyBarsCard.tsx`

**Interfaces:**
- Consumes: `MonthlySeries` từ `./aggregate` (`{ points: {key: MonthKey, income, expense}[], hasMissingRate }`); `MonthKey` từ `../../lib/dates`; `formatMoney`, `formatCompact`, `CurrencyCode` từ `../../lib/money`.
- Produces: component `MonthlyBarsCard(props)` với props:
  - `series: MonthlySeries`
  - `base: CurrencyCode`
  - `title: string`
  - `labelOf: (key: MonthKey) => string`

- [ ] **Step 1: Tạo file component**

Tạo `src/features/reports/MonthlyBarsCard.tsx`:

```tsx
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import type { MonthKey } from '../../lib/dates'
import type { MonthlySeries } from './aggregate'

interface Props {
  series: MonthlySeries
  base: CurrencyCode
  title: string
  labelOf: (key: MonthKey) => string
}

export function MonthlyBarsCard({ series, base, title, labelOf }: Props) {
  const barData = series.points.map((p) => ({
    label: labelOf(p.key),
    income: p.income,
    expense: p.expense,
  }))

  return (
    <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">{title}</h2>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(v: number) => formatCompact(v, base)}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              formatter={(v, name) => [
                formatMoney(Number(v), base),
                name === 'income' ? 'Thu' : 'Chi',
              ]}
              labelFormatter={(l) => `Tháng ${l}`}
              contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
            />
            <Bar dataKey="income" fill="#16a34a" radius={[3, 3, 0, 0]} />
            <Bar dataKey="expense" fill="#ef4444" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex justify-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-green-600" /> Thu
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Chi
        </span>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Build + lint**

Run: `npm run build && npm run lint`
Expected: sạch.

- [ ] **Step 3: Commit**

```bash
git add src/features/reports/MonthlyBarsCard.tsx
git commit -m "Bao cao nam: tach component MonthlyBarsCard"
```

---

## Task 4: Nút gạt Tháng|Năm + nội dung năm trong ReportsPage

Rewire chế độ tháng dùng 2 component mới (giữ nguyên hành vi) và thêm chế độ năm.

**Files:**
- Modify: `src/features/reports/ReportsPage.tsx` (ghi đè toàn bộ nội dung như dưới)

**Interfaces:**
- Consumes: `getYearRange`, `formatYearLabel` (Task 1); `CategoryBreakdownCard` (Task 2); `MonthlyBarsCard` (Task 3); `sumIncomeExpense`, `categoryBreakdown`, `monthlySeries` từ `./aggregate`; `useRangeTransactions(range, enabled?)` từ `../../hooks/queries`.
- Produces: (không có; đây là màn cuối)

- [ ] **Step 1: Ghi đè ReportsPage.tsx**

Ghi đè toàn bộ `src/features/reports/ReportsPage.tsx` bằng:

```tsx
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { BudgetView } from '../budgets/BudgetView'
import { InsightsView } from './InsightsView'
import { CategoryBreakdownCard } from './CategoryBreakdownCard'
import { MonthlyBarsCard } from './MonthlyBarsCard'
import {
  useAccounts,
  useCategories,
  useMonthTransactions,
  useProfile,
  useRangeTransactions,
  useRates,
} from '../../hooks/queries'
import {
  addMonths,
  formatMonthLabel,
  formatYearLabel,
  getMonthRange,
  getYearRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import { categoryBreakdown, monthlySeries, sumIncomeExpense } from './aggregate'

export function ReportsPage() {
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [searchParams] = useSearchParams()
  const [period, setPeriod] = useState<'month' | 'year'>('month')
  const [view, setView] = useState<'charts' | 'insights' | 'budget'>(
    searchParams.get('view') === 'budget'
      ? 'budget'
      : searchParams.get('view') === 'insights'
        ? 'insights'
        : 'charts',
  )

  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base

  // ----- Chế độ THÁNG -----
  const [monthKey, setMonthKey] = useState<MonthKey | null>(null)
  const activeMonthKey = monthKey ?? monthKeyForDate(toISODate(new Date()), monthStartDay)
  const { data: monthTxs = [] } = useMonthTransactions(activeMonthKey)

  // Khoảng 6 tháng gần nhất (tính cả tháng đang xem) cho biểu đồ cột
  const sixMonths = useMemo(
    () => Array.from({ length: 6 }, (_, i) => addMonths(activeMonthKey, i - 5)),
    [activeMonthKey],
  )
  const sixMonthRange = useMemo(
    () => ({
      start: getMonthRange(sixMonths[0], monthStartDay).start,
      end: getMonthRange(activeMonthKey, monthStartDay).end,
    }),
    [sixMonths, activeMonthKey, monthStartDay],
  )
  const { data: rangeTxs = [] } = useRangeTransactions(
    sixMonthRange,
    !!profile && period === 'month' && view === 'charts',
  )

  const breakdown = useMemo(
    () => categoryBreakdown(monthTxs, kind, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, kind, accounts, base, rates],
  )
  const series = useMemo(
    () => monthlySeries(rangeTxs, sixMonths, monthStartDay, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, sixMonths, monthStartDay, accounts, base, rates],
  )

  // ----- Chế độ NĂM -----
  const [year, setYear] = useState<number | null>(null)
  const activeYear = year ?? monthKeyForDate(toISODate(new Date()), monthStartDay).year
  const yearRange = useMemo(
    () => getYearRange(activeYear, monthStartDay),
    [activeYear, monthStartDay],
  )
  const { data: yearTxs = [] } = useRangeTransactions(yearRange, !!profile && period === 'year')

  const twelveMonths = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ year: activeYear, month: i + 1 })),
    [activeYear],
  )
  const yearBreakdown = useMemo(
    () => categoryBreakdown(yearTxs, kind, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearTxs, kind, accounts, base, rates],
  )
  const yearSeries = useMemo(
    () => monthlySeries(yearTxs, twelveMonths, monthStartDay, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearTxs, twelveMonths, monthStartDay, accounts, base, rates],
  )
  const yearSums = useMemo(
    () => sumIncomeExpense(yearTxs, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearTxs, accounts, base, rates],
  )
  const yearNet = yearSums.income - yearSums.expense
  const avgExpense = Math.round(yearSums.expense / 12)
  const savingsRate = yearSums.income > 0 ? Math.round((yearNet / yearSums.income) * 100) : null
  const yearApprox = yearSums.hasForeign ? '≈ ' : ''

  const monthMissingRate = breakdown.hasMissingRate || series.hasMissingRate
  const yearMissingRate =
    yearBreakdown.hasMissingRate || yearSeries.hasMissingRate || yearSums.hasMissingRate
  const showMissingRate =
    period === 'year' ? yearMissingRate : view === 'charts' && monthMissingRate

  return (
    <div className="flex flex-col gap-4 p-3 lg:p-6">
      {/* Header điều hướng tháng/năm */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            period === 'month'
              ? setMonthKey((k) => addMonths(k ?? activeMonthKey, -1))
              : setYear((y) => (y ?? activeYear) - 1)
          }
          className="rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label={period === 'month' ? 'Tháng trước' : 'Năm trước'}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">
          {period === 'month' ? formatMonthLabel(activeMonthKey) : formatYearLabel(activeYear)}
        </h1>
        <button
          type="button"
          onClick={() =>
            period === 'month'
              ? setMonthKey((k) => addMonths(k ?? activeMonthKey, 1))
              : setYear((y) => (y ?? activeYear) + 1)
          }
          className="rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label={period === 'month' ? 'Tháng sau' : 'Năm sau'}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Nút gạt Tháng | Năm */}
      <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-sm font-medium">
        <button
          type="button"
          onClick={() => setPeriod('month')}
          className={`flex-1 rounded-md py-1.5 ${period === 'month' ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
        >
          Tháng
        </button>
        <button
          type="button"
          onClick={() => setPeriod('year')}
          className={`flex-1 rounded-md py-1.5 ${period === 'year' ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
        >
          Năm
        </button>
      </div>

      {/* Tab chỉ hiện ở chế độ Tháng */}
      {period === 'month' && (
        <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-sm font-medium">
          <button
            type="button"
            onClick={() => setView('charts')}
            className={`flex-1 rounded-md py-1.5 ${view === 'charts' ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Biểu đồ
          </button>
          <button
            type="button"
            onClick={() => setView('insights')}
            className={`flex-1 rounded-md py-1.5 ${view === 'insights' ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Thấu hiểu
          </button>
          <button
            type="button"
            onClick={() => setView('budget')}
            className={`flex-1 rounded-md py-1.5 ${view === 'budget' ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Ngân sách
          </button>
        </div>
      )}

      {showMissingRate && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 p-2 text-xs text-amber-700 dark:text-amber-300">
          Một phần giao dịch ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

      {/* Nội dung THÁNG */}
      {period === 'month' && view === 'charts' && (
        <>
          <CategoryBreakdownCard
            breakdown={breakdown}
            categories={categories}
            base={base}
            kind={kind}
            onKindChange={setKind}
            periodNoun="tháng này"
          />
          <MonthlyBarsCard
            series={series}
            base={base}
            title="Thu / chi 6 tháng gần nhất"
            labelOf={(k) => `${k.month}/${String(k.year).slice(2)}`}
          />
        </>
      )}
      {period === 'month' && view === 'insights' && <InsightsView monthKey={activeMonthKey} />}
      {period === 'month' && view === 'budget' && <BudgetView monthKey={activeMonthKey} />}

      {/* Nội dung NĂM */}
      {period === 'year' && (
        <>
          <section className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
              <p className="text-xs text-gray-500 dark:text-gray-400">Thu</p>
              <p className="mt-1 text-sm font-bold text-green-600 dark:text-green-400">
                {yearApprox}
                {formatCompact(yearSums.income, base)}
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
              <p className="text-xs text-gray-500 dark:text-gray-400">Chi</p>
              <p className="mt-1 text-sm font-bold text-red-600 dark:text-red-400">
                {yearApprox}
                {formatCompact(yearSums.expense, base)}
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
              <p className="text-xs text-gray-500 dark:text-gray-400">Số dư</p>
              <p
                className={`mt-1 text-sm font-bold ${yearNet >= 0 ? 'text-gray-800 dark:text-gray-100' : 'text-red-600 dark:text-red-400'}`}
              >
                {yearApprox}
                {formatCompact(yearNet, base)}
              </p>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
              <p className="text-xs text-gray-500 dark:text-gray-400">Chi TB/tháng</p>
              <p className="mt-1 text-sm font-bold text-gray-800 dark:text-gray-100">
                {yearApprox}
                {formatMoney(avgExpense, base)}
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
              <p className="text-xs text-gray-500 dark:text-gray-400">Tỷ lệ tiết kiệm</p>
              <p className="mt-1 text-sm font-bold text-gray-800 dark:text-gray-100">
                {savingsRate === null ? '—' : `${savingsRate}%`}
              </p>
            </div>
          </section>

          <CategoryBreakdownCard
            breakdown={yearBreakdown}
            categories={categories}
            base={base}
            kind={kind}
            onKindChange={setKind}
            periodNoun="năm này"
          />
          <MonthlyBarsCard
            series={yearSeries}
            base={base}
            title="Thu / chi 12 tháng"
            labelOf={(k) => String(k.month)}
          />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build + lint + test toàn bộ**

Run: `npm run build && npm run lint && npm test`
Expected: tất cả sạch.

- [ ] **Step 3: Kiểm chứng trong trình duyệt**

Khởi động dev server (dùng preview_start theo `.claude/launch.json`; nếu chưa có config, tạo với `npm run dev` + port Vite mặc định 5173). Mở màn Báo cáo và kiểm:
  1. Mặc định ở chế độ **Tháng** — pie cơ cấu + cột 6 tháng hiển thị y như trước, toggle Chi/Thu và điều hướng tháng hoạt động, tab Thấu hiểu/Ngân sách còn nguyên.
  2. Bấm **Năm** — header thành "Năm 2026", ẩn hàng tab; hiện thẻ Thu/Chi/Số dư, Chi TB/tháng, Tỷ lệ tiết kiệm, pie cơ cấu cả năm, cột 12 tháng (nhãn 1–12).
  3. Nút ◄ ► đổi năm; toggle Chi/Thu đổi pie cả năm.
  4. Quay lại **Tháng** giữ đúng tháng đang xem.

Dùng read_console_messages để chắc không có lỗi runtime. Chụp màn hình chế độ Năm làm bằng chứng.

- [ ] **Step 4: Commit**

```bash
git add src/features/reports/ReportsPage.tsx
git commit -m "Bao cao nam: nut gat Thang/Nam + noi dung bao cao nam"
```

---

## Self-Review (đã rà)

**Spec coverage:**
- Nút gạt Tháng⇄Năm, header đổi theo period, ẩn tab khi Năm → Task 4. ✓
- Năm tài chính tôn trọng month_start_day (`getYearRange`) → Task 1. ✓
- Một lần fetch `yearTxs`, enabled khi period==='year' → Task 4. ✓
- Thẻ tổng năm (Thu/Chi/Số dư) + TB tháng + tỷ lệ tiết kiệm → Task 4. ✓
- Biểu đồ cột 12 tháng (nhãn 1–12) → Task 3 + Task 4. ✓
- Cơ cấu danh mục cả năm (toggle Chi/Thu dùng chung) → Task 2 + Task 4. ✓
- Cảnh báo thiếu tỷ giá tái dùng → Task 4 (`showMissingRate`). ✓
- Không đụng schema/repo/aggregate.ts → chỉ dates.ts + reports/*. ✓
- Test `getYearRange` với monthStartDay 1 và 25 → Task 1. ✓

**Type consistency:** `Breakdown`, `MonthlySeries`, `MonthKey`, `CategoryRow`, `CurrencyCode`, `IncomeExpenseSum` (qua `sumIncomeExpense`) khớp giữa các task và với `aggregate.ts`/`dates.ts` hiện có. Props component khớp giữa nơi định nghĩa (Task 2/3) và nơi dùng (Task 4).

**Placeholder scan:** không còn TBD/TODO; mọi step có code/command cụ thể.
