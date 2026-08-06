# Thu gọn khối Thẻ tín dụng — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khối "Thẻ tín dụng" ở tab Hiện tại của trang Tài sản mặc định thu gọn, chỉ hiện tổng tiền bị rút kỳ này + ngày đến hạn gần nhất; bấm vào thì xổ ra chi tiết từng thẻ như hiện nay.

**Architecture:** Tách khối thẻ khỏi `AssetsNowView.tsx` (709 dòng) thành hai file: một hàm thuần `cardsSummary.ts` tính con số tóm tắt (có test), và một component `CardsSection.tsx` giữ state đóng/mở cùng toàn bộ JSX. `AssetsNowView` chỉ còn gọi một dòng.

**Tech Stack:** React 19 + TypeScript, Tailwind, lucide-react icons, Vitest, react-router-dom.

## Global Constraints

- Mọi comment và chữ trên màn hình viết bằng **tiếng Việt**, giống phần còn lại của `src/features/assets/`.
- Tiền tệ dùng **minor units** (số nguyên). JPY và VND có `decimals: 0`, USD có `decimals: 2` (xem `src/lib/currencies.ts`).
- `convertToBase(minor, from, base, rates)` nằm ở `src/lib/rates.ts` và trả `number | null` (null = thiếu tỷ giá). Quy ước `rates`: `rates[X]` = số đơn vị X đổi được từ 1 đơn vị base.
- Test chạy bằng `npm test` (Vitest). Lint bằng `npm run lint` (oxlint). Kiểm kiểu bằng `npx tsc -b`.
- Không đổi cách tính nợ thẻ (`cardStatement.ts`), badge đủ/thiếu từng thẻ, khối Tổng tài sản / Tài sản ròng / Cơ cấu tài sản, hay phần kéo–thả tài khoản.
- Trạng thái đóng/mở **không** lưu vào localStorage — mỗi lần vào trang đều thu gọn.

## File Structure

| File | Vai trò |
|---|---|
| `src/features/assets/cardsSummary.ts` | **Tạo mới.** Hàm thuần: nhận danh sách thẻ + kết quả chia kỳ + kết quả đối chiếu nguồn → trả con số tóm tắt cho dòng thu gọn. |
| `src/features/assets/cardsSummary.test.ts` | **Tạo mới.** Test cho hàm trên. |
| `src/features/assets/CardsSection.tsx` | **Tạo mới.** Component khối thẻ: state đóng/mở + toàn bộ JSX (chuyển từ `AssetsNowView`). |
| `src/features/assets/AssetsNowView.tsx` | **Sửa.** Bỏ ~170 dòng JSX thẻ và các phép tính đi kèm, thay bằng `<CardsSection … />`. |

---

### Task 1: Hàm thuần `cardsSummary`

**Files:**
- Create: `src/features/assets/cardsSummary.ts`
- Test: `src/features/assets/cardsSummary.test.ts`

**Interfaces:**

- Consumes (đã có sẵn trong repo, không tạo mới):
  - `CardLiability` từ `./aggregate` — các field cần dùng: `id: string`, `name: string`, `currency: CurrencyCode`, `balance: number`, `baseValue: number | null`, `creditLimit: number | null`, `paymentDueDay: number | null`, `statementDay: number | null`, `paymentAccountId: string | null`, `includeInTotals: boolean`, `hidden: boolean`.
  - `CardFundingResult` từ `./aggregate` — `{ byCard: Map<string, CardFundingItem>; groups: CardSourceGroup[] }`; `CardFundingItem` có `enough: boolean` và `shortfall: number`.
  - `CardStatementSplit` từ `./cardStatement` — `{ totalOwed: number; dueISO: string | null; closeISO: string | null; billed: number | null; unbilled: number | null }`.
  - `convertToBase(minor: number, from: CurrencyCode, base: CurrencyCode, rates: Rates): number | null` và `type Rates` từ `../../lib/rates`.
  - `type CurrencyCode` từ `../../lib/currencies`.
