# Dựng lại màn Nhập giao dịch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay trục `Chi · Thu · Chuyển khoản` + dropdown "Đặc biệt" bằng trục `tiền ra · tiền vào · đổi chỗ` với hàng chip 10 dạng, để mọi loại giao dịch nằm cùng một cấp và một quy tắc.

**Architecture:** `kind: EntryKind` thành state duy nhất của form. Một module thuần `entryShape.ts` giữ bảng 10 dòng; `type` / `role` / `roleSeed` thành giá trị **dẫn xuất lúc lưu**. Form chỉ đọc bảng. Không migration — 10 dạng đều dẫn về bút toán đã có.

**Tech Stack:** React 19 · TypeScript · Tailwind v4 (token qua CSS variable) · TanStack Query · Vitest · Supabase

**Spec:** [`docs/superpowers/specs/2026-08-19-nhap-giao-dich-design.md`](../specs/2026-08-19-nhap-giao-dich-design.md)

## Global Constraints

Áp cho **mọi** task. Không nhắc lại trong từng task.

- **Không migration, không cột mới.** `is_reminder` / `reminder_name` / `due_date` / `recurring` / `recur_every` là tên gói bàn giao đặt sai — **không có trong code**. Schema thật đã đủ.
- **Không chạm ba file:** `recurring/monthlyLoad.ts` · `planned/planned.ts` · `debts/aggregate.ts`. Cả ba có quyết định thu hẹp kèm lý do viết sẵn.
- **Mốc test: 2476 test / 155 file xanh.** Mọi task phải về lại con số này hoặc cao hơn. Chạy `npx vitest run`.
- ⚠️ **Repo KHÔNG test component.** Đo được: **0 file `*.test.tsx`**, 136 file `*.test.ts`; `package.json` **không có** `@testing-library/react` / `jsdom` / `happy-dom`; `vite.config.ts` **không đặt** `test.environment`. Nếp là **test hàm thuần, không render**.
  → **Không thêm hạ tầng test mới trong plan này.** Cách làm: đẩy **mọi quyết định** ra module thuần rồi test module đó (đây chính là lý do thiết kế có 5 module thuần); phần JSX còn lại chỉ là bày, và được kiểm bằng **đo trên trình duyệt** với script + kỳ vọng ghi rõ trong task. Đo trên demo bắt được thật: dải tràn 227px, ô segmented 42px, lưới 3 cột tốn hơn 4 cột 64px.
  → **Không viết test dùng `render` / `screen` / `userEvent`** — nó sẽ không chạy.
  → Kiểm chuỗi thì dùng **test đọc file** (`readFileSync` + regex), chạy được trong vitest mà không cần DOM.
- **Vùng chạm 44px** cho mọi control của màn này. Chip Dạng 32px là miễn trừ có chủ ý (lựa chọn cấp hai, luôn có ít nhất một chip bật).
- **Mọi chip `white-space: nowrap`; hàng chip `flex-wrap: wrap`.** Áp cho cả mọi dòng meta. Thiếu là nhãn vỡ giữa từ khi bật Cỡ chữ lớn.
- **Đơn vị theo `rem`, không `px`**, để `--app-font-scale` (Cài đặt → Cỡ chữ) co giãn được.
- **Không `opacity-*` cho trạng thái vô hiệu** — đổi màu chữ bằng token. Không có ngoại lệ contrast cho control vô hiệu.
- **Không dùng unicode/emoji làm icon** trong code mới; dùng `lucide-react`. Emoji **của danh mục** là dữ liệu người dùng → giữ nguyên.
- **Không `shadow-*`** (bản 1a bỏ hẳn bóng). Viền nhấn dùng `outline`, không `ring`.
- **Ba chuỗi đã chết, không dùng lại:** "Khoản sắp tới" · "Tạo lời nhắc · …" · "Tên lời nhắc". Chữ "nhắc" chỉ được xuất hiện ở **đúng một chỗ**: ô tích "Nhắc tôi" và dòng phụ của nó.
- **Không đổi luồng, không đổi thứ tự field, không biến form thành modal desktop.**
- Commit message tiếng Việt **không dấu**, theo nếp repo (`feat(nhap): …`).

### Một chỗ plan đổi tên so với spec

Spec ghi `kind: 'move'` cho dạng "Giữa ví của tôi". Plan dùng **`between`** — vì `'move'` cũng là một giá trị của `Direction`, để trùng chữ thì đọc `shape.kind === 'move' && shape.direction === 'move'` nhức mắt và dễ gõ sai chỗ. Mọi chỗ khác giữ đúng tên spec.

---

## File Structure

**Mới — bốn module thuần (test không cần render) + ba component:**

| File | Trách nhiệm |
| --- | --- |
| `src/features/transactions/entryShape.ts` | Bảng 10 dạng. Nguồn duy nhất của: dạng nào có danh mục, dạng nào vào trần, nhãn ô tiền, dẫn xuất ra `(role, txType)`. |
| `src/features/transactions/categoryAlert.ts` | Câu cảnh báo trần cho **một** danh mục vừa chọn. Biết phân biệt `full` vs `myShare`. |
| `src/features/transactions/recentCategories.ts` | 3 danh mục dùng nhiều nhất, trả về cả nhóm cha và danh mục con. |
| `src/features/transactions/remitDerive.ts` | Suy số VND từ tỷ giá. |
| `src/features/transactions/plannedFromEntry.ts` | Dựng `NewPlannedExpense` từ state form, kể cả neo `'month'` về ngày 1. |
| `src/features/transactions/DirectionTabs.tsx` | Segmented hướng + hàng chip Dạng. |
| `src/features/transactions/CategoryRow.tsx` | Hàng "Gần đây" + chip `Khác ⌄` + lưới bung tại chỗ. |
| `src/features/transactions/PlannedFields.tsx` | Các ô của chế độ "Sẽ chi", khớp `PlannedFormSheet`. |
| `src/features/transactions/DebtPickerField.tsx` | Hộp chọn khoản nợ đang mở, cho `repay`/`collect`. |

**Sửa:**

| File | Việc |
| --- | --- |
| `TransactionForm.tsx` | Bỏ `TYPE_TABS`/`DEBT_TABS`/`REMIT_TABS`/`ROLE_META`/`roleTrigger`/`REPEAT_*`. Đọc `entryShape`. |
| `EntryPage.tsx` | Bỏ dải `overCount`, bỏ `roleSlot`, bỏ `onSubmitRecurring` + `catchUp`. |
| `entryValidation.ts` | `EntryState.role` → `EntryState.kind`. |
| `roleSave.ts` | `RoleBase` thêm `tagIds`; thêm `saveDebtPayment`. |
| `entryRoles.ts` | Xóa `roleTxType`/`roleAmountLabel`/`roleHidesCategoryGrid` (chuyển sang `entryShape`). Giữ các `interface` + `initial*`. |
| `roleFields.tsx` | Nhãn counterparty theo dạng; `RemitFields` dùng `remitDerive`. |
| `src/index.css` | `--accent-muted-fg` ở dark: `#6b8f78` → `#7fae8e`. |
| `ui/SegmentedControl.tsx` | Thêm `size: 'lg'`. **Không sửa `md`** — 11 file khác đang dùng. |

---

# PR 1 — nền: bảng 10 dạng, không đổi UI

## Task 1: `entryShape.ts` — bảng 10 dạng

Bảng B23 thành một file test chạy xanh **trước khi** ai chạm vào JSX. Bảng sai thì sai lúc còn rẻ.

**Files:**
- Create: `src/features/transactions/entryShape.ts`
- Test: `src/features/transactions/entryShape.test.ts`

**Interfaces:**
- Consumes: `EntryRole` từ `./entryRoles`; `TransactionType`, `DebtDirection` từ `../../types/database.types`
- Produces:
  - `type Direction = 'out' | 'in' | 'move'`
  - `type EntryKind = 'spend'|'split'|'family'|'lend'|'repay'|'earn'|'collect'|'borrow'|'between'|'ownvn'`
  - `type CategoryPicker = 'user' | 'auto' | 'none'`
  - `type CapBase = 'full' | 'myShare' | 'none'`
  - `interface EntryShape` (xem code)
  - `const SHAPES: Record<EntryKind, EntryShape>`
  - `shapeOf(kind: EntryKind): EntryShape`
  - `kindsOf(direction: Direction): EntryKind[]`
  - `directionOf(kind: EntryKind): Direction`
  - `categoryPickerOf(kind: EntryKind, withTransaction: boolean): CategoryPicker`
  - `DIRECTION_LABEL: Record<Direction, string>`

- [ ] **Step 1: Viết test thất bại**

```ts
// src/features/transactions/entryShape.test.ts
import { describe, expect, it } from 'vitest'
import {
  SHAPES, shapeOf, kindsOf, directionOf, categoryPickerOf,
  type EntryKind,
} from './entryShape'

/**
 * Bảng này ĐỌC Y NHƯ bảng trong spec §"Mô hình". Sửa spec thì sửa đây, và
 * ngược lại — đó là điểm của việc tách file thuần ra.
 */
const B23: [EntryKind, string, string, string, string][] = [
  // kind,      direction, categoryPicker, capBase,   amountLabel
  ['spend',     'out',     'user',         'full',    'Số tiền'],
  ['split',     'out',     'user',         'myShare', 'Tổng đã trả'],
  ['family',    'out',     'auto',         'full',    'Số gửi'],
  ['lend',      'out',     'auto',         'none',    'Số tiền gốc'],
  ['repay',     'out',     'auto',         'none',    'Số trả'],
  ['earn',      'in',      'user',         'none',    'Số tiền'],
  ['collect',   'in',      'auto',         'none',    'Số nhận lại'],
  ['borrow',    'in',      'auto',         'none',    'Số tiền gốc'],
  ['between',   'move',    'none',         'none',    'Chuyển đi'],
  ['ownvn',     'move',    'none',         'none',    'Số gửi'],
]

describe('bang 10 dang khop spec B23', () => {
  it('co dung 10 dang, khong hon khong kem', () => {
    expect(Object.keys(SHAPES)).toHaveLength(10)
  })

  it.each(B23)('%s: huong/danh muc/tran/nhan o tien', (kind, dir, pick, cap, label) => {
    const s = shapeOf(kind)
    expect(s.direction).toBe(dir)
    expect(s.categoryPicker).toBe(pick)
    expect(s.capBase).toBe(cap)
    expect(s.amountLabel).toBe(label)
  })

  it('kindsOf tra ve dung thu tu chip cua tung huong', () => {
    expect(kindsOf('out')).toEqual(['spend', 'split', 'family', 'lend', 'repay'])
    expect(kindsOf('in')).toEqual(['earn', 'collect', 'borrow'])
    expect(kindsOf('move')).toEqual(['between', 'ownvn'])
  })

  it('moi dang thuoc dung mot huong', () => {
    const all = (['out', 'in', 'move'] as const).flatMap((d) => kindsOf(d))
    expect(new Set(all).size).toBe(10)
    for (const k of all) expect(kindsOf(directionOf(k))).toContain(k)
  })
})

describe('dan xuat ra but toan cu', () => {
  it('tam dang di qua createTransaction, hai dang di qua createDebtPayment', () => {
    const tx = Object.values(SHAPES).filter((s) => s.writes === 'transaction')
    const dp = Object.values(SHAPES).filter((s) => s.writes === 'debtPayment')
    expect(tx).toHaveLength(8)
    expect(dp.map((s) => s.kind).sort()).toEqual(['collect', 'repay'])
  })

  it('gui gia dinh la CHI (roi khoi tai san), tai khoan VN la CHUYEN KHOAN', () => {
    expect(shapeOf('family').txType).toBe('expense')
    expect(shapeOf('family').roleSeed).toEqual({ role: 'remit', remitKind: 'expense' })
    expect(shapeOf('ownvn').txType).toBe('transfer')
    expect(shapeOf('ownvn').roleSeed).toEqual({ role: 'remit', remitKind: 'transfer' })
  })

  it('minh vay duoc la TIEN VAO du no tang', () => {
    expect(shapeOf('borrow').txType).toBe('income')
    expect(shapeOf('borrow').roleSeed).toEqual({ role: 'debt', debtDirection: 'i_owe' })
  })

  it('cho vay la tien ra', () => {
    expect(shapeOf('lend').txType).toBe('expense')
    expect(shapeOf('lend').roleSeed).toEqual({ role: 'debt', debtDirection: 'owed_to_me' })
  })

  it('repay/collect khong khai txType — suy tu chieu khoan no da chon', () => {
    expect(shapeOf('repay').txType).toBeNull()
    expect(shapeOf('collect').txType).toBeNull()
  })
})

describe('categoryPickerOf phu thuoc withTransaction', () => {
  it('lend/borrow tat withTransaction thi khong co giao dich nen khong co danh muc', () => {
    expect(categoryPickerOf('lend', true)).toBe('auto')
    expect(categoryPickerOf('lend', false)).toBe('none')
    expect(categoryPickerOf('borrow', true)).toBe('auto')
    expect(categoryPickerOf('borrow', false)).toBe('none')
  })

  it('cac dang khac khong doi theo withTransaction', () => {
    for (const k of ['spend', 'split', 'family', 'earn', 'between', 'ownvn'] as EntryKind[]) {
      expect(categoryPickerOf(k, false)).toBe(shapeOf(k).categoryPicker)
    }
  })
})

describe('hai dang gui ve VN phai noi ro he qua', () => {
  it('chi hai dang do co chu phu, va chu phu noi ve tai san', () => {
    const withHint = Object.values(SHAPES).filter((s) => s.hint)
    expect(withHint.map((s) => s.kind).sort()).toEqual(['family', 'ownvn'])
    expect(shapeOf('family').hint).toContain('chi tiêu')
    expect(shapeOf('ownvn').hint).toContain('không phải chi tiêu')
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó thất bại**

Run: `npx vitest run src/features/transactions/entryShape.test.ts`
Expected: FAIL — `Failed to resolve import "./entryShape"`

- [ ] **Step 3: Viết `entryShape.ts`**

```ts
// src/features/transactions/entryShape.ts
import type { DebtDirection, TransactionType } from '../../types/database.types'
import type { EntryRole } from './entryRoles'

/**
 * Trục của màn Nhập: tiền ra · tiền vào · đổi chỗ.
 *
 * KHÔNG phải Chi · Thu · Chuyển khoản. Trục cũ vỡ ở hai chỗ: "gửi cho gia đình"
 * bị xếp vào Chuyển khoản dù tiền RỜI KHỎI tài sản (chuyển khoản là tiền vẫn còn
 * của bạn, chỉ đổi chỗ), và "mình nợ" bị xếp vào Chuyển khoản dù số dư TĂNG.
 */
export type Direction = 'out' | 'in' | 'move'

export const DIRECTION_LABEL: Record<Direction, string> = {
  out: 'Tiền ra',
  in: 'Tiền vào',
  move: 'Đổi chỗ',
}

/**
 * Mười dạng giao dịch. `between` chứ không `move` để tên dạng không trùng chữ với
 * một giá trị của Direction — đọc `kind === 'move' && direction === 'move'` thì
 * không ai biết đang so cái nào.
 */
export type EntryKind =
  | 'spend' | 'split' | 'family' | 'lend' | 'repay'
  | 'earn' | 'collect' | 'borrow'
  | 'between' | 'ownvn'

/**
 * `user`  = lưới danh mục HIỆN, người dùng chọn tay.
 * `auto`  = app tự gán, lưới ẨN. Chọn tay thì giao dịch thiếu cờ (is_debt_flow /
 *           is_remittance) nên bị đếm như một khoản chi thường — xem flowCategories.
 * `none`  = giao dịch không có danh mục.
 */
export type CategoryPicker = 'user' | 'auto' | 'none'

/**
 * Cơ sở tính cảnh báo trần ngân sách.
 * `myShare` chỉ dùng ở Trả hộ: cộng vào trần là PHẦN MÌNH CHỊU, không phải tổng
 * đã trả — tính tổng thì sai đúng bằng phần người khác nợ lại.
 */
export type CapBase = 'full' | 'myShare' | 'none'

/** Vai trò cũ + giá trị phân biệt, để dẫn xuất về roleSave đã có. */
export interface RoleSeed {
  role: EntryRole
  debtDirection?: DebtDirection
  remitKind?: 'expense' | 'transfer'
}

export interface EntryShape {
  kind: EntryKind
  direction: Direction
  /** Nhãn chip trong hàng Dạng. KHÔNG rút ngắn để ép một dòng — hàng chip wrap. */
  label: string
  /** Chữ phụ nói hệ quả. Chỉ hai dạng gửi về VN có, vì chỉ chúng có tác động
   *  tài sản trái nhau cho cùng một hành động vật lý. */
  hint?: string
  categoryPicker: CategoryPicker
  capBase: CapBase
  amountLabel: string
  /** `debtPayment` = đi qua createDebtPayment (bọc luôn transaction bên trong). */
  writes: 'transaction' | 'debtPayment'
  /** null ở repay/collect: type suy từ chiều của khoản nợ đã chọn, không từ dạng. */
  txType: TransactionType | null
  roleSeed: RoleSeed
}

const NONE: RoleSeed = { role: 'none' }

