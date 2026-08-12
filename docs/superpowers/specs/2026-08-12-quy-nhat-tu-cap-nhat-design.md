# Tự cập nhật giá quỹ đầu tư Nhật (投資信託 / NISA)

Ngày: 2026-08-12

Tài khoản NISA ở Rakuten hiện là một tài khoản `investment` tiền JPY, giá trị thị trường
do người dùng **gõ tay** qua sheet "Cập nhật giá trị". Mục tiêu: app tự biết giá trị đó,
mỗi ngày, không phải gõ.

Đây là đi lại đúng con đường của [cổ phiếu Việt Nam](../../co-phieu-viet-nam.md) — cron →
edge function → bảng giá → tự ghi `account_valuations` — với nguồn giá khác và một đơn vị
đo khác. Phía đọc (Tổng tài sản, Hiệu quả đầu tư, XIRR, biểu đồ, thông báo) **không sửa
gì**, vì tất cả đã đọc `account_valuations` từ trước.

## Nói rõ trước: không có "live" theo phút

Quỹ đầu tư Nhật **không có giá theo thời gian thực**. Mỗi quỹ công bố **một** 基準価額 cho
mỗi ngày làm việc, vào khoảng 19:00 giờ Nhật, tính từ giá đóng cửa của thị trường mà quỹ
đầu tư vào. App Rakuten trong ảnh chụp cũng chỉ hiện lần công bố gần nhất, không nhảy số
liên tục — dòng `更新：08/12 18:27` là giờ app đồng bộ, không phải giờ giá đổi.

Nên "theo dõi live" ở đây nghĩa là **tự cập nhật mỗi ngày**. Đó là mức tốt nhất tồn tại,
không phải mức thoả hiệp.

## Nguồn giá — đo thật ngày 2026-08-12, không phải đọc tài liệu

Thư viện tra cứu của Hiệp hội Đầu tư Tín thác Nhật Bản (投資信託協会):

```
https://toushin-lib.fwg.ne.jp/FdsWeb/FDST030000/csv-file-download?isinCd=<ISIN>&associFundCd=<協会コード>
```

Miễn phí, không cần khoá, không cần đăng nhập. Đo bằng `curl` từ máy cá nhân:

| Phép đo | Kết quả |
|---|---|
| Gọi đủ hai tham số | `200`, CSV ~21 KB, đủ lịch sử từ ngày lập quỹ tới phiên gần nhất |
| Header | `年月日,基準価額(円),純資産総額(百万円),分配金,決算期` |
| Một dòng dữ liệu | `2026年08月10日,20053,1175583,,` |
| Mã hoá | **Shift-JIS** |
| `Content-Type` server khai | `text/plain; charset=utf-8` — **SAI**, xem bẫy ① |
| Xuống dòng | CRLF (`\r\n`) |
| `Content-Disposition` | `attachment;filename=lst_standard_price_20260812183619.csv` — dấu thời gian là **giờ Nhật** |
| Thiếu `isinCd` **hoặc** thiếu `associFundCd` | **`200`** + body `{"statusCode":null}` — xem bẫy ② |
| Cả hai mã sai | `500` + cùng body `{"statusCode":null}` |
| Header CORS | **không có** `Access-Control-Allow-Origin` → trình duyệt không gọi thẳng được |

Hai quỹ chủ app đang giữ, đã kiểm thật:

| Quỹ | ISIN | 協会コード | 基準価額 phiên 2026-08-10 |
|---|---|---|---|
| 楽天・プラス・S&P500インデックス・ファンド | `JP90C000Q2U6` | `9I31223A` | 20.053 ¥ |
| 楽天・プラス・NASDAQ-100インデックス・ファンド | `JP90C000QF22` | `9I314241` | 18.855 ¥ |

### Độ trễ phải chấp nhận

Lúc 18:36 giờ Nhật ngày 12/08, phiên mới nhất trong CSV là **10/08** (11/08 là 山の日, nghỉ
lễ Nhật, không có 基準価額). Tức nguồn này trễ **tối đa một phiên** so với app Rakuten.

