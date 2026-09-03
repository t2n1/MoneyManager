# Nhiều phương pháp phân bổ ngân sách — Kế hoạch thi công

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người dùng chọn được 1 trong 6 phương pháp phân bổ (50/30/20, 80/20, 70/20/10, 6 hũ JARS, Kakeibo, Tự đặt) trong Cài đặt; toàn bộ tab Ngân sách, thẻ Cơ cấu ở Báo cáo và vạch mốc ở Bảng tin chạy theo phương pháp đã chọn.

**Architecture:** Một file thuần mới `budgetMethods.ts` định nghĩa 6 phương pháp — mỗi phương pháp là một danh sách "khoản" (bucket) có nguồn số (`needs` gom nhãn / `allExpense` / `residual`). `categories.need_level` nới từ 2 lên 5 nhãn; nhãn gắn MỘT lần, mọi phương pháp gom theo bảng riêng. `axisProgress` lặp trên buckets thay vì 3 dòng viết cứng. Mốc lưu ở `profiles.budget_method` + `budget_targets jsonb` (chỉ chứa mốc đã chỉnh), ba cột bps cũ bị bỏ.

**Tech Stack:** React + TS, vitest, Supabase (migration SQL viết tay + `database.types.ts` viết tay), Tailwind (design system cứng trong `tests/designSystem.test.ts`).

**Spec:** `docs/superpowers/specs/2026-09-03-phuong-phap-phan-bo-design.md`

## Global Constraints

- Kiểm kiểu bằng `npx tsc -b` — **KHÔNG** dùng `tsc --noEmit` (repo này nó xanh giả).
- Test: `npm test` (vitest run). `tests/designSystem.test.ts` là ban cứng: `<Select>`, `<SectionTitle>`, `<PageHeader>`, `<ActionButton>`; mọi con số qua `<Money>`/`<Num>`; không giá trị Tailwind tuỳ ý (`text-[0.8125rem]`…); không class động `grid-cols-${n}` (Tailwind quét chuỗi tĩnh).
- Migration SQL và `src/types/database.types.ts` sửa **cùng một commit** (không có codegen).
- Sửa `api/_handler.ts` thì phải `npm run bundle:mcp` và commit `api/mcp.mjs` cùng lần (guard `tests/mcpBundle.test.ts`). `supabase/functions/` KHÔNG liên quan — không chạy `bundle:rules`.
- Không chạy prettier. Comment tiếng Việt, mật độ và giọng như file xung quanh.
- Commit message theo kiểu repo: `feat(ngan-sach): ...` — tiếng Việt không dấu.
- CLAUDE.md: trước mỗi commit chạy `detect_changes()` (gitnexus MCP). Index đang ~112 commit sau HEAD — chạy `node .gitnexus/run.cjs analyze` MỘT lần trước Task 1. `impact` cho `axisProgress` đã chạy ở tầng thiết kế: LOW (6 symbol phía trên).
- `resolveMethod` phải chịu dữ liệu lạ (cột `text` + `jsonb`) mà không làm trắng màn — noi gương `parseDensity()` ở `src/lib/density.ts`.

**Số bps mặc định (nguồn chân lý — chép nguyên từ spec):**

| id | buckets (key · label · bps · direction · source) |
|---|---|
| `50-30-20` | essential · Thiết yếu · 5000 · cap · needs[essential,buffer] &#124; flexible · Linh hoạt · 3000 · cap · needs[flexible,education,giving] &#124; savings · Để dành · 2000 · floor · residual |
| `80-20` | allSpend · Chi tiêu · 8000 · cap · allExpense &#124; savings · Để dành · 2000 · floor · residual |
| `70-20-10` | living · Sinh hoạt · 7000 · cap · needs[essential,flexible,education,buffer] &#124; giving · Cho đi · 1000 · cap · needs[giving] &#124; savings · Để dành · 2000 · floor · residual |
| `jars` | essential · Thiết yếu · 5500 · cap · needs[essential,buffer] &#124; flexible · Hưởng thụ · 1000 · cap · needs[flexible] &#124; education · Giáo dục · 1000 · cap · needs[education] &#124; giving · Cho đi · 500 · cap · needs[giving] &#124; savings · Để dành · 2000 · floor · residual |
| `kakeibo` | essential · Sinh tồn · 5000 · cap · needs[essential] &#124; flexible · Hưởng thụ · 2000 · cap · needs[flexible,giving] &#124; education · Văn hóa · 500 · cap · needs[education] &#124; buffer · Dự phòng · 500 · cap · needs[buffer] &#124; savings · Để dành · 2000 · floor · residual |
| `custom` | essential · Thiết yếu · 5000 &#124; flexible · Hưởng thụ · 1500 &#124; education · Giáo dục · 500 &#124; giving · Cho đi · 500 &#124; buffer · Dự phòng · 500 (đều cap · needs[nhãn cùng tên]) &#124; savings · Để dành · 2000 · floor · residual |

**Một điểm lệch spec có chủ ý:** spec có trường `note?: string` trên bucket ("gồm Đầu tư + Tiết kiệm dài hạn"). Bỏ trường đó, gộp câu chú thích vào `hint` của khoản Để dành của `jars` — một trường, một chỗ render (`<Guide>`), không thêm nhánh hiển thị.

---

### Task 1: `budgetMethods.ts` — 6 phương pháp + `resolveMethod` + nới `NeedLevel`

**Files:**
- Modify: `src/types/database.types.ts:24` (chỉ dòng `NeedLevel` — phần ProfileRow để Task 3)
- Create: `src/features/budgets/budgetMethods.ts`
- Test: `src/features/budgets/budgetMethods.test.ts`

**Interfaces:**
- Consumes: `NeedLevel`, `ProfileRow` từ `database.types.ts`.
- Produces (các task sau dựa vào đúng tên/kiểu này):
  - `type BudgetMethodId = '50-30-20' | '80-20' | '70-20-10' | 'jars' | 'kakeibo' | 'custom'`
  - `type AxisKey = 'essential' | 'flexible' | 'education' | 'giving' | 'buffer' | 'living' | 'allSpend' | 'savings'`
  - `type BucketSource = { kind: 'needs'; levels: readonly NeedLevel[] } | { kind: 'allExpense' } | { kind: 'residual' }`
  - `interface MethodBucket { key: AxisKey; label: string; hint: string; bps: number; direction: 'cap' | 'floor'; source: BucketSource }`
  - `interface BudgetMethod { id: BudgetMethodId; name: string; blurb: string; buckets: readonly MethodBucket[] }`
  - `const BUDGET_METHODS: readonly BudgetMethod[]`
  - `function resolveMethod(profile: Pick<ProfileRow, 'budget_method' | 'budget_targets'> | null | undefined): BudgetMethod`
  - `function bucketForNeed(method: BudgetMethod, level: NeedLevel | null): MethodBucket | null`
  - `function clampBps(bps: number | null, fallback: number): number`

- [ ] **Step 1: Nới `NeedLevel`** — trong `src/types/database.types.ts` sửa:

```ts
export type NeedLevel = 'essential' | 'flexible' | 'education' | 'giving' | 'buffer'
```

(Chưa có migration — an toàn vì chưa UI nào GHI 3 giá trị mới; migration ở Task 3, UI ghi ở Task 7.)

