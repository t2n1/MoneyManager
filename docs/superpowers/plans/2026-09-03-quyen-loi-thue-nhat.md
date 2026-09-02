# Quyền lợi — thuế & ưu đãi Nhật — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một màn `/quyen-loi` trả lời "tới 31/12 năm nay tôi còn để quên đồng nào" bằng cách ghép số đã có trong sổ (gửi tiền về VN, phiếu lương, sổ lệnh NISA) với luật thuế Nhật đã kiểm nguồn — bốn khoản: khấu trừ người phụ thuộc ở nước ngoài, đòi lại 5 năm cũ, trần ふるさと納税, phần NISA chưa dùng.

**Architecture:** Toán thuần nằm trong `src/features/quyen-loi/*.ts` (không React, không `new Date()`), luật là hằng số gắn năm + nguồn trong `rules/`. Một hàm gom `tinhQuyenLoi()` chạy ở **hai nơi**: hook `useQuyenLoi` trên trình duyệt và `loadInput.ts` của edge function push (qua bundle). Dữ liệu mới: bảng `relatives`, cột `transactions.remit_recipient_id`, cột `profiles.fuyo_claimed_years`. Trục thời gian là **năm dương lịch**, có tên riêng `calendarYearRange`.

**Tech Stack:** TypeScript, React 19, TanStack Query, Supabase (PostgREST), Vitest, Tailwind, esbuild (bundle cho Deno).

**Spec:** [docs/superpowers/specs/2026-09-03-quyen-loi-thue-nhat-design.md](../specs/2026-09-03-quyen-loi-thue-nhat-design.md)

## Global Constraints

- **Đổi schema là đổi hai file.** Migration và [src/types/database.types.ts](../../../src/types/database.types.ts) (viết tay) **cùng một commit**.
- **Hai bản `Repo` cùng thoả interface.** Thêm method ở `supabaseRepo` mà quên `demoRepo` là lỗi biên dịch — sửa cả hai trong cùng task.
- **Mỗi `mutationFn` có invalidation ngay cạnh** trong `src/hooks/queries.ts`. Feature không gọi `repo` trực tiếp.
- **Toán thuần ngoài React**: file `.ts` không JSX, không `new Date()`, không `monthStartDay` — ngày hôm nay đến từ `todayISO`.
- **Năm thuế = năm dương lịch** theo `occurred_on`: dùng `calendarYearRange(year)` / `calendarYearOf(iso)`, KHÔNG `getMonthRange` với `month_start_day`.
- **Tiền là số nguyên minor units** (yên). Thiếu tỷ giá → loại + bật cờ, không quy 1:1.
- **Mọi số thuế tiết kiệm là ƯỚC** → `<EstimateMark reason=…>` cạnh `<Money>`.
- **Giao diện**: `<PageHeader>`, `<SectionTitle>`, `<Select>`, `<ActionButton>`, `<Card>`, `<Money>`, `<Num>`, `<EmptyState>`. Không `<h1>`, không `<select>`, không giá trị Tailwind tuỳ ý. `tests/designSystem.test.ts` là ban cứng.
- **Bộ luật thông báo** (`rules/*.ts`) phải qua `purity.test.ts`: không import giá trị từ file có React/window/localStorage. Luật mới chỉ đọc `input.benefits` đã tính sẵn.
- **Sửa luật trong `src/` mà edge function dùng** → `npm run bundle:rules` và commit `supabase/functions/push-notify/_rules.js` (Task 12). `tests/pushBundle.test.ts` đỏ nếu quên.
- **EOL lệch trong repo**: `src/data/*`, `src/hooks/queries.ts`, `src/lib/dates.ts`, `src/types/database.types.ts`, `src/App.tsx`, `src/features/notifications/types.ts` là **CRLF**; `src/features/**/*.tsx` phần lớn là LF. Dùng Edit tool (giữ EOL), không chạy script thay chuỗi, không prettier.
- Commit message **không dấu**, mỗi task một commit. Sau mỗi task: `npx tsc -b --noEmit`, `npx vitest run <file>`; cuối mỗi nhóm task: `npm test`, `npm run lint`.
- Trước khi sửa một symbol có sẵn: `impact({target, direction: "upstream"})` (CLAUDE.md). Trước commit: `detect_changes()`.

## Blast radius (đã chạy `impact` lúc lập kế hoạch; index chậm 88 commit → cận dưới)

| Symbol sửa | Rủi ro | Ai gọi | Ghi chú |
|---|---|---|---|
| `saveRemit` | LOW | `handleRole` (EntryPage) | thêm một trường vào input, không đổi hành vi |
| `RemitFields` | CRITICAL (theo index) | `TransactionForm` → App/Bulletin/Ledger… | CRITICAL vì nằm dưới form nhập dùng ở mọi trang; thay đổi chỉ THÊM một `<Select>` và một prop tuỳ chọn, các prop cũ giữ nguyên |
| `useNotifications` | CRITICAL | AppTopBar, BulletinPage, LedgerPage, AppLayout | thêm một query + một trường `benefits`; `inputsReady` thêm một điều kiện |
| `buildNotifications` | LOW | `useNotifications`, `_rules.js` | thêm một nhóm luật vào mảng |
| `shelterUsage` | LOW | `AccountDetailPage` | KHÔNG sửa, chỉ gọi thêm |
| `BulletinPage` | LOW | App (lazy) | chèn một panel |

Người thi công phải chạy lại `impact` cho đúng symbol trước khi sửa, vì index cũ.

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/lib/dates.ts` | **Sửa.** `calendarYearRange`, `calendarYearOf`. |
| `src/features/quyen-loi/rules/luat.ts` | **Tạo.** Kiểu `LuatNam` + `luatChoNam(year)`. |
| `src/features/quyen-loi/rules/2026.ts`, `rules/2022.ts` | **Tạo.** Hằng số luật + nguồn. |
| `src/features/quyen-loi/rules/luat.test.ts` | **Tạo.** Đối chiếu số trong nguồn. |
| `src/features/quyen-loi/ketLuan.ts` | **Tạo.** Kiểu `KetLuan` chung. |
| `src/features/quyen-loi/marginalRate.ts` (+test) | **Tạo.** Đảo bảng 速算表 → thuế suất biên. |
| `src/features/quyen-loi/fuyo.ts` (+test) | **Tạo.** Khoản ①. |
| `src/features/quyen-loi/refund.ts` (+test) | **Tạo.** Khoản ②. |
| `src/features/quyen-loi/furusato.ts` (+test) | **Tạo.** Khoản ③. |
| `src/features/quyen-loi/shelterYearEnd.ts` (+test) | **Tạo.** Khoản ④ (gọi `shelterUsage`). |
| `src/features/quyen-loi/quyenLoi.ts` (+test) | **Tạo.** `tinhQuyenLoi()` gom bốn khoản + bất biến tổng gửi. |
| `supabase/migrations/0056_relatives_remit_recipient.sql` | **Tạo.** Bảng `relatives`, cột `remit_recipient_id`, cột `fuyo_claimed_years`. |
| `src/types/database.types.ts` | **Sửa.** `RelativeRow`, `Relationship`, bảng `relatives`, cột mới trên `transactions`/`profiles`. |
| `src/data/repo.ts` | **Sửa.** `NewRelative`, `RelativePatch`, `BenefitTxFilter`, 4 method; `NewTransaction.remit_recipient_id`; `ProfilePatch.fuyo_claimed_years`; `BackupData.relatives`. |
| `src/data/exportTables.ts` | **Sửa.** Thêm `'relatives'`. |
| `src/data/supabaseRepo.ts`, `src/data/demoRepo.ts` | **Sửa.** Cài 4 method; export/import sao lưu; seed demo. |
| `src/hooks/queries.ts` | **Sửa.** `useRelatives`, `useCreateRelative`, `useUpdateRelative`, `useBenefitTransactions`. |
| `src/features/quyen-loi/useQuyenLoi.ts` | **Tạo.** Hook gom dữ liệu → `tinhQuyenLoi`. |
| `src/features/transactions/entryRoles.ts`, `roleFields.tsx`, `roleSave.ts`, `TransactionForm.tsx` | **Sửa.** Ô "Gửi cho". |
| `src/features/quyen-loi/NguoiThanSheet.tsx`, `GanNguoiNhanSheet.tsx`, `QuyenLoiPage.tsx` | **Tạo.** Giao diện. |
| `src/features/bulletin/QuyenLoiPanel.tsx`, `BulletinPage.tsx` | **Tạo / Sửa.** Khung trên Bản tin. |
| `src/App.tsx`, `src/components/navItems.ts` | **Sửa.** Route + tiêu đề. |
| `src/features/notifications/types.ts`, `rules.ts`, `rules/benefitRules.ts` (+test), `state.ts`, `useNotifications.ts`, `serverBundle.ts` | **Sửa / Tạo.** 4 loại thông báo. |
| `supabase/functions/push-notify/loadInput.ts`, `_rules.js` | **Sửa.** Đầu vào phía server + bundle. |

---

### Task 1: Trục năm dương lịch + hằng số luật + thuế suất biên

**Files:**
- Modify: `src/lib/dates.ts` (sau `getYearRange`, dòng ~172)
- Create: `src/features/quyen-loi/rules/luat.ts`, `rules/2026.ts`, `rules/2022.ts`, `rules/luat.test.ts`
- Create: `src/features/quyen-loi/marginalRate.ts`, `marginalRate.test.ts`

**Interfaces:**
- Produces: `calendarYearRange(year: number): MonthRange`, `calendarYearOf(iso: string): number`
- Produces: `LuatNam`, `LUAT_2026`, `LUAT_2022`, `luatChoNam(year): LuatNam`
- Produces: `suatBienTuThue(thueNam: number, luat: LuatNam): number | null`, `thueTheoBac(thuNhapChiuThue: number, luat: LuatNam): number`, `tienTietKiem(khauTruShotoku, khauTruJumin, suatBien, luat): number`

- [ ] **Step 1: Viết test cho hai hàm ngày** — thêm vào cuối `src/lib/dates.test.ts` (file đã có; nếu không có `describe` nào tên này thì thêm mới):

```ts
describe('calendarYearRange / calendarYearOf', () => {
  it('năm dương lịch: 1/1 tới 1/1 năm sau (end loại trừ), bất kể month_start_day', () => {
    expect(calendarYearRange(2026)).toEqual({ start: '2026-01-01', end: '2027-01-01' })
  })
  it('calendarYearOf đọc 4 ký tự đầu', () => {
    expect(calendarYearOf('2025-12-28')).toBe(2025)
  })
})
```

Thêm `calendarYearRange, calendarYearOf` vào import của file test.

- [ ] **Step 2: Chạy test thấy đỏ** — `npx vitest run src/lib/dates.test.ts` → FAIL "calendarYearRange is not a function".

- [ ] **Step 3: Cài hai hàm** — dán sau `getYearRange` trong `src/lib/dates.ts` (file CRLF, dùng Edit):

```ts
/**
 * Năm DƯƠNG LỊCH 1/1–31/12 — trục thời gian THỨ HAI của app, dành cho thuế Nhật (所得税,
 * 住民税, ふるさと納税, NISA đều chốt theo lịch, không theo ngày lương).
 *
 * Tồn tại để CÓ TÊN GỌI: đọc code thấy `calendarYearRange` là biết chỗ đó cố ý không theo
 * `month_start_day`, không phải ai quên. Dùng `getMonthRange`/`getYearRange` với
 * monthStartDay của người dùng ở đây là báo "đã đủ 38万" khi một lần gửi ngày 28/12 bị
 * đẩy sang "tháng 1" của app.
 */
export function calendarYearRange(year: number): MonthRange {
  return getYearRange(year, 1)
}

/** Năm dương lịch của một ngày ISO — cặp với `calendarYearRange`. */
export function calendarYearOf(iso: string): number {
  return Number(iso.slice(0, 4))
}
```

- [ ] **Step 4: Chạy lại** — `npx vitest run src/lib/dates.test.ts` → PASS.

- [ ] **Step 5: Viết test luật** — `src/features/quyen-loi/rules/luat.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { LUAT_2026 } from './2026'
import { LUAT_2022 } from './2022'
import { luatChoNam } from './luat'

describe('LUAT_2026 — số đúng như nguồn NTA (tra 2026-09-02)', () => {
  it('扶養控除: ngưỡng 38万 cho 30–69; mức 38万/48万 (所得税), 33万/38万 (住民税)', () => {
    expect(LUAT_2026.fuyo.nguong30_69).toBe(380_000)
    expect(LUAT_2026.fuyo.khauTruShotoku).toEqual({ thuong: 380_000, laoNhan: 480_000 })
    expect(LUAT_2026.fuyo.khauTruJumin).toEqual({ thuong: 330_000, laoNhan: 380_000 })
    expect(LUAT_2026.fuyo.thuNhapToiDa).toBe(580_000)
  })
  it('住民税: 均等割 5.000 (gồm 森林環境税 1.000), 所得割 10%', () => {
    expect(LUAT_2026.jumin).toEqual({ kinhToDan: 5_000, suatShotokuWari: 0.1 })
  })
  it('速算表 7 bậc (NTA No.2260) + 復興特別所得税 2,1%', () => {
    expect(LUAT_2026.phucHung).toBe(1.021)
    expect(LUAT_2026.shotokuBac).toEqual([
      { toiDa: 1_949_000, suat: 0.05, tru: 0 },
      { toiDa: 3_299_000, suat: 0.1, tru: 97_500 },
      { toiDa: 6_949_000, suat: 0.2, tru: 427_500 },
      { toiDa: 8_999_000, suat: 0.23, tru: 636_000 },
      { toiDa: 17_999_000, suat: 0.33, tru: 1_536_000 },
      { toiDa: 39_999_000, suat: 0.4, tru: 2_796_000 },
      { toiDa: Infinity, suat: 0.45, tru: 4_796_000 },
    ])
  })
  it('ふるさと納税: tự chịu 2.000, 20% 所得割; NISA 120万/240万/1.800万', () => {
    expect(LUAT_2026.furusato).toEqual({ tuChiu: 2_000, tyLeShotokuWari: 0.2 })
    expect(LUAT_2026.nisa).toEqual({ tsumitate: 1_200_000, growth: 2_400_000, tongDoi: 18_000_000 })
  })
  it('mỗi bộ luật có ít nhất một URL nguồn', () => {
    expect(LUAT_2026.nguon.length).toBeGreaterThan(0)
    expect(LUAT_2022.nguon.length).toBeGreaterThan(0)
  })
})

describe('luatChoNam', () => {
  it('≤ 2022 không có ngưỡng 38万 (trước 令和5年分)', () => {
    expect(luatChoNam(2022).fuyo.nguong30_69).toBeNull()
    expect(luatChoNam(2021)).toBe(LUAT_2022)
  })
  it('2023 trở đi dùng bộ 2026', () => {
    expect(luatChoNam(2023)).toBe(LUAT_2026)
    expect(luatChoNam(2026)).toBe(LUAT_2026)
    expect(luatChoNam(2030)).toBe(LUAT_2026) // chưa có file năm đó → bộ gần nhất
  })
})
```

- [ ] **Step 6: Chạy thấy đỏ** — `npx vitest run src/features/quyen-loi/rules/luat.test.ts` → FAIL (module không tồn tại).

- [ ] **Step 7: Tạo `rules/luat.ts`**:

```ts
// Luật thuế Nhật mà màn Quyền lợi dựa vào — MỘT BỘ MỘT NĂM, mỗi hằng số kèm nguồn.
//
// Vì sao tách theo năm chứ không sửa đè: luật đổi (ngưỡng 38万 chỉ có từ 令和5年分, thu
// nhập tối đa của người thân 48万→58万 từ 2025), mà khoản ② soát lùi 5 năm. Sửa đè là
// soát năm 2021 bằng luật 2026 và bảo người dùng "chưa đủ" một khoản họ đã đủ.
//
// THUẦN: không React, không Date. Bộ luật thông báo và edge function cùng đọc file này.
import { LUAT_2022 } from './2022'
import { LUAT_2026 } from './2026'

export interface BacThue {
  /** 課税所得 tối đa của bậc (yên). Bậc cuối = Infinity. */
  toiDa: number
  suat: number
  /** Số trừ nhanh của 速算表 (yên). */
  tru: number
}

export interface LuatNam {
  /** Năm ĐẦU bộ luật này áp dụng. */
  nam: number
  /** URL đã tra, để màn hình in ra được "theo …". */
  nguon: string[]
  fuyo: {
    /** Người thân 30–69 phải nhận ≥ ngần này trong năm; null = không có ngưỡng (trước 2023). */
    nguong30_69: number | null
    /** Khấu trừ 所得税: 一般 / 老人 (70+). */
    khauTruShotoku: { thuong: number; laoNhan: number }
    /** Khấu trừ 住民税: 一般 / 老人. */
    khauTruJumin: { thuong: number; laoNhan: number }
    /** 合計所得金額 tối đa của người thân — app KHÔNG kiểm, chỉ in ra hỏi. */
    thuNhapToiDa: number
  }
  jumin: { kinhToDan: number; suatShotokuWari: number }
  /** 復興特別所得税: nhân vào 所得税. */
  phucHung: number
  shotokuBac: BacThue[]
  furusato: { tuChiu: number; tyLeShotokuWari: number }
  nisa: { tsumitate: number; growth: number; tongDoi: number }
}

/** Bộ luật MỚI NHẤT trước hoặc bằng `year`. Xếp tăng theo `nam`. */
const CAC_BO: LuatNam[] = [LUAT_2022, LUAT_2026]

export function luatChoNam(year: number): LuatNam {
  let chon = CAC_BO[0]
  for (const bo of CAC_BO) if (bo.nam <= year) chon = bo
  return chon
}
```

- [ ] **Step 8: Tạo `rules/2026.ts`**:

```ts
// Luật áp dụng cho năm thuế 2023 trở đi (令和5年分〜). Đặt tên 2026 là năm TRA, để năm sau
// ai mở ra biết số đã được kiểm lúc nào. Từng con số có test đối chiếu ở luat.test.ts.
import type { LuatNam } from './luat'

export const LUAT_2026: LuatNam = {
  nam: 2023,
  nguon: [
    // 扶養控除 — mức, điều kiện 国外居住親族 30–69 (38万), thu nhập ≤ 58万 từ 2025
    'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1180.htm',
    // Giấy tờ theo nhóm tuổi (16–29 / 30–69 / 70+)
    'https://www.city.ota.tokyo.jp/seikatsu/zeikin/kazei/kokugaifuyou.html',
    // 還付申告 5 năm
    'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2030.htm',
    // ふるさと納税 công thức trần
    'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1155.htm',
    // 均等割 5.000 gồm 森林環境税 từ 令和6年度
    'https://www.city.sapporo.jp/citytax/syurui/shiminzei/kojin_2024zeikai.html',
    // 速算表 所得税
    'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm',
    // NISA
    'https://www.fsa.go.jp/policy/nisa2/know/index.html',
  ],
  fuyo: {
    nguong30_69: 380_000,
    khauTruShotoku: { thuong: 380_000, laoNhan: 480_000 },
    khauTruJumin: { thuong: 330_000, laoNhan: 380_000 },
    thuNhapToiDa: 580_000,
  },
  jumin: { kinhToDan: 5_000, suatShotokuWari: 0.1 },
  phucHung: 1.021,
  shotokuBac: [
    { toiDa: 1_949_000, suat: 0.05, tru: 0 },
    { toiDa: 3_299_000, suat: 0.1, tru: 97_500 },
    { toiDa: 6_949_000, suat: 0.2, tru: 427_500 },
    { toiDa: 8_999_000, suat: 0.23, tru: 636_000 },
    { toiDa: 17_999_000, suat: 0.33, tru: 1_536_000 },
    { toiDa: 39_999_000, suat: 0.4, tru: 2_796_000 },
    { toiDa: Infinity, suat: 0.45, tru: 4_796_000 },
  ],
  furusato: { tuChiu: 2_000, tyLeShotokuWari: 0.2 },
  nisa: { tsumitate: 1_200_000, growth: 2_400_000, tongDoi: 18_000_000 },
}
```

- [ ] **Step 9: Tạo `rules/2022.ts`** — chỉ khác ở `nguong30_69: null` và `thuNhapToiDa: 480_000`:

```ts
// Luật cho năm thuế ≤ 2022 (trước 令和5年分): 国外居住親族 CHƯA có ngưỡng 38万 cho nhóm
// 30–69, chỉ cần 親族関係書類 + 送金関係書類. Thu nhập tối đa của người thân còn là 48万.
// Khoản ② (đòi lại 5 năm cũ) soát năm 2021–2022 bằng bộ này.
import { LUAT_2026 } from './2026'
import type { LuatNam } from './luat'

export const LUAT_2022: LuatNam = {
  ...LUAT_2026,
  nam: 0,
  nguon: [
    // Ghi rõ ngưỡng 38万 chỉ từ 令和5年分
    'https://www.city.funabashi.lg.jp/kurashi/zei/001/03/p048568.html',
  ],
  fuyo: {
    ...LUAT_2026.fuyo,
    nguong30_69: null,
    thuNhapToiDa: 480_000,
  },
}
```

Lưu ý import vòng `luat.ts ↔ 2026.ts/2022.ts`: `2026.ts` chỉ `import type`, `2022.ts` import giá trị `LUAT_2026` từ `2026.ts` (không qua `luat.ts`) — không có vòng giá trị.

- [ ] **Step 10: Chạy** — `npx vitest run src/features/quyen-loi/rules/luat.test.ts` → PASS.

- [ ] **Step 11: Test thuế suất biên** — `src/features/quyen-loi/marginalRate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { LUAT_2026 } from './rules/2026'
import { suatBienTuThue, thueTheoBac, tienTietKiem } from './marginalRate'

