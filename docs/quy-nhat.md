# Tự cập nhật giá quỹ đầu tư Nhật (投資信託 / NISA)

Edge function `fund-refresh` chạy mỗi tối sau khi quỹ Nhật công bố 基準価額, làm hai
việc: (1) hút giá mới nhất cho **cả danh bạ quỹ** và ghi vào `fund_prices`, (2) tính lại
giá trị thị trường của từng tài khoản đầu tư **JPY** có sổ lệnh quỹ và ghi vào
`account_valuations` — bảng mà cả app (tổng tài sản, lãi/lỗ, biểu đồ, thông báo) đã đọc
sẵn từ trước, nên không cần sửa gì ở phía đọc.

Đây là đi lại con đường của [cổ phiếu Việt Nam](co-phieu-viet-nam.md) — cron → edge
function → bảng giá → tự ghi `account_valuations` — với nguồn giá khác, một đơn vị đo
khác, và **một mô hình giá vốn khác** (xem mục "Vì sao không dùng lại `brokerCash`" ở
[bản thiết kế](superpowers/specs/2026-08-12-quy-nhat-tu-cap-nhat-design.md)).

## Nói rõ trước: không có "live" theo phút

Quỹ đầu tư Nhật **không có giá theo thời gian thực**. Mỗi quỹ công bố đúng **một**
基準価額 cho mỗi ngày làm việc, vào khoảng 19:00 giờ Nhật. App Rakuten cũng chỉ hiện lần
công bố gần nhất — dòng "cập nhật hôm nay" trên đó là giờ app đồng bộ, không phải giờ giá
đổi. Đây từng là câu hỏi thật của chủ app; câu trả lời trung thực là **không** track
được live, chỉ mỗi ngày một lần.

"Tự cập nhật" ở đây nghĩa là **tự cập nhật mỗi ngày làm việc**, không hơn. Nguồn cũng có
thể trễ hơn app Rakuten tối đa **một phiên** (xem mục dưới) — không có cách khắc phục,
chỉ có cách không nói dối về nó: `valued_on` luôn lấy đúng `nav_date` của giá, không đóng
dấu "hôm nay" lên giá cũ.

## 1. Nguồn giá và bảng đo thật

Thư viện tra cứu của Hiệp hội Đầu tư Tín thác Nhật Bản (投資信託協会):

```
https://toushin-lib.fwg.ne.jp/FdsWeb/FDST030000/csv-file-download?isinCd=<ISIN>&associFundCd=<協会コード>
```

Miễn phí, không khoá, không đăng nhập. Đo bằng `curl`, ngày **2026-08-12**:

| Phép đo | Kết quả |
|---|---|
| Gọi đủ hai tham số | `200`, CSV ~20 KB, đủ lịch sử từ ngày lập quỹ |
| Header CSV | `年月日,基準価額(円),純資産総額(百万円),分配金,決算期` |
| Một dòng | `2026年08月10日,20053,1175583,,` |
| Mã hoá | **Shift-JIS** |
| `Content-Type` server khai | `text/plain; charset=utf-8` — **SAI**, xem bẫy ① dưới |
| Xuống dòng | CRLF |
| `Content-Disposition` | `attachment;filename=lst_standard_price_20260812183619.csv` — dấu thời gian là **giờ Nhật** |
| Thiếu một trong hai tham số | **`200`** + body `{"statusCode":null}` (19 byte) — xem bẫy ② dưới |
| Cả hai mã sai | `500` + cùng body |
| Header CORS | **không có** → trình duyệt không gọi thẳng được, bắt buộc qua edge function |

### Độ trễ phải chấp nhận

Đo lúc 18:36 giờ Nhật ngày 12/08: phiên mới nhất trong CSV là **10/08** (11/08 là 山の日,
nghỉ lễ, không có 基準価額). Nguồn trễ **tối đa một phiên** so với app Rakuten — không xử
lý bằng cách im lặng dùng giá cũ rồi đóng dấu "hôm nay".

## 2. Danh bạ 8 quỹ

Seed ở migration [0045_fund_prices_trades.sql](../supabase/migrations/0045_fund_prices_trades.sql).
Mọi mã đã gọi thật ngày 2026-08-12, đều trả `200`, phiên mới nhất **2026-08-10**:

| Tên chính thức | ISIN | 協会コード |
|---|---|---|
| 楽天・プラス・S&P500インデックス・ファンド | `JP90C000Q2U6` | `9I31223A` |
| 楽天・プラス・NASDAQ-100インデックス・ファンド | `JP90C000QF22` | `9I314241` |
| 楽天・全米株式インデックス・ファンド（楽天・VTI） | `JP90C000FHD2` | `9I312179` |
| eMAXIS Slim 全世界株式（オール・カントリー） | `JP90C000H1T1` | `0331418A` |
| eMAXIS Slim 米国株式（S&P500） | `JP90C000GKC6` | `03311187` |
| eMAXIS Slim 先進国株式インデックス（除く日本） | `JP90C000ENC5` | `03319172` |
| eMAXIS Slim 国内株式（日経平均） | `JP90C000FXV1` | `03311182` |
| SBI 日本株4.3ブル | `JP90C000FSK4` | `8931317C` |

