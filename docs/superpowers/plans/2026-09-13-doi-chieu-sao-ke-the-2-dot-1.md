# Đối chiếu sao kê đợt 2 — Đợt 1: đọc Rakuten enavi, gộp nguồn, ghép cả lô

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App đọc được file sao kê Rakuten (enavi) của hai thẻ, cộng hai file cùng kỳ thành một hoá đơn cho tài khoản "Credit Rakuten", và phép ghép sổ ↔ thẻ chạy trên cả lô file một lượt để nhận ra khoản ghi trễ, nạp ví Rakuten Pay, trả góp lần 2, mua quỹ.

**Architecture:** Kiểu chung `StatementLine`/`ParsedStatement` tách ra `statementLine.ts`, mỗi dòng mang nhãn `kind` do **bộ đọc** gắn; phép ghép chỉ đọc nhãn. `statementBatch.ts` thay `statementNeighbours.ts`: khử trùng theo `closeISO|source`, gộp khác nguồn cùng kỳ. `reconcileBatch` thay `reconcileStatement`: một rổ cho cả lô, cặp ghép gán về kỳ của dòng thẻ. Màn trượt cũ `ImportStatementSheet` được nối lại bằng adapter mỏng để vẫn chạy cho tới Đợt 2.

**Tech Stack:** TypeScript, React 18, vitest, `parseCsvText` (`src/features/import/csvImport.ts`), `cardBillingRange` (`src/features/assets/cardMonthCharge.ts`).

**Spec:** [docs/superpowers/specs/2026-09-13-doi-chieu-sao-ke-the-2-design.md](../specs/2026-09-13-doi-chieu-sao-ke-the-2-design.md) — §4 và §6.

## Global Constraints

- Toán thuần nằm trong file `.ts` không JSX, có unit test cạnh file (`*.test.ts`). Component không tính số.
- Không `float` cho tiền: mọi `amount`/`billed`/`total` là số nguyên minor units (JPY = yên).
- Kiểm kiểu bằng `npx tsc -b` — **không** `tsc --noEmit` (xanh giả ở repo này).
- Chạy test: `npx vitest run <file>` cho một file, `npm test` cho cả bộ. `npm test` gồm `tests/designSystem.test.ts` canh UI, `tests/pushBundle.test.ts` và `tests/mcpBundle.test.ts` canh bundle — đợt này **không** đụng `src/mcp/` hay luật notification/holdings/funds, nên không cần `bundle:rules`/`bundle:mcp`.
- Mọi file đợt này là **LF**. Không chạy prettier (repo không có).
- GitNexus: trước khi sửa một hàm, thử `impact({target, direction:'upstream'})`; server hay không kết nối được ⇒ dùng `grep -rn "<tên hàm>" src tests` và ghi vào commit message là đã kiểm bằng grep. Trước commit thử `detect_changes()`; không có thì `git diff --stat` và đối chiếu với danh sách **Files** của task.
- Phiên khác có thể đang sửa `AGENTS.md`, `CLAUDE.md`, `brief_test.txt` — **chỉ `git add` đúng file của task**, không `git add -A`.
- Không đọc `~/Downloads` trong test. Fixture CSV viết nội dòng. `~/Downloads/credit/*.csv` chỉ dùng ở bước kiểm tay cuối (Task 6).
- Tiếng Việt có dấu trong chuỗi hiện cho người dùng và chú thích; tên test không dấu (theo file test hiện có).

---

## Bản đồ file

| File | Việc |
|---|---|
| Create `src/features/assets/statementLine.ts` | Kiểu chung `LineKind`, `StatementLine`, `ParsedStatement`; `sourceFromFileName`, `sourceLabelFor` |
| Create `src/features/assets/statementLine.test.ts` | Test hai hàm nguồn |
| Modify `src/features/assets/paypayStatement.ts` | Import kiểu từ `statementLine`, gắn `kind`, `billed`, `source`; nhận `fileName` |
| Modify `src/features/assets/paypayStatement.test.ts` | Cập nhật kỳ vọng có trường mới |
| Create `src/features/assets/rakutenStatement.ts` + `.test.ts` | Bộ đọc enavi |
| Modify `src/features/import/statementFormat.ts` + `.test.ts` | Đăng ký `rakuten` |
| Create `src/features/assets/parseStatement.ts` | Dispatcher thử PayPay rồi Rakuten |
| Create `src/features/assets/statementBatch.ts` + `.test.ts` | `MergedStatement`, `mergeStatements`, `billRowsFor` |
| Delete `src/features/assets/statementNeighbours.ts` + `.test.ts` | Thay bằng `statementBatch` |
| Modify `src/features/assets/statementReconcile.ts` + `.test.ts` | `reconcileBatch`, `Pair`, `unmatchedTopups`; xoá `reconcileStatement` |
| Modify `src/features/assets/ImportStatementSheet.tsx` | Adapter: `parseStatement`, `mergeStatements`, `reconcileBatch`; hiện `parts` và cụm nạp ví |

---

### Task 1: Kiểu chung `statementLine.ts` và PayPay gắn nhãn

**Files:**
- Create: `src/features/assets/statementLine.ts`
- Create: `src/features/assets/statementLine.test.ts`
- Modify: `src/features/assets/paypayStatement.ts:1-100`
- Modify: `src/features/assets/paypayStatement.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type LineKind = 'purchase' | 'adjustment' | 'topup' | 'recalculated' | 'installment-later' | 'investment'
  export interface StatementLine { iso: string; amount: number; billed: number; name: string; kind: LineKind; isAdjustment: boolean }
  export interface ParsedStatement { range: CardBillingRange; dueDateFromFile: string; total: number; lines: StatementLine[]; dueDateMismatch: boolean; source: string; sourceLabel: string }
  export function sourceFromFileName(fileName: string): string
  export function sourceLabelFor(source: string): string
  export function parsePaypayStatement(text: string, card: {statementDay: number|null; paymentDueDay: number|null}, fileName?: string): ParsedStatement | null
  ```
  `isAdjustment` là trường **tương thích** = `kind === 'adjustment'`, xoá ở Đợt 4.

- [ ] **Step 1: Viết test thất bại cho hai hàm nguồn**

`src/features/assets/statementLine.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { sourceFromFileName, sourceLabelFor } from './statementLine'

describe('sourceFromFileName', () => {
  it('lay 4 so trong ngoac cua ten file nha the', () => {
    expect(sourceFromFileName('enavi202607(3737) (1).csv')).toBe('3737')
    expect(sourceFromFileName('detail202607(4342).csv')).toBe('4342')
  })
  it('khong co ngoac thi dung ten file bo duoi', () => {
    expect(sourceFromFileName('sao-ke-thang-7.csv')).toBe('sao-ke-thang-7')
  })
  it('ten rong thi tra chuoi rong, khong vo', () => {
    expect(sourceFromFileName('')).toBe('')
  })
})

describe('sourceLabelFor', () => {
  it('ba duoi da biet co ten rieng', () => {
    expect(sourceLabelFor('3737')).toBe('Master 3737')
    expect(sourceLabelFor('2565')).toBe('Visa 2565')
    expect(sourceLabelFor('4342')).toBe('PayPay 4342')
  })
  it('duoi 4 so la thi ghi The ····NNNN', () => {
    expect(sourceLabelFor('9999')).toBe('Thẻ ····9999')
  })
  it('khong phai 4 so thi giu nguyen', () => {
    expect(sourceLabelFor('sao-ke-thang-7')).toBe('sao-ke-thang-7')
  })
})
```

- [ ] **Step 2: Chạy cho chắc là đỏ**

Run: `npx vitest run src/features/assets/statementLine.test.ts`
Expected: FAIL — `Cannot find module './statementLine'`

- [ ] **Step 3: Viết `statementLine.ts`**

```ts
// Kiểu chung cho MỌI bộ đọc sao kê (PayPay, Rakuten, …) và cho phép ghép.
//
// Bộ đọc GẮN NHÃN `kind`; phép ghép chỉ ĐỌC nhãn. Lý do: mỗi nhà thẻ viết một kiểu —
// PayPay ghi nạp ví là `チャージ` trơn, Rakuten là `楽天キャッシュ　チャージ`. Để luật
// nhận dạng theo tên nằm trong phép ghép là mỗi lần thêm nhà thẻ phải sửa phép ghép.
//
// Thuần, không phụ thuộc React.

import type { CardBillingRange } from './cardMonthCharge'

export type LineKind =
  /** Một lần quẹt thường. */
  | 'purchase'
  /** Dòng ảo dựng từ cột 調整額 của PayPay — hoàn tiền nhà thẻ cấn vào dòng khác. */
  | 'adjustment'
  /** Nạp ví (PayPay チャージ, 楽天キャッシュ チャージ). Sổ thường ghi món tiêu, không ghi lần nạp. */
  | 'topup'
  /** PayPay `（再計算）`: nhà thẻ gói lại đơn đã sửa, không có ngày. */
  | 'recalculated'
  /** Trả góp lần ≥ 2: sổ đã ghi cả món ở lần 1, dòng này không có gì để ghép. */
  | 'installment-later'
  /** 楽天証券 mua quỹ — không phải chi tiêu, người dùng theo dõi riêng. */
  | 'investment'

export interface StatementLine {
  /** ISO. Dòng không có ngày nhận closeISO của kỳ. */
  iso: string
  /**
   * Số tiền DÙNG ĐỂ GHÉP với sổ, minor units. Âm = hoàn tiền / điều chỉnh.
   * Với trả góp lần 1 đây là GIÁ ĐẦY ĐỦ (sổ ghi cả món một lần).
   */
  amount: number
  /** Phần VÀO HOÁ ĐƠN kỳ này. Bằng `amount` trừ khi trả góp (một nửa). `total = Σ billed`. */
  billed: number
  name: string
  kind: LineKind
  /** @deprecated tương thích Đợt 1 — bằng `kind === 'adjustment'`. Xoá ở Đợt 4. */
  isAdjustment: boolean
}

export interface ParsedStatement {
  range: CardBillingRange
  /** PayPay: 当月お支払日 trong file. Rakuten không có cột này ⇒ bằng `range.dueISO`. */
  dueDateFromFile: string
  /** Σ `billed`. Âm = kỳ được hoàn nhiều hơn tiêu. */
  total: number
  lines: StatementLine[]
  /** true ⇒ chặn lưu: kỳ suy ra không khớp ngày trả trong file (PayPay) hoặc tên file (Rakuten). */
  dueDateMismatch: boolean
  /**
   * Nguồn trong MỘT tài khoản: đuôi số thẻ lấy từ tên file ("3737"), không có thì tên file.
   * Hai bản cùng kỳ KHÁC nguồn thì gộp (hai thẻ Rakuten cùng một tài khoản sổ); CÙNG nguồn
   * thì bản nạp sau thắng (chọn nhầm một file hai lần).
   */
  source: string
  /** Nhãn hiện cho người dùng: "Master 3737". */
  sourceLabel: string
}

/** Đuôi 4 số trong ngoặc của tên file nhà thẻ; không có thì tên file bỏ đuôi mở rộng. */
export function sourceFromFileName(fileName: string): string {
  const m = fileName.match(/\((\d{4})\)/)
  if (m) return m[1]
  return fileName.replace(/\.[^.]+$/, '')
}

/** Bảng đuôi → tên chỉ là NHÃN hiển thị của người dùng này; không có trong DB. */
const KNOWN_LABELS: Record<string, string> = {
  '3737': 'Master 3737',
  '2565': 'Visa 2565',
  '4342': 'PayPay 4342',
}

export function sourceLabelFor(source: string): string {
  if (KNOWN_LABELS[source]) return KNOWN_LABELS[source]
  if (/^\d{4}$/.test(source)) return `Thẻ ····${source}`
  return source
}
```

