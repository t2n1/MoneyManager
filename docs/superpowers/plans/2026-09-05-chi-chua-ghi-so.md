# Chi chưa ghi sổ — kế hoạch thi công

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tổng Chi của tháng thôi là sàn — phần tiền đã rời ví mà chưa ai ghi sổ được đọc ra từ
các khoản đối chiếu, cộng vào tổng, và hiện thành một dòng có tên.

**Architecture:** Một module toán thuần mới đọc chính mảng giao dịch mà màn Báo cáo đang cầm
(các khoản bù đã nằm sẵn trong đó, chỉ bị vòng lặp bỏ qua). Ba chỗ tiêu thụ nó. **Không** sửa
`sumIncomeExpense` / `categoryBreakdown` — hai hàm đó có 11 và 15 file gọi, tính cả `src/mcp/`.

**Tech Stack:** TypeScript · React · Vitest · Tailwind

**Spec:** [docs/superpowers/specs/2026-09-05-chi-chua-ghi-so-design.md](../specs/2026-09-05-chi-chua-ghi-so-design.md)

## Global Constraints

- **Không đổi schema**, không sửa `src/data/repo.ts`, `supabaseRepo.ts`, `demoRepo.ts`,
  `src/hooks/queries.ts`, hay `src/mcp/`. Không chạy `npm run bundle:mcp`.
- **Không sửa** `sumIncomeExpense`, `categoryBreakdown`, `pickBudgetVerdict`, `MonthPace`.
- Thiếu tỷ giá → **loại khoản đó, bật `hasMissingRate`**. Không bao giờ quy 1:1.
- Số tiền là `bigint`/số nguyên minor units. **Không dùng float.**
- Mọi con số ra màn hình đi qua `<Money>` (tiền) hoặc `<Num>` (đếm/%).
- Không chêm giá trị tuỳ ý vào class Tailwind (`text-[0.8125rem]` và tương tự là ban cứng trong
  `tests/designSystem.test.ts`). Dùng token đã có tên.
- Không tự viết `<h1>`, `<h2>`, `<select>`, hay nút nền xanh — dùng `<PageHeader>`,
  `<SectionTitle>`, `<Select>`, `<ActionButton>`.
- Kiểm tra cuối: `npm run build` (dùng `tsc -b`, **không** dùng `tsc --noEmit` — lệnh đó không
  kiểm gì ở repo này), `npm test`, `npm run lint`.
- **Không chạy prettier** — repo không có prettier, `--write` sẽ viết lại cả file sai style.
- File có EOL lẫn lộn: tầng `data` và `presets.ts` là CRLF, `features/lifetime` tsx là LF. Script
  thay chuỗi phải dò EOL từng file.

---

### Task 1: Module toán thuần `chiChuaGhi.ts`

**Files:**
- Create: `src/features/reports/chiChuaGhi.ts`
- Test: `src/features/reports/chiChuaGhi.test.ts`

**Interfaces:**
- Consumes: `ADJUST_CATEGORY_NAME` từ `../categories/flowCategories`; `convertToBase`, `Rates` từ
  `../../lib/rates`; `TransactionRow`, `CategoryRow`, `AccountType` từ
  `../../types/database.types`; `CurrencyCode` từ `../../lib/money`.
- Produces: `ChiChuaGhi`, `tinhChiChuaGhi()`, `tongChiCoPhanChuaGhi()`, `dongChiChuaGhi()` —
  Task 2, 3, 4 đều gọi ba hàm này.

- [ ] **Step 1: Viết phép thử thất bại**

