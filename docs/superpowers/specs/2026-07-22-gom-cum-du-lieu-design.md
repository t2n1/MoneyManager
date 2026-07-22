# Thiết kế: Gom các chức năng dữ liệu vào một trang "Dữ liệu & sao lưu"

Ngày: 2026-07-22

## Bối cảnh & vấn đề

Các chức năng "đưa dữ liệu vào / lấy dữ liệu ra" đang nằm rải rác ở 2 trang, và một số ít khi dùng:

| Tính năng | Đang ở đâu | Gắn với kỳ (tháng/năm)? |
|---|---|---|
| Xuất PDF / In báo cáo | Trang Báo cáo (`ReportsPage`) | Có |
| Xuất CSV giao dịch | Trang Báo cáo (`ReportsPage`) | Có |
| Nhập giao dịch từ CSV | Cài đặt → mục "Quản lý" → `/settings/import` | Không |
| Sao lưu / Khôi phục JSON | Cài đặt → `BackupSection` | Không |

Người dùng muốn gom tất cả về **một cụm duy nhất**. Người dùng chấp nhận việc tự chọn kỳ (tháng/năm) khi cần xuất, vì các chức năng này ít dùng.

## Quyết định đã chốt

- **Cách gom:** Tạo một trang riêng "Dữ liệu & sao lưu", vào từ **một mục duy nhất** trong Cài đặt.
- **Nhập CSV:** Trang Dữ liệu chỉ có một dòng bấm để **mở trang Nhập CSV hiện có** (`/settings/import`), không nhúng luồng phức tạp vào.
- **Xuất PDF:** **Giữ**. Nút mở lại trang Báo cáo đúng kỳ đã chọn kèm cờ in, trang Báo cáo tự bật hộp thoại in sau khi dữ liệu/biểu đồ vẽ xong.

## Thiết kế

### 1. Trang mới `DataPage`

- File: `src/features/settings/DataPage.tsx`
- Route: `/settings/data` (lazy, thêm trong `src/App.tsx`)
- Có header + nút quay lại `/settings` (theo mẫu `ImportCsvPage`)
- Tiêu đề: "Dữ liệu & sao lưu"

Gồm **3 khối**:

**Khối A — Xuất báo cáo & giao dịch** (component nội bộ, ví dụ `ExportSection`)
- Bộ chọn kỳ: nút gạt *Tháng | Năm* + điều hướng `‹ ›` với nhãn kỳ, theo đúng mẫu đang có ở `ReportsPage` (dùng `addMonths`, `formatMonthLabel`, `formatYearLabel`, `monthKeyForDate`, `getYearRange`).
- Mặc định: kỳ = tháng hiện tại (theo `month_start_day` của profile).
- Nút **Tải CSV**: lấy giao dịch của kỳ đã chọn, dựng CSV bằng `buildTransactionsCsv` (từ `../reports/csv`) rồi tải bằng `downloadTextFile` (từ `../../lib/download`). Vô hiệu khi kỳ không có giao dịch. Tên file giữ quy ước cũ: `so-chi-tieu-<YYYY-MM|YYYY>.csv`.
- Nút **Xuất PDF / In**: điều hướng tới trang Báo cáo với tham số cờ in (xem mục 4).
- Dữ liệu: dùng `useMonthTransactions(monthKey)` khi ở chế độ Tháng, `useRangeTransactions(yearRange)` khi ở chế độ Năm; `useAccounts`, `useCategories`, `useRates`, `useProfile` như `ReportsPage`.

**Khối B — Sao lưu & khôi phục**
- **Tái dùng nguyên `BackupSection`** hiện có, không sửa. (Xuất JSON toàn bộ + Khôi phục ghi đè.)

**Khối C — Nhập giao dịch từ CSV**
- Một dòng dạng menu (icon + nhãn + `ChevronRight`) `Link` tới `/settings/import`.

### 2. Trang Cài đặt (`SettingsPage`)

- **Bỏ** mục "Nhập giao dịch từ CSV" khỏi danh sách "Quản lý".
- **Bỏ** `<BackupSection />` khỏi trang (chuyển sang trang Dữ liệu).
- **Thêm một mục** "Dữ liệu & sao lưu" (icon `Database`) dẫn tới `/settings/data`. Đặt thành một section thẻ riêng, chỗ `BackupSection` cũ, để dễ thấy.
- Bỏ import không còn dùng (`BackupSection`, `FileUp` nếu không còn dùng chỗ khác).

