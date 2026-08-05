# Design: Tự cập nhật giá cổ phiếu Việt Nam (nối tiếp mục AE)

> **Ngày:** 2026-08-05 · **Trạng thái:** đã chốt, chưa cài đặt.
> Nối tiếp [`2026-07-20-gia-tri-dau-tu-design.md`](2026-07-20-gia-tri-dau-tu-design.md)
> — spec đó xếp "tự lấy giá qua API" vào **ngoài phạm vi v1**; đây là v2 của đúng
> phần bị hoãn. Dùng lại kiến trúc server của
> [`push-notification.md`](../../push-notification.md) (edge function + pg_cron + bí mật cron).
> Bám cụm **"tài sản"** trong [`data-model-matrix.md`](../../data-model-matrix.md).

## Vấn đề

Tài khoản đầu tư hiện chỉ lưu **một con số tổng** giá trị thị trường
(`account_valuations.market_value`), do người dùng tự gõ qua sheet "Cập nhật giá trị".
App **không biết** người dùng đang giữ mã nào, bao nhiêu cổ.

Chủ app mua cổ phiếu Việt Nam. Hệ quả của việc nhập tay:

- Giá cổ phiếu đổi mỗi phiên, không ai gõ lại mỗi ngày → Tổng tài sản, Tài sản ròng,
  %/năm (XIRR), lịch sử net worth đều chạy trên số cũ hàng tuần.
- Thông báo đẩy (mục J) đọc cùng dữ liệu đó → nhắc dựa trên số lạc hậu.
- Không thấy được từng mã lời/lỗ bao nhiêu — thứ duy nhất người mua cổ phiếu lẻ muốn xem.

## Quyết định đã chốt (người dùng duyệt 2026-08-05)

1. **Ghi từng lệnh mua/bán**, không chỉ khai số cổ đang giữ. App tự cộng ra số cổ và giá
   vốn từng mã. Người dùng chọn phương án này để xem được lời/lỗ riêng mỗi mã.
2. **Server tự chạy mỗi chiều**, không phải "tính khi mở app". Đây là cách duy nhất để
   con số đúng cả khi người dùng không mở app — mà thông báo đẩy thì chạy khi app đóng.
3. **Ghi vào chính `account_valuations`**, không thêm đường tính tổng tài sản thứ hai.
4. **Số gõ tay luôn thắng số máy tính.** Cron không bao giờ đè hàng người dùng tự nhập.
5. **Không có nút bật/tắt.** Tài khoản `investment` + tiền `VND` + có ≥1 dòng lệnh → tự chạy.
6. **Có ghi phí và thuế** từng lệnh (người dùng duyệt) — để giá vốn đúng thực tế.

### Vì sao ghi vào `account_valuations` chứ không thêm bảng "giá trị danh mục"

Mọi thứ hạ nguồn đã đọc từ đúng ô đó: `assetBreakdown` (Tổng tài sản, lãi/lỗ chưa thực
hiện), `InvestmentPerformanceSection` (XIRR ba mức), `NetWorthHistorySection`,
`AssetsTrendView`, và bộ luật thông báo. Ghi vào đó nghĩa là **không sửa một dòng nào**
trong `aggregate.ts` / `investment.ts` / `xirr.ts`. Thêm bảng riêng thì phải sửa hết,
và từ đó trở đi có hai nguồn sự thật về "tài khoản này đáng bao nhiêu".

## Nguồn giá

Đã thử thực tế ngày 2026-08-05:

| Nguồn | Kết quả | Kết luận |
|-------|---------|----------|
| `iboard-query.ssi.com.vn/stock/exchange/{hose,hnx,upcom}` | 200, HOSE 407 mã, đủ cả 3 sàn, `matchedPrice` theo đồng, `tradingDate` | **Nguồn chính** |
| `iboard-query.ssi.com.vn/stock/{SYMBOL}` | 200, một mã, payload nhỏ | Dùng khi cần tra lẻ |
| `query1.finance.yahoo.com/v8/finance/chart/FPT.VN` | 200, `regularMarketPrice` 70300, currency VND | **Dự phòng**, chỉ có HOSE |
| `apipubaws.tcbs.com.vn/...` | Cloudflare chặn (`Just a moment...`) | Loại |
| `finfo-api.vndirect.com.vn/v4/stock_prices` | Trả rỗng | Loại |
| `stooq.com` | Không có mã Việt Nam | Loại |

