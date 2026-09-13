# Đối chiếu sao kê đợt 2 — Đợt 3: nhớ dòng đã xem

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trên trang Đối chiếu sao kê, mỗi hàng "cần xem" có nút **Bỏ qua** (và **Xem lại** để đưa về); có nút **Bỏ qua hết phần còn lại kỳ này**; dấu bỏ qua lưu trên chính hoá đơn của kỳ trong `card_bills`, đi theo sao lưu; kỳ không còn hàng nào chưa xử lý được đánh dấu **đã đối chiếu**, và panel trang thẻ đổi dòng "Lệch" từ cảnh báo sang "Lệch — đã xem hết".

**Architecture:** Migration `0071` thêm hai cột `dismissed jsonb` (mảng khoá dòng) và `reviewed boolean` vào `card_bills`; `NewCardBill` đòi đủ hai trường, repo chỉ upsert. Module thuần `statementDismiss.ts` định nghĩa khoá dòng, tách hàng mở/đã bỏ qua, tính `reviewed`, và dựng `NewCardBill` sau một lần bỏ qua. `billRowsFor` nhận thêm hoá đơn hiện có + kết quả ghép để giữ dấu cũ và tính `reviewed` khi "Lưu N kỳ". `overviewRows` đếm hàng MỞ và mang `reviewed`. Trang chỉ nối nút với `useUpsertCardBills`.

**Tech Stack:** Postgres (Supabase, migration dán tay), TypeScript, React 18, TanStack Query, vitest.

**Spec:** [docs/superpowers/specs/2026-09-13-doi-chieu-sao-ke-the-2-design.md](../specs/2026-09-13-doi-chieu-sao-ke-the-2-design.md) §7. Đợt 1 `e230cec`, Đợt 2 `c13b89b` đã lên master.

## Global Constraints

- **Đổi schema là đổi hai file cùng commit:** `supabase/migrations/0071_*.sql` + `src/types/database.types.ts` (viết tay, không codegen).
- Hai bản `Repo` (`supabaseRepo`, `demoRepo`) cùng thoả interface — thiếu một bên là lỗi biên dịch.
- Migration **không tự chạy**: file trong repo ≠ DB đã có cột. Người dùng dán SQL vào Supabase SQL editor. Trước đó, app thật ghi `card_bills` sẽ lỗi `42703` (thiếu cột) — Task 6 kiểm bằng anon key và đưa SQL cho người dùng.
- Toán thuần trong `.ts` không JSX, test cạnh file. Tiền là số nguyên minor units. Mọi tiền qua `<Money>`, đếm qua `<Num>`.
- Design system: `<ActionButton>`, `<Collapse>`, `<StatusChip>`, token có tên; không giá trị tuỳ ý; `tests/designSystem.test.ts` canh.
- Feature gọi dữ liệu qua hook `src/hooks/queries.ts`; `useUpsertCardBills` đã có, invalidate `['cardBills']`.
- `npx tsc -b`; `npx vitest run <file>`; `npm test` (303 file, 4759 test ở `c13b89b`). Không đụng `src/mcp/`/luật notification ⇒ không `bundle:*`.
- LF; không prettier; tên test không dấu; chỉ `git add <file>`. GitNexus hay không kết nối ⇒ `grep -rn` thay `impact`.
- Worktree: tạo với `-c core.autocrlf=false`, junction `node_modules`; `tests/mcpBundle.test.ts` đỏ trong worktree là artefact junction.

---

## Bản đồ file

| File | Việc |
|---|---|
| Create `supabase/migrations/0071_card_bills_review.sql` | hai cột mới |
| Modify `src/types/database.types.ts` | `CardBillRow` + `Database.card_bills` |
| Modify `src/data/repo.ts` | `NewCardBill` thêm `dismissed`, `reviewed` |
| Modify `src/data/supabaseRepo.ts` | upsert đủ cột |
| Modify `src/data/demoRepo.ts` (+ `.test.ts`) | upsert đủ cột; import sao lưu cũ mặc định |
| Modify `src/features/assets/statementBatch.ts` (+ `.test.ts`) | `billRowsFor` giữ dấu cũ, tính `reviewed` |
| Create `src/features/assets/statementDismiss.ts` (+ `.test.ts`) | khoá dòng, tách mở/đã bỏ, `isReviewed`, `billAfterDismiss` |
| Modify `src/features/assets/statementOverview.ts` (+ `.test.ts`) | đếm hàng mở, `reviewed` |
| Modify `src/features/assets/StatementReconcilePage.tsx` | Bỏ qua / Xem lại / Bỏ qua hết / cụm Đã bỏ qua / chip Đã đối chiếu |
| Modify `src/features/assets/AccountDetailPage.tsx` | dòng "Lệch — đã xem hết" |

---

### Task 1: Tầng dữ liệu — migration, kiểu, hai repo

**Files:**
- Create: `supabase/migrations/0071_card_bills_review.sql`
- Modify: `src/types/database.types.ts` (`CardBillRow` ~:454; `card_bills` trong `Database` ~:1315)
- Modify: `src/data/repo.ts:441-449` (`NewCardBill`)
- Modify: `src/data/supabaseRepo.ts:591-608` (`upsertCardBills`)
- Modify: `src/data/demoRepo.ts:1489-1516` (`upsertCardBills`), `~:3168` (import `cardBills`)
- Modify: `src/data/demoRepo.test.ts` (describe hoá đơn thẻ, ~:1740)
- Modify: `src/features/assets/statementBatch.ts` (`billRowsFor` — chỉ thêm hai trường mặc định để biên dịch; Task 3 làm thật) + `statementBatch.test.ts` (kỳ vọng `toEqual`)

