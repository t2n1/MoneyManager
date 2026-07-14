# Database Matrix — bản đồ dữ liệu & schema đích

> **Ngày ghi:** 2026-07-14 · **Mục đích:** để **dữ liệu hiện có** và **dữ liệu các
> tính năng tương lai** (backlog `docs/backlog-tinh-nang.md`) nối với nhau **một cách
> nhất quán**, tránh trường hợp 2 tính năng cùng nhu cầu lại đẻ ra **2 luồng dữ liệu
> khác nhau**.
>
> Đây là **tài liệu tham chiếu sống** (cập nhật khi schema đổi), **không phải spec**
> của một tính năng. Không chứa SQL/migration — DDL cụ thể để dành cho spec từng mục.
>
> Liên quan: [`backlog-tinh-nang.md`](./backlog-tinh-nang.md) · schema hiện tại ở
> `supabase/migrations/`.

---

## Phần 0 — Nguyên tắc nền (bất biến)

Mọi bảng/cột mới **phải** khớp khung xương này. Đây là các "khớp nối" chung mà mọi
luồng dữ liệu buộc phải dùng — chính là thứ ngăn việc tạo luồng song song.

| # | Nguyên tắc | Khớp nối cụ thể |
|---|-----------|-----------------|
| 0.1 | Mọi đọc/ghi đi qua interface `Repo` | `src/data/repo.ts`; **cài cả 2 impl**: `demoRepo` (localStorage) + `supabaseRepo` (Postgres). Không component nào gọi thẳng Supabase. |
| 0.2 | Tiền = **minor units `bigint`** | Không bao giờ float. JPY=yên, VND=đồng, USD=cent. |
| 0.3 | Đa tệ quy đổi 1 chỗ | `src/lib/rates.ts` → `convertToBase(minor, from, base, rates)`; thiếu tỷ giá → trả `null`, UI tách theo loại tiền (`hasMissingRate`). |
| 0.4 | "Tháng" đi qua 1 helper | `src/lib/dates.ts` → `getMonthRange()` / `monthKeyForDate()` (tôn trọng `profiles.month_start_day`). Không tự cộng trừ ngày nơi khác. |
| 0.5 | Cô lập dữ liệu theo user | Mọi bảng có `user_id`; RLS policy `"own rows"`; composite FK `(id, user_id)` để chặn tham chiếu chéo user. |
| 0.6 | Tiền tệ theo **tài khoản** | Giao dịch lưu theo currency của tài khoản nguồn; số quy đổi chỉ tính khi hiển thị/tổng hợp. |
| 0.7 | `updated_at` tự động | Trigger `moddatetime` cho bảng có sửa (như `transactions`, `budgets`). |

**Quy tắc vàng chống trùng luồng:** trước khi thêm bảng/cột cho một tính năng, tra
**Phần 2** xem thực thể đó đã tồn tại chưa và tra **Phần 3** xem có cụm dùng chung nào
đã "nhận" nhu cầu này chưa. Nếu có → bám vào luồng đó, **không tạo luồng mới**.

---

## Phần 1 — Sơ đồ thực thể hiện tại

```
                         ┌───────────────────────┐
                         │ profiles (1-1 user)   │
                         │  base_currency        │
                         │  month_start_day      │
                         └───────────────────────┘

  ┌───────────────┐          ┌───────────────┐
  │ accounts      │          │ categories    │
  │  currency     │          │  type         │
  │  initial_bal  │          │  (phẳng)      │
  └───────┬───────┘          └───────┬───────┘
          │ account_id               │ category_id
          │ to_account_id            │
          ▼                          ▼
  ┌─────────────────────────────────────────────┐
  │ transactions                                │
  │  type: expense | income | transfer          │
  │  amount (minor, tệ nguồn)                    │
  │  to_amount (minor, tệ đích — CK xuyên tệ)    │
  │  occurred_on                                 │
  └─────────────────────────────────────────────┘
          ▲                          ▲
          │ (tổng hợp)               │ category_id + month_key
  ┌───────┴───────────┐      ┌───────┴───────────┐
  │ account_balances  │      │ budgets           │
  │  (VIEW, tính từ    │      │  amount (minor,   │
  │   initial+tx)      │      │   BASE currency)  │
  └───────────────────┘      └───────────────────┘
```

**Khóa nối hiện có** (dùng lại, không tạo mới cho cùng ý nghĩa):

