# Kế hoạch: Gộp Trả hộ / Ghi nợ-cho vay / Gửi về VN vào form Nhập giao dịch

Ngày: 2026-07-23

## Vấn đề

Màn `/entry` hiện có 1 form chính (`TransactionForm`) + 3 modal riêng
(`SplitBillSheet`, `DebtFormSheet`, `RemittanceFormSheet`). Ba modal chép lại
các field gốc (số tiền, tài khoản, danh mục, ngày, ghi chú) bằng `<input>` thô,
mất NumPad + lưới danh mục + nhập nhanh bằng lời của form chính. Vừa lặp code,
vừa kém trải nghiệm.

## Quyết định (đã chốt với người dùng)

- **Nút vai trò ẩn sau 1 nút gọn** (gộp nút "Trả hộ" + menu "⋯" hiện tại thành
  1 popover chọn vai trò) — giữ màn nhập nhanh sạch cho 95% giao dịch Chi/Thu.
- **Gộp cả luồng sửa, xóa hẳn 3 sheet cũ.**

## Mô hình thiết kế

Một giao dịch gốc + tùy chọn "vai trò đặc biệt" (chọn 1):
`EntryRole = 'none' | 'split' | 'debt' | 'remit'`.

Khi bật vai trò, form: (1) tự set & khóa tab Chi/Thu/CK phù hợp, (2) đổi nhãn ô
số tiền, (3) hiện inline block field riêng của vai trò, (4) nút Lưu chạy đúng
orchestrator lưu.

## Kiến trúc

### Phần tách dùng chung (mới)

1. `src/features/transactions/entryRoles.ts` — type `EntryRole`, metadata mỗi
   vai trò (nhãn, icon, màu, tab cho phép, nhãn ô số tiền).
2. Field-block (controlled, thuần UI — tách từ 3 sheet cũ):
   - `SplitFields` — phần người khác nợ + ai nợ mình + preview "phần của mình".
   - `DebtFields` — chiều, tên người, hạn, lãi suất, kỳ, loại tiền, toggle
     "chuyển tiền thật".
   - `RemitFields` — TK đích VND, phí, số nhận VND, dịch vụ, preview tỷ giá.
3. `src/features/transactions/roleSave.ts` — orchestrator lưu, bê nguyên logic
   `handleSave` từ 3 sheet cũ:
   - `saveSplit` (tách chi của mình + createDebt owed_to_me kèm giải ngân, có bồi hoàn).
   - `saveDebtEntry` (createDebt + transaction tùy chọn).
   - `saveRemit` (createTx transfer/expense + ensure danh mục "Gửi tiền về VN").

### Tích hợp vào `TransactionForm`

- Thêm prop `enableRoles` (giống `enableNlInput`). Chỉ EntryPage bật; màn sửa GD
  thường không.
- State `role` + `roleValues`. Khi `role !== 'none'`:
  - Ẩn cụm tab Chi/Thu/CK, hiện segmented riêng của vai trò (điểm A); `type`
    suy ra từ vai trò + segmented đó; đổi nhãn `amountBox`.
  - Hiện banner vai trò ở đầu form với nút "✕ Bỏ" (điểm B).
  - Render block field tương ứng (dưới tài khoản/ngày); ẩn lưới danh mục khi vai
    trò tự khóa danh mục (điểm F).
  - Mở rộng `canSave` bằng validity của block.
  - `handleSubmit` gọi `onSubmitRole(role, base, roleValues)` thay cho onSubmit.
- Nút mở vai trò: 1 nút gọn ở header form → popover 4 lựa chọn (Bình thường +
  3 vai trò). Đang bật vai trò thì hiện banner có nút xóa vai trò.

### EntryPage

- Bỏ 3 state/sheet cũ; giữ toast.
- Thêm handler `onSubmitRole` gọi orchestrator trong `roleSave.ts`.
- Hỗ trợ `?role=split|debt|remit` (deep-link để trang khác mở đúng vai trò).

### Luồng quản lý ngoài màn nhập

- `DebtsPage` "＋ Thêm" (add): deep-link `/entry?role=debt` (bỏ `DebtFormSheet`).
- `RemittanceSection`/`RemittancePage` "add": deep-link `/entry?role=remit`.
- `DebtDetailPage` (SỬA khoản nợ — bản ghi nợ, KHÔNG phải giao dịch): thay
  `DebtFormSheet` bằng `DebtEditSheet` mỏng dùng lại `DebtFields`. (Sửa nợ về
  bản chất là sửa bản ghi, không map vào "1 giao dịch"; nên vẫn là sheet nhỏ
  nhưng không còn lặp field.)
