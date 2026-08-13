# Gộp danh mục đầu tư về một trang — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/invest` thành trang danh mục duy nhất với hai tab (cổ phiếu VN / quỹ Nhật), và trang chi tiết tài khoản bỏ hẳn khu danh mục trùng lặp.

**Architecture:** Trang tài khoản không có phép tính riêng — nó gọi đúng hàm mà tab gọi (`buildPortfolio` / `buildFundPortfolio`) với mảng một phần tử, nên hai màn lệch nhau là chuyện không biểu diễn được. Bên cổ phiếu đã có hàm gộp nhiều tài khoản; bên quỹ phải viết mới theo đúng khuôn đó. Hai tab không có con số gộp quy đổi tỷ giá.

**Tech Stack:** React 19 + TypeScript, React Router (tab nằm trong query param), TanStack Query (hook `use*` trong `src/hooks/queries.ts`), Tailwind (token `fg-*` / `surface-*`), Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-13-gop-trang-dau-tu-design.md`](../specs/2026-08-13-gop-trang-dau-tu-design.md) — 7 quyết định, đọc trước khi bắt đầu.

## Global Constraints

- **Không có React Testing Library, không jsdom** trong repo này. Không viết test component. Việc gì không test thuần được thì kiểm bằng `npx tsc -b`, `npm run lint`, `npm test` (bộ guard quét mã nguồn) và bấm tay ở chế độ demo.
- **Mọi phép tính nằm ở file thuần** (`holdings.ts`, `portfolio.ts`, `fundHoldings.ts`, `fundPortfolio.ts`). Component chỉ đọc dữ liệu và bày ra — không viết công thức trong `.tsx`.
- **Chú thích tiếng Việt, giải thích VÌ SAO**, theo giọng các file đang có. Định danh xuất ra ngoài đặt tên tiếng Anh (`buildFundPortfolio`), biến cục bộ tiếng Việt được (`thieuGia`, `giaCu`).
- **Tiền là minor units**, hiển thị qua `<Money>` — không tự `toLocaleString` cho tiền.
- **Nút quay lại phải là `<BackLink>`**, không tự viết `<Link>`/`<button>` — `src/backLink.test.ts` canh chỗ này.
- **Không dùng route chuyển tiếp làm đường ống nội bộ** — `src/routeLinks.test.ts` canh chỗ này.
- **% lãi/lỗ của danh mục luôn chia cho giá vốn sổ lệnh** (`stockCost` / `fundCost`), không bao giờ chia cho số dư sổ. Quyết định 1 của spec.
- **KHÔNG đổi nguồn số của tab Hiện tại.** `aggregate.ts` vẫn đọc snapshot `market_value` của `account_balances`; Task 9 chỉ đổi TÊN và NHÃN. Quyết định 6 của spec giải thích vì sao đổi sang tính tại máy là một đợt riêng: nó kéo theo cơ cấu tài sản, lịch sử tài sản ròng và Lifetime. Nếu trong lúc làm thấy "sửa luôn cho nhất quán" thì **dừng và hỏi**, đừng sửa.
- Mỗi task kết thúc bằng một commit. Commit message tiếng Việt không dấu, kèm dòng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/features/assets/holdings.ts` | *(sửa)* thêm `reliableTotal` — quy tắc "tổng đáng tin" của cổ phiếu, một chỗ duy nhất |
| `src/features/assets/portfolio.ts` | *(sửa)* gọi `reliableTotal` thay vì chép lại quy tắc |
| `src/features/assets/fundPortfolio.ts` | *(mới)* `buildFundPortfolio` — gộp nhiều tài khoản quỹ JPY |
| `src/features/assets/useFundInvestData.ts` | *(mới)* đọc dữ liệu cho tab quỹ |
| `src/features/assets/useInvestData.ts` | *(sửa)* nhận lọc theo `accountId` |
| `src/features/assets/InvestPage.tsx` | *(sửa)* còn vỏ: header + tab + đọc `?tab`/`?account` |
| `src/features/assets/InvestStocksTab.tsx` | *(mới)* nội dung tab cổ phiếu |
| `src/features/assets/InvestFundsTab.tsx` | *(mới)* nội dung tab quỹ |
| `src/features/assets/InvestAccountChips.tsx` | *(mới)* chip chọn tài khoản, dùng chung hai tab |
| `src/features/assets/useAccountPortfolio.ts` | *(mới)* số tóm tắt cho trang chi tiết tài khoản |
| `src/features/assets/AccountDetailPage.tsx` | *(sửa)* bỏ hai khu danh mục, đổi nguồn giá trị, lọc `source` |
| `src/features/assets/HoldingsSection.tsx` | *(xoá)* |
| `src/features/assets/FundHoldingsSection.tsx` | *(xoá)* |
| `src/features/assets/AssetsPage.tsx` | *(sửa)* mở lối vào cho JPY, sửa `aria-label` |
| `src/features/assets/InvestmentPerformanceSection.tsx` | *(sửa)* nhãn link |
| `src/features/assets/aggregate.ts` · `AssetsNowView.tsx` | *(sửa)* quyết định 7 — đổi tên field + nhãn, không đổi số |
| `src/data/demoRepo.ts` | *(sửa)* dựng snapshot `auto` cho tài khoản đầu tư JPY |
| `src/App.tsx` | *(sửa)* khung xương `/invest` `'list'` → `'cards'` |
| `tests/designSystem.test.ts` | *(sửa)* hạ trần sau khi xoá hai component |

---

### Task 1: `reliableTotal` — rút quy tắc bị viết hai lần

**Files:**
- Modify: `src/features/assets/holdings.ts:180-201`
- Modify: `src/features/assets/portfolio.ts:135`
- Test: `src/features/assets/holdings.test.ts`

**Interfaces:**
- Consumes: không gì.
- Produces: `reliableTotal(stockValue: number, cash: number, allMissing: boolean): number | null`

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `src/features/assets/holdings.test.ts`, và thêm `reliableTotal` vào dòng `import` sẵn có ở đầu file:

```ts
describe('reliableTotal', () => {
  it('tiền chưa mua âm → null, vì sổ lệnh thiếu một lần nạp nên tổng chắc chắn sai', () => {
    expect(reliableTotal(10_000_000, -500_000, false)).toBeNull()
  })

  it('thiếu giá MỌI mã → null, vì tổng lúc đó chỉ bằng đúng giá vốn', () => {
    expect(reliableTotal(10_000_000, 500_000, true)).toBeNull()
  })

  it('thiếu giá MỘT PHẦN → vẫn trả số, mã thiếu tạm tính theo giá vốn', () => {
    expect(reliableTotal(10_000_000, 500_000, false)).toBe(10_500_000)
  })

  it('tiền chưa mua bằng 0 không phải âm → vẫn trả số', () => {
    expect(reliableTotal(10_000_000, 0, false)).toBe(10_000_000)
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó đỏ**

```bash
npx vitest run src/features/assets/holdings.test.ts
```

Kỳ vọng: FAIL — `reliableTotal is not exported` (hoặc `is not a function`).

- [ ] **Step 3: Viết hàm**

Trong `src/features/assets/holdings.ts`, thêm hàm này NGAY TRƯỚC `portfolioValue`:

```ts
/**
 * Tổng đáng tin của một danh mục cổ phiếu, hoặc `null` khi không đáng tin.
 *
 * Một chỗ DUY NHẤT giữ quy tắc này. `portfolioValue` (một tài khoản) và `buildPortfolio`
 * (gộp nhiều tài khoản) đều gọi vào đây — trước đó `buildPortfolio` chép lại đúng biểu
 * thức và tự ghi trong chú thích rằng nó "cùng hai điều kiện với portfolioValue", tức đã
 * biết mình là bản sao. Bản sao biết mình là bản sao vẫn là bản sao.
 *
 * Quỹ Nhật KHÔNG dùng hàm này: tài khoản quỹ không giữ tiền nhàn rỗi nên `fundValue` chỉ
 * có nhánh `allMissing`, không có nhánh `cash < 0`.
 */
export function reliableTotal(
  stockValue: number,
  cash: number,
  allMissing: boolean,
): number | null {
  return cash < 0 || allMissing ? null : stockValue + cash
}
```

Rồi trong `portfolioValue`, thay hai dòng cuối trước `return`:

```ts
  const allMissing = holdings.length > 0 && missingPrices.length === holdings.length
  const marketValue = reliableTotal(stockValue, cash, allMissing)
```

- [ ] **Step 4: Chạy test để chắc nó xanh**

```bash
npx vitest run src/features/assets/holdings.test.ts
```

Kỳ vọng: PASS, tất cả.

- [ ] **Step 5: Cho `buildPortfolio` gọi cùng hàm đó**

Trong `src/features/assets/portfolio.ts`, sửa dòng `import`:

```ts
import { brokerCash, holdingsFromTrades, reliableTotal, type Trade } from './holdings'
```

Rồi thay đúng dòng `marketValue` trong khối `return` (dòng 135):

```ts
    marketValue: reliableTotal(stockValue, cash, allMissing),
```

- [ ] **Step 6: Chạy cả hai bộ test — hành vi không được đổi**

```bash
npx vitest run src/features/assets/holdings.test.ts src/features/assets/portfolio.test.ts
```

Kỳ vọng: PASS. `portfolio.test.ts` phải xanh **mà không sửa gì trong nó** — đó là bằng chứng đây là refactor thuần.

- [ ] **Step 7: Commit**

```bash
git add src/features/assets/holdings.ts src/features/assets/holdings.test.ts src/features/assets/portfolio.ts
git commit -m "refactor(dau-tu): rut reliableTotal ra mot cho duy nhat

buildPortfolio dang chep lai dieu kien null cua portfolioValue va tu ghi
trong chu thich rang no cung hai dieu kien do. Gio ca hai goi mot ham.
portfolio.test.ts xanh khong sua gi = refactor thuan.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `buildFundPortfolio` — gộp nhiều tài khoản quỹ

**Files:**
- Create: `src/features/assets/fundPortfolio.ts`
- Create: `src/features/assets/fundPortfolio.test.ts`
- Modify: `src/features/assets/fundHoldings.ts:92-94` (xuất `avgNavOf`)

**Interfaces:**
- Consumes: `fundHoldingsFromTrades`, `fundLineValue`, `NAV_UNITS`, `type FundTrade`, `type FundHolding` từ `./fundHoldings`.
- Produces:
  - `buildFundPortfolio(accounts: FundAccountTrades[], navByFund: Map<string, number>): FundPortfolio`
  - `interface FundAccountTrades { accountId: string; accountName: string; trades: FundTrade[] }`
  - `interface FundPortfolioPosition { assocFundCd: string; units: number; costBasis: number; avgNav: number; nav: number | null; value: number; pnl: number; pnlPercent: number | null; weight: number; accountNames: string[] }`
  - `interface FundPortfolio { positions: FundPortfolioPosition[]; fundCost: number; fundValue: number; unrealizedPnl: number; unrealizedPercent: number | null; realizedPnl: number; marketValue: number | null; missingNavs: string[]; oversold: string[] }`
  - `avgNavOf(costBasis: number, units: number): number` (xuất từ `fundHoldings.ts`)

- [ ] **Step 1: Viết test thất bại**