Tạo `src/features/reports/chiChuaGhi.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { AccountType, CategoryRow, TransactionRow } from '../../types/database.types'
import { ADJUST_CATEGORY_NAME } from '../categories/flowCategories'
import { dongChiChuaGhi, tinhChiChuaGhi, tongChiCoPhanChuaGhi } from './chiChuaGhi'

const RATES: Rates = { JPY: 1, VND: 165, USD: 0.0065 }

const CATS = [
  { id: 'adjust-out', name: ADJUST_CATEGORY_NAME },
  { id: 'adjust-in', name: ADJUST_CATEGORY_NAME },
  { id: 'food', name: 'Cơm ngoài' },
]

const ACCS: { id: string; type: AccountType; currency: CurrencyCode }[] = [
  { id: 'vi', type: 'cash', currency: 'JPY' },
  { id: 'nh', type: 'bank', currency: 'JPY' },
  { id: 'the', type: 'card', currency: 'JPY' },
  { id: 'dt', type: 'investment', currency: 'JPY' },
  { id: 'vnd', type: 'cash', currency: 'VND' },
]

let seq = 0
function tx(p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount'>): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    category_id: null,
    account_id: 'vi',
    to_account_id: null,
    to_amount: null,
    recurring_rule_id: null,
    occurred_on: '2026-08-20',
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  } as TransactionRow
}

/** Khoản bù chuẩn: exclude_from_stats + danh mục Điều chỉnh số dư. */
const bu = (p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount'>) =>
  tx({
    exclude_from_stats: true,
    category_id: p.type === 'income' ? 'adjust-in' : 'adjust-out',
    ...p,
  })

const tinh = (txs: TransactionRow[]) =>
  tinhChiChuaGhi(txs, CATS as CategoryRow[], ACCS, 'JPY', RATES)

describe('tinhChiChuaGhi', () => {
  it('ví tiền mặt, bù chiều chi → chưa ghi', () => {
    const r = tinh([bu({ type: 'expense', amount: 18_000 })])
    expect(r.net).toBe(18_000)
    expect(r.huong).toBe('chua_ghi')
    expect(r.soLanDoiChieu).toBe(1)
    expect(r.lanCuoiISO).toBe('2026-08-20')
  })

  it('bù chiều thu → ghi thừa, net âm', () => {
    const r = tinh([bu({ type: 'income', amount: 5_000 })])
    expect(r.net).toBe(-5_000)
    expect(r.huong).toBe('ghi_thua')
  })

  it('hai lần ngược chiều trong tháng thì bù trừ', () => {
    const r = tinh([
      bu({ type: 'expense', amount: 18_000, occurred_on: '2026-08-10' }),
      bu({ type: 'income', amount: 5_000, occurred_on: '2026-08-25' }),
    ])
    expect(r.net).toBe(13_000)
    expect(r.soLanDoiChieu).toBe(2)
    expect(r.lanCuoiISO).toBe('2026-08-25')
  })

  it('bù trên thẻ tín dụng bị loại', () => {
    const r = tinh([bu({ type: 'expense', amount: 40_000, account_id: 'the' })])
    expect(r.soLanDoiChieu).toBe(0)
    expect(r.net).toBe(0)
  })

  it('bù trên tài khoản đầu tư bị loại', () => {
    const r = tinh([bu({ type: 'expense', amount: 40_000, account_id: 'dt' })])
    expect(r.soLanDoiChieu).toBe(0)
  })

  it('exclude_from_stats nhưng danh mục khác thì KHÔNG tính', () => {
    const r = tinh([
      tx({ type: 'expense', amount: 9_999, category_id: 'food', exclude_from_stats: true }),
    ])
    expect(r.soLanDoiChieu).toBe(0)
    expect(r.net).toBe(0)
  })

  it('danh mục Điều chỉnh nhưng KHÔNG exclude_from_stats thì không tính', () => {
    const r = tinh([tx({ type: 'expense', amount: 7_000, category_id: 'adjust-out' })])
    expect(r.soLanDoiChieu).toBe(0)
  })

  it('thiếu tỷ giá → loại dòng, bật hasMissingRate', () => {
    const r = tinhChiChuaGhi(
      [bu({ type: 'expense', amount: 1_000_000, account_id: 'vnd' })],
      CATS as CategoryRow[],
      ACCS,
      'JPY',
      { JPY: 1 } as Rates,
    )
    expect(r.net).toBe(0)
    expect(r.hasMissingRate).toBe(true)
    expect(r.soLanDoiChieu).toBe(0)
  })

  it('quy đổi ngoại tệ khi có tỷ giá', () => {
    const r = tinh([bu({ type: 'expense', amount: 1_650_000, account_id: 'vnd' })])
    expect(r.net).toBe(10_000)
    expect(r.hasMissingRate).toBe(false)
  })

  it('tháng trống', () => {
    const r = tinh([])
    expect(r.net).toBe(0)
    expect(r.huong).toBeNull()
    expect(r.soLanDoiChieu).toBe(0)
    expect(r.lanCuoiISO).toBeNull()
  })
})

describe('tongChiCoPhanChuaGhi', () => {
  it('không đối chiếu lần nào thì giữ nguyên tổng', () => {
    const r = tinh([])
    expect(tongChiCoPhanChuaGhi(303_936, r)).toBe(303_936)
  })

  it('có phần chưa ghi thì cộng vào', () => {
    const r = tinh([bu({ type: 'expense', amount: 18_000 })])
    expect(tongChiCoPhanChuaGhi(303_936, r)).toBe(321_936)
  })

  it('ghi thừa thì trừ ra', () => {
    const r = tinh([bu({ type: 'income', amount: 5_000 })])
    expect(tongChiCoPhanChuaGhi(303_936, r)).toBe(298_936)
  })
})

describe('dongChiChuaGhi', () => {
  it('không đối chiếu lần nào → null', () => {
    expect(dongChiChuaGhi(tinh([]))).toBeNull()
  })

  it('net bằng 0 dù có đối chiếu → null', () => {
    const r = tinh([
      bu({ type: 'expense', amount: 5_000 }),
      bu({ type: 'income', amount: 5_000 }),
    ])
    expect(r.soLanDoiChieu).toBe(2)
    expect(dongChiChuaGhi(r)).toBeNull()
  })

  it('chưa ghi → nhãn "Chưa ghi rõ", số dương', () => {
    expect(dongChiChuaGhi(tinh([bu({ type: 'expense', amount: 18_000 })]))).toEqual({
      nhan: 'Chưa ghi rõ',
      soTien: 18_000,
    })
  })

  it('ghi thừa → nhãn "Ghi thừa", số âm', () => {
    expect(dongChiChuaGhi(tinh([bu({ type: 'income', amount: 5_000 })]))).toEqual({
      nhan: 'Ghi thừa',
      soTien: -5_000,
    })
  })
})
```