- [ ] **Step 4: Chạy cho chắc là xanh**

Run: `npx vitest run src/features/assets/statementLine.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Chuyển PayPay sang kiểu chung**

Trong `src/features/assets/paypayStatement.ts`:

Thay khối `export interface StatementLine {...}` và `export interface ParsedStatement {...}` (dòng 20–36) bằng:

```ts
import {
  sourceFromFileName,
  sourceLabelFor,
  type LineKind,
  type ParsedStatement,
  type StatementLine,
} from './statementLine'

/** Re-export để chỗ import cũ (`from './paypayStatement'`) còn chạy tới Đợt 4. */
export type { ParsedStatement, StatementLine } from './statementLine'
```

Đổi import dòng 13 thành `import { cardBillingRange } from './cardMonthCharge'` (không còn dùng kiểu `CardBillingRange` ở đây).

Thêm hai hàm nhận dạng ngay dưới `toISO`:

```ts
const nfkc = (s: string) => s.normalize('NFKC').trim()
/** `チャージ` TRƠN mới là nạp ví PayPay — `モバイルＳｕｉｃａチャージ` là mua vé, không phải. */
const kindOf = (name: string): LineKind => {
  const n = nfkc(name)
  if (n === 'チャージ') return 'topup'
  if (n.endsWith('(再計算)')) return 'recalculated'
  return 'purchase'
}
```

Đổi chữ ký:

```ts
export function parsePaypayStatement(
  text: string,
  card: { statementDay: number | null; paymentDueDay: number | null },
  fileName = '',
): ParsedStatement | null {
```

Trong vòng `for (const r of data)` thay hai dòng `lines.push(...)`:

```ts
    if (billedRaw !== '') {
      const amount = num(billedRaw)
      lines.push({ iso, amount, billed: amount, name, kind: kindOf(name), isAdjustment: false })
    }
    const adj = num(r[COL.adjust] ?? '')
    if (adj !== 0)
      lines.push({
        iso,
        amount: adj,
        billed: adj,
        name: `調整額 · ${name}`,
        kind: 'adjustment',
        isAdjustment: true,
      })
```

Trong `return`: `total: lines.reduce((a, l) => a + l.billed, 0),` và thêm hai trường cuối:

```ts
    source: sourceFromFileName(fileName),
    sourceLabel: sourceLabelFor(sourceFromFileName(fileName)),
```

- [ ] **Step 6: Cập nhật test PayPay**

Trong `src/features/assets/paypayStatement.test.ts`, test `bo dong khong thu, va dung 調整額 thanh dong ao am` — `toEqual` trên dòng giờ phải đủ trường:

```ts
    expect(p.lines.filter((l) => !l.isAdjustment)).toEqual([
      { iso: '2026-01-03', amount: 8215, billed: 8215, name: '極楽茶屋', kind: 'purchase', isAdjustment: false },
    ])
```

Thêm vào cuối `describe('parsePaypayStatement')`:

```ts
  it('gan kind: チャージ tron la topup, （再計算） hau to la recalculated, con lai purchase', () => {
    const csv = [
      HEAD,
      row('2026/1/8', 'チャージ', '4000', '4000', '0', '2026/2/27'),
      row('2026/1/9', 'モバイルＳｕｉｃａチャージ', '1000', '1000', '0', '2026/2/27'),
      row('', 'ＴＥＭＵ（再計算）', '3476', '3476', '0', '2026/2/27'),
    ].join('\n')
    const p = parsePaypayStatement(csv, CARD)!
    expect(p.lines.map((l) => l.kind)).toEqual(['topup', 'purchase', 'recalculated'])
  })

  it('source lay tu ten file; khong truyen ten thi rong', () => {
    const csv = [HEAD, row('2026/1/6', '野方ホープ', '2160', '2160', '0', '2026/2/27')].join('\n')
    expect(parsePaypayStatement(csv, CARD, 'detail202602(4342).csv')!.source).toBe('4342')
    expect(parsePaypayStatement(csv, CARD, 'detail202602(4342).csv')!.sourceLabel).toBe('PayPay 4342')
    expect(parsePaypayStatement(csv, CARD)!.source).toBe('')
  })
```

- [ ] **Step 7: Chạy test PayPay + kiểm kiểu**

Run: `npx vitest run src/features/assets/paypayStatement.test.ts src/features/assets/statementLine.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: lỗi ở `statementNeighbours.test.ts` (fixture `st()` thiếu `billed`, `kind`, `source`, `sourceLabel`) và có thể `statementReconcile.test.ts` (`line()` thiếu trường). **Đây là lỗi mong đợi**, Task 3 và 4 xoá/viết lại hai file đó. Không sửa tạm. Ngoài hai file đó không được có lỗi khác.

- [ ] **Step 8: Commit**

```bash
git add src/features/assets/statementLine.ts src/features/assets/statementLine.test.ts src/features/assets/paypayStatement.ts src/features/assets/paypayStatement.test.ts
git commit -m "refactor(the): kieu chung statementLine, PayPay gan kind/billed/source

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Bộ đọc Rakuten enavi + đăng ký định dạng

**Files:**
- Create: `src/features/assets/rakutenStatement.ts`
- Create: `src/features/assets/rakutenStatement.test.ts`
- Modify: `src/features/import/statementFormat.ts:32-42` (mảng `FORMATS`)
- Modify: `src/features/import/statementFormat.test.ts`

**Interfaces:**
- Consumes: `ParsedStatement`, `StatementLine`, `sourceFromFileName`, `sourceLabelFor` (Task 1); `cardBillingRange`; `parseCsvText`.
- Produces: `export function parseRakutenStatement(text: string, card: {statementDay: number|null; paymentDueDay: number|null}, fileName?: string): ParsedStatement | null`

Bố cục file đã xác minh trên 28 file thật (spec §4.2): cột đổi tên theo tháng, số cột 10/11/12, BOM đầu file, dòng phụ ETC không ngày.

- [ ] **Step 1: Viết test thất bại**

`src/features/assets/rakutenStatement.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseRakutenStatement } from './rakutenStatement'

const CARD = { statementDay: 31, paymentDueDay: 27 }

/** Header 11 cột đúng như enavi202607: có 当月請求額. Có BOM như file thật. */
const HEAD_11 =
  '﻿"利用日","利用店名・商品名","利用者","支払方法","利用金額","手数料/利息","支払総額","7月支払金額","当月請求額","8月繰越残高","新規サイン"'
/** Header 10 cột như enavi202603: KHÔNG có 当月請求額 — cột hoá đơn dời vị trí. */
const HEAD_10 =
  '﻿"利用日","利用店名・商品名","利用者","支払方法","利用金額","手数料/利息","支払総額","3月支払金額","4月繰越残高","新規サイン"'
/** Header 12 cột như enavi202609(3737): thêm 支払月 và N月以降請求額. */
const HEAD_12 =
  '﻿"利用日","利用店名・商品名","利用者","支払方法","利用金額","手数料/利息","支払総額","支払月","9月支払金額","当月請求額","10月繰越残高","10月以降請求額"'

const q = (...cells: string[]) => cells.map((c) => `"${c}"`).join(',')
/** Dòng 11 cột: ngày, tên, người, cách trả, 利用金額, phí, tổng, N月支払金額, 当月請求額, carry, sign */
const r11 = (ngay: string, ten: string, how: string, use: string, pay: string, sign = '*') =>
  q(ngay, ten, '本人', how, use, '0', use, pay, pay, '0', sign)

