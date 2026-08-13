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
| Ngày phiên | `dd/mm/yy` | `dd/mm` |

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
VND → buildPortfolio([account], priceBySymbol)
JPY → buildFundPortfolio([account], navByFund)
```

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

Nghe như vừa dựng lại đúng vấn đề đang chữa, nhưng không: cron ghi snapshot **ngay sau khi
hút giá trong cùng một lượt chạy**, từ cùng bảng `stock_prices`. Bình thường hai con số
trùng khít. Chúng chỉ lệch trong hai trường hợp:

| Trường hợp | Mức lệch |
|---|---|
| Sửa/thêm lệnh giữa hai lượt cron | Gần bằng 0 — một lệnh mua là tiền chuyển thành cổ phiếu, tổng gần như không đổi (chỉ lệch phần phí) |
| Cron bỏ qua tài khoản (`tien-chua-dau-tu-am`, `thieu-gia-moi-ma`) | Snapshot đứng ở ngày cũ; nhưng đó đúng là lúc con số **không đáng tin**, và cả hai bên đều đã có cảnh báo riêng |

Đổi `aggregate.ts` sang tính tại máy sẽ kéo theo cơ cấu tài sản, lịch sử tài sản ròng,
Lifetime và bộ test của cả ba. Không xứng với mức lệch trên. Tuổi dữ liệu đã được nói ra ở
`DataFreshness` ngay dưới tiêu đề trang Tài sản.

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

`InvestmentPerformanceSection` đang có link "Danh mục cổ phiếu" → đổi nhãn thành "Danh mục
đầu tư" vì giờ nó dẫn tới cả hai tab.

## Test

| File | Nội dung |
|---|---|
| `fundPortfolio.test.ts` (mới) | Hai tài khoản cùng giữ một quỹ ở hai giá vốn → tổng bằng tổng tính riêng · làm tròn từng cặp rồi cộng = tổng các dòng · thiếu `基準価額` một phần (tạm tính theo giá vốn) và thiếu toàn bộ (`marketValue = null`) · `oversold` khi quỹ đổi tên · không giữ quỹ nào → `marketValue = 0`, không phải null · `weight` cộng lại bằng 1 |
| `holdings.test.ts` | Thêm ca cho `reliableTotal`: tiền âm → null, thiếu giá mọi mã → null, thiếu một phần → có số |
| `portfolio.test.ts` | Thêm ca: `buildPortfolio` với **một** tài khoản cho ra đúng bộ số mà trang tài khoản hiện — chốt bất biến của quyết định 2 |
| `useAccountPortfolio` | Phần chọn engine tách thành hàm thuần để test: VND → cổ phiếu, JPY → quỹ, loại tiền khác / không có lệnh → `null` |

Guard toàn repo phải xanh, và hai trong số đó sẽ thật sự soi bản này: `routeLinks`
(hai link mới có tham số truy vấn), `backLink` (tab mới không được tự viết nút quay lại),
cộng `designSystem`, `contrast`, `overlayLayers`.

Không có test nào đang trỏ vào `HoldingsSection` / `FundHoldingsSection`, nên xoá hai file
không kéo theo test nào.

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
