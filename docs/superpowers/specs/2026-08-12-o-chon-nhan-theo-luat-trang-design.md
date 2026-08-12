# Ô chọn nhãn — xếp lại theo luật của trang Nhập

**Ngày chốt:** 2026-08-12
**Trạng thái:** đã duyệt thiết kế, chưa code
**Sửa lại quyết định của:** `docs/superpowers/specs/2026-08-08-nhom-nhan-design.md` (mục "Ô chọn nhãn khi nhập")

## Vấn đề

Khối Nhãn trong form Nhập nhìn lộn xộn hơn mức nội dung của nó xứng đáng, và nó
**không nói cùng một thứ tiếng với phần còn lại của trang**.

Đo trên dữ liệu thật (2 nhóm: `Ai?` có 2 nhãn, `Ở đâu?` rỗng):

| Chỗ hỏng | Hiện trạng |
|---|---|
| Chiều dọc | Mỗi nhóm ăn 2 hàng (tiêu đề + hàng chip). Nhóm rỗng vẫn ăn đủ 2 hàng, phần chứa còn nhỏ hơn cái tiêu đề của nó |
| Thứ nổi nhất trong khối | 2–3 nút `+ mới` viền nét đứt — việc ít làm nhất lại bắt mắt trước cả chip nhãn |
| Chip chưa chọn | `opacity-60` → trên nền tối trông như bị vô hiệu hóa |
| Cỡ chữ / vùng chạm | tiêu đề nhóm cỡ `2xs`, chip cỡ `xs` cao 36px — cả trang dùng chip cao **44px** (`CHIP_BASE`) |
| Nhóm rỗng | không một chữ gợi ý nên gõ gì vào |
| Ô "hoàn tiền" bên dưới | dính sát khối nhãn, không có gì tách |

**Chỗ lệch nặng nhất là chuyện luật chung.** Cả trang Nhập không ô nào có chữ tên
bên cạnh — ô tiền, tài khoản, ngày, ghi chú, lưới danh mục đều tự nói bằng hình
dạng, tên chỉ nằm trong `aria-label` (xem chú thích ở `TransactionForm.tsx:1241`).
Khối Nhãn là ngoại lệ duy nhất, và bản sửa đầu tiên còn thêm chữ vào.

Và trang **đã có sẵn một luật đánh dấu trạng thái**: nút Nhắc sau / Lặp lại tắt thì
xám trung tính (`CHIP_OFF`), bật thì lên màu. Ô chọn nhãn lại tự nghĩ ra luật khác
(luôn đủ màu, phân biệt bằng độ mờ).

## Quyết định đã chốt

| # | Điểm | Chốt | Vì sao |
|---|------|------|--------|
| 1 | Bố cục nhóm | **Mỗi nhóm một hàng**, tên nhóm ở cột trái rộng cố định `w-16` (64px) | Ba hàng thẳng cột đọc nhanh hơn kiểu chữ-sát-chip; nhóm rỗng còn 1 hàng thay vì 2 |
| 2 | Nút `+ mới` ở từng nhóm | **Bỏ hẳn** | Đây là thứ bắt mắt nhất trong khối mà lại là việc ít làm nhất |
| 3 | Đường tạo nhãn mới | Gõ tên vào ô tìm → **mỗi nhóm hiện một chip `＋ Tạo "…"`** | Giữ nguyên giá trị của quyết định 2026-08-08: nhãn tạo lúc nhập vẫn sinh ra đã có nhóm |
| 4 | Nút mở ở đáy khối | **Luôn hiện** (trước chỉ hiện khi có nhãn bị ẩn) | Bỏ `+ mới` mà giữ điều kiện cũ thì sẽ có lúc không còn đường nào tạo nhãn |
| 5 | Chip chưa chọn | **Xám trung tính** (`CHIP_OFF`), chọn rồi mới lên màu của nhãn | Đúng luật nút Nhắc sau / Lặp lại. Bỏ `opacity`, bỏ viền `ring`, bỏ dấu ✓ |
| 6 | Chiều cao chip | **44px** (`min-h-11`) | Chuẩn của cả trang. 40px là con số không giống ai |
| 7 | Tiêu đề "Nhãn" | **Giữ**, đổi `(không bắt buộc)` → `(tùy chọn)` | Ngoại lệ có lý do: khi mọi nhóm còn rỗng, không còn gì nói đây là chỗ gắn nhãn |
| 8 | Tách ô "hoàn tiền" | **Nới khoảng cách, KHÔNG kẻ vạch** | Trong form này không có vạch kẻ nào; các khối chỉ cách nhau bằng khoảng trống |