- [ ] **Step 2: Viết test fail** — `src/features/budgets/budgetMethods.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BUDGET_METHODS, bucketForNeed, clampBps, resolveMethod } from './budgetMethods'
import type { NeedLevel } from '../../types/database.types'

const NEED_LEVELS: readonly NeedLevel[] = ['essential', 'flexible', 'education', 'giving', 'buffer']
const profile = (budget_method: string, budget_targets: Record<string, number> = {}) =>
  ({ budget_method, budget_targets })

describe('BUDGET_METHODS — bất biến cấu trúc', () => {
  it('có đúng 6 phương pháp, id không trùng', () => {
    expect(BUDGET_METHODS).toHaveLength(6)
    expect(new Set(BUDGET_METHODS.map((m) => m.id)).size).toBe(6)
  })

  for (const m of BUDGET_METHODS) {
    describe(m.id, () => {
      it('có đúng một khoản Để dành: residual, floor, key savings', () => {
        const residuals = m.buckets.filter((b) => b.source.kind === 'residual')
        expect(residuals).toHaveLength(1)
        expect(residuals[0].direction).toBe('floor')
        expect(residuals[0].key).toBe('savings')
      })

      it('khoá khoản không trùng nhau', () => {
        const keys = m.buckets.map((b) => b.key)
        expect(new Set(keys).size).toBe(keys.length)
      })

      // Bất biến quan trọng nhất (spec: "Luật xương sống"): thiếu một nhãn là tiền
      // biến mất lặng lẽ, nhãn ở hai khoản là tiền đếm hai lần.
      it('mỗi nhãn có nhà ở ĐÚNG MỘT khoản', () => {
        const hasAll = m.buckets.some((b) => b.source.kind === 'allExpense')
        for (const level of NEED_LEVELS) {
          const homes = m.buckets.filter(
            (b) => b.source.kind === 'needs' && b.source.levels.includes(level),
          )
          expect(homes.length, `${m.id} / ${level}`).toBe(hasAll ? 0 : 1)
        }
        // allExpense phải là khoản chi DUY NHẤT — đặt một khoản needs cạnh nó là
        // đếm phần tiền đó hai lần.
        if (hasAll) {
          expect(m.buckets.filter((b) => b.source.kind !== 'residual')).toHaveLength(1)
        }
      })

      it('tổng bps mặc định = 100%', () => {
        expect(m.buckets.reduce((s, b) => s + b.bps, 0)).toBe(10_000)
      })

      it('khoản chi là cap, khoản dư là floor', () => {
        for (const b of m.buckets)
          expect(b.direction).toBe(b.source.kind === 'residual' ? 'floor' : 'cap')
      })
    })
  }
})

describe('resolveMethod', () => {
  it('id lạ / null / undefined → 50-30-20 nguyên mặc định', () => {
    for (const p of [profile('phuong-phap-tu-che'), null, undefined]) {
      const m = resolveMethod(p)
      expect(m.id).toBe('50-30-20')
      expect(m.buckets.map((b) => b.bps)).toEqual([5000, 3000, 2000])
    }
  })

  it('chỉ đè khoá có trong budget_targets, khoá còn lại giữ mặc định', () => {
    const m = resolveMethod(profile('jars', { essential: 6000 }))
    expect(m.buckets.find((b) => b.key === 'essential')!.bps).toBe(6000)
    expect(m.buckets.find((b) => b.key === 'flexible')!.bps).toBe(1000)
  })

  it('giá trị ngoài khoảng bị kẹp 0..10000, giá trị không phải số bị bỏ', () => {
    const m = resolveMethod(
      profile('50-30-20', { essential: 99_999, flexible: -5, savings: 'hai mươi' } as never),
    )
    expect(m.buckets.find((b) => b.key === 'essential')!.bps).toBe(10_000)
    expect(m.buckets.find((b) => b.key === 'flexible')!.bps).toBe(0)
    expect(m.buckets.find((b) => b.key === 'savings')!.bps).toBe(2000)
  })

  it('budget_targets không phải object (jsonb hỏng) → mặc định', () => {
    const m = resolveMethod({ budget_method: '80-20', budget_targets: [1, 2] as never })
    expect(m.buckets.find((b) => b.key === 'allSpend')!.bps).toBe(8000)
  })
})

describe('bucketForNeed', () => {
  const by = (id: string) => BUDGET_METHODS.find((m) => m.id === id)!

  it('kakeibo: giving về khoản Hưởng thụ (key flexible)', () => {
    expect(bucketForNeed(by('kakeibo'), 'giving')!.key).toBe('flexible')
  })

  it('80-20: mọi nhãn, kể cả null, đều về allSpend — chi nào cũng đã được đếm', () => {
    expect(bucketForNeed(by('80-20'), 'essential')!.key).toBe('allSpend')
    expect(bucketForNeed(by('80-20'), null)!.key).toBe('allSpend')
  })

  it('nhãn null ở phương pháp needs → null (chưa phân loại)', () => {
    expect(bucketForNeed(by('jars'), null)).toBeNull()
  })
})

describe('clampBps', () => {
  it('null → fallback; ngoài khoảng → kẹp', () => {
    expect(clampBps(null, 5000)).toBe(5000)
    expect(clampBps(20_000, 5000)).toBe(10_000)
    expect(clampBps(-1, 5000)).toBe(0)
  })
})
```

- [ ] **Step 3: Chạy để thấy fail** — `npm test -- budgetMethods` → FAIL (module chưa tồn tại).

- [ ] **Step 4: Viết `src/features/budgets/budgetMethods.ts`:**

```ts
// Sáu phương pháp phân bổ ngân sách — thuần, test được.
//
// Mỗi phương pháp là một danh sách KHOẢN. Khoản chi lấy số từ nhãn `need_level` của
// danh mục (gắn MỘT lần, mọi phương pháp gom theo bảng riêng của nó) hoặc từ tổng chi;
// khoản Để dành là phần dư thu − chi. Luật xương sống (test chặn): mỗi nhãn phải thuộc
// về ĐÚNG MỘT khoản trong MỌI phương pháp — thiếu là tiền biến mất lặng lẽ, thừa là
// đếm hai lần. Chi tiết và mockup bằng số thật:
// docs/superpowers/specs/2026-09-03-phuong-phap-phan-bo-design.md

import type { NeedLevel, ProfileRow } from '../../types/database.types'

export type BudgetMethodId = '50-30-20' | '80-20' | '70-20-10' | 'jars' | 'kakeibo' | 'custom'

/**
 * Khoá khoản — nằm trong URL (`?axis=`) nên phải ổn định qua các phương pháp.
 * Nhãn hiển thị thuộc về PHƯƠNG PHÁP: cùng `essential` đọc là "Thiết yếu" ở JARS
 * và "Sinh tồn" ở Kakeibo.
 */
export type AxisKey =
  | 'essential' | 'flexible' | 'education' | 'giving' | 'buffer'
  | 'living' | 'allSpend'
  | 'savings'

export type BucketSource =
  | { kind: 'needs'; levels: readonly NeedLevel[] }
  | { kind: 'allExpense' }
  | { kind: 'residual' }

export interface MethodBucket {
  key: AxisKey
  label: string
  /** chữ CHỈ ĐỂ DẠY — ẩn ở chế độ Gọn, render qua <Guide> */
  hint: string
  /** mốc mặc định của phương pháp; người dùng đè qua budget_targets */
  bps: number
  /** 'cap' = trần, càng thấp càng tốt · 'floor' = sàn, cần vượt */
  direction: 'cap' | 'floor'
  source: BucketSource
}

export interface BudgetMethod {
  id: BudgetMethodId
  name: string
  /** một câu trong Cài đặt, dưới ô chọn phương pháp */
  blurb: string
  buckets: readonly MethodBucket[]
}

const savings = (hint = 'phần còn lại sau khi tiêu'): MethodBucket => ({
  key: 'savings',
  label: 'Để dành',
  hint,
  bps: 2000,
  direction: 'floor',
  source: { kind: 'residual' },
})

const needs = (
  key: AxisKey,
  label: string,
  hint: string,
  bps: number,
  levels: readonly NeedLevel[],
): MethodBucket => ({ key, label, hint, bps, direction: 'cap', source: { kind: 'needs', levels } })

export const BUDGET_METHODS: readonly BudgetMethod[] = [
  {
    id: '50-30-20',
    name: '50/30/20',
    blurb: 'Nửa thu nhập cho thứ bắt buộc, 30% cho sở thích, giữ lại 20%. Điểm khởi đầu quen thuộc nhất.',
    buckets: [
      needs('essential', 'Thiết yếu', 'tiền nhà, điện nước, đi lại — cắt là ảnh hưởng cuộc sống', 5000, ['essential', 'buffer']),
      needs('flexible', 'Linh hoạt', 'ăn ngoài, mua sắm, giải trí — cắt được khi cần', 3000, ['flexible', 'education', 'giving']),
      savings(),
    ],
  },
  {
    id: '80-20',
    name: '80/20 — Trả cho mình trước',
    blurb: 'Giữ 20% trước, 80% còn lại tiêu sao cũng được — không phải phân loại gì thêm.',
    buckets: [
      {
        key: 'allSpend',
        label: 'Chi tiêu',
        hint: 'mọi khoản chi — miễn là giữ được phần để dành',
        bps: 8000,
        direction: 'cap',
        source: { kind: 'allExpense' },
      },
      savings('trả cho mình trước: mốc phải giữ mỗi tháng'),
    ],
  },
  {
    id: '70-20-10',
    name: '70/20/10',
    blurb: 'Sinh hoạt 70%, để dành 20%, cho đi 10% — dành cho người muốn tách riêng phần biếu tặng.',
    buckets: [
      needs('living', 'Sinh hoạt', 'toàn bộ chi tiêu cho mình — nhà cửa, ăn uống, sở thích', 7000, ['essential', 'flexible', 'education', 'buffer']),
      needs('giving', 'Cho đi', 'quà, biếu tặng, hỗ trợ gia đình', 1000, ['giving']),
      savings(),
    ],
  },
  {
    id: 'jars',
    name: '6 cái lọ (JARS)',
    blurb: 'Chia thu nhập vào 6 hũ; hũ Giáo dục và Cho đi ép tiêu có chủ đích thay vì gộp hết vào "linh hoạt".',
    buckets: [
      needs('essential', 'Thiết yếu', 'hũ nhu cầu thiết yếu — nhà, ăn ở, đi lại', 5500, ['essential', 'buffer']),
      needs('flexible', 'Hưởng thụ', 'hũ chơi — tiêu cho vui, không áy náy', 1000, ['flexible']),
      needs('education', 'Giáo dục', 'hũ học — sách, khóa học, phát triển bản thân', 1000, ['education']),
      needs('giving', 'Cho đi', 'hũ cho đi — quà, từ thiện, hỗ trợ gia đình', 500, ['giving']),
      savings('gồm hai hũ Đầu tư và Tiết kiệm dài hạn — app tính chung vì để dành = thu − chi'),
    ],
  },
  {
    id: 'kakeibo',
    name: 'Kakeibo',
    blurb: 'Sổ chi tiêu kiểu Nhật: đặt mục tiêu để dành trước, rồi soi bốn nhóm chi — sinh tồn, hưởng thụ, văn hóa, dự phòng.',
    buckets: [
      needs('essential', 'Sinh tồn', '生存費 — thứ không tiêu không sống được', 5000, ['essential']),
      needs('flexible', 'Hưởng thụ', '浪費 — muốn chứ không cần, gồm cả quà cáp', 2000, ['flexible', 'giving']),
      needs('education', 'Văn hóa', '文化費 — sách, học, bảo tàng, nuôi cái đầu', 500, ['education']),
      needs('buffer', 'Dự phòng', '予備費 — bất ngờ: ốm đau, hỏng hóc, hiếu hỉ', 500, ['buffer']),
      savings(),
    ],
  },
  {
    id: 'custom',
    name: 'Tự đặt',
    blurb: 'Hiện đủ 6 khoản, tự gõ phần trăm theo ý mình.',
    buckets: [
      needs('essential', 'Thiết yếu', 'tiền nhà, điện nước, đi lại — cắt là ảnh hưởng cuộc sống', 5000, ['essential']),
      needs('flexible', 'Hưởng thụ', 'ăn ngoài, mua sắm, giải trí', 1500, ['flexible']),
      needs('education', 'Giáo dục', 'sách, khóa học, phát triển bản thân', 500, ['education']),
      needs('giving', 'Cho đi', 'quà, từ thiện, hỗ trợ gia đình', 500, ['giving']),
      needs('buffer', 'Dự phòng', 'bất ngờ: ốm đau, hỏng hóc, hiếu hỉ', 500, ['buffer']),
      savings(),
    ],
  },
]

const DEFAULT_METHOD = BUDGET_METHODS[0]

/** bps trong khoảng 0–10000; null hoặc NaN → fallback. (Chuyển từ ProfileEditSheet lên đây — Task 6 dùng lại.) */
export function clampBps(bps: number | null, fallback: number): number {
  if (bps === null || !Number.isFinite(bps)) return fallback
  return Math.min(10_000, Math.max(0, Math.round(bps)))
}

/**
 * profile → phương pháp đã áp mốc người dùng chỉnh.
 *
 * Chịu được dữ liệu lạ mà không làm trắng màn, giống `parseDensity()`: `budget_method`
 * là cột text (id lạ → 50/30/20), `budget_targets` là jsonb (không phải object, hoặc
 * giá trị không phải số → bỏ qua khoá đó). Khoá THIẾU nghĩa là "theo mặc định của
 * phương pháp" — nên đổi mặc định trong code thì người chưa chỉnh đi theo luôn.
 */
export function resolveMethod(
  profile: Pick<ProfileRow, 'budget_method' | 'budget_targets'> | null | undefined,
): BudgetMethod {
  const method = BUDGET_METHODS.find((m) => m.id === profile?.budget_method) ?? DEFAULT_METHOD
  const raw = profile?.budget_targets
  const overrides: Record<string, unknown> =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    ...method,
    buckets: method.buckets.map((b) => {
      const v = overrides[b.key]
      return typeof v === 'number' ? { ...b, bps: clampBps(v, b.bps) } : b
    }),
  }
}

/**
 * Khoản chứa một nhãn — nguồn DUY NHẤT của phép "danh mục này thuộc khoản nào",
 * dùng chung cho `axisSlices` và `planGroups` để hai bên khớp nhau từng đồng.
 *
 * Nhãn null ở phương pháp `allExpense` vẫn có nhà (mọi khoản chi đều được đếm);
 * ở phương pháp `needs` thì null = chưa phân loại → trả null.
 */
export function bucketForNeed(method: BudgetMethod, level: NeedLevel | null): MethodBucket | null {
  if (level !== null) {
    const owner = method.buckets.find(
      (b) => b.source.kind === 'needs' && b.source.levels.includes(level),
    )
    if (owner) return owner
  }
  return method.buckets.find((b) => b.source.kind === 'allExpense') ?? null
}
```

