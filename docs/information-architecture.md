# Kiến trúc thông tin (IA) — sắp xếp lại toàn app

Chốt ngày 2026-07-31. Tài liệu này là **bản đồ duyệt trước khi code**: nó nói mỗi màn
hiện có sẽ nằm đâu, route nào đổi, link nội bộ nào phải sửa, và thứ tự thi công.

Nguyên tắc sắp xếp: **gom theo câu hỏi người dùng đang hỏi**, không gom theo bảng dữ
liệu hay theo "cái này chưa biết đặt đâu".

---

## 1. Hiện trạng đã đo

App có **21 route (20 màn, chưa tính `/login`)** và **4 tab dưới**.

### 1.1 Hơn một nửa app nằm trong Cài đặt

11 trong 20 màn nằm dưới `/settings/*`: Tài khoản, Danh mục, Phân loại chi tiêu, Nhãn,
Thông báo, Nhóm tài sản, Nợ/cho vay, Chi tiết nợ, Giao dịch định kỳ, Nhập CSV, Dữ liệu.

Trong 8 mục của khối "Quản lý" ([SettingsPage.tsx:68](../src/features/settings/SettingsPage.tsx)),
**3 mục không phải cài đặt** — chúng là dữ liệu tài chính thật:

| Mục | Thực chất là gì | Bằng chứng nó thuộc nơi khác |
| --- | --- | --- |
| Nợ / cho vay | Số hạng của công thức Tài sản ròng | `AssetsPage.tsx:385` phải tự vẽ link `/settings/debts` ngay trong khối Tài sản ròng |
| Nhóm tài sản | Cách cắt lát của trang Tài sản | `AssetsPage.tsx:342` có nút "Quản lý nhóm" ở header |
| Giao dịch định kỳ | Giao dịch tương lai | `SubscriptionsCard` (tab Thấu hiểu) phải link tới nó |

Cả 3 đều phải *mượn đường* từ một trang khác. Đó là dấu hiệu chúng thuộc trang đó.

### 1.2 Hai màn nặng nhất không có đường vào từ nav

| Màn | Quy mô | Đường vào duy nhất hiện nay |
| --- | --- | --- |
| `/health` | 532 dòng, 7 chỉ số | 1 card giữa trang Báo cáo + 1 link trong Mục tiêu tiết kiệm |
| `/lifetime` | 445 dòng + 8 module tính | `LifetimeSection` — khối thứ **4** trên trang Tài sản, phải cuộn mới thấy |

Cả hai đều lazy-load riêng và đều có bộ luật thông báo riêng (`lifetimeRules.ts`) — tức
là code coi chúng là tính năng chính, chỉ có IA coi chúng là phụ.

### 1.3 Trang Tài sản gánh 3 câu hỏi khác nhau

780 dòng, 7 khối, cuộn một mạch:

- *"Giờ tôi có bao nhiêu"* — Tổng tài sản, Tài sản ròng, Thẻ đến hạn, Cơ cấu, Danh sách TK
- *"Tôi đang tiến bộ không"* — Lịch sử tài sản ròng, Hiệu quả đầu tư, Mục tiêu tiết kiệm
- *"Sau này thế nào"* — Lifetime

### 1.4 Ngân sách nằm trong Báo cáo

Ngân sách là công cụ **điều khiển trong tháng** (đặt hạn mức, xem còn bao nhiêu), Báo cáo
là **nhìn lại**. Hệ quả kỹ thuật đo được: dải tab Báo cáo có 4 mục nhưng 3 mục chỉ tồn tại
ở chế độ Tháng, nên [ReportsPage.tsx:319](../src/features/reports/ReportsPage.tsx) phải ẩn
cả dải khi gạt sang Năm → layout nhảy mỗi lần đổi kỳ.

---

## 2. Kiến trúc đích — 5 tab

```
Sổ            Ngân sách      Tài sản           Báo cáo          Cài đặt
│             │              │                 │                │
├ Ngày        └ (1 màn)      ├ Hiện tại        ├ Biểu đồ        ├ Quản lý sổ
├ Lịch                       ├ Diễn biến       ├ Xu hướng       ├ Thông báo
├ Tháng                      └ Tương lai       ├ Thấu hiểu      ├ Giao diện
└ Tổng hợp                                     └ Sức khỏe      ├ Dữ liệu & sao lưu
                                                                └ Hồ sơ
```

