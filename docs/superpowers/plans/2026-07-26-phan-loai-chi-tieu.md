# Phân loại chi tiêu 2 trục — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho người dùng thấy cơ cấu chi tiêu theo 2 trục độc lập — Thiết yếu/Linh hoạt (50/30/20 trên thu nhập) và Cố định/Biến đổi (trên tổng chi) — để biết chi tiêu có lành mạnh không và cắt giảm khẩn cấp ở đâu.

**Architecture:** Gắn 2 nhãn nullable (`need_level`, `cost_type`) ở danh mục lá (không per-giao-dịch). Báo cáo gom theo từng danh mục phát sinh (tái dùng `categoryBreakdown().slices`) qua một hàm thuần mới `classificationBreakdown()`. Hiển thị bằng card mới: C1 dạng thanh có vạch mục tiêu, C2 dạng donut Recharts + thanh. Phân loại lần đầu qua màn "Phân loại nhanh" riêng.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind v4 (class-based dark mode) + Supabase + Recharts + lucide-react + react-router-dom v7 + Vitest.

## Global Constraints

- Tiền lưu **minor units**, quy đổi base qua `convertToBase`; số tiền hiển thị luôn qua `formatMoney(value, base)`.
- Bỏ qua giao dịch có `is_debt_flow` hoặc `exclude_from_stats` (đã có sẵn trong các hàm aggregate).
- 2 nhãn chỉ áp cho danh mục **Chi** (`type === 'expense'`) và chỉ ở **danh mục lá**; danh mục Thu / cha-có-con để trống.
- Cả 2 cột **nullable**; `null` = "chưa phân loại".
- Dark mode: dùng cặp class `… dark:…` như phần còn lại của app. Không hardcode màu ngoài `PALETTE`.
- Touch target ≥ 44px; toggle có trạng thái chọn rõ ràng; tôn trọng `prefers-reduced-motion` cho donut.
- Màu quy ước: Nhu cầu/Cố định `#16a34a` · Sở thích/Biến đổi `#f59e0b` · Tiết kiệm `#0ea5e9` · Chưa phân loại `#9ca3af`.
- Chạy được ở cả demo mode (không Supabase): dữ liệu demo phải có nhãn mẫu.

## File Structure

| File | Trách nhiệm |
|------|-------------|
| `supabase/migrations/0025_expense_classification.sql` | Thêm 2 cột + backfill nhãn danh mục mặc định + cập nhật `handle_new_user` |
| `src/types/database.types.ts` | Thêm type `NeedLevel`/`CostType`, mở rộng `CategoryRow` + Insert |
| `src/data/repo.ts` | Thêm `need_level`/`cost_type` optional vào `NewCategory` |
| `src/features/reports/aggregate.ts` | Hàm thuần `classificationBreakdown()` |
| `src/features/reports/aggregate.test.ts` | Test cho hàm trên |
| `src/features/reports/BreakdownRow.tsx` | Tách `BreakdownRow` ra dùng chung + prop `targetPct` |
| `src/features/reports/CategoryBreakdownCard.tsx` | Import `BreakdownRow` từ file mới |
| `src/features/reports/SpendClassificationCard.tsx` | Card mới: C1 thanh, C2 donut |
| `src/features/reports/ReportsPage.tsx` | Gắn card (tháng + năm), truyền income |
| `src/features/categories/CategoriesPage.tsx` | 2 control trong `CategoryForm` |
| `src/features/categories/ClassifyCategoriesPage.tsx` | Màn phân loại nhanh |
| `src/App.tsx` | Route `/settings/categories/classify` |
| `src/features/settings/SettingsPage.tsx` | Lối vào "Phân loại chi tiêu" |
| `src/data/demoRepo.ts` | Nhãn mẫu cho danh mục demo |

---

### Task 1: Data model — types + migration

**Files:**
- Modify: `src/types/database.types.ts:10-12` (thêm type), `:53-64` (CategoryRow), `:299-303` (Insert)
- Modify: `src/data/repo.ts:108-114` (NewCategory)
- Modify: `src/data/demoRepo.ts:119-133` (factory `category()` — để `tsc` xanh ngay)
- Create: `supabase/migrations/0025_expense_classification.sql`

**Interfaces:**
- Produces: `NeedLevel = 'essential' | 'flexible'`, `CostType = 'fixed' | 'variable'`; `CategoryRow.need_level: NeedLevel | null`, `CategoryRow.cost_type: CostType | null`; `NewCategory.need_level?`, `NewCategory.cost_type?`.

- [ ] **Step 1: Thêm type + mở rộng CategoryRow trong `database.types.ts`**

Sau dòng `export type CategoryType = 'expense' | 'income'` (dòng 11) thêm:

```ts
export type NeedLevel = 'essential' | 'flexible'
export type CostType = 'fixed' | 'variable'
```

Trong `CategoryRow` (sau `created_at: string`, trước dấu `}`):

```ts
  /** Chỉ danh mục Chi lá: nhu cầu bắt buộc vs sở thích. null = chưa phân loại */
  need_level: NeedLevel | null
  /** Chỉ danh mục Chi lá: chi cố định vs biến đổi. null = chưa phân loại */
  cost_type: CostType | null
```

- [ ] **Step 2: Cho phép Insert bỏ trống 2 cột**

Trong khối `categories: { … Insert: InsertOf<CategoryRow, 'user_id' | 'name' | 'type', 'id' | 'icon' | 'parent_id' | 'sort_order' | 'is_archived'` — thêm 2 khoá vào danh sách optional:

```ts
        Insert: InsertOf<
          CategoryRow,
          'user_id' | 'name' | 'type',
          'id' | 'icon' | 'parent_id' | 'sort_order' | 'is_archived' | 'need_level' | 'cost_type'
        >
        Update: Partial<
          Pick<
            CategoryRow,
            'name' | 'type' | 'icon' | 'parent_id' | 'sort_order' | 'is_archived' | 'need_level' | 'cost_type'
          >
        >
```

- [ ] **Step 3: Thêm 2 trường optional vào `NewCategory` (`repo.ts`)**

