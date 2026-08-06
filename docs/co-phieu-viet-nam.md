# Hút giá cổ phiếu Việt Nam (Yahoo Finance)

Edge function `stock-refresh` chạy mỗi chiều sau khi sàn Việt Nam đóng cửa, làm
hai việc: (1) hút giá mới nhất cho các mã đã từng giao dịch và ghi vào
`stock_prices`, (2) tính lại giá trị thị trường của từng tài khoản có sổ lệnh và ghi
vào `account_valuations` — bảng mà cả app (tổng tài sản, lãi/lỗ chưa thực hiện, XIRR,
biểu đồ, thông báo) đã đọc sẵn từ trước, nên không cần sửa gì ở phía đọc.

## Đã đổi nguồn giá: SSI → Yahoo Finance

Bản đầu tiên dùng **SSI iBoard** (`iboard-query.ssi.com.vn/stock/exchange/{hose,hnx,upcom}`),
đo tại máy cá nhân ngày 2026-08-05, trả 200 với đủ ba sàn. **Không chạy được ở
production.** Đo trực tiếp từ function đã deploy (Supabase project vùng `ap-south-1`,
Mumbai) ngày 2026-08-06:

| Endpoint | Kết quả |
|---|---|
| `iboard-query.ssi.com.vn/stock/exchange/{hose,hnx,upcom}` | **403**, body là trang HTML "Security Check", cả ba sàn |
| Cùng URL trên, kèm header giả trình duyệt đầy đủ (`User-Agent`, `Referer`, `Origin`, `Accept`) | **Vẫn 403** — không phải chặn theo header |
| `iboard-api.ssi.com.vn` (host SSI khác) | **Cũng 403** |

Cùng những URL đó gọi từ máy cá nhân (không phải dải IP trung tâm dữ liệu) vẫn trả
200 — kết luận: SSI chặn theo **dải IP**, không phải theo cách gọi. Không có cách né
từ phía Supabase. **SSI coi như chết cho việc này** — nếu định thử lại SSI, đọc kỹ
mục này trước, đừng lặp lại phép đo đã làm.

`query1.finance.yahoo.com/v8/finance/spark?symbols=...` gọi từ đúng function đó trả
**200**, và — quan trọng — nhận được **nhiều mã trong một cuộc gọi** (khác
`/v8/finance/chart/{SYMBOL}` chỉ nhận một mã một lần, và khác `v7/finance/quote` đòi
xác thực, trả 401 nên không dùng được). Yahoo trở thành nguồn chính.

### Giới hạn cứng: tối đa 20 mã một cuộc gọi (bug đã sửa 2026-08-06)

Bản đầu tiên đặt `CHUNK_SIZE = 40`, đoán theo cảm tính "vài chục mã một lô". Đo lại
trực tiếp từ function đã deploy ngày 2026-08-06 — gọi Yahoo với 403, 250, 150, 100, và
60 mã một lần đều trả **HTTP 400**, body:

```json
{"spark":{"result":null,"error":{"code":"Bad Request","description":"Number of symbols needs to be less than or equal to 20"}}}
```

Nói cách khác: **mọi lô hơn 20 mã đều hỏng**. Với `CHUNK_SIZE = 40`, MỌI lô của mọi lượt
chạy đều rơi vào trường hợp này — kể từ khi chuyển sang Yahoo cho tới khi phát hiện và
sửa lỗi này, **chưa từng có giá nào được hút thật sự**, dù các bài test của
`parseYahooSpark` (chạy trên file mẫu, không gọi mạng) vẫn xanh bình thường vì chúng
không đi qua đường gọi mạng thật.

Đã sửa: `CHUNK_SIZE = 20` trong [prices.ts](../supabase/functions/stock-refresh/prices.ts),
kèm comment trích nguyên câu lỗi ở trên ngay cạnh hằng số, và bài test
`chunkSymbols` trong [prices.test.ts](../supabase/functions/stock-refresh/prices.test.ts)
canh đúng ranh giới 20 (20 mã vẫn một lô, 21 mã đã phải chia) — tăng số này lên lại mà
không đo lại thì bài test đó đỏ ngay.

### Giới hạn phải chấp nhận: chỉ còn HOSE

Yahoo phục vụ cổ phiếu Việt Nam qua hậu tố `.VN`, và hậu tố đó **chỉ là sàn Hồ Chí
Minh (HOSE)**. Đã thử PVS (HNX) và VGI (UPCOM) — cả hai trả "Not Found". Không có
hậu tố nào khác thay thế cho HNX/UPCOM trên Yahoo.