Đối chiếu chéo cùng thời điểm: FPT 70.300đ (SSI `matchedPrice`) = 70.300đ (Yahoo
`regularMarketPrice`). VNM 58.600đ, HPG 22.000đ. Giá của SSI ở **đơn vị đồng**, khớp
đúng `CURRENCIES.VND.decimals = 0` nên minor units = đồng, không phải nhân chia gì.

> Cẩn thận: endpoint biểu đồ `iboard-api.ssi.com.vn/statistics/charts/history` trả giá
> ở đơn vị **nghìn đồng** (`71.5` = 71.500đ), khác endpoint bảng giá. Nếu sau này dùng
> nó để dựng lịch sử thì phải nhân 1000.

Cả hai nguồn đều **miễn phí, không cần khoá** → giữ được ràng buộc 0đ của backlog.

### Vì sao bắt buộc đi qua server (không lấy giá thẳng từ app)

Đã kiểm tra header CORS:

- SSI trả `Access-Control-Allow-Origin: https://iboard.ssi.com.vn` — chỉ trang của họ gọi được.
- Yahoo không trả header CORS nào.

Nên trình duyệt không thể gọi trực tiếp. Đây **không phải** lựa chọn kiến trúc mà là
ràng buộc: khác `src/lib/rates.ts` (open.er-api.com cho CORS nên `fetchRates` chạy được
ở client), phần giá cổ phiếu buộc phải qua server. Kèm hai điều may:

- Một lần gọi 3 bảng là có **hết mã của cả sàn** → không cần biết ai giữ gì, và một lần
  hút dùng chung cho mọi user.
- Bảng HOSE nặng 732KB — cỡ này chấp nhận được ở server, sẽ rất tệ nếu tải về điện thoại.

## Mô hình khái niệm

Cho một tài khoản đầu tư có sổ lệnh:

| Khái niệm | Nguồn | Ý nghĩa |
|-----------|-------|---------|
| **Số dư sổ** (`balance`) | view `account_balances` (đã có) | tiền nạp − rút qua giao dịch Chuyển khoản, cộng cổ tức tiền nếu ghi là thu nhập |
| **Số cổ đang giữ** | cộng dồn `stock_trades` theo mã | mua + điều chỉnh − bán |
| **Giá vốn** mỗi mã | cộng dồn `stock_trades` | tiền mua **đã gồm phí**; bán thì trừ theo giá vốn bình quân |
| **Tiền chưa đầu tư** | dẫn xuất | `balance` − tiền đã bỏ ra mua + tiền thu về khi bán |
| **Giá trị thị trường** | dẫn xuất | Σ(số cổ × giá hôm nay) + tiền chưa đầu tư → ghi vào `account_valuations` |

Lãi/lỗ chưa thực hiện vẫn là `market_value − balance` như cũ, **không đổi công thức**.

### Vì sao phải cộng "tiền chưa đầu tư"

Tiền nạp vào công ty chứng khoán mà chưa mua gì thì không thuộc mã nào. Nếu giá trị thị
trường chỉ đếm cổ phiếu, phần tiền đó biến mất khỏi Tổng tài sản. Cộng nó vào thì con số
khép kín — và tiện thể lãi đã hiện thực hoá (bán ở giá lời) tự hiện ra dưới dạng tiền,
đúng như nó đang nằm ở tài khoản chứng khoán thật.

### Kiểm chứng bằng số

Nạp 100.000.000đ vào tài khoản chứng khoán → `balance` = 100.000.000.

Mua 1.000 FPT @ 70.000, phí 105.000 (0,15%):

| | |
|---|---|
| Tiền chưa đầu tư | 100.000.000 − 70.105.000 = **29.895.000** |
| FPT | 1.000 cổ, giá vốn 70.105.000, bình quân 70.105đ/cổ |

Giá lên 75.000:

| | |
|---|---|
| Giá trị cổ phiếu | 75.000.000 |
| `market_value` ghi vào sổ | 75.000.000 + 29.895.000 = **104.895.000** |
| Lãi/lỗ app hiện ra | 104.895.000 − 100.000.000 = **+4.895.000** |