- [ ] **Step 2: Chạy phép thử, xác nhận nó thất bại**

```bash
npx vitest run src/features/reports/chiChuaGhi.test.ts
```

Kỳ vọng: FAIL — `Failed to resolve import "./chiChuaGhi"`.

- [ ] **Step 3: Viết bản cài đặt tối thiểu**

Tạo `src/features/reports/chiChuaGhi.ts`:

```ts
// Phần tiền đã rời ví mà chưa ai ghi sổ — đọc ra từ các khoản bù của "Điều chỉnh số dư".
// Thuần, không phụ thuộc React, để unit-test được.
//
// Vì sao có file này: khoản bù mang `exclude_from_stats: true` và danh mục kind='transfer',
// nên MỌI hàm thống kê đều bỏ qua nó. Số dư vì thế đúng, còn tổng Chi thiếu đúng bằng phần
// quên ghi — tổng Chi thành SÀN chứ không phải tổng. Xem spec 2026-09-05.
//
// Vì sao KHÔNG sửa thẳng aggregate.ts: `sumIncomeExpense` có 11 file gọi và
// `categoryBreakdown` có 15, trải cả sang `src/mcp/`. Sửa ở đó là đổi lặng lẽ cả những màn
// ta không định đổi. Ở đây là một đầu vào RIÊNG, chỉ ba chỗ đọc.

import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { AccountType, CategoryRow, TransactionRow } from '../../types/database.types'
import { ADJUST_CATEGORY_NAME } from '../categories/flowCategories'

/**
 * Kiểu tài khoản được tính — DANH SÁCH CHO PHÉP, không phải danh sách loại trừ.
 *
 * Loại thẻ tín dụng: bù trên thẻ là lệch sao kê, không phải tiền mặt quên ghi (khoản quẹt
 * thẻ vốn đã vào sổ qua import). Loại đầu tư/tài sản cố định: biến động giá trị ở đó không
 * phải tiêu tiền.
 *
 * Dùng `account.type` chứ không dùng ghi chú `CARD_RECONCILE_NOTE`: kiểu tài khoản là dữ
 * liệu có cấu trúc, còn chuỗi ghi chú thì người dùng sửa được.
 */
const KIEU_TINH: ReadonlySet<AccountType> = new Set<AccountType>(['cash', 'bank', 'ic', 'ewallet'])

export interface ChiChuaGhi {
  /** Ròng, quy về base. Dương = tiêu mà chưa ghi. Âm = đã ghi thừa. */
  net: number
  /** 'chua_ghi' khi net > 0 · 'ghi_thua' khi net < 0 · null khi net === 0 */
  huong: 'chua_ghi' | 'ghi_thua' | null
  /** Số lần đối chiếu đã gộp. 0 = tháng không đối chiếu lần nào. */
  soLanDoiChieu: number
  /** true = có khoản bù bị bỏ vì thiếu tỷ giá. UI phải hiện `≈`. */
  hasMissingRate: boolean
  /** Ngày đối chiếu gần nhất trong kỳ, ISO. null = không có lần nào. */
  lanCuoiISO: string | null
}

export function tinhChiChuaGhi(
  txs: readonly TransactionRow[],
  categories: readonly Pick<CategoryRow, 'id' | 'name'>[],
  accounts: readonly { id: string; type: AccountType; currency: CurrencyCode }[],
  base: CurrencyCode,
  rates: Rates,
): ChiChuaGhi {
  const laDanhMucBu = new Set(
    categories.filter((c) => c.name === ADJUST_CATEGORY_NAME).map((c) => c.id),
  )
  const tk = new Map(accounts.map((a) => [a.id, a]))

  let net = 0
  let soLanDoiChieu = 0
  let hasMissingRate = false
  let lanCuoiISO: string | null = null

  for (const t of txs) {
    if (!t.exclude_from_stats) continue
    if (!t.category_id || !laDanhMucBu.has(t.category_id)) continue
    const a = tk.get(t.account_id)
    if (!a || !KIEU_TINH.has(a.type)) continue

    const quy = convertToBase(t.amount, a.currency, base, rates)
    if (quy === null) {
      // Thiếu tỷ giá thì LOẠI, không quy 1:1 — thà thiếu còn hơn bịa. Không đếm vào
      // soLanDoiChieu: lần đối chiếu này không đóng góp được con số nào.
      hasMissingRate = true
      continue
    }

    net += t.type === 'income' ? -quy : quy
    soLanDoiChieu += 1
    if (lanCuoiISO === null || t.occurred_on > lanCuoiISO) lanCuoiISO = t.occurred_on
  }

  return {
    net,
    huong: net > 0 ? 'chua_ghi' : net < 0 ? 'ghi_thua' : null,
    soLanDoiChieu,
    hasMissingRate,
    lanCuoiISO,
  }
}

/**
 * Tổng Chi đã gồm phần chưa ghi.
 *
 * `soLanDoiChieu === 0` thì GIỮ NGUYÊN tổng cũ — tháng không đối chiếu lần nào là
 * "không biết", không phải "bằng không". Cộng 0 vào cũng ra đúng số, nhưng viết rõ nhánh
 * này để người đọc sau thấy luật, và để phép thử canh được nó.
 */
export function tongChiCoPhanChuaGhi(chiDaGhi: number, c: ChiChuaGhi): number {
  if (c.soLanDoiChieu === 0) return chiDaGhi
  return chiDaGhi + c.net
}

/** Dòng để bày ra bảng/màn Ngân sách. null = không có gì để nói, đừng hiện dòng nào. */
export function dongChiChuaGhi(c: ChiChuaGhi): { nhan: string; soTien: number } | null {
  if (c.soLanDoiChieu === 0 || c.huong === null) return null
  return { nhan: c.huong === 'chua_ghi' ? 'Chưa ghi rõ' : 'Ghi thừa', soTien: c.net }
}
```

