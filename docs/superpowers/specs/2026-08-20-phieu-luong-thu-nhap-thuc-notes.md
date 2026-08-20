# Phiếu lương: tách 通勤手当 / DB掛金 khỏi thu nhập — ghi chú khảo sát

Trạng thái: **ĐÃ LÀM XONG** (2026-08-20). Yêu cầu gốc: "chi phí đi lại không cộng vào lương".
Test: 2767 pass · `tsc --noEmit` sạch · `npm run build` xanh.

## Cơ chế import hiện tại (đọc từ code, đã kiểm)

- `bocPhieu` ([src/features/phieu-luong/boc.ts](../../../src/features/phieu-luong/boc.ts))
  chỉ giữ khối **控除** (`tru`) + `ngoaiTong` + 4 số tổng. Phía **支給** (`CAP`) chỉ có
  trong danh sách nhãn để **không báo "nhãn lạ"** — `Phieu` KHÔNG có trường nào chứa nó.
- `ghep()` VẪN đọc được số của chúng: `f['通勤手当'] = 77070`, `f['DB掛金'] = -10000`
  (regex `MONEY` nhận dấu trừ; `boc.test.ts:77` đã test số âm của DB掛金).
  → **Số tiền lấy chính xác được, không cần đoán.** Chỉ là hiện chưa lưu ra.
- Import **không tạo dòng thu lương**. Nó *neo* vào một dòng income Yucho đã có trong sổ,
  `amount = 差引支給額` (ròng). `dungDong` chỉ THÊM: các dòng chi cho từng mục 控除
  + 2 dòng thu triệt tiêu để số dư không đổi.
- Hệ quả: **"Thu" trong thống kê = số ròng vào Yucho**, tức đã bao gồm 通勤手当
  và đã bị trừ DB掛金. Thuế thì `exclude_from_stats=true` nên không nằm trong Chi.

## Số của phiếu mẫu (2026-06?) — đẳng thức đã khớp

```
基本給 369,000 + 残業手当 44,949 + DB掛金 (−10,000) + 通勤手当 77,070 = 481,019 = 総支給金額
481,019 − 92,328 (控除合計) = 388,691 = 差引支給額 = 銀行１振込額
```

Ý nghĩa thật (user xác nhận):
- `DB掛金 −10,000`: 退職金 (hagukumikikin.jp) — cty giữ 10.000 ¥/tháng → **tài sản của user**,
  không phải chi. Hiện đang lặng lẽ làm thu nhập giảm 10.000.
- `通勤手当 77,070`: chi phí đi lại **trả gộp 6 tháng** → ≈ 12.845 ¥/tháng. Là hoàn phí,
  không phải thu nhập. Hiện đang phồng Thu của đúng tháng đó lên 77.070.

## Chốt cần biết khi sửa

1. `kiemDong` có chốt `tổng chi === gross − net`. Thêm dòng cho 通勤手当/DB掛金 là **vỡ chốt
   này** — phải sửa cùng lúc, không được nới lỏng vô điều kiện.
2. Số dư phải KHÔNG ĐỔI ở mọi mốc ngày (bất biến hiện có: thu thêm = chi thêm, cân bằng
   *trong từng phạm vi thống kê* — `exclude_from_stats` riêng, không `exclude` riêng).
3. Không sửa dòng sao kê (dòng neo) — quy ước "chỉ THÊM".
4. 通勤手当 chỉ xuất hiện 6 tháng/lần → tháng thường nhãn này **vắng**, code phải chịu được vắng.
5. `docs/superpowers/specs/2026-08-15-import-phieu-luong-web-design.md` + `2026-08-14-nhap-phieu-luong-design.md`
   là spec gốc của tính năng.

## Hướng đang cân (chưa chọn)

Muốn Thu giảm 77.070 mà số dư không đổi, chỉ có thể **thêm cặp dòng**:

- **A. Chi trong thống kê + thu ngoài thống kê.** chi 77.070 (danh mục "Đi lại") +
  thu 77.070 `exclude_from_stats`. → Thu 388.691 giữ nguyên nhưng Chi +77.070, Thu−Chi = 311.621 ✓.
  Nhược: Chi của MỘT tháng phồng 77.070 dù là vé 6 tháng.
- **B. Như A nhưng rải 6 tháng.** 6 dòng chi 12.845 vào 6 tháng kế. Đúng nhất về nghĩa,
  nhưng phá bất biến "số dư không đổi ở mọi mốc ngày" (tháng đầu dư +64.225).
- **C. Chuyển khoản sang tài khoản "Vé tàu 6 tháng" (prepaid) rồi mỗi tháng rút ra.**
  Đúng kế toán nhất, nặng nhất, cần tài khoản mới.
- DB掛金: song song — chuyển 10.000 sang tài khoản tài sản "退職金" (type transfer) thì
  Thu tăng lại 10.000 và tài sản tăng 10.000. Hay để nguyên (thu nhập đã trừ sẵn)?

