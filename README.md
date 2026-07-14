# Sổ Chi Tiêu

Web app quản lý chi tiêu cá nhân tiếng Việt, lấy cảm hứng từ Money Manager.
Dùng trên cả điện thoại và PC, cài được như PWA.

## Nguyên tắc cốt lõi

- **Nhập một giao dịch < 5 giây** — mở app là vào thẳng màn hình nhập.
- Tiền tệ chỉ VND, lưu dạng số nguyên (`bigint`) — không bao giờ dùng float.
- Không backend riêng — client gọi thẳng Supabase, bảo mật bằng Row Level Security.
- Chi phí vận hành mục tiêu: 0 đồng (Supabase free tier + Vercel free tier).

## Stack

React + Vite + TypeScript + Tailwind CSS + TanStack Query + Recharts + vite-plugin-pwa
· Supabase (Postgres + Auth + Realtime) · Đăng nhập Google · Deploy Vercel

## Tài liệu

- Design spec: [docs/superpowers/specs/2026-07-14-so-chi-tieu-design.md](docs/superpowers/specs/2026-07-14-so-chi-tieu-design.md)
- Implementation plan: [docs/superpowers/plans/2026-07-14-so-chi-tieu-plan.md](docs/superpowers/plans/2026-07-14-so-chi-tieu-plan.md)
- Database migration: [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql)

## Chạy dev

```bash
npm install
cp .env.example .env.local   # điền VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev
```

## Lệnh

| Lệnh | Mô tả |
|------|-------|
| `npm run dev` | Dev server (http://localhost:5173) |
| `npm run build` | Build production (`tsc -b` + vite build) |
| `npm run test` | Chạy unit tests (Vitest) |
| `npm run lint` | Lint (Oxlint) |
