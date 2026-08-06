# Cảnh báo tỷ giá đã cũ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang Cài đặt hiện khối tỷ giá quy đổi, chuyển sang cảnh báo vàng khi con số đã cũ quá 3 ngày.

**Architecture:** `lib/rates.ts` lưu thêm mốc `time_last_update_unix` của nguồn vào cache `localStorage` và mở ba hàm thuần mới (`readRatesMeta`, `rateAgeDays`, `formatRateLine`). `SettingsPage.tsx` đọc ba hàm đó để dựng khối hiển thị. Chữ ký `fetchRates` giữ nguyên nên hai nơi đang gọi nó không phải sửa.

**Tech Stack:** TypeScript, React 19, TanStack Query v5, Tailwind, Vitest, lucide-react.

Spec: `docs/superpowers/specs/2026-08-06-canh-bao-ty-gia-cu-design.md`

## Global Constraints

- **`lib/rates.ts` KHÔNG được import `lib/money.ts` hay `lib/privacy.ts`.** `purity.test.ts` đi theo đồ thị import từ bộ luật thông báo và sẽ đỏ. Chỉ được import từ `./currencies`.
- **`lib/currencies.ts` là module lá — KHÔNG import gì cả.** Giữ nguyên tính chất này.
- **Mọi lần chạm `localStorage` / `Date.now()` trong `rates.ts` phải nằm THỤT VÀO trong thân hàm**, không được ở cột 0. `purity.test.ts` soi các dòng cột 0 của file này.
- **KHÔNG đổi chữ ký `fetchRates`** và **KHÔNG đổi tên khoá cache** (`sct-rates-${base}`).
- Ngưỡng cảnh báo: **3 ngày**, hằng số `STALE_RATE_DAYS`.
- Chạy test: `npm test` (vitest run). Lint: `npm run lint`.
- Chú thích code viết tiếng Việt, giống phần còn lại của repo.
- Commit message tiếng Việt không dấu, kết thúc bằng dòng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Trước mỗi lần commit: chạy `git status --porcelain` và **chỉ `git add` đúng đường dẫn của task**. Repo này hay có nhiều phiên chạy song song.

## File Structure

| File | Trách nhiệm | Task |
|---|---|---|
| `src/lib/currencies.ts` | Bảng loại tiền + `groupThousands` (chuyển từ `money.ts` xuống) | 1 |
| `src/lib/money.ts` | Bỏ bản `groupThousands` cục bộ, nhập từ `./currencies` | 1 |
| `src/lib/rates.ts` | Lưu `sourceUpdatedAt`; thêm `readRatesMeta`, `rateAgeDays`, `STALE_RATE_DAYS`, `formatRateLine` | 2, 3 |
| `src/lib/rates.test.ts` | Test cho các hàm thuần mới | 2, 3 |
| `src/features/notifications/purity.test.ts` | Sửa lý do miễn trừ của `lib/rates.ts` | 2 |
| `src/features/settings/SettingsPage.tsx` | Khối hiển thị + cảnh báo + nút thử lấy lại | 4 |

---

### Task 1: Chuyển `groupThousands` xuống module lá

Đây là bước dọn đường thuần túy — **hành vi `formatMoney` không được đổi**. `rates.ts` cần nhóm nghìn nhưng bị cấm nhập `money.ts`, nên hàm phải sống ở `currencies.ts`.

**Files:**
- Modify: `src/lib/currencies.ts` (thêm export ở cuối file)
- Modify: `src/lib/money.ts:19-20` (xoá hàm cục bộ), `src/lib/money.ts:5` (thêm vào import)

**Interfaces:**
- Consumes: không có
- Produces: `groupThousands(digits: string, sep: string): string` export từ `src/lib/currencies.ts`

- [ ] **Step 1: Chạy test hiện có để có mốc xanh**

```bash
npm test -- src/lib/money.test.ts
```

Expected: PASS, 3 describe block đều xanh. Nếu đã đỏ từ trước thì DỪNG và báo lại — task này không được bắt đầu trên nền đỏ.

