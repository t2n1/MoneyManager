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
| `fg-primary` | gray-800 | `#e6e9ee` | 14,7 / 14,7:1 |
| `fg-secondary` | gray-600 | `#c9cfd8` | 7,6 / 11,4:1 |
| `fg-muted` | gray-500 | `#99a1af` (= gray-400) | **4,84:1 — sàn ở light** |
| `fg-on-track` | gray-600 | `#99a1af` | 6,87 / 6,85:1 |
| `money-in` | green-800 | green-400 | 7,13 / 10,0:1 |
| `money-out` | red-700 | red-400 | 6,42 / 6,2:1 |
| `surface-page` | gray-50 | `#08090b` | nền trang |
| `surface-chrome` | gray-50 | `#0b0d10` | top bar, rail, header nhóm trong bảng |
| `surface` | white | `#0e1014` | thẻ / panel |
| `surface-sunken` | gray-100 | `#14181d` | track của segmented control, nút phụ |
| `border-subtle` | gray-100 | `#14171c` | đường kẻ giữa các dòng |
| `border-panel` | gray-200 | `#1b1e24` | viền panel & khung |
| `border-strong` | gray-300 | `#232830` | viền control, viền nút |
| `accent` | green-700 | green-500 | nền nút chính, focus ring |
| `fg-accent` | green-700 | green-400 | **chữ** màu nhấn (link, hành động phụ) |

Số ở cột dark là của **thang tối bản 1a** (2026-08-16), đo ở ca xấu nhất — chữ trên
`surface-sunken`, nấc lún nhất. Thang cũ (gray-950/900/800) đã bỏ: 1a dùng bốn nấc tối
hơn và lệch xanh nhẹ, không sắc độ Tailwind nào rơi đúng vào đó nên **dark là chỗ duy
nhất trong repo được viết hex trần** — và chỉ trong `:root`/`.dark` của `index.css`.

Bốn nấc bề mặt xếp theo thứ tự lún → nổi: `page` → `chrome` → `surface` → `sunken`.
`chrome` nằm **giữa** page và surface vì khung app (thanh trên, rail trái) phải lùi ra
sau panel nội dung mà vẫn tách khỏi nền trang — 1a bỏ hẳn `shadow`, nên nền là kênh
phân cấp duy nhất còn lại. Ở **light không có nấc thứ tư**: `surface-chrome` = gray-50,
trùng `surface-page`, và khung phân biệt bằng `border-panel`.

**Đánh đổi đã biết:** viền mờ đi. `border-strong` trên `surface` ở dark tụt từ 1,72:1
(gray-700 trên gray-900) xuống **1,29:1**. Cả hai đều dưới 3:1 của WCAG 1.4.11 nên không
đổi trạng thái đạt/trượt, nhưng nó chốt một luật: **viền không được là thứ duy nhất chỉ
ra ranh giới một control** — control phải có nền (`surface-sunken`) hoặc chữ của chính nó.

### Kiểu chữ: IBM Plex

`--font-sans` = IBM Plex Sans, `--font-mono` = IBM Plex Mono (khai trong `@theme` của
`index.css`, nạp bằng `<link>` Google Fonts ở `index.html`). **Mọi con số** — tiền, ngày,
%, mã tháng — đi bằng mono; đó là thay đổi nhìn thấy rõ nhất của 1a.

Ghi đè hai biến đó là đủ cho cả tiện ích `font-sans`/`font-mono` lẫn font mặc định của
trang: preflight v4 đặt `--default-font-family: var(--font-sans)`.

Hai điều **đừng** đổi khi đụng vào:

- **Không chốt `subset=` trong URL css2.** App viết tiếng Việt nên cần subset
  `vietnamese` (U+1EA0–1EF9, và ₫ U+20AB). Chốt `latin,latin-ext` là mọi chữ có dấu
  nặng/hỏi rơi về font hệ thống — lộ ra chữ lệch nét ngay giữa một câu. Để mặc định
  không tốn thêm byte: css2 chia `@font-face` theo `unicode-range`.
