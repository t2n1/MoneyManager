# Bộ danh mục kiểu Nhật (nút "Thêm bộ danh mục Nhật") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm nút trong trang Danh mục để **bổ sung** một bộ danh mục chi tiêu kiểu Nhật (nhãn tiếng Việt), chỉ thêm mục còn thiếu, giữ nguyên danh mục & giao dịch hiện có.

**Architecture:** Bộ danh mục là dữ liệu thuần trong `japanPreset.ts` + một hàm thuần `planJapanPreset(existing)` tính ra danh sách cha/con còn thiếu (unit-test được). Repo method `addJapanCategoryPreset()` thực thi kế hoạch đó: tạo cha thiếu trước, lấy id, rồi tạo con thiếu trỏ đúng cha. So trùng theo (tên chuẩn hóa bỏ dấu, loại) dùng `normalizeText` sẵn có. Idempotent tự nhiên: lần chạy sau `existing` đã đủ → kế hoạch rỗng.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, TailwindCSS v4, TanStack Query, Supabase.

## Global Constraints

- Hai repo (`demoRepo`, `supabaseRepo`) phải đồng bộ cho method mới.
- So trùng tên danh mục KHÔNG phân biệt hoa/thường & dấu tiếng Việt — dùng `normalizeText` từ `src/features/transactions/filter.ts` (đã export).
- Danh mục có cấu trúc cha→con (`parent_id`); con thừa kế `type` của cha.
- Nhãn danh mục CHỈ tiếng Việt (không kèm chữ Nhật).
- Chỉ **thêm mục còn thiếu**, không sửa/không xóa/không đụng giao dịch.
- Test: `npx vitest run`; build-typecheck: `npx tsc -b` (KHÔNG dùng `--noEmit` — root là solution config, bỏ sót lỗi build).
- KHÔNG dùng Bash chạy dev server — dùng công cụ Browser `preview_start`.

---

### Task 1: Dữ liệu bộ danh mục + hàm thuần `planJapanPreset` (unit-tested)

**Files:**
- Create: `src/features/categories/japanPreset.ts`
- Test: `src/features/categories/japanPreset.test.ts`

**Interfaces:**
- Consumes: `CategoryRow`, `CategoryType` từ `../../types/database.types`; `normalizeText` từ `../transactions/filter`.
- Produces:
  - `JAPAN_PRESET: PresetParent[]`
  - `interface PresetChild { name: string; icon: string }`
  - `interface PresetParent { name: string; icon: string; type: CategoryType; children: PresetChild[] }`
  - `interface PresetPlan { parentsToCreate: { name: string; icon: string; type: CategoryType }[]; childrenToCreate: { name: string; icon: string; type: CategoryType; parentName: string }[] }`
  - `planJapanPreset(existing: CategoryRow[]): PresetPlan`

- [ ] **Step 1: Viết file dữ liệu + hàm thuần**

Tạo `src/features/categories/japanPreset.ts`:

