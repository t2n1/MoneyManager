# Cơ cấu danh mục dạng cây + biểu đồ đường — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ở báo cáo, khối "Cơ cấu theo danh mục" hiển thị danh mục cha trước; bấm cha xổ ra con + biểu đồ đường của danh mục vừa bấm (con cũng bấm được).

**Architecture:** Thêm 2 hàm thuần vào `aggregate.ts` (`groupByParent`, `categoryMonthlySeries`), một component vẽ đường `CategoryLineChart`, rồi viết lại `CategoryBreakdownCard` thành dạng cây có accordion + đường, và nối dây trong `ReportsPage` (dùng lại `rangeTxs`/`yearTxs` đã fetch, không gọi thêm mạng).

**Tech Stack:** React 19 + TypeScript, Recharts, Tailwind, Vitest.

## Global Constraints

- Số tiền là **minor units**, quy đổi base qua `convertToBase`; thiếu tỷ giá → bỏ giao dịch đó và bật cờ `hasMissingRate`.
- Mọi báo cáo **bỏ qua** giao dịch `is_debt_flow` và `exclude_from_stats`; `categoryMonthlySeries` cũng bỏ `type !== kind` và giao dịch không có `category_id`.
- Giao diện phải chạy đúng ở **cả light lẫn dark mode** (dùng lớp `dark:` như code hiện có).
- Text hiển thị bằng **tiếng Việt**.
- Danh mục chỉ có **1 cấp** cha–con (`parent_id: string | null`).

---

### Task 1: `groupByParent` ở tầng dữ liệu

**Files:**
- Modify: `src/features/reports/aggregate.ts`
- Test: `src/features/reports/aggregate.test.ts`

**Interfaces:**
- Consumes: `CategorySlice` (đã có: `{ categoryId: string; amount: number }`), `CategoryRow` (từ `../../types/database.types`).
- Produces:
  ```ts
  export interface ParentGroup {
    parentId: string
    total: number   // base minor: direct + tổng con
    direct: number  // base minor: giao dịch gán thẳng cha (>= 0)
    children: CategorySlice[] // xếp amount giảm dần
  }
  export function groupByParent(slices: CategorySlice[], categories: CategoryRow[]): ParentGroup[]
  ```

- [ ] **Step 1: Thêm import CategoryRow ở đầu `aggregate.ts`**

File hiện đã có `import type { TransactionRow } from '../../types/database.types'`. Đổi dòng đó thành:

```ts
import type { CategoryRow, TransactionRow } from '../../types/database.types'
```

- [ ] **Step 2: Viết test thất bại cho `groupByParent`**

Thêm vào cuối `src/features/reports/aggregate.test.ts`. Trước tiên bổ sung import và helper `cat` (đặt gần helper `tx` đầu file — xem Step 2a), rồi thêm khối describe:

Step 2a — sửa import ở đầu file test (chỉ thêm những gì Task 1 dùng;
`categoryMonthlySeries` + `MonthKey` sẽ thêm ở Task 2 để tránh import thừa làm
`tsc --noEmit` báo lỗi ở trạng thái trung gian):

```ts
import type { CategoryRow, TransactionRow } from '../../types/database.types'
import {
  categoryBreakdown,
  categoryComparison,
  cumulativeDailyBalance,
  dailyExpenseTotals,
  groupByParent,
  monthlySeries,
  sumIncomeExpense,
} from './aggregate'
```

Step 2b — thêm helper `cat` ngay sau helper `tx` (sau dòng `}` kết thúc hàm `tx`):

```ts
function cat(p: Partial<CategoryRow> & Pick<CategoryRow, 'id'>): CategoryRow {
  return {
    id: p.id,
    user_id: 'u',
    name: p.name ?? p.id,
    type: p.type ?? 'expense',
    icon: p.icon ?? '📦',
    parent_id: p.parent_id ?? null,
    sort_order: p.sort_order ?? 0,
    is_archived: p.is_archived ?? false,
    created_at: '',
  }
}
```

Step 2c — thêm khối test vào cuối file:

```ts
describe('groupByParent', () => {
  const cats = [
    cat({ id: 'food' }),
    cat({ id: 'coffee', parent_id: 'food' }),
    cat({ id: 'lunch', parent_id: 'food' }),
    cat({ id: 'transport' }),
  ]

  it('gộp con vào cha; total = trực tiếp + tổng con', () => {
    const slices = [
      { categoryId: 'food', amount: 100 },
      { categoryId: 'coffee', amount: 300 },
      { categoryId: 'lunch', amount: 200 },
      { categoryId: 'transport', amount: 50 },
    ]
    expect(groupByParent(slices, cats)).toEqual([
      {
        parentId: 'food',
        total: 600,
        direct: 100,
        children: [
          { categoryId: 'coffee', amount: 300 },
          { categoryId: 'lunch', amount: 200 },
        ],
      },
      { parentId: 'transport', total: 50, direct: 50, children: [] },
    ])
  })

  it('cha chỉ có con → direct = 0', () => {
    expect(groupByParent([{ categoryId: 'coffee', amount: 300 }], cats)).toEqual([
      { parentId: 'food', total: 300, direct: 0, children: [{ categoryId: 'coffee', amount: 300 }] },
    ])
  })

  it('danh mục mồ côi thành cha riêng', () => {
    expect(groupByParent([{ categoryId: 'ghost', amount: 40 }], cats)).toEqual([
      { parentId: 'ghost', total: 40, direct: 40, children: [] },
    ])
  })

  it('xếp cha theo total, con theo amount (giảm dần)', () => {
    const slices = [
      { categoryId: 'lunch', amount: 200 },
      { categoryId: 'coffee', amount: 300 },
      { categoryId: 'transport', amount: 1000 },
    ]
    const g = groupByParent(slices, cats)
    expect(g.map((x) => x.parentId)).toEqual(['transport', 'food'])
    expect(g[1].children.map((c) => c.categoryId)).toEqual(['coffee', 'lunch'])
  })
})
```

- [ ] **Step 3: Chạy test để chắc chắn thất bại**

Run: `npx vitest run src/features/reports/aggregate.test.ts -t groupByParent`
Expected: FAIL — `groupByParent is not a function` / không export.

- [ ] **Step 4: Cài đặt `groupByParent`**

Thêm vào `src/features/reports/aggregate.ts` (đặt ngay sau hàm `categoryBreakdown`):

```ts
export interface ParentGroup {
  parentId: string
  /** base minor: trực tiếp + tổng con */
  total: number
  /** base minor: giao dịch gán thẳng vào cha (>= 0) */
  direct: number
  /** con có số tiền > 0, xếp giảm dần */
  children: CategorySlice[]
}

/**
 * Gom slices phẳng thành nhóm theo cha (1 cấp).
 * - Con (parent_id != null) cộng vào children của cha.
 * - Cha (parent_id == null) hoặc danh mục mồ côi (không có trong categories)
 *   → cộng vào `direct` của chính nó, coi là một cha đứng riêng.
 * Cha xếp theo total giảm dần; con xếp theo amount giảm dần; bỏ cha total = 0.
 */
export function groupByParent(slices: CategorySlice[], categories: CategoryRow[]): ParentGroup[] {
  const catById = new Map(categories.map((c) => [c.id, c]))
  const groups = new Map<string, ParentGroup>()
  const ensure = (parentId: string): ParentGroup => {
    let g = groups.get(parentId)
    if (!g) {
      g = { parentId, total: 0, direct: 0, children: [] }
      groups.set(parentId, g)
    }
    return g
  }
  for (const s of slices) {
    const cat = catById.get(s.categoryId)
    if (cat && cat.parent_id) {
      const g = ensure(cat.parent_id)
      g.children.push({ categoryId: s.categoryId, amount: s.amount })
      g.total += s.amount
    } else {
      const g = ensure(s.categoryId)
      g.direct += s.amount
      g.total += s.amount
    }
  }
  const result = [...groups.values()].filter((g) => g.total > 0)
  for (const g of result) g.children.sort((a, b) => b.amount - a.amount)
  result.sort((a, b) => b.total - a.total)
  return result
}
```

