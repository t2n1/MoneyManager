# Database Matrix — bản đồ dữ liệu & schema đích

> **Ngày ghi:** 2026-07-14 · **Cập nhật:** 2026-07-30 (kiểm lại toàn bộ với
> `supabase/migrations/`: bổ sung 9 bảng tài liệu từng bỏ sót, và sửa 4 mục còn đánh
> "NEW"/"đích" tuy đã ship từ migration 0006–0008); 2026-08-13 (rà lại toàn bộ lần nữa,
> bổ sung 5 bảng còn sót: `push_subscriptions` (0034), `planned_expenses` (0038),
> `month_plans` (0041), `recurring_rule_tags` (0042), `planned_expense_tags` (0044)) ·
> **Mục đích:** để **dữ liệu hiện có** và **dữ liệu các
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
                         │  birth_year (0031)    │
                         │  annual_inflation_bps │
                         │    (0026)             │
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

**Nhánh Lifetime** (migration 0031 + 0032) — ĐỘC LẬP với `transactions`: nó chiếu tương
lai, không ghi nhận quá khứ. Không có khóa nào trỏ vào `accounts`/`categories`; nó chỉ
ĐỌC `account_balances` + `debts` một lần (qua `assetBreakdown`, khi tạo kịch bản đầu
tiên) để lấy `starting_assets_minor`, rồi từ đó tự đứng.

```
  ┌───────────────────────┐
  │ profiles.birth_year   │  ← cần để đổi năm ↔ tuổi
  └───────────────────────┘
              │
              ▼
  ┌─────────────────────────────────────┐
  │ life_scenarios                      │
  │  display_currency (đơn vị đồ thị)    │
  │  starting_assets_minor (minor, theo  │
  │    display_currency)                 │
  │  end_age · real_return_bps           │
  │  band_spread_bps · nominal_terms     │
  │  is_primary · sort_order             │
  └────────┬──────────────────┬─────────┘
           │ scenario_id      │ scenario_id
           ▼                  ▼
  ┌──────────────────┐  ┌──────────────────────┐
  │ life_phases      │  │ life_events          │
  │  start_year      │  │  start_year          │
  │  (không end_year)│  │  end_year (null=hết  │
  │  currency        │  │    đời)              │
  │  annual_income_  │  │  kind: income|expense│
  │    minor         │  │  amount_minor (MỖI   │
  │  annual_expense_ │  │    NĂM, không phải   │
  │    minor         │  │    tổng cả khoảng)   │
  │  fx_to_display   │  │  currency            │
  │  country (null   │  │  fx_to_display (0032)│
  │    được)         │  │  inflate             │
  └──────────────────┘  └──────────────────────┘
```

**Khóa nối hiện có** (dùng lại, không tạo mới cho cùng ý nghĩa):

| Khóa | Nối gì | Ghi chú |
|------|--------|---------|
| `transactions.account_id` | → accounts | tài khoản nguồn (bắt buộc) |
| `transactions.to_account_id` | → accounts | chỉ khi `type='transfer'` |
| `transactions.category_id` | → categories | chỉ khi `type≠'transfer'` |
| `budgets.category_id` + `month_key` | → categories, "tháng" | `unique(user_id, category_id, month_key)` |
| `transactions.occurred_on` | "tháng" qua `monthKeyForDate` | KHÔNG lưu month_key ở transactions |
| `life_phases.scenario_id` + `user_id` | → life_scenarios `(id, user_id)` | composite FK, `on delete cascade`; `unique(scenario_id, start_year)` |
| `life_events.scenario_id` + `user_id` | → life_scenarios `(id, user_id)` | composite FK, `on delete cascade` |

### Bảng đã có mà tài liệu này từng bỏ sót

Kiểm lại 2026-07-30 bằng cách đối chiếu **mọi** `create table` trong
`supabase/migrations/` với nội dung tài liệu. Chín bảng dưới đây đã tồn tại thật nhưng
chưa từng được ghi ở đâu trong Phần 1–4, nên **Quy tắc vàng ở Phần 0 không hoạt động
với chúng**: ai tra tài liệu này trước khi thêm bảng sẽ không thấy chúng và có thể đẻ ra
luồng trùng. Đó là lý do mục này tồn tại chứ không phải để liệt kê cho đủ.

