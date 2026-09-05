# Giá đổi bậc (mục 3) — kế hoạch thi công

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khoản lặp đều đổi giá thì app chỉ ra được — thẻ ở tab Dài hạn liệt kê từng bậc, và
một tin "đọc là mất" ở Bản tin khi bậc mới xảy ra.

**Architecture:** Một module thuần `giaDoiBac.ts` dò "hai mặt phẳng" (≥2 lần giá cũ rồi ≥2 lần
giá mới) trên hai nguồn nhóm: `recurring_rule_id` (danh tính tuyệt đối) và ghi chú sao kê nhịp
~tháng. Hai chỗ tiêu thụ: `GiaDoiBacCard` trong LongView (danh sách tĩnh, không nút) và luật
`priceStepRules` (kind `info` → tự "báo một lần", không cần bảng nhớ). Không đổi schema.

**Tech Stack:** TypeScript · React · Vitest

**Spec:** [docs/superpowers/specs/2026-09-05-gia-doi-bac-design.md](../specs/2026-09-05-gia-doi-bac-design.md)

## Global Constraints

- **Không đổi schema**, không sửa repo/queries, không đụng `src/mcp/`, không đụng
  `recurringRadar.ts`.
- So sánh giá bằng **số tiền thô cùng tài khoản** (minor units) — không tỷ giá ở tầng dò.
  Riêng KHOÁ SẮP XẾP quy về base bằng `convertToBase` (thiếu tỷ giá → xếp cuối), vì trộn
  minor units VND với JPY là sai lệch im lặng.
- Thêm luật thông báo = **`npm run bundle:rules` + commit `_rules.js`** (bài học mục 2a);
  `tests/pushBundle.test.ts` là trọng tài. Luật phải thuần (chạy được trên Deno) — không
  import React/window.
- Chữ DẠY bọc `<Guide>`; dòng DỮ LIỆU thì không (hai bài học mục 1 + trần PROSE_MAX ở
  `tests/designSystem.test.ts` canh cả hai chiều).
- Mọi số ra màn hình qua `<Money>`/`<Num>`; không chêm giá trị tuỳ ý vào class.
- Kiểm: `npx tsc -b` (KHÔNG dùng `--noEmit`), `npm test`, `npm run lint`. Không prettier.
- File CRLF/LF lẫn lộn — script thay chuỗi phải dò EOL từng file.
- Nhánh làm việc: `feat/gia-doi-bac` từ `master`.

---

### Task 1: Module thuần `giaDoiBac.ts`

**Files:**
- Create: `src/features/reports/giaDoiBac.ts`
- Test: `src/features/reports/giaDoiBac.test.ts`

**Interfaces:**
- Consumes: `PERIODS_PER_MONTH` từ `./behavior` (weekly 52/12 · monthly 1 · yearly 1/12);
  `convertToBase`, `Rates` từ `../../lib/rates`; `daysBetween` từ `../../lib/dates`;
  `TransactionRow`, `RecurringRuleRow`, `CategoryRow` từ types; `CurrencyOf` từ `./aggregate`.
- Produces:

```ts
export interface BacGia {
  /** Tên quy tắc (nguồn 1) hoặc ghi chú giao dịch (nguồn 2). */
  nhan: string
  /** Icon danh mục; null khi không có danh mục. */
  icon: string | null
  currency: CurrencyCode
  giaCu: number      // minor units, tiền của tài khoản
  giaMoi: number
  /** ISO ngày ĐẦU TIÊN trả giá mới — khoá định danh của bậc. */
  tuNgayISO: string
  /** Đã trả bao nhiêu lần theo giá mới. */
  soLanGiaMoi: number
  /** (giaMoi − giaCu) × số kỳ mỗi năm, tiền của tài khoản. Âm = nhẹ đi. */
  chenhMoiNam: number
}

export function doBacGia(
  txs: readonly TransactionRow[],
  rules: readonly RecurringRuleRow[],
  categories: readonly Pick<CategoryRow, 'id' | 'icon'>[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): BacGia[]   // sắp theo |chenhMoiNam| quy về base, giảm dần; thiếu tỷ giá xếp cuối
```

