# Design system

Ba tầng: **nguyên thuỷ** (palette Tailwind v4) → **ngữ nghĩa** (`src/index.css`) → **component** (`src/components/ui`).

Ràng buộc được kiểm tự động bằng `tests/designSystem.test.ts` — không phải tài liệu để đọc rồi quên.
(Ở `tests/` chứ không phải `src/`: file đó đọc filesystem bằng `node:fs`, xem chú thích đầu file.)

---

## Nguyên tắc: đặt tên cho cái đã có, đừng phát minh scale mới

Trước khi dựng tầng này, app đã có một hệ thống **ngầm và khá nhất quán**. Đo trên 92 file `.tsx`:

| Trục | Thực tế đang dùng | Kết luận |
|---|---|---|
| Bán kính | `rounded-lg` 278 · `rounded-xl` 130 · `rounded-full` 78 · `rounded-2xl` ~30 | 4 tầng: control / thẻ / pill / **hero+sheet**. `rounded-2xl` không phải lạc — nó dùng nhất quán cho thẻ hero (Tổng tài sản, Nợ ròng…) và ~20 sheet trượt lên (`rounded-t-2xl` mobile). Chỉ `rounded-md` (16) là lạc |
| Độ nổi | `shadow-sm` 163 · còn lại ≤ 10 | thực chất một tầng |
| Trọng lượng | `medium` 227 · `semibold` 166 · `bold` 83 | 3 bậc |
| Khoảng cách | `gap-2` 174 · `gap-1` 88 · `gap-3` 43 | 4 giá trị chiếm hầu hết |
| Padding thẻ | `p-3` 96 · `p-4` 31 · `p-6` 24 (desktop) | 3 bậc |

Nên tầng token **không đổi** mấy trục này. Việc của nó là (a) đặt tên cho hai chỗ scale bị thiếu, (b) khoá các quyết định contrast lại thành cấu trúc.

---

## Token ngữ nghĩa

Khai ở `src/index.css`. Đọc `--fg-muted` chứ đừng đọc `gray-500`: đổi một chỗ là đổi cả app, và tên nói lên **vai trò** nên khó dùng sai.

| Token | Light | Dark | Đo được |
|---|---|---|---|
| `fg-primary` | gray-800 | gray-100 | 14,7:1 |
| `fg-secondary` | gray-600 | gray-300 | 7,6:1 |
| `fg-muted` | gray-500 | gray-400 | **4,84:1 — sàn** |
| `fg-on-track` | gray-600 | gray-400 | 6,87:1 |
| `money-in` | green-800 | green-400 | 7,13 / 9,98:1 |
| `money-out` | red-700 | red-400 | 6,42 / 6,14:1 |
| `surface` | white | gray-900 | — |
| `surface-sunken` | gray-100 | gray-800 | track của segmented control |
| `border-subtle` | gray-100 | gray-800 | — |
| `accent` | green-700 | green-500 | nền nút chính, focus ring |
| `fg-accent` | green-700 | green-400 | **chữ** màu nhấn (link, hành động phụ) |

### `accent` vs `money-in` — cùng xanh, khác nghĩa

Ba token xanh, đừng trộn:

- `--accent` (green-700) — nền nút chính. Bậc 700 vì nút có **chữ trắng** đè lên, cần 4,5:1 với trắng; green-600 chỉ 3,22:1.
- `--fg-accent` (green-700) — chữ "bấm được": link, nút text.
- `--money-in` (green-800) — "đây là khoản thu".

Cố ý **không** để nút dùng green-800: nút trùng màu số thu nhập thì mất phân biệt *hành động* với *giá trị*.

Dùng qua tiện ích Tailwind: `text-fg-muted`, `bg-surface`, `border-border-subtle`.

### Ba cái bẫy đã đo, đừng đạp lại

**1. Chiều màu ở dark mode bị đảo.** `text-gray-400 dark:text-gray-500` là **sai** — nền tối thì chữ phụ phải *sáng* hơn. Chiều đúng: `text-gray-500 dark:text-gray-400`. Đã dọn 64 chỗ.