| Bảng | Migration | Giữ gì | Quy ước tiền |
|------|:---------:|--------|--------------|
| `debts` | 0007 (+0011/0014/0021/0023) | khoản nợ / cho vay với đối tác ngoài hệ thống tài khoản | `currency` riêng của khoản nợ |
| `debt_payments` | 0007 | lịch sử trả từng phần; `transaction_id` **null được** | minor theo tệ của `debts` |
| `recurring_rules` | 0008 | khuôn sinh giao dịch định kỳ | minor theo tệ tài khoản nguồn |
| `asset_group_settings` | 0004 | nhóm tài sản do người dùng đặt: `include_in_totals`, `is_hidden`, `sort_order`; `unique (user_id, name)` | — (không giữ tiền) |
| `account_valuations` | 0016 | giá trị thị trường của tài khoản đầu tư; `unique (account_id, valued_on)` = mỗi ngày một giá | `market_value` minor theo tệ **tài khoản**, `>= 0` |
| `savings_goals` | 0018 | mục tiêu tiết kiệm gắn vào một tài khoản | `target_amount` minor theo tệ **tài khoản**, `> 0` |
| `networth_snapshots` | 0020 | ảnh chụp tài sản ròng theo ngày; `unique (user_id, snapshot_on)` | `net_worth` minor theo **base_currency**, âm được |
| `tag_groups` | 0039 | nhóm nhãn ("Với ai?", "Ở đâu?"); `tags.group_id` null = ngoài nhóm (mục "Khác"), xoá nhóm thì nhãn rơi về null | — (không giữ tiền) |
| `tags` + `transaction_tags` | 0026 | nhãn tự do gắn vào giao dịch (n-n) | — (không giữ tiền) |
| `notification_state` | 0029 | `read_at` / `dismissed_at` theo `key`; PK `(user_id, key)` | — |
| `fx_history` | 0029 | tỷ giá theo ngày, `rates jsonb`; PK `(user_id, on_date, base)` | **major** units, chiều "1 base đổi được bao nhiêu" — cùng chiều `lib/rates.ts`, **ngược** `fx_to_display` |

> ⚠️ `fx_history.rates` và `life_*.fx_to_display` là **hai chiều ngược nhau** và cùng nói
> về tỷ giá. Xem ô "Quy ước `fx_to_display`" ở Phần 4 trước khi nối hai thứ này.

> ⚠️ **Bất đối xứng tiền tệ cần nhớ:** `transactions.amount` theo **tệ tài khoản**;
> `budgets.amount` theo **base_currency**. Mọi so sánh chi-tiêu-vs-ngân-sách phải
> `convertToBase` phía chi tiêu trước. Tính năng mới đụng tiền phải khai báo rõ "lưu
> theo tệ nào" (xem cột quy ước ở Phần 4).

### Đẩy thông báo ra ngoài app — 1 bảng mới (migration 0034)

Nối tiếp `notification_state` (0029): 0029 dựng chuông TRONG app — bộ luật chạy trên
máy mỗi lần mở app nên việc cần làm chỉ hiện khi người dùng tự mở app ra xem. Migration
0034 thêm phần đẩy: một edge function chạy theo giờ, tự dựng lại cùng `NotificationInput`
từ Postgres, gọi ĐÚNG bộ luật đó rồi gửi Web Push — chỉ đẩy nhóm "việc cần làm"
(`kind='action'`), tin-để-biết vẫn chỉ nằm trong chuông (cột `pushed_at` mà 0029 chừa sẵn
trên `notification_state` giờ có người ghi và người đọc). Cùng migration này thêm ba cột
vào `profiles`: `push_hour`/`push_tz` (giờ + múi giờ IANA, KHÔNG quy sẵn ra UTC — chủ app
đang ở Nhật, dự định chuyển sang Mỹ; quy sớm thì đổi múi giờ là lệch giờ gửi, còn DST làm
mốc UTC trôi hai lần một năm) và `push_last_sent_at` (chặn gửi hai lần trong một ngày địa
phương, cron chạy mỗi giờ).

| Bảng | Migration | Giữ gì | Quy ước tiền |
|------|:---------:|--------|--------------|
| `push_subscriptions` | 0034 | một trình duyệt trên một thiết bị đã bấm đồng ý nhận thông báo (một người có nhiều dòng — điện thoại + laptop, cả hai đều phải nhận); PK **`(user_id, endpoint)`** — `endpoint` do dịch vụ đẩy của trình duyệt cấp (FCM/Mozilla/Apple) nên chính nó là danh tính thiết bị: đăng ký lại sau khi trình duyệt đổi khoá ra endpoint khác (phải chết theo cách riêng, mã 410 khi gửi), không phải bị ghi đè; `p256dh`/`auth` là khoá mã hoá nội dung (aes128gcm, base64url); `user_agent` để người dùng nhận ra "cái này máy nào"; `last_ok_at` null = chưa gửi lần nào, dùng để soi khi push im | — (không giữ tiền) |

