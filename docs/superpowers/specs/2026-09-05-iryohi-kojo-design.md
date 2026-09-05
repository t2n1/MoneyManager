# Khoản ⑤ — 医療費控除 (khấu trừ chi phí y tế)

> **Ngày:** 2026-09-05 · **Trạng thái:** chờ duyệt · **Nền:** spec
> [2026-09-03-quyen-loi-thue-nhat-design.md](2026-09-03-quyen-loi-thue-nhat-design.md) —
> khoản này là mục "để đợt sau" của spec đó, nay làm vì dữ liệu nói nó vừa "bật".

## 1. Vì sao làm bây giờ

Spec Quyền lợi hoãn khoản này với lý do "số thường nhỏ". Số năm nay nói khác:

| | |
|---|---|
| Thuốc (1/1 → 5/9/2026) | ¥66.771 · 21 lần |
| Bệnh viện | ¥25.040 · 2 lần |
| **Cộng 8 tháng** | **¥91.811** |
| Ngưỡng khấu trừ | ¥100.000/năm |

Giữ đà này thì **vượt ngưỡng trong quý 4** — năm đầu tiên khoản này có tiền thật. Và chi
phí biên gần bằng 0: khoản ① và ② đằng nào cũng đưa người dùng tới 確定申告 lần đầu; thêm
医療費控除 là thêm vài dòng vào cùng tờ khai. Điều kiện duy nhất phải biết **trước**:
**giữ hoá đơn** (minh chứng lưu 5 năm). Đúng nghĩa "biết trước 31/12" của màn Quyền lợi.

## 2. Luật — nguồn, năm hiệu lực, cái app dùng

Hai nhánh, **chỉ được chọn một** trong cùng một năm thuế:

**Nhánh chính — 医療費控除** (NTA タックスアンサー No.1120, No.1122):
- Khấu trừ = (chi y tế đã trả − tiền bảo hiểm bù) − min(¥100.000, 5% × 総所得金額等)
- Trần khấu trừ: ¥2.000.000
- Khai bằng 確定申告 kèm 医療費控除の明細書; hoá đơn tự lưu 5 năm.

**Nhánh thay thế — セルフメディケーション税制** (No.1132):
- Chỉ thuốc OTC thuộc diện (対象医薬品, có dấu ★ trên hoá đơn/bao bì)
- Khấu trừ = chi − ¥12.000, trần ¥88.000
- Điều kiện: có 一定の取組 trong năm (健康診断 công ty là đủ — người làm công ăn lương
  gần như mặc nhiên có; app ghi giả định này ra chữ)
- **Hiệu lực tới 31/12/2026** (gia hạn 令和4年度改正). Bộ luật phải mang hạn này —
  sang 2027 mà chưa gia hạn tiếp thì nhánh này tự tắt theo `luatChoNam`.

Hằng số vào `rules/2026.ts` (và `2022.ts` — luật hai nhánh này giống nhau trong khoảng
5 năm khoản ② soát lùi), khối mới trong `LuatNam`:

```ts
  iryohi: {
    /** Ngưỡng trừ của nhánh chính (yên) — vế min với 5% tổng thu nhập, xem §4. */
    nguong: number            // 100_000
    tranKhauTru: number       // 2_000_000
    selfMed: {
      nguong: number          // 12_000
      tran: number            // 88_000
      /** ISO ngày cuối hiệu lực; null = không hạn. 2026-12-31 theo 令和4年度改正. */
      hetHan: string | null
    }
  }
```

Mỗi số có test đối chiếu ở `rules/luat.test.ts`, URL vào mảng `nguon` — đúng cách bảy
nguồn hiện có.

## 3. Ước từ sổ — phạm vi đếm và ba lời nói thẳng

Đếm theo **TÊN danh mục** (cùng lối `FURUSATO_CATEGORY_NAME`):

```ts
export const IRYOHI_CATEGORY_NAMES = ['Thuốc', 'Bệnh viện'] as const
```

Không đếm "Sức khỏe" (gym/thể chất — không thuộc diện). Trừ hoàn tiền (`is_refund`),
năm **dương lịch** theo `occurred_on` (trục thời gian thứ hai, mục A spec nền). Nhánh
self-med chỉ đếm danh mục **Thuốc**.

Ba méo mó của phép ước, màn hình phải nói ra thay vì im (`ly_do` của KetLuan):

1. **Đếm thừa:** app đếm mọi khoản trong hai danh mục; luật loại thực phẩm chức năng,
   mỹ phẩm, khám sức khoẻ tự nguyện không dẫn tới điều trị.
2. **Đếm thiếu:** tiền tàu xe đi viện được tính theo luật nhưng nằm trong danh mục
   Tàu điện — app không tách được.
3. **Không trừ tiền bảo hiểm bù** (保険金・高額療養費) — app không có dữ liệu; năm nào có
   nhận tiền bù thì số thật thấp hơn.

## 4. Phép tính — cận dưới có chủ ý

