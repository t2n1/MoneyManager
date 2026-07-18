# Thiết kế — Nhóm "Thấu hiểu tài chính" (R, S, U, W)

> **Ngày:** 2026-07-19 · **Trạng thái:** Đã chốt qua brainstorm, chờ viết plan.
>
> Gom 4 mục backlog thuộc nhóm "thấu hiểu tài chính": R (dự báo cuối tháng), S (so
> sánh tháng), U (phát hiện bất thường), W (dòng tiền tích lũy). Tất cả **chỉ
> đọc/tính client-side, KHÔNG đổi schema, KHÔNG đụng tầng repo**. Mỗi mục = 1 commit
> riêng, lời nhắn không dấu.

## Mục tiêu

Bổ sung các chỉ số giúp người dùng *hiểu* tình hình chi tiêu — dự báo, so sánh, cảnh
báo bất thường, và diễn biến dòng tiền trong tháng — tất cả tính từ dữ liệu đã có,
không thêm bảng/cột.

## Ràng buộc chung (nhắc lại)

- Không đổi `schema`, không đụng tầng `repo` (chỉ đọc/tính dữ liệu sẵn có).
- Tiền quy đổi base qua `convertToBase`; thiếu tỷ giá → cờ `hasMissingRate` (không mất
  dòng, chỉ đánh dấu xấp xỉ). Tôn trọng `month_start_day` qua `getMonthRange` /
  `monthKeyForDate`.
- Logic thuần đặt trong file không phụ thuộc React, **unit-test được**; **không gọi
  `new Date()`** trong hàm thuần — `today` luôn truyền vào (test tất định).
- UI tiếng Việt; mobile bottom tab, desktop sidebar.
- Sau mỗi mục: `npm run build` + `npm run lint` + `npm test` sạch. Mỗi mục 1 commit.

---

## Chỗ đặt — Tab mới "Thấu hiểu" trong trang Báo cáo

`ReportsPage` hiện có 2 tab: **Biểu đồ** | **Ngân sách**. Thêm tab thứ 3 **Thấu hiểu**,
thứ tự: **Biểu đồ · Thấu hiểu · Ngân sách**.

- `view` đổi từ `'charts' | 'budget'` → `'charts' | 'insights' | 'budget'`.
- Deep-link: `?view=insights` mở thẳng tab này (giống `?view=budget` hiện có).
- **Chuyển** section "Sức khỏe tài chính" (tỷ lệ tiết kiệm + streak + thẻ gợi ý V/Q)
  từ tab Biểu đồ **sang đầu tab Thấu hiểu**. Sau khi chuyển, tab Biểu đồ chỉ còn biểu
  đồ tròn danh mục + cột thu/chi 6 tháng; tab Thấu hiểu gom mọi chỉ số.
- Logic tính của Sức khỏe (rate, streak, buildInsights) **giữ nguyên**, chỉ đổi chỗ
  render.

Bố cục tab Thấu hiểu, từ trên xuống: ① Sức khỏe (cũ) · ② Dự báo (R) · ③ So sánh tháng
(S) · ④ Dòng tiền tích lũy (W) · ⑤ Bất thường (U).

**Dữ liệu:** `ReportsPage` đã fetch `monthTxs` (tháng đang xem) và `rangeTxs` (6 tháng,
gồm tháng đang xem). Đổi điều kiện bật `rangeTxs` thành `view === 'charts' || view ===
'insights'`. Không thêm query mới cho S/U/W. R cần tổng ngân sách → dùng
`useBudgetReport(activeMonthKey)` (đã có).

**Recharts (cho W):** `ReportsPage` đã lazy-load ở cấp route (`App.tsx`) và đã import
Recharts sẵn → biểu đồ W **không tốn thêm bundle**, không cần lazy-load riêng.

---

## R — Dự báo cuối tháng (run-rate)