**Interfaces:**
- Produces:
  ```ts
  // database.types.ts
  export type CardBillRow = { …; dismissed: string[]; reviewed: boolean }
  // repo.ts
  export interface NewCardBill { account_id; close_date; due_date; total; dismissed: string[]; reviewed: boolean }
  ```

- [ ] **Step 1: Migration**

`supabase/migrations/0071_card_bills_review.sql`:

```sql
-- ============================================================
-- Sổ Gạo — Migration 0071: dấu "đã xem" trên hoá đơn thẻ
--
-- VÌ SAO CẦN: trang Đối chiếu sao kê chỉ ra dòng lệch, nhưng phần lớn dòng lệch là
-- khác biệt cấu trúc đã hiểu (ví có số dư, hoàn tiền nhà thẻ gộp…) — tháng sau nạp lại
-- cùng file, app hỏi lại đúng những dòng đó. Người dùng cần nói một lần "đã xem, đúng là
-- vậy" và app phải nhớ.
--
-- VÌ SAO LƯU TRÊN card_bills CHỨ KHÔNG BẢNG RIÊNG: dấu này thuộc về MỘT kỳ của MỘT thẻ,
-- đúng khoá (account_id, close_date) của hoá đơn; một mảng khoá dòng là đủ, không có quan
-- hệ nào khác để tra. Tách bảng là thêm một join cho một cột.
--
-- KHOÁ DÒNG (định nghĩa ở src/features/assets/statementDismiss.ts):
--   'tx:<uuid giao dịch>'                 dòng sổ thừa
--   'stm:<ngày>|<số tiền>|<tên NFKC>'     dòng thẻ thiếu
--   'rtx:<ngày>|<số tiền>|<ghi chú>'      hoàn tiền phía sổ (không có id giao dịch)
--   'topups:<ngày chốt>'                  cụm nạp ví chưa ghép
--
-- Xem: docs/superpowers/specs/2026-09-13-doi-chieu-sao-ke-the-2-design.md §7
-- ============================================================

alter table public.card_bills
  add column if not exists dismissed jsonb   not null default '[]'::jsonb,
  add column if not exists reviewed  boolean not null default false;

comment on column public.card_bills.dismissed is
  'Mảng khoá dòng lệch người dùng đã bấm Bỏ qua. Định dạng khoá: xem statementDismiss.ts.';
comment on column public.card_bills.reviewed is
  'true = kỳ không còn dòng nào chưa xử lý (khớp, giải thích được, hoặc đã bỏ qua). App tính lại mỗi lần ghi hoá đơn.';
```

- [ ] **Step 2: Kiểu**

`src/types/database.types.ts`, trong `CardBillRow` sau `total`:

```ts
  /** Khoá dòng lệch đã Bỏ qua — định dạng ở `statementDismiss.ts`. jsonb, luôn là mảng chuỗi. */
  dismissed: string[]
  /** Kỳ không còn dòng chưa xử lý. App tính lại mỗi lần ghi. */
  reviewed: boolean
```

Trong `Database.public.Tables.card_bills`:

```ts
      card_bills: {
        Row: CardBillRow
        Insert: InsertOf<
          CardBillRow,
          'user_id' | 'account_id' | 'close_date' | 'due_date' | 'total',
          'id' | 'dismissed' | 'reviewed'
        >
        Update: Partial<Pick<CardBillRow, 'due_date' | 'total' | 'dismissed' | 'reviewed'>>
        Relationships: []
      }
```

- [ ] **Step 3: `NewCardBill`**

`src/data/repo.ts`:

```ts
export interface NewCardBill {
  account_id: string
  close_date: string
  due_date: string
  total: number
  /** Đủ trường, không optional: giữ dấu cũ khi chỉ lưu tổng là việc của FEATURE (nó có
   *  cache `useCardBills`), repo không đọc-rồi-ghi. Xem `billRowsFor`. */
  dismissed: string[]
  reviewed: boolean
}
```

- [ ] **Step 4: Test demoRepo thất bại**

Thêm vào `describe` hoá đơn thẻ trong `src/data/demoRepo.test.ts`:

```ts
  it('luu va de dismissed/reviewed theo ky', async () => {
    const accs = await demoRepo.getAccounts()
    const card = accs.find((a) => a.type === 'card')!
    await demoRepo.upsertCardBills([
      { account_id: card.id, close_date: '2026-08-31', due_date: '2026-09-28', total: 100, dismissed: ['tx:a'], reviewed: false },
    ])
    let b = (await demoRepo.getCardBills()).find((x) => x.close_date === '2026-08-31')!
    expect(b.dismissed).toEqual(['tx:a'])
    expect(b.reviewed).toBe(false)
    await demoRepo.upsertCardBills([
      { account_id: card.id, close_date: '2026-08-31', due_date: '2026-09-28', total: 100, dismissed: ['tx:a', 'topups:2026-08-31'], reviewed: true },
    ])
    b = (await demoRepo.getCardBills()).find((x) => x.close_date === '2026-08-31')!
    expect(b.dismissed).toEqual(['tx:a', 'topups:2026-08-31'])
    expect(b.reviewed).toBe(true)
  })

  it('nhap sao luu cu khong co dismissed/reviewed thi mac dinh [] / false', async () => {
    const data = await demoRepo.exportAll()
    const accs = await demoRepo.getAccounts()
    const card = accs.find((a) => a.type === 'card')!
    const cu = { id: 'b-cu', user_id: 'x', account_id: card.id, close_date: '2026-07-31', due_date: '2026-08-27', total: 5 }
    await demoRepo.importAll({ ...data, cardBills: [cu as unknown as CardBillRow] })
    const b = (await demoRepo.getCardBills()).find((x) => x.close_date === '2026-07-31')!
    expect(b.dismissed).toEqual([])
    expect(b.reviewed).toBe(false)
  })
```

