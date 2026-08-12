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
- Modify: `supabase/setup_all.sql` (nối migration mới vào cuối)
- Test: `tests/fundSeed.test.ts`

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

  it('KHÔNG có bảng nào cho phép user ghi vào bảng giá hay danh bạ', () => {
    // funds / fund_aliases / fund_prices là dữ liệu công khai do service role ghi.
    // Một policy `for all` trên ba bảng đó là mở đường cho user sửa mã quỹ của người khác.
    for (const t of ['funds', 'fund_aliases', 'fund_prices']) {
      expect(sql, `${t} không được có policy ghi`).not.toMatch(
        new RegExp(`for all[^;]*on public\\.${t}`),
      )
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

- [ ] **Step 5: Nối vào `supabase/setup_all.sql`**

Mở `supabase/setup_all.sql`, tìm phần cuối (migration mới nhất), và nối **toàn bộ** nội dung `0045_fund_prices_trades.sql` vào cuối, theo đúng cách các migration trước đã được nối (đọc 30 dòng cuối của file để bắt chước dấu phân cách đang dùng).

- [ ] **Step 6: Chạy test để thấy xanh**

```bash
npx vitest run tests/fundSeed.test.ts
```

Kỳ vọng: PASS, 6 bài.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0045_fund_prices_trades.sql supabase/migrations/0035_stock_prices_trades.sql supabase/setup_all.sql tests/fundSeed.test.ts
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

**Kế hoạch còn Task 9–13. Xem phần tiếp ở cuối file này.**
