# Ô chọn nhãn — xếp lại theo luật của trang Nhập

**Ngày chốt:** 2026-08-12
**Trạng thái:** đã duyệt thiết kế, chưa code
**Sửa lại quyết định của:** `docs/superpowers/specs/2026-08-08-nhom-nhan-design.md` (mục "Ô chọn nhãn khi nhập")

## Vấn đề

Khối Nhãn trong form Nhập nhìn lộn xộn hơn mức nội dung của nó xứng đáng, và nó
**không nói cùng một thứ tiếng với phần còn lại của trang**.

Ảnh chụp dùng để soi mấy lỗi dưới đây là **localhost**, không phải dữ liệu thật: ở đó
`Ai?` có 2 nhãn và `Ở đâu?` rỗng, còn bản chạy thật thì `Ở đâu?` đã có nhãn. Nên mọi
lỗi *hình dạng* dưới đây vẫn đúng (chúng không phụ thuộc số nhãn), nhưng **không được
suy con số nào từ ảnh đó** — số nhãn thật, và có hay không mục `Khác`, đều chưa biết.

Điều duy nhất chắc chắn về dữ liệu, do người dùng chốt: **đúng 2 nhóm (`Ai?`,
`Ở đâu?`), không có ý định thêm nhóm mới.**

| Chỗ hỏng | Hiện trạng |
|---|---|
| Chiều dọc | Mỗi nhóm ăn 2 hàng (tiêu đề + hàng chip). Nhóm rỗng vẫn ăn đủ 2 hàng, phần chứa còn nhỏ hơn cái tiêu đề của nó |
| Thứ nổi nhất trong khối | 2–3 nút `+ mới` viền nét đứt — việc ít làm nhất lại bắt mắt trước cả chip nhãn |
| Chip chưa chọn | `opacity-60` → trên nền tối trông như bị vô hiệu hóa |
| Cỡ chữ / vùng chạm | tiêu đề nhóm cỡ `2xs`, chip cỡ `xs` cao 36px — cả trang dùng chip cao **44px** (`CHIP_BASE`) |
| Nhóm rỗng | không một chữ gợi ý nên gõ gì vào |
| Ô "hoàn tiền" bên dưới | dính sát khối nhãn, không có gì tách |

**Chỗ lệch nặng nhất là chuyện luật chung.** Ở form nhập THƯỜNG
(`activeRole === 'none'` — đúng lúc ô chọn nhãn hiện ra), không ô nào có chữ tên bên
cạnh: ô tiền, tài khoản, ngày, ghi chú, lưới danh mục đều tự nói bằng hình dạng, tên
chỉ nằm trong `aria-label` (chú thích ở `TransactionForm.tsx:1241`). Khối Nhãn là chỗ
duy nhất có chữ, và bản sửa đầu tiên còn thêm chữ vào.

**Nhưng app KHÔNG phải không có luật đặt nhãn chữ** — chỗ này lúc soát thiết kế mình
nói sai, chép lại cho đúng. `roleFields.tsx:13` có sẵn một token:

```
labelCls = 'mb-1 block text-xs font-medium text-fg-muted'
```

Các field của vai trò đặc biệt (Cho vay, Gửi tiền về VN, Chia tiền) dùng nó cho mọi ô,
**kể cả cho một NHÓM CHIP** (`roleFields.tsx:308`: `<span className={labelCls}>Người
đã cho vay (cộng dồn)</span>` đặt trên `PeopleChips`) — đúng y cấu trúc của ô chọn
nhãn. Hai bên không bao giờ hiện cùng lúc (`TagPicker` chỉ vẽ khi `activeRole ===
'none'`), nên không đụng nhau trên màn hình, nhưng nó có nghĩa là: đặt chữ tên cho một
nhóm chip là **việc app đã làm rồi**, không phải ngoại lệ phải xin phép.

Vì vậy chữ trong khối Nhãn phải dùng đúng cỡ và độ đậm của `labelCls`
(`text-xs font-medium text-fg-muted`), chứ không phải cỡ `2xs font-semibold` như tiêu
đề nhóm hiện tại — đó mới là chỗ sai thật.

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
| 6 | Chiều cao chip | **44px** (`min-h-11`) | Chuẩn của họ chip / hàng bấm được: `CHIP_BASE`, dòng menu Lặp lại, nút mở vai trò đều `min-h-11`. 40px là con số không giống ai. (Ô nhập chữ trong trang thì nhỏ hơn — ngày 34px, ghi chú 38px — nên ô tìm không đổi theo) |
| 7 | Tiêu đề "Nhãn" | **Giữ**, đổi `(không bắt buộc)` → `(tùy chọn)` | Khi mọi nhóm còn rỗng thì không còn gì nói đây là chỗ gắn nhãn. Và đặt chữ tên cho một nhóm chip là việc `roleFields` đã làm sẵn bằng `labelCls` |
| 8 | Tách ô "hoàn tiền" | **Nới khoảng cách, KHÔNG kẻ vạch** | Trong form này không có vạch kẻ nào; các khối chỉ cách nhau bằng khoảng trống |
| 9 | Số nhãn hiện sẵn mỗi nhóm | **Theo số nhóm**: `groups.length <= 2 ? 4 : 3` | Số 3 sinh ra vì lúc đó tính có 3 mục, mỗi mục thêm MỘT hàng tiêu đề riêng. Nay tiêu đề nằm cùng hàng với chip và chỉ có 2 nhóm → chỗ đó dư ra, trả lại cho nhãn |
| 10 | Ô tìm | Chỉ hiện khi **có hơn 6 nhãn**, hoặc đang ở chế độ tạo | "Tìm trong 3 nhãn…" là ô vô nghĩa chiếm 36px |

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

