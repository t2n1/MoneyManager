# Ô chọn nhãn — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xếp lại khối chọn nhãn trong form Nhập theo đúng quy ước có sẵn của trang: mỗi nhóm một hàng, chip chưa chọn thì xám, cao 44px, và bỏ hết nút `+ mới` ở từng nhóm.

**Architecture:** Phần quyết định (số nhãn hiện sẵn, có mời tạo nhãn hay không) đẩy xuống `groups.ts` để kiểm thử bằng vitest — repo không có kiểm thử giao diện. `TagPicker.tsx` chỉ còn việc vẽ. Token chip dùng chung tách ra `components/chip.ts` để `TagPicker` không phải nhập ngược từ `TransactionForm`.

**Tech Stack:** React 19, TypeScript, Tailwind 4, vitest, lucide-react.

**Thiết kế:** `docs/superpowers/specs/2026-08-12-o-chon-nhan-theo-luat-trang-design.md`

## Global Constraints

- Chip và hàng bấm được: cao **44px** (`min-h-11`). Ô nhập chữ giữ nhỏ hơn, không đổi theo.
- Chữ tên nhóm và tiêu đề dùng token `text-xs font-medium text-fg-muted` (bằng `labelCls` của `roleFields.tsx:13`).
- Chip đã chọn phải có `border-transparent` — không được bỏ viền, sẽ làm chip nhảy chỗ.
- Không thêm cột DB, không migration.
- Không kẻ vạch (`border-t`) trong form Nhập.
- Kiểm bằng `npm run build`, không chỉ `tsc --noEmit`.
- Tám ca kiểm thử `pickerSections` hiện có **không được sửa một dòng nào**.
- Mọi chữ trên giao diện bằng tiếng Việt, giọng như phần còn lại của app.

---

### Task 1: `collapsedLimit` — số nhãn hiện sẵn theo số nhóm

**Files:**
- Modify: `src/features/tags/groups.ts`
- Test: `src/features/tags/groups.test.ts`

**Interfaces:**
- Consumes: không có.
- Produces: `collapsedLimit(groupCount: number): number`

- [ ] **Step 1: Viết test đỏ**

Thêm vào cuối `src/features/tags/groups.test.ts`:

```ts
describe('collapsedLimit', () => {
  it('2 nhóm trở xuống thì hiện sẵn 4 nhãn mỗi nhóm', () => {
    expect(collapsedLimit(0)).toBe(4)
    expect(collapsedLimit(1)).toBe(4)
    expect(collapsedLimit(2)).toBe(4)
  })

  it('3 nhóm trở lên thì hạ về 3 — mỗi nhóm thêm một hàng chip', () => {
    expect(collapsedLimit(3)).toBe(3)
    expect(collapsedLimit(9)).toBe(3)
  })
})
```

Sửa dòng import đầu file:

```ts
import { collapsedLimit, pickerSections, ungroupedQueue } from './groups'
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `npm test -- src/features/tags/groups.test.ts`
Expected: FAIL — `collapsedLimit is not a function` (hoặc lỗi biên dịch "has no exported member").

- [ ] **Step 3: Viết code tối thiểu**

Thêm vào `src/features/tags/groups.ts`, ngay dưới `isUngrouped`:

```ts
/**
 * Số nhãn hiện thẳng trong MỖI nhóm khi chưa bấm "Tất cả".
 *
 * Buộc vào số NHÓM chứ không phải số mục đang vẽ: `sections` là kết quả của
 * `pickerSections(…, limit)` nên dùng `sections.length` là vòng tròn.
 *
 * Số 3 của bản trước sinh ra khi mỗi mục còn ăn MỘT hàng tiêu đề riêng. Nay tiêu đề
 * nằm cùng hàng với chip nên chỗ đó dư ra, trả lại cho nhãn. Người dùng chốt chỉ dùng
 * 2 nhóm (`Ai?`, `Ở đâu?`), nên nhánh `<= 2` là nhánh chạy thật.
 *
 * Đánh đổi đã biết: mục "Khác" tự xuất hiện (khôi phục sao lưu lệch, nhãn trỏ tới nhóm
 * đã xoá) thì có 3 mục mà limit vẫn 4. Ca hiếm; đo lại rồi hạ nếu vượt ngưỡng.
 */
