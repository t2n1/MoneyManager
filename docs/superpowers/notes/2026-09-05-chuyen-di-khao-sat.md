# Khảo sát mục 2a — "chuyến đi" trong dữ liệu thật

**Ngày:** 2026-09-05 · brainstorm, chưa code.

## Chuyến Tết 2026 nằm ở đâu

User nhớ là "tháng 12/2025 hoặc 1/2026". Dữ liệu nói khác:

- **Vé máy bay ¥104.547** ghi ở tuần **2026-W04** (19–25/1) — đó là ngày MUA, không phải ngày bay.
- Tuần **2026-W08 (16–22/2/2026): KHÔNG CÓ MỘT GIAO DỊCH NÀO.** Trên toàn bộ tài khoản.
- Các tuần kề: W06 có 26 lần, W07 có 15, W09 có 13. Riêng thẻ Rakuten tuần nào cũng 11–18 lần.
  W08 là **0**.
- Tháng 2/2026 là tháng chi thấp nhất năm: ¥186.189 / 55 giao dịch.
- Tết Bính Ngọ = **17/2/2026**, nằm giữa W08.

→ Cửa sổ chuyến đi: **khoảng 16–22/2/2026**, có thể rộng hơn (W07 đã thấp bất thường).

## Điều bất ngờ, và nó lật một giả định

Ghi nhớ cũ ([[so-gao-lo-hong-chi-o-nuoc-ngoai]]) nói: *quẹt thẻ ở VN vẫn vào sổ, chỉ tiền mặt
mất dấu*. **Ở chuyến này thì không đúng.** W08 im lặng trên CẢ ba thẻ tín dụng. Nên hoặc là
chuyến đó tiêu toàn tiền mặt, hoặc sao kê khoảng đó chưa nhập.

Hệ quả thiết kế: chuyến đi KHÔNG để lại "chi ở VN" trong sổ. Nó để lại một **khoảng trống**.

## Hệ quả: app tự dò được, không cần bắt người dùng nhớ ngày

Một tuần 0 giao dịch giữa các tuần 13–26 giao dịch là tín hiệu mạnh và rẻ. Thay vì bắt user gõ
ngày đi/ngày về (mà chính user vừa nhớ nhầm 3 tháng), app nên **tự chỉ ra khoảng nghi vấn rồi
hỏi**. Đây là thứ user không tự thấy được — đúng nghĩa "AI thấy cái chưa thấy".

## Bối cảnh tài khoản

Cả 7 tài khoản có phát sinh chi đều là **JPY**. Không có tài khoản VND nào → tiền tiêu ở VN
không có chỗ nào để đứng trong sổ. Đây là việc của mục 2b.

Chi ví tiền mặt cả năm: ¥80.724 / 45 lần, và **6 trên 13 tháng có đúng 0 lần**.