export const SHAPES: Record<EntryKind, EntryShape> = {
  spend: {
    kind: 'spend', direction: 'out', label: 'Chi thường',
    categoryPicker: 'user', capBase: 'full', amountLabel: 'Số tiền',
    writes: 'transaction', txType: 'expense', roleSeed: NONE,
  },
  split: {
    kind: 'split', direction: 'out', label: 'Trả hộ',
    categoryPicker: 'user', capBase: 'myShare', amountLabel: 'Tổng đã trả',
    writes: 'transaction', txType: 'expense', roleSeed: { role: 'split' },
  },
  family: {
    kind: 'family', direction: 'out', label: 'Gửi gia đình',
    hint: 'Tiền cho đi — tính là chi tiêu, vào trần.',
    categoryPicker: 'auto', capBase: 'full', amountLabel: 'Số gửi',
    writes: 'transaction', txType: 'expense',
    roleSeed: { role: 'remit', remitKind: 'expense' },
  },
  lend: {
    kind: 'lend', direction: 'out', label: 'Cho vay',
    categoryPicker: 'auto', capBase: 'none', amountLabel: 'Số tiền gốc',
    writes: 'transaction', txType: 'expense',
    roleSeed: { role: 'debt', debtDirection: 'owed_to_me' },
  },
  repay: {
    kind: 'repay', direction: 'out', label: 'Tôi trả nợ',
    categoryPicker: 'auto', capBase: 'none', amountLabel: 'Số trả',
    writes: 'debtPayment', txType: null, roleSeed: NONE,
  },
  earn: {
    kind: 'earn', direction: 'in', label: 'Thu thường',
    categoryPicker: 'user', capBase: 'none', amountLabel: 'Số tiền',
    writes: 'transaction', txType: 'income', roleSeed: NONE,
  },
  collect: {
    kind: 'collect', direction: 'in', label: 'Người trả lại',
    categoryPicker: 'auto', capBase: 'none', amountLabel: 'Số nhận lại',
    writes: 'debtPayment', txType: null, roleSeed: NONE,
  },
  borrow: {
    kind: 'borrow', direction: 'in', label: 'Vay được',
    categoryPicker: 'auto', capBase: 'none', amountLabel: 'Số tiền gốc',
    writes: 'transaction', txType: 'income',
    roleSeed: { role: 'debt', debtDirection: 'i_owe' },
  },
  between: {
    kind: 'between', direction: 'move', label: 'Giữa ví của tôi',
    categoryPicker: 'none', capBase: 'none', amountLabel: 'Chuyển đi',
    writes: 'transaction', txType: 'transfer', roleSeed: NONE,
  },
  ownvn: {
    kind: 'ownvn', direction: 'move', label: 'Tài khoản tôi ở VN',
    hint: 'Vẫn là tiền của bạn — không phải chi tiêu, chỉ đổi đồng tiền.',
    categoryPicker: 'none', capBase: 'none', amountLabel: 'Số gửi',
    writes: 'transaction', txType: 'transfer',
    roleSeed: { role: 'remit', remitKind: 'transfer' },
  },
}

/** Thứ tự chip trong hàng Dạng. Tiền ra 5 chip → 2 dòng ở 360px, đã chấp nhận. */
const ORDER: Record<Direction, EntryKind[]> = {
  out: ['spend', 'split', 'family', 'lend', 'repay'],
  in: ['earn', 'collect', 'borrow'],
  move: ['between', 'ownvn'],
}

export function shapeOf(kind: EntryKind): EntryShape {
  return SHAPES[kind]
}

export function directionOf(kind: EntryKind): Direction {
  return SHAPES[kind].direction
}

export function kindsOf(direction: Direction): EntryKind[] {
  return ORDER[direction]
}

/** Dạng mặc định khi bấm sang một hướng: chip đầu tiên của hướng đó. */
export function defaultKindOf(direction: Direction): EntryKind {
  return ORDER[direction][0]
}

/**
 * Danh mục của lend/borrow chỉ tồn tại khi có giao dịch thật: roleSave gán
 * `categoryId = v.withTransaction ? await debtFlowCategoryId(...) : null`. Tắt công
 * tắc đó thì không có bút toán nào nên cũng không có danh mục nào.
 */
export function categoryPickerOf(kind: EntryKind, withTransaction: boolean): CategoryPicker {
  if ((kind === 'lend' || kind === 'borrow') && !withTransaction) return 'none'
  return SHAPES[kind].categoryPicker
}
```

- [ ] **Step 4: Chạy test để chắc nó xanh**

Run: `npx vitest run src/features/transactions/entryShape.test.ts`
Expected: PASS — tất cả

- [ ] **Step 5: Chạy cả bộ để chắc không vỡ gì**

Run: `npx vitest run`
Expected: 155 file xanh, số test **> 2476** (thêm test mới, không mất test cũ)

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/entryShape.ts src/features/transactions/entryShape.test.ts
git commit -m "feat(nhap): bang 10 dang cho truc tien ra/vao/doi cho

Module thuan, chua noi vao UI. Bang B23 thanh mot file test doc y nhu bang
trong spec: dang nao co danh muc, dang nao vao tran, dan xuat ra but toan nao.

categoryPickerOf la HAM cua kind + withTransaction, khong phai hang so:
lend/borrow tat withTransaction thi khong co giao dich nen khong co danh muc.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# PR 2 — trục mới: hàng hướng + hàng Dạng, bỏ "Đặc biệt"

## Task 2: `SegmentedControl` thêm `size: 'lg'` (44px)

Ô segmented đang **42px** (đo được), B22 đòi **tối thiểu 44px** vì đây là control chính của màn, không nằm trong danh sách miễn trừ vùng chạm. `py-3` cho **46px** (xem chú thích trong code — số học phải cộng cả viền), thoả sàn với 2px dư. Nhưng `md` đang được **11 file khác** dùng — sửa `md` là đổi chiều cao ở cả 11 màn để chữa một màn.

**Files:**
- Modify: `src/components/ui/SegmentedControl.tsx:39-44`
- Test: `src/components/ui/SegmentedControl.test.ts` (tạo)

**Interfaces:**
- Produces: `type SegmentedSize = 'sm' | 'md' | 'lg'`

- [ ] **Step 1: Viết test thất bại**

`SIZE` là một bảng tra thuần → test được thẳng, không cần render. Để làm vậy phải **export `SIZE`** (hiện là `const` cục bộ).

```ts
// src/components/ui/SegmentedControl.test.ts   ← .ts, KHÔNG .tsx
import { describe, expect, it } from 'vitest'
import { SIZE, type SegmentedSize } from './SegmentedControl'

