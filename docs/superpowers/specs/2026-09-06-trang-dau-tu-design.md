# Trang Đầu tư — bảng điều khiển danh mục cổ phiếu VN

Ngày: 2026-09-06 · Trạng thái: **đã làm xong cả bốn bước** (06/09/2026)

> **Ba chỗ bản làm khác bản thiết kế** — đọc trước khi tin phần dưới:
>
> 1. **Không dựng dải chỉ số mới.** Khu "Giá trị danh mục" có sẵn đã hiện đúng năm con số
>    của dải ở Simplize. Thêm một dải nữa là hai chỗ nói cùng một chuyện, tức hai chỗ để
>    lệch nhau.
> 2. **Chỗ gắn mã cho cổ tức nằm ở trang Đầu tư**, không ở form Nhập như §3 viết. Form Nhập
>    đi qua `entryShape`/`roleFields`/`roleSave`; nhồi một ô chỉ có nghĩa với đúng một loại
>    tài khoản vào đó là đem rủi ro cho cả đường ghi giao dịch. Đổi lại còn được thêm: cổ
>    tức ghi từ TRƯỚC khi có cột `stock_symbol` cũng gắn lại được.
> 3. **Cơ cấu rủi ro là một DẢI, không phải donut thứ ba.** Ba mức xếp theo một trục
>    (thấp → cao); donut bỏ mất thứ tự đó, và trang đã có hai vòng tròn.
> 4. **Tải TRỌN lịch sử một lần**, không "chỉ tải phần đang xem" như §3 viết. Lý do đổi:
>    năm con số Hiệu quả phải là sự thật của CẢ danh mục — tính trong khung thì chọn 1 năm
>    sẽ làm ô "1 năm" luôn trống, và "Tổng lợi nhuận" đổi nghĩa mỗi lần bấm chip. Cái giá
>    (~300KB) trả bằng cách loại hai query đó khỏi persist localStorage (`src/main.tsx`),
>    và đổi lại bấm chip thành tức thì.
>
> Thêm một thứ thiết kế không lường: bảng màu lát donut phải thành **token mới**
> (`--chart-slice-1..5` trong `src/index.css`), mỗi chế độ một giá trị.

Yêu cầu gốc: "ở trang đầu tư tôi muốn nó hiện graph đầu tư từng ngày tăng bao nhiêu so
với VNINDEX", sau đó mở rộng thành "1 trang chi tiết như vầy" theo mẫu
`simplize.vn/portfolio/12906/tong-quan` — trang danh mục Rồng Việt của chính người dùng.

## 1. Phạm vi

Tab **Cổ phiếu VN** của `/invest` thành một trang dọc sáu khu. Tab **Quỹ Nhật** không đụng.

**Làm:** dải chỉ số · biểu đồ NAV vs VN-Index + hàng Hiệu quả · bảng Cơ cấu danh mục đủ
cột (gồm Cổ tức đã nhận) · hai donut tỷ trọng (mã, ngành) · khu Rủi ro (cơ cấu, beta,
Sharpe) · Sổ lệnh giữ nguyên đẩy xuống cuối.

**KHÔNG làm, và đây là quyết định chứ không phải thiếu sót:** cả khối "Định giá và các
chỉ số tài chính cơ bản" của Simplize — giá trị nội tại, biên an toàn, P/E, P/B, ROE, tỷ
suất cổ tức so thị trường, dự phóng tăng trưởng 3 năm, phần "Đánh giá" và gợi ý cổ phiếu.
Những số đó đến từ báo cáo tài chính và dự phóng của người phân tích; không có nguồn miễn
phí nào thay được. Bịa ra số ở chỗ đó tệ hơn là không có chỗ đó.

## 2. Nguồn dữ liệu — đã gọi tay, có số thật