Nav dưới 5 tab là giới hạn thực dụng trên mobile — không thêm nữa.

### 2.1 Tab 1 — Sổ · `/`

| Thành phần | Nguồn | Ghi chú |
| --- | --- | --- |
| 4 tab con Ngày / Lịch / Tháng / Tổng hợp | giữ nguyên | `?view=` |
| Nút "+" nổi → `/entry` | giữ nguyên | |
| Icon Tìm kiếm → `/search` | giữ nguyên | |
| Chuông thông báo | giữ nguyên | |
| **Icon Định kỳ → `/recurring`** | **chuyển từ Cài đặt** | Đặt ở header, cạnh icon Tìm kiếm |

Định kỳ đi vào header chứ **không** thành tab con thứ 5: 5 mục segmented control là quá
chật trên mobile, và Định kỳ là danh sách quy tắc chứ không phải một cách xem cùng dữ liệu
như 4 tab kia.

### 2.2 Tab 2 — Ngân sách · `/budget`

Tách `BudgetView` ra khỏi `ReportsPage`. Nội dung giữ y nguyên (`AxisTargetsCard`, Tổng
ngân sách, hạn mức từng danh mục lá, `MonthPaceCharts`, `SpendPaceSection`), chỉ cần **header
điều hướng tháng riêng** vì trước đây nó dùng chung header của Báo cáo.

### 2.3 Tab 3 — Tài sản · `/assets` (3 tab con)

| Tab con | `?view=` | Nội dung |
| --- | --- | --- |
| **Hiện tại** | `now` (mặc định) | Tổng tài sản · Tài sản ròng · Thẻ tín dụng đến hạn · Cơ cấu tài sản (bánh + 3 kiểu cắt) · Danh sách nhóm & tài khoản |
| **Diễn biến** | `trend` | `NetWorthHistorySection` · `InvestmentPerformanceSection` · `SavingsGoalsSection` |
| **Tương lai** | `future` | Nội dung `LifetimePage` mount thẳng vào đây (bỏ `BackButton` của nó) |

Màn con vào từ tab này: `/assets/account/:accountId` (chi tiết TK), `/assets/groups` (nhóm
tài sản), `/debts` + `/debts/:debtId` (Nợ/cho vay).

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

`LifetimeSection` (teaser 45 dòng trên trang Tài sản) **bị bỏ** — nó tồn tại chỉ để làm cửa
vào cho một màn không có nav, mà bây giờ màn đó đã có nhãn tab riêng.

### 2.4 Tab 4 — Báo cáo · `/reports` (4 tab con)

| Tab con | `?view=` | Nội dung |
| --- | --- | --- |
| **Biểu đồ** | `charts` (mặc định) | Nút gạt **Tháng \| Năm \| Nhiều năm** nằm *trong* tab này · `CategoryBreakdownCard` · `SpendClassificationCard` · `MonthlyBarsCard` · `NetCashflowCard` · `TagBreakdownCard` · (chế độ Năm: thêm `RemittanceSection`) · (chế độ Nhiều năm: `MultiYearView` — bảng theo năm + `YearBarsCard` + `SeasonalityCard`, lazy-load vì nó tải TOÀN BỘ lịch sử) |
| **Xu hướng** | `trends` | `TrendsView` (5 thẻ) |
| **Thấu hiểu** | `insights` | `InsightsView` (6 thẻ) |
| **Sức khỏe** | `health` | Nội dung `HealthPage` mount thẳng vào đây (bỏ back button) |

**Nhiều năm** (thêm 2026-08-01) là kỳ thứ ba, không phải tab thứ năm: nó vẫn trả lời "xem lát
thời gian nào", nên thuộc nhóm kỳ báo cáo. Nó không có mũi chuyển kỳ trước/sau vì đã là toàn
bộ lịch sử. Chỉ có nghĩa từ khi sổ dài (nạp 9 năm từ Zaim).

