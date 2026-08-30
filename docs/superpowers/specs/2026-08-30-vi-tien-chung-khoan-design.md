# Bản thiết kế — "Ví tiền" của tài khoản chứng khoán VN

Ngày: 2026-08-30 · Trạng thái: chờ duyệt

## Vấn đề

Người dùng mua cổ phiếu VN bằng tiền trong tài khoản **Ngân hàng VN**, nhưng chỉ ghi
**sổ lệnh** ở tab Cổ phiếu VN — không ghi dòng tiền nào rời khỏi ngân hàng. Hai hệ quả,
cả hai đều âm thầm:

1. `brokerCash` = số dư sổ của tài khoản chứng khoán − tiền đã bỏ ra mua
   ([holdings.ts:163](../../../src/features/assets/holdings.ts)). Tài khoản **iDragon**
   chưa từng nhận một lần nạp nào nên số dư sổ ≈ 0 → **tiền chưa mua ra âm**.
2. Số âm làm `portfolioValue` trả `null`, và `stock-refresh` bỏ qua tài khoản với lý do
   `tien-chua-dau-tu-am` ([index.ts:149](../../../supabase/functions/stock-refresh/index.ts)).
   Không có hàng `account_valuations` mới → tab Tài sản rơi về số dư sổ ≈ 0, tức
   **cổ phiếu VN gần như không đóng góp gì vào Tổng tài sản**.

Đồng thời **Ngân hàng VN cao hơn tiền thật đúng bằng tổng tiền đã mua cổ phiếu**.

Hai cái sai gần như triệt tiêu nhau (Tổng tài sản = tiền thật + giá **vốn** cổ phiếu),
nên nó chưa bao giờ "kêu" — lệch đúng bằng phần lời/lỗ chưa bán.

## Hướng đã chọn

**Sửa ở sổ, không sửa ở phép tính.** Khai một lần rằng ví tiền của iDragon là Ngân hàng
VN; từ đó mỗi lệnh cổ phiếu tự kéo theo một **giao dịch chuyển tiền thật** giữa hai tài
khoản đó. Sổ đúng thì mọi màn hình tự đúng.

Hai hướng đã cân và loại:

- **Nối để tính, không ghi gì vào sổ.** Số dư Ngân hàng VN sẽ thành số app tính chứ
  không phải tổng các dòng — phải đè nó ở đối soát, tab Sức khoẻ, luật thông báo số dư
  thấp, ngân sách. Sót một chỗ là hai màn nói hai số, và không có gì báo động.
- **Chỉ sửa hiển thị ở tab Cổ phiếu VN.** Rẻ nhất, nhưng ngân hàng vẫn cao hơn thực tế
  và cổ phiếu vẫn không vào Tổng tài sản. Chữa cái nhìn thấy, không chữa cái sai.

## Đã chốt với người dùng

1. **Ngân hàng VN LÀ ví của chứng khoán** — không phải "cộng thêm một khoản".
2. Hiện tại **không** ghi tiền ra khỏi ngân hàng khi mua; chỉ ghi sổ lệnh.
3. **Toàn bộ** số dư Ngân hàng VN được coi là tiền chưa mua.
4. Ghi bù lệnh cũ: **mỗi lệnh một dòng, đúng ngày của lệnh** (không gộp một dòng hôm nay).

## Cố ý không làm

- **Không đụng `aggregate.ts` hay cách tính Tổng tài sản.** Đây là điểm mạnh của hướng
  này: sổ đúng thì tổng tự đúng.
- **Không đụng edge function `stock-refresh`, không chạy `npm run bundle:rules`.**
  `brokerCash` giữ nguyên định nghĩa; nó hết âm vì số dư sổ đã đúng, không vì công thức đổi.
- **Không hỗ trợ ví khác loại tiền.** Chỉ VND ↔ VND. Ví JPY cho tài khoản VND là một
  chuyển khoản xuyên tệ, cần tỷ giá tại từng lệnh — việc khác, làm sau nếu cần.
- **Không áp dụng cho quỹ Nhật.** Rakuten tự quét tiền dư về 楽天銀行 nên khái niệm "tiền
  chưa mua" không tồn tại ở đó ([InvestFundsTab.tsx:8](../../../src/features/assets/InvestFundsTab.tsx)).
- **Không tự đoán ví.** Không khai thì không ghi gì — hành vi cũ giữ nguyên y hệt.
- **Không tự ghi bù.** Người dùng bấm nút, vì nó đẻ ra N dòng ở các tháng cũ.

## Dữ liệu

`supabase/migrations/0054_stock_cash_wallet.sql`:

```sql
alter table public.accounts
  add column cash_account_id uuid references public.accounts(id) on delete set null;

alter table public.transactions
  add column stock_trade_id uuid references public.stock_trades(id) on delete cascade;

create unique index transactions_stock_trade_id_key
  on public.transactions (stock_trade_id) where stock_trade_id is not null;
```

Rồi **dựng lại view `account_balances`** để lộ `cash_account_id`. View liệt kê cột rõ
ràng chứ không `a.*` — đúng cái bẫy mà 0053 sinh ra để sửa. `payment_account_id` đã có
mặt trong view, cột nối tài khoản mới phải theo đúng lệ đó. Thân view viết đủ, tự đứng
được, không phụ thuộc 0053 đã chạy hay chưa.

`on delete cascade` ở `stock_trade_id` là chỗ chốt của cả thiết kế: **xoá lệnh thì dòng
chuyển tiền tự biến mất ở tầng database**, không phải nhớ dọn ở tầng ứng dụng. Unique
index đảm bảo một lệnh không bao giờ có hai dòng tiền — nút ghi bù bấm hai lần vẫn an toàn.

[src/types/database.types.ts](../../../src/types/database.types.ts) viết tay, không codegen
— sửa **cùng commit**: `AccountRow.cash_account_id`, `TransactionRow.stock_trade_id`, và
tên cột mới trong `Insert`/`Update` của cả hai bảng, cùng `AccountBalanceRow`.

## Luật ghi sổ — một hàm thuần

`src/features/assets/stockTradePosting.ts`, cùng vai với
[debtPaymentPosting.ts](../../../src/features/debts/debtPaymentPosting.ts): **một chỗ
duy nhất** quyết định, nằm dưới cả hai repo.

```
stockTradeCashFlow(trade, investAccountId, cashAccountId) → CashFlow | null
```

| Lệnh | Số tiền | Chiều |
|------|---------|-------|
| `buy` | `quantity × price + fee` | Ngân hàng VN → iDragon |
| `sell` | `quantity × price − fee − tax` | iDragon → Ngân hàng VN |
| `adjust` | — | không ghi gì (gộp/tách cổ phiếu, không có tiền) |

Trả `null` khi: `cashAccountId` rỗng (chưa khai ví), lệnh `adjust`, hoặc số tiền tính ra
`≤ 0`. Ca cuối là lệnh bán mà phí + thuế nuốt hết tiền về — ghi một dòng 0 đồng không nói
thêm được gì, còn ghi số âm là đổi chiều tiền một cách lặng lẽ.

Giao dịch sinh ra: `type = 'transfer'`, `to_amount = null` (cùng VND), `category_id = null`,
`occurred_on = trade.traded_on`, `note` tự đặt dạng `"Mua 100 VNM"` / `"Bán 100 VNM"`,
`stock_trade_id = trade.id`.

Chuyển giữa hai tài khoản của chính mình nên nó **không vào Chi/Thu** — không cần cờ
`exclude_from_stats`, và báo cáo tháng không đổi một con số nào.

## Đồng bộ

Cả hai repo (`supabaseRepo`, `demoRepo`) — thêm method một bên mà quên bên kia là lỗi
biên dịch, đúng như lệ của repo.

| Việc | Xử lý |
|------|-------|
| Tạo lệnh | Tính `stockTradeCashFlow`; khác `null` thì ghi kèm một transaction. |
| Sửa lệnh | Tính lại. Có dòng cũ + kết quả mới ≠ null → sửa dòng đó. Có dòng cũ + kết quả `null` → xoá. Chưa có + kết quả ≠ null → ghi mới. |
| Xoá lệnh | Không làm gì — `on delete cascade` lo. |
| Đổi ví ở tài khoản | Không hồi tố. Dòng cũ giữ nguyên; nút ghi bù lo phần còn thiếu. |

`invalidateStockTrades` ([queries.ts:569](../../../src/hooks/queries.ts)) phải thêm
`transactions` và `accountBalances`. Chú thích ngay trên nó — *"Số dư (view) không đổi vì
sổ lệnh không phải dòng tiền"* — **trở thành sai** sau đợt này và phải viết lại.

## Ghi bù lệnh cũ

Hai method, cùng phạm vi: **mọi tài khoản đầu tư VND đã khai ví**, không nhận `accountId`.
Nhận id thì tab đang gộp nhiều tài khoản phải tự lặp, và quên một tài khoản là để lại một
lỗ hổng không ai thấy.

- `repo.countStockTradesWithoutTransfer() → number` — đếm để quyết định có hiện dải không.
- `repo.backfillStockTradeTransfers() → number` — ghi mỗi lệnh thiếu một transaction đúng
  ngày `traded_on`, trả số dòng đã ghi.

