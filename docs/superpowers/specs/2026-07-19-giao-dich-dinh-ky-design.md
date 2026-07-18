# Design: Giao dịch định kỳ (backlog mục C + D + GĐ3 mục 2)

> **Ngày:** 2026-07-19 · **Trạng thái:** đã chốt, chờ implementation plan.
> Gộp 3 mục thành 1 tính năng: khoản chi/thu định kỳ (C), chuyển khoản định kỳ (D),
> giao dịch định kỳ GĐ3 mục 2 — làm một lần cho cả 3 loại giao dịch.

## Mục tiêu

Giao dịch **lặp tự động** theo chu kỳ tuần / tháng / năm (tiền nhà, lương, thuê bao,
chuyển tiết kiệm định kỳ…). Không có backend riêng nên app **catch-up khi mở**: các kỳ
đến hạn kể từ lần mở trước được sinh thành **giao dịch thật** trong bảng `transactions`.

## Quyết định đã chốt (người dùng duyệt 2026-07-19)

1. **Nơi tạo/quản lý rule — cả hai:** màn Nhập có tùy chọn "Lặp lại" (tạo rule nhanh
   từ giao dịch đang nhập); màn quản lý riêng `/settings/recurring` để xem/sửa/tạm
   dừng/xóa.
2. **Tự sinh + toast:** mở app là tự tạo giao dịch cho mọi kỳ đến hạn, toast
   "Đã tạo N giao dịch định kỳ". Sai thì sửa/xóa như giao dịch thường.
3. **Sinh bù tất cả kỳ lỡ:** lâu không mở app vẫn sinh đủ mọi kỳ, `occurred_on` =
   đúng ngày đến hạn quá khứ — báo cáo/ngân sách các tháng trước đầy đủ.
4. **Kết thúc:** rule chạy vô hạn mặc định; có **tạm dừng** (`is_paused`) và **ngày
   kết thúc** tùy chọn (`end_on`). Không có "lặp N lần" ở v1.
5. **Liên kết rule ↔ giao dịch (phương án A):** cột `recurring_rule_id` trên
   `transactions` + **partial unique index** `(recurring_rule_id, occurred_on)` —
   chống sinh trùng ở tầng DB khi 2 thiết bị cùng catch-up; sổ giao dịch hiện badge 🔁.

## Nguyên tắc bám khung

- Mọi biến động số dư là **1 dòng `transactions`**; rule chỉ là "khuôn" sinh giao dịch.
- Tiền lưu **minor units `bigint`** theo currency tài khoản nguồn; `to_amount` cho
  chuyển khoản xuyên tệ — y hệt hình dạng `transactions`.
- Mọi bảng có `user_id`, RLS `"own rows"`, `unique (id, user_id)` cho composite FK.
- Cài **cả 2 repo** (demoRepo + supabaseRepo) qua interface `Repo`.
- Định kỳ dùng **ngày dương lịch thuần**, không liên quan `month_start_day` (tiền nhà
  ngày 25 là ngày 25 thật, bất kể tháng tài chính bắt đầu ngày nào).

## Schema (migration `0008_recurring_rules.sql`)

### `recurring_rules`

| Cột | Kiểu / ý nghĩa |
|-----|----------------|
| `id` | uuid pk |
| `user_id` | uuid → auth.users, cascade |
| `type` | `expense` \| `income` \| `transfer` |
| `amount` | bigint > 0 — minor units theo currency tài khoản nguồn |
| `to_amount` | bigint > 0 null — CK xuyên tệ (minor units tài khoản đích); null = cùng tệ |
| `category_id` | uuid null — composite FK `(category_id, user_id)` |
| `account_id` | uuid — composite FK |
| `to_account_id` | uuid null — composite FK |
| `note` | text default '' — chép vào giao dịch sinh ra |
| `frequency` | `weekly` \| `monthly` \| `yearly` |
| `start_on` | date — kỳ đến hạn **đầu tiên**; anchor cho ngày-trong-tháng / thứ-trong-tuần |
| `end_on` | date null — null = vô hạn; kỳ đến hạn > `end_on` không sinh |
| `is_paused` | boolean default false |
| `last_generated_on` | date null — kỳ đến hạn cuối đã sinh; null = chưa sinh kỳ nào |
| `created_at`, `updated_at` | timestamptz; trigger `moddatetime` |
| | `unique (id, user_id)`; check constraint "hình dạng theo type" y hệt `transactions` (transfer có `to_account_id` khác nguồn + không category; expense/income có category + không đích) |

### `transactions` (thêm cột)

- `recurring_rule_id uuid null` — FK đơn cột → `recurring_rules(id)` **on delete set
  null** (xóa rule giữ nguyên giao dịch cũ, chỉ mất liên kết; cùng lý do với
  `debt_payments.transaction_id` — composite FK không cho set null).
- **Partial unique index** `create unique index ... on transactions
  (recurring_rule_id, occurred_on) where recurring_rule_id is not null` — mỗi rule mỗi
  ngày đến hạn chỉ có 1 giao dịch, kể cả khi 2 thiết bị catch-up song song.

## Toán ngày (`src/lib/recurring.ts` — pure functions, test được)

- `weekly`: kỳ sau = kỳ trước + 7 ngày.
- `monthly`: cùng ngày-trong-tháng với `start_on`, **clamp về cuối tháng** khi tháng
  ngắn hơn (anchor 31 → 28/2 → quay lại 31/3; tính từ anchor, không trôi dần).