describe('parseRakutenStatement', () => {
  it('nhan file enavi, total = tong cot N月支払金額, ky suy tu ten cot', () => {
    const csv = [
      HEAD_11,
      r11('2026/06/26', 'ﾍｱｷﾞﾛﾑ', '1回払い', '4950', '4950'),
      r11('2026/06/22', 'ﾄｷｷﾞﾂ', '1回払い', '40680', '40680'),
    ].join('\n')
    const p = parseRakutenStatement(csv, CARD, 'enavi202607(3737).csv')!
    expect(p.total).toBe(45630)
    expect(p.range.closeISO).toBe('2026-06-30')
    expect(p.range.dueISO).toBe('2026-07-27')
    expect(p.dueDateFromFile).toBe('2026-07-27')
    expect(p.dueDateMismatch).toBe(false)
    expect(p.source).toBe('3737')
    expect(p.sourceLabel).toBe('Master 3737')
  })

  it('tra cot theo TEN: header 10 cot va 12 cot van ra dung so', () => {
    const csv10 = [HEAD_10, q('2026/02/10', 'A', '本人', '1回払い', '1200', '0', '1200', '1200', '0', '*')].join('\n')
    const p10 = parseRakutenStatement(csv10, CARD, 'enavi202603(3737).csv')!
    expect(p10.total).toBe(1200)
    expect(p10.range.closeISO).toBe('2026-02-28')

    const csv12 = [
      HEAD_12,
      q('2026/08/05', 'B', '本人', '1回払い', '880', '0', '880', '9月', '880', '880', '0', '0'),
    ].join('\n')
    const p12 = parseRakutenStatement(csv12, CARD, 'enavi202609(3737).csv')!
    expect(p12.total).toBe(880)
    expect(p12.range.closeISO).toBe('2026-08-31')
  })

  it('nam suy tu ngay quet muon nhat: quet thang 12, hoa don thang 1 nam sau', () => {
    const head =
      '﻿"利用日","利用店名・商品名","利用者","支払方法","利用金額","手数料/利息","支払総額","1月支払金額","2月繰越残高","新規サイン"'
    const csv = [head, q('2025/12/20', 'C', '本人', '1回払い', '500', '0', '500', '500', '0', '*')].join('\n')
    const p = parseRakutenStatement(csv, CARD, 'enavi202601(3737).csv')!
    expect(p.range.closeISO).toBe('2025-12-31')
    expect(p.range.dueISO).toBe('2026-01-27')
    expect(p.dueDateMismatch).toBe(false)
  })

  it('bo dong phu khong ngay (chi tiet tuyen ETC) va dong khong co so hoa don', () => {
    const csv = [
      HEAD_11,
      r11('2026/05/17', 'ＥＴＣカード売上', '1回払い', '300', '300'),
      q('', 'ｴｷﾌｷﾀﾞﾘ   ﾁﾕｵｵｵﾞ', '', '', '', '', '', '', '', '', ''),
    ].join('\n')
    const p = parseRakutenStatement(csv, CARD, 'enavi202607(3737).csv')!
    expect(p.lines).toHaveLength(1)
    expect(p.lines[0]).toMatchObject({ iso: '2026-05-17', amount: 300, billed: 300, kind: 'purchase' })
  })

  it('tra gop: lan 1 ghep theo GIA DAY DU nhung chi mot nua vao hoa don; lan 2 la installment-later', () => {
    const csv = [
      HEAD_11,
      r11('2026/02/09', 'AMAZON.CO.JP', '分割2回払い(1回目)', '9469', '4735'),
      r11('2026/02/05', 'AMAZON.CO.JP', '分割2回払い(2回目)', '11763', '5881', ''),
    ].join('\n')
    const p = parseRakutenStatement(csv, CARD, 'enavi202607(3737).csv')!
    expect(p.lines[0]).toMatchObject({ amount: 9469, billed: 4735, kind: 'purchase' })
    expect(p.lines[1]).toMatchObject({ amount: 5881, billed: 5881, kind: 'installment-later' })
    expect(p.total).toBe(4735 + 5881)
  })

  it('gan kind topup cho 楽天キャッシュ チャージ va investment cho 楽天証券', () => {
    const csv = [
      HEAD_11,
      r11('2026/06/24', '楽天キャッシュ　チャージ', '1回払い', '1000', '1000'),
      r11('2026/06/01', '楽天証券投信積立', '1回払い', '68000', '68000'),
    ].join('\n')
    const p = parseRakutenStatement(csv, CARD, 'enavi202607(3737).csv')!
    expect(p.lines.map((l) => l.kind)).toEqual(['topup', 'investment'])
  })

  it('hoan tien la dong am thuong, khong phai adjustment', () => {
    const csv = [HEAD_11, r11('2026/06/10', 'UNIQLO', '1回払い', '-5060', '-5060')].join('\n')
    const p = parseRakutenStatement(csv, CARD, 'enavi202607(3737).csv')!
    expect(p.lines[0]).toMatchObject({ amount: -5060, kind: 'purchase', isAdjustment: false })
    expect(p.total).toBe(-5060)
  })

  it('ten file khac ky suy ra thi dueDateMismatch = true; ten file la thi khong kiem', () => {
    const csv = [HEAD_11, r11('2026/06/26', 'A', '1回払い', '100', '100')].join('\n')
    expect(parseRakutenStatement(csv, CARD, 'enavi202608(3737).csv')!.dueDateMismatch).toBe(true)
    expect(parseRakutenStatement(csv, CARD, 'sao-ke.csv')!.dueDateMismatch).toBe(false)
  })

  it('khong phai enavi, file rong, hay the chua khai ngay thi tra null', () => {
    const paypay = '"利用日/キャンセル日","利用店名・商品名","利用者","決済方法"\n"2026/1/1","X","本人*","PayPayクレジット"'
    expect(parseRakutenStatement(paypay, CARD, 'detail.csv')).toBeNull()
    expect(parseRakutenStatement('', CARD, 'enavi.csv')).toBeNull()
    const csv = [HEAD_11, r11('2026/06/26', 'A', '1回払い', '100', '100')].join('\n')
    expect(parseRakutenStatement(csv, { statementDay: null, paymentDueDay: 27 }, 'enavi202607(3737).csv')).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy cho chắc là đỏ**

Run: `npx vitest run src/features/assets/rakutenStatement.test.ts`
Expected: FAIL — `Cannot find module './rakutenStatement'`

- [ ] **Step 3: Viết `rakutenStatement.ts`**

```ts
// Đọc một file sao kê 楽天e-NAVI (enavi{YYYYMM}({đuôi thẻ}).csv) thành HOÁ ĐƠN một kỳ.
//
// Ba điều khác PayPay, đo trên 28 file thật (2025-08 → 2026-09):
//   · Cột đổi TÊN theo tháng ("7月支払金額" → "8月支払金額") và số cột là 10, 11 hoặc 12
//     tuỳ file ⇒ tra theo tên, KHÔNG theo vị trí.
//   · Có dòng phụ không ngày (chi tiết tuyến đường của ETC) ⇒ bỏ.
//   · Không có cột ngày trả ⇒ tháng hoá đơn lấy từ tên cột, năm suy từ ngày quẹt muộn
//     nhất; tên file chỉ dùng kiểm chéo.
//
// Số hoá đơn = Σ cột "N月支払金額". Kiểm bằng PDF Visa 2026-07: ご請求金額 880円 = Σ cột
// đó của enavi202607(2565). Với trả góp, cột này là NỬA của tháng — đúng số Rakuten đòi.
//
// Thuần, không phụ thuộc React.

import { parseCsvText } from '../import/csvImport'
import { cardBillingRange } from './cardMonthCharge'
import {
  sourceFromFileName,
  sourceLabelFor,
  type LineKind,
  type ParsedStatement,
  type StatementLine,
} from './statementLine'

const nfkc = (s: string) => String(s ?? '').replace(/^﻿/, '').normalize('NFKC').trim()
const num = (s: string) => Number(String(s ?? '').replace(/[,\s]/g, '')) || 0
const toISO = (s: string): string | null => {
  const m = String(s ?? '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

/** Ba cột bắt buộc để nhận là enavi (PayPay không có `新規サイン`). */
const REQUIRED = ['利用日', '利用店名・商品名', '新規サイン']
/** Cột hoá đơn: DUY NHẤT một cột khớp mẫu này trong header. */
const BILLED_COL = /^(\d{1,2})月支払金額$/
/** `分割2回払い(2回目)` → 2. Không khớp → 1 (trả một lần, hoặc `(1回目)`). */
const installmentNo = (how: string): number => {
  const m = nfkc(how).match(/\((\d+)回目\)/)
  return m ? Number(m[1]) : 1
}

const kindOf = (name: string, how: string): LineKind => {
  if (installmentNo(how) > 1) return 'installment-later'
  const n = nfkc(name).replace(/\s+/g, '')
  if (n.includes('楽天キャッシュチャージ')) return 'topup'
  if (n.includes('楽天証券')) return 'investment'
  return 'purchase'
}

/**
 * `null` khi: không phải enavi, không có dòng nào có số, hoặc thẻ chưa khai đủ ngày
 * chốt + ngày trả.
 */
export function parseRakutenStatement(
  text: string,
  card: { statementDay: number | null; paymentDueDay: number | null },
  fileName = '',
): ParsedStatement | null {
  const rows = parseCsvText(text)
  const header = rows[0]
  if (!header) return null
  const cols = header.map(nfkc)
  if (!REQUIRED.every((n) => cols.includes(n))) return null
  const iBilled = cols.findIndex((c) => BILLED_COL.test(c))
  if (iBilled < 0) return null
  const iDate = cols.indexOf('利用日')
  const iName = cols.indexOf('利用店名・商品名')
  const iHow = cols.indexOf('支払方法')
  const iUse = cols.indexOf('利用金額')
  const billMonth = Number(cols[iBilled].match(BILLED_COL)![1])

  // Dòng có ngày VÀ có số ở cột hoá đơn. Dòng phụ ETC không có cả hai.
  const data = rows
    .slice(1)
    .map((r) => ({ r, iso: toISO(r[iDate] ?? '') }))
    .filter((x): x is { r: string[]; iso: string } => x.iso != null && (x.r[iBilled] ?? '').trim() !== '')
  if (data.length === 0) return null

  // Năm: của ngày quẹt muộn nhất; nếu tháng hoá đơn NHỎ HƠN tháng đó thì đã sang năm mới
  // (quẹt tháng 12, hoá đơn tháng 1).
  const latest = data.map((x) => x.iso).sort().at(-1)!
  const [ly, lm] = latest.split('-').map(Number)
  const year = billMonth < lm ? ly + 1 : ly
  const range = cardBillingRange({
    monthKey: { year, month: billMonth },
    statementDay: card.statementDay,
    paymentDueDay: card.paymentDueDay,
  })
  if (!range) return null

  const lines: StatementLine[] = data.map(({ r, iso }) => {
    const name = (r[iName] ?? '').trim()
    const how = iHow >= 0 ? (r[iHow] ?? '') : ''
    const billed = num(r[iBilled] ?? '')
    const kind = kindOf(name, how)
    // Trả góp lần 1: sổ ghi CẢ món một lần ⇒ ghép theo 利用金額, hoá đơn chỉ nhận một nửa.
    const isFirstInstallment = kind === 'purchase' && /\(1回目\)/.test(nfkc(how))
    const amount = isFirstInstallment && iUse >= 0 ? num(r[iUse] ?? '') : billed
    return { iso, amount, billed, name, kind, isAdjustment: false }
  })

  // Kiểm chéo tên file: enavi{YYYY}{MM}. Lệch ⇒ chặn lưu, như PayPay lệch ngày trả.
  const fromName = fileName.match(/enavi(\d{4})(\d{2})/)
  const nameMismatch =
    fromName != null && (Number(fromName[1]) !== year || Number(fromName[2]) !== billMonth)

  const source = sourceFromFileName(fileName)
  return {
    range,
    dueDateFromFile: range.dueISO,
    total: lines.reduce((a, l) => a + l.billed, 0),
    lines,
    dueDateMismatch: nameMismatch,
    source,
    sourceLabel: sourceLabelFor(source),
  }
}
```

- [ ] **Step 4: Chạy cho chắc là xanh**

Run: `npx vitest run src/features/assets/rakutenStatement.test.ts`
Expected: PASS (9 test). Nếu ca header 12 cột đỏ vì `cardBillingRange` với tháng 9 ⇒ kiểm `closeISO` mong đợi `2026-08-31` (hoá đơn 9月 = quẹt tháng 8).

- [ ] **Step 5: Đăng ký `rakuten` vào `statementFormat.ts`**

Trong mảng `FORMATS` (sau phần tử `paypay`):

```ts
  {
    id: 'rakuten',
    label: 'Rakuten Card (e-NAVI)',
    // Khoản mua = số dương, giống PayPay.
    negativeIsExpense: false,
    dateOrder: 'ymd',
    needles: ['利用日', '利用店名・商品名', '新規サイン'],
  },
```

Lưu ý `norm` trong file này bỏ khoảng trắng + hạ thường, so sánh `includes` trên chuỗi nối `|` ⇒ `利用日` của Rakuten **cũng** nằm trong `利用日/キャンセル日` của PayPay, nhưng PayPay không có `新規サイン` nên không nhận nhầm. Chiều ngược lại: Rakuten không có `決済方法` nên không bị nhận là PayPay. Thứ tự trong mảng không quan trọng.

- [ ] **Step 6: Thêm test định dạng**

Vào `src/features/import/statementFormat.test.ts`, trong `describe`:

```ts
  const RAKUTEN_HEADER = [
    '﻿利用日', '利用店名・商品名', '利用者', '支払方法', '利用金額',
    '手数料/利息', '支払総額', '7月支払金額', '当月請求額', '8月繰越残高', '新規サイン',
  ]

  it('nhận ra sao kê Rakuten e-NAVI từ dòng tiêu đề, khoản mua là số dương', () => {
    const f = detectStatementFormat([RAKUTEN_HEADER])
    expect(f?.id).toBe('rakuten')
    expect(f?.negativeIsExpense).toBe(false)
  })

  it('Rakuten và PayPay không nhận nhầm nhau', () => {
    expect(detectStatementFormat([PAYPAY_HEADER])?.id).toBe('paypay')
    expect(detectStatementFormat([RAKUTEN_HEADER])?.id).not.toBe('paypay')
  })
```

- [ ] **Step 7: Chạy + kiểm kiểu**

Run: `npx vitest run src/features/import/statementFormat.test.ts src/features/assets/rakutenStatement.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: chỉ còn lỗi ở `statementNeighbours.test.ts` / `statementReconcile.test.ts` như Task 1 Step 7.

- [ ] **Step 8: Commit**

```bash
git add src/features/assets/rakutenStatement.ts src/features/assets/rakutenStatement.test.ts src/features/import/statementFormat.ts src/features/import/statementFormat.test.ts
git commit -m "feat(the): doc sao ke Rakuten enavi thanh hoa don mot ky

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `statementBatch.ts` — khử trùng theo nguồn, gộp hai thẻ cùng kỳ

**Files:**
- Create: `src/features/assets/statementBatch.ts`
- Create: `src/features/assets/statementBatch.test.ts`
- Create: `src/features/assets/parseStatement.ts`
- Delete: `src/features/assets/statementNeighbours.ts`, `src/features/assets/statementNeighbours.test.ts`

**Interfaces:**
- Consumes: `ParsedStatement`, `StatementLine` (Task 1); `NewCardBill` (`src/data/repo.ts`); `parsePaypayStatement`, `parseRakutenStatement`.
- Produces:
  ```ts
  export interface MergedStatement { range: CardBillingRange; total: number; parts: { source: string; sourceLabel: string; total: number }[]; lines: StatementLine[]; dueDateMismatch: boolean }
  export function mergeStatements(parsed: ParsedStatement[]): MergedStatement[]   // sắp theo closeISO tăng
  export function billRowsFor(accountId: string, merged: MergedStatement[]): NewCardBill[]
  export function parseStatement(text: string, card: {...}, fileName: string): ParsedStatement | null
  ```

- [ ] **Step 1: Kiểm ai đang import `statementNeighbours`**

Run: `grep -rn "statementNeighbours" src tests`
Expected: chỉ `ImportStatementSheet.tsx` và file test của chính nó. Sheet sửa ở Task 6; tới đó `tsc -b` còn đỏ ở sheet là **mong đợi**.

- [ ] **Step 2: Viết test thất bại**

`src/features/assets/statementBatch.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { billRowsFor, mergeStatements } from './statementBatch'
import type { ParsedStatement } from './statementLine'

const st = (closeISO: string, source: string, total = 0): ParsedStatement => ({
  range: { start: '', end: '', closeISO, dueISO: `${closeISO}-due` },
  dueDateFromFile: '',
  total,
  lines: [{ iso: closeISO, amount: total, billed: total, name: source, kind: 'purchase', isAdjustment: false }],
  dueDateMismatch: false,
  source,
  sourceLabel: `Thẻ ${source}`,
})

describe('mergeStatements', () => {
  it('hai NGUON khac nhau cung ky thi CONG lai, giu tung phan', () => {
    const out = mergeStatements([st('2026-06-30', '3737', 165429), st('2026-06-30', '2565', 880)])
    expect(out).toHaveLength(1)
    expect(out[0].total).toBe(166309)
    expect(out[0].parts).toEqual([
      { source: '2565', sourceLabel: 'Thẻ 2565', total: 880 },
      { source: '3737', sourceLabel: 'Thẻ 3737', total: 165429 },
    ])
    expect(out[0].lines.map((l) => l.name).sort()).toEqual(['2565', '3737'])
  })

  it('CUNG nguon cung ky (chon nham mot file hai lan) thi ban sau thang, khong cong doi', () => {
    const out = mergeStatements([st('2026-06-30', '3737', 100), st('2026-06-30', '3737', 200)])
    expect(out).toHaveLength(1)
    expect(out[0].total).toBe(200)
    expect(out[0].parts).toHaveLength(1)
  })

  it('sap theo closeISO tang dan', () => {
    const out = mergeStatements([st('2026-06-30', 'a'), st('2026-04-30', 'a'), st('2026-05-31', 'a')])
    expect(out.map((m) => m.range.closeISO)).toEqual(['2026-04-30', '2026-05-31', '2026-06-30'])
  })

  it('mot nguon lech ngay thi ca ky bi danh dau lech', () => {
    const ok = st('2026-06-30', 'a')
    const bad = { ...st('2026-06-30', 'b'), dueDateMismatch: true }
    expect(mergeStatements([ok, bad])[0].dueDateMismatch).toBe(true)
  })

  it('rong thi rong', () => {
    expect(mergeStatements([])).toEqual([])
  })
})

describe('billRowsFor', () => {
  it('moi ky mot dong, total la tong da gop', () => {
    const rows = billRowsFor('acc-1', mergeStatements([
      st('2026-06-30', '3737', 165429), st('2026-06-30', '2565', 880), st('2026-05-31', '3737', 50),
    ]))
    expect(rows).toEqual([
      { account_id: 'acc-1', close_date: '2026-05-31', due_date: '2026-05-31-due', total: 50 },
      { account_id: 'acc-1', close_date: '2026-06-30', due_date: '2026-06-30-due', total: 166309 },
    ])
  })
})
```

- [ ] **Step 3: Chạy cho chắc là đỏ**

Run: `npx vitest run src/features/assets/statementBatch.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 4: Viết `statementBatch.ts`**

```ts
// Gom các bản sao kê vừa nạp thành MỘT bản mỗi kỳ.
//
// Vì sao cần: tài khoản "Credit Rakuten" trong sổ gộp HAI thẻ (Master 3737 + Visa 2565),
// mỗi thẻ một file enavi mỗi kỳ. Khoá `card_bills` là (account_id, close_date) ⇒ một kỳ
// một dòng ⇒ hai file phải CỘNG lại. Bản cũ (`statementNeighbours.dedupeByPeriod`) khoá
// theo closeISO "bản sau thắng" — với Rakuten là mất một nửa hoá đơn, tuỳ thứ tự file.
//
// Hai luật, tách bằng `source` (đuôi số thẻ trong tên file):
//   · CÙNG nguồn, cùng kỳ ⇒ chọn nhầm một file hai lần ⇒ bản sau thắng. Postgres từ chối
//     cả lô upsert nếu một câu chạm cùng dòng hai lần; bản demo thì lặng lẽ ghi đè —
//     lỗi chỉ vỡ ở app thật, nên chặn ở đây.
//   · KHÁC nguồn, cùng kỳ ⇒ hai thẻ ⇒ cộng total, nối lines, giữ `parts` để hiện tách.
//
// Thuần, không phụ thuộc React.

import type { NewCardBill } from '../../data/repo'
import type { CardBillingRange } from './cardMonthCharge'
import type { ParsedStatement, StatementLine } from './statementLine'

export interface MergedStatement {
  range: CardBillingRange
  /** Σ total các nguồn. */
  total: number
  /** Từng nguồn, sắp theo `source`, để hiện "Master 165.429 · Visa 880". */
  parts: { source: string; sourceLabel: string; total: number }[]
  lines: StatementLine[]
  /** OR của các nguồn: một nguồn lệch là cả kỳ bị chặn lưu. */
  dueDateMismatch: boolean
}

export function mergeStatements(parsed: ParsedStatement[]): MergedStatement[] {
  const bySource = new Map<string, ParsedStatement>()
  for (const p of parsed) bySource.set(`${p.range.closeISO}|${p.source}`, p)

  const byClose = new Map<string, ParsedStatement[]>()
  for (const p of bySource.values()) {
    const list = byClose.get(p.range.closeISO) ?? []
    list.push(p)
    byClose.set(p.range.closeISO, list)
  }

  return [...byClose.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, ps]) => {
      const sorted = [...ps].sort((a, b) => a.source.localeCompare(b.source))
      return {
        range: sorted[0].range,
        total: sorted.reduce((s, p) => s + p.total, 0),
        parts: sorted.map((p) => ({ source: p.source, sourceLabel: p.sourceLabel, total: p.total })),
        lines: sorted.flatMap((p) => p.lines),
        dueDateMismatch: sorted.some((p) => p.dueDateMismatch),
      }
    })
}

/** Dòng `card_bills` cho một thẻ — mỗi kỳ ĐÚNG một dòng, total đã gộp các nguồn. */
export function billRowsFor(accountId: string, merged: MergedStatement[]): NewCardBill[] {
  return merged.map((m) => ({
    account_id: accountId,
    close_date: m.range.closeISO,
    due_date: m.range.dueISO,
    total: m.total,
  }))
}
```

- [ ] **Step 5: Viết `parseStatement.ts`**

```ts
// Một cửa cho màn nạp: thử từng bộ đọc, bộ nào nhận thì lấy.
//
// Mỗi bộ đọc tự kiểm dòng tiêu đề (PayPay đòi `決済方法`, Rakuten đòi `新規サイン`) nên
// không nhận nhầm nhau; thứ tự thử không quan trọng. Thêm nhà thẻ = thêm một dòng.

import { parsePaypayStatement } from './paypayStatement'
import { parseRakutenStatement } from './rakutenStatement'
import type { ParsedStatement } from './statementLine'

const READERS = [parsePaypayStatement, parseRakutenStatement] as const

export function parseStatement(
  text: string,
  card: { statementDay: number | null; paymentDueDay: number | null },
  fileName: string,
): ParsedStatement | null {
  for (const read of READERS) {
    const p = read(text, card, fileName)
    if (p) return p
  }
  return null
}
```

- [ ] **Step 6: Xoá `statementNeighbours`**

```bash
git rm -q src/features/assets/statementNeighbours.ts src/features/assets/statementNeighbours.test.ts
```

- [ ] **Step 7: Chạy test + kiểm kiểu**

Run: `npx vitest run src/features/assets/statementBatch.test.ts`
Expected: PASS (6 test).

Run: `npx tsc -b`
Expected: lỗi ở `ImportStatementSheet.tsx` (import `statementNeighbours` mất) và `statementReconcile.test.ts`. Không lỗi khác. Sheet sửa ở Task 6.

- [ ] **Step 8: Commit**

```bash
git add src/features/assets/statementBatch.ts src/features/assets/statementBatch.test.ts src/features/assets/parseStatement.ts
git commit -m "feat(the): gop hai the cung ky thanh mot hoa don, khu trung theo nguon

statementNeighbours -> statementBatch. Caller duy nhat (ImportStatementSheet) noi lai o commit sau.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `reconcileBatch` — ghép cả lô, giữ nguyên hành vi bốn luật PayPay

**Files:**
- Modify: `src/features/assets/statementReconcile.ts` (viết lại phần lớn; giữ `LedgerTx`, `signedAmount`, `inScope`, `combinations`, `dayGap`)
- Modify: `src/features/assets/statementReconcile.test.ts` (viết lại theo API mới)

**Interfaces:**
- Consumes: `MergedStatement` (Task 3), `StatementLine`/`LineKind` (Task 1), `CARD_RECONCILE_NOTE` (`./reconcile`).
- Produces:
  ```ts
  export type ExplainedCause = 'refund-shifted' | 'wallet-topup' | 'date-edge' | 'late-posting' | 'recalculated' | 'merged-rows' | 'installment' | 'investment'
  export interface Pair { ledger: LedgerTx[]; lines: StatementLine[]; cause?: ExplainedCause; label: string; amount: number }
  export interface ReconcileResult {
    matchedCount: number
    extraInLedger: { tx: LedgerTx; amount: number }[]
    missingFromLedger: StatementLine[]
    refundDiffs: { source: 'ledger' | 'statement'; label: string; iso: string; amount: number }[]
    explained: { cause: ExplainedCause; label: string; amount: number }[]
    unmatchedTopups: { count: number; total: number; lines: StatementLine[] }
    pairs: Pair[]
  }
  export function reconcileBatch(statements: MergedStatement[], ledger: LedgerTx[], cardId: string): Map<string, ReconcileResult>   // khoá = closeISO
  export function emptyResult(): ReconcileResult
  ```
  Task này cài **đủ** cấu trúc và các luật cũ (`refund-shifted`, `date-edge`, `recalculated`, `merged-rows`) + `late-posting`. Ba luật Rakuten (`wallet-topup` theo tổng D−1, `installment`, `investment`) và `unmatchedTopups` cài ở Task 5 — Task 4 để `unmatchedTopups` luôn rỗng và dòng `topup` chưa ghép **tạm** rơi vào `missingFromLedger`.

**Một thay đổi hành vi có chủ ý so với đợt 1, ghi rõ:** luật `wallet-topup` cũ coi MỌI dòng `チャージ` là giải thích được, không cần sổ. Từ Task 5, nạp ví chỉ giải thích được khi tìm thấy nhóm món trong sổ; không thấy thì vào cụm `unmatchedTopups` (cần bấm Bỏ qua ở Đợt 3). Test cũ `nhan ra nap vi PayPay` đổi kỳ vọng theo đó ở Task 5. Lý do: PayPay của người dùng có tài khoản "Paypay Wallet", nạp ví là một transfer trong sổ và ghép 1-1 được ở vòng 1; một lần nạp không có dấu vết gì trong sổ là đáng nhìn, không đáng giấu.

- [ ] **Step 1: Kiểm caller của `reconcileStatement`**

Run: `grep -rn "reconcileStatement\|ReconcileResult\|ExplainedCause" src tests --include=*.ts --include=*.tsx | grep -v "statementReconcile\."`
Expected: chỉ `ImportStatementSheet.tsx`. Sheet sửa ở Task 6.

- [ ] **Step 2: Viết lại test theo API mới — phần luật cũ**

Ghi đè toàn bộ `src/features/assets/statementReconcile.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { reconcileBatch, type LedgerTx, type ReconcileResult } from './statementReconcile'
import type { MergedStatement } from './statementBatch'
import type { LineKind, StatementLine } from './statementLine'
import { CARD_RECONCILE_NOTE } from './reconcile'

const CARD = 'card-1'
const line = (iso: string, amount: number, name = 'X', kind: LineKind = 'purchase'): StatementLine => ({
  iso, amount, billed: amount, name, kind, isAdjustment: kind === 'adjustment',
})
const tx = (iso: string, amount: number, p: Partial<LedgerTx> = {}): LedgerTx => ({
  id: `t-${iso}-${amount}-${Math.random().toString(36).slice(2, 6)}`,
  occurred_on: iso,
  amount,
  type: 'expense',
  is_refund: false,
  to_account_id: null,
  note: null,
  ...p,
})
/** Kỳ quẹt cả tháng: start = mùng 1, closeISO = cuối tháng, end = mùng 1 tháng sau. */
const period = (yyyyMM: string, lines: StatementLine[]): MergedStatement => {
  const [y, m] = yyyyMM.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return {
    range: { start: `${yyyyMM}-01`, end: next, closeISO: `${yyyyMM}-${last}`, dueISO: `${next.slice(0, 7)}-27` },
    total: lines.reduce((s, l) => s + l.billed, 0),
    parts: [],
    lines,
    dueDateMismatch: false,
  }
}
/** Một kỳ, một kết quả — cách gọi ngắn cho các ca không cần lô. */
const one = (yyyyMM: string, lines: StatementLine[], ledger: LedgerTx[]): ReconcileResult => {
  const p = period(yyyyMM, lines)
  return reconcileBatch([p], ledger, CARD).get(p.range.closeISO)!
}
const causes = (r: ReconcileResult) => r.explained.map((e) => e.cause)

describe('reconcileBatch — ghep 1-1', () => {
  it('ghep duoc thi khong ai vao danh sach lech, va co mot cap khong cause', () => {
    const r = one('2026-06', [line('2026-06-02', 4950)], [tx('2026-06-02', 4950)])
    expect(r.matchedCount).toBe(1)
    expect(r.extraInLedger).toHaveLength(0)
    expect(r.missingFromLedger).toHaveLength(0)
    expect(r.pairs).toHaveLength(1)
    expect(r.pairs[0].cause).toBeUndefined()
  })

  it('lech ngay trong 4 ngay van ghep', () => {
    expect(one('2026-06', [line('2026-06-07', 2200)], [tx('2026-06-06', 2200)]).matchedCount).toBe(1)
  })

  it('moi dong chi ghep mot lan — so co 4 lan 4950, the co 3', () => {
    const r = one(
      '2026-06',
      [line('2026-06-02', 4950), line('2026-06-08', 4950), line('2026-06-16', 4950)],
      [tx('2026-06-02', 4950), tx('2026-06-08', 4950), tx('2026-06-14', 4950), tx('2026-06-16', 4950)],
    )
    expect(r.matchedCount).toBe(3)
    expect(r.extraInLedger).toHaveLength(1)
  })

  it('vong 2: cung ky, cach xa hon 4 ngay van ghep', () => {
    expect(one('2026-06', [line('2026-06-25', 700)], [tx('2026-06-03', 700)]).matchedCount).toBe(1)
  })

  it('hoan tien trong so mang dau am (is_refund, KHONG phai income)', () => {
    const r = one('2026-03', [line('2026-03-06', -539, '調整額 · ChargeSPOT', 'adjustment')], [tx('2026-03-27', 539, { is_refund: true })])
    expect(r.matchedCount).toBe(1)
  })

  it('income tren the mang dau am, khong ghep nham voi mot khoan chi that', () => {
    const r = one('2026-06', [line('2026-06-05', 5000, 'Mot khoan chi that')], [tx('2026-06-05', 5000, { type: 'income' })])
    expect(r.matchedCount).toBe(0)
    expect(r.missingFromLedger).toHaveLength(1)
    expect(r.extraInLedger).toHaveLength(1)
  })

  it('loai tra no the va khoan Dieu chinh so no khoi ro so', () => {
    const r = one('2026-06', [], [
      tx('2026-06-05', 50000, { type: 'transfer', to_account_id: CARD }),
      tx('2026-06-06', 92158, { note: CARD_RECONCILE_NOTE }),
    ])
    expect(r.extraInLedger).toHaveLength(0)
  })

  it('dong so nam NGOAI moi ky da nap va khong ghep duoc thi bo qua, khong bao', () => {
    const r = reconcileBatch([period('2026-06', [])], [tx('2026-03-03', 999)], CARD)
    expect(r.get('2026-06-30')!.extraInLedger).toHaveLength(0)
  })
})

describe('reconcileBatch — cap ghep khac ky', () => {
  it('date-edge: so 30/06, the 03/07 (ky 7) — ky 6 khong con so thua, ky 7 co hang date-edge', () => {
    const r = reconcileBatch(
      [period('2026-06', []), period('2026-07', [line('2026-07-03', 5060, 'ユニクロオンラインストア')])],
      [tx('2026-06-30', 5060)],
      CARD,
    )
    expect(r.get('2026-06-30')!.extraInLedger).toHaveLength(0)
    expect(causes(r.get('2026-07-31')!)).toEqual(['date-edge'])
    expect(r.get('2026-07-31')!.missingFromLedger).toHaveLength(0)
  })

  it('date-edge phai gan ranh gioi, khong khop bua theo so tien qua vong 1 (>4 ngay, khac ky)', () => {
    const r = reconcileBatch(
      [period('2026-06', []), period('2026-07', [line('2026-07-28', 5060, 'ユニクロ')])],
      [tx('2026-06-01', 5060)],
      CARD,
    )
    expect(r.get('2026-06-30')!.extraInLedger).toHaveLength(1)
    expect(r.get('2026-07-31')!.missingFromLedger).toHaveLength(1)
  })

  it('late-posting: ETC quet 17/05 nam trong hoa don ky 6 (quet thang 6), so co dong 17/05', () => {
    const r = reconcileBatch(
      [period('2026-05', []), period('2026-06', [line('2026-05-17', 300, 'ＥＴＣカード売上')])],
      [tx('2026-05-17', 300, { note: 'ETC 利用料' })],
      CARD,
    )
    expect(r.get('2026-05-31')!.extraInLedger).toHaveLength(0)
    expect(causes(r.get('2026-06-30')!)).toEqual(['late-posting'])
  })

  it('late-posting khi so nam ngoai moi ky da nap van ghep duoc', () => {
    const r = reconcileBatch(
      [period('2026-06', [line('2026-05-17', 300, 'ＥＴＣカード売上')])],
      [tx('2026-05-17', 300)],
      CARD,
    )
    expect(causes(r.get('2026-06-30')!)).toEqual(['late-posting'])
  })

  it('mot dong so khong bao gio ghep hai dong the o hai ky', () => {
    const r = reconcileBatch(
      [period('2026-06', [line('2026-06-30', 1000)]), period('2026-07', [line('2026-07-01', 1000)])],
      [tx('2026-06-30', 1000)],
      CARD,
    )
    const matched = r.get('2026-06-30')!.matchedCount + r.get('2026-07-31')!.matchedCount
    expect(matched).toBe(1)
    expect(r.get('2026-06-30')!.missingFromLedger.length + r.get('2026-07-31')!.missingFromLedger.length).toBe(1)
  })
})

describe('reconcileBatch — luat giai thich duoc (PayPay)', () => {
  it('refund-shifted: hoan tien so ky 2, nha the can 調整額 ky 1', () => {
    const r = reconcileBatch(
      [period('2026-01', [line('2026-01-03', -961, '調整額 · 極楽茶屋', 'adjustment')]), period('2026-02', [])],
      [tx('2026-02-03', 961, { is_refund: true })],
      CARD,
    )
    expect(r.get('2026-02-28')!.extraInLedger).toHaveLength(0)
    expect(r.get('2026-02-28')!.refundDiffs).toHaveLength(0)
    expect(causes(r.get('2026-01-31')!)).toEqual(['refund-shifted'])
  })

  it('recalculated: dong （再計算） khong co trong so', () => {
    const r = one('2026-05', [line('2026-05-31', 3476, 'ＴＥＭＵ（再計算）', 'recalculated')], [])
    expect(r.missingFromLedger).toHaveLength(0)
    expect(causes(r)).toEqual(['recalculated'])
  })

  it('dong 調整額 khong khop di vao nhom hoan tien rieng, khong vao "can xem"', () => {
    const r = one('2026-01', [line('2026-01-03', -7951, '調整額 · 極楽茶屋', 'adjustment')], [])
    expect(r.missingFromLedger).toHaveLength(0)
    expect(r.refundDiffs).toEqual([{ source: 'statement', label: '調整額 · 極楽茶屋', iso: '2026-01-03', amount: -7951 }])
  })

  it('dong hoan tien trong so khong khop di vao nhom hoan tien rieng', () => {
    const r = one('2026-01', [], [tx('2026-01-28', 6990, { is_refund: true, note: 'Uniqlo hoan' })])
    expect(r.extraInLedger).toHaveLength(0)
    expect(r.refundDiffs[0]).toMatchObject({ source: 'ledger', amount: -6990 })
  })

  it('merged-rows: so ghi gop mot dong, the tach hai dong cung ngay', () => {
    const r = one('2026-06', [line('2026-06-18', 5148, 'ＴＥＭＵ'), line('2026-06-18', 732, 'ＴＥＭＵ')], [tx('2026-06-18', 5880)])
    expect(r.extraInLedger).toHaveLength(0)
    expect(r.missingFromLedger).toHaveLength(0)
    expect(causes(r)).toContain('merged-rows')
    const p = r.pairs.find((p) => p.cause === 'merged-rows')!
    expect(p.lines).toHaveLength(2)
    expect(p.ledger).toHaveLength(1)
  })

  it('tong khop nhung KHAC NGAY thi KHONG duoc gop', () => {
    const r = one('2026-06', [line('2026-06-18', 5148, 'ＴＥＭＵ'), line('2026-06-20', 732, 'ＴＥＭＵ')], [tx('2026-06-18', 5880)])
    expect(causes(r)).not.toContain('merged-rows')
    expect(r.extraInLedger).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Chạy cho chắc là đỏ**

Run: `npx vitest run src/features/assets/statementReconcile.test.ts`
Expected: FAIL — `reconcileBatch is not a function` / lỗi kiểu.

- [ ] **Step 4: Viết lại `statementReconcile.ts`**

Ghi đè toàn bộ file:

```ts
// Ghép từng dòng sao kê với từng giao dịch trong sổ, rồi chia phần lệch làm hai: thứ
// NGƯỜI DÙNG cần xem, và thứ giải thích được bằng khác biệt cấu trúc.
//
// Vì sao phải chia: đo trên 8 kỳ PayPay, ~200 dòng, chỉ 4 dòng là ghi sai thật. Đổ hết
// phần lệch vào một danh sách thì 4 dòng đáng sửa nằm lẫn giữa hàng chục dòng vô hại.
//
// Vì sao ghép CẢ LÔ một lượt (đợt 2): Rakuten ghi phí ETC trễ tới 5 tuần — dòng 17/05 nằm
// trong hoá đơn kỳ quẹt tháng 6. Ghép từng kỳ với rổ sổ của đúng kỳ đó thì dòng ấy báo
// "thẻ có, sổ không" dù sổ có. Một rổ cho cả lô; cặp ghép được GÁN VỀ KỲ CỦA DÒNG THẺ.
//
// Thuần, không phụ thuộc React, để unit-test được.

import { CARD_RECONCILE_NOTE } from './reconcile'
import type { MergedStatement } from './statementBatch'
import type { StatementLine } from './statementLine'

export interface LedgerTx {
  id: string
  occurred_on: string
  amount: number
  type: 'expense' | 'income' | 'transfer'
  is_refund: boolean
  to_account_id: string | null
  note: string | null
}

export type ExplainedCause =
  | 'refund-shifted'
  | 'wallet-topup'
  | 'date-edge'
  | 'late-posting'
  | 'recalculated'
  | 'merged-rows'
  | 'installment'
  | 'investment'

/**
 * Một hàng của bảng ghép đôi. n:m vì `merged-rows` là 1 sổ : n thẻ, `wallet-topup` là
 * 1 thẻ : n sổ. `cause` rỗng = khớp thường.
 */
export interface Pair {
  ledger: LedgerTx[]
  lines: StatementLine[]
  cause?: ExplainedCause
  label: string
  /** Số tiền đại diện của hàng (phía thẻ nếu có, không thì phía sổ). */
  amount: number
}

export interface ReconcileResult {
  /** Số dòng thẻ của kỳ ghép được 1-1 (kể cả date-edge / late-posting). */
  matchedCount: number
  extraInLedger: { tx: LedgerTx; amount: number }[]
  missingFromLedger: StatementLine[]
  /**
   * Chênh lệch CHỈ liên quan tới hoàn tiền: dòng `adjustment` của nhà thẻ và dòng hoàn
   * trong sổ không khớp 1-1 được. Nhóm RIÊNG chứ không nhét vào `explained`: nhà thẻ GỘP
   * nhiều khoản hoàn vào một dòng điều chỉnh nên hai bên hiếm khi khớp từng dòng — nhưng
   * một khoản hoàn người dùng QUÊN ghi cũng rơi vào đây, giấu đi là phản lại lý do tồn tại
   * của cả màn này.
   */
  refundDiffs: { source: 'ledger' | 'statement'; label: string; iso: string; amount: number }[]
  /** Dẫn xuất từ `pairs` có `cause`. */
  explained: { cause: ExplainedCause; label: string; amount: number }[]
  /**
   * Nạp ví không tìm được nhóm món sổ tương ứng. Gom một cụm, không rải lẻ: ví có số dư nên
   * đây thường KHÔNG phải lỗi sổ, nhưng giấu hẳn thì một tuần quên ghi cũng biến mất.
   * (Cài ở Task 5; Task 4 luôn rỗng.)
   */
  unmatchedTopups: { count: number; total: number; lines: StatementLine[] }
  pairs: Pair[]
}

export function emptyResult(): ReconcileResult {
  return {
    matchedCount: 0,
    extraInLedger: [],
    missingFromLedger: [],
    refundDiffs: [],
    explained: [],
    unmatchedTopups: { count: 0, total: 0, lines: [] },
    pairs: [],
  }
}

const MATCH_WINDOW_DAYS = 4
/**
 * `date-edge` = CÙNG một lần mua, hai bên ghi hai ngày, rơi hai kỳ. Cách ranh giới kỳ xa
 * hơn thế thì là nhà thẻ ghi TRỄ (`late-posting`) — ETC là 5 tuần. Cả hai đều đã ghép 1-1
 * nên không "khớp bừa"; nhãn chỉ để người đọc hiểu vì sao hàng nằm ở kỳ này.
 */
const EDGE_WINDOW_DAYS = 7
const DAY = 86_400_000
const dayGap = (a: string, b: string) => Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / DAY))
const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * Dấu của một dòng sổ theo cách repo ghi tiền: hoàn tiền là `expense` + `is_refund`, KHÔNG
 * phải `income` (xem `aggregate.ts: expenseSign`). `income` trên thẻ cũng mang dấu âm —
 * khớp `txBalanceDelta` (`lib/cardBalance.ts`): tiền vào thẻ CỘNG vào số dư, cùng chiều
 * hoàn tiền, ngược chiều một khoản chi thật.
 */
