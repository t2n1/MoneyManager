# Gói "nhập nhanh hơn" (I, M, K, O) + insight (V, Q) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện màn Nhập (nhớ danh mục, nhập liên tục, hoàn tác, lối tắt PWA) và thêm chỉ số insight ở màn Báo cáo (tỷ lệ tiết kiệm, chuỗi ngày không chi, thẻ gợi ý).

**Architecture:** Toàn bộ tính client-side từ dữ liệu sẵn có. Nhóm A sửa `TransactionForm.tsx` + `EntryPage.tsx` + `vite.config.ts` (UI thuần, không test đơn vị theo nếp dự án). Nhóm B thêm tệp thuần `insights.ts` (TDD) rồi ghép vào `ReportsPage.tsx`.

**Tech Stack:** React 19 + TS + Tailwind + TanStack Query + Recharts + vite-plugin-pwa + Vitest.

## Global Constraints

- Không đổi `schema`, không đụng tầng `repo` — chỉ đọc/tính dữ liệu sẵn có.
- Tiền là minor units (`number`, nguồn gốc `bigint`); quy đổi base qua `convertToBase`; không dùng float để lưu.
- Tôn trọng `month_start_day` qua `getMonthRange` / `monthKeyForDate`.
- UI tiếng Việt; hàm thuần không gọi `new Date()` (truyền ngày vào để test tất định).
- Mỗi mục = 1 commit, lời nhắn **không dấu**. Sau mỗi mục: `npm run build` + `npm run lint` + `npm test` phải sạch.

---

### Task 1: I — Nhớ danh mục dùng gần nhất (theo loại)

**Files:**
- Modify: `src/features/transactions/TransactionForm.tsx`

**Interfaces:**
- Consumes: `useCategories()` (đã có), `localStorage`.
- Produces: hành vi UI; không export mới.

- [ ] **Step 1: Thêm khóa + helper đọc danh mục lần trước**

Ngay dưới `const LAST_ACCOUNT_KEY = 'sct-last-account'` thêm:

```ts
const lastCategoryKey = (type: TransactionType) => `sct-last-category-${type}`

/** id danh mục lần trước của loại `type`, chỉ trả khi còn hợp lệ (không lưu trữ). */
function lastCategoryFor(
  type: TransactionType,
  categories: { id: string; type: TransactionType; is_archived: boolean }[],
): string | null {
  const id = localStorage.getItem(lastCategoryKey(type))
  if (!id) return null
  const c = categories.find((x) => x.id === id)
  return c && c.type === type && !c.is_archived ? id : null
}
```

- [ ] **Step 2: Khởi tạo categoryId theo danh mục lần trước**

`categories` được đọc ở đầu component qua `useCategories()`. Đổi khởi tạo `categoryId`:

```ts
const [categoryId, setCategoryId] = useState<string | null>(
  initial?.category_id ?? lastCategoryFor(initial?.type ?? initialType ?? 'expense', categories),
)
```

(Nếu Task 4 chưa làm, `initialType` chưa tồn tại — khi làm Task 1 trước, tạm dùng `initial?.type ?? 'expense'`; Task 4 sẽ chèn `initialType`. Để tránh phụ thuộc thứ tự, chấp nhận cả hai: nếu `initialType` chưa có, dùng `initial?.type ?? 'expense'`.)

- [ ] **Step 3: switchType chọn lại danh mục lần trước của loại mới**

Trong `switchType`, đổi `setCategoryId(null)` thành:

```ts
setCategoryId(lastCategoryFor(next, categories))
```

- [ ] **Step 4: Ghi danh mục vừa dùng khi lưu**

Trong `handleSubmit`, ngay sau `localStorage.setItem(LAST_ACCOUNT_KEY, effectiveAccountId)` thêm:

```ts
if (type !== 'transfer' && categoryId) {
  localStorage.setItem(lastCategoryKey(type), categoryId)
}
```

- [ ] **Step 5: Gate + verify thủ công**