Đưa **Tháng | Năm** vào trong tab Biểu đồ là cách sửa gốc lỗi layout nhảy ở §1.4: kỳ báo cáo
chỉ có nghĩa với Biểu đồ, còn Xu hướng (12 tháng), Thấu hiểu (tháng hiện tại) và Sức khỏe
(12 tháng đã hoàn tất) đều tự chốt cửa sổ thời gian của mình. Sau khi đổi, dải tab con luôn
hiện đủ 4 mục, không mục nào tự ẩn.

### 2.5 Tab 5 — Cài đặt · `/settings`

Còn lại đúng cấu hình:

| Khối | Mục |
| --- | --- |
| Quản lý sổ | Tài khoản · Danh mục · Phân loại chi tiêu · Nhãn |
| Thông báo | → `/settings/notifications` |
| Giao diện | `ThemeToggle` ("Giao diện") + `FontSizeToggle` ("Cỡ chữ") — giữ nguyên 2 thẻ, mỗi thẻ đã tự có tiêu đề |
| Dữ liệu & sao lưu | → `/settings/data` → `/settings/import` |
| Hồ sơ | Tên · tháng bắt đầu · tiền gốc · Đăng xuất |

Bỏ khỏi hub: Nợ/cho vay, Giao dịch định kỳ, Nhóm tài sản.

---

## 3. Bản đồ route

### 3.1 Route đổi (7 mục) — mọi đường cũ phải có redirect

| Cũ | Mới | Lý do |
| --- | --- | --- |
| `/reports?view=budget` | `/budget` | Ngân sách là công cụ điều khiển, không phải báo cáo |
| `/health` | `/reports?view=health` | Thành tab con, có nhãn nhìn thấy được |
| `/lifetime` | `/assets?view=future` | Thành tab con, có nhãn nhìn thấy được |
| `/settings/debts` | `/debts` | Nợ là dữ liệu tài chính, không phải cài đặt |
| `/settings/debts/:debtId` | `/debts/:debtId` | ↑ |
| `/settings/asset-groups` | `/assets/groups` | Là cấu hình của trang Tài sản, vào từ header trang đó |
| `/settings/recurring` | `/recurring` | Giao dịch định kỳ là giao dịch, thuộc Sổ |

**`/debts` để ở gốc, không để `/assets/debts`**: `/assets/:accountId` đã chiếm chỗ, và dựa
vào luật "static thắng dynamic" của React Router để `/assets/debts` không bị bắt thành
`accountId="debts"` là một cái bẫy im lặng. Để ở gốc thì hết chuyện.

### 3.2 Một route đổi thêm để hết nhập nhằng

| Cũ | Mới | Lý do |
| --- | --- | --- |
| `/assets/:accountId` | `/assets/account/:accountId` | `/assets/groups` là segment tĩnh nằm cùng cấp với một segment động. Chèn `account/` là hết phụ thuộc thứ tự xếp hạng route. |

### 3.3 Route giữ nguyên (13 mục)

`/login` · `/` · `/transactions` · `/entry` · `/search` · `/assets` · `/reports` ·
`/settings` · `/settings/accounts` · `/settings/categories` ·
`/settings/categories/classify` · `/settings/tags` · `/settings/data` ·
`/settings/import` · `/settings/notifications`

### 3.4 Redirect

Thêm `<Route path="…" element={<Navigate to="…" replace />} />` cho cả 8 đường cũ ở §3.1–3.2.
Bookmark, link trong lịch sử trình duyệt, và ảnh chụp màn hình cũ đều còn dùng được.

PWA shortcuts trong [vite.config.ts:59](../vite.config.ts) chỉ trỏ `/?type=…` nên **không**
ảnh hưởng. Không có test nào hard-code route.

---

## 4. Link nội bộ phải sửa (15 chỗ)