- [ ] **Step 5: Chạy test** — `npm test -- budgetMethods` → PASS. Chạy `npx tsc -b` → sạch (NeedLevel mở rộng chưa phá gì: mọi chỗ so sánh đều là so bằng).

- [ ] **Step 6: Commit**

```bash
git add src/types/database.types.ts src/features/budgets/budgetMethods.ts src/features/budgets/budgetMethods.test.ts
git commit -m "feat(ngan-sach): dinh nghia 6 phuong phap phan bo + resolveMethod"
```

---

### Task 2: `aggregate.ts` — đếm chi theo TỪNG nhãn

**Files:**
- Modify: `src/features/reports/aggregate.ts:506-546` (`ClassificationBreakdown`, `classificationBreakdown`)
- Modify (cơ học, giữ nguyên hành vi): `src/features/budgets/axisTargets.ts:239-240`, `src/features/reports/SpendClassificationCard.tsx:49-50,93,100`
- Test: `src/features/reports/aggregate.test.ts` (sửa ~677-760), `src/features/budgets/axisTargets.test.ts` (chỉ helper `cls()`)

**Interfaces:**
- Produces: `ClassificationBreakdown.needByLevel: Record<NeedLevel, number>` (thay `needEssential`/`needFlexible`); `emptyNeedByLevel(): Record<NeedLevel, number>`. Các trường khác (`needUnclassified`, `costFixed`, `costVariable`, `costUnclassified`, `emergencyCut`, `totalExpense`) giữ nguyên.

- [ ] **Step 1: Sửa test trước** — trong `aggregate.test.ts`: `r.needEssential` → `r.needByLevel.essential`, `r.needFlexible` → `r.needByLevel.flexible`, dòng 760 → `r.needByLevel.essential + r.needByLevel.flexible + r.needUnclassified`. Thêm test mới:

```ts
it('nhãn mới (education/giving/buffer) vào đúng ô riêng, không rơi vào chưa-phân-loại', () => {
  const r = classificationBreakdown(
    [
      { categoryId: 'c1', amount: 100 },
      { categoryId: 'c2', amount: 50 },
    ],
    [
      cat('c1', { need_level: 'education' }),
      cat('c2', { need_level: 'giving' }),
    ],
  )
  expect(r.needByLevel.education).toBe(100)
  expect(r.needByLevel.giving).toBe(50)
  expect(r.needUnclassified).toBe(0)
})
```

(`cat()` là helper dựng CategoryRow sẵn có trong file test đó — đọc chữ ký thật rồi khớp tham số.)

- [ ] **Step 2: Chạy để thấy fail** — `npm test -- aggregate` → FAIL.

- [ ] **Step 3: Sửa `aggregate.ts`:**

```ts
export interface ClassificationBreakdown {
  /** chi theo TỪNG nhãn nhu cầu — đủ 5 khoá, nhãn chưa gắn nằm ở needUnclassified */
  needByLevel: Record<NeedLevel, number>
  needUnclassified: number
  costFixed: number
  costVariable: number
  costUnclassified: number
  /** chi vừa flexible vừa variable — "van xả khẩn cấp" */
  emergencyCut: number
  totalExpense: number
}

/** Đủ 5 khoá từ đầu — chỗ đọc không phải `?? 0`, và thiếu nhãn là lỗi biên dịch. */
export const emptyNeedByLevel = (): Record<NeedLevel, number> => ({
  essential: 0, flexible: 0, education: 0, giving: 0, buffer: 0,
})
```

Trong `classificationBreakdown`: khởi tạo `needByLevel: emptyNeedByLevel()`, vòng lặp thành:

```ts
    if (need !== null) r.needByLevel[need] += s.amount
    else r.needUnclassified += s.amount
```

(cần import `NeedLevel` type; `emergencyCut` giữ nguyên điều kiện `need === 'flexible' && cost === 'variable'`). `foldUncategorized` không đổi — spread giữ `needByLevel` nguyên vẹn.

- [ ] **Step 4: Sửa cơ học 2 nơi đọc** (giữ nguyên hành vi, Task 4/8 sẽ viết lại):
  - `axisTargets.ts:239-240`: `data.needEssential` → `data.needByLevel.essential`, `data.needFlexible` → `data.needByLevel.flexible`.
  - `SpendClassificationCard.tsx`: `folded.needEssential` → `folded.needByLevel.essential` (2 chỗ), `folded.needFlexible` → `folded.needByLevel.flexible` (2 chỗ).
  - `axisTargets.test.ts`: helper `cls()` dựng ClassificationBreakdown — đổi sang `needByLevel` (dùng `emptyNeedByLevel()` rồi đè).

- [ ] **Step 5: Kiểm** — `npx tsc -b` sạch; `npm test` PASS toàn bộ.

