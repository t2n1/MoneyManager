# Tương lai Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Tương lai screen as a desktop-only console — a lifetime timeline where the chart itself is the editing surface and a fixed right-hand dock is the single place to edit a phase or a milestone.

**Architecture:** The pure calculation layer (`project.ts`, `eventAmount.ts`, `bigExpenses.ts`, `insights.ts`, `presets.ts`, …) is reused untouched; only the UI layer is rebuilt. A new top-level route `/tuong-lai` renders `TuongLaiPage`, which lays out three zones: the app's existing collapsed rail, a fluid plot area, and a fixed 24.5rem dock. Phases and milestones become draggable objects on the plot; the dock replaces both bottom sheets and the row-based workbench.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 (CSS-variable tokens in `src/index.css`), TanStack Query, react-router-dom, Supabase (Postgres), Vitest, lucide-react icons.

**Spec:** [`docs/superpowers/specs/2026-09-09-tuong-lai-console-design.md`](../specs/2026-09-09-tuong-lai-console-design.md) — read it before starting. It carries the token table, the geometry conversions, and the reasoning behind every deviation from the drawing.

**Design source:** the drawing runs. It is served at
`http://localhost:5174/dsg-handoff/Tuong%20lai%20-%201c%20dong%20thoi%20gian.dc.html`
(folder `dsg-handoff/` at repo root, excluded via `.git/info/exclude`, so it never gets
committed). Open it whenever a visual detail is ambiguous — it is the authority, not this
plan's prose. Its README is at `dsg-handoff/README.md`.

## Global Constraints

Every task's requirements implicitly include this section.

- **Desktop only.** Console renders from **1280px**. Below that, the route shows a "open on a computer" notice. Nothing in this feature appears in `BottomNav`.
- **Never change the signatures of** `projectLifetime`, `phaseForYear`, `YearRow` (`src/features/lifetime/project.ts`) or `firstNegativeYear` (`src/features/lifetime/insights.ts`). `src/features/notifications/rules/lifetimeRules.ts:4-5` imports them, and that file is bundled into a committed edge function. If a change becomes unavoidable: stop, run `npm run bundle:rules`, and commit `supabase/functions/push-notify/_rules.js` in the same commit (guard: `tests/pushBundle.test.ts`).
- **The Lifetime engine is a pure module.** `purity.test.ts` enforces it. Do not make it read `categories` or any other table.
- **`rem`, never px, for layout and type.** Guardrail rejects px ≥ 16. Pointer distances (the 6px click-vs-drag threshold) stay in px — they are not layout sizes.
- **No arbitrary values.** Every colour, size, radius, letter-spacing and duration already has a name. **`text-[0.8125rem]` is forbidden** — snap the drawing's 13px to `text-sm`. Need a size that has no name? Name it in `src/index.css` first, with its light-mode counterpart.
- **Use the design-system components:** `<PageHeader>`, `<SectionTitle>`, `<Select>`, `<ActionButton>`. Never hand-write `<h1>`, `<h2>`, `<select>`, or a green-background button. All four are hard bans in `tests/designSystem.test.ts`.
- **Radius:** panel radii on `<button>` are banned — the drawing's 6–8px buttons become `rounded-full`. Inputs stay `rounded-md`.
- **Never hand-write focus styles** (`tests/designSystem.test.ts:683`). The global ring handles it, despite the drawing specifying `outline: 2px solid #46d97e`.
- **Chart text uses tokens, never hex** (`tests/designSystem.test.ts:764`).
- **Every number goes through `<Money>` (money) or `<Num>` (counts, %, year spans).**
- **Axis labels are HTML overlays, not SVG `<text>`** — the drawing's runtime wrapped dynamic `<text>` and it vanished; the same trap does not apply to React, but the overlay approach is also what makes them scale with the font-size setting. Keep them `pointer-events: none`.
- **Missing FX rate → exclude and flag.** `convertToBase` returns `null`; set `hasMissingRate` and render `≈`. Never assume 1:1.
- **Respect `prefers-reduced-motion: reduce`** — disable all transitions and animations.
- Commands: `npm test` (vitest run) · `npx vitest run <path>` for one file · **`npx tsc -b`** for type-checking — **never `tsc --noEmit`**, it is falsely green in this repo · `npm run lint` (oxlint). Do **not** run prettier; this repo has none and `--write` rewrites whole files in the wrong style.

## Phasing

**Phase A (Tasks 1–6)** ships on its own: the data layer gains phase colour/icon, three pure helpers land with tests, three presets are added, and `/tuong-lai` goes live rendering the *existing* screen. Nothing looks redesigned yet, and nothing is broken.

**Phase B (Tasks 7–16)** replaces the page internals with the console.

**Task 17** is the verification pass that `npm test` cannot do.

---

### Task 1: Migration 0069 — phase colour and icon

`life_phases` has no `color` and no `icon` column; the drawing's phase blocks need both.

