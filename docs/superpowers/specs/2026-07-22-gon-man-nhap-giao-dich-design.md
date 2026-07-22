# Gọn màn Nhập giao dịch: 3 nút phụ + rút gọn form

Ngày: 2026-07-22

## Vấn đề

Màn Nhập giao dịch (`EntryPage`) đang rườm rà ở hai chỗ:

1. **Ba nút phụ chiếm chỗ ngay màn dùng hằng ngày.** Hàng nút "Trả hộ ·
   Ghi nợ · Gửi về VN" nằm ở đầu màn Nhập — nhưng chỉ "Trả hộ" được dùng
   thường xuyên; "Ghi nợ" và "Gửi về VN" hiếm dùng và đã có đường vào riêng.
2. **Mỗi sheet mở ra có quá nhiều ô cùng lúc**, trộn ô bắt buộc với ô hiếm
   dùng, kèm đoạn văn giải thích dài.

Đường vào sẵn có của 2 chức năng hiếm dùng (không bị mất khi bỏ khỏi màn Nhập):
- Gửi về VN: Báo cáo → Năm → nút "Gửi tiền" (`RemittanceSection`).
- Ghi nợ: Cài đặt → Nợ/Cho vay (`DebtsPage`, route `/settings/debts`).

`SplitBillSheet` (Trả hộ) chỉ mở được từ màn Nhập → phải giữ dễ bấm.

## Phần A — Dọn 3 nút phụ

Thay hàng 3 nút bằng:
- Một nút **"Trả hộ"** giữ nguyên (dùng thường, một chạm).
- Một nút nhỏ **"⋯"** (Khác) mở menu nhỏ chứa **"Ghi nợ"** và **"Gửi về VN"**.

Menu dùng lại kiểu popover nhẹ (không cần khớp đúng `AccountPicker`): một
lớp phủ trong suốt để bấm ra ngoài đóng, panel neo dưới nút "⋯", đóng khi
chọn/khi bấm ra ngoài/khi Esc.

## Phần B — Rút gọn form (progressive disclosure)

Nguyên tắc chung cho cả 3 sheet:
- Các ô **ảnh hưởng số tiền** luôn hiện.
- **Ngày** (mặc định hôm nay) và **Ghi chú** đưa vào mục **"Thêm chi tiết ▾"**
  (một nút gấp/mở, mặc định đóng).
- Đoạn văn giải thích dài → rút còn tối đa một dòng ngắn.

### Trả hộ (`SplitBillSheet`)
- Luôn hiện: Tổng đã trả · Phần người khác nợ (+ dòng "phần của mình") ·
  Ai nợ · Tài khoản · Danh mục.
- Thêm chi tiết: Ngày · Ghi chú.
- Giải thích 2 dòng → 1 dòng ngắn.

### Ghi nợ (`DebtFormSheet`)
- Luôn hiện: chiều (Mình nợ/Cho vay) · Tên người · Số gốc · công tắc
  "chuyển tiền thật" (+ tài khoản/danh mục khi bật).
- Thêm chi tiết: Loại tiền (mặc định JPY) · Hạn · Lãi suất · Số kỳ · Ghi chú.
- Lưu ý: khi **sửa** khoản nợ (`debt != null`) vẫn hiển thị như cũ, nhưng
  áp cùng cách gấp để nhất quán.

### Gửi về VN (`RemittanceFormSheet`)
- Luôn hiện: Kiểu · TK nguồn (JPY) · TK đích (VND) · Số gửi · Phí · Số nhận
  (+ dòng tỷ giá).
- Thêm chi tiết: Ngày · Dịch vụ · Ghi chú.
- Giải thích → 1 dòng ngắn.

## Ràng buộc / không đổi

- **Không đổi logic lưu** của bất kỳ sheet nào: các trường ẩn vẫn nằm trong
  state và gửi đi y như cũ, chỉ đổi cách hiển thị.
- Ô ẩn phải giữ giá trị mặc định hợp lệ (Ngày = hôm nay, Loại tiền = JPY,
  Dịch vụ = mục đầu) để lưu được ngay cả khi không mở "Thêm chi tiết".
- Giữ nguyên kiểm tra hợp lệ (`canSave`) hiện có.
- Tối ưu cho iPhone: nút gấp/mở và menu "⋯" phải đủ lớn để chạm.

## Kiểm thử

- Mở từng sheet: mặc định chỉ thấy ô chính + nút "Thêm chi tiết".
- Lưu được khi KHÔNG mở "Thêm chi tiết" (dùng giá trị mặc định).
- Mở "Thêm chi tiết" → đổi Ngày/Ghi chú/ô nâng cao → lưu đúng.
- Menu "⋯": mở Ghi nợ và Gửi về VN đúng; bấm ra ngoài/Esc đóng.
- Chạy thử trên khổ mobile trong trình duyệt xem trước, không lỗi console.