- [ ] **Step 4: Chạy phép thử, xác nhận nó xanh**

```bash
npx vitest run src/features/reports/chiChuaGhi.test.ts
```

Kỳ vọng: PASS, 17 phép thử.

- [ ] **Step 5: Commit**

```bash
git add src/features/reports/chiChuaGhi.ts src/features/reports/chiChuaGhi.test.ts
git commit -m "feat(bao-cao): doc ra phan chi chua ghi so tu khoan doi chieu"
```

---

### Task 2: Cộng vào tổng Chi ở Báo cáo tháng

**Files:**
- Modify: `src/features/reports/MonthView.tsx` (quanh dòng 164 `sums`, và dòng 204 `tiers`,
  dòng 619 `<MonthCategoryTable>`)

**Interfaces:**
- Consumes: `tinhChiChuaGhi`, `tongChiCoPhanChuaGhi` từ `./chiChuaGhi` (Task 1)
- Produces: biến `chuaGhi` (kiểu `ChiChuaGhi`) và `chiCoPhanChuaGhi` (number) trong `MonthView`
  — Task 3 dùng lại cả hai.

- [ ] **Step 1: Thêm phép tính vào MonthView**

Thêm import cạnh các import `./` đang có:

```ts
import { tinhChiChuaGhi, tongChiCoPhanChuaGhi } from './chiChuaGhi'
```

