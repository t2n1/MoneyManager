# Gom cụm dữ liệu vào trang "Dữ liệu & sao lưu" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gom Xuất CSV/PDF, Sao lưu/Khôi phục JSON và lối vào Nhập CSV vào một trang duy nhất `/settings/data`, dọn sạch trang Báo cáo và Cài đặt.

**Architecture:** Tạo trang `DataPage` mới làm điểm vào duy nhất từ Cài đặt. Trang này tái dùng nguyên `BackupSection`, thêm một khối `ExportSection` (chọn Tháng/Năm → tải CSV / mở báo cáo in), và một dòng dẫn sang trang Nhập CSV hiện có. Trang Báo cáo bỏ toolbar xuất và thay bằng cơ chế đọc tham số URL để tự in.

**Tech Stack:** React 19, react-router-dom 7, @tanstack/react-query 5, TailwindCSS 4, lucide-react, Vite, Vitest.

## Global Constraints

- Giao diện & chuỗi hiển thị: tiếng Việt, đơn giản, giữ đúng phong cách các trang hiện có.
- Hỗ trợ dark mode: mọi class màu phải có biến `dark:` tương ứng theo mẫu các file cùng thư mục.
- Không đổi định dạng/nội dung CSV (`buildTransactionsCsv`) hay JSON backup hiện có.
- Không viết lại luồng nhập CSV.
- Tên file CSV giữ quy ước cũ: `so-chi-tieu-<YYYY-MM|YYYY>.csv`.
- Sau mỗi task: `npm run lint` và `npm run test` phải xanh; build `npm run build` không lỗi TypeScript.

---

### Task 1: Trang Dữ liệu (khung) + route + đổi điều hướng

Tạo trang mới chứa **Sao lưu/khôi phục** (tái dùng `BackupSection`) và **một dòng dẫn sang Nhập CSV**; nối route; dọn hai thứ này khỏi trang Cài đặt; đổi nút quay lại của trang Nhập CSV. Khối Xuất CSV/PDF làm ở Task 2.

**Files:**
- Create: `src/features/settings/DataPage.tsx`
- Modify: `src/App.tsx` (thêm lazy route)
- Modify: `src/features/settings/SettingsPage.tsx` (bỏ dòng Nhập CSV, bỏ `BackupSection`, thêm mục "Dữ liệu & sao lưu")
- Modify: `src/features/import/ImportCsvPage.tsx:156` (đổi đích nút quay lại)

**Interfaces:**
- Produces: `DataPage` (default-less named export `export function DataPage()`), gắn ở route `/settings/data`.
- Consumes: `BackupSection` từ `./BackupSection` (không đổi).

- [ ] **Step 1: Tạo `src/features/settings/DataPage.tsx`**

```tsx
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, FileUp } from 'lucide-react'
import { BackupSection } from './BackupSection'

export function DataPage() {
  return (
    <div className="flex flex-col gap-4 p-3 lg:p-6">
      <div className="flex items-center gap-2">
        <Link
          to="/settings"
          className="rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-bold text-gray-800 dark:text-gray-100">
          Dữ liệu &amp; sao lưu
        </h1>
      </div>

      {/* Khối A (Xuất CSV/PDF) sẽ thêm ở Task 2 */}

      <BackupSection />

      <section className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-900">
        <h2 className="px-3 pt-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
          Nhập dữ liệu
        </h2>
        <div className="mt-1">
          <Link
            to="/settings/import"
            className="flex items-center gap-3 px-3 py-3 text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            <FileUp className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <span className="flex-1">Nhập giao dịch từ CSV</span>
            <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600" />
          </Link>
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Thêm route lazy trong `src/App.tsx`**

Sau khối khai báo `const ImportCsvPage = lazy(...)` (kết thúc ở dòng 44), thêm:

```tsx
const DataPage = lazy(() =>
  import('./features/settings/DataPage').then((m) => ({ default: m.DataPage })),
)
```

Trong `<Routes>`, ngay sau dòng `<Route path="/settings/import" element={lazyRoute(<ImportCsvPage />)} />`, thêm:

```tsx
<Route path="/settings/data" element={lazyRoute(<DataPage />)} />
```

- [ ] **Step 3: Sửa `src/features/settings/SettingsPage.tsx`**

3a. Đổi dòng import icon (dòng 4) — bỏ `FileUp`, thêm `Database`:

```tsx
import { ChevronRight, Database, Handshake, Landmark, Layers, Repeat, Tags, UserRound } from 'lucide-react'
```

3b. Bỏ import `BackupSection` (dòng 9):

```tsx
// XÓA dòng: import { BackupSection } from './BackupSection'
```

3c. Trong danh sách "Quản lý", XÓA nguyên khối `Link` tới `/settings/import` (dòng 88–95, phần tử có icon `FileUp` và nhãn "Nhập giao dịch từ CSV").

3d. Thay dòng `<BackupSection />` (dòng 101) bằng một section mục "Dữ liệu & sao lưu":

```tsx
<section className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-900">
  <Link
    to="/settings/data"
    className="flex items-center gap-3 px-3 py-3 text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
  >
    <Database className="h-5 w-5 text-gray-500 dark:text-gray-400" />
    <span className="flex-1">
      <span className="block">Dữ liệu &amp; sao lưu</span>
      <span className="block text-xs text-gray-400 dark:text-gray-500">
        Xuất CSV / PDF · Sao lưu, khôi phục · Nhập CSV
      </span>
    </span>
    <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600" />
  </Link>
