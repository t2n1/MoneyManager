# Đối chiếu sao kê đợt 2 — Đợt 2: trang riêng và sửa tại chỗ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Màn trượt "Nạp sao kê" trở thành trang riêng `/assets/account/:accountId/sao-ke`; bảng tổng quan mọi kỳ luôn có nội dung (kỳ đã lưu + kỳ vừa nạp); bấm dòng lệch mở màn sửa giao dịch quen thuộc, hoặc màn nhập mới đã điền sẵn từ dòng sao kê; sửa xong bảng tự tính lại mà không phải chọn lại file.

**Architecture:** Hai module toán thuần mới (`statementReviewRows.ts` dựng danh sách hàng từ `ReconcileResult`; `statementOverview.ts` dựng bảng tổng quan từ `card_bills` + lô vừa nạp). Trang `StatementReconcilePage.tsx` chỉ render và giữ state (file đã bóc, kỳ đang chọn, sheet đang mở). `AddFromStatementSheet.tsx` bọc `TransactionForm` với `initial` là `TransactionRow` giả (hợp đồng đã ghi trong chú thích `initialTagIds` của form). `ImportStatementSheet.tsx` bị gỡ. Bố cục cuối (bảng ghép đôi, segmented, thanh tỉ lệ) là việc của Đợt 4 — Đợt 2 chỉ chuyển nội dung hiện có sang trang và thêm nút.

**Tech Stack:** React 18, react-router v6 (`lazy` + `lazyRoute` trong `src/App.tsx`), TanStack Query hooks trong `src/hooks/queries.ts`, vitest, design system `src/components/ui`.

**Spec:** [docs/superpowers/specs/2026-09-13-doi-chieu-sao-ke-the-2-design.md](../specs/2026-09-13-doi-chieu-sao-ke-the-2-design.md) §5 (và §3 blast radius). Đợt 1 đã lên master ở `e230cec`.

## Global Constraints

- Toán thuần trong `.ts` không JSX, có `*.test.ts` cạnh file. Component render, không tính.
- Tiền là số nguyên minor units. Mọi tiền qua `<Money>`, mọi đếm qua `<Num>`.
- Giao diện: `<PageHeader>`, `<SectionTitle>`, `<ActionButton>`, `<Card>`, `<StatusChip>`, `<EmptyState>`; **không** tự viết `<h1>/<h2>/<select>`, không nút nền xanh tự chế, không giá trị tuỳ ý (`text-[13px]`, `w-[200px]`), không cỡ chữ px, không đặt bề rộng cột bằng px. `tests/designSystem.test.ts` canh ở mức nguồn. Mở [docs/design-system.md](../../design-system.md) §"Khuôn màn chuẩn" trước khi viết trang.
- Feature gọi dữ liệu qua hook `src/hooks/queries.ts`, không gọi `repo` trực tiếp (trừ `import type`).
- Kiểm kiểu `npx tsc -b`. Test `npx vitest run <file>`; cả bộ `npm test` (301 file, 4748 test ở `e230cec`).
- Không đụng `src/mcp/`, luật notification/holdings/funds ⇒ không `bundle:*`. Không migration ở đợt này.
- Mọi file LF; không prettier. Tên test không dấu. Chỉ `git add <file>`, không `-A`.
- GitNexus hay không kết nối: `impact` thay bằng `grep -rn "<tên>" src tests`; `detect_changes` thay bằng `git diff --stat` đối chiếu danh sách Files của task.
- Mọi trang đều lazy ⇒ `impact` luôn báo 0 caller cho trang; caller thật của `AccountDetailPage` chỉ là route ở `src/App.tsx`.
- Nếu làm trong worktree: tạo với `-c core.autocrlf=false`, junction `node_modules`; `tests/mcpBundle.test.ts` đỏ trong worktree là artefact junction, xanh ở repo chính.

---

## Bản đồ file

| File | Việc |
|---|---|
| Create `src/features/assets/statementReviewRows.ts` + `.test.ts` | `reviewRows(result)` → hàng "cần xem"/"hoàn tiền"; `prefillFromLine(line, card)` → `TransactionRow` giả |
| Create `src/features/assets/statementOverview.ts` + `.test.ts` | `overviewRows(bills, accountId, merged, results)` → bảng tổng quan |
| Create `src/features/assets/AddFromStatementSheet.tsx` | Sheet nhập mới điền sẵn từ dòng sao kê |
| Create `src/features/assets/StatementReconcilePage.tsx` | Trang riêng |
| Modify `src/App.tsx` | lazy + route |
| Modify `src/features/assets/AccountDetailPage.tsx` | nút "Nạp sao kê" → `navigate`; gỡ state/import sheet |
| Delete `src/features/assets/ImportStatementSheet.tsx` | thay bằng trang |

---

### Task 1: `statementReviewRows.ts` — hàng cần xem và bản điền sẵn

**Files:**
- Create: `src/features/assets/statementReviewRows.ts`
- Create: `src/features/assets/statementReviewRows.test.ts`

**Interfaces:**
- Consumes: `ReconcileResult`, `LedgerTx` (`./statementReconcile`); `StatementLine` (`./statementLine`); `TransactionRow` (`../../types/database.types`).
- Produces:
  ```ts
  export type ReviewRow =
    | { kind: 'ledger'; key: string; tx: LedgerTx; amount: number; refund: boolean }
    | { kind: 'statement'; key: string; line: StatementLine; amount: number; refund: boolean }
    | { kind: 'topups'; key: string; count: number; amount: number }
  export function reviewRows(result: ReconcileResult, closeISO: string): ReviewRow[]
  export function prefillFromLine(line: StatementLine, cardId: string): TransactionRow
  ```
  Thứ tự `reviewRows`: `extraInLedger` → `missingFromLedger` → cụm `topups` (nếu `count > 0`) → `refundDiffs` (ledger trước statement). `refund` = dòng hoàn (âm). `prefillFromLine`: `id: ''`, `type: 'expense'`, `amount: Math.abs(line.amount)`, `is_refund: line.amount < 0`, `account_id: cardId`, `occurred_on: line.iso`, `note: line.name`, các trường còn lại null/mặc định.