Chủ app hiện chỉ giữ cổ phiếu HOSE nên đây là quyết định **chấp nhận được**, không
phải sơ sót — nhưng cần nói rõ vì nó là một giới hạn thật:

> **Một mã HNX hoặc UPCOM sẽ KHÔNG có giá.** UI hiện "chưa có giá" cho mã đó (như mọi
> mã thiếu giá khác), và nếu tài khoản chỉ giữ mã HNX/UPCOM, cron sẽ bỏ qua tài khoản
> đó ở việc 2 (`thieu-gia-moi-ma`) thay vì ghi một con số sai — không có chỗ nào âm
> thầm ghi giá 0 hay giá cũ.

### 15 mã HOSE mà Yahoo cũng không có (đo 2026-08-06)

Ngay trong HOSE, Yahoo phủ 388/403 mã. Mười lăm mã dưới đây gọi ra không có giá — toàn
tên nhỏ, thanh khoản thấp; không có mã vốn hoá lớn nào:

`BTT` `COM` `CRV` `HTV` `HU1` `LGC` `NAV` `PNC` `SFC` `SMA` `TDW` `TIX` `TMS` `TTE` `TVT`

Mua trúng một trong số đó thì hành xử giống hệt mã HNX/UPCOM ở trên: UI báo "chưa có giá",
cron bỏ qua tài khoản với lý do `thieu-gia-moi-ma`, không ghi số sai. Danh sách này đo một
lần nên có thể đổi — Yahoo thêm/bớt mã theo thời gian. Kiểm lại bằng cách so số
`soMaCoGia` trong log với `HOSE_SYMBOL_COUNT` trong `src/features/assets/hoseSymbols.ts`:
chênh nhau nhiều hơn con số này là có chuyện.

### Tên công ty: chuyển sang danh sách tĩnh

Yahoo không trả tên công ty (SSI có, qua `companyNameVi`). Ô gợi ý mã khi ghi lệnh
(`TradeFormSheet`) và tên công ty hiển thị ở Danh mục (`HoldingsSection`) đọc từ danh
sách tĩnh [`src/features/assets/hoseSymbols.ts`](../src/features/assets/hoseSymbols.ts)
— 403 mã HOSE (mã + tên), hút một lần từ máy cá nhân bằng
[`scripts/harvest-hose-symbols.mjs`](../scripts/harvest-hose-symbols.mjs) (script đó
vẫn gọi SSI vì SSI vẫn có danh sách mã cả sàn; script này chạy TAY, không phải ở edge
function, nên không đụng dải IP bị chặn). Danh sách mã một sàn gần như không đổi,
khác giá — nên hút tay vài tháng một lần là đủ, không cần tự động.

Vì lý do y hệt (Yahoo chỉ có HOSE), danh sách tĩnh đó **cũng chỉ có mã HOSE** — liệt
kê mã HNX/UPCOM ở đó sẽ gợi ý những mã mà app không lấy được giá.

Danh sách này được xuất từ `src/features/assets/serverBundle.ts` và gói vào
`supabase/functions/stock-refresh/_holdings.js` (`npm run bundle:rules`) để edge
function dùng được. `stock_prices.name` giờ được **điền server-side** từ danh sách này
(trước đây luôn rỗng) — mã không có trong danh sách (mới lên sàn sau lần hút gần nhất,
hoặc gõ nhầm trong sổ lệnh) thì `name` vẫn rỗng, hàng giá vẫn được giữ. UI đã tự tra
`HOSE_SYMBOLS` từ trước và không đọc `stock_prices.name` — điền cột này là để bảng tự
mô tả được chính nó (đọc SQL trực tiếp không cần join với danh sách tĩnh), không phải
để phục vụ UI.

### Hút cả sàn HOSE, không chỉ mã đã giao dịch

Bản đầu tiên chỉ hút giá cho mã đã từng xuất hiện trong sổ lệnh
(`loadTradedSymbols`). Vấn đề: một mã vừa mua HÔM NAY chưa có giá cho tới lượt cron kế
tiếp (sáng hôm sau) — UI hiện "chưa có giá" ngay ngày ghi lệnh, đúng lúc người dùng
vừa gõ xong và mong thấy số ngay.

