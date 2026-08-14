# Nhập phiếu lương 給与明細 (PDF) để chạy chỉ số Thuế & An sinh

Ngày: 2026-08-14

> **Mọi con số tiền trong spec này là SỐ MINH HOẠ**, không phải số thật trên phiếu
> lương. Chúng được chọn để giữ đúng *quan hệ* mà lập luận thiết kế dựa vào (các
> đẳng thức khớp tới đơn vị, dấu, thứ tự độ lớn), nên đọc vẫn kiểm được. Số thật
> chỉ nằm trong `phieu-luong.json` — file đó bị `.gitignore`.

## Vấn đề

Chỉ số "Thuế & an sinh trên lương gộp" ([`HealthView.tsx:581`](../../../src/features/health/HealthView.tsx))
tính `taxAndSocial ÷ annualIncome`, trong đó tử số là chi thuộc nhóm danh mục
`Thuế & An sinh`. Sổ hiện chỉ ghi **lương ròng** — mỗi kỳ đúng một dòng thu ngân
hàng — nên tử số bằng 0 và thẻ luôn hiện `—`.

Chủ sổ có **59 phiếu lương PDF** trải 2022/02 → 2026/08. Nhập tay 59 phiếu ×
6 dòng là việc không ai làm hai lần, nên cần script.

## Bộ dữ liệu thật (đã đo, không phải phỏng đoán)

60 file trong một thư mục (59 phiếu phân biệt — xem "Chốt 0"), tên
`(<社員番号>)<YYYYMM><K|S>.pdf`:

| 社員番号 | Kỳ |
|---|---|
| `0004` | 2022/02 → 2024/04 |
| `0003` | 2024/05 → 2025/03, 2025/08 → 2025/10, 2025/11 → 2026/01 |
| `0011` | 2026/02 → 2026/07 |
| `0101` | 2026/08 |

Không kỳ nào bị hai số hiệu cùng lúc → cùng một người, đổi số hiệu qua các đợt.

`K` = 給与 (lương tháng, 51 file) · `S` = 賞与 (thưởng, 8 file: 202209S, 202302S,
202308S, 202402S, 202408S, 202502S, 202508S, 202602S).

PDF **mã hoá AES với mật khẩu rỗng**, font Type0/CID có `ToUnicode`.

## Phiếu minh hoạ dùng xuyên spec

| 支給 | ¥ | 控除 | ¥ |
|---|---|---|---|
| — | | `健康保険料` | 20,000 |
| | | `厚生年金保険` | 36,000 |
| | | `雇用保険料` | 2,000 |
| | | `所得税` | 4,000 |
| | | `住民税` | 16,000 |
| **`総支給金額`** | **400,000** | **`控除合計額`** | **78,000** |

`差引支給額 = 400.000 − 78.000 = 322.000`

## Quyết định đã chốt