- [ ] **Step 1: Viết test thất bại**

`src/features/assets/statementReviewRows.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { prefillFromLine, reviewRows } from './statementReviewRows'
import { emptyResult, type LedgerTx } from './statementReconcile'
import type { StatementLine } from './statementLine'

const line = (iso: string, amount: number, name = 'X'): StatementLine => ({
  iso, amount, billed: amount, name, kind: 'purchase', isAdjustment: false,
})
const tx = (iso: string, amount: number, p: Partial<LedgerTx> = {}): LedgerTx => ({
  id: `t-${iso}-${amount}`, occurred_on: iso, amount, type: 'expense', is_refund: false,
  to_account_id: null, note: null, ...p,
})

describe('reviewRows', () => {
  it('thu tu: so-thua, the-thieu, cum nap vi, roi hoan tien', () => {
    const r = emptyResult()
    r.extraInLedger.push({ tx: tx('2026-06-10', 23000), amount: 23000 })
    r.missingFromLedger.push(line('2026-07-03', 5060, 'UNIQLO'))
    r.unmatchedTopups = { count: 2, total: 3376, lines: [line('2026-06-24', 1000), line('2026-06-20', 2376)] }
    r.refundDiffs.push({ source: 'ledger', label: 'Uniqlo hoan', iso: '2026-01-28', amount: -6990 })
    r.refundDiffs.push({ source: 'statement', label: '調整額 · 極楽茶屋', iso: '2026-01-03', amount: -7951 })
    const rows = reviewRows(r, '2026-06-30')
    expect(rows.map((x) => x.kind)).toEqual(['ledger', 'statement', 'topups', 'ledger', 'statement'])
    expect(rows[2]).toMatchObject({ kind: 'topups', count: 2, amount: 3376, key: 'topups-2026-06-30' })
    expect(rows[3]).toMatchObject({ kind: 'ledger', refund: true, amount: -6990 })
    expect(rows[4]).toMatchObject({ kind: 'statement', refund: true, amount: -7951 })
  })

  it('khoa duy nhat: hai dong the cung ngay cung tien van khac key', () => {
    const r = emptyResult()
    r.missingFromLedger.push(line('2026-06-16', 4950, 'CBTS'), line('2026-06-16', 4950, 'CBTS'))
    const keys = reviewRows(r, '2026-06-30').map((x) => x.key)
    expect(new Set(keys).size).toBe(2)
  })

  it('hoan tien statement trong refundDiffs mang line de Them vao so duoc', () => {
    const r = emptyResult()
    r.refundDiffs.push({ source: 'statement', label: '調整額 · A', iso: '2026-01-03', amount: -500 })
    const row = reviewRows(r, '2026-01-31')[0]
    expect(row.kind).toBe('statement')
    if (row.kind === 'statement') {
      expect(row.line).toMatchObject({ iso: '2026-01-03', amount: -500, name: '調整額 · A', kind: 'adjustment' })
    }
  })

  it('ket qua rong thi khong hang nao', () => {
    expect(reviewRows(emptyResult(), '2026-06-30')).toEqual([])
  })
})

describe('prefillFromLine', () => {
  it('dong the duong -> khoan chi, dien ngay/tien/the/ghi chu, id rong', () => {
    const row = prefillFromLine(line('2026-07-03', 5060, 'UNIQLO'), 'card-1')
    expect(row).toMatchObject({
      id: '', type: 'expense', amount: 5060, is_refund: false, account_id: 'card-1',
      to_account_id: null, occurred_on: '2026-07-03', note: 'UNIQLO', category_id: null,
    })
  })
  it('dong the am -> khoan hoan: amount duong, is_refund true', () => {
    const row = prefillFromLine(line('2026-01-03', -7951, '調整額 · 極楽茶屋'), 'card-1')
    expect(row.amount).toBe(7951)
    expect(row.is_refund).toBe(true)
    expect(row.type).toBe('expense')
  })
})
```

- [ ] **Step 2: Chạy cho chắc là đỏ**

Run: `npx vitest run src/features/assets/statementReviewRows.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Viết module**

```ts
// Dựng danh sách HÀNG cho phần "Cần bạn xem" của một kỳ từ ReconcileResult, và bản điền
// sẵn để "Thêm vào sổ" từ một dòng sao kê.
//
// Tách khỏi component vì hai lý do: thứ tự và khoá hàng là luật (test được), và
// `prefillFromLine` là chỗ duy nhất quyết định một dòng sao kê thành giao dịch trông thế
// nào — để sai dấu ở đây là khoản hoàn thành khoản chi.
//
// Thuần, không phụ thuộc React.

import type { TransactionRow } from '../../types/database.types'
import type { LedgerTx, ReconcileResult } from './statementReconcile'
import type { StatementLine } from './statementLine'

export type ReviewRow =
  | { kind: 'ledger'; key: string; tx: LedgerTx; amount: number; refund: boolean }
  | { kind: 'statement'; key: string; line: StatementLine; amount: number; refund: boolean }
  /** Nạp ví không ghép được — MỘT hàng cho cả kỳ, không rải lẻ (spec §4.4). */
  | { kind: 'topups'; key: string; count: number; amount: number }

/**
 * Thứ tự cố định: sổ thừa → thẻ thiếu → cụm nạp ví → hoàn tiền (sổ trước, thẻ sau).
 * Khoá hàng có chỉ số `i` vì hai dòng thẻ cùng ngày cùng tiền cùng tên là chuyện thật
 * (CBTS 4.950 × 3 trong một kỳ).
 */