**Câu hỏi đang chờ user:** chọn A / B / C, và DB掛金 có muốn hiện thành tài sản không.

## Chốt cứng vừa tìm ra (2026-08-20)

`transactions_refund_check` (`supabase/migrations/0026_reporting_pack.sql:64`):
`check (not is_refund or type = 'expense')` → **thu nhập âm KHÔNG biểu diễn được.**
Hệ quả: mọi phương án "chỉ THÊM dòng" đều **không** kéo được 77.070 ra khỏi Thu, vì dòng
neo 388.691 nằm nguyên đó. Đã thử vét cạn 4 tổ hợp (chi/thu × exclude/refund) — tổ hợp nào
giữ số dư = 0 thì cũng giữ Thu = 388.691.

Số học của cách làm hiện tại (KHÔNG sửa gì): user mua vé 77.070 (chi thật, tháng M) +
lương 388.691 (tháng M+1) → Thu−Chi = 311.621 = **đúng tiền thật**. Sai duy nhất là
*phân bổ theo tháng*. Cách A cộng thêm chi 77.070 nữa → 234.551, **đếm hai lần**. Bỏ A.

## Thiết kế đề xuất (chờ duyệt)

### 通勤手当 — hoàn tiền, phải SỬA dòng neo
Import ghi:
1. Hạ `amount` dòng neo: 388.691 → 311.621 (= net − 通勤手当).
2. Thêm 1 dòng `expense, is_refund=true, amount=77.070`, danh mục đi lại, cùng ngày/tài khoản.

Số dư: −77.070 (hạ neo) + 77.070 (refund) = **0**. Thu = 311.621 ✓.
Chi đi lại = (khoản mua vé thật của user) − 77.070 → tự động đúng cho **mọi** ca user nêu:
mua trước rồi mới được trả (refund rơi vào tháng lương, khoản mua ở tháng trước — đúng như
mọi khoản hoàn tiền khác trong app), hay chỉ mua 3 tháng (hoàn nhiều hơn chi → Chi đi lại âm,
tức là user LỜI — và đó là sự thật).

**Đánh đổi phải nói rõ:** phá quy ước "chỉ THÊM, không sửa dòng sao kê" của importer.
Đây là lần đầu importer sửa một dòng có sẵn. Cần: chỉ hạ khi phiếu CÓ 通勤手当 > 0, ghi dấu
vào `note` dòng neo để gỡ được, và `kiemDong` phải đổi chốt `tổng chi === gross − net`.

### DB掛金 — thuần THÊM, không phá gì
Tiền này **chưa bao giờ vào Yucho** (đã trừ khỏi 総支給). Nên chỉ cần:
- 1 dòng `income, amount=10.000, account_id = <tài khoản tài sản '退職金'>`, `exclude_from_stats=false`.

Số dư Yucho không đổi; số dư 退職金 +10.000; Thu +10.000 (đúng: user CÓ kiếm số đó).
Kiểm: 388.691 + 10.000 = 398.691 = (413.949 − 92.328) + 77.070 ✓.
Cần user tạo (hoặc app tự tạo) tài khoản tài sản `退職金`.

### Việc phải làm trong code
- `boc.ts`: thêm trường `cap: Record<string, number>` vào `Phieu` (giữ 通勤手当, DB掛金…),
  lấy từ `ghep()` — số đã đọc đúng rồi, chỉ chưa lưu.
- `nhap.ts`: `dungDong` sinh thêm 2 dòng trên; `kiemDong` sửa chốt tổng; `DongKeHoach` mang
  thêm phần "sửa dòng neo" để tầng ghi DB biết phải `update`.
- `ImportPhieuLuongPage.tsx`: gọi update dòng neo; hiện rõ trong bảng xem trước.
- `queries.ts`: mutation cập nhật amount dòng neo (nếu chưa có) + invalidation cạnh nó.
- Tests: `boc.test.ts` (đọc 支給), `nhap.test.ts` (ba ca: có/không 通勤手当, mua 3 tháng).

## Đã duyệt (2026-08-20)
- Danh mục đi lại: **`Tàu xe`**.
- Tài khoản `退職金`: **chưa có** → app phải có nút tạo.

## Impact (grep — gitnexus MCP không lên được trong session này)
Gọn trong `features/phieu-luong/` + 3 script. `dungDong` 17 · `kiemDong` 9 · `bocPhieu` 20 ·
`dungKeHoach` 23 · `DongKeHoach` 6. Risk **MEDIUM**: không lan feature khác, nhưng `nhap.ts`
dùng chung với `scripts/nhap-phieu-luong.mjs` → đổi chữ ký là vỡ CLI.

## CHỨNG MINH: bắt buộc phải sửa dòng neo
Mọi dòng THÊM chỉ có thể làm Thu **tăng** (income luôn dương — `transactions_refund_check`).
Ta cần ΔThu = −77.070. ⇒ không tồn tại lời giải thuần-thêm. Đã vét 4 tổ hợp, xong.