(Tên hàm export/import của demoRepo: kiểm trong file — `exportAll`/`importAll` là tên đang dùng ở `supabaseRepo:2239`; nếu demoRepo đặt khác, dùng đúng tên đó. Import `CardBillRow` type nếu test chưa có.)

Hai test hoá đơn cũ (`upsertCardBills([{…total}])`) giờ thiếu trường ⇒ thêm `dismissed: [], reviewed: false` vào các object literal đó.

- [ ] **Step 5: Chạy cho chắc là đỏ**

Run: `npx vitest run src/data/demoRepo.test.ts -t "hoa don"`
Expected: FAIL (kiểu/`toEqual`).

- [ ] **Step 6: Cài hai repo**

`supabaseRepo.upsertCardBills`: thêm `dismissed: r.dismissed, reviewed: r.reviewed,` vào object gửi lên.

`demoRepo.upsertCardBills`: nhánh `existing` thêm `existing.dismissed = r.dismissed; existing.reviewed = r.reviewed`; nhánh tạo mới thêm `dismissed: r.dismissed, reviewed: r.reviewed`.

`demoRepo` import (`~:3168`): `cardBills: stamp(data.cardBills ?? []).map((b) => ({ ...b, dismissed: b.dismissed ?? [], reviewed: b.reviewed ?? false })),` — kèm chú thích: sao lưu trước 0071 không có hai cột.

Đường thật `importAll` chèn thẳng JSON: dòng cũ thiếu cột ⇒ Postgres dùng default — không phải sửa.

`statementBatch.ts` `billRowsFor`: thêm `dismissed: [], reviewed: false` vào object trả về (tạm, Task 3 làm thật); `statementBatch.test.ts` cập nhật hai `toEqual` tương ứng.

- [ ] **Step 7: Xanh + kiểm kiểu**

Run: `npx vitest run src/data/demoRepo.test.ts src/features/assets/statementBatch.test.ts src/data/backupImport.test.ts src/data/exportTables.test.ts` → PASS.
Run: `npx tsc -b` → 0 lỗi (compiler chỉ ra mọi chỗ dựng `NewCardBill`/`CardBillRow` còn thiếu — sửa hết, kể cả fixture test).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0071_card_bills_review.sql src/types/database.types.ts src/data/repo.ts src/data/supabaseRepo.ts src/data/demoRepo.ts src/data/demoRepo.test.ts src/features/assets/statementBatch.ts src/features/assets/statementBatch.test.ts
git commit -m "feat(the): card_bills them dismissed/reviewed (migration 0071, kieu, hai repo)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `statementDismiss.ts` — khoá dòng, tách mở/đã bỏ qua, `reviewed`

**Files:**
- Create: `src/features/assets/statementDismiss.ts`, `src/features/assets/statementDismiss.test.ts`

**Interfaces:**
- Consumes: `ReviewRow` (`./statementReviewRows`), `MergedStatement` (`./statementBatch`), `CardBillRow`, `NewCardBill`.
- Produces:
  ```ts
  export function dismissKey(row: ReviewRow): string
  export function splitDismissed(rows: ReviewRow[], dismissed: readonly string[]): { open: ReviewRow[]; hidden: ReviewRow[] }
  export function isReviewed(rows: ReviewRow[], dismissed: readonly string[]): boolean   // rows.every(dismissed)
  export function toggleKey(dismissed: readonly string[], key: string, on: boolean): string[]
  export function billAfterDismiss(m: MergedStatement, accountId: string, existing: CardBillRow | null, dismissed: string[], rows: ReviewRow[]): NewCardBill
  ```

- [ ] **Step 1: Test thất bại**