export function reviewRows(result: ReconcileResult, closeISO: string): ReviewRow[] {
  const rows: ReviewRow[] = []
  result.extraInLedger.forEach((e) =>
    rows.push({ kind: 'ledger', key: `led-${e.tx.id}`, tx: e.tx, amount: e.amount, refund: false }),
  )
  result.missingFromLedger.forEach((l, i) =>
    rows.push({ kind: 'statement', key: `stm-${closeISO}-${i}-${l.iso}-${l.amount}`, line: l, amount: l.amount, refund: false }),
  )
  if (result.unmatchedTopups.count > 0) {
    rows.push({
      kind: 'topups',
      key: `topups-${closeISO}`,
      count: result.unmatchedTopups.count,
      amount: result.unmatchedTopups.total,
    })
  }
  result.refundDiffs.forEach((d, i) => {
    if (d.source === 'ledger') {
      // refundDiffs không giữ LedgerTx gốc — dựng lại đủ trường phép sửa cần: id không có,
      // nên hàng này KHÔNG có nút Sửa (xem trang). Giữ amount âm để tone đúng.
      rows.push({
        kind: 'ledger',
        key: `refund-led-${closeISO}-${i}`,
        tx: { id: '', occurred_on: d.iso, amount: Math.abs(d.amount), type: 'expense', is_refund: true, to_account_id: null, note: d.label },
        amount: d.amount,
        refund: true,
      })
    } else {
      rows.push({
        kind: 'statement',
        key: `refund-stm-${closeISO}-${i}`,
        line: { iso: d.iso, amount: d.amount, billed: d.amount, name: d.label, kind: 'adjustment', isAdjustment: true },
        amount: d.amount,
        refund: true,
      })
    }
  })
  return rows
}

/**
 * `TransactionRow` GIẢ (id rỗng) để mở `TransactionForm` điền sẵn — hợp đồng đã ghi ở
 * chú thích `initialTagIds` của form: bản điền sẵn không phải giao dịch thật.
 * Dòng thẻ âm = hoàn tiền ⇒ `amount` dương + `is_refund`, đúng cách repo ghi (không phải income).
 */
export function prefillFromLine(line: StatementLine, cardId: string): TransactionRow {
  const now = new Date().toISOString()
  return {
    id: '',
    user_id: '',
    type: 'expense',
    amount: Math.abs(line.amount),
    to_amount: null,
    category_id: null,
    account_id: cardId,
    to_account_id: null,
    recurring_rule_id: null,
    occurred_on: line.iso,
    note: line.name,
    is_refund: line.amount < 0,
    created_at: now,
    updated_at: now,
  }
}
```

Nếu `TransactionRow` đòi thêm trường bắt buộc khác (kiểm bằng `tsc -b`), thêm giá trị null/false tương ứng — **không** ép kiểu bằng `as`.

Lưu ý ca `refundDiffs` phía sổ: `ReconcileResult.refundDiffs` không giữ `LedgerTx` gốc (Đợt 1). Task này KHÔNG đổi `statementReconcile.ts`; hàng hoàn-tiền-sổ vì thế **không có nút Sửa** ở Đợt 2 (chỉ hiện). Ghi vào ledger như deferred; Đợt 3 hoặc 4 nới `refundDiffs` mang `tx`.

- [ ] **Step 4: Chạy cho chắc là xanh**

Run: `npx vitest run src/features/assets/statementReviewRows.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Commit**

```bash
git add src/features/assets/statementReviewRows.ts src/features/assets/statementReviewRows.test.ts
git commit -m "feat(the): hang can xem va ban dien san tu dong sao ke (toan thuan)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `statementOverview.ts` — bảng tổng quan mọi kỳ

**Files:**
- Create: `src/features/assets/statementOverview.ts`
- Create: `src/features/assets/statementOverview.test.ts`

**Interfaces:**
- Consumes: `CardBillRow` (`../../types/database.types`); `MergedStatement` (`./statementBatch`); `ReconcileResult` (`./statementReconcile`); `reviewRows` (Task 1).
- Produces:
  ```ts
  export interface OverviewRow {
    closeISO: string
    dueISO: string
    billTotal: number
    /** Chỉ có khi kỳ này vừa nạp file: Σ amount dòng sổ đã ghép + sổ thừa — KHÔNG phải cardMonthCharge. */
    loaded: null | { matchedCount: number; lineCount: number; reviewCount: number; parts: MergedStatement['parts'] }
    status: 'saved-only' | 'ok' | 'review'
  }
  export function overviewRows(bills: CardBillRow[], accountId: string, merged: MergedStatement[], results: Map<string, ReconcileResult>): OverviewRow[]
  ```
  Sắp `closeISO` GIẢM dần (kỳ mới nhất trên cùng). Kỳ vừa nạp thắng kỳ đã lưu về `billTotal`/`dueISO`. `status`: `saved-only` khi không có trong `merged`; `review` khi `reviewRows(...).length > 0`; còn lại `ok`.

  Cột "Sổ" của spec §7 (ảnh mẫu) cho kỳ vừa nạp **hoãn sang Đợt 4** cùng bảng ghép đôi — Đợt 2 hiện `Khớp a/b` và số hàng cần xem, đủ để chọn kỳ.

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, expect, it } from 'vitest'
import { overviewRows } from './statementOverview'
import { emptyResult } from './statementReconcile'
import type { MergedStatement } from './statementBatch'
import type { CardBillRow } from '../../types/database.types'

const bill = (close: string, total: number, account_id = 'acc-1'): CardBillRow => ({
  id: `b-${close}`, user_id: 'u', account_id, close_date: close, due_date: `${close}-due`, total, created_at: '',
})
const merged = (close: string, total: number, n = 1): MergedStatement => ({
  range: { start: '', end: '', closeISO: close, dueISO: `${close}-due2` },
  total,
  parts: [{ source: '3737', sourceLabel: 'Master 3737', total }],
  lines: Array.from({ length: n }, (_, i) => ({ iso: close, amount: i + 1, billed: i + 1, name: 'x', kind: 'purchase' as const, isAdjustment: false })),
  dueDateMismatch: false,
})

describe('overviewRows', () => {
  it('ky da luu nhung chua nap: saved-only, khong co loaded', () => {
    const rows = overviewRows([bill('2026-04-30', 71015)], 'acc-1', [], new Map())
    expect(rows).toEqual([{ closeISO: '2026-04-30', dueISO: '2026-04-30-due', billTotal: 71015, loaded: null, status: 'saved-only' }])
  })

  it('ky vua nap thang ky da luu ve tong va ngay rut; status theo hang can xem', () => {
    const r = emptyResult()
    r.matchedCount = 3
    const rows = overviewRows(
      [bill('2026-06-30', 100)], 'acc-1', [merged('2026-06-30', 158429, 4)], new Map([['2026-06-30', r]]),
    )
    expect(rows[0]).toMatchObject({ billTotal: 158429, dueISO: '2026-06-30-due2', status: 'ok' })
    expect(rows[0].loaded).toMatchObject({ matchedCount: 3, lineCount: 4, reviewCount: 0 })
  })

  it('co hang can xem thi status review va dem dung', () => {
    const r = emptyResult()
    r.missingFromLedger.push({ iso: '2026-06-03', amount: 5, billed: 5, name: 'y', kind: 'purchase', isAdjustment: false })
    const rows = overviewRows([], 'acc-1', [merged('2026-06-30', 10)], new Map([['2026-06-30', r]]))
    expect(rows[0].status).toBe('review')
    expect(rows[0].loaded?.reviewCount).toBe(1)
  })

  it('bo bill cua the khac; sap giam dan theo closeISO', () => {
    const rows = overviewRows(
      [bill('2026-05-31', 1), bill('2026-07-31', 2), bill('2026-06-30', 3, 'acc-9')], 'acc-1', [], new Map(),
    )
    expect(rows.map((r) => r.closeISO)).toEqual(['2026-07-31', '2026-05-31'])
  })

  it('ky vua nap ma chua co ket qua ghep (dang doc so) thi loaded co reviewCount 0', () => {
    const rows = overviewRows([], 'acc-1', [merged('2026-06-30', 10)], new Map())
    expect(rows[0].loaded).toMatchObject({ matchedCount: 0, reviewCount: 0 })
    expect(rows[0].status).toBe('ok')
  })
})
```

