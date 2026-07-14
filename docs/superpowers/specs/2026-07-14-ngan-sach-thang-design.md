# Design: Ngân sách tháng (GĐ3 — mục 1)

**Ngày:** 2026-07-14 · **Trạng thái:** Chờ duyệt

## 1. Mục tiêu & phạm vi

Cho phép người dùng đặt **hạn mức chi theo danh mục cho từng tháng**, theo dõi tiến độ
qua progress bar và được cảnh báo khi sắp/đã vượt. Đây là mục 1 của Giai đoạn 3.

**Trong phạm vi:**
- Bảng `budgets` + migration `0002` + cập nhật `demoRepo`, `supabaseRepo`, types thủ công.
- Đặt/sửa/xóa hạn mức cho **danh mục chi** (`expense`) theo tháng.
- Progress bar đổi màu theo mức dùng; cảnh báo ≥80% và ≥100%.
- Chép hạn mức từ tháng trước; dòng tổng ngân sách; cảnh báo ở màn khác (Nhập/Tổng quan).

**Ngoài phạm vi:** ngân sách cho danh mục thu; ngân sách "cuốn chiếu" (rollover số dư
chưa dùng sang tháng sau); ngân sách theo tuần/năm.

## 2. Quyết định thiết kế (đã chốt với người dùng)

| # | Quyết định | Lựa chọn |
|---|-----------|----------|
| 1 | Tiền tệ của hạn mức | Lưu theo **base currency** (`profiles.base_currency`, mặc định JPY), minor units `bigint`. "Đã chi" = tổng chi danh mục trong tháng **quy đổi về base** qua `convertToBase`. Nhất quán với báo cáo. *Loại phương án hạn mức theo từng loại tiền*: danh mục không gắn tiền tệ, giao dịch hỗn hợp loại tiền → không có 1 con số hạn mức tự nhiên |
| 2 | Vị trí UI | **Tab con trong màn Báo cáo** (segmented control `Biểu đồ` \| `Ngân sách`). Tái dùng header chọn tháng + logic quy đổi. Không thêm tab thứ 5 vào bottom bar (giữ 4 tab gọn ở 375px) |
| 3 | Phạm vi danh mục | Chỉ **danh mục chi** (`expense`). Danh mục thu không có hạn mức |
| 4 | Tiện ích | Có: (a) nút **chép hạn mức tháng trước**, (b) **dòng tổng** hạn mức vs đã chi, (c) **cảnh báo ở màn khác** (badge khi có danh mục vượt 100% trong tháng hiện tại) |
| 5 | Migration | File **mới** `0002_budgets.sql` (không sửa `0001`) — lịch sử migration rõ ràng, an toàn nếu sau này 0001 đã deploy |
| 6 | Khóa tháng | `month_key` dạng chuỗi `"YYYY-MM"` sinh từ `MonthKey` (tôn trọng `month_start_day` qua `monthKeyForDate`) |
| 7 | Ngưỡng cảnh báo | `ok` < 80%, `warn` ≥ 80% (vàng), `over` ≥ 100% (đỏ) |

## 3. Database schema

Migration mới `supabase/migrations/0002_budgets.sql`:

```sql
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null,
  -- "YYYY-MM" theo MonthKey (tôn trọng month_start_day). VD: '2026-07'
  month_key text not null check (month_key ~ '^\d{4}-\d{2}$'),
  -- Minor units theo base_currency (JPY = yên). Không bao giờ dùng float.
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite FK: chặn tham chiếu danh mục của user khác
  foreign key (category_id, user_id) references public.categories (id, user_id),
  -- Một danh mục chỉ có 1 hạn mức cho mỗi tháng → upsert theo khóa này
  unique (user_id, category_id, month_key)
);

create index idx_budget_user_month on public.budgets (user_id, month_key);

alter table public.budgets enable row level security;

create policy "own rows" on public.budgets
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger set_updated_at
  before update on public.budgets
  for each row
  execute function extensions.moddatetime (updated_at);
```