## VẤN ĐỀ MỚI: gỡ lô không hoàn được dòng neo
`supabaseRepo.xoaPhieuLuong()` (`src/data/supabaseRepo.ts:1781`) xoá theo
`note like '給与 %'`. Dòng neo là dòng SAO KÊ, không mang tiền tố đó → gỡ lô xoá sạch dòng
import nhưng **để dòng neo vĩnh viễn ở 311.621**. Số dư khi đó SAI đúng 77.070.
`repo.updateTransaction(id, patch)` có sẵn (`src/data/repo.ts:530`) nên phần sửa thì làm được.

Hai cách bịt (chờ user chọn):
- **(a) Hoàn lại khi gỡ.** `xoaPhieuLuong` đọc trước các dòng `給与 % · 通勤手当`, cộng
  `amount` trả lại cho dòng income cùng `account_id`+`occurred_on`. Nhiều hơn 1 dòng income
  khớp → từ chối, không đoán (đúng nếp code sẵn có). 2 dòng thêm/phiếu.
- **(b) Không đổi số dòng neo, chỉ bật cờ.** Đặt `exclude_from_stats=true` cho dòng neo,
  rồi thêm 3 dòng: income 311.621 (trong tk) + expense 311.621 (ngoài tk) + cặp hoàn phí.
  Gỡ lô chỉ cần tắt lại một cờ boolean — không có số nào để mất. 3 dòng thêm/phiếu, sổ rậm hơn.

## QUYẾT ĐỊNH CUỐI (2026-08-20): cách (b)
User chọn (b) sau khi biết: (b) cho Thu = 311.621 y hệt (a), và (a) làm vỡ tính nhập-lại-được
(`timNeo` khớp `t.amount === phieu.net` = 388.691; hạ số rồi thì gỡ lô + nhập lại sẽ từ chối).

Bộ dòng cho phiếu có 通勤手当 = C, DB掛金 = D (âm), ròng = N:
1. dòng neo: **giữ `amount`**, chỉ đặt `exclude_from_stats = true`.
2. `+ income N − C`, trong thống kê — "lương thực nhận".
3. `+ expense C, is_refund=true`, trong thống kê, danh mục **`Tàu xe`** — "hoàn phí đi lại".
4. `+ expense N`, ngoài thống kê — "trung hoà dòng neo".
5. `+ income |D|` vào tài khoản **`退職金`**, trong thống kê — DB掛金 thành tài sản.

Số dư Yucho: `(N−C) + C − N = 0` ✓ · Thu: `−N + (N−C) = −C` ✓ · Chi `Tàu xe`: `−C` ✓
Số dư `退職金`: `+|D|` (đúng — tài sản tăng). Thu thêm `+|D|` (đúng — user có kiếm số đó).

C vắng (10/12 tháng) → bỏ bước 1–4, giữ nguyên hành vi cũ. D vắng → bỏ bước 5.


## Đã cài đặt (2026-08-20)

| file | việc |
|---|---|
| `src/features/phieu-luong/boc.ts` | `export const CAP`; `Phieu.cap: Record<string, number>`; `bocPhieu` lưu khối 支給 |
| `src/features/phieu-luong/nhap.ts` | `NHAN_DI_LAI`/`NHAN_HUU`/`DANH_MUC_TAU_XE`/`TEN_TK_HUU`/`TK_HUU_MOI`; `dungCap()`; `kiemCap()`; `dungDong`+`kiemDong`+`dungKeHoach` nhận thêm tham số; `dauTayNoiDung` gộp `cap` |
| `src/features/phieu-luong/ImportPhieuLuongPage.tsx` | tìm tk `退職金` + nút tạo; ghi dòng `cap`; `updateTransaction` bật cờ dòng neo (SAU CÙNG); xem trước nêu rõ việc sửa dòng neo; toast gỡ lô nói số dòng neo đã trả lại |
| `src/data/{repo,supabaseRepo,demoRepo}.ts` | `xoaPhieuLuong()` trả `{dong, neo}`, trả dòng neo về thống kê TRƯỚC khi xoá |
| `scripts/nhap-phieu-luong.mjs` | `chotKhoiCap()` — CLI TỪ CHỐI phiếu có khối 支給 (nó không ghi được `cap`, không bật được cờ) |
| `tests/phieuLuongKhoiCap.test.ts` | chốt soát mã nguồn cho hai chỗ trên |
| `boc.test.ts` · `nhap.test.ts` · `demoRepo.test.ts` | 3 + 16 test mới |

### Chưa làm / cố ý không làm
- **Chưa chạy thật trên PDF thật.** Trang này cần đăng nhập Supabase + tài khoản Yucho +
  file phiếu thật, không kiểm được bằng dev server trong session này. Toàn bộ luật số học
  có unit test, nhưng đường ghi vào DB (`updateTransaction` + thứ tự ghi) thì chưa chạy thật.
- `ImportPhieuLuongPage.tsx` gọi `repo.*` trực tiếp thay vì qua `hooks/queries.ts` — **có
  từ trước**, không phải do thay đổi này; đã theo đúng nếp sẵn có của file. Không sửa vì
  ngoài phạm vi.
