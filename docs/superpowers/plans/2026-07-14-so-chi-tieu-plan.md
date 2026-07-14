# Plan: Web app "Sổ Chi Tiêu" — quản lý chi tiêu cá nhân

## Bối cảnh

Xây dựng từ đầu (thư mục `D:\Antigravity\Money Manager` hiện trống, chưa có git) một web app quản lý chi tiêu cá nhân tiếng Việt, lấy cảm hứng từ Money Manager. Một người dùng duy nhất, dùng trên cả điện thoại và PC, cài như PWA. Dữ liệu trên Supabase (Postgres + Auth + Realtime), đăng nhập Google, không backend riêng — client gọi thẳng Supabase, bảo mật bằng RLS. Nguyên tắc UX số 1: **nhập một giao dịch < 5 giây, mở app vào thẳng màn hình nhập**. Tiền tệ chỉ VND, lưu `bigint`, không bao giờ dùng float.

Stack: React + Vite + TypeScript + Tailwind CSS + TanStack Query + Recharts + vite-plugin-pwa. Deploy Vercel free tier, chi phí vận hành 0đ.

## Quyết định thiết kế đã chốt (đã hỏi & được duyệt)

1. **Số dư tài khoản**: CÓ theo dõi — `accounts.initial_balance` + cộng dồn từ giao dịch.
2. **Chuyển khoản**: KHÔNG tính vào tổng thu/chi tháng, chỉ thay đổi số dư 2 tài khoản.
3. **Ngày bắt đầu tháng tùy chỉnh**: chuẩn bị sẵn từ GĐ1 — cột `profiles.month_start_day` (mặc định 1), mọi query theo tháng đi qua một helper duy nhất `getMonthRange()`. GĐ3 chỉ thêm UI.
4. **Phạm vi plan**: GĐ1 (MVP) chia task nhỏ có tiêu chí hoàn thành; GĐ2–3 phác thảo.

## Quyết định kỹ thuật (phương án chọn + lý do)

- **Mô hình chuyển khoản**: 1 dòng duy nhất trong `transactions` với `type='transfer'`, `account_id` (nguồn) + `to_account_id` (đích). *Loại phương án 2 dòng liên kết (double-entry)*: phức tạp hơn khi sửa/xóa (phải đồng bộ 2 dòng), không cần cho app cá nhân.
- **Seed danh mục & tài khoản mặc định lần đầu đăng nhập**: Postgres trigger `on_auth_user_created` trên `auth.users` (SECURITY DEFINER) tạo profile + danh mục + 2 tài khoản trong 1 transaction. *Loại phương án seed từ client*: có race condition khi mở 2 thiết bị cùng lúc, logic rò rỉ ra client.
- **Số dư hiện tại**: view Postgres `account_balances` (security_invoker) = `initial_balance` + tổng giao dịch. Không lưu số dư đã tính (tránh lệch dữ liệu).
- **Chống tham chiếu chéo user** (client giả mạo gửi `category_id` của user khác): composite FK — `unique (id, user_id)` trên `categories`/`accounts`, transactions FK `(category_id, user_id)` → `categories(id, user_id)`. RLS lo phần đọc, FK lo phần ghi.
- **Xóa danh mục/tài khoản**: soft-archive (`is_archived`), không xóa cứng để giao dịch cũ giữ nguyên tham chiếu.
- **Offline**: PWA chỉ cache app shell (mở được app khi mất mạng); KHÔNG làm offline queue ghi dữ liệu ở GĐ1–3 (ngoài phạm vi, phức tạp cao).
- **Realtime (GĐ2)**: Supabase Realtime subscribe bảng `transactions` → invalidate TanStack Query cache.

## Kiến trúc

