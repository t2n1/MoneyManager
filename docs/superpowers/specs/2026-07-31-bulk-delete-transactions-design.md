# Chọn nhiều giao dịch để xóa một lần

Ngày: 2026-07-31

## 1. Mục tiêu

Sau khi import (vd dữ liệu Zaim), người dùng cần **xóa nhiều giao dịch lỗi cùng lúc**
thay vì mở từng cái. Thêm chế độ **chọn nhiều → xóa hàng loạt** ở hai nơi có danh sách:
**Tìm kiếm** và **Sổ giao dịch (tab Ngày)**.

## 2. Tương tác

Kiểu "chế độ chọn" bật bằng nút (giống Ảnh/Gmail mobile):

- Nút **"Chọn"**:
  - Tìm kiếm: cạnh dòng "N kết quả".
  - Sổ giao dịch: ở thanh trên, **chỉ hiện khi đang ở tab "Ngày"** (Lịch/Tháng/Tổng hợp
    không phải danh sách nên không có chế độ chọn).
- Trong chế độ chọn:
  - Mỗi dòng hiện **ô tích** bên trái; chạm dòng = tích/bỏ tích (KHÔNG mở sửa).
  - Dòng đã chọn tô nền nhẹ.
  - Nút thoát **"Xong"** (thay chỗ nút "Chọn").
- Thoát chế độ chọn → xóa sạch lựa chọn, dòng bấm lại mở sửa như cũ.

## 3. Thanh thao tác dưới màn hình

Hiện khi đang ở chế độ chọn (fixed bottom, chừa safe-area):

- **"Đã chọn N"**.
- **"Chọn tất cả"** / **"Bỏ chọn hết"** — phạm vi là danh sách ĐANG hiển thị:
  - Tìm kiếm: toàn bộ kết quả sau lọc (`results`).
  - Sổ GD: toàn bộ giao dịch của tháng đang xem (`transactions`).
- Nút **"Xóa (N)"** (đỏ), tắt khi N = 0.

## 4. Xóa + xác nhận

- Bấm "Xóa (N)" → `confirmDialog({ title: 'Xóa N giao dịch?', message: 'Không hoàn tác được.', danger: true, confirmLabel: 'Xóa' })`.
- Đồng ý → gọi `useDeleteTransactions(ids)` → `showToast('Đã xóa N giao dịch')` → thoát chế độ chọn.
- **Không có hoàn tác** (quyết định của người dùng). Hộp xác nhận là lưới an toàn.
- Xóa cùng ngữ nghĩa xóa lẻ hiện tại — KHÔNG thêm xử lý riêng cho nợ/kiều hối.

## 5. Kiến trúc / thành phần

- **`useTxSelection` (hook mới, thuần state)**: giữ `Set<string>` id đã chọn.
  API: `selecting`, `enter()`, `exit()`, `toggle(id)`, `selectAll(ids)`, `clear()`,
  `isSelected(id)`, `count`. Dùng chung cho cả 2 trang. Test được (thuần, không React DOM).
  - Ghi chú: viết dạng reducer/hàm thuần cho phần logic tập hợp để unit-test; phần hook
    chỉ bọc `useState`.
- **`TransactionItem`** thêm props tùy chọn:
  - `selecting?: boolean` — bật thì hiện ô tích bên trái (Circle/CheckCircle của lucide).
  - `selected?: boolean` — tô nền + tích.
  - Giữ `onClick`: trang tự quyết chạm = toggle (khi selecting) hay edit (khi thường).
  - Không truyền gì → hành vi y hệt hiện tại (không hồi quy các nơi khác dùng nó).
- **`SelectionActionBar` (component mới)**: thanh dưới, nhận `count`, `total`,
  `allSelected`, `onToggleAll`, `onDelete`. Dùng chung 2 trang.
- **Repo**: thêm `deleteTransactions(ids: string[]): Promise<void>`.
  - supabaseRepo: chia lô 100 id, mỗi lô `.delete().in('id', batch)`; lỗi thì throw.
  - demoRepo: lọc bỏ các id khỏi mảng, lưu localStorage (khớp chốt hợp lệ như deleteTransaction).
  - Khai trong interface `repo.ts`.
- **Hook** `useDeleteTransactions`: mutation gọi `repo.deleteTransactions`, `onSettled`
  invalidate như `useDeleteTransaction` (transactions/balances/search/transactionTags).

## 6. Gắn vào trang

- **SearchPage**: thêm state chọn (dùng `useTxSelection`); nút "Chọn"/"Xong" cạnh "N kết quả";
  truyền `selecting/selected` xuống `TransactionItem`; render `SelectionActionBar`;
  `selectAll` dùng `results.map(t => t.id)`.
- **LedgerPage / DailyView**: nút "Chọn" ở header LedgerPage (chỉ khi `view==='daily'`).
  Truyền cờ chọn + handler xuống `DailyView` → `TransactionItem`. `selectAll` dùng
  `transactions.map(t => t.id)`. `SelectionActionBar` render ở LedgerPage khi đang chọn.

## 7. Kiểm thử

- Unit `useTxSelection` (phần logic thuần): toggle thêm/bớt, selectAll gộp đúng, clear,
  count, isSelected.
- Unit repo demo `deleteTransactions`: xóa đúng tập id, giữ phần còn lại.
- Tay (preview demo): bật chọn ở Tìm kiếm và Sổ GD, tích vài dòng, chọn tất cả, xóa,
  xác nhận hộp thoại, kiểm tra danh sách giảm + toast; thoát chế độ chọn thì bấm dòng mở sửa lại.

## 8. Phạm vi (YAGNI)

- Chỉ chọn + xóa. Không "sửa hàng loạt", không "đổi danh mục hàng loạt".
- Chế độ chọn chỉ ở danh sách phẳng (Tìm kiếm, tab Ngày). Không đụng Lịch/Tháng/Tổng hợp.
