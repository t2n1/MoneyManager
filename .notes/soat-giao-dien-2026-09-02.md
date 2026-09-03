# Soát giao diện 2026-09-02 — sau khi bốn gói redesign đã lên master

Bối cảnh: user hỏi "nâng app lên tầm mới", chọn hướng "nhìn và dùng chuyên nghiệp hơn".
Đối chiếu git: ENTRY (08-19), BUDGET (08-23), DAILY_SPEND (08-24), REPORTS (4 tab), khung app
(08-25) đều đã xong → không còn bản vẽ sẵn. Soát app demo (`so-chi-tieu-demo`, 5174).

Phạm vi đã xem: desktop 1280 (6 màn chính, Tối + Sáng), điện thoại 375 (11 màn, Tối),
cỡ chữ Rất lớn ở 375 (4 màn, đo tràn ngang bằng JS). Console: 0 lỗi. Build: 4,9s, 73 chunk.

## Ổn
- Desktop: 6 màn chính thống nhất, đúng token, số mono, không lỗi bố cục.
- Chế độ Sáng: 4 màn kiểm đều ổn.
- Cỡ chữ Rất lớn (20px gốc) ở 375: không màn nào tràn ngang; phần tử vượt mép ở Báo cáo
  đều nằm trong dải cuộn ngang (dải mục 1–5, bảng Δ).
- Màn Nhập: tốt cả hai cỡ.

## Chưa ổn — tất cả ở điện thoại 375
1. **Cài đặt → Danh mục**: tên danh mục cắt còn 1–2 chữ ("N…", "Ă…", "Gi…"). Một dòng chứa
   6 control (kéo, mũi tên, emoji, nhãn CHƯA GẮN, nút + to, lưu trữ). Lỗi rõ nhất.
2. **Sổ**: đầu màn ba tầng — dải cảnh báo "Tiền mặt đang âm" đè TRÊN tiêu đề; hàng 4 nút
   icon riêng; 4 tab. Nội dung bắt đầu ở ~1/3 màn. Bộ lọc "Chi / Thu / Chuyển khoản" trong
   khi màn Nhập nói "Tiền ra / Tiền vào / Đổi chỗ" — hai bộ từ cho cùng một trục.
3. **Báo cáo**: chọn tháng hai lần (mũi tên + dải tháng); dải tháng cắt mép trái ("4 / 万");
   ba tầng điều hướng chồng nhau (4 tab, dải tháng, dải mục 1–5).
4. **Tài sản**: ba hàng control (Hiện tại/Tương lai · Hôm nay/Theo thời gian · ¥₫$ + mắt +
   đồ thị + "Quản lý nhóm" xuống 2 dòng) trước con số đầu tiên.
5. **Đầu tư**: chip lọc + nút "Ghi lệnh" xuống dòng lởm chởm, nút cao 2 dòng.
6. **Tương lai thiếu năm sinh**: đoạn văn 5 dòng trên màn trống.
7. Tốc độ: tải đầu ≈ index 455 + queries 314 + ui 66 + LineChart 347 kB (chưa nén). pdf 428 kB
   đã lazy. Không phải nút thắt.

## Mẫu chung
Mỗi màn tự ghép thanh công cụ riêng ở đầu trang; trên điện thoại nó nuốt 1/3 màn. Design
system có `PageHeader` nhưng chưa có khuôn "thanh công cụ trang" (tiêu đề + tháng + một menu
tràn). Đây là chỗ đáng làm nhất nếu muốn cảm giác "app store" trên điện thoại.

Ba câu hỏi chờ user: chọn gói nào (A khuôn đầu trang chung + 6 lỗi trên; B chỉ sửa lỗi lẻ;
C vẽ bản mới bằng Claude Design trước). Chưa code gì.

---

## 09-03 — Sửa tràn ngang ở Tài sản → Tương lai

User báo trang "Tài sản · Tương lai" kéo được sang phải và mất chữ. Đo trong trình duyệt
(375px, demo): `<main>` có `overflow-y-auto`, mà CSS quy định một trục khác `visible` thì
trục kia thành `auto` → cả trang cuộn ngang được. Thủ phạm duy nhất: khối "Số thật 12 tháng
gần nhất" trong thẻ chặng đang chạy ([ScenarioWorkbench.tsx:841](../src/features/lifetime/ScenarioWorkbench.tsx#L841))
đeo `shrink-0`, bề ngang tự nhiên 502px, không chịu co → main.scrollWidth 542 / clientWidth 375.

Sửa: `shrink-0` → `min-w-0`. Đo lại 360/375/390/430 đều scrollWidth == clientWidth ở cả bốn
chip (FIRE, Mốc, Chặng, Log) và bốn dải thời gian. Desktop giữ nguyên bố cục (khối vẫn nằm
cạnh dòng tóm tắt khi đủ chỗ).

Một cái bẫy khi đo: ở 320px thấy tràn 22px từ SVG đồ thị — nhưng đó là do ResizeObserver của
`plotW` bám cỡ cũ khi ĐỔI CỠ giữa phiên (emulation), tải lại trang ở 320 thì sạch. Không phải
lỗi trên máy thật.

tsc -b xanh · 235 file test / 3653 test xanh.
