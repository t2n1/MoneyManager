# Thiết kế — Gói "nhập nhanh hơn" (I, M, K, O) + "insight" (V, Q)

> **Ngày:** 2026-07-17 · **Trạng thái:** Đã chốt qua brainstorm, chờ viết plan.
>
> Gom 6 mục backlog nhẹ, phần lớn UI thuần / đọc dữ liệu sẵn có, **không đổi schema,
> không đụng repo**. Mỗi mục = 1 commit riêng, lời nhắn không dấu.

## Mục tiêu

Hoàn thiện trải nghiệm nhập liệu (màn Nhập) và bổ sung vài chỉ số thấu hiểu tài chính
(màn Báo cáo), tất cả tính client-side từ dữ liệu đã có.

## Ràng buộc chung (nhắc lại)

- Không đổi `schema`, không đụng tầng `repo` (chỉ đọc/tính dữ liệu sẵn có).
- Tiền quy đổi base qua `convertToBase`; tôn trọng `month_start_day` qua `getMonthRange` /
  `monthKeyForDate`.
- UI tiếng Việt; mobile bottom tab, desktop sidebar.
- Sau mỗi mục: `npm run build` + `npm run lint` + `npm test` sạch. Mỗi mục 1 commit.

---

## Nhóm A — Màn Nhập

### I. Nhớ danh mục dùng gần nhất (theo loại)

**Hiện trạng:** tài khoản đã được nhớ qua `localStorage` khóa `sct-last-account`.

**Bổ sung:**

- Thêm 2 khóa: `sct-last-category-expense`, `sct-last-category-income` (nhớ riêng theo
  loại — Chi và Thu có tập danh mục khác nhau).
- Khởi tạo `categoryId` = danh mục lần trước của loại hiện tại, **chỉ khi** danh mục đó
  còn tồn tại và không bị lưu trữ (`is_archived`). Nếu không có / không hợp lệ → `null`
  như cũ.
- `switchType(next)`: thay vì luôn đặt `categoryId = null`, đặt = danh mục lần trước của
  loại `next` (nếu hợp lệ), ngược lại `null`.
- Khi lưu thành công (giao dịch chi/thu, không phải chuyển khoản): ghi
  `sct-last-category-<type>` = `categoryId`.
- Chuyển khoản không có danh mục → không đụng logic này.

**Kỹ thuật:** thuần trong `TransactionForm.tsx`. `categories` đã có sẵn qua
`useCategories`. Không đổi schema/repo. Vì lấy danh mục theo `type`, cần đọc localStorage
khi biết `type` — dùng một hàm nhỏ `lastCategoryFor(type, categories)` trả về id hợp lệ
hoặc `null` (đặt trong `TransactionForm.tsx`, không cần file riêng).

### M. Nhập liên tục (giữ danh mục)

**Hiện trạng:** `resetAfterSubmit` giữ tài khoản + ngày, nhưng **xóa** `categoryId`,
`toAccountId`, `toDigits`, `activeField`, `note`, `digits`.

**Đổi:** sau khi lưu, **giữ nguyên `categoryId`** để nhập tiếp cùng danh mục; chỉ xóa
**số tiền (`digits`) + ghi chú (`note`)**. Kết hợp mục I: danh mục giữ lại chính là danh
mục vừa dùng (đã đúng), nên không cần logic thêm.

- Chuyển khoản: vẫn reset `toAccountId` / `toDigits` / `activeField` như cũ (không có
  danh mục nên không ảnh hưởng).
- Không thêm nút bật/tắt — đây là hành vi mặc định mong muốn cho "nhập vội nhiều món".

**Kỹ thuật:** sửa nhánh `if (resetAfterSubmit)` trong `handleSubmit` — bỏ dòng
`setCategoryId(null)`. Thuần UI.

### K. Hoàn tác sau khi lưu

**Hiện trạng:** `EntryPage` hiện toast "Đã lưu ✓" trong 1,5 giây, không hoàn tác được.

**Đổi:**