```
chiY   = Σ(Thuốc + Bệnh viện) trong năm
khauTruChinh  = clamp(chiY − nguong, 0, tranKhauTru)
khauTruSelf   = selfMed còn hiệu lực ? clamp(chiThuoc − selfMed.nguong, 0, selfMed.tran) : 0
khauTru       = max(khauTruChinh, khauTruSelf)   // luật cấm cộng dồn — lấy nhánh lợi hơn
tietKiemUoc   = suatBien != null ? tienTietKiem(khauTru, khauTru, suatBien, luat) : null
```

**Vế 5% cố ý bỏ, và bỏ là AN TOÀN:** ngưỡng thật = min(100.000, 5% × 総所得金額等). App
không ước được 総所得金額等 tử tế. Dùng thẳng 100.000 thì với người thu nhập thấp (5% <
100k) ngưỡng thật THẤP hơn → khấu trừ thật CHỈ LỚN HƠN số app hiện. Mọi số của khoản ⑤
là **cận dưới**, `ly_do` nói rõ. Thà hứa ít giao nhiều.

Khi hai nhánh cùng dương, khối hiện nhánh thắng kèm một dòng về nhánh thua ("nhánh OTC
được ¥X nhưng nhánh chính lợi hơn") — người dùng cần biết vì hai nhánh đòi hai loại giấy
khác nhau.

## 5. Nối vào khuôn có sẵn

- `ketLuan.ts`: thêm `'iryohi'` vào `KetLuanId`.
- Module thuần mới `src/features/quyen-loi/iryohi.ts` — cùng hình `tinhFurusato`:
  `tinhIryohi(input): IryohiKetQua` với `ketLuan: KetLuan` bên trong. Trạng thái:
  - đã vượt ngưỡng (khấu trừ > 0) → `'thieu'`, việc = *"Giữ hoá đơn y tế — đã vượt
    ngưỡng, khai 医療費控除 trong 確定申告 tới"*, hạn = 15/3 năm sau (hạn 確定申告).
  - chưa vượt → `'du'` (không việc gì; khối trên trang vẫn hiện tiến độ
    "¥91.811 / ¥100.000" quanh năm).
  - `suatBien == null` → `tiet_kiem_uoc: null` (khấu trừ vẫn hiện — khấu trừ là số
    chắc, tiền tiết kiệm mới là số cần thuế suất).
- `quyenLoi.ts` (`tinhQuyenLoi`): gọi thêm bộ kiểm ⑤, đưa vào mảng kết luận.
- `QuyenLoiPage`: khối ⑤ theo đúng khuôn bốn khối trước, đứng sau ④.
- Thông báo: type mới `'benefit-iryohi'` (kind `action` — có việc thật: giữ hoá đơn,
  khai). benefitRules đọc `benefits` như bốn khoản kia. **`bundle:rules` + kiểm
  `loadInput.ts`** phía push đã nạp txs năm + categories cho furusato chưa — nếu rồi thì
  khoản ⑤ ăn theo miễn phí, nếu thiếu thì bổ sung (xác định lúc viết kế hoạch).

## 6. Ca biên

| Ca | Xử lý |
|----|-------|
| Hoàn tiền thuốc (trả hàng) | `is_refund` trừ ra — cùng phép `tong()` của furusato. |
| Vượt cả trần 2M | clamp; hiện "đã chạm trần khấu trừ". |
| Sang 2027, self-med chưa gia hạn | `hetHan` 2026-12-31 → nhánh tự tắt; nhánh chính vẫn chạy. |
| Người dùng tắt loại thông báo này | `offTypes` sẵn có, không làm gì thêm. |
| Không có giao dịch y tế nào | Khối vẫn hiện "¥0 / ¥100.000" — cho biết app CÓ đếm, khác với không biết. |
| Năm cũ (khoản ② soát lùi) | **Ngoài phạm vi đợt này** — sổ chỉ nhập từ ~2025, năm cũ thiếu dữ liệu y tế; nói rõ trong khối ② nếu cần ở đợt sau. |

## 7. Ngoài phạm vi

医療費控除 cho 5 năm cũ · đọc hoá đơn/OCR · tách ★OTC tự động · 高額療養費 ·
không đổi schema, không đụng `src/mcp/`.

## 8. Kiểm thử

`iryohi.test.ts`: dưới ngưỡng → 'du', khấu trừ 0 · vượt ngưỡng → 'thieu' + khấu trừ đúng ·
trần 2M clamp · self-med thắng khi chi thuốc cao mà tổng dưới 100k (ví dụ thuốc 60k,
bệnh viện 0 → chính 0, self 48k... **kiểm lại số**: thuốc 60k → self = 60k−12k = 48k ✓) ·
self-med hết hạn 2027 → tắt · hoàn tiền trừ ra · suatBien null → tiet_kiem_uoc null nhưng
khấu trừ vẫn có · ranh giới năm dương lịch. `luat.test.ts`: đối chiếu 100.000 / 2.000.000
/ 12.000 / 88.000 / 2026-12-31 với nguồn.

Sau khi code: `tsc -b` + `npm test` + lint + `bundle:rules` + mở app xem (hai bài học
Guide/dữ-liệu và Sáng/375×1,25 như mọi lần).