Idempotent nhờ hai lớp: lọc "chưa có dòng" ở truy vấn, và unique index chặn ở database.

Lệnh `adjust` và lệnh bán có tiền về ≤ 0 **không** bị đếm là thiếu — chúng vốn không sinh
dòng tiền nào. Cùng một hàm thuần quyết định cả hai việc, nên "đếm" và "ghi" không thể lệch nhau.

Giao diện: một dải trong `InvestStocksTab`, chỉ hiện khi có ví đã khai **và** đếm được
lệnh thiếu > 0. Dải hiện **kể cả khi "tiền chưa mua" đang dương** — số dư ví lớn có thể
che một `cash` âm, và lúc đó con số trông lành lặn trong khi sổ vẫn thủng:

> **N lệnh chưa có dòng chuyển tiền.** Số dư Ngân hàng VN đang cao hơn thực tế. → *Ghi bù*

Đây cũng là câu thay cho con số âm đỏ khó hiểu hôm nay: nó nói **vì sao** và **bấm gì**.

## Hiển thị

`Portfolio` thêm `walletCash: number | null` (số dư ví liên kết; `null` = chưa khai ví).

**`marketValue` giữ nguyên nghĩa cũ** = cổ phiếu + `cash` ở công ty chứng khoán, **không**
gồm ví. Đây là ranh giới chống đếm hai lần: `accountPortfolioSummary` và
`account_valuations` đều dùng con số này, mà Ngân hàng VN đã tự đứng thành một dòng ở tab
Tài sản rồi.

Tab Cổ phiếu VN:

- **Tiền chưa mua** = `cash + (walletCash ?? 0)`, kèm dòng phụ *"gồm 10.000.000 ₫ ở Ngân hàng VN"*.
- **Giá trị danh mục** = `marketValue + (walletCash ?? 0)` — câu hỏi của tab này là "tiền
  cổ phiếu VN của tôi đang là bao nhiêu", và toàn bộ ví nằm trong đó (chốt số 3).
  Số này **cố ý** không bằng dòng iDragon ở tab Tài sản; file đã có sẵn chú thích nói rõ
  hai màn trả lời hai câu khác nhau.
- `marketValue === null` (tiền ở công ty chứng khoán còn âm, hoặc thiếu giá mọi mã) thì
  **không in giá trị danh mục**, y như hôm nay — cộng ví vào một con số đã biết là sai
  chỉ làm nó trông đáng tin hơn. Ví vẫn hiện ở dòng "Tiền chưa mua", và dải ghi bù nói
  vì sao.

Trang chi tiết tài khoản iDragon: giữ nguyên số của riêng tài khoản, thêm **một dòng chữ**
chỉ ví liên kết. Không cộng ví vào đó — trang đó nói về một tài khoản.

Form sửa tài khoản ([AccountsPage.tsx:264](../../../src/features/accounts/AccountsPage.tsx)):
thêm ô `<Select>` **Ví tiền**, chỉ hiện khi `type === 'investment' && currency === 'VND'`,
chỉ liệt kê tài khoản VND khác chưa lưu trữ. Đi cùng chỗ `payment_account_id` đang làm,
kèm cùng kiểu kiểm tra "tài khoản đã chọn còn tồn tại không".

## Kiểm thử

- `stockTradePosting.test.ts` — mua/bán/điều chỉnh, phí và thuế, ca tiền về ≤ 0, ca chưa
  khai ví. Hàm thuần, không React, đúng lệ "toán thuần nằm ngoài React".
- `demoRepo` — tạo/sửa/xoá lệnh giữ dòng tiền khớp; đổi `buy` → `adjust` thì dòng tiền biến mất.
- Ghi bù chạy hai lần không đẻ dòng thứ hai.
- Bổ sung cột mới vào guard `tests/accountBalancesView.test.ts` — cùng lý do 0053 tồn tại.
- Chạy tay: mở app xem dải ghi bù ở chế độ Sáng và ở cỡ chữ 1,25× — `npm test` không thấy
  hai thứ đó.

## Hệ quả người dùng sẽ thấy

Sau khi bấm ghi bù, **Tổng tài sản nhảy một phát**: giảm đúng tổng tiền đã mua cổ phiếu
(Ngân hàng VN về số thật), tăng đúng giá trị cổ phiếu hôm nay (cron ghi lại được). Ròng
lại là **cộng thêm phần lời/lỗ chưa bán**. Số mới đúng, nhưng cú nhảy cần được nói trước
— dải ghi bù phải viết rõ điều này trước khi người dùng bấm.