Đúng bằng 75.000.000 − 70.105.000. Công thức cũ của app vẫn ra số đúng.

Bán hết 1.000 cổ @ 75.000, phí 112.500, thuế 75.000 → thu về 74.812.500:

| | |
|---|---|
| Tiền chưa đầu tư | 100.000.000 − 70.105.000 + 74.812.500 = **104.707.500** |
| Cổ phiếu | 0 |
| `market_value` | **104.707.500** → lãi **+4.707.500** |

Đúng bằng lãi thật sau phí và thuế. Lãi đã hiện thực hoá nằm lại dưới dạng tiền, không
rơi đâu mất.

### Tiền chưa đầu tư ra số âm = dấu hiệu ghi thiếu

Nếu tổng tiền mua vượt số dư sổ, nghĩa là người dùng đã ghi lệnh mua nhưng quên ghi lần
nạp tiền tương ứng. Con số âm đó là **thứ đáng báo động, không phải để làm tròn cho đẹp**:
UI hiện cảnh báo, và server **không ghi snapshot** cho tài khoản đó — thà giữ số cũ hơn
là ghi một con số biết chắc là sai.

## Schema (migration `0035_stock_prices_trades.sql`)

### 1. `stock_prices` — bảng giá chung

| Cột | Kiểu / ý nghĩa |
|-----|----------------|
| `symbol` | text **primary key** — `'FPT'` (mã Việt Nam không trùng giữa các sàn) |
| `exchange` | text check in (`'hose'`,`'hnx'`,`'upcom'`) |
| `name` | text — `companyNameVi` của SSI, để gợi ý khi nhập |
| `price` | bigint check > 0 — **đồng/cổ**; `matchedPrice`, hụt thì `priorClosePrice` |
| `prior_close` | bigint null — giá tham chiếu, để hiện % thay đổi trong ngày |
| `trading_date` | date not null — ngày phiên mà giá này thuộc về |
| `updated_at` | timestamptz default now() |

RLS: bật, policy select cho `authenticated` với `using (true)`. Ghi chỉ qua service role
(bỏ qua RLS) — tức chỉ edge function ghi được.

> **Vì sao bảng này KHÔNG có `user_id`** (ngoại lệ duy nhất với nguyên tắc 0.5): giá cổ
> phiếu là dữ liệu công khai, giống hệt nhau với mọi user, và không suy ra được ai giữ gì
> từ nó. Nhân bản theo user chỉ để thoả hình thức thì đổi lấy 407 hàng × số user và một
> vòng lặp hút giá cho mỗi người. Riêng tư nằm ở `stock_trades` — bảng đó có `user_id` và
> RLS như mọi bảng khác.

### 2. `stock_trades` — sổ lệnh

| Cột | Kiểu / ý nghĩa |
|-----|----------------|
| `id` | uuid pk |
| `user_id` | uuid → auth.users, cascade |
| `account_id` | uuid — FK `(account_id, user_id) → accounts(id, user_id)` on delete cascade |
| `symbol` | text not null |
| `kind` | text check in (`'buy'`,`'sell'`,`'adjust'`) |
| `traded_on` | date not null default current_date |
| `quantity` | bigint not null — số cổ |
| `price` | bigint not null default 0 check ≥ 0 — **đồng/cổ** |
| `fee` | bigint not null default 0 check ≥ 0 — phí giao dịch, đồng |
| `tax` | bigint not null default 0 check ≥ 0 — thuế bán 0,1%, đồng |
| `note` | text default '' |
| `created_at`, `updated_at` | timestamptz; `updated_at` qua trigger `moddatetime` (0.7) |

Ràng buộc theo loại lệnh:

```sql
check (
  case kind
    when 'adjust' then quantity <> 0 and price = 0
    else quantity > 0 and price > 0
  end
)
```

Index `(account_id, traded_on)`. RLS `"own rows"` như mọi bảng.

### 3. Loại lệnh `'adjust'` — điều chỉnh số cổ

Dùng cho **cổ phiếu thưởng, cổ tức trả bằng cổ phiếu, chia tách** — số cổ tăng mà không
tốn tiền. Cộng `quantity` vào số cổ, **giá vốn không đổi** → giá vốn bình quân tự giảm,
đúng bản chất.

