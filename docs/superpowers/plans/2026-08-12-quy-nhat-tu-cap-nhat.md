# Tự cập nhật giá quỹ đầu tư Nhật (NISA) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tài khoản đầu tư JPY tự có giá trị thị trường mỗi ngày, lấy 基準価額 từ thư viện 投資信託協会, không phải gõ tay.

**Architecture:** Đi lại đúng con đường của cổ phiếu Việt Nam — cron → edge function → bảng giá → tự ghi `account_valuations` — nhưng là một edge function RIÊNG (`fund-refresh`), nguồn giá riêng (CSV Shift-JIS), đơn vị riêng (¥/10.000口), và **không có tiền mặt** trong mô hình. Phép tính nằm ở một file thuần mới (`fundHoldings.ts`) được gói sang Deno qua esbuild, nên trình duyệt và cron dùng chung một hàm. Phía đọc (Tổng tài sản, XIRR, biểu đồ, thông báo) không sửa gì vì đã đọc `account_valuations` từ trước.

**Tech Stack:** TypeScript · React 19 + react-router · TanStack Query · Supabase (Postgres + RLS + Edge Functions/Deno) · vitest · esbuild (bundle sang Deno) · Tailwind

**Spec:** [docs/superpowers/specs/2026-08-12-quy-nhat-tu-cap-nhat-design.md](../specs/2026-08-12-quy-nhat-tu-cap-nhat-design.md)

## Global Constraints

- **Tiếng Việt** cho mọi comment, tên test, và chữ trên UI. Comment nói **vì sao**, không nói lại code.
- **Mọi số tiền là minor units** (JPY decimals = 0 ⇒ minor unit chính là yên). Không bao giờ dùng float cho tiền.
- **`fund_prices.nav` giữ nguyên đơn vị ¥ trên 10.000口.** Chia 10.000 ở **đúng một chỗ**: `fundValue()`.
- **Làm tròn từng quỹ rồi mới cộng** (`Math.round` mỗi quỹ, sau đó `+`). Làm tròn ở cuối sẽ lệch với app Rakuten.
- **`traded_on` = 約定日**, không phải 受渡日. Không lưu 受渡日 ở đâu cả.
- **Giải mã Shift-JIS bằng nhãn `shift_jis`.** Nhãn `cp932` KHÔNG được Node hỗ trợ (đã đo: `The "cp932" encoding is not supported`, Node v24 ICU đầy đủ). `shift-jis`, `sjis`, `windows-31j` cũng chạy nhưng dùng một nhãn duy nhất: `shift_jis`.
- **Nhận kết quả CSV bằng nội dung dòng đầu, KHÔNG bằng mã trạng thái HTTP.** Thiếu tham số → server trả `200` kèm body `{"statusCode":null}` (19 byte).
- **`fund_trades` KHÔNG đụng ledger** — không sinh giao dịch, không đổi số dư. Đúng nguyên tắc của `stock_trades` (migration 0035).
- **KHÔNG commit sao kê thật của chủ app.** Fixture cho test phải là dữ liệu tự dựng.
- **Không dùng `new Date()` cho `nav_date` hay `valued_on`.** Ngày phải parse từ chuỗi nguồn.
- Chạy test: `npm test` · lint: `npm run lint` · biên dịch: `npx tsc -b`

## Số liệu đích — dùng để canh mọi phép tính

Đo thật từ sao kê Rakuten + nguồn NAV ngày 2026-08-12. Ba con số này phải ra đúng, không phải "gần đúng":

| | 口数 | Giá vốn | NAV phiên 2026-08-10 | Giá trị |
|---|---|---|---|---|
| 楽天・プラス・S&P500 (`9I31223A`) | 28.429 | 50.000 ¥ | 20.053 | **57.009 ¥** |
| 楽天・プラス・NASDAQ-100 (`9I314241`) | 12.595 | 20.000 ¥ | 18.855 | **23.748 ¥** |
| Tổng | | **70.000 ¥** | | **80.757 ¥** |

Lãi = 80.757 − 70.000 = **+10.757 ¥**. Tỷ lệ 10.757/70.000 = 15,367%.

> App Rakuten hiện **+15,36%** (cắt đuôi), hàm `pct` của repo hiện **+15,4%** (`toFixed(1)`). **Đây không phải sai lệch cần đi tìm** — hai cách hiển thị khác nhau của cùng một con số. Đừng sửa `pct` vì chuyện này.

## Danh bạ 8 quỹ — mọi mã đã gọi thật, `200`, phiên 2026-08-10

| Tên chính thức | ISIN | 協会コード |
|---|---|---|
| 楽天・プラス・S&P500インデックス・ファンド | `JP90C000Q2U6` | `9I31223A` |
| 楽天・プラス・NASDAQ-100インデックス・ファンド | `JP90C000QF22` | `9I314241` |
| 楽天・全米株式インデックス・ファンド（楽天・VTI） | `JP90C000FHD2` | `9I312179` |
| eMAXIS Slim 全世界株式（オール・カントリー） | `JP90C000H1T1` | `0331418A` |
| eMAXIS Slim 米国株式（S&P500） | `JP90C000GKC6` | `03311187` |
| eMAXIS Slim 先進国株式インデックス（除く日本） | `JP90C000ENC5` | `03319172` |
| eMAXIS Slim 国内株式（日経平均） | `JP90C000FXV1` | `03311182` |
| SBI 日本株4.3ブル | `JP90C000FSK4` | `8931317C` |

## File Structure

| File | Trách nhiệm |
|---|---|
| `supabase/migrations/0045_fund_prices_trades.sql` | 4 bảng + RLS + seed 8 quỹ + 10 bí danh |
| `src/types/database.types.ts` | 4 Row type mới + 4 mục trong `Database['public']['Tables']` |
| `src/features/assets/fundHoldings.ts` | **Thuần**: `fundHoldingsFromTrades`, `sessionNavs`, `fundValue` |
| `src/features/assets/serverBundleFunds.ts` | Mặt tiếp xúc duy nhất app ⇄ `fund-refresh` |
| `src/data/repo.ts` `supabaseRepo.ts` `demoRepo.ts` `index.ts` | `NewFundTrade`, `FundTradePatch`, 6 method mới, backup v12 |
| `src/hooks/queries.ts` | `useFunds`, `useFundPrices`, `useFundTrades`, 3 mutation |
| `supabase/functions/fund-refresh/navs.ts` | `parseNavCsv` (thuần, `Uint8Array`) + `fetchFundNavs` |
| `supabase/functions/fund-refresh/loadInput.ts` | `loadFundRegistry`, `loadFundAccounts` — chỉ đọc, không tính |
| `supabase/functions/fund-refresh/index.ts` | 3 chế độ + van bỏ qua + log một dòng |
| `scripts/nhap-sao-ke-rakuten.mjs` | Đọc 受渡履歴, lọc, ghép bí danh, kiểm 口数 âm, ghi |
| `src/features/assets/FundHoldingsSection.tsx` | Khu "Danh mục quỹ" |
| `src/features/assets/FundTradeFormSheet.tsx` | Sheet sửa/thêm lệnh lẻ |
| `docs/quy-nhat.md` | Tài liệu vận hành |

---

## Task 1: Migration 0045 — bốn bảng, RLS, seed

**Files:**
- Create: `supabase/migrations/0045_fund_prices_trades.sql`
- Modify: `supabase/migrations/0035_stock_prices_trades.sql:18-21` (sửa comment "bảng DUY NHẤT")
- Test: `tests/fundSeed.test.ts`

> **Đã sửa 2026-08-12:** bản đầu của task này còn một bước "nối 0045 vào `supabase/setup_all.sql`".
> Bỏ đi: file đó chỉ được duy trì tới migration **0024** trong khi thực tế đã tới 0045, tức nó
> đã ngừng được cập nhật từ lâu. Nối một migration lẻ vào đó không làm nó đúng trở lại, chỉ tạo
> ảo giác là nó còn dùng được.

**Interfaces:**
- Consumes: bảng `accounts (id, user_id)` đã có composite unique (migration cũ).
- Produces: bảng `funds`, `fund_aliases`, `fund_prices`, `fund_trades` với đúng tên cột mà Task 2–8 dùng: `assoc_fund_cd`, `isin_cd`, `name`, `last_status`, `last_checked_at`, `statement_name`, `nav`, `prior_nav`, `net_assets_m`, `nav_date`, `updated_at`, `kind`, `traded_on`, `units`, `amount`, `bucket`, `note`.

- [ ] **Step 1: Viết bài test canh seed (thất bại trước)**

Đây là test **đọc file nguồn**, cùng kiểu với `tests/backupCompleteness.test.ts` — không cần Postgres. Nó chặn ca "seed làm nửa vời": thiếu một quỹ, hoặc thêm bí danh mà quên thêm quỹ.

`tests/fundSeed.test.ts`:

```ts
// Seed quỹ Nhật trong migration 0045 phải đủ và khớp nhau.
//
// Vì sao cần luật này: bảng `fund_aliases` quyết định TIỀN được cộng vào quỹ nào. Một bí
// danh trỏ tới mã quỹ không có trong `funds` sẽ làm câu INSERT của migration nổ ngay —
// nhưng chỉ nổ trên máy người chạy migration, sau khi họ đã chạy 44 migration trước đó.
// Bắt ở đây rẻ hơn nhiều.
//
// Ở tests/ chứ không src/: đọc filesystem bằng `node:fs`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager").
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const sql = readFileSync(
  join(ROOT, 'supabase', 'migrations', '0045_fund_prices_trades.sql'),
  'utf8',
)

/** 8 mã quỹ đã gọi thật ngày 2026-08-12 (200, phiên 2026-08-10). */
const MA_QUY = [
  '9I31223A',
  '9I314241',
  '9I312179',
  '0331418A',
  '03311187',
  '03319172',
  '03311182',
  '8931317C',
] as const

const ISIN = [
  'JP90C000Q2U6',
  'JP90C000QF22',
  'JP90C000FHD2',
  'JP90C000H1T1',
  'JP90C000GKC6',
  'JP90C000ENC5',
  'JP90C000FXV1',
  'JP90C000FSK4',
] as const

describe('migration 0045 — seed quỹ Nhật', () => {
  it('có đủ bốn bảng', () => {
    for (const t of ['funds', 'fund_aliases', 'fund_prices', 'fund_trades']) {
      expect(sql, `thiếu create table public.${t}`).toContain(`create table public.${t}`)
    }
  })

  it('seed đủ 8 mã quỹ và 8 ISIN', () => {
    for (const ma of MA_QUY) expect(sql, `seed thiếu mã quỹ ${ma}`).toContain(`'${ma}'`)
    for (const isin of ISIN) expect(sql, `seed thiếu ISIN ${isin}`).toContain(`'${isin}'`)
  })

  it('mỗi bí danh trỏ tới một mã quỹ CÓ trong seed', () => {
    // Khối `insert into public.fund_aliases ... values (...)`: lấy mọi cặp
    // ('<tên sao kê>', '<mã quỹ>') rồi soi phần tử thứ hai.
    const start = sql.indexOf('insert into public.fund_aliases')
    expect(start, 'không tìm thấy khối seed fund_aliases').toBeGreaterThan(-1)
    const block = sql.slice(start, sql.indexOf(';', start))
    const cap = [...block.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)]
    expect(cap.length, 'seed bí danh rỗng').toBeGreaterThanOrEqual(10)
    for (const [, ten, ma] of cap) {
      expect(MA_QUY as readonly string[], `bí danh "${ten}" trỏ tới mã lạ ${ma}`).toContain(ma)
    }
  })

  it('có bí danh cho CẢ HAI tên của quỹ đã đổi tên 2024-10-17', () => {
    // Đây là cái bẫy đã cho ra 口数 ÂM khi ghép theo tên một cách ngây thơ. Thiếu một
    // trong hai dòng này là lỗi thầm: sổ lệnh nhập vào sẽ có một vị thế âm 19.848 口.
    expect(sql).toContain('楽天・プラス・Ｓ＆Ｐ５００インデックス・ファンド')
    expect(sql).toContain('楽天・Ｓ＆Ｐ５００インデックス・ファンド')
    expect(sql).toContain('楽天・バンガード・ファンド')
  })

  it('fund_trades ràng buộc hình dạng theo kind', () => {
    expect(sql).toContain('fund_trades_shape')
  })

  // Thứ tự trong biểu thức là chỗ dễ sai và sai thì KHÔNG AI BIẾT. Cú pháp Postgres là
  // `create policy "x" on public.T for all ...` — tên bảng đứng TRƯỚC `for all`. Bản đầu
  // của bài test này viết ngược (`for all` rồi mới tới `on public.T`) nên nó luôn xanh, kể
  // cả khi có policy ghi thật: một chốt canh an ninh vô dụng mà trông như đang canh.
  const luatGhi = (bang: string) =>
    new RegExp(`create policy[^;]*on public\\.${bang}[^;]*for all`, 'i')

  it('chốt canh policy ghi tự chứng minh là nó còn bắt được', () => {
    // Không có bài này thì lần sau ai đó sửa biểu thức thành sai chiều nữa cũng không ai
    // biết — bài dưới sẽ vẫn xanh.
    const policyDocHai = `create policy "leaky" on public.funds\n  for all\n  using (true);`
    expect(luatGhi('funds').test(policyDocHai)).toBe(true)
  })

  it('KHÔNG có bảng nào cho phép user ghi vào bảng giá hay danh bạ', () => {
    // funds / fund_aliases / fund_prices là dữ liệu công khai do service role ghi.
    // Một policy `for all` trên ba bảng đó là mở đường cho user sửa mã quỹ của người khác.
    for (const t of ['funds', 'fund_aliases', 'fund_prices']) {
      expect(sql, `${t} không được có policy ghi`).not.toMatch(luatGhi(t))
    }
  })
})
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

```bash
npx vitest run tests/fundSeed.test.ts
```

Kỳ vọng: FAIL với `ENOENT` — chưa có file migration.

- [ ] **Step 3: Viết migration**

`supabase/migrations/0045_fund_prices_trades.sql`:

```sql
-- ============================================================
-- Sổ Chi Tiêu — Migration 0045: Tự cập nhật giá quỹ đầu tư Nhật (投資信託 / NISA)
--
-- Nối tiếp 0016 (giá trị đầu tư) và 0035 (sổ lệnh cổ phiếu). Ở đây thêm SỔ LỆNH QUỸ để
-- edge function fund-refresh tính được giá trị thị trường của tài khoản NISA và tự ghi
-- vào account_valuations.
--
-- KHÁC cổ phiếu Việt Nam ở ba chỗ, đều là quyết định có ý thức (xem spec):
--   1. 基準価額 niêm yết trên 10.000 口, không phải trên 1 đơn vị. Cột `nav` giữ NGUYÊN
--      đơn vị đó; chia 10.000 ở đúng một chỗ trong app (fundValue).
--   2. Giữ CẢ `units` lẫn `amount`: đo thật trên sao kê Rakuten,
--      28.429 × 17.588 ÷ 10.000 = 49.997 trong khi số tiền thật là 50.000. Suy giá vốn
--      từ số lượng × giá là sai vài yên mỗi lệnh.
--   3. KHÔNG có "tiền chưa đầu tư": Rakuten tự quét sạch tiền dư về 楽天銀行
--      (自動出金(スイープ)), nên tài khoản không bao giờ giữ tiền nhàn rỗi.
--
-- Sổ lệnh KHÔNG phải dòng tiền: không đụng transactions, không đụng số dư — đúng quyết
-- định của 0035.
--
-- Xem thêm: docs/superpowers/specs/2026-08-12-quy-nhat-tu-cap-nhat-design.md
-- ============================================================