describe('thueTheoBac — 速算表', () => {
  it('bậc 5%: 1.000.000 → 50.000', () => expect(thueTheoBac(1_000_000, LUAT_2026)).toBe(50_000))
  it('bậc 10%: 3.000.000 → 300.000 − 97.500', () => expect(thueTheoBac(3_000_000, LUAT_2026)).toBe(202_500))
  it('bậc 20%: 5.000.000 → 572.500', () => expect(thueTheoBac(5_000_000, LUAT_2026)).toBe(572_500))
  it('≤ 0 → 0', () => expect(thueTheoBac(0, LUAT_2026)).toBe(0))
})

describe('suatBienTuThue — đảo bảng từ Σ所得税 cả năm (đã gồm 2,1%)', () => {
  it('thuế 50.000 × 1,021 → bậc 5%', () => {
    expect(suatBienTuThue(Math.round(50_000 * 1.021), LUAT_2026)).toBe(0.05)
  })
  it('thuế của 課税所得 5.000.000 → bậc 20%', () => {
    expect(suatBienTuThue(Math.round(572_500 * 1.021), LUAT_2026)).toBe(0.2)
  })
  it('đúng biên: thuế tại 1.949.000 vẫn là 5%, tại 1.950.000 là 10%', () => {
    expect(suatBienTuThue(Math.round(thueTheoBac(1_949_000, LUAT_2026) * 1.021), LUAT_2026)).toBe(0.05)
    expect(suatBienTuThue(Math.round(thueTheoBac(1_950_000, LUAT_2026) * 1.021), LUAT_2026)).toBe(0.1)
  })
  it('không nộp thuế (≤ 0) → null, không đoán', () => {
    expect(suatBienTuThue(0, LUAT_2026)).toBeNull()
    expect(suatBienTuThue(-3_000, LUAT_2026)).toBeNull()
  })
})

describe('tienTietKiem', () => {
  it('38万 所得税 ở bậc 10% + 33万 住民税 10%', () => {
    // 380.000 × 0,10 × 1,021 = 38.798 ; 330.000 × 0,10 = 33.000 → 71.798
    expect(tienTietKiem(380_000, 330_000, 0.1, LUAT_2026)).toBe(71_798)
  })
})
```

- [ ] **Step 12: Chạy thấy đỏ** — `npx vitest run src/features/quyen-loi/marginalRate.test.ts`.

- [ ] **Step 13: Tạo `marginalRate.ts`**:

```ts
// Thuế suất biên 所得税 — suy NGƯỢC từ tổng thuế đã nộp trong năm, không dựng từ lương gộp.
//
// Vì sao ngược: dựng từ lương gộp cần 給与所得控除, 社会保険料, 基礎控除 và mọi 控除 riêng của
// người dùng — chính những thứ đã làm kikinBenefit.ts dựng từ luật lệch ba lần. Tổng 所得税
// trên 12 phiếu lương (kể cả 過不足税額 của 年末調整) đã là thuế năm THẬT, và bảng 速算表 đảo
// được: mỗi bậc là một đoạn tuyến tính, tìm bậc nào cho nghiệm nằm trong đoạn của nó.
//
// Kết quả vẫn là ƯỚC (màn hình gắn ≈): sai khi năm đó có khấu trừ đặc biệt ngoài bảng.
// THUẦN: không React, không Date.
import type { LuatNam } from './rules/luat'

/** 所得税 (chưa nhân 復興特別所得税) của một mức 課税所得, theo 速算表. */
export function thueTheoBac(thuNhapChiuThue: number, luat: LuatNam): number {
  if (thuNhapChiuThue <= 0) return 0
  const bac = luat.shotokuBac.find((b) => thuNhapChiuThue <= b.toiDa) ?? luat.shotokuBac[luat.shotokuBac.length - 1]
  return Math.round(thuNhapChiuThue * bac.suat - bac.tru)
}

/**
 * Thuế suất biên từ Σ所得税 cả năm (số trên phiếu lương, ĐÃ gồm 2,1% 復興). null khi
 * không nộp thuế — không nộp thì không có bậc, và một bậc đoán ra sẽ chảy thành tiền
 * "tiết kiệm được" giả.
 */
export function suatBienTuThue(thueNam: number, luat: LuatNam): number | null {
  if (!Number.isFinite(thueNam) || thueNam <= 0) return null
  const thueGoc = thueNam / luat.phucHung
  let duoi = 0
  for (const bac of luat.shotokuBac) {
    // Nghiệm của đoạn này: x = (thuế + trừ) / suất. Hợp lệ nếu nằm trong (dưới, tối đa].
    const x = (thueGoc + bac.tru) / bac.suat
    if (x > duoi && x <= bac.toiDa) return bac.suat
    duoi = bac.toiDa
  }
  return luat.shotokuBac[luat.shotokuBac.length - 1].suat
}

/** Tiền thuế bớt được (yên, ƯỚC) khi thêm một khấu trừ 所得税 + 住民税. */
export function tienTietKiem(
  khauTruShotoku: number,
  khauTruJumin: number,
  suatBien: number,
  luat: LuatNam,
): number {
  return Math.round(khauTruShotoku * suatBien * luat.phucHung + khauTruJumin * luat.jumin.suatShotokuWari)
}
```

- [ ] **Step 14: Chạy** — `npx vitest run src/features/quyen-loi` → PASS. `npx tsc -b --noEmit` sạch.

- [ ] **Step 15: Commit**

```bash
git add src/lib/dates.ts src/lib/dates.test.ts src/features/quyen-loi/rules src/features/quyen-loi/marginalRate.ts src/features/quyen-loi/marginalRate.test.ts
git commit -m "feat(quyen-loi): truc nam duong lich, hang so luat thue Nhat theo nam, thue suat bien dao tu 速算表"
```

---

### Task 2: Migration 0056 + kiểu dữ liệu + Repo (cả hai bản) + hooks

**Files:**
- Create: `supabase/migrations/0056_relatives_remit_recipient.sql`
- Modify: `src/types/database.types.ts` (CRLF)
- Modify: `src/data/repo.ts`, `src/data/exportTables.ts`, `src/data/supabaseRepo.ts`, `src/data/demoRepo.ts`, `src/data/demoRepo.test.ts` (CRLF)
- Modify: `src/hooks/queries.ts` (CRLF)

**Interfaces:**
- Produces: `RelativeRow { id, user_id, name, birth_year, relationship: Relationship, country, is_archived, sort_order, created_at }`, `Relationship = 'parent'|'spouse'|'child'|'sibling'|'grandparent'|'other'`
- Produces: `TransactionRow.remit_recipient_id?: string | null`, `NewTransaction.remit_recipient_id?: string | null`
- Produces: `ProfileRow.fuyo_claimed_years: number[]`, trong `ProfilePatch`
- Produces: `Repo.getRelatives(): Promise<RelativeRow[]>`, `createRelative(input: NewRelative)`, `updateRelative(id, patch: RelativePatch)`, `listBenefitTransactions(range: DateRange, filter: BenefitTxFilter): Promise<TransactionRow[]>`
- Produces: hooks `useRelatives()`, `useCreateRelative()`, `useUpdateRelative()`, `useBenefitTransactions(range, filter, enabled)`

- [ ] **Step 1: Migration** — tạo `supabase/migrations/0056_relatives_remit_recipient.sql`:

```sql
-- ============================================================
-- Sổ Chi Tiêu — Migration 0056: người thân nhận tiền + người nhận của mỗi lần gửi
--                                + năm đã khai khấu trừ người phụ thuộc
--
-- VÌ SAO
-- Khấu trừ 国外居住親族 (NTA No.1180) tính RIÊNG TỪNG NGƯỜI: người thân 30–69 tuổi phải
-- nhận ≥ ¥380.000/năm từ chính người nộp thuế, có chứng từ tới tên người đó. Sổ hiện gộp
-- mọi lần gửi thành một dòng "gửi về VN" nên không trả lời được "mẹ đã nhận bao nhiêu".
--
-- `relatives` — một người một dòng; `birth_year` BẮT BUỘC vì tuổi quyết định ngưỡng và
-- mức khấu trừ; không có năm sinh thì không nói được gì về người này nên không cho lưu.
-- KHÔNG có cột thu nhập của người thân (điều kiện ≤ 58万): app không biết và không nên
-- đoán, màn hình chỉ in câu hỏi.
--
-- `transactions.remit_recipient_id` — on delete SET NULL, không cascade: xoá một người
-- không được xoá lịch sử gửi tiền. Lần gửi trở về "chưa biết gửi cho ai". KHÔNG backfill:
-- null = chưa gán, màn Quyền lợi đếm số này ra và nói thẳng.
--
-- `profiles.fuyo_claimed_years` — năm nào đã nộp giấy/đã khai thì app thôi nhắc. Mảng
-- năm chứ không phải bảng: một người một hồ sơ mỗi năm, không truy vấn nào nối theo nó.
--
-- View `account_balances` (0053) KHÔNG cần dựng lại — đã kiểm 2026-09-03: view đọc
-- transactions qua left join và chỉ đụng t.type, t.account_id, t.to_account_id, t.amount,
-- t.to_amount, t.is_refund bằng tên, không có t.*.
-- ============================================================

create table if not exists public.relatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  birth_year smallint not null check (birth_year between 1900 and 2100),
  relationship text not null check (relationship in
    ('parent', 'spouse', 'child', 'sibling', 'grandparent', 'other')),
  -- ISO-2. Luật chỉ áp cho người KHÔNG cư trú ở Nhật; người thân đã sang Nhật thì rẽ sang
  -- luật khác — đặt 'JP' để bộ kiểm bỏ qua và nói rõ.
  country text not null default 'VN',
  is_archived boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists relatives_user_idx on public.relatives (user_id, sort_order);

alter table public.relatives enable row level security;
drop policy if exists "own rows" on public.relatives;
create policy "own rows" on public.relatives
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.transactions
  add column if not exists remit_recipient_id uuid
    references public.relatives (id) on delete set null;

create index if not exists transactions_remit_recipient_idx
  on public.transactions (user_id, remit_recipient_id)
  where remit_recipient_id is not null;

comment on column public.transactions.remit_recipient_id is
  'Người thân nhận lần gửi tiền này (chỉ có nghĩa khi is_remittance). null = chưa gán. '
  'Nuôi: features/quyen-loi/fuyo.ts (khấu trừ 国外居住親族 tính riêng từng người).';

alter table public.profiles
  add column if not exists fuyo_claimed_years smallint[] not null default '{}';

comment on column public.profiles.fuyo_claimed_years is
  'Năm thuế đã nộp giấy 扶養控除 cho công ty / đã khai với sở thuế. App thôi nhắc năm đó. '
  'Nuôi: features/quyen-loi/refund.ts và luật benefit-fuyo-shortfall.';
```

- [ ] **Step 2: Kiểu dữ liệu** — trong `src/types/database.types.ts`:

Cạnh `export type TaxShelter` (dòng ~12) thêm:

```ts
/** Quan hệ với người thân nhận tiền (migration 0056). */
export type Relationship = 'parent' | 'spouse' | 'child' | 'sibling' | 'grandparent' | 'other'
```

Sau `ProfileRow.kikin_sheet` thêm trường:

```ts
  /** Năm thuế đã khai khấu trừ người phụ thuộc ở nước ngoài (migration 0056). Rỗng = chưa năm nào. */
  fuyo_claimed_years: number[]
```

Trong `TransactionRow`, ngay sau `remit_received_vnd`:

```ts
  /** Gửi tiền về VN: người thân nhận (relatives.id, migration 0056). null/thiếu = chưa gán. */
  remit_recipient_id?: string | null
```

Thêm kiểu hàng mới (đặt sau `SavingsGoalRow`):

```ts
/** Người thân nhận tiền gửi về VN (migration 0056). */
export type RelativeRow = {
  id: string
  user_id: string
  name: string
  /** Bắt buộc: tuổi tại 31/12 quyết định ngưỡng 38万 và mức khấu trừ. */
  birth_year: number
  relationship: Relationship
  /** ISO-2; 'JP' = đã cư trú ở Nhật → ngoài phạm vi luật 国外居住親族. */
  country: string
  is_archived: boolean
  sort_order: number
  created_at: string
}
```

Trong `Database.public.Tables`: thêm `'fuyo_claimed_years'` vào cả `Insert` optional và `Update` của `profiles`; thêm `'remit_recipient_id'` vào `Insert` optional và `Update` của `transactions`; thêm bảng:

```ts
      relatives: {
        Row: RelativeRow
        Insert: InsertOf<
          RelativeRow,
          'user_id' | 'name' | 'birth_year' | 'relationship',
          'id' | 'country' | 'is_archived' | 'sort_order' | 'created_at'
        >
        Update: Partial<
          Pick<RelativeRow, 'name' | 'birth_year' | 'relationship' | 'country' | 'is_archived' | 'sort_order'>
        >
        Relationships: []
      }
```

- [ ] **Step 3: `repo.ts`** — thêm `RelativeRow` vào import type; cạnh `NewSavingsGoal` (dòng ~454):

```ts
export interface NewRelative {
  name: string
  birth_year: number
  relationship: Relationship
  /** Bỏ trống = 'VN'. */
  country?: string
}
export type RelativePatch = Partial<NewRelative & { is_archived: boolean; sort_order: number }>

/**
 * Bộ lọc của `listBenefitTransactions`: giao dịch mà màn Quyền lợi cần — lần gửi tiền,
 * khoản thuộc vài danh mục (thuế trên phiếu lương, ふるさと納税), và chuyển khoản VÀO tài
 * khoản NISA/iDeCo. Một truy vấn OR thay cho ba, vì hook thông báo chạy ở mọi màn và
 * mỗi truy vấn thêm là thêm cho cả app.
 */
export interface BenefitTxFilter {
  categoryIds: string[]
  toAccountIds: string[]
}
```

Thêm `Relationship` vào import type từ `../types/database.types`. Trong `NewTransaction` sau `remit_received_vnd`:

```ts
  /** Gửi tiền về VN: người thân nhận (migration 0056). */
  remit_recipient_id?: string | null
```

Trong `ProfilePatch` thêm `| 'fuyo_claimed_years'` (kèm chú thích "migration 0056"). Trong `BackupData` sau `savingsGoals`:

```ts
  /** Người thân nhận tiền (migration 0056); vắng mặt ở mọi backup trước đó. */
  relatives?: RelativeRow[]
```

Trong interface `Repo`, sau `deleteSavingsGoal`:

```ts
  // --- Người thân nhận tiền (migration 0056) ---
  getRelatives(): Promise<RelativeRow[]>
  createRelative(input: NewRelative): Promise<RelativeRow>
  updateRelative(id: string, patch: RelativePatch): Promise<RelativeRow>
  /** Giao dịch cho màn Quyền lợi: is_remittance OR category_id in OR to_account_id in, trong [start, end). */
  listBenefitTransactions(range: DateRange, filter: BenefitTxFilter): Promise<TransactionRow[]>
```

- [ ] **Step 4: `exportTables.ts`** — thêm `'relatives',` vào `DATA_TABLES` ngay sau `'savings_goals',`. (`exportTables.test.ts` đọc SQL migration để kiểm khoá sắp xếp: bảng có `id` nên không cần `PAGE_ORDER`.)

- [ ] **Step 5: `supabaseRepo.ts`** — sau `deleteSavingsGoal`:

```ts
  async getRelatives() {
    const { data, error } = await getSupabase().from('relatives').select('*').order('sort_order')
    if (error) throw error
    return data
  },

  async createRelative(input: NewRelative) {
    const user_id = await currentUserId()
    const { data: existing } = await getSupabase()
      .from('relatives')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
    const sort_order = (existing?.[0]?.sort_order ?? -1) + 1
    const { data, error } = await getSupabase()
      .from('relatives')
      .insert({ ...input, user_id, sort_order })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateRelative(id: string, patch: RelativePatch) {
    const { data, error } = await getSupabase()
      .from('relatives')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async listBenefitTransactions({ start, end }: DateRange, filter: BenefitTxFilter) {
    // Ba nhánh OR, chỉ ghép nhánh có phần tử: `in.()` rỗng là lỗi cú pháp PostgREST.
    const parts = ['is_remittance.eq.true']
    if (filter.categoryIds.length) parts.push(`category_id.in.(${filter.categoryIds.join(',')})`)
    if (filter.toAccountIds.length) parts.push(`to_account_id.in.(${filter.toAccountIds.join(',')})`)
    return await fetchAllPages<TransactionRow>(async (from, to) =>
      getSupabase()
        .from('transactions')
        .select('*')
        .gte('occurred_on', start)
        .lt('occurred_on', end)
        .or(parts.join(','))
        .order('occurred_on', { ascending: true })
        .order('id')
        .range(from, to),
    )
  },
```

Thêm `NewRelative`, `RelativePatch`, `BenefitTxFilter` vào import từ `./repo`, `RelativeRow` vào import type. Trong `exportAll`: thêm `selectAll<RelativeRow>('relatives')` vào `Promise.all` và `relatives` vào object trả về. Trong `importAll`: thêm `'relatives'` vào `deleteOrder` **ngay sau `'transactions'`** (giao dịch trỏ tới người thân nên xoá giao dịch trước), và chèn người thân **trước** giao dịch — đặt khối này ngay trước khối chèn `transactions` (tìm `sb.from('transactions').insert(part)`), cùng khuôn với khối `savings_goals`:

```ts
    // relatives: transactions.remit_recipient_id trỏ tới đây → chèn TRƯỚC transactions.
    if (data.relatives?.length) {
      await insertChunked(
        data.relatives.map((r) => ({
          id: r.id,
          user_id: uid,
          name: r.name,
          birth_year: r.birth_year,
          relationship: r.relationship,
          country: r.country,
          is_archived: r.is_archived,
          sort_order: r.sort_order,
        })),
        (part) => sb.from('relatives').insert(part),
      )
    }
```

Khối chèn `transactions` hiện có phải chép thêm `remit_recipient_id: t.remit_recipient_id ?? null` vào map của nó (đọc khối đó, nó liệt kê từng cột bằng tên — thiếu là mất người nhận sau khôi phục).

- [ ] **Step 6: `demoRepo.ts`** — `DemoDB` thêm `relatives?: RelativeRow[]` (optional: dữ liệu demo cũ trong localStorage không có). Sau `deleteSavingsGoal`:

```ts
  async getRelatives() {
    return (load().relatives ?? []).filter((r) => true).sort((a, b) => a.sort_order - b.sort_order)
  },

  async createRelative(input: NewRelative) {
    const db = load()
    db.relatives ??= []
    const sort_order = db.relatives.reduce((m, r) => Math.max(m, r.sort_order + 1), 0)
    const row: RelativeRow = {
      id: uuid(),
      user_id: DEMO_USER,
      name: input.name,
      birth_year: input.birth_year,
      relationship: input.relationship,
      country: input.country ?? 'VN',
      is_archived: false,
      sort_order,
      created_at: nowISO(),
    }
    db.relatives.push(row)
    save(db)
    return row
  },

  async updateRelative(id: string, patch: RelativePatch) {
    const db = load()
    db.relatives ??= []
    const idx = db.relatives.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error('Không tìm thấy người thân')
    db.relatives[idx] = { ...db.relatives[idx], ...patch }
    save(db)
    return db.relatives[idx]
  },

  async listBenefitTransactions({ start, end }: DateRange, filter: BenefitTxFilter) {
    const cats = new Set(filter.categoryIds)
    const accs = new Set(filter.toAccountIds)
    return load()
      .transactions.filter(
        (t) =>
          t.occurred_on >= start &&
          t.occurred_on < end &&
          (t.is_remittance === true ||
            (t.category_id != null && cats.has(t.category_id)) ||
            (t.to_account_id != null && accs.has(t.to_account_id))),
      )
      .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.id.localeCompare(b.id))
  },
```

(Bỏ `.filter((r) => true)` khi chép — dòng đó chỉ minh hoạ; `getRelatives` trả cả người đã archive, màn hình tự lọc.)

Seed demo: khai hai người thân trước mảng `transactions` trong hàm seed:

```ts
  const me = { id: uuid(), user_id: DEMO_USER, name: 'Mẹ', birth_year: 1958, relationship: 'parent' as const, country: 'VN', is_archived: false, sort_order: 0, created_at: nowISO() }
  const em = { id: uuid(), user_id: DEMO_USER, name: 'Em Hùng', birth_year: 1995, relationship: 'sibling' as const, country: 'VN', is_archived: false, sort_order: 1, created_at: nowISO() }
  const relatives: RelativeRow[] = [me, em]
```

Lần gửi của tháng đang chạy (`daysAgo(6)`, `'Gửi tiền về nhà'`): thêm `remit_recipient_id: me.id`. Trong vòng lặp 26 tháng: thêm `remit_recipient_id: idx === 2 ? null : idx % 2 === 0 ? me.id : em.id` — mẹ (70+) `du`, em (30–69) `thieu`, một lần chưa gán. Thêm `relatives` vào object trả về của seed, vào `exportAll` (`relatives: db.relatives ?? []`) và `importAll` (`relatives: stamp(data.relatives ?? [])`). Thêm `fuyo_claimed_years: []` vào profile seed. Thêm danh mục demo `'ふるさと納税 (寄附)'` (expense, icon '🎁', `need_level: 'flexible'`, `cost_type: 'variable'`) và một giao dịch ¥30.000 ngày `daysAgo(40)` từ `bank` với `category_id` đó.

- [ ] **Step 7: Test demoRepo** — thêm vào `src/data/demoRepo.test.ts` (đọc đầu file để dùng đúng cách reset localStorage đang có):

```ts
describe('relatives + listBenefitTransactions (0056)', () => {
  it('seed có hai người thân, một lần gửi chưa gán', async () => {
    const rel = await demoRepo.getRelatives()
    expect(rel.map((r) => r.name)).toEqual(['Mẹ', 'Em Hùng'])
    const txs = await demoRepo.listBenefitTransactions(
      { start: '2000-01-01', end: '2100-01-01' },
      { categoryIds: [], toAccountIds: [] },
    )
    expect(txs.every((t) => t.is_remittance)).toBe(true)
    expect(txs.filter((t) => t.remit_recipient_id == null).length).toBe(1)
  })
  it('createRelative mặc định country VN, updateRelative đổi tên', async () => {
    const r = await demoRepo.createRelative({ name: 'Bà', birth_year: 1940, relationship: 'grandparent' })
    expect(r.country).toBe('VN')
    const u = await demoRepo.updateRelative(r.id, { name: 'Bà ngoại' })
    expect(u.name).toBe('Bà ngoại')
  })
  it('listBenefitTransactions gộp OR ba nhánh', async () => {
    const accounts = await demoRepo.getAccounts()
    const nisa = accounts.find((a) => a.name === 'NISA Rakuten')!
    const txs = await demoRepo.listBenefitTransactions(
      { start: '2000-01-01', end: '2100-01-01' },
      { categoryIds: [], toAccountIds: [nisa.id] },
    )
    expect(txs.some((t) => t.to_account_id === nisa.id)).toBe(true)
    expect(txs.some((t) => t.is_remittance)).toBe(true)
  })
})
```

- [ ] **Step 8: Chạy** — `npx vitest run src/data/demoRepo.test.ts src/data/exportTables.test.ts` → PASS; `npx tsc -b --noEmit` sạch (interface `Repo` ép cả hai bản).

- [ ] **Step 9: `queries.ts`** — sau khối savings goals:

```ts
// --- Người thân nhận tiền (migration 0056) ---

export function useRelatives() {
  return useQuery({
    queryKey: ['relatives'],
    queryFn: () => repo.getRelatives(),
    staleTime: 5 * 60_000,
  })
}

function invalidateRelatives(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['relatives'] })
}

