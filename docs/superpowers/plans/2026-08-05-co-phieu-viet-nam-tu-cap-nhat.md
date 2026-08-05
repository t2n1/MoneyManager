# Tự cập nhật giá cổ phiếu Việt Nam — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tài khoản đầu tư giữ cổ phiếu Việt Nam tự có giá trị thị trường mới mỗi chiều, không cần gõ tay, kèm màn hình xem lời/lỗ từng mã.

**Architecture:** Sổ lệnh mua/bán (`stock_trades`) + bảng giá công khai (`stock_prices`). Phép tính là hàm thuần trong `src/features/assets/holdings.ts`, được gói sang edge function qua `scripts/bundle-rules.mjs` nên app và server dùng **một** bản. Edge function `stock-refresh` chạy pg_cron mỗi chiều: hút bảng giá SSI → tính → ghi vào **chính** `account_valuations`, nên toàn bộ phần tính tổng tài sản / lãi/lỗ / XIRR / biểu đồ / thông báo không phải sửa gì.

**Tech Stack:** React 19 + TanStack Query, Vite 8, Vitest 4, Tailwind 4, Supabase (Postgres + RLS + Edge Functions trên Deno), pg_cron + pg_net, esbuild (gói bộ luật).

**Spec:** [`docs/superpowers/specs/2026-08-05-co-phieu-viet-nam-tu-cap-nhat-design.md`](../specs/2026-08-05-co-phieu-viet-nam-tu-cap-nhat-design.md)

## Global Constraints

- **Tiền = minor units `bigint`, không bao giờ float** (nguyên tắc 0.2). VND decimals = 0 → minor unit **là đồng**. Giá cổ phiếu là **đồng/cổ**.
- **Mọi đọc/ghi đi qua interface `Repo`** (nguyên tắc 0.1) — cài **cả hai** impl: `demoRepo` (localStorage) + `supabaseRepo` (Postgres). Không component nào gọi thẳng Supabase.
- **Mọi bảng có `user_id` + RLS `"own rows"` + composite FK `(id, user_id)`** (nguyên tắc 0.5). **Ngoại lệ duy nhất:** `stock_prices` — dữ liệu công khai, xem lý giải trong spec.
- **Ô nhập tiền luôn dùng `MoneyField`** (`src/components/MoneyField.tsx`), không dùng `<input type="number">`.
- **Ngày tháng đi qua `src/lib/dates.ts`** (nguyên tắc 0.4) — `toISODate`, `addDaysISO`. Không tự cộng trừ ngày.
- **Ràng buộc 0đ:** không nguồn dữ liệu trả phí. SSI + Yahoo đều miễn phí, không khoá.
- **Tiếng Việt** cho mọi chuỗi hiển thị, comment và tên test. **Commit message không dấu** (theo lệ repo: `feat(the): tach "Ky nay" / "Chua chot" tren the tin dung`).
- **Không tạo giao dịch ảo.** Sổ lệnh KHÔNG đụng `transactions` — ledger thu/chi giữ nguyên sạch (quyết định 2 của migration 0016).
- Chạy toàn bộ test: `npm test`. Lint: `npm run lint`. Build kiểm kiểu: `npm run build`.

## File Structure

| File | Trách nhiệm |
|------|-------------|
| `src/features/assets/holdings.ts` | **Mới.** Phép tính thuần: sổ lệnh → số cổ + giá vốn; tiền chưa đầu tư; giá trị danh mục. Không import React. |
| `src/features/assets/holdings.test.ts` | **Mới.** Test cho trên. |
| `supabase/migrations/0035_stock_prices_trades.sql` | **Mới.** 2 bảng + cột `source`. |
| `src/types/database.types.ts` | **Sửa.** `StockPriceRow`, `StockTradeRow`, `StockTradeKind`; `AccountValuationRow.source`; đăng ký 2 bảng. |
| `src/data/repo.ts` | **Sửa.** `NewStockTrade`, `StockTradePatch`, 5 method, `BackupData.stockTrades`, `BACKUP_VERSION` 6→7. |
| `src/data/demoRepo.ts` | **Sửa.** Cài 5 method + seed + guard `deleteAccount` + export/import. |
| `src/data/supabaseRepo.ts` | **Sửa.** Cài 5 method + export/import. |
| `src/hooks/queries.ts` | **Sửa.** `useStockPrices`, `useStockTrades`, 3 mutation hook. |
| `src/features/assets/HoldingsSection.tsx` | **Mới.** Khu "Danh mục" — file riêng vì `AccountDetailPage.tsx` đã 515 dòng. |
| `src/features/assets/TradeFormSheet.tsx` | **Mới.** Sheet ghi/sửa lệnh. |
| `src/features/assets/AccountDetailPage.tsx` | **Sửa.** Gắn `HoldingsSection` (chỉ vài dòng). |
| `src/features/assets/serverBundle.ts` | **Mới.** Mặt tiếp xúc app ↔ edge function `stock-refresh`. |
| `scripts/bundle-rules.mjs` | **Sửa.** Một `ENTRY`/`OUTFILE` → danh sách `BUNDLES`. |
| `tests/pushBundle.test.ts` | **Sửa.** Canh cả hai bundle. |
| `supabase/functions/stock-refresh/index.ts` | **Mới.** Điều phối: xác thực cron → hút giá → ghi snapshot. |
| `supabase/functions/stock-refresh/prices.ts` | **Mới.** Gọi SSI, đọc bảng giá. Tách riêng để test được. |
| `supabase/functions/stock-refresh/loadInput.ts` | **Mới.** Đọc Postgres, xếp dữ liệu theo user. Không tính gì. |
| `supabase/functions/stock-refresh/_holdings.js` | **Sinh tự động.** Đừng sửa tay. |
| `docs/co-phieu-viet-nam.md` | **Mới.** Hướng dẫn deploy + hẹn cron, cùng khuôn `docs/push-notification.md`. |

---

## Task 1: Phép tính danh mục (`holdings.ts`)

Thuần, không DB, không React. Làm trước để mọi task sau có nền chắc.

**Files:**
- Create: `src/features/assets/holdings.ts`
- Test: `src/features/assets/holdings.test.ts`

**Interfaces:**
- Consumes: không gì (task đầu).
- Produces:
  - `Trade { symbol: string; kind: 'buy'|'sell'|'adjust'; tradedOn: string; quantity: number; price: number; fee: number; tax: number }`
  - `Holding { symbol: string; quantity: number; costBasis: number; avgCost: number }`
  - `HoldingsResult { holdings: Holding[]; realizedPnl: number; oversold: string[] }`
  - `PortfolioValue { marketValue: number | null; stockValue: number; cash: number; missingPrices: string[] }`
  - `holdingsFromTrades(trades: Trade[]): HoldingsResult`
  - `brokerCash(accountBalance: number, trades: Trade[]): number`
  - `portfolioValue(holdings: Holding[], priceBySymbol: Map<string, number>, cash: number): PortfolioValue`

- [ ] **Step 1: Viết test thất bại**

Create `src/features/assets/holdings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { brokerCash, holdingsFromTrades, portfolioValue, type Trade } from './holdings'

/** Lệnh mua/bán gọn cho test — mặc định phí/thuế 0 để phép tính dễ nhẩm. */
function mua(symbol: string, quantity: number, price: number, tradedOn = '2026-01-05', fee = 0): Trade {
  return { symbol, kind: 'buy', tradedOn, quantity, price, fee, tax: 0 }
}
function ban(
  symbol: string,
  quantity: number,
  price: number,
  tradedOn = '2026-02-05',
  fee = 0,
  tax = 0,
): Trade {
  return { symbol, kind: 'sell', tradedOn, quantity, price, fee, tax }
}
function dieuChinh(symbol: string, quantity: number, tradedOn = '2026-03-05'): Trade {
  return { symbol, kind: 'adjust', tradedOn, quantity, price: 0, fee: 0, tax: 0 }
}

describe('holdingsFromTrades', () => {
  it('sổ lệnh rỗng → không giữ gì', () => {
    expect(holdingsFromTrades([])).toEqual({ holdings: [], realizedPnl: 0, oversold: [] })
  })

  it('mua một lần: giá vốn gồm cả phí', () => {
    const { holdings } = holdingsFromTrades([mua('FPT', 1_000, 70_000, '2026-01-05', 105_000)])
    expect(holdings).toEqual([
      { symbol: 'FPT', quantity: 1_000, costBasis: 70_105_000, avgCost: 70_105 },
    ])
  })

  it('mua nhiều lần cùng mã: giá vốn bình quân gia quyền', () => {
    const { holdings } = holdingsFromTrades([
      mua('HPG', 1_000, 20_000, '2026-01-05'),
      mua('HPG', 1_000, 30_000, '2026-01-20'),
    ])
    expect(holdings[0].quantity).toBe(2_000)
    expect(holdings[0].costBasis).toBe(50_000_000)
    expect(holdings[0].avgCost).toBe(25_000)
  })

  it('bán một phần: trừ theo giá vốn bình quân, lãi tính đúng', () => {
    const { holdings, realizedPnl } = holdingsFromTrades([
      mua('HPG', 2_000, 25_000, '2026-01-05'),
      ban('HPG', 500, 30_000, '2026-02-05'),
    ])
    expect(holdings[0].quantity).toBe(1_500)
    expect(holdings[0].costBasis).toBe(37_500_000)
    expect(holdings[0].avgCost).toBe(25_000)
    expect(realizedPnl).toBe(2_500_000) // 500 × (30.000 − 25.000)
  })

  it('bán hết: mã rời danh mục, không còn giá vốn lơ lửng', () => {
    const { holdings, realizedPnl } = holdingsFromTrades([
      mua('FPT', 1_000, 70_000, '2026-01-05', 105_000),
      ban('FPT', 1_000, 75_000, '2026-02-05', 112_500, 75_000),
    ])
    expect(holdings).toEqual([])
    // Con số ở mục "Kiểm chứng bằng số" của spec
    expect(realizedPnl).toBe(4_707_500)
  })

  it('cổ phiếu thưởng: số cổ tăng, giá vốn tổng không đổi, bình quân giảm', () => {
    const { holdings } = holdingsFromTrades([
      mua('VNM', 1_000, 60_000, '2026-01-05'),
      dieuChinh('VNM', 100), // thưởng 10%
    ])
    expect(holdings[0].quantity).toBe(1_100)
    expect(holdings[0].costBasis).toBe(60_000_000)
    expect(holdings[0].avgCost).toBe(54_545)
  })

  it('gộp cổ phiếu (điều chỉnh âm): số cổ giảm, giá vốn không đổi', () => {
    const { holdings } = holdingsFromTrades([
      mua('SSI', 2_000, 30_000, '2026-01-05'),
      dieuChinh('SSI', -1_000),
    ])
    expect(holdings[0].quantity).toBe(1_000)
    expect(holdings[0].costBasis).toBe(60_000_000)
    expect(holdings[0].avgCost).toBe(60_000)
  })

  it('nhập lộn xộn ngày tháng → kết quả bằng khi nhập đúng thứ tự', () => {
    const dungThuTu = holdingsFromTrades([
      mua('HPG', 1_000, 20_000, '2026-01-05'),
      mua('HPG', 1_000, 30_000, '2026-01-20'),
      ban('HPG', 1_000, 40_000, '2026-02-05'),
    ])
    const lonXon = holdingsFromTrades([
      ban('HPG', 1_000, 40_000, '2026-02-05'),
      mua('HPG', 1_000, 30_000, '2026-01-20'),
      mua('HPG', 1_000, 20_000, '2026-01-05'),
    ])
    expect(lonXon).toEqual(dungThuTu)
    expect(lonXon.realizedPnl).toBe(15_000_000) // 1.000 × (40.000 − 25.000)
  })

  it('bán quá số đang giữ → vào oversold', () => {
    const { holdings, oversold } = holdingsFromTrades([
      mua('FPT', 100, 70_000, '2026-01-05'),
      ban('FPT', 500, 75_000, '2026-02-05'),
    ])
    expect(oversold).toEqual(['FPT'])
    expect(holdings).toEqual([])
  })

  it('nhiều mã: sắp theo giá vốn giảm dần', () => {
    const { holdings } = holdingsFromTrades([
      mua('HPG', 100, 20_000, '2026-01-05'),
      mua('FPT', 100, 70_000, '2026-01-05'),
      mua('VNM', 100, 60_000, '2026-01-05'),
    ])
    expect(holdings.map((h) => h.symbol)).toEqual(['FPT', 'VNM', 'HPG'])
  })
})

describe('brokerCash', () => {
  it('nạp rồi mua: còn lại đúng phần chưa đầu tư', () => {
    const cash = brokerCash(100_000_000, [mua('FPT', 1_000, 70_000, '2026-01-05', 105_000)])
    expect(cash).toBe(29_895_000)
  })

  it('bán ra thì tiền quay lại, đã trừ phí và thuế', () => {
    const cash = brokerCash(100_000_000, [
      mua('FPT', 1_000, 70_000, '2026-01-05', 105_000),
      ban('FPT', 1_000, 75_000, '2026-02-05', 112_500, 75_000),
    ])
    expect(cash).toBe(104_707_500)
  })

  it('điều chỉnh không tốn tiền', () => {
    expect(brokerCash(10_000_000, [dieuChinh('VNM', 100)])).toBe(10_000_000)
  })

  it('mua nhiều hơn tiền đã nạp → âm, KHÔNG kẹp về 0', () => {
    expect(brokerCash(1_000_000, [mua('FPT', 1_000, 70_000, '2026-01-05')])).toBe(-69_000_000)
  })
})

describe('portfolioValue', () => {
  const holdings = [{ symbol: 'FPT', quantity: 1_000, costBasis: 70_105_000, avgCost: 70_105 }]

  it('đủ giá: cổ phiếu theo giá hôm nay + tiền chưa đầu tư', () => {
    const v = portfolioValue(holdings, new Map([['FPT', 75_000]]), 29_895_000)
    expect(v.stockValue).toBe(75_000_000)
    expect(v.marketValue).toBe(104_895_000)
    expect(v.missingPrices).toEqual([])
  })

  it('thiếu giá một phần: mã đó tạm tính theo giá vốn và bị nêu tên', () => {
    const hai = [...holdings, { symbol: 'XYZ', quantity: 10, costBasis: 1_000_000, avgCost: 100_000 }]
    const v = portfolioValue(hai, new Map([['FPT', 75_000]]), 0)
    expect(v.missingPrices).toEqual(['XYZ'])
    expect(v.stockValue).toBe(76_000_000)
    expect(v.marketValue).toBe(76_000_000)
  })

  it('thiếu giá MỌI mã → null, vì kết quả chỉ bằng đúng số dư sổ', () => {
    const v = portfolioValue(holdings, new Map(), 29_895_000)
    expect(v.marketValue).toBeNull()
  })

  it('tiền chưa đầu tư âm → null, thà giữ số cũ hơn ghi số sai', () => {
    const v = portfolioValue(holdings, new Map([['FPT', 75_000]]), -1)
    expect(v.marketValue).toBeNull()
  })

  it('bán sạch: không còn mã nào, giá trị = tiền chưa đầu tư', () => {
    const v = portfolioValue([], new Map(), 104_707_500)
    expect(v.marketValue).toBe(104_707_500)
    expect(v.stockValue).toBe(0)
  })

  it('giá bằng 0 hoặc âm coi như thiếu giá', () => {
    const v = portfolioValue(holdings, new Map([['FPT', 0]]), 1_000)
    expect(v.missingPrices).toEqual(['FPT'])
  })
})
```