### 3. Trang Báo cáo (`ReportsPage`)

- **Bỏ** khối toolbar xuất (2 nút Xuất PDF + Xuất CSV, khoảng dòng 196–215).
- **Bỏ** hàm `handleExportCsv` và các import chỉ phục vụ nó: `Download`, `Printer` (lucide), `downloadTextFile`, `buildTransactionsCsv`.
- **Giữ** phần CSS in và tiêu đề `h1 ... print:block` (việc in vẫn diễn ra ở trang này).

### 4. Cơ chế Xuất PDF (mở báo cáo + tự in)

- Nút Xuất PDF ở trang Dữ liệu điều hướng tới:
  - Chế độ Tháng: `/reports?period=month&ym=YYYY-MM&print=1`
  - Chế độ Năm: `/reports?period=year&year=YYYY&print=1`
- `ReportsPage` đọc thêm các tham số từ `useSearchParams`:
  - `period` → khởi tạo state `period` ('month' | 'year').
  - `ym` → khởi tạo `monthKey` (`{ year, month }`).
  - `year` → khởi tạo `year`.
  - `print=1` → bật chế độ tự in.
- Tự in: dùng một `useEffect` + `useRef` cờ đã in. Khi `print=1` và dữ liệu của kỳ tương ứng đã tải xong, đợi biểu đồ vẽ (một khoảng trễ ngắn, ~700ms, qua `setTimeout`) rồi gọi `window.print()` **một lần**. Sau khi in, gỡ tham số `print` khỏi URL (thay bằng `setSearchParams`) để không in lại khi điều hướng nội bộ.
- Lưu ý: phần này cần **chạy thử trong trình duyệt** (biểu đồ Recharts vẽ có độ trễ / có animation). Nếu độ trễ cố định chưa ổn định, cân nhắc tăng thời gian chờ hoặc tắt animation khi in.

### 5. Trang Nhập CSV (`ImportCsvPage`)

- Đổi đích nút "quay lại" từ `/settings` sang `/settings/data` (vì giờ vào từ trang Dữ liệu).

## Đơn vị & ranh giới

- `DataPage`: trang khung, ghép 3 khối. Phụ thuộc: `BackupSection`, `ExportSection` (mới), các hook query.
- `ExportSection` (mới, có thể để cùng file `DataPage.tsx` nếu nhỏ): tự chứa state chọn kỳ + logic dựng/tải CSV + điều hướng in. Phụ thuộc: `buildTransactionsCsv`, `downloadTextFile`, các hàm ngày, các hook query.
- `BackupSection`: giữ nguyên, không đổi giao diện/hành vi.
- Thay đổi ở `ReportsPage` chỉ là **gỡ bỏ** (toolbar + hàm export) và **thêm đọc tham số + tự in**.

## Kiểm thử

- **Đơn vị:** Logic dựng CSV đã có test cho `buildTransactionsCsv`/csv (giữ nguyên). Không thêm logic thuần mới đáng kể; phần chọn kỳ dùng lại hàm ngày đã có test.
- **Thủ công / trình duyệt (bắt buộc cho phần in):**
  1. Cài đặt chỉ còn một mục "Dữ liệu & sao lưu"; không còn "Nhập giao dịch từ CSV" và không còn khối Sao lưu ở trang Cài đặt.
  2. Trang Báo cáo không còn 2 nút xuất.
  3. Trang Dữ liệu: chọn Tháng/Năm, đổi kỳ bằng `‹ ›`, Tải CSV ra đúng file, đúng dữ liệu kỳ; nút vô hiệu khi kỳ rỗng.
  4. Xuất PDF: bấm ở kỳ có dữ liệu → mở trang Báo cáo đúng kỳ, tự bật hộp thoại in, nội dung in đúng; quay lại điều hướng thường không in lại.
  5. Sao lưu / Khôi phục vẫn chạy như cũ trong trang mới.
  6. Nhập CSV: bấm dòng → sang trang nhập; nút quay lại về trang Dữ liệu.

## Ngoài phạm vi (YAGNI)

- Không đổi định dạng/nội dung CSV hay JSON hiện có.
- Không viết lại luồng nhập CSV.
- Không thêm chọn khoảng ngày tùy ý (chỉ Tháng/Năm như cũ).