export function useCreateRelative() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewRelative) => repo.createRelative(input),
    onSettled: () => invalidateRelatives(qc),
  })
}

export function useUpdateRelative() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: RelativePatch }) => repo.updateRelative(id, patch),
    onSettled: () => invalidateRelatives(qc),
  })
}

/**
 * Giao dịch cho màn Quyền lợi. queryKey nằm dưới 'transactions' để `invalidateTransactionData`
 * (ghi/sửa/xoá giao dịch) làm mới luôn — gán người nhận xong là số đổi ngay.
 */
export function useBenefitTransactions(range: DateRange, filter: BenefitTxFilter, enabled = true) {
  return useQuery({
    queryKey: ['transactions', 'benefit', range.start, range.end, filter.categoryIds, filter.toAccountIds],
    queryFn: () => repo.listBenefitTransactions(range, filter),
    enabled,
    staleTime: 60_000,
  })
}
```

Thêm `NewRelative`, `RelativePatch`, `BenefitTxFilter` vào import từ `../data`. Kiểm `invalidateTransactionData` đang invalidate `['transactions']` (tiền tố) — nếu nó invalidate khoá đúng `['transactions', start, end]` thì thêm `qc.invalidateQueries({ queryKey: ['transactions', 'benefit'] })` vào trong nó.

- [ ] **Step 10: Chạy** — `npx tsc -b --noEmit`; `npm test` → xanh (kể cả `tests/designSystem.test.ts`, `pushBundle` chưa đụng).

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/0056_relatives_remit_recipient.sql src/types/database.types.ts src/data src/hooks/queries.ts
git commit -m "feat(quyen-loi): bang relatives, cot remit_recipient_id va fuyo_claimed_years; repo + hooks + seed demo"
```

---

### Task 3: Kiểu `KetLuan` + bộ kiểm ① `fuyo.ts`

**Files:**
- Create: `src/features/quyen-loi/ketLuan.ts`, `fuyo.ts`, `fuyo.test.ts`

**Interfaces:**
- Consumes: `luatChoNam`, `tienTietKiem` (Task 1); `RelativeRow`, `TransactionRow`, `AccountRow` (Task 2); `convertToBase`, `Rates` từ `lib/rates`; `calendarYearOf` từ `lib/dates`
- Produces: `KetLuan`, `FuyoInput`, `FuyoNguoi`, `FuyoKetQua`, `tinhFuyo(input): FuyoKetQua`, `soGuiJpy(t, currencyOf, base, rates): number | null`

- [ ] **Step 1: Tạo `ketLuan.ts`**:

```ts
// Hình dạng kết luận CHUNG của bốn bộ kiểm — màn Quyền lợi, khung trên Bản tin và bộ luật
// thông báo cùng đọc một kiểu này, nên luật thông báo không cần biết từng khoản tính thế nào.
// THUẦN: không React, không Date.

export type KetLuanId = 'fuyo' | 'remit-unassigned' | 'refund' | 'furusato' | 'shelter'

/**
 * 'du'           = đủ điều kiện / không còn việc gì
 * 'thieu'        = còn việc phải làm và còn hạn → thành thông báo việc-cần-làm
 * 'het-han'      = đã qua hạn, chỉ còn để biết
 * 'thieu-du-lieu'= app không nói được vì thiếu dữ liệu — KHÔNG phải 0 (§14: chưa biết ≠ 0)
 */
export type TrangThai = 'du' | 'thieu' | 'het-han' | 'thieu-du-lieu'

export interface KetLuan {
  id: KetLuanId
  /** Năm thuế (dương lịch) mà kết luận nói về. */
  year: number
  trang_thai: TrangThai
  /** Mức khẩn cho thông báo; bộ kiểm quyết, luật chỉ chép. */
  muc: 'high' | 'medium' | 'low'
  /** Tiền ƯỚC tiết kiệm được (yên); null = không nói được. Màn hình LUÔN gắn ≈. */
  tiet_kiem_uoc: number | null
  /** Hạn ISO; null = không có hạn. */
  han: string | null
  /** MỘT câu việc-cần-làm, có động từ. Đây là tiêu đề thông báo. */
  viec: string
  /** Vì sao là số ước / vì sao thiếu dữ liệu. Câu đầu là `detail` của thông báo. */
  ly_do: string[]
}
```

- [ ] **Step 2: Test `fuyo.test.ts`**:

```ts
import { describe, expect, it } from 'vitest'
import type { AccountRow, RelativeRow, TransactionRow } from '../../types/database.types'
import { tinhFuyo, type FuyoInput } from './fuyo'

let seq = 0
function tx(p: Partial<TransactionRow>): TransactionRow {
  return {
    id: `t${seq++}`, user_id: 'u', type: 'expense', amount: 0, to_amount: null, category_id: null,
    account_id: 'jpy', to_account_id: null, recurring_rule_id: null, occurred_on: '2026-03-01',
    note: '', created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
    is_remittance: true, remit_fee_jpy: 500, ...p,
  }
}
function nguoi(p: Partial<RelativeRow>): RelativeRow {
  return {
    id: 'me', user_id: 'u', name: 'Mẹ', birth_year: 1958, relationship: 'parent', country: 'VN',
    is_archived: false, sort_order: 0, created_at: '2026-01-01T00:00:00Z', ...p,
  }
}
const accounts = [
  { id: 'jpy', currency: 'JPY' },
  { id: 'vnd', currency: 'VND' },
] as Pick<AccountRow, 'id' | 'currency'>[]

function input(p: Partial<FuyoInput>): FuyoInput {
  return {
    year: 2026, todayISO: '2026-09-03', relatives: [], txs: [], accounts, base: 'JPY', rates: {},
    suatBien: 0.1, ...p,
  }
}

describe('tinhFuyo — nhóm tuổi tại 31/12', () => {
  it('70+: không ngưỡng, khấu trừ 老人 48万/38万, đủ ngay khi có một lần gửi', () => {
    const r = tinhFuyo(input({
      relatives: [nguoi({ birth_year: 1956 })], // 70 tuổi năm 2026
      txs: [tx({ amount: 30_500, remit_recipient_id: 'me' })],
    }))
    expect(r.nguoi[0]).toMatchObject({ nhom: '70+', da_gui: 30_000, nguong: 0, con_thieu: 0, du: true })
    expect(r.nguoi[0].khau_tru_shotoku).toBe(480_000)
    // 480.000 × 0,10 × 1,021 + 380.000 × 0,10 = 49.008 + 38.000
    expect(r.nguoi[0].tiet_kiem_uoc).toBe(87_008)
    expect(r.ketLuan.trang_thai).toBe('du')
  })

  it('30–69: thiếu dưới 38万 → thieu, còn 3 tháng (tháng 9)', () => {
    const r = tinhFuyo(input({
      relatives: [nguoi({ id: 'em', name: 'Em', birth_year: 1995 })],
      txs: [tx({ amount: 100_500, remit_recipient_id: 'em' }), tx({ amount: 100_500, remit_recipient_id: 'em' })],
    }))
    const em = r.nguoi[0]
    expect(em).toMatchObject({ nhom: '30-69', da_gui: 200_000, nguong: 380_000, con_thieu: 180_000, du: false })
    expect(em.khau_tru_shotoku).toBe(0)
    expect(r.thang_con_lai).toBe(3)
    expect(r.ketLuan.trang_thai).toBe('thieu')
    expect(r.ketLuan.muc).toBe('medium')
    expect(r.ketLuan.viec).toContain('180.000')
    expect(r.ketLuan.han).toBe('2026-12-31')
  })

  it('≤ 2 tháng còn lại → muc high; tháng 12 → 0 tháng', () => {
    const r = tinhFuyo(input({ todayISO: '2026-12-10', relatives: [nguoi({ id: 'em', birth_year: 1995 })] }))
    expect(r.thang_con_lai).toBe(0)
    expect(r.ketLuan.muc).toBe('high')
  })

  it('biên tuổi: sinh 1997 → 29 tuổi năm 2026 là 16-29 (không ngưỡng); 1996 → 30', () => {
    const r = tinhFuyo(input({ relatives: [nguoi({ id: 'a', birth_year: 1997 }), nguoi({ id: 'b', birth_year: 1996 })] }))
    expect(r.nguoi[0].nhom).toBe('16-29')
    expect(r.nguoi[1].nhom).toBe('30-69')
  })

  it('dưới 16 → không được khấu trừ, không tính thiếu', () => {
    const r = tinhFuyo(input({ relatives: [nguoi({ id: 'c', birth_year: 2015 })] }))
    expect(r.nguoi[0]).toMatchObject({ nhom: '<16', khau_tru_shotoku: 0, con_thieu: 0 })
  })

  it('country JP → bỏ qua, nói rõ', () => {
    const r = tinhFuyo(input({ relatives: [nguoi({ country: 'JP' })] }))
    expect(r.nguoi).toHaveLength(0)
    expect(r.ketLuan.ly_do.join(' ')).toMatch(/cư trú ở Nhật/)
  })
})

describe('tinhFuyo — dữ liệu', () => {
  it('lần gửi chưa gán át trạng thái du → thieu-du-lieu, đếm số lần và tổng', () => {
    const r = tinhFuyo(input({
      relatives: [nguoi({ birth_year: 1956 })],
      txs: [tx({ amount: 30_500, remit_recipient_id: 'me' }), tx({ amount: 20_500 }), tx({ amount: 10_500 })],
    }))
    expect(r.chua_gan).toEqual({ so_lan: 2, tong: 30_000 })
    expect(r.ketLuan.trang_thai).toBe('thieu-du-lieu')
    expect(r.ketLuan.viec).toMatch(/2 lần gửi/)
  })

  it('chỉ đếm năm đang xét và chỉ is_remittance', () => {
    const r = tinhFuyo(input({
      relatives: [nguoi()],
      txs: [
        tx({ amount: 30_500, remit_recipient_id: 'me', occurred_on: '2025-12-31' }),
        tx({ amount: 30_500, remit_recipient_id: 'me', occurred_on: '2026-01-01' }),
        tx({ amount: 99_000, remit_recipient_id: 'me', is_remittance: false }),
      ],
    }))
    expect(r.nguoi[0].da_gui).toBe(30_000)
  })

  it('tài khoản VND thiếu tỷ giá → loại + cờ thieu_ty_gia', () => {
    const r = tinhFuyo(input({
      relatives: [nguoi()],
      txs: [tx({ amount: 5_000_000, account_id: 'vnd', remit_fee_jpy: 0, remit_recipient_id: 'me' })],
    }))
    expect(r.nguoi[0].da_gui).toBe(0)
    expect(r.thieu_ty_gia).toBe(true)
  })

  it('tài khoản VND có tỷ giá → quy về yên', () => {
    const r = tinhFuyo(input({
      relatives: [nguoi()],
      rates: { VND: 166 }, // 1 JPY = 166 VND
      txs: [tx({ amount: 1_660_000, account_id: 'vnd', remit_fee_jpy: 0, remit_recipient_id: 'me' })],
    }))
    expect(r.nguoi[0].da_gui).toBe(10_000)
  })

  it('suatBien null → tiet_kiem_uoc null, có lý do', () => {
    const r = tinhFuyo(input({ suatBien: null, relatives: [nguoi()], txs: [tx({ amount: 30_500, remit_recipient_id: 'me' })] }))
    expect(r.nguoi[0].tiet_kiem_uoc).toBeNull()
    expect(r.ketLuan.tiet_kiem_uoc).toBeNull()
    expect(r.ketLuan.ly_do.join(' ')).toMatch(/phiếu lương/)
  })

  it('năm ≤ 2022 dùng luật không ngưỡng: 30–69 đủ chỉ với một lần gửi', () => {
    const r = tinhFuyo(input({ year: 2022, relatives: [nguoi({ id: 'em', birth_year: 1990 })], txs: [tx({ amount: 30_500, remit_recipient_id: 'em', occurred_on: '2022-05-01' })] }))
    expect(r.nguoi[0]).toMatchObject({ nguong: 0, du: true, khau_tru_shotoku: 380_000 })
  })

  it('không có người thân → thieu-du-lieu, việc là thêm người', () => {
    const r = tinhFuyo(input({}))
    expect(r.ketLuan.trang_thai).toBe('thieu-du-lieu')
    expect(r.ketLuan.viec).toMatch(/Thêm người thân/)
  })
})
```

- [ ] **Step 3: Chạy thấy đỏ** — `npx vitest run src/features/quyen-loi/fuyo.test.ts`.

- [ ] **Step 4: Tạo `fuyo.ts`**:

```ts
// Khoản ① — Khấu trừ người phụ thuộc ở nước ngoài (国外居住親族に係る扶養控除).
//
// Luật (rules/2026.ts, NTA No.1180 + quận Ōta): tính RIÊNG TỪNG NGƯỜI, theo NĂM DƯƠNG LỊCH.
//   <16      không được khấu trừ (đã thay bằng 児童手当)
//   16–29    có gửi là được, không ngưỡng            → 38万 / 33万
//   30–69    phải nhận ≥ 38万 trong năm (từ 2023)     → 38万 / 33万
//   70+      có gửi là được, không ngưỡng            → 48万 / 38万 (老人扶養親族)
//
// Số gửi của một lần = amount − remit_fee_jpy (quan hệ chốt của sổ, xem đầu
// transactions/remitDerive.ts và remittance/aggregate.ts). Tài khoản nguồn không phải JPY
// thì quy về yên qua convertToBase; thiếu tỷ giá → LOẠI và bật cờ, không quy 1:1.
//
// THUẦN: không React, không Date, KHÔNG nhận monthStartDay — không nhận thì không dùng nhầm.
import { calendarYearOf } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/currencies'
import { convertToBase, type Rates } from '../../lib/rates'
import type { AccountRow, RelativeRow, TransactionRow } from '../../types/database.types'
import type { KetLuan } from './ketLuan'
import { tienTietKiem } from './marginalRate'
import { luatChoNam } from './rules/luat'

export type NhomTuoi = '<16' | '16-29' | '30-69' | '70+'

export interface FuyoInput {
  year: number
  todayISO: string
  relatives: RelativeRow[]
  /** Giao dịch bất kỳ; tự lọc is_remittance + năm. */
  txs: TransactionRow[]
  accounts: Pick<AccountRow, 'id' | 'currency'>[]
  base: CurrencyCode
  rates: Rates
  /** Thuế suất biên ước (marginalRate.ts); null = chưa đủ phiếu lương → không ước tiền. */
  suatBien: number | null
}

export interface FuyoNguoi {
  id: string
  name: string
  tuoi: number
  nhom: NhomTuoi
  /** Σ số gửi trong năm, yên. */
  da_gui: number
  so_lan: number
  /** 0 khi nhóm không có ngưỡng. */
  nguong: number
  con_thieu: number
  du: boolean
  khau_tru_shotoku: number
  khau_tru_jumin: number
  tiet_kiem_uoc: number | null
  /** Tên giấy phải nộp cho công ty khi 年末調整. */
  giay: string[]
}

export interface FuyoKetQua {
  ketLuan: KetLuan
  nguoi: FuyoNguoi[]
  /** Lần gửi trong năm chưa gán người nhận. */
  chua_gan: { so_lan: number; tong: number }
  thang_con_lai: number
  thieu_ty_gia: boolean
  /** Người bị bỏ qua vì country ≠ VN-kiểu (đã cư trú ở Nhật). */
  bo_qua: string[]
}

/** Số gửi (yên) của một lần gửi; null khi thiếu tỷ giá. */
export function soGuiJpy(
  t: TransactionRow,
  currencyOf: (accountId: string) => CurrencyCode,
  base: CurrencyCode,
  rates: Rates,
): number | null {
  const sent = Math.max(t.amount - (t.remit_fee_jpy ?? 0), 0)
  const cur = currencyOf(t.account_id)
  if (cur === 'JPY') return sent
  // rates là tỷ giá so với base; chỉ đổi được khi base là JPY. Base khác → coi như thiếu.
  if (base !== 'JPY') return null
  return convertToBase(sent, cur, 'JPY', rates)
}

export function nhomTuoi(tuoi: number): NhomTuoi {
  if (tuoi < 16) return '<16'
  if (tuoi < 30) return '16-29'
  if (tuoi < 70) return '30-69'
  return '70+'
}

export function tinhFuyo(input: FuyoInput): FuyoKetQua {
  const luat = luatChoNam(input.year)
  const byId = new Map(input.accounts.map((a) => [a.id, a.currency]))
  const currencyOf = (id: string): CurrencyCode => byId.get(id) ?? input.base

  const thangHomNay = Number(input.todayISO.slice(5, 7))
  const namHomNay = calendarYearOf(input.todayISO)
  const thang_con_lai = input.year === namHomNay ? 12 - thangHomNay : input.year > namHomNay ? 12 : 0

  // Gom số gửi theo người
  const daGui = new Map<string, { tong: number; so_lan: number }>()
  const chua_gan = { so_lan: 0, tong: 0 }
  let thieu_ty_gia = false
  for (const t of input.txs) {
    if (!t.is_remittance || calendarYearOf(t.occurred_on) !== input.year) continue
    const yen = soGuiJpy(t, currencyOf, input.base, input.rates)
    if (yen === null) {
      thieu_ty_gia = true
      continue
    }
    if (t.remit_recipient_id == null) {
      chua_gan.so_lan++
      chua_gan.tong += yen
      continue
    }
    const cur = daGui.get(t.remit_recipient_id) ?? { tong: 0, so_lan: 0 }
    cur.tong += yen
    cur.so_lan++
    daGui.set(t.remit_recipient_id, cur)
  }

  const bo_qua: string[] = []
  const nguoi: FuyoNguoi[] = []
  for (const r of input.relatives) {
    if (r.is_archived) continue
    if (r.country === 'JP') {
      bo_qua.push(r.name)
      continue
    }
    const tuoi = input.year - r.birth_year
    const nhom = nhomTuoi(tuoi)
    const g = daGui.get(r.id) ?? { tong: 0, so_lan: 0 }
    const nguong = nhom === '30-69' ? (luat.fuyo.nguong30_69 ?? 0) : 0
    const coGui = g.so_lan > 0
    const du = nhom !== '<16' && coGui && g.tong >= nguong
    const laoNhan = nhom === '70+'
    const khau_tru_shotoku = du ? (laoNhan ? luat.fuyo.khauTruShotoku.laoNhan : luat.fuyo.khauTruShotoku.thuong) : 0
    const khau_tru_jumin = du ? (laoNhan ? luat.fuyo.khauTruJumin.laoNhan : luat.fuyo.khauTruJumin.thuong) : 0
    const giay =
      nhom === '30-69' && nguong > 0
        ? ['親族関係書類', '38万円送金書類']
        : ['親族関係書類', '送金関係書類']
    nguoi.push({
      id: r.id,
      name: r.name,
      tuoi,
      nhom,
      da_gui: g.tong,
      so_lan: g.so_lan,
      nguong,
      con_thieu: nhom === '30-69' ? Math.max(0, nguong - g.tong) : 0,
      du,
      khau_tru_shotoku,
      khau_tru_jumin,
      tiet_kiem_uoc:
        input.suatBien === null || !du
          ? null
          : tienTietKiem(khau_tru_shotoku, khau_tru_jumin, input.suatBien, luat),
      giay,
    })
  }

  const ly_do: string[] = []
  if (input.suatBien === null)
    ly_do.push('Chưa đủ 12 tháng phiếu lương để ước thuế suất — nhập phiếu lương thì mới có số tiền tiết kiệm.')
  else ly_do.push('Tiền tiết kiệm là số ước từ thuế suất biên trên phiếu lương; công ty/sở thuế ra số cuối.')
  if (thieu_ty_gia) ly_do.push('Có lần gửi từ tài khoản ngoại tệ thiếu tỷ giá, đã loại khỏi tổng.')
  if (bo_qua.length) ly_do.push(`${bo_qua.join(', ')} đang cư trú ở Nhật — theo luật người cư trú, ngoài phạm vi khoản này.`)
  ly_do.push(`Người thân phải có 合計所得金額 ≤ ¥${luat.fuyo.thuNhapToiDa.toLocaleString('vi-VN')}/năm — app không kiểm được điều này.`)

  const tongTietKiem = nguoi.some((n) => n.tiet_kiem_uoc !== null)
    ? nguoi.reduce((s, n) => s + (n.tiet_kiem_uoc ?? 0), 0)
    : null
  const han = `${input.year}-12-31`
  const thieu = nguoi.filter((n) => n.nhom === '30-69' && !n.du)
  const muc: KetLuan['muc'] = thang_con_lai <= 2 ? 'high' : 'medium'

  let trang_thai: KetLuan['trang_thai']
  let viec: string
  if (nguoi.length === 0 && bo_qua.length === 0) {
    trang_thai = 'thieu-du-lieu'
    viec = 'Thêm người thân nhận tiền để app tính được khấu trừ người phụ thuộc'
  } else if (chua_gan.so_lan > 0) {
    trang_thai = 'thieu-du-lieu'
    viec = `Gán người nhận cho ${chua_gan.so_lan} lần gửi (¥${chua_gan.tong.toLocaleString('vi-VN')}) — chưa gán thì số dưới đây đang thiếu`
  } else if (thieu.length > 0 && input.year < namHomNay) {
    trang_thai = 'het-han'
    viec = `${thieu.map((n) => n.name).join(', ')} không đủ 38万 năm ${input.year}`
  } else if (thieu.length > 0) {
    trang_thai = 'thieu'
    const n = thieu[0]
    viec =
      thieu.length === 1
        ? `Còn ¥${n.con_thieu.toLocaleString('vi-VN')} để ${n.name} đủ 38万 · ${thang_con_lai} tháng nữa`
        : `${thieu.length} người còn thiếu để đủ 38万 · ${thang_con_lai} tháng nữa`
  } else if (nguoi.some((n) => n.du)) {
    trang_thai = 'du'
    viec = `Nộp ${[...new Set(nguoi.filter((n) => n.du).flatMap((n) => n.giay))].join(' + ')} cho công ty trước 年末調整`
  } else {
    trang_thai = 'thieu-du-lieu'
    viec = 'Chưa có lần gửi nào trong năm được gán cho người thân'
  }

  return {
    ketLuan: { id: 'fuyo', year: input.year, trang_thai, muc, tiet_kiem_uoc: tongTietKiem, han, viec, ly_do },
    nguoi,
    chua_gan,
    thang_con_lai,
    thieu_ty_gia,
    bo_qua,
  }
}
```