```
src/
  lib/            supabase client, date helpers (getMonthRange), format tiền VND
  types/          types sinh từ schema (database.types.ts) + domain types
  features/
    auth/         AuthProvider, trang đăng nhập Google, guard route
    transactions/ màn nhập nhanh (NumPad custom), sổ giao dịch, form sửa
    accounts/     quản lý tài khoản (GĐ2)
    categories/   quản lý danh mục (GĐ2)
    reports/      biểu đồ (GĐ2)
    settings/     cài đặt
  components/     UI dùng chung (Button, Sheet/Modal, TabBar, Sidebar…)
  App.tsx, main.tsx, router
supabase/
  migrations/     file SQL đánh số thứ tự (áp bằng SQL Editor hoặc supabase CLI)
docs/superpowers/specs/   design doc (lưu vào repo — yêu cầu #5)
docs/superpowers/plans/   implementation plan (lưu vào repo)
```

- **Routing** (react-router): `/` = màn nhập nhanh (mặc định khi mở app), `/transactions` = sổ giao dịch, `/reports`, `/settings`. Mobile: bottom tab bar 4 tab. Desktop ≥1024px: sidebar trái + phím tắt (`N` mở nhập nhanh, `Enter` lưu, `←/→` chuyển tháng, `1–4` chuyển tab).
- **Data layer**: toàn bộ đọc/ghi qua TanStack Query hooks (`useTransactions(monthRange)`, `useAccounts()`, …), query key có chứa khoảng ngày tháng. Không state manager khác.
- **Tiền**: nhập/hiển thị qua 2 hàm `formatVND(amount: number)` / `parseVND(input: string)`; giá trị luôn là số nguyên đồng.

## Database schema (Task 1 — PHẢI được duyệt trước khi code UI)

```sql
-- profiles: 1-1 với auth.users
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  month_start_day int not null default 1 check (month_start_day between 1 and 28),
  created_at timestamptz not null default now()
);

-- accounts
create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('cash','bank')),
  initial_balance bigint not null default 0,
  sort_order int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

-- categories
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('expense','income')),
  icon text not null default '📦',
  sort_order int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

-- transactions
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('expense','income','transfer')),
  amount bigint not null check (amount > 0),
  category_id uuid,
  account_id uuid not null,
  to_account_id uuid,
  occurred_on date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (category_id, user_id) references categories (id, user_id),
  foreign key (account_id, user_id) references accounts (id, user_id),
  foreign key (to_account_id, user_id) references accounts (id, user_id),
  check (
    (type = 'transfer' and to_account_id is not null and category_id is null
       and to_account_id <> account_id)
    or
    (type <> 'transfer' and to_account_id is null and category_id is not null)
  )
);
create index idx_tx_user_date on transactions (user_id, occurred_on desc);
create index idx_tx_user_cat  on transactions (user_id, category_id);

-- View số dư
create view account_balances with (security_invoker = true) as
select a.id, a.user_id, a.name, a.type, a.is_archived, a.sort_order,
  a.initial_balance
  + coalesce(sum(case
      when t.type = 'income'  and t.account_id    = a.id then  t.amount
      when t.type = 'expense' and t.account_id    = a.id then -t.amount
      when t.type = 'transfer' and t.account_id   = a.id then -t.amount
      when t.type = 'transfer' and t.to_account_id = a.id then  t.amount
      else 0 end), 0) as balance
from accounts a
left join transactions t
  on t.user_id = a.user_id and (t.account_id = a.id or t.to_account_id = a.id)
group by a.id;
```

**RLS** — bật trên cả 4 bảng, mỗi bảng 1 policy cho đủ 4 thao tác:

```sql
alter table profiles     enable row level security;
alter table accounts     enable row level security;
alter table categories   enable row level security;
alter table transactions enable row level security;

-- lặp lại cho từng bảng:
create policy "own rows" on <bảng>
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
```

(`(select auth.uid())` thay vì `auth.uid()` trực tiếp để Postgres cache initplan — best practice hiệu năng của Supabase.)