- [ ] **Step 2: Chạy cho chắc là đỏ**

Run: `npx vitest run src/features/assets/statementOverview.test.ts`

- [ ] **Step 3: Viết module**

```ts
// Bảng tổng quan mọi kỳ của MỘT thẻ: kỳ đã lưu trong `card_bills` ∪ kỳ vừa nạp trong lô.
//
// Vì sao luôn có nội dung: câu hỏi đầu tiên khi mở trang là "kỳ nào còn vấn đề, kỳ nào
// thiếu" — trả lời được ngay từ hoá đơn đã lưu, không cần chọn file. Kỳ vừa nạp đè kỳ đã
// lưu về tổng/ngày rút (file là nguồn mới hơn), và mang thêm kết quả ghép.
//
// Thuần, không phụ thuộc React.

import type { CardBillRow } from '../../types/database.types'
import type { MergedStatement } from './statementBatch'
import { emptyResult, type ReconcileResult } from './statementReconcile'
import { reviewRows } from './statementReviewRows'

export interface OverviewRow {
  closeISO: string
  dueISO: string
  billTotal: number
  loaded: null | {
    matchedCount: number
    lineCount: number
    reviewCount: number
    parts: MergedStatement['parts']
  }
  status: 'saved-only' | 'ok' | 'review'
}

export function overviewRows(
  bills: CardBillRow[],
  accountId: string,
  merged: MergedStatement[],
  results: Map<string, ReconcileResult>,
): OverviewRow[] {
  const byClose = new Map<string, OverviewRow>()
  for (const b of bills) {
    if (b.account_id !== accountId) continue
    byClose.set(b.close_date, {
      closeISO: b.close_date,
      dueISO: b.due_date,
      billTotal: b.total,
      loaded: null,
      status: 'saved-only',
    })
  }
  for (const m of merged) {
    const r = results.get(m.range.closeISO) ?? emptyResult()
    const reviewCount = reviewRows(r, m.range.closeISO).length
    byClose.set(m.range.closeISO, {
      closeISO: m.range.closeISO,
      dueISO: m.range.dueISO,
      billTotal: m.total,
      loaded: { matchedCount: r.matchedCount, lineCount: m.lines.length, reviewCount, parts: m.parts },
      status: reviewCount > 0 ? 'review' : 'ok',
    })
  }
  return [...byClose.values()].sort((a, b) => b.closeISO.localeCompare(a.closeISO))
}
```

- [ ] **Step 4: Chạy cho chắc là xanh**

Run: `npx vitest run src/features/assets/statementOverview.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add src/features/assets/statementOverview.ts src/features/assets/statementOverview.test.ts
git commit -m "feat(the): bang tong quan moi ky cua the (toan thuan)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `AddFromStatementSheet.tsx` — nhập mới điền sẵn

**Files:**
- Create: `src/features/assets/AddFromStatementSheet.tsx`

**Interfaces:**
- Consumes: `TransactionForm` (`../transactions/TransactionForm`, props `initial`, `submitLabel`, `onSubmit(values: NewTransaction)`, `showRefundOption`); `useCreateTransaction` (`../../hooks/queries`); `useEscClose` (`../../hooks/useEscClose`); `SectionTitle` (`../../components/ui`); `TransactionRow`.
- Produces: `export function AddFromStatementSheet({ initial, onClose, onSaved }: { initial: TransactionRow; onClose: () => void; onSaved: () => void })`.

Không có unit test riêng: component chỉ nối form với hook (đúng luật "component không tính"); `tests/designSystem.test.ts` canh nguồn; kiểm bằng mắt ở Task 5.

- [ ] **Step 1: Viết component**

Sao khuôn lớp phủ + panel từ `EditTransactionSheet.tsx` (cùng class: `fixed inset-0 z-40 … animate-overlay-in`, panel `max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface-page p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none lg:max-w-5xl lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop`, `role="dialog" aria-modal="true" aria-labelledby`), nhưng KHÔNG có nút Xóa / Chia / Xem mọi lần / lai lịch:

```tsx
// Thêm một giao dịch vào sổ TỪ một dòng sao kê: ngày, tiền, thẻ, tên quán đã điền, người
// dùng chỉ chọn danh mục rồi lưu. Đây là nửa còn lại của "Sửa" trên trang đối chiếu:
// "sổ có, thẻ không" thì mở EditTransactionSheet; "thẻ có, sổ không" thì mở màn này.
//
// `initial` là TransactionRow GIẢ (id rỗng) do `prefillFromLine` dựng — hợp đồng đã ghi
// ở chú thích `initialTagIds` của TransactionForm. `showRefundOption` bật để dòng thẻ âm
// (đã điền `is_refund`) hiện đúng ô tích, người dùng thấy và đổi được.

