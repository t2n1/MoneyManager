# Loại tài khoản kiểu Nhật (IC giao thông + Ví điện tử) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm 2 loại tài khoản `ic` (IC giao thông: Suica/PASMO) và `ewallet` (Ví điện tử: PayPay/Rakuten Pay) — là tài sản, tự vào Tổng tài sản và biểu đồ "Theo loại".

**Architecture:** `accounts.type` là cột text có ràng buộc CHECK. Mở rộng union `AccountType`, ép TypeScript điền đủ nhãn (`ACCOUNT_TYPE_LABELS`) và icon (`ICONS`) vì cả hai là `Record<AccountType, …>`. Thêm 2 `<option>` trong form tài khoản và một migration nới CHECK constraint. Không đụng logic công nợ (chỉ `card`) và không đụng view số dư (đọc `a.type` chung).

**Tech Stack:** React 19, TypeScript, Vite, Vitest, TailwindCSS v4, lucide-react, Supabase (Postgres).

## Global Constraints

- Tiền luôn lưu ở minor units; không dùng float (theo `src/lib/money.ts`).
- Hai repo (`demoRepo`, `supabaseRepo`) phải đồng bộ cho mọi thay đổi hành vi — tính năng này KHÔNG thêm repo method nên không cần sửa repo.
- Icon dùng `currentColor` (kế thừa màu), đúng ở cả nền sáng/tối.
- Test chạy bằng `npx vitest run`; typecheck bằng `npx tsc --noEmit`.
- `ACCOUNT_TYPE_LABELS` và `ICONS` là `Record<AccountType, …>` — thêm loại vào union BẮT BUỘC cập nhật cả hai, nếu không sẽ lỗi biên dịch.

---

### Task 1: Mở rộng `AccountType` + nhãn + icon (tầng kiểu, có unit test)

**Files:**
- Modify: `src/types/database.types.ts:10`
- Modify: `src/features/assets/aggregate.ts` (khối `ACCOUNT_TYPE_LABELS`)
- Modify: `src/components/icons.tsx`
- Test: `src/features/assets/aggregate.test.ts`

**Interfaces:**
- Consumes: `assetBreakdown`, `assetTypeGroups`, `ACCOUNT_TYPE_LABELS` (đã có trong `aggregate.ts`); helper test `acc(...)`, `RATES` (đã có trong `aggregate.test.ts`).
- Produces: `AccountType` gồm `'cash' | 'bank' | 'card' | 'ic' | 'ewallet'`; `ACCOUNT_TYPE_LABELS.ic === 'IC giao thông'`, `ACCOUNT_TYPE_LABELS.ewallet === 'Ví điện tử'`.

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `describe('assetTypeGroups ...')` trong `src/features/assets/aggregate.test.ts` (đặt trước dấu `})` đóng describe):

```ts
  it('gom loại IC và Ví điện tử thành nhóm loại riêng', () => {
    const balances = [
      acc({ balance: 100_000, type: 'bank', asset_group: 'Tiêu dùng' }),
      acc({ balance: 3_000, type: 'ic', asset_group: 'Tiêu dùng' }),
      acc({ balance: 5_000, type: 'ewallet', asset_group: 'Tiêu dùng' }),
    ]
    const t = assetTypeGroups(assetBreakdown(balances, 'JPY', RATES))
    expect(t.map((g) => g.name).sort()).toEqual(['IC giao thông', 'Ngân hàng', 'Ví điện tử'])
    expect(t.find((g) => g.name === 'IC giao thông')!.total).toBe(3_000)
    expect(t.find((g) => g.name === 'Ví điện tử')!.total).toBe(5_000)
  })
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run src/features/assets/aggregate.test.ts`
Expected: FAIL — lỗi biên dịch TypeScript vì `type: 'ic'` / `'ewallet'` chưa thuộc `AccountType` (và/hoặc `ACCOUNT_TYPE_LABELS` thiếu khóa).

- [ ] **Step 3: Mở rộng union `AccountType`**

Trong `src/types/database.types.ts` dòng 10, đổi:

```ts
export type AccountType = 'cash' | 'bank' | 'card'
```

thành:

```ts
export type AccountType = 'cash' | 'bank' | 'card' | 'ic' | 'ewallet'
```

- [ ] **Step 4: Thêm nhãn tiếng Việt**

Trong `src/features/assets/aggregate.ts`, cập nhật khối `ACCOUNT_TYPE_LABELS` thành:

```ts
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Tiền mặt',
  bank: 'Ngân hàng',
  card: 'Thẻ tín dụng',
  ic: 'IC giao thông',
  ewallet: 'Ví điện tử',
}
```

- [ ] **Step 5: Thêm icon**

Trong `src/components/icons.tsx`, đổi dòng import và khối `ICONS`:

```tsx
import { Coins, CreditCard, Landmark, TrainFront, Wallet } from 'lucide-react'
import type { AccountType } from '../types/database.types'

const ICONS: Record<AccountType, typeof Coins> = {
  cash: Coins,
  bank: Landmark,
  card: CreditCard,
  ic: TrainFront,
  ewallet: Wallet,
}
```

- [ ] **Step 6: Chạy test + typecheck để xác nhận qua**

Run: `npx vitest run src/features/assets/aggregate.test.ts && npx tsc --noEmit`
Expected: test PASS (toàn bộ file), `tsc` không báo lỗi.

- [ ] **Step 7: Commit**

```bash
git add src/types/database.types.ts src/features/assets/aggregate.ts src/components/icons.tsx src/features/assets/aggregate.test.ts
git commit -m "Nhat: them loai TK ic + ewallet (union + nhan + icon)"
```

---

### Task 2: Form thêm tài khoản + migration CHECK constraint

**Files:**
- Modify: `src/features/accounts/AccountsPage.tsx:285-287`
- Create: `supabase/migrations/0012_account_types_jp.sql`

**Interfaces:**
- Consumes: `AccountType` mở rộng ở Task 1; `<select>` "Loại" hiện có trong form (`setType`).
- Produces: người dùng chọn được `ic`/`ewallet` khi tạo/sửa tài khoản; DB chấp nhận 2 giá trị mới.

- [ ] **Step 1: Thêm 2 `<option>` vào form**

Trong `src/features/accounts/AccountsPage.tsx`, trong `<select>` "Loại", ngay sau
`<option value="card">Thẻ tín dụng</option>` (dòng ~287), thêm:

```tsx
              <option value="ic">IC giao thông</option>
              <option value="ewallet">Ví điện tử</option>
```

- [ ] **Step 2: Tạo migration**

Tạo `supabase/migrations/0012_account_types_jp.sql`:

```sql
-- ============================================================
-- Sổ Chi Tiêu — Migration 0012: Loại tài khoản kiểu Nhật
-- Thêm 'ic' (IC giao thông: Suica/PASMO/ICOCA) và 'ewallet' (Ví điện tử:
-- PayPay/Rakuten Pay/LINE Pay). Cả hai là TÀI SẢN (số dư dương), xử lý y hệt
-- cash/bank ở tầng ứng dụng. View số dư đọc a.type chung nên KHÔNG cần sửa.
-- ============================================================

alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts
  add constraint accounts_type_check
  check (type in ('cash', 'bank', 'card', 'ic', 'ewallet'));
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: không lỗi.

- [ ] **Step 4: Kiểm chứng trên app (chế độ demo — không cần chạy migration)**

- Khởi động dev server: dùng công cụ Browser `preview_start` với `{name: "so-chi-tieu"}` (KHÔNG dùng Bash chạy server).
- Mở `/settings/accounts` (hoặc trang có form thêm tài khoản), tạo 1 tài khoản `IC giao thông` (JPY, số dư ví dụ ¥3,000) và 1 tài khoản `Ví điện tử` (JPY, ¥5,000).
- Kỳ vọng: cả hai hiện trong danh sách kèm icon tàu điện / ví; mở `/assets`, bật chế độ **"Loại"** ở khối "Cơ cấu tài sản" → thấy lát "IC giao thông" và "Ví điện tử" riêng, cộng vào Tổng tài sản.
- Xác minh bằng `read_page` (kiểm tra tên loại + số) hoặc `read_console_messages` (không lỗi).

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/AccountsPage.tsx supabase/migrations/0012_account_types_jp.sql
git commit -m "Nhat: chon duoc ic/ewallet trong form + migration 0012 (CHECK)"
```

---

## Self-Review

**Spec coverage (#2):**
- Union `AccountType` mở rộng — Task 1 Step 3. ✓
- `ACCOUNT_TYPE_LABELS` (ic/ewallet) — Task 1 Step 4. ✓
- Icon (tàu điện / ví) — Task 1 Step 5. ✓
- Migration 0012 nới CHECK, không sửa view — Task 2 Step 2. ✓
- 2 `<option>` trong form — Task 2 Step 1. ✓
- Không đụng logic công nợ; tự vào biểu đồ "Theo loại" — kiểm chứng Task 2 Step 4. ✓
- Test: ca `ic`/`ewallet` trong `aggregate.test.ts` — Task 1 Step 1. ✓

**Placeholder scan:** không có TBD/TODO; mọi step có code/lệnh cụ thể.

**Type consistency:** `AccountType`, `ACCOUNT_TYPE_LABELS.ic/ewallet`, `ICONS.ic/ewallet`, giá trị `<option>` `ic`/`ewallet`, và giá trị SQL `'ic'/'ewallet'` khớp nhau xuyên suốt.