## 4. Types (cập nhật `src/types/database.types.ts` thủ công)

```ts
export type BudgetRow = {
  id: string
  user_id: string
  category_id: string
  month_key: string        // "YYYY-MM"
  amount: number           // minor units theo base_currency
  created_at: string
  updated_at: string
}
```
Thêm `budgets` vào `Database['public']['Tables']` với `Row` / `Insert` / `Update` như
các bảng khác (`Insert`: bắt buộc `user_id | category_id | month_key | amount`).

## 5. Data layer (`src/data/repo.ts` + 2 hiện thực)

Bổ sung vào interface `Repo`:

```ts
listBudgets(monthKey: string): Promise<BudgetRow[]>
/** Tạo mới hoặc cập nhật hạn mức (unique user_id+category_id+month_key). */
upsertBudget(categoryId: string, monthKey: string, amount: number): Promise<BudgetRow>
deleteBudget(id: string): Promise<void>
/** Chép mọi hạn mức từ tháng liền trước vào monthKey; bỏ qua danh mục đã có hạn mức
 *  ở tháng đích. Trả về số hạn mức đã chép. */
copyBudgetsFromPreviousMonth(monthKey: string): Promise<number>
```

- **demoRepo:** thêm mảng `budgets: BudgetRow[]` vào `DemoDB` (bump `STORAGE_KEY` → `v3`),
  seed vài hạn mức mẫu cho tháng hiện tại (VD Ăn uống, Đi lại) để UI có số liệu.
  `upsertBudget` tìm theo `(category_id, month_key)`; `copyBudgetsFromPreviousMonth`
  dùng `monthKeyForDate`/`addMonths` để suy tháng trước.
- **supabaseRepo:** `listBudgets` → `eq('month_key', ...)`; `upsertBudget` →
  `.upsert(..., { onConflict: 'user_id,category_id,month_key' })`; `copyBudgets...` đọc
  tháng trước rồi upsert từng dòng chưa tồn tại ở tháng đích.

## 6. Helper thuần (TDD) — `src/features/budgets/progress.ts`

Thuần, không phụ thuộc React → unit-test bằng Vitest trước khi viết UI.

```ts
export type BudgetStatus = 'ok' | 'warn' | 'over'   // <80% / ≥80% / ≥100%

export interface BudgetLine {
  categoryId: string
  budgeted: number     // minor units base
  spent: number        // minor units base (đã quy đổi)
  ratio: number        // spent / budgeted (0 nếu budgeted = 0)
  status: BudgetStatus
}

export interface BudgetReport {
  lines: BudgetLine[]        // sắp theo ratio giảm dần
  totalBudgeted: number
  totalSpent: number
  totalStatus: BudgetStatus
  overCount: number          // số danh mục 'over'
  hasMissingRate: boolean    // có chi ngoại tệ chưa quy đổi được
}

export function buildBudgetReport(
  budgets: BudgetRow[],
  monthTxs: TransactionRow[],
  currencyOf: CurrencyOf,     // tái dùng type từ reports/aggregate
  base: CurrencyCode,
  rates: Rates,
): BudgetReport
```

- "Đã chi" mỗi danh mục = tổng `expense` của danh mục đó trong `monthTxs`, quy đổi base
  qua `convertToBase` (như `categoryBreakdown`). Chi ngoại tệ thiếu tỷ giá → bỏ qua +
  bật `hasMissingRate`.
- Ngưỡng: `status(ratio)` = `over` nếu ≥1, `warn` nếu ≥0.8, còn lại `ok`.
- Helper `monthKeyString(key: MonthKey): string` → `"YYYY-MM"` (thêm vào `lib/dates.ts`,
  test kèm).