Tạo `src/features/assets/fundPortfolio.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { FundTrade } from './fundHoldings'
import { buildFundPortfolio, type FundAccountTrades } from './fundPortfolio'

// Mã thật của hai quỹ chủ app đang giữ — để bài test đọc được như sao kê.
const SP500 = '9I31223A'
const NDX = '9I314241'

const mua = (
  assocFundCd: string,
  units: number,
  nav: number,
  amount: number,
  tradedOn = '2026-04-09',
): FundTrade => ({ assocFundCd, kind: 'buy', tradedOn, units, nav, amount })

const ban = (
  assocFundCd: string,
  units: number,
  nav: number,
  amount: number,
  tradedOn = '2026-06-09',
): FundTrade => ({ assocFundCd, kind: 'sell', tradedOn, units, nav, amount })

const tk = (
  accountId: string,
  trades: FundTrade[],
  accountName = `TK ${accountId}`,
): FundAccountTrades => ({ accountId, accountName, trades })

describe('buildFundPortfolio', () => {
  it('không tài khoản nào → mọi số bằng 0, không có quỹ nào', () => {
    const p = buildFundPortfolio([], new Map())
    expect(p.positions).toEqual([])
    expect(p.fundValue).toBe(0)
    expect(p.fundCost).toBe(0)
    expect(p.marketValue).toBe(0)
  })

  it('gộp cùng một quỹ ở hai tài khoản thành một dòng, cộng 口数 và giá vốn', () => {
    const p = buildFundPortfolio(
      [
        tk('a', [mua(SP500, 100_000, 20_000, 200_000)], 'NISA'),
        tk('b', [mua(SP500, 50_000, 24_000, 120_000)], 'Tokutei'),
      ],
      new Map([[SP500, 25_000]]),
    )
    expect(p.positions).toHaveLength(1)
    expect(p.positions[0].units).toBe(150_000)
    expect(p.positions[0].costBasis).toBe(320_000)
    expect(p.positions[0].accountNames).toEqual(['NISA', 'Tokutei'])
    // 取得単価 gộp: 320.000 ¥ / 150.000 口 × 10.000 = 21.333 ¥/1万口
    expect(p.positions[0].avgNav).toBe(21_333)
  })

  it('làm tròn TỪNG cặp (tài khoản, quỹ) rồi mới cộng — tổng bằng tổng hai trang chi tiết', () => {
    // 3 口 × 15.000 ÷ 10.000 = 4,5 → làm tròn 5 ở MỖI tài khoản ⇒ 10.
    // Cộng 口数 trước (6 口) rồi mới chia thì ra 9. Bất biến "tổng ở tab = tổng các trang
    // cộng lại" đòi con số 10.
    const p = buildFundPortfolio(
      [tk('a', [mua(SP500, 3, 15_000, 5)]), tk('b', [mua(SP500, 3, 15_000, 5)])],
      new Map([[SP500, 15_000]]),
    )
    expect(p.positions[0].value).toBe(10)
    expect(p.fundValue).toBe(10)
  })

  it('lãi đã chốt cộng từ TỪNG tài khoản, không hoà vốn bình quân chung', () => {
    // Mua 100.000 口 giá vốn 200.000 ¥ ở A; mua cùng số 口 giá vốn 300.000 ¥ ở B;
    // rồi bán sạch ở A thu về 250.000 ¥. Tính riêng: A lãi 50.000 ¥.
    // Đổ chung sổ lệnh thì giá vốn bình quân là 250.000 ¥ ⇒ lệnh đó hoà vốn, tức SAI.
    const p = buildFundPortfolio(
      [
        tk('a', [mua(SP500, 100_000, 20_000, 200_000), ban(SP500, 100_000, 25_000, 250_000)]),
        tk('b', [mua(SP500, 100_000, 30_000, 300_000)]),
      ],
      new Map([[SP500, 30_000]]),
    )
    expect(p.realizedPnl).toBe(50_000)
    expect(p.positions).toHaveLength(1)
    expect(p.positions[0].units).toBe(100_000)
  })

  it('thiếu giá một quỹ → quỹ đó tạm tính theo giá vốn, tên vào missingNavs', () => {
    const p = buildFundPortfolio(
      [tk('a', [mua(SP500, 100_000, 20_000, 200_000), mua(NDX, 100_000, 30_000, 300_000)])],
      new Map([[SP500, 25_000]]),
    )
    expect(p.missingNavs).toEqual([NDX])
    const ndx = p.positions.find((x) => x.assocFundCd === NDX)
    expect(ndx?.value).toBe(300_000)
    expect(ndx?.nav).toBeNull()
    expect(ndx?.pnl).toBe(0)
    // 100.000 口 × 25.000 ÷ 10.000 = 250.000
    expect(p.fundValue).toBe(550_000)
    expect(p.marketValue).toBe(550_000)
  })

  it('thiếu giá MỌI quỹ → marketValue null, vì tổng lúc đó chỉ bằng giá vốn', () => {
    const p = buildFundPortfolio(
      [tk('a', [mua(SP500, 100_000, 20_000, 200_000)])],
      new Map(),
    )
    expect(p.marketValue).toBeNull()
    expect(p.fundValue).toBe(200_000)
  })

  it('bán quá số đang giữ ở một tài khoản → tên quỹ vào oversold', () => {
    const p = buildFundPortfolio(
      [
        tk('a', [mua(SP500, 100_000, 20_000, 200_000), ban(SP500, 150_000, 25_000, 375_000)]),
        tk('b', [mua(NDX, 100_000, 30_000, 300_000)]),
      ],
      new Map([
        [SP500, 25_000],
        [NDX, 30_000],
      ]),
    )
    expect(p.oversold).toEqual([SP500])
  })

  it('tỷ trọng cộng lại bằng 1 khi còn giữ quỹ', () => {
    const p = buildFundPortfolio(
      [tk('a', [mua(SP500, 100_000, 20_000, 200_000), mua(NDX, 100_000, 30_000, 300_000)])],
      new Map([
        [SP500, 20_000],
        [NDX, 30_000],
      ]),
    )
    const tong = p.positions.reduce((s, x) => s + x.weight, 0)
    expect(tong).toBeCloseTo(1, 10)
  })

  it('xếp quỹ theo giá trị giảm dần', () => {
    const p = buildFundPortfolio(
      [tk('a', [mua(SP500, 100_000, 10_000, 100_000), mua(NDX, 100_000, 30_000, 300_000)])],
      new Map([
        [SP500, 10_000],
        [NDX, 30_000],
      ]),
    )
    expect(p.positions.map((x) => x.assocFundCd)).toEqual([NDX, SP500])
  })

  it('bán sạch mọi quỹ → không còn dòng nào, marketValue bằng 0 chứ không null', () => {
    const p = buildFundPortfolio(
      [tk('a', [mua(SP500, 100_000, 20_000, 200_000), ban(SP500, 100_000, 25_000, 250_000)])],
      new Map([[SP500, 25_000]]),
    )
    expect(p.positions).toEqual([])
    expect(p.marketValue).toBe(0)
    expect(p.realizedPnl).toBe(50_000)
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó đỏ**

```bash
npx vitest run src/features/assets/fundPortfolio.test.ts
```

Kỳ vọng: FAIL — `Failed to resolve import "./fundPortfolio"`.

- [ ] **Step 3: Xuất `avgNavOf` để không viết lại công thức 取得単価**

Trong `src/features/assets/fundHoldings.ts`, đổi dòng 92 từ `function avgNavOf(` thành:

```ts
/**
 * 取得単価 = giá vốn trên 10.000 口. Xuất ra vì `buildFundPortfolio` cần đúng công thức
 * này cho dòng ĐÃ GỘP nhiều tài khoản — viết lại ở đó là mời một lần sửa cách làm tròn
 * chỉ trúng một chỗ.
 */
export function avgNavOf(costBasis: number, units: number): number {
  return units > 0 ? Math.round((costBasis / units) * NAV_UNITS) : 0
}
```

- [ ] **Step 4: Viết `buildFundPortfolio`**

Tạo `src/features/assets/fundPortfolio.ts`:

```ts
// Danh mục quỹ Nhật GỘP nhiều tài khoản — thuần, test được.
//
// `fundHoldings.ts` trả lời cho MỘT tài khoản ("tài khoản này đang giữ gì"). File này trả
// lời câu của cả người ("tôi giữ tổng bao nhiêu 口 quỹ này, nằm ở đâu, chiếm bao nhiêu
// phần danh mục") — câu mà trang chi tiết từng tài khoản không bao giờ trả lời được.
//
// Song sinh với `portfolio.ts` (cổ phiếu Việt Nam) và giữ đúng hai bất biến của nó:
//
//  ① CỘNG DỒN TỪNG TÀI KHOẢN RỒI MỚI GỘP, không đổ chung sổ lệnh vào một rổ. Giá vốn bình
//    quân là số của TỪNG công ty chứng khoán; đổ chung ra một con số không khớp app nào.
//  ② LÀM TRÒN TỪNG DÒNG RỒI MỚI CỘNG (xem `fundLineValue`). Cộng 口数 hai tài khoản rồi
//    mới chia 10.000 một lần sẽ lệch tổng của hai trang chi tiết đúng 1 ¥ — và bất biến
//    "tổng ở tab = tổng các trang cộng lại" là thứ giữ cho hai màn không đá nhau.
//
// Khác `portfolio.ts` đúng một chỗ: KHÔNG có `cash`. Rakuten tự quét sạch tiền dư về
// 楽天銀行 nên tài khoản quỹ không giữ tiền nhàn rỗi (xem fundHoldings.ts, lý do 3).

import { avgNavOf, fundHoldingsFromTrades, fundLineValue, type FundTrade } from './fundHoldings'

/** Một tài khoản đầu tư quỹ kèm sổ lệnh của riêng nó. */
export interface FundAccountTrades {
  accountId: string
  accountName: string
  trades: FundTrade[]
}

export interface FundPortfolioPosition {
  assocFundCd: string
  /** 口数 đang giữ, cộng từ mọi tài khoản */
  units: number
  /** yên, đã gồm mọi khoản đã bỏ ra */
  costBasis: number
  /** ¥/10.000口 — 取得単価 của dòng đã gộp */
  avgNav: number
  /** ¥/10.000口 theo phiên mới nhất; null = chưa có giá */
  nav: number | null
  /** giá trị theo giá hôm nay; THIẾU GIÁ thì tạm tính bằng giá vốn */
  value: number
  /** value − costBasis */
  pnl: number
  /** null khi giá vốn ≤ 0 (không chia được) */
  pnlPercent: number | null
  /** value / tổng giá trị quỹ; 0 khi tổng bằng 0 */
  weight: number
  /** Tài khoản đang giữ quỹ này, theo tên — một quỹ có thể nằm ở nhiều nơi. */
  accountNames: string[]
}

export interface FundPortfolio {
  /** Chỉ quỹ còn giữ, sắp theo giá trị giảm dần. */
  positions: FundPortfolioPosition[]
  /** Tổng giá vốn quỹ đang giữ. */
  fundCost: number
  /** Tổng giá trị quỹ (quỹ thiếu giá tạm tính theo giá vốn). */
  fundValue: number
  /** fundValue − fundCost */
  unrealizedPnl: number
  /** null khi fundCost ≤ 0 */
  unrealizedPercent: number | null
  /** Lãi/lỗ ĐÃ hiện thực hoá, cộng từ từng tài khoản. */
  realizedPnl: number
  /**
   * Bằng `fundValue`, trừ khi thiếu giá MỌI quỹ đang giữ — lúc đó null, vì con số chỉ
   * bằng đúng giá vốn nên không nói thêm được gì. Cùng quy tắc `fundValue()` của một tài
   * khoản. Không có nhánh "tiền âm" như bên cổ phiếu: tài khoản quỹ không giữ tiền.
   */
  marketValue: number | null
  /** Quỹ đang giữ mà chưa có giá — đang tạm tính theo giá vốn. */
  missingNavs: string[]
  /** Quỹ bị bán quá số đang giữ ở ít nhất một tài khoản → sổ lệnh có lỗ hổng. */
  oversold: string[]
}

export function buildFundPortfolio(
  accounts: FundAccountTrades[],
  navByFund: Map<string, number>,
): FundPortfolio {
  const merged = new Map<
    string,
    { units: number; costBasis: number; value: number; accounts: string[] }
  >()
  const oversold = new Set<string>()
  let realizedPnl = 0

  const giaCuaQuy = (assocFundCd: string): number | null => {
    const nav = navByFund.get(assocFundCd)
    return nav != null && nav > 0 ? nav : null
  }

  for (const acc of accounts) {
    const r = fundHoldingsFromTrades(acc.trades)
    realizedPnl += r.realizedPnl
    for (const m of r.oversold) oversold.add(m)

    for (const h of r.holdings) {
      const nav = giaCuaQuy(h.assocFundCd)
      // Bất biến ② — làm tròn Ở ĐÂY, theo từng cặp (tài khoản, quỹ).
      const value = nav === null ? h.costBasis : fundLineValue(h.units, nav)
      const cur = merged.get(h.assocFundCd) ?? {
        units: 0,
        costBasis: 0,
        value: 0,
        accounts: [],
      }
      cur.units += h.units
      cur.costBasis += h.costBasis
      cur.value += value
      cur.accounts.push(acc.accountName)
      merged.set(h.assocFundCd, cur)
    }
  }

  const fundCost = [...merged.values()].reduce((s, m) => s + m.costBasis, 0)
  const fundValue = [...merged.values()].reduce((s, m) => s + m.value, 0)

  const positions: FundPortfolioPosition[] = [...merged.entries()]
    .map(([assocFundCd, m]) => ({
      assocFundCd,
      units: m.units,
      costBasis: m.costBasis,
      avgNav: avgNavOf(m.costBasis, m.units),
      nav: giaCuaQuy(assocFundCd),
      value: m.value,
      pnl: m.value - m.costBasis,
      pnlPercent: m.costBasis > 0 ? (m.value - m.costBasis) / m.costBasis : null,
      weight: fundValue > 0 ? m.value / fundValue : 0,
      accountNames: m.accounts,
    }))
    .sort((a, b) => b.value - a.value || a.assocFundCd.localeCompare(b.assocFundCd))

  const missingNavs = positions.filter((p) => p.nav === null).map((p) => p.assocFundCd)
  const allMissing = positions.length > 0 && missingNavs.length === positions.length

  return {
    positions,
    fundCost,
    fundValue,
    unrealizedPnl: fundValue - fundCost,
    unrealizedPercent: fundCost > 0 ? (fundValue - fundCost) / fundCost : null,
    realizedPnl,
    marketValue: allMissing ? null : fundValue,
    missingNavs,
    oversold: [...oversold].sort(),
  }
}
```

- [ ] **Step 5: Chạy test để chắc nó xanh**

```bash
npx vitest run src/features/assets/fundPortfolio.test.ts src/features/assets/fundHoldings.test.ts
```

Kỳ vọng: PASS cả hai file. `fundHoldings.test.ts` phải xanh không sửa gì (chỉ thêm `export`).

- [ ] **Step 6: Commit**

```bash
git add src/features/assets/fundPortfolio.ts src/features/assets/fundPortfolio.test.ts src/features/assets/fundHoldings.ts
git commit -m "feat(quy-nhat): buildFundPortfolio gop nhieu tai khoan quy

Song sinh voi portfolio.ts, giu dung hai bat bien: cong don tung tai khoan
roi moi gop (gia von binh quan la so cua tung cong ty chung khoan), va lam
tron tung cap (tai khoan, quy) roi moi cong (cong 口数 truoc roi chia 10.000
mot lan lech 1 yen so voi tong hai trang chi tiet).

Khong co cash: tai khoan quy khong giu tien nhan roi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `useFundInvestData` + `useInvestData` nhận lọc theo tài khoản

**Files:**
- Create: `src/features/assets/useFundInvestData.ts`
- Modify: `src/features/assets/useInvestData.ts`

**Interfaces:**
- Consumes: `buildFundPortfolio`, `type FundAccountTrades`, `type FundPortfolio` (Task 2).
- Produces:
  - `useInvestData(accountId?: string | null): InvestData` — thêm field `filtered: AccountRow[]`
  - `useFundInvestData(accountId?: string | null): FundInvestData` với `{ accounts, filtered, trades, portfolio, session, staleHeld, accountName, fundName, isLoading }`

- [ ] **Step 1: Cho `useInvestData` nhận `accountId`**

Trong `src/features/assets/useInvestData.ts`, thêm field vào interface (ngay dưới `accounts`):

```ts
  /**
   * Tập tài khoản đang được TÍNH. Bằng `accounts` khi không lọc; bằng một phần tử khi
   * trang gọi kèm `?account=`. Giữ riêng khỏi `accounts` vì `accounts` còn dùng để dựng
   * chip chọn và để biết có nên hiện trạng thái rỗng hay không — lọc mất nó thì chip tự
   * biến mất ngay khi bấm vào một chip.
   */
  filtered: AccountRow[]
```

Đổi chữ ký hàm và thêm phép lọc ngay sau `accounts`:

```ts
export function useInvestData(accountId?: string | null): InvestData {
```

```ts
  // `accountId` không khớp tài khoản nào của tab (bookmark cũ, tài khoản đã xoá hoặc đã
  // lưu trữ) → bỏ qua, hiện tất cả. Người dùng vào đây để xem danh mục, không để nghe
  // về một id.
  const filtered = useMemo(
    () => (accountId ? accounts.filter((a) => a.id === accountId) : accounts),
    [accounts, accountId],
  )
  const shown = filtered.length > 0 ? filtered : accounts
```

Rồi đổi `accounts` thành `shown` ở **hai** chỗ tính: trong `useMemo` của `trades` (`const ids = new Set(shown.map((a) => a.id))`, và mảng phụ thuộc) và trong `useMemo` của `portfolio` (`const input: AccountTrades[] = shown.map(...)`, và mảng phụ thuộc). Trả thêm `filtered` trong khối `return`.

- [ ] **Step 2: Viết `useFundInvestData`**

Tạo `src/features/assets/useFundInvestData.ts`:

```ts
// Dữ liệu cho tab Quỹ Nhật của trang Đầu tư — gom mọi tài khoản đầu tư JPY vào một danh mục.
//
// Chỉ nhận tài khoản `investment` + JPY: 基準価額 là yên trên 10.000 口 (migration 0045),
// tài khoản VND dùng chung khu này sẽ ra số vô nghĩa. Cùng điều kiện mà trang chi tiết tài
// khoản dùng để quyết định hiện khu quỹ hay khu cổ phiếu.
import { useMemo } from 'react'
import { useAccounts, useFundPrices, useFunds, useFundTrades } from '../../hooks/queries'
import type { AccountRow, FundTradeRow } from '../../types/database.types'
import { sessionNavs, type FundTrade } from './fundHoldings'
import { buildFundPortfolio, type FundAccountTrades, type FundPortfolio } from './fundPortfolio'

export interface FundInvestData {
  /** Tài khoản đầu tư JPY đang mở (chưa lưu trữ). */
  accounts: AccountRow[]
  /** Tập đang được TÍNH — xem chú thích cùng tên ở useInvestData. */
  filtered: AccountRow[]
  /** Sổ lệnh của `filtered`, mới nhất trước. */
  trades: FundTradeRow[]
  portfolio: FundPortfolio
  /** Ngày phiên của các quỹ ĐANG GIỮ; null = chưa có giá. */
  session: string | null
  /** Quỹ đang giữ mà giá còn kẹt ở phiên cũ hơn `session`. */
  staleHeld: string[]
  accountName: (id: string) => string
  /** 協会コード → tên quỹ; trả lại chính mã khi danh bạ chưa có. */
  fundName: (assocFundCd: string) => string
  isLoading: boolean
}

export function useFundInvestData(accountId?: string | null): FundInvestData {
  const { data: accountRows = [], isLoading: accLoading } = useAccounts()
  const { data: allTrades = [], isLoading: tradesLoading } = useFundTrades()
  const { data: navRows = [] } = useFundPrices()
  const { data: funds = [] } = useFunds()

  const accounts = useMemo(
    () =>
      accountRows.filter(
        (a) => a.type === 'investment' && a.currency === 'JPY' && !a.is_archived,
      ),
    [accountRows],
  )

  const filtered = useMemo(
    () => (accountId ? accounts.filter((a) => a.id === accountId) : accounts),
    [accounts, accountId],
  )
  const shown = filtered.length > 0 ? filtered : accounts

  const asFundTrade = (t: FundTradeRow): FundTrade => ({
    assocFundCd: t.assoc_fund_cd,
    kind: t.kind,
    tradedOn: t.traded_on,
    units: t.units,
    nav: t.nav,
    amount: t.amount,
  })

  const input: FundAccountTrades[] = useMemo(
    () =>
      shown.map((a) => ({
        accountId: a.id,
        accountName: a.name,
        trades: allTrades.filter((t) => t.account_id === a.id).map(asFundTrade),
      })),
    [shown, allTrades],
  )

  // Ngày phiên tính TRÊN QUỸ ĐANG GIỮ, không trên cả bảng giá: `fund_prices` chứa cả danh
  // bạ 8 quỹ, và một quỹ KHÔNG AI GIỮ đi trước một phiên sẽ làm mọi quỹ đang giữ trông
  // như "giá cũ", mỗi ngày, mãi mãi. Xem sessionNavs().
  const heldCds = useMemo(() => {
    const set = new Set<string>()
    for (const acc of input) for (const t of acc.trades) set.add(t.assocFundCd)
    return [...set]
  }, [input])

  const { session, navByFund, staleFunds } = useMemo(
    () => sessionNavs(navRows, heldCds),
    [navRows, heldCds],
  )

  const portfolio = useMemo(() => buildFundPortfolio(input, navByFund), [input, navByFund])

  const trades = useMemo(() => {
    const ids = new Set(shown.map((a) => a.id))
    return allTrades
      .filter((t) => ids.has(t.account_id))
      .slice()
      .sort(
        (a, b) =>
          b.traded_on.localeCompare(a.traded_on) || b.created_at.localeCompare(a.created_at),
      )
  }, [allTrades, shown])

  // Quỹ có giá hợp lệ nhưng giá đó cũ hơn phiên chung. Loại quỹ đã nằm trong missingNavs:
  // một quỹ chỉ nên bị nêu MỘT lần, và "chưa có giá" đã nói đủ.
  const staleHeld = useMemo(
    () =>
      portfolio.positions
        .filter((p) => staleFunds.has(p.assocFundCd) && p.nav !== null)
        .map((p) => p.assocFundCd),
    [portfolio.positions, staleFunds],
  )

  const nameById = useMemo(() => new Map(accountRows.map((a) => [a.id, a.name])), [accountRows])
  const tenQuy = useMemo(() => new Map(funds.map((f) => [f.assoc_fund_cd, f.name])), [funds])

  return {
    accounts,
    filtered,
    trades,
    portfolio,
    session,
    staleHeld,
    accountName: (id) => nameById.get(id) ?? '—',
    fundName: (cd) => tenQuy.get(cd) || cd,
    isLoading: accLoading || tradesLoading,
  }
}
```

- [ ] **Step 3: Kiểm kiểu và lint**

```bash
npx tsc -b && npm run lint
```

Kỳ vọng: không lỗi. Nếu `tsc` báo `heldCds` sai kiểu ở `sessionNavs`, kiểm lại rằng `navRows` có đúng ba field `assoc_fund_cd`, `nav`, `nav_date`.

- [ ] **Step 4: Chạy toàn bộ test — chưa có gì được đỏ**

```bash
npm test
```

Kỳ vọng: PASS toàn bộ (chưa component nào dùng hook mới).

- [ ] **Step 5: Commit**

```bash
git add src/features/assets/useFundInvestData.ts src/features/assets/useInvestData.ts
git commit -m "feat(dau-tu): useFundInvestData va loc theo tai khoan cho useInvestData

filtered giu rieng khoi accounts: accounts con dung de dung chip chon va de
biet co hien trang thai rong hay khong; loc mat no thi chip tu bien mat ngay
khi bam vao mot chip. accountId khong khop tai khoan nao thi bo qua, hien
tat ca - nguoi dung vao day de xem danh muc, khong de nghe ve mot id.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Vỏ `/invest` hai tab + `InvestStocksTab` + chip chọn tài khoản

**Files:**
- Create: `src/features/assets/InvestAccountChips.tsx`
- Create: `src/features/assets/InvestStocksTab.tsx`
- Modify: `src/features/assets/InvestPage.tsx` (viết lại thành vỏ)

**Interfaces:**
- Consumes: `useInvestData(accountId)` (Task 3); `SegmentedControl`, `type SegmentedItem` từ `../../components/ui`.
- Produces:
  - `InvestAccountChips({ accounts, activeId, onPick }: { accounts: AccountRow[]; activeId: string | null; onPick: (id: string | null) => void })`
  - `InvestStocksTab({ accountId, onPickAccount }: { accountId: string | null; onPickAccount: (id: string | null) => void })`

- [ ] **Step 1: Viết chip chọn tài khoản**

Tạo `src/features/assets/InvestAccountChips.tsx`:

```tsx
// Chip chọn tài khoản cho hai tab của trang Đầu tư.
//
// CHỈ hiện khi tab có từ HAI tài khoản. Một tài khoản thì "Tất cả" và tên tài khoản đó là
// cùng một thứ — một hàng chip đúng với mọi lần mở là một hàng nhiễu.
import type { AccountRow } from '../../types/database.types'

interface Props {
  accounts: AccountRow[]
  /** null = đang xem tất cả */
  activeId: string | null
  onPick: (id: string | null) => void
}

export function InvestAccountChips({ accounts, activeId, onPick }: Props) {
  if (accounts.length < 2) return null

  const chip = (key: string, label: string, active: boolean, id: string | null) => (
    <button
      key={key}
      type="button"
      onClick={() => onPick(id)}
      aria-pressed={active}
      className={`min-h-8 shrink-0 rounded-full px-3 text-xs font-medium ${
        active
          ? 'bg-fg-primary text-surface'
          : 'border border-border-strong text-fg-secondary hover:bg-surface-sunken'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-wrap gap-1.5">
      {chip('all', 'Tất cả', activeId === null, null)}
      {accounts.map((a) => chip(a.id, a.name, activeId === a.id, a.id))}
    </div>
  )
}
```

- [ ] **Step 2: Chuyển nội dung tab cổ phiếu sang file riêng**

Tạo `src/features/assets/InvestStocksTab.tsx`. Nội dung: **chuyển nguyên** phần thân của `InvestPage.tsx` hiện tại (từ khai báo `const VND` ở dòng 19 tới hết JSX ở dòng 375), rồi đổi đúng bảy chỗ dưới đây. Không sửa gì khác — mọi khối `Card`, cảnh báo `oversold`, `staleHeld`, sổ lệnh, modal chọn tài khoản giữ y nguyên.

① Header file mới:

```tsx
// Tab Cổ phiếu VN của trang Đầu tư — danh mục gộp MỌI tài khoản chứng khoán VND.
//
// Tách khỏi vỏ `InvestPage` vì hai tab không dùng chung một phép tính nào: cổ phiếu tính
// bằng đồng và có "tiền chưa mua", quỹ tính bằng yên trên 10.000 口 và không có tiền dư.
// Nhồi cả hai vào một file là mời hai bộ điều kiện lồng nhau trong cùng một JSX.
import { useMemo, useState } from 'react'
import { Guide } from '../../components/Guide'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { EstimateMark } from '../../components/EstimateMark'
import { ActionButton, Card, Money, SectionTitle } from '../../components/ui'
import { HOSE_SYMBOLS } from './hoseSymbols'
import { InvestAccountChips } from './InvestAccountChips'
import { TradeFormSheet } from './TradeFormSheet'
import { useInvestData } from './useInvestData'
import type { StockTradeRow } from '../../types/database.types'

interface Props {
  accountId: string | null
  onPickAccount: (id: string | null) => void
}
```

`BackLink` **không** nằm trong danh sách import: nút quay lại thuộc vỏ trang, không thuộc tab.

② Chữ ký và lấy dữ liệu:

```tsx
export function InvestStocksTab({ accountId, onPickAccount }: Props) {
  const { accounts, filtered, trades, portfolio, session, staleHeld, accountName, isLoading } =
    useInvestData(accountId)
  const activeId = filtered.length === accounts.length ? null : (filtered[0]?.id ?? null)
```

③ `startTrade` dùng `filtered` thay `accounts` — đang lọc về một tài khoản thì không có gì phải hỏi:

```tsx
  /** Một tài khoản thì mở thẳng; nhiều thì phải hỏi — đoán bừa là ghi nhầm sổ. */
  function startTrade() {
    if (filtered.length === 1) setSheet({ accountId: filtered[0].id, trade: null })
    else setPicking(true)
  }
```

④ Bỏ hằng `header` cũ (có `BackLink` và `<h1>`), thay bằng một hàng hành động của riêng tab:

```tsx
  const thanhCongCu = (
    <div className="flex items-center justify-between gap-2">
      <InvestAccountChips accounts={accounts} activeId={activeId} onPick={onPickAccount} />
      {accounts.length > 0 && (
        <ActionButton variant="primary" onClick={startTrade} className="ml-auto">
          <Plus className="h-4 w-4" /> Ghi lệnh
        </ActionButton>
      )}
    </div>
  )
```

⑤ Nhánh đang tải:

```tsx
  if (isLoading) {
    return <p className="py-10 text-center text-sm text-fg-muted">Đang tải…</p>
  }
```

⑥ Trạng thái rỗng — câu này chỉ nói về VND, tab quỹ có câu riêng:

```tsx
  if (accounts.length === 0) {
    return (
      <Card as="section">
        <p className="text-sm text-fg-muted">
          Chưa có tài khoản chứng khoán Việt Nam nào. Tạo một tài khoản loại <b>Đầu tư</b>{' '}
          với loại tiền <b>VND</b> ở{' '}
          <Link to="/settings/accounts" className="font-medium text-fg-accent">
            Cài đặt → Tài khoản
          </Link>
          , rồi ghi lệnh mua bán để app tự lấy giá và tính lời/lỗ.
        </p>
      </Card>
    )
  }
```

⑦ JSX ngoài cùng: bỏ `<div className="flex flex-col gap-3 p-3 lg:p-6">` (vỏ trang lo phần đó) và bỏ `{header}`, thay bằng `<>` … `</>` mở đầu bằng `{thanhCongCu}`. Trong danh sách lệnh, đổi điều kiện in tên tài khoản từ `accounts.length > 1` thành `filtered.length > 1` — đang lọc về một tài khoản thì tên đó đúng với mọi dòng, tức không nói thêm được gì.

⑧ Sửa chú thích **sai** của hàm `ngay` khi chuyển sang. Nó đang tự khai là `dd/mm/yy` nhưng in ra `26/08/12` cho ngày 12/08/2026 — đúng quy ước tháng/ngày của app ([`lib/dates.ts:119`](../../../src/lib/dates.ts#L119)), chỉ có chú thích sai:

```tsx
/** ISO → yy/mm/dd theo quy ước tháng/ngày của app (lib/dates.ts). Sổ lệnh trải nhiều năm nên phải có năm. */
const ngay = (iso: string) => `${iso.slice(2, 4)}/${iso.slice(5, 7)}/${iso.slice(8, 10)}`
```

- [ ] **Step 3: Viết lại `InvestPage` thành vỏ**

Thay toàn bộ `src/features/assets/InvestPage.tsx`:

```tsx
// Vỏ trang Đầu tư — hai tab, hai loại tài sản, một câu hỏi: "tôi đang giữ gì".
//
// Vì sao là trang riêng chứ không phải khu trên trang chi tiết tài khoản: khu đó chỉ nói
// về MỘT tài khoản, nên không màn nào trả lời được "tôi giữ tổng bao nhiêu VNM" hay "mã
// nào chiếm nhiều nhất trong danh mục". Đó là câu của người, không phải câu của tài khoản.
//
// Vì sao hai tab chứ không một con số gộp: cổ phiếu VN tính bằng đồng, quỹ Nhật bằng yên
// trên 10.000 口. Gộp lại phải quy đổi tỷ giá, mà câu hỏi gộp đã có chỗ trả lời tốt hơn ở
// tab Tài sản — nơi đã có tỷ giá, dấu ước tính và nút "xem thử bằng tiền khác".
//
// Hai tab nhập trực tiếp (không `lazy`): cả hai file đều nhỏ, và bản thân route `/invest`
// đã lazy ở App.tsx nên thêm một lớp Suspense nữa chỉ làm nhấp nháy lúc gạt tab.
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BackLink } from '../../components/BackLink'
import { SegmentedControl, type SegmentedItem } from '../../components/ui'
import { useAccounts } from '../../hooks/queries'
import { InvestFundsTab } from './InvestFundsTab'
import { InvestStocksTab } from './InvestStocksTab'

type InvestTab = 'stocks' | 'funds'

const TABS: readonly SegmentedItem<InvestTab>[] = [
  { value: 'stocks', label: 'Cổ phiếu VN' },
  { value: 'funds', label: 'Quỹ Nhật' },
]

const isTab = (v: string | null): v is InvestTab => TABS.some((t) => t.value === v)

export function InvestPage() {
  const { data: accountRows = [] } = useAccounts()
  // Giữ tab trong URL (không phải useState) để link chia sẻ, lịch sử trình duyệt và nút
  // quay lại mở đúng tab — cùng lối AssetsPage đang dùng cho ba tab của nó.
  const [params, setParams] = useSearchParams()

  const hasFundsOnly = useMemo(() => {
    const dautu = accountRows.filter((a) => a.type === 'investment' && !a.is_archived)
    return !dautu.some((a) => a.currency === 'VND') && dautu.some((a) => a.currency === 'JPY')
  }, [accountRows])

  // Không có ?tab= thì mở tab NÀO CÓ tài khoản. Mở mặc định vào một tab rỗng là bắt người
  // dùng tự đoán rằng thứ họ đang tìm nằm ở tab kia.
  const raw = params.get('tab')
  const tab: InvestTab = isTab(raw) ? raw : hasFundsOnly ? 'funds' : 'stocks'
  const accountId = params.get('account')

  const setTab = (v: InvestTab) =>
    setParams(
      (prev) => {
        prev.set('tab', v)
        // Lọc theo tài khoản chỉ có nghĩa trong tab của chính tài khoản đó — mang sang tab
        // kia là một bộ lọc không khớp gì, và tab kia sẽ lặng lẽ bỏ qua nó.
        prev.delete('account')
        return prev
      },
      { replace: true },
    )

  const setAccount = (id: string | null) =>
    setParams(
      (prev) => {
        if (id) prev.set('account', id)
        else prev.delete('account')
        return prev
      },
      { replace: true },
    )

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <div className="flex items-center gap-2">
        <BackLink to="/assets" aria-label="Quay lại" />
        <h1 className="flex-1 text-lg font-bold text-fg-primary">Đầu tư</h1>
      </div>

      <SegmentedControl items={TABS} value={tab} onChange={setTab} label="Loại danh mục" />

      {tab === 'stocks' ? (
        <InvestStocksTab accountId={accountId} onPickAccount={setAccount} />
      ) : (
        <InvestFundsTab accountId={accountId} onPickAccount={setAccount} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Tạo `InvestFundsTab` rỗng tạm để build được**

Task 5 viết nội dung thật. Tạm thời tạo `src/features/assets/InvestFundsTab.tsx`:

```tsx
interface Props {
  accountId: string | null
  onPickAccount: (id: string | null) => void
}

export function InvestFundsTab(_props: Props) {
  return null
}
```

- [ ] **Step 5: Kiểm kiểu, lint, test**

```bash
npx tsc -b && npm run lint && npm test
```

Kỳ vọng: tất cả xanh. `backLink.test.ts` phải xanh — nút quay lại vẫn là `<BackLink>` và giờ chỉ còn một chỗ (vỏ trang).

- [ ] **Step 6: Bấm tay ở chế độ demo**

```bash
npm run dev
```

Mở `http://localhost:5173/invest`, đăng nhập chế độ demo. Kỳ vọng:
- Có thanh gạt "Cổ phiếu VN | Quỹ Nhật"; tab cổ phiếu mở sẵn.
- Có hàng chip "Tất cả · Chứng khoán VN · Đầu tư VN" (demo có **hai** tài khoản VND).
- Bấm chip "Chứng khoán VN": tổng và danh sách mã co lại còn của riêng tài khoản đó, URL thành `?tab=stocks&account=…`.
- Bấm "Tất cả": URL mất `account`, số quay về tổng gộp.
- Tải lại trang khi đang lọc: vẫn đúng tài khoản đó (bộ lọc nằm trong URL).
- Gạt sang "Quỹ Nhật": trống (Task 5 chưa làm), URL mất `account`.

- [ ] **Step 7: Commit**

```bash
git add src/features/assets/InvestPage.tsx src/features/assets/InvestStocksTab.tsx src/features/assets/InvestFundsTab.tsx src/features/assets/InvestAccountChips.tsx
git commit -m "feat(dau-tu): /invest thanh vo hai tab, tach tab co phieu ra file rieng

Tab nam trong URL (?tab=) de link chia se va nut quay lai mo dung tab. Gat
tab thi xoa ?account=: loc theo tai khoan chi co nghia trong tab cua chinh
tai khoan do. Chip chon tai khoan chi hien khi tab co tu hai tai khoan.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `InvestFundsTab`

**Files:**
- Modify: `src/features/assets/InvestFundsTab.tsx` (thay bản rỗng của Task 4)

**Interfaces:**
- Consumes: `useFundInvestData(accountId)` (Task 3); `InvestAccountChips` (Task 4); `FundTradeFormSheet` (đã có).
- Produces: `InvestFundsTab({ accountId, onPickAccount })` — cùng chữ ký bản rỗng.

- [ ] **Step 1: Viết nội dung tab**

Thay toàn bộ `src/features/assets/InvestFundsTab.tsx`:

```tsx
// Tab Quỹ Nhật của trang Đầu tư — danh mục gộp MỌI tài khoản đầu tư JPY.
//
// Khác tab cổ phiếu ở ba chỗ, mỗi chỗ có lý do đã trả giá ở nơi khác trong repo:
//  · KHÔNG có dòng "Tiền chưa mua": Rakuten tự quét sạch tiền dư về 楽天銀行 (fundHoldings.ts).
//  · Đơn giá là ¥/10.000口, phải nói ra "/1万口" — không nói thì hai con số "vốn" và "nay"
//    trông như đơn giá và người đọc tự nhân với số 口 rồi thấy lệch 10.000 lần.
//  · `oversold` ở đây thường là chữ ký của việc quỹ ĐỔI TÊN mà thiếu một dòng bí danh,
//    không phải quên ghi lệnh mua (xem docs/quy-nhat.md).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Guide } from '../../components/Guide'
import { EstimateMark } from '../../components/EstimateMark'
import { ActionButton, Card, Money, SectionTitle } from '../../components/ui'
import { FundTradeFormSheet } from './FundTradeFormSheet'
import { InvestAccountChips } from './InvestAccountChips'
import { useFundInvestData } from './useFundInvestData'
import type { FundTradeRow } from '../../types/database.types'

const JPY = 'JPY' as const

const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1).replace('.', ',')}%`
const share = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`
/** ISO → yy/mm/dd theo quy ước tháng/ngày của app (lib/dates.ts); sổ lệnh trải nhiều năm nên phải có năm. */
const ngay = (iso: string) => `${iso.slice(2, 4)}/${iso.slice(5, 7)}/${iso.slice(8, 10)}`

const KIND_LABEL: Record<FundTradeRow['kind'], string> = {
  buy: 'Mua',
  sell: 'Bán',
  adjust: 'Điều chỉnh',
}
const KIND_CLASS: Record<FundTradeRow['kind'], string> = {
  buy: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  sell: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
  adjust: 'bg-surface-sunken text-fg-secondary',
}

interface Props {
  accountId: string | null
  onPickAccount: (id: string | null) => void
}

export function InvestFundsTab({ accountId, onPickAccount }: Props) {
  const {
    accounts,
    filtered,
    trades,
    portfolio: p,
    session,
    staleHeld,
    accountName,
    fundName,
    isLoading,
  } = useFundInvestData(accountId)
  const [sheet, setSheet] = useState<{ accountId: string; trade: FundTradeRow | null } | null>(
    null,
  )
  /** null = xem hết; có mã = chỉ xem lệnh của quỹ đó. */
  const [fundFilter, setFundFilter] = useState<string | null>(null)
  /** Đang hỏi ghi lệnh vào tài khoản nào (chỉ khi có nhiều hơn một). */
  const [picking, setPicking] = useState(false)

  const activeId = filtered.length === accounts.length ? null : (filtered[0]?.id ?? null)

  function startTrade() {
    if (filtered.length === 1) setSheet({ accountId: filtered[0].id, trade: null })
    else setPicking(true)
  }

  const shownTrades = useMemo(
    () => (fundFilter ? trades.filter((t) => t.assoc_fund_cd === fundFilter) : trades),
    [trades, fundFilter],
  )
  const sheetAccount = sheet ? accounts.find((a) => a.id === sheet.accountId) : undefined

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-fg-muted">Đang tải…</p>
  }

  if (accounts.length === 0) {
    return (
      <Card as="section">
        <p className="text-sm text-fg-muted">
          Chưa có tài khoản quỹ đầu tư Nhật nào. Tạo một tài khoản loại <b>Đầu tư</b> với
          loại tiền <b>JPY</b> ở{' '}
          <Link to="/settings/accounts" className="font-medium text-fg-accent">
            Cài đặt → Tài khoản
          </Link>
          , rồi ghi lệnh mua bán để app tự lấy 基準価額 mỗi ngày và tính lời/lỗ.
        </p>
      </Card>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <InvestAccountChips accounts={accounts} activeId={activeId} onPick={onPickAccount} />
        <ActionButton variant="primary" onClick={startTrade} className="ml-auto">
          <Plus className="h-4 w-4" /> Ghi lệnh
        </ActionButton>
      </div>

      {/* Tổng danh mục */}
      <Card as="section">
        <div className="flex items-baseline justify-between gap-2">
          <SectionTitle>Giá trị danh mục</SectionTitle>
          {session && <span className="text-2xs text-fg-muted">基準価額 {ngay(session)}</span>}
        </div>
        {p.marketValue === null ? (
          <p className="mt-1 text-sm text-fg-muted">
            Chưa tính được — chưa có 基準価額 cho quỹ nào đang giữ.
          </p>
        ) : (
          <p className="mt-1 flex items-baseline gap-1">
            <Money amount={p.marketValue} currency={JPY} className="text-2xl font-bold" />
            {p.missingNavs.length > 0 && (
              <EstimateMark
                reason={`${p.missingNavs.map(fundName).join(', ')} chưa có giá, đang tạm tính theo giá vốn.`}
              />
            )}
          </p>
        )}

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border-subtle pt-3 text-xs">
          <div>
            <dt className="text-fg-muted">Giá vốn</dt>
            <dd>
              <Money amount={p.fundCost} currency={JPY} className="font-semibold" />
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">Lời/lỗ chưa bán</dt>
            <dd className="flex items-baseline gap-1">
              <Money
                amount={Math.abs(p.unrealizedPnl)}
                currency={JPY}
                tone={p.unrealizedPnl >= 0 ? 'in' : 'out'}
                showSign
                className="font-semibold"
              />
              {p.unrealizedPercent !== null && (
                <span className="text-fg-muted">{pct(p.unrealizedPercent)}</span>
              )}
            </dd>
          </div>
          {p.realizedPnl !== 0 && (
            <div>
              {/* Đã bán rồi thì tiền đã về 楽天銀行 — con số này KHÔNG nằm trong giá trị
                  danh mục ở trên, nên để riêng chứ không cộng vào lời/lỗ chưa bán. */}
              <dt className="text-fg-muted">Lời/lỗ đã bán</dt>
              <dd>
                <Money
                  amount={Math.abs(p.realizedPnl)}
                  currency={JPY}
                  tone={p.realizedPnl >= 0 ? 'in' : 'out'}
                  showSign
                  className="font-semibold"
                />
              </dd>
            </div>
          )}
        </dl>

        <Guide className="mt-2 text-2xs text-fg-muted">
          Không có dòng “tiền chưa mua”: Rakuten tự quét sạch tiền dư về 楽天銀行, tài khoản
          quỹ không giữ tiền nhàn rỗi.
        </Guide>

        {p.oversold.length > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-2.5 py-2 text-2xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {p.oversold.map(fundName).join(', ')}: sổ lệnh ghi bán nhiều 口数 hơn số đang
            giữ. Thường là quỹ đã ĐỔI TÊN và nửa lịch sử đang ghép vào một mã khác — xem
            docs/quy-nhat.md.
          </p>
        )}
        {staleHeld.length > 0 && (
          <p className="mt-2 text-2xs text-fg-muted">
            {staleHeld.map(fundName).join(', ')} đang dùng 基準価額 của phiên trước.
          </p>
        )}
      </Card>

      {/* Từng quỹ */}
      <Card as="section">
        <SectionTitle>Đang giữ ({p.positions.length} quỹ)</SectionTitle>
        {p.positions.length === 0 ? (
          <p className="mt-2 text-xs text-fg-muted">
            Chưa giữ quỹ nào.
            <Guide as="span"> Ghi lệnh mua để app tự lấy 基準価額 và tính lời/lỗ.</Guide>
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-border-subtle">
            {p.positions.map((pos) => (
              <li key={pos.assocFundCd}>
                <button
                  type="button"
                  onClick={() =>
                    setFundFilter((cur) => (cur === pos.assocFundCd ? null : pos.assocFundCd))
                  }
                  aria-pressed={fundFilter === pos.assocFundCd}
                  className="w-full py-2 text-left"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-fg-primary">
                        {fundName(pos.assocFundCd)}
                        <span className="ml-1.5 text-2xs font-normal text-fg-muted">
                          {share(pos.weight)}
                        </span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Money amount={pos.value} currency={JPY} className="text-sm font-semibold" />
                      <p className="text-2xs">
                        <Money
                          amount={Math.abs(pos.pnl)}
                          currency={JPY}
                          tone={pos.pnl >= 0 ? 'in' : 'out'}
                          showSign
                          className="text-2xs"
                        />
                        {pos.pnlPercent !== null && (
                          <span className="ml-1 text-fg-muted">{pct(pos.pnlPercent)}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  {/* Thanh tỷ trọng: mắt so hai thanh nhanh hơn so hai con số phần trăm */}
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{ width: `${Math.min(pos.weight * 100, 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-1 text-2xs text-fg-secondary">
                    <span>{pos.units.toLocaleString('vi-VN')} 口</span>
                    <span>· vốn</span>
                    <Money amount={pos.avgNav} currency={JPY} className="text-2xs" />
                    {pos.nav === null ? (
                      <span>· chưa có giá</span>
                    ) : (
                      <>
                        <span>· nay</span>
                        <Money amount={pos.nav} currency={JPY} className="text-2xs" />
                      </>
                    )}
                    <span className="text-fg-muted">/1万口</span>
                    {pos.accountNames.length > 1 && (
                      <span>· {pos.accountNames.join(' + ')}</span>
                    )}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Sổ lệnh */}
      <Card as="section">
        <div className="flex items-baseline justify-between gap-2">
          <SectionTitle>
            Sổ lệnh{fundFilter ? ` · ${fundName(fundFilter)}` : ''} ({shownTrades.length})
          </SectionTitle>
          {fundFilter && (
            <button
              type="button"
              onClick={() => setFundFilter(null)}
              className="text-2xs font-medium text-fg-accent"
            >
              Xem hết
            </button>
          )}
        </div>

        {shownTrades.length === 0 ? (
          <p className="mt-2 text-xs text-fg-muted">Chưa có lệnh nào.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border-subtle">
            {shownTrades.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSheet({ accountId: t.account_id, trade: t })}
                  className="flex w-full items-baseline justify-between gap-3 py-2 text-left"
                >
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-1.5 text-sm">
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-3xs font-semibold ${KIND_CLASS[t.kind]}`}
                      >
                        {KIND_LABEL[t.kind]}
                      </span>
                      <span className="truncate font-semibold text-fg-primary">
                        {fundName(t.assoc_fund_cd)}
                      </span>
                    </p>
                    <p className="truncate text-2xs text-fg-muted">
                      {ngay(t.traded_on)}
                      {filtered.length > 1 && ` · ${accountName(t.account_id)}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-2xs text-fg-secondary">
                    <p>
                      {t.units.toLocaleString('vi-VN')} 口
                      {t.kind !== 'adjust' && (
                        <>
                          {' · '}
                          <Money amount={t.amount} currency={JPY} className="text-2xs" />
                        </>
                      )}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Chọn tài khoản trước khi ghi lệnh — chỉ hiện khi có từ hai tài khoản. */}
      {picking && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center"
          onClick={() => setPicking(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-base font-bold text-fg-primary">
              Ghi lệnh vào tài khoản nào?
            </h2>
            <ul className="flex flex-col gap-2">
              {accounts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicking(false)
                      setSheet({ accountId: a.id, trade: null })
                    }}
                    className="min-h-11 w-full rounded-lg border border-border-strong px-3 text-left text-sm font-medium text-fg-primary hover:bg-surface-sunken"
                  >
                    {a.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {sheet && sheetAccount && (
        <FundTradeFormSheet
          account={sheetAccount}
          trade={sheet.trade}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Kiểm kiểu, lint, test**

```bash
npx tsc -b && npm run lint && npm test
```

Kỳ vọng: xanh. Nếu `overlayLayers.test.ts` đỏ, so lại `z-40` của modal chọn tài khoản với bản ở `InvestStocksTab` — hai modal phải cùng lớp.

- [ ] **Step 3: Bấm tay ở chế độ demo**

`npm run dev`, mở `http://localhost:5173/invest?tab=funds`. Kỳ vọng:
- Tổng danh mục hiện giá trị theo yên, kèm ngày phiên `基準価額 26/08/10`.
- Hai quỹ trong danh sách, mỗi dòng có `口`, `vốn`, `nay`, `/1万口` và thanh tỷ trọng.
- **Không** có dòng "Tiền chưa mua"; có câu `<Guide>` giải thích vì sao.
- Không có hàng chip (demo chỉ một tài khoản JPY).
- Bấm một quỹ: sổ lệnh dưới lọc còn quỹ đó, tiêu đề thành `Sổ lệnh · <tên quỹ>`.
- Bấm một dòng lệnh: mở `FundTradeFormSheet` đúng lệnh đó.

- [ ] **Step 4: Commit**

```bash
git add src/features/assets/InvestFundsTab.tsx
git commit -m "feat(quy-nhat): tab Quy Nhat cho trang Dau tu

Khac tab co phieu ba cho, moi cho co ly do: khong co dong tien chua mua
(Rakuten quet sach tien du), don gia phai noi ro /1万口 (khong noi thi nguoi
doc tu nhan voi so 口 roi thay lech 10.000 lan), va oversold o day thuong la
chu ky cua viec quy doi ten thieu mot dong bi danh.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `useAccountPortfolio` — trang tài khoản không có phép tính riêng

**Files:**
- Create: `src/features/assets/useAccountPortfolio.ts`
- Create: `src/features/assets/useAccountPortfolio.test.ts`

**Interfaces:**
- Consumes: `buildPortfolio` (`./portfolio`), `buildFundPortfolio` (Task 2), `sessionPrices`/`sessionNavs`.
- Produces:
  - `portfolioKindOf(account, soLenh): 'stocks' | 'funds' | null`
  - `useAccountPortfolio(account: AccountRow | undefined): AccountPortfolioSummary | null`
  - `interface AccountPortfolioSummary { kind: 'stocks' | 'funds'; marketValue: number | null; cost: number; unrealizedPnl: number; unrealizedPercent: number | null; count: number; session: string | null }`

- [ ] **Step 1: Viết test thất bại cho phần thuần**

Tạo `src/features/assets/useAccountPortfolio.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { portfolioKindOf } from './useAccountPortfolio'

const tk = (
  type: string,
  currency: string,
  is_archived = false,
): Parameters<typeof portfolioKindOf>[0] =>
  ({ type, currency, is_archived }) as Parameters<typeof portfolioKindOf>[0]

describe('portfolioKindOf', () => {
  it('đầu tư VND có sổ lệnh → engine cổ phiếu', () => {
    expect(portfolioKindOf(tk('investment', 'VND'), 3)).toBe('stocks')
  })

  it('đầu tư JPY có sổ lệnh → engine quỹ', () => {
    expect(portfolioKindOf(tk('investment', 'JPY'), 3)).toBe('funds')
  })

  it('đầu tư loại tiền khác → null, vì không có bảng giá nào cho nó', () => {
    expect(portfolioKindOf(tk('investment', 'USD'), 3)).toBeNull()
  })

  it('chưa có lệnh nào → null, để trang rơi về định giá nhập tay', () => {
    expect(portfolioKindOf(tk('investment', 'VND'), 0)).toBeNull()
  })

  it('không phải tài khoản đầu tư → null', () => {
    expect(portfolioKindOf(tk('bank', 'JPY'), 3)).toBeNull()
    expect(portfolioKindOf(tk('fixed', 'JPY'), 3)).toBeNull()
  })

  it('đã lưu trữ → null: hai tab của trang Đầu tư không nhận tài khoản lưu trữ, nên link "Xem" sẽ dẫn tới một bộ lọc bị bỏ qua', () => {
    expect(portfolioKindOf(tk('investment', 'VND', true), 3)).toBeNull()
  })

  it('không có tài khoản (đang tải) → null', () => {
    expect(portfolioKindOf(undefined, 3)).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy test để chắc nó đỏ**

```bash
npx vitest run src/features/assets/useAccountPortfolio.test.ts
```

Kỳ vọng: FAIL — `Failed to resolve import "./useAccountPortfolio"`.

- [ ] **Step 3: Viết hook**

Tạo `src/features/assets/useAccountPortfolio.ts`:

```ts
// Số tóm tắt danh mục cho TRANG CHI TIẾT một tài khoản.
//
// Điểm chính của cả đợt này: ở đây KHÔNG có phép tính nào. Nó gọi đúng hàm mà trang Đầu tư
// gọi, chỉ với mảng một phần tử — nên "trang tài khoản lệch trang Đầu tư" trở thành chuyện
// không biểu diễn được, thay vì chuyện phải nhớ đồng bộ. Trước đợt này hai màn vẽ cùng bộ
// số bằng hai đoạn JSX riêng, với bốn cái nhãn khác nhau.
import { useMemo } from 'react'
import {
  useAccountBalances,
  useFundPrices,
  useFundTrades,
  useStockPrices,
  useStockTrades,
} from '../../hooks/queries'
import type { AccountRow } from '../../types/database.types'
import { sessionNavs, type FundTrade } from './fundHoldings'
import { buildFundPortfolio } from './fundPortfolio'
import { sessionPrices, type Trade } from './holdings'
import { buildPortfolio } from './portfolio'

export type PortfolioKind = 'stocks' | 'funds'

export interface AccountPortfolioSummary {
  kind: PortfolioKind
  /** null = không đáng tin (tiền chưa mua âm, hoặc thiếu giá mọi mã/quỹ). */
  marketValue: number | null
  /** Giá vốn của số đang giữ — mốc chia phần trăm. Quyết định 1 của spec. */
  cost: number
  unrealizedPnl: number
  unrealizedPercent: number | null
  /** Số mã / số quỹ đang giữ. */
  count: number
  session: string | null
}

/**
 * Engine nào cho tài khoản này, hay không engine nào.
 *
 * Thuần, tách riêng để test được không cần React. `null` nghĩa là trang chi tiết rơi về
 * đường cũ: định giá nhập tay + nút "Cập nhật giá trị" + khu "Lịch sử giá trị". Đó là
 * đường duy nhất còn lại cho tài khoản đầu tư mà app không có bảng giá nào cho nó.
 *
 * Lưu trữ cũng trả `null`: hai tab của trang Đầu tư đều lọc `!is_archived`, nên nếu ở đây
 * vẫn hiện tóm tắt thì link "Xem danh mục" sẽ dẫn tới một tab lặng lẽ bỏ qua bộ lọc và
 * hiện danh mục của tài khoản KHÁC.
 */
export function portfolioKindOf(
  account: Pick<AccountRow, 'type' | 'currency' | 'is_archived'> | undefined,
  soLenh: number,
): PortfolioKind | null {
  if (!account || account.type !== 'investment' || account.is_archived) return null
  if (soLenh === 0) return null
  if (account.currency === 'VND') return 'stocks'
  if (account.currency === 'JPY') return 'funds'
  return null
}

export function useAccountPortfolio(
  account: AccountRow | undefined,
): AccountPortfolioSummary | null {
  const { data: balances = [] } = useAccountBalances()
  const { data: stockTrades = [] } = useStockTrades()
  const { data: prices = [] } = useStockPrices()
  const { data: fundTrades = [] } = useFundTrades()
  const { data: navRows = [] } = useFundPrices()

  const soLenhCoPhieu = useMemo(
    () => (account ? stockTrades.filter((t) => t.account_id === account.id) : []),
    [stockTrades, account],
  )
  const soLenhQuy = useMemo(
    () => (account ? fundTrades.filter((t) => t.account_id === account.id) : []),
    [fundTrades, account],
  )

  const kind = portfolioKindOf(
    account,
    account?.currency === 'JPY' ? soLenhQuy.length : soLenhCoPhieu.length,
  )

  const stocks = useMemo(() => {
    if (kind !== 'stocks' || !account) return null
    const { session, priceBySymbol } = sessionPrices(prices)
    // Số dư sổ là tham số brokerCash cần để ra "tiền chưa mua" — hook tự đọc, không bắt
    // trang gọi truyền vào như HoldingsSection cũ.
    const balance = balances.find((b) => b.id === account.id)?.balance ?? 0
    const trades: Trade[] = soLenhCoPhieu.map((t) => ({
      symbol: t.symbol,
      kind: t.kind,
      tradedOn: t.traded_on,
      quantity: t.quantity,
      price: t.price,
      fee: t.fee,
      tax: t.tax,
    }))
    const p = buildPortfolio(
      [{ accountId: account.id, accountName: account.name, balance, trades }],
      priceBySymbol,
    )
    return {
      kind: 'stocks' as const,
      marketValue: p.marketValue,
      cost: p.stockCost,
      unrealizedPnl: p.unrealizedPnl,
      unrealizedPercent: p.unrealizedPercent,
      count: p.positions.length,
      session,
    }
  }, [kind, account, prices, balances, soLenhCoPhieu])

  const funds = useMemo(() => {
    if (kind !== 'funds' || !account) return null
    const trades: FundTrade[] = soLenhQuy.map((t) => ({
      assocFundCd: t.assoc_fund_cd,
      kind: t.kind,
      tradedOn: t.traded_on,
      units: t.units,
      nav: t.nav,
      amount: t.amount,
    }))
    const { session, navByFund } = sessionNavs(
      navRows,
      trades.map((t) => t.assocFundCd),
    )
    const p = buildFundPortfolio(
      [{ accountId: account.id, accountName: account.name, trades }],
      navByFund,
    )
    return {
      kind: 'funds' as const,
      marketValue: p.marketValue,
      cost: p.fundCost,
      unrealizedPnl: p.unrealizedPnl,
      unrealizedPercent: p.unrealizedPercent,
      count: p.positions.length,
      session,
    }
  }, [kind, account, navRows, soLenhQuy])

  return stocks ?? funds
}
```

- [ ] **Step 4: Chạy test để chắc nó xanh**

```bash
npx vitest run src/features/assets/useAccountPortfolio.test.ts && npx tsc -b && npm run lint
```

Kỳ vọng: PASS, không lỗi kiểu, không lỗi lint.

- [ ] **Step 5: Chốt bất biến "một tài khoản" bằng test**

Cái làm quyết định 2 đúng là `buildPortfolio` với **một** phần tử phải cho ra đúng bộ số mà trang chi tiết cần. Thêm vào cuối `describe('buildPortfolio', …)` trong `src/features/assets/portfolio.test.ts`:

```ts
  it('một tài khoản → bộ số của đúng trang chi tiết tài khoản đó', () => {
    // Mua 100 FPT giá 60.000 (phí 0) từ số dư 10.000.000; giá phiên 70.000.
    //   giá vốn = 6.000.000 · tiền chưa mua = 4.000.000
    //   cổ phiếu theo giá nay = 7.000.000 ⇒ tổng = 11.000.000
    //   lời chưa bán = 1.000.000 = +16,7% trên GIÁ VỐN (không phải trên số dư sổ)
    const p = buildPortfolio([acc('a', 10_000_000, [buy('FPT', 100, 60_000)])], new Map([['FPT', 70_000]]))
    expect(p.stockCost).toBe(6_000_000)
    expect(p.cash).toBe(4_000_000)
    expect(p.marketValue).toBe(11_000_000)
    expect(p.unrealizedPnl).toBe(1_000_000)
    expect(p.unrealizedPercent).toBeCloseTo(1 / 6, 10)
    expect(p.positions).toHaveLength(1)
    // Một tài khoản thì tỷ trọng của mã duy nhất phải là 100%, không phải 0.
    expect(p.positions[0].weight).toBe(1)
  })
```

Chạy:

```bash
npx vitest run src/features/assets/portfolio.test.ts
```

Kỳ vọng: PASS ngay, không sửa `portfolio.ts` — bất biến này đã đúng từ trước, test chỉ đóng đinh nó lại để lần sau không ai làm hỏng mà không biết.

- [ ] **Step 6: Commit**

```bash
git add src/features/assets/useAccountPortfolio.ts src/features/assets/useAccountPortfolio.test.ts src/features/assets/portfolio.test.ts
git commit -m "feat(dau-tu): useAccountPortfolio goi dung engine cua trang Dau tu

Khong co phep tinh nao o day: goi buildPortfolio/buildFundPortfolio voi mang
mot phan tu, nen "trang tai khoan lech trang Dau tu" thanh chuyen khong bieu
dien duoc. Tai khoan luu tru tra null vi hai tab deu loc !is_archived, de
link "Xem danh muc" khong dan toi mot bo loc bi bo qua.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Dọn `AccountDetailPage`

**Files:**
- Modify: `src/features/assets/AccountDetailPage.tsx` (dòng 39–53 import · 69–70 state · 133–139 lọc valuations · 277–327 khối đầu tư · 480–499 hai khu danh mục · 502 điều kiện lịch sử · 667–680 hai sheet)

**Interfaces:**
- Consumes: `useAccountPortfolio` (Task 6).
- Produces: không gì cho task sau.

- [ ] **Step 1: Bỏ hai khu danh mục và hai sheet ghi lệnh**

Xoá khối `{isInvestment && account && account.currency === 'VND' && (<HoldingsSection … />)}` (dòng 480–489) và khối `FundHoldingsSection` (491–499). Xoá hai khối sheet ở cuối (`{tradeSheet && account && …}` và `{fundSheet && account && …}`). Xoá hai state `tradeSheet`, `fundSheet` (dòng 69–70). Xoá bốn import: `HoldingsSection`, `FundHoldingsSection`, `TradeFormSheet`, `FundTradeFormSheet`, và hai type `FundTradeRow`, `StockTradeRow` khỏi dòng import type.

- [ ] **Step 2: Thay khối đầu tư bằng ba dòng**

Thêm import:

```tsx
import { Link } from 'react-router-dom'
import { useAccountPortfolio } from './useAccountPortfolio'
```

`useParams` đã import từ `react-router-dom` — gộp `Link` vào cùng dòng đó thay vì thêm dòng mới.

Thêm ngay sau `const invStats = …`:

```tsx
  // Danh mục tính TẠI MÁY từ sổ lệnh + bảng giá, bằng đúng engine của trang Đầu tư.
  // `null` = tài khoản không có sổ lệnh (hoặc đã lưu trữ) → rơi về đường định giá nhập tay.
  const danhMuc = useAccountPortfolio(account)
```

Thay toàn bộ khối `{isInvestment && ( … )}` (dòng 277–327) bằng:

```tsx
        {isInvestment && danhMuc && (
          <div className="mt-3 space-y-1.5 border-t border-border-subtle pt-3 text-sm">
            <div className="flex items-center justify-between font-medium">
              <span
                className={danhMuc.unrealizedPnl >= 0 ? 'text-money-in' : 'text-money-out'}
              >
                Lời/lỗ chưa bán
              </span>
              <span>
                <Money
                  amount={Math.abs(danhMuc.unrealizedPnl)}
                  currency={currency}
                  tone={danhMuc.unrealizedPnl >= 0 ? 'in' : 'out'}
                  showSign
                />
                {danhMuc.unrealizedPercent != null && (
                  <span
                    className={`ml-1 text-xs tabular-nums ${danhMuc.unrealizedPnl >= 0 ? 'text-money-in' : 'text-money-out'}`}
                  >
                    ({pct(danhMuc.unrealizedPercent)})
                  </span>
                )}
              </span>
            </div>
            {/* Không in "Vốn gốc (đã bỏ vào)" ở đây nữa: đó là mốc theo SỐ DƯ SỔ, tức mốc
                mà quyết định 1 đã loại. Câu "tiền tôi bỏ vào sinh lợi bao nhiêu" nằm ở ô
                Hiệu quả đầu tư tab Diễn biến, nơi XIRR trả lời có tính cả thời điểm. */}
            <Link
              to={`/invest?tab=${danhMuc.kind}&account=${accountId}`}
              className="flex items-center justify-between gap-2 pt-1 text-fg-accent"
            >
              <span className="text-xs font-medium">
                Danh mục · {danhMuc.count} {danhMuc.kind === 'funds' ? 'quỹ' : 'mã'} · sổ lệnh
              </span>
              <span className="text-xs font-medium">Xem →</span>
            </Link>
          </div>
        )}

        {/* Tài khoản đầu tư KHÔNG có sổ lệnh (loại tiền app chưa có bảng giá, hoặc chưa ghi
            lệnh nào): giữ nguyên đường định giá nhập tay — không còn cách nào khác để biết
            giá trị. */}
        {isInvestment && !danhMuc && (
          <div className="mt-3 space-y-1.5 border-t border-border-subtle pt-3 text-sm">
            <div className="flex items-center justify-between text-fg-muted">
              <span>Vốn gốc (đã bỏ vào)</span>
              <Money
                amount={invStats.costBasis}
                currency={currency}
                className="font-medium text-fg-primary"
              />
            </div>
            {invStats.unrealizedPnl == null ? (
              <p className="text-xs text-fg-muted">
                Chưa cập nhật giá thị trường — đang tính theo vốn gốc.
              </p>
            ) : (
              <div className="flex items-center justify-between font-medium">
                <span
                  className={invStats.unrealizedPnl >= 0 ? 'text-money-in' : 'text-money-out'}
                >
                  Lãi/lỗ so với vốn gốc
                </span>
                <span>
                  <Money
                    amount={Math.abs(invStats.unrealizedPnl)}
                    currency={currency}
                    tone={invStats.unrealizedPnl >= 0 ? 'in' : 'out'}
                    showSign
                  />
                  {invStats.pnlPercent != null && (
                    <span
                      className={`ml-1 text-xs tabular-nums ${invStats.unrealizedPnl >= 0 ? 'text-money-in' : 'text-money-out'}`}
                    >
                      ({pct(invStats.pnlPercent)})
                    </span>
                  )}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowValuation(true)}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
            >
              <LineChart className="h-3.5 w-3.5" /> Cập nhật giá trị
            </button>
          </div>
        )}
```

Thêm helper `pct` ngay dưới các import (dùng chung cho hai khối trên, thay bốn chỗ nội suy `%` viết tay trước đây):

```tsx
/** Phần trăm có dấu, dấu ASCII cho khớp <Money> — trang này từng trộn '−' (U+2212) viết tay với '-' của formatMoney nên bề rộng chữ số lệch dù đã tabular-nums. */
const pct = (v: number) => `${v >= 0 ? '+' : '-'}${Math.abs(v * 100).toFixed(1)}%`
```

- [ ] **Step 3: Đổi nguồn con số lớn "Giá trị hiện tại"**

Trong khối `<p className="mt-1 text-2xl font-bold">`, thay nhánh `isInvestment` của `amount`:

```tsx
                isInvestment
                  ? (danhMuc?.marketValue ?? invStats.marketValue ?? balance)
                  : isFixed
```

Và thêm ngày phiên ngay dưới nhãn "Giá trị hiện tại" — sửa `<p className="text-sm font-medium text-fg-muted">…</p>` thành:

```tsx
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-fg-muted">
            {account?.type === 'card'
              ? 'Đang nợ thẻ'
              : isInvestment || isFixed
                ? 'Giá trị hiện tại'
                : 'Số dư hiện tại'}
          </p>
          {danhMuc?.session && (
            <span className="text-2xs text-fg-muted">giá phiên {dayMonthLabel(danhMuc.session)}</span>
          )}
        </div>
```

`dayMonthLabel` đã được import từ `../../lib/dates` ở đầu file — không thêm import mới.

- [ ] **Step 4: Khu "Lịch sử giá trị" chỉ liệt kê hàng gõ tay**

Sửa `accountValuations` (dòng 133–139):

```tsx
  // CHỈ hàng người dùng gõ tay. Từ migration 0035, cron ghi vào cùng bảng này mỗi ngày
  // với source='auto' và không có chỗ nào dọn — liệt kê cả chúng thì khu này là một danh
  // sách dài ra mỗi ngày, kèm nút xoá từng dòng, mà không ai chủ ý tạo ra. Hàng 'auto' vẫn
  // ở lại trong DB: tab Diễn biến dùng chính chúng để vẽ lịch sử tài sản ròng.
  const accountValuations = useMemo(
    () =>
      valuations
        .filter((v) => v.account_id === accountId && v.source === 'manual')
        .sort((a, b) => b.valued_on.localeCompare(a.valued_on)),
    [valuations, accountId],
  )
```

- [ ] **Step 5: Kiểm kiểu, lint, test**

```bash
npx tsc -b && npm run lint && npm test
```

Kỳ vọng: xanh. `tsc` sẽ báo nếu còn sót một import không dùng — đó là chốt tốt, xoá cho hết.

- [ ] **Step 6: Bấm tay ở chế độ demo**

`npm run dev`, vào tab Tài sản → bấm tài khoản "Chứng khoán VN". Kỳ vọng:
- "Giá trị hiện tại" bằng đúng con số "Giá trị danh mục" ở `/invest?tab=stocks&account=…` (bằng nhau là bằng chứng cả hai đi qua cùng một engine).
- Có "giá phiên …" cạnh nhãn, "Lời/lỗ chưa bán" kèm %, và dòng "Danh mục · N mã · sổ lệnh · Xem →".
- **Không** còn khu "Danh mục", **không** còn nút "Cập nhật giá trị", **không** còn khu "Lịch sử giá trị".
- Bấm "Xem →" mở `/invest?tab=stocks&account=<id>` đã lọc sẵn.
- Làm lại với tài khoản "NISA Rakuten": dòng đọc "Danh mục · 2 quỹ · sổ lệnh", link sang `?tab=funds`.
- Mở một tài khoản ngân hàng: không có gì trong khối này đổi.

- [ ] **Step 7: Commit**

```bash
git add src/features/assets/AccountDetailPage.tsx
git commit -m "refactor(dau-tu): trang tai khoan bo khu danh muc, doc so tu engine chung

Khoi dau tu con ba dong: gia tri hien tai (tinh tai may tu so lenh + bang
gia), loi/lo chua ban + %, va link sang tab tuong ung da loc san tai khoan.
Bo dong "Von goc (da bo vao)": do la moc theo so du so ma quyet dinh 1 loai,
va cau ve dong tien da co XIRR o tab Dien bien tra loi day du hon.

Khu "Lich su gia tri" chi liet ke hang source='manual'. Cron ghi hang 'auto'
moi ngay va khong ai don, nen liet ke ca chung thi khu do la danh sach dai
ra moi ngay kem nut xoa tung dong.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Xoá hai component, sửa lối vào và nhãn

**Files:**
- Delete: `src/features/assets/HoldingsSection.tsx`, `src/features/assets/FundHoldingsSection.tsx`
- Modify: `src/features/assets/AssetsPage.tsx:41-50,79-83`
- Modify: `src/features/assets/InvestmentPerformanceSection.tsx:133-138`
- Modify: `src/App.tsx:125`

- [ ] **Step 1: Xoá hai component**

```bash
git rm src/features/assets/HoldingsSection.tsx src/features/assets/FundHoldingsSection.tsx
```

- [ ] **Step 2: Mở lối vào cho tài khoản JPY**

Trong `src/features/assets/AssetsPage.tsx`, thay khối `hasStockAccount` (dòng 41–50):

```tsx
  // Lối vào trang Đầu tư. Điều kiện phải TRÙNG KHÍT hợp của hai tab (useInvestData cho
  // VND, useFundInvestData cho JPY) — icon dẫn tới một trang nói "chưa có tài khoản nào"
  // thì tệ hơn là không có icon. useAccounts đã nằm trong cache của tab Hiện tại nên đây
  // không thêm lượt gọi mạng nào.
  const { data: accounts = [] } = useAccounts()
  const hasPortfolio = useMemo(
    () =>
      accounts.some(
        (a) =>
          a.type === 'investment' &&
          (a.currency === 'VND' || a.currency === 'JPY') &&
          !a.is_archived,
      ),
    [accounts],
  )
```

Rồi ở JSX (dòng 79–83) đổi cả điều kiện lẫn `aria-label` — nhãn cũ nói "cổ phiếu" nhưng icon giờ dẫn tới cả hai tab, và đây là chuỗi người dùng trình đọc màn hình **nghe** thấy:

```tsx
        {hasPortfolio && (
          <Link to="/invest" className={iconButtonClass()} aria-label="Danh mục đầu tư">
            <LineChart className="h-5 w-5" />
          </Link>
        )}
```

Chú thích ngay trên đó (dòng 75–78) đang nói "Danh mục cổ phiếu là trang riêng… nó gộp MỌI tài khoản chứng khoán" — sửa thành "Danh mục đầu tư là trang riêng, không phải tab con: nó gộp MỌI tài khoản đầu tư (cổ phiếu VN và quỹ Nhật, mỗi loại một tab)".

- [ ] **Step 3: Sửa nhãn link ở ô Hiệu quả đầu tư**

Trong `src/features/assets/InvestmentPerformanceSection.tsx`, sửa chú thích và nhãn (dòng 133–138):

```tsx
        {/* Khu này nói về TIỀN (bỏ vào bao nhiêu, sinh ra bao nhiêu, %/năm). Câu
            "đang giữ mã nào / quỹ nào" nằm ở trang Đầu tư. */}
        <Link to="/invest" className="shrink-0 text-2xs font-medium text-fg-accent">
          Danh mục đầu tư
        </Link>
```

- [ ] **Step 4: Sửa khung xương lúc tải**

Trong `src/App.tsx` dòng 125, bỏ tham số `'list'` để dùng mặc định `'cards'` — trang là ba khối `Card` cộng thanh tab, không phải danh sách:

```tsx
          <Route path="/invest" element={lazyRoute(<InvestPage />)} />
```

- [ ] **Step 5: Kiểm kiểu, lint, test**

```bash
npx tsc -b && npm run lint && npm test
```

Kỳ vọng: xanh hết. `tsc` là chốt chính ở bước này — nó bắt mọi import còn trỏ vào hai file đã xoá.

- [ ] **Step 6: Bấm tay ở chế độ demo**

`npm run dev`, vào tab Tài sản. Kỳ vọng: icon biểu đồ ở header vẫn có, bấm vào mở `/invest`. Vào tab Diễn biến: link trong ô Hiệu quả đầu tư đọc "Danh mục đầu tư". Tải lại `/invest` và xem khung xương lúc chờ có dáng thẻ chứ không phải dáng danh sách.

- [ ] **Step 7: Commit**

```bash
git add -A src/features/assets src/App.tsx
git commit -m "refactor(dau-tu): xoa hai khu danh muc, mo loi vao cho JPY

HoldingsSection va FundHoldingsSection khong con noi goi: moi thu chung ve
la /invest. Loi vao o header tab Tai san mo cho ca VND va JPY, va aria-label
doi tu "Danh muc co phieu" thanh "Danh muc dau tu" - do la chuoi nguoi dung
trinh doc man hinh nghe thay, sai o do khong ai nhin ra bang mat.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Quyết định 7 — nhãn "chưa thực hiện" ở tab Hiện tại

**Files:**
- Modify: `src/features/assets/aggregate.ts:41-52,200-222,246-256,290-300`
- Modify: `src/features/assets/AssetsNowView.tsx:268-272,320-330`
- Modify: `src/features/assets/aggregate.test.ts` (8 chỗ dùng tên cũ)

**Interfaces:**
- Produces: `AssetAccount.totalPnlBase` (thay `unrealizedPnlBase`), `AssetBreakdown.totalPnl` (thay `unrealizedPnl`).

- [ ] **Step 1: Sửa test trước — đổi tên, giữ nguyên mọi con số**

Trong `src/features/assets/aggregate.test.ts`, đổi mọi `unrealizedPnlBase` → `totalPnlBase` và `unrealizedPnl` → `totalPnl`. **Không đổi một con số kỳ vọng nào.** Đây là refactor đổi tên; test xanh với đúng số cũ là bằng chứng.

- [ ] **Step 2: Chạy test để chắc nó đỏ**

```bash
npx vitest run src/features/assets/aggregate.test.ts
```

Kỳ vọng: FAIL — `totalPnl` là `undefined` (chưa có ở `aggregate.ts`).

- [ ] **Step 3: Đổi tên trong `aggregate.ts`**

Đổi tên field trong `interface AssetAccount` (dòng 48–50) kèm chú thích mới:

```ts
  /**
   * Đầu tư: TỔNG lời/lỗ quy đổi base = base(marketValue) − base(balance).
   *
   * Tên cũ là `unrealizedPnlBase` và sai: tiền bán đã về tài khoản nên nằm trong
   * `marketValue`, tức hiệu này bằng `unrealizedPnl + realizedPnl`. Chứng minh bằng
   * `brokerCash`/`portfolioValue` của holdings.ts — xem quyết định 7 của spec
   * docs/superpowers/specs/2026-08-13-gop-trang-dau-tu-design.md.
   *
   * KHÔNG đổi tên `unrealizedPnl` ở portfolio.ts hay investment.ts: hai chỗ đó tính
   * `stockValue − stockCost`, đúng nghĩa chưa thực hiện.
   */
  totalPnlBase: number | null
```

Trong `interface AssetBreakdown` đổi `unrealizedPnl: number` → `totalPnl: number`, và sửa chú thích dòng 120 thành `/** có tài khoản đầu tư (được tính) có snapshot nhưng thiếu tỷ giá → totalPnl có thể thiếu */`.

Đổi biến cục bộ `let unrealizedPnl = 0` → `let totalPnl = 0` (dòng 150), khối tính (dòng 204–207):

```ts
    let totalPnlBase: number | null = null
    if (isInvestment && marketValue != null) {
      const baseCost = convertToBase(b.balance, b.currency, base, rates)
      totalPnlBase = baseValue != null && baseCost != null ? baseValue - baseCost : null
    }
```

vòng cộng dồn (dòng 248–253):

```ts
      // Lời/lỗ đầu tư: chỉ cộng tài khoản đầu tư đã có snapshot; thiếu tỷ giá → cảnh báo
      for (const a of countedAccounts) {
        if (a.depreciatedBase != null) depreciationTotal += a.depreciatedBase
        if (a.type !== 'investment' || a.marketValue == null) continue
        if (a.totalPnlBase == null) pnlHasMissingRate = true
        else totalPnl += a.totalPnlBase
      }
```

và hai chỗ trong khối `return` (`totalPnlBase,` ở object tài khoản, `totalPnl,` ở object breakdown).

- [ ] **Step 4: Sửa nhãn ở `AssetsNowView`**

Đổi `const pnl = breakdown.unrealizedPnl` → `const pnl = breakdown.totalPnl` (dòng 270), và sửa nhãn ở dòng 324:

```tsx
              Lãi/lỗ đầu tư (gồm đã bán):{' '}
```

Cách gọi này không phải từ vựng mới: `InvestmentPerformanceSection` tính đúng cùng một hiệu và gọi là "Thị trường cho thêm" — nó chưa bao giờ khai là "chưa thực hiện".

- [ ] **Step 5: Chạy test để chắc nó xanh với đúng số cũ**

```bash
npx vitest run src/features/assets/aggregate.test.ts && npx tsc -b && npm run lint
```

Kỳ vọng: PASS. Nếu một con số kỳ vọng phải sửa thì **dừng lại** — nghĩa là đã đổi hành vi, không phải đổi tên.

- [ ] **Step 6: Commit**

```bash
git add src/features/assets/aggregate.ts src/features/assets/aggregate.test.ts src/features/assets/AssetsNowView.tsx
git commit -m "fix(tai-san): nhan "chua thuc hien" o tab Hien tai la sai

marketValue - balance khong phai lai chua thuc hien: tien ban da ve
brokerCash nen nam trong marketValue, tuc hieu do bang unrealizedPnl +
realizedPnl. Sua nhan thanh "gom da ban" va doi ten field; KHONG doi so, va
aggregate.test.ts xanh voi dung con so cu la bang chung.

Doi ten khoanh vung: portfolio.ts va investment.ts tinh stockValue -
stockCost, dung nghia chua thuc hien, khong cham.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: `demoRepo` dựng snapshot `auto` cho tài khoản đầu tư JPY

**Files:**
- Modify: `src/data/demoRepo.ts:700-790`
- Modify: `src/data/demoRepo.test.ts`

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `src/data/demoRepo.test.ts`, ngay sau khối `describe` có sẵn cho bản cổ phiếu (`getAccountBalances — tự tính market_value cho tài khoản tự động theo dõi cổ phiếu (demo)`), theo đúng khuôn đó: một helper tìm tài khoản theo tên, và số đối chiếu **tính tay** trong chú thích.

```ts
async function taiKhoanNisa() {
  const accounts = await demoRepo.getAccounts()
  const acc = accounts.find((a) => a.name === 'NISA Rakuten')
  if (!acc) throw new Error('Seed thiếu tài khoản "NISA Rakuten" — test sổ lệnh quỹ cần đúng tài khoản này')
  return acc
}

// Số đối chiếu tay cho seed 'NISA Rakuten' (số dư sổ 0 — vốn gốc đến từ fund_trades,
// KHÔNG phải số dư sổ, nên market_value không được suy từ balance):
//   S&P500 (9I31223A): mua 28.429 口, amount 50.000 ¥
//     giá phiên 2026-08-10 = 20.053 ¥/1万口
//     giá trị = round(28.429 × 20.053 ÷ 10.000) = round(57.008,6737) = 57.009 ¥
//   NASDAQ-100 (9I314241): mua 12.595 口, amount 20.000 ¥
//     giá phiên 2026-08-10 = 18.855 ¥/1万口
//     giá trị = round(12.595 × 18.855 ÷ 10.000) = round(23.747,8725) = 23.748 ¥
//   market_value = 57.009 + 23.748 = 80.757 ¥   (khớp chú thích của seed fundTrades)
//   giá vốn = 50.000 + 20.000 = 70.000 ¥ ⇒ lời chưa bán +10.757 ¥
//
// Cả hai quỹ cùng nav_date 2026-08-10 nên không quỹ nào "giá lệch phiên cũ", và không quỹ
// nào thiếu giá — tức cron thật cũng sẽ ghi, nên demo phải ghi.
describe('getAccountBalances — tự tính market_value cho tài khoản quỹ Nhật (demo)', () => {
  const MARKET_VALUE_NISA = 80_757

  it('tài khoản NISA seed có market_value = số tính tay từ sổ lệnh quỹ + 基準価額, không phải null', async () => {
    const acc = await taiKhoanNisa()
    const balances = await demoRepo.getAccountBalances()
    const row = balances.find((b) => b.id === acc.id)
    // Trước đợt này là `null`: demo chỉ mô phỏng stock-refresh, nên NISA đứng ở số dư sổ
    // (0) trong Tổng tài sản trong khi khu danh mục quỹ hiện đủ 80.757 ¥.
    expect(row?.market_value).toBe(MARKET_VALUE_NISA)
  })

  it('thiếu 基準価額 của MỘT quỹ đang giữ thì bỏ qua cả tài khoản, không ghi số lệch', async () => {
    // Chốt này KHÔNG có ở bản cổ phiếu (bên đó chỉ bỏ khi thiếu giá MỌI mã). Giữ hai quỹ
    // mà mất giá một quỹ là lệch cỡ 40%, lại đóng dấu 'auto' trông như đúng.
    const acc = await taiKhoanNisa()
    await demoRepo.createFundTrade({
      account_id: acc.id,
      assoc_fund_cd: '0331418A', // quỹ KHÔNG có trong bảng giá seed
      kind: 'buy',
      traded_on: '2026-05-01',
      units: 10_000,
      nav: 21_000,
      amount: 21_000,
      bucket: 'NISA成長投資枠',
      note: '',
    })
    const balances = await demoRepo.getAccountBalances()
    const row = balances.find((b) => b.id === acc.id)
    expect(row?.market_value).toBeNull()
  })
})
```

(`demoRepo.createFundTrade(input: NewFundTrade)` và tên các field trên đã đối chiếu với `src/data/repo.ts:360`.)

- [ ] **Step 2: Chạy test để chắc nó đỏ**

```bash
npx vitest run src/data/demoRepo.test.ts
```

Kỳ vọng: FAIL — `market_value` là `null`.

- [ ] **Step 3: Viết hàm dựng snapshot cho quỹ**

Trong `src/data/demoRepo.ts`, thêm import:

```ts
import {
  fundHoldingsFromTrades,
  fundValue,
  sessionNavs,
  type FundTrade,
} from '../features/assets/fundHoldings'
```

Thêm hàm này ngay sau `tuTinhAutoValuation`, trong cùng phạm vi `getAccountBalances`:

```ts
    /**
     * Snapshot 'auto' mà cron fund-refresh sẽ ghi cho tài khoản quỹ này NẾU nó chạy ngay
     * bây giờ. Cùng lý do và cùng cách làm như `tuTinhAutoValuation` ở trên (gọi ĐÚNG các
     * hàm thuần của fundHoldings.ts, không chép lại phép tính), nhưng theo từng bước của
     * supabase/functions/fund-refresh/index.ts — bản quỹ có SÁU chốt bỏ qua, một chốt
     * không có ở bản cổ phiếu.
     */
    function tuTinhAutoValuationQuy(
      a: AccountRow,
    ): { valued_on: string; market_value: number; source: 'auto' } | null {
      if (a.type !== 'investment' || a.currency !== 'JPY' || a.is_archived) return null

      const trades: FundTrade[] = (db.fundTrades ?? [])
        .filter((t) => t.account_id === a.id)
        .map((t) => ({
          assocFundCd: t.assoc_fund_cd,
          kind: t.kind,
          tradedOn: t.traded_on,
          units: t.units,
          nav: t.nav,
          amount: t.amount,
        }))
      if (trades.length === 0) return null

      // ① Trộn hai hệ đơn vị (口数 của quỹ và số cổ của cổ phiếu) là cộng sai; im lặng
      //    cộng sai còn tệ hơn bỏ qua.
      if (stockTrades.some((t) => t.account_id === a.id)) return null

      const { holdings, oversold } = fundHoldingsFromTrades(trades)
      // ② Sổ lệnh có lỗ hổng: giữ số cũ, không ghi số biết là sai.
      if (oversold.length > 0) return null

      // Ngày phiên tính TRÊN QUỸ ĐANG GIỮ, không trên cả bảng giá — xem sessionNavs().
      const {
        session: phien,
        navByFund,
        staleFunds,
      } = sessionNavs(
        db.fundPrices ?? [],
        holdings.map((h) => h.assocFundCd),
      )
      // ③ Bảng giá rỗng.
      if (!phien) return null
      // ④ Quỹ đang giữ mà giá còn ở phiên cũ hơn: giá vẫn > 0 nên fundValue không tự phát
      //    hiện được, phải chặn ở đây kẻo ghi số dùng giá hôm kia mà đóng dấu "hôm nay".
      if (holdings.some((h) => staleFunds.has(h.assocFundCd))) return null

      const { marketValue, missingNavs } = fundValue(holdings, navByFund)
      // ⑤⑥ Thiếu giá MỘT PHẦN cũng phải bỏ, không chỉ khi thiếu giá MỌI quỹ — chốt này
      //    KHÔNG có ở bản cổ phiếu. Giữ hai quỹ mà mất giá một quỹ là lệch cỡ 40%, lại
      //    đóng dấu 'auto' trông như đúng. Xem fund-refresh/index.ts.
      if (missingNavs.length > 0 || marketValue === null) return null

      return { valued_on: phien, market_value: marketValue, source: 'auto' }
    }
```

- [ ] **Step 4: Chọn hàm theo loại tiền ở chỗ gọi**

Thay dòng `const synthetic = tuTinhAutoValuation(a, balance)`:

```ts
        // Hai loại tài khoản đầu tư, hai cron thật, hai hàm mô phỏng. Chọn theo loại tiền
        // giống cách AccountDetailPage và trang Đầu tư chọn engine.
        const synthetic =
          a.currency === 'JPY'
            ? tuTinhAutoValuationQuy(a)
            : tuTinhAutoValuation(a, balance)
```

- [ ] **Step 5: Chạy test và kiểm kiểu**

```bash
npx vitest run src/data/demoRepo.test.ts && npx tsc -b && npm run lint && npm test
```

Kỳ vọng: PASS hết. Không nâng `STORAGE_KEY`: snapshot tính **lúc đọc**, không nằm trong dữ liệu lưu ở máy, nên bản demo cũ dùng được ngay.

- [ ] **Step 6: Bấm tay ở chế độ demo**

`npm run dev`, tab Tài sản. Kỳ vọng: dòng "NISA Rakuten" hiện giá trị theo yên (không còn 0), và bằng đúng "Giá trị danh mục" ở `/invest?tab=funds`. Mở trang chi tiết NISA: "Giá trị hiện tại" cũng bằng con số đó.

- [ ] **Step 7: Commit**

```bash
git add src/data/demoRepo.ts src/data/demoRepo.test.ts
git commit -m "fix(demo): dung snapshot auto cho tai khoan dau tu JPY

demoRepo chi mo phong stock-refresh nen NISA khong co snapshot nao va dung o
so du so (0) trong Tong tai san, trong khi khu danh muc quy hien Y2,8tr. Lo
do an vi hai cho sai giong nhau; sau khi trang tai khoan tinh tai may thi no
lo ra. Mo phong fund-refresh voi sau chot bo qua - chot thieu gia MOT PHAN
khong co o ban co phieu, dung chep nham.

Khong nang STORAGE_KEY: snapshot tinh luc doc, khong nam trong du lieu luu.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Hạ trần `designSystem` và cập nhật tài liệu

**Files:**
- Modify: `tests/designSystem.test.ts:53-75`
- Modify: `docs/information-architecture.md:105-114`
- Modify: `docs/co-phieu-viet-nam.md`, `docs/quy-nhat.md`

- [ ] **Step 1: Đo lại các trần**

```bash
npm test
```

Bộ guard vẫn xanh (mọi trần dùng `toBeLessThanOrEqual`), nhưng số đếm đã tụt vì hai component bị xoá. Đọc thông điệp của phép thử để lấy số hiện tại: tạm hạ `PROSE_MAX` xuống `0` rồi chạy lại — thông điệp lỗi sẽ in đúng số đếm hiện tại và danh sách chỗ đếm được.

```bash
npx vitest run tests/designSystem.test.ts
```

- [ ] **Step 2: Đặt trần bằng số vừa đo**

Trong `tests/designSystem.test.ts`, đặt `PROSE_MAX` bằng số vừa đo và thêm lời ghi vào khối chú thích trên hằng số (theo đúng khuôn các lời ghi 49/51/52/53 đang có):

```
 * <N> (2026-08-13, đợt gộp danh mục): tụt xuống vì HoldingsSection và FundHoldingsSection
 * bị xoá — nội dung của chúng gom về hai tab của /invest, nơi mỗi câu chỉ còn MỘT bản.
 * Hạ trần theo đúng quy ước ở thông điệp lỗi của chính phép thử này: trần không hạ là
 * trần rỗng, để lần sau thêm văn xuôi mới mà không ai biết.
```

Làm y hệt cho mọi trần khác đã tụt (ngưỡng `tabular-nums` mà `FundHoldingsSection` từng ghi là "đã sát trần") — chạy `npx vitest run tests/designSystem.test.ts` sau mỗi lần hạ để chắc vẫn xanh.

- [ ] **Step 3: Cập nhật `information-architecture.md`**

Thay khối dòng 105–114 (đang tả hai khu trên trang chi tiết tài khoản):

```markdown
Trang chi tiết tài khoản **không** hiện danh mục. Mọi câu "đang giữ gì" gom về `/invest`,
hai tab:

- **Tab "Cổ phiếu VN"** (`InvestStocksTab`) — gộp mọi tài khoản đầu tư tiền **VND**, dựng
  từ `stock_trades` (xem [`co-phieu-viet-nam.md`](co-phieu-viet-nam.md)).
- **Tab "Quỹ Nhật"** (`InvestFundsTab`) — gộp mọi tài khoản đầu tư tiền **JPY**, dựng từ
  `fund_trades` (xem [`quy-nhat.md`](quy-nhat.md)). Khác tab cổ phiếu ở chỗ không có dòng
  "Tiền chưa mua" (Rakuten quét sạch tiền dư) và đơn giá là ¥/10.000口.

Tab nằm trong URL (`?tab=stocks|funds`), kèm `?account=<id>` để lọc về một tài khoản. Trang
chi tiết tài khoản đầu tư chỉ còn ba dòng tóm tắt (giá trị hiện tại · lời/lỗ chưa bán ·
link sang tab đã lọc), tính bằng **cùng engine** với tab qua `useAccountPortfolio` — xem
[spec đợt gộp](superpowers/specs/2026-08-13-gop-trang-dau-tu-design.md).
```

- [ ] **Step 4: Cập nhật hai tài liệu vận hành**

Trong `docs/co-phieu-viet-nam.md` và `docs/quy-nhat.md`, tìm mọi chỗ nói khu "Danh mục" / "Danh mục quỹ" nằm trên trang chi tiết tài khoản và đổi sang tab tương ứng của `/invest`:

```bash
grep -n "HoldingsSection\|FundHoldingsSection\|khu \"Danh mục" docs/co-phieu-viet-nam.md docs/quy-nhat.md
```

Trong `docs/quy-nhat.md`, thêm vào mục nói về `account_valuations`: hàng `source='auto'` **không còn hiện** trên trang chi tiết tài khoản (khu "Lịch sử giá trị" chỉ liệt kê hàng `manual`); chúng vẫn được cron ghi và tab Diễn biến vẫn dùng để vẽ lịch sử tài sản ròng.

- [ ] **Step 5: Chạy toàn bộ kiểm tra lần cuối**

```bash
npx tsc -b && npm run lint && npm test && npm run build
```

Kỳ vọng: xanh hết, build thành công.

- [ ] **Step 6: Commit**

```bash
git add tests/designSystem.test.ts docs/information-architecture.md docs/co-phieu-viet-nam.md docs/quy-nhat.md
git commit -m "chore(dau-tu): ha tran designSystem va cap nhat tai lieu

Xoa hai component lam so dem tut xuong. Phep thu van xanh vi dung
toBeLessThanOrEqual, nhung thong diep loi cua chinh no dat ra quy uoc: da
xuong N thi ha tran xuong N. Tran khong ha la tran rong.

information-architecture.md: khu Danh muc tren trang chi tiet tai khoan
khong con; thay bang hai tab cua /invest.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Kiểm tra cuối — bằng chứng cho quyết định 2

Sau Task 11, bấm tay đúng một chuỗi này ở chế độ demo. Nó là bằng chứng của bất biến trung tâm: trang tài khoản và tab đi qua **cùng một engine**, nên không thể lệch nhau.

- [ ] `/invest?tab=stocks` — ghi lại "Giá trị danh mục" (tổng gộp hai tài khoản VND).
- [ ] Bấm chip "Chứng khoán VN" — ghi lại con số.
- [ ] Bấm chip "Đầu tư VN" — ghi lại con số.
- [ ] Hai con số riêng cộng lại **bằng** tổng gộp (bất biến ① của `buildPortfolio`).
- [ ] Mở trang chi tiết "Chứng khoán VN" — "Giá trị hiện tại" **bằng đúng** con số của chip cùng tên.
- [ ] `/invest?tab=funds` và trang chi tiết "NISA Rakuten" — hai con số **bằng nhau**.
- [ ] Tab Tài sản → dòng "NISA Rakuten" — giá trị **bằng** hai con số trên (Task 10 đã lấp lỗ demo).
- [ ] Nhãn ở tab Hiện tại đọc "Lãi/lỗ đầu tư (gồm đã bán)", không còn "(chưa thực hiện)".