| Cần | Endpoint | Kết quả thử 06/09/2026 |
|---|---|---|
| VNINDEX theo ngày | `dchart-api.vndirect.com.vn/dchart/history?symbol=VNINDEX&resolution=D&from=&to=` | 2.252 phiên, 2017-08-24 → 2026-09-04, điểm cuối 1853.08 |
| Giá từng mã theo ngày | cùng endpoint, `symbol=HPG` | 2.662 phiên, 2016-01-04 → 2026-09-04, bar cuối 21.7 |
| Ngành theo mã | `api-finfo.vndirect.com.vn/v4/industry_classification?q=codeList:HPG,MBB` | tên tiếng Việt nhiều cấp; HPG → "Thép" (cấp 4) trong nhóm cấp 3 |

Điểm cuối VNINDEX khớp Yahoo (1853.08); bar cuối HPG khớp `stock_prices.price` đang hiện
trong app (21.700 ₫). Hai phép đối chiếu đó là lý do tin nguồn này.

**Yahoo không dùng được cho chỉ số.** `^VNINDEX.VN` tồn tại (INDEX / HOSE / VND) nhưng
`validRanges: ['1d','5d']` — chỉ giá hôm nay. `^VNINDEX`, `VNINDEX`, `VNINDEX.VN`,
`^VN30` đều 404. Đừng thử lại, đã thử rồi.

**Đường lui nếu VNDirect chết:** `iboard-api.ssi.com.vn/statistics/charts/history?resolution=1D&symbol=VNINDEX&from=&to=`
trả đúng cùng hình dạng dữ liệu. **Không code sẵn hai nguồn** — biểu đồ hụt một phiên
không phải thảm hoạ, còn hai nguồn là gấp đôi chỗ hỏng. Ghi ở đây để lần sau khỏi phải dò lại.

### Đơn vị — hai thang, và đó là lý do có hai bảng

- Giá cổ phiếu: dchart trả **nghìn đồng** (`21.7`). Nhân 1.000 → **đồng**, đúng đơn vị
  `stock_prices.price` đang dùng. Không đẻ ra quy ước mới.
- Chỉ số: dchart trả **điểm, hai số lẻ** (`1853.08`). Repo cấm số thực → nhân 100.

Nhét chung một cột thì cột đó mang hai nghĩa tuỳ dòng. Đó là kiểu lỗi không có test nào
bắt được và không có màn nào hiện ra.

## 3. Tầng dữ liệu

### Migration mới (0061)

```sql
-- Giá đóng cửa ĐÃ ĐIỀU CHỈNH theo ngày, cho mã người dùng từng giao dịch.
create table public.stock_price_history (
  symbol       text   not null,
  trading_date date   not null,
  close        bigint not null check (close > 0),  -- ĐỒNG/cổ, cùng đơn vị stock_prices.price
  primary key (symbol, trading_date)
);

-- Chỉ số thị trường. Tách bảng vì đơn vị khác (xem §2).
create table public.index_prices (
  index_code   text   not null,                    -- 'VNINDEX'
  trading_date date   not null,
  close_x100   bigint not null check (close_x100 > 0),  -- ĐIỂM × 100: 1853,08 → 185308
  primary key (index_code, trading_date)
);
```

RLS y hệt `stock_prices` (migration 0035): đọc cho `authenticated`, ghi không policy nào
→ chỉ service role. Dữ liệu công khai, không thuộc user nào.

Hai cột thêm vào bảng có sẵn:

```sql
alter table public.stock_prices add column industry text not null default '';
alter table public.transactions add column stock_symbol text;
```

`stock_prices.industry` — bảng đó đã là chỗ trả lời "mã này là gì" (nó đang giữ `name`),
nên ngành về đúng chỗ, không đẻ bảng thứ ba.

`transactions.stock_symbol` — cột tuỳ chọn theo đúng khuôn `remit_recipient_id`
(migration 0056). **Vì sao ở đây chứ không phải một `kind='dividend'` trong sổ lệnh:**
`brokerCash()` (holdings.ts:163) tính tiền mặt = số dư sổ − tiền đã mua. Cổ tức tiền của
người dùng đã vào số dư sổ dưới dạng giao dịch thu rồi, nên tiền mặt đã đúng. Thêm một
loại lệnh mang tiền vào sổ lệnh là **đếm hai lần**. Thứ duy nhất còn thiếu là "khoản thu
này thuộc mã nào" — đúng một cột.