- Xóa `SplitBillSheet`, `DebtFormSheet`, `RemittanceFormSheet`.

## Việc theo bước (mỗi bước 1 commit)

1. Tách `entryRoles.ts` + 3 field-block + `roleSave.ts` (không đổi UI — 3 sheet
   cũ tạm dùng lại block để chứng minh tương đương).
2. Thêm `enableRoles` + nút/popover + inline block vào `TransactionForm`; nối
   `onSubmitRole` ở EntryPage. Gỡ nút "Trả hộ"/"⋯" cũ khỏi EntryPage.
3. Deep-link `?role=` cho DebtsPage add + RemittanceSection add.
4. `DebtEditSheet` mỏng cho DebtDetailPage; xóa 3 sheet cũ.
5. Kiểm thử tay toàn bộ (mỗi vai trò: tạo, số dư, báo cáo, cờ is_debt_flow/
   is_remittance) + `npm run lint` + `npm test`.

## Rà soát UX (ui-ux-pro-max) — tinh chỉnh so với bản nháp

Bản nháp đúng hướng (progressive disclosure: ẩn 95% ca hiếm sau 1 nút). 8 điểm
chỉnh để đạt chuẩn touch/a11y/forms:

- **A. KHÔNG khóa cụm tab Chi/Thu/CK — mà thay thế.** Control bị khóa nhưng vẫn
  trông bấm được là anti-pattern (`disabled-states`, `state-clarity`). Khi bật
  vai trò: ẩn cụm 3 tab, thay bằng segmented riêng của vai trò —
  Cho vay/Nợ: "Mình nợ | Cho vay"; Gửi VN: "Hỗ trợ gia đình | Chuyển tài sản";
  Trả hộ: luôn là Chi (không cần toggle).
- **B. Banner vai trò ở đầu form** (trên ô số tiền): icon + tên vai trò +
  nút "✕ Bỏ". Cho ngữ cảnh vì sao ô số tiền đổi nhãn, và là lối thoát rõ ràng
  (`escape-routes`, `nav-state-active`).
- **C. Nút mở vai trò + popover chuẩn touch:** nút gộp ≥44×44px, nhãn rõ (icon +
  chữ). Trên mobile mỗi dòng lựa chọn ≥44px, cách nhau ≥8px (`touch-target-size`,
  `touch-spacing`, `overflow-menu`). Dùng `touch-action: manipulation`.
- **D. Animation mở block 150–300ms**, ưu tiên opacity/transform, tránh giật
  layout (CLS); tôn trọng `prefers-reduced-motion` (`state-transition`,
  `duration-timing`, `reduced-motion`).
- **E. Giữ label hiện rõ trong block** (không placeholder-only), lỗi đặt ngay
  dưới field, `inputMode="numeric"` cho ô tiền (`form-labels`,
  `inline-validation`, `input-type-keyboard`).
- **F. Quản lý chiều cao mobile:** vai trò Gửi VN/Cho vay khóa danh mục → KHÔNG
  hiện lưới danh mục lớn, nhường chỗ cho field vai trò; giữ nút Lưu luôn thấy,
  chỉ cuộn phần giữa (`content-priority`, `scroll-behavior`).
- **G. Toast + hoàn tác:** vai trò lưu xong cũng hiện toast (`success-feedback`).
  Lưu ý: Trả hộ/Cho vay tạo **nhiều bản ghi** (chi + nợ + giải ngân) nên hoàn tác
  1 chạm khó — v1 hiện toast KHÔNG kèm Hoàn tác (khác GD thường), tránh hoàn tác
  nửa vời. Ghi rõ giới hạn này.
- **H. Màu không phải chỉ dấu duy nhất:** mỗi vai trò có icon + chữ, không chỉ
  màu (`color-not-only`). Contrast nền tint/chữ ≥4.5:1 ở cả sáng/tối.

Các điểm đã đạt sẵn: `progressive-disclosure`, `field-grouping` (block có viền/
nền tint), `submit-feedback`, safe-area + CTA cố định (đã có ở màn nhập).

## Rủi ro / lưu ý

- Logic tiền/nợ/cờ báo cáo phải bê **nguyên xi** — chỉ di chuyển, không sửa hành vi.
- `saveSplit` có bồi hoàn khi lỗi — giữ.
- Remit khóa TK JPY nguồn / VND đích — giữ ràng buộc.
- Không đổi schema, không migration.