import { useEffect, useRef } from 'react'
import { SectionTitle } from '../../components/ui'
import { useCreateTransaction } from '../../hooks/queries'
import { useEscClose } from '../../hooks/useEscClose'
import type { TransactionRow } from '../../types/database.types'
import { TransactionForm } from '../transactions/TransactionForm'

interface Props {
  initial: TransactionRow
  onClose: () => void
  /** Gọi SAU khi lưu thành công — trang đếm số lần sửa để nhắc "Chỉnh số nợ". */
  onSaved: () => void
}

export function AddFromStatementSheet({ initial, onClose, onSaved }: Props) {
  useEscClose(onClose)
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [])
  const create = useCreateTransaction()

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center lg:p-6 animate-overlay-in"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-from-stm-title"
        tabIndex={-1}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface-page p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none lg:max-w-5xl lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle role="block" id="add-from-stm-title">
            Thêm vào sổ từ sao kê
          </SectionTitle>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-sunken"
          >
            Đóng
          </button>
        </div>
        <TransactionForm
          initial={initial}
          showRefundOption
          submitLabel="Thêm vào sổ"
          onSubmit={async (values) => {
            await create.mutateAsync(values)
            onSaved()
            onClose()
          }}
        />
      </div>
    </div>
  )
}
```

Nếu `tests/designSystem.test.ts` báo "sheet cuộn (max-h-[92vh]) phải mang overscroll-contain" — panel này dùng `max-h-[90dvh]` như `EditTransactionSheet` nên không rơi vào luật đó; nếu vẫn báo, thêm `overscroll-contain` vào panel.

- [ ] **Step 2: Kiểm kiểu + test design system**

Run: `npx tsc -b` → 0 lỗi.
Run: `npx vitest run tests/designSystem.test.ts` → PASS.

Nếu `TransactionForm` từ chối `initial.id === ''` ở đâu đó (vd. tra `allLinks.filter(l => l.transaction_id === initial.id)` — chỉ trả rỗng, không lỗi), ghi nhận vào report; KHÔNG sửa `TransactionForm`.

- [ ] **Step 3: Commit**

```bash
git add src/features/assets/AddFromStatementSheet.tsx
git commit -m "feat(the): sheet Them vao so dien san tu dong sao ke

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Trang `StatementReconcilePage.tsx`, route, gỡ màn trượt

**Files:**
- Create: `src/features/assets/StatementReconcilePage.tsx`
- Modify: `src/App.tsx` (khối `lazy` ~dòng 30; khối `<Route>` ~dòng 194)
- Modify: `src/features/assets/AccountDetailPage.tsx` (import dòng 48; state dòng 90; nút ~dòng 900; render sheet ~dòng 973–983)
- Delete: `src/features/assets/ImportStatementSheet.tsx`

**Interfaces:**
- Consumes: Task 1–3; `parseStatement`, `mergeStatements`, `billRowsFor`, `MergedStatement` (`./statementBatch`, `./parseStatement`); `reconcileBatch`, `emptyResult`, `LedgerTx`, `ReconcileResult` (`./statementReconcile`); `ParsedStatement` (`./statementLine`); hooks `useAccounts`, `useCardBills`, `useSearchTransactions`, `useUpsertCardBills`; `EditTransactionSheet` (`../transactions/EditTransactionSheet`, props `{tx, onClose}`); UI `PageHeader, Card, SectionTitle, ActionButton, Money, Num, StatusChip, EmptyState, Collapse`; `dayMonthLabel` (`../../lib/dates`); `showToast` (`../../lib/dialog`); `CurrencyCode` (`../../lib/money`).
- Produces: `export function StatementReconcilePage()` đọc `:accountId` bằng `useParams`.

- [ ] **Step 1: Kiểm caller trước khi gỡ**

Run: `grep -rn "ImportStatementSheet\|showImportStatement" src tests`
Expected: chỉ `AccountDetailPage.tsx` (import, state, nút, render) và chính file sheet.

- [ ] **Step 2: Viết trang**

`src/features/assets/StatementReconcilePage.tsx` — chuyển nguyên logic dữ liệu của `ImportStatementSheet` (FAR_FUTURE, `toLedgerTx`, `merged`, `earliestStart`, `useSearchTransactions`, `reconcileBatch` một lần, `lechNgay`, `chonFile`, `luu`) sang trang, rồi thêm: bảng tổng quan, kỳ đang chọn, nút Sửa/Thêm, đếm lần sửa. Khung:

```tsx
// Trang đối chiếu sao kê của MỘT thẻ — thay màn trượt ImportStatementSheet (Đợt 1).
//
// Vì sao là trang: lô 13 kỳ với vài chục dòng lệch không vừa một màn trượt, và khi bấm
// một dòng để sửa giao dịch thì màn sửa phải mở ĐÈ lên đây rồi đóng lại mà file đã chọn
// vẫn còn — state của trang giữ file trong bộ nhớ, sửa xong query giao dịch invalidate,
// phép ghép tự chạy lại. Rời trang thì mất file đã chọn; hoá đơn đã bấm Lưu thì còn.
//
// Trang này KHÔNG bao giờ tự sửa/tạo/xoá giao dịch. Việc đó chỉ xảy ra khi người dùng bấm
// Sửa / Thêm vào sổ và lưu ở màn đó.

import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileUp } from 'lucide-react'
import {
  ActionButton, Card, Collapse, EmptyState, Money, Num, PageHeader, SectionTitle, StatusChip,
} from '../../components/ui'
import { useAccounts, useCardBills, useSearchTransactions, useUpsertCardBills } from '../../hooks/queries'
import { dayMonthLabel } from '../../lib/dates'
import { showToast } from '../../lib/dialog'
import type { CurrencyCode } from '../../lib/money'
import type { TransactionRow } from '../../types/database.types'
import { EditTransactionSheet } from '../transactions/EditTransactionSheet'
import { AddFromStatementSheet } from './AddFromStatementSheet'
import { parseStatement } from './parseStatement'
import { billRowsFor, mergeStatements } from './statementBatch'
import type { ParsedStatement } from './statementLine'
import { overviewRows } from './statementOverview'
import { emptyResult, reconcileBatch, type LedgerTx } from './statementReconcile'
import { prefillFromLine, reviewRows } from './statementReviewRows'

const FAR_FUTURE = '9999-12-31'

const toLedgerTx = (t: TransactionRow): LedgerTx => ({
  id: t.id, occurred_on: t.occurred_on, amount: t.amount, type: t.type as LedgerTx['type'],
  is_refund: t.is_refund ?? false, to_account_id: t.to_account_id, note: t.note,
})

export function StatementReconcilePage() {
  const { accountId = '' } = useParams()
  const { data: accounts = [] } = useAccounts()
  const account = accounts.find((a) => a.id === accountId)
  const isCard = account?.type === 'card'
  const card = account
    ? { id: account.id, name: account.name, currency: account.currency as CurrencyCode,
        statementDay: account.statement_day, paymentDueDay: account.payment_due_day }
    : null
  const coNgay = !!card && card.statementDay != null && card.paymentDueDay != null

  const [parsed, setParsed] = useState<ParsedStatement[]>([])
  const [unreadable, setUnreadable] = useState<string[]>([])
  const [chon, setChon] = useState<string | null>(null)          // closeISO kỳ đang chọn
  const [moGiaiThich, setMoGiaiThich] = useState(false)
  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const [adding, setAdding] = useState<TransactionRow | null>(null)
  const [soLanSua, setSoLanSua] = useState(0)
  const upsert = useUpsertCardBills()
  const { data: cardBills = [] } = useCardBills()

  const merged = useMemo(() => mergeStatements(parsed), [parsed])
  const earliestStart = useMemo(() => {
    let min: string | null = null
    for (const m of merged) for (const d of [m.range.start, ...m.lines.map((l) => l.iso)]) if (min == null || d < min) min = d
    return min
  }, [merged])
  const { data: txs = [], isPending } = useSearchTransactions(
    { start: earliestStart ?? FAR_FUTURE, end: FAR_FUTURE, accountIds: [accountId] },
    earliestStart != null,
  )
  const dangDocSo = earliestStart != null && isPending
  const results = useMemo(
    () => (dangDocSo ? new Map() : reconcileBatch(merged, txs.map(toLedgerTx), accountId)),
    [dangDocSo, merged, txs, accountId],
  )
  const rows = useMemo(() => overviewRows(cardBills, accountId, merged, results), [cardBills, accountId, merged, results])
  // Kỳ đang chọn: người dùng bấm thì theo họ; chưa bấm thì kỳ muộn nhất còn hàng cần xem,
  // không có thì kỳ muộn nhất vừa nạp.
  const chonHieuLuc = chon ?? rows.find((r) => r.status === 'review')?.closeISO ?? rows.find((r) => r.loaded)?.closeISO ?? null
  const kyChon = merged.find((m) => m.range.closeISO === chonHieuLuc) ?? null
  const ketQua = kyChon ? results.get(kyChon.range.closeISO) ?? emptyResult() : null
  const hang = kyChon && ketQua ? reviewRows(ketQua, kyChon.range.closeISO) : []
  const lechNgay = merged.some((m) => m.dueDateMismatch)

  async function chonFile(files: FileList | null) { /* y hệt ImportStatementSheet, dùng parseStatement(text, card!, f.name) */ }
  function luu() {
    if (!card) return
    upsert.mutate(billRowsFor(card.id, merged), {
      onSuccess: () => showToast(`Đã lưu ${merged.length} kỳ`, 'success'),
      onError: (err) => showToast(`Không lưu được: ${(err as Error).message}`, 'error'),
    })
  }
  const txById = useMemo(() => new Map(txs.map((t) => [t.id, t])), [txs])

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <PageHeader
        title="Đối chiếu sao kê"
        back={`/assets/account/${accountId}`}
        subtitle={card ? `${card.name} · chỉ lưu tổng hoá đơn, không đụng giao dịch nào` : undefined}
      />
      {/* … khối chọn file (sao từ sheet, disabled khi !coNgay), cảnh báo unreadable / lechNgay / thiếu ngày (câu ở AccountDetailPage ~:888) … */}
      {/* Bảng tổng quan */}
      <Card as="section" padding="none">
        <SectionTitle className="px-3 pt-3">Các kỳ</SectionTitle>
        {rows.length === 0 ? (
          <EmptyState compact>Chưa có hoá đơn nào. Chọn file sao kê để bắt đầu.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm tabular-nums">
              <thead><tr className="text-fg-muted">
                <th className="py-1 pl-3 pr-2 text-left font-medium">Kỳ</th>
                <th className="hidden py-1 px-2 font-medium sm:table-cell">Bị rút</th>
                <th className="py-1 px-2 font-medium">Hoá đơn</th>
                <th className="py-1 px-2 font-medium">Khớp</th>
                <th className="py-1 pl-2 pr-3 text-left font-medium">Tình trạng</th>
              </tr></thead>
              <tbody className="text-fg-secondary">
                {rows.map((r) => (
                  <tr key={r.closeISO}
                      className={`cursor-pointer border-t border-border-subtle ${r.closeISO === chonHieuLuc ? 'bg-surface-sunken' : ''}`}
                      onClick={() => r.loaded && setChon(r.closeISO)}>
                    <td className="py-2 pl-3 pr-2 text-left text-fg-primary">{dayMonthLabel(r.closeISO)}</td>
                    <td className="hidden py-2 px-2 sm:table-cell">{dayMonthLabel(r.dueISO)}</td>
                    <td className="py-2 px-2">
                      <Money amount={r.billTotal} currency={card?.currency ?? 'JPY'} tone="out" />
                      {r.loaded && r.loaded.parts.length > 1 && (
                        <span className="block text-2xs text-fg-muted">
                          {r.loaded.parts.map((p, i) => <span key={p.source}>{i > 0 && ' · '}{p.sourceLabel} <Money amount={p.total} currency={card?.currency ?? 'JPY'} tone="muted" /></span>)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2">{r.loaded ? <><Num tone="muted">{r.loaded.matchedCount}</Num>/<Num tone="muted">{r.loaded.lineCount}</Num></> : '—'}</td>
                    <td className="py-2 pl-2 pr-3 text-left">
                      {r.status === 'saved-only' && <span className="text-fg-muted">Đã lưu, chưa nạp file lần này</span>}
                      {r.status === 'ok' && <StatusChip tone="good">Khớp hết</StatusChip>}
                      {r.status === 'review' && <StatusChip tone="warn"><Num tone="warn">{r.loaded!.reviewCount}</Num> cần xem</StatusChip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {/* Kỳ đang chọn */}
      {kyChon && ketQua && (
        <Card as="section" padding="lg">
          <SectionTitle>Quẹt {dayMonthLabel(kyChon.range.start)} – {dayMonthLabel(kyChon.range.closeISO)} · bị rút {dayMonthLabel(kyChon.range.dueISO)}</SectionTitle>
          {hang.length > 0 && (
            <div className="mt-2">
              <p className="text-sm font-medium text-fg-primary">Cần bạn xem (<Num>{hang.length}</Num>)</p>
              {hang.map((h) => (
                <div key={h.key} className="flex items-center justify-between gap-2 border-t border-border-subtle py-1.5 text-sm first:border-t-0">
                  <span className="min-w-0 flex-1 text-fg-muted">
                    {h.kind === 'ledger' && `${dayMonthLabel(h.tx.occurred_on)} · ${h.tx.note || 'không ghi chú'} — sổ có, thẻ không`}
                    {h.kind === 'statement' && `${dayMonthLabel(h.line.iso)} · ${h.line.name} — thẻ có, sổ không`}
                    {h.kind === 'topups' && `Nạp ví chưa ghép được — ${h.count} lần, ví có số dư nên chưa chắc là lỗi sổ`}
                  </span>
                  <Money amount={Math.abs(h.amount)} currency={card!.currency} tone={h.amount < 0 ? 'in' : 'out'} />
                  {h.kind === 'ledger' && h.tx.id !== '' && (
                    <ActionButton onClick={() => { const t = txById.get(h.tx.id); if (t) setEditing(t) }}>Sửa</ActionButton>
                  )}
                  {h.kind === 'statement' && (
                    <ActionButton onClick={() => setAdding(prefillFromLine(h.line, card!.id))}>Thêm vào sổ</ActionButton>
                  )}
                </div>
              ))}
            </div>
          )}
          {/* Giải thích được: giữ nguyên khối Collapse của sheet cũ, đọc ketQua.explained */}
        </Card>
      )}
      {/* Cuối trang */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {soLanSua > 0 && (
          <p className="mr-auto text-2xs text-fg-muted">
            Đã sửa <Num tone="muted">{soLanSua}</Num> dòng. Số dư thẻ đổi theo — nhớ Chỉnh số nợ trên trang thẻ.
          </p>
        )}
        {merged.length > 0 && (
          <ActionButton variant="primary" onClick={luu} disabled={lechNgay || upsert.isPending || dangDocSo}>
            {upsert.isPending ? 'Đang lưu…' : 'Lưu'} <Num tone="onAccent">{merged.length}</Num> kỳ
          </ActionButton>
        )}
      </div>
      {editing && <EditTransactionSheet tx={editing} onClose={() => { setEditing(null); setSoLanSua((n) => n + 1) }} />}
      {adding && <AddFromStatementSheet initial={adding} onClose={() => setAdding(null)} onSaved={() => setSoLanSua((n) => n + 1)} />}
    </div>
  )
}
```

