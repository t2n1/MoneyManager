# Gộp danh mục đầu tư về một trang

Ngày: 2026-08-13

App đang có hai chỗ trả lời cùng một câu hỏi "tôi đang giữ gì". Trang **Đầu tư**
(`/invest`) gộp mọi tài khoản chứng khoán VND; khu **Danh mục** trên trang chi tiết tài
khoản nói về đúng một tài khoản. Với người chỉ có một tài khoản iDragon, trang Đầu tư là
bản bao trùm của khu Danh mục — cùng bộ số, nhãn khác nhau.

Cùng lúc đó, tài khoản NISA (JPY, quỹ Nhật) **không có mặt** ở trang Đầu tư: `useInvestData`
lọc `currency === 'VND'`. Trang tên là "Đầu tư" mà chỉ là "cổ phiếu Việt Nam".

Bản thiết kế này gộp cả hai chuyện: `/invest` thành trang danh mục **duy nhất**, có hai
tab (cổ phiếu VN / quỹ Nhật), và trang chi tiết tài khoản bỏ hẳn khu danh mục.

## Nói rõ trước: phép tính KHÔNG bị nhân đôi

Ấn tượng đầu là "hai đường code tính cùng một thứ". Đọc kỹ thì không phải:
[`portfolio.ts`](../../../src/features/assets/portfolio.ts) gọi thẳng
`holdingsFromTrades` và `brokerCash` của
[`holdings.ts`](../../../src/features/assets/holdings.ts). Một engine, hai người gọi.

Cái thật sự bị nhân đôi chỉ có hai chỗ:

| Chỗ trùng | Ở đâu |
|---|---|
| Tầng trình bày | `HoldingsSection.tsx` và `InvestPage.tsx` vẽ cùng bộ số với nhãn khác nhau |
| Đúng **một** quy tắc | `cash < 0 \|\| allMissing → null` viết ở `portfolioValue` rồi viết lại ở `buildPortfolio` |

Nên phạm vi bản này là **dọn tầng trình bày**, không phải hợp nhất engine. Bên quỹ thì
ngược lại: chưa có hàm gộp nhiều tài khoản nào cả, phải viết mới.

## Nhãn đang lệch nhau

Cùng một con số, hai tên. Đây là danh sách đầy đủ, và là lý do "hai trang giống nhau" gây
nghi ngờ chứ không gây tiện:

| Ý nghĩa | Trang Đầu tư | Khu Danh mục |
|---|---|---|
| Tổng giá trị danh mục | Giá trị danh mục | Tổng giá trị |
| Tiền còn ở công ty chứng khoán | Tiền chưa mua | Tiền chưa đầu tư |
| Lãi/lỗ đã hiện thực hoá | Lời/lỗ đã bán | Lãi đã chốt |
| Ngày phiên | `26/08/12` (có năm) | `08/12` (không năm) |