- [ ] **Step 5: Chạy test để chắc chắn pass**

Run: `npx vitest run src/features/reports/aggregate.test.ts -t groupByParent`
Expected: PASS (4 test).

- [ ] **Step 6: Commit**

```bash
git add src/features/reports/aggregate.ts src/features/reports/aggregate.test.ts
git commit -m "feat(bao-cao): groupByParent gom danh muc theo cha"
```

---

### Task 2: `categoryMonthlySeries` ở tầng dữ liệu

**Files:**
- Modify: `src/features/reports/aggregate.ts`
- Test: `src/features/reports/aggregate.test.ts`

**Interfaces:**
- Consumes: `CurrencyOf`, `Rates`, `MonthKey`, `monthKeyForDate`, `convertToBase` (đã import sẵn trong file), hàm nội bộ `monthId` (đã có).
- Produces:
  ```ts
  export interface CategoryMonthlyPoint { key: MonthKey; amount: number }
  export interface CategoryMonthlySeries { points: CategoryMonthlyPoint[]; hasMissingRate: boolean }
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

- [ ] **Step 1: Viết test thất bại**

Trước hết, bổ sung import cho `aggregate.test.ts` (những thứ Task 2 cần, chưa có
từ Task 1). Thêm `categoryMonthlySeries` vào danh sách import từ `./aggregate`
(giữ thứ tự alphabet, chèn sau `categoryComparison`), và thêm dòng import
`MonthKey`:

```ts
import type { MonthKey } from '../../lib/dates'
```

Danh sách import từ `./aggregate` sau khi thêm:

```ts
import {
  categoryBreakdown,
  categoryComparison,
  categoryMonthlySeries,
  cumulativeDailyBalance,
  dailyExpenseTotals,
  groupByParent,
  monthlySeries,
  sumIncomeExpense,
} from './aggregate'
```

Rồi thêm khối test vào cuối `src/features/reports/aggregate.test.ts`:

```ts
describe('categoryMonthlySeries', () => {
  const months: MonthKey[] = [
    { year: 2026, month: 6 },
    { year: 2026, month: 7 },
  ]

  it('gom theo tháng, tháng trống = 0, lọc theo ids & kind', () => {
    const txs = [
      tx({ type: 'expense', amount: 100, category_id: 'coffee', occurred_on: '2026-07-05' }),
      tx({ type: 'expense', amount: 50, category_id: 'coffee', occurred_on: '2026-06-20' }),
      tx({ type: 'expense', amount: 999, category_id: 'other', occurred_on: '2026-07-05' }), // ngoài ids
      tx({ type: 'income', amount: 999, category_id: 'coffee', occurred_on: '2026-07-05' }), // sai kind
    ]
    const r = categoryMonthlySeries(txs, months, 'expense', new Set(['coffee']), 1, currencyOf, 'JPY', RATES)
    expect(r.points).toEqual([
      { key: { year: 2026, month: 6 }, amount: 50 },
      { key: { year: 2026, month: 7 }, amount: 100 },
    ])
    expect(r.hasMissingRate).toBe(false)
  })

  it('bỏ is_debt_flow và exclude_from_stats', () => {
    const txs = [
      tx({ type: 'expense', amount: 100, category_id: 'coffee', occurred_on: '2026-07-05' }),
      tx({ type: 'expense', amount: 100, category_id: 'coffee', occurred_on: '2026-07-05', is_debt_flow: true }),
      tx({ type: 'expense', amount: 100, category_id: 'coffee', occurred_on: '2026-07-05', exclude_from_stats: true }),
    ]
    const r = categoryMonthlySeries(txs, months, 'expense', new Set(['coffee']), 1, currencyOf, 'JPY', RATES)
    expect(r.points[1].amount).toBe(100)
  })

  it('hasMissingRate khi thiếu tỷ giá', () => {
    const currencyOfUsd = (id: string): CurrencyCode => (id === 'usd' ? 'USD' : 'JPY')
    const noUsd: Rates = { JPY: 1, VND: 165 } // thiếu USD
    const txs = [tx({ type: 'expense', amount: 100, category_id: 'coffee', account_id: 'usd', occurred_on: '2026-07-05' })]
    const r = categoryMonthlySeries(txs, months, 'expense', new Set(['coffee']), 1, currencyOfUsd, 'JPY', noUsd)
    expect(r.hasMissingRate).toBe(true)
    expect(r.points[1].amount).toBe(0)
  })
})
```

- [ ] **Step 2: Chạy test để chắc chắn thất bại**

Run: `npx vitest run src/features/reports/aggregate.test.ts -t categoryMonthlySeries`
Expected: FAIL — `categoryMonthlySeries is not a function`.

- [ ] **Step 3: Cài đặt `categoryMonthlySeries`**

Thêm vào `src/features/reports/aggregate.ts` (đặt ngay sau `monthlySeries`, để cạnh hàm dùng `monthId`):

```ts
export interface CategoryMonthlyPoint {
  key: MonthKey
  /** base minor */
  amount: number
}