**Files:**
- Create: `supabase/migrations/0069_life_phase_color_icon.sql`
- Modify: `src/types/database.types.ts` (`LifePhaseRow` ~line 733; `life_phases.Insert` and `.Update` ~line 1453)
- Modify: `src/data/repo.ts:542-556` (`NewLifePhase`)
- Modify: `src/data/demoRepo.ts:1897-1915` (`createLifePhase`)
- Test: `src/data/demoRepo.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `LifePhaseRow.color: string`, `LifePhaseRow.icon: string`; `NewLifePhase.color?: string`, `NewLifePhase.icon?: string`. `''` means "no explicit choice — fall back to position-based tint", which is exactly today's appearance.

- [ ] **Step 1: Write the failing test**

In `src/data/demoRepo.test.ts`:

```ts
it('chặng giữ được màu và icon, không khai thì rỗng', async () => {
  const sc = await demoRepo.createLifeScenario({ name: 'Thử màu chặng' })
  const coMau = await demoRepo.createLifePhase({
    scenario_id: sc.id,
    start_year: 2026,
    label: 'Đi làm',
    country: 'JP',
    currency: 'JPY',
    annual_income_minor: 8_000_000,
    annual_expense_minor: 3_000_000,
    fx_to_display: 1,
    color: 'sky',
    icon: 'work',
  })
  expect(coMau.color).toBe('sky')
  expect(coMau.icon).toBe('work')

  // Không khai = rỗng, KHÔNG phải undefined: cột là `not null default ''`, nên bản demo
  // phải trả về đúng thứ bản thật trả về, không thì bug chỉ nổ ở bản thật.
  const khongKhai = await demoRepo.createLifePhase({
    scenario_id: sc.id,
    start_year: 2040,
    label: 'Nghỉ hưu',
    country: 'JP',
    currency: 'JPY',
    annual_income_minor: 0,
    annual_expense_minor: 2_500_000,
    fx_to_display: 1,
  })
  expect(khongKhai.color).toBe('')
  expect(khongKhai.icon).toBe('')
})
```

Check the top of `demoRepo.test.ts` for how it imports and resets storage between tests, and follow that file's existing setup rather than inventing one.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/demoRepo.test.ts`
Expected: FAIL — TypeScript rejects `color`/`icon` as not existing on `NewLifePhase`, or the returned row has `undefined`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0069_life_phase_color_icon.sql`:

```sql
-- Khối chặng đời trên trục thời gian mang MÀU và ICON riêng (bản vẽ 1c).
--
-- Vì sao cần: bản vẽ phân biệt CHẶNG với MỐC chỉ bằng mắt — hai dải màu khác nhau rõ
-- rệt. Mốc đã có `icon` (0066) và `color` (0067); chặng thì chưa có gì, nên trước đây
-- dải chặng chỉ tô nền so le theo THỨ TỰ. Tô theo thứ tự thì chèn một chặng vào giữa là
-- đổi màu toàn bộ các chặng sau nó — màu không dính vào chặng, nên không dùng để nhớ.
--
-- Dùng chung bảng khoá màu của nhãn (src/features/tags/colors.ts), y như 0067 đã làm
-- cho mốc: lưu KHOÁ ('sky', 'green'...), không lưu hex. Hex trong DB thì đổi bảng màu
-- của app là mọi dữ liệu cũ lệch tông, và không có đường nào tô lại cho light mode.
--
-- '' = CHƯA CHỌN, tô theo thứ tự như trước 0069. Dữ liệu cũ hiện y như cũ.
alter table public.life_phases
  add column if not exists color text not null default '',
  add column if not exists icon text not null default '';
```

- [ ] **Step 4: Add the columns to the hand-written types**

`src/types/database.types.ts` — there is no codegen here, so this file is the compiler's only view of the schema. In `LifePhaseRow`, after `expense_pct_of_prev`:

```ts
  /** Khoá màu trong src/features/tags/colors.ts. '' = tô theo THỨ TỰ chặng như trước 0069. */
  color: string
  /** Khoá icon cho chặng. '' = không vẽ icon trong khối chặng. */
  icon: string
```

In the `life_phases` table entry, add `| 'color'` and `| 'icon'` to the **optional** list of `Insert` (they have defaults) and to the `Pick<…>` list of `Update`.

- [ ] **Step 5: Add them to `NewLifePhase`**

`src/data/repo.ts`, inside `NewLifePhase`:

```ts
  /** Khoá màu (features/tags/colors). Bỏ trống = tô theo thứ tự chặng. */
  color?: string
  /** Khoá icon của chặng. Bỏ trống = không vẽ icon. */
  icon?: string
```

`LifePhasePatch` is `Partial<Omit<NewLifePhase, 'scenario_id'>>`, so it picks both up for free. `supabaseRepo.createLifePhase` spreads `{ ...input, user_id }` and `updateLifePhase` spreads `patch` — **no change needed in `supabaseRepo.ts`.**

- [ ] **Step 6: Make the demo repo store them**

`src/data/demoRepo.ts`, in the `row: LifePhaseRow = { … }` literal inside `createLifePhase`:

```ts
      color: input.color ?? '',
      icon: input.icon ?? '',
```

`?? ''` rather than leaving them off: the column is `not null default ''`, so the real repo returns `''`. A demo repo that returns `undefined` hides bugs until production.

- [ ] **Step 7: Run the test and the type-checker**

Run: `npx vitest run src/data/demoRepo.test.ts && npx tsc -b`
Expected: PASS, 0 type errors.

- [ ] **Step 8: Confirm backup/restore carries the new columns**

`exportAll` uses `select('*')`, so the columns are in backups automatically, and `tests/backupCompleteness.test.ts` only guards `profiles` (the one table whose restore path enumerates columns). Confirm nothing enumerates `life_phases` columns on the way back in:

Run: `grep -rn "life_phases" src/data/ | grep -v "\.test\."`
Expected: only the table-name list in `exportTables.ts` and the validator comment in `backupImport.ts:207` — no column list. If a column list turns up, add `color` and `icon` to it.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0069_life_phase_color_icon.sql src/types/database.types.ts src/data/repo.ts src/data/demoRepo.ts src/data/demoRepo.test.ts
git commit -m "feat(moc-cuoc-doi): chang doi co mau va icon rieng (migration 0069)"
```

---

### Task 2: `curvePath` — the drawing's curved line

`chartGeom.ts:160 linePath` emits only `L` commands: a polyline. The drawing requires a Catmull-Rom curve converted to cubic Bézier, with the control points clamped so the curve cannot bulge outside the data at direction changes.

**Files:**
- Modify: `src/features/lifetime/chartGeom.ts`
- Test: `src/features/lifetime/chartGeom.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `curvePath(pts: [number, number][]): string` — same input and empty-input behaviour as `linePath`, so it is a drop-in replacement for the projection line and the band edges.

- [ ] **Step 1: Write the failing test**

Append to `src/features/lifetime/chartGeom.test.ts`:

```ts
describe('curvePath', () => {
  it('rỗng và một điểm xử lý như linePath', () => {
    expect(curvePath([])).toBe('')
    expect(curvePath([[10, 20]])).toBe('M10.0 20.0')
  })

  it('hai điểm là một đoạn thẳng, không sinh khúc cong', () => {
    expect(curvePath([[0, 0], [10, 10]])).toBe('M0.0 0.0 C0.0 0.0 10.0 10.0 10.0 10.0')
  })

  it('CHẶN control point trong khoảng y của hai đầu đoạn', () => {
    // Đỉnh nhọn: y đi 0 → 100 → 0. Không chặn thì Catmull-Rom cho control point vượt
    // lên trên 100 (hoặc xuống dưới 0) và đường vồng ra ngoài dữ liệu.
    const d = curvePath([[0, 0], [10, 100], [20, 0], [30, 100]])
    const ys = [...d.matchAll(/[MC]?[\d.-]+ ([\d.-]+)/g)].map((m) => Number(m[1]))
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ys)).toBeLessThanOrEqual(100)
  })

  it('giữ nguyên mọi điểm dữ liệu làm đầu/cuối các đoạn', () => {
    const d = curvePath([[0, 5], [10, 15], [20, 25]])
    expect(d.startsWith('M0.0 5.0')).toBe(true)
    expect(d).toContain('10.0 15.0')
    expect(d.endsWith('20.0 25.0')).toBe(true)
  })
})
```

Add `curvePath` to the import list at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/lifetime/chartGeom.test.ts`
Expected: FAIL — `curvePath is not a function`.

