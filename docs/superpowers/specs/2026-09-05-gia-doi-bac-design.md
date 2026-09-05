# Giá đổi bậc — thiết kế (mục 3: "giá tăng âm thầm")

> **Ngày:** 2026-09-05 · **Trạng thái:** chờ duyệt

## 1. Vấn đề

Một khoản trả đều đặn đổi giá thì không ai để ý — mỗi lần chỉ vài trăm yên, nhưng nó lặp
mười hai lần một năm. Và app hiện tại **mù giá đổi theo đúng cấu trúc**, không phải do
thiếu dữ liệu: radar định kỳ ([recurringRadar.ts:82](../../../src/lib/recurringRadar.ts:82))
gom nhóm theo `(loại + tài khoản + danh mục + SỐ TIỀN)` — số tiền nằm trong khoá nhóm, nên
giá đổi là nhóm gãy đôi. Netflix ¥990 và Netflix ¥1.290 là hai nhóm xa lạ.

Ca thật trong sổ: **Tiền nhà ¥62.760 → ¥112.760 từ 2026/03** — nặng thêm ¥600.000/năm.
Máy phải chỉ ra được thứ cỡ đó, và cả những bậc nhỏ hơn nhiều.

## 2. Quyết định đã chốt với người dùng

| # | Quyết định |
|---|-----------|
| 1 | Một thẻ **"Khoản lặp đều đã đổi giá"** ở tab **Dài hạn**. Mẫu hiển thị (số thật) đã được duyệt: dòng `🔑 Tiền nhà ¥62,760 → ¥112,760 · đổi từ 2026/03, đã trả 7 lần theo giá mới · +¥600,000/năm`. |
| 2 | **Có báo**: một tin ở Bản tin khi phát hiện bậc giá MỚI — mỗi bậc báo đúng một lần. |
| 3 | Tăng hay **giảm** đều hiện — trả bớt một gói cũng đáng thấy như bị tăng giá. |
| 4 | **Không đổi schema.** Không cần bảng nhớ: tin là `kind: 'info'` (đọc là mất), thẻ là danh sách thuần không nút. |

## 3. Cách nhận ra một "bậc giá" — mấu chốt chống ồn

Một nhóm được coi là **đổi bậc** khi dãy số tiền theo thời gian có dạng
`…A A | B B…`: **ít nhất 2 lần liên tiếp cùng giá cũ A**, rồi **ít nhất 2 lần liên tiếp
cùng giá mới B**, với A ≠ B. Nhiều bậc trong cửa sổ → lấy bậc **gần nhất**.

Yêu-cầu-hai-mặt-phẳng này CHÍNH LÀ bộ lọc ồn, không cần ngưỡng phần trăm tuỳ ý nào:

- Tiền điện/gas mỗi tháng một số khác nhau → không bao giờ có 2 lần bằng nhau → tự loại.
- "Hỗ trợ gia đình" lúc ¥20.000 lúc ¥30.000 không đều kỳ → không đủ mặt phẳng → tự loại.
- Lần đầu tiên trả giá mới (mới 1 lần) → **chưa** báo; đủ 2 lần mới chắc là bậc, không
  phải một lần trả lệch.

So sánh dùng **số tiền thô cùng tài khoản** (minor units) — cùng loại tiền nên không dính
tỷ giá, không có `hasMissingRate` ở tầng dò. Phần hiển thị đi qua `<Money>` với đúng
currency của tài khoản.

## 4. Hai nguồn nhóm, một máy dò

Module thuần mới `src/features/reports/giaDoiBac.ts`:

**Nguồn 1 — khoản gắn quy tắc** (`recurring_rule_id != null`): danh tính TUYỆT ĐỐI qua
mọi lần đổi giá — người dùng sửa số tiền của quy tắc thì giao dịch cũ giữ giá cũ, giao
dịch mới mang giá mới, cùng một `rule_id`. Đây là đường bắt được ca Tiền nhà. Tần suất
(tháng/tuần/năm) đọc từ chính quy tắc → quy ra `+Δ/năm`.

**Nguồn 2 — khoản lặp từ sao kê** (không `rule_id`): gom theo
`(ghi chú đã trim + tài khoản + danh mục)` — tên cửa hàng từ file enavi là chuỗi ổn định.
Nhóm phải có **nhịp ~tháng** (khoảng cách trung vị 25–35 ngày, cùng ngưỡng với radar) rồi
mới xét bậc; nhịp không đều → bỏ, không đoán.

```ts
export interface BacGia {
  /** Nhãn hiện ra: tên quy tắc, hoặc ghi chú giao dịch. */
  nhan: string
  /** Icon danh mục nếu có. */
  icon: string | null
  accountCurrency: CurrencyCode
  giaCu: number     // minor units, tiền của tài khoản
  giaMoi: number
  /** Tháng đầu tiên trả giá mới, khoá dạng monthId. */
  tuThang: string
  /** ISO ngày đầu tiên trả giá mới — khoá định danh của BẬC (cho key thông báo). */
  tuNgayISO: string
  /** Đã trả bao nhiêu lần theo giá mới. */
  soLanGiaMoi: number
  /** (giaMoi − giaCu) × số kỳ mỗi năm. Dương = nặng thêm, âm = nhẹ đi. */
  chenhMoiNam: number
}

export function doBacGia(
  txs: readonly TransactionRow[],
  rules: readonly RecurringRuleRow[],
  categories: readonly Pick<CategoryRow, 'id' | 'icon'>[],
  accounts: readonly { id: string; currency: CurrencyCode }[],
): BacGia[]
```

