# Áp các mẫu thiết kế của permtrack.app + nới rộng giao diện PC

Ngày: 2026-08-06 · Nhánh: `feat/mau-permtrack` (worktree `.claude/worktrees/mm-permtrack`, tách từ `master` tại 7b0732e)

## Vì sao làm

Đọc permtrack.app thấy vài mẫu trình bày dữ liệu mà app đang thiếu, chủ yếu xoay quanh
một câu hỏi: **nhìn một con số, có biết nó lấy lúc nào và đáng tin tới đâu không.**
Cộng thêm một việc riêng: trên màn PC app đang bó ở bề ngang của điện thoại.

Những mẫu app **đã có rồi** nên không làm lại: câu kết luận dưới biểu đồ (`VerdictNote`),
hộp giải thích cách tính (`ExplainBox`), nút đổi kỳ (`SegmentedControl`), bấm để xem chi
tiết (`CategoryDetailPage`), dự báo cuối tháng (`monthPace`), phân vị chi tiêu
(`SpendSizeCard` — đã có trung vị/p75/p90 và cảnh báo lệch).

## Ràng buộc

- Bộ luật `tests/designSystem.test.ts` phải xanh. Nó cấm cứng một số màu/cỡ chữ và
  chỉ cho phép **giảm** vài ngưỡng đếm — thẻ mới không được làm tăng.
- Không đụng thư mục làm việc chính: nó đang ở nhánh `feat/canh-bao-ty-gia-cu` với sửa
  đổi chưa commit của phiên khác.
- Chữ trong app dùng tiếng Việt đơn giản, tránh từ chuyên ngành.
- Hàm tính toán tách khỏi component để test được bằng vitest.

## Việc chia làm bốn đợt

Mỗi đợt commit riêng, xong là xem được kết quả.

---

## Đợt 0 — Nới rộng giao diện PC

### Vấn đề

`src/components/AppLayout.tsx:192` khoá cột nội dung ở `max-w-2xl` (672px). Trên màn
1440px, sau khi trừ thanh bên 224px thì còn hơn 500px bỏ trống. permtrack ở cùng bề
ngang đó cho nội dung rộng ~1100px và xếp 3 ô số liệu cạnh nhau.

### Cách làm

1. `AppLayout` đổi `max-w-2xl` → `max-w-6xl` (1152px).
2. Trang nào cần hẹp thì **tự bọc** `mx-auto max-w-2xl`: Sổ giao dịch, màn Nhập, Cài đặt
   và các trang con của Cài đặt. Lý do chọn cách này thay vì truyền prop hay dùng
   context: mỗi trang tự khai bề rộng của mình, đọc file trang là thấy, không phải lần
   ngược lên layout.
3. Báo cáo và Tài sản: bọc danh sách thẻ trong `lg:grid lg:grid-cols-2 lg:gap-3`. Thẻ có
   biểu đồ ngang dài thì `lg:col-span-2` — cụ thể: `MonthlyBarsCard`, `NetCashflowCard`,
   `SpendHeatmapCard`, `MultiYearView`.

### Rủi ro đã biết

- **Mục lục nhảy khối** (`SectionIndex` + `sectionActive.ts`) tính khối nào đang xem theo
  vị trí dọc. Khi hai thẻ nằm cạnh nhau, hai khối có cùng độ cao đầu → phải kiểm lại
  `pickActive` còn chọn đúng không. Nếu hỏng thì cho mục lục **chỉ hiện dưới `lg`**
  (trên PC thấy hết màn rồi, mục lục bớt cần).
- Biểu đồ recharts dùng `ResponsiveContainer` nên tự co, không phải sửa từng cái.

### Kiểm

Mở app ở 1440×900 và 390×844, xem cả sáng lẫn tối. Chụp màn để đối chiếu.

---

## Đợt A — Số này lấy lúc nào, đáng tin tới đâu (mục 1 + 2)

### A1. Dòng gộp tuổi dữ liệu

Component mới `src/components/DataFreshness.tsx`. Hình dạng: một chấm màu + một dòng
chữ nhỏ — *"Tỷ giá 3 giờ trước · Giá cổ phiếu hôm qua"*. Bấm vào xổ ra từng nguồn kèm
mốc giờ cụ thể.