- [ ] **Step 3: Implement it**

In `src/features/lifetime/chartGeom.ts`, next to `linePath`:

```ts
/**
 * `d` của một đường CONG qua đúng mọi điểm (Catmull-Rom → cubic Bézier).
 *
 * Vì sao không dùng `linePath`: đường gấp khúc đọc như dữ liệu rời rạc, còn tài sản
 * ròng theo năm là một đường liên tục. Bản vẽ 1c đòi đường cong.
 *
 * Vì sao phải CHẶN control point: Catmull-Rom lấy độ dốc từ hai điểm LÂN CẬN, nên ở chỗ
 * đường đổi chiều (đỉnh hoặc đáy) control point rơi ra ngoài khoảng y của đoạn và đường
 * vồng vượt quá dữ liệu — vẽ ra một mức tài sản chưa từng có trong phép chiếu.
 */
export function curvePath(pts: [number, number][]): string {
  if (pts.length === 0) return ''
  const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))]
  const chan = (v: number, a: number, b: number) =>
    Math.max(Math.min(a, b), Math.min(Math.max(a, b), v))
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const [a0, a1, a2, a3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    const c1x = a1[0] + (a2[0] - a0[0]) / 6
    const c2x = a2[0] - (a3[0] - a1[0]) / 6
    const c1y = chan(a1[1] + (a2[1] - a0[1]) / 6, a1[1], a2[1])
    const c2y = chan(a2[1] - (a3[1] - a1[1]) / 6, a1[1], a2[1])
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${a2[0].toFixed(1)} ${a2[1].toFixed(1)}`
  }
  return d
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/lifetime/chartGeom.test.ts`
Expected: PASS. If the two-point case disagrees on formatting, fix the **test** to match the implementation's output only after checking by hand that the path is correct — do not loosen the clamping assertion.

- [ ] **Step 5: Commit**

```bash
git add src/features/lifetime/chartGeom.ts src/features/lifetime/chartGeom.test.ts
git commit -m "feat(tuong-lai): curvePath — duong cong co chan vuot bien"
```

---

### Task 3: `quickAddRange` — a selected year span becomes preset parameters

Dragging horizontally across the plot selects a year span; releasing opens the preset board. The milestone that gets created must match the span, and each preset kind absorbs the span differently.

**Files:**
- Create: `src/features/lifetime/quickAddRange.ts`
- Test: `src/features/lifetime/quickAddRange.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
```ts
export interface YearSpan { startYear: number; endYear: number }
export interface SpanApply { year: number; termYears?: number; untilAge?: number; endYear?: number }
export function normalizeSpan(a: number, b: number): YearSpan
export function spanYears(s: YearSpan): number
export function applySpanToPreset(presetId: string, s: YearSpan): SpanApply
```
Task 13 (`QuickAddBoard`) consumes all four.

- [ ] **Step 1: Write the failing test**

`src/features/lifetime/quickAddRange.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applySpanToPreset, normalizeSpan, spanYears } from './quickAddRange'

describe('normalizeSpan', () => {
  it('kéo ngược từ phải sang trái vẫn ra khoảng đúng chiều', () => {
    expect(normalizeSpan(2035, 2028)).toEqual({ startYear: 2028, endYear: 2035 })
  })
  it('bấm một chỗ (hai đầu trùng) là khoảng một năm', () => {
    expect(normalizeSpan(2030, 2030)).toEqual({ startYear: 2030, endYear: 2030 })
  })
})

describe('spanYears', () => {
  it('đếm CẢ HAI đầu — 2027–2031 là 5 năm, không phải 4', () => {
    expect(spanYears({ startYear: 2027, endYear: 2031 })).toBe(5)
  })
})

describe('applySpanToPreset', () => {
  const s = { startYear: 2030, endYear: 2064 }

  it('mua-nha lấy khoảng làm SỐ NĂM VAY', () => {
    expect(applySpanToPreset('mua-nha', s)).toEqual({ year: 2030, termYears: 35 })
  })
  it('mua-xe cũng lấy khoảng làm số năm vay', () => {
    expect(applySpanToPreset('mua-xe', { startYear: 2030, endYear: 2034 })).toEqual({
      year: 2030,
      termYears: 5,
    })
  })
  it('sinh-con lấy khoảng làm TUỔI NUÔI TỚI', () => {
    expect(applySpanToPreset('sinh-con', { startYear: 2030, endYear: 2051 })).toEqual({
      year: 2030,
      untilAge: 22,
    })
  })
  it('mẫu còn lại lấy nguyên hai đầu làm năm bắt đầu và năm kết thúc', () => {
    expect(applySpanToPreset('du-lich', { startYear: 2030, endYear: 2040 })).toEqual({
      year: 2030,
      endYear: 2040,
    })
  })
  it('bấm một chỗ thì KHÔNG áp khoảng — chỉ có năm', () => {
    // Một năm không nói gì về thời hạn vay; áp vào là bịa ra "vay 1 năm".
    expect(applySpanToPreset('mua-nha', { startYear: 2030, endYear: 2030 })).toEqual({
      year: 2030,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/lifetime/quickAddRange.test.ts`
Expected: FAIL — cannot find module `./quickAddRange`.

- [ ] **Step 3: Implement it**

`src/features/lifetime/quickAddRange.ts`:

```ts
// Khoảng năm chọn được bằng cách kéo ngang trên nền đồ thị → tham số cho mẫu.
//
// Mỗi mẫu HẤP THU khoảng theo nghĩa riêng của nó, không phải cùng một chỗ: kéo 35 năm
// trên "Mua nhà" nghĩa là vay 35 năm, còn trên "Sinh con" nghĩa là nuôi tới 22 tuổi.
// Nhét khoảng vào `end_year` cho tất cả thì "Mua nhà" thành một khoản chi trải 35 năm
// mà không có khoản trả trước, tức là sai hẳn hình dạng dòng tiền.
//
// Thuần, không import React và không import repo — mọi luật ở đây test được bằng số.

/** Khoảng năm đã chuẩn hoá: `startYear <= endYear`. */
export interface YearSpan {
  startYear: number
  endYear: number
}

/** Tham số áp lên `PresetContext` khi sinh mẫu từ một khoảng. */
export interface SpanApply {
  year: number
  termYears?: number
  untilAge?: number
  endYear?: number
}

/** Hai đầu kéo (thứ tự bất kỳ) → khoảng đúng chiều. */
export function normalizeSpan(a: number, b: number): YearSpan {
  return a <= b ? { startYear: a, endYear: b } : { startYear: b, endYear: a }
}

/** Số năm của khoảng, ĐẾM CẢ HAI ĐẦU: 2027–2031 là 5 năm. */
export function spanYears(s: YearSpan): number {
  return s.endYear - s.startYear + 1
}

/** Mẫu vay: khoảng = thời hạn vay. */
const THEO_THOI_HAN = new Set(['mua-nha', 'mua-xe'])
/** Mẫu nuôi con: khoảng = nuôi tới bao nhiêu tuổi. */
const THEO_TUOI = new Set(['sinh-con'])

export function applySpanToPreset(presetId: string, s: YearSpan): SpanApply {
  const n = spanYears(s)
  // Bấm một chỗ không phải là một khoảng: nó chỉ nói năm. Áp `termYears: 1` vào đây là
  // bịa ra "vay 1 năm" từ một cú bấm.
  if (n <= 1) return { year: s.startYear }
  if (THEO_THOI_HAN.has(presetId)) return { year: s.startYear, termYears: n }
  if (THEO_TUOI.has(presetId)) return { year: s.startYear, untilAge: n - 1 }
  return { year: s.startYear, endYear: s.endYear }
}
```

Note `untilAge: n - 1`: a child born in 2030 and supported "until 22" is covered through age 22, i.e. 2030–2052 inclusive is 23 years. The test above uses 2030–2051 (22 years) → `untilAge: 21`… **verify this against the drawing before implementing** — open `dsg-handoff/README.md` §syncEnd, which states `endYear = min(X1, startYear + round(untilAge))`. That formula makes 2030 + 22 = 2052, so a 2030–2051 span is `untilAge: 21`. Fix the test's expectation to `untilAge: 21` and keep `n - 1`, so `applySpanToPreset` and `syncEnd` agree. Getting these two out of step means dragging a span then reopening the milestone silently moves its end year.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/lifetime/quickAddRange.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/lifetime/quickAddRange.ts src/features/lifetime/quickAddRange.test.ts
git commit -m "feat(tuong-lai): khoang nam keo tren do thi -> tham so mau"
```

---

### Task 4: `undoStack` — one level of undo for deletes

Deleting a phase or milestone must be undoable for 9 seconds. The drawing scopes undo to deletes only; edits and drags are not undoable.

**Files:**
- Create: `src/features/lifetime/undoStack.ts`
- Test: `src/features/lifetime/undoStack.test.ts`

**Interfaces:**
- Consumes: `ScenarioDraft` from `./draft` — read its exported type before writing this task and match the real field names; the snapshot stores phases and events from the draft, not from the DB.
- Produces:
```ts
export interface UndoEntry<T> { label: string; snapshot: T; at: number }
export function makeUndo<T>(): {
  push(label: string, snapshot: T, now?: number): UndoEntry<T>
  peek(now?: number): UndoEntry<T> | null
  take(now?: number): UndoEntry<T> | null
  clear(): void
}
export const UNDO_WINDOW_MS = 9_000
```
Task 14 consumes these.

- [ ] **Step 1: Write the failing test**

`src/features/lifetime/undoStack.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { makeUndo, UNDO_WINDOW_MS } from './undoStack'