Ngày phiên **không** phải lỗi thứ tự ngày/tháng: cả hai đang theo đúng quy ước
tháng/ngày của app ([`dates.ts:119`](../../../src/lib/dates.ts#L119)), chỉ khác chỗ có in
năm hay không. Nhưng ba chú thích trong code đang tự khai sai là `dd/mm/yy` và `dd/mm`
([`InvestPage.tsx:23`](../../../src/features/assets/InvestPage.tsx#L23),
[`HoldingsSection.tsx:26`](../../../src/features/assets/HoldingsSection.tsx#L26),
[`FundHoldingsSection.tsx:35`](../../../src/features/assets/FundHoldingsSection.tsx#L35)) —
sửa luôn chú thích ở hàm còn lại sau khi gộp. Sổ lệnh trải nhiều năm nên bản gộp giữ dạng
**có năm**.

## Quyết định 1 — "%" tính trên giá vốn sổ lệnh

Hai trang đang chia cho hai mốc khác nhau: trang Đầu tư chia cho **giá vốn cổ phiếu đang
giữ** (`stockCost`), trang tài khoản chia cho **số dư sổ** (`balance`, tức nạp − rút). Cùng
một tài khoản ra hai phần trăm khác nhau.

Chốt: **giá vốn sổ lệnh**, ở mọi chỗ nói về danh mục.

Lý do không phải "đúng hơn về tài chính" mà là **kiểm chứng được**. Số theo giá vốn sổ
lệnh đối chiếu được với app iDragon/Rakuten — lệch là biết ngay, và biết lệch ở đâu. Số
theo số dư sổ phụ thuộc việc sổ thu chi đã ghi đủ mọi lần nạp/rút; thiếu một lần chuyển
tiền là con số sai mà không có dấu hiệu gì. Giới hạn đó đã được ghi nhận ở
[`FundHoldingsSection.tsx:10`](../../../src/features/assets/FundHoldingsSection.tsx#L10).

Câu "tiền tôi bỏ vào sinh lợi bao nhiêu" **không mất đi**: nó đã được trả lời tốt hơn ở ô
"Hiệu quả đầu tư" tab Diễn biến
([`InvestmentPerformanceSection.tsx`](../../../src/features/assets/InvestmentPerformanceSection.tsx)),
bằng XIRR — có tính cả thời điểm bỏ tiền, rồi quy ra %/năm, sau thuế, sau lạm phát. So với
nó thì con số cũ trên trang tài khoản là bản thô của cùng một câu hỏi, lại không nói ra là
nó đo cái khác.

Hệ quả: dòng **"Vốn gốc (đã bỏ vào)"** biến mất khỏi trang tài khoản (chỉ với tài khoản có
sổ lệnh). Nó không bị xoá khỏi app — tab Diễn biến in đúng con số đó dưới nhãn "Tiền bạn bỏ
vào", cạnh %/năm mà nó thuộc về.

## Quyết định 2 — trang tài khoản không có phép tính riêng nào

`useAccountPortfolio(account)` chọn engine theo loại tiền rồi gọi **đúng hàm mà tab dùng**,
với mảng một phần tử:

```
VND → buildPortfolio([{ …account, balance }], priceBySymbol)
JPY → buildFundPortfolio([account], navByFund)
```

`balance` (số dư sổ) là tham số `brokerCash` cần để ra "tiền chưa mua", nên hook tự đọc
`useAccountBalances` — không bắt trang gọi truyền vào như `HoldingsSection` đang làm. Bên
quỹ không cần: `FundAccountTrades` không có `balance`.

Nhờ vậy "hai trang lệch nhau" trở thành chuyện *không biểu diễn được*, chứ không phải
chuyện phải nhớ đồng bộ. Đây là điểm chính của bản thiết kế; mọi thứ còn lại là hệ quả.

Trang tài khoản **không** có sổ lệnh (tài khoản đầu tư khác VND/JPY, hoặc chưa ghi lệnh
nào) giữ nguyên hành vi hôm nay: định giá nhập tay, nút "Cập nhật giá trị", khu "Lịch sử
giá trị". `investmentStats` ở
[`investment.ts`](../../../src/features/assets/investment.ts) vẫn dùng cho đúng trường hợp
này, không xoá.

## Quyết định 3 — hai tab, không có con số gộp tỷ giá

`/invest` có `SegmentedControl` hai tab: **Cổ phiếu VN** · **Quỹ Nhật**. Không có dòng
"toàn bộ đầu tư" quy đổi về một loại tiền. Câu hỏi gộp đã có chỗ trả lời: tab Hiện tại của
trang Tài sản, nơi đã có sẵn tỷ giá, dấu ước tính và nút "xem thử bằng tiền khác".

Tab nằm trong URL (`?tab=stocks|funds`) chứ không phải `useState`, cùng lối
[`AssetsPage.tsx:58`](../../../src/features/assets/AssetsPage.tsx#L58) — để link chia sẻ,
lịch sử trình duyệt và nút quay lại mở đúng tab.

Tab mặc định khi không có `?tab=`: tab nào **có tài khoản** thì mở tab đó; có cả hai thì mở
`stocks`. Không bao giờ mở mặc định vào một tab rỗng.

Điều kiện của mỗi tab giữ nguyên điều kiện repo đang dùng:

| Tab | Điều kiện tài khoản |
|---|---|
| Cổ phiếu VN | `type='investment'` · `currency='VND'` · chưa lưu trữ |
| Quỹ Nhật | `type='investment'` · `currency='JPY'` · chưa lưu trữ |

Biết trước và **cố ý không chữa**: tab Quỹ Nhật lọc theo *loại tiền*, không theo "đã có
lệnh quỹ". Nếu sau này mở tài khoản chứng khoán Nhật (JPY nhưng mua cổ phiếu), nó sẽ lọt
vào tab quỹ. Đổi bây giờ là dự phòng cho việc chưa xảy ra, và sẽ làm điều kiện ở đây lệch
khỏi điều kiện trong `co-phieu-viet-nam.md` / `quy-nhat.md`.

## Quyết định 4 — lọc theo tài khoản bằng `?account=`

Link từ trang tài khoản sang `/invest?tab=…&account=<id>`, mở tab đúng loại và lọc sẵn về
tài khoản đó. Trong tab, chip chọn tài khoản ("Tất cả · iDragon · …") **chỉ hiện khi tab
đó có từ hai tài khoản** — một tài khoản thì không có gì để chọn, và chip đó sẽ chỉ là một
dòng nhiễu đúng với mọi lần mở.

`account` không khớp tài khoản nào trong tab (bookmark cũ, tài khoản đã xoá/lưu trữ) → bỏ
qua tham số, hiện tất cả. Không báo lỗi: người dùng vào đây để xem danh mục, không để nghe
về một id.

## Quyết định 5 — "Lịch sử giá trị" chỉ hiện hàng gõ tay

Phát hiện trong lúc khảo sát: `account_valuations` **không còn là bảng người dùng gõ tay**.
Từ migration 0035, cron ghi vào đó mỗi ngày với `source = 'auto'`
([`0035_stock_prices_trades.sql:105`](../../../supabase/migrations/0035_stock_prices_trades.sql#L105)),
mỗi tài khoản mỗi ngày một hàng (`unique (account_id, valued_on)`), và không có chỗ nào
dọn. Khu "Lịch sử giá trị" trên trang iDragon/NISA vì thế là một danh sách dài ra mỗi
ngày, kèm nút xoá từng dòng — thứ không ai chủ ý tạo ra.

Chốt: khu đó **chỉ liệt kê hàng `source = 'manual'`**. Với tài khoản có sổ lệnh thì danh
sách rỗng và khu không render.

Không dọn hàng `auto` trong DB, và không đổi cách cron ghi: tab Diễn biến dùng chính những
hàng đó để vẽ lịch sử tài sản ròng.

Chế độ demo cũng đúng theo bộ lọc này: `demoRepo` tự dựng hàng `auto` từ sổ lệnh mẫu
([`demoRepo.ts:720`](../../../src/data/demoRepo.ts#L720)) và đã gắn `source`, nên khu lịch
sử ở demo cũng ẩn — giống hệt app thật.

Không kéo theo việc gì ở tầng dữ liệu: `listValuations` đã `select('*')` và
`AccountValuationRow` đã có `source: 'manual' | 'auto'`
([`database.types.ts:309`](../../../src/types/database.types.ts#L309)). Chỉ là chỗ hiện
đang **không đọc** cột đó.

## Quyết định 6 — Tổng tài sản vẫn đọc snapshot, KHÔNG tính tại máy

Sau bản này, trang tài khoản và tab Đầu tư tính giá trị **tại máy** từ sổ lệnh + bảng giá.
Tab Hiện tại (Tổng tài sản, cơ cấu, lịch sử ròng) vẫn đọc `market_value` — snapshot cron
ghi, qua [`aggregate.ts:187`](../../../src/features/assets/aggregate.ts#L187).

Cron ghi snapshot **ngay sau khi hút giá trong cùng một lượt chạy**, từ cùng bảng
`stock_prices`, nên đường bình thường hai con số trùng khít. Nhưng phải nói thẳng: cron
**từ chối ghi** trong nhiều trường hợp hơn tôi tưởng lúc đầu, và đó đúng là những lúc hai
bên lệch nhau:

| Cron bỏ qua vì | Snapshot | Tính tại máy |
|---|---|---|
| `gia-le-phien-cu` — một mã đang giữ còn kẹt giá phiên cũ ([`stock-refresh:143`](../../../supabase/functions/stock-refresh/index.ts#L143)) | Đứng ở phiên trước, có thể nhiều ngày | Vẫn hiện số, kèm `EstimateMark` và dòng "đang dùng giá của phiên trước" |
| `so-lenh-co-lo-hong` — bán quá số đang giữ | Không ghi | Vẫn hiện số, kèm cảnh báo `oversold` |
| `tien-chua-dau-tu-am` / `thieu-gia-moi-ma` / `thieu-gia-moi-quy` | Không ghi | `marketValue = null` → hiện số dư sổ + câu giải thích |
| Sửa/thêm lệnh giữa hai lượt cron | Chưa đổi | Đổi ngay (mức lệch gần 0: mua là tiền chuyển thành cổ phiếu) |

Vẫn giữ quyết định này, vì mức lệch **không im lặng**: đúng những lúc snapshot đứng lại,
phía tính tại máy đều có dấu ước tính hoặc cảnh báo nói rõ nó đang dựa trên cái gì, và
`DataFreshness` ngay dưới tiêu đề trang Tài sản nói tuổi dữ liệu. Thêm nữa, trang tài khoản
**hôm nay đã** đọc snapshot, nên con số tính tại máy là bước tiến chứ không phải bước lùi.
Đổi `aggregate.ts` sang tính tại máy sẽ kéo theo cơ cấu tài sản, lịch sử tài sản ròng,
Lifetime và bộ test của cả ba — việc riêng, xứng một spec riêng nếu sau này thấy vướng.

## Quyết định 7 — sửa nhãn "chưa thực hiện" ở tab Hiện tại (không đổi số)

Soát lần hai mới thấy: sau khi chốt quyết định 1, vẫn còn **chỗ thứ ba** hiện lãi/lỗ của
đúng tài khoản đó, với một con số khác, dưới một cái nhãn sai.

[`AssetsNowView.tsx:324`](../../../src/features/assets/AssetsNowView.tsx#L324) in "Lãi/lỗ
đầu tư **(chưa thực hiện)**", lấy từ `unrealizedPnlBase` của
[`aggregate.ts:207`](../../../src/features/assets/aggregate.ts#L207), định nghĩa là
`base(marketValue) − base(balance)`. Với tài khoản có sổ lệnh thì con số đó **không phải**
lãi chưa thực hiện. Chứng minh bằng chính hai hàm trong `holdings.ts`:

```
brokerCash   = balance − spent
marketValue  = stockValue + brokerCash = stockValue + balance − spent
⇒ marketValue − balance = stockValue − spent

spent        = Σ(mua) − Σ(bán) = stockCost − realizedPnl
⇒ marketValue − balance = (stockValue − stockCost) + realizedPnl
               = unrealizedPnl + realizedPnl
```

Tức nó là **tổng lời/lỗ**, gồm cả phần đã bán — vì tiền bán đã về `brokerCash` và nằm
trong `marketValue`. Cổ tức tiền và các lần rút không làm sai công thức: chúng đổi cả
`balance` lẫn `cash` cùng một lượng nên triệt tiêu. Cổ phiếu thưởng ghi bằng `adjust` cũng
vào cả hai phía như nhau.

Hệ quả nếu để nguyên: trang iDragon ghi "Lời/lỗ chưa bán +6.270.000", dòng iDragon ở tab
Hiện tại ghi "▲ 7.510.000", chênh nhau đúng phần đã bán, và không chỗ nào nói ra.

Chốt: **sửa nhãn, không sửa số.** Con số tổng lời/lỗ là con số đúng cho một màn tổng quan
tài sản; chỉ có chữ "(chưa thực hiện)" là sai. Nhãn mới: **"Lãi/lỗ đầu tư (gồm đã bán)"**.

Không phải tôi tự nghĩ ra cách gọi đó. Ngay trong tab Diễn biến,
[`InvestmentPerformanceSection.tsx:157`](../../../src/features/assets/InvestmentPerformanceSection.tsx#L157)
tính **đúng cùng một hiệu** `currentValue − costBasis` và gọi nó là "Thị trường cho thêm" /
"Thị trường lấy đi" — không hề khai là "chưa thực hiện". Tức repo đã có một chỗ nói đúng về
con số này; chỗ sai là chỗ còn lại. Sửa nhãn ở `AssetsNowView` là làm cho hai chỗ nói cùng
một thứ, không phải đặt ra từ vựng mới. Kèm đổi tên `unrealizedPnlBase` →
`totalPnlBase` và `AssetBreakdown.unrealizedPnl` → `totalPnl`: một field tên
`unrealized` mà chứa tổng là cái bẫy đặt sẵn cho người đọc sau. Đây là đổi tên thuần, không
đổi hành vi — `aggregate.test.ts` phải xanh với đúng những con số cũ.

Không đổi số ở tab Hiện tại thành "chỉ phần chưa bán": làm vậy cần sổ lệnh trong
`aggregate.ts` (hiện chỉ có `account_balances`), tức kéo cả cơ cấu tài sản và lịch sử ròng
vào — cùng lý do đã từ chối ở quyết định 6.

**Đổi tên phải khoanh vùng, KHÔNG tìm-thay toàn repo.** Chín file có chữ `unrealizedPnl` và
phần lớn đang **đúng**: `portfolio.ts` (`stockValue − stockCost`, đúng nghĩa chưa thực hiện)
và `investment.ts` không được chạm. Chỉ hai chỗ đổi: `AssetAccount.unrealizedPnlBase` và
`AssetBreakdown.unrealizedPnl` trong `aggregate.ts`, cùng chỗ đọc chúng ở `AssetsNowView`.

Riêng `investment.ts` đáng nói: `investmentStats` dùng **đúng công thức**
`marketValue − balance`, nên tên `unrealizedPnl` ở đó cũng sẽ sai — *nếu* nó còn chạy cho
tài khoản có sổ lệnh. Sau quyết định 2 thì không: nó chỉ còn phục vụ tài khoản định giá tay,
nơi không có khái niệm "đã bán" nào tách ra được. Tên đó đúng lại **nhờ** miền dùng bị thu
hẹp — ghi ra đây để lần sau không ai mở rộng nó trở lại mà quên.

### Cập nhật 2026-08-15 — nửa sau của quyết định này đã bị đảo

Quyết định 7 sửa nhãn ở **khối xanh** (tổng) và để nguyên con số ▲ nhỏ cạnh **từng tên tài
khoản**, vốn cũng là `marketValue − balance`. Nhưng khối xanh có chỗ ghi nhãn, dòng tài
khoản thì không — nên đúng cái "hệ quả nếu để nguyên" mô tả ở trên vẫn xảy ra nguyên vẹn,
chỉ dịch xuống một dòng. Người dùng báo lỗi bằng đúng hai ảnh chụp ấy: dòng iDragon
▲127.135.455 đ, trang iDragon "Lời/lỗ chưa bán +37.705.702 đ".

Nay dòng tài khoản in **lời/lỗ chưa bán**, đúng con số trang chi tiết in. Khối xanh giữ
nguyên tổng "gồm đã bán" — nhãn của nó vẫn đúng và vẫn là con số đúng cho một màn tổng quan.

Lý do từ chối ở trên ("cần sổ lệnh trong `aggregate.ts`, tức kéo cả cơ cấu tài sản và lịch
sử ròng vào") vẫn được tôn trọng: `aggregate.ts` **không** đụng tới. Sổ lệnh vào qua một hook
riêng `useInvestPnl.ts`, gọi cùng hàm thuần `accountPortfolioSummary` mà trang chi tiết gọi
— nên hai màn lệch nhau là chuyện không biểu diễn được, chứ không phải chuyện phải nhớ đồng
bộ. `totalPnlBase`/`totalPnl` giữ nguyên tên và nguyên nghĩa.

## Kiến trúc

### File

| | File | Việc |
|---|---|---|
| Thêm | `assets/InvestStocksTab.tsx` | Nội dung tab cổ phiếu — chuyển nguyên từ `InvestPage` hiện tại |
| Thêm | `assets/InvestFundsTab.tsx` | Nội dung tab quỹ |
| Thêm | `assets/fundPortfolio.ts` | `buildFundPortfolio` — gộp nhiều tài khoản JPY |
| Thêm | `assets/fundPortfolio.test.ts` | |
| Thêm | `assets/useFundInvestData.ts` | Đọc dữ liệu cho tab quỹ |
| Thêm | `assets/useAccountPortfolio.ts` | Số tóm tắt cho trang tài khoản |
| Sửa | `assets/InvestPage.tsx` | Còn vỏ: header + tab + đọc `?tab`/`?account` |
| Sửa | `assets/useInvestData.ts` | Nhận lọc theo `accountId` |
| Sửa | `assets/holdings.ts` | Rút `reliableTotal` |
| Sửa | `assets/portfolio.ts` | Gọi `reliableTotal` thay vì viết lại quy tắc |
| Sửa | `assets/AccountDetailPage.tsx` | Bỏ hai khu danh mục, đổi nguồn giá trị, lọc `source` |
| Sửa | `assets/AssetsPage.tsx` | Mở lối vào `/invest` cho tài khoản JPY |
| Sửa | `assets/aggregate.ts` · `assets/AssetsNowView.tsx` | Quyết định 7 — đổi tên field và nhãn, không đổi số |
| Sửa | `App.tsx` | `lazyRoute(<InvestPage />, 'list')` → `'cards'` |
| Sửa | `data/demoRepo.ts` | Mở `tuTinhAutoValuation` cho tài khoản đầu tư JPY |
| Xoá | `assets/HoldingsSection.tsx` | |
| Xoá | `assets/FundHoldingsSection.tsx` | |

`TradeFormSheet` và `FundTradeFormSheet` chuyển hẳn sang hai tab; `AccountDetailPage` bỏ
được hai state sheet (`tradeSheet`, `fundSheet`) và hai import.

### `reliableTotal` — quy tắc rút ra

Quy tắc bị viết hai lần là quy tắc của **cổ phiếu** (quỹ không có tiền nhàn rỗi nên
`fundValue` chỉ có nhánh `allMissing`):

```ts
/** Tổng đáng tin của một danh mục cổ phiếu; null = không đáng tin. */
export function reliableTotal(
  stockValue: number,
  cash: number,
  allMissing: boolean,
): number | null
```

`portfolioValue` và `buildPortfolio` đều gọi hàm này. Không đổi hành vi — chỉ dồn về một
chỗ để lần sau sửa một lần.

### `buildFundPortfolio` — dựng theo khuôn `buildPortfolio`

```ts
export interface FundAccountTrades {
  accountId: string
  accountName: string
  trades: FundTrade[]
}

export interface FundPortfolioPosition {
  assocFundCd: string
  units: number
  costBasis: number
  avgNav: number          // ¥/10.000口
  nav: number | null
  value: number
  pnl: number
  pnlPercent: number | null
  weight: number
  accountNames: string[]
}

export interface FundPortfolio {
  positions: FundPortfolioPosition[]
  fundCost: number
  fundValue: number
  unrealizedPnl: number
  unrealizedPercent: number | null
  realizedPnl: number
  marketValue: number | null   // null khi thiếu giá MỌI quỹ
  missingNavs: string[]
  oversold: string[]
}
```

Ba điều bắt buộc, mỗi điều có một lý do đã được trả giá ở chỗ khác trong repo:

1. **Cộng dồn từng tài khoản rồi mới gộp**, không đổ chung sổ lệnh vào một rổ — cùng lý do
   `portfolio.ts` nêu ở đầu file: giá vốn bình quân là của từng công ty chứng khoán, đổ
   chung là ra một con số không khớp app nào.
2. **Làm tròn theo từng cặp (tài khoản, quỹ)** qua `fundLineValue`, rồi mới cộng vào dòng
   gộp. Cộng `units` của hai tài khoản rồi mới làm tròn một lần sẽ lệch tổng của hai trang
   chi tiết đúng 1 ¥ — và cái bất biến "tổng ở tab = tổng các trang cộng lại" là thứ giữ
   cho hai chỗ không bao giờ đá nhau.
3. **`sessionNavs` nhận hợp của mọi quỹ đang giữ** trên tất cả tài khoản JPY.
   `sessionNavs(rows, heldFundCds)` **throw** khi thiếu tham số thứ hai
   ([`fundHoldings.ts:216`](../../../src/features/assets/fundHoldings.ts#L216)) — chốt đó có
   sẵn vì đúng lỗi này đã xảy ra một lần ở edge function.

`FundPortfolio` **không có** `cash`: Rakuten quét sạch tiền dư về 楽天銀行, tài khoản không
giữ tiền nhàn rỗi (xem `fundHoldings.ts`, lý do 3).

### Trạng thái rỗng — mỗi tab một câu, không dùng chung

`InvestPage` hôm nay có một câu duy nhất: "Chưa có tài khoản chứng khoán nào… tạo tài khoản
loại Đầu tư với loại tiền **VND**". Câu đó sai với tab quỹ. Hai tab, hai câu, mỗi câu chỉ
nói về loại tiền của chính nó và dẫn tới `/settings/accounts`. Tab rỗng vẫn hiện được (bấm
tay vào tab đó), chỉ là không bao giờ được **mở mặc định** — xem quyết định 3.

### Chế độ demo — phải lấp một lỗ có sẵn, kẻo bản này phơi nó ra

`demoRepo` không có cron nên tự dựng snapshot `auto` bằng chính các hàm thuần của
`holdings.ts`, mô phỏng từng bước của `stock-refresh`. Nhưng nó chỉ làm cho **VND**:
[`demoRepo.ts:721`](../../../src/data/demoRepo.ts#L721) trả `null` ngay khi
`currency !== 'VND'`. Nghĩa là tài khoản NISA của demo không có snapshot nào, và
[`demoRepo.ts:296`](../../../src/data/demoRepo.ts#L296) seed nó với số dư sổ **0** (cố ý —
"vốn gốc đến từ `fund_trades`, không phải số dư sổ").

Hôm nay lỗ đó gần như không thấy: trang NISA đọc snapshot rỗng nên đỉnh trang hiện ¥0, và
Tổng tài sản cũng ¥0 — sai giống nhau nên không ai để ý (dù ngay dưới đỉnh trang, khu Danh
mục quỹ đã hiện ¥2,8 triệu). Sau bản này đỉnh trang chuyển sang số tính tại máy, tức **¥2,8
triệu ở trang tài khoản và ¥0 ở Tổng tài sản** — cùng một tài khoản, trên hai màn cạnh nhau.

Nên mở `tuTinhAutoValuation` cho tài khoản đầu tư JPY, mô phỏng `fund-refresh` đúng như nó
đang mô phỏng `stock-refresh`, với **sáu** chốt bỏ qua của bản quỹ. Một chốt khác hẳn bản cổ
phiếu, đừng chép nhầm: quỹ bỏ qua cả khi thiếu giá **một phần**, không chỉ khi thiếu giá mọi
quỹ ([`fund-refresh:305`](../../../supabase/functions/fund-refresh/index.ts#L305) giải thích
vì sao — giữ hai quỹ mà mất giá một quỹ là lệch cỡ 40%, lại đóng dấu `auto` trông như đúng).

Không cần nâng `STORAGE_KEY`: snapshot được tính **lúc đọc**, không nằm trong dữ liệu lưu ở
máy, nên demo cũ vẫn dùng được.

Đổi lại, demo trở thành đường kiểm thật của bản này: nó có **hai** tài khoản đầu tư VND
('Chứng khoán VN', 'Đầu tư VN') và một tài khoản JPY, tức chip `?account=` và bất biến
"cộng dồn từng tài khoản rồi mới gộp" đều bấm tay kiểm được, không phải chạm dữ liệu thật.

### Khung xương lúc tải

`App.tsx` đang bọc `/invest` bằng `PageSkeleton kind="list"`, nhưng trang là ba khối `Card`
và sau bản này còn thêm thanh tab — dáng `'cards'` mới khớp. Sửa luôn vì đang chạm đúng
dòng đó; chú thích của `lazyRoute` nói rõ khung xương phải "hợp dáng trang sắp hiện".

### Trang tài khoản sau khi dọn

Khối đầu trang, với tài khoản **có** sổ lệnh, còn đúng ba dòng:

| Dòng | Nguồn |
|---|---|
| Giá trị hiện tại (số lớn) + "giá phiên dd/mm" | `marketValue` — gồm tiền chưa mua, giống hôm nay |
| Lời/lỗ chưa bán + % | `unrealizedPnl`, % trên `fundCost`/`stockCost` |
| "Danh mục · N mã · sổ lệnh →" | Link `/invest?tab=…&account=…` |

`marketValue === null` (tiền chưa mua âm, hoặc thiếu giá mọi mã/quỹ) → hiện số dư sổ kèm
đúng câu giải thích mà tab đang dùng, không hiện một con số không đáng tin.

Nút "Cập nhật giá trị" và khu "Lịch sử giá trị" không còn xuất hiện ở đây (khu lịch sử tự
rỗng theo quyết định 5; nút thì ẩn khi tài khoản có sổ lệnh). Tài sản cố định **không đổi
gì** — vẫn khấu hao, vẫn định giá tay, vẫn có lịch sử.

### Lối vào `/invest`

Icon `LineChart` ở header trang Tài sản đang khoá theo "có tài khoản chứng khoán VND"
([`AssetsPage.tsx:46`](../../../src/features/assets/AssetsPage.tsx#L46)), với chú thích nói
rõ điều kiện phải **trùng khít** `useInvestData`. Đổi thành "có tài khoản đầu tư VND
**hoặc** JPY", và chú thích phải nhắc cả hai tab.

Ba nhãn nói "cổ phiếu" phải đổi vì lối vào giờ dẫn tới cả hai tab:

| Chỗ | Hôm nay | Sau |
|---|---|---|
| `aria-label` của icon ở header Tài sản | Danh mục cổ phiếu | Danh mục đầu tư |
| Link trong `InvestmentPerformanceSection` | Danh mục cổ phiếu | Danh mục đầu tư |
| Chú thích khối `hasStockAccount` | nói về `useInvestData` | nói về cả hai điều kiện tab |

`aria-label` đứng trong bảng này vì nó là thứ người dùng trình đọc màn hình nghe thấy — sai
ở đó không ai nhìn ra bằng mắt.

## Test

| File | Nội dung |
|---|---|
| `fundPortfolio.test.ts` (mới) | Hai tài khoản cùng giữ một quỹ ở hai giá vốn → tổng bằng tổng tính riêng · làm tròn từng cặp rồi cộng = tổng các dòng · thiếu `基準価額` một phần (tạm tính theo giá vốn) và thiếu toàn bộ (`marketValue = null`) · `oversold` khi quỹ đổi tên · không giữ quỹ nào → `marketValue = 0`, không phải null · `weight` cộng lại bằng 1 |
| `holdings.test.ts` | Thêm ca cho `reliableTotal`: tiền âm → null, thiếu giá mọi mã → null, thiếu một phần → có số |
| `portfolio.test.ts` | Thêm ca: `buildPortfolio` với **một** tài khoản cho ra đúng bộ số mà trang tài khoản hiện — chốt bất biến của quyết định 2 |
| `useAccountPortfolio` | Phần chọn engine tách thành hàm thuần để test: VND → cổ phiếu, JPY → quỹ, loại tiền khác / không có lệnh → `null` |
| `aggregate.test.ts` | Xanh với **đúng những con số cũ** — quyết định 7 là đổi tên, không đổi hành vi. Tám chỗ dùng `unrealizedPnl` phải đổi theo, và đó là toàn bộ thay đổi được phép ở file này |
| `demoRepo.test.ts` | Tài khoản NISA của demo có snapshot `auto` bằng đúng tổng của khu danh mục quỹ · sáu chốt bỏ qua của bản quỹ, **gồm ca thiếu giá một phần** (ca dễ chép nhầm từ bản cổ phiếu) · tài khoản JPY có cả `stock_trades` → bỏ qua (`tron-hai-loai-so-lenh`) |

Guard toàn repo phải xanh: `routeLinks` (đã kiểm — `segmentsOf` cắt query/hash nên hai link
mới có `?tab=`/`?account=` khớp route bình thường), `backLink` (tab mới không được tự viết
nút quay lại), `contrast`, `overlayLayers`.

`tests/designSystem.test.ts` là chỗ phải chủ động chạm vào, không phải chỗ "chỉ cần xanh".
Nó đếm trên **toàn bộ src** với các trần cứng, và hai file sắp xoá đang nằm trong số đếm:
`PROSE_MAX = 53` được nâng lên đúng vì `FundHoldingsSection` (xem lời ghi ngày 2026-08-13
ngay trên hằng số), và `FundHoldingsSection.tsx:248` tự ghi rằng ngưỡng `tabular-nums` "đã
sát trần". Xoá hai file làm số đếm **tụt xuống** — phép thử vẫn xanh vì nó dùng
`toBeLessThanOrEqual`, nhưng chính thông điệp lỗi của nó đặt ra quy ước: *"Đã xuống N — hạ
trần xuống N"*. Bước cuối của plan phải đo lại và hạ các trần đó, kèm lời ghi. Bỏ qua là để
lại một trần rỗng cho lần sau lách qua mà không ai biết.

## Rủi ro

**Mất đường ghi lệnh nhanh khi đang ở trang tài khoản.** Trước đây có nút "+ Ghi lệnh"
ngay trong khu Danh mục. Giờ phải qua `/invest` (một cú bấm, đã lọc sẵn tài khoản). Nếu
dùng thật thấy vướng, đường lùi rẻ: thêm nút ghi lệnh vào chính dòng "Danh mục · N mã →".

**Dòng tóm tắt hai số có thể không đủ.** Đây là rủi ro thật của phương án — bỏ hẳn một khu
là đánh cược rằng hai con số cộng một link đủ cho việc đang cần. Đường lùi cũng rẻ: thêm
lại danh sách mã dạng rút gọn vào đúng chỗ đó, dùng `useAccountPortfolio` đã có, không phải
dựng lại component.

**`/invest` phình ra.** 377 dòng cộng tab quỹ. Vì vậy tách `InvestStocksTab` /
`InvestFundsTab` **ngay từ bước đầu**, không nhồi hai tab vào một file rồi hẹn tách sau.

## Chỗ tài liệu phải cập nhật

- `docs/information-architecture.md` — mục "khu Danh mục / Danh mục quỹ trên trang chi tiết
  tài khoản" (dòng 105–114) không còn đúng; thay bằng mô tả hai tab của `/invest`.
- `docs/co-phieu-viet-nam.md` — chỗ nói khu Danh mục dựng từ `stock_trades`.
- `docs/quy-nhat.md` — cùng chỗ đó cho `fund_trades`, và mục nói về `account_valuations`
  hàng `auto` (giờ không còn hiện trên trang tài khoản).