```ts
import { describe, expect, it } from 'vitest'
import { billAfterDismiss, dismissKey, isReviewed, splitDismissed, toggleKey } from './statementDismiss'
import type { ReviewRow } from './statementReviewRows'
import type { MergedStatement } from './statementBatch'
import type { CardBillRow } from '../../types/database.types'

const led = (id: string, iso = '2026-06-10', amount = 23000): ReviewRow => ({
  kind: 'ledger', key: `led-${id}`, amount, refund: false,
  tx: { id, occurred_on: iso, amount, type: 'expense', is_refund: false, to_account_id: null, note: 'ks' },
})
const stm = (iso: string, amount: number, name: string): ReviewRow => ({
  kind: 'statement', key: `stm-x`, amount, refund: false,
  line: { iso, amount, billed: amount, name, kind: 'purchase', isAdjustment: false },
})
const topups: ReviewRow = { kind: 'topups', key: 'topups-2026-06-30', count: 2, amount: 3376 }
const rledger: ReviewRow = {
  kind: 'ledger', key: 'refund-led-0', amount: -6990, refund: true,
  tx: { id: '', occurred_on: '2026-01-28', amount: 6990, type: 'expense', is_refund: true, to_account_id: null, note: 'Uniqlo hoan' },
}

describe('dismissKey', () => {
  it('dong so theo id; dong the theo ngay|tien|ten NFKC; hoan tien so theo ngay|tien|ghi chu; cum nap vi theo ky', () => {
    expect(dismissKey(led('abc'))).toBe('tx:abc')
    expect(dismissKey(stm('2026-07-03', 5060, 'ＵＮＩＱＬＯ'))).toBe('stm:2026-07-03|5060|UNIQLO')
    expect(dismissKey(rledger)).toBe('rtx:2026-01-28|-6990|Uniqlo hoan')
    expect(dismissKey(topups)).toBe('topups:2026-06-30')
  })
  it('khoa cum nap vi lay tu key hang (chua closeISO), khong tu so lan', () => {
    expect(dismissKey({ ...topups, count: 9, amount: 1 })).toBe('topups:2026-06-30')
  })
})

describe('splitDismissed / isReviewed / toggleKey', () => {
  const rows = [led('a'), stm('2026-07-03', 5060, 'UNIQLO'), topups]
  it('tach theo khoa; thu tu giu nguyen', () => {
    const { open, hidden } = splitDismissed(rows, ['topups:2026-06-30', 'tx:a'])
    expect(open.map(dismissKey)).toEqual(['stm:2026-07-03|5060|UNIQLO'])
    expect(hidden.map(dismissKey)).toEqual(['tx:a', 'topups:2026-06-30'])
  })
  it('reviewed khi moi hang deu da bo qua; khong hang nao cung la reviewed', () => {
    expect(isReviewed(rows, ['tx:a'])).toBe(false)
    expect(isReviewed(rows, ['tx:a', 'stm:2026-07-03|5060|UNIQLO', 'topups:2026-06-30'])).toBe(true)
    expect(isReviewed([], [])).toBe(true)
  })
  it('toggleKey them khong trung, bo dung khoa, khong dot bien mang cu', () => {
    const d = ['tx:a']
    expect(toggleKey(d, 'tx:a', true)).toEqual(['tx:a'])
    expect(toggleKey(d, 'tx:b', true)).toEqual(['tx:a', 'tx:b'])
    expect(toggleKey(['tx:a', 'tx:b'], 'tx:a', false)).toEqual(['tx:b'])
    expect(d).toEqual(['tx:a'])
  })
})

describe('billAfterDismiss', () => {
  const m: MergedStatement = {
    range: { start: '2026-06-01', end: '2026-07-01', closeISO: '2026-06-30', dueISO: '2026-07-27' },
    total: 158429, parts: [], lines: [], dueDateMismatch: false,
  }
  const existing: CardBillRow = {
    id: 'b1', user_id: 'u', account_id: 'acc', close_date: '2026-06-30', due_date: '2026-07-27',
    total: 1, created_at: '', dismissed: ['tx:a'], reviewed: false,
  }
  it('tong/ngay tu file, dismissed tu tham so, reviewed tinh tu rows', () => {
    const rows = [led('a'), topups]
    const nb = billAfterDismiss(m, 'acc', existing, ['tx:a', 'topups:2026-06-30'], rows)
    expect(nb).toEqual({
      account_id: 'acc', close_date: '2026-06-30', due_date: '2026-07-27', total: 158429,
      dismissed: ['tx:a', 'topups:2026-06-30'], reviewed: true,
    })
  })
  it('chua co bill thi van dung duoc (existing null)', () => {
    const nb = billAfterDismiss(m, 'acc', null, ['tx:a'], [led('a'), topups])
    expect(nb.reviewed).toBe(false)
    expect(nb.dismissed).toEqual(['tx:a'])
  })
})
```

- [ ] **Step 2: Đỏ** — `npx vitest run src/features/assets/statementDismiss.test.ts`

- [ ] **Step 3: Viết module**

```ts
// Dấu "đã xem" cho từng hàng lệch của một kỳ, lưu trên `card_bills.dismissed`.
//
// Khoá phải SỐNG QUA lần nạp file sau: dòng sổ có id nên dùng id; dòng thẻ không có id
// nên dùng (ngày, tiền, tên NFKC) — hai dòng thẻ cùng ngày cùng tiền cùng tên là một thứ
// theo nghĩa người đọc, và trùng như vậy hiếm (spec §7.1). Cụm nạp ví là MỘT hàng/kỳ nên
// khoá theo ngày chốt. Hàng hoàn tiền phía sổ không có id (Đợt 1 không giữ) ⇒ ngày|tiền|ghi chú.
//
// Thuần, không phụ thuộc React.

import type { CardBillRow } from '../../types/database.types'
import type { NewCardBill } from '../../data/repo'
import type { MergedStatement } from './statementBatch'
import type { ReviewRow } from './statementReviewRows'

const nfkc = (s: string) => s.normalize('NFKC').trim()

export function dismissKey(row: ReviewRow): string {
  switch (row.kind) {
    case 'ledger':
      return row.tx.id !== ''
        ? `tx:${row.tx.id}`
        : `rtx:${row.tx.occurred_on}|${row.amount}|${nfkc(row.tx.note ?? '')}`
    case 'statement':
      return `stm:${row.line.iso}|${row.line.amount}|${nfkc(row.line.name)}`
    case 'topups':
      // key hàng là `topups-<closeISO>` (statementReviewRows) — lấy phần sau dấu gạch đầu.
      return `topups:${row.key.slice('topups-'.length)}`
  }
}

export function splitDismissed(rows: ReviewRow[], dismissed: readonly string[]) {
  const set = new Set(dismissed)
  const open: ReviewRow[] = []
  const hidden: ReviewRow[] = []
  for (const r of rows) (set.has(dismissKey(r)) ? hidden : open).push(r)
  return { open, hidden }
}

/** Kỳ "đã đối chiếu" = không còn hàng nào chưa xử lý. Không có hàng nào cũng là đã đối chiếu. */
export function isReviewed(rows: ReviewRow[], dismissed: readonly string[]): boolean {
  return splitDismissed(rows, dismissed).open.length === 0
}

export function toggleKey(dismissed: readonly string[], key: string, on: boolean): string[] {
  const set = new Set(dismissed)
  if (on) set.add(key)
  else set.delete(key)
  return [...set]
}

/**
 * Dòng `card_bills` sau một lần Bỏ qua / Xem lại: tổng và ngày lấy từ FILE (nguồn mới
 * hơn bill đã lưu), dấu từ tham số, `reviewed` tính lại từ hàng hiện có. `existing` chỉ để
 * chỗ gọi tiện tra — không đọc gì từ nó ngoài việc chấp nhận null (kỳ chưa có bill).
 */
export function billAfterDismiss(
  m: MergedStatement,
  accountId: string,
  _existing: CardBillRow | null,
  dismissed: string[],
  rows: ReviewRow[],
): NewCardBill {
  return {
    account_id: accountId,
    close_date: m.range.closeISO,
    due_date: m.range.dueISO,
    total: m.total,
    dismissed,
    reviewed: isReviewed(rows, dismissed),
  }
}
```

