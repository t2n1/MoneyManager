# Nhập phiếu lương PDF ngay trên web app

Ngày: 2026-08-15

Tiếp nối [2026-08-14-nhap-phieu-luong-design.md](2026-08-14-nhap-phieu-luong-design.md)
— spec đó định nghĩa *cái gì* được ghi vào sổ và *vì sao*. Spec này chỉ nói về việc
đưa nó vào trình duyệt. Mọi quyết định về bút toán, bộ nhãn, phép neo, sáu chốt chặn
đều **giữ nguyên**, không nhắc lại.

> Không có con số lương thật trong spec này. Toạ độ `x` là thật (chúng là hình học
> của trang, không phải tiền); chữ số thay bằng chỗ giữ cùng độ rộng.

## Vấn đề

Script dòng lệnh chạy được nhưng đòi ba thứ mà web app không đòi: một terminal thật
(ô nhập token cần TTY), một access token dán tay từ DevTools mỗi giờ, và Python kèm
`pypdf` + `cryptography`. Chủ sổ dùng app chứ không dùng terminal.

Hệ quả nặng hơn: **luật bóc chữ tồn tại hai bản** nếu web app tự port. Layout phiếu
lương đã đổi ít nhất ba lần trong 4,5 năm, nên nó *sẽ* phải sửa — và sửa hai chỗ,
kiểm hai lần, là món nợ chắc chắn phải trả.

## Kết quả dò khả thi (đã đo, không phải phỏng đoán)

`pdfjs-dist` 6.2.108, chạy trên đúng 60 file thật:

| Câu hỏi | Kết quả |
|---|---|
| Đọc được PDF mã hoá AES mật khẩu rỗng? | **được** |
| Toạ độ `x` so với `pypdf` | **trùng khít từng số thập phân** |
| Toạ độ `y` | lệch — `pdf.js` đo từ **đỉnh** trang, `pypdf` từ **đáy** |
| Sau khi lật `y = caoTrang − y` | **60/60 khớp tuyệt đối từng con số** |
| Đọc kỳ từ nội dung PDF | **60/60 không tệ hơn `pypdf`**, kể cả hai file `202308S`/`202402S` mà cả hai thư viện đều không đọc được kỳ (rơi về tên file, như cũ) |

Bằng chứng cho phép lật: nhãn `y=283.3` (pypdf) ⇄ `y=311.7` (pdf.js), số `y=309.5`
⇄ `y=285.5`. Cả hai cặp cộng lại đúng **595** = chiều cao trang (A4 ngang,
viewBox `[0,0,842,595]`).

**Hệ quả:** luật ghép và toàn bộ hằng số đã tinh chỉnh (`XMAX=72`, `YMAX=64`,
`XSLACK=6`, `YROW=3`, loại chữ khối ở `x≈42`) **giữ nguyên không đổi một số nào**.

Node 24.14 import `.ts` trực tiếp (bóc kiểu), đã thử thật. Và
[`tsconfig.app.json`](../../../tsconfig.app.json) **đã bật `erasableSyntaxOnly`** +
`verbatimModuleSyntax` — tức trình biên dịch vốn đã cấm đúng những thứ bộ bóc kiểu
của Node không xử được (enum, namespace, parameter property). Nên việc dùng chung một
mô-đun TS giữa web và CLI **không thêm ràng buộc mới nào**; nó đã được ép sẵn.

## Quyết định đã chốt

**Một bản duy nhất.** Luật bóc sống trong `src/` dưới dạng TS. `boc.py` bị **xoá**.
CLI import chính mô-đun đó.

**Chỉ máy tính.** Không hỗ trợ điện thoại: PDF tải từ cổng lương công ty, việc đó
làm ở máy tính. Bỏ được worker và thanh tiến trình cầu kỳ.

## Cấu trúc mô-đun

Theo lối sẵn có của [`csvImport.ts`](../../../src/features/import/csvImport.ts) (logic
thuần, có test) + [`ImportCsvPage.tsx`](../../../src/features/import/ImportCsvPage.tsx)
(giao diện):