**Thuật toán mặt phẳng** (viết vào chú thích đầu file): dãy số tiền của một nhóm, theo ngày
tăng dần, nén thành các RUN liên tiếp cùng giá. Bậc tồn tại khi run CUỐI có ≥ 2 lần VÀ run
NGAY TRƯỚC nó có ≥ 2 lần. Bậc = (run trước → run cuối). `A A x B B` (một lần lệch chen giữa)
cố ý KHÔNG báo — run trước run-cuối là `x` (1 lần), không đủ mặt phẳng; thà bỏ sót còn hơn
réo tên nhầm.

- [ ] **Step 1: Viết phép thử thất bại** — tạo `giaDoiBac.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { RecurringRuleRow, TransactionRow } from '../../types/database.types'
import { doBacGia } from './giaDoiBac'

const RATES: Rates = { JPY: 1, VND: 165 }
const currencyOf = (id: string): CurrencyCode => (id === 'vnd' ? 'VND' : 'JPY')
const CATS = [{ id: 'nha', icon: '🔑' }]

let seq = 0
function tx(p: Partial<TransactionRow> & Pick<TransactionRow, 'amount' | 'occurred_on'>): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    type: 'expense',
    to_amount: null,
    category_id: 'nha',
    account_id: 'jpy',
    to_account_id: null,
    recurring_rule_id: null,
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  } as TransactionRow
}

function rule(p: Partial<RecurringRuleRow> = {}): RecurringRuleRow {
  return {
    id: 'r1',
    user_id: 'u',
    type: 'expense',
    amount: 112_760,
    to_amount: null,
    category_id: 'nha',
    account_id: 'jpy',
    to_account_id: null,
    note: 'Tiền nhà',
    frequency: 'monthly',
    start_on: '2025-09-01',
    end_on: null,
    is_paused: false,
    is_refund: false,
    ...p,
  } as RecurringRuleRow
}

/** Chuỗi tiền nhà thật: 62.760 × 6 tháng rồi 112.760 từ 2026-03. */
function tienNha(): TransactionRow[] {
  const out: TransactionRow[] = []
  const months = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']
  for (const m of months)
    out.push(tx({ amount: 62_760, occurred_on: `${m}-01`, recurring_rule_id: 'r1' }))
  for (const m of ['2026-03', '2026-04', '2026-05'])
    out.push(tx({ amount: 112_760, occurred_on: `${m}-01`, recurring_rule_id: 'r1' }))
  return out
}

const chay = (txs: TransactionRow[], rules: RecurringRuleRow[] = [rule()]) =>
  doBacGia(txs, rules, CATS, currencyOf, 'JPY', RATES)

describe('doBacGia — nguồn 1: theo quy tắc', () => {
  it('ca tiền nhà thật: 6×62.760 rồi 3×112.760 → một bậc đúng số', () => {
    const r = chay(tienNha())
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      nhan: 'Tiền nhà',
      icon: '🔑',
      currency: 'JPY',
      giaCu: 62_760,
      giaMoi: 112_760,
      tuNgayISO: '2026-03-01',
      soLanGiaMoi: 3,
      chenhMoiNam: 600_000,
    })
  })

  it('giá mới chỉ 1 lần → CHƯA báo (chưa đủ mặt phẳng)', () => {
    const txs = tienNha().filter((t) => t.occurred_on < '2026-04')
    expect(chay(txs)).toHaveLength(0)
  })

  it('giá cũ chỉ 1 lần → không báo', () => {
    const txs = [
      tx({ amount: 62_760, occurred_on: '2026-01-01', recurring_rule_id: 'r1' }),
      tx({ amount: 112_760, occurred_on: '2026-02-01', recurring_rule_id: 'r1' }),
      tx({ amount: 112_760, occurred_on: '2026-03-01', recurring_rule_id: 'r1' }),
    ]
    expect(chay(txs)).toHaveLength(0)
  })

  it('mỗi kỳ một số (tiền điện) → không báo', () => {
    const txs = [61_000, 74_000, 58_000, 69_000].map((a, i) =>
      tx({ amount: a, occurred_on: `2026-0${i + 1}-01`, recurring_rule_id: 'r1' }),
    )
    expect(chay(txs)).toHaveLength(0)
  })

  it('A→B→A: lấy bậc gần nhất (B→A)', () => {
    const dates = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01']
    const amounts = [1_000, 1_000, 1_500, 1_500, 1_000, 1_000]
    const txs = dates.map((d, i) => tx({ amount: amounts[i], occurred_on: d, recurring_rule_id: 'r1' }))
    const r = chay(txs)
    expect(r).toHaveLength(1)
    expect(r[0].giaCu).toBe(1_500)
    expect(r[0].giaMoi).toBe(1_000)
    expect(r[0].tuNgayISO).toBe('2026-05-01')
  })

  it('giảm giá → chenhMoiNam âm, vẫn báo', () => {
    const txs = [2_000, 2_000, 1_500, 1_500].map((a, i) =>
      tx({ amount: a, occurred_on: `2026-0${i + 1}-01`, recurring_rule_id: 'r1' }),
    )
    const r = chay(txs)
    expect(r[0].chenhMoiNam).toBe(-6_000)
  })

  it('quy tắc theo NĂM → chênh × 1', () => {
    const txs = [10_000, 10_000, 12_000, 12_000].map((a, i) =>
      tx({ amount: a, occurred_on: `202${3 + i}-01-01`, recurring_rule_id: 'r1' }),
    )
    const r = chay(txs, [rule({ frequency: 'yearly' })])
    expect(r[0].chenhMoiNam).toBe(2_000)
  })

  it('một lần lệch chen giữa (A A x B B) → cố ý KHÔNG báo', () => {
    const amounts = [1_000, 1_000, 1_234, 1_500, 1_500]
    const txs = amounts.map((a, i) =>
      tx({ amount: a, occurred_on: `2026-0${i + 1}-01`, recurring_rule_id: 'r1' }),
    )
    expect(chay(txs)).toHaveLength(0)
  })
})

describe('doBacGia — nguồn 2: theo ghi chú sao kê', () => {
  const ghiChu = (amounts: number[], note = 'NETFLIX.COM') =>
    amounts.map((a, i) =>
      tx({
        amount: a,
        occurred_on: `2026-0${i + 1}-15`,
        note,
        category_id: 'nha',
        recurring_rule_id: null,
      }),
    )

  it('cùng ghi chú, nhịp ~30 ngày, có bậc → báo với nhãn là ghi chú', () => {
    const r = chay(ghiChu([990, 990, 1_290, 1_290]), [])
    expect(r).toHaveLength(1)
    expect(r[0].nhan).toBe('NETFLIX.COM')
    expect(r[0].chenhMoiNam).toBe(3_600)
  })

  it('nhịp thất thường (không ~tháng) → im', () => {
    const txs = [
      tx({ amount: 990, occurred_on: '2026-01-02', note: 'X' }),
      tx({ amount: 990, occurred_on: '2026-01-09', note: 'X' }),
      tx({ amount: 1_290, occurred_on: '2026-05-01', note: 'X' }),
      tx({ amount: 1_290, occurred_on: '2026-05-03', note: 'X' }),
    ]
    expect(chay(txs, [])).toHaveLength(0)
  })

  it('ghi chú rỗng → không gom, im', () => {
    expect(chay(ghiChu([990, 990, 1_290, 1_290], ''), [])).toHaveLength(0)
  })

  it('giao dịch có rule_id KHÔNG lọt vào nhóm ghi chú (không đếm hai lần)', () => {
    const txs = ghiChu([990, 990, 1_290, 1_290]).map((t) => ({
      ...t,
      recurring_rule_id: 'r1',
      note: 'Tiền nhà',
    }))
    // nguồn 1 sẽ báo (đúng), nhưng chỉ MỘT kết quả — không có bản sao từ nguồn 2
    expect(chay(txs)).toHaveLength(1)
  })
})

describe('doBacGia — lọc và sắp', () => {
  it('bỏ dòng exclude_from_stats / is_debt_flow / hoàn tiền', () => {
    const txs = tienNha().map((t) => ({ ...t, exclude_from_stats: true }))
    expect(chay(txs)).toHaveLength(0)
  })

  it('bậc nặng hơn (quy về base) đứng trước', () => {
    const nho = [500, 500, 600, 600].map((a, i) =>
      tx({ amount: a, occurred_on: `2026-0${i + 1}-03`, note: 'NHO', recurring_rule_id: null }),
    )
    const r = chay([...tienNha(), ...nho])
    expect(r).toHaveLength(2)
    expect(r[0].nhan).toBe('Tiền nhà')
  })
})
```

