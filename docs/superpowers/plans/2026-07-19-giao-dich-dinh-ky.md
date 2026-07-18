# Giao dịch định kỳ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giao dịch lặp tự động theo chu kỳ tuần/tháng/năm — catch-up khi mở app, sinh giao dịch thật vào `transactions`, quản lý rule ở `/settings/recurring` và tạo nhanh từ màn Nhập.

**Architecture:** Bảng mới `recurring_rules` + cột `transactions.recurring_rule_id` (partial unique index chống sinh trùng đa thiết bị). Toán ngày + engine catch-up là pure functions trong `src/lib/recurring.ts`, chạy chung cho cả 2 repo qua các method mới của interface `Repo`. Spec: [`../specs/2026-07-19-giao-dich-dinh-ky-design.md`](../specs/2026-07-19-giao-dich-dinh-ky-design.md).

**Tech Stack:** React + Vite + TS + Tailwind + TanStack Query; Supabase (RLS) + demoRepo (localStorage); vitest.

## Global Constraints

- Tiền lưu **minor units (`bigint`/number nguyên)**, không bao giờ dùng float.
- Mọi đọc/ghi đi qua interface `Repo` (`src/data/repo.ts`) — cài **cả 2 repo**.
- Định kỳ dùng **ngày dương lịch thuần** — KHÔNG dùng `getMonthRange`/`month_start_day`.
- UI tiếng Việt; code comment tiếng Việt (theo phong cách codebase).
- Commit message **không dấu**. Sau mỗi task: test liên quan pass; cuối cùng `npm run build` + `npm run lint` + `npm test` sạch.
- **Working tree đang có sẵn thay đổi dark mode chưa commit** — mỗi commit chỉ `git add` đúng các file của task đó (đường dẫn liệt kê trong từng task), KHÔNG `git add -A`.

## File Structure

| File | Vai trò |
|---|---|
| `src/lib/recurring.ts` (mới) | Toán ngày (`nthDueDate`, `listDueDates`, `nextDueDate`) + engine `runRecurringCatchUp` + types `RecurringFrequency`, `RuleSchedule`, `RecurringRepo` |
| `src/lib/recurring.test.ts` (mới) | Test toán ngày + engine (fake repo in-memory) |
| `supabase/migrations/0008_recurring_rules.sql` (mới) | Bảng `recurring_rules`, RLS, trigger, cột + partial unique index trên `transactions` |
| `src/types/database.types.ts` | `RecurringRuleRow`, `TransactionRow.recurring_rule_id`, entry `recurring_rules` trong `Database` |
| `src/data/repo.ts` | `NewRecurringRule`, `RecurringRulePatch`, `NewRecurringOccurrence` + 5 method mới trên `Repo` |
| `src/data/demoRepo.ts`, `src/data/supabaseRepo.ts` | Cài 5 method mới |
| `src/data/index.ts` | Re-export types mới |
| `src/hooks/queries.ts` | `useRecurringRules` + 3 mutation + `useRunRecurringCatchUp` |
| `src/components/AppLayout.tsx` | Chạy catch-up 1 lần khi mở app + toast |
| `src/features/recurring/RecurringPage.tsx` (mới) | Danh sách rule (sửa/pause/xóa) |
| `src/features/recurring/RecurringFormSheet.tsx` (mới) | Sheet thêm/sửa rule |
| `src/App.tsx`, `src/features/settings/SettingsPage.tsx` | Route lazy `/settings/recurring` + link Cài đặt |
| `src/features/transactions/TransactionForm.tsx`, `EntryPage.tsx` | Tùy chọn "Lặp lại" |
| `src/features/transactions/TransactionItem.tsx` | Badge 🔁 |

---

### Task 1: Toán ngày định kỳ (`src/lib/recurring.ts`)

**Files:**
- Create: `src/lib/recurring.ts`
- Test: `src/lib/recurring.test.ts`

**Interfaces:**
- Consumes: `addDaysISO` từ `src/lib/dates.ts`.
- Produces (task 2, 4, 6, 7 dùng):
  - `type RecurringFrequency = 'weekly' | 'monthly' | 'yearly'`
  - `interface RuleSchedule { frequency: RecurringFrequency; start_on: string; end_on: string | null; is_paused: boolean; last_generated_on: string | null }`
  - `nthDueDate(startISO: string, frequency: RecurringFrequency, n: number): string`
  - `listDueDates(rule: RuleSchedule, todayISO: string): string[]`
  - `nextDueDate(rule: Omit<RuleSchedule, 'is_paused'>): string | null`

- [ ] **Step 1: Viết test fail**

Tạo `src/lib/recurring.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { listDueDates, nextDueDate, nthDueDate } from './recurring'

describe('nthDueDate', () => {
  it('weekly: cộng đúng 7 ngày mỗi kỳ', () => {
    expect(nthDueDate('2026-07-06', 'weekly', 0)).toBe('2026-07-06')
    expect(nthDueDate('2026-07-06', 'weekly', 1)).toBe('2026-07-13')
    expect(nthDueDate('2026-07-06', 'weekly', 4)).toBe('2026-08-03')
  })

  it('monthly: giữ ngày anchor, cuộn qua năm mới', () => {
    expect(nthDueDate('2026-01-15', 'monthly', 1)).toBe('2026-02-15')
    expect(nthDueDate('2026-11-15', 'monthly', 2)).toBe('2027-01-15')
  })

  it('monthly: anchor 31 clamp về cuối tháng ngắn rồi quay lại 31 (không trôi dần)', () => {
    expect(nthDueDate('2026-01-31', 'monthly', 1)).toBe('2026-02-28')
    expect(nthDueDate('2026-01-31', 'monthly', 2)).toBe('2026-03-31')
    expect(nthDueDate('2026-01-31', 'monthly', 3)).toBe('2026-04-30')
  })

  it('monthly: tháng 2 năm nhuận nhận ngày 29', () => {
    expect(nthDueDate('2028-01-31', 'monthly', 1)).toBe('2028-02-29')
  })

  it('yearly: anchor 29/2 clamp 28/2 năm thường, trở lại 29/2 năm nhuận', () => {
    expect(nthDueDate('2028-02-29', 'yearly', 1)).toBe('2029-02-28')
    expect(nthDueDate('2028-02-29', 'yearly', 4)).toBe('2032-02-29')
  })
})

describe('listDueDates', () => {
  const rule = {
    frequency: 'monthly' as const,
    start_on: '2026-04-25',
    end_on: null,
    is_paused: false,
    last_generated_on: null,
  }

  it('chưa sinh lần nào: sinh từ start_on đến hôm nay', () => {
    expect(listDueDates(rule, '2026-07-19')).toEqual(['2026-04-25', '2026-05-25', '2026-06-25'])
  })

  it('kỳ đúng hôm nay vẫn sinh (inclusive)', () => {
    expect(listDueDates(rule, '2026-05-25')).toEqual(['2026-04-25', '2026-05-25'])
  })

  it('đã sinh tới last_generated_on: chỉ sinh phần sau', () => {
    expect(listDueDates({ ...rule, last_generated_on: '2026-05-25' }, '2026-07-19')).toEqual([
      '2026-06-25',
    ])
  })

  it('cắt tại end_on', () => {
    expect(listDueDates({ ...rule, end_on: '2026-05-31' }, '2026-07-19')).toEqual([
      '2026-04-25',
      '2026-05-25',
    ])
  })

  it('tạm dừng → rỗng', () => {
    expect(listDueDates({ ...rule, is_paused: true }, '2026-07-19')).toEqual([])
  })

  it('start_on tương lai → rỗng', () => {
    expect(listDueDates(rule, '2026-04-01')).toEqual([])
  })
})

describe('nextDueDate', () => {
  it('chưa sinh: kỳ tới là start_on', () => {
    expect(
      nextDueDate({ frequency: 'weekly', start_on: '2026-08-01', end_on: null, last_generated_on: null }),
    ).toBe('2026-08-01')
  })

  it('đã sinh: kỳ kế tiếp sau last_generated_on (kể cả kỳ trước bị clamp)', () => {
    expect(
      nextDueDate({ frequency: 'monthly', start_on: '2026-01-31', end_on: null, last_generated_on: '2026-02-28' }),
    ).toBe('2026-03-31')
  })

  it('quá end_on → null', () => {
    expect(
      nextDueDate({ frequency: 'monthly', start_on: '2026-01-15', end_on: '2026-02-20', last_generated_on: '2026-02-15' }),
    ).toBe(null)
  })
})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run src/lib/recurring.test.ts`
Expected: FAIL — `Cannot find module './recurring'` (hoặc tương tự).