- [ ] **Step 2: Thêm `groupThousands` vào `currencies.ts`**

Thêm vào **cuối** `src/lib/currencies.ts` (sau object `CURRENCIES`):

```ts
/**
 * Chèn dấu phân cách hàng nghìn vào chuỗi CHỮ SỐ (không dấu, không phần thập phân).
 * Ở đây chứ không ở money.ts vì lib/rates.ts cũng cần mà nó bị cấm nhập money.ts
 * (xem features/notifications/purity.test.ts).
 */
export const groupThousands = (digits: string, sep: string) =>
  digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep)
```

- [ ] **Step 3: Cho `money.ts` dùng bản ở `currencies.ts`**

Trong `src/lib/money.ts`, đổi dòng 5 từ:

```ts
import { CURRENCIES, type CurrencyCode } from './currencies'
```

thành:

```ts
import { CURRENCIES, groupThousands, type CurrencyCode } from './currencies'
```

rồi **xoá hẳn** hai dòng 19–20 (hàm cục bộ cũ):

```ts
const groupThousands = (digits: string, sep: string) =>
  digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep)
```

Không đụng gì khác trong file.

- [ ] **Step 4: Chạy lại test — phải xanh y như Step 1**

```bash
npm test -- src/lib/money.test.ts
```

Expected: PASS. Đỏ ở đây nghĩa là đã lỡ đổi hành vi — quay lại Step 3 đối chiếu.

- [ ] **Step 5: Chạy phép thử độ thuần (currencies.ts vẫn phải là module lá)**

```bash
npm test -- src/features/notifications/purity.test.ts
```

Expected: PASS, tất cả các `it()` xanh.

- [ ] **Step 6: Commit**

```bash
git status --porcelain
git add src/lib/currencies.ts src/lib/money.ts
git commit -m "refactor(tien): chuyen groupThousands xuong currencies.ts

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Lưu mốc thời gian của nguồn + hai hàm đọc/đo

**Files:**
- Modify: `src/lib/rates.ts:13-32`
- Modify: `src/lib/rates.test.ts` (thêm vào cuối)
- Modify: `src/features/notifications/purity.test.ts:160-166`

**Interfaces:**
- Consumes: `CURRENCIES`, `CurrencyCode` từ `./currencies` (đã import sẵn)
- Produces, export từ `src/lib/rates.ts`:
  - `type RatesCache = { rates: Rates; fetchedAt: number; sourceUpdatedAt?: number }`
  - `const STALE_RATE_DAYS = 3`
  - `readRatesMeta(base: CurrencyCode): RatesCache | null`
  - `rateAgeDays(sourceUpdatedAt: number, now: number): number`

- [ ] **Step 1: Viết test thất bại**

Thêm vào **cuối** `src/lib/rates.test.ts`, và sửa dòng 2 thành:

```ts
import { convertToBase, rateAgeDays, readRatesMeta, STALE_RATE_DAYS } from './rates'
```

Test:

```ts
describe('rateAgeDays', () => {
  const DAY = 86_400_000
  const NOW = 1_785_974_400_000 // 2026-08-06T00:00:00Z, mốc cố định

  it('cùng thời điểm → 0 ngày', () => {
    expect(rateAgeDays(NOW, NOW)).toBe(0)
  })

  it('gần 1 ngày nhưng chưa đủ → vẫn 0 (làm tròn xuống)', () => {
    expect(rateAgeDays(NOW - DAY + 1, NOW)).toBe(0)
  })

  it('đúng 3 ngày → 3, chạm ngưỡng cảnh báo', () => {
    expect(rateAgeDays(NOW - 3 * DAY, NOW)).toBe(3)
  })

  it('ngưỡng cảnh báo là 3 ngày', () => {
    expect(STALE_RATE_DAYS).toBe(3)
  })

  it('mốc ở tương lai (đồng hồ máy lệch) → 0, không trả số âm', () => {
    expect(rateAgeDays(NOW + 5 * DAY, NOW)).toBe(0)
  })
})

