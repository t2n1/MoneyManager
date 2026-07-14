# Design: Sổ Chi Tiêu — web app quản lý chi tiêu cá nhân

**Ngày:** 2026-07-14 · **Trạng thái:** Đã duyệt

## 1. Mục tiêu & phạm vi

Web app quản lý chi tiêu cá nhân tiếng Việt, lấy cảm hứng từ Money Manager, cho MỘT người dùng (chủ repo), chạy trên cả điện thoại và PC dưới dạng web responsive + PWA. Không app native, không App Store.

**Nguyên tắc UX số 1:** nhập một giao dịch phải mất dưới 5 giây. Mở app là vào thẳng màn hình nhập.

**Tiền tệ (cập nhật 2026-07-14):** đa tiền tệ — **JPY (chính), VND, USD**. Mỗi tài khoản một
loại tiền cố định; tiền lưu `bigint` ở **đơn vị nhỏ nhất** (JPY = yên, VND = đồng, USD = cent).
Tuyệt đối không dùng float cho tiền. Tổng quan/báo cáo quy đổi về `profiles.base_currency`
(mặc định JPY) bằng tỷ giá tự động từ open.er-api.com (miễn phí, không cần key, có VND —
ECB/frankfurter không có VND), cache localStorage 12h; thiếu tỷ giá thì hiển thị tách từng
loại tiền. Chuyển khoản xuyên tệ: 1 dòng giao dịch với `amount` (tiền nguồn) + `to_amount`
(tiền đích) — tỷ giá thực tế nằm ngay trong giao dịch.

**Chi phí vận hành:** 0 đồng (Supabase free tier + Vercel free tier).

## 2. Kiến trúc tổng thể

- **Frontend:** React + Vite + TypeScript + Tailwind CSS + TanStack Query + Recharts + vite-plugin-pwa. Không thêm thư viện lớn khác nếu không thật cần thiết.
- **Backend:** KHÔNG có backend riêng. Client gọi thẳng Supabase (Postgres + Auth + Realtime) qua `supabase-js`; bảo mật bằng Row Level Security.
- **Auth:** đăng nhập Google qua Supabase Auth.
- **Deploy:** Vercel free tier (SPA).
- **Responsive:** mobile dùng bottom tab bar; desktop ≥1024px dùng sidebar + phím tắt.

## 3. Quyết định thiết kế (đã chốt với người dùng)

| # | Quyết định | Lựa chọn |
|---|-----------|----------|
| 1 | Số dư tài khoản | CÓ theo dõi: `accounts.initial_balance` + cộng dồn từ giao dịch (view `account_balances`, không lưu số dư đã tính) |
| 2 | Chuyển khoản | KHÔNG tính vào tổng thu/chi tháng; chỉ thay đổi số dư 2 tài khoản |
| 3 | Ngày bắt đầu tháng tùy chỉnh (GĐ3) | Chuẩn bị sẵn từ GĐ1: cột `profiles.month_start_day` (mặc định 1), mọi query tháng đi qua helper duy nhất `getMonthRange()` |
| 4 | Mô hình chuyển khoản | 1 dòng `transactions` với `type='transfer'`, `account_id` (nguồn) + `to_account_id` (đích). Loại phương án double-entry 2 dòng (phức tạp khi sửa/xóa, không cần cho app cá nhân) |
| 5 | Seed dữ liệu mặc định | Postgres trigger `on_auth_user_created` (SECURITY DEFINER) tạo profile + 15 danh mục + 2 tài khoản khi user đăng ký. Loại phương án seed từ client (race condition khi mở 2 thiết bị) |
| 6 | Chống tham chiếu chéo user | Composite FK: `unique (id, user_id)` trên `categories`/`accounts`; `transactions` FK `(category_id, user_id)`. RLS lo phần đọc, FK lo phần ghi |
| 7 | Xóa danh mục/tài khoản | Soft-archive (`is_archived`), không xóa cứng — giao dịch cũ giữ nguyên tham chiếu |
| 8 | Offline | PWA chỉ cache app shell. KHÔNG làm offline queue ghi dữ liệu (ngoài phạm vi cả 3 giai đoạn) |
| 9 | Đa tiền tệ (2026-07-14) | Tiền theo TÀI KHOẢN (`accounts.currency`), không theo giao dịch. Loại phương án tiền theo giao dịch (thêm bước chọn khi nhập, số dư hỗn hợp) |
| 10 | Quy đổi báo cáo | Tự động về JPY qua open.er-api.com + cache 12h; fallback tách loại tiền khi thiếu tỷ giá |
| 11 | CK xuyên tệ | Nhập số tiền 2 đầu (`amount` + `to_amount`), không cần bảng tỷ giá riêng |
| 12 | Tài khoản mặc định | Tiền mặt (JPY), Ngân hàng (JPY), Đầu tư VN (VND), Dự trữ USD (USD) |