**Không chạm dòng sao kê.** Không sửa dòng thu ngân hàng thành số gộp. Thay vào
đó thêm một dòng thu "phần bị giữ lại" + các dòng chi khấu trừ. Lý do: codebase
này đặt việc khớp sao kê lên đầu — xem ghi chú ở
[`roleSave.ts:258`](../../../src/features/transactions/roleSave.ts) ("thẻ phải trừ
đủ 10.000 (khớp sao kê)"). Sửa một dòng nhập từ sao kê thành số chưa từng có trên
sao kê là đi ngược nguyên tắc đó. Đổi lại: mỗi kỳ lương có hai dòng thu, và gỡ lô
nhập chỉ là xoá các dòng mang dấu.

**Hai tầng, hai ngôn ngữ.** `pypdf` + `cryptography` đã chạy thật trên cả 60 file;
`unpdf`/`pdfjs` chưa được chứng minh trên bộ này. Đổi sang JS nghĩa là kiểm lại 60
file bằng thư viện chưa đo, đổi lấy con số không.

**File JSON ở giữa là chỗ soát bằng mắt** trước khi hơn ba trăm dòng chạm vào sổ,
và cho phép bóc lại rồi so diff mà không đụng DB.

## Kiến trúc

```
thư mục PDF ──[tầng 1: boc.py]──► phieu-luong.json ──[tầng 2: nhap-phieu-luong.mjs]──► Supabase
              thuần cục bộ                            xem trước / --ghi / --go
```

### Tầng 1 — `scripts/phieu-luong/boc.py`

Không mạng, không DB. Đọc thư mục PDF, ghi `phieu-luong.json`.

### Tầng 2 — `scripts/nhap-phieu-luong.mjs`

Theo đúng khuôn [`nhap-sao-ke-rakuten.mjs`](../../../scripts/nhap-sao-ke-rakuten.mjs):
chạy tay, mặc định **chỉ xem trước**, `--ghi` mới ghi thật kèm xác nhận `y/N` mặc
định KHÔNG, khoá đọc từ `.env.local`.

## Luật bóc chữ

`extract_text(extraction_mode='layout')` cho bố cục thẳng cột, nhưng **ghép theo
chuỗi đã đệm khoảng trắng là sai** — nhãn trải hai dòng dưới cùng một dòng số ở
layout từ 2026/06. Phải dùng toạ độ thật qua `visitor_text`.

Toạ độ đo trên một phiếu 2022 (`x` là thật; chữ số thay bằng chỗ giữ **cùng độ
rộng**, vì chính độ rộng mới là điều quan trọng):

```
nhãn  y=283.3:  健康保険料 69.4 · 厚生年金保険 138.1 · 厚生年金基金 211.8
                雇用保険料 291.9 · 所得税 375.6 · 住民税 447.9
số    y=309.5:  aa,aaa 95.2 · bb,bbb 168.9 · ccc 335.7 · d,ddd 395.5 · e,eee 469.2
```

Số **canh phải**, nhãn **canh trái** → độ lệch thay đổi theo độ rộng số: `ccc` (ba
chữ số) lệch **43,8pt**, còn `aa,aaa` (sáu ký tự) chỉ lệch **25,8pt**.

**Luật:** một số thuộc về **nhãn gần nhất về phía trái nó**, trong hàng nhãn gần
nhất bên dưới **có nhãn hợp lệ**. Nhãn bỏ trống tự nhiên không nhận gì
(`厚生年金基金` ở ví dụ trên).

Phải duyệt **nhiều** hàng nhãn bên dưới, vì layout từ 2026/06 chèn một hàng mục
con `一般保険料`/`子育支援金` giữa hàng số và hàng nhãn tổng.

**Loại nhãn khối trước khi ghép.** Các chữ dựng dọc ở lề trái (`支 給 控 除 勤 怠
他 氏 名 所 属 様`) nằm ở `x≈42`, tức cách số cột đầu (x=95.2) đúng **53,2pt** —
trong ngưỡng — nên chúng **giành mất số của `健康保険料`** rồi vòng lặp dừng. Đây là
lỗi nằm sẵn nhưng bị một lỗi khác che, chỉ lộ ra khi sửa lỗi kia.

Tham số đã chạy đúng 60/60: `YROW=3.0` · `YMAX=64.0` · `XMAX=72.0` · `XSLACK=6.0`.

## Đẳng thức tự kiểm

```
tổng 8 mục khối 控除  =  控除合計額
総支給金額 − 控除合計額 − 過不足税額  =  差引支給額  =  銀行１振込額
```

`過不足税額` (quyết toán năm, chỉ có ở phiếu tháng 12) **không nằm trong
`控除合計額`** nhưng **vẫn đổi tiền thật**. Đo trên cả bốn phiếu tháng 12 của bộ
dữ liệu, khớp tới từng đơn vị. Ba hình dạng, minh hoạ trên phiếu mẫu:

| Ca | gộp − trừ − 過不足 | = ròng |
|---|---|---|
| nộp thêm cuối năm | 400,000 − 78,000 − 25,000 | 297,000 |
| được hoàn (nhỏ hơn tổng trừ) | 400,000 − 78,000 + 20,000 | 342,000 |
| được hoàn (**lớn hơn** tổng trừ) | 400,000 − 78,000 + 90,000 | **412,000** |

Ca thứ ba cho **ròng > gộp** — xem mục `過不足` lớn hơn tổng khấu trừ bên dưới.

## Bộ nhãn

**Khối 控除 — cộng vào `控除合計額` (8 nhãn):**
`健康保険料` `厚生年金保険` `厚生年金基金` `雇用保険料` `所得税` `住民税`
`社内販売精算` `その他`

**Mục con của `健康保険料`, KHÔNG cộng** (đã nằm trong `健康保険料`; layout từ
2026/06): `一般保険料` `子育支援金`. Trên phiếu mẫu:
`一般保険料 19.500 + 子育支援金 500 = 健康保険料 20.000`.

**Ngoài `控除合計額` nhưng ghi thành dòng riêng:** `過不足税額`.

**Sổ theo dõi phần ĐƯỢC GIẢM, KHÔNG phải khoản bị trừ:** `月次減税額`
`定額減税額(所得税)` `定額減税未済額` (đợt 定額減税 2024). Coi chúng là khoản trừ làm
thuế của tháng đó phồng lên **đúng bằng tổng ba nhãn ấy** — mà tháng đó `所得税`
thật bằng **0** vì đã được giảm hết.

**Phía 支給 — Cách B không dùng, nhưng phải biết tên để không báo "nhãn lạ":**
`基本給` `残業手当` `通勤手当` `立替経費精算` `立替経費` `不就労控除` `基本賞与`
`DB掛金`

## Map sang danh mục

| Nhãn phiếu | Danh mục app | `need_level` | `cost_type` |
|---|---|---|---|
| `所得税`, `過不足税額` | `Thuế thu nhập (所得税)` | essential | **variable** |
| `雇用保険料` | `Bảo hiểm việc làm (雇用保険)` | essential | **variable** |
| `住民税` | `Thuế cư trú (住民税)` | essential | fixed |
| `健康保険料` | `Bảo hiểm y tế (健康保険)` | essential | fixed |
| `厚生年金保険`, `厚生年金基金` | `Hưu trí (年金)` | essential | fixed |
| `社内販売精算` | **`🛒 Đi chợ`** (sẵn có, **giữ nguyên** `essential`+`variable`) | giữ | giữ |
| `その他` | **từ chối file** | | |

Tên danh mục thuế phải **đúng từng ký tự** — [`taxCategoryIds`](../../../src/features/tax/categories.ts)
nhận nhóm theo tên.

**Cần tạo 6 danh mục:** cha `Thuế & An sinh` (icon 🏛️) + 5 con ở bảng trên. Không
cần `Bảo hiểm điều dưỡng (介護保険)` — 介護保険 chỉ trừ từ 40 tuổi, không phiếu nào
trong bộ có nó. (`taxCategoryIds` nhận cả danh mục lẻ trùng tên chuẩn, nhưng tạo
đủ cây cha–con để màn Danh mục đọc được.)

Script **không** tự tạo danh mục lúc nhập — có cờ riêng `--tao-danh-muc` cho bước
cài đặt một lần, tách khỏi đường ghi giao dịch.

**`社内販売精算` không phải thuế.** Nó nằm trong `控除合計額` — chứng minh bằng số
học: 5 phiếu có nhãn này, mỗi phiếu lệch **đúng bằng giá trị nhãn đó**, bỏ nó ra là
tổng khớp. Nhưng nó là mua hàng nội bộ công ty. Cho vào nhóm `Thuế & An sinh` là
thổi phồng tử số của chỉ số — 3 trong 5 phiếu ấy nằm trong cửa sổ 12 tháng.

**Và nó KHÔNG được là con của `Thuế & An sinh`**, vì `taxCategoryIds` gom *mọi* con
của danh mục cha đó. `Đi chợ` (`essential` + `variable`, con của `Ăn uống`) là chỗ
ít tác dụng phụ nhất: không đội chi cố định nên không đụng số tháng dự phòng.

### Vì sao `cost_type` phải chia hai, không gán đồng loạt `fixed`

`fund = tài sản lỏng ÷ chi cố định` ([`HealthView.tsx:135`](../../../src/features/health/HealthView.tsx)).

| | ~tỷ trọng trong tổng khấu trừ | Mất việc thì sao |
|---|---|---|
| `厚生年金保険` | ~46% | vẫn nợ (chuyển 国民年金) |
| `健康保険料` | ~25% | vẫn nợ (chuyển 国民健康保険) |
| `住民税` | ~20% | vẫn nợ (tính trên thu nhập năm trước) |
| `所得税` | ~7% | **hết** |
| `雇用保険料` | ~2% | **hết** |

Tức **~90% khoản khấu trừ vẫn phải trả khi mất thu nhập**; chỉ ~10% là hết theo
việc làm.

**Hệ quả đo sau khi import thật** (cửa sổ 12 tháng, đã phân trang đủ 1.070 giao
dịch): chi cố định **tăng 2,18 lần**, và quỹ dự phòng rơi từ khoảng **5,0 tháng**
xuống **2,3 tháng** — đổi hạng từ vùng an toàn sang **Rủi ro**. Điểm sức khoẻ tổng
xuống 63/100.

**Đó là sửa sai, không phải làm sai**: trước import, sổ bỏ qua toàn bộ phần nghĩa
vụ vẫn còn khi mất việc, nên con số 5 tháng là lạc quan giả.

Nhưng phải nói cho đủ: con số mới hơi **bảo thủ**. Người mất việc chuyển sang
国民健康保険 / 国民年金 thường phải trả **ít hơn** bản 厚生, và 年金 còn xin
**免除** được. Sự thật nằm giữa hai con số, gần đầu bảo thủ hơn. Muốn bớt bảo thủ
thì chuyển `厚生年金保険` sang `variable` — nhưng đừng đổi vì con số trông xấu, chỉ
đổi nếu tin rằng khoản đó thật sự biến mất theo việc làm.

Nút "Tạo bộ danh mục Thuế & An sinh" cũ (đã xoá khỏi `CategoriesPage.tsx` ngày
2026-08-14) gán **đồng loạt `essential` + `fixed`** — nếu phục hồi nút thì phải sửa
chỗ này.

## Phép neo

Mỗi phiếu neo vào một khoản thu **đã có** trong sổ:

```
type = 'income'  AND  account = Yucho Bank  AND  amount = 差引支給額
AND  occurred_on ∈ [đầu kỳ − 20 ngày, đầu kỳ + 75 ngày]
```

Phải khớp **đúng một** dòng. Đo trên toàn bộ lịch sử Yucho (66 khoản thu, sớm nhất
2021-12-09): **59/59 phiếu khớp duy nhất, 0 phiếu mồ côi**, 7 khoản thu còn lại đều
giải thích được (2 khoản trước kỳ PDF sớm nhất, 1 khoản lẻ quá nhỏ để là phiếu
lương, 4 khoản thuộc khoảng trống 2025/04–07). `66 = 59 + 7`.

Chủ sổ xác nhận **mọi khoản lương từ trước tới nay đều vào Yucho Bank**, nên ràng
buộc tài khoản là chốt chặn thật, không phải trang trí.

**Ngày lấy từ dòng neo, không lấy từ kỳ.** Chính điều này cứu ca `202209S`: tên
file ghi `202209` nhưng nội dung PDF ghi `2022年7月分賞与`, và khoản thật nằm ở
**2022-07-08** — cùng ngày với lương tháng 7, nhưng là hai dòng riêng, hai số khác
nhau.

**Kỳ đọc từ nội dung PDF** (`(\d{4})\s*年\s*(\d{1,2})\s*月分`), dự phòng tên file,
lệch nhau thì báo. Kiểm cả bộ: 1 file lệch (`202209S`), 2 file không đọc được kỳ từ
nội dung (`202308S`, `202402S` — hai file này tên lại đúng). **Không nguồn nào đủ
một mình.**

## Dấu ghi chú

```
給与 <YYYY/MM của ngày neo><K|S> · <tên khoản>
```

Ví dụ: `給与 2026/08K · 所得税`.

Hậu tố `K`/`S` là **bắt buộc**: 8 kỳ có hai phiếu (202209, 202302, 202308, 202402,
202408, 202502, 202508, 202602). Kiểm hai cặp neo cùng ngày — `202302K`/`202302S`
cùng 2023-02-10, `202207K`/`202209S` cùng 2022-07-08 — hậu tố phân biệt được cả hai.

Không có cột `import_batch`/`source` trong `transactions`, nên dấu trong `note` là
tay cầm duy nhất để gỡ lô nhập. Vì vậy nó là phần bắt buộc của thiết kế.

## Mỗi phiếu ghi gì

Trên phiếu mẫu — cùng ngày, cùng tài khoản với dòng neo:

| Dòng | Số | |
|---|---|---|
| *(giữ nguyên)* | 322,000 | dòng sao kê, không chạm |
| Thu thêm | 78,000 | `給与 <kỳ> · phần bị giữ lại` |
| Chi × 5 | 78,000 | vào 5 danh mục thuế/an sinh |

`過不足税額` **âm** → chi mang `is_refund: true`, `amount` **dương** (DB có
`check (amount > 0)` và `transactions_refund_check`; `expenseSign` trả `−1`, view
số dư **cộng** khoản hoàn — xem [`0026_reporting_pack.sql:55`](../../../supabase/migrations/0026_reporting_pack.sql)).
`過不足税額` **dương** → chi thường.

Kiểm bất biến ở ca được hoàn 20.000: thu `+58.000`, chi `−78.000`, hoàn `+20.000`
→ **0**, cả ở số dư lẫn thống kê.

**Bất biến:** `thu thêm = tổng chi thêm = 総支給金額 − 差引支給額`, **và phải > 0**.

### Khi `過不足税額` hoàn nhiều hơn tổng khấu trừ — Cách B không biểu diễn được

Đúng **một** phiếu trong bộ rơi vào ca này. Trên phiếu mẫu: hoàn `90.000` lớn hơn
tổng khấu trừ `78.000`, nên `ròng 412.000 > gộp 400.000` và "phần bị giữ lại" =
`78.000 − 90.000` = **−12.000**. Dòng thu phải âm, mà DB có `check (amount > 0)`.

Bất biến số học **báo đúng** cho ca này — cả ba số đều bằng −12.000 — nên bốn vòng
kiểm trước đó không thấy. **Chỉ chốt DẤU mới bắt được.** Về mặt toán, không cách
chỉ-thêm nào trung hoà được số dư ở đây (cần income âm), nên **từ chối, xử tay**.

Bài học: một bất biến đúng vẫn có thể vô nghĩa nếu không kiểm dấu.

Tổng thực tế (đã chạy thử trên dữ liệu thật, 60 file → 59 phiếu phân biệt):
**58 phiếu → 58 dòng thu + 286 dòng chi = 344 dòng**, 1 phiếu bị từ chối. Tổng thay
đổi số dư: **0 ¥**.

### Chốt 0 — gom file trùng, chạy TRƯỚC phép neo

Thư mục thật có cả `(0101)202608K.pdf` lẫn `(0101)202608K (1).pdf` — **trùng byte**
(cùng SHA256). Không có chốt này thì file thứ hai bị **chốt neo** từ chối với thông
điệp *"không thấy khoản thu Yucho = &lt;số ròng&gt;"*, vì file đầu đã chiếm khoản
neo. Thông điệp đó dẫn người đọc đi sửa **sai chỗ**: vấn đề là file trùng, không
phải thiếu khoản thu.

Gom theo `(empno, period, kind)`. Trùng y hệt nội dung tài chính → giữ một bản, báo
đã gộp. Khác nội dung → **từ chối cả nhóm**: script không được đoán file nào là bản
thật. Lương và thưởng cùng kỳ không bị coi là trùng (khác `kind`).

## Sáu chốt chặn trước khi ghi

1. Đủ danh mục thuế theo **đúng tên**; thiếu → từ chối và liệt kê
2. Mọi phiếu qua cả hai đẳng thức tự kiểm
3. Mọi phiếu neo vào **đúng một** khoản thu Yucho; 0 hoặc ≥2 → từ chối
4. Chưa có dòng nào mang dấu của phiếu đó (chống nhập trùng)
5. `tổng thu thêm − tổng chi thêm = 0` từng phiếu, **và thu thêm > 0**
6. Cờ `--ghi` + xác nhận `y/N` mặc định KHÔNG

**Nhãn không có trong bộ nhãn → từ chối cả file và gọi tên nhãn đó ra.** Không bao
giờ bỏ im lặng.

## Chế độ gỡ

`--go` xoá mọi dòng mang tiền tố dấu (`給与 YYYY/MMK|S ·`). Vì chỉ-thêm nên gỡ là
xoá, không phải nhị hoá ngược.

## Sau khi import: đặt lại ba mốc trục

**Bước bắt buộc, không phải tuỳ chọn.** Đo trên một tháng hoàn tất của sổ thật —
chỉ ghi tỷ lệ, vì con số tuyệt đối là thu nhập thật:

| Trục | Trước | Sau | Mốc |
|---|---|---|---|
| Thiết yếu | 43% | **55%** | trần 50% → **vượt** |
| Linh hoạt | 11% | 9% | trần 30% |
| Tiết kiệm | 45% | **36%** | sàn 20% |

**Số tiền tiết kiệm không đổi một yên** — chỉ tỷ lệ tụt, vì mẫu số chuyển từ ròng
sang gộp. Trần thiết yếu bị vượt dù chủ sổ không tiêu thêm đồng nào.

Quy tắc 50/30/20 gốc tính trên thu nhập **sau thuế**. Với mức thuế ~20% của sổ này,
tương đương trên gộp là khoảng **60/25/15**. Sau import phải đặt lại
`target_essential_bps` / `target_flexible_bps` / `target_savings_bps` trong
`profiles`, nếu không thẻ Cơ cấu chi báo đỏ vĩnh viễn mà không hành động nào sửa được.

## Cửa sổ chỉ số — kỳ vọng phải đúng

`WINDOW_MONTHS = 12`, **không gồm tháng đang chạy dở**
([`HealthView.tsx:61`](../../../src/features/health/HealthView.tsx)).
`month_start_day = 1` (đã kiểm profile) → cửa sổ hiện tại là **2025/08 → 2026/07**.

- Chỉ **14** trong 59 phiếu tác động lên chỉ số Thuế & An sinh. 45 phiếu còn lại cải
  thiện báo cáo từng tháng và Cơ cấu chi — giá trị thật, nhưng khác giá trị đó.
- **Tháng 8/2026 bị loại** vì đang chạy dở. Nhập xong phiếu tháng 8, thẻ vẫn hiện
  `—` cho tới sang tháng 9.
- Tỷ lệ sẽ đọc ra: **20,4%** (vùng `good`, ngưỡng cảnh báo 25%).

Cửa sổ hiện **kín hoàn toàn**: đủ cả 14 lần trả lương (12 lương tháng + 2 thưởng),
sau khi bổ sung `2025/08K`, `2025/08S`, `2025/09K`, `2025/10K`. Trước khi có bốn
phiếu ấy, tỷ lệ đọc ra chỉ **15,7%** — thấp hơn thật gần 5 điểm, vì net của chúng
vào mẫu số mà khấu trừ không vào tử số.

## Khoảng trống đã biết

**6 khoản lương trong sổ không có PDF, tất cả NGOÀI cửa sổ 12 tháng:**
`2021-12`, `2022-01` (trước kỳ PDF sớm nhất), và `2025-04` → `2025-07`.

Chúng chỉ làm báo cáo *các tháng đó* thiếu phần thuế, **không** ảnh hưởng chỉ số
Thuế & An sinh. Có thêm PDF thì chạy lại script — chốt số 4 chống nhập trùng nên
thêm file sau không phá gì.

Ngoài ra một khoản lẻ vài nghìn yên (`振込（株）コメ`, 2022-09-20) quá nhỏ để là
phiếu lương — chuyển khoản lẻ từ công ty, không có phiếu và không cần.

Đối chiếu khép kín trên toàn bộ lịch sử Yucho: **66 khoản thu = 59 phiếu neo được +
6 khoản thiếu PDF + 1 khoản lẻ**.

## Kiểm thử

**Tầng 2 (vitest, khuôn [`roleSave.test.ts`](../../../src/features/transactions/roleSave.test.ts)):**
bảng map nhãn→danh mục · phép neo (0 / 1 / ≥2 ứng viên) · bất biến bằng-không và
chốt dấu · dấu ghi chú của cặp K/S cùng ngày · `過不足税額` cả hai dấu · gom file
trùng (trùng y hệt / khác nội dung) · từ chối khi gặp nhãn lạ.

**Tầng 1:** chế độ tự kiểm khẳng định 60/60 qua cả hai đẳng thức.

## Bảo mật

`phieu-luong.json` chứa 4,5 năm chi tiết lương + tên + số hiệu nhân viên. **Vào
`.gitignore`, không commit.**

Spec này dùng **số minh hoạ**, không phải số thật — repo là công khai. Khi sửa spec,
giữ nguyên nguyên tắc đó: nếu một lập luận cần con số, dựng số minh hoạ giữ đúng
quan hệ thay vì dán số thật vào.

`boc.py` cần `pypdf` + `cryptography` — ghi vào đầu script, không thêm vào
`package.json` (không phải phụ thuộc của app).

## Sáu lỗi đã mắc khi thiết kế — để người sau không lặp

1. **Map mọi thứ trong `控除合計額` vào nhóm thuế.** Sai với `社内販売精算`. Chốt
   "tổng mục lẻ = `控除合計額`" *không* bắt được lỗi này — nó chỉ kiểm số học, không
   kiểm ngữ nghĩa.
2. **Coi `過不足税額` và bộ ba `定額減税` là khoản trừ.** `過不足税額` ngoài tổng
   nhưng đổi tiền thật; `定額減税` là sổ theo dõi. Lẫn hai thứ này làm thuế một
   tháng phồng lên bằng cả tổng bộ ba.
3. **Ghép nhãn↔số theo "gần tâm nhất".** Sai vì số canh phải, nhãn canh trái. Và
   khi sửa nó thì lỗi "chữ khối giành số" nằm sẵn mới lộ — hai lỗi che nhau, sửa
   một cái làm cả bộ hỏng cùng lúc.
4. **Kiểm bất biến mà không kiểm dấu.** `thu == chi == gộp − ròng` báo đúng cho ca
   ròng > gộp, vì cả ba đều âm bằng nhau. Lỗi này sống qua bốn vòng soát.

5. **Bỏ trống `is_refund` ở dòng thu.** PostgREST insert một MẢNG thì **hợp nhất
   tập khoá** của mọi phần tử, nên khoá thiếu ở một dòng thành `NULL` chứ không lấy
   `DEFAULT`. Dòng chi có `is_refund`, dòng thu không → gửi `NULL` → vi phạm
   `NOT NULL` → **cả lô bị từ chối**. Chỉ lộ ra khi ghi thật; mọi test dựng-dòng
   trước đó đều xanh vì chúng không đi qua PostgREST.
6. **Không phân trang khi kiểm chứng.** PostgREST cắt ở **1000 hàng** và không báo
   gì. Cửa sổ 12 tháng có 1.070 giao dịch, nên phép kiểm đầu tiên cho **21,4%** —
   một con số *trông hợp lý* — trong khi số đúng là **20,4%**. Phát hiện được nhờ
   mẫu số lệch đúng bằng một kỳ lương. Mọi phép đo trên bảng `transactions` phải
   đếm trước rồi đọc theo trang.

Bài học chung: **chốt số học không thay được chốt ngữ nghĩa**, một bộ kiểm
"44/55 đúng" có thể đang che một lỗi làm sai cả bộ, **một bất biến đúng vẫn vô
nghĩa nếu không kiểm dấu**, và **một con số trông hợp lý vẫn có thể là kết quả của
truy vấn bị cắt lặng lẽ**.

## Ngoài phạm vi

- Phía `支給` (`基本給`, `残業手当`, `通勤手当`, `立替経費精算`, `DB掛金`): Cách B
  không chạm. `通勤手当` do đó tự nằm trong thu nhập, tỷ lệ là bản "gộp có trợ cấp
  đi lại".
- Một phiếu 2024 có `立替経費精算` lớn gấp nhiều lần lương tháng — hoàn ứng chi phí,
  không phải thu nhập, nhưng đã nằm trong dòng ngân hàng từ trước. `立替経費精算` có
  ở 26/59 phiếu. Cách B không làm tệ hơn, cũng không sửa.
- `DB掛金` (âm) đã trừ sẵn trong `総支給金額` → không cần làm gì; nghĩa là khoản hưu
  trí đó vô hình trong sổ.
- Giao diện nhập file. Script chạy tay là đủ cho việc mỗi tháng một file.
