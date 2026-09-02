# Quyền lợi — "Năm nay tôi còn để quên đồng nào?" — bản thiết kế

Ngày 2026-09-03. Chốt hướng với chủ app qua brainstorming (xem mục "Quyết định đã chốt").
Chưa code gì.

## Câu hỏi màn này trả lời

*"Tới 31/12 năm nay, có đồng nào tôi đang bỏ lỡ mà chỉ cần biết trước là lấy được?"*

Hôm nay app không trả lời được, và lý do không phải thiếu dữ liệu. Lương gộp, từng khoản
khấu trừ trên 59 phiếu lương, từng lần gửi tiền về VN, sổ lệnh quỹ, cờ NISA trên tài
khoản — đều đã nằm trong sổ. Cái thiếu là **luật ở ngoài sổ**: ai được khấu trừ, ngưỡng
bao nhiêu, hạn ngày nào, khai ở đâu. Ghép hai thứ đó lại là việc không màn hình nào làm,
và cũng là việc chủ app không tự làm được vì không có lý do gì để biết những luật ấy.

Đây là lý do màn này được chọn làm "tầm mới" thay cho việc soi kỹ hơn dữ liệu đã có: mọi
thứ trong sổ chủ app đã sống qua, soi kỹ tới đâu cũng chỉ nói điều họ đoán được. Cái họ
không thể đoán nằm ngoài sổ.

**Màn này KHÔNG nộp gì thay người dùng và KHÔNG tư vấn thuế.** Nó hiện số, hiện luật kèm
nguồn, hiện việc cần làm và hạn. Nộp giấy cho công ty hay khai với sở thuế là việc của
người dùng — app làm cho họ biết **trước** 31/12 thay vì biết sau.

## Quyết định đã chốt (với user, 2026-09-02)

Bốn điều về hoàn cảnh chủ app, hỏi một lần và đều đúng:

| Hoàn cảnh | Hệ quả thiết kế |
|---|---|
| Tiền gửi về VN là nuôi cha mẹ / người thân | Khoản ① (khấu trừ người phụ thuộc ở nước ngoài) có thật, là khoản chính |
| Chỉ làm 年末調整 ở công ty, chưa từng tự 確定申告 | Gần như chắc chưa khai ①, nên khoản ② (đòi lại 5 năm cũ) có thật; và mọi thứ cần 確定申告 phải nói rõ "đây là lần đầu" |
| Có NISA / iDeCo | Khoản ④ (phần hạn mức chưa dùng) — app đã có `shelterUsage`, chỉ thiếu lời nhắc cuối năm |
| Đã làm ふるさと納税 | Khoản ③ (trần cá nhân) có thật, và cảnh báo ワンストップ vô hiệu khi nộp 確定申告 là cảnh báo có người cần |

Quyết định:

- **Bốn khoản đợt đầu: ① ② ③ ④.** 医療費控除 để đợt sau (cùng đường 確定申告 như ②, số thường
  nhỏ). Thứ tự hiển thị đúng ①→④ — theo tiền chứ không theo độ dễ code.
- **Trục thời gian là năm dương lịch 1/1–31/12** theo `occurred_on`, KHÔNG phải năm tài
  chính theo `month_start_day`. Đây là trục thời gian thứ hai của app, phải gọi tên riêng
  (mục A).
- **Số thuế bớt được luôn là số ƯỚC** mang `≈` + `<EstimateMark>`; số cuối do công ty /
  sở thuế ra. Luật đã dạy ở `kikinBenefit.ts`: dựng thuế từ luật rồi tin là sai ba lần
  liên tiếp. Ở đây chỉ **thuế suất biên** được suy từ luật (mục D.5), phần còn lại là phép
  nhân — và cả phép nhân đó vẫn mang `≈`.
- **Mọi hằng số luật gắn năm hiệu lực + URL nguồn**, có test đối chiếu số in trong nguồn —
  đúng cách `shakaiHoken.ts` đã làm với bảng 32 bậc.
- **Người nhận tiền là dữ liệu mới**: một bảng nhỏ, mỗi lần gửi chọn người. Lần gửi cũ chưa
  gán thì app **nói "còn N lần chưa biết gửi cho ai"**, không đoán, không chia đều.
- **Khoản ④ không làm lại.** `features/assets/shelter.ts` đã tính "đã nạp / còn lại" theo
  năm dương lịch cho từng tài khoản NISA/iDeCo và trang chi tiết tài khoản đã hiện. Đợt này
  chỉ thêm **lời nhắc cuối năm** và **một dòng trên màn Quyền lợi** đọc lại hàm đó.
