# Xem và chỉnh số quẹt thẻ theo từng tháng

Ngày: 2026-08-06

## Vấn đề

Trang chi tiết thẻ tín dụng chỉ hiện **tổng nợ hôm nay**. Thanh chuyển tháng nằm
dưới cùng và chỉ đổi danh sách giao dịch — con số phía trên đứng yên.

Sao kê thật (PayPay Card, Rakuten Card) trình bày theo tháng: mở app, chọn tháng,
thấy tổng tiền tháng đó và ngày bị rút. Muốn đối chiếu, người dùng phải tự cộng
tay danh sách giao dịch. Lệch thì chỉ có nút "Điều chỉnh số nợ" chỉnh **tổng nợ
hôm nay**, không chỉnh được đúng tháng bị sai.

## Mục tiêu

Với tài khoản loại `card`: chọn tháng nào thì thấy **tổng tiền quẹt của tháng đó**
và **ngày bị rút**, kèm nút bù chênh lệch ghi vào chính tháng đó.

Không phải mục tiêu: đổi cách tính tổng nợ, đổi mục "Kỳ này / Chưa chốt", đụng
tới tài khoản không phải thẻ.

## Bố cục màn hình

Chỉ đổi với `account.type === 'card'`; tài khoản khác không đổi gì.

Thanh chuyển tháng **giữ nguyên vị trí trong DOM**. Với thẻ, hai khối phía trên nó
(danh mục cổ phiếu, lịch sử giá trị) vốn chỉ hiện cho tài khoản đầu tư / tài sản cố
định, nên nó đã nằm ngay dưới ô số nợ — không cần dời, và tài khoản đầu tư không bị
xáo bố cục.

```
┌─ Đang nợ thẻ ───────────────────────┐
│ ¥191.925   [Điều chỉnh số nợ]       │  giữ nguyên
│ Kỳ này · đến hạn T2, 27/7   ¥120.000│  giữ nguyên
│ Chưa chốt · kỳ sau mới đòi   ¥71.925│  giữ nguyên
└─────────────────────────────────────┘

   ‹     Tháng 6/2026     ›               vốn đã ở đây với thẻ

┌─────────────────────────────────────┐
│ Quẹt trong tháng 6       ¥123.456   │  MỚI
│ Bị rút ngày              T2, 27/7   │  MỚI
│                   [Chỉnh cho khớp]  │  MỚI
└─────────────────────────────────────┘

  12 giao dịch · danh sách               giữ nguyên
```

Chỉ một chỗ chọn tháng, dùng chung cho khối mới và danh sách bên dưới.

## Cách tính "quẹt trong tháng"

Khoảng ngày = **đúng khoảng của danh sách giao dịch** (`getMonthRange(monthKey,
month_start_day)`). Vì vậy con số luôn bằng tổng những dòng người dùng nhìn thấy
— kiểm tra bằng mắt được. Với `month_start_day = 1` và thẻ chốt cuối tháng, khoảng
này trùng khít kỳ sao kê.

Từ chính rổ giao dịch mà trang đã tải (`useSearchTransactions`, khớp `account_id`
HOẶC `to_account_id`):

```
charged = − Σ txBalanceDelta(t, cardId)
          với t KHÔNG phải "trả nợ thẻ"
```

Trong đó "trả nợ thẻ" = `t.type === 'transfer' && t.to_account_id === cardId`.

Hệ quả từng loại giao dịch:

| Giao dịch trên thẻ | Vào tổng quẹt |
| --- | --- |
| Chi (quẹt mua hàng) | cộng |
| Chi có cờ `is_refund` (hoàn tiền) | trừ |
| Thu trên thẻ | trừ |
| Chuyển tiền **vào** thẻ (trả nợ) | không tính |
| Chuyển tiền **ra khỏi** thẻ (rút tiền mặt) | cộng |

Giao dịch `exclude_from_stats` **vẫn tính** — đây là số của sao kê, không phải số
của báo cáo, và giao dịch bù do chính tính năng này tạo ra mang cờ đó.

Đang tải thì hiện `—`, không hiện ¥0.

## Ngày bị rút