### `src/types/database.types.ts`

Viết tay, không codegen. Hai bảng mới + hai cột mới phải vào **cùng commit** với migration
(luật CLAUDE.md). Quên là compiler im lặng và query chết lúc chạy.

### `src/data/repo.ts` + hai bản cài đặt

Thêm vào interface `Repo`:

- `getStockPriceHistory(symbols: string[], from: string): Promise<StockPriceHistoryRow[]>`
- `getIndexPrices(code: string, from: string): Promise<IndexPriceRow[]>`

`supabaseRepo` và `demoRepo` phải cùng thoả — thiếu một bên là lỗi biên dịch, đúng ý đồ.
`demoRepo` sinh chuỗi giả có hình dạng thật (một đường đi lên có nhiễu) để chế độ demo
vẫn xem được biểu đồ.

Đọc qua `fetchAllPages` (`src/data/paging.ts`) — PostgREST chặn ở 1.000 dòng, mà 5 mã ×
250 phiên đã là 1.250.

### `src/hooks/queries.ts` — cửa duy nhất

`useStockPriceHistory(symbols, from)` và `useIndexPrices(from)`. Khoá cache theo đúng
chuỗi `from` để hai khu trên cùng trang không đọc hai lượt.

**Chỉ tải phần đang xem.** `from` bám theo chip khoảng thời gian đang chọn: 1Y ≈ 250 phiên
× số mã ≈ 40KB. Bấm "Tất cả" mới kéo hết (~350KB). Kéo hết ngay từ đầu là nhét ngần ấy
vào bộ nhớ đệm localStorage mỗi lần mở app — xem ghi chú `cache-persist-cua-app`.

## 4. Edge function `stock-refresh`

Function đang chạy mỗi chiều sau khi sàn đóng. Thêm ba việc, **không thêm function mới**:

1. **Tự vá lịch sử.** Mã nào có trong `stock_trades` mà `stock_price_history` chưa có (hoặc
   thiếu quá nhiều phiên) thì gọi dchart lấy nguyên từ 2016, upsert cả loạt. Người dùng mua
   mã mới thì hôm sau tự đầy — không cần ai chạy script tay.
2. **Nối phiên hôm nay** cho mọi mã đang theo, và cho VNINDEX.
3. **Tra ngành** cho mã chưa có `industry`.

Không viết script `scripts/*.mjs` cho việc nạp lần đầu: lượt cron đầu tiên sau khi deploy
đã làm đúng việc đó, và một đường thì không lệch được với chính nó.

Phép tính nào dùng chung với `src/` thì phải qua `_holdings.js` và chạy `npm run bundle:rules`
rồi commit file sinh ra — luật CLAUDE.md, guard là `tests/pushBundle.test.ts`.

## 5. Tầng toán — file thuần, không JSX, có test

Bốn file mới trong `src/features/assets/`. `investHistory.ts` hiện tại **không đụng vào**:
nó chạy trên `account_valuations`, phục vụ `AssetsTrendView` và gộp cả quỹ JPY — khác việc.

### `navSeries.ts`

Dựng lại danh mục theo từng phiên: khối lượng từng mã tại ngày đó (cộng dồn `stock_trades`,
gồm `kind='adjust'` cho chia/gộp) × giá đóng cửa ngày đó, cộng tiền mặt môi giới.

Ra: `{ date, marketValue, cash, externalFlow }[]` — `externalFlow` là tiền nạp/rút từ
ngoài vào tài khoản trong ngày, lấy từ sổ giao dịch, cùng bảng nhánh với view
`account_balances` (migration 0016). Lệch một nhánh là mép phải không trùng số dư mà mọi
màn khác đang in.

### `twr.ts`

Chuỗi lợi nhuận đã bóc tiền nạp/rút (time-weighted): mỗi phiên lấy
`(V_cuối − dòng tiền) / V_đầu`, nhân dồn, chuẩn hoá về 100 tại đầu khung nhìn. Đây là thứ
làm cho đường của người dùng đứng cạnh VN-Index một cách công bằng — dùng % giá trị thô
thì nạp thêm tiền sẽ trông như lãi.