- Không có đường ghi nào từ ngoài vào. Không gọi AI. Không đụng MCP. Chi phí vận hành tăng
  thêm: 0.

## Phạm vi

- Thư mục mới `src/features/quyen-loi/`: luật thuần (`rules/`), bốn bộ kiểm thuần, một
  trang, một khung cho Bản tin. Mọi phép tính nằm trong `.ts` không JSX, có test.
- Migration `0056_relatives_remit_recipient.sql` + sửa tay
  [src/types/database.types.ts](../../../src/types/database.types.ts) **cùng commit**.
- `Repo` interface + `supabaseRepo` + `demoRepo`: CRUD người thân, cột người nhận trên
  giao dịch.
- Form gửi tiền ([roleFields.tsx](../../../src/features/transactions/roleFields.tsx), khối
  `remit`): thêm ô "Gửi cho".
- Bộ thông báo: 4 loại mới (mục E.3); vì có loại `action` nên **push cũng nhận** →
  `supabase/functions/push-notify/loadInput.ts` phải nạp thêm đầu vào và chạy
  `npm run bundle:rules`.
- Route mới `/quyen-loi`, tiêu đề "Quyền lợi" trong `PAGE_TITLES`. **Không** thêm tab nav
  (tests/designSystem.test.ts canh đúng bốn tab mobile). Đường vào: khung trên Bản tin +
  link từ từng thông báo.

**Không thuộc đợt này:** 医療費控除 · iDeCo hạn mức theo loại doanh nghiệp · chuẩn bị bộ
giấy (親族関係書類 là việc giấy tờ, app chỉ liệt kê tên giấy) · điền tờ khai e-Tax · đọc chéo
sang nợ / cổ phiếu VN · đẩy lên điện thoại ngoài đường push đã có.

## A. Trục thời gian thứ hai: năm dương lịch

Mọi thứ "theo tháng" trong app đi qua `getMonthRange(key, monthStartDay)` và đây là luật
đúng cho tiêu dùng: người dùng nghĩ tháng theo ngày lương. Thuế Nhật không quan tâm ngày
lương — 所得税, 住民税, ふるさと納税, NISA đều chốt theo **1/1–31/12**.

Hai trục này lệch nhau đúng ở mấy ngày đầu/cuối năm, tức là lệch **đúng ở chỗ hạn chót
nằm**: một lần gửi ngày 28/12 thuộc năm thuế này nhưng thuộc "tháng 1" của app nếu
`month_start_day = 25`. Dùng nhầm trục là báo "đã đủ 38万" khi chưa đủ.

Quy ước:

- Thêm vào [src/lib/dates.ts](../../../src/lib/dates.ts):
  `calendarYearRange(year)` = `getYearRange(year, 1)`, và `calendarYearOf(iso)` =
  `Number(iso.slice(0, 4))`. Hai hàm mỏng, tồn tại để **có tên gọi** — đọc code thấy
  `calendarYearRange` là biết đây cố ý không theo `month_start_day`, không phải ai quên.
- `shelter.ts` đang lọc bằng `occurred_on.startsWith(`${year}-`)` — cùng nghĩa, không sửa,
  nhưng chú thích của nó trỏ về `calendarYearOf` để hai chỗ nói cùng một điều.
- Bộ kiểm **không nhận `monthStartDay`** trong tham số. Không nhận thì không dùng nhầm được.
- Màn Quyền lợi **không hiện bộ đổi tháng** trên top bar (`usesMonth('/quyen-loi') === false`),
  có bộ chọn năm riêng trong trang.

## B. Luật đã kiểm — nguồn, năm hiệu lực, cái app dùng

Tất cả tra ngày 2026-09-02. Mỗi dòng dưới đây thành một hằng số trong
`src/features/quyen-loi/rules/2026.ts` (tên file = năm áp dụng), kèm URL và một test đọc
lại đúng con số. Năm sau luật đổi thì thêm `2027.ts`, không sửa đè.

### B.1 Khấu trừ người phụ thuộc ở nước ngoài (国外居住親族に係る扶養控除)

