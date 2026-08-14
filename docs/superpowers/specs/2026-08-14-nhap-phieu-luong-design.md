# Nhập phiếu lương 給与明細 (PDF) để chạy chỉ số Thuế & An sinh

Ngày: 2026-08-14

## Vấn đề

Chỉ số "Thuế & an sinh trên lương gộp" ([`HealthView.tsx:581`](../../../src/features/health/HealthView.tsx))
tính `taxAndSocial ÷ annualIncome`, trong đó tử số là chi thuộc nhóm danh mục
`Thuế & An sinh`. Sổ hiện chỉ ghi **lương ròng** — mỗi tháng đúng một dòng thu
ngân hàng — nên tử số bằng 0 và thẻ luôn hiện `—`.

Chủ sổ có **55 phiếu lương PDF** trải 2022/02 → 2026/08. Nhập tay 55 phiếu ×
6 dòng là việc không ai làm hai lần, nên cần script.

## Bộ dữ liệu thật (đã đo, không phải phỏng đoán)

55 file trong một thư mục, tên `(<社員番号>)<YYYYMM><K|S>.pdf`:

| 社員番号 | Kỳ |
|---|---|
| `0004` | 2022/02 → 2024/04 |
| `0003` | 2024/05 → 2025/03, 2025/11 → 2026/01 |
| `0011` | 2026/02 → 2026/07 |
| `0101` | 2026/08 |

Không kỳ nào bị hai số hiệu cùng lúc → cùng một người, đổi số hiệu qua các đợt.

`K` = 給与 (lương tháng, 48 file) · `S` = 賞与 (thưởng, 7 file: 202209S, 202302S,
202308S, 202402S, 202408S, 202502S, 202602S).

PDF **mã hoá AES với mật khẩu rỗng**, font Type0/CID có `ToUnicode`.

## Quyết định đã chốt

