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

Với tài khoản loại `card`: **mở app thẻ chọn tháng 9, mở app này chọn tháng 9, thấy
y hệt nhau** — cùng tổng tiền, cùng danh sách, cùng ngày bị rút — kèm nút bù chênh
lệch ghi vào chính kỳ đó.

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
│ Kỳ này · đến hạn T5, 27/8  ¥170.465 │  giữ nguyên
│ Chưa chốt · từ 1/8 · đòi 28/9 ¥21.460│ giữ nguyên
└─────────────────────────────────────┘

   ‹  Sao kê tháng 9/2026  ›              vốn đã ở đây với thẻ

┌─────────────────────────────────────┐
│ Quẹt 1/8 – 31/8            ¥21.460  │  MỚI
│ Bị rút ngày              T2, 28/9   │  MỚI
│                   [Chỉnh cho khớp]  │  MỚI
└─────────────────────────────────────┘

  1 giao dịch · danh sách (ngày tháng 8)  giữ nguyên
```

Chỉ một chỗ chọn tháng, dùng chung cho khối mới và danh sách bên dưới.

## Đánh số kỳ theo THÁNG BỊ RÚT

App thẻ thật đánh số kỳ theo tháng tiền rời tài khoản, không phải tháng quẹt:
PayPay bấm 「9月」 ra các khoản quẹt **tháng 8**, vì chúng bị rút 27/9. Bản đầu app
đánh số theo tháng quẹt nên hai bên lệch nhau đúng một tháng — mỗi lần đối chiếu
phải tự trừ đi một tháng trong đầu, đúng cái phiền mà tính năng này phải xoá bỏ.

`cardBillingRange({ monthKey, statementDay, paymentDueDay })` dựng kỳ bị rút trong
tháng `monthKey`:

| Thẻ | Sao kê tháng 9/2026 | Bị rút |
| --- | --- | --- |
| chốt 31, trả 27 (PayPay, Rakuten) | quẹt 1/8 – 31/8 | 28/9 (27/9 rơi CN) |
| chốt 15, trả 10 | quẹt 16/7 – 15/8 | 10/9 |
| chốt 5, trả 27 | quẹt 6/8 – 5/9 | 27/9 |

Mốc chốt suy từ **ngày trả CHƯA dời cuối tuần**: dời rồi mới suy ngược thì thẻ trả
ngày 31 có lần bị đẩy sang tháng sau, kéo cả kỳ lệch một tháng.

Thẻ thiếu ngày chốt hoặc ngày trả → `null`, rơi về tháng lịch như tài khoản
thường, và khối mới thay dòng "Bị rút ngày" bằng lời nhắc điền hai ngày đó. Nhờ
vậy bỏ được cách chữa cháy cũ (`statementDay < 28` thì ẩn dòng ngày rút): thẻ chốt
giữa tháng giờ tính đúng kỳ chứ không phải giấu đi.

Tiêu đề thanh chuyển tháng đổi thành **"Sao kê tháng 9/2026"** chứ không để trần
"Tháng 9/2026": danh sách bên dưới là giao dịch ghi ngày tháng 8, tiêu đề phải tự
nó giải thích được. Mọi chỗ nhắc tới khoảng thời gian đều ghi ngày ra ("1/8 – 31/8")
thay vì mượn tên tháng, vì kỳ sao kê không trùng tháng lịch cùng tên.

## Cách tính "quẹt trong kỳ"

Khoảng ngày = **đúng khoảng của danh sách giao dịch** (`cardBillingRange`, hoặc
`getMonthRange` khi thẻ thiếu ngày). Vì vậy con số luôn bằng tổng những dòng người
dùng nhìn thấy — kiểm tra bằng mắt được.

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

`billing.dueISO` — chính ngày trả của tháng `monthKey`, đã dời T7/CN sang T2 như
mọi chỗ khác. Thẻ không dựng được kỳ (thiếu ngày chốt hoặc ngày trả) thì thay dòng
này bằng lời nhắc điền hai ngày đó trong phần sửa tài khoản.

## Sheet "Chỉnh cho khớp"

Người dùng gõ **tổng thật theo sao kê** của kỳ đang xem. App tạo một giao dịch
bù phần chênh:

- `diff = entered − charged`
- `diff > 0` (app đang thiếu) → **chi** trên thẻ, số tiền `diff`
- `diff < 0` (app đang dư) → **thu** trên thẻ, số tiền `|diff|`
- `diff === 0` → nút khóa

Ngày ghi: **luôn nằm trong kỳ đang xem**. Hôm nay rơi giữa kỳ thì lấy hôm nay;
hôm nay nằm ngoài kỳ (kỳ đã qua hoặc kỳ chưa tới) thì lấy ngày chốt kỳ
(`range.end − 1 ngày`). Nằm trong kỳ nên máy tự-trả-thẻ
(`runCardAutopayCatchUp`, mốc theo ngày chốt) nhìn thấy và rút đúng số. Ô ngày
kẹp `min`/`max` trong kỳ nên sửa tay cũng không lọt sang kỳ khác.

Dùng lại danh mục bù sẵn có (`ADJUST_CATEGORY_NAME`, `findAdjustCategory`), ghi
chú `Điều chỉnh sao kê tháng M/YYYY` (M là tháng BỊ RÚT, khớp tên trên app thẻ),
`exclude_from_stats: true` để không lọt vào báo cáo/ngân sách.

Sau khi lưu, số "Quẹt …" tự khớp vì giao dịch bù nằm trong chính khoảng ngày đang
tính.

## Chia tệp

| Tệp | Việc |
| --- | --- |
| `cardMonthCharge.ts` (mới) | thuần, không React: `cardBillingRange`, `cardMonthCharge`, `monthAdjustDate`, `monthAdjustPlan` |
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