- [ ] **Step 2: Chạy test để chắc là nó đỏ**

Run: `npx vitest run src/features/assets/holdings.test.ts`

Expected: FAIL — `Failed to resolve import "./holdings"`.

- [ ] **Step 3: Viết `holdings.ts`**

Create `src/features/assets/holdings.ts`:

```ts
// Danh mục cổ phiếu dựng từ sổ lệnh — thuần, không phụ thuộc React, để unit-test được.
//
// Số dư sổ của tài khoản đầu tư (view account_balances) là VỐN GỐC RÒNG: tiền nạp − rút.
// Sổ lệnh (stock_trades) KHÔNG đụng số dư đó — nó chỉ nói tiền đã biến thành cổ phiếu
// nào. Nên giá trị thị trường = cổ phiếu theo giá hôm nay + tiền chưa kịp mua gì.
//
// Mọi số ở minor units VND. VND có decimals = 0 nên minor unit CHÍNH LÀ đồng, và giá là
// đồng/cổ — không nhân chia gì thêm.

export interface Trade {
  symbol: string
  kind: 'buy' | 'sell' | 'adjust'
  /** ISO date. Quyết định thứ tự cộng dồn — giá vốn bình quân phụ thuộc trình tự. */
  tradedOn: string
  /** số cổ; âm chỉ hợp lệ với kind='adjust' (gộp cổ phiếu) */
  quantity: number
  /** đồng/cổ; luôn 0 với kind='adjust' */
  price: number
  fee: number
  tax: number
}

export interface Holding {
  symbol: string
  /** số cổ đang giữ (luôn > 0 — mã bán sạch không xuất hiện) */
  quantity: number
  /** đồng, đã gồm phí mua */
  costBasis: number
  /** đồng/cổ */
  avgCost: number
}

export interface HoldingsResult {
  /** chỉ mã còn giữ, sắp theo giá vốn giảm dần */
  holdings: Holding[]
  /** lãi/lỗ đã hiện thực hoá từ các lệnh bán (đồng; có thể âm) */
  realizedPnl: number
  /** mã bị bán quá số đang giữ → sổ lệnh có lỗ hổng */
  oversold: string[]
}

export interface PortfolioValue {
  /** null = không đáng tin; xem `portfolioValue` */
  marketValue: number | null
  /** cổ phiếu theo giá hôm nay; mã thiếu giá tạm tính theo giá vốn */
  stockValue: number
  cash: number
  /** mã chưa có giá, đang tạm tính theo giá vốn */
  missingPrices: string[]
}

/**
 * Cộng dồn sổ lệnh ra số cổ và giá vốn từng mã.
 *
 * Bán trừ theo **giá vốn bình quân**, không FIFO — đúng cách công ty chứng khoán Việt
 * Nam tính, nên số trong app khớp sao kê của người dùng.
 */
export function holdingsFromTrades(trades: Trade[]): HoldingsResult {
  const acc = new Map<string, { quantity: number; costBasis: number }>()
  const oversold = new Set<string>()
  let realizedPnl = 0

  // Sort ổn định của JS giữ nguyên thứ tự nhập với các lệnh cùng ngày.
  const inOrder = trades.slice().sort((a, b) => a.tradedOn.localeCompare(b.tradedOn))

  for (const t of inOrder) {
    const h = acc.get(t.symbol) ?? { quantity: 0, costBasis: 0 }

    if (t.kind === 'buy') {
      h.quantity += t.quantity
      h.costBasis += t.quantity * t.price + t.fee
    } else if (t.kind === 'sell') {
      const avg = h.quantity > 0 ? h.costBasis / h.quantity : 0
      if (t.quantity > h.quantity) oversold.add(t.symbol)
      // Kẹp về số thực đang giữ: bán quá tay thì `oversold` đã báo, không cần thêm
      // một con số lãi khổng lồ vô nghĩa nữa.
      const sold = Math.min(t.quantity, h.quantity)
      realizedPnl += sold * t.price - t.fee - t.tax - sold * avg
      h.quantity -= sold
      h.costBasis -= sold * avg
      // Bán sạch thì xoá phần dư do chia lẻ — thiếu dòng này, mã đã bán hết vẫn còn
      // vài đồng giá vốn lơ lửng và lần mua sau sẽ tính bình quân sai.
      if (h.quantity === 0) h.costBasis = 0
    } else {
      // Cổ phiếu thưởng / cổ tức bằng cổ phiếu / chia tách: số cổ đổi, giá vốn KHÔNG
      // đổi → bình quân tự giảm. Đó đúng là bản chất của việc được thưởng.
      h.quantity += t.quantity
      if (h.quantity < 0) {
        oversold.add(t.symbol)
        h.quantity = 0
        h.costBasis = 0
      }
    }

    acc.set(t.symbol, h)
  }

  const holdings: Holding[] = [...acc.entries()]
    .filter(([, h]) => h.quantity > 0)
    .map(([symbol, h]) => ({
      symbol,
      quantity: h.quantity,
      costBasis: Math.round(h.costBasis),
      avgCost: Math.round(h.costBasis / h.quantity),
    }))
    .sort((a, b) => b.costBasis - a.costBasis || a.symbol.localeCompare(b.symbol))

  return {
    holdings,
    realizedPnl: Math.round(realizedPnl),
    oversold: [...oversold].sort(),
  }
}

/**
 * Tiền còn nằm ở công ty chứng khoán, chưa mua gì.
 *
 * `accountBalance` là số dư sổ (nạp − rút, đã gồm cổ tức tiền nếu người dùng ghi là
 * thu nhập). Trừ tiền đã bỏ ra mua, cộng lại tiền thu về khi bán.
 *
 * Trả số âm khi người dùng ghi lệnh mua mà quên ghi lần nạp tiền. **Không kẹp về 0**:
 * con số âm là dấu hiệu duy nhất cho biết sổ lệnh có lỗ hổng, kẹp đi là che mất nó.
 */
export function brokerCash(accountBalance: number, trades: Trade[]): number {
  let spent = 0
  for (const t of trades) {
    if (t.kind === 'buy') spent += t.quantity * t.price + t.fee
    else if (t.kind === 'sell') spent -= t.quantity * t.price - t.fee - t.tax
  }
  return Math.round(accountBalance - spent)
}

/**
 * Giá trị thị trường của cả tài khoản = cổ phiếu theo giá hôm nay + tiền chưa đầu tư.
 *
 * `marketValue` trả `null` ở đúng hai trường hợp, và cả hai đều nghĩa là "đừng ghi
 * con số này vào sổ":
 * - `cash < 0` — sổ lệnh thiếu lần nạp tiền, kết quả chắc chắn sai.
 * - thiếu giá **mọi** mã đang giữ — lúc đó tất cả rơi về giá vốn nên kết quả chỉ bằng
 *   đúng số dư sổ, không nói thêm được gì so với việc chưa có snapshot nào.
 *
 * Thiếu giá **một phần** thì vẫn trả số: mã thiếu tạm tính theo giá vốn và có tên trong
 * `missingPrices`. Cùng cách app xử lý thiếu tỷ giá (`hasMissingRate`) — ra số gần đúng
 * kèm cảnh báo, thay vì âm thầm bỏ mã đó khỏi tổng.
 */
export function portfolioValue(
  holdings: Holding[],
  priceBySymbol: Map<string, number>,
  cash: number,
): PortfolioValue {
  let stockValue = 0
  const missingPrices: string[] = []

  for (const h of holdings) {
    const price = priceBySymbol.get(h.symbol)
    if (price == null || price <= 0) {
      missingPrices.push(h.symbol)
      stockValue += h.costBasis
    } else {
      stockValue += h.quantity * price
    }
  }

  const allMissing = holdings.length > 0 && missingPrices.length === holdings.length
  const marketValue = cash < 0 || allMissing ? null : stockValue + cash

  return { marketValue, stockValue, cash, missingPrices }
}
```

- [ ] **Step 4: Chạy test để chắc là nó xanh**

Run: `npx vitest run src/features/assets/holdings.test.ts`

Expected: PASS — 21 test.

- [ ] **Step 5: Lint và kiểm kiểu**

Run: `npm run lint && npx tsc -b`

Expected: không lỗi.

- [ ] **Step 6: Commit**

```bash
git add src/features/assets/holdings.ts src/features/assets/holdings.test.ts
git commit -m "feat(dau-tu): phep tinh danh muc co phieu tu so lenh"
```

---

## Task 2: Migration `0035` + kiểu dữ liệu

**Files:**
- Create: `supabase/migrations/0035_stock_prices_trades.sql`
- Modify: `src/types/database.types.ts`

**Interfaces:**
- Consumes: không gì từ Task 1 (độc lập).
- Produces:
  - `StockPriceRow { symbol: string; exchange: 'hose'|'hnx'|'upcom'; name: string; price: number; prior_close: number | null; trading_date: string; updated_at: string }`
  - `StockTradeKind = 'buy' | 'sell' | 'adjust'`
  - `StockTradeRow { id, user_id, account_id, symbol, kind: StockTradeKind, traded_on, quantity, price, fee, tax, note, created_at, updated_at }` (mọi số là `number`, mọi ngày/chuỗi là `string`)
  - `AccountValuationRow.source: 'manual' | 'auto'`

- [ ] **Step 1: Viết migration**

Create `supabase/migrations/0035_stock_prices_trades.sql`:

```sql
-- ============================================================
-- Sổ Chi Tiêu — Migration 0035: Tự cập nhật giá cổ phiếu Việt Nam
--
-- Nối tiếp 0016 (giá trị đầu tư): 0016 lưu MỘT con số tổng do người dùng gõ tay. Ở đây
-- thêm SỔ LỆNH để app biết đang giữ mã nào, bao nhiêu cổ — nhờ vậy edge function
-- stock-refresh tính được giá trị thị trường và tự ghi vào account_valuations.
--
-- Sổ lệnh KHÔNG phải dòng tiền: không đụng transactions, không đụng số dư. Nó chỉ nói
-- tiền trong tài khoản chứng khoán đang nằm ở dạng cổ phiếu nào. Ledger thu/chi giữ
-- nguyên sạch (đúng quyết định 2 của 0016).
--
-- Xem thêm: docs/superpowers/specs/2026-08-05-co-phieu-viet-nam-tu-cap-nhat-design.md
-- ============================================================

-- ------------------------------------------------------------
-- 1. Bảng giá chung
--
-- Bảng DUY NHẤT trong dự án không có user_id (ngoại lệ có ý thức với nguyên tắc 0.5):
-- giá cổ phiếu là dữ liệu công khai, giống hệt nhau với mọi user, và không suy ra được
-- ai đang giữ gì từ nó. Nhân bản theo user chỉ để thoả hình thức thì đổi lấy 400+ hàng
-- mỗi người và một vòng lặp hút giá cho từng user. Phần riêng tư nằm ở stock_trades.
-- ------------------------------------------------------------
create table public.stock_prices (
  symbol       text primary key,
  exchange     text        not null check (exchange in ('hose', 'hnx', 'upcom')),
  -- companyNameVi của SSI — để gợi ý khi người dùng gõ tìm mã.
  name         text        not null default '',
  -- ĐỒNG/CỔ. VND có decimals = 0 nên minor unit chính là đồng, không nhân chia gì.
  price        bigint      not null check (price > 0),
  -- Giá tham chiếu phiên trước, để hiện % thay đổi trong ngày; null = không có.
  prior_close  bigint,
  -- Ngày PHIÊN mà giá này thuộc về (không phải ngày hút). Ngày lễ sàn không chạy nên
  -- SSI vẫn trả ngày phiên cũ — cột này là thứ giúp cron biết mà không ghi trùng.
  trading_date date        not null,
  updated_at   timestamptz not null default now()
);

alter table public.stock_prices enable row level security;

-- Đọc: mọi user đã đăng nhập. Ghi: không policy nào → chỉ service role (edge function).
create policy "read for authenticated" on public.stock_prices
  for select to authenticated
  using (true);

-- ------------------------------------------------------------
-- 2. Sổ lệnh
-- ------------------------------------------------------------
create table public.stock_trades (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  account_id uuid        not null,
  symbol     text        not null,
  -- 'adjust' = cổ phiếu thưởng / cổ tức bằng cổ phiếu / chia tách hoặc gộp. Không có
  -- loại này thì mỗi lần được thưởng, số cổ trong app sai vĩnh viễn mà không cách nào
  -- sửa ngoài việc bịa một lệnh mua giá 0. Cổ phiếu Việt Nam chia thưởng rất thường.
  kind       text        not null check (kind in ('buy', 'sell', 'adjust')),
  traded_on  date        not null default current_date,
  -- Số cổ. Âm CHỈ hợp lệ với kind='adjust' (gộp cổ phiếu) — xem ràng buộc dưới.
  quantity   bigint      not null,
  price      bigint      not null default 0 check (price >= 0),
  fee        bigint      not null default 0 check (fee >= 0),
  -- Thuế bán 0,1% ở Việt Nam. Mua không có thuế nên cột này luôn 0 với kind='buy'.
  tax        bigint      not null default 0 check (tax >= 0),
  note       text        not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite FK: đảm bảo tài khoản thuộc đúng user; xoá tài khoản → xoá sổ lệnh.
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  constraint stock_trades_shape check (
    case kind
      when 'adjust' then quantity <> 0 and price = 0
      else quantity > 0 and price > 0
    end
  )
);

create index stock_trades_account_idx on public.stock_trades (account_id, traded_on);

alter table public.stock_trades enable row level security;

create policy "own rows" on public.stock_trades
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger stock_trades_moddatetime
  before update on public.stock_trades
  for each row execute function extensions.moddatetime (updated_at);

-- ------------------------------------------------------------
-- 3. account_valuations: đánh dấu số nào của người, số nào của máy
--
-- Mặc định 'manual' nên mọi snapshot cũ tự thuộc về người dùng. Cron ghi bằng
-- `on conflict ... do update ... where source = 'auto'` — nhờ mệnh đề where đó, hàng
-- người dùng gõ tay không bao giờ bị đè.
-- ------------------------------------------------------------
alter table public.account_valuations
  add column source text not null default 'manual'
    check (source in ('manual', 'auto'));
```