- [ ] **Step 5: Chạy** — `npx vitest run src/features/quyen-loi/fuyo.test.ts` → PASS. Nếu test "muc high" đỏ vì `thieu.length === 0` (không có lần gửi nào), kiểm lại: người 1995 không có lần gửi → `du=false`, `nhom 30-69` → nằm trong `thieu` → đúng đường `thieu`. Với `todayISO` tháng 12 → `thang_con_lai = 0` → `high`.

- [ ] **Step 6: Commit**

```bash
git add src/features/quyen-loi/ketLuan.ts src/features/quyen-loi/fuyo.ts src/features/quyen-loi/fuyo.test.ts
git commit -m "feat(quyen-loi): bo kiem khau tru nguoi phu thuoc o nuoc ngoai - tinh rieng tung nguoi theo nam duong lich"
```

---

### Task 4: Bộ kiểm ② `refund.ts`, ③ `furusato.ts`, ④ `shelterYearEnd.ts`, và hàm gom `quyenLoi.ts`

**Files:**
- Create: `src/features/quyen-loi/refund.ts` (+test), `furusato.ts` (+test), `shelterYearEnd.ts` (+test), `quyenLoi.ts` (+test)

**Interfaces:**
- Consumes: `tinhFuyo`, `FuyoInput` (Task 3); `shelterUsage` từ `features/assets/shelter`; `taxCategoryIds`/`TAX_CHILDREN` từ `features/tax/categories`; `remittanceStats` từ `features/remittance/aggregate`
- Produces: `tinhRefund(input: RefundInput): RefundKetQua`, `tinhFurusato(input: FurusatoInput): FurusatoKetQua`, `tinhShelterYearEnd(input: ShelterInput): ShelterKetQua`, `tinhQuyenLoi(input: QuyenLoiInput): QuyenLoiKetQua`, `FURUSATO_CATEGORY_NAME`, `SO_TAX_NAMES`

- [ ] **Step 1: Test `refund.test.ts`**:

```ts
import { describe, expect, it } from 'vitest'
import type { RelativeRow, TransactionRow } from '../../types/database.types'
import { tinhRefund } from './refund'

let seq = 0
const tx = (p: Partial<TransactionRow>): TransactionRow => ({
  id: `t${seq++}`, user_id: 'u', type: 'expense', amount: 30_500, to_amount: null, category_id: null,
  account_id: 'jpy', to_account_id: null, recurring_rule_id: null, occurred_on: '2024-03-01', note: '',
  created_at: '', updated_at: '', is_remittance: true, remit_fee_jpy: 500, remit_recipient_id: 'me', ...p,
})
const me: RelativeRow = { id: 'me', user_id: 'u', name: 'Mẹ', birth_year: 1958, relationship: 'parent', country: 'VN', is_archived: false, sort_order: 0, created_at: '' }
const base = { todayISO: '2026-09-03', relatives: [me], accounts: [{ id: 'jpy', currency: 'JPY' as const }], base: 'JPY' as const, rates: {}, suatBien: 0.1, fuyoClaimedYears: [] as number[] }

describe('tinhRefund — cửa sổ 5 năm', () => {
  it('9/2026 soát 2021..2025; năm nào có người đủ thì vào danh sách với hạn 31/12/(y+5)', () => {
    // 2021: mẹ 63 tuổi, luật không ngưỡng → một lần 30.000 là đủ.
    // 2024: mẹ 66 tuổi, cần 38万 → gửi 400.000 mới đủ.
    const r = tinhRefund({ ...base, txs: [tx({ occurred_on: '2021-06-01' }), tx({ occurred_on: '2024-06-01', amount: 400_500 })] })
    expect(r.nam.map((n) => n.year)).toEqual([2021, 2024])
    expect(r.nam[0].han).toBe('2026-12-31')
    expect(r.nam[1].han).toBe('2029-12-31')
    expect(r.ketLuan.trang_thai).toBe('thieu')
    expect(r.ketLuan.muc).toBe('high') // có năm hết hạn ngay năm nay
    expect(r.ketLuan.han).toBe('2026-12-31')
  })
  it('2021 dùng luật không ngưỡng: người 30–69 đủ chỉ với một lần gửi', () => {
    const em = { ...me, id: 'em', birth_year: 1990 }
    const r = tinhRefund({ ...base, relatives: [em], txs: [tx({ occurred_on: '2021-06-01', remit_recipient_id: 'em' })] })
    expect(r.nam.map((n) => n.year)).toEqual([2021])
  })
  it('năm đã đánh dấu đã khai thì bỏ', () => {
    const r = tinhRefund({ ...base, fuyoClaimedYears: [2024], txs: [tx({ occurred_on: '2024-06-01', amount: 400_500 })] })
    expect(r.nam).toHaveLength(0)
    expect(r.ketLuan.trang_thai).toBe('du')
    expect(r.ketLuan.muc).toBe('low')
  })
  it('có năm đủ nhưng chưa năm nào hết hạn năm nay → muc medium', () => {
    const r = tinhRefund({ ...base, txs: [tx({ occurred_on: '2024-06-01', amount: 400_500 })] })
    expect(r.nam.map((n) => n.year)).toEqual([2024])
    expect(r.ketLuan.muc).toBe('medium')
  })
  it('30–69 với dưới 38万 ở năm ≥ 2023 → không đủ, không vào danh sách', () => {
    const r = tinhRefund({ ...base, txs: [tx({ occurred_on: '2024-06-01' }), tx({ occurred_on: '2025-06-01' })] })
    // mẹ 66/67 tuổi với 30.000 < 38万 → rỗng
    expect(r.nam).toHaveLength(0)
  })
  it('mẹ 70+ từ 2028 mới đủ không ngưỡng; năm 2025 (67 tuổi) cần 38万', () => {
    const r = tinhRefund({ ...base, txs: Array.from({ length: 13 }, () => tx({ occurred_on: '2025-06-01' })) })
    expect(r.nam.map((n) => n.year)).toEqual([2025]) // 13 × 30.000 = 390.000 ≥ 38万
    expect(r.nam[0].tiet_kiem_uoc).toBe(71_798) // 38万×10%×1,021 + 33万×10%
    expect(r.ketLuan.tiet_kiem_uoc).toBe(71_798)
  })
})
```

- [ ] **Step 2: Chạy thấy đỏ**, rồi tạo `refund.ts`:

```ts
// Khoản ② — Đòi lại năm cũ bằng 還付申告 (NTA No.2030: nộp được từ 1/1 năm sau, trong 5 năm).
//
// Chạy lại bộ kiểm ① cho từng năm đã qua, bằng LUẬT CỦA NĂM ĐÓ (luatChoNam) — 2021–2022
// không có ngưỡng 38万. Năm người dùng đã đánh dấu "đã khai" thì bỏ.
// THUẦN: không React, không Date.
import { calendarYearOf } from '../../lib/dates'
import type { KetLuan } from './ketLuan'
import { tinhFuyo, type FuyoInput, type FuyoNguoi } from './fuyo'

export const SO_NAM_HOAN_THUE = 5

export interface RefundInput extends Omit<FuyoInput, 'year'> {
  fuyoClaimedYears: number[]
}

export interface RefundNam {
  year: number
  /** Hạn nộp 還付申告: 31/12 của (year + 5). */
  han: string
  nguoi: FuyoNguoi[]
  tiet_kiem_uoc: number | null
  /** Luật năm đó có ngưỡng 38万 không — để màn hình nói "năm này chỉ cần chứng từ gửi tiền". */
  co_nguong: boolean
}

export interface RefundKetQua {
  ketLuan: KetLuan
  nam: RefundNam[]
}

export function tinhRefund(input: RefundInput): RefundKetQua {
  const namNay = calendarYearOf(input.todayISO)
  const nam: RefundNam[] = []
  for (let y = namNay - SO_NAM_HOAN_THUE; y <= namNay - 1; y++) {
    if (input.fuyoClaimedYears.includes(y)) continue
    const r = tinhFuyo({ ...input, year: y })
    const du = r.nguoi.filter((n) => n.du)
    if (du.length === 0) continue
    const tk = du.some((n) => n.tiet_kiem_uoc !== null) ? du.reduce((s, n) => s + (n.tiet_kiem_uoc ?? 0), 0) : null
    nam.push({ year: y, han: `${y + SO_NAM_HOAN_THUE}-12-31`, nguoi: du, tiet_kiem_uoc: tk, co_nguong: du.some((n) => n.nguong > 0) })
  }

  const tong = nam.some((n) => n.tiet_kiem_uoc !== null) ? nam.reduce((s, n) => s + (n.tiet_kiem_uoc ?? 0), 0) : null
  const hetHanNamNay = nam.find((n) => n.han.startsWith(String(namNay)))
  const ly_do = [
    'Đây là lần đầu tự khai với sở thuế; nộp 確定申告 thì ワンストップ của ふるさと納税 năm đó vô hiệu, phải khai lại trong cùng tờ khai.',
    input.suatBien === null
      ? 'Chưa ước được tiền vì thiếu phiếu lương.'
      : 'Tiền ước theo thuế suất biên HIỆN TẠI; năm cũ lương khác thì số khác.',
  ]
  const ketLuan: KetLuan =
    nam.length === 0
      ? { id: 'refund', year: namNay, trang_thai: 'du', muc: 'low', tiet_kiem_uoc: null, han: null, viec: 'Không có năm cũ nào còn đòi lại được', ly_do }
      : {
          id: 'refund',
          year: namNay,
          trang_thai: 'thieu',
          muc: hetHanNamNay ? 'high' : 'medium',
          tiet_kiem_uoc: tong,
          han: nam[0].han,
          viec: `${nam.length} năm cũ đủ điều kiện nộp 還付申告 (${nam.map((n) => n.year).join(', ')})${hetHanNamNay ? ` · năm ${hetHanNamNay.year} hết hạn 31/12` : ''}`,
          ly_do,
        }
  return { ketLuan, nam }
}
```

- [ ] **Step 3: Chạy** `npx vitest run src/features/quyen-loi/refund.test.ts` → PASS.

- [ ] **Step 4: Test `furusato.test.ts`**:

```ts
import { describe, expect, it } from 'vitest'
import type { CategoryRow, TransactionRow } from '../../types/database.types'
import { FURUSATO_CATEGORY_NAME, tinhFurusato, tranFurusato } from './furusato'
import { LUAT_2026 } from './rules/2026'

let seq = 0
const tx = (p: Partial<TransactionRow>): TransactionRow => ({
  id: `t${seq++}`, user_id: 'u', type: 'expense', amount: 0, to_amount: null, category_id: null, account_id: 'a',
  to_account_id: null, recurring_rule_id: null, occurred_on: '2026-03-25', note: '', created_at: '', updated_at: '', ...p,
})
const cat = (id: string, name: string): CategoryRow => ({
  id, user_id: 'u', name, type: 'expense', icon: '', parent_id: null, sort_order: 0, is_archived: false,
  created_at: '', need_level: null, cost_type: null, kind: 'expense',
})
const categories = [cat('sho', 'Thuế thu nhập (所得税)'), cat('ju', 'Thuế cư trú (住民税)'), cat('fu', FURUSATO_CATEGORY_NAME)]
/** 12 tháng 住民税 12.000 + 所得税 6.000, từ 9/2025 tới 8/2026. */
function phieu12(): TransactionRow[] {
  const out: TransactionRow[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(2025, 8 + i, 25))
    const iso = d.toISOString().slice(0, 10)
    out.push(tx({ category_id: 'ju', amount: 12_000, occurred_on: iso, exclude_from_stats: true }))
    out.push(tx({ category_id: 'sho', amount: 6_000, occurred_on: iso, exclude_from_stats: true }))
  }
  return out
}
const base = { year: 2026, todayISO: '2026-09-03', categories, deXuatKhaiThue: false }

describe('tranFurusato — công thức NTA No.1155', () => {
  it('所得割 139.000, bậc 5%: 139.000 × 20% ÷ (90% − 5%×1,021) + 2.000 = 34.746', () => {
    // 27.800 ÷ 0,84895 = 32.746,3 → floor 32.746 + 2.000
    expect(tranFurusato(139_000, 0.05, LUAT_2026)).toBe(34_746)
  })
})

describe('tinhFurusato', () => {
  it('住民税 12 tháng 144.000 − 5.000 = 所得割 139.000; đã gửi 30.000 → còn 4.746 (bậc 5%)', () => {
    const r = tinhFurusato({ ...base, txs: [...phieu12(), tx({ category_id: 'fu', amount: 30_000 })], suatBien: 0.05 })
    expect(r.shotoku_wari).toBe(139_000)
    expect(r.tran).toBe(34_746)
    expect(r.da_gui).toBe(30_000)
    expect(r.con_lai).toBe(4_746)
    expect(r.ketLuan.trang_thai).toBe('du') // trước 1/10 và còn < 10.000 → không nhắc
  })
  it('từ 1/10 và còn ≥ 10.000 → thieu, hạn 31/12', () => {
    const r = tinhFurusato({ ...base, todayISO: '2026-10-02', txs: phieu12(), suatBien: 0.05 })
    expect(r.ketLuan.trang_thai).toBe('thieu')
    expect(r.ketLuan.han).toBe('2026-12-31')
  })
  it('thiếu 住民税 → thieu-du-lieu; thiếu suatBien → tran null', () => {
    expect(tinhFurusato({ ...base, txs: [], suatBien: 0.05 }).ketLuan.trang_thai).toBe('thieu-du-lieu')
    expect(tinhFurusato({ ...base, txs: phieu12(), suatBien: null }).tran).toBeNull()
  })
  it('chưa có danh mục furusato → co_danh_muc false, vẫn tính trần', () => {
    const r = tinhFurusato({ ...base, categories: categories.slice(0, 2), txs: phieu12(), suatBien: 0.05 })
    expect(r.co_danh_muc).toBe(false)
    expect(r.tran).toBe(34_746)
    expect(r.ketLuan.ly_do.join(' ')).toMatch(/danh mục/)
  })
  it('hoàn 住民税 (is_refund) trừ khỏi tổng', () => {
    const r = tinhFurusato({ ...base, txs: [...phieu12(), tx({ category_id: 'ju', amount: 24_000, is_refund: true, occurred_on: '2026-06-25' })], suatBien: 0.05 })
    expect(r.shotoku_wari).toBe(115_000)
  })
  it('đề xuất khai thuế cùng năm → onestop_rui_ro và câu việc đổi', () => {
    const r = tinhFurusato({ ...base, txs: [...phieu12(), tx({ category_id: 'fu', amount: 30_000 })], suatBien: 0.05, deXuatKhaiThue: true })
    expect(r.onestop_rui_ro).toBe(true)
    expect(r.ketLuan.viec).toMatch(/ワンストップ/)
  })
  it('năm cũ dùng 住民税 của chính năm đó', () => {
    const r = tinhFurusato({ ...base, year: 2025, txs: phieu12(), suatBien: 0.05 })
    expect(r.shotoku_wari).toBe(4 * 12_000 - 5_000) // 9..12/2025 = 4 tháng
  })
})
```

- [ ] **Step 5: Chạy thấy đỏ**, rồi tạo `furusato.ts`:

```ts
// Khoản ③ — Trần ふるさと納税 và cảnh báo ワンストップ.
//
// Trần tự chịu 2.000 = 住民税所得割 × 20% ÷ (90% − 所得税率 × 1,021) + 2.000 (NTA No.1155).
// 所得割 ≈ Σ住民税 12 tháng gần nhất − 均等割 5.000. Đây là 住民税 của THU NHẬP NĂM TRƯỚC
// (trừ từ 6/(Y+1) tới 5/(Y+2)) — mọi bộ mô phỏng furusato cũng ước như vậy, và phải nói ra.
//
// ワンストップ特例 vô hiệu toàn bộ khi nộp 確定申告 cùng năm → nếu khoản ①/② đề xuất khai thì
// câu việc ở đây đổi: phải khai lại mọi khoản furusato trong tờ khai đó.
// THUẦN: không React, không Date.
import { addMonthsISO, calendarYearOf, calendarYearRange } from '../../lib/dates'
import type { CategoryRow, TransactionRow } from '../../types/database.types'
import type { KetLuan } from './ketLuan'
import { luatChoNam, type LuatNam } from './rules/luat'

/** Tên danh mục chuẩn — tìm theo TÊN, cùng lối TAX_PARENT_NAME. */
export const FURUSATO_CATEGORY_NAME = 'ふるさと納税 (寄附)'
/** Tên hai danh mục thuế trên phiếu lương (phieu-luong/nhap.ts MAP_THUE + tax/categories.ts). */
export const SO_TAX_NAMES = { shotoku: 'Thuế thu nhập (所得税)', jumin: 'Thuế cư trú (住民税)' } as const
/** Dưới mức này thì "còn hạn mức" không đáng một dòng thông báo. */
export const FURUSATO_NHAC_TU = 10_000
/** Từ tháng này mới nhắc — trước đó còn hạn mức là chuyện của mọi tháng. */
export const THANG_NHAC_CUOI_NAM = 10

export interface FurusatoInput {
  year: number
  todayISO: string
  categories: CategoryRow[]
  txs: TransactionRow[]
  suatBien: number | null
  /** Khoản ①/② đang đề xuất nộp 確定申告 cho năm này. */
  deXuatKhaiThue: boolean
}

export interface FurusatoKetQua {
  ketLuan: KetLuan
  tran: number | null
  shotoku_wari: number | null
  da_gui: number
  con_lai: number | null
  co_danh_muc: boolean
  onestop_rui_ro: boolean
  /** Cửa sổ 住民税 đã dùng [start, end). */
  cua_so: { start: string; end: string }
}

export function tranFurusato(shotokuWari: number, suatBien: number, luat: LuatNam): number {
  const mau = 0.9 - suatBien * luat.phucHung
  return Math.floor((shotokuWari * luat.furusato.tyLeShotokuWari) / mau) + luat.furusato.tuChiu
}

function idsTheoTen(categories: CategoryRow[], name: string): Set<string> {
  return new Set(categories.filter((c) => c.type === 'expense' && c.name === name).map((c) => c.id))
}

/** Σ amount trong [start,end) của các danh mục, hoàn tiền trừ ra. */
function tong(txs: TransactionRow[], ids: Set<string>, start: string, end: string): { tong: number; so_lan: number } {
  let t = 0
  let n = 0
  for (const x of txs) {
    if (x.type !== 'expense' || x.category_id == null || !ids.has(x.category_id)) continue
    if (x.occurred_on < start || x.occurred_on >= end) continue
    t += x.is_refund ? -x.amount : x.amount
    n++
  }
  return { tong: t, so_lan: n }
}

export function tinhFurusato(input: FurusatoInput): FurusatoKetQua {
  const luat = luatChoNam(input.year)
  const namNay = calendarYearOf(input.todayISO)
  const nam = calendarYearRange(input.year)
  // Năm nay: 12 tháng gần nhất, tới hết hôm nay (end loại trừ = ngày mai). Năm cũ: đúng năm đó.
  const cua_so =
    input.year === namNay
      ? { start: addMonthsISO(input.todayISO, -12), end: addDaysISO(input.todayISO, 1) }
      : { start: nam.start, end: nam.end }

  const juminIds = idsTheoTen(input.categories, SO_TAX_NAMES.jumin)
  const furusatoIds = idsTheoTen(input.categories, FURUSATO_CATEGORY_NAME)
  const co_danh_muc = furusatoIds.size > 0

  const jumin = tong(input.txs, juminIds, cua_so.start, cua_so.end)
  const shotoku_wari = jumin.so_lan === 0 ? null : Math.max(0, jumin.tong - luat.jumin.kinhToDan)
  const tran = shotoku_wari === null || input.suatBien === null ? null : tranFurusato(shotoku_wari, input.suatBien, luat)
  const da_gui = tong(input.txs, furusatoIds, nam.start, nam.end).tong
  const con_lai = tran === null ? null : Math.max(0, tran - da_gui)
  const onestop_rui_ro = input.deXuatKhaiThue && da_gui > 0

  const ly_do = [
    'Trần ước từ 住民税 trên phiếu lương 12 tháng gần nhất, tức thu nhập NĂM TRƯỚC; lương tăng thì trần thật cao hơn.',
  ]
  if (!co_danh_muc) ly_do.push(`Chưa có danh mục "${FURUSATO_CATEGORY_NAME}" nên không đếm được đã gửi bao nhiêu.`)
  if (input.suatBien === null) ly_do.push('Chưa ước được thuế suất (thiếu phiếu lương 所得税).')

  const thang = Number(input.todayISO.slice(5, 7))
  const muaNhac = input.year === namNay && thang >= THANG_NHAC_CUOI_NAM
  let trang_thai: KetLuan['trang_thai']
  let viec: string
  if (shotoku_wari === null) {
    trang_thai = 'thieu-du-lieu'
    viec = 'Nhập phiếu lương (住民税) để ước trần ふるさと納税'
  } else if (onestop_rui_ro) {
    trang_thai = 'thieu'
    viec = `Nếu nộp 確定申告 cho khoản phụ thuộc thì khai cả ¥${da_gui.toLocaleString('vi-VN')} furusato vào đó — ワンストップ sẽ vô hiệu`
  } else if (tran === null) {
    trang_thai = 'thieu-du-lieu'
    viec = 'Nhập phiếu lương (所得税) để ước trần ふるさと納税'
  } else if (muaNhac && con_lai !== null && con_lai >= FURUSATO_NHAC_TU) {
    trang_thai = 'thieu'
    viec = `Còn ≈ ¥${con_lai.toLocaleString('vi-VN')} furusato chưa dùng · hết 31/12`
  } else if (input.year < namNay) {
    trang_thai = 'het-han'
    viec = `Năm ${input.year} đã gửi ¥${da_gui.toLocaleString('vi-VN')} trên trần ≈ ¥${tran.toLocaleString('vi-VN')}`
  } else {
    trang_thai = 'du'
    viec = `Trần ≈ ¥${tran.toLocaleString('vi-VN')} · đã gửi ¥${da_gui.toLocaleString('vi-VN')}`
  }

  return {
    ketLuan: {
      id: 'furusato',
      year: input.year,
      trang_thai,
      muc: onestop_rui_ro ? 'high' : 'low',
      tiet_kiem_uoc: null,
      han: input.year === namNay ? `${input.year}-12-31` : null,
      viec,
      ly_do,
    },
    tran,
    shotoku_wari,
    da_gui,
    con_lai,
    co_danh_muc,
    onestop_rui_ro,
    cua_so,
  }
}
```

Import của file: `import { addDaysISO, addMonthsISO, calendarYearOf, calendarYearRange } from '../../lib/dates'`.

- [ ] **Step 6: Chạy** `npx vitest run src/features/quyen-loi/furusato.test.ts` → PASS. Kiểm bằng tay số 34.746: `139000 × 0.2 = 27800`; `0.9 − 0.05 × 1.021 = 0.84895`; `27800 / 0.84895 = 32746.33` → floor 32746 + 2000.

- [ ] **Step 7: Test `shelterYearEnd.test.ts`**:

```ts
import { describe, expect, it } from 'vitest'
import type { AccountRow, TransactionRow } from '../../types/database.types'
import { tinhShelterYearEnd } from './shelterYearEnd'

const acc = (p: Partial<AccountRow>): AccountRow =>
  ({ id: 'n', name: 'NISA', type: 'investment', currency: 'JPY', tax_shelter: 'nisa_tsumitate', shelter_annual_limit: 1_200_000, is_archived: false, ...p }) as AccountRow
const nap = (amount: number, on: string): TransactionRow =>
  ({ id: on, user_id: 'u', type: 'transfer', amount, to_amount: null, category_id: null, account_id: 'bank', to_account_id: 'n', recurring_rule_id: null, occurred_on: on, note: '', created_at: '', updated_at: '' }) as TransactionRow

describe('tinhShelterYearEnd', () => {
  it('trước 1/10 im (du), vẫn trả từng tài khoản', () => {
    const r = tinhShelterYearEnd({ year: 2026, todayISO: '2026-09-03', accounts: [acc({})], txs: [nap(100_000, '2026-02-01')] })
    expect(r.tai_khoan[0]).toMatchObject({ used: 100_000, remaining: 1_100_000 })
    expect(r.ketLuan.trang_thai).toBe('du')
  })
  it('từ 1/10 còn hạn mức → thieu, câu có tổng còn lại', () => {
    const r = tinhShelterYearEnd({ year: 2026, todayISO: '2026-10-01', accounts: [acc({}), acc({ id: 'g', name: 'Growth', tax_shelter: 'nisa_growth', shelter_annual_limit: 2_400_000 })], txs: [nap(100_000, '2026-02-01')] })
    expect(r.ketLuan.trang_thai).toBe('thieu')
    expect(r.con_lai).toBe(1_100_000 + 2_400_000)
    expect(r.ketLuan.viec).toContain('3.500.000')
  })
  it('không tài khoản NISA/iDeCo → thieu-du-lieu', () => {
    const r = tinhShelterYearEnd({ year: 2026, todayISO: '2026-10-01', accounts: [acc({ tax_shelter: null })], txs: [] })
    expect(r.ketLuan.trang_thai).toBe('thieu-du-lieu')
  })
  it('chưa đặt hạn mức → remaining null, không cộng vào con_lai, có lý do', () => {
    const r = tinhShelterYearEnd({ year: 2026, todayISO: '2026-10-01', accounts: [acc({ shelter_annual_limit: null })], txs: [] })
    expect(r.tai_khoan[0].remaining).toBeNull()
    expect(r.ketLuan.ly_do.join(' ')).toMatch(/hạn mức/)
  })
})
```

- [ ] **Step 8: Tạo `shelterYearEnd.ts`**:

```ts
// Khoản ④ — Phần hạn mức NISA/iDeCo chưa dùng, nhắc từ 1/10.
//
// KHÔNG tính lại gì: `shelterUsage` (features/assets/shelter.ts) đã tính "đã nạp / còn lại"
// theo năm dương lịch cho trang chi tiết tài khoản. Ở đây chỉ đóng gói thành KetLuan và
// chỉ lên tiếng cuối năm — trước đó "còn 2.000.000 hạn mức" là chuyện của mọi tháng.
// THUẦN: không React, không Date.
import { shelterUsage } from '../assets/shelter'
import type { AccountRow, TransactionRow } from '../../types/database.types'
import { calendarYearOf } from '../../lib/dates'
import type { KetLuan } from './ketLuan'
import { THANG_NHAC_CUOI_NAM } from './furusato'

export interface ShelterInput {
  year: number
  todayISO: string
  accounts: AccountRow[]
  /** Giao dịch bất kỳ có chuyển khoản vào tài khoản NISA/iDeCo; shelterUsage tự lọc. */
  txs: TransactionRow[]
}

export interface ShelterTaiKhoan {
  id: string
  name: string
  loai: NonNullable<AccountRow['tax_shelter']>
  used: number
  limit: number | null
  remaining: number | null
}

export interface ShelterKetQua {
  ketLuan: KetLuan
  tai_khoan: ShelterTaiKhoan[]
  /** Σ remaining của tài khoản CÓ hạn mức. */
  con_lai: number
}

export function tinhShelterYearEnd(input: ShelterInput): ShelterKetQua {
  const tai_khoan: ShelterTaiKhoan[] = input.accounts
    .filter((a) => a.tax_shelter != null && !a.is_archived)
    .map((a) => {
      const u = shelterUsage(a.id, input.txs, input.year, a.shelter_annual_limit)
      return { id: a.id, name: a.name, loai: a.tax_shelter!, used: u.used, limit: u.limit, remaining: u.remaining }
    })
  const con_lai = tai_khoan.reduce((s, t) => s + (t.remaining ?? 0), 0)
  const namNay = calendarYearOf(input.todayISO)
  const muaNhac = input.year === namNay && Number(input.todayISO.slice(5, 7)) >= THANG_NHAC_CUOI_NAM
  const ly_do = ['Hạn mức NISA không dùng là mất, không dồn sang năm sau (金融庁).']
  if (tai_khoan.some((t) => t.limit === null)) ly_do.push('Có tài khoản chưa đặt hạn mức năm — sửa ở Cài đặt › Tài khoản.')

  let trang_thai: KetLuan['trang_thai'] = 'du'
  let viec = `Đã nạp ${tai_khoan.length} tài khoản ưu đãi thuế năm nay`
  if (tai_khoan.length === 0) {
    trang_thai = 'thieu-du-lieu'
    viec = 'Chưa tài khoản nào được đánh dấu NISA/iDeCo'
  } else if (muaNhac && con_lai > 0) {
    trang_thai = 'thieu'
    viec = `Còn ¥${con_lai.toLocaleString('vi-VN')} hạn mức NISA/iDeCo chưa dùng · hết 31/12`
  }
  return {
    ketLuan: { id: 'shelter', year: input.year, trang_thai, muc: 'low', tiet_kiem_uoc: null, han: `${input.year}-12-31`, viec, ly_do },
    tai_khoan,
    con_lai,
  }
}
```

- [ ] **Step 9: Chạy** `npx vitest run src/features/quyen-loi/shelterYearEnd.test.ts` → PASS.

- [ ] **Step 10: Hàm gom `quyenLoi.ts`** với test bất biến — `quyenLoi.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { AccountRow, CategoryRow, RelativeRow, TransactionRow } from '../../types/database.types'
import { remittanceStats } from '../remittance/aggregate'
import { tinhQuyenLoi, type QuyenLoiInput } from './quyenLoi'

let seq = 0
const tx = (p: Partial<TransactionRow>): TransactionRow => ({
  id: `t${seq++}`, user_id: 'u', type: 'expense', amount: 30_500, to_amount: null, category_id: null, account_id: 'jpy',
  to_account_id: null, recurring_rule_id: null, occurred_on: '2026-03-01', note: '', created_at: '', updated_at: '',
  is_remittance: true, remit_fee_jpy: 500, ...p,
})
const me: RelativeRow = { id: 'me', user_id: 'u', name: 'Mẹ', birth_year: 1956, relationship: 'parent', country: 'VN', is_archived: false, sort_order: 0, created_at: '' }
const accounts = [{ id: 'jpy', name: 'Bank', currency: 'JPY', tax_shelter: null, shelter_annual_limit: null, is_archived: false }] as AccountRow[]
const categories: CategoryRow[] = []
function input(p: Partial<QuyenLoiInput>): QuyenLoiInput {
  return { year: 2026, todayISO: '2026-09-03', relatives: [me], txs: [], categories, accounts, base: 'JPY', rates: {}, fuyoClaimedYears: [], ...p }
}

describe('tinhQuyenLoi', () => {
  it('trả 5 kết luận theo thứ tự fuyo, remit-unassigned, refund, furusato, shelter', () => {
    const r = tinhQuyenLoi(input({}))
    expect(r.ketLuan.map((k) => k.id)).toEqual(['fuyo', 'remit-unassigned', 'refund', 'furusato', 'shelter'])
  })
  it('remit-unassigned: thieu khi có lần chưa gán trong năm, du khi không', () => {
    expect(tinhQuyenLoi(input({ txs: [tx({})] })).ketLuan[1].trang_thai).toBe('thieu')
    expect(tinhQuyenLoi(input({ txs: [tx({ remit_recipient_id: 'me' })] })).ketLuan[1].trang_thai).toBe('du')
  })
  it('BẤT BIẾN: Σ đã gửi theo người + tổng chưa gán = totalSentJpy của remittance/aggregate (cùng năm)', () => {
    const txs = [tx({ remit_recipient_id: 'me' }), tx({ amount: 50_500 }), tx({ remit_recipient_id: 'me', amount: 20_000, remit_fee_jpy: 0 })]
    const r = tinhQuyenLoi(input({ txs }))
    const tongTheoApp = r.fuyo.nguoi.reduce((s, n) => s + n.da_gui, 0) + r.fuyo.chua_gan.tong
    expect(tongTheoApp).toBe(remittanceStats(txs).totalSentJpy)
  })
  it('suatBien suy từ Σ所得税 12 tháng; thiếu thì null và fuyo không có tiền', () => {
    const r = tinhQuyenLoi(input({ txs: [tx({ remit_recipient_id: 'me' })] }))
    expect(r.suatBien).toBeNull()
    expect(r.fuyo.ketLuan.tiet_kiem_uoc).toBeNull()
  })
  it('furusato nhận deXuatKhaiThue khi refund có năm', () => {
    const r = tinhQuyenLoi(input({ txs: [tx({ remit_recipient_id: 'me', occurred_on: '2024-05-01' })] }))
    // mẹ 68 tuổi năm 2024 → cần 38万 → không đủ → refund rỗng → không đề xuất
    expect(r.refund.nam).toHaveLength(0)
    expect(r.furusato.onestop_rui_ro).toBe(false)
  })
})
```

- [ ] **Step 11: Tạo `quyenLoi.ts`**:

```ts
// Gom bốn bộ kiểm thành một kết quả — chạy ở HAI nơi với cùng đầu vào: hook useQuyenLoi
// (trình duyệt) và loadInput.ts của edge function push (qua serverBundle). Nhờ vậy chuông và
// push không bao giờ nói khác nhau về cùng một khoản.
//
// Thứ tự trong `ketLuan`: theo TIỀN, không theo độ dễ code (spec "Quyết định đã chốt").
// THUẦN: không React, không Date.
import { addMonthsISO, calendarYearOf } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/currencies'
import type { Rates } from '../../lib/rates'
import type { AccountRow, CategoryRow, RelativeRow, TransactionRow } from '../../types/database.types'
import { tinhFuyo, type FuyoKetQua } from './fuyo'
import { SO_TAX_NAMES, tinhFurusato, type FurusatoKetQua } from './furusato'
import type { KetLuan } from './ketLuan'
import { suatBienTuThue } from './marginalRate'
import { tinhRefund, type RefundKetQua } from './refund'
import { luatChoNam } from './rules/luat'
import { tinhShelterYearEnd, type ShelterKetQua } from './shelterYearEnd'

export interface QuyenLoiInput {
  year: number
  todayISO: string
  relatives: RelativeRow[]
  /** Kết quả của repo.listBenefitTransactions cho [year−5, year+1). */
  txs: TransactionRow[]
  categories: CategoryRow[]
  accounts: AccountRow[]
  base: CurrencyCode
  rates: Rates
  fuyoClaimedYears: number[]
}

export interface QuyenLoiKetQua {
  fuyo: FuyoKetQua
  refund: RefundKetQua
  furusato: FurusatoKetQua
  shelter: ShelterKetQua
  /** 5 kết luận, thứ tự cố định — bộ luật thông báo và khung Bản tin đọc mảng này. */
  ketLuan: KetLuan[]
  suatBien: number | null
  /** Số tháng có phiếu 所得税 trong cửa sổ 12 tháng — < 12 thì suatBien null. */
  thangCoPhieu: number
}

/** Σ所得税 12 tháng gần nhất và số tháng có phiếu. */
export function thueThuNhap12Thang(txs: TransactionRow[], categories: CategoryRow[], todayISO: string) {
  const ids = new Set(categories.filter((c) => c.type === 'expense' && c.name === SO_TAX_NAMES.shotoku).map((c) => c.id))
  const start = addMonthsISO(todayISO, -12)
  const thang = new Set<string>()
  let tong = 0
  for (const t of txs) {
    if (t.type !== 'expense' || t.category_id == null || !ids.has(t.category_id)) continue
    if (t.occurred_on < start || t.occurred_on > todayISO) continue
    tong += t.is_refund ? -t.amount : t.amount
    thang.add(t.occurred_on.slice(0, 7))
  }
  return { tong, thangCoPhieu: thang.size }
}

export function tinhQuyenLoi(input: QuyenLoiInput): QuyenLoiKetQua {
  const luat = luatChoNam(calendarYearOf(input.todayISO))
  const thue = thueThuNhap12Thang(input.txs, input.categories, input.todayISO)
  const suatBien = thue.thangCoPhieu >= 12 ? suatBienTuThue(thue.tong, luat) : null

  const chung = { todayISO: input.todayISO, relatives: input.relatives, txs: input.txs, accounts: input.accounts, base: input.base, rates: input.rates, suatBien }
  const fuyo = tinhFuyo({ ...chung, year: input.year })
  const refund = tinhRefund({ ...chung, fuyoClaimedYears: input.fuyoClaimedYears })
  const deXuatKhaiThue = refund.nam.length > 0 && input.year === calendarYearOf(input.todayISO)
  const furusato = tinhFurusato({ year: input.year, todayISO: input.todayISO, categories: input.categories, txs: input.txs, suatBien, deXuatKhaiThue })
  const shelter = tinhShelterYearEnd({ year: input.year, todayISO: input.todayISO, accounts: input.accounts, txs: input.txs })

  const chuaGan: KetLuan = {
    id: 'remit-unassigned',
    year: input.year,
    trang_thai: fuyo.chua_gan.so_lan > 0 ? 'thieu' : 'du',
    muc: 'low',
    tiet_kiem_uoc: null,
    han: null,
    viec: fuyo.chua_gan.so_lan > 0 ? `${fuyo.chua_gan.so_lan} lần gửi tiền chưa gán người nhận` : 'Mọi lần gửi đã có người nhận',
    ly_do: ['Chưa gán thì khấu trừ người phụ thuộc đang tính thiếu.'],
  }

  return {
    fuyo,
    refund,
    furusato,
    shelter,
    ketLuan: [fuyo.ketLuan, chuaGan, refund.ketLuan, furusato.ketLuan, shelter.ketLuan],
    suatBien,
    thangCoPhieu: thue.thangCoPhieu,
  }
}
```

- [ ] **Step 12: Chạy** `npx vitest run src/features/quyen-loi` → PASS; `npx tsc -b --noEmit` sạch. Thêm `'features/quyen-loi/quyenLoi.ts'` vào `ENTRY_POINTS` của `src/features/notifications/purity.test.ts` (Task 11 sẽ đưa nó vào đồ thị của bộ luật; thêm ngay để `walk()` canh từ bây giờ — `lib/rates.ts` chỉ đụng `localStorage` bên trong hàm `readRatesMeta`, không ở cấp module, nhưng nếu phép quét cả file báo đỏ thì đưa `lib/rates.ts` vào `WHOLE_FILE_EXEMPT` với lý do "chỉ đọc cache trong hàm, không ở cấp module" — đúng cách file đó đang miễn trừ các file tương tự). Chạy `npx vitest run src/features/notifications/purity.test.ts` → PASS.