**Chuyện chip chỉ có emoji:** nhãn nhóm `Ai?` của người dùng đặt tên bằng emoji
(👥, ❤️). Không thêm ô chữ nào vào DB chỉ để hiển thị — không đáng. Trong form Nhập
thì tên nhóm ở cột trái đã cho đủ ngữ cảnh. Ở **Báo cáo** nhãn đứng một mình nên vẫn
chỉ là một emoji trơ trọi; cách gọn nhất là đổi tên nhãn thành `👥 Cả nhà`, nhưng đó
là việc riêng, không nằm trong lần này.

## Hình dạng

```
🏷 Nhãn (tùy chọn)

Ai?      [👥]  [❤️]          ← 👥 đã chọn (lên màu), ❤️ chưa (xám)
Ở đâu?   chưa có nhãn
Khác     [Về VN 2026]  [Tết]

Tất cả (12) ⌄
```

Khi bấm mở và gõ một tên chưa có:

```
🔍 Cả nhà|

Ai?      ＋ Tạo "Cả nhà"
Ở đâu?   ＋ Tạo "Cả nhà"
Khác     ＋ Tạo "Cả nhà"
```

## Chi tiết dựng hình (`TagPicker.tsx`)

### Hàng nhóm

`flex items-start gap-2`. Cột tên: `w-16 shrink-0` + `flex h-11 items-center` để chữ
ngang tâm **hàng chip đầu tiên** (không phải tâm cả khối, khi chip xuống nhiều dòng).
Chữ `text-xs text-fg-muted truncate` kèm `title` — tên nhóm do người dùng tự đặt nên
có thể dài hơn 64px.

Về mặt đọc-bằng-máy: mỗi hàng là `role="group"` với `aria-labelledby` trỏ vào cột
tên, giữ nguyên hành vi hiện tại (nghe tên nhóm trước khi nghe các chip).

Nhóm rỗng: cột tên + chữ `chưa có nhãn` (`text-xs text-fg-muted`), hàng cao **28px**
chứ không 44px — hàng đó không có gì để chạm nên không cần vùng chạm.

### Chip nhãn

```
nền chung:  flex min-h-11 max-w-full items-center truncate rounded-full px-3.5
            text-sm transition active:scale-95
chưa chọn:  CHIP_OFF                       (border-border-strong bg-surface text-fg-muted)
đã chọn:    TAG_CHIP_CLASS[tagColor(...)]  (nền nhạt + chữ đậm màu của nhãn)
```

Chip đã chọn thêm `font-medium`, chưa chọn để `font-normal`.

**Một ca phải xử riêng: nhãn màu xám.** `TAG_CHIP_CLASS.gray` là `bg-surface-sunken`
— đặt cạnh `CHIP_OFF` (`bg-surface` + viền) thì chọn với chưa chọn gần như y nhau.
Với nhãn xám, trạng thái đã chọn dùng `bg-surface-sunken` + `text-fg-primary` (chữ
đậm màu thường) đối lại chữ `text-fg-muted` của chưa chọn. Phải xem bằng mắt ở cả
sáng và tối; nếu vẫn không phân biệt được thì đổi nhãn xám sang một nền đậm hơn, chứ
đừng quay lại dùng viền `ring` cho riêng nó.

Giữ `rounded-full` (không đổi sang `rounded-lg` như `CHIP_BASE`) — chip mẫu giao dịch
ở đầu form cũng `rounded-full`, đây là họ chip tròn.

Thêm `active:scale-95`: cả trang bấm cái gì cũng thụt một nhịp, riêng chip nhãn thì
không.

`aria-pressed` giữ nguyên. Phân biệt trạng thái không chỉ bằng sắc màu mà bằng
**có nền màu / không có nền màu** — cùng cách nút Lặp lại đang làm, nên mù màu vẫn
đọc được.

**`CHIP_OFF` phải chuyển ra chỗ dùng chung.** Nó đang nằm trong `TransactionForm.tsx`,
mà file đó `import TagPicker` — nhập ngược lại là vòng tròn. Tách `CHIP_BASE` +
`CHIP_OFF` sang `src/components/chip.ts`, hai bên cùng nhập từ đó. Không chép tay
sang TagPicker: chép là chắc chắn sẽ trôi khác nhau.

### Nút mở ở đáy — ba lời, một chỗ

| Trạng thái | Chữ trên nút |
|---|---|
| Chưa mở, còn nhãn bị ẩn | `Tất cả (N) ⌄` |
| Chưa mở, không có gì ẩn | `＋ Thêm nhãn` |
| Đang mở | `Thu gọn ⌃` |

Luôn hiện, kể cả khi chưa có nhãn nào và chưa có nhóm nào.

### Ô tìm kiêm ô tạo

Mở ra là **luôn** có ô tìm (trước chỉ hiện khi `total > COLLAPSED_LIMIT`). Placeholder
đổi theo: `Tìm trong N nhãn…`, hoặc `Tên nhãn mới…` khi chưa có nhãn nào.