Từ 2026-08-06, việc 1 hút giá cho **toàn bộ 403 mã HOSE** (`HOSE_SYMBOLS`), không chỉ
mã trong sổ lệnh — bất kỳ mã HOSE nào cũng có giá sẵn ngay khi được ghi vào sổ lệnh,
không cần đợi. `loadTradedSymbols` **không bị xoá** — nó đổi vai trò từ "mã nào được
hút" (membership) sang "mã nào được hút TRƯỚC" (priority), xem mục dưới.

Đổi lại: 403 mã ở lô tối đa 20 mã là khoảng 21 lô gọi tuần tự một lượt (trước đây chỉ
vài lô, bằng số mã đang có trong sổ lệnh). Hai điều chỉnh đi kèm để chịu được việc đó:
mã đang giữ được gọi trước (mục dưới), và một ngân sách thời gian cho cả khối (mục
dưới nữa).

### Mã đang giữ được gọi trước (`buildFetchOrder`)

21 lô gọi tuần tự nghĩa là nếu Yahoo giới hạn tốc độ hoặc mạng chập chờn giữa chừng,
lô nào gọi SAU sẽ là lô hỏng. Mã người dùng thực sự đang giữ mới là mã cần có giá đúng
hôm nay — không thể để nó may rủi theo thứ tự alphabet của cả sàn.

`buildFetchOrder(heldSymbols, universeSymbols)` (trong
[prices.ts](../supabase/functions/stock-refresh/prices.ts)) xếp mã đã từng giao dịch
(`loadTradedSymbols`) lên ĐẦU danh sách hút, phần còn lại của `HOSE_SYMBOLS` xếp SAU,
không trùng lặp. Mã đang giữ nhưng không có trong `HOSE_SYMBOLS` (đã hủy niêm yết, gõ
sai mã, hoặc lọt HNX/UPCOM vào sổ lệnh) vẫn được xếp ở đầu — hút thử vẫn rẻ hơn bỏ sót.

### Ngân sách thời gian cho cả khối hút giá

21 lô ở ~0,6 giây/lô (đo thực tế) là khoảng 13 giây — nhưng edge function có giới hạn
wall-clock, và Yahoo chậm hoặc treo giữa chừng vẫn có thể xảy ra trên thực tế. Thay vì
để cả invocation chết vì vượt giới hạn của Supabase, `fetchYahooPrices` có một ngân
sách thời gian cho TOÀN BỘ khối gọi (mặc định **90 giây**, hằng số `FETCH_BUDGET_MS`
trong prices.ts) — hết ngân sách thì DỪNG SẠCH trước khi gọi lô tiếp theo (không cắt
ngang một lô đang chạy), trả về đúng những gì đã hút được.

Kết quả trả về (`YahooFetchResult`) có cờ `hetNganSach: boolean` tách riêng khỏi lỗi
của từng lô — `index.ts` đọc cờ này để không lẫn hai tình huống: "một lô bị Yahoo từ
chối" (dòng lỗi chứa `HTTP`) và "hết giờ, còn lô chưa kịp gọi" (dòng lỗi chứa "hết
ngân sách", cũng vẫn góp một dòng vào `kq.loi` — xem mục log-line dưới). Vì các lô đã
xếp mã đang giữ lên đầu (mục trên), một lượt bị cắt ngang vẫn ưu tiên có giá cho mã
người dùng thực sự đang cần trước khi ngân sách cạn.

## Đã chốt gì

