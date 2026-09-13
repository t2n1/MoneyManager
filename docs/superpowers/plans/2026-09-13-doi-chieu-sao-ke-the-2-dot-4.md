# Đối chiếu sao kê đợt 2 — Đợt 4: bố cục cuối (bảng ghép đôi)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang Đối chiếu sao kê có bố cục người dùng đã duyệt trên bản mẫu (B + C): bảng tổng quan thêm cột **Sổ** và **Lệch**; kỳ đang chọn hiện **bảng ghép đôi** sổ ↔ thẻ, mặc định chỉ dòng lệch, gạt sang "Tất cả n cặp" để thấy cả cặp đã khớp; hàng "giải thích được" nằm **trong** bảng (chữ nghiêng, nhãn), không thu gọn; hàng hoàn-tiền phía sổ có nút **Sửa**; cách nói "Khớp a/b" đổi thành "Khớp a · giải thích c / b dòng"; dọn trường tương thích `isAdjustment`.

**Architecture:** `reconcileBatch` trả thêm `ledgerTotal` mỗi kỳ và giữ `LedgerTx` trong `refundDiffs` phía sổ (không đổi luật ghép). Module thuần mới `pairRows.ts` xếp mọi hàng của một kỳ thành một danh sách `PairRow` có thứ tự cố định (lệch → giải thích được → khớp (khi "Tất cả") → đã bỏ qua). Trang chỉ render danh sách đó bằng grid 12 cột (`sm:grid-cols-12`), mobile xếp mỗi cặp thành ô hai dòng. `SegmentedControl` sẵn có làm nút gạt.

**Tech Stack:** React 18, TanStack Query, TypeScript, vitest; `SegmentedControl`, `StatusChip`, `STATUS_FILL` (`src/components/ui/statusColors.ts`).

**Spec:** [docs/superpowers/specs/2026-09-13-doi-chieu-sao-ke-the-2-design.md](../specs/2026-09-13-doi-chieu-sao-ke-the-2-design.md) §8. Đợt 1–3 đã lên master (`75dc939`).

## Global Constraints

- Toán thuần trong `.ts`, test cạnh file. Tiền là số nguyên minor units. Mọi tiền qua `<Money>`, đếm qua `<Num>`.
- Design system ([docs/design-system.md](../../design-system.md)): `<PageHeader>`, `<SectionTitle>`, `<ActionButton>`, `<Card>`, `<StatusChip>`, `<SegmentedControl>`; **không** giá trị tuỳ ý (`grid-cols-[…]`, `w-[…]`, `text-[…]`), **không** bề rộng cột bằng px; grid dùng utility có tên (`sm:grid-cols-12`, `sm:col-span-5`); thanh tỉ lệ = `div` nền `bg-surface-sunken` + fill `STATUS_FILL.good`, bề rộng bằng `style={{ width: \`${pct}%\` }}` (tiền lệ `AccountDetailPage.tsx:522`). `tests/designSystem.test.ts` canh.
- Không đổi luật ghép trong `reconcileBatch` (bốn luật PayPay + ba luật Rakuten + `late-posting`); chỉ THÊM dữ liệu trả về. 33 test hiện có của nó phải xanh không đổi kỳ vọng (trừ chỗ thêm trường).
- Không migration, không `src/mcp/` ⇒ không bundle.
- `npx tsc -b`; `npm test` (304 file, 4776 test ở `75dc939`). LF; không prettier; tên test không dấu; chỉ `git add <file>`. GitNexus hay không kết nối ⇒ grep.
- Worktree: `-c core.autocrlf=false`, junction `node_modules`; `tests/mcpBundle.test.ts` đỏ trong worktree là artefact junction.

---

## Bản đồ file

| File | Việc |
|---|---|
| Modify `src/features/assets/statementReconcile.ts` (+ test) | `refundDiffs[].tx?`, `ReconcileResult.ledgerTotal` |
| Modify `src/features/assets/statementReviewRows.ts` (+ test) | hàng hoàn-tiền-sổ dùng `tx` thật khi có |
| Create `src/features/assets/pairRows.ts` (+ test) | `pairRows(...)`: danh sách hàng bảng ghép đôi |
| Modify `src/features/assets/statementOverview.ts` (+ test) | `loaded.ledgerTotal`, `loaded.explainedCount`, `gap` |
| Modify `src/features/assets/StatementReconcilePage.tsx` | bố cục cuối |
| Modify `src/features/assets/statementLine.ts`, `paypayStatement.ts`, `rakutenStatement.ts`, `statementDismiss.ts`? và các test | dọn `isAdjustment` |