### Cổ phiếu Việt Nam — 2 bảng mới (migration 0035)

Nối tiếp `account_valuations` (0016): 0016 chỉ lưu MỘT con số tổng do người dùng tự gõ
mỗi lần cập nhật. Migration 0035 thêm SỔ LỆNH để app biết đang giữ mã nào, bao nhiêu cổ
— nhờ vậy edge function `stock-refresh` tự tính giá trị thị trường và ghi thẳng vào
`account_valuations` (không có bảng "giá trị" riêng cho cổ phiếu). Cùng migration này
cũng thêm cột `account_valuations.source` (`'manual'`\|`'auto'`, mặc định `'manual'`) để
phân biệt số người dùng gõ tay với số cron tự ghi — cron chỉ `upsert` khi `source =
'auto'` nên số gõ tay không bao giờ bị đè. Migration 0045 (mục dưới) dùng lại đúng cột
`source` này cho quỹ Nhật, không tạo cờ riêng. Sổ lệnh **không phải dòng tiền**: không
đụng `transactions`, không đụng số dư tài khoản — nó chỉ nói tiền trong tài khoản chứng
khoán đang nằm ở dạng cổ phiếu nào. Chi tiết vận hành cron hút giá ở
[`docs/co-phieu-viet-nam.md`](./co-phieu-viet-nam.md).

| Bảng | Migration | Giữ gì | Quy ước tiền |
|------|:---------:|--------|--------------|
| `stock_prices` | 0035 | bảng giá chung, công khai (bảng ĐẦU TIÊN trong dự án không có `user_id`, có ý thức — cùng lý do `fund_prices` của 0045: giá cổ phiếu là dữ liệu công khai giống hệt nhau với mọi user, nhân bản theo user chỉ tốn thêm hàng và một vòng lặp hút giá vô ích): `symbol` (PK), `exchange` (`hose`\|`hnx`\|`upcom`), `name` (tên công ty, gợi ý khi gõ tìm mã), `price`, `prior_close` (giá tham chiếu phiên trước, để hiện % đổi trong ngày, null = chưa có), `trading_date` (ngày PHIÊN mà giá thuộc về — KHÔNG phải ngày hút, vì sàn nghỉ lễ vẫn trả giá phiên cũ) | `price`/`prior_close` bigint **ĐỒNG/CỔ** (VND decimals=0, không nhân chia gì); RLS chỉ cho `select` với user đã đăng nhập, ghi chỉ qua service role (không có policy ghi nào) |
| `stock_trades` | 0035 | sổ lệnh cổ phiếu riêng từng user: `account_id` (composite FK → `accounts (id, user_id)`, cascade), `symbol`, `kind` (`buy`\|`sell`\|`adjust`), `traded_on`, `quantity`, `price`, `fee`, `tax` (thuế bán 0,1% ở Việt Nam, luôn 0 với `buy`), `note` | `price`/`fee`/`tax` bigint minor theo tệ tài khoản (luôn VND vì chỉ áp dụng tài khoản `investment` VND); giá vốn tính từ `quantity × price + fee`, khác hẳn mô hình `fund_trades` (lấy thẳng `amount`, xem cảnh báo dưới mục Quỹ Nhật) |

> ⚠️ **`kind='adjust'` không phải một lệnh mua/bán thật** — dùng cho cổ phiếu thưởng, cổ
> tức trả bằng cổ phiếu, hoặc chia tách/gộp cổ phiếu, chuyện rất thường gặp ở cổ phiếu
> Việt Nam. Thiếu loại này thì mỗi lần công ty chia thưởng, số cổ app tính ra sai vĩnh
> viễn, không cách nào sửa ngoài bịa một lệnh mua giá 0. Ràng buộc hình dạng
> (`stock_trades_shape`): `adjust` bắt buộc `price = 0` và `quantity ≠ 0` (âm được — gộp
> cổ phiếu làm giảm số cổ); `buy`/`sell` bắt buộc `quantity > 0` và `price > 0`.

### Khoản sắp chi — 1 bảng mới (migration 0038)