- [ ] **Step 2: Chạy, xác nhận đỏ** — `npx vitest run src/features/reports/giaDoiBac.test.ts`
  → FAIL `Cannot find module './giaDoiBac'`.

- [ ] **Step 3: Cài đặt.** Khung xử lý:

```ts
// nén dãy {date, amount} đã sắp theo ngày thành các run liên tiếp cùng giá
interface Run { amount: number; count: number; firstISO: string }

function timBac(items: readonly { occurred_on: string; amount: number }[]): {
  giaCu: number; giaMoi: number; tuNgayISO: string; soLanGiaMoi: number
} | null {
  if (items.length < 4) return null
  const sorted = [...items].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
  const runs: Run[] = []
  for (const it of sorted) {
    const last = runs[runs.length - 1]
    if (last && last.amount === it.amount) last.count++
    else runs.push({ amount: it.amount, count: 1, firstISO: it.occurred_on })
  }
  if (runs.length < 2) return null
  const cuoi = runs[runs.length - 1]
  const truoc = runs[runs.length - 2]
  if (cuoi.count < 2 || truoc.count < 2) return null
  return {
    giaCu: truoc.amount,
    giaMoi: cuoi.amount,
    tuNgayISO: cuoi.firstISO,
    soLanGiaMoi: cuoi.count,
  }
}
```