---

### Task 1: `reconcileBatch` trả thêm `ledgerTotal` và giữ `tx` cho hoàn tiền phía sổ

**Files:**
- Modify: `src/features/assets/statementReconcile.ts` (`ReconcileResult`, `emptyResult`, chỗ `refundDiffs.push({ source: 'ledger' … })` ~:300, và một vòng tính tổng)
- Modify: `src/features/assets/statementReconcile.test.ts`
- Modify: `src/features/assets/statementReviewRows.ts` + `.test.ts`

**Interfaces:**
- Produces:
  ```ts
  refundDiffs: { source: 'ledger' | 'statement'; label: string; iso: string; amount: number; tx?: LedgerTx }[]  // tx CHỈ khi source='ledger'
  /** Σ signedAmount của dòng sổ inScope có occurred_on trong [range.start, range.end) — bất kể ghép hay không. Cùng rổ với cardMonthCharge: KHÔNG tính transfer trả nợ thẻ và note CARD_RECONCILE_NOTE. */
  ledgerTotal: number
  ```
  `reviewRows`: hàng `ledger` từ `refundDiffs` dùng `d.tx` khi có (⇒ `tx.id` thật ⇒ trang hiện nút Sửa, `dismissKey` ra `tx:`), không có thì như cũ (`id: ''`, khoá `rtx:`).

- [ ] **Step 1: Test thất bại (reconcile)**

Thêm vào `statementReconcile.test.ts`:

```ts
describe('reconcileBatch — du lieu them cho giao dien', () => {
  it('ledgerTotal = tong dong so trong ky (inScope), bat ke ghep hay khong', () => {
    const r = one('2026-06', [line('2026-06-02', 4950)], [
      tx('2026-06-02', 4950), tx('2026-06-10', 23000), tx('2026-06-11', 500, { is_refund: true }),
      tx('2026-06-05', 50000, { type: 'transfer', to_account_id: CARD }),
      tx('2026-06-06', 92158, { note: CARD_RECONCILE_NOTE }),
    ])
    expect(r.ledgerTotal).toBe(4950 + 23000 - 500)
  })
  it('ledgerTotal cua ky khong co dong so la 0; dong so ngoai ky khong tinh', () => {
    const r = reconcileBatch([period('2026-06', [])], [tx('2026-05-17', 300)], CARD)
    expect(r.get('2026-06-30')!.ledgerTotal).toBe(0)
  })
  it('hoan tien phia so khong khop mang theo tx goc', () => {
    const t = tx('2026-01-28', 6990, { is_refund: true, note: 'Uniqlo hoan' })
    const r = one('2026-01', [], [t])
    expect(r.refundDiffs[0].tx).toBe(t)
    expect(r.refundDiffs[0].source).toBe('ledger')
  })
  it('hoan tien phia the (調整額) khong co tx', () => {
    const r = one('2026-01', [line('2026-01-03', -7951, '調整額 · A', 'adjustment')], [])
    expect(r.refundDiffs[0].tx).toBeUndefined()
  })
})
```

- [ ] **Step 2: Đỏ** — `npx vitest run src/features/assets/statementReconcile.test.ts -t "du lieu them"`

- [ ] **Step 3: Cài**

`ReconcileResult`: thêm `tx?: LedgerTx` vào kiểu `refundDiffs`, thêm `ledgerTotal: number`; `emptyResult()` thêm `ledgerTotal: 0`. Ở `:300`: `r.refundDiffs.push({ source: 'ledger', label: …, iso: …, amount: a.amount, tx: a.t })`. Sau khi dựng `led` (đã lọc `inScope`), trước vòng 1:

```ts
  // Tổng phía sổ của từng kỳ — cột "Sổ" trên bảng tổng quan. Tính TRƯỚC khi ghép và trên
  // cùng rổ `inScope` để khớp `cardMonthCharge` của panel thẻ (hai chỗ phải nói một kiểu).
  for (const a of led) {
    const p = periodOf(a.t.occurred_on)
    if (p) out.get(p.range.closeISO)!.ledgerTotal += a.amount
  }
```