(Nếu oxlint/tsc phàn nàn `_existing` không dùng: bỏ tham số khỏi chữ ký và test — quyết ngay, không để cảnh báo.)

- [ ] **Step 4: Xanh** — cùng lệnh, 8 test. `npx tsc -b` 0 lỗi.

- [ ] **Step 5: Commit**

```bash
git add src/features/assets/statementDismiss.ts src/features/assets/statementDismiss.test.ts
git commit -m "feat(the): khoa dong bo qua, tach mo/da bo, tinh reviewed (toan thuan)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `billRowsFor` giữ dấu cũ + tính `reviewed`; `overviewRows` đếm hàng mở

**Files:**
- Modify: `src/features/assets/statementBatch.ts` (`billRowsFor`) + `.test.ts`
- Modify: `src/features/assets/statementOverview.ts` + `.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function billRowsFor(accountId: string, merged: MergedStatement[], ctx: { existing: CardBillRow[]; results: Map<string, ReconcileResult> }): NewCardBill[]
  export interface OverviewRow { …; loaded: null | { matchedCount; lineCount; reviewCount /* hàng MỞ */; dismissedCount; parts }; reviewed: boolean; status }
  export function overviewRows(bills, accountId, merged, results): OverviewRow[]   // chữ ký giữ; đọc dismissed/reviewed từ bills
  ```

- [ ] **Step 1: Test thất bại — `statementBatch.test.ts`**

Thay `describe('billRowsFor')`:

```ts
describe('billRowsFor', () => {
  const ctx0 = { existing: [] as CardBillRow[], results: new Map<string, ReconcileResult>() }
  it('moi ky mot dong, total gop; chua co bill va chua co ket qua ⇒ dismissed [] reviewed false', () => {
    const rows = billRowsFor('acc-1', mergeStatements([st('2026-06-30', '3737', 165429), st('2026-06-30', '2565', 880), st('2026-05-31', '3737', 50)]), ctx0)
    expect(rows).toEqual([
      { account_id: 'acc-1', close_date: '2026-05-31', due_date: '2026-05-31-due', total: 50, dismissed: [], reviewed: false },
      { account_id: 'acc-1', close_date: '2026-06-30', due_date: '2026-06-30-due', total: 166309, dismissed: [], reviewed: false },
    ])
  })
  it('giu dismissed cua bill da luu cung ky, va tinh reviewed tu ket qua ghep', () => {
    const existing: CardBillRow = { id: 'b', user_id: 'u', account_id: 'acc-1', close_date: '2026-06-30', due_date: 'x', total: 1, created_at: '', dismissed: ['topups:2026-06-30'], reviewed: false }
    const r = emptyResult()
    r.unmatchedTopups = { count: 1, total: 1000, lines: [] }
    const rows = billRowsFor('acc-1', mergeStatements([st('2026-06-30', '3737', 100)]), { existing: [existing], results: new Map([['2026-06-30', r]]) })
    expect(rows[0].dismissed).toEqual(['topups:2026-06-30'])
    expect(rows[0].reviewed).toBe(true)   // hàng duy nhất (cụm nạp ví) đã bỏ qua
  })
  it('bill cua the KHAC cung ky khong duoc lay nham', () => {
    const other: CardBillRow = { id: 'b', user_id: 'u', account_id: 'acc-9', close_date: '2026-06-30', due_date: 'x', total: 1, created_at: '', dismissed: ['tx:z'], reviewed: true }
    const rows = billRowsFor('acc-1', mergeStatements([st('2026-06-30', '3737', 100)]), { existing: [other], results: new Map() })
    expect(rows[0].dismissed).toEqual([])
  })
  it('ket qua co hang mo thi reviewed false du dismissed co khoa khac', () => {
    const r = emptyResult()
    r.missingFromLedger.push({ iso: '2026-06-03', amount: 5, billed: 5, name: 'y', kind: 'purchase', isAdjustment: false })
    const rows = billRowsFor('acc-1', mergeStatements([st('2026-06-30', '3737', 100)]), { existing: [], results: new Map([['2026-06-30', r]]) })
    expect(rows[0].reviewed).toBe(false)
  })
})
```

Import `emptyResult`, `ReconcileResult`, `CardBillRow` vào test.

- [ ] **Step 2: Test thất bại — `statementOverview.test.ts`**

Thêm:

```ts
  it('reviewCount chi dem hang MO; hang da bo qua vao dismissedCount; status theo hang mo', () => {
    const r = emptyResult()
    r.unmatchedTopups = { count: 1, total: 9, lines: [] }
    r.missingFromLedger.push({ iso: '2026-06-03', amount: 5, billed: 5, name: 'y', kind: 'purchase', isAdjustment: false })
    const b = { ...bill('2026-06-30', 1), dismissed: ['topups:2026-06-30'], reviewed: false }
    const rows = overviewRows([b], 'acc-1', [merged('2026-06-30', 10)], new Map([['2026-06-30', r]]))
    expect(rows[0].loaded).toMatchObject({ reviewCount: 1, dismissedCount: 1 })
    expect(rows[0].status).toBe('review')
  })
  it('moi hang deu da bo qua ⇒ status ok; reviewed doc tu bill da luu', () => {
    const r = emptyResult()
    r.unmatchedTopups = { count: 1, total: 9, lines: [] }
    const b = { ...bill('2026-06-30', 1), dismissed: ['topups:2026-06-30'], reviewed: true }
    const rows = overviewRows([b], 'acc-1', [merged('2026-06-30', 10)], new Map([['2026-06-30', r]]))
    expect(rows[0].status).toBe('ok')
    expect(rows[0].reviewed).toBe(true)
  })
  it('ky saved-only mang reviewed cua bill', () => {
    const rows = overviewRows([{ ...bill('2026-04-30', 5), reviewed: true }], 'acc-1', [], new Map())
    expect(rows[0]).toMatchObject({ status: 'saved-only', reviewed: true })
  })