export interface CategoryMonthlySeries {
  points: CategoryMonthlyPoint[]
  hasMissingRate: boolean
}

/**
 * Số tiền (quy đổi base) theo từng tháng trong `months`, chỉ cho giao dịch có
 * category_id thuộc `ids` và type === kind. Dùng vẽ đường xu hướng một danh mục.
 * Bỏ is_debt_flow / exclude_from_stats. Tháng trống = 0.
 */
export function categoryMonthlySeries(
  txs: TransactionRow[],
  months: MonthKey[],
  kind: 'expense' | 'income',
  ids: Set<string>,
  monthStartDay: number,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): CategoryMonthlySeries {
  const byMonth = new Map<string, number>()
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type !== kind || !t.category_id || t.is_debt_flow || t.exclude_from_stats) continue
    if (!ids.has(t.category_id)) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    const id = monthId(monthKeyForDate(t.occurred_on, monthStartDay))
    byMonth.set(id, (byMonth.get(id) ?? 0) + v)
  }
  const points = months.map((key) => ({ key, amount: byMonth.get(monthId(key)) ?? 0 }))
  return { points, hasMissingRate }
}
```

- [ ] **Step 4: Chạy test để chắc chắn pass**

Run: `npx vitest run src/features/reports/aggregate.test.ts -t categoryMonthlySeries`
Expected: PASS (3 test).

- [ ] **Step 5: Chạy toàn bộ test aggregate cho chắc**

Run: `npx vitest run src/features/reports/aggregate.test.ts`
Expected: PASS toàn bộ (kể cả test cũ).

- [ ] **Step 6: Commit**

```bash
git add src/features/reports/aggregate.ts src/features/reports/aggregate.test.ts
git commit -m "feat(bao-cao): categoryMonthlySeries chuoi tien theo thang cho 1 danh muc"
```

---

### Task 3: Component `CategoryLineChart`

**Files:**
- Create: `src/features/reports/CategoryLineChart.tsx`

**Interfaces:**
- Consumes: `CategoryMonthlyPoint` (Task 2), `MonthKey`, `formatCompact`/`formatMoney`/`CurrencyCode` từ `../../lib/money`.
- Produces:
  ```ts
  interface Props {
    points: CategoryMonthlyPoint[]
    base: CurrencyCode
    color: string
    labelOf: (key: MonthKey) => string
    title: string
  }
  export function CategoryLineChart(props: Props): JSX.Element
  ```

- [ ] **Step 1: Tạo file component**

Tạo `src/features/reports/CategoryLineChart.tsx`. Theo mẫu tooltip/trục của `MonthlyBarsCard.tsx` (tooltip dark mode do `index.css` xử lý), chỉ đổi sang một đường:

```tsx
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import type { MonthKey } from '../../lib/dates'
import type { CategoryMonthlyPoint } from './aggregate'

interface Props {
  points: CategoryMonthlyPoint[]
  base: CurrencyCode
  color: string
  labelOf: (key: MonthKey) => string
  title: string
}