-- ------------------------------------------------------------
-- 1. Danh bạ quỹ — công khai, không user_id
--
-- Cùng lý do với stock_prices (0035): mã quỹ và tên quỹ là dữ liệu công khai, giống hệt
-- nhau với mọi user, và không suy ra được ai giữ gì từ nó. Phần riêng tư nằm ở
-- fund_trades.
-- ------------------------------------------------------------
create table public.funds (
  -- 協会コード, vd '9I31223A'. Là khoá vì nó là thứ mọi bảng khác trỏ tới, và là thứ
  -- người dùng đọc được trên Yahoo Finance Nhật.
  assoc_fund_cd   text primary key,
  -- Cần CẢ hai mã để gọi CSV: thiếu một cái, server trả 200 kèm {"statusCode":null}.
  isin_cd         text        not null,
  name            text        not null default '',
  -- Kết quả lần hút gần nhất. Mã sai thì không có chỗ nào khác lộ ra.
  last_status     text        not null default 'chua-kiem'
    check (last_status in ('chua-kiem', 'ok', 'ma-sai', 'loi-mang')),
  last_checked_at timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.funds enable row level security;

-- Đọc: mọi user đã đăng nhập. Ghi: không policy nào → chỉ service role (edge function).
-- Không có UI thêm quỹ ở bản này, nên user không cần quyền ghi. Thêm quỹ mới = thêm một
-- hàng bằng SQL.
create policy "read for authenticated" on public.funds
  for select to authenticated
  using (true);

-- ------------------------------------------------------------
-- 2. Bí danh tên quỹ trong sao kê Rakuten
--
-- NHIỀU tên trỏ về MỘT quỹ, vì quỹ đổi tên. Rakuten đổi tên loạt 「楽天・プラス」 ngày
-- 2024-10-17 (https://www.rakuten-sec.co.jp/web/info/info20241017-01.html), nên một sao
-- kê duy nhất chứa cả tên cũ lẫn tên mới của CÙNG một quỹ.
--
-- Chứng minh bằng số: tra mã của tên MỚI (9I31223A) ra đúng đơn giá mà sao kê ghi cho
-- tên CŨ — 12.355 ở phiên 2024-08-07, 12.596 ở phiên 2024-08-09.
--
-- Ghép theo tên một cách ngây thơ cho ra 口数 ÂM (S&P500 −19.848, VTI −10.232). Đó là
-- dấu hiệu duy nhất, và là lý do script nhập có bất biến "không quỹ nào được âm".
--
-- Là BẢNG chứ không phải hằng số trong script: lần sau Rakuten đổi tên nữa thì thêm một
-- hàng, không sửa code.
-- ------------------------------------------------------------
create table public.fund_aliases (
  -- Đúng chuỗi trong cột 対象証券名 của sao kê, kể cả '/再投資型' ở cuối và ký tự
  -- full-width (Ｓ＆Ｐ５００). So khớp CHÍNH XÁC, không so gần đúng: hai quỹ Rakuten khác
  -- nhau đúng ba ký tự (・プラス) và có giá khác nhau.
  statement_name text primary key,
  assoc_fund_cd  text not null references public.funds (assoc_fund_cd) on delete cascade
);

alter table public.fund_aliases enable row level security;

create policy "read for authenticated" on public.fund_aliases
  for select to authenticated
  using (true);

-- ------------------------------------------------------------
-- 3. 基準価額 mới nhất — công khai, không user_id
-- ------------------------------------------------------------
create table public.fund_prices (
  assoc_fund_cd text primary key
    references public.funds (assoc_fund_cd) on delete cascade,
  -- YÊN trên 10.000 口 (đơn vị nguồn công bố). KHÔNG chia 10.000 ở đây — chia sớm là
  -- làm tròn sớm. Chia ở đúng một chỗ: fundValue() trong src/features/assets/fundHoldings.ts.
  nav           bigint      not null check (nav > 0),
  -- Phiên trước, để hiện % thay đổi trong ngày; null = không có.
  prior_nav     bigint,
  -- 純資産総額, đơn vị TRIỆU YÊN. KHÔNG tham gia phép tính tiền nào — nhân nhầm vào tổng
  -- tài sản là sai một triệu lần. Lưu vì nó nằm sẵn trong CSV và là cách rẻ nhất để biết
  -- quỹ còn sống hay đã đóng.
  net_assets_m  bigint,
  -- Ngày của GIÁ, không phải ngày hút. Nguồn trễ tối đa một phiên; cột này là thứ giúp
  -- valued_on đề đúng ngày thay vì đóng dấu "hôm nay" lên giá hôm qua.
  nav_date      date        not null,
  updated_at    timestamptz not null default now()
);

alter table public.fund_prices enable row level security;

create policy "read for authenticated" on public.fund_prices
  for select to authenticated
  using (true);

-- Cùng lý do với stock_prices_moddatetime: nếu cron quên stamp, DB tự ghi mốc. Đây là
-- cột DUY NHẤT phân biệt được "cron không ghi gì" với "nguồn trả giá phiên cũ" —
-- nav_date thì không phân biệt được. Khi debug một lượt cron im lặng: đo updated_at.
create trigger fund_prices_moddatetime
  before update on public.fund_prices
  for each row execute function extensions.moddatetime (updated_at);

-- ------------------------------------------------------------
-- 4. Sổ lệnh quỹ — riêng từng user
-- ------------------------------------------------------------
create table public.fund_trades (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  account_id    uuid        not null,
  assoc_fund_cd text        not null references public.funds (assoc_fund_cd),
  -- 'adjust' = 分配金再投資 (口数 tăng mà không tốn tiền) và mọi lần 口数 đổi không qua
  -- mua bán. Hai quỹ Rakuten hiện không chia 分配金 nên hiếm dùng — nhưng thiếu nó thì
  -- lần đầu tiên quỹ chia tiền, 口数 trong app sai vĩnh viễn mà không có cách sửa ngoài
  -- việc bịa một lệnh mua. Đúng lý do đã có 'adjust' ở stock_trades.
  kind          text        not null check (kind in ('buy', 'sell', 'adjust')),
  -- 約定日 (ngày khớp), KHÔNG phải 受渡日 (ngày tiền về). 基準価額 thuộc về 約定日; trên
  -- sao kê thật hai ngày này lệch tới 5 ngày (受渡 2026/4/14 ⇄ 約定 2026/4/9). Cột 受渡日
  -- cố ý KHÔNG được lưu ở đâu cả, để không ai lỡ tay dùng nó.
  traded_on     date        not null default current_date,
  -- 口数. Âm CHỈ hợp lệ với kind='adjust' — xem ràng buộc dưới.
  units         bigint      not null,
  -- 基準価額 lúc khớp, ¥/10.000口. Lưu để đối chiếu với nguồn và để hiện 取得単価; phép
  -- tính giá vốn KHÔNG dùng cột này (dùng `amount`).
  nav           bigint      not null default 0 check (nav >= 0),
  -- Số tiền THẬT đã trừ (mua) hoặc nhận về (bán), yên. Đây là nguồn sự thật cho giá vốn.
  amount        bigint      not null default 0 check (amount >= 0),
  -- 口座区分 nguyên văn: 'NISA成長投資枠' | 'NISAつみたて投資枠' | 'つみたてNISA' |
  -- '特定' | ''. KHÔNG tham gia phép tính; giữ để sau này tách được NISA khỏi 特定 mà
  -- không phải nhập lại sao kê.
  bucket        text        not null default '',
  note          text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Composite FK: đảm bảo tài khoản thuộc đúng user; xoá tài khoản → xoá sổ lệnh.
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  constraint fund_trades_shape check (
    case kind
      when 'adjust' then units <> 0 and nav = 0 and amount = 0
      else units > 0 and amount > 0
    end
  )
);

create index fund_trades_account_idx on public.fund_trades (account_id, traded_on);

alter table public.fund_trades enable row level security;

create policy "own rows" on public.fund_trades
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger fund_trades_moddatetime
  before update on public.fund_trades
  for each row execute function extensions.moddatetime (updated_at);

-- ------------------------------------------------------------
-- 5. Seed 8 quỹ — mọi mã đã gọi thật ngày 2026-08-12, đều trả 200, phiên 2026-08-10
-- ------------------------------------------------------------
insert into public.funds (assoc_fund_cd, isin_cd, name) values
  ('9I31223A', 'JP90C000Q2U6', '楽天・プラス・S&P500インデックス・ファンド'),
  ('9I314241', 'JP90C000QF22', '楽天・プラス・NASDAQ-100インデックス・ファンド'),
  ('9I312179', 'JP90C000FHD2', '楽天・全米株式インデックス・ファンド（楽天・VTI）'),
  ('0331418A', 'JP90C000H1T1', 'eMAXIS Slim 全世界株式（オール・カントリー）'),
  ('03311187', 'JP90C000GKC6', 'eMAXIS Slim 米国株式（S&P500）'),
  ('03319172', 'JP90C000ENC5', 'eMAXIS Slim 先進国株式インデックス（除く日本）'),
  ('03311182', 'JP90C000FXV1', 'eMAXIS Slim 国内株式（日経平均）'),
  ('8931317C', 'JP90C000FSK4', 'SBI 日本株4.3ブル')
on conflict (assoc_fund_cd) do nothing;

-- ------------------------------------------------------------
-- 6. Seed bí danh — 8 tên hiện hành + 2 tên CŨ của quỹ đã đổi tên
--
-- Chuỗi phải khớp CHÍNH XÁC cột 対象証券名 của sao kê, kể cả '/再投資型' và ký tự
-- full-width. Hai dòng có ghi chú "TÊN CŨ" là hai cái bẫy đã đo được.
-- ------------------------------------------------------------
insert into public.fund_aliases (statement_name, assoc_fund_cd) values
  ('楽天・プラス・Ｓ＆Ｐ５００インデックス・ファンド(楽天・プラス・Ｓ＆Ｐ５００)/再投資型', '9I31223A'),
  -- TÊN CŨ, trước 2024-10-17. Cùng quỹ, cùng 口数 — bỏ dòng này là vị thế âm 19.848 口.
  ('楽天・Ｓ＆Ｐ５００インデックス・ファンド(楽天・Ｓ＆Ｐ５００)/再投資型', '9I31223A'),
  ('楽天・プラス・NASDAQ-100インデックス・ファンド(楽天・プラス・NASDAQ-100)/再投資型', '9I314241'),
  ('楽天・全米株式インデックス・ファンド(楽天・VTI)/再投資型', '9I312179'),
  -- TÊN CŨ (đổi 愛称, tên chính thức giữ nguyên) — bỏ dòng này là vị thế âm 10.232 口.
  ('楽天・全米株式インデックス・ファンド（楽天・バンガード・ファンド（全米株式））/再投資型', '9I312179'),
  ('eMAXIS Slim 全世界株式(オール・カントリー)/再投資型', '0331418A'),
  ('eMAXIS Slim 米国株式(S&P500)/再投資型', '03311187'),
  ('eMAXIS Slim 先進国株式インデックス/再投資型', '03319172'),
  ('eMAXIS Slim 国内株式(日経平均)/再投資型', '03311182'),
  ('SBI日本株4.3ブル/再投資型', '8931317C')
on conflict (statement_name) do nothing;
```

- [ ] **Step 4: Sửa comment sai ở migration 0035**

Trong `supabase/migrations/0035_stock_prices_trades.sql`, đổi dòng 18–21. Nội dung cũ:

```sql
-- Bảng DUY NHẤT trong dự án không có user_id (ngoại lệ có ý thức với nguyên tắc 0.5):
```

thành:

```sql
-- Bảng ĐẦU TIÊN trong dự án không có user_id (ngoại lệ có ý thức với nguyên tắc 0.5).
-- Migration 0045 thêm ba bảng nữa cùng loại: funds, fund_aliases, fund_prices.
```

Vì sao sửa: để người đọc sau không tin là chỉ có một bảng như vậy rồi đi tìm sai chỗ.

- [ ] **Step 5: (đã bỏ — xem ghi chú ở đầu task)**

- [ ] **Step 6: Chạy test để thấy xanh**

```bash
npx vitest run tests/fundSeed.test.ts
```

Kỳ vọng: PASS, 7 bài.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0045_fund_prices_trades.sql supabase/migrations/0035_stock_prices_trades.sql tests/fundSeed.test.ts
git commit -m "feat(quy-nhat): migration 0045 — bang gia + so lenh quy Nhat, seed 8 quy"
```

---

## Task 2: `fundHoldings.ts` — phép tính thuần

**Files:**
- Create: `src/features/assets/fundHoldings.ts`
- Test: `src/features/assets/fundHoldings.test.ts`

**Interfaces:**
- Consumes: không gì (thuần, không import gì ngoài kiểu của chính nó).
- Produces:
  ```ts
  export interface FundTrade {
    assocFundCd: string
    kind: 'buy' | 'sell' | 'adjust'
    /** 約定日, ISO date */
    tradedOn: string
    units: number
    /** ¥/10.000口 lúc khớp; 0 với adjust */
    nav: number
    /** yên thật đã trừ/nhận; 0 với adjust */
    amount: number
  }
  export interface FundHolding {
    assocFundCd: string
    units: number
    /** yên */
    costBasis: number
    /** ¥/10.000口 — 取得単価 kiểu Rakuten */
    avgNav: number
  }
  export interface FundHoldingsResult {
    holdings: FundHolding[]
    realizedPnl: number
    oversold: string[]
  }
  export interface SessionNavs {
    session: string | null
    navByFund: Map<string, number>
    staleFunds: Set<string>
  }
  export interface FundValue {
    marketValue: number | null
    missingNavs: string[]
  }
  export function fundHoldingsFromTrades(trades: FundTrade[]): FundHoldingsResult
  export function sessionNavs(rows: { assoc_fund_cd: string; nav: number; nav_date: string }[]): SessionNavs
  export function fundValue(holdings: FundHolding[], navByFund: Map<string, number>): FundValue
  export const NAV_UNITS = 10_000
  ```

- [ ] **Step 1: Viết bài test thất bại**

`src/features/assets/fundHoldings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  fundHoldingsFromTrades,
  fundValue,
  sessionNavs,
  type FundTrade,
} from './fundHoldings'

// Hai quỹ chủ app đang giữ — dùng mã thật để bài test đọc được như sao kê.
const SP500 = '9I31223A'
const NDX = '9I314241'

/**
 * Lệnh mua gọn cho test. `amount` là số tiền THẬT, cố tình KHÔNG bằng
 * units × nav ÷ 10.000 ở mấy ca lấy từ sao kê thật — đó chính là chuyện cần canh.
 */
function mua(
  assocFundCd: string,
  units: number,
  nav: number,
  amount: number,
  tradedOn = '2026-04-09',
): FundTrade {
  return { assocFundCd, kind: 'buy', tradedOn, units, nav, amount }
}
function ban(
  assocFundCd: string,
  units: number,
  nav: number,
  amount: number,
  tradedOn = '2026-04-08',
): FundTrade {
  return { assocFundCd, kind: 'sell', tradedOn, units, nav, amount }
}
function taiDauTu(assocFundCd: string, units: number, tradedOn = '2026-05-01'): FundTrade {
  return { assocFundCd, kind: 'adjust', tradedOn, units, nav: 0, amount: 0 }
}

describe('fundHoldingsFromTrades', () => {
  it('sổ lệnh rỗng → không giữ gì', () => {
    expect(fundHoldingsFromTrades([])).toEqual({
      holdings: [],
      realizedPnl: 0,
      oversold: [],
    })
  })

  it('giá vốn lấy từ `amount`, KHÔNG suy từ units × nav ÷ 10.000', () => {
    // Lệnh thật trên sao kê Rakuten 2026-04-09: 28.429 口 ở 基準価額 17.588, trừ 50.000 ¥.
    // 28.429 × 17.588 ÷ 10.000 = 49.997 — lệch 3 yên. `amount` mới là số thật.
    const { holdings } = fundHoldingsFromTrades([mua(SP500, 28_429, 17_588, 50_000)])
    expect(holdings).toEqual([
      { assocFundCd: SP500, units: 28_429, costBasis: 50_000, avgNav: 17_589 },
    ])
  })

  it('mua nhiều lần: 口数 và giá vốn cộng dồn, 取得単価 là bình quân gia quyền', () => {
    const { holdings } = fundHoldingsFromTrades([
      mua(SP500, 28_429, 17_588, 50_000, '2026-04-09'),
      mua(SP500, 28_611, 17_476, 50_000, '2026-03-10'),
    ])
    expect(holdings[0].units).toBe(57_040)
    expect(holdings[0].costBasis).toBe(100_000)
    // 100.000 ÷ 57.040 × 10.000 = 17.531,6 → 17.532
    expect(holdings[0].avgNav).toBe(17_532)
  })

  it('bán một phần: trừ giá vốn theo bình quân trên 口, lãi tính đúng', () => {
    const { holdings, realizedPnl } = fundHoldingsFromTrades([
      mua(NDX, 20_000, 10_000, 20_000, '2026-01-05'),
      ban(NDX, 5_000, 12_000, 6_000, '2026-02-05'),
    ])
    // Bán 1/4 số 口 → trừ 1/4 giá vốn = 5.000; thu về 6.000 ⇒ lãi 1.000.
    expect(holdings[0].units).toBe(15_000)
    expect(holdings[0].costBasis).toBe(15_000)
    expect(realizedPnl).toBe(1_000)
  })

  it('bán sạch rồi mua lại hôm sau: giá vốn KHÔNG còn dư của vị thế cũ', () => {
    // Ca thật, xảy ra ngày 2026-04-13/14: bán hết rồi mua lại ngay hôm sau. Thiếu bước
    // xoá phần dư chia lẻ thì lần mua sau tính bình quân sai vĩnh viễn.
    const { holdings, realizedPnl } = fundHoldingsFromTrades([
      mua(SP500, 172_887, 13_893, 260_000, '2026-03-10'),
      ban(SP500, 172_887, 17_128, 296_121, '2026-04-08'),
      mua(SP500, 28_429, 17_588, 50_000, '2026-04-09'),
    ])
    expect(holdings).toEqual([
      { assocFundCd: SP500, units: 28_429, costBasis: 50_000, avgNav: 17_589 },
    ])
    expect(realizedPnl).toBe(36_121)
  })

  it('bán quá số đang giữ → nêu tên quỹ, kẹp về số thực, không sinh lãi khổng lồ', () => {
    // Đây là chữ ký của việc THIẾU MỘT DÒNG BÍ DANH: quỹ đổi tên, nửa lịch sử ghép vào
    // tên này còn nửa kia vào tên khác, nên phía có lệnh bán bị âm.
    const { holdings, oversold, realizedPnl } = fundHoldingsFromTrades([
      mua(SP500, 10_000, 10_000, 10_000, '2026-01-05'),
      ban(SP500, 30_000, 12_000, 36_000, '2026-02-05'),
    ])
    expect(oversold).toEqual([SP500])
    expect(holdings).toEqual([])
    // Chỉ 10.000 口 thực sự được bán: thu về theo tỷ lệ 10.000/30.000 của 36.000 = 12.000,
    // trừ giá vốn 10.000 ⇒ 2.000. Không phải 36.000 − 10.000.
    expect(realizedPnl).toBe(2_000)
  })

  it('adjust (分配金再投資): 口数 tăng, giá vốn KHÔNG đổi → 取得単価 tự giảm', () => {
    const { holdings } = fundHoldingsFromTrades([
      mua(NDX, 10_000, 10_000, 10_000, '2026-01-05'),
      taiDauTu(NDX, 1_000),
    ])
    expect(holdings[0].units).toBe(11_000)
    expect(holdings[0].costBasis).toBe(10_000)
    // 10.000 ÷ 11.000 × 10.000 = 9.090,9 → 9.091
    expect(holdings[0].avgNav).toBe(9_091)
  })

  it('adjust âm quá số đang giữ → nêu tên quỹ, không để 口数 âm', () => {
    const { holdings, oversold } = fundHoldingsFromTrades([
      mua(NDX, 1_000, 10_000, 1_000, '2026-01-05'),
      taiDauTu(NDX, -2_000),
    ])
    expect(oversold).toEqual([NDX])
    expect(holdings).toEqual([])
  })

  it('xếp theo giá vốn giảm dần, quỹ bán sạch không xuất hiện', () => {
    const { holdings } = fundHoldingsFromTrades([
      mua(NDX, 12_595, 15_879, 20_000, '2026-04-09'),
      mua(SP500, 28_429, 17_588, 50_000, '2026-04-09'),
    ])
    expect(holdings.map((h) => h.assocFundCd)).toEqual([SP500, NDX])
  })

  it('thứ tự cộng dồn theo 約定日, không theo thứ tự trong mảng', () => {
    // Sao kê Rakuten xếp mới nhất TRƯỚC. Nếu hàm cộng dồn theo thứ tự mảng thì lệnh bán
    // sẽ được xử lý trước lệnh mua và mọi thứ đều `oversold`.
    const { holdings, oversold } = fundHoldingsFromTrades([
      ban(SP500, 10_000, 12_000, 12_000, '2026-02-05'),
      mua(SP500, 10_000, 10_000, 10_000, '2026-01-05'),
    ])
    expect(oversold).toEqual([])
    expect(holdings).toEqual([])
  })
})

describe('sessionNavs', () => {
  it('bảng giá rỗng → session null', () => {
    expect(sessionNavs([])).toEqual({
      session: null,
      navByFund: new Map(),
      staleFunds: new Set(),
    })
  })

  it('session là nav_date LỚN NHẤT; quỹ ở phiên cũ hơn bị nêu tên', () => {
    const r = sessionNavs([
      { assoc_fund_cd: SP500, nav: 20_053, nav_date: '2026-08-10' },
      { assoc_fund_cd: NDX, nav: 18_712, nav_date: '2026-08-07' },
    ])
    expect(r.session).toBe('2026-08-10')
    expect(r.navByFund.get(SP500)).toBe(20_053)
    expect(r.navByFund.get(NDX)).toBe(18_712)
    expect([...r.staleFunds]).toEqual([NDX])
  })

  it('nav <= 0 không vào bảng tra (cột có check nav > 0, nhưng đừng tin mù)', () => {
    const r = sessionNavs([
      { assoc_fund_cd: SP500, nav: 20_053, nav_date: '2026-08-10' },
      { assoc_fund_cd: NDX, nav: 0, nav_date: '2026-08-10' },
    ])
    expect(r.navByFund.has(NDX)).toBe(false)
    expect(r.navByFund.get(SP500)).toBe(20_053)
  })
})

describe('fundValue', () => {
  it('tái tạo ĐÚNG TỪNG YÊN ba con số của app Rakuten ngày 2026-08-12', () => {
    // Đây là bài test đích của cả tính năng. Ba con số dưới đọc được trên ảnh chụp app
    // Rakuten; NAV là phiên 2026-08-10 lấy từ nguồn 投資信託協会.
    const { holdings } = fundHoldingsFromTrades([
      mua(NDX, 12_595, 15_879, 20_000, '2026-04-09'),
      mua(SP500, 28_429, 17_588, 50_000, '2026-04-09'),
    ])
    const navByFund = new Map([
      [SP500, 20_053],
      [NDX, 18_855],
    ])
    const v = fundValue(holdings, navByFund)

    // 28.429 × 20.053 ÷ 10.000 = 57.008,67 → 57.009
    // 12.595 × 18.855 ÷ 10.000 = 23.747,87 → 23.748
    expect(v.marketValue).toBe(80_757)
    expect(v.missingNavs).toEqual([])

    const giaVon = holdings.reduce((s, h) => s + h.costBasis, 0)
    expect(giaVon).toBe(70_000)
    expect((v.marketValue ?? 0) - giaVon).toBe(10_757)
  })

  it('làm tròn TỪNG quỹ rồi mới cộng, không làm tròn ở cuối', () => {
    // Hai quỹ mà mỗi cái lẻ 0,5: làm tròn từng cái ra 2 đơn vị lẻ, làm tròn tổng ra 1.
    // Con số 5 口 ở nav 1 cho phần lẻ đúng 0,0005 × 10.000 → dựng số cho dễ nhẩm:
    // 15.000 口 × 10.003 ÷ 10.000 = 15.004,5 → 15.005 (mỗi quỹ)
    const holdings = [
      { assocFundCd: 'A', units: 15_000, costBasis: 15_000, avgNav: 10_000 },
      { assocFundCd: 'B', units: 15_000, costBasis: 15_000, avgNav: 10_000 },
    ]
    const navs = new Map([
      ['A', 10_003],
      ['B', 10_003],
    ])
    // Làm tròn từng quỹ: 15.005 + 15.005 = 30.010.
    // Làm tròn ở cuối:   30.009 (vì 15.004,5 + 15.004,5 = 30.009).
    expect(fundValue(holdings, navs).marketValue).toBe(30_010)
  })

  it('thiếu giá MỘT quỹ: vẫn ra số, quỹ đó tạm tính theo giá vốn và bị nêu tên', () => {
    const holdings = [
      { assocFundCd: SP500, units: 28_429, costBasis: 50_000, avgNav: 17_589 },
      { assocFundCd: NDX, units: 12_595, costBasis: 20_000, avgNav: 15_880 },
    ]
    const v = fundValue(holdings, new Map([[SP500, 20_053]]))
    expect(v.marketValue).toBe(57_009 + 20_000)
    expect(v.missingNavs).toEqual([NDX])
  })

  it('thiếu giá MỌI quỹ → marketValue null (đừng ghi một con số bằng đúng giá vốn)', () => {
    const holdings = [
      { assocFundCd: SP500, units: 28_429, costBasis: 50_000, avgNav: 17_589 },
    ]
    const v = fundValue(holdings, new Map())
    expect(v.marketValue).toBeNull()
    expect(v.missingNavs).toEqual([SP500])
  })

  it('không giữ gì → marketValue 0, không phải null', () => {
    // Khác "thiếu giá mọi quỹ": ở đây KHÔNG có gì để thiếu giá. 0 là con số đúng và
    // ghi được — tài khoản đã bán sạch thì giá trị bằng 0.
    expect(fundValue([], new Map())).toEqual({ marketValue: 0, missingNavs: [] })
  })
})
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

```bash
npx vitest run src/features/assets/fundHoldings.test.ts
```

Kỳ vọng: FAIL — `Failed to resolve import "./fundHoldings"`.

- [ ] **Step 3: Viết `fundHoldings.ts`**

```ts
// Danh mục quỹ đầu tư Nhật dựng từ sổ lệnh — thuần, không phụ thuộc React, test được.
//
// File RIÊNG, không nhét vào holdings.ts, vì ba chỗ khác nhau về bản chất:
//
// 1. ĐƠN VỊ. 基準価額 niêm yết trên 10.000 口, không phải trên một đơn vị. Cổ phiếu Việt
//    Nam là đồng/cổ, nhân thẳng. Ở đây phải chia NAV_UNITS, và chia ở đúng một chỗ.
// 2. GIÁ VỐN. Cổ phiếu tính `số cổ × giá + phí`. Quỹ thì lấy thẳng số tiền thật đã trừ,
//    vì `口数 × 基準価額 ÷ 10.000` KHÔNG bằng số tiền Rakuten trừ: đo trên sao kê thật,
//    28.429 × 17.588 ÷ 10.000 = 49.997 trong khi số tiền là 50.000. Lệch 3 yên mỗi lệnh,
//    136 lệnh thì thành sai lệch thấy được.
// 3. TIỀN MẶT. Không có. Rakuten tự quét sạch tiền dư về 楽天銀行 (自動出金(スイープ)),
//    nên tài khoản không giữ tiền nhàn rỗi — và tiền vào tài khoản qua thẻ tín dụng/điểm
//    chứ không qua một lần chuyển khoản mà sổ app có ghi. Mượn `brokerCash` ở đây sẽ ra
//    số âm, van `tien-chua-dau-tu-am` chặn, và cron chạy mỗi ngày mà KHÔNG BAO GIỜ ghi
//    được gì — thất bại im lặng.
//
// Gộp ba chỗ đó vào một hàm chung với cổ phiếu là mời một lỗi làm tròn không ai tìm ra.
//
// Mọi số tiền ở minor units JPY. JPY decimals = 0 nên minor unit CHÍNH LÀ yên.

/** 基準価額 niêm yết trên 10.000 口. Chia ở đúng một chỗ: fundValue(). */
export const NAV_UNITS = 10_000

export interface FundTrade {
  /** 協会コード, vd '9I31223A' */
  assocFundCd: string
  kind: 'buy' | 'sell' | 'adjust'
  /** 約定日 (ISO date) — ngày mà `nav` thuộc về, KHÔNG phải 受渡日. */
  tradedOn: string
  /** 口数; âm chỉ hợp lệ với kind='adjust' */
  units: number
  /** ¥/10.000口 lúc khớp; 0 với 'adjust' */
  nav: number
  /** yên THẬT đã trừ (mua) / nhận (bán); 0 với 'adjust' */
  amount: number
}

export interface FundHolding {
  assocFundCd: string
  /** 口数 đang giữ (luôn > 0 — quỹ bán sạch không xuất hiện) */
  units: number
  /** yên */
  costBasis: number
  /** ¥/10.000口 — 取得単価 kiểu Rakuten */
  avgNav: number
}

export interface FundHoldingsResult {
  /** chỉ quỹ còn giữ, xếp theo giá vốn giảm dần */
  holdings: FundHolding[]
  /** lãi/lỗ đã hiện thực hoá từ các lệnh bán (yên; có thể âm) */
  realizedPnl: number
  /** quỹ bị bán quá số đang giữ → sổ lệnh có lỗ hổng, hoặc THIẾU MỘT DÒNG BÍ DANH */
  oversold: string[]
}

export interface SessionNavs {
  /** Ngày phiên mới nhất trong bảng giá; null = bảng giá rỗng. */
  session: string | null
  /** ¥/10.000口, chỉ quỹ có nav > 0 */
  navByFund: Map<string, number>
  /** Quỹ mà giá còn ở phiên CŨ hơn `session` — lượt hút này chưa lấy được. */
  staleFunds: Set<string>
}

export interface FundValue {
  /** null = không đáng tin; xem `fundValue` */
  marketValue: number | null
  /** quỹ chưa có giá, đang tạm tính theo giá vốn */
  missingNavs: string[]
}

/** 取得単価: yên trên 10.000 口, làm tròn về số nguyên như Rakuten hiện. */
function avgNavOf(costBasis: number, units: number): number {
  return units > 0 ? Math.round((costBasis / units) * NAV_UNITS) : 0
}

/**
 * Cộng dồn sổ lệnh ra 口数 và giá vốn từng quỹ.
 *
 * Bán trừ theo **giá vốn bình quân trên 口**, giống 取得単価 mà Rakuten báo — nên số
 * trong app khớp sao kê.
 *
 * `oversold` không chỉ nghĩa là "quên ghi một lệnh mua". Với quỹ Nhật nó còn là chữ ký
 * của việc THIẾU MỘT DÒNG trong `fund_aliases`: quỹ đổi tên (Rakuten đổi loạt
 * 「楽天・プラス」 ngày 2024-10-17), nửa lịch sử ghép vào mã này còn nửa kia rơi ra
 * ngoài, nên phía có lệnh bán bị âm. Đã đo: S&P500 −19.848 口, VTI −10.232 口.
 */
export function fundHoldingsFromTrades(trades: FundTrade[]): FundHoldingsResult {
  const acc = new Map<string, { units: number; costBasis: number }>()
  const oversold = new Set<string>()
  let realizedPnl = 0

  // Sao kê Rakuten xếp MỚI NHẤT TRƯỚC. Không sắp lại theo 約定日 thì lệnh bán được xử lý
  // trước lệnh mua và mọi quỹ đều `oversold`. Sort ổn định của JS giữ nguyên thứ tự nhập
  // với các lệnh cùng ngày.
  const inOrder = trades.slice().sort((a, b) => a.tradedOn.localeCompare(b.tradedOn))

  for (const t of inOrder) {
    const h = acc.get(t.assocFundCd) ?? { units: 0, costBasis: 0 }

    if (t.kind === 'buy') {
      h.units += t.units
      // Số tiền THẬT, không suy từ units × nav — xem đầu file.
      h.costBasis += t.amount
    } else if (t.kind === 'sell') {
      if (t.units > h.units) oversold.add(t.assocFundCd)
      // Kẹp về số thực đang giữ: bán quá tay thì `oversold` đã báo, không cần thêm một
      // con số lãi khổng lồ vô nghĩa. Tiền thu về cũng phải kẹp theo TỶ LỆ, kẻo lãi tính
      // từ toàn bộ số tiền của một lệnh chỉ khớp được một phần.
      const sold = Math.min(t.units, h.units)
      const thuVe = t.units > 0 ? (t.amount * sold) / t.units : 0
      const von = h.units > 0 ? (h.costBasis * sold) / h.units : 0
      realizedPnl += thuVe - von
      h.units -= sold
      h.costBasis -= von
      // Bán sạch thì xoá phần dư do chia lẻ. Thiếu dòng này, quỹ đã bán hết vẫn còn vài
      // yên giá vốn lơ lửng và lần mua sau tính bình quân sai — ca "bán sạch rồi mua lại
      // hôm sau" đã xảy ra thật ngày 2026-04-13/14.
      if (h.units === 0) h.costBasis = 0
    } else {
      // 分配金再投資 / điều chỉnh 口数: số 口 đổi, giá vốn KHÔNG đổi → 取得単価 tự giảm.
      // Đó đúng là bản chất của việc được chia thêm mà không tốn tiền.
      h.units += t.units
      if (h.units < 0) {
        oversold.add(t.assocFundCd)
        h.units = 0
        h.costBasis = 0
      }
    }

    acc.set(t.assocFundCd, h)
  }

  const holdings: FundHolding[] = [...acc.entries()]
    .filter(([, h]) => h.units > 0)
    .map(([assocFundCd, h]) => ({
      assocFundCd,
      units: h.units,
      costBasis: Math.round(h.costBasis),
      avgNav: avgNavOf(h.costBasis, h.units),
    }))
    .sort((a, b) => b.costBasis - a.costBasis || a.assocFundCd.localeCompare(b.assocFundCd))

  return {
    holdings,
    realizedPnl: Math.round(realizedPnl),
    oversold: [...oversold].sort(),
  }
}

/**
 * Gom bảng giá thô thành MỘT phiên duy nhất cho cả snapshot.
 *
 * `fund_prices` được hút từng quỹ một, và một quỹ lỗi thì các quỹ khác vẫn ghi — nên sau
 * một lượt chạy, không phải mọi hàng chắc chắn cùng `nav_date`. `session` lấy ngày lớn
 * nhất coi như ngày của snapshot; quỹ nào còn kẹt ở ngày cũ hơn thì được nêu tên trong
 * `staleFunds` để nơi gọi tự quyết bỏ qua — im lặng dùng giá hôm kia rồi đóng dấu "hôm
 * nay" là nói dối.
 *
 * Cùng vai trò với `sessionPrices` của cổ phiếu; tách riêng vì tên cột khác.
 */
export function sessionNavs(
  rows: { assoc_fund_cd: string; nav: number; nav_date: string }[],
): SessionNavs {
  const session = rows.map((r) => r.nav_date).sort().at(-1) ?? null

  const navByFund = new Map<string, number>()
  const staleFunds = new Set<string>()

  for (const r of rows) {
    if (r.nav > 0) navByFund.set(r.assoc_fund_cd, r.nav)
    if (session !== null && r.nav_date < session) staleFunds.add(r.assoc_fund_cd)
  }

  return { session, navByFund, staleFunds }
}

/**
 * Giá trị thị trường của cả tài khoản = tổng giá trị các quỹ. **Không cộng tiền mặt** —
 * xem lý do 3 ở đầu file.
 *
 * Làm tròn TỪNG quỹ rồi mới cộng, đúng cách Rakuten hiện từng dòng rồi cộng ra tổng. Làm
 * tròn ở cuối sẽ lệch với app Rakuten một vài yên và người dùng sẽ đi tìm một nguyên nhân
 * không có thật. Đã đối chiếu: 28.429 × 20.053 ÷ 10.000 → 57.009 và
 * 12.595 × 18.855 ÷ 10.000 → 23.748, tổng 80.757 — khớp từng yên với ảnh chụp app Rakuten
 * ngày 2026-08-12.
 *
 * `marketValue` trả `null` khi thiếu giá **mọi** quỹ đang giữ: lúc đó tất cả rơi về giá
 * vốn nên kết quả chỉ bằng đúng giá vốn, không nói thêm được gì so với việc chưa có
 * snapshot nào. Thiếu giá **một phần** thì vẫn trả số, quỹ thiếu tạm tính theo giá vốn và
 * có tên trong `missingNavs` — cùng cách app xử lý thiếu tỷ giá.
 *
 * KHÔNG giữ quỹ nào thì trả **0**, không phải null: đó là con số đúng và ghi được (tài
 * khoản đã bán sạch thì giá trị bằng 0), khác hẳn "có giữ mà không biết giá".
 */
export function fundValue(
  holdings: FundHolding[],
  navByFund: Map<string, number>,
): FundValue {
  let marketValue = 0
  const missingNavs: string[] = []

  for (const h of holdings) {
    const nav = navByFund.get(h.assocFundCd)
    if (nav == null || nav <= 0) {
      missingNavs.push(h.assocFundCd)
      marketValue += h.costBasis
    } else {
      marketValue += Math.round((h.units * nav) / NAV_UNITS)
    }
  }

  const allMissing = holdings.length > 0 && missingNavs.length === holdings.length
  return { marketValue: allMissing ? null : marketValue, missingNavs }
}
```

- [ ] **Step 4: Chạy test để thấy xanh**

```bash
npx vitest run src/features/assets/fundHoldings.test.ts
```

Kỳ vọng: PASS, 19 bài. Đặc biệt phải xanh bài `tái tạo ĐÚNG TỪNG YÊN ba con số của app Rakuten` — nếu bài đó đỏ thì **dừng lại**, đừng sửa test cho vừa code.

- [ ] **Step 5: Kiểm lint + biên dịch**

```bash
npm run lint && npx tsc -b
```

Kỳ vọng: không lỗi.

- [ ] **Step 6: Commit**

```bash
git add src/features/assets/fundHoldings.ts src/features/assets/fundHoldings.test.ts
git commit -m "feat(quy-nhat): fundHoldings.ts — phep tinh thuan, khop tung yen voi Rakuten"
```

---

## Task 3: `parseNavCsv` — đọc CSV Shift-JIS của 投資信託協会

**Files:**
- Create: `supabase/functions/fund-refresh/navs.ts`
- Create: `supabase/functions/fund-refresh/navs.test.ts`
- Create: `supabase/functions/fund-refresh/testdata/toushin-sp500.csv` (hút thật)
- Create: `supabase/functions/fund-refresh/testdata/toushin-thieu-tham-so.txt`
- Create: `supabase/functions/fund-refresh/testdata/toushin-chi-header.csv`
- Create: `supabase/functions/fund-refresh/testdata/toushin-rong.csv`

**Interfaces:**
- Consumes: không gì (thuần).
- Produces:
  ```ts
  export interface NavUpsert {
    assoc_fund_cd: string
    nav: number
    prior_nav: number | null
    net_assets_m: number | null
    nav_date: string
  }
  export type NavParseError = 'ma-sai' | 'khong-co-dong-nao'
  export function parseNavCsv(bytes: Uint8Array, assocFundCd: string):
    { ok: true; row: NavUpsert } | { ok: false; loi: NavParseError }
  ```

- [ ] **Step 1: Hút file mẫu thật**

Chạy đúng bốn lệnh này. File `toushin-sp500.csv` phải là **byte Shift-JIS nguyên bản** — đừng mở ra sửa, đừng để editor chuyển sang UTF-8.

```bash
mkdir -p supabase/functions/fund-refresh/testdata
```

```bash
curl -s -o supabase/functions/fund-refresh/testdata/toushin-sp500.csv "https://toushin-lib.fwg.ne.jp/FdsWeb/FDST030000/csv-file-download?isinCd=JP90C000Q2U6&associFundCd=9I31223A"
```

```bash
printf '{"statusCode":null}' > supabase/functions/fund-refresh/testdata/toushin-thieu-tham-so.txt
```

```bash
head -c 200 supabase/functions/fund-refresh/testdata/toushin-sp500.csv | head -1 > supabase/functions/fund-refresh/testdata/toushin-chi-header.csv && : > supabase/functions/fund-refresh/testdata/toushin-rong.csv
```

- [ ] **Step 2: Kiểm file mẫu đúng là Shift-JIS, không phải UTF-8**

```bash
node -e "const b=require('fs').readFileSync('supabase/functions/fund-refresh/testdata/toushin-sp500.csv');console.log('byte:',b.length);console.log('shift_jis:',JSON.stringify(new TextDecoder('shift_jis').decode(b.subarray(0,40))));console.log('utf8   :',JSON.stringify(new TextDecoder('utf-8').decode(b.subarray(0,20))))"
```

Kỳ vọng: dòng `shift_jis:` đọc ra `"年月日,基準価額(円),..."`; dòng `utf8   :` ra ký tự thay thế `�`. Nếu `utf8` cũng đọc ra chữ Nhật sạch thì file đã bị chuyển mã — hút lại.

- [ ] **Step 3: Viết bài test thất bại**

`supabase/functions/fund-refresh/navs.test.ts`:

```ts
// Test cho parseNavCsv — chạy bằng vitest (Node), không cần Deno và không gọi mạng.
//
// Đọc file mẫu bằng node:fs nên file này nằm trong danh sách test của vitest gốc; nó KHÔNG
// import gì từ `npm:@supabase/supabase-js` hay `Deno.*`, chỉ import hàm thuần.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseNavCsv } from './navs'

// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager").
const HERE = fileURLToPath(new URL('.', import.meta.url))
const mau = (ten: string) => new Uint8Array(readFileSync(join(HERE, 'testdata', ten)))

const SP500 = '9I31223A'

describe('parseNavCsv', () => {
  it('đọc file Shift-JIS thật, ra phiên MỚI NHẤT', () => {
    const kq = parseNavCsv(mau('toushin-sp500.csv'), SP500)
    if (!kq.ok) throw new Error(`đáng lẽ đọc được, nhận lỗi ${kq.loi}`)
    expect(kq.row.assoc_fund_cd).toBe(SP500)
    // File mẫu hút ngày 2026-08-12; phiên mới nhất khi đó là 2026-08-10, nav 20.053.
    // Hút lại file mẫu vào ngày khác thì hai con số này đổi — nên chỉ canh HÌNH DẠNG ở
    // đây, và canh giá trị chính xác ở bài dưới bằng chuỗi tự dựng.
    expect(kq.row.nav_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(kq.row.nav).toBeGreaterThan(0)
    expect(Number.isInteger(kq.row.nav)).toBe(true)
    expect(kq.row.net_assets_m).toBeGreaterThan(0)
  })

  it('lấy dòng CUỐI làm phiên hiện tại và dòng kế cuối làm prior_nav', () => {
    const csv = sjis(
      '年月日,基準価額(円),純資産総額（百万円）,分配金,決算期\r\n' +
        '2026年08月07日,20012,1172772,,\r\n' +
        '2026年08月10日,20053,1175583,,\r\n',
    )
    const kq = parseNavCsv(csv, SP500)
    if (!kq.ok) throw new Error(`đáng lẽ đọc được, nhận lỗi ${kq.loi}`)
    expect(kq.row).toEqual({
      assoc_fund_cd: SP500,
      nav: 20_053,
      prior_nav: 20_012,
      net_assets_m: 1_175_583,
      nav_date: '2026-08-10',
    })
  })

  it('chỉ có MỘT phiên → prior_nav null, không phải 0', () => {
    const csv = sjis(
      '年月日,基準価額(円),純資産総額（百万円）,分配金,決算期\r\n2023年10月27日,9888,1,,\r\n',
    )
    const kq = parseNavCsv(csv, SP500)
    if (!kq.ok) throw new Error('đáng lẽ đọc được')
    expect(kq.row.prior_nav).toBeNull()
    expect(kq.row.nav).toBe(9_888)
    expect(kq.row.nav_date).toBe('2023-10-27')
  })

  it('body {"statusCode":null} là ma-sai, KHÔNG phải "0 dòng"', () => {
    // Bẫy: thiếu một tham số thì server trả HTTP 200 kèm đúng 19 byte JSON này. Nhận
    // bằng mã trạng thái sẽ nghĩ là thành công rồi báo "không có giá quỹ nào" — sai hẳn
    // hướng debug so với "gọi sai URL".
    expect(parseNavCsv(mau('toushin-thieu-tham-so.txt'), SP500)).toEqual({
      ok: false,
      loi: 'ma-sai',
    })
  })

  it('KHÔNG nhận nếu decode bằng UTF-8 — bài canh chống bẫy Shift-JIS', () => {
    // Server khai `charset=utf-8` nhưng file là Shift-JIS. Nếu ai đó đổi hàm này sang
    // res.text()/TextDecoder('utf-8') thì cột SỐ vẫn đúng, chỉ cột NGÀY hỏng — nghĩa là
    // nav_date sai, valued_on sai, và lỗi rất khó thấy. Bài này ép hàm phải từ chối.
    const utf8 = new TextEncoder().encode(
      '年月日,基準価額(円),純資産総額（百万円）,分配金,決算期\r\n2026年08月10日,20053,1175583,,\r\n',
    )
    expect(parseNavCsv(utf8, SP500)).toEqual({ ok: false, loi: 'ma-sai' })
  })

  it('file rỗng / chỉ có header → khong-co-dong-nao, không nổ', () => {
    expect(parseNavCsv(mau('toushin-rong.csv'), SP500)).toEqual({
      ok: false,
      loi: 'ma-sai',
    })
    expect(parseNavCsv(mau('toushin-chi-header.csv'), SP500)).toEqual({
      ok: false,
      loi: 'khong-co-dong-nao',
    })
  })

  it('bỏ dòng có nav không phải số dương, lấy dòng hợp lệ cuối cùng', () => {
    const csv = sjis(
      '年月日,基準価額(円),純資産総額（百万円）,分配金,決算期\r\n' +
        '2026年08月07日,20012,1172772,,\r\n' +
        '2026年08月10日,0,1175583,,\r\n' +
        '2026年08月11日,,1175583,,\r\n',
    )
    const kq = parseNavCsv(csv, SP500)
    if (!kq.ok) throw new Error('đáng lẽ đọc được')
    expect(kq.row.nav).toBe(20_012)
    expect(kq.row.nav_date).toBe('2026-08-07')
    expect(kq.row.prior_nav).toBeNull()
  })

  it('ngày hỏng → bỏ dòng đó, KHÔNG rơi về new Date()', () => {
    const csv = sjis(
      '年月日,基準価額(円),純資産総額（百万円）,分配金,決算期\r\n' +
        '2026年08月07日,20012,1172772,,\r\n' +
        'hôm nay,20053,1175583,,\r\n',
    )
    const kq = parseNavCsv(csv, SP500)
    if (!kq.ok) throw new Error('đáng lẽ đọc được')
    expect(kq.row.nav_date).toBe('2026-08-07')
  })

  it('cột 純資産総額 thiếu hoặc hỏng → net_assets_m null, hàng giá vẫn giữ', () => {
    const csv = sjis('年月日,基準価額(円)\r\n2026年08月10日,20053\r\n')
    const kq = parseNavCsv(csv, SP500)
    if (!kq.ok) throw new Error('đáng lẽ đọc được')
    expect(kq.row.nav).toBe(20_053)
    expect(kq.row.net_assets_m).toBeNull()
  })
})

/** Chuỗi UTF-16 của JS → byte Shift-JIS, để dựng file mẫu ngay trong test. */
function sjis(s: string): Uint8Array {
  // Node không có TextEncoder cho Shift-JIS (chỉ TextDecoder), nên mã hoá tay qua bảng
  // tra ngược dựng từ chính TextDecoder: đủ dùng vì bộ ký tự trong test rất nhỏ.
  const dec = new TextDecoder('shift_jis')
  const bang = new Map<string, number[]>()
  for (let hi = 0x81; hi <= 0xef; hi++) {
    for (let lo = 0x40; lo <= 0xfc; lo++) {
      const ky = dec.decode(new Uint8Array([hi, lo]))
      if (ky.length === 1 && !bang.has(ky)) bang.set(ky, [hi, lo])
    }
  }
  const out: number[] = []
  for (const ch of s) {
    const code = ch.codePointAt(0) as number
    if (code < 0x80) out.push(code)
    else {
      const cap = bang.get(ch)
      if (!cap) throw new Error(`không mã hoá được ký tự ${ch} sang Shift-JIS`)
      out.push(...cap)
    }
  }
  return new Uint8Array(out)
}
```

- [ ] **Step 4: Chạy test để thấy nó đỏ**

```bash
npx vitest run supabase/functions/fund-refresh/navs.test.ts
```

Kỳ vọng: FAIL — `Failed to resolve import "./navs"`.

> Nếu vitest **không nhặt** file này (nằm ngoài `src/`), mở `vite.config.ts` / `vitest.config.ts` và thêm `supabase/functions/**/*.test.ts` vào `test.include`. Kiểm bằng cách chạy lại lệnh trên và thấy nó báo lỗi import thay vì "No test files found".

- [ ] **Step 5: Viết `navs.ts` — chỉ phần `parseNavCsv`**

```ts
// Hút 基準価額 quỹ đầu tư Nhật từ thư viện tra cứu của 投資信託協会.
//
// Endpoint (đo thật 2026-08-12, gọi bằng curl):
//   https://toushin-lib.fwg.ne.jp/FdsWeb/FDST030000/csv-file-download
//     ?isinCd=<ISIN>&associFundCd=<協会コード>
// Miễn phí, không khoá, không đăng nhập. Trả CSV đủ lịch sử từ ngày lập quỹ.
//
// BỐN CÁI BẪY, cả bốn đều thuộc loại "trông như chạy đúng":
//
// ① File là Shift-JIS, NHƯNG server khai `Content-Type: text/plain; charset=utf-8`.
//    Đọc bằng res.text() thì cột SỐ vẫn đúng, chỉ cột NGÀY và tên ra rác — nên phép tính
//    tiền vẫn ra số trông hợp lý, chỉ có nav_date sai, và từ đó valued_on sai. Vì vậy
//    parseNavCsv nhận `Uint8Array` chứ không nhận string: việc giải mã nằm TRONG hàm để
//    bài test bắt được nếu ai đó đổi sang UTF-8.
//    Nhãn phải là 'shift_jis' — 'cp932' KHÔNG được Node hỗ trợ (đã đo).
//
// ② Thiếu một trong hai tham số → HTTP **200** kèm body `{"statusCode":null}` (19 byte),
//    không phải CSV. Cả hai mã sai → 500 kèm cùng body. Nên điều kiện nhận là DÒNG ĐẦU
//    decode ra đúng `年月日`, không phải res.ok.
//
// ③ Không có header CORS → trình duyệt của app không gọi thẳng được, bắt buộc qua edge
//    function. Giống Yahoo và SSI; đừng mất một lượt đi thử lại.
//
// ④ Endpoint chỉ nhận MỘT quỹ mỗi lần — không có dạng gọi nhiều mã như Yahoo spark.
//
// parseNavCsv tách khỏi fetchFundNavs để test bằng file mẫu, không cần mạng lẫn Deno.
// Xem thêm: docs/quy-nhat.md

/** Một hàng để upsert vào `fund_prices`. */
export interface NavUpsert {
  assoc_fund_cd: string
  /** ¥/10.000口; luôn > 0 */
  nav: number
  /** phiên trước; null = CSV chỉ có một phiên hợp lệ */
  prior_nav: number | null
  /** 純資産総額, TRIỆU yên; null = cột thiếu/hỏng. KHÔNG dùng để tính tiền. */
  net_assets_m: number | null
  /** ngày PHIÊN của giá, ISO date */
  nav_date: string
}

export type NavParseError =
  /** Không phải CSV giá — mã sai, thiếu tham số, hoặc giải mã sai (xem bẫy ① và ②). */
  | 'ma-sai'
  /** Đúng là CSV giá nhưng không có dòng dữ liệu nào hợp lệ. */
  | 'khong-co-dong-nao'

export type NavParseResult =
  | { ok: true; row: NavUpsert }
  | { ok: false; loi: NavParseError }

/** Dòng header của file giá, sau khi decode đúng. Là trọng tài duy nhất — xem bẫy ②. */
const COT_NGAY = '年月日'

/** `2026年08月10日` → `2026-08-10`; null nếu không đúng dạng. */
function ngayNhatSangISO(s: string): string | null {
  const m = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(s.trim())
  if (!m) return null
  const [, y, thang, ngay] = m
  return `${y}-${thang.padStart(2, '0')}-${ngay.padStart(2, '0')}`
}

/** '1,175,583' → 1175583; null nếu không phải số hữu hạn > 0. */
function soDuong(s: string | undefined): number | null {
  if (s == null) return null
  const v = Number(s.replace(/,/g, '').trim())
  return Number.isFinite(v) && v > 0 ? Math.round(v) : null
}

/**
 * Byte CSV của 投信協会 → một hàng `fund_prices` cho phiên MỚI NHẤT.
 *
 * Nhận `Uint8Array` chứ không nhận string là CỐ Ý — xem bẫy ① ở đầu file.
 *
 * `nav_date` parse từ chuỗi `2026年08月10日` bằng regex, **không** đưa qua `new Date()`:
 * chuỗi đó đã là ngày phiên theo giờ Nhật, cho `Date` xử lý là mời một lỗi múi giờ. Dòng
 * nào có ngày hỏng hoặc nav không phải số dương thì BỎ dòng đó — cột `nav` có
 * `check (nav > 0)` và cột `nav_date` là `not null`.
 */
export function parseNavCsv(bytes: Uint8Array, assocFundCd: string): NavParseResult {
  // 'shift_jis': nhãn duy nhất dùng trong repo này. Deno và Node (ICU đầy đủ) đều nhận.
  const text = new TextDecoder('shift_jis').decode(bytes)
  const dong = text.split(/\r?\n/)

  // Trọng tài: dòng đầu phải chứa 年月日. Body {"statusCode":null}, trang HTML lỗi, hay
  // một lần giải mã sai đều rơi vào đây.
  if (!dong[0] || !dong[0].includes(COT_NGAY)) return { ok: false, loi: 'ma-sai' }

  // Gom mọi dòng HỢP LỆ, giữ nguyên thứ tự file (cũ → mới). Không giả định file luôn
  // được sắp: lấy hai dòng hợp lệ cuối theo đúng thứ tự xuất hiện.
  const hopLe: { navDate: string; nav: number; netAssetsM: number | null }[] = []
  for (const raw of dong.slice(1)) {
    if (!raw.trim()) continue
    const o = raw.split(',')
    const navDate = ngayNhatSangISO(o[0] ?? '')
    if (navDate === null) continue
    const nav = soDuong(o[1])
    if (nav === null) continue
    hopLe.push({ navDate, nav, netAssetsM: soDuong(o[2]) })
  }

  if (hopLe.length === 0) return { ok: false, loi: 'khong-co-dong-nao' }

  const cuoi = hopLe[hopLe.length - 1]
  const keCuoi = hopLe.length >= 2 ? hopLe[hopLe.length - 2] : null

  return {
    ok: true,
    row: {
      assoc_fund_cd: assocFundCd,
      nav: cuoi.nav,
      prior_nav: keCuoi?.nav ?? null,
      net_assets_m: cuoi.netAssetsM,
      nav_date: cuoi.navDate,
    },
  }
}
```

- [ ] **Step 6: Chạy test để thấy xanh**

```bash
npx vitest run supabase/functions/fund-refresh/navs.test.ts
```

Kỳ vọng: PASS, 10 bài.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/fund-refresh/navs.ts supabase/functions/fund-refresh/navs.test.ts supabase/functions/fund-refresh/testdata
git commit -m "feat(quy-nhat): parseNavCsv — doc CSV Shift-JIS cua 投信協会, chan 4 bay"
```

---

## Task 4: `fetchFundNavs` — gọi mạng, thứ tự ưu tiên, ngân sách thời gian

**Files:**
- Modify: `supabase/functions/fund-refresh/navs.ts` (nối vào cuối)
- Modify: `supabase/functions/fund-refresh/navs.test.ts` (nối `describe` mới)

**Interfaces:**
- Consumes: `parseNavCsv`, `NavUpsert`, `NavParseError` từ Task 3.
- Produces:
  ```ts
  export interface FundRef { assocFundCd: string; isinCd: string }
  export interface NavFetchResult {
    rows: NavUpsert[]
    /** assocFundCd → lý do, để index.ts ghi `funds.last_status` */
    trangThai: Map<string, 'ok' | 'ma-sai' | 'loi-mang'>
    errors: string[]
    hetNganSach: boolean
  }
  export function buildFundFetchOrder(held: string[], all: FundRef[]): FundRef[]
  export function fetchFundNavs(
    funds: FundRef[],
    opts?: { budgetMs?: number; now?: () => number; fetchImpl?: typeof fetch },
  ): Promise<NavFetchResult>
  ```

- [ ] **Step 1: Viết bài test thất bại (nối vào `navs.test.ts`)**

Thêm vào cuối file, và thêm `buildFundFetchOrder, fetchFundNavs` vào dòng `import { parseNavCsv } from './navs'`:

```ts
describe('buildFundFetchOrder', () => {
  const A = { assocFundCd: 'A', isinCd: 'JP-A' }
  const B = { assocFundCd: 'B', isinCd: 'JP-B' }
  const C = { assocFundCd: 'C', isinCd: 'JP-C' }

  it('quỹ đang giữ xếp TRƯỚC, phần còn lại của danh bạ xếp sau, không trùng', () => {
    // Vì sao thứ tự quan trọng: mỗi quỹ là một cuộc gọi riêng (endpoint không nhận nhiều
    // quỹ một lần). Hết ngân sách giữa chừng thì quỹ gọi SAU là quỹ thiếu giá — không thể
    // để quỹ người dùng thực sự giữ may rủi theo thứ tự danh bạ.
    expect(buildFundFetchOrder(['C'], [A, B, C])).toEqual([C, A, B])
  })

  it('không giữ gì → giữ nguyên thứ tự danh bạ', () => {
    expect(buildFundFetchOrder([], [A, B])).toEqual([A, B])
  })

  it('giữ một mã KHÔNG có trong danh bạ → bỏ qua, không bịa ISIN', () => {
    // Khác cổ phiếu (buildFetchOrder vẫn xếp mã lạ lên đầu vì Yahoo tự bỏ qua mã nó không
    // biết). Ở đây phải có ISIN mới gọi được, nên mã không có trong `funds` là không gọi
    // được — FK của fund_trades đã chặn ca này, nhưng đừng để hàm tự nổ nếu nó xảy ra.
    expect(buildFundFetchOrder(['Z'], [A])).toEqual([A])
  })

  it('mã giữ trùng nhau chỉ xuất hiện một lần', () => {
    expect(buildFundFetchOrder(['B', 'B'], [A, B])).toEqual([B, A])
  })
})

describe('fetchFundNavs', () => {
  const CSV_OK = (nav: number, ngay: string) =>
    sjis(`年月日,基準価額(円),純資産総額（百万円）,分配金,決算期\r\n${ngay},${nav},1000,,\r\n`)

  /** fetch giả: trả body theo assocFundCd đọc từ query string. */
  function fetchGia(
    theoMa: Record<string, { status?: number; body?: Uint8Array; nem?: string }>,
  ): typeof fetch {
    return (async (url: string) => {
      const ma = new URL(url).searchParams.get('associFundCd') ?? ''
      const cai = theoMa[ma]
      if (!cai) throw new Error(`test chưa dựng phản hồi cho ${ma}`)
      if (cai.nem) throw new Error(cai.nem)
      return {
        ok: (cai.status ?? 200) < 400,
        status: cai.status ?? 200,
        arrayBuffer: async () => (cai.body ?? new Uint8Array()).buffer,
      }
    }) as unknown as typeof fetch
  }

  it('hút được nhiều quỹ, mỗi quỹ một hàng, trạng thái ok', async () => {
    const kq = await fetchFundNavs(
      [
        { assocFundCd: 'A', isinCd: 'JP-A' },
        { assocFundCd: 'B', isinCd: 'JP-B' },
      ],
      {
        fetchImpl: fetchGia({
          A: { body: CSV_OK(20_053, '2026年08月10日') },
          B: { body: CSV_OK(18_855, '2026年08月10日') },
        }),
      },
    )
    expect(kq.rows.map((r) => [r.assoc_fund_cd, r.nav])).toEqual([
      ['A', 20_053],
      ['B', 18_855],
    ])
    expect(kq.trangThai.get('A')).toBe('ok')
    expect(kq.errors).toEqual([])
    expect(kq.hetNganSach).toBe(false)
  })

  it('một quỹ mã sai KHÔNG kéo mất quỹ khác; trạng thái ghi ma-sai', async () => {
    const kq = await fetchFundNavs(
      [
        { assocFundCd: 'A', isinCd: 'JP-A' },
        { assocFundCd: 'B', isinCd: 'JP-B' },
      ],
      {
        fetchImpl: fetchGia({
          A: { body: new TextEncoder().encode('{"statusCode":null}') },
          B: { body: CSV_OK(18_855, '2026年08月10日') },
        }),
      },
    )
    expect(kq.rows.map((r) => r.assoc_fund_cd)).toEqual(['B'])
    expect(kq.trangThai.get('A')).toBe('ma-sai')
    expect(kq.trangThai.get('B')).toBe('ok')
    expect(kq.errors.join(' ')).toContain('A')
  })

  it('HTTP 500 → loi-mang, không phải ma-sai', async () => {
    // Phân biệt được hai chuyện: mã sai thì sửa mã, mạng lỗi thì đợi lượt sau.
    const kq = await fetchFundNavs([{ assocFundCd: 'A', isinCd: 'JP-A' }], {
      fetchImpl: fetchGia({ A: { status: 500, body: new Uint8Array() } }),
    })
    expect(kq.rows).toEqual([])
    expect(kq.trangThai.get('A')).toBe('loi-mang')
    expect(kq.errors.join(' ')).toContain('HTTP 500')
  })

  it('fetch ném lỗi (mạng đứt) → loi-mang, cả lượt không chết', async () => {
    const kq = await fetchFundNavs(
      [
        { assocFundCd: 'A', isinCd: 'JP-A' },
        { assocFundCd: 'B', isinCd: 'JP-B' },
      ],
      {
        fetchImpl: fetchGia({
          A: { nem: 'mang dut' },
          B: { body: CSV_OK(18_855, '2026年08月10日') },
        }),
      },
    )
    expect(kq.trangThai.get('A')).toBe('loi-mang')
    expect(kq.rows.map((r) => r.assoc_fund_cd)).toEqual(['B'])
  })

  it('hết ngân sách thời gian → DỪNG SẠCH trước quỹ tiếp theo, báo hetNganSach', async () => {
    // Đồng hồ giả nhảy 40s mỗi lần đọc: quỹ đầu gọi được, quỹ thứ hai thì hết ngân sách.
    let t = 0
    const kq = await fetchFundNavs(
      [
        { assocFundCd: 'A', isinCd: 'JP-A' },
        { assocFundCd: 'B', isinCd: 'JP-B' },
      ],
      {
        budgetMs: 30_000,
        now: () => (t += 40_000),
        fetchImpl: fetchGia({ A: { body: CSV_OK(20_053, '2026年08月10日') } }),
      },
    )
    expect(kq.hetNganSach).toBe(true)
    expect(kq.rows.map((r) => r.assoc_fund_cd)).toEqual(['A'])
    // Quỹ chưa kịp gọi KHÔNG được ghi trạng thái: 'ma-sai' cho nó là vu oan.
    expect(kq.trangThai.has('B')).toBe(false)
    expect(kq.errors.join(' ')).toContain('hết ngân sách')
  })

  it('URL gọi có ĐỦ hai tham số — thiếu một cái là rơi vào bẫy ②', async () => {
    const daGoi: string[] = []
    const ghiLai = (async (url: string) => {
      daGoi.push(url)
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => CSV_OK(1, '2026年08月10日').buffer,
      }
    }) as unknown as typeof fetch
    await fetchFundNavs([{ assocFundCd: '9I31223A', isinCd: 'JP90C000Q2U6' }], {
      fetchImpl: ghiLai,
    })
    expect(daGoi[0]).toContain('isinCd=JP90C000Q2U6')
    expect(daGoi[0]).toContain('associFundCd=9I31223A')
  })
})
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

```bash
npx vitest run supabase/functions/fund-refresh/navs.test.ts
```

Kỳ vọng: FAIL — `buildFundFetchOrder is not a function` (hoặc lỗi import).

- [ ] **Step 3: Nối phần gọi mạng vào cuối `navs.ts`**

```ts
const CSV_URL = 'https://toushin-lib.fwg.ne.jp/FdsWeb/FDST030000/csv-file-download'

// Ngân sách cho CẢ khối hút giá (mọi quỹ cộng lại), không phải cho một quỹ. Danh bạ dự
// kiến vài quỹ chứ không phải vài trăm, nhưng edge function có giới hạn wall-clock và
// nguồn chậm/treo giữa chừng vẫn có thể xảy ra. Hết ngân sách thì DỪNG SẠCH (không gọi
// thêm quỹ nào) và báo thật đã hút được bao nhiêu, thay vì để cả invocation chết.
const FETCH_BUDGET_MS = 60_000

// Không giả dạng bot: nhiều hạ tầng chặn thẳng User-Agent tự xưng bot. Cùng lý do với
// stock-refresh/prices.ts.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** Một quỹ trong danh bạ. Cần CẢ hai mã mới gọi được — xem bẫy ②. */
export interface FundRef {
  assocFundCd: string
  isinCd: string
}

export interface NavFetchResult {
  rows: NavUpsert[]
  /**
   * assocFundCd → kết quả, để `index.ts` ghi vào `funds.last_status`. Quỹ CHƯA KỊP GỌI
   * (hết ngân sách) cố ý KHÔNG có mặt: đánh dấu 'ma-sai' cho nó là vu oan, và lượt sau
   * nó được gọi trước nhờ buildFundFetchOrder.
   */
  trangThai: Map<string, 'ok' | 'ma-sai' | 'loi-mang'>
  /** Lỗi của TỪNG quỹ — quỹ khác vẫn có mặt trong `rows`, không mất theo. */
  errors: string[]
  /** true nếu dừng giữa chừng vì hết FETCH_BUDGET_MS — KHÁC "một quỹ bị lỗi". */
  hetNganSach: boolean
}

/**
 * Thứ tự hút: quỹ ĐANG giữ trước, phần còn lại của danh bạ sau.
 *
 * Mỗi quỹ là một cuộc gọi riêng (endpoint không nhận nhiều quỹ một lần), nên hết ngân
 * sách giữa chừng thì quỹ gọi SAU là quỹ thiếu giá. Quỹ người dùng thực sự đang giữ mới
 * là quỹ cần có giá hôm nay — không để nó may rủi theo thứ tự danh bạ.
 *
 * Mã giữ mà KHÔNG có trong danh bạ thì bỏ qua: khác cổ phiếu (Yahoo tự bỏ qua mã lạ nên
 * hút thử vẫn rẻ), ở đây không có ISIN thì không gọi được gì cả. FK của `fund_trades` đã
 * chặn ca này ở DB, nhưng hàm vẫn không được nổ nếu nó xảy ra.
 */
export function buildFundFetchOrder(held: string[], all: FundRef[]): FundRef[] {
  const theoMa = new Map(all.map((f) => [f.assocFundCd, f]))
  const truoc: FundRef[] = []
  const daXep = new Set<string>()
  for (const ma of held) {
    const f = theoMa.get(ma)
    if (f && !daXep.has(ma)) {
      daXep.add(ma)
      truoc.push(f)
    }
  }
  return [...truoc, ...all.filter((f) => !daXep.has(f.assocFundCd))]
}

/** Tuỳ chọn cho fetchFundNavs — chỉ để test (đồng hồ giả, fetch giả, ngân sách giả). */
interface FetchNavOptions {
  /** Mặc định FETCH_BUDGET_MS (60s). */
  budgetMs?: number
  /** Mặc định Date.now — tiêm vào để canh mốc thời gian mà không sleep thật. */
  now?: () => number
  /** Mặc định fetch toàn cục. */
  fetchImpl?: typeof fetch
}

/**
 * Gọi CSV cho từng quỹ trong danh sách, theo đúng thứ tự đã truyền vào (dùng
 * `buildFundFetchOrder` để dựng thứ tự đó). Một quỹ lỗi bị bắt riêng và góp vào `errors`;
 * không throw làm mất luôn những quỹ đã hút được.
 *
 * Đọc `arrayBuffer()` chứ KHÔNG `text()`: file là Shift-JIS trong khi server khai UTF-8 —
 * xem bẫy ① ở đầu file. Việc giải mã nằm trong parseNavCsv.
 */
export async function fetchFundNavs(
  funds: FundRef[],
  opts: FetchNavOptions = {},
): Promise<NavFetchResult> {
  const budgetMs = opts.budgetMs ?? FETCH_BUDGET_MS
  const now = opts.now ?? Date.now
  const goi = opts.fetchImpl ?? fetch

  const rows: NavUpsert[] = []
  const trangThai = new Map<string, 'ok' | 'ma-sai' | 'loi-mang'>()
  const errors: string[] = []
  const start = now()
  let hetNganSach = false
  let soQuyDaGoi = 0

  for (const f of funds) {
    if (now() - start >= budgetMs) {
      hetNganSach = true
      break
    }

    // Cả hai tham số, luôn luôn. Thiếu một cái thì server trả 200 kèm 19 byte JSON và
    // parseNavCsv sẽ báo 'ma-sai' — đúng nhưng đi sai hướng debug.
    const url =
      `${CSV_URL}?isinCd=${encodeURIComponent(f.isinCd)}` +
      `&associFundCd=${encodeURIComponent(f.assocFundCd)}`
    try {
      const res = await goi(url, { headers: { 'User-Agent': BROWSER_UA } })
      if (!res.ok) throw new Error(`toushin: HTTP ${res.status} (${f.assocFundCd})`)
      const kq = parseNavCsv(new Uint8Array(await res.arrayBuffer()), f.assocFundCd)
      if (kq.ok) {
        rows.push(kq.row)
        trangThai.set(f.assocFundCd, 'ok')
      } else {
        trangThai.set(f.assocFundCd, 'ma-sai')
        errors.push(`${f.assocFundCd}: ${kq.loi}`)
      }
    } catch (err) {
      trangThai.set(f.assocFundCd, 'loi-mang')
      errors.push(`${f.assocFundCd}: ${err instanceof Error ? err.message : String(err)}`)
    }
    soQuyDaGoi++
  }

  if (hetNganSach) {
    errors.push(
      `hết ngân sách thời gian hút giá sau ${soQuyDaGoi}/${funds.length} quỹ (đã hút ${rows.length} quỹ)`,
    )
  }

  return { rows, trangThai, errors, hetNganSach }
}
```

- [ ] **Step 4: Chạy test để thấy xanh**

```bash
npx vitest run supabase/functions/fund-refresh/navs.test.ts
```

Kỳ vọng: PASS, 20 bài (10 của Task 3 + 10 mới).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/fund-refresh/navs.ts supabase/functions/fund-refresh/navs.test.ts
git commit -m "feat(quy-nhat): fetchFundNavs — uu tien quy dang giu, ngan sach thoi gian"
```

---

## Task 5: `serverBundleFunds.ts` + bundle sang Deno

**Files:**
- Create: `src/features/assets/serverBundleFunds.ts`
- Modify: `scripts/bundle-rules.mjs:23-32` (thêm mục thứ ba vào `BUNDLES`)
- Modify: `tests/pushBundle.test.ts:26-49` (thêm mục vào `EXPORTS_BAT_BUOC`)
- Create (do script sinh): `supabase/functions/fund-refresh/_funds.js`

**Interfaces:**
- Consumes: `fundHoldingsFromTrades`, `sessionNavs`, `fundValue`, `NAV_UNITS` từ Task 2.
- Produces: `supabase/functions/fund-refresh/_funds.js` xuất đúng bốn tên trên + `toISODate`.

- [ ] **Step 1: Sửa `tests/pushBundle.test.ts` trước (test đỏ trước)**

Thêm mục thứ ba vào `EXPORTS_BAT_BUOC`, ngay sau mục `stock-refresh/_holdings.js`:

```ts
  'supabase/functions/fund-refresh/_funds.js': [
    'fundHoldingsFromTrades',
    'sessionNavs',
    'fundValue',
    'NAV_UNITS',
    'toISODate',
  ],
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

```bash
npx vitest run tests/pushBundle.test.ts
```

Kỳ vọng: FAIL — `ENOENT` cho `supabase/functions/fund-refresh/_funds.js`.

- [ ] **Step 3: Viết `serverBundleFunds.ts`**

```ts
// Mặt tiếp xúc DUY NHẤT giữa app và edge function fund-refresh.
//
// File RIÊNG, không dùng chung serverBundle.ts của stock-refresh: bundle đó kéo theo
// HOSE_SYMBOLS (403 mã, ~20 KB) mà fund-refresh không bao giờ dùng. Hai mặt tiếp xúc
// riêng cũng làm giao kèo của từng function rõ ra — đọc file này là biết fund-refresh
// được phép gọi những gì.
//
// Cùng lý do như serverBundle.ts: Deno đòi import tương đối có đuôi `.ts`, cả repo này
// viết không đuôi, nên scripts/bundle-rules.mjs gom file này thành một file JS phẳng.
//
// Danh sách xuất ở đây = giao kèo. Chỉ xuất thứ THUẦN — không formatMoney (đọc trạng thái
// riêng tư toàn cục), không hook, không gì kéo theo React hay localStorage.

export { fundHoldingsFromTrades, fundValue, sessionNavs, NAV_UNITS } from './fundHoldings'
export type {
  FundHolding,
  FundHoldingsResult,
  FundTrade,
  FundValue,
  SessionNavs,
} from './fundHoldings'

// Ngày tháng: bắt buộc đi qua đây, không tự cộng trừ ngày ở edge function.
export { toISODate } from '../../lib/dates'
```

- [ ] **Step 4: Thêm mục vào `BUNDLES`**

Trong `scripts/bundle-rules.mjs`, thêm vào cuối mảng `BUNDLES` (sau mục `stock-refresh`):

```js
  {
    entry: 'src/features/assets/serverBundleFunds.ts',
    outfile: 'supabase/functions/fund-refresh/_funds.js',
  },
```

- [ ] **Step 5: Sinh bundle**

```bash
npm run bundle:rules
```

Kỳ vọng: in ba dòng `Đã gói ...`, dòng cuối là `src/features/assets/serverBundleFunds.ts → supabase/functions/fund-refresh/_funds.js`.

- [ ] **Step 6: Chạy test để thấy xanh**

```bash
npx vitest run tests/pushBundle.test.ts
```

Kỳ vọng: PASS, 3 bài. Bài "KHÔNG kéo theo thứ của trình duyệt hay của Node" cũng phải xanh — nếu đỏ thì `fundHoldings.ts` đã vô tình import cái gì đó không thuần.

- [ ] **Step 7: Commit**

```bash
git add src/features/assets/serverBundleFunds.ts scripts/bundle-rules.mjs tests/pushBundle.test.ts supabase/functions/fund-refresh/_funds.js
git commit -m "feat(quy-nhat): serverBundleFunds — mot nguon phep tinh cho ca app va cron"
```

---

## Task 6: Tầng dữ liệu — types, repo, hai bản cài, hook

**Files:**
- Modify: `src/types/database.types.ts` (thêm 4 Row type + 4 mục `Tables`)
- Modify: `src/data/repo.ts` (thêm `NewFundTrade`, `FundTradePatch`, 6 method vào `interface Repo`)
- Modify: `src/data/index.ts` (xuất thêm hai kiểu)
- Modify: `src/data/supabaseRepo.ts` (cài 6 method + chặn xoá tài khoản còn sổ lệnh quỹ)
- Modify: `src/data/demoRepo.ts` (bump `STORAGE_KEY`, `DemoDb`, seed, cài 6 method)
- Modify: `src/hooks/queries.ts` (3 query hook + 3 mutation hook)
- Test: `src/data/fundTrades.test.ts`

**Interfaces:**
- Consumes: bảng của Task 1.
- Produces:
  ```ts
  // database.types.ts
  export type FundRow = { assoc_fund_cd: string; isin_cd: string; name: string
    last_status: 'chua-kiem' | 'ok' | 'ma-sai' | 'loi-mang'
    last_checked_at: string | null; created_at: string }
  export type FundAliasRow = { statement_name: string; assoc_fund_cd: string }
  export type FundPriceRow = { assoc_fund_cd: string; nav: number; prior_nav: number | null
    net_assets_m: number | null; nav_date: string; updated_at: string }
  export type FundTradeKind = 'buy' | 'sell' | 'adjust'
  export type FundTradeRow = { id: string; user_id: string; account_id: string
    assoc_fund_cd: string; kind: FundTradeKind; traded_on: string; units: number
    nav: number; amount: number; bucket: string; note: string
    created_at: string; updated_at: string }
  // repo.ts
  export interface NewFundTrade { account_id: string; assoc_fund_cd: string
    kind: FundTradeKind; traded_on: string; units: number; nav: number
    amount: number; bucket: string; note: string }
  export type FundTradePatch = Partial<Omit<NewFundTrade, 'account_id'>>
  // interface Repo
  getFunds(): Promise<FundRow[]>
  getFundPrices(): Promise<FundPriceRow[]>
  getFundTrades(): Promise<FundTradeRow[]>
  createFundTrade(input: NewFundTrade): Promise<FundTradeRow>
  updateFundTrade(id: string, patch: FundTradePatch): Promise<FundTradeRow>
  deleteFundTrade(id: string): Promise<void>
  // queries.ts
  useFunds() useFundPrices() useFundTrades()
  useCreateFundTrade() useUpdateFundTrade() useDeleteFundTrade()
  ```

- [ ] **Step 1: Viết bài test thất bại**

`src/data/fundTrades.test.ts`:

```ts
// Sổ lệnh quỹ ở demoRepo: soi hình dạng theo `kind` y như CHECK fund_trades_shape của
// Postgres (migration 0045). Bản demo là chỗ DUY NHẤT bắt được lỗi hình dạng trước khi nó
// thành một câu INSERT bị 23514 ở production.
import { beforeEach, describe, expect, it } from 'vitest'
import { demoRepo } from './demoRepo'

// Tài khoản đầu tư JPY có sẵn trong dữ liệu demo — lấy động, không viết cứng id.
async function taiKhoanQuyJPY(): Promise<string> {
  const accs = await demoRepo.getAccounts()
  const a = accs.find((x) => x.type === 'investment' && x.currency === 'JPY')
  if (!a) throw new Error('dữ liệu demo thiếu tài khoản đầu tư JPY')
  return a.id
}

const SP500 = '9I31223A'

describe('demoRepo — sổ lệnh quỹ', () => {
  beforeEach(() => localStorage.clear())

  it('danh bạ quỹ demo có đủ hai quỹ Rakuten và bảng giá kèm theo', async () => {
    const funds = await demoRepo.getFunds()
    expect(funds.map((f) => f.assoc_fund_cd)).toContain(SP500)
    const prices = await demoRepo.getFundPrices()
    expect(prices.find((p) => p.assoc_fund_cd === SP500)?.nav).toBeGreaterThan(0)
  })

  it('ghi lệnh mua rồi đọc lại được', async () => {
    const account_id = await taiKhoanQuyJPY()
    const row = await demoRepo.createFundTrade({
      account_id,
      assoc_fund_cd: SP500,
      kind: 'buy',
      traded_on: '2026-04-09',
      units: 28_429,
      nav: 17_588,
      amount: 50_000,
      bucket: 'NISAつみたて投資枠',
      note: '',
    })
    expect(row.units).toBe(28_429)
    expect(row.amount).toBe(50_000)
    const all = await demoRepo.getFundTrades()
    expect(all.some((t) => t.id === row.id)).toBe(true)
  })

  it('lệnh mua có amount = 0 bị từ chối (CHECK fund_trades_shape)', async () => {
    const account_id = await taiKhoanQuyJPY()
    await expect(
      demoRepo.createFundTrade({
        account_id,
        assoc_fund_cd: SP500,
        kind: 'buy',
        traded_on: '2026-04-09',
        units: 100,
        nav: 17_588,
        amount: 0,
        bucket: '',
        note: '',
      }),
    ).rejects.toThrow()
  })

  it('lệnh adjust phải có nav = 0 và amount = 0, units khác 0', async () => {
    const account_id = await taiKhoanQuyJPY()
    // Hợp lệ: 分配金再投資.
    await expect(
      demoRepo.createFundTrade({
        account_id,
        assoc_fund_cd: SP500,
        kind: 'adjust',
        traded_on: '2026-05-01',
        units: 1_000,
        nav: 0,
        amount: 0,
        bucket: '',
        note: '',
      }),
    ).resolves.toBeTruthy()
    // Không hợp lệ: adjust mà có nav.
    await expect(
      demoRepo.createFundTrade({
        account_id,
        assoc_fund_cd: SP500,
        kind: 'adjust',
        traded_on: '2026-05-01',
        units: 1_000,
        nav: 17_588,
        amount: 0,
        bucket: '',
        note: '',
      }),
    ).rejects.toThrow()
  })

  it('sửa lệnh soi hình dạng SAU khi trộn patch, không chỉ lúc tạo', async () => {
    const account_id = await taiKhoanQuyJPY()
    const row = await demoRepo.createFundTrade({
      account_id,
      assoc_fund_cd: SP500,
      kind: 'buy',
      traded_on: '2026-04-09',
      units: 100,
      nav: 17_588,
      amount: 50_000,
      bucket: '',
      note: '',
    })
    // Đổi sang 'adjust' mà không dọn nav/amount → phải đỏ, y như Postgres soi dòng kết quả.
    await expect(demoRepo.updateFundTrade(row.id, { kind: 'adjust' })).rejects.toThrow()
    // Đổi sang 'adjust' kèm dọn sạch thì được.
    await expect(
      demoRepo.updateFundTrade(row.id, { kind: 'adjust', nav: 0, amount: 0 }),
    ).resolves.toBeTruthy()
  })

  it('xoá lệnh thì nó biến khỏi danh sách', async () => {
    const account_id = await taiKhoanQuyJPY()
    const row = await demoRepo.createFundTrade({
      account_id,
      assoc_fund_cd: SP500,
      kind: 'buy',
      traded_on: '2026-04-09',
      units: 100,
      nav: 17_588,
      amount: 1_000,
      bucket: '',
      note: '',
    })
    await demoRepo.deleteFundTrade(row.id)
    expect((await demoRepo.getFundTrades()).some((t) => t.id === row.id)).toBe(false)
  })

  it('KHÔNG xoá được tài khoản còn sổ lệnh quỹ', async () => {
    // fund_trades có `on delete cascade` ở DB — không chặn ở tầng repo thì xoá tài khoản
    // là XOÁ LUÔN sổ lệnh mà không ai hỏi, ngược hẳn với mọi bảng khác.
    const account_id = await taiKhoanQuyJPY()
    await demoRepo.createFundTrade({
      account_id,
      assoc_fund_cd: SP500,
      kind: 'buy',
      traded_on: '2026-04-09',
      units: 100,
      nav: 17_588,
      amount: 1_000,
      bucket: '',
      note: '',
    })
    await expect(demoRepo.deleteAccount(account_id)).rejects.toThrow(/sổ lệnh quỹ/)
  })
})
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

```bash
npx vitest run src/data/fundTrades.test.ts
```

Kỳ vọng: FAIL — `demoRepo.getFunds is not a function`.

- [ ] **Step 3: Thêm bốn Row type vào `src/types/database.types.ts`**

Chèn ngay **sau** khối `StockTradeRow` (kết thúc ở dòng 347):

```ts
/** Danh bạ quỹ đầu tư Nhật (công khai, không thuộc user nào) — migration 0045. */
export type FundRow = {
  /** 協会コード, vd '9I31223A' */
  assoc_fund_cd: string
  /** cần CẢ hai mã mới gọi được CSV giá; thiếu một cái server trả 200 kèm JSON rỗng */
  isin_cd: string
  name: string
  /** kết quả lần hút gần nhất — chỗ duy nhất lộ ra việc mã quỹ bị sai */
  last_status: 'chua-kiem' | 'ok' | 'ma-sai' | 'loi-mang'
  last_checked_at: string | null
  created_at: string
}

/**
 * Tên quỹ trong sao kê Rakuten → quỹ nào. NHIỀU tên trỏ về MỘT quỹ vì quỹ đổi tên
 * (Rakuten đổi loạt 「楽天・プラス」 ngày 2024-10-17) — migration 0045.
 */
export type FundAliasRow = {
  /** đúng chuỗi trong cột 対象証券名, kể cả '/再投資型' và ký tự full-width */
  statement_name: string
  assoc_fund_cd: string
}

/** 基準価額 mới nhất của từng quỹ (công khai) — migration 0045. */
export type FundPriceRow = {
  assoc_fund_cd: string
  /** ¥ trên 10.000 口 (đơn vị nguồn công bố); luôn > 0 */
  nav: number
  /** phiên trước; null = không có */
  prior_nav: number | null
  /** 純資産総額, TRIỆU yên. KHÔNG dùng để tính tiền. */
  net_assets_m: number | null
  /** ngày PHIÊN của giá (không phải ngày hút) */
  nav_date: string
  updated_at: string
}

export type FundTradeKind = 'buy' | 'sell' | 'adjust'

/** Một lệnh mua/bán/điều chỉnh quỹ — migration 0045. */
export type FundTradeRow = {
  id: string
  user_id: string
  account_id: string
  assoc_fund_cd: string
  kind: FundTradeKind
  /** 約定日 — KHÔNG phải 受渡日; hai ngày này lệch tới 5 ngày trên sao kê thật */
  traded_on: string
  /** 口数; âm chỉ với kind='adjust' */
  units: number
  /** ¥/10.000口 lúc khớp; 0 với 'adjust'. KHÔNG dùng để tính giá vốn. */
  nav: number
  /** yên THẬT đã trừ/nhận — nguồn sự thật cho giá vốn; 0 với 'adjust' */
  amount: number
  /** 口座区分 nguyên văn ('NISA成長投資枠', '特定', …); không tham gia phép tính */
  bucket: string
  note: string
  created_at: string
  updated_at: string
}
```

- [ ] **Step 4: Thêm bốn mục vào `Database['public']['Tables']`**

Chèn ngay **sau** mục `stock_trades` (kết thúc ở dòng 902):

```ts
      funds: {
        Row: FundRow
        Insert: InsertOf<FundRow, 'assoc_fund_cd' | 'isin_cd', 'name' | 'last_status' | 'last_checked_at'>
        Update: Partial<Pick<FundRow, 'isin_cd' | 'name' | 'last_status' | 'last_checked_at'>>
        Relationships: []
      }
      fund_aliases: {
        Row: FundAliasRow
        Insert: InsertOf<FundAliasRow, 'statement_name' | 'assoc_fund_cd', never>
        Update: Partial<Pick<FundAliasRow, 'assoc_fund_cd'>>
        Relationships: []
      }
      fund_prices: {
        Row: FundPriceRow
        Insert: InsertOf<
          FundPriceRow,
          'assoc_fund_cd' | 'nav' | 'nav_date',
          'prior_nav' | 'net_assets_m' | 'updated_at'
        >
        Update: Partial<
          Pick<FundPriceRow, 'nav' | 'prior_nav' | 'net_assets_m' | 'nav_date' | 'updated_at'>
        >
        Relationships: []
      }
      fund_trades: {
        Row: FundTradeRow
        Insert: InsertOf<
          FundTradeRow,
          'user_id' | 'account_id' | 'assoc_fund_cd' | 'kind' | 'units',
          'id' | 'traded_on' | 'nav' | 'amount' | 'bucket' | 'note'
        >
        Update: Partial<
          Pick<
            FundTradeRow,
            'assoc_fund_cd' | 'kind' | 'traded_on' | 'units' | 'nav' | 'amount' | 'bucket' | 'note'
          >
        >
        Relationships: []
      }
```

- [ ] **Step 5: Thêm kiểu + method vào `src/data/repo.ts`**

Thêm vào khối `import type { ... } from '../types/database.types'` (giữ thứ tự chữ cái): `FundAliasRow`, `FundPriceRow`, `FundRow`, `FundTradeKind`, `FundTradeRow`.

Chèn ngay **sau** `export type StockTradePatch = ...` (dòng 342):

```ts
/**
 * Một lệnh mua/bán/điều chỉnh quỹ đầu tư Nhật (migration 0045). Mọi số ở yên.
 *
 * Giữ CẢ `units` lẫn `amount` là CỐ Ý: đo trên sao kê Rakuten thật,
 * 28.429 口 × 17.588 ÷ 10.000 = 49.997 trong khi số tiền bị trừ là 50.000. Suy giá vốn từ
 * số lượng × giá là sai vài yên mỗi lệnh.
 */
export interface NewFundTrade {
  account_id: string
  /** 協会コード, vd '9I31223A' */
  assoc_fund_cd: string
  kind: FundTradeKind
  /** 約定日 (ISO date) — KHÔNG phải 受渡日 */
  traded_on: string
  /** 口数; âm chỉ hợp lệ với kind='adjust' */
  units: number
  /** ¥/10.000口 lúc khớp; 0 với 'adjust' */
  nav: number
  /** yên thật đã trừ/nhận; 0 với 'adjust' */
  amount: number
  /** 口座区分 nguyên văn; chuỗi rỗng nếu không biết */
  bucket: string
  note: string
}

/** Không cho đổi account_id: chuyển lệnh sang tài khoản khác thì xoá rồi ghi lại. */
export type FundTradePatch = Partial<Omit<NewFundTrade, 'account_id'>>
```

Chèn vào `interface Repo`, ngay **sau** `deleteStockTrade(id: string): Promise<void>` (dòng 488):

```ts
  // --- Quỹ đầu tư Nhật: danh bạ + bảng giá + sổ lệnh (migration 0045) ---
  /** Danh bạ quỹ công khai. Chỉ đọc — chỉ service role ghi (seed + edge function). */
  getFunds(): Promise<FundRow[]>
  /** Bảng 基準価額 công khai. Chỉ đọc — edge function fund-refresh ghi. */
  getFundPrices(): Promise<FundPriceRow[]>
  /** Toàn bộ sổ lệnh quỹ của user (mọi tài khoản); UI tự lọc theo account_id. */
  getFundTrades(): Promise<FundTradeRow[]>
  createFundTrade(input: NewFundTrade): Promise<FundTradeRow>
  updateFundTrade(id: string, patch: FundTradePatch): Promise<FundTradeRow>
  deleteFundTrade(id: string): Promise<void>
```

Thêm vào `interface BackupData` (cạnh `stockTrades?`) — dùng ở Task 7:

```ts
  /** Sổ lệnh quỹ đầu tư Nhật (migration 0045); vắng mặt ở backup v1–v11. */
  fundTrades?: FundTradeRow[]
```

- [ ] **Step 6: Xuất kiểu mới ở `src/data/index.ts`**

Thêm `FundTradePatch` và `NewFundTrade` vào danh sách `export type { ... } from './repo'` (giữ thứ tự chữ cái, cạnh `NewStockTrade` / `StockTradePatch`).

- [ ] **Step 7: Cài 6 method trong `src/data/supabaseRepo.ts`**

Thêm `FundPriceRow`, `FundRow`, `FundTradeRow` vào import type từ `'../types/database.types'`, và `type FundTradePatch`, `type NewFundTrade` vào import từ `'./repo'`.

Chèn ngay **sau** `deleteStockTrade` (dòng 464):

```ts
  async getFunds() {
    const { data, error } = await getSupabase().from('funds').select('*').order('assoc_fund_cd')
    if (error) throw error
    return data
  },

  async getFundPrices() {
    const { data, error } = await getSupabase()
      .from('fund_prices')
      .select('*')
      .order('assoc_fund_cd')
    if (error) throw error
    return data
  },

  async getFundTrades() {
    // Phân trang: 136 lệnh chỉ từ một lần nhập sao kê, và mỗi tháng thêm 2 — vài năm là
    // vượt 1.000. Bị cắt là giá trị tài khoản tính trên sổ lệnh thiếu, tức SAI mà không
    // báo. `id` làm chốt sắp xếp cuối để hai trang liền nhau không lặp/sót (traded_on
    // không đơn trị — xem src/data/paging.ts).
    return await fetchAllPages<FundTradeRow>(async (from, to) =>
      getSupabase()
        .from('fund_trades')
        .select('*')
        .order('traded_on', { ascending: false })
        .order('id')
        .range(from, to),
    )
  },

  async createFundTrade(input: NewFundTrade) {
    const user_id = await currentUserId()
    const { data, error } = await getSupabase()
      .from('fund_trades')
      .insert({
        user_id,
        account_id: input.account_id,
        // KHÔNG toUpperCase: 協会コード phân biệt chữ hoa/thường về mặt đối chiếu với
        // nguồn, và mã thật có cả chữ số lẫn chữ in ('9I31223A', '0331418A'). Ép hoa là
        // vô hại hôm nay nhưng là một phép biến đổi không ai yêu cầu.
        assoc_fund_cd: input.assoc_fund_cd.trim(),
        kind: input.kind,
        traded_on: input.traded_on,
        units: input.units,
        nav: input.nav,
        amount: input.amount,
        bucket: input.bucket,
        note: input.note,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateFundTrade(id: string, patch: FundTradePatch) {
    const { data, error } = await getSupabase()
      .from('fund_trades')
      .update({
        ...patch,
        ...(patch.assoc_fund_cd === undefined
          ? {}
          : { assoc_fund_cd: patch.assoc_fund_cd.trim() }),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteFundTrade(id: string) {
    const { error } = await getSupabase().from('fund_trades').delete().eq('id', id)
    if (error) throw error
  },
```

Trong `deleteAccount`, ngay **sau** khối chặn `stock_trades` (dòng 344–353), thêm khối song song:

```ts
    // fund_trades cũng có `on delete cascade` (migration 0045) — cùng lý do với khối
    // stock_trades ở trên: không chặn ở đây thì xoá tài khoản là xoá luôn sổ lệnh quỹ mà
    // không ai hỏi.
    const ft = await sb
      .from('fund_trades')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', id)
    if (ft.error) throw ft.error
    if ((ft.count ?? 0) > 0)
      throw new Error('Không xóa được: còn sổ lệnh quỹ của tài khoản này.')
```

- [ ] **Step 8: Cài trong `src/data/demoRepo.ts`**

**8a.** Bump `STORAGE_KEY` (dòng 85):

```ts
export const STORAGE_KEY = 'sct-demo-db-v17' // v17: thêm danh bạ + bảng giá + sổ lệnh quỹ Nhật (funds, fundPrices, fundTrades)
```

**8b.** Thêm `FundPriceRow`, `FundRow`, `FundTradeRow` vào import type; `type FundTradePatch`, `type NewFundTrade` vào import từ `'./repo'`.

**8c.** Thêm ba trường vào `interface DemoDb` (cạnh `stockPrices`, dòng 137):

```ts
  funds: FundRow[]
  fundPrices: FundPriceRow[]
  fundTrades: FundTradeRow[]
```

**8d.** Thêm hàm soi hình dạng, ngay sau `assertStockTradeShape` (dòng 115–…):

```ts
/**
 * Soi hình dạng lệnh quỹ y như CHECK `fund_trades_shape` của Postgres (migration 0045):
 *   adjust → units <> 0 và nav = 0 và amount = 0
 *   khác   → units > 0 và amount > 0
 *
 * Bản demo là chỗ DUY NHẤT bắt được lỗi này trước khi nó thành một câu INSERT bị 23514 ở
 * production — nơi lỗi chỉ hiện ra dưới dạng một mã lỗi Postgres không ai đọc được.
 */
function assertFundTradeShape(
  input: Pick<NewFundTrade, 'kind' | 'units' | 'nav' | 'amount'>,
) {
  if (input.kind === 'adjust') {
    if (input.units === 0) throw new Error('Lệnh điều chỉnh phải có số 口数 khác 0.')
    if (input.nav !== 0) throw new Error('Lệnh điều chỉnh không được có 基準価額.')
    if (input.amount !== 0) throw new Error('Lệnh điều chỉnh không được có số tiền.')
    return
  }
  if (!Number.isFinite(input.units) || input.units <= 0)
    throw new Error('Lệnh mua/bán phải có số 口数 dương.')
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    throw new Error('Lệnh mua/bán phải có số tiền dương.')
}
```

**8e.** Trong hàm dựng dữ liệu demo (cạnh `const stockPrices: StockPriceRow[] = [...]`, dòng 472), thêm:

```ts
  // Hai quỹ Rakuten thật + 基準価額 phiên 2026-08-10 (đo thật từ nguồn 投信協会). Dùng số
  // thật để bản demo phản ánh đúng thứ người dùng sẽ thấy, và để ai đọc dữ liệu demo cũng
  // thấy ngay đơn vị là ¥/10.000口 chứ không phải ¥/口.
  const funds: FundRow[] = [
    {
      assoc_fund_cd: '9I31223A',
      isin_cd: 'JP90C000Q2U6',
      name: '楽天・プラス・S&P500インデックス・ファンド',
      last_status: 'ok',
      last_checked_at: '2026-08-12T13:00:00.000Z',
      created_at: '2026-08-12T13:00:00.000Z',
    },
    {
      assoc_fund_cd: '9I314241',
      isin_cd: 'JP90C000QF22',
      name: '楽天・プラス・NASDAQ-100インデックス・ファンド',
      last_status: 'ok',
      last_checked_at: '2026-08-12T13:00:00.000Z',
      created_at: '2026-08-12T13:00:00.000Z',
    },
  ]
  const fundPrices: FundPriceRow[] = [
    {
      assoc_fund_cd: '9I31223A',
      nav: 20_053,
      prior_nav: 20_012,
      net_assets_m: 1_175_583,
      nav_date: '2026-08-10',
      updated_at: '2026-08-12T13:00:00.000Z',
    },
    {
      assoc_fund_cd: '9I314241',
      nav: 18_855,
      prior_nav: 18_712,
      net_assets_m: 306_851,
      nav_date: '2026-08-10',
      updated_at: '2026-08-12T13:00:00.000Z',
    },
  ]
  // Đúng hai lệnh mua ngày 約定 2026-04-09 — tái tạo vị thế thật: 70.000 ¥ vốn,
  // 80.757 ¥ giá trị theo phiên 2026-08-10. Cần một tài khoản đầu tư JPY trong dữ liệu
  // demo; nếu chưa có thì thêm một tài khoản `investment` currency 'JPY' tên
  // "NISA Rakuten" ngay cạnh tài khoản đầu tư VND đang có.
  const fundTrades: FundTradeRow[] = [
    {
      id: 'demo-fund-trade-1',
      user_id: DEMO_USER,
      account_id: TK_NISA_JPY,
      assoc_fund_cd: '9I31223A',
      kind: 'buy',
      traded_on: '2026-04-09',
      units: 28_429,
      nav: 17_588,
      amount: 50_000,
      bucket: 'NISAつみたて投資枠',
      note: '',
      created_at: '2026-04-14T00:00:00.000Z',
      updated_at: '2026-04-14T00:00:00.000Z',
    },
    {
      id: 'demo-fund-trade-2',
      user_id: DEMO_USER,
      account_id: TK_NISA_JPY,
      assoc_fund_cd: '9I314241',
      kind: 'buy',
      traded_on: '2026-04-09',
      units: 12_595,
      nav: 15_879,
      amount: 20_000,
      bucket: 'NISA成長投資枠',
      note: '',
      created_at: '2026-04-14T00:00:00.000Z',
      updated_at: '2026-04-14T00:00:00.000Z',
    },
  ]
```

Thay `TK_NISA_JPY` bằng id của tài khoản đầu tư JPY trong dữ liệu demo. **Nếu chưa có tài khoản nào như vậy**, thêm một tài khoản `type: 'investment'`, `currency: 'JPY'`, tên `'NISA Rakuten'` vào mảng `accounts` của dữ liệu demo và dùng id của nó.

Thêm `funds, fundPrices, fundTrades` vào object trả về (cạnh `stockTrades, stockPrices`, dòng 529).

**8f.** Cài 6 method, ngay **sau** `deleteStockTrade` (dòng 962):

```ts
  async getFunds() {
    return (load().funds ?? [])
      .slice()
      .sort((a, b) => a.assoc_fund_cd.localeCompare(b.assoc_fund_cd))
  },

  async getFundPrices() {
    return (load().fundPrices ?? [])
      .slice()
      .sort((a, b) => a.assoc_fund_cd.localeCompare(b.assoc_fund_cd))
  },

  async getFundTrades() {
    return (load().fundTrades ?? [])
      .slice()
      .sort(
        (a, b) =>
          b.traded_on.localeCompare(a.traded_on) || b.created_at.localeCompare(a.created_at),
      )
  },

  async createFundTrade(input: NewFundTrade) {
    assertFundTradeShape(input)
    const db = load()
    db.fundTrades ??= []
    const row: FundTradeRow = {
      id: uuid(),
      user_id: DEMO_USER,
      account_id: input.account_id,
      assoc_fund_cd: input.assoc_fund_cd.trim(),
      kind: input.kind,
      traded_on: input.traded_on,
      units: input.units,
      nav: input.nav,
      amount: input.amount,
      bucket: input.bucket,
      note: input.note,
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    db.fundTrades.push(row)
    save(db)
    return row
  },

  async updateFundTrade(id: string, patch: FundTradePatch) {
    const db = load()
    db.fundTrades ??= []
    const idx = db.fundTrades.findIndex((t) => t.id === id)
    if (idx < 0) throw new Error('Không tìm thấy lệnh quỹ này.')
    const current = db.fundTrades[idx]
    const next: FundTradeRow = {
      ...current,
      assoc_fund_cd:
        patch.assoc_fund_cd !== undefined ? patch.assoc_fund_cd.trim() : current.assoc_fund_cd,
      kind: patch.kind ?? current.kind,
      traded_on: patch.traded_on ?? current.traded_on,
      units: patch.units ?? current.units,
      nav: patch.nav ?? current.nav,
      amount: patch.amount ?? current.amount,
      bucket: patch.bucket ?? current.bucket,
      note: patch.note ?? current.note,
      updated_at: nowISO(),
    }
    // Soi hình dạng SAU khi trộn patch, y như CHECK của Postgres soi dòng kết quả — sửa
    // lệnh có thể đổi cả kind lẫn nav/amount, chỉ soi lúc tạo là không đủ.
    assertFundTradeShape(next)
    db.fundTrades[idx] = next
    save(db)
    return next
  },

  async deleteFundTrade(id: string) {
    const db = load()
    db.fundTrades = (db.fundTrades ?? []).filter((t) => t.id !== id)
    save(db)
  },
```

**8g.** Trong `deleteAccount` của demoRepo, cạnh khối chặn `stockTrades` (dòng 848), thêm:

```ts
    if ((db.fundTrades ?? []).some((t) => t.account_id === id))
      throw new Error('Không xóa được: còn sổ lệnh quỹ của tài khoản này.')
```

- [ ] **Step 9: Thêm hook vào `src/hooks/queries.ts`**

Thêm `type FundTradePatch`, `type NewFundTrade` vào import từ `'../data'`. Chèn ngay **sau** `useDeleteStockTrade` (dòng 475–481):

```ts
// --- Quỹ đầu tư Nhật (migration 0045) ---

export function useFunds() {
  return useQuery({
    queryKey: ['funds'],
    queryFn: () => repo.getFunds(),
  })
}

export function useFundPrices() {
  return useQuery({
    queryKey: ['fundPrices'],
    queryFn: () => repo.getFundPrices(),
  })
}

export function useFundTrades() {
  return useQuery({
    queryKey: ['fundTrades'],
    queryFn: () => repo.getFundTrades(),
  })
}

/**
 * Sổ lệnh quỹ đổi → giá trị tài khoản đổi, nên phải bỏ cache của cả `accounts` (view
 * account_balances mang market_value) như `invalidateStockTrades` đang làm.
 */
function invalidateFundTrades(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['fundTrades'] })
  qc.invalidateQueries({ queryKey: ['accounts'] })
}

export function useCreateFundTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewFundTrade) => repo.createFundTrade(input),
    onSettled: () => invalidateFundTrades(qc),
  })
}

export function useUpdateFundTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: FundTradePatch }) =>
      repo.updateFundTrade(id, patch),
    onSettled: () => invalidateFundTrades(qc),
  })
}

export function useDeleteFundTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteFundTrade(id),
    onSettled: () => invalidateFundTrades(qc),
  })
}
```

> Mở `invalidateStockTrades` (dòng 451) và **bắt chước đúng** danh sách queryKey nó bỏ cache. Nếu nó bỏ nhiều hơn hai key thì `invalidateFundTrades` phải bỏ đúng những key đó — thiếu một key là UI hiện số cũ sau khi ghi lệnh.

- [ ] **Step 10: Chạy test + biên dịch**

```bash
npx vitest run src/data/fundTrades.test.ts && npx tsc -b && npm run lint
```

Kỳ vọng: 7 bài PASS, không lỗi biên dịch, không lỗi lint.

- [ ] **Step 11: Chạy toàn bộ test để chắc không vỡ chỗ khác**

```bash
npm test
```

Kỳ vọng: tất cả xanh. `demoRepo.test.ts` có bài canh `BACKUP_VERSION` bằng số cứng — nếu nó đỏ thì để Task 7 xử lý, đừng sửa ở đây.

- [ ] **Step 12: Commit**

```bash
git add src/types/database.types.ts src/data/repo.ts src/data/index.ts src/data/supabaseRepo.ts src/data/demoRepo.ts src/hooks/queries.ts src/data/fundTrades.test.ts
git commit -m "feat(quy-nhat): tang du lieu — types, repo, hai ban cai, hook"
```

---

## Task 7: Sao lưu v12 — đừng để khôi phục làm mất sổ lệnh quỹ

**Files:**
- Modify: `src/data/repo.ts:95` (`BACKUP_VERSION` 11 → 12)
- Modify: `src/data/backupImport.ts` (soát `fundTrades`)
- Modify: `src/data/supabaseRepo.ts` (`exportAll` + `importAll`)
- Modify: `src/data/demoRepo.ts` (`exportAll` + `importAll`)
- Modify: `src/data/demoRepo.test.ts` (bài canh số cứng `BACKUP_VERSION`)
- Test: `src/data/backupImport.test.ts` (nối bài mới)

**Interfaces:**
- Consumes: `FundTradeRow`, `BackupData.fundTrades` từ Task 6.
- Produces: bản lưu v12 mang `fundTrades`; `validateBackup` báo lỗi cho sổ lệnh quỹ hỏng.

Chỉ `fundTrades` vào bản lưu. `funds` / `fund_aliases` / `fund_prices` **không** vào — chúng là dữ liệu công khai do service role ghi (seed + cron), y như `stock_prices` không có trong bản lưu. Đưa vào là khôi phục sẽ vấp RLS.

- [ ] **Step 1: Viết bài test thất bại (nối vào `src/data/backupImport.test.ts`)**

Chèn ngay sau khối `--- stockTrades (v7) ... ---` (dòng ~260–350):

```ts
  // --- fundTrades (v12): FK (account_id, user_id) + UNIQUE id + CHECK fund_trades_shape ---
  it('sổ lệnh quỹ trỏ tới tài khoản không có trong file → báo lỗi', () => {
    const d = { ...backup }
    d.fundTrades = [
      {
        id: 'ft-1',
        user_id: 'u',
        account_id: 'khong-ton-tai',
        assoc_fund_cd: '9I31223A',
        kind: 'buy',
        traded_on: '2026-04-09',
        units: 28_429,
        nav: 17_588,
        amount: 50_000,
        bucket: '',
        note: '',
        created_at: '2026-04-14T00:00:00.000Z',
        updated_at: '2026-04-14T00:00:00.000Z',
      },
    ] as unknown as BackupData['fundTrades']
    expect(validateBackup(d).join(' ')).toMatch(/quỹ trỏ tới tài khoản/)
  })

  it('sổ lệnh quỹ có id trùng → báo lỗi', () => {
    const row = {
      id: 'ft-trung',
      user_id: 'u',
      account_id: backup.accounts[0].id,
      assoc_fund_cd: '9I31223A',
      kind: 'buy',
      traded_on: '2026-04-09',
      units: 100,
      nav: 17_588,
      amount: 1_000,
      bucket: '',
      note: '',
      created_at: '2026-04-14T00:00:00.000Z',
      updated_at: '2026-04-14T00:00:00.000Z',
    }
    const d = { ...backup, fundTrades: [row, { ...row }] } as unknown as BackupData
    expect(validateBackup(d).join(' ')).toMatch(/trùng/i)
  })

  it('lệnh mua quỹ thiếu số tiền → báo lỗi TRƯỚC khi xoá dữ liệu cũ', () => {
    // CHECK fund_trades_shape sẽ nổ 23514 lúc chèn — tức là SAU khi importAll đã xoá hết
    // dữ liệu cũ. Soát ở đây là chặn mất dữ liệu, không phải làm đẹp thông báo.
    const d = { ...backup }
    d.fundTrades = [
      {
        id: 'ft-2',
        user_id: 'u',
        account_id: backup.accounts[0].id,
        assoc_fund_cd: '9I31223A',
        kind: 'buy',
        traded_on: '2026-04-09',
        units: 100,
        nav: 17_588,
        amount: 0,
        bucket: '',
        note: '',
        created_at: '2026-04-14T00:00:00.000Z',
        updated_at: '2026-04-14T00:00:00.000Z',
      },
    ] as unknown as BackupData['fundTrades']
    expect(validateBackup(d).join(' ')).toMatch(/số tiền dương/)
  })

  it('lệnh điều chỉnh quỹ có 基準価額 → báo lỗi', () => {
    const d = { ...backup }
    d.fundTrades = [
      {
        id: 'ft-3',
        user_id: 'u',
        account_id: backup.accounts[0].id,
        assoc_fund_cd: '9I31223A',
        kind: 'adjust',
        traded_on: '2026-05-01',
        units: 1_000,
        nav: 17_588,
        amount: 0,
        bucket: '',
        note: '',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
    ] as unknown as BackupData['fundTrades']
    expect(validateBackup(d).join(' ')).toMatch(/không được có 基準価額|không được có giá/)
  })

  it('bản lưu v11 (chưa có fundTrades) vẫn nhập được, sổ lệnh quỹ rỗng', async () => {
    // Cùng khuôn bài `version: 6, stockTrades: undefined` ở dòng ~411: bản lưu cũ hơn một
    // migration thì thiếu hẳn trường, và khôi phục phải chạy bình thường.
    const cu = { ...backup, version: 11, fundTrades: undefined }
    expect(validateBackup(cu as unknown as BackupData)).toEqual([])
    await demoRepo.importAll(cu as unknown as BackupData)
    expect(await demoRepo.getFundTrades()).toEqual([])
  })
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

```bash
npx vitest run src/data/backupImport.test.ts
```

Kỳ vọng: FAIL — bốn bài đầu không thấy lỗi nào (`validateBackup` chưa soát `fundTrades`).

- [ ] **Step 3: Soát `fundTrades` trong `src/data/backupImport.ts`**

Chèn ngay **trước** `return p.list()` (dòng 238):

```ts
  // Sổ lệnh quỹ Nhật (v12): FK (account_id, user_id) -> accounts + CHECK fund_trades_shape
  // của migration 0045. id trùng đã bắt ở khối `ids` phía trên (dùng chung accountIds).
  ids(data.fundTrades, 'sổ lệnh quỹ')
  for (const ft of data.fundTrades ?? []) {
    const at = `${ft.assoc_fund_cd} ${ft.traded_on}`
    if (!accountIds.has(ft.account_id))
      p.add('Lệnh quỹ trỏ tới tài khoản không có trong file', `${at} → ${ft.account_id}`)
    // Hình dạng theo kind (CHECK fund_trades_shape): file vi phạm sẽ nổ 23514 lúc chèn —
    // tức là SAU khi đã xoá hết dữ liệu cũ. Soát đủ cả hai nhánh ở đây.
    if (ft.kind === 'adjust') {
      if (ft.units === 0) p.add('Lệnh điều chỉnh quỹ phải có số 口数 khác 0', at)
      if (ft.nav !== 0) p.add('Lệnh điều chỉnh quỹ không được có 基準価額 khác 0', at)
      if (ft.amount !== 0) p.add('Lệnh điều chỉnh quỹ không được có số tiền khác 0', at)
    } else {
      if (typeof ft.units !== 'number' || !Number.isFinite(ft.units) || ft.units <= 0)
        p.add('Lệnh mua/bán quỹ phải có số 口数 dương', `${at} → ${String(ft.units)}`)
      if (typeof ft.amount !== 'number' || !Number.isFinite(ft.amount) || ft.amount <= 0)
        p.add('Lệnh mua/bán quỹ phải có số tiền dương', `${at} → ${String(ft.amount)}`)
    }
  }
```

- [ ] **Step 4: Bump `BACKUP_VERSION`**

`src/data/repo.ts:95`:

```ts
export const BACKUP_VERSION = 12
```

- [ ] **Step 5: Sửa bài canh số cứng trong `src/data/demoRepo.test.ts`**

Tìm bài ở dòng ~665 (comment "Số cứng chứ không import BACKUP_VERSION: nâng phiên bản là việc phải CỐ Ý") và đổi con số kỳ vọng từ `11` sang `12`. **Giữ nguyên comment** — nó chính là lý do bài test tồn tại.

- [ ] **Step 6: `exportAll` + `importAll` của `supabaseRepo`**

Trong `exportAll`: thêm `fundTrades` vào cả ba chỗ song song với `stockTrades` — mảng destructure (dòng 1504), danh sách `Promise.all` (thêm `selectAll<FundTradeRow>('fund_trades')` đúng vị trí tương ứng), và object trả về (dòng 1555).

Trong `importAll`, chèn ngay **sau** khối `stock_trades` (dòng 1822):

```ts
    // fund_trades: composite FK tới accounts → chèn sau accounts. `assoc_fund_cd` có FK
    // tới `funds`, mà `funds` được seed bởi migration chứ không nằm trong bản lưu — nên
    // khôi phục một bản lưu mang quỹ chưa được seed sẽ nổ FK. Đó là hành vi ĐÚNG: thà
    // báo lỗi còn hơn nhận một sổ lệnh trỏ vào quỹ mà app không biết giá.
    if (data.fundTrades?.length) {
      await insertChunked(
        data.fundTrades.map((t) => ({
          id: t.id,
          user_id: uid,
          account_id: t.account_id,
          assoc_fund_cd: t.assoc_fund_cd,
          kind: t.kind,
          traded_on: t.traded_on,
          units: t.units,
          nav: t.nav,
          amount: t.amount,
          bucket: t.bucket,
          note: t.note,
        })),
        (part) => sb.from('fund_trades').insert(part),
      )
    }
```

- [ ] **Step 7: `exportAll` + `importAll` của `demoRepo`**

Trong `exportAll` (dòng ~2000), thêm `fundTrades: db.fundTrades ?? []` cạnh `stockTrades`.

Trong `importAll`, thêm `db.fundTrades = data.fundTrades ?? []` đúng chỗ `stockTrades` đang được gán. **`?? []` là bắt buộc**: bản lưu v11 thiếu hẳn trường, không có `?? []` thì `db.fundTrades` mang `undefined` và mọi chỗ đọc nó phải tự phòng thân.

- [ ] **Step 8: Chạy test**

```bash
npx vitest run src/data/backupImport.test.ts src/data/demoRepo.test.ts src/data/fundTrades.test.ts
```

Kỳ vọng: tất cả PASS.

- [ ] **Step 9: Chạy toàn bộ + biên dịch**

```bash
npm test && npx tsc -b && npm run lint
```

Kỳ vọng: tất cả xanh.

- [ ] **Step 10: Commit**

```bash
git add src/data/repo.ts src/data/backupImport.ts src/data/backupImport.test.ts src/data/supabaseRepo.ts src/data/demoRepo.ts src/data/demoRepo.test.ts
git commit -m "feat(quy-nhat): sao luu v12 — so lenh quy vao ban luu, soat truoc khi xoa du lieu cu"
```

---

## Task 8: `loadInput.ts` — đọc Postgres, không tính gì

**Files:**
- Create: `supabase/functions/fund-refresh/loadInput.ts`

**Interfaces:**
- Consumes: `FundRef` từ Task 4.
- Produces:
  ```ts
  export interface FundAccount {
    userId: string
    accountId: string
    trades: { assocFundCd: string; kind: 'buy'|'sell'|'adjust'; tradedOn: string
              units: number; nav: number; amount: number }[]
    /** true nếu tài khoản này CŨNG có stock_trades → trộn hai hệ đơn vị */
    coCaSoLenhCoPhieu: boolean
  }
  export function loadFundRegistry(sb: SupabaseClient): Promise<FundRef[]>
  export function loadHeldFundCodes(sb: SupabaseClient): Promise<string[]>
  export function loadFundAccounts(sb: SupabaseClient): Promise<FundAccount[]>
  ```

Không có test riêng cho file này — cùng lý do với `stock-refresh/loadInput.ts`: nó chỉ đọc bảng và xếp dữ liệu vào ô, không có phép tính nào để canh. Đúng đắn của nó được chứng minh bằng lượt gọi thật ở Task 13.

- [ ] **Step 1: Viết file**

```ts
// Đọc Postgres và xếp dữ liệu vào đúng ô cho `_funds.js`.
//
// Ràng buộc: KHÔNG tự tính gì cả — giống loadInput.ts của stock-refresh và của
// push-notify. Nếu bạn thấy mình đang viết phép cộng trừ tiền hay ngày ở file này thì
// phép đó thuộc về src/features/assets/fundHoldings.ts.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { FundRef } from './navs.ts'

// deno-lint-ignore no-explicit-any
type Row = any

/** Một tài khoản đủ điều kiện tự chạy, kèm sổ lệnh quỹ của nó. */
export interface FundAccount {
  userId: string
  accountId: string
  /** shape khớp `FundTrade` của fundHoldings.ts */
  trades: {
    assocFundCd: string
    kind: 'buy' | 'sell' | 'adjust'
    /** 約定日 */
    tradedOn: string
    units: number
    nav: number
    amount: number
  }[]
  /**
   * true nếu tài khoản này CŨNG có dòng trong `stock_trades`. Không phải trường hợp thật
   * hiện nay, nhưng cộng 口数 của quỹ với số cổ phiếu là trộn hai hệ đơn vị — im lặng
   * cộng sai còn tệ hơn bỏ qua, nên index.ts bỏ qua tài khoản này với lý do riêng.
   */
  coCaSoLenhCoPhieu: boolean
}

/** Đọc hết một bảng, phân trang, thứ tự đơn trị (xem src/data/paging.ts). */
async function readAll(sb: SupabaseClient, table: string, orderBy: string): Promise<Row[]> {
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
 * Cả danh bạ quỹ, không chỉ quỹ đang giữ.
 *
 * Vì sao cả danh bạ: (1) quỹ vừa được thêm có giá ngay, không đợi lượt cron kế tiếp;
 * (2) chế độ lấp lịch sử cần NAV của cả những quỹ đã bán hết từ lâu — sáu trong tám quỹ
 * của chủ app thuộc loại đó.
 */
export async function loadFundRegistry(sb: SupabaseClient): Promise<FundRef[]> {
  const rows = await readAll(sb, 'funds', 'assoc_fund_cd')
  return rows
    .filter((r) => typeof r.assoc_fund_cd === 'string' && typeof r.isin_cd === 'string')
    .map((r) => ({ assocFundCd: r.assoc_fund_cd as string, isinCd: r.isin_cd as string }))
}

/**
 * Mã quỹ đã từng xuất hiện trong sổ lệnh — quyết định THỨ TỰ ưu tiên gọi (xem
 * buildFundFetchOrder), không quyết định quỹ nào được hút (đó là loadFundRegistry).
 * Không lọc theo tài khoản đủ điều kiện, không phân biệt còn giữ hay đã bán sạch.
 */
export async function loadHeldFundCodes(sb: SupabaseClient): Promise<string[]> {
  const rows = await readAll(sb, 'fund_trades', 'id')
  const ma = new Set<string>()
  for (const r of rows) {
    if (typeof r.assoc_fund_cd === 'string' && r.assoc_fund_cd.trim())
      ma.add(r.assoc_fund_cd.trim())
  }
  return [...ma].sort()
}

/**
 * Tài khoản đủ điều kiện tự chạy: loại 'investment', tiền **JPY**, chưa lưu trữ, và có ít
 * nhất một dòng sổ lệnh quỹ. Không có nút bật/tắt — ghi lệnh vào là chạy.
 *
 * KHÁC `loadPortfolioAccounts` của stock-refresh ở đúng hai chỗ: lọc `JPY` thay vì `VND`,
 * và KHÔNG đọc `balance` — mô hình quỹ không có tiền mặt nên số dư sổ không tham gia phép
 * tính nào (xem fundHoldings.ts, lý do 3).
 */
export async function loadFundAccounts(sb: SupabaseClient): Promise<FundAccount[]> {
  const [balances, fundTrades, stockTrades] = await Promise.all([
    readAll(sb, 'account_balances', 'id'),
    readAll(sb, 'fund_trades', 'id'),
    readAll(sb, 'stock_trades', 'id'),
  ])

  const theoTaiKhoan = new Map<string, FundAccount['trades']>()
  for (const t of fundTrades) {
    const list = theoTaiKhoan.get(t.account_id) ?? []
    list.push({
      assocFundCd: t.assoc_fund_cd,
      kind: t.kind,
      tradedOn: t.traded_on,
      units: Number(t.units),
      nav: Number(t.nav),
      amount: Number(t.amount),
    })
    theoTaiKhoan.set(t.account_id, list)
  }

  const coCoPhieu = new Set<string>(stockTrades.map((t) => t.account_id as string))

  const out: FundAccount[] = []
  for (const b of balances) {
    if (b.type !== 'investment' || b.currency !== 'JPY' || b.is_archived) continue
    const list = theoTaiKhoan.get(b.id)
    if (!list || list.length === 0) continue
    out.push({
      userId: b.user_id,
      accountId: b.id,
      trades: list,
      coCaSoLenhCoPhieu: coCoPhieu.has(b.id),
    })
  }
  return out
}
```

- [ ] **Step 2: Kiểm cú pháp bằng Deno**

```bash
npx supabase@latest --version
```

Nếu có CLI thì:

```bash
npx deno check supabase/functions/fund-refresh/loadInput.ts 2>&1 | head -20
```

Kỳ vọng: không lỗi. **Nếu máy không có `deno`** thì bỏ qua bước này — cú pháp sẽ được kiểm ở Task 13 lúc `supabase functions deploy`, và đó là chốt canh thật.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/fund-refresh/loadInput.ts
git commit -m "feat(quy-nhat): loadInput — doc bang, khong tinh gi, loc JPY thay vi VND"
```

---

## Task 9: `index.ts` — hút NAV, ghi giá trị, kiểm mã

**Files:**
- Create: `supabase/functions/fund-refresh/index.ts`

**Interfaces:**
- Consumes: `fetchFundNavs`, `buildFundFetchOrder` (Task 4); `loadFundRegistry`, `loadHeldFundCodes`, `loadFundAccounts` (Task 8); `fundHoldingsFromTrades`, `sessionNavs`, `fundValue` từ `_funds.js` (Task 5).
- Produces: endpoint `POST /fund-refresh` với hai chế độ (chạy đủ, kiểm mã). Chế độ lấp lịch sử ở Task 10.

- [ ] **Step 1: Viết file**

```ts
// Edge function fund-refresh — chạy mỗi tối sau khi quỹ Nhật công bố 基準価額.
//
// Hai việc: (1) hút NAV cho CẢ danh bạ quỹ (quỹ đang giữ được gọi trước, xem
// buildFundFetchOrder), ghi vào fund_prices; (2) tính lại giá trị thị trường cho từng tài
// khoản đầu tư JPY có sổ lệnh quỹ và ghi vào account_valuations.
//
// Function RIÊNG, không nhét vào stock-refresh: khác nguồn, khác cách giải mã, khác đơn
// vị đo, khác mô hình giá vốn, khác giờ chạy. Và nặng nhất — một lô Yahoo hỏng sẽ kéo cả
// lượt stock-refresh xuống 500, làm mất luôn phần quỹ Nhật vốn chẳng liên quan.
//
// Function này KHÔNG có phép tính riêng. Mọi phép tính gọi từ `_funds.js` (gói từ
// src/features/assets/serverBundleFunds.ts) — hai bản sao của một phép tính là chuyện
// sớm muộn lệch nhau.
//
// Deploy:   npm run bundle:rules && supabase functions deploy fund-refresh --no-verify-jwt
// Xem thêm: docs/quy-nhat.md

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildFundFetchOrder, fetchFundNavs, type NavUpsert } from './navs.ts'
import { fundHoldingsFromTrades, fundValue, sessionNavs } from './_funds.js'
import { loadFundAccounts, loadFundRegistry, loadHeldFundCodes } from './loadInput.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
// Dùng lại bí mật cron của push: nó là "bí mật cho cron" nói chung. Đây là job THỨ BA
// dùng chung nó — xem cảnh báo trong docs/co-phieu-viet-nam.md về việc đổi secret.
const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET') ?? ''

interface KetQua {
  /** Số quỹ ghi được NAV vào fund_prices ở lượt này. */
  soQuyCoGia: number
  /** Số tài khoản đã ghi snapshot mới. */
  daGhi: number
  /** Vì sao những tài khoản còn lại bị bỏ qua — gom theo lý do để đọc log cho nhanh. */
  boQua: Record<string, number>
  loi: string[]
}

function demBoQua(kq: KetQua, lyDo: string) {
  kq.boQua[lyDo] = (kq.boQua[lyDo] ?? 0) + 1
}

Deno.serve(async (req) => {
  // Thiếu biến môi trường thì phải nói RÕ thiếu cái gì — không để nó rơi xuống throw mù
  // mờ từ bên trong createClient().
  const thieu = [
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY],
    ['PUSH_CRON_SECRET', CRON_SECRET],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (thieu.length > 0)
    return Response.json({ loi: `Thiếu biến môi trường: ${thieu.join(', ')}` }, { status: 500 })

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const body = await req.json().catch(() => ({} as any))

  // --- Chế độ kiểm mã: người dùng đăng nhập, KHÔNG phải cron ---
  //
  // Function deploy với --no-verify-jwt (cron không có JWT), nên cổng của Supabase đã
  // TẮT. Phải tự xác thực ở đây — trông cậy vào cổng đó là trông cậy vào một cái cổng đã
  // tắt. Chế độ này cố ý KHÔNG nhận x-cron-secret, và chế độ chạy đủ cố ý KHÔNG nhận JWT.
  if (body?.kiem) {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '')
    const { data: nguoiDung, error: authErr } = await sb.auth.getUser(token)
    if (authErr || !nguoiDung?.user) return new Response('Chưa đăng nhập', { status: 401 })

    const { isinCd, associFundCd } = body.kiem as { isinCd?: string; associFundCd?: string }
    if (!isinCd || !associFundCd)
      return Response.json({ loi: 'Thiếu isinCd hoặc associFundCd' }, { status: 400 })

    const kq = await fetchFundNavs([{ assocFundCd: associFundCd, isinCd }])
    return Response.json({
      trangThai: kq.trangThai.get(associFundCd) ?? 'loi-mang',
      row: kq.rows[0] ?? null,
      loi: kq.errors,
    })
  }

  // --- Từ đây trở xuống là cron ---
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Sai bí mật cron', { status: 401 })
  }

  const kq: KetQua = { soQuyCoGia: 0, daGhi: 0, boQua: {}, loi: [] }
  // Việc 2 throw TRƯỚC cả vòng lặp tài khoản — tức không phải lỗi của riêng một tài khoản
  // mà cả khối ghi giá trị bị gãy. Tách cờ riêng vì lỗi của TỪNG tài khoản vẫn được gom
  // vào `loi` mà không nên biến cả lượt chạy thành thất bại.
  let viec2Gay = false

  // --- Việc 1: hút NAV cho cả danh bạ ---
  try {
    const [danhBa, dangGiu] = await Promise.all([loadFundRegistry(sb), loadHeldFundCodes(sb)])
    const thuTu = buildFundFetchOrder(dangGiu, danhBa)
    const { rows, trangThai, errors } = await fetchFundNavs(thuTu)
    for (const e of errors) kq.loi.push(`gia: ${e}`)

    if (rows.length > 0) {
      const payload: (NavUpsert & { updated_at: string })[] = rows.map((r) => ({
        ...r,
        updated_at: new Date().toISOString(),
      }))
      const { error } = await sb
        .from('fund_prices')
        .upsert(payload, { onConflict: 'assoc_fund_cd' })
      if (error) throw error
      kq.soQuyCoGia = rows.length
    } else if (errors.length === 0) {
      // Danh bạ rỗng (chưa seed) — khác hẳn "gọi lỗi", nên nói rõ.
      kq.loi.push('gia: danh bạ quỹ rỗng, không có gì để hút')
    }

    // Ghi lại kết quả từng quỹ. Đây là chỗ DUY NHẤT lộ ra việc một mã quỹ bị sai — không
    // có nó thì một quỹ gõ nhầm mã sẽ im lặng thiếu giá mãi mãi.
    for (const [ma, tt] of trangThai) {
      const { error } = await sb
        .from('funds')
        .update({ last_status: tt, last_checked_at: new Date().toISOString() })
        .eq('assoc_fund_cd', ma)
      if (error) kq.loi.push(`trang thai ${ma}: ${error.message}`)
    }
  } catch (err) {
    kq.loi.push(`gia: ${err instanceof Error ? err.message : String(err)}`)
  }

  // --- Việc 2: tính lại giá trị thị trường và ghi vào account_valuations ---
  try {
    const { data: navRows, error: navErr } = await sb
      .from('fund_prices')
      .select('assoc_fund_cd, nav, nav_date')
    if (navErr) throw navErr

    // Mỗi quỹ được hút bằng một cuộc gọi riêng và một quỹ lỗi không kéo sập quỹ khác, nên
    // sau một lượt chạy không phải mọi hàng chắc chắn cùng nav_date. sessionNavs gom về
    // MỘT phiên (ngày lớn nhất) và nêu tên quỹ nào còn kẹt ở phiên cũ hơn.
    const { session: phien, navByFund, staleFunds } = sessionNavs(
      (navRows ?? []).map((p: any) => ({
        assoc_fund_cd: p.assoc_fund_cd as string,
        nav: Number(p.nav),
        nav_date: p.nav_date as string,
      })),
    )
    if (!phien) throw new Error('Bảng giá quỹ rỗng, không biết ngày phiên')

    const accounts = await loadFundAccounts(sb)
    for (const a of accounts) {
      // Một tài khoản lỗi KHÔNG được làm chết cả lượt — tài khoản khác vẫn phải được xét.
      try {
        // Trộn hai hệ đơn vị (口数 của quỹ và số cổ của cổ phiếu) là cộng sai; im lặng
        // cộng sai còn tệ hơn bỏ qua.
        if (a.coCaSoLenhCoPhieu) {
          demBoQua(kq, 'tron-hai-loai-so-lenh')
          continue
        }

        const { holdings, oversold } = fundHoldingsFromTrades(a.trades)
        // Sổ lệnh có lỗ hổng: giữ số cũ, không ghi số biết là sai. Với quỹ Nhật, lý do
        // thường gặp nhất là THIẾU MỘT DÒNG trong fund_aliases (quỹ đổi tên).
        if (oversold.length > 0) {
          demBoQua(kq, 'so-lenh-co-lo-hong')
          continue
        }
        // Quỹ đang giữ mà giá còn ở phiên cũ hơn: giá vẫn có và > 0 nên fundValue không
        // tự phát hiện được — phải chặn ở đây, kẻo ghi một số trông như mới nhưng dùng
        // giá hôm kia, đóng dấu "hôm nay".
        if (holdings.some((h: { assocFundCd: string }) => staleFunds.has(h.assocFundCd))) {
          demBoQua(kq, 'gia-le-phien-cu')
          continue
        }

        const { marketValue } = fundValue(holdings, navByFund)
        if (marketValue === null) {
          demBoQua(kq, 'thieu-gia-moi-quy')
          continue
        }

        // `where source = 'auto'` không biểu diễn được qua PostgREST, nên đọc trước rồi
        // mới quyết: hàng người dùng gõ tay của đúng ngày đó phải được giữ nguyên.
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
            note: `Tự tính theo 基準価額 phiên ${phien}`,
            source: 'auto',
          },
          { onConflict: 'account_id,valued_on' },
        )
        if (ghiErr) throw ghiErr
        kq.daGhi++
      } catch (err) {
        kq.loi.push(
          `tài khoản ${a.accountId.slice(0, 8)}…: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  } catch (err) {
    viec2Gay = true
    kq.loi.push(`ghi gia tri: ${err instanceof Error ? err.message : String(err)}`)
  }

  console.log('fund-refresh', JSON.stringify(kq))
  // 500 khi: (a) việc 1 hoàn toàn không ghi được giá cho quỹ nào dù có lỗi xảy ra, HOẶC
  // (b) việc 2 gãy TRƯỚC vòng lặp tài khoản. Cả hai đều nghĩa là lượt chạy này không đáng
  // tin. Một quỹ lỗi hoặc một tài khoản lỗi riêng lẻ KHÔNG rơi vào đây — đó vẫn là lượt
  // chạy có ích.
  const chetHoanToan = kq.loi.length > 0 && kq.soQuyCoGia === 0
  return new Response(JSON.stringify(kq), {
    status: chetHoanToan || viec2Gay ? 500 : 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/fund-refresh/index.ts
git commit -m "feat(quy-nhat): edge function fund-refresh — hut NAV, ghi gia tri, kiem ma"
```

> Không có bước chạy test ở task này: mọi phép tính đã được canh ở Task 2–4, còn phần
> ghép nối với Postgres chỉ chứng minh được bằng lượt gọi thật (Task 15). Cố dựng mock
> Supabase ở đây là dựng một bản sao của Postgres rồi test bản sao đó.

---

## Task 10: `parseNavHistory` + chế độ lấp lịch sử

**Files:**
- Modify: `supabase/functions/fund-refresh/navs.ts` (thêm `parseNavHistory`)
- Modify: `supabase/functions/fund-refresh/navs.test.ts` (nối `describe` mới)
- Modify: `supabase/functions/fund-refresh/index.ts` (thêm chế độ `lapLichSu`)

**Interfaces:**
- Consumes: mọi thứ của Task 9.
- Produces:
  ```ts
  export interface NavPoint { navDate: string; nav: number }
  export function parseNavHistory(bytes: Uint8Array): NavPoint[]
  ```

- [ ] **Step 1: Viết bài test thất bại (nối vào `navs.test.ts`)**

Thêm `parseNavHistory` vào dòng import, rồi nối:

```ts
describe('parseNavHistory', () => {
  it('trả MỌI phiên hợp lệ, xếp theo ngày tăng dần', () => {
    const csv = sjis(
      '年月日,基準価額(円),純資産総額（百万円）,分配金,決算期\r\n' +
        '2026年08月10日,20053,1175583,,\r\n' +
        '2026年08月07日,20012,1172772,,\r\n',
    )
    expect(parseNavHistory(csv)).toEqual([
      { navDate: '2026-08-07', nav: 20_012 },
      { navDate: '2026-08-10', nav: 20_053 },
    ])
  })

  it('file thật có hàng nghìn phiên, phiên đầu là ngày lập quỹ', () => {
    const lich = parseNavHistory(mau('toushin-sp500.csv'))
    expect(lich.length).toBeGreaterThan(500)
    // 楽天・プラス・S&P500 lập ngày 2023-10-27, 基準価額 khởi điểm 9.888.
    expect(lich[0]).toEqual({ navDate: '2023-10-27', nav: 9_888 })
    // Xếp tăng dần, không có ngày lặp.
    for (let i = 1; i < lich.length; i++) {
      expect(lich[i].navDate > lich[i - 1].navDate).toBe(true)
    }
  })

  it('không phải CSV giá → mảng rỗng, không nổ', () => {
    expect(parseNavHistory(mau('toushin-thieu-tham-so.txt'))).toEqual([])
  })
})
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

```bash
npx vitest run supabase/functions/fund-refresh/navs.test.ts
```

Kỳ vọng: FAIL — `parseNavHistory is not a function`.

- [ ] **Step 3: Thêm `parseNavHistory` vào `navs.ts`**

Chèn ngay sau `parseNavCsv`:

```ts
/** Một điểm trong lịch sử 基準価額. */
export interface NavPoint {
  /** ISO date */
  navDate: string
  /** ¥/10.000口 */
  nav: number
}

/**
 * TOÀN BỘ lịch sử 基準価額 trong file, xếp theo ngày tăng dần, mỗi ngày một điểm.
 *
 * Dùng cho chế độ lấp lịch sử: CSV tải về đã có đủ lịch sử từ ngày lập quỹ, nên dựng lại
 * `account_valuations` cho các phiên đã qua KHÔNG tốn thêm một cuộc gọi mạng nào.
 *
 * Không phải CSV giá (mã sai, thiếu tham số, giải mã hỏng) → mảng RỖNG. Nơi gọi tự hiểu
 * là không có gì để lấp; ném lỗi ở đây sẽ làm chết cả lượt lấp vì một quỹ hỏng.
 */
export function parseNavHistory(bytes: Uint8Array): NavPoint[] {
  const text = new TextDecoder('shift_jis').decode(bytes)
  const dong = text.split(/\r?\n/)
  if (!dong[0] || !dong[0].includes(COT_NGAY)) return []

  // Map để một ngày chỉ còn một điểm (file thật không lặp, nhưng đừng tin mù — hai điểm
  // cùng ngày sẽ làm phép lấp ghi hai giá trị khác nhau cho cùng một valued_on).
  const theoNgay = new Map<string, number>()
  for (const raw of dong.slice(1)) {
    if (!raw.trim()) continue
    const o = raw.split(',')
    const navDate = ngayNhatSangISO(o[0] ?? '')
    if (navDate === null) continue
    const nav = soDuong(o[1])
    if (nav === null) continue
    theoNgay.set(navDate, nav)
  }

  return [...theoNgay.entries()]
    .map(([navDate, nav]) => ({ navDate, nav }))
    .sort((a, b) => a.navDate.localeCompare(b.navDate))
}
```

- [ ] **Step 4: Chạy test để thấy xanh**

```bash
npx vitest run supabase/functions/fund-refresh/navs.test.ts
```

Kỳ vọng: PASS, 23 bài.

- [ ] **Step 5: Thêm chế độ `lapLichSu` vào `index.ts`**

Chèn ngay **sau** khối `if (req.headers.get('x-cron-secret') !== CRON_SECRET) {...}` và **trước** `const kq: KetQua = ...`:

```ts
  // --- Chế độ lấp lịch sử: dựng lại account_valuations cho các phiên đã qua ---
  //
  // CSV tải về đã có đủ lịch sử từ ngày lập quỹ, nên việc này KHÔNG tốn thêm cuộc gọi nào
  // ngoài một lượt hút bình thường. Gọi tay, không nằm trong lượt cron hằng ngày.
  if (body?.lapLichSu?.accountId) {
    const accountId = body.lapLichSu.accountId as string
    try {
      const accounts = await loadFundAccounts(sb)
      const a = accounts.find((x) => x.accountId === accountId)
      if (!a) return Response.json({ loi: 'Không tìm thấy tài khoản quỹ này' }, { status: 404 })

      const danhBa = await loadFundRegistry(sb)
      // Hút lịch sử của MỌI quỹ trong danh bạ: sáu trong tám quỹ của chủ app đã bán hết
      // từ lâu nhưng vẫn có mặt trong các phiên quá khứ.
      const lichSu = new Map<string, Map<string, number>>() // assocFundCd → (ngày → nav)
      for (const f of danhBa) {
        const url =
          `https://toushin-lib.fwg.ne.jp/FdsWeb/FDST030000/csv-file-download` +
          `?isinCd=${encodeURIComponent(f.isinCd)}&associFundCd=${encodeURIComponent(f.assocFundCd)}`
        try {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const diem = parseNavHistory(new Uint8Array(await res.arrayBuffer()))
          lichSu.set(f.assocFundCd, new Map(diem.map((d) => [d.navDate, d.nav])))
        } catch (err) {
          kqLap.loi.push(`${f.assocFundCd}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      // Mọi ngày phiên xuất hiện ở BẤT KỲ quỹ nào, từ lệnh đầu tiên trở đi.
      const lenhDauTien = a.trades.map((t) => t.tradedOn).sort()[0]
      const moiNgay = new Set<string>()
      for (const theoNgay of lichSu.values())
        for (const ngay of theoNgay.keys()) if (ngay >= lenhDauTien) moiNgay.add(ngay)

      // Trần: không vượt giới hạn wall-clock của edge function. Chạy lại lấp tiếp phần
      // còn trống vì bước dưới chỉ ghi ngày CHƯA có hàng nào.
      const cacNgay = [...moiNgay].sort().slice(0, 1_500)

      // Ngày đã có hàng (bất kể auto hay manual) thì KHÔNG đè: ảnh chụp cũ có thể đã được
      // ghi bằng giá đúng của ngày đó, và số gõ tay thì luôn thắng.
      const { data: daCo, error: docErr } = await sb
        .from('account_valuations')
        .select('valued_on')
        .eq('account_id', accountId)
      if (docErr) throw docErr
      const ngayDaCo = new Set((daCo ?? []).map((r: any) => r.valued_on as string))

      const hang: any[] = []
      for (const ngay of cacNgay) {
        if (ngayDaCo.has(ngay)) continue
        const denNgay = a.trades.filter((t) => t.tradedOn <= ngay)
        if (denNgay.length === 0) continue
        const { holdings, oversold } = fundHoldingsFromTrades(denNgay)
        // Sổ lệnh có lỗ hổng thì mọi ngày đều sai — dừng hẳn, đừng ghi 900 hàng sai.
        if (oversold.length > 0) {
          return Response.json(
            { loi: `Sổ lệnh có lỗ hổng ở ${oversold.join(', ')} — kiểm fund_aliases trước` },
            { status: 400 },
          )
        }
        // Chưa mua gì (hoặc đã bán sạch) → không có gì để chụp. Ca này CÓ THẬT: tài khoản
        // trống từ 2025-04-14 tới 2025-08-28.
        if (holdings.length === 0) continue

        const navNgayDo = new Map<string, number>()
        for (const h of holdings) {
          const nav = lichSu.get(h.assocFundCd)?.get(ngay)
          if (nav != null) navNgayDo.set(h.assocFundCd, nav)
        }
        const { marketValue } = fundValue(holdings, navNgayDo)
        if (marketValue === null) continue

        hang.push({
          user_id: a.userId,
          account_id: accountId,
          valued_on: ngay,
          market_value: marketValue,
          note: `Lấp lại theo 基準価額 phiên ${ngay}`,
          source: 'auto',
        })
      }

      for (let i = 0; i < hang.length; i += 200) {
        const { error } = await sb
          .from('account_valuations')
          .upsert(hang.slice(i, i + 200), { onConflict: 'account_id,valued_on' })
        if (error) throw error
      }

      kqLap.daGhi = hang.length
      console.log('fund-refresh lapLichSu', JSON.stringify(kqLap))
      return Response.json(kqLap)
    } catch (err) {
      return Response.json(
        { loi: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  }
```

Khai `kqLap` ngay trước khối đó, và thêm `parseNavHistory` vào dòng import từ `'./navs.ts'`:

```ts
  const kqLap = { daGhi: 0, loi: [] as string[] }
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/fund-refresh/navs.ts supabase/functions/fund-refresh/navs.test.ts supabase/functions/fund-refresh/index.ts
git commit -m "feat(quy-nhat): lap lich su tu CSV — khong ton them cuoc goi nao"
```

---

## Task 11: `nhap-sao-ke-rakuten.mjs` — nhập 136 dòng sổ lệnh

**Files:**
- Create: `scripts/nhap-sao-ke-rakuten.mjs`
- Create: `scripts/testdata/rakuten-uydo-mau.csv` (**tự dựng**, không phải sao kê thật)
- Create: `scripts/nhapSaoKe.test.ts` → đặt ở `tests/nhapSaoKe.test.ts`
- Modify: `package.json` (thêm `"nhap:sao-ke": "node scripts/nhap-sao-ke-rakuten.mjs"`)

**Interfaces:**
- Consumes: bảng `fund_aliases`, `fund_trades` (Task 1); `fundHoldingsFromTrades` (Task 2).
- Produces: hàm thuần xuất từ script để test được:
  ```js
  export function docSaoKe(bytes)   // → { header: string[], dong: string[][] }
  export function locLenhQuy(dong)  // → { lenh: [...], boQua: Map<string, number> }
  export function ghepBiDanh(lenh, biDanh) // → { xong: [...], tenLa: string[] }
  export function soatSoDuAm(xong)  // → string[]  (mã quỹ có 口数 âm)
  ```

> **KHÔNG commit sao kê thật của chủ app.** Fixture phải tự dựng, và phải chứa **cả hai
> tên** của quỹ đã đổi tên — đó là cái bẫy duy nhất mà test này tồn tại để canh.

- [ ] **Step 1: Dựng fixture (Shift-JIS, tự viết, không có dữ liệu thật)**

```bash
mkdir -p scripts/testdata
```

```bash
node -e "
const fs=require('fs');
// Bảng tra ngược UTF-16 → Shift-JIS, dựng từ chính TextDecoder.
const dec=new TextDecoder('shift_jis'); const bang=new Map();
for(let hi=0x81;hi<=0xef;hi++)for(let lo=0x40;lo<=0xfc;lo++){const k=dec.decode(new Uint8Array([hi,lo]));if(k.length===1&&!bang.has(k))bang.set(k,[hi,lo]);}
const enc=s=>{const o=[];for(const c of s){const p=c.codePointAt(0);if(p<0x80)o.push(p);else{const x=bang.get(c);if(!x)throw new Error('khong ma hoa duoc '+c);o.push(...x);}}return Buffer.from(o);};
const L=[
'受渡日,約定日,取引区分,口座区分,対象証券名,単価［円/％］,数量［株/口/額面］,受渡金額（受取）,受渡金額（支払）,預り金（MRF）［円］',
'\"2026/4/14\",\"2026/4/9\",\"株式投信購入（積立）\",\"NISAつみたて投資枠\",\"楽天・プラス・Ｓ＆Ｐ５００インデックス・ファンド(楽天・プラス・Ｓ＆Ｐ５００)/再投資型\",\"17,588.00000\",\"28,429\",\"-\",\"50,000\",\"0\"',
'\"2026/4/13\",\"2026/4/8\",\"株式投信解約\",\"NISAつみたて投資枠\",\"楽天・プラス・Ｓ＆Ｐ５００インデックス・ファンド(楽天・プラス・Ｓ＆Ｐ５００)/再投資型\",\"13,893.00000\",\"19,848\",\"27,575\",\"-\",\"\"',
'\"2024/8/15\",\"2024/8/9\",\"株式投信購入（積立）\",\"NISA成長投資枠\",\"楽天・Ｓ＆Ｐ５００インデックス・ファンド(楽天・Ｓ＆Ｐ５００)/再投資型\",\"12,596.00000\",\"19,848\",\"-\",\"25,000\",\"\"',
'\"2026/4/8\",\"2026/4/8\",\"入金(クレジットカード決済ご利用分)\",\"-\",\"-\",\"-\",\"-\",\"68,725\",\"-\",\"\"',
'\"2026/4/8\",\"2026/4/8\",\"入金(楽天ポイント交換)\",\"-\",\"-\",\"-\",\"-\",\"1,275\",\"-\",\"\"',
'\"2026/4/13\",\"2026/4/13\",\"自動出金(スイープ)\",\"-\",\"-\",\"-\",\"-\",\"-\",\"387,221\",\"\"',
''].join('\r\n');
fs.writeFileSync('scripts/testdata/rakuten-uydo-mau.csv', enc(L));
console.log('da ghi', fs.statSync('scripts/testdata/rakuten-uydo-mau.csv').size, 'byte');
"
```

Fixture này cố ý dựng đúng cái bẫy: một lệnh **mua 19.848 口** dưới **tên CŨ** (2024) và một lệnh **bán 19.848 口** dưới **tên MỚI** (2026). Ghép đủ hai bí danh → số dư 28.429. Bỏ một bí danh → một quỹ âm 19.848.

- [ ] **Step 2: Viết bài test thất bại**

`tests/nhapSaoKe.test.ts`:

```ts
// Test cho các hàm thuần của scripts/nhap-sao-ke-rakuten.mjs.
//
// Ở tests/ chứ không src/: script là .mjs thuần và đọc filesystem qua `node:*`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — script viết bằng .mjs thuần, không có khai báo kiểu.
import { docSaoKe, ghepBiDanh, locLenhQuy, soatSoDuAm } from '../scripts/nhap-sao-ke-rakuten.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const mau = new Uint8Array(readFileSync(join(ROOT, 'scripts', 'testdata', 'rakuten-uydo-mau.csv')))

const SP500 = '9I31223A'
/** Bí danh ĐỦ — cả tên cũ lẫn tên mới trỏ về cùng một quỹ. */
const BI_DANH_DU = new Map([
  ['楽天・プラス・Ｓ＆Ｐ５００インデックス・ファンド(楽天・プラス・Ｓ＆Ｐ５００)/再投資型', SP500],
  ['楽天・Ｓ＆Ｐ５００インデックス・ファンド(楽天・Ｓ＆Ｐ５００)/再投資型', SP500],
])
/** Bí danh THIẾU tên cũ — đúng cái bẫy đã đo được. */
const BI_DANH_THIEU = new Map([
  ['楽天・プラス・Ｓ＆Ｐ５００インデックス・ファンド(楽天・プラス・Ｓ＆Ｐ５００)/再投資型', SP500],
])

describe('docSaoKe', () => {
  it('đọc Shift-JIS, header ra đúng chữ Nhật', () => {
    const { header } = docSaoKe(mau)
    expect(header[0]).toBe('受渡日')
    expect(header[1]).toBe('約定日')
    expect(header[4]).toBe('対象証券名')
  })

  it('từ chối file không phải sao kê 受渡履歴', () => {
    expect(() => docSaoKe(new TextEncoder().encode('a,b,c\n1,2,3\n'))).toThrow(/受渡日/)
  })

  it('KHÔNG đọc được nếu file là UTF-8 — bài canh chống bẫy Shift-JIS', () => {
    const utf8 = new TextEncoder().encode('受渡日,約定日,取引区分\r\n"a","b","c"\r\n')
    expect(() => docSaoKe(utf8)).toThrow()
  })
})

describe('locLenhQuy', () => {
  it('chỉ nhận ba loại lệnh quỹ, đếm và nêu tên mọi loại đã bỏ', () => {
    const { lenh, boQua } = locLenhQuy(docSaoKe(mau).dong)
    expect(lenh).toHaveLength(3)
    // Ba dòng tiền phải bị bỏ, và phải được NÊU TÊN — bỏ im lặng là chỗ dễ mất dữ liệu.
    expect(boQua.get('入金(クレジットカード決済ご利用分)')).toBe(1)
    expect(boQua.get('入金(楽天ポイント交換)')).toBe(1)
    expect(boQua.get('自動出金(スイープ)')).toBe(1)
  })

  it('dùng cột 約定日 làm traded_on, KHÔNG dùng 受渡日', () => {
    const { lenh } = locLenhQuy(docSaoKe(mau).dong)
    const muaMoi = lenh.find((l) => l.units === 28_429)
    // 受渡 2026/4/14, 約定 2026/4/9 — lệch 5 ngày. Lấy nhầm cột thì mọi phép lấp lịch sử
    // và mọi phép đối chiếu NAV đều lệch.
    expect(muaMoi.tradedOn).toBe('2026-04-09')
  })

  it('bóc đúng số: bỏ dấu phẩy, `-` thành 0, đơn giá làm tròn về số nguyên', () => {
    const { lenh } = locLenhQuy(docSaoKe(mau).dong)
    const muaMoi = lenh.find((l) => l.units === 28_429)
    expect(muaMoi.nav).toBe(17_588)
    expect(muaMoi.amount).toBe(50_000)
    expect(muaMoi.kind).toBe('buy')
    expect(muaMoi.bucket).toBe('NISAつみたて投資枠')
    const banRa = lenh.find((l) => l.kind === 'sell')
    // Lệnh bán lấy số tiền ở cột 受渡金額（受取）, không phải cột （支払）.
    expect(banRa.amount).toBe(27_575)
  })
})

describe('ghepBiDanh + soatSoDuAm — bẫy quỹ đổi tên', () => {
  it('đủ bí danh → mọi tên ghép được, số dư khớp', () => {
    const { lenh } = locLenhQuy(docSaoKe(mau).dong)
    const { xong, tenLa } = ghepBiDanh(lenh, BI_DANH_DU)
    expect(tenLa).toEqual([])
    expect(soatSoDuAm(xong)).toEqual([])
    // 19.848 (mua, tên cũ) − 19.848 (bán, tên mới) + 28.429 (mua, tên mới) = 28.429
    const tong = xong
      .filter((l) => l.assocFundCd === SP500)
      .reduce((s, l) => s + (l.kind === 'sell' ? -l.units : l.units), 0)
    expect(tong).toBe(28_429)
  })

  it('THIẾU bí danh tên cũ → tên lạ được nêu ra, KHÔNG đoán bừa', () => {
    const { lenh } = locLenhQuy(docSaoKe(mau).dong)
    const { xong, tenLa } = ghepBiDanh(lenh, BI_DANH_THIEU)
    expect(tenLa).toHaveLength(1)
    expect(tenLa[0]).toContain('楽天・Ｓ＆Ｐ５００')
    // Và nếu ai đó lỡ bỏ qua cảnh báo tên lạ, số dư âm là chốt canh thứ hai.
    expect(soatSoDuAm(xong)).toEqual([SP500])
  })
})
```

- [ ] **Step 3: Chạy test để thấy nó đỏ**

```bash
npx vitest run tests/nhapSaoKe.test.ts
```

Kỳ vọng: FAIL — không import được `../scripts/nhap-sao-ke-rakuten.mjs`.

- [ ] **Step 4: Viết script**

`scripts/nhap-sao-ke-rakuten.mjs`:

```js
// Nhập sao kê 受渡履歴 của Rakuten Securities vào bảng `fund_trades`.
//
// Chạy TAY, một lần. Không có giao diện: 136 dòng một lần, vài tháng mới lặp lại — làm
// giao diện nhập file là công sức không thu hồi được.
//
// Chạy:
//   node scripts/nhap-sao-ke-rakuten.mjs "<đường dẫn csv>" --account <uuid>          (xem trước)
//   node scripts/nhap-sao-ke-rakuten.mjs "<đường dẫn csv>" --account <uuid> --ghi     (ghi thật)
//
// `--ghi` hỏi SUPABASE_SERVICE_ROLE_KEY ở ô nhập KÍN (không hiện lên màn hình, không vào
// argv, không vào lịch sử shell) — cùng cách setup-stock-cron.mjs nhận secret cron. Khoá
// đó chỉ được xuất hiện trong terminal của chủ app.
//
// BỐN CÁI BẪY của file sao kê, cả bốn đều đã đo thật:
//
// ① File là Shift-JIS. Đọc bằng utf-8 thì cột SỐ vẫn đúng, chỉ cột NGÀY và TÊN QUỸ ra
//    rác — nghĩa là bảng bí danh không khớp dòng nào, và lỗi trông như "tên quỹ lạ".
//
// ② Có HAI cột ngày: 受渡日 (tiền về) và 約定日 (khớp lệnh). 基準価額 thuộc về 約定日.
//    Trên sao kê thật hai ngày lệch tới 5 ngày (受渡 2026/4/14 ⇄ 約定 2026/4/9).
//
// ③ MỘT QUỸ NẰM DƯỚI HAI TÊN. Rakuten đổi tên loạt 「楽天・プラス」 ngày 2024-10-17, nên
//    một sao kê chứa cả tên cũ lẫn tên mới của cùng một quỹ. Ghép theo tên một cách ngây
//    thơ cho ra 口数 ÂM (đã đo: S&P500 −19.848, VTI −10.232). Vì vậy bảng bí danh nằm
//    trong DB (`fund_aliases`), và có bất biến "không quỹ nào được âm" chặn ở bước 4.
//
// ④ File trộn lệnh quỹ với DÒNG TIỀN (nạp thẻ, điểm Rakuten, thuế, quét tiền) và trộn
//    NISA với 特定口座. Chỉ ba loại `取引区分` được nhận; mọi loại bị bỏ đều được ĐẾM VÀ
//    NÊU TÊN, không bỏ im lặng.
//
// Xem thêm: docs/quy-nhat.md

import { createInterface } from 'node:readline'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** Ba loại lệnh quỹ. Mọi 取引区分 khác là dòng tiền — xem bẫy ④. */
const LOAI_MUA = new Set(['株式投信購入（積立）', '株式投信購入'])
const LOAI_BAN = new Set(['株式投信解約'])

/** Chỉ số cột, đếm từ 0. Đặt tên vì `o[6]` ở giữa file là câu đố. */
const COT = {
  uyDo: 0,
  ky: 1, // 約定日 — cột được dùng; xem bẫy ②
  loai: 2,
  vi: 3, // 口座区分
  ten: 4, // 対象証券名
  donGia: 5, // 基準価額, ¥/10.000口
  soLuong: 6, // 口数
  thu: 7, // 受渡金額（受取） — lệnh BÁN
  chi: 8, // 受渡金額（支払） — lệnh MUA
}

/** '1,234' / '-' / '' → số nguyên; không đọc được thì 0. */
function so(s) {
  if (s == null) return 0
  const v = Number(String(s).replace(/,/g, '').replace(/^-$/, '0').trim())
  return Number.isFinite(v) ? Math.round(v) : 0
}

/** '2026/4/9' → '2026-04-09'; null nếu không đúng dạng. */
function ngaySangISO(s) {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(String(s ?? '').trim())
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

/**
 * Byte sao kê → header + các dòng đã tách ô.
 *
 * Giải mã Shift-JIS nằm TRONG hàm này (nhận Uint8Array, không nhận string) để bài test
 * bắt được nếu ai đó đổi sang utf-8 — xem bẫy ①. Header không ra `受渡日` thì NÉM LỖI,
 * không đoán: đọc nhầm định dạng rồi ghi 136 dòng rác vào DB là chuyện phải chặn ở đây.
 */
export function docSaoKe(bytes) {
  const text = new TextDecoder('shift_jis').decode(bytes)
  const dong = text.split(/\r?\n/).filter((d) => d.trim())
  const header = (dong[0] ?? '').split(',').map((s) => s.replace(/^"|"$/g, '').trim())
  if (header[0] !== '受渡日')
    throw new Error(
      `Không phải sao kê 受渡履歴 của Rakuten (cột đầu là "${header[0]}", cần "受渡日"). ` +
        `Nếu bạn thấy chữ rác thì file đã bị chuyển sang UTF-8 — tải lại bản gốc.`,
    )
  // Mọi ô đều được bọc "…" và không ô nào chứa dấu phẩy bên trong (đã kiểm trên file
  // thật), nên tách bằng split là đủ — không cần một trình đọc CSV đầy đủ.
  return {
    header,
    dong: dong.slice(1).map((d) => d.split(',').map((s) => s.replace(/^"|"$/g, ''))),
  }
}

/**
 * Lọc ra lệnh quỹ, bỏ dòng tiền. Mọi loại bị bỏ được ĐẾM VÀ NÊU TÊN — xem bẫy ④.
 *
 * `tradedOn` lấy cột 約定日, không phải 受渡日 — xem bẫy ②.
 */
export function locLenhQuy(dong) {
  const lenh = []
  const boQua = new Map()
  for (const o of dong) {
    const loai = (o[COT.loai] ?? '').trim()
    const laMua = LOAI_MUA.has(loai)
    const laBan = LOAI_BAN.has(loai)
    if (!laMua && !laBan) {
      boQua.set(loai, (boQua.get(loai) ?? 0) + 1)
      continue
    }
    const tradedOn = ngaySangISO(o[COT.ky])
    if (tradedOn === null) {
      boQua.set(`${loai} (ngày hỏng)`, (boQua.get(`${loai} (ngày hỏng)`) ?? 0) + 1)
      continue
    }
    lenh.push({
      tenSaoKe: (o[COT.ten] ?? '').trim(),
      kind: laMua ? 'buy' : 'sell',
      tradedOn,
      units: so(o[COT.soLuong]),
      nav: so(o[COT.donGia]),
      // Mua thì tiền ở cột （支払）, bán thì ở cột （受取）. Lấy nhầm cột là amount = 0 và
      // CHECK fund_trades_shape từ chối cả dòng.
      amount: laMua ? so(o[COT.chi]) : so(o[COT.thu]),
      bucket: (o[COT.vi] ?? '').replace(/^-$/, '').trim(),
    })
  }
  return { lenh, boQua }
}

/**
 * Ghép tên quỹ trong sao kê → 協会コード qua bảng bí danh.
 *
 * So khớp CHÍNH XÁC, không so gần đúng: hai quỹ Rakuten có tên khác nhau đúng ba ký tự
 * (`・プラス`) và có 基準価額 khác nhau. Một phép so gần đúng ở đây sẽ cộng tiền vào nhầm
 * quỹ mà không ai biết.
 *
 * Tên không có trong bảng được trả về trong `tenLa` để nơi gọi DỪNG — không đoán.
 */
export function ghepBiDanh(lenh, biDanh) {
  const xong = []
  const tenLa = new Set()
  for (const l of lenh) {
    const ma = biDanh.get(l.tenSaoKe)
    if (!ma) {
      tenLa.add(l.tenSaoKe)
      continue
    }
    xong.push({ ...l, assocFundCd: ma })
  }
  return { xong, tenLa: [...tenLa] }
}

/**
 * Bất biến: sau khi ghép, KHÔNG quỹ nào được kết thúc với 口数 âm.
 *
 * Đây là phép thử đã bắt được CẢ HAI lần đổi tên (xem bẫy ③) — bảng bí danh thiếu một
 * dòng thì số âm hiện ra ngay, không cần ai đi soi. Cộng dồn theo 約定日 vì sao kê xếp
 * mới nhất trước.
 */
export function soatSoDuAm(xong) {
  const duNo = new Map()
  for (const l of [...xong].sort((a, b) => a.tradedOn.localeCompare(b.tradedOn))) {
    const truoc = duNo.get(l.assocFundCd) ?? 0
    duNo.set(l.assocFundCd, truoc + (l.kind === 'sell' ? -l.units : l.units))
  }
  return [...duNo.entries()]
    .filter(([, v]) => v < 0)
    .map(([ma]) => ma)
    .sort()
}

/** Hỏi một giá trị ở ô nhập KÍN — không hiện lên màn hình, không vào argv. */
function hoiKin(cauHoi) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    // Bịt echo: ghi đè _writeToOutput như setup-stock-cron.mjs đang làm.
    rl._writeToOutput = () => {}
    process.stdout.write(cauHoi)
    rl.question('', (v) => {
      rl.close()
      process.stdout.write('\n')
      // Bracketed paste: terminal bọc nội dung dán giữa ESC[200~ và ESC[201~, và readline
      // không phải lúc nào cũng bóc ra. Vì ô nhập cố tình không hiện gì, chuỗi bẩn không
      // có dấu hiệu nào trên màn hình.
      resolve(v.replace(/\u001b\[20[01]~/g, '').replace(/[\u0000-\u001f\u007f]/g, '').trim())
    })
  })
}

async function chinh() {
  const duongDan = process.argv[2]
  const accountId = process.argv[process.argv.indexOf('--account') + 1]
  const GHI = process.argv.includes('--ghi')
  if (!duongDan || !accountId || accountId.startsWith('--')) {
    console.error(
      'Dùng: node scripts/nhap-sao-ke-rakuten.mjs "<csv>" --account <uuid> [--ghi]',
    )
    process.exit(1)
  }

  const { dong } = docSaoKe(new Uint8Array(readFileSync(duongDan)))
  const { lenh, boQua } = locLenhQuy(dong)

  console.log(`\nĐọc ${dong.length} dòng dữ liệu → ${lenh.length} lệnh quỹ.`)
  console.log('Đã bỏ (không phải lệnh quỹ):')
  for (const [loai, n] of [...boQua].sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(4)}  ${loai}`)

  const url = docEnv('VITE_SUPABASE_URL')
  const khoa = GHI
    ? await hoiKin('SUPABASE_SERVICE_ROLE_KEY (không hiện lên màn hình): ')
    : docEnv('VITE_SUPABASE_ANON_KEY')

  // Bảng bí danh đọc từ DB, không phải hằng số trong script: lần sau Rakuten đổi tên nữa
  // thì thêm một hàng vào `fund_aliases`, không sửa code.
  const biDanh = new Map(
    (await goi(url, khoa, 'fund_aliases?select=statement_name,assoc_fund_cd')).map((r) => [
      r.statement_name,
      r.assoc_fund_cd,
    ]),
  )

  const { xong, tenLa } = ghepBiDanh(lenh, biDanh)
  if (tenLa.length > 0) {
    console.error('\nDỪNG — có tên quỹ không có trong bảng `fund_aliases`:')
    for (const t of tenLa) console.error(`  ${t}`)
    console.error(
      '\nThêm một hàng vào fund_aliases cho mỗi tên trên rồi chạy lại. KHÔNG đoán:\n' +
        'hai quỹ Rakuten có tên khác nhau đúng ba ký tự và có 基準価額 khác nhau.',
    )
    process.exit(1)
  }

  const am = soatSoDuAm(xong)
  if (am.length > 0) {
    console.error(`\nDỪNG — số 口数 ÂM ở: ${am.join(', ')}`)
    console.error(
      'Gần chắc là `fund_aliases` còn thiếu một dòng: quỹ đã đổi tên và nửa lịch sử\n' +
        'đang ghép vào một mã khác. Xem docs/quy-nhat.md, mục "quỹ đổi tên".',
    )
    process.exit(1)
  }

  // Đối chiếu để so tay với app Rakuten.
  const duNo = new Map()
  const von = new Map()
  for (const l of [...xong].sort((a, b) => a.tradedOn.localeCompare(b.tradedOn))) {
    const u = duNo.get(l.assocFundCd) ?? 0
    const v = von.get(l.assocFundCd) ?? 0
    if (l.kind === 'sell') {
      const conLai = Math.max(0, u - l.units)
      von.set(l.assocFundCd, u > 0 ? Math.round((v * conLai) / u) : 0)
      duNo.set(l.assocFundCd, conLai)
    } else {
      duNo.set(l.assocFundCd, u + l.units)
      von.set(l.assocFundCd, v + l.amount)
    }
  }
  console.log('\nCòn giữ (so tay với app Rakuten):')
  for (const [ma, u] of [...duNo].sort())
    console.log(`  ${ma}  ${String(u).padStart(9)} 口   vốn ${String(von.get(ma) ?? 0).padStart(9)} ¥`)

  if (!GHI) {
    console.log('\n(xem trước — thêm --ghi để ghi thật)')
    return
  }

  // Idempotent: khoá trùng là (account, quỹ, ngày, loại, 口数, tiền). Chạy lại cùng file
  // không sinh dòng thứ hai.
  const daCo = new Set(
    (
      await goi(
        url,
        khoa,
        `fund_trades?select=assoc_fund_cd,traded_on,kind,units,amount&account_id=eq.${accountId}`,
      )
    ).map((r) => `${r.assoc_fund_cd}|${r.traded_on}|${r.kind}|${r.units}|${r.amount}`),
  )
  const userId = (await goi(url, khoa, `accounts?select=user_id&id=eq.${accountId}`))[0]?.user_id
  if (!userId) throw new Error('Không tìm thấy tài khoản này.')

  const moi = xong
    .filter((l) => !daCo.has(`${l.assocFundCd}|${l.tradedOn}|${l.kind}|${l.units}|${l.amount}`))
    .map((l) => ({
      user_id: userId,
      account_id: accountId,
      assoc_fund_cd: l.assocFundCd,
      kind: l.kind,
      traded_on: l.tradedOn,
      units: l.units,
      nav: l.nav,
      amount: l.amount,
      bucket: l.bucket,
      note: '',
    }))

  console.log(`\nGhi ${moi.length} lệnh mới (${xong.length - moi.length} lệnh đã có sẵn).`)
  for (let i = 0; i < moi.length; i += 200) await ghiVao(url, khoa, moi.slice(i, i + 200))
  console.log('Xong.')
}

function docEnv(ten) {
  const t = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  const v = t.match(new RegExp(`^${ten}=(.+)$`, 'm'))?.[1]?.trim()
  if (!v) throw new Error(`Thiếu ${ten} trong .env.local`)
  return v
}

async function goi(url, khoa, duong) {
  const res = await fetch(`${url}/rest/v1/${duong}`, {
    headers: { apikey: khoa, Authorization: `Bearer ${khoa}` },
  })
  if (!res.ok) throw new Error(`GET ${duong}: HTTP ${res.status} ${await res.text()}`)
  return res.json()
}

async function ghiVao(url, khoa, hang) {
  const res = await fetch(`${url}/rest/v1/fund_trades`, {
    method: 'POST',
    headers: {
      apikey: khoa,
      Authorization: `Bearer ${khoa}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(hang),
  })
  if (!res.ok) throw new Error(`POST fund_trades: HTTP ${res.status} ${await res.text()}`)
}

// Chạy trực tiếp thì làm việc; được test import thì không làm gì.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await chinh()
}
```

- [ ] **Step 5: Chạy test để thấy xanh**

```bash
npx vitest run tests/nhapSaoKe.test.ts
```

Kỳ vọng: PASS, 8 bài. Hai bài quan trọng nhất là cặp `ghepBiDanh + soatSoDuAm` — chúng dựng lại đúng cái bẫy quỹ đổi tên.

- [ ] **Step 6: Thêm script vào `package.json`**

```json
    "nhap:sao-ke": "node scripts/nhap-sao-ke-rakuten.mjs",
```

- [ ] **Step 7: Commit**

```bash
git add scripts/nhap-sao-ke-rakuten.mjs scripts/testdata tests/nhapSaoKe.test.ts package.json
git commit -m "feat(quy-nhat): script nhap sao ke Rakuten — bat bien 口数 am chan quy doi ten"
```

---

## Task 12: `FundHoldingsSection` — khu "Danh mục quỹ"

**Files:**
- Create: `src/features/assets/FundHoldingsSection.tsx`
- Modify: `src/features/assets/AccountDetailPage.tsx:477-486` (thêm nhánh JPY)

**Interfaces:**
- Consumes: `useFunds`, `useFundPrices`, `useFundTrades` (Task 6); `fundHoldingsFromTrades`, `sessionNavs`, `fundValue`, `NAV_UNITS` (Task 2).
- Produces: `<FundHoldingsSection account onAddTrade onEditTrade />` — cùng hình dạng props với `HoldingsSection` trừ `balance` (mô hình quỹ không dùng số dư sổ).

- [ ] **Step 1: Viết component**

```tsx
// Khu "Danh mục quỹ" trên trang chi tiết tài khoản đầu tư JPY: từng quỹ đang giữ, 取得単価,
// 基準価額 mới nhất, và lãi/lỗ.
//
// File riêng (không nhét vào AccountDetailPage) vì trang đó đã hơn 500 dòng. Mọi phép tính
// nằm ở fundHoldings.ts — ở đây chỉ đọc dữ liệu và bày ra.
//
// KHÁC HoldingsSection (cổ phiếu Việt Nam) ở hai chỗ đáng nói:
//  · Không có dòng "Tiền chưa đầu tư": Rakuten tự quét sạch tiền dư về 楽天銀行, tài khoản
//    không giữ tiền nhàn rỗi. Xem fundHoldings.ts, lý do 3.
//  · Lãi/lỗ ở đây tính từ giá vốn của SỔ LỆNH, nên khớp app Rakuten bất kể sổ thu chi có
//    ghi đủ các lần nạp tiền hay không. Ô "Hiệu quả đầu tư" ở cấp tài khoản thì vẫn dùng
//    số dư sổ và sẽ KHÔNG khớp — đó là giới hạn đã biết, xem spec.
import { useMemo } from 'react'
import { Guide } from '../../components/Guide'
import { EstimateMark } from '../../components/EstimateMark'
import { Card, Money, SectionTitle } from '../../components/ui'
import { useFundPrices, useFunds, useFundTrades } from '../../hooks/queries'
import type { AccountRow, FundTradeRow } from '../../types/database.types'
import {
  fundHoldingsFromTrades,
  fundValue,
  sessionNavs,
  NAV_UNITS,
  type FundTrade,
} from './fundHoldings'

interface Props {
  account: AccountRow
  onAddTrade: () => void
  onEditTrade: (trade: FundTradeRow) => void
}

const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1).replace('.', ',')}%`

/** Ngày ISO → dd/mm để đọc nhanh. */
const ngayNgan = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`

export function FundHoldingsSection({ account, onAddTrade, onEditTrade }: Props) {
  const { data: allTrades = [] } = useFundTrades()
  const { data: navRows = [] } = useFundPrices()
  const { data: funds = [] } = useFunds()

  const trades = useMemo(
    () => allTrades.filter((t) => t.account_id === account.id),
    [allTrades, account.id],
  )

  const { session, navByFund, staleFunds } = useMemo(() => sessionNavs(navRows), [navRows])
  const tenQuy = useMemo(() => new Map(funds.map((f) => [f.assoc_fund_cd, f.name])), [funds])

  const asTrades: FundTrade[] = useMemo(
    () =>
      trades.map((t) => ({
        assocFundCd: t.assoc_fund_cd,
        kind: t.kind,
        tradedOn: t.traded_on,
        units: t.units,
        nav: t.nav,
        amount: t.amount,
      })),
    [trades],
  )

  const { holdings, realizedPnl, oversold } = useMemo(
    () => fundHoldingsFromTrades(asTrades),
    [asTrades],
  )
  const value = useMemo(() => fundValue(holdings, navByFund), [holdings, navByFund])

  // Quỹ đang giữ, có giá hợp lệ nhưng giá đó cũ hơn phiên chung. Loại khỏi đây những quỹ đã
  // rơi vào missingNavs: một quỹ chỉ nên bị nêu MỘT lần, và "chưa có giá" đã nói đủ.
  const stale = useMemo(
    () =>
      holdings
        .filter((h) => staleFunds.has(h.assocFundCd) && !value.missingNavs.includes(h.assocFundCd))
        .map((h) => h.assocFundCd),
    [holdings, staleFunds, value.missingNavs],
  )

  const giaVon = useMemo(() => holdings.reduce((s, h) => s + h.costBasis, 0), [holdings])

  if (trades.length === 0) {
    return (
      <Card as="section" className="mb-3">
        <SectionTitle>Danh mục quỹ</SectionTitle>
        <Guide className="mt-2 text-xs text-fg-muted">
          Ghi lệnh mua/bán quỹ để app tự lấy 基準価額 mỗi ngày và tính lời/lỗ từng quỹ.
        </Guide>
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

  // Điều kiện currency === 'JPY' đã được lọc ở AccountDetailPage trước khi render.
  const currency = account.currency

  return (
    <Card as="section" className="mb-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <SectionTitle>Danh mục quỹ</SectionTitle>
        <button
          type="button"
          onClick={onAddTrade}
          className="shrink-0 text-xs font-semibold text-green-700 dark:text-green-400"
        >
          + Ghi lệnh
        </button>
      </div>

      <ul className="divide-y divide-border-subtle">
        {holdings.map((h) => {
          const nav = navByFund.get(h.assocFundCd)
          const thieuGia = nav == null || nav <= 0
          const giaCu = !thieuGia && staleFunds.has(h.assocFundCd)
          const navVal = nav ?? 0
          // Làm tròn TỪNG quỹ, đúng như fundValue — để tổng dưới bằng đúng tổng các dòng
          // trên. Cộng số chưa làm tròn ở đây rồi so với tổng đã làm tròn là mời một câu
          // hỏi "sao cộng tay lại lệch một yên".
          const giaTri = thieuGia ? h.costBasis : Math.round((h.units * navVal) / NAV_UNITS)
          const lai = giaTri - h.costBasis
          const laiPct = h.costBasis > 0 ? lai / h.costBasis : null
          return (
            <li key={h.assocFundCd} className="flex items-baseline justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg-primary">
                  {tenQuy.get(h.assocFundCd) || h.assocFundCd}
                </p>
                <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1 text-2xs text-fg-secondary">
                  <span>{h.units.toLocaleString('vi-VN')} 口</span>
                  <span>· vốn</span>
                  <Money amount={h.avgNav} currency={currency} className="text-2xs" />
                  {thieuGia ? (
                    <span>· chưa có giá</span>
                  ) : (
                    <>
                      <span>· {giaCu ? 'giá cũ' : 'nay'}</span>
                      <Money amount={navVal} currency={currency} className="text-2xs" />
                    </>
                  )}
                  {/* 基準価額 là giá trên 10.000 口, không phải trên 1 口. Không nói ra thì
                      hai con số "vốn" và "nay" trông như đơn giá và người đọc sẽ tự nhân
                      với số 口 rồi thấy lệch 10.000 lần. */}
                  <span className="text-fg-muted">/1万口</span>
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Money amount={giaTri} currency={currency} className="text-sm font-semibold" />
                {giaCu && (
                  <EstimateMark reason="Tính theo 基準価額 của phiên trước, chưa có phiên mới nhất." />
                )}
                <p className="text-2xs">
                  <Money
                    amount={Math.abs(lai)}
                    currency={currency}
                    tone={lai >= 0 ? 'in' : 'out'}
                    showSign
                    className="text-2xs"
                  />
                  {laiPct !== null && <span className="ml-1 text-fg-muted">{pct(laiPct)}</span>}
                </p>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 space-y-1 border-t border-border-subtle pt-2 text-xs">
        <p className="flex items-baseline justify-between text-fg-secondary">
          <span>Giá vốn</span>
          <Money amount={giaVon} currency={currency} className="font-semibold" />
        </p>

        {realizedPnl !== 0 && (
          <p className="flex items-baseline justify-between text-fg-secondary">
            <span>Lãi đã chốt</span>
            <Money
              amount={Math.abs(realizedPnl)}
              currency={currency}
              tone={realizedPnl >= 0 ? 'in' : 'out'}
              showSign
              className="font-semibold"
            />
          </p>
        )}

        {value.marketValue !== null && (
          <p className="flex items-baseline justify-between pt-1 text-fg-primary">
            <span className="font-semibold">Tổng giá trị</span>
            <Money amount={value.marketValue} currency={currency} className="font-bold" />
          </p>
        )}

        <p className="pt-1 text-3xs text-fg-muted">
          {session ? `theo 基準価額 phiên ${ngayNgan(session)}` : 'chưa có bảng giá'}
        </p>
      </div>

      {value.missingNavs.length > 0 && (
        <p className="mt-2 text-2xs text-amber-700 dark:text-amber-300">
          Chưa có 基準価額 cho{' '}
          {value.missingNavs.map((m) => tenQuy.get(m) || m).join(', ')} — mấy quỹ này đang tạm
          tính theo giá vốn nên tổng có thể lệch.
        </p>
      )}

      {stale.length > 0 && (
        <p className="mt-2 text-2xs text-amber-700 dark:text-amber-300">
          {stale.map((m) => tenQuy.get(m) || m).join(', ')} chưa có giá phiên{' '}
          {session ? ngayNgan(session) : 'mới nhất'} — tổng trên đang tính theo phiên trước
          của mấy quỹ này.
        </p>
      )}

      {oversold.length > 0 && (
        <p className="mt-2 text-2xs text-amber-700 dark:text-amber-300">
          {oversold.map((m) => tenQuy.get(m) || m).join(', ')}: sổ lệnh ghi bán nhiều 口数 hơn
          số đang giữ. Thường là quỹ đã ĐỔI TÊN và nửa lịch sử đang ghép vào một mã khác —
          xem docs/quy-nhat.md.
        </p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-fg-secondary">
          Sổ lệnh ({trades.length})
        </summary>
        <ul className="mt-2 divide-y divide-border-subtle">
          {trades.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onEditTrade(t)}
                className="flex w-full items-baseline justify-between gap-3 py-2 text-left"
              >
                <span className="min-w-0 truncate text-xs text-fg-secondary">
                  {ngayNgan(t.traded_on)} ·{' '}
                  <b className="text-fg-primary">{tenQuy.get(t.assoc_fund_cd) || t.assoc_fund_cd}</b>{' '}
                  {t.kind === 'buy' ? 'mua' : t.kind === 'sell' ? 'bán' : 'điều chỉnh'}
                </span>
                <span className="shrink-0 text-2xs tabular-nums text-fg-muted">
                  {t.units.toLocaleString('vi-VN')} 口
                  {t.kind !== 'adjust' && (
                    <>
                      {' · '}
                      <Money amount={t.amount} currency={currency} className="text-2xs text-fg-muted" />
                    </>
                  )}
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

- [ ] **Step 2: Nối vào `AccountDetailPage.tsx`**

Thêm import `FundHoldingsSection` và `FundTradeRow`, thêm state cạnh `tradeSheet`:

```tsx
  const [fundSheet, setFundSheet] = useState<{ trade: FundTradeRow | null } | null>(null)
```

Chèn ngay **sau** khối `{isInvestment && account && account.currency === 'VND' && (...)}` (dòng 479–486):

```tsx
      {/* Danh mục quỹ (chỉ tài khoản đầu tư JPY — 基準価額 là yên trên 10.000 口, tài
          khoản VND dùng khu này sẽ ra số vô nghĩa) */}
      {isInvestment && account && account.currency === 'JPY' && (
        <FundHoldingsSection
          account={account}
          onAddTrade={() => setFundSheet({ trade: null })}
          onEditTrade={(trade) => setFundSheet({ trade })}
        />
      )}
```

Sheet sẽ được nối ở Task 13; tạm thời `fundSheet` chưa được dùng ở đâu — thêm `void fundSheet` **không** phải cách xử lý; thay vào đó **làm Task 13 ngay sau Task 12 trong cùng một lượt** để không để lại biến chưa dùng (lint sẽ đỏ).

- [ ] **Step 3: Kiểm biên dịch (sẽ còn cảnh báo biến chưa dùng cho tới hết Task 13)**

```bash
npx tsc -b
```

Kỳ vọng: không lỗi kiểu. Lỗi lint về `fundSheet` chưa dùng là bình thường ở bước này.

- [ ] **Step 4: Commit sau khi Task 13 xong** (không commit riêng task này — xem Task 13, Step 5)

---

## Task 13: `FundTradeFormSheet` — sửa/thêm lệnh lẻ

**Files:**
- Create: `src/features/assets/FundTradeFormSheet.tsx`
- Modify: `src/features/assets/AccountDetailPage.tsx` (render sheet)

**Interfaces:**
- Consumes: `useFunds`, `useCreateFundTrade`, `useUpdateFundTrade`, `useDeleteFundTrade` (Task 6); `NAV_UNITS` (Task 2).
- Produces: `<FundTradeFormSheet account trade onClose />`.

- [ ] **Step 1: Đọc `TradeFormSheet.tsx` trước khi viết**

```bash
sed -n '1,80p' src/features/assets/TradeFormSheet.tsx
```

Bắt chước **đúng** khuôn của nó: cách mở/đóng sheet, cách dùng `MoneyField`, cách bố trí nút Lưu/Xoá, cách báo lỗi. Đừng phát minh một kiểu sheet mới — repo đã có một kiểu.

- [ ] **Step 2: Viết sheet**

Yêu cầu bắt buộc, mỗi cái một lý do:

| Ô | Ràng buộc |
|---|---|
| Ngày | Nhãn phải ghi rõ **"Ngày khớp (約定日)"**. Người dùng cầm sao kê có hai cột ngày; không ghi rõ thì họ gõ 受渡日 và lệch tới 5 ngày. |
| Quỹ | `<select>` từ `useFunds()`, hiện `name`. Không cho gõ tay mã. |
| Mua/Bán/Điều chỉnh | Ba lựa chọn. Chọn "Điều chỉnh" thì ô 基準価額 và ô Số tiền **ẩn đi và bị đặt về 0** — `CHECK fund_trades_shape` đòi vậy, và ẩn còn tốt hơn để người dùng gõ vào rồi bị từ chối. |
| 口数 | Số nguyên. Với mua/bán phải > 0. |
| 基準価額 | `MoneyField`, nhãn ghi rõ **"¥ / 10.000 口"**. Thiếu chú thích đó thì con số 17.588 trông như đơn giá một 口. |
| Số tiền | `MoneyField`. Khi người dùng gõ xong 口数 và 基準価額, ô này **tự gợi ý** `Math.round(units * nav / NAV_UNITS)` **nhưng cho sửa** — số thật trên sao kê mới là số được lưu (đo thật: gợi ý ra 49.997, số thật là 50.000). |
| Nút Lưu | Chặn khi thiếu ô bắt buộc, và **nói thiếu gì** thay vì chỉ mờ đi. |

Chú thích dưới ô Số tiền, đúng nguyên văn:

```tsx
<Guide className="text-3xs text-fg-muted">
  Gợi ý tính từ 口数 × 基準価額 ÷ 10.000. Sao kê Rakuten thường lệch vài yên do làm tròn —
  cứ sửa cho khớp số thật, app lấy số bạn nhập làm giá vốn.
</Guide>
```

- [ ] **Step 3: Render sheet trong `AccountDetailPage.tsx`**

Cạnh chỗ `tradeSheet` đang được render:

```tsx
      {fundSheet && account && (
        <FundTradeFormSheet
          account={account}
          trade={fundSheet.trade}
          onClose={() => setFundSheet(null)}
        />
      )}
```

- [ ] **Step 4: Kiểm bằng chế độ demo — đây là bước chứng minh, không phải hình thức**

```bash
npm run dev -- --mode demo
```

Mở tài khoản **NISA Rakuten** (đầu tư JPY) và xác nhận **bốn** điều:

1. Khu "Danh mục quỹ" hiện hai quỹ, **Tổng giá trị 80.757 ¥**, **Giá vốn 70.000 ¥**.
2. Dòng lãi/lỗ hiện **+10.757 ¥** và **+15,4%** (repo làm tròn 1 chữ số; app Rakuten cắt đuôi thành 15,36% — **không phải sai lệch cần sửa**).
3. Mỗi dòng quỹ có chú thích `/1万口` cạnh 基準価額.
4. Bấm "+ Ghi lệnh" → sheet mở; gõ 口数 `28429` và 基準価額 `17588` → ô Số tiền tự gợi ý **49.997**; sửa thành `50000` được và lưu được.

Nếu con số ở (1) hoặc (2) khác, **dừng lại** — lỗi nằm ở tầng dưới, không phải ở UI.

- [ ] **Step 5: Kiểm toàn bộ rồi commit**

```bash
npm test && npx tsc -b && npm run lint
```

```bash
git add src/features/assets/FundHoldingsSection.tsx src/features/assets/FundTradeFormSheet.tsx src/features/assets/AccountDetailPage.tsx
git commit -m "feat(quy-nhat): khu Danh muc quy + sheet ghi lenh, khop tung yen voi Rakuten"
```

---

## Task 14: Tài liệu + secret cron giờ có BA job

**Files:**
- Create: `docs/quy-nhat.md`
- Create: `scripts/setup-fund-cron.mjs`
- Modify: `scripts/doi-cron-secret.mjs` (`CAC_JOB` + bài test `--dry-run` canh số 2 → 3)
- Modify: `docs/co-phieu-viet-nam.md` (mục "Đổi secret": hai job → ba job)
- Modify: `docs/data-model-matrix.md`, `docs/information-architecture.md`
- Modify: `package.json` (`"setup:fund-cron"`)

> **Đây là task dễ bỏ sót nhất và hậu quả im lặng nhất.** `PUSH_CRON_SECRET` sau task này
> được **ba** cron job nhúng vào `cron.job.command`. Đổi secret mà quên một job là đẩy job
> đó vào bẫy: cron vẫn nổ, `cron.job_run_details.status` vẫn `succeeded` (vì `net.http_post`
> chỉ xếp hàng rồi trả id), mà function trả `401` và không ghi gì. Không một tín hiệu nào ở
> phía database lộ ra.

- [ ] **Step 1: Sửa `scripts/doi-cron-secret.mjs`**

Tìm hằng `CAC_JOB` và thêm job thứ ba, theo đúng hình dạng hai job đang có:

```js
  {
    jobname: 'fund-refresh-daily',
    function: 'fund-refresh',
    // 13:00 UTC = 22:00 giờ Nhật, T2–T6: sau giờ công bố 基準価額 (~19:00). Nhật KHÔNG có
    // giờ mùa hè nên một mốc UTC cố định là đủ; múi giờ ở đây neo vào THỊ TRƯỜNG, không
    // vào người dùng (khác push, xem docs/push-notification.md).
    schedule: '0 13 * * 1-5',
    timeoutMs: 120_000,
  },
```

Tìm bài test `--dry-run` canh `CAC_JOB.length === 2` và đổi thành `3`. **Giữ nguyên comment giải thích** — nó chính là lý do bài test tồn tại.

- [ ] **Step 2: Chạy `--dry-run` để chắc script còn đúng**

```bash
node scripts/doi-cron-secret.mjs --dry-run
```

Kỳ vọng: in ra khối SQL cho **ba** job, không gọi mạng, không hỏi secret.

- [ ] **Step 3: Viết `scripts/setup-fund-cron.mjs`**

Sao khuôn `scripts/setup-stock-cron.mjs` **nguyên vẹn**, đổi đúng bốn thứ:

| Hằng | Giá trị mới | Vì sao |
|---|---|---|
| `LICH` | `'0 13 * * 1-5'` | 22:00 giờ Nhật, sau giờ công bố |
| `TEN_JOB` | `'fund-refresh-daily'` | |
| `TIMEOUT_MS` | `120_000` | Phải lớn hơn `FETCH_BUDGET_MS` (60s) của `navs.ts`, cộng chỗ cho việc 2 |
| Tên function trong URL | `fund-refresh` | |

Giữ **nguyên** bốn thứ đã cứu người ở `setup-stock-cron.mjs`: gọi thử trước khi in SQL, `donDauVao()` bóc bracketed paste, `--kiem-o-nhap`, và `canhBaoHinhDang()` cảnh báo ca copy nhầm cột digest.

Thêm vào `package.json`:

```json
    "setup:fund-cron": "node scripts/setup-fund-cron.mjs",
```

- [ ] **Step 4: Sửa `docs/co-phieu-viet-nam.md`**

Trong mục "Đổi secret: dùng script, và nhớ CẢ HAI job", đổi tiêu đề thành **"nhớ CẢ BA job"**, và trong khối trích dẫn cảnh báo, đổi:

> `PUSH_CRON_SECRET` được HAI cron job nhúng vào `cron.job.command`: `stock-refresh-daily` và `push-notify-hourly`.

thành:

> `PUSH_CRON_SECRET` được **BA** cron job nhúng vào `cron.job.command`:
> `stock-refresh-daily`, `push-notify-hourly` và `fund-refresh-daily` (từ 2026-08-12).

Sửa luôn câu "`--dry-run` có bài kiểm canh đúng con số hai" → "…canh đúng con số **ba**".

- [ ] **Step 5: Viết `docs/quy-nhat.md`**

Cùng khuôn `docs/co-phieu-viet-nam.md`. Bắt buộc có đủ tám mục sau — mục nào thiếu thì người đọc sáu tháng sau sẽ phải tự đo lại:

1. **Nguồn giá và bảng đo thật** — URL, header CSV, Shift-JIS dù khai UTF-8, thiếu tham số trả 200, mã sai trả 500, không có CORS. Kèm ngày đo (2026-08-12).
2. **Danh bạ 8 quỹ** — bảng tên/ISIN/協会コード.
3. **Bốn cái bẫy** — chép từ spec, mỗi cái kèm cách nhận biết.
4. **Quỹ đổi tên** — mục riêng, có bảng chứng minh bằng số (12.355 / 12.596 ở phiên 2024-08-07 và 2024-08-09) và câu: *bất biến "không quỹ nào 口数 âm" là chốt canh.*
5. **Kiến trúc** — cây file, giống mục "Kiến trúc" của `co-phieu-viet-nam.md`.
6. **Triển khai** — bốn bước: deploy, bật `pg_cron`/`pg_net`, `npm run setup:fund-cron`, bốn câu kiểm SQL (chạy TỪNG câu).
7. **Cách xem log** — giải nghĩa từng khoá của dòng log (`soQuyCoGia`, `daGhi`, `boQua`, `loi`) và **bảng ý nghĩa từng lý do `boQua`** (6 lý do, xem Task 9), mỗi lý do kèm "cần làm gì".
8. **Chỗ đã kiểm và chỗ chưa** — bảng trung thực, giống mục cuối của `co-phieu-viet-nam.md`.

Một câu **phải** có trong mục 6, vì nó là bài học đắt nhất của lần trước:

> Khi debug một lượt cron im lặng: đo `max(updated_at)` của `fund_prices`, **đừng** đo `nav_date` — `nav_date` không phân biệt được "cron không ghi" với "nguồn trả giá phiên cũ".

- [ ] **Step 6: Cập nhật hai tài liệu còn lại**

- `docs/data-model-matrix.md`: thêm bốn bảng `funds`, `fund_aliases`, `fund_prices`, `fund_trades` theo đúng cột mà file đó đang dùng.
- `docs/information-architecture.md`: thêm khu "Danh mục quỹ" ở trang chi tiết tài khoản, cạnh chỗ mô tả khu "Danh mục" của cổ phiếu.

- [ ] **Step 7: Commit**

```bash
git add docs/quy-nhat.md docs/co-phieu-viet-nam.md docs/data-model-matrix.md docs/information-architecture.md scripts/setup-fund-cron.mjs scripts/doi-cron-secret.mjs package.json
git commit -m "docs(quy-nhat): tai lieu van hanh + secret cron gio co BA job"
```

---

## Task 15: Deploy, hẹn cron, và kiểm trên dữ liệu thật

**Files:** không sửa file nào — task này là **chứng minh**.

> Mọi bước dưới đây chạy trên project thật của chủ app. Người chạy là **chủ app**, không
> phải agent: các bước có secret đều hỏi ở ô nhập kín.

- [ ] **Step 1: Gói lại và deploy**

```bash
npm run bundle:rules && npx supabase@latest functions deploy fund-refresh --project-ref <project-ref> --no-verify-jwt
```

`--no-verify-jwt` vì cron không phải người dùng đăng nhập — đó là lý do có `x-cron-secret`, và là lý do chế độ kiểm mã phải tự gọi `sb.auth.getUser()`.

- [ ] **Step 2: Chạy migration 0045 trên project**

Dán nội dung `supabase/migrations/0045_fund_prices_trades.sql` vào SQL Editor và chạy. Kiểm ngay:

```sql
select count(*) as so_quy from public.funds;
```

Kỳ vọng: `8`.

```sql
select count(*) as so_bi_danh from public.fund_aliases;
```

Kỳ vọng: `10`.

- [ ] **Step 3: Nhập sao kê — xem trước**

```bash
node scripts/nhap-sao-ke-rakuten.mjs "C:/Users/TranTriNguyen/Downloads/adjusthistory(JP)_20260812.csv" --account <account-id>
```

**Ba điều phải đúng, không phải "gần đúng":**

| | Kỳ vọng |
|---|---|
| Số lệnh quỹ lọc ra | **136** trong 252 dòng dữ liệu |
| Còn giữ `9I31223A` | **28.429 口**, vốn **50.000 ¥** |
| Còn giữ `9I314241` | **12.595 口**, vốn **20.000 ¥** |

Mọi quỹ khác phải là **0 口**. Nếu script **dừng vì tên lạ** hoặc **dừng vì 口数 âm** thì
đó là bảng `fund_aliases` thiếu dòng — thêm hàng rồi chạy lại, **đừng** sửa script.

- [ ] **Step 4: Ghi thật**

```bash
node scripts/nhap-sao-ke-rakuten.mjs "C:/Users/TranTriNguyen/Downloads/adjusthistory(JP)_20260812.csv" --account <account-id> --ghi
```

Script hỏi `SUPABASE_SERVICE_ROLE_KEY` ở ô nhập kín. Kỳ vọng: `Ghi 136 lệnh mới`.

Chạy **lại** đúng lệnh đó lần thứ hai. Kỳ vọng: `Ghi 0 lệnh mới (136 lệnh đã có sẵn)` — nếu nó ghi thêm 136 dòng nữa thì khoá idempotent hỏng, **dừng lại và sửa** trước khi đi tiếp.

- [ ] **Step 5: Gọi function thật**

```bash
curl -i -X POST "https://<project-ref>.supabase.co/functions/v1/fund-refresh" -H "x-cron-secret: <PUSH_CRON_SECRET>"
```

Kỳ vọng: `200`, body kiểu `{"soQuyCoGia":8,"daGhi":1,"boQua":{},"loi":[]}`.

Gọi thiếu header phải trả `401 Sai bí mật cron`.

- [ ] **Step 6: Bài kiểm quyết định — ba con số**

```sql
select valued_on, market_value, source
from public.account_valuations
where account_id = '<account-id>'
order by valued_on desc limit 3;
```

Kỳ vọng dòng mới nhất: `valued_on` = phiên mới nhất của nguồn, `market_value` = **80.757**
(± phần chênh do phiên khác 2026-08-10), `source` = `auto`.

Mở app, vào tài khoản NISA. Kỳ vọng: **Giá vốn 70.000 ¥ · Tổng giá trị 80.757 ¥ · +10.757 ¥ (+15,4%)**.

**Lệch là sai, không phải "gần đúng".** Ba con số này đã biết trước từ ảnh chụp app Rakuten ngày 2026-08-12.

- [ ] **Step 7: Kiểm van "số gõ tay luôn thắng"**

Gõ tay một giá trị khác cho đúng ngày phiên đó (sheet "Cập nhật giá trị"), gọi lại function.

Kỳ vọng: `"boQua":{"nguoi-dung-da-go-tay":1}` và số trong DB **không đổi**.

- [ ] **Step 8: Kiểm chốt canh bí danh (phá có kiểm soát)**

```sql
delete from public.fund_aliases
where statement_name = '楽天・Ｓ＆Ｐ５００インデックス・ファンド(楽天・Ｓ＆Ｐ５００)/再投資型';
```

Chạy lại script nhập ở chế độ xem trước. Kỳ vọng: script **dừng** và nêu đúng tên đó — không âm thầm bỏ qua. Rồi khôi phục:

```sql
insert into public.fund_aliases (statement_name, assoc_fund_cd)
values ('楽天・Ｓ＆Ｐ５００インデックス・ファンド(楽天・Ｓ＆Ｐ５００)/再投資型', '9I31223A');
```

- [ ] **Step 9: Lấp lịch sử**

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/fund-refresh" -H "x-cron-secret: <PUSH_CRON_SECRET>" -H "Content-Type: application/json" -d '{"lapLichSu":{"accountId":"<account-id>"}}'
```

Mở biểu đồ Tài sản ròng. Kỳ vọng **ba** dấu hiệu, cả ba đều là sự thật đã biết từ sao kê:

1. Đường bắt đầu từ khoảng **2022-10**.
2. Có đoạn **trống 2025-04-14 → 2025-08-28** — tài khoản thật sự không giữ gì trong khoảng đó.
3. Có bậc tụt mạnh ngày **2026-04-13** rồi khởi lại từ 70.000 — đợt bán sạch và mua lại.

- [ ] **Step 10: Hẹn cron**

```bash
npm run setup:fund-cron
```

Script gọi thử function để chứng minh secret trước khi in SQL. Dán khối SQL nó in ra vào SQL Editor.

- [ ] **Step 11: Bốn câu kiểm — chạy TỪNG câu**

SQL Editor chỉ hiện kết quả của câu **cuối** trong ô, nên dán cả bốn câu một lượt sẽ chỉ thấy một bảng và tưởng ba câu kia không trả gì.

```sql
-- ① Lịch đã vào, VÀ không còn chuỗi giữ chỗ nào trong command.
select active, command not like '%<%>%' as khong_con_giu_cho
from cron.job where jobname = 'fund-refresh-daily';
```

```sql
-- ② Đã có câu ghi nào chạm vào bảng giá chưa. Đọc lan_ghi_cuoi, KHÔNG phải nav_date.
select nav_date, count(*) as so_quy, max(updated_at) as lan_ghi_cuoi
from public.fund_prices group by nav_date order by nav_date desc limit 5;
```

```sql
-- ③ Cron đã nổ vào những ngày nào. `succeeded` ở đây CHỈ nghĩa là net.http_post xếp hàng
--    xong — nó không biết gì về HTTP response.
select d.status, d.return_message, d.start_time
from cron.job_run_details d join cron.job j using (jobid)
where j.jobname = 'fund-refresh-daily' order by d.start_time desc limit 10;
```

```sql
-- ④ Sự thật phía HTTP: 200 hay 401/timeout. pg_net tự dọn bảng này sau vài giờ nên nó chỉ
--    soi được lượt gần nhất.
select id, status_code, error_msg, created
from net._http_response order by created desc limit 10;
```

- [ ] **Step 12: Bằng chứng cuối — một phiên sau**

Ngày làm việc kế tiếp, chạy lại câu ② và xác nhận `lan_ghi_cuoi` đã **nhảy sang mốc của phiên đó**.

**Không đọc `nav_date` để kết luận** — nó không phân biệt được "cron không ghi" với "nguồn trả giá phiên cũ". Đây đúng là chỗ đã mất một buổi hồi 2026-08-11 với `stock-refresh`.

- [ ] **Step 13: Cập nhật mục "Chỗ đã kiểm và chỗ chưa" trong `docs/quy-nhat.md`**

Ghi **trung thực** kết quả từng bước ở trên. Bước nào chưa chạy được thì ghi ❌ kèm lý do — đừng ghi ✅ cho thứ mới chỉ đọc code.

```bash
git add docs/quy-nhat.md && git commit -m "docs(quy-nhat): ghi ket qua kiem tren du lieu that"
```

---

## Tự soát kế hoạch

**Phủ spec:** mọi mục của spec đều có task — nguồn giá và 4 bẫy (Task 3–4), 4 bảng + seed + bí danh (Task 1), phép tính không tiền mặt (Task 2), bundle (Task 5), tầng dữ liệu + sao lưu (Task 6–7), edge function 3 chế độ (Task 9–10), script nhập (Task 11), UI (Task 12–13), tài liệu + ba job cron (Task 14), kiểm thật (Task 15).

**Cố ý KHÔNG làm** (spec đã chốt): sheet "thêm quỹ" và nút "Kiểm mã ngay" trên UI — chế độ kiểm mã của edge function vẫn có, gọi bằng `curl` khi cần. Hai việc kèm theo (script sửa sổ thu chi, quy tắc định kỳ) nằm ngoài kế hoạch này.

**Chỗ kế hoạch cố ý không có bài test:** `loadInput.ts` và phần ghép nối Postgres của `index.ts` — chúng chỉ đọc/ghi bảng, không có phép tính để canh, và đúng đắn của chúng được chứng minh bằng Task 15. Dựng mock Supabase để test là dựng một bản sao của Postgres rồi test bản sao đó.

**Ba con số đích** xuất hiện ở bốn chỗ độc lập — test đơn vị (Task 2), dữ liệu demo (Task 6), kiểm UI demo (Task 13), và dữ liệu thật (Task 15). Lệch ở bất kỳ chỗ nào là dấu hiệu thật, không phải nhiễu.
