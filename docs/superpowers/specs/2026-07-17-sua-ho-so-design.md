# Thiết kế: Sửa hồ sơ trong Cài đặt

Ngày: 2026-07-17

## Mục tiêu

Cho phép người dùng sửa **Tên hiển thị** và **Ngày bắt đầu tháng** ngay trong màn
Cài đặt. Hiện hai giá trị này chỉ hiển thị ở chân trang, không sửa được — đây là
lỗ hổng rõ nhất của bản MVP.

## Phạm vi

**Trong phạm vi**
- Sửa `display_name` (tên hiển thị).
- Sửa `month_start_day` (ngày bắt đầu tháng tài chính), giới hạn 1–28.

**Ngoài phạm vi (cố ý)**
- **Không** cho đổi `base_currency` (loại tiền gốc). Ngân sách đang lưu số tiền
  theo tiền gốc và báo cáo quy đổi mọi thứ về tiền gốc; đổi tiền gốc sẽ làm sai
  các hạn mức cũ và lệch số lẻ thập phân. Việc này để làm riêng sau, có xử lý
  quy đổi/cảnh báo đầy đủ.

## Chi tiết kỹ thuật

### 1. Tầng dữ liệu (`src/data/repo.ts` + 2 bản cài đặt)

- Thêm kiểu:
  ```ts
  export type ProfilePatch = Partial<Pick<ProfileRow, 'display_name' | 'month_start_day'>>
  ```
  Cố ý **không** có `base_currency` để khóa việc đổi tiền gốc ở tầng dữ liệu.
- Thêm vào interface `Repo`:
  ```ts
  updateProfile(patch: ProfilePatch): Promise<ProfileRow>
  ```
- `supabaseRepo`: `update` bảng `profiles` cho user hiện tại, trả về hàng đã cập
  nhật (`.select().single()`). RLS đã giới hạn theo user.
- `demoRepo`: sửa `profile` trong localStorage (theo mẫu các hàm update sẵn có),
  trả về profile mới.

### 2. Hook (`src/hooks/queries.ts`)

- Thêm `useUpdateProfile()` — mutation gọi `repo.updateProfile`, `onSettled` làm
  mới `['profile']`.
- Khi đổi `month_start_day`, khoảng ngày của báo cáo/sổ được tính lại từ profile,
  kéo theo query key mới → tự refetch. Không cần invalidate thêm.

### 3. Giao diện — `src/features/settings/ProfileEditSheet.tsx` (mới)

- Bottom sheet theo đúng mẫu `BudgetEditSheet` (nền mờ `bg-black/40`, panel trượt
  từ dưới `rounded-t-2xl`, bấm nền để đóng, nút Đóng + Lưu).
- **Tên hiển thị**: ô `input` chữ, giá trị đầu = `display_name` hiện tại.
- **Ngày bắt đầu tháng**: chọn số 1–28 (giới hạn 28 để tránh tháng thiếu ngày
  29–31). Kèm ghi chú "ảnh hưởng cách tính tháng trong báo cáo".
- **Loại tiền gốc**: chỉ hiển thị, làm mờ, ghi chú "không đổi được".
- Bấm Lưu → gọi `useUpdateProfile`, đóng sheet.

### 4. `SettingsPage.tsx`

- Đổi mục "Tài khoản đăng nhập" thành mục **"Hồ sơ"** bấm được: hiển thị tên,
  ngày bắt đầu tháng, tiền gốc; bấm mở `ProfileEditSheet`.
- Nút Đăng xuất giữ nguyên.

### 5. Kiểm thử

- Tách hàm thuần `clampMonthStartDay(n: number): number` — kẹp về 1–28, làm tròn,
  xử lý giá trị không hợp lệ (NaN → 1). Đặt cạnh nơi dùng hoặc trong `lib/dates`.
- 1 file test nhỏ cho hàm này (biên: 0, 1, 28, 29, 31, NaN, số thập phân).
- Phần UI mỏng nên không viết test riêng.

## Rủi ro

- Thấp. Không đụng dữ liệu giao dịch/ngân sách. `month_start_day` chỉ đổi cách
  cắt khoảng tháng khi hiển thị, không sửa dữ liệu đã lưu.