- `create.mutateAsync(values)` trả về giao dịch có `id`. Lưu `id` này vào state.
- Toast đổi thành dạng có **nút "Hoàn tác"**, giữ **5 giây**: `Đã lưu ✓ · [Hoàn tác]`.
- Bấm Hoàn tác → `useDeleteTransaction().mutateAsync(id)`, đổi toast thành "Đã hoàn tác"
  (giữ ~1,5s rồi ẩn), xóa nút.
- Toast cần **bấm được** → bỏ `pointer-events-none` khỏi lớp bọc khi có nút.
- Dọn `setTimeout` khi unmount (đã có sẵn cơ chế `toastTimer`).

**Kỹ thuật:** thuần trong `EntryPage.tsx`. State toast đổi từ `string | null` sang một
object nhỏ `{ text: string; undoId?: string }` để biết có nút hay không. Dùng thêm
`useDeleteTransaction`.

### O. Lối tắt PWA (Nhập chi / Nhập thu)

**Đổi:**

- Thêm `shortcuts` vào `manifest` trong `vite.config.ts` (`vite-plugin-pwa`):
  - "Nhập chi" → `url: '/?type=expense'`
  - "Nhập thu" → `url: '/?type=income'`
- Màn Nhập đọc query `type`: `EntryPage` dùng `useSearchParams`, lấy `type`
  (`'expense' | 'income'`), truyền xuống `TransactionForm` qua prop mới `initialType`.
- `TransactionForm`: thêm prop tùy chọn `initialType?: TransactionType`; giá trị khởi tạo
  `type` = `initial?.type ?? initialType ?? 'expense'`.

**Kỹ thuật:** manifest + đọc query. Không cần icon riêng cho shortcut (bỏ qua để nhẹ;
trình duyệt dùng icon app). Không đụng data.

---

## Nhóm B — Màn Báo cáo (đặt ở **đầu tab Biểu đồ**)

Tạo **tệp thuần** `src/features/reports/insights.ts` (không phụ thuộc React, unit-test
được) — đúng công ước dự án (chỉ test logic thuần).

### V. Tỷ lệ tiết kiệm & chuỗi ngày không chi

- `savingsRate(income: number, expense: number): number | null`
  Trả `(income - expense) / income`. `income <= 0` → `null` (không tính được). Kết quả là
  tỷ lệ (vd `0.35`); có thể âm nếu chi > thu. UI hiển thị `%` làm tròn.
- `noSpendStreak(txs, today, monthStartDay): number`
  Đếm số ngày **liên tiếp gần nhất** (tính lùi từ `today`) **không có giao dịch loại
  `expense`**. Chỉ xét trong phạm vi "tháng tài chính" hiện tại (từ đầu tháng tới
  `today`) để con số có nghĩa và không cần tải thêm dữ liệu. Ngày có chi → streak dừng.
  - Đầu vào `txs` là giao dịch tháng hiện tại (đã có qua `useMonthTransactions`).
  - `today` truyền vào (chuỗi ISO) để test tất định — **không gọi `new Date()` trong hàm
    thuần**.

### Q. Thẻ gợi ý tự động (rule-based)

- `buildInsights(input): Insight[]` với `Insight = { id: string; text: string }`.
  Đầu vào gồm: chi tháng này, chi tháng trước, danh mục chi lớn nhất (tên + số tiền) và
  tổng chi (để tính %). Tất cả đã quy đổi base, truyền số vào (hàm không tự quy đổi).
- Luật (chỉ sinh câu khi đủ dữ liệu, bỏ qua nếu không):
  1. **So tháng trước:** nếu tháng trước > 0 → "Tháng này chi {X}, {±Y%} so với tháng
     trước." (dấu + khi tăng, − khi giảm; bỏ qua nếu tháng trước = 0).
  2. **Danh mục lớn nhất:** nếu có chi → "{Tên} chiếm {Z%} tổng chi tháng này."
- Số câu tối đa nhỏ (2). Định dạng tiền để hiển thị làm ở tầng UI (truyền hàm format hoặc
  trả số + để UI format) — **giữ hàm thuần**: `buildInsights` trả về `text` đã ghép sẵn,
  nhận thêm một hàm `fmt(minor: number) => string` để định dạng tiền (tiêm vào, vẫn tất
  định và test được bằng `fmt` giả).

### UI trên `ReportsPage` (chỉ ở `view === 'charts'`)

