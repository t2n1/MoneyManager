# Ví tiền của tài khoản chứng khoán VN — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khai một lần rằng ví tiền của tài khoản chứng khoán VND là một tài khoản ngân hàng VND, rồi để mỗi lệnh cổ phiếu tự kéo theo một giao dịch chuyển tiền thật giữa hai tài khoản đó.

**Architecture:** Sửa ở **sổ**, không sửa ở phép tính. Một hàm thuần quyết định "lệnh này ghi thành dòng tiền nào"; cả hai repo gọi nó; `on delete cascade` ở database lo việc xoá. `brokerCash`, `aggregate.ts` và edge function `stock-refresh` **không đổi một dòng nào** — chúng tự đúng khi số dư sổ đã đúng.

**Tech Stack:** TypeScript, React 19, TanStack Query, Supabase (PostgREST), Vitest, Tailwind.

**Spec:** [docs/superpowers/specs/2026-08-30-vi-tien-chung-khoan-design.md](../specs/2026-08-30-vi-tien-chung-khoan-design.md)

## Global Constraints

- **Đổi schema là đổi hai file.** Migration và [src/types/database.types.ts](../../../src/types/database.types.ts) (viết tay, không codegen) phải **cùng một commit**.
- **Hai bản `Repo` phải cùng thoả interface.** Thêm method ở `supabaseRepo` mà quên `demoRepo` là lỗi biên dịch — sửa cả hai trong cùng task.
- **Mỗi `mutationFn` phải có invalidation nằm ngay cạnh nó** trong `src/hooks/queries.ts`.
- **Toán thuần nằm ngoài React**: file `.ts` không JSX, có unit test. Component render số, không tính số.
- **Không chêm giá trị tuỳ ý vào giao diện.** Mọi màu/cỡ chữ/bán kính đều đã có tên; dùng `<Money>`, `<Num>`, `<ActionButton>`, `<Select>`, `<SectionTitle>`. `tests/designSystem.test.ts` là ban cứng.
- **Tiền là số nguyên minor units** (đồng). Không dùng float.
- **Không chạy `npm run bundle:rules` hay `npm run bundle:mcp`** — đợt này không sửa luật trong `src/` mà bundle nào đang gói.
- **Không chạy prettier.** Repo không có prettier; `--write` viết lại cả file sai style.
- Chạy test: `npm test` (vitest run). Một file: `npx vitest run <đường dẫn>`.
- Kiểm kiểu: `npx tsc -b --noEmit` (hoặc `npm run build`).

## Blast radius (đã chạy `impact` trước khi lập kế hoạch)

| Symbol | Rủi ro | Ai gọi |
|--------|--------|--------|
| `buildPortfolio` | **LOW** — 2 direct, 0 execution flow | `useInvestData`, `accountPortfolioSummary` |
| `createStockTrade` | **LOW** — chỉ interface `Repo` ràng buộc | gọi qua object `repo`, không có edge trong index |

Index đang chậm 63 commit so với HEAD nên đây là **cận dưới**; danh sách người gọi ở trên đã được đối chiếu lại bằng grep.

## File Structure

| File | Trách nhiệm |
|------|-------------|
| `supabase/migrations/0054_stock_cash_wallet.sql` | **Tạo.** 2 cột + unique index + dựng lại view. |
| `src/types/database.types.ts` | **Sửa.** `AccountRow`, `AccountBalanceRow`, `TransactionRow`, Insert/Update của `accounts` + `transactions`. |
| `src/data/repo.ts` | **Sửa.** `NewAccount`, `NewTransaction`, 2 method mới trong interface `Repo`. |
| `src/features/assets/stockTradePosting.ts` | **Tạo.** Hai hàm thuần: một lệnh → một dòng tiền; và danh sách lệnh còn thiếu dòng tiền. |
| `src/features/assets/stockTradePosting.test.ts` | **Tạo.** Unit test của file trên. |
| `src/data/demoRepo.ts` | **Sửa.** Ghi/sửa/xoá dòng tiền theo lệnh; đếm + ghi bù; cột mới ở `createAccount` và `getAccountBalances`. |
| `src/data/supabaseRepo.ts` | **Sửa.** Cùng luật, qua PostgREST. |
| `src/data/demoRepo.test.ts` | **Sửa.** Thêm khối test đồng bộ lệnh ↔ dòng tiền. |
| `src/hooks/queries.ts` | **Sửa.** `invalidateStockTrades` rộng ra; 2 hook mới. |
| `src/features/assets/portfolio.ts` | **Sửa.** Thêm `walletCash` vào `Portfolio`. |
| `src/features/assets/useInvestData.ts` | **Sửa.** Nạp số dư ví vào `buildPortfolio`. |
| `src/features/accounts/AccountsPage.tsx` | **Sửa.** Ô `<Select>` "Ví tiền". |
| `src/features/assets/InvestStocksTab.tsx` | **Sửa.** Dòng "Tiền chưa mua" + dải ghi bù. |

---

### Task 1: Migration 0054 và kiểu dữ liệu

**Files:**
- Create: `supabase/migrations/0054_stock_cash_wallet.sql`
- Modify: `src/types/database.types.ts`
- Modify: `src/data/repo.ts:168-202` (`NewAccount`), `src/data/repo.ts:117-147` (`NewTransaction`)
- Modify: `src/data/demoRepo.ts:1280-1306` (`createAccount`), `src/data/demoRepo.ts:1136-1150` (dòng của `getAccountBalances`)
- Test: `tests/accountBalancesView.test.ts` (đã có, **không sửa** — nó tự suy ra danh sách cột từ `AccountBalanceRow`)

**Interfaces:**
- Consumes: —
- Produces: `AccountRow.cash_account_id: string | null`, `AccountBalanceRow.cash_account_id: string | null`, `TransactionRow.stock_trade_id?: string | null`, `NewAccount.cash_account_id?: string | null`, `NewTransaction.stock_trade_id?: string | null`

- [ ] **Step 1: Chạy test guard để thấy nó đang XANH**

Run: `npx vitest run tests/accountBalancesView.test.ts`
Expected: PASS. Đây là mốc — sau Step 3 nó phải ĐỎ, và đó là bằng chứng test này thật sự canh.

- [ ] **Step 2: Viết migration**

Tạo `supabase/migrations/0054_stock_cash_wallet.sql`:

```sql
-- ============================================================
-- Sổ Chi Tiêu — Migration 0054: ví tiền của tài khoản chứng khoán VN
--
-- VẤN ĐỀ
-- Người dùng mua cổ phiếu bằng tiền trong tài khoản ngân hàng VN nhưng chỉ ghi SỔ LỆNH,
-- không ghi dòng tiền nào rời khỏi ngân hàng. Hệ quả: `brokerCash` (= số dư sổ của tài
-- khoản chứng khoán − tiền đã bỏ ra mua) ra ÂM, `portfolioValue` trả null, và
-- stock-refresh bỏ qua tài khoản với lý do `tien-chua-dau-tu-am` → cổ phiếu VN gần như
-- không đóng góp gì vào Tổng tài sản. Đồng thời số dư ngân hàng cao hơn tiền thật đúng
-- bằng tổng đã mua.
--
-- CÁCH SỬA: sửa ở SỔ, không sửa ở phép tính. Khai ví tiền một lần; mỗi lệnh kéo theo
-- một chuyển khoản thật. `brokerCash` giữ nguyên định nghĩa và tự hết âm.
-- ============================================================

alter table public.accounts
  add column cash_account_id uuid references public.accounts(id) on delete set null;

comment on column public.accounts.cash_account_id is
  'Tài khoản đang giữ tiền mặt của tài khoản đầu tư này (cùng loại tiền). null = không khai.';

alter table public.transactions
  add column stock_trade_id uuid references public.stock_trades(id) on delete cascade;

comment on column public.transactions.stock_trade_id is
  'Lệnh cổ phiếu đã sinh ra dòng tiền này. on delete cascade: xoá lệnh thì dòng tiền tự đi theo.';

-- Một lệnh không bao giờ có hai dòng tiền — nhờ nó, nút "ghi bù" bấm hai lần vẫn an toàn.
create unique index transactions_stock_trade_id_key
  on public.transactions (stock_trade_id) where stock_trade_id is not null;

-- Dựng lại view: nó liệt kê cột RÕ RÀNG chứ không `a.*`, nên cột mới KHÔNG tự chảy qua.
-- Đúng cái bẫy 0053 sinh ra để sửa. Thân view viết đủ nên bản này tự đứng được.
drop view if exists public.account_balances;

create view public.account_balances
with (security_invoker = true) as
select
  a.id,
  a.user_id,
  a.name,
  a.type,
  a.currency,
  a.asset_group,
  a.is_hidden,
  a.include_in_totals,
  a.is_liquid,
  a.credit_limit,
  a.statement_day,
  a.payment_due_day,
  a.payment_account_id,
  a.cash_account_id,
  a.is_archived,
  a.sort_order,
  a.last_reconciled_at,
  a.initial_balance as cost_basis,
  a.depreciation_months,
  a.depreciation_from,
  a.salvage_value,
  a.tax_shelter,
  a.shelter_annual_limit,
  mv.market_value,
  a.initial_balance
    + coalesce(sum(
        case
          when t.type = 'income'   and t.account_id    = a.id then  t.amount
          -- Hoàn tiền: tiền quay lại ví → cộng (chi âm)
          when t.type = 'expense'  and t.account_id    = a.id and t.is_refund then  t.amount
          when t.type = 'expense'  and t.account_id    = a.id then -t.amount
          when t.type = 'transfer' and t.account_id    = a.id then -t.amount
          when t.type = 'transfer' and t.to_account_id = a.id then coalesce(t.to_amount, t.amount)
          else 0
        end
      ), 0) as balance
from public.accounts a
left join public.transactions t
  on t.user_id = a.user_id
 and (t.account_id = a.id or t.to_account_id = a.id)
left join lateral (
  select v.market_value
  from public.account_valuations v
  where v.account_id = a.id
  order by v.valued_on desc, v.created_at desc
  limit 1
) mv on true
group by a.id, mv.market_value;
```

- [ ] **Step 3: Thêm trường vào `AccountBalanceRow` và chạy guard để thấy nó ĐỎ**

Trong `src/types/database.types.ts`, thêm vào `AccountBalanceRow` ngay sau `payment_account_id`:

```ts
  /** Ví tiền của tài khoản đầu tư (migration 0054); null = không khai. */
  cash_account_id: string | null
```

Run: `npx vitest run tests/accountBalancesView.test.ts`
Expected: PASS — vì Step 2 đã thêm `a.cash_account_id` vào view. Nếu **FAIL** với `view thiếu cột \`cash_account_id\`` thì migration ở Step 2 chưa đúng; sửa migration, đừng sửa test.

- [ ] **Step 4: Thêm nốt các trường còn lại vào `database.types.ts`**

Trong `AccountRow`, ngay sau `payment_account_id` (dòng ~145):

```ts
  /**
   * Tài khoản đang giữ tiền mặt của tài khoản đầu tư này (migration 0054).
   *
   * Người dùng mua cổ phiếu VN bằng tiền ở ngân hàng nhưng chỉ ghi sổ lệnh. Khai cột này
   * thì mỗi lệnh tự kéo theo một chuyển khoản thật giữa hai tài khoản — xem
   * `features/assets/stockTradePosting.ts`. null = không khai → không ghi gì, hành vi cũ.
   */
  cash_account_id: string | null
```

Trong `TransactionRow`, ngay sau `is_refund` (dòng ~316):

```ts
  /** Lệnh cổ phiếu sinh ra dòng tiền này (migration 0054); null/vắng = giao dịch thường. */
  stock_trade_id?: string | null
```

Trong khối `accounts:` (dòng ~813), thêm `| 'cash_account_id'` vào **cả** danh sách `Insert` và `Update`, sau `'payment_account_id'`.

Trong khối `transactions:` (dòng ~897), thêm `| 'stock_trade_id'` vào **cả** `Insert` và `Update`, sau `'is_refund'`.

- [ ] **Step 5: Thêm trường vào kiểu đầu vào của repo**

Trong `src/data/repo.ts`, `NewAccount` (sau `payment_account_id`, dòng ~187):

```ts
  /** Tài khoản đầu tư: ví tiền (cùng currency, không phải chính nó); null = không khai */
  cash_account_id?: string | null
```

`NewTransaction` (sau `exclude_from_stats`, dòng ~139):

```ts
  /** Lệnh cổ phiếu sinh ra dòng tiền này. Chỉ repo đặt, giao diện không bao giờ đặt. */
  stock_trade_id?: string | null
```

`AccountPatch` là `Partial<NewAccount & …>` nên tự có cột mới, không phải sửa.

- [ ] **Step 6: Cho `demoRepo` biết cột mới**

Trong `src/data/demoRepo.ts`, `createAccount` (dòng ~1290), thêm ngay dưới `payment_account_id`:

```ts
      cash_account_id: input.cash_account_id ?? null,
```

Trong `getAccountBalances`, khối `return { … }` (dòng ~1145), thêm ngay dưới `payment_account_id`:

```ts
          cash_account_id: a.cash_account_id ?? null,
```

- [ ] **Step 7: Kiểm kiểu và chạy toàn bộ test**

Run: `npx tsc -b --noEmit && npm test`
Expected: PASS toàn bộ. `tsc` là chốt chính ở task này — nó bắt mọi chỗ dựng `AccountBalanceRow` mà thiếu cột mới.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0054_stock_cash_wallet.sql src/types/database.types.ts src/data/repo.ts src/data/demoRepo.ts
git commit -m "feat(vi-tien): hai cot noi lenh co phieu voi dong tien that"
```

---

### Task 2: Hàm thuần — lệnh cổ phiếu thành dòng tiền

**Files:**
- Create: `src/features/assets/stockTradePosting.ts`
- Test: `src/features/assets/stockTradePosting.test.ts`

**Interfaces:**
- Consumes: `NewTransaction` (`src/data/repo.ts`), `StockTradeRow` (`src/types/database.types.ts`) — từ Task 1
- Produces:
  - `stockTradeCashFlow(trade: StockTradeCash, investAccountId: string, cashAccountId: string | null | undefined): NewTransaction | null`
  - `missingTradeTransfers(accounts: WalletAccount[], trades: StockTradeRow[], daCoDongTien: Set<string>): PendingTransfer[]`
  - `interface WalletAccount { id: string; cash_account_id: string | null }`
  - `interface PendingTransfer { tradeId: string; tx: NewTransaction }`
  - `type StockTradeCash = Pick<StockTradeRow, 'kind' | 'symbol' | 'quantity' | 'price' | 'fee' | 'tax' | 'traded_on'>`

- [ ] **Step 1: Viết test thất bại**

Tạo `src/features/assets/stockTradePosting.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { missingTradeTransfers, stockTradeCashFlow } from './stockTradePosting'
import type { StockTradeRow } from '../../types/database.types'

const CK = 'tk-chung-khoan'
const NH = 'tk-ngan-hang'

function lenh(over: Partial<StockTradeRow> = {}): StockTradeRow {
  return {
    id: 'l1',
    user_id: 'u',
    account_id: CK,
    symbol: 'VNM',
    kind: 'buy',
    traded_on: '2026-08-20',
    quantity: 100,
    price: 50_000,
    fee: 7_500,
    tax: 0,
    note: '',
    created_at: '2026-08-20T00:00:00Z',
    updated_at: '2026-08-20T00:00:00Z',
    ...over,
  }
}