Gộp hai nhu cầu vốn tưởng là hai thứ khác nhau: "nhắc tôi đóng phí vệ sinh 20/8" (có hạn
cụ thể, xong là hết) và "sửa nhà khoảng tháng 10, chừng 300k" (mới là dự tính, chưa chốt
ngày). Chúng chỉ khác nhau ở ĐỘ CHẮC CHẮN, không khác về bản chất: cả hai đều là tiền
CHƯA tiêu mà sẽ phải tiêu — tách làm hai bảng thì người dùng phải nhớ "cái này ghi ở
đâu", và một khoản dự tính lúc chốt được ngày sẽ phải chuyển nhà. **Khác** `recurring_rules`
kiểu `mode='remind'` (0037): cái kia LẶP MÃI theo chu kỳ; đây là MỘT LẦN — xong thì thôi,
nhét cả hai vào `recurring_rules` nghĩa là mọi khoản một lần đều phải mang một
`frequency` giả. **Khác** `debts` (0007): nợ có NGƯỜI ĐỐI ỨNG và có thể trả nhiều lần;
đây chỉ là một việc phải chi, không nợ ai cả. Migration 0044 nối thêm bảng nhãn — xem
mục "Bảng nối gắn nhãn" bên dưới.

| Bảng | Migration | Giữ gì | Quy ước tiền |
|------|:---------:|--------|--------------|
| `planned_expenses` | 0038 (+0044 nhãn) | khoản dự tính sẽ chi: `title`, `due_on` + `due_precision` (`day`\|`month` — `'month'` khi đó `due_on` bắt buộc là ngày 1, MÀN HÌNH in "tháng 10/2026" chứ không in ngày cụ thể — in ngày cho một dự tính mơ hồ là bịa ra độ chính xác không có); `remind_days_before` null = KHÔNG nhắc, `between 0 and 60`; `category_id`/`account_id` FK composite tới `categories`/`accounts` (nullable); `status` (`planned`\|`done`\|`dropped`); `transaction_id` FK composite tới `transactions`, `on delete set null` — xoá giao dịch thì cột này về null chứ không xoá khoản dự tính, kế hoạch vẫn còn chỉ là bút toán bị gỡ; index `(user_id, status, due_on)` | `amount` bigint minor theo `currency` riêng của khoản (mặc định `'JPY'`), `>= 0` — **`0` hợp lệ** (chưa biết giá, như "tìm nhà mới") |

> ⚠️ Ràng buộc `planned_done_needs_tx`: `status = 'done'` **khớp đúng chiều** với
> `transaction_id is not null` (cùng đúng hoặc cùng sai) — đánh dấu xong mà không có bút
> toán thì danh sách có dòng "đã chi" mà sổ không đồng nào rời ví.
>
> ⚠️ Ràng buộc `planned_month_anchored`: `due_precision = 'month'` bắt buộc
> `extract(day from due_on) = 1` — hai khoản cùng tháng phải so sánh được với nhau, và
> mọi phép gom theo tháng chỉ cần đọc `due_on` chứ không phải tự cắt chuỗi.

### Thu dự kiến theo tháng — 1 bảng mới (migration 0041)

Mặt lập kế hoạch của tab Ngân sách chia thu nhập ra hạn mức, mẫu số của phép chia đó tới
nay luôn là `baselineIncome()` — trung bình thu 3 tháng đã hoàn tất. Trung bình chạy được
với tháng bình thường, nhưng mù đúng lúc quan trọng nhất: tháng có ボーナス ở Nhật lệch
hẳn hai, ba tháng lương, và trung bình 3 tháng trước đó không hề biết nó sắp tới. Bảng
này lưu ĐÚNG MỘT thứ: "tôi biết tháng này thu bao nhiêu" — phần ĐÈ LÊN con số trung bình,
không phải phần bắt buộc khai. Vì sao là bảng riêng chứ không phải cột của `budgets`:
`budgets` khoá theo (user, DANH MỤC, tháng) nên không có chỗ nào treo một con số của cả
tháng — nhét vào đó phải bịa ra một dòng danh mục giả, và mọi phép cộng tổng hạn mức sẽ
phải nhớ mà loại nó ra, sớm muộn có chỗ quên.

| Bảng | Migration | Giữ gì | Quy ước tiền |
|------|:---------:|--------|--------------|
| `month_plans` | 0041 | `month_key` (`'YYYY-MM'` theo MonthKey, tôn trọng `month_start_day`); `unique (user_id, month_key)` — mỗi tháng nhiều nhất một số thu dự kiến, upsert theo khoá này; index `(user_id, month_key)` | `expected_income` bigint minor theo **base_currency**, `>= 0` chứ không phải `> 0` như `budgets.amount` — tháng nghỉ không lương thu = 0 là số THẬT và kế hoạch vẫn phải tính được (chia 0 đồng thì mọi hạn mức đều là bội chi, đúng cái cần thấy); ở đây bỏ đè là **XOÁ DÒNG**, một hành động riêng, không phải gõ số 0 |