describe('makeUndo', () => {
  it('chưa xoá gì thì không có gì để hoàn tác', () => {
    expect(makeUndo<number>().peek(0)).toBeNull()
  })

  it('giữ bản chụp và nhãn của lần xoá gần nhất', () => {
    const u = makeUndo<number[]>()
    u.push('Đã xoá mốc "Mua nhà"', [1, 2], 0)
    expect(u.peek(0)?.label).toBe('Đã xoá mốc "Mua nhà"')
    expect(u.peek(0)?.snapshot).toEqual([1, 2])
  })

  it('MỘT bậc: xoá cái thứ hai thì cái thứ nhất mất luôn', () => {
    const u = makeUndo<string>()
    u.push('một', 'A', 0)
    u.push('hai', 'B', 100)
    expect(u.peek(100)?.snapshot).toBe('B')
  })

  it('hết 9 giây thì coi như không còn gì', () => {
    const u = makeUndo<string>()
    u.push('một', 'A', 0)
    expect(u.peek(UNDO_WINDOW_MS - 1)).not.toBeNull()
    expect(u.peek(UNDO_WINDOW_MS)).toBeNull()
  })

  it('take() lấy ra rồi dọn — bấm Hoàn tác hai lần không hoàn tác hai lần', () => {
    const u = makeUndo<string>()
    u.push('một', 'A', 0)
    expect(u.take(0)?.snapshot).toBe('A')
    expect(u.take(0)).toBeNull()
    expect(u.peek(0)).toBeNull()
  })

  it('clear() bỏ luôn bản chụp — dùng khi đổi kịch bản', () => {
    const u = makeUndo<string>()
    u.push('một', 'A', 0)
    u.clear()
    expect(u.peek(0)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/lifetime/undoStack.test.ts`
Expected: FAIL — cannot find module `./undoStack`.

- [ ] **Step 3: Implement it**

`src/features/lifetime/undoStack.ts`:

```ts
// Hoàn tác MỘT BẬC, chỉ cho việc XOÁ.
//
// Phạm vi hẹp là có chủ ý (đúng bản vẽ 1c): xoá là thao tác duy nhất mất dữ liệu mà
// không có đường nào lần lại được. Sửa và kéo thì con số cũ vẫn còn trên màn, và bản
// nháp chưa ghi vào DB nên "Bỏ" ở thanh nháp đã là đường lùi.
//
// `now` truyền vào chứ không gọi `Date.now()` bên trong: test thời gian mà phải chờ
// thật 9 giây thì hoặc test chậm, hoặc phải giả lập đồng hồ.
//
// Thuần, không import React.

/** Cửa sổ hoàn tác — 9 giây, đúng thời lượng toast của bản vẽ. */
export const UNDO_WINDOW_MS = 9_000

export interface UndoEntry<T> {
  /** Câu hiện trên toast, ví dụ: `Đã xoá mốc "Mua nhà"`. */
  label: string
  snapshot: T
  /** Mốc thời gian lúc chụp, ms. */
  at: number
}

export function makeUndo<T>() {
  let entry: UndoEntry<T> | null = null
  const conHan = (now: number) => entry !== null && now - entry.at < UNDO_WINDOW_MS
  return {
    push(label: string, snapshot: T, now = Date.now()): UndoEntry<T> {
      entry = { label, snapshot, at: now }
      return entry
    },
    /** Xem mà không lấy — dùng để quyết định có vẽ toast hay không. */
    peek(now = Date.now()): UndoEntry<T> | null {
      return conHan(now) ? entry : null
    },
    /** Lấy ra và DỌN: bấm Hoàn tác hai lần không được hoàn tác hai lần. */
    take(now = Date.now()): UndoEntry<T> | null {
      const e = conHan(now) ? entry : null
      entry = null
      return e
    },
    clear() {
      entry = null
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/lifetime/undoStack.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/lifetime/undoStack.ts src/features/lifetime/undoStack.test.ts
git commit -m "feat(tuong-lai): hoan tac mot bac cho viec xoa"
```

---

### Task 5: Three more presets — car, travel, further study

The drawing's "Loại mốc" row has eight kinds. `presets.ts` has six (`cuoi`, `sinh-con`, `mua-nha`, `nghi-huu`, `chuyen-nuoc`, `ho-tro-bo-me`). Add `mua-xe`, `du-lich`, `hoc-them` so the board covers the drawing's intent.

**Files:**
- Modify: `src/features/lifetime/presets.ts`
- Test: `src/features/lifetime/presets.test.ts`

**Interfaces:**
- Consumes: the `ev()` helper and `PresetContext` already in `presets.ts`; `applySpanToPreset` ids from Task 3 (`'mua-xe'`, `'du-lich'`).
- Produces: three new entries in the exported presets array, each with `id`, `label`, `hint`, `yearLabel`, `build`.

**Read first:** the UNIT CONVENTION comment block at the top of `presets.ts` (lines 1–23). It is binding: every default constant carries a `_JPY`/`_VND` suffix naming the currency its magnitude was written for, and the event must pin that exact `currency`. Falling back to `ctx.currency` produced a 150× error for a VND phase. Every default also needs a source and a lookup date, and `note` stays `'Số mặc định, kiểm tra lại'`.

- [ ] **Step 1: Write the failing test**

Follow the existing assertions in `presets.test.ts` for shape, then add:

```ts
it('ba mẫu mới đều ép cứng JPY và dán nhãn số mặc định', () => {
  const ctx = /* dựng PresetContext như các test sẵn có trong file này */
  for (const id of ['mua-xe', 'du-lich', 'hoc-them']) {
    const p = PRESETS.find((x) => x.id === id)
    expect(p, id).toBeDefined()
    const { events } = p!.build(ctx)
    expect(events.length, id).toBeGreaterThan(0)
    for (const e of events) {
      expect(e.currency, `${id}/${e.label}`).toBe('JPY')
      expect(e.note, `${id}/${e.label}`).toBe('Số mặc định, kiểm tra lại')
    }
  }
})

it('mua-xe sinh khoản trả trước + trả vay, và trả vay KHÔNG phồng theo lạm phát', () => {
  const ctx = /* như trên */
  const { events } = PRESETS.find((p) => p.id === 'mua-xe')!.build(ctx)
  const vay = events.find((e) => e.label.includes('Trả vay'))
  expect(vay).toBeDefined()
  // Khoản trả vay lãi cố định là số DANH NGHĨA — cùng lý do đã ghi ở mẫu 'mua-nha'.
  expect(vay!.inflate).toBe(false)
  expect(events.some((e) => e.label.includes('Trả trước'))).toBe(true)
})

it('du-lich lặp lại, không phải một lần', () => {
  const ctx = /* như trên */
  const { events } = PRESETS.find((p) => p.id === 'du-lich')!.build(ctx)
  expect(events[0].end_year).not.toBe(events[0].start_year)
})
```

Match the real exported array name and the real `PresetContext` construction used by the tests already in the file — do not invent either.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/lifetime/presets.test.ts`
Expected: FAIL — the three presets are not found.

- [ ] **Step 3: Implement the three presets**

Add constants beside the existing ones, each with a source and a lookup date of `2026-09-09`, then three entries modelled exactly on `mua-nha` (`presets.ts:241-271`). Required properties:

- **`mua-xe`** — `label: 'Mua xe'`, `yearLabel: 'Năm mua'`. Two events, both `currency: 'JPY'`: a down payment (`inflate: true` — today's price paid in a future year) and an annual loan repayment running to `ctx.year + 4` with `inflate: false` (fixed-rate nominal). Use `asset_value_minor` + `loan_minor` so a car becomes an asset with a loan, the same mechanism `mua-nha` uses via migration 0068, and set `asset_change_bps` negative — a car loses value. The spec's §13 lists this as a feature that must not be lost.
- **`du-lich`** — `label: 'Du lịch'`, `yearLabel: 'Năm đầu'`. One recurring expense; set `repeat_every_years` for the "every N years" behaviour (migration 0066) and give it an `end_year` later than `start_year`.
- **`hoc-them`** — `label: 'Học thêm'`, `yearLabel: 'Năm bắt đầu'`. Tuition as an expense; the drawing's `cutPct` (income cut while studying) is expressed here as a **second event** with `kind: 'income'` and a negative-effect amount, or via `replaces_minor` — pick one, and write a comment saying which and why. Do not invent a `cutPct` column.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/lifetime/presets.test.ts && npx tsc -b`
Expected: PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/lifetime/presets.ts src/features/lifetime/presets.test.ts
git commit -m "feat(tuong-lai): them mau mua xe, du lich, hoc them"
```

---

### Task 6: Route `/tuong-lai` goes live

Give the console its own destination, rendering the **existing** screen for now. Nothing is redesigned in this task; the point is that routing, the rail entry, redirects, and the width gate all land and are verifiable on their own.

**Files:**
- Create: `src/features/lifetime/TuongLaiPage.tsx`
- Modify: `src/App.tsx:166-167` area (add route, add redirect)
- Modify: `src/components/navItems.ts:41-50`
- Modify: `src/features/assets/AssetsPage.tsx` (drop the `future` sub-tab, keep a redirect for the old query)
- Modify: `docs/information-architecture.md` §2.3
- Test: `tests/navMobile.test.ts` (confirm the new item never reaches mobile)

**Interfaces:**
- Consumes: `LifetimeView` from `./LifetimeView` (temporarily — Task 7 replaces the body).
- Produces: `export function TuongLaiPage()`; route path `/tuong-lai`; nav item `{ to: '/tuong-lai', label: 'Tương lai', Icon: Milestone, onMobile: false }`.

- [ ] **Step 1: Read the mobile-nav guard first**

Run: `npx vitest run tests/navMobile.test.ts` and read the file.
It asserts something about which nav items appear on mobile. Understand what it checks **before** adding an item, then add an assertion that `/tuong-lai` is desktop-only rather than assuming the existing test already covers it.

- [ ] **Step 2: Write the failing test**

In `tests/navMobile.test.ts`:

```ts
it('Tương lai chỉ có trên rail desktop, không xuống thanh tab điện thoại', () => {
  const item = NAV_ITEMS.find((i) => i.to === '/tuong-lai')
  expect(item, 'chưa thêm mục Tương lai vào NAV_ITEMS').toBeDefined()
  // Console dòng thời gian cần 1280px; thanh tab dưới chỉ tồn tại dưới `lg`.
  expect(item!.onMobile).toBe(false)
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/navMobile.test.ts`
Expected: FAIL — item is `undefined`.

- [ ] **Step 4: Add the nav item**

`src/components/navItems.ts` — import `Milestone` from `lucide-react` and add after the `/assets` entry:

```ts
  { to: '/tuong-lai', label: 'Tương lai', Icon: Milestone, onMobile: false },
```

`onMobile: false` is how this codebase says "desktop only" — the rail is `hidden lg:flex` and `BottomNav` filters on this flag.

- [ ] **Step 5: Create the page with the width gate**

`src/features/lifetime/TuongLaiPage.tsx`. Body for now: render `<LifetimeView />`. Above it, the gate. The gate must be **CSS-driven, not JavaScript measurement** — a JS breakpoint read is wrong on first paint and does not follow the font-size setting:

```tsx
// Console dòng thời gian là màn CHỈ CHO MÁY TÍNH (quyết định 2026-09-09, xem
// docs/superpowers/specs/2026-09-09-tuong-lai-console-design.md §1). Cần 1280px để
// chứa rail + vùng vẽ + dock 24,5rem cùng lúc.
//
// Cổng bằng CSS chứ không đo bằng JS: đọc `innerWidth` trong render thì lần vẽ đầu luôn
// sai ở SSR/hydrate và không nghe theo Cài đặt → Cỡ chữ (rem đổi thì ngưỡng đổi theo).
<div className="xl:hidden …">{/* lời nhắn mở bằng máy tính */}</div>
<div className="hidden xl:flex …">{/* console */}</div>
```

Check `tailwind.config` / `src/index.css` for the actual `xl` breakpoint value; if `xl` is not 1280px, use the breakpoint that is, and say so in a comment.

- [ ] **Step 6: Wire the route and the redirects**

`src/App.tsx`:

```tsx
<Route path="/tuong-lai" element={lazyRoute(<TuongLaiPage />)} />
```

Change the existing `/lifetime` redirect to point at `/tuong-lai`. For `/assets?view=future`, follow the pattern in the comment at `src/App.tsx:120` — a bare `<Navigate>` swallows the query string, so redirect deliberately and keep any other params. Then remove the `future` sub-tab from `AssetsPage` (it currently mounts `LifetimeView` at `:232` via the lazy import at `:23`).

- [ ] **Step 7: Update the IA doc**

`docs/information-architecture.md` §2.3 says Tài sản has 3 sub-tabs with `Tương lai` as `future`. Change it to 2 sub-tabs and add Tương lai as a top-level desktop-only destination. Also fix the tree diagram at line 65.

- [ ] **Step 8: Verify in the browser**

Run the demo server and check the route actually renders, at both widths:

```bash
grep -c . .env.demo
```

Then use the preview tooling on `so-chi-tieu-demo` (port 5174) and open `/tuong-lai`. The demo DB has **no** Lifetime data by default and the screen will sit on "Đang tải…" forever unless you seed all four things into `localStorage['sct-demo-db-v18']`: `profile.birth_year`, one `lifeScenarios` with `is_primary: true`, **at least one** `lifePhases` (`buildLifetimeInput` returns `undefined` with zero phases), then `lifeEvents`. Afterwards `localStorage.removeItem('sct-query-cache')` and reload, or the persisted cache serves the empty version back for up to 5 minutes.
Expected: at ≥1280px the existing Tương lai screen renders at `/tuong-lai`; below it, the notice. `/assets` shows 2 sub-tabs. `/assets?view=future` and `/lifetime` both land on `/tuong-lai`.

- [ ] **Step 9: Run the full suite**

Run: `npm test && npx tsc -b && npm run lint`
Expected: all green. `tests/assetsLayout.test.ts` may assert three sub-tabs — if it fails, update it; that is a real consequence of this task, not an unrelated break.

- [ ] **Step 10: Commit**

```bash
git add -u && git add src/features/lifetime/TuongLaiPage.tsx
git commit -m "feat(tuong-lai): trang rieng /tuong-lai, chi cho may tinh"
```

Note: `git add -u` and **not** `git add -A` — another session works in this same folder and `-A` would sweep up its files.

---

## Phase B — the console

Phase B replaces the page internals. Every task below reads the running drawing for
visual detail and the spec for the token/geometry mapping. Because these are UI tasks,
each one ends with a **browser check**, not only a unit test — the three failure modes
`npm test` cannot see are Light mode, the 1.25× font size, and JSX expressions flattened
into strings.

### Task 7: Console frame — three zones and the row order

**Files:**
- Modify: `src/features/lifetime/TuongLaiPage.tsx`
- Create: `src/features/lifetime/ConsoleFrame.tsx`

**Interfaces:**
- Consumes: `useLifetime()` from `./useLifetime` for scenario/draft state.
- Produces: `<ConsoleFrame plot={…} dock={…} below={…} />` — a layout-only component: fluid plot column, fixed `24.5rem` dock column, scrolling region beneath.

- [ ] **Step 1:** Read `dsg-handoff/README.md` §"Bố cục màn hình" and §"Thứ tự các hàng, từ trên xuống" — twelve rows, in order. Reproduce that order.
- [ ] **Step 2:** Build `ConsoleFrame` with the dock column **always** present, even when nothing is selected. The drawing calls this out explicitly: the dock is reserved so the plot never resizes on select/deselect. Do not make it conditional.
- [ ] **Step 3:** Put the caption row and the legend row as **static rows outside the SVG**, not absolutely-positioned overlays. The drawing records a real bug from doing otherwise: text overlapped the FIRE chip.
- [ ] **Step 4:** Convert every px in the drawing via the spec's §5 table. `24.5rem`, `35rem`, `3.25rem`, `2.875rem`.
- [ ] **Step 5:** Browser check at 1280 / 1920 / 2560. Confirm the plot grows and the dock does not.
- [ ] **Step 6:** `npm test && npx tsc -b`, then commit.

### Task 8: `PlanDock` idle state — the plan summary card

**Files:** Create `src/features/lifetime/PlanDock.tsx`, `src/features/lifetime/PlanSummaryCard.tsx`

**Interfaces:** Produces `<PlanDock sel={…} … />` dispatching on `sel.type` of `'none' | 'phase' | 'event'`; this task implements `'none'` only.

- [ ] **Step 1:** Seven label/value rows per the drawing: Chặng đời · Mốc · Tự do tài chính · Lúc N tuổi · Khoản lớn nhất · Lợi suất thực · Lạm phát chi tiêu. Values come from the existing pure functions — `fireYear`, `assetsAtAge`, `bigExpenses` — do not recompute them.
- [ ] **Step 2:** Footer line: `Bấm một chặng hoặc mốc để sửa · Esc đóng · ⌘Z hoàn tác`.
- [ ] **Step 3:** Every number through `<Money>` or `<Num>`. Money must pass through privacy mode.
- [ ] **Step 4:** Browser check in **both** Light and Dark, and at 1.25× font. Commit.

### Task 9: `PlanDock` phase state

**Files:** Create `src/features/lifetime/PlanDockPhase.tsx`

- [ ] **Step 1:** Identity row: icon button 33px · colour button 33px · name (flex) · start year. "End year" is **static text** for a phase — the next phase decides it.
- [ ] **Step 2:** Fields: Thu/năm · Chi/năm · Tiền tệ khai · Quốc gia · the "để dành" line. Keep the existing `income_pct_of_prev` / `expense_pct_of_prev` percent declaration (0067) — the drawing has no equivalent and dropping it would lose a real feature (spec §13).
- [ ] **Step 3:** Changing "Tiền tệ khai" must **convert the amounts**, not just swap the symbol: `round(fromJPY(toJPY(v, old), new))` using the existing `fxModel.ts` helpers.
- [ ] **Step 4:** Icon and colour popovers, closing on select, writing `color`/`icon` from Task 1. Colour options are the app's 7 keys rendered in the **muted** treatment (spec §8).
- [ ] **Step 5:** Writes go to the **draft**, never straight to the DB — read `PhaseFormSheet.tsx`'s header comment for the reasoning before wiring anything.
- [ ] **Step 6:** Browser check, `npm test`, commit.

### Task 10: `PlanDock` event state

**Files:** Create `src/features/lifetime/PlanDockEvent.tsx`

- [ ] **Step 1:** Preset chip row at the top (from Task 5), the drawing's "Loại mốc". These **create from a preset**; they are not a `type` column (spec §6).
- [ ] **Step 2:** Field grid over the app's real fields: amount · `amount_shape` (per_year/total/ramp/growth) · `repeat_every_years` · `replaces_minor`/`replaces_label` · `asset_value_minor`/`loan_minor`/`asset_change_bps` · `enabled`. This is the deliberate deviation from the drawing's per-type grid, already approved.
- [ ] **Step 3:** Advanced (collapsed): declared currency · inflation · note. Footer: Duplicate · **+ Chặng đời mới từ đây** · Delete.
- [ ] **Step 4:** "Tra hộ" opens `TraSoSheet` as a nested sheet from the dock. Preserve all three subtleties documented in commit `cc31eb1`: the round-token (`luotRef`) so a stale lookup cannot overwrite a newer one; the user's own label on the confirm screen; and notes that **append**, never overwrite.
- [ ] **Step 5:** Browser check, `npm test`, commit.

### Task 11: `PhaseLane` — draggable phase blocks

**Files:** Create `src/features/lifetime/PhaseLane.tsx`

- [ ] **Step 1:** Blocks `2.875rem` tall, radius 8px, tinted from the phase's `color` key (muted treatment) with its `icon`, filling the axis with no gaps and no overlaps.
- [ ] **Step 2:** Two 9px edge handles. Left edge changes this phase's `startYear`; **right edge moves the *next* phase's `startYear`**. First phase has no left edge, last has no right edge. Dragging the middle moves the whole phase.
- [ ] **Step 3:** `stopPropagation` on the handles' `pointerdown` or the outer block steals the gesture; `setPointerCapture` so dragging outside does not drop it; disable transitions while dragging or the block lags the cursor.
- [ ] **Step 4:** Keyboard equivalent — `←`/`→` move the selected phase one year. The repo already treats a mouse-only interaction as a defect; see the `onKeyDown` comment at `LifetimeChartCard.tsx:1358`.
- [ ] **Step 5:** Enforce the invariants: first phase starts at the current year; no two phases share a `startYear` (the DB has `UNIQUE (scenario_id, start_year)` from 0031 and the demo repo throws to match). Clamp drags instead of letting the write fail.
- [ ] **Step 6:** Browser check — drag every edge, including the first and last block. `npm test`, commit.

### Task 12: `EventPins` — milestone icons on the plot

**Files:** Create `src/features/lifetime/EventPins.tsx`

- [ ] **Step 1:** 24px circles on the plot, 1px border, 13px icon in the milestone's colour (vivid treatment). Milestones with an end year also get an 18px handle with `cursor: ew-resize`, joined by a 2px line at opacity .45.
- [ ] **Step 2:** Stack with **`packRows` from `chartGeom.ts:145`** — it already does collision row-packing; do not write a new one. Feed it width `max(52, xs(endYear) - xs(startYear) + 42)` and row spacing `1.625rem`.
- [ ] **Step 3:** Drag the icon to move the start year, with a ±1-year magnet to phase boundaries. Drag the handle to change the end year. Click (no drag) opens the dock. Threshold **6px** — keep it in px.
- [ ] **Step 4:** Milestones outside the current zoom window are excluded from both drawing and packing.
- [ ] **Step 5:** Disabled milestones (`enabled: false`) still render, dimmed with the label struck through — hiding them makes "re-enable" unreachable. That reasoning is already written at `LifetimeChartCard.tsx:1340`.
- [ ] **Step 6:** Browser check, `npm test`, commit.

### Task 13: `QuickAddBoard` — click or drag the plot background

**Files:** Create `src/features/lifetime/QuickAddBoard.tsx`

- [ ] **Step 1:** Click the background → board opens with `Thêm mốc ở năm 2034 · tuổi 40`.
- [ ] **Step 2:** Drag horizontally → a band at `rgba(70,217,126,.09)` with a dashed accent border and a `2027–2031 · 5 năm` label; on release the board opens for that span. Throttle the drag with `requestAnimationFrame`.
- [ ] **Step 3:** Board lists the presets plus "+ Mốc trống". Feed the span through **`applySpanToPreset`** from Task 3.
- [ ] **Step 4:** Browser check — verify the year under the cursor matches the label, at all three zoom levels. `npm test`, commit.

### Task 14: Undo toast and the keyboard layer

**Files:** Modify `TuongLaiPage.tsx`; create `src/features/lifetime/useConsoleKeys.ts`

- [ ] **Step 1:** Wire `makeUndo` from Task 4. Delete → snapshot, then a toast at the bottom of the plot: `Đã xoá mốc "X" · [Hoàn tác]`, 9 seconds.
- [ ] **Step 2:** Keys: `Esc` closes panel/board/popover/drawer · `Delete`/`Backspace` deletes the selection · `⌘Z`/`Ctrl+Z` undoes · `←`/`→` moves the selection one year, or the hover line when nothing is selected.
- [ ] **Step 3:** Do **not** fire shortcuts while focus is in an `input`, `textarea`, or contenteditable — except `⌘Z`.
- [ ] **Step 4:** Browser check — every key, and specifically confirm typing a number into a dock field does not delete the milestone. `npm test`, commit.

### Task 15: Empty state

**Files:** Modify `src/features/lifetime/TimelinePlot.tsx` (or wherever the plot lands in Task 7)

- [ ] **Step 1:** No milestones → a dashed-border card centred in the plot: title, one line of guidance, and a "Chọn mốc từ mẫu" button that opens the board at the middle of the timeline.
- [ ] **Step 2:** This is distinct from "no scenario" and "no birth year", which already have their own states. Do not collapse them — the existing screen has three non-empty states by design (see `LifetimeView.tsx`'s header comment).
- [ ] **Step 3:** Browser check with a scenario that has phases but zero events. Commit.

### Task 16: Retire the old surfaces

**Files:** Delete `LifetimeView.tsx`, `LifetimeChartCard.tsx`, `ScenarioWorkbench.tsx`, `EventFormSheet.tsx`, `PhaseFormSheet.tsx`, `PresetPanel.tsx`. Modify `src/backLink.test.ts:28`.

- [ ] **Step 1:** Confirm nothing still imports them: `grep -rn "LifetimeView\|LifetimeChartCard\|ScenarioWorkbench\|EventFormSheet\|PhaseFormSheet\|PresetPanel" --include=*.ts --include=*.tsx src/`. Expect only comments. **`impact` will report 0 callers for these whether or not callers exist** — the app lazy-loads pages, which produces no edge GitNexus records. Trust the grep.
- [ ] **Step 2:** `presets.ts` **stays** — only `PresetPanel.tsx` (the UI) goes.
- [ ] **Step 3:** Remove `'features/lifetime/EventFormSheet.tsx'` from the `NOT_NAVIGATION` set in `src/backLink.test.ts:28`.
- [ ] **Step 4:** Fix the now-dangling comment references in `FilterChip.tsx:53`, `KpiRow.tsx:97`, `SpendVsBudgetCard.tsx:12`, `money.ts:146`, `EditTransactionSheet.tsx:79`, `lifetimeRules.ts:111`, `AccountFormSheet.tsx:49`, `AssetGroupsPage.tsx:94` — they cite these files as precedent. Point them at the new file names rather than leaving references to files that no longer exist.
- [ ] **Step 5:** `npm test && npx tsc -b && npm run lint`. Commit.

### Task 17: Verification pass — the three things `npm test` cannot see

- [ ] **Step 1: Light mode.** The preview session defaults to Dark. Force Light and walk the whole console. Contrast measurement has three traps that produce convincing wrong numbers — and a hidden pane breaks the measurement outright (rAF stops, transitions freeze at 0). Keep the pane visible while measuring.
- [ ] **Step 2: 1.25× font size.** Settings → font size scales `rem`. Confirm the dock does not crush the plot, labels do not overflow blocks, and the width gate still behaves.
- [ ] **Step 3: JSX flattened into strings.** Run `grep -rn '="{[^"]*}"' src/`. Expected: no hits. This failure mode compiles cleanly, passes every test, and renders the literal text `{e.label}` on screen.
- [ ] **Step 4: Widths.** 1280 / 1920 / 2560, plus just below the gate.
- [ ] **Step 5: Full suite.** `npm test && npx tsc -b && npm run lint`.
- [ ] **Step 6: Scope check before committing.** `detect_changes({scope: "compare", base_ref: "master"})` per CLAUDE.md, to confirm only the expected symbols and flows moved.
- [ ] **Step 7:** Final commit.

---

## Self-Review

**Spec coverage.** §4 → Task 6. §5 → Task 7. §6 → Tasks 5, 10. §7 → Task 1. §8 → Tasks 9, 12 (+ the four unnamed greys, which get named as they are first needed — flagged in Global Constraints). §9 → Global Constraints. §10 → Tasks 7–16, including the two corrections (reuse `packRows`, add `curvePath`) as Tasks 12 and 2. §11 → Tasks 11–14. §12 → Task 9 Step 5, Task 10. §13 → Task 9 Step 2, Task 10 Steps 2 and 4, Task 5 Step 3. §14 → Global Constraints. §15 → Task 17. §16 → not implemented, by design.

**Known gap, stated rather than hidden:** the four unnamed greys (`#151a16`, `#171d18`, `#1b2a20`, `#39423a`) have no dedicated task. They must be named in `src/index.css` **with light-mode counterparts** by whichever task first needs them — Task 7 for the row tints, Task 12 for the muted border. Inlining them as hex will fail `designSystem.test.ts`.

**Type consistency.** `applySpanToPreset(presetId, s)` is defined in Task 3 and consumed in Task 13 under that name. `makeUndo` / `UNDO_WINDOW_MS` defined in Task 4, consumed in Task 14. `curvePath` defined in Task 2, consumed in Task 7. `packRows` is pre-existing, consumed in Task 12. `NewLifePhase.color`/`.icon` defined in Task 1, consumed in Task 9 Step 4. `<PlanDock sel>` uses `'none' | 'phase' | 'event'` in Tasks 8, 9, 10 consistently.

**One correction folded in:** Task 3's `untilAge` expectation must be reconciled with `syncEnd` before implementing — the step says so explicitly and gives the formula, because a mismatch there silently moves a milestone's end year.