```ts
// Bộ danh mục chi tiêu kiểu Nhật (nhãn tiếng Việt) cho người Việt sống ở Nhật.
// Dùng cho nút "Thêm bộ danh mục Nhật": CHỈ bổ sung mục còn thiếu, không sửa/xóa.
// planJapanPreset là hàm thuần (test được); repo dùng nó để biết cần tạo gì.

import { normalizeText } from '../transactions/filter'
import type { CategoryRow, CategoryType } from '../../types/database.types'

export interface PresetChild {
  name: string
  icon: string
}

export interface PresetParent {
  name: string
  icon: string
  type: CategoryType
  children: PresetChild[]
}

/** Bộ danh mục kiểu Nhật. Cha có thể trùng danh mục sẵn có (Ăn uống, Đi lại…) →
 *  khi đó tái dùng cha, chỉ thêm con còn thiếu. */
export const JAPAN_PRESET: PresetParent[] = [
  {
    name: 'Nhà ở',
    icon: '🏠',
    type: 'expense',
    children: [
      { name: 'Tiền nhà', icon: '🏠' },
      { name: 'Phí quản lý', icon: '🧾' },
      { name: 'Gas', icon: '🔥' },
    ],
  },
  {
    name: 'Đi lại',
    icon: '🚆',
    type: 'expense',
    children: [
      { name: 'Vé tháng', icon: '🎫' },
      { name: 'Nạp IC', icon: '🚆' },
    ],
  },
  {
    name: 'Hóa đơn & tiện ích',
    icon: '🧾',
    type: 'expense',
    children: [{ name: 'NHK', icon: '📺' }],
  },
  {
    name: 'Ăn uống',
    icon: '🍜',
    type: 'expense',
    children: [{ name: 'Konbini', icon: '🏪' }],
  },
  {
    name: 'Bảo hiểm & lương hưu',
    icon: '🛡️',
    type: 'expense',
    children: [
      { name: 'Bảo hiểm y tế', icon: '🏥' },
      { name: 'Nenkin', icon: '👴' },
    ],
  },
  {
    name: 'Thuế',
    icon: '🏛️',
    type: 'expense',
    children: [
      { name: 'Thuế thị dân', icon: '🏛️' },
      { name: 'Thuế thu nhập', icon: '🧾' },
    ],
  },
  {
    name: 'Về Việt Nam',
    icon: '✈️',
    type: 'expense',
    children: [
      { name: 'Gửi tiền về VN', icon: '💸' },
      { name: 'Vé máy bay về VN', icon: '✈️' },
    ],
  },
  {
    name: 'Làm thêm',
    icon: '💵',
    type: 'income',
    children: [],
  },
  {
    name: 'Hoàn thuế',
    icon: '🧧',
    type: 'income',
    children: [],
  },
]

export interface PresetPlan {
  parentsToCreate: { name: string; icon: string; type: CategoryType }[]
  childrenToCreate: { name: string; icon: string; type: CategoryType; parentName: string }[]
}

/** So bộ Nhật với danh mục hiện có (khớp theo tên chuẩn hóa + loại) → cái còn thiếu.
 *  Cha đã tồn tại thì tái dùng; con đã tồn tại (bất kể cha nào) thì bỏ qua. */
export function planJapanPreset(existing: CategoryRow[]): PresetPlan {
  const key = (name: string, type: CategoryType) => `${type}::${normalizeText(name)}`
  const have = new Set(existing.map((c) => key(c.name, c.type)))

  const parentsToCreate: PresetPlan['parentsToCreate'] = []
  const childrenToCreate: PresetPlan['childrenToCreate'] = []

  for (const p of JAPAN_PRESET) {
    if (!have.has(key(p.name, p.type))) {
      parentsToCreate.push({ name: p.name, icon: p.icon, type: p.type })
    }
    for (const ch of p.children) {
      if (!have.has(key(ch.name, p.type))) {
        childrenToCreate.push({
          name: ch.name,
          icon: ch.icon,
          type: p.type,
          parentName: p.name,
        })
      }
    }
  }

  return { parentsToCreate, childrenToCreate }
}
```

- [ ] **Step 2: Viết test**

Tạo `src/features/categories/japanPreset.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CategoryRow, CategoryType } from '../../types/database.types'
import { JAPAN_PRESET, planJapanPreset } from './japanPreset'

let seq = 0
function cat(name: string, type: CategoryType, parent_id: string | null = null): CategoryRow {
  return {
    id: `c${seq++}`,
    user_id: 'u',
    name,
    type,
    icon: '📦',
    parent_id,
    sort_order: 0,
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
  }
}

describe('planJapanPreset', () => {
  it('danh mục rỗng → tạo mọi cha và con của bộ Nhật', () => {
    const plan = planJapanPreset([])
    const expectedParents = JAPAN_PRESET.length
    const expectedChildren = JAPAN_PRESET.reduce((n, p) => n + p.children.length, 0)
    expect(plan.parentsToCreate).toHaveLength(expectedParents)
    expect(plan.childrenToCreate).toHaveLength(expectedChildren)
    // con trỏ đúng tên cha
    expect(plan.childrenToCreate.find((c) => c.name === 'Tiền nhà')?.parentName).toBe('Nhà ở')
  })

  it('tái dùng cha đã tồn tại: không tạo lại cha, vẫn thêm con thiếu', () => {
    const existing = [cat('Ăn uống', 'expense')]
    const plan = planJapanPreset(existing)
    expect(plan.parentsToCreate.find((p) => p.name === 'Ăn uống')).toBeUndefined()
    expect(plan.childrenToCreate.find((c) => c.name === 'Konbini')).toBeDefined()
  })

  it('bỏ qua con đã tồn tại (khớp không phân biệt dấu/hoa thường)', () => {
    const existing = [cat('konbini', 'expense')]
    const plan = planJapanPreset(existing)
    expect(plan.childrenToCreate.find((c) => c.name === 'Konbini')).toBeUndefined()
  })

  it('idempotent: đã có đủ bộ Nhật → kế hoạch rỗng', () => {
    const existing: CategoryRow[] = []
    for (const p of JAPAN_PRESET) {
      existing.push(cat(p.name, p.type))
      for (const ch of p.children) existing.push(cat(ch.name, p.type))
    }
    const plan = planJapanPreset(existing)
    expect(plan.parentsToCreate).toHaveLength(0)
    expect(plan.childrenToCreate).toHaveLength(0)
  })

  it('phân biệt theo loại: "Hoàn thuế" (thu) không bị coi là đã có khi chỉ có mục chi trùng tên', () => {
    const existing = [cat('Hoàn thuế', 'expense')]
    const plan = planJapanPreset(existing)
    expect(plan.parentsToCreate.find((p) => p.name === 'Hoàn thuế' && p.type === 'income')).toBeDefined()
  })
})
```