### Bảng nối gắn nhãn cho quy tắc định kỳ & khoản sắp chi — 2 bảng mới (migration 0042, 0044)

Form Nhập cho chọn nhãn cùng lúc với đặt "Lặp lại" hay "Nhắc sau", nhưng `recurring_rules`
và `planned_expenses` không có chỗ giữ nhãn — nên nhãn vừa chọn rơi mất, và mọi giao dịch
sinh ra về sau (tự động hoặc tự tay ghi) đều không nhãn. Tiền nhà, thuê xe, phí thuê bao
hay "đóng tiền học cho con" là đúng loại khoản người ta muốn gắn nhãn nhất. Cả hai
migration dùng lại đúng khuôn `transaction_tags` (0026): **bảng nối, không phải cột
`tag_ids uuid[]`** trên bảng gốc. Lý do: engine catch-up của `recurring_rules` chạy
KHÔNG có người ngồi trước máy (mở app là nó tự sinh bù mọi kỳ lỡ). Mảng uuid không có
khoá ngoại, nên xoá một nhãn là mảng còn lại một id chết → lần sinh sau chèn
`transaction_tags` với `tag_id` không tồn tại → FK nổ → giao dịch định kỳ ÂM THẦM ngừng
sinh. Bảng nối có cascade lo việc đó: xoá nhãn là liên kết tự biến mất, engine không bao
giờ thấy id chết. Khoá ngoại composite `(id, user_id)` như `transaction_tags` — nhãn và
bảng gốc phải cùng một người, chặn ở tầng DB chứ không chỉ RLS. Migration 0044 cũng thêm
`unique (id, user_id)` vào `planned_expenses` (khoá chính `id` đã đủ duy nhất, ràng buộc
này chỉ tạo chỗ cho FK composite trỏ vào, không loại dòng nào).

| Bảng | Migration | Giữ gì | Quy ước tiền |
|------|:---------:|--------|--------------|
| `recurring_rule_tags` | 0042 | nối `recurring_rules` ↔ `tags`; PK `(rule_id, tag_id)`, cả hai FK composite `(., user_id)` cascade; index `(user_id, tag_id)` — tra "quy tắc nào đang gắn nhãn này" khi xoá/gộp nhãn | — (không giữ tiền) |
| `planned_expense_tags` | 0044 | nối `planned_expenses` ↔ `tags`, cùng hình dạng và cùng lý do với `recurring_rule_tags`; PK `(planned_id, tag_id)`; index `(user_id, tag_id)` | — (không giữ tiền) |

### Quỹ đầu tư Nhật — 4 bảng mới (migration 0045)

Nối tiếp `account_valuations` (0016): tài khoản `investment` tiền **JPY** có sổ lệnh quỹ
thì `fund-refresh` tự tính giá trị thị trường và ghi vào chính bảng đó — không có bảng
"giá trị" riêng cho quỹ. Chi tiết vận hành ở [`docs/quy-nhat.md`](./quy-nhat.md).

| Bảng | Migration | Giữ gì | Quy ước tiền |
|------|:---------:|--------|--------------|
| `funds` | 0045 | danh bạ quỹ, công khai (không `user_id`, cùng lý do `stock_prices` của 0035): `assoc_fund_cd` (協会コード, PK), `isin_cd`, `name`, `last_status`, `last_checked_at` | — (không giữ tiền) |
| `fund_aliases` | 0045 | tên quỹ trong sao kê Rakuten → `assoc_fund_cd`; NHIỀU tên trỏ về MỘT quỹ vì quỹ đổi tên (xem `docs/quy-nhat.md` mục "Quỹ đổi tên"); `statement_name` PK | — (không giữ tiền) |
| `fund_prices` | 0045 | 基準価額 mới nhất theo quỹ, công khai; `nav` **¥/10.000口** (chia 10.000 ở đúng một chỗ, `fundValue()`), `prior_nav`, `net_assets_m` (triệu yên, không tham gia phép tính tiền), `nav_date` | `nav`/`prior_nav` minor JPY nhưng theo đơn vị **10.000口**, không phải theo 口 |
| `fund_trades` | 0045 | sổ lệnh quỹ riêng từng user: `assoc_fund_cd` (fk `funds`), `kind` (`buy`\|`sell`\|`adjust`), `traded_on` (**約定日**, không phải 受渡日), `units` (口数, âm chỉ hợp lệ với `adjust`), `nav`, `amount`, `bucket` (口座区分 nguyên văn), `note` | `amount` minor JPY = số tiền THẬT đã trừ/nhận; giá vốn lấy từ đây, KHÔNG suy từ `units × nav` |

