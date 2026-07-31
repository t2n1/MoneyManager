# Thiết kế: Nạp dữ liệu Zaim vào app (script chạy 1 lần)

Ngày: 2026-07-31

## 1. Mục tiêu

Nạp lịch sử giao dịch **Chi/Thu** từ file xuất CSV của Zaim (2017-11 → 2026-07,
~16.000 dòng) vào app Sổ Chi Tiêu, gán **đúng tài khoản** và **đúng danh mục
(tới cấp con)**. Không nạp chuyển khoản và điều chỉnh số dư của Zaim.

Đây là việc **chạy một lần** (backfill lịch sử), không phải tính năng thường trực
trong app. Vì vậy làm bằng **script offline** + cơ chế **sao lưu/khôi phục** sẵn có
của app, không thêm màn hình mới.

## 2. Nguồn dữ liệu

### 2.1 File Zaim (UTF-8)
- File đúng: `Zaim.20260731114811-UTF-08.csv` (UTF-8, chữ Nhật/Việt còn nguyên).
- **KHÔNG dùng** bản `Zaim.20260731112135.csv`: đã bị hỏng mã hóa, mọi chữ không phải
  ASCII biến thành `?` (406.011 dấu `?`), không khôi phục được.
- 16 cột, có tiêu đề:
  `日付, 方法, カテゴリ, カテゴリの内訳, 支払元, 入金先, 品目, メモ, お店, 通貨, 収入, 支出, 振替, 残高調整, 通貨変換前の金額, 集計の設定`
  (index 0..15).
- Ngày dạng `YYYY-MM-DD`. Tiền tệ toàn bộ `JPY`.

Ánh xạ cột dùng đến (0-based):

| idx | Cột Zaim | Ý nghĩa | Dùng làm |
|----:|----------|---------|----------|
| 0 | 日付 | ngày | `occurred_on` |
| 1 | 方法 | payment/income/transfer/balance | lọc + quyết định `type` |
| 2 | カテゴリ | danh mục lớn | nối danh mục |
| 3 | カテゴリの内訳 | danh mục nhỏ | nối danh mục |
| 4 | 支払元 | ví chi ra | nối ví (khi payment) |
| 5 | 入金先 | ví nhận vào | nối ví (khi income) |
| 6 | 品目 | tên món | gộp vào note |
| 7 | メモ | ghi chú | gộp vào note |
| 8 | お店 | cửa hàng | gộp vào note |
| 10 | 収入 | số tiền thu | `amount` khi income |
| 11 | 支出 | số tiền chi | `amount` khi payment |
| 15 | 集計の設定 | cờ tính tổng của Zaim | `exclude_from_stats` |

### 2.2 Backup JSON của app
- Người dùng bấm **Cài đặt → Dữ liệu → Sao lưu → Xuất dữ liệu**, ra file
  `so-chi-tieu-backup-YYYY-MM-DD.json` (định dạng `BackupData`, version 6).
- Script đọc file này để lấy:
  - `profile.user_id` (gán cho mọi giao dịch mới),
  - danh sách `accounts` thật (id, name, currency) — để nối ví,
  - danh sách `categories` thật (id, name, type, parent_id) — để nối danh mục,
  - `transactions` hiện có — để (a) chống trùng, (b) làm nền cộng dồn.

**Quan trọng:** nút **Khôi phục** của app **GHI ĐÈ toàn bộ** dữ liệu bằng nội dung
file. Nên file script xuất ra phải chứa **đủ dữ liệu cũ + giao dịch Zaim mới**. Người
dùng vẫn giữ backup gốc làm bản an toàn.

## 3. Đầu ra

- File `so-chi-tieu-backup-<ngày>-them-zaim.json`: y hệt backup gốc nhưng mảng
  `transactions` đã được **cộng thêm** các giao dịch Zaim. Mọi mảng/khóa khác giữ
  nguyên. `version` giữ nguyên 6.
