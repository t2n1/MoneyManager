# Bóc tách số bị rút của thẻ tín dụng

Ngày: 2026-08-14

## Vấn đề

Panel sao kê in tổng **quẹt** của kỳ, rồi ngay dưới là dòng "Bị rút ngày …". Hai
thứ đó chỉ bằng nhau khi kỳ trước đã trả sạch. Trên một sổ thật (thẻ chốt 31 / trả
27, sao kê 2026/08) panel đọc ra:

```
Quẹt 7/1 – 7/31                        ¥16.810
Khoản bù nợ (không tính vào quẹt)  +¥1.082.891
Bị rút ngày                          T5, 8/27
```

Số thật sự bị rút ngày 27/8 là **¥170.465** — gấp hơn 10 lần con số duy nhất trên
panel. Phần chênh là nợ các kỳ trước chưa trả hết, dồn sang vì giao dịch được nhập
lùi vào kỳ mà `runCardAutopayCatchUp` đã đòi xong.

Bản sửa trước (cùng ngày) đã cho panel in số bị rút và một cảnh báo "gồm cả nợ kỳ
trước chưa trả hết và các khoản bù". Nhưng nó chỉ **khẳng định**: không nói bao
nhiêu, và người đọc vẫn không cộng tay ra được ¥170.465 từ những gì đang thấy.

## Mục tiêu

Panel **tự kiểm được**: mọi dòng tiền trên màn hình cộng đúng ra số bị rút.

```
Quẹt 7/1 – 7/31                        ¥16.810
Khoản bù nợ (không tính vào quẹt)  +¥1.082.891
Nợ cũ chưa trả hết                 ¥1.236.546   ← dòng mới
─────────────────────────────────────────────
Bị rút T5, 8/27                       ¥170.465
```

`16.810 − 1.082.891 + 1.236.546 = 170.465`

Không phải mục tiêu: đổi `runCardAutopayCatchUp`, đổi `cardStatementSplit`, đổi
tầng dữ liệu, hay tự động thu hồi phần nợ dồn.

## Vì sao KHÔNG cho engine đòi bù

Cân nhắc rồi loại. Hai lý do:

Tiền không mất. Nợ mọc ngược vào kỳ đã đòi vẫn dồn sang `billed` của kỳ kế tiếp và
vẫn bị rút — chỉ muộn một kỳ. Vấn đề là *giải thích*, không phải *thu hồi*.

Thẻ thật cũng hành xử y hệt: sao kê của kỳ đó đã phát hành rồi thì khoản nhập lùi
không thể chui vào đó được, nó rơi sang kỳ sau. Cho engine soát lại kỳ cũ là làm
app lệch khỏi chính thứ nó đang mô phỏng.

## Thiết kế

### Hàm thuần

`carriedDebt` trong `src/features/assets/cardMonthCharge.ts`, cạnh
`statementDueAmount`:

```
carried = dueAmount − charged + reconcileNet
```

- `dueAmount` — `statementDueAmount(...)`, số thật sự bị rút; `null` khi đang xem
  kỳ khác với kỳ sắp bị rút.
- `charged` — `cardMonthCharge(...)`, tiền quẹt trong kỳ.
- `reconcileNet` — `cardMonthReconcileNet(...)`, dương = bớt nợ.

Trả `null` khi `dueAmount` là `null`. Ba đầu vào đều đã có sẵn ở `AccountDetailPage`,
không thêm truy vấn nào.

### Dấu âm là trạng thái thật

Trả dư ở kỳ trước làm `carried < 0`. **Không kẹp về 0** — kẹp là giấu mất một
trạng thái có thật và phá luôn bất biến cộng-đúng. Âm thì đổi nhãn thành "Dư từ kỳ
trước" và tô tone `in`, giống cách dòng khoản bù đã làm.

### Hiển thị

Dòng mới nằm giữa dòng khoản bù và dòng "Bị rút". Ẩn khi `carried === 0` (thẻ sạch,
trường hợp thường ngày) hoặc `null`.

Banner amber rút gọn còn đúng phần hành động — "Đối chiếu với sao kê thật rồi dùng
Điều chỉnh số nợ nếu sai." Phần giải thích đã thành dòng số nên bỏ khỏi banner.
Vẫn để NGOÀI `Guide`: đây là cảnh báo số không khớp, mất ở chế độ Gọn là mất tác
dụng.

## Test

Thêm vào `src/features/assets/cardStatementDueAmount.test.ts`, chạy trên đúng kịch
bản sổ thật đã dựng sẵn ở đó:

- `carriedDebt` ra ¥1.236.546.
- **Bất biến** `charged − reconcileNet + carried === dueAmount` chốt bằng
  assertion, không chỉ bằng số cứng — đây là thứ cả thiết kế nhắm tới.
- Thẻ sạch → `0`.
- Trả dư kỳ trước → âm.
- Đang xem kỳ khác → `null`.

## Phạm vi

Một hàm thuần + một dòng JSX + rút gọn một đoạn chữ. Không đụng engine, không đụng
truy vấn, không đụng loại tài khoản nào khác.