- **Luật `runtimeCaching` cho hai origin font trong `vite.config.ts`** giữ font sống
  khi offline. Bỏ nó thì mở offline rơi về font hệ thống, và cột số mất bề rộng mono
  nên bảng tiền lệch hàng.

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
| `Money` | ~107 chỗ tự ghép `tabular-nums` + màu | `font-mono` + `tabular-nums` luôn bật; màu thu/chi từ token. Bọc `formatMoney` nên **giữ chế độ riêng tư** |
| `Card` | 86 chỗ `rounded-xl bg-white ... shadow-sm` | prop `elevation`: `raised` thẻ chính · `flat` thẻ phụ · `panel` khung 1a (8px, viền panel, không bóng) |
| `SegmentedControl` | 6 bản chép tay | `role="tablist"` + `aria-selected` đúng; track trong suốt, ô đang chọn mới có nền |
| `IconButton` | 32 chỗ `min-h-11 min-w-11` | 44px vùng chạm + `transition` + `hover` — ba thứ hay quên |
| `StatTile` | 8 ô KPI | nhãn 11px hoa (eyebrow) cách giá trị 26px mono **bốn bậc**, để số nổi hơn nhãn |
| `SectionTitle` | 2 quy ước đang đánh nhau | `role="card"` (nhãn thẻ) vs `role="block"` (tiêu đề khối) |

### Bản 1a đổi gì trong primitive

Bốn quyết định ở đây là quyết định **cấu trúc**, không phải trang trí — chúng lan ra
mọi màn mà không phải sửa màn nào:

**1. Số đi bằng mono.** `Money` thêm `font-mono`. `tabular-nums` chỉ khoá bề rộng chữ
số; mono khoá cả dấu phẩy nghìn, dấu trừ và ký hiệu tiền, nên cột số đọc như bảng.

**2. Dark không còn thẻ "nổi".** `Card` dáng `raised` ở dark bỏ `shadow-sm`, thay bằng
`border-border-panel`. Bóng trên nền `#0e1014` chỉ còn là vệt tối bẩn. Light **giữ
nguyên** — viền chỉ mọc ở dark, nơi cả thang bề mặt đã đổi.

**3. Bán kính tách làm hai.** Control (nút, tab) **6px = `rounded-md`**; panel **8px =
`rounded-lg`**; thẻ cũ vẫn 12px. Trước 1a cả control lẫn panel đều 8px, nên trần
`rounded-md` trong guardrail **đổi chiều** — đọc kỹ chú thích tại chỗ trước khi sửa.

**4. Segmented đảo hai bề mặt.** Track trong suốt + viền panel; ô **đang chọn** mới có
nền `surface-sunken` + viền `border-strong`. Không còn `shadow` làm tín hiệu "đang
chọn". Hệ quả a11y: nhãn ô không hoạt động đổi `fg-on-track` → `fg-muted` được, vì
track không còn nền gray-100 của riêng nó. Đo trên app đang chạy, 20 tab ở 8 route
light: thấp nhất **4,63:1** (trên gray-50), không cái nào trượt.

Viền của ô luôn có ở **cả hai** trạng thái, chỉ đổi màu — cho riêng ô đang chọn một
viền thì mỗi lần bấm tab, chữ của mọi ô xê 1px.

**Nút không lấy chiều cao 30px của 1a.** §2.5 của bộ tài liệu tả nút `+ Giao dịch` trên
top bar desktop; §4.6 của cùng bộ tài liệu lại nói "mọi vùng chạm giữ min-h-11 (44px)".
`ActionButton` dùng chung cho ~90 chỗ, phần lớn là sheet trên điện thoại → **44px
thắng**. Nút 30px là dáng riêng của top bar, dựng cùng PR khung app.

## Khung app: rail + top bar (bản 1a)

`AppLayout` → `AppRail` (52px, trái) · `AppTopBar` (52px, trên) · `BottomNav` (mobile).
Danh sách đích và tiêu đề màn ở `components/navItems.ts` — **một** bảng cho cả ba.

Ba luật đã đo, đừng đạp lại khi dựng tiếp:

**1. Khung app đứng NGOÀI phần cuộn, không `position:sticky`, không `z-index`.** Rail và
top bar là anh em của `<main>` trong một khung `h-dvh overflow-hidden`, nên chúng dính sẵn.
Thanh tab dưới cũng nằm trong luồng — bản cũ `fixed` rồi chừa `pb-28` ở `<main>`, hai con
số ở hai file, lệch nhau là dòng cuối chui xuống dưới thanh. Hệ quả: khung app không bao
giờ chạm dải z-40 của sheet — `tests/overlayLayers.test.ts` canh đúng điều đó.

**2. Top bar KHÔNG dùng `<h1>`.** 18 trang đã tự có `<h1>` của chúng, nên top bar thành
h1 nữa là hai h1 hiện cùng lúc trên hầu hết route. Top bar là khung ("đang ở đâu"), tiêu
đề tài liệu thuộc về trang. Hai trang mà h1 vốn là **nhãn tháng** (Sổ, Ngân sách) nay
dùng `<h1 className="sr-only">` cho tên màn và `<p aria-live>` cho nhãn tháng.

**3. Vùng chạm nhỏ hơn 44px chỉ được phép ở phần CHỈ-DESKTOP.** Rail 34px, control top
bar 28–30px — cả hai `hidden lg:flex`, tức chỉ tồn tại khi thiết bị trỏ là chuột (ngưỡng
WCAG 2.5.8 là 24px). Bản mobile của rail là thanh tab dưới, ở đó **46px**.

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

## Chuyển động (§12): console không trôi, chỉ bật

Bảng §12 của bản 1a gán **mỗi việc một thời lượng**. Bảy con số đó là token trong `index.css`, đặt tên theo VIỆC chứ theo con số — hai việc tình cờ cùng 120ms mà chung một tên là khoá cứng chúng vào nhau, lần sau muốn tách phải đi tìm từng chỗ dùng.

| Token | Việc | Nơi dùng |
| --- | --- | --- |
| `--motion-period` 140ms | đổi tháng/kỳ: số mới **bật** lên, cột nội suy chiều cao | `<Swap>`, `CashflowPanel` |
| `--motion-segment` 120ms | nền ô đang chọn trượt trong track | `SegmentedControl` |
| `--motion-sheet` 180ms | mở sheet (mobile trượt đáy) / modal (desktop fade + scale .98→1) | 26 sheet, `lib/dialog` |
| `--motion-group` 160ms | xổ nhóm `grid-template-rows: 0fr→1fr` | `<Collapse>` |
| `--motion-todo` 200ms | việc cần làm: gạch ngang rồi co về 0 | `TodoPanel` |
| `--motion-drag` 120ms | các dòng khác nhường chỗ khi kéo–thả (FLIP) | `DragList` |
| `--motion-assume` 220ms | thả thanh trượt giả định 13b | `LifetimeChartCard` |

Cộng thêm `--motion-progress` 300ms cho vòng tải — **không** phải một dòng của §12, chỉ có tên để luật "không viết thời lượng bằng tay" không phải chừa ngoại lệ.

**Ba tiện ích, ba việc khác nhau.** `motion-*` gói cả `transition-property` (biết nội suy CÁI GÌ), `animate-*` cho bốn keyframes có tên (`sheet-in`, `sheet-pop`, `overlay-in`, `swap-in`), và `src/lib/motion.ts` là bản sao JS cho hai chỗ CSS không tới được — recharts nhận số ms qua prop, còn React phải chờ CSS co xong mới tháo hàng. Guardrail so bản sao JS với CSS, lệch là đỏ.

**`prefers-reduced-motion` không phải khai lại:** block ở cuối `index.css` đè cả `animation-duration` lẫn `transition-duration` về 0.01ms, kể cả inline style (nó `!important`).

**Hai nửa cố ý CHƯA làm**, ghi lý do tại chỗ trong code:

- **Đóng sheet 120ms.** 26 sheet đều tự dựng lớp phủ tại chỗ và tự gọi `onClose` từ vài chỗ bên trong. Hoạt ảnh đóng đòi phần tử sống thêm 120ms sau khi người dùng đã đóng → phải có primitive `<Sheet>` giữ quyền tháo lắp. Đó là việc dựng primitive; làm cho một sheet mà 25 cái kia không có thì tệ hơn không làm.
- **"Số cũ mờ đi" khi đổi kỳ.** Cần con số cũ còn trên màn trong lúc số mới đang tới, mà truy vấn theo kỳ không giữ dữ liệu kỳ trước (không `placeholderData`) — với tháng chưa có trong cache thì thứ thay chỗ là trạng thái đang tải, và làm nó mờ đi là hoạt ảnh cho một khoảng trống. Đổi cách nạp dữ liệu là quyết định về DỮ LIỆU, không phải về chuyển động.

**`<Collapse>` giữ nội dung trong DOM khi đóng** (điều kiện để có cái mà nội suy) nên nó gắn `inert` — thiếu thì Tab vẫn nhảy vào một danh sách link vô hình. Vì vậy **không** dùng nó cho cây danh mục (`BudgetView`, `CategoryBreakdownCard`): ở đó gập lại chính là để KHỎI dựng hàng chục dòng con của 60 danh mục.

**Đo hoạt ảnh trong khung xem trước thì cẩn thận:** tab bị ẩn (`document.hidden`) đóng băng đồng hồ hoạt ảnh — `transition` đứng ở giá trị đầu và `ResizeObserver` không nổ. Đo LAYOUT thì tắt transition trước (`style.transitionProperty = 'none'`), đừng đọc số giữa lúc frozen rồi tưởng là lỗi bố cục.

---

## Cỡ chữ lớn (§13): cái gì tính bằng px thì đứng yên

`--app-font-scale` (Cài đặt → Cỡ chữ) chỉ co giãn được cái tính theo **rem**. Bốn mức: 0,9 · 1 · 1,1 · **1,25** — spec §13 nói "scale 1,3×", nhưng mức lớn nhất người dùng chọn được thật là 1,25.

**Ba luật, cả ba đã thành guardrail:**

1. Cỡ chữ px → rem (`text-[13px]` là ban cứng, xem Guardrail).
2. **Bề rộng cột px → rem/ch/minmax** — ban cứng cho `w-`/`min-w-`/`max-w-`/`basis-`/`grid-cols-` có px **≥ 16**. Dưới 16px thì không còn là cột chứa chữ mà là vạch/mốc (`min-w-[3px]` của cột biểu đồ, `gap-[3px]`) và những cái đó **phải** đứng yên — không thì biểu đồ đổi hình vì người dùng phóng chữ.
3. **Hàng một dòng phải chịu được xuống hai dòng.** Không có cách quét tĩnh cho luật này; cách đo là chạy app ở 1,25× rồi tìm `scrollWidth > clientWidth`, bỏ qua `truncate` (ellipsis có chủ ý), `sr-only`, và khối `overflow-x-auto` (cuộn ngang có chủ ý).

**Ba lỗi thật tìm được bằng phép đo đó** (2026-08-18), cả ba đều là cùng một sai lầm về flex:

- **Cặp panel của Bản tin không bao giờ xuống dòng.** `flex-wrap` + `flex-1 min-w-0` **không** làm nên bố cục dọc: mục flex co được thì flex cho co, chứ không cho `flex-wrap` chạy. Đo trên máy: ở 375px hai panel đứng cạnh nhau mỗi cái 166px — trái hẳn với §6 và với chính comment ở trên chúng. Ở 1,25× thì số `¥54.118` bị cắt 8px và dòng giao dịch tràn 39px. Sửa: `basis-full xl:basis-0` — dọc dưới xl, ngang từ xl, và `basis-full` theo phần trăm nên miễn nhiễm với cỡ chữ.
- **`truncate` trong flex không có tác dụng nếu thiếu `min-w-0`** (mục flex mặc định `min-width: auto`): nhãn tài khoản tràn ra ngoài viền nút 31px thay vì hiện dấu …
- **Nhưng chỉ `min-w-0` thì mục teo về 0.** Cùng hàng có ô ngày rộng 7,5rem cố định, nên picker bị bóp còn 36px — vừa đủ hai icon, tên tài khoản mất sạch. Phải có **sàn** (`min-w-[7rem]`) để `flex-wrap` có việc làm. Công thức đủ là: **sàn `min-w-*` ở mục + `min-w-0` ở phần chữ bên trong + `flex-wrap` ở hàng cha.**