- [ ] **Step 6: Commit**

```bash
git add src/features/reports/aggregate.ts src/features/reports/aggregate.test.ts src/features/budgets/axisTargets.ts src/features/budgets/axisTargets.test.ts src/features/reports/SpendClassificationCard.tsx
git commit -m "feat(ngan-sach): ClassificationBreakdown dem theo tung nhan need_level"
```

---

### Task 3: Migration 0057 + tầng dữ liệu (cầu tạm giữ hành vi cũ)

**Files:**
- Create: `supabase/migrations/0057_budget_method.sql`
- Modify: `src/types/database.types.ts` (ProfileRow + 2 danh sách khoá ~839/861), `src/data/repo.ts:297`, `src/data/supabaseRepo.ts:~2683`, `src/data/demoRepo.ts:~988`, `src/features/budgets/useAxisProgress.ts:104`, `src/features/budgets/usePlanning.ts:134`, `src/features/settings/ProfileEditSheet.tsx`

**Interfaces:**
- Consumes: `resolveMethod`, `clampBps` (Task 1).
- Produces: `ProfileRow.budget_method: string`, `ProfileRow.budget_targets: Record<string, number>`; ba trường `target_*_bps` biến mất khỏi mọi type. `ProfilePatch` nhận `budget_method`/`budget_targets`.

- [ ] **Step 1: Viết migration** `supabase/migrations/0057_budget_method.sql`:

```sql
-- Phương pháp phân bổ ngân sách (spec docs/superpowers/specs/2026-09-03-phuong-phap-phan-bo-design.md).
-- budget_targets chỉ chứa mốc NGƯỜI DÙNG đã chỉnh (bps theo khoá khoản);
-- khoá thiếu = dùng mặc định của phương pháp trong code (resolveMethod).

alter table public.profiles
  add column budget_method text not null default '50-30-20',
  add column budget_targets jsonb not null default '{}'::jsonb;

-- Giữ mốc đã chỉnh của 50/30/20 cũ; ai để nguyên mặc định thì '{}'.
update public.profiles set budget_targets = jsonb_strip_nulls(jsonb_build_object(
  'essential', case when target_essential_bps <> 5000 then target_essential_bps end,
  'flexible',  case when target_flexible_bps  <> 3000 then target_flexible_bps  end,
  'savings',   case when target_savings_bps   <> 2000 then target_savings_bps   end
));

-- Bỏ hẳn ba cột cũ: hai nơi lưu cùng một thứ thì sớm muộn lệch nhau.
alter table public.profiles
  drop column target_essential_bps,
  drop column target_flexible_bps,
  drop column target_savings_bps;

-- need_level: 2 nhãn -> 5. Ràng buộc sinh từ 0025 (check inline không tên -> Postgres
-- tự đặt categories_need_level_check). Nếu drop báo không tồn tại:
--   select conname from pg_constraint where conrelid = 'public.categories'::regclass;
alter table public.categories drop constraint categories_need_level_check;
alter table public.categories add constraint categories_need_level_check
  check (need_level in ('essential','flexible','education','giving','buffer'));
```

- [ ] **Step 2: `database.types.ts`** — trong `ProfileRow` thay ba trường `target_*_bps` bằng:

```ts
  /**
   * Phương pháp phân bổ (migration 0057): '50-30-20' | '80-20' | '70-20-10' | 'jars'
   * | 'kakeibo' | 'custom'. Cột là text nên bản lưu có thể mang id lạ — app luôn đi
   * qua resolveMethod() (features/budgets/budgetMethods.ts) để về một phương pháp thật.
   */
  budget_method: string
  /**
   * Mốc đã chỉnh, bps theo khoá khoản ({"essential": 5500}); khoá thiếu = dùng mặc
   * định của phương pháp. jsonb nên giá trị lạ có thể lọt vào — resolveMethod kẹp/bỏ.
   */
  budget_targets: Record<string, number>
```

Và trong hai danh sách khoá cột (Insert ~dòng 839, Update ~dòng 861): xoá 3 tên `target_*_bps`, thêm `'budget_method' | 'budget_targets'`.

- [ ] **Step 3: `repo.ts` ProfilePatch** — xoá 3 dòng `target_*_bps`, thêm:

```ts
    | 'budget_method'
    | 'budget_targets'
```

- [ ] **Step 4: `supabaseRepo.ts` (khối restore ~2683)** — thay ba dòng `target_*_bps` bằng:

```ts
            budget_method: data.profile.budget_method ?? '50-30-20', // 0057
            // Bản sao lưu TRƯỚC 0057 mang ba cột bps rời — dịch sang budget_targets,
            // chỉ giữ mốc lệch mặc định, đúng như migration đã làm với dữ liệu sống.
            budget_targets: data.profile.budget_targets ?? legacyBudgetTargets(data.profile),
```

và thêm helper gần đó (cùng file):

```ts
/** Sao lưu trước migration 0057: ba cột mốc rời → budget_targets (chỉ giữ mốc đã chỉnh). */
function legacyBudgetTargets(profile: ProfileRow): Record<string, number> {
  const p = profile as ProfileRow & {
    target_essential_bps?: number
    target_flexible_bps?: number
    target_savings_bps?: number
  }
  const out: Record<string, number> = {}
  if (p.target_essential_bps != null && p.target_essential_bps !== 5000) out.essential = p.target_essential_bps
  if (p.target_flexible_bps != null && p.target_flexible_bps !== 3000) out.flexible = p.target_flexible_bps
  if (p.target_savings_bps != null && p.target_savings_bps !== 2000) out.savings = p.target_savings_bps
  return out
}
```

- [ ] **Step 5: `demoRepo.ts` (~988)** — thay ba dòng bằng `budget_method: '50-30-20',` và `budget_targets: {},`.

- [ ] **Step 6: Cầu tạm ở hai hook** (Task 4/5 gỡ) — `useAxisProgress.ts:104` và `usePlanning.ts:134`, thay object targets bằng:

```ts
      // CẦU TẠM tới khi axisProgress nhận thẳng method (task 4/5 của plan này):
      // dựng lại AxisTargets cũ từ phương pháp đã giải, hành vi không đổi.
      legacyTargets(resolveMethod(profile)),
```

với helper dùng chung đặt TẠM trong `axisTargets.ts` (Task 4 xoá):

```ts
import { type BudgetMethod } from './budgetMethods'
/** CẦU TẠM cho task 3 của plan 2026-09-03: method → AxisTargets 3 số cũ. */
export function legacyTargets(m: BudgetMethod): AxisTargets {
  const bps = (key: string, fb: number) => m.buckets.find((b) => b.key === key)?.bps ?? fb
  return {
    essentialBps: bps('essential', 5000),
    flexibleBps: bps('flexible', 3000),
    savingsBps: bps('savings', 2000),
  }
}
```

- [ ] **Step 7: Cầu tạm ở `ProfileEditSheet.tsx`** — ba ô % giữ nguyên UI, chỉ đổi nguồn đọc/ghi (Task 6 thay cả khối):
  - Khởi tạo state: `const m0 = resolveMethod(profile)` rồi `const bps0 = (k: string, fb: number) => m0.buckets.find((b) => b.key === k)?.bps ?? fb`; `essential` từ `(bps0('essential', 5000) / 100).toString()` (tương tự flexible/savings).
  - Xoá hàm `clampBps` cục bộ, import `clampBps` từ `../budgets/budgetMethods`.
  - Trong `handleSave`, thay ba dòng `target_*_bps` bằng:

```ts
        budget_method: profile.budget_method,
        budget_targets: {
          essential: clampBps(toBps(essential), 5000),
          flexible: clampBps(toBps(flexible), 3000),
          savings: clampBps(toBps(savings), 2000),
        },
```

- [ ] **Step 8: Kiểm** — `npx tsc -b`: sửa nốt mọi fixture ProfileRow trong test mà compiler chỉ ra (thêm `budget_method: '50-30-20', budget_targets: {}`, xoá 3 trường cũ). `npm test` PASS.