- Thêm **một section "Sức khỏe tài chính"** ở **đầu** danh sách biểu đồ:
  - Tỷ lệ tiết kiệm (ẩn nếu `null`), chuỗi ngày không chi.
  - Danh sách thẻ gợi ý (mỗi thẻ 1 dòng ngắn). Ẩn cả section nếu không có gì để hiện.
- Dữ liệu:
  - Chi tháng này / tháng trước: lấy từ `series.points` (đã có — `monthlySeries` 6 tháng);
    tháng này = point cuối, tháng trước = point kế cuối.
  - Thu tháng này: point cuối `income`.
  - Danh mục lớn nhất: `breakdown.slices[0]` (khi `kind === 'expense'`) + `breakdown.total`.
    Lưu ý `breakdown` phụ thuộc `kind`; để độc lập, tính riêng breakdown chi từ `monthTxs`
    (gọi `categoryBreakdown(monthTxs, 'expense', …)`) cho insight — rẻ, thuần.
  - Streak: `noSpendStreak(monthTxs, hôm nay, monthStartDay)`.
- Cờ thiếu tỷ giá: nếu breakdown/series thiếu tỷ giá thì các con số là xấp xỉ — không thêm
  cảnh báo mới (đã có banner "chưa quy đổi được" ở trên).

**Kỹ thuật:** `insights.ts` thuần + test; `ReportsPage.tsx` thêm phần hiển thị + gọi
`categoryBreakdown` cho chi. Không đổi schema/repo. Không thêm biểu đồ nặng (chỉ chữ + số)
nên không cần lazy-load.

---

## Không làm (để khỏi phình)

- I: **không** gợi ý ghi chú (autocomplete) — để mục sau nếu cần.
- M: không nút bật/tắt; không "nhân bản" giao dịch.
- K: không hàng đợi nhiều undo — chỉ hoàn tác **giao dịch vừa lưu gần nhất**.
- O: không icon riêng cho shortcut; không deep-link số tiền/ghi chú.
- V/Q: không thêm màn Tổng quan mới; không biểu đồ mới; không luật insight phức tạp
  (cuối tuần, bất thường…) — thuộc mục U/S sau này.

## Kiểm thử & nghiệm thu

- **Test tự động** `src/features/reports/insights.test.ts`:
  - `savingsRate`: thu > chi (dương), chi > thu (âm), `income = 0` → `null`.
  - `noSpendStreak`: không chi mấy ngày cuối → đếm đúng; hôm nay có chi → 0; toàn tháng
    không chi → tới đầu tháng; tôn trọng ranh giới `month_start_day`.
  - `buildInsights`: có tháng trước → câu so sánh đúng dấu/%, tháng trước = 0 → bỏ câu;
    có danh mục lớn nhất → câu tỷ trọng; không chi → mảng rỗng; dùng `fmt` giả.
- **Gate sau mỗi mục:** `npm run build`, `npm run lint`, `npm test` sạch.
- **Nghiệm thu trên bản xem trước (điện thoại, demo mode):**
  - I: lưu 1 giao dịch chi danh mục "Ăn uống" → sau reset, "Ăn uống" vẫn được chọn; đổi
    sang Thu → chọn danh mục thu lần trước (nếu có).
  - M: lưu xong, tài khoản + ngày + danh mục giữ nguyên, chỉ số tiền + ghi chú trống.
  - K: lưu xong bấm "Hoàn tác" trong 5s → giao dịch biến mất khỏi Sổ GD.
  - O: mở `/?type=income` → tab Thu được chọn sẵn.
  - V/Q: màn Báo cáo hiện tỷ lệ tiết kiệm, chuỗi ngày không chi và ≥1 thẻ gợi ý khi có
    dữ liệu 2 tháng.

## Commit (mỗi mục 1 commit, không dấu)

- `GD-nhap: nho danh muc gan nhat theo loai (I)`
- `GD-nhap: nhap lien tuc giu danh muc (M)`
- `GD-nhap: hoan tac sau khi luu (K)`
- `PWA: loi tat nhap chi/thu (O)`
- `Bao cao: insights ty le tiet kiem, chuoi ngay, the goi y (V, Q)`