`quantity` cho phép **âm** ở riêng loại này, để xử lý gộp cổ phiếu (reverse split).

> Không có loại lệnh này thì mỗi lần được thưởng cổ phiếu, số cổ trong app sai vĩnh viễn
> và không có cách nào sửa ngoài việc bịa lại một lệnh mua giá 0. Cổ phiếu Việt Nam chia
> thưởng rất thường xuyên nên đây không phải trường hợp hiếm.
>
> Bảng SSI có sẵn trường `corporateEvents` — về lý có thể tự phát hiện, nhưng để **ngoài
> phạm vi**: đoán sai một sự kiện chia tách làm sai số cổ mà người dùng không biết,
> tệ hơn hẳn việc tự ghi một dòng.

### 4. `account_valuations` — đánh dấu nguồn

```sql
alter table public.account_valuations
  add column source text not null default 'manual'
    check (source in ('manual', 'auto'));
```

Cron ghi bằng một câu, **tự bỏ qua hàng gõ tay**:

```sql
insert into account_valuations (user_id, account_id, valued_on, market_value, note, source)
values (...)
on conflict (account_id, valued_on) do update
  set market_value = excluded.market_value,
      note         = excluded.note,
      source       = 'auto'
  where account_valuations.source = 'auto';
```

`where` trên `do update` là chỗ giữ quyết định 4: hàng `source='manual'` không bị chạm.
Mặc định `'manual'` nên mọi snapshot cũ tự thuộc về người dùng.

## Tầng ứng dụng

### `src/features/assets/holdings.ts` (mới, thuần, có test)

Cùng kiểu với `investment.ts` / `aggregate.ts`: không phụ thuộc React, mọi số ở minor
units, unit-test được.

```ts
export interface Trade {
  symbol: string
  kind: 'buy' | 'sell' | 'adjust'
  tradedOn: string          // ISO date
  quantity: number          // số cổ (âm chỉ khi kind='adjust')
  price: number             // đồng/cổ
  fee: number
  tax: number
}

export interface Holding {
  symbol: string
  quantity: number          // số cổ đang giữ (luôn > 0)
  costBasis: number         // đồng, đã gồm phí mua
  avgCost: number           // đồng/cổ
}

/** Cộng dồn sổ lệnh ra số cổ + giá vốn mỗi mã. Tự sắp theo traded_on. */
export function holdingsFromTrades(trades: Trade[]): {
  holdings: Holding[]       // chỉ mã còn giữ (quantity > 0), sắp theo costBasis giảm dần
  realizedPnl: number       // lãi/lỗ đã hiện thực hoá, đồng
  oversold: string[]        // mã bán quá số đang giữ → sổ lệnh có lỗ hổng
}

/** Tiền còn ở công ty chứng khoán. Âm = người dùng ghi thiếu lần nạp tiền. */
export function brokerCash(accountBalance: number, trades: Trade[]): number

export function portfolioValue(
  holdings: Holding[],
  priceBySymbol: Map<string, number>,
  cash: number,
): {
  marketValue: number | null   // null = không đáng tin, xem quy tắc dưới
  stockValue: number
  cash: number
  missingPrices: string[]      // mã chưa có giá → tạm dùng giá vốn
}
```

`marketValue` trả `null` ở đúng hai trường hợp:

- `cash < 0` — sổ lệnh thiếu lần nạp tiền, con số chắc chắn sai.
- **mọi** mã đang giữ đều thiếu giá — lúc đó tất cả rơi về giá vốn, kết quả bằng đúng số
  dư sổ, tức không nói thêm được gì so với việc chưa có snapshot nào.

Thiếu giá **một phần** thì vẫn trả số: mã thiếu tạm tính theo giá vốn và có tên trong
`missingPrices` để UI cảnh báo.

Quy tắc tính, chốt rõ để khỏi mơ hồ lúc cài đặt:

- **Thứ tự quan trọng.** Giá vốn bình quân phụ thuộc trình tự, nên phải sắp theo
  `traded_on` rồi `created_at` trước khi cộng dồn.
