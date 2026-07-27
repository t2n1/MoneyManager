# Ô nhập tiền dùng chung + hạn mức cho mục con

Ngày: 2026-07-28

## Mục tiêu

1. Nhắc khi **tổng mốc các mục con vượt trần nhóm cha** (trước đây app im lặng).
2. Cho **đặt hạn mức thẳng cho mục con khi cha chưa có trần** — giao diện cũ chỉ mở
   được ô đặt trần cha, nên chế độ "trần nhóm = tổng các con" gần như không dùng được.
3. Quy ước toàn app: **hễ có ô nhập tiền là hiện bàn phím số của app** (mobile).

## Nhắc lại luật ngân sách (không đổi)

Trần đặt ở cha là **bao ngoài** cho cả nhóm; hạn mức đặt ở con của nhóm đã có trần chỉ là
**mốc theo dõi bên trong** (`isMarker`), không cộng vào trần cha và không cộng vào tổng
ngân sách — cộng vào là tính trùng, vì tiền chi ở con đã nằm trong chi của cha. Xem
[2026-07-24-ngan-sach-dat-o-cha-design.md](2026-07-24-ngan-sach-dat-o-cha-design.md).

## Thay đổi

### `budgetDisplay.ts`

- Dòng `group` thêm `markerTotal` = tổng hạn mức các con đã đặt. Nhóm tổng-con
  (`capped: false`) luôn `markerTotal = 0` vì hạn mức con CHÍNH LÀ trần.
- `unbudgeted` đổi từ `CategoryRow[]` sang `{ cat, children }[]` để giao diện xổ được
  danh sách con của nhóm chưa đặt hạn mức.

### `BudgetView.tsx`

- Nhóm capped có `markerTotal > budgeted` → dòng nhắc màu hổ phách ngay dưới thanh tiến
  độ: "Mốc các mục con cộng lại X, vượt trần nhóm Y." Chỉ nhắc, không chặn lưu.
- Mục "Chưa đặt hạn mức": mỗi nhóm cha có nút xổ (▸) hiện chip từng mục con → bấm chip là
  đặt hạn mức thẳng cho con; khi đó nhóm thành dòng "tổng các con" (đúng luật cũ số 4).
- Sheet đặt hạn mức nhận thêm `hint` giải thích hạn mức đang đặt là trần nhóm / mốc con
  (không cộng vào tổng) / hạn mức con của nhóm chưa có trần (có cộng vào tổng).

### Ô nhập tiền dùng chung `src/components/MoneyField.tsx`

- Mobile: hộp chạm + `NumPad` ngay dưới (không bật bàn phím hệ thống), có `⌫` và
  "Thu bàn phím"; gõ được `+ − × ÷`, hiện dòng `= kết quả` khi có phép tính.
- Desktop (`lg`): input gõ trực tiếp như cũ, `Enter` = lưu.
- Chỉ **một pad mở trong toàn app** (store nhỏ ở module + `useSyncExternalStore`): form có
  nhiều ô tiền (vd tài khoản thẻ) thì bấm ô nào pad nhảy sang ô đó. `autoOpen` mặc định
  `true` cho ô tiền chính; ô phụ truyền `false`.
- `NumPad.tsx` → `src/components/`, `calc.ts` → `src/lib/` (kèm `hasOperator`, `formatExpr`
  gỡ khỏi `TransactionForm`) để cả app dùng được.

Đã thay ở: hạn mức ngân sách, số dư/số nợ ban đầu + hạn mức tín dụng + hạn mức nạp mỗi năm
+ giá trị còn lại (Tài khoản), mục tiêu tiết kiệm, cập nhật giá trị, điều chỉnh số dư,
sửa khoản nợ, ghi nhận trả nợ, quy tắc định kỳ. Trang Nhập giao dịch giữ pad riêng (đã có).

Các sheet có pad được thêm `max-h-[92vh] overflow-y-auto` để pad không đẩy nút Lưu ra khỏi
màn hình.

## Ngoài phạm vi

- Không chặn lưu khi tổng mốc con vượt trần cha (chỉ nhắc).
- Không tự phân bổ trần cha xuống con, không quá 2 cấp danh mục.
- Desktop vẫn không hiện pad (giống trang Nhập giao dịch).