Từ chuỗi này rơi ra cả hàng Hiệu quả: Tổng lợi nhuận · 1 tuần · Từ đầu năm · 1 năm · Lãi
kép bình quân 1 năm. Không tính riêng chỗ nào.

### `riskMetrics.ts`

- **beta** = hiệp phương sai(lợi suất ngày của danh mục, của VNINDEX) / phương sai(VNINDEX)
- **biến động** = độ lệch chuẩn lợi suất ngày × √252
- **phân loại rủi ro theo mã**: cao ≥ 20% · trung bình 10–20% · thấp ≤ 10% (đúng ngưỡng
  Simplize in ra trên trang, để hai bên so được với nhau)
- **Sharpe** = (lợi nhuận năm hoá − lãi suất không rủi ro) / biến động

Lãi suất không rủi ro là **một hằng số có tên, có chú thích, ở một chỗ** — không rải số
5% giữa công thức. Chọn 4,5%/năm (quanh mức tiết kiệm 12 tháng VN); ai đổi thì đổi một chỗ.

### `sectorWeights.ts`

Tỷ trọng theo ngành từ `stock_prices.industry`. Mã chưa có ngành gom vào "Chưa rõ" chứ
không bỏ khỏi tổng — cùng quy ước với `hasMissingRate`: thà thiếu và nói ra còn hơn bịa.

## 6. Giao diện

`InvestStocksTab.tsx` hiện có ba khu (Giá trị danh mục · Đang giữ · Sổ lệnh) thành sáu.
Mỗi khu một file, tab chỉ còn là chỗ xếp — file đang 360+ dòng, thêm ba khu nữa vào đó là
một file không ai đọc nổi.

| Khu | Nội dung | Bước |
|---|---|---|
| Dải chỉ số | Tổng giá trị · Giá trị cổ phiếu · Tiền mặt · Lãi/lỗ chưa thực hiện | 2 |
| Hiệu quả | 5 con số + biểu đồ NAV vs VN-Index + chip 3M/6M/1Y/3Y/5Y/Tất cả | 1 |
| Cơ cấu danh mục | bảng đủ cột, gồm Cổ tức đã nhận | 2 |
| Tỷ trọng | donut theo mã · donut theo ngành | 2 / 4 |
| Rủi ro | cơ cấu rủi ro · thang beta · thang Sharpe | 3 |
| Sổ lệnh | giữ nguyên | — |

**Luật giao diện phải theo** (docs/design-system.md, guard `tests/designSystem.test.ts`):

- Tiêu đề khu qua `<SectionTitle>`, không `<h2>`/`<h3>` viết tay.
- Mọi con số qua `<Money>` (tiền) hoặc `<Num>` (%, đếm, hệ số).
- Không chêm giá trị tuỳ ý: `text-[…rem]`, `duration-[…]`, `w-[420px]` đều bị ban cứng.
- Màu recharts là **hằng số JS** (thư viện không ăn biến CSS); chú giải phải trỏ vào đúng
  hằng số đó bằng `style={{ backgroundColor: … }}`, không đặt màu chú giải bằng class.
- Cỡ chữ trong biểu đồ qua `CHART_TEXT_*` của `src/lib/chartText.ts` — truyền số là chữ
  đứng yên khi người dùng phóng Cỡ chữ 1,25×.
- Ba mức rủi ro dùng `STATUS_FILL` / `STATUS_CHIP` của `statusColors.ts`, không tự chọn
  sắc độ. Hai chỗ nói cùng một ý nghĩa mà lệch màu là bẫy đã ghi trong design-system.

**Không bê bảng màu Simplize sang.** Đỏ/cam trong Sổ Gạo đang mang nghĩa "cảnh báo / vượt
ngân sách"; dùng nó cho một vòng tròn trung tính sẽ làm người dùng tưởng có chuyện.