Run: `npm run build && npm run lint && npm test`
Expected: build sạch, lint 0 lỗi, test pass như trước (không thêm test — UI thuần).
Verify preview (demo, 375px): lưu 1 chi "Ăn uống" → sau reset "Ăn uống" vẫn chọn; đổi tab Thu rồi về Chi → giữ danh mục lần trước.

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/TransactionForm.tsx
git commit -m "GD-nhap: nho danh muc gan nhat theo loai (I)"
```

---

### Task 2: M — Nhập liên tục (giữ danh mục)

**Files:**
- Modify: `src/features/transactions/TransactionForm.tsx`

**Interfaces:**
- Consumes: nhánh `resetAfterSubmit` trong `handleSubmit`.
- Produces: hành vi UI.

- [ ] **Step 1: Bỏ xóa categoryId trong reset**

Trong `handleSubmit`, khối `if (resetAfterSubmit)` hiện là:

```ts
if (resetAfterSubmit) {
  setDigits('')
  setToDigits('')
  setNote('')
  setCategoryId(null)
  setToAccountId(null)
  setActiveField('main')
}
```

Xóa dòng `setCategoryId(null)` (giữ danh mục để nhập tiếp). Các dòng còn lại giữ nguyên — chuyển khoản không có danh mục nên không ảnh hưởng.

- [ ] **Step 2: Gate + verify thủ công**

Run: `npm run build && npm run lint && npm test`
Expected: sạch.
Verify: lưu 1 chi → tài khoản + ngày + danh mục giữ nguyên; chỉ số tiền + ghi chú trống.

- [ ] **Step 3: Commit**

```bash
git add src/features/transactions/TransactionForm.tsx
git commit -m "GD-nhap: nhap lien tuc giu danh muc (M)"
```

---

### Task 3: K — Hoàn tác sau khi lưu

**Files:**
- Modify: `src/features/transactions/EntryPage.tsx`

**Interfaces:**
- Consumes: `useCreateTransaction()` (mutateAsync trả `TransactionRow` có `id`), `useDeleteTransaction()`.
- Produces: hành vi UI.

- [ ] **Step 1: Đổi state toast + thêm mutation xóa**

Đổi import và state đầu component:

```ts
import { useBudgetAlert, useCreateTransaction, useDeleteTransaction } from '../../hooks/queries'
```

```ts
const create = useCreateTransaction()
const del = useDeleteTransaction()
const { overCount } = useBudgetAlert()
const [toast, setToast] = useState<{ text: string; undoId?: string } | null>(null)
const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
```

- [ ] **Step 2: onSubmit lưu id + toast có nút, giữ 5s**

Đổi `onSubmit`:

```ts
onSubmit={async (values) => {
  const row = await create.mutateAsync(values)
  setToast({ text: 'Đã lưu ✓', undoId: row.id })
  clearTimeout(toastTimer.current)
  toastTimer.current = setTimeout(() => setToast(null), 5000)
}}
```

- [ ] **Step 3: Hàm hoàn tác**

Thêm trong component:

```ts
async function handleUndo(id: string) {
  clearTimeout(toastTimer.current)
  await del.mutateAsync(id)
  setToast({ text: 'Đã hoàn tác' })
  toastTimer.current = setTimeout(() => setToast(null), 1500)
}
```

- [ ] **Step 4: Toast có nút Hoàn tác (bấm được)**

Thay khối `{toast && (...)}`:

```tsx
{toast && (
  <div className="fixed inset-x-0 top-4 z-50 flex justify-center">
    <div className="flex items-center gap-3 rounded-full bg-gray-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
      <span>{toast.text}</span>
      {toast.undoId && (
        <button
          type="button"
          onClick={() => handleUndo(toast.undoId!)}
          className="rounded-full bg-white/20 px-2 py-0.5 text-white active:scale-95"
        >
          Hoàn tác
        </button>
      )}
    </div>
  </div>
)}
```

(Bỏ `pointer-events-none` để nút bấm được.)

- [ ] **Step 5: Gate + verify thủ công**

Run: `npm run build && npm run lint && npm test`
Expected: sạch.
Verify: lưu → toast "Đã lưu ✓ · Hoàn tác"; bấm Hoàn tác trong 5s → giao dịch biến mất khỏi Sổ GD, toast đổi "Đã hoàn tác".

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/EntryPage.tsx
git commit -m "GD-nhap: hoan tac sau khi luu (K)"
```

---

### Task 4: O — Lối tắt PWA (Nhập chi / Nhập thu)

**Files:**
- Modify: `vite.config.ts` (chỉ hunk `manifest.shortcuts`)
- Modify: `src/features/transactions/EntryPage.tsx`
- Modify: `src/features/transactions/TransactionForm.tsx`