Trả về sắp theo `|chenhMoiNam|` giảm dần — bậc nặng nhất đứng đầu, bất kể tăng hay giảm.

## 5. Hai chỗ tiêu thụ

### 5.1 Thẻ ở tab Dài hạn

`GiaDoiBacCard` — danh sách thuần, không nút, không lưu gì. Dữ liệu: `txs` (24 tháng) đã
nằm sẵn trong LongView + `useRecurringRules()` (query đã có cache). Không có bậc nào →
`return null`, tab y hệt hôm nay.

Mỗi dòng đúng theo mẫu đã duyệt ở §2. Chênh lệch tô `text-fg-warn` khi dương (nặng thêm),
`text-money-in` khi âm (nhẹ đi). Câu "đã trả N lần theo giá mới" là bằng chứng — người
đọc kiểm được bằng mắt trong Sổ.

### 5.2 Tin ở Bản tin — `'price-step'`

Luật mới `priceStepRules` trong notifications: chạy `doBacGia` trên `recentTxs` (90 ngày)
+ `recurringRules` (đã có trong input). `kind: 'info'` — tin để biết, đọc là mất, đúng cơ
chế "báo một lần" mà không cần bảng nhớ:

- `key: 'price-step:<nhãn>:<tuNgayISO>'` — cùng bậc không bao giờ sinh key thứ hai.
- Cửa sổ 90 ngày cần chứa đủ 2+2 lần quanh bậc → tin chỉ nổ cho bậc **mới xảy ra**
  (trong ~2 tháng gần nhất). Bậc cũ hơn không làm phiền Bản tin — nó nằm ở thẻ Dài hạn.
- `to: '/reports?view=long'` — trỏ về nơi có đầy đủ ngữ cảnh.

Câu tin: `Tiền nhà đổi giá: ¥62,760 → ¥112,760 (+¥600,000/năm)` — `formatMoney` TIÊM từ
input như mọi luật khác, không import thẳng (chế độ riêng tư).

**Thêm luật thông báo = phải `npm run bundle:rules` và commit `_rules.js`** — bài học
mục 2a, lần này ghi thẳng vào spec. `tests/pushBundle.test.ts` là trọng tài.

## 6. Các ca biên phải xử đúng

| Ca | Xử lý |
|----|-------|
| Giá đổi rồi đổi lại (A→B→A) | Hai bậc; lấy bậc gần nhất (B→A). Không tự bù trừ thành "không đổi". |
| Quy tắc tạm dừng / hết hạn | Vẫn xét trên giao dịch đã có — bậc trong quá khứ vẫn là sự thật. |
| Nhóm ghi-chú trùng tên quy tắc | Giao dịch có `rule_id` chỉ vào nguồn 1, không vào nguồn 2 — một giao dịch không được đếm hai lần (cùng luật với radar, dòng 81). |
| Ghi chú rỗng | Không gom được theo tên → bỏ khỏi nguồn 2. Nói thẳng giới hạn: khoản gõ tay không ghi chú thì máy không dò được. |
| Khoản tuần/năm | Nguồn 1 đọc tần suất từ quy tắc; nguồn 2 chỉ nhận nhịp ~tháng (giữ hẹp, YAGNI). |
| Đổi giá do đổi tiền tệ tài khoản | Không xảy ra — so sánh trong cùng tài khoản, một tài khoản một loại tiền (bất biến của app). |

## 7. Ngoài phạm vi

- Không lưu lịch sử bậc giá, không bảng mới, không nút "bỏ qua" — tin `info` tự biến mất
  sau khi đọc; thẻ là sự thật tĩnh, muốn hết hiện thì sửa chính khoản chi.
- Không đụng radar (`recurringRadar.ts`) — nó phục vụ câu hỏi khác ("có khoản lặp chưa
  khai quy tắc"), gộp hai máy dò là hai câu hỏi cãi nhau trong một hàm.
- Không đụng `src/mcp/`.

## 8. Kiểm thử

`giaDoiBac.test.ts` (thuần):

- 3×A rồi 2×B cùng rule_id → một bậc, đúng giaCu/giaMoi/tuThang/soLanGiaMoi/chenhMoiNam
- 3×A rồi 1×B → **không** báo (giá mới chưa đủ 2 lần)
- tiền điện (mỗi tháng một số) → không báo
- lúc 20k lúc 30k xen kẽ → không báo
- A→B→A → lấy bậc gần nhất
- giảm giá → `chenhMoiNam` âm, vẫn báo
- nguồn 2: cùng ghi chú, nhịp ~30 ngày, có bậc → báo; nhịp thất thường → im
- giao dịch có rule_id không lọt vào nhóm ghi chú
- quy tắc tần suất năm → `chenhMoiNam` = chênh × 1

`priceStepRules.test.ts`: bậc trong cửa sổ → 1 tin kind info, key mang `tuNgayISO`;
không bậc → im; `trips`-style undefined-guard không cần (rules/txs luôn có trong input).

Sau khi code: `tsc -b` + `npm test` + `npm run lint` + `bundle:rules` + **mở app xem**
(Sáng/Tối, 375px×1,25, chữ dạy bọc `Guide` còn dòng dữ liệu thì không — hai bài học cũ).