export function collapsedLimit(groupCount: number): number {
  return groupCount <= 2 ? 4 : 3
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `npm test -- src/features/tags/groups.test.ts`
Expected: PASS, toàn bộ file xanh (kể cả 8 ca `pickerSections` cũ).

- [ ] **Step 5: Commit**

```bash
git add src/features/tags/groups.ts src/features/tags/groups.test.ts
git commit -m "feat(nhan): so nhan hien san theo so nhom"
```

---

### Task 2: `createTargets` — có mời tạo nhãn hay không, và tạo vào nhóm nào

**Files:**
- Modify: `src/features/tags/groups.ts`
- Test: `src/features/tags/groups.test.ts`

**Interfaces:**
- Consumes: `TagSection` (đã có trong `groups.ts`), `pickerSections`.
- Produces: `interface CreateTarget { group: TagGroupRow | null }` và `createTargets(tags: TagRow[], sections: TagSection[], query: string): CreateTarget[]`

- [ ] **Step 1: Viết test đỏ**

Thêm vào cuối `src/features/tags/groups.test.ts`:

```ts
describe('createTargets', () => {
  const sections = (tags: TagRow[], groups: TagGroupRow[]) =>
    pickerSections(tags, groups, [], [], 4)

  it('chưa gõ gì thì không mời tạo', () => {
    const tags = [tag('t1', 'Tokyo', { group_id: WHERE.id })]
    expect(createTargets(tags, sections(tags, [WHO, WHERE]), '')).toEqual([])
  })

  it('gõ toàn dấu cách cũng không mời tạo', () => {
    const tags = [tag('t1', 'Tokyo', { group_id: WHERE.id })]
    expect(createTargets(tags, sections(tags, [WHO, WHERE]), '   ')).toEqual([])
  })

  it('trùng tên hẳn thì không mời tạo — chọn nhãn có sẵn', () => {
    const tags = [tag('t1', 'Tokyo', { group_id: WHERE.id })]
    expect(createTargets(tags, sections(tags, [WHO, WHERE]), 'tokyo')).toEqual([])
  })

  it('trùng tên hẳn với nhãn ĐÃ LƯU TRỮ cũng không mời tạo', () => {
    const tags = [tag('t1', 'Tokyo', { group_id: WHERE.id, is_archived: true })]
    expect(createTargets(tags, sections(tags, [WHO, WHERE]), 'Tokyo')).toEqual([])
  })

  it('bỏ dấu cách đầu cuối trước khi so tên', () => {
    const tags = [tag('t1', 'Tokyo', { group_id: WHERE.id })]
    expect(createTargets(tags, sections(tags, [WHO, WHERE]), '  Tokyo  ')).toEqual([])
  })

  it('trùng một phần thì mời tạo ở MỌI nhóm thật', () => {
    const tags = [tag('t1', 'Tokyo', { group_id: WHERE.id })]
    const out = createTargets(tags, sections(tags, [WHO, WHERE]), 'Tok')
    expect(out.map((x) => x.group?.name)).toEqual(['Với ai?', 'Ở đâu?'])
  })

  it('có mục Khác thì thêm một chỗ tạo không nhóm', () => {
    const tags = [tag('t1', 'Về VN 2026')]
    const out = createTargets(tags, sections(tags, [WHO, WHERE]), 'Cả nhà')
    expect(out.map((x) => x.group?.name ?? null)).toEqual(['Với ai?', 'Ở đâu?', null])
  })

  it('không có mục Khác thì không mời tạo vào Khác', () => {
    const tags = [tag('t1', 'Tokyo', { group_id: WHERE.id })]
    const out = createTargets(tags, sections(tags, [WHO, WHERE]), 'Cả nhà')
    expect(out.every((x) => x.group !== null)).toBe(true)
  })

  it('chưa có nhóm nào thì vẫn phải có một chỗ tạo, không thì thành ngõ cụt', () => {
    expect(createTargets([], [], 'Cả nhà')).toEqual([{ group: null }])
  })
})
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `npm test -- src/features/tags/groups.test.ts`
Expected: FAIL — `createTargets` chưa tồn tại.

- [ ] **Step 3: Viết code tối thiểu**

Thêm vào cuối `src/features/tags/groups.ts`:

```ts
/** Một chỗ có thể tạo nhãn mới vào. `group: null` = mục "Khác". */
export interface CreateTarget {
  group: TagGroupRow | null
}

/**
 * Gõ một tên chưa có trong ô tìm thì mỗi nhóm hiện một chip "＋ Tạo …", để người dùng
 * chọn luôn chỗ đặt. Đây là đường tạo nhãn duy nhất sau khi bỏ nút "+ mới" ở từng nhóm.
 *
 * Trùng tên HẲN thì trả rỗng: lúc đó việc đúng là chọn nhãn có sẵn, không tạo cái thứ
 * hai cùng tên. Xét cả nhãn đã lưu trữ, vì gõ trùng tên nhãn lưu trữ sẽ làm nó SỐNG LẠI
 * (xem `addTag` trong TagPicker) — mời tạo ở đó là mời tạo một thứ không tạo được.
 *
 * Mục "Khác" chỉ được mời khi nó ĐANG tồn tại. Không tự mọc mục Khác ra để mời gửi nhãn
 * mới vào: chốt 2026-08-08 là nhãn tạo lúc nhập phải sinh ra đã có nhóm. Ngoại lệ duy
 * nhất là chưa có nhóm nào — không mời gì thì thành ngõ cụt, không tạo được nhãn.
 */
export function createTargets(
  tags: TagRow[],
  sections: TagSection[],
  query: string,
): CreateTarget[] {
  const name = query.trim()
  if (!name) return []
  const lower = name.toLowerCase()
  if (tags.some((t) => t.name.toLowerCase() === lower)) return []

  const out: CreateTarget[] = []
  for (const s of sections) if (s.group) out.push({ group: s.group })
  if (out.length === 0) return [{ group: null }]
  if (sections.some((s) => !s.group)) out.push({ group: null })
  return out
}
```

Thêm `createTargets` vào dòng import của file test:

```ts
import { collapsedLimit, createTargets, pickerSections, ungroupedQueue } from './groups'
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `npm test -- src/features/tags/groups.test.ts`
Expected: PASS toàn bộ file.

- [ ] **Step 5: Commit**

```bash
git add src/features/tags/groups.ts src/features/tags/groups.test.ts
git commit -m "feat(nhan): tinh cho tao nhan moi tu o tim"
```

---

### Task 3: Tách token chip ra chỗ dùng chung

**Files:**
- Create: `src/components/chip.ts`
- Modify: `src/features/transactions/TransactionForm.tsx:216-221`

**Interfaces:**
- Produces: `CHIP_BASE: string`, `CHIP_OFF: string` xuất từ `src/components/chip.ts`.

Không có kiểm thử: đây là hai chuỗi hằng số, `npm run build` là phép kiểm đúng cho việc di chuyển.

- [ ] **Step 1: Tạo file mới**

`src/components/chip.ts`:

```ts
// Token cho chip trong form Nhập. Tách khỏi TransactionForm.tsx vì TagPicker cũng cần
// CHIP_OFF, mà TransactionForm đã `import TagPicker` — nhập ngược lại là vòng tròn.
//
// Chép tay sang TagPicker thì sớm muộn một bên đổi màu/độ cao mà bên kia không đổi, rồi
// hai chip cạnh nhau trong cùng một form nhìn khác nhau.

/** Nền chung của chip hình chữ nhật (Nhắc sau, Lặp lại). Cao 44px. */
export const CHIP_BASE =
  'flex min-h-11 shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-sm transition active:scale-95'

/** Trạng thái TẮT / chưa chọn: xám trung tính. Bật thì mới lên màu. */
export const CHIP_OFF = 'border-border-strong bg-surface text-fg-muted'
```

- [ ] **Step 2: Xoá bản cũ trong TransactionForm, nhập từ file mới**

Trong `src/features/transactions/TransactionForm.tsx`, xoá khối này (dòng 216–221):

```ts
const CHIP_BASE =
  'flex min-h-11 shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-sm transition active:scale-95'
// Token chứ không viết lại cặp sáng/tối bằng tay (từ nhánh fix/toan-bo-audit). Master
// đã gom về một hằng số nên đổi ở đây là đủ, khỏi sửa từng chip như bản trên nhánh.
const CHIP_OFF = 'border-border-strong bg-surface text-fg-muted'
```

Giữ nguyên chú thích ngay trên nó (đoạn nói vì sao gom hai nút vào một hằng số) rồi thêm
dòng nhập vào cụm import ở đầu file:

```ts
import { CHIP_BASE, CHIP_OFF } from '../../components/chip'
```

- [ ] **Step 3: Kiểm biên dịch**

Run: `npm run build`
Expected: build xanh, không có lỗi "Cannot find name 'CHIP_BASE'".

- [ ] **Step 4: Commit**

```bash
git add src/components/chip.ts src/features/transactions/TransactionForm.tsx
git commit -m "refactor(nhap): tach token chip ra components/chip.ts"
```

---

### Task 4: Vẽ lại `TagPicker`

**Files:**
- Modify: `src/features/tags/TagPicker.tsx` (viết lại phần render và state)

**Interfaces:**
- Consumes: `collapsedLimit(groupCount)`, `createTargets(tags, sections, query)`, `CreateTarget`, `CHIP_OFF`, `pickerSections`, `TAG_CHIP_CLASS`, `tagColor`, `normalizeText`.
- Produces: không có (component lá).

Không có kiểm thử tự động — repo không có kiểm thử giao diện. Nghiệm thu bằng Task 5.

- [ ] **Step 1: Đổi state và phần tính**

Bỏ hai state `addingIn` và `draft`; thêm `openMode` và `rootRef`:

```tsx
const [expanded, setExpanded] = useState(false)
const [query, setQuery] = useState('')
/** 'create' = mở bằng nút "Thêm nhãn" → ô nhập tự bật con trỏ. */
const [openMode, setOpenMode] = useState<'browse' | 'create'>('browse')
const rootRef = useRef<HTMLDivElement>(null)
const uid = useId()

const limit = collapsedLimit(groups.length)
const sections = useMemo(
  () => pickerSections(tags, groups, links, value, limit),
  [tags, groups, links, value, limit],
)
const total = sections.reduce((n, s) => n + s.shown.length + s.rest.length, 0)
const hasRest = sections.some((s) => s.rest.length > 0)

const targets = useMemo(() => createTargets(tags, sections, query), [tags, sections, query])
const creating = targets.length > 0
// Ô nhập có hai vai: tìm (khi nhãn nhiều đến mức mắt không lướt kịp) và nhập tên nhãn
// mới. Ngưỡng 6: "Tìm trong 5 nhãn…" là ô vô nghĩa chiếm 36px.
const inputShown = expanded && (total > 6 || openMode === 'create')
```

Cập nhật import ở đầu file:

```tsx
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Search, Tag as TagIcon } from 'lucide-react'
import { CHIP_OFF } from '../../components/chip'
import { collapsedLimit, createTargets, pickerSections } from './groups'
```

- [ ] **Step 2: Lọc section cho chế độ tạo + cuộn khối vào giữa màn**

```tsx
const needle = normalizeText(query)
const visible = useMemo(
  () =>
    sections
      .map((s) => {
        const all = expanded ? [...s.shown, ...s.rest] : s.shown
        return {
          ...s,
          list: needle ? all.filter((t) => normalizeText(t.name).includes(needle)) : all,
        }
      })
      // Đang mời tạo thì GIỮ cả mục không có nhãn nào khớp — ẩn đi là mất luôn đường
      // tạo nhãn vào mục đó.
      .filter((s) => creating || !needle || s.list.length > 0),
  [sections, expanded, needle, creating],
)

// Chưa có nhóm nào: `sections` rỗng nên không có hàng nào để vẽ chip tạo vào. Vẽ một
// hàng ảo "Khác", không thì đúng lúc đó app không tạo được nhãn nào.
const rows = creating && sections.length === 0 ? [{ group: null, shown: [], rest: [], list: [] }] : visible

// Bàn phím hệ thống bật lên che chip tạo nằm ngay dưới ô nhập, mà khối này ở gần đáy
// vùng cuộn của form.
useEffect(() => {
  if (expanded && openMode === 'create') rootRef.current?.scrollIntoView({ block: 'center' })
}, [expanded, openMode])
```

- [ ] **Step 3: Viết lại `addTag`**

```tsx
async function addTag(groupId: string | null, rawName: string) {
  const name = rawName.trim()
  if (!name) return
  // Gõ đúng tên nhãn đã có thì chọn luôn thay vì báo lỗi trùng. `createTargets` đã chặn
  // ca này nên đây là lưới an toàn cho ca đua (máy khác vừa tạo nhãn cùng tên).
  const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase())
  if (existing) {
    if (existing.is_archived) updateTag.mutate({ id: existing.id, patch: { is_archived: false } })
    if (!selected.has(existing.id)) onChange([...value, existing.id])
  } else {
    // Xoay vòng bảng màu theo số nhãn hiện có để các nhãn không trùng màu nhau
    const palette = ['sky', 'green', 'amber', 'pink', 'indigo', 'red', 'gray']
    // try/catch: tạo hỏng (trùng tên trên DB, offline) thì GIỮ chữ vừa gõ + giữ khối
    // đang mở để sửa lại. `return` TRƯỚC khi dọn query ở dưới — đó mới là chỗ giữ lại.
    let created
    try {
      created = await createTag.mutateAsync({
        name,
        color: palette[tags.length % palette.length],
        group_id: groupId,
      })
    } catch {
      return
    }
    onChange([...value, created.id])
  }
  setQuery('')
  setExpanded(false)
}
```

- [ ] **Step 4: Viết lại `chip` và thêm `createChip`**

```tsx
// `truncate` KHÔNG đặt ở đây mà ở <span> con: trên một hộp `inline-flex` thì
// text-overflow không cắt chữ của con, tên nhãn dài sẽ tràn ra thay vì hiện "…".
const CHIP =
  'inline-flex min-h-11 max-w-full items-center rounded-full border px-3.5 text-sm transition active:scale-95'

const chip = (t: TagRow) => {
  const on = selected.has(t.id)
  return (
    <button
      key={t.id}
      type="button"
      onClick={() => toggle(t.id)}
      aria-pressed={on}
      // `border-transparent` chứ không bỏ viền: bỏ hẳn thì chip đã chọn hẹp hơn 2px và
      // bấm một chip sẽ đẩy các chip sau nó nhảy chỗ. CategoryTile cũng làm cách này.
      className={`${CHIP} ${
        on
          ? `border-transparent font-medium ${TAG_CHIP_CLASS[tagColor(t.color)]}`
          : CHIP_OFF
      }`}
    >
      <span className="truncate">{t.name}</span>
    </button>
  )
}
```

- [ ] **Step 5: Viết lại phần return**

```tsx
return (
  <div ref={rootRef}>
    {/* <span> chứ không <label>: đây là tiêu đề cho CẢ khối, không có một ô nào để
        `htmlFor` trỏ vào. Cỡ chữ theo `labelCls` của roleFields — app đã có token đó
        cho nhãn của một nhóm chip, không tự nghĩ ra cỡ mới. */}
    <span className="mb-1 flex items-center gap-1 text-xs font-medium text-fg-muted">
      <TagIcon className="h-3.5 w-3.5" aria-hidden />
      Nhãn <span className="font-normal">(tùy chọn)</span>
    </span>

    {inputShown && (
      <div className="mb-1.5 flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2 focus-within:ring-2 focus-within:ring-green-500">
        {openMode === 'create' ? (
          <Plus className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden />
        ) : (
          <Search className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden />
        )}
        {/* Tự bật con trỏ CHỈ ở chế độ tạo: mở "Tất cả" để LƯỚT là chuyện thường, bàn
            phím tự bật lên che mất danh sách vừa mở thì hại hơn lợi. */}
        <input
          autoFocus={openMode === 'create'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={openMode === 'create' ? 'Tên nhãn mới…' : `Tìm trong ${total} nhãn…`}
          aria-label={openMode === 'create' ? 'Tên nhãn mới' : 'Tìm nhãn'}
          className="min-h-9 min-w-0 flex-1 bg-transparent py-1 text-sm outline-none"
        />
      </div>
    )}

    {/* Mở rộng thì cho cả khối cuộn riêng, đừng đẩy dài vô hạn vùng cuộn của form */}
    <div className={`flex flex-col gap-1.5 ${expanded ? 'max-h-56 overflow-y-auto' : ''}`}>
      {rows.map((s) => {
        const groupId = s.group?.id ?? ''
        const target = targets.find((x) => (x.group?.id ?? '') === groupId)
        const name = s.group?.name ?? 'Khác'
        const labelId = `${uid}-${s.group?.id ?? 'other'}`
        const empty = s.list.length === 0 && !target
        return (
          <div key={labelId} role="group" aria-labelledby={labelId} className="flex items-start gap-2">
            {/* Cao bằng hàng đầu, không thì chữ lệch so với chip */}
            <span
              id={labelId}
              title={name}
              className={`flex w-16 shrink-0 items-center text-xs font-medium text-fg-muted ${
                empty ? 'h-7' : 'h-11'
              }`}
            >
              <span className="truncate">{name}</span>
            </span>
            {empty ? (
              <span className="flex h-7 items-center text-xs text-fg-muted">chưa có nhãn</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {s.list.map(chip)}
                {target && (
                  <button
                    type="button"
                    onClick={() => void addTag(target.group?.id ?? null, query)}
                    className={`${CHIP} border-dashed border-border-strong text-green-700 dark:text-green-400`}
                  >
                    <Plus className="mr-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">Tạo “{query.trim()}”</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {needle && !creating && visible.length === 0 && (
        <p className="py-1 text-xs text-fg-muted">Không có nhãn nào khớp “{query}”</p>
      )}
    </div>

    {/* Hàng đáy: mở/thu gọn + tạo nhãn. Nút tạo buộc vào "ô nhập đang ẩn" nên LUÔN có
        đúng một đường tạo nhãn nhìn thấy được — không dư, không ngõ cụt. */}
    <div className="mt-1 flex items-center gap-3">
      {(hasRest || expanded) && (
        <button
          type="button"
          onClick={() => {
            setExpanded((e) => !e)
            setOpenMode('browse')
            setQuery('')
          }}
          aria-expanded={expanded}
          className="inline-flex min-h-9 items-center gap-0.5 text-xs font-medium text-green-700 dark:text-green-400"
        >
          {expanded ? (
            <>
              Thu gọn <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            </>
          ) : (
            <>
              Tất cả ({total}) <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </>
          )}
        </button>
      )}
      {!inputShown && (
        <button
          type="button"
          onClick={() => {
            setExpanded(true)
            setOpenMode('create')
            setQuery('')
          }}
          className="inline-flex min-h-9 items-center gap-0.5 text-xs font-medium text-green-700 dark:text-green-400"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Thêm nhãn
        </button>
      )}
    </div>
  </div>
)
```

- [ ] **Step 6: Sửa chú thích đầu file cho khớp**

Đoạn chú thích đầu `TagPicker.tsx` đang nói "mỗi nhóm … một hàng chip riêng" và mô tả
`COLLAPSED_LIMIT` là hằng số. Viết lại cho đúng: tên nhóm nằm CÙNG hàng với chip, số
nhãn hiện sẵn do `collapsedLimit` quyết theo số nhóm, và xoá cả khối chú thích của
`const COLLAPSED_LIMIT` (hằng số đó không còn).

- [ ] **Step 7: Kiểm biên dịch và kiểm thử**

Run: `npm run build`
Expected: build xanh.

Run: `npm test`
Expected: toàn bộ xanh.

- [ ] **Step 8: Commit**

```bash
git add src/features/tags/TagPicker.tsx
git commit -m "feat(nhan): moi nhom mot hang, chip chua chon thi xam"
```

---

### Task 5: Nới ô "hoàn tiền" và nghiệm thu trên máy ảo 375×812

**Files:**
- Modify: `src/features/transactions/TransactionForm.tsx:1272` (thẻ `<label>` của ô hoàn tiền)

- [ ] **Step 1: Nới khoảng cách**

Thêm `mt-1.5` vào class của `<label>` ô hoàn tiền (cột cuộn đã có `gap-1.5` → thành 12px
thay vì 6px). **Không** thêm `border-t`.

```tsx
<label className="mt-1.5 flex items-start gap-2 px-1 text-sm text-fg-secondary">
```

- [ ] **Step 2: Mở app ở chế độ demo, màn 375×812**

Dùng `preview_start` với cấu hình `dev` trong `.claude/launch.json`, `resize_window`
preset `mobile`, rồi vào trang Nhập ở chế độ demo (không cần Supabase thật).

- [ ] **Step 3: Đo và soát bằng mắt**

Đo chiều cao khối Nhãn bằng `javascript_tool`:

```js
document.querySelector('[role="group"]')?.closest('div')?.parentElement?.getBoundingClientRect().height
```

Soát đủ 6 điểm:
1. Mỗi nhóm đúng **một** hàng; không còn nút `+ mới` nào.
2. Chip chưa chọn xám, bấm vào lên màu. Bấm mà **các chip khác không nhảy chỗ**.
3. Nhãn màu **xám** (`color: 'gray'`): chọn và chưa chọn có phân biệt được không, ở CẢ nền sáng và nền tối. Không phân biệt được thì đổi nền của nhãn xám cho đậm hơn — **không** quay lại dùng viền `ring` cho riêng nó.
4. Bấm `＋ Thêm nhãn` → ô nhập bật con trỏ, gõ tên chưa có → mỗi nhóm hiện một chip `Tạo "…"`. Bấm một chip → nhãn mới hiện thành chip đã chọn trong đúng nhóm đó, khối thu gọn lại.
5. Ô "hoàn tiền" tách khỏi khối nhãn, không có vạch kẻ.
6. Chiều cao khối ≤ 260px. Vượt thì hạ nhánh `<= 2` của `collapsedLimit` từ 4 xuống 3 và đo lại.

- [ ] **Step 4: Chụp ảnh và commit**

```bash
git add src/features/transactions/TransactionForm.tsx
git commit -m "fix(nhap): noi khoang cach o hoan tien khoi khoi nhan"
```

- [ ] **Step 5: Đo lại bằng dữ liệu THẬT**

Số nhãn ở localhost khác bản chạy thật, mà chính nó quyết định chiều cao. Mở bản thật,
vào trang Nhập, đo lại điểm 6 ở trên. Đây là bước **không bỏ được** — mọi con số ước
trong bản thiết kế đều từ dữ liệu localhost.

Nhân lúc mở bản thật: đọc tên hai nhóm. Cả hai tên ≤ 6 ký tự thì hạ `w-16` → `w-14`,
trả 8px cho chip.