**Interfaces:**
- Produces: `TransactionForm` prop mới `initialType?: TransactionType`.

- [ ] **Step 1: TransactionForm nhận initialType**

Thêm vào `TransactionFormProps`:

```ts
/** Loại khởi tạo khi mở mới (vd từ lối tắt PWA) — bỏ qua nếu có `initial`. */
initialType?: TransactionType
```

Thêm `initialType` vào destructure tham số, và đổi khởi tạo `type`:

```ts
const [type, setType] = useState<TransactionType>(initial?.type ?? initialType ?? 'expense')
```

(Đồng bộ với Task 1 Step 2: khởi tạo `categoryId` dùng `initial?.type ?? initialType ?? 'expense'`.)

- [ ] **Step 2: EntryPage đọc query type → truyền xuống**

Thêm import và đọc query:

```ts
import { Link, useSearchParams } from 'react-router-dom'
```

```ts
const [searchParams] = useSearchParams()
const qType = searchParams.get('type')
const initialType: TransactionType | undefined =
  qType === 'income' || qType === 'expense' ? qType : undefined
```

(import `TransactionType` từ `../../types/database.types`.) Truyền `initialType={initialType}` vào `<TransactionForm>`.

- [ ] **Step 3: manifest.shortcuts trong vite.config**

Trong `manifest` (sau `icons`) thêm:

```ts
shortcuts: [
  { name: 'Nhập chi', short_name: 'Chi', url: '/?type=expense' },
  { name: 'Nhập thu', short_name: 'Thu', url: '/?type=income' },
],
```

- [ ] **Step 4: Gate + verify thủ công**

Run: `npm run build && npm run lint && npm test`
Expected: sạch.
Verify: mở `/?type=income` → tab Thu chọn sẵn; `/?type=expense` → tab Chi; `/` → mặc định Chi.

- [ ] **Step 5: Commit (chỉ hunk shortcuts của vite.config)**

Lưu ý: `vite.config.ts` có sẵn thay đổi `server.host` chưa commit (của người dùng). Chỉ commit hunk `shortcuts` + 2 file kia. Dùng `git add -p` không tương tác được → stage 2 file src trước, rồi thêm vite.config bằng patch tách hunk:

```bash
git add src/features/transactions/EntryPage.tsx src/features/transactions/TransactionForm.tsx
# stage rieng hunk shortcuts cua vite.config, giu lai hunk server.host chua commit
git commit -m "PWA: loi tat nhap chi/thu (O)"
```

(Xử lý staging vite.config chi tiết ở lúc thực thi — xem ghi chú trong phần thực hiện.)

---

### Task 5: V + Q — insights.ts (thuần, TDD)

**Files:**
- Create: `src/features/reports/insights.ts`
- Test: `src/features/reports/insights.test.ts`

**Interfaces:**
- Produces:
  - `savingsRate(income: number, expense: number): number | null`
  - `noSpendStreak(txs: TransactionRow[], today: string, monthStartDay: number): number`
  - `buildInsights(input: InsightInput, fmt: (minor: number) => string): Insight[]`
  - `interface Insight { id: string; text: string }`
  - `interface InsightInput { expenseThis: number; expensePrev: number; topCategoryName: string | null; topCategoryAmount: number; expenseTotal: number }`

