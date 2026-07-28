# Thông báo trong app — chuông + danh sách

Ngày: 2026-07-28

## Mục tiêu

Cho người dùng biết **những việc về tiền đang cần xử lý** mà không phải tự đi mò
từng trang. Hiện app đã có [`RemindersBanner`](../../../src/features/reminders/RemindersBanner.tsx)
báo 4 việc (nợ quá hạn, nợ sắp đến hạn, vượt ngân sách, lâu chưa ghi sổ), nhưng chỉ
hiện ở trang Sổ giao dịch, bấm ✕ là mất tới khi đóng app, và không nhớ gì cả.

Tiêu chí thành công: **không spam**. Cụ thể là 4 luật:

1. Chỉ báo việc người dùng **làm được gì đó**. Tin chỉ để đọc cho biết mà không dẫn
   tới hành động nào thì không báo.
2. Báo **lúc còn kịp cứu**, không báo sau khi tiền đã mất.
3. **Một việc báo một lần** — chưa xử lý xong thì im, không nhắc lại mỗi ngày.
4. **Tắt được từng loại**.

Ước lượng khối lượng: tháng êm khoảng 3–5 tin, tháng có chuyện khoảng 8–10.

## Quyết định đã chốt (với user)

- **Làm chuông trong app trước, chừa chỗ nối push sau.** Đợt này không đụng service
  worker, không xin quyền thông báo, không bảng đăng ký thiết bị.
- **Tính tại chỗ trên máy, chỉ lưu trạng thái đã đọc/đã tắt.** Không dựng job chạy
  nền sinh sẵn thông báo vào bảng. Lý do: dữ liệu tiền bạc mà hiện tin cũ sai thì tệ
  hơn hiện chậm — nạp tiền vào thẻ xong mở app là tin tự hết.
- **Chia hai loại thông báo:** *việc cần làm* (bám tới khi tình huống hết thật) và
  *tin để biết* (đọc là mất).
- **Giao diện:** chuông đặt cạnh nút tìm kiếm ở trang Sổ giao dịch, **giữ dải màu
  hiện tại nhưng bóp còn tối đa 1 dòng**, chỉ dành cho mức đỏ. Không thêm tab thứ 5.
- **Khoản lạ trong sao kê** không đưa vào chuông — chuyển thành phần soát ngay trên
  màn xem trước CSV. Tránh phải thêm cột đánh dấu nguồn giao dịch.
- **Tỷ giá JPY→VND đẹp:** đợt này chỉ âm thầm ghi lịch sử tỷ giá, chưa bật luật báo.
- **Không cho chỉnh ngưỡng** ở đợt này, chỉ bật/tắt từng loại.

## Phạm vi

- Migration `0029_notifications.sql`: bảng `notification_state`, bảng `fx_history`,
  cột `profiles.notif_off`.
- Thư mục mới `src/features/notifications/`: bộ luật thuần (`rules.ts` + các file
  luật con), hook `useNotifications.ts`, `NotificationBell.tsx`,
  `NotificationSheet.tsx`, `NotificationSettingsPage.tsx`.
- Sửa [`RemindersBanner.tsx`](../../../src/features/reminders/RemindersBanner.tsx):
  bóp còn tối đa 1 dòng, lấy dữ liệu từ bộ luật mới. Xoá
  [`reminders.ts`](../../../src/features/reminders/reminders.ts) — luật của nó được
  chuyển vào bộ luật mới đầy đủ hơn, kèm `reminders.test.ts`.
- Sửa [`rates.ts`](../../../src/lib/rates.ts): lấy tỷ giá xong thì ghi thêm một dòng
  vào `fx_history`.
- Sửa [`ImportCsvPage.tsx`](../../../src/features/import/ImportCsvPage.tsx): tô đỏ
  dòng to bất thường ở màn xem trước.
- Mở rộng [`repo.ts`](../../../src/data/repo.ts) + `supabaseRepo.ts` + `demoRepo.ts`.
- Thêm route `/settings/notifications` + lối vào từ trang Cài đặt.
- **Không** đụng luồng nhập giao dịch. **Không** thêm cột nào trên `transactions`.
  **Không** thêm bộ test giao diện.

## A. Kiến trúc

Bốn mảnh, mỗi mảnh một việc:

**a) Bộ luật — hàm thuần.** `buildNotifications(input)` nhận một cục dữ liệu và trả
ra mảng thông báo. Không đụng React, không đụng mạng, **không đọc đồng hồ hệ thống**
(ngày hôm nay truyền vào). Cùng lối viết với
[`cardAutopay.ts`](../../../src/lib/cardAutopay.ts) và
[`health.ts`](../../../src/features/health/health.ts) nên unit-test được trực tiếp.

Chia nhỏ theo nhóm luật, mỗi file một mối quan tâm và một file test đi kèm:

| File | Luật |
|------|------|
| `rules/accountRules.ts` | 1, 2 — dùng lại `cardFunding()` từ `features/assets/aggregate.ts` |
| `rules/debtRules.ts` | 3, 4 |
| `rules/budgetRules.ts` | 5, 6, 7 |
| `rules/cardRules.ts` | 8 |
| `rules/rhythmRules.ts` | 9, 10, 11, 12, 13 |
| `rules.ts` | gom kết quả, xếp thứ tự, gộp trùng, cắt trần |

**b) `useNotifications()`.** Gom dữ liệu từ các hook sẵn có trong
[`queries.ts`](../../../src/hooks/queries.ts) (`useAccounts`, `useAccountBalances`,
`useDebts`, `useBudgetReport`, `useRecurringRules`, `useSavingsGoals`,
`useNetWorthSnapshots`, `useRangeTransactions`, `useProfile`), gọi
`buildNotifications`, lọc theo `notif_off` và theo trạng thái đã đọc/đã tắt. Trả ra
danh sách đã chia nhóm + số hiện trên chuông.

**c) Bảng `notification_state`** — chỉ lưu trạng thái, không lưu nội dung.

**d) Giao diện** — chuông, tấm trượt, dải màu 1 dòng, trang cài đặt.

**Hiệu năng khởi động:** bộ luật đầy đủ và tấm trượt **nạp trễ** (lazy) như các trang
phụ khác trong [`App.tsx`](../../../src/App.tsx). Lúc mở app chỉ chạy phần đếm số.

## B. Hình dạng một thông báo

```ts
interface AppNotification {
  /** Mã ổn định — dùng làm khoá cho trạng thái đã đọc/đã tắt. */
  key: string
  /** 'action' = việc cần làm · 'info' = tin để biết. */
  kind: 'action' | 'info'
  /** Loại, dùng để bật/tắt trong cài đặt. */
  type: NotificationType
  severity: 'high' | 'medium' | 'low'
  title: string
  /** Dòng phụ giải thích; không bắt buộc. */
  detail?: string
  /** Ngày liên quan (ngày trừ tiền, ngày hẹn nợ…); không bắt buộc. */
  onISO?: string
  /** Bấm vào thì đi đâu. */
  to: string
}
```

### Quy ước đặt mã — quan trọng

- **Việc cần làm: `<type>:<id đối tượng>`, KHÔNG kèm kỳ.** Ví dụ
  `account-shortfall:<accountId>`, `budget-over:<categoryId>`.
- **Tin để biết: `<type>:<id đối tượng>:<kỳ>`.** Ví dụ
  `card-statement-day:<cardId>:2026-07`, `savings-milestone:<goalId>:50`,
  `stale-entry:2026-W31` (tuần ISO), `monthly-summary:2026-07`. Phần kỳ theo tháng
  dùng đúng `MonthKey` mà app đang dùng — tức là chu kỳ theo `month_start_day`, không
  phải tháng dương lịch.

Lý do khác nhau: xem mục E (vòng đời).

## C. Danh sách thông báo

### C.1 Việc cần làm (`kind: 'action'`)

| # | `type` | Nội dung | Điều kiện nổi lên | Mức |
|---|--------|----------|-------------------|-----|
| 1 | `account-shortfall` | "Rakuten Bank thiếu ¥22.000 — 14 ngày tới phải trả ¥62.000 (thẻ Rakuten ¥45.000 · tiền nhà ¥17.000)" | Xem công thức bên dưới | high |
| 2 | `account-negative` | "Ví tiền mặt đang âm ¥1.200" | Số dư < 0. **Chỉ xét tài khoản tiền mặt/ngân hàng** — thẻ tín dụng mang số âm là bình thường, không báo. | high |
| 3 | `debt-overdue` | "Anh Tuấn mượn ¥50.000 — quá hạn 6 ngày" | Khoản còn mở, qua ngày hẹn | high |
| 4 | `debt-due-soon` | "Trả góp máy ảnh đến hạn trong 4 ngày" | Khoản còn mở, còn ≤ 7 ngày | medium |
| 5 | `budget-over` | "Giải trí đã vượt ngân sách ¥3.200" | Chi tháng này > hạn mức | high |
| 6 | `budget-pace` | "Ăn ngoài tiêu nhanh hơn nhịp — mới qua 42% tháng đã dùng 71% hạn mức" | Xem công thức bên dưới | medium |
| 7 | `budget-parent-over` | "Nhóm Sinh hoạt: các mục con đã tiêu vượt trần nhóm ¥8.400" | Tổng chi thực tế của các mục con > trần của mục cha | medium |