Đây KHÔNG được xử lý bằng cách im lặng dùng giá cũ rồi đóng dấu "hôm nay". `valued_on` của
ảnh chụp lấy đúng `nav_date` của giá — trễ một ngày thì ảnh chụp đề đúng ngày đó. Cùng
nguyên tắc với `phien` của cổ phiếu Việt Nam.

## Bốn cái bẫy đã biết trước

Ghi ra đây vì cả bốn đều thuộc loại "trông như chạy đúng".

**① Server khai UTF-8 nhưng file là Shift-JIS.** Đọc bằng `res.text()` của `fetch` sẽ ra
chữ rác ở cột ngày (`2026�N08��10��`) trong khi cột **số** vẫn
đúng — nên phép tính tiền vẫn ra số trông hợp lý, chỉ có ngày là hỏng, và ngày hỏng thì
`nav_date` sai, `valued_on` sai, ảnh chụp ghi nhầm ngày. Phải đọc `arrayBuffer()` rồi
`new TextDecoder('shift_jis')`. Deno có sẵn `shift_jis` trong bộ giải mã chuẩn.

**② Thiếu tham số trả `200`, không phải `4xx`.** Body là `{"statusCode":null}` — 19 byte
JSON, không phải CSV. Kiểm bằng `res.ok` sẽ nghĩ là thành công rồi parse ra 0 dòng và ghi
"không có giá quỹ nào" thay vì "gọi sai URL". **Điều kiện nhận là dòng đầu decode ra đúng
`年月日`**, không phải mã trạng thái.

**③ Không có CORS.** Trình duyệt của app không gọi thẳng được, bắt buộc qua edge function.
Giống hệt Yahoo và SSI — đừng mất một lượt đi thử lại.

**④ `口数 × 基準価額 ÷ 10.000` không bằng số tiền đã trừ.** 基準価額 niêm yết trên **10.000
口**, và Rakuten làm tròn khi khớp lệnh. Suy giá vốn từ 口数 sẽ lệch vài yên mỗi lệnh, tích
lại theo năm thành sai lệch thấy được. Vì vậy `fund_trades` giữ **cả** `units` (số thật) và
`amount` (số tiền thật đã trừ), không suy cái này từ cái kia — xem bảng quyết định.

## Kiến trúc

```
supabase/migrations/0045_fund_prices_trades.sql   ← funds, fund_prices, fund_trades

src/features/assets/fundHoldings.ts               ← hàm THUẦN: fundHoldingsFromTrades,
                                                     fundValue, sessionNavs
src/features/assets/serverBundle.ts               ← xuất thêm 3 hàm trên (npm run bundle:rules)

supabase/functions/fund-refresh/navs.ts           ← fetchFundNavs (gọi CSV, ngân sách thời gian)
                                                     + parseNavCsv (hàm thuần, test bằng file mẫu)
supabase/functions/fund-refresh/loadInput.ts      ← loadFundAccounts, loadFundRegistry
supabase/functions/fund-refresh/index.ts          ← việc 1 hút NAV, việc 2 ghi account_valuations,
                                                     chế độ kiểm mã, chế độ lấp lịch sử
supabase/functions/fund-refresh/_holdings.js      ← gói từ serverBundle.ts (cùng khuôn stock-refresh)

src/features/assets/FundHoldingsSection.tsx       ← khu "Danh mục quỹ" ở trang chi tiết tài khoản
src/features/assets/FundTradeFormSheet.tsx        ← sheet ghi lệnh mua/bán quỹ
src/features/assets/AddFundSheet.tsx              ← sheet thêm quỹ (dán link hoặc gõ 2 mã)
```

### Vì sao là function RIÊNG, không nhét vào `stock-refresh`

`stock-refresh` đã làm hai việc và đã có một lịch sử lỗi riêng của nó. Gộp thêm quỹ Nhật vào
đó thì: khác nguồn, khác cách giải mã, khác đơn vị đo, khác giờ chạy (sàn Việt Nam đóng 15:45
giờ Việt; quỹ Nhật công bố 19:00 giờ Nhật), và — nặng nhất — **một lô Yahoo hỏng sẽ kéo cả
lượt xuống `500`, làm mất luôn phần quỹ Nhật vốn chẳng liên quan gì**.