- Một **báo cáo đối chiếu** in ra màn hình (và/hoặc file .txt): số dòng đã nhập, đã
  bỏ (và lý do), tổng tiền Chi/Thu theo từng ví và từng danh mục — để người dùng so
  với Zaim trước khi khôi phục.

## 4. Quy tắc biến đổi mỗi dòng

Chỉ xử lý dòng `方法 ∈ {payment, income}`. Bỏ `transfer`, `balance`.

> **Bổ sung 2026-08-01 — bốn nhóm "mất ngoài ý muốn".** Bản đầu chỉ có một rổ `tiền = 0`,
> nên bốn hình dạng lỗi dưới đây lặng lẽ rơi vào đó và không ai đếm được. Nay mỗi loại có
> rổ riêng, in kèm ví dụ, và **lẽ ra phải bằng 0**:
>
> - `badAmount` — ô tiền CÓ nội dung nhưng không ra số. `parseYen` giờ đọc được dấu phân
>   cách nghìn (`1,200`), `¥`, khoảng trắng, chữ số toàn rộng; còn lại trả `NaN` (trước đây
>   trả `null` → lẫn vào "tiền = 0" → mất dòng mà báo cáo vẫn trông sạch).
> - `badColumns` — dòng lệch số cột. Ô tiền có dấu phẩy mà không được bọc nháy kép làm cả
>   dòng trượt sang phải, khi đó cột 11 là mảnh của cột khác. Chỉ tha cột thừa RỖNG.
> - `badDate` — ngày không đúng `YYYY-MM-DD` hoặc không phải ngày thật.
> - `nonJpy` — `通貨 ≠ JPY`. Tài khoản app kỳ này đều JPY nên nạp vào là sai đơn vị.
>
> Cả `run.mjs` và `audit.mjs` đều **chốt sổ**: `nạp + mọi loại bỏ = tổng dòng CSV`. Lệch là
> in cảnh báo — không còn chỗ cho dòng biến mất không tên.

1. **type & amount**
   - `payment` → `type = 'expense'`, số tiền lấy từ cột `支出` (idx 11).
   - `income`  → `type = 'income'`,  số tiền lấy từ cột `収入` (idx 10).
   - Số tiền JPY là số nguyên (minor unit = yên), không có phần lẻ.
2. **Bỏ dòng tiền = 0** (88 dòng): app ràng buộc `amount > 0`.
3. **Hoàn tiền** (chi âm, 564 dòng): nếu `支出 < 0` →
   `type = 'expense'`, `amount = |支出|`, `is_refund = true`.
   (App: chi hoàn tiền vừa cộng lại số dư vừa trừ khỏi chi tiêu trong báo cáo.)
   Cột `収入` của income không có giá trị âm nên không cần xử lý phía thu.
4. **Loại khỏi thống kê**: nếu `集計の設定 = '集計に含めない'` →
   `exclude_from_stats = true` (số dư vẫn tính, chỉ ẩn khỏi báo cáo — khớp Zaim).
   Các giá trị hiếm `年の集計にのみ含める` / `月／年の集計にのみ含める` (8 dòng) coi như
   **tính bình thường** (không loại), vì app không có khái niệm tương ứng.
5. **Nối ví → account_id** (bảng ánh xạ ở mục 5):
   - `payment` dùng `支払元` (idx 4); `income` dùng `入金先` (idx 5).
   - Ví `-` hoặc chưa có trong bảng → **tài khoản mặc định** người dùng chỉ định.
6. **Nối danh mục → category_id** (bảng ánh xạ ở mục 6):
   - Khóa nối = cặp `(カテゴリ, カテゴリの内訳)` = (lớn, nhỏ).
   - Giá trị nối có thể là: một `category_id` app, hoặc **"bỏ qua"** (dòng không nhập),
     hoặc rỗng → rơi về danh mục **Khác** (đúng type expense/income).
