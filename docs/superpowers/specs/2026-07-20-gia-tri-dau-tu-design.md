# Design: Cập nhật giá trị tài sản đầu tư (backlog mục AE)

> **Ngày:** 2026-07-20 · **Trạng thái:** đã chốt & cài đặt (migration `0016`).
> Bám luồng **Cụm "tài sản"** trong [`data-model-matrix.md`](../../data-model-matrix.md)
> (cùng nhóm với AD mục tiêu, AF lịch sử net worth). Liên quan backlog mục **X**
> (chỉnh số dư ngoài dòng tiền) — cùng khái niệm nhưng KHÔNG gộp (xem "Vì sao bảng riêng").

## Vấn đề

Số dư mọi tài khoản = `initial_balance + Σ giao dịch` (view `account_balances`). Với
tài khoản đầu tư (quỹ, cổ phiếu, lướt sóng, vàng, crypto) con số này là **vốn gốc ròng
đã bỏ vào** (nạp − rút), **không** phản ánh **giá thị trường** lên xuống. Người dùng
muốn Tổng tài sản / Tài sản ròng phản ánh đúng giá trị thị trường hiện tại.

## Quyết định đã chốt (người dùng duyệt 2026-07-20)

1. **Loại tài khoản mới `investment`.** Thêm vào danh sách `accounts.type` (như cách
   `card` được thêm ở 0009). Chỉ tài khoản loại này mới có nút "Cập nhật giá trị". Là
   **tài sản** (số dư dương, cộng vào Tổng tài sản như cash/bank) — KHÔNG special-case
   tách riêng như thẻ.
2. **Lãi/lỗ chưa thực hiện chỉ vào Tài sản / Net worth.** Ledger thu/chi giữ nguyên
   sạch: Báo cáo chi tiêu **không** đổi. Không tạo giao dịch ảo nào.
3. **Lưu bằng bảng snapshot `account_valuations`** (giá trị thị trường theo ngày), KHÔNG
   dùng giao dịch điều chỉnh.

## Mô hình khái niệm

Cho mỗi tài khoản đầu tư:

| Khái niệm | Nguồn | Ý nghĩa |
|-----------|-------|---------|
| **Vốn gốc ròng** (`balance`) | view `account_balances` (đã có) | tiền nạp − tiền rút; = `initial_balance + Σ giao dịch` |
| **Giá trị thị trường** (`market_value`) | snapshot mới nhất trong `account_valuations`; null = chưa cập nhật | người dùng tự nhập định kỳ |
| **Lãi/lỗ chưa thực hiện** | `market_value − balance` (chỉ khi có snapshot) | phần chênh do giá thị trường |

- **Tổng tài sản / Net worth dùng `market_value` khi có snapshot**, ngược lại fallback
  về `balance` (tài khoản đầu tư mới tạo chưa cập nhật giá → vẫn tính bằng vốn gốc).
- Mua thêm / bán bớt = **giao dịch chuyển khoản** thường (bank ↔ investment) qua
  `Repo.createTransaction` (nguyên tắc 0.1 — không đẻ luồng mới). Sau khi mua/bán, người
  dùng cập nhật lại giá trị thị trường.

### Vì sao `market_value >= 0` (không cho âm)
Giá trị thị trường của một khoản đầu tư luôn ≥ 0. Vốn gốc ròng (`balance`) thì có thể âm
(nếu đã rút/bán nhiều hơn số đã nạp — tức đã hiện thực hoá lãi); khi đó lãi/lỗ chưa thực
hiện = `market_value − balance` vẫn tính được, chỉ là con số **xấp xỉ** (v1 không tách
lãi đã-thực-hiện vs chưa-thực-hiện — xem "Ngoài phạm vi").

## Nguyên tắc bám khung (data-model-matrix)

- Tiền lưu **minor units `bigint`** theo **currency của tài khoản** (0.2). Quy đổi base
  chỉ khi hiển thị/tổng hợp, qua `convertToBase` (0.3).
- Mọi biến động **dòng tiền** vẫn là `transactions` qua `createTransaction` (0.1).
  `account_valuations` KHÔNG phải dòng tiền — chỉ là ảnh chụp giá trị, không đụng số dư.
- Mọi bảng có `user_id`, RLS `"own rows"`, composite `unique(id, user_id)` (0.5).

### Vì sao bảng riêng, không tái dùng "giao dịch điều chỉnh" (mục X)
Giao dịch điều chỉnh sẽ nhét lãi/lỗ vào bảng `transactions` → hoặc lọt vào Báo cáo
thu/chi (vi phạm quyết định 2), hoặc phải thêm cờ loại trừ y như `is_debt_flow` rồi vẫn
phải lưu "giá trị mục tiêu" ở đâu đó. Bảng snapshot tách bạch: ledger sạch tuyệt đối,
lãi/lỗ là **đại lượng dẫn xuất** (`market_value − balance`), tính khi hiển thị.

## Schema (migration `0016_investment_valuation.sql`)

### 1. Mở rộng loại tài khoản
```sql
alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts add constraint accounts_type_check
  check (type in ('cash','bank','card','ic','ewallet','investment'));
```