| Quyết định | Vì sao |
|---|---|
| Nguồn giá: **Yahoo Finance spark API** (`query1.finance.yahoo.com/v8/finance/spark`) | SSI bị chặn 403 ở dải IP Supabase (xem trên). Yahoo trả 200, nhận nhiều mã một lần. |
| Giá lấy `close[0]`, không rơi về gì khác | Không phải số hữu hạn > 0 → **bỏ mã đó**, không ghi giá 0 — xem [prices.ts](../supabase/functions/stock-refresh/prices.ts). |
| Chỉ còn sàn **HOSE** | Hậu tố `.VN` của Yahoo chính là HOSE; HNX/UPCOM không có nguồn giá thay thế. Xem cảnh báo ở trên. |
| Tối đa **20 mã/lô** (`CHUNK_SIZE`) | Giới hạn cứng của Yahoo — trên 20 mã trả HTTP 400. Đo lại ngày 2026-08-06, xem mục trên. |
| Hút giá cho **CẢ sàn HOSE** (403 mã), không chỉ mã trong sổ lệnh | Mã vừa mua hôm nay có giá NGAY, không đợi lượt cron kế tiếp. Xem mục "Hút cả sàn HOSE" ở trên. |
| Mã đang giao dịch được gọi **TRƯỚC** phần còn lại của sàn (`buildFetchOrder`) | 21 lô tuần tự — lô gọi sau dễ hỏng hơn nếu Yahoo giới hạn tốc độ giữa chừng; mã người dùng thực sự giữ không được may rủi theo thứ tự cả sàn. |
| Ngân sách thời gian **90 giây** cho cả khối hút giá (`FETCH_BUDGET_MS`) | Edge function có giới hạn wall-clock; Yahoo chậm/treo giữa chừng thì dừng sạch, báo thật đã hút được bao nhiêu thay vì chết cả invocation. |
| Chia lô khi gọi Yahoo | URL không phình to với 403 mã, và một lô hỏng không kéo mất các lô đã gọi thành công. |
| Điền `stock_prices.name` từ danh sách tĩnh `HOSE_SYMBOLS` | Yahoo không trả tên công ty; bảng tự mô tả được chính nó thay vì luôn rỗng. Rỗng nếu mã không có trong danh sách. |
| Chạy ở server, không gọi thẳng từ app | Cả SSI lẫn Yahoo đều không trả header CORS cho phép trình duyệt của app gọi thẳng. |
| Dùng lại `PUSH_CRON_SECRET` | Nó là "bí mật cho cron" nói chung, không riêng gì push-notify — không cần sinh thêm secret khác. |

## Kiến trúc

```
supabase/functions/stock-refresh/prices.ts     ← fetchYahooPrices (chia lô gọi Yahoo qua chunkSymbols,
                                                  gom lỗi từng lô, ngân sách thời gian FETCH_BUDGET_MS)
                                                  + parseYahooSpark (hàm thuần, test được, điền name từ
                                                  HOSE_SYMBOLS)
                                                  + buildFetchOrder (hàm thuần: mã đang giữ trước, phần
                                                  còn lại của sàn sau)
supabase/functions/stock-refresh/loadInput.ts  ← đọc account_balances + stock_trades, xếp thành
                                                  PortfolioAccount[]; loadTradedSymbols đọc mọi mã
                                                  từng giao dịch (không lọc theo tài khoản) — giờ chỉ
                                                  còn quyết định THỨ TỰ ưu tiên cho việc 1, không còn
                                                  quyết định mã nào được hút
supabase/functions/stock-refresh/index.ts      ← việc 1: loadTradedSymbols + HOSE_SYMBOLS → buildFetchOrder
                                                  → fetchYahooPrices → upsert stock_prices
                                                  việc 2: gọi _holdings.js + loadInput.ts, ghi
                                                  account_valuations
supabase/functions/stock-refresh/_holdings.js  ← gói từ src/features/assets/serverBundle.ts: holdingsFromTrades,
                                                  brokerCash, portfolioValue, sessionPrices (từ holdings.ts, cùng
                                                  phép tính app đang dùng) + HOSE_SYMBOLS (từ hoseSymbols.ts, danh
                                                  sách 403 mã cho việc 1 và cho tên công ty)
```

`parseYahooSpark` tách khỏi `fetchYahooPrices` để test bằng file mẫu
([testdata/yahoo-spark-sample.json](../supabase/functions/stock-refresh/testdata/yahoo-spark-sample.json),
hút thật từ FPT/VNM/HPG), không cần mạng hay Deno. `chunkSymbols` và `buildFetchOrder`
cũng là hàm thuần, tách riêng cùng lý do — xem `prices.test.ts`.

`loadInput.ts` theo đúng khuôn của `push-notify/loadInput.ts`: chỉ đọc bảng và xếp dữ
liệu vào đúng ô, không tự cộng trừ tiền hay ngày. Phép tính thật — gộp sổ lệnh ra số
cổ/giá vốn (`holdingsFromTrades`), tiền chưa đầu tư (`brokerCash`), giá trị thị
trường (`portfolioValue`) — nằm trong `_holdings.js`, cùng một hàm thuần mà trình
duyệt gọi khi hiện trang Tài sản. Nhờ vậy chuông trong app và snapshot do cron ghi
không bao giờ nói lệch nhau. Việc 2 (từ `loadPortfolioAccounts` trở đi) **không đổi**
khi chuyển nguồn giá — nó không quan tâm giá tới từ đâu, chỉ đọc `stock_prices`.

## Triển khai

### 1. Deploy function