</section>
```

(Lưu ý: `Link` đã được import sẵn ở `SettingsPage.tsx` dòng 3.)

- [ ] **Step 4: Sửa nút quay lại của trang Nhập CSV**

Trong `src/features/import/ImportCsvPage.tsx`, đổi `to="/settings"` (dòng 156) thành:

```tsx
to="/settings/data"
```

- [ ] **Step 5: Kiểm tra lint + test + build**

Run: `npm run lint && npm run test && npm run build`
Expected: tất cả xanh, không lỗi TypeScript (không còn cảnh báo `FileUp`/`BackupSection` không dùng ở `SettingsPage`).

- [ ] **Step 6: Kiểm tra trên trình duyệt**

Mở dev server (`/settings`): còn đúng **một** mục "Dữ liệu & sao lưu", không còn "Nhập giao dịch từ CSV" ở Quản lý, không còn khối Sao lưu. Bấm mục → sang `/settings/data` thấy khối Sao lưu + dòng Nhập CSV. Bấm dòng Nhập CSV → sang trang nhập; nút quay lại của trang nhập quay về `/settings/data`.

- [ ] **Step 7: Commit**

```bash
git add src/features/settings/DataPage.tsx src/App.tsx src/features/settings/SettingsPage.tsx src/features/import/ImportCsvPage.tsx
git commit -m "feat(du-lieu): tao trang /settings/data gom sao luu + loi vao nhap CSV; don trang Cai dat"
```

---

### Task 2: Khối Xuất CSV + PDF trong trang Dữ liệu

Thêm helper tên file (có test), rồi thêm `ExportSection` vào `DataPage`: bộ chọn Tháng/Năm, nút **Tải CSV** (kỳ đã chọn) và nút **Xuất PDF / In** (điều hướng sang Báo cáo kèm cờ in).

**Files:**
- Create: `src/features/settings/exportFilename.ts`
- Create: `src/features/settings/exportFilename.test.ts`
- Modify: `src/features/settings/DataPage.tsx` (thêm component `ExportSection` và chèn vào chỗ "Khối A")

**Interfaces:**
- Produces: `exportCsvFilename(period: 'month' | 'year', monthKey: MonthKey, year: number): string`.
- Produces: URL in báo cáo mà Task 3 phải đọc — chế độ tháng: `/reports?period=month&ym=YYYY-MM&print=1`; chế độ năm: `/reports?period=year&year=YYYY&print=1`.
- Consumes: `buildTransactionsCsv` từ `../reports/csv`; `downloadTextFile` từ `../../lib/download`; hook `useMonthTransactions`, `useRangeTransactions`, `useAccounts`, `useCategories`, `useProfile`, `useRates` từ `../../hooks/queries`; hàm ngày từ `../../lib/dates`; `CurrencyCode` từ `../../lib/money`.

- [ ] **Step 1: Viết test tên file (fail trước)**

Tạo `src/features/settings/exportFilename.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { exportCsvFilename } from './exportFilename'

describe('exportCsvFilename', () => {
  it('chế độ tháng: đệm 0 cho tháng', () => {
    expect(exportCsvFilename('month', { year: 2026, month: 7 }, 2026)).toBe('so-chi-tieu-2026-07.csv')
  })
  it('chế độ tháng: tháng 2 chữ số', () => {
    expect(exportCsvFilename('month', { year: 2026, month: 12 }, 2026)).toBe('so-chi-tieu-2026-12.csv')
  })
  it('chế độ năm: chỉ có năm', () => {
    expect(exportCsvFilename('year', { year: 2026, month: 7 }, 2025)).toBe('so-chi-tieu-2025.csv')
  })
})
```

- [ ] **Step 2: Chạy test để thấy fail**

Run: `npm run test -- exportFilename`
Expected: FAIL (không tìm thấy module `./exportFilename`).

- [ ] **Step 3: Viết `src/features/settings/exportFilename.ts`**

```ts
import type { MonthKey } from '../../lib/dates'