**2. `fg-muted` CHỈ an toàn trên nền trắng.** gray-500 đạt 4,84:1 trên trắng, nhưng:

| nền | tỉ số | |
|---|---|---|
| trắng | 4,84 | ✓ |
| gray-50 | 4,63 | ✓ |
| gray-100 (`surface-sunken`) | 4,39 | ✗ |
| gray-200 | 3,91 | ✗ |

**Chữ mờ nằm trên bất kỳ nền lún nào phải dùng `fg-on-track`** (gray-600). Đây là lỗi hay gặp nhất: một lần sửa `ClassificationToggle` đã xoá 196 vi phạm cùng lúc. Kiểm bằng cách đo nền THỰC TẾ (leo cây DOM tìm background), đừng giả định là trắng.

**3. Không có bậc xám nào mờ hơn gray-500 mà vẫn đạt AA.** Nên app **không có** bậc chữ "tam cấp" bằng màu. Muốn phân cấp thêm thì dùng **cỡ chữ**, đừng làm nhạt màu.

### Cỡ chữ

Scale mặc định của Tailwind không có bậc nào dưới `text-xs` (12px), nên code đã phải chêm 76 giá trị tuỳ ý. Hai bậc được đặt tên:

| Tên | Giá trị | Dùng cho |
|---|---|---|
| `text-2xs` | 0.6875rem (11px) | nhãn phụ, chú thích trong thẻ |
| `text-3xs` | 0.625rem (10px) | **sàn dưới** — nhãn trục biểu đồ, ô lịch |

Cố ý **không** có tên cho 9px: `--app-font-scale` nhỏ nhất là `0.9`, nên 9px tụt xuống 8,1px. Guardrail chặn `text-[0.5625rem]` về 0.

Mọi cỡ chữ dùng `rem` để co giãn theo Cài đặt → Cỡ chữ. **Đừng dùng `px`** cho chữ.

---

## Component primitive

`import { Card, Money, ... } from '../../components/ui'`

| Component | Thay cho | Vì sao cần |
|---|---|---|
| `Money` | ~107 chỗ tự ghép `tabular-nums` + màu | `tabular-nums` luôn bật; màu thu/chi từ token. Bọc `formatMoney` nên **giữ chế độ riêng tư** |
| `Card` | 86 chỗ `rounded-xl bg-white ... shadow-sm` | prop `elevation` để có phân cấp: `raised` cho thẻ chính, `flat` cho thẻ phụ |
| `SegmentedControl` | 6 bản chép tay | `role="tablist"` + `aria-selected` đúng; nhãn dùng `fg-on-track` |
| `IconButton` | 32 chỗ `min-h-11 min-w-11` | 44px vùng chạm + `transition` + `hover` — ba thứ hay quên |
| `StatTile` | 8 ô KPI | giá trị `text-base` cách nhãn `text-xs` **hai bậc**, để số nổi hơn nhãn |
| `SectionTitle` | 2 quy ước đang đánh nhau | `role="card"` (nhãn thẻ) vs `role="block"` (tiêu đề khối) |

### `Money` — lưu ý về dấu

`formatMoney` **tự in dấu `-`** cho số âm. Nên:

- Số lưu **dương**, chiều nằm ở `tone` (như dòng giao dịch) → bật `showSign`
- Số **đã có dấu** (số dư, chênh lệch) → **đừng** bật `showSign`, không thì ra `--`

Dấu dùng ASCII `-`/`+` cho khớp với chính `formatMoney`. Đừng trộn `−` (U+2212) vào cùng danh sách: hai glyph lệch bề rộng dù đã `tabular-nums`.

### `IconButton` với `<Link>`

`<Link>` của react-router là thẻ `<a>`, không dùng `IconButton` được. Dùng `iconButtonClass()`:

```tsx
<Link to="/search" className={iconButtonClass()} aria-label="Tìm kiếm giao dịch">
```

---

## Guardrail