**Trigger seed dữ liệu lần đầu** — function `handle_new_user()` SECURITY DEFINER, `set search_path = public`, trigger AFTER INSERT trên `auth.users`:
- Tạo `profiles` (month_start_day = 1)
- Tạo 2 tài khoản: `Tiền mặt` (cash), `Ngân hàng` (bank)
- Danh mục chi: Ăn uống 🍜, Đi lại 🚌, Mua sắm 🛍️, Hóa đơn & tiện ích 🧾, Nhà cửa 🏠, Sức khỏe 💊, Giải trí 🎮, Giáo dục 📚, Quà tặng & từ thiện 🎁, Khác 📦
- Danh mục thu: Lương 💰, Thưởng 🎉, Được tặng 🧧, Đầu tư 📈, Khác 💵

**updated_at**: trigger `moddatetime` (extension có sẵn) trên `transactions`.

## Checklist việc BẠN phải tự làm trên dashboard (tôi không làm thay được)

> Làm theo thứ tự; mục A cần xong trước Task 3, mục B trước Task 4, mục C trước Task 10.

**A. Supabase + Google OAuth**
- [ ] Tạo project Supabase (region Singapore `ap-southeast-1` cho gần VN), lưu lại `Project URL` + `anon key`
- [ ] Google Cloud Console → tạo project → OAuth consent screen (External, thêm email của bạn làm test user hoặc publish) → Credentials → OAuth Client ID (Web application)
  - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
- [ ] Supabase Dashboard → Authentication → Providers → Google: dán Client ID + Client Secret, bật lên
- [ ] Authentication → URL Configuration: Site URL = `http://localhost:5173` (tạm), thêm Redirect URLs: `http://localhost:5173/**`

**B. Áp migration**
- [ ] Supabase Dashboard → SQL Editor → chạy file migration tôi viết (tôi sẽ đưa nội dung; hoặc dùng `supabase db push` nếu bạn cài CLI)

**C. Deploy**
- [ ] Tạo repo GitHub, kết nối Vercel (framework Vite), set env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- [ ] Sau khi có domain Vercel: quay lại Supabase URL Configuration — Site URL = domain production, thêm `https://<app>.vercel.app/**` vào Redirect URLs; thêm domain vào Authorized redirect URIs ở Google nếu cần

## Giai đoạn 1 (MVP) — task chi tiết

Thứ tự = thứ tự phụ thuộc. Mỗi task có tiêu chí hoàn thành kiểm chứng được.

