# Lifetime — chiếu tài sản ròng cả đời

Ngày: 2026-07-29

## Mục tiêu

Trả lời câu hỏi mà sổ chi tiêu không trả lời được: **tiền của tôi có đủ đi hết đời
không**. Lấy cảm hứng từ [Zaim 一生黒字プラン](https://lifetime.zaim.net/) — nhập
hiện trạng và dự định, app vẽ đồ thị tài sản đến cuối đời kèm bảng thu chi từng năm.

Người dùng (người Việt ở Nhật, dự định sang Mỹ 2029–2030) muốn cả 4 câu hỏi:

1. Tài sản có bao giờ âm không?
2. Có đủ tiền cho các mốc lớn (mua nhà, con học đại học)?
3. Bao giờ tự do tài chính?
4. Ở Nhật vs đi Mỹ vs về VN khác nhau bao nhiêu?

**Cả 4 chạy trên đúng một engine** — một bảng chiếu dòng tiền theo năm. Khác nhau chỉ
ở cách đọc kết quả. Nên đây không phải 4 tính năng mà là **1 engine + 4 cách đọc**.

Lợi thế duy nhất so với một file Excel: app có **12 tháng chi tiêu thật** để suy ra
giả định, thay vì bắt người dùng tự đoán chi phí sinh hoạt của chính mình.

## Quyết định đã chốt (với user)

- **Giả định thu/chi sinh tự động từ lịch sử, cho sửa tay.** App tính trung bình 12
  tháng gần nhất làm số khởi điểm, hiện rõ "số này ở đâu ra", người dùng sửa từng
  dòng. Không bắt nhập từ số không, cũng không khoá số tự động.
- **Nhập theo tiền bản địa, đồ thị quy về một đơn vị.** Chặng Nhật nhập bằng ¥, chặng
  Mỹ nhập bằng $. Tỷ giá là **giả định người dùng tự khai**, không lấy tỷ giá hôm nay
  từ [`rates.ts`](../../../src/lib/rates.ts) — chiếu 50 năm thì tỷ giá spot vô nghĩa.
- **Lương hưu khai một số ước tính mỗi nguồn**, không mô hình hoá công thức 年金 /
  Social Security. Công thức đổi theo luật hằng năm, app không nên hứa mình biết số
  đúng.
- **Nhiều kịch bản, so sánh được**, nhân bản được từ kịch bản cũ.
- **Có nhắc lệch hằng tháng** ngay trong đợt này, cắm vào hệ thông báo sẵn có
  (migration `0029`).
- **Chặng đời không buộc theo quốc gia.** Quyết định này sửa bản thiết kế đầu: cưới
  vợ, sinh con, vợ nghỉ làm cũng đổi thu chi nền y như đổi nước. Quốc gia chỉ là một
  thuộc tính, để trống được.
- **Sự kiện gia đình có mẫu sinh sẵn chùm sự kiện**, không thêm bảng "người phụ
  thuộc". Mẫu là tiện tay lúc nhập; sinh ra rồi là sự kiện thường, engine không biết
  dòng nào từ mẫu mà ra.
- **Tính bằng giá hôm nay (real terms), không phải giá danh nghĩa.** Lạm phát trừ vào
  lợi suất chứ không cộng vào chi phí. Lý do: bản danh nghĩa báo "480 triệu ¥ năm
  2070" là con số vô nghĩa với người đọc, và làm đồ thị luôn dốc lên nên che mất chỗ
  vỡ. Có công tắc đổi sang danh nghĩa, đặt trong trình sửa kịch bản chứ không trên
  header — bật tắt nó là mọi con số đổi hết.
- **Không thêm tab thứ 5** vào thanh nav. Vào Lifetime từ một thẻ trong trang Tài sản,
  vì nó là phần kéo dài của tài sản ròng.

## Phạm vi

- Migration `0031_lifetime.sql`: 3 bảng `life_scenarios`, `life_phases`,
  `life_events`; thêm cột `profiles.birth_year`.
- Thư mục mới `src/features/lifetime/`: engine thuần (`project.ts`), sinh giả định
  (`baseline.ts`), đọc kết luận (`insights.ts`), mẫu (`presets.ts`), và UI
  (`LifetimePage.tsx`, `LifetimeChartCard.tsx`, `YearTableView.tsx`,
  `ScenarioEditorSheet.tsx`, `PhaseFormSheet.tsx`, `EventFormSheet.tsx`).
- Route lazy `/lifetime` trong [`App.tsx`](../../../src/App.tsx), cùng khuôn với các
  màn phụ khác.
- Thẻ vào Lifetime trong [`AssetsPage.tsx`](../../../src/features/assets/AssetsPage.tsx).
- Luật mới `src/features/notifications/rules/lifetimeRules.ts` + đăng ký trong
  [`rules.ts`](../../../src/features/notifications/rules.ts) và bảng bật/tắt ở
  `NotificationSettingsPage.tsx`.
- Mở rộng [`repo.ts`](../../../src/data/repo.ts) + `supabaseRepo.ts` + `demoRepo.ts`
  cho 3 bảng mới; nâng `BACKUP_VERSION` từ 5 lên 6 và thêm 3 bảng vào `BackupData`.

## Mô hình dữ liệu — `0031_lifetime.sql`

### `life_scenarios`

Một kịch bản đời.

| Cột | Ghi chú |
|---|---|
| `id`, `user_id` | RLS theo `user_id` như mọi bảng khác |
| `name` | "Ở Nhật mãi", "Đi Mỹ 2029" |
| `display_currency` | Đơn vị của đồ thị và bảng năm |
| `end_age` | Mặc định 90 |
| `real_return_bps` | Lợi suất **thực** của tài sản (đã trừ lạm phát) |
| `band_spread_bps` | Nửa độ rộng dải dao động, mặc định 150 (±1,5%) |
| `starting_assets_minor` | Tài sản khởi điểm, sinh từ tài sản ròng hiện tại |
| `nominal_terms` | `false` = giá hôm nay (mặc định) |
| `is_primary`, `sort_order` | |

### `life_phases`

Chặng đời — chỗ chứa thu chi **nền**. Không có `end_year`: chặng sau bắt đầu thì chặng
trước kết thúc.

| Cột | Ghi chú |
|---|---|
| `scenario_id`, `start_year` | Khoá sắp xếp |
| `label` | "Ở Nhật", "Sang Mỹ", "Cưới", "Vợ nghỉ làm" |
| `country` | `'JP' \| 'US' \| 'VN' \| null` — **để trống được** |
| `currency` | Tiền bản địa của chặng |
| `annual_income_minor`, `annual_expense_minor` | Theo `currency` |
| `fx_to_display` | Tỷ giá giả định sang `display_currency` |

### `life_events`

Mọi thứ không phải dòng chảy nền.

| Cột | Ghi chú |
|---|---|
| `scenario_id`, `start_year`, `end_year` | `end_year` null = đến hết đời |
| `kind` | `'income' \| 'expense'` |
| `amount_minor`, `currency` | Số **mỗi năm** trong khoảng, không phải tổng |
| `label`, `note` | |
| `inflate` | Có tăng theo lạm phát hay không |

Một chỗ gộp đáng ghi lại: **lương hưu cũng là event**, không phải cột riêng trên
`life_phases`. Lý do là người dùng *đóng* 年金 ở Nhật nhưng *nhận* khi đã sang Mỹ —
gắn lương hưu vào chặng thì mô hình sai ngay ở đúng trường hợp của user này. 年金 =
event `income`, `start_year` = năm 65 tuổi, `end_year` null, `inflate=false`.

### Quy tắc chia chặng vs sự kiện

**Đổi vĩnh viễn thu chi nền thì là chặng đời. Khoản có ngày bắt đầu và ngày kết thúc
thì là sự kiện.**

| Chuyện xảy ra | Vào đâu |
|---|---|
| Cưới vợ | Chặng mới (thu + chi nền đổi) + 1 sự kiện chi một lần |
| Sang Mỹ | Chặng mới (đổi `country`, `currency`, `fx_to_display`) + sự kiện chi phí chuyển |
| Vợ nghỉ làm khi sinh, rồi đi làm lại | Hai chặng |
| Sinh con | Chùm sự kiện theo mốc tuổi con |
| 児童手当 | Sự kiện `income`, có `end_year`, `inflate=false` |
| Con vào đại học | Sự kiện `expense`, 4 năm, `inflate=true` |
| Hỗ trợ bố mẹ ở VN | Sự kiện `expense`, tiền VND |
| Mua nhà kèm vay | Sự kiện chi một lần + sự kiện chi hằng năm tới năm trả hết |

## Engine — `project.ts`

```ts
projectLifetime(input: LifetimeInput): YearRow[]
```

`YearRow = { year, age, country, label, income, expense, events, netFlow, assetsEnd,
assetsLow, assetsHigh }`

Mỗi năm từ năm hiện tại tới `birth_year + end_age`:

1. Tìm chặng đang hiệu lực → lấy thu/chi theo tiền bản địa.
2. Quy về `display_currency` bằng `fx_to_display` của chặng.
3. Cộng các sự kiện đang hiệu lực (`start_year <= year <= end_year`), quy đổi tương tự.
4. `assetsEnd = assetsPrev × (1 + realReturn) + netFlow`.
5. Chạy thêm 2 lần với `realReturn ± band_spread_bps` để ra `assetsLow` / `assetsHigh`.

**Ràng buộc kỹ thuật quan trọng:** `project.ts` phải là **module lá** — chỉ được import
[`lib/currencies.ts`](../../../src/lib/currencies.ts) và
[`lib/dates.ts`](../../../src/lib/dates.ts). Lý do là `lifetimeRules.ts` gọi nó, mà
[`purity.test.ts`](../../../src/features/notifications/purity.test.ts) cấm bộ luật kéo
theo React / localStorage (luật phải chạy được nguyên xi trong Edge Function).

## Sinh giả định — `baseline.ts`

Sinh sẵn kịch bản đầu tiên để mở màn lần đầu là đã có đồ thị, không màn hình trắng:

- Thu nhập và chi phí: trung bình 12 tháng gần nhất, **bỏ chuyển khoản**, bỏ
  `exclude_from_stats`.
- Tài sản khởi điểm: tài sản ròng hiện tại, dùng lại
  [`assets/aggregate.ts`](../../../src/features/assets/aggregate.ts).
- Kèm breakdown theo danh mục lá để người dùng kiểm tra trước khi tin. Khối này
  **luôn mở**, không phải bấm mới hiện — số nền sai thì cả bản chiếu 60 năm sai theo.

## Mẫu — `presets.ts`

Sáu mẫu: cưới, sinh con, mua nhà (kèm vay), nghỉ hưu, chuyển nước, hỗ trợ bố mẹ ở VN.
Ba cái đầu tạo cả chặng lẫn sự kiện, ba cái sau chỉ tạo sự kiện.

Số mặc định nằm gọn trong một file, **mỗi con số có comment ghi nguồn và ngày tra**,
và UI dán nhãn "số mặc định, kiểm tra lại". 児童手当 hay học phí đại học đổi theo
luật — app chỉ giúp khỏi gõ từ số không, không hứa biết số đúng.

## Giao diện

Style theo `ui-ux-pro-max`: "Accessible & Ethical" (WCAG AAA, focus ring rõ, target
44px), density 8/10, motion 3/10. **Bỏ** palette và font mà skill đề xuất (xanh dương
+ IBM Plex) — app đã có hệ riêng, thêm palette thứ hai là phá tính nhất quán.

### Token, ánh xạ sang hệ sẵn có

| Chỗ | Class |
|---|---|
| Thẻ ngoài | `rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm` |
| Thẻ kết luận (lồng trong) | `rounded-lg bg-gray-50 dark:bg-gray-800 p-2.5` |
| Chip kịch bản đang chọn | `bg-green-600 text-white` |
| Chip còn lại | `border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300` |
| Số âm | `text-red-600 dark:text-red-400` |
| Banner lệch | `bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300` |
| Mọi nút | `min-h-11 active:scale-95` |
| Mọi cột số | `tabular-nums` |

### Màn chính `/lifetime`

Header: nút back, tiêu đề + dòng phụ "sinh {birth_year} · chiếu đến tuổi {end_age}", và **nút bút chì** mở
trình sửa kịch bản. Cố ý **không** có bánh răng: liệt kê ra thì mọi thiết lập đều
thuộc trình sửa kịch bản hoặc đã nằm trong Cài đặt, bánh răng rỗng còn tệ hơn không có.

Dưới header: banner nhắc lệch (nếu có) → dải chip kịch bản (cuộn ngang) → thẻ đồ thị →
2 nút "Bảng theo năm" / "So sánh" → lưới 2×2 thẻ kết luận.

### Đồ thị

Dữ liệu này thuộc loại **time-series forecast**, nên theo `--domain chart`:

- Lịch sử thật (từ `networth_snapshots`) vẽ **liền nét**. Nó ngắn ngủn so với 58 năm
  phỏng đoán, và đồ thị phải để lộ đúng tỉ lệ đó.
- Bản chiếu vẽ **nét đứt** (`strokeDasharray="6 4"`).
- **Dải dao động** (`Area` với `dataKey` trả cặp `[assetsLow, assetsHigh]`) thay cho
  một đường sắc nét. Đây là thay đổi có hệ quả tới phần kết luận — xem mục dưới.
- Vùng âm: `ReferenceArea` tô đỏ nhạt. Mốc sự kiện: `ReferenceLine`, đánh dấu tam giác
  dưới trục.
- Phân biệt các đường bằng **kiểu nét**, không chỉ bằng màu (rule `color-not-only`).

Animation của Recharts do JS vẽ nên CSS `prefers-reduced-motion` toàn cục của app
không chặn được — phải đọc `matchMedia` rồi truyền `isAnimationActive={false}`.

### Thẻ kết luận

Đây là 4 câu hỏi của user, đọc ra từ cùng một `YearRow[]` qua `insights.ts`:

| Thẻ | Cách tính |
|---|---|
| Nhánh xấu âm từ | Năm đầu tiên `assetsLow < 0` |
| Lợi suất tối thiểu | Nhị phân tìm `realReturn` nhỏ nhất trong khoảng 0–10% để không năm nào âm. Không tồn tại thì thẻ ghi "không đủ dù lợi suất cao" thay vì hiện 10% |
| Lúc N tuổi | `assetsEnd` tại năm đó, kèm dải low–high |
| Tự do tài chính | Năm đầu tiên `assetsEnd × 4% ≥ chi phí năm` |

Thẻ "năm đầu tiên âm" của bản nháp đầu bị bỏ vì **chính xác giả**: đổi lợi suất thực
từ 2% sang 3% là mốc đó dịch 15 năm. Thẻ "lợi suất tối thiểu" mới là thứ hành động
được.

### Bảng theo năm

Không dùng `<table>` trên mobile (tràn ngang) — dùng danh sách thẻ theo năm, nhóm theo
khoảng, mỗi dòng: năm + tuổi + nơi ở + tài sản cuối năm, dòng phụ thu/chi, dòng phụ sự
kiện có icon. Desktop mới dùng bảng thật.

Mặc định **chỉ hiện năm có sự kiện**, có công tắc hiện đủ. Chân bảng ghi rõ "đang ẩn N
năm không có sự kiện" — giảm mật độ mà không nói thì người đọc tưởng đang xem đủ.

Bảng này đồng thời là **bản dự phòng a11y** của đồ thị (rule `data-table`), nên nút
vào nó nằm ngay dưới đồ thị, không giấu trong menu. Xuất CSV theo khuôn
[`reports/csv.ts`](../../../src/features/reports/csv.ts).

### Trình sửa kịch bản

Sheet, theo khuôn `*FormSheet.tsx` sẵn có. Đầu sheet là thông tin kịch bản (tên, năm
sinh, tuổi kết thúc, tiền hiển thị, lợi suất, công tắc giá hôm nay/danh nghĩa). Rồi
danh sách chặng đời, danh sách sự kiện, mỗi danh sách có nút thêm và nút chọn mẫu. Cuối
sheet là khối "số này ở đâu ra".

**Mỗi dòng sự kiện hiện rõ loại tiền riêng** — 年金 vẫn là ¥ trong khi chặng Mỹ dùng
$. Không hiện thì đọc nhầm.

**Tỷ giá giả định hiện ngay dưới dòng chặng**, không giấu trong Cài đặt. Đây là giả
định yếu nhất của cả tính năng nên nó phải chường ra chỗ dễ thấy nhất.

### Đánh đổi có ý thức

- Skill khuyên legend bấm được để bật tắt từng đường. Trên điện thoại legend bấm được
  phải cao 44px, ba dòng là ăn một phần ba chiều cao đồ thị. Nên legend chỉ là chữ,
  việc bật đường thứ hai đẩy sang nút "So sánh".
- Không có wizard onboarding. Zaim bắt trả lời một loạt câu hỏi trước khi cho xem gì,
  vì họ không biết người dùng có dữ liệu hay không. Ở đây có 12 tháng số thật.

## Nhắc lệch — `lifetimeRules.ts`

Mỗi tháng: annualize chi tiêu thật 3 tháng gần nhất, so với `annual_expense` của chặng
đang hiệu lực. Lệch quá ngưỡng (**15%, hằng số `DRIFT_THRESHOLD` trong code — không có ô
đặt trong Cài đặt, xem "Chỗ cố ý chưa làm"**) thì báo — và báo kèm **hệ quả**, không chỉ
con số:

> Chi thực tế cao hơn kế hoạch 22%. Tài sản có thể âm ở 2058 thay vì 2081.

Chạy được vì luật gọi thẳng `projectLifetime` lần hai với chi phí thật. Thuộc loại
*việc cần làm* (bám tới khi tình huống hết), không phải *tin để biết*.

## Test

Theo khuôn logic-thuần-có-test của các feature khác:

- `project.test.ts`: bằng phẳng, chỗ cắt 0, đổi tiền giữa 2 chặng, sự kiện có
  `end_year`, sự kiện `inflate` bật/tắt, dải low/high.
- `baseline.test.ts`: loại trừ chuyển khoản và `exclude_from_stats`, thiếu dữ liệu.
- `insights.test.ts`: 4 thẻ kết luận, kể cả trường hợp không bao giờ âm và không bao
  giờ đạt tự do tài chính.
- `presets.test.ts`: mỗi mẫu sinh đúng số dòng, đúng `end_year`.
- `lifetimeRules.test.ts`: đúng ngưỡng, không lặp lại khi chưa xử lý.
- `purity.test.ts` (sẵn có) phải vẫn xanh sau khi thêm luật mới.

## Rủi ro đã biết

- **`fx_to_display` tự khai là điểm yếu thật.** Đoán tỷ giá USD/JPY năm 2050 thì con
  số nào cũng sai. Mọi phương án khác đều tệ hơn: dùng tỷ giá hôm nay là giả vờ chính
  xác, không quy đổi thì mất đường tài sản liền mạch. Cách xử lý: mặc định là tỷ giá
  hôm nay, dán nhãn "giả định, sửa được", và thẻ so sánh hai kịch bản khác tiền tệ
  phải ghi rõ kết quả phụ thuộc giả định này.
- **Lưới thẻ kết luận 2 cột ở cỡ chữ lớn nhất.** App có `--app-font-scale`; kéo lên
  1,3 thì nhãn dài có thể tràn, khi đó phải cho rớt xuống 1 cột. Đo lúc code, không
  đoán trước.
- **Danh sách 59 năm khi bấm "hiện đủ".** Rule nói 50+ item thì virtualize, nhưng 59
  dòng markup đơn giản có thể không cần. Đo trước khi thêm thư viện.

## Chỗ cố ý chưa làm

- Không mô hình hoá 年金 / Social Security theo công thức pháp luật.
- Không có bảng "người phụ thuộc" riêng.
- Không đánh dấu mốc "nghỉ hưu" trên đồ thị — nó nằm sát mốc "tự do tài chính", thêm
  marker thứ hai vào đó là bắt đầu rối. Chỉ hiện ở thẻ kết luận.
- Không có sheet "Giả định" gộp mở từ header: sẽ thành hai đường vào cùng một thiết
  lập.
- Không có push thông báo — dùng chuông trong app như mục J.
- **Ngưỡng nhắc lệch KHÔNG đặt được trong Cài đặt.** Bản nháp của mục "Nhắc lệch" ở trên
  từng hứa "mặc định 15%, đặt được ở Cài đặt thông báo"; câu đó đã bỏ. `NotificationSettingsPage`
  hiện chỉ có công tắc bật/tắt cho 13 loại thông báo — thêm một ô SỐ vào đó là dựng một
  khuôn UI mới (nhập số, validate khoảng, lưu ở đâu: cột mới trên `profiles`?) cho đúng
  một giá trị. Ngưỡng nằm ở `DRIFT_THRESHOLD` (`features/notifications/rules/lifetimeRules.ts`),
  sửa được bằng một dòng code. Nếu sau này cần đặt được thật, làm cùng lúc với các ngưỡng
  khác của bộ luật để chỉ dựng khuôn UI đó MỘT lần.
- **Mốc sự kiện là `ReferenceLine` đứng, KHÔNG có tam giác dưới trục.** Mục "Đồ thị" ở
  trên nói "đánh dấu tam giác dưới trục" — không làm. Tam giác cần một custom shape của
  Recharts, và ở mật độ của đồ thị này (tới 60 năm trên chiều rộng điện thoại, các mốc sự
  kiện có thể sát nhau) mấy hình tam giác chồng lên nhau đọc còn tệ hơn các đường đứt dọc.
  Đây là thuần thẩm mỹ và không mất thông tin nào. Phần khả năng tiếp cận thì ĐÃ làm: câu
  `aria-label` của thẻ đọc ra số mốc và các năm có mốc (xem `buildAriaLabel`).
