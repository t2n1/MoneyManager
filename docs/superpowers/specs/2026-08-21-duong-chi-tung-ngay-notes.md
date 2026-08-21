# Đường chi từng ngày trong tháng — ghi chép khi làm

Ngày 2026-08-21. Yêu cầu: một biểu đồ đường từ đầu tháng tới cuối tháng, xem ngày nào
chi giật lên cao nhất để đi tra ngày đó có biến động gì.

## Chốt với user

1. **Chỗ đặt: trang Bản tin**, không phải trang Ngân sách (user tự đề xuất, tôi đồng ý).
   Lý do: Bản tin trả lời "tình hình thế nào", đúng câu hỏi này; nó ghép cặp thu-phóng với
   thẻ "Dòng tiền 8 tháng" sẵn có; và `BulletinPage.tsx:171` ĐÃ gọi `useMonthPace(activeMonthKey)`
   nên không tốn thêm truy vấn nào.
2. **Xoá lịch ô vuông** (`SpendHeatmapCard` + `MonthSpendCalendar`) — user nói "không hữu ích
   cho lắm". Cùng bộ số, mà app có luật không vẽ một bộ số hai lần.
3. **Chạm/hover hiện chi tiết**: ngày + tổng chi + 3 khoản lớn nhất kèm danh mục. Không nhảy
   trang. Đây là phần trả lời "ngày đó có biến động gì".

## Đường ĐÃ LOẠI và vì sao

**Sửa `dailyExpenseTotals` để nó trả thêm top-3 mỗi ngày** — đây là thiết kế ban đầu, đã bỏ
sau khi chạy `impact`. Kết quả: MEDIUM risk, **7 caller trực tiếp** — `rhythm`
(HealthView), `dailyOf` + `monthExpenseCompare` (aggregate), `sixMonthDaily` (MonthView),
và bốn chuỗi ngày trong `monthPace.tsx`. Trong đó `sixMonthDaily` chạy trên 180 ngày và
`rhythm` trên cả năm: bắt chúng gom top-3 mỗi ngày cho một thẻ duy nhất cần là phí, và
`DailyExpensePoint` phình ra ở mọi chỗ dùng.

→ Thay bằng **file thuần mới `src/features/reports/dailySpike.ts`**, blast radius bằng 0,
đúng quy ước "toán thuần nằm ngoài React, có unit test" của repo (tiền lệ: `budgetVerdict.ts`,
`weekPace.ts`).

## Phân tích ảnh hưởng (bắt buộc theo CLAUDE.md)

- `dailyExpenseTotals` — MEDIUM, 7 caller. **KHÔNG sửa nữa** (xem trên).
- `SpendHeatmapCard` — **HIGH**, nhưng chỉ có MỘT caller trực tiếp là `MonthSpendCalendar`,
  rồi `BudgetView` → `BudgetPage`. Cả ba đều nằm trong phạm vi việc này, nên HIGH ở đây là
  "xoá một thẻ khỏi một trang", không phải rủi ro lan ra ngoài. Đã báo user.

## Hình dạng module thuần

`dailySpendSeries(txs, startISO, lastISO, currencyOf, base, rates, transferIds)` →
`{ days: { date, total, top: {categoryId, note, amount}[] }[], typical, peakIndex, hasMissingRate }`

- `typical` = **trung vị các ngày CÓ chi**, không phải trung bình cả tháng: một ngày trả
  tiền nhà kéo trung bình lệch hẳn, mà đây là đường "mức thường ngày" để so đỉnh.
- `peakIndex` = ngày cao nhất; bằng nhau thì lấy ngày SỚM nhất; -1 khi cả tháng không chi.
- `top` trả về id danh mục + note thô, KHÔNG trả tên: tên danh mục là việc của UI.
- Cùng luật loại trừ với `aggregate.ts`: bỏ `is_debt_flow`, `exclude_from_stats`, danh mục
  `kind='transfer'`; `is_refund` là chi ÂM (`expenseSign`); thiếu tỷ giá thì loại khoản đó
  và bật `hasMissingRate` (không quy 1:1).

## Test phải sửa vì xoá lịch

