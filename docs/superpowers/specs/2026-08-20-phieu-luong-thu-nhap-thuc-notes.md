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