- **Mua:** `quantity += q`, `costBasis += q × price + fee`.
- **Bán:** `costBasis -= q × avgCost`, `quantity -= q`. Lãi đã hiện thực hoá
  `+= q × price − fee − tax − q × avgCost`. Dùng **giá vốn bình quân**, không FIFO — đúng
  cách công ty chứng khoán Việt Nam tính, và khớp với sổ của người dùng.
- **Điều chỉnh:** `quantity += q`, `costBasis` giữ nguyên.
- **Thiếu giá một mã:** tạm lấy `avgCost` thay giá thị trường và trả tên mã trong
  `missingPrices`. Đây là cùng cách app xử lý thiếu tỷ giá (`hasMissingRate`): ra số gần
  đúng kèm cảnh báo, thay vì âm thầm bỏ mã đó khỏi tổng.

### `src/types/database.types.ts`

Thêm `StockPriceRow`, `StockTradeRow`; đăng ký `stock_prices` + `stock_trades` trong
`Database`. `AccountValuationRow` thêm `source: 'manual' | 'auto'`.

### Repo (cài **cả hai** impl — nguyên tắc 0.1)

```ts
getStockPrices(): Promise<StockPriceRow[]>
getStockTrades(): Promise<StockTradeRow[]>          // toàn bộ của user, UI tự lọc
createStockTrade(input): Promise<StockTradeRow>
updateStockTrade(id, patch): Promise<StockTradeRow>
deleteStockTrade(id): Promise<void>
```

**Sao lưu (mục Z):** `BackupData` thêm `stockTrades`; **`BACKUP_VERSION` 6 → 7**, import
bản cũ (không có mảng này) vẫn chạy. `stock_prices` **không** vào bản sao lưu — dữ liệu
công khai, server hút lại được, nhét vào chỉ làm file backup phình ra vô ích.

## Phần server

### Edge function `stock-refresh`

`supabase/functions/stock-refresh/index.ts`, cùng khuôn `push-notify`: chuỗi bí mật qua
header `x-cron-secret`, deploy `--no-verify-jwt` (cron không có JWT). Dùng lại biến môi
trường `PUSH_CRON_SECRET` — nó là "bí mật cho cron" nói chung, không riêng gì push, và
đỡ được một bước cài đặt.

Hai việc, theo thứ tự:

1. **Hút giá.** Gọi 3 bảng SSI (hose/hnx/upcom) → upsert `stock_prices`. Giá lấy
   `matchedPrice`, bằng 0 (ngoài giờ / mã không khớp lệnh) thì rơi về `priorClosePrice`,
   hụt nữa thì `refPrice`. Một sàn lỗi thì vẫn ghi hai sàn còn lại và ghi log.
2. **Tính lại giá trị.** Với mỗi tài khoản `type='investment'`, `currency='VND'`, có ≥1
   dòng `stock_trades`: gọi **chính** `holdingsFromTrades` / `brokerCash` /
   `portfolioValue` đã gói từ `src/`, rồi upsert `account_valuations` bằng câu SQL ở trên.

   **Bỏ qua tài khoản, không ghi gì**, khi `marketValue === null` (tiền chưa đầu tư âm,
   hoặc thiếu giá mọi mã) **hoặc** `oversold` không rỗng (sổ lệnh có lỗ hổng). Hai van báo
   này chỉ nên làm app im lặng giữ số cũ, không bao giờ làm nó ghi một con số biết là sai.

`loadInput.ts` riêng cho function này (cùng vai với `loadInput.ts` của push-notify): đọc
`accounts`, `account_balances`, `stock_trades`, `stock_prices` bằng service role rồi gom
theo user — để `index.ts` chỉ còn phần điều phối, dễ đọc.

### Gói phép tính, không copy

`scripts/bundle-rules.mjs` hiện có một `ENTRY`/`OUTFILE`. Đổi thành danh sách hai mục:

| Entry | Outfile |
|-------|---------|
| `src/features/notifications/serverBundle.ts` | `supabase/functions/push-notify/_rules.js` |
| `src/features/assets/serverBundle.ts` (mới) | `supabase/functions/stock-refresh/_holdings.js` |

Thêm guard chống bundle cũ vào `tests/pushBundle.test.ts` (hoặc tách
`tests/serverBundles.test.ts`) cho cả hai mục.