Thêm quỹ mới = thêm một hàng bằng SQL vào `funds` (chưa có UI). Quỹ mới có giá **ngay**
ở lượt cron kế tiếp — việc 1 hút cho cả danh bạ, không chỉ quỹ đang giữ.

## 3. Bốn cái bẫy

Chép từ [bản thiết kế](superpowers/specs/2026-08-12-quy-nhat-tu-cap-nhat-design.md), mỗi
cái kèm cách nhận biết khi debug:

**① File là Shift-JIS dù server khai UTF-8.** Đọc bằng `res.text()` ra chữ rác ở cột
ngày và cột tên quỹ, trong khi cột **số** vẫn đúng — nên phép tính tiền vẫn ra số trông
hợp lý, chỉ ngày/tên hỏng. **Cách nhận biết:** `nav_date` hoặc tên quỹ trong log toàn ký
tự lạ (mojibake) trong khi `nav` vẫn là một số hợp lý. Phải `arrayBuffer()` +
`new TextDecoder('shift_jis')` — nhãn `'shift_jis'`, **không** phải `'cp932'` (Node/Deno
không hỗ trợ nhãn đó, đã đo).

**② Thiếu tham số trả `200`, không phải `4xx`.** Body là `{"statusCode":null}`, 19 byte
JSON. Kiểm bằng `res.ok` sẽ nghĩ là thành công rồi parse ra 0 dòng. **Cách nhận biết:**
`funds.last_status = 'ma-sai'` cho một mã cụ thể mãi không đổi — không phải lỗi mạng
(`loi-mang`), mà là gọi thiếu/sai tham số. Điều kiện nhận đúng: **dòng đầu decode ra đúng
`年月日`**, không phải mã HTTP.

**③ Không có CORS.** Bắt buộc gọi qua edge function, không gọi thẳng được từ trình duyệt
của app. **Cách nhận biết:** gọi thử URL từ console trình duyệt báo lỗi CORS/network,
không có header `Access-Control-Allow-Origin` trong response. Giống Yahoo và SSI (xem
[co-phieu-viet-nam.md](co-phieu-viet-nam.md)) — đừng mất một lượt đi thử gọi thẳng.

**④ `口数 × 基準価額 ÷ 10.000` KHÔNG bằng số tiền đã trừ.** Đo trên sao kê thật:
`28.429 × 17.588 ÷ 10.000 = 50.000,93` trong khi số tiền bị trừ là **50.000**. **Cách
nhận biết:** giá vốn suy từ `units × nav` trôi dần so với sao kê Rakuten sau nhiều lệnh —
lệch dưới 1 yên mỗi lệnh nhưng 136 lệnh thì thấy được, và có phí mua thì lệch hẳn. Chiều
suy diễn mới là chỗ chết: Rakuten tính **口数 TỪ số tiền**, không phải ngược lại. Vì vậy
`fund_trades` giữ **cả** `units` và `amount`; giá vốn luôn lấy `amount`, không suy từ
`units × nav`.

## 4. Quỹ đổi tên