const signedAmount = (t: LedgerTx) => (t.type === 'income' || t.is_refund ? -t.amount : t.amount)

/** Rổ sổ để đối chiếu, loại đúng những gì `cardMonthCharge` loại — hai chỗ phải nói cùng một kiểu. */
const inScope = (t: LedgerTx, cardId: string) =>
  !(t.type === 'transfer' && t.to_account_id === cardId) && t.note !== CARD_RECONCILE_NOTE

/**
 * Dòng thẻ KHÔNG đi qua vòng ghép 1-1: trả góp lần sau và mua quỹ không có gì để ghép;
 * nạp ví đi qua luật riêng (Task 5) — để vòng 1 lấy nó trước là luật riêng không bao giờ
 * tới lượt, và một lần nạp 1.485 sẽ ăn nhầm một khoản chi 1.485 cùng ngày.
 */
const UNMATCHABLE = new Set<StatementLine['kind']>(['installment-later', 'investment', 'topup'])

/** Mọi tổ hợp kích cỡ `size` lấy từ `arr`, không lặp phần tử, không quan tâm thứ tự. */
function* combinations<T>(arr: T[], size: number): Generator<T[]> {
  if (size === 0) {
    yield []
    return
  }
  for (let i = 0; i <= arr.length - size; i++) {
    for (const rest of combinations(arr.slice(i + 1), size - 1)) yield [arr[i], ...rest]
  }
}

