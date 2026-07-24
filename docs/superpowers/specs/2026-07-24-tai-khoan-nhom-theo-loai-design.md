# Trang Tài khoản — chia theo loại

Ngày: 2026-07-24

## Mục tiêu

Trang Tài khoản (Cài đặt → Tài khoản) hiện là một danh sách phẳng. Người dùng
muốn tách danh sách tài khoản đang hoạt động thành các khối theo **loại**
(Tiền mặt, Ngân hàng, Thẻ tín dụng, …) cho dễ nhìn.

## Phạm vi

- Chỉ sửa giao diện: `src/features/accounts/AccountsPage.tsx`.
- Thêm một hàm thuần gom nhóm (kèm unit test).
- Không đổi cơ sở dữ liệu, tầng dữ liệu, hay thêm cài đặt mới.
- Phần "Đã lưu trữ" giữ nguyên (danh sách phẳng).

## Bố cục

Danh sách active được tách thành các khối theo loại, mỗi khối có tiêu đề:

```
Tiền mặt · ¥0
  ↕ Ví                          ¥0 · JPY      Lưu trữ
Ngân hàng · ¥545,860
  ↕ Yucho Bank            ¥198,031 · JPY      Lưu trữ
  ↕ Rakuten Bank          ¥347,829 · JPY      Lưu trữ
  ↕ Paypay Bank                 ¥0 · JPY      Lưu trữ
Thẻ tín dụng · -¥500
  ↕ Credit Rakuten            -¥500 · JPY      Lưu trữ
```

- **Thứ tự các loại**: cố định theo thứ tự ô "Loại" trong form —
  `cash → bank → card → ic → ewallet → investment`.
- Loại không có tài khoản active thì không hiện tiêu đề.
- Nhãn loại tái dùng `ACCOUNT_TYPE_LABELS` từ `features/assets/aggregate.ts`.

## Sắp xếp (nút ↑↓)

- Nút ↑↓ chỉ di chuyển tài khoản trong **cùng một loại**.
- Nút ↑ ở tài khoản đầu loại và nút ↓ ở tài khoản cuối loại bị vô hiệu (mờ).
- Thứ tự vẫn lưu vào `sort_order` toàn cục như cũ. Khi di chuyển, hoán đổi vị trí
  của hai tài khoản (trong cùng loại) trong danh sách id toàn cục rồi gọi
  `reorder.mutate([...idsActive, ...idsArchived])`. Nhờ vậy các loại vẫn tự tách
  đúng vì tài khoản cùng loại nằm liền nhau theo sort_order.

## Tổng theo loại

- Bên cạnh tên loại hiện tổng số dư của loại đó.
- Vì mỗi tài khoản có thể khác loại tiền, **cộng riêng theo từng loại tiền**:
  - Loại chỉ có một currency → hiện một số, vd `¥545,860`.
  - Loại lẫn nhiều currency → hiện từng cái, vd `¥X · ₫Y`.
- Không cần tỷ giá quy đổi, nên luôn đúng và không phụ thuộc dữ liệu tỷ giá.
- Tổng gồm mọi tài khoản active của loại (kể cả ẩn / ngoài tổng), khớp đúng
  những gì đang liệt kê trên trang.

## Hàm thuần (để test)

`groupAccountsByType(accounts, balances)` trả về mảng các khối theo thứ tự loại
cố định, mỗi khối gồm: `type`, `label`, danh sách account (giữ nguyên thứ tự
sort_order truyền vào), và `totalsByCurrency` (map currency → tổng minor units).
Chỉ trả về loại có ít nhất một tài khoản.

### Ca kiểm thử

- Gom đúng theo loại, giữ đúng thứ tự loại cố định.
- Bỏ qua loại rỗng.
- Tổng theo currency đúng khi một loại có nhiều tài khoản cùng currency.
- Tổng tách đúng khi một loại lẫn hai currency.
- Số dư thẻ âm cộng ra tổng âm.