(`periodOf` phải được khai báo trước vòng này — dời lên nếu cần.)

- [ ] **Step 4: Test thất bại (reviewRows)**

Trong `statementReviewRows.test.ts` thêm:

```ts
  it('hoan tien so co tx goc thi hang ledger mang tx that (co id, co Sua)', () => {
    const r = emptyResult()
    const t = tx('2026-01-28', 6990, { is_refund: true, note: 'Uniqlo hoan' })
    r.refundDiffs.push({ source: 'ledger', label: 'Uniqlo hoan', iso: '2026-01-28', amount: -6990, tx: t })
    const row = reviewRows(r, '2026-01-31')[0]
    expect(row.kind).toBe('ledger')
    if (row.kind === 'ledger') { expect(row.tx).toBe(t); expect(row.refund).toBe(true); expect(row.amount).toBe(-6990) }
  })
```

Test cũ với `refundDiffs` không `tx` giữ kỳ vọng `tx.id === ''`.

- [ ] **Step 5: Cài reviewRows** — nhánh `d.source === 'ledger'`: `tx: d.tx ?? { id: '', … như cũ }`. Cập nhật chú thích: có `tx` thì có nút Sửa; không có chỉ khi dữ liệu cũ/không rõ.

- [ ] **Step 6: Xanh + tsc** — cả hai file test; `npx tsc -b` 0 (kiểm `statementOverview.test.ts`/fixture `emptyResult()` vẫn ổn vì dùng hàm).

- [ ] **Step 7: Commit**

```bash
git add src/features/assets/statementReconcile.ts src/features/assets/statementReconcile.test.ts src/features/assets/statementReviewRows.ts src/features/assets/statementReviewRows.test.ts
git commit -m "feat(the): reconcileBatch tra ledgerTotal moi ky; hoan tien phia so mang tx goc

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `pairRows.ts` — danh sách hàng của bảng ghép đôi

**Files:**
- Create: `src/features/assets/pairRows.ts`, `src/features/assets/pairRows.test.ts`

**Interfaces:**
- Consumes: `ReconcileResult`, `Pair` (`./statementReconcile`); `ReviewRow` (`./statementReviewRows`); `dayMonthLabel` KHÔNG (module thuần không format ngày — trang format).
- Produces:
  ```ts
  export type PairRow =
    | { kind: 'diff'; row: ReviewRow }                 // lệch, còn mở — có nút
    | { kind: 'explained'; pair: Pair }                // chữ nghiêng + nhãn, không nút
    | { kind: 'matched'; pair: Pair }                  // chỉ khi showAll
    | { kind: 'dismissed'; row: ReviewRow }            // cuối bảng, nút Xem lại
  export const CAUSE_LABEL: Record<ExplainedCause, string>   // 'date-edge' → 'lệch ngày', 'late-posting' → 'ghi trễ', 'refund-shifted' → 'hoàn cấn kỳ khác', 'merged-rows' → 'sổ ghi gộp', 'wallet-topup' → 'nạp ví', 'recalculated' → 'nhà thẻ tính lại', 'installment' → 'trả góp', 'investment' → 'mua quỹ'
  export function pairRows(result: ReconcileResult, open: ReviewRow[], hidden: ReviewRow[], showAll: boolean): PairRow[]
  ```
  Thứ tự: `open` (giữ thứ tự `reviewRows`) → `result.pairs` có `cause` (giữ thứ tự push) → nếu `showAll` thì `result.pairs` không `cause` → `hidden`.

- [ ] **Step 1: Test thất bại**

```ts
import { describe, expect, it } from 'vitest'
import { CAUSE_LABEL, pairRows } from './pairRows'
import { emptyResult, type Pair } from './statementReconcile'
import type { ReviewRow } from './statementReviewRows'

const led = (id: string): ReviewRow => ({ kind: 'ledger', key: `led-${id}`, amount: 1, refund: false,
  tx: { id, occurred_on: '2026-06-01', amount: 1, type: 'expense', is_refund: false, to_account_id: null, note: null } })