- [ ] **Step 3: Viết implementation**

Tạo `src/lib/recurring.ts`:

```ts
// Giao dịch định kỳ — toán ngày thuần (không I/O), anchor là start_on.
// Chu kỳ dùng ngày dương lịch thuần, KHÔNG liên quan month_start_day.
// RecurringFrequency định nghĩa ở đây (database.types import lại) để lib này
// không phụ thuộc ngược vào types/database — cùng pattern CurrencyCode ở money.ts.

import { addDaysISO } from './dates'

export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly'

/** Phần lịch của một rule — subset của RecurringRuleRow, đủ cho toán ngày. */
export interface RuleSchedule {
  frequency: RecurringFrequency
  start_on: string
  end_on: string | null
  is_paused: boolean
  last_generated_on: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Số ngày của tháng (month: 1–12). */
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate()

/**
 * Kỳ đến hạn thứ n (0-based) tính từ anchor start_on.
 * monthly/yearly: giữ ngày của anchor, clamp về cuối tháng khi tháng ngắn hơn;
 * kỳ sau vẫn quay về ngày anchor (luôn tính từ anchor, không trôi dần).
 */
export function nthDueDate(startISO: string, frequency: RecurringFrequency, n: number): string {
  const [y, m, d] = startISO.split('-').map(Number)
  if (frequency === 'weekly') return addDaysISO(startISO, 7 * n)
  if (frequency === 'monthly') {
    const total = m - 1 + n
    const year = y + Math.floor(total / 12)
    const month = (total % 12) + 1
    return `${year}-${pad(month)}-${pad(Math.min(d, daysInMonth(year, month)))}`
  }
  const year = y + n
  return `${year}-${pad(m)}-${pad(Math.min(d, daysInMonth(year, m)))}`
}

/**
 * Các kỳ đến hạn CẦN SINH: sau last_generated_on (hoặc từ start_on nếu chưa
 * sinh lần nào), đến hết todayISO (inclusive), cắt tại end_on.
 * Rule tạm dừng → mảng rỗng.
 */
export function listDueDates(rule: RuleSchedule, todayISO: string): string[] {
  if (rule.is_paused) return []
  const out: string[] = []
  for (let n = 0; ; n++) {
    const due = nthDueDate(rule.start_on, rule.frequency, n)
    if (due > todayISO) break
    if (rule.end_on && due > rule.end_on) break
    if (rule.last_generated_on && due <= rule.last_generated_on) continue
    out.push(due)
  }
  return out
}

/** Kỳ tới sẽ sinh (cho UI danh sách rule); null = không còn kỳ nào (quá end_on). */
export function nextDueDate(rule: Omit<RuleSchedule, 'is_paused'>): string | null {
  for (let n = 0; ; n++) {
    const due = nthDueDate(rule.start_on, rule.frequency, n)
    if (rule.end_on && due > rule.end_on) return null
    if (rule.last_generated_on && due <= rule.last_generated_on) continue
    return due
  }
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run src/lib/recurring.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurring.ts src/lib/recurring.test.ts
git commit -m "Dinh ky: toan ngay recurring (lib + test)"
```

---

### Task 2: Migration + types (`recurring_rules`, cột `recurring_rule_id`)

**Files:**
- Create: `supabase/migrations/0008_recurring_rules.sql`
- Modify: `src/types/database.types.ts`
- Modify (ripple — `TransactionRow` thêm field bắt buộc): `src/data/demoRepo.ts` (3 chỗ), `src/hooks/queries.ts` (1 chỗ), `src/features/transactions/filter.test.ts:6`, `src/features/reports/aggregate.test.ts:20`, `src/features/reports/insights.test.ts:7` và `:105`, `src/features/budgets/progress.test.ts:13`

**Interfaces:**
- Consumes: `RecurringFrequency` từ `src/lib/recurring` (Task 1).
- Produces (task 3+ dùng): `RecurringRuleRow`; `TransactionRow.recurring_rule_id: string | null`; entry `recurring_rules` trong `Database['public']['Tables']`.

- [ ] **Step 1: Viết migration**

Tạo `supabase/migrations/0008_recurring_rules.sql`:

```sql
-- ============================================================
-- Sổ Chi Tiêu — Migration 0008: giao dịch định kỳ
-- Bảng recurring_rules + cột transactions.recurring_rule_id
-- + partial unique index chống sinh trùng khi 2 thiết bị cùng catch-up.
-- ============================================================

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('expense', 'income', 'transfer')),
  -- Minor units theo currency của tài khoản nguồn (như transactions)
  amount bigint not null check (amount > 0),
  to_amount bigint check (to_amount > 0),
  category_id uuid,
  account_id uuid not null,
  to_account_id uuid,
  note text not null default '',
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  -- Kỳ đến hạn ĐẦU TIÊN; anchor cho ngày-trong-tháng / thứ-trong-tuần
  start_on date not null,
  -- null = vô hạn; kỳ đến hạn > end_on không sinh
  end_on date,
  is_paused boolean not null default false,
  -- Kỳ đến hạn cuối đã sinh; null = chưa sinh kỳ nào
  last_generated_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (to_account_id, user_id) references public.accounts (id, user_id),
  -- Hình dạng theo loại — y hệt bảng transactions
  check (
    (
      type = 'transfer'
      and to_account_id is not null
      and category_id is null
      and to_account_id <> account_id
    )
    or
    (
      type <> 'transfer'
      and to_account_id is null
      and to_amount is null
      and category_id is not null
    )
  )
);

alter table public.recurring_rules enable row level security;

create policy "own rows" on public.recurring_rules
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger set_updated_at
  before update on public.recurring_rules
  for each row
  execute function extensions.moddatetime (updated_at);

-- FK đơn cột + on delete set null: xóa rule giữ nguyên giao dịch cũ (mất liên
-- kết). Composite FK không dùng được vì user_id NOT NULL (cùng lý do
-- debt_payments.transaction_id ở migration 0007).
alter table public.transactions
  add column recurring_rule_id uuid references public.recurring_rules (id) on delete set null;

-- Mỗi rule mỗi ngày đến hạn chỉ có 1 giao dịch — chống 2 thiết bị sinh trùng
create unique index idx_tx_recurring_due
  on public.transactions (recurring_rule_id, occurred_on)
  where recurring_rule_id is not null;
```

- [ ] **Step 2: Cập nhật `src/types/database.types.ts`**

2a. Thêm import (sau dòng `import type { CurrencyCode } from '../lib/money'`):

```ts
import type { RecurringFrequency } from '../lib/recurring'
```

2b. Trong `TransactionRow`, thêm field sau `to_account_id: string | null`:

```ts
  /** Rule định kỳ đã sinh giao dịch này; null = giao dịch nhập tay */
  recurring_rule_id: string | null
```

2c. Thêm type mới sau `DebtPaymentRow`:

```ts
export type RecurringRuleRow = {
  id: string
  user_id: string
  type: TransactionType
  /** minor units theo currency của tài khoản nguồn */
  amount: number
  /** CK xuyên tệ: minor units theo currency tài khoản đích; null = cùng loại tiền */
  to_amount: number | null
  category_id: string | null
  account_id: string
  to_account_id: string | null
  note: string
  frequency: RecurringFrequency
  /** kỳ đến hạn đầu tiên; anchor cho ngày-trong-tháng / thứ-trong-tuần */
  start_on: string
  /** null = vô hạn */
  end_on: string | null
  is_paused: boolean
  /** kỳ đến hạn cuối đã sinh; null = chưa sinh kỳ nào */
  last_generated_on: string | null
  created_at: string
  updated_at: string
}
```

2d. Trong `Database.public.Tables.transactions.Insert`, thêm `'recurring_rule_id'` vào danh sách optional (sau `'note'`):

```ts
        Insert: InsertOf<
          TransactionRow,
          'user_id' | 'type' | 'amount' | 'account_id',
          'id' | 'to_amount' | 'category_id' | 'to_account_id' | 'occurred_on' | 'note' | 'recurring_rule_id'
        >
```

2e. Thêm entry `recurring_rules` vào `Tables` (sau `debt_payments`):

```ts
      recurring_rules: {
        Row: RecurringRuleRow
        Insert: InsertOf<
          RecurringRuleRow,
          'user_id' | 'type' | 'amount' | 'account_id' | 'frequency' | 'start_on',
          | 'id'
          | 'to_amount'
          | 'category_id'
          | 'to_account_id'
          | 'note'
          | 'end_on'
          | 'is_paused'
          | 'last_generated_on'
        >
        Update: Partial<
          Pick<
            RecurringRuleRow,
            | 'type'
            | 'amount'
            | 'to_amount'
            | 'category_id'
            | 'account_id'
            | 'to_account_id'
            | 'note'
            | 'frequency'
            | 'start_on'
            | 'end_on'
            | 'is_paused'
            | 'last_generated_on'
          >
        >
        Relationships: []
      }
```

- [ ] **Step 3: Sửa các chỗ khởi tạo `TransactionRow` (thiếu field mới sẽ lỗi typecheck)**

Thêm `recurring_rule_id: null,` vào object literal defaults ở TỪNG chỗ sau:

- `src/data/demoRepo.ts` — helper `tx()` trong `seed()` (sau `to_amount: null,`).
- `src/data/demoRepo.ts` — `createTransaction` (trong object `row`, sau `user_id: DEMO_USER,`).
- `src/data/demoRepo.ts` — `createDebtPayment` (trong object `tx`, sau `user_id: DEMO_USER,`).
- `src/hooks/queries.ts` — `useCreateTransaction` onMutate, object `optimistic` (sau `user_id: 'me',`).
- `src/features/transactions/filter.test.ts` — factory `tx()` dòng ~6 (sau `to_account_id: null,`).
- `src/features/reports/aggregate.test.ts` — factory `tx()` dòng ~20.
- `src/features/reports/insights.test.ts` — factory `tx` dòng ~7 VÀ factory `etx` dòng ~105.
- `src/features/budgets/progress.test.ts` — factory dòng ~13 (nếu factory trả về full `TransactionRow`; nếu chỉ `Partial` thì bỏ qua).

- [ ] **Step 4: Xác nhận typecheck + test cũ vẫn pass**

Run: `npm run build && npm test`
Expected: build sạch, toàn bộ test PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_recurring_rules.sql src/types/database.types.ts src/data/demoRepo.ts src/hooks/queries.ts src/features/transactions/filter.test.ts src/features/reports/aggregate.test.ts src/features/reports/insights.test.ts src/features/budgets/progress.test.ts
git commit -m "Dinh ky: schema recurring_rules + cot recurring_rule_id"
```

> **Lưu ý vận hành:** migration 0008 phải được chạy trên Supabase (SQL Editor
> hoặc `supabase db push`) trước khi test chế độ Supabase. Demo mode không cần.

---

### Task 3: Repo interface + demoRepo + supabaseRepo

**Files:**
- Modify: `src/data/repo.ts`, `src/data/demoRepo.ts`, `src/data/supabaseRepo.ts`, `src/data/index.ts`

**Interfaces:**
- Consumes: `RecurringRuleRow` (Task 2), `RecurringFrequency` (Task 1).
- Produces (task 4–7 dùng):
  - `interface NewRecurringRule { type: TransactionType; amount: number; to_amount: number | null; category_id: string | null; account_id: string; to_account_id: string | null; note: string; frequency: RecurringFrequency; start_on: string; end_on: string | null }`
  - `type RecurringRulePatch = Partial<NewRecurringRule & { is_paused: boolean; last_generated_on: string | null }>`
  - `type NewRecurringOccurrence = NewTransaction & { recurring_rule_id: string }`
  - `Repo.listRecurringRules(): Promise<RecurringRuleRow[]>`
  - `Repo.createRecurringRule(input: NewRecurringRule): Promise<RecurringRuleRow>`
  - `Repo.updateRecurringRule(id: string, patch: RecurringRulePatch): Promise<RecurringRuleRow>`
  - `Repo.deleteRecurringRule(id: string): Promise<void>`
  - `Repo.insertRecurringOccurrence(input: NewRecurringOccurrence): Promise<boolean>` — `true` = đã tạo, `false` = trùng bỏ qua

- [ ] **Step 1: `src/data/repo.ts` — types + methods**

1a. Thêm import `RecurringFrequency` và `RecurringRuleRow`:

```ts
import type { RecurringFrequency } from '../lib/recurring'
```

và thêm `RecurringRuleRow,` vào import từ `'../types/database.types'`.

1b. Thêm types (sau `NewDebtPayment`):

```ts
export interface NewRecurringRule {
  type: TransactionType
  /** minor units theo currency của tài khoản nguồn */
  amount: number
  /** CK xuyên tệ: minor units của tài khoản đích; null = cùng loại tiền */
  to_amount: number | null
  category_id: string | null
  account_id: string
  to_account_id: string | null
  /** chép vào giao dịch sinh ra */
  note: string
  frequency: RecurringFrequency
  /** kỳ đến hạn đầu tiên (anchor) */
  start_on: string
  /** null = vô hạn */
  end_on: string | null
}

export type RecurringRulePatch = Partial<
  NewRecurringRule & { is_paused: boolean; last_generated_on: string | null }
>

/** Giao dịch do engine catch-up sinh — luôn mang recurring_rule_id. */
export type NewRecurringOccurrence = NewTransaction & { recurring_rule_id: string }
```

1c. Thêm methods vào interface `Repo` (sau nhóm Nợ / cho vay):

```ts
  // --- Giao dịch định kỳ (mục C+D) ---
  listRecurringRules(): Promise<RecurringRuleRow[]>
  createRecurringRule(input: NewRecurringRule): Promise<RecurringRuleRow>
  updateRecurringRule(id: string, patch: RecurringRulePatch): Promise<RecurringRuleRow>
  /** Xóa rule: giao dịch đã sinh giữ nguyên (recurring_rule_id set null). */
  deleteRecurringRule(id: string): Promise<void>
  /** Sinh 1 kỳ cho engine catch-up: true = đã tạo, false = trùng (rule + ngày) bỏ qua. */
  insertRecurringOccurrence(input: NewRecurringOccurrence): Promise<boolean>
