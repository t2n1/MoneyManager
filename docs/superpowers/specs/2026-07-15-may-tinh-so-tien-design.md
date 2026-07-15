# Thiết kế — Máy tính trong ô số tiền (mục L, nhóm "nhập nhanh hơn")

> **Ngày:** 2026-07-15 · **Trạng thái:** Đã chốt qua brainstorm, chờ viết plan.
>
> Thuộc nhóm backlog "trải nghiệm nhập liệu" (mục L). Làm riêng 1 tính năng = 1 commit.

## Mục tiêu

Cho phép gõ **phép tính** ngay trong ô số tiền ở màn Nhập, ví dụ `1200+800`, và app tự
tính ra tổng để lưu. Dùng khi gộp nhiều món trong một hóa đơn (đi chợ, siêu thị).

## Phạm vi

- **Chỉ trên điện thoại** — thêm nút phép tính vào bàn phím số của app (`NumPad`).
- Áp dụng cho **cả ô số tiền chính và ô "nhận được"** của chuyển khoản khác loại tiền
  (dùng chung cơ chế, không cần code riêng).
- **Máy vi tính giữ nguyên**: ô nhập desktop vẫn gõ số thường bằng bàn phím thật, không
  hỗ trợ phép tính. (Có thể mở rộng sau — không thuộc mục này.)
- **Không** đổi cấu trúc dữ liệu (`schema`), **không** đụng tầng đọc/ghi dữ liệu (`repo`).
  Tiền vẫn lưu ở đơn vị nhỏ nhất như hiện tại.

## Ràng buộc đã chốt

- **4 phép tính:** `+ − × ÷`.
- **Tính lần lượt từ trái sang phải** (giống máy tính bỏ túi), **không** ưu tiên nhân
  chia. Ví dụ `1200+800×2` → `(1200+800)×2 = 4000`.
- **Làm tròn về đơn vị tiền gần nhất** khi nhân/chia ra số lẻ (vd `1000÷3 → 333`). Làm
  tròn **một lần ở kết quả cuối**, dùng làm tròn số học thông thường (0.5 lên).
- Tiền lưu ở đơn vị nhỏ nhất (JPY=yên, VND=đồng, USD=cent). Dãy chữ số gõ vào chính là
  đơn vị nhỏ nhất — nên phép tính chạy thẳng trên **số nguyên**, không dùng số thực để lưu.

## Bàn phím số mới (`NumPad`)

Thêm cột phép tính bên phải và nút `00`; nút xóa lùi trải hết hàng cuối:

```
1    2    3    ÷
4    5    6    ×
7    8    9    −
00   0    000  +
     ⌫  (rộng cả hàng)
```

- Giữ thứ tự số `1 2 3` ở trên (như bàn phím hiện tại, kiểu điện thoại).
- Ba nút số 0: `0`, `00`, `000`.
- Mỗi nút có nhãn trợ năng (`aria-label`) rõ ràng: dấu cộng, dấu trừ, dấu nhân, dấu chia,
  xóa…

## Cách hiển thị

- **Chưa gõ dấu phép tính nào:** ô hiển thị **y như hiện tại** — số tiền có dấu phân
  cách qua `formatMoney` (vd `¥1.200`).
- **Đã có dấu phép tính:** ô hiển thị **cả biểu thức**, mỗi số định dạng như tiền, nối
  bằng dấu, vd `¥1.200 + ¥800`, kèm dòng nhỏ **kết quả tạm** `= ¥2.000` để người dùng
  thấy trước khi lưu.
- Biểu thức dài → cho chữ nhỏ lại / cuộn ngang, không phá layout.

## Quy tắc nhập (áp cho mỗi lần bấm phím)

- Chưa có số nào mà bấm phép tính → **bỏ qua** (không cho bắt đầu bằng dấu).
- Đang có dấu ở cuối mà bấm dấu khác → **thay dấu cuối** bằng dấu mới (không cho 2 dấu
  liền nhau).
- `⌫` xóa lùi **1 ký tự** (số hoặc dấu). Xóa hết → ô trống, quay lại hiển thị số như cũ.
- Giới hạn độ dài để tránh gõ lố: **mỗi số tối đa 12 chữ số** (giữ nguyên giới hạn hiện
  tại `MAX_AMOUNT_DIGITS`); tổng biểu thức tối đa **40 ký tự** (bấm quá thì bỏ qua).