| File | Link hiện tại | Sửa thành |
| --- | --- | --- |
| `assets/AssetsPage.tsx:342` | `/settings/asset-groups` | `/assets/groups` |
| `assets/AssetsPage.tsx:385` | `/settings/debts` | `/debts` |
| `assets/SavingsGoalsSection.tsx` | `/health` | `/reports?view=health` |
| `assets/AssetGroupsPage.tsx` | `/assets` (back) | giữ — nhưng về `?view=now` |
| `reports/ReportsPage.tsx` | card `/health` | **bỏ card** (đã thành tab con) |
| `reports/SubscriptionsCard.tsx` | `/settings/recurring` | `/recurring` |
| `health/HealthPage.tsx` | `/reports` (back) | **bỏ back button** (đã thành tab con) |
| `lifetime/LifetimePage.tsx` | `BackButton` ×3 trạng thái | **bỏ** (đã thành tab con) |
| `lifetime/LifetimeSection.tsx` | `/lifetime` | **xoá cả file** |
| `debts/DebtsPage.tsx` | `/settings` (back) | `/assets` |
| `debts/DebtsPage.tsx` | `/settings/debts/:id` | `/debts/:id` |
| `debts/DebtDetailPage.tsx` ×3 | `/settings/debts` | `/debts` |
| `recurring/RecurringPage.tsx` | `/settings` (back) | `/` |
| `transactions/EntryPage.tsx` | `/reports?view=budget` | `/budget` |
| `transactions/EditTransactionSheet.tsx` | `/settings/debts/:id` | `/debts/:id` |
| `settings/SettingsPage.tsx` | 3 dòng Nợ / Định kỳ / Nhóm TK | **bỏ 3 dòng** |

Không phải sửa: `budgets/AxisTargetsCard.tsx` (`/settings?edit=profile`,
`/settings/categories/classify`), `reports/SpendClassificationCard.tsx`,
`reports/TagBreakdownCard.tsx`, `reports/SpendSizeCard.tsx`,
`assets/InvestmentPerformanceSection.tsx`, `notifications/NotificationSheet.tsx`,
`settings/DataPage.tsx`, `import/ImportCsvPage.tsx`, các trang con của Cài đặt còn lại —
tất cả trỏ vào route không đổi.

---

## 5. Thứ tự thi công — 5 bước độc lập

Mỗi bước tự đứng được: build xanh, app dùng được, ship riêng được. Không bước nào bắt buộc
phải làm cùng bước sau.

### Bước 1 — Nav 5 tab + tách Ngân sách
- `AppLayout.tsx`: `TABS` 4 → 5 mục; phím tắt `1–5` (vòng lặp đã dùng `TABS.length` nên tự theo).
- Route mới `/budget` render `BudgetView` + header điều hướng tháng riêng.
- Redirect `/reports?view=budget` → `/budget`.
- `ReportsPage`: bỏ `'budget'` khỏi `VIEW_TABS` và khỏi `ReportView`.
- Sửa `EntryPage` link.

**Xong bước này**: nav đã đúng, chưa đụng nội dung màn nào khác.

### Bước 2 — Dọn Cài đặt (3 route ra khỏi `/settings/*`)
- Đổi 4 route: `/debts`, `/debts/:debtId`, `/assets/groups`, `/recurring` + 4 redirect.
- Đổi `/assets/:accountId` → `/assets/account/:accountId` + redirect (§3.2).
- Sửa 12 link ở §4 liên quan.
- `SettingsPage`: bỏ 3 dòng, gộp Theme + Font thành khối "Giao diện" có tiêu đề.
- `LedgerPage`: thêm icon Định kỳ ở header.

**Xong bước này**: Cài đặt còn thuần cấu hình; Nợ/Định kỳ/Nhóm TK vào từ đúng ngữ cảnh.

### Bước 3 — Báo cáo 4 tab con
- Đưa nút gạt **Tháng | Năm** vào trong nhánh `view === 'charts'`.
- Thêm `'health'` vào `VIEW_TABS`; tách thân `HealthPage` thành `HealthView` (bỏ back button),
  `ReportsPage` mount nó ở `view === 'health'`.
- Bỏ card lối vào `/health` giữa trang; redirect `/health` → `/reports?view=health`.

**Xong bước này**: hết layout nhảy khi đổi kỳ; Sức khỏe có nhãn nav.

### Bước 4 — Tài sản 3 tab con
- Tách `AssetsPage.tsx` (780 dòng) thành `AssetsNowView` / `AssetsTrendView` + vỏ `AssetsPage`
  giữ header, `PrivacyToggle` và `SegmentedControl` 3 mục.