- [ ] **Step 13: Commit**

```bash
git add src/features/quyen-loi src/features/notifications/purity.test.ts
git commit -m "feat(quyen-loi): bo kiem hoan thue 5 nam, tran furusato + canh bao onestop, NISA cuoi nam; ham gom tinhQuyenLoi"
```

---

### Task 5: Hook `useQuyenLoi` — gom dữ liệu, gọi `tinhQuyenLoi`

**Files:**
- Create: `src/features/quyen-loi/useQuyenLoi.ts`

**Interfaces:**
- Consumes: `useRelatives`, `useBenefitTransactions`, `useAccounts`, `useCategories`, `useProfile`, `useRates` (queries.ts); `taxCategoryIds` (features/tax/categories); `tinhQuyenLoi`, `FURUSATO_CATEGORY_NAME`
- Produces: `useQuyenLoi(year: number, todayISO: string, enabled = true): { ketQua: QuyenLoiKetQua | undefined; isReady: boolean; isError: boolean; furusatoCategoryId: string | null }`

- [ ] **Step 1: Tạo hook** — mọi thứ React nằm đây, phép tính ở `quyenLoi.ts`:

```ts
// Gom dữ liệu cho màn Quyền lợi, khung Bản tin và bộ luật thông báo → tinhQuyenLoi().
//
// MỘT truy vấn giao dịch (listBenefitTransactions, OR ba nhánh) cho cửa sổ [year−5, year+1):
// lần gửi tiền (~12/năm), khoản thuế trên phiếu lương (~24/năm), nạp NISA/iDeCo. Hook này
// chạy trong useNotifications ở MỌI màn, nên không được kéo cả năm giao dịch.
//
// `todayISO` truyền vào, không đọc đồng hồ ở đây: useNotifications đã đọc một lần và
// mọi luật phải cùng một "hôm nay" (hai lần đọc có thể rơi hai bên nửa đêm).
import { useMemo } from 'react'
import {
  useAccounts,
  useBenefitTransactions,
  useCategories,
  useProfile,
  useRates,
  useRelatives,
} from '../../hooks/queries'
import { taxCategoryIds } from '../tax/categories'
import { FURUSATO_CATEGORY_NAME } from './furusato'
import { tinhQuyenLoi, type QuyenLoiKetQua } from './quyenLoi'
import { SO_NAM_HOAN_THUE } from './refund'

const EMPTY: never[] = []

export interface UseQuyenLoiResult {
  ketQua: QuyenLoiKetQua | undefined
  /** Mọi query đã thành công → ketQua là số thật, không phải số của dữ liệu nửa chừng. */
  isReady: boolean
  isError: boolean
  furusatoCategoryId: string | null
}

export function useQuyenLoi(year: number, todayISO: string, enabled = true): UseQuyenLoiResult {
  const { data: profile } = useProfile()
  const { base, rates, isSuccess: ratesOk } = useRates()
  const relativesQ = useRelatives()
  const accountsQ = useAccounts()
  const categoriesQ = useCategories()
  const accounts = accountsQ.data ?? EMPTY
  const categories = categoriesQ.data ?? EMPTY

  const filter = useMemo(() => {
    const ids = [...taxCategoryIds(categories)]
    const fu = categories.find((c) => c.type === 'expense' && c.name === FURUSATO_CATEGORY_NAME)
    if (fu) ids.push(fu.id)
    return {
      categoryIds: ids.sort(),
      toAccountIds: accounts.filter((a) => a.tax_shelter != null).map((a) => a.id).sort(),
    }
  }, [categories, accounts])
  const range = useMemo(
    () => ({ start: `${year - SO_NAM_HOAN_THUE}-01-01`, end: `${year + 1}-01-01` }),
    [year],
  )
  const txsQ = useBenefitTransactions(range, filter, enabled && !!profile && categoriesQ.isSuccess && accountsQ.isSuccess)

  const furusatoCategoryId =
    categories.find((c) => c.type === 'expense' && c.name === FURUSATO_CATEGORY_NAME)?.id ?? null

  const isReady =
    !!profile && ratesOk && relativesQ.isSuccess && accountsQ.isSuccess && categoriesQ.isSuccess && txsQ.isSuccess
  const isError = relativesQ.isError || accountsQ.isError || categoriesQ.isError || txsQ.isError

  const ketQua = useMemo(() => {
    if (!isReady || !profile) return undefined
    return tinhQuyenLoi({
      year,
      todayISO,
      relatives: relativesQ.data ?? EMPTY,
      txs: txsQ.data ?? EMPTY,
      categories,
      accounts,
      base,
      rates: rates ?? {},
      fuyoClaimedYears: profile.fuyo_claimed_years ?? [],
    })
  }, [isReady, profile, year, todayISO, relativesQ.data, txsQ.data, categories, accounts, base, rates])

  return { ketQua, isReady, isError, furusatoCategoryId }
}
```

`profile.fuyo_claimed_years ?? []`: bản demo cũ trong localStorage không có trường này (cột mới), cùng lối `kikin_give_rate_bps` đã làm.

- [ ] **Step 2: Kiểm kiểu** — `npx tsc -b --noEmit` sạch. Không có test riêng: hook chỉ nối query, phần tính đã test ở Task 4.

- [ ] **Step 3: Commit**

```bash
git add src/features/quyen-loi/useQuyenLoi.ts
git commit -m "feat(quyen-loi): hook useQuyenLoi - mot truy van OR cho 6 nam, goi tinhQuyenLoi"
```

---

### Task 6: Ô "Gửi cho" trong form gửi tiền

**Files:**
- Modify: `src/features/transactions/entryRoles.ts` (`RemitValue`, `initialRemit`)
- Modify: `src/features/transactions/roleFields.tsx` (`RemitFields`, dòng 649–790)
- Modify: `src/features/transactions/roleSave.ts` (`saveRemit`, dòng 587–642), `roleSave.test.ts`
- Modify: `src/features/transactions/TransactionForm.tsx` (dòng ~349, ~471, ~1503)

**Interfaces:**
- Produces: `RemitValue.recipientId: string` ('' = chưa chọn), `RemitFields` nhận thêm `relatives: RelativeRow[]` và `onAddRelative: () => void`
- Consumes: `useRelatives` (Task 2), `NguoiThanSheet` (Task 7 — ở task này chỉ nối callback; mở sheet gắn ở Task 7)

- [ ] **Step 1: Chạy `impact({target: "saveRemit", direction: "upstream"})` và `impact({target: "RemitFields", direction: "upstream"})`** — báo kết quả (kỳ vọng LOW / CRITICAL-theo-index như bảng đầu kế hoạch). Thay đổi dưới đây chỉ thêm trường, không đổi hành vi cũ.

- [ ] **Step 2: Test `roleSave.test.ts`** — thêm vào khối test `saveRemit` đang có (đọc cách file dựng `deps` giả):

```ts
  it('ghi remit_recipient_id khi có, null khi chưa chọn', async () => {
    const { deps, calls } = makeDeps([], [cat('c1', 'Gửi tiền về VN')])
    await saveRemit(base, { ...initialRemit(), recipientId: 'me' }, deps)
    await saveRemit(base, { ...initialRemit(), recipientId: '' }, deps)
    expect(calls.createTransaction[0].remit_recipient_id).toBe('me')
    expect(calls.createTransaction[1].remit_recipient_id).toBeNull()
  })
```

(`makeDeps`, `base`, `cat` là fixture sẵn có trong `roleSave.test.ts` dòng 25, 74, 304; `initialRemit` import từ `./entryRoles`.)

- [ ] **Step 3: Chạy thấy đỏ** — `npx vitest run src/features/transactions/roleSave.test.ts` (lỗi kiểu: `recipientId` không có trong `RemitValue`).

- [ ] **Step 4: `entryRoles.ts`** — thêm vào `RemitValue`:

```ts
  /** Người thân nhận (relatives.id); '' = chưa chọn → ghi null. */
  recipientId: string
```

và `initialRemit`: `recipientId: ''`.

- [ ] **Step 5: `roleSave.ts`** — trong `saveRemit`, cả hai nhánh `input = {...}` thêm sau `remit_received_vnd`:

```ts
      remit_recipient_id: v.recipientId || null,
```

- [ ] **Step 6: Chạy** `npx vitest run src/features/transactions/roleSave.test.ts` → PASS.

- [ ] **Step 7: `roleFields.tsx` — `RemitFields`** thêm hai prop và một ô chọn. Props:

```ts
  /** Người thân để chọn "Gửi cho" (đã lọc is_archived). */
  relatives: RelativeRow[]
  /** Mở sheet thêm người thân nhanh. */
  onAddRelative: () => void
```

Đặt ô ngay **đầu** khối `remit` (trước nhánh `value.kind === 'transfer'`), vì "gửi cho ai" là câu hỏi đầu tiên của một lần gửi:

```tsx
      <div>
        <label htmlFor={`${uid}-nguoi`} className={labelCls}>
          Gửi cho
        </label>
        <div className="flex items-center gap-2">
          <Select
            id={`${uid}-nguoi`}
            value={value.recipientId}
            onChange={(e) => onChange({ ...value, recipientId: e.target.value })}
            wrapClassName="min-w-0 flex-1"
          >
            <option value="">— chưa chọn —</option>
            {relatives.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <ActionButton variant="outline" onClick={onAddRelative} aria-label="Thêm người thân">
            <Plus className="h-4 w-4" /> Người
          </ActionButton>
        </div>
        {/* Vì sao hỏi ở đây: khấu trừ người phụ thuộc tính RIÊNG từng người (NTA No.1180). */}
      </div>
```

Import `ActionButton` từ `'../../components/ui'` (file đã import `Select` từ đó), `Plus` từ `lucide-react`, `RelativeRow` type.

- [ ] **Step 8: `TransactionForm.tsx`** — nối dữ liệu và mặc định "người của lần gửi gần nhất":

Sau dòng `const { data: remitTxs = [] } = useRangeTransactions(remitStripRange, remitLike)` (dòng ~471):

```ts
  const { data: relatives = [] } = useRelatives()
  const relativesActive = useMemo(() => relatives.filter((r) => !r.is_archived), [relatives])
  const [relativeSheet, setRelativeSheet] = useState(false)
  // Mặc định = người của lần gửi GẦN NHẤT — người gửi đều cho một người thì không phải
  // bấm thêm gì (nguyên tắc dưới 5 giây). Chỉ điền khi ô còn trống, không đạp lên lựa chọn.
  const lastRecipientId = useMemo(() => {
    const last = remitTxs
      .filter((t) => t.is_remittance && t.remit_recipient_id)
      .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))[0]
    return last?.remit_recipient_id ?? ''
  }, [remitTxs])
  useEffect(() => {
    if (remitLike && remitVal.recipientId === '' && lastRecipientId) {
      setRemitVal((v) => ({ ...v, recipientId: lastRecipientId }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remitLike, lastRecipientId])
```

Trong JSX `<RemitFields …>` thêm `relatives={relativesActive}` và `onAddRelative={() => setRelativeSheet(true)}`. Thêm `useRelatives` vào import từ `../../hooks/queries`. Cuối JSX của form (cạnh các sheet khác đang render): 

```tsx
      {relativeSheet && (
        <NguoiThanSheet
          relative={null}
          onClose={() => setRelativeSheet(false)}
          onSaved={(r) => setRemitVal((v) => ({ ...v, recipientId: r.id }))}
        />
      )}
```

`NguoiThanSheet` tạo ở Task 7 — ở task này **tạm import** từ `'../quyen-loi/NguoiThanSheet'`; nếu thi công task 6 trước task 7 thì để dòng `useState(false)` và bỏ khối JSX, thêm lại ở Task 7. Thứ tự khuyến nghị: làm Task 7 (sheet) TRƯỚC, rồi Task 6.

- [ ] **Step 9: Kiểm** — `npx tsc -b --noEmit`; `npm test` (designSystem: `<Select>`/`<ActionButton>` đúng primitive). Mở app demo (`npm run dev`), Nhập → dạng "Hỗ trợ gia đình": ô "Gửi cho" hiện hai người thân, mặc định là người của lần gửi gần nhất (Mẹ). Lưu một khoản, kiểm trong Sổ.

- [ ] **Step 10: Commit**

```bash
git add src/features/transactions
git commit -m "feat(gui-tien): o Gui cho trong form gui tien - mac dinh nguoi cua lan gui gan nhat"
```

---

### Task 7: Hai sheet — thêm/sửa người thân, gán người nhận hàng loạt

**Files:**
- Create: `src/features/quyen-loi/NguoiThanSheet.tsx`, `src/features/quyen-loi/GanNguoiNhanSheet.tsx`

**Interfaces:**
- Consumes: `useCreateRelative`, `useUpdateRelative`, `useUpdateTransaction` (queries.ts); `useEscClose`; `showToast` (lib/dialog); `formatDateLabel` (lib/dates)
- Produces: `<NguoiThanSheet relative={RelativeRow | null} onClose onSaved?(r: RelativeRow) />`, `<GanNguoiNhanSheet txs={TransactionRow[]} relatives={RelativeRow[]} onClose />`

- [ ] **Step 1: `NguoiThanSheet.tsx`** — theo khuôn `PlannedFormSheet` (lớp phủ `fixed inset-0`, hộp `max-w-md`):

```tsx
// Thêm / sửa một người thân nhận tiền. Ba ô: tên, năm sinh, quan hệ. Năm sinh BẮT BUỘC —
// tuổi quyết định ngưỡng 38万 và mức khấu trừ, không có thì bộ kiểm không nói được gì.
import { useState } from 'react'
import { ActionButton, SectionTitle, Select } from '../../components/ui'
import { Guide } from '../../components/Guide'
import { useEscClose } from '../../hooks/useEscClose'
import { useCreateRelative, useUpdateRelative } from '../../hooks/queries'
import { showToast } from '../../lib/dialog'
import type { RelativeRow, Relationship } from '../../types/database.types'

export const QUAN_HE: readonly (readonly [Relationship, string])[] = [
  ['parent', 'Cha / mẹ'],
  ['spouse', 'Vợ / chồng'],
  ['child', 'Con'],
  ['sibling', 'Anh / chị / em'],
  ['grandparent', 'Ông / bà'],
  ['other', 'Người thân khác'],
]

interface Props {
  /** null = thêm mới */
  relative: RelativeRow | null
  onClose: () => void
  /** Gọi sau khi lưu xong (form gửi tiền dùng để chọn luôn người vừa thêm). */
  onSaved?: (r: RelativeRow) => void
}

export function NguoiThanSheet({ relative, onClose, onSaved }: Props) {
  useEscClose(onClose)
  const create = useCreateRelative()
  const update = useUpdateRelative()
  const [name, setName] = useState(relative?.name ?? '')
  const [birthYear, setBirthYear] = useState(relative ? String(relative.birth_year) : '')
  const [relationship, setRelationship] = useState<Relationship>(relative?.relationship ?? 'parent')
  const [country, setCountry] = useState<'VN' | 'JP'>(relative?.country === 'JP' ? 'JP' : 'VN')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nam = Number(birthYear)
  const canSave = name.trim().length > 0 && Number.isInteger(nam) && nam >= 1900 && nam <= 2100 && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const input = { name: name.trim(), birth_year: nam, relationship, country }
      const row = relative
        ? await update.mutateAsync({ id: relative.id, patch: input })
        : await create.mutateAsync(input)
      showToast(relative ? 'Đã sửa người thân' : 'Đã thêm người thân')
      onSaved?.(row)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lưu thất bại, thử lại.')
      setSaving(false)
    }
  }

  async function handleArchive() {
    if (!relative) return
    try {
      await update.mutateAsync({ id: relative.id, patch: { is_archived: !relative.is_archived } })
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Thao tác thất bại, thử lại.', 'error')
    }
  }

  const labelCls = 'mb-1 block text-sm font-medium text-fg-muted'
  const inputCls =
    'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent'

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle role="block" className="mb-3">
          {relative ? 'Sửa người thân' : 'Thêm người thân'}
        </SectionTitle>
        <Guide className="mb-3 text-sm text-fg-muted">
          Khấu trừ người phụ thuộc tính riêng từng người, theo tuổi tại 31/12 — nên cần năm sinh.
        </Guide>

        <label className={labelCls} htmlFor="nt-name">Tên gọi</label>
        <input id="nt-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mẹ, Em Hùng…" />

        <label className={`${labelCls} mt-3`} htmlFor="nt-year">Năm sinh</label>
        <input id="nt-year" className={inputCls} inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1958" />

        <label className={`${labelCls} mt-3`} htmlFor="nt-rel">Quan hệ</label>
        <Select id="nt-rel" value={relationship} onChange={(e) => setRelationship(e.target.value as Relationship)} wrapClassName="w-full">
          {QUAN_HE.map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </Select>

        <label className={`${labelCls} mt-3`} htmlFor="nt-country">Đang sống ở</label>
        <Select id="nt-country" value={country} onChange={(e) => setCountry(e.target.value as 'VN' | 'JP')} wrapClassName="w-full">
          <option value="VN">Việt Nam (ngoài Nhật)</option>
          <option value="JP">Nhật — ngoài phạm vi khấu trừ này</option>
        </Select>

        {error && <p className="mt-3 text-sm text-state-danger-fg">{error}</p>}

        <div className="mt-4 flex items-center justify-between gap-2">
          {relative ? (
            <ActionButton variant="outline" onClick={handleArchive}>
              {relative.is_archived ? 'Hiện lại' : 'Ẩn người này'}
            </ActionButton>
          ) : <span />}
          <div className="flex gap-2">
            <ActionButton variant="outline" onClick={onClose}>Đóng</ActionButton>
            <ActionButton variant="primary" onClick={handleSave} disabled={!canSave}>Lưu</ActionButton>
          </div>
        </div>
      </div>
    </div>
  )
}
```

Kiểm tên lớp `inputCls` với ô `<input>` của `PlannedFormSheet` (dòng ~115) — **chép đúng chuỗi lớp file đó đang dùng**, không tự đặt màu/bán kính mới (guardrail).

- [ ] **Step 2: `GanNguoiNhanSheet.tsx`** — liệt kê lần gửi chưa gán, chọn nhiều dòng, chọn người, ghi qua `updateTransaction` từng dòng (≤ vài chục dòng, không cần method mới):

```tsx
// Gán người nhận cho các lần gửi cũ. Hiện GHI CHÚ nguyên văn ("gửi mẹ") để người dùng gán
// nhanh — KHÔNG tự khớp tên bằng máy: đoán sai một người là khấu trừ đi nhầm người.
import { useMemo, useState } from 'react'
import { ActionButton, Money, SectionTitle, Select } from '../../components/ui'
import { useEscClose } from '../../hooks/useEscClose'
import { useAccounts, useUpdateTransaction } from '../../hooks/queries'
import { formatDateLabel } from '../../lib/dates'
import { showToast } from '../../lib/dialog'
import type { RelativeRow, TransactionRow } from '../../types/database.types'

interface Props {
  /** Lần gửi CHƯA gán (is_remittance, remit_recipient_id null) của năm đang xem. */
  txs: TransactionRow[]
  relatives: RelativeRow[]
  onClose: () => void
}

export function GanNguoiNhanSheet({ txs, relatives, onClose }: Props) {
  useEscClose(onClose)
  const update = useUpdateTransaction()
  const { data: accounts = [] } = useAccounts()
  const currencyOf = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts])
  const [chon, setChon] = useState<Set<string>>(() => new Set(txs.map((t) => t.id)))
  const [nguoi, setNguoi] = useState(relatives[0]?.id ?? '')
  const [saving, setSaving] = useState(false)

  function toggle(id: string) {
    setChon((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function handleSave() {
    if (!nguoi || chon.size === 0) return
    setSaving(true)
    try {
      for (const id of chon) await update.mutateAsync({ id, patch: { remit_recipient_id: nguoi } })
      showToast(`Đã gán ${chon.size} lần gửi`)
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Gán thất bại, thử lại.', 'error')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle role="block" className="mb-3">Gán người nhận</SectionTitle>

        <label className="mb-1 block text-sm font-medium text-fg-muted" htmlFor="gan-nguoi">Gửi cho</label>
        <Select id="gan-nguoi" value={nguoi} onChange={(e) => setNguoi(e.target.value)} wrapClassName="w-full">
          {relatives.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </Select>

        <ul className="mt-3 divide-y divide-border-subtle">
          {txs.map((t) => (
            <li key={t.id}>
              <label className="flex items-center gap-3 py-2">
                <input type="checkbox" checked={chon.has(t.id)} onChange={() => toggle(t.id)} className="h-4 w-4" />
                <span className="w-24 shrink-0 font-mono text-sm text-fg-muted">{formatDateLabel(t.occurred_on)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary">{t.note || '(không ghi chú)'}</span>
                <Money amount={t.amount - (t.remit_fee_jpy ?? 0)} currency={currencyOf.get(t.account_id) ?? 'JPY'} />
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex justify-end gap-2">
          <ActionButton variant="outline" onClick={onClose}>Đóng</ActionButton>
          <ActionButton variant="primary" onClick={handleSave} disabled={!nguoi || chon.size === 0 || saving}>
            Gán {chon.size} lần
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
```