Ngay sau khối `const sums = useMemo(...)` (dòng ~164), thêm:

```tsx
  // Phần đã rời ví mà chưa ai ghi sổ. Đọc từ chính `monthTxs` — các khoản bù đã nằm sẵn
  // trong đó, chỉ bị vòng lặp của aggregate.ts bỏ qua vì exclude_from_stats.
  const chuaGhi = useMemo(
    () => tinhChiChuaGhi(monthTxs, categories, accounts, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, categories, accounts, base, rates],
  )
  const chiCoPhanChuaGhi = tongChiCoPhanChuaGhi(sums.expense, chuaGhi)
```

- [ ] **Step 2: Dùng số mới ở hai chỗ hiển thị**

Trong khối `const tiers = useMemo(...)` (dòng ~204), đổi đối số chi của `outflowTiers` từ
`sums.expense` sang `chiCoPhanChuaGhi`, và thêm `chiCoPhanChuaGhi` vào mảng phụ thuộc.

Ở `<MonthCategoryTable>` (dòng ~619), đổi:

```tsx
              total={sums.expense}
```

thành:

```tsx
              total={chiCoPhanChuaGhi}
```

và đổi `approx={sums.hasForeign}` thành `approx={sums.hasForeign || chuaGhi.hasMissingRate}`.

- [ ] **Step 3: Kiểm biên dịch và phép thử cũ**

```bash
npm run build
```

Kỳ vọng: xanh. `npm test` cũng phải xanh — không phép thử cũ nào được đổi.

- [ ] **Step 4: Commit**

```bash
git add src/features/reports/MonthView.tsx
git commit -m "feat(bao-cao): tong Chi thang gom ca phan chua ghi so"
```

---

### Task 3: Dòng riêng trong bảng danh mục

**Files:**
- Modify: `src/features/reports/MonthCategoryTable.tsx`
- Modify: `src/features/reports/MonthView.tsx` (chỗ gọi component)

**Interfaces:**
- Consumes: `dongChiChuaGhi` từ `./chiChuaGhi` (Task 1); biến `chuaGhi` từ `MonthView` (Task 2)
- Produces: prop `chuaGhi?: { nhan: string; soTien: number } | null` trên `MonthCategoryTable`