export function CategoryLineChart({ points, base, color, labelOf, title }: Props) {
  const data = points.map((p) => ({ label: labelOf(p.key), amount: p.amount }))

  return (
    <div className="mt-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2">
      <p className="mb-1 truncate text-xs font-medium text-gray-500 dark:text-gray-400">{title}</p>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(v: number) => formatCompact(v, base)}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              formatter={(v) => [formatMoney(Number(v), base), 'Số tiền']}
              labelFormatter={(l) => `Tháng ${l}`}
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
              cursor={{ stroke: 'rgba(148,163,184,0.4)' }}
            />
            <Line type="monotone" dataKey="amount" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Kiểm tra biên dịch (typecheck)**

Run: `npx tsc --noEmit`
Expected: Không lỗi liên quan `CategoryLineChart.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/features/reports/CategoryLineChart.tsx
git commit -m "feat(bao-cao): component CategoryLineChart ve duong xu huong"
```

---

### Task 4: Viết lại `CategoryBreakdownCard` thành dạng cây + accordion + đường

**Files:**
- Modify: `src/features/reports/CategoryBreakdownCard.tsx` (viết lại phần thân)

**Interfaces:**
- Consumes: `groupByParent`, `Breakdown`, `CategoryMonthlyPoint` (Task 1–2); `CategoryLineChart` (Task 3); `MonthKey`.
- Produces (props mới của card — `ReportsPage` ở Task 5 phải truyền):
  ```ts
  lineSeries: (ids: string[]) => CategoryMonthlyPoint[]
  lineLabelOf: (k: MonthKey) => string
  ```

- [ ] **Step 1: Thay toàn bộ nội dung `CategoryBreakdownCard.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import type { MonthKey } from '../../lib/dates'
import type { CategoryRow } from '../../types/database.types'
import { groupByParent, type Breakdown, type CategoryMonthlyPoint } from './aggregate'
import { CategoryLineChart } from './CategoryLineChart'

// Bảng màu cho thanh danh mục (lặp lại nếu > 12). Màu chỉ để phân biệt nhanh —
// nghĩa được truyền tải bằng NHÃN (tên + số tiền + %) nên không phụ thuộc màu.
const PALETTE = [
  '#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
]

// Số danh mục cha hiển thị tối đa trước khi gộp phần còn lại thành "Khác".
const MAX_ROWS = 8

interface Props {
  breakdown: Breakdown
  categories: CategoryRow[]
  base: CurrencyCode
  kind: 'expense' | 'income'
  onKindChange: (kind: 'expense' | 'income') => void
  periodNoun: string
  /** Chuỗi tiền theo tháng cho tập danh mục (dùng vẽ đường xu hướng). */
  lineSeries: (ids: string[]) => CategoryMonthlyPoint[]
  /** Nhãn trục X của đường (theo khung tháng/năm đang xem). */
  lineLabelOf: (k: MonthKey) => string
}

interface ChildRow {
  id: string
  name: string
  icon: string
  value: number
  pct: number // so với tổng của cha
}

interface ParentRow {
  key: string // parentId hoặc '__other__'
  name: string
  icon: string
  value: number
  pct: number // so với tổng toàn khối
  color: string
  clickable: boolean
  parentId: string
  childIds: string[]
  children: ChildRow[]
  direct: number
  directPct: number // so với tổng của cha
}

// Khoá riêng cho dòng "(trực tiếp)" để không trùng id danh mục thật.
const directKey = (parentId: string) => `${parentId}::direct`

/** Một hàng danh mục: nhãn + % + số tiền + thanh tỉ lệ. */
function BreakdownRow({
  icon,
  name,
  pct,
  value,
  barPct,
  color,
  base,
  selected = false,
}: {
  icon: string
  name: string
  pct: number
  value: number
  barPct: number
  color: string
  base: CurrencyCode
  selected?: boolean
}) {
  return (
    <div className={selected ? '-m-1 rounded-md bg-gray-100 p-1 dark:bg-gray-800' : ''}>
      <div className="mb-1 flex items-baseline gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
          {icon ? `${icon} ` : ''}
          {name}
        </span>
        <span className="shrink-0 tabular-nums text-xs text-gray-500 dark:text-gray-400">
          {pct.toFixed(0)}%
        </span>
        <span className="shrink-0 tabular-nums font-medium text-gray-800 dark:text-gray-100">
          {formatMoney(value, base)}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
        role="presentation"
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(barPct, 1.5)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export function CategoryBreakdownCard({
  breakdown,
  categories,
  base,
  kind,
  onKindChange,
  periodNoun,
  lineSeries,
  lineLabelOf,
}: Props) {
  const total = breakdown.total
  const pctOf = (v: number) => (total > 0 ? (v / total) * 100 : 0)

  const groups = groupByParent(breakdown.slices, categories)
  const findCat = (id: string) => categories.find((c) => c.id === id)

  const all: ParentRow[] = groups.map((g, i) => {
    const cat = findCat(g.parentId)
    const childPctOf = (v: number) => (g.total > 0 ? (v / g.total) * 100 : 0)
    return {
      key: g.parentId,
      name: cat?.name ?? '?',
      icon: cat?.icon ?? '📦',
      value: g.total,
      pct: pctOf(g.total),
      color: PALETTE[i % PALETTE.length],
      clickable: true,
      parentId: g.parentId,
      childIds: g.children.map((c) => c.categoryId),
      children: g.children.map((c) => {
        const cc = findCat(c.categoryId)
        return {
          id: c.categoryId,
          name: cc?.name ?? '?',
          icon: cc?.icon ?? '📦',
          value: c.amount,
          pct: childPctOf(c.amount),
        }
      }),
      direct: g.direct,
      directPct: childPctOf(g.direct),
    }
  })

  // Gộp đuôi thành "Khác" (không bấm/xổ được) khi vượt ngưỡng.
  let parents = all
  if (all.length > MAX_ROWS + 1) {
    const head = all.slice(0, MAX_ROWS)
    const tail = all.slice(MAX_ROWS)
    const restValue = tail.reduce((sum, r) => sum + r.value, 0)
    parents = [
      ...head,
      {
        key: '__other__',
        name: `Khác (${tail.length} mục)`,
        icon: '',
        value: restValue,
        pct: pctOf(restValue),
        color: '#9ca3af',
        clickable: false,
        parentId: '',
        childIds: [],
        children: [],
        direct: 0,
        directPct: 0,
      },
    ]
  }

  const [openKey, setOpenKey] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ key: string; ids: string[]; title: string } | null>(
    null,
  )
  // Đổi tab Chi/Thu → đóng accordion, tránh trỏ vào danh mục không còn trong danh sách.
  useEffect(() => {
    setOpenKey(null)
    setSelected(null)
  }, [kind])

  const lineColor = kind === 'expense' ? '#ef4444' : '#16a34a'
  const approx = breakdown.hasForeign ? '≈ ' : ''

  const openParent = (p: ParentRow) => {
    if (openKey === p.key) {
      setOpenKey(null)
      setSelected(null)
    } else {
      setOpenKey(p.key)
      setSelected({ key: p.key, ids: [p.parentId, ...p.childIds], title: p.name })
    }
  }

  return (
    <section className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400">
            Cơ cấu theo danh mục
          </h2>
          {parents.length > 0 && (
            <p className="tabular-nums text-lg font-bold text-gray-800 dark:text-gray-100">
              {approx}
              {formatCompact(total, base)}
            </p>
          )}
        </div>
        <div
          role="tablist"
          aria-label="Loại giao dịch"
          className="flex shrink-0 rounded-lg bg-gray-100 p-0.5 text-xs font-medium dark:bg-gray-800"
        >
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'expense'}
            onClick={() => onKindChange('expense')}
            className={`rounded-md px-3 py-2.5 ${kind === 'expense' ? 'bg-white text-red-600 shadow-sm dark:bg-gray-900 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Chi
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'income'}
            onClick={() => onKindChange('income')}
            className={`rounded-md px-3 py-2.5 ${kind === 'income' ? 'bg-white text-green-600 shadow-sm dark:bg-gray-900 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Thu
          </button>
        </div>
      </div>

      {parents.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          Chưa có {kind === 'expense' ? 'chi tiêu' : 'thu nhập'} trong {periodNoun}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {parents.map((p) => {
            const isOpen = p.clickable && openKey === p.key
            return (
              <li key={p.key}>
                {p.clickable ? (
                  <button
                    type="button"
                    onClick={() => openParent(p)}
                    aria-expanded={isOpen}
                    className="block w-full text-left"
                  >
                    <BreakdownRow
                      icon={p.icon}
                      name={p.name}
                      pct={p.pct}
                      value={p.value}
                      barPct={p.pct}
                      color={p.color}
                      base={base}
                    />
                  </button>
                ) : (
                  <BreakdownRow
                    icon={p.icon}
                    name={p.name}
                    pct={p.pct}
                    value={p.value}
                    barPct={p.pct}
                    color={p.color}
                    base={base}
                  />
                )}

                {isOpen && (
                  <div className="mt-2 pl-3">
                    {selected && (
                      <CategoryLineChart
                        points={lineSeries(selected.ids)}
                        base={base}
                        color={lineColor}
                        labelOf={lineLabelOf}
                        title={`Xu hướng — ${selected.title}`}
                      />
                    )}
                    <ul className="mt-2 space-y-2">
                      {p.children.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setSelected({ key: c.id, ids: [c.id], title: c.name })}
                            className="block w-full text-left"
                          >
                            <BreakdownRow
                              icon={c.icon}
                              name={c.name}
                              pct={c.pct}
                              value={c.value}
                              barPct={c.pct}
                              color={p.color}
                              base={base}
                              selected={selected?.key === c.id}
                            />
                          </button>
                        </li>
                      ))}
                      {p.direct > 0 && (
                        <li>
                          <button
                            type="button"
                            onClick={() =>
                              setSelected({
                                key: directKey(p.parentId),
                                ids: [p.parentId],
                                title: `${p.name} (trực tiếp)`,
                              })
                            }
                            className="block w-full text-left"
                          >
                            <BreakdownRow
                              icon=""
                              name="(trực tiếp)"
                              pct={p.directPct}
                              value={p.direct}
                              barPct={p.directPct}
                              color="#9ca3af"
                              base={base}
                              selected={selected?.key === directKey(p.parentId)}
                            />
                          </button>
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Kiểm tra biên dịch**

Run: `npx tsc --noEmit`
Expected: Chỉ còn lỗi ở `ReportsPage.tsx` vì thiếu prop `lineSeries`/`lineLabelOf` (sẽ sửa ở Task 5). Không có lỗi khác trong `CategoryBreakdownCard.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/features/reports/CategoryBreakdownCard.tsx
git commit -m "feat(bao-cao): co cau danh muc dang cay + accordion + duong"
```

---

### Task 5: Nối dây trong `ReportsPage`

**Files:**
- Modify: `src/features/reports/ReportsPage.tsx`

**Interfaces:**
- Consumes: `categoryMonthlySeries` (Task 2); biến sẵn có `rangeTxs`, `sixMonths`, `yearTxs`, `twelveMonths`, `monthStartDay`, `currencyOf`, `base`, `rates`, `kind`.
- Produces: truyền prop `lineSeries` + `lineLabelOf` cho cả hai `CategoryBreakdownCard` (Tháng và Năm).

- [ ] **Step 1: Thêm import `categoryMonthlySeries`**

Sửa dòng import aggregate (hiện: `import { categoryBreakdown, monthlySeries, sumIncomeExpense } from './aggregate'`) thành:

```ts
import { categoryBreakdown, categoryMonthlySeries, monthlySeries, sumIncomeExpense } from './aggregate'
```

- [ ] **Step 2: Tạo hai callback vẽ đường (Tháng & Năm)**

Thêm ngay trước câu lệnh `return (` trong `ReportsPage` (sau các `useMemo` tính toán):

```tsx
// Đường xu hướng một danh mục — dùng lại dữ liệu nhiều tháng đã fetch (không gọi thêm mạng).
const lineSeriesMonth = (ids: string[]) =>
  categoryMonthlySeries(rangeTxs, sixMonths, kind, new Set(ids), monthStartDay, currencyOf, base, rates ?? {}).points
const lineSeriesYear = (ids: string[]) =>
  categoryMonthlySeries(yearTxs, twelveMonths, kind, new Set(ids), monthStartDay, currencyOf, base, rates ?? {}).points
const lineLabelMonth = (k: MonthKey) => `${k.month}/${String(k.year).slice(2)}`
const lineLabelYear = (k: MonthKey) => String(k.month)
```

- [ ] **Step 3: Truyền prop cho card ở chế độ THÁNG**

Trong khối `period === 'month' && view === 'charts'`, thêm 2 prop vào `<CategoryBreakdownCard ...>`:

```tsx
          <CategoryBreakdownCard
            breakdown={breakdown}
            categories={categories}
            base={base}
            kind={kind}
            onKindChange={setKind}
            periodNoun="tháng này"
            lineSeries={lineSeriesMonth}
            lineLabelOf={lineLabelMonth}
          />
```

- [ ] **Step 4: Truyền prop cho card ở chế độ NĂM**

Trong khối `period === 'year'`, thêm 2 prop vào `<CategoryBreakdownCard ...>`:

```tsx
          <CategoryBreakdownCard
            breakdown={yearBreakdown}
            categories={categories}
            base={base}
            kind={kind}
            onKindChange={setKind}
            periodNoun="năm này"
            lineSeries={lineSeriesYear}
            lineLabelOf={lineLabelYear}
          />
```

- [ ] **Step 5: Kiểm tra biên dịch + lint**

Run: `npx tsc --noEmit`
Expected: Không lỗi.

Run: `npx vitest run src/features/reports/aggregate.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 6: Commit**

```bash
git add src/features/reports/ReportsPage.tsx
git commit -m "feat(bao-cao): noi day duong xu huong cho card co cau (thang & nam)"
```

---

### Task 6: Kiểm tra trực quan trên trình duyệt

**Files:** (không sửa code trừ khi phát hiện lỗi)

- [ ] **Step 1: Chạy dev server**

Dùng `preview_start` với cấu hình dev của dự án (tạo `.claude/launch.json` nếu chưa có: `npm run dev`, port theo Vite — thường 5173). Mở trang `/reports`.

- [ ] **Step 2: Kiểm tra chế độ Tháng**

- Khối "Cơ cấu theo danh mục" hiện danh mục **cha** trước.
- Bấm một cha → xổ ra: biểu đồ đường (tiêu đề "Xu hướng — {tên cha}") + danh sách con + dòng "(trực tiếp)" nếu có.
- Bấm một con → biểu đồ đổi sang con đó, tiêu đề đổi theo, hàng con được tô nền chọn.
- Bấm cha khác → cha cũ đóng, cha mới mở.
- Đổi tab Chi/Thu → accordion đóng lại.
- Dùng `read_console_messages` để chắc không có lỗi runtime.

- [ ] **Step 3: Kiểm tra chế độ Năm**

Chuyển sang tab "Năm": card hoạt động tương tự, đường vẽ 12 tháng (nhãn trục X là số tháng 1–12).

- [ ] **Step 4: Kiểm tra dark mode**

Dùng `resize_window` với `colorScheme: 'dark'` (hoặc bật dark mode của app): chữ, thanh, biểu đồ đường và tooltip đều đọc được.

- [ ] **Step 5: Chụp màn hình làm bằng chứng**

`computer { action: "screenshot" }` cho trạng thái một cha đang mở (có đường + con).

- [ ] **Step 6 (nếu phát hiện lỗi):** đọc source, sửa, commit; lặp lại từ Step 2.

---

## Ghi chú thực thi

- `rangeTxs` chỉ được fetch khi `period === 'month' && view === 'charts'` — đúng lúc card Tháng hiển thị, nên `lineSeriesMonth` luôn có dữ liệu khi cần.
- Điều hướng sang tháng/năm khác: nếu cha đang mở vẫn còn trong danh sách thì giữ mở (dữ liệu tự cập nhật); nếu không còn, phần xổ đơn giản không render — chấp nhận được.
- Không đổi tầng hook/fetch, không thêm cấp danh mục, không thêm tuỳ chọn khung thời gian (theo spec).
