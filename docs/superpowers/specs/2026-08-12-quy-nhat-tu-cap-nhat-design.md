# Tự cập nhật giá quỹ đầu tư Nhật (投資信託 / NISA)

Ngày: 2026-08-12

Tài khoản Rakuten Securities hiện là một tài khoản `investment` tiền JPY, giá trị thị
trường do người dùng **gõ tay** qua sheet "Cập nhật giá trị". Mục tiêu: app tự biết giá
trị đó, mỗi ngày, không phải gõ.

Đây là đi lại con đường của [cổ phiếu Việt Nam](../../co-phieu-viet-nam.md) — cron → edge
function → bảng giá → tự ghi `account_valuations` — với nguồn giá khác, một đơn vị đo
khác, và **một mô hình giá vốn khác** (xem mục "Vì sao không dùng lại `brokerCash`").
Phía đọc (Tổng tài sản, Hiệu quả đầu tư, XIRR, biểu đồ, thông báo) **không sửa gì**.

Bản thiết kế này đã được sửa lại sau khi đọc sao kê thật (`adjusthistory(JP)_20260812.csv`,
Rakuten Securities, 136 dòng lệnh quỹ từ 2022-10-11 tới 2026-04-09). Bốn chỗ của bản đầu
sai hoặc thiếu; xem mục "Sao kê thật đã lật lại những gì".

## Nói rõ trước: không có "live" theo phút

Quỹ đầu tư Nhật **không có giá theo thời gian thực**. Mỗi quỹ công bố **một** 基準価額 cho
mỗi ngày làm việc, vào khoảng 19:00 giờ Nhật. App Rakuten cũng chỉ hiện lần công bố gần
nhất — dòng `更新：08/12 18:27` là giờ app đồng bộ, không phải giờ giá đổi.

"Theo dõi live" ở đây nghĩa là **tự cập nhật mỗi ngày**. Đó là mức tốt nhất tồn tại.

## Nguồn giá — đo thật 2026-08-12

Thư viện tra cứu của Hiệp hội Đầu tư Tín thác Nhật Bản (投資信託協会):

```
https://toushin-lib.fwg.ne.jp/FdsWeb/FDST030000/csv-file-download?isinCd=<ISIN>&associFundCd=<協会コード>
```

Miễn phí, không khoá, không đăng nhập. Đo bằng `curl`:

| Phép đo | Kết quả |
|---|---|
| Gọi đủ hai tham số | `200`, CSV ~20 KB, đủ lịch sử từ ngày lập quỹ |
| Header | `年月日,基準価額(円),純資産総額(百万円),分配金,決算期` |
| Một dòng | `2026年08月10日,20053,1175583,,` |
| Mã hoá | **Shift-JIS** |
| `Content-Type` server khai | `text/plain; charset=utf-8` — **SAI**, xem bẫy ① |
| Xuống dòng | CRLF |
| `Content-Disposition` | `attachment;filename=lst_standard_price_20260812183619.csv` — dấu thời gian là **giờ Nhật** |
| Thiếu một trong hai tham số | **`200`** + body `{"statusCode":null}` — xem bẫy ② |
| Cả hai mã sai | `500` + cùng body |
| Header CORS | **không có** → trình duyệt không gọi thẳng được |

### Danh bạ 8 quỹ — mọi mã đã gọi thật, đều `200`, phiên mới nhất 2026-08-10

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

### Độ trễ phải chấp nhận

Lúc 18:36 giờ Nhật ngày 12/08, phiên mới nhất trong CSV là **10/08** (11/08 là 山の日, nghỉ
lễ, không có 基準価額). Nguồn trễ **tối đa một phiên** so với app Rakuten.

Không xử lý bằng cách im lặng dùng giá cũ rồi đóng dấu "hôm nay": `valued_on` lấy đúng
`nav_date` của giá.

## Sao kê thật đã lật lại những gì

Sao kê 受渡履歴 của Rakuten (136 dòng lệnh quỹ, 8 quỹ, 2022-10 → 2026-04) được cộng dồn
lại và đối chiếu với ảnh chụp app Rakuten ngày 2026-08-12:

| | 口数 từ sao kê | Giá vốn | App Rakuten |
|---|---|---|---|
| 楽天・プラス・S&P500 | 28.429 | 50.000 ¥ | 57.009 ¥ |
| 楽天・プラス・NASDAQ-100 | 12.595 | 20.000 ¥ | 23.748 ¥ |
| Tổng | | **70.000 ¥** | 80.757 ¥ = 70.000 + **10.757** (+15,36%) ✓ |

Khớp đến từng yên. Nhưng để tới được con số đó phải vượt qua bốn chỗ mà bản thiết kế đầu
tiên làm sai — cả bốn đều thuộc loại "chạy được nhưng ra số sai".

### ① Nhập tay 136 dòng là không tưởng → phải có script đọc sao kê

Bản đầu giả định người dùng gõ tay từng lệnh. 136 dòng × 5 ô ≈ 700 lần gõ, mỗi lần là một
cơ hội sai. **Quyết định: một script chạy TAY, một lần**, đọc thẳng file sao kê. Không làm
giao diện nhập file — lần sau tải sao kê mới thì chạy lại script.

### ② Một quỹ nằm dưới HAI tên trong cùng một file