| Khóa | Nối gì | Ghi chú |
|------|--------|---------|
| `transactions.account_id` | → accounts | tài khoản nguồn (bắt buộc) |
| `transactions.to_account_id` | → accounts | chỉ khi `type='transfer'` |
| `transactions.category_id` | → categories | chỉ khi `type≠'transfer'` |
| `budgets.category_id` + `month_key` | → categories, "tháng" | `unique(user_id, category_id, month_key)` |
| `transactions.occurred_on` | "tháng" qua `monthKeyForDate` | KHÔNG lưu month_key ở transactions |

> ⚠️ **Bất đối xứng tiền tệ cần nhớ:** `transactions.amount` theo **tệ tài khoản**;
> `budgets.amount` theo **base_currency**. Mọi so sánh chi-tiêu-vs-ngân-sách phải
> `convertToBase` phía chi tiêu trước. Tính năng mới đụng tiền phải khai báo rõ "lưu
> theo tệ nào" (xem cột quy ước ở Phần 4).

---

## Phần 2 — Ma trận Tính năng × Bảng

**Ký hiệu:** `R` = chỉ đọc · `W` = ghi (tạo/sửa/xóa) · `+col` = thêm cột vào bảng có
sẵn · `NEW` = cần bảng mới · `L` = chỉ localStorage/manifest (không đụng Postgres) ·
`–` = không đụng.

Đọc **theo cột dọc**: cột nào có nhiều `W`/`NEW` là điểm nóng dễ đẻ luồng trùng →
phải gom về cụm chung (Phần 3).

| Tính năng | profiles | accounts | categories | transactions | budgets | acct_balances | **Mới cần** |
|-----------|:--------:|:--------:|:----------:|:------------:|:-------:|:-------------:|-------------|
| **GĐ3-2** Giao dịch định kỳ | – | R | R | **W** (sinh) | – | – | **NEW `recurring_rules`** |
| **GĐ3-3** Xuất CSV | R | R | R | R | R | R | – |
| **A** Báo cáo năm | R | R | R | R | R | – | – |
| **B** Sổ lịch | R | – | R | R | – | – | – |
| **C** Chi định kỳ | – | R | R | **W** (sinh) | – | – | ↳ dùng `recurring_rules` |
| **D** Chuyển khoản định kỳ | – | R | – | **W** (sinh) | – | – | ↳ dùng `recurring_rules` |
| **E** Tổng tài sản | R | R | – | – | – | R | – |
| **F** Nợ / cho vay | R | R? | – | W? (trả nợ) | – | – | **NEW `debts` (+`debt_payments`)** |
| **G** Danh mục mẹ/con | – | – | **+col `parent_id`** | R | R | – | (đổi nền categories) |
| **H** Xuất Excel | R | R | R | R | R | R | – |
| **I** Gợi ý thông minh | R | R | R | R | – | – | `L` (lựa chọn gần nhất) |
| **J** Mẫu giao dịch nhanh | – | R | R | – | – | – | `L` **hoặc** **NEW `quick_templates`** |
| **K** Hoàn tác (undo) | – | – | – | **W** (xóa) | – | – | – |
| **L** Máy tính ô số tiền | – | – | – | – | – | – | – (UI thuần) |
| **M** Nhập liên tục (batch) | – | R | R | **W** | – | – | – |
| **N** Tách hóa đơn | – | R | R | **W** | – | – | (xem cụm N — có/không `+col group_id`) |
| **O** PWA shortcuts | – | – | – | – | – | – | `L` (manifest) |
| **P** Nhập giọng nói | – | – | R | – | – | – | – (Web Speech, client) |
| **Q** Thẻ insight | R | R | R | R | – | – | – |
| **R** Dự báo cuối tháng | R | R | R | R | R | – | – |
| **S** So sánh tháng | R | R | R | R | – | – | – |
| **T** Radar định kỳ | – | R | R | R | – | – | ↳ *feed* `recurring_rules` |
| **U** Phát hiện bất thường | – | R | R | R | – | – | – |
| **V** Tỷ lệ tiết kiệm / streak | R | R | R | R | – | – | – |
| **W** Dòng tiền tích lũy | R | – | – | R | – | – | – |

**Đọc nhanh ma trận:**

- **transactions** là điểm nóng nhất (nhiều `W`): định kỳ, tách hóa đơn, batch, undo,
  trả nợ đều ghi vào đây. → Mọi thứ sinh/ghi giao dịch **phải đi qua cùng
  `createTransaction`/`updateTransaction` của `Repo`**, không có "đường ghi tắt".