`tests/designSystem.test.ts`, chạy trong `npm test`. Hai loại luật:

**Ban cứng — phải bằng 0.** Dành cho thứ đã dọn sạch; tái xuất hiện là hồi quy.

- `text-gray-400 dark:text-gray-500` (sai chiều sáng/tối)
- `text-green-600 dark:text-green-400`, `text-red-600 dark:text-red-400` (trượt AA)
- `text-green-800 dark:text-green-400`, `text-red-700 dark:text-red-400` (đúng màu nhưng **viết lại cặp bằng tay** — dùng `text-money-in`/`text-money-out`)
- `bg-green-600` (nút: trắng trên nó chỉ 3,22:1)
- `text-[0.5625rem]` (dưới sàn đọc được)

Scanner **bỏ comment trước khi đếm** — nếu không thì chính lời giải thích "đừng dùng X" trong comment lại làm test đỏ, mà comment tại chỗ là nơi tốt nhất để ghi lý do.

**Ngưỡng — chỉ được giảm.** Idiom còn nhiều chỗ chưa gộp. Đặt về 0 ngay thì phải refactor 92 file trong một lần, mà repo **không có test UI nào** (54 file test đều là logic thuần, không có `@testing-library`). Ngưỡng cho phép gộp dần mà vẫn chặn thêm mới.

**Gộp bớt được chỗ nào thì hạ số trong file test xuống.** Để nguyên thì ngưỡng thành chỗ trú cho nợ kỹ thuật.

---

## Màu biểu đồ: hằng số JS, không phải token

Recharts nhận màu qua prop (`fill`, `stroke`) nên **không dùng được biến CSS**. Vì vậy màu biểu đồ vẫn là hằng số JS — đó là giới hạn của thư viện, không phải nợ kỹ thuật.

Nhưng phải có **một nguồn duy nhất cho nét vẽ và chú giải**. Bẫy đã xảy ra thật: nét vẽ dùng hex cứng `#16a34a` (green-600 của Tailwind **v3**) còn chấm chú giải dùng class `bg-green-600` (v4 = `#00a63e`) → từ hồi nâng v4, chú giải chỉ sai màu chính cái nó gán nhãn. Đã sửa ở `MonthlyBarsCard`, `NetCashflowCard`, `SpendVsBudgetCard` bằng cách cho chấm đọc `style={{ backgroundColor: HANG_SO }}`.

**Đừng đặt màu chú giải bằng class Tailwind.** Luôn trỏ vào đúng hằng số đã tô cho biểu đồ.

**Ngoại lệ: SVG viết tay.** Đồ hoạ không qua Recharts (vd `ScoreGauge`) thì `stroke-*` là class Tailwind bình thường, **lật được** theo `.dark` — nên ở đó phải dùng class, đừng viết hex. Ba sắc độ vùng thang đo sức khỏe khai một chỗ ở `src/features/health/zoneColors.ts` cho cả thanh ngang (`ZONE_BAR`) và cung đồng hồ (`ZONE_STROKE`); hai chỗ vẽ cùng một ý nghĩa thì không được lệch màu.

Ba vùng đó là **đồ hoạ mang thông tin** nên cần 3:1 (WCAG 1.4.11). Bộ cũ (red-400 / amber-400 / green-500) đo thật là **2,89 / 1,72 / 2,22** trên trắng — trượt cả ba, vùng vàng gần như biến mất. Bộ hiện tại: light `red-600 / amber-600 / green-700` = 4,77 / 3,20 / 4,95; dark `red-400/70 / amber-500/70 / green-500/70` = 3,57 / 4,56 / 4,50. Vùng đỏ **phải** đổi bậc giữa hai chế độ: không bậc đỏ nào đạt 3:1 ở cả hai (red-400 chỉ 2,89 trên trắng, red-600 chỉ 2,27 trên gray-900 khi có alpha).

## Cách đo contrast cho đúng

Bốn cái bẫy đã làm mình đọc sai số, ghi lại để khỏi mất thời gian lần nữa:

**1. Đừng bật class `.dark` bằng JS rồi đo ngay.** Chrome cập nhật `background-color` nhưng **chưa** cập nhật biến CSS thừa kế trong cùng một task, nên ra những số vô nghĩa (gray-600 trên gray-800 = 1,94). Phải **tải trang thật** với `localStorage.theme = 'dark'`. Muốn quét nhiều route thì tải một lần ở dark rồi điều hướng bằng `history.pushState` + `PopStateEvent` — class giữ nguyên, DOM được style lại từ đầu.

**2. Gradient không nằm ở `background-color`.** `bg-gradient-to-br` đặt `background-image`, nên hàm leo cây tìm nền sẽ bỏ qua nó và rơi về trắng → ra tỉ số 1,0 giả. Phải đọc các chặng màu từ `backgroundImage` và tính với chặng **sáng nhất** (ca xấu nhất cho chữ trắng).

**3. Ngưỡng AA không phải luôn 4,5.** Chữ ≥24px, hoặc ≥18,66px mà bold, chỉ cần **3:1**. Bỏ qua điều này sẽ báo sai các con số lớn — ví dụ `≈ ¥1,973,890` ở 32px bold trên thẻ hero.

**4. Đừng parse chuỗi màu, hãy vẽ ra pixel rồi đọc lại.** Tailwind v4 nên `getComputedStyle` trả về `oklab(0.637 0.214 0.101)`. Gán chuỗi đó cho `canvas.fillStyle` rồi đọc `fillStyle` **không** ra hex — cách bóc số bằng regex sẽ lấy `0.637, 0.214, 0.101` làm RGB, tức gần như đen, và mọi tỉ số ra ~20:1. Đúng cái đã xảy ra hôm 2026-08-01: bộ màu vùng thang đo được báo là 20,7:1 trong khi thật ra 2,89:1. Cách đúng:

```js
ctx.fillStyle = nenThat      // tô nền trước — bắt buộc nếu màu có alpha (vd /70)
ctx.fillRect(0, 0, 1, 1)
ctx.fillStyle = mauCanDo
ctx.fillRect(0, 0, 1, 1)
const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data  // màu THẬT, đã composite
```

Alpha là phần thứ hai của cái bẫy: `bg-red-500/70` trên gray-900 chỉ còn 2,76:1 chứ không phải 4,66:1 của red-500 đặc.

Ngoài ra: bỏ emoji khỏi phép đo. Emoji tự mang màu, `color` thừa kế của chúng vô nghĩa.

## Chế độ trình bày: Gọn / Đầy đủ

Cài đặt → **Cách trình bày**. Mặc định **Gọn**.

Nguồn sự thật là **hồ sơ người dùng** (`profiles.density_pref`, migration 0040) — đặt một lần dùng mọi thiết bị. Cố ý khác Sáng/Tối và Cỡ chữ: hai cái đó phụ thuộc THIẾT BỊ (màn hình ngoài trời, chữ to trên điện thoại) nên ở lại localStorage; cách trình bày phụ thuộc NGƯỜI.

`src/lib/density.ts` giữ một **bản sao** ở localStorage. Nó không phải nguồn sự thật, chỉ để (a) vẽ đúng ngay lần sơn đầu, (b) đổi hiện ra tức thì khi bấm, (c) mở offline vẫn đúng chế độ. Ba hook, ba vai:

| Hook | Ai dùng | Việc |
|---|---|---|
| `useDensity()` | ~62 chỗ | chỉ ĐỌC bản sao, không chạm React Query |
| `useDensitySync()` | **một lần** ở AppLayout | bơm hồ sơ → bản sao |
| `useDensityControl()` | chỉ nút Cài đặt | đọc + ghi hồ sơ, lỗi thì trả bản sao về cũ + toast |

Gộp ba cái thành một thì mỗi chỗ đọc cũng kéo theo một `useQuery(['profile'])` và một `useMutation`. `setMirroredDensity` thoát ngay khi trùng giá trị — không chặn thì mỗi lần hồ sơ refetch là cả cây render lại.