- `gitnexus` MCP không lên được trong session này nên `impact()` / `detect_changes()` theo
  CLAUDE.md phải làm bằng grep + `git diff --stat`.


## Vòng hai (2026-08-20, sau khi nhập lại 59 phiếu thật)

### Số liệu thật của cả bộ (quét 59 file, không phiếu nào lỗi bóc)

| nhãn 支給 | số phiếu | tổng |
|---|---|---|
| `通勤手当` | 19 | 945.626 |
| `立替経費精算` | 27 | **2.073.482** |
| `DB掛金` | 4 (chỉ từ kỳ 202605) | 50.000 |
| `不就労控除` | 10 | — (giảm gộp thật, không phải hoàn phí) |
| `基本賞与` | 8 | — (thu nhập thật) |

`DB掛金` **không** có ở mọi tháng — 202605 −20.000, rồi 202606/07/08 mỗi tháng −10.000.
Số dư `退職金` đúng phải là **50.000**.

### Hai thay đổi

**1. Nhóm có tổng ÂM → dòng đối ứng thành CHI.** Tháng 12 có 年末調整: `過不足税額` hoàn có
thể lớn hơn TỔNG khấu trừ (202312K: hoàn 88.544 > khấu trừ 73.476 → ròng 500.678 > gộp
485.610). Bản cũ dựng dòng thu −15.068, DB cấm, nên từ chối cả phiếu và bảo "xử tay" — mà ca
này lặp lại MỖI NĂM. Nay `dongBu()` đảo phía: tổng âm → chi `|tổng|`, danh mục lấy từ dòng
`|amount|` lớn nhất trong nhóm (ở 202312K là 過不足税額 → Thuế thu nhập).

`kiemDong` phải đổi theo: chốt cũ so `thu.amount` với `tong(chi)` chỉ đúng khi dòng đối ứng
luôn là thu — `15068 !== -15068`. Nay cân bằng theo **số dư có dấu** trong từng phạm vi
thống kê.

**2. `立替経費精算` cũng ra khỏi Thu, nhưng KHÔNG có dòng hoàn tiền.** User xác nhận: các khoản
ứng chi hộ đó mua lâu rồi, **không có trong sổ**. Nên không có gì để triệt tiêu — dựng dòng
hoàn là kéo Chi xuống mà chẳng đối ứng với gì. Hệ quả: dòng trung hoà = `ròng − 立替経費精算`
(không phải `ròng`), vì thiếu dòng hoàn thì số dư hụt đúng phần đó.

Dòng trung hoà cũng đổi danh mục: từ `Tàu xe` sang **danh mục của chính dòng neo** — đọc
trong Sổ đúng nghĩa hơn, và nhờ đó `Tàu xe` chỉ còn cần khi có `通勤手当` thật.

### Bảng dòng cuối cùng (C = 通勤手当, L = 立替経費精算, N = ròng)

| dòng | số | trong Thu/Chi? | điều kiện |
|---|---|---|---|
| dòng neo — giữ số, bật cờ | N | ✗ | `C + L > 0` |
| + thu "lương thực nhận" | `N − C − L` | ✓ | `C + L > 0` |
| + chi hoàn phí đi lại (`is_refund`, `Tàu xe`) | C | ✓ | `C > 0` |
| + chi "trung hoà dòng neo" | `N − L` | ✗ | `C + L > 0` |
| + thu `DB掛金 → 退職金` | `|D|` | ✓ | `D ≠ 0` |

Số dư Yucho: `(N−C−L) + C − (N−L) = 0` ✓ · Thu: `−N + (N−C−L) = −(C+L)` ✓ · Chi `Tàu xe`: `−C` ✓

### Kiểm thật
Chạy cả **59 PDF thật** qua `bocPhieu → dungDong → kiemDong` + 6 bất biến tự kiểm (số dư
Yucho đổi 0 · Thu giảm đúng `C+L` · số dư hưu = `|D|` · mọi amount > 0 · mọi category_id
khác null · `kiemDong` rỗng): **59/59 qua**. Script ở scratchpad, không commit.

### Còn treo
- `立替経費精算` **từ nay về sau**: user nói sẽ ghi khoản ứng chi hộ vào sổ. Khi đó cách đúng
  là một danh mục riêng (vd `Ứng chi hộ công ty`) **bật `exclude_from_stats`** cho khoản mua —
  khi đó cả khoản mua và khoản hoàn đều ngoài thống kê, không cần đổi code, không cần mốc ngày.
  Nếu thay vào đó muốn dòng hoàn tiền như `通勤手当` thì phải thêm mốc kỳ vào `dungCap`.
- CLI vẫn từ chối mọi phiếu có khối 支給 (`chotKhoiCap`) — chưa dạy nó ghi `cap`.


## Vòng ba (đã chốt thiết kế, CHƯA cài): 立替経費精算 thành khoản công ty nợ