```bash
npm run bundle:rules && supabase functions deploy stock-refresh --project-ref <project-ref> --no-verify-jwt
```

`--no-verify-jwt` vì cron không phải người dùng đăng nhập, không có JWT — đó là lý do
có `x-cron-secret`.

### 2. Bật `pg_cron` và `pg_net`

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

`pg_cron` tạo schema `cron` (hẹn giờ trong database), `pg_net` tạo schema `net` (gọi HTTP
từ database). Thiếu bước này thì bước sau nổ ngay dòng đầu:

```
ERROR: 3F000: schema "cron" does not exist
```

Bản đầu của tài liệu này bỏ sót bước trên vì cho rằng cron đã sẵn sàng từ `push-notify`
([docs/push-notification.md](push-notification.md) có đúng hai dòng này). Nhưng
`push-notify` chưa từng được deploy lên project, nên chưa ai bật — và người đầu tiên hẹn
cron đã vấp (2026-08-06). Chạy `create extension if not exists` nhiều lần không sao, nên
cứ chạy kể cả khi nghĩ là đã có.

### 3. Hẹn cron mỗi ngày

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
stock-refresh {"soMaCoGia":42,"daGhi":3,"boQua":{"nguoi-dung-da-go-tay":1},"loi":[]}
```

- `soMaCoGia` — số mã ghi được giá vào `stock_prices` ở lượt này (việc 1; chỉ HOSE,
  hút cho cả sàn — mã đã từng giao dịch, `loadTradedSymbols`, được gọi trước phần còn
  lại của `HOSE_SYMBOLS`, xem `buildFetchOrder`).
- `daGhi` — số tài khoản vừa được ghi snapshot mới vào `account_valuations` (việc 2).
- `boQua` — số tài khoản bị bỏ qua ở việc 2, gom theo lý do. Xem bảng dưới để biết
  từng lý do nghĩa là gì và có cần làm gì không.
- `loi` — lỗi (một lô Yahoo hỏng dạng `gia: ...`, hết ngân sách thời gian giữa chừng
  dạng `gia: hết ngân sách thời gian hút giá sau N/M lô (đã hút K mã)`, hoặc cả khối
  việc 2 nếu nó throw — xem ghi chú cuối bảng để phân biệt ba dạng dòng).

### Ý nghĩa từng lý do trong `boQua`

Bảng cho người đọc log sáu tháng sau, không có ngữ cảnh gì khác ngoài dòng log này.

| Lý do | Nghĩa là gì | Cần làm gì |
|---|---|---|
| `so-lenh-co-lo-hong` | `holdingsFromTrades` báo `oversold` khác rỗng: có lệnh bán (hoặc `adjust` âm) nhiều hơn số cổ đang giữ tại thời điểm đó. Sổ lệnh của tài khoản này có một lỗ hổng — thường là quên ghi một lệnh mua, hoặc ghi sai ngày làm đảo thứ tự mua/bán. | Mở tài khoản trong app, xem lại từng lệnh theo `symbol`, tìm lệnh mua bị thiếu hoặc ngày bị sai rồi sửa/ghi bổ sung. Cron sẽ tự ghi lại vào lần chạy kế tiếp, không cần gọi tay. |
| `tien-chua-dau-tu-am` | `brokerCash` ra số âm: tổng tiền đã chi cho các lệnh mua (trừ tiền thu từ lệnh bán) nhiều hơn số dư sổ của tài khoản (nạp − rút). Thường là quên ghi giao dịch nạp tiền vào tài khoản chứng khoán trước khi ghi lệnh mua. | Kiểm tra tab giao dịch của tài khoản này: có thiếu lần chuyển tiền vào không? Ghi bổ sung giao dịch nạp tiền (không phải lệnh mua) cho khớp số đã bỏ ra mua cổ phiếu. |
| `thieu-gia-moi-ma` | `portfolioValue` trả `marketValue = null` vì **mọi** mã đang giữ đều không có giá trong `stock_prices` (không phải sổ lệnh sai, cash cũng không âm). Thường gặp nhất bây giờ: tài khoản chỉ giữ mã **HNX/UPCOM** (Yahoo không có giá cho hai sàn đó — xem mục "Giới hạn phải chấp nhận" ở trên). Cũng có thể là mã đã huỷ niêm yết. | Nếu mã thuộc HNX/UPCOM: đây là giới hạn đã biết, không có cách khắc phục tự động — ghi giá trị tài khoản đó bằng tay (sheet "Cập nhật giá trị") như trước khi có tính năng này. Nếu mã là HOSE nhưng SSI/Yahoo đổi mã, cập nhật lại `symbol` trong lệnh cho khớp. Nếu đã huỷ niêm yết, ghi lệnh `adjust` phù hợp hoặc chấp nhận tài khoản này tạm không tự chạy được. |
| `nguoi-dung-da-go-tay` | Hàng `account_valuations` của đúng ngày phiên đó đã có sẵn với `source = 'manual'` — người dùng đã tự gõ số cho ngày này (sheet "Cập nhật giá trị"). Cron **cố ý** không đè lên: số người dùng gõ tay luôn thắng. | Không cần làm gì — đây là hành vi đúng, không phải lỗi. Nếu muốn để cron tự tính lại, xoá hàng `manual` đó (hoặc đổi `source` thành `'auto'`) rồi gọi lại function. |
| `gia-le-phien-cu` | `fetchYahooPrices` chia lô (và có thể dừng sớm vì hết ngân sách thời gian) nên có lượt chỉ một phần số mã hút được giá mới. `sessionPrices` lấy ngày phiên lớn nhất trong `stock_prices` làm mốc chung; tài khoản này đang giữ ít nhất một mã mà giá của nó vẫn còn ở ngày phiên CŨ hơn mốc đó — tức lô của mã đó chưa hút được ở lượt này. Giá tuy có và > 0 (không rơi vào `thieu-gia-moi-ma`) nhưng là giá hôm qua, không phải hôm nay. | Xem `loi` của cùng lượt chạy đó có dòng `gia: ...` nào không (lỗi lô hay hết ngân sách). Nếu lô đã hút lại được ở lượt sau, cron tự ghi bình thường — không cần làm gì. Nếu lặp lại nhiều ngày liền, kiểm `fetchYahooPrices`/`prices.ts` — có thể ngân sách 90s đã không đủ, cần tăng `FETCH_BUDGET_MS`. |

Ghi chú về lỗi trong `loi` ở việc 2 — hai dạng dòng khác nhau, ứng với hai tình huống
khác nhau, đọc kỹ để khỏi hiểu lầm khi debug một lượt chạy dở dang:

- **`ghi gia tri: <thông điệp>` = lỗi cả lượt, xảy ra TRƯỚC vòng lặp tài khoản** — đọc
  `stock_prices` lỗi, `loadPortfolioAccounts` lỗi, hoặc bảng giá rỗng nên không tính
  được `phien`. Việc 2 throw sớm, **không** tài khoản nào được xét: `daGhi` và `boQua`
  giữ nguyên giá trị mặc định (0 và rỗng) của lượt chạy đó.
- **`tài khoản <8 ký tự đầu id>…: <thông điệp>` = lỗi của RIÊNG một tài khoản** — mỗi
  tài khoản có `try/catch` của mình (mạng chập chờn, hết kết nối pool, ...), nên lỗi
  đó không làm chết cả lượt: những tài khoản khác — kể cả tài khoản đứng sau nó trong
  danh sách — vẫn được xét và ghi bình thường. `daGhi` và `boQua` ở lượt chạy này là số
  **thật** của các tài khoản đã chạy xong, không phải giá trị mặc định — chỉ tài khoản
  bị lỗi là không có mặt trong cả hai.
- **`gia: <thông điệp>` = việc 1, có HAI dạng, phân biệt bằng nội dung**:
  - chứa `HTTP` (vd. `gia: Yahoo spark: HTTP 400 (lô 5/21)`) = **một lô Yahoo cụ thể bị
    từ chối** — lô khác đã gọi thành công vẫn có mặt trong `soMaCoGia`, không mất theo;
  - chứa "hết ngân sách" (vd. `gia: hết ngân sách thời gian hút giá sau 15/21 lô (đã
    hút 280 mã)`) = **cả khối hút giá bị cắt ngang vì vượt `FETCH_BUDGET_MS`** (mặc
    định 90 giây), không phải lô nào bị Yahoo từ chối — những lô đã gọi trước đó (ưu
    tiên mã đang giữ, xem `buildFetchOrder`) vẫn có mặt trong `soMaCoGia`.

Việc 1 (hút giá) không bị ảnh hưởng bởi hai tình huống của việc 2 vì nó chạy và log
kết quả trước khi việc 2 bắt đầu.

### Mã trạng thái HTTP trả về

`200` là mặc định. Trả `500` ở đúng hai trường hợp, cả hai đều nghĩa là lượt chạy này
**không đáng tin**, khác với "chạy tốt nhưng vài chỗ lẻ tẻ bị bỏ qua":

- **Việc 1 chết hoàn toàn**: `soMaCoGia === 0` VÀ có lỗi trong `loi` — nghĩa là mọi lô
  Yahoo đều hỏng, Yahoo không trả giá cho mã nào, hoặc hết ngân sách thời gian ngay ở
  lô đầu tiên (hiếm, nhưng vẫn nghĩa là lượt này không đáng tin). Từ khi việc 1 hút cả
  sàn HOSE (không chỉ mã trong sổ lệnh), danh sách mã cần hút không bao giờ rỗng nữa —
  ca "sổ lệnh rỗng, im lặng đúng" của bản trước không còn áp dụng. Một lô lỗi hoặc một
  lần hết ngân sách mà lô khác vẫn ghi được trước đó (`soMaCoGia > 0`) **không** tính
  vào đây — đó vẫn là kết quả từng phần dùng được, không phải chết hoàn toàn.
- **Việc 2 gãy trước vòng lặp tài khoản** (dòng `ghi gia tri: <thông điệp>` trong
  `loi`): đọc `stock_prices` lỗi, `loadPortfolioAccounts` lỗi, hoặc bảng giá rỗng nên
  không tính được `phien`. Không tài khoản nào được xét trong lượt này.

Lỗi của **một** tài khoản riêng lẻ (dòng `tài khoản <id>…: <thông điệp>` trong `loi`,
xem bảng ở trên) KHÔNG kéo status xuống 500 — những tài khoản khác trong lượt đó vẫn
được ghi bình thường, nên đây vẫn là một lượt chạy có ích. Thiếu một trong ba biến môi
trường bắt buộc (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PUSH_CRON_SECRET`) cũng
trả `500` kèm `loi` nói rõ tên biến còn thiếu, trước khi chạm tới cả hai việc.