describe('stockTradeCashFlow', () => {
  it('mua: tiền đi TỪ ví ngân hàng SANG tài khoản chứng khoán, đã gồm phí', () => {
    const tx = stockTradeCashFlow(lenh(), CK, NH)
    expect(tx).toEqual({
      type: 'transfer',
      amount: 5_007_500,
      to_amount: null,
      category_id: null,
      account_id: NH,
      to_account_id: CK,
      occurred_on: '2026-08-20',
      note: 'Mua 100 VNM',
    })
  })

  it('bán: tiền đi NGƯỢC lại, đã trừ phí và thuế', () => {
    const tx = stockTradeCashFlow(
      lenh({ kind: 'sell', quantity: 100, price: 60_000, fee: 9_000, tax: 6_000 }),
      CK,
      NH,
    )
    expect(tx?.account_id).toBe(CK)
    expect(tx?.to_account_id).toBe(NH)
    expect(tx?.amount).toBe(6_000_000 - 9_000 - 6_000)
    expect(tx?.note).toBe('Bán 100 VNM')
  })

  it('điều chỉnh (gộp/tách cổ phiếu) không có tiền → không ghi gì', () => {
    expect(stockTradeCashFlow(lenh({ kind: 'adjust', price: 0, quantity: 10 }), CK, NH)).toBeNull()
  })

  it('chưa khai ví → không ghi gì, giữ nguyên hành vi cũ', () => {
    expect(stockTradeCashFlow(lenh(), CK, null)).toBeNull()
    expect(stockTradeCashFlow(lenh(), CK, undefined)).toBeNull()
    expect(stockTradeCashFlow(lenh(), CK, '')).toBeNull()
  })

  it('ví trỏ về chính tài khoản đó → không ghi gì (chuyển khoản về chính nó là vô nghĩa)', () => {
    expect(stockTradeCashFlow(lenh(), CK, CK)).toBeNull()
  })

  it('bán mà phí + thuế nuốt hết tiền về → không ghi gì, không ghi số 0 hay số âm', () => {
    const hoa = stockTradeCashFlow(lenh({ kind: 'sell', quantity: 1, price: 1_000, fee: 1_000, tax: 0 }), CK, NH)
    expect(hoa).toBeNull()
    const am = stockTradeCashFlow(lenh({ kind: 'sell', quantity: 1, price: 1_000, fee: 900, tax: 200 }), CK, NH)
    expect(am).toBeNull()
  })
})

describe('missingTradeTransfers', () => {
  const viDaKhai = [{ id: CK, cash_account_id: NH }]

  it('lệnh chưa có dòng tiền thì được nêu tên, kèm sẵn giao dịch để ghi', () => {
    const ra = missingTradeTransfers(viDaKhai, [lenh({ id: 'l1' })], new Set())
    expect(ra).toHaveLength(1)
    expect(ra[0].tradeId).toBe('l1')
    expect(ra[0].tx.amount).toBe(5_007_500)
  })

  it('lệnh đã có dòng tiền thì bỏ qua — chạy hai lần không đẻ dòng thứ hai', () => {
    expect(missingTradeTransfers(viDaKhai, [lenh({ id: 'l1' })], new Set(['l1']))).toEqual([])
  })

  it('lệnh của tài khoản CHƯA khai ví thì không tính là thiếu', () => {
    const ra = missingTradeTransfers(
      [{ id: CK, cash_account_id: null }],
      [lenh({ id: 'l1' })],
      new Set(),
    )
    expect(ra).toEqual([])
  })

  it('lệnh điều chỉnh không tính là thiếu — nó vốn không sinh dòng tiền nào', () => {
    const ra = missingTradeTransfers(
      viDaKhai,
      [lenh({ id: 'l1', kind: 'adjust', price: 0, quantity: 5 })],
      new Set(),
    )
    expect(ra).toEqual([])
  })

  it('lệnh của tài khoản không nằm trong danh sách thì bỏ qua', () => {
    const ra = missingTradeTransfers(viDaKhai, [lenh({ id: 'l1', account_id: 'tk-khac' })], new Set())
    expect(ra).toEqual([])
  })
})
```

- [ ] **Step 2: Chạy test để thấy nó thất bại**

Run: `npx vitest run src/features/assets/stockTradePosting.test.ts`
Expected: FAIL — `Failed to resolve import "./stockTradePosting"`.

- [ ] **Step 3: Viết bản cài đặt tối thiểu**

Tạo `src/features/assets/stockTradePosting.ts`:

```ts
// Một lệnh cổ phiếu ghi vào sổ thành dòng tiền nào — thuần, test được, KHÔNG React.
//
// Cùng vai với `debts/debtPaymentPosting.ts`: đây là chỗ DUY NHẤT của repo quyết định
// việc đó, và nó nằm dưới cả hai cửa ghi (form ghi lệnh, nút ghi bù) cùng cả hai repo
// (Supabase, demo). Để quyết định này ở tầng gọi thì mỗi cửa phải tự nhớ, và cửa nào
// quên thì số dư ngân hàng lặng lẽ cao hơn tiền thật — đúng cái sai mà cả đợt này sửa.
import type { NewTransaction } from '../../data/repo'
import type { StockTradeRow } from '../../types/database.types'

/** Phần của một lệnh quyết định dòng tiền. Nhận Pick để test khỏi dựng cả hàng. */
export type StockTradeCash = Pick<
  StockTradeRow,
  'kind' | 'symbol' | 'quantity' | 'price' | 'fee' | 'tax' | 'traded_on'
>

/** Tài khoản đầu tư kèm ví đã khai (hoặc chưa). */
export interface WalletAccount {
  id: string
  cash_account_id: string | null
}

/** Một lệnh còn thiếu dòng tiền, kèm sẵn giao dịch để ghi. */
export interface PendingTransfer {
  tradeId: string
  tx: NewTransaction
}

/**
 * Lệnh này thành chuyển khoản nào giữa ví và tài khoản chứng khoán.
 *
 * Trả `null` — tức KHÔNG ghi gì — ở bốn ca, và cả bốn đều không phải lỗi:
 * - chưa khai ví: hành vi cũ giữ nguyên y hệt, không tự đoán hộ người dùng;
 * - ví trỏ về chính tài khoản đó: `assertTxShape` và CHECK của Postgres đều từ chối;
 * - lệnh `adjust`: gộp/tách cổ phiếu không có tiền đổi chủ;
 * - tiền về ≤ 0 khi bán: ghi một dòng 0 đồng không nói thêm gì, còn ghi số âm là đổi
 *   chiều tiền một cách lặng lẽ.
 */
export function stockTradeCashFlow(
  trade: StockTradeCash,
  investAccountId: string,
  cashAccountId: string | null | undefined,
): NewTransaction | null {
  if (!cashAccountId || cashAccountId === investAccountId) return null
  if (trade.kind === 'adjust') return null

  const gross = trade.quantity * trade.price
  const muaVao = trade.kind === 'buy'
  const amount = muaVao ? gross + trade.fee : gross - trade.fee - trade.tax
  if (!(amount > 0)) return null

  return {
    type: 'transfer',
    amount,
    // Cùng VND cả hai đầu nên không có tỷ giá nào phải ghi. Ví khác loại tiền cố ý
    // không được hỗ trợ — xem "Cố ý không làm" của bản thiết kế.
    to_amount: null,
    category_id: null,
    account_id: muaVao ? cashAccountId : investAccountId,
    to_account_id: muaVao ? investAccountId : cashAccountId,
    occurred_on: trade.traded_on,
    note: `${muaVao ? 'Mua' : 'Bán'} ${trade.quantity} ${trade.symbol}`,
  }
}

/**
 * Những lệnh đáng có dòng tiền mà chưa có.
 *
 * Cùng một hàm trả lời cả "đếm bao nhiêu" lẫn "ghi những gì", nên dải cảnh báo và nút
 * ghi bù không thể nói hai số khác nhau. Lệnh `adjust` và lệnh bán có tiền về ≤ 0 tự
 * rơi ra vì `stockTradeCashFlow` trả `null` — chúng vốn không thiếu gì.
 */