User: *"ứng tiền cho cty thì cũng giống cho cty nợ thôi rồi tới kì đòi lại là đc"* — và app đã có
đúng mô hình: `debts.direction = 'owed_to_me'` + `origin = 'lent'`. Đã đối chiếu
[debtPaymentPosting.ts:31](../../../src/features/debts/debtPaymentPosting.ts:31): `origin` khác
`'earned'` → `isDebtFlow: true`, nên lần trả tự ra khỏi Thu/Chi. **Không cần migration.**
`repo.createDebtPayment({debt_id, amount, paid_on, note, transaction})` tự dựng giao dịch và tự
đọc `origin` — importer không được tự đặt cờ.

### Bộ dòng khi có đường nợ (L = 立替経費精算)

| dòng | số | ghi chú |
|---|---|---|
| dòng neo — giữ số, bật cờ | `N` | ngoài thống kê |
| + thu "lương thực nhận" | `N − C − L` | trong Thu |
| + chi hoàn phí đi lại (`Tàu xe`) | `C` | trong Chi |
| + **trả nợ** qua `createDebtPayment` | `L` | `is_debt_flow` tự bật; trừ vào nợ KOME |
| + chi "trung hoà dòng neo" | `N` | ngoài thống kê — **không** còn `− L` |

Số dư: `(N−C−L) + C + L − N = 0` ✓ · Thu: `−(C+L)` ✓ · nợ KOME giảm `L` ✓

### Luật chọn đường (không có mốc ngày nào)
- Có khoản nợ tên **đúng bằng `KOME`**, `owed_to_me`, `open`:
  - còn nợ ≥ L → **đường nợ**
  - còn nợ < L → **TỪ CHỐI** phiếu (quên ghi lần ứng). Cố ý ồn ào, không rơi lặng lẽ về cách cũ.
- Không có khoản nào → giữ cách hiện tại (chỉ rút khỏi Thu, trung hoà = `N − L`).
  Nhờ vậy 27 phiếu cũ vẫn đúng mà không cần điều kiện theo kỳ.

### BẪY đã biết: `Minh KOME`
Sổ đã có khoản `Cho vay · Minh KOME 🐄` — một **người**, không phải công ty. Khớp kiểu "chứa KOME"
là trừ tiền công ty vào khoản Minh nợ. Nên khớp **đúng từng ký tự** (cùng nếp với tài khoản
`退職金`, xem `tkHuu` trong ImportPhieuLuongPage). Và trang xem trước PHẢI nói ra khi có khoản
nào *chứa* KOME mà không đúng bằng KOME — nếu không thì cách rơi lại thành lặng lẽ.

### Nhịp thực tế
User: *"thường thì tháng này ứng thì tháng sau cty trả lại"* → chu kỳ ngắn, nhưng vẫn dùng **một
khoản nợ đứng mãi** (ứng thêm = "Cho vay thêm", trả thì trừ dần). Mỗi lần ứng một khoản riêng thì
importer không biết `L` kỳ này trả cho khoản nào.

### Đã cài (sau khi user nhập lại xong 59 phiếu, số dư Yucho + 退職金 khớp)

`nhap.ts`: `TEN_NO_CONG_TY` · `NoCongTy` · `TraNo` · `dungCap` nhận `no`, `dungDong`/`dungKeHoach`
thêm tham số cuối, `kiemCap` gộp dòng trả nợ vào phép cân bằng **nhưng KHÔNG vào `thuMoi`** (dòng
đó mang `is_debt_flow` nên không nằm trong Thu).

`supabaseRepo.xoaPhieuLuong()`: xoá `debt_payments` mang tiền tố `給与 ` **trước** phép xoá giao
dịch hàng loạt, và xoá hàng payment trước giao dịch của nó — `transaction_id` là
`on delete set null`, thứ tự ngược là mất đường tìm giao dịch. Trả thêm `traNo`.

`ImportPhieuLuongPage.tsx`: `useDebts`/`useDebtPayments` → khớp `counterparty === 'KOME'` đúng từng
ký tự; ghi qua `repo.createDebtPayment` (KHÔNG `createTransaction` — để khoản nợ tự quyết
`is_debt_flow`); nêu tên gần giống; `invalidateDebts` sau mọi lần ghi/xoá.

### Kiểm thật
- 2800 test pass · build xanh.
- 59 PDF thật qua đường **rơi-lại** (chưa có khoản nợ KOME): **59/59** — không hồi quy cho dữ liệu
  user vừa nhập.
- 27 phiếu có `立替経費精算` qua đường **nợ** (nợ giả đủ số): **27/27** cân bằng, và **27/27** NỔ
  đúng khi còn nợ thiếu 1 yen.

---

# Phụ lục: hai việc phát hiện khi soát tổng Chi (2026-08-20)

## Đã sửa: "Gửi gia đình" đóng cứng danh mục

Tab Ngày của Sổ ghi Chi ¥178.268 còn Bản tin / tab Tổng hợp / Ngân sách ghi ¥148.268 —
lệch đúng ¥30.000, là khoản `Gửi tiền về VN`. Danh mục đó có `kind='transfer'` do
[0046_category_kind.sql:43](../../../supabase/migrations/0046_category_kind.sql:43) **đóng cứng
theo tên**, nên mọi module gộp đều loại nó.