`TransactionPatch` là `Partial<Omit<NewTransaction, 'recurring_rule_id'>>` nên `{ remit_recipient_id }` hợp kiểu sau Task 2.

- [ ] **Step 3: Kiểm** — `npx tsc -b --noEmit`; `npx vitest run tests/designSystem.test.ts` (không `<select>`, không `<h1>`, không giá trị tuỳ ý — nếu đỏ ở lớp `inputCls`, chép lớp đúng từ `PlannedFormSheet`).

- [ ] **Step 4: Commit**

```bash
git add src/features/quyen-loi/NguoiThanSheet.tsx src/features/quyen-loi/GanNguoiNhanSheet.tsx
git commit -m "feat(quyen-loi): sheet them/sua nguoi than va sheet gan nguoi nhan hang loat"
```

---

### Task 8: Trang `/quyen-loi` + route + tiêu đề

**Files:**
- Create: `src/features/quyen-loi/QuyenLoiPage.tsx`
- Modify: `src/App.tsx` (lazy import + `<Route>`), `src/components/navItems.ts` (`PAGE_TITLES`)

**Interfaces:**
- Consumes: `useQuyenLoi` (Task 5), hai sheet (Task 7), `useCreateCategory`, `useUpdateProfile`, `useProfile`, `useBenefitTransactions`? — KHÔNG: lần gửi chưa gán lấy từ `ketQua.fuyo`? `FuyoKetQua` chỉ có số đếm; trang cần danh sách dòng → lọc lại từ `txs` của hook. Vì vậy `useQuyenLoi` trả thêm `txs`: thêm `txs: TransactionRow[]` vào `UseQuyenLoiResult` (trả `txsQ.data ?? EMPTY`) — sửa Task 5 khi làm tới đây.
- Produces: route `/quyen-loi`, tiêu đề "Quyền lợi"

- [ ] **Step 1: Mở [docs/design-system.md](../../design-system.md) Phần I** — tám bước + khuôn màn. Trang dựng theo khuôn đó.

- [ ] **Step 2: Tạo `QuyenLoiPage.tsx`**:

```tsx
// Màn Quyền lợi — "tới 31/12 năm nay tôi còn để quên đồng nào?" (spec 2026-09-03).
// Bốn khối theo THỨ TỰ TIỀN: ① phụ thuộc nước ngoài, ② đòi lại năm cũ, ③ furusato, ④ NISA.
// Mỗi khối: một câu kết luận → một con số (≈) → bảng chi tiết → nguồn luật → nút.
// Trang KHÔNG tính một con số nào: mọi số đến từ useQuyenLoi → tinhQuyenLoi.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { ActionButton, Card, EmptyState, Money, Num, PageHeader, SectionTitle, Select } from '../../components/ui'
import { EstimateMark } from '../../components/EstimateMark'
import { useCreateCategory, useProfile, useRelatives, useUpdateProfile } from '../../hooks/queries'
import { calendarYearOf, toISODate } from '../../lib/dates'
import { showToast } from '../../lib/dialog'
import type { KetLuan } from './ketLuan'
import { FURUSATO_CATEGORY_NAME } from './furusato'
import { luatChoNam } from './rules/luat'
import { useQuyenLoi } from './useQuyenLoi'
import { GanNguoiNhanSheet } from './GanNguoiNhanSheet'
import { NguoiThanSheet } from './NguoiThanSheet'
import type { RelativeRow } from '../../types/database.types'

const NHOM_NHAN: Record<string, string> = { '<16': 'dưới 16', '16-29': '16–29', '30-69': '30–69', '70+': 'từ 70' }

function TrangThaiChu({ k }: { k: KetLuan }) {
  const map: Record<KetLuan['trang_thai'], string> = {
    du: 'Xong', thieu: 'Cần làm', 'het-han': 'Đã qua', 'thieu-du-lieu': 'Thiếu dữ liệu',
  }
  return <SectionTitle role="micro" as="h3">{map[k.trang_thai]}</SectionTitle>
}

function NguonLuat({ year }: { year: number }) {
  const luat = luatChoNam(year)
  return (
    <p className="mt-3 text-2xs text-fg-muted">
      Theo{' '}
      <a href={luat.nguon[0]} target="_blank" rel="noreferrer" className="underline">
        Cục thuế Nhật (NTA)
      </a>{' '}
      · áp dụng từ năm thuế {luat.nam || 'trước 2023'}
    </p>
  )
}

export function QuyenLoiPage() {
  const todayISO = toISODate(new Date()) // đọc đồng hồ MỘT lần ở tầng UI, truyền xuống
  const namNay = calendarYearOf(todayISO)
  const [year, setYear] = useState(namNay)
  const { ketQua, isReady, isError, furusatoCategoryId, txs } = useQuyenLoi(year, todayISO)
  const { data: profile } = useProfile()
  const { data: relatives = [] } = useRelatives()
  const updateProfile = useUpdateProfile()
  const createCategory = useCreateCategory()
  const [sheetNguoi, setSheetNguoi] = useState<RelativeRow | null | 'new'>(null)
  const [sheetGan, setSheetGan] = useState(false)

  const chuaGanTxs = useMemo(
    () => txs.filter((t) => t.is_remittance && t.remit_recipient_id == null && calendarYearOf(t.occurred_on) === year),
    [txs, year],
  )
  const daKhai = (profile?.fuyo_claimed_years ?? []).includes(year)

  async function toggleDaKhai() {
    const cur = profile?.fuyo_claimed_years ?? []
    const next = daKhai ? cur.filter((y) => y !== year) : [...cur, year].sort()
    await updateProfile.mutateAsync({ fuyo_claimed_years: next })
    showToast(daKhai ? `Bỏ đánh dấu năm ${year}` : `Đã ghi: năm ${year} đã nộp giấy`)
  }

  async function taoDanhMucFurusato() {
    await createCategory.mutateAsync({ name: FURUSATO_CATEGORY_NAME, type: 'expense', icon: '🎁', parent_id: null, need_level: 'flexible', cost_type: 'variable' })
    showToast('Đã tạo danh mục — ghi các khoản ふるさと納税 vào đó')
  }

  const years = Array.from({ length: 6 }, (_, i) => namNay - i)

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <PageHeader title="Quyền lợi" back="/">
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Năm thuế">
          {years.map((y) => (
            <option key={y} value={y}>Năm {y}</option>
          ))}
        </Select>
      </PageHeader>

      {isError ? (
        <EmptyState>Không tải được dữ liệu. Thử lại sau.</EmptyState>
      ) : !isReady || !ketQua ? (
        <EmptyState>Đang tải…</EmptyState>
      ) : (
        <>
          {/* ① Khấu trừ người phụ thuộc ở nước ngoài */}
          <Card as="section" padding="lg">
            <div className="flex items-baseline justify-between gap-2">
              <SectionTitle>Khấu trừ người phụ thuộc ở nước ngoài</SectionTitle>
              <TrangThaiChu k={ketQua.fuyo.ketLuan} />
            </div>
            <p className="mt-2 text-base font-medium text-fg">{ketQua.fuyo.ketLuan.viec}</p>
            {ketQua.fuyo.ketLuan.tiet_kiem_uoc !== null && (
              <p className="mt-1 text-sm text-fg-muted">
                Thuế bớt được{' '}
                <Money amount={ketQua.fuyo.ketLuan.tiet_kiem_uoc} currency="JPY" tone="in" />
                <EstimateMark reason={ketQua.fuyo.ketLuan.ly_do[0]} />
              </p>
            )}

            {ketQua.fuyo.nguoi.length > 0 && (
              <ul className="mt-3 divide-y divide-border-subtle">
                {ketQua.fuyo.nguoi.map((n) => (
                  <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <button type="button" className="font-medium text-fg hover:underline" onClick={() => setSheetNguoi(relatives.find((r) => r.id === n.id) ?? null)}>
                      {n.name}
                    </button>
                    <Num tone="muted">{n.tuoi} tuổi · nhóm {NHOM_NHAN[n.nhom]}</Num>
                    <span className="ml-auto">
                      đã gửi <Money amount={n.da_gui} currency="JPY" />
                      {n.nguong > 0 && !n.du && (
                        <>
                          {' · '}còn thiếu <Money amount={n.con_thieu} currency="JPY" tone="out" />
                        </>
                      )}
                    </span>
                    <span className="basis-full text-2xs text-fg-muted">
                      {n.du ? `Giấy: ${n.giay.join(' + ')}` : n.nhom === '<16' ? 'Dưới 16 tuổi không thuộc khấu trừ này' : `Cần ≥ ¥${n.nguong.toLocaleString('vi-VN')}/năm để được tính`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-2 list-disc pl-5 text-2xs text-fg-muted">
              {ketQua.fuyo.ketLuan.ly_do.map((l) => <li key={l}>{l}</li>)}
            </ul>
            <NguonLuat year={year} />
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton variant="primary" onClick={() => setSheetNguoi('new')}>
                <Plus className="h-4 w-4" /> Thêm người thân
              </ActionButton>
              {chuaGanTxs.length > 0 && relatives.length > 0 && (
                <ActionButton variant="outline" onClick={() => setSheetGan(true)}>
                  Gán người nhận ({chuaGanTxs.length})
                </ActionButton>
              )}
              <ActionButton variant="outline" onClick={toggleDaKhai}>
                {daKhai ? `Đã nộp giấy năm ${year} ✓` : `Đã nộp giấy năm ${year}`}
              </ActionButton>
            </div>
          </Card>

          {/* ② Đòi lại năm cũ */}
          <Card as="section" padding="lg">
            <div className="flex items-baseline justify-between gap-2">
              <SectionTitle>Đòi lại năm cũ (還付申告)</SectionTitle>
              <TrangThaiChu k={ketQua.refund.ketLuan} />
            </div>
            <p className="mt-2 text-base font-medium text-fg">{ketQua.refund.ketLuan.viec}</p>
            {ketQua.refund.ketLuan.tiet_kiem_uoc !== null && (
              <p className="mt-1 text-sm text-fg-muted">
                Tổng có thể được hoàn{' '}
                <Money amount={ketQua.refund.ketLuan.tiet_kiem_uoc} currency="JPY" tone="in" />
                <EstimateMark reason={ketQua.refund.ketLuan.ly_do[1]} />
              </p>
            )}
            {ketQua.refund.nam.length > 0 && (
              <ul className="mt-3 divide-y divide-border-subtle">
                {ketQua.refund.nam.map((n) => (
                  <li key={n.year} className="flex flex-wrap items-center gap-x-3 py-2 text-sm">
                    <Num>Năm {n.year}</Num>
                    <span className="text-fg-secondary">{n.nguoi.map((p) => p.name).join(', ')}</span>
                    <span className="ml-auto text-fg-muted">hạn {n.han.slice(8, 10)}/{n.han.slice(5, 7)}/{n.han.slice(0, 4)}</span>
                    {n.tiet_kiem_uoc !== null && <Money amount={n.tiet_kiem_uoc} currency="JPY" tone="in" />}
                    {!n.co_nguong && <span className="basis-full text-2xs text-fg-muted">Năm này luật chưa có ngưỡng 38万 — chỉ cần chứng từ gửi tiền.</span>}
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-2 list-disc pl-5 text-2xs text-fg-muted">
              {ketQua.refund.ketLuan.ly_do.map((l) => <li key={l}>{l}</li>)}
            </ul>
            <NguonLuat year={namNay} />
          </Card>

          {/* ③ ふるさと納税 */}
          <Card as="section" padding="lg">
            <div className="flex items-baseline justify-between gap-2">
              <SectionTitle>Trần ふるさと納税</SectionTitle>
              <TrangThaiChu k={ketQua.furusato.ketLuan} />
            </div>
            <p className="mt-2 text-base font-medium text-fg">{ketQua.furusato.ketLuan.viec}</p>
            {ketQua.furusato.tran !== null && (
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-2xs text-fg-muted">Trần</dt><dd><Money amount={ketQua.furusato.tran} currency="JPY" /><EstimateMark reason={ketQua.furusato.ketLuan.ly_do[0]} /></dd></div>
                <div><dt className="text-2xs text-fg-muted">Đã gửi</dt><dd><Money amount={ketQua.furusato.da_gui} currency="JPY" /></dd></div>
                <div><dt className="text-2xs text-fg-muted">Còn lại</dt><dd><Money amount={ketQua.furusato.con_lai ?? 0} currency="JPY" tone="in" /></dd></div>
              </dl>
            )}
            <ul className="mt-2 list-disc pl-5 text-2xs text-fg-muted">
              {ketQua.furusato.ketLuan.ly_do.map((l) => <li key={l}>{l}</li>)}
            </ul>
            <NguonLuat year={year} />
            {!furusatoCategoryId && (
              <ActionButton variant="outline" className="mt-3" onClick={taoDanhMucFurusato}>
                Tạo danh mục "{FURUSATO_CATEGORY_NAME}"
              </ActionButton>
            )}
          </Card>

          {/* ④ NISA / iDeCo */}
          <Card as="section" padding="lg">
            <div className="flex items-baseline justify-between gap-2">
              <SectionTitle>Hạn mức NISA / iDeCo chưa dùng</SectionTitle>
              <TrangThaiChu k={ketQua.shelter.ketLuan} />
            </div>
            <p className="mt-2 text-base font-medium text-fg">{ketQua.shelter.ketLuan.viec}</p>
            {ketQua.shelter.tai_khoan.length > 0 && (
              <ul className="mt-3 divide-y divide-border-subtle">
                {ketQua.shelter.tai_khoan.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                    <Link to={`/assets/account/${t.id}`} className="font-medium text-fg hover:underline">{t.name}</Link>
                    <span className="ml-auto">
                      đã nạp <Money amount={t.used} currency="JPY" />
                      {t.remaining !== null ? <> · còn <Money amount={t.remaining} currency="JPY" tone="in" /></> : <> · chưa đặt hạn mức</>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-2 list-disc pl-5 text-2xs text-fg-muted">
              {ketQua.shelter.ketLuan.ly_do.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </Card>
        </>
      )}

      {sheetNguoi !== null && (
        <NguoiThanSheet relative={sheetNguoi === 'new' ? null : sheetNguoi} onClose={() => setSheetNguoi(null)} />
      )}
      {sheetGan && (
        <GanNguoiNhanSheet txs={chuaGanTxs} relatives={relatives.filter((r) => !r.is_archived)} onClose={() => setSheetGan(false)} />
      )}
    </div>
  )
}
```

Kiểm các tên lớp đã dùng (`text-2xs`, `text-fg-muted`, `text-fg-secondary`, `divide-border-subtle`, `text-state-danger-fg`) đều có trong `src/index.css` — chúng đang được dùng ở `AccountsPanel.tsx`/`roleFields.tsx`. Không thêm lớp mới.

- [ ] **Step 3: Sửa Task 5** — `UseQuyenLoiResult` thêm `txs: TransactionRow[]`, hook trả `txs: txsQ.data ?? EMPTY`.

- [ ] **Step 4: Route** — `src/App.tsx` (CRLF): thêm lazy import cạnh `PlannedPage`:

```ts
const QuyenLoiPage = lazy(() =>
  import('./features/quyen-loi/QuyenLoiPage').then((m) => ({ default: m.QuyenLoiPage })),
)
```

và `<Route path="/quyen-loi" element={lazyRoute(<QuyenLoiPage />)} />` ngay sau route `/planned`. Trong `src/components/navItems.ts` thêm `['/quyen-loi', 'Quyền lợi'],` vào `PAGE_TITLES` (KHÔNG thêm vào `NAV_ITEMS`, không thêm vào `MONTH_ROUTES`).

- [ ] **Step 5: Kiểm thật** — `npx tsc -b --noEmit`, `npm test`, rồi mở app demo: `/quyen-loi` hiện bốn khối; khối ① nói "Gán người nhận cho 1 lần gửi"; bấm gán → sau khi gán khối ① đổi kết luận (query `['transactions', …]` bị invalidate). Đổi năm → số đổi. Xem ở chế độ **Sáng** và **375px** (hai thứ `npm test` không thấy — CLAUDE.md).

- [ ] **Step 6: Commit**

```bash
git add src/features/quyen-loi src/App.tsx src/components/navItems.ts
git commit -m "feat(quyen-loi): trang /quyen-loi - bon khoi theo tien, nguon luat, nut gan nguoi nhan va da nop giay"
```

---

### Task 9: Khung "Quyền lợi năm nay" trên Bản tin

**Files:**
- Create: `src/features/bulletin/QuyenLoiPanel.tsx`
- Modify: `src/features/bulletin/BulletinPage.tsx` (chèn sau `<NotificationBoundary><TodoPanel/></NotificationBoundary>`, trước `{headline && …}`)

**Interfaces:**
- Consumes: `useQuyenLoi(year, todayISO)` (Task 5), `KetLuan`
- Produces: `<QuyenLoiPanel todayISO={string} />`

- [ ] **Step 1: `impact({target: "BulletinPage", file_path: "src/features/bulletin/BulletinPage.tsx", direction: "upstream"})`** — báo kết quả (kỳ vọng LOW).

- [ ] **Step 2: Tạo `QuyenLoiPanel.tsx`** — theo khuôn `AccountsPanel` (Card `elevation="panel" padding="panel"`):

```tsx
// Khung Quyền lợi trên Bản tin: TÌNH TRẠNG ba khoản của năm nay (①, ③, ④), mỗi khoản một
// dòng; bấm là sang /quyen-loi. Không lặp việc-cần-làm — TodoPanel đã nói VIỆC, khung này
// nói TÌNH TRẠNG. Khi cả ba đều xong hoặc chưa tới mùa thì thu lại MỘT dòng: có, cũng là
// một câu trả lời, và là lý do khung không biến mất.
import { Link } from 'react-router-dom'
import { Card, Money, SectionTitle } from '../../components/ui'
import { EstimateMark } from '../../components/EstimateMark'
import { calendarYearOf } from '../../lib/dates'
import type { KetLuan } from '../quyen-loi/ketLuan'
import { useQuyenLoi } from '../quyen-loi/useQuyenLoi'

const TEN: Partial<Record<KetLuan['id'], string>> = {
  fuyo: 'Người phụ thuộc',
  furusato: 'ふるさと納税',
  shelter: 'NISA / iDeCo',
}

export function QuyenLoiPanel({ todayISO }: { todayISO: string }) {
  const year = calendarYearOf(todayISO)
  const { ketQua, isReady } = useQuyenLoi(year, todayISO)
  if (!isReady || !ketQua) return null

  const dong = ketQua.ketLuan.filter((k) => k.id in TEN)
  const canLam = dong.filter((k) => k.trang_thai === 'thieu' || k.trang_thai === 'thieu-du-lieu')

  return (
    <Card elevation="panel" padding="panel" as="section" className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <SectionTitle>Quyền lợi năm {year}</SectionTitle>
        <Link to="/quyen-loi" className="-my-2 py-2 text-2xs font-medium text-fg-accent hover:underline">
          Xem chi tiết →
        </Link>
      </div>
      {canLam.length === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">Không có gì cần làm lúc này.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border-subtle">
          {canLam.map((k) => (
            <li key={k.id}>
              <Link to="/quyen-loi" className="flex flex-wrap items-center gap-x-2 py-2 transition hover:bg-surface-sunken">
                <span className="text-2xs font-medium uppercase text-fg-muted">{TEN[k.id]}</span>
                <span className="min-w-0 flex-1 text-sm text-fg-secondary">{k.viec}</span>
                {k.tiet_kiem_uoc !== null && (
                  <span className="text-sm">
                    <Money amount={k.tiet_kiem_uoc} currency="JPY" tone="in" />
                    <EstimateMark reason={k.ly_do[0]} />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
```

- [ ] **Step 3: Chèn vào `BulletinPage.tsx`** — sau khối `<NotificationBoundary><TodoPanel …/></NotificationBoundary>`:

```tsx
      {/* Khối Quyền lợi (spec 2026-09-03): tình trạng ba khoản năm nay. Đứng sau Việc cần làm
          vì nó là TÌNH TRẠNG, còn việc đã nằm ở trên. Bọc NotificationBoundary cùng lý do:
          query hỏng không được kéo sập trang chủ. */}
      <NotificationBoundary>
        <QuyenLoiPanel todayISO={todayISO} />
      </NotificationBoundary>
```

`BulletinPage` hiện gọi `toISODate(new Date())` rải ở năm chỗ (dòng 92, 135, 176, 306, 439) chứ không có biến chung. Thêm **một** dòng `const todayISO = toISODate(new Date())` ngay sau `const monthStartDay = …` (dòng ~80) và truyền `todayISO` xuống panel; KHÔNG sửa năm chỗ cũ trong task này (ngoài phạm vi). Import `QuyenLoiPanel` từ `'./QuyenLoiPanel'`.

- [ ] **Step 4: Kiểm thật** — demo: Bản tin có khung "Quyền lợi năm 2026" với dòng Người phụ thuộc "Gán người nhận cho 1 lần gửi…". Sáng + 375px. `npm test` xanh.

- [ ] **Step 5: Commit**

```bash
git add src/features/bulletin/QuyenLoiPanel.tsx src/features/bulletin/BulletinPage.tsx
git commit -m "feat(ban-tin): khung Quyen loi nam nay - tinh trang ba khoan, mot dong khi khong co gi"
```

---

### Task 10: Bốn loại thông báo

