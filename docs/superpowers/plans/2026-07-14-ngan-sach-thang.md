# Ngân sách tháng — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép đặt hạn mức chi theo danh mục cho từng tháng, theo dõi tiến độ qua progress bar và cảnh báo khi vượt 80%/100%.

**Architecture:** Thêm bảng `budgets` (migration 0002) + cập nhật thủ công types và cả 2 repo (demo/supabase). Logic tính tiến độ nằm trong helper thuần `buildBudgetReport` (tái dùng `convertToBase` như báo cáo). UI là một tab con "Ngân sách" trong màn Báo cáo; badge cảnh báo hiện ở màn Nhập.

**Tech Stack:** React + Vite + TypeScript + Tailwind + TanStack Query + Vitest. Không thêm thư viện mới.

## Global Constraints

- Mọi đọc/ghi đi qua interface `Repo` trong `src/data/repo.ts`; hiện thực CẢ HAI `demoRepo` và `supabaseRepo`.
- Tiền lưu ở minor units (`bigint`/`number`), KHÔNG float. Hạn mức lưu theo **base currency** (`profiles.base_currency`, mặc định JPY).
- Mọi query theo "tháng" đi qua `getMonthRange()` (tôn trọng `month_start_day`).
- `month_key` là chuỗi `"YYYY-MM"` sinh từ `MonthKey`.
- UI hoàn toàn tiếng Việt. Verify ở viewport 375px bằng `get_page_text`/`read_page`/`javascript_tool` (screenshot hay timeout).
- TDD cho mọi helper thuần. Mỗi task commit riêng, message **không dấu** (tránh lỗi encoding Windows).
- Sau mỗi task ảnh hưởng build: `npm run build` + `npm run lint` + `npm test` phải sạch.
- KHÔNG dùng PowerShell để sửa file có tiếng Việt (hỏng UTF-8) — dùng Edit/Write.
- Ngưỡng trạng thái: `ok` < 80%, `warn` ≥ 80%, `over` ≥ 100%.
- Chỉ danh mục chi (`expense`) có ngân sách.

---

### Task 1: Migration 0002 + types

**Files:**
- Create: `supabase/migrations/0002_budgets.sql`
- Modify: `src/types/database.types.ts`

**Interfaces:**
- Produces: type `BudgetRow = { id: string; user_id: string; category_id: string; month_key: string; amount: number; created_at: string; updated_at: string }` và mục `budgets` trong `Database['public']['Tables']`.

- [ ] **Step 1: Tạo file migration**

Tạo `supabase/migrations/0002_budgets.sql`:

```sql
-- ============================================================
-- Sổ Chi Tiêu — Migration 0002: bảng budgets (ngân sách tháng)
-- Hạn mức chi theo danh mục cho từng tháng. Lưu theo base_currency.
-- ============================================================

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null,
  -- "YYYY-MM" theo MonthKey (tôn trọng month_start_day). VD: '2026-07'
  month_key text not null check (month_key ~ '^\d{4}-\d{2}$'),
  -- Minor units theo base_currency (JPY = yên). Không bao giờ dùng float.
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite FK: chặn tham chiếu danh mục của user khác
  foreign key (category_id, user_id) references public.categories (id, user_id),
  -- Một danh mục chỉ có 1 hạn mức cho mỗi tháng → upsert theo khóa này
  unique (user_id, category_id, month_key)
);

create index idx_budget_user_month on public.budgets (user_id, month_key);

alter table public.budgets enable row level security;

create policy "own rows" on public.budgets
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger set_updated_at
  before update on public.budgets
  for each row
  execute function extensions.moddatetime (updated_at);
```

- [ ] **Step 2: Thêm `BudgetRow` vào types**

Trong `src/types/database.types.ts`, sau khối `AccountBalanceRow` (dòng ~70), thêm:

```ts
export type BudgetRow = {
  id: string
  user_id: string
  category_id: string
  month_key: string // "YYYY-MM"
  amount: number // minor units theo base_currency
  created_at: string
  updated_at: string
}
```

- [ ] **Step 3: Thêm `budgets` vào `Database['public']['Tables']`**

Trong cùng file, thêm vào object `Tables` (sau `transactions`, trước dấu `}` đóng `Tables`):

```ts
      budgets: {
        Row: BudgetRow
        Insert: InsertOf<
          BudgetRow,
          'user_id' | 'category_id' | 'month_key' | 'amount',
          'id'
        >
        Update: Partial<Pick<BudgetRow, 'amount'>>
        Relationships: []
      }
```

- [ ] **Step 4: Kiểm tra type-check**