**Ca kiểm thử:** budgeted=0/không có; spent=0; đúng biên 79%/80%/100%/101%; chi đa
tiền tệ có/không đủ tỷ giá; tổng gộp nhiều danh mục; danh mục có hạn mức nhưng 0 chi.

## 7. Hooks (`src/hooks/queries.ts`)

- `useBudgets(monthKey)` — query key `['budgets', monthKey]`.
- `useUpsertBudget()`, `useDeleteBudget()`, `useCopyBudgetsFromPreviousMonth()` —
  invalidate `['budgets']`.
- `useBudgetReport(monthKey)` — kết hợp `useBudgets`, `useMonthTransactions`,
  `useAccounts` (map `currencyOf`), `useRates` → gọi `buildBudgetReport`. Dùng cho tab
  Ngân sách và cho badge cảnh báo.

## 8. UI

**Màn Báo cáo** ([ReportsPage.tsx](../../../src/features/reports/ReportsPage.tsx)) thêm
segmented control trên đầu: `Biểu đồ` | `Ngân sách`. Header chọn tháng (`←/→`) dùng
chung cho cả hai; giữ nguyên lazy-load Recharts (tab Ngân sách không kéo Recharts).

**Tab Ngân sách** (`features/budgets/BudgetPage.tsx`):
- **Dòng tổng** trên cùng: tổng hạn mức vs tổng đã chi + progress bar tổng (màu theo
  `totalStatus`), số danh mục vượt.
- Danh sách **danh mục chi**: mỗi dòng có icon + tên, progress bar (xanh `ok` / vàng
  `warn` / đỏ `over`), "đã chi / hạn mức" + `%`. Danh mục chưa đặt hạn mức gom cuối,
  nút "Đặt hạn mức".
- Chạm dòng → sheet nhập hạn mức (`parseMoney` theo base currency; xóa hạn mức = đặt
  trống/nút xóa).
- Nút **"Chép hạn mức tháng trước"** luôn hiện; chỉ **bổ sung** hạn mức cho danh mục
  chưa đặt ở tháng này (KHÔNG ghi đè danh mục đã có), khớp `copyBudgetsFromPreviousMonth`;
  toast báo số dòng đã chép (0 nếu không có gì để chép).
- Khi `hasMissingRate`: banner nhắc "thiếu tỷ giá, một số chi ngoại tệ chưa tính".

**Cảnh báo ở màn khác:** hook nhẹ `useBudgetAlert()` (dựa `useBudgetReport` của tháng
hiện tại) trả `overCount`. Màn Nhập ([EntryPage.tsx](../../../src/features/transactions/EntryPage.tsx))
và/hoặc thanh tổng quan hiện badge kín đáo "⚠️ N danh mục vượt ngân sách", chạm vào →
điều hướng tới tab Ngân sách. Không chặn thao tác nhập.

## 9. Kiểm thử & xác minh

- **Vitest:** `buildBudgetReport` (mọi ca ở mục 6) + `monthKeyString`.
- `npm run build` + `npm run lint` + `npm test` sạch.
- **Demo mode (Browser pane, 375px):** đặt hạn mức → progress bar đúng màu; vượt 80%/100%
  đổi màu; chép tháng trước tạo đúng số dòng; badge cảnh báo hiện ở màn Nhập khi có danh
  mục vượt; đổi tháng `←/→` thấy hạn mức theo từng tháng; tab Ngân sách không tải Recharts.
- Đối chiếu "đã chi" với tổng giao dịch chi thủ công của danh mục trong tháng.
- Verify bằng `get_page_text`/`read_page`/`javascript_tool` (screenshot hay timeout).

## 10. Lộ trình các mục GĐ3 còn lại (tham khảo)

Thứ tự đề xuất sau mục 1: mục 3 (CSV) → mục 5 (UI month_start_day) → mục 4 (dark mode)
→ mục 2 (giao dịch định kỳ, phức tạp nhất, làm cuối). Mỗi mục có spec/plan riêng khi tới.