Đặt ở đầu trang Tài sản và đầu trang Báo cáo.

Ba nguồn:

| Nguồn | Lấy tuổi ở đâu |
|---|---|
| Tỷ giá | mốc `fetchedAt` trong cache `sct-rates-<base>` |
| Giá cổ phiếu | `session` và `staleSymbols` của `holdings.ts:152` |
| Giá trị tự khai | ngày định giá gần nhất của tài sản |

**Về phần tỷ giá:** phiên khác đang dựng `readRatesMeta`/`rateAgeDays`/`STALE_RATE_DAYS`
trong `src/lib/rates.ts` (đã có test, chưa có thân hàm). Để hai việc không giẫm chân
nhau, `DataFreshness` **không tự đọc cache** — nó nhận mốc thời gian qua tham số. Hàm
thuần:

```
freshnessSummary(input: {
  ratesFetchedAt: number | null
  priceSession: string | null      // ngày phiên gần nhất, ISO
  staleSymbolCount: number
  lastValuationOn: string | null
  nowMs: number
}): { tone: 'ok' | 'warn'; line: string; details: FreshnessDetail[] }
```

Ai cấp `ratesFetchedAt` cũng được — `readRatesMeta` khi nhánh kia về, hoặc một hàm đọc
cache 3 dòng nếu chưa. Module này không phải sửa.

Ngưỡng: tỷ giá quá 3 ngày → `warn` (khớp `STALE_RATE_DAYS` phiên kia đã chốt). Giá cổ
phiếu cũ hơn phiên gần nhất → `warn`. Định giá tự khai quá 90 ngày → `warn`.

### A2. Dấu "số ước tính"

Component `src/components/EstimateMark.tsx`: một dấu nhỏ đặt cạnh con số, chạm/bấm thì
hiện một câu giải thích vì sao nó là ước tính.

Gắn ở bốn chỗ:

- khấu hao tài sản (`depreciation.ts`)
- chiếu tài sản cả đời (`features/lifetime`)
- dự phóng ngày đạt mục tiêu tiết kiệm (`goals.ts`)
- giá cổ phiếu thuộc `staleSymbols`

Không gắn ở số dư tài khoản, số tiền giao dịch, tổng thu/chi — những số đó là thật.

### Kiểm

`freshnessSummary` có test vitest phủ: đủ ba nguồn, thiếu từng nguồn, mốc ở tương lai
(đồng hồ máy lệch), đúng ngưỡng cảnh báo.

---

## Đợt B — Đọc là hiểu ngay (mục 3, 4, 5, 6)

### B1. Câu tổng đầu trang Báo cáo

permtrack mở đầu bằng 3 số to rồi **một câu văn nối chúng lại**. App có câu kết luận ở
từng thẻ nhưng chưa có câu tổng cho cả trang.

Component `PeriodHeadline`: ba `StatTile` (Thu / Chi / Giữ lại) + một câu dựng từ
`VerdictNote`. Đặt ngay dưới thanh chọn kỳ, trên `SectionIndex`.

Câu văn dựng bằng hàm thuần `headlineOf(sums, prior, periodNoun)` — trả về `{ tone, parts }`,
không trả JSX, để test được bằng chuỗi.

### B2. So tuần đang dở cho công bằng

`weekPace`, viết theo đúng khuôn `monthPace.tsx` đã có: so tuần này với tuần trước
**tính tới cùng số ngày**, không so tuần dở với tuần đủ.

Chữ hiện ra: *"Ngày 4/7 — đã chi 12.300 ¥, nhanh hơn nhịp tuần trước 8%."*

Đặt trong tab Thấu hiểu (`InsightsView`).

### B3. Bảng chi chưa gắn danh mục, cũ nhất trước

**Lưu ý tên gọi:** `unclassifiedCount` đang có trong `ReportsPage` là **số danh mục** lá
thiếu `need_level`/`cost_type` — không phải cái này. Cái làm ở đây là **giao dịch** có
`category_id === null`.