```

`bill()` fixture thêm `dismissed: [], reviewed: false`; test `saved-only` cũ dùng `toEqual` ⇒ thêm `reviewed: false` vào kỳ vọng; `loaded` `toMatchObject` cũ vẫn đúng.

- [ ] **Step 3: Đỏ** — chạy hai file test.

- [ ] **Step 4: Cài**

`statementBatch.ts`:

```ts
import type { CardBillRow } from '../../types/database.types'
import type { ReconcileResult } from './statementReconcile'
import { isReviewed } from './statementDismiss'
import { reviewRows } from './statementReviewRows'

/**
 * Dòng `card_bills` cho một thẻ — mỗi kỳ ĐÚNG một dòng. Dấu Bỏ qua của kỳ đã lưu được GIỮ
 * (feature có cache `useCardBills`, repo không đọc-rồi-ghi); `reviewed` tính lại từ kết
 * quả ghép hiện tại — chưa có kết quả (đang đọc sổ) thì false, không đoán.
 */
export function billRowsFor(
  accountId: string,
  merged: MergedStatement[],
  ctx: { existing: CardBillRow[]; results: Map<string, ReconcileResult> },
): NewCardBill[] {
  return merged.map((m) => {
    const cu = ctx.existing.find((b) => b.account_id === accountId && b.close_date === m.range.closeISO)
    const dismissed = cu?.dismissed ?? []
    const r = ctx.results.get(m.range.closeISO)
    const reviewed = r ? isReviewed(reviewRows(r, m.range.closeISO), dismissed) : false
    return { account_id: accountId, close_date: m.range.closeISO, due_date: m.range.dueISO, total: m.total, dismissed, reviewed }
  })
}
```

(Vòng import: `statementDismiss` import type `MergedStatement` từ `statementBatch`, và `statementBatch` import `isReviewed` từ `statementDismiss` — chỉ có một chiều là import GIÁ TRỊ, chiều kia là `import type`, TS/ESM chạy được. Nếu vitest báo vòng, chuyển `billAfterDismiss` sang nhận `range`/`total` rời thay cho `MergedStatement` để bỏ import type.)

`statementOverview.ts`: thêm `import { splitDismissed } from './statementDismiss'`; `OverviewRow` thêm `reviewed: boolean` và `loaded.dismissedCount: number`; trong vòng `bills` set `reviewed: b.reviewed`; trong vòng `merged`:

```ts
    const cu = bills.find((b) => b.account_id === accountId && b.close_date === m.range.closeISO)
    const { open, hidden } = splitDismissed(reviewRows(r, m.range.closeISO), cu?.dismissed ?? [])
    byClose.set(m.range.closeISO, {
      closeISO: m.range.closeISO, dueISO: m.range.dueISO, billTotal: m.total,
      loaded: { matchedCount: r.matchedCount, lineCount: m.lines.length, reviewCount: open.length, dismissedCount: hidden.length, parts: m.parts },
      reviewed: cu?.reviewed ?? false,
      status: open.length > 0 ? 'review' : 'ok',
    })
```

Cập nhật doc comment `loaded` (reviewCount = hàng MỞ).

- [ ] **Step 5: Xanh + `tsc -b`** — `StatementReconcilePage.tsx` gọi `billRowsFor(card.id, merged)` sẽ đỏ vì thiếu `ctx` ⇒ sửa ngay trong task này: `billRowsFor(card.id, merged, { existing: cardBills, results })`. Không đổi gì khác ở trang (Task 4 làm).

- [ ] **Step 6: Commit**

```bash
git add src/features/assets/statementBatch.ts src/features/assets/statementBatch.test.ts src/features/assets/statementOverview.ts src/features/assets/statementOverview.test.ts src/features/assets/StatementReconcilePage.tsx
git commit -m "feat(the): Luu N ky giu dau bo qua va tinh reviewed; bang tong quan dem hang mo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Trang — Bỏ qua / Xem lại / Bỏ qua hết / cụm Đã bỏ qua / chip Đã đối chiếu