- Chỉ **4 tính năng cần thực thể mới:** GĐ3-2/C/D (`recurring_rules`), F (`debts`),
  J (tùy chọn `quick_templates`), G (`+col parent_id`). Tất cả phần còn lại là
  **đọc/tính client-side hoặc UI thuần** → không được tạo bảng.
- **T (radar)** KHÔNG có bảng riêng: nó phát hiện rồi đề xuất tạo `recurring_rules`.

---

## Phần 3 — Các cụm dùng chung (chống trùng luồng)

Mỗi cụm = một nhóm tính năng có nguy cơ tạo luồng song song. Với mỗi cụm, chốt **một
luồng dữ liệu duy nhất**.

### Cụm 1 — Giao dịch định kỳ  ·  GĐ3-2 + C + D  (+ T feed)

**Nguy cơ:** làm chi định kỳ, thu định kỳ, chuyển khoản định kỳ thành 3 bảng/3 cơ chế.

**Luồng chốt:** **1 bảng `recurring_rules`** cho cả 3 loại (`expense`/`income`/
`transfer`) và cả 3 chu kỳ (`weekly`/`monthly`/`yearly`). Rule là **khuôn** để sinh ra
`transactions` thật; **không** thay thế giao dịch.

- Sinh giao dịch bằng **catch-up khi mở app** (không cron): so `next_run_on` với hôm
  nay, sinh bù các kỳ đã tới hạn, cập nhật `last_generated_on`/`next_run_on`.
- Giao dịch sinh ra đi qua đúng `Repo.createTransaction` → tự khớp `account_balances`,
  báo cáo, ngân sách (không có đường ghi riêng).
- **T (radar)** chỉ *đọc* transactions, phát hiện mẫu lặp, rồi **đề xuất tạo rule** —
  ghi vào cùng `recurring_rules`, không có bảng "mẫu phát hiện" riêng.

### Cụm 2 — Tài sản & Nợ  ·  E + F

**Nguy cơ:** F (nợ) tự cộng/trừ số dư song song với `account_balances`, tạo 2 nguồn
sự thật về tiền.

**Luồng chốt:**
- **E (tổng tài sản)** = thuần tính từ `account_balances` + `convertToBase`. Không
  bảng mới.
- **F (nợ)** thêm `debts` (+ `debt_payments`). **Nợ KHÔNG tự đổi số dư tài khoản.**
  Nếu một lần trả nợ có thật sự chuyển tiền → nó tạo một `transactions` bình thường,
  và `debt_payments` **trỏ tới** `transaction_id` đó (1 nguồn sự thật: mọi biến động
  số dư luôn là 1 dòng `transactions`).
- "Tài sản ròng" (nếu làm) = `account_balances` ± nợ ròng, tính **khi hiển thị**,
  không lưu cột tổng.

### Cụm 3 — Cấu trúc danh mục  ·  G  (nền, đụng nhiều nơi)

**Nguy cơ:** thêm phân cấp bằng bảng "nhóm danh mục" riêng, tách khỏi `categories`.

**Luồng chốt:** phân cấp **ngay trong `categories`** bằng `parent_id uuid null`
(self-FK). Mẹ và con cùng `type`. Giới hạn **đúng 2 tầng**. Dữ liệu cũ = danh mục
không cha (mẹ). Giao dịch/ngân sách vẫn trỏ `category_id` như cũ → không đổi khóa nối,
chỉ đổi cách UI gom nhóm và cách báo cáo tùy chọn cuộn lên mẹ.

> Vì G là **thay đổi nền**, nếu định làm thì nên làm **sớm** (trước khi nhiều tính năng
> bám vào danh mục phẳng) — xem Phần 5.

### Cụm 4 — Tách hóa đơn  ·  N

**Nguy cơ:** vừa làm "nhiều giao dịch rời" vừa làm "1 giao dịch nhiều dòng con" ở 2
thời điểm → 2 mô hình dữ liệu cho cùng khái niệm.

**Luồng chốt (2 mức, chọn 1 và giữ):**
- **Mức 1 (khuyến nghị bản đầu):** tách = **nhiều `transactions` rời** cùng
  `occurred_on`/`note`. Không đổi schema.