- Tách thân `LifetimePage` thành `LifetimeView` (bỏ `BackButton` ×3 trạng thái); mount ở
  `view === 'future'`; redirect `/lifetime` → `/assets?view=future`.
- Xoá `LifetimeSection.tsx`.

**Xong bước này**: trang 780 dòng chia theo 3 câu hỏi; Lifetime có nhãn nav.

### Bước 5 — Rà lại
- `oxlint` + `vitest run` + build.
- Đi thử 8 redirect trên preview.
- Kiểm 5 tab × mọi tab con ở cả light/dark, mobile/desktop.

---

## 6. Đã chốt / còn mở

**Chốt** (2026-07-31): 5 tab · Sức khỏe và Lifetime thành tab con · làm bản đồ IA trước khi code.

**Đã thi công xong cả 5 bước** (2026-07-31). Ba quyết định để mở nay đã chốt khi làm:
- **Mục tiêu tiết kiệm** → Tài sản / Diễn biến, vì nó đọc cùng con số tài sản ròng.
- **Icon tab Ngân sách** → `Target` (hạn mức đặt ra).
- **Nhãn tab** → "Sổ" (rút từ "Sổ GD"), vì "Ngân sách" là nhãn dài nhất và 5 ô thì mỗi ô hẹp hơn.

**Ba việc phát sinh khi làm, ngoài kế hoạch ban đầu:**

1. **Tổ hợp chết trong Báo cáo.** Việc dải tab tự ẩn ở chế độ Năm đang *che* một lỗi thật:
   ba nhánh nội dung đều viết `period === 'month' && view === '…'`. Khi dải tab luôn hiện,
   đứng ở Năm rồi bấm Xu hướng sẽ ra trang trắng. Đã bỏ điều kiện `period` khỏi ba tab
   không theo kỳ (Xu hướng, Thấu hiểu, Sức khỏe); nay `period` chỉ còn nghĩa trong Biểu đồ,
   kể cả ở query dữ liệu năm và ở cảnh báo thiếu tỷ giá.

2. **Tab Báo cáo chuyển từ `useState` sang URL.** Nếu không, đường chuyển tiếp
   `/health` → `/reports?view=health` để `view=health` kẹt lại trong thanh địa chỉ: bấm
   sang tab khác không xoá nó, tải lại trang là quay về Sức khỏe. Nay tab Tài sản và tab
   Báo cáo dùng chung một lối (`?view=` + `setSearchParams(replace)`).

3. **Tầng dữ liệu dùng chung của Tài sản** (`useAssetsData.ts`). Hai tab Hiện tại và Diễn
   biến cần cùng một phép tính số dư → `assetBreakdown` → cộng công nợ. Tách thành hook
   thay vì chọc prop qua vỏ; react-query dùng chung cache nên không thêm request nào.

**Kết quả đo được sau khi làm:**

| | Trước | Sau |
| --- | --- | --- |
| Màn dưới `/settings/*` | 11 / 20 | 7 / 19 |
| Màn không có nhãn trong nav | 2 (`/health`, `/lifetime`) | 0 |
| Tổ hợp tab × kỳ ra trang trắng | 3 | 0 |
| Trang Tài sản | 1 file 780 dòng, 3 câu hỏi | 4 file: 696 (Hiện tại) + 24 (Diễn biến) + 87 (vỏ) + 102 (hook dữ liệu chung) |

Tổng số dòng của khối Tài sản **tăng** (780 → 909): thêm vỏ, thêm hook, thêm chú thích.
Đó không phải thất bại của việc tách — mục tiêu không bao giờ là ít dòng hơn, mà là một
file không còn trả lời ba câu hỏi khác nhau trong cùng một mạch cuộn.

Kiểm chứng: `tsc` sạch · 841 test qua · build xanh · 8 đường chuyển tiếp đi thử thật trên
preview đều tới đúng đích và tải đúng dữ liệu.

---

## 7. Việc phát sinh sau khi rà lại (cùng ngày)

### 7.1 Năm deep-link nữa bị bỏ sót — §4 liệt kê thiếu