- [ ] **Step 3: Chạy test + xác nhận qua**

Run: `npx vitest run src/features/categories/japanPreset.test.ts && npx tsc -b`
Expected: 5 test PASS, `tsc -b` không lỗi.

- [ ] **Step 4: Commit**

```bash
git add src/features/categories/japanPreset.ts src/features/categories/japanPreset.test.ts
git commit -m "Nhat: bo danh muc + planJapanPreset (thuan, tinh muc con thieu)"
```

---

### Task 2: Repo method `addJapanCategoryPreset()` (interface + 2 repo)

**Files:**
- Modify: `src/data/repo.ts` (interface `Repo`)
- Modify: `src/data/supabaseRepo.ts`
- Modify: `src/data/demoRepo.ts`

**Interfaces:**
- Consumes: `planJapanPreset`, `JAPAN_PRESET` từ `../features/categories/japanPreset`; `getCategories()`, `createCategory()` sẵn có trên mỗi repo.
- Produces: `Repo.addJapanCategoryPreset(): Promise<number>` (trả số danh mục đã thêm).

**Thuật toán chung (cả 2 repo giống hệt):**
1. Đọc danh mục hiện có.
2. `plan = planJapanPreset(existing)`.
3. Dựng map `parentIdByKey` (`type::normalizeText(name)` → id) từ các danh mục cha (parent_id null) hiện có, để con tái dùng cha sẵn.
4. Tạo từng cha trong `plan.parentsToCreate` qua `createCategory`; thêm id mới vào map.
5. Tạo từng con trong `plan.childrenToCreate` qua `createCategory` với `parent_id` = map[key(parentName)] ?? null.
6. Trả `plan.parentsToCreate.length + plan.childrenToCreate.length`.

- [ ] **Step 1: Thêm vào interface `Repo`**

Trong `src/data/repo.ts`, thêm dòng sau `reorderCategories(orderedIds: string[]): Promise<void>` (khoảng dòng 168):

```ts
  /** Bổ sung bộ danh mục kiểu Nhật: chỉ tạo mục còn thiếu (khớp tên+loại). Trả số đã thêm. */
  addJapanCategoryPreset(): Promise<number>
```

- [ ] **Step 2: Cài trong `supabaseRepo`**

Trong `src/data/supabaseRepo.ts`, thêm import ở đầu file (cùng khu import feature nếu có, nếu không thì thêm dòng mới):

```ts
import { planJapanPreset } from '../features/categories/japanPreset'
import { normalizeText } from '../features/transactions/filter'
```

Thêm method ngay sau `reorderCategories` (khoảng dòng 220). Repo là object literal `export const supabaseRepo: Repo = {…}` và toàn file KHÔNG dùng `this` — nên gọi method anh em qua tên hằng `supabaseRepo.` (an toàn, khớp phong cách):