- **Mức 2 (nếu cần gom nhóm thật):** thêm `transactions.group_id uuid null` để nhóm
  các dòng của cùng hóa đơn. **Đặt trước tên cột `group_id`** trong tài liệu này để
  nếu nâng cấp thì cả app dùng đúng một tên, không đẻ khái niệm mới.

### Cụm 5 — Xuất dữ liệu  ·  GĐ3-3 (CSV) + H (Excel)

**Nguy cơ:** viết 2 bộ trích xuất/định dạng dữ liệu khác nhau.

**Luồng chốt:** **một hàm chuẩn bị dữ liệu xuất** (đọc qua `Repo`, quy đổi tùy chọn
qua `convertToBase`), sau đó 2 bộ *serializer* mỏng (CSV / xlsx). xlsx **lazy-load**
thư viện khi bấm xuất. Không đụng schema (chỉ đọc).

### Cụm 6 — Mẫu nhập nhanh  ·  J

**Nguy cơ:** làm localStorage rồi sau lại làm bảng → 2 nơi lưu mẫu.

**Luồng chốt:** quyết **một lần** (xem Phần 5): hoặc `L` (localStorage, không đồng bộ),
hoặc **NEW `quick_templates`** (đồng bộ đa thiết bị, qua `Repo` + RLS). Khuyến nghị
bảng nếu muốn đồng bộ — vì nó đúng tinh thần "mọi dữ liệu người dùng đi qua `Repo`".

---

## Phần 4 — Schema đích (mức khái niệm)

Mô tả các thực thể tương lai ở mức khái niệm. **Chưa** viết migration — DDL để dành cho
spec từng mục. Mọi bảng mặc định có: `id uuid pk`, `user_id`, RLS `"own rows"`,
composite `unique(id, user_id)` nếu bị bảng khác tham chiếu.

### `recurring_rules` — NEW (Cụm 1)

Khuôn sinh giao dịch định kỳ. Không giữ số dư; chỉ mô tả "sinh gì, bao lâu một lần".

| Cột | Kiểu / ý nghĩa |
|-----|----------------|
| `type` | `expense` \| `income` \| `transfer` (khớp `transactions.type`) |
| `amount` | bigint minor, **theo tệ tài khoản nguồn** (như `transactions.amount`) |
| `to_amount` | bigint minor, tệ đích — chỉ `transfer` xuyên tệ |
| `category_id` | fk categories — chỉ khi ≠ transfer |
| `account_id` | fk accounts — nguồn (bắt buộc) |
| `to_account_id` | fk accounts — chỉ transfer |
| `note` | text mặc định cho giao dịch sinh ra |
| `frequency` | `weekly` \| `monthly` \| `yearly` |
| `interval` | int (mỗi N kỳ; mặc định 1) |
| `start_on` | date bắt đầu |
| `last_generated_on` | date lần sinh gần nhất (null = chưa sinh) |
| `next_run_on` | date kỳ kế tiếp — trục để catch-up so sánh |
| `is_active` | boolean |

**Ràng buộc hình dạng** giống `transactions` (transfer có `to_account_id`, không
category; ngược lại). **Không** thêm khóa vào `transactions` để "đánh dấu sinh từ
rule" ở bản đầu (giữ giao dịch sinh ra = giao dịch thường); nếu sau cần truy vết,
thêm `transactions.recurring_rule_id uuid null` — ghi tên đó ở đây để dùng thống nhất.

### `debts` — NEW (Cụm 2)

Khoản nợ/cho vay với đối tác ngoài hệ thống tài khoản.

| Cột | Kiểu / ý nghĩa |
|-----|----------------|
| `counterparty` | text — tên người/đơn vị |
| `direction` | `i_owe` (mình nợ) \| `owed_to_me` (người ta nợ mình) |
| `currency` | ISO 4217 — tệ của khoản nợ |
| `principal` | bigint minor — số gốc |
| `due_on` | date null — hạn |
| `status` | `open` \| `settled` |
| `note` | text |

### `debt_payments` — NEW (Cụm 2)

Lịch sử trả từng phần. **Trỏ tới giao dịch thật** để không tách nguồn sự thật về tiền.

| Cột | Kiểu / ý nghĩa |
|-----|----------------|
| `debt_id` | fk debts |
| `amount` | bigint minor (tệ của debt) |
| `paid_on` | date |
| `transaction_id` | fk transactions **null** — nối tới giao dịch sinh ra nếu lần trả này có chuyển tiền thật; null nếu chỉ ghi nhận |