### Hai bẫy của "cột hồ sơ mới", đã đạp cả hai

**1. Thiếu cột ≠ giá trị mặc định.** Cache hồ sơ được persist xuống localStorage (24h). Một máy có thể đang giữ bản tải TRƯỚC migration — bản đó không có `density_pref`. Coi `undefined` là `'visual'` thì `useDensitySync` **ghi đè lựa chọn của người dùng** về Gọn. Dùng `densityFromProfile()`: không phải chuỗi → `null` = "hồ sơ chưa nói gì", để bản sao ở máy quyết. Chuỗi RÁC thì vẫn về mặc định (DB có `check`, giá trị lạ là bất thường — khác hẳn cột chưa tồn tại).

**2. `staleTime: Infinity` giết đồng bộ giữa máy.** `useProfile` từng đặt vậy với lý do "hồ sơ hầu như không đổi". Lý do đó hết đúng khi hồ sơ mang một cài đặt người dùng đổi được: đổi trên điện thoại thì laptop không bao giờ tải lại, hiện chế độ cũ cả ngày. Đã đổi sang **60 giây**. React Query không hẹn giờ — nó chỉ tải lại khi có observer mới mount hoặc khi cửa sổ được focus lại, nên phiên đang dùng liên tục gần như không thêm lượt nào, còn đúng lúc cần (nhấc máy khác lên) thì luôn có bản mới.

Kèm theo: `useDensitySync` **tạm ngừng bơm khi đang có lượt ghi hồ sơ** (`useIsMutating` với `PROFILE_MUTATION_KEY`). Từ khi `staleTime` hữu hạn, một lượt tải nền bắt đầu trước lúc bấm có thể về sau và mang giá trị cũ → công tắc lật ngược rồi lật lại. Bản sao ở máy chính là "bản nháp" của cài đặt này, giống cách `NotificationSettingsPage` cho `pendingOff` thắng hồ sơ trong lúc chờ.

Đo trên app thật (localhost + Supabase thật): ghi `full` từ "máy A", rồi dựng "máy B" (bản sao `visual`, cache hồ sơ cũ 10 phút nói `visual`) → tải lại thì máy B nhận `full`. Lùi `staleTime` về `Infinity` rồi chạy lại đúng phép thử đó: máy B **đứng ở `visual`** — tức phép thử phân biệt được, không phải xanh vì may.

Phạm vi đã kiểm: đường **mount** (mở app / tải lại). Đường **focus** (tab đang mở sẵn) chưa kiểm được — sự kiện `visibilitychange` phát bằng tay không làm đổi trạng thái focus nội bộ của React Query nên bộ đếm request nằm im, và đó là giới hạn của phép thử chứ không phải bằng chứng app sai.

Đo trên app đang chạy: hồ sơ `full` + bản sao `visual` → sau khi tải, bản sao thành `full` và trang Báo cáo về đúng 1.694 ký tự của chế độ Đầy đủ. Chặn lượt ghi hồ sơ cho lỗi → bản sao đổi tức thì rồi trả về cũ, kèm toast.

|  | Gọn (`visual`) | Đầy đủ (`full`) |
|---|---|---|
| Chữ chỉ để dạy | ẩn | hiện |
| Câu kết luận | chip: icon + `short` (vài chữ, có số) | cả câu |
| "Cách tính & nên làm gì" | không có | mở ra được |

Đo trên 12 route với dữ liệu demo: **5.227 → 1.121 ký tự văn xuôi (−79%)**.

| Màn | Đầy đủ | Gọn | Giảm |
|---|---|---|---|
| Thông báo | 1.695 | 136 | 92% |
| Ngân sách | 560 | 80 | 86% |
| Sức khỏe | 677 | 167 | 75% |
| Biểu đồ | 543 | 232 | 57% |
| Thấu hiểu | 579 | 258 | 55% |
| Xu hướng | 320 | 145 | 55% |
| Tài sản | 191 | 103 | 46% |
| Nhãn · Sắp chi · Định kỳ · Nhập | 662 | 0 | 100% |