- `yearly`: cùng ngày+tháng năm sau; anchor 29/2 → 28/2 năm thường.
- Hàm chính: `listDueDates(rule, todayISO)` → mảng ngày đến hạn từ sau
  `last_generated_on` (hoặc từ `start_on` nếu null) đến hôm nay (ngày local), cắt tại
  `end_on`. Rule paused → mảng rỗng.

## Engine catch-up (`runRecurringCatchUp(repo)` trong `lib/recurring.ts`)

Chạy **một lần khi mở app** (mount `AppLayout`, sau auth), dùng chung cho cả 2 repo:

1. `listRecurringRules()` → với mỗi rule active, `listDueDates(rule, today)`.
2. Mỗi ngày đến hạn → tạo giao dịch thật (`recurring_rule_id` = rule, `occurred_on` =
   ngày đến hạn, amount/category/account/note chép từ rule). Gặp **trùng** (thiết bị
   khác đã sinh — vướng unique index) → bỏ qua im lặng, đếm riêng.
3. Xong mỗi rule → `updateRecurringRule` cập nhật `last_generated_on` = kỳ cuối.
4. Trả về tổng số giao dịch đã tạo; N > 0 → toast "Đã tạo N giao dịch định kỳ" +
   invalidate query giao dịch/số dư.

**Ngữ nghĩa sửa/xóa:**

- Sửa rule (số tiền, danh mục…) chỉ ảnh hưởng kỳ **tương lai**; giao dịch đã sinh
  không đổi.
- Sửa `start_on`/`frequency` của rule đã chạy: kỳ tới tính từ anchor mới nhưng chỉ
  sinh sau `last_generated_on` — không sinh bù lùi về trước đó.
- Xóa giao dịch đã sinh → không sinh lại (engine đi theo `last_generated_on`).
- Xóa rule → giao dịch cũ giữ nguyên (`recurring_rule_id` set null, mất badge).
- Sửa/xóa giao dịch đã sinh không đụng rule.

## Repo (cài **cả 2** demoRepo + supabaseRepo)

- `listRecurringRules(): RecurringRuleRow[]`
- `createRecurringRule(NewRecurringRule)`, `updateRecurringRule(id, patch)` (gồm
  `is_paused`, `end_on`, `last_generated_on`…), `deleteRecurringRule(id)`
- `insertRecurringOccurrence(input): Promise<boolean>` — method sinh kỳ cho engine:
  nhận `NewTransaction` kèm `recurring_rule_id` + `occurred_on`, trả `true` = đã tạo,
  `false` = trùng bỏ qua (supabase: bắt lỗi 23505; demo: tự kiểm tra trước khi ghi).

## UI

1. **Màn Nhập (`TransactionForm`):** hàng tùy chọn **"Lặp lại"** — `Không / Hàng tuần
   / Hàng tháng / Hàng năm` (mặc định Không), gần ô ngày; áp dụng cho cả 3 loại giao
   dịch. Chọn lặp + Lưu → tạo **rule** (`start_on` = ngày trên form, các trường chép
   từ form) rồi chạy ngay catch-up — kỳ đầu (nếu đã đến hạn) sinh qua đúng một đường
   engine, không có code tạo giao dịch riêng. Toast "Đã tạo quy tắc định kỳ ✓". Ngày
   tương lai → chỉ tạo rule, kỳ đầu sinh khi đến hạn.
2. **Màn quản lý `/settings/recurring`** ("Giao dịch định kỳ", lazy-load, mục mới
   trong Cài đặt cạnh Nợ/cho vay): danh sách rule — icon danh mục (⇄ cho transfer),
   ghi chú, số tiền theo currency tài khoản, nhãn chu kỳ ("Hàng tháng · ngày 25"),
   **kỳ tới**, trạng thái (paused mờ; quá `end_on` → "Đã kết thúc"). Nút thêm → form
   sheet (pattern `DebtFormSheet`): loại, tài khoản (+ đích và `to_amount` nếu
   transfer xuyên tệ), danh mục, số tiền, ghi chú, chu kỳ, ngày bắt đầu, ngày kết
   thúc tùy chọn. Mỗi rule: sửa, switch bật/tạm dừng, xóa (confirm nói rõ giao dịch
   đã sinh được giữ).
3. **Sổ giao dịch (`TransactionItem`):** giao dịch có `recurring_rule_id` hiện badge
   🔁 nhỏ; sửa/xóa như giao dịch thường.
4. **Toast catch-up:** ở `AppLayout`, một lần sau auth.

## Kiểm thử (vitest, pattern `dates.test.ts`)

- Pure functions: kỳ tiếp theo weekly/monthly/yearly; clamp 31 → 28/2 → 31/3; 29/2
  năm nhuận; danh sách kỳ lỡ nhiều tháng; `end_on`; `is_paused`.
- Engine với repo giả in-memory: sinh đủ kỳ lỡ, bỏ qua trùng, cập nhật
  `last_generated_on`, không sinh khi paused/hết hạn/`start_on` tương lai.
- `npm run build` + `npm run lint` + `npm test` sạch; commit message không dấu.

## Ngoài phạm vi v1

Chu kỳ tùy chỉnh ("mỗi 2 tuần", "ngày làm việc cuối tháng"); "lặp N lần rồi dừng";
nhắc **trước** kỳ đến hạn (backlog AN); đề xuất tạo rule từ radar phát hiện khoản
định kỳ (backlog T); sinh giao dịch **tương lai** trước hạn.
