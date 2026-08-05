# Hút bảng giá cổ phiếu Việt Nam (SSI iBoard)

Edge function `stock-refresh` chạy mỗi chiều sau khi ba sàn Việt Nam đóng cửa, làm
hai việc: (1) hút bảng giá mới nhất và ghi vào `stock_prices`, (2) tính lại giá trị
thị trường của từng tài khoản có sổ lệnh và ghi vào `account_valuations` — bảng mà
cả app (tổng tài sản, lãi/lỗ chưa thực hiện, XIRR, biểu đồ, thông báo) đã đọc sẵn từ
trước, nên không cần sửa gì ở phía đọc.

## Đã chốt gì

| Quyết định | Vì sao |
|---|---|
| Nguồn giá: **SSI iBoard** (`iboard-query.ssi.com.vn/stock/exchange/{hose,hnx,upcom}`) | Đo ngày 2026-08-05: trả đủ ba sàn, miễn phí, không cần khoá API, giá theo ĐỒNG. TCBS bị Cloudflare chặn, VNDirect trả rỗng. |
| Giá lấy `matchedPrice`, rơi về `priorClosePrice` rồi `refPrice` | `matchedPrice` = 0 ngoài giờ giao dịch hoặc mã không khớp lệnh trong phiên. Không có giá nào dùng được thì **bỏ mã đó**, không ghi giá 0 — xem [prices.ts](../supabase/functions/stock-refresh/prices.ts). |
| Chạy ở server, không gọi thẳng từ app | SSI trả `Access-Control-Allow-Origin: https://iboard.ssi.com.vn` — trình duyệt của app không gọi được. Đây là ràng buộc, không phải lựa chọn. |
| Hút từng sàn độc lập | Một sàn lỗi (mạng, SSI đổi payload) thì hai sàn còn lại vẫn ghi được. |
| Dùng lại `PUSH_CRON_SECRET` | Nó là "bí mật cho cron" nói chung, không riêng gì push-notify — không cần sinh thêm secret khác. |

## Kiến trúc

```
supabase/functions/stock-refresh/prices.ts     ← fetchBoard (gọi SSI) + parseBoard (hàm thuần, test được)
supabase/functions/stock-refresh/loadInput.ts  ← đọc account_balances + stock_trades, xếp thành PortfolioAccount[]
supabase/functions/stock-refresh/index.ts      ← việc 1: vòng qua 3 sàn, upsert stock_prices
                                                  việc 2: gọi _holdings.js + loadInput.ts, ghi account_valuations
supabase/functions/stock-refresh/_holdings.js  ← gói từ src/features/assets/holdings.ts (holdingsFromTrades,
                                                  brokerCash, portfolioValue) — cùng phép tính app đang dùng
```

`parseBoard` tách khỏi `fetchBoard` để test bằng file mẫu
([testdata/hose-sample.json](../supabase/functions/stock-refresh/testdata/hose-sample.json),
đã cắt còn 3 mã), không cần mạng hay Deno.

`loadInput.ts` theo đúng khuôn của `push-notify/loadInput.ts`: chỉ đọc bảng và xếp dữ
liệu vào đúng ô cho `_holdings.js`, không tự cộng trừ tiền hay ngày. Phép tính thật —
gộp sổ lệnh ra số cổ/giá vốn (`holdingsFromTrades`), tiền chưa đầu tư (`brokerCash`),
giá trị thị trường (`portfolioValue`) — nằm trong `_holdings.js`, cùng một hàm thuần
mà trình duyệt gọi khi hiện trang Tài sản. Nhờ vậy chuông trong app và snapshot do
cron ghi không bao giờ nói lệch nhau.

## Triển khai

### 1. Deploy function

```bash
npm run bundle:rules && supabase functions deploy stock-refresh --project-ref <project-ref> --no-verify-jwt
```

`--no-verify-jwt` vì cron không phải người dùng đăng nhập, không có JWT — đó là lý do
có `x-cron-secret`.

### 2. Hẹn cron mỗi ngày

```sql
select cron.schedule(
  'stock-refresh-daily',
  -- 08:45 UTC = 15:45 giờ Việt Nam, thứ Hai–thứ Sáu. Sau khi sàn đóng cửa (15:00) và
  -- khớp lệnh ATC xong. Việt Nam KHÔNG có giờ mùa hè nên một mốc UTC cố định là đủ —
  -- khác push (mục J) phải lưu giờ + múi giờ vì chủ app đổi nước và Mỹ có DST. Ở đây
  -- múi giờ neo vào SÀN GIAO DỊCH, không vào người dùng.
  '45 8 * * 1-5',
  $$ select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/stock-refresh',
       headers := '{"Content-Type": "application/json", "x-cron-secret": "<PUSH_CRON_SECRET>"}'::jsonb
     ) $$
);
```