describe('bang co cua SegmentedControl', () => {
  it('lg dung py-3 = 44px — co cho control CHINH cua mot man', () => {
    expect(SIZE.lg.item).toContain('py-3')
    expect(SIZE.lg.item).not.toContain('py-2.5')
  })

  it('md GIU py-2.5 — 11 file khac dang dung, doi la doi chieu cao 11 man', () => {
    expect(SIZE.md.item).toContain('py-2.5')
  })

  it('ba co, khong hon', () => {
    expect(Object.keys(SIZE).sort()).toEqual(['lg', 'md', 'sm'] satisfies SegmentedSize[])
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó thất bại**

Run: `npx vitest run src/components/ui/SegmentedControl.test.ts`
Expected: FAIL — `SIZE` chưa export, và `SIZE.lg` chưa tồn tại

- [ ] **Step 3: Thêm size `lg`**

```ts
export type SegmentedSize = 'sm' | 'md' | 'lg'

// Export để test được bằng hàm thuần: repo không render component trong test
// (0 file *.test.tsx, không có @testing-library), nên bảng tra phải tự kiểm được.
export const SIZE: Record<SegmentedSize, { track: string; item: string }> = {
  sm: { track: 'text-xs', item: 'px-3 py-2.5' },
  md: { track: 'text-sm', item: 'px-1 py-2.5' },
  // 44px: py-3 (12px×2) + line-height 20px của text-sm. Dành cho control CHÍNH của
  // một màn — màn Nhập, nơi ô segmented không nằm trong danh sách miễn trừ vùng chạm.
  // KHÔNG sửa `md` để đạt 44px: 11 file khác đang dùng nó (Tài sản, Đầu tư, Báo cáo,
  // Sổ, RecurringFormSheet, roleFields…), đổi là đổi chiều cao ở cả 11 màn.
  lg: { track: 'text-sm', item: 'px-1 py-3' },
}
```

- [ ] **Step 4: Chạy test để chắc nó xanh**

Run: `npx vitest run src/components/ui/SegmentedControl.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/SegmentedControl.tsx src/components/ui/SegmentedControl.test.ts
git commit -m "feat(ui): SegmentedControl them size lg 44px

Man Nhap doi o segmented dung 44px (control chinh, khong mien tru vung cham);
o hien tai do duoc 42px. Khong sua size md de dat 44 vi 11 file khac dang dung.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `DirectionTabs.tsx` — hàng hướng + hàng Dạng

Thay **một** control (`Đặc biệt ⌄` + 3 segmented khác nhau) bằng **một** control hai cấp. Sau task này màn Nhập chỉ còn **đúng một** chỗ chọn loại.

**Files:**
- Create: `src/features/transactions/DirectionTabs.tsx`
- Test: `src/features/transactions/entryShape.test.ts` (mở rộng — `chipAriaLabel`); JSX kiểm bằng đo trên trình duyệt

**Interfaces:**
- Consumes: `Direction`, `EntryKind`, `DIRECTION_LABEL`, `kindsOf`, `shapeOf`, `directionOf`, `defaultKindOf` từ `./entryShape`; `SegmentedControl` từ `../../components/ui/SegmentedControl`
- Produces: `DirectionTabs({ kind, onChange }: { kind: EntryKind; onChange: (k: EntryKind) => void })`

- [ ] **Step 1: Viết test thất bại**

Quyết định của component này **đã** nằm ở hàm thuần (`kindsOf`, `defaultKindOf`, `shapeOf` — Task 1). Phần duy nhất còn chưa có hàm là **soạn tên đọc được cho chip**, và nó đáng có hàm riêng: nếu `hint` không vào `aria-label` thì người dùng trình đọc màn hình chọn giữa hai dạng gửi về VN mà **không nghe được hệ quả trái nhau** của chúng — đúng cái mà `hint` sinh ra để nói.

Thêm vào `entryShape.ts` + `entryShape.test.ts`:

```ts
// entryShape.test.ts — thêm describe này
describe('chipAriaLabel', () => {
  it('dang thuong: ten doc duoc = nhan chip', () => {
    expect(chipAriaLabel('spend')).toBe('Chi thường')
    expect(chipAriaLabel('lend')).toBe('Cho vay')
  })

  it('hai dang gui ve VN: he qua vao TEN DOC DUOC, khong chi vao mat', () => {
    // Cung mot hanh dong vat ly, tac dong tai san TRAI NHAU. Nghe bang trinh doc
    // man hinh ma khong co cau nay thi khong the chon dung.
    expect(chipAriaLabel('family')).toBe('Gửi gia đình — Tiền cho đi — tính là chi tiêu, vào trần.')
    expect(chipAriaLabel('ownvn'))
      .toBe('Tài khoản tôi ở VN — Vẫn là tiền của bạn — không phải chi tiêu, chỉ đổi đồng tiền.')
  })

  it('dung tam dang khong co hint thi khong co dau gach thua', () => {
    const plain = (['spend','split','lend','repay','earn','collect','borrow','between'] as const)
    for (const k of plain) expect(chipAriaLabel(k)).not.toContain('—')
  })
})
```

```ts
// entryShape.ts
/** Tên đọc được của chip Dạng. Hint phải vào ĐÂY, không chỉ vào mắt. */
export function chipAriaLabel(kind: EntryKind): string {
  const s = SHAPES[kind]
  return s.hint ? `${s.label} — ${s.hint}` : s.label
}
```

- [ ] **Step 2: Chạy test để chắc nó thất bại**

Run: `npx vitest run src/features/transactions/entryShape.test.ts`
Expected: FAIL — `chipAriaLabel is not a function`

- [ ] **Step 3: Viết `DirectionTabs.tsx`**

```tsx
// src/features/transactions/DirectionTabs.tsx
import { ArrowDown, ArrowUp, ArrowLeftRight, type LucideIcon } from 'lucide-react'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import {
  DIRECTION_LABEL, defaultKindOf, directionOf, kindsOf, shapeOf,
  type Direction, type EntryKind,
} from './entryShape'

const DIR_ICON: Record<Direction, LucideIcon> = {
  out: ArrowDown,
  in: ArrowUp,
  move: ArrowLeftRight,
}

const DIRS: Direction[] = ['out', 'in', 'move']

/**
 * MỘT control chọn loại, hai cấp: segmented cho hướng, chip cho dạng.
 *
 * Không dùng lưới thẻ (trùng hình dạng với lưới danh mục cách đó ~150px nên đọc sai
 * cấp), không cuộn ngang (dạng cuối ra ngoài màn — đúng bệnh của "Đặc biệt"), không
 * ba mục + nút "khác" (dựng lại hai tầng).
 */
export function DirectionTabs({
  kind,
  onChange,
}: {
  kind: EntryKind
  onChange: (kind: EntryKind) => void
}) {
  const direction = directionOf(kind)
  const kinds = kindsOf(direction)

  return (
    <div className="flex flex-col gap-1.5">
      <SegmentedControl
        // size lg: ô 46px, trên sàn vùng chạm 44px. Đây là control chính của màn, không nằm trong danh
        // sách miễn trừ vùng chạm.
        size="lg"
        label="Hướng tiền"
        value={direction}
        onChange={(d) => onChange(defaultKindOf(d))}
        items={DIRS.map((d) => {
          const Icon = DIR_ICON[d]
          return {
            value: d,
            label: (
              <span className="flex items-center justify-center gap-1 whitespace-nowrap">
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {DIRECTION_LABEL[d]}
              </span>
            ),
          }
        })}
      />
      {/* Hàng Dạng ẩn hẳn khi hướng chỉ có một dạng — quy tắc cho phép, và một bộ
          chọn một-lựa-chọn là một bộ chọn giả. Hiện cả ba hướng đều ≥2 dạng nên
          nhánh này chưa chạy, nhưng để đây thì thêm/bớt dạng không sinh màn lạ. */}
      {kinds.length > 1 && (
        <div
          role="radiogroup"
          aria-label="Dạng giao dịch"
          // flex-wrap: tiền ra có 5 chip = 376px ở font 12px, chỗ có 336px → xuống
          // 2 dòng. KHÔNG rút nhãn để ép một dòng.
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="shrink-0 px-1 text-xs text-fg-muted">Dạng</span>
          {kinds.map((k) => {
            const s = shapeOf(k)
            const on = k === kind
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                // Chữ phụ vào tên đọc được, không chỉ vào mắt: hai dạng gửi về VN là
                // CÙNG một hành động vật lý với tác động tài sản TRÁI NHAU, nên hệ quả
                // phải đọc được trước khi chọn, không phải sau. (Hàm thuần để test được.)
                aria-label={chipAriaLabel(k)}
                onClick={() => onChange(k)}
                // 32px là miễn trừ vùng chạm có chủ ý (lựa chọn cấp hai, luôn có ít
                // nhất một chip đang bật) — giống chip danh mục con.
                // whitespace-nowrap: thiếu nó thì chip bị co và nhãn vỡ GIỮA TỪ bên
                // trong viên pill ("Chi / thường") ngay khi bật Cỡ chữ lớn.
                className={`flex min-h-8 items-center whitespace-nowrap rounded-full border px-2.5 text-xs font-medium transition active:scale-95 ${
                  on
                    ? 'border-accent bg-state-good-bg text-state-good-fg'
                    : 'border-border-strong bg-surface text-fg-secondary'
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Cho `SegmentedItem.label` nhận `ReactNode`**

`DirectionTabs` đưa `<span>` có icon vào `label`. Kiểm chữ ký hiện tại:

Run: `grep -n "interface SegmentedItem" -A 8 src/components/ui/SegmentedControl.tsx`

Nếu `label: string` thì nới thành `label: ReactNode` và **giữ `label` của `SegmentedControl` (chuỗi `aria-label` của cả bộ) là `string`** — hai thứ khác nhau, đừng nới cái sau.

- [ ] **Step 5: Chạy test để chắc nó xanh**

Run: `npx vitest run src/features/transactions/entryShape.test.ts && npx tsc -b --noEmit`
Expected: PASS, không lỗi type

- [ ] **Step 6: Đo trên trình duyệt** — phần JSX không có test render, nên kiểm bằng đo

Chạy `so-chi-tieu-demo`, mở `/entry`, viewport `360×780`, dán vào console:

```js
(() => {
  const chips = [...document.querySelectorAll('[role="radio"]')]
  const tabs = [...document.querySelectorAll('[role="tab"]')]
  const row = document.querySelector('[role="radiogroup"]')
  return JSON.stringify({
    soTablist: document.querySelectorAll('[role="tablist"]').length,
    huong: tabs.map(t => t.innerText.trim()),
    oSegmentedCao: Math.round(tabs[0].getBoundingClientRect().height),
    chipTienRa: chips.map(c => c.innerText.trim()),
    chipCao: Math.round(chips[0].getBoundingClientRect().height),
    hangChipWrap: getComputedStyle(row).flexWrap,
    chipNowrap: getComputedStyle(chips[0]).whiteSpace,
    soDongHangChip: new Set(chips.map(c => Math.round(c.getBoundingClientRect().top))).size,
    ariaCuaChipGuiGiaDinh: chips.find(c => c.innerText.includes('Gửi gia đình'))?.getAttribute('aria-label'),
  }, null, 1)
})()
```

Kỳ vọng: `soTablist: 1` · `huong: ["Tiền ra","Tiền vào","Đổi chỗ"]` · `oSegmentedCao: 46` · `chipTienRa` đủ 5 chip · `chipCao: 32` · `hangChipWrap: "wrap"` · `chipNowrap: "nowrap"` · `soDongHangChip: 2` (tiền ra 376px > chỗ 336px) · `aria…` chứa `"tính là chi tiêu"`.

Rồi bấm sang **Tiền vào**: `chipTienRa` phải thành 3 chip và `soDongHangChip: 1`.

- [ ] **Step 7: Commit**

```bash
git add src/features/transactions/DirectionTabs.tsx src/features/transactions/entryShape.ts src/features/transactions/entryShape.test.ts src/components/ui/SegmentedControl.tsx
git commit -m "feat(nhap): DirectionTabs — mot control chon loai, hai cap

Segmented cho huong (o 44px) + hang chip cho dang. Thay ca ba segmented cu
(TYPE_TABS/DEBT_TABS/REMIT_TABS) va dropdown Dac biet.

Chu phu cua hai dang gui ve VN vao aria-label, khong chi vao mat: chung la
cung mot hanh dong vat ly voi tac dong tai san trai nhau.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `entryValidation.ts` — `role` → `kind`

27 test trong `entryValidation.test.ts`, 14 chạm `role`. Đổi field rồi sửa test theo.

**Files:**
- Modify: `src/features/transactions/entryValidation.ts`
- Modify: `src/features/transactions/entryValidation.test.ts`

**Interfaces:**
- Consumes: `EntryKind`, `shapeOf`, `categoryPickerOf` từ `./entryShape`
- Produces: `EntryState.kind: EntryKind` (thay `EntryState.role`); `entryGate(s: EntryState): EntryGate` giữ nguyên chữ ký

- [ ] **Step 1: Viết test thất bại**

```ts
// Thêm vào src/features/transactions/entryValidation.test.ts
// (giữ helper dựng EntryState đã có trong file; chỉ đổi `role:` thành `kind:`)

describe('gate doc kind, khong doc role', () => {
  it('dang thuong thieu so tien thi noi thieu so tien', () => {
    const g = entryGate(state({ kind: 'spend', amount: 0 }))
    expect(g.canSave).toBe(false)
    expect(g.missing).toBe('Còn thiếu: số tiền.')
  })

  it('dang khong co luoi danh muc thi KHONG doi chon danh muc', () => {
    // family/lend/borrow/between/ownvn: categoryPicker khac 'user' → luoi an, nen
    // "chon danh muc o luoi phia tren" la cau vo nghia (khong co luoi nao).
    for (const kind of ['family', 'lend', 'borrow', 'between', 'ownvn'] as const) {
      const g = entryGate(state({ kind, amount: 1000, hasCategory: false }))
      expect(g.missing).not.toMatch(/chọn danh mục/)
    }
  })

  it('dang co luoi danh muc thi van doi chon danh muc', () => {
    for (const kind of ['spend', 'earn'] as const) {
      const g = entryGate(state({ kind, amount: 1000, hasCategory: false }))
      expect(g.missing).toMatch(/chọn danh mục/)
    }
  })

  it('nhan o tien trong cau thieu lay tu bang, khong hard-code', () => {
    expect(entryGate(state({ kind: 'split', amount: 0 })).missing)
      .toBe('Còn thiếu: Tổng đã trả.')
    expect(entryGate(state({ kind: 'family', amount: 0 })).missing)
      .toBe('Còn thiếu: Số gửi.')
    expect(entryGate(state({ kind: 'lend', amount: 0 })).missing)
      .toBe('Còn thiếu: Số tiền gốc.')
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó thất bại**

Run: `npx vitest run src/features/transactions/entryValidation.test.ts`
Expected: FAIL — TypeScript báo `kind` không có trên `EntryState`

- [ ] **Step 3: Đổi `EntryState` và các nhánh đọc `role`**

Trong `entryValidation.ts`:

1. `import type { EntryRole } from './entryRoles'` → thêm `import { categoryPickerOf, shapeOf, type EntryKind } from './entryShape'`
2. Trong `EntryState`: thay `role: EntryRole` bằng:

```ts
  /** Dạng đang chọn — nguồn duy nhất quyết định form đòi gì. Xem entryShape. */
  kind: EntryKind
  /** Chỉ lend/borrow dùng: tắt thì không sinh giao dịch nên không có danh mục. */
  withTransaction: boolean
```

3. `ROLE_AMOUNT_LABEL` (hằng số nhãn ô tiền) **xóa hẳn** — nhãn giờ ở `shapeOf(kind).amountLabel`. Mọi chỗ dùng nó đổi sang bảng.
4. `entryGate` đổi thành:

```ts
export function entryGate(s: EntryState): EntryGate {
  const shape = shapeOf(s.kind)
  const missing = ((): string | null => {
    if (!s.plannedMode && s.amount <= 0) {
      return `Còn thiếu: ${shape.amountLabel === 'Số tiền' ? 'số tiền' : shape.amountLabel}.`
    }
    if (!s.hasAccount) return 'Còn thiếu: tài khoản.'
    return kindMissing(s, shape)
  })()
  return { canSave: missing === null, missing }
}
```

5. Gộp `normalMissing` + `roleMissing` thành **một** `kindMissing(s, shape)`. Trong đó, chỗ đòi danh mục **phải** gác bằng bảng:

```ts
  // Chỉ đòi danh mục ở dạng CÓ lưới. Trước đây ba chế độ đặc biệt có ba hành vi
  // khác nhau cho cùng phần tử này và không phát biểu được quy tắc nào.
  if (categoryPickerOf(s.kind, s.withTransaction) === 'user' && !s.hasCategory) {
    return s.categoryGridEmpty
      ? emptyGridMissing(s)
      : 'Còn thiếu: chọn danh mục ở lưới phía trên.'
  }
```

- [ ] **Step 4: Sửa 14 chỗ test cũ dùng `role`**

Run: `grep -n "role:" src/features/transactions/entryValidation.test.ts`

Đổi từng chỗ theo bảng: `role: 'none'` + `type: 'expense'` → `kind: 'spend'` · `+ type: 'income'` → `kind: 'earn'` · `+ type: 'transfer'` → `kind: 'between'` · `role: 'split'` → `kind: 'split'` · `role: 'debt'` + `direction: 'owed_to_me'` → `kind: 'lend'` · `role: 'debt'` + `direction: 'i_owe'` → `kind: 'borrow'` · `role: 'remit'` + `kind: 'expense'` → `kind: 'family'` · `role: 'remit'` + `kind: 'transfer'` → `kind: 'ownvn'`. Helper dựng state thêm `withTransaction: true` làm mặc định.

- [ ] **Step 5: Chạy test để chắc nó xanh**

Run: `npx vitest run src/features/transactions/entryValidation.test.ts`
Expected: PASS — 27 test cũ + 4 test mới

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/entryValidation.ts src/features/transactions/entryValidation.test.ts
git commit -m "refactor(nhap): entryValidation doc kind thay vi (type, role)

Gop normalMissing + roleMissing thanh mot kindMissing. Cho doi danh muc gio
gac bang categoryPickerOf(kind, withTransaction) === 'user' — truoc day ba che
do dac biet co ba hanh vi khac nhau cho cung phan tu do.

Xoa ROLE_AMOUNT_LABEL: nhan o tien lay tu shapeOf(kind).amountLabel.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: `RoleBase` thêm `tagIds` — nhãn chạy ở cả 10 dạng

Bug thật: `TagPicker` bị ẩn ở 5 trên 10 dạng vì `RoleBase` **không có** `tag_ids` — đường ống chưa có. Ẩn đi là lựa chọn thật thà, nhưng chỗ cần nhãn nhất (Trả hộ) lại là chỗ mất nhãn.

**Files:**
- Modify: `src/features/transactions/roleSave.ts:14-22`
- Modify: `src/features/transactions/roleSave.test.ts`

**Interfaces:**
- Produces: `RoleBase.tagIds: string[]`

- [ ] **Step 1: Viết test thất bại**

```ts
// Thêm vào src/features/transactions/roleSave.test.ts
// (dùng helper `deps()` + `base()` đã có trong file)

describe('nhan di theo o ca ba vai tro', () => {
  it('tra ho: giao dich phan minh mang dung nhan', async () => {
    const d = deps()
    await saveSplit(
      { ...base(), amount: 12_400, tagIds: ['tag-lan'] },
      { ...initialSplit(), others: 8_200, counterparty: 'Lan', settle: 'later' },
      d,
    )
    expect(d.created[0].tag_ids).toEqual(['tag-lan'])
  })

  it('gui ve VN: ho tro gia dinh mang dung nhan', async () => {
    const d = deps()
    await saveRemit(
      { ...base(), amount: 30_000, tagIds: ['tag-me'] },
      { ...initialRemit(), kind: 'expense', fee: 800, received: 4_467_600 },
      d,
    )
    expect(d.created[0].tag_ids).toEqual(['tag-me'])
  })

  it('cho vay: but toan giai ngan mang dung nhan', async () => {
    const d = deps()
    await saveDebtEntry(
      { ...base(), amount: 50_000, tagIds: ['tag-hung'] },
      { ...initialDebt(), direction: 'owed_to_me', counterparty: 'Hùng' },
      d,
    )
    expect(d.created[0].tag_ids).toEqual(['tag-hung'])
  })

  it('khong chon nhan thi khong gui mang rong lam mat nhan cu', async () => {
    const d = deps()
    await saveRemit({ ...base(), amount: 30_000, tagIds: [] },
      { ...initialRemit(), kind: 'expense' }, d)
    expect(d.created[0].tag_ids).toEqual([])
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó thất bại**

Run: `npx vitest run src/features/transactions/roleSave.test.ts`
Expected: FAIL — TypeScript báo `tagIds` không có trên `RoleBase`

- [ ] **Step 3: Thêm `tagIds` vào `RoleBase` và chuyền xuống mọi `createTransaction`**

```ts
export interface RoleBase {
  /** minor units theo currency tài khoản nguồn — nghĩa tùy vai trò (tổng/gốc/số gửi). */
  amount: number
  accountId: string
  categoryId: string | null
  srcCurrency: CurrencyCode
  occurredOn: string
  note: string
  /**
   * Nhãn người dùng chọn. Trước đây RoleBase không có field này, nên TagPicker phải
   * ẩn ở mọi vai trò — kể cả Trả hộ, đúng chỗ cần nhãn "ai" nhất. Ẩn là thật thà
   * (thà không hiện còn hơn nhận rồi âm thầm bỏ), nhưng cách chữa đúng là mở đường
   * ống, không phải giấu ô nhập.
   */
  tagIds: string[]
}
```

Rồi trong `saveSplit` / `saveDebtEntry` / `saveRemit` / `saveWithFee`, thêm `tag_ids: base.tagIds` vào **mỗi** `NewTransaction` là **bút toán chính** của người dùng.

⚠️ **Không** gắn nhãn vào bút toán **phí** (`PHI_CAT`) và bút toán **chuyển khoản bù** của `settle: 'now'`: chúng là bút toán kỹ thuật app tự sinh, gắn nhãn "Lan" vào một khoản phí ngân hàng là làm bẩn bộ lọc theo nhãn.

- [ ] **Step 4: Chạy test để chắc nó xanh**

Run: `npx vitest run src/features/transactions/roleSave.test.ts`
Expected: PASS — 54 test cũ + 4 mới. Nếu test cũ vỡ vì thiếu `tagIds`, thêm `tagIds: []` vào helper `base()`.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/roleSave.ts src/features/transactions/roleSave.test.ts
git commit -m "fix(nhap): nhan di theo giao dich o ca ba vai tro

RoleBase khong co tag_ids nen TagPicker phai an o 5 tren 10 dang — ke ca Tra
ho, dung cho can nhan \"ai\" nhat. An la that tha nhung cach chua dung la mo
duong ong.

Nhan chi gan vao but toan CHINH; but toan phi va but toan chuyen khoan bu cua
settle='now' khong gan — chung la but toan ky thuat app tu sinh.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Nối `kind` vào `TransactionForm` + dọn `EntryPage`

Task lớn nhất của plan. Sau nó: đếm control chọn loại = **1**, không còn nút "Đặc biệt", không còn tab con "Hỗ trợ gia đình / Tài sản của mình", nút Lưu **một layout ở cả 10 dạng**.

**Files:**
- Modify: `src/features/transactions/TransactionForm.tsx`
- Modify: `src/features/transactions/EntryPage.tsx`
- Modify: `src/features/transactions/entryRoles.ts`
- Test: `src/features/transactions/entryStructure.test.ts` (tạo)

**Interfaces:**
- Consumes: `DirectionTabs` + `chipAriaLabel` (Task 3) · `entryShape` (Task 1) · `EntryState.kind` (Task 4) · `RoleBase.tagIds` (Task 5)
- Produces: `saveVerbOf(kind: EntryKind, amount: number, currency: CurrencyCode, categoryName: string | null): string` — thêm vào `entryShape.ts`, dùng bởi nhãn nút Lưu

- [ ] **Step 1: Viết test thất bại**

Không render được, nên chốt bằng **test đọc file** — nó bắt đúng thứ cần bắt ở task này: cấu trúc và chuỗi **đã chết** phải biến mất khỏi source, không sót lại một nhánh nào. Loại test này bền hơn test render ở chỗ nó không thể xanh nhờ một điều kiện `false` che mất code.

```ts
// src/features/transactions/entryStructure.test.ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const form = readFileSync('src/features/transactions/TransactionForm.tsx', 'utf8')
const page = readFileSync('src/features/transactions/EntryPage.tsx', 'utf8')
const roles = readFileSync('src/features/transactions/entryRoles.ts', 'utf8')

describe('nut "Dac biet" va ca lop dropdown bien mat', () => {
  it('khong con chuoi "Dac biet" o dau ca', () => {
    expect(form).not.toMatch(/Đặc biệt/)
    expect(page).not.toMatch(/Đặc biệt/)
  })

  it('khong con portal roleTriggerSlot', () => {
    expect(form).not.toMatch(/roleTriggerSlot/)
    expect(page).not.toMatch(/roleSlot|setRoleSlot/)
  })

  it('khong con ba bo segmented rieng — chi con DirectionTabs', () => {
    for (const dead of ['TYPE_TABS', 'DEBT_TABS', 'REMIT_TABS', 'ROLE_META', 'ROLE_ORDER']) {
      expect(form).not.toMatch(new RegExp(dead))
    }
    expect(form).toMatch(/<DirectionTabs/)
  })
})

describe('ba ham dan xuat chuyen sang bang', () => {
  it('entryRoles khong con roleTxType / roleAmountLabel / roleHidesCategoryGrid', () => {
    for (const dead of ['roleTxType', 'roleAmountLabel', 'roleHidesCategoryGrid']) {
      expect(roles).not.toMatch(new RegExp(dead))
    }
  })

  it('nhung interface va initial* thi GIU — chung con duoc dung', () => {
    for (const keep of ['SplitValue', 'DebtValue', 'RemitValue',
                        'initialSplit', 'initialDebt', 'initialRemit',
                        'SERVICES', 'parseRoleParam']) {
      expect(roles).toMatch(new RegExp(keep))
    }
  })
})

describe('dai do ngan sach o dau form bien mat', () => {
  it('EntryPage khong con useBudgetAlert va khong con Link to /budget', () => {
    expect(page).not.toMatch(/useBudgetAlert/)
    expect(page).not.toMatch(/overCount/)
    expect(page).not.toMatch(/danh mục vượt ngân sách/)
  })
})

describe('TagPicker khong bi gac boi dang nao', () => {
  it('khong con dieu kien activeRole quanh TagPicker', () => {
    // Truoc day: {activeRole === 'none' && <TagPicker …>} — an nhan o 5 tren 10 dang.
    expect(form).toMatch(/<TagPicker/)
    expect(form).not.toMatch(/activeRole === 'none' && <TagPicker/)
  })

  it('khong con bien activeRole nao ca — kind la state duy nhat', () => {
    expect(form).not.toMatch(/activeRole/)
  })
})

describe('nut Luu mot layout', () => {
  it('nhan phu la "Luu va nhap tiep"', () => {
    // "Tiep tuc" khong noi tiep cai gi.
    expect(form).toMatch(/Lưu và nhập tiếp/)
  })

  it('chuoi "Tiep tuc" bien mat o CA HAI file, va prop continueLabel chet han', () => {
    // Chuoi do nam o EntryPage.tsx:243, KHONG o TransactionForm — soat mot file
    // thi test xanh ma chuoi van song. Xem Step 3c.
    for (const src of [form, page]) expect(src).not.toMatch(/Tiếp tục/)
    for (const src of [form, page]) expect(src).not.toMatch(/continueLabel/)
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó thất bại**

Run: `npx vitest run src/features/transactions/entryStructure.test.ts`
Expected: FAIL — hầu hết đỏ (còn `Đặc biệt`, còn `TYPE_TABS`, còn `activeRole`, còn `useBudgetAlert`)

- [ ] **Step 3: `TransactionForm` — đổi state sang `kind`**

1. **Xóa** `TYPE_TABS`, `DEBT_TABS`, `REMIT_TABS`, `ROLE_ORDER`, `ROLE_META`, `roleTrigger`, `REPEAT_OPTIONS`, `REPEAT_LABEL`, `REPEAT_MENU_LABEL`, state `roleMenu`, state `repeat`, state `repeatOpen`, prop `roleTriggerSlot`, prop `onSubmitRecurring`.
2. **Thêm** `const [kind, setKind] = useState<EntryKind>(...)`; suy giá trị đầu từ `initialType` / `initialRole` cũ để URL `?type=`/`?role=` **vẫn chạy** (đừng phá đường vào từ thông báo và từ trang Nợ).
3. Chỗ dựng segmented (3 nhánh `activeRole === 'none' ? … : …`) thay bằng **một** dòng:

```tsx
<DirectionTabs kind={kind} onChange={switchKind} />
```

4. `switchKind(next)` giữ đúng nếp `switchType` cũ: đổi dạng thì gieo lại danh mục theo `lastCategoryFor`, giữ số tiền và tài khoản.
5. **`activeRole` biến mất hoàn toàn — có `grep -c` = 29 chỗ, không phải "vài chỗ".** Test cấu trúc chốt `expect(form).not.toMatch(/activeRole/)`, nên phải chuyển hết. Bảng cổng đầy đủ, cổng cũ → điều kiện mới:

| Dòng | Cổng cũ | Điều kiện mới |
| --- | --- | --- |
| `:311` | `const activeRole = enableRoles ? role : 'none'` | **xóa** — `kind` là state |
| `:339` | `setTypeAndCat(roleTxType(activeRole, debtVal))` | `switchKind` gieo lại theo `shapeOf(kind).txType` |
| `:358` | `activeRole === 'remit'` (lọc ví JPY) | `shapeOf(kind).roleSeed.role === 'remit'` |
| `:393` | `type === 'transfer' && activeRole === 'none' && …` | `kind === 'between' && !!onSubmitWithFee` (bỏ `repeat`) |
| `:397` | `crossCurrency \|\| activeRole === 'split'\|'remit'\|'debt'` | `crossCurrency \|\| shapeOf(kind).roleSeed.role !== 'none' \|\| shapeOf(kind).writes === 'debtPayment'` |
| `:445` | `roleHidesCategoryGrid(activeRole)` | `categoryPickerOf(kind, withTransaction) !== 'user'` |
| `:477`,`:485` | `role: activeRole` | `kind`, `withTransaction` (xem Step 3b) |
| `:635`,`:647`,`:648` | dispatch theo `activeRole` | dispatch theo `shapeOf(kind).roleSeed.role`; thêm nhánh `writes === 'debtPayment'` (Task 8) |
| `:865`,`:871` | `roleMeta` + banner vai trò | **xóa cả banner** — hàng Dạng đã nói dạng nào đang bật, banner là tầng thứ hai nói cùng một điều |
| `:953`–`:967` | ba nhánh segmented | `<DirectionTabs kind={kind} onChange={switchKind} />` |
| `:982` | `roleAmountLabel(activeRole) ?? …` | `shapeOf(kind).amountLabel` |
| `:1037` | `… && activeRole === 'none' && type === 'expense'` | segmented `Đã chi\|Sẽ chi` (Task 10) — task này chỉ bỏ nút chuông |
| `:1054` | dropdown Lặp lại | **xóa** (Task 10 thay bằng dòng dẫn) |
| `:1124` | `activeRole === 'remit' && pickerAccounts.length === 0` | `shapeOf(kind).roleSeed.role === 'remit' && …` |
| **`:1129`** | `activeRole === 'split'` → `SplitFields` | `kind === 'split'` |
| **`:1143`** | `activeRole === 'debt'` → `DebtFields` | `kind === 'lend' \|\| kind === 'borrow'` |
| **`:1155`** | `activeRole === 'remit'` → `RemitFields` | `kind === 'family' \|\| kind === 'ownvn'` |
| `:1259` | nút "Lưu mẫu" | `shapeOf(kind).roleSeed.role === 'none' && shapeOf(kind).writes === 'transaction'` |
| `:1281` | `activeRole === 'none' && <TagPicker>` | **bỏ hẳn điều kiện** — hiện ở mọi dạng (Task 5 đã mở đường ống) |
| `:1286`,`:1306` | `type === 'expense' && activeRole === 'none'` | `shapeOf(kind).txType === 'expense' && !plannedMode` |
| `:1348` | nhánh một nút / hai nút | **xóa nhánh** — luôn hai nút (Step 4) |

⚠️ **Ba dòng in đậm là chỗ nguy hiểm nhất của cả plan.** Chúng quyết định **field nào hiện ở dạng nào**, và test cấu trúc **không bắt được** nếu map sai — nó chỉ đếm chuỗi `activeRole`. Nên thêm vào `entryStructure.test.ts`:

```ts
describe('ba cong role-field gac dung dang', () => {
  it('SplitFields chi o split, DebtFields o lend|borrow, RemitFields o family|ownvn', () => {
    // Map sai o day la bug HANH VI im lang: field hien sai dang, dung loai loi ma
    // ca goi ban giao sinh ra de chua. Test dem chuoi activeRole khong bat duoc.
    expect(form).toMatch(/kind === 'split'\s*&&\s*\(?\s*<SplitFields/)
    expect(form).toMatch(/kind === 'lend' \|\| kind === 'borrow'/)
    expect(form).toMatch(/kind === 'family' \|\| kind === 'ownvn'/)
  })

  it('khong con banner vai tro — hang Dang da noi dang nao dang bat', () => {
    expect(form).not.toMatch(/roleMeta/)
  })
})
```

6. `AMOUNT_COLOR` tra theo `shapeOf(kind).txType ?? 'transfer'`.

- [ ] **Step 3b: `withTransaction` — một giá trị dẫn xuất, không hai đường đọc**

Task 4 thêm `EntryState.withTransaction` nhưng không nói nó lấy từ đâu. Có hai ứng viên thật trong form: `debtVal.withTransaction` (dùng ở `lend`/`borrow`) và `paymentVal.withTransaction` (dùng ở `repay`/`collect`, đến ở Task 8). Gộp làm **một**:

```tsx
// categoryPickerOf chỉ đổi hành vi ở lend/borrow, nên với mọi dạng khác giá trị này
// vô hại. Gộp một biến để không có hai đường đọc cùng một ý — hai đường thì sẽ lệch.
// (paymentVal đến ở Task 8; tới đó thay `true` bằng paymentVal.withTransaction.)
const withTransaction =
  shapeOf(kind).writes === 'debtPayment' ? true : debtVal.withTransaction
```

- [ ] **Step 3c: Xóa hẳn prop `continueLabel`**

Nút phụ giờ hard-code `'Lưu và nhập tiếp'` (Step 4), nên prop `continueLabel` thành **code chết**. Nhưng chuỗi `'Tiếp tục'` không nằm trong `TransactionForm` — nó ở [`EntryPage.tsx:243`](../../../src/features/transactions/EntryPage.tsx#L243). Xóa ở **cả hai** file: khai báo prop (`TransactionForm.tsx:185`, `:235`, `:1356`) và chỗ truyền (`EntryPage.tsx:243`).

⚠️ Test cấu trúc phải soát **cả `page`**, không chỉ `form` — nếu chỉ soát `form` thì chuỗi sống trong `EntryPage` mà test vẫn xanh:

```ts
it('chuoi "Tiep tuc" bien mat o CA HAI file, va prop continueLabel chet han', () => {
  for (const src of [form, page]) expect(src).not.toMatch(/Tiếp tục/)
  for (const src of [form, page]) expect(src).not.toMatch(/continueLabel/)
})
```

- [ ] **Step 4: Nút Lưu — một layout, nhãn nhắc việc**

Bỏ nhánh `onContinue && repeat === 'none' && activeRole === 'none' && !plannedMode ? (hai nút) : (một nút)`. Thay bằng **luôn hai nút**, `200px` + phần còn lại:

```tsx
<div className="flex gap-2">
  <button type="button" onClick={() => onNumPadKey('⌫')} aria-label="Xóa"
    className="… lg:hidden">
    <Delete className="h-5 w-5" />
  </button>
  {/* Hai nút ở CẢ 10 DẠNG. Trước đây Chi/Chuyển khoản có hai nút còn ba chế độ
      đặc biệt có một nút full-width — cùng hành động mà đổi vị trí giữa các chế độ. */}
  <button type="button" onClick={() => handleSubmit('continue')} disabled={!canSave}
    className="w-[12.5rem] shrink-0 rounded-md border border-state-good-border …">
    {pending === 'continue' ? 'Đang lưu…' : 'Lưu và nhập tiếp'}
  </button>
  <button type="button" onClick={() => handleSubmit('save')} disabled={!canSave}
    className="flex-1 rounded-md bg-accent … disabled:bg-accent-muted-bg disabled:text-accent-muted-fg">
    {saving ? 'Đang lưu…' : saveLabel}
  </button>
</div>
```

Nhãn `saveLabel` **nhắc lại việc sẽ làm**, và **khi chưa đủ thì nói thiếu gì** — `missing` đã tính sẵn, chỉ chưa ai đưa lên nút:

```tsx
// "Tiếp tục" không nói tiếp cái gì → "Lưu và nhập tiếp".
// Nhãn nút chính nhắc việc: "Lưu · gửi ¥30,000 cho gia đình", "Lưu · chi ¥4,200 +
// phải thu ¥8,200". Chưa đủ thì nhãn NÓI THIẾU GÌ thay vì chỉ mờ đi — mờ mà không
// nói thì không biết đang bị vô hiệu hay chỉ là màu.
const saveLabel = missing
  ? `Lưu · ${missing.replace(/^Còn thiếu: /, 'còn thiếu ').replace(/\.$/, '')}`
  : `Lưu · ${saveVerbOf(kind, amount, srcCurrency, selectedCat?.name)}`
```

`saveVerbOf` là hàm thuần nhỏ trong `entryShape.ts` — thêm cùng Task này, kèm test:

```ts
it('nhan nut Luu nhac lai viec se lam', () => {
  expect(saveVerbOf('family', 30_000, 'JPY', null)).toBe('gửi ¥30,000 cho gia đình')
  expect(saveVerbOf('spend', 3_480, 'JPY', 'Cơm ngoài')).toBe('chi ¥3,480 vào Cơm ngoài')
  expect(saveVerbOf('ownvn', 30_000, 'JPY', null)).toBe('chuyển ¥30,000 sang tài khoản ở VN')
})
```

- [ ] **Step 5: `EntryPage` — bỏ dải đỏ, bỏ `roleSlot`, bỏ `onSubmitRecurring`**

1. **Xóa** cả khối `{overCount > 0 && (<Link to="/budget" …>)}` và `useBudgetAlert` import. Dải này hiện ở **mọi** dạng — kể cả sáu dạng không thuộc danh mục nào — và tô đỏ dòng đầu lúc người ta đang ghi một khoản. Cảnh báo đúng chỗ đến ở Task 11.
2. **Xóa** `roleSlot` state + `<div ref={setRoleSlot} …>` + prop `roleTriggerSlot`. Tiêu đề giờ chỉ còn `Đóng` + `h1`; giữ một `<div className="w-[5.25rem] shrink-0" />` **rỗng** bên phải để `h1` không lệch tâm (nó ở đó vì nút "Đóng" bên trái giãn theo `--app-font-scale`).
3. **Xóa** `onSubmitRecurring`, `useCreateRecurringRule`, `useRunRecurringCatchUp` — dòng "Tạo quy tắc" đến ở Task 10.

- [ ] **Step 5b: Nhãn ô counterparty theo từng dạng**

Spec giữ ô `counterparty` (nó là **khóa nối** để cộng dồn vào khoản nợ đang mở — `norm(d.counterparty)`, `roleSave.ts:203`; nhãn không làm được việc đó). Nhưng một ô dùng cho ba dạng thì phải **gọi đúng tên** ở mỗi dạng.

Thêm vào `entryShape.ts`:

```ts
/** Nhãn ô counterparty. undefined = dạng này không có ô đó. */
export function counterpartyLabelOf(kind: EntryKind): string | undefined {
  switch (kind) {
    case 'split':  return 'Ai nợ mình'
    case 'lend':   return 'Cho ai vay'
    case 'borrow': return 'Vay của ai'
    default:       return undefined
  }
}
```

```ts
// entryShape.test.ts
describe('counterpartyLabelOf', () => {
  it('goi dung ten o tung dang, khong dung mot nhan chung', () => {
    expect(counterpartyLabelOf('split')).toBe('Ai nợ mình')
    expect(counterpartyLabelOf('lend')).toBe('Cho ai vay')
    expect(counterpartyLabelOf('borrow')).toBe('Vay của ai')
  })

  it('bay dang con lai khong co o do', () => {
    for (const k of ['spend','family','repay','earn','collect','between','ownvn'] as const) {
      expect(counterpartyLabelOf(k)).toBeUndefined()
    }
  })

  it('KHONG con nhan "Chia voi ai" — no la ten cua mot o gop hai viec', () => {
    for (const k of ['split','lend','borrow'] as const) {
      expect(counterpartyLabelOf(k)).not.toMatch(/Chia với ai/)
    }
  })
})
```

Rồi trong `roleFields.tsx`, `SplitFields`/`DebtFields` nhận nhãn qua prop thay vì hard-code, và **bỏ chuỗi "Chia với ai"**.

Run: `grep -rn "Chia với ai" src/` → phải ra **rỗng**.

- [ ] **Step 6: `entryRoles.ts` — xóa ba hàm đã chuyển sang bảng**

Xóa `roleTxType`, `roleAmountLabel`, `roleHidesCategoryGrid`. **Giữ** `SplitValue`/`DebtValue`/`RemitValue`, `initialSplit`/`initialDebt`/`initialRemit`, `SERVICES`, `parseRoleParam`.

Run: `grep -rn "roleTxType\|roleAmountLabel\|roleHidesCategoryGrid" src/` → phải ra **rỗng**.

- [ ] **Step 7: Chạy test để chắc nó xanh**

Run: `npx vitest run src/features/transactions/`
Expected: PASS

Run: `npx tsc -b --noEmit`
Expected: không lỗi

Run: `npx vitest run`
Expected: 155+ file xanh, ≥ 2476 test

- [ ] **Step 8: Kiểm bằng mắt ở 360px và 320px**

Chạy `so-chi-tieu-demo`, mở `/entry`, đặt viewport `360×780`:

```js
// dan vao console
(() => {
  const h = el => el ? Math.round(el.getBoundingClientRect().height) : null
  const sc = [...document.querySelectorAll('div')].find(d =>
    d.scrollHeight > d.clientHeight + 4 && getComputedStyle(d).overflowY === 'auto')
  return JSON.stringify({
    soTablist: document.querySelectorAll('[role="tablist"]').length,
    oSegmented: h(document.querySelector('[role="tab"]')),
    conNutDacBiet: !!document.body.innerText.match(/Đặc biệt/),
    tranBaoNhieu: sc ? sc.scrollHeight - sc.clientHeight : 'khong tran',
  }, null, 1)
})()
```

Kỳ vọng: `soTablist: 1` · `oSegmented: 46` · `conNutDacBiet: false`. Ở 320px kiểm thêm ô segmented **vẫn 46px** (không nhảy lên như nhãn "Chuyển khoản" cũ) và trang **không tràn ngang**.

- [ ] **Step 9: Commit**

```bash
git add src/features/transactions/
git commit -m "feat(nhap)!: truc tien ra/vao/doi cho thay Chi/Thu/Chuyen khoan

Bo nut \"Dac biet\" va ca lop dropdown: no khong phai tuy chon, no che ba loai
giao dich that. Cong ba muc o segmented thi app co sau loai chia lam hai he.

kind la state duy nhat; type/role/roleSeed thanh gia tri dan xuat luc luu.
Moi dieu kien an/hien doc tu entryShape, khong con ba hanh vi cho cung mot
phan tu.

Nut Luu MOT layout o ca 10 dang (truoc: hai nut o Chi/CK, mot nut full-width o
ba che do dac biet). Nhan nut noi thieu gi khi chua du.

Bo dai do ngan sach o dau form: no hien o moi dang, ke ca sau dang khong thuoc
danh muc nao. TagPicker khong con bi an o dang nao.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# PR 3 — hai dạng trả nợ

## Task 7: `saveDebtPayment` — bút toán trả nợ từ form Nhập

`NewDebtPayment` **bọc luôn `transaction`** nên một mutation ra cả hai. Không migration.

**Files:**
- Modify: `src/features/transactions/roleSave.ts`
- Modify: `src/features/transactions/roleSave.test.ts`

**Interfaces:**
- Consumes: `debtFlowCategoryId` (đã có, `roleSave.ts:75`) · `NewDebtPayment` từ `../../data/repo`
- Produces:
  - `interface PaymentValue { debtId: string; withTransaction: boolean; fee: number }`
  - `initialPayment(): PaymentValue`
  - `saveDebtPayment(base: RoleBase, v: PaymentValue, deps: RoleSaveDeps): Promise<void>`
  - `RoleSaveDeps.createDebtPayment` (đã có trong deps của `EntryPage`)

- [ ] **Step 1: Viết test thất bại**

```ts
// Thêm vào src/features/transactions/roleSave.test.ts
describe('saveDebtPayment — tra no tu form Nhap', () => {
  const openDebt = {
    id: 'd1', counterparty: 'Lan', direction: 'i_owe' as const,
    currency: 'JPY' as const, principal: 100_000, status: 'open' as const,
    interest_bps: null, term_months: null,
  }

  it('minh tra no = giao dich CHI, danh muc tu gan "Tra no"', async () => {
    const d = deps({ debts: [openDebt] })
    await saveDebtPayment(
      { ...base(), amount: 30_000 },
      { debtId: 'd1', withTransaction: true, fee: 0 },
      d,
    )
    expect(d.payments).toHaveLength(1)
    expect(d.payments[0].debt_id).toBe('d1')
    expect(d.payments[0].amount).toBe(30_000)
    expect(d.payments[0].transaction!.type).toBe('expense')
    expect(d.categoryNameOf(d.payments[0].transaction!.category_id!)).toBe('Trả nợ')
  })

  it('nguoi ta tra minh = giao dich THU, danh muc tu gan "Thu no"', async () => {
    const d = deps({ debts: [{ ...openDebt, id: 'd2', direction: 'owed_to_me' }] })
    await saveDebtPayment(
      { ...base(), amount: 8_200 },
      { debtId: 'd2', withTransaction: true, fee: 0 },
      d,
    )
    expect(d.payments[0].transaction!.type).toBe('income')
    expect(d.categoryNameOf(d.payments[0].transaction!.category_id!)).toBe('Thu nợ')
  })

  it('tat withTransaction thi ghi so no suong, khong sinh giao dich nao', async () => {
    const d = deps({ debts: [openDebt] })
    await saveDebtPayment(
      { ...base(), amount: 30_000 },
      { debtId: 'd1', withTransaction: false, fee: 0 },
      d,
    )
    expect(d.payments[0].transaction).toBeNull()
    expect(d.created).toHaveLength(0)
  })

  it('nhan di theo giao dich tra no', async () => {
    const d = deps({ debts: [openDebt] })
    await saveDebtPayment(
      { ...base(), amount: 30_000, tagIds: ['tag-lan'] },
      { debtId: 'd1', withTransaction: true, fee: 0 },
      d,
    )
    expect(d.payments[0].transaction!.tag_ids).toEqual(['tag-lan'])
  })

  it('khong tim thay khoan no thi nem loi, khong ghi im lang', async () => {
    const d = deps({ debts: [] })
    await expect(
      saveDebtPayment({ ...base(), amount: 1 }, { debtId: 'mat-tieu', withTransaction: true, fee: 0 }, d),
    ).rejects.toThrow(/khoản nợ/i)
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó thất bại**

Run: `npx vitest run src/features/transactions/roleSave.test.ts`
Expected: FAIL — `saveDebtPayment is not a function`

- [ ] **Step 3: Viết `saveDebtPayment`**

```ts
/** Giá trị field riêng của hai dạng trả nợ (repay / collect). */
export interface PaymentValue {
  /** Khoản nợ đang mở được chọn. '' = chưa chọn. */
  debtId: string
  /** Có chuyển tiền thật (đổi số dư) hay chỉ ghi sổ nợ. Giống DebtPaymentSheet. */
  withTransaction: boolean
  /** Phí chuyển (minor units); 0 = không. Ghi riêng thành khoản chi "Tài chính". */
  fee: number
}

export const initialPayment = (): PaymentValue => ({
  debtId: '',
  withTransaction: true,
  fee: 0,
})

/**
 * Ghi một lần trả nợ từ form Nhập. Đường vào thứ hai cho DebtPaymentSheet —
 * dùng ĐÚNG payload đó, không dựng lối riêng: `NewDebtPayment` bọc luôn
 * `transaction` bên trong nên một mutation ra cả hai, không bút toán tay.
 *
 * `type` KHÔNG lấy từ dạng mà suy từ chiều khoản nợ (xem entryShape: repay và
 * collect đều có `txType: null`): mình trả (i_owe) = chi; người ta trả mình
 * (owed_to_me) = thu.
 */
export async function saveDebtPayment(
  base: RoleBase,
  v: PaymentValue,
  deps: RoleSaveDeps,
): Promise<void> {
  const debt = deps.debts.find((d) => d.id === v.debtId && d.status === 'open')
  // Ném chứ không lặng lẽ bỏ: ghi một lần trả vào hư không thì sổ nợ và số dư
  // lệch nhau mà không ai biết.
  if (!debt) throw new Error('Không tìm thấy khoản nợ đang mở này.')

  const txType = debt.direction === 'i_owe' ? 'expense' : 'income'
  let transaction: NewTransaction | null = null
  if (v.withTransaction) {
    const categoryId = await debtFlowCategoryId('repay', debt.direction, deps)
    transaction = {
      type: txType,
      amount: base.amount,
      to_amount: null,
      category_id: categoryId,
      account_id: base.accountId,
      to_account_id: null,
      occurred_on: base.occurredOn,
      note: base.note.trim() || `${txType === 'expense' ? 'Trả nợ' : 'Thu nợ'} · ${debt.counterparty}`,
      tag_ids: base.tagIds,
    }
  }
  await deps.createDebtPayment({
    debt_id: debt.id,
    amount: base.amount,
    paid_on: base.occurredOn,
    note: base.note.trim(),
    transaction,
  })
  // Phí là một khoản CHI riêng, không cộng vào gốc nợ — cùng nếp với debt.fee.
  if (v.fee > 0) await saveWithFee(null, v.fee, 'Phí chuyển tiền', deps, base)
}
```

⚠️ Nếu chữ ký `saveWithFee` hiện tại không nhận `null` cho bút toán chính, **đừng** nới nó — viết thẳng một `createTransaction` cho phí vào danh mục `PHI_CAT`, y như `saveDebtEntry` đang làm. Đọc `saveDebtEntry` để chép đúng lối.

- [ ] **Step 4: Chạy test để chắc nó xanh**

Run: `npx vitest run src/features/transactions/roleSave.test.ts`
Expected: PASS. Có thể phải nới helper `deps()` để thu `payments` và tra tên danh mục — thêm vào helper, đừng sửa test.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/roleSave.ts src/features/transactions/roleSave.test.ts
git commit -m "feat(nhap): saveDebtPayment — ghi tra no tu form Nhap

Duong vao thu hai cho DebtPaymentSheet, dung DUNG payload NewDebtPayment (no
boc luon transaction nen mot mutation ra ca hai) — khong migration, khong but
toan tay.

type suy tu CHIEU khoan no, khong tu dang: minh tra = chi, nguoi ta tra = thu.
Khong tim thay khoan no thi NEM, khong ghi im lang.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: `DebtPickerField` + nối `repay`/`collect` vào form

**Dạng duy nhất có field phụ thuộc nhau**: `matchingAccounts` chỉ nhận ví **cùng loại tiền với khoản nợ**, nên chọn nợ **trước**, chọn ví **sau**.

**Files:**
- Create: `src/features/transactions/DebtPickerField.tsx`
- Create: `src/features/transactions/debtPick.ts`
- Test: `src/features/transactions/debtPick.test.ts`
- Modify: `src/features/transactions/TransactionForm.tsx`
- Modify: `src/features/transactions/EntryPage.tsx`

**Interfaces:**
- Consumes: `useDebts()`, `useDebtPayments()` từ `../../hooks/queries` · `remainingOf` từ `../debts/aggregate` · `PaymentValue` + `initialPayment` (Task 7)
- Produces:
  - `openDebtsFor(debts, payments, direction): (DebtRow & { remaining: number })[]`
  - `accountsForDebt(accounts, debt: DebtRow | undefined): AccountRow[]`
  - `prefillFor(debts, payments, debtId): number | null`
  - `DebtPickerField({ value, onChange, debts, payments, direction })` — `onChange(next: PaymentValue, prefillAmount?: number)`

- [ ] **Step 1: Viết test thất bại**

Chỗ dễ sai của task này **không phải** JSX mà là **lọc khoản nợ** (đúng chiều, đang mở, còn nợ) và **lọc ví theo loại tiền của khoản nợ**. Rút cả hai ra module thuần `debtPick.ts` rồi test — component chỉ còn việc bày ra.

**Files (thêm):** Create `src/features/transactions/debtPick.ts` + `debtPick.test.ts`

```ts
// src/features/transactions/debtPick.test.ts
import { describe, expect, it } from 'vitest'
import { accountsForDebt, openDebtsFor, prefillFor } from './debtPick'

const DEBTS = [
  { id: 'd1', counterparty: 'Lan',  direction: 'i_owe',      currency: 'JPY', principal: 100_000, status: 'open' },
  { id: 'd2', counterparty: 'Hùng', direction: 'owed_to_me', currency: 'JPY', principal:  50_000, status: 'open' },
  { id: 'd3', counterparty: 'Cũ',   direction: 'i_owe',      currency: 'JPY', principal:  10_000, status: 'settled' },
  { id: 'd4', counterparty: 'Mẹ',   direction: 'i_owe',      currency: 'VND', principal: 5_000_000, status: 'open' },
] as never[]

describe('openDebtsFor — chi khoan DANG MO va DUNG CHIEU', () => {
  it('loc theo chieu', () => {
    expect(openDebtsFor(DEBTS, [], 'i_owe').map((d) => d.id)).toEqual(['d1', 'd4'])
    expect(openDebtsFor(DEBTS, [], 'owed_to_me').map((d) => d.id)).toEqual(['d2'])
  })

  it('bo khoan da tat toan', () => {
    expect(openDebtsFor(DEBTS, [], 'i_owe').map((d) => d.id)).not.toContain('d3')
  })

  it('mang theo so CON LAI, khong phai so goc', () => {
    const out = openDebtsFor(DEBTS, [{ debt_id: 'd1', amount: 30_000 }] as never[], 'i_owe')
    expect(out.find((d) => d.id === 'd1')!.remaining).toBe(70_000)
  })

  it('tra het roi (con lai 0) thi khong bay ra nua — khong con gi de tra', () => {
    const out = openDebtsFor(DEBTS, [{ debt_id: 'd1', amount: 100_000 }] as never[], 'i_owe')
    expect(out.map((d) => d.id)).toEqual(['d4'])
  })

  it('lan tra AM la giai ngan them → con lai TANG (xem DebtPaymentRow)', () => {
    const out = openDebtsFor(DEBTS, [{ debt_id: 'd1', amount: -20_000 }] as never[], 'i_owe')
    expect(out.find((d) => d.id === 'd1')!.remaining).toBe(120_000)
  })
})

describe('accountsForDebt — v1 tranh xuyen te', () => {
  const ACC = [
    { id: 'a1', currency: 'JPY', is_archived: false },
    { id: 'a2', currency: 'VND', is_archived: false },
    { id: 'a3', currency: 'JPY', is_archived: true },
  ] as never[]

  it('chi vi CUNG loai tien voi khoan no', () => {
    expect(accountsForDebt(ACC, DEBTS[0]).map((a) => a.id)).toEqual(['a1'])
    expect(accountsForDebt(ACC, DEBTS[3]).map((a) => a.id)).toEqual(['a2'])
  })

  it('chua chon khoan no thi bay het vi chua luu tru', () => {
    expect(accountsForDebt(ACC, undefined).map((a) => a.id)).toEqual(['a1', 'a2'])
  })

  it('bo vi da luu tru o ca hai nhanh', () => {
    expect(accountsForDebt(ACC, DEBTS[0]).map((a) => a.id)).not.toContain('a3')
  })
})

describe('prefillFor — dien san so con lai', () => {
  it('chon khoan no thi dien san TOAN BO so con lai', () => {
    // Tra du la ca thuong, va DebtPaymentSheet (duong vao thu nhat) cung mac dinh vay.
    // Hai duong vao cung mot vat thi phai cung mot nep.
    expect(prefillFor(DEBTS, [{ debt_id: 'd1', amount: 30_000 }] as never[], 'd1')).toBe(70_000)
  })

  it('khong tim thay khoan no thi khong dien gi', () => {
    expect(prefillFor(DEBTS, [], 'mat-tieu')).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó thất bại**

Run: `npx vitest run src/features/transactions/debtPick.test.ts`
Expected: FAIL — `Failed to resolve import "./debtPick"`

- [ ] **Step 2b: Viết `debtPick.ts`**

Dùng `remainingOf(debt, payments)` từ `../debts/aggregate` — **không** tự tính lại (`principal - paidOf`). `openDebtsFor` lọc `status === 'open' && direction === dir && remaining > 0`, trả về `(DebtRow & { remaining: number })[]`.

- [ ] **Step 3: Viết `DebtPickerField.tsx`**

Dựng theo đúng lối `roleFields.tsx` (dùng `blockCls`, `labelCls`, `inputCls` đã có ở đó — **đừng** tự đặt class mới). Component **không tự lọc gì** — mọi quyết định đã ở `debtPick.ts`:

```tsx
const open = openDebtsFor(debts, payments, direction)

// Không có khoản nợ nào đang mở → nói ra, đừng để ô chọn rỗng. (Cùng nếp với
// nhánh "Chưa có tài khoản JPY" của RemitFields.)
if (open.length === 0) {
  return (
    <p className={/* dùng class của nhánh cảnh báo trong roleFields */}>
      Chưa có khoản nợ nào đang mở ở chiều này. Ghi "Cho vay" hoặc "Vay được" trước.
    </p>
  )
}
// ...
onChange(
  { ...value, debtId: id },
  // Điền sẵn TOÀN BỘ số còn lại: trả đủ là ca thường, và DebtPaymentSheet (đường vào
  // thứ nhất) cũng mặc định vậy. Hai đường vào cùng một vật thì phải cùng một nếp,
  // nếu không người dùng học một cái rồi bị cái kia lừa.
  prefillFor(debts, payments, id) ?? undefined,
)
```

Mỗi dòng trong hộp chọn nói **còn lại bao nhiêu**, không phải số gốc: `${d.counterparty} · còn ${formatMoney(d.remaining, d.currency)}`.

- [ ] **Step 4: Nối vào `TransactionForm`**

1. Thêm `const [paymentVal, setPaymentVal] = useState(initialPayment())`.
2. Đặt `<DebtPickerField>` **dưới** ô số tiền, cùng chỗ các field riêng của vai trò hiện nay — **không** đặt trên, vì hai hàng đầu (segmented + Dạng) phải đứng y một chỗ ở mọi dạng.
3. **Lọc `pickerAccounts` theo loại tiền của khoản nợ đã chọn** khi `kind` là `repay`/`collect`:

```tsx
// "v1 tránh xuyên tệ" (DebtPaymentSheet): chỉ cho trả từ ví CÙNG loại tiền với
// khoản nợ. Nên ở hai dạng này danh sách ví PHỤ THUỘC khoản nợ đã chọn — đây là
// chỗ duy nhất của form có hai field phụ thuộc nhau.
const payDebt = shapeOf(kind).writes === 'debtPayment'
  ? debts.find((d) => d.id === paymentVal.debtId)
  : undefined
const pickerAccounts = accountsForDebt(activeAccounts, payDebt)
```

⚠️ Nếu ví đang chọn **rơi ra khỏi** danh sách đã lọc (chọn ví JPY rồi chọn khoản nợ VND), phải **gieo lại** `accountId` về ví đầu tiên hợp lệ — để nguyên thì form giữ một `accountId` không còn trong picker và nút Lưu sáng lên với một ví người dùng không thấy.

4. `handleSubmit` thêm nhánh: `shapeOf(kind).writes === 'debtPayment'` → gọi `onSubmitPayment({ base, value: paymentVal })`.
5. `entryValidation` thêm câu thiếu: chưa chọn nợ → `'Còn thiếu: chọn khoản nợ.'` (thêm test trong `entryValidation.test.ts`).

- [ ] **Step 5: Nối vào `EntryPage`**

Thêm `useDebtPayments()`, đưa `payments` xuống form, và thêm handler:

```tsx
onSubmitPayment={async (p) => {
  await saveDebtPayment(p.base, p.value, roleDeps())
  navigate('/so')
}}
```

⚠️ `roleDeps()` **đã có** `createDebtPayment` — kiểm lại bằng `grep -n "createDebtPayment" src/features/transactions/EntryPage.tsx`. Nếu chưa có trong `roleDeps()` thì thêm.

- [ ] **Step 6: Chạy test**

Run: `npx vitest run src/features/transactions/ && npx tsc -b --noEmit`
Expected: PASS, không lỗi type

- [ ] **Step 7: Kiểm bằng tay trên demo**

Mở `/entry` → chip **Tôi trả nợ**. Kỳ vọng: hộp "Khoản nợ nào" chỉ bày nợ `i_owe` đang mở kèm số còn lại · chọn một khoản thì ô số tiền **điền sẵn số còn lại** · picker tài khoản **chỉ còn ví cùng loại tiền** · công tắc "trừ tiền thật" có mặt. Lưu xong mở `/debts` xem `còn lại` giảm đúng.

- [ ] **Step 8: Commit**

```bash
git add src/features/transactions/
git commit -m "feat(nhap): hai dang tra no — Toi tra no va Nguoi tra lai (10 dang)

Form Nhap thanh duong vao cho ca hai chieu tra no; truoc phai di No -> mo
khoan -> Ghi tra. Bang B23 cua goi chi co chieu thu vao, thieu chieu ra du
DebtPaymentSheet ghi duoc ca hai — them mot ma bo chieu kia thi hang chip lai
vo quy tac.

Day la dang DUY NHAT co field phu thuoc nhau: chon no TRUOC, chon vi SAU, vi
chi cho tra tu vi cung loai tien voi khoan no.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# PR 4 — Sẽ chi, và bỏ dropdown Lặp

## Task 9: `plannedFromEntry.ts` — dựng `NewPlannedExpense`, neo `'month'` hai chỗ

`PlannedFormSheet` neo `due_on` về ngày 1 ở **hai chỗ** (`onChange` *và* submit). Làm một chỗ thì đổi `Đúng ngày` → `Khoảng tháng` sau khi đã chọn ngày 17 sẽ lọt ngày giữa tháng vào DB.

**Files:**
- Create: `src/features/transactions/plannedFromEntry.ts`
- Test: `src/features/transactions/plannedFromEntry.test.ts`

**Interfaces:**
- Consumes: `NewPlannedExpense` từ `../../data/repo` · `DuePrecision`, `CurrencyCode` từ `../../types/database.types`
- Produces:
  - `firstOfMonth(iso: string): string`
  - `interface PlannedDraft { title: string; amount: number; currency: CurrencyCode; dueOn: string; precision: DuePrecision; remind: boolean; remindDays: string; categoryId: string | null; note: string; tagIds: string[] }`
  - `initialPlannedDraft(currency: CurrencyCode): PlannedDraft`
  - `plannedFromEntry(d: PlannedDraft): NewPlannedExpense`
  - `plannedMissing(d: PlannedDraft): string | null`

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, expect, it } from 'vitest'
import {
  firstOfMonth, initialPlannedDraft, plannedFromEntry, plannedMissing,
} from './plannedFromEntry'

const draft = (over = {}) => ({ ...initialPlannedDraft('JPY'), title: 'Sửa nhà', ...over })

describe('neo ngay 1 khi do chac chan la "khoang thang"', () => {
  it('firstOfMonth giu nam-thang, ep ngay ve 01', () => {
    expect(firstOfMonth('2026-10-17')).toBe('2026-10-01')
    expect(firstOfMonth('2026-10-01')).toBe('2026-10-01')
  })

  it('precision month thi due_on ra ngay 1 du nguoi dung da chon ngay 17', () => {
    // Ca nay chinh la ly do phai neo o CA HAI cho: chon "Dung ngay" 17/10 roi doi
    // sang "Khoang thang" thi dueOn con nguyen 2026-10-17 trong state.
    const out = plannedFromEntry(draft({ dueOn: '2026-10-17', precision: 'month' }))
    expect(out.due_on).toBe('2026-10-01')
    expect(out.due_precision).toBe('month')
  })

  it('precision day thi giu nguyen ngay', () => {
    expect(plannedFromEntry(draft({ dueOn: '2026-08-20', precision: 'day' })).due_on)
      .toBe('2026-08-20')
  })
})

describe('nhac la TUY CHON cua khoan sap chi, khong phai ban chat', () => {
  it('mac dinh cua form moi: BAT nhac, 0 ngay', () => {
    const d = initialPlannedDraft('JPY')
    expect(d.remind).toBe(true)
    expect(d.remindDays).toBe('0')
    expect(plannedFromEntry({ ...d, title: 'x' }).remind_days_before).toBe(0)
  })

  it('tat nhac thi remind_days_before = null, khong phai 0', () => {
    // null = chi nam trong danh sach cho nho, khong keu. 0 = keu dung ngay den han.
    expect(plannedFromEntry(draft({ remind: false })).remind_days_before).toBeNull()
  })

  it('so ngay chi nhan 0-99 (rang buoc DB)', () => {
    expect(plannedFromEntry(draft({ remindDays: '150' })).remind_days_before).toBe(99)
    expect(plannedFromEntry(draft({ remindDays: '-5' })).remind_days_before).toBe(0)
    expect(plannedFromEntry(draft({ remindDays: '' })).remind_days_before).toBe(0)
    expect(plannedFromEntry(draft({ remindDays: 'abc' })).remind_days_before).toBe(0)
  })
})

describe('dieu kien luu: CHI CAN co ten', () => {
  it('co ten la luu duoc, so tien va danh muc de trong duoc', () => {
    expect(plannedMissing(draft({ amount: 0, categoryId: null }))).toBeNull()
  })

  it('khong ten thi khong luu duoc, va cau thieu dung chu cua form that', () => {
    expect(plannedMissing(draft({ title: '   ' }))).toBe('Còn thiếu: chi cái gì.')
  })
})

describe('KHONG co o tai khoan', () => {
  it('payload khong mang account_id — chua tru tien thi chua can biet tru tu dau', () => {
    expect('account_id' in plannedFromEntry(draft())).toBe(false)
  })

  it('payload dung bang 10 khoa cua form that', () => {
    expect(Object.keys(plannedFromEntry(draft())).sort()).toEqual([
      'amount', 'category_id', 'currency', 'due_on', 'due_precision',
      'note', 'remind_days_before', 'tag_ids', 'title',
    ])
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó thất bại**

Run: `npx vitest run src/features/transactions/plannedFromEntry.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Viết `plannedFromEntry.ts`**

```ts
import type { NewPlannedExpense } from '../../data/repo'
import type { CurrencyCode, DuePrecision } from '../../types/database.types'

/** Neo về ngày 1. Kiểu 'month' đòi `due_on` là ngày 1 — ép ở client để không nhận
 *  lỗi Postgres từ một ô người dùng không thấy. */
export function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export interface PlannedDraft {
  title: string
  /** 0 = chưa biết bao nhiêu. */
  amount: number
  currency: CurrencyCode
  dueOn: string
  precision: DuePrecision
  remind: boolean
  /** chuỗi người dùng gõ; ép về 0–99 lúc dựng payload. */
  remindDays: string
  categoryId: string | null
  note: string
  tagIds: string[]
}

export function initialPlannedDraft(currency: CurrencyCode): PlannedDraft {
  return {
    title: '',
    amount: 0,
    currency,
    dueOn: '',
    precision: 'day',
    // Mặc định của form thật: BẬT nhắc, 0 ngày. (`planned?.remind_days_before !== null`
    // với `planned = null` cho ra `true`.)
    remind: true,
    remindDays: '0',
    categoryId: null,
    note: '',
    tagIds: [],
  }
}

/** `remind_days_before` chỉ nhận 0–99 (ràng buộc DB). */
function clampDays(raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return Math.min(99, Math.max(0, Math.round(n)))
}

export function plannedFromEntry(d: PlannedDraft): NewPlannedExpense {
  return {
    title: d.title.trim(),
    amount: d.amount,
    currency: d.currency,
    // Neo lần thứ HAI ở đây, dù ô ngày đã neo lúc onChange: đổi "Đúng ngày" →
    // "Khoảng tháng" SAU khi đã chọn ngày 17 thì state còn nguyên ngày 17.
    due_on: d.precision === 'month' ? firstOfMonth(d.dueOn) : d.dueOn,
    due_precision: d.precision,
    // null = chỉ nằm trong danh sách cho nhớ, KHÔNG kêu. 0 = kêu đúng ngày đến hạn.
    // Hai thứ khác nhau — "sửa nhà tháng 10" khác "đóng phí vệ sinh 20/8".
    remind_days_before: d.remind ? clampDays(d.remindDays) : null,
    category_id: d.categoryId,
    note: d.note.trim(),
    tag_ids: d.tagIds,
  }
}

/** Điều kiện lưu: CHỈ CẦN có tên. Số tiền, danh mục, ghi chú đều để trống được. */
export function plannedMissing(d: PlannedDraft): string | null {
  return d.title.trim() ? null : 'Còn thiếu: chi cái gì.'
}
```

- [ ] **Step 4: Chạy test để chắc nó xanh**

Run: `npx vitest run src/features/transactions/plannedFromEntry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/plannedFromEntry.ts src/features/transactions/plannedFromEntry.test.ts
git commit -m "feat(nhap): plannedFromEntry — dung NewPlannedExpense tu state form

Neo due_on ve ngay 1 khi precision='month' — PlannedFormSheet neo o HAI cho
(onChange + submit), lam mot cho thi doi Dung ngay -> Khoang thang sau khi da
chon ngay 17 se lot ngay giua thang vao DB.

remind_days_before: null = chi nam trong danh sach cho nho, 0 = keu dung ngay
den han. Hai thu khac nhau. Ep 0-99 theo rang buoc DB.

Payload khong co account_id: khoan sap chi chua tru tien nen chua can biet tru
tu dau.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: `PlannedFields` + segmented `Đã chi | Sẽ chi` + bỏ dropdown Lặp

**Files:**
- Create: `src/features/transactions/PlannedFields.tsx`
- Test: `src/features/transactions/plannedCopy.test.ts`
- Modify: `src/features/transactions/TransactionForm.tsx`
- Modify: `src/features/transactions/EntryPage.tsx`
- Modify: `src/features/transactions/entryShape.ts` (thêm `PHASE_LABEL`)

**Interfaces:**
- Consumes: `PlannedDraft`, `firstOfMonth` (Task 9) · `SegmentedControl` size `lg`
- Produces: `PlannedFields({ value, onChange, categories })` · `PHASE_LABEL: Record<Direction, { done: string; future: string; dateLabel: string }>` trong `entryShape.ts`

- [ ] **Step 1: Viết test thất bại**

Hai chốt của task này kiểm được **không cần DOM**: chuỗi đã chết phải biến mất, và chuỗi của form thật phải có mặt **nguyên văn**. Đây là chỗ test đọc file mạnh hơn test render — nó soát cả `PlannedFields` **và** `PlannedFormSheet` để hai form không lệch chữ.

```ts
// src/features/transactions/plannedCopy.test.ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const fields = readFileSync('src/features/transactions/PlannedFields.tsx', 'utf8')
const form = readFileSync('src/features/transactions/TransactionForm.tsx', 'utf8')
const page = readFileSync('src/features/transactions/EntryPage.tsx', 'utf8')
const sheet = readFileSync('src/features/planned/PlannedFormSheet.tsx', 'utf8')

const DEAD = ['Khoản sắp tới', 'Tạo lời nhắc', 'Tên lời nhắc', 'Nhắc sau']

describe('ba chuoi da chet khong duoc quay lai', () => {
  it.each(DEAD)('"%s" khong con o dau trong luong Nhap', (dead) => {
    for (const src of [fields, form, page]) expect(src).not.toMatch(new RegExp(dead))
  })
})

describe('dung DUNG chu cua PlannedFormSheet, khong bia', () => {
  const COPY = [
    'Chi cái gì', 'đóng phí vệ sinh', 'Ước tính', 'để trống nếu chưa biết',
    'Chắc tới đâu', 'Đúng ngày', 'Khoảng tháng', 'Ngày đến hạn', 'Tháng dự kiến',
    'Nhắc tôi', 'Nhắc trước', '0 = đúng ngày đến hạn', '— Chưa chọn —',
  ]

  it.each(COPY)('PlannedFields co chuoi "%s"', (s) => {
    expect(fields).toContain(s)
  })

  it.each(COPY)('PlannedFormSheet cung co "%s" — hai form khong lech chu', (s) => {
    expect(sheet).toContain(s)
  })
})

describe('chu "nhac" chi o o tich va dong phu cua no', () => {
  it('dem so lan chuoi "Nhắc" xuat hien — nhieu hon 3 la da tran ra cho khac', () => {
    // "Nhắc tôi" (ô tích) + "Nhắc trước" (dòng phụ) + aria-label của ô số ngày.
    expect((fields.match(/Nhắc/g) ?? []).length).toBeLessThanOrEqual(3)
  })
})

describe('KHONG co o tai khoan, KHONG co o Lap', () => {
  it('PlannedFields khong nhac tai khoan', () => {
    // Khoản sắp chi chưa trừ tiền nên chưa cần biết trừ từ đâu; chọn ví là việc
    // của lúc xác nhận đã chi.
    expect(fields).not.toMatch(/AccountPicker|accountId|account_id/)
  })

  it('form Nhap khong con dropdown Lap lai', () => {
    for (const dead of ['REPEAT_OPTIONS', 'REPEAT_LABEL', 'REPEAT_MENU_LABEL', 'repeatOpen']) {
      expect(form).not.toMatch(new RegExp(dead))
    }
    expect(page).not.toMatch(/onSubmitRecurring|useCreateRecurringRule|useRunRecurringCatchUp/)
  })

  it('thay bang mot dong dan sang RecurringFormSheet', () => {
    expect(form).toMatch(/Khoản này lặp lại\?/)
    expect(form).toMatch(/\/recurring/)
  })
})

describe('o so ngay la o TU DO, khong phai bon chip preset', () => {
  it('khong co chip preset — chung chan mat gia tri hop le khac va tao hai UI cho mot cot', () => {
    for (const preset of ['Không nhắc', '3 ngày', '7 ngày', '30 ngày']) {
      expect(fields).not.toContain(preset)
    }
    expect(fields).toMatch(/type="number"/)
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó thất bại**

Run: `npx vitest run src/features/transactions/plannedCopy.test.ts`
Expected: FAIL — `ENOENT` vì `PlannedFields.tsx` chưa có

- [ ] **Step 3: Viết `PlannedFields.tsx`**

Đọc `src/features/planned/PlannedFormSheet.tsx` **trước khi viết** và chép đúng từng nhãn. Ô ngày dùng `type={precision === 'day' ? 'date' : 'month'}` nguyên bản của trình duyệt. Neo ngày 1 **trong `onChange`** của cả ô ngày **và** của nút "Khoảng tháng":

```tsx
onChange={(p) => onChange({
  ...value, precision: p,
  // Neo NGAY LÚC ĐỔI, không chỉ lúc submit: hai chỗ, đúng như form thật.
  dueOn: p === 'month' && value.dueOn ? firstOfMonth(value.dueOn) : value.dueOn,
})}
```

- [ ] **Step 4: Thêm `PHASE_LABEL` vào `entryShape.ts` + test**

```ts
/** Nhãn hai pha theo hướng — "Đã chi" là TRẠNG THÁI CỦA KHOẢN TIỀN, còn "Nhắc sau"
 *  là VIỆC APP LÀM CHO BẠN; tiếng Việt còn đọc ra như "để đó lát nhắc lại". */
export const PHASE_LABEL: Record<Direction, { done: string; future: string; dateLabel: string }> = {
  out: { done: 'Đã chi', future: 'Sẽ chi', dateLabel: 'Ngày đến hạn' },
  in: { done: 'Đã thu', future: 'Sẽ thu', dateLabel: 'Dự kiến' },
  move: { done: 'Đã chuyển', future: 'Sẽ chuyển', dateLabel: 'Dự kiến' },
}
```

```ts
// entryShape.test.ts
it('nhan hai pha di theo huong, va KHONG dung chu "Nhac sau"', () => {
  expect(PHASE_LABEL.out).toEqual({ done: 'Đã chi', future: 'Sẽ chi', dateLabel: 'Ngày đến hạn' })
  expect(PHASE_LABEL.in.future).toBe('Sẽ thu')
  expect(PHASE_LABEL.move.future).toBe('Sẽ chuyển')
  for (const p of Object.values(PHASE_LABEL)) {
    expect(p.done).not.toMatch(/nhắc/i)
    expect(p.future).not.toMatch(/nhắc/i)
  }
})
```

- [ ] **Step 5: `TransactionForm` — segmented hai pha, bỏ chuông và dropdown Lặp**

1. **Xóa** nút chuông `remindLater` (`TransactionForm.tsx:1034-1053`) và toàn bộ khối dropdown "Lặp lại" (`:1055-1108`).
2. Thêm **một dòng riêng** dưới hàng Dạng, chỉ khi `!initial && onSubmitPlanned`:

```tsx
{/* Một dòng RIÊNG, ô 44px — không nhét vào hàng tài khoản/ngày như nút chuông cũ.
    "Đã chi" là trạng thái của khoản tiền; "Nhắc sau" là việc app làm cho bạn. */}
<SegmentedControl
  size="lg"
  label="Khoản này đã xảy ra chưa"
  value={plannedMode ? 'future' : 'done'}
  onChange={(v) => setPlannedMode(v === 'future')}
  items={[
    { value: 'done', label: PHASE_LABEL[direction].done },
    { value: 'future', label: PHASE_LABEL[direction].future },
  ]}
/>
```

3. Bật `plannedMode` thì: hiện `<PlannedFields>` thay các field thường · chip **"chưa xảy ra"** (`bg-state-warn-bg text-state-warn-fg`) kèm dòng "chưa trừ tiền, chưa vào trần" · **ô hoàn tiền biến mất** · focus nhảy sang **ô tên** · nhãn nút Lưu = `'Lưu'` (không "Tạo lời nhắc").
4. Cuối form thêm dòng dẫn sang quy tắc định kỳ:

```tsx
{/* Thay dropdown "Lặp lại": form Nhập chỉ ghi được `frequency`, còn quy tắc thật có
    mode auto|remind, isPaused, endOn, isRefund — hai đường ghi cùng một vật thì sẽ
    lệch nhau, và người dùng không thấy mình đang thiếu gì. */}
<Link to="/recurring?new=1" className="px-1 text-xs text-fg-accent underline">
  Khoản này lặp lại? → Tạo quy tắc
</Link>
```

⚠️ Kiểm `RecurringPage` có nhận `?new=1` để mở sẵn `RecurringFormSheet` chưa: `grep -n "searchParams\|new" src/features/recurring/RecurringPage.tsx`. Chưa thì thêm — một dòng dẫn tới trang rồi bắt bấm thêm một nút nữa là nửa vời.

- [ ] **Step 6: `EntryPage` — `onSubmitPlanned` dùng `plannedFromEntry`**

Đổi toast `'Đã tạo lời nhắc'` → `'Đã thêm khoản sắp chi'` (chuỗi cũ nằm trong ba chuỗi đã chết).

- [ ] **Step 7: Chạy test**

Run: `npx vitest run src/features/transactions/ && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 8: Kiểm hành vi trên demo**

Mở `/entry`, bật **Sẽ chi**. Kỳ vọng, kiểm từng cái: số dư tài khoản **không đổi** · trần ngân sách **không đổi** · ô hoàn tiền **biến mất** · chỉ gõ tên là nút Lưu sáng · tắt "Nhắc tôi" rồi lưu thì `/` (Bản tin) **không sinh việc nào** · khoản vừa lưu và khoản lưu từ `/planned` ra **cùng một dòng** trong danh sách sắp chi.

- [ ] **Step 9: Commit**

```bash
git add src/features/transactions/ src/features/recurring/
git commit -m "feat(nhap): segmented Da chi|Se chi, bo dropdown Lap lai

\"Da chi\" la TRANG THAI CUA KHOAN TIEN; \"Nhac sau\" la viec app lam cho ban, va
tieng Viet con doc ra nhu \"de do lat nhac lai\". Nhan di theo huong: Da thu|Se
thu, Da chuyen|Se chuyen.

Bo dropdown Lap lai: form Nhap chi ghi duoc frequency, con quy tac that co mode
auto|remind + isPaused + endOn + isRefund. Hai duong ghi cung mot vat thi se
lech nhau. Thay bang mot dong dan sang RecurringFormSheet.

Khong them cot nao: payload dung bang planned_expenses da co.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# PR 5 — cảnh báo đúng chỗ, hàng danh mục, ô số tiền, contrast

## Task 11: `categoryAlert.ts` — cảnh báo về đúng danh mục vừa chọn

**Files:**
- Create: `src/features/transactions/categoryAlert.ts`
- Test: `src/features/transactions/categoryAlert.test.ts`

**Interfaces:**
- Consumes: `CapBase` từ `./entryShape` · `formatMoney` từ `../../lib/money` (tra tên thật)
- Produces: `categoryAlert(i: AlertInput): string | null`

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, expect, it } from 'vitest'
import { categoryAlert } from './categoryAlert'

const base = {
  categoryName: 'Ăn uống', currency: 'JPY' as const,
  cap: 100_000, spent: 107_327, amount: 4_200, myShare: 4_200,
  capBase: 'full' as const,
}

describe('canh bao ve DUNG danh muc vua chon', () => {
  it('chua chon danh muc thi khong canh bao gi', () => {
    expect(categoryAlert({ ...base, categoryName: null })).toBeNull()
  })

  it('dang khong vao tran thi khong canh bao', () => {
    expect(categoryAlert({ ...base, capBase: 'none' })).toBeNull()
  })

  it('chua dat han muc thi khong canh bao', () => {
    expect(categoryAlert({ ...base, cap: null })).toBeNull()
  })

  it('chua vuot thi khong canh bao', () => {
    expect(categoryAlert({ ...base, spent: 50_000, amount: 1_000 })).toBeNull()
  })

  it('da vuot thi noi vuot bao nhieu va cong vao thanh bao nhieu', () => {
    expect(categoryAlert(base))
      .toBe('Ăn uống đã vượt trần ¥7,327. Cộng ¥4,200 thì thành ¥11,527.')
  })

  it('TRA HO cong PHAN MINH CHIU, khong phai tong da tra', () => {
    // Ban dang chay se tinh ca ¥12,400 — sai dung ¥8,200.
    const out = categoryAlert({
      ...base, capBase: 'myShare', amount: 12_400, myShare: 4_200,
    })
    expect(out).toBe('Ăn uống đã vượt trần ¥7,327. Cộng ¥4,200 phần mình chịu thì thành ¥11,527.')
    expect(out).not.toMatch(/12,400/)
  })

  it('chua vuot nhung khoan nay lam vuot thi canh bao truoc', () => {
    expect(categoryAlert({ ...base, spent: 98_000, amount: 4_200, myShare: 4_200 }))
      .toBe('Ăn uống còn ¥2,000 trong trần. Khoản ¥4,200 này làm vượt ¥2,200.')
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó thất bại**

Run: `npx vitest run src/features/transactions/categoryAlert.test.ts`
Expected: FAIL

- [ ] **Step 3: Viết `categoryAlert.ts`**

```ts
import type { CurrencyCode } from '../../types/database.types'
import { formatMoney } from '../../lib/money' // tra ten that trong repo
import type { CapBase } from './entryShape'

export interface AlertInput {
  /** null = chưa chọn danh mục → chưa có gì để cảnh báo. */
  categoryName: string | null
  currency: CurrencyCode
  /** hạn mức tháng này; null = chưa đặt. */
  cap: number | null
  /** đã chi trong danh mục này, tháng này, CHƯA tính khoản đang nhập. */
  spent: number
  /** số tiền đang nhập (toàn bộ). */
  amount: number
  /** phần mình chịu — bằng `amount` ở mọi dạng trừ Trả hộ. */
  myShare: number
  capBase: CapBase
}

/**
 * Câu cảnh báo về ĐÚNG danh mục vừa chọn, chỉ hiện sau khi chọn.
 *
 * Thay dải đỏ "4 danh mục vượt ngân sách tháng này" ở đầu form: dải đó hiện ở MỌI
 * dạng — kể cả sáu dạng không thuộc danh mục nào — và người ta đang ghi một khoản,
 * tin đó không giúp gì lúc này mà lại tô đỏ dòng đầu.
 */
export function categoryAlert(i: AlertInput): string | null {
  if (!i.categoryName || i.capBase === 'none' || i.cap === null) return null

  // Ở Trả hộ, con số cộng vào là PHẦN MÌNH CHỊU, không phải tổng đã trả — bản đang
  // chạy sẽ tính cả ¥12,400 thay vì ¥4,200, sai đúng bằng phần người khác nợ lại.
  const add = i.capBase === 'myShare' ? i.myShare : i.amount
  const suffix = i.capBase === 'myShare' ? ' phần mình chịu' : ''
  const m = (v: number) => formatMoney(v, i.currency)

  if (i.spent > i.cap) {
    const over = i.spent - i.cap
    return `${i.categoryName} đã vượt trần ${m(over)}. Cộng ${m(add)}${suffix} thì thành ${m(over + add)}.`
  }
  const left = i.cap - i.spent
  if (add > left) {
    return `${i.categoryName} còn ${m(left)} trong trần. Khoản ${m(add)}${suffix} này làm vượt ${m(add - left)}.`
  }
  return null
}
```

- [ ] **Step 4: Chạy test để chắc nó xanh**

Run: `npx vitest run src/features/transactions/categoryAlert.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/categoryAlert.ts src/features/transactions/categoryAlert.test.ts
git commit -m "feat(nhap): canh bao tran ve dung danh muc vua chon

Thay dai do o dau form (hien o moi dang, ke ca sau dang khong thuoc danh muc
nao). O Tra ho con so cong vao la PHAN MINH CHIU, khong phai tong da tra — ban
dang chay tinh ca 12,400 thay vi 4,200.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: `recentCategories.ts` — 3 danh mục dùng nhiều nhất

App biết "Cơm ngoài" xuất hiện 18 lần/tháng mà vẫn bắt đi qua hai bước.

**Files:**
- Create: `src/features/transactions/recentCategories.ts`
- Test: `src/features/transactions/recentCategories.test.ts`

**Interfaces:**
- Produces: `recentCategories(txs, categories, type, limit?): RecentCategory[]` với `interface RecentCategory { id: string; parentId: string | null; name: string; icon: string; count: number }`

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, expect, it } from 'vitest'
import { recentCategories } from './recentCategories'

const CATS = [
  { id: 'an', name: 'Ăn uống', icon: '🍜', parent_id: null, type: 'expense', is_archived: false },
  { id: 'com', name: 'Cơm ngoài', icon: '🍜', parent_id: 'an', type: 'expense', is_archived: false },
  { id: 'cho', name: 'Đi chợ', icon: '🍜', parent_id: 'an', type: 'expense', is_archived: false },
  { id: 'di', name: 'Đi lại', icon: '🚃', parent_id: null, type: 'expense', is_archived: false },
  { id: 'cu', name: 'Cũ', icon: '📦', parent_id: null, type: 'expense', is_archived: true },
  { id: 'luong', name: 'Lương', icon: '💰', parent_id: null, type: 'income', is_archived: false },
] as never[]

const tx = (category_id: string, n: number) =>
  Array.from({ length: n }, () => ({ category_id, type: 'expense' })) as never[]

describe('recentCategories', () => {
  it('sap theo so lan dung, nhieu nhat truoc', () => {
    const out = recentCategories([...tx('com', 18), ...tx('di', 5), ...tx('cho', 9)], CATS, 'expense')
    expect(out.map((r) => r.id)).toEqual(['com', 'cho', 'di'])
    expect(out[0].count).toBe(18)
  })

  it('mac dinh tra ve 3', () => {
    expect(recentCategories([...tx('com', 3), ...tx('cho', 2), ...tx('di', 1)], CATS, 'expense'))
      .toHaveLength(3)
  })

  it('mang theo nhom cha, de MOT CHAM dat ca nhom va danh muc con', () => {
    const [r] = recentCategories(tx('com', 5), CATS, 'expense')
    expect(r.parentId).toBe('an')
    expect(r.name).toBe('Cơm ngoài')
    expect(r.icon).toBe('🍜')
  })

  it('bo danh muc da luu tru', () => {
    expect(recentCategories(tx('cu', 99), CATS, 'expense')).toHaveLength(0)
  })

  it('bo giao dich khong co danh muc (chuyen khoan)', () => {
    const out = recentCategories(
      [...([{ category_id: null, type: 'transfer' }] as never[]), ...tx('com', 2)], CATS, 'expense')
    expect(out.map((r) => r.id)).toEqual(['com'])
  })

  it('loc theo loai: huong Thu khong bay danh muc Chi', () => {
    expect(recentCategories(tx('com', 5), CATS, 'income')).toHaveLength(0)
  })

  it('chua co giao dich nao thi tra ve rong, khong nem', () => {
    expect(recentCategories([], CATS, 'expense')).toEqual([])
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó thất bại**

Run: `npx vitest run src/features/transactions/recentCategories.test.ts`
Expected: FAIL

- [ ] **Step 3: Viết `recentCategories.ts`** — đếm theo `category_id`, lọc `type` + `!is_archived`, bỏ `isAutoAssignedCategory`, sắp giảm dần, cắt `limit` (mặc định 3).

- [ ] **Step 4: Chạy test để chắc nó xanh**

Run: `npx vitest run src/features/transactions/recentCategories.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/recentCategories.ts src/features/transactions/recentCategories.test.ts
git commit -m "feat(nhap): recentCategories — ba danh muc dung nhieu nhat

Mang theo nhom cha de MOT CHAM dat ca nhom va danh muc con. App biet \"Com
ngoai\" 18 lan/thang ma van bat di qua hai buoc.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 13: `CategoryRow.tsx` — hàng Gần đây + `Khác ⌄` + lưới bung tại chỗ

Đo được: ba khối ghim (44+**52**+71) và hai khối đáy (188+50+18) ăn **423px** của 780 → vùng cuộn còn **357px**, mà lưới 4 cột một mình đã **250px**. (Track `lg` là 52px chứ không 50: ô 46px + 6px padding/viền của track — xem ruling Task 2.) Nên thu lưới **không phải** ý thẩm mỹ — nó là điều kiện để màn vừa màn hình.

⚠️ **Giữ 4 cột.** B22 đòi 3 cột với lý do "13 tile là 5 hàng, không ai cuộn hết" — nhưng đo ra **3 cột MỚI là 5 hàng (314px); 4 cột là 4 hàng (250px)**. Đổi sang 3 cột làm cái vấn đề nó viện ra nặng thêm 64px.

**Files:**
- Create: `src/features/transactions/CategoryRow.tsx`
- Modify: `src/features/transactions/recentCategories.ts` (thêm `childCounts`)
- Test: `src/features/transactions/recentCategories.test.ts`
- Modify: `src/features/transactions/TransactionForm.tsx`

**Interfaces:**
- Consumes: `recentCategories` (Task 12) · `CategoryTile` (chuyển từ `TransactionForm.tsx:1383` sang file này)
- Produces:
  - `childCounts(categories): Record<string, number>` — chỉ có khóa cho nhóm **có** con
  - `CategoryRow({ categories, recent, value, onChange, emptyNote })`

- [ ] **Step 1: Viết test thất bại**

Quyết định duy nhất chưa có hàm là **đếm số danh mục con** — và nó là chỗ B25 chỉ ra bệnh: tile có con và tile không con (Phí chuyển tiền · Phí thủ tục · Khác) trông y hệt mà hành vi khác. Rút ra `childCounts` trong `recentCategories.ts` rồi test thuần.

```ts
// Thêm vào src/features/transactions/recentCategories.test.ts
import { childCounts } from './recentCategories'

describe('childCounts — badge so con thay chevron', () => {
  it('dem con cua tung nhom cha', () => {
    expect(childCounts(CATS)).toEqual({ an: 2 })
  })

  it('nhom KHONG co con thi khong co khoa — de component khong ve badge "0"', () => {
    // Tile khong con phai KHONG co badge, khong phai badge so 0.
    expect(childCounts(CATS)).not.toHaveProperty('di')
    expect(childCounts(CATS)).not.toHaveProperty('phi')
  })

  it('bo con da luu tru khoi so dem — badge phai khop so tile bung ra', () => {
    const withArchived = [...CATS,
      { id: 'x', name: 'Cũ', icon: '📦', parent_id: 'an', type: 'expense', is_archived: true },
    ] as never[]
    expect(childCounts(withArchived).an).toBe(2)
  })

  it('rong thi tra ve object rong, khong nem', () => {
    expect(childCounts([])).toEqual({})
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó thất bại**

Run: `npx vitest run src/features/transactions/recentCategories.test.ts`
Expected: FAIL — `childCounts is not a function`

- [ ] **Step 3: Viết `CategoryRow.tsx`**

Chuyển `CategoryTile` từ `TransactionForm.tsx:1383` sang đây và **đổi chevron thành badge số con**:

```tsx
{/* Số danh mục con thay chevron 10px: tile CÓ con và tile KHÔNG con (Phí chuyển tiền ·
    Phí thủ tục · Khác) trước đây trông y hệt mà hành vi khác — bấm cái này thì mở
    thêm một tầng, bấm cái kia thì chọn xong. */}
{childCount > 0 && (
  <span className="absolute right-1 top-1 text-[0.625rem] font-medium text-fg-muted">
    {childCount}
  </span>
)}
```

- [ ] **Step 4: Nối vào `TransactionForm`**, thay cả khối lưới danh mục cũ (`:1166-1240`) bằng `<CategoryRow>`. Đổi dòng gộp cột phải từ `"Danh mục khác, ghi chú, nhãn"` thành **`"Ghi chú, nhãn"`** — danh mục đã có hàng riêng, một nhãn hứa hai đường vào lại là bệnh cũ.

- [ ] **Step 5: Chạy test + đo lại chiều cao**

Run: `npx vitest run src/features/transactions/ && npx tsc -b --noEmit`

Rồi trên demo ở `360×780`, dán vào console:

```js
(() => {
  const h = el => el ? Math.round(el.getBoundingClientRect().height) : null
  const sc = [...document.querySelectorAll('div')].find(d =>
    d.scrollHeight > d.clientHeight + 4 && getComputedStyle(d).overflowY === 'auto')
  const khac = [...document.querySelectorAll('button')].find(b => /^Khác/.test(b.innerText))
  const tile = () => [...document.querySelectorAll('button')]
    .find(b => /Phí chuyển tiền/.test(b.innerText))
  return JSON.stringify({
    luoiDangThu: !tile(),
    tranKhiThu: sc ? sc.scrollHeight - sc.clientHeight : 'khong tran',
    coChipKhac: !!khac,
  }, null, 1)
})()
```

Kỳ vọng: `luoiDangThu: true` · `coChipKhac: true` · `tranKhiThu: 'khong tran'`.

⚠️ **Mốc này chỉ đạt nếu Task 13 thu CẢ hàng ghi chú/nhãn/hoàn tiền, không chỉ thu lưới.**
Đo thật sau Task 6 ở 360×780 (controller chạy, code thật trên port 5175) — vùng cuộn khung
**410px**, nội dung **699px**, tràn **295px**, phân rã:

| Khối | px |
| --- | --- |
| segmented + hàng Dạng | 128 |
| ô số tiền | 85 (không 67 — sau Task 6 dạng nào cũng có nhãn ô tiền) |
| tài khoản + ngày | 44 |
| **lưới danh mục** | **250** |
| ghi chú | 44 |
| khối Nhãn | 68 |
| hoàn tiền | 44 |
| cộng | 663 + 36 (6 gap) = **699** |

Số học của Task 13:
- Thu lưới 250 → hàng danh mục 42: còn **491px** → **vẫn tràn 81px.**
- Thu thêm ghi chú 44 + Nhãn 68 + hoàn tiền 44 = 156 **về một hàng 44px**: còn 379px, và
  bớt 2 hàng nên gap còn 24 → **403px ≤ 410px. Vừa, dư 7px.**

→ Nên Task 13 **phải** gộp ba khối tùy chọn thành **một hàng "Ghi chú, nhãn ⌄"** trên mobile
(mở ra sheet hoặc bung tại chỗ), không phải chỉ đổi nhãn của cột phải desktop. Dư 7px là sát:
ở cỡ chữ lớn hơn sẽ tràn và **cuộn** — chấp nhận được, vùng đó cuộn được. Điều phải đạt là
**không tràn ở cỡ chữ mặc định**.

Rồi bấm `Khác ⌄` và đo lại:

```js
(() => {
  const tile = [...document.querySelectorAll('button')].find(b => /Phí chuyển tiền/.test(b.innerText))
  const grid = tile.parentElement
  return JSON.stringify({
    soCot: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
    caoLuoi: Math.round(grid.getBoundingClientRect().height),
    caoTile: Math.round(tile.getBoundingClientRect().height),
    laModal: !!document.querySelector('[role="dialog"]'),
  }, null, 1)
})()
```

Kỳ vọng: `soCot: 4` (**không 3** — 3 cột tốn thêm 64px) · `caoLuoi: ~250` · `caoTile: ~58` · `laModal: false`.

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/
git commit -m "feat(nhap): hang danh muc Gan day + Khac, luoi bung tai cho

Do o 360x780: ba khoi ghim + hai khoi day an 423px cua 780 -> vung cuon con
357px, ma luoi 4 cot mot minh da 250px. Thu luoi con mot hang khong phai y tham
my, no la dieu kien de man vua man hinh. Truoc: tran 227px.

GIU 4 COT. B22 doi 3 cot voi ly do \"13 tile la 5 hang\" nhung do ra 3 cot MOI
la 5 hang (314px), 4 cot la 4 hang (250px) — doi la lam cai van de no vien ra
nang them 64px.

Chevron -> badge so danh muc con: tile co con va tile khong con truoc day trong
y het ma hanh vi khac.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 14: Ô số tiền + contrast token

**Files:**
- Modify: `src/index.css:291`
- Modify: `src/features/transactions/TransactionForm.tsx` (hàm `amountBox`)
- Test: `src/features/transactions/tokenContrast.test.ts`

- [ ] **Step 1: Viết test thất bại**

Contrast **tính được** — không cần DOM, không cần tin lời gói. Test này tự tính tỷ lệ WCAG từ token trong `index.css`, nên lần sau ai đổi bảng màu xanh là nó kêu ngay.

```ts
// src/features/transactions/tokenContrast.test.ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/index.css', 'utf8')

/** Tỷ lệ tương phản WCAG 2.1. */
function ratio(fg: string, bg: string): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const lum = (hex: string) => {
    const [r, g, b] = hex.match(/\w\w/g)!.map((h) => parseInt(h, 16))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  }
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

/** Lấy giá trị token trong khối dark (khối thứ hai định nghĩa nó). */
function darkToken(name: string): string {
  const all = [...css.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`, 'g'))]
  return all[all.length - 1][1]
}

describe('nut Luu luc chua du dieu kien phai doc duoc', () => {
  it('chu tren nen muted dat AA 4,5:1 — chu nut la 16px semibold, khong phai chu lon', () => {
    const r = ratio(darkToken('accent-muted-fg'), darkToken('accent-muted-bg'))
    expect(r).toBeGreaterThanOrEqual(4.5)
  })

  it('khong con #6b8f78 — no chi 3,55:1', () => {
    // Khong co ngoai le contrast cho control vo hieu.
    expect(css).not.toMatch(/--accent-muted-fg:\s*#6b8f78/)
  })

  it('ham ratio dung — kiem bang hai cap da tinh tay', () => {
    expect(ratio('#6b8f78', '#0d3a1d')).toBeCloseTo(3.55, 1)
    expect(ratio('#7fae8e', '#0d3a1d')).toBeCloseTo(5.09, 1)
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó thất bại**

Run: `npx vitest run src/features/transactions/tokenContrast.test.ts`
Expected: FAIL — `3.55` không `>= 4.5`

- [ ] **Step 3: Sửa token**

```css
/* src/index.css — khối dark */
/* #6b8f78 trên #0d3a1d chỉ 3,55:1 — trượt AA cho chữ 16px semibold (cần 4,5).
   #7fae8e cho 5,09:1. Không có ngoại lệ contrast cho control vô hiệu.
   (Light hiện green-700 trên green-100 = 4,57:1 — đạt nhưng chỉ dư 0,07.) */
--accent-muted-fg: #7fae8e;
```

- [ ] **Step 4: Sửa `amountBox`** — tách `¥` ra `<span data-currency-sign>` mờ bên trái, thêm caret nháy, và bỏ điều kiện `multiAmount` khỏi viền nhấn (ô chính **luôn** có viền khi đang nhắm).

- [ ] **Step 5: Chạy test + kiểm mắt**

Run: `npx vitest run && npx tsc -b --noEmit`

Trên demo: mở `/entry`, ô số tiền phải có viền accent **ngay khi mở màn**, `¥` mờ bên trái, caret nháy.

- [ ] **Step 6: Commit**

```bash
git add src/index.css src/features/transactions/
git commit -m "fix(nhap): o so tien trong nhu o nhap, va sua contrast nut Luu

--accent-muted-fg dark #6b8f78 chi 3,55:1 tren #0d3a1d — truot AA cho chu 16px
semibold. Doi #7fae8e (5,09:1). Da tinh lai, khong tin so trong goi.

O so tien: ¥ tach ben trai mo di, co caret, vien nhan LUON co chu khong chi khi
co nhieu o tien.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# PR 6 — tự suy số VND

## Task 15: `remitDerive.ts`

**Files:**
- Create: `src/features/transactions/remitDerive.ts`
- Test: `src/features/transactions/remitDerive.test.ts`

**Interfaces:**
- Produces: `deriveReceived(sent, fee, rate): number | null` · `effectiveRate(sent, fee, received): number | null` · `rateAgeLabel(fetchedAt, now): string` · `nextReceived({ current, touched, sent, fee, rate }): number` (thêm ở Task 16)

- [ ] **Step 1: Viết test thất bại**

```ts
describe('suy so VND tu ty gia', () => {
  it('tru phi roi moi nhan ty gia — nguoi nhan chi nhan phan con lai', () => {
    // ¥30,000 gui, phi ¥800 → ¥29,200 × 153,0 = ₫4,467,600
    expect(deriveReceived(30_000, 800, 153)).toBe(4_467_600)
  })

  it('chua co ty gia thi tra null, khong doan bua', () => {
    expect(deriveReceived(30_000, 800, null)).toBeNull()
  })

  it('chua nhap so gui thi khong suy gi', () => {
    expect(deriveReceived(0, 0, 153)).toBeNull()
  })

  it('phi lon hon so gui thi tra null, khong ra so am', () => {
    expect(deriveReceived(500, 800, 153)).toBeNull()
  })

  it('ty gia thuc te tinh tren TONG BI TRU, ke ca phi', () => {
    // Nguoi dung nhin so bank tru (da gom phi) nen ty gia thuc phai chia tong do.
    expect(effectiveRate(30_000, 800, 4_467_600)).toBeCloseTo(145.05, 1)
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó thất bại**

Run: `npx vitest run src/features/transactions/remitDerive.test.ts`
Expected: FAIL

- [ ] **Step 3: Viết `remitDerive.ts`** — dùng hàm quy đổi **đã có** của Tài sản (tra bằng `grep -rn "convert\|quyDoi" src/features/assets/ src/lib/`); **không viết lại phép quy đổi**.

- [ ] **Step 4: Chạy test** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/remitDerive.ts src/features/transactions/remitDerive.test.ts
git commit -m "feat(nhap): remitDerive — suy so VND tu ty gia da co

useRates() da co ty gia, chua ai dung o man nay: ca ba o (So gui, Phi, So nhan)
de trang cho nguoi dung tu nhan tay. Tru phi TRUOC roi moi nhan ty gia.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 16: `RemitFields` dùng `remitDerive` + dải 12 tháng

**Files:**
- Modify: `src/features/transactions/roleFields.tsx` (`RemitFields`, `:579`)
- Modify: `src/features/transactions/TransactionForm.tsx` (chuyền `rate` xuống)
- Test: `src/features/transactions/remitDerive.test.ts` (mở rộng)

- [ ] **Step 1: Viết test thất bại**

Cái dễ sai ở đây là **khi nào ghi đè, khi nào không** — người dùng gõ số bên nhận báo rồi mà tỷ giá về sau lại đạp lên thì mất số họ gõ. Đó là logic thuần:

```ts
// Thêm vào src/features/transactions/remitDerive.test.ts
import { nextReceived } from './remitDerive'

describe('nextReceived — khi nao duoc ghi de o "So nhan"', () => {
  it('chua go tay thi ty gia dien vao', () => {
    expect(nextReceived({ current: 0, touched: false, sent: 30_000, fee: 800, rate: 153 }))
      .toBe(4_467_600)
  })

  it('DA go tay thi KHONG dap len — so ben nhan bao la su that, ty gia chi la uoc', () => {
    expect(nextReceived({ current: 4_400_000, touched: true, sent: 30_000, fee: 800, rate: 153 }))
      .toBe(4_400_000)
  })

  it('doi so gui sau khi da go tay thi VAN giu so da go', () => {
    // Neu khong, sua so gui mot chu so la mat so ben nhan da bao.
    expect(nextReceived({ current: 4_400_000, touched: true, sent: 31_000, fee: 800, rate: 153 }))
      .toBe(4_400_000)
  })

  it('chua co ty gia thi giu nguyen so hien tai, khong xoa ve 0', () => {
    expect(nextReceived({ current: 4_400_000, touched: false, sent: 30_000, fee: 800, rate: null }))
      .toBe(4_400_000)
  })
})
```

- [ ] **Step 2: Chạy** → FAIL (`nextReceived is not a function`)
- [ ] **Step 3: Viết `nextReceived`, rồi nối vào `RemitFields`.** Component giữ một cờ `receivedTouched` (bật khi `onChange` của ô "Số nhận" chạy) và gọi `nextReceived` trong `useEffect` theo `[sent, fee, rate]`. Thêm dải 12 tháng ở cột phụ, cùng nguồn với khối "Gửi về VN" ở tab Dài hạn.
- [ ] **Step 4: Chạy** → PASS

- [ ] **Step 4b: Đo trên trình duyệt**

Mở `/entry` → **Tiền ra** → chip **Gửi gia đình**. Gõ `30000`, phí `800`. Kỳ vọng: ô "Số nhận" tự có số, dòng phụ in `≈ ₫…` kèm **tỷ giá** và **giờ cập nhật**. Gõ đè `4400000` rồi sửa số gửi thành `31000` → số bên nhận **vẫn là 4,400,000**.
- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/
git commit -m "feat(nhap): so VND tu suy, sua duoc, kem ty gia va gio cap nhat

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# PR 7 — sau khi lưu, ở lại màn

## Task 17: Đếm "3 khoản lượt này" + danh sách "Vừa ghi" + nút "Xong · về Bản tin"

`onContinue` **đã** ở lại màn, **đã** giữ tài khoản + ngày, **đã** có Hoàn tác. Còn thiếu ba thứ. Người về nhà ghi cả ngày 3–4 khoản một lượt.

**Files:**
- Create: `src/features/transactions/savedRound.ts`
- Test: `src/features/transactions/savedRound.test.ts`
- Modify: `src/features/transactions/EntryPage.tsx`

**Interfaces:**
- Produces: `interface SavedEntry { id: string; label: string; icon: string; amount: number; currency: CurrencyCode }` · `addSaved(list, e): SavedEntry[]` · `removeSaved(list, id): SavedEntry[]` · `countLabel(list, total?): string | null`

- [ ] **Step 1: Viết test thất bại**

State của lượt ghi là một **rút gọn thuần** — đẩy vào, rút ra khi hoàn tác, đếm. Tách ra `savedRound.ts` rồi test; `EntryPage` chỉ giữ `useState` và bày.

**Files:** Create `src/features/transactions/savedRound.ts` + `savedRound.test.ts`

```ts
// src/features/transactions/savedRound.test.ts
import { describe, expect, it } from 'vitest'
import { addSaved, countLabel, removeSaved, type SavedEntry } from './savedRound'

const e = (id: string, amount = 3_480): SavedEntry =>
  ({ id, label: 'Cơm ngoài', icon: '🍜', amount, currency: 'JPY' })

describe('savedRound', () => {
  it('moi nhat len DAU — nguoi dung nhin thay khoan vua ghi truoc', () => {
    const r = addSaved(addSaved([], e('a')), e('b'))
    expect(r.map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('hoan tac rut dung khoan do ra', () => {
    const r = removeSaved(addSaved(addSaved([], e('a')), e('b')), 'a')
    expect(r.map((x) => x.id)).toEqual(['b'])
  })

  it('hoan tac mot id khong co thi khong doi gi, khong nem', () => {
    const r = addSaved([], e('a'))
    expect(removeSaved(r, 'mat-tieu')).toHaveLength(1)
  })

  it('dem: chua ghi gi thi null — khong bay "0 khoan luot nay"', () => {
    expect(countLabel([])).toBeNull()
  })

  it('dem dung so, tieng Viet khong chia so nhieu', () => {
    expect(countLabel(addSaved([], e('a')))).toBe('1 khoản lượt này')
    expect(countLabel(addSaved(addSaved([], e('a')), e('b')))).toBe('2 khoản lượt này')
  })

  it('cat danh sach o 5 khoan — bay het mot ngay ghi thi day man', () => {
    let r: SavedEntry[] = []
    for (let i = 0; i < 8; i++) r = addSaved(r, e(`x${i}`))
    expect(r).toHaveLength(5)
    expect(r[0].id).toBe('x7')
  })

  it('nhung so DEM thi khong bi cat — da ghi 8 thi noi 8', () => {
    let r: SavedEntry[] = []
    let n = 0
    for (let i = 0; i < 8; i++) { r = addSaved(r, e(`x${i}`)); n++ }
    // Danh sach cat con 5 nhung so dem phai la 8 → dem KHONG duoc lay r.length.
    expect(countLabel(r, n)).toBe('8 khoản lượt này')
  })
})
```

⚠️ Test cuối chốt một cái bẫy: nếu vừa cắt danh sách ở 5 vừa đếm bằng `r.length` thì ghi khoản thứ 6 xong màn vẫn nói "5 khoản lượt này". Nên `countLabel(list, total?)` nhận số đếm riêng.

- [ ] **Step 2: Chạy** → FAIL (`Failed to resolve import "./savedRound"`)
- [ ] **Step 3: Viết `savedRound.ts`** — `SavedEntry { id, label, icon, amount, currency }`, `addSaved` chèn đầu + cắt 5, `removeSaved` lọc theo id, `countLabel(list, total = list.length)` trả `null` khi 0.
- [ ] **Step 4: Nối vào `EntryPage`** — `useState<SavedEntry[]>([])` + `useState(0)` cho số đếm; đẩy vào trong `onContinue`, rút ra trong `handleUndo`. Bày: số đếm cạnh `h1` · `<ul aria-label="Vừa ghi">` dưới hàng danh mục · nút `Xong · về Bản tin` → `navigate('/')`, chỉ hiện khi danh sách không rỗng.
- [ ] **Step 5: Chạy** → PASS

- [ ] **Step 5b: Đo trên trình duyệt**

Trên demo: mở `/entry`, ghi một khoản bằng **Lưu và nhập tiếp**. Kỳ vọng: **ở lại màn** · thấy `1 khoản lượt này` cạnh tiêu đề · thấy danh sách "Vừa ghi" có khoản đó kèm số tiền · thấy nút `Xong · về Bản tin` · tài khoản và ngày **giữ nguyên**, số tiền và ghi chú **xóa sạch**. Bấm **Hoàn tác** → khoản rời danh sách và số đếm mất.
- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/
git commit -m "feat(nhap): dem khoan luot nay, danh sach Vua ghi, nut Xong ve Ban tin

Nguoi ve nha ghi ca ngay 3-4 khoan mot luot. onContinue da o lai man va da giu
tai khoan + ngay; con thieu ba thu nay.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Kiểm cuối — chạy sau Task 17

- [ ] `npx vitest run` → **155+ file xanh, ≥ 2476 test**
- [ ] `npx tsc -b --noEmit` → không lỗi
- [ ] `npx oxlint` → không lỗi mới
- [ ] Không còn dấu vết cấu trúc cũ — cả bốn lệnh phải ra **rỗng**:

```bash
grep -rn "Đặc biệt\|activeRole\|roleTriggerSlot\|TYPE_TABS\|DEBT_TABS\|REMIT_TABS\|ROLE_META\|ROLE_ORDER" src/
```

```bash
grep -rn "roleTxType\|roleAmountLabel\|roleHidesCategoryGrid" src/
```

```bash
grep -rn "REPEAT_OPTIONS\|REPEAT_LABEL\|REPEAT_MENU_LABEL\|onSubmitRecurring\|useBudgetAlert" src/features/transactions/
```

```bash
grep -rn "Nhắc sau\|Chia với ai\|Khoản sắp tới\|Tạo lời nhắc\|Tên lời nhắc" src/
```
- [ ] Ở `360×780`: `soTablist: 1` · `oSegmented: 46` · vùng cuộn **không tràn** khi lưới thu
- [ ] Ở `320×780`: ô segmented **vẫn 46px** (không nhảy lên vì nhãn xuống dòng), trang không tràn ngang
- [ ] Bật Cài đặt → Cỡ chữ **Rất lớn** ở 360px: chip không ngắt giữa từ, `h1` không lệch tâm, picker tài khoản không teo còn 36px
- [ ] Bật `Sẽ chi`: số dư không đổi · trần không đổi · ô hoàn tiền biến mất · tắt "Nhắc tôi" thì Bản tin không sinh việc
- [ ] Chọn nhãn ở **cả 10 dạng** → lưu xong đếm đúng số liên kết (trước: 5 dạng ra 0)
- [ ] `repay`/`collect`: `/debts` thấy `còn lại` giảm đúng
- [ ] `family` vẫn vào tổng chi và vẫn chịu trần — chi tháng 8 giữ `¥252,236`