- [ ] **Step 2: Áp migration lên DB local và xem nó chạy**

Run: `supabase db reset`

Expected: chạy hết `0001` → `0035` không lỗi. Nếu chưa có Supabase local thì thay bằng: dán nội dung file vào SQL editor của project, chạy, không lỗi.

- [ ] **Step 3: Thêm kiểu dòng vào `database.types.ts`**

Modify `src/types/database.types.ts` — thêm ngay sau `AccountValuationRow` (khoảng dòng 222-232):

```ts
/** Bảng giá cổ phiếu Việt Nam (công khai, không thuộc user nào) — migration 0035. */
export type StockPriceRow = {
  symbol: string
  exchange: 'hose' | 'hnx' | 'upcom'
  name: string
  /** đồng/cổ; luôn > 0 */
  price: number
  /** giá tham chiếu phiên trước; null = không có */
  prior_close: number | null
  /** ngày PHIÊN của giá này (không phải ngày hút) */
  trading_date: string
  updated_at: string
}

export type StockTradeKind = 'buy' | 'sell' | 'adjust'

/** Một lệnh mua/bán/điều chỉnh cổ phiếu — migration 0035. */
export type StockTradeRow = {
  id: string
  user_id: string
  account_id: string
  symbol: string
  kind: StockTradeKind
  traded_on: string
  /** số cổ; âm chỉ với kind='adjust' (gộp cổ phiếu) */
  quantity: number
  /** đồng/cổ; 0 với kind='adjust' */
  price: number
  fee: number
  /** thuế bán 0,1%; 0 với mua và điều chỉnh */
  tax: number
  note: string
  created_at: string
  updated_at: string
}
```

- [ ] **Step 4: Thêm `source` vào `AccountValuationRow`**

Modify `src/types/database.types.ts` — trong `AccountValuationRow`, thêm sau `note`:

```ts
  note: string
  /** 'auto' = do edge function stock-refresh ghi; 'manual' = người dùng gõ tay (không bị cron đè) */
  source: 'manual' | 'auto'
  created_at: string
```

- [ ] **Step 5: Đăng ký hai bảng trong `Database`**

Modify `src/types/database.types.ts` — thêm ngay sau block `account_valuations` (dòng ~686):

```ts
      stock_prices: {
        Row: StockPriceRow
        Insert: InsertOf<
          StockPriceRow,
          'symbol' | 'exchange' | 'price' | 'trading_date',
          'name' | 'prior_close' | 'updated_at'
        >
        Update: Partial<
          Pick<StockPriceRow, 'exchange' | 'name' | 'price' | 'prior_close' | 'trading_date' | 'updated_at'>
        >
        Relationships: []
      }
      stock_trades: {
        Row: StockTradeRow
        Insert: InsertOf<
          StockTradeRow,
          'user_id' | 'account_id' | 'symbol' | 'kind' | 'quantity',
          'id' | 'traded_on' | 'price' | 'fee' | 'tax' | 'note'
        >
        Update: Partial<
          Pick<StockTradeRow, 'symbol' | 'kind' | 'traded_on' | 'quantity' | 'price' | 'fee' | 'tax' | 'note'>
        >
        Relationships: []
      }
```

Và sửa `Update` của `account_valuations` để cho ghi `source`:

```ts
        Update: Partial<Pick<AccountValuationRow, 'valued_on' | 'market_value' | 'note' | 'source'>>
```

- [ ] **Step 6: Kiểm kiểu**

Run: `npx tsc -b`

Expected: FAIL — `demoRepo.ts` báo thiếu `source` khi dựng `AccountValuationRow`. Đó là đúng: Task 3 sửa.

- [ ] **Step 7: Vá `demoRepo` cho đủ kiểu (phần nhỏ nhất để xanh lại)**

Modify `src/data/demoRepo.ts` — trong `upsertValuation`, thêm `source` vào object `row`:

```ts
    const row: AccountValuationRow = {
      id: uuid(),
      user_id: DEMO_USER,
      account_id: input.account_id,
      valued_on: input.valued_on,
      market_value: input.market_value,
      note: input.note,
      source: 'manual',
      created_at: nowISO(),
    }
```

Và trong seed `accountValuations` (dòng ~409) thêm `source: 'manual'` cho từng dòng có sẵn.

- [ ] **Step 8: Kiểm kiểu và chạy test**

Run: `npx tsc -b && npm test`

Expected: PASS, không lỗi kiểu.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0035_stock_prices_trades.sql src/types/database.types.ts src/data/demoRepo.ts
git commit -m "feat(dau-tu): bang gia co phieu va so lenh (migration 0035)"
```

---

## Task 3: Repo + hook + sao lưu v7

**Files:**
- Modify: `src/data/repo.ts`
- Modify: `src/data/demoRepo.ts`
- Modify: `src/data/supabaseRepo.ts`
- Modify: `src/hooks/queries.ts`
- Test: `src/data/demoRepo.test.ts`

**Interfaces:**
- Consumes: `StockPriceRow`, `StockTradeRow`, `StockTradeKind` (Task 2).
- Produces:
  - `NewStockTrade { account_id: string; symbol: string; kind: StockTradeKind; traded_on: string; quantity: number; price: number; fee: number; tax: number; note: string }`
  - `StockTradePatch = Partial<Omit<NewStockTrade, 'account_id'>>`
  - `Repo.getStockPrices(): Promise<StockPriceRow[]>`
  - `Repo.getStockTrades(): Promise<StockTradeRow[]>`
  - `Repo.createStockTrade(input: NewStockTrade): Promise<StockTradeRow>`
  - `Repo.updateStockTrade(id: string, patch: StockTradePatch): Promise<StockTradeRow>`
  - `Repo.deleteStockTrade(id: string): Promise<void>`
  - `BackupData.stockTrades?: StockTradeRow[]`, `BACKUP_VERSION = 7`
  - Hooks: `useStockPrices()`, `useStockTrades()`, `useCreateStockTrade()`, `useUpdateStockTrade()`, `useDeleteStockTrade()`

- [ ] **Step 1: Viết test thất bại cho demoRepo**

Modify `src/data/demoRepo.test.ts` — thêm vào cuối file:

```ts
describe('demoRepo: sổ lệnh cổ phiếu', () => {
  it('tạo, sửa, xoá một lệnh', async () => {
    const accounts = await demoRepo.getAccounts()
    const acc = accounts.find((a) => a.type === 'investment') ?? accounts[0]

    const created = await demoRepo.createStockTrade({
      account_id: acc.id,
      symbol: 'FPT',
      kind: 'buy',
      traded_on: '2026-08-01',
      quantity: 100,
      price: 70_000,
      fee: 10_500,
      tax: 0,
      note: '',
    })
    expect(created.symbol).toBe('FPT')
    expect(created.quantity).toBe(100)

    const sua = await demoRepo.updateStockTrade(created.id, { quantity: 200 })
    expect(sua.quantity).toBe(200)

    await demoRepo.deleteStockTrade(created.id)
    const conLai = await demoRepo.getStockTrades()
    expect(conLai.find((t) => t.id === created.id)).toBeUndefined()
  })

  it('bảng giá seed có mã để xem thử không cần mạng', async () => {
    const prices = await demoRepo.getStockPrices()
    expect(prices.map((p) => p.symbol)).toContain('FPT')
    expect(prices.every((p) => p.price > 0)).toBe(true)
  })

  it('sao lưu mang theo sổ lệnh và khôi phục lại được', async () => {
    const backup = await demoRepo.exportAll()
    expect(backup.version).toBe(7)
    expect(Array.isArray(backup.stockTrades)).toBe(true)

    await demoRepo.importAll(backup)
    const sau = await demoRepo.getStockTrades()
    expect(sau.length).toBe(backup.stockTrades?.length ?? 0)
  })

  it('không xoá được tài khoản khi còn sổ lệnh', async () => {
    const accounts = await demoRepo.getAccounts()
    const acc = accounts.find((a) => a.type === 'investment')
    if (!acc) return
    await demoRepo.createStockTrade({
      account_id: acc.id,
      symbol: 'VNM',
      kind: 'buy',
      traded_on: '2026-08-01',
      quantity: 10,
      price: 60_000,
      fee: 0,
      tax: 0,
      note: '',
    })
    await expect(demoRepo.deleteAccount(acc.id)).rejects.toThrow(/sổ lệnh/i)
  })
})
```

- [ ] **Step 2: Chạy test để chắc là nó đỏ**

Run: `npx vitest run src/data/demoRepo.test.ts`

Expected: FAIL — `demoRepo.createStockTrade is not a function`.

- [ ] **Step 3: Khai báo trong `repo.ts`**

Modify `src/data/repo.ts`:

Thêm `StockPriceRow`, `StockTradeRow`, `StockTradeKind` vào khối import type từ `../types/database.types`.

Thêm vào `BackupData` (sau `lifeEvents`):

```ts
  /** Sổ lệnh cổ phiếu Việt Nam; vắng mặt ở backup v1–v6. */
  stockTrades?: StockTradeRow[]
```

Đổi hằng số:

```ts
/** Phiên bản định dạng backup hiện hành. v7: thêm stockTrades. */
export const BACKUP_VERSION = 7
```

Thêm kiểu input (đặt cạnh `NewValuation`):

```ts
/** Một lệnh mua/bán/điều chỉnh cổ phiếu (migration 0035). Mọi số ở đồng. */
export interface NewStockTrade {
  account_id: string
  /** mã cổ phiếu, chữ in (vd 'FPT') */
  symbol: string
  kind: StockTradeKind
  traded_on: string
  /** số cổ; âm chỉ hợp lệ với kind='adjust' */
  quantity: number
  /** đồng/cổ; 0 với kind='adjust' */
  price: number
  fee: number
  tax: number
  note: string
}

/** Không cho đổi account_id: chuyển lệnh sang tài khoản khác thì xoá rồi ghi lại. */
export type StockTradePatch = Partial<Omit<NewStockTrade, 'account_id'>>
```

Thêm vào interface `Repo`, ngay sau block "Đầu tư: giá trị thị trường (mục AE)":

```ts
  // --- Cổ phiếu Việt Nam: bảng giá + sổ lệnh (migration 0035) ---
  /** Bảng giá công khai (mọi mã, mọi sàn). Chỉ đọc — edge function stock-refresh ghi. */
  getStockPrices(): Promise<StockPriceRow[]>
  /** Toàn bộ sổ lệnh của user (mọi tài khoản); UI tự lọc theo account_id. */
  getStockTrades(): Promise<StockTradeRow[]>
  createStockTrade(input: NewStockTrade): Promise<StockTradeRow>
  updateStockTrade(id: string, patch: StockTradePatch): Promise<StockTradeRow>
  deleteStockTrade(id: string): Promise<void>
```

- [ ] **Step 4: Cài trong `demoRepo.ts`**

Modify `src/data/demoRepo.ts`:

Thêm vào kiểu DB nội bộ (cạnh `accountValuations: AccountValuationRow[]`, dòng ~102):

```ts
  stockTrades: StockTradeRow[]
  stockPrices: StockPriceRow[]
```

Thêm seed (cạnh seed `accountValuations`, dòng ~409). Giá là giá thật ngày 2026-08-05 để bản demo trông hợp lý:

```ts
  // Bảng giá cứng cho chế độ demo — xem thử khu Danh mục không cần mạng.
  const stockPrices: StockPriceRow[] = [
    { symbol: 'FPT', exchange: 'hose', name: 'Công ty Cổ phần FPT', price: 70_300, prior_close: 71_500, trading_date: '2026-08-05', updated_at: nowISO() },
    { symbol: 'VNM', exchange: 'hose', name: 'Công ty Cổ phần Sữa Việt Nam', price: 58_600, prior_close: 59_500, trading_date: '2026-08-05', updated_at: nowISO() },
    { symbol: 'HPG', exchange: 'hose', name: 'Công ty Cổ phần Tập đoàn Hòa Phát', price: 22_000, prior_close: 22_150, trading_date: '2026-08-05', updated_at: nowISO() },
  ]