Ghi chú bắt buộc khi hoàn thiện:
- `EditTransactionSheet` không báo "đã lưu hay chỉ đóng" ⇒ đếm mọi lần đóng là ước lượng cao; chấp nhận (dòng nhắc là gợi ý, không phải con số kế toán) — viết chú thích nói rõ.
- Nút Sửa chỉ hiện khi `h.tx.id !== ''` (hàng hoàn-tiền-sổ từ `refundDiffs` không có id — Task 1).
- Không dùng `useNavigate` trong trang này. Không thêm `<select>`, `<h2>`.
- Bảng `<table>` có tiền lệ (`DebtDetailPage.tsx:332`); bọc `overflow-x-auto`; không đặt bề rộng cột bằng px.
- Không có `thumb`/segmented ở đợt này.

- [ ] **Step 3: Route**

`src/App.tsx`, cạnh `AccountDetailPage` lazy (~dòng 30):

```ts
const StatementReconcilePage = lazy(() =>
  import('./features/assets/StatementReconcilePage').then((m) => ({ default: m.StatementReconcilePage })),
)
```

Cạnh route `:194`:

```tsx
<Route path="/assets/account/:accountId/sao-ke" element={lazyRoute(<StatementReconcilePage />, 'table')} />
```

- [ ] **Step 4: `AccountDetailPage.tsx`**

- Xoá `import { ImportStatementSheet } from './ImportStatementSheet'` (dòng 48).
- Xoá `const [showImportStatement, setShowImportStatement] = useState(false)` (dòng 90).
- Nút (~dòng 900): `onClick={() => navigate(\`/assets/account/${account.id}/sao-ke\`)}` — `navigate` đã có (`useNavigate()` dòng 78). Giữ icon `FileUp` và chữ "Nạp sao kê"; chú thích trên nút đổi câu "mở màn trượt" thành "dẫn sang trang đối chiếu".
- Xoá khối `{showImportStatement && account && (<ImportStatementSheet …/>)}` (~dòng 973–983).
- Nếu `CurrencyCode` chỉ còn dùng cho sheet đã xoá thì bỏ import; `tsc -b` báo unused sẽ nói.