`<ref>` là mã project Supabase, `<PUSH_CRON_SECRET>` là giá trị thật của secret cùng
tên — điền lúc deploy, theo đúng lệ ở [docs/push-notification.md](push-notification.md).

Xem lịch đã hẹn:

```sql
select * from cron.job;
```

Phải thấy một hàng `jobname = 'stock-refresh-daily'`.

Xem lịch sử chạy (mỗi lần cron gọi function là một hàng — `status`, thời gian chạy,
lỗi nếu `net.http_post` thất bại; **không** thấy nội dung `KetQua` ở đây, cái đó nằm
trong log của function, xem mục dưới):

```sql
select * from cron.job_run_details order by start_time desc limit 20;
```

## Cách xem log

```bash
supabase functions logs stock-refresh
```

Mỗi lượt chạy log một dòng:

```
stock-refresh {"giaTheoSan":{"hose":407,"hnx":210,"upcom":180},"daGhi":3,"boQua":{"nguoi-dung-da-go-tay":1},"loi":[]}
```

- `giaTheoSan` — số mã ghi được vào `stock_prices`, theo từng sàn (việc 1).
- `daGhi` — số tài khoản vừa được ghi snapshot mới vào `account_valuations` (việc 2).
- `boQua` — số tài khoản bị bỏ qua ở việc 2, gom theo lý do. Xem bảng dưới để biết
  từng lý do nghĩa là gì và có cần làm gì không.
- `loi` — lỗi (hút giá một sàn, hoặc cả khối việc 2 nếu nó throw — xem ghi chú cuối
  bảng).

### Ý nghĩa từng lý do trong `boQua`

Bảng cho người đọc log sáu tháng sau, không có ngữ cảnh gì khác ngoài dòng log này.

| Lý do | Nghĩa là gì | Cần làm gì |
|---|---|---|
| `so-lenh-co-lo-hong` | `holdingsFromTrades` báo `oversold` khác rỗng: có lệnh bán (hoặc `adjust` âm) nhiều hơn số cổ đang giữ tại thời điểm đó. Sổ lệnh của tài khoản này có một lỗ hổng — thường là quên ghi một lệnh mua, hoặc ghi sai ngày làm đảo thứ tự mua/bán. | Mở tài khoản trong app, xem lại từng lệnh theo `symbol`, tìm lệnh mua bị thiếu hoặc ngày bị sai rồi sửa/ghi bổ sung. Cron sẽ tự ghi lại vào lần chạy kế tiếp, không cần gọi tay. |
| `tien-chua-dau-tu-am` | `brokerCash` ra số âm: tổng tiền đã chi cho các lệnh mua (trừ tiền thu từ lệnh bán) nhiều hơn số dư sổ của tài khoản (nạp − rút). Thường là quên ghi giao dịch nạp tiền vào tài khoản chứng khoán trước khi ghi lệnh mua. | Kiểm tra tab giao dịch của tài khoản này: có thiếu lần chuyển tiền vào không? Ghi bổ sung giao dịch nạp tiền (không phải lệnh mua) cho khớp số đã bỏ ra mua cổ phiếu. |
| `thieu-gia-moi-ma` | `portfolioValue` trả `marketValue = null` vì **mọi** mã đang giữ đều không có giá trong `stock_prices` (không phải sổ lệnh sai, cash cũng không âm). Thường là mã đã huỷ niêm yết, hoặc sàn không trả về mã đó trong lần hút gần nhất. | Tra mã đó trên SSI iBoard xem còn giao dịch không. Nếu là mã hợp lệ nhưng SSI đổi tên/mã, cập nhật lại `symbol` trong lệnh cho khớp. Nếu đã huỷ niêm yết, ghi lệnh `adjust` phù hợp hoặc chấp nhận tài khoản này tạm không tự chạy được. |
| `nguoi-dung-da-go-tay` | Hàng `account_valuations` của đúng ngày phiên đó đã có sẵn với `source = 'manual'` — người dùng đã tự gõ số cho ngày này (sheet "Cập nhật giá trị"). Cron **cố ý** không đè lên: số người dùng gõ tay luôn thắng. | Không cần làm gì — đây là hành vi đúng, không phải lỗi. Nếu muốn để cron tự tính lại, xoá hàng `manual` đó (hoặc đổi `source` thành `'auto'`) rồi gọi lại function. |

Ghi chú: nếu `loi` có một dòng bắt đầu bằng `ghi gia tri:`, nghĩa là toàn bộ việc 2
đã throw sớm (đọc `stock_prices`/`loadPortfolioAccounts` lỗi, hoặc bảng giá rỗng) —
lúc đó **không** tài khoản nào được xét, `daGhi` và `boQua` đều giữ giá trị mặc định
(0 và rỗng) của lượt chạy đó. Việc 1 (hút giá) không bị ảnh hưởng vì nó chạy và log
kết quả trước khi việc 2 bắt đầu.

## Chạy thử tại máy