```

Seed sổ lệnh — trỏ vào tài khoản đầu tư có sẵn trong seed (dùng đúng biến id mà seed `accountValuations` đang dùng; nếu seed chưa có tài khoản `investment` với `currency: 'VND'` thì thêm một tài khoản như vậy vào seed accounts, tên `'Chứng khoán VN'`, `asset_group: 'Tài sản Việt Nam'`, `initial_balance: 100_000_000`):

```ts
  const stockTrades: StockTradeRow[] = [
    { id: uuid(), user_id: DEMO_USER, account_id: idChungKhoanVN, symbol: 'FPT', kind: 'buy', traded_on: '2026-03-10', quantity: 500, price: 62_000, fee: 46_500, tax: 0, note: '', created_at: nowISO(), updated_at: nowISO() },
    { id: uuid(), user_id: DEMO_USER, account_id: idChungKhoanVN, symbol: 'HPG', kind: 'buy', traded_on: '2026-04-02', quantity: 1_000, price: 21_000, fee: 31_500, tax: 0, note: '', created_at: nowISO(), updated_at: nowISO() },
    { id: uuid(), user_id: DEMO_USER, account_id: idChungKhoanVN, symbol: 'FPT', kind: 'adjust', traded_on: '2026-06-20', quantity: 50, price: 0, fee: 0, tax: 0, note: 'Cổ phiếu thưởng 10%', created_at: nowISO(), updated_at: nowISO() },
  ]
```

Nhớ thêm `stockTrades` và `stockPrices` vào object trả về của hàm seed (cạnh `accountValuations`, dòng ~462).

Thêm các method (đặt sau `deleteValuation`, dòng ~760):

```ts
  async getStockPrices() {
    return (load().stockPrices ?? []).slice().sort((a, b) => a.symbol.localeCompare(b.symbol))
  },

  async getStockTrades() {
    return (load().stockTrades ?? [])
      .slice()
      .sort((a, b) => b.traded_on.localeCompare(a.traded_on) || b.created_at.localeCompare(a.created_at))
  },

  async createStockTrade(input: NewStockTrade) {
    const db = load()
    db.stockTrades ??= []
    const row: StockTradeRow = {
      id: uuid(),
      user_id: DEMO_USER,
      account_id: input.account_id,
      symbol: input.symbol.trim().toUpperCase(),
      kind: input.kind,
      traded_on: input.traded_on,
      quantity: input.quantity,
      price: input.price,
      fee: input.fee,
      tax: input.tax,
      note: input.note,
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    db.stockTrades.push(row)
    save(db)
    return row
  },

  async updateStockTrade(id: string, patch: StockTradePatch) {
    const db = load()
    db.stockTrades ??= []
    const row = db.stockTrades.find((t) => t.id === id)
    if (!row) throw new Error('Không tìm thấy lệnh này.')
    if (patch.symbol !== undefined) row.symbol = patch.symbol.trim().toUpperCase()
    if (patch.kind !== undefined) row.kind = patch.kind
    if (patch.traded_on !== undefined) row.traded_on = patch.traded_on
    if (patch.quantity !== undefined) row.quantity = patch.quantity
    if (patch.price !== undefined) row.price = patch.price
    if (patch.fee !== undefined) row.fee = patch.fee
    if (patch.tax !== undefined) row.tax = patch.tax
    if (patch.note !== undefined) row.note = patch.note
    row.updated_at = nowISO()
    save(db)
    return row
  },

  async deleteStockTrade(id: string) {
    const db = load()
    db.stockTrades = (db.stockTrades ?? []).filter((t) => t.id !== id)
    save(db)
  },
```

Thêm guard vào `deleteAccount` (cạnh guard `accountValuations`, dòng ~716):

```ts
    if ((db.stockTrades ?? []).some((t) => t.account_id === id))
      throw new Error('Không xóa được: còn sổ lệnh cổ phiếu của tài khoản này.')
```

Thêm `stockTrades` vào `exportAll` (dòng ~1567):

```ts
      stockTrades: db.stockTrades ?? [],
```

Và trong `importAll`, gán lại `db.stockTrades = data.stockTrades ?? []` cùng chỗ với `accountValuations`. **Không** nhập `stockPrices` — dữ liệu công khai, giữ nguyên seed.

- [ ] **Step 5: Cài trong `supabaseRepo.ts`**

Modify `src/data/supabaseRepo.ts` — thêm sau `deleteValuation` (dòng ~370):

```ts
  async getStockPrices() {
    // Cả sàn HOSE đã 400+ mã, ba sàn thì vượt trần 1.000 của PostgREST → phải phân
    // trang, không thì bảng giá bị cắt và mã ở cuối bảng chữ cái mất giá im lặng.
    return await fetchAllPages<StockPriceRow>(async (from, to) =>
      getSupabase().from('stock_prices').select('*').order('symbol').range(from, to),
    )
  },

  async getStockTrades() {
    // `id` làm chốt sắp xếp cuối để hai trang liền nhau không lặp/sót (traded_on
    // không đơn trị — xem src/data/paging.ts).
    return await fetchAllPages<StockTradeRow>(async (from, to) =>
      getSupabase()
        .from('stock_trades')
        .select('*')
        .order('traded_on', { ascending: false })
        .order('id')
        .range(from, to),
    )
  },

  async createStockTrade(input: NewStockTrade) {
    const user_id = await currentUserId()
    const { data, error } = await getSupabase()
      .from('stock_trades')
      .insert({
        user_id,
        account_id: input.account_id,
        symbol: input.symbol.trim().toUpperCase(),
        kind: input.kind,
        traded_on: input.traded_on,
        quantity: input.quantity,
        price: input.price,
        fee: input.fee,
        tax: input.tax,
        note: input.note,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateStockTrade(id: string, patch: StockTradePatch) {
    const { data, error } = await getSupabase()
      .from('stock_trades')
      .update({
        ...patch,
        ...(patch.symbol === undefined ? {} : { symbol: patch.symbol.trim().toUpperCase() }),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteStockTrade(id: string) {
    const { error } = await getSupabase().from('stock_trades').delete().eq('id', id)
    if (error) throw error
  },
```

Thêm `stockTrades` vào `exportAll` (dòng ~1167/1185/1206 — theo đúng khuôn `accountValuations`: thêm `selectAll<StockTradeRow>('stock_trades')` vào mảng `Promise.all` và thêm khoá vào object trả về). Thêm `'stock_trades'` vào danh sách bảng cần xoá khi import (dòng ~1246). Thêm khối chèn trong `importAll` **sau accounts** (composite FK), theo khuôn dòng ~1431:

```ts
    // stock_trades: composite FK tới accounts → chèn sau accounts.
    if (data.stockTrades?.length) {
      await insertInChunks(
        data.stockTrades.map((t) => ({ ...t, user_id })),
        (part) => sb.from('stock_trades').insert(part),
      )
    }
```

> Dùng đúng tên helper chèn theo lô mà các khối lân cận trong file đang dùng — đọc dòng ~1425-1445 rồi bắt chước, đừng phát minh tên mới.

**Không** export/import `stock_prices`: dữ liệu công khai, server hút lại được, nhét vào chỉ làm file backup phình vô ích.

- [ ] **Step 6: Thêm hook**

Modify `src/hooks/queries.ts` — thêm sau block valuations (dòng ~327), và thêm `NewStockTrade`, `StockTradePatch` vào import type từ `../data`:

```ts
// --- Cổ phiếu Việt Nam: bảng giá + sổ lệnh (migration 0035) ---

export function useStockPrices() {
  return useQuery({
    queryKey: ['stockPrices'],
    queryFn: () => repo.getStockPrices(),
    // Giá chỉ đổi sau khi sàn đóng cửa và cron chạy — 5 phút là dư sức tươi.
    staleTime: 5 * 60_000,
  })
}

export function useStockTrades() {
  return useQuery({
    queryKey: ['stockTrades'],
    queryFn: () => repo.getStockTrades(),
    staleTime: 60_000,
  })
}

function invalidateStockTrades(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['stockTrades'] })
  // Sổ lệnh đổi → tiền chưa đầu tư và giá trị danh mục đổi theo. Số dư (view) không
  // đổi vì sổ lệnh không phải dòng tiền, nhưng snapshot giá trị thì có thể.
  qc.invalidateQueries({ queryKey: ['valuations'] })
}

export function useCreateStockTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewStockTrade) => repo.createStockTrade(input),
    onSettled: () => invalidateStockTrades(qc),
  })
}

export function useUpdateStockTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: StockTradePatch }) =>
      repo.updateStockTrade(id, patch),
    onSettled: () => invalidateStockTrades(qc),
  })
}

export function useDeleteStockTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteStockTrade(id),
    onSettled: () => invalidateStockTrades(qc),
  })
}
```

- [ ] **Step 7: Kiểm tra bản nhập sao lưu cũ vẫn chạy**

Modify `src/data/backupImport.test.ts` — thêm một test rằng file backup v6 (không có `stockTrades`) nhập được:

```ts
it('backup v6 (chưa có sổ lệnh cổ phiếu) vẫn nhập được', async () => {
  const backup = await demoRepo.exportAll()
  const cu = { ...backup, version: 6, stockTrades: undefined }
  await expect(demoRepo.importAll(cu)).resolves.not.toThrow()
  expect(await demoRepo.getStockTrades()).toEqual([])
})
```

> Đọc file này trước khi sửa: nó đang có sẵn helper dựng backup và cách import `demoRepo`. Dùng lại chúng thay vì import kiểu khác.

- [ ] **Step 8: Chạy toàn bộ test**

Run: `npm test`

Expected: PASS. `npx tsc -b` cũng phải sạch.

- [ ] **Step 9: Commit**

```bash
git add src/data src/hooks/queries.ts
git commit -m "feat(dau-tu): repo va hook cho so lenh co phieu, backup v7"
```

---

## Task 4: Khu "Danh mục" trên trang chi tiết tài khoản

**Files:**
- Create: `src/features/assets/HoldingsSection.tsx`
- Modify: `src/features/assets/AccountDetailPage.tsx`

**Interfaces:**
- Consumes: `holdingsFromTrades`, `brokerCash`, `portfolioValue`, `Trade` (Task 1); `useStockPrices`, `useStockTrades` (Task 3); `StockTradeRow` (Task 2).
- Produces: `HoldingsSection({ account, balance, onAddTrade, onEditTrade }: Props)` — `account: AccountRow`, `balance: number`, `onAddTrade: () => void`, `onEditTrade: (trade: StockTradeRow) => void`.

- [ ] **Step 1: Viết `HoldingsSection.tsx`**

Create `src/features/assets/HoldingsSection.tsx`:

```tsx
// Khu "Danh mục" trên trang chi tiết tài khoản đầu tư: từng mã đang giữ, lời/lỗ, và
// tiền chưa kịp mua gì.
//
// File riêng (không nhét vào AccountDetailPage) vì trang đó đã 515 dòng. Mọi phép tính
// nằm ở holdings.ts — ở đây chỉ đọc dữ liệu và bày ra.
import { useMemo } from 'react'
import { Card, Money, SectionTitle } from '../../components/ui'
import { useStockPrices, useStockTrades } from '../../hooks/queries'
import type { AccountRow, StockTradeRow } from '../../types/database.types'
import { brokerCash, holdingsFromTrades, portfolioValue, type Trade } from './holdings'

interface Props {
  account: AccountRow
  /** Số dư sổ của tài khoản (minor units) — vốn gốc ròng từ view account_balances. */
  balance: number
  onAddTrade: () => void
  onEditTrade: (trade: StockTradeRow) => void
}

