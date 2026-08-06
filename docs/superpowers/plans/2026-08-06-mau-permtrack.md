# Kế hoạch thi công — mẫu permtrack + nới rộng giao diện PC

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nới giao diện PC cho hết bề ngang màn hình, rồi thêm các mẫu trình bày của permtrack.app mà app đang thiếu — chủ yếu là cho người dùng biết mỗi con số lấy lúc nào và đáng tin tới đâu.

**Architecture:** Giữ đúng khuôn đang có của app — phép tính nằm ở hàm thuần trong file `.ts` riêng (test bằng vitest), component `.tsx` chỉ lo hiển thị. Component dùng chung đặt ở `src/components/`, thẻ của một trang đặt cạnh trang đó trong `src/features/<tên>/`.

**Tech Stack:** React 19, TypeScript, Tailwind v4, recharts (biểu đồ lớn có sẵn), SVG viết tay (hai thứ nhỏ mới), vitest.

**Spec:** `docs/superpowers/specs/2026-08-06-mau-permtrack-design.md`

## Global Constraints

- Chữ hiện ra cho người dùng: tiếng Việt đơn giản, tránh từ chuyên ngành.
- Màu và cỡ chữ phải qua `tests/designSystem.test.ts`. Cấm cứng: `gray-400` làm chữ phụ ở light mode; `green-600`/`red-600` cho số tiền; `green-600` làm nền nút; `amber-600`/`amber-500` làm chữ; hex trong đồ thị (dùng token); chữ nhỏ hơn 10px; bậc chữ ngoài danh sách đã đặt tên.
- Nét trong đồ thị phải đạt tương phản 3:1 (WCAG 1.4.11) — dùng `var(--color-sky-600)`, không dùng `sky-500`.
- Màu tiền dùng token `money-in`/`money-out`, không viết lại cặp sáng/tối bằng tay.
- Không sửa `src/lib/rates.ts` — phiên khác đang làm cảnh báo tỷ giá cũ ở đó.
- Bán kính: `rounded-lg` cho control, `rounded-xl` cho thẻ, `rounded-full` cho pill. Không dùng `rounded-2xl`/`rounded-md`.
- Thẻ dùng `bg-surface p-3 shadow-sm`.
- Chạy test: `npx vitest run`. Dựng bản thật: `npm run build`.
- Làm trong worktree `.claude/worktrees/mm-permtrack`, nhánh `feat/mau-permtrack`.

---

# ĐỢT 0 — Nới rộng giao diện PC

### Task 1: Nới khung ngoài, các trang hẹp tự bọc lại

**Files:**
- Modify: `src/components/AppLayout.tsx:192`
- Modify: `src/features/transactions/LedgerPage.tsx` (khối bọc ngoài cùng)
- Modify: `src/features/transactions/EntryPage.tsx` (khối bọc ngoài cùng)
- Modify: `src/features/settings/SettingsPage.tsx` (khối bọc ngoài cùng)

**Interfaces:**
- Consumes: không
- Produces: khung nội dung rộng `max-w-6xl`; các trang khác thừa hưởng bề ngang này ở Task 2

- [ ] **Step 1: Nới khung ngoài**

Trong `src/components/AppLayout.tsx:192`, đổi `max-w-2xl` thành `max-w-6xl`:

```tsx
className={`mx-auto w-full min-h-0 max-w-6xl flex-1 overflow-y-auto pt-[env(safe-area-inset-top)] lg:pt-0 lg:pb-6 ${onEntry ? '' : 'pb-20'}`}
```

- [ ] **Step 2: Các trang cần hẹp tự bọc lại**

Sổ giao dịch, màn Nhập và Cài đặt phải giữ một cột hẹp — danh sách giao dịch kéo ngang cả màn thì mắt phải rà rất xa mới nối được ngày với số tiền.

Ở mỗi file, thêm `mx-auto max-w-2xl` vào khối `<div>` ngoài cùng của trang. Ví dụ với `LedgerPage.tsx`, nếu khối ngoài cùng đang là:

```tsx
<div className="flex flex-col gap-4 p-3 lg:p-6">
```

thì đổi thành:

```tsx
<div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-3 lg:p-6">
```

Làm y hệt cho `EntryPage.tsx` và `SettingsPage.tsx`. Nếu khối ngoài cùng của file nào khác dạng trên thì giữ nguyên các lớp cũ, chỉ chèn thêm `mx-auto w-full max-w-2xl`.

- [ ] **Step 3: Xem thật ở hai bề ngang**

Mở app bằng `preview_start`, xem ở 1440×900 rồi 390×844. Kiểm: trang Báo cáo và Tài sản đã dùng hết bề ngang; Sổ giao dịch vẫn hẹp; trên điện thoại không có gì đổi.

- [ ] **Step 4: Chạy test và dựng bản thật**

```bash
npx vitest run
```
Expected: PASS toàn bộ.

```bash
npm run build
```
Expected: dựng xong, không lỗi TypeScript.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppLayout.tsx src/features/transactions/LedgerPage.tsx src/features/transactions/EntryPage.tsx src/features/settings/SettingsPage.tsx
git commit -m "feat(giao dien): noi khung noi dung len max-w-6xl tren man PC"
```

---

### Task 2: Xếp thẻ hai cột ở Báo cáo và Tài sản

**Files:**
- Modify: `src/features/reports/ReportsPage.tsx` (khối `view === 'charts'`, cả nhánh tháng lẫn nhánh năm)
- Modify: `src/features/assets/AssetsNowView.tsx`
- Modify: `src/features/reports/SectionIndex.tsx` (chỉ nếu bước kiểm ở Step 3 phát hiện hỏng)

**Interfaces:**
- Consumes: khung `max-w-6xl` của Task 1
- Produces: không có API mới

- [ ] **Step 1: Bọc danh sách thẻ của Báo cáo vào lưới**

Trong `ReportsPage.tsx`, nhánh `view === 'charts' && period === 'month'`: giữ nguyên `<SectionIndex>` ở ngoài, bọc các `<Section>` còn lại vào một khối lưới:

```tsx
<SectionIndex items={MONTH_SECTIONS} />
<div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3">
  {/* các <Section> giữ nguyên */}