### Bài học: quét theo class KHÔNG đủ

Lượt rà đầu quét `<p className="…fg-muted…">` và bỏ sót ba loại, chỉ bản CHẠY THẬT mới lộ ra:

1. **Chữ dạy nằm trong hằng số** — `HINT` ở `AxisTargetsCard`, `note` ở `SpendSizeCard`,
   `SORT_HINT` ở `BudgetView`. Không phải JSX nên máy quét theo class không thấy.
2. **Câu số dài đáng NÉN, không phải ẩn** — "Còn ¥58.670 cho 21 ngày nữa — tiêu
   ¥2.793/ngày thì vừa đủ." → "Còn ¥58.670 · ¥2.793/ngày × 21 ngày". Giữ cả ba con số,
   bỏ mệnh đề giải thích.
3. **Câu lặp nhiều lần trên một màn** — `NeedMore` ở Xu hướng hiện 5 lần, mà mệnh đề
   "Ghi chép thêm… tự hiện ra" lặp y nguyên cả 5.

Cách đo đúng: chạy app, đi hết route, gom text node ≥25 ký tự rồi lọc lấy phần tử **lá**
(không chứa phần tử nào khác cũng có văn xuôi).

### Hai bẫy khi tách câu

**Đừng tách theo MẢNH câu.** Bọc `<Guide as="span">` quanh mấy từ nối để lại đúng cái này
trên màn hình: *"Chưa ghi khoản thuế/bảo hiểm nào. tạo bộ danh mục Thuế & An sinh."* — chữ
thường sau dấu chấm, cụm link mất chủ ngữ. Viết **hai câu hoàn chỉnh**, mỗi chế độ một câu.

**Ẩn một phần tử có thể đổi layout.** Bỏ dòng giải nghĩa trong hàng `justify-between` thì
phần tử còn lại trượt về bên trái — đo được **819px**. Dùng `ml-auto` ở ô bên phải, đừng
dựa vào `justify-between`.

### Ranh giới: cái gì được ẩn

Đây là phần quan trọng nhất, vì sai ranh giới thì "gọn" biến thành "mất chức năng".

| Bọc `<Guide>` / `<FullOnly>` | KHÔNG bọc |
|---|---|
| cách tính, ý nghĩa con số | nhãn ô nhập, câu báo lỗi, câu xác nhận xoá |
| mẹo dùng, "vì sao lại thế" | cảnh báo dữ liệu (thiếu tỷ giá, chưa quy đổi) |
| câu chỉ đường trong trạng thái rỗng | câu nói ra chính trạng thái đó |
| gợi ý quy ước nhập liệu | câu giải thích một ô đang bị vô hiệu |

Trạng thái rỗng thường phải **tách**: giữ "Chưa có khoản nào.", bọc phần "Thêm những thứ bạn biết là sắp phải chi…".

Hai chỗ **không** dùng `<Guide>` mà đọc thẳng `useDensity()`, có lý do: câu mô tả ở trang Thông báo có `id` được `aria-describedby` của nút gạt trỏ vào — ẩn `<p>` mà giữ `describedBy` là tạo tham chiếu treo, nên hai thứ phải tắt cùng lúc.

### Ba primitive

- `<Guide as="p" className=…>` — một đoạn chữ để dạy. `<FullOnly>` cho cả khối.
- `<StatusChip tone icon>` — huy hiệu trạng thái. `VerdictNote` ở chế độ Gọn render đúng cái này.
- `<StatusDot tone label>` — chấm 8px cho dòng danh sách, `label` **bắt buộc** (màu là kênh duy nhất).

Bộ màu ở `components/ui/statusColors.ts` (trước đây là `features/health/zoneColors.ts`): `STATUS_FILL` cho đồ hoạ (≥3:1), `STATUS_STROKE` cho SVG, `STATUS_CHIP` cho chip (≥4,5:1 vì có chữ). Số đo thật ghi trong file.

### Guardrail