```ts
export interface NewCategory {
  name: string
  type: CategoryType
  icon: string
  /** null/bỏ trống = danh mục chính; id cha = danh mục con của cha đó */
  parent_id?: string | null
  /** Chỉ danh mục Chi lá — xem CategoryRow */
  need_level?: NeedLevel | null
  cost_type?: CostType | null
}
```

Thêm `NeedLevel, CostType` vào import type từ `database.types` ở đầu `repo.ts` (cùng dòng đang import `CategoryType`).

- [ ] **Step 4: Cho factory `category()` ở `demoRepo.ts` trả 2 cột mới**

`CategoryRow` vừa thêm 2 field, nên factory demo phải trả về chúng (mặc định `null`)
để `tsc` xanh. Sửa factory (khoảng dòng 119-133):

```ts
  const category = (
    name: string,
    type: CategoryType,
    icon: string,
    parent_id: string | null = null,
    need_level: NeedLevel | null = null,
    cost_type: CostType | null = null,
  ): CategoryRow => ({
    id: uuid(),
    user_id: DEMO_USER,
    name,
    type,
    icon,
    parent_id,
    sort_order: catOrder++,
    is_archived: false,
    created_at: nowISO(),
    need_level,
    cost_type,
  })
```

Thêm `NeedLevel, CostType` vào dòng import type từ `../types/database.types` trong
`demoRepo.ts` (nơi đang import `CategoryType`).

- [ ] **Step 5: Viết migration 0025**

Tạo `supabase/migrations/0025_expense_classification.sql`:

```sql
-- ============================================================
-- Sổ Chi Tiêu — Migration 0025: Phân loại chi tiêu 2 trục
-- need_level: essential (thiết yếu) | flexible (linh hoạt)
-- cost_type:  fixed (cố định)       | variable (biến đổi)
-- Cả hai nullable, chỉ dùng cho danh mục Chi lá.
-- ============================================================

alter table public.categories
  add column if not exists need_level text
    check (need_level in ('essential','flexible')),
  add column if not exists cost_type text
    check (cost_type in ('fixed','variable'));

-- Backfill nhãn cho danh mục MẶC ĐỊNH của người dùng hiện có (khớp theo tên
-- danh mục con ở seed 0017). Chỉ chạm hàng expense đang null để không đè phân
-- loại người dùng đã tự đặt.
update public.categories c set
  need_level = v.need_level,
  cost_type  = v.cost_type
from (values
  -- Nhà ở
  ('Tiền nhà','essential','fixed'),
  ('Nội thất','flexible','variable'),
  ('Đồ bếp','flexible','variable'),
  ('Đồ vệ sinh cá nhân','essential','variable'),
  ('Điện','essential','variable'),
  ('Nước','essential','variable'),
  ('Gas','essential','variable'),
  -- Ăn uống
  ('Bữa sáng','essential','variable'),
  ('Bữa trưa','essential','variable'),
  ('Bữa tối','essential','variable'),
  ('Ăn ngoài','flexible','variable'),
  ('Đồ uống','flexible','variable'),
  ('Đi chợ','essential','variable'),
  -- Giao tế
  ('Bạn bè','flexible','variable'),
  ('Tình cảm','flexible','variable'),
  -- Đi lại
  ('Xe buýt','essential','variable'),
  ('Tàu điện','essential','variable'),
  ('Taxi','flexible','variable'),
  ('Ô tô','essential','variable'),
  ('Luup','flexible','variable'),
  -- Thời trang
  ('Quần áo','flexible','variable'),
  ('Giày dép','flexible','variable'),
  ('Phụ kiện','flexible','variable'),
  ('Mỹ phẩm','flexible','variable'),
  ('Giặt là','essential','variable'),
  -- Sở thích
  ('Cây cối','flexible','variable'),
  ('Nhiếp ảnh','flexible','variable'),
  ('Đăng ký','flexible','fixed'),
  ('Thể thao','flexible','variable'),
  -- Sức khỏe
  ('Gym','flexible','fixed'),
  ('Bệnh viện','essential','variable'),
  ('Thuốc','essential','variable'),
  ('Thuốc lá','flexible','variable'),
  -- Giáo dục
  ('Thi cử','essential','variable'),
  ('Học phí','essential','fixed'),
  ('Sách vở','essential','variable'),
  -- Quà tặng
  ('Quà','flexible','variable'),
  ('Hỗ trợ gia đình','essential','fixed')
) as v(name, need_level, cost_type)
where c.type = 'expense'
  and c.parent_id is not null
  and c.need_level is null
  and c.name = v.name;

-- Người dùng MỚI: gán nhãn ngay trong trigger seed. Cập nhật khối insert danh
-- mục con của handle_new_user để kèm need_level/cost_type.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );

  insert into public.accounts (user_id, name, type, currency, sort_order) values
    (new.id, 'Tiền mặt',   'cash', 'JPY', 0),
    (new.id, 'Ngân hàng',  'bank', 'JPY', 1),
    (new.id, 'Đầu tư VN',  'bank', 'VND', 2),
    (new.id, 'Dự trữ USD', 'bank', 'USD', 3);

  insert into public.categories (user_id, name, type, icon, parent_id, sort_order) values
    (new.id, 'Nhà ở',              'expense', '🏠', null, 0),
    (new.id, 'Ăn uống',            'expense', '🍜', null, 8),
    (new.id, 'Giao tế',            'expense', '👫', null, 15),
    (new.id, 'Đi lại',             'expense', '🚆', null, 18),
    (new.id, 'Thời trang',         'expense', '🧥', null, 24),
    (new.id, 'Sở thích',           'expense', '🌱', null, 30),
    (new.id, 'Sức khỏe',           'expense', '🧘', null, 35),
    (new.id, 'Tài chính & Đầu tư', 'expense', '📊', null, 40),
    (new.id, 'Giáo dục',           'expense', '📔', null, 41),
    (new.id, 'Quà tặng',           'expense', '🎁', null, 45),
    (new.id, 'Khác',               'expense', '📦', null, 48),
    (new.id, 'Lương',      'income', '💰', null, 0),
    (new.id, 'Thưởng',     'income', '🎉', null, 1),
    (new.id, 'Được tặng',  'income', '🧧', null, 2),
    (new.id, 'Đầu tư',     'income', '📈', null, 3),
    (new.id, 'Khác',       'income', '💵', null, 4);

  insert into public.categories (user_id, name, type, icon, parent_id, sort_order, need_level, cost_type)
  select new.id, d.name, 'expense', d.icon,
         (select id from public.categories p
           where p.user_id = new.id and p.type = 'expense'
             and p.name = d.parent and p.parent_id is null),
         d.ord, d.need_level, d.cost_type
  from (values
    ('Tiền nhà',            '🔑', 'Nhà ở',       1, 'essential','fixed'),
    ('Nội thất',            '🛋️', 'Nhà ở',       2, 'flexible','variable'),
    ('Đồ bếp',              '🍳', 'Nhà ở',       3, 'flexible','variable'),
    ('Đồ vệ sinh cá nhân',  '🧴', 'Nhà ở',       4, 'essential','variable'),
    ('Điện',                '💡', 'Nhà ở',       5, 'essential','variable'),
    ('Nước',                '🚰', 'Nhà ở',       6, 'essential','variable'),
    ('Gas',                 '🔥', 'Nhà ở',       7, 'essential','variable'),
    ('Bữa sáng',            '🥐', 'Ăn uống',     9, 'essential','variable'),
    ('Bữa trưa',            '🍱', 'Ăn uống',    10, 'essential','variable'),
    ('Bữa tối',             '🍚', 'Ăn uống',    11, 'essential','variable'),
    ('Ăn ngoài',            '🍽️', 'Ăn uống',    12, 'flexible','variable'),
    ('Đồ uống',             '🥤', 'Ăn uống',    13, 'flexible','variable'),
    ('Đi chợ',              '🛒', 'Ăn uống',    14, 'essential','variable'),
    ('Bạn bè',              '🧑‍🤝‍🧑', 'Giao tế',  16, 'flexible','variable'),
    ('Tình cảm',            '💑', 'Giao tế',    17, 'flexible','variable'),
    ('Xe buýt',             '🚌', 'Đi lại',     19, 'essential','variable'),
    ('Tàu điện',            '🚉', 'Đi lại',     20, 'essential','variable'),
    ('Taxi',                '🚕', 'Đi lại',     21, 'flexible','variable'),
    ('Ô tô',                '🚗', 'Đi lại',     22, 'essential','variable'),
    ('Luup',                '🛴', 'Đi lại',     23, 'flexible','variable'),
    ('Quần áo',             '👕', 'Thời trang', 25, 'flexible','variable'),
    ('Giày dép',            '👟', 'Thời trang', 26, 'flexible','variable'),
    ('Phụ kiện',            '👜', 'Thời trang', 27, 'flexible','variable'),
    ('Mỹ phẩm',             '💄', 'Thời trang', 28, 'flexible','variable'),
    ('Giặt là',             '🧺', 'Thời trang', 29, 'essential','variable'),
    ('Cây cối',             '🪴', 'Sở thích',   31, 'flexible','variable'),
    ('Nhiếp ảnh',           '📷', 'Sở thích',   32, 'flexible','variable'),
    ('Đăng ký',             '📺', 'Sở thích',   33, 'flexible','fixed'),
    ('Thể thao',            '⚽', 'Sở thích',   34, 'flexible','variable'),
    ('Gym',                 '🏋️', 'Sức khỏe',   36, 'flexible','fixed'),
    ('Bệnh viện',           '🏥', 'Sức khỏe',   37, 'essential','variable'),
    ('Thuốc',               '💊', 'Sức khỏe',   38, 'essential','variable'),
    ('Thuốc lá',            '🚬', 'Sức khỏe',   39, 'flexible','variable'),
    ('Thi cử',              '📝', 'Giáo dục',   42, 'essential','variable'),
    ('Học phí',             '🏫', 'Giáo dục',   43, 'essential','fixed'),
    ('Sách vở',             '📚', 'Giáo dục',   44, 'essential','variable'),
    ('Quà',                 '🎀', 'Quà tặng',   46, 'flexible','variable'),
    ('Hỗ trợ gia đình',     '👪', 'Quà tặng',   47, 'essential','fixed')
  ) as d(name, icon, parent, ord, need_level, cost_type);

  return new;
end;
$$;
```