Hai function riêng, hai cron riêng, hai bán kính nổ riêng. Phần dùng chung là `_holdings.js`,
gói từ cùng `serverBundle.ts` — nên phép tính trong trình duyệt và phép tính của cron vẫn là
một, đúng nguyên tắc đang có.

## Dữ liệu

### `funds` — danh bạ quỹ, dùng chung mọi user

Cùng `fund_prices` bên dưới, đây là bảng **thứ hai và thứ ba** trong dự án không có
`user_id`, cùng lý do với `stock_prices`: mã quỹ, tên quỹ và 基準価額 là thông tin công khai,
giống hệt nhau với mọi người, và không suy ra được ai giữ gì từ nó. Phần riêng tư nằm ở
`fund_trades`. (Comment ở đầu `stock_prices` trong migration 0035 tự nhận là "bảng DUY NHẤT
không có user_id" — phải sửa lại comment đó, kẻo người đọc sau tin nhầm.)

```sql
create table public.funds (
  assoc_fund_cd text primary key,              -- 協会コード, vd '9I31223A'
  isin_cd       text not null,                 -- vd 'JP90C000Q2U6'
  name          text not null default '',      -- tên hiển thị, NGƯỜI DÙNG gõ (xem quyết định)
  -- Kết quả lần hút gần nhất. 'chua-kiem' khi vừa thêm; cron/nút kiểm mã ghi lại.
  last_status   text not null default 'chua-kiem'
                check (last_status in ('chua-kiem', 'ok', 'ma-sai', 'loi-mang')),
  last_checked_at timestamptz,
  created_at    timestamptz not null default now()
);
```

Seed sẵn hai quỹ chủ app đang giữ (đã kiểm thật 2026-08-12) ngay trong migration — không
phải nhập tay gì cho trường hợp đang có.

Đọc: mọi user đã đăng nhập. Ghi (`insert`): mọi user đã đăng nhập — thêm một quỹ vào danh bạ
chung là hành vi bình thường và không lộ gì. `update`/`delete`: không policy nào → chỉ service
role. Người dùng không sửa được `last_status` của người khác, và không xoá được quỹ mà người
khác đang giữ.

### `fund_prices` — 基準価額 mới nhất

```sql
create table public.fund_prices (
  assoc_fund_cd text primary key references public.funds (assoc_fund_cd) on delete cascade,
  -- YÊN trên 10.000 口. KHÔNG chia 10.000 ở đây — giữ nguyên con số nguồn công bố,
  -- chia ở đúng một chỗ duy nhất là fundValue(). Chia sớm là làm tròn sớm.
  nav           bigint not null check (nav > 0),
  prior_nav     bigint,                        -- phiên trước, để hiện % thay đổi
  net_assets_m  bigint,                        -- 純資産総額, đơn vị 百万円; KHÔNG dùng tính tiền
  nav_date      date not null,                 -- ngày của giá, không phải ngày hút
  updated_at    timestamptz not null default now()
);
```

`net_assets_m` lưu vì nó nằm sẵn trong CSV và là cách rẻ nhất để biết quỹ còn sống hay đã
đóng. **Không** tham gia phép tính tiền nào — cột này ở đơn vị triệu yên, nhân nhầm vào tổng
tài sản là sai một triệu lần.

### `fund_trades` — sổ lệnh quỹ, riêng từng user

```sql
create table public.fund_trades (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  account_id    uuid not null,
  assoc_fund_cd text not null references public.funds (assoc_fund_cd),
  kind          text not null check (kind in ('buy', 'sell', 'adjust')),
  traded_on     date not null default current_date,
  units         bigint not null,               -- 口数. Âm CHỈ hợp lệ với kind='adjust'
  nav           bigint not null default 0 check (nav >= 0),   -- 基準価額 lúc khớp, ¥/10.000口
  -- Số tiền THẬT đã trừ (mua) hoặc nhận về (bán), đơn vị yên. Đây là nguồn sự thật
  -- cho giá vốn — KHÔNG suy từ units × nav ÷ 10.000, xem bẫy ④.
  amount        bigint not null default 0 check (amount >= 0),
  fee           bigint not null default 0 check (fee >= 0),
  note          text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  constraint fund_trades_shape check (
    case kind
      when 'adjust' then units <> 0 and nav = 0 and amount = 0
      else units > 0 and amount > 0
    end
  )
);
```

`kind = 'adjust'` dành cho 分配金再投資 (cổ tức tái đầu tư làm tăng 口数 mà không tốn tiền) và
mọi lần 口数 đổi không qua mua bán. Hai quỹ Rakuten hiện **không chia 分配金**, nên loại này
hiếm dùng — nhưng thiếu nó thì lần đầu tiên quỹ chia tiền, số 口数 trong app sai vĩnh viễn mà
không có cách sửa ngoài việc bịa một lệnh mua. Đúng lý do đã có `adjust` ở `stock_trades`.

## Phép tính — `src/features/assets/fundHoldings.ts`

File **mới**, không sửa `holdings.ts`. Cổ phiếu Việt Nam tính giá vốn `số cổ × giá + phí` và
bán trừ theo bình quân; quỹ Nhật lấy giá vốn thẳng từ `amount` và giá thị trường phải chia
10.000. Nhét hai thứ đó vào một hàm là mời một lỗi làm tròn không ai tìm ra.

```
fundHoldingsFromTrades(trades) → { holdings: [{ assocFundCd, units, costBasis, avgNav }],
                                   realizedPnl, oversold }
```

- Mua: `units += t.units`, `costBasis += t.amount` (đã gồm phí — `amount` là số tiền thật rời
  khỏi tài khoản).
- Bán: trừ giá vốn theo **bình quân trên 口** (`costBasis / units`), giống cách Rakuten báo
  取得単価. Bán quá số đang giữ → tên quỹ vào `oversold`, kẹp về số thực đang giữ, không sinh
  một khoản lãi khổng lồ vô nghĩa. Bán sạch → `costBasis = 0` (xoá phần dư chia lẻ, nếu không
  lần mua sau tính bình quân sai).
- `adjust`: `units` đổi, `costBasis` **không** đổi → bình quân tự giảm. Đúng bản chất tái đầu tư.

```
sessionNavs(rows) → { session, navByFund, staleFunds }
```

Y hệt vai trò `sessionPrices`: gom bảng giá về **một** phiên chung (ngày `nav_date` lớn nhất),
nêu tên quỹ nào còn kẹt ở phiên cũ hơn. Quỹ hút hụt lần này thì giá của nó vẫn có và vẫn > 0,
nên `fundValue` không tự phát hiện được — phải chặn ở nơi gọi, kẻo ghi một con số trông như
mới nhưng dùng giá hôm kia.

```
fundValue(holdings, navByFund, cash) → { marketValue, fundsValue, cash, missingNavs }
```

`fundsValue = Σ round(units × nav / 10_000)` — làm tròn **từng quỹ một** rồi mới cộng, đúng
cách Rakuten hiện từng dòng rồi cộng ra tổng; làm tròn ở cuối sẽ lệch với app Rakuten một
vài yên và người dùng sẽ đi tìm nguyên nhân không có thật.

`marketValue` trả `null` ở đúng hai trường hợp, hệt `portfolioValue`: `cash < 0` (sổ thiếu lần
nạp tiền) hoặc thiếu giá **mọi** quỹ đang giữ. Thiếu **một phần** vẫn ra số, quỹ thiếu tạm tính
theo giá vốn và có tên trong `missingNavs`.

Tiền chưa đầu tư dùng lại `brokerCash` đang có (`số dư sổ − Σ tiền mua + Σ tiền bán`), chỉ
khác là `amount` đã là số tiền thật nên không phải nhân `units × nav` gì cả.

## Edge function `fund-refresh`

Ba chế độ, phân biệt bằng cách gọi:

| Chế độ | Gọi bằng | Làm gì |
|---|---|---|
| Chạy đủ | `x-cron-secret` đúng | Việc 1 + việc 2 + lấp lỗ hổng 30 ngày gần nhất |
| Kiểm mã | `Authorization: Bearer <JWT>` + `{ kiem: { isinCd, associFundCd } }` | Gọi CSV cho đúng một quỹ, trả về NAV mới nhất hoặc lý do sai. **Không ghi gì.** |
| Lấp lịch sử | `x-cron-secret` + `{ lapLichSu: { accountId } }` | Dựng lại `account_valuations` cho mọi phiên từ lệnh đầu tiên |

Function deploy với `--no-verify-jwt` (cron không phải người dùng đăng nhập, không có JWT —
đó là lý do có `x-cron-secret`). Nghĩa là chế độ kiểm mã **phải tự xác thực JWT trong code**:
gọi `sb.auth.getUser(token)` và từ chối `401` nếu không ra user. Trông cậy vào cổng của
Supabase ở đây là trông cậy vào một cái cổng đã tắt.

Chế độ kiểm mã cố ý **không** nhận `x-cron-secret`, và chế độ chạy đủ cố ý **không** nhận
JWT — một người dùng đăng nhập không được kích hoạt cả lượt hút, và cron không cần chạm vào
đường kiểm mã.

### Việc 1 — hút NAV

Đọc `funds` (mọi quỹ trong danh bạ, không chỉ quỹ đang giữ — cùng lý do với việc hút cả sàn
HOSE: quỹ vừa thêm hôm nay có giá ngay, không đợi tới lượt cron kế tiếp). Gọi CSV **từng quỹ
một** (endpoint chỉ nhận một quỹ mỗi lần — không có dạng gọi nhiều mã như Yahoo spark).

Danh bạ dự kiến vài quỹ, không phải vài trăm — nhưng vẫn có ngân sách thời gian
`FETCH_BUDGET_MS = 60_000` cho cả khối, dừng sạch trước quỹ kế tiếp khi hết giờ, cùng khuôn
`fetchYahooPrices`. Quỹ đang thực sự được giữ (`fund_trades`) gọi **trước**, phần còn lại của
danh bạ gọi sau — cùng lý do `buildFetchOrder`.

`parseNavCsv(bytes)` là hàm **thuần** nhận `Uint8Array` (không phải string — việc giải mã
Shift-JIS nằm TRONG hàm này, để bài test bắt được bẫy ①), test bằng file mẫu hút thật:
`testdata/toushin-sp500-sample.csv`. Kiểm tra:

- dòng đầu decode ra đúng `年月日` → nếu không, ném lỗi `ma-sai` (bắt bẫy ②);
- lấy dòng **cuối cùng** có 基準価額 là số hữu hạn > 0; `prior_nav` từ dòng kế cuối, `null` nếu
  không có;
- `nav_date` parse từ `2026年08月10日` bằng regex, **không** dùng `new Date()` — chuỗi ngày ở
  đây đã là ngày phiên theo giờ Nhật, đưa qua `Date` là mời một lỗi múi giờ;
- payload lạ (rỗng, chỉ có header, cột thiếu) không được ném vỡ cả lượt — trả 0 dòng và một
  lý do đọc được.

### Việc 2 — ghi `account_valuations`

Tài khoản đủ điều kiện: `type = 'investment'`, `currency = 'JPY'`, chưa lưu trữ, có ít nhất
một dòng `fund_trades`. Không có nút bật/tắt — ghi lệnh vào là chạy.

Tài khoản có **cả** `stock_trades` lẫn `fund_trades` bị bỏ qua với lý do `tron-hai-loai-so-lenh`
thay vì cộng nhầm hai hệ đơn vị vào nhau. Không phải trường hợp thật hiện nay, nhưng im lặng
cộng sai còn tệ hơn bỏ qua.

Các van bỏ qua, cùng tinh thần với cổ phiếu Việt Nam:

| Lý do | Nghĩa | Cần làm gì |
|---|---|---|
| `so-lenh-co-lo-hong` | Bán nhiều 口数 hơn đang giữ | Xem lại sổ lệnh quỹ, tìm lệnh mua bị thiếu hoặc ngày bị sai |
| `tien-chua-dau-tu-am` | `brokerCash < 0` — ghi lệnh mua mà quên ghi lần chuyển tiền vào | Ghi bổ sung giao dịch nạp tiền |
| `thieu-gia-moi-quy` | Không quỹ nào đang giữ có giá | Kiểm `funds.last_status`; thường là mã sai |
| `gia-le-phien-cu` | Có quỹ mà `nav_date` cũ hơn phiên chung | Lượt sau hút lại được thì tự khỏi; lặp nhiều ngày thì kiểm mã |
| `nguoi-dung-da-go-tay` | Đã có hàng `source = 'manual'` đúng ngày đó | Không cần làm gì — số gõ tay luôn thắng |
| `tron-hai-loai-so-lenh` | Tài khoản có cả sổ lệnh cổ phiếu lẫn sổ lệnh quỹ | Tách thành hai tài khoản |

`valued_on = nav_date` của phiên chung, **không phải hôm nay**. `source = 'auto'`. Đọc trước,
so `source`, `continue` nếu là `manual` — đúng cách `stock-refresh` đang làm (mệnh đề
`where source = 'auto'` không biểu diễn được qua PostgREST).

### Lấp lịch sử

CSV tải về đã có **toàn bộ** lịch sử từ ngày lập quỹ, không tốn thêm cuộc gọi nào. Với mỗi
phiên D từ ngày lệnh quỹ đầu tiên tới nay:

```
units(D)  = cộng dồn fund_trades có traded_on ≤ D
cash(D)   = số dư sổ tại D − Σ amount mua ≤ D + Σ amount bán ≤ D
value(D)  = Σ round(units(D) × nav(D) / 10_000) + cash(D)
```

`số dư sổ tại D` phải tính từ `transactions` của tài khoản đó (cộng dồn tới ngày D), **không**
lấy `account_balances.balance` — cột đó là số dư HÔM NAY, dùng nó cho ngày quá khứ sẽ vẽ ra
một đường lịch sử sai toàn bộ mà trông rất mượt.

Ràng buộc:

- Chỉ ghi ngày **chưa có** hàng nào. Không đè `manual`, cũng không đè `auto` (ảnh chụp cũ có
  thể đã được ghi bằng giá đúng của ngày đó).
- Bỏ qua ngày mà `units(D) = 0` và `cash(D) = 0` — trước khi mua gì thì không có gì để chụp.
- `cash(D) < 0` → bỏ qua ngày đó, không ghi số biết là sai.
- Trần 1.500 phiên một lượt gọi (khoảng 6 năm) để không vượt giới hạn wall-clock; chạy lại
  lần nữa sẽ lấp tiếp phần còn lại vì bước này chỉ ghi ngày còn trống.

Mỗi lượt cron thường cũng lấp lỗ hổng của **30 ngày gần nhất** — vài ngày cron chết thì tự
liền, không cần gọi tay.

## Giao diện

`AccountDetailPage` hiện chỉ hiện danh mục cổ phiếu cho tài khoản đầu tư **VND**
([AccountDetailPage.tsx:479](../../../src/features/assets/AccountDetailPage.tsx#L479)). Thêm
nhánh song song cho tài khoản đầu tư **JPY** — không đổi nhánh cũ.

**Khu "Danh mục quỹ"** (`FundHoldingsSection`): mỗi quỹ một hàng — tên, 口数, giá vốn bình
quân, 基準価額 mới nhất kèm ngày, giá trị hiện tại, lãi/lỗ. Quỹ chưa có giá hiện "chưa có
giá" như mọi chỗ khác trong app, không hiện số 0.

**Sheet ghi lệnh** (`FundTradeFormSheet`): ngày · quỹ · mua/bán · 口数 · 基準価額 · số tiền ·
phí. Ô tiền dùng `MoneyField` (mọi ô nhập tiền trong app đều vậy). Khi gõ 口数 và 基準価額,
ô số tiền tự gợi ý `units × nav ÷ 10.000` nhưng **cho sửa** — số thật trên sao kê Rakuten
mới là số được lưu.

**Sheet thêm quỹ** (`AddFundSheet`): cần hai mã. Chỗ lấy:

- ISIN: trong link Rakuten Securities — `rakuten-sec.co.jp/web/fund/detail/?ID=JP90C000Q2U6`
- 協会コード: trong link Yahoo Finance Nhật — `finance.yahoo.co.jp/quote/9I31223A`

Ô nhập **nhận cả link lẫn mã trần**, tự bóc ra — dán link nhanh hơn và ít gõ sai hơn.

Nút **"Kiểm mã ngay"** gọi `fund-refresh` ở chế độ kiểm, trả về NAV mới nhất trong vài giây.
Không có nút này thì gõ sai mã phải đợi tới tối hôm sau mới biết — đó là kiểu phản hồi tệ
nhất có thể có với một ô nhập hai mã dài loằng ngoằng.

Tên quỹ do **người dùng gõ**, không tự hút: CSV không có tên, và trang chi tiết của thư viện
nạp tên bằng JavaScript nên phải dựng trình duyệt mới đọc được — không đáng cho một chuỗi mà
người dùng vừa đọc thấy trên màn hình Rakuten. Hai quỹ đang giữ đã seed sẵn tên đầy đủ.

## Bảng quyết định

| Quyết định | Vì sao |
|---|---|
| Nguồn: CSV của **投資信託協会** | Miễn phí, không khoá, có đủ lịch sử, là số CHÍNH THỨC — khớp app Rakuten. Đã đo `200` thật hôm 2026-08-12. |
| Chấp nhận trễ **1 phiên** | Bản chất của 基準価額 (công bố 19:00 giờ Nhật) cộng độ trễ tổng hợp của hiệp hội. Không có nguồn miễn phí nào nhanh hơn mà vẫn là số chính thức. |
| Đọc bằng `TextDecoder('shift_jis')`, KHÔNG `res.text()` | Server khai `charset=utf-8` nhưng file là Shift-JIS — bẫy ①. Sai chỗ này thì cột số vẫn đúng, chỉ ngày hỏng, nên lỗi rất khó thấy. |
| Nhận kết quả bằng **nội dung dòng đầu**, không bằng mã trạng thái | Thiếu tham số trả `200` kèm JSON 19 byte — bẫy ②. |
| `fund_trades` giữ **cả** `units` và `amount` | `口数 × 基準価額 ÷ 10.000` không bằng số tiền Rakuten trừ (làm tròn) — bẫy ④. Giá vốn phải là số thật. |
| `fund_prices.nav` giữ nguyên đơn vị **¥/10.000口** | Chia sớm là làm tròn sớm. Chia đúng một chỗ, trong `fundValue()`. |
| Làm tròn **từng quỹ** rồi mới cộng | Khớp cách Rakuten hiện từng dòng; làm tròn ở cuối lệch vài yên và người dùng đi tìm nguyên nhân không có thật. |
| `valued_on = nav_date`, không phải hôm nay | Nguồn trễ một ngày thì ảnh chụp phải đề đúng ngày của giá. Cùng nguyên tắc `phien` của cổ phiếu Việt Nam. |
| File tính **mới** `fundHoldings.ts`, không sửa `holdings.ts` | Khác đơn vị, khác cách tính giá vốn. Gộp là mời lỗi làm tròn. |
| Edge function **riêng** `fund-refresh` | Khác nguồn, khác giờ, khác đơn vị; và một lô Yahoo hỏng không được kéo phần quỹ Nhật xuống theo. |
| Dùng lại `_holdings.js` / `serverBundle.ts` | Hai bản sao của một phép tính là chuyện sớm muộn lệch nhau — nguyên tắc đã có. |
| Dùng lại `PUSH_CRON_SECRET` | Nó là bí mật cho cron nói chung. **Thành job thứ BA dùng chung secret này** — xem cảnh báo dưới. |
| Cron **13:00 UTC (22:00 giờ Nhật)**, T2–T6 | Sau giờ công bố 19:00. Nhật không có giờ mùa hè nên một mốc UTC cố định là đủ; múi giờ neo vào **thị trường**, không vào người dùng. |
| Chạy server, không gọi thẳng từ app | Không có header CORS — bẫy ③. |
| Tên quỹ do người dùng gõ | CSV không có tên; trang chi tiết nạp tên bằng JavaScript. Không đáng dựng trình duyệt cho một chuỗi. |
| Nút "Kiểm mã ngay" | Hai mã dài, dễ gõ sai. Phản hồi sau 24 giờ là phản hồi vô dụng. |
| Lấp lịch sử tính số dư sổ theo `transactions`, không lấy `account_balances.balance` | Cột đó là số dư HÔM NAY. Dùng cho ngày quá khứ sẽ vẽ ra một đường sai toàn bộ mà trông rất mượt. |

> **`PUSH_CRON_SECRET` sẽ được BA cron job nhúng vào `cron.job.command`**: `push-notify-hourly`,
> `stock-refresh-daily`, và `fund-refresh-daily`. Đổi secret mà quên một job là đẩy job đó vào
> đúng bẫy ① của [co-phieu-viet-nam.md](../../co-phieu-viet-nam.md) — cron vẫn nổ,
> `job_run_details` vẫn `succeeded`, mà function trả `401` và không làm gì.
> **`CAC_JOB` trong [scripts/doi-cron-secret.mjs](../../../scripts/doi-cron-secret.mjs) phải
> thêm job mới, và bài test `--dry-run` canh con số hai phải đổi thành ba.**

## Giới hạn phải chấp nhận

- **Trễ một phiên** so với app Rakuten. Không khắc phục được bằng nguồn miễn phí.
- **Không có giá trong ngày.** Quỹ đầu tư không có khái niệm đó.
- **Ngày lễ Nhật không có 基準価額.** Không phải lỗi — cron chạy, không thấy phiên mới, không
  ghi gì.
- **Quỹ không nằm trong thư viện hiệp hội** (quỹ nước ngoài, ETF niêm yết) không dùng được
  đường này. ETF Nhật thì đi đường Yahoo `.T` — việc khác, không thuộc bản thiết kế này.
- **Tài khoản trộn cổ phiếu Việt Nam và quỹ Nhật** bị bỏ qua có chủ ý.

## Kiểm thử

Hàm thuần, chạy được không cần mạng:

| Kiểm gì | Bằng cách nào |
|---|---|
| `parseNavCsv` đọc file Shift-JIS thật, ra đúng NAV + ngày phiên cuối | file mẫu `testdata/toushin-sp500-sample.csv` (hút thật 2026-08-12) |
| `parseNavCsv` nhận diện body `{"statusCode":null}` là `ma-sai`, không phải "0 dòng" | file mẫu 19 byte |
| `parseNavCsv` không vỡ với file rỗng / chỉ header / cột thiếu | ba file mẫu nhỏ |
| `parseNavCsv` **không** đọc được nếu decode bằng UTF-8 | bài test canh: decode sai thì `nav_date` phải là `null`, không được lọt một ngày trông hợp lý |
| `fundHoldingsFromTrades` — mua nhiều lần, bán một phần, bán sạch, bán quá tay, `adjust` | bảng ca, đối chiếu tay |
| `fundValue` làm tròn từng quỹ, `marketValue = null` đúng hai ca | bảng ca |
| `sessionNavs` gom một phiên, nêu đúng quỹ lẻ phiên cũ | bảng ca (khuôn `sessionPrices`) |
| `_holdings.js` khớp byte-for-byte với `serverBundle.ts` | mở rộng `tests/pushBundle.test.ts` đang có |

Cần môi trường sống (ghi thẳng vào phần "chỗ chưa kiểm" của tài liệu, không được nói dối là
đã xong):

1. Seed hai quỹ + vài lệnh mua thật, gọi `fund-refresh`, kỳ vọng `daGhi: 1` và giá trị khớp
   con số app Rakuten đang hiện (sai lệch chấp nhận được: đúng phần chênh do trễ một phiên).
2. Gõ tay một giá trị cho đúng ngày phiên đó, gọi lại, kỳ vọng `boQua: {nguoi-dung-da-go-tay: 1}`
   và số trong DB **không đổi**.
3. Thêm một quỹ với mã sai, bấm "Kiểm mã ngay", kỳ vọng báo `ma-sai` trong vài giây.
4. Chạy lấp lịch sử, mở biểu đồ Tài sản ròng, xác nhận đường đi lên khớp hình dạng biểu đồ
   trong app Rakuten.
5. Hẹn cron, một phiên sau kiểm `max(updated_at)` của `fund_prices` — **không** đọc `nav_date`
   để kết luận, nó không phân biệt được "cron không ghi" với "nguồn trả giá phiên cũ".

## Chỗ tài liệu phải cập nhật

- `docs/quy-nhat.md` — tài liệu vận hành mới, cùng khuôn `co-phieu-viet-nam.md`.
- `docs/co-phieu-viet-nam.md` — mục "Đổi secret" phải nói **ba** job, không phải hai.
- `docs/data-model-matrix.md` — ba bảng mới.
- `docs/information-architecture.md` — khu "Danh mục quỹ" ở trang chi tiết tài khoản.