**Tự bật con trỏ hay không, tùy nút nào mở.** Bấm `＋ Thêm nhãn` là muốn gõ →
`autoFocus`. Bấm `Tất cả (12)` là muốn lướt → không, vì bàn phím bật lên che đúng cái
danh sách vừa mở (lý do này đã ghi trong `TagPicker.tsx` từ trước, giữ nguyên). Lưu
bằng một state `openMode: 'browse' | 'create'`.

### Chip tạo

Hiện khi có chữ trong ô tìm **và không nhãn nào trùng tên hẳn** (so tên đã `trim`,
không phân biệt hoa thường, xét **cả nhãn đã lưu trữ** — `addTag` đang làm sống lại
nhãn lưu trữ khi gõ trùng tên, luật này phải khớp). Còn tìm thấy nhãn khớp thì chỉ
hiện nhãn đó, không chen chip tạo vào.

Ở chế độ tạo thì **hiện lại mọi nhóm**, kể cả nhóm không có nhãn nào khớp — nếu ẩn
đi thì mất luôn đường tạo nhãn vào nhóm đó. Nhóm rỗng lúc này hiện **chip tạo**, không
hiện chữ `chưa có nhãn`: đang gõ tên thì lời nhắc đó vô nghĩa.

Chip tạo hiện ở: **mọi nhóm thật**, cộng mục `Khác` **chỉ khi mục đó đang tồn tại**.
Không tự mọc ra mục Khác để mời gửi nhãn mới vào đó — trái với chốt 2026-08-08 (nhãn
tạo lúc nhập phải sinh ra đã có nhóm). Ngoại lệ duy nhất: **chưa có nhóm nào** thì
hiện một chip tạo không nhóm, không thì thành đường cùng.

Hình dạng: `min-h-11 rounded-full border border-dashed` + chữ màu nhấn.

### Tách ô "hoàn tiền"

Thêm `mt-1.5` cho `<label>` ô hoàn tiền (cột cuộn đã có `gap-1.5`, thành 12px thay vì
6px). Không `border-t`.

## Phần tính toán tách ra để kiểm thử được

Repo chưa có kiểm thử cho phần giao diện (không có file `.test.tsx` nào), chỉ có cho
phần tính toán. Nên đẩy quyết định xuống `groups.ts`, để `TagPicker.tsx` chỉ còn việc
vẽ:

```
createTargets(tags, sections, query) → { group: TagGroupRow | null }[]
```

| Ca | Kỳ vọng |
|---|---|
| `query` rỗng | `[]` |
| Trùng tên hẳn một nhãn đang dùng | `[]` |
| Trùng tên hẳn một nhãn **đã lưu trữ** | `[]` (gõ trùng là làm nó sống lại, không tạo cái mới) |
| Trùng một phần (`"Cả nh"`) | mọi nhóm thật |
| Có mục `Khác` trong `sections` | thêm một target `group: null` |
| Không có mục `Khác` | không có target `null` |
| Chưa có nhóm nào | đúng một target `group: null` |
| Tên có dấu cách đầu/cuối | so sau khi `trim` |

`pickerSections` không đổi — kiểm thử hiện có giữ nguyên, phải vẫn xanh.

Kiểm bằng `npm run build`, không chỉ `tsc --noEmit`.

## Chiều cao — nói thẳng

Bản này **không thấp hơn** bản cũ. Ước với 2 nhóm + mục Khác, mỗi nhóm 2–3 nhãn:
hiện ~204px (số đo đã ghi trong `TagPicker.tsx`), sau khi sửa ~210px. Chip từ 36px
lên 44px ăn lại đúng phần chỗ mà việc gộp hàng tiết kiệm được.

Cái thu được không phải chiều cao, mà là: bớt 2–3 nút nét đứt, chip đọc được, vùng
chạm đủ 44px, và khối này thôi nói tiếng riêng.

**Phải đo thật trên 375×812 sau khi code**, đúng như lần trước. Nếu vượt 260px thì hạ
`COLLAPSED_LIMIT` từ 3 xuống 2, **không** đổi lại bố cục.

## Ngoài phạm vi

- **Sửa ô tick mặc định của trình duyệt.** Cả app dùng ô mặc định ở 9 file; sửa riêng
  hai ô trong form Nhập là làm nó lạc tông chứ không phải đẹp hơn.
- **Đổi tên nhãn emoji thành `👥 Cả nhà`.** Việc riêng, cần người dùng quyết từng tên.
- **Chia thẻ "Chi theo nhãn" ở Báo cáo theo nhóm.** Vẫn ngoài phạm vi như 2026-08-08.
- **Bỏ tiêu đề "Nhãn" cho khớp tuyệt đối với trang.** Đã cân nhắc và chốt giữ (mục 7).