**Files:**
- Modify: `src/features/assets/StatementReconcilePage.tsx`

**Interfaces:** Consumes Task 2–3. Không có export mới.

- [ ] **Step 1: Dữ liệu trên trang**

Sau `const hang = …`:

```ts
  // Bill đã lưu của kỳ đang chọn (nếu có) — dấu Bỏ qua nằm ở đây.
  const billChon = kyChon
    ? cardBills.find((b) => b.account_id === accountId && b.close_date === kyChon.range.closeISO) ?? null
    : null
  const daBoQua = billChon?.dismissed ?? []
  const { open: hangMo, hidden: hangDaBo } = splitDismissed(hang, daBoQua)
  const [moDaBoQua, setMoDaBoQua] = useState(false)

  // Bỏ qua / Xem lại: ghi NGAY một dòng card_bills cho kỳ đó (tạo bill luôn nếu chưa có),
  // không đợi "Lưu N kỳ". Kỳ lệch ngày thì không ghi — cùng lý do chặn Lưu.
  function ghiDau(keys: string[], on: boolean) {
    if (!card || !kyChon || lechNgay) return
    let next = daBoQua
    for (const k of keys) next = toggleKey(next, k, on)
    upsert.mutate([billAfterDismiss(kyChon, card.id, billChon, next, hang)], {
      onError: (err) => showToast(`Không ghi được: ${(err as Error).message}`, 'error'),
    })
  }
```

Import `billAfterDismiss, dismissKey, splitDismissed, toggleKey` từ `./statementDismiss`. Hook `useState` cho `moDaBoQua` phải đặt cùng cụm state phía trên (không sau điều kiện) — chuyển lên cạnh `moGiaiThich`.

- [ ] **Step 2: Render hàng mở**

Trong khối "Cần bạn xem": `hang` → `hangMo` (cả `<Num>{hang.length}</Num>` → `hangMo.length`, và điều kiện `hang.length > 0` → `hangMo.length > 0`). Sau nút Sửa/Thêm của mỗi hàng, thêm:

```tsx
                      <ActionButton
                        disabled={dangLamMoi || upsert.isPending || lechNgay}
                        onClick={() => ghiDau([dismissKey(h)], true)}
                      >
                        Bỏ qua
                      </ActionButton>
```

(Cụm `topups` chỉ có nút này — đúng spec §4.4.)

Dưới danh sách hàng mở, khi `hangMo.length > 0`:

```tsx
                  <div className="mt-2 flex justify-end">
                    <ActionButton
                      disabled={dangLamMoi || upsert.isPending || lechNgay}
                      onClick={() => ghiDau(hangMo.map(dismissKey), true)}
                    >
                      Bỏ qua hết phần còn lại kỳ này
                    </ActionButton>
                  </div>
```

- [ ] **Step 3: Cụm Đã bỏ qua**

Sau khối "Giải thích được" (cùng khuôn `button` + `<Collapse>`), khi `hangDaBo.length > 0`:

```tsx
              {hangDaBo.length > 0 && (
                <div className="mt-2">
                  <button type="button" onClick={() => setMoDaBoQua((s) => !s)} aria-expanded={moDaBoQua}
                    aria-controls={`da-bo-qua-${kyChon.range.closeISO}`} className="min-h-11 text-sm text-fg-muted">
                    Đã bỏ qua (<Num tone="muted">{hangDaBo.length}</Num>) {moDaBoQua ? '▴' : '▾'}
                  </button>
                  <Collapse open={moDaBoQua} id={`da-bo-qua-${kyChon.range.closeISO}`}>
                    {hangDaBo.map((h) => (
                      <div key={h.key} className="flex items-center justify-between gap-2 border-t border-border-subtle py-1.5 text-sm text-fg-muted first:border-t-0">
                        <span className="min-w-0 flex-1">{/* cùng nhãn như hàng mở — tách hàm nhỏ `nhanHang(h)` dùng chung để không chép hai lần */}</span>
                        <Money amount={Math.abs(h.amount)} currency={card.currency} tone="muted" />
                        <ActionButton disabled={upsert.isPending} onClick={() => ghiDau([dismissKey(h)], false)}>Xem lại</ActionButton>
                      </div>
                    ))}
                  </Collapse>
                </div>
              )}
```

Tách phần nhãn (`h.kind === 'ledger' && …`, `statement`, `topups`) thành hàm `nhanHang(h: ReviewRow): ReactNode` đặt ở trên `return`, dùng ở cả hai chỗ.

Khi kỳ không còn hàng mở nhưng có hàng đã bỏ qua hoặc giải thích được, hiện một dòng: `<p className="mt-2 text-sm text-fg-muted">Kỳ này không còn gì cần xem.</p>`.

- [ ] **Step 4: Chip Đã đối chiếu và nút Lưu**