describe('readRatesMeta', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('chưa có cache → null', () => {
    expect(readRatesMeta('JPY')).toBeNull()
  })

  it('JSON hỏng → null, không ném lỗi', () => {
    localStorage.setItem('sct-rates-JPY', '{khong-phai-json')
    expect(readRatesMeta('JPY')).toBeNull()
  })

  it('thiếu trường rates → null', () => {
    localStorage.setItem('sct-rates-JPY', JSON.stringify({ fetchedAt: 1 }))
    expect(readRatesMeta('JPY')).toBeNull()
  })

  it('cache cũ (ghi trước bản này) → đọc được, sourceUpdatedAt undefined', () => {
    localStorage.setItem(
      'sct-rates-JPY',
      JSON.stringify({ rates: { VND: 165 }, fetchedAt: 111 }),
    )
    const meta = readRatesMeta('JPY')
    expect(meta?.fetchedAt).toBe(111)
    expect(meta?.sourceUpdatedAt).toBeUndefined()
  })

  it('cache mới → đọc đủ cả ba trường', () => {
    localStorage.setItem(
      'sct-rates-JPY',
      JSON.stringify({ rates: { VND: 165 }, fetchedAt: 111, sourceUpdatedAt: 222 }),
    )
    const meta = readRatesMeta('JPY')
    expect(meta?.rates.VND).toBe(165)
    expect(meta?.sourceUpdatedAt).toBe(222)
  })

  it('mỗi base có khoá riêng', () => {
    localStorage.setItem(
      'sct-rates-VND',
      JSON.stringify({ rates: { JPY: 0.006 }, fetchedAt: 1, sourceUpdatedAt: 2 }),
    )
    expect(readRatesMeta('JPY')).toBeNull()
    expect(readRatesMeta('VND')?.sourceUpdatedAt).toBe(2)
  })
})
```

Sửa dòng 1 của file để có `beforeEach`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

```bash
npm test -- src/lib/rates.test.ts
```

Expected: FAIL — báo không export `rateAgeDays` / `readRatesMeta` / `STALE_RATE_DAYS`.

*Nếu `localStorage is not defined`:* môi trường vitest đang là `node`. Kiểm `vite.config.ts` — cần `test: { environment: 'jsdom' }`. Có test nào khác đang dùng `localStorage` thì môi trường đã đúng rồi; báo lại thay vì tự đổi cấu hình toàn cục.

- [ ] **Step 3: Sửa `rates.ts`**

Thay khối từ dòng 13 tới dòng 32 (`CACHE_KEY` và `fetchRates`) bằng:

```ts
const CACHE_KEY = (base: string) => `sct-rates-${base}`

/** Số ngày cũ tối đa trước khi UI kêu. Nguồn chỉ đổi số 1 lần/ngày nên 1–2 ngày
 *  cũ là chuyện thường (offline qua đêm); quá 3 ngày là hỏng thật. */
export const STALE_RATE_DAYS = 3

export type RatesCache = {
  rates: Rates
  /** epoch ms — lúc APP tải số về. Giữ để soi lỗi, KHÔNG dùng để phán "cũ". */
  fetchedAt: number
  /** epoch ms — lúc NGUỒN định giá con số (`time_last_update_unix` × 1000).
   *  Thiếu = bản ghi cache viết trước khi có tính năng này. */
  sourceUpdatedAt?: number
}