```ts
  async addJapanCategoryPreset() {
    const existing = await supabaseRepo.getCategories()
    const plan = planJapanPreset(existing)
    const keyOf = (name: string, type: string) => `${type}::${normalizeText(name)}`
    const parentIdByKey = new Map<string, string>()
    for (const c of existing) {
      if (!c.parent_id) parentIdByKey.set(keyOf(c.name, c.type), c.id)
    }
    for (const p of plan.parentsToCreate) {
      const created = await supabaseRepo.createCategory({
        name: p.name,
        type: p.type,
        icon: p.icon,
        parent_id: null,
      })
      parentIdByKey.set(keyOf(p.name, p.type), created.id)
    }
    for (const ch of plan.childrenToCreate) {
      await supabaseRepo.createCategory({
        name: ch.name,
        type: ch.type,
        icon: ch.icon,
        parent_id: parentIdByKey.get(keyOf(ch.parentName, ch.type)) ?? null,
      })
    }
    return plan.parentsToCreate.length + plan.childrenToCreate.length
  },
```

> `supabaseRepo.getCategories()` tự tham chiếu const trong module scope — hợp lệ vì chỉ chạy khi được gọi (const đã khởi tạo xong). `getCategories` đã có sẵn trên repo (Repo interface yêu cầu).

- [ ] **Step 3: Cài trong `demoRepo`**

Trong `src/data/demoRepo.ts`, thêm cùng import:

```ts
import { planJapanPreset } from '../features/categories/japanPreset'
import { normalizeText } from '../features/transactions/filter'
```

Thêm method ngay sau `reorderCategories` (khoảng dòng 504). Repo là object literal `export const demoRepo: Repo = {…}`, toàn file KHÔNG dùng `this` — gọi method anh em qua tên hằng `demoRepo.` (mỗi lần createCategory tự load/save; chấp nhận vì đây là thao tác một lần):

```ts
  async addJapanCategoryPreset() {
    const existing = await demoRepo.getCategories()
    const plan = planJapanPreset(existing)
    const keyOf = (name: string, type: string) => `${type}::${normalizeText(name)}`
    const parentIdByKey = new Map<string, string>()
    for (const c of existing) {
      if (!c.parent_id) parentIdByKey.set(keyOf(c.name, c.type), c.id)
    }
    for (const p of plan.parentsToCreate) {
      const created = await demoRepo.createCategory({
        name: p.name,
        type: p.type,
        icon: p.icon,
        parent_id: null,
      })
      parentIdByKey.set(keyOf(p.name, p.type), created.id)
    }
    for (const ch of plan.childrenToCreate) {
      await demoRepo.createCategory({
        name: ch.name,
        type: ch.type,
        icon: ch.icon,
        parent_id: parentIdByKey.get(keyOf(ch.parentName, ch.type)) ?? null,
      })
    }
    return plan.parentsToCreate.length + plan.childrenToCreate.length
  },
```

> `demoRepo.getCategories()` trả `load().categories` đã sort (xem thân `getCategories` hiện có). Tự tham chiếu const hợp lệ vì chỉ chạy khi được gọi.

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: không lỗi.

- [ ] **Step 5: Commit**

```bash
git add src/data/repo.ts src/data/supabaseRepo.ts src/data/demoRepo.ts
git commit -m "Nhat: repo.addJapanCategoryPreset (demo + supabase)"
```

---

### Task 3: Hook + nút trong trang Danh mục + kiểm chứng

**Files:**
- Modify: `src/hooks/queries.ts`
- Modify: `src/features/categories/CategoriesPage.tsx`

**Interfaces:**
- Consumes: `repo.addJapanCategoryPreset()`; mẫu hook `useCreateCategory` (invalidate `['categories']`).
- Produces: `useAddJapanCategoryPreset()` (mutation trả `number`); nút "Thêm bộ danh mục Nhật" trong `CategoriesPage`.

- [ ] **Step 1: Thêm hook**

Trong `src/hooks/queries.ts`, ngay sau `useReorderCategories` (khoảng dòng 216), thêm:

```ts
export function useAddJapanCategoryPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => repo.addJapanCategoryPreset(),
    onSettled: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}
```

- [ ] **Step 2: Thêm nút vào `CategoriesPage`**

Trong `src/features/categories/CategoriesPage.tsx`:

(a) Thêm `useAddJapanCategoryPreset` vào khối import hook hiện có:

```tsx
import {
  useAddJapanCategoryPreset,
  useCategories,
  useCreateCategory,
  useReorderCategories,
  useUpdateCategory,
} from '../../hooks/queries'
```

(b) Trong `CategoriesPage()`, sau dòng `const update = useUpdateCategory()` (khoảng dòng 28), thêm:

```tsx
  const addJapanPreset = useAddJapanCategoryPreset()

  async function handleAddJapanPreset() {
    if (addJapanPreset.isPending) return
    if (!window.confirm('Thêm bộ danh mục kiểu Nhật (tiền nhà, vé tháng, thuế, NHK…)? Chỉ thêm mục còn thiếu, không đụng danh mục hiện có.')) return
    try {
      const added = await addJapanPreset.mutateAsync()
      window.alert(added > 0 ? `Đã thêm ${added} danh mục.` : 'Bộ danh mục Nhật đã đầy đủ.')
    } catch {
      window.alert('Không thêm được. Vui lòng thử lại.')
    }
  }
```

(c) Ngay dưới khối tab Chi/Thu (sau `</div>` đóng khối `grid-cols-2 ... p-1` chứa nút Chi/Thu, khoảng dòng 128), thêm nút:

```tsx
      <button
        type="button"
        onClick={handleAddJapanPreset}
        disabled={addJapanPreset.isPending}
        className="mb-3 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-green-300 dark:border-green-800 px-3 py-2 text-sm font-medium text-green-700 dark:text-green-400 active:scale-95 disabled:opacity-50"
      >
        ✨ {addJapanPreset.isPending ? 'Đang thêm…' : 'Thêm bộ danh mục Nhật'}
      </button>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: không lỗi.

- [ ] **Step 4: Kiểm chứng trên app (chế độ demo)**

- Khởi động dev server bằng công cụ Browser `preview_start` `{name: "so-chi-tieu"}` (dùng server sẵn nếu đã chạy).
- Vào trang Danh mục (`/settings/categories` hoặc qua Cài đặt → Danh mục). Bấm "Thêm bộ danh mục Nhật", xác nhận.
- Kỳ vọng lần 1: alert "Đã thêm N danh mục" (N>0); cây danh mục Chi xuất hiện "Nhà ở" (Tiền nhà/Phí quản lý/Gas), "Vé tháng"/"Nạp IC" dưới "Đi lại", "NHK" dưới "Hóa đơn & tiện ích", "Konbini" dưới "Ăn uống", "Bảo hiểm & lương hưu", "Thuế", "Về Việt Nam"; tab Thu có "Làm thêm", "Hoàn thuế".
- Kỳ vọng lần 2 (bấm lại): alert "Bộ danh mục Nhật đã đầy đủ." và KHÔNG nhân đôi mục nào.
- Xác minh bằng `read_page` (đếm/khớp tên) + `read_console_messages` (không lỗi). Ghi kết quả vào report. Nếu không chạy được server, ghi rõ lý do, bỏ qua step này (không chặn commit) nhưng phải chắc `tsc -b` sạch + test Task 1 xanh.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/queries.ts src/features/categories/CategoriesPage.tsx
git commit -m "Nhat: nut Them bo danh muc Nhat o trang Danh muc"
```

---

## Self-Review

**Spec coverage (#3):**
- Nút "Thêm bộ danh mục Nhật" trong trang Danh mục — Task 3. ✓
- Bổ sung (chỉ thêm mục còn thiếu), giữ nguyên cũ — `planJapanPreset` (Task 1) + thuật toán repo (Task 2). ✓
- Nhãn tiếng Việt — dữ liệu `JAPAN_PRESET` (Task 1). ✓
- Bộ danh mục đúng spec (Nhà ở, Vé tháng/Nạp IC, Konbini, NHK, Bảo hiểm & lương hưu, Thuế, Về Việt Nam, Làm thêm, Hoàn thuế) — Task 1. ✓
- Tạo cha trước rồi con, cả demoRepo + supabaseRepo — Task 2. ✓
- Có tạo "Gửi tiền về VN" (dùng cho #4) — nằm dưới "Về Việt Nam" (Task 1). ✓
- Repo method + hook — Task 2, Task 3. ✓

**Placeholder scan:** không có TBD/TODO; mọi step có code/lệnh cụ thể. Task 2 gọi method anh em qua tên hằng `supabaseRepo.`/`demoRepo.` (khớp phong cách no-`this` của cả 2 file).

**Type consistency:** `PresetParent`/`PresetChild`/`PresetPlan`, `planJapanPreset`, `JAPAN_PRESET`, `addJapanCategoryPreset(): Promise<number>`, `useAddJapanCategoryPreset` khớp xuyên Task 1→2→3. `keyOf`/`normalizeText` dùng nhất quán khi so trùng. `createCategory` nhận `NewCategory { name, type, icon, parent_id? }` — khớp lời gọi.
