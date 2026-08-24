# Redesign v5 — trang Tài sản → Tương lai

Bản vẽ: Claude Design `00ddb792`, file `Tuong Lai - Redesign v5.dc.html`.
So với `Tuong Lai - Redesign.dc.html` (v1, đã dựng ở commit 25314d2 + 97ad85a).

## v5 đổi gì so với v1

1. **BỎ HẲN DRAWER.** Trình sửa kịch bản không còn là `<aside role="dialog">` mà là một
   thẻ nằm THẲNG trong trang, ngay dưới đồ thị, có dải tab.
2. **Bỏ cột phải.** v1 là lưới 2 cột (đồ thị | Giả định+Stress+Mẫu). v5 một cột dọc.
3. **Thanh nháp dán vào đầu thẻ đồ thị** (`border-radius: 12px 12px 0 0; border-bottom:
   none`) thay vì đứng rời ở đầu trang.
4. **Dải chip kịch bản**: `flex-wrap` thay cho `overflow-x: auto`; bỏ dòng tóm tắt
   `FIRE … · âm từ …` trên từng chip, thay bằng `title` (tooltip).
5. **Bỏ nút "Sửa kịch bản"** ở hàng hành động (không còn gì để mở).

## Thẻ "Sửa kịch bản" — 5 tab

Header: `Sửa kịch bản` · ô tên · badge ★ · `edFooterNote` · nút ⋮ (menu 3 mục như cũ).
Dải tab (`role="tablist"`, gạch chân xanh khi chọn), mỗi tab có badge đếm:

| tab | badge | nội dung |
|---|---|---|
| Chặng đời | số chặng | dải tỉ lệ + thẻ chặng (năm · tên · **Tiền** · thu · chi · xoá), meta + chip "Số thật", breakdown mục chi, "+ Thêm chặng" + thanh trượt **tuổi nghỉ hưu** |
| Sự kiện | số mốc | hàng mốc (loại · tên · từ → đến · **ký hiệu tiền** · số tiền · xoá) + chip mẫu |
| Khởi điểm & lợi suất | `x%` | tài sản khởi điểm (Dương/Nợ ròng + ký hiệu tiền) · lợi suất · dải dao động · `minReturnFoot` |
| Stress test | `n bật` | 6 công tắc, mở ra ô Năm / ô phụ ngay dưới |
| Cách đọc & phạm vi | — | giá hôm nay/danh nghĩa + lạm phát · chiếu đến tuổi · năm sinh · tiền hiển thị · `fxNote` |

Lưu/Bỏ nháp KHÔNG có trong thẻ này — chúng nằm ở thanh nháp dán trên đồ thị.

## XUNG ĐỘT: mô hình tiền tệ

v5 đổi mô hình, không chỉ đổi giao diện:

| | repo hiện tại | v5 |
|---|---|---|
| Tiền của CHẶNG | `life_phases.currency` | `p.cur` (giống) |
| Tiền của MỐC | `life_events.currency` — khai riêng | **suy ra** từ chặng chứa `startYear` (`curAt`) |
| Tỷ giá | `fx_to_display` mỗi dòng — người dùng tự khai, là giả định DÀI HẠN | một bảng `this.fx` cứng của app (tỷ giá HÔM NAY), dùng cho mọi năm |

Hai hệ quả nếu theo v5 nguyên văn:
- Mốc mất quyền có tiền riêng. Mà `presets.ts` CÓ mẫu ép cứng VND ("Hỗ trợ bố mẹ ở VN")
  nằm trong chặng ¥ — và comment đầu file ghi rõ bản trước để mốc rơi về tiền của chặng
  chính là LỖI ĐÃ SỬA.
- Tỷ giá giả định dài hạn người dùng đã khai bị thay bằng tỷ giá hôm nay → mọi con số
  của kịch bản đa tiền tệ đổi lặng lẽ. 30 file trong `src/` đụng `fx_to_display`.

## Quyết định (user chốt 2026-08-24)
**Theo v5 nguyên văn, đổi cả mô hình tiền.** Tiền nằm trên CHẶNG; mốc suy từ chặng chứa
năm nó bắt đầu; quy đổi bằng tỷ giá HÔM NAY của app.