export async function fetchRates(base: CurrencyCode): Promise<Rates> {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as {
      result: string
      rates: Record<string, number>
      time_last_update_unix?: number
    }
    if (json.result !== 'success') throw new Error('API không trả về success')
    const rates: Rates = {}
    for (const code of Object.keys(CURRENCIES) as CurrencyCode[]) {
      if (json.rates[code]) rates[code] = json.rates[code]
    }
    // Nguồn không trả mốc thời gian thì BỎ QUA — việc lấy tỷ giá không được hỏng vì nó.
    const src = json.time_last_update_unix
    const cache: RatesCache = {
      rates,
      fetchedAt: Date.now(),
      ...(typeof src === 'number' && src > 0 ? { sourceUpdatedAt: src * 1000 } : {}),
    }
    localStorage.setItem(CACHE_KEY(base), JSON.stringify(cache))
    return rates
  } catch (err) {
    const cached = readRatesMeta(base)
    if (cached) return cached.rates
    throw err
  }
}

/**
 * Đọc bản ghi cache tỷ giá. null khi chưa có, JSON hỏng, hoặc thiếu `rates`.
 * Không bao giờ ném lỗi — nơi gọi là đường dự phòng lúc mạng đã hỏng sẵn.
 */
export function readRatesMeta(base: CurrencyCode): RatesCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY(base))
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<RatesCache>
    if (typeof parsed?.rates !== 'object' || parsed.rates === null) return null
    return {
      rates: parsed.rates,
      fetchedAt: typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : 0,
      ...(typeof parsed.sourceUpdatedAt === 'number'
        ? { sourceUpdatedAt: parsed.sourceUpdatedAt }
        : {}),
    }
  } catch {
    return null
  }
}

/** Số ngày trọn vẹn từ lúc nguồn định giá tới `now`. Mốc ở tương lai → 0. */
export function rateAgeDays(sourceUpdatedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - sourceUpdatedAt) / 86_400_000))
}
```

Lưu ý: `readRatesMeta` được `fetchRates` gọi ở nhánh `catch` nên hai chỗ đọc cache giờ dùng chung một đường — bớt được một chỗ `JSON.parse` trần.

- [ ] **Step 4: Chạy test — phải xanh**

```bash
npm test -- src/lib/rates.test.ts
```

Expected: PASS, cả `convertToBase` (5 test cũ) lẫn hai describe mới.

- [ ] **Step 5: Sửa lý do miễn trừ trong `purity.test.ts`**

Trong `src/features/notifications/purity.test.ts`, thay nội dung chuỗi lý do ở `WHOLE_FILE_EXEMPT` (dòng 163–164) bằng:

```ts
    'localStorage/Date.now() chỉ nằm trong thân fetchRates() và readRatesMeta(); ' +
      'bộ luật chỉ gọi convertToBase nên nhập module này không chạy dòng nào chạm trình duyệt.',
```

Không đụng gì khác trong file.

- [ ] **Step 6: Chạy phép thử độ thuần**

```bash
npm test -- src/features/notifications/purity.test.ts
```

Expected: PASS. Nếu đỏ với "localStorage ở phạm vi module" → có dòng chạm `localStorage` bị viết ở cột 0 trong `rates.ts`; đưa nó vào trong thân hàm.

- [ ] **Step 7: Commit**

```bash
git status --porcelain
git add src/lib/rates.ts src/lib/rates.test.ts src/features/notifications/purity.test.ts
git commit -m "feat(ty gia): luu moc thoi gian cua nguon vao cache

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `formatRateLine` — viết tỷ giá cho dễ đọc

**Files:**
- Modify: `src/lib/rates.ts` (thêm vào cuối), `src/lib/rates.ts:8` (thêm vào import)
- Modify: `src/lib/rates.test.ts` (thêm vào cuối)

**Interfaces:**
- Consumes: `groupThousands` từ `./currencies` (Task 1), `CURRENCIES`
- Produces: `formatRateLine(base: CurrencyCode, code: CurrencyCode, rate: number): string | null` export từ `src/lib/rates.ts`

- [ ] **Step 1: Viết test thất bại**

Sửa dòng import của `src/lib/rates.test.ts` thành:

```ts
import {
  convertToBase,
  formatRateLine,
  rateAgeDays,
  readRatesMeta,
  STALE_RATE_DAYS,
} from './rates'
```

Thêm vào cuối file:

```ts
describe('formatRateLine', () => {
  it('tỷ giá >= 1 → viết xuôi, làm tròn theo decimals của tiền đích', () => {
    // 1 yên đổi được 165,43 đồng; VND không có số lẻ
    expect(formatRateLine('JPY', 'VND', 165.432222)).toBe('¥1 = 165 ₫')
  })

  it('tỷ giá < 1 → lật ngược cho khỏi ra 0,00xx', () => {
    // 1 yên = 0,006345 đô → lật thành 1 đô = 157,6 yên
    expect(formatRateLine('JPY', 'USD', 0.006345)).toBe('$1 = ¥158')
  })

  it('nhóm hàng nghìn theo đúng dấu của từng loại tiền', () => {
    // VND dùng dấu chấm ngăn nghìn, không có số lẻ
    expect(formatRateLine('JPY', 'VND', 1234.4)).toBe('¥1 = 1.234 ₫')
    // Nhánh lật ngược cũng phải nhóm nghìn: 1/0,0000379 ≈ 26.385
    expect(formatRateLine('VND', 'USD', 0.0000379)).toBe('$1 = 26.385 ₫')
  })

  it('USD ở vế giá trị → 2 số lẻ, dấu phẩy thập phân', () => {
    // Con số không có thật ngoài đời, ở đây chỉ để soi nhánh decimals = 2
    expect(formatRateLine('VND', 'USD', 2.5)).toBe('1 ₫ = $2,50')
  })

  it('cùng loại tiền → null (không có gì để nói)', () => {
    expect(formatRateLine('JPY', 'JPY', 1)).toBeNull()
  })

  it('số rác từ nguồn → null, không ra Infinity', () => {
    expect(formatRateLine('JPY', 'VND', 0)).toBeNull()
    expect(formatRateLine('JPY', 'VND', -5)).toBeNull()
    expect(formatRateLine('JPY', 'VND', Number.NaN)).toBeNull()
    expect(formatRateLine('JPY', 'VND', Number.POSITIVE_INFINITY)).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

```bash
npm test -- src/lib/rates.test.ts
```

Expected: FAIL — `formatRateLine is not a function`.

- [ ] **Step 3: Cài đặt**

Đổi dòng 8 của `src/lib/rates.ts`:

```ts
import { CURRENCIES, groupThousands, type CurrencyCode } from './currencies'
```

Thêm vào **cuối** file:

```ts
/**
 * major units → chuỗi có ký hiệu tiền. CỐ Ý không dùng formatMoney: nó che số khi
 * bật chế độ riêng tư, mà tỷ giá là số công khai của thị trường chứ không phải
 * tiền của người dùng — và rates.ts cũng bị cấm nhập money.ts (purity.test.ts).
 */
function formatMajor(major: number, currency: CurrencyCode): string {
  const { symbol, decimals, position, group, decimal } = CURRENCIES[currency]
  const [intPart, fracPart] = major.toFixed(decimals).split('.')
  const body = `${groupThousands(intPart, group)}${fracPart ? decimal + fracPart : ''}`
  return position === 'prefix' ? `${symbol}${body}` : `${body} ${symbol}`
}

/**
 * Một dòng tỷ giá đọc được: "¥1 = 165 ₫", "$1 = ¥158".
 * Lật chiều khi rate < 1, vì viết xuôi sẽ ra "¥1 = 0,0063 $" — không ai đọc nổi.
 * null = không có gì để hiện (cùng loại tiền, hoặc nguồn trả số rác).
 */