- Produces (Task 2 dùng): `cardsSummary(cards, statements, funding, base, rates): CardsSummary` và `interface CardsSummary`.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/features/assets/cardsSummary.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CardFundingResult, CardLiability } from './aggregate'
import type { CardStatementSplit } from './cardStatement'
import { cardsSummary } from './cardsSummary'

function card(over: Partial<CardLiability> & { id: string }): CardLiability {
  return {
    name: `Thẻ ${over.id}`,
    currency: 'JPY',
    balance: 0,
    baseValue: 0,
    creditLimit: null,
    paymentDueDay: 27,
    statementDay: 31,
    paymentAccountId: null,
    includeInTotals: true,
    hidden: false,
    ...over,
  }
}

function split(over: Partial<CardStatementSplit>): CardStatementSplit {
  return { totalOwed: 0, dueISO: null, closeISO: null, billed: null, unbilled: null, ...over }
}

/** funding rỗng = không thẻ nào có nguồn trả hợp lệ → không badge thiếu tiền */
const NO_FUNDING: CardFundingResult = { byCard: new Map(), groups: [] }

function fundingOf(entries: [string, { enough: boolean; shortfall: number }][]): CardFundingResult {
  return {
    byCard: new Map(
      entries.map(([id, f]) => [
        id,
        {
          sourceId: 'src',
          sourceName: 'Nguồn',
          currency: 'JPY' as const,
          sourceBalance: 0,
          owed: 0,
          shared: false,
          enough: f.enough,
          shortfall: f.shortfall,
        },
      ]),
    ),
    groups: [],
  }
}