7. **note** = ghép các phần không rỗng của `お店`, `メモ`, `品目`, phân tách bằng ` · `.
   Nếu tất cả rỗng thì note rỗng.
8. **Các trường khác của giao dịch mới**:
   - `id`: UUID mới (v4).
   - `user_id`: từ `profile`.
   - `to_amount = null`, `to_account_id = null`, `recurring_rule_id = null`.
   - `created_at = updated_at = thời điểm chạy script` (ISO).
   - Các cờ remittance/debt_flow: không đặt (mặc định false/undefined).

## 5. Bảng nối ví → tài khoản

~30 ví Zaim (số trong ngoặc = số dòng Chi/Thu):
thẻ Nhật (楽天カード Master 4187, Paypay後払い, モバイルSuica, 楽天カード Visa, エポスカード…),
ngân hàng (ゆうちょ, 楽天銀行, Paypay銀行, SMBC…), ví/tiền mặt (お財布, Suica, LINE Pay,
Amazon.co.jp, 楽天 Edy, 楽天市場), ví tên Việt (Minh Kome, KOME, Kiệt Kome, Hoàng Kome,
Vãng lai, Chi, Chi Invest, A Hà, Bé Chi, Lã Minh, Minh Credit, Nợ, Ví VN), và `-` (2352).

- Bảng nối do người dùng **duyệt**. Script điền gợi ý dựa trên tên tài khoản thật trong
  backup (khớp gần đúng); phần còn lại người dùng điền.
- Mọi ví chưa nối + `-` → **tài khoản mặc định** (người dùng chọn 1 account_id).

### 5.1 Bảng nối ví đã chốt (2026-07-31)

| Ví Zaim | → Tài khoản app |
|---|---|
| 楽天カード (Master), 楽天カード(Visa), 楽天市場, Amazon.co.jp | Credit Rakuten |
| Paypay 後払い | Credit Paypay |
| Paypay, モバイルSuica, Suica, **và mặc định** (`-`, SMBC, Vãng lai, Kome/tên người, …) | Paypay Wallet |
| お財布, LINE Pay, 楽天 Edy | Ví |
| ゆうちょ銀行 | Yucho Bank |
| 楽天銀行 | Rakuten Bank |
| Paypay銀行 | Paypay Bank |
| エポスカード | Credit EPOS |

**Tài khoản mặc định = Paypay Wallet** (mọi ví không liệt kê ở trên).

## 6. Bảng nối danh mục (tới cấp con)

- Chi: **81 cặp** (lớn>nhỏ) trên 17 nhóm. Thu: **7 cặp** trên 7 nhóm.
- Script **điền sẵn gợi ý** map sang danh mục cha>con của app (bộ v3), ví dụ:
  `食費>昼ご飯 → Ăn uống>Bữa trưa`, `交通>電車 → Đi lại>Tàu điện`,
  `住まい>家賃 → Nhà ở>Tiền nhà`… Người dùng chỉ sửa chỗ lệch.
- Cặp không có trong bảng → danh mục **Khác** đúng type.
- Giao dịch được phép gán vào **nhóm cha** (không bắt buộc lá) — đã xác minh: ràng buộc
  "chỉ lá" chỉ áp cho ngân sách (migration 0024), không áp cho giao dịch.

### 6.1 Quyết định đã chốt với người dùng (2026-07-31)

**Tạo danh mục mới** (script tự thêm vào backup, UUID mới, đúng nhóm cha):
- `美容・衣服>美容院` → tạo **Cắt tóc** dưới **Thời trang**.

**Gộp vào danh mục có sẵn:**
- `日用雑貨>Household Supplies` (479) → **Nhà ở>Đồ bếp**
- `クルマ>Rent-a-Car` (79) → **Đi lại>Ô tô**
- `住まい>家電` / `大型出費>家電` (~23) → **Nhà ở>Nội thất**

