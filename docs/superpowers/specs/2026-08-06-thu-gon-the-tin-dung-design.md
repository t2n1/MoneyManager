# Thu gọn khối Thẻ tín dụng ở trang Tài sản

Ngày: 2026-08-06

## Vấn đề

Tab "Hiện tại" của trang Tài sản (`src/features/assets/AssetsNowView.tsx`) có khối
Thẻ tín dụng dài: mỗi thẻ chiếm 3–4 dòng (kỳ này + ngày đến hạn, phần chưa chốt,
nguồn trả + hạn mức còn lại), cộng thêm ô "Trả N thẻ từ [ngân hàng]" phía trên.
Với 3 thẻ, khối này đẩy phần Cơ cấu tài sản và danh sách nhóm xuống rất sâu.

Bình thường người dùng chỉ cần nhìn con số tổng. Chi tiết từng thẻ chỉ cần khi
sắp đến ngày trả.

## Giải pháp

Biến khối Thẻ tín dụng thành khối đóng/mở được. Mặc định thu gọn, bấm thì xổ ra
đúng nội dung như hiện nay.

### Trạng thái thu gọn

Cả phần đầu khối là một `<button>` (có `aria-expanded`), gồm:

- Dòng 1: icon thẻ · "THẺ TÍN DỤNG" · số lượng thẻ · badge đỏ (nếu thiếu tiền) ·
  mũi tên `ChevronDown`.
- Dòng 2: `Kỳ này ≈ ¥82.000 · đến hạn 27/8 (còn 21 ngày)`.

Quy tắc dòng 2:

- **Kỳ này** = tổng số tiền sẽ bị rút của tất cả thẻ đang hiện, quy về base
  currency. Mỗi thẻ lấy `billed` từ `useCardStatements`; thẻ chưa đặt ngày
  chốt/ngày trả (`billed == null`) thì lấy toàn bộ dư nợ `totalOwed`.
- Tiền tố `≈` khi có thẻ khác base currency **hoặc** có thẻ thiếu tỷ giá.
- **Ngày đến hạn** = `dueISO` sớm nhất trong các thẻ đang nợ. Không thẻ nào có
  `dueISO` thì bỏ phần này.
- Không thẻ nào đang nợ → dòng 2 chỉ ghi "Chưa phát sinh nợ".

Quy tắc badge đỏ (dùng kết quả `cardFunding` đã có):

- Đếm các thẻ có `owed > 0` và `funding.byCard.get(id)?.enough === false`.
- 0 thẻ → không hiện badge.
- 1 thẻ → `thiếu {formatMoney(shortfall, currency của thẻ đó)}`.
- ≥2 thẻ → `{n} thẻ thiếu tiền` (không cộng số vì có thể khác loại tiền).

### Trạng thái mở

Giữ nguyên 100% nội dung hiện tại: ô "Trả N thẻ từ [ngân hàng]" (khi có ≥2 thẻ
chung nguồn và đang thực nợ), rồi danh sách từng thẻ. Mũi tên xoay 180°.

### Mặc định

Luôn thu gọn mỗi lần mở trang. Không lưu trạng thái vào localStorage.

## Cấu trúc code

Tách khối thẻ khỏi `AssetsNowView.tsx` (đang 709 dòng) thành hai file mới:

**`src/features/assets/cardsSummary.ts`** — hàm thuần, có test:

```ts
export interface CardsSummary {
  /** tổng tiền bị rút kỳ này, quy base; null = không thẻ nào đang nợ */
  billedBase: number | null
  /** true = cần tiền tố ≈ (có ngoại tệ hoặc thiếu tỷ giá) */
  approx: boolean
  /** ngày đến hạn sớm nhất trong các thẻ đang nợ; null = không có */
  nextDueISO: string | null
  /** số thẻ đang nợ mà nguồn trả không đủ tiền */
  shortCount: number
  /** khi shortCount === 1: số tiền thiếu + loại tiền của thẻ đó */
  singleShortfall: { amount: number; currency: CurrencyCode } | null
}

export function cardsSummary(
  cards: CardLiability[],
  statements: Map<string, CardStatementSplit>,
  funding: CardFundingResult,
  base: CurrencyCode,
  rates: Rates,
): CardsSummary
```

Dùng `convertToBase` sẵn có trong `src/lib/rates.ts` (giống `aggregate.ts`).

**`src/features/assets/CardsSection.tsx`** — component:

```tsx
export function CardsSection(props: {
  cards: CardLiability[]          // đã lọc hidden
  balances: AccountBalanceRow[]   // để dựng cardSources
  base: CurrencyCode
  rates: Rates
  todayISO: string
}): JSX.Element | null
```

Chuyển vào file này: `useCardStatements`, `cardSources`, `billedByCard`,
`cardFunding`, `sharedSources`, và toàn bộ JSX của `<section>` thẻ. Trả `null`
khi không có thẻ nào.

`AssetsNowView.tsx` giữ lại `visibleCards` (vì `showNetWorth` cần biết có thẻ
hay không) và gọi `<CardsSection ... />` thay cho ~165 dòng JSX.

## Test

`src/features/assets/cardsSummary.test.ts` — chỉ test hàm thuần (dự án không có
test giao diện):

1. Một thẻ JPY, base JPY, có `billed` → `billedBase` bằng `billed`, `approx` false.
2. Hai thẻ khác loại tiền (JPY + VND), base JPY → cộng đúng sau quy đổi,
   `approx` true.
3. Thẻ thiếu tỷ giá → `approx` true, thẻ đó không được cộng.
4. Thẻ chưa đặt `statementDay`/`paymentDueDay` (`billed == null`) → lấy
   `totalOwed`.
5. Không thẻ nào nợ → `billedBase` null, `nextDueISO` null.
6. `nextDueISO` = ngày sớm nhất, bỏ qua thẻ không nợ.
7. `shortCount` đếm đúng; đúng 1 thẻ thiếu → `singleShortfall` có số + currency;
   2 thẻ thiếu → `singleShortfall` null.

## Không đụng tới

- Cách tính nợ thẻ, chia kỳ chốt/chưa chốt (`cardStatement.ts`).
- Badge đủ/thiếu của từng thẻ trong danh sách.
- Khối Tổng tài sản, Tài sản ròng, Cơ cấu tài sản.
- Kéo–thả sắp thứ tự tài khoản.