**Không chạm dòng sao kê.** Không sửa dòng thu ngân hàng thành số gộp. Thay vào
đó thêm một dòng thu "phần bị giữ lại" + các dòng chi khấu trừ. Lý do: codebase
này đặt việc khớp sao kê lên đầu — xem ghi chú ở
[`roleSave.ts:258`](../../../src/features/transactions/roleSave.ts) ("thẻ phải trừ
đủ 10.000 (khớp sao kê)"). Sửa một dòng nhập từ sao kê thành số chưa từng có trên
sao kê là đi ngược nguyên tắc đó. Đổi lại: mỗi kỳ lương có hai dòng thu, và gỡ lô
nhập chỉ là xoá các dòng mang dấu.

**Hai tầng, hai ngôn ngữ.** `pypdf` + `cryptography` đã chạy thật trên cả 55 file;
`unpdf`/`pdfjs` chưa được chứng minh trên bộ này. Đổi sang JS nghĩa là kiểm lại 55
file bằng thư viện chưa đo, đổi lấy con số không.

**File JSON ở giữa là chỗ soát bằng mắt** trước khi 328 dòng chạm vào sổ, và cho
phép bóc lại rồi so diff mà không đụng DB.

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

Đo trên `(0004)202202K.pdf`:

```
nhãn  y=283.3:  健康保険料 69.4 · 厚生年金保険 138.1 · 厚生年金基金 211.8
                雇用保険料 291.9 · 所得税 375.6 · 住民税 447.9
số    y=309.5:  13,720 95.2 · 25,620 168.9 · 874 335.7 · 3,080 395.5 · 5,500 469.2
```

Số **canh phải**, nhãn **canh trái** → độ lệch thay đổi theo độ rộng số (`874` ba
chữ số lệch 43,8pt; `13,720` lệch 25,8pt).

**Luật:** một số thuộc về **nhãn gần nhất về phía trái nó**, trong hàng nhãn gần
nhất bên dưới **có nhãn hợp lệ**. Nhãn bỏ trống tự nhiên không nhận gì
(`厚生年金基金` ở ví dụ trên).

Phải duyệt **nhiều** hàng nhãn bên dưới, vì layout từ 2026/06 chèn một hàng mục
con `一般保険料`/`子育支援金` giữa hàng số và hàng nhãn tổng.

**Loại nhãn khối trước khi ghép.** Các chữ dựng dọc ở lề trái (`支 給 控 除 勤 怠
他 氏 名 所 属 様`) nằm ở `x≈42`, tức cách `13,720` (x=95.2) đúng 53,2pt — trong
ngưỡng — nên chúng **giành mất số của `健康保険料`** rồi vòng lặp dừng. Đây là lỗi
nằm sẵn nhưng bị một lỗi khác che, chỉ lộ ra khi sửa lỗi kia.

Tham số đã chạy đúng 55/55: `YROW=3.0` · `YMAX=64.0` · `XMAX=72.0` · `XSLACK=6.0`.

## Đẳng thức tự kiểm

```
tổng 8 mục khối 控除  =  控除合計額
総支給金額 − 控除合計額 − 過不足税額  =  差引支給額  =  銀行１振込額
```

`過不足税額` (quyết toán năm, chỉ có ở phiếu tháng 12) **không nằm trong
`控除合計額`** nhưng **vẫn đổi tiền thật**. Đo trên cả bốn phiếu tháng 12, khớp
từng yên:

| File | gộp − trừ − 過不足 | = ròng |
|---|---|---|
| 202212K | 303,345 − 56,991 − 28,081 | 218,273 |
| 202312K | 485,610 − 73,476 + 88,544 | 500,678 |
| 202412K | 458,750 − 85,615 + 19,929 | 393,064 |
| 202512K | 431,296 − 95,125 + 17,646 | 353,817 |

## Bộ nhãn

**Khối 控除 — cộng vào `控除合計額` (8 nhãn):**
`健康保険料` `厚生年金保険` `厚生年金基金` `雇用保険料` `所得税` `住民税`
`社内販売精算` `その他`

**Mục con của `健康保険料`, KHÔNG cộng** (đã nằm trong `健康保険料`; layout từ
2026/06): `一般保険料` `子育支援金`. Kiểm: `23.148 + 540 = 23.688`.

**Ngoài `控除合計額` nhưng ghi thành dòng riêng:** `過不足税額`.

**Sổ theo dõi phần ĐƯỢC GIẢM, KHÔNG phải khoản bị trừ:** `月次減税額`
`定額減税額(所得税)` `定額減税未済額` (đợt 定額減税 2024). Coi chúng là khoản trừ
làm `202406K` phồng **đúng 60.000 ¥** trong một tháng — tháng đó `所得税` thật
bằng **0** vì đã được giảm hết.

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
trong bộ 55 có nó. (`taxCategoryIds` nhận cả danh mục lẻ trùng tên chuẩn, nhưng tạo
đủ cây cha–con để màn Danh mục đọc được.)

Script **không** tự tạo danh mục lúc nhập — có cờ riêng `--tao-danh-muc` cho bước
cài đặt một lần, tách khỏi đường ghi giao dịch.

**`社内販売精算` không phải thuế.** Nó nằm trong `控除合計額` (đã chứng minh bằng số
học: 5 file, đúng bằng phần thiếu 337 · 2.263 · 3.689 · 8.399 · 11.956) nhưng là
mua hàng nội bộ công ty. Cho vào nhóm `Thuế & An sinh` là thổi phồng tử số của chỉ
số — 3 trong 5 file đó nằm trong cửa sổ 12 tháng.

**Và nó KHÔNG được là con của `Thuế & An sinh`**, vì `taxCategoryIds` gom *mọi* con
của danh mục cha đó. `Đi chợ` (`essential` + `variable`, con của `Ăn uống`) là chỗ
ít tác dụng phụ nhất: không đội chi cố định nên không đụng số tháng dự phòng.

### Vì sao `cost_type` phải chia hai, không gán đồng loạt `fixed`

`fund = tài sản lỏng ÷ chi cố định` ([`HealthView.tsx:135`](../../../src/features/health/HealthView.tsx)).
Trung bình tháng trên 10 phiếu trong cửa sổ:

| | ¥/tháng | Mất việc thì sao |
|---|---|---|
| `厚生年金保険` | 37,210 | vẫn nợ (chuyển 国民年金) |
| `健康保険料` | 20,238 | vẫn nợ (chuyển 国民健康保険) |
| `住民税` | 16,058 | vẫn nợ (tính trên thu nhập năm trước) |
| `所得税` | 6,200 | **hết** |
| `雇用保険料` | 1,975 | **hết** |

Chi cố định hiện tại **85.260 ¥/tháng**. Gán đồng loạt `fixed` → 165.472 (+94%).
Chia hai → 158.766 (+86%). Cả hai làm số tháng dự phòng giảm gần một nửa, **và đó
là sửa sai**: sổ hiện đang giấu 73.506 ¥/tháng nghĩa vụ thật, nên con số dự phòng
hôm nay lạc quan quá.

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
2021-12-09): **55/55 phiếu khớp duy nhất, 0 phiếu mồ côi**, 11 khoản thu còn lại
đều giải thích được (2 khoản trước kỳ PDF sớm nhất, 1 khoản 1.400 ¥ quá nhỏ, 8
khoản thuộc khoảng trống 2025/04–10). `66 = 55 + 11`.

Chủ sổ xác nhận **mọi khoản lương từ trước tới nay đều vào Yucho Bank**, nên ràng
buộc tài khoản là chốt chặn thật, không phải trang trí.