`tests/budgetLayout.test.ts` (mảng `BLOCKS`, mốc `<MonthSpendCalendar`) và
`tests/contrast.test.ts`.

## Tiến độ

- [x] Khảo sát + chốt thiết kế
- [x] RED: `src/features/reports/dailySpike.test.ts` — 18 phép thử, fail vì thiếu module
- [x] GREEN: `src/features/reports/dailySpike.ts` — 18/18 xanh
- [x] Thẻ `src/features/bulletin/DailySpendPanel.tsx`, chèn vào `BulletinPage`
- [x] Xoá `SpendHeatmapCard.tsx` + `MonthSpendCalendar`; sửa `budgetLayout.test.ts` và `contrast.test.ts`
- [x] `npm test` 2946/2946 xanh · `tsc -b` sạch · `oxlint` sạch
- [x] Xem thật trên trình duyệt (chế độ demo, cổng 5174) — xem "Đo được gì" bên dưới
- [x] Bài canh mới `tests/duongChiTungNgay.test.ts` (7 phép thử) · tổng 2954 phép thử xanh

## Hai chỗ va phải khi cài đặt

1. `BulletinPage` ĐÃ có `useMonthTransactions(activeMonthKey)` cho khối "Giao dịch gần đây"
   (dòng ~223) — thêm cái thứ hai là `Cannot redeclare 'monthTxs'`. Gộp về một lần gọi,
   lấy thêm `range` từ nó thay vì tự gọi `getMonthRange`.
2. `designSystem.test.ts` canh ngưỡng số chỗ viết tay `font-mono tabular-nums` (≤ 85). Viết
   tay trong tooltip là chạm ngưỡng ngay → dùng `<Money>`. `ReferenceDot` của recharts v3
   cũng không còn prop `isFront`.

## Đo được gì trên trình duyệt (demo, 2026-08-21)

Dữ liệu demo tháng 8: thẻ đọc ra "thường ngày 10k · Cao nhất 21/08 — ¥69,060, gấp 7 lần
ngày thường · 21/08: Tiền thuê nhà tháng này ¥68,000 · Cơm trưa ¥850 · Tàu điện ¥210".

- **1280px**: svg 1147×176, nhãn trục 01/08 → 31/08 (7 nhãn, `interval={4}`), nhãn cuối
  nằm TRONG mép 2px sau khi đổi `right` 14 → 18. Không tràn ngang.
- **375px**: svg 317×176, 7 nhãn, không cặp nào đè nhau, thẻ cao 293px, không tràn ngang.
  Dòng chi tiết ngày đỉnh chiếm đúng 2 dòng, không bị cắt (đã đổi `truncate` → `line-clamp-2`;
  với `truncate` thì ở 375px chỉ thấy khoản ĐẦU).
- **Đường cắt đúng hôm nay**: điểm cuối ở x=767 (21/08), không kéo phẳng tới 31/08.
- **Chấm đỉnh** cx=767,3 cy=26,87 — trùng khít điểm cuối của đường.
- **Màu theo chế độ**: đường + chấm = `--money-out` (sáng oklch(0.505…) = red-700, tối
  oklch(0.704…) = red-400); viền chấm = `--surface`; đường ngang = `--fg-muted`. Cả ba lật
  đúng chiều khi bỏ class `dark`.

## CHƯA kiểm được, phải làm bằng tay

**Tooltip khi trỏ/chạm.** Browser pane của session này không hiện nên `document.hidden === true`
và `requestAnimationFrame` KHÔNG chạy — recharts kích hoạt tooltip qua RAF nên bắn
`mousemove`/`pointermove` tổng hợp đều không lên. Đã xác nhận wrapper của recharts có sẵn
`onMouseMove`, `onTouchStart`, `onTouchMove` (tức chạm trên điện thoại có đường vào), nhưng
NỘI DUNG tooltip (`DayTip`) chưa được render lần nào. Repo không khai `test.environment` nên
cũng không render-test được. Việc còn lại: mở app thật, trỏ vào một điểm và chạm trên điện
thoại, xem `DayTip` ra đúng ngày + tổng + 3 khoản.