Nguồn: [NTA taxanswer No.1180](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1180.htm),
[tờ hướng dẫn NTA 令和7年6月](https://www.nta.go.jp/publication/pamph/pdf/0022009-107_01.pdf),
[trang quận Ōta](https://www.city.ota.tokyo.jp/seikatsu/zeikin/kazei/kokugaifuyou.html).

| Tuổi người thân (tính tại 31/12 năm thuế) | Điều kiện tiền | Giấy khi 年末調整 | Khấu trừ 所得税 | Khấu trừ 住民税 |
|---|---|---|---|---|
| dưới 16 | không được 扶養控除 (đã thay bằng 児童手当) | — | 0 | 0 |
| 16–29 | có gửi tiền, **không ngưỡng** | 親族関係書類 + 送金関係書類 | ¥380.000 | ¥330.000 |
| 30–69 | **≥ ¥380.000 trong năm, tính riêng từng người** (trừ du học / khuyết tật) | 親族関係書類 + 38万円送金書類 | ¥380.000 | ¥330.000 |
| 70+ (không sống chung) | có gửi tiền, **không ngưỡng** | 親族関係書類 + 送金関係書類 | ¥480.000 | ¥380.000 |

- Ngưỡng 38万 áp dụng từ 令和5年分 (thu nhập 2023). Trước đó không có ngưỡng, chỉ cần
  送金関係書類 — quan trọng cho khoản ② khi soát năm 2021–2022.
- "Tính riêng từng người": chứng từ phải cho thấy tiền tới **từng** người. Gửi gộp cho một
  người rồi họ chia lại thì chỉ người nhận trực tiếp được tính. Đây là lý do bảng người
  nhận phải là **một người một dòng** và mỗi lần gửi gắn **một** người.
- Người thân phải có 合計所得金額 ≤ ¥580.000/năm (từ 2025; trước là ¥480.000). App **không
  biết** thu nhập của người thân → chỗ này là câu hỏi hiện trên màn, không phải phép tính.
- Khai được **ngay ở 年末調整** bằng cách nộp giấy cho công ty, không bắt buộc 確定申告.
  Khấu trừ 住民税 (theo [Osaka](https://www.city.osaka.lg.jp/zaisei/page/0000370588.html) và
  tổng hợp [moneyforward](https://biz.moneyforward.com/payroll/basic/89456/)).

### B.2 Đòi lại năm cũ (還付申告)

Nguồn: [NTA taxanswer No.2030](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2030.htm).

> 還付申告書は、確定申告期間とは関係なく、その年の翌年1月1日から5年間提出することができます

- Cửa sổ: từ 1/1 năm sau, **5 năm**. Tháng 9/2026 còn nộp được cho **2021–2025**; năm 2021
  hết hạn **31/12/2026**.
- Người làm lương chỉ 年末調整 mà bỏ sót khấu trừ thì dùng đường này (nguồn hướng dẫn:
  [All About](https://allabout.co.jp/gm/gc/14794/), [Money Forward](https://biz.moneyforward.com/payroll/basic/52800/) —
  không phải văn bản NTA nguyên văn cho đúng tình huống này; đủ tin ở mức thiết kế, và app
  chỉ nói "đủ điều kiện để nộp", không nói "chắc chắn được hoàn").

### B.3 Trần ふるさと納税 và ワンストップ

Nguồn: [NTA taxanswer No.1155](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1155.htm),
[bảng tính Chiryū](https://www.city.chiryu.aichi.jp/material/files/group/7/furusato2022.pdf),
[Nagareyama về ワンストップ vô hiệu](https://www.city.nagareyama.chiba.jp/life/1000442/1000444/1043173/1043185.html),
[Cục thuế Tokyo](https://www.nta.go.jp/about/organization/tokyo/topics/furusato_nozei_onestop/index.htm).

```
Trần tự chịu ¥2.000 = 住民税所得割 × 20% ÷ (90% − 所得税率 × 1,021) + ¥2.000
```

- 住民税所得割 = 住民税 cả năm − 均等割 ¥5.000 (từ 令和6年度 gồm 森林環境税 ¥1.000;
  [Sapporo](https://www.city.sapporo.jp/citytax/syurui/shiminzei/kojin_2024zeikai.html)).
  Suất 所得割 10% toàn quốc.
- **ワンストップ特例 bị vô hiệu toàn bộ khi nộp 確定申告 cùng năm.** Người đã ワンストップ rồi
  nộp 確定申告 cho khoản ①/② thì **phải khai lại mọi khoản furusato trong tờ khai đó**, không
  thì mất phần khấu trừ furusato của năm. Tổng tiền được giảm không đổi, chỉ đổi chỗ.

### B.4 NISA

Nguồn: [Cơ quan Dịch vụ Tài chính (FSA)](https://www.fsa.go.jp/policy/nisa2/know/index.html).
つみたて ¥1.200.000/năm · 成長 ¥2.400.000/năm · tổng đời ¥18.000.000 (成長 tối đa
¥12.000.000) · không dùng là mất, không dồn năm sau. `SHELTER_DEFAULT_LIMIT_JPY` trong
`shelter.ts` đã đúng hai số đầu; đợt này chỉ trỏ chú thích về nguồn.

### B.5 Thuế suất biên 所得税 (để ước tiền tiết kiệm)

Nguồn: NTA taxanswer No.2260 (bảng 速算表, hiệu lực từ 2015) + 復興特別所得税 2,1%
(No.2507). Bảy bậc 5 / 10 / 20 / 23 / 33 / 40 / 45%. Ghi hằng số kèm số trừ nhanh của
từng bậc; test đọc lại đúng bảy dòng.

## C. Dữ liệu

### C.1 Bảng mới `relatives` — người thân nhận tiền

```sql
create table public.relatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  -- Năm sinh, BẮT BUỘC: tuổi quyết định ngưỡng 38万 và mức khấu trừ (B.1). Không có
  -- năm sinh thì bộ kiểm không nói được gì về người này, nên không cho lưu thiếu.
  birth_year smallint not null check (birth_year between 1900 and 2100),
  relationship text not null check (relationship in
    ('parent','spouse','child','sibling','grandparent','other')),
  -- Nước cư trú, ISO-2. Mặc định VN vì đó là bài toán của chủ app; để cột vì luật chỉ
  -- áp cho người KHÔNG cư trú ở Nhật — người thân đã sang Nhật thì rẽ sang luật khác.
  country text not null default 'VN',
  is_archived boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
```

RLS `own rows` như 0055. Không có cột thu nhập của người thân: đó là câu hỏi màn hình
hỏi mỗi năm, không phải dữ liệu app giữ.

### C.2 Cột mới `transactions.remit_recipient_id uuid null references relatives(id) on delete set null`

- `on delete set null`, không `cascade`: xoá một người thân không được xoá lịch sử gửi
  tiền. Lần gửi trở về "chưa biết gửi cho ai".
- Không backfill. `null` = chưa gán, và màn hình đếm số này ra.
- **View `account_balances` không cần dựng lại — đã kiểm 2026-09-03:** view (0053) đọc
  `transactions` qua `left join` và chỉ đụng `t.type`, `t.account_id`, `t.to_account_id`,
  `t.amount`, `t.to_amount`, `t.is_refund` bằng tên; không có `t.*`. Thêm cột vào
  `transactions` không đổi gì ở view. Ghi lại điều này ở đầu file migration, đúng lệ 0050/0051.
- `database.types.ts`: thêm `RelativeRow`, bảng `relatives`, cột trên `TransactionRow`
  và `Insert`/`Update` của `transactions`. Cùng commit với migration.

### C.3 `profiles.fuyo_claimed_years smallint[] not null default '{}'`

Năm nào người dùng đã **nộp giấy / đã khai** khoản ① thì đánh dấu; app thôi nhắc năm đó.
Mảng năm chứ không phải bảng, vì một người một hồ sơ mỗi năm và không truy vấn nào nối
theo nó. Không có cột này thì khoản ② nhắc mãi "5 năm chưa khai" sau khi người dùng đã
khai — thông báo không có đường tắt là thông báo bị tắt.

### C.4 Danh mục ふるさと納税 — theo TÊN, không thêm cột

Cùng lối `TAX_PARENT_NAME`: hằng `FURUSATO_CATEGORY_NAME = 'ふるさと納税 (寄附)'`, tìm theo
tên trong `categories`. Chưa có thì màn Quyền lợi hiện nút "Tạo danh mục" (một
`createCategory` thường, `kind: 'expense'`, `need_level: 'flexible'`). Không có danh mục
thì khoản ③ hiện trần nhưng phần "đã gửi" nói thẳng "chưa có danh mục để đếm".

### C.5 Repo

Thêm vào interface `Repo` và **cả hai** bản: `getRelatives()`, `createRelative()`,
`updateRelative()`, `archiveRelative()`, `setRemitRecipient(txIds, relativeId)` (gán hàng
loạt cho lần gửi cũ). Hook + invalidation trong `queries.ts` ngay cạnh nhau. Feature không
gọi repo trực tiếp.

## D. Bốn bộ kiểm thuần

Tất cả nằm ở `src/features/quyen-loi/*.ts`, không JSX, không `new Date()` (nhận
`todayISO`), không `monthStartDay`. Mỗi bộ trả một `KetLuan` cùng hình dạng để màn hình
và bộ thông báo đọc chung:

```ts
export interface KetLuan {
  id: 'fuyo' | 'refund' | 'furusato' | 'shelter'
  year: number
  /** 'du' = đủ điều kiện/đã xong · 'thieu' = còn việc + còn hạn · 'het-han' · 'thieu-du-lieu' */
  trang_thai: 'du' | 'thieu' | 'het-han' | 'thieu-du-lieu'
  /** Tiền ƯỚC tiết kiệm được (minor JPY); null khi không nói được. Luôn hiện với ≈. */
  tiet_kiem_uoc: number | null
  /** Ngày hạn ISO; null = không có hạn */
  han: string | null
  /** Câu việc-cần-làm, một câu, có động từ. */
  viec: string
  /** Vì sao thiếu dữ liệu / vì sao là số ước — hiện dưới `EstimateMark`. */
  ly_do: string[]
}
```

### D.1 `fuyo.ts` — khấu trừ người phụ thuộc (khoản ①)

Đầu vào: `relatives`, giao dịch `is_remittance` của năm, `accounts` (để biết tiền tệ), `rates`.
Số gửi của một lần = `amount − remit_fee_jpy` (quan hệ chốt của sổ, xem đầu
`remitDerive.ts`); tài khoản nguồn không phải JPY thì `convertToBase` sang JPY, thiếu tỷ
giá thì **loại và bật cờ** — luật chung 69 file của repo, không quy 1:1.

Mỗi người thân, mỗi năm:

| Trường | Cách tính |
|---|---|
| `tuoi` | `year − birth_year` (tuổi tại 31/12, đủ cho luật này) |
| `nhom` | `<16` / `16-29` / `30-69` / `70+` theo B.1 |
| `da_gui` | Σ số gửi các lần gắn người này trong năm |
| `nguong` | ¥380.000 nếu `30-69`, ngược lại 0 |
| `con_thieu` | `max(0, nguong − da_gui)` |
| `thang_con_lai` | 12 − tháng của `todayISO` (0 ở tháng 12) |
| `khau_tru` | 所得税 / 住民税 theo bảng B.1; 0 nếu `<16` hoặc (`30-69` và `da_gui < nguong`) |
| `tiet_kiem_uoc` | `khau_tru_shotoku × suat_bien × 1,021 + khau_tru_jumin × 10%` |

Cộng thêm: `chua_gan` = số lần gửi trong năm có `remit_recipient_id = null` và tổng của
chúng. Có `chua_gan > 0` thì kết luận cả khoản là `thieu-du-lieu` **kể cả khi** có người đã
đủ — vì số đủ đó có thể còn cao hơn, và số của người khác có thể đang bị đếm thiếu.

Câu việc: *"Còn ¥X để mẹ đủ 38万 — 3 tháng nữa"* khi thiếu; *"Nộp 親族関係書類 +
送金関係書類 cho công ty trước 年末調整"* khi đủ; *"Gán người nhận cho 7 lần gửi"* khi thiếu
dữ liệu. Câu nào cũng nói được bước kế tiếp — đó là điều kiện để nó được là `action`.

### D.2 `refund.ts` — đòi lại năm cũ (khoản ②)

Chạy `fuyo.ts` cho từng năm trong `[today.year − 5, today.year − 1]`, bỏ năm nằm trong
`fuyo_claimed_years`. Với năm ≤ 2022 dùng bảng luật **không ngưỡng** (B.1, trước 令和5年分)
— tức là `rules/2022.ts` tồn tại chỉ để nói điều đó. Năm nào có ít nhất một người
`khau_tru > 0` thì vào danh sách, kèm hạn `31/12/(year + 5)`.

Kết luận: *"3 năm đủ điều kiện nộp 還付申告, tổng ≈ ¥Y; năm 2021 hết hạn 31/12/2026"*.
Nói rõ đây là **lần đầu tự khai** và ワンストップ của năm đó (nếu có) sẽ vô hiệu (B.3) —
cảnh báo này in ngay trong kết luận, không để người dùng tự đi tìm.

### D.3 `furusato.ts` — trần và phần còn lại (khoản ③)

Đầu vào: giao dịch danh mục `Thuế cư trú (住民税)` và `Thuế thu nhập (所得税)` (đã có từ
phiếu lương), giao dịch danh mục `FURUSATO_CATEGORY_NAME`, năm.

- `jumin_nam` = Σ 住民税 12 tháng gần nhất có phiếu (không phải năm dương lịch: 住民税
  cho thu nhập năm Y được trừ từ 6/(Y+1) tới 5/(Y+2)). `shotoku_wari ≈ jumin_nam − 5.000`.
- Trần theo công thức B.3 với `suat_bien` từ D.5.
- `da_gui` = Σ danh mục furusato trong năm dương lịch. `con_lai = tran − da_gui`.
- `ly_do` luôn có: *"Tính trên 住民税 của thu nhập năm trước; lương tăng thì trần thật
  cao hơn"*. Đây là cách mọi bộ mô phỏng furusato cũng ước, và phải nói ra.
- Cờ `onestop_rui_ro = true` khi khoản ①/② đang đề nghị nộp 確定申告 trong cùng năm → câu
  việc đổi thành *"Nếu nộp 確定申告 cho khoản phụ thuộc thì khai cả N khoản furusato vào
  đó, ワンストップ sẽ vô hiệu"*. Đây là phát hiện **chỉ có khi ghép hai khoản**, và là lý do
  bốn bộ kiểm nằm chung một thư mục thay vì rải ra bốn nơi.

### D.4 `shelterYearEnd.ts` — phần NISA chưa dùng (khoản ④)

Gọi `shelterUsage()` sẵn có cho từng tài khoản `tax_shelter != null`, năm dương lịch hiện
tại. Không tính lại gì. Chỉ đóng gói thành `KetLuan`: `con_lai` tổng, hạn 31/12, và **chỉ
lên tiếng từ 1/10** — trước đó "còn ¥2.000.000 hạn mức" là chuyện bình thường của mọi
tháng, không phải phát hiện.

### D.5 `marginalRate.ts` — thuế suất biên ước

Không có 源泉徴収票 trong app, nhưng có Σ 所得税 12 tháng (kể cả 過不足税額 của 年末調整,
`nhap.ts` đã map cả hai về cùng danh mục) — đó chính là thuế năm thực nộp. Đảo bảng 速算表
(B.5): tìm bậc mà `thuế(x) × 1,021 = Σ 所得税` có nghiệm → thuế suất biên của bậc đó.

Ưu điểm so với dựng từ lương gộp: không cần biết 給与所得控除, 社会保険料, 基礎控除 hay các
控除 riêng của người dùng — chính những thứ đã làm `kikinBenefit` dựng từ luật lệch ba lần.
Nhược điểm nói thẳng trong `ly_do`: sai khi năm đó đã có khấu trừ đặc biệt (定額減税 2024 —
`nhap.ts` đã tách `DINH_MUC_GIAM` nên cộng lại được), và luôn là ước.

Thiếu phiếu lương (< 12 tháng có 所得税) → `suat_bien = null` → mọi `tiet_kiem_uoc` là
`null`, màn hiện "nhập phiếu lương để ước tiền tiết kiệm" thay vì một con số.

## E. Màn hình và đường vào

### E.1 Trang `/quyen-loi`

Theo công thức tám bước của [docs/design-system.md](../../design-system.md). `<PageHeader>`
"Quyền lợi" + bộ chọn năm (`<Select>`, mặc định năm nay). Bốn khối theo thứ tự ①→④, mỗi
khối một `<SectionTitle>`, cấu trúc giống nhau:

1. **Một câu kết luận** — chính `viec` của `KetLuan`, chữ lớn.
2. **Một con số** — `tiet_kiem_uoc` qua `<Money>` + `<EstimateMark reason=ly_do>`; hoặc
   `con_thieu`; số nào là tiền thì `<Money>`, tháng/năm/lần thì `<Num>`.
3. **Bảng chi tiết** — khoản ①: một dòng một người (tên, tuổi, đã gửi, còn thiếu, giấy
   cần); khoản ②: một dòng một năm; khoản ③: trần / đã gửi / còn lại; khoản ④: một dòng
   một tài khoản.
4. **Nguồn luật** — một dòng nhỏ "Theo NTA No.1180, áp dụng từ 令和5年分", link ra ngoài.
   Người dùng phải kiểm được app đang dựa vào cái gì.
5. **Nút** — khoản ①: "Gán người nhận" (mở sheet E.2) và "Đã nộp giấy năm này" (ghi
   `fuyo_claimed_years`); khoản ③: "Tạo danh mục" khi chưa có.

Không có gì trên trang này tự gọi mạng, không AI. Mở trang là tính từ cache TanStack đã có.

### E.2 Gán người nhận

- Trong form gửi tiền (`roleFields.tsx` khối `remit`): ô "Gửi cho" là `<Select>` danh sách
  người thân + mục "+ Thêm người…" mở sheet tạo nhanh (tên, năm sinh, quan hệ). **Mặc
  định = người của lần gửi gần nhất**, để nguyên tắc dưới 5 giây không đổi: người gửi đều
  cho một người thì không phải bấm thêm gì.
- Sheet "Gán người nhận" từ trang Quyền lợi: liệt kê lần gửi chưa gán của năm đang xem
  (ngày, số tiền, ghi chú), chọn nhiều dòng → chọn người → `setRemitRecipient`. Ghi chú
  của lần gửi thường có tên người ("gửi mẹ") — hiện nguyên văn để người dùng gán nhanh,
  **không** tự khớp tên bằng máy.

### E.3 Thông báo — 4 loại mới

| type | kind | Khi nào | Câu | `to` |
|---|---|---|---|---|
| `benefit-fuyo-shortfall` | action | có người `30-69` còn thiếu, còn ≥ 1 tháng | "Còn ¥X để {tên} đủ 38万 · {n} tháng" | `/quyen-loi` |
| `benefit-remit-unassigned` | action | `chua_gan > 0` trong năm nay | "{n} lần gửi tiền chưa gán người nhận" | `/quyen-loi` |
| `benefit-refund-years` | action | ≥ 1 năm cũ đủ điều kiện, chưa đánh dấu đã khai | "{n} năm cũ có thể đòi lại ≈ ¥Y · năm {y} hết hạn 31/12" | `/quyen-loi` |
| `benefit-year-end` | info | từ 1/10: furusato còn ≥ ¥10.000 hoặc NISA còn > 0 | "Trước 31/12: furusato còn ≈ ¥A, NISA còn ¥B" | `/quyen-loi` |

- Mức: `benefit-fuyo-shortfall` `high` khi ≤ 2 tháng, `medium` khác; `refund-years` `high`
  khi có năm hết hạn trong năm nay; `remit-unassigned` `low`.
- Vị trí trong `NOTIFICATION_TYPES`: sau `lifetime-drift`, trước hai luật độ-tin-cậy —
  cùng lý lẽ đã ghi ở đó: không gấp theo ngày, nhưng có hạn thật.
- `NOTIFICATION_META`: `source: 'Từ Quyền lợi · năm {year}'`, `badge: 'QUYỀN LỢI'`, `cta`
  bắt buộc cho ba loại `action` ("Xem", "Gán người", "Xem năm cũ").
- Mã việc-cần-làm **không kèm kỳ** (vòng đời mục E của spec thông báo): thiếu → đủ thì mã
  biến mất và trạng thái được dọn; năm sau lại thiếu thì đỏ như mới.

**Đầu vào cho bộ luật:** `NotificationInput` nhận thêm một cục **đã tính sẵn**
`benefits: KetLuan[]` — không nhận `relatives` + giao dịch cả năm thô, vì `recentTxs` chỉ
có 90 ngày và không nên phình lên 365 vì một luật. `useNotifications.ts` gọi bốn bộ kiểm
rồi đưa kết quả vào; `push-notify/loadInput.ts` làm y vậy phía server bằng chính bốn hàm
đó qua `serverBundle.ts` → `npm run bundle:rules` → commit `_rules.js`. Test
`tests/pushBundle.test.ts` giữ hai bên không lệch.

### E.4 Khung trên Bản tin

`QuyenLoiPanel` đặt sau `TodoPanel`, trước `PaydayStrip`: ba dòng tối đa (①, ③, ④ của
năm nay), mỗi dòng một câu + một số, bấm là sang `/quyen-loi`. Khi cả ba đều `du` hoặc
chưa tới mùa (④ trước 1/10) thì thu lại **một dòng**: *"Quyền lợi năm 2026: không có gì
cần làm"* — có, cũng là câu trả lời, và là lý do khung không biến mất.

Không lặp lại việc đã nằm trong `TodoPanel` (thông báo `action` đã ở đó); khung này nói
**tình trạng**, TodoPanel nói **việc**.

## F. Chế độ demo

`demoRepo` thêm 2 người thân (mẹ 1958, em 1995) và gán người nhận cho các lần gửi mẫu sao
cho: mẹ (70+) `du`, em (30-69) `thieu` khoảng ¥120.000, và **một** lần gửi để `null` — để
cả ba trạng thái của khoản ① nhìn thấy được mà không cần Supabase. Tài khoản NISA mẫu đã có
`tax_shelter`; danh mục furusato mẫu thêm một dòng ¥30.000.

## G. Kiểm thử

Theo lệ repo: `.test.ts` cạnh file, Vitest.

- `rules/2026.test.ts`: từng hằng số bằng đúng số in trong nguồn B.1–B.5 (bảng khấu trừ
  4 nhóm × 2 loại thuế, ngưỡng 380.000, 均等割 5.000, 7 bậc 速算表, hạn mức NISA).
- `fuyo.test.ts`: bốn nhóm tuổi; biên 29/30 và 69/70 tính tại 31/12; `da_gui` trừ phí;
  thiếu tỷ giá → loại + cờ; `chua_gan > 0` át trạng thái `du`; tháng 12 → `thang_con_lai = 0`.
- `refund.test.ts`: cửa sổ 5 năm đúng biên (9/2026 → 2021..2025); năm ≤ 2022 không ngưỡng;
  năm trong `fuyo_claimed_years` bị bỏ; hạn `31/12/(y+5)`.
- `furusato.test.ts`: công thức B.3 với một ví dụ số từ bảng Chiryū (23,558% ở bậc 5%);
  thiếu 住民税 → `thieu-du-lieu`; `onestop_rui_ro` chỉ bật khi có đề nghị 確定申告 cùng năm.
- `marginalRate.test.ts`: đảo đúng bảy bậc; Σ 所得税 = 0 → null; < 12 tháng → null.
- `shelterYearEnd.test.ts`: trước 1/10 im; sau 1/10 tổng `remaining`.
- **Bất biến quan trọng nhất:** với cùng một bộ giao dịch, Σ `da_gui` của mọi người thân +
  tổng lần chưa gán **= `totalSentJpy`** của `remittance/aggregate.ts` cho năm đó. Lệch là
  hai chỗ đang lọc `is_remittance` hoặc trừ phí khác nhau — đúng loại lỗi `7dc3834`.
- `tests/designSystem.test.ts` vẫn phải xanh: không `<h1>`, không `<select>`, không giá
  trị tuỳ ý; mọi số qua `<Money>`/`<Num>`.
- Mở app xem thật ở chế độ Sáng và 375px — ba thứ `npm test` không thấy (CLAUDE.md).

## H. Hỏng thì sao

| Tình huống | Xử lý |
|---|---|
| Luật đổi năm sau | Thêm `rules/2027.ts`; bộ kiểm chọn file theo `year`. Không có file cho năm đó → dùng năm gần nhất **và nói ra** trong `ly_do` |
| Người thân không có năm sinh | Không lưu được (constraint). Người thân cũ trước migration: không có (bảng mới) |
| Lần gửi từ tài khoản VND/USD | `convertToBase` sang JPY; thiếu tỷ giá → loại, cờ, `≈` |
| Chưa nhập phiếu lương | `suat_bien = null` → không có số tiết kiệm, có đủ phần còn lại (còn thiếu bao nhiêu, hạn) |
| Người dùng đã khai ở công ty mà app còn nhắc | Nút "Đã nộp giấy năm này" → `fuyo_claimed_years` |
| Người thân đã sang Nhật | Đặt `country = 'JP'` → bộ kiểm bỏ qua người này và nói "luật người cư trú, ngoài phạm vi" |

## I. Đã biết, cố ý chưa làm

- **医療費控除.** Cùng đường 確定申告 như ②; làm sau khi ② đã chạy thật một mùa.
- **Thu nhập của người thân** (điều kiện ≤ ¥580.000) — chỉ hỏi bằng chữ trên màn, không
  lưu, không kiểm.
- **iDeCo hạn mức theo loại doanh nghiệp** (có 企業年金 thì khác) — `shelter_annual_limit`
  do người dùng tự đặt, giữ nguyên.
- **Đọc lại 源泉徴収票** để thay ước bằng số thật — chờ có file thật để bóc, cùng cách
  `phieu-luong/boc.ts`.
- **Cảnh báo tỷ giá gửi tiền so với thị trường** (`fx_history`) — thuộc câu hỏi khác
  ("gửi lúc nào"), không phải "bỏ lỡ quyền lợi".
- Không đẩy phát hiện ra ngoài đường push đã có; không MCP; không AI.

## J. Thứ tự thi công (mỗi bước một commit, message không dấu)

1. `rules/2026.ts` + `rules/2022.ts` + `calendarYearRange` + `marginalRate.ts` — hằng số
   và test đối chiếu nguồn. Chưa có gì hiện ra, nhưng mọi số sau đó đứng trên đây.
2. Migration 0056 + `database.types.ts` + Repo (cả hai bản) + hooks. Demo seed (F).
3. `fuyo.ts`, `refund.ts`, `furusato.ts`, `shelterYearEnd.ts` + test, kể cả bất biến G.
4. Ô "Gửi cho" trong form gửi tiền + sheet gán hàng loạt.
5. Trang `/quyen-loi` + `QuyenLoiPanel` trên Bản tin. Mở app kiểm Sáng/375px.
6. Bốn loại thông báo + `loadInput.ts` + `npm run bundle:rules` + commit `_rules.js`.

Bước 1–3 không đụng giao diện và có thể chạy `detect_changes()` gọn; bước 4–6 mở
`docs/design-system.md` trước.