- [ ] **Step 1: Viết test thất bại `insights.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { buildInsights, noSpendStreak, savingsRate } from './insights'
import type { TransactionRow } from '../../types/database.types'

const tx = (occurred_on: string, type: TransactionRow['type']): TransactionRow =>
  ({
    id: occurred_on + type,
    user_id: 'u',
    type,
    amount: 100,
    to_amount: null,
    category_id: type === 'transfer' ? null : 'c',
    account_id: 'a',
    to_account_id: null,
    occurred_on,
    note: '',
    created_at: '',
    updated_at: '',
  }) as TransactionRow

describe('savingsRate', () => {
  it('thu > chi → dương', () => expect(savingsRate(1000, 400)).toBeCloseTo(0.6))
  it('chi > thu → âm', () => expect(savingsRate(400, 1000)).toBeCloseTo(-1.5))
  it('income = 0 → null', () => expect(savingsRate(0, 100)).toBeNull())
})

describe('noSpendStreak', () => {
  it('hôm nay có chi → 0', () => {
    expect(noSpendStreak([tx('2026-07-17', 'expense')], '2026-07-17', 1)).toBe(0)
  })
  it('2 ngày cuối không chi (chi ngày 15) → 2', () => {
    expect(noSpendStreak([tx('2026-07-15', 'expense')], '2026-07-17', 1)).toBe(2)
  })
  it('không chi cả tháng → tính tới đầu tháng tài chính', () => {
    // month_start_day=1, today 2026-07-03 → các ngày 1,2,3 không chi = 3
    expect(noSpendStreak([tx('2026-07-02', 'income')], '2026-07-03', 1)).toBe(3)
  })
})

describe('buildInsights', () => {
  const fmt = (m: number) => `¥${m}`
  it('có tháng trước → câu so sánh đúng dấu', () => {
    const out = buildInsights(
      { expenseThis: 1200, expensePrev: 1000, topCategoryName: 'Ăn uống', topCategoryAmount: 600, expenseTotal: 1200 },
      fmt,
    )
    expect(out.some((i) => i.text.includes('+20%'))).toBe(true)
    expect(out.some((i) => i.text.includes('Ăn uống') && i.text.includes('50%'))).toBe(true)
  })
  it('tháng trước = 0 → bỏ câu so sánh', () => {
    const out = buildInsights(
      { expenseThis: 1200, expensePrev: 0, topCategoryName: 'Ăn uống', topCategoryAmount: 600, expenseTotal: 1200 },
      fmt,
    )
    expect(out.some((i) => i.text.includes('so với tháng trước'))).toBe(false)
  })
  it('không chi → mảng rỗng', () => {
    const out = buildInsights(
      { expenseThis: 0, expensePrev: 0, topCategoryName: null, topCategoryAmount: 0, expenseTotal: 0 },
      fmt,
    )
    expect(out).toEqual([])
  })
})
```

- [ ] **Step 2: Chạy test — thất bại**

Run: `npm test -- insights`
Expected: FAIL (chưa có module `./insights`).

- [ ] **Step 3: Viết `insights.ts` tối thiểu**

```ts
// Chỉ số thấu hiểu tài chính — thuần, không phụ thuộc React, unit-test được.
import { getMonthRange, monthKeyForDate } from '../../lib/dates'
import type { TransactionRow } from '../../types/database.types'

/** (thu − chi) / thu. income <= 0 → null. Có thể âm. */
export function savingsRate(income: number, expense: number): number | null {
  if (income <= 0) return null
  return (income - expense) / income
}

/**
 * Số ngày liên tiếp gần nhất (lùi từ `today`) không có giao dịch chi,
 * giới hạn trong tháng tài chính hiện tại (từ đầu tháng tới `today`).
 */
export function noSpendStreak(
  txs: TransactionRow[],
  today: string,
  monthStartDay: number,
): number {
  const spendDays = new Set(
    txs.filter((t) => t.type === 'expense').map((t) => t.occurred_on),
  )
  const { start } = getMonthRange(monthKeyForDate(today, monthStartDay), monthStartDay)
  let streak = 0
  // đi lùi từng ngày từ today tới >= start
  const cur = new Date(today + 'T00:00:00Z')
  const startDate = new Date(start + 'T00:00:00Z')
  while (cur >= startDate) {
    const iso = cur.toISOString().slice(0, 10)
    if (spendDays.has(iso)) break
    streak++
    cur.setUTCDate(cur.getUTCDate() - 1)
  }
  return streak
}

export interface Insight {
  id: string
  text: string
}

export interface InsightInput {
  expenseThis: number
  expensePrev: number
  topCategoryName: string | null
  topCategoryAmount: number
  expenseTotal: number
}

/** Sinh vài câu gợi ý rule-based; chỉ câu nào đủ dữ liệu. */
export function buildInsights(
  input: InsightInput,
  fmt: (minor: number) => string,
): Insight[] {
  const out: Insight[] = []
  const { expenseThis, expensePrev, topCategoryName, topCategoryAmount, expenseTotal } = input

  if (expensePrev > 0 && expenseThis > 0) {
    const pct = Math.round(((expenseThis - expensePrev) / expensePrev) * 100)
    const sign = pct >= 0 ? '+' : ''
    out.push({
      id: 'vs-prev',
      text: `Tháng này chi ${fmt(expenseThis)}, ${sign}${pct}% so với tháng trước.`,
    })
  }

  if (topCategoryName && expenseTotal > 0 && topCategoryAmount > 0) {
    const pct = Math.round((topCategoryAmount / expenseTotal) * 100)
    out.push({
      id: 'top-cat',
      text: `${topCategoryName} chiếm ${pct}% tổng chi tháng này.`,
    })
  }

  return out
}
```