**Điện thoại:** bảng Cơ cấu danh mục xuống thành mỗi mã một thẻ, không cuộn ngang. Body
không bao giờ được cuộn ngang.

## 7. Thiếu dữ liệu thì hiện gì

Cùng một triết lý với `hasMissingRate` xuyên repo: loại ra, bật cờ, nói thẳng.

| Trường hợp | Xử lý |
|---|---|
| Mã chưa có lịch sử giá (vừa mua, cron chưa chạy) | loại khỏi NAV các phiên đó, hiện nhãn "đang tải lịch sử cho MÃ" |
| Chưa có phiên hôm nay của VNINDEX | đường chỉ số dừng ở phiên gần nhất, không nội suy |
| Sổ lệnh thiếu lần nạp tiền (`cash < 0`) | `marketValue` trả `null` sẵn rồi — khu Hiệu quả hiện trạng thái rỗng kèm lý do |
| Mã chưa tra được ngành | gom "Chưa rõ", vẫn nằm trong tổng |
| Nghi có chia/gộp chưa ghi vào sổ | cảnh báo, xem §10 |

## 8. Kiểm thử

- Unit test cho cả bốn file toán — đây là chỗ test thật sự bắt được lỗi.
- `navSeries`: một ca đối chiếu mép phải phải **trùng** giá trị danh mục mà khu Giá trị
  đang in. Hai màn cạnh nhau lệch số là lỗi tệ nhất của trang này.
- `twr`: ca có nạp tiền giữa kỳ — lợi nhuận phải **không đổi** khi thêm một lần nạp.
- `riskMetrics`: beta của chính chỉ số với chính nó phải bằng 1.
- `npm test` phải xanh, gồm `designSystem.test.ts` và `pushBundle.test.ts`.
- `npm run build` (tức `tsc -b`, **không phải** `tsc --noEmit` — xem ghi chú
  `tsc-noemit-khong-kiem-gi`).
- Mở app xem thật: chế độ **Sáng**, cỡ chữ **1,25×** ở **375px**, và biểu thức JSX có in
  ra giá trị chứ không in ra `{...}` — ba thứ `npm test` không thấy.

## 9. Bốn bước

1. Nền dữ liệu (migration, types, repo, hook, edge function) + khu Hiệu quả với biểu đồ
   NAV vs VN-Index. Khó nhất, và là thứ người dùng hỏi đầu tiên.
2. Dải chỉ số + bảng Cơ cấu đủ cột + donut theo mã + cột Cổ tức (gồm ô chọn mã ở form Nhập).
   Không phụ thuộc bước 1.
3. beta + Sharpe + cơ cấu rủi ro. Dựa trên nền bước 1.
4. Tỷ trọng theo ngành. Độc lập.

Mỗi bước tự đứng được và tự dùng được.

## 10. Giới hạn đã biết

**Giá lịch sử là giá đã điều chỉnh.** dchart trả HPG ngày 2016-01-04 là 2.563 ₫ — đã điều
chỉnh cổ tức và chia tách, không phải giá danh nghĩa hồi đó. Điều chỉnh là **đúng** cho
việc đo lợi nhuận. Nhưng khối lượng thì dựng lại từ `stock_trades`; nếu sổ lệnh không ghi
cổ phiếu thưởng hay chia tách, khối lượng ở giai đoạn trước lần chia đó bị thấp và NAV quá
khứ hụt một đoạn.

Sổ lệnh **có** chỗ ghi: `kind='adjust'` với `quantity` âm hoặc dương (database.types.ts:436).
Nên đây là chuyện ghi chép, không phải chuyện thiếu cấu trúc. App sẽ tự dò: khi lịch sử giá
điều chỉnh gợi ý một lần chia mà sổ lệnh không có `adjust` nào quanh đó, hiện nhắc "có thể
thiếu một lần chia tách của MÃ quanh NGÀY". Không tự sửa sổ của người dùng.

**Cột Cổ tức chỉ đếm khoản đã gắn mã.** Cổ tức ghi trước khi có cột `stock_symbol` sẽ
trống cho tới khi người dùng gắn lại. Không đoán mã từ ghi chú.
