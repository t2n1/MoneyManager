# Hút bảng giá cổ phiếu Việt Nam (SSI iBoard)

Edge function `stock-refresh` chạy mỗi chiều sau khi ba sàn Việt Nam đóng cửa, hút
bảng giá mới nhất và ghi vào `stock_prices`. Task này chỉ làm nửa hút giá; nửa tính
giá trị thị trường cho từng tài khoản nối ở Task 8 — xem ghi chú trong
[index.ts](../supabase/functions/stock-refresh/index.ts).

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
supabase/functions/stock-refresh/prices.ts    ← fetchBoard (gọi SSI) + parseBoard (hàm thuần, test được)
supabase/functions/stock-refresh/index.ts     ← vòng qua 3 sàn, upsert vào stock_prices
supabase/functions/stock-refresh/_holdings.js ← gói từ src/features/assets/holdings.ts, dùng ở Task 8
```

`parseBoard` tách khỏi `fetchBoard` để test bằng file mẫu
([testdata/hose-sample.json](../supabase/functions/stock-refresh/testdata/hose-sample.json),
đã cắt còn 3 mã), không cần mạng hay Deno.

## Triển khai

### 1. Deploy function

```bash
npm run bundle:rules && supabase functions deploy stock-refresh --project-ref <project-ref> --no-verify-jwt
```

`--no-verify-jwt` vì cron không phải người dùng đăng nhập, không có JWT — đó là lý do
có `x-cron-secret`.

### 2. Hẹn cron mỗi ngày (sau giờ đóng cửa, Task 8 sẽ nối thêm bước tính giá trị)

```sql
select cron.schedule(
  'stock-refresh-daily',
  '0 8 * * 1-5',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/stock-refresh',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "<PUSH_CRON_SECRET>"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
```

Giờ ghi theo UTC: `0 8 * * 1-5` = 15:00 giờ Việt Nam (UTC+7), sau khi sàn đóng cửa
lúc 15:00. Điều chỉnh nếu server chạy múi giờ khác.

Xem lịch đã hẹn: `select * from cron.job;` · Lịch sử chạy:
`select * from cron.job_run_details order by start_time desc limit 20;`

## Cách xem log

```bash
supabase functions logs stock-refresh
```

Mỗi lượt chạy log một dòng `stock-refresh {"giaTheoSan":{...},"loi":[...]}` — đếm
được ngay mã ghi được theo sàn và lỗi nếu có.

## Chạy thử tại máy

```bash
supabase functions serve stock-refresh --no-verify-jwt
```

```bash
curl -i -X POST http://localhost:54321/functions/v1/stock-refresh -H "x-cron-secret: <PUSH_CRON_SECRET>"
```

Trả về `200` với body kiểu `{"giaTheoSan":{"hose":407,"hnx":...,"upcom":...},"loi":[]}`.
Gọi thiếu header `x-cron-secret` phải trả `401 Sai bí mật cron`.

## Chỗ đã kiểm và chỗ chưa

| Phần | Trạng thái |
|---|---|
| `parseBoard` — đọc bảng giá thật của SSI, rơi về `priorClosePrice`/`refPrice`, bỏ mã không có giá dùng được | ✅ 6 test, chạy trên file mẫu thật (đã cắt còn 3 mã) |
| `fetchBoard` gọi được SSI thật | ✅ đã đo `curl` tới `iboard-query.ssi.com.vn/stock/exchange/hose` ngày 2026-08-05, trả `200` |
| Ghi vào `stock_prices` (upsert thật) | ❌ **chưa kiểm** — bảng `stock_prices` chưa tồn tại (tạo ở migration của một task sau) |
| `supabase functions serve` tại máy + gọi thử `POST /stock-refresh` | ❌ **chưa kiểm** — máy dev chưa cài Supabase CLI / chưa chạy Supabase local |
| Tính giá trị thị trường từ `_holdings.js` | Chưa làm ở task này — nối ở Task 8 |