Kết quả sau khi sửa: 12 màn × {320px, 375px, 1100px, 1400px} ở 1,25× không còn chỗ nào tràn, và `document.scrollWidth` không vượt `innerWidth` ở bất kỳ màn nào — trang không bao giờ cuộn ngang.

---

## Guardrail

`tests/designSystem.test.ts`, chạy trong `npm test`. Hai loại luật:

**Ban cứng — phải bằng 0.** Dành cho thứ đã dọn sạch; tái xuất hiện là hồi quy.

- `text-gray-400 dark:text-gray-500` (sai chiều sáng/tối)
- `text-green-600 dark:text-green-400`, `text-red-600 dark:text-red-400` (trượt AA)
- `text-green-800 dark:text-green-400`, `text-red-700 dark:text-red-400` (đúng màu nhưng **viết lại cặp bằng tay** — dùng `text-money-in`/`text-money-out`)
- `bg-green-600` (nút: trắng trên nó chỉ 3,22:1)
- `text-[0.5625rem]` (dưới sàn đọc được)
- `w-[420px]` và họ hàng — bề rộng px ≥ 16 trong tiện ích bề rộng (§13)
- `duration-300` / `duration-[140ms]` — thời lượng viết tay, phải qua token §12

Scanner **bỏ comment trước khi đếm** — nếu không thì chính lời giải thích "đừng dùng X" trong comment lại làm test đỏ, mà comment tại chỗ là nơi tốt nhất để ghi lý do.

**Ngưỡng — chỉ được giảm.** Idiom còn nhiều chỗ chưa gộp. Đặt về 0 ngay thì phải refactor 92 file trong một lần, mà repo **không có test UI nào** (54 file test đều là logic thuần, không có `@testing-library`). Ngưỡng cho phép gộp dần mà vẫn chặn thêm mới.

**Gộp bớt được chỗ nào thì hạ số trong file test xuống.** Để nguyên thì ngưỡng thành chỗ trú cho nợ kỹ thuật.

**Hai lần đã xảy ra đúng chuyện đó, ghi lại để nhận ra sớm hơn:**

- `bg-green-700` treo ở trần **21** trong khi thực tế còn **1** — 20 chỗ đã theo đợt dọn bảng màu thô đi hết mà không ai hạ trần. Hạ về 1 thì luật đổi nghĩa và chặt hơn hẳn: sắc độ này chỉ được khai ở NGUỒN token (`statusColors.ts`).
- Trần `rounded-md` **đếm ngược chiều**. Từ §1.3, `rounded-md` là bán kính ĐÚNG của control, nên mỗi lần một nút đi theo quy ước thì test lại đỏ và cách "sửa" là nới trần — 13 → 47 qua 12 lần nới. Đã **bỏ**, thay bằng luật thật: đếm control (`<button|input|select|textarea>`) còn mang bán kính PANEL (`rounded-lg/xl/2xl`) — **200 chỗ**, đó mới là chiều nợ còn lại. Không đếm `<Link>`: một `<Link>` có thể là cả một thẻ bấm được, và bán kính panel ở đó là đúng.

Bài học chung: **một trần chỉ có nghĩa khi nó đo được chiều nợ.** Trần đếm phần đã đúng thì càng dọn càng đỏ.

**Đợt gộp thẻ (2026-08-18): `rounded-xl bg-surface` 74 → 10.** Codemod đổi 64 thẻ viết tay ở 40 file sang `<Card>`. Việc này KHÔNG chỉ là dọn code — nó **sửa một lỗi nhìn thấy được ở dark**: `<Card elevation="raised">` mang `dark:border dark:border-border-panel dark:shadow-none`, tức bỏ bóng và thay bằng viền (quyết định của 1a), còn 64 thẻ viết tay vẫn giữ `shadow-sm` ở dark — mà bóng trên nền `#0e1014` gần như vô hình, nên chúng **không có ranh giới nào cả**. Đo lại sau khi đổi: viền 1px `#1b1e24`, đúng `border-panel`.