`dueISO = nextCardDueDate(payment_due_day, range.end)` — `range.end` là ngày đầu
tháng kế (loại trừ), nên với kỳ chốt cuối tháng 6 và ngày trả 27 sẽ ra 27/7, đã
dời T7/CN sang T2 như mọi chỗ khác.

Ẩn dòng này khi:

- `payment_due_day == null` — chưa đặt ngày trả, không có gì để nói.
- `statement_day != null && statement_day < 28` — thẻ chốt giữa tháng thì kỳ sao
  kê **không** trùng tháng lịch, ngày rút suy ra từ tháng lịch sẽ sai. Thay bằng
  ghi chú: "Thẻ này chốt ngày N — xem mục Kỳ này ở trên để biết số sắp bị rút."
  Dòng "Quẹt trong tháng" vẫn giữ (nó vẫn đúng nghĩa "quẹt trong tháng lịch").

## Sheet "Chỉnh cho khớp"

Người dùng gõ **tổng thật theo sao kê** của tháng đang xem. App tạo một giao dịch
bù phần chênh:

- `diff = entered − charged`
- `diff > 0` (app đang thiếu) → **chi** trên thẻ, số tiền `diff`
- `diff < 0` (app đang dư) → **thu** trên thẻ, số tiền `|diff|`
- `diff === 0` → nút khóa

Ngày ghi: **luôn nằm trong tháng đang xem**. Hôm nay rơi giữa kỳ thì lấy hôm nay;
hôm nay nằm ngoài kỳ (tháng đã qua hoặc tháng chưa tới) thì lấy ngày cuối kỳ
(`range.end − 1 ngày`). Nằm trong kỳ nên máy tự-trả-thẻ
(`runCardAutopayCatchUp`, mốc theo ngày chốt) nhìn thấy và rút đúng số. Ô ngày
kẹp `min`/`max` trong kỳ nên sửa tay cũng không lọt sang tháng khác.

Dùng lại danh mục bù sẵn có (`ADJUST_CATEGORY_NAME`, `findAdjustCategory`), ghi
chú `Điều chỉnh sao kê tháng M/YYYY`, `exclude_from_stats: true` để không lọt vào
báo cáo/ngân sách.

Sau khi lưu, số "Quẹt trong tháng" tự khớp vì giao dịch bù nằm trong chính khoảng
ngày đang tính.

## Chia tệp

| Tệp | Việc |
| --- | --- |
| `cardMonthCharge.ts` (mới) | thuần, không React: `cardMonthCharge`, `monthDueDate`, `monthAdjustDate`, `monthAdjustPlan` |
| `cardMonthCharge.test.ts` (mới) | unit test cho từng hàm trên |
| `CardMonthAdjustSheet.tsx` (mới) | sheet nhập tổng thật, dựng theo khuôn `ReconcileSheet` |
| `AccountDetailPage.tsx` (sửa) | thêm khối mới dưới thanh chuyển tháng, mở sheet |
| `components/ui/ActionButton.tsx` (mới) | gom dáng nút-có-chữ (viền mảnh / nền xanh) — trần `active:scale-95` trong `designSystem.test.ts` chặn việc chép tay thêm |

Toàn bộ phần tính nằm trong tệp thuần để test không cần dựng React, giống
`cardStatement.ts` / `reconcile.ts` sẵn có.

## Sai sót có thể xảy ra

- **Không lưu được** (mất mạng, RLS): hiện toast lỗi, giữ sheet mở — theo đúng
  `ReconcileSheet`.
- **Thẻ chưa có ngày chốt/ngày trả**: khối mới vẫn hiện, chỉ thiếu dòng ngày rút.
- **Tháng chưa tới**: khoản bù ghi ngày cuối tháng đó, tức là ngày tương lai.
  Bản đầu kẹp về hôm nay, hoá ra bù tháng 9 lại rơi vào tháng 8 — sai tháng mà
  tháng 9 vẫn lệch. Giao dịch ngày tương lai vẫn vào tổng nợ thẻ ngay, nhưng
  `useCardStatements` xếp nó vào phần "chưa chốt · kỳ sau mới đòi".