```bash
supabase functions serve stock-refresh --no-verify-jwt
```

```bash
curl -i -X POST http://localhost:54321/functions/v1/stock-refresh -H "x-cron-secret: <PUSH_CRON_SECRET>"
```

Trả về `200` với body kiểu
`{"giaTheoSan":{"hose":407,"hnx":...,"upcom":...},"daGhi":3,"boQua":{},"loi":[]}`.
Gọi thiếu header `x-cron-secret` phải trả `401 Sai bí mật cron`.

## Chỗ đã kiểm và chỗ chưa

| Phần | Trạng thái |
|---|---|
| `parseBoard` — đọc bảng giá thật của SSI, rơi về `priorClosePrice`/`refPrice`, bỏ mã không có giá dùng được | ✅ 6 test, chạy trên file mẫu thật (đã cắt còn 3 mã) |
| `fetchBoard` gọi được SSI thật | ✅ đã đo `curl` tới `iboard-query.ssi.com.vn/stock/exchange/hose` ngày 2026-08-05, trả `200` |
| Ghi vào `stock_prices` (upsert thật) | ❌ **chưa kiểm** — chưa có Supabase local để thử |
| `_holdings.js` xuất đúng `holdingsFromTrades`/`brokerCash`/`portfolioValue`/`toISODate`, khớp `src/features/assets/holdings.ts` | ✅ `tests/pushBundle.test.ts` so byte-for-byte bundle gói lại với file đã commit, và kiểm đủ export |
| `loadPortfolioAccounts` lọc đúng loại `investment` + `VND` + chưa lưu trữ + có sổ lệnh | ✅ đọc kỹ theo hợp đồng, khớp cột trong migration 0016/0026/0035 — **chưa chạy thật** với Postgres |
| Van bỏ qua `so-lenh-co-lo-hong` / `tien-chua-dau-tu-am` / `thieu-gia-moi-ma` không ghi gì | ✅ đọc code — cả hai đều `continue` trước khối `upsert` |
| Số gõ tay (`source='manual'`) không bị đè | ✅ đọc code — đọc trước, so `source`, `continue` nếu là `manual`. **Chưa kiểm bằng UI + DB thật** (Step 4 của brief) |
| `valued_on` = ngày phiên (không phải hôm nay) | ✅ đọc code — `phien` lấy từ `trading_date` lớn nhất trong `stock_prices`, không có chỗ nào dùng `new Date()` cho `valued_on` |
| `supabase functions serve` tại máy + gọi thử `POST /stock-refresh` | ❌ **chưa kiểm** — máy dev chưa cài Supabase CLI / chưa chạy Supabase local |
| Ghi thật vào `account_valuations`, xem "Tổng tài sản"/"Hiệu quả đầu tư" tự đúng trên UI | ❌ **chưa kiểm** — cần môi trường sống (xem mục dưới) |
| `cron.schedule` đã chạy thật, `cron.job`/`cron.job_run_details` có hàng | ❌ **chưa kiểm** — cần deploy lên project Supabase thật |

### Chưa làm được ở máy này — cần kiểm khi có môi trường sống

`supabase` CLI không cài trên máy này và không có Postgres local đang chạy, nên toàn
bộ phần seed dữ liệu qua UI, gọi function thật, đọc `account_valuations` bằng SQL,
deploy, và `cron.schedule` **chưa chạy được** — chỉ kiểm bằng đọc code kỹ theo đúng
hợp đồng của `holdings.ts` và `prices.ts`. Việc cần làm trước khi tin tưởng cron chạy
production, theo đúng thứ tự Step 3–7 của kế hoạch gốc:

1. Seed một tài khoản `investment`/VND, nạp 100.000.000đ, ghi lệnh mua 1.000 FPT giá
   70.000 phí 105.000. Gọi function, kỳ vọng `"daGhi":1` và
   `market_value = 1.000 × giá FPT hôm đó + 29.895.000`.
2. Gõ tay một giá trị khác cho đúng ngày phiên đó, gọi lại function, kỳ vọng
   `"boQua":{"nguoi-dung-da-go-tay":1}` và số trong DB **không đổi**.
3. Ghi thêm một lệnh mua vượt xa số tiền đã nạp, gọi lại function, kỳ vọng
   `"boQua":{"tien-chua-dau-tu-am":1}` và **không** có hàng snapshot mới. Xoá lệnh đó
   sau khi kiểm xong.
4. Mở trang Tài sản, xác nhận tài khoản chứng khoán hiện theo giá thị trường và khu
   "Hiệu quả đầu tư" ra lãi/lỗ mà không cần bấm gì.
5. Deploy (`npm run bundle:rules && supabase functions deploy stock-refresh
   --no-verify-jwt`), hẹn `cron.schedule` như trên, rồi kiểm `select * from cron.job;`
   có hàng `stock-refresh-daily`, và một ngày sau kiểm
   `cron.job_run_details` có chạy thành công.