**Đợt bán kính control (2026-08-18): 200 → 0, và luật LÊN HẠNG.** §1.3 tách bán kính CONTROL 6px khỏi PANEL 8px; 200 nút/ô nhập dựng từ trước 1a vẫn mang 8px. Codemod đổi cả 200 (144 `<button>`, 40 `<input>`, 16 `<select>`) sang `rounded-md`, chỉ đụng chữ nằm TRONG thẻ mở nên `rounded-full` (chip, công tắc) và `rounded-sm` (vạch) không bị chạm. Ngưỡng hết việc → chuyển thành **ban cứng**. Đó là vòng đời mong muốn của một ngưỡng: đo → chặn mọc thêm → dọn hết → hoá luật cứng.

**Điểm mù của luật này, đã thử để biết chắc:** bán kính đi tới control qua một HẰNG SỐ (`BASE` trong `IconButton`/`ActionButton`) thì luật không thấy — sửa `rounded-md` → `rounded-lg` trong `IconButton.tsx` mà test vẫn xanh; sửa đúng class đó trên một `<button>` thật thì test đỏ ngay. Chấp nhận được vì hằng số kiểu đó chỉ có ở hai primitive, nhưng ai đổi ở đó phải biết mình đang đổi cho cả app.

Còn **4 control** mang `rounded` trần (4px) — nhỏ hơn 6px chứ không phải bán kính panel, nên luật hiện tại không tính. Một lát dọn khác.

Mười chỗ còn lại không máy móc đổi được: hai chỗ class là template literal (đổi theo trạng thái kéo–thả), một chỗ có `key=` ngay trên thẻ, bảy chỗ không có `shadow-sm` (dáng `flat`/`panel` viết tay). Mỗi cái cần xét nghĩa riêng.

Hai cái bẫy của codemod loại này, đã đạp cả hai:

- **Chèn `import` sai chỗ.** Chèn sau "dòng cuối bắt đầu bằng `import `" là chèn vào GIỮA một `import {` nhiều dòng — vỡ hai file. Phải chèn sau dòng KẾT THÚC của import cuối (`} from '…'`).
- **Trùng tên với component cục bộ.** `TrendsView.tsx` có sẵn một component tên `Card`; import primitive vào là nó che chính mình, và codemod còn đổi `<section>` bên trong thành `<Card>` — thành đệ quy. Đã đổi tên cục bộ thành `TrendCard`.

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

Từ bản 1a, `STATUS_CHIP` đọc token `--state-{good,warn,bad}-{bg,border,fg}` thay vì viết
cặp sáng/tối tại chỗ — vì **banner** của form Nhập (§4.6) dùng đúng bộ mặt đó, và để ở
`statusColors.ts` thì banner sẽ chép tay lại. Ở dark, viền mới là thứ vẽ ra hình cái chip
(nền chip chỉ hơn nền thẻ vài phần trăm, và 1a không có shadow). Đo lại ở dark:
good 10,97 · warn 10,84 · bad 10,92 — ba tông giờ đồng đều, khác bảng cũ (8,09 … 10,19)
vốn lệch vì mỗi tông một bậc alpha. Light **không đổi màu**: token light trỏ đúng bộ
green-100/amber-100/red-100 + chữ bậc 700, viền trùng màu nền nên vô hình.

`STATUS_FILL` **giữ nền đặc** — §2.6 của bộ tài liệu nói chip *và* dot cùng đổi sang
"nền tối + viền", nhưng áp vào chấm 8px là xoá luôn cái chấm, và bản vẽ 1a cũng để chấm
đặc. Đo lại trên thang mới (đã composite alpha, ca xấu nhất trên `sunken`): bad 3,60 ·
warn 4,66 · good 4,52 · info 6,85 — cả bốn vẫn ≥3:1.

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