Nhưng tiền đó user gửi **cho gia đình để hỗ trợ** — ra khỏi tài sản thật. Gốc vấn đề: shape
`family` ("Gửi gia đình") dùng `categoryPicker: 'auto'`, tức app đóng cứng danh mục
`Gửi tiền về VN` — **phương tiện**, không phải **mục đích**. Mà câu user hỏi ("tiền của mình
đi đâu") chỉ trả lời được bằng mục đích; user đã có sẵn danh mục `👪 Hỗ trợ gia đình`.

Chuyển tiền cho CHÍNH MÌNH đã có shape riêng (`ownvn` → `type='transfer'`, bị loại theo LOẠI
giao dịch chứ không theo `kind` danh mục), nên `family` chỉ dùng khi tiền thật sự ra khỏi tay.

Sửa: `family.categoryPicker: 'auto' → 'user'`, `saveRemit` ưu tiên `base.categoryId` và chỉ
lùi về `Gửi tiền về VN` khi không có lựa chọn. Cập nhật 6 test khoá thiết kế cũ.

**User cần làm trong app:** đổi danh mục của khoản ¥30.000 hiện có sang `Hỗ trợ gia đình`
(khoản cũ vẫn mang danh mục cũ — code không sửa dữ liệu đã ghi).

## CHƯA sửa: Sổ không lọc danh mục `kind='transfer'`

Lỗi có từ trước, **độc lập** với việc trên. Đường tính của Sổ lọc `is_debt_flow` và
`exclude_from_stats` nhưng **không** lọc `kind='transfer'`, trong khi mọi module gộp đều lọc
qua `transferCategoryIds` ([kind.ts:21](../../../src/features/categories/kind.ts:21)) — đúng
điều chú thích đầu `kind.ts` cảnh báo: *"hai màn dựng hai tập khác nhau thì chi tháng 8 sẽ ra
hai con số"*.

Sau khi sửa việc trên thì nó thành lỗi NGỦ (chỉ còn `Điều chỉnh số dư` là transfer, mà dòng
đó đã mang `exclude_from_stats`). Nó dậy ngay lần user gắn `kind='transfer'` cho một danh mục
khác — và shape `ownvn` chính là đường dẫn tới đó.

Danh sách file để sửa một phát, không phải điều tra lại:
| file | việc |
|---|---|
| `src/features/transactions/ledgerShared.ts` | `sumInBase` + `sumPerCurrency` nhận `transferIds`, bỏ qua dòng thuộc tập đó |
| `src/features/transactions/ledgerHeat.ts` | cùng phép lọc (hiện chỉ lọc `type === 'transfer'`, dòng ~79) |
| `PeriodTotalsBar.tsx` · `DailyView.tsx` · `CalendarView.tsx` | truyền `useTransferCategoryIds()` xuống |
| `TransactionItem.tsx` (~dòng 165) | hiện nhãn "(không tính vào Thu/Chi)" cho dòng danh mục `transfer` — nếu không, cộng tay các dòng sẽ không khớp tổng và người đọc lại tưởng sai |
| `ledgerShared.test.ts` · `ledgerHeat.test.ts` | test cho phép lọc mới |

---

## Vòng bốn — `通勤手当` không phải hoàn tiền (20/08/2026)

### Giả định sai của vòng một

Vòng một ghi `通勤手当` thành **hoàn tiền** (`expense` + `is_refund`, danh mục `Tàu xe`),
với chú thích nói thẳng giả định: *"Nó triệt tiêu khoản mua vé mà người dùng đã tự ghi —
dù khoản đó ở tháng nào, số bao nhiêu."*

Giả định đó dựa trên câu người dùng nói lúc thiết kế (*"cũng có trường hợp tôi mua trước
rồi phải đến ngày lương cty mới trả lại"*) — tôi suy ra khoản mua có trong sổ. **Không
có.** Quét cả 977 giao dịch từ 2025/09 tới 2026/08: danh mục `Tàu xe` chỉ có các khoản
¥170–3.250, không khoản nào cỡ vé định kỳ. Riêng khoản người dùng nêu (¥40.680, mua
22/06/2026, vé 3 tháng) cũng không có trong sổ — ngày 6/22 không có giao dịch nào ≥ ¥3.000.

Hệ quả thật: dòng hoàn tiền đi khấu vào những khoản **không liên quan**. Tháng 8/2026, Chi
ngày 10 âm ¥45.940 vì ¥77.070 hoàn khấu lên ¥31.130 chi thật (cơm ngoài + gửi gia đình).

### Quy mô

Quét 59 PDF: **19 kỳ** có `通勤手当`, từ 202202 đến 202608, tổng **¥945.626**.

```
202202   8,000   202211  56,410   202408  72,690
202203   6,800   202302  56,410   202501  18,566
202204   6,400   202305  56,410   202502  77,070
202205  10,400   202308 106,080   202508  77,070
202206  74,720   202402 106,080   202602  77,070
202209  18,180   202407  20,620   202608  77,070
202210  19,580
```

Số không đồng dạng: ¥6.400–20.620 là hoàn theo tháng (IC card), ¥56.410–106.080 là vé định
kỳ 6 tháng. Không phải một loại — thêm một lý do để không đoán khoản mua đối ứng.

### Cách làm được chọn

`通勤手当` thành **dòng THU riêng** dưới danh mục thu `Phụ cấp đi lại` (`DANH_MUC_PHU_CAP`),
tách khỏi `Lương` — vẫn đúng yêu cầu gốc "chi phí đi lại không cộng vào lương". Đếm vào Thu
hay không do `KY_PHU_CAP_VAO_THU = '202608'` quyết:

| Kỳ | `exclude_from_stats` | Vì sao |
|---|---|---|
| < 202608 (18 kỳ) | `true` | Không có khoản mua vé nào trong sổ. Đếm vào Thu là dựng ¥868.556 thu nhập không phía chi; ghi thành hoàn tiền là khấu ¥868.556 khỏi Chi của khoản khác. Ngoài cả hai là cách duy nhất không bịa. |
| ≥ 202608 | `false` | Từ đây người dùng ghi cả hai phía. |

**Vì sao phải có mốc, trong khi `立替経費精算` không cần:** `立替` rơi về cách đúng dựa trên
khoản nợ `KOME` có tồn tại hay không — một dữ kiện **có trong sổ**. Dữ kiện quyết định của
`通勤手当` là "người dùng có ghi khoản mua vé hay không", và điều đó **không đọc được từ
sổ**: một khoản `Tàu xe` ¥40.680 không tự khai nó thuộc kỳ phụ cấp nào.

**Mốc khớp theo chu kỳ, không phải theo tháng người dùng đổi ý.** Vé ¥40.680 mua 22/06 là
tiền của kỳ phụ cấp 202602 — kỳ đó bị ẩn, nên khoản mua đó **cũng không được ghi**. Phụ cấp
kỳ 202608 chi trả cho vé mua từ tháng 8 trở đi, và những lần đó người dùng ghi. Nhờ vậy
không cần thao tác bù trừ nào ở khúc chuyển.

### Cách bị bác

- **Thu riêng, không mốc** (mọi kỳ vào Thu): dựng ¥868.556 thu nhập lơ lửng, Chênh lệch 18
  kỳ cũ đều cao hơn thực.
- **Ẩn hết, không mốc**: ¥36.390 người dùng thật sự lời mỗi chu kỳ không hiện ở đâu, kể cả
  từ nay về sau. Người dùng đã chọn "hiện đủ hai chiều" khi được nêu con số này.
- **Mô hình nợ như KOME**: đúng nhất về khái niệm nhưng đòi ghi mỗi lần mua vé thành một
  khoản cho công ty nợ. Người dùng đã nói không ghi được phần cũ.

### Chốt

- `kiemCap`: kỳ vọng Thu giảm đổi từ `−(通勤手当 + 立替)` sang `−(立替 + 通勤手当 nếu bị ẩn)`.
  Quên đổi chốt này thì **cả 19 kỳ bị từ chối** — ồn ào, dễ thấy. Nới chốt ra thì một dòng
  phụ cấp đếm sai phía đi thẳng vào sổ.
- `phuCapVaoThu(p)` **nổ** khi thiếu `period`, không mặc định về "ẩn": mặc định lặng lẽ
  nghĩa là một phiếu không đọc được kỳ vẫn được ghi với phụ cấp rơi phía nào không ai biết.
- `tests/phieuLuongKhoiCap.test.ts`: trang phải tra danh mục trong nhóm `type === 'income'`.
  Sổ có thể có một `Phụ cấp đi lại` **loại chi** do người dùng tự tạo; gắn nó vào một dòng
  `type: 'income'` thì dòng đó không hiện ở báo cáo nào — không lỗi, chỉ là biến mất.
- Chỉ **một** chỗ so kỳ với mốc (`period >= KY_PHU_CAP_VAO_THU`), có test đếm.

### Kiểm

- 2804 test pass · `npm run build` xanh (`tsc --noEmit` **không** soi `src/` ở repo này).
- 59/59 PDF thật đi trọn `bocPhieu → dungDong → kiemDong` sạch, kèm 6 bất biến tự kiểm:
  số dư tài khoản neo = 0 · Thu giảm đúng mức · không còn dòng `is_refund` trong khối 支給 ·
  mọi dòng có `category_id` · mọi `amount > 0` · cờ ẩn khớp mốc. 18 kỳ ngoài Thu, 1 kỳ trong.

### Việc của người dùng

1. **Nhập lại lô phiếu lương** — 19 dòng cũ đang là `expense + is_refund` trong DB; code
   không sửa dữ liệu đã ghi và form không đổi được loại giao dịch.
2. Từ tháng 8/2026, ghi các lần mua vé định kỳ vào Chi như một khoản `Tàu xe` bình thường.
3. **Không** thêm khoản ¥40.680 ngày 22/06 — nó thuộc chu kỳ đã ẩn.

---

## Vòng năm — cả khối 支給 đứng ngoài thống kê (20/08/2026)

Vòng bốn dựng mốc `KY_PHU_CAP_VAO_THU = '202608'`: trước mốc thì ẩn, từ mốc thì đếm vào Thu.
Người dùng nhìn số thật (Thu tháng 8 lên ¥419.251) rồi bác, bằng hai câu:

> `DB掛金` là nó trừ vào lương trước khi tôi nhận được.
> Phụ cấp đi lại không phải thu.

Cả hai đều đúng, và **nhất quán với chính app**: mọi khoản khác của bộ máy
`総支給金額 → 差引支給額` — `健康保険料`, `厚生年金保険`, `雇用保険料`, `所得税`, `住民税`,
`phần bị giữ lại` — đều mang `exclude_from_stats`. `通勤手当` và `DB掛金` là hai khoản duy
nhất của bộ máy đó từng bị đếm vào Thu, và chúng sai theo hai hướng khác nhau.

| Khoản | Vòng 1 | Vòng 4 | Vòng 5 |
|---|---|---|---|
| `通勤手当` | chi âm (`is_refund`), danh mục `Tàu xe` | thu, ẩn trước mốc 202608 | **thu, luôn ẩn**, danh mục `Phụ cấp đi lại` |
| `DB掛金` | thu vào `退職金`, **đếm vào Thu** | như vòng 1 | **thu vào `退職金`, ẩn** |

Lý do khác nhau, kết luận giống nhau:

- `通勤手当` — công ty trả tiền đi lại; tiền vào rồi ra để mua vé. Không phải mình kiếm được.
- `DB掛金` — công ty lấy ¥10.000 **của người dùng** mỗi tháng bỏ vào `退職金`
  (hagukumikikin.jp). Tiền của chính mình chuyển sang tài khoản khác. `厚生年金保険` cùng
  bản chất và đã nằm ngoài thống kê từ đầu.

`type: 'transfer'` không dựng được cho `DB掛金`: chuyển khoản cần tài khoản NGUỒN, mà nguồn
là công ty — không có trong sổ. Nên vẫn là một dòng thu vào `退職金`, chỉ thêm cờ ẩn.

**Mốc kỳ bị xoá hẳn**, kèm `phuCapVaoThu()`. `kiemCap` quay về bất biến gốc:
`Thu giảm = 通勤手当 + 立替経費精算`. Danh mục thu riêng `Phụ cấp đi lại` thì **giữ**, dù dòng
bị lọc khỏi mọi báo cáo — để đọc được trong Sổ; `Lương · phụ cấp đi lại` gây hiểu sai đúng
cái điều người dùng muốn tránh.

### Số tháng 8/2026

| | Vòng 1 (đã ghi) | Vòng 4 (đã ghi) | Vòng 5 |
|---|---|---|---|
| Thu | 342.181 | 419.251 | **332.181** |
| Chi | 178.268 | 255.338 | **255.338** |
| Chênh lệch | 163.913 | 163.913 | **76.843** |

Chênh lệch tụt ¥87.070 là **đúng theo định nghĩa mới**, không phải mất tiền: nó giờ đo
"kiếm được trừ tiêu", đã trừ ra ¥77.070 tiền đi lại đi qua tay và ¥10.000 chuyển vào hưu.
Tài sản thật vẫn tăng nhiều hơn con số đó — cùng kiểu như `厚生年金保険` vốn đã không nằm
trong Chênh lệch.

### Chốt

- `tests/phieuLuongKhoiCap.test.ts`: chốt tầng nguồn cho **cả hai** dòng phải mang
  `exclude_from_stats: true`, và không còn `KY_PHU_CAP_VAO_THU`. Cần chốt nguồn vì cờ này
  **không có cách nào sai ồn ào** — đếm sai phía thì Thu chỉ lệch đi, không lỗi nào nổ.
- 59/59 PDF thật sạch, thêm 2 bất biến: không dòng nào ngoài tài khoản neo mà còn trong
  thống kê · dòng `DB掛金` đúng số và có cờ ẩn.
- 2808 test pass · `npm run build` xanh.

### Bài học

Ba vòng cho một khoản. Vòng 1 sai vì tôi **suy** ra từ một câu nói (*"tôi mua trước rồi cty
trả lại"*) rằng khoản mua vé có trong sổ, mà không đi kiểm. Vòng 4 sai vì tôi chọn mô hình
trước khi hỏi người dùng khoản đó **có phải thu nhập** hay không — tôi hỏi "muốn thấy ¥36.390
lời không" (một câu về hiển thị) thay vì "đây có phải tiền anh kiếm được không" (câu về bản
chất). Cả hai lần, con số THẬT trên màn hình mới lôi ra được sai. Đưa số thật ra sớm.