## 4. Database schema

Chi tiết đầy đủ (DDL, RLS, trigger seed) nằm trong [supabase/migrations/0001_init.sql](../../../supabase/migrations/0001_init.sql). Tóm tắt:

- **`profiles`** — 1-1 với `auth.users`: `display_name`, `base_currency` (mặc định JPY), `month_start_day` (1–28, mặc định 1).
- **`accounts`** — `name`, `type` (`cash`|`bank`), `currency` (ISO 4217), `initial_balance bigint` (minor units), `sort_order`, `is_archived`.
- **`categories`** — `name`, `type` (`expense`|`income`), `icon` (emoji), `sort_order`, `is_archived`.
- **`transactions`** — `type` (`expense`|`income`|`transfer`), `amount bigint > 0`, `category_id` (null khi transfer), `account_id`, `to_account_id` (chỉ khi transfer, khác `account_id`), `occurred_on date`, `note`. CHECK constraint ràng buộc hình dạng theo `type`.
- **View `account_balances`** (`security_invoker`) — số dư = `initial_balance` + tổng giao dịch (income +, expense −, transfer − nguồn / + đích).
- **RLS:** bật trên cả 4 bảng, policy `user_id = (select auth.uid())` cho cả USING và WITH CHECK.
- **Indexes:** `(user_id, occurred_on desc)`, `(user_id, category_id)` trên `transactions`.
- **Danh mục mặc định** — Chi: Ăn uống 🍜, Đi lại 🚌, Mua sắm 🛍️, Hóa đơn & tiện ích 🧾, Nhà cửa 🏠, Sức khỏe 💊, Giải trí 🎮, Giáo dục 📚, Quà tặng & từ thiện 🎁, Khác 📦. Thu: Lương 💰, Thưởng 🎉, Được tặng 🧧, Đầu tư 📈, Khác 💵. Tài khoản mặc định: Tiền mặt (cash), Ngân hàng (bank).

## 5. Cấu trúc frontend

```
src/
  lib/            supabase client, getMonthRange, formatVND/parseVND
  types/          database.types.ts (sinh từ schema) + domain types
  features/
    auth/         AuthProvider, /login, route guard
    transactions/ màn nhập nhanh (NumPad custom), sổ giao dịch, form sửa
    accounts/     quản lý tài khoản (GĐ2)
    categories/   quản lý danh mục (GĐ2)
    reports/      biểu đồ (GĐ2)
    settings/     cài đặt, đăng xuất, số dư tài khoản
  components/     UI dùng chung (Button, Sheet/Modal, TabBar, Sidebar…)
supabase/migrations/
```

- **Routes:** `/` = nhập nhanh (mặc định), `/transactions`, `/reports`, `/settings`, `/login`.
- **Phím tắt desktop:** `N` về màn nhập, `Enter` lưu, `←/→` chuyển tháng, `1–4` chuyển tab.
- **Data layer:** toàn bộ qua TanStack Query hooks; query key chứa khoảng ngày tháng. Không state manager khác.
- **Màn nhập (< 5s):** numpad hiện sẵn khi mở app (mobile: custom numpad có nút `000`, không dùng bàn phím hệ thống) → lưới icon danh mục → Lưu. Tài khoản mặc định = tài khoản dùng lần trước (localStorage). Optimistic update.

## 6. Lộ trình

- **GĐ1 (MVP):** auth Google + seed, nhập thu/chi/chuyển khoản, sổ giao dịch theo tháng (sửa/xóa), tổng quan tháng, PWA, deploy.
- **GĐ2:** báo cáo (pie theo danh mục, bar 6 tháng), lọc/tìm kiếm, quản lý danh mục/tài khoản, realtime sync (subscribe `transactions` → invalidate query cache).
- **GĐ3:** ngân sách tháng theo danh mục + cảnh báo, giao dịch định kỳ (catch-up khi mở app, không cần cron), export CSV (BOM UTF-8), dark mode, UI cho `month_start_day`.

Task chi tiết + tiêu chí hoàn thành: xem [implementation plan](../plans/2026-07-14-so-chi-tieu-plan.md).

## 7. Kiểm thử & xác minh

- Unit test (Vitest) cho helpers thuần: `formatVND`/`parseVND` (giá trị lớn 999.999.999.999), `getMonthRange` với `month_start_day` = 1/25/28 (tháng 2).
- RLS: xác minh bằng 2 tài khoản Google thật — user B không đọc/ghi được dữ liệu user A.
- UX: đếm số chạm từ mở app đến lưu xong ≤ 5 trên mobile emulation.
- Mỗi task: `npm run build` + `tsc --noEmit` + test pass, chạy app thật trên viewport 375px và 1280px.
