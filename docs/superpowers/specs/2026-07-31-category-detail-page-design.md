# Trang chi tiết danh mục (từ báo cáo)

Ngày: 2026-07-31

## 1. Mục tiêu

Trong trang Báo cáo → thẻ "Cơ cấu theo danh mục", khi bấm vào một **danh mục con**,
mở một **trang riêng** hiển thị:

- **Graph** xu hướng của riêng danh mục đó (theo tháng/năm đang xem).
- **Danh sách giao dịch** của danh mục trong kỳ đó, bấm vào sửa được.

## 2. Luồng bấm (thẻ Cơ cấu theo danh mục)

Giữ nguyên hành vi hiện có, chỉ thêm điều hướng:

- Bấm **danh mục cha có con** → vẫn xổ ra tại chỗ (đường xu hướng + danh mục con). KHÔNG điều hướng.
- Bấm **danh mục con** → mở `/reports/category/<id>?period=month&ym=YYYY-MM`
  (hoặc `?period=year&year=YYYY`).
- Bấm dòng **"(trực tiếp)"** → mở trang chi tiết lọc đúng phần gắn thẳng vào cha (chỉ `category_id === parentId`).
- Bấm **danh mục cha KHÔNG có con** → điều hướng thẳng sang trang chi tiết (không có gì để xổ).

Dòng "Khác (n mục)" gộp đuôi: không bấm được (giữ nguyên).

## 3. Định tuyến

Route mới: `/reports/category/:categoryId`

Query:
- `period`: `month` | `year` (mặc định `month` nếu thiếu/không hợp lệ).
- `ym`: `YYYY-MM` (khi period=month).
- `year`: `YYYY` (khi period=year).

Thẻ Cơ cấu tự đính kèm đúng `period` + `ym`/`year` của kỳ đang xem, nên trang chi tiết
biết đúng khung thời gian. Nút quay lại trỏ `/reports?period=…&ym=…` để về đúng kỳ cũ
(ReportsPage đã đọc `period`/`ym`/`year` lúc khởi tạo).

## 4. Trang chi tiết — bố cục (trên xuống)

1. Thanh đầu: nút **quay lại** (Link `/reports?period=…&ym=…`), icon + tên danh mục.
2. Dòng kỳ: **◀ Tháng M/YYYY ▶** (period=month) hoặc **◀ YYYY ▶** (period=year).
   Mũi tên đổi kỳ ngay tại trang (cập nhật `ym`/`year` trên URL → fetch lại).
3. **Tổng** chi (hoặc thu) của danh mục trong kỳ đang xem.
4. **Graph**: đường xu hướng của riêng danh mục.
   - period=month → 6 tháng gần nhất (kết ở tháng đang xem).
   - period=year → 12 tháng của năm đang xem.
   Dùng `categoryMonthlySeries` + `CategoryLineChart`.
5. **Danh sách giao dịch** của danh mục **trong kỳ đang xem** (chỉ tháng đó / năm đó),
   gom theo ngày, bấm mở `EditTransactionSheet`. Dùng lại `TransactionItem`.

## 5. Dữ liệu

- Loại (`expense`/`income`) suy từ chính `category.type`.
- Một lần fetch cửa sổ rộng (6 hoặc 12 tháng) bằng `useRangeTransactions`.
  - Graph: `categoryMonthlySeries(txs, windowMonths, kind, new Set([categoryId]), …)`.
  - Danh sách: lọc `txs` theo `category_id === categoryId` **và** ngày rơi trong kỳ đang xem
    (`getMonthRange`/`getYearRange`), gom theo `occurred_on`.
  - Tổng: cộng danh sách đã lọc (quy đổi base như các thẻ khác; hoàn tiền tính âm bằng `expenseSign`).
- `categoryId` không hợp lệ (không thấy trong `categories`) → hiện thông báo nhẹ + nút quay lại.

## 6. Dùng lại / thành phần

- Dùng lại: `categoryMonthlySeries`, `CategoryLineChart`, `TransactionItem`, `EditTransactionSheet`,
  `getMonthRange`/`getYearRange`, `addMonths`, `sumIncomeExpense` (hoặc cộng tay theo `expenseSign`).
- Mới:
  - `src/features/reports/CategoryDetailPage.tsx` — trang chi tiết (lazy route).
  - Sửa `CategoryBreakdownCard.tsx` — bọc dòng con / "(trực tiếp)" / cha-không-con bằng `Link`;
    nhận thêm props `periodType` + `periodKey` để dựng URL.
  - Sửa `ReportsPage.tsx` — truyền `periodType`/`periodKey` xuống thẻ.
  - Sửa `App.tsx` — thêm route.

## 7. Phạm vi (YAGNI)

- Không đổi cách tính số liệu hiện có, không refactor ngoài phạm vi.
- Không thêm bộ lọc (tài khoản, nhãn…) trên trang chi tiết — đã có trang Tìm kiếm cho việc đó.
- Chỉ danh mục con (và trực tiếp/cha-không-con) mở trang; cha có con vẫn xổ tại chỗ.

## 8. Kiểm thử

- Unit: hàm lọc "giao dịch của danh mục trong kỳ" (thuần) — đúng kỳ, đúng category_id, bỏ
  transfer/is_debt_flow/exclude_from_stats, hoàn tiền tính âm.
- Tay: bấm con → sang trang; đổi tháng/năm bằng mũi tên; bấm giao dịch → sửa; quay lại đúng kỳ.