Chỉ hiển thị cho **tháng hiện tại** (xem tháng cũ → ẩn thẻ, như streak — dự báo "còn
lại bao nhiêu ngày" chỉ có nghĩa với tháng đang diễn ra).

**Hàm thuần** (đặt trong `src/features/reports/insights.ts`):

```ts
export interface Forecast {
  projected: number   // dự báo tổng chi cuối tháng (base, minor units)
  spentSoFar: number
  daysElapsed: number
  daysInMonth: number
}
export function forecastMonthEnd(
  spentSoFar: number, daysElapsed: number, daysInMonth: number,
): Forecast | null
```

- `daysElapsed < 1` hoặc `daysInMonth < 1` → `null`.
- `projected = round(spentSoFar / daysElapsed * daysInMonth)`.

**Helper ngày** (đặt trong `src/lib/dates.ts`, có test):

```ts
/** Số ngày nguyên giữa 2 ngày ISO (b − a), theo mốc UTC 00:00. */
export function daysBetween(aISO: string, bISO: string): number
```

**Tính ở UI (`ReportsPage`):**

- `spentSoFar` = tổng **chi** (base) của `monthTxs` có `occurred_on <= today`.
- `range = getMonthRange(activeMonthKey, monthStartDay)`.
- `daysInMonth = daysBetween(range.start, range.end)` (end loại trừ → đúng số ngày).
- `daysElapsed = min(daysBetween(range.start, today) + 1, daysInMonth)` (today tính vào).
- **So ngân sách:** lấy `report.totalBudgeted` từ `useBudgetReport`. Nếu `> 0`:
  - `projected > totalBudgeted` → "Với đà này bạn sẽ chi ~{projected}, **vượt** ngân
    sách {chênh lệch}." (màu đỏ)
  - ngược lại → "Với đà này bạn sẽ chi ~{projected}, **trong** ngân sách." (màu xanh)
  - Không có ngân sách (`totalBudgeted = 0`) → chỉ hiện "Dự báo chi cả tháng ~{projected}".
- Hiển thị 1 thẻ: số `projected` lớn + câu nhận định + dòng phụ "{spentSoFar} sau
  {daysElapsed}/{daysInMonth} ngày".
- Nếu chi ngoại tệ thiếu tỷ giá → thêm dấu `≈` trước số (xấp xỉ).

---

## S — So sánh tháng theo danh mục (▲▼)

Bảng mỗi **danh mục chi**: tháng này · tháng trước · TB 3 tháng · mũi tên ▲▼ %.

**Hàm thuần** (đặt trong `src/features/reports/aggregate.ts`):

```ts
export interface CategoryComparisonRow {
  categoryId: string
  thisMonth: number        // base minor
  prevMonth: number        // base minor
  avg3: number             // TB tổng chi của M-1, M-2, M-3 (tháng thiếu tính 0)
  deltaPct: number | null  // (thisMonth - prevMonth)/prevMonth * 100; null nếu prevMonth = 0
  isNew: boolean           // prevMonth = 0 && thisMonth > 0
}
export interface CategoryComparison {
  rows: CategoryComparisonRow[]  // sắp theo thisMonth giảm dần
  hasMissingRate: boolean
}
export function categoryComparison(
  txs: TransactionRow[],   // range đủ phủ M..M-3 (dùng rangeTxs 6 tháng)
  activeMonth: MonthKey,
  monthStartDay: number,
  currencyOf: CurrencyOf, base: CurrencyCode, rates: Rates,
): CategoryComparison
```

- Chỉ tính giao dịch `type === 'expense'` có `category_id`. Gom theo `(category_id,
  monthKey)` bằng `monthKeyForDate(occurred_on, monthStartDay)`.
- `thisMonth` = tổng ở `activeMonth`; `prevMonth` = tổng ở `addMonths(activeMonth,-1)`;
  `avg3` = trung bình cộng tổng của 3 tháng M-1, M-2, M-3 (tháng nào không có = 0, vẫn
  chia 3).
- **Mũi tên ▲▼ và %** so **tháng trước** (đúng nghĩa "so sánh tháng"): `deltaPct` từ
  `prevMonth`. `prevMonth = 0 && thisMonth > 0` → `isNew = true`, hiển thị nhãn "mới"
  thay cho %. `avg3` chỉ là **cột tham chiếu** (không có mũi tên riêng).
- Bao gồm danh mục nếu **bất kỳ** trong `thisMonth / prevMonth / avg3` khác 0.
- `hasMissingRate` = true nếu có khoản không quy đổi được.

**UI:** bảng gọn, mỗi hàng: icon + tên danh mục, số `thisMonth` (kèm badge ▲/▼ + %,
xanh khi giảm / đỏ khi tăng — vì đây là **chi**), dòng phụ nhỏ "Trước {prevMonth} · TB3
{avg3}". Không có dữ liệu → ẩn section.

---

## W — Dòng tiền tích lũy trong tháng

Biểu đồ đường **số dư chạy theo ngày** trong tháng đang xem (thu +, chi −, bắt đầu từ
0). Hoạt động cho **cả tháng cũ lẫn tháng hiện tại** (khác R/streak).

**Hàm thuần** (đặt trong `src/features/reports/aggregate.ts`):

```ts
export interface CashflowPoint { date: string; balance: number } // base minor, tích lũy
export interface CumulativeCashflow {
  points: CashflowPoint[]
  hasMissingRate: boolean
}
export function cumulativeDailyBalance(
  txs: TransactionRow[],   // giao dịch tháng đang xem (monthTxs)
  startISO: string,        // range.start (gồm)
  lastISO: string,         // ngày cuối cần vẽ (gồm)
  currencyOf: CurrencyOf, base: CurrencyCode, rates: Rates,
): CumulativeCashflow
```

- Duyệt từng ngày từ `startISO` tới `lastISO` (bao gồm). Mỗi ngày: `net = Σthu − Σchi`
  (base, đã quy đổi); **chuyển khoản KHÔNG tính**. `balance` = cộng dồn `net` từ 0.
- Ngày không có giao dịch → `net = 0`, `balance` giữ nguyên (đường phẳng).
- `hasMissingRate` = true nếu có khoản không quy đổi được.

**Tính ở UI:** `lastISO` = tháng hiện tại → `today`; tháng cũ → ngày cuối tháng tài
chính (`daysBetween`/`range.end` lùi 1 ngày). Vẽ `LineChart` (Recharts) 1 đường, trục X
là ngày (nhãn thưa), tick tiền dùng `formatCompact` sẵn có. Không có giao dịch cả tháng
→ ẩn section.

---

## U — Phát hiện giao dịch bất thường

Danh sách giao dịch **chi** tháng đang xem có số tiền **lớn bất thường** so với lịch sử
cùng danh mục.

**Hàm thuần** (đặt trong `src/features/reports/insights.ts`):

```ts
export interface Anomaly {
  transactionId: string
  categoryId: string
  amount: number   // base minor (khoản hiện tại)
  median: number   // base minor (trung vị lịch sử danh mục)
  ratio: number    // amount / median
}
export interface AnomalyOptions { threshold: number; minSamples: number }
export function detectAnomalies(
  currentTxs: TransactionRow[],   // giao dịch tháng đang xem
  historyTxs: TransactionRow[],   // giao dịch các tháng TRƯỚC (baseline), không gồm tháng đang xem
  currencyOf: CurrencyOf, base: CurrencyCode, rates: Rates,
  opts: AnomalyOptions = { threshold: 3, minSamples: 5 },
): { anomalies: Anomaly[]; hasMissingRate: boolean }
```

- Baseline: gom **giá trị từng giao dịch** (base) của `historyTxs` (`type === 'expense'`,
  có `category_id`) theo danh mục → tính **trung vị (median)** mỗi danh mục.
- Với mỗi giao dịch chi ở `currentTxs` (đã quy đổi): danh mục có `>= minSamples` mẫu
  lịch sử **và** `median > 0` **và** `amount >= threshold * median` → là bất thường,
  `ratio = amount / median`.
- Sắp theo `ratio` giảm dần. `hasMissingRate` = true nếu có khoản hiện tại không quy đổi.
- Thêm util nội bộ `median(nums: number[])` trong `insights.ts`.

**Tính ở UI:** `historyTxs` = `rangeTxs` lọc `occurred_on < range.start` (các tháng
trước tháng đang xem). `currentTxs` = `monthTxs`. Hiển thị tối đa **5** dòng đầu; mỗi
dòng: icon + tên danh mục, số tiền, "gấp {ratio làm tròn}× thường ngày". Không có gì bất
thường → ẩn section.

---

## Không làm (để khỏi phình)

- R: không dự báo theo **từng danh mục**, chỉ tổng chi cả tháng; không đường xu hướng.
- S: chỉ **danh mục chi** (không so thu); mũi tên chỉ so **tháng trước** (avg3 là tham
  chiếu, không thêm mũi tên thứ 2); không biểu đồ, chỉ bảng.
- W: bắt đầu từ **0** (không cộng số dư đầu tháng của tài khoản); 1 đường tổng (không
  tách theo tài khoản/loại tiền).
- U: ngưỡng **cố định** 3× / 5 mẫu (không cho chỉnh trong UI ở bản này); baseline lấy
  từ các tháng đã tải sẵn (không tải thêm lịch sử dài hơn 6 tháng).
- Không đụng schema/repo; không thêm màn Tổng quan mới.

## Kiểm thử & nghiệm thu

**Test tự động:**

- `src/lib/dates.test.ts` — `daysBetween`: cùng ngày = 0; cách 1 ngày = 1; qua ranh
  giới tháng đúng.
- `src/features/reports/insights.test.ts`:
  - `forecastMonthEnd`: giữa tháng nội suy đúng; `daysElapsed = 0` → null; `daysElapsed
    = daysInMonth` → projected ≈ spentSoFar.
  - `detectAnomalies`: khoản gấp ≥3× median bị gắn cờ; danh mục < 5 mẫu bị bỏ qua;
    median = 0 bỏ qua; sắp theo ratio; cờ `hasMissingRate` khi thiếu tỷ giá; `median`
    util (mảng chẵn/lẻ).
- `src/features/reports/aggregate.test.ts`:
  - `categoryComparison`: gom đúng theo tháng/danh mục; `avg3` chia 3 kể cả tháng thiếu;
    `deltaPct` đúng dấu; `prevMonth = 0` → `isNew`; sắp theo `thisMonth`; tôn trọng
    `month_start_day`.
  - `cumulativeDailyBalance`: cộng dồn đúng; ngày trống giữ số dư; loại chuyển khoản;
    khoảng ngày tôn trọng `start/last`; cờ thiếu tỷ giá.

**Gate sau mỗi mục:** `npm run build`, `npm run lint`, `npm test` sạch.

**Nghiệm thu trên bản xem trước (điện thoại, demo mode):**

- R: mở tab Thấu hiểu ở tháng hiện tại → thấy thẻ dự báo; xem tháng cũ → thẻ ẩn. Có
  ngân sách → câu "vượt/trong ngân sách" đúng màu.
- S: bảng so sánh hiện danh mục chi với ▲▼ % so tháng trước + cột TB3; danh mục mới có
  nhãn "mới".
- W: đường dòng tiền chạy theo ngày, tháng hiện tại dừng ở hôm nay, tháng cũ vẽ hết tháng.
- U: tạo 1 khoản chi rất lớn ở danh mục có ≥5 giao dịch cũ → xuất hiện trong danh sách
  bất thường; khoản thường → không.

## Commit (mỗi mục 1 commit, không dấu)

- `Bao cao: tab Thau hieu + du bao cuoi thang run-rate (R)` — tạo tab Thấu hiểu, chuyển
  section Sức khỏe sang, thêm `daysBetween` + `forecastMonthEnd` + test + thẻ dự báo.
- `Bao cao: so sanh thang theo danh muc (S)` — `categoryComparison` + test + bảng.
- `Bao cao: dong tien tich luy trong thang (W)` — `cumulativeDailyBalance` + test + biểu đồ đường.
- `Bao cao: phat hien giao dich bat thuong (U)` — `detectAnomalies` + `median` + test + danh sách.