> ⚠️ **Mô hình giá vốn khác `stock_trades` (0035):** cổ phiếu tính `số cổ × giá + phí`;
> quỹ lấy thẳng `amount` (số tiền thật đã trừ) vì `units × nav ÷ 10.000` không khớp số
> Rakuten trừ (đo thật: `28.429 × 17.588 ÷ 10.000 = 50.000,93` trong khi số tiền bị trừ
> là `50.000`). Đừng gộp hai mô hình này vào một hàm chung — xem đầu
> [`fundHoldings.ts`](../src/features/assets/fundHoldings.ts).

---

## Phần 2 — Ma trận Tính năng × Bảng

**Ký hiệu:** `R` = chỉ đọc · `W` = ghi (tạo/sửa/xóa) · `+col` = thêm cột vào bảng có
sẵn · `NEW` = cần bảng mới · ✅ = **đã ship** (kèm số migration) · `L` = chỉ
localStorage/manifest (không đụng Postgres) · `–` = không đụng.

> Cột **Mới cần** dùng ✅ cho thứ đã tồn tại và `NEW` cho thứ còn là dự định. Trước
> 2026-07-30 cột này còn ghi `NEW` cho `recurring_rules`, `debts` và `parent_id` tuy cả
> ba đã ship ở 0006–0008 — tức tài liệu chỉ sai đúng ở chỗ người ta tra nó để quyết định
> có tạo bảng mới hay không.

Đọc **theo cột dọc**: cột nào có nhiều `W`/`NEW` là điểm nóng dễ đẻ luồng trùng →
phải gom về cụm chung (Phần 3).

| Tính năng | profiles | accounts | categories | transactions | budgets | acct_balances | **Mới cần** |
|-----------|:--------:|:--------:|:----------:|:------------:|:-------:|:-------------:|-------------|
| **GĐ3-2** Giao dịch định kỳ | – | R | R | **W** (sinh) | – | – | ✅ `recurring_rules` (0008) |
| **GĐ3-3** Xuất CSV | R | R | R | R | R | R | – |
| **A** Báo cáo năm | R | R | R | R | R | – | – |
| **B** Sổ lịch | R | – | R | R | – | – | – |
| **C** Chi định kỳ | – | R | R | **W** (sinh) | – | – | ↳ dùng `recurring_rules` |
| **D** Chuyển khoản định kỳ | – | R | – | **W** (sinh) | – | – | ↳ dùng `recurring_rules` |
| **E** Tổng tài sản | R | R | – | – | – | R | – |
| **F** Nợ / cho vay | R | R? | – | W? (trả nợ) | – | – | ✅ `debts` + `debt_payments` (0007) |
| **G** Danh mục mẹ/con | – | – | ✅ `+col parent_id` (0006) | R | R | – | ✅ đã đổi nền categories (0006) |
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
| **Lifetime** Chiếu tài sản cả đời | ✅ `+col birth_year` (0031) | R | R | R | – | R | ✅ `life_scenarios` + `life_phases` + `life_events` (0031/0032) |

**Đọc nhanh ma trận:**

- **transactions** là điểm nóng nhất (nhiều `W`): định kỳ, tách hóa đơn, batch, undo,
  trả nợ đều ghi vào đây. → Mọi thứ sinh/ghi giao dịch **phải đi qua cùng
  `createTransaction`/`updateTransaction` của `Repo`**, không có "đường ghi tắt".
- Trong 4 tính năng từng cần thực thể mới, **3 đã ship**: `recurring_rules` (0008),
  `debts` + `debt_payments` (0007), `categories.parent_id` (0006). **Còn đúng 1 chưa
  quyết:** J — `quick_templates` hay localStorage (mục 5.8). Tất cả phần còn lại là
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

Mô tả thực thể ở mức khái niệm. Mọi bảng mặc định có: `id uuid pk`, `user_id`, RLS
`"own rows"`, composite `unique(id, user_id)` nếu bị bảng khác tham chiếu.

> Ba mục đầu (`recurring_rules`, `debts`, `debt_payments`) và `categories.parent_id`
> **KHÔNG còn là "đích"** — đã ship ở migration 0006–0008; DDL thật ở
> `supabase/migrations/`, phần dưới đây giữ lại vì nó ghi *lý do* của hình dạng, thứ
> migration không nói. Chỉ `quick_templates` và `transactions.group_id` còn là dự định.

### `recurring_rules` — ✅ đã có (0008) · Cụm 1

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