> Đây là lý do phép tính nằm ở `src/` chứ không viết thẳng trong edge function: đúng lập
> luận đã ghi trong `bundle-rules.mjs` — hai bản sao của cùng một phép tính là chuyện sớm
> muộn lệch nhau, và lúc lệch thì danh mục trong app nói một đằng, số ghi vào sổ nói một nẻo.

### Hẹn giờ

```sql
select cron.schedule(
  'stock-refresh-daily',
  '45 8 * * 1-5',        -- 08:45 UTC = 15:45 giờ Việt Nam, thứ Hai–thứ Sáu
  $$ select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/stock-refresh',
       headers := '{"Content-Type":"application/json","x-cron-secret":"<PUSH_CRON_SECRET>"}'::jsonb
     ) $$
);
```

15:45 giờ Việt Nam là sau khi sàn đóng cửa (15:00) và khớp lệnh ATC xong.

**Việt Nam không có giờ mùa hè**, nên một mốc UTC cố định là đủ — khác hẳn push (mục J)
phải lưu giờ + múi giờ vì chủ app đổi nước và Mỹ có DST. Ở đây múi giờ được neo vào *sàn
giao dịch*, không vào người dùng.

**Ngày lễ:** bảng giá của SSI vẫn trả `tradingDate` của phiên trước. Function so
`trading_date` với snapshot `source='auto'` gần nhất; giống nhau → không ghi thêm. Nhờ vậy
lịch sử net worth không đầy những ngày trùng số.

## Màn hình

### 1. Khu "Danh mục" trên `AccountDetailPage` (`/assets/account/:accountId`)

Hiện khi tài khoản là `investment` và có ≥1 dòng lệnh. Mỗi dòng một mã: tên mã + tên công
ty, số cổ, giá vốn bình quân, giá hôm nay, lời/lỗ (± và %, xanh/đỏ). Sắp theo giá trị
giảm dần. Tiền hiển thị qua `formatMoney` để tôn trọng chế độ riêng tư.

Dưới danh sách:

- **Tiền chưa đầu tư** — số dương thì hiện bình thường; âm thì đổi thành cảnh báo
  "Bạn ghi lệnh mua nhiều hơn số tiền đã nạp — kiểm tra lại sổ lệnh."
- **Lãi đã chốt** (`realizedPnl`) khi khác 0 — phần lời/lỗ từ những lệnh đã bán. Ghi rõ
  trong dòng phụ rằng số này **đã nằm trong** tiền chưa đầu tư, không phải cộng thêm lần
  nữa; thiếu câu đó thì người đọc dễ tự cộng đôi.
- Dòng nhỏ: `theo giá phiên 05/08 · cập nhật 15:45`.
- Có mã trong `missingPrices` → cảnh báo vàng, cùng giọng với cảnh báo thiếu tỷ giá.
- Có mã trong `oversold` → cảnh báo bán quá số đang giữ.

### 2. Sheet "Ghi lệnh" (`TradeFormSheet`)

Chọn Mua / Bán / Điều chỉnh. Mã có gợi ý từ `stock_prices` (gõ "FP" ra FPT — tìm cả theo
tên công ty). Ngày mặc định hôm nay. Số cổ. Giá, phí, thuế dùng `MoneyField` (VND) như
mọi ô tiền khác trong app.

Phí và thuế app **tính gợi ý** rồi cho sửa: phí ≈ 0,15% giá trị lệnh, thuế bán = 0,1%.
Chọn Điều chỉnh thì ẩn giá/phí/thuế và cho nhập số cổ âm.

### 3. Sửa / xoá lệnh

Danh sách lệnh của tài khoản, mới nhất trước, bấm vào mở lại sheet để sửa hoặc xoá.

### 4. Sheet "Cập nhật giá trị" cũ — giữ nguyên

Vẫn cần cho các tài khoản đầu tư khác: vàng, crypto, quỹ mở ở Nhật. Với tài khoản đang
tự chạy thì thêm một dòng nhắc rằng số gõ tay sẽ được giữ cho ngày đó (quyết định 4).

## Chế độ demo

`demoRepo` seed sẵn một tài khoản chứng khoán VND với vài lệnh (FPT, VNM, HPG) và bảng
giá cứng, để xem thử toàn bộ khu Danh mục không cần mạng. `demoRepo.getAccountBalances`
đang tự tính `market_value` client-side nên phải tính luôn cả phần này.