export function missingTradeTransfers(
  accounts: WalletAccount[],
  trades: StockTradeRow[],
  daCoDongTien: Set<string>,
): PendingTransfer[] {
  const viTheoTaiKhoan = new Map(accounts.map((a) => [a.id, a.cash_account_id]))
  const ra: PendingTransfer[] = []
  for (const t of trades) {
    if (daCoDongTien.has(t.id)) continue
    if (!viTheoTaiKhoan.has(t.account_id)) continue
    const tx = stockTradeCashFlow(t, t.account_id, viTheoTaiKhoan.get(t.account_id))
    if (tx) ra.push({ tradeId: t.id, tx })
  }
  return ra
}
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `npx vitest run src/features/assets/stockTradePosting.test.ts`
Expected: PASS — 11 test.

- [ ] **Step 5: Commit**

```bash
git add src/features/assets/stockTradePosting.ts src/features/assets/stockTradePosting.test.ts
git commit -m "feat(vi-tien): mot ham thuan noi lenh co phieu voi dong tien"
```

---

### Task 3: `demoRepo` giữ lệnh và dòng tiền khớp nhau

**Files:**
- Modify: `src/data/demoRepo.ts:1400-1454` (`createStockTrade`, `updateStockTrade`, `deleteStockTrade`)
- Test: `src/data/demoRepo.test.ts` (thêm khối `describe` mới ở cuối file)

**Interfaces:**
- Consumes: `stockTradeCashFlow` (Task 2), `TransactionRow.stock_trade_id` (Task 1)
- Produces: `demoRepo.createStockTrade` / `updateStockTrade` ghi kèm và giữ đồng bộ một `TransactionRow` mang `stock_trade_id`

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `src/data/demoRepo.test.ts`:

```ts
describe('lệnh cổ phiếu kéo theo dòng tiền khi đã khai ví', () => {
  async function dungHaiTaiKhoan() {
    const nganHang = await demoRepo.createAccount(
      accountInput({ name: 'Ngân hàng VN', type: 'bank', currency: 'VND', initial_balance: 50_000_000 }),
    )
    const chungKhoan = await demoRepo.createAccount(
      accountInput({
        name: 'iDragon',
        type: 'investment',
        currency: 'VND',
        initial_balance: 0,
        cash_account_id: nganHang.id,
      }),
    )
    return { nganHang, chungKhoan }
  }

  function lenhMua(accountId: string) {
    return {
      account_id: accountId,
      symbol: 'VNM',
      kind: 'buy' as const,
      traded_on: '2026-08-20',
      quantity: 100,
      price: 50_000,
      fee: 7_500,
      tax: 0,
      note: '',
    }
  }

  it('ghi lệnh mua → sinh một chuyển khoản từ ngân hàng sang chứng khoán', async () => {
    const { nganHang, chungKhoan } = await dungHaiTaiKhoan()
    const trade = await demoRepo.createStockTrade(lenhMua(chungKhoan.id))

    const txs = await demoRepo.getTransactions({ start: '2026-08-01', end: '2026-09-01' })
    const sinhRa = txs.filter((t) => t.stock_trade_id === trade.id)
    expect(sinhRa).toHaveLength(1)
    expect(sinhRa[0].type).toBe('transfer')
    expect(sinhRa[0].amount).toBe(5_007_500)
    expect(sinhRa[0].account_id).toBe(nganHang.id)
    expect(sinhRa[0].to_account_id).toBe(chungKhoan.id)
  })

  it('số dư ngân hàng giảm đúng bằng tiền đã mua, tiền chưa mua hết âm', async () => {
    const { nganHang, chungKhoan } = await dungHaiTaiKhoan()
    await demoRepo.createStockTrade(lenhMua(chungKhoan.id))

    const balances = await demoRepo.getAccountBalances()
    expect(balances.find((b) => b.id === nganHang.id)?.balance).toBe(50_000_000 - 5_007_500)
    // Số dư sổ của tài khoản chứng khoán = đúng tiền đã bỏ ra → brokerCash ra 0, không âm.
    expect(balances.find((b) => b.id === chungKhoan.id)?.balance).toBe(5_007_500)
  })

  it('sửa số lượng lệnh → dòng tiền sửa theo, vẫn đúng một dòng', async () => {
    const { chungKhoan } = await dungHaiTaiKhoan()
    const trade = await demoRepo.createStockTrade(lenhMua(chungKhoan.id))
    await demoRepo.updateStockTrade(trade.id, { quantity: 200 })

    const txs = await demoRepo.getTransactions({ start: '2026-08-01', end: '2026-09-01' })
    const sinhRa = txs.filter((t) => t.stock_trade_id === trade.id)
    expect(sinhRa).toHaveLength(1)
    expect(sinhRa[0].amount).toBe(200 * 50_000 + 7_500)
  })

  it('đổi lệnh mua thành điều chỉnh → dòng tiền biến mất', async () => {
    const { chungKhoan } = await dungHaiTaiKhoan()
    const trade = await demoRepo.createStockTrade(lenhMua(chungKhoan.id))
    await demoRepo.updateStockTrade(trade.id, { kind: 'adjust', price: 0, fee: 0, tax: 0 })

    const txs = await demoRepo.getTransactions({ start: '2026-08-01', end: '2026-09-01' })
    expect(txs.filter((t) => t.stock_trade_id === trade.id)).toEqual([])
  })

  it('xoá lệnh → dòng tiền đi theo (khớp on delete cascade của Postgres)', async () => {
    const { chungKhoan } = await dungHaiTaiKhoan()
    const trade = await demoRepo.createStockTrade(lenhMua(chungKhoan.id))
    await demoRepo.deleteStockTrade(trade.id)

    const txs = await demoRepo.getTransactions({ start: '2026-08-01', end: '2026-09-01' })
    expect(txs.filter((t) => t.stock_trade_id === trade.id)).toEqual([])
  })

  it('chưa khai ví → không sinh dòng tiền nào, y như trước', async () => {
    const chungKhoan = await demoRepo.createAccount(
      accountInput({ name: 'iDragon', type: 'investment', currency: 'VND', initial_balance: 0 }),
    )
    const trade = await demoRepo.createStockTrade(lenhMua(chungKhoan.id))

    const txs = await demoRepo.getTransactions({ start: '2026-08-01', end: '2026-09-01' })
    expect(txs.filter((t) => t.stock_trade_id === trade.id)).toEqual([])
  })
})
```

- [ ] **Step 2: Chạy test để thấy nó thất bại**

Run: `npx vitest run src/data/demoRepo.test.ts`
Expected: FAIL — các test mới báo `expected [] to have a length of 1`.

- [ ] **Step 3: Cài đặt trong `demoRepo`**

Thêm import ở đầu `src/data/demoRepo.ts` (cạnh import `debtPaymentPosting`):

```ts
import { stockTradeCashFlow } from '../features/assets/stockTradePosting'
```

Thêm hàm trợ giúp module-level (đặt cạnh `assertStockTradeShape`, sau dòng ~137):

```ts
/**
 * Ghi/sửa/xoá dòng tiền của một lệnh sao cho khớp với lệnh đó — gọi SAU khi `db.stockTrades`
 * đã ở trạng thái mới. Sửa `db` tại chỗ; nơi gọi tự `save(db)`.
 *
 * Khớp hành vi bản thật: unique index `transactions_stock_trade_id_key` cho phép tối đa
 * một dòng mỗi lệnh, nên ở đây cũng đúng một dòng.
 */
function dongBoDongTienLenh(db: DemoDb, trade: StockTradeRow) {
  const viId = db.accounts.find((a) => a.id === trade.account_id)?.cash_account_id ?? null
  const flow = stockTradeCashFlow(trade, trade.account_id, viId)
  const idx = db.transactions.findIndex((t) => t.stock_trade_id === trade.id)

  if (!flow) {
    if (idx >= 0) db.transactions.splice(idx, 1)
    return
  }
  if (idx >= 0) {
    db.transactions[idx] = { ...db.transactions[idx], ...flow, updated_at: nowISO() }
    return
  }
  db.transactions.push({
    ...flow,
    id: uuid(),
    user_id: DEMO_USER,
    recurring_rule_id: null,
    stock_trade_id: trade.id,
    created_at: nowISO(),
    updated_at: nowISO(),
  } as TransactionRow)
}
```