**Công thức mục 1 — nhìn trước 14 ngày, chỉ tính những khoản đã biết chắc:**

```
số dư hiện tại
  + thu vào chắc chắn   (chỉ các quy tắc định kỳ THU đổ vào chính tài khoản này,
                         đến hạn trong 14 ngày — thường là lương)
  − dư nợ các thẻ       (mọi thẻ lấy tài khoản này làm nguồn trả,
                         VÀ có ngày trả kế tiếp trong 14 ngày)
  − quy tắc định kỳ CHI (trừ khỏi tài khoản này, đến hạn trong 14 ngày)
  < 0   →  báo thiếu
```

Không đoán thu nhập từ lịch sử — không có quy tắc định kỳ thu thì coi như không có
tiền vào. Việc tính thu vào là để tránh báo động giả mỗi tháng vào mấy ngày trước
kỳ lương.

**Phần dư nợ thẻ dùng lại [`cardFunding()`](../../../src/features/assets/aggregate.ts)
đang có**, không tự tính lại. Hàm đó đã xử lý đúng ca khó: nhiều thẻ rút chung một
tài khoản nguồn thì phân bổ tuần tự, nên tổng thiếu của các thẻ khớp với thiếu gộp
của nguồn. Dùng lại còn để **chuông và trang Tài sản luôn nói cùng một con số** —
hai chỗ vênh nhau thì người dùng không biết tin ai.

Hệ quả: dư nợ lấy theo **số dư thẻ hiện tại**, không phải số dư tại ngày chốt sao kê.
Nếu tiêu thêm sau ngày chốt thì con số này hơi cao hơn thực tế. Chấp nhận được vì
thông báo chỉ nổi khi ngày trả còn ≤ 14 ngày — lúc đó hầu như đã qua ngày chốt rồi.

**Không tính nợ/cho vay vào công thức này.** Bảng `debts` không có cột tài khoản, nên
app không biết khoản nợ sẽ trả từ ví nào — không có cơ sở để trừ vào bất kỳ tài khoản
nào. Nợ đến hạn đã có mục 3 và 4 lo.

**Công thức mục 6 — cả ba điều kiện phải đúng:**

- `tỷ lệ đã tiêu − tỷ lệ ngày đã qua > 0.25`
- `tỷ lệ ngày đã qua ≥ 1/3` (không báo vào đầu tháng chỉ vì mua một món to)
- `hạn mức của mục ≥ 5% tổng hạn mức tháng` — mẫu số là tổng hạn mức của **các mục
  lá** trong tháng đó (khớp mô hình leaf-only ở migration 0024), quy đổi về base
  currency. Dùng tỷ lệ thay vì một con số cứng để khỏi phụ thuộc loại tiền.

Chu kỳ tháng lấy theo `profiles.month_start_day`, **không** phải ngày 1 dương lịch.

### C.2 Tin để biết (`kind: 'info'`)

| # | `type` | Nội dung | Nhịp |
|---|--------|----------|------|
| 8 | `card-statement-day` | "Hôm nay thẻ PayPay chốt sao kê — mua từ mai sẽ trả kỳ sau" | Mỗi thẻ 1 lần/tháng, đúng ngày chốt |
| 9 | `recurring-suggestion` | "Thấy ¥980 trả đều mỗi tháng cho Netflix — tạo quy tắc định kỳ?" | Dùng [`recurringRadar.ts`](../../../src/lib/recurringRadar.ts) sẵn có. Mỗi gợi ý 1 lần, tắt là mất hẳn |
| 10 | `stale-entry` | "Đã 5 ngày chưa ghi giao dịch nào" | Từ 3 ngày; mã theo tuần nên tối đa 1 lần/tuần |
| 11 | `savings-milestone` | "Quỹ mua xe đã đạt 50%" | Mốc 25 / 50 / 75 / 100%, mỗi mốc 1 lần |
| 12 | `networth-record` | "Tài sản ròng cao nhất từ trước tới nay: ¥4.280.000" | Cần ≥ 3 bản chụp; mã theo tháng nên tối đa 1 lần/tháng |
| 13 | `monthly-summary` | "Tháng 7: chi ¥182.000, thu ¥280.000, để dành ¥98.000" | Vào ngày đầu kỳ mới, 1 lần/tháng |