## Kiểm thử

`src/features/assets/holdings.test.ts`:

- mua nhiều lần cùng mã → giá vốn bình quân đúng, có tính phí
- bán một phần → số cổ và giá vốn còn lại đúng, lãi hiện thực hoá đúng
- bán hết → `holdings` không còn mã đó, lãi khớp con số ở mục "Kiểm chứng bằng số"
- cổ phiếu thưởng → số cổ tăng, giá vốn tổng không đổi, bình quân giảm
- gộp cổ phiếu (`quantity` âm) → số cổ giảm, giá vốn không đổi
- lệnh nhập lộn xộn ngày tháng → kết quả bằng khi nhập đúng thứ tự
- bán quá số đang giữ → vào `oversold`
- thiếu giá một mã → rơi về giá vốn và có tên trong `missingPrices`
- `brokerCash` âm → `portfolioValue` trả `marketValue === null`

`stock-refresh`: dựng test từ file bảng giá SSI đã tải về (`hose.json`) — `matchedPrice`
bằng 0 thì rơi về `priorClosePrice`; `trading_date` trùng snapshot cũ thì không ghi;
một sàn lỗi thì hai sàn còn lại vẫn ghi.

`tests/` guard bundle: `_holdings.js` phải khớp với `src/` hiện tại.

## Làm theo 4 đợt

| Đợt | Nội dung | Xong thì thấy gì |
|-----|----------|------------------|
| 1 | Migration `0035`, types, repo cả hai impl, `holdings.ts` + test | Chưa thấy gì trên app; test xanh |
| 2 | Edge function hút giá + hẹn cron | `stock_prices` có số thật |
| 3 | Sheet ghi lệnh + khu Danh mục + demo seed | Ghi lệnh và xem được lời/lỗ từng mã |
| 4 | Cron ghi `account_valuations` + cột `source` | Tổng tài sản tự đúng mỗi chiều |

Sau đợt 3 app đã dùng được (giá tự có từ đợt 2, giá trị tổng vẫn gõ tay). Đợt 4 là phần
tự động hoàn toàn.

## Rủi ro

**Bảng giá SSI là địa chỉ không công bố chính thức.** Có ngày họ đổi đường dẫn, đổi tên
trường, hoặc chặn như TCBS đã làm. Đỡ đòn ba lớp: giá cũ vẫn nằm trong `stock_prices` nên
app không bao giờ trắng số; `updated_at` cũ quá 3 ngày phiên → UI nói thẳng "giá có thể
đã cũ"; và Yahoo (`FPT.VN`) làm nguồn dự phòng cho sàn HOSE.

**Sổ lệnh có lỗ hổng thì giá trị sai.** Không tránh được bằng code — chỉ bằng việc nói ra:
`oversold` và tiền chưa đầu tư âm là hai cái van báo, và khi van mở thì server không ghi
snapshot chứ không ghi số sai.

## Ngoài phạm vi

- **Tự đọc sự kiện chia thưởng** từ `corporateEvents` của SSI — người dùng tự ghi dòng
  điều chỉnh (lý giải ở mục schema 3).
- **Cổ phiếu ngoài Việt Nam** (Nhật, Mỹ) — nguồn giá khác, đơn vị tiền khác. Cấu trúc
  `stock_prices` mở đường được (thêm sàn) nhưng không làm ở đợt này.
- **Nối API công ty chứng khoán** để tự đồng bộ sổ lệnh — VPS/SSI/TCBS không có API cho
  khách lẻ.
- **Giá trong phiên (realtime).** Mỗi chiều một lần là đủ cho một app sổ chi tiêu; kéo
  giá liên tục đổi lấy tốn kém và rủi ro bị chặn.
- **Nhập sổ lệnh từ file sao kê** của công ty chứng khoán — nối vào luồng CSV (mục
  `csvImport`) sau nếu việc ghi tay thành gánh nặng.
- **Lịch sử giá để dựng lại net worth quá khứ.** Endpoint biểu đồ của SSI làm được
  (nhớ đơn vị nghìn đồng), nhưng đó là việc riêng.