- [ ] **Step 6: Kiểm tra build TypeScript**

Run: `npm run build`
Expected: PASS, không lỗi tsc.

- [ ] **Step 7: Commit**

```bash
git add src/types/database.types.ts src/data/repo.ts src/data/demoRepo.ts supabase/migrations/0025_expense_classification.sql
git commit -m "feat(phan-loai): them cot need_level/cost_type + migration 0025"
```

> **QUAN TRỌNG:** migration 0025 phải được **áp lên Supabase thật** trước khi tính năng chạy trên bản deploy (giống 0012+). Ghi nhớ như các migration trước.

---

### Task 2: Hàm thuần `classificationBreakdown()`

**Files:**
- Modify: `src/features/reports/aggregate.ts` (thêm cuối file, sau `sumIncomeExpense`)
- Test: `src/features/reports/aggregate.test.ts`

**Interfaces:**
- Consumes: `CategorySlice` (`{ categoryId, amount }`), `CategoryRow` (có `need_level`, `cost_type` từ Task 1).
- Produces:
```ts
interface ClassificationBreakdown {
  needEssential: number
  needFlexible: number
  needUnclassified: number
  costFixed: number
  costVariable: number
  costUnclassified: number
  emergencyCut: number   // chi vừa flexible vừa variable
  totalExpense: number
}
function classificationBreakdown(slices: CategorySlice[], categories: CategoryRow[]): ClassificationBreakdown
```

- [ ] **Step 1: Viết test thất bại**

Thêm vào `src/features/reports/aggregate.test.ts`. Import thêm `classificationBreakdown` từ `./aggregate` và `CategoryRow` nếu chưa có. Helper tạo category rút gọn:

```ts
import { classificationBreakdown } from './aggregate'
import type { CategoryRow, NeedLevel, CostType } from '../../types/database.types'

function cat(
  id: string,
  need_level: NeedLevel | null,
  cost_type: CostType | null,
): CategoryRow {
  return {
    id, user_id: 'u', name: id, type: 'expense', icon: '📦',
    parent_id: null, sort_order: 0, is_archived: false,
    created_at: '2026-01-01', need_level, cost_type,
  }
}

describe('classificationBreakdown', () => {
  const cats = [
    cat('rent', 'essential', 'fixed'),
    cat('food', 'essential', 'variable'),
    cat('fun', 'flexible', 'variable'),
    cat('sub', 'flexible', 'fixed'),
    cat('other', null, null),
  ]

  it('gom theo cả hai trục và tính emergencyCut = flexible & variable', () => {
    const r = classificationBreakdown(
      [
        { categoryId: 'rent', amount: 1000 },
        { categoryId: 'food', amount: 400 },
        { categoryId: 'fun', amount: 300 },
        { categoryId: 'sub', amount: 100 },
      ],
      cats,
    )
    expect(r.needEssential).toBe(1400)
    expect(r.needFlexible).toBe(400)
    expect(r.needUnclassified).toBe(0)
    expect(r.costFixed).toBe(1100)
    expect(r.costVariable).toBe(700)
    expect(r.emergencyCut).toBe(300) // chỉ 'fun'
    expect(r.totalExpense).toBe(1800)
  })

  it('slice có danh mục thiếu nhãn hoặc không tra được → vào Unclassified', () => {
    const r = classificationBreakdown(
      [
        { categoryId: 'other', amount: 500 },
        { categoryId: 'ghost', amount: 200 }, // không có trong cats
      ],
      cats,
    )
    expect(r.needUnclassified).toBe(700)
    expect(r.costUnclassified).toBe(700)
    expect(r.emergencyCut).toBe(0)
    expect(r.totalExpense).toBe(700)
  })
})
```

- [ ] **Step 2: Chạy test — phải fail**

Run: `npm test -- aggregate`
Expected: FAIL với "classificationBreakdown is not a function" (hoặc lỗi import).

- [ ] **Step 3: Viết hàm**

Thêm cuối `src/features/reports/aggregate.ts`:

```ts
export interface ClassificationBreakdown {
  needEssential: number
  needFlexible: number
  needUnclassified: number
  costFixed: number
  costVariable: number
  costUnclassified: number
  /** chi vừa flexible vừa variable — "van xả khẩn cấp" */
  emergencyCut: number
  totalExpense: number
}

/**
 * Gom chi theo 2 trục độc lập từ slices (đã quy đổi base).
 * Nhãn đọc trực tiếp từ danh mục của slice; thiếu nhãn → Unclassified.
 */
export function classificationBreakdown(
  slices: CategorySlice[],
  categories: CategoryRow[],
): ClassificationBreakdown {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const r: ClassificationBreakdown = {
    needEssential: 0, needFlexible: 0, needUnclassified: 0,
    costFixed: 0, costVariable: 0, costUnclassified: 0,
    emergencyCut: 0, totalExpense: 0,
  }
  for (const s of slices) {
    const c = byId.get(s.categoryId)
    const need = c?.need_level ?? null
    const cost = c?.cost_type ?? null
    r.totalExpense += s.amount
    if (need === 'essential') r.needEssential += s.amount
    else if (need === 'flexible') r.needFlexible += s.amount
    else r.needUnclassified += s.amount
    if (cost === 'fixed') r.costFixed += s.amount
    else if (cost === 'variable') r.costVariable += s.amount
    else r.costUnclassified += s.amount
    if (need === 'flexible' && cost === 'variable') r.emergencyCut += s.amount
  }
  return r
}
```

- [ ] **Step 4: Chạy test — phải pass**

Run: `npm test -- aggregate`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/features/reports/aggregate.ts src/features/reports/aggregate.test.ts
git commit -m "feat(phan-loai): ham thuan classificationBreakdown + test"
```

---

### Task 3: Tách `BreakdownRow` ra dùng chung + prop `targetPct`

**Files:**
- Create: `src/features/reports/BreakdownRow.tsx`
- Modify: `src/features/reports/CategoryBreakdownCard.tsx` (bỏ hàm cục bộ, import từ file mới)

**Interfaces:**
- Produces: `BreakdownRow` (named export) với props hiện có `{ icon, name, pct, value, barPct, color, base, selected? }` **cộng** `targetPct?: number` và `warn?: boolean`.

- [ ] **Step 1: Tạo `BreakdownRow.tsx`**

Chép nguyên khối `BreakdownRow` hiện tại từ `CategoryBreakdownCard.tsx:57-102` sang file mới, thêm 2 prop optional. Vạch mục tiêu = 1 div tuyệt đối trên nền thanh; nếu `warn` thì thanh dùng màu cảnh báo.

```tsx
import { formatMoney, type CurrencyCode } from '../../lib/money'