Rakuten đổi tên loạt 「楽天・プラス」 ngày **2024-10-17**
([thông báo](https://www.rakuten-sec.co.jp/web/info/info20241017-01.html)), nên **một
quỹ xuất hiện dưới hai tên trong cùng một file sao kê**: sao kê giữ tên cũ ở dòng cũ, tên
mới ở dòng mới. `楽天・全米株式インデックス・ファンド` cũng đổi — 愛称 từ
`楽天・バンガード・ファンド（全米株式）` sang `楽天・VTI`, tên chính thức giữ nguyên.

Chứng minh bằng số, không phải bằng suy đoán — tra mã của tên **MỚI** (`9I31223A`) ra
đúng đơn giá mà sao kê ghi cho tên **CŨ**:

| Ngày 約定 | Đơn giá trên sao kê (tên cũ) | NAV tra bằng mã tên mới (`9I31223A`) |
|---|---|---|
| 2024-08-07 | 12.355 | **12.355** |
| 2024-08-09 | 12.596 | **12.596** |

Trùng khớp. Ghép theo tên một cách ngây thơ (không qua bảng bí danh) cho ra **hai vị thế
âm**: S&P500 dư `−19.848 口`, VTI dư `−10.232 口`.

> **Bất biến "không quỹ nào 口数 âm" là chốt canh.** Đây chính là phép thử vừa bắt được
> cả hai trường hợp đổi tên ở trên — bảng bí danh thiếu một dòng thì số âm hiện ra ngay ở
> bước xử lý, không cần ai đi soi bằng tay.

Vì vậy bảng bí danh nằm trong **DB** (`fund_aliases`), không phải hằng số trong script:
lần sau Rakuten đổi tên nữa thì thêm một hàng, không sửa code. Migration 0045 seed **8
quỹ + 10 bí danh** (8 tên hiện hành + 2 tên CŨ của hai quỹ đã đổi tên). `scripts/nhap-sao-ke-rakuten.mjs`
tự dừng và nêu đúng tên quỹ lạ nếu bảng bí danh thiếu dòng — xem mục "Cách xem log" dưới
để biết edge function xử lý ca này thế nào (`so-lenh-co-lo-hong`).

## 5. Kiến trúc

```
supabase/migrations/0045_fund_prices_trades.sql   ← funds, fund_aliases, fund_prices,
                                                     fund_trades + seed 8 quỹ + 10 bí danh

src/features/assets/fundHoldings.ts               ← hàm THUẦN: fundHoldingsFromTrades
                                                     (口数/giá vốn từ sổ lệnh, oversold),
                                                     fundValue (chia NAV_UNITS ở ĐÚNG một
                                                     chỗ), sessionNavs (gom bảng giá về
                                                     một phiên, nêu tên quỹ ở phiên cũ),
                                                     planFundBackfill (bộ luật của chế độ
                                                     lấp lịch sử — giữ CẢ BA chốt "thà
                                                     không ghi gì": trộn hai loại sổ lệnh,
                                                     sổ lệnh có lỗ hổng, quỹ đang giữ
                                                     thiếu lịch sử giá)
src/features/assets/serverBundleFunds.ts          ← xuất bốn hàm trên (npm run bundle:rules)

supabase/functions/fund-refresh/navs.ts           ← fetchFundNavs + parseNavCsv + parseNavHistory
                                                     (hàm thuần, test bằng file mẫu) +
                                                     buildFundFetchOrder (quỹ đang giữ
                                                     trước, phần còn lại của danh bạ sau)
supabase/functions/fund-refresh/loadInput.ts      ← đọc funds/fund_trades/account_balances,
                                                     xếp thành FundAccount[]; KHÔNG tự tính gì
supabase/functions/fund-refresh/index.ts          ← ba chế độ trong một Deno.serve: cron
                                                     (việc 1 hút NAV, việc 2 ghi valuations),
                                                     lấp lịch sử, kiểm mã
supabase/functions/fund-refresh/_funds.js         ← gói từ serverBundleFunds.ts

scripts/nhap-sao-ke-rakuten.mjs                   ← script CHẠY TAY, một lần: đọc 受渡履歴
                                                     CSV, lọc lệnh quỹ, ghép bí danh, kiểm
                                                     口数 âm, xem trước rồi mới ghi
scripts/setup-fund-cron.mjs                       ← hẹn cron, gọi thử trước khi in SQL
                                                     (khuôn từ setup-stock-cron.mjs)

src/features/assets/FundHoldingsSection.tsx       ← khu "Danh mục quỹ" ở trang chi tiết
                                                     tài khoản (chỉ tài khoản JPY)
src/features/assets/FundTradeFormSheet.tsx        ← sheet ghi/sửa lệnh quỹ
```

**Tiền lệ khoá:** `scripts/nhap-sao-ke-rakuten.mjs` là script `.mjs` **đầu tiên** trong
repo đọc `SUPABASE_SERVICE_ROLE_KEY` từ `.env.local` — ba edge function kia
(`stock-refresh`, `push-notify`, `fund-refresh`) đọc `Deno.env.get(...)` từ secret store
của Supabase, cơ chế khác hẳn. Cách này chỉ dành cho script **chạy tay, một lần, ghi vào
bảng của chính chủ tài khoản** (xem lý do đầy đủ ở đầu file, khối chú thích `KHOÁ`).
Script nào ghi vào bảng của **nhiều** user thì **không** được đi đường này — service role
bỏ qua RLS hoàn toàn, sai một dòng code là ghi nhầm sang dữ liệu của người khác.

### Vì sao là function RIÊNG, không nhét vào `stock-refresh`

Khác nguồn, khác cách giải mã, khác đơn vị đo, khác mô hình giá vốn, khác giờ chạy. Và
nặng nhất: một lô Yahoo hỏng sẽ kéo cả lượt `stock-refresh` xuống `500`, làm mất luôn
phần quỹ Nhật vốn chẳng liên quan. Hai function riêng, hai cron riêng, hai bán kính nổ
riêng. Mỗi function có một file mặt tiếp xúc RIÊNG với DB (`serverBundle.ts` cho
stock-refresh, `serverBundleFunds.ts` cho fund-refresh) — tách hẳn, không dùng chung,
đúng để bản gói của quỹ không kéo theo `HOSE_SYMBOLS` (403 mã) của phần cổ phiếu (xem đầu
file [serverBundleFunds.ts](../src/features/assets/serverBundleFunds.ts)). Mỗi function
gói ra file JS riêng của mình: `_holdings.js` cho stock-refresh, `_funds.js` cho
fund-refresh.

### Vì sao không dùng lại `brokerCash` (mô hình giá vốn khác cổ phiếu)

Ba chỗ khác bản chất, nói ở đầu [fundHoldings.ts](../src/features/assets/fundHoldings.ts):

1. **Đơn vị.** 基準価額 niêm yết trên 10.000 口, không phải trên một đơn vị. Chia
   `NAV_UNITS` (10.000) ở đúng **một** chỗ: `fundValue()`.
2. **Giá vốn.** Quỹ lấy thẳng số tiền thật đã trừ (`amount`), không suy từ
   `units × nav ÷ 10.000` — xem bẫy ④ ở mục 3.
3. **Tiền mặt.** Không có. Rakuten tự quét sạch tiền dư về 楽天銀行
   (自動出金(スイープ)), nên tài khoản không giữ tiền nhàn rỗi. Mượn `brokerCash` ở đây
   sẽ ra số âm, van an toàn chặn, và cron chạy mỗi ngày mà **không bao giờ** ghi được gì —
   thất bại im lặng. Vì vậy `boQua` của `fund-refresh` **không có** lý do
   `tien-chua-dau-tu-am` (khác `stock-refresh`) — xem mục 7.

### Edge function `fund-refresh`: ba chế độ, `--no-verify-jwt`

`index.ts` (~330 dòng) có **ba** chế độ trong một `Deno.serve`, phân biệt bằng body của
request:

| Chế độ | Kích hoạt bằng | Xác thực |
|---|---|---|
| **cron** (mặc định) | không có `body.kiem`, không có `body.lapLichSu` | header `x-cron-secret` khớp `PUSH_CRON_SECRET` |
| **lấp lịch sử** | `body.lapLichSu.accountId` | cùng `x-cron-secret` như cron |
| **kiểm mã** | `body.kiem = { isinCd, associFundCd }` | JWT người dùng, tự xác thực bằng `sb.auth.getUser(token)` |

Deploy dùng `--no-verify-jwt` vì cron gọi bằng `x-cron-secret`, không có JWT — cổng xác
thực JWT mặc định của Supabase bị **tắt** cho function này. Điều đó nghĩa là chế độ kiểm
mã **không được** trông cậy vào cổng đã tắt đó; nó **tự** gọi `sb.auth.getUser(token)` để
xác thực người gọi. Vẫn an toàn vì: (1) chế độ cron/lấp lịch sử vẫn bị chặn bởi
`x-cron-secret` — thiếu hoặc sai thì `401`, không chạm gì; (2) chế độ kiểm mã không đọc
`x-cron-secret` và không ghi gì vào DB (chỉ gọi CSV rồi trả kết quả), nên một JWT hợp lệ
bất kỳ (bất kỳ user đã đăng nhập) chỉ dùng được nó để tra giá công khai — không có gì để
lộ hay để phá.

## 6. Triển khai

Năm bước, theo đúng thứ tự. Chủ app chạy — các bước có khoá/secret đều hỏi ở ô nhập kín,
không có bước nào cần agent chạy hộ.

### Bước 0 — Áp migration 0045

**Bắt buộc trước Bước 1.** `funds`, `fund_aliases`, `fund_prices`, `fund_trades` chưa tồn
tại trên project thật cho tới khi bước này chạy — bỏ qua nó thì Bước 3 (hẹn cron) vẫn "gọi
thử được" (không phải `401`) vì secret đúng, nhưng function lỗi ngay ở tầng đọc bảng, và
cron sau đó nổ **mỗi ngày và luôn lỗi** cho tới khi có ai soi ra. Xem cảnh báo ở Bước 3.

Dán nguyên nội dung
[supabase/migrations/0045_fund_prices_trades.sql](../supabase/migrations/0045_fund_prices_trades.sql)
vào SQL Editor của project và bấm Run.

Kiểm đã xong bằng đúng một câu (migration seed đúng 8 quỹ + 10 bí danh, xem mục 2 và 4):

```sql
select
  (select count(*) from public.funds) as so_quy,
  (select count(*) from public.fund_aliases) as so_bi_danh;
```

Kỳ vọng: `so_quy = 8`, `so_bi_danh = 10`. Lệch số là dấu hiệu migration chạy dở hoặc chạy
hai lần đè lẫn nhau — đọc lại thông báo lỗi của SQL Editor, đừng chạy Bước 1 khi hai số
này chưa đúng.

### Bước 1 — Deploy function

```bash
npm run bundle:rules && npx supabase@latest functions deploy fund-refresh --project-ref <project-ref> --no-verify-jwt
```

`--no-verify-jwt` vì cron không phải người dùng đăng nhập — xem mục "ba chế độ" ở trên.

### Bước 2 — Bật `pg_cron` và `pg_net` (nếu chưa)

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

`create extension if not exists` chạy nhiều lần không sao — cứ chạy kể cả khi nghĩ là đã
có (đã bật cho `stock-refresh`/`push-notify` thì không cần bật lại, nhưng chạy lại vẫn vô
hại).

### Bước 3 — Hẹn cron

```bash
npm run setup:fund-cron
```

[scripts/setup-fund-cron.mjs](../scripts/setup-fund-cron.mjs) hỏi `PUSH_CRON_SECRET`
(không hiện lên màn hình), **gọi thật `POST /fund-refresh` để chứng minh secret đó
đúng**, rồi mới in khối `cron.schedule` đã điền sẵn cả project-ref lẫn secret. Secret sai
thì nó **không** in SQL — cùng nguyên tắc với `setup-stock-cron.mjs`
([co-phieu-viet-nam.md](co-phieu-viet-nam.md), mục "Hẹn cron").

Nếu Bước 0 chưa chạy, lượt gọi thử này **không** trả `401` (secret vẫn đúng) — nó lỗi ở
tầng đọc bảng vì `funds`/`fund_trades`/`fund_prices` chưa tồn tại. Script nhận ra dấu hiệu
đó trong thân trả về và cảnh báo riêng: **đừng** dán SQL vào SQL Editor lúc này, quay lại
Bước 0 trước — hẹn cron trước khi bảng tồn tại nghĩa là cron sẽ nổ mỗi ngày và luôn lỗi.

Lịch `0 13 * * 1-5` = 13:00 UTC = **22:00 giờ Nhật**, thứ Hai–thứ Sáu: sau giờ công bố
基準価額 (~19:00). Nhật không có giờ mùa hè nên một mốc UTC cố định là đủ — múi giờ ở đây
neo vào **quỹ Nhật**, không vào người dùng.

`pg_cron` trên Supabase đọc lịch theo **UTC**, không theo múi giờ của máy đang gõ lệnh này
— trừ khi tự đặt `cron.timezone`, mà project này không đặt. Vì vậy `0 13` phải được đọc là
13:00 UTC ngay từ đầu, không phải "13:00 giờ máy tôi" rồi tự quy đổi lần hai.

### Bước 4 — Kiểm, bốn câu, chạy TỪNG câu

SQL Editor chỉ hiện kết quả của câu **cuối** trong ô, nên dán cả bốn câu một lượt sẽ chỉ
thấy một bảng và tưởng ba câu kia không trả gì.

```sql
-- ① Lịch đã vào, VÀ không còn chuỗi giữ chỗ nào trong command.
select active, command not like '%<%>%' as khong_con_giu_cho
from cron.job where jobname = 'fund-refresh-daily';
```

```sql
-- ② Đã có câu ghi nào chạm vào bảng giá quỹ chưa. Đọc lan_ghi_cuoi, KHÔNG phải nav_date.
select nav_date, count(*) as so_quy, max(updated_at) as lan_ghi_cuoi
from public.fund_prices group by nav_date order by nav_date desc limit 5;
```

```sql
-- ③ Cron đã nổ vào những ngày nào. `succeeded` ở đây CHỈ nghĩa là net.http_post xếp
--    hàng xong — nó không biết gì về HTTP response.
select d.status, d.return_message, d.start_time
from cron.job_run_details d join cron.job j using (jobid)
where j.jobname = 'fund-refresh-daily' order by d.start_time desc limit 10;
```

```sql
-- ④ Sự thật phía HTTP: 200 hay 401/timeout. pg_net tự dọn bảng này sau vài giờ nên nó
--    chỉ soi được lượt gần nhất.
select id, status_code, error_msg, created
from net._http_response order by created desc limit 10;
```

> **Khi debug một lượt cron im lặng: đo `max(updated_at)` của `fund_prices`, đừng đo
> `nav_date`** — `nav_date` không phân biệt được "cron không ghi" với "nguồn trả giá
> phiên cũ". `updated_at` có trigger `moddatetime` bump trên **mọi** UPDATE (kể cả upsert
> ghi lại đúng giá cũ), nên nó là mốc "lần cuối có câu ghi thật sự chạm vào bảng" — đúng
> bài học đã mất một buổi với `stock-refresh` (xem [co-phieu-viet-nam.md](co-phieu-viet-nam.md),
> bẫy ①).

Ba việc gọi tay (không phải cron, không lặp lại), **theo đúng thứ tự** — migration phải
xong trước hai việc sau, vì cả hai đọc/ghi vào bảng mà Bước 0 mới tạo ra:

1. **Áp migration 0045** — Bước 0 ở trên. Xong trước tiên.
2. **Nhập sao kê.** Lấy `<uuid>` bằng
   `select id, name from public.accounts where currency = 'JPY';` rồi:

   ```bash
   npm run nhap:sao-ke -- "<đường dẫn csv>" --account <uuid>
   ```

   **`--account` là bắt buộc**, kể cả ở lượt xem trước — lượt xem trước cũng đọc
   `fund_trades` của đúng tài khoản đó để đếm trùng. Chạy như trên là **chỉ xem**, không
   ghi gì; đối chiếu xong bốn con số mới thêm `--ghi` vào cuối. Xem thêm mục 4 (quỹ đổi
   tên) cho ca script tự dừng.
3. **Lấp lịch sử** (gọi `fund-refresh` với body `{"lapLichSu":{"accountId":"<id>"}}`, dựng
   lại `account_valuations` cho các phiên đã qua từ CSV đã tải, không tốn thêm cuộc gọi
   mạng nào).

Cả ba chi tiết vận hành này thuộc Task 15 (deploy trên dữ liệu thật) — xem
[kế hoạch](superpowers/plans/2026-08-12-quy-nhat-tu-cap-nhat.md) mục Task 15 cho từng
lệnh cụ thể và tiêu chí "đúng", không phải "gần đúng".

## 7. Cách xem log

```bash
supabase functions logs fund-refresh
```

Mỗi lượt chạy ở chế độ cron log một dòng:

```
fund-refresh {"soQuyCoGia":8,"daGhi":1,"boQua":{},"loi":[]}
```

- `soQuyCoGia` — số quỹ ghi được NAV vào `fund_prices` ở lượt này (việc 1; hút **cả danh
  bạ**, không chỉ quỹ đang giữ — quỹ đang giữ được gọi trước, xem `buildFundFetchOrder`).
- `daGhi` — số tài khoản vừa được ghi snapshot mới vào `account_valuations` (việc 2).
- `boQua` — số tài khoản bị bỏ qua ở việc 2, gom theo lý do. Xem bảng dưới.
- `loi` — lỗi: một quỹ cụ thể hỏng dạng `gia: <mã>: <lý do>`, hết ngân sách thời gian
  giữa chừng dạng `gia: hết ngân sách thời gian hút giá sau N/M quỹ (đã hút K quỹ)`, danh
  bạ rỗng dạng `gia: danh bạ quỹ rỗng, không có gì để hút`, lỗi của riêng một tài khoản
  dạng `tài khoản <8 ký tự đầu id>…: <lý do>`, hoặc cả việc 2 nếu nó throw trước vòng lặp
  tài khoản dạng `ghi gia tri: <lý do>`.

Chế độ **lấp lịch sử** log dòng riêng,
`fund-refresh lapLichSu {"daGhi":N,"boQuaNgay":M,"loi":[...]}` — cùng đúng ba khoá đó trong
thân trả về. `boQuaNgay` là số phiên bị bỏ vì nguồn thiếu 基準価額 của một quỹ **đang giữ**
đúng phiên đó; **`boQuaNgay > 0` là bình thường**, không phải bug — thà để trống hơn ghi một
con số có quỹ tạm tính theo giá vốn, và những ngày đó sẽ trống **vĩnh viễn** (lượt sau nguồn
vẫn thiếu đúng phiên đó). `daGhi` một mình không phân biệt được "lấp đủ" với "lấp thiếu vài
trăm ngày", nên con số này phải lộ ra.
Chế độ **kiểm mã** không log — nó trả kết quả trực tiếp trong response, không ghi gì vào
DB.

### Ý nghĩa từng lý do trong `boQua`

Bảng cho người đọc log sáu tháng sau, không có ngữ cảnh gì khác ngoài dòng log này.
**Bảy** lý do. Đừng đối chiếu con số này với bản cổ phiếu (`stock-refresh` có **năm**):
`fund-refresh` **không có** `tien-chua-dau-tu-am` (mô hình quỹ không có tiền mặt, xem mục 5),
và bù lại có ba lý do mà bản cổ phiếu không có — `tron-hai-loai-so-lenh`,
`thieu-gia-mot-so-quy`, `chua-co-ngay-phien`. `so-lenh-co-lo-hong` thì bản cổ phiếu **cũng
có**, chỉ khác **cách hiểu**: với quỹ nó thường là thiếu một dòng bí danh, không phải quên ghi
lệnh. Hai con số không tương ứng nhau, đừng suy con này ra con kia:

| Lý do | Nghĩa là gì | Cần làm gì |
|---|---|---|
| `tron-hai-loai-so-lenh` | Tài khoản này **cũng** có dòng trong `stock_trades` — cộng 口数 quỹ với số cổ phiếu là trộn hai hệ đơn vị. Chưa từng xảy ra thật, nhưng chặn sẵn vì im lặng cộng sai còn tệ hơn bỏ qua. | Không nên xảy ra với dữ liệu hiện tại; nếu xảy ra, kiểm lại tại sao một tài khoản JPY lại có sổ lệnh cổ phiếu VND. |
| `so-lenh-co-lo-hong` | `fundHoldingsFromTrades` báo `oversold` khác rỗng: có lệnh bán (hoặc `adjust` âm) nhiều hơn 口数 đang giữ tại thời điểm đó. **Với quỹ Nhật, lý do thường gặp nhất là THIẾU MỘT DÒNG trong `fund_aliases`** (quỹ đổi tên — xem mục 4), không phải quên ghi lệnh như cổ phiếu. | Kiểm `fund_aliases` trước: Rakuten vừa đổi tên quỹ nào không? Thêm hàng bí danh rồi cron tự ghi lại lượt sau. Nếu bí danh đã đủ, xem lại sổ lệnh có thiếu lệnh mua hoặc sai ngày không. |
| `thieu-gia-moi-quy` | `fundValue` trả `marketValue = null` vì **mọi** quỹ đang giữ đều không có giá trong `fund_prices` (`missingNavs` bằng đúng số quỹ đang giữ). | Kiểm `funds.last_status` của các mã đang giữ — `ma-sai` nghĩa là ISIN/協会コード gõ sai; `loi-mang` thường tự khỏi lượt sau. |
| `thieu-gia-mot-so-quy` | `fundValue` trả `missingNavs` khác rỗng nhưng `marketValue` KHÔNG null — thiếu giá **một phần** quỹ đang giữ, không phải mọi quỹ. Quỹ thiếu bị tạm tính theo giá vốn (số vẫn ra được vì fundValue không tự chặn ca này), nên cron chủ động bỏ CẢ tài khoản để không ghi một con số nửa đúng nửa sai đóng dấu `'auto'`. | Kiểm `funds.last_status` của TỪNG mã quỹ đang giữ, không chỉ mã đầu tiên — mã nào `ma-sai`/`loi-mang` là mã đang thiếu giá; mã còn lại vẫn hút bình thường nên đừng dừng ở đó. |
| `chua-co-ngay-phien` | `sessionNavs` trả `session = null`, nghĩa là **bảng `fund_prices` RỖNG HOÀN TOÀN** — **không** phải "không quỹ đang giữ nào có hàng giá": `sessionNavs` có nhánh **rơi về cả bảng** khi không quỹ đang giữ nào có hàng (biến `nguonNgay` trong `fundHoldings.ts`), nên ca đó vẫn ra được một `session` và rơi vào `thieu-gia-moi-quy`. **Đường này không đi tới được** vì chốt loại trừ nó chạy **TRƯỚC**, ngay đầu Việc 2: `if (giaTho.length === 0) throw new Error('Bảng giá quỹ rỗng…')` → `500`, không tài khoản nào được xét. Nhánh này còn lại chủ yếu để thu hẹp kiểu cho TypeScript. | Nếu bạn **thật sự** thấy lý do này trong log thì một giả định đã vỡ: chốt "bảng giá rỗng" ở **đầu Việc 2** lẽ ra đã throw trước khi vào vòng lặp tài khoản. Đọc đúng hai chỗ đó — chốt `giaTho.length === 0` trong `index.ts` và biến `nguonNgay` trong `sessionNavs` — **đừng** đi soi `missingNavs` hay `thieu-gia-moi-quy` (chốt đó chạy SAU, không liên quan), và đừng thêm hàng vào `fund_prices` trước khi hiểu vì sao tới được đây. |
| `gia-le-phien-cu` | `sessionNavs` giờ chỉ lấy `nav_date` lớn nhất trong SỐ CÁC QUỸ TÀI KHOẢN NÀY ĐANG GIỮ (không còn tính trên cả `fund_prices` — một quỹ không ai giữ không thể chen vào phép tính này nữa), rồi so từng quỹ đang giữ với mốc đó. Nghĩa là: trong lượt hút NAV này, ít nhất một quỹ đang giữ đã có giá nhưng vẫn ở phiên CŨ hơn quỹ đang giữ khác — ví dụ một quỹ hút xong trước, quỹ kia hút chậm hoặc lỗi mạng tạm thời cùng lượt. | Thường tự khỏi lượt sau (lượt sau hút lại CẢ hai quỹ đang giữ). Lặp lại mỗi ngày thì kiểm `loi` của cùng lượt có dòng lỗi lặp lại đúng mã quỹ bị coi "cũ" đó không (nguồn hỏng dai dẳng cho riêng mã đó) — không còn ca "quỹ không ai giữ đi trước phiên" nữa, vì `sessionNavs` đã loại quỹ không giữ ra khỏi phép tính mốc. |
| `nguoi-dung-da-go-tay` | Hàng `account_valuations` của đúng ngày phiên đó đã có sẵn với `source = 'manual'` — người dùng đã tự gõ số cho ngày này (sheet "Cập nhật giá trị"). Cron **cố ý** không đè lên. | Không cần làm gì — số gõ tay luôn thắng. Muốn để cron tự tính lại: xoá hàng `manual` đó (hoặc đổi `source` thành `'auto'`) rồi gọi lại function. |

## 8. Chỗ đã kiểm và chỗ chưa

| Phần | Trạng thái |
|---|---|
| `parseNavCsv` — đọc CSV Shift-JIS thật của 投信協会, lấy phiên mới nhất + `prior_nav`, bỏ dòng ngày/giá hỏng, không rơi về `new Date()`, phân biệt `ma-sai` (`{"statusCode":null}`) với `khong-co-dong-nao` | ✅ test, chạy trên file mẫu thật |
| `parseNavHistory` — toàn bộ lịch sử một quỹ, xếp tăng dần, không phải CSV giá → mảng rỗng | ✅ test, file mẫu có hàng nghìn phiên |
| `buildFundFetchOrder` — quỹ đang giữ lên trước, không trùng, giữ cả mã giữ mà không có trong danh bạ | ✅ test |
| `fetchFundNavs` — một quỹ lỗi không kéo mất quỹ khác, phân biệt `ma-sai`/`loi-mang`, dừng sạch khi hết `FETCH_BUDGET_MS` (60s), URL luôn đủ hai tham số | ✅ test với `fetch` giả lập + đồng hồ giả (không gọi mạng thật) |
| Endpoint CSV thật (curl trực tiếp, các bẫy ①②③) | ✅ đã đo thật ngày 2026-08-12, xem mục 1 |
| Cả 8 mã trong danh bạ gọi thật đều `200` | ✅ đã đo thật ngày 2026-08-12, phiên 2026-08-10 |
| `fundHoldingsFromTrades` — giá vốn lấy từ `amount` không suy từ `units×nav`, mua nhiều lần cộng dồn đúng, bán một phần/bán sạch/bán quá tay, `adjust` (phân phối lại), thứ tự `mua→adjust→bán` cùng ngày, cộng dồn theo `traded_on` không theo thứ tự mảng | ✅ test đầy đủ, gồm cả ca "bán sạch rồi mua lại hôm sau" đã xảy ra thật (2026-04-13/14) |
| `fundValue`/`sessionNavs` — tái tạo đúng từng yên ba con số của app Rakuten (57.009 / 23.748 / 80.757), làm tròn từng quỹ rồi mới cộng, thiếu giá một phần vẫn ra số + nêu tên, thiếu giá mọi quỹ → `null`, không giữ gì → `0` | ✅ test, đối chiếu bằng số thật từ ảnh chụp app Rakuten ngày 2026-08-12 |
| Bất biến "không quỹ nào 口数 âm" bắt được cả hai lần Rakuten đổi tên | ✅ đo bằng số thật (12.355/12.596 hai phiên độc lập, xem mục 4), test canh `soatSoDuAm` trong `tests/nhapSaoKe.test.ts` |
| Migration 0045 — seed đủ 8 quỹ + 10 bí danh, bí danh có cả hai tên của quỹ đã đổi tên, ràng buộc hình dạng theo `kind`, không bảng nào cho user ghi vào bảng giá/danh bạ | ✅ test (`tests/fundSeed.test.ts`) |
| `demoRepo` — sổ lệnh quỹ: ghi/sửa/xoá, `CHECK fund_trades_shape` (mua/bán có `amount>0`, `adjust` có `nav=0 amount=0`), soi hình dạng sau khi trộn patch (không chỉ lúc tạo), không xoá được tài khoản còn sổ lệnh | ✅ test (`src/data/fundTrades.test.ts`) |
| `loadFundRegistry`/`loadHeldFundCodes`/`loadFundAccounts` — chỉ đọc bảng, xếp vào ô, không tự tính | ✅ đọc kỹ theo hợp đồng, khớp cột trong migration 0045 — **chưa chạy thật** với Postgres, cùng lý do `loadInput.ts` của `stock-refresh` không có test riêng |
| `index.ts` — ba chế độ (cron/lấp lịch sử/kiểm mã), phân biệt `viec2Gay`/`chetHoanToan`, bảy lý do `boQua`, `--no-verify-jwt` + tự xác thực JWT ở chế độ kiểm mã | ✅ đọc code kỹ — **chưa chạy thật**, không có test riêng (chỉ ghép nối Postgres, đúng đắn chứng minh bằng lượt gọi thật ở Task 15) |
| Khu "Danh mục quỹ" (`FundHoldingsSection`) + sheet ghi lệnh (`FundTradeFormSheet`) | ✅ **đã kiểm bằng chế độ demo**: hiện đúng Tổng giá trị 80.757 ¥, Giá vốn 70.000 ¥, +10.757 ¥ (+15,4%), gợi ý Số tiền từ 口数×基準価額÷10.000 sửa được |
| `scripts/nhap-sao-ke-rakuten.mjs` — đọc CSV Shift-JIS thật, tách 5 cột đúng khi số có dấu phẩy trong ngoặc kép, chỉ nhận 3 loại lệnh quỹ (bỏ dòng tiền có nêu tên), dùng 約定日 không dùng 受渡日, ghép bí danh dừng khi gặp tên lạ, đếm trùng theo túi không theo tập | ✅ test trên `scripts/testdata/rakuten-uydo-mau.csv` — file GÕ TAY (không cắt từ file sao kê tải về), nhưng các con số trong đó (387.221 / 68.725 / 1.275 / 27.575 …) là số THẬT của chủ app, đã có sẵn ở nơi khác trong repo (chú thích code, `docs/`). Ranh giới đang giữ là **không commit file sao kê thật**, không phải "không có con số thật nào" |
| Deploy `fund-refresh` lên project thật | ❌ **chưa** — việc của Task 15, chủ app tự chạy |
| Migration 0045 áp lên project thật | ❌ **chưa** |
| Nhập sao kê thật (136 dòng, khớp 28.429/12.595 口, 50.000/20.000 ¥ giá vốn) | ❌ **chưa** |
| Gọi `POST /fund-refresh` thật, ghi `fund_prices`/`account_valuations` thật | ❌ **chưa** |
| Ba con số đích khớp UI thật (80.757 ¥, +10.757 ¥, +15,4%) trên dữ liệu thật | ❌ **chưa** — đã khớp trên dữ liệu demo (xem dòng trên), còn dữ liệu thật là việc Task 15 |
| `cron.schedule` cho `fund-refresh-daily` đã chạy thật trên project | ❌ **chưa** |
| Lấp lịch sử thật — biểu đồ Tài sản ròng có đoạn trống 2025-04→2025-08 và bậc tụt 2026-04-13 | ❌ **chưa** |

### Một điều dễ gây bối rối trên UI thật, không phải lỗi cần sửa

**Lãi/lỗ ở mức tài khoản** của tài khoản quỹ này không có nghĩa và **không sửa được**:
tài khoản từng bị quét sạch (387.221 ¥ rút ra) rồi nạp lại, nên nạp − rút cả đời là
**−299.215 ¥**, và `investmentStats` trả `null` cho `pnlPercent` khi giá vốn ≤ 0 (đúng
hành vi — không phải bug). Lãi/lỗ **duy nhất có nghĩa** là loại suy từ sổ lệnh, hiện
trong khu "Danh mục quỹ" (`FundHoldingsSection`) — không phải ô "Hiệu quả đầu tư" ở đầu
trang chi tiết tài khoản. **Đừng sửa `investmentStats`** để "khớp" con số này; hai ô đo
hai thứ khác nhau và cả hai đều đúng theo đúng định nghĩa của nó.

Tương tự, app Rakuten hiện lãi **+15,36%** (cắt đuôi) còn hàm `pct` của repo hiện
**+15,4%** (`toFixed(1)`, làm tròn) — **hai cách hiển thị của cùng một con số
(10.757/70.000 = 15,367%), không phải sai lệch cần đi tìm.**