- [ ] **Step 4: Chạy test — pass**

Run: `npm test -- insights`
Expected: PASS toàn bộ.

- [ ] **Step 5: Gate + commit (kèm UI ở Task 6 hay tách?)**

Task 5 chỉ là logic thuần + test — commit chung với UI (Task 6) trong 1 commit "V, Q" để 1 tính năng = 1 commit theo nếp dự án. **Không commit riêng ở đây**; chạy gate rồi sang Task 6.

Run: `npm run build && npm run lint`
Expected: sạch.

---

### Task 6: V + Q — Ghép UI vào ReportsPage

**Files:**
- Modify: `src/features/reports/ReportsPage.tsx`

**Interfaces:**
- Consumes: `savingsRate`, `noSpendStreak`, `buildInsights` (Task 5); `categoryBreakdown` (đã có).

- [ ] **Step 1: Import + tính dữ liệu insight**

Thêm import:

```ts
import { buildInsights, noSpendStreak, savingsRate } from './insights'
```

Trong component (khu vực tính `series`, `breakdown`), thêm:

```ts
const expenseBreakdown = useMemo(
  () => categoryBreakdown(monthTxs, 'expense', currencyOf, base, rates ?? {}),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [monthTxs, accounts, base, rates],
)
const thisPoint = series.points[series.points.length - 1]
const prevPoint = series.points[series.points.length - 2]
const rate = thisPoint ? savingsRate(thisPoint.income, thisPoint.expense) : null
const streak = useMemo(
  () => noSpendStreak(monthTxs, toISODate(new Date()), monthStartDay),
  [monthTxs, monthStartDay],
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
const hasHealth = rate !== null || streak > 0 || insights.length > 0
```

- [ ] **Step 2: Section "Sức khỏe tài chính" ở đầu view charts**

Ngay sau `{view === 'charts' && (` mở `<>`, trước biểu đồ tròn, thêm:

```tsx
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
      <div className="flex-1 rounded-lg bg-gray-50 p-2 text-center">
        <div className="text-lg font-bold text-gray-800">{streak}</div>
        <div className="text-[11px] text-gray-500">Ngày liên tiếp không chi</div>
      </div>
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
```

- [ ] **Step 3: Gate + verify thủ công**

Run: `npm run build && npm run lint && npm test`
Expected: sạch, test 64+ pass.
Verify (demo có dữ liệu ≥ 2 tháng): màn Báo cáo → tab Biểu đồ hiện "Sức khỏe tài chính" với tỷ lệ tiết kiệm, chuỗi ngày không chi và ≥1 thẻ gợi ý; tháng trống → section ẩn.

- [ ] **Step 4: Commit (Task 5 + 6 chung)**

```bash
git add src/features/reports/insights.ts src/features/reports/insights.test.ts src/features/reports/ReportsPage.tsx
git commit -m "Bao cao: insights ty le tiet kiem, chuoi ngay, the goi y (V, Q)"
```

---

## Self-Review

**Spec coverage:** I→Task1, M→Task2, K→Task3, O→Task4, V→Task5(savingsRate/noSpendStreak)+Task6(UI), Q→Task5(buildInsights)+Task6(UI). Đủ.

**Placeholder scan:** không có TBD/TODO; mọi step có code cụ thể. Ghi chú staging vite.config ở Task4 Step5 là hướng dẫn thao tác, xử lý lúc thực thi.

**Type consistency:** `TransactionType` dùng nhất quán; `initialType` khai báo Task4, dùng Task1 Step2 (có phòng hờ thứ tự); `Insight`/`InsightInput` khớp giữa test (Task5 Step1) và impl (Step3) và UI (Task6). `savingsRate`/`noSpendStreak`/`buildInsights` chữ ký khớp.

**Lưu ý thực thi noSpendStreak:** dùng `Date` UTC chỉ để cộng/trừ ngày (không phải "giờ hiện tại") — chấp nhận trong hàm nhận `today` tường minh; không vi phạm ràng buộc "không lấy giờ hiện tại trong hàm thuần".