Nguồn 1: gom txs có `recurring_rule_id` theo id; bỏ dòng
`exclude_from_stats / is_debt_flow / is_refund / type !== 'expense'`; `timBac` từng nhóm;
nhãn = `rule.note`, tần suất = `rule.frequency` (rule biến mất khỏi danh sách → coi như
monthly, ghi chú vì sao: bậc quá khứ vẫn là sự thật). Nguồn 2: txs KHÔNG có rule_id, note
trim ≠ rỗng, gom theo `note + ' ' + account_id + ' ' + (category_id ?? '')`; nhóm
phải nhịp ~tháng (median khoảng cách 25–35 ngày — chép đúng phép median của
[recurringRadar.ts:96](../../../src/lib/recurringRadar.ts:96)); tần suất = monthly.
`chenhMoiNam = Math.round((giaMoi − giaCu) × PERIODS_PER_MONTH[freq] × 12)`.
Sắp: khoá = `convertToBase(|chenhMoiNam|, currencyOf(account_id), base, rates)`, null xếp
cuối, giảm dần.

- [ ] **Step 4: Chạy, xác nhận xanh** — cả file test mới lẫn
  `npx vitest run src/features/reports`.

- [ ] **Step 5: Commit**

```bash
git add src/features/reports/giaDoiBac.ts src/features/reports/giaDoiBac.test.ts
git commit -m "feat(bao-cao): may do bac gia — hai mat phang, khong nguong tuy y"
```

---

### Task 2: `GiaDoiBacCard` ở tab Dài hạn

**Files:**
- Create: `src/features/reports/GiaDoiBacCard.tsx`
- Modify: `src/features/reports/LongView.tsx` (render dưới `<TripGapCard>`; LongView đã có
  `txs`, `categories`, `currencyOf`, `base`, `r`; thêm `useRecurringRules()` từ hooks)