Bảng tổng quan, cột Tình trạng: trước nhánh `r.status === 'ok'`, nếu `r.reviewed` (mọi status) ⇒ `<StatusChip tone="good">Đã đối chiếu</StatusChip>` thay cho "Khớp hết"/"Đã lưu, chưa nạp file lần này". Giữ "n cần xem" khi `review` (hàng mở > 0 thì `reviewed` đã false theo `billRowsFor`, nhưng bill cũ có thể `reviewed: true` trong khi lô mới có hàng mới ⇒ ưu tiên `status === 'review'` trước `reviewed`).

`luu()`: `billRowsFor(card.id, merged, { existing: cardBills, results })` (đã sửa ở Task 3). Toast "Đã lưu N kỳ" giữ.

- [ ] **Step 5: Kiểm**

`npx tsc -b` → 0. `npm test` → xanh (trừ mcpBundle nếu worktree). Không có test UI riêng.

- [ ] **Step 6: Commit**

```bash
git add src/features/assets/StatementReconcilePage.tsx
git commit -m "feat(the): Bo qua / Xem lai / Bo qua het ky; cum Da bo qua; chip Da doi chieu

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Panel trang thẻ — "Lệch — đã xem hết"

**Files:**
- Modify: `src/features/assets/AccountDetailPage.tsx` (~:806-825, khối `billGap`)

- [ ] **Step 1: Sửa khối**

```tsx
          {!isLoading && billGap != null && billGap !== 0 && (
            <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
              {/* … chú thích cũ giữ … Thêm: `bill.reviewed` = người dùng đã xem hết dòng
                  lệch trên trang Đối chiếu — số vẫn hiện (không giấu), nhưng không còn là
                  cảnh báo, nên đổi sang tone trung tính. */}
              <span className="text-fg-muted">
                {bill?.reviewed ? 'Lệch — đã xem hết' : billGap > 0 ? 'Lệch — sổ ghi thừa' : 'Lệch — sổ ghi thiếu'}
              </span>
              <Money amount={Math.abs(billGap)} currency={currency} tone={bill?.reviewed ? 'neutral' : 'warn'} className="font-medium" />
            </div>
          )}
```

- [ ] **Step 2: Kiểm + commit**

`npx tsc -b`; `npx vitest run tests/designSystem.test.ts`.

```bash
git add src/features/assets/AccountDetailPage.tsx
git commit -m "feat(the): panel the - 'Lech — da xem het' khi ky da doi chieu

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Kiểm bằng mắt (controller) + SQL cho người dùng

- [ ] **Step 1:** Dev server demo từ worktree (cấu hình launch tạm, xem `kiem-trong-worktree-tam-2-test-do`). Nạp fixture giả một kỳ có ≥ 3 hàng cần xem + cụm nạp ví.
- [ ] **Step 2:** Bấm **Bỏ qua** một hàng ⇒ hàng chuyển xuống "Đã bỏ qua (1)", chip vẫn "n−1 cần xem", bảng tổng quan cập nhật. Mở cụm, bấm **Xem lại** ⇒ hàng quay lên.
- [ ] **Step 3:** **Bỏ qua hết phần còn lại kỳ này** ⇒ "Kỳ này không còn gì cần xem.", chip "Đã đối chiếu". Quay lại trang thẻ ⇒ dòng "Lệch — đã xem hết" tone trung tính, số vẫn hiện.
- [ ] **Step 4:** Nạp lại cùng file ⇒ các hàng vẫn nằm trong "Đã bỏ qua", không hỏi lại. Sửa sổ (Thêm vào sổ một dòng đã bỏ qua) ⇒ hàng biến hẳn (khớp), dấu thừa vô hại.
- [ ] **Step 5:** Chế độ Sáng + 1,25× ở 375px: nút Bỏ qua không tràn.
- [ ] **Step 6:** Kiểm DB thật bằng anon key: `GET /rest/v1/card_bills?select=dismissed,reviewed&limit=1` — `400 42703` ⇒ chưa có cột ⇒ đưa nội dung `0071_card_bills_review.sql` cho người dùng dán vào SQL editor **trước khi deploy**; `200` ⇒ đã có.

---

## Tự soát kế hoạch

- **Phủ spec §7.1** migration hai cột, định dạng khoá (spec: `tx:`, `stm:iso|amount|name`, `topups:closeISO`; thêm `rtx:` cho hàng hoàn-tiền-sổ không id — mở rộng, không mâu thuẫn) → T1, T2. **§7.2** `NewCardBill` đủ trường, repo chỉ upsert, feature giữ dấu cũ; sao lưu cũ mặc định → T1, T3. **§7.3** Bỏ qua ghi ngay, tạo bill nếu chưa có, chặn khi lệch ngày; Xem lại; Bỏ qua hết; `reviewed` tính lại mỗi lần ghi (Bỏ qua, Xem lại, Lưu); panel "Lệch — đã xem hết" tone neutral → T4, T5.
- **Khác spec:** spec nói "reviewed tự gỡ khi lần nạp sau có dòng mới" — thực hiện qua `billRowsFor` khi Lưu và `billAfterDismiss` khi bấm; bảng tổng quan ưu tiên `status === 'review'` trước `reviewed` cũ nên UI không nói dối trước khi Lưu.
- **Tên nhất quán:** `dismissKey`, `splitDismissed` (`open`/`hidden`), `isReviewed`, `toggleKey`, `billAfterDismiss(m, accountId, existing, dismissed, rows)`, `billRowsFor(accountId, merged, {existing, results})`, `OverviewRow.reviewed`, `loaded.dismissedCount`.
- Đợt 4 (bố cục cuối, cột "Sổ", `matchedCount` wording, nới `refundDiffs`) — plan riêng.