### `debts` — ✅ đã có (0007, mở rộng ở 0011/0014/0021/0023) · Cụm 2

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

### `debt_payments` — ✅ đã có (0007) · Cụm 2

Lịch sử trả từng phần. **Trỏ tới giao dịch thật** để không tách nguồn sự thật về tiền.

| Cột | Kiểu / ý nghĩa |
|-----|----------------|
| `debt_id` | fk debts |
| `amount` | bigint minor (tệ của debt) |
| `paid_on` | date |
| `transaction_id` | fk transactions **null** — nối tới giao dịch sinh ra nếu lần trả này có chuyển tiền thật; null nếu chỉ ghi nhận |

### `categories.parent_id` — ✅ đã có (0006, sửa tiếp ở 0030) · Cụm 3

`parent_id uuid null` self-FK. Ràng buộc: cùng `type` với cha; **đúng 2 tầng** (cha
của một danh-mục-con phải có `parent_id is null`); chặn tự trỏ. Không đổi khóa
`transactions.category_id` / `budgets.category_id`.

### `quick_templates` — NEW, CHƯA có (tùy chọn, Cụm 6)

Chỉ tạo **nếu** chọn phương án đồng bộ (xem Phần 5). Cột: `label`, `type`, `amount`
(minor, tệ tài khoản), `category_id`, `account_id`, `note`, `sort_order`.

### `transactions.group_id` — +col, CHƯA có (tùy chọn, Cụm 4)

Chỉ tạo nếu nâng tách hóa đơn lên "gom nhóm". `group_id uuid null`; các dòng cùng hóa
đơn chung `group_id`.

### Lifetime — ✅ ĐÃ CÓ (migration 0031 + 0032)

Không còn là "schema đích": ba bảng dưới đây đã tồn tại thật. DDL ở
`supabase/migrations/0031_lifetime.sql` và `0032_lifetime_event_fx.sql`; thiết kế ở
[`specs/2026-07-29-lifetime-design.md`](./superpowers/specs/2026-07-29-lifetime-design.md).

**Vì sao KHÔNG bám vào luồng nào có sẵn** (theo Quy tắc vàng ở Phần 0): đây là dữ liệu
**giả định về tương lai**, không phải bản ghi về quá khứ. `transactions` là nguồn sự thật
duy nhất cho tiền ĐÃ chuyển; một chặng đời hay một sự kiện thì chưa xảy ra và có thể không
bao giờ xảy ra. Trộn hai loại vào một bảng là làm mọi câu tổng hợp hiện có phải học thêm
một bộ lọc "chỉ lấy dòng thật". Chiều đọc một phía thì có: khi tạo kịch bản đầu tiên,
`starting_assets_minor` lấy từ `account_balances` + `debts` qua **đúng công thức tài sản
ròng của trang Tài sản** (`assetBreakdown` + `debtSummary`), không tự cộng lại.

#### `profiles.birth_year` — +col (0031)

`int null check (birth_year between 1900 and 2100)`. Cần để đổi qua lại **năm ↔ tuổi** ở
mọi mốc (nghỉ hưu, tự do tài chính). Nullable: chưa khai thì màn `/lifetime` hỏi trước
khi chiếu gì cả — **không đoán**.

#### `life_scenarios`

Một "phương án đời". Người dùng có nhiều bản để so (An toàn / Mạo hiểm / Về VN 2035).

| Cột | Kiểu / ý nghĩa |
|-----|----------------|
| `name` | text — tên hiện ở dải chip kịch bản |
| `display_currency` | ISO 4217 — **đơn vị của đồ thị và bảng năm**. Chặng nhập theo tiền bản địa rồi quy về đây |
| `end_age` | int, default 90, `between 50 and 120` — chiếu tới tuổi này |
| `real_return_bps` | int, default 200, `between -500 and 2000` — lợi suất **THỰC** (đã trừ lạm phát). Âm được: gửi ngân hàng Nhật thời lạm phát |
| `band_spread_bps` | int, default 150, `between 0 and 1000` — **nửa** độ rộng dải dao động: chạy lại engine với `real_return ± giá trị này` |
| `starting_assets_minor` | bigint minor, **theo `display_currency`** (không phải base_currency). Âm được = đang nợ ròng |
| `nominal_terms` | boolean, default false — false = giá hôm nay (mặc định), true = giá danh nghĩa |
| `is_primary` | boolean — kịch bản mà **luật nhắc lệch** và thẻ Lifetime ở trang Tài sản đọc theo. Luật hoà: nhiều bản cùng `is_primary`, hoặc không bản nào → lấy `sort_order` nhỏ nhất (`pickActive` trong `features/lifetime/buildInput.ts`, dùng chung cho cả tầng UI) |
| `sort_order` | int — thứ tự dải chip |