### Task 0 — Khởi tạo repo & lưu spec/plan vào repo
- `git init`, tạo `.gitignore`, `README.md`
- Ghi design doc vào `docs/superpowers/specs/2026-07-14-so-chi-tieu-design.md` và plan này vào `docs/superpowers/plans/2026-07-14-so-chi-tieu-plan.md` (yêu cầu #5 — phiên sau đọc lại được), commit
- ✅ **Hoàn thành khi**: `git log` có commit chứa 2 file docs.

### Task 1 — Schema + RLS migration ⛔ GATE: bạn duyệt xong mới code UI
- Viết `supabase/migrations/0001_init.sql` đầy đủ: 4 bảng, constraints, indexes, RLS policies, view `account_balances`, function + trigger seed, trigger `updated_at` (như phác thảo ở trên)
- Trình bày cho bạn duyệt; sửa theo góp ý
- ✅ **Hoàn thành khi**: bạn xác nhận duyệt schema; file SQL chạy không lỗi trên SQL Editor (mục B checklist).

### Task 2 — Scaffold dự án
- `npm create vite@latest` (react-ts), cài Tailwind CSS v4, TanStack Query, react-router, supabase-js, vite-plugin-pwa, Recharts (để sẵn cho GĐ2)
- Cấu trúc thư mục như phần Kiến trúc; ESLint + `tsc --noEmit` sạch; `.env.local` + `.env.example`
- Helpers nền tảng + unit test nhẹ (Vitest): `formatVND`/`parseVND`, `getMonthRange(date, monthStartDay)`
- ✅ **Hoàn thành khi**: `npm run dev` mở trang trống không lỗi console; `npm run build` + test pass.

### Task 3 — Auth Google
- Supabase client singleton; `AuthProvider` (session từ `onAuthStateChange`); trang `/login` nút "Đăng nhập với Google" (`signInWithOAuth`); guard: chưa đăng nhập → `/login`, đã đăng nhập → `/`
- Nút đăng xuất trong `/settings`
- ✅ **Hoàn thành khi**: đăng nhập Google thật thành công trên localhost, refresh giữ phiên, đăng xuất quay về `/login`.

### Task 4 — Xác minh seed & data hooks nền
- Sau khi bạn áp migration + đăng nhập lần đầu: kiểm tra tài khoản mới tự có profile, 2 tài khoản, ~15 danh mục (query từ app)
- Hooks: `useProfile`, `useAccounts`, `useCategories` (TanStack Query, staleTime dài vì ít đổi)
- ✅ **Hoàn thành khi**: user mới đăng nhập lần đầu thấy đủ danh mục + 2 tài khoản; user thứ hai (email khác) KHÔNG thấy dữ liệu của user một (xác minh RLS bằng 2 tài khoản Google).

### Task 5 — Khung layout responsive
- Mobile: bottom tab bar 4 tab (Nhập ✏️, Sổ GD 📒, Báo cáo 📊, Cài đặt ⚙️); Desktop ≥1024px: sidebar trái
- Router 4 route, `/` là màn nhập; phím tắt desktop: `1–4` chuyển tab
- ✅ **Hoàn thành khi**: resize 375px ↔ 1280px chuyển đúng tab bar ↔ sidebar, không vỡ layout; điều hướng đủ 4 màn.

### Task 6 — Màn nhập giao dịch (trái tim của app, UX < 5s)
- Mở app là vào thẳng màn này. Flow: gõ số tiền ngay (numpad hiện sẵn) → chọn danh mục (lưới icon) → Lưu. Tài khoản mặc định = tài khoản dùng lần trước (localStorage); ngày mặc định = hôm nay; ghi chú tùy chọn
- Tab Chi / Thu / Chuyển khoản; chuyển khoản chọn tài khoản nguồn + đích thay cho danh mục
- Mobile: NumPad custom (0–9, `000`, xóa, xong) — không dùng bàn phím hệ thống; Desktop: input số + `Enter` lưu, `N` từ màn khác nhảy về nhập
- Số tiền hiển thị định dạng `1.234.000 ₫` ngay khi gõ; sau khi lưu: toast + reset form sẵn sàng nhập tiếp
- Mutation với optimistic update (TanStack Query) để cảm giác tức thì
- ✅ **Hoàn thành khi**: trên điện thoại thật (hoặc emulation), nhập 1 giao dịch chi chỉ với ≤ 5 chạm sau khi mở app: [số tiền] → [danh mục] → [Lưu]; giao dịch xuất hiện trong DB đúng số tiền bigint; chuyển khoản tạo đúng 1 dòng và số dư 2 tài khoản đổi đúng.

### Task 7 — Sổ giao dịch theo tháng
- Header chuyển tháng `←  Tháng 7/2026  →` (dùng `getMonthRange` + `month_start_day`); nhóm giao dịch theo ngày, mỗi ngày có subtotal thu/chi; dòng giao dịch: icon danh mục, ghi chú, tài khoản, số tiền (chi đỏ, thu xanh, chuyển khoản xám)
- Chạm vào dòng → mở form sửa (chung component với màn nhập) / nút xóa có confirm
- Desktop: `←/→` chuyển tháng
- ✅ **Hoàn thành khi**: giao dịch nhập ở Task 6 hiện đúng nhóm ngày; sửa số tiền và xóa hoạt động, UI cập nhật không cần reload; chuyển 12 tháng qua lại không lỗi.

### Task 8 — Tổng quan tháng
- Thanh tổng trên đầu sổ giao dịch: Tổng thu / Tổng chi / Chênh lệch của tháng đang xem (chuyển khoản KHÔNG tính); màn Cài đặt hiện số dư từng tài khoản (view `account_balances`)
- ✅ **Hoàn thành khi**: số liệu khớp khi đối chiếu tay với các giao dịch trong tháng; thêm 1 giao dịch chuyển khoản không làm đổi tổng thu/chi nhưng đổi số dư 2 tài khoản.

### Task 9 — PWA
- vite-plugin-pwa: manifest tiếng Việt (name "Sổ Chi Tiêu", theme color, icons 192/512 + maskable), `registerType: 'autoUpdate'`, cache app shell
- ✅ **Hoàn thành khi**: Lighthouse PWA installable pass; "Thêm vào màn hình chính" trên Android/desktop chạy standalone; tắt mạng vẫn mở được app shell (hiện trạng thái mất mạng thay vì trắng trang).

### Task 10 — Deploy production
- Bạn làm mục C checklist; tôi cấu hình `vercel.json` (SPA rewrite) nếu cần
- ✅ **Hoàn thành khi**: đăng nhập Google + nhập giao dịch thành công trên domain Vercel từ điện thoại thật; nhập trên điện thoại → refresh trên PC thấy giao dịch (sync qua reload; realtime là GĐ2).

## Giai đoạn 2 (phác thảo)
- **Báo cáo**: pie chart chi theo danh mục (Recharts) + bar chart thu/chi 6 tháng gần nhất; chạm lát pie → danh sách giao dịch của danh mục đó
- **Lọc/tìm kiếm**: theo từ khóa ghi chú, danh mục, tài khoản, khoảng ngày (ilike + index hiện có)
- **Quản lý danh mục/tài khoản**: CRUD + archive + kéo thả `sort_order`, sửa `initial_balance`
- **Realtime sync**: subscribe postgres_changes trên `transactions` → invalidate query cache; cân nhắc broadcast cho accounts/categories

## Giai đoạn 3 (phác thảo)
- **Ngân sách tháng**: bảng `budgets (user_id, category_id, month_key, amount bigint)` + progress bar, cảnh báo vượt 80%/100%
- **Giao dịch định kỳ**: bảng `recurring_rules`; vì không có backend riêng, chạy "catch-up" khi mở app (tạo các giao dịch đến hạn kể từ lần mở trước) — không cần cron
- **Export CSV**: sinh client-side từ dữ liệu tháng/khoảng ngày, BOM UTF-8 để Excel đọc tiếng Việt
- **Dark mode**: Tailwind `dark:` + toggle (system/light/dark) lưu profile
- **Ngày bắt đầu tháng**: chỉ thêm UI setting cho `month_start_day` (logic đã sẵn từ GĐ1)

## Verification tổng thể
- Sau mỗi task: `npm run build` + `tsc --noEmit` + Vitest pass; tự chạy app bằng Browser pane (mobile viewport 375px và desktop 1280px) đi hết flow của task
- RLS: kiểm bằng 2 tài khoản Google thật (Task 4) — user B không đọc/ghi được dữ liệu user A
- Tiền: unit test `parseVND`/`formatVND` với giá trị lớn (999.999.999.999) và test `getMonthRange` với `month_start_day` = 1, 25, 28 (tháng 2)
- UX < 5s: đếm số chạm từ lúc mở app đến lúc lưu xong ≤ 5 trên mobile emulation

## Ghi chú thực thi
- Sau khi plan được duyệt: Task 0 sẽ lưu spec + plan vào repo (`docs/superpowers/specs/`, `docs/superpowers/plans/`) đúng cấu trúc skill superpowers để phiên sau đọc lại
- Task 1 là gate cứng: không viết code UI trước khi bạn duyệt schema
- Thực thi theo skill `superpowers:executing-plans`, mỗi task commit riêng, dùng TDD cho helpers thuần (tiền, ngày tháng)