### C.3 Hai thứ đã cân nhắc rồi bỏ

- **"Quy tắc định kỳ đến ngày mà chưa sinh giao dịch"** — chạy bù đã làm mỗi lần mở
  app tại [`AppLayout.tsx:62`](../../../src/components/AppLayout.tsx:62), nên gần như
  không bao giờ xảy ra.
- **"Tổng kết tuần"** — 4 tin/tháng chỉ để đọc cho biết, đúng định nghĩa spam.

### C.4 Luật gộp và trần số lượng

- **Không báo hai lần cùng một ý:** một mục ngân sách đã `budget-over` thì
  `budget-pace` của chính mục đó không xuất hiện.
- **Gộp cùng loại:** từ 3 khoản nợ quá hạn trở lên → một dòng "3 khoản nợ quá hạn",
  bấm vào ra trang nợ. Mã của dòng gộp là `debt-overdue:group`; các mã lẻ
  `debt-overdue:<debtId>` không xuất hiện khi đang gộp. Trả bớt còn 2 khoản thì quay
  về hai dòng lẻ, và hai dòng lẻ đó tính là **chưa đọc** — đúng ý, vì tình hình đã
  đổi và đáng nhìn lại.
- **Gộp theo tài khoản:** mục 1 gộp thẻ + định kỳ + nợ thành **một dòng cho mỗi tài
  khoản**, liệt kê các khoản trong dòng phụ, thay vì bắn ba tin riêng.
- **Trần:** tấm trượt hiện tối đa **5 việc cần làm + 3 tin để biết**; phần thừa gom
  vào dòng "Còn N tin khác", bấm mới xổ.
- **Thứ tự:** high → medium → low; cùng mức thì theo thứ tự đánh số trong bảng C.1
  và C.2.

## D. Giao diện

### D.1 Chuông

- **Điện thoại:** nút chuông đặt trong hàng chuyển tháng ở
  [`LedgerPage.tsx`](../../../src/features/transactions/LedgerPage.tsx), ngay cạnh
  nút tìm kiếm. Thêm **chấm đỏ trên tab "Sổ GD"** ở thanh dưới để thấy được từ tab
  khác.
- **Máy tính:** nút chuông ở đầu sidebar, cạnh
  [`PrivacyToggle`](../../../src/components/PrivacyToggle.tsx).
- **Số đỏ chỉ đếm việc cần làm chưa đọc.** Tin để biết không bao giờ làm chuông đỏ,
  chỉ làm chấm xám.

### D.2 Tấm trượt / bảng thả xuống

Điện thoại: tấm trượt lên từ đáy, cùng lối với các sheet sẵn có. Máy tính: bảng thả
xuống dưới nút chuông.

- Hai nhóm tách bạch, có tiêu đề nhóm: **Việc cần làm** rồi **Tin để biết**.
- **Việc cần làm không có nút ✕.** Không tắt tay được — nạp tiền vào, trả nợ, hết
  tháng thì nó tự biến mất. Muốn khỏi thấy hẳn thì tắt cả loại trong cài đặt. Lý do:
  nút ✕ chính là chỗ người ta bấm cho khuất mắt rồi quên mất là đang thiếu tiền.
- **Đã đọc thì mờ đi, vẫn nằm đó.** Thôi tính vào số đỏ nhưng không mất, vì việc chưa
  xong.
- **Tin để biết có nút ✕**, bấm là mất ngay và không quay lại.
- Bấm vào một dòng → đi thẳng tới chỗ xử lý theo `to`, đồng thời đánh dấu đã đọc.
- **Mở tấm trượt = đánh dấu đã đọc tất cả thông báo đang hiện**, nhưng chúng
  **không biến mất ngay trước mắt** — vẫn nằm nguyên đó cho tới khi đóng tấm trượt,
  để còn kịp bấm vào. Lần mở sau: việc-cần-làm hiện lại ở dạng mờ (việc chưa xong),
  tin-để-biết thì không hiện nữa.