## Chạy thử tại máy

```bash
supabase functions serve stock-refresh --no-verify-jwt
```

```bash
curl -i -X POST http://localhost:54321/functions/v1/stock-refresh -H "x-cron-secret: <PUSH_CRON_SECRET>"
```

Trả về `200` với body kiểu
`{"soMaCoGia":403,"daGhi":3,"boQua":{},"loi":[]}` — `soMaCoGia` giờ cỡ vài trăm (cả sàn
HOSE), không còn chỉ bằng số mã trong sổ lệnh.
Gọi thiếu header `x-cron-secret` phải trả `401 Sai bí mật cron`.

## Chỗ đã kiểm và chỗ chưa

| Phần | Trạng thái |
|---|---|
| `parseYahooSpark` — đọc payload spark thật của Yahoo (FPT/VNM/HPG), bóc hậu tố `.VN`, `trading_date` theo giờ Việt Nam, bỏ mã giá null/0/âm, `prior_close` null khi `chartPreviousClose` thiếu/hỏng, payload lạ không nổ, `name` điền từ `HOSE_SYMBOLS` (rỗng nếu mã lạ) | ✅ test, chạy trên file mẫu thật `testdata/yahoo-spark-sample.json` |
| `chunkSymbols` chia đúng ranh giới 20 mã/lô (giới hạn cứng của Yahoo, đo lại 2026-08-06) | ✅ test canh ranh giới: 20 mã vẫn một lô, 21 mã đã phải chia 20+1, 45 mã chia 20+20+5 |
| `buildFetchOrder` xếp mã đang giữ lên trước, không trùng, giữ cả mã giữ mà không có trong universe | ✅ test |
| `fetchYahooPrices` gọi được Yahoo thật (với `CHUNK_SIZE` cũ, đã sai) | ✅ đã đo `curl` tới `query1.finance.yahoo.com/v8/finance/spark` từ function đã deploy (region Mumbai) ngày 2026-08-06, trả `200` với ≤20 mã, **400** với >20 mã (xem mục "Giới hạn cứng" ở trên) |
| `fetchYahooPrices` dừng sạch khi hết `FETCH_BUDGET_MS`, báo `hetNganSach` tách khỏi lỗi lô | ✅ test với `fetch` giả lập + đồng hồ giả (không gọi mạng thật) |
| Ghi vào `stock_prices` (upsert thật) | ✅ **đã chạy thật** trên project 2026-08-06: gọi `POST /stock-refresh` trả `{"soMaCoGia":388,"daGhi":0,"boQua":{},"loi":[]}`. `loi` rỗng nghĩa là không lô nào hỏng và mọi `upsert` đều qua (code `throw` khi upsert lỗi). 388/403 mã có giá — 15 mã còn lại Yahoo không có, xem mục dưới |
| `_holdings.js` xuất đúng `holdingsFromTrades`/`brokerCash`/`portfolioValue`/`sessionPrices`/`toISODate`/`HOSE_SYMBOLS`, khớp `src/features/assets/holdings.ts` + `hoseSymbols.ts` | ✅ `tests/pushBundle.test.ts` so byte-for-byte bundle gói lại với file đã commit, và kiểm đủ export |
| `loadPortfolioAccounts` lọc đúng loại `investment` + `VND` + chưa lưu trữ + có sổ lệnh | ✅ đọc kỹ theo hợp đồng, khớp cột trong migration 0016/0026/0035 — **chưa chạy thật** với Postgres |
| `loadTradedSymbols` gom đúng mã duy nhất, không lọc theo tài khoản (giờ chỉ còn quyết định THỨ TỰ ưu tiên, không còn quyết định mã nào được hút) | ✅ đọc code — dedupe qua `Set`, không phân biệt tài khoản đủ điều kiện hay không, khớp bảng `stock_trades` — **chưa chạy thật** với Postgres |
| Van bỏ qua `so-lenh-co-lo-hong` / `tien-chua-dau-tu-am` / `thieu-gia-moi-ma` / `gia-le-phien-cu` không ghi gì | ✅ đọc code — cả bốn đều `continue` trước khối `upsert`; `sessionPrices` có 5 test riêng ở `src/features/assets/holdings.test.ts` |
| Số gõ tay (`source='manual'`) không bị đè | ✅ đọc code — đọc trước, so `source`, `continue` nếu là `manual`. **Chưa kiểm bằng UI + DB thật** (Step 4 của brief) |
| `valued_on` = ngày phiên (không phải hôm nay), và tính theo phiên MỚI NHẤT dù một lô hụt | ✅ đọc code — `phien` = `session` từ `sessionPrices`, lấy `trading_date` lớn nhất trong `stock_prices`; không có chỗ nào dùng `new Date()` cho `valued_on` hay cho `trading_date` (đổi từ `timestamp` Yahoo qua `Intl.DateTimeFormat` với `timeZone: 'Asia/Ho_Chi_Minh'`); mã ở phiên cũ hơn bị chặn bởi `gia-le-phien-cu`, không lọt vào `priceBySymbol` một cách âm thầm |
| Cài mới (chưa ai ghi lệnh) không lỗi | ✅ đọc code — `loadTradedSymbols` trả mảng rỗng nhưng `buildFetchOrder` vẫn trả về cả `HOSE_SYMBOLS` (universe không rỗng) → việc 1 vẫn chạy bình thường, không có ca đặc biệt "sổ lệnh rỗng" nữa; `loadPortfolioAccounts` trả mảng rỗng nên vòng lặp tài khoản ở việc 2 không chạy, `daGhi`/`boQua` giữ 0/rỗng, status vẫn `200` |
| Gọi thật `POST /stock-refresh` | ✅ **đã chạy thật** trên project 2026-08-06 (không qua `supabase functions serve` — máy dev không có Docker nên không chạy Supabase local được; gọi thẳng function đã deploy còn sát thực tế hơn) |
| Ghi thật vào `account_valuations`, xem "Tổng tài sản"/"Hiệu quả đầu tư" tự đúng trên UI | ❌ **chưa kiểm** — cần môi trường sống (xem mục dưới) |
| `cron.schedule` đã chạy thật, `cron.job`/`cron.job_run_details` có hàng | ❌ **chưa kiểm** — cần deploy lên project Supabase thật |

### Chưa làm được ở máy này — cần kiểm khi có môi trường sống

Cập nhật 2026-08-06: `supabase` CLI **có** (chạy qua `npx supabase`, không cần cài), và
function đã được deploy + gọi thật trên project — nửa hút giá coi như đã chứng minh. Thứ
vẫn chưa chạy là Docker (nên không dựng được Supabase local) và **nửa ghi `account_valuations`**,
vì nửa đó chỉ chạy khi có tài khoản đủ tư cách, mà muốn vậy phải có sổ lệnh thật.

Việc còn lại trước khi tin tưởng cron chạy production:

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