`楽天・Ｓ＆Ｐ５００インデックス・ファンド` và `楽天・プラス・Ｓ＆Ｐ５００インデックス・ファンド`
là **cùng một quỹ**: Rakuten đổi tên loạt 「楽天・プラス」 ngày 2024-10-17
([thông báo](https://www.rakuten-sec.co.jp/web/info/info20241017-01.html)). Sao kê giữ tên
cũ ở dòng cũ, tên mới ở dòng mới.

Chứng minh bằng số, không phải bằng suy đoán — tra mã của tên MỚI (`9I31223A`) ra đúng đơn
giá mà sao kê ghi cho tên CŨ:

| Ngày 約定 | Đơn giá trên sao kê (tên cũ) | NAV tra bằng mã tên mới |
|---|---|---|
| 2024-08-07 | 12.355 | **12.355** |
| 2024-08-09 | 12.596 | **12.596** |

`楽天・全米株式インデックス・ファンド` cũng đổi — 愛称 từ `楽天・バンガード・ファンド（全米株式）`
sang `楽天・VTI`, tên chính thức giữ nguyên.

Ghép theo tên một cách ngây thơ cho ra **hai vị thế**: S&P500 dư `−19.848 口`, VTI dư
`−10.232 口`. Từ đó:

> **Bất biến bắt buộc: sau khi nhập, KHÔNG quỹ nào được kết thúc với 口数 âm.**
> Đây chính là phép thử vừa bắt được cả hai trường hợp đổi tên. Bảng bí danh thiếu một
> dòng thì số âm hiện ra ngay, không cần ai đi soi.

### ③ Sao kê có HAI cột ngày; giá thuộc về cột thứ hai

`受渡日` (ngày tiền về) và `約定日` (ngày khớp). 基準価額 thuộc về **約定日**. Đo trên bốn cặp
độc lập, mọi cặp đều khớp tuyệt đối:

| Ngày 約定 | Quỹ | Đơn giá sao kê | NAV nguồn |
|---|---|---|---|
| 2026-04-09 | 楽天プラス S&P500 | 17.588 | **17.588** |
| 2026-04-09 | 楽天プラス NASDAQ-100 | 15.879 | **15.879** |
| 2024-08-07 | eMAXIS Slim 全世界 | 23.195 | **23.195** |
| 2024-08-07 | 楽天・VTI | 28.095 | **28.095** |

Dòng đầu tiên của sao kê có 受渡日 = 2026/4/14 nhưng 約定日 = 2026/4/9 — lệch **5 ngày**.
Lấy nhầm cột thì mọi phép lấp lịch sử lệch đi vài ngày một cách âm thầm.

> `fund_trades.traded_on` = **約定日**. Cột `受渡日` không được lưu, để không ai lỡ tay dùng.

### ④ `brokerCash` mượn từ cổ phiếu Việt Nam KHÔNG dùng được ở đây

Sao kê có 8 dòng `自動出金(スイープ)`: **Rakuten tự quét sạch tiền dư về 楽天銀行**. Tài
khoản này không bao giờ giữ tiền nhàn rỗi — khái niệm "tiền chưa đầu tư" không tồn tại.

Tệ hơn: tiền vào tài khoản qua thẻ tín dụng và điểm Rakuten
(`入金(クレジットカード決済ご利用分)`, `入金(楽天ポイント交換)`), không qua một lần chuyển
khoản mà sổ trong app có ghi. Sổ của app còn thiếu (xem [[so-khong-co-khoan-thu]]). Dùng
`brokerCash = số dư sổ − Σ mua + Σ bán` sẽ ra **số âm**, van `tien-chua-dau-tu-am` chặn, và
tính năng chạy mỗi ngày mà **không bao giờ ghi được gì** — thất bại im lặng, đúng loại tệ
nhất.

**Quyết định:** với tài khoản quỹ JPY,

```
giá trị thị trường = Σ (口数 × 基準価額 ÷ 10.000)        ← KHÔNG cộng tiền mặt
giá vốn            = Σ amount của phần 口数 còn đang giữ  ← từ SỔ LỆNH, không từ số dư sổ
```

Cách này cho ra đúng `70.000 → 80.757, +10.757 (+15,36%)` như Rakuten, và **không phụ thuộc
sổ thu chi có đủ hay không**.

## Bốn cái bẫy kỹ thuật đã biết trước

**① File là Shift-JIS dù server khai UTF-8.** Đúng với **cả hai** file: CSV của hiệp hội
lẫn sao kê Rakuten. Đọc bằng `res.text()` ra chữ rác ở cột ngày và cột tên quỹ, trong khi
cột **số** vẫn đúng — nên phép tính tiền vẫn ra số trông hợp lý, chỉ ngày và tên hỏng. Mà
ngày hỏng thì `nav_date` sai, `valued_on` sai; tên hỏng thì bảng bí danh không khớp dòng
nào. Phải `arrayBuffer()` + `new TextDecoder('shift_jis')` (Deno có sẵn) hoặc
`Encoding.GetEncoding(932)` (script Node/PowerShell).

**② Thiếu tham số trả `200`, không phải `4xx`.** Body là `{"statusCode":null}`, 19 byte
JSON. Kiểm bằng `res.ok` sẽ nghĩ là thành công rồi parse ra 0 dòng và báo "không có giá"
thay vì "gọi sai URL". **Điều kiện nhận: dòng đầu decode ra đúng `年月日`.**

**③ Không có CORS.** Bắt buộc qua edge function. Giống Yahoo và SSI.

**④ `口数 × 基準価額 ÷ 10.000` KHÔNG bằng số tiền đã trừ.** Đo trên sao kê thật:
`28.429 × 17.588 ÷ 10.000 = 49.997` trong khi số tiền thật là **50.000** — lệch 3 yên mỗi
lệnh, 136 lệnh thì thành sai lệch thấy được. `fund_trades` giữ **cả** `units` (số thật) và
`amount` (số thật), không suy cái này từ cái kia.

## Kiến trúc

```
supabase/migrations/0045_fund_prices_trades.sql   ← funds, fund_prices, fund_trades
                                                     + seed 8 quỹ + bảng bí danh tên

src/features/assets/fundHoldings.ts               ← hàm THUẦN: fundHoldingsFromTrades,
                                                     fundValue, sessionNavs
src/features/assets/serverBundle.ts               ← xuất thêm 3 hàm trên (npm run bundle:rules)

supabase/functions/fund-refresh/navs.ts           ← fetchFundNavs + parseNavCsv (thuần)
supabase/functions/fund-refresh/loadInput.ts      ← loadFundAccounts, loadFundRegistry
supabase/functions/fund-refresh/index.ts          ← việc 1 hút NAV, việc 2 ghi valuations,
                                                     chế độ kiểm mã, chế độ lấp lịch sử
supabase/functions/fund-refresh/_holdings.js      ← gói từ serverBundle.ts

scripts/nhap-sao-ke-rakuten.mjs                   ← script CHẠY TAY: đọc 受渡履歴 CSV,
                                                     lọc, ghép bí danh, kiểm 口数 âm,
                                                     xem trước rồi mới ghi

src/features/assets/FundHoldingsSection.tsx       ← khu "Danh mục quỹ"
src/features/assets/FundTradeFormSheet.tsx        ← sheet ghi lệnh quỹ (sửa/thêm lẻ)
```

### Vì sao là function RIÊNG, không nhét vào `stock-refresh`

Khác nguồn, khác cách giải mã, khác đơn vị đo, khác mô hình giá vốn, khác giờ chạy. Và
nặng nhất: **một lô Yahoo hỏng sẽ kéo cả lượt xuống `500`**, làm mất luôn phần quỹ Nhật vốn
chẳng liên quan. Hai function riêng, hai cron riêng, hai bán kính nổ riêng. Phần dùng chung
là `_holdings.js`, gói từ cùng `serverBundle.ts`.

## Dữ liệu

### `funds` — danh bạ quỹ, dùng chung mọi user

Cùng `fund_prices`, đây là bảng **thứ hai và thứ ba** không có `user_id`, cùng lý do với
`stock_prices`: mã quỹ, tên quỹ và 基準価額 là thông tin công khai, giống nhau với mọi
người, không suy ra được ai giữ gì. (Comment đầu `stock_prices` trong migration 0035 tự
nhận là "bảng DUY NHẤT không có user_id" — **phải sửa comment đó**.)

```sql
create table public.funds (
  assoc_fund_cd text primary key,              -- 協会コード, vd '9I31223A'
  isin_cd       text not null,
  name          text not null default '',      -- tên hiển thị
  last_status   text not null default 'chua-kiem'
                check (last_status in ('chua-kiem', 'ok', 'ma-sai', 'loi-mang')),
  last_checked_at timestamptz,
  created_at    timestamptz not null default now()
);

-- Tên quỹ xuất hiện trong sao kê Rakuten → quỹ nào. NHIỀU tên trỏ về MỘT quỹ vì quỹ
-- đổi tên (xem ② trong spec). Bảng này là dữ liệu, không phải hằng số trong script:
-- lần sau Rakuten đổi tên nữa thì thêm một hàng, không sửa code.
create table public.fund_aliases (
  statement_name text primary key,             -- đúng chuỗi trong cột 対象証券名
  assoc_fund_cd  text not null references public.funds (assoc_fund_cd)
);
```

Seed sẵn 8 quỹ (bảng mã ở trên, đã kiểm thật 2026-08-12) và 10 bí danh — 8 tên hiện hành
cộng 2 tên cũ:

| Tên trong sao kê | Trỏ về |
|---|---|
| `楽天・Ｓ＆Ｐ５００インデックス・ファンド(楽天・Ｓ＆Ｐ５００)/再投資型` | `9I31223A` ← đổi tên 2024-10-17 |
| `楽天・全米株式インデックス・ファンド（楽天・バンガード・ファンド（全米株式））/再投資型` | `9I312179` ← đổi 愛称 |

RLS `funds`: đọc cho mọi user đã đăng nhập; `insert` cho user đã đăng nhập; `update`/`delete`
chỉ service role. `fund_aliases`: đọc cho mọi user; ghi chỉ service role (bảng này quyết định
tiền được cộng vào đâu — không để user tự sửa).

### `fund_prices` — 基準価額 mới nhất

```sql
create table public.fund_prices (
  assoc_fund_cd text primary key references public.funds (assoc_fund_cd) on delete cascade,
  -- YÊN trên 10.000 口. KHÔNG chia 10.000 ở đây — chia ở đúng một chỗ là fundValue().
  nav           bigint not null check (nav > 0),
  prior_nav     bigint,
  net_assets_m  bigint,                        -- 純資産総額, đơn vị 百万円; KHÔNG tính tiền
  nav_date      date not null,
  updated_at    timestamptz not null default now()
);
```

`net_assets_m` chỉ để biết quỹ còn sống. **Không** tham gia phép tính tiền nào — nó ở đơn
vị triệu yên, nhân nhầm vào tổng tài sản là sai một triệu lần.

### `fund_trades` — sổ lệnh quỹ, riêng từng user

```sql
create table public.fund_trades (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  account_id    uuid not null,
  assoc_fund_cd text not null references public.funds (assoc_fund_cd),
  kind          text not null check (kind in ('buy', 'sell', 'adjust')),
  -- 約定日, KHÔNG phải 受渡日. Đây là ngày mà 基準価額 của lệnh thuộc về; hai ngày này
  -- lệch tới 5 ngày trên sao kê thật. Xem ③ trong spec.
  traded_on     date not null,
  units         bigint not null,               -- 口数. Âm CHỈ hợp lệ với kind='adjust'
  nav           bigint not null default 0 check (nav >= 0),   -- ¥/10.000口 lúc khớp
  -- Số tiền THẬT đã trừ (mua) / nhận (bán), yên. Nguồn sự thật cho giá vốn — KHÔNG suy
  -- từ units × nav ÷ 10.000, xem bẫy ④.
  amount        bigint not null default 0 check (amount >= 0),
  -- 口座区分: 'NISA成長投資枠' | 'NISAつみたて投資枠' | 'つみたてNISA' | '特定' | ''.
  -- Không tham gia phép tính; giữ để sau này tách được NISA khỏi 特定 mà không phải
  -- nhập lại sao kê.
  bucket        text not null default '',
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

create index fund_trades_account_idx on public.fund_trades (account_id, traded_on);
```

`kind = 'adjust'` dành cho 分配金再投資 và mọi lần 口数 đổi không qua mua bán. Hai quỹ
Rakuten hiện không chia 分配金 nên hiếm dùng — nhưng thiếu nó thì lần đầu tiên quỹ chia
tiền, 口数 trong app sai vĩnh viễn. Đúng lý do đã có `adjust` ở `stock_trades`.

## Phép tính — `src/features/assets/fundHoldings.ts`

File **mới**, không sửa `holdings.ts`. Cổ phiếu VN tính giá vốn `số cổ × giá + phí` và cộng
tiền mặt; quỹ Nhật lấy giá vốn thẳng từ `amount`, chia 10.000, và **không** có tiền mặt.

```
fundHoldingsFromTrades(trades) → { holdings: [{ assocFundCd, units, costBasis, avgNav }],
                                   realizedPnl, oversold }
```

- Mua: `units += t.units`, `costBasis += t.amount`.
- Bán: trừ giá vốn theo **bình quân trên 口**, giống 取得単価 của Rakuten. Bán quá số đang
  giữ → tên quỹ vào `oversold`, kẹp về số thực. Bán sạch → `costBasis = 0` (xoá phần dư chia
  lẻ, thiếu dòng này thì lần mua sau tính bình quân sai — chính ca **bán sạch rồi mua lại
  ngày hôm sau** đã xảy ra thật ngày 2026-04-13/14).
- `adjust`: `units` đổi, `costBasis` không đổi.

```
sessionNavs(rows) → { session, navByFund, staleFunds }
```

Vai trò như `sessionPrices`: gom về **một** phiên chung (`nav_date` lớn nhất), nêu tên quỹ
còn kẹt ở phiên cũ hơn — giá của nó vẫn có và vẫn > 0 nên `fundValue` không tự phát hiện
được, phải chặn ở nơi gọi.

```
fundValue(holdings, navByFund) → { marketValue, missingNavs }
```

`marketValue = Σ round(units × nav / 10_000)` — làm tròn **từng quỹ** rồi mới cộng, đúng
cách Rakuten hiện từng dòng rồi cộng tổng. Làm tròn ở cuối lệch vài yên và người dùng sẽ đi
tìm một nguyên nhân không có thật.

`marketValue = null` khi thiếu giá **mọi** quỹ đang giữ. Thiếu **một phần** vẫn ra số, quỹ
thiếu tạm tính theo giá vốn và có tên trong `missingNavs`.

**Không có tham số `cash`.** Xem ④ ở trên.

## Edge function `fund-refresh`

| Chế độ | Gọi bằng | Làm gì |
|---|---|---|
| Chạy đủ | `x-cron-secret` đúng | Việc 1 + việc 2 + lấp lỗ hổng 30 ngày gần nhất |
| Kiểm mã | `Authorization: Bearer <JWT>` + `{ kiem: {...} }` | Gọi CSV một quỹ, trả NAV mới nhất hoặc lý do sai. **Không ghi gì.** |
| Lấp lịch sử | `x-cron-secret` + `{ lapLichSu: { accountId } }` | Dựng lại `account_valuations` cho mọi phiên từ lệnh đầu tiên |

Function deploy với `--no-verify-jwt` (cron không có JWT — đó là lý do có `x-cron-secret`).
Nghĩa là chế độ kiểm mã **phải tự xác thực JWT trong code**: `sb.auth.getUser(token)`, từ
chối `401` nếu không ra user. Trông cậy vào cổng của Supabase ở đây là trông cậy vào một
cái cổng đã tắt.

Chế độ kiểm mã cố ý **không** nhận `x-cron-secret`, và chế độ chạy đủ cố ý **không** nhận
JWT.

### Việc 1 — hút NAV

Đọc `funds` (cả danh bạ, không chỉ quỹ đang giữ — quỹ vừa thêm có giá ngay, và lấp lịch sử
cần NAV của cả 6 quỹ đã bán hết). Gọi CSV **từng quỹ một** — endpoint không nhận nhiều quỹ
một lần như Yahoo spark.

Ngân sách thời gian `FETCH_BUDGET_MS = 60_000` cho cả khối, dừng sạch trước quỹ kế tiếp khi
hết giờ. Quỹ đang thực sự giữ gọi **trước**, phần còn lại của danh bạ sau — cùng lý do
`buildFetchOrder`.

`parseNavCsv(bytes)` là hàm **thuần** nhận `Uint8Array` (không phải string — giải mã
Shift-JIS nằm TRONG hàm để bài test bắt được bẫy ①), test bằng file mẫu thật
`testdata/toushin-sp500-sample.csv`:

- dòng đầu decode ra đúng `年月日`, nếu không → lỗi `ma-sai` (bắt bẫy ②);
- lấy dòng **cuối** có 基準価額 hữu hạn > 0; `prior_nav` từ dòng kế cuối, `null` nếu không có;
- `nav_date` parse từ `2026年08月10日` bằng regex, **không** dùng `new Date()` — chuỗi đó đã
  là ngày phiên theo giờ Nhật, đưa qua `Date` là mời một lỗi múi giờ;
- payload lạ (rỗng, chỉ header, cột thiếu) không ném vỡ cả lượt.

### Việc 2 — ghi `account_valuations`

Tài khoản đủ điều kiện: `type = 'investment'`, `currency = 'JPY'`, chưa lưu trữ, có ít nhất
một dòng `fund_trades`. Không có nút bật/tắt.

Tài khoản có **cả** `stock_trades` lẫn `fund_trades` bị bỏ qua với lý do
`tron-hai-loai-so-lenh` thay vì cộng nhầm hai hệ đơn vị.

| Lý do bỏ qua | Nghĩa | Cần làm gì |
|---|---|---|
| `so-lenh-co-lo-hong` | Bán nhiều 口数 hơn đang giữ. **Dấu hiệu kinh điển của bảng bí danh thiếu một dòng** (xem ②) | Kiểm `fund_aliases`; nếu Rakuten vừa đổi tên quỹ thì thêm hàng bí danh |
| `thieu-gia-moi-quy` | Không quỹ nào đang giữ có giá | Kiểm `funds.last_status` |
| `gia-le-phien-cu` | Có quỹ mà `nav_date` cũ hơn phiên chung | Lượt sau tự khỏi; lặp nhiều ngày thì kiểm mã |
| `nguoi-dung-da-go-tay` | Đã có hàng `source = 'manual'` đúng ngày đó | Không cần làm gì — số gõ tay luôn thắng |
| `tron-hai-loai-so-lenh` | Có cả sổ lệnh cổ phiếu lẫn sổ lệnh quỹ | Tách thành hai tài khoản |

Không còn `tien-chua-dau-tu-am` — không có tiền mặt trong mô hình này (④).

`valued_on = nav_date` của phiên chung, **không phải hôm nay**. `source = 'auto'`. Đọc
trước, so `source`, `continue` nếu là `manual`.

### Lấp lịch sử

CSV đã có toàn bộ lịch sử, không tốn thêm cuộc gọi. Với mỗi phiên D từ lệnh quỹ đầu tiên
(2022-10-11) tới nay:

```
units(D)  = cộng dồn fund_trades có traded_on ≤ D   (traded_on = 約定日)
value(D)  = Σ round(units(D) × nav(D) / 10_000)
```

- Chỉ ghi ngày **chưa có** hàng nào. Không đè `manual`, cũng không đè `auto`.
- Bỏ qua ngày mà mọi `units(D) = 0` — trước khi mua gì thì không có gì để chụp. Ca này có
  thật: từ 2025-04-14 tới 2025-08-28 tài khoản trống.
- Quỹ thiếu NAV cho ngày D (quỹ lập sau D) → coi như 0 口, không phải lỗi.
- Trần 1.500 phiên một lượt gọi; chạy lại lấp tiếp phần còn trống.

Mỗi lượt cron cũng lấp lỗ hổng **30 ngày gần nhất** — vài ngày cron chết thì tự liền.

## Script nhập sao kê — `scripts/nhap-sao-ke-rakuten.mjs`

Chạy **tay**, một lần. Không có giao diện.

```bash
node scripts/nhap-sao-ke-rakuten.mjs "<đường dẫn file>" --account <id> --dry-run
```

Cấu trúc sao kê (đo trên file thật):

```
受渡日,約定日,取引区分,口座区分,対象証券名,単価［円/％］,数量［株/口/額面］,受渡金額（受取）,受渡金額（支払）,預り金（MRF）［円］
```

Các bước, theo thứ tự, mỗi bước nói ra con số:

1. **Đọc Shift-JIS** (bẫy ①). Header không decode ra `受渡日` → dừng, không đoán.
2. **Lọc theo `取引区分`.** Chỉ nhận `株式投信購入（積立）` (116 dòng), `株式投信購入` (4),
   `株式投信解約` (16) = **136 dòng** trong tổng số 252 dòng dữ liệu. Bỏ **116 dòng tiền**
   (入金/出金/振替/譲渡益税/
   スイープ/金・プラチナ積立) — sổ thu chi của app đã có hoặc sẽ có những khoản đó; nhập vào
   đây là ghi trùng. Script **in ra** số dòng đã bỏ theo từng loại, không im lặng.
3. **Ghép tên → quỹ** qua `fund_aliases`. Tên không có trong bảng → **dừng cả lượt**, in tên
   đó ra. Không đoán, không so gần đúng: hai quỹ Rakuten có tên khác nhau đúng ba ký tự
   (`・プラス`) và giá khác nhau.
4. **Kiểm bất biến 口数 âm** (xem ②). Có quỹ nào âm → dừng, in tên quỹ và số dư âm.
5. **Đối chiếu**: in 口数 và giá vốn còn lại của từng quỹ để so tay với app Rakuten.
   Kỳ vọng cho file 2026-08-12: `S&P500 28.429 口 / 50.000 ¥`, `NASDAQ-100 12.595 口 /
   20.000 ¥`, mọi quỹ khác `0 口`.
6. **Xem trước rồi mới ghi.** `--dry-run` là mặc định; muốn ghi thật phải thêm `--ghi`.
7. **Ghi idempotent**: khoá trùng là `(account_id, assoc_fund_cd, traded_on, kind, units, amount)`.
   Chạy lại cùng file không sinh dòng thứ hai.
8. **In bảng tiền-vào-theo-nguồn** cộng từ các dòng tiền đã bỏ ở bước 2 (thẻ / điểm /
   楽天ペイ / tự động nạp), kèm một phép so: số dư sổ hiện tại của tài khoản NISA so với
   giá vốn tính từ sổ lệnh. Xem mục "Dòng tiền thật của 積立" để biết chênh lệch đó nghĩa
   là gì.

`bucket` lấy nguyên `口座区分`. **Cả `特定` cũng được nhập** (35 dòng) — tài khoản trong app
đại diện cho cả tài khoản Rakuten, không riêng NISA. Ba mươi lăm dòng đó nay đã bán hết
(0 口) nên không ảnh hưởng giá trị hiện tại, chỉ ảnh hưởng đường lịch sử.

## Giao diện

`AccountDetailPage` hiện chỉ hiện danh mục cho tài khoản đầu tư **VND**
([AccountDetailPage.tsx:479](../../../src/features/assets/AccountDetailPage.tsx#L479)). Thêm
nhánh song song cho tài khoản đầu tư **JPY**; nhánh cũ không đổi.

**Khu "Danh mục quỹ"** (`FundHoldingsSection`): mỗi quỹ một hàng — tên, 口数, 取得単価,
基準価額 mới nhất kèm ngày, giá trị, lãi/lỗ. Lãi/lỗ ở đây tính từ **giá vốn của sổ lệnh**,
nên khớp app Rakuten bất kể sổ thu chi thế nào. Quỹ chưa có giá hiện "chưa có giá", không
hiện số 0.

**Sheet ghi lệnh** (`FundTradeFormSheet`): ngày 約定 · quỹ · mua/bán · 口数 · 基準価額 · số
tiền. Dùng để sửa hoặc thêm lệnh lẻ sau này — nhập hàng loạt là việc của script. Ô tiền dùng
`MoneyField`. Gõ 口数 và 基準価額 thì ô tiền tự gợi ý `units × nav ÷ 10.000` nhưng **cho
sửa** — số thật trên sao kê mới là số được lưu (bẫy ④).

Không làm sheet "thêm quỹ" ở bản này: 8 quỹ đã seed, và thêm quỹ mới là chuyện vài tháng
một lần — thêm một hàng vào `funds` + `fund_aliases` bằng SQL là đủ. Nút "Kiểm mã ngay" cũng
hoãn theo (chế độ kiểm mã của edge function vẫn làm, để gọi bằng `curl` khi cần).

## Bảng quyết định

| Quyết định | Vì sao |
|---|---|
| Nguồn: CSV của **投資信託協会** | Miễn phí, không khoá, đủ lịch sử, là số CHÍNH THỨC. Đã đối chiếu 6 cặp ngày/giá với sao kê Rakuten, khớp tuyệt đối. |
| Chấp nhận trễ **1 phiên** | Bản chất của 基準価額 cộng độ trễ tổng hợp của hiệp hội. |
| `TextDecoder('shift_jis')`, KHÔNG `res.text()` | Cả hai file đều Shift-JIS dù khai UTF-8 — bẫy ①. Sai chỗ này thì cột số vẫn đúng, chỉ ngày và tên hỏng. |
| Nhận kết quả bằng **nội dung dòng đầu**, không bằng mã trạng thái | Thiếu tham số trả `200` kèm JSON 19 byte — bẫy ②. |
| `fund_trades` giữ **cả** `units` và `amount` | Đo thật: `28.429 × 17.588 ÷ 10.000 = 49.997` ≠ `50.000` — bẫy ④. |
| `traded_on` = **約定日**, không lưu 受渡日 | 基準価額 thuộc về 約定日; hai ngày lệch tới 5 ngày. Đối chiếu 4 cặp, khớp tuyệt đối. |
| Bảng **`fund_aliases`** trong DB, không phải hằng số trong script | Quỹ đổi tên là chuyện có thật (2024-10-17). Lần sau chỉ thêm một hàng. |
| Bất biến **"không quỹ nào 口数 âm"** | Chính nó bắt được cả hai lần đổi tên. Bảng bí danh thiếu dòng thì lộ ra ngay. |
| **Không** dùng `brokerCash` cho tài khoản quỹ | Rakuten quét sạch tiền dư (8 dòng `自動出金(スイープ)`); tiền vào qua thẻ/điểm nên sổ app không có. Dùng nó là để tính năng chạy mỗi ngày mà không ghi được gì. |
| Giá vốn từ **sổ lệnh**, không từ số dư sổ | Ra đúng +10.757 / +15,36% như Rakuten, không phụ thuộc sổ thu chi có đủ hay không. |
| Làm tròn **từng quỹ** rồi mới cộng | Khớp cách Rakuten hiện từng dòng. |
| `valued_on = nav_date` | Nguồn trễ một ngày thì ảnh chụp phải đề đúng ngày của giá. |
| File tính **mới** `fundHoldings.ts` | Khác đơn vị, khác giá vốn, không có tiền mặt. Gộp là mời lỗi. |
| Edge function **riêng** `fund-refresh` | Một lô Yahoo hỏng không được kéo phần quỹ Nhật xuống theo. |
| Nhập sao kê bằng **script chạy tay**, không làm giao diện | 136 dòng một lần, vài tháng mới lặp lại. Giao diện nhập file là công sức không thu hồi được. |
| Nhập **cả `特定`**, giữ `bucket` | Tài khoản trong app đại diện cả tài khoản Rakuten. Giữ `口座区分` để sau tách được mà không phải nhập lại. |
| Cron **13:00 UTC (22:00 giờ Nhật)**, T2–T6 | Sau giờ công bố 19:00. Nhật không có giờ mùa hè; múi giờ neo vào **thị trường**. |
| Dùng lại `PUSH_CRON_SECRET` | Bí mật cho cron nói chung. **Thành job thứ BA** — xem cảnh báo dưới. |

> **`PUSH_CRON_SECRET` sẽ được BA cron job nhúng vào `cron.job.command`**: `push-notify-hourly`,
> `stock-refresh-daily`, `fund-refresh-daily`. Đổi secret mà quên một job là đẩy job đó vào
> đúng bẫy ① của [co-phieu-viet-nam.md](../../co-phieu-viet-nam.md) — cron vẫn nổ,
> `job_run_details` vẫn `succeeded`, function trả `401` và không làm gì.
> **`CAC_JOB` trong [scripts/doi-cron-secret.mjs](../../../scripts/doi-cron-secret.mjs) phải
> thêm job mới, và bài test `--dry-run` canh con số hai phải đổi thành ba.**

## Giới hạn phải chấp nhận

- **Trễ một phiên** so với app Rakuten.
- **Không có giá trong ngày.** Quỹ đầu tư không có khái niệm đó.
- **Ngày lễ Nhật không có 基準価額.** Cron chạy, không thấy phiên mới, không ghi gì.
- **Lãi/lỗ ở cấp TÀI KHOẢN vẫn dùng số dư sổ.** Khu "Danh mục quỹ" khớp Rakuten tuyệt đối,
  nhưng "Hiệu quả đầu tư" ở cấp tài khoản lấy `market_value − số dư sổ`. Số dư sổ chỉ đúng
  khi dòng tiền được ghi đúng hình dạng — xem mục dưới. Việc chỉnh sổ nằm ngoài phạm vi
  code của tính năng này, nhưng công thức thì đã rõ, không phải "tự mò".
- **Quỹ không nằm trong thư viện hiệp hội** (quỹ nước ngoài, ETF niêm yết) không dùng được
  đường này. ETF Nhật đi đường Yahoo `.T` — việc khác.
- **Tài khoản trộn cổ phiếu VN và quỹ Nhật** bị bỏ qua có chủ ý.

## Dòng tiền thật của 積立, và cách ghi cho số dư sổ đúng

Tiền mua quỹ **không** đi từ Rakuten Bank vào chứng khoán. Đường thật, đo trên sao kê:

```
Thẻ Rakuten Card ─┐
Điểm Rakuten     ─┼→ tài khoản Rakuten Securities → quỹ   (ngày 8–10 mỗi tháng)
楽天ペイ残高      ─┘
        ↑
Rakuten Bank ──────┘ trả sao kê thẻ cuối tháng (ngày 27)
```

Tổng tiền vào tài khoản Rakuten từ 2022-09 tới nay, theo nguồn:

| Nguồn | Số lần | Tổng |
|---|---|---|
| `入金(楽天ペイ残高ご利用分)` | 19 | 692.001 ¥ |
| `入金(クレジットカード決済ご利用分)` | 16 | 654.913 ¥ |
| `投信積立(自動入金)` | 4 | 263.100 ¥ |
| `振替入金` | 1 | 111.306 ¥ |
| `入金(楽天ペイ残高注文エラー分)` (hoàn lệnh lỗi) | 3 | 97.624 ¥ |
| `入金(楽天ポイント交換)` | 28 | 70.508 ¥ |
| `投資信託(自動入金)` | 4 | 68.362 ¥ |
| `金・プラチナ積立(自動入金)` (vàng/bạch kim, **không phải quỹ**) | 9 | 45.000 ¥ |

Từ 2025-10 tới 2026-04, mỗi kỳ đúng **70.000 ¥**, chia hai nguồn — thẻ lo phần lớn, điểm lo
phần lẻ (vd 2026-04-08: thẻ 68.725 + điểm 1.275).

**Cách ghi đúng trong app** (ba bước, mỗi bước là một hình dạng khác nhau):

| Việc thật | Ghi trong app |
|---|---|
| Ngày 8–10: Rakuten trừ **thẻ Rakuten Card** phần lớn số tiền | **Chuyển khoản** thẻ Rakuten Card → tài khoản NISA. **KHÔNG phải "Chi".** |
| Cùng ngày: phần lẻ trừ bằng **điểm Rakuten** | **Thu** vào tài khoản NISA (tiền từ ngoài sổ vào) |
| Ngày 27: sao kê thẻ bị trừ từ **Rakuten Bank** | app đã có sẵn phần trả thẻ tự động (`src/lib/cardAutopay.ts`) — không phải ghi thêm |

Mua quỹ **không phải tiêu tiền**, chỉ là tiền đổi hình dạng — nên nó là chuyển khoản, không
phải chi. Ghi đúng ba bước trên thì số dư sổ của tài khoản NISA tự tăng đúng 70.000 mỗi
tháng, bằng đúng giá vốn, và "Hiệu quả đầu tư" ở cấp tài khoản tự đúng.

> **Ghi khoản 積立 thành "Chi" là lỗi đắt nhất ở đây**, và là lỗi rất dễ mắc vì con số đó
> xuất hiện trên **sao kê thẻ Rakuten** — mà sao kê thẻ thì được import vào app qua
> [ImportCsvPage](../../../src/features/import/ImportCsvPage.tsx). Hậu quả: báo cáo chi tiêu phồng ~70.000
> mỗi tháng, tài sản ròng thiếu đúng số đã đầu tư, và số dư tài khoản NISA đứng ở 0 nên
> "Hiệu quả đầu tư" vô nghĩa. Bảy kỳ từ 2025-10 tới 2026-04 là **490.000 ¥**.

`fund_trades` **không** đụng ledger — không sinh giao dịch, không đổi số dư (đúng nguyên tắc
của `stock_trades`, xem migration 0035). Nên ghi ba bước trên **không** trùng với việc nhập
sổ lệnh quỹ: một bên là tiền vào tài khoản, một bên là tiền đã biến thành quỹ nào.

Script nhập sao kê (bước 8) in bảng tiền-vào-theo-nguồn ở trên, cộng thêm **một phép so**:
số dư sổ hiện tại của tài khoản NISA trong app so với giá vốn tính từ sổ lệnh. Chênh lệch
xấp xỉ tổng các khoản thẻ chưa ghi thành chuyển khoản chính là lời chẩn đoán.

## Kiểm thử

Hàm thuần, không cần mạng:

| Kiểm gì | Bằng cách nào |
|---|---|
| `parseNavCsv` đọc file Shift-JIS thật, ra đúng NAV + ngày phiên cuối | `testdata/toushin-sp500-sample.csv` (hút thật 2026-08-12) |
| `parseNavCsv` nhận diện `{"statusCode":null}` là `ma-sai`, không phải "0 dòng" | file mẫu 19 byte |
| `parseNavCsv` **không** đọc được nếu decode bằng UTF-8 | bài test canh: decode sai thì `nav_date` phải `null`, không được lọt một ngày trông hợp lý |
| `parseNavCsv` không vỡ với file rỗng / chỉ header / cột thiếu | ba file mẫu nhỏ |
| `fundHoldingsFromTrades` — mua nhiều lần, bán một phần, **bán sạch rồi mua lại hôm sau**, bán quá tay, `adjust` | bảng ca; ca "bán sạch rồi mua lại" lấy thẳng từ 2026-04-13/14 |
| `fundValue` làm tròn từng quỹ, `marketValue = null` đúng một ca | bảng ca |
| `sessionNavs` gom một phiên, nêu đúng quỹ lẻ phiên cũ | bảng ca |
| Script nhập: lọc đúng **136 trong 252** dòng dữ liệu, ghép đúng bí danh, **bắt được 口数 âm khi xoá một dòng bí danh** | chạy trên chính file sao kê thật, `--dry-run` |
| Script nhập: chạy hai lần không sinh dòng trùng | `--ghi` hai lượt trên DB thử |
| `_holdings.js` khớp byte-for-byte với `serverBundle.ts` | mở rộng `tests/pushBundle.test.ts` |

**Bài kiểm quyết định**, chạy trên dữ liệu thật, không phải file mẫu:

> Nhập sao kê → gọi `fund-refresh` → giá trị tài khoản phải ra **80.757 ¥ ± phần chênh do
> trễ một phiên**, giá vốn **70.000 ¥**, lãi **+10.757 ¥ (+15,36%)**. Ba con số này đã biết
> trước từ ảnh chụp app Rakuten. Lệch là sai, không phải "gần đúng".

Cần môi trường sống:

1. Chạy script `--dry-run` trên file thật, xác nhận bảng đối chiếu ở bước 5 khớp Rakuten.
2. `--ghi`, rồi gọi `fund-refresh`, kiểm ba con số ở trên.
3. Gõ tay một giá trị cho đúng ngày phiên đó, gọi lại, kỳ vọng
   `boQua: {nguoi-dung-da-go-tay: 1}` và số trong DB **không đổi**.
4. Xoá một hàng `fund_aliases`, chạy lại script, kỳ vọng script **dừng** với tên quỹ không
   nhận ra — không được âm thầm bỏ qua.
5. Lấp lịch sử, mở biểu đồ Tài sản ròng, xác nhận có đoạn trống 2025-04 → 2025-08 (tài khoản
   thật sự trống khi đó) và đợt bán sạch 2026-04-13.
6. Hẹn cron, một phiên sau kiểm `max(updated_at)` của `fund_prices` — **không** đọc
   `nav_date` để kết luận.

## Chỗ tài liệu phải cập nhật

- `docs/quy-nhat.md` — tài liệu vận hành mới, cùng khuôn `co-phieu-viet-nam.md`.
- `docs/co-phieu-viet-nam.md` — mục "Đổi secret" phải nói **ba** job.
- migration 0035 — sửa comment "bảng DUY NHẤT không có user_id".
- `docs/data-model-matrix.md` — bốn bảng mới.
- `docs/information-architecture.md` — khu "Danh mục quỹ".