**Ngày lấy từ dòng neo, không lấy từ kỳ.** Chính điều này cứu ca `202209S`: tên
file ghi `202209` nhưng nội dung PDF ghi `2022年7月分賞与`, và khoản thật (335.781)
nằm ở **2022-07-08**, cùng ngày với lương tháng 7 (279.427) nhưng là hai dòng riêng.

**Kỳ đọc từ nội dung PDF** (`(\d{4})\s*年\s*(\d{1,2})\s*月分`), dự phòng tên file,
lệch nhau thì báo. Kiểm cả 55: 1 file lệch (`202209S`), 2 file không đọc được kỳ từ
nội dung (`202308S`, `202402S` — hai file này tên lại đúng). **Không nguồn nào đủ
một mình.**

## Dấu ghi chú

```
給与 <YYYY/MM của ngày neo><K|S> · <tên khoản>
```

Ví dụ: `給与 2026/08K · 所得税`.

Hậu tố `K`/`S` là **bắt buộc**: 7 kỳ có hai phiếu (202209, 202302, 202308, 202402,
202408, 202502, 202602). Kiểm hai cặp neo cùng ngày — `202302K`/`202302S` cùng
2023-02-10, `202207K`/`202209S` cùng 2022-07-08 — hậu tố phân biệt được cả hai.

Không có cột `import_batch`/`source` trong `transactions`, nên dấu trong `note` là
tay cầm duy nhất để gỡ lô nhập. Vì vậy nó là phần bắt buộc của thiết kế.

## Mỗi phiếu ghi gì

Ví dụ `202608K` — cùng ngày, cùng tài khoản với dòng neo:

| Dòng | Số | |
|---|---|---|
| *(giữ nguyên)* | 388,691 | dòng sao kê, không chạm |
| Thu thêm | 92,328 | `給与 2026/08K · phần bị giữ lại` |
| Chi × 5 | 92,328 | vào 5 danh mục thuế/an sinh |

`過不足税額` **âm** → chi mang `is_refund: true`, `amount` **dương** (DB có
`check (amount > 0)` và `transactions_refund_check`; `expenseSign` trả `−1`, view
số dư **cộng** khoản hoàn — xem [`0026_reporting_pack.sql:55`](../../../supabase/migrations/0026_reporting_pack.sql)).
`過不足税額` **dương** → chi thường.

Kiểm bất biến trên `202412K`: thu `+65.686`, chi `−85.615`, hoàn `+19.929` → **0**,
cả ở số dư lẫn thống kê.

**Bất biến, đúng 55/55:** `thu thêm = tổng chi thêm = 総支給金額 − 差引支給額`.

Tổng: **55 dòng thu + 273 dòng chi = 328 dòng.**

## Sáu chốt chặn trước khi ghi

1. Đủ danh mục thuế theo **đúng tên**; thiếu → từ chối và liệt kê
2. Mọi phiếu qua cả hai đẳng thức tự kiểm
3. Mọi phiếu neo vào **đúng một** khoản thu Yucho; 0 hoặc ≥2 → từ chối
4. Chưa có dòng nào mang dấu của phiếu đó (chống nhập trùng)
5. `tổng thu thêm − tổng chi thêm = 0` từng phiếu
6. Cờ `--ghi` + xác nhận `y/N` mặc định KHÔNG

**Nhãn không có trong bộ nhãn → từ chối cả file và gọi tên nhãn đó ra.** Không bao
giờ bỏ im lặng.

## Chế độ gỡ

`--go` xoá mọi dòng mang tiền tố dấu (`給与 YYYY/MMK|S ·`). Vì chỉ-thêm nên gỡ là
xoá, không phải nhị hoá ngược.

## Sau khi import: đặt lại ba mốc trục

**Bước bắt buộc, không phải tuỳ chọn.** Tính thật cho tháng 7/2026:

| | Trước | Sau |
|---|---|---|
| Thu | 363,347 | 458,927 |
| Thiết yếu | 157,716 · **43%** | 253,296 · **55%** |
| Linh hoạt | 41,491 · 11% | 41,491 · 9% |
| Tiết kiệm | 164,140 · **45%** | 164,140 · **36%** |

**Số tiền tiết kiệm không đổi một yên** (164.140 cả hai bên) — chỉ tỷ lệ tụt, vì
mẫu số chuyển từ ròng sang gộp. Trần thiết yếu 50% bị vượt dù chủ sổ không tiêu
thêm đồng nào.

Quy tắc 50/30/20 gốc tính trên thu nhập **sau thuế**. Với mức thuế ~20% của sổ này,
tương đương trên gộp là khoảng **60/25/15**. Sau import phải đặt lại
`target_essential_bps` / `target_flexible_bps` / `target_savings_bps` trong
`profiles`, nếu không thẻ Cơ cấu chi báo đỏ vĩnh viễn mà không hành động nào sửa được.

## Cửa sổ chỉ số — kỳ vọng phải đúng