`flex items-start gap-2`. Cột tên: `w-16 shrink-0` + `flex items-center` để chữ ngang
tâm **hàng chip đầu tiên** (không phải tâm cả khối, khi chip xuống nhiều dòng).

Chữ dùng đúng token của `labelCls`: `text-xs font-medium text-fg-muted`, thêm
`truncate` + `title` — tên nhóm do người dùng tự đặt nên có thể dài hơn 64px.

**Giữ 64px, chưa hạ xuống 56px.** Ở cỡ chữ này `Ở đâu?` chỉ chiếm ~40px nên 56px là
đủ, nhưng tên nhóm trên bản chạy thật **chưa biết chắc** (bản gốc migration seed là
`Với ai?`, còn ảnh localhost hiện `Ai?` — tức đã có chỗ bị đổi tên). Đo tên thật trước,
cả hai tên ≤ 6 ký tự thì hạ `w-16` → `w-14`, trả 8px cho chip.

**Chiều cao cột tên phải bằng chiều cao hàng đầu**, không thì chữ lệch so với chip:
`h-11` ở hàng có chip, `h-7` ở hàng rỗng (xem dưới). Một class theo trạng thái, không
để `h-11` cứng.

Về mặt đọc-bằng-máy: mỗi hàng là `role="group"` với `aria-labelledby` trỏ vào cột
tên, giữ nguyên hành vi hiện tại (nghe tên nhóm trước khi nghe các chip).

Nhóm rỗng: cột tên + chữ `chưa có nhãn` (`text-xs text-fg-muted`), hàng cao **28px**
(`h-7`) chứ không 44px — hàng đó không có gì để chạm nên không cần vùng chạm.

### Chip nhãn

```
nền chung:  flex min-h-11 max-w-full items-center truncate rounded-full border px-3.5
            text-sm transition active:scale-95
chưa chọn:  CHIP_OFF                        (border-border-strong bg-surface text-fg-muted)
đã chọn:    border-transparent + TAG_CHIP_CLASS[tagColor(...)]
```

**`border` nằm ở nền chung, trạng thái đã chọn dùng `border-transparent`** — không phải
chỉ chưa-chọn mới có viền. Bỏ viền hẳn thì chip đã chọn hẹp hơn 2px, và bấm một chip sẽ
đẩy các chip sau nó nhảy chỗ — đúng cái mà thiết kế 2026-08-08 đã đặt luật cấm. Lưới
danh mục có sẵn cách này: `CategoryTile` dùng `border-transparent` cho ô chưa chọn
(`TransactionForm.tsx:1380`).

**Không đổi độ đậm chữ theo trạng thái.** Bản đầu định cho chip đã chọn `font-medium`;
đo trên 375×812 thấy nó làm chip rộng thêm 1px, đủ để đẩy các chip đứng sau dịch chỗ —
đúng cái mà `border-transparent` vừa đi chữa. Phân biệt bằng nền + màu chữ + viền, cả
ba đều không đổi kích thước.

**Ca sát nhất là nhãn màu xám**, vì `TAG_CHIP_CLASS.gray` (`bg-surface-sunken`) rất gần
`CHIP_OFF` (`bg-surface`). Số đo thật ở nền tối: nền L 0.21 → 0.278, chữ L 0.707 →
0.872, viền hairline biến mất. Đọc ra được — chủ yếu nhờ chữ sáng lên và viền mất, không
nhờ nền. Nếu về sau đổi bảng màu làm hai bên sát hơn nữa thì đổi NỀN của nhãn xám cho
đậm hơn, đừng quay lại dùng viền `ring` hay `font-medium` cho riêng nó.

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

### Hàng đáy — hai nút, không bao giờ có ngõ cụt

Hàng đáy có **hai nút chữ** đứng cạnh nhau, mỗi nút có điều kiện hiện riêng:

| Nút | Hiện khi | Chữ |
|---|---|---|
| Mở / thu gọn | `hasRest \|\| expanded` | `Tất cả (N) ⌄` hoặc `Thu gọn ⌃` |
| Tạo nhãn | **ô nhập đang ẩn** | `＋ Thêm nhãn` |

Luật của nút thứ hai là chỗ **bịt một ngõ cụt tìm ra lúc viết kế hoạch**: có 5 nhãn mà
1 nhãn bị ẩn thì nút đầu ghi `Tất cả (5)`, mở ra — theo luật "hơn 6 nhãn mới hiện ô
tìm" thì không có ô nào — và thế là hết đường tạo nhãn mới.

Buộc vào "ô nhập đang ẩn" nên **luôn có đúng một đường tạo nhãn nhìn thấy được**: hoặc
là ô nhập, hoặc là nút này. Không bao giờ cả hai (dư), không bao giờ không cái nào (ngõ
cụt).

Bấm `＋ Thêm nhãn`: `expanded = true`, `openMode = 'create'`, dọn `query`.
Bấm `Tất cả (N)`: `expanded = true`, `openMode = 'browse'`, dọn `query`.

Đổi lại so với bản trước: nút tạo giờ **có thể hiện cùng lúc** với nút `Tất cả`, chứ
không phải hai lời của cùng một nút. Vẫn chỉ là 1 hàng, 2 chữ nhỏ, không viền nét đứt.

### Chưa có nhóm nào cũng không được là ngõ cụt

`createTargets` trả về một target không nhóm khi chưa có nhóm nào, nhưng lúc đó
`sections` rỗng — không có hàng nào để vẽ chip tạo vào. Ca này phải vẽ **một hàng ảo**
nhãn `Khác`. Chỉ xảy ra khi cả `tag_groups` lẫn `tags` đều trống (hồ sơ mới mà seed
nhóm chưa chạy), nhưng không xử thì đúng lúc đó app không tạo được nhãn nào.

### Ô tìm kiêm ô tạo

Ô này có **hai vai**, và điều kiện hiện khác nhau:

| Vai | Hiện khi | Placeholder |
|---|---|---|
| Ô tìm | `total > 6` | `Tìm trong N nhãn…` |
| Ô nhập tên nhãn mới | `openMode === 'create'` (bấm `＋ Thêm nhãn`) | `Tên nhãn mới…` |

Nghĩa là mở khối bằng `Tất cả (N)` khi chỉ có 5 nhãn thì **không có ô nào cả** — chỉ
là danh sách nhãn đầy đủ. Mắt đọc 5 nhãn nhanh hơn tay gõ, ô tìm ở đó chỉ chiếm 36px.

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

### Bấm chip tạo thì xảy ra gì (chỗ bản mô tả đầu còn thiếu)

State `draft` và `addingIn` **biến mất** — không còn ô nhập rời trong từng nhóm nữa,
tên nhãn mới lấy từ `query`. `addTag` đổi thành `addTag(groupId, name)`, nhận tên qua
tham số thay vì đọc `draft`.

Bấm một chip tạo:

1. Tạo nhãn (hoặc làm sống lại nhãn lưu trữ trùng tên — giữ nguyên logic hiện có), gắn
   vào giao dịch đang nhập.
2. **Xóa `query`, thu gọn khối** (`expanded = false`). Nhãn vừa tạo hiện ngay thành chip
   đã chọn trong nhóm của nó, người dùng thấy việc đã xong.
3. Tạo hỏng (trùng tên trên DB, mất mạng): **giữ nguyên `query` và giữ khối đang mở** để
   sửa lại. Đây là lý do `try/catch` hiện có tồn tại (`TagPicker.tsx:100`) — đừng đánh
   mất nó khi viết lại.

### Bàn phím che chip tạo — rủi ro phải xử

Mở bằng `＋ Thêm nhãn` là tự bật con trỏ → bàn phím hệ thống trồi lên, mà chip tạo lại
nằm NGAY DƯỚI ô tìm, ở gần đáy vùng cuộn của form. Rất dễ thành: gõ xong không thấy chỗ
nào để bấm.

Xử: khi mở ở chế độ tạo thì `scrollIntoView({ block: 'center' })` cả khối nhãn (form đã
có `scrollRef` cho vùng cuộn). **Phải thử tay trên máy thật, bàn phím bật lên** — không
tin vào việc mô phỏng bằng cách thu nhỏ cửa sổ, vì bàn phím hệ thống không làm co
viewport giống nhau trên mọi máy.

Không dùng Enter để tạo: có nhiều nhóm thì Enter không biết tạo vào nhóm nào, mà đoán
sai thì nhãn rơi vào nhóm khác — im lặng và khó thấy.

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
| Chỉ gõ dấu cách | `[]` — không mời tạo nhãn tên rỗng |