/** Tên file CSV theo kỳ, giữ quy ước cũ: so-chi-tieu-2026-07.csv | so-chi-tieu-2026.csv */
export function exportCsvFilename(
  period: 'month' | 'year',
  monthKey: MonthKey,
  year: number,
): string {
  const suffix =
    period === 'year'
      ? String(year)
      : `${monthKey.year}-${String(monthKey.month).padStart(2, '0')}`
  return `so-chi-tieu-${suffix}.csv`
}
```

- [ ] **Step 4: Chạy lại test để thấy pass**

Run: `npm run test -- exportFilename`
Expected: PASS (3 test).

- [ ] **Step 5: Thêm `ExportSection` vào `DataPage.tsx`**

5a. Cập nhật phần import ở đầu file `src/features/settings/DataPage.tsx`:

```tsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, FileUp, Printer } from 'lucide-react'
import { BackupSection } from './BackupSection'
import { exportCsvFilename } from './exportFilename'
import { buildTransactionsCsv } from '../reports/csv'
import { downloadTextFile } from '../../lib/download'
import {
  useAccounts,
  useCategories,
  useMonthTransactions,
  useProfile,
  useRangeTransactions,
} from '../../hooks/queries'
import {
  addMonths,
  formatMonthLabel,
  formatYearLabel,
  getYearRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
```

5b. Thêm component `ExportSection` (đặt phía trên hàm `DataPage` trong cùng file):

```tsx
function ExportSection() {
  const navigate = useNavigate()
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  const [period, setPeriod] = useState<'month' | 'year'>('month')
  const today = monthKeyForDate(toISODate(new Date()), monthStartDay)
  const [monthKey, setMonthKey] = useState<MonthKey>(today)
  const [year, setYear] = useState<number>(today.year)

  const monthQ = useMonthTransactions(monthKey)
  const yearQ = useRangeTransactions(getYearRange(year, monthStartDay), !!profile && period === 'year')
  const txs = period === 'year' ? (yearQ.data ?? []) : (monthQ.data ?? [])

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? profile?.base_currency ?? 'JPY'

  function handleCsv() {
    const sorted = [...txs].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
    const csv = buildTransactionsCsv(sorted, {
      categoryName: (id) => categories.find((c) => c.id === id)?.name ?? '',
      accountName: (id) => accounts.find((a) => a.id === id)?.name ?? '',
      currencyOf,
    })
    downloadTextFile(exportCsvFilename(period, monthKey, year), csv, 'text/csv')
  }

  function handlePdf() {
    const params =
      period === 'year'
        ? `period=year&year=${year}&print=1`
        : `period=month&ym=${monthKey.year}-${String(monthKey.month).padStart(2, '0')}&print=1`
    navigate(`/reports?${params}`)
  }

  const label = period === 'month' ? formatMonthLabel(monthKey) : formatYearLabel(year)

  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-900">
      <h2 className="px-3 pt-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
        Xuất báo cáo &amp; giao dịch
      </h2>
      <div className="p-3">
        {/* Nút gạt Tháng | Năm */}
        <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-sm font-medium">
          <button
            type="button"
            onClick={() => setPeriod('month')}
            className={`flex-1 rounded-md py-1.5 ${period === 'month' ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Tháng
          </button>
          <button
            type="button"
            onClick={() => setPeriod('year')}
            className={`flex-1 rounded-md py-1.5 ${period === 'year' ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Năm
          </button>
        </div>

        {/* Điều hướng kỳ */}
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() =>
              period === 'month' ? setMonthKey((k) => addMonths(k, -1)) : setYear((y) => y - 1)
            }
            className="rounded-lg border border-gray-300 px-3 py-1.5 dark:border-gray-700"
            aria-label={period === 'month' ? 'Tháng trước' : 'Năm trước'}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{label}</span>
          <button
            type="button"
            onClick={() =>
              period === 'month' ? setMonthKey((k) => addMonths(k, 1)) : setYear((y) => y + 1)
            }
            className="rounded-lg border border-gray-300 px-3 py-1.5 dark:border-gray-700"
            aria-label={period === 'month' ? 'Tháng sau' : 'Năm sau'}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Hai nút xuất */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCsv}
            disabled={txs.length === 0}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <Download className="h-4 w-4" />
            Tải CSV
          </button>
          <button
            type="button"
            onClick={handlePdf}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <Printer className="h-4 w-4" />
            Xuất PDF / In
          </button>
        </div>
      </div>
    </section>
  )
}
```

5c. Trong hàm `DataPage`, thay dòng chú thích `{/* Khối A (Xuất CSV/PDF) sẽ thêm ở Task 2 */}` bằng `<ExportSection />`.

- [ ] **Step 6: Kiểm tra lint + test + build**

Run: `npm run lint && npm run test && npm run build`
Expected: tất cả xanh.

- [ ] **Step 7: Kiểm tra trên trình duyệt**

Ở `/settings/data`: đổi Tháng/Năm và bấm `‹ ›` thấy nhãn kỳ đổi đúng; **Tải CSV** ở kỳ có dữ liệu tải đúng file `so-chi-tieu-...csv`; nút Tải CSV bị mờ (disabled) khi kỳ rỗng. Bấm **Xuất PDF / In** → URL chuyển sang `/reports?...&print=1` (Task 3 sẽ làm phần tự in).

- [ ] **Step 8: Commit**

```bash
git add src/features/settings/exportFilename.ts src/features/settings/exportFilename.test.ts src/features/settings/DataPage.tsx
git commit -m "feat(du-lieu): them khoi xuat CSV/PDF theo ky (thang/nam) vao trang Du lieu"
```

---

### Task 3: Trang Báo cáo — bỏ toolbar xuất + đọc tham số kỳ + tự in

Dọn 2 nút xuất khỏi `ReportsPage`; cho trang đọc `period`/`ym`/`year`/`print` từ URL để khởi tạo kỳ và tự bật hộp thoại in.

**Files:**
- Modify: `src/features/reports/ReportsPage.tsx`

**Interfaces:**
- Consumes (từ Task 2): URL `/reports?period=month&ym=YYYY-MM&print=1` và `/reports?period=year&year=YYYY&print=1`.

- [ ] **Step 1: Bỏ import & hàm chỉ phục vụ toolbar xuất**

Trong `src/features/reports/ReportsPage.tsx`:

1a. Dòng 3 — bỏ `Download, Printer` (chỉ giữ các icon còn dùng):

```tsx
import { ChevronLeft, ChevronRight } from 'lucide-react'
```

1b. Bỏ 2 import chỉ dùng cho xuất CSV (dòng 4–5):

```tsx
// XÓA: import { downloadTextFile } from '../../lib/download'
// XÓA: import { buildTransactionsCsv } from './csv'
```

1c. Đổi dòng 2 để lấy thêm `useSearchParams` (đã import) — cần thêm khả năng ghi lại param:

```tsx
import { useSearchParams } from 'react-router-dom'
```

(giữ nguyên; sẽ dùng cả getter và setter ở bước sau)

1d. XÓA nguyên hàm `handleExportCsv` (dòng 125–138).

1e. XÓA nguyên khối JSX toolbar xuất `{/* Xuất dữ liệu kỳ đang xem */}` (dòng 196–215, gồm 2 nút "Xuất PDF / In" và "Xuất CSV").

- [ ] **Step 2: Đọc tham số URL để khởi tạo kỳ + cờ in**

2a. Thêm import cần cho hiệu ứng in ở đầu file:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
```