/** Tổ hợp `minSize..maxSize` phần tử của `pool` có tổng đúng `target`, không thì null. */
function findSubset<T>(target: number, pool: T[], amountOf: (x: T) => number, minSize: number, maxSize: number): T[] | null {
  for (let size = minSize; size <= Math.min(maxSize, pool.length); size++) {
    for (const combo of combinations(pool, size)) {
      if (combo.reduce((s, c) => s + amountOf(c), 0) === target) return combo
    }
  }
  return null
}

interface S {
  l: StatementLine
  closeISO: string
  range: MergedStatement['range']
  used: boolean
}
interface L {
  t: LedgerTx
  amount: number
  used: boolean
}

/**
 * ĐIỀU KIỆN GỌI: `ledger` PHẢI đã lọc về đúng một thẻ (`cardId`) — `LedgerTx` không mang
 * `account_id` nên `inScope` không tự lọc được. Cửa sổ ngày của `ledger` phải phủ từ
 * min(range.start, ngày dòng thẻ sớm nhất) tới hết kỳ muộn nhất.
 * `statements` phải đã qua `mergeStatements` (mỗi closeISO một bản, sắp tăng).
 */
export function reconcileBatch(
  statements: MergedStatement[],
  ledger: LedgerTx[],
  cardId: string,
): Map<string, ReconcileResult> {
  const out = new Map<string, ReconcileResult>()
  for (const m of statements) out.set(m.range.closeISO, emptyResult())

  const stmt: S[] = statements.flatMap((m) =>
    m.lines.map((l) => ({ l, closeISO: m.range.closeISO, range: m.range, used: false })),
  )
  const led: L[] = ledger
    .filter((t) => inScope(t, cardId))
    .map((t) => ({ t, amount: signedAmount(t), used: false }))

  /** Kỳ chứa một ngày sổ, theo [start, end). Ngoài mọi kỳ đã nạp ⇒ undefined. */
  const periodOf = (iso: string) => statements.find((m) => iso >= m.range.start && iso < m.range.end)

  const push = (closeISO: string, pair: Pair) => {
    const r = out.get(closeISO)!
    r.pairs.push(pair)
    if (pair.cause) r.explained.push({ cause: pair.cause, label: pair.label, amount: pair.amount })
  }

  /** Cặp 1-1 vừa ghép: gán nhãn theo vị trí ngày sổ so với kỳ của dòng thẻ. */
  const pairOneToOne = (a: L, s: S) => {
    a.used = true
    s.used = true
    const iso = a.t.occurred_on
    const inside = iso >= s.range.start && iso < s.range.end
    let cause: ExplainedCause | undefined
    if (!inside) {
      const gap = iso < s.range.start ? dayGap(s.range.start, iso) : dayGap(iso, s.range.closeISO)
      cause = gap <= EDGE_WINDOW_DAYS ? 'date-edge' : 'late-posting'
    }
    const label =
      cause === 'date-edge'
        ? `${s.l.name} — thẻ ghi ${dayLabel(s.l.iso)}, sổ ${dayLabel(iso)}`
        : cause === 'late-posting'
          ? `${s.l.name} — nhà thẻ ghi trễ, sổ ${dayLabel(iso)}`
          : s.l.name
    push(s.closeISO, { ledger: [a.t], lines: [s.l], cause, label, amount: s.l.amount })
    out.get(s.closeISO)!.matchedCount++
  }

  // Vòng 1: theo số tiền, ưu tiên lệch ngày ít nhất trong cửa sổ, BẤT KỂ kỳ.
  for (const a of led) {
    let best: { s: S; gap: number } | null = null
    for (const s of stmt) {
      if (s.used || UNMATCHABLE.has(s.l.kind) || s.l.amount !== a.amount) continue
      const gap = dayGap(a.t.occurred_on, s.l.iso)
      if (gap > MATCH_WINDOW_DAYS) continue
      if (!best || gap < best.gap) best = { s, gap }
    }
    if (best) pairOneToOne(a, best.s)
  }
  // Vòng 2: bỏ giới hạn ngày nhưng đòi CÙNG KỲ. Sao kê hay dời ngày vài hôm.
  for (const a of led) {
    if (a.used) continue
    const p = periodOf(a.t.occurred_on)
    if (!p) continue
    const s = stmt.find(
      (s) => !s.used && !UNMATCHABLE.has(s.l.kind) && s.closeISO === p.range.closeISO && s.l.amount === a.amount,
    )
    if (s) pairOneToOne(a, s)
  }

  // Luật cho dòng SỔ chưa ghép.
  for (const a of led) {
    if (a.used) continue
    const p = periodOf(a.t.occurred_on)
    // Hoàn tiền sổ ghi ở kỳ này, nhà thẻ cấn qua 調整額 ở kỳ khác — bất kỳ kỳ nào đã nạp.
    const adj = stmt.find((s) => !s.used && s.l.kind === 'adjustment' && s.l.amount === a.amount)
    if (adj) {
      a.used = true
      adj.used = true
      push(adj.closeISO, {
        ledger: [a.t], lines: [adj.l], cause: 'refund-shifted',
        label: 'Hoàn tiền nhà thẻ cấn ở kỳ khác', amount: adj.l.amount,
      })
      continue
    }
    if (!p) continue // ngoài mọi kỳ đã nạp và không ghép được ⇒ không thuộc kỳ nào đang xem
    // Sổ ghi GỘP một dòng, nhà thẻ TÁCH nhiều dòng CÙNG NGÀY — cùng tiền, khác độ mịn.
    const sameDay = stmt.filter(
      (s) => !s.used && s.l.kind === 'purchase' && s.closeISO === p.range.closeISO && s.l.iso === a.t.occurred_on,
    )
    const merged = findSubset(a.amount, sameDay, (s) => s.l.amount, 2, 4)
    if (merged) {
      a.used = true
      merged.forEach((s) => (s.used = true))
      push(p.range.closeISO, {
        ledger: [a.t], lines: merged.map((s) => s.l), cause: 'merged-rows',
        label: `${merged.map((s) => s.l.name).join(' + ')} — sổ ghi gộp một dòng`, amount: a.amount,
      })
      continue
    }
    const r = out.get(p.range.closeISO)!
    if (a.t.is_refund) {
      r.refundDiffs.push({ source: 'ledger', label: a.t.note ?? '', iso: a.t.occurred_on, amount: a.amount })
    } else {
      r.extraInLedger.push({ tx: a.t, amount: a.amount })
    }
  }

  // Luật cho dòng THẺ chưa ghép.
  for (const s of stmt) {
    if (s.used) continue
    const r = out.get(s.closeISO)!
    switch (s.l.kind) {
      case 'recalculated':
        push(s.closeISO, { ledger: [], lines: [s.l], cause: 'recalculated', label: `${s.l.name} — nhà thẻ tính lại`, amount: s.l.amount })
        break
      case 'adjustment':
        r.refundDiffs.push({ source: 'statement', label: s.l.name, iso: s.l.iso, amount: s.l.amount })
        break
      default:
        r.missingFromLedger.push(s.l)
    }
  }

  return out
}
```

- [ ] **Step 5: Chạy cho chắc là xanh**

Run: `npx vitest run src/features/assets/statementReconcile.test.ts`
Expected: PASS (19 test). Nếu `date-edge phai gan ranh gioi...` đỏ: kiểm vòng 2 — dòng sổ 01/06 thuộc kỳ 6, dòng thẻ 28/07 thuộc kỳ 7 ⇒ khác kỳ ⇒ vòng 2 không ghép ⇒ đúng kỳ vọng. Nếu `refund-shifted` đỏ vì vòng 1 đã ghép −961 với 961 (gap 31 ngày > 4 nên không) — kiểm `signedAmount` cho `is_refund`.

- [ ] **Step 6: Kiểm kiểu**

Run: `npx tsc -b`
Expected: chỉ lỗi ở `ImportStatementSheet.tsx`. Không lỗi ở `statementReconcile*`.

- [ ] **Step 7: Commit**

```bash
git add src/features/assets/statementReconcile.ts src/features/assets/statementReconcile.test.ts
git commit -m "refactor(the): reconcileBatch ghep ca lo mot luot, cap ghep gan ve ky cua dong the