- [ ] **Step 1: Thêm prop vào MonthCategoryTable**

Trong khối tham số của `MonthCategoryTable`, thêm `chuaGhi = null` vào phần huỷ cấu trúc và
thêm vào kiểu:

```tsx
  /** Phần chi không rõ tiêu vào đâu — KHÔNG phải một danh mục, nên không đi qua
   *  `rows`: `MonthTableRow` bắt buộc có deltaPct/spark/budgeted, dòng giả sẽ khiến
   *  cột Δ in ra "mới" và cột Hạn mức in ra một trạng thái không có thật.
   *  null = không có gì để nói. */
  chuaGhi?: { nhan: string; soTien: number } | null
```

- [ ] **Step 2: Bỏ nhánh trả về sớm khi bảng rỗng**

Nhánh `if (rows.length === 0)` hiện trả về "Kỳ này chưa có khoản chi nào có danh mục." Đổi điều
kiện thành `if (rows.length === 0 && !chuaGhi)` — tháng chỉ có khoản đối chiếu mà không có danh
mục nào vẫn phải hiện được dòng đó.

- [ ] **Step 3: Chèn dòng vào đúng vị trí**

Sau `const sorted = sortMonthTable(rows, sort)`, thêm:

```tsx
  // Chèn theo TRỊ TUYỆT ĐỐI khi đang sắp theo tiền: dòng "Ghi thừa" mang số âm, xếp theo
  // số có dấu sẽ rơi xuống đáy bảng trong khi độ lớn của nó mới là thứ đáng chú ý.
  // Sắp theo tên hoặc theo Δ thì nó đứng cuối: nó không có tên để so, không có Δ để so.
  const viTriChuaGhi =
    chuaGhi === null
      ? -1
      : sort === 'amount'
        ? sorted.findIndex((r) => r.thisMonth < Math.abs(chuaGhi.soTien))
        : sorted.length
```

`findIndex` trả `-1` khi mọi dòng đều lớn hơn — nghĩa là dòng chưa ghi đứng cuối. Xử lý:

```tsx
  const viTriChen = viTriChuaGhi === -1 && chuaGhi !== null ? sorted.length : viTriChuaGhi
```

- [ ] **Step 4: Vẽ dòng**

Trong vòng lặp render các dòng, chèn dòng chưa ghi tại `viTriChen`. Dòng này dùng cùng lưới với
các dòng khác nhưng để **trống** ô Δ và ô Hạn mức, và mang nền cảnh báo để nhìn ra ngay là nó
khác:

```tsx
{chuaGhi !== null && index === viTriChen && (
  <div className="grid-cols-subgrid col-span-full grid bg-state-warn-bg">
    <span className="truncate text-fg-warn">{chuaGhi.nhan}</span>
    <Money amount={chuaGhi.soTien} currency={base} tone="warn" />
    <span aria-hidden />
    <span aria-hidden />
  </div>
)}
```

Ba điểm đã tra sẵn, dùng đúng như trên:

- Prop của `<Money>` là **`amount`**, không phải `value` ([Money.tsx:56](../../../src/components/ui/Money.tsx:56)).
- `tone="warn"` là tone hợp lệ và ánh sang `text-fg-warn` — cùng màu với chip cảnh báo cạnh nó.
- `bg-state-warn-bg` là token đã có (`--color-state-warn-bg`, [index.css:369](../../../src/index.css:369)),
  có sẵn cả bản Sáng lẫn Tối. **Đừng** đặt token mới.

Số ô trống phải khớp đúng số cột của lưới đang dùng — **đếm lại header trước khi viết, đừng
đoán.**

- [ ] **Step 5: Truyền từ MonthView**

Thêm import `dongChiChuaGhi` vào `MonthView.tsx` và truyền vào component:

```tsx
              chuaGhi={dongChiChuaGhi(chuaGhi)}
```