- [ ] **Step 9: Áp migration vào DB thật** — chạy nội dung `0057_budget_method.sql` qua Supabase (dashboard SQL editor hoặc `supabase db push` — theo cách các migration trước của repo vẫn được áp; hỏi chủ sổ nếu không chắc). KHÔNG commit code trước khi migration đã áp: code mới đọc cột mới.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0057_budget_method.sql src/types/database.types.ts src/data/repo.ts src/data/supabaseRepo.ts src/data/demoRepo.ts src/features/budgets/useAxisProgress.ts src/features/budgets/usePlanning.ts src/features/budgets/axisTargets.ts src/features/settings/ProfileEditSheet.tsx
git commit -m "feat(ngan-sach): profiles.budget_method + budget_targets, bo 3 cot bps roi (0057)"
```

---

### Task 4: `axisProgress` chạy theo phương pháp + mặt theo dõi

**Files:**
- Modify: `src/features/budgets/axisTargets.ts` (lõi), `src/features/budgets/useAxisProgress.ts`, `src/features/budgets/AxisTargetsCard.tsx`, `src/features/budgets/AxisStrip.tsx`
- Test: `src/features/budgets/axisTargets.test.ts`

**Interfaces:**
- Consumes: `BudgetMethod`, `BUDGET_METHODS`, `bucketForNeed`, `AxisKey` (Task 1); `needByLevel` (Task 2).
- Produces:
  - `axisProgress(income: number, data: ClassificationBreakdown, method: BudgetMethod, baseline?: number | null, parts?: AxisSliceMap | null): AxisProgress | null`
  - `AxisLine` thêm `label: string; hint: string` (key giờ là `AxisKey` 8 giá trị)
  - `AxisProgress` thêm `method: BudgetMethod`
  - `type AxisSliceMap = Partial<Record<AxisKey, CategorySlice[]>>`
  - `axisSlices(slices: CategorySlice[], categories: CategoryRow[], method: BudgetMethod): AxisSliceMap`
  - `export type { AxisKey } from './budgetMethods'` (giữ đường import cũ của planGroups/PlanningView)
  - TẠM giữ `AXIS_LABEL: Record<AxisKey, string>` đủ 8 khoá (Task 5 xoá): essential 'Thiết yếu', flexible 'Linh hoạt', education 'Giáo dục', giving 'Cho đi', buffer 'Dự phòng', living 'Sinh hoạt', allSpend 'Chi tiêu', savings 'Để dành'.
  - XOÁ: `AxisTargets`, `DEFAULT_AXIS_TARGETS`, `legacyTargets` (cầu Task 3), tham số targets kiểu cũ.

- [ ] **Step 1: Sửa/thêm test** trong `axisTargets.test.ts` — mọi lời gọi `axisProgress(..., DEFAULT_AXIS_TARGETS)` thành `axisProgress(..., M503020)` với `const M503020 = BUDGET_METHODS.find((m) => m.id === '50-30-20')!`. Thêm hai test mới:

```ts
import { BUDGET_METHODS } from './budgetMethods'

it('tổng các khoản chi + chưa phân loại = tổng chi, với MỌI phương pháp', () => {
  const data = cls({
    needByLevel: { essential: 200, flexible: 150, education: 50, giving: 30, buffer: 20 },
    needUnclassified: 40,
    totalExpense: 490,
  })
  for (const m of BUDGET_METHODS) {
    const r = axisProgress(1_000, data, m)!
    const spend = r.lines.filter((l) => l.key !== 'savings').reduce((s, l) => s + l.actual, 0)
    expect(spend + r.unclassified, m.id).toBe(490)
    expect(r.lines.find((l) => l.key === 'savings')!.actual).toBe(510)
    expect(r.method.id).toBe(m.id)
  }
})

it('phương pháp allExpense không báo "chưa phân loại" — mọi đồng chi đã được đếm', () => {
  const m8020 = BUDGET_METHODS.find((m) => m.id === '80-20')!
  const r = axisProgress(1_000, cls({ needUnclassified: 40, totalExpense: 40 }), m8020)!
  expect(r.unclassified).toBe(0)
  expect(r.lines.find((l) => l.key === 'allSpend')!.actual).toBe(40)
})
```

và test cho `axisSlices` mới:

```ts
it('axisSlices chia lát theo bảng gom nhãn của phương pháp', () => {
  const jars = BUDGET_METHODS.find((m) => m.id === 'jars')!
  const r = axisSlices(
    [
      { categoryId: 'qua', amount: 100 },
      { categoryId: 'com', amount: 200 },
    ],
    [cat('qua', { need_level: 'giving' }), cat('com', { need_level: 'essential' })],
    jars,
  )
  expect(r.giving?.map((s) => s.categoryId)).toEqual(['qua'])
  expect(r.essential?.map((s) => s.categoryId)).toEqual(['com'])
  expect(r.savings).toBeUndefined()
})
```

- [ ] **Step 2: Chạy để thấy fail** — `npm test -- axisTargets` → FAIL.

- [ ] **Step 3: Viết lại lõi `axisTargets.ts`:**
  - Xoá `AxisTargets`, `DEFAULT_AXIS_TARGETS`, `legacyTargets`; thêm `export type { AxisKey } from './budgetMethods'` và import `type BudgetMethod, type MethodBucket, bucketForNeed`.
  - `AxisLine`: thêm `label: string` và `hint: string` ngay dưới `key`.
  - `axisMissSummary`: `chưa đạt mốc ${missed[0].label}` (bỏ tra `AXIS_LABEL`).
  - `AxisSliceMap = Partial<Record<AxisKey, CategorySlice[]>>`; `axisSlices`:

```ts
export function axisSlices(
  slices: CategorySlice[],
  categories: CategoryRow[],
  method: BudgetMethod,
): AxisSliceMap {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const r: AxisSliceMap = {}
  for (const s of slices) {
    // MỘT phép tra dùng chung với planGroups — hai bên phải khớp nhau từng đồng.
    const bucket = bucketForNeed(method, byId.get(s.categoryId)?.need_level ?? null)
    if (!bucket || bucket.source.kind === 'residual') continue
    ;(r[bucket.key] ??= []).push(s)
  }
  for (const list of Object.values(r)) list.sort((a, b) => b.amount - a.amount)
  return r
}
```

  - `AxisProgress`: thêm `method: BudgetMethod`.
  - `axisProgress`:

```ts
export function axisProgress(
  income: number,
  data: ClassificationBreakdown,
  method: BudgetMethod,
  baseline: number | null = null,
  parts: AxisSliceMap | null = null,
): AxisProgress | null {
  const basis = baseline !== null && baseline > income ? baseline : income
  if (basis <= 0) return null

  const hasAll = method.buckets.some((b) => b.source.kind === 'allExpense')
  const actualOf = (b: MethodBucket): number => {
    switch (b.source.kind) {
      case 'needs':
        return b.source.levels.reduce((s, lv) => s + data.needByLevel[lv], 0)
      case 'allExpense':
        return data.totalExpense
      case 'residual':
        return basis - data.totalExpense
    }
  }

  return {
    income: basis,
    actualIncome: income,
    estimated: basis !== income,
    // Phương pháp gộp CẢ tổng chi (80/20) thì không đồng nào rơi ra ngoài —
    // đừng bật cảnh báo thiếu cho thứ đã được đếm đủ.
    unclassified: hasAll ? 0 : data.needUnclassified,
    method,
    lines: method.buckets.map((b) => {
      const actual = actualOf(b)
      const targetShare = b.bps / 10_000
      const target = Math.round(basis * targetShare)
      return {
        key: b.key,
        label: b.label,
        hint: b.hint,
        actual,
        target,
        share: actual / basis,
        targetShare,
        direction: b.direction,
        ok: b.direction === 'cap' ? actual <= target : actual >= target,
        slices: parts?.[b.key] ?? [],
      }
    }),
  }
}
```

  - Giữ TẠM `AXIS_LABEL` (đủ 8 khoá, kèm comment `// TẠM — task 5 của plan 2026-09-03 xoá`): planGroups/PlanningView còn import.

- [ ] **Step 4: `useAxisProgress.ts`** — gỡ cầu: `const method = resolveMethod(profile)` (trong useMemo, `profile` đã nằm trong deps), gọi `axisProgress(sums.income, cls, method, baseline, axisSlices(expense.slices, categories, method))`.

- [ ] **Step 5: `AxisTargetsCard.tsx`** — xoá `HINT` và `isAxisKey`; `AXIS_LABEL[l.key]` → `l.label`; `HINT[l.key]` → `l.hint`; validate URL param bằng chính dữ liệu:

```ts
  const openParam = searchParams.get('axis')
  const open = data.lines.some((l) => l.key === openParam) ? (openParam as AxisKey) : null
```

Dòng cảnh báo cuối: `…chi chưa phân loại nên hai dòng đầu đang thiếu` → `…chi chưa phân loại nên các dòng chi đang thiếu`.

- [ ] **Step 6: `AxisStrip.tsx`** — `AXIS_LABEL[l.key]` → `l.label` (2 chỗ, cả aria); lưới theo số dòng:

```ts
// Tailwind quét chuỗi tĩnh — liệt kê tường minh, không grid-cols-${n}.
// 2-3 dòng một hàng; 4 dòng chia 2×2; 5-6 dòng chia 3×2.
const GRID_BY_COUNT: Record<number, string> = {
  2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2', 5: 'grid-cols-3', 6: 'grid-cols-3',
}
```

và `className={`grid gap-2 ${GRID_BY_COUNT[data.lines.length] ?? 'grid-cols-3'}`}`.

