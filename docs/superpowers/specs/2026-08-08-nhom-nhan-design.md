# Nhóm nhãn — thiết kế

**Ngày chốt:** 2026-08-08
**Trạng thái:** đã duyệt thiết kế, chưa code
**Kế hoạch triển khai:** `docs/superpowers/plans/2026-08-08-nhom-nhan.md`

## Vấn đề

Nhãn hiện là một mớ phẳng. Ô chọn nhãn khi nhập giao dịch đổ chung "Người yêu",
"Bạn bè", "Tokyo", "Về VN 2026" vào cùng một hàng chip, xếp theo mức dùng. Mắt phải
tự phân loại lại mỗi lần nhập, và càng nhiều nhãn thì càng khó tìm đúng cái cần.

Nhãn thực ra trả lời mấy CÂU HỎI khác nhau: đi *với ai*, tiêu *ở đâu*. Thiết kế này
làm cho cấu trúc đó hiện ra trên màn hình thay vì nằm trong đầu người dùng.

## Quyết định đã chốt

| # | Điểm | Chốt | Vì sao |
|---|------|------|--------|
| 1 | Nhóm cố định hay tự đặt | **Tự đặt**, migration seed sẵn `Với ai?` và `Ở đâu?` | Thêm nhóm về sau không phải sửa code |
| 2 | Một nhãn thuộc mấy nhóm | **Đúng một** (cột `group_id`) | Một nhãn chỉ trả lời một câu hỏi. Bảng nối sẽ vẽ cùng một chip ở hai chỗ, và làm hỏng phép lọc VÀ-giữa-nhóm |
| 3 | Ô chọn nhãn khi nhập | **Xếp dọc theo nhóm**, mỗi mục một hàng ~3 nhãn | Thấy cả hai câu hỏi cùng lúc nên khó quên gắn; ~238px, 46% vùng cuộn của form |
| 4 | Lọc nhiều nhãn ở Tìm kiếm | **HOẶC trong nhóm, VÀ giữa nhóm** | "Người yêu + Tokyo" = đi với người yêu ở Tokyo. Đây là câu hỏi nhãn phẳng không trả lời được, và là lý do nhóm tồn tại |
| 5 | Nhãn cũ sau migration | **Màn xếp nhanh một lần** | Không có nó, ngày đầu ship là hai nhóm rỗng nằm trên một đống nhãn cũ — dán nhãn khó hơn trước |
| 6 | Nhãn theo dịp ("Về VN 2026") | Nằm ở mục **Khác** | Người dùng chốt chỉ 2 nhóm |

Tên nhóm mặc định chép nguyên văn, giữ cả dấu hỏi: `Với ai?` (sort_order 0),
`Ở đâu?` (sort_order 1).

## Mô hình dữ liệu

### Bảng `tag_groups` (migration 0039)

```
id          uuid pk
user_id     uuid not null → auth.users on delete cascade
name        text not null, check length(trim(name)) > 0
sort_order  int not null default 0
created_at  timestamptz not null default now()
unique (user_id, name)
```

RLS `own rows` (`using`/`with check`: `user_id = (select auth.uid())`), giống mọi
bảng dữ liệu người dùng khác.

### Cột `tags.group_id`

```
group_id uuid null → tag_groups (id) on delete set null
index (user_id, group_id)
```

**FK một cột, không composite.** Các bảng khác trong sổ dùng composite `(id, user_id)`
để ép cùng-user (xem `transaction_tags`). Ở đây không được: composite + `on delete set
null` sẽ set null CẢ `user_id`, mà cột đó `not null` → xoá nhóm nổ lỗi thay vì thả nhãn
ra. Cùng-user do RLS lo — id nhóm của người khác không đọc được nên không có đường chọn
vào.

`null` = chưa xếp nhóm. Nhãn `null` vẫn dùng bình thường, chỉ nằm ở mục "Khác".

### Seed

- **Hồ sơ hiện có:** `insert ... select from profiles cross join (values ...)`,
  idempotent theo `unique(user_id, name)`.
- **User mới:** trigger riêng `seed_tag_groups` trên `profiles`, KHÔNG định nghĩa lại
  `handle_new_user()`. Thân hàm đó nay ~150 dòng danh mục; chép lại mỗi lần thêm một
  thứ nhỏ là cách chắc nhất để hai bản trôi khác nhau. Trigger chạy cùng transaction
  vì `handle_new_user` insert `profiles` ở dòng đầu.

### Sao lưu / khôi phục