Bảng "15 chỗ link nội bộ phải sửa" ở §4 **thiếu bộ luật thông báo**. Năm chỗ nữa còn trỏ
đường cũ, tìm ra bằng grep tay:

| File | Cũ | Mới |
| --- | --- | --- |
| `notifications/rules/budgetRules.ts:13` | `const BUDGET_ROUTE = '/reports?view=budget'` | `'/budget'` |
| `notifications/rules/debtRules.ts:11` | `const DEBTS_ROUTE = '/settings/debts'` | `'/debts'` |
| `notifications/rules/rhythmRules.ts:66` | `to: '/settings/recurring'` | `'/recurring'` |
| `notifications/rules/accountRules.ts:130,154` | `` to: `/assets/${…}` `` | `` `/assets/account/${…}` `` |
| `notifications/rules/cardRules.ts:40` | `` to: `/assets/${a.id}` `` | `` `/assets/account/${a.id}` `` |

Cả 5 **vẫn chạy** nhờ route chuyển tiếp, nên 841 phép thử xanh y nguyên và không gì báo.
Đó mới là chỗ đáng lo: route chuyển tiếp có mặt để bookmark và lịch sử trình duyệt của
NGƯỜI DÙNG còn dùng được, không phải để làm đường ống nội bộ. Dùng nó bên trong app nghĩa
là một ngày dọn route cũ là đứt link mà không có gì báo trước.

### 7.2 Chốt tự động: `src/routeLinks.test.ts`

Bốn phép thử đọc `App.tsx` bằng `import.meta.glob('?raw')` (cùng lối `purity.test.ts`),
bóc mọi đường dẫn viết cứng trong `src`, rồi canh hai điều:

1. **Mọi link trỏ vào một route thật** — bắt link mồ côi (route đã bị xoá/đổi tên).
2. **Không link nào trỏ vào route chuyển tiếp** — bắt đúng loại lỗi ở §7.1.

Hai chi tiết làm nó không bị mù:

- **Bắt theo VỊ TRÍ, không quét bừa mọi chuỗi trông giống đường dẫn.** Chú thích trong
  `App.tsx` nhắc `/settings/debts`, `/reports?view=budget` để giải thích vì sao có route
  chuyển tiếp — quét bừa là chính những chú thích ĐÚNG đó làm phép thử đỏ. Và trong
  `App.tsx` phải bỏ `path="…"` (định nghĩa route, không phải link).
- **Segment nội suy (`${a.id}`) chỉ khớp segment động (`:accountId`), không khớp segment
  tĩnh.** Nới ra là `/assets/${a.id}` được tính là khớp `/assets/groups`, tức bỏ qua đúng
  cái bug vừa sửa.

### 7.3 Bản đầu của chốt đó ĐÃ HỎNG — và chỉ phá hoại có chủ đích mới lộ

Bản đầu chỉ bắt `to: '…'` viết thẳng, nên **bỏ sót 2 trong 5 lỗi**: `budgetRules` và
`debtRules` gán qua hằng số (`to: DEBTS_ROUTE`). Dựng lại lỗi `debtRules` → phép thử **vẫn
xanh**. Đã thêm dạng `const X = '/…'`, rồi chứng minh nó đỏ với cả ba hình dạng lỗi:

| Lỗi dựng lại | Phép thử đỏ |
| --- | --- |
| `debtRules` → `/settings/debts` (hằng số → route chuyển tiếp) | ✔ `không link nào trỏ vào route chuyển tiếp` |
| `rhythmRules` → `/settings/dinh-ky-khong-ton-tai` (link mồ côi) | ✔ `mọi link trỏ vào một route thật` |
| `cardRules` → `` `/assets/${a.id}` `` (template → route chuyển tiếp) | ✔ `không link nào trỏ vào route chuyển tiếp` |

Bài học đáng ghi hơn cả bản sửa: **một phép thử mới xanh chưa chứng minh gì.** Phải dựng
lại đúng lỗi nó nói là mình canh, và thấy nó đỏ.

Sau §7: 845 test (thêm 4) · `tsc` sạch · build xanh · lint giữ nguyên 6 cảnh báo cũ.