Run: `npm run build`
Expected: build PASS (không lỗi TS).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_budgets.sql src/types/database.types.ts
git commit -m "GD3 muc1: migration 0002 budgets + types"
```

---

### Task 2: Helpers ngày tháng `monthKeyString` / `parseMonthKey`

**Files:**
- Modify: `src/lib/dates.ts`
- Test: `src/lib/dates.test.ts`

**Interfaces:**
- Consumes: `MonthKey`, `pad` (đã có trong `dates.ts`).
- Produces: `monthKeyString(key: MonthKey): string` (→ "YYYY-MM"), `parseMonthKey(s: string): MonthKey`.

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `src/lib/dates.test.ts` (import `monthKeyString`, `parseMonthKey` vào dòng import sẵn có từ `./dates`):

```ts
describe('monthKeyString / parseMonthKey', () => {
  it('monthKeyString đệm 0 cho tháng < 10', () => {
    expect(monthKeyString({ year: 2026, month: 7 })).toBe('2026-07')
    expect(monthKeyString({ year: 2026, month: 12 })).toBe('2026-12')
  })

  it('parseMonthKey đảo ngược monthKeyString', () => {
    expect(parseMonthKey('2026-07')).toEqual({ year: 2026, month: 7 })
    expect(parseMonthKey(monthKeyString({ year: 2025, month: 1 }))).toEqual({
      year: 2025,
      month: 1,
    })
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm test -- dates`
Expected: FAIL — `monthKeyString is not a function` (hoặc lỗi import).

- [ ] **Step 3: Hiện thực helper**

Thêm vào cuối `src/lib/dates.ts`:

```ts
/** MonthKey → "YYYY-MM" (dùng cho budgets.month_key). */
export function monthKeyString(key: MonthKey): string {
  return `${key.year}-${pad(key.month)}`
}

/** "YYYY-MM" → MonthKey. */
export function parseMonthKey(s: string): MonthKey {
  const [year, month] = s.split('-').map(Number)
  return { year, month }
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm test -- dates`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dates.ts src/lib/dates.test.ts
git commit -m "GD3 muc1: helper monthKeyString parseMonthKey"
```

---

### Task 3: Helper thuần `buildBudgetReport`

**Files:**
- Create: `src/features/budgets/progress.ts`
- Test: `src/features/budgets/progress.test.ts`

**Interfaces:**
- Consumes: `convertToBase`, `Rates` từ `../../lib/rates`; `CurrencyCode` từ `../../lib/money`; `BudgetRow`, `TransactionRow` từ `../../types/database.types`; `CurrencyOf` từ `../reports/aggregate`.
- Produces:
  - `type BudgetStatus = 'ok' | 'warn' | 'over'`
  - `interface BudgetLine { categoryId: string; budgeted: number; spent: number; ratio: number; status: BudgetStatus }`
  - `interface BudgetReport { lines: BudgetLine[]; totalBudgeted: number; totalSpent: number; totalStatus: BudgetStatus; overCount: number; hasMissingRate: boolean }`
  - `buildBudgetReport(budgets, monthTxs, currencyOf, base, rates): BudgetReport`

- [ ] **Step 1: Viết test thất bại**

Tạo `src/features/budgets/progress.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { BudgetRow, TransactionRow } from '../../types/database.types'
import { buildBudgetReport } from './progress'

// base = JPY: 1 ¥ = 165 ₫
const RATES: Rates = { JPY: 1, VND: 165, USD: 0.0065 }
const currencyOf = (id: string): CurrencyCode => (id === 'vnd' ? 'VND' : 'JPY')

let seq = 0
function tx(
  p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount'>,
): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    category_id: null,
    account_id: 'jpy',
    to_account_id: null,
    to_amount: null,
    occurred_on: '2026-07-10',
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  }
}
function budget(category_id: string, amount: number): BudgetRow {
  return {
    id: `b-${category_id}`,
    user_id: 'u',
    category_id,
    month_key: '2026-07',
    amount,
    created_at: '',
    updated_at: '',
  }
}

describe('buildBudgetReport (base = JPY)', () => {
  it('tính spent theo danh mục, ratio, status; sắp theo ratio giảm dần', () => {
    const budgets = [budget('food', 10_000), budget('trans', 5_000)]
    const txs = [
      tx({ type: 'expense', amount: 8_000, category_id: 'food' }), // 80% → warn
      tx({ type: 'expense', amount: 6_000, category_id: 'trans' }), // 120% → over
      tx({ type: 'income', amount: 99_999, category_id: 'salary' }), // bỏ qua (income)
      tx({ type: 'transfer', amount: 1_000, to_account_id: 'vnd' }), // bỏ qua
    ]
    const r = buildBudgetReport(budgets, txs, currencyOf, 'JPY', RATES)
    expect(r.lines).toEqual([
      { categoryId: 'trans', budgeted: 5_000, spent: 6_000, ratio: 1.2, status: 'over' },
      { categoryId: 'food', budgeted: 10_000, spent: 8_000, ratio: 0.8, status: 'warn' },
    ])
    expect(r.totalBudgeted).toBe(15_000)
    expect(r.totalSpent).toBe(14_000)
    expect(r.totalStatus).toBe('ok') // 14000/15000 = 0.933 < 1
    expect(r.overCount).toBe(1)
    expect(r.hasMissingRate).toBe(false)
  })

  it('danh mục có hạn mức nhưng chưa chi → spent 0, status ok', () => {
    const r = buildBudgetReport([budget('food', 10_000)], [], currencyOf, 'JPY', RATES)
    expect(r.lines).toEqual([
      { categoryId: 'food', budgeted: 10_000, spent: 0, ratio: 0, status: 'ok' },
    ])
    expect(r.overCount).toBe(0)
  })

  it('quy đổi chi ngoại tệ về base', () => {
    // 1.650.000 ₫ ÷ 165 = ¥10.000
    const txs = [tx({ type: 'expense', amount: 1_650_000, category_id: 'shop', account_id: 'vnd' })]
    const r = buildBudgetReport([budget('shop', 20_000)], txs, currencyOf, 'JPY', RATES)
    expect(r.lines[0].spent).toBe(10_000)
    expect(r.lines[0].status).toBe('ok') // 50%
  })

  it('thiếu tỷ giá → bỏ giao dịch, bật hasMissingRate', () => {
    const txs = [tx({ type: 'expense', amount: 1_650_000, category_id: 'shop', account_id: 'vnd' })]
    const r = buildBudgetReport([budget('shop', 20_000)], txs, currencyOf, 'JPY', { JPY: 1 })
    expect(r.lines[0].spent).toBe(0)
    expect(r.hasMissingRate).toBe(true)
  })

  it('biên 100% là over, 99% là warn', () => {
    const r1 = buildBudgetReport(
      [budget('a', 100)],
      [tx({ type: 'expense', amount: 100, category_id: 'a' })],
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r1.lines[0].status).toBe('over')
    const r2 = buildBudgetReport(
      [budget('a', 100)],
      [tx({ type: 'expense', amount: 99, category_id: 'a' })],
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r2.lines[0].status).toBe('warn')
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm test -- progress`
Expected: FAIL — không import được `buildBudgetReport`.

- [ ] **Step 3: Hiện thực helper**

Tạo `src/features/budgets/progress.ts`:

```ts
// Tính tiến độ ngân sách — thuần, không phụ thuộc React, để unit-test được.
// Hạn mức và spent đều ở base currency (minor units); spent quy đổi qua convertToBase.

import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { BudgetRow, TransactionRow } from '../../types/database.types'
import type { CurrencyOf } from '../reports/aggregate'

export type BudgetStatus = 'ok' | 'warn' | 'over' // <80% / ≥80% / ≥100%

export interface BudgetLine {
  categoryId: string
  budgeted: number // minor units base
  spent: number // minor units base (đã quy đổi)
  ratio: number // spent / budgeted (0 nếu budgeted = 0)
  status: BudgetStatus
}

export interface BudgetReport {
  lines: BudgetLine[] // sắp theo ratio giảm dần
  totalBudgeted: number
  totalSpent: number
  totalStatus: BudgetStatus
  overCount: number
  hasMissingRate: boolean
}

function statusOf(ratio: number): BudgetStatus {
  if (ratio >= 1) return 'over'
  if (ratio >= 0.8) return 'warn'
  return 'ok'
}

export function buildBudgetReport(
  budgets: BudgetRow[],
  monthTxs: TransactionRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): BudgetReport {
  const spentByCat = new Map<string, number>()
  let hasMissingRate = false
  for (const t of monthTxs) {
    if (t.type !== 'expense' || !t.category_id) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    spentByCat.set(t.category_id, (spentByCat.get(t.category_id) ?? 0) + v)
  }

  let totalBudgeted = 0
  let totalSpent = 0
  let overCount = 0
  const lines: BudgetLine[] = budgets.map((b) => {
    const spent = spentByCat.get(b.category_id) ?? 0
    const ratio = b.amount > 0 ? spent / b.amount : 0
    const status = statusOf(ratio)
    if (status === 'over') overCount++
    totalBudgeted += b.amount
    totalSpent += spent
    return { categoryId: b.category_id, budgeted: b.amount, spent, ratio, status }
  })
  lines.sort((a, b) => b.ratio - a.ratio)

  const totalRatio = totalBudgeted > 0 ? totalSpent / totalBudgeted : 0
  return {
    lines,
    totalBudgeted,
    totalSpent,
    totalStatus: statusOf(totalRatio),
    overCount,
    hasMissingRate,
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm test -- progress`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add src/features/budgets/progress.ts src/features/budgets/progress.test.ts
git commit -m "GD3 muc1: helper buildBudgetReport + test"
```

---

### Task 4: Interface `Repo` + hiện thực `demoRepo`

**Files:**
- Modify: `src/data/repo.ts`
- Modify: `src/data/demoRepo.ts`

**Interfaces:**
- Consumes: `BudgetRow` từ `../types/database.types`; `parseMonthKey`, `monthKeyString`, `addMonths` từ `../lib/dates`.
- Produces (thêm vào interface `Repo`):
  - `listBudgets(monthKey: string): Promise<BudgetRow[]>`
  - `upsertBudget(categoryId: string, monthKey: string, amount: number): Promise<BudgetRow>`
  - `deleteBudget(id: string): Promise<void>`
  - `copyBudgetsFromPreviousMonth(monthKey: string): Promise<number>`

- [ ] **Step 1: Thêm 4 method vào interface `Repo`**

Trong `src/data/repo.ts`: thêm `BudgetRow` vào khối import type từ `../types/database.types`, rồi thêm vào cuối interface `Repo` (trước dấu `}` đóng):

```ts
  listBudgets(monthKey: string): Promise<BudgetRow[]>
  /** Tạo mới hoặc cập nhật hạn mức (unique user_id+category_id+month_key). */
  upsertBudget(categoryId: string, monthKey: string, amount: number): Promise<BudgetRow>
  deleteBudget(id: string): Promise<void>
  /** Chép hạn mức từ tháng liền trước vào monthKey; bỏ qua danh mục đã có hạn mức
   *  ở tháng đích. Trả về số hạn mức đã chép. */
  copyBudgetsFromPreviousMonth(monthKey: string): Promise<number>
```

- [ ] **Step 2: Cập nhật `DemoDB` + seed trong `demoRepo.ts`**

Trong `src/data/demoRepo.ts`:

1. Đổi `STORAGE_KEY`:
```ts
const STORAGE_KEY = 'sct-demo-db-v3' // v3: thêm budgets
```

2. Thêm import: `BudgetRow` vào khối import type từ `../types/database.types`, và `import { addMonths, monthKeyForDate, monthKeyString, parseMonthKey, toISODate } from '../lib/dates'` (gộp với import `toISODate` sẵn có — sửa dòng import hiện tại thành đủ các tên này).

3. Thêm `budgets: BudgetRow[]` vào interface `DemoDB`:
```ts
interface DemoDB {
  profile: ProfileRow
  accounts: AccountRow[]
  categories: CategoryRow[]
  transactions: TransactionRow[]
  budgets: BudgetRow[]
}
```

4. Trong `seed()`, trước `return`, tạo vài hạn mức mẫu cho tháng hiện tại (khớp category đã seed):
```ts
  const thisMonth = monthKeyString(monthKeyForDate(toISODate(new Date()), 1))
  const budget = (categoryName: string, amount: number): BudgetRow => ({
    id: uuid(),
    user_id: DEMO_USER,
    category_id: cat(categoryName, 'expense').id,
    month_key: thisMonth,
    amount,
    created_at: nowISO(),
    updated_at: nowISO(),
  })
  const budgets = [
    budget('Ăn uống', 40_000), // ¥40.000
    budget('Đi lại', 8_000), // ¥8.000
    budget('Mua sắm', 20_000), // ¥20.000
  ]
```
và thêm `budgets` vào object `return { ... }`.

- [ ] **Step 3: Hiện thực 4 method trong `demoRepo`**

Thêm vào object `demoRepo` (trước dấu `}` đóng, sau `reorderCategories`):

```ts
  async listBudgets(monthKey: string) {
    return load().budgets.filter((b) => b.month_key === monthKey)
  },

  async upsertBudget(categoryId: string, monthKey: string, amount: number) {
    const db = load()
    const existing = db.budgets.find(
      (b) => b.category_id === categoryId && b.month_key === monthKey,
    )
    if (existing) {
      existing.amount = amount
      existing.updated_at = nowISO()
      save(db)
      return existing
    }
    const row: BudgetRow = {
      id: uuid(),
      user_id: DEMO_USER,
      category_id: categoryId,
      month_key: monthKey,
      amount,
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    db.budgets.push(row)
    save(db)
    return row
  },

  async deleteBudget(id: string) {
    const db = load()
    db.budgets = db.budgets.filter((b) => b.id !== id)
    save(db)
  },

  async copyBudgetsFromPreviousMonth(monthKey: string) {
    const db = load()
    const prev = monthKeyString(addMonths(parseMonthKey(monthKey), -1))
    const existingCats = new Set(
      db.budgets.filter((b) => b.month_key === monthKey).map((b) => b.category_id),
    )
    const toCopy = db.budgets.filter(
      (b) => b.month_key === prev && !existingCats.has(b.category_id),
    )
    for (const b of toCopy) {
      db.budgets.push({
        id: uuid(),
        user_id: DEMO_USER,
        category_id: b.category_id,
        month_key: monthKey,
        amount: b.amount,
        created_at: nowISO(),
        updated_at: nowISO(),
      })
    }
    save(db)
    return toCopy.length
  },
```

- [ ] **Step 4: Kiểm tra build**

Run: `npm run build`
Expected: PASS. (Nếu báo `supabaseRepo` thiếu method của `Repo` — đúng như dự kiến, sửa ở Task 5. Nếu muốn build sạch ngay, làm Task 5 liền sau rồi mới build.)

> LƯU Ý: Vì `supabaseRepo` cũng phải thỏa interface `Repo`, build sẽ lỗi cho tới khi Task 5 xong. Có thể commit Task 4 rồi làm ngay Task 5, và chạy build/lint/test một lần ở cuối Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/data/repo.ts src/data/demoRepo.ts
git commit -m "GD3 muc1: repo interface + demoRepo budgets"
```

---

### Task 5: Hiện thực `supabaseRepo`

**Files:**
- Modify: `src/data/supabaseRepo.ts`

**Interfaces:**
- Consumes: interface `Repo` (Task 4); `parseMonthKey`, `monthKeyString`, `addMonths` từ `../lib/dates`.
- Produces: 4 method budget khớp interface.

- [ ] **Step 1: Thêm import ngày tháng**

Đầu `src/data/supabaseRepo.ts`, thêm:
```ts
import { addMonths, monthKeyString, parseMonthKey } from '../lib/dates'
```

- [ ] **Step 2: Hiện thực 4 method**

Thêm vào object `supabaseRepo` (trước dấu `}` đóng, sau `reorderCategories`):

```ts
  async listBudgets(monthKey: string) {
    const { data, error } = await getSupabase()
      .from('budgets')
      .select('*')
      .eq('month_key', monthKey)
    if (error) throw error
    return data
  },

  async upsertBudget(categoryId: string, monthKey: string, amount: number) {
    const user_id = await currentUserId()
    const { data, error } = await getSupabase()
      .from('budgets')
      .upsert(
        { user_id, category_id: categoryId, month_key: monthKey, amount },
        { onConflict: 'user_id,category_id,month_key' },
      )
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteBudget(id: string) {
    const { error } = await getSupabase().from('budgets').delete().eq('id', id)
    if (error) throw error
  },

  async copyBudgetsFromPreviousMonth(monthKey: string) {
    const user_id = await currentUserId()
    const prev = monthKeyString(addMonths(parseMonthKey(monthKey), -1))
    const sb = getSupabase()
    const { data: prevRows, error: e1 } = await sb
      .from('budgets')
      .select('category_id, amount')
      .eq('month_key', prev)
    if (e1) throw e1
    const { data: curRows, error: e2 } = await sb
      .from('budgets')
      .select('category_id')
      .eq('month_key', monthKey)
    if (e2) throw e2
    const existing = new Set((curRows ?? []).map((r) => r.category_id))
    const toInsert = (prevRows ?? [])
      .filter((r) => !existing.has(r.category_id))
      .map((r) => ({ user_id, category_id: r.category_id, month_key: monthKey, amount: r.amount }))
    if (toInsert.length === 0) return 0
    const { error: e3 } = await sb.from('budgets').insert(toInsert)
    if (e3) throw e3
    return toInsert.length
  },
```

- [ ] **Step 3: Build + lint + test**

Run: `npm run build && npm run lint && npm test`
Expected: tất cả PASS (interface `Repo` đã đủ 2 hiện thực).

- [ ] **Step 4: Commit**

```bash
git add src/data/supabaseRepo.ts
git commit -m "GD3 muc1: supabaseRepo budgets"
```

---

### Task 6: Hooks TanStack Query

**Files:**
- Modify: `src/hooks/queries.ts`

**Interfaces:**
- Consumes: `repo`; `useMonthTransactions`, `useAccounts`, `useRates`, `useProfile` (đã có trong file); `buildBudgetReport` + type `BudgetReport` từ `../features/budgets/progress`; `monthKeyString`, `monthKeyForDate`, `toISODate`, `type MonthKey` từ `../lib/dates`; `CurrencyCode` từ `../lib/money`.
- Produces:
  - `useBudgets(monthKey: string)`
  - `useUpsertBudget()` — mutation arg `{ categoryId: string; monthKey: string; amount: number }`
  - `useDeleteBudget()` — mutation arg `id: string`
  - `useCopyBudgetsFromPreviousMonth()` — mutation arg `monthKey: string`, trả `number`
  - `useBudgetReport(monthKey: MonthKey): { report: BudgetReport | undefined; isLoading: boolean }`
  - `useBudgetAlert(): { overCount: number; monthKey: MonthKey }`

- [ ] **Step 1: Thêm import**

Trong `src/hooks/queries.ts`, bổ sung vào các dòng import:
```ts
import { getMonthRange, monthKeyForDate, monthKeyString, toISODate, type MonthKey } from '../lib/dates'
import { buildBudgetReport, type BudgetReport } from '../features/budgets/progress'
import type { CurrencyCode } from '../lib/money'
```
(dòng `import { getMonthRange, type MonthKey } from '../lib/dates'` sẵn có → thay bằng dòng đầy đủ ở trên; thêm `useMemo` từ `react` không cần vì tính trực tiếp.)

- [ ] **Step 2: Thêm query + mutations budget**

Thêm khối sau vào cuối file:

```ts
// --- Ngân sách tháng (GĐ3) ---

export function useBudgets(monthKey: string) {
  return useQuery({
    queryKey: ['budgets', monthKey],
    queryFn: () => repo.listBudgets(monthKey),
  })
}

function invalidateBudgets(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['budgets'] })
}

export function useUpsertBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      categoryId,
      monthKey,
      amount,
    }: {
      categoryId: string
      monthKey: string
      amount: number
    }) => repo.upsertBudget(categoryId, monthKey, amount),
    onSettled: () => invalidateBudgets(qc),
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteBudget(id),
    onSettled: () => invalidateBudgets(qc),
  })
}

export function useCopyBudgetsFromPreviousMonth() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (monthKey: string) => repo.copyBudgetsFromPreviousMonth(monthKey),
    onSettled: () => invalidateBudgets(qc),
  })
}

/** Kết hợp budgets + giao dịch tháng + tỷ giá → báo cáo tiến độ ngân sách. */
export function useBudgetReport(monthKey: MonthKey): {
  report: BudgetReport | undefined
  isLoading: boolean
} {
  const monthKeyStr = monthKeyString(monthKey)
  const budgetsQ = useBudgets(monthKeyStr)
  const { data: monthTxs, isLoading: txLoading } = useMonthTransactions(monthKey)
  const { data: accounts = [] } = useAccounts()
  const { base, rates } = useRates()

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base

  const budgets = budgetsQ.data
  const report =
    budgets && monthTxs
      ? buildBudgetReport(budgets, monthTxs, currencyOf, base, rates ?? {})
      : undefined

  return { report, isLoading: budgetsQ.isLoading || txLoading }
}

/** Số danh mục vượt ngân sách trong "tháng hiện tại" — cho badge cảnh báo. */
export function useBudgetAlert(): { overCount: number; monthKey: MonthKey } {
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const monthKey = monthKeyForDate(toISODate(new Date()), monthStartDay)
  const { report } = useBudgetReport(monthKey)
  return { overCount: report?.overCount ?? 0, monthKey }
}
```

- [ ] **Step 3: Build + lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/queries.ts
git commit -m "GD3 muc1: hooks budget + report + alert"
```

---

### Task 7: Component `BudgetView` (nội dung tab Ngân sách)

**Files:**
- Create: `src/features/budgets/BudgetView.tsx`

**Interfaces:**
- Consumes: `useBudgetReport`, `useBudgets`, `useCategories`, `useUpsertBudget`, `useDeleteBudget`, `useCopyBudgetsFromPreviousMonth`, `useRates` từ `../../hooks/queries`; `monthKeyString`, `type MonthKey` từ `../../lib/dates`; `formatMoney`, `parseMoney` từ `../../lib/money`; `type BudgetStatus` từ `./progress`; `BudgetEditSheet` từ `./BudgetEditSheet` (Task 8 tạo — tạm import, sẽ có sau).
- Produces: `export function BudgetView({ monthKey }: { monthKey: MonthKey })`.

> Thứ tự: tạo `BudgetEditSheet` (Task 8) TRƯỚC khi build, hoặc gộp build/lint vào cuối Task 8. Task 7 và 8 gate cùng nhau về UI.

- [ ] **Step 1: Tạo `BudgetView.tsx`**

```tsx
import { useState } from 'react'
import {
  useBudgetReport,
  useBudgets,
  useCategories,
  useCopyBudgetsFromPreviousMonth,
  useRates,
} from '../../hooks/queries'
import { monthKeyString, type MonthKey } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { BudgetEditSheet } from './BudgetEditSheet'
import type { BudgetStatus } from './progress'

const BAR_COLOR: Record<BudgetStatus, string> = {
  ok: 'bg-green-500',
  warn: 'bg-amber-500',
  over: 'bg-red-500',
}
const TEXT_COLOR: Record<BudgetStatus, string> = {
  ok: 'text-gray-800',
  warn: 'text-amber-600',
  over: 'text-red-600',
}

export function BudgetView({ monthKey }: { monthKey: MonthKey }) {
  const monthKeyStr = monthKeyString(monthKey)
  const { base } = useRates()
  const { report, isLoading } = useBudgetReport(monthKey)
  const { data: budgets = [] } = useBudgets(monthKeyStr)
  const { data: categories = [] } = useCategories()
  const copy = useCopyBudgetsFromPreviousMonth()

  // Danh mục đang sửa hạn mức (null = đóng sheet)
  const [editing, setEditing] = useState<{ categoryId: string; current: number; budgetId?: string } | null>(
    null,
  )

  const catOf = (id: string) => categories.find((c) => c.id === id)
  const expenseCats = categories.filter((c) => c.type === 'expense' && !c.is_archived)
  const budgetedIds = new Set(budgets.map((b) => b.category_id))
  const unbudgeted = expenseCats.filter((c) => !budgetedIds.has(c.id))

  async function handleCopy() {
    const n = await copy.mutateAsync(monthKeyStr)
    window.alert(n > 0 ? `Đã chép ${n} hạn mức từ tháng trước` : 'Tháng trước không có hạn mức để chép')
  }

  if (isLoading || !report) {
    return <p className="py-10 text-center text-sm text-gray-400">Đang tải…</p>
  }

  const totalPct = report.totalBudgeted > 0 ? (report.totalSpent / report.totalBudgeted) * 100 : 0

  return (
    <div className="flex flex-col gap-3">
      {report.hasMissingRate && (
        <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
          Một phần chi ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

      {/* Dòng tổng */}
      <section className="rounded-xl bg-white p-3 shadow-sm">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-gray-500">Tổng ngân sách</h2>
          {report.overCount > 0 && (
            <span className="text-xs font-medium text-red-600">
              {report.overCount} danh mục vượt
            </span>
          )}
        </div>
        <div className="flex items-baseline justify-between">
          <span className={`text-lg font-bold ${TEXT_COLOR[report.totalStatus]}`}>
            {formatMoney(report.totalSpent, base)}
          </span>
          <span className="text-sm text-gray-400">/ {formatMoney(report.totalBudgeted, base)}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full ${BAR_COLOR[report.totalStatus]}`}
            style={{ width: `${Math.min(totalPct, 100)}%` }}
          />
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="mt-3 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
        >
          Chép hạn mức tháng trước
        </button>
      </section>

      {/* Danh mục có hạn mức */}
      {report.lines.length > 0 && (
        <section className="rounded-xl bg-white p-3 shadow-sm">
          <ul className="space-y-3">
            {report.lines.map((line) => {
              const cat = catOf(line.categoryId)
              const budget = budgets.find((b) => b.category_id === line.categoryId)
              const pct = Math.round(line.ratio * 100)
              return (
                <li key={line.categoryId}>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        categoryId: line.categoryId,
                        current: line.budgeted,
                        budgetId: budget?.id,
                      })
                    }
                    className="w-full text-left"
                  >
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-gray-700">
                        {cat?.icon ?? '📦'} {cat?.name ?? '?'}
                      </span>
                      <span className={`text-xs ${TEXT_COLOR[line.status]}`}>{pct}%</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${BAR_COLOR[line.status]}`}
                        style={{ width: `${Math.min(line.ratio * 100, 100)}%` }}
                      />
                    </div>
                    <div className="mt-0.5 flex justify-between text-xs text-gray-400">
                      <span className={TEXT_COLOR[line.status]}>{formatMoney(line.spent, base)}</span>
                      <span>{formatMoney(line.budgeted, base)}</span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Danh mục chưa đặt hạn mức */}
      {unbudgeted.length > 0 && (
        <section className="rounded-xl bg-white p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-gray-500">Chưa đặt hạn mức</h2>
          <ul className="flex flex-wrap gap-2">
            {unbudgeted.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setEditing({ categoryId: c.id, current: 0 })}
                  className="rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                >
                  {c.icon} {c.name} +
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <BudgetEditSheet
          monthKey={monthKeyStr}
          categoryId={editing.categoryId}
          categoryLabel={`${catOf(editing.categoryId)?.icon ?? '📦'} ${catOf(editing.categoryId)?.name ?? ''}`}
          current={editing.current}
          budgetId={editing.budgetId}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: (Chưa build — chờ Task 8 tạo `BudgetEditSheet`.) Commit tạm**

```bash
git add src/features/budgets/BudgetView.tsx
git commit -m "GD3 muc1: BudgetView UI"
```

---

### Task 8: Component `BudgetEditSheet`

**Files:**
- Create: `src/features/budgets/BudgetEditSheet.tsx`

**Interfaces:**
- Consumes: `useUpsertBudget`, `useDeleteBudget` từ `../../hooks/queries`; `formatMoney`, `parseMoney` từ `../../lib/money`; `useRates` từ `../../hooks/queries`.
- Produces: `export function BudgetEditSheet(props)` với `props`: `{ monthKey: string; categoryId: string; categoryLabel: string; current: number; budgetId?: string; onClose: () => void }`.

- [ ] **Step 1: Tạo `BudgetEditSheet.tsx`**

```tsx
import { useState } from 'react'
import { useDeleteBudget, useRates, useUpsertBudget } from '../../hooks/queries'
import { formatMoney, parseMoney } from '../../lib/money'

interface Props {
  monthKey: string
  categoryId: string
  categoryLabel: string
  current: number // minor units base; 0 = chưa có
  budgetId?: string
  onClose: () => void
}

/** Sheet đặt/sửa/xóa hạn mức cho một danh mục trong một tháng. */
export function BudgetEditSheet({
  monthKey,
  categoryId,
  categoryLabel,
  current,
  budgetId,
  onClose,
}: Props) {
  const { base } = useRates()
  const upsert = useUpsertBudget()
  const remove = useDeleteBudget()
  const [raw, setRaw] = useState(current > 0 ? String(current) : '')
  const amount = parseMoney(raw)

  async function handleSave() {
    if (amount <= 0) {
      // Nhập 0/để trống + đang có hạn mức → coi như xóa
      if (budgetId) await remove.mutateAsync(budgetId)
      onClose()
      return
    }
    await upsert.mutateAsync({ categoryId, monthKey, amount })
    onClose()
  }

  async function handleDelete() {
    if (budgetId) await remove.mutateAsync(budgetId)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-gray-50 p-4 lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-800">Hạn mức: {categoryLabel}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
          >
            Đóng
          </button>
        </div>

        <label className="block text-xs font-medium text-gray-500">Hạn mức tháng ({base})</label>
        <input
          autoFocus
          inputMode="numeric"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="0"
          className="mt-1 w-full rounded-xl border border-gray-300 bg-white p-3 text-right text-lg font-semibold text-gray-800 focus:border-green-500 focus:outline-none"
        />
        <p className="mt-1 text-right text-sm text-gray-500">{formatMoney(amount, base)}</p>

        <div className="mt-4 flex gap-2">
          {budgetId && (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-xl px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Xóa
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white active:scale-[0.99]"
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build + lint + test**

Run: `npm run build && npm run lint && npm test`
Expected: PASS (BudgetView + BudgetEditSheet compile).

- [ ] **Step 3: Commit**

```bash
git add src/features/budgets/BudgetEditSheet.tsx
git commit -m "GD3 muc1: BudgetEditSheet"
```

---

### Task 9: Tích hợp tab Ngân sách vào `ReportsPage` + deep-link

**Files:**
- Modify: `src/features/reports/ReportsPage.tsx`

**Interfaces:**
- Consumes: `BudgetView` từ `../budgets/BudgetView`; `useSearchParams` từ `react-router-dom`.

- [ ] **Step 1: Thêm import**

Trong `src/features/reports/ReportsPage.tsx`:
```ts
import { useSearchParams } from 'react-router-dom'
import { BudgetView } from '../budgets/BudgetView'
```

- [ ] **Step 2: Thêm state `view` (khởi tạo từ query param)**

Sau dòng `const [kind, setKind] = useState<'expense' | 'income'>('expense')` thêm:
```ts
  const [searchParams] = useSearchParams()
  const [view, setView] = useState<'charts' | 'budget'>(
    searchParams.get('view') === 'budget' ? 'budget' : 'charts',
  )
```

- [ ] **Step 3: Chỉ nạp dữ liệu 6 tháng khi ở tab biểu đồ**

Sửa `useRangeTransactions(sixMonthRange, !!profile)` thành:
```ts
  const { data: rangeTxs = [] } = useRangeTransactions(sixMonthRange, !!profile && view === 'charts')
```

- [ ] **Step 4: Thêm segmented control + render theo `view`**

Ngay sau khối header chuyển tháng (`</div>` đóng div `flex items-center justify-between`, trước banner missing-rate), thêm segmented control:

```tsx
      {/* Chọn tab: Biểu đồ | Ngân sách */}
      <div className="flex rounded-lg bg-gray-100 p-0.5 text-sm font-medium">
        <button
          type="button"
          onClick={() => setView('charts')}
          className={`flex-1 rounded-md py-1.5 ${view === 'charts' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
        >
          Biểu đồ
        </button>
        <button
          type="button"
          onClick={() => setView('budget')}
          className={`flex-1 rounded-md py-1.5 ${view === 'budget' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
        >
          Ngân sách
        </button>
      </div>
```

Bọc banner missing-rate của biểu đồ + 2 `<section>` biểu đồ trong điều kiện `view === 'charts'`, và render `BudgetView` khi `view === 'budget'`. Cụ thể:
- Sửa banner: `{view === 'charts' && (breakdown.hasMissingRate || series.hasMissingRate) && (` … `)}`
- Bọc 2 section biểu đồ: `{view === 'charts' && (<>` … 2 `<section>` … `</>)}`
- Thêm sau đó: `{view === 'budget' && <BudgetView monthKey={monthKey} />}`

- [ ] **Step 5: Build + lint + test**

Run: `npm run build && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 6: Verify trên Browser pane (375px, demo mode)**

- `preview_start` name dev server; navigate `/reports`.
- `read_page`/`get_page_text`: thấy segmented control "Biểu đồ | Ngân sách"; bấm Ngân sách thấy dòng tổng + progress bar các danh mục (Ăn uống/Đi lại/Mua sắm từ seed).
- Bấm một danh mục → sheet hạn mức mở; đổi số → Lưu → bar cập nhật.
- Bấm "Chép hạn mức tháng trước" → alert số dòng.
- `←/→` đổi tháng → hạn mức đổi theo tháng.

- [ ] **Step 7: Commit**

```bash
git add src/features/reports/ReportsPage.tsx
git commit -m "GD3 muc1: tab Ngan sach trong Reports + deep link"
```

---

### Task 10: Badge cảnh báo ở màn Nhập

**Files:**
- Modify: `src/features/transactions/EntryPage.tsx`

**Interfaces:**
- Consumes: `useBudgetAlert` từ `../../hooks/queries`; `Link` từ `react-router-dom`.

- [ ] **Step 1: Thêm import + hook**

Trong `src/features/transactions/EntryPage.tsx`:
```ts
import { Link } from 'react-router-dom'
import { useBudgetAlert, useCreateTransaction } from '../../hooks/queries'
```
(gộp `useCreateTransaction` sẵn có vào import chung.)

Trong component, sau `const create = useCreateTransaction()`:
```ts
  const { overCount } = useBudgetAlert()
```

- [ ] **Step 2: Render badge (khi có danh mục vượt)**

Ngay sau thẻ `<div className="flex h-[calc(...)] ...">` mở, TRƯỚC `<TransactionForm ...>`, thêm:

```tsx
      {overCount > 0 && (
        <Link
          to="/reports?view=budget"
          className="mb-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
        >
          ⚠️ {overCount} danh mục vượt ngân sách tháng này — xem chi tiết ›
        </Link>
      )}
```

- [ ] **Step 3: Build + lint + test**

Run: `npm run build && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 4: Verify trên Browser pane (375px, demo mode)**

- Đảm bảo có danh mục vượt: ở tab Ngân sách đặt hạn mức thấp cho "Ăn uống" (VD ¥100) để vượt, hoặc dựa seed.
- Navigate `/` (màn Nhập): thấy badge đỏ "⚠️ N danh mục vượt ngân sách". Bấm → về `/reports?view=budget`, mở đúng tab Ngân sách.
- Nếu không có danh mục vượt: badge không hiện.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/EntryPage.tsx
git commit -m "GD3 muc1: badge canh bao ngan sach o man Nhap"
```

---

## Ghi chú áp dụng lên Supabase thật (khi có project)

- Chạy `supabase/migrations/0002_budgets.sql` trên SQL Editor (mục B checklist trong plan gốc). `demoRepo` không cần migration (localStorage tự seed lại khi bump `STORAGE_KEY`).

## Self-review (đã kiểm)

- **Spec coverage:** bảng+migration (T1), types (T1), cả 2 repo (T4/T5), helper TDD + ngưỡng 80/100 (T3), month_key theo month_start_day (T2 + hooks T6), tab con trong Báo cáo (T9), progress bar đổi màu (T7), dòng tổng (T7), chép tháng trước không ghi đè (T4/T5/T7), cảnh báo màn khác (T6/T10), banner thiếu tỷ giá (T7). Đủ.
- **Placeholder scan:** không còn TBD/TODO; mọi step có code thật.
- **Type consistency:** `buildBudgetReport`, `BudgetReport`, `BudgetLine`, `BudgetStatus`, `useBudgetReport(monthKey: MonthKey)`, `useBudgets(monthKey: string)` nhất quán giữa T3/T6/T7/T10. `copyBudgetsFromPreviousMonth(monthKey: string): Promise<number>` khớp T4/T5/T6/T7.