> Kiểu `DemoDb` là kiểu của giá trị `load()` trả về — dùng đúng tên mà file đang khai báo cho nó. Nếu file không đặt tên riêng, viết `ReturnType<typeof load>`.

Trong `createStockTrade`, thay `db.stockTrades.push(row); save(db)` bằng:

```ts
    db.stockTrades.push(row)
    dongBoDongTienLenh(db, row)
    save(db)
```

Trong `updateStockTrade`, thay `db.stockTrades[idx] = next; save(db)` bằng:

```ts
    db.stockTrades[idx] = next
    dongBoDongTienLenh(db, next)
    save(db)
```

Trong `deleteStockTrade`, thêm dòng dọn dòng tiền — mô phỏng `on delete cascade`:

```ts
  async deleteStockTrade(id: string) {
    const db = load()
    db.stockTrades = (db.stockTrades ?? []).filter((t) => t.id !== id)
    // Khớp FK `on delete cascade` của migration 0054.
    db.transactions = db.transactions.filter((t) => t.stock_trade_id !== id)
    save(db)
  },
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `npx vitest run src/data/demoRepo.test.ts`
Expected: PASS toàn bộ file (kể cả các test cũ).

- [ ] **Step 5: Commit**

```bash
git add src/data/demoRepo.ts src/data/demoRepo.test.ts
git commit -m "feat(vi-tien): demoRepo giu lenh va dong tien khop nhau"
```

---

### Task 4: `supabaseRepo` theo cùng luật

**Files:**
- Modify: `src/data/supabaseRepo.ts:498-537` (`createStockTrade`, `updateStockTrade`)

**Interfaces:**
- Consumes: `stockTradeCashFlow` (Task 2)
- Produces: hành vi giống hệt Task 3, qua PostgREST

- [ ] **Step 1: Cài đặt**

Thêm import ở đầu `src/data/supabaseRepo.ts` (cạnh import `debtPaymentPosting`):

```ts
import { stockTradeCashFlow } from '../features/assets/stockTradePosting'
```

Thêm hàm trợ giúp module-level (đặt ngay trên `export const supabaseRepo`):

```ts
/** Ví tiền đã khai của một tài khoản đầu tư; null = chưa khai. */
async function viTienCuaTaiKhoan(accountId: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from('accounts')
    .select('cash_account_id')
    .eq('id', accountId)
    .single()
  if (error) throw error
  return data.cash_account_id
}

/**
 * Ghi/sửa/xoá dòng tiền của một lệnh cho khớp — gọi SAU khi hàng `stock_trades` đã ở
 * trạng thái mới. Cùng luật với `dongBoDongTienLenh` của demoRepo, cùng một hàm thuần
 * quyết định.
 */
async function dongBoDongTienLenh(trade: StockTradeRow, user_id: string) {
  const flow = stockTradeCashFlow(trade, trade.account_id, await viTienCuaTaiKhoan(trade.account_id))
  const sb = getSupabase()
  const { data: cu, error: docErr } = await sb
    .from('transactions')
    .select('id')
    .eq('stock_trade_id', trade.id)
    .maybeSingle()
  if (docErr) throw docErr

  if (!flow) {
    if (cu) {
      const { error } = await sb.from('transactions').delete().eq('id', cu.id)
      if (error) throw error
    }
    return
  }
  if (cu) {
    const { error } = await sb.from('transactions').update(flow).eq('id', cu.id)
    if (error) throw error
    return
  }
  const { error } = await sb
    .from('transactions')
    .insert({ ...flow, user_id, stock_trade_id: trade.id })
  if (error) throw error
}
```

Trong `createStockTrade`, ngay trước `return data`:

```ts
    await dongBoDongTienLenh(data, user_id)
    return data
```

Trong `updateStockTrade`, ngay trước `return data`:

```ts
    await dongBoDongTienLenh(data, data.user_id)
    return data
```

`deleteStockTrade` **không đổi** — `on delete cascade` của migration 0054 lo.

- [ ] **Step 2: Kiểm kiểu**

Run: `npx tsc -b --noEmit`
Expected: PASS, không lỗi.

- [ ] **Step 3: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS. (Không có test tự động cho `supabaseRepo` — nó cần mạng; chốt ở đây là `tsc` cộng với việc cả hai repo gọi **cùng một** hàm thuần đã có test riêng.)

- [ ] **Step 4: Commit**

```bash
git add src/data/supabaseRepo.ts
git commit -m "feat(vi-tien): supabaseRepo theo cung luat ghi dong tien"
```

---

### Task 5: Đếm và ghi bù lệnh cũ

**Files:**
- Modify: `src/data/repo.ts:576-579` (interface `Repo`)
- Modify: `src/data/demoRepo.ts` (2 method mới)
- Modify: `src/data/supabaseRepo.ts` (2 method mới)
- Test: `src/data/demoRepo.test.ts` (thêm test vào khối `describe` của Task 3)

**Interfaces:**
- Consumes: `missingTradeTransfers` (Task 2)
- Produces:
  - `Repo.countStockTradesWithoutTransfer(): Promise<number>`
  - `Repo.backfillStockTradeTransfers(): Promise<number>`

- [ ] **Step 1: Viết test thất bại**

Thêm vào khối `describe('lệnh cổ phiếu kéo theo dòng tiền khi đã khai ví', …)` trong `src/data/demoRepo.test.ts`:

```ts
  it('lệnh ghi TRƯỚC khi khai ví được đếm là thiếu, và ghi bù đúng ngày của lệnh', async () => {
    const nganHang = await demoRepo.createAccount(
      accountInput({ name: 'Ngân hàng VN', type: 'bank', currency: 'VND', initial_balance: 50_000_000 }),
    )
    const chungKhoan = await demoRepo.createAccount(
      accountInput({ name: 'iDragon', type: 'investment', currency: 'VND', initial_balance: 0 }),
    )
    const trade = await demoRepo.createStockTrade(lenhMua(chungKhoan.id))
    expect(await demoRepo.countStockTradesWithoutTransfer()).toBe(0) // chưa khai ví → không thiếu gì

    await demoRepo.updateAccount(chungKhoan.id, { cash_account_id: nganHang.id })
    expect(await demoRepo.countStockTradesWithoutTransfer()).toBe(1)

    expect(await demoRepo.backfillStockTradeTransfers()).toBe(1)
    const txs = await demoRepo.getTransactions({ start: '2026-08-01', end: '2026-09-01' })
    const sinhRa = txs.filter((t) => t.stock_trade_id === trade.id)
    expect(sinhRa).toHaveLength(1)
    expect(sinhRa[0].occurred_on).toBe('2026-08-20')
  })

  it('ghi bù lần hai không đẻ dòng thứ hai', async () => {
    const { chungKhoan } = await dungHaiTaiKhoan()
    await demoRepo.createStockTrade(lenhMua(chungKhoan.id))
    expect(await demoRepo.countStockTradesWithoutTransfer()).toBe(0)
    expect(await demoRepo.backfillStockTradeTransfers()).toBe(0)

    const txs = await demoRepo.getTransactions({ start: '2026-08-01', end: '2026-09-01' })
    expect(txs.filter((t) => t.type === 'transfer')).toHaveLength(1)
  })
```

- [ ] **Step 2: Chạy test để thấy nó thất bại**

Run: `npx vitest run src/data/demoRepo.test.ts`
Expected: FAIL — `demoRepo.countStockTradesWithoutTransfer is not a function`.

- [ ] **Step 3: Khai hai method trong interface `Repo`**

Trong `src/data/repo.ts`, ngay dưới `deleteStockTrade(id: string): Promise<void>` (dòng ~579):

```ts
  /**
   * Bao nhiêu lệnh cổ phiếu đáng có dòng tiền mà chưa có.
   *
   * Phạm vi là MỌI tài khoản đầu tư đã khai ví, không nhận `accountId`: tab Đầu tư gộp
   * nhiều tài khoản, bắt nó tự lặp là để lại một lỗ hổng không ai thấy.
   */
  countStockTradesWithoutTransfer(): Promise<number>
  /** Ghi bù những dòng tiền đó, mỗi lệnh một dòng đúng ngày `traded_on`. Trả số dòng đã ghi. */
  backfillStockTradeTransfers(): Promise<number>