> ⚠️ `starting_assets_minor` theo `display_currency` là một **bất đối xứng tiền tệ nữa**
> (xem cảnh báo ở Phần 1): đổi `display_currency` mà không quy đổi con số này là biến
> ¥11.000.000 thành $110.000. Đường sửa ở UI phải quy đổi hoặc từ chối ghi.

#### `life_phases`

Thu chi **nền** của một quãng đời. **Không có `end_year`**: chặng sau bắt đầu thì chặng
trước kết thúc.

| Cột | Kiểu / ý nghĩa |
|-----|----------------|
| `scenario_id` | composite FK → `life_scenarios (id, user_id)`, cascade |
| `start_year` | int `between 1900 and 2200`; **`unique (scenario_id, start_year)`** — hai chặng cùng năm thì engine không biết chọn cái nào |
| `label` | text — "Hiện tại", "Cưới", "Chuyển sang Mỹ" |
| `country` | text **null** — `'JP'`/`'US'`/`'VN'`/…, KHÔNG ràng buộc enum: chặng có thể là "Cưới". Chặng **cố ý không buộc theo quốc gia** |
| `currency` | ISO 4217 — tiền bản địa của chặng, có thể khác `display_currency` |
| `annual_income_minor` | bigint minor `>= 0`, **theo `currency` của chặng** |
| `annual_expense_minor` | bigint minor `>= 0`, theo `currency` của chặng |
| `fx_to_display` | numeric `> 0`, default 1 — xem ô "Quy ước `fx_to_display`" dưới |

#### `life_events`

Khoản có năm bắt đầu và **tùy chọn** năm kết thúc. Lương hưu là **sự kiện**, không phải
cột trên chặng: người dùng đóng 年金 ở Nhật nhưng nhận khi đã sang Mỹ — gắn vào chặng là
mô hình sai.

| Cột | Kiểu / ý nghĩa |
|-----|----------------|
| `scenario_id` | composite FK → `life_scenarios (id, user_id)`, cascade |
| `start_year` | int `between 1900 and 2200` |
| `end_year` | int **null** = đến hết đời (lương hưu); ngược lại `check (end_year >= start_year)` |
| `kind` | `income` \| `expense` |
| `amount_minor` | bigint minor `>= 0` — số **MỖI NĂM** trong khoảng, KHÔNG phải tổng cả khoảng. Theo `currency` của chính sự kiện |
| `currency` | ISO 4217 — của **sự kiện**, độc lập cả với chặng lẫn `display_currency` |
| `label` · `note` | text; `note` mặc định `''` |
| `fx_to_display` | numeric `> 0`, default 1 (**thêm ở 0032**) |
| `inflate` | boolean, default true — có tăng theo lạm phát hay không. 年金 = false, học phí = true |

#### Quy ước `fx_to_display` (đọc trước khi dùng cột này ở bất kỳ đâu)

`fx_to_display` = **1 đơn vị `currency` của DÒNG ĐÓ = bao nhiêu đơn vị `display_currency`
của kịch bản**, tính theo **MAJOR units**.

- Đây là **CHIỀU NGƯỢC** với `Rates` của `src/lib/rates.ts` (nguyên tắc 0.3), vốn là "1
  base đổi được `rates[X]` đơn vị X". Quy đổi giữa hai chiều là `1 / rate`. Không có
  đường nào để `convertToBase` dùng trực tiếp cột này, và ngược lại.
- Nó là **GIẢ ĐỊNH người dùng khai**, không phải tỷ giá spot: đoán USD/JPY năm 2050 thì
  số nào cũng sai, nên app không giả vờ biết. Giá trị khởi đầu lấy từ tỷ giá hôm nay rồi
  dán nhãn "giả định, sửa được".
- **Tỷ giá không tra được thì lưu `1` — CÓ Ý.** Tổ hợp `currency ≠ display_currency &&
  fx_to_display = 1` là điều kiện mà banner cảnh báo ở `/lifetime` đi bắt. Một tỷ giá đoán
  bừa (khác 1) thì không guard nào thấy. Nguyên tắc: **buộc phải sai thì sai theo cách
  guard của chính mình nhìn ra được.**
- Đổi `currency` của một dòng là **xoá** `fx_to_display` của nó, không giữ lại: con số cũ
  quy về một vế trái khác nên nó không còn nghĩa gì (`fxAfterCurrencyChange` trong
  `features/lifetime/fxField.ts`).

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