**Interfaces:**
- Consumes: `doBacGia`, `BacGia` (Task 1); `Card`, `Money`, `Num`, `SectionTitle` từ
  `components/ui`; `Guide` từ `components/Guide`.
- Produces: `<GiaDoiBacCard txs={txs} rules={rules} categories={categories}
  currencyOf={currencyOf} base={base} rates={r} />`

- [ ] **Step 1: Component.** Không có bậc → `return null`. Có → một `Card` tiêu đề
  "Khoản lặp đều đã đổi giá", mỗi bậc một dòng:

```tsx
{items.map((b) => (
  <li key={`${b.nhan}:${b.tuNgayISO}`} className="flex flex-col gap-0.5 py-2">
    <div className="flex items-baseline justify-between gap-2">
      <span className="min-w-0 truncate text-sm text-fg-primary">
        {b.icon && <span aria-hidden className="mr-1.5">{b.icon}</span>}
        {b.nhan}
      </span>
      <span className="shrink-0 font-mono text-sm">
        <Money amount={b.giaCu} currency={b.currency} className="text-fg-muted" />
        <span className="text-fg-muted"> → </span>
        <Money amount={b.giaMoi} currency={b.currency} tone={b.chenhMoiNam > 0 ? 'warn' : 'in'} />
      </span>
    </div>
    <p className="text-2xs text-fg-muted">
      Đổi từ {b.tuNgayISO.slice(0, 7).replace('-', '/')} · đã trả{' '}
      <Num tone="neutral">{b.soLanGiaMoi}</Num> lần theo giá mới ·{' '}
      <Money
        amount={b.chenhMoiNam}
        currency={b.currency}
        showSign
        tone={b.chenhMoiNam > 0 ? 'warn' : 'in'}
      />
      /năm
    </p>
  </li>
))}
```

  Ba điều đã tra sẵn, đừng tra lại: `<Money>` prop là `amount`, `tone="warn"` hợp lệ,
  `showSign` chỉ dùng khi amount DƯƠNG — nên với `chenhMoiNam` (có dấu sẵn) **đừng bật
  `showSign`**, hãy để `formatMoney` tự in dấu âm; số dương thì thêm dấu `+` bằng chữ
  trước `<Money>`. Mở `Money.tsx` đọc JSDoc `showSign` rồi chọn cách đúng — viết sai là
  ra `--` hoặc thiếu dấu `+`.

  Câu giải thích cách đọc thẻ (nếu muốn thêm) PHẢI bọc `<Guide>`; dòng dữ liệu thì không.

- [ ] **Step 2: Nối LongView.** Thêm `const { data: recurringRules = [] } =
  useRecurringRules()` (import từ hooks/queries — LongView chưa có, thêm vào block import
  sẵn có), render ngay dưới `<TripGapCard … />`:

```tsx
      <GiaDoiBacCard
        txs={txs}
        rules={recurringRules}
        categories={categories}
        currencyOf={currencyOf}
        base={base}
        rates={r}
      />
```

- [ ] **Step 3: Kiểm** — `npx tsc -b`, `npx vitest run`, `npm run lint`. Chú ý trần
  PROSE_MAX: nếu đỏ vì đoạn văn mới, xét nó là chữ dạy (bọc Guide) hay nhãn dữ liệu
  (nâng trần kèm lý do) — đừng tự động nâng.

- [ ] **Step 4: Commit**

```bash
git add src/features/reports/GiaDoiBacCard.tsx src/features/reports/LongView.tsx
git commit -m "feat(bao-cao): the 'khoan lap deu da doi gia' o tab Dai han"
```

---

### Task 3: Tin `'price-step'` ở Bản tin