Them cause late-posting cho ETC ghi tre; date-edge suy tu ranh gioi ky thay cho hang xom.
Caller duy nhat (ImportStatementSheet) noi lai o commit sau.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Ba luật Rakuten — nạp ví theo tổng ngày trước, trả góp, mua quỹ

**Files:**
- Modify: `src/features/assets/statementReconcile.ts` (khối "Luật cho dòng THẺ chưa ghép" + một vòng mới trước nó)
- Modify: `src/features/assets/statementReconcile.test.ts` (thêm `describe`)

**Interfaces:**
- Consumes/Produces: như Task 4; `unmatchedTopups` bắt đầu có nội dung.

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `statementReconcile.test.ts`:

```ts
describe('reconcileBatch — luat Rakuten', () => {
  const topup = (iso: string, amount: number) => line(iso, amount, '楽天キャッシュ　チャージ', 'topup')

  it('wallet-topup: nap ngay D = tong 2 mon so ngay D-1 chua ghep (2376 = 1051 + 1325)', () => {
    const r = one('2026-06', [topup('2026-06-22', 2376)], [tx('2026-06-21', 1051), tx('2026-06-21', 1325)])
    expect(r.extraInLedger).toHaveLength(0)
    expect(r.missingFromLedger).toHaveLength(0)
    expect(r.unmatchedTopups.count).toBe(0)
    const p = r.pairs.find((p) => p.cause === 'wallet-topup')!
    expect(p.ledger).toHaveLength(2)
    expect(p.lines).toHaveLength(1)
    expect(p.label).toBe('Nạp ví Rakuten Pay = 2 món sổ ngày 21/06')
  })

  it('wallet-topup chi dung mon CHUA ghep: quet thang the 40680 da ghep, con 1485 moi la nap vi', () => {
    const r = one(
      '2026-06',
      [line('2026-06-22', 40680, 'ﾄｷｳﾞﾃﾂ'), topup('2026-06-23', 1485)],
      [tx('2026-06-22', 40680), tx('2026-06-22', 1485)],
    )
    expect(r.matchedCount).toBe(1)
    expect(causes(r)).toEqual(['wallet-topup'])
    expect(r.extraInLedger).toHaveLength(0)
  })

  it('wallet-topup: khong thay nhom ngay D-1 thi thu CUNG ngay D; nap vi KHONG di qua vong 1', () => {
    const r = one('2026-06', [topup('2026-06-15', 1230)], [tx('2026-06-15', 1230)])
    expect(r.matchedCount).toBe(0)
    expect(causes(r)).toEqual(['wallet-topup'])
    expect(r.extraInLedger).toHaveLength(0)
    expect(r.unmatchedTopups.count).toBe(0)
  })

  it('nap vi 1485 KHONG an nham khoan chi 1485 cung ngay khi ngay hom truoc co nhom khop', () => {
    const r = one('2026-06', [topup('2026-06-23', 1485)], [tx('2026-06-22', 1485), tx('2026-06-23', 1485)])
    const p = r.pairs.find((p) => p.cause === 'wallet-topup')!
    expect(p.ledger[0].occurred_on).toBe('2026-06-22')
    expect(r.extraInLedger.map((e) => e.tx.occurred_on)).toEqual(['2026-06-23'])
  })

  it('wallet-topup: mon so la hoan tien thi KHONG duoc dua vao nhom', () => {
    const r = one('2026-06', [topup('2026-06-22', 1000)], [tx('2026-06-21', 1000, { is_refund: true })])
    expect(r.unmatchedTopups.count).toBe(1)
  })

  it('nap vi khong tim duoc nhom thi vao cum unmatchedTopups, KHONG vao missingFromLedger', () => {
    const r = one('2026-06', [topup('2026-06-24', 1000), topup('2026-06-20', 2258)], [tx('2026-06-23', 278)])
    expect(r.missingFromLedger).toHaveLength(0)
    expect(r.unmatchedTopups).toMatchObject({ count: 2, total: 3258 })
    expect(r.extraInLedger).toHaveLength(1) // 278 vẫn là "sổ có, thẻ không"
  })

  it('PayPay チャージ cung theo luat nay: co transfer ra vi trong so thi ghep, khong thi vao cum', () => {
    const r1 = one('2026-01', [line('2026-01-08', 4000, 'チャージ', 'topup')], [tx('2026-01-08', 4000, { type: 'transfer', to_account_id: 'wallet' })])
    expect(causes(r1)).toEqual(['wallet-topup'])
    expect(r1.extraInLedger).toHaveLength(0)
    expect(r1.unmatchedTopups.count).toBe(0)
    const r2 = one('2026-01', [line('2026-01-08', 4000, 'チャージ', 'topup')], [])
    expect(r2.missingFromLedger).toHaveLength(0)
    expect(r2.unmatchedTopups.count).toBe(1)
  })

  it('installment: dong tra gop lan 2 giai thich duoc, khong ghep voi ai', () => {
    const r = one('2026-03', [line('2026-02-09', 4734, 'AMAZON.CO.JP', 'installment-later')], [tx('2026-02-09', 4734)])
    expect(causes(r)).toEqual(['installment'])
    expect(r.explained[0].label).toBe('AMAZON.CO.JP — trả góp lần sau, sổ đã ghi cả món')
    expect(r.matchedCount).toBe(0)
  })

  it('investment: 楽天証券 giai thich duoc', () => {
    const r = one('2026-06', [line('2026-06-01', 68000, '楽天証券投信積立', 'investment')], [])
    expect(causes(r)).toEqual(['investment'])
    expect(r.explained[0].label).toBe('楽天証券投信積立 — mua quỹ, theo dõi riêng')
  })
})
```