```

- [ ] **Step 4: Cài đặt trong `demoRepo`**

Thêm import `missingTradeTransfers` vào dòng import đã có ở Task 3:

```ts
import { missingTradeTransfers, stockTradeCashFlow } from '../features/assets/stockTradePosting'
```

Thêm hai method ngay dưới `deleteStockTrade`:

```ts
  async countStockTradesWithoutTransfer() {
    const db = load()
    return thieuDongTien(db).length
  },

  async backfillStockTradeTransfers() {
    const db = load()
    const thieu = thieuDongTien(db)
    for (const { tradeId, tx } of thieu) {
      db.transactions.push({
        ...tx,
        id: uuid(),
        user_id: DEMO_USER,
        recurring_rule_id: null,
        stock_trade_id: tradeId,
        created_at: nowISO(),
        updated_at: nowISO(),
      } as TransactionRow)
    }
    if (thieu.length > 0) save(db)
    return thieu.length
  },
```

Và hàm trợ giúp module-level, đặt ngay dưới `dongBoDongTienLenh`:

```ts
/** Lệnh còn thiếu dòng tiền, tính trên trạng thái hiện tại của db. */
function thieuDongTien(db: DemoDb) {
  return missingTradeTransfers(
    db.accounts.filter((a) => a.cash_account_id),
    db.stockTrades ?? [],
    new Set(db.transactions.map((t) => t.stock_trade_id).filter((id): id is string => !!id)),
  )
}
```

- [ ] **Step 5: Cài đặt trong `supabaseRepo`**

Thêm `missingTradeTransfers` vào import đã có ở Task 4. Thêm hai method ngay dưới `deleteStockTrade`:

```ts
  async countStockTradesWithoutTransfer() {
    return (await thieuDongTien()).length
  },

  async backfillStockTradeTransfers() {
    const user_id = await currentUserId()
    const thieu = await thieuDongTien()
    // Chia lô 100 — cùng lý do như deleteTransactions: lô lớn dễ đụng giới hạn của PostgREST.
    for (let i = 0; i < thieu.length; i += 100) {
      const { error } = await getSupabase().from('transactions').insert(
        thieu.slice(i, i + 100).map(({ tradeId, tx }) => ({ ...tx, user_id, stock_trade_id: tradeId })),
      )
      if (error) throw error
    }
    return thieu.length
  },
```

Và hàm trợ giúp module-level, đặt ngay dưới `dongBoDongTienLenh`:

```ts
/** Lệnh còn thiếu dòng tiền — cùng phép tính cho cả đếm lẫn ghi. */
async function thieuDongTien() {
  const sb = getSupabase()
  const { data: accounts, error: accErr } = await sb
    .from('accounts')
    .select('id, cash_account_id')
    .not('cash_account_id', 'is', null)
  if (accErr) throw accErr
  if (accounts.length === 0) return []

  const trades = await fetchAllPages<StockTradeRow>((from, to) =>
    sb.from('stock_trades').select('*').order('traded_on').range(from, to),
  )
  const daCo = await fetchAllPages<{ stock_trade_id: string | null }>((from, to) =>
    sb.from('transactions').select('stock_trade_id').not('stock_trade_id', 'is', null).range(from, to),
  )
  return missingTradeTransfers(
    accounts,
    trades,
    new Set(daCo.map((r) => r.stock_trade_id).filter((id): id is string => !!id)),
  )
}
```

> `fetchAllPages` đã được `supabaseRepo` import sẵn (`src/data/paging.ts`) — PostgREST chặn ở 1000 dòng, đọc trọn bảng mà không phân trang là tính trên sổ lệnh thiếu. Kiểm lại chữ ký đúng của nó trong file trước khi dùng và bám theo cách các method khác trong file đang gọi.

- [ ] **Step 6: Chạy test để thấy nó xanh**

Run: `npx vitest run src/data/demoRepo.test.ts && npx tsc -b --noEmit`
Expected: PASS cả hai.

- [ ] **Step 7: Commit**

```bash
git add src/data/repo.ts src/data/demoRepo.ts src/data/supabaseRepo.ts src/data/demoRepo.test.ts
git commit -m "feat(vi-tien): dem va ghi bu dong tien cho lenh cu"
```

---

### Task 6: Hook và invalidation

**Files:**
- Modify: `src/hooks/queries.ts:569-599`

**Interfaces:**
- Consumes: `repo.countStockTradesWithoutTransfer`, `repo.backfillStockTradeTransfers` (Task 5)
- Produces: `useStockTradesWithoutTransfer()`, `useBackfillStockTradeTransfers()`

- [ ] **Step 1: Sửa `invalidateStockTrades` và thêm hai hook**

Thay toàn bộ `invalidateStockTrades` (dòng 569-574) bằng:

```ts
function invalidateStockTrades(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['stockTrades'] })
  // Sổ lệnh đổi → tiền chưa mua và giá trị danh mục đổi theo.
  qc.invalidateQueries({ queryKey: ['valuations'] })
  // Từ migration 0054, sổ lệnh KÉO THEO dòng tiền thật khi tài khoản đã khai ví (xem
  // stockTradePosting.ts) — nên số dư, danh sách giao dịch và bộ đếm "lệnh còn thiếu"
  // đều đổi. Chú thích cũ ở đây nói "số dư không đổi vì sổ lệnh không phải dòng tiền";
  // câu đó đúng cho tới 0054 và nay đã sai.
  invalidateTransactionData(qc)
  qc.invalidateQueries({ queryKey: ['stockTradesWithoutTransfer'] })
}
```

Thêm ngay dưới `useDeleteStockTrade` (dòng ~599):

```ts
/** Bao nhiêu lệnh cổ phiếu chưa có dòng chuyển tiền — dải nhắc ở tab Cổ phiếu VN đọc số này. */
export function useStockTradesWithoutTransfer() {
  return useQuery({
    queryKey: ['stockTradesWithoutTransfer'],
    queryFn: () => repo.countStockTradesWithoutTransfer(),
  })
}

export function useBackfillStockTradeTransfers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => repo.backfillStockTradeTransfers(),
    onSettled: () => invalidateStockTrades(qc),
  })
}
```

- [ ] **Step 2: Kiểm kiểu và chạy test**

Run: `npx tsc -b --noEmit && npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/queries.ts
git commit -m "feat(vi-tien): so lenh doi thi so du va giao dich cung phai lam moi"
```

---

### Task 7: `walletCash` trong danh mục

**Files:**
- Modify: `src/features/assets/portfolio.ts:44-70` (`interface Portfolio`), phần `return` của `buildPortfolio`
- Modify: `src/features/assets/useInvestData.ts:88-99`
- Test: `src/features/assets/portfolio.test.ts`

**Interfaces:**
- Consumes: `AccountBalanceRow.cash_account_id` (Task 1)
- Produces: `Portfolio.walletCash: number | null`; `buildPortfolio(accounts, priceBySymbol, walletCash?: number | null)`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `src/features/assets/portfolio.test.ts`:

```ts
describe('walletCash — tiền ở ví liên kết', () => {
  it('không truyền ví → null, và marketValue không đổi', () => {
    const p = buildPortfolio([], new Map())
    expect(p.walletCash).toBeNull()
  })

  it('truyền ví → giữ nguyên số đó, KHÔNG cộng vào marketValue', () => {
    const p = buildPortfolio(
      [{ accountId: 'a', accountName: 'iDragon', balance: 0, trades: [] }],
      new Map(),
      10_000_000,
    )
    expect(p.walletCash).toBe(10_000_000)
    // marketValue là con số mà tab Tài sản và account_valuations dùng — cộng ví vào đây
    // là đếm ngân hàng hai lần.
    expect(p.marketValue).toBe(0)
  })
})
```

> Kiểm lại tên import và cách dựng `AccountTrades` mà file test hiện có đang dùng, rồi bám theo đúng cách đó.

- [ ] **Step 2: Chạy test để thấy nó thất bại**

Run: `npx vitest run src/features/assets/portfolio.test.ts`
Expected: FAIL — `Property 'walletCash' does not exist`.

- [ ] **Step 3: Cài đặt**

Trong `src/features/assets/portfolio.ts`, thêm vào `interface Portfolio` (ngay dưới `cash`):

```ts
  /**
   * Số dư của tài khoản ví đã khai (`accounts.cash_account_id`); null = chưa khai ví.
   *
   * CỐ Ý đứng ngoài `marketValue`: `marketValue` là con số mà dòng tài khoản ở tab Tài
   * sản và `account_valuations` dùng, mà tài khoản ví đã tự đứng thành một dòng ở đó
   * rồi. Cộng vào là đếm ngân hàng hai lần. Chỉ tab Cổ phiếu VN cộng nó vào, và đó là
   * một câu hỏi khác: "tiền cổ phiếu VN của tôi đang là bao nhiêu".
   */
  walletCash: number | null