`tests/designSystem.test.ts` — bốn luật, cả bốn đã thử gây lỗi để chắc chúng đỏ được:

- khối hướng dẫn nền xanh (`bg-blue-50`) luôn là `<Guide>`, không phải `<p>` → **0**
- không viết lại sắc độ trạng thái bằng tay ngoài `statusColors.ts` → **0**
- mỗi `<VerdictNote>` có `short` hoặc `label` → trần **1** (một chỗ cố ý, nằm trong `<FullOnly>`)
- văn xuôi trong `<p class="…fg-muted…">` → trần **49**

Ngoài bốn luật của chế độ trình bày, `tests/designSystem.test.ts` còn luật **không có `<label>` mồ côi** (xem mục "Nhãn ô nhập" bên dưới): nó phân loại từng `<label>` theo spec — có `htmlFor`, hay bọc thẻ labelable — và phải bằng **0**. Đã thử 6 hình dạng (3 phải đỏ, 3 phải xanh) để chắc nó phân biệt được. Luật này thay cho trần `<label className` = 106 trước đây, vốn chỉ là đại diện gần đúng: nó đếm cả nhãn hợp lệ và bỏ sót nhãn viết `className` sau `htmlFor`.

Thêm `tests/backupCompleteness.test.ts`: mọi cột của `ProfileRow` phải được đường KHÔI PHỤC nhắc tới. `exportAll` dùng `select('*')` nên cột mới tự vào bản lưu, nhưng `importAll` liệt kê từng cột — bỏ sót thì khôi phục âm thầm trả cột đó về default. Đúng lỗi đã xảy ra với `density_pref`.

Trần 49 **không** phải nợ cần dọn hết: đã xét từng chỗ, phần lớn là thứ phải ở lại theo bảng ranh giới trên.

## Nhãn ô nhập: chọn thẻ nào

Dọn xong 2026-08-11 (71 chỗ, 16 file). Quy tắc, theo đúng spec HTML chứ không theo cảm giác:

| Nhãn cho | Thẻ | Vì sao |
|---|---|---|
| MỘT `<input>` / `<select>` / `<textarea>` | `<label htmlFor={`${uid}-x`}>` + `id` trên ô | dạng duy nhất cho screen reader tên ô một cách chắc chắn |
| `MoneyField` | `<span>` + `ariaLabel` trên component | MoneyField render **hai** ô (nút chạm mobile + input desktop) luôn cùng trong DOM, chỉ ẩn/hiện bằng `lg:hidden` → `htmlFor` chắc chắn trỏ vào ô đang bị CSS ẩn |
| `AccountPicker` | `<span>` + `ariaLabel` trên component | nó là `<button>`; tên đọc được của `<button>` tính **từ nội dung** (HTML-AAM), `<label for>` không phải nguồn tên của nó |
| một HÀNG NÚT (segmented, chip) | `<span>` + `role="group" aria-label` trên khung | không có một ô nào để trỏ vào |
| cả một KHỐI (TagPicker) | `<span>` | từng control bên trong tự mang `aria-label` |
| một công tắc `role="switch"` | **giữ `<label>` bọc nút** | `button` NẰM TRONG danh sách labelable của spec → nhãn vừa đặt tên vừa là vùng chạm. Đã đo trên app đang chạy: bấm vào chữ có bật/tắt |

`useId`, không phải id viết cứng: hai sheet có thể cùng trong DOM (sheet chặng mở từ trong `ScenarioEditorSheet`; `DebtDetailInputs` dùng ở cả form Nhập và sheet Sửa nợ), và id trùng thì `htmlFor` bắt vào ô **đầu tiên** khớp — nhãn trỏ sai ô còn tệ hơn không có nhãn.

Id không được chứa khoảng trắng. Nhãn tiếng Việt ("Thiết yếu") không dùng làm id được → thêm trường `slug` (xem `ProfileEditSheet`).

### Ba lần suýt sai khi làm đợt này