- Không có việc nào → một dòng xanh "Không có gì cần để ý 👍".
- Nút ⚙️ ở góc dẫn sang trang cài đặt thông báo.

### D.3 Dải màu ở đầu trang Sổ giao dịch

[`RemindersBanner.tsx`](../../../src/features/reminders/RemindersBanner.tsx) giữ lại
nhưng bóp lại: **tối đa một dòng**, chỉ nhận thông báo `kind: 'action'` +
`severity: 'high'`, lấy cái đứng đầu theo thứ tự ưu tiên. Không có nút ✕ (đúng luật
D.2). Không có việc mức high → không hiện gì.

Bỏ cơ chế `sessionStorage` ẩn tạm hiện tại — trạng thái đã đọc giờ nằm ở Supabase.

### D.4 Trang cài đặt `/settings/notifications`

Danh sách 13 loại, mỗi loại một công tắc, chia hai nhóm đúng như trong tấm trượt.
Mỗi loại có một câu mô tả ngắn kèm ví dụ. Tất cả mặc định **bật**.

## E. Vòng đời trạng thái

Đây là chỗ dễ hỏng nhất, nên tách riêng.

- Người dùng đọc/tắt → ghi một dòng `notification_state`.
- **Sau mỗi lần tính danh sách, xoá các dòng trạng thái của việc-cần-làm mà mã không
  còn nằm trong danh sách vừa tính.** Việc đã xong thì trạng thái cũng đi theo. Nhờ
  vậy mã của việc-cần-làm không cần kèm kỳ, và nếu tình huống tái diễn (tài khoản âm
  trở lại tháng sau) thì nó lại đỏ như mới chứ không bị coi là "đã đọc từ đời nào".
- **Trạng thái của tin-để-biết KHÔNG bị xoá theo cách đó** — đã tắt gợi ý "tạo quy
  tắc Netflix" thì phải tắt vĩnh viễn. Vì vậy mã của tin-để-biết có kèm kỳ để lần sau
  vẫn ra tin mới.
- **Dọn rác:** mỗi lần mở app, xoá các dòng `created_at` cũ hơn 12 tháng. Một câu
  `delete`, không cần đặt lịch.

## F. Data model (migration 0029)