Component `UncategorizedBacklogCard`. Mỗi dòng là một tháng: còn bao nhiêu khoản chưa
gắn, đã gắn được bao nhiêu phần trăm, sắp xếp **tháng cũ nhất lên trước** (giống
permtrack xếp cohort cũ nhất trước). Tháng đã gắn đủ 100% thì không hiện.

Bấm dòng → mở `/search` đã lọc sẵn tháng đó và chỉ hiện khoản chưa gắn danh mục.
`SearchPage` hiện chưa có bộ lọc "chưa gắn danh mục", nên phải thêm:

- thêm `uncategorized?: boolean` vào `TxFilter` và nhánh lọc tương ứng ở repo
- `SearchPage` đọc `?uncat=1` lúc mount, giống cách nó đang đọc `?tags=`
- một ô tích trong khối lọc để người dùng tự bật/tắt

Hàm thuần `uncategorizedByMonth(txs)` → mảng `{ monthKey, pending, total, doneRatio }`.

Ẩn cả thẻ khi không còn khoản nào chưa gắn.

### B4. Cột phân bố trong `SpendSizeCard`

Giữ nguyên phần phân vị đang có. Thêm:

- một biểu đồ cột nhỏ (histogram) cho biết các lần chi rơi vào khoảng tiền nào
- một dòng chữ: *"90% số lần chi nằm trong khoảng X – Y"* (p5 đến p95, giống cách
  permtrack diễn giải P5/P95 ở trang lương)

Hàm thuần `spendHistogram(amounts, binCount)` → `{ bins, p5, p95 }`. Số cột chọn theo
số lần chi, tối đa 12 để trên điện thoại còn đọc được. Vẽ bằng SVG thuần (12 cột thì
gọi cả recharts là phí).

`behavior.ts` đã tính phân vị — thêm p5/p95 vào `SpendPercentiles` thay vì tính lại.

---

## Đợt C — Cảm giác mượt (mục 7, 8)

### C1. Khung xương lúc chờ

`App.tsx:68` đang dùng `const Loading = () => <p>Đang tải…</p>` cho mọi trang lazy.
Thay bằng `PageSkeleton` với ba dáng:

- `list` — Sổ giao dịch, Tìm kiếm
- `cards` — Báo cáo, Tài sản, Ngân sách
- `table` — Nợ, Định kỳ

Dùng `animate-pulse` của Tailwind. Kích thước khối xương phải khớp nội dung thật, nếu
không thì lúc thay vào trang giật một cái — như vậy còn tệ hơn chữ "Đang tải…".

### C2. Đường xu hướng tí hon

`src/components/ui/Sparkline.tsx` — SVG thuần, nhận `values: number[]`, vẽ một đường
gọn trong khoảng 60×20px. Không dùng recharts.

Dùng ở dòng tài khoản trang Tài sản: 12 tháng số dư gần nhất. Kèm chữ delta bên cạnh
theo mẫu permtrack (*"−7 tháng"* của họ → *"+12%"* của mình).

Màu đường phải đạt tương phản 3:1 (luật `designSystem.test.ts` cấm hex trượt ngưỡng làm
nét đồ thị) — dùng token, không viết hex.

---

## Thứ tự và cách kiểm

0 → A → B → C. Đợt 0 trước vì các thẻ mới của đợt B sẽ nằm trên nền lưới đó; làm ngược
lại thì phải xếp lại lần nữa.

Cuối mỗi đợt:

1. `npx vitest run` — toàn bộ test, gồm `tests/designSystem.test.ts`
2. `npm run build`
3. Mở app xem thật ở cả hai bề ngang và cả hai chế độ sáng/tối
4. Commit

## Cố ý không làm

- Không đổi recharts sang SVG viết tay như permtrack: công lớn, lợi ích chỉ là nhẹ hơn
  vài chục KB. Chỉ dùng SVG thuần cho hai thứ nhỏ mới (`Sparkline`, histogram).
- Không làm danh sách theo dõi/gửi thư như permtrack: app đã có thông báo riêng.
- Không đụng vào `rates.ts` để tránh giẫm chân phiên đang làm cảnh báo tỷ giá cũ.