/** Một hàng danh mục: nhãn + % + số tiền + thanh tỉ lệ (kèm vạch mục tiêu tùy chọn). */
export function BreakdownRow({
  icon,
  name,
  pct,
  value,
  barPct,
  color,
  base,
  selected = false,
  targetPct,
  warn = false,
}: {
  icon: string
  name: string
  pct: number
  value: number
  barPct: number
  color: string
  base: CurrencyCode
  selected?: boolean
  /** 0–100: vẽ vạch mục tiêu trên thanh + nhãn "mục tiêu" */
  targetPct?: number
  /** true = dùng màu cảnh báo cho thanh (vd vượt mốc) */
  warn?: boolean
}) {
  const barColor = warn ? '#dc2626' : color
  return (
    <div className={selected ? '-m-1 rounded-md bg-gray-100 p-1 dark:bg-gray-800' : ''}>
      <div className="mb-1 flex items-baseline gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
          {icon ? `${icon} ` : ''}
          {name}
        </span>
        {targetPct != null && (
          <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
            mục tiêu {targetPct}%
          </span>
        )}
        <span className="shrink-0 tabular-nums text-xs text-gray-500 dark:text-gray-400">
          {pct.toFixed(0)}%
        </span>
        <span className="shrink-0 tabular-nums font-medium text-gray-800 dark:text-gray-100">
          {formatMoney(value, base)}
        </span>
      </div>
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
        role="presentation"
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(Math.max(barPct, 1.5), 100)}%`, backgroundColor: barColor }}
        />
        {targetPct != null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-gray-500/70 dark:bg-gray-300/70"
            style={{ left: `${Math.min(targetPct, 100)}%` }}
            aria-hidden
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Sửa `CategoryBreakdownCard.tsx` dùng import**

Xóa khối hàm `BreakdownRow` cục bộ (dòng ~57-102). Thêm import ở đầu file:

```ts
import { BreakdownRow } from './BreakdownRow'
```

Giữ nguyên phần import `formatMoney` nếu còn dùng nơi khác trong file; nếu sau khi xóa `BreakdownRow` mà `formatMoney` không còn được dùng, xóa import đó để tránh lỗi lint `no-unused-vars`.

- [ ] **Step 3: Build + test hồi quy**

Run: `npm run build && npm test -- reports`
Expected: PASS; `CategoryBreakdownCard` vẫn hiển thị như cũ (không đổi hành vi).

- [ ] **Step 4: Commit**

```bash
git add src/features/reports/BreakdownRow.tsx src/features/reports/CategoryBreakdownCard.tsx
git commit -m "refactor(bao-cao): tach BreakdownRow dung chung + prop targetPct"
```

---

### Task 4: `SpendClassificationCard` (component hiển thị)

**Files:**
- Create: `src/features/reports/SpendClassificationCard.tsx`

**Interfaces:**
- Consumes: `ClassificationBreakdown` (Task 2), `BreakdownRow` (Task 3), `formatMoney`, Recharts.
- Produces:
```ts
interface Props {
  data: ClassificationBreakdown   // từ classificationBreakdown()
  income: number                  // tổng thu kỳ (base minor)
  base: CurrencyCode
  periodNoun: string              // "tháng này" | "năm này"
  unclassifiedCount: number       // số danh mục Chi lá chưa phân loại
}
function SpendClassificationCard(props: Props): JSX.Element
```

- [ ] **Step 1: Viết component**

Tạo `src/features/reports/SpendClassificationCard.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { ClassificationBreakdown } from './aggregate'
import { BreakdownRow } from './BreakdownRow'

const C = {
  need: '#16a34a',
  want: '#f59e0b',
  save: '#0ea5e9',
  unknown: '#9ca3af',
} as const

interface Props {
  data: ClassificationBreakdown
  income: number
  base: CurrencyCode
  periodNoun: string
  unclassifiedCount: number
}

export function SpendClassificationCard({ data, income, base, periodNoun, unclassifiedCount }: Props) {
  const { totalExpense } = data
  const savings = income - totalExpense
  const pctOfIncome = (v: number) => (income > 0 ? (v / income) * 100 : 0)
  const pctOfExpense = (v: number) => (totalExpense > 0 ? (v / totalExpense) * 100 : 0)

  // Donut C2 (Cố định/Biến đổi) — chỉ lát > 0
  const c2Slices = [
    { name: 'Cố định', value: data.costFixed, color: C.need },
    { name: 'Biến đổi', value: data.costVariable, color: C.want },
    { name: 'Chưa phân loại', value: data.costUnclassified, color: C.unknown },
  ].filter((s) => s.value > 0)

  return (
    <section className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400">Cơ cấu chi tiêu</h2>
        {unclassifiedCount > 0 && (
          <Link
            to="/settings/categories/classify"
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/30"
          >
            Phân loại {unclassifiedCount} danh mục →
          </Link>
        )}
      </div>

      {/* C1 — 50/30/20 trên thu nhập */}
      <h3 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
        Thiết yếu vs Linh hoạt <span className="text-gray-400 dark:text-gray-500">(% thu nhập · quy tắc 50/30/20)</span>
      </h3>
      {income <= 0 ? (
        <p className="mb-3 rounded-lg bg-gray-50 px-3 py-3 text-center text-xs text-gray-500 dark:bg-gray-950 dark:text-gray-400">
          Cần có thu nhập trong {periodNoun} để tính tỷ lệ 50/30/20.
        </p>
      ) : (
        <div className="mb-4 space-y-2.5">
          <BreakdownRow
            icon="" name="Nhu cầu (thiết yếu)"
            pct={pctOfIncome(data.needEssential)} value={data.needEssential}
            barPct={pctOfIncome(data.needEssential)} color={C.need} base={base}
            targetPct={50} warn={pctOfIncome(data.needEssential) > 50}
          />
          <BreakdownRow
            icon="" name="Sở thích (linh hoạt)"
            pct={pctOfIncome(data.needFlexible)} value={data.needFlexible}
            barPct={pctOfIncome(data.needFlexible)} color={C.want} base={base}
            targetPct={30} warn={pctOfIncome(data.needFlexible) > 30}
          />
          <BreakdownRow
            icon="" name="Tiết kiệm"
            pct={pctOfIncome(savings)} value={savings}
            barPct={Math.max(pctOfIncome(savings), 0)} color={C.save} base={base}
            targetPct={20} warn={savings < income * 0.2}
          />
          {data.needUnclassified > 0 && (
            <BreakdownRow
              icon="" name="Chi chưa phân loại"
              pct={pctOfIncome(data.needUnclassified)} value={data.needUnclassified}
              barPct={pctOfIncome(data.needUnclassified)} color={C.unknown} base={base}
            />
          )}
        </div>
      )}

      {/* C2 — Cố định vs Biến đổi trên tổng chi (donut + thanh) */}
      <h3 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
        Cố định vs Biến đổi <span className="text-gray-400 dark:text-gray-500">(% chi tiêu)</span>
      </h3>
      {totalExpense <= 0 ? (
        <p className="rounded-lg bg-gray-50 px-3 py-3 text-center text-xs text-gray-500 dark:bg-gray-950 dark:text-gray-400">
          Chưa có chi tiêu trong {periodNoun}.
        </p>
      ) : (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div
            className="mx-auto h-36 w-36 shrink-0"
            role="img"
            aria-label={`Cố định ${pctOfExpense(data.costFixed).toFixed(0)}%, biến đổi ${pctOfExpense(data.costVariable).toFixed(0)}% trên tổng chi`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={c2Slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="60%"
                  outerRadius="100%"
                  isAnimationActive={!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches}
                  stroke="none"
                >
                  {c2Slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, n) => [formatMoney(v, base), n as string]}
                  contentStyle={{ fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2.5">
            <BreakdownRow
              icon="" name="Cố định"
              pct={pctOfExpense(data.costFixed)} value={data.costFixed}
              barPct={pctOfExpense(data.costFixed)} color={C.need} base={base}
            />
            <BreakdownRow
              icon="" name="Biến đổi"
              pct={pctOfExpense(data.costVariable)} value={data.costVariable}
              barPct={pctOfExpense(data.costVariable)} color={C.want} base={base}
            />
            {data.costUnclassified > 0 && (
              <BreakdownRow
                icon="" name="Chưa phân loại"
                pct={pctOfExpense(data.costUnclassified)} value={data.costUnclassified}
                barPct={pctOfExpense(data.costUnclassified)} color={C.unknown} base={base}
              />
            )}
          </div>
        </div>
      )}

      {/* Van xả khẩn cấp */}
      {data.emergencyCut > 0 ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          Cần cắt giảm gấp? Có thể cắt tối đa <b>{formatMoney(data.emergencyCut, base)}</b> trong{' '}
          {periodNoun} ở nhóm Linh hoạt × Biến đổi ({pctOfExpense(data.emergencyCut).toFixed(0)}% chi tiêu).
        </p>
      ) : (
        totalExpense > 0 && (
          <p className="mt-3 text-center text-xs text-gray-400 dark:text-gray-500">
            Phân loại chi tiêu để xem gợi ý cắt giảm khẩn cấp.
          </p>
        )
      )}
    </section>
  )
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS (component chưa được dùng — kiểm tra tsc/JSX hợp lệ).

- [ ] **Step 3: Commit**

```bash
git add src/features/reports/SpendClassificationCard.tsx
git commit -m "feat(bao-cao): card Co cau chi tieu (C1 thanh, C2 donut)"
```

---

### Task 5: Gắn card vào `ReportsPage` (tháng + năm)

**Files:**
- Modify: `src/features/reports/ReportsPage.tsx`

**Interfaces:**
- Consumes: `SpendClassificationCard` (Task 4), `classificationBreakdown` (Task 2), `sumIncomeExpense` (có sẵn), `breakdown`/`yearBreakdown` (có sẵn), `categories` (có sẵn).

- [ ] **Step 1: Import + tính dữ liệu tháng**

Trong `ReportsPage.tsx`, thêm import:

```ts
import { SpendClassificationCard } from './SpendClassificationCard'
import { classificationBreakdown } from './aggregate'
```

Bổ sung `classificationBreakdown` và `sumIncomeExpense` vào dòng import từ `./aggregate` đang có (gộp, không tạo import trùng).

Sau khối `breakdown = useMemo(...)` (chế độ tháng), thêm:

```ts
  const monthSums = useMemo(
    () => sumIncomeExpense(monthTxs, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, accounts, base, rates],
  )
  const monthClass = useMemo(
    () => classificationBreakdown(breakdown.slices, categories),
    [breakdown, categories],
  )
```

- [ ] **Step 2: Tính dữ liệu năm + số danh mục chưa phân loại**

Sau `yearBreakdown = useMemo(...)`, thêm:

```ts
  const yearClass = useMemo(
    () => classificationBreakdown(yearBreakdown.slices, categories),
    [yearBreakdown, categories],
  )
```

Thêm (đặt gần các biến dẫn xuất, ngoài mọi nhánh period):

```ts
  // Đếm danh mục Chi LÁ chưa phân loại (lá = không phải cha đang có con).
  const unclassifiedCount = useMemo(() => {
    const parentIds = new Set(categories.filter((c) => c.parent_id).map((c) => c.parent_id))
    return categories.filter(
      (c) =>
        c.type === 'expense' &&
        !c.is_archived &&
        !parentIds.has(c.id) && // không phải cha có con
        (c.need_level == null || c.cost_type == null),
    ).length
  }, [categories])
```

- [ ] **Step 3: Render card ở chế độ Tháng**

Trong nhánh `period === 'month' && view === 'charts'`, ngay sau `<CategoryBreakdownCard … />` và trước `<MonthlyBarsCard … />` (hoặc sau `MonthlyBarsCard` — đặt sau `CategoryBreakdownCard`):

```tsx
          <SpendClassificationCard
            data={monthClass}
            income={monthSums.income}
            base={base}
            periodNoun="tháng này"
            unclassifiedCount={unclassifiedCount}
          />
```

- [ ] **Step 4: Render card ở chế độ Năm**

Trong nhánh `period === 'year'`, sau `<CategoryBreakdownCard … />`:

```tsx
          <SpendClassificationCard
            data={yearClass}
            income={yearSums.income}
            base={base}
            periodNoun="năm này"
            unclassifiedCount={unclassifiedCount}
          />
```

(`yearSums` đã có sẵn trong file.)

- [ ] **Step 5: Build + kiểm tra trình duyệt**

Run: `npm run build`
Expected: PASS.

Sau đó mở dev server, vào `/reports`, xác nhận card "Cơ cấu chi tiêu" hiện ở cả Tháng và Năm; C1 có 3 thanh + vạch mục tiêu, C2 có donut. (Chi tiết verify ở Task 8.)

- [ ] **Step 6: Commit**

```bash
git add src/features/reports/ReportsPage.tsx
git commit -m "feat(bao-cao): gan card Co cau chi tieu vao thang va nam"
```

---

### Task 6: 2 control phân loại trong `CategoryForm`

**Files:**
- Modify: `src/features/categories/CategoriesPage.tsx` (component `CategoryForm`)

**Interfaces:**
- Consumes: `NewCategory.need_level`/`cost_type` (Task 1).

- [ ] **Step 1: State + import type**

Trong `CategoriesPage.tsx`, thêm `NeedLevel, CostType` vào import từ `../../types/database.types` (dòng đang import `CategoryRow, CategoryType`).

Trong `CategoryForm`, cạnh các `useState` khác:

```ts
  const [needLevel, setNeedLevel] = useState<NeedLevel | null>(category?.need_level ?? null)
  const [costType, setCostType] = useState<CostType | null>(category?.cost_type ?? null)
```

- [ ] **Step 2: Đưa vào payload khi lưu**

Trong `handleSubmit`, mở rộng `input`. Chỉ gắn nhãn cho danh mục Chi lá; ngược lại ghi `null` để dọn nhãn cũ nếu đổi loại:

```ts
      const isExpenseLeaf = effectiveType === 'expense' && !hasChildren
      const input: NewCategory = {
        name: name.trim(),
        type: effectiveType,
        icon,
        parent_id: hasChildren ? null : parentId,
        need_level: isExpenseLeaf ? needLevel : null,
        cost_type: isExpenseLeaf ? costType : null,
      }
```

- [ ] **Step 3: UI 2 nút gạt (chỉ danh mục Chi lá)**

Đặt ngay trước khối "Biểu tượng" (`<p className="mb-1.5 …">Biểu tượng</p>`). Dùng đúng mẫu segmented control 3 lựa chọn (kèm "Chưa"):

```tsx
        {effectiveType === 'expense' && !hasChildren && (
          <div className="mb-3 space-y-2">
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">Tính chất</p>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-200 p-1 dark:bg-gray-800">
                {([['essential', 'Thiết yếu'], ['flexible', 'Linh hoạt'], [null, 'Chưa']] as const).map(
                  ([val, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setNeedLevel(val)}
                      className={`rounded-lg py-1.5 text-xs font-medium transition ${
                        needLevel === val
                          ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">Loại chi</p>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-200 p-1 dark:bg-gray-800">
                {([['fixed', 'Cố định'], ['variable', 'Biến đổi'], [null, 'Chưa']] as const).map(
                  ([val, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setCostType(val)}
                      className={`rounded-lg py-1.5 text-xs font-medium transition ${
                        costType === val
                          ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>
        )}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/categories/CategoriesPage.tsx
git commit -m "feat(danh-muc): them control Thiet yeu/Linh hoat + Co dinh/Bien doi vao form"
```

---

### Task 7: Màn "Phân loại nhanh" + route + lối vào Cài đặt

**Files:**
- Create: `src/features/categories/ClassifyCategoriesPage.tsx`
- Modify: `src/App.tsx` (route), `src/features/settings/SettingsPage.tsx` (link)

**Interfaces:**
- Consumes: `useCategories`, `useUpdateCategory` (từ `../../hooks/queries` — đã dùng ở `CategoriesPage.tsx`).

- [ ] **Step 1: Tạo màn phân loại nhanh**

Tạo `src/features/categories/ClassifyCategoriesPage.tsx`:

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useCategories, useUpdateCategory } from '../../hooks/queries'
import type { CategoryRow, CostType, NeedLevel } from '../../types/database.types'

const NEED: [NeedLevel | null, string][] = [
  ['essential', 'Thiết yếu'],
  ['flexible', 'Linh hoạt'],
  [null, 'Chưa'],
]
const COST: [CostType | null, string][] = [
  ['fixed', 'Cố định'],
  ['variable', 'Biến đổi'],
  [null, 'Chưa'],
]

function Seg<T extends string | null>({
  options,
  value,
  onChange,
}: {
  options: [T, string][]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-200 p-0.5 dark:bg-gray-800">
      {options.map(([val, label]) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(val)}
          className={`min-h-9 rounded-md text-xs font-medium transition ${
            value === val
              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function ClassifyCategoriesPage() {
  const { data: categories = [] } = useCategories()
  const update = useUpdateCategory()
  const [onlyTodo, setOnlyTodo] = useState(false)

  const parentIds = new Set(categories.filter((c) => c.parent_id).map((c) => c.parent_id))
  const isLeaf = (c: CategoryRow) => !parentIds.has(c.id)
  const leaves = categories
    .filter((c) => c.type === 'expense' && !c.is_archived && isLeaf(c))
    .sort((a, b) => a.sort_order - b.sort_order)
  const rows = onlyTodo
    ? leaves.filter((c) => c.need_level == null || c.cost_type == null)
    : leaves
  const todoCount = leaves.filter((c) => c.need_level == null || c.cost_type == null).length

  return (
    <div className="p-3 lg:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/settings/categories"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white px-3 py-1.5 text-lg shadow-sm active:scale-95 dark:bg-gray-900"
          aria-label="Quay lại"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-bold text-gray-800 dark:text-gray-100">Phân loại chi tiêu</h1>
      </div>

      <p className="mb-3 rounded-xl bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
        Gán mỗi danh mục Chi vào <b>Thiết yếu/Linh hoạt</b> và <b>Cố định/Biến đổi</b> để xem cơ cấu
        chi tiêu ở Báo cáo. Thay đổi được lưu ngay.
      </p>

      <label className="mb-3 flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
        <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} />
        Chỉ hiện chưa phân loại ({todoCount})
      </label>

      <div className="flex flex-col gap-2">
        {rows.map((c) => (
          <div key={c.id} className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-900">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg">{c.icon}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                {c.name}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Seg
                options={NEED}
                value={c.need_level}
                onChange={(v) => update.mutate({ id: c.id, patch: { need_level: v } })}
              />
              <Seg
                options={COST}
                value={c.cost_type}
                onChange={(v) => update.mutate({ id: c.id, patch: { cost_type: v } })}
              />
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="rounded-xl bg-white px-3 py-6 text-center text-sm text-gray-500 shadow-sm dark:bg-gray-900 dark:text-gray-400">
            {onlyTodo ? 'Đã phân loại hết 🎉' : 'Chưa có danh mục Chi'}
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Thêm route (lazy) trong `App.tsx`**

Thêm khai báo lazy (cạnh `CategoriesPage`):

```tsx
const ClassifyCategoriesPage = lazy(() =>
  import('./features/categories/ClassifyCategoriesPage').then((m) => ({
    default: m.ClassifyCategoriesPage,
  })),
)
```

Thêm Route (ngay dưới dòng `/settings/categories`):

```tsx
          <Route
            path="/settings/categories/classify"
            element={lazyRoute(<ClassifyCategoriesPage />)}
          />
```

- [ ] **Step 3: Lối vào trong `SettingsPage.tsx`**

Sau khối `<Link to="/settings/categories">…Danh mục…</Link>`, thêm một Link mới (dùng icon đã import; nếu chưa có icon phù hợp, dùng `Tags` sẵn có hoặc thêm `Scale`/`PieChart` từ `lucide-react` vào import ở đầu file):

```tsx
          <Link
            to="/settings/categories/classify"
            className="flex items-center gap-3 px-3 py-3 text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            <Scale className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <span className="flex-1">Phân loại chi tiêu</span>
            <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600" />
          </Link>
```

Thêm `Scale` vào import `lucide-react` ở đầu `SettingsPage.tsx`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/categories/ClassifyCategoriesPage.tsx src/App.tsx src/features/settings/SettingsPage.tsx
git commit -m "feat(danh-muc): man Phan loai nhanh + route + loi vao Cai dat"
```

---

### Task 8: Nhãn mẫu cho demo + verify end-to-end

**Files:**
- Modify: `src/data/demoRepo.ts`

> Factory `category()` đã nhận 2 tham số optional `need_level`/`cost_type` từ Task 1
> Step 4. Task này chỉ truyền giá trị vào các dòng danh mục demo.

- [ ] **Step 1: Gán nhãn cho vài danh mục con demo**

Sửa các dòng con (trong mảng `categories`) để mang nhãn mẫu — đủ để card có dữ liệu ở cả 2 trục. Ví dụ (giữ nguyên các dòng khác):

```ts
    category('Tiền nhà', 'expense', '🔑', nhaO.id, 'essential', 'fixed'),
    category('Điện', 'expense', '💡', nhaO.id, 'essential', 'variable'),
    category('Bữa trưa', 'expense', '🍱', anUong.id, 'essential', 'variable'),
    category('Ăn ngoài', 'expense', '🍽️', anUong.id, 'flexible', 'variable'),
    category('Đi chợ', 'expense', '🛒', anUong.id, 'essential', 'variable'),
    category('Tàu điện', 'expense', '🚉', diLai.id, 'essential', 'variable'),
    category('Quần áo', 'expense', '👕', thoiTrang.id, 'flexible', 'variable'),
    category('Đăng ký', 'expense', '📺', soThich.id, 'flexible', 'fixed'),
    category('Thuốc', 'expense', '💊', sucKhoe.id, 'essential', 'variable'),
```

(Các dòng này đã tồn tại — chỉ thêm 2 tham số cuối. Danh mục demo khác để null = "chưa phân loại", giúp thấy cả nhóm Chưa phân loại + link nhắc.)

- [ ] **Step 2: Build + test toàn bộ**

Run: `npm run build && npm test`
Expected: PASS toàn bộ.

- [ ] **Step 3: Verify trong trình duyệt (demo mode)**

Khởi động dev server (qua preview_start theo `.claude/launch.json`, KHÔNG dùng Bash). Kiểm:
1. `/reports` (Tháng): card "Cơ cấu chi tiêu" hiện; C1 3 thanh + vạch mục tiêu 50/30/20; C2 donut + thanh; dòng "van xả khẩn cấp" có số; link "Phân loại N danh mục".
2. Chuyển sang Năm: card vẫn hiện, dùng số liệu năm.
3. `/settings` → "Phân loại chi tiêu" → màn liệt kê danh mục Chi lá; đổi 1 toggle → lưu ngay; bật "Chỉ hiện chưa phân loại" lọc đúng.
4. `/settings/categories` → sửa 1 danh mục Chi lá → thấy 2 control; sửa danh mục Thu → KHÔNG thấy control.
5. Dark mode: bật chế độ tối, kiểm tương phản chữ/thanh/donut.
6. Console/log không có lỗi (read_console_messages).

Chụp screenshot card làm bằng chứng.

- [ ] **Step 4: Commit**

```bash
git add src/data/demoRepo.ts
git commit -m "feat(demo): nhan mau phan loai chi tieu cho du lieu demo"
```

---

## Self-Review

**Spec coverage:**
- Data model 2 cột nullable → Task 1 ✅
- Backfill nhãn mặc định + trigger người mới → Task 1 ✅
- Hàm thuần `classificationBreakdown` + test → Task 2 ✅
- C1 thanh có vạch mục tiêu (targetPct) → Task 3 (prop) + Task 4 (dùng) ✅
- C2 donut Recharts → Task 4 ✅
- Van xả khẩn cấp + nhắc phân loại → Task 4 ✅
- Ca biên income=0, Chi>Thu → Task 4 (nhánh `income<=0`, savings âm) ✅
- Gắn card tháng + năm, truyền income → Task 5 ✅
- 2 control trong CategoryForm (chỉ Chi lá) → Task 6 ✅
- Màn Phân loại nhanh + route + Cài đặt → Task 7 ✅
- Demo mode có nhãn → Task 8 ✅

**Type consistency:** `need_level: NeedLevel | null`, `cost_type: CostType | null` nhất quán ở CategoryRow (Task 1), test helper (Task 2), form state (Task 6), classify page (Task 7), demo factory (Task 8). `ClassificationBreakdown` field names khớp giữa Task 2 (định nghĩa) và Task 4 (tiêu thụ). `classificationBreakdown(slices, categories)` khớp chữ ký ở Task 2 và lời gọi ở Task 5.

**Placeholder scan:** không có TBD/TODO; mọi step code có khối code thật.

**Lưu ý thực thi:** Task 1 đã bao gồm việc cập nhật factory `category()` ở `demoRepo.ts`, nên **mọi task đều build xanh** khi làm tuần tự 1 → 8. Task 8 chỉ truyền nhãn mẫu vào dữ liệu demo và verify end-to-end.

**Sau khi xong toàn bộ:** áp `supabase/migrations/0025_expense_classification.sql` lên Supabase thật (giống các migration 0012+), nếu không bản deploy sẽ lỗi đọc cột.