const pair = (cause?: Pair['cause']): Pair => ({ ledger: [], lines: [], cause, label: cause ?? 'khớp', amount: 1 })

describe('pairRows', () => {
  const r = emptyResult()
  r.pairs.push(pair(), pair('date-edge'), pair(), pair('wallet-topup'))
  it('mac dinh: lech -> giai thich duoc -> da bo qua; KHONG co cap khop', () => {
    const out = pairRows(r, [led('a')], [led('z')], false)
    expect(out.map((x) => x.kind)).toEqual(['diff', 'explained', 'explained', 'dismissed'])
  })
  it('showAll chen cap khop giua giai thich duoc va da bo qua, giu thu tu push', () => {
    const out = pairRows(r, [led('a')], [led('z')], true)
    expect(out.map((x) => x.kind)).toEqual(['diff', 'explained', 'explained', 'matched', 'matched', 'dismissed'])
  })
  it('moi cause deu co nhan tieng Viet', () => {
    for (const c of ['refund-shifted','wallet-topup','date-edge','late-posting','recalculated','merged-rows','installment','investment'] as const)
      expect(CAUSE_LABEL[c].length).toBeGreaterThan(0)
  })
  it('ket qua rong -> []', () => { expect(pairRows(emptyResult(), [], [], true)).toEqual([]) })
})
```

- [ ] **Step 2: Đỏ.** — [ ] **Step 3: Viết module** (thuần, chú thích lý do thứ tự: việc phải làm đứng đầu; giải thích được nằm trong bảng vì user duyệt vậy; cặp khớp mờ và chỉ hiện khi hỏi; đã bỏ qua cuối). — [ ] **Step 4: Xanh.**

- [ ] **Step 5: Commit** — `feat(the): pairRows - thu tu hang bang ghep doi (toan thuan)`

---

### Task 3: `overviewRows` thêm `ledgerTotal`, `explainedCount`, `gap`

**Files:** `statementOverview.ts` + `.test.ts`

**Interfaces:** `loaded` thêm `ledgerTotal: number`, `explainedCount: number` (= `result.explained.length`), `gap: number` (= `ledgerTotal - billTotal`, dương = sổ ghi thừa, cùng dấu `billGap` của panel).

- [ ] **Step 1: Test** — kỳ vừa nạp có `r.ledgerTotal = 214439`, `m.total = 158429`, `r.explained = [x, y]` ⇒ `loaded` `toMatchObject({ ledgerTotal: 214439, gap: 56010, explainedCount: 2 })`; kỳ saved-only `loaded === null` (không đổi). Cập nhật fixture `merged()` nếu cần.
- [ ] **Step 2–4: Đỏ → cài → xanh.** Sửa doc comment `loaded` (bỏ câu "Cột Sổ … dự kiến Đợt 4").
- [ ] **Step 5: Commit** — `feat(the): bang tong quan mang tong so, lech, so dong giai thich duoc`

---

### Task 4: Trang — bố cục cuối

**Files:** `src/features/assets/StatementReconcilePage.tsx`

**Consumes:** Task 1–3; `SegmentedControl` (`items: {value,label}[]`, `value`, `onChange`, `label` (a11y, bắt buộc), `size='sm'`, `stretch={false}`); `STATUS_FILL` từ `../../components/ui/statusColors`; `CAUSE_LABEL`, `pairRows`.

- [ ] **Step 1: Bảng tổng quan** — cột: `Kỳ · Bị rút (sm) · Hoá đơn · Sổ (sm) · Lệch · Tình trạng`. Cột Sổ: `loaded ? <Money amount={loaded.ledgerTotal} …/> : '—'`; cột Lệch: `loaded ? (gap === 0 ? <Money amount={0} tone="muted"/> : <Money amount={Math.abs(gap)} tone={reviewed ? 'neutral' : 'warn'} showSign={false}/>) : '—'` với tiền tố chữ nhỏ "+"/"−" KHÔNG dùng (Money tự lo dấu qua tone — xem design-system "Money — lưu ý về dấu"): hiện `Math.abs(gap)` và tooltip/`title` không cần; chiều lệch đọc ở khối kỳ. Bỏ cột "Khớp" a/b (chuyển xuống dòng tóm tắt của kỳ). Chip trạng thái giữ như Đợt 3.

- [ ] **Step 2: Khối kỳ đang chọn** — đầu khối:
  ```tsx
  <div className="flex flex-wrap items-center justify-between gap-2">
    <SectionTitle>Quẹt … · bị rút …</SectionTitle>
    <SegmentedControl label="Hiện dòng nào" size="sm" stretch={false}
      items={[{ value: 'lech', label: 'Chỉ dòng lệch' }, { value: 'tatca', label: <>Tất cả <Num tone="muted">{ketQua.pairs.length + hang.length}</Num> cặp</> }]}
      value={cheDo} onChange={setCheDo} />
  </div>
  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
    <div className={`h-full ${STATUS_FILL.good}`} style={{ width: `${pct}%` }} />
  </div>
  <p className="mt-1 flex flex-wrap justify-between gap-2 text-2xs text-fg-muted">
    <span>Hoá đơn <Money …={kyChon.total} tone="muted"/></span>
    <span>Khớp <Num tone="muted">{matched}</Num> · giải thích <Num tone="muted">{explained}</Num> / <Num tone="muted">{kyChon.lines.length}</Num> dòng</span>
    <span>Sổ <Money …={ketQua.ledgerTotal} tone="muted"/></span>
  </p>
  ```
  `pct = lines.length ? Math.round(100 * (matched + explainedLines) / lines.length) : 100`, trong đó `explainedLines = Σ pair.lines.length` của pairs có cause (dòng thẻ đã có lời giải). State `cheDo: 'lech' | 'tatca'` đặt ở cụm hook đầu. Không dùng `--fg-warn` cho fill (design-system §Bộ màu trạng thái: fill là `STATUS_FILL`).

- [ ] **Step 3: Bảng ghép đôi** — thay khối "Cần bạn xem" + Collapse "Giải thích được" + Collapse "Đã bỏ qua" bằng MỘT danh sách `pairRows(ketQua, hangMo, hangDaBo, cheDo === 'tatca')`:
  ```tsx
  <div className="mt-2 divide-y divide-border-subtle">
    {rows.map(r => (
      <div key={keyOf(r)} className={`grid gap-x-2 gap-y-1 py-1.5 text-sm sm:grid-cols-12 sm:items-center ${bgOf(r)}`}>
        <div className="min-w-0 sm:col-span-5">{beTrai(r)}</div>            {/* Sổ: ngày · ghi chú · <Money> — hoặc <i>không có dòng nào</i> */}
        <div className="hidden text-center text-fg-muted sm:col-span-1 sm:block">{muiTen(r)}</div>   {/* → ← ↔ */}
        <div className="min-w-0 sm:col-span-4">{bePhai(r)}</div>            {/* Thẻ: ngày · tên · <Money> (+ sourceLabel nếu line.source) */}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">{nut(r)}</div>
      </div>
    ))}
  </div>
  ```
  - `diff`: nền `bg-state-warn-bg`; bên thiếu in `<span className="italic text-fg-muted">không có dòng nào</span>`; nút Sửa (ledger có id) / Thêm vào sổ (statement) / Bỏ qua (mọi hàng, kể cả topups). Cụm `topups`: bên phải "Nạp ví chưa ghép được — n lần", bên trái trống.
  - `explained`: `italic text-fg-secondary`, hai bên từ `pair.ledger`/`pair.lines` (nhiều dòng thì nối bằng " + " tên và tổng), cột nút hiện `<StatusChip tone="info">{CAUSE_LABEL[pair.cause]}</StatusChip>`, không nút.
  - `matched`: `opacity` KHÔNG viết tay — dùng `text-fg-muted`; không nút.
  - `dismissed`: `text-fg-muted`, nút Xem lại.
  - Mobile (< sm): grid một cột ⇒ bên sổ trên, bên thẻ dưới, mũi tên ẩn, nút hàng cuối. Mọi tiền qua `<Money>`, `tone` theo dấu như cũ.
  - Khi không có hàng nào (kỳ khớp hết, không explained, không dismissed): `<p className="mt-2 text-sm text-fg-muted">Kỳ này khớp hết.</p>`; khi không còn `diff` nhưng có hàng khác: giữ câu "Kỳ này không còn gì cần xem." phía trên bảng.
  - Nút "Bỏ qua hết phần còn lại kỳ này" giữ, đặt dưới bảng khi `hangMo.length > 0`.
  - Bỏ `Collapse`, `moGiaiThich`, `moDaBoQua`, `DUOI_HOAN_TIEN` (thay bằng nhãn cause cho refund: hàng `diff` có `row.refund` thì thêm `<StatusChip tone="info">hoàn tiền</StatusChip>` trước nút), `nhanHang` (thay bằng `beTrai/bePhai`). Xoá import không dùng.

- [ ] **Step 4: Kiểm** — `npx tsc -b` 0; `npm test` xanh (trừ mcpBundle trong worktree). Grep không còn `Collapse`/`moGiaiThich` trong file.

- [ ] **Step 5: Commit** — `feat(the): trang doi chieu - bang ghep doi so <-> the, gat Chi dong lech | Tat ca, cot So/Lech`

---

### Task 5: Dọn `isAdjustment`

**Files:** `statementLine.ts`, `paypayStatement.ts` (+ test), `rakutenStatement.ts` (+ test), `statementReviewRows.ts` (+ test), `statementDismiss.test.ts`, `statementBatch.test.ts`, `statementOverview.test.ts`, `pairRows.test.ts`, `statementReconcile.test.ts` — mọi chỗ `isAdjustment`.

- [ ] **Step 1:** `grep -rn "isAdjustment" src tests` — liệt kê. Xoá trường khỏi `StatementLine`; sửa hai reader (bỏ `isAdjustment: …`); mọi fixture test bỏ trường; chỗ đọc `l.isAdjustment` (nếu còn) đổi sang `l.kind === 'adjustment'`.
- [ ] **Step 2:** `npx tsc -b` 0; `npm test` xanh; grep ra 0.
- [ ] **Step 3: Commit** — `refactor(the): bo truong tuong thich isAdjustment (Dot 1)`

---

### Task 6: Kiểm bằng mắt (controller)

- Demo từ worktree; fixture giả có: 2 dòng trùng, 1 nạp ví khớp D−1 (cần giao dịch sổ — dùng Thêm vào sổ tạo một món ngày trước rồi nạp lại), 1 ETC.
- Kiểm: bảng tổng quan có cột Sổ/Lệch; gạt "Tất cả n cặp" hiện cặp khớp mờ; hàng giải thích được có chip nhãn nằm trong bảng; Bỏ qua/Xem lại/Sửa/Thêm vẫn chạy; hàng hoàn tiền sổ có Sửa (tạo một giao dịch hoàn tiền trên thẻ demo); thanh tỉ lệ đổi khi ghép thêm; 375px Sáng 1,25×: mỗi cặp là ô hai dòng, không tràn; không lọt `{…}`.

---

## Tự soát kế hoạch

- **Phủ spec §8:** bảng tổng quan cột Sổ/Lệch/Tình trạng (T3, T4); segmented họ `SegmentedControl` (đúng "đổi cách xem"); thanh tỉ lệ hai token; dòng tóm tắt; bảng ghép đôi cột Sổ | ↔ | Thẻ | nút, hàng lệch nền warn, giải thích được nghiêng + nhãn viền (dùng `StatusChip tone="info"` thay `<span>` viền tự chế — đúng hơn design system), khớp mờ chỉ khi "Tất cả", đã bỏ qua cuối, mobile ô hai dòng qua grid đổi template (`sm:grid-cols-12`), không hai bộ markup (T4). Dọn `isAdjustment` (T5). "Khớp a/b" đổi cách nói theo ghi chú Đợt 1 (T4).
- **Khác spec:** nhãn cause bằng `StatusChip` (component có sẵn) thay `<span>` viền; mũi tên ẩn trên mobile.
- **Tên nhất quán:** `ledgerTotal`, `refundDiffs[].tx?`, `PairRow.kind ∈ diff|explained|matched|dismissed`, `pairRows(result, open, hidden, showAll)`, `CAUSE_LABEL`, `loaded.{ledgerTotal, explainedCount, gap}`, `cheDo: 'lech'|'tatca'`.
- Ngoài đợt: panel `reviewed` cũ (spec §7.3 cho phép), tên nút "Bỏ qua" hai nghĩa đã tự hết khi bỏ Collapse "Giải thích được, bỏ qua".