- [ ] **Step 2: Chạy cho chắc là đỏ**

Run: `npx vitest run src/features/assets/statementReconcile.test.ts -t "luat Rakuten"`
Expected: FAIL ở `wallet-topup`, `installment`, `investment`, `unmatchedTopups`.

- [ ] **Step 3: Cài luật**

Trong `statementReconcile.ts`, **trước** khối `// Luật cho dòng THẺ chưa ghép.` chèn:

```ts
  // Nạp ví (Rakuten Pay, PayPay チャージ) chưa ghép 1-1: sổ ghi TỪNG MÓN tiêu ngày hôm
  // trước, thẻ ghi MỘT lần nạp hôm sau. Đo thật: nạp 2.376 ngày 22/06 = sổ 21/06 có 1.051 +
  // 1.325. Chỉ dùng món CHƯA ghép, không hoàn tiền; nhận cả `transfer` từ thẻ ra ví (cách
  // sổ PayPay ghi một lần nạp — ghép 1 dòng : 1 transfer ở đây, không qua vòng 1). Thử
  // D−1 trước rồi D.
  const shift = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString().slice(0, 10)
  for (const s of stmt) {
    if (s.used || s.l.kind !== 'topup') continue
    for (const day of [shift(s.l.iso, -1), s.l.iso]) {
      const pool = led.filter(
        (a) => !a.used && !a.t.is_refund && (a.t.type === 'expense' || a.t.type === 'transfer') && a.t.occurred_on === day,
      )
      const group = findSubset(s.l.amount, pool, (a) => a.amount, 1, 4)
      if (!group) continue
      s.used = true
      group.forEach((a) => (a.used = true))
      push(s.closeISO, {
        ledger: group.map((a) => a.t), lines: [s.l], cause: 'wallet-topup',
        label: `Nạp ví Rakuten Pay = ${group.length} món sổ ngày ${dayLabel(day)}`, amount: s.l.amount,
      })
      break
    }
  }
```

Lưu ý: vòng này phải chạy **trước** "Luật cho dòng SỔ chưa ghép" (để `merged-rows`/`extraInLedger` không lấy mất món D−1) — tức chèn ngay **sau** Vòng 2 và **trước** vòng `for (const a of led)` thứ ba. Sửa thứ tự cho đúng: Vòng 1 → Vòng 2 → **Nạp ví** → Luật dòng sổ → Luật dòng thẻ.

Trong khối `// Luật cho dòng THẺ chưa ghép.` thêm ba `case` trước `default`:

```ts
      case 'topup':
        r.unmatchedTopups.count++
        r.unmatchedTopups.total += s.l.amount
        r.unmatchedTopups.lines.push(s.l)
        break
      case 'installment-later':
        push(s.closeISO, { ledger: [], lines: [s.l], cause: 'installment', label: `${s.l.name} — trả góp lần sau, sổ đã ghi cả món`, amount: s.l.amount })
        break
      case 'investment':
        push(s.closeISO, { ledger: [], lines: [s.l], cause: 'investment', label: `${s.l.name} — mua quỹ, theo dõi riêng`, amount: s.l.amount })
        break
```