```
src/features/phieu-luong/
  boc.ts                    luật ghép toạ độ · bộ nhãn · hai đẳng thức tự kiểm
  nhap.ts                   map danh mục · neo · dựng dòng · gom trùng · sáu chốt
  boc.test.ts
  nhap.test.ts
  ImportPhieuLuongPage.tsx  giao diện
  docPdfWeb.ts              adapter trình duyệt: workerSrc + lật y
```

**CLI cần adapter RIÊNG**, ở `scripts/phieu-luong/docPdfNode.mjs`: nó dùng bản
`legacy` và không đặt `workerSrc`. Hai adapter là đúng — chúng khác nhau thật. Cái
*không* được có hai bản là **luật ghép**, và luật ghép nằm trong `boc.ts` mà cả hai
adapter đều nạp cùng một bản.

`scripts/phieu-luong/logic.mjs` → `src/features/phieu-luong/nhap.ts`.
`scripts/phieu-luong/boc.py` → **xoá**.
`scripts/nhap-phieu-luong.mjs` giữ nguyên vai trò, đổi sang import từ `src/`.

## `pdf.js` là tham số, không phải import cứng

`boc.ts` **không** import `pdfjs-dist`. Nó nhận danh sách ô chữ đã đọc sẵn:

```ts
export interface OChu { text: string; x: number; y: number }
export function bocPhieu(oChu: OChu[], tenFile: string): Phieu
```

Hai lý do, lý do thứ hai quan trọng hơn:

1. Trình duyệt phải đặt `GlobalWorkerOptions.workerSrc`, Node thì không. Import cứng
   là mô-đun chỉ chạy được một phía.
2. **Test không cần file PDF nào.** Bơm ô chữ giả với toạ độ đã biết là kiểm được
   luật ghép trực tiếp — kể cả ba cái bẫy đã trả giá để tìm ra. Nếu `boc.ts` tự đọc
   PDF thì mọi test đều phải kèm file nhị phân, và một lỗi ghép sẽ khó tách khỏi một
   lỗi đọc.

**Việc lật `y` nằm trong adapter, KHÔNG nằm trong `boc.ts`.** `boc.ts` làm việc trong
hệ "y tăng lên trên" như `pypdf`, vì mọi hằng số đã tinh chỉnh theo hệ đó. Đưa phép
lật vào `boc.ts` là trộn hai việc, và người sửa sau sẽ không biết hằng số thuộc hệ nào.

```ts
// pdfjsAdapter.ts
const caoTrang = page.getViewport({ scale: 1 }).viewBox[3]
items.map((it) => ({ text: it.str.trim(), x: it.transform[4], y: caoTrang - it.transform[5] }))
```

## Giao diện — `/settings/nhap-phieu-luong`

Lazy-route như `ImportCsvPage` ([`App.tsx:143`](../../../src/App.tsx)). Một trang,
bốn trạng thái:

**1. Chọn file** — `<input type="file" multiple accept="application/pdf">`. Nhiều file
vì đổi layout thì phải nhập lại cả xấp; chi phí thêm gần bằng không (`multiple` + một
vòng lặp).

**2. Xem trước** — mỗi phiếu một dòng: kỳ · ngày neo · phần bị giữ lại · các mục chi ·
trạng thái. Phiếu bị từ chối hiện **kèm lý do đầy đủ**, không bị ẩn — cùng nguyên tắc
"từ chối và gọi tên" của CLI. Nút Ghi chỉ ghi phiếu đạt.

Cột trạng thái phải phân biệt được ba ca mà CLI phân biệt: *đạt* · *đã nhập rồi* ·
*từ chối kèm lý do*. Gộp hai ca sau thành "lỗi" là mất thông tin người dùng cần.

**3. Thiếu danh mục** — chặn, kèm nút tạo 6 danh mục ngay tại đó (thay `--tao-danh-muc`).
Phân loại `cost_type` chia hai như spec cũ.