`pickerSections` không đổi — kiểm thử hiện có giữ nguyên, phải vẫn xanh.

Thêm cho `collapsedLimit` — kiểm riêng nó, không kiểm gián tiếp qua `pickerSections`:

| Ca | Kỳ vọng |
|---|---|
| 0, 1, 2 nhóm | `4` |
| 3 nhóm trở lên | `3` |

Rồi một ca `pickerSections` dùng limit 4 để chắc rằng nhóm có 4 nhãn thì `rest` rỗng và
nhóm có 6 nhãn thì `rest` còn 2 — đây là tính chất của `pickerTags`, chỉ cần một ca
xác nhận nó vẫn đúng ở con số mới.

Kiểm bằng `npm run build`, không chỉ `tsc --noEmit`.

## Số nhãn hiện sẵn — vì sao dám nâng lên 4

```
collapsedLimit(groupCount) = groupCount <= 2 ? 4 : 3
```

Hàm nhỏ, xuất ra từ `groups.ts` để kiểm thử được, gọi từ `TagPicker` thay cho hằng số
`COLLAPSED_LIMIT`.

**Buộc vào số NHÓM, không phải số mục** — và đây là chỗ mình viết sai ở bản đầu, phải
sửa: `sections.length` không dùng được vì `sections` là *kết quả* của
`pickerSections(…, limit)`, tức phải có limit trước mới có nó. Vòng tròn.

Cũng **không** đổi `pickerSections` thành tự tính limit bên trong. Tám ca kiểm thử hiện
có đang dùng limit làm núm xoay (`limit: 2` để kiểm thứ tự xếp hạng, `8` để kiểm "ít hơn
limit thì hiện hết"). Chôn limit vào trong là mất núm đó, và làm mấy test xếp hạng phụ
thuộc vào luật limit — hai thứ chẳng liên quan gì nhau. Chữ ký `pickerSections` **giữ
nguyên**, tests hiện có **không phải sửa dòng nào**.

Đánh đổi phải nói ra: nếu mục `Khác` tự xuất hiện (khôi phục bản sao lưu lệch, nhãn
trỏ tới nhóm đã xoá) thì có 3 mục mà limit vẫn 4 — ca xấu nhất cao thêm ~50px. Chấp
nhận, vì đó là ca hiếm và đã có đường lùi ở mục Chiều cao (đo, vượt thì hạ xuống 3).
Không lặp lại logic "mục Khác có xuất hiện hay không" ở hai chỗ để rồi hai bên trôi
khác nhau.

`pickerTags` đã có sẵn tính chất "ít hơn limit thì hiện hết", nên nhóm nào có ≤4 nhãn
là không còn nhãn nào bị ẩn — hết phải bấm `Tất cả` cho nhóm đó.

## Chiều cao — nói thẳng

Bản này **không thấp hơn** bản cũ, và với limit 4 thì có thể cao hơn.

| Ca | Ước |
|---|---|
| 2 nhóm, mỗi nhóm 2–3 nhãn ngắn (1 hàng chip mỗi nhóm) | ~150px |
| 2 nhóm, mỗi nhóm 4 nhãn tên dài (2 hàng chip mỗi nhóm) | ~252px ← ca xấu nhất |
| 3 mục vì `Khác` tự xuất hiện, limit vẫn 4 | ~300px ← ca hiếm, xem đường lùi dưới |
| Hiện tại, để so | 204px (số đo đã ghi trong `TagPicker.tsx`) |

Chip từ 36px lên 44px ăn lại đúng phần chỗ mà việc gộp hàng tiết kiệm được. Cái thu
được không phải chiều cao, mà là: bớt 2–3 nút nét đứt, chip đọc được, vùng chạm đủ
44px, và khối này thôi nói tiếng riêng.

**Phải đo thật trên 375×812 sau khi code, bằng dữ liệu THẬT** — không phải localhost,
vì số nhãn ở hai nơi khác nhau và chính chỗ đó quyết định chiều cao. Nếu ca xấu nhất
vượt 260px thì hạ nhánh 2-mục từ 4 xuống 3, **không** đổi lại bố cục.

## Ngoài phạm vi

- **Sửa ô tick mặc định của trình duyệt.** Cả app dùng ô mặc định ở 9 file; sửa riêng
  hai ô trong form Nhập là làm nó lạc tông chứ không phải đẹp hơn.
- **Đổi tên nhãn emoji thành `👥 Cả nhà`.** Việc riêng, cần người dùng quyết từng tên.
- **Chia thẻ "Chi theo nhãn" ở Báo cáo theo nhóm.** Vẫn ngoài phạm vi như 2026-08-08.
- **Bỏ tiêu đề "Nhãn" cho khớp tuyệt đối với trang.** Đã cân nhắc và chốt giữ (mục 7).