```

- [ ] **Step 2: `src/data/index.ts` — re-export**

Thêm `NewRecurringOccurrence, NewRecurringRule, RecurringRulePatch,` vào block `export type { ... }` (giữ thứ tự alphabet).

- [ ] **Step 3: `src/data/demoRepo.ts` — cài 5 method**

3a. Bump storage key (dữ liệu demo seed lại — pattern như v9):

```ts
const STORAGE_KEY = 'sct-demo-db-v10' // v10: giao dịch định kỳ (recurring_rules)
```

3b. Thêm `RecurringRuleRow,` vào import types; thêm `NewRecurringOccurrence, NewRecurringRule, RecurringRulePatch,` vào import từ `'./repo'`.

3c. `DemoDB` thêm field `recurringRules: RecurringRuleRow[]`; trong `seed()` return thêm `recurringRules: []`.

3d. Thêm vào object `demoRepo` (sau `deleteDebtPayment`):

```ts
  async listRecurringRules() {
    return (load().recurringRules ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at))
  },

  async createRecurringRule(input: NewRecurringRule) {
    const db = load()
    db.recurringRules ??= []
    const row: RecurringRuleRow = {
      ...input,
      id: uuid(),
      user_id: DEMO_USER,
      is_paused: false,
      last_generated_on: null,
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    db.recurringRules.push(row)
    save(db)
    return row
  },

  async updateRecurringRule(id: string, patch: RecurringRulePatch) {
    const db = load()
    db.recurringRules ??= []
    const idx = db.recurringRules.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error('Không tìm thấy quy tắc định kỳ')
    db.recurringRules[idx] = { ...db.recurringRules[idx], ...patch, updated_at: nowISO() }
    save(db)
    return db.recurringRules[idx]
  },

  async deleteRecurringRule(id: string) {
    const db = load()
    db.recurringRules = (db.recurringRules ?? []).filter((r) => r.id !== id)
    // Khớp FK on delete set null: giao dịch đã sinh giữ nguyên, chỉ mất liên kết
    db.transactions = db.transactions.map((t) =>
      t.recurring_rule_id === id ? { ...t, recurring_rule_id: null } : t,
    )
    save(db)
  },

  async insertRecurringOccurrence(input: NewRecurringOccurrence) {
    const db = load()
    // Tự kiểm tra trùng (thay cho partial unique index phía Postgres)
    const dup = db.transactions.some(
      (t) => t.recurring_rule_id === input.recurring_rule_id && t.occurred_on === input.occurred_on,
    )
    if (dup) return false
    db.transactions.push({
      ...input,
      id: uuid(),
      user_id: DEMO_USER,
      created_at: nowISO(),
      updated_at: nowISO(),
    })
    save(db)
    return true
  },
```

- [ ] **Step 4: `src/data/supabaseRepo.ts` — cài 5 method**

Thêm `NewRecurringOccurrence, NewRecurringRule, RecurringRulePatch,` vào import từ `'./repo'`, rồi thêm vào object `supabaseRepo` (sau `deleteDebtPayment`):

```ts
  async listRecurringRules() {
    const { data, error } = await getSupabase()
      .from('recurring_rules')
      .select('*')
      .order('created_at')
    if (error) throw error
    return data
  },

  async createRecurringRule(input: NewRecurringRule) {
    const user_id = await currentUserId()
    const { data, error } = await getSupabase()
      .from('recurring_rules')
      .insert({ ...input, user_id })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateRecurringRule(id: string, patch: RecurringRulePatch) {
    const { data, error } = await getSupabase()
      .from('recurring_rules')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteRecurringRule(id: string) {
    // transactions.recurring_rule_id tự set null (FK on delete set null)
    const { error } = await getSupabase().from('recurring_rules').delete().eq('id', id)
    if (error) throw error
  },

  async insertRecurringOccurrence(input: NewRecurringOccurrence) {
    const user_id = await currentUserId()
    const { error } = await getSupabase().from('transactions').insert({ ...input, user_id })
    if (error) {
      // 23505 = unique_violation: thiết bị khác đã sinh kỳ này → bỏ qua im lặng
      if (error.code === '23505') return false
      throw error
    }
    return true
  },
```

- [ ] **Step 5: Xác nhận build + test**

Run: `npm run build && npm test`
Expected: sạch.

- [ ] **Step 6: Commit**

```bash
git add src/data/repo.ts src/data/index.ts src/data/demoRepo.ts src/data/supabaseRepo.ts
git commit -m "Dinh ky: repo demo + supabase cho recurring_rules"
```

---

### Task 4: Engine catch-up (`runRecurringCatchUp`)

**Files:**
- Modify: `src/lib/recurring.ts`
- Test: `src/lib/recurring.test.ts` (thêm describe block)

**Interfaces:**
- Consumes: `listDueDates` (Task 1). KHÔNG import từ `data/` hay `types/` — engine nhận types cấu trúc (structural) để tránh vòng import (`database.types` đã import `RecurringFrequency` từ file này); `Repo` thật thỏa `RecurringRepo` về mặt cấu trúc.
- Produces (task 5 dùng): `runRecurringCatchUp(repo: RecurringRepo, todayISO: string): Promise<number>` — trả về số giao dịch đã tạo.

- [ ] **Step 1: Viết test fail**

Trong `src/lib/recurring.test.ts`: GỘP import mới vào dòng import hiện có Ở ĐẦU FILE:

```ts
import { listDueDates, nextDueDate, nthDueDate, runRecurringCatchUp } from './recurring'
import type { RecurringOccurrenceInput, RecurringRepo, RecurringRuleLike } from './recurring'
```

rồi thêm phần sau vào cuối file:

```ts

function makeRule(over: Partial<RecurringRuleLike> = {}): RecurringRuleLike {
  return {
    id: 'r1',
    type: 'expense',
    amount: 1000,
    to_amount: null,
    category_id: 'c1',
    account_id: 'a1',
    to_account_id: null,
    note: 'tien nha',
    frequency: 'monthly',
    start_on: '2026-05-01',
    end_on: null,
    is_paused: false,
    last_generated_on: null,
    ...over,
  }
}

/** Repo giả in-memory: ghi lại các kỳ đã sinh + patch last_generated_on. */
function makeFakeRepo(rules: RecurringRuleLike[], dupKeys: string[] = []) {
  const inserted: RecurringOccurrenceInput[] = []
  const patches: Record<string, string> = {}
  const dups = new Set(dupKeys)
  const repo: RecurringRepo = {
    async listRecurringRules() {
      return rules
    },
    async insertRecurringOccurrence(input) {
      if (dups.has(`${input.recurring_rule_id}|${input.occurred_on}`)) return false
      inserted.push(input)
      return true
    },
    async updateRecurringRule(id, patch) {
      patches[id] = patch.last_generated_on
      return {}
    },
  }
  return { repo, inserted, patches }
}

describe('runRecurringCatchUp', () => {
  it('sinh đủ các kỳ lỡ với đúng ngày quá khứ + cập nhật last_generated_on', async () => {
    const f = makeFakeRepo([makeRule()])
    const created = await runRecurringCatchUp(f.repo, '2026-07-19')
    expect(created).toBe(3)
    expect(f.inserted.map((i) => i.occurred_on)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01'])
    expect(f.patches['r1']).toBe('2026-07-01')
  })

  it('kỳ trùng (thiết bị khác đã sinh) bỏ qua nhưng vẫn tiến last_generated_on', async () => {
    const f = makeFakeRepo([makeRule()], ['r1|2026-05-01', 'r1|2026-06-01'])
    const created = await runRecurringCatchUp(f.repo, '2026-07-19')
    expect(created).toBe(1)
    expect(f.inserted.map((i) => i.occurred_on)).toEqual(['2026-07-01'])
    expect(f.patches['r1']).toBe('2026-07-01')
  })

  it('rule paused / start tương lai / quá end_on: không sinh, không patch', async () => {
    const f = makeFakeRepo([
      makeRule({ id: 'p', is_paused: true }),
      makeRule({ id: 'f', start_on: '2026-08-01' }),
      makeRule({ id: 'e', end_on: '2026-04-30' }),
    ])
    const created = await runRecurringCatchUp(f.repo, '2026-07-19')
    expect(created).toBe(0)
    expect(f.patches).toEqual({})
  })

  it('chép đúng nội dung rule vào giao dịch sinh ra', async () => {
    const f = makeFakeRepo([makeRule({ frequency: 'weekly', start_on: '2026-07-13' })])
    await runRecurringCatchUp(f.repo, '2026-07-19')
    expect(f.inserted[0]).toEqual({
      type: 'expense',
      amount: 1000,
      to_amount: null,
      category_id: 'c1',
      account_id: 'a1',
      to_account_id: null,
      occurred_on: '2026-07-13',
      note: 'tien nha',
      recurring_rule_id: 'r1',
    })
  })
})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run src/lib/recurring.test.ts`
Expected: FAIL — `runRecurringCatchUp` chưa export.

- [ ] **Step 3: Thêm engine vào cuối `src/lib/recurring.ts`**

```ts
// --- Engine catch-up ---
// Types cấu trúc (không import data/repo hay database.types để tránh vòng
// import); Repo thật của app thỏa RecurringRepo về mặt cấu trúc.

/** Rule đầy đủ nội dung để sinh giao dịch (RecurringRuleRow thỏa type này). */
export interface RecurringRuleLike extends RuleSchedule {
  id: string
  type: 'expense' | 'income' | 'transfer'
  amount: number
  to_amount: number | null
  category_id: string | null
  account_id: string
  to_account_id: string | null
  note: string
}

/** Giao dịch 1 kỳ cần sinh (NewRecurringOccurrence của repo thỏa type này). */
export interface RecurringOccurrenceInput {
  type: 'expense' | 'income' | 'transfer'
  amount: number
  to_amount: number | null
  category_id: string | null
  account_id: string
  to_account_id: string | null
  occurred_on: string
  note: string
  recurring_rule_id: string
}

/** Subset của Repo mà engine cần — test dùng fake, app truyền repo thật. */
export interface RecurringRepo {
  listRecurringRules(): Promise<RecurringRuleLike[]>
  insertRecurringOccurrence(input: RecurringOccurrenceInput): Promise<boolean>
  updateRecurringRule(id: string, patch: { last_generated_on: string }): Promise<unknown>
}

/**
 * Catch-up khi mở app: sinh giao dịch cho MỌI kỳ đến hạn của mọi rule active
 * (sinh bù tất cả kỳ lỡ, occurred_on = đúng ngày đến hạn quá khứ), kỳ trùng
 * do thiết bị khác đã sinh thì bỏ qua. Trả về số giao dịch đã tạo.
 */
export async function runRecurringCatchUp(repo: RecurringRepo, todayISO: string): Promise<number> {
  const rules = await repo.listRecurringRules()
  let created = 0
  for (const rule of rules) {
    const dues = listDueDates(rule, todayISO)
    if (dues.length === 0) continue
    for (const due of dues) {
      const ok = await repo.insertRecurringOccurrence({
        type: rule.type,
        amount: rule.amount,
        to_amount: rule.to_amount,
        category_id: rule.category_id,
        account_id: rule.account_id,
        to_account_id: rule.to_account_id,
        occurred_on: due,
        note: rule.note,
        recurring_rule_id: rule.id,
      })
      if (ok) created++
    }
    await repo.updateRecurringRule(rule.id, { last_generated_on: dues[dues.length - 1] })
  }
  return created
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run src/lib/recurring.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurring.ts src/lib/recurring.test.ts
git commit -m "Dinh ky: engine catch-up sinh giao dich"
```

---

### Task 5: Query hooks + catch-up khi mở app (AppLayout)

**Files:**
- Modify: `src/hooks/queries.ts`, `src/components/AppLayout.tsx`

**Interfaces:**
- Consumes: `runRecurringCatchUp` (Task 4), repo methods (Task 3).
- Produces (task 6, 7 dùng): `useRecurringRules()`, `useCreateRecurringRule()`, `useUpdateRecurringRule()`, `useDeleteRecurringRule()`, `useRunRecurringCatchUp()` (mutation, `mutateAsync(): Promise<number>`).

- [ ] **Step 1: Thêm hooks vào `src/hooks/queries.ts`**

1a. Import: thêm `NewRecurringRule, RecurringRulePatch,` vào import từ `'../data'`; thêm dòng:

```ts
import { runRecurringCatchUp } from '../lib/recurring'
```

1b. Thêm block sau nhóm Nợ / cho vay (trước `useBudgetAlert`):

```ts
// --- Giao dịch định kỳ (mục C+D) ---

export function useRecurringRules() {
  return useQuery({
    queryKey: ['recurringRules'],
    queryFn: () => repo.listRecurringRules(),
    staleTime: 60_000,
  })
}

function invalidateRecurringRules(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['recurringRules'] })
}

export function useCreateRecurringRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewRecurringRule) => repo.createRecurringRule(input),
    onSettled: () => invalidateRecurringRules(qc),
  })
}