**4. Xong** — số phiếu/dòng đã ghi, và nút **Gỡ lô này** (thay `--go`).

## Đường ghi

Qua `repo.createTransaction` như mọi chỗ khác trong app, nên `user_id` và `sort_order`
tự đúng. **Không cần token**: trang đã đăng nhập. Đây là cái lợi lớn nhất so với CLI.

Sáu chốt chặn port nguyên, kể cả chốt 0 (gom file trùng) và chốt dấu. Xác nhận `y/N`
của terminal thành hộp xác nhận nêu rõ số dòng sẽ ghi.

## Trọng lượng bundle — hai việc bắt buộc

`pdf.min.mjs` 0,5 MB + `pdf.worker.min.mjs` 1,3 MB = **1,8 MB**, trong khi toàn bộ
`dist/assets` hiện tại là **2,0 MB**. Tức nó gần **gấp đôi** trọng lượng app.

1. **Nạp động** `await import('pdfjs-dist')` bên trong trang → Vite tách chunk riêng,
   chỉ tải khi mở trang đó.
2. **Loại khỏi precache.** [`vite.config.ts:33`](../../../vite.config.ts) đang dùng
   `globPatterns: ['**/*.{js,css,html,svg,png,ico}']`, nên chunk `pdf.js` **sẽ** bị
   precache. Thêm `workbox.globIgnores` cho chunk đó. Không làm bước này thì mỗi lần
   cập nhật PWA trên điện thoại tốn thêm 1,8 MB cho một tính năng chỉ dùng ở máy tính.

Giữ nguyên `importScripts: ['/push-sw.js']` và **không** đổi sang `injectManifest` —
ghi chú tại chỗ đó đã cảnh báo rằng làm vậy bắt phải tự dựng lại phần precache +
`navigateFallback`, và làm sai là mất chế độ offline mà không test nào bắt được.

## Kiểm thử

**`boc.test.ts`** — bơm ô chữ giả, không cần PDF. Phải phủ đúng ba cái bẫy đã trả giá
(xem spec cũ, mục "Sáu lỗi đã mắc"):

- số **canh phải** nên số ba chữ số lệch xa hơn số sáu ký tự (`ccc` 43,8pt ⇄
  `aa,aaa` 25,8pt) — ngưỡng quá chặt là rơi nhãn trong im lặng
- nhãn **trải hai dòng** dưới cùng một dòng số (layout từ 2026/06)
- **chữ khối dựng dọc** ở `x≈42` giành số của nhãn cột đầu rồi vòng lặp dừng
- nhãn bỏ trống tự nhiên (`厚生年金基金`, `その他`) không nhận gì
- hai đẳng thức tự kiểm, và nhãn lạ → từ chối cả file

**`nhap.test.ts`** — port **đúng 30 test** hiện có của `logic.test.mjs` (đã đếm), giữ
nguyên mọi ca thật: `過不足税額` cả hai dấu, ca ròng > gộp bị từ chối (chốt dấu),
`社内販売精算` không vào nhóm thuế, tách hai dòng thu theo `exclude_from_stats`, gom
file trùng, `is_refund` tường minh trên mọi dòng. Số test **không được giảm** — 30
vào, ít nhất 30 ra.

**Chốt di trú — điều kiện để được xoá `boc.py`:** một script dùng một lần so bản TS
với `phieu-luong.json` do `pypdf` sinh, phải **60/60 khớp tuyệt đối**. Không đạt thì
không xoá, và spec này chưa hoàn thành.

## Rủi ro đã biết

**`pdf.js` cắt chữ khác `pypdf`.** Đã thấy: `"2022年"` · `" "` · `"2月分"` thành ba ô
riêng, và có ô chuỗi rỗng. Phép đọc kỳ nối tất cả ô lại nên không bị ảnh hưởng (đã
kiểm 60/60), nhưng nếu sau này thêm phép đọc nào dựa vào ranh giới ô thì phải đo lại.