describe('cardsSummary', () => {
  it('một thẻ cùng base currency: lấy đúng billed, không cần dấu ≈', () => {
    const cards = [card({ id: 'a', currency: 'JPY' })]
    const statements = new Map([['a', split({ totalOwed: 120_000, billed: 82_000, dueISO: '2026-08-27' })]])

    const s = cardsSummary(cards, statements, NO_FUNDING, 'JPY', {})

    expect(s.billedBase).toBe(82_000)
    expect(s.approx).toBe(false)
    expect(s.nextDueISO).toBe('2026-08-27')
  })

  it('hai thẻ khác loại tiền: cộng sau khi quy đổi và bật dấu ≈', () => {
    // ¥1 = 170₫ → 340.000₫ = ¥2.000
    const cards = [card({ id: 'a', currency: 'JPY' }), card({ id: 'b', currency: 'VND' })]
    const statements = new Map([
      ['a', split({ totalOwed: 10_000, billed: 10_000, dueISO: '2026-08-27' })],
      ['b', split({ totalOwed: 340_000, billed: 340_000, dueISO: '2026-09-05' })],
    ])

    const s = cardsSummary(cards, statements, NO_FUNDING, 'JPY', { VND: 170 })

    expect(s.billedBase).toBe(12_000)
    expect(s.approx).toBe(true)
  })

  it('thiếu tỷ giá: bật ≈ và không cộng thẻ đó vào tổng', () => {
    const cards = [card({ id: 'a', currency: 'JPY' }), card({ id: 'b', currency: 'VND' })]
    const statements = new Map([
      ['a', split({ totalOwed: 10_000, billed: 10_000, dueISO: '2026-08-27' })],
      ['b', split({ totalOwed: 340_000, billed: 340_000, dueISO: '2026-09-05' })],
    ])

    const s = cardsSummary(cards, statements, NO_FUNDING, 'JPY', {})

    expect(s.billedBase).toBe(10_000)
    expect(s.approx).toBe(true)
  })

  it('thẻ chưa đặt ngày chốt (billed null): rơi về toàn bộ dư nợ', () => {
    const cards = [card({ id: 'a', statementDay: null })]
    const statements = new Map([['a', split({ totalOwed: 55_000, billed: null, dueISO: '2026-08-27' })]])

    const s = cardsSummary(cards, statements, NO_FUNDING, 'JPY', {})

    expect(s.billedBase).toBe(55_000)
  })

  it('không thẻ nào đang nợ: billedBase và nextDueISO đều null', () => {
    const cards = [card({ id: 'a' }), card({ id: 'b' })]
    const statements = new Map([
      ['a', split({ totalOwed: 0, billed: 0, dueISO: '2026-08-27' })],
      ['b', split({ totalOwed: 0, billed: 0, dueISO: '2026-09-05' })],
    ])

    const s = cardsSummary(cards, statements, NO_FUNDING, 'JPY', {})

    expect(s.billedBase).toBeNull()
    expect(s.nextDueISO).toBeNull()
  })

  it('nextDueISO là ngày sớm nhất, bỏ qua thẻ không nợ', () => {
    const cards = [card({ id: 'a' }), card({ id: 'b' }), card({ id: 'c' })]
    const statements = new Map([
      // thẻ hết nợ tuy có ngày sớm nhất → không được tính
      ['a', split({ totalOwed: 0, billed: 0, dueISO: '2026-08-10' })],
      ['b', split({ totalOwed: 1_000, billed: 1_000, dueISO: '2026-09-05' })],
      ['c', split({ totalOwed: 2_000, billed: 2_000, dueISO: '2026-08-27' })],
    ])

    const s = cardsSummary(cards, statements, NO_FUNDING, 'JPY', {})

    expect(s.nextDueISO).toBe('2026-08-27')
    expect(s.billedBase).toBe(3_000)
  })

  it('đúng một thẻ thiếu tiền: trả số thiếu kèm loại tiền của thẻ đó', () => {
    const cards = [card({ id: 'a' }), card({ id: 'b' })]
    const statements = new Map([
      ['a', split({ totalOwed: 20_000, billed: 20_000, dueISO: '2026-08-27' })],
      ['b', split({ totalOwed: 5_000, billed: 5_000, dueISO: '2026-08-27' })],
    ])
    const funding = fundingOf([
      ['a', { enough: false, shortfall: 12_000 }],
      ['b', { enough: true, shortfall: 0 }],
    ])

    const s = cardsSummary(cards, statements, funding, 'JPY', {})

    expect(s.shortCount).toBe(1)
    expect(s.singleShortfall).toEqual({ amount: 12_000, currency: 'JPY' })
  })

  it('từ hai thẻ thiếu tiền trở lên: singleShortfall null vì có thể khác loại tiền', () => {
    const cards = [card({ id: 'a' }), card({ id: 'b', currency: 'VND' })]
    const statements = new Map([
      ['a', split({ totalOwed: 20_000, billed: 20_000, dueISO: '2026-08-27' })],
      ['b', split({ totalOwed: 340_000, billed: 340_000, dueISO: '2026-08-27' })],
    ])
    const funding = fundingOf([
      ['a', { enough: false, shortfall: 12_000 }],
      ['b', { enough: false, shortfall: 170_000 }],
    ])

    const s = cardsSummary(cards, statements, funding, 'JPY', { VND: 170 })

    expect(s.shortCount).toBe(2)
    expect(s.singleShortfall).toBeNull()
  })

  it('thẻ hết nợ thì không tính là thiếu tiền dù funding báo không đủ', () => {
    const cards = [card({ id: 'a' })]
    const statements = new Map([['a', split({ totalOwed: 0, billed: 0, dueISO: '2026-08-27' })]])
    const funding = fundingOf([['a', { enough: false, shortfall: 999 }]])

    const s = cardsSummary(cards, statements, funding, 'JPY', {})

    expect(s.shortCount).toBe(0)
    expect(s.singleShortfall).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy test để thấy nó fail**

```bash
npm test -- cardsSummary
```

Expected: FAIL — `Failed to resolve import "./cardsSummary"` (file chưa tồn tại).

- [ ] **Step 3: Viết `cardsSummary.ts`**

Tạo `src/features/assets/cardsSummary.ts`:

```ts
// Tóm tắt khối Thẻ tín dụng thành đúng những gì dòng thu gọn cần hiện:
// "kỳ này bị rút bao nhiêu · ngày nào · có thẻ nào thiếu tiền không".
//
// Tách khỏi component vì cộng tiền nhiều loại tiền tệ và chọn ngày sớm nhất là
// chỗ dễ sai lặng lẽ (thiếu tỷ giá thì tổng thiếu mà không ai biết), nên phải
// test được mà không dựng React.
import type { CurrencyCode } from '../../lib/currencies'
import { convertToBase, type Rates } from '../../lib/rates'
import type { CardFundingResult, CardLiability } from './aggregate'
import type { CardStatementSplit } from './cardStatement'

export interface CardsSummary {
  /**
   * Tổng tiền sẽ bị rút ở kỳ tới, quy về base currency (minor units).
   * null = KHÔNG thẻ nào đang nợ. Thẻ nợ mà thiếu tỷ giá vẫn cho ra số (đã cộng
   * phần quy đổi được) kèm `approx` = true, để không nhầm với "chưa phát sinh nợ".
   */
  billedBase: number | null
  /** true = cần in dấu ≈ (có thẻ ngoại tệ hoặc thiếu tỷ giá) */
  approx: boolean
  /** Ngày đến hạn sớm nhất trong các thẻ ĐANG NỢ; null = không có */
  nextDueISO: string | null
  /** Số thẻ đang nợ mà nguồn trả không đủ tiền */
  shortCount: number
  /** Chỉ khi đúng 1 thẻ thiếu — nhiều thẻ thì không cộng được vì có thể khác loại tiền */
  singleShortfall: { amount: number; currency: CurrencyCode } | null
}

/**
 * `cards` phải là danh sách đã lọc thẻ ẩn. Thẻ "ngoài tổng" (`includeInTotals`
 * false) VẪN được cộng: tiền vẫn rời tài khoản vào ngày đến hạn, khác với Tài
 * sản ròng nơi cờ đó quyết định có trừ hay không.
 */
export function cardsSummary(
  cards: CardLiability[],
  statements: Map<string, CardStatementSplit>,
  funding: CardFundingResult,
  base: CurrencyCode,
  rates: Rates,
): CardsSummary {
  let billedBase: number | null = null
  let approx = false
  let nextDueISO: string | null = null
  let shortCount = 0
  let singleShortfall: CardsSummary['singleShortfall'] = null

  for (const c of cards) {
    const st = statements.get(c.id)
    const owed = st?.totalOwed ?? 0
    if (owed <= 0) continue

    // Thẻ đủ ngày chốt/ngày trả mới chia được kỳ; thiếu thì rơi về toàn bộ dư nợ.
    const due = st?.billed ?? owed
    if (c.currency !== base) approx = true
    const inBase = convertToBase(due, c.currency, base, rates)
    billedBase = billedBase ?? 0
    if (inBase == null) approx = true
    else billedBase += inBase

    if (st?.dueISO != null && (nextDueISO == null || st.dueISO < nextDueISO)) {
      nextDueISO = st.dueISO
    }

    const f = funding.byCard.get(c.id)
    if (f && !f.enough) {
      shortCount++
      singleShortfall =
        shortCount === 1 ? { amount: f.shortfall, currency: c.currency } : null
    }
  }

  return { billedBase, approx, nextDueISO, shortCount, singleShortfall }
}
```

- [ ] **Step 4: Chạy test để thấy nó pass**

```bash
npm test -- cardsSummary
```

Expected: PASS — 9 tests passed.

- [ ] **Step 5: Kiểm kiểu và lint**

```bash
npx tsc -b && npm run lint
```

Expected: không lỗi.

- [ ] **Step 6: Commit**

```bash
git add src/features/assets/cardsSummary.ts src/features/assets/cardsSummary.test.ts
git commit -m "feat(tai san): them cardsSummary tinh so tom tat khoi the tin dung

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Component `CardsSection` đóng/mở + nối vào trang

**Files:**
- Create: `src/features/assets/CardsSection.tsx`
- Modify: `src/features/assets/AssetsNowView.tsx` (bỏ import thừa ở dòng 9–22, bỏ khối tính toán dòng 245–259, thay `<section>` dòng 344–509)

**Interfaces:**
- Consumes: `cardsSummary` / `CardsSummary` (Task 1); `cardFunding`, `CardLiability` từ `./aggregate`; `useCardStatements` từ `./useCardStatements`; `Money` từ `../../components/ui`; `formatMoney` từ `../../lib/money`; `dueDateLabel(iso)` và `dueRelativeLabel(todayISO, dueISO)` từ `../../lib/dates`; `AccountBalanceRow` từ `../../types/database.types`.
- Produces: `<CardsSection cards balances base rates todayISO />`.

- [ ] **Step 1: Tạo `CardsSection.tsx`**

Tạo `src/features/assets/CardsSection.tsx` với nguyên văn:

```tsx
// Khối "Thẻ tín dụng" của tab Hiện tại — thu gọn mặc định, bấm mới xổ chi tiết.
//
// Tách khỏi AssetsNowView vì khối này tự gánh hai phép tính riêng (chia kỳ sao kê
// và đối chiếu nguồn trả) cùng ~170 dòng JSX; để chung thì mỗi lần sửa phải cuộn
// qua cả phần kéo–thả tài khoản không liên quan.
//
// Vì sao thu gọn: thường ngày chỉ cần biết "kỳ này bị rút bao nhiêu, ngày nào".
// Chi tiết từng thẻ (nguồn trả, hạn mức, phần chưa chốt) chỉ cần khi sắp tới hạn,
// mà mở sẵn thì nó đẩy Cơ cấu tài sản và danh sách nhóm xuống rất sâu.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, CreditCard } from 'lucide-react'
import { Money } from '../../components/ui'
import type { CurrencyCode } from '../../lib/currencies'
import { dueDateLabel, dueRelativeLabel } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { AccountBalanceRow } from '../../types/database.types'
import { cardFunding, type CardLiability } from './aggregate'
import { cardsSummary } from './cardsSummary'
import { useCardStatements } from './useCardStatements'

interface Props {
  /** Thẻ đã lọc bỏ thẻ ẩn — nơi gọi tự lọc. */
  cards: CardLiability[]
  /** Số dư mọi tài khoản, để tra tài khoản nguồn trả thẻ. */
  balances: AccountBalanceRow[]
  base: CurrencyCode
  rates: Rates
  todayISO: string
}

export function CardsSection({ cards, balances, base, rates, todayISO }: Props) {
  const [open, setOpen] = useState(false)

  // Chia dư nợ thành kỳ đã chốt (sắp bị rút) và phần chưa chốt
  const statements = useCardStatements(cards, todayISO)
  // Đối chiếu tiền trả thẻ: phân bổ số dư nguồn cho các thẻ dùng chung → badge nhất quán.
  // Đo theo số của KỲ NÀY, vì đó mới là số rời tài khoản vào ngày đến hạn.
  const cardSources = new Map(
    balances.map((b) => [
      b.id,
      { id: b.id, name: b.name, currency: b.currency, balance: b.balance },
    ]),
  )
  const billedByCard = new Map(
    [...statements].flatMap(([id, s]) => (s.billed == null ? [] : [[id, s.billed] as const])),
  )
  const funding = cardFunding(cards, cardSources, billedByCard)
  // Chỉ tổng gộp khi ≥2 thẻ chung nguồn và đang thực nợ (dòng "cần nạp thêm")
  const sharedSources = funding.groups.filter((g) => g.cardCount >= 2 && g.totalOwed > 0)
  const summary = cardsSummary(cards, statements, funding, base, rates)

  // Hook phải chạy vô điều kiện nên mới thoát ở đây, không thoát sớm phía trên.
  if (cards.length === 0) return null

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="block w-full text-left"
      >
        <div className="flex items-center gap-1.5">
          <CreditCard className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Thẻ tín dụng
          </h2>
          <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 py-0.5 text-3xs font-medium text-fg-on-track">
            {cards.length}
          </span>
          {/* Badge thiếu tiền phải thấy được cả khi thu gọn: đây là khối DUY NHẤT
              trên trang có hạn chót, giấu đi thì người dùng lỡ ngày trả. */}
          {summary.shortCount > 0 && (
            <span className="ml-auto shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-2xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {summary.singleShortfall
                ? `thiếu ${formatMoney(summary.singleShortfall.amount, summary.singleShortfall.currency)}`
                : `${summary.shortCount} thẻ thiếu tiền`}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-fg-muted transition-transform ${
              summary.shortCount > 0 ? 'ml-1' : 'ml-auto'
            } ${open ? 'rotate-180' : ''}`}
          />
        </div>

        {/* Dòng tổng — con số duy nhất cần khi không mở chi tiết */}
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {summary.billedBase == null ? (
            <span className="text-sm font-medium text-fg-muted">Chưa phát sinh nợ</span>
          ) : (
            <>
              <span className="text-xs text-fg-muted">Kỳ này</span>
              <Money
                amount={summary.billedBase}
                currency={base}
                tone="out"
                approx={summary.approx}
                className="text-xl font-bold"
              />
              {summary.nextDueISO && (
                <span className="ml-auto text-xs text-fg-muted">
                  Đến hạn{' '}
                  <span className="font-semibold text-gray-700 dark:text-gray-200">
                    {dueDateLabel(summary.nextDueISO)}
                  </span>
                  <span className="text-fg-muted">
                    {' '}· {dueRelativeLabel(todayISO, summary.nextDueISO)}
                  </span>
                </span>
              )}
            </>
          )}
        </div>
      </button>

      {open && (
        <div className="mt-3">
          {/* Tổng theo ngân hàng nguồn — con số cần khi chuyển tiền vào để thanh toán */}
          {sharedSources.length > 0 && (
            <div className="mb-3 space-y-2">
              {sharedSources.map((g) => (
                <div
                  key={g.sourceId}
                  className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Trả {g.cardCount} thẻ từ {g.sourceName}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${
                        g.enough
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      }`}
                    >
                      {g.enough ? 'đủ trả' : `cần nạp thêm ${formatMoney(g.shortfall, g.currency)}`}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-fg-muted">
                    {/* Đã là tổng KỲ NÀY (cardFunding nhận override billed), không phải nợ gộp */}
                    <span>Kỳ này {g.cardCount} thẻ</span>
                    <span className="tabular-nums font-medium text-money-out">
                      − {formatMoney(g.totalOwed, g.currency)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-fg-muted">
                    <span>Số dư {g.sourceName}</span>
                    <span className="tabular-nums">{formatMoney(g.sourceBalance, g.currency)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <ul className="space-y-3">
            {cards.map((c) => {
              const st = statements.get(c.id)
              const owed = st?.totalOwed ?? 0 // toàn bộ dư nợ (currency gốc)
              // Kỳ này = số bị rút vào ngày đến hạn; null khi thẻ chưa đặt ngày chốt/trả
              const billed = st?.billed ?? null
              const unbilled = st?.unbilled ?? 0
              // Hạn mức bị chiếm bởi CẢ phần chưa chốt, nên trừ theo tổng nợ
              const available = c.creditLimit != null ? c.creditLimit - owed : null
              // Đối chiếu nguồn trả thẻ (đã phân bổ nếu dùng chung nguồn)
              const f = funding.byCard.get(c.id)
              // Ngày đến hạn trả kế tiếp (đã dời T7/CN sang T2)
              const dueISO = st?.dueISO ?? null
              return (
                <li key={c.id}>
                  <Link
                    to={`/assets/account/${c.id}`}
                    className="block rounded-xl px-2 py-2 transition hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    {/* Tên thẻ + trạng thái đủ/thiếu tiền trả */}
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 shrink-0 text-fg-muted" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                        {c.name}
                        {!c.includeInTotals && (
                          <span className="ml-1 text-3xs font-normal text-fg-muted">
                            (ngoài tổng)
                          </span>
                        )}
                      </span>
                      {owed > 0 && f && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${
                            f.enough
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          }`}
                        >
                          {f.enough ? 'đủ trả' : `thiếu ${formatMoney(f.shortfall, c.currency)}`}
                        </span>
                      )}
                    </div>

                    {/* Số bị rút kỳ tới (nổi bật) + ngày đến hạn.
                        Thẻ đủ ngày chốt/trả hiện "Kỳ này" = số thật sự rời tài khoản;
                        thẻ thiếu ngày không chia được kỳ nên rơi về tổng "Cần trả". */}
                    <div className="mt-1.5 ml-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      {owed > 0 ? (
                        <>
                          <span className="text-xs text-fg-muted">
                            {billed != null ? 'Kỳ này' : 'Cần trả'}
                          </span>
                          <Money
                            amount={billed ?? owed}
                            currency={c.currency}
                            tone={(billed ?? owed) > 0 ? 'out' : 'neutral'}
                            className="text-xl font-bold"
                          />
                        </>
                      ) : (
                        <span className="text-sm font-medium text-fg-muted">
                          Chưa phát sinh nợ
                        </span>
                      )}
                      {owed > 0 && dueISO && (
                        <span className="ml-auto text-xs text-fg-muted">
                          Đến hạn{' '}
                          <span className="font-semibold text-gray-700 dark:text-gray-200">
                            {dueDateLabel(dueISO)}
                          </span>
                          <span className="text-fg-muted">
                            {' '}· {dueRelativeLabel(todayISO, dueISO)}
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Phần quẹt sau ngày chốt — kỳ sau mới đòi, KHÔNG bị rút lần này */}
                    {billed != null && unbilled > 0 && (
                      <p className="mt-1 ml-6 text-xs text-fg-muted">
                        Chưa chốt{' '}
                        <Money amount={unbilled} currency={c.currency} className="font-medium" />
                        {billed > 0
                          ? ` · tổng nợ ${formatMoney(owed, c.currency)}`
                          : ' — kỳ sau mới đòi'}
                      </p>
                    )}

                    {/* Nguồn trả + hạn mức còn lại */}
                    {(f || available != null) && (
                      <p className="mt-1 ml-6 text-xs text-fg-muted">
                        {f && (
                          <>
                            Trả từ {f.sourceName}
                            {!f.shared && (
                              <>
                                {' '}· số dư{' '}
                                <span className="tabular-nums">
                                  {formatMoney(f.sourceBalance, c.currency)}
                                </span>
                              </>
                            )}
                          </>
                        )}
                        {f && available != null && ' · '}
                        {available != null && (
                          <>
                            còn dùng được{' '}
                            <span className="tabular-nums">{formatMoney(available, c.currency)}</span>
                          </>
                        )}
                      </p>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Bỏ khối thẻ khỏi `AssetsNowView.tsx`**

Trong `src/features/assets/AssetsNowView.tsx`:

**2a.** Xóa nguyên khối `<section>` Thẻ tín dụng (từ dòng bắt đầu bằng comment `{/* Thẻ tín dụng — khối DUY NHẤT trên trang có hạn chót` tới `)}` đóng ngay sau `</section>` của khối đó — hiện là dòng 344–509) và thay bằng:

```tsx
      {/* Thẻ tín dụng — khối DUY NHẤT trên trang có hạn chót ("còn N ngày", "cần
          nạp thêm"), nên đứng trên mọi khối chỉ để đọc. Thu gọn mặc định, xem
          CardsSection. */}
      <CardsSection
        cards={visibleCards}
        balances={balances}
        base={base}
        rates={rates ?? {}}
        todayISO={todayISO}
      />
```

**2b.** Xóa khối tính toán không còn dùng (hiện là dòng 245–257), tức đoạn từ comment `// Chia dư nợ thành kỳ đã chốt` tới hết dòng gán `const sharedSources = …`:

```tsx
  // Chia dư nợ thành kỳ đã chốt (sắp bị rút) và phần chưa chốt
  const statements = useCardStatements(visibleCards, todayISO)
  // Đối chiếu tiền trả thẻ: phân bổ số dư nguồn cho các thẻ dùng chung → badge nhất quán.
  // Đo theo số của KỲ NÀY, vì đó mới là số rời tài khoản vào ngày đến hạn.
  const cardSources = new Map(
    balances.map((b) => [b.id, { id: b.id, name: b.name, currency: b.currency, balance: b.balance }]),
  )
  const billedByCard = new Map(
    [...statements].flatMap(([id, s]) => (s.billed == null ? [] : [[id, s.billed] as const])),
  )
  const funding = cardFunding(visibleCards, cardSources, billedByCard)
  // Chỉ tổng gộp khi ≥2 thẻ chung nguồn và đang thực nợ (dòng "cần nạp thêm")
  const sharedSources = funding.groups.filter((g) => g.cardCount >= 2 && g.totalOwed > 0)
```

Giữ lại ba dòng ngay trên đó — `visibleCards`, `cardOwed`, `showNetWorth` — vì khối Tài sản ròng vẫn cần.

**2c.** Sửa import cho khớp: dòng `import { ChevronRight, CreditCard, GripVertical } from 'lucide-react'` bỏ `CreditCard`; dòng `import { Money, SegmentedControl } from '../../components/ui'` bỏ `Money`; dòng `import { dueDateLabel, dueRelativeLabel } from '../../lib/dates'` xóa hẳn; dòng `import { cardFunding, UNGROUPED_LABEL, type AssetAccount } from './aggregate'` bỏ `cardFunding`; xóa hẳn dòng `import { useCardStatements } from './useCardStatements'`. Thêm `import { CardsSection } from './CardsSection'`.

Kết quả khối import ở đầu file:

```tsx
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, GripVertical } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { AccountTypeIcon } from '../../components/icons'
import { SegmentedControl } from '../../components/ui'
import {
  useAccounts,
  useAssignAccountsToGroup,
  useReorderAccounts,
} from '../../hooks/queries'
import { CURRENCIES, formatMoney } from '../../lib/money'
import { UNGROUPED_LABEL, type AssetAccount } from './aggregate'
import { CardsSection } from './CardsSection'
import { useAssetsData } from './useAssetsData'
```

- [ ] **Step 3: Kiểm kiểu, lint, test**

```bash
npx tsc -b && npm run lint && npm test
```

Expected: không lỗi kiểu, không cảnh báo lint (đặc biệt không còn biến/import thừa), toàn bộ test pass.

- [ ] **Step 4: Xem thật trên trình duyệt ở chế độ demo**

Mở dev server bằng `preview_start` (không dùng terminal), vào chế độ demo, tới `/assets`, rồi kiểm 4 điều:

1. Khối "THẺ TÍN DỤNG" hiện thu gọn: 1 dòng tiêu đề + 1 dòng "Kỳ này … · Đến hạn …".
2. Bấm vào khối → xổ ra danh sách thẻ như cũ, mũi tên xoay xuống.
3. Bấm lần nữa → thu lại.
4. Tải lại trang → lại thu gọn.

Vì Browser pane hay bị che, dùng `javascript_tool` gọi `.click()` lên chính nút đó thay vì bấm theo tọa độ:

```js
document.querySelector('button[aria-expanded]').click()
```

Sau mỗi bước dùng `read_page` để đọc lại nội dung, và `read_console_messages` để chắc không có lỗi React.

- [ ] **Step 5: Commit**

```bash
git add src/features/assets/CardsSection.tsx src/features/assets/AssetsNowView.tsx
git commit -m "feat(tai san): thu gon khoi the tin dung, bam moi xo chi tiet

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Ghi chú cho người thực hiện

- Repo này có thể đang chạy nhiều phiên cùng lúc. **Luôn `git status` trước khi commit và chỉ `git add` đúng đường dẫn được liệt kê**, đừng `git add -A`.
- Số dòng trong plan là số của lần đọc ngày 2026-08-06; nếu lệch thì tìm theo nội dung comment chứ đừng cắt theo số dòng.
