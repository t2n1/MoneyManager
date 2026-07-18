# Design: Chức năng Nợ / cho vay (backlog mục F)

> **Ngày:** 2026-07-19 · **Trạng thái:** đã chốt, đang cài đặt.
> Bám luồng **Cụm 2 (Tài sản & Nợ)** trong [`data-model-matrix.md`](../../data-model-matrix.md).

## Mục tiêu

Theo dõi khoản **nợ / cho vay** với người/đơn vị ngoài hệ thống tài khoản (bạn bè,
công ty): mỗi khoản có đối tác, chiều, số tiền gốc, hạn, trạng thái, và **lịch sử trả
từng phần**. Xem được "tài sản ròng" = tài sản gộp ± nợ.

## Quyết định đã chốt (người dùng duyệt 2026-07-19)

1. **Trả nợ đầy đủ.** Mỗi lần ghi nhận trả có thể sinh **1 giao dịch thật** (đổi số dư
   tài khoản), và `debt_payments.transaction_id` trỏ tới giao dịch đó. Vẫn cho phép
   **ghi nhận suông** (không chuyển tiền → `transaction_id = null`, số dư không đổi).
2. **Tài sản ròng** hiển thị ngay trên trang Tài sản (tách rõ tài sản gộp vs ròng).
3. **Vị trí:** mục "Nợ / cho vay" trong trang **Cài đặt** (`/settings/debts`), không
   thêm tab thứ 5 ở mobile.

## Nguyên tắc bám khung (data-model-matrix)

- **Nợ KHÔNG tự đổi số dư tài khoản.** Mọi biến động số dư luôn là **1 dòng
  `transactions`** đi qua đúng `Repo.createTransaction` (0.1). `debt_payments` chỉ *trỏ
  tới* giao dịch đó.
- Tiền lưu **minor units `bigint`** theo **currency của khoản nợ** (0.2). Quy đổi base
  chỉ khi hiển thị/tổng hợp, qua `convertToBase` (0.3).
- Mọi bảng có `user_id`, RLS `"own rows"`, composite `unique(id, user_id)` (0.5).

## Schema (migration `0007_debts.sql`)

### `debts`
| Cột | Kiểu / ý nghĩa |
|-----|----------------|
| `id` | uuid pk |
| `user_id` | uuid → auth.users, cascade |
| `counterparty` | text — tên người/đơn vị |
| `direction` | `i_owe` (mình nợ) \| `owed_to_me` (người ta nợ mình) |
| `currency` | ISO 4217 — tệ của khoản nợ |
| `principal` | bigint > 0 — số gốc (minor units theo `currency`) |
| `due_on` | date null — hạn |
| `status` | `open` \| `settled` (mặc định `open`) |
| `note` | text default '' |
| `created_at`, `updated_at` | timestamptz; trigger `moddatetime` |
| | `unique (id, user_id)` cho composite FK từ payments |

### `debt_payments`
| Cột | Kiểu / ý nghĩa |
|-----|----------------|
| `id` | uuid pk |
| `user_id` | uuid → auth.users, cascade |
| `debt_id` | uuid — FK `(debt_id, user_id) → debts(id, user_id)` **on delete cascade** |
| `amount` | bigint > 0 — minor units theo **tệ của khoản nợ** |
| `paid_on` | date default current_date |
| `transaction_id` | uuid null — FK `→ transactions(id)` **on delete set null**; giao dịch thật nếu có chuyển tiền, null nếu ghi nhận suông |
| `note` | text default '' |
| `created_at` | timestamptz |

**Vì sao `transaction_id` là FK đơn cột + set null** (khác mẫu composite của dự án):
composite FK không cho `on delete set null` (vì `user_id` NOT NULL). Ưu tiên: xóa 1
giao dịch ở sổ **không** làm hỏng lịch sử nợ. Chống tham chiếu chéo user vẫn đảm bảo
bởi RLS trên `debt_payments` + app chỉ gán `transaction_id` là giao dịch vừa tạo của
chính user. Khi xóa payment, app tự xóa luôn giao dịch liên kết (repo lo).

## Luồng "ghi nhận trả nợ"

Sheet trả nợ: **số tiền** (tệ khoản nợ), **ngày**, ghi chú, và công tắc **"Có chuyển
tiền thật"** (mặc định bật):

- **Bật:** chọn **tài khoản** (chỉ hiện tài khoản **cùng loại tiền** với khoản nợ — v1
  tránh xuyên tệ) + **danh mục**. Tạo `transactions`:
  - `i_owe` (mình trả người ta) → `type='expense'`, tiền ra khỏi tài khoản.
  - `owed_to_me` (người ta trả mình) → `type='income'`, tiền vào tài khoản.
  - `amount` giao dịch = `amount` payment (cùng tệ vì đã ép cùng loại tiền).
  Sau đó insert `debt_payments` với `transaction_id` = id giao dịch vừa tạo.
- **Tắt:** chỉ insert `debt_payments` (transaction_id null). Không đụng số dư.

**Còn nợ** (remaining) = `principal − Σ payments.amount` (tệ khoản nợ). Trả đủ
(remaining ≤ 0) → gợi ý đánh dấu `settled`; vẫn cho đánh dấu tay.

## Tài sản ròng (trang Tài sản)

Helper thuần `debtSummary(debts, payments, base, rates)`:
- Chỉ tính khoản `status='open'` còn `remaining > 0`.
- `iOwe` = Σ convertToBase(remaining, debt.currency) của `i_owe`.
- `owedToMe` = Σ convertToBase(remaining) của `owed_to_me`.
- `net = owedToMe − iOwe`; `hasMissingRate` khi thiếu tỷ giá.

Trang Tài sản thêm khối "Tài sản ròng" = `Tổng tài sản gộp + net`, kèm 2 dòng phân rã
(− Nợ phải trả / + Cho vay). Chỉ hiện khi có khoản nợ mở. Cảnh báo thiếu tỷ giá như
phần tài sản.

## Repo (cài **cả 2** demoRepo + supabaseRepo)

- `getDebts()`, `getDebtPayments()` (tất cả payment của user)
- `createDebt(NewDebt)`, `updateDebt(id, DebtPatch)`, `deleteDebt(id)` — xóa debt cũng
  xóa các giao dịch liên kết của payment (app lo), payments tự cascade (DB).
- `createDebtPayment(NewDebtPayment)` — nếu kèm `transaction` thì tạo giao dịch trước
  rồi payment trỏ tới; `deleteDebtPayment(id)` — xóa luôn giao dịch liên kết nếu có.

## Ngoài phạm vi v1

Lãi suất; trả nợ **xuyên tệ** (tài khoản khác loại tiền với khoản nợ); nhắc hạn
(notification). Ghi nhận suông vẫn dùng được cho trường hợp xuyên tệ.