</div>
```

`lg:items-start` là bắt buộc: thiếu nó thì hai thẻ cạnh nhau bị kéo cao bằng nhau, thẻ ngắn thừa ra một mảng trống.

Thẻ có biểu đồ ngang dài thì cho chiếm cả hai cột — thêm `className="lg:col-span-2"` vào `<Section>` bọc `MonthlyBarsCard` và `NetCashflowCard`. `Section` hiện chưa nhận `className`, nên sửa nó ở Step 2 trước.

Làm y hệt cho nhánh `view === 'charts' && period === 'year'`.

- [ ] **Step 2: Cho `Section` nhận thêm lớp CSS**

Trong `src/features/reports/SectionIndex.tsx`:

```tsx
export function Section({
  id,
  className = '',
  children,
}: {
  id: string
  className?: string
  children: ReactNode
}) {
  return (
    <div id={id} className={`scroll-mt-16 ${className}`.trim()}>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Kiểm mục lục nhảy khối còn đúng không**

Đây là rủi ro đã lường trước: `sectionActive.ts` chọn khối "đang xem" theo vị trí dọc, mà xếp hai cột thì hai khối có cùng độ cao đầu.

Mở app ở 1440×900, vào tab Biểu đồ, cuộn từ trên xuống dưới. Kiểm: chip trong mục lục có sáng đúng khối đang xem không, bấm chip có nhảy đúng chỗ không.

Nếu sai: cho mục lục chỉ hiện dưới `lg` — trên PC thấy gần hết màn rồi, mục lục bớt cần. Trong `SectionIndex.tsx`, thêm `lg:hidden` vào khối bọc ngoài cùng của mục lục (không phải của `Section`).

- [ ] **Step 4: Bọc lưới cho trang Tài sản**

Trong `AssetsNowView.tsx`, bọc danh sách khối (`CardsSection`, `HoldingsSection`, `SavingsGoalsSection`, `InvestmentPerformanceSection`) vào cùng khuôn lưới của Step 1.

- [ ] **Step 5: Xem thật và chụp màn**

Xem ở 1440×900 cả chế độ sáng lẫn tối, rồi 390×844. Kiểm: trên PC thẻ xếp hai cột, thẻ biểu đồ dài chiếm cả hàng; trên điện thoại vẫn một cột như cũ.

- [ ] **Step 6: Chạy test, dựng bản thật, commit**

```bash
npx vitest run && npm run build
```
Expected: PASS và dựng xong.

```bash
git add src/features/reports src/features/assets
git commit -m "feat(giao dien): xep the hai cot o Bao cao va Tai san tren man PC"
```

---

# ĐỢT A — Số này lấy lúc nào, đáng tin tới đâu

### Task 3: Hàm thuần tính tuổi dữ liệu

**Files:**
- Create: `src/lib/freshness.ts`
- Test: `src/lib/freshness.test.ts`

**Interfaces:**
- Consumes: không
- Produces:
  ```ts
  export const STALE_RATE_DAYS = 3
  export const STALE_VALUATION_DAYS = 90
  export interface FreshnessInput {
    ratesFetchedAt: number | null
    priceSession: string | null
    staleSymbolCount: number
    lastValuationOn: string | null
    nowMs: number
    todayISO: string
  }
  export interface FreshnessDetail {
    label: string
    age: string
    tone: 'ok' | 'warn'
  }
  export interface FreshnessSummary {
    tone: 'ok' | 'warn'
    line: string
    details: FreshnessDetail[]
  }
  export function ageLabel(ms: number): string
  export function freshnessSummary(input: FreshnessInput): FreshnessSummary | null
  ```

- [ ] **Step 1: Viết test cho `ageLabel`**

Tạo `src/lib/freshness.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ageLabel, freshnessSummary, STALE_RATE_DAYS } from './freshness'

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

describe('ageLabel', () => {
  it('dưới một phút → "vừa xong"', () => {
    expect(ageLabel(30_000)).toBe('vừa xong')
  })

  it('theo phút khi dưới một giờ', () => {
    expect(ageLabel(5 * MIN)).toBe('5 phút trước')
  })

  it('theo giờ khi dưới một ngày', () => {
    expect(ageLabel(3 * HOUR)).toBe('3 giờ trước')
  })

  it('đúng một ngày → "hôm qua"', () => {
    expect(ageLabel(DAY)).toBe('hôm qua')
  })

  it('nhiều ngày → đếm ngày', () => {
    expect(ageLabel(5 * DAY)).toBe('5 ngày trước')
  })

  it('mốc ở tương lai (đồng hồ máy lệch) → "vừa xong", không ra số âm', () => {
    expect(ageLabel(-2 * HOUR)).toBe('vừa xong')
  })
})
```

- [ ] **Step 2: Chạy test để chắc chắn nó hỏng**

```bash
npx vitest run src/lib/freshness.test.ts
```
Expected: FAIL — không tìm thấy module `./freshness`.

- [ ] **Step 3: Viết `ageLabel`**

Tạo `src/lib/freshness.ts`:

```ts
// Tuổi của dữ liệu lấy từ ngoài (tỷ giá, giá cổ phiếu, giá trị tự khai).
//
// Vì sao có file này: app trộn ba loại số có tuổi rất khác nhau trong cùng một màn —
// số dư sổ (luôn đúng), tỷ giá (vài giờ), giá cổ phiếu (theo phiên), giá trị tự khai
// (có khi cả năm). Nhìn vào không có gì phân biệt, nên người đọc mặc định coi tất cả
// đều mới.
//
// Module này KHÔNG tự đọc cache tỷ giá: nó nhận mốc thời gian qua tham số. Lý do là
// một phiên khác đang dựng `readRatesMeta` trong lib/rates.ts — nhận qua tham số thì
// hai bên không giẫm chân nhau, và khi hàm kia xong chỉ việc truyền vào.

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

/** Ngưỡng tỷ giá bị coi là cũ. Khớp STALE_RATE_DAYS của lib/rates.ts. */
export const STALE_RATE_DAYS = 3
/** Ngưỡng giá trị tự khai bị coi là cũ — một quý. */
export const STALE_VALUATION_DAYS = 90

/** "3 giờ trước" / "hôm qua" / "5 ngày trước". Mốc tương lai → "vừa xong". */
export function ageLabel(ms: number): string {
  if (ms < MIN) return 'vừa xong'
  if (ms < HOUR) return `${Math.floor(ms / MIN)} phút trước`
  if (ms < DAY) return `${Math.floor(ms / HOUR)} giờ trước`
  const days = Math.floor(ms / DAY)
  if (days === 1) return 'hôm qua'
  return `${days} ngày trước`
}
```

- [ ] **Step 4: Chạy test**

```bash
npx vitest run src/lib/freshness.test.ts
```
Expected: PASS 6 test của `ageLabel`.

- [ ] **Step 5: Viết test cho `freshnessSummary`**

Thêm vào `src/lib/freshness.test.ts`:

```ts
describe('freshnessSummary', () => {
  const NOW = 1_785_974_400_000 // 2026-08-06T00:00:00Z, mốc cố định
  const TODAY = '2026-08-06'

  const base = {
    ratesFetchedAt: NOW - 3 * HOUR,
    priceSession: '2026-08-06',
    staleSymbolCount: 0,
    lastValuationOn: '2026-08-01',
    nowMs: NOW,
    todayISO: TODAY,
  }

  it('không có nguồn nào → null (không hiện dòng rỗng)', () => {
    expect(
      freshnessSummary({
        ratesFetchedAt: null,
        priceSession: null,
        staleSymbolCount: 0,
        lastValuationOn: null,
        nowMs: NOW,
        todayISO: TODAY,
      }),
    ).toBeNull()
  })

  it('mọi thứ đều mới → tone ok', () => {
    const r = freshnessSummary(base)
    expect(r?.tone).toBe('ok')
    expect(r?.details).toHaveLength(3)
  })

  it('nêu tuổi tỷ giá trong dòng gộp', () => {
    expect(freshnessSummary(base)?.line).toContain('Tỷ giá 3 giờ trước')
  })

  it(`tỷ giá quá ${STALE_RATE_DAYS} ngày → tone warn`, () => {
    const r = freshnessSummary({ ...base, ratesFetchedAt: NOW - 4 * DAY })
    expect(r?.tone).toBe('warn')
    expect(r?.details.find((d) => d.label === 'Tỷ giá')?.tone).toBe('warn')
  })

  it('có mã cổ phiếu kẹt giá cũ → tone warn', () => {
    const r = freshnessSummary({ ...base, staleSymbolCount: 2 })
    expect(r?.tone).toBe('warn')
  })

  it('giá trị tự khai quá 90 ngày → tone warn', () => {
    const r = freshnessSummary({ ...base, lastValuationOn: '2026-01-01' })
    expect(r?.details.find((d) => d.label === 'Giá trị tự khai')?.tone).toBe('warn')
  })

  it('thiếu nguồn nào thì bỏ nguồn đó, không bịa', () => {
    const r = freshnessSummary({ ...base, priceSession: null, lastValuationOn: null })
    expect(r?.details).toHaveLength(1)
    expect(r?.details[0].label).toBe('Tỷ giá')
  })
})
```

- [ ] **Step 6: Chạy test để chắc chắn nó hỏng**

```bash
npx vitest run src/lib/freshness.test.ts
```
Expected: FAIL — `freshnessSummary is not a function`.

- [ ] **Step 7: Viết `freshnessSummary`**

Thêm vào `src/lib/freshness.ts`:

```ts
export interface FreshnessInput {
  /** Mốc lấy tỷ giá gần nhất (ms). null = chưa từng lấy được. */
  ratesFetchedAt: number | null
  /** Ngày phiên giá cổ phiếu gần nhất (ISO). null = không giữ cổ phiếu. */
  priceSession: string | null
  /** Số mã còn kẹt ở giá của phiên cũ hơn. */
  staleSymbolCount: number
  /** Ngày định giá tay gần nhất (ISO). null = không có tài sản tự khai. */
  lastValuationOn: string | null
  nowMs: number
  todayISO: string
}

export interface FreshnessDetail {
  label: string
  age: string
  tone: 'ok' | 'warn'
}

export interface FreshnessSummary {
  tone: 'ok' | 'warn'
  /** Dòng gộp ngắn, vd "Tỷ giá 3 giờ trước · Giá cổ phiếu hôm nay" */
  line: string
  details: FreshnessDetail[]
}

/** Số ngày giữa hai ngày ISO, không âm. */
function daysSinceISO(fromISO: string, todayISO: string): number {
  const ms = Date.parse(todayISO) - Date.parse(fromISO)
  return ms <= 0 ? 0 : Math.floor(ms / DAY)
}

/**
 * Gom tuổi của cả ba nguồn thành một dòng đọc được.
 * Trả null khi KHÔNG có nguồn nào — để nơi gọi khỏi hiện một dòng rỗng.
 */
export function freshnessSummary(input: FreshnessInput): FreshnessSummary | null {
  const details: FreshnessDetail[] = []

  if (input.ratesFetchedAt !== null) {
    const ms = input.nowMs - input.ratesFetchedAt
    details.push({
      label: 'Tỷ giá',
      age: ageLabel(ms),
      tone: ms > STALE_RATE_DAYS * DAY ? 'warn' : 'ok',
    })
  }

  if (input.priceSession !== null) {
    const days = daysSinceISO(input.priceSession, input.todayISO)
    details.push({
      label: 'Giá cổ phiếu',
      age: days === 0 ? 'hôm nay' : ageLabel(days * DAY),
      // Mã kẹt giá cũ là tín hiệu mạnh hơn tuổi của phiên: phiên có thể mới mà
      // vài mã vẫn chưa có giá.
      tone: input.staleSymbolCount > 0 ? 'warn' : 'ok',
    })
  }

  if (input.lastValuationOn !== null) {
    const days = daysSinceISO(input.lastValuationOn, input.todayISO)
    details.push({
      label: 'Giá trị tự khai',
      age: days === 0 ? 'hôm nay' : ageLabel(days * DAY),
      tone: days > STALE_VALUATION_DAYS ? 'warn' : 'ok',
    })
  }

  if (details.length === 0) return null

  return {
    tone: details.some((d) => d.tone === 'warn') ? 'warn' : 'ok',
    line: details.map((d) => `${d.label} ${d.age}`).join(' · '),
    details,
  }
}
```

- [ ] **Step 8: Chạy test**

```bash
npx vitest run src/lib/freshness.test.ts
```
Expected: PASS toàn bộ 13 test.

- [ ] **Step 9: Commit**

```bash
git add src/lib/freshness.ts src/lib/freshness.test.ts
git commit -m "feat(do tin): ham thuan tinh tuoi du lieu lay tu ngoai"
```

---

### Task 4: Dòng gộp tuổi dữ liệu trên màn hình

**Files:**
- Create: `src/components/DataFreshness.tsx`
- Modify: `src/features/assets/AssetsPage.tsx`
- Modify: `src/features/reports/ReportsPage.tsx`

**Interfaces:**
- Consumes: `freshnessSummary`, `FreshnessSummary` từ `src/lib/freshness.ts` (Task 3)
- Produces: `export function DataFreshness(props: { summary: FreshnessSummary | null }): ReactNode`

- [ ] **Step 1: Viết component**

Tạo `src/components/DataFreshness.tsx`:

```tsx
// Dòng "số trên màn này lấy lúc nào". Bấm vào xổ ra từng nguồn.
//
// Đặt ở đầu trang chứ không cạnh từng con số: ba nguồn cùng cũ thì ba nhãn đỏ cạnh
// nhau chỉ làm rối, trong khi cái người ta cần biết là "có gì đang cũ không".
import { useState } from 'react'
import type { FreshnessSummary } from '../lib/freshness'

export function DataFreshness({ summary }: { summary: FreshnessSummary | null }) {
  const [open, setOpen] = useState(false)
  if (!summary) return null

  const dot = summary.tone === 'warn' ? 'bg-amber-500' : 'bg-green-600'

  return (
    <div className="print:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-fg-muted"
        aria-expanded={open}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
        <span>{summary.line}</span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <ul className="mt-1.5 space-y-1 rounded-lg bg-surface-sunken p-2">
          {summary.details.map((d) => (
            <li key={d.label} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-fg-secondary">{d.label}</span>
              <span
                className={
                  d.tone === 'warn'
                    ? 'shrink-0 font-medium text-amber-700 dark:text-amber-300'
                    : 'shrink-0 text-fg-muted'
                }
              >
                {d.age}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

Chú ý luật màu: chấm cảnh báo là **nền** (`bg-amber-500`) nên được phép; chữ cảnh báo phải là `text-amber-700 dark:text-amber-300` — `amber-600`/`amber-500` làm chữ bị `designSystem.test.ts` cấm.

- [ ] **Step 2: Gắn vào trang Tài sản**

Trong `src/features/assets/AssetsPage.tsx`, dựng dữ liệu rồi đặt `<DataFreshness>` ngay dưới hàng tiêu đề (`<div className="flex items-center gap-2">` ở dòng 52):

```tsx
const ratesMeta = (() => {
  try {
    const raw = localStorage.getItem(`sct-rates-${base}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { fetchedAt?: number }
    return typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : null
  } catch {
    return null
  }
})()

const summary = freshnessSummary({
  ratesFetchedAt: ratesMeta,
  priceSession: session,
  staleSymbolCount: staleSymbols.size,
  lastValuationOn: lastValuationOn,
  nowMs: Date.now(),
  todayISO: toISODate(new Date()),
})
```

`session` và `staleSymbols` lấy từ `sessionPrices()` trong `src/features/assets/holdings.ts` — `useAssetsData.ts` đã gọi nó, nên đọc lại từ đó thay vì gọi thêm lần nữa. `lastValuationOn` là ngày định giá lớn nhất trong danh sách định giá; chưa có tài sản tự khai thì để `null`.

Đoạn đọc `localStorage` ở trên là tạm: khi `readRatesMeta` của phiên kia về `master`, thay ba dòng đó bằng `readRatesMeta(base)?.fetchedAt ?? null`. Ghi chú này phải viết thành comment trong code.

- [ ] **Step 3: Gắn vào trang Báo cáo**

Y hệt, đặt dưới thanh chọn kỳ trong `ReportsPage.tsx`. Trang Báo cáo không có giá cổ phiếu hay giá trị tự khai, nên truyền `priceSession: null`, `staleSymbolCount: 0`, `lastValuationOn: null` — hàm sẽ chỉ hiện dòng tỷ giá.

- [ ] **Step 4: Xem thật**

Mở app, vào trang Tài sản. Kiểm: dòng chấm + chữ hiện đúng, bấm vào xổ ra danh sách nguồn, bấm lần nữa thì đóng. Xem cả chế độ tối.

Thử trường hợp cũ: trong console trình duyệt, đặt lại mốc lấy tỷ giá về 4 ngày trước rồi tải lại trang, xem chấm có chuyển sang màu hổ phách không.

- [ ] **Step 5: Chạy test, dựng bản thật, commit**

```bash
npx vitest run && npm run build
```
Expected: PASS và dựng xong.

```bash
git add src/components/DataFreshness.tsx src/features/assets/AssetsPage.tsx src/features/reports/ReportsPage.tsx
git commit -m "feat(do tin): dong gop tuoi du lieu o dau trang Tai san va Bao cao"
```

---

### Task 5: Dấu "số ước tính"

**Files:**
- Create: `src/components/EstimateMark.tsx`
- Modify: `src/features/assets/AssetsNowView.tsx` (khấu hao)
- Modify: `src/features/lifetime/LifetimeChartCard.tsx` (chiếu tài sản cả đời)
- Modify: `src/features/assets/SavingsGoalsSection.tsx` (ngày đạt mục tiêu)
- Modify: `src/features/assets/HoldingsSection.tsx` (mã kẹt giá cũ)

**Interfaces:**
- Consumes: không
- Produces: `export function EstimateMark(props: { reason: string }): ReactNode`

- [ ] **Step 1: Viết component**

Tạo `src/components/EstimateMark.tsx`:

```tsx
// Dấu nhỏ cạnh một con số ƯỚC TÍNH, để nó không bị đọc như số đã chốt.
//
// Chỉ dùng cho số do app tự suy ra: khấu hao, chiếu tương lai, dự phóng ngày đạt
// mục tiêu, giá cổ phiếu đã cũ. KHÔNG dùng cho số dư, số tiền giao dịch, tổng thu chi
// — những số đó là thật, gắn dấu vào chỉ làm người đọc mất tin vào cả màn hình.
interface Props {
  /** Một câu ngắn nói vì sao đây là số ước tính. */
  reason: string
}

export function EstimateMark({ reason }: Props) {
  return (
    <abbr
      title={reason}
      aria-label={`Số ước tính. ${reason}`}
      className="ml-0.5 cursor-help text-2xs font-medium text-fg-muted no-underline"
    >
      ≈
    </abbr>
  )
}
```

- [ ] **Step 2: Gắn vào bốn chỗ**

Đặt ngay sau con số, trong cùng thẻ chứa nó:

- `AssetsNowView.tsx` — giá trị tài sản đã trừ khấu hao:
  `<EstimateMark reason="Giá trị suy ra từ tỷ lệ khấu hao bạn đã đặt, không phải giá thị trường." />`
- `LifetimeChartCard.tsx` — số tài sản ròng chiếu tới tương lai:
  `<EstimateMark reason="Số chiếu theo kịch bản bạn đặt, không phải số đã xảy ra." />`
- `SavingsGoalsSection.tsx` — ngày đạt mục tiêu:
  `<EstimateMark reason="Suy ra từ tốc độ để dành gần đây; để dành nhanh chậm khác đi thì ngày này đổi." />`
- `HoldingsSection.tsx` — mã nằm trong `staleSymbols`:
  `<EstimateMark reason="Giá của phiên trước, chưa có giá phiên mới nhất." />`

- [ ] **Step 3: Xem thật**

Mở từng trang, di chuột lên dấu `≈` xem câu giải thích có hiện không. Trên điện thoại `title` không hiện được — đó là lý do có `aria-label`, và là lý do dấu này chỉ bổ nghĩa chứ không mang thông tin bắt buộc.

- [ ] **Step 4: Chạy test, dựng bản thật, commit**

```bash
npx vitest run && npm run build
```
Expected: PASS và dựng xong.

```bash
git add src/components/EstimateMark.tsx src/features/assets src/features/lifetime
git commit -m "feat(do tin): danh dau cac so uoc tinh bang ky hieu xap xi"
```

---

# ĐỢT B — Đọc là hiểu ngay

### Task 6: Câu tổng đầu trang Báo cáo

**Files:**
- Create: `src/features/reports/headline.ts`
- Test: `src/features/reports/headline.test.ts`
- Create: `src/features/reports/PeriodHeadline.tsx`
- Modify: `src/features/reports/ReportsPage.tsx`

**Interfaces:**
- Consumes: `savingsRate` từ `./insights`
- Produces:
  ```ts
  export interface HeadlineInput {
    income: number
    expense: number
    priorExpense: number | null
    periodNoun: string
  }
  export interface Headline {
    tone: 'good' | 'warn' | 'bad' | 'info'
    ratePct: number | null
    deltaPct: number | null
    text: string
  }
  export function headlineOf(input: HeadlineInput): Headline | null
  ```

- [ ] **Step 1: Viết test**

Tạo `src/features/reports/headline.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { headlineOf } from './headline'

describe('headlineOf', () => {
  const base = { income: 400_000, expense: 300_000, priorExpense: 250_000, periodNoun: 'tháng này' }

  it('chưa có thu lẫn chi → null', () => {
    expect(headlineOf({ ...base, income: 0, expense: 0 })).toBeNull()
  })

  it('giữ lại được 25% → đạt mốc 20%, tone good', () => {
    const r = headlineOf(base)
    expect(r?.ratePct).toBe(25)
    expect(r?.tone).toBe('good')
  })

  it('chi vượt thu → tone bad', () => {
    const r = headlineOf({ ...base, expense: 500_000 })
    expect(r?.tone).toBe('bad')
    expect(r?.ratePct).toBe(-25)
  })

  it('giữ lại dưới 20% → tone warn', () => {
    const r = headlineOf({ ...base, expense: 360_000 })
    expect(r?.ratePct).toBe(10)
    expect(r?.tone).toBe('warn')
  })

  it('không có thu → không tính được tỷ lệ, tone info', () => {
    const r = headlineOf({ ...base, income: 0 })
    expect(r?.ratePct).toBeNull()
    expect(r?.tone).toBe('info')
  })

  it('so với kỳ trước: chi nhiều hơn 20%', () => {
    expect(headlineOf(base)?.deltaPct).toBe(20)
  })

  it('không có kỳ trước → deltaPct null, câu chữ không nhắc so sánh', () => {
    const r = headlineOf({ ...base, priorExpense: null })
    expect(r?.deltaPct).toBeNull()
    expect(r?.text).not.toContain('kỳ trước')
  })

  it('kỳ trước bằng 0 → không chia cho 0', () => {
    expect(headlineOf({ ...base, priorExpense: 0 })?.deltaPct).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy test để chắc chắn nó hỏng**

```bash
npx vitest run src/features/reports/headline.test.ts
```
Expected: FAIL — không tìm thấy module `./headline`.

- [ ] **Step 3: Viết `headlineOf`**

Tạo `src/features/reports/headline.ts`:

```ts
// Câu tổng cho cả trang Báo cáo: ba số to rồi MỘT câu nối chúng lại.
//
// App đã có câu kết luận ở từng thẻ, nhưng chưa có câu nào trả lời "kỳ này rốt cuộc
// thế nào" trước khi người đọc cuộn qua bảy cái thẻ.

export interface HeadlineInput {
  income: number
  expense: number
  /** Chi của kỳ liền trước, để so. null = không có kỳ trước để so. */
  priorExpense: number | null
  /** "tháng này" / "năm này" — ghép thẳng vào câu. */
  periodNoun: string
}

export interface Headline {
  tone: 'good' | 'warn' | 'bad' | 'info'
  /** Phần trăm thu nhập giữ lại được. null khi không có thu. */
  ratePct: number | null
  /** Chi hơn/kém kỳ trước bao nhiêu phần trăm. null khi không so được. */
  deltaPct: number | null
  text: string
}

/** Trả null khi kỳ chưa có gì để nói (không thu, không chi). */
export function headlineOf(input: HeadlineInput): Headline | null {
  const { income, expense, priorExpense, periodNoun } = input
  if (income === 0 && expense === 0) return null

  const ratePct = income > 0 ? Math.round(((income - expense) / income) * 100) : null
  // Kỳ trước bằng 0 thì mọi mức chi đều là "tăng vô hạn" — không nói gì còn hơn.
  const deltaPct =
    priorExpense !== null && priorExpense > 0
      ? Math.round(((expense - priorExpense) / priorExpense) * 100)
      : null

  const tone: Headline['tone'] =
    ratePct === null ? 'info' : ratePct < 0 ? 'bad' : ratePct >= 20 ? 'good' : 'warn'

  const parts: string[] = []
  if (ratePct === null) {
    parts.push(`Chưa ghi khoản thu nào ${periodNoun}`)
  } else if (ratePct < 0) {
    parts.push(`Chi vượt thu ${Math.abs(ratePct)}% ${periodNoun} — đang phải rút vào tiền cũ`)
  } else {
    parts.push(`Giữ lại được ${ratePct}% thu nhập ${periodNoun}`)
    parts.push(ratePct >= 20 ? 'đạt mốc 20% của quy tắc 50/30/20' : 'chưa tới mốc 20% của quy tắc 50/30/20')
  }

  if (deltaPct !== null && deltaPct !== 0) {
    parts.push(`chi ${deltaPct > 0 ? 'nhiều hơn' : 'ít hơn'} kỳ trước ${Math.abs(deltaPct)}%`)
  }

  return { tone, ratePct, deltaPct, text: `${parts.join(', ')}.` }
}
```

- [ ] **Step 4: Chạy test**

```bash
npx vitest run src/features/reports/headline.test.ts
```
Expected: PASS 8 test.

- [ ] **Step 5: Viết component hiển thị**

Tạo `src/features/reports/PeriodHeadline.tsx`:

```tsx
import { Money, StatTile } from '../../components/ui'
import { VerdictNote } from '../../components/VerdictNote'
import type { CurrencyCode } from '../../lib/money'
import type { Headline } from './headline'

interface Props {
  headline: Headline | null
  income: number
  expense: number
  base: CurrencyCode
}

export function PeriodHeadline({ headline, income, expense, base }: Props) {
  if (!headline) return null
  return (
    <section className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Thu" center>
          <Money amount={income} currency={base} tone="in" compact />
        </StatTile>
        <StatTile label="Chi" center>
          <Money amount={expense} currency={base} tone="out" compact />
        </StatTile>
        <StatTile label="Giữ lại" center>
          {headline.ratePct === null ? '—' : `${headline.ratePct}%`}
        </StatTile>
      </div>
      <VerdictNote tone={headline.tone}>{headline.text}</VerdictNote>
    </section>
  )
}
```

Tên prop đã đối chiếu với code thật: `Money` nhận `tone` với giá trị `'in' | 'out' | 'neutral' | 'bySign'` (không phải `kind`), và `compact` để rút gọn cho ô KPI hẹp. `VerdictNote` nhận `tone` với `'good' | 'warn' | 'bad' | 'info'` — trùng đúng bộ giá trị của `Headline['tone']`.

- [ ] **Step 6: Gắn vào trang Báo cáo**

Trong `ReportsPage.tsx`, đặt `<PeriodHeadline>` ngay dưới thanh chọn kỳ, **trên** `<SectionIndex>` và ngoài khối lưới hai cột của Task 2. Nhánh tháng truyền `monthSums` + chi của tháng liền trước; nhánh năm truyền `yearSums` + chi của năm trước. Không có kỳ trước thì truyền `priorExpense: null`.

- [ ] **Step 7: Xem thật, chạy test, commit**

Mở trang Báo cáo cả tháng lẫn năm, xem câu chữ có đúng ngữ pháp trong các trường hợp: giữ lại nhiều, giữ lại ít, chi vượt thu, chưa có thu.

```bash
npx vitest run && npm run build
```
Expected: PASS và dựng xong.

```bash
git add src/features/reports/headline.ts src/features/reports/headline.test.ts src/features/reports/PeriodHeadline.tsx src/features/reports/ReportsPage.tsx
git commit -m "feat(bao cao): cau tong dau trang voi ba so to"
```

---

### Task 7: So tuần đang dở cho công bằng

**Files:**
- Create: `src/features/reports/weekPace.ts`
- Test: `src/features/reports/weekPace.test.ts`
- Modify: `src/features/reports/InsightsView.tsx`

**Interfaces:**
- Consumes: không
- Produces:
  ```ts
  export interface WeekPaceInput {
    thisWeek: number[]   // chi từng ngày của tuần này, phần tử 0 = ngày đầu tuần
    lastWeek: number[]   // chi từng ngày của tuần trước, đủ 7 phần tử
    dayOfWeek: number    // đang ở ngày thứ mấy của tuần này, 1..7
  }
  export interface WeekPace {
    tone: 'good' | 'warn' | 'info'
    spent: number
    priorSameDays: number
    deltaPct: number | null
    dayOfWeek: number
  }
  export function weekPace(input: WeekPaceInput): WeekPace | null
  ```

- [ ] **Step 1: Viết test**

Tạo `src/features/reports/weekPace.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { weekPace } from './weekPace'

describe('weekPace', () => {
  const lastWeek = [100, 100, 100, 100, 100, 100, 100]

  it('so ĐÚNG số ngày đã trôi, không so với cả tuần trước', () => {
    // 4 ngày, mỗi ngày 100 → bằng đúng nhịp 4 ngày đầu tuần trước (400), không phải 700
    const r = weekPace({ thisWeek: [100, 100, 100, 100], lastWeek, dayOfWeek: 4 })
    expect(r?.priorSameDays).toBe(400)
    expect(r?.deltaPct).toBe(0)
  })

  it('tiêu nhanh hơn → tone warn', () => {
    const r = weekPace({ thisWeek: [200, 200, 200, 200], lastWeek, dayOfWeek: 4 })
    expect(r?.deltaPct).toBe(100)
    expect(r?.tone).toBe('warn')
  })

  it('tiêu chậm hơn → tone good', () => {
    const r = weekPace({ thisWeek: [50, 50, 50, 50], lastWeek, dayOfWeek: 4 })
    expect(r?.deltaPct).toBe(-50)
    expect(r?.tone).toBe('good')
  })

  it('tuần trước không chi gì → không chia cho 0, tone info', () => {
    const r = weekPace({ thisWeek: [100], lastWeek: [0, 0, 0, 0, 0, 0, 0], dayOfWeek: 1 })
    expect(r?.deltaPct).toBeNull()
    expect(r?.tone).toBe('info')
  })

  it('chưa có tuần trước → null', () => {
    expect(weekPace({ thisWeek: [100], lastWeek: [], dayOfWeek: 1 })).toBeNull()
  })

  it('tuần này chưa chi gì → vẫn trả kết quả (0 là thông tin thật)', () => {
    const r = weekPace({ thisWeek: [0, 0], lastWeek, dayOfWeek: 2 })
    expect(r?.spent).toBe(0)
    expect(r?.deltaPct).toBe(-100)
  })
})
```

- [ ] **Step 2: Chạy test để chắc chắn nó hỏng**

```bash
npx vitest run src/features/reports/weekPace.test.ts
```
Expected: FAIL — không tìm thấy module `./weekPace`.

- [ ] **Step 3: Viết `weekPace`**

Tạo `src/features/reports/weekPace.ts`:

```ts
// So tuần đang dở với tuần trước — TÍNH TỚI CÙNG SỐ NGÀY.
//
// Vì sao phải cắt: so 4 ngày của tuần này với trọn 7 ngày tuần trước thì lúc nào cũng
// ra "đang tiêu ít hơn", và tới chủ nhật thì đột ngột đổi giọng. Cắt đúng số ngày đã
// trôi mới nói được điều gì thật.

export interface WeekPaceInput {
  /** Chi từng ngày của tuần này, phần tử 0 là ngày đầu tuần. */
  thisWeek: number[]
  /** Chi từng ngày của tuần trước, đủ 7 phần tử. */
  lastWeek: number[]
  /** Đang ở ngày thứ mấy của tuần này (1..7). */
  dayOfWeek: number
}

export interface WeekPace {
  tone: 'good' | 'warn' | 'info'
  spent: number
  priorSameDays: number
  deltaPct: number | null
  dayOfWeek: number
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Trả null khi chưa có tuần trước để so. */
export function weekPace(input: WeekPaceInput): WeekPace | null {
  const { thisWeek, lastWeek, dayOfWeek } = input
  if (lastWeek.length === 0) return null

  const spent = sum(thisWeek.slice(0, dayOfWeek))
  const priorSameDays = sum(lastWeek.slice(0, dayOfWeek))

  const deltaPct =
    priorSameDays > 0 ? Math.round(((spent - priorSameDays) / priorSameDays) * 100) : null

  const tone: WeekPace['tone'] =
    deltaPct === null ? 'info' : deltaPct > 0 ? 'warn' : deltaPct < 0 ? 'good' : 'info'

  return { tone, spent, priorSameDays, deltaPct, dayOfWeek }
}
```

- [ ] **Step 4: Chạy test**

```bash
npx vitest run src/features/reports/weekPace.test.ts
```
Expected: PASS 6 test.

- [ ] **Step 5: Hiện ra trong tab Thấu hiểu**

Trong `InsightsView.tsx`, dựng `thisWeek`/`lastWeek` từ `dailyExpenseTotals` (đã có trong `aggregate.ts`) cho khoảng 14 ngày gần nhất, rồi hiện bằng `VerdictNote`:

> Ngày 4/7 — đã chi 12.300 ¥, nhanh hơn nhịp tuần trước 8%.

Tuần bắt đầu từ thứ Hai. `dayOfWeek` tính bằng `((new Date().getDay() + 6) % 7) + 1` — `getDay()` trả 0 cho Chủ nhật nên phải xoay, nếu không thì Chủ nhật thành ngày đầu tuần.

- [ ] **Step 6: Xem thật, chạy test, commit**

```bash
npx vitest run && npm run build
```
Expected: PASS và dựng xong.

```bash
git add src/features/reports/weekPace.ts src/features/reports/weekPace.test.ts src/features/reports/InsightsView.tsx
git commit -m "feat(thau hieu): so nhip chi tuan nay voi tuan truoc theo cung so ngay"
```

---

### Task 8: Bộ lọc "chưa gắn danh mục"

**Files:**
- Modify: `src/data/repo.ts:162-174` (thêm trường vào `TxFilter`)
- Modify: `src/features/transactions/filter.ts` (nhánh lọc phía demo)
- Modify: `src/features/transactions/filter.test.ts`
- Modify: `src/data/supabaseRepo.ts:168-199` (nhánh lọc phía Supabase)
- Modify: `src/features/transactions/SearchPage.tsx`

**Interfaces:**
- Consumes: không
- Produces: `TxFilter.uncategorized?: boolean`; đường dẫn sâu `/search?uncat=1&from=…&to=…`

- [ ] **Step 1: Viết test cho nhánh lọc**

Thêm vào `src/features/transactions/filter.test.ts` (mở file xem cách nó dựng `txs` sẵn có rồi theo đúng khuôn đó):

```ts
describe('lọc chưa gắn danh mục', () => {
  it('uncategorized=true chỉ giữ giao dịch không có danh mục', () => {
    const txs = [
      { ...baseTx, id: 'a', category_id: null },
      { ...baseTx, id: 'b', category_id: 'cat-1' },
    ]
    const r = filterTransactions(txs, {
      start: '2026-07-01',
      end: '2026-08-01',
      uncategorized: true,
    })
    expect(r.map((t) => t.id)).toEqual(['a'])
  })

  it('không đặt uncategorized thì giữ nguyên mọi giao dịch', () => {
    const txs = [
      { ...baseTx, id: 'a', category_id: null },
      { ...baseTx, id: 'b', category_id: 'cat-1' },
    ]
    const r = filterTransactions(txs, { start: '2026-07-01', end: '2026-08-01' })
    expect(r).toHaveLength(2)
  })
})
```

`baseTx` là biến dựng sẵn trong file test đó — dùng đúng tên nó đang có, đừng tự đặt tên mới.

- [ ] **Step 2: Chạy test để chắc chắn nó hỏng**

```bash
npx vitest run src/features/transactions/filter.test.ts
```
Expected: FAIL — lọc không có tác dụng, trả về cả hai giao dịch.

- [ ] **Step 3: Thêm trường vào `TxFilter`**

Trong `src/data/repo.ts`, thêm vào `interface TxFilter`:

```ts
  /** Chỉ lấy giao dịch CHƯA gắn danh mục (category_id null). */
  uncategorized?: boolean
```

- [ ] **Step 4: Lọc ở phía demo**

Trong `src/features/transactions/filter.ts`, thêm vào đầu `matchesFilter`, ngay sau nhánh `types`:

```ts
  if (filter.uncategorized && t.category_id != null) return false
```

- [ ] **Step 5: Lọc ở phía Supabase**

Trong `src/data/supabaseRepo.ts`, trong `buildQuery` của `searchTransactions`, thêm ngay sau nhánh `categoryIds`:

```ts
      if (filter.uncategorized) q = q.is('category_id', null)
```

- [ ] **Step 6: Chạy test**

```bash
npx vitest run src/features/transactions/filter.test.ts
```
Expected: PASS.

- [ ] **Step 7: Cho trang Tìm kiếm dùng được**

Trong `SearchPage.tsx`:

- đọc thêm `uncat: searchParams.get('uncat') === '1'` vào `initial` (khối `useState(() => ({...}))` ở dòng 58)
- thêm state `const [uncategorized, setUncategorized] = useState(initial.uncat)`
- đưa vào `filter`: `uncategorized: uncategorized || undefined`
- thêm một ô tích trong khối lọc mở rộng, nhãn "Chỉ khoản chưa gắn danh mục"
- mở sẵn khối lọc khi vào từ đường dẫn sâu: đổi `useState(initial.tagIds.length > 0)` thành `useState(initial.tagIds.length > 0 || initial.uncat)`

- [ ] **Step 8: Xem thật, chạy test, commit**

Mở `/search?uncat=1` — kiểm khối lọc mở sẵn, ô tích đã bật, danh sách chỉ còn khoản chưa gắn danh mục.

```bash
npx vitest run && npm run build
```
Expected: PASS và dựng xong.

```bash
git add src/data/repo.ts src/data/supabaseRepo.ts src/features/transactions
git commit -m "feat(tim kiem): loc rieng cac khoan chua gan danh muc"
```

---

### Task 9: Bảng chi chưa gắn danh mục theo tháng

**Files:**
- Create: `src/features/reports/uncategorized.ts`
- Test: `src/features/reports/uncategorized.test.ts`
- Create: `src/features/reports/UncategorizedBacklogCard.tsx`
- Modify: `src/features/reports/InsightsView.tsx`

**Interfaces:**
- Consumes: `TxFilter.uncategorized` (Task 8), `MonthKey` từ `src/lib/dates`
- Produces:
  ```ts
  export interface MonthBacklogRow {
    monthKey: string   // "2026-08"
    pending: number
    total: number
    doneRatio: number  // 0..1
  }
  export function uncategorizedByMonth(
    txs: { occurred_on: string; category_id: string | null; type: string }[],
  ): MonthBacklogRow[]
  ```

- [ ] **Step 1: Viết test**

Tạo `src/features/reports/uncategorized.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { uncategorizedByMonth } from './uncategorized'

const tx = (occurred_on: string, category_id: string | null, type = 'expense') => ({
  occurred_on,
  category_id,
  type,
})

describe('uncategorizedByMonth', () => {
  it('gom theo tháng và đếm số khoản chưa gắn', () => {
    const r = uncategorizedByMonth([
      tx('2026-08-01', null),
      tx('2026-08-02', 'c1'),
      tx('2026-08-03', null),
    ])
    expect(r).toEqual([{ monthKey: '2026-08', pending: 2, total: 3, doneRatio: 1 / 3 }])
  })

  it('tháng cũ nhất lên trước', () => {
    const r = uncategorizedByMonth([tx('2026-08-01', null), tx('2026-06-01', null)])
    expect(r.map((x) => x.monthKey)).toEqual(['2026-06', '2026-08'])
  })

  it('tháng đã gắn đủ thì không hiện', () => {
    const r = uncategorizedByMonth([tx('2026-08-01', 'c1'), tx('2026-07-01', null)])
    expect(r.map((x) => x.monthKey)).toEqual(['2026-07'])
  })

  it('bỏ qua chuyển khoản — chuyển khoản vốn không có danh mục', () => {
    const r = uncategorizedByMonth([tx('2026-08-01', null, 'transfer')])
    expect(r).toEqual([])
  })

  it('không có gì → mảng rỗng', () => {
    expect(uncategorizedByMonth([])).toEqual([])
  })
})
```

- [ ] **Step 2: Chạy test để chắc chắn nó hỏng**

```bash
npx vitest run src/features/reports/uncategorized.test.ts
```
Expected: FAIL — không tìm thấy module `./uncategorized`.

- [ ] **Step 3: Viết hàm**

Tạo `src/features/reports/uncategorized.ts`:

```ts
// "Còn tồn theo tháng, cũ nhất trước" — mượn cách permtrack liệt kê hồ sơ tồn đọng.
//
// Lưu ý tên gọi: `unclassifiedCount` trong ReportsPage là số DANH MỤC thiếu phân loại
// need_level/cost_type. Chỗ này đếm GIAO DỊCH chưa gắn danh mục — hai thứ khác nhau.

export interface MonthBacklogRow {
  /** "2026-08" */
  monthKey: string
  pending: number
  total: number
  /** 0..1 — phần đã gắn xong. */
  doneRatio: number
}

interface TxLike {
  occurred_on: string
  category_id: string | null
  type: string
}

/**
 * Gom theo tháng, chỉ giữ tháng còn khoản chưa gắn, xếp tháng CŨ NHẤT lên trước —
 * việc tồn lâu nhất là việc nên làm trước.
 *
 * Chuyển khoản bị loại: nó vốn không có danh mục, đếm vào thì tháng nào cũng "còn tồn".
 */
export function uncategorizedByMonth(txs: TxLike[]): MonthBacklogRow[] {
  const byMonth = new Map<string, { pending: number; total: number }>()

  for (const t of txs) {
    if (t.type === 'transfer') continue
    const key = t.occurred_on.slice(0, 7)
    const cur = byMonth.get(key) ?? { pending: 0, total: 0 }
    cur.total += 1
    if (t.category_id === null) cur.pending += 1
    byMonth.set(key, cur)
  }

  return [...byMonth.entries()]
    .filter(([, v]) => v.pending > 0)
    .map(([monthKey, v]) => ({
      monthKey,
      pending: v.pending,
      total: v.total,
      doneRatio: (v.total - v.pending) / v.total,
    }))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
}
```

- [ ] **Step 4: Chạy test**

```bash
npx vitest run src/features/reports/uncategorized.test.ts
```
Expected: PASS 5 test.

- [ ] **Step 5: Viết thẻ hiển thị**

Tạo `src/features/reports/UncategorizedBacklogCard.tsx`. Mỗi dòng là một tháng: tên tháng, "còn N khoản", phần trăm đã gắn, và một thanh tiến độ mảnh. Cả dòng là một `<Link>` tới:

```
/search?uncat=1&from=<ngày đầu tháng>&to=<ngày cuối tháng>
```

Thẻ ẩn hẳn khi mảng rỗng — không hiện "không còn gì" cho một việc người dùng không hỏi.

Dùng khuôn thẻ chuẩn: `<section className="rounded-xl bg-surface p-3 shadow-sm">`, tiêu đề `<h2 className="mb-2 text-sm font-semibold text-fg-muted">Khoản chưa gắn danh mục</h2>`. Thanh tiến độ dùng `bg-surface-sunken` làm nền và `bg-accent` làm phần đã xong.

Thêm một dòng giải thích ngắn dưới danh sách: "Xếp tháng cũ nhất lên trước — khoản để lâu thường khó nhớ ra đã tiêu vào việc gì."

- [ ] **Step 6: Gắn vào tab Thấu hiểu**

Trong `InsightsView.tsx`, đặt thẻ dưới khối nhịp chi tuần của Task 7. Nguồn giao dịch: dùng hook nạp giao dịch sẵn có của tab đó — nếu tab chỉ nạp một tháng thì đổi sang khoảng 12 tháng gần nhất, vì bảng này vô nghĩa khi chỉ nhìn một tháng.

- [ ] **Step 7: Xem thật, chạy test, commit**

Xóa danh mục của vài giao dịch cũ trong chế độ demo để có dữ liệu, rồi kiểm: bảng hiện đúng tháng, bấm dòng nhảy sang trang Tìm kiếm đã lọc sẵn.

```bash
npx vitest run && npm run build
```
Expected: PASS và dựng xong.

```bash
git add src/features/reports/uncategorized.ts src/features/reports/uncategorized.test.ts src/features/reports/UncategorizedBacklogCard.tsx src/features/reports/InsightsView.tsx
git commit -m "feat(thau hieu): bang khoan chua gan danh muc, thang cu nhat truoc"
```

---

### Task 10: Cột phân bố trong thẻ "Một lần chi to cỡ nào"

**Files:**
- Modify: `src/features/reports/behavior.ts:59-67` (thêm p5/p95 vào `SpendPercentiles`)
- Modify: `src/features/reports/behavior.test.ts`
- Create: `src/features/reports/histogram.ts`
- Test: `src/features/reports/histogram.test.ts`
- Modify: `src/features/reports/SpendSizeCard.tsx`

**Interfaces:**
- Consumes: `SpendPercentiles` từ `./behavior`
- Produces:
  ```ts
  export interface HistogramBin { from: number; to: number; count: number }
  export function spendHistogram(amounts: number[], binCount?: number): HistogramBin[]
  ```
  và `SpendPercentiles` có thêm `p5: number; p95: number`

- [ ] **Step 1: Viết test cho `spendHistogram`**

Tạo `src/features/reports/histogram.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { spendHistogram } from './histogram'

describe('spendHistogram', () => {
  it('chia đều khoảng và đếm đúng', () => {
    const bins = spendHistogram([0, 10, 20, 30], 2)
    expect(bins).toHaveLength(2)
    expect(bins[0].count + bins[1].count).toBe(4)
  })

  it('giá trị lớn nhất rơi vào cột cuối, không tràn ra ngoài', () => {
    const bins = spendHistogram([0, 100], 4)
    expect(bins[bins.length - 1].count).toBe(1)
  })

  it('mọi khoản bằng nhau → một cột duy nhất chứa hết', () => {
    const bins = spendHistogram([50, 50, 50], 4)
    expect(bins).toHaveLength(1)
    expect(bins[0].count).toBe(3)
  })

  it('mảng rỗng → không có cột nào', () => {
    expect(spendHistogram([], 4)).toEqual([])
  })

  it('số cột không vượt số khoản chi', () => {
    expect(spendHistogram([10, 20], 12).length).toBeLessThanOrEqual(2)
  })
})
```

- [ ] **Step 2: Chạy test để chắc chắn nó hỏng**

```bash
npx vitest run src/features/reports/histogram.test.ts
```
Expected: FAIL — không tìm thấy module `./histogram`.

- [ ] **Step 3: Viết `spendHistogram`**

Tạo `src/features/reports/histogram.ts`:

```ts
// Chia các khoản chi thành từng khoảng tiền để vẽ cột phân bố.
//
// Phân vị trả lời "mức điển hình là bao nhiêu"; phân bố trả lời "các lần chi nằm rải
// thế nào" — hai câu hỏi khác nhau, permtrack để cả hai cạnh nhau ở trang lương.

export interface HistogramBin {
  from: number
  to: number
  count: number
}

/**
 * Số cột tối đa 12 để trên điện thoại còn đọc được, và không bao giờ nhiều hơn số
 * khoản chi (4 khoản mà 12 cột thì nhìn như răng lược).
 */
export function spendHistogram(amounts: number[], binCount = 12): HistogramBin[] {
  if (amounts.length === 0) return []

  const min = Math.min(...amounts)
  const max = Math.max(...amounts)

  // Mọi khoản bằng nhau: chia khoảng sẽ ra bề rộng 0 rồi chia cho 0.
  if (min === max) return [{ from: min, to: max, count: amounts.length }]

  const n = Math.max(1, Math.min(binCount, amounts.length))
  const width = (max - min) / n
  const bins: HistogramBin[] = Array.from({ length: n }, (_, i) => ({
    from: min + i * width,
    to: min + (i + 1) * width,
    count: 0,
  }))

  for (const v of amounts) {
    // Giá trị lớn nhất rơi đúng biên trên → ép về cột cuối thay vì tràn ra ngoài mảng.
    const idx = Math.min(n - 1, Math.floor((v - min) / width))
    bins[idx].count += 1
  }

  return bins
}
```

- [ ] **Step 4: Chạy test**

```bash
npx vitest run src/features/reports/histogram.test.ts
```
Expected: PASS 5 test.

- [ ] **Step 5: Thêm p5/p95 vào `SpendPercentiles`**

Trong `src/features/reports/behavior.ts`, thêm hai trường vào `interface SpendPercentiles`:

```ts
  /** Phân vị 5 và 95 — khoảng chứa 90% số lần chi, đã bỏ hai đuôi cực trị. */
  p5: number
  p95: number
```

rồi tính thêm bằng chính hàm `quantile` đã có trong file (`quantile(sorted, 0.05)` và `quantile(sorted, 0.95)`). Thêm một test vào `behavior.test.ts` kiểm p5 < median < p95 trên bộ dữ liệu sẵn có của file đó.

- [ ] **Step 6: Vẽ cột phân bố trong thẻ**

Trong `SpendSizeCard.tsx`, thêm sau danh sách phân vị (trước khối cảnh báo lệch):

- một biểu đồ cột vẽ bằng SVG thuần, cao khoảng 48px, mỗi cột một `<rect>`, chiều cao theo `count / max(count)`
- một dòng chữ dưới biểu đồ: `90% số lần chi nằm trong khoảng {money(p5)} – {money(p95)}`

Màu cột dùng `fill="var(--color-sky-600)"` — hex bị `designSystem.test.ts` cấm trong đồ thị. Component cần nhận thêm prop `amounts: number[]` để dựng histogram; `SpendSizeCard` hiện chỉ nhận `data`, nên thêm prop và truyền từ nơi gọi.

Thêm một câu vào `ExplainBox` sẵn có: "Cột phân bố cho biết các lần chi rơi vào khoảng tiền nào nhiều nhất — cột càng cao thì càng nhiều lần chi ở mức đó."

- [ ] **Step 7: Xem thật, chạy test, commit**

```bash
npx vitest run && npm run build
```
Expected: PASS và dựng xong.

```bash
git add src/features/reports/histogram.ts src/features/reports/histogram.test.ts src/features/reports/behavior.ts src/features/reports/behavior.test.ts src/features/reports/SpendSizeCard.tsx
git commit -m "feat(bao cao): them cot phan bo va khoang 90% vao the mot lan chi"
```

---

# ĐỢT C — Cảm giác mượt

### Task 11: Khung xương lúc chờ

**Files:**
- Create: `src/components/PageSkeleton.tsx`
- Modify: `src/App.tsx:68-69` và các dòng `lazyRoute(...)` ở 111-131

**Interfaces:**
- Consumes: không
- Produces: `export function PageSkeleton(props: { kind: 'list' | 'cards' | 'table' }): ReactNode`

- [ ] **Step 1: Viết component**

Tạo `src/components/PageSkeleton.tsx`:

```tsx
// Khung xương lúc chờ trang lazy tải xong.
//
// Trước đây mọi trang lazy dùng chung chữ "Đang tải…" giữa màn trắng. Khung xương hơn
// ở chỗ nó giữ đúng chỗ cho nội dung sắp tới, nên lúc thay vào trang không giật.
// Kích thước khối phải khớp nội dung thật — lệch nhiều thì còn tệ hơn chữ "Đang tải…".
interface Props {
  kind: 'list' | 'cards' | 'table'
}

const Block = ({ className }: { className: string }) => (
  <div className={`animate-pulse rounded-lg bg-surface-sunken ${className}`} />
)

export function PageSkeleton({ kind }: Props) {
  if (kind === 'list') {
    return (
      <div className="flex flex-col gap-3 p-3 lg:p-6" aria-busy="true" aria-label="Đang tải">
        <Block className="h-9 w-full" />
        {Array.from({ length: 8 }, (_, i) => (
          <Block key={i} className="h-14 w-full" />
        ))}
      </div>
    )
  }

  if (kind === 'table') {
    return (
      <div className="flex flex-col gap-2 p-3 lg:p-6" aria-busy="true" aria-label="Đang tải">
        <Block className="h-9 w-40" />
        {Array.from({ length: 6 }, (_, i) => (
          <Block key={i} className="h-11 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div
      className="flex flex-col gap-4 p-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:p-6"
      aria-busy="true"
      aria-label="Đang tải"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <Block key={i} className="h-44 w-full" />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Dùng trong `App.tsx`**

Đổi `lazyRoute` để nhận kiểu khung xương, bỏ hẳn `Loading`:

```tsx
const lazyRoute = (el: ReactNode, kind: 'list' | 'cards' | 'table' = 'cards') => (
  <Suspense fallback={<PageSkeleton kind={kind} />}>{el}</Suspense>
)
```

Gán kiểu cho từng route:

- `list` — `/search`
- `table` — `/debts`, `/recurring`, `/settings/accounts`, `/settings/categories`, `/settings/tags`
- `cards` — còn lại (mặc định)

- [ ] **Step 3: Xem thật**

Trong DevTools, bật giới hạn mạng "Slow 3G" rồi chuyển sang trang Báo cáo, Nợ, Tìm kiếm. Kiểm khung xương hiện ra và lúc nội dung thật thay vào không bị giật rõ.

- [ ] **Step 4: Chạy test, dựng bản thật, commit**

```bash
npx vitest run && npm run build
```
Expected: PASS và dựng xong.

```bash
git add src/components/PageSkeleton.tsx src/App.tsx
git commit -m "feat(cam giac): khung xuong luc cho thay cho chu Dang tai"
```

---

### Task 12: Đường xu hướng tí hon

**Files:**
- Create: `src/components/ui/Sparkline.tsx`
- Test: `src/components/ui/sparkline.test.ts`
- Create: `src/components/ui/sparkline.ts`
- Modify: `src/components/ui/index.ts`
- Modify: `src/features/assets/AssetsNowView.tsx`

**Interfaces:**
- Consumes: không
- Produces:
  ```ts
  export function sparklinePath(values: number[], width: number, height: number): string | null
  export function Sparkline(props: { values: number[]; className?: string }): ReactNode
  ```

- [ ] **Step 1: Viết test cho phần tính toạ độ**

Tạo `src/components/ui/sparkline.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { sparklinePath } from './sparkline'

describe('sparklinePath', () => {
  it('dưới hai điểm → null (một điểm không thành đường)', () => {
    expect(sparklinePath([5], 60, 20)).toBeNull()
    expect(sparklinePath([], 60, 20)).toBeNull()
  })

  it('điểm đầu ở mép trái, điểm cuối ở mép phải', () => {
    const d = sparklinePath([0, 10], 60, 20)
    expect(d).toMatch(/^M0,/)
    expect(d).toContain('L60,')
  })

  it('giá trị lớn nhất nằm trên đỉnh (y = 0)', () => {
    expect(sparklinePath([0, 10], 60, 20)).toContain('L60,0')
  })

  it('mọi giá trị bằng nhau → đường nằm giữa, không chia cho 0', () => {
    const d = sparklinePath([5, 5, 5], 60, 20)
    expect(d).toBe('M0,10 L30,10 L60,10')
  })
})
```

- [ ] **Step 2: Chạy test để chắc chắn nó hỏng**

```bash
npx vitest run src/components/ui/sparkline.test.ts
```
Expected: FAIL — không tìm thấy module `./sparkline`.

- [ ] **Step 3: Viết `sparklinePath`**

Tạo `src/components/ui/sparkline.ts`:

```ts
// Toạ độ cho đường xu hướng tí hon. Tách khỏi component để test được bằng chuỗi.
//
// Không dùng recharts: 12 điểm mà gọi cả thư viện thì vừa nặng vừa phải chống lại
// margin/trục mặc định của nó.

/** Trả null khi chưa đủ hai điểm để nối thành đường. */
export function sparklinePath(values: number[], width: number, height: number): string | null {
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const stepX = width / (values.length - 1)

  const points = values.map((v, i) => {
    const x = Math.round(i * stepX * 100) / 100
    // Mọi giá trị bằng nhau: đặt đường vào giữa thay vì chia cho 0.
    const y = span === 0 ? height / 2 : Math.round((1 - (v - min) / span) * height * 100) / 100
    return `${x},${y}`
  })

  return `M${points[0]} ${points.slice(1).map((p) => `L${p}`).join(' ')}`
}
```

- [ ] **Step 4: Chạy test**

```bash
npx vitest run src/components/ui/sparkline.test.ts
```
Expected: PASS 4 test.

- [ ] **Step 5: Viết component**

Tạo `src/components/ui/Sparkline.tsx`:

```tsx
import { sparklinePath } from './sparkline'

interface Props {
  values: number[]
  className?: string
}

export function Sparkline({ values, className = '' }: Props) {
  const W = 60
  const H = 20
  const d = sparklinePath(values, W, H)
  if (!d) return null

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className={`shrink-0 overflow-visible ${className}`.trim()}
      role="img"
      aria-label="Xu hướng gần đây"
    >
      {/* sky-600 chứ không sky-500: nét đồ thị cần 3:1, sky-500 chỉ đạt 2,77:1 trên nền trắng */}
      <path
        d={d}
        fill="none"
        stroke="var(--color-sky-600)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
```

Xuất thêm từ `src/components/ui/index.ts`:

```ts
export { Sparkline } from './Sparkline'
```

- [ ] **Step 6: Dùng ở trang Tài sản**

Trong `AssetsNowView.tsx`, thêm `<Sparkline>` vào mỗi dòng tài khoản: 12 giá trị số dư cuối tháng gần nhất. Bên cạnh đường, hiện phần trăm đổi giữa điểm đầu và điểm cuối theo mẫu permtrack — chữ dùng `text-2xs text-fg-muted`, không tô màu thu/chi vì đây là xu hướng chứ không phải một khoản tiền.

Tài khoản chưa đủ hai tháng dữ liệu thì `sparklinePath` trả null và component tự ẩn — không cần thêm điều kiện ở nơi gọi.

- [ ] **Step 7: Xem thật, chạy test, commit**

Xem ở cả chế độ sáng và tối, kiểm đường có nhìn rõ trên cả hai nền.

```bash
npx vitest run && npm run build
```
Expected: PASS và dựng xong.

```bash
git add src/components/ui/Sparkline.tsx src/components/ui/sparkline.ts src/components/ui/sparkline.test.ts src/components/ui/index.ts src/features/assets/AssetsNowView.tsx
git commit -m "feat(tai san): duong xu huong ti hon tren tung dong tai khoan"
```

---

## Kiểm cuối cùng

- [ ] `npx vitest run` — toàn bộ test xanh, gồm `tests/designSystem.test.ts`
- [ ] `npm run build` — dựng xong, không lỗi
- [ ] Xem app ở 1440×900 và 390×844, cả chế độ sáng lẫn tối
- [ ] `git log --oneline master..HEAD` — mỗi task một commit, thông điệp bằng tiếng Việt không dấu