- [ ] **Step 7: Kiểm** — `npx tsc -b` sạch (planGroups/PlanningView vẫn dùng AXIS_LABEL tạm — hợp lệ); `npm test` PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/budgets/axisTargets.ts src/features/budgets/axisTargets.test.ts src/features/budgets/useAxisProgress.ts src/features/budgets/AxisTargetsCard.tsx src/features/budgets/AxisStrip.tsx
git commit -m "feat(ngan-sach): axisProgress chay theo phuong phap, mat theo doi doc nhan tu dong truc"
```

---

### Task 5: Mặt lập kế hoạch theo phương pháp

**Files:**
- Modify: `src/features/budgets/planning.ts`, `src/features/budgets/usePlanning.ts`, `src/features/budgets/planGroups.ts`, `src/features/budgets/PlanningView.tsx`, `src/features/budgets/axisTargets.ts` (xoá `AXIS_LABEL`)
- Test: `src/features/budgets/planning.test.ts`, `src/features/budgets/planGroups.test.ts`

**Interfaces:**
- Consumes: `axisProgress`/`axisSlices` chữ ký mới (Task 4), `bucketForNeed`, `resolveMethod`.
- Produces:
  - `planSummary(declaredIncome, baseline, budgets, categories, method: BudgetMethod, parentOf?)` — tham số 5 đổi từ `AxisTargets` sang `BudgetMethod`.
  - `PlanGroupsInput` thêm `method: BudgetMethod`; `PLAN_BLOCK_LABEL` toàn cục bị xoá, `PlanBlock.label` vẫn có.
  - `usePlanning` trả thêm `method: BudgetMethod` trong object kết quả.

- [ ] **Step 1: Sửa test trước.** `planning.test.ts`: mọi chỗ dựng targets 3 số → `BUDGET_METHODS.find((m) => m.id === '50-30-20')!`. `planGroups.test.ts`: thêm `method` vào input; kỳ vọng nhãn giữ nguyên (mặc định 50/30/20 nhãn không đổi). Thêm hai test mới cho planGroups:

```ts
it('jars: danh mục nhãn giving vào khối Cho đi, không vào Linh hoạt', () => {
  const jars = BUDGET_METHODS.find((m) => m.id === 'jars')!
  const g = planGroups({ ...input, method: jars })
  // input dựng một danh mục need_level 'giving' có hạn mức — xem fixture sẵn của file
  expect(g.blocks.map((b) => b.key)).toContain('giving')
})

it('80-20: mọi dòng (kể cả chưa gắn nhãn) vào MỘT khối Chi tiêu, không còn khối chưa-phân-loại', () => {
  const m8020 = BUDGET_METHODS.find((m) => m.id === '80-20')!
  const g = planGroups({ ...input, method: m8020 })
  const keys = g.blocks.map((b) => b.key)
  expect(keys.filter((k) => k !== 'markers')).toEqual(['allSpend'])
})
```

(Khớp fixture thật của file test — nếu fixture chưa có danh mục `giving`, thêm một danh mục + một item vào fixture.)

- [ ] **Step 2: Chạy để thấy fail.**

- [ ] **Step 3: `planning.ts`** — đổi import (`type BudgetMethod` từ `./budgetMethods`, bỏ `AxisTargets`), chữ ký `planSummary(..., method: BudgetMethod, ...)`, thân:

```ts
    axis: axisProgress(
      income,
      classificationBreakdown(slices, categories),
      method,
      null,
      axisSlices(slices, categories, method),
    ),
```

- [ ] **Step 4: `planGroups.ts`:**
  - Import `bucketForNeed, type BudgetMethod` từ `./budgetMethods`; bỏ import `AXIS_LABEL`; xoá `PLAN_BLOCK_LABEL` và hằng `ORDER` toàn cục.
  - `PlanGroupsInput` thêm `method: BudgetMethod`.
  - Trong `planGroups({ ..., method })`:

```ts
  // Khối sinh từ các khoản CHI của phương pháp — khoản Để dành vẫn không có khối
  // (B30.2 giữ nguyên: để dành là hiệu, không phải tổng của danh mục nào).
  const expenseBuckets = method.buckets.filter((b) => b.source.kind !== 'residual')
  const order: PlanBlockKey[] = [...expenseBuckets.map((b) => b.key), 'unclassified', 'markers']
  const labelOf = (key: PlanBlockKey): string =>
    key === 'unclassified'
      ? 'Chưa phân loại'
      : key === 'markers'
        ? 'Mốc con'
        : expenseBuckets.find((b) => b.key === key)!.label
  // MỘT phép tra dùng chung với axisSlices — tiểu tổng khối khớp dòng trục từng đồng.
  const blockKeyOf = (cat: CategoryRow): PlanBlockKey =>
    bucketForNeed(method, cat.need_level)?.key ?? 'unclassified'
```

  - Thay `needKeyOf(r.cat)` → `blockKeyOf(r.cat)`; vòng `for (const key of ORDER)` → `for (const key of order)`; `label: PLAN_BLOCK_LABEL[key]` → `label: labelOf(key)`.
  - `targetOf`:

```ts
  const targetOf = (key: PlanBlockKey): number | null =>
    key === 'unclassified' || key === 'markers'
      ? null
      : (axis?.lines.find((l) => l.key === key)?.target ?? null)
```

- [ ] **Step 5: `usePlanning.ts`** — gỡ cầu `legacyTargets`: `const method = resolveMethod(profile)` trong useMemo, truyền vào `planSummary(...)` và vào lời gọi `planGroups({ ..., method })` (nếu planGroups gọi ở PlanningView thì truyền `method` qua kết quả trả về); thêm `method` vào object usePlanning trả ra.

- [ ] **Step 6: `PlanningView.tsx`** — bỏ import `AXIS_LABEL`; lấy `method` từ kết quả usePlanning:
  - Dòng ~190: `const axisKey = bucketForNeed(method, catOf(row.cat.id)?.need_level ?? null)?.key ?? null`
  - Dòng ~255: `axisLabel: slider?.axisKey ? (method.buckets.find((b) => b.key === slider.axisKey)?.label ?? null) : null`
  - Dòng ~322: `const b = bucketForNeed(method, need); return b ? b.label : 'chưa phân loại'`
  - Dòng ~547: `{AXIS_LABEL[l.key]}` → `{l.label}`
  - Chỗ render dòng trục ~572 (`l.key === 'savings'`) giữ nguyên — mọi phương pháp đều có đúng một dòng `savings`.

- [ ] **Step 7: Xoá `AXIS_LABEL`** khỏi `axisTargets.ts`; `grep -rn "AXIS_LABEL" src` phải ra 0 dòng.

- [ ] **Step 8: Kiểm** — `npx tsc -b`; `npm test` PASS (cả `planVerdict.test`, `axisSuggest.test` — hai file này không đổi vì chỉ ăn `AxisProgress`).

- [ ] **Step 9: Commit**

```bash
git add src/features/budgets/planning.ts src/features/budgets/planning.test.ts src/features/budgets/planGroups.ts src/features/budgets/planGroups.test.ts src/features/budgets/usePlanning.ts src/features/budgets/PlanningView.tsx src/features/budgets/axisTargets.ts
git commit -m "feat(ngan-sach): mat lap ke hoach sinh khoi theo phuong phap, xoa AXIS_LABEL"
```

---

### Task 6: Cài đặt — chọn phương pháp, ô % sinh theo khoản

**Files:**
- Modify: `src/features/settings/ProfileEditSheet.tsx`

**Interfaces:**
- Consumes: `BUDGET_METHODS`, `resolveMethod`, `clampBps` (Task 1); `useUpdateProfile` (giữ nguyên).
- Produces: profile được ghi `budget_method: BudgetMethodId` + `budget_targets` CHỈ chứa mốc lệch mặc định.

- [ ] **Step 1: Thay khối "Mốc cơ cấu chi".** State (thay 3 state `essential/flexible/savings` của cầu Task 3):

```ts
  // Phương pháp + % theo khoá khoản của PHƯƠNG PHÁP ĐANG CHỌN.
  // Đổi phương pháp là nạp lại số chuẩn của nó — mốc đã chỉnh của phương pháp cũ
  // nằm yên trong budget_targets? KHÔNG: lưu là ghi đè toàn bộ, xem handleSave.
  const resolved = resolveMethod(profile)
  const [methodId, setMethodId] = useState(resolved.id)
  const [pct, setPct] = useState<Record<string, string>>(() =>
    Object.fromEntries(resolved.buckets.map((b) => [b.key, (b.bps / 100).toString()])),
  )
  const method = BUDGET_METHODS.find((m) => m.id === methodId) ?? BUDGET_METHODS[0]

  function pickMethod(id: string) {
    const m = BUDGET_METHODS.find((x) => x.id === id) ?? BUDGET_METHODS[0]
    setMethodId(m.id)
    setPct(Object.fromEntries(m.buckets.map((b) => [b.key, (b.bps / 100).toString()])))
  }

  const axisSum = method.buckets.reduce(
    (s, b) => s + (Number((pct[b.key] ?? '').replace(',', '.')) || 0),
    0,
  )
```

Trong `handleSave` thay khối budget bằng:

```ts
        budget_method: method.id,
        // Chỉ lưu mốc LỆCH mặc định — khoá thiếu nghĩa là "theo phương pháp".
        budget_targets: Object.fromEntries(
          method.buckets
            .map((b) => [b.key, clampBps(toBps(pct[b.key] ?? ''), b.bps)] as const)
            .filter(([, v], i) => v !== method.buckets[i].bps),
        ),