export function useUpdateRecurringRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: RecurringRulePatch }) =>
      repo.updateRecurringRule(id, patch),
    onSettled: () => invalidateRecurringRules(qc),
  })
}

export function useDeleteRecurringRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteRecurringRule(id),
    // Xóa rule set null recurring_rule_id trên giao dịch (mất badge) → làm mới giao dịch
    onSettled: () => {
      invalidateRecurringRules(qc)
      invalidateTransactionData(qc)
    },
  })
}

/** Chạy catch-up sinh giao dịch định kỳ; mutateAsync trả về số giao dịch đã tạo. */
export function useRunRecurringCatchUp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => runRecurringCatchUp(repo, toISODate(new Date())),
    onSuccess: (created) => {
      invalidateRecurringRules(qc)
      if (created > 0) invalidateTransactionData(qc)
    },
  })
}
```

- [ ] **Step 2: `src/components/AppLayout.tsx` — chạy 1 lần khi mở app + toast**

2a. Đổi import đầu file:

```ts
import { useEffect, useRef, useState } from 'react'
```

và thêm:

```ts
import { useRunRecurringCatchUp } from '../hooks/queries'
```

2b. Thêm flag module-level (trên `export function AppLayout()`):

```ts
// Catch-up định kỳ chỉ chạy 1 lần mỗi lần mở app (module-level để sống qua
// StrictMode re-mount; bản thân engine cũng idempotent nên chạy lại vô hại)
let recurringCatchUpDone = false
```

2c. Trong component, thêm (sau `const onEntry = ...`):

```ts
  const catchUp = useRunRecurringCatchUp()
  const [recurringToast, setRecurringToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Sinh các kỳ định kỳ đến hạn kể từ lần mở trước; N > 0 → toast
  useEffect(() => {
    if (recurringCatchUpDone) return
    recurringCatchUpDone = true
    catchUp
      .mutateAsync()
      .then((created) => {
        if (created === 0) return
        setRecurringToast(`Đã tạo ${created} giao dịch định kỳ`)
        toastTimer.current = setTimeout(() => setRecurringToast(null), 5000)
      })
      .catch(() => {}) // mở app không được chết vì catch-up lỗi (offline…)
    return () => clearTimeout(toastTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

2d. Thêm toast JSX ngay trước thẻ đóng `</div>` cuối cùng của return:

```tsx
      {recurringToast && (
        <div className="fixed inset-x-0 top-4 z-50 flex justify-center">
          <div className="rounded-full bg-gray-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {recurringToast}
          </div>
        </div>
      )}
```

- [ ] **Step 3: Xác nhận build + lint + test**

Run: `npm run build && npm run lint && npm test`
Expected: sạch.

- [ ] **Step 4: Kiểm tra bằng preview (demo mode)**

Mở app dev, DevTools console tạo rule quá khứ rồi reload:

```js
const db = JSON.parse(localStorage.getItem('sct-demo-db-v10'))
db.recurringRules = [{
  id: 'test-rule', user_id: 'demo-user', type: 'expense', amount: 500,
  to_amount: null, category_id: db.categories.find(c => c.type === 'expense' && !c.parent_id).id,
  account_id: db.accounts[0].id, to_account_id: null, note: 'test dinh ky',
  frequency: 'weekly', start_on: '2026-07-01', end_on: null,
  is_paused: false, last_generated_on: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}]
localStorage.setItem('sct-demo-db-v10', JSON.stringify(db))
location.reload()
```

Expected: toast "Đã tạo 3 giao dịch định kỳ" (1/7, 8/7, 15/7 ≤ 19/7); sổ GD có 3 giao dịch "test dinh ky" đúng ngày; reload lần nữa KHÔNG sinh thêm.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/queries.ts src/components/AppLayout.tsx
git commit -m "Dinh ky: hooks + catch-up khi mo app"
```

---

### Task 6: Màn quản lý `/settings/recurring`

**Files:**
- Create: `src/features/recurring/RecurringPage.tsx`, `src/features/recurring/RecurringFormSheet.tsx`
- Modify: `src/App.tsx` (route lazy), `src/features/settings/SettingsPage.tsx` (link)

**Interfaces:**
- Consumes: hooks Task 5; `nextDueDate`, `RecurringFrequency` (Task 1); `addDaysISO`, `toISODate` (`lib/dates`).
- Produces: route `/settings/recurring`.

- [ ] **Step 1: Tạo `src/features/recurring/RecurringFormSheet.tsx`**

```tsx
import { useMemo, useState } from 'react'
import type { NewRecurringRule } from '../../data'
import {
  useAccounts,
  useCategories,
  useCreateRecurringRule,
  useRunRecurringCatchUp,
  useUpdateRecurringRule,
} from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { CURRENCIES, formatMoney, parseMoney, type CurrencyCode } from '../../lib/money'
import type { RecurringFrequency } from '../../lib/recurring'
import type { RecurringRuleRow, TransactionType } from '../../types/database.types'

const TYPE_TABS: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Chi' },
  { value: 'income', label: 'Thu' },
  { value: 'transfer', label: 'Chuyển khoản' },
]

const FREQ_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: 'weekly', label: 'Hàng tuần' },
  { value: 'monthly', label: 'Hàng tháng' },
  { value: 'yearly', label: 'Hàng năm' },
]

interface Props {
  rule: RecurringRuleRow | null
  onClose: () => void
}

/** Sheet thêm/sửa một quy tắc định kỳ. */
export function RecurringFormSheet({ rule, onClose }: Props) {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const create = useCreateRecurringRule()
  const update = useUpdateRecurringRule()
  const catchUp = useRunRecurringCatchUp()

  const [type, setType] = useState<TransactionType>(rule?.type ?? 'expense')
  const [amountDigits, setAmountDigits] = useState(rule ? String(rule.amount) : '')
  const [toDigits, setToDigits] = useState(rule?.to_amount ? String(rule.to_amount) : '')
  const [categoryId, setCategoryId] = useState<string | null>(rule?.category_id ?? null)
  const [accountId, setAccountId] = useState<string | null>(rule?.account_id ?? null)
  const [toAccountId, setToAccountId] = useState<string | null>(rule?.to_account_id ?? null)
  const [frequency, setFrequency] = useState<RecurringFrequency>(rule?.frequency ?? 'monthly')
  const [startOn, setStartOn] = useState(rule?.start_on ?? toISODate(new Date()))
  const [endOn, setEndOn] = useState(rule?.end_on ?? '')
  const [note, setNote] = useState(rule?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.is_archived), [accounts])
  const activeOfType = useMemo(
    () => categories.filter((c) => c.type === type && !c.is_archived),
    [categories, type],
  )
  const topCategories = activeOfType.filter((c) => !c.parent_id)
  const childrenOf = (id: string) => activeOfType.filter((c) => c.parent_id === id)

  const effectiveAccountId =
    accountId && activeAccounts.some((a) => a.id === accountId)
      ? accountId
      : (activeAccounts[0]?.id ?? null)
  const srcCurrency = activeAccounts.find((a) => a.id === effectiveAccountId)?.currency ?? 'JPY'
  const dstCurrency = activeAccounts.find((a) => a.id === toAccountId)?.currency ?? srcCurrency
  const crossCurrency = type === 'transfer' && !!toAccountId && dstCurrency !== srcCurrency

  const amount = amountDigits === '' ? 0 : Number(amountDigits)
  const toAmount = toDigits === '' ? 0 : Number(toDigits)

  const canSave =
    amount > 0 &&
    !!effectiveAccountId &&
    !!startOn &&
    !saving &&
    (type === 'transfer'
      ? !!toAccountId && toAccountId !== effectiveAccountId && (!crossCurrency || toAmount > 0)
      : !!categoryId && activeOfType.some((c) => c.id === categoryId))

  function switchType(next: TransactionType) {
    setType(next)
    setCategoryId(null)
    setToAccountId(null)
    setToDigits('')
  }

  async function handleSave() {
    if (!canSave || !effectiveAccountId) return
    setSaving(true)
    setError(null)
    try {
      const input: NewRecurringRule = {
        type,
        amount,
        to_amount: crossCurrency ? toAmount : null,
        category_id: type === 'transfer' ? null : categoryId,
        account_id: effectiveAccountId,
        to_account_id: type === 'transfer' ? toAccountId : null,
        note: note.trim(),
        frequency,
        start_on: startOn,
        end_on: endOn || null,
      }
      if (rule) await update.mutateAsync({ id: rule.id, patch: input })
      else await create.mutateAsync(input)
      // Kỳ đã đến hạn sinh ngay, không đợi lần mở app sau
      await catchUp.mutateAsync()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lưu thất bại, thử lại.')
      setSaving(false)
    }
  }

  const accountSelect = (
    value: string | null,
    onChange: (id: string) => void,
    excludeId?: string | null,
  ) => (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm text-gray-700 dark:text-gray-300"
    >
      <option value="" disabled>
        Chọn tài khoản…
      </option>
      {activeAccounts
        .filter((a) => a.id !== excludeId)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {CURRENCIES[a.currency].symbol}
          </option>
        ))}
    </select>
  )

  const moneyInput = (
    digits: string,
    setDigits: (v: string) => void,
    currency: CurrencyCode,
  ) => (
    <input
      inputMode="numeric"
      value={digits === '' ? '' : formatMoney(Number(digits), currency)}
      onChange={(e) => {
        const parsed = String(parseMoney(e.target.value))
        setDigits(parsed === '0' ? '' : parsed)
      }}
      placeholder={formatMoney(0, currency)}
      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-lg font-semibold outline-green-500"
    />
  )

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white dark:bg-gray-900 p-4 lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-gray-800 dark:text-gray-100">
          {rule ? 'Sửa quy tắc định kỳ' : 'Thêm quy tắc định kỳ'}
        </h2>

        {/* Loại giao dịch */}
        <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => switchType(tab.value)}
              className={`rounded-md py-1.5 text-sm font-medium transition ${
                type === tab.value
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tài khoản (+ đích nếu chuyển khoản) */}
        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          {type === 'transfer' ? 'Từ tài khoản' : 'Tài khoản'}
        </label>
        <div className="mb-3">{accountSelect(effectiveAccountId, setAccountId, toAccountId)}</div>
        {type === 'transfer' && (
          <>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Đến tài khoản
            </label>
            <div className="mb-3">{accountSelect(toAccountId, setToAccountId, effectiveAccountId)}</div>
          </>
        )}

        {/* Danh mục (ẩn khi chuyển khoản) */}
        {type !== 'transfer' && (
          <>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Danh mục
            </label>
            <select
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm text-gray-700 dark:text-gray-300"
            >
              <option value="" disabled>
                Chọn danh mục…
              </option>
              {topCategories.map((parent) => {
                const kids = childrenOf(parent.id)
                // Cha có con: chỉ chọn được con (như màn Nhập); cha không con: chọn trực tiếp
                return kids.length > 0 ? (
                  <optgroup key={parent.id} label={`${parent.icon} ${parent.name}`}>
                    {kids.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  <option key={parent.id} value={parent.id}>
                    {parent.icon} {parent.name}
                  </option>
                )
              })}
            </select>
          </>
        )}

        {/* Số tiền */}
        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Số tiền ({srcCurrency})
        </label>
        <div className="mb-3">{moneyInput(amountDigits, setAmountDigits, srcCurrency)}</div>
        {crossCurrency && (
          <>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Nhận được ({dstCurrency})
            </label>
            <div className="mb-3">{moneyInput(toDigits, setToDigits, dstCurrency)}</div>
          </>
        )}

        {/* Chu kỳ + ngày bắt đầu / kết thúc */}
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Chu kỳ
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm text-gray-700 dark:text-gray-300"
            >
              {FREQ_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Bắt đầu (kỳ đầu tiên)
            </label>
            <input
              type="date"
              value={startOn}
              onChange={(e) => setStartOn(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm outline-green-500"
            />
          </div>
        </div>
        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Kết thúc (không bắt buộc)
        </label>
        <input
          type="date"
          value={endOn}
          onChange={(e) => setEndOn(e.target.value)}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm outline-green-500"
        />

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Ghi chú (không bắt buộc)
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: tiền nhà"
          className="mb-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-green-500"
        />

        {rule && (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Thay đổi chỉ áp dụng cho các kỳ tương lai; giao dịch đã sinh giữ nguyên.
          </p>
        )}
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Tạo `src/features/recurring/RecurringPage.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRightLeft, ChevronLeft, Pause, Play, Plus, Trash2 } from 'lucide-react'
import {
  useAccounts,
  useCategories,
  useDeleteRecurringRule,
  useRecurringRules,
  useRunRecurringCatchUp,
  useUpdateRecurringRule,
} from '../../hooks/queries'
import { addDaysISO, toISODate } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { nextDueDate, type RecurringFrequency } from '../../lib/recurring'
import type { RecurringRuleRow } from '../../types/database.types'
import { RecurringFormSheet } from './RecurringFormSheet'