**Files:**
- Create: `src/features/notifications/rules/priceStepRules.ts`
- Create: `src/features/notifications/rules/priceStepRules.test.ts`
- Modify: `src/features/notifications/types.ts` (union + `NOTIFICATION_TYPES` + META)
- Modify: `src/features/notifications/rules.ts` (đăng ký `...priceStepRules(input)`)
- Modify: `supabase/functions/push-notify/_rules.js` (sinh bởi `npm run bundle:rules`)

**Interfaces:**
- Consumes: `doBacGia` (Task 1); `NotificationInput` đã có sẵn `recurringRules`,
  `categories`, `recentTxs`, `currencyOf`, `base`, `rates`, `formatMoney`.
- Produces: type `'price-step'`, kind `'info'`, severity `'low'`.

- [ ] **Step 1: types.ts — ba chỗ.** Union: thêm `| 'price-step'`. `NOTIFICATION_TYPES`:
  thêm `'price-step'` NGAY SAU `'trend-level-shift'` (cùng họ tin nhiều-tháng, và
  trend-level-shift đang đứng cuối có lý do — đọc chú thích tại chỗ trước khi chèn). META:

```ts
  'price-step': {
    badge: 'ĐỔI GIÁ',
    source: 'Báo cáo · Dài hạn',
    kind: 'info',
    label: 'Khoản lặp đều vừa đổi giá',
    hint: 'Một khoản trả đều đặn vừa chuyển sang mức giá mới — tăng hay giảm đều báo, mỗi bậc đúng một lần.',
  },
```

  KHÔNG có `cta` — tin để biết, cả dòng đã là link (đọc chú thích JSDoc của `cta` trong
  types.ts: chỉ `kind: 'action'` mới bắt buộc có).

- [ ] **Step 2: priceStepRules.ts**

```ts
// Khoản lặp đều vừa đổi giá (spec 2026-09-05-gia-doi-bac §5.2).
//
// kind 'info' CHÍNH LÀ cơ chế "báo một lần": key gắn vào ngày đổi bậc, tin đọc là mất,
// cùng bậc không bao giờ sinh key thứ hai — không cần bảng nhớ nào.
//
// Cửa sổ recentTxs (90 ngày) phải chứa đủ 2+2 lần quanh bậc → chỉ bậc MỚI (~2 tháng
// gần nhất) mới nổ tin; bậc cũ nằm ở thẻ tab Dài hạn, không làm phiền Bản tin.
import { doBacGia } from '../../reports/giaDoiBac'
import type { AppNotification, NotificationInput } from '../types'

export function priceStepRules(input: NotificationInput): AppNotification[] {
  const { recentTxs, recurringRules, categories, currencyOf, base, rates, formatMoney } = input
  const bacs = doBacGia(recentTxs, recurringRules, categories, currencyOf, base, rates)
  return bacs.map((b) => ({
    key: `price-step:${b.nhan}:${b.tuNgayISO}`,
    kind: 'info' as const,
    type: 'price-step' as const,
    severity: 'low' as const,
    title: `${b.nhan} đổi giá: ${formatMoney(b.giaCu, b.currency)} → ${formatMoney(b.giaMoi, b.currency)}`,
    detail: `${b.chenhMoiNam > 0 ? 'Nặng thêm' : 'Nhẹ đi'} ${formatMoney(Math.abs(b.chenhMoiNam), b.currency)}/năm nếu giữ giá này.`,
    onISO: b.tuNgayISO,
    to: '/reports?view=long',
  }))
}
```

- [ ] **Step 3: Test** — `priceStepRules.test.ts`, chép khuôn `input()` từ
  `tripRules.test.ts` (file cạnh bên, cùng cấu trúc):

```ts
describe('priceStepRules', () => {
  it('bậc trong cửa sổ → 1 tin info, key mang ngày đổi', () => {
    const n = priceStepRules(inputVoiBac())   // 2×62.760 rồi 2×112.760, rule 'Tiền nhà'
    expect(n).toHaveLength(1)
    expect(n[0].kind).toBe('info')
    expect(n[0].type).toBe('price-step')
    expect(n[0].key).toContain('Tiền nhà')
    expect(n[0].to).toBe('/reports?view=long')
  })

  it('không bậc → im', () => {
    expect(priceStepRules(inputKhongBac())).toEqual([])
  })
})
```

  (`inputVoiBac`/`inputKhongBac` dựng tại chỗ bằng helper của file — viết đủ, không import
  chéo giữa hai file test.)