`BACKUP_VERSION` 7 → 8, thêm khoá `tagGroups`. `tag_groups` vào `DATA_TABLES` ngay
trước `tags`. Thứ tự chèn: nhóm → nhãn → liên kết. Thứ tự xoá ngược lại: liên kết →
nhãn → nhóm.

**Sửa kèm một lỗi có sẵn:** chỗ khôi phục trong `supabaseRepo.importAll` đang bỏ quên
`budget_amount` và `budget_period` khi chèn lại nhãn — khôi phục xong là mất sạch trần
chi theo nhãn. Cùng đoạn map, sửa luôn.

Phần soát file trước khi xoá (`validateBackupPayload`) thêm hai luật: `tags.group_id`
phải trỏ tới nhóm có trong file, và tên nhóm không được trùng. Cả hai đều là ràng buộc
Postgres sẽ nổ SAU khi importAll đã xoá sạch dữ liệu cũ.

## Ô chọn nhãn khi nhập (`TagPicker`)

```
🏷 Nhãn (không bắt buộc)

VỚI AI?
[Người yêu] [Một mình] [Bạn bè] [+]

Ở ĐÂU?
[Tokyo] [Konbini] [Osaka] [+]

KHÁC
[Về VN 2026] [Đám cưới] [+]

Tất cả (23) ⌄
```

Mỗi nhóm một section: tiêu đề nhỏ + một hàng chip, xếp theo mức dùng giảm dần. Mục
"Khác" luôn ở cuối.

**Nút "+ mới" nằm trong TỪNG mục.** Đây là chỗ ăn tiền của cả tính năng: nhãn tạo
trong lúc nhập sinh ra đã có nhóm, không đẻ thêm việc "vào Cài đặt xếp lại sau".

**Nút "Tất cả"** mở hết mọi mục kèm ô tìm bỏ dấu (dùng lại `normalizeText` của Tìm
kiếm). Khi tìm, kết quả vẫn nằm đúng mục của nó; mục nào không còn nhãn khớp thì ẩn cả
tiêu đề, không để lại hàng trống.

**Hai luật ngược nhau về mục rỗng:**
- Nhóm THẬT rỗng vẫn hiện tiêu đề + "+ mới" — không thì nhóm vừa tạo vô hình, không có
  đường gắn nhãn đầu tiên vào nó.
- Mục "Khác" rỗng thì biến mất — nó không phải nhóm thật, chỉ là chỗ chứa.

**Giữ nguyên từ bản phẳng:** bấm một chip không làm chip khác nhảy chỗ (nhãn đang chọn
nằm ngoài top thì thêm vào CUỐI section chứ không hoán lên đầu); nhãn đã lưu trữ ẩn đi,
trừ khi giao dịch đang sửa mang nó; nhãn trỏ tới nhóm không còn tồn tại rơi về mục Khác
chứ không biến mất.

**Chiều cao:** ~238px (46% vùng cuộn 514px của form) với 3 nhãn mỗi mục. Con số 3 là
ước tính từ kích thước chip hiện có — phải **đo thật trên 375×812** trước khi chốt, và
hạ xuống nếu vượt ngưỡng. Không đổi sang layout khác: xếp dọc là phương án đã chọn.

## Xếp nhanh nhãn cũ

Một dải ở đầu màn Nhãn, hiện khi còn nhãn ngoài nhóm: từng nhãn kèm số giao dịch đang
mang, hai nút `Với ai?` / `Ở đâu?`, và nút `Để ở Khác`.

**Vấn đề:** "để ở Khác" và "chưa xem tới" là cùng một giá trị trong DB (`group_id =
null`), nên app không phân biệt được. Không xử lý thì dải sẽ đòi xếp lại mấy nhãn đó
mãi mãi.

**Cách giải:** dải có nút `Xong` để ẩn hẳn, nhớ theo thiết bị (localStorage). Cuối màn
Nhãn luôn có link `Xếp nhãn vào nhóm` để mở lại khi cần. Không thêm cột DB nào.

## Màn quản lý Nhãn (`TagsPage`)

Chia section theo thứ tự: các nhóm theo `sort_order` → Khác → **Đã lưu trữ**. Khối "Đã
lưu trữ" giữ nguyên là một khối riêng cắt ngang mọi nhóm — lưu trữ là trạng thái, không
phải nhóm.

Mỗi dòng nhãn thêm ô chọn nhóm dạng `<select>`, không kéo-thả: kéo-thả trên điện thoại
khổ hơn là tiện. Tiêu đề nhóm sửa tên tại chỗ (blur để lưu, giống ô tên nhãn), kèm số
nhãn và nút xoá.