1. **Quên `button` là labelable.** Lần quét đầu xếp 4 nhãn công tắc vào diện mồ côi; đổi chúng sang `<div>` là **mất vùng chạm** đang chạy tốt. Kiểm bằng cách bấm vào chữ trên app thật.
2. **`aria-checked` đọc ngay sau `.click()` là sai.** React chưa render lại → kết luận "bấm vào chữ không có tác dụng" tuy thật ra có. Phải `await` một nhịp.
3. **Chú thích cũng chứa chữ `<label>`.** Chính lời giải thích "chỗ này dùng `<span>` chứ không `<label>`" làm công cụ quét báo 3 vi phạm không tồn tại. Phải che chú thích — nhưng che bằng khoảng trắng để **giữ số dòng**.

### Nhãn không phải cái duy nhất thiếu

Quét theo `<label>` **không thấy** ô nào hoàn toàn không có nhãn. Sau khi dọn hết 71 nhãn, chạy thuật toán tính accessible name trên 19 route của app đang chạy thì còn **9 ô không có tên nào** — chỉ có `placeholder` (mà placeholder mất ngay khi bắt đầu gõ, không phải tên). Trong đó có **ô số tiền chính của form Nhập** ở desktop: `TransactionForm` có bản copy riêng của `MoneyField` và bản copy đó bị bỏ sót khi sửa `MoneyField` hôm 2026-07-30.

Cách quét: `el.labels`, `aria-label`, `aria-labelledby`; **không** tính `placeholder`. Chạy trên app thật, không đọc nguồn.

## Chưa làm

- **Trạng thái rỗng dùng gray-300** (`TransactionForm` `¥0`, `MonthlyView` tháng trống, `roleFields`) — 1,47:1 ở light, 2,35:1 ở dark. Đây là **de-emphasize cố ý**: tháng trống gần như biến mất khỏi bảng để mắt quét nhanh. Sửa cho đạt AA sẽ đổi cách đọc bảng → là quyết định thẩm mỹ, không phải dọn dẹp.
- **Toán tử NumPad**: green-700 trên nền gray-100 = **4,49:1**, thiếu 0,01. Nằm trong sai số làm tròn. Muốn sạch tuyệt đối thì dùng green-800 cho light.
- **35 chỗ `text-green-700 dark:text-green-400` cần tách nghĩa** thành `fg-accent` (link, hành động — đa số) hoặc `money-in` (giá trị tiền — vài chỗ). Việc **xét từng chỗ**, không quét máy móc được: link không phải thu nhập. Không gấp — 4,95:1 đã đạt AA. *(Đo lại 2026-08-06: con số TĂNG từ 29 → 35 kể từ lúc dựng hệ thống, nên đã thêm trần trong guardrail để không phình tiếp.)*
- **Hex v3 còn ở 16 file biểu đồ** (`#16a34a`/`#ef4444` trong `CategoryBreakdownCard` `PALETTE`, `SummaryView`, `AssetsNowView`, `LifetimeChartCard`…). Không sai contrast, nhưng lạc thời so với palette v4. *(Cũng tăng từ 12+ → 16 file; đã thêm trần trong guardrail.)*
- **`ActionButton` đã có** (gom dáng nút-có-chữ) nhưng mới áp vào vài chỗ — 93 chỗ `active:scale-95` viết tay là số nợ còn lại trong guardrail, gộp dần và hạ trần theo.
- **Tên ô chỉ được kiểm bằng tay.** Luật `<label>` mồ côi chặn được ở mức nguồn, nhưng "ô không có nhãn nào cả" thì không — repo không có test render (không có `@testing-library`), nên phải chạy app rồi tính accessible name như đợt 2026-08-11. Muốn tự động thì cần thêm jsdom + một test render, là quyết định về hạ tầng test chứ không phải dọn dẹp.
- Đã áp primitive vào `LedgerPage`, `ReportsPage`, `AccountDetailPage`, `AssetsPage`, `AssetGroupsPage`. Các màn còn lại đã đổi sang token màu nhưng thẻ/nút vẫn viết tay — ngưỡng trong guardrail là số nợ còn lại.