**Files:**
- Modify: `src/features/notifications/types.ts` (CRLF): `NotificationType`, `NOTIFICATION_TYPES`, `NOTIFICATION_META`, `NotificationInput.benefits`
- Create: `src/features/notifications/rules/benefitRules.ts`, `benefitRules.test.ts`
- Modify: `src/features/notifications/rules.ts` (thêm vào `buildNotifications`), `state.ts` (`notificationInputsReady.benefitsOk`), `useNotifications.ts`, `state.test.ts`

**Interfaces:**
- Consumes: `KetLuan` (Task 3), `useQuyenLoi` (Task 5)
- Produces: `NotificationInput.benefits?: KetLuan[]`, `benefitRules(input): AppNotification[]`, 4 type mới

- [ ] **Step 1: `impact({target: "buildNotifications", file_path: "src/features/notifications/rules.ts", direction: "upstream"})` và `impact({target: "useNotifications", direction: "upstream"})`** — báo kết quả (CRITICAL theo index vì chuông ở mọi màn; thay đổi chỉ THÊM).

- [ ] **Step 2: Test `rules/benefitRules.test.ts`**:

```ts
import { describe, expect, it } from 'vitest'
import type { KetLuan } from '../../quyen-loi/ketLuan'
import type { NotificationInput } from '../types'
import { benefitRules } from './benefitRules'

const k = (p: Partial<KetLuan>): KetLuan => ({
  id: 'fuyo', year: 2026, trang_thai: 'thieu', muc: 'medium', tiet_kiem_uoc: null, han: '2026-12-31',
  viec: 'Còn ¥180.000 để Em đủ 38万 · 3 tháng nữa', ly_do: ['Tiền ước'], ...p,
})
const input = (benefits?: KetLuan[]) => ({ todayISO: '2026-10-05', benefits }) as unknown as NotificationInput

describe('benefitRules', () => {
  it('benefits undefined → im (chưa tải, không đoán)', () => {
    expect(benefitRules(input(undefined))).toEqual([])
  })
  it('fuyo thieu → benefit-fuyo-shortfall, severity = muc, key không kèm kỳ', () => {
    const [n] = benefitRules(input([k({ muc: 'high' })]))
    expect(n).toMatchObject({ type: 'benefit-fuyo-shortfall', kind: 'action', severity: 'high', key: 'benefit-fuyo-shortfall:all', to: '/quyen-loi', onISO: '2026-12-31' })
    expect(n.title).toBe('Còn ¥180.000 để Em đủ 38万 · 3 tháng nữa')
  })
  it('fuyo du / thieu-du-lieu → không sinh shortfall', () => {
    expect(benefitRules(input([k({ trang_thai: 'du' })]))).toEqual([])
    expect(benefitRules(input([k({ trang_thai: 'thieu-du-lieu' })]))).toEqual([])
  })
  it('remit-unassigned thieu → action low', () => {
    const [n] = benefitRules(input([k({ id: 'remit-unassigned', muc: 'low', han: null, viec: '3 lần gửi tiền chưa gán người nhận' })]))
    expect(n).toMatchObject({ type: 'benefit-remit-unassigned', severity: 'low', key: 'benefit-remit-unassigned:all' })
  })
  it('refund thieu → benefit-refund-years với hạn', () => {
    const [n] = benefitRules(input([k({ id: 'refund', muc: 'high', han: '2026-12-31', viec: '2 năm cũ đủ điều kiện' })]))
    expect(n).toMatchObject({ type: 'benefit-refund-years', severity: 'high', onISO: '2026-12-31' })
  })
  it('furusato + shelter thieu → MỘT tin để biết gộp, key có năm', () => {
    const out = benefitRules(input([
      k({ id: 'furusato', viec: 'Còn ≈ ¥40.000 furusato chưa dùng · hết 31/12' }),
      k({ id: 'shelter', viec: 'Còn ¥1.100.000 hạn mức NISA/iDeCo chưa dùng · hết 31/12' }),
    ]))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ type: 'benefit-year-end', kind: 'info', key: 'benefit-year-end:2026' })
    expect(out[0].title).toContain('furusato')
    expect(out[0].detail).toContain('NISA')
  })
  it('furusato onestop (muc high) vẫn đi qua year-end với severity high', () => {
    const [n] = benefitRules(input([k({ id: 'furusato', muc: 'high', viec: 'Nếu nộp 確定申告 … ワンストップ sẽ vô hiệu' })]))
    expect(n.severity).toBe('high')
  })
})
```

- [ ] **Step 3: Chạy thấy đỏ**, rồi thêm vào `types.ts`:

Trong `NotificationType` (sau `'trend-level-shift'`):

```ts
  | 'benefit-fuyo-shortfall'
  | 'benefit-remit-unassigned'
  | 'benefit-refund-years'
  | 'benefit-year-end'
```

Trong `NOTIFICATION_TYPES`, sau `'lifetime-drift'` và TRƯỚC `'data-uncategorized'`:

```ts
  // Quyền lợi thuế (spec 2026-09-03): không gấp theo ngày nhưng có hạn thật (31/12) — cùng
  // lý lẽ với lifetime-drift ở trên, nên đứng ngay sau nó và trước hai luật độ-tin-cậy.
  'benefit-fuyo-shortfall',
  'benefit-refund-years',
  'benefit-remit-unassigned',
  'benefit-year-end',
```

Trong `NOTIFICATION_META`:

```ts
  'benefit-fuyo-shortfall': {
    cta: 'Xem',
    badge: 'QUYỀN LỢI',
    source: 'Quyền lợi · năm nay',
    kind: 'action',
    label: 'Người phụ thuộc chưa đủ 38万',
    hint: 'Người thân 30–69 tuổi ở VN cần nhận đủ ¥380.000/năm để được khấu trừ — nhắc khi còn thiếu.',
  },
  'benefit-remit-unassigned': {
    cta: 'Gán người',
    badge: 'QUYỀN LỢI',
    source: 'Quyền lợi · năm nay',
    kind: 'action',
    label: 'Lần gửi tiền chưa gán người nhận',
    hint: 'Chưa gán thì khấu trừ người phụ thuộc đang tính thiếu.',
  },
  'benefit-refund-years': {
    cta: 'Xem năm cũ',
    badge: 'QUYỀN LỢI',
    source: 'Quyền lợi · năm cũ',
    kind: 'action',
    label: 'Năm cũ còn đòi lại được',
    hint: 'Nộp 還付申告 trong 5 năm cho khấu trừ chưa khai — nhắc khi có năm đủ điều kiện.',
  },
  'benefit-year-end': {
    badge: 'CUỐI NĂM',
    source: 'Quyền lợi · năm nay',
    kind: 'info',
    label: 'Furusato / NISA còn hạn mức',
    hint: 'Từ tháng 10: phần ふるさと納税 và NISA chưa dùng, mất khi hết 31/12.',
  },
```

Trong `NotificationInput`, sau `lifetime?`:

```ts
  /**
   * Năm kết luận Quyền lợi (features/quyen-loi/quyenLoi.ts), ĐÃ TÍNH SẴN ở nơi gọi —
   * useQuyenLoi trên trình duyệt, loadInput.ts phía server. undefined = chưa tải → luật im.
   * Tính sẵn cùng lý do với `tagBudgets`: cần 6 năm lần gửi tiền, `recentTxs` chỉ có 90 ngày.
   */
  benefits?: KetLuan[]
```

với `import type { KetLuan } from '../quyen-loi/ketLuan'` (import type — không kéo giá trị vào file phải chạy trên Deno).

- [ ] **Step 4: Tạo `rules/benefitRules.ts`**:

```ts
// Bốn luật Quyền lợi (spec 2026-09-03). Luật này CỐ Ý ngu: bộ kiểm ở features/quyen-loi đã
// quyết trạng thái, mức khẩn, câu chữ; ở đây chỉ chép sang hình dạng AppNotification.
// Nhờ vậy chuông, push và màn Quyền lợi không bao giờ nói ba câu khác nhau về một khoản.
//
// THUẦN: chỉ import type. purity.test.ts canh.
import type { KetLuan } from '../../quyen-loi/ketLuan'
import type { AppNotification, NotificationInput } from '../types'

const TO = '/quyen-loi'

export function benefitRules(input: NotificationInput): AppNotification[] {
  const b = input.benefits
  if (!b) return []
  const out: AppNotification[] = []
  const boi = (id: KetLuan['id']) => b.find((k) => k.id === id)

  const fuyo = boi('fuyo')
  if (fuyo?.trang_thai === 'thieu')
    out.push({
      // Mã KHÔNG kèm kỳ: thiếu → đủ thì mã biến mất và trạng thái được dọn; năm sau lại
      // thiếu thì đỏ như mới (vòng đời mục E).
      key: 'benefit-fuyo-shortfall:all',
      kind: 'action',
      type: 'benefit-fuyo-shortfall',
      severity: fuyo.muc,
      title: fuyo.viec,
      detail: fuyo.ly_do[0],
      onISO: fuyo.han ?? undefined,
      to: TO,
    })

  const chuaGan = boi('remit-unassigned')
  if (chuaGan?.trang_thai === 'thieu')
    out.push({
      key: 'benefit-remit-unassigned:all',
      kind: 'action',
      type: 'benefit-remit-unassigned',
      severity: 'low',
      title: chuaGan.viec,
      detail: chuaGan.ly_do[0],
      to: TO,
    })

  const refund = boi('refund')
  if (refund?.trang_thai === 'thieu')
    out.push({
      key: 'benefit-refund-years:all',
      kind: 'action',
      type: 'benefit-refund-years',
      severity: refund.muc,
      title: refund.viec,
      detail: refund.ly_do[0],
      onISO: refund.han ?? undefined,
      to: TO,
    })

  // Cuối năm: một tin gộp furusato + NISA. Kỳ = năm, để năm sau lại là tin mới.
  const cuoiNam = [boi('furusato'), boi('shelter')].filter((k): k is KetLuan => k?.trang_thai === 'thieu')
  if (cuoiNam.length > 0)
    out.push({
      key: `benefit-year-end:${cuoiNam[0].year}`,
      kind: 'info',
      type: 'benefit-year-end',
      severity: cuoiNam.some((k) => k.muc === 'high') ? 'high' : 'low',
      title: cuoiNam[0].viec,
      detail: cuoiNam.length > 1 ? cuoiNam[1].viec : cuoiNam[0].ly_do[0],
      onISO: cuoiNam[0].han ?? undefined,
      to: TO,
    })

  return out
}
```

Trong `rules.ts`: `import { benefitRules } from './rules/benefitRules'` và thêm `...benefitRules(input),` vào mảng `all` (sau `...lifetimeRules(input),`).

- [ ] **Step 5: Chạy** `npx vitest run src/features/notifications` → `benefitRules.test.ts` PASS; `rules.test.ts`/`types` test có kiểm "mọi `action` phải có `cta`" — bốn META ở trên thoả. `purity.test.ts` PASS (chỉ import type). `NotificationSettingsPage` tự liệt kê 4 loại mới (đọc `NOTIFICATION_TYPES` + META).

- [ ] **Step 6: `state.ts` + `useNotifications.ts`** — `NotificationInputsReady` thêm `benefitsOk: boolean`, `notificationInputsReady` thêm `&& r.benefitsOk`; cập nhật `state.test.ts` (fixture của hàm này thêm `benefitsOk: true`, và một case `benefitsOk: false → false`). Trong `useNotifications`:

```ts
  // Quyền lợi thuế (spec 2026-09-03): bốn bộ kiểm chạy sẵn, luật chỉ chép. Cùng `todayISO`
  // của hook này để mọi luật chung một "hôm nay".
  const quyenLoi = useQuyenLoi(calendarYearOf(todayISO), todayISO, !!profile)
  const benefits = quyenLoi.ketQua?.ketLuan
```

đưa `benefits` vào `buildNotifications({...})` và vào mảng phụ thuộc của memo; `notificationInputsReady({... benefitsOk: quyenLoi.isReady || quyenLoi.isError })` — lỗi hẳn cũng tính là ngã ngũ, cùng lý lẽ với `lifetimeQueriesSettled` (không chặn dọn dẹp mãi vì một query hỏng). Import `useQuyenLoi` từ `'../quyen-loi/useQuyenLoi'`, `calendarYearOf` từ `lib/dates`.

- [ ] **Step 7: Kiểm** — `npx tsc -b --noEmit`; `npm test` — **`tests/pushBundle.test.ts` sẽ ĐỎ** vì bundle đã cũ (types/rules đổi). Đó là đúng; Task 11 gói lại. Commit task này **cùng** Task 11 hoặc chạy `npm run bundle:rules` ngay ở đây rồi commit cả `_rules.js` (server chưa đưa `benefits` vào input → luật im trên server tới Task 11, không sai chỉ thiếu).

- [ ] **Step 8: Commit** (sau khi `npm run bundle:rules`):

```bash
git add src/features/notifications supabase/functions/push-notify/_rules.js
git commit -m "feat(thong-bao): bon loai Quyen loi - thieu 38man, chua gan nguoi nhan, nam cu doi lai duoc, cuoi nam furusato/NISA"
```

---

### Task 11: Phía server — `loadInput.ts` dựng `benefits`, bundle lại

**Files:**
- Modify: `src/features/notifications/serverBundle.ts` (xuất `tinhQuyenLoi`, `taxCategoryIds`, `FURUSATO_CATEGORY_NAME`, `SO_NAM_HOAN_THUE`, `calendarYearOf`)
- Modify: `supabase/functions/push-notify/loadInput.ts`
- Regenerate: `supabase/functions/push-notify/_rules.js`
- Modify: `tests/pushBundle.test.ts` (`EXPORTS_BAT_BUOC` thêm `'tinhQuyenLoi'`)

- [ ] **Step 1: `serverBundle.ts`** — thêm:

```ts
// Quyền lợi thuế (spec 2026-09-03): edge function dựng `benefits` bằng ĐÚNG hàm gom mà
// useQuyenLoi dùng, để push và chuông không nói khác nhau về cùng một khoản.
export { tinhQuyenLoi } from '../quyen-loi/quyenLoi'
export { FURUSATO_CATEGORY_NAME } from '../quyen-loi/furusato'
export { SO_NAM_HOAN_THUE } from '../quyen-loi/refund'
export { taxCategoryIds } from '../tax/categories'
export { calendarYearOf } from '../../lib/dates'
```

- [ ] **Step 2: `loadInput.ts`** — import thêm năm tên trên từ `./_rules.js`. Sau khối tagBudgets, trước khi trả `input`:

```ts
  // --- Quyền lợi thuế (spec 2026-09-03) ---
  // KHÔNG tính gì ở đây: đọc bảng, xếp vào ô, gọi tinhQuyenLoi — đúng hàm useQuyenLoi gọi.
  const relatives = await readAll(sb, 'relatives', userId, 'sort_order')
  const namNay = calendarYearOf(todayISO)
  const benefitCategoryIds: string[] = [...taxCategoryIds(categories)]
  const fu = categories.find((c: Row) => c.type === 'expense' && c.name === FURUSATO_CATEGORY_NAME)
  if (fu) benefitCategoryIds.push(fu.id)
  const shelterIds: string[] = accounts.filter((a: Row) => a.tax_shelter != null).map((a: Row) => a.id)
  const orParts = ['is_remittance.eq.true']
  if (benefitCategoryIds.length) orParts.push(`category_id.in.(${benefitCategoryIds.join(',')})`)
  if (shelterIds.length) orParts.push(`to_account_id.in.(${shelterIds.join(',')})`)
  const benefitTxs = await fetchAllPages<Row>((from: number, to: number) =>
    sb
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .gte('occurred_on', `${namNay - SO_NAM_HOAN_THUE}-01-01`)
      .lt('occurred_on', `${namNay + 1}-01-01`)
      .or(orParts.join(','))
      .order('occurred_on', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )
  // `accounts` ở đây là view account_balances — có đủ id/name/currency/tax_shelter/
  // shelter_annual_limit/is_archived (0053 liệt kê rõ), đúng các trường tinhQuyenLoi đọc.
  const benefits = tinhQuyenLoi({
    year: namNay,
    todayISO,
    relatives,
    txs: benefitTxs,
    categories,
    accounts,
    base,
    rates,
    fuyoClaimedYears: profile.fuyo_claimed_years ?? [],
  }).ketLuan
```

và thêm `benefits,` vào object `input` trả về.

- [ ] **Step 3: Bundle** — `npm run bundle:rules`. Thêm `'tinhQuyenLoi'` vào `EXPORTS_BAT_BUOC['supabase/functions/push-notify/_rules.js']` trong `tests/pushBundle.test.ts`. `npx vitest run tests/pushBundle.test.ts` → PASS (file đã commit khớp bản gói lại).

- [ ] **Step 4: Kiểm Deno cục bộ (nếu có `deno`)** — `deno check supabase/functions/push-notify/index.ts`. Không có deno thì bỏ qua và ghi rõ trong báo cáo; deploy theo [docs/push-notification.md](../../push-notification.md) mục "Triển khai" **là việc của chủ app**, không tự deploy.

- [ ] **Step 5: Commit**

```bash
git add src/features/notifications/serverBundle.ts supabase/functions/push-notify tests/pushBundle.test.ts
git commit -m "feat(push): edge function dung benefits bang tinhQuyenLoi - goi lai _rules.js"
```

---

### Task 12: Soát toàn bộ, `detect_changes`, kiểm mắt

- [ ] **Step 1:** `npm run build` (chạy `tsc -b` thật — không dùng `tsc --noEmit` một mình, xem memory repo), `npm run lint`, `npm test` — cả ba sạch. Dán output vào báo cáo.
- [ ] **Step 2:** `detect_changes({scope: "compare", base_ref: "master"})` — đối chiếu danh sách symbol đổi với File Structure của kế hoạch; symbol nào ngoài danh sách phải giải thích.
- [ ] **Step 3: Mở app demo, kiểm bằng mắt** (ba thứ `npm test` không thấy): chế độ **Sáng** và **375px** cho `/quyen-loi`, Bản tin, form gửi tiền; không có chuỗi `{…}` in thô (bẫy codemod đã ghi trong CLAUDE.md). Chụp màn hình kèm báo cáo.
- [ ] **Step 4: Kiểm với DB thật của chủ app** (nếu có `.env.local`): chạy migration 0056 trên Supabase (**hỏi chủ app trước khi áp migration lên project thật**), mở `/quyen-loi`, xác nhận: (a) số lần gửi chưa gán = số lần gửi trong năm (chưa gán ai), (b) tổng gửi theo người + chưa gán = tổng "Gửi về VN" tab Báo cáo cùng năm, (c) trần furusato ra số (có 12 tháng phiếu lương), (d) so số 住民税 cửa sổ với phiếu lương thật.
- [ ] **Step 5:** Ghi vào `docs/backlog-tinh-nang.md` một mục "Quyền lợi (2026-09-03) — đã ship ①②③④; chưa làm: 医療費控除, iDeCo theo loại DN, đọc 源泉徴収票" để đợt sau không làm lại.

---

## Self-review (đã chạy lúc viết kế hoạch)

**Spec coverage:** A (trục năm) → Task 1 · B (luật + nguồn) → Task 1 · C.1–C.3 (schema) → Task 2 · C.4 (danh mục theo tên) → Task 4/8 · C.5 (repo) → Task 2 · D.1–D.5 (bộ kiểm) → Task 3, 4, 1 · E.1 (trang) → Task 8 · E.2 (gán người nhận) → Task 6, 7 · E.3 (thông báo, push) → Task 10, 11 · E.4 (Bản tin) → Task 9 · F (demo) → Task 2 · G (kiểm thử, bất biến) → Task 4 · H (hỏng thì sao) → nằm trong từng bộ kiểm (thiếu tỷ giá, thiếu phiếu lương, JP, chưa đặt hạn mức) · J (thứ tự) → Task 1–12 theo đúng thứ tự spec, có thêm hook (Task 5) và sheet (Task 7) mà spec gộp vào E.

**Placeholder scan:** Không còn "TBD/TODO". Tên hàm/fixture tham chiếu đã kiểm với code thật: `insertChunked` (supabaseRepo.ts), `makeDeps`/`base`/`cat` (roleSave.test.ts), `notificationInputsReady` fixture `ALL` (state.test.ts dòng 241–260).

**Type consistency:** `KetLuan.id` gồm `'remit-unassigned'` (Task 3) và `tinhQuyenLoi` sinh đúng 5 phần tử theo thứ tự đó (Task 4) — `benefitRules` (Task 10) và `QuyenLoiPanel` (Task 9) tìm theo `id`, không theo vị trí. `FuyoInput.suatBien: number | null` xuyên suốt Task 3–4. `UseQuyenLoiResult.txs` được thêm ở Task 8 Step 3 (sửa Task 5). `RemitValue.recipientId: string` (Task 6) ↔ `remit_recipient_id: string | null` (Task 2) qua `|| null`.

**Rủi ro biết trước:** (1) `.or()` PostgREST với `in.()` — cả hai bản đều bỏ nhánh rỗng. (2) `purity.test.ts` có thể đỏ ở `lib/rates.ts` qua `quyenLoi.ts` → xử lý ở Task 4 Step 12. (3) Index GitNexus cũ 88 commit — `impact` là cận dưới, mỗi task chạy lại.