- [ ] **Step 5: Gỡ sheet**

```bash
git rm -q src/features/assets/ImportStatementSheet.tsx
```

- [ ] **Step 6: Kiểm kiểu + cả bộ test**

Run: `npx tsc -b` → 0 lỗi.
Run: `npm test` → xanh hết (ở repo chính) / trừ `mcpBundle` nếu trong worktree.

Nếu `tests/designSystem.test.ts` đỏ: đọc đúng dòng nó chỉ, sửa theo token có tên (xem docs/design-system.md), không nới test.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/features/assets/AccountDetailPage.tsx src/features/assets/StatementReconcilePage.tsx
git commit -m "feat(the): trang Doi chieu sao ke thay man truot; bam dong lech mo Sua / Them vao so

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(`git rm` ở Step 5 đã stage phần xoá — vào cùng commit này.)

---

### Task 5: Kiểm bằng mắt trên app demo (controller làm)

**Files:** không đổi code trừ khi tìm ra lỗi.

- [ ] **Step 1: Dev server demo** (`preview_start` với cấu hình `so-chi-tieu-demo`, hoặc cấu hình tạm trỏ worktree — xem ghi chú `kiem-trong-worktree-tam-2-test-do`). Tài khoản demo "Thẻ Rakuten" có `statement_day 31 / payment_due_day 27`.
- [ ] **Step 2: Trang thẻ → "Nạp sao kê"** phải chuyển URL sang `/assets/account/<id>/sao-ke`, có nút quay lại về trang thẻ. Bảng "Các kỳ" rỗng hiện câu mời chọn file.
- [ ] **Step 3: Nạp 2 file enavi GIẢ** (fixture 3737 + 2565 cùng kỳ, viết vào `public/tmp-sao-ke/`, xoá sau): bảng có một hàng, chip "n cần xem", dòng tách "Visa 2565 · Master 3737". Khối kỳ đang chọn tự mở.
- [ ] **Step 4: Bấm "Thêm vào sổ"** ở một dòng "thẻ có, sổ không": sheet mở với ngày/tiền/thẻ/ghi chú điền sẵn; chọn danh mục, lưu. Sheet đóng, hàng đó BIẾN khỏi "Cần bạn xem" (phép ghép chạy lại), dòng nhắc "Đã sửa 1 dòng…" hiện.
- [ ] **Step 5: Bấm "Sửa"** ở một dòng "sổ có, thẻ không" (tạo trước một giao dịch demo trên thẻ không có trong file): `EditTransactionSheet` mở đúng giao dịch; đổi tài khoản, lưu; hàng biến.
- [ ] **Step 6: Bấm "Lưu 1 kỳ"**, quay lại trang thẻ: panel hiện "Hoá đơn nhà thẻ" đúng tổng. Vào lại trang đối chiếu: bảng có hàng "Đã lưu, chưa nạp file lần này".
- [ ] **Step 7: Chế độ Sáng + cỡ chữ 1,25× ở 375px** (`kiem-che-do-sang-va-co-chu`): bảng cuộn ngang trong Card, không tràn trang; không có chuỗi `{…}` lọt ra chữ.
- [ ] **Step 8:** Chụp màn hình; xoá `public/tmp-sao-ke/`; `git status` sạch ngoài file đã commit.

---

## Tự soát kế hoạch

- **Phủ spec §5.1** route, trang, `PageHeader` + quay lại, thiếu ngày ⇒ câu nhắc + ô chọn file vô hiệu, nút ở `AccountDetailPage` → `navigate`, gỡ sheet → Task 4. **§5.2** `useCardBills` ⇒ bảng luôn có nội dung; cửa sổ truy vấn mở tới dòng thẻ sớm nhất; kỳ mặc định = kỳ muộn nhất còn cần xem → Task 2 + Task 4. Cột "Sổ" cho kỳ đã lưu: spec cho phép "—" khi ngoài cửa sổ; Đợt 2 luôn "—" cho `saved-only` (không mở rộng truy vấn) và hoãn cột "Sổ" của kỳ vừa nạp sang Đợt 4 cùng bảng ghép đôi — **ghi rõ là hoãn**, không phải bỏ. **§5.3** Sửa → `EditTransactionSheet`; Thêm vào sổ → `AddFromStatementSheet` với `prefillFromLine` (`is_refund` theo dấu) → Task 1, 3, 4; cụm nạp ví không nút Sửa/Thêm → Task 4 (chỉ Bỏ qua ở Đợt 3); nhắc Chỉnh số nợ → Task 4.
- **Khác spec, có chủ ý:** hàng hoàn-tiền-sổ trong `refundDiffs` không mang `LedgerTx` gốc (giới hạn của Đợt 1) ⇒ Đợt 2 không có nút Sửa cho hàng đó. Ghi deferred; Đợt 3/4 nới `refundDiffs`.
- **Tên nhất quán:** `reviewRows(result, closeISO)`, `prefillFromLine(line, cardId)`, `overviewRows(bills, accountId, merged, results)`, `AddFromStatementSheet({initial, onClose, onSaved})`, `StatementReconcilePage()`; `ReviewRow.kind` ∈ `ledger | statement | topups`; `OverviewRow.status` ∈ `saved-only | ok | review` dùng cùng một kiểu ở Task 1–4.
- **Không placeholder:** khối `chonFile` ở Task 4 nói "y hệt ImportStatementSheet" — file đó còn trong git tại `e230cec` (`git show e230cec:src/features/assets/ImportStatementSheet.tsx`), implementer chép từ đó trước khi `git rm`; khối "Giải thích được" cũng vậy.
- Đợt 3 (Bỏ qua / reviewed, migration 0071) và Đợt 4 (bố cục cuối) — plan riêng, sau khi Đợt 2 lên master.