## Cách tính & tình huống lỗi

- Tính trái→phải, gấp từng cặp một theo dấu.
- **Dấu ở cuối khi lưu** (vd `1200+`): bỏ dấu thừa, tính phần trước (`1200`).
- **Chia cho 0:** biểu thức coi như **chưa hợp lệ** → kết quả trống → nút Lưu mờ đi.
- Biểu thức trống hoặc chỉ có dấu → kết quả `0` (nút Lưu mờ như hiện tại khi số tiền = 0).

## Cách làm (kỹ thuật)

Tách phần tính toán ra **một chỗ riêng, thuần logic** để viết test được — đúng công ước
dự án (chỉ unit-test logic thuần, chưa có test giao diện).

**Tệp mới `src/features/transactions/calc.ts`:**

- `appendKey(expr: string, key: string): string`
  Nhận biểu thức hiện tại + phím vừa bấm (`'0'..'9'`, `'00'`, `'000'`, `'+'`, `'−'`,
  `'×'`, `'÷'`, `'⌫'`), trả về biểu thức mới sau khi áp dụng các *quy tắc nhập* ở trên.
  Bốn dấu phép tính dùng **đúng ký tự hiển thị trên nút** (`+ − × ÷`) xuyên suốt cả
  `NumPad`, `appendKey` và `evalExpression` để khỏi lệch.
- `evalExpression(expr: string): number | null`
  Tính biểu thức trên số nguyên (đơn vị nhỏ nhất), trái→phải, làm tròn kết quả cuối. Trả
  `null` nếu không hợp lệ (chia cho 0). Biểu thức trống → `0`. Bỏ dấu thừa ở cuối.

**Sửa `src/features/transactions/NumPad.tsx`:**

- Mở rộng danh sách phím: thêm `00`, `+ − × ÷`; đổi lưới sang 4 cột + hàng `⌫` trải rộng.
- Kiểu phím phép tính khác màu nhẹ để phân biệt với phím số (vẫn tông hiện tại).

**Sửa `src/features/transactions/TransactionForm.tsx`:**

- `digits` / `toDigits` giờ chứa **biểu thức** (có thể kèm dấu), thay vì chỉ dãy số.
- `onNumPadKey` gọi `appendKey` thay cho ghép chuỗi thủ công hiện tại.
- `amount = evalExpression(digits) ?? 0`; `toAmount = evalExpression(toDigits) ?? 0`.
- Ô số tiền (`amountBox`) chọn cách hiển thị: có dấu → hiện biểu thức + kết quả tạm;
  không dấu → `formatMoney` như cũ.
- `canSave` dựa trên kết quả đã tính (`> 0`, và `evalExpression` không trả `null`).
- **Đường desktop giữ nguyên**: ô `input` vẫn dùng `parseMoney` (chỉ ra số thuần, không
  sinh dấu). `evalExpression` xử lý được cả chuỗi số thuần nên không xung đột.

## Không làm (để khỏi phình)

- Không có nút `=` riêng (Lưu là chốt; đã hiện kết quả tạm).
- Không ưu tiên nhân chia (đã chốt trái→phải).
- Không hỗ trợ phép tính trên ô nhập desktop (lần này).
- Không lưu lịch sử phép tính / bộ nhớ máy tính.

## Kiểm thử & nghiệm thu

- **Test tự động** `src/features/transactions/calc.test.ts`:
  - `appendKey`: chặn bắt đầu bằng dấu; thay dấu khi bấm 2 dấu liền; nối số nhiều chữ số;
    `00`/`000`; xóa lùi; xóa về trống; chặn vượt số chữ số tối đa.
  - `evalExpression`: cộng, trừ, nhân, chia; làm tròn chia lẻ; trái→phải với hỗn hợp
    phép; bỏ dấu thừa ở cuối; chia cho 0 → `null`; biểu thức trống → `0`.
- **Gate sau khi làm:** `npm run build`, `npm run lint`, `npm test` phải sạch.
- **Nghiệm thu trên bản xem trước (điện thoại):** gõ `1200+800`, thấy biểu thức + kết
  quả tạm `= 2.000`, bấm Lưu → sổ ghi đúng `2.000`; thử một phép nhân, một phép chia lẻ,
  và trường hợp chia 0 (nút Lưu mờ).

## Commit

Một commit, lời nhắn không dấu, ví dụ: `GD-nhap: may tinh trong o so tien (L)`.