export function formatRateLine(
  base: CurrencyCode,
  code: CurrencyCode,
  rate: number,
): string | null {
  if (code === base) return null
  if (!Number.isFinite(rate) || rate <= 0) return null
  return rate >= 1
    ? `${formatMajor(1, base)} = ${formatMajor(rate, code)}`
    : `${formatMajor(1, code)} = ${formatMajor(1 / rate, base)}`
}
```

- [ ] **Step 4: Chạy test — phải xanh**

```bash
npm test -- src/lib/rates.test.ts
```

Expected: PASS toàn bộ file.

- [ ] **Step 5: Chạy cả bộ test + lint**

```bash
npm test
```

Expected: PASS. Sau đó:

```bash
npm run lint
```

Expected: không có lỗi mới.

- [ ] **Step 6: Commit**

```bash
git status --porcelain
git add src/lib/rates.ts src/lib/rates.test.ts
git commit -m "feat(ty gia): them formatRateLine viet ty gia de doc

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Khối tỷ giá ở trang Cài đặt

**Files:**
- Modify: `src/features/settings/SettingsPage.tsx` — dòng 1–21 (import), chèn `<section>` mới sau dòng 165

**Interfaces:**
- Consumes: `useRates()` từ `../../hooks/queries` trả `{ base, rates, isLoading, isSuccess }`; `formatRateLine`, `rateAgeDays`, `readRatesMeta`, `STALE_RATE_DAYS` từ `../../lib/rates`; `type CurrencyCode` từ `../../lib/money`
- Produces: không có (là lá của cây)

- [ ] **Step 1: Thêm import**

Trong `src/features/settings/SettingsPage.tsx`:

Dòng 4–13, thêm `ArrowLeftRight` vào khối icon (giữ thứ tự bảng chữ cái):

```tsx
import {
  ArrowLeftRight,
  Bell,
  ChevronRight,
  Database,
  Landmark,
  Scale,
  Tag as TagIcon,
  Tags,
  UserRound,
} from 'lucide-react'
```

Dòng 15, đổi thành:

```tsx
import { useProfile, useRates } from '../../hooks/queries'
```

Thêm hai dòng import mới ngay sau dòng 18 (`import { getSupabase } …`):

```tsx
import type { CurrencyCode } from '../../lib/money'
import { formatRateLine, rateAgeDays, readRatesMeta, STALE_RATE_DAYS } from '../../lib/rates'
```

- [ ] **Step 2: Tính dữ liệu trong thân component**

Ngay sau dòng `const [editing, setEditing] = useState(...)` (dòng 29), thêm:

```tsx
  const { base, rates } = useRates()
  // Đọc thẳng localStorage trong lúc render (không phải state): `rates` đổi tham
  // chiếu mỗi lần query trả về, nên mốc thời gian cũng được đọc lại đúng lúc đó.
  const rateMeta = rates ? readRatesMeta(base) : null
  // formatRateLine tự trả null cho chính `base` và cho số rác, nên không lọc trước.
  const rateLines = rates
    ? (Object.entries(rates) as [CurrencyCode, number][])
        .map(([c, r]) => formatRateLine(base, c, r))
        .filter((line): line is string => line !== null)
    : []
  const ageDays =
    rateMeta?.sourceUpdatedAt === undefined
      ? null
      : rateAgeDays(rateMeta.sourceUpdatedAt, Date.now())
  const rateStale = ageDays !== null && ageDays >= STALE_RATE_DAYS
```

- [ ] **Step 3: Chèn khối hiển thị**

Chèn ngay **sau** thẻ `</section>` ở dòng 165 (khối hồ sơ / đăng xuất) và **trước** thẻ `<p className="text-center …">`:

```tsx
      {rateLines.length > 0 && (
        <section className="overflow-hidden rounded-xl bg-surface p-3 shadow-sm">
          <div className="flex items-start gap-3">
            <ArrowLeftRight className="mt-0.5 h-5 w-5 shrink-0 text-fg-muted" />
            <div className="flex-1">
              <p className="text-sm text-fg-primary">Tỷ giá quy đổi</p>
              {rateLines.map((line) => (
                <p key={line} className="mt-0.5 text-sm tabular-nums text-fg-muted">
                  {line}
                </p>
              ))}
              {ageDays !== null && !rateStale && (
                <p className="mt-1 text-xs text-fg-muted">
                  {ageDays === 0
                    ? 'Cập nhật hôm nay'
                    : ageDays === 1
                      ? 'Cập nhật hôm qua'
                      : `Cập nhật ${ageDays} ngày trước`}
                </p>
              )}
              {rateStale && (
                <div className="mt-2 rounded-lg bg-amber-50 p-2 dark:bg-amber-900/30">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Cập nhật {ageDays} ngày trước — mạng hoặc nguồn tỷ giá đang lỗi, số quy
                    đổi có thể sai.
                  </p>
                  <button
                    type="button"
                    onClick={() => qc.invalidateQueries({ queryKey: ['rates'] })}
                    className="mt-2 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
                  >
                    Thử lấy lại
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
```