const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1).replace('.', ',')}%`

/** Ngày ISO → dd/mm để đọc nhanh. */
const ngayNgan = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export function HoldingsSection({ account, balance, onAddTrade, onEditTrade }: Props) {
  const { data: allTrades = [] } = useStockTrades()
  const { data: prices = [] } = useStockPrices()

  const trades = useMemo(
    () => allTrades.filter((t) => t.account_id === account.id),
    [allTrades, account.id],
  )

  const priceBySymbol = useMemo(
    () => new Map(prices.map((p) => [p.symbol, p.price])),
    [prices],
  )
  const nameBySymbol = useMemo(() => new Map(prices.map((p) => [p.symbol, p.name])), [prices])

  const asTrades: Trade[] = useMemo(
    () =>
      trades.map((t) => ({
        symbol: t.symbol,
        kind: t.kind,
        tradedOn: t.traded_on,
        quantity: t.quantity,
        price: t.price,
        fee: t.fee,
        tax: t.tax,
      })),
    [trades],
  )

  const { holdings, realizedPnl, oversold } = useMemo(
    () => holdingsFromTrades(asTrades),
    [asTrades],
  )
  const cash = useMemo(() => brokerCash(balance, asTrades), [balance, asTrades])
  const value = useMemo(
    () => portfolioValue(holdings, priceBySymbol, cash),
    [holdings, priceBySymbol, cash],
  )

  // Ngày phiên của bảng giá: lấy mốc mới nhất trong số mã đang giữ.
  const phien = useMemo(() => {
    const days = holdings
      .map((h) => prices.find((p) => p.symbol === h.symbol)?.trading_date)
      .filter((d): d is string => !!d)
      .sort()
    return days.at(-1) ?? null
  }, [holdings, prices])

  if (trades.length === 0) {
    return (
      <Card as="section" className="mb-3">
        <SectionTitle>Danh mục</SectionTitle>
        <p className="mt-2 text-xs text-fg-muted">
          Ghi lệnh mua/bán để app tự lấy giá và tính lời/lỗ từng mã.
        </p>
        <button
          type="button"
          onClick={onAddTrade}
          className="mt-3 rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white active:scale-95"
        >
          Ghi lệnh đầu tiên
        </button>
      </Card>
    )
  }

  const currency = account.currency as 'VND'

  return (
    <Card as="section" className="mb-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <SectionTitle>Danh mục</SectionTitle>
        <button
          type="button"
          onClick={onAddTrade}
          className="text-xs font-semibold text-green-700 dark:text-green-400"
        >
          + Ghi lệnh
        </button>
      </div>

      <ul className="divide-y divide-border">
        {holdings.map((h) => {
          const price = priceBySymbol.get(h.symbol)
          const thieuGia = price == null || price <= 0
          const giaTri = thieuGia ? h.costBasis : h.quantity * price
          const lai = giaTri - h.costBasis
          const laiPct = h.costBasis > 0 ? lai / h.costBasis : null
          return (
            <li key={h.symbol} className="flex items-baseline justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg-primary">{h.symbol}</p>
                <p className="truncate text-2xs text-fg-muted">
                  {nameBySymbol.get(h.symbol) ?? '—'}
                </p>
                <p className="mt-0.5 text-2xs text-fg-secondary tabular-nums">
                  {h.quantity.toLocaleString('vi-VN')} cổ · vốn{' '}
                  {h.avgCost.toLocaleString('vi-VN')}
                  {thieuGia ? ' · chưa có giá' : ` · nay ${price.toLocaleString('vi-VN')}`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Money amount={giaTri} currency={currency} className="text-sm font-semibold" />
                <p
                  className={`text-2xs tabular-nums ${
                    lai >= 0 ? 'text-money-in' : 'text-money-out'
                  }`}
                >
                  {lai >= 0 ? '+' : '−'}
                  {Math.abs(lai).toLocaleString('vi-VN')}
                  {laiPct !== null && ` · ${pct(laiPct)}`}
                </p>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 space-y-1 border-t border-border pt-2 text-xs">
        {cash >= 0 ? (
          <p className="flex items-baseline justify-between text-fg-secondary">
            <span>Tiền chưa đầu tư</span>
            <Money amount={cash} currency={currency} className="font-semibold" />
          </p>
        ) : (
          <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-2xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Bạn ghi lệnh mua nhiều hơn số tiền đã nạp vào tài khoản này — kiểm tra lại sổ
            lệnh, hoặc ghi thêm lần chuyển tiền còn thiếu.
          </p>
        )}

        {realizedPnl !== 0 && (
          <p className="flex items-baseline justify-between text-fg-secondary">
            <span>Lãi đã chốt</span>
            <span
              className={`font-semibold tabular-nums ${
                realizedPnl >= 0 ? 'text-money-in' : 'text-money-out'
              }`}
            >
              {realizedPnl >= 0 ? '+' : '−'}
              {Math.abs(realizedPnl).toLocaleString('vi-VN')}
            </span>
          </p>
        )}
        {realizedPnl !== 0 && (
          <p className="text-3xs leading-tight text-fg-muted">
            Số này đã nằm trong tiền chưa đầu tư, không cộng thêm lần nữa.
          </p>
        )}

        {value.marketValue !== null && (
          <p className="flex items-baseline justify-between pt-1 text-fg-primary">
            <span className="font-semibold">Tổng giá trị</span>
            <Money amount={value.marketValue} currency={currency} className="font-bold" />
          </p>
        )}

        <p className="pt-1 text-3xs text-fg-muted">
          {phien ? `theo giá phiên ${ngayNgan(phien)}` : 'chưa có bảng giá'}
        </p>
      </div>

      {value.missingPrices.length > 0 && (
        <p className="mt-2 text-2xs text-amber-700 dark:text-amber-300">
          Chưa có giá cho {value.missingPrices.join(', ')} — mấy mã này đang tạm tính theo
          giá vốn nên tổng có thể lệch.
        </p>
      )}

      {oversold.length > 0 && (
        <p className="mt-2 text-2xs text-amber-700 dark:text-amber-300">
          {oversold.join(', ')}: sổ lệnh ghi bán nhiều hơn số cổ đang giữ. Có thể thiếu một
          lệnh mua hoặc một lần được thưởng cổ phiếu.
        </p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-fg-secondary">
          Sổ lệnh ({trades.length})
        </summary>
        <ul className="mt-2 divide-y divide-border">
          {trades.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onEditTrade(t)}
                className="flex w-full items-baseline justify-between gap-3 py-2 text-left"
              >
                <span className="text-xs text-fg-secondary">
                  {ngayNgan(t.traded_on)} ·{' '}
                  <b className="text-fg-primary">{t.symbol}</b>{' '}
                  {t.kind === 'buy' ? 'mua' : t.kind === 'sell' ? 'bán' : 'điều chỉnh'}
                </span>
                <span className="shrink-0 text-2xs tabular-nums text-fg-muted">
                  {t.quantity.toLocaleString('vi-VN')} cổ
                  {t.kind !== 'adjust' && ` @ ${t.price.toLocaleString('vi-VN')}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  )
}
```

> **Trước khi viết:** mở `src/components/ui/index.ts` (hoặc chỗ `AccountDetailPage` đang import `Card, Money, SectionTitle`) để dùng đúng đường dẫn import. Và mở một file trong `src/features/assets/` để xác nhận các lớp Tailwind `text-2xs`, `text-3xs`, `text-money-in`, `text-money-out`, `divide-border` có thật trong `design-system` — nếu tên khác thì dùng tên đang có, đừng thêm lớp mới.

- [ ] **Step 2: Gắn vào `AccountDetailPage`**

Modify `src/features/assets/AccountDetailPage.tsx`:

Thêm import:

```tsx
import { HoldingsSection } from './HoldingsSection'
import type { StockTradeRow } from '../../types/database.types'
```

Thêm state cạnh `showValuation` (dòng ~49):

```tsx
  const [tradeSheet, setTradeSheet] = useState<{ trade: StockTradeRow | null } | null>(null)
```

Đặt khu Danh mục ngay **sau** block `{isInvestment && (...)}` hiện có (kết thúc quanh dòng 279) và **trước** block `tax_shelter`:

```tsx
        {isInvestment && account && account.currency === 'VND' && (
          <HoldingsSection
            account={account}
            balance={balance}
            onAddTrade={() => setTradeSheet({ trade: null })}
            onEditTrade={(trade) => setTradeSheet({ trade })}
          />
        )}
```

> Chỉ hiện với tài khoản VND: bảng giá SSI là đồng, tài khoản JPY dùng khu này sẽ ra số vô nghĩa.

Sheet sẽ nối ở Task 5 — tạm thời `tradeSheet` chưa được dùng để render, nên **thêm luôn một placeholder** để `tsc` không báo biến không dùng:

```tsx
      {tradeSheet && null /* TradeFormSheet nối ở Task 5 */}
```

- [ ] **Step 3: Xem thử trên trình duyệt (chế độ demo)**

Run: mở preview `so-chi-tieu-demo` (đã có trong `.claude/launch.json`, cổng 5174), vào `/assets`, bấm vào tài khoản "Chứng khoán VN".

Expected: khu "Danh mục" hiện FPT (550 cổ sau thưởng) và HPG (1.000 cổ), có lời/lỗ, có "Tiền chưa đầu tư", dòng "theo giá phiên 05/08".

- [ ] **Step 4: Soi lỗi console**

Dùng `read_console_messages` trên tab preview.

Expected: không lỗi, không cảnh báo key trùng.

- [ ] **Step 5: Kiểm kiểu, lint, test**

Run: `npx tsc -b && npm run lint && npm test`

Expected: sạch.

- [ ] **Step 6: Commit**

```bash
git add src/features/assets/HoldingsSection.tsx src/features/assets/AccountDetailPage.tsx
git commit -m "feat(dau-tu): khu Danh muc hien tung ma va lai/lo"
```

---

## Task 5: Sheet ghi/sửa lệnh

**Files:**
- Create: `src/features/assets/TradeFormSheet.tsx`
- Modify: `src/features/assets/AccountDetailPage.tsx`

**Interfaces:**
- Consumes: `useCreateStockTrade`, `useUpdateStockTrade`, `useDeleteStockTrade`, `useStockPrices` (Task 3); `StockTradeRow`, `StockTradeKind` (Task 2).
- Produces: `TradeFormSheet({ account, trade, onClose }: Props)` — `account: AccountRow`, `trade: StockTradeRow | null` (null = ghi mới), `onClose: () => void`.

- [ ] **Step 1: Viết `TradeFormSheet.tsx`**

Create `src/features/assets/TradeFormSheet.tsx`:

```tsx
// Sheet ghi / sửa một lệnh cổ phiếu. Cùng khuôn ValuationFormSheet (nền mờ, sheet
// trượt từ dưới trên mobile, giữa màn trên desktop).
//
// Phí và thuế được TÍNH GỢI Ý rồi cho sửa: người dùng không nhớ chính xác phí của công
// ty chứng khoán, nhưng bỏ trống thì giá vốn thấp hơn thực tế và lãi trông đẹp hơn thật.
import { useMemo, useState } from 'react'
import { MoneyField } from '../../components/MoneyField'
import { SegmentedControl } from '../../components/ui'
import { confirmDialog } from '../../lib/dialog'
import {
  useCreateStockTrade,
  useDeleteStockTrade,
  useStockPrices,
  useUpdateStockTrade,
} from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import type { AccountRow, StockTradeKind, StockTradeRow } from '../../types/database.types'

/** Phí giao dịch phổ biến ở Việt Nam ~0,15% giá trị lệnh. */
const FEE_RATE = 0.0015
/** Thuế thu nhập khi BÁN: 0,1% giá trị lệnh. Mua không có thuế. */
const TAX_RATE = 0.001

const KINDS = [
  { value: 'buy' as const, label: 'Mua' },
  { value: 'sell' as const, label: 'Bán' },
  { value: 'adjust' as const, label: 'Điều chỉnh' },
]

interface Props {
  account: AccountRow
  /** null = ghi lệnh mới */
  trade: StockTradeRow | null
  onClose: () => void
}