**Bản `legacy` vs bản thường.** Dò dùng `pdfjs-dist/legacy/build/pdf.mjs` để chạy
trong Node. Trình duyệt dùng được bản thường; CLI thì cần `legacy`. Nếu hai bản cho
toạ độ khác nhau thì chốt di trú sẽ bắt được — **nhưng chỉ nếu chạy chốt đó ở cả hai
phía**. Bằng chứng 60/60 hiện có *chỉ* chứng minh cho bản `legacy` trong Node; phía
trình duyệt **chưa được đo**. Đây là chỗ chưa có bằng chứng, không phải chỗ đã yên.

**Ba cái bẫy che nhau.** Lịch sử của luật này: hai lỗi che nhau, sửa một cái làm cả
60 file hỏng cùng lúc. Khi port, đừng "dọn dẹp" hằng số hay đổi thứ tự vòng lặp — port
nguyên văn trước, chốt di trú xanh, rồi mới nói đến sửa sang.

## Hạn chế đã biết

**`給与 ` là tay cầm duy nhất để nhận diện dòng đã nhập.** `xoaPhieuLuong()` xoá
mọi dòng `note LIKE '給与 %'`, không phân biệt nguồn gốc. Một giao dịch do người
dùng **gõ tay** mà `note` tình cờ bắt đầu bằng `給与 ` sẽ bị coi là dấu của lô nhập
phiếu lương và bị xoá theo. Không đường nhập nào trong repo này tự sinh ra `note`
dạng đó ngoài `dauGhiChu()`, nên rủi ro thật chỉ nằm ở nhập tay — nhưng đây là một
giả định ngầm của thiết kế, không phải điều DB ép được.

**Chưa chạy thử end-to-end trên trình duyệt thật (ghi rồi xoá, trên sổ thật).**
Đường xoá (`goLo`) xoá **toàn bộ** lịch sử phiếu lương đã nhập, không chỉ lô vừa
ghi — chạy thử nghĩa là trả giá bằng một lần nhập lại toàn bộ. Và mọi phiếu lương
đã có PDF trong sổ thật đều **đã được nhập rồi**, nên đường ghi (`ghi`) không còn
cách nào để chạm tới mà không có PDF mới.

**Chưa bóc thử một phiếu lương thật nào trong trình duyệt thật.** Bằng chứng hiện
có là gián tiếp: hai bản dựng `pdfjs-dist` (`legacy` dùng ở CLI/Node, bản thường
dùng ở web) cho toạ độ **khớp tuyệt đối từng số** trên cả 60 file khi so bằng
script (chốt di trú), và `pdf.js` bản rút gọn (`min.mjs`) đã được xác nhận nạp
được thật trong trình duyệt qua một `Worker` thật, đọc đúng lỗi khi đưa vào file
hỏng. Nhưng chưa có lần nào bóc một phiếu lương thật ngay trên trang này trong
trình duyệt thật.

**Trang web không có màn chặn "Đủ danh mục Đi chợ" ở đầu như CLI.** CLI dừng và
liệt kê thiếu danh mục thuế trước khi bóc bất kỳ file nào. Trang web không chặn
tương tự ở bước chọn file — nó cho bóc và xem trước bình thường, rồi hiện lý do
"thiếu danh mục" theo từng dòng ở màn xem trước (cùng nguyên tắc "từ chối và gọi
tên" của CLI), thay vì chặn một lần ở đầu.

## Ngoài phạm vi

- Bóc trong Web Worker; hỗ trợ điện thoại; kéo-thả file
- Đọc phiếu lương của công ty khác — bộ nhãn hiện chỉ đo trên phiếu 株式会社KOME
- Ca `ròng > gộp` (một phiếu tháng 12/2023) vẫn bị từ chối, xử tay như cũ
- Cộng phần thuế **bền** vào `emergencyFundMonths` — căng thẳng còn treo, ghi ở spec cũ