```

Đổi chữ ký:

```ts
export function buildPortfolio(
  accounts: AccountTrades[],
  priceBySymbol: Map<string, number>,
  walletCash: number | null = null,
): Portfolio {
```

Và thêm `walletCash` vào object `return` của hàm.

Trong `src/features/assets/useInvestData.ts`, sửa `useMemo` dựng `portfolio`:

```ts
  const portfolio = useMemo(() => {
    const balanceById = new Map(balances.map((b) => [b.id, b.balance]))
    const input: AccountTrades[] = shown.map((a) => ({
      accountId: a.id,
      accountName: a.name,
      balance: balanceById.get(a.id) ?? 0,
      trades: allTrades.filter((t) => t.account_id === a.id).map(asTrade),
    }))
    // Ví của các tài khoản đang xét, mỗi ví đếm ĐÚNG MỘT LẦN: hai tài khoản chứng khoán
    // trỏ chung một ngân hàng là chuyện bình thường, cộng hai lần là bịa ra tiền.
    const viIds = new Set(
      shown.map((a) => a.cash_account_id).filter((id): id is string => !!id),
    )
    const walletCash =
      viIds.size === 0
        ? null
        : [...viIds].reduce((s, id) => s + (balanceById.get(id) ?? 0), 0)
    return buildPortfolio(input, priceBySymbol, walletCash)
  }, [shown, balances, allTrades, priceBySymbol])
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `npx vitest run src/features/assets/portfolio.test.ts && npx tsc -b --noEmit`
Expected: PASS cả hai.

- [ ] **Step 5: Commit**

```bash
git add src/features/assets/portfolio.ts src/features/assets/portfolio.test.ts src/features/assets/useInvestData.ts
git commit -m "feat(vi-tien): danh muc biet tien dang nam o vi lien ket"
```

---

### Task 8: Ô "Ví tiền" trong form tài khoản

**Files:**
- Modify: `src/features/accounts/AccountsPage.tsx:264` (state), `:300` (danh sách chọn), `:320-345` (lúc lưu), `:493-514` (JSX)

**Interfaces:**
- Consumes: `NewAccount.cash_account_id` (Task 1)
- Produces: người dùng khai được ví ở giao diện

- [ ] **Step 1: Thêm state và danh sách lựa chọn**

Ngay dưới `const [paymentAccountId, …]` (dòng 264):

```ts
  // Tài khoản đầu tư VND: ví tiền — nơi tiền thật sự đi ra khi mua cổ phiếu (0054).
  const [cashAccountId, setCashAccountId] = useState(account?.cash_account_id ?? '')
```

Ngay dưới `paymentSourceOptions` (dòng ~300):

```ts
  // Ví tiền của tài khoản đầu tư: cùng loại tiền, không phải chính nó, chưa lưu trữ.
  // Không loại thẻ tín dụng ở đây — tiền mua cổ phiếu không đi ra từ thẻ, nhưng lọc
  // theo `type` là đoán hộ; điều kiện thật là "cùng loại tiền và không phải chính nó".
  const cashWalletOptions = accounts.filter(
    (a) => a.currency === currency && !a.is_archived && a.id !== account?.id,
  )
```

- [ ] **Step 2: Ghi giá trị khi lưu**

Trong `handleSubmit`, ngay dưới `validPaymentAccount` (dòng ~326):

```ts
    // Chỉ nhận ví khi tài khoản là đầu tư VND và lựa chọn còn hợp lệ — đổi loại tiền
    // hay đổi loại tài khoản xong mà vẫn giữ ví cũ là ghi một liên kết đã hết nghĩa.
    const validCashAccount =
      isInvestment &&
      currency === 'VND' &&
      cashAccountId !== '' &&
      cashWalletOptions.some((a) => a.id === cashAccountId)
        ? cashAccountId
        : null
```

Và trong object `input: NewAccount`, ngay dưới `payment_account_id`:

```ts
        cash_account_id: validCashAccount,
```

- [ ] **Step 3: Thêm JSX**

Đặt ngay **dưới** khối `{isCard && (…)}` chứa ô "Tài khoản nguồn trả thẻ" (kết thúc ở dòng ~515), theo đúng cùng khuôn:

```tsx
        {isInvestment && currency === 'VND' && (
          <>
            <label className="mb-1 block text-sm text-fg-secondary" htmlFor={`${uid}-viTien`}>
              Ví tiền
            </label>
            <Select
              id={`${uid}-viTien`}
              value={cashAccountId}
              onChange={(e) => setCashAccountId(e.target.value)}
              wrapClassName="mb-1 w-full">
              <option value="">— Không nối —</option>
              {cashWalletOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <p className="mb-3 text-sm text-fg-muted">
              Tiền mua cổ phiếu đi ra từ tài khoản này. Mỗi lệnh bạn ghi, app tự ghi kèm
              một lần chuyển tiền — số dư ngân hàng khỏi cao hơn thực tế.
            </p>
          </>
        )}
```

> Kiểm lại tên biến `uid` và các class mà khối "Tài khoản nguồn trả thẻ" ngay trên đang dùng, rồi bám theo y hệt. **Không** chêm giá trị tuỳ ý (`text-[…]`, mã màu) — `tests/designSystem.test.ts` sẽ đỏ.

- [ ] **Step 4: Kiểm kiểu và chạy test**

Run: `npx tsc -b --noEmit && npm test`
Expected: PASS, kể cả `tests/designSystem.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/AccountsPage.tsx
git commit -m "feat(vi-tien): khai vi tien ngay trong form tai khoan"
```

---

### Task 9: Tab Cổ phiếu VN — tiền chưa mua và dải ghi bù

**Files:**
- Modify: `src/features/assets/InvestStocksTab.tsx` (khối `<dl>` quanh dòng 158-175, và chỗ đặt dải mới)

**Interfaces:**
- Consumes: `Portfolio.walletCash` (Task 7), `useStockTradesWithoutTransfer`, `useBackfillStockTradeTransfers` (Task 6)
- Produces: giao diện cuối cùng của tính năng

- [ ] **Step 1: Đọc dòng "Tiền chưa mua" từ ví**

Thay khối `<div>` chứa `<dt>Tiền chưa mua</dt>` (dòng ~163-175) bằng:

```tsx
          <div>
            <dt className="text-fg-muted">Tiền chưa mua</dt>
            <dd>
              <Money
                amount={p.cash + (p.walletCash ?? 0)}
                currency={VND}
                tone={p.cash + (p.walletCash ?? 0) < 0 ? 'out' : 'neutral'}
                className="font-semibold"
              />
              {p.walletCash !== null && (
                <span className="block text-2xs text-fg-muted">
                  gồm <Money amount={p.walletCash} currency={VND} /> ở ví
                </span>
              )}
            </dd>
          </div>
```

- [ ] **Step 2: Cộng ví vào "Giá trị danh mục"**

Tìm chỗ đang in `giaTriBase` / `portfolio.marketValue` ở đầu thẻ tóm tắt. Sửa `giaTriBase` để cộng ví, giữ nguyên luật "null thì không in":

```tsx
  // Giá trị danh mục của TAB này gồm cả ví — câu hỏi ở đây là "tiền cổ phiếu VN của tôi
  // đang là bao nhiêu". `portfolio.marketValue` (không có ví) mới là con số mà dòng tài
  // khoản ở tab Tài sản dùng; hai màn trả lời hai câu khác nhau, cố ý không bằng nhau.
  const giaTriVND =
    portfolio.marketValue === null ? null : portfolio.marketValue + (portfolio.walletCash ?? 0)
  const giaTriBase = giaTriVND === null ? null : convertToBase(giaTriVND, VND, base, rates ?? {})
```

Rồi thay mọi chỗ in số VND của giá trị danh mục trong thẻ đó bằng `giaTriVND`. `marketValue === null` vẫn dẫn tới **không in số nào** — y như hôm nay.

- [ ] **Step 3: Thêm dải ghi bù**

Thêm hook ở đầu component (cạnh `useRates`):

```ts
  const { data: soLenhThieu = 0 } = useStockTradesWithoutTransfer()
  const ghiBu = useBackfillStockTradeTransfers()
```

Đặt dải ngay **trên** thẻ tóm tắt danh mục, dùng đúng bộ class mà dải cảnh báo `oversold` (dòng ~205) đang dùng:

```tsx
      {soLenhThieu > 0 && (
        <div className="rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-2xs text-state-warn-fg">
          <p>
            <Num value={soLenhThieu} /> lệnh chưa có dòng chuyển tiền, nên số dư ví đang
            cao hơn tiền thật. Ghi bù xong, Tổng tài sản sẽ đổi: ví về đúng số, còn cổ
            phiếu được tính theo giá thị trường.
          </p>
          <ActionButton
            onClick={() => ghiBu.mutate()}
            disabled={ghiBu.isPending}
            className="mt-2">
            {ghiBu.isPending ? 'Đang ghi…' : 'Ghi bù'}
          </ActionButton>
        </div>
      )}
```

Import `Num` và `ActionButton` từ `'../../components/ui'` (`ActionButton` đã được import sẵn).

> Dải hiện **kể cả khi "Tiền chưa mua" đang dương**: số dư ví lớn có thể che một `cash` âm, và lúc đó con số trông lành lặn trong khi sổ vẫn thủng. Đừng thêm điều kiện `p.cash < 0`.
> Kiểm lại đúng tên prop mà `<ActionButton>` nhận (xem `src/components/ui`), rồi bám theo. **Không** tự viết nút nền xanh — `tests/designSystem.test.ts` là ban cứng.

- [ ] **Step 4: Kiểm kiểu và chạy toàn bộ test**

Run: `npx tsc -b --noEmit && npm test`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/features/assets/InvestStocksTab.tsx
git commit -m "feat(vi-tien): tab Co phieu VN noi ro tien dang nam o dau"
```

---

### Task 10: Kiểm bằng mắt và chốt

**Files:** không sửa gì nếu mọi thứ đúng.

- [ ] **Step 1: Chạy toàn bộ chốt tự động**

Run: `npx tsc -b --noEmit && npm run lint && npm test`
Expected: PASS cả ba.

- [ ] **Step 2: Mở app ở chế độ demo và đi hết luồng**

Dùng công cụ preview (`preview_start`), rồi:

1. Cài đặt → Tài khoản → sửa tài khoản đầu tư VND → chọn **Ví tiền** → lưu.
2. Vào Đầu tư → tab Cổ phiếu VN → dải ghi bù phải hiện với số lệnh đúng.
3. Bấm **Ghi bù** → dải biến mất, "Tiền chưa mua" hết âm.
4. Vào Giao dịch → thấy các dòng chuyển tiền `Mua … / Bán …` đúng ngày lệnh.
5. Ghi một lệnh mua mới → một dòng chuyển tiền mới xuất hiện ngay.
6. Xoá lệnh đó → dòng chuyển tiền biến mất.

- [ ] **Step 3: Ba thứ `npm test` không thấy**

`npm test` bắt vi phạm ở mức nguồn nhưng **không** thấy ba thứ này — phải nhìn:

1. **Chế độ Sáng** (mặc định phiên xem là Tối) — dải ghi bù và dòng "gồm … ở ví" phải đọc được.
2. **Cỡ chữ 1,25× ở bề rộng 375px** — nút "Ghi bù" không được tràn khỏi dải.
3. **Biểu thức JSX bị biến thành chuỗi** — trang không được in ra chữ `{soLenhThieu}` hay `{p.walletCash}`. Hợp kiểu nên `tsc` xanh.

Chụp màn hình gửi người dùng làm bằng chứng.

- [ ] **Step 4: Soát phạm vi thay đổi trước khi chốt**

Run: `detect_changes({scope: "compare", base_ref: "master"})` qua MCP GitNexus.
Expected: chỉ các symbol thuộc kế hoạch này. Nếu có execution flow ngoài dự kiến bị chạm, dừng và báo người dùng.

- [ ] **Step 5: Báo cáo**

Nói rõ với người dùng: đã xong những gì, `npm test` ra sao (dán số liệu thật), và **nhắc lại rằng migration 0054 phải được chạy trên Supabase** trước khi bản thật dùng được.

---

## Self-Review

**Spec coverage** — mọi mục của bản thiết kế đều có task:

| Mục trong spec | Task |
|---|---|
| Migration 0054 (2 cột, unique index, dựng lại view) | 1 |
| `database.types.ts` cùng commit | 1 |
| Hàm thuần `stockTradePosting.ts` + bảng luật mua/bán/điều chỉnh | 2 |
| Đồng bộ tạo/sửa/xoá ở cả hai repo | 3, 4 |
| `countStockTradesWithoutTransfer` + `backfillStockTradeTransfers` | 5 |
| `invalidateStockTrades` rộng ra + chú thích cũ đã sai | 6 |
| `Portfolio.walletCash`, `marketValue` giữ nguyên nghĩa | 7 |
| Ô `<Select>` "Ví tiền" | 8 |
| Hiển thị "Tiền chưa mua", "Giá trị danh mục", dải ghi bù | 9 |
| `marketValue === null` thì không in giá trị danh mục | 9, Step 2 |
| Dải hiện kể cả khi tiền chưa mua dương | 9, Step 3 |
| Chạy tay chế độ Sáng + cỡ chữ 1,25× | 10 |

**Không có trong task nào, và cố ý:** `aggregate.ts`, edge function `stock-refresh`, `_holdings.js`, `brokerCash` — spec liệt kê chúng ở "Cố ý không làm".

**Điều chỉnh so với spec:** spec viết "bổ sung cột mới vào guard `tests/accountBalancesView.test.ts`". Đọc file thật thì guard **tự suy** danh sách cột từ `AccountBalanceRow`, nên không phải sửa test — Task 1 dùng chính nó làm test đỏ/xanh. Đây là cải thiện, không phải cắt bớt.

**Type consistency** — tên dùng xuyên suốt: `cash_account_id` (cột), `stock_trade_id` (cột), `walletCash` (trường của `Portfolio`), `stockTradeCashFlow` / `missingTradeTransfers` (hàm thuần), `dongBoDongTienLenh` / `thieuDongTien` (trợ giúp trong repo, cùng tên ở cả hai bản), `countStockTradesWithoutTransfer` / `backfillStockTradeTransfers` (method của `Repo`), `useStockTradesWithoutTransfer` / `useBackfillStockTradeTransfers` (hook).