**Nối vào nhóm có sẵn của người dùng** (khác bộ v3):
- `税金>住民税` (4) → **Thuế & An sinh>Thuế cư trú (住民税)**; `税金>その他` (9) → nhóm cha
  **Thuế & An sinh**. (App người dùng đã có nhóm này — khác bộ mặc định.)

**BỎ QUA — không nhập** (đếm vào báo cáo lý do bỏ):
- `交通>会社交通費` (**1.391**) — tiền đi lại công ty, không phải chi tiêu cá nhân.
- Thu `事業所得` (7) — người dùng chọn bỏ.
- **Đầu tư** `証券>*` (投資信託/金/暗号資産/Investment, 65) — mua đầu tư là chuyển khoản, không phải Chi.
- **Dịch chuyển tiền** trong `その他`: `電子マネーにチャージ` (833), `カードの引落` (123),
  `海外送金` (58), `現金の引出` (1), `立替金` (2).

**Gộp về nhóm gần nhất** (ít dòng, mặc định của tôi — người dùng soát lại ở báo cáo đối chiếu):
- `クルマ>高速料金` (83) → **Đi lại>Ô tô**
- `交通>自転車` (71) → **Đi lại** (nhóm cha; app chưa có "Xe đạp")
- `通信>インターネット関連費` (37) → **Nhà ở>Điện thoại**
- `エンタメ>ゲーム` (30) → **Sở thích** (nhóm cha; app chưa có "Game")

**Còn lại** (mục 6 gạch đầu dòng "cặp không có trong bảng") → **Khác** đúng type. Gồm các
cặp ít dùng ở mục D: `レジャー`, `音楽`, `映画・動画`, `リフォーム`, `住宅保険`, `宅配便`,
`切手・はがき`, `免許教習`, `立替金返済`, và các `その他`/`未分類`/`使途不明金`.

## 7. Chống trùng

- Khóa chống trùng = `occurred_on | type±amount | account_id | note`.
- Trước khi thêm, đối chiếu với `transactions` trong backup theo khóa này; dòng nào đã
  có thì bỏ (đếm vào báo cáo). Nhờ vậy lỡ chạy lại / khôi phục 2 lần cũng không nhân đôi.

## 8. Kiến trúc code

Thư mục `scripts/zaim-import/`, chạy bằng Node (đọc file, không cần Supabase):

- `parseZaimCsv.ts` — đọc CSV UTF-8 → mảng bản ghi có kiểu (thuần, test được).
- `transform.ts` — hàm thuần: (bản ghi Zaim + bảng nối ví + bảng nối danh mục +
  tài khoản mặc định) → danh sách giao dịch mới + thống kê lý do bỏ. **Trọng tâm test.**
- `mapping.ts` — bảng nối ví & danh mục (gợi ý mặc định + chỗ người dùng chỉnh).
- `run.ts` — CLI: nhận đường dẫn CSV + backup, gọi parse→transform, gộp vào backup,
  ghi file ra, in báo cáo đối chiếu.
- `transform.test.ts` — test Vitest cho các quy tắc mục 4 (hoàn tiền, tiền 0, exclude,
  nối ví/danh mục, bỏ qua, chống trùng).

Ranh giới: `parse` chỉ đọc; `transform` chỉ biến đổi (không I/O); `run` chỉ ghép file &
I/O. Nhờ tách vậy phần logic dễ test và dễ soát.

## 9. Kiểm chứng trước khi nạp

1. Chạy script → xem báo cáo đối chiếu (tổng Chi/Thu theo ví, theo danh mục, số bỏ).
2. So số tổng với màn hình tổng kết của Zaim cùng kỳ.
3. Nếu khớp → dùng **Khôi phục** nạp file mới. Nếu lệch → chỉnh bảng nối, chạy lại.

## 9b. Kiểm chứng SAU khi nạp (bổ sung 2026-08-01)

Ba bước trên chỉ chứng minh script *dựng ra* đúng thứ, không chứng minh những thứ đó *vào
được app*. Nút Khôi phục xoá sạch rồi chèn lại, mỗi bảng một request, không có transaction
bao ngoài — đứt giữa đường là app còn một nửa. Nên có thêm `audit.mjs`:

```bash
node scripts/zaim-import/audit.mjs <zaim.csv> <backup-MỚI-xuất-từ-app.json>
```

Nó dựng lại bộ giao dịch kỳ vọng từ CSV (dùng **cùng** `transform.mjs` + `resolve.mjs` với
đường nạp, nên không thể lệch luật), rồi so **theo bội** với bản xuất mới của app:

- **Phần A** — sổ dòng CSV + chốt sổ.
- **Phần B** — khớp / thiếu / thừa, bảng tháng nào hụt bao nhiêu dòng & bao nhiêu tiền,
  20 dòng thiếu đầu tiên. ("Thừa" = giao dịch tự nhập tay, không phải lỗi.)
- **Phần C** — mọi cặp `カテゴリ>内訳`: số dòng, số tiền, đi về danh mục nào, kèm cờ
  `✗` bỏ hẳn · `!` rơi vào Khác · `^` gán vào nhóm cha (ngân sách chỉ đặt ở lá nên không
  thấy) · `?` phỏng đoán (bảng không có cặp này, phải dùng mặc định của nhóm).
- **Phần D** — ví → tài khoản, đếm riêng số dòng phải dùng **tài khoản mặc định**.
- **Phần E** — khoản ròng mà 9 năm lịch sử cộng thêm vào từng tài khoản. Đây là lượng
  **số dư đang sai**: `initial_balance` không biết gì về lịch sử mới nạp. Sửa bằng
  Điều chỉnh số dư (mục X) từng tài khoản.

Toàn bộ luật đối chiếu nằm trong `audit-lib.mjs` (hàm thuần, có test). Hướng dẫn đọc báo
cáo + ba chỗ trong bảng nối nên xem lại: [`scripts/zaim-import/README.md`](../../../scripts/zaim-import/README.md).

## 9c. Hai lớp bảo vệ đã thêm vào chính app (2026-08-01)

Cùng đợt này sửa `importAll` ở **cả hai repo** (`src/data/backupImport.ts`, có test):

- **Soát trước khi xoá** — `validateBackupPayload` kiểm tính toàn vẹn của file (giao dịch trỏ
  tới tài khoản/danh mục không có trong file, danh mục con mất cha, id trùng, số tiền ≤ 0,
  ngày sai dạng, chuyển khoản thiếu đích, nhãn trỏ tới giao dịch không có…). Có vấn đề thì
  **throw trước khi xoá bất cứ thứ gì**, kèm danh sách gom theo loại. Trước đây file hỏng =
  mất dữ liệu cũ rồi mới biết chèn không được.
- **Chèn theo lô 500 dòng** — 16.000 giao dịch trong một request dễ vượt giới hạn kích thước
  body và statement timeout của Postgres. Hàm chèn nhận thẳng callback `(part) => sb.from(…)
  .insert(part)` để TypeScript vẫn soi payload theo đúng cột từng bảng.

demoRepo soát **y hệt** bản thật, để "thử ở demo thấy chạy" nói được điều gì đó về bản
Supabase (xem bài học ở `demo-mode-khong-kiem-rang-buoc`).

## 10. Ngoài phạm vi (YAGNI)

- Không nạp `transfer` và `balance` của Zaim; không nạp `証券` (đầu tư) và các dòng
  dịch chuyển tiền trong `その他` (mục 6.1).
- Không tự tạo **tài khoản** mới (người dùng nối ví vào tài khoản đã có).
- Script CÓ tạo **danh mục** mới khi cần — hiện chỉ **Cắt tóc** (mục 6.1); thêm với UUID
  mới, gắn `parent_id` đúng nhóm cha, `user_id` từ profile.
- Không làm màn nhập Zaim trong app (chỉ script 1 lần).
- Không đụng chuyển khoản nội bộ / thẻ tín dụng tự trả.
