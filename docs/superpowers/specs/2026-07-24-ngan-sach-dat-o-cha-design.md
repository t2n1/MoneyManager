# Ngân sách — đặt hạn mức ở cha trước

Ngày: 2026-07-24

## Mục tiêu

Trang Ngân sách hiện dùng model "1 cấp": chỉ danh mục **lá** nhận hạn mức, cha
tự cộng từ con. Hệ quả: phần "Chưa đặt hạn mức" là danh sách phẳng 40+ danh mục
con, rất rối mắt.

Người dùng muốn lật lại: **đặt hạn mức ở danh mục cha trước** (trần chung cho cả
nhóm), rồi ai muốn chi tiết hơn thì **vào sâu** đặt mốc cho từng con.

## Phạm vi

- Không đổi cơ sở dữ liệu. Bảng `budgets` vốn đã cho đặt hạn mức lên bất kỳ
  danh mục nào (kể cả cha).
- Sửa hàm thuần `src/features/budgets/progress.ts` (kèm cập nhật unit test).
- Sửa giao diện `src/features/budgets/BudgetView.tsx`.
- Cập nhật seed demo `src/data/demoRepo.ts` cho khớp model mới (hạn mức mẫu đặt
  ở cha thực sự được tính).
- Không thêm cài đặt mới, không đổi luồng nhập giao dịch.

## Model mới

Danh mục chi có tối đa 2 cấp: cha (top-level) và con (`parent_id` trỏ về cha).

Quy tắc hạn mức:

1. **Hạn mức trên danh mục cha** = trần chung cho cả nhóm. Chi tiêu của nhóm =
   tổng chi của **mọi con** trong nhóm + chi trực tiếp trên cha (nếu có). Dòng
   này tính vào tổng ngân sách và vào đếm "sắp vượt / vượt".
2. **Danh mục lá độc lập** (top-level không có con, vd *Tài chính & Đầu tư*,
   *Khác*) → đặt hạn mức thẳng, tính vào tổng như thường.
3. **Hạn mức trên con của một nhóm ĐÃ có trần cha** = chỉ là mốc theo dõi bên
   trong nhóm. **Không** cộng vào tổng, **không** tính vào đếm sắp vượt/vượt.
4. **Tương thích ngược**: nhóm cha CHƯA đặt trần nhưng con có hạn mức → mỗi con
   vẫn là một dòng độc lập tính vào tổng (đúng như model cũ). Cha khi đó hiển
   thị dạng "tổng các con" như hiện tại.

Không cần tỷ giá mới: chi vẫn quy đổi về base như `progress.ts` đang làm.

## Hàm thuần `buildBudgetReport` (sửa)

Chữ ký thêm quan hệ cha–con để tính được trần nhóm:

- Đầu vào bổ sung: cách tra `parentOf(categoryId)` và `childrenOf(categoryId)`
  (hoặc tương đương). `isParent` cũ suy ra từ `childrenOf`.
- Với mỗi dòng ngân sách:
  - Nếu là **cha có con**: `spent` = tổng chi của cha + tất cả con. Là một dòng
    nhóm (`group`) tính vào tổng.
  - Nếu là **con mà cha có trần**: đánh dấu `isMarker = true`, **không** cộng
    vào `totalBudgeted`/`totalSpent`, không tính over/warn. Vẫn trả về để UI vẽ
    mốc bên trong nhóm (kèm `spent`, `ratio` riêng so với mốc con).
  - Nếu là **con mà cha KHÔNG có trần**, hoặc **lá độc lập**: dòng độc lập tính
    vào tổng như cũ.
- `totalBudgeted` / `totalSpent` / `overCount` / `warnCount` chỉ gộp các dòng
  tính-vào-tổng (loại 1, 2, 4).

`BudgetLine` thêm cờ để UI phân biệt: `isGroup?` (cha có trần) và `isMarker?`
(con chỉ theo dõi). Rollover/carry giữ nguyên cơ chế, chỉ áp cho dòng
tính-vào-tổng.

### Ca kiểm thử (progress.test.ts)

- Cha có trần, không con nào có hạn mức → 1 dòng nhóm, spent = tổng chi các con.
- Cha có trần + một con cũng có hạn mức → tổng chỉ tính trần cha; dòng con trả
  về với `isMarker`, không cộng vào tổng, không tính over/warn.
- Cha KHÔNG trần + hai con có hạn mức → hai dòng độc lập tính vào tổng (tương
  thích ngược, như model cũ).
- Lá độc lập (không con) có hạn mức → dòng độc lập tính vào tổng.
- Trần cha < tổng chi các con → dòng nhóm ở trạng thái `over`, đếm vào overCount.
- Chi trực tiếp trên danh mục cha (giao dịch gán thẳng cha) → cộng vào spent của
  nhóm.

## Giao diện `BudgetView.tsx`

### Danh sách "Chưa đặt hạn mức"

- Chỉ hiện **danh mục cha** (top-level có con) + **lá độc lập** (top-level không
  con). Không liệt kê con.
- Cha: bấm → mở sheet đặt trần nhóm. Lá độc lập: bấm → mở sheet đặt hạn mức.

### Nhóm đã có hạn mức (hoặc đang xem breakdown)

- Mỗi nhóm cha là dòng có nút **xổ ra / thu gọn** (accordion, chevron ▸/▾).
  - Vùng chính (tên + tiến độ) bấm vào → mở sheet đặt/sửa trần nhóm.
  - Chevron bấm vào → xổ danh sách con ngay dưới (không chuyển màn hình).
- Khi xổ: mỗi con hiện tên + chi tiêu của nó. Bấm vào con → mở sheet đặt **mốc
  theo dõi** cho con (tùy chọn). Con có mốc thì hiện thanh tiến độ so với mốc
  đó; con chưa có mốc chỉ hiện số chi.
- Dòng nhóm hiện: chi / trần, thanh tiến độ, % (màu theo trạng thái ok/warn/over
  như hiện tại).

### Trạng thái accordion

- Lưu tạm trong state React (`Set` các id nhóm đang mở). Mặc định thu gọn.
- Không cần lưu vào server/localStorage ở phiên bản này.

## Seed demo (`demoRepo.ts`)

- Giữ hạn mức mẫu đặt ở cha (*Ăn uống*, *Đi lại*) — nay thực sự được tính là
  trần nhóm.
- Có thể thêm một mốc con mẫu (vd *Bữa trưa*) để minh hoạ marker không cộng vào
  tổng. `Quần áo` (con của *Thời trang* — nhóm chưa có trần) minh hoạ tương
  thích ngược (con tính độc lập).

## Ngoài phạm vi (YAGNI)

- Không làm nhiều hơn 2 cấp danh mục.
- Không tự động phân bổ trần cha xuống con.
- Không cảnh báo khi tổng mốc con vượt trần cha.
- Không lưu trạng thái xổ/thu qua các phiên.