Sửa chú thích của `unmatchedTopups` trong `ReconcileResult`: bỏ câu "(Cài ở Task 5; Task 4 luôn rỗng.)".

Nhãn `wallet-topup` nói "Rakuten Pay" cả với PayPay `チャージ` — PayPay có tài khoản ví riêng trong sổ nên gần như luôn ghép 1-1 ở vòng 1, không tới đây. Chấp nhận, không thêm nhánh.

- [ ] **Step 4: Chạy cả file cho chắc là xanh**

Run: `npx vitest run src/features/assets/statementReconcile.test.ts`
Expected: PASS (28 test: 19 cũ + 9 mới). Ca `wallet-topup chi dung mon CHUA ghep` phụ thuộc thứ tự: vòng 1 ghép 40680↔40680 trước, còn 1485 cho nạp ví — và nạp ví KHÔNG đi qua vòng 1 (`UNMATCHABLE` có `topup`).

- [ ] **Step 5: Commit**

```bash
git add src/features/assets/statementReconcile.ts src/features/assets/statementReconcile.test.ts
git commit -m "feat(the): luat Rakuten - nap vi theo tong ngay truoc, tra gop lan sau, mua quy

Nap vi khong tim duoc nhom thi gom cum unmatchedTopups, khong rai le vao 'can xem'.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Nối màn trượt cũ vào API mới, kiểm trên file thật

**Files:**
- Modify: `src/features/assets/ImportStatementSheet.tsx`

**Interfaces:**
- Consumes: `parseStatement` (Task 3), `mergeStatements`, `billRowsFor`, `MergedStatement` (Task 3), `reconcileBatch`, `emptyResult` (Task 4/5), `ParsedStatement` (Task 1).

Sheet này bị gỡ ở Đợt 2, nên chỉ nối **tối thiểu** cho chạy đúng: đọc cả PayPay lẫn Rakuten, hiện từng nguồn khi có nhiều hơn một, hiện cụm nạp ví. Không làm đẹp.

- [ ] **Step 1: Đổi import và kiểu**

Dòng 16–18 hiện là:

```ts
import { parsePaypayStatement, type ParsedStatement } from './paypayStatement'
import { billRowsFor, withNeighbours } from './statementNeighbours'
import { reconcileStatement, type LedgerTx, type ReconcileResult } from './statementReconcile'
```

Thay bằng:

```ts
import { parseStatement } from './parseStatement'
import { billRowsFor, mergeStatements, type MergedStatement } from './statementBatch'
import type { ParsedStatement } from './statementLine'
import { emptyResult, reconcileBatch, type LedgerTx, type ReconcileResult } from './statementReconcile'
```

Đổi `interface Reviewed { parsed: ParsedStatement; result: ReconcileResult }` thành `{ merged: MergedStatement; result: ReconcileResult }`.

- [ ] **Step 2: Gộp trước, mở cửa sổ truy vấn xuống dòng thẻ sớm nhất**

Thay `useMemo` tính `earliestStart` bằng:

```ts
  const merged = useMemo(() => mergeStatements(parsed), [parsed])

  // Cửa sổ truy vấn suy TỪ chính các file đã bóc: trang tài khoản chỉ giữ một tháng, mà lô
  // này trải nhiều kỳ. Mở xuống tới NGÀY DÒNG THẺ SỚM NHẤT chứ không chỉ range.start: ETC
  // ghi trễ 5 tuần nằm trước kỳ, không có dòng sổ của ngày đó thì không ghép được.
  const earliestStart = useMemo(() => {
    let min: string | null = null
    for (const m of merged) {
      for (const d of [m.range.start, ...m.lines.map((l) => l.iso)]) if (min == null || d < min) min = d
    }
    return min
  }, [merged])
```

- [ ] **Step 3: Gọi `reconcileBatch` một lần**

Thay `useMemo` tính `reviewed` bằng:

```ts
  const reviewed: Reviewed[] = useMemo(() => {
    const results = reconcileBatch(merged, txs.map(toLedgerTx), card.id)
    return merged.map((m) => ({ merged: m, result: results.get(m.range.closeISO) ?? emptyResult() }))
  }, [merged, txs, card.id])
```

Đổi `const lechNgay = parsed.some((p) => p.dueDateMismatch)` thành `merged.some((m) => m.dueDateMismatch)`.

- [ ] **Step 4: Đọc file qua dispatcher, truyền tên file**

Trong `chonFile`, đổi `const p = parsePaypayStatement(await f.text(), card)` thành
`const p = parseStatement(await f.text(), card, f.name)`.

Trong `luu()`: `upsert.mutate(billRowsFor(card.id, merged), {...})`.

Câu báo "Không đọc được" đổi thành: `File phải là sao kê PayPay hoặc Rakuten e-NAVI tải từ app/web nhà thẻ, và thẻ phải khai đủ ngày chốt + ngày đến hạn.`

- [ ] **Step 5: Đổi thân `reviewed.map`**

`reviewed.map(({ parsed: p, result }) => {` → `reviewed.map(({ merged: p, result }) => {`. Mọi chỗ dùng `p.range`, `p.total`, `p.lines`, `p.dueDateMismatch` giữ nguyên vì `MergedStatement` có cùng tên trường. Chỗ `p.dueDateFromFile` (khối cảnh báo ngày rút) không còn — đổi khối đó thành:

```tsx
                {p.dueDateMismatch && (
                  <p className="mt-1.5 rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-2xs text-state-warn-fg">
                    Kỳ suy ra từ nội dung file không khớp ngày rút / tên file. Kiểm ngày chốt và ngày trả của thẻ.
                  </p>
                )}
```

Ngay dưới dòng `<Money amount={p.total} …/>` (khối "Hoá đơn nhà thẻ"), thêm dòng từng nguồn khi có ≥ 2:

```tsx
                {p.parts.length > 1 && (
                  <p className="text-2xs text-fg-muted">
                    {p.parts.map((part, i) => (
                      <span key={part.source}>
                        {i > 0 && ' · '}
                        {part.sourceLabel} <Money amount={part.total} currency={card.currency} tone="muted" />
                      </span>
                    ))}
                  </p>
                )}
```

Trong mảng `canXem`, thêm phần tử cụm nạp ví **sau** `missingFromLedger`:

```ts
              ...(result.unmatchedTopups.count > 0
                ? [{
                    key: `topups-${p.range.closeISO}`,
                    chu: `Nạp ví chưa ghép được — ${result.unmatchedTopups.count} lần, ví có số dư nên chưa chắc là lỗi sổ`,
                    amount: result.unmatchedTopups.total,
                  }]
                : []),
```

- [ ] **Step 6: Kiểm kiểu + cả bộ test**

Run: `npx tsc -b`
Expected: **0 lỗi**.

Run: `npm test`
Expected: PASS toàn bộ (kể cả `tests/designSystem.test.ts` — sheet không thêm giá trị tuỳ ý, chỉ dùng class đã có trong file).

- [ ] **Step 7: Kiểm trên file thật (tay, không phải test)**

Viết script tạm vào scratchpad (KHÔNG commit), chạy bằng node với `tsx` nếu có, không thì dùng vitest với một file test tạm ngoài `src/` — cách đơn giản nhất: tạo `src/features/assets/_smoke.test.ts` **tạm**, xoá ngay sau:

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { it, expect } from 'vitest'
import { parseStatement } from './parseStatement'
import { mergeStatements } from './statementBatch'

const CARD = { statementDay: 31, paymentDueDay: 27 }
const DIR = join(homedir(), 'Downloads', 'credit')

it('smoke: 28 file enavi doc duoc, gop thanh 14 ky, khong ky nao lech ten file', () => {
  const files = readdirSync(DIR).filter((f) => f.startsWith('enavi') && f.endsWith('.csv'))
  const parsed = files.map((f) => parseStatement(readFileSync(join(DIR, f), 'utf8'), CARD, f))
  expect(parsed.filter((p) => p == null)).toHaveLength(0)
  const merged = mergeStatements(parsed.filter((p): p is NonNullable<typeof p> => p != null))
  for (const m of merged) console.log(m.range.closeISO, m.total, m.parts.map((p) => `${p.sourceLabel}=${p.total}`).join(' '))
  expect(merged.find((m) => m.range.closeISO === '2026-06-30')!.total).toBe(165429 + 880)
  expect(merged.some((m) => m.dueDateMismatch)).toBe(false)
})
```

Run: `npx vitest run src/features/assets/_smoke.test.ts`
Expected: PASS; log 14 dòng kỳ, kỳ `2026-06-30` = `Master 3737=165429 Visa 2565=880`. Nếu có file trùng như `enavi202601(3737) (1).csv` + `enavi202601(3737).csv` ⇒ cùng nguồn ⇒ chỉ tính một — đúng.

Rồi: `rm src/features/assets/_smoke.test.ts`. Kiểm `git status` không còn file đó.

- [ ] **Step 8: Mở app xem một lần**

Chạy dev server qua Browser pane (`preview_start`, KHÔNG Bash), vào trang thẻ "Credit Rakuten" ở chế độ demo hoặc tài khoản thật, bấm "Nạp sao kê", chọn hai file `enavi202607(3737) (1).csv` + `enavi202607(2565).csv`. Kỳ vọng thấy: một kỳ "Quẹt 01/06 – 30/06", hoá đơn 166.309, dòng nhỏ "Visa 2565 880 · Master 3737 165.429", phần "Cần bạn xem" có cụm "Nạp ví chưa ghép được". Chụp màn hình để báo cáo.

- [ ] **Step 9: Commit**

```bash
git add src/features/assets/ImportStatementSheet.tsx
git commit -m "feat(the): man nap sao ke doc ca Rakuten, hien tung the va cum nap vi chua ghep

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Tự soát kế hoạch (đã chạy khi viết)

- **Phủ spec §4.1** kiểu chung + `kind` + `billed` + `source` → Task 1. **§4.2** bộ đọc enavi, tra cột theo tên, năm suy từ ngày quẹt, kiểm tên file, gắn `kind`, trả góp → Task 2. Đăng ký `statementFormat` → Task 2 Step 5. **§4.3** gộp nguồn, `parts`, `billRowsFor` mới, bỏ `withNeighbours` → Task 3. **§6** `reconcileBatch`, `pairs`, `late-posting`, `date-edge` theo ranh giới, dòng sổ ngoài kỳ bỏ qua → Task 4; **§4.4** ba luật Rakuten + `unmatchedTopups` → Task 5. Adapter cho sheet → Task 6.
- **Khác spec, có chủ ý:** spec §4.4 nói "bốn luật PayPay giữ nguyên hành vi"; Task 4/5 đổi luật `wallet-topup` từ "luôn giải thích được" sang "chỉ khi tìm thấy nhóm sổ, không thì cụm `unmatchedTopups`". Lý do ghi ở đầu Task 4. Ba luật còn lại (`refund-shifted`, `date-edge`, `recalculated`, `merged-rows`) giữ nguyên kết quả.
- **Tên nhất quán:** `parseStatement(text, card, fileName)`, `mergeStatements`, `billRowsFor(accountId, merged)`, `reconcileBatch(statements, ledger, cardId)`, `emptyResult()`, `Pair{ledger, lines, cause, label, amount}`, `unmatchedTopups{count,total,lines}` dùng cùng một kiểu ở Task 3–6.
- Đợt 2, 3, 4 của spec (§5, §7, §8) **không** nằm trong plan này — viết plan riêng sau khi Đợt 1 lên `master`.