const FREQ_LABEL: Record<RecurringFrequency, string> = {
  weekly: 'Hàng tuần',
  monthly: 'Hàng tháng',
  yearly: 'Hàng năm',
}
const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

const AMOUNT_COLOR: Record<RecurringRuleRow['type'], string> = {
  expense: 'text-red-600 dark:text-red-400',
  income: 'text-green-600 dark:text-green-400',
  transfer: 'text-gray-500 dark:text-gray-400',
}

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

/** "Hàng tháng · ngày 25" / "Hàng tuần · Thứ 2" / "Hàng năm · 25/12" */
function scheduleLabel(rule: RecurringRuleRow): string {
  const [, m, d] = rule.start_on.split('-').map(Number)
  if (rule.frequency === 'weekly')
    return `${FREQ_LABEL.weekly} · ${WEEKDAYS[new Date(rule.start_on + 'T00:00:00').getDay()]}`
  if (rule.frequency === 'monthly') return `${FREQ_LABEL.monthly} · ngày ${d}`
  return `${FREQ_LABEL.yearly} · ${d}/${m}`
}

/** Màn quản lý giao dịch định kỳ (Cài đặt → Giao dịch định kỳ). */
export function RecurringPage() {
  const navigate = useNavigate()
  const { data: rules = [], isLoading } = useRecurringRules()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const update = useUpdateRecurringRule()
  const del = useDeleteRecurringRule()
  const catchUp = useRunRecurringCatchUp()
  const [sheet, setSheet] = useState<{ open: boolean; rule: RecurringRuleRow | null }>({
    open: false,
    rule: null,
  })

  const accountOf = (id: string | null) => accounts.find((a) => a.id === id)
  const categoryOf = (id: string | null) => categories.find((c) => c.id === id)

  async function togglePause(rule: RecurringRuleRow) {
    if (rule.is_paused) {
      // Bật lại: các kỳ rơi vào lúc tạm dừng KHÔNG sinh bù — đẩy last_generated_on
      // lên hôm qua (nếu đang cũ hơn) rồi catch-up để kỳ đến hạn hôm nay sinh ngay
      const yesterday = addDaysISO(toISODate(new Date()), -1)
      const last =
        rule.last_generated_on && rule.last_generated_on > yesterday
          ? rule.last_generated_on
          : yesterday
      await update.mutateAsync({ id: rule.id, patch: { is_paused: false, last_generated_on: last } })
      await catchUp.mutateAsync()
    } else {
      await update.mutateAsync({ id: rule.id, patch: { is_paused: true } })
    }
  }

  async function handleDelete(rule: RecurringRuleRow) {
    if (!window.confirm('Xóa quy tắc định kỳ này? Giao dịch đã sinh vẫn được giữ lại.')) return
    await del.mutateAsync(rule.id)
  }

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="flex items-center gap-1 rounded-lg bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-600 dark:text-gray-300 shadow-sm active:scale-95"
          aria-label="Quay lại Cài đặt"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-lg font-bold text-gray-800 dark:text-gray-100">
          Giao dịch định kỳ
        </h1>
        <button
          type="button"
          onClick={() => setSheet({ open: true, rule: null })}
          className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm active:scale-95"
        >
          <Plus className="h-4 w-4" /> Thêm
        </button>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">Đang tải…</p>
      ) : rules.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
          Chưa có quy tắc nào. Thêm ở đây hoặc chọn "Lặp lại" khi nhập giao dịch.
        </p>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-sm dark:divide-gray-800 dark:bg-gray-900">
          {rules.map((rule) => {
            const acc = accountOf(rule.account_id)
            const cat = categoryOf(rule.category_id)
            const next = nextDueDate(rule)
            return (
              <div
                key={rule.id}
                className={`flex items-center gap-2 px-3 py-3 ${rule.is_paused ? 'opacity-50' : ''}`}
              >
                <span className="text-xl">
                  {rule.type === 'transfer' ? (
                    <ArrowRightLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  ) : (
                    cat?.icon
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setSheet({ open: true, rule })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm text-gray-800 dark:text-gray-100">
                    {rule.type === 'transfer'
                      ? `${acc?.name ?? '?'} → ${accountOf(rule.to_account_id)?.name ?? '?'}`
                      : (cat?.name ?? '?')}
                    {rule.note && (
                      <span className="text-gray-400 dark:text-gray-500"> · {rule.note}</span>
                    )}
                  </span>
                  <span className="block text-xs text-gray-400 dark:text-gray-500">
                    {scheduleLabel(rule)} ·{' '}
                    {rule.is_paused ? 'Tạm dừng' : next ? `kỳ tới ${fmtDate(next)}` : 'Đã kết thúc'}
                  </span>
                </button>
                <span className={`text-sm font-semibold ${AMOUNT_COLOR[rule.type]}`}>
                  {formatMoney(rule.amount, acc?.currency ?? 'JPY')}
                </span>
                <button
                  type="button"
                  onClick={() => togglePause(rule)}
                  aria-label={rule.is_paused ? 'Chạy lại' : 'Tạm dừng'}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-gray-800"
                >
                  {rule.is_paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(rule)}
                  aria-label="Xóa"
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-gray-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {sheet.open && (
        <RecurringFormSheet rule={sheet.rule} onClose={() => setSheet({ open: false, rule: null })} />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Route trong `src/App.tsx`**

Thêm lazy import (cạnh `DebtsPage`):

```ts
const RecurringPage = lazy(() =>
  import('./features/recurring/RecurringPage').then((m) => ({ default: m.RecurringPage })),
)
```

Thêm route (sau route `/settings/debts/:debtId`):

```tsx
          <Route path="/settings/recurring" element={lazyRoute(<RecurringPage />)} />
```

- [ ] **Step 4: Link trong `src/features/settings/SettingsPage.tsx`**

Thêm `Repeat` vào import lucide-react, rồi thêm Link vào section "Quản lý" (sau Link Nợ / cho vay):

```tsx
          <Link
            to="/settings/recurring"
            className="flex items-center gap-3 px-3 py-3 text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            <Repeat className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <span className="flex-1">Giao dịch định kỳ</span>
            <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600" />
          </Link>
```

- [ ] **Step 5: Build + lint + kiểm tra preview**

Run: `npm run build && npm run lint`
Expected: sạch.

Preview (demo mode): Cài đặt → Giao dịch định kỳ → Thêm rule chi "Hàng tháng" bắt đầu hôm nay → lưu xong sổ GD có ngay giao dịch hôm nay (catch-up chạy ngay); quay lại danh sách thấy "kỳ tới" = tháng sau; bấm Tạm dừng → mờ + nhãn "Tạm dừng"; sửa số tiền → giao dịch cũ không đổi; xóa → confirm nói rõ giao dịch giữ lại.

- [ ] **Step 6: Commit**

```bash
git add src/features/recurring/RecurringPage.tsx src/features/recurring/RecurringFormSheet.tsx src/App.tsx src/features/settings/SettingsPage.tsx
git commit -m "Dinh ky: man quan ly /settings/recurring"
```

---

### Task 7: Tùy chọn "Lặp lại" ở màn Nhập

**Files:**
- Modify: `src/features/transactions/TransactionForm.tsx`, `src/features/transactions/EntryPage.tsx`

**Interfaces:**
- Consumes: `NewRecurringRule` (Task 3), `useCreateRecurringRule` + `useRunRecurringCatchUp` (Task 5), `RecurringFrequency` (Task 1).
- Produces: prop mới `TransactionFormProps.onSubmitRecurring?: (rule: NewRecurringRule) => Promise<void>` — chỉ form nhập mới dùng (form sửa `EditTransactionSheet` không truyền → không hiện selector).

- [ ] **Step 1: `TransactionForm.tsx` — selector + rẽ nhánh submit**

1a. Import thêm:

```ts
import type { NewRecurringRule, NewTransaction } from '../../data'
import type { RecurringFrequency } from '../../lib/recurring'
```

(dòng import `NewTransaction` hiện có từ `'../../data'` — gộp vào cùng dòng.)

1b. Thêm prop vào `TransactionFormProps` (sau `initialType`):

```ts
  /**
   * Màn Nhập: cho phép "Lặp lại". Khi người dùng chọn chu kỳ, submit gọi hàm
   * này (tạo rule + catch-up sinh kỳ đầu) thay vì onSubmit. Không truyền
   * (form sửa) → không hiện selector.
   */
  onSubmitRecurring?: (rule: NewRecurringRule) => Promise<void>
```

và destructure `onSubmitRecurring,` trong tham số component.

1c. Thêm state (sau `const [note, setNote] = ...`):

```ts
  const [repeat, setRepeat] = useState<'none' | RecurringFrequency>('none')
```

1d. Trong `handleSubmit`, thay dòng `await (keepGoing ? onContinue!(values) : onSubmit(values))` bằng:

```ts
      if (repeat !== 'none' && onSubmitRecurring) {
        // Lặp lại: tạo rule (kỳ đầu do engine catch-up sinh, không tạo GD riêng)
        await onSubmitRecurring({
          type,
          amount,
          to_amount: crossCurrency ? toAmount : null,
          category_id: type === 'transfer' ? null : categoryId,
          account_id: effectiveAccountId,
          to_account_id: type === 'transfer' ? toAccountId : null,
          note: note.trim(),
          frequency: repeat,
          start_on: date,
          end_on: null,
        })
      } else {
        await (keepGoing ? onContinue!(values) : onSubmit(values))
      }
```

1e. Thêm selector vào hàng "Tài khoản + ngày" (sau `<input type="date" ... />`):

```tsx
        {!initial && onSubmitRecurring && (
          <select
            value={repeat}
            onChange={(e) => setRepeat(e.target.value as 'none' | RecurringFrequency)}
            aria-label="Lặp lại"
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300"
          >
            <option value="none">Không lặp</option>
            <option value="weekly">Hàng tuần</option>
            <option value="monthly">Hàng tháng</option>
            <option value="yearly">Hàng năm</option>
          </select>
        )}
```

1f. Khi đã chọn lặp lại, ẩn nút "Tiếp tục" (rule không nhập hàng loạt): đổi điều kiện render 2 nút từ `{onContinue ? (` thành `{onContinue && repeat === 'none' ? (`.

- [ ] **Step 2: `EntryPage.tsx` — wiring**

2a. Import thêm `useCreateRecurringRule, useRunRecurringCatchUp` từ `'../../hooks/queries'`, và trong component:

```ts
  const createRule = useCreateRecurringRule()
  const catchUp = useRunRecurringCatchUp()
```

2b. Thêm prop cho `<TransactionForm ...>` (sau `onContinue={...}`):

```tsx
        // Lặp lại: tạo rule + sinh ngay kỳ đến hạn, toast rồi về Sổ GD
        onSubmitRecurring={async (rule) => {
          await createRule.mutateAsync(rule)
          await catchUp.mutateAsync()
          setToast({ text: 'Đã tạo quy tắc định kỳ ✓' })
          clearTimeout(toastTimer.current)
          toastTimer.current = setTimeout(() => {
            setToast(null)
            navigate('/')
          }, 1200)
        }}
```

- [ ] **Step 3: Build + lint + preview**

Run: `npm run build && npm run lint`
Expected: sạch.

Preview (demo mode): màn Nhập → nhập chi 500 + chọn "Hàng tuần" → nút "Tiếp tục" biến mất → Lưu → toast "Đã tạo quy tắc định kỳ ✓" rồi tự về Sổ GD, có giao dịch hôm nay; Cài đặt → Giao dịch định kỳ thấy rule mới "Hàng tuần". Form sửa giao dịch (mở từ Sổ GD) KHÔNG có selector Lặp lại.

- [ ] **Step 4: Commit**

```bash
git add src/features/transactions/TransactionForm.tsx src/features/transactions/EntryPage.tsx
git commit -m "Dinh ky: tuy chon Lap lai o man Nhap"
```

---

### Task 8: Badge 🔁 trong sổ giao dịch + xác minh cuối

**Files:**
- Modify: `src/features/transactions/TransactionItem.tsx`

**Interfaces:**
- Consumes: `TransactionRow.recurring_rule_id` (Task 2).

- [ ] **Step 1: Badge trong `TransactionItem.tsx`**

Đổi import lucide: `import { ArrowRightLeft, Repeat } from 'lucide-react'`.

Trong span dòng đầu (chứa tên danh mục + note), thêm sau `{tx.note && ...}`:

```tsx
          {tx.recurring_rule_id && (
            <Repeat
              aria-label="Giao dịch định kỳ"
              className="ml-1 inline h-3 w-3 align-baseline text-gray-400 dark:text-gray-500"
            />
          )}
```

- [ ] **Step 2: Xác minh toàn cục**

Run: `npm run build && npm run lint && npm test`
Expected: cả 3 sạch.

Preview: Sổ GD — giao dịch do rule sinh có icon 🔁 nhỏ cạnh ghi chú; giao dịch nhập tay không có; xóa rule ở Cài đặt → badge biến mất (sau invalidate).

- [ ] **Step 3: Commit**

```bash
git add src/features/transactions/TransactionItem.tsx
git commit -m "Dinh ky: badge giao dich dinh ky trong so"
```

---

## Ghi chú cuối

- **Áp dụng migration:** chạy `supabase/migrations/0008_recurring_rules.sql` trên Supabase SQL Editor trước khi dùng chế độ Supabase (demo mode không cần).
- **Toast khi tạo rule từ màn Nhập** giữ đúng spec ("Đã tạo quy tắc định kỳ ✓"), hiện 1.2s rồi tự về Sổ GD.
- **Unpause không sinh bù** các kỳ trong lúc tạm dừng (đã ghi trong spec).