### Cách làm — KHÔNG migration mù
Cột `life_events.currency` và cả hai cột `fx_to_display` GIỮ NGUYÊN dưới DB. Chuẩn hoá
xảy ra lúc ĐỌC (`normalizeToPhaseCurrency`), và chỉ khi người dùng SỬA một dòng thì bản
ghi mới được viết lại theo mô hình mới. Lý do không viết UPDATE hàng loạt: nó phải nhét
một tỷ giá cứng vào file SQL rồi ghi đè số tiền thật, không hoàn tác được — trong khi
cách này cho ra ĐÚNG cùng con số trên màn mà không đụng dòng nào.

Thiếu tỷ giá thì GIỮ NGUYÊN dòng + bật `hasMissingRate` (không quy 1:1 — ₫4.200.000 →
¥4.200.000 là sai 172 lần).

`projectLifetime` và `LifetimeInput` KHÔNG đổi chữ ký — engine vẫn nhận `currency` +
`fxToDisplay` từng dòng. Bắt buộc: engine được gói vào `push-notify/_rules.js`.

### Đã làm
- `fxModel.ts` + test (16): `currencyAt`, `normalizeToPhaseCurrency`, `fxOfRates`.

## Đã làm (2026-08-24)

### Tầng dữ liệu
- `fxModel.ts` + test (16): `currencyAt`, `normalizeToPhaseCurrency`, `fxOfRates`.
- `useLifetime.buildInputFor` chạy qua `normalizeToPhaseCurrency` (bản ĐÃ LƯU).
- `LifetimeView.shownInput` chuẩn hoá LẠI sau `draftToInput` (bản NHÁP).
- `draft.ts`: thêm `setPhaseCurrency` — đổi tiền chặng thì gắn nhãn lại mọi mốc của nó.

### Giao diện
- `ScenarioWorkbench.tsx` MỚI thay `ScenarioEditorDrawer.tsx` (đã xoá): thẻ nằm thẳng
  trong trang, 5 tab (Chặng đời · Mốc cuộc đời · Khởi điểm & lợi suất · Stress test ·
  Cách đọc & phạm vi), mỗi tab có badge đếm.
- `LifetimeView`: một cột; thanh nháp dán vào đầu thẻ đồ thị (`attached`); chip kịch bản
  xuống dòng + tóm tắt chuyển vào `title`; bỏ nút "Sửa kịch bản", bỏ nút "Vặn thử" +
  sheet đáy, bỏ banner "tỷ giá bằng 1" (khái niệm không còn).
- `AssumptionSliders.tsx` XOÁ (nội dung tách vào các tab). `StressPanel` + `PresetPanel`
  có thêm `variant="inline"` để dùng lại trong tab.
- Hai sheet "⋯" thu lại: `PhaseFormSheet` còn quốc gia, `EventFormSheet` còn lạm phát +
  ghi chú. Ô tiền và ô tỷ giá bỏ hẳn (tiền khai trên hàng chặng, tỷ giá tự động).

## Ba lỗi bắt được khi chạy app thật
1. Bản NHÁP không đi qua chuẩn hoá → đổi tiền chặng xong, dòng "≈ … theo JPY" tính bằng
   `fxToDisplay` đã lưu, ra 284万 thay vì 1.7万.
2. Giao diện hiện ₫3.000.000 trong khi bản chiếu quy đổi thành ₫516.000.000 — vì nháp
   để mốc mang tiền cũ còn chặng đã sang VND, `normalizeToPhaseCurrency` thấy lệch nên
   quy đổi. Sửa bằng `setPhaseCurrency` (gắn nhãn lại, KHÔNG quy đổi).
3. Chip kịch bản tên dài (267px) thò ra khỏi khung 224px ở 375px — cuộn ngang thì không
   sao, xuống dòng thì phải cắt (`truncate` + `max-w-full`).

## Cố ý lệch bản vẽ
- Giữ hai sheet "⋯" (bản vẽ không có): quốc gia hiện trên cột "Chặng" của Bảng theo năm,
  còn cờ lạm phát thì ĐỔI SỐ của bản chiếu — bỏ hẳn là mất đường sửa hai thứ đang tính.
- Không viết migration hàng loạt (xem mục "Cách làm" ở trên).