```sql
create table public.notification_state (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  key          text        not null,
  read_at      timestamptz,
  dismissed_at timestamptz,
  pushed_at    timestamptz,
  created_at   timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.notification_state enable row level security;
create policy "own rows" on public.notification_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index notification_state_cleanup_idx
  on public.notification_state (user_id, created_at);

-- Loại thông báo đã tắt; mảng rỗng = bật hết.
alter table public.profiles
  add column notif_off text[] not null default '{}';

-- Lịch sử tỷ giá — đợt này chỉ ghi, chưa có luật nào đọc.
create table public.fx_history (
  user_id uuid  not null references auth.users (id) on delete cascade,
  on_date date  not null,
  base    text  not null,
  rates   jsonb not null,
  primary key (user_id, on_date, base)
);

alter table public.fx_history enable row level security;
create policy "own rows" on public.fx_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

`pushed_at` chưa dùng đợt này nhưng thêm sẵn cho rẻ — sau nối push khỏi phải làm
migration lần hai.

`fx_history` gắn `user_id` dù tỷ giá là dữ liệu chung: để dùng lại đúng policy
"own rows" như mọi bảng khác, khỏi phải nghĩ về quyền đọc chéo. Một dòng mỗi ngày,
không đáng lo về dung lượng.

**Lớp repo:** ba thứ trên đi qua [`repo.ts`](../../../src/data/repo.ts) nên phải viết
cả bản Supabase lẫn bản demo. Chế độ demo (không đăng nhập, lưu localStorage) phải
chạy đủ tính năng, kể cả chuông.

## G. Khoản lạ trong sao kê CSV

Không phải thông báo — là phần soát ngay trên màn xem trước
[`ImportCsvPage.tsx`](../../../src/features/import/ImportCsvPage.tsx).

- Dòng nào có số tiền **> 3 lần trung vị chi của 90 ngày gần nhất** thì tô nền đỏ nhạt
  kèm nhãn "khoản lớn bất thường".
- Chỉ tô màu để soát bằng mắt — **không chặn lưu**, không cần bấm xác nhận gì thêm.
- Chưa đủ 90 ngày dữ liệu → không tô gì (thiếu dữ liệu thì im, không đoán).

## H. Hỏng thì sao

- **Thiếu dữ liệu thì im, không đoán** — nguyên tắc đã ghi ở đầu
  [`health.ts`](../../../src/features/health/health.ts). Thẻ chưa khai tài khoản
  nguồn → không báo thiếu tiền.
- **Chuông hỏng không được làm chết app.** Cả khối bọc trong error boundary; hỏng thì
  chuông ẩn luôn, phần còn lại của app chạy bình thường. Cùng tinh thần với
  `.catch(() => {})` ở [`AppLayout.tsx:72`](../../../src/components/AppLayout.tsx:72).
- **Ghi "đã đọc" hỏng thì kệ.** Đánh dấu trên máy trước cho mượt; gửi lên Supabase
  thất bại thì lần mở sau gửi lại. Xấu nhất là thấy lại một tin đã đọc.
- **Mất mạng vẫn có chuông** — React Query đã lưu cache xuống ổ, bộ luật vẫn tính
  được từ dữ liệu lần trước.
- **Ghi `fx_history` hỏng thì bỏ qua** — không được làm hỏng việc lấy tỷ giá.

## I. Kiểm thử

Chỉ test phần thuần bằng Vitest, không thêm bộ test giao diện.

- Mỗi luật ít nhất **3 ca: chưa tới ngưỡng · vượt ngưỡng · đúng ngay ranh giới**.
- **Mã phải ổn định** — gọi hai lần với cùng dữ liệu phải ra cùng mã. Mã đổi là "đã
  đọc" mất tác dụng và tin đã tắt sống dậy. Đây là chỗ dễ hỏng nhất nên có test riêng.
- **Vòng đời trạng thái (mục E):** việc-cần-làm hết thì dòng trạng thái bị xoá;
  tin-để-biết đã tắt thì không bị xoá; tình huống tái diễn thì lại đỏ như mới.
- **Các ca chống spam:** `budget-over` đè `budget-pace`; ba khoản nợ gộp một dòng;
  trần 5 + 3 cắt đúng chỗ; mục 1 gộp theo tài khoản.
- **Chu kỳ tháng theo `month_start_day`**, không phải ngày 1 dương lịch.
- **Không đọc đồng hồ hệ thống** — ngày hôm nay truyền vào, nên chạy giờ nào múi giờ
  nào cũng ra một kết quả.
- Test câu dọn dòng cũ hơn 12 tháng.
- Test ngưỡng tô đỏ ở màn CSV (mục G).

## J. Chừa chỗ cho push (không làm gì thêm bây giờ)

`rules.ts` không đụng React, không đụng trình duyệt, đầu vào là một cục dữ liệu
thuần. Sau này một Supabase Edge Function chạy trên Deno import thẳng chính file đó,
tự lấy dữ liệu từ Postgres dựng cùng cấu trúc `NotificationInput`, đối chiếu
`pushed_at` để không gửi trùng, rồi gửi Web Push.

Ràng buộc phải giữ để chuyện đó còn khả thi:

- `rules.ts` và mọi file trong `rules/` **chỉ được import kiểu dữ liệu và hàm thuần**
  — không React, không `window`, không `localStorage`, không `Date.now()`.
- `NotificationInput` chỉ chứa dữ liệu thuần **và các hàm thuần được tiêm vào**, theo
  đúng lối `buildBudgetReport(…, currencyOf, parentOf)` đang dùng.

**Cụ thể: `formatMoney` phải được tiêm vào, không được import thẳng.**
[`formatMoney`](../../../src/lib/money.ts) đọc trạng thái chế độ riêng tư toàn cục
(`isPrivacyEnabled()`), nên import thẳng vào bộ luật là kéo theo trạng thái trình
duyệt — Edge Function chạy sẽ hỏng. Vì vậy `NotificationInput` mang một trường
`formatMoney: (minor: number, currency: CurrencyCode) => string`. Phía app tiêm hàm
thật vào (nhờ đó bật chế độ riêng tư thì số tiền trong thông báo cũng bị che, đúng ý);
phía Edge Function sau này tiêm bản định dạng riêng của nó.