### 2. Bảng `account_valuations`
| Cột | Kiểu / ý nghĩa |
|-----|----------------|
| `id` | uuid pk |
| `user_id` | uuid → auth.users, cascade |
| `account_id` | uuid — FK `(account_id, user_id) → accounts(id, user_id)` **on delete cascade** |
| `valued_on` | date not null default current_date |
| `market_value` | bigint not null check (`market_value >= 0`) — minor units theo currency **tài khoản** |
| `note` | text default '' |
| `created_at` | timestamptz default now() |
| | `unique (account_id, valued_on)` — mỗi tài khoản mỗi ngày một giá trị (upsert đè) |

RLS `"own rows"` (select/insert/update/delete) như mọi bảng khác.

### 3. Nạp lại view `account_balances` — lộ `market_value` mới nhất
Thêm 1 cột `market_value` (null nếu chưa có snapshot / không phải đầu tư) qua lateral
join lấy snapshot mới nhất (`valued_on` desc, tiebreak `created_at` desc). Logic tính
`balance` giữ nguyên. `AccountBalanceRow` thêm `market_value: number | null`.

```sql
... left join lateral (
  select v.market_value
  from public.account_valuations v
  where v.account_id = a.id
  order by v.valued_on desc, v.created_at desc
  limit 1
) mv on true
```

## Tầng ứng dụng

### `src/types/database.types.ts`
- `AccountType` thêm `'investment'`.
- `AccountBalanceRow` thêm `market_value: number | null`.
- Type mới `AccountValuationRow` + đăng ký bảng `account_valuations` trong `Database`.

### `src/features/assets/aggregate.ts`
- `ACCOUNT_TYPE_LABELS.investment = 'Đầu tư'`.
- `AssetAccount` bổ sung:
  - `marketValue: number | null` (minor units gốc; null = không phải đầu tư / chưa cập nhật)
  - `baseValue` của tài khoản đầu tư tính từ `convertToBase(marketValue ?? balance)`
    → **Tổng tài sản tự phản ánh giá thị trường**, không đổi công thức tổng.
  - `unrealizedPnl: number | null` (base; null nếu không có snapshot hoặc thiếu tỷ giá)
- Tài khoản đầu tư **vẫn nằm trong nhóm tài sản** bình thường (hiện ở cả "Theo mục đích"
  và "Theo loại" = nhóm "Đầu tư"). Không tách như thẻ.
- `AssetBreakdown` thêm `unrealizedPnl: number` (tổng base, chỉ cộng tài khoản có snapshot
  & đủ tỷ giá) + `pnlHasMissingRate` để cảnh báo.

### `src/features/assets/investment.ts` (helper thuần, mới) + test
`investmentSummary(accounts)` gom các dòng đầu tư: vốn gốc, giá trị hiện tại, lãi/lỗ
(số & %), phục vụ khối hiển thị. Tách file để unit-test thuần như `aggregate.ts`.

### Repo (cài **cả 2** demoRepo + supabaseRepo) — nguyên tắc 0.1
```ts
getAccountValuations(): Promise<AccountValuationRow[]>        // toàn bộ của user, UI tự lọc
upsertValuation(accountId, { valued_on, market_value, note }): Promise<AccountValuationRow>
deleteValuation(id): Promise<void>
```
- **demoRepo** phải tự tính `market_value` cho `getAccountBalances()` (lấy snapshot mới
  nhất theo account) — hiện demoRepo tính balance client-side.
- **BackupData** (mục Z) thêm `accountValuations` + `exportAll`/`importAll`; **tăng
  `BACKUP_VERSION` → 2** và xử lý bản v1 (không có mảng này) khi import.

### UI
1. **AccountsPage / form tài khoản:** thêm loại "Đầu tư" (icon 📈) vào picker. Không có
   trường riêng lúc tạo (khác thẻ) — giá trị nhập sau qua sheet cập nhật.
2. **Sheet "Cập nhật giá trị"** (`ValuationFormSheet`): **giá trị hiện tại** (tệ tài
   khoản), **ngày** (mặc định hôm nay), ghi chú. Lưu = `upsertValuation`. Mở từ
   AccountDetailPage và/hoặc dòng đầu tư ở trang Tài sản.
3. **AccountDetailPage (tài khoản đầu tư):** hiển thị Vốn gốc · Giá trị hiện tại ·
   Lãi/lỗ (±, %, xanh/đỏ, tôn trọng chế độ riêng tư `formatMoney` mask) + lịch sử
   valuations + nút cập nhật.
4. **Trang Tài sản:** dòng tài khoản đầu tư hiển thị theo giá thị trường; thêm khối/nhãn
   tổng "Lãi/lỗ đầu tư (chưa thực hiện)" khi có ≥1 snapshot. Cảnh báo thiếu tỷ giá như
   các phần khác.

## Ngoài phạm vi v1

- **Lot tracking / tách lãi đã-thực-hiện vs chưa-thực-hiện** khi bán ở giá lời (v1: lãi/lỗ
  là số xấp xỉ = giá thị trường − vốn gốc ròng).
- **Tự lấy giá thị trường** (API chứng khoán/crypto) — v1 nhập tay.
- **Lịch sử net worth theo thời gian** (mục AF riêng) — dù snapshot valuations là nền cho nó.
- Nhắc "đến hạn cập nhật giá" (reminder) — có thể nối mục AN sau.