`WINDOW_MONTHS = 12`, **không gồm tháng đang chạy dở**
([`HealthView.tsx:61`](../../../src/features/health/HealthView.tsx)).
`month_start_day = 1` (đã kiểm profile) → cửa sổ hiện tại là **2025/08 → 2026/07**.

- Chỉ **10** trong 55 phiếu tác động lên chỉ số Thuế & An sinh. 45 phiếu còn lại cải
  thiện báo cáo từng tháng và Cơ cấu chi — giá trị thật, nhưng khác giá trị đó.
- **Tháng 8/2026 bị loại** vì đang chạy dở. Nhập xong phiếu tháng 8, thẻ vẫn hiện
  `—` cho tới sang tháng 9.
- Con số sẽ đọc ra: `962.538 / 6.113.177` = **15,7%**.

## Khoảng trống đã biết

**10 khoản lương trong sổ không có PDF**, 4 trong số đó nằm trong cửa sổ 12 tháng:

| Ngày | Số | |
|---|---|---|
| 2021-12-09 | 248,765 | trước kỳ PDF sớm nhất |
| 2022-01-07 | 687,586 | trước kỳ PDF sớm nhất |
| 2025-04-10 → 2025-07-10 | 4 khoản | ngoài cửa sổ |
| **2025-08-08** | **675,671** | **trong cửa sổ** |
| **2025-08-29** | **324,984** | **trong cửa sổ — 賞与** |
| **2025-09-10** | **317,631** | **trong cửa sổ** |
| **2025-10-10** | **286,330** | **trong cửa sổ** |

Net của chúng vào mẫu số mà khấu trừ không vào tử số → chỉ số đọc **thấp hơn thật
chừng 6 điểm** (15,7% thay vì ~22%). Có thêm 4 PDF đó thì chạy lại script; chốt số
4 chống nhập trùng nên thêm file sau không phá gì.

## Kiểm thử

**Tầng 2 (vitest, khuôn [`roleSave.test.ts`](../../../src/features/transactions/roleSave.test.ts)):**
bảng map nhãn→danh mục · phép neo (0 / 1 / ≥2 ứng viên) · bất biến bằng-không ·
dấu ghi chú của cặp K/S cùng ngày · `過不足税額` cả hai dấu · từ chối khi gặp nhãn lạ.

**Tầng 1:** chế độ tự kiểm khẳng định 55/55 qua cả hai đẳng thức.

## Bảo mật

`phieu-luong.json` chứa 4,5 năm chi tiết lương + tên + số hiệu nhân viên. **Vào
`.gitignore`, không commit.** Spec này chỉ giữ các con số cần cho lập luận thiết kế.

`boc.py` cần `pypdf` + `cryptography` — ghi vào đầu script, không thêm vào
`package.json` (không phải phụ thuộc của app).

## Ba lỗi đã mắc khi thiết kế — để người sau không lặp

1. **Map mọi thứ trong `控除合計額` vào nhóm thuế.** Sai với `社内販売精算`. Chốt
   "tổng mục lẻ = `控除合計額`" *không* bắt được lỗi này — nó chỉ kiểm số học, không
   kiểm ngữ nghĩa.
2. **Coi `過不足税額` và bộ ba `定額減税` là khoản trừ.** `過不足税額` ngoài tổng
   nhưng đổi tiền thật; `定額減税` là sổ theo dõi. Lẫn hai thứ này làm phồng thuế
   tới 60.000 ¥/tháng.
3. **Ghép nhãn↔số theo "gần tâm nhất".** Sai vì số canh phải, nhãn canh trái. Và
   khi sửa nó thì lỗi "chữ khối giành số" nằm sẵn mới lộ — hai lỗi che nhau, sửa
   một cái làm cả 55 file hỏng cùng lúc.

Bài học chung: **chốt số học không thay được chốt ngữ nghĩa**, và một bộ kiểm
"44/55 đúng" có thể đang che một lỗi làm sai cả 55.

## Ngoài phạm vi

- Phía `支給` (`基本給`, `残業手当`, `通勤手当`, `立替経費精算`, `DB掛金`): Cách B
  không chạm. `通勤手当` do đó tự nằm trong thu nhập, tỷ lệ là bản "gộp có trợ cấp
  đi lại".
- `202410K` có `立替経費精算` **909.751 ¥** — hoàn ứng chi phí, không phải thu nhập,
  nhưng đã nằm trong dòng ngân hàng từ trước. `立替経費精算` có ở 26/55 file. Cách B
  không làm tệ hơn, cũng không sửa.
- `DB掛金 −10.000/tháng` đã trừ sẵn trong `総支給金額` → không cần làm gì; nghĩa là
  khoản hưu trí đó vô hình trong sổ.
- Giao diện nhập file. Script chạy tay là đủ cho việc mỗi tháng một file.