2b. Đổi khai báo `useSearchParams` để lấy cả setter (dòng ~34):

```tsx
const [searchParams, setSearchParams] = useSearchParams()
```

2c. Thêm hàm phụ (đặt trên `export function ReportsPage`):

```tsx
/** Đọc 'YYYY-MM' thành MonthKey; null nếu không hợp lệ. */
function parseYm(s: string | null): MonthKey | null {
  if (!s) return null
  const [y, m] = s.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return null
  return { year: y, month: m }
}
```

2d. Khởi tạo `period` từ param (đổi dòng 35):

```tsx
const [period, setPeriod] = useState<'month' | 'year'>(
  searchParams.get('period') === 'year' ? 'year' : 'month',
)
```

2e. Khởi tạo `monthKey` từ param `ym` (đổi dòng 54):

```tsx
const [monthKey, setMonthKey] = useState<MonthKey | null>(() => parseYm(searchParams.get('ym')))
```

2f. Khởi tạo `year` từ param `year` (đổi dòng 87):

```tsx
const [year, setYear] = useState<number | null>(() => {
  const y = Number(searchParams.get('year'))
  return Number.isFinite(y) && y > 0 ? y : null
})
```

- [ ] **Step 3: Thêm hiệu ứng tự in một lần**

Đặt sau khi đã có `monthTxs`, `rangeTxs`, `yearTxs` và các biến `activeMonthKey`/`activeYear` (ví dụ ngay trước `return (`). Lưu ý `useMonthTransactions` trả về `{ range, ...query }` nên có `isFetched`; đổi dòng lấy `monthTxs` (dòng 56) để lấy thêm cờ đã tải:

```tsx
const { data: monthTxs = [], isFetched: monthFetched } = useMonthTransactions(activeMonthKey)
```

Và thêm hiệu ứng in:

```tsx
const printedRef = useRef(false)
const wantPrint = searchParams.get('print') === '1'
const printDataReady = period === 'year' ? yearTxs.length >= 0 && !!profile : monthFetched
useEffect(() => {
  if (!wantPrint || printedRef.current || !printDataReady) return
  printedRef.current = true
  // Chờ biểu đồ (Recharts) vẽ xong rồi mới in
  const t = setTimeout(() => {
    window.print()
    // Gỡ cờ print khỏi URL để không in lại khi điều hướng nội bộ
    const next = new URLSearchParams(searchParams)
    next.delete('print')
    setSearchParams(next, { replace: true })
  }, 700)
  return () => clearTimeout(t)
}, [wantPrint, printDataReady, period, searchParams, setSearchParams])
```

(Ghi chú: `yearTxs` được lấy từ `useRangeTransactions(yearRange, !!profile && period === 'year')` sẵn có ở dòng 93 — giữ nguyên. Điều kiện `printDataReady` cho chế độ năm chỉ cần `profile` đã có; nếu cần chắc hơn, có thể đổi dòng 93 để lấy `isFetched` tương tự như month.)

- [ ] **Step 4: Kiểm tra lint + test + build**

Run: `npm run lint && npm run test && npm run build`
Expected: tất cả xanh; không còn biến/nhập không dùng (`Download`, `Printer`, `downloadTextFile`, `buildTransactionsCsv`, `handleExportCsv`).

- [ ] **Step 5: Kiểm tra trên trình duyệt (quan trọng — phần in)**

1. `/reports` không còn 2 nút xuất; điều hướng tháng/năm và các tab vẫn chạy như cũ.
2. Từ `/settings/data`, chọn một **tháng có dữ liệu**, bấm **Xuất PDF / In** → chuyển sang `/reports`, hiển thị đúng tháng đó, tự bật hộp thoại in; nội dung in có tiêu đề "Báo cáo Tháng …" và biểu đồ; thanh điều hướng bị ẩn khi in.
3. Sau khi đóng hộp thoại in, tham số `print` biến mất khỏi URL; bấm chuyển tháng không bật in lại.
4. Lặp lại với chế độ **Năm**.
5. Nếu biểu đồ chưa kịp vẽ khi in (do độ trễ), tăng `700` lên (ví dụ `1000`) rồi thử lại; ghi lại giá trị cuối cùng.

- [ ] **Step 6: Commit**

```bash
git add src/features/reports/ReportsPage.tsx
git commit -m "feat(bao-cao): bo toolbar xuat; doc tham so ky + tu in tu trang Du lieu"
```

---

## Self-Review

**Spec coverage**
- Trang mới `/settings/data` 3 khối → Task 1 (khối Sao lưu + Nhập CSV) + Task 2 (khối Xuất). ✔
- Cài đặt chỉ còn 1 mục → Task 1 Step 3. ✔
- Báo cáo bỏ 2 nút xuất → Task 3 Step 1. ✔
- Xuất PDF mở báo cáo đúng kỳ + tự in → Task 2 (nav) + Task 3 (đọc param + in). ✔
- Nhập CSV mở trang riêng, back về `/settings/data` → Task 1 Step 1 (dòng link) + Step 4. ✔
- Sao lưu/khôi phục tái dùng `BackupSection` → Task 1 Step 1. ✔
- Tên file CSV giữ quy ước → Task 2 helper + test. ✔

**Placeholder scan:** Không còn TBD/TODO; mọi bước có code hoặc lệnh cụ thể. ✔

**Type consistency:** `exportCsvFilename(period, monthKey, year)` khai báo ở Task 2 khớp cách gọi trong `ExportSection`. URL param (`period`/`ym`/`year`/`print`) do Task 2 tạo khớp phần đọc ở Task 3. `MonthKey` dùng nhất quán từ `../../lib/dates`. `useMonthTransactions` trả `{ range, ...query }` → dùng `isFetched` hợp lệ. ✔