Xoá nhóm → dialog xác nhận nói rõ: nhãn KHÔNG bị xoá, chúng chuyển sang mục Khác, giao
dịch và trần chi giữ nguyên. Đây là điểm phân biệt "dẹp cái nhóm" với "xoá cái nhãn",
phải giữ rạch ròi trong lời thoại.

Ô "Thêm nhãn" ở đầu trang thêm một `<select>` chọn nhóm. Khối "Thêm nhóm" đặt cuối
trang.

## Lọc ở Tìm kiếm

**HOẶC trong cùng nhóm, VÀ giữa các nhóm.**

- `Tokyo` + `Osaka` (cùng nhóm Ở đâu?) → cả hai nơi
- `Người yêu` + `Tokyo` (khác nhóm) → khoản đi với người yêu Ở Tokyo
- `Người yêu` + `Bạn bè` + `Tokyo` → (người yêu HOẶC bạn bè) VÀ Tokyo

Nhãn ở mục Khác gộp thành MỘT nhóm ảo, tức OR với nhau. Nhờ vậy deep-link
`?tags=a,b` từ thẻ "Chi theo nhãn" ở Báo cáo không đổi nghĩa. Nhãn không có trong danh
sách tags (liên kết mồ côi) cũng rơi vào nhóm ảo đó.

Chip lọc chia mục như ô chọn nhãn, nhưng khác hai điểm: hiện CẢ nhãn đã lưu trữ (lọc
lịch sử vẫn cần chúng) và không cắt top-N. Dòng chú thích viết lại cho đúng nghĩa; dòng
tóm tắt bộ lọc nối bằng `+` thay vì dấu phẩy.

## Kiểm thử

| Chỗ | Ca |
|-----|-----|
| `pickerSections` | thứ tự section, nhóm rỗng vẫn hiện, mục Khác rỗng thì ẩn, nhãn mồ côi, limit đếm riêng từng nhóm, chip không nhảy chỗ, nhãn lưu trữ |
| `filterByTags` | 6 ca cũ giữ nguyên + 7 ca mới cho luật VÀ-giữa-nhóm |
| `demoRepo` | chặn trùng tên nhóm (Postgres có UNIQUE, demo không), xoá nhóm thả nhãn ra, db cũ thiếu cột đọc ra `null` |
| `backupImport` | `group_id` trỏ sai, trùng tên nhóm, file cũ không có `tagGroups` vẫn hợp lệ |
| `exportTables` | đọc SQL migration thật, xác nhận bảng và cột có tồn tại |

Hai quy ước bắt buộc:

1. **Test luật lọc mới phải thấy ĐỎ trước.** `filterByTags` đổi ngữ nghĩa; test xanh
   ngay từ đầu nghĩa là nó không chứng minh gì.
2. **Kiểm bằng `npm run build`**, không chỉ `tsc --noEmit` — file trong `src/` không
   được dùng API Node, và lỗi đó chỉ lộ khi build.

`filterByTags` nhận tham số `tags` thứ tư **bắt buộc**, không có giá trị mặc định: call
site nào bỏ sót thì build đỏ ngay, chứ không lặng lẽ đổi nghĩa phép lọc.

## Ngoài phạm vi

- **Chia thẻ "Chi theo nhãn" ở Báo cáo theo nhóm.** Trong một nhóm, nếu mỗi giao dịch
  chỉ mang một nhãn của nhóm đó thì tổng không đếm đúp và phần trăm cộng đủ 100% — khác
  hẳn nhãn phẳng. Nhưng không có ràng buộc nào cấm một giao dịch mang hai nhãn cùng
  nhóm, nên muốn nói phần trăm thì phải tự kiểm điều kiện đó trước. Việc riêng.
- **Kéo-thả đổi thứ tự nhóm.** `sort_order` đã có trong bảng; hai nhóm thì chưa cần UI.
- **Ép mỗi nhóm chỉ chọn một nhãn** (kiểu radio). Sẽ chặn trường hợp thật: "đi với
  người yêu VÀ bạn bè".
- **Trần chi theo nhóm.** Trần đang gắn với từng nhãn (migration 0036) và cứ để vậy.

## Triển khai

Migration `0039_tag_groups.sql` phải **áp tay lên Supabase thật** sau khi merge — dự án
chưa có pipeline tự động. Kiểm bằng cách mở bản thật (không phải demo) vào
`/settings/tags`: phải thấy sẵn hai section "Với ai?" và "Ở đâu?" rỗng, mọi nhãn cũ nằm
ở mục Khác kèm dải xếp nhanh.