`qc` đã có sẵn ở dòng 25 (`const qc = useQueryClient()`) — không khai lại.

- [ ] **Step 4: Kiểm biên dịch + lint**

```bash
npm run build
```

Expected: `tsc -b` không báo lỗi, vite build xong.

```bash
npm run lint
```

Expected: không có lỗi mới.

- [ ] **Step 5: Xem thật trên trình duyệt — trạng thái bình thường**

Mở preview (`preview_start`), vào `/settings`, cuộn xuống dưới khối hồ sơ.

Expected: thấy khối "Tỷ giá quy đổi" với ít nhất một dòng dạng `¥1 = 165 ₫`, và dòng xám "Cập nhật hôm nay".

*Nếu khối không hiện:* `rates` chưa về (mạng chặn `open.er-api.com`) hoặc `readRatesMeta` trả `null`. Kiểm bằng console: `localStorage.getItem('sct-rates-JPY')`.

- [ ] **Step 6: Xem thật — trạng thái cảnh báo**

Trong console của preview, đẩy mốc thời gian lùi 5 ngày rồi tải lại trang:

```js
const k = 'sct-rates-JPY'
const c = JSON.parse(localStorage.getItem(k))
c.sourceUpdatedAt = Date.now() - 5 * 86400000
localStorage.setItem(k, JSON.stringify(c))
location.reload()
```

Expected: dòng xám biến mất, thay bằng ô vàng "Cập nhật 5 ngày trước — mạng hoặc nguồn tỷ giá đang lỗi, số quy đổi có thể sai." kèm nút "Thử lấy lại".

Bấm nút → mạng sống thì cảnh báo biến mất (query lấy lại số mới), mạng chết thì cảnh báo còn nguyên. Cả hai đều đúng.

Chụp màn hình cả hai trạng thái để đưa cho người dùng.

- [ ] **Step 7: Kiểm chế độ tối và chế độ riêng tư**

- Đổi sang chế độ tối (`resize_window` với `colorScheme: 'dark'`, hoặc nút Giao diện ngay trên trang) → chữ vàng phải đọc được trên nền tối.
- Bật chế độ riêng tư (nút con mắt) → **các số tỷ giá vẫn phải hiện nguyên**, không thành `••••`. Đây là điều `formatMajor` sinh ra để bảo đảm.

- [ ] **Step 8: Chạy cả bộ test lần cuối**

```bash
npm test
```

Expected: PASS toàn bộ.

- [ ] **Step 9: Commit**

```bash
git status --porcelain
git add src/features/settings/SettingsPage.tsx
git commit -m "feat(ty gia): hien khoi ty gia va canh bao khi qua cu o trang Cai dat

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Kiểm lại toàn bộ

Sau Task 4, đối chiếu với spec:

- [ ] `fetchRates` giữ nguyên chữ ký — `src/features/lifetime/ScenarioEditorSheet.tsx` và `src/hooks/queries.ts` **không** phải sửa dòng nào.
- [ ] Khoá cache vẫn là `sct-rates-${base}` — cache cũ trong máy người dùng đọc được, không mất tỷ giá.
- [ ] Không đụng vào 15 banner `hasMissingRate`, mục Gửi tiền về VN, `convertToBase`, hay `staleTime` 12 tiếng.
- [ ] `npm test` xanh, `npm run lint` sạch, `npm run build` qua.