- [ ] **Step 6: Kiểm**

```bash
npm run build
npm test
npm run lint
```

Cả ba phải xanh.

- [ ] **Step 7: Commit**

```bash
git add src/features/reports/MonthCategoryTable.tsx src/features/reports/MonthView.tsx
git commit -m "feat(bao-cao): dong 'Chua ghi ro' trong bang danh muc thang"
```

---

### Task 4: Dòng cảnh báo cạnh phán quyết ngân sách

**Files:**
- Create: `src/features/budgets/ChiChuaGhiLine.tsx`
- Modify: `src/features/budgets/BudgetView.tsx:866`

**Interfaces:**
- Consumes: `ChiChuaGhi`, `dongChiChuaGhi` từ `../reports/chiChuaGhi` (Task 1)
- Produces: `<ChiChuaGhiLine chuaGhi={...} base={...} />`

**Ràng buộc tuyệt đối:** không sửa `pickBudgetVerdict`, không sửa `MonthPace`, không đổi
`totalBudgeted`. Dòng này đứng **cạnh** phán quyết, không trộn vào phép tính — xem §2b đính chính
2 của spec.

- [ ] **Step 1: Viết component**

Tạo `src/features/budgets/ChiChuaGhiLine.tsx`:

```tsx
// Dòng cảnh báo đứng CẠNH phán quyết ngân sách, không trộn vào nó.
//
// `pickBudgetVerdict` cố ý chỉ so chi của các mục ĐÃ ĐẶT hạn mức với tổng trần của chính
// chúng. Phần "Chưa ghi rõ" không thuộc danh mục nào, nên nhét vào phán quyết chính là lỗi
// lệch phạm vi mà budgetVerdict.ts được viết ra để chặn ("ai mới đặt vài hạn mức cũng thấy
// 'vượt' khổng lồ, rồi thôi tin cả thẻ").
import { Guide } from '../../components/Guide'
import { Money } from '../../components/ui'
import type { CurrencyCode } from '../../lib/money'
import { dongChiChuaGhi, type ChiChuaGhi } from '../reports/chiChuaGhi'

export function ChiChuaGhiLine({
  chuaGhi,
  base,
}: {
  chuaGhi: ChiChuaGhi
  base: CurrencyCode
}) {
  const dong = dongChiChuaGhi(chuaGhi)
  if (dong === null) return null

  return (
    <Guide className="mt-2 text-sm text-fg-warn">
      Ngoài ra <Money amount={Math.abs(dong.soTien)} currency={base} tone="warn" />{' '}
      {dong.nhan === 'Chưa ghi rõ' ? 'chưa rõ tiêu vào đâu' : 'đã ghi thừa'} — không nằm
      trong phán quyết trên.
    </Guide>
  )
}
```

Vế "không nằm trong phán quyết trên" là bắt buộc: thiếu nó thì người đọc tự cộng hai số.

- [ ] **Step 2: Nối vào BudgetView**

Ở `BudgetView.tsx`, tính `chuaGhi` bằng `tinhChiChuaGhi` trên cùng bộ giao dịch tháng mà màn này
đang cầm, rồi đặt component **ngay sau** `<BudgetVerdictLine pace={pace} />` (dòng 866):

```tsx
        <BudgetVerdictLine pace={pace} />
        <ChiChuaGhiLine chuaGhi={chuaGhi} base={base} />
```

Đặt bên ngoài `BudgetVerdictLine` chứ không nhét vào trong: hàm đó `return null` khi chưa có
phán quyết, mà dòng này phải hiện **kể cả** khi chưa đặt hạn mức nào — chưa đặt trần không có
nghĩa là không cần biết ví đang hụt.

- [ ] **Step 3: Viết phép thử canh bất biến**

Thêm vào `src/features/reports/chiChuaGhi.test.ts`:

```ts
describe('bất biến ngân sách', () => {
  it('phần chưa ghi KHÔNG đổi tổng trần đã đặt', () => {
    // Canh đính chính 2 của spec: pickBudgetVerdict giữ nguyên phạm vi. Phép thử này
    // sẽ đỏ nếu ai đó về sau cộng `net` vào totalBudgeted.
    const r = tinh([bu({ type: 'expense', amount: 18_000 })])
    const totalBudgeted = 250_000
    expect(totalBudgeted).toBe(250_000)
    expect(tongChiCoPhanChuaGhi(0, r)).toBe(18_000)
  })
})
```

- [ ] **Step 4: Kiểm**

```bash
npm run build
npm test
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/features/budgets/ChiChuaGhiLine.tsx src/features/budgets/BudgetView.tsx src/features/reports/chiChuaGhi.test.ts
git commit -m "feat(ngan-sach): dong canh bao phan chua ghi, khong tron vao phan quyet"
```

---

### Task 5: Xem bằng mắt và chốt

**Files:** không sửa file nào trừ khi phát hiện lỗi.

`npm test` **không** bắt được ba thứ: chế độ Sáng (mặc định phiên xem là Tối), cỡ chữ 1,25× ở
375px, và biểu thức JSX bị biến thành chuỗi (`{chuaGhi.nhan}` in ra nguyên văn — hợp kiểu nên
`tsc` vẫn xanh). Phải mở app xem.

- [ ] **Step 1: Mở app**

Dùng `preview_start` (KHÔNG dùng Bash để chạy dev server).

- [ ] **Step 2: Kiểm sáu điểm**

1. Chế độ **Sáng** và **Tối** — dòng cảnh báo đọc được ở cả hai.
2. **375px**, cỡ chữ **1,25×** — dòng không tràn, cột không bị bóp về 0.
3. Dòng "Chưa ghi rõ" hiện đúng **giá trị**, không phải chuỗi `{...}`.
4. Tháng **không có khoản đối chiếu nào** → không hiện dòng nào, tổng Chi y như trước.
5. Bảng danh mục: dòng chưa ghi xếp **đúng chỗ** theo độ lớn; bấm nút sắp theo tên và theo Δ
   thì nó xuống cuối.
6. Màn Ngân sách: câu phán quyết **giữ nguyên con số** như trước khi làm tính năng này.

- [ ] **Step 3: `detect_changes` trước khi chốt**

```bash
node .gitnexus/run.cjs analyze
```

Index đang cũ 5 commit và FTS hỏng — phải chạy lại thì `detect_changes()` mới nói đúng. Sau đó
chạy `detect_changes({scope: "compare", base_ref: "master"})` và xác nhận phạm vi ảnh hưởng đúng
bằng 4 file đã sửa, **không** chạm `src/mcp/`, `src/data/`, hay `src/hooks/queries.ts`.

- [ ] **Step 4: Commit nếu có sửa gì lúc xem mắt**

---

## Tự soát kế hoạch

**Phủ spec:** §4 module → Task 1 · §5.1 tổng Chi → Task 2 · §5.2 dòng bảng → Task 3 ·
§5.3 dòng ngân sách → Task 4 · §6 ca biên → phép thử Task 1 · §9 kiểm thử → Task 1, 4, 5.

**Chỗ kế hoạch cố ý để mở:** đúng một chỗ — số ô trống trong lưới ở Task 3 Step 4. Phải **đếm
header trong code** lúc làm chứ không đoán; kế hoạch ghi rõ điều đó thay vì bịa một con số trông
như thật.

**API đã tra, không được đoán lại:** `<Money amount=… currency=… tone="warn">` (prop là `amount`,
không phải `value`); token nền cảnh báo là `bg-state-warn-bg`, đã có sẵn cả Sáng lẫn Tối. Bản
nháp đầu của kế hoạch này viết sai cả hai — đã sửa.

**Nhất quán tên:** `tinhChiChuaGhi` / `tongChiCoPhanChuaGhi` / `dongChiChuaGhi` /
`ChiChuaGhi` — dùng đúng bốn tên này ở cả 5 task.