### `categories.parent_id` — +col (Cụm 3)

`parent_id uuid null` self-FK. Ràng buộc: cùng `type` với cha; **đúng 2 tầng** (cha
của một danh-mục-con phải có `parent_id is null`); chặn tự trỏ. Không đổi khóa
`transactions.category_id` / `budgets.category_id`.

### `quick_templates` — NEW (tùy chọn, Cụm 6)

Chỉ tạo **nếu** chọn phương án đồng bộ (xem Phần 5). Cột: `label`, `type`, `amount`
(minor, tệ tài khoản), `category_id`, `account_id`, `note`, `sort_order`.

### `transactions.group_id` — +col (tùy chọn, Cụm 4)

Chỉ tạo nếu nâng tách hóa đơn lên "gom nhóm". `group_id uuid null`; các dòng cùng hóa
đơn chung `group_id`.

---

## Phần 5 — Điểm quyết định còn treo (kèm khuyến nghị)

Các câu hỏi backlog đã nêu. **Khuyến nghị** dưới đây định hình schema đích ở trên;
**chốt cuối cùng khi brainstorm từng mục** — nếu đổi, cập nhật lại Phần 3/4.

| # | Câu hỏi | Khuyến nghị (mặc định) | Vì sao |
|---|---------|------------------------|--------|
| 5.1 | Nợ có tính vào tổng tài sản? | **Có** — nhưng hiển thị **tách**: "tài sản gộp" (chỉ tài khoản) vs "tài sản ròng" (± nợ). | Không lưu cột tổng, tính khi hiển thị → không có nguồn sự thật thứ 2. |
| 5.2 | Trả nợ có sinh giao dịch thật? | **Có, khi có chuyển tiền thật** — `debt_payments.transaction_id` trỏ giao dịch. Ghi nhận suông (không chuyển tiền) thì để null. | Mọi biến động số dư luôn là 1 dòng `transactions` (Cụm 2). |
| 5.3 | Ngân sách đặt theo danh mục mẹ hay con? | **Con (leaf)**; báo cáo tùy chọn cuộn lên mẹ. | `budgets.category_id` không đổi; khớp `transactions.category_id` (cũng gắn con). |
| 5.4 | Giao dịch gắn mẹ hay con? | **Chỉ con (leaf)**; mẹ chỉ để gom. | Tránh nhập nhằng khi tổng hợp theo cấp. |
| 5.5 | Danh mục lồng mấy tầng? | **Đúng 2 tầng.** | Gọn, đủ nhu cầu, ràng buộc dễ. |
| 5.6 | Migrate danh mục cũ khi thêm mẹ/con? | Danh mục hiện tại → **mẹ, `parent_id = null`**; không phải sửa dữ liệu giao dịch. | Không phá khóa nối cũ. |
| 5.7 | Tách hóa đơn: rời hay nhóm? | **Bản đầu: nhiều giao dịch rời**; nâng `group_id` sau nếu cần (tên cột đã đặt trước). | Không đổi schema sớm; vẫn có đường nâng cấp thống nhất. |
| 5.8 | Mẫu nhanh: localStorage hay bảng? | **Bảng `quick_templates`** nếu muốn đồng bộ đa thiết bị; localStorage nếu chấp nhận theo-thiết-bị. | Đồng bộ → đi qua `Repo`, đúng nguyên tắc 0.1. |
| 5.9 | Thứ tự làm G (mẹ/con)? | Nếu chắc sẽ làm → **làm sớm**, trước khi nhiều tính năng bám danh mục phẳng. | Giảm số nơi phải migrate sau. |
| 5.10 | Xuất file: CSV, Excel, hay cả hai? | **Cả hai** trên **một** hàm chuẩn bị dữ liệu (Cụm 5); xlsx lazy-load. | Một luồng dữ liệu, 2 serializer mỏng. |

---

## Bảo trì tài liệu này

- Khi thêm migration mới → cập nhật **Phần 1** (sơ đồ) + **Phần 4** (biến thực thể từ
  "đích" thành "hiện có").
- Khi bắt tay một tính năng backlog → **trước tiên** tra Phần 2 + Phần 3 để bám luồng
  đã chốt; nếu phát sinh thực thể ngoài dự kiến, thêm dòng vào ma trận trước khi code.
- Khi chốt một điểm ở Phần 5 → cập nhật khuyến nghị thành quyết định và đồng bộ Phần 4.