- [ ] **Step 4: Đăng ký + bundle.** `rules.ts`: `...priceStepRules(input),` cạnh
  `...tripRules(input),`. Rồi:

```bash
npm run bundle:rules
npx vitest run tests/pushBundle.test.ts
```

- [ ] **Step 5: Kiểm toàn bộ + commit**

```bash
npx tsc -b && npx vitest run && npm run lint
git add src/features/notifications supabase/functions/push-notify/_rules.js
git commit -m "feat(thong-bao): tin 'price-step' — bao dung mot lan khi khoan lap deu doi gia"
```

---

### Task 4: Xem bằng mắt + detect_changes + chốt

- [ ] **Step 1: Mở app demo** (`preview_start`, server có thể còn chạy — kiểm
  `tabs_context` trước).

- [ ] **Step 2: Dựng kịch bản thật.** Demo seed có tiền nhà lặp hàng tháng (¥68.000 —
  thấy trong dữ liệu demo lúc kiểm mục 2a). Sửa GIÁ của quy tắc/giao dịch tiền nhà 2 tháng
  gần nhất bằng chính UI app (mở giao dịch → sửa số tiền), tạo mặt phẳng mới 2 lần → thẻ
  và tin phải nổ. Nếu demo không tiện, dùng chuỗi có sẵn nào lặp đều rồi sửa 2 lần cuối.

- [ ] **Step 3: Kiểm sáu điểm.**
  1. Tab Dài hạn hiện thẻ với đúng giá cũ → mới, "đã trả N lần", ±/năm.
  2. Bản tin hiện tin "đổi giá" ở nhóm tin-để-biết; đọc xong biến mất (đúng nghĩa info).
  3. Giảm giá → tone xanh (`in`), chữ "Nhẹ đi".
  4. Sáng/Tối + 375px×1,25: dòng dài ("NETFLIX.COM…") truncate chứ không tràn.
  5. Console không lỗi MỚI (`read_console_messages` — nhớ hai xác chết HMR cũ nếu server
     chưa restart).
  6. Không hiện gì khi không có bậc — reload demo sạch (resetDemoData) xem tab y hệt cũ.

- [ ] **Step 4:** `node .gitnexus/run.cjs analyze` rồi
  `detect_changes({scope:"compare", base_ref:"master"})` — phạm vi chỉ được nằm trong
  `features/reports/*`, `features/notifications/*`, `_rules.js`, tests. KHÔNG `src/mcp/`,
  KHÔNG `src/data/`. Commit `chore(gitnexus)` cho CLAUDE.md/AGENTS.md như lệ.

- [ ] **Step 5: finishing-a-development-branch** — suite xanh → menu gộp/PR/giữ.

---

## Tự soát kế hoạch

**Phủ spec:** §3 hai-mặt-phẳng → Task 1 (timBac + 8 test) · §4 hai nguồn → Task 1 ·
§5.1 thẻ → Task 2 · §5.2 tin info → Task 3 · §6 ca biên → test Task 1 (A→B→A, rule năm,
ghi chú rỗng, không đếm hai lần) · bundle:rules → Task 3 Step 4 (ghi trong spec §5.2).

**Điểm phải tra tại chỗ:** JSDoc `showSign` của Money.tsx (Task 2 Step 1 nói rõ vì sao) ·
chú thích cuối `NOTIFICATION_TYPES` trước khi chèn vị trí · khuôn `input()` của
tripRules.test.ts.

**Nhất quán tên:** `doBacGia` / `BacGia` / `timBac` / `GiaDoiBacCard` / `priceStepRules` /
`'price-step'` — đúng bộ này ở cả 4 task.