```

- [ ] **Step 2: JSX** — thay `<div className="mt-2 grid grid-cols-3 gap-2">` + mảng 3 ô cứng bằng:

```tsx
        <label htmlFor={`${uid}-method`} className="mt-2 block text-sm font-medium text-fg-muted">
          Phương pháp phân bổ
        </label>
        <Select
          id={`${uid}-method`}
          value={methodId}
          onChange={(e) => pickMethod(e.target.value)}
          wrapClassName="mt-1 w-full"
        >
          {BUDGET_METHODS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Guide className="mt-1 text-sm text-fg-muted">{method.blurb}</Guide>

        {/* Ô % sinh theo khoản của phương pháp: 2 ô (80/20) tới 6 ô (Tự đặt).
            grid-cols-3 tĩnh, thừa thì tự xuống hàng — không grid-cols-${n} động. */}
        <div className="mt-2 grid grid-cols-3 gap-2">
          {method.buckets.map((b) => (
            <div key={b.key}>
              <label htmlFor={`${uid}-${b.key}`} className="block text-sm font-medium text-fg-muted">
                {b.label}
              </label>
              <input
                id={`${uid}-${b.key}`}
                inputMode="decimal"
                value={pct[b.key] ?? ''}
                onChange={(e) => setPct((p) => ({ ...p, [b.key]: e.target.value }))}
                placeholder={(b.bps / 100).toString()}
                className="mt-1 w-full rounded-md border border-border-strong bg-surface p-3 text-right text-fg-primary"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => pickMethod(method.id)}
          className="mt-1 text-sm font-medium text-fg-accent"
        >
          ↺ Về mặc định của phương pháp
        </button>
```

Câu chiều mốc (giữ NGOÀI `<Guide>` — lý do cũ trong comment tại chỗ, giữ nguyên comment):

```tsx
        <p className="mt-1 text-sm text-fg-muted">
          Các khoản chi là <b>trần</b>, {method.buckets.find((b) => b.direction === 'floor')!.label} là{' '}
          <b>sàn</b>.
          <Guide as="span"> Chi dưới trần là tốt, vượt sàn là tốt. Đổi phương pháp là các ô nạp lại số chuẩn của nó.</Guide>
        </p>
```

Cảnh báo tổng ≠ 100% giữ nguyên (đã tính từ `axisSum` mới).

- [ ] **Step 3: Kiểm** — `npx tsc -b`; `npm test` (designSystem phải xanh — dùng `<Select>`, không select trần).

- [ ] **Step 4: Commit**

```bash
git add src/features/settings/ProfileEditSheet.tsx
git commit -m "feat(cai-dat): chon phuong phap phan bo, o phan tram sinh theo khoan"
```

---

### Task 7: Gắn nhãn danh mục — 5 nhãn

**Files:**
- Modify: `src/features/categories/ClassificationToggle.tsx` (chỉ `NEED_OPTIONS`), `src/features/categories/ClassifyCategoriesPage.tsx` (bảng "Áp cho cả nhóm")

**Interfaces:**
- Produces: `NEED_OPTIONS` 6 mục (5 nhãn + Chưa). Component `ClassificationToggle` không đổi chữ ký.

- [ ] **Step 1: `NEED_OPTIONS`:**

```ts
export const NEED_OPTIONS = [
  ['essential', 'Thiết yếu'],
  ['flexible', 'Linh hoạt'],
  ['education', 'Giáo dục'],
  ['giving', 'Cho đi'],
  ['buffer', 'Dự phòng'],
  [null, 'Chưa'],
] as const satisfies readonly (readonly [NeedLevel | null, string])[]
```

Đọc phần render lưới của `ClassificationToggle`: nó chia cột theo số lựa chọn. Với 6 mục, dùng `grid-cols-3` (tự xuống 2 hàng). Nếu code hiện tại chỉ khai tường minh cho 2 và 3 mục, thêm nhánh: `options.length === 2 ? 'grid-cols-2' : 'grid-cols-3'` — 6 chia hết cho 3 nên lưới đều.

- [ ] **Step 2: `ClassifyCategoriesPage.tsx` — bảng gán nhanh hai bước.** Xoá hằng `COMBOS` (4 tổ hợp). Thêm state `const [bulkNeed, setBulkNeed] = useState<NeedLevel | null>(null)` (reset về `null` khi `bulkFor` đổi hoặc đóng). Chỗ đang render danh sách nút từ `COMBOS`, thay bằng hai bước — bước 1 chọn nhãn nhu cầu, bước 2 chọn cố định/biến đổi rồi áp bằng đúng hàm bulk sẵn có (hàm quanh dòng 156 đang nhận `(need, cost)`):

```tsx
{/* 5 nhãn × 2 loại = 10 tổ hợp — liệt kê phẳng không ai đọc. Hai bước, mỗi bước ≤ 5 nút. */}
{bulkNeed === null ? (
  <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
    {NEED_OPTIONS.filter(([v]) => v !== null).map(([v, label]) => (
      <button key={v} type="button" onClick={() => setBulkNeed(v)} className={/* giữ nguyên class của nút COMBOS cũ */}>
        {label}…
      </button>
    ))}
  </div>
) : (
  <div className="grid grid-cols-2 gap-2">
    {COST_OPTIONS.filter(([v]) => v !== null).map(([v, label]) => (
      <button key={v} type="button" onClick={() => { void applyBulk(bulkNeed, v); setBulkNeed(null) }} className={/* giữ nguyên class */}>
        {NEED_OPTIONS.find(([n]) => n === bulkNeed)![1]} · {label}
      </button>
    ))}
  </div>
)}
```

(`applyBulk` = tên thật của hàm bulk trong file — đọc quanh dòng 150–165 rồi khớp; giữ nguyên className của nút cũ để không đụng design system.)

- [ ] **Step 3: Kiểm** — `npx tsc -b`; `npm test`. Mở app (Task 10 sẽ soi kỹ, ở đây chỉ cần trang Phân loại không vỡ).

- [ ] **Step 4: Commit**

```bash
git add src/features/categories/ClassificationToggle.tsx src/features/categories/ClassifyCategoriesPage.tsx
git commit -m "feat(danh-muc): 5 nhan nhu cau, bang ap cho ca nhom thanh hai buoc"
```

---

### Task 8: Báo cáo + Bảng tin bỏ hằng số 50/30/20

**Files:**
- Modify: `src/features/reports/SpendClassificationCard.tsx`, `src/features/reports/verdicts.ts`, `src/features/reports/MonthlyBarsCard.tsx`, `src/features/bulletin/KpiRow.tsx`
- Test: `src/features/reports/verdicts.test.ts` (nếu có — grep; không có thì thêm case vào file test đang cover verdicts)

**Interfaces:**
- Consumes: `axisProgress`, `axisMissSummary`, `resolveMethod`, `useProfile`.
- Produces: `savingsRateTone(rate: number, targetShare?: number)` và `savingsRateVerdict(points, currentKey, targetShare?: number)` — tham số mới mặc định `0.2` để chữ ký cũ vẫn chạy.

- [ ] **Step 1: `verdicts.ts`** — thêm tham số:

```ts
export function savingsRateTone(rate: number, targetShare = 0.2): NoteTone {
  if (rate >= targetShare) return 'good'
  if (rate > 0) return 'warn'
  return 'bad'
}
```

`savingsRateVerdict(points, currentKey, targetShare = 0.2)` — luồn `targetShare` vào chỗ tính `tone` bên trong (grep `0.2`/`20` trong hàm). Cập nhật doc comment: mốc lấy từ khoản Để dành của phương pháp trong hồ sơ, 20% chỉ là mặc định khi không ai truyền.

- [ ] **Step 2: `MonthlyBarsCard.tsx`** —

```ts
import { useProfile } from '../../hooks/queries'
import { resolveMethod } from '../budgets/budgetMethods'
...
  const { data: profile } = useProfile()
  const savingsShare =
    (resolveMethod(profile).buckets.find((b) => b.key === 'savings')?.bps ?? 2000) / 10_000
  const saving = savingsRateVerdict(series.points, currentKey, savingsShare)
```

Grep chuỗi `20%` trong file — chỗ nào in mốc thì in `Math.round(savingsShare * 100)` thay số cứng.

- [ ] **Step 3: `KpiRow.tsx`** — lấy mốc thật:

```ts
  const { data: profile } = useProfile()
  const keptTargetPct = Math.round(
    ((resolveMethod(profile).buckets.find((b) => b.key === 'savings')?.bps ?? 2000) / 10_000) * 100,
  )
```

- `keptPct >= 20` → `keptPct >= keptTargetPct`
- vạch `className="absolute inset-y-0 left-[20%] w-px bg-fg-muted"` → bỏ `left-[20%]`, thêm `style={{ left: `${keptTargetPct}%` }}` (class arbitrary theo biến là không được — style attr thì được).
- comment "mốc của quy tắc 50/30/20" → "mốc Để dành của phương pháp trong hồ sơ".

- [ ] **Step 4: `SpendClassificationCard.tsx` — C1 theo phương pháp.** Card tự lấy method (nó đã dùng hook `useDensity` nên thêm hook không phá gì):

```ts
import { useProfile } from '../../hooks/queries'
import { resolveMethod, type AxisKey } from '../budgets/budgetMethods'
import { axisMissSummary, axisProgress, sharePct } from '../budgets/axisTargets'
```

```ts
  const { data: profile } = useProfile()
  const method = resolveMethod(profile)
  // Dùng LẠI đúng phép tính của tab Ngân sách — hai tab không thể lệch nhau.
  const axis = axisProgress(income, folded, method)
  const miss = axis ? axisMissSummary(axis.lines) : null
```

Màu theo khoá khoản (hex trần là quy ước sẵn của file này cho màu đồ thị):

```ts
const BUCKET_COLOR: Record<AxisKey, string> = {
  essential: C.need, flexible: C.want, education: '#8b5cf6', giving: '#ec4899',
  buffer: '#64748b', living: C.want, allSpend: C.want, savings: C.save,
}
```

Tiêu đề C1: `Thiết yếu vs Linh hoạt <span…>(% thu nhập · quy tắc 50/30/20)</span>` → `Cơ cấu so với mốc <span className="text-fg-muted">(% thu nhập · {method.name})</span>`; câu thiếu thu nhập → `Cần có thu nhập trong {periodNoun} để tính cơ cấu.`. Khối ba `BreakdownRow` cứng + `essentialPct/flexiblePct/savingsPct/essentialOver/flexibleOver/savingsUnder` thay bằng:

```tsx
        <div className="mb-4 space-y-2.5">
          {axis!.lines.map((l) => {
            const over = !l.ok
            const suffix = over ? (l.direction === 'cap' ? ' — vượt mục tiêu' : ' — dưới mục tiêu') : ''
            return (
              <BreakdownRow
                key={l.key}
                icon=""
                name={`${l.label}${suffix}`}
                pct={sharePct(l.share)}
                value={l.actual}
                barPct={Math.max(l.share, 0) * 100}
                color={BUCKET_COLOR[l.key]}
                base={base}
                targetPct={Math.round(l.targetShare * 100)}
                warn={over}
              />
            )
          })}
          {axis!.unclassified > 0 && (
            <BreakdownRow
              icon="" name="Chi chưa phân loại"
              pct={sharePct(axis!.unclassified / axis!.income)} value={axis!.unclassified}
              barPct={(axis!.unclassified / axis!.income) * 100} color={C.unknown} base={base}
            />
          )}
```

Khối VerdictNote: giữ khuôn cũ, chữ theo dòng —

```tsx
          <div className="space-y-1.5 pt-0.5">
            {miss && miss.missed.length === 0 ? (
              <VerdictNote tone="good" short={`Cơ cấu ${method.name} đạt cả ${axis!.lines.length} mốc`}>
                Cả {axis!.lines.length} khoản đều trong mốc {method.name} — cơ cấu {periodNoun} không có gì phải sửa.
              </VerdictNote>
            ) : (
              miss?.missed.map((l) =>
                l.key === 'savings' ? (
                  <VerdictNote
                    key={l.key}
                    tone={l.actual < 0 ? 'bad' : 'warn'}
                    label="Để dành dưới mục tiêu"
                    short={l.actual < 0 ? 'Chi vượt thu' : `Để dành ${sharePct(l.share)}% / mục tiêu ${Math.round(l.targetShare * 100)}%`}
                  >
                    {l.actual < 0
                      ? `chi vượt thu ${periodNoun}, tức là đang rút vào tiền cũ.`
                      : `giữ được ${sharePct(l.share)}% thu nhập, mục tiêu là ${Math.round(l.targetShare * 100)}%.`}
                  </VerdictNote>
                ) : (
                  <VerdictNote
                    key={l.key}
                    tone="warn"
                    label={`${l.label} vượt mục tiêu`}
                    short={`${l.label} ${sharePct(l.share)}% / mục tiêu ${Math.round(l.targetShare * 100)}%`}
                  >
                    {sharePct(l.share)}% thu nhập (mục tiêu ≤ {Math.round(l.targetShare * 100)}%) — {l.hint}.
                  </VerdictNote>
                ),
              )
            )}
          </div>
```

Nhánh `income <= 0`: `axis` là null — giữ nhánh render cũ (đoạn `<p>Cần có thu nhập…`), mọi chỗ dùng `axis!` chỉ nằm trong nhánh `income > 0`. C2 (Cố định/Biến đổi) và "van xả" GIỮ NGUYÊN — trục độc lập, spec ghi rõ không đụng.

- [ ] **Step 5: Kiểm** — `npx tsc -b`; `npm test`; grep xác nhận không còn mốc cứng:

```bash
grep -rn "targetPct={50}\|targetPct={30}\|targetPct={20}\|>= 20\|left-\[20%\]" src/features/reports src/features/bulletin
```

Kỳ vọng: 0 dòng.

- [ ] **Step 6: Commit**

```bash
git add src/features/reports/SpendClassificationCard.tsx src/features/reports/verdicts.ts src/features/reports/MonthlyBarsCard.tsx src/features/bulletin/KpiRow.tsx
git commit -m "feat(bao-cao): the co cau + moc giu lai chay theo phuong phap, bo hang so 50/30/20"
```

---

### Task 9: MCP server — mô tả `need_level` 5 giá trị

**Files:**
- Modify: `api/_handler.ts:91`
- Regenerate: `api/mcp.mjs` (qua `npm run bundle:mcp`)

- [ ] **Step 1:** Sửa describe:

```ts
              .describe(
                "Mức nhu cầu của danh mục: 'essential' (thiết yếu) / 'flexible' (linh hoạt) / 'education' (giáo dục) / 'giving' (cho đi) / 'buffer' (dự phòng)",
              ),
```

- [ ] **Step 2:** `npm run bundle:mcp` rồi `npm test -- mcpBundle` → PASS.

- [ ] **Step 3: Commit**

```bash
git add api/_handler.ts api/mcp.mjs
git commit -m "feat(mcp): mo ta need_level du 5 nhan"
```

---

### Task 10: Tổng kiểm — máy và mắt

**Files:** không sửa code trừ khi soát ra lỗi; Modify: `docs/backlog-tinh-nang.md` (ghi nhận đã ship, theo format sẵn của file).

- [ ] **Step 1: Toàn bộ máy kiểm:**

```bash
npx tsc -b
```

```bash
npm test
```

Cả hai phải sạch — không xanh giả (`tsc --noEmit` bị cấm trong repo này).

- [ ] **Step 2: `detect_changes()`** (gitnexus MCP) `{scope: "compare", base_ref: "master"}` — xác nhận vùng ảnh hưởng chỉ nằm trong: budgets, reports, bulletin, categories, settings, data, types, api. Lệch thì điều tra trước khi đi tiếp.

- [ ] **Step 3: Mở app xem bằng mắt** (npm test KHÔNG thấy 3 thứ: chế độ Sáng, cỡ chữ 1,25× ở 375px, JSX-thành-chuỗi). Dùng Browser pane + `.claude/launch.json` (memory `chip-do-thi-khong-bam-duoc-bang-code` có sẵn cách dựng nhanh chế độ demo). Soát:
  1. Cài đặt → Hồ sơ: đổi phương pháp qua cả 6, ô % nạp đúng, nút Về mặc định, cảnh báo tổng ≠ 100%.
  2. Chọn `jars` → tab Ngân sách: 5 dòng, nhãn đúng, xổ dòng ra danh mục; dải AxisStrip 5 ô không vỡ ở 375px; chế độ Sáng.
  3. Chọn `80-20` → 2 dòng, không có dòng "chưa phân loại".
  4. Mặt lập kế hoạch (tháng sau): khối sinh theo phương pháp, kéo thanh trượt, câu phán cuối.
  5. Trang Phân loại: toggle 6 nút hai hàng ở 375px; bảng "Áp cho cả nhóm" hai bước.
  6. Báo cáo tháng: thẻ Cơ cấu N dòng + verdict; Bảng tin: vạch mốc Giữ lại chạy theo mốc phương pháp.
  7. Chế độ demo (`isDemoMode`) mở được, không trắng màn.

- [ ] **Step 4:** Ghi một dòng vào `docs/backlog-tinh-nang.md` (mục đã ship) theo đúng format các dòng sẵn có.

- [ ] **Step 5: Commit chốt**

```bash
git add docs/backlog-tinh-nang.md
git commit -m "docs(backlog): ghi nhan phuong phap phan bo da ship"
```

**Việc còn lại KHÔNG phải code, giao chủ sổ sau khi ship:** đổi nhãn 4 danh mục (Khóa học & Chứng chỉ, Sách vở → Giáo dục; Quà, Hỗ trợ gia đình → Cho đi; tuỳ ý Thuốc, Phí thủ tục → Dự phòng nếu muốn dùng Kakeibo).