export function TradeFormSheet({ account, trade, onClose }: Props) {
  const create = useCreateStockTrade()
  const update = useUpdateStockTrade()
  const remove = useDeleteStockTrade()
  const { data: prices = [] } = useStockPrices()

  const [kind, setKind] = useState<StockTradeKind>(trade?.kind ?? 'buy')
  const [symbol, setSymbol] = useState(trade?.symbol ?? '')
  const [tradedOn, setTradedOn] = useState(trade?.traded_on ?? toISODate(new Date()))
  const [quantity, setQuantity] = useState(trade?.quantity ?? 0)
  const [price, setPrice] = useState(trade?.price ?? 0)
  const [fee, setFee] = useState(trade?.fee ?? 0)
  const [tax, setTax] = useState(trade?.tax ?? 0)
  const [note, setNote] = useState(trade?.note ?? '')
  const [feeTouched, setFeeTouched] = useState(trade != null)
  const [saving, setSaving] = useState(false)

  const currency = account.currency as 'VND'
  const isAdjust = kind === 'adjust'

  // Gợi ý tối đa 8 mã khi gõ — khớp cả mã và tên công ty.
  const suggestions = useMemo(() => {
    const q = symbol.trim().toUpperCase()
    if (q.length < 1 || prices.some((p) => p.symbol === q)) return []
    return prices
      .filter((p) => p.symbol.startsWith(q) || p.name.toUpperCase().includes(q))
      .slice(0, 8)
  }, [symbol, prices])

  // Phí/thuế gợi ý theo giá trị lệnh, tới khi người dùng tự sửa thì thôi.
  const grossValue = quantity * price
  const suggestedFee = isAdjust ? 0 : Math.round(grossValue * FEE_RATE)
  const suggestedTax = kind === 'sell' ? Math.round(grossValue * TAX_RATE) : 0
  const effFee = feeTouched ? fee : suggestedFee
  const effTax = feeTouched ? tax : suggestedTax

  const canSave =
    symbol.trim().length > 0 &&
    !saving &&
    (isAdjust ? quantity !== 0 : quantity > 0 && price > 0)

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      const payload = {
        symbol: symbol.trim().toUpperCase(),
        kind,
        traded_on: tradedOn,
        quantity,
        price: isAdjust ? 0 : price,
        fee: isAdjust ? 0 : effFee,
        tax: isAdjust ? 0 : effTax,
        note: note.trim(),
      }
      if (trade) await update.mutateAsync({ id: trade.id, patch: payload })
      else await create.mutateAsync({ account_id: account.id, ...payload })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!trade) return
    if (!(await confirmDialog(`Xoá lệnh ${trade.symbol} ngày ${trade.traded_on}?`))) return
    setSaving(true)
    try {
      await remove.mutateAsync(trade.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-bold text-fg-primary">
          {trade ? 'Sửa lệnh' : 'Ghi lệnh'}
        </h2>
        <p className="mb-3 text-xs text-fg-muted">{account.name}</p>

        <div className="mb-3">
          <SegmentedControl
            items={KINDS}
            value={kind}
            onChange={setKind}
            label="Loại lệnh"
          />
        </div>

        {isAdjust && (
          <p className="mb-3 rounded-lg bg-surface-page px-2.5 py-2 text-2xs text-fg-muted">
            Dùng khi được thưởng cổ phiếu, nhận cổ tức bằng cổ phiếu, hoặc chia tách. Số cổ
            tăng mà không tốn tiền nên giá vốn trung bình tự giảm. Gộp cổ phiếu thì nhập số
            âm.
          </p>
        )}

        <label className="mb-1 block text-xs font-medium text-fg-muted">Mã cổ phiếu</label>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="FPT"
          autoCapitalize="characters"
          className="mb-1 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm font-semibold uppercase outline-green-500"
        />
        {suggestions.length > 0 && (
          <ul className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-border">
            {suggestions.map((p) => (
              <li key={p.symbol}>
                <button
                  type="button"
                  onClick={() => setSymbol(p.symbol)}
                  className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-surface-page"
                >
                  <b className="text-fg-primary">{p.symbol}</b>
                  <span className="truncate text-2xs text-fg-muted">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="mb-1 block text-xs font-medium text-fg-muted">Ngày</label>
        <input
          type="date"
          value={tradedOn}
          max={toISODate(new Date())}
          onChange={(e) => setTradedOn(e.target.value)}
          className="mb-3 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm outline-green-500"
        />

        <label className="mb-1 block text-xs font-medium text-fg-muted">
          Số cổ {isAdjust && <span className="text-fg-muted">(âm = gộp cổ phiếu)</span>}
        </label>
        <input
          type="number"
          inputMode="numeric"
          value={quantity === 0 ? '' : quantity}
          onChange={(e) => setQuantity(Number(e.target.value) || 0)}
          className="mb-3 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-right text-lg font-semibold tabular-nums outline-green-500"
        />

        {!isAdjust && (
          <>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Giá mỗi cổ</label>
            <div className="mb-3">
              <MoneyField
                value={price}
                onChange={setPrice}
                currency={currency}
                ariaLabel="Giá mỗi cổ"
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-lg font-semibold outline-green-500"
              />
            </div>

            <div className="mb-1 flex items-baseline justify-between">
              <label className="text-xs font-medium text-fg-muted">Phí giao dịch</label>
              {!feeTouched && (
                <span className="text-2xs text-fg-muted">gợi ý 0,15%</span>
              )}
            </div>
            <div className="mb-3" onFocusCapture={() => setFeeTouched(true)}>
              <MoneyField
                value={effFee}
                onChange={(v) => {
                  setFeeTouched(true)
                  setFee(v)
                }}
                currency={currency}
                ariaLabel="Phí giao dịch"
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-right outline-green-500"
              />
            </div>

            {kind === 'sell' && (
              <>
                <div className="mb-1 flex items-baseline justify-between">
                  <label className="text-xs font-medium text-fg-muted">Thuế bán</label>
                  {!feeTouched && <span className="text-2xs text-fg-muted">gợi ý 0,1%</span>}
                </div>
                <div className="mb-3" onFocusCapture={() => setFeeTouched(true)}>
                  <MoneyField
                    value={effTax}
                    onChange={(v) => {
                      setFeeTouched(true)
                      setTax(v)
                    }}
                    currency={currency}
                    ariaLabel="Thuế bán"
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-right outline-green-500"
                  />
                </div>
              </>
            )}
          </>
        )}

        <label className="mb-1 block text-xs font-medium text-fg-muted">
          Ghi chú <span className="text-fg-muted">(không bắt buộc)</span>
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: cổ phiếu thưởng 10%"
          className="mb-3 w-full rounded-lg border border-border-strong px-3 py-2 text-sm outline-green-500"
        />

        <p className="mb-3 text-xs text-fg-muted">
          Lệnh không tạo giao dịch thu/chi và không đổi số dư — nó chỉ nói tiền trong tài
          khoản đang nằm ở cổ phiếu nào.
        </p>

        <div className="mt-1 flex items-center justify-end gap-2">
          {trade && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="mr-auto rounded-lg px-3 py-2 text-sm text-money-out disabled:opacity-50"
            >
              Xoá
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave}
            className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white active:scale-95 disabled:opacity-50"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

> **Trước khi viết:** mở `src/lib/dialog.ts` để xác nhận `confirmDialog` trả `Promise<boolean>` và nhận đúng một tham số chuỗi; `AccountDetailPage` đã dùng nó nên xem cách gọi ở đó. Xác nhận `SegmentedControl` export từ đâu (`src/components/ui`).

- [ ] **Step 2: Nối sheet vào `AccountDetailPage`**

Modify `src/features/assets/AccountDetailPage.tsx` — thay placeholder ở Task 4 Step 2:

```tsx
      {tradeSheet && account && (
        <TradeFormSheet
          account={account}
          trade={tradeSheet.trade}
          onClose={() => setTradeSheet(null)}
        />
      )}
```

Và thêm import:

```tsx
import { TradeFormSheet } from './TradeFormSheet'
```

- [ ] **Step 3: Thử tay trên preview demo**

Trên tab `so-chi-tieu-demo`: vào tài khoản "Chứng khoán VN" → "+ Ghi lệnh" → chọn Mua, mã `VNM`, 100 cổ, giá 58.600 → Lưu.

Expected: VNM xuất hiện trong Danh mục; phí tự gợi ý 8.790đ; tiền chưa đầu tư giảm đúng 5.868.790đ.

- [ ] **Step 4: Thử sửa và xoá**

Mở `Sổ lệnh` → bấm dòng VNM vừa ghi → đổi số cổ thành 200 → Lưu → xác nhận danh mục đổi. Rồi mở lại → Xoá → xác nhận VNM biến khỏi danh mục.

- [ ] **Step 5: Soi console + kiểm kiểu + test**

Dùng `read_console_messages`; rồi `npx tsc -b && npm run lint && npm test`.

Expected: không lỗi.

- [ ] **Step 6: Commit**

```bash
git add src/features/assets/TradeFormSheet.tsx src/features/assets/AccountDetailPage.tsx
git commit -m "feat(dau-tu): sheet ghi/sua lenh co phieu"
```

---

## Task 6: Gói phép tính cho edge function

**Files:**
- Create: `src/features/assets/serverBundle.ts`
- Modify: `scripts/bundle-rules.mjs`
- Modify: `tests/pushBundle.test.ts`

**Interfaces:**
- Consumes: `holdingsFromTrades`, `brokerCash`, `portfolioValue` (Task 1).
- Produces:
  - `scripts/bundle-rules.mjs` exports `BUNDLES: { entry: string; outfile: string }[]`, `bundleOne({ entry, outfile, write })`, `bundleAll({ write })`.
  - File sinh: `supabase/functions/stock-refresh/_holdings.js`.

- [ ] **Step 1: Viết `serverBundle.ts` cho assets**

Create `src/features/assets/serverBundle.ts`:

```ts
// Mặt tiếp xúc DUY NHẤT giữa app và edge function stock-refresh.
//
// Cùng lý do như src/features/notifications/serverBundle.ts: Deno đòi import tương đối
// có đuôi `.ts`, cả repo này viết không đuôi, nên scripts/bundle-rules.mjs gom đúng file
// này thành một file JS phẳng.
//
// Danh sách xuất ở đây = giao kèo. Chỉ xuất thứ THUẦN — không formatMoney (đọc trạng
// thái riêng tư toàn cục), không hook, không gì kéo theo React hay localStorage.

export {
  brokerCash,
  holdingsFromTrades,
  portfolioValue,
} from './holdings'
export type { Holding, HoldingsResult, PortfolioValue, Trade } from './holdings'

// Ngày tháng: bắt buộc đi qua đây, không tự cộng trừ ngày ở edge function.
export { toISODate } from '../../lib/dates'
```

- [ ] **Step 2: Tổng quát hoá `bundle-rules.mjs`**

Modify `scripts/bundle-rules.mjs` — thay `ENTRY`/`OUTFILE`/`bundleRules` bằng danh sách. Giữ nguyên mọi tuỳ chọn esbuild (`platform: 'neutral'` là cố ý — xem comment trong file):

```js
/**
 * Mỗi mục là một edge function. Thêm function mới thì thêm một dòng ở đây, đừng copy
 * bộ luật sang supabase/functions — hai bản sao là chuyện sớm muộn lệch nhau.
 */
export const BUNDLES = [
  {
    entry: 'src/features/notifications/serverBundle.ts',
    outfile: 'supabase/functions/push-notify/_rules.js',
  },
  {
    entry: 'src/features/assets/serverBundle.ts',
    outfile: 'supabase/functions/stock-refresh/_holdings.js',
  },
]

const bannerFor = (entry) => `// TỆP SINH TỰ ĐỘNG — ĐỪNG SỬA TAY.
// Nguồn: ${entry} (và mọi thứ nó import)
// Sinh lại: npm run bundle:rules
// Sửa tay ở đây sẽ bị lần chạy sau ghi đè, và tests/pushBundle.test.ts sẽ đỏ.`

/** Gói MỘT mục. `write: false` để test so sánh mà không đụng đĩa. */
export async function bundleOne({ entry, outfile }, { write } = { write: true }) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [entry],
    outfile,
    bundle: true,
    write,
    format: 'esm',
    // 'neutral' là CỐ Ý: nó không coi module lõi của Node hay của trình duyệt là
    // external, nên nếu có ai đó vô tình kéo `node:fs`, React hay `localStorage` vào
    // closure của bộ luật thì lệnh này ĐỎ ngay tại đây — trước khi lỗi kịp thành một
    // edge function chết lúc chạy mà chỉ log Supabase mới thấy.
    platform: 'neutral',
    target: 'es2022',
    banner: { js: bannerFor(entry) },
    // Không minify: file này được người đọc khi lần lỗi trong log Supabase.
    minify: false,
    legalComments: 'none',
  })
  if (write) return null
  return result.outputFiles[0].text
}

/** Gói HẾT. Trả về Map outfile → nội dung khi write: false. */
export async function bundleAll({ write } = { write: true }) {
  const out = new Map()
  for (const b of BUNDLES) {
    const text = await bundleOne(b, { write })
    if (!write) out.set(b.outfile, text)
  }
  return out
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await bundleAll({ write: true })
  for (const b of BUNDLES) console.log(`Đã gói ${b.entry} → ${b.outfile}`)
}
```

Xoá `ENTRY`, `OUTFILE`, `BANNER`, `bundleRules` cũ.

- [ ] **Step 3: Sinh bundle lần đầu**

Run: `mkdir -p supabase/functions/stock-refresh && npm run bundle:rules`

Expected: in hai dòng "Đã gói …"; `supabase/functions/stock-refresh/_holdings.js` xuất hiện.

- [ ] **Step 4: Cập nhật test guard**

Modify `tests/pushBundle.test.ts` — đổi import và cho nó canh **cả hai** bundle:

```ts
// @ts-expect-error — script build viết bằng .mjs thuần, không có khai báo kiểu.
import { BUNDLES, bundleAll } from '../scripts/bundle-rules.mjs'
```

Đổi ba test hiện có thành vòng lặp qua `BUNDLES`, và giữ nguyên danh sách export bắt buộc của push-notify, thêm danh sách cho stock-refresh:

```ts
const EXPORTS_BAT_BUOC: Record<string, string[]> = {
  'supabase/functions/push-notify/_rules.js': [
    'buildNotifications',
    'planPush',
    'dueForPush',
    'buildBudgetReport',
    'carryFromPreviousMonth',
    'buildLifetimeInput',
    'monthKeyForDate',
    'monthKeyString',
    'addMonths',
    'addDaysISO',
    'toISODate',
    'RECENT_TXS_DAYS',
  ],
  'supabase/functions/stock-refresh/_holdings.js': [
    'holdingsFromTrades',
    'brokerCash',
    'portfolioValue',
    'toISODate',
  ],
}

describe('bundle bộ luật cho edge function', () => {
  it('file đã commit KHỚP với bộ luật hiện tại trong src/', async () => {
    const goiLai = await bundleAll({ write: false })
    for (const { outfile } of BUNDLES) {
      const daCommit = readFileSync(join(ROOT, outfile), 'utf8')
      // So bằng chứ không so "có chứa": đổi một hằng số trong luật cũng phải đỏ.
      expect(goiLai.get(outfile), `${outfile} đã cũ — chạy npm run bundle:rules`).toBe(daCommit)
    }
  }, 60_000)

  it('bundle xuất đủ những gì edge function gọi', () => {
    for (const { outfile } of BUNDLES) {
      const daCommit = readFileSync(join(ROOT, outfile), 'utf8')
      for (const ten of EXPORTS_BAT_BUOC[outfile]) {
        expect(daCommit, `${outfile} thiếu export ${ten}`).toContain(ten)
      }
    }
  })

  it('bundle KHÔNG kéo theo thứ của trình duyệt hay của Node', () => {
    for (const { outfile } of BUNDLES) {
      const daCommit = readFileSync(join(ROOT, outfile), 'utf8')
      for (const cam of ['localStorage', 'document.', 'window.', 'require(', 'node:']) {
        expect(daCommit, `${outfile} chứa ${cam} — không chạy được trên Deno`).not.toContain(cam)
      }
    }
  })
})
```

- [ ] **Step 5: Chạy test guard**

Run: `npx vitest run tests/pushBundle.test.ts`

Expected: PASS cả 3 test cho cả 2 bundle. Nếu test "không kéo theo thứ của trình duyệt" đỏ ở `_holdings.js`, nghĩa là `holdings.ts` hoặc `lib/dates.ts` đang kéo theo cái gì của trình duyệt — sửa ở `src/`, đừng nới lỏng test.

- [ ] **Step 6: Chạy toàn bộ test**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/bundle-rules.mjs tests/pushBundle.test.ts src/features/assets/serverBundle.ts supabase/functions/stock-refresh/_holdings.js
git commit -m "build: goi phep tinh danh muc sang edge function stock-refresh"
```

---

## Task 7: Edge function — hút bảng giá

**Files:**
- Create: `supabase/functions/stock-refresh/prices.ts`
- Create: `supabase/functions/stock-refresh/index.ts`
- Create: `supabase/functions/stock-refresh/prices.test.ts`
- Create: `docs/co-phieu-viet-nam.md`

**Interfaces:**
- Consumes: `_holdings.js` (Task 6) — chưa dùng ở task này nhưng đã có mặt.
- Produces:
  - `parseBoard(exchange: 'hose'|'hnx'|'upcom', json: unknown): PriceUpsert[]`
  - `PriceUpsert { symbol: string; exchange: string; name: string; price: number; prior_close: number | null; trading_date: string }`
  - `fetchBoard(exchange): Promise<PriceUpsert[]>`
  - HTTP endpoint `POST /stock-refresh` với header `x-cron-secret`.

- [ ] **Step 1: Lưu một mẫu bảng giá thật để test**

Run:

```bash
mkdir -p supabase/functions/stock-refresh/testdata
curl -s --max-time 30 "https://iboard-query.ssi.com.vn/stock/exchange/hose" \
  -H "User-Agent: Mozilla/5.0" \
  -o supabase/functions/stock-refresh/testdata/hose-sample.json
```

Rồi cắt nhỏ còn ~5 mã cho gọn repo (file gốc 732KB):

```bash
node -e "
const fs=require('fs');
const p='supabase/functions/stock-refresh/testdata/hose-sample.json';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
const keep=['FPT','VNM','HPG'];
j.data=j.data.filter(x=>keep.includes(x.stockSymbol));
fs.writeFileSync(p, JSON.stringify(j,null,1));
console.log('giu lai', j.data.length, 'ma');
"
```

Expected: in `giu lai 3 ma`.

- [ ] **Step 2: Viết test thất bại cho `parseBoard`**

Create `supabase/functions/stock-refresh/prices.test.ts`:

```ts
// Test chạy bằng vitest ở Node (không phải Deno): parseBoard là hàm thuần, không gọi
// mạng, nên không cần runtime Deno để canh nó.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseBoard } from './prices.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const sample = JSON.parse(readFileSync(join(HERE, 'testdata/hose-sample.json'), 'utf8'))

describe('parseBoard', () => {
  it('đọc được mã, giá, ngày phiên từ bảng giá thật của SSI', () => {
    const rows = parseBoard('hose', sample)
    const fpt = rows.find((r) => r.symbol === 'FPT')
    expect(fpt).toBeDefined()
    expect(fpt!.exchange).toBe('hose')
    expect(fpt!.price).toBeGreaterThan(0)
    expect(fpt!.name).toContain('FPT')
    // tradingDate của SSI là 'YYYYMMDD' → phải đổi sang ISO cho cột date
    expect(fpt!.trading_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('matchedPrice = 0 (ngoài giờ) → rơi về priorClosePrice', () => {
    const json = {
      data: [
        {
          stockSymbol: 'AAA',
          companyNameVi: 'Cty AAA',
          matchedPrice: 0,
          priorClosePrice: 12_345,
          refPrice: 99_999,
          tradingDate: '20260805',
        },
      ],
    }
    expect(parseBoard('hose', json)[0].price).toBe(12_345)
  })

  it('thiếu cả matchedPrice và priorClose → rơi về refPrice', () => {
    const json = {
      data: [
        {
          stockSymbol: 'BBB',
          companyNameVi: 'Cty BBB',
          matchedPrice: 0,
          priorClosePrice: 0,
          refPrice: 7_777,
          tradingDate: '20260805',
        },
      ],
    }
    expect(parseBoard('hose', json)[0].price).toBe(7_777)
  })

  it('không có giá nào dùng được → bỏ mã đó, không ghi giá 0', () => {
    const json = {
      data: [
        {
          stockSymbol: 'CCC',
          companyNameVi: 'Cty CCC',
          matchedPrice: 0,
          priorClosePrice: 0,
          refPrice: 0,
          tradingDate: '20260805',
        },
      ],
    }
    expect(parseBoard('hose', json)).toEqual([])
  })

  it('payload lạ (data không phải mảng) → mảng rỗng, không nổ', () => {
    expect(parseBoard('hose', { data: null })).toEqual([])
    expect(parseBoard('hose', {})).toEqual([])
    expect(parseBoard('hose', null)).toEqual([])
  })

  it('thiếu tradingDate → bỏ mã đó (không có ngày phiên thì không biết giá của hôm nào)', () => {
    const json = {
      data: [{ stockSymbol: 'DDD', companyNameVi: 'D', matchedPrice: 1_000, tradingDate: '' }],
    }
    expect(parseBoard('hose', json)).toEqual([])
  })
})
```

Thêm thư mục này vào phạm vi vitest nếu cần — mở `vite.config.ts`, xem `test.include`. Nếu nó chỉ quét `src/` và `tests/` thì thêm `'supabase/functions/**/*.test.ts'` vào `include`.

- [ ] **Step 3: Chạy test để chắc là nó đỏ**

Run: `npx vitest run supabase/functions/stock-refresh/prices.test.ts`

Expected: FAIL — không resolve được `./prices.ts`.

- [ ] **Step 4: Viết `prices.ts`**

Create `supabase/functions/stock-refresh/prices.ts`:

```ts
// Hút bảng giá cổ phiếu Việt Nam từ SSI iBoard.
//
// Vì sao SSI: đã đo ngày 2026-08-05 — trả đủ ba sàn, giá theo ĐỒNG, miễn phí, không
// khoá. TCBS bị Cloudflare chặn, VNDirect trả rỗng. Chi tiết trong spec.
//
// Vì sao ở server chứ không ở app: SSI trả `Access-Control-Allow-Origin:
// https://iboard.ssi.com.vn` nên trình duyệt không gọi được. Đây là ràng buộc, không
// phải lựa chọn.
//
// parseBoard tách khỏi fetchBoard để test được bằng file mẫu, không cần mạng.

export type Exchange = 'hose' | 'hnx' | 'upcom'

export interface PriceUpsert {
  symbol: string
  exchange: Exchange
  name: string
  /** đồng/cổ; luôn > 0 */
  price: number
  prior_close: number | null
  /** ISO date */
  trading_date: string
}

const BOARD_URL = (ex: Exchange) => `https://iboard-query.ssi.com.vn/stock/exchange/${ex}`

/** 'YYYYMMDD' của SSI → 'YYYY-MM-DD'. Chuỗi không đúng 8 số → null. */
function isoFromCompact(s: unknown): string | null {
  if (typeof s !== 'string' || !/^\d{8}$/.test(s)) return null
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

function positive(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null
}

/**
 * Bảng giá SSI → hàng để upsert.
 *
 * Giá lấy `matchedPrice` (giá khớp lệnh). Ngoài giờ giao dịch hoặc mã không khớp lệnh
 * thì nó bằng 0 — rơi về `priorClosePrice`, rồi `refPrice`. Không có giá nào dùng được
 * thì BỎ mã đó: cột `price` có check > 0, và một mã giá 0 trong bảng còn tệ hơn một mã
 * thiếu (thiếu thì UI cảnh báo "chưa có giá", còn 0 thì âm thầm làm tổng tài sản tụt).
 */
export function parseBoard(exchange: Exchange, json: unknown): PriceUpsert[] {
  const data = (json as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) return []

  const out: PriceUpsert[] = []
  for (const raw of data) {
    const r = raw as Record<string, unknown>
    const symbol = typeof r.stockSymbol === 'string' ? r.stockSymbol.trim().toUpperCase() : ''
    if (!symbol) continue

    const trading_date = isoFromCompact(r.tradingDate)
    if (!trading_date) continue

    const price = positive(r.matchedPrice) ?? positive(r.priorClosePrice) ?? positive(r.refPrice)
    if (price === null) continue

    out.push({
      symbol,
      exchange,
      name: typeof r.companyNameVi === 'string' ? r.companyNameVi : '',
      price,
      prior_close: positive(r.priorClosePrice),
      trading_date,
    })
  }
  return out
}

/** Gọi một sàn. Lỗi mạng / HTTP → throw, người gọi tự quyết bỏ sàn đó. */
export async function fetchBoard(exchange: Exchange): Promise<PriceUpsert[]> {
  const res = await fetch(BOARD_URL(exchange), {
    headers: { 'User-Agent': 'Mozilla/5.0 (so-chi-tieu stock-refresh)' },
  })
  if (!res.ok) throw new Error(`SSI ${exchange}: HTTP ${res.status}`)
  return parseBoard(exchange, await res.json())
}
```

- [ ] **Step 5: Chạy test để chắc là nó xanh**

Run: `npx vitest run supabase/functions/stock-refresh/prices.test.ts`

Expected: PASS — 6 test.

- [ ] **Step 6: Viết `index.ts` (chỉ phần hút giá)**

Create `supabase/functions/stock-refresh/index.ts`:

```ts
// Edge function stock-refresh — chạy mỗi chiều sau khi sàn Việt Nam đóng cửa.
//
// Hai việc: (1) hút bảng giá SSI vào stock_prices, (2) tính lại giá trị thị trường cho
// từng tài khoản có sổ lệnh và ghi vào account_valuations. Việc (2) nối ở Task 8.
//
// Function này KHÔNG có phép tính riêng. Mọi phép tính gọi từ `_holdings.js` (gói từ
// src/features/assets/serverBundle.ts) — cùng lý do như push-notify: hai bản sao của
// một phép tính là chuyện sớm muộn lệch nhau.
//
// Chạy thử tại máy:  supabase functions serve stock-refresh
// Deploy:            npm run bundle:rules && supabase functions deploy stock-refresh --no-verify-jwt
// Xem thêm:          docs/co-phieu-viet-nam.md

import { createClient } from 'npm:@supabase/supabase-js@2'
import { fetchBoard, type Exchange, type PriceUpsert } from './prices.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
// Dùng lại bí mật cron của push: nó là "bí mật cho cron" nói chung, không riêng gì push.
// Không có nó thì bất kỳ ai biết URL cũng gọi được function và đốt hạn mức.
const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET') ?? ''

const EXCHANGES: Exchange[] = ['hose', 'hnx', 'upcom']

interface KetQua {
  /** Số mã đã ghi vào bảng giá, theo sàn. */
  giaTheoSan: Record<string, number>
  loi: string[]
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET || !CRON_SECRET) {
    return new Response('Sai bí mật cron', { status: 401 })
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const kq: KetQua = { giaTheoSan: {}, loi: [] }

  // Hút từng sàn độc lập: một sàn lỗi thì hai sàn còn lại vẫn được ghi. Bảng giá thiếu
  // một sàn còn dùng được; ném hết đi vì một sàn hỏng thì không.
  for (const ex of EXCHANGES) {
    try {
      const rows: PriceUpsert[] = await fetchBoard(ex)
      if (rows.length === 0) {
        kq.loi.push(`${ex}: bảng giá rỗng`)
        continue
      }
      // Chia lô: 400+ mã một câu upsert là payload to và dễ timeout.
      for (let i = 0; i < rows.length; i += 200) {
        const part = rows.slice(i, i + 200).map((r) => ({ ...r, updated_at: new Date().toISOString() }))
        const { error } = await sb.from('stock_prices').upsert(part, { onConflict: 'symbol' })
        if (error) throw error
      }
      kq.giaTheoSan[ex] = rows.length
    } catch (err) {
      kq.loi.push(`${ex}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log('stock-refresh', JSON.stringify(kq))
  return new Response(JSON.stringify(kq), {
    status: kq.loi.length > 0 && Object.keys(kq.giaTheoSan).length === 0 ? 500 : 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Step 7: Chạy thử tại máy**

Run (hai terminal):

```bash
supabase functions serve stock-refresh --no-verify-jwt
```

```bash
curl -i -X POST http://localhost:54321/functions/v1/stock-refresh -H "x-cron-secret: <PUSH_CRON_SECRET>"
```

Expected: `200` với body kiểu `{"giaTheoSan":{"hose":407,"hnx":...,"upcom":...},"loi":[]}`. Rồi kiểm DB:

```sql
select count(*) from stock_prices;
select symbol, price, trading_date from stock_prices where symbol in ('FPT','VNM','HPG');
```

Expected: hơn 1.000 mã; FPT có giá > 0 và `trading_date` là phiên gần nhất.

- [ ] **Step 8: Thử gọi sai bí mật**

Run: `curl -i -X POST http://localhost:54321/functions/v1/stock-refresh`

Expected: `401 Sai bí mật cron`.

- [ ] **Step 9: Viết tài liệu deploy**

Create `docs/co-phieu-viet-nam.md` — cùng khuôn `docs/push-notification.md`, gồm: nguồn giá và vì sao chọn SSI; vì sao phải qua server (CORS); các bước `npm run bundle:rules` → `supabase functions deploy stock-refresh --no-verify-jwt`; câu `cron.schedule` (Task 8); cách xem log; cách chạy thử tại máy (hai câu lệnh ở Step 7).

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/stock-refresh docs/co-phieu-viet-nam.md vite.config.ts
git commit -m "feat(dau-tu): edge function hut bang gia co phieu tu SSI"
```

---

## Task 8: Edge function ghi giá trị + hẹn cron

**Files:**
- Create: `supabase/functions/stock-refresh/loadInput.ts`
- Modify: `supabase/functions/stock-refresh/index.ts`
- Modify: `docs/co-phieu-viet-nam.md`

**Interfaces:**
- Consumes: `holdingsFromTrades`, `brokerCash`, `portfolioValue` từ `./_holdings.js` (Task 6); `PriceUpsert` (Task 7); cột `account_valuations.source` (Task 2).
- Produces: `loadPortfolioAccounts(sb): Promise<PortfolioAccount[]>` với `PortfolioAccount { userId: string; accountId: string; balance: number; trades: Trade[] }`.

- [ ] **Step 1: Viết `loadInput.ts`**

Create `supabase/functions/stock-refresh/loadInput.ts`:

```ts
// Đọc Postgres và xếp dữ liệu vào đúng ô cho `_holdings.js`.
//
// Ràng buộc: KHÔNG tự tính gì cả — giống loadInput.ts của push-notify. Nếu bạn thấy
// mình đang viết phép cộng trừ tiền ở file này thì phép đó thuộc về src/.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

// deno-lint-ignore no-explicit-any
type Row = any

/** Một tài khoản đủ điều kiện tự chạy, kèm sổ lệnh của nó. */
export interface PortfolioAccount {
  userId: string
  accountId: string
  /** số dư sổ (minor units VND) từ view account_balances */
  balance: number
  /** shape khớp `Trade` của holdings.ts */
  trades: {
    symbol: string
    kind: 'buy' | 'sell' | 'adjust'
    tradedOn: string
    quantity: number
    price: number
    fee: number
    tax: number
  }[]
}

/** Đọc hết một bảng, phân trang, thứ tự đơn trị (xem src/data/paging.ts). */
async function readAll(sb: SupabaseClient, table: string, orderBy = 'id'): Promise<Row[]> {
  const PAGE = 1_000
  const out: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select('*')
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

/**
 * Tài khoản đủ điều kiện tự chạy: loại 'investment', tiền VND, chưa lưu trữ, và có ít
 * nhất một dòng sổ lệnh. Không có nút bật/tắt — ghi lệnh vào là chạy (quyết định 5).
 */
export async function loadPortfolioAccounts(sb: SupabaseClient): Promise<PortfolioAccount[]> {
  const [balances, trades] = await Promise.all([
    readAll(sb, 'account_balances'),
    readAll(sb, 'stock_trades'),
  ])

  const byAccount = new Map<string, PortfolioAccount['trades']>()
  for (const t of trades) {
    const list = byAccount.get(t.account_id) ?? []
    list.push({
      symbol: t.symbol,
      kind: t.kind,
      tradedOn: t.traded_on,
      quantity: Number(t.quantity),
      price: Number(t.price),
      fee: Number(t.fee),
      tax: Number(t.tax),
    })
    byAccount.set(t.account_id, list)
  }

  const out: PortfolioAccount[] = []
  for (const b of balances) {
    if (b.type !== 'investment' || b.currency !== 'VND' || b.is_archived) continue
    const list = byAccount.get(b.id)
    if (!list || list.length === 0) continue
    out.push({
      userId: b.user_id,
      accountId: b.id,
      balance: Number(b.balance),
      trades: list,
    })
  }
  return out
}
```

- [ ] **Step 2: Nối phần tính + ghi vào `index.ts`**

Modify `supabase/functions/stock-refresh/index.ts`:

Thêm import:

```ts
// deno-lint-ignore-file no-explicit-any
import { brokerCash, holdingsFromTrades, portfolioValue } from './_holdings.js'
import { loadPortfolioAccounts } from './loadInput.ts'
```

Mở rộng `KetQua`:

```ts
interface KetQua {
  giaTheoSan: Record<string, number>
  /** Số tài khoản đã ghi snapshot mới. */
  daGhi: number
  /** Vì sao những tài khoản còn lại bị bỏ qua — gom theo lý do để đọc log cho nhanh. */
  boQua: Record<string, number>
  loi: string[]
}

function demBoQua(kq: KetQua, lyDo: string) {
  kq.boQua[lyDo] = (kq.boQua[lyDo] ?? 0) + 1
}
```

Thêm sau vòng lặp hút giá, trước `console.log`:

```ts
  // --- Việc 2: tính lại giá trị thị trường và ghi vào account_valuations ---
  try {
    const { data: priceRows, error: priceErr } = await sb
      .from('stock_prices')
      .select('symbol, price, trading_date')
    if (priceErr) throw priceErr

    const priceBySymbol = new Map<string, number>(
      (priceRows ?? []).map((p: any) => [p.symbol, Number(p.price)]),
    )
    // Ngày phiên mới nhất trong bảng giá = ngày mà snapshot này thuộc về. Ngày lễ sàn
    // không chạy nên SSI vẫn trả ngày phiên trước — dùng ngày phiên (không phải hôm
    // nay) là thứ giữ cho lịch sử net worth không đầy những ngày trùng số.
    const phien = (priceRows ?? [])
      .map((p: any) => p.trading_date as string)
      .sort()
      .at(-1)
    if (!phien) throw new Error('Bảng giá rỗng, không biết ngày phiên')

    const accounts = await loadPortfolioAccounts(sb)
    for (const a of accounts) {
      const { holdings, oversold } = holdingsFromTrades(a.trades)
      // Sổ lệnh có lỗ hổng: giữ số cũ, không ghi số biết là sai.
      if (oversold.length > 0) {
        demBoQua(kq, 'so-lenh-co-lo-hong')
        continue
      }
      const cash = brokerCash(a.balance, a.trades)
      const { marketValue } = portfolioValue(holdings, priceBySymbol, cash)
      if (marketValue === null) {
        demBoQua(kq, cash < 0 ? 'tien-chua-dau-tu-am' : 'thieu-gia-moi-ma')
        continue
      }

      // `ignoreDuplicates: false` = do update. Mệnh đề `where source = 'auto'` không
      // biểu diễn được qua PostgREST, nên đọc trước rồi mới quyết: hàng người dùng gõ
      // tay của đúng ngày đó phải được giữ nguyên (quyết định 4).
      const { data: sanCo, error: docErr } = await sb
        .from('account_valuations')
        .select('id, source')
        .eq('account_id', a.accountId)
        .eq('valued_on', phien)
        .maybeSingle()
      if (docErr) throw docErr
      if (sanCo && sanCo.source === 'manual') {
        demBoQua(kq, 'nguoi-dung-da-go-tay')
        continue
      }

      const { error: ghiErr } = await sb.from('account_valuations').upsert(
        {
          user_id: a.userId,
          account_id: a.accountId,
          valued_on: phien,
          market_value: marketValue,
          note: `Tự tính theo giá phiên ${phien}`,
          source: 'auto',
        },
        { onConflict: 'account_id,valued_on' },
      )
      if (ghiErr) throw ghiErr
      kq.daGhi++
    }
  } catch (err) {
    kq.loi.push(`ghi gia tri: ${err instanceof Error ? err.message : String(err)}`)
  }
```

Khởi tạo `kq` thành `{ giaTheoSan: {}, daGhi: 0, boQua: {}, loi: [] }`.

> **Vì sao đọc trước rồi mới upsert** thay vì một câu SQL: PostgREST không diễn tả được `do update ... where`. Một câu SQL thuần sẽ gọn hơn nhưng phải đi qua `rpc` và một hàm Postgres nữa — đọc trước rẻ hơn, và số tài khoản đầu tư của một người dùng là vài cái, không phải vài nghìn.

- [ ] **Step 3: Chạy thử tại máy và kiểm số**

Trước hết seed dữ liệu thật vào DB local: tạo một tài khoản `investment` currency `VND`, chuyển vào 100.000.000đ, ghi một lệnh mua 1.000 FPT giá 70.000 phí 105.000 (dùng UI ở Task 5).

Run:

```bash
curl -s -X POST http://localhost:54321/functions/v1/stock-refresh -H "x-cron-secret: <PUSH_CRON_SECRET>"
```

Expected: `"daGhi":1`. Rồi:

```sql
select valued_on, market_value, source, note from account_valuations order by valued_on desc limit 3;
```

Expected: một hàng `source = 'auto'`, `market_value` = `1000 × giá FPT hôm nay + 29.895.000`.

- [ ] **Step 4: Kiểm rằng số gõ tay không bị đè**

Trong app, mở tài khoản đó → "Cập nhật giá trị" → gõ một số khác hẳn (vd 999.000.000) cho **đúng ngày phiên**. Rồi gọi lại function.

Expected: `"boQua":{"nguoi-dung-da-go-tay":1}` và `market_value` trong DB vẫn là 999.000.000, `source` vẫn `manual`.

- [ ] **Step 5: Kiểm van báo sổ lệnh thiếu**

Ghi thêm một lệnh mua 10.000 FPT giá 70.000 (vượt xa số tiền đã nạp) rồi gọi lại function.

Expected: `"boQua":{"tien-chua-dau-tu-am":1}`, và **không** có hàng snapshot mới nào.

Xoá lệnh đó sau khi kiểm xong.

- [ ] **Step 6: Xem Tổng tài sản đã tự đúng**

Mở trang Tài sản trong app.

Expected: tài khoản chứng khoán hiện theo giá thị trường; khu "Hiệu quả đầu tư" có lãi/lỗ; không phải bấm gì.

- [ ] **Step 7: Deploy và hẹn cron**

Run:

```bash
npm run bundle:rules
supabase functions deploy stock-refresh --no-verify-jwt
```

Rồi trong SQL editor của project:

```sql
select cron.schedule(
  'stock-refresh-daily',
  -- 08:45 UTC = 15:45 giờ Việt Nam, thứ Hai–thứ Sáu. Sau khi sàn đóng cửa (15:00) và
  -- khớp lệnh ATC xong. Việt Nam KHÔNG có giờ mùa hè nên một mốc UTC cố định là đủ —
  -- khác push (mục J) phải lưu giờ + múi giờ vì chủ app đổi nước và Mỹ có DST. Ở đây
  -- múi giờ neo vào SÀN GIAO DỊCH, không vào người dùng.
  '45 8 * * 1-5',
  $$ select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/stock-refresh',
       headers := '{"Content-Type": "application/json", "x-cron-secret": "<PUSH_CRON_SECRET>"}'::jsonb
     ) $$
);
```

Kiểm: `select * from cron.job;` phải có `stock-refresh-daily`.

- [ ] **Step 8: Cập nhật `docs/co-phieu-viet-nam.md`**

Thêm câu `cron.schedule` ở trên, cách xem lịch sử chạy (`select * from cron.job_run_details order by start_time desc limit 20;`), và bảng giải thích từng lý do trong `boQua` (`so-lenh-co-lo-hong`, `tien-chua-dau-tu-am`, `thieu-gia-moi-ma`, `nguoi-dung-da-go-tay`) — người đọc log sáu tháng sau sẽ không tự đoán ra.

- [ ] **Step 9: Chạy toàn bộ kiểm tra**

Run: `npm test && npm run lint && npm run build`

Expected: PASS hết. Đặc biệt `tests/pushBundle.test.ts` phải xanh — nếu đỏ thì `_holdings.js` đã cũ, chạy `npm run bundle:rules` rồi commit lại.

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/stock-refresh docs/co-phieu-viet-nam.md
git commit -m "feat(dau-tu): cron tu ghi gia tri thi truong moi chieu"
```

---

## Self-Review

**Spec coverage:**

| Mục trong spec | Task |
|----------------|------|
| Quyết định 1 (ghi từng lệnh) | 2 (schema), 5 (UI) |
| Quyết định 2 (server tự chạy) | 7, 8 |
| Quyết định 3 (ghi vào `account_valuations`) | 8 Step 2 |
| Quyết định 4 (số gõ tay thắng) | 2 Step 1 (cột `source`), 8 Step 2 + Step 4 (kiểm) |
| Quyết định 5 (không nút bật/tắt) | 8 Step 1 (`loadPortfolioAccounts`) |
| Quyết định 6 (phí + thuế) | 2 (cột), 5 (ô nhập + gợi ý %) |
| `stock_prices` không có `user_id` | 2 Step 1 (kèm lý giải trong SQL) |
| Loại lệnh `adjust` | 1 (phép tính), 2 (ràng buộc SQL), 5 (UI) |
| Giá vốn bình quân, không FIFO | 1 |
| Tiền chưa đầu tư + van báo âm | 1, 4 (cảnh báo), 8 (bỏ qua) |
| `oversold` | 1, 4 (cảnh báo), 8 (bỏ qua) |
| Thiếu giá một phần → giá vốn + cảnh báo | 1, 4 |
| Ngày lễ không ghi trùng | 8 Step 2 (dùng ngày phiên làm `valued_on`, unique chặn trùng) |
| `matchedPrice` → `priorClose` → `refPrice` | 7 Step 4 + test |
| Một sàn lỗi vẫn ghi sàn còn lại | 7 Step 6 |
| Gói phép tính, không copy | 6 |
| Backup v7 | 3 |
| Demo seed | 3 Step 4 |
| Sheet "Cập nhật giá trị" cũ giữ nguyên | không sửa file đó — `source` mặc định `'manual'` lo phần còn lại |
| Nguồn dự phòng Yahoo | **không làm** — xem "Cố ý để sau" |

**Cố ý để sau (không phải lỗ hổng):**

- **Yahoo làm nguồn dự phòng.** Spec xếp nó vào phần "đỡ đòn" cho rủi ro SSI đổi đường dẫn. Chưa cần: hai lớp đỡ khác (giá cũ vẫn nằm trong bảng, và `missingPrices` cảnh báo) đã đủ để app không trắng số. Thêm nguồn thứ hai lúc chưa hỏng lần nào là viết code không có gì kiểm chứng. Khi SSI thực sự đổi thì thêm vào `prices.ts` — chỗ đó đã tách sẵn `fetchBoard` cho việc này.
- **Cảnh báo "giá có thể đã cũ" khi `updated_at` quá 3 ngày phiên.** Cần đếm ngày phiên (bỏ cuối tuần và lễ) nên là một helper riêng có test riêng. Task 4 đã hiện ngày phiên ra màn hình nên người dùng tự thấy được số cũ.

**Placeholder scan:** không còn `TBD`/`TODO`. Ba chỗ dùng dấu ngoặc nhọn là **giá trị môi trường thật** người chạy phải điền, đúng lệ `docs/push-notification.md`: `<ref>` (mã project Supabase) và `<PUSH_CRON_SECRET>`. Task 4 Step 2 có một `null /* nối ở Task 5 */` — cố ý, để `tsc` xanh giữa hai task, và Task 5 Step 2 thay nó.

**Type consistency:** `Trade` (Task 1) ↔ `PortfolioAccount.trades` (Task 8) cùng shape camelCase `tradedOn`; `StockTradeRow` (Task 2) dùng snake_case `traded_on` và được đổi tên ở Task 4 (`asTrades`) và Task 8 (`loadInput`) — hai chỗ duy nhất bắc cầu, cố ý. `holdingsFromTrades` / `brokerCash` / `portfolioValue` giữ nguyên tên ở cả 5 chỗ gọi (Task 1, 4, 6, 8). `BACKUP_VERSION = 7` khớp giữa Task 3 Step 3 và test ở Task 3 Step 1.
