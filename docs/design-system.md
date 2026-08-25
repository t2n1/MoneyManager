# Design system — Sổ Gạo

Sổ tra cứu để **dựng màn mới**. Ba tầng: nguyên thuỷ (palette Tailwind v4) → ngữ nghĩa
(`src/index.css`) → component (`src/components/ui`).

> **Một luật bao trùm:** đừng phát minh giá trị mới. Mọi màu, cỡ chữ, bán kính, khoảng
> cách và thời lượng đã có tên. Cần một cái chưa có tên → đặt tên nó ở tầng token trước,
> đừng chêm giá trị tuỳ ý vào `className`. `tests/designSystem.test.ts` canh đúng điều đó
> và nó chạy trong `npm test`.

| | |
|---|---|
| **[Phần I — Dựng một màn mới](#phần-i--dựng-một-màn-mới)** | công thức, khuôn màn, checklist trước khi commit |
| **[Phần II — Tra cứu](#phần-ii--tra-cứu)** | màu · chữ · hình học · chuyển động · primitive · khung app |
| **[Phần III — Luật](#phần-iii--luật-guardrail)** | guardrail: ban cứng, ngưỡng, sửa sao khi đỏ |
| **[Phần IV — Vì sao lại thế](#phần-iv--vì-sao-lại-thế)** | bẫy đã ĐO, đừng đạp lại |
| **[Chưa làm](#chưa-làm)** | nợ còn treo |

---
---

# Phần I — Dựng một màn mới

## Công thức

Tám bước, theo thứ tự. Mỗi bước nói **dùng cái gì**, không nói tại sao — lý do ở Phần IV.

**1. Vỏ trang.** Padding `p-3` ở mobile, `lg:p-6` ở desktop (`lg:p-4` cho màn dày như Sổ /
Cài đặt). Xếp dọc bằng `gap`, đừng dùng `mb-*` trên từng khối.

```tsx
<div className="flex flex-col gap-3 p-3 lg:p-6">
```

Đừng chặn `max-w-*`. Khung app cố ý nở hết bề ngang (xem [Khung app](#khung-app)). Chỉ
màn một-cột-form mới bó (Nhập: `max-w-2xl lg:max-w-5xl`).

**2. Đầu trang — luôn là `<PageHeader>`.** Không tự viết `<h1>`; guardrail chặn.

```tsx
<PageHeader title="Nợ / cho vay" back="/assets">
  <ActionButton variant="primary" onClick={...}>
    <Plus className="h-4 w-4" /> Thêm
  </ActionButton>
</PageHeader>
```

- `back` = trang con. Bỏ trống = màn gốc (rail / thanh tab đã nói đang ở đâu).
- Tiêu đề tự thành `sr-only` ở `lg` **chỉ khi** trùng chữ top bar đang in.
- `flush` khi khối cha đã giãn bằng `gap`.

**3. Nội dung gói trong `<Card>`.** Đừng viết `rounded-xl bg-surface shadow-sm` bằng tay.

```tsx
<Card as="section" padding="lg">
  <SectionTitle>Giao dịch gần đây</SectionTitle>
  …
</Card>
```

**4. Tiêu đề trong thẻ — `<SectionTitle>`, chọn vai trò:**

| `role` | Dùng khi | Ra hình |
|---|---|---|
| `micro` | nhãn đứng ngay **trên một con số** ("TÀI SẢN RÒNG") | 11px CHỮ HOA, giãn `tracking-label`, xám |
| `card` *(mặc định)* | **tên của một thẻ** ("Ngân sách", "Tài khoản") | 14px semibold, sáng |
| `block` | **tiêu đề một khối** gồm nhiều thẻ | 16px bold, sáng |

**5. Mọi con số qua `<Money>` hoặc `<Num>`.** Không bao giờ tự ghép `font-mono
tabular-nums`.

```tsx
<Money amount={remaining} currency={base} tone="out" approx={hasMissingRate} />
<Num tone="muted">{soThang} tháng</Num>   {/* đếm, %, số tháng — KHÔNG phải tiền */}
```

`<Money>` đi qua chế độ riêng tư (che số) và tự in dấu `-`. `<Num>` thì không — đó là lý
do trục thời gian và mẫu số phải dùng `<Num>`, che chúng là con số bên cạnh hết nghĩa.

**6. Chọn đúng họ control** — xem [Ba họ "chọn 1 trong N"](#ba-họ-cho-câu-hỏi-chọn-1-trong-n).

**7. Nút.** `<ActionButton>` cho nút có chữ, `<IconButton>` cho nút chỉ icon. Cả hai tự
mang 44px vùng chạm + `transition` + `active:scale-95`.

```tsx
<ActionButton variant="primary">Lưu</ActionButton>
<ActionButton variant="danger" onClick={handleDelete}>Xóa khoản nợ</ActionButton>
<IconButton aria-label="Tháng trước" onClick={...}><ChevronLeft className="h-5 w-5" /></IconButton>
```

`<Link>` là thẻ `<a>` nên không dùng component được → dùng hàm class:

```tsx
<Link to="/search" className={iconButtonClass()} aria-label="Tìm kiếm giao dịch">
```

**8. Trạng thái rỗng / đang tải — `<EmptyState>`.**

```tsx
<EmptyState>Đang tải…</EmptyState>
<EmptyState compact>Chưa có lần trả nào</EmptyState>   {/* thay ruột MỘT thẻ */}
```

## Khuôn màn chuẩn

Dán cái này rồi sửa. Nó đã đi qua mọi guardrail.

```tsx
import { Plus } from 'lucide-react'
import {
  ActionButton, Card, EmptyState, Money, PageHeader, SectionTitle,
} from '../../components/ui'

export function ManMoiPage() {
  const { data, isLoading } = useThuGiDo()

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <PageHeader title="Màn mới" back="/so">
        <ActionButton variant="primary" onClick={() => setSheet(true)}>
          <Plus className="h-4 w-4" /> Thêm
        </ActionButton>
      </PageHeader>

      {isLoading ? (
        <EmptyState>Đang tải…</EmptyState>
      ) : data.length === 0 ? (
        <Card as="section">
          <EmptyState compact>Chưa có khoản nào.</EmptyState>
        </Card>
      ) : (
        <Card as="section" padding="none">
          {data.map((row) => (
            <div key={row.id} className="flex items-center gap-2 border-t border-border-subtle px-3 py-2.5 first:border-t-0">
              <span className="min-w-0 flex-1 truncate text-sm text-fg-primary">{row.name}</span>
              <Money amount={row.amount} currency={row.currency} tone="out" />
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
```

## Trước khi commit

```bash
npm test && npx tsc -b && npx oxlint src
```

Rồi mở app và soát bằng MẮT — guardrail là quét nguồn, nó không thấy được ba loại lỗi sau:

1. **Cả hai chế độ màu.** Nhiều luật chỉ đúng ở một chế độ. Đổi bằng Cài đặt → Giao diện,
   đừng bật class `.dark` bằng JS (xem [bẫy đo contrast](#cách-đo-contrast-cho-đúng)).
2. **Cỡ chữ 1,25×** (Cài đặt → Cỡ chữ → Rất lớn) ở bề ngang **375px**. Tìm
   `document.documentElement.scrollWidth > clientWidth` — trang không bao giờ được cuộn ngang.
3. **Trang cần ID** (chi tiết nợ / tài khoản / danh mục). Chúng hay là chỗ duy nhất có
   biểu thức JSX trong tiêu đề, và `tsc` không bắt được `title="{debt.counterparty}"`.

---
---

# Phần II — Tra cứu

## Màu

Khai ở `src/index.css`. Đọc `--fg-muted` chứ đừng đọc `gray-500`: đổi một chỗ là đổi cả
app, và tên nói lên **vai trò** nên khó dùng sai. Dùng qua tiện ích Tailwind:
`text-fg-muted`, `bg-surface`, `border-border-subtle`.

| Token | Light | Dark | Đo được |
|---|---|---|---|
| `fg-primary` | gray-800 | `#e6e9ee` | 14,7 / 14,7:1 |
| `fg-secondary` | gray-600 | `#c9cfd8` | 7,6 / 11,4:1 |
| `fg-muted` | gray-500 | `#99a1af` | **4,84:1 — sàn ở light** |
| `fg-on-track` | gray-600 | `#99a1af` | 6,87 / 6,85:1 |
| `money-in` | green-800 | green-400 | 7,13 / 10,0:1 |
| `money-out` | red-700 | red-400 | 6,42 / 6,2:1 |
| `surface-page` | gray-50 | `#08090b` | nền trang |
| `surface-chrome` | gray-50 | `#0b0d10` | top bar, rail, header nhóm trong bảng |
| `surface` | white | `#0e1014` | thẻ / panel |
| `surface-sunken` | gray-100 | `#14181d` | track segmented, nút phụ |
| `border-subtle` | gray-100 | `#14171c` | đường kẻ giữa các dòng |
| `border-panel` | gray-200 | `#1b1e24` | viền panel & khung |
| `border-strong` | gray-300 | `#232830` | viền control, viền nút |
| `accent` | green-700 | green-500 | nền nút chính, focus ring, chip đang bật |
| `fg-accent` | green-700 | green-400 | **chữ** bấm được (link, hành động phụ) |
| `fg-on-accent` | white | `#08090b` | chữ ĐÈ LÊN nền accent |

Bốn nấc bề mặt xếp lún → nổi: `page` → `chrome` → `surface` → `sunken`. Ở **light không
có nấc thứ tư** (`chrome` = `page`), khung phân biệt bằng `border-panel`.

### Ba token xanh, đừng trộn

- `accent` — **nền** nút chính, chip đang bật. Bậc 700 vì có chữ đè lên.
- `fg-accent` — **chữ** bấm được: link, nút text.
- `money-in` — "đây là khoản **thu**".

Nút trùng màu số thu nhập thì mất phân biệt *hành động* với *giá trị*.

### Hai luật màu bắt buộc

- **Chữ mờ trên bất kỳ nền lún nào phải dùng `fg-on-track`**, không phải `fg-muted`.
  gray-500 đạt 4,84:1 trên trắng nhưng chỉ 4,39:1 trên `surface-sunken` → trượt AA.
- **Không có bậc xám nào mờ hơn gray-500 mà vẫn đạt AA.** Muốn phân cấp thêm thì dùng
  **cỡ chữ**, đừng làm nhạt màu. App cố ý không có bậc chữ "tam cấp" bằng màu.

## Chữ

**Font:** `--font-sans` = IBM Plex Sans · `--font-mono` = IBM Plex Mono. **Mọi con số** —
tiền, ngày, %, mã tháng — đi bằng mono.

Hai điều **đừng** đổi khi đụng vào phần nạp font:

- **Không chốt `subset=` trong URL css2.** App viết tiếng Việt nên cần subset `vietnamese`
  (U+1EA0–1EF9, và ₫ U+20AB). Chốt `latin,latin-ext` là mọi chữ có dấu nặng/hỏi rơi về
  font hệ thống — lộ ra chữ lệch nét ngay giữa một câu. Để mặc định không tốn thêm byte:
  css2 chia `@font-face` theo `unicode-range`.
- **Luật `runtimeCaching` cho hai origin font trong `vite.config.ts`** giữ font sống khi
  offline. Bỏ nó thì mở offline rơi về font hệ thống, và cột số mất bề rộng mono nên bảng
  tiền lệch hàng.

**Độ đậm:** 400 · 500 · 600 · 700. Thêm bậc mới thì **phải sửa URL font trong
`index.html` cùng lúc**, không thì trình duyệt bôi đậm giả.

### Sáu bậc cỡ chữ, mỗi bậc cách nhau ít nhất 2px

| Tên | Giá trị | Dùng cho |
|---|---|---|
| `text-2xs` | 0.6875rem (11px) | **sàn dưới** — nhãn chữ hoa, chú thích, dòng meta |
| `text-sm` | 0.875rem (14px) | chữ thân: tên giao dịch, số tiền trong danh sách, mọi câu |
| `text-base` | 1rem (16px) | tiêu đề một khối gồm nhiều thẻ |
| `text-lg` | 1.125rem (18px) | tiêu đề trang |
| `text-kpi` | 1.375rem (22px) | số trong **một ô** (StatTile, KpiRow, tổng tab) |
| `text-hero` | 1.875rem (30px) | số **chính của cả màn** — mỗi màn nhiều nhất một |

`text-3xs` (10px) còn trong `@theme` nhưng **chỉ cho biểu đồ** (`src/lib/chartText.ts`).
Trong `className` thì đừng dùng: ở `--app-font-scale` 0,9 nó tụt xuống 9px.

Mọi cỡ chữ dùng `rem`. **Đừng dùng `px`**, và đừng chêm `text-[…rem]` tuỳ ý.

### Số: một font, hai cỡ

`text-kpi` / `text-hero` chỉ đứng trên **số**, nên chỗ nào mang chúng cũng phải mang
`font-mono` — trực tiếp, hoặc gián tiếp qua `<Money>`/`<Num>`. Guardrail canh cặp này.

### Giãn chữ: hai token

| Tên | Giá trị | Dùng cho |
|---|---|---|
| `tracking-label` | 0.1em | nhãn CHỮ HOA — chữ hoa 10–11px dính vào nhau nếu để mặc định |
| `tracking-number` | −0.02em | số lớn — chữ số 22px+ để mặc định thì rời rạc |

`tracking-normal` không bị cấm: nó là phép **đặt lại** cho huy hiệu nằm trong nhãn đã giãn.

## Hình học

### Bán kính — bốn tầng, theo VAI TRÒ không theo cỡ

| Class | px | Dùng cho | Đếm được |
|---|---|---|---|
| `rounded-md` | 6 | **control**: nút, tab, ô nhập, ô chọn, banner | 215 |
| `rounded-lg` | 8 | **panel**: khung 1a, khối trạng thái | 101 |
| `rounded-xl` | 12 | **thẻ** (qua `<Card>`) | 29 |
| `rounded-2xl` | 16 | **thẻ hero** và **sheet trượt lên** (`rounded-t-2xl`) | 25 + 24 |
| `rounded-full` | ∞ | chip, chấm, thanh tiến trình | 153 |

Control mang bán kính panel là **ban cứng** — 200 chỗ đã dọn, đừng dựng lại.

### Khoảng cách

| | Giá trị | Dùng cho |
|---|---|---|
| Giữa các khối trong trang | `gap-3` (12px) · `gap-4` khi khối lớn | xếp dọc bằng `gap`, không `mb-*` |
| Trong một hàng | `gap-2` (8px) mặc định · `gap-1.5` khi chật | |
| Padding trang | `p-3` mobile · `lg:p-6` (hoặc `lg:p-4` cho màn dày) | |
| Padding thẻ | qua `<Card padding>`: `sm` 10px · `md` 12px *(mặc định)* · `lg` 16px · `panel` 16/14px | |

### Cỡ icon

| Class | Dùng cho |
|---|---|
| `h-4 w-4` | icon **trong nút có chữ** (`<Plus/> Thêm`) |
| `h-5 w-5` | icon **đứng một mình** trong `<IconButton>` |
| `h-3.5 w-3.5` | dải chip chật, dòng meta |

### Breakpoint

**`lg` (1024px) là ranh giới mobile ↔ desktop** và là breakpoint duy nhất mang nghĩa cấu
trúc — nó quyết định rail hiện hay thanh tab hiện, top bar có tiêu đề hay không, vùng chạm
được phép nhỏ hơn 44px hay không. `sm` / `md` / `xl` chỉ dùng để tinh chỉnh cục bộ.

## Chuyển động

Bảy token trong `index.css`, đặt tên **theo VIỆC** chứ không theo con số.

| Token | Việc | Nơi dùng |
| --- | --- | --- |
| `--motion-period` 140ms | đổi tháng/kỳ: số mới **bật** lên | `<Swap>`, `CashflowPanel` |
| `--motion-segment` 120ms | nền ô đang chọn trượt trong track | `SegmentedControl` |
| `--motion-sheet` 180ms | mở sheet / modal | 26 sheet, `lib/dialog` |
| `--motion-group` 160ms | xổ nhóm `grid-template-rows: 0fr→1fr` | `<Collapse>` |
| `--motion-todo` 200ms | việc cần làm: gạch ngang rồi co về 0 | `TodoPanel` |
| `--motion-drag` 120ms | các dòng nhường chỗ khi kéo–thả (FLIP) | `DragList` |
| `--motion-assume` 220ms | thả thanh trượt giả định | `LifetimeChartCard` |

Cộng `--motion-progress` 300ms cho vòng tải. **Đừng viết thời lượng bằng tay** —
`duration-300` là ban cứng.

**Ba tiện ích, ba việc khác nhau:**

| | Việc |
|---|---|
| `motion-*` | gói cả `transition-property` — biết nội suy CÁI GÌ |
| `animate-*` | bốn keyframes có tên: `sheet-in` · `sheet-pop` · `overlay-in` · `swap-in` |
| `src/lib/motion.ts` | bản sao JS cho hai chỗ CSS không tới được — recharts nhận số ms qua prop, và React phải chờ CSS co xong mới tháo hàng. Guardrail so bản sao JS với CSS, lệch là đỏ |

`prefers-reduced-motion` **không phải khai lại**: block cuối `index.css` đè cả
`animation-duration` lẫn `transition-duration` về 0.01ms, kể cả inline style.

## Component primitive

`import { Card, Money, … } from '../../components/ui'`

| Component | Props chính | Dùng ở |
|---|---|---|
| `PageHeader` | `title` `back` `left` `subtitle` `flush` `mobileOnly` | 24 file |
| `Card` | `elevation` (`raised`\|`flat`\|`panel`) · `padding` (`none`\|`sm`\|`md`\|`lg`\|`panel`) · `as` | 78 |
| `SectionTitle` | `role` (`micro`\|`card`\|`block`) · `as` · `id` | 85 |
| `Money` | `amount` `currency` `tone` `showSign` `compact` `approx` | 43 |
| `Num` | `tone` — cho số KHÔNG phải tiền (đếm, %, số tháng) | 10 |
| `ActionButton` | `variant` (`outline`\|`primary`\|`danger`) · `actionButtonClass()` cho `<Link>` | 21 |
| `IconButton` | `variant` (`surface`\|`ghost`\|`accent`) · `aria-label` **bắt buộc** · `iconButtonClass()` | 12 |
| `SegmentedControl` | `items` `value` `onChange` `label` **bắt buộc** `size` `stretch` | 16 |
| `FilterChip` | `on` · `size` (`md`\|`sm`) · `aria` (`pressed`\|`selected`) · `filterChipClass()` | 5 |
| `Select` | mọi prop của `<select>` + `wrapClassName` (bề rộng/lề cho khung bao) | 17 |
| `EmptyState` | `compact` | 26 |
| `StatTile` | `label` `children` `center` | 3 |
| `StatusChip` / `StatusDot` | `tone` `label` — `label` **bắt buộc** ở Dot (màu là kênh duy nhất) | 6 / 3 |
| `Guide` / `FullOnly` | chữ để dạy, ẩn ở chế độ Gọn | 56 |
| `Collapse` · `Swap` · `Sparkline` | | 3 · 3 · 5 |

### Ba họ cho câu hỏi "chọn 1 trong N"

Đừng trộn — chúng khác nhau về **nghĩa**, không chỉ về hình:

| Họ | Dùng khi | Hình |
|---|---|---|
| `SegmentedControl` | đổi **cách xem** cùng một dữ liệu (Ngày · Lịch · Tháng) | dải liền khối, chia đều, luôn đúng một ô bật |
| `FilterChip` | **lọc / bật tắt** một tập con (Chi · Thu · Chuyển khoản) | chip rời, bo tròn, có thể không mục nào bật |
| `Select` | chọn từ **danh sách dài** (tài khoản, múi giờ, danh mục) | ô xổ xuống, mở bộ chọn của hệ điều hành trên mobile |

### `Money` — lưu ý về dấu

`formatMoney` **tự in dấu `-`** cho số âm. Nên:

- Số lưu **dương**, chiều nằm ở `tone` (dòng giao dịch) → bật `showSign`
- Số **đã có dấu** (số dư, chênh lệch) → **đừng** bật `showSign`, không thì ra `--`

Dấu dùng ASCII `-`/`+`. Đừng trộn `−` (U+2212): hai glyph lệch bề rộng dù đã `tabular-nums`.

### `<Collapse>` — một chỗ KHÔNG được dùng

Nó giữ nội dung trong DOM khi đóng (điều kiện để nội suy được) nên phải gắn `inert`. Vì
vậy **không** dùng cho cây danh mục (`BudgetView`, `CategoryBreakdownCard`): ở đó gập lại
chính là để KHỎI dựng hàng chục dòng con của 60 danh mục.

## Khung app

`AppLayout` → `AppRail` (52px, trái) · `AppTopBar` (52px, trên) · `BottomNav` (mobile).
Danh sách đích và tiêu đề màn ở `components/navItems.ts` — **một** bảng cho cả ba.

Ba luật, đừng đạp lại:

1. **Khung app đứng NGOÀI phần cuộn**, không `position:sticky`, không `z-index`. Rail và
   top bar là anh em của `<main>` trong khung `h-dvh overflow-hidden` nên chúng dính sẵn.
   Hệ quả: khung app không bao giờ chạm dải z-40 của sheet — `tests/overlayLayers.test.ts`
   canh điều đó.
2. **Top bar KHÔNG dùng `<h1>`.** Nó là khung ("đang ở đâu"); tiêu đề tài liệu thuộc về
   trang, và `<PageHeader>` lo phần đó.
3. **Vùng chạm nhỏ hơn 44px chỉ được phép ở phần CHỈ-DESKTOP.** Rail 34px, control top bar
   28–30px — cả hai `hidden lg:flex`, tức chỉ tồn tại khi thiết bị trỏ là chuột (ngưỡng
   WCAG 2.5.8 là 24px). Bản mobile của rail là thanh tab dưới, ở đó **46px**.

**Khung app không chặn bề ngang.** Cột chính nở lấp phần còn lại; mỗi cặp panel là
`flex-wrap` với `flex-1 min-w-0` cạnh một cột phụ có `basis` cố định. Trang nào CẦN hẹp
thì tự bó (`max-w-2xl` ở Nhập và Sổ giao dịch).

## Màu biểu đồ: hằng số JS, không phải token

Recharts nhận màu qua prop (`fill`, `stroke`) nên **không dùng được biến CSS**. Đó là giới
hạn của thư viện, không phải nợ kỹ thuật. Hai luật:

- **Đừng đặt màu chú giải bằng class Tailwind.** Luôn trỏ vào đúng hằng số đã tô cho biểu
  đồ (`style={{ backgroundColor: HANG_SO }}`) — không thì chú giải sai màu chính cái nó
  gán nhãn.
- **Cỡ chữ biểu đồ đi qua `src/lib/chartText.ts`** (chuỗi rem). Truyền SỐ là chữ đứng yên
  khi người dùng phóng Cỡ chữ.

**Ngoại lệ — SVG viết tay.** Đồ hoạ không qua Recharts thì `stroke-*` là class Tailwind
bình thường, **lật được** theo `.dark` — ở đó phải dùng class, đừng viết hex.

### Bộ màu trạng thái

`src/components/ui/statusColors.ts` — **một** nguồn cho ba mặt của cùng ba tông
(tốt / cần chú ý / rủi ro). Hai chỗ vẽ cùng một ý nghĩa thì không được lệch màu.

| Hằng số | Dùng cho | Ngưỡng |
|---|---|---|
| `STATUS_FILL` | đồ hoạ: chấm, thanh, vùng thang đo | ≥ 3:1 (WCAG 1.4.11) |
| `STATUS_STROKE` | nét SVG | ≥ 3:1 |
| `STATUS_CHIP` | chip **có chữ** — đọc token `--state-{good,warn,bad}-{bg,border,fg}` | ≥ 4,5:1 |

`STATUS_CHIP` đi qua token vì **banner** của form Nhập dùng đúng bộ mặt đó; để ở
`statusColors.ts` thì banner sẽ chép tay lại. Ở dark, **viền** mới là thứ vẽ ra hình cái
chip (nền chip chỉ hơn nền thẻ vài phần trăm, và 1a không có shadow).

`STATUS_FILL` **giữ nền đặc** — §2.6 nói chip *và* dot cùng đổi sang "nền tối + viền",
nhưng áp vào chấm 8px là xoá luôn cái chấm.

## Chế độ trình bày: Gọn / Đầy đủ

Cài đặt → **Cách trình bày**. Mặc định **Gọn**. Nguồn sự thật là **hồ sơ người dùng**
(`profiles.density_pref`) — đặt một lần dùng mọi thiết bị.

|  | Gọn (`visual`) | Đầy đủ (`full`) |
|---|---|---|
| Chữ chỉ để dạy | ẩn | hiện |
| Câu kết luận | chip: icon + `short` | cả câu |
| "Cách tính & nên làm gì" | không có | mở ra được |

### Ranh giới: cái gì được ẩn

Sai ranh giới thì "gọn" biến thành "mất chức năng".

| Bọc `<Guide>` / `<FullOnly>` | KHÔNG bọc |
|---|---|
| cách tính, ý nghĩa con số | nhãn ô nhập, câu báo lỗi, câu xác nhận xoá |
| mẹo dùng, "vì sao lại thế" | cảnh báo dữ liệu (thiếu tỷ giá, chưa quy đổi) |
| câu chỉ đường trong trạng thái rỗng | câu nói ra chính trạng thái đó |
| gợi ý quy ước nhập liệu | câu giải thích một ô đang bị vô hiệu |

Trạng thái rỗng thường phải **tách**: giữ "Chưa có khoản nào.", bọc phần "Thêm những thứ
bạn biết là sắp phải chi…".

**Đừng tách theo MẢNH câu.** Viết **hai câu hoàn chỉnh**, mỗi chế độ một câu — bọc
`<Guide as="span">` quanh mấy từ nối để lại chữ thường sau dấu chấm và cụm link mất chủ ngữ.

Ba hook, ba vai (gộp lại thì mỗi chỗ đọc kéo theo một `useQuery`):

| Hook | Ai dùng | Việc |
|---|---|---|
| `useDensity()` | ~62 chỗ | chỉ ĐỌC bản sao localStorage |
| `useDensitySync()` | **một lần** ở AppLayout | bơm hồ sơ → bản sao |
| `useDensityControl()` | chỉ nút Cài đặt | đọc + ghi hồ sơ, lỗi thì trả về cũ + toast |

## Nhãn ô nhập: chọn thẻ nào

Theo đúng spec HTML, không theo cảm giác:

| Nhãn cho | Thẻ | Vì sao |
|---|---|---|
| MỘT `<input>`/`<Select>`/`<textarea>` | `<label htmlFor={`${uid}-x`}>` + `id` trên ô | dạng duy nhất cho screen reader tên ô chắc chắn |
| `MoneyField` | `<span>` + `ariaLabel` trên component | nó render **hai** ô (nút chạm mobile + input desktop), `htmlFor` sẽ trỏ vào ô đang bị CSS ẩn |
| `AccountPicker` | `<span>` + `ariaLabel` | nó là `<button>`; tên đọc được tính **từ nội dung** (HTML-AAM) |
| một HÀNG NÚT (segmented, chip) | `<span>` + `role="group" aria-label` trên khung | không có ô nào để trỏ vào |
| cả một KHỐI (TagPicker) | `<span>` | từng control bên trong tự mang `aria-label` |
| công tắc `role="switch"` | **giữ `<label>` bọc nút** | `button` NẰM TRONG danh sách labelable → nhãn vừa đặt tên vừa là vùng chạm |

**`useId`, không phải id viết cứng:** hai sheet có thể cùng trong DOM, và id trùng thì
`htmlFor` bắt vào ô **đầu tiên** khớp — nhãn trỏ sai ô còn tệ hơn không có nhãn. Id không
được chứa khoảng trắng, nên nhãn tiếng Việt cần thêm trường `slug`.

---
---

# Phần III — Luật (guardrail)

`tests/designSystem.test.ts`, chạy trong `npm test`. Scanner **bỏ comment trước khi đếm** —
không thì chính lời giải thích "đừng dùng X" lại làm test đỏ.

## Ban cứng — phải bằng 0

Dành cho thứ đã dọn sạch; tái xuất hiện là hồi quy.

**Màu**
- `text-gray-400 dark:text-gray-500` — sai chiều sáng/tối
- `text-green-600 dark:text-green-400`, `text-red-600 dark:text-red-400` — trượt AA
- `text-green-800 dark:text-green-400`, `text-red-700 dark:text-red-400` — đúng màu nhưng viết lại cặp bằng tay, dùng `text-money-in`/`text-money-out`
- `bg-green-600` làm nền nút — trắng trên nó chỉ 3,22:1

**Chữ**
- `text-[…rem/px/em]` — **cấm cả dạng**, dùng bậc đã đặt tên
- `text-[0.5625rem]` — dưới sàn đọc được
- `fontSize: 11` truyền vào biểu đồ — dùng `CHART_TEXT_*`
- `text-kpi`/`text-hero` mà thiếu `font-mono` (hoặc không qua `<Money>`/`<Num>`)
- `tracking-wide/tight/wider/widest` và `tracking-[…]` — dùng `tracking-label`/`tracking-number`

**Cấu trúc**
- `<h2>`/`<h3>` viết tay — dùng `<SectionTitle>`
- `<label>` mồ côi (không `htmlFor`, không bọc thẻ labelable)
- control mang bán kính panel (`rounded-lg/xl/2xl` trên `<button|input|select|textarea>`)
- `active:scale-95` thiếu `transition` — nút sẽ **nhảy** một nhịp thay vì co giãn
- tự chế focus style (`outline-green-500`, `focus:outline-none` + đổi viền)

**Kích thước**
- `w-[420px]` và họ hàng — bề rộng px ≥ 16 (dưới 16 là vạch/mốc, phải đứng yên)
- `duration-300` / `duration-[140ms]` — thời lượng viết tay

## Ngưỡng — chỉ được giảm

Idiom còn nhiều chỗ chưa gộp. Đặt về 0 ngay thì phải refactor 92 file trong một lần, mà
repo **không có test UI nào** (không có `@testing-library`). Ngưỡng cho phép gộp dần mà
vẫn chặn thêm mới.

**Gộp bớt được chỗ nào thì HẠ số trong file test xuống.** Để nguyên thì ngưỡng thành chỗ
trú cho nợ kỹ thuật.

> **Một trần chỉ có nghĩa khi nó đo được chiều nợ.** Trần đếm phần đã đúng thì càng dọn
> càng đỏ — xem [chuyện trần `rounded-md`](#hai-lần-trần-đo-sai-chiều).

## Luật ngoài `designSystem.test.ts`

| File | Canh cái gì |
|---|---|
| `tests/contrast.test.ts` · `tokenContrast.test.ts` | mọi cặp chữ/nền đạt AA ở cả hai chế độ |
| `tests/overlayLayers.test.ts` | khung app không chạm dải z-index của sheet |
| `tests/navMobile.test.ts` | thanh tab đúng **bốn** mục; màn không có tab vẫn còn lối vào ở Bản tin |
| `src/backLink.test.ts` | mọi nút quay lại là `<BackLink>` / `<PageHeader back>`, không phải `<Link>` tự viết |
| `tests/backupCompleteness.test.ts` | mọi cột của `ProfileRow` được đường KHÔI PHỤC nhắc tới — `exportAll` dùng `select('*')` nên cột mới tự vào bản lưu, nhưng `importAll` liệt kê từng cột |
| `tests/pushBundle.test.ts` · `mcpBundle.test.ts` | bundle đã commit khớp nguồn trong `src/` |

Bốn luật của **chế độ trình bày** nằm trong `designSystem.test.ts`, cả bốn đã thử gây lỗi
để chắc chúng đỏ được: khối hướng dẫn nền xanh luôn là `<Guide>` → **0**; không viết lại
sắc độ trạng thái ngoài `statusColors.ts` → **0**; mỗi `<VerdictNote>` có `short` hoặc
`label` → trần **1**; văn xuôi trong `<p class="…fg-muted…">` → trần **49** (không phải nợ
cần dọn hết — đã xét từng chỗ, phần lớn phải ở lại theo bảng ranh giới).

## Vòng đời mong muốn của một ngưỡng

đo → chặn mọc thêm → dọn hết → **hoá luật cứng**. Trần bán kính control đã đi trọn vòng
đó (200 → 0 → ban cứng).

---
---

# Phần IV — Vì sao lại thế

Phần này là **bẫy đã đo trên máy thật**. Không cần đọc để dựng màn; cần đọc trước khi
định đổi một luật ở Phần III.

## Nguyên tắc gốc: đặt tên cho cái đã có

Trước khi dựng tầng token, app đã có một hệ thống **ngầm và khá nhất quán**. Đo trên 92
file `.tsx`: bán kính 4 tầng, độ nổi thực chất một tầng, 3 bậc độ đậm, `gap-2` chiếm đa
số. Nên tầng token **không đổi** mấy trục đó. Việc của nó là (a) đặt tên cho chỗ scale bị
thiếu, (b) khoá các quyết định contrast lại thành cấu trúc.

## Ba cái bẫy màu

**1. Chiều màu ở dark bị đảo.** `text-gray-400 dark:text-gray-500` là **sai** — nền tối
thì chữ phụ phải *sáng* hơn. Chiều đúng: `text-gray-500 dark:text-gray-400`. Đã dọn 64 chỗ.

**2. `fg-muted` CHỈ an toàn trên nền trắng.**

| nền | tỉ số | |
|---|---|---|
| trắng | 4,84 | ✓ |
| gray-50 | 4,63 | ✓ |
| gray-100 (`surface-sunken`) | 4,39 | ✗ |
| gray-200 | 3,91 | ✗ |

Đây là lỗi hay gặp nhất: một lần sửa `ClassificationToggle` đã xoá **196 vi phạm** cùng
lúc. Kiểm bằng cách đo nền THỰC TẾ (leo cây DOM tìm background), đừng giả định là trắng.

**3. Đánh đổi đã biết — viền mờ đi ở dark.** `border-strong` trên `surface` tụt từ 1,72:1
xuống **1,29:1**. Cả hai đều dưới 3:1 nên không đổi trạng thái đạt/trượt, nhưng nó chốt
một luật: **viền không được là thứ duy nhất chỉ ra ranh giới một control** — control phải
có nền hoặc chữ của chính nó.

## Bốn quyết định cấu trúc của bản 1a

**1. Số đi bằng mono.** `tabular-nums` chỉ khoá bề rộng chữ số; mono khoá cả dấu phẩy
nghìn, dấu trừ và ký hiệu tiền, nên cột số đọc như bảng.

**2. Dark không còn thẻ "nổi".** `Card` dáng `raised` ở dark bỏ `shadow-sm`, thay bằng
`border-border-panel`. Bóng trên nền `#0e1014` chỉ còn là vệt tối bẩn. Light **giữ nguyên**.

**3. Bán kính tách làm hai.** Control 6px, panel 8px. Trước 1a cả hai đều 8px.

**4. Segmented đảo hai bề mặt.** Track trong suốt + viền panel; ô **đang chọn** mới có nền.
Viền của ô luôn có ở **cả hai** trạng thái, chỉ đổi màu — cho riêng ô đang chọn một viền
thì mỗi lần bấm tab, chữ của mọi ô xê 1px.

**Nút không lấy chiều cao 30px của 1a.** §2.5 tả nút trên top bar desktop; §4.6 của cùng
bộ tài liệu lại nói "mọi vùng chạm giữ min-h-11". `ActionButton` dùng cho ~90 chỗ, phần
lớn là sheet trên điện thoại → **44px thắng**.

## Đợt thống nhất 2026-08-25: đo được gì

Đây là đợt sinh ra `PageHeader`, `FilterChip`, `Select`, `EmptyState`, thang chữ sáu bậc
và hai token giãn chữ. Số liệu để hiểu vì sao các luật đó chặt đến vậy:

| Trục | Trước | Sau |
|---|---|---|
| Cỡ chữ trên **một** màn Bản tin | **10 cỡ**; 111/146 khối chữ dồn vào dải 10–13px | 5 cỡ |
| `text-[0.8125rem]` (13px) — bậc thứ mười, **không tên** | 91 lần ở 28 file | 0 |
| "Số chính của màn" | 7 cỡ · 3 độ đậm · **2 font** | `text-kpi` \| `text-hero`, luôn mono |
| Giãn chữ cho 2 vai trò | 6 giá trị | 2 token |
| Kiểu đầu trang cho 25 màn | **7** | 1 |
| `<h2>/<h3>` viết tay | 110 chỗ, **10 tổ hợp cho 3 vai trò** | 0 |
| Dáng "chip đang bật" | **5** | 1 |
| `<select>` trần | 25 chỗ, ~10 biến thể class | 0 |
| Dáng nút phá hủy | **8** | 1 |
| Dáng màn trống | 4 | 1 |

Ba chi tiết đáng nhớ:

- **`font-bold` không có file font.** Code dùng 700 **83 lần**, 21 lần là `<h1>`, mà
  `index.html` chỉ nạp `400;500;600`. Mọi tiêu đề trang đang hiện bằng chữ đậm **giả** do
  trình duyệt tự bôi. Sửa là một dòng URL.
- **Cùng con số ¥58.670 hiện ba kiểu** tuỳ chỗ đứng: 18px/600/Mono ở câu mở Bản tin,
  26px/500/Mono ở ô Ngân sách, 30px/**700/Sans** ở trang Ngân sách. Hai chỗ dùng Sans phá
  đúng luật "mono cho MỌI con số", và đó là lý do cột số ở hai màn đó không thẳng hàng.
- **Chữ biểu đồ không co theo Cỡ chữ.** 27 chỗ truyền `fontSize` dạng SỐ → ra px cứng. Đo
  ở scale 1,25: chữ thân 11 → 13,75px, nhãn trục **đứng yên 11px**. Người chọn cỡ chữ lớn
  nhất là người cần nhãn biểu đồ to nhất.

**Lỗi mà `tsc` không bắt được.** Codemod gom 25 đầu trang biến biểu thức thành chuỗi:
`title="{debt.counterparty}"`. Vẫn là JSX hợp lệ, vẫn hợp kiểu → 3237 test xanh, tsc 0
lỗi, và trang in ra đúng chữ `{debt.counterparty}`. Chỉ render mới thấy. Sau mỗi đợt
codemod JSX: `grep -rn '="{[^"]*}"' src/` **và** mở app xem các trang cần ID.

## Cỡ chữ lớn (§13): cái gì tính bằng px thì đứng yên

`--app-font-scale` chỉ co giãn được cái tính theo **rem**. Bốn mức: 0,9 · 1 · 1,1 ·
**1,25** — spec §13 nói "1,3×", nhưng mức lớn nhất người dùng chọn được thật là 1,25.

**Hàng một dòng phải chịu được xuống hai dòng.** Không có cách quét tĩnh; cách đo là chạy
app ở 1,25× rồi tìm `scrollWidth > clientWidth`, bỏ qua `truncate`, `sr-only`, và khối
`overflow-x-auto`.

**Ba lỗi thật tìm được bằng phép đo đó**, cả ba cùng một sai lầm về flex:

- **`flex-wrap` + `flex-1 min-w-0` KHÔNG làm nên bố cục dọc.** Mục flex co được thì flex
  cho co, chứ không cho `flex-wrap` chạy. Ở 375px hai panel đứng cạnh nhau mỗi cái 166px.
  Sửa: `basis-full xl:basis-0` — `basis-full` theo phần trăm nên miễn nhiễm với cỡ chữ.
- **`truncate` trong flex không có tác dụng nếu thiếu `min-w-0`** (mục flex mặc định
  `min-width: auto`).
- **Nhưng chỉ `min-w-0` thì mục teo về 0.** Công thức đủ: **sàn `min-w-*` ở mục +
  `min-w-0` ở phần chữ bên trong + `flex-wrap` ở hàng cha.**

## Vùng chạm: đo thật, đừng đoán theo class

Đếm class (`min-h-11`…) ra 22 chỗ "nghi nhỏ", nhưng phần lớn là đoán sai. Cách đúng là
**đo `getBoundingClientRect` trên máy thật**, ở 375px, qua 14 màn.

Đo theo **WCAG 2.5.8 AA (24×24)**, bỏ hai ngoại lệ chính đáng của chuẩn: liên kết nằm
trong câu văn, và ô tích trong `<label>` cao ≥24. Kết quả: **8 chỗ** dưới ngưỡng — sáu
liên kết đầu-thẻ chỉ cao 15–16px.

Chữa bằng idiom sẵn có: **`py-2` cộng `-my-2`** — vùng bấm cao thêm, bố cục không xê một
pixel. Đo lại: **0 chỗ** dưới 24×24.

## Chỉ báo tiêu điểm: một ring cho cả app

| Kiểu tự chế đã xoá | Số chỗ | Hỏng ở đâu |
|---|---|---|
| `outline-green-500` | 51 | green-500 trên trắng ~1,9:1 — dưới hẳn 3:1 |
| `focus:outline-none` + `focus:border-green-500` | 8 | tắt outline, đổi màu viền **1px** làm chỉ báo |
| `outline-none` trong ô tìm | 5 | hai chỗ thật sự không có gì hiện lên; ba chỗ có ring nhưng sai màu |

Ring token đo được (canvas pixel readback, bốn nấc bề mặt): light `green-700` **4,95 /
4,45 / 4,14**; dark `green-500` **8,59 / 8,98 / 8,04 / 8,77**. Chỗ mỏng nhất còn dư 38%.

**Vì sao `outline-none` thắng được ring:** nó là tiện ích thường (specificity 0,1,0) còn
ring đi qua `:where()` (specificity 0). Nên luật có ngoại lệ kiểm được: **ô nhập chỉ được
tắt outline khi file có `focus-within:ring`**.

## Hai lần trần đo sai chiều

- **`bg-green-700` treo ở trần 21 trong khi thực tế còn 1** — 20 chỗ đã theo một đợt dọn
  khác đi hết mà không ai hạ trần. Hạ về 1 thì luật đổi nghĩa và chặt hơn hẳn.
- **Trần `rounded-md` đếm ngược chiều.** Từ §1.3, `rounded-md` là bán kính ĐÚNG của
  control, nên mỗi lần một nút đi theo quy ước thì test lại đỏ và cách "sửa" là nới trần —
  13 → 47 qua 12 lần nới. Đã **bỏ**, thay bằng luật thật: đếm control còn mang bán kính
  PANEL — **200 chỗ**, đó mới là chiều nợ còn lại.

**Điểm mù, đã thử để biết chắc:** bán kính đi tới control qua một HẰNG SỐ (`BASE` trong
`IconButton`/`ActionButton`) thì luật không thấy. Chấp nhận được vì hằng số kiểu đó chỉ có
ở hai primitive, nhưng ai đổi ở đó phải biết mình đang đổi cho cả app.

## Hai bẫy của codemod, đã đạp cả hai

- **Chèn `import` sai chỗ.** Chèn sau "dòng cuối bắt đầu bằng `import `" là chèn vào GIỮA
  một `import {` nhiều dòng. Phải chèn sau dòng KẾT THÚC (`} from '…'`).
- **Trùng tên với component cục bộ.** `TrendsView.tsx` có sẵn một component tên `Card`;
  import primitive vào là nó che chính mình, và codemod còn đổi `<section>` bên trong
  thành `<Card>` — thành đệ quy.

## Cách đo contrast cho đúng

**1. Đừng bật class `.dark` bằng JS rồi đo ngay.** Chrome cập nhật `background-color`
nhưng **chưa** cập nhật biến CSS thừa kế trong cùng một task → ra số vô nghĩa. Phải **tải
trang thật** với `localStorage.theme = 'dark'`. Quét nhiều route thì tải một lần ở dark rồi
điều hướng bằng `history.pushState` + `PopStateEvent`.

**2. Gradient không nằm ở `background-color`.** `bg-gradient-*` đặt `background-image` →
hàm leo cây tìm nền bỏ qua nó và rơi về trắng, ra tỉ số 1,0 giả.

**3. Ngưỡng AA không phải luôn 4,5.** Chữ ≥24px, hoặc ≥18,66px mà bold, chỉ cần **3:1**.

**4. Đừng parse chuỗi màu, hãy vẽ ra pixel rồi đọc lại.** Tailwind v4 trả về
`oklab(0.637 0.214 0.101)`; bóc số bằng regex sẽ lấy `0.637, 0.214, 0.101` làm RGB, tức
gần như đen, và mọi tỉ số ra ~20:1. Đúng cái đã xảy ra: bộ màu thang đo được báo 20,7:1
trong khi thật ra **2,89:1**.

```js
ctx.fillStyle = nenThat      // tô nền trước — bắt buộc nếu màu có alpha (vd /70)
ctx.fillRect(0, 0, 1, 1)
ctx.fillStyle = mauCanDo
ctx.fillRect(0, 0, 1, 1)
const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data  // màu THẬT, đã composite
```

Alpha là phần thứ hai của bẫy: `bg-red-500/70` trên gray-900 chỉ còn 2,76:1 chứ không phải
4,66:1 của red-500 đặc. Và **bỏ emoji khỏi phép đo** — emoji tự mang màu.

**Đo hoạt ảnh trong khung xem trước thì cẩn thận:** tab bị ẩn (`document.hidden`) đóng băng
đồng hồ hoạt ảnh — `transition` đứng ở giá trị đầu và `ResizeObserver` không nổ. Đo LAYOUT
thì tắt transition trước (`style.transitionProperty = 'none'`).

## Chế độ trình bày: quét theo class KHÔNG đủ

Lượt rà đầu quét `<p className="…fg-muted…">` và bỏ sót ba loại, chỉ bản CHẠY THẬT mới lộ:

1. **Chữ dạy nằm trong hằng số** — `HINT`, `note`, `SORT_HINT`. Không phải JSX.
2. **Câu số dài đáng NÉN, không phải ẩn** — giữ cả ba con số, bỏ mệnh đề giải thích.
3. **Câu lặp nhiều lần trên một màn** — `NeedMore` hiện 5 lần, mệnh đề lặp y nguyên cả 5.

Cách đo đúng: chạy app, đi hết route, gom text node ≥25 ký tự rồi lọc lấy phần tử **lá**.
Kết quả đợt đó: **5.227 → 1.121 ký tự văn xuôi (−79%)** trên 12 route.

**Ẩn một phần tử có thể đổi layout.** Bỏ dòng giải nghĩa trong hàng `justify-between` thì
phần tử còn lại trượt về bên trái — đo được **819px**. Dùng `ml-auto` ở ô bên phải.

**Hai bẫy của "cột hồ sơ mới":**

- **Thiếu cột ≠ giá trị mặc định.** Cache hồ sơ persist 24h; một máy có thể giữ bản tải
  TRƯỚC migration. Coi `undefined` là `'visual'` thì `useDensitySync` **ghi đè lựa chọn
  của người dùng**. Dùng `densityFromProfile()`: không phải chuỗi → `null` = "hồ sơ chưa
  nói gì".
- **`staleTime: Infinity` giết đồng bộ giữa máy.** Đổi trên điện thoại thì laptop không
  bao giờ tải lại. Đã đổi sang **60 giây**.

## Ba lần suýt sai khi dọn nhãn ô nhập

1. **Quên `button` là labelable.** Lần quét đầu xếp 4 nhãn công tắc vào diện mồ côi; đổi
   sang `<div>` là **mất vùng chạm** đang chạy tốt.
2. **`aria-checked` đọc ngay sau `.click()` là sai.** React chưa render lại → kết luận
   "bấm vào chữ không có tác dụng" tuy thật ra có. Phải `await` một nhịp.
3. **Chú thích cũng chứa chữ `<label>`.** Phải che chú thích — nhưng che bằng khoảng trắng
   để **giữ số dòng**.

**Nhãn không phải cái duy nhất thiếu.** Sau khi dọn hết 71 nhãn, chạy thuật toán tính
accessible name trên 19 route của app đang chạy thì còn **9 ô không có tên nào** — chỉ có
`placeholder` (mà placeholder mất ngay khi bắt đầu gõ). Trong đó có **ô số tiền chính của
form Nhập** ở desktop. Cách quét: `el.labels`, `aria-label`, `aria-labelledby`; **không**
tính `placeholder`. Chạy trên app thật, không đọc nguồn.

---

# Chưa làm

- **Trạng thái rỗng dùng gray-300** (`TransactionForm` `¥0`, `MonthlyView` tháng trống) —
  1,47:1 ở light. Đây là **de-emphasize cố ý**: tháng trống gần như biến mất khỏi bảng để
  mắt quét nhanh. Sửa cho đạt AA sẽ đổi cách đọc bảng → quyết định thẩm mỹ, không phải dọn dẹp.
- **Toán tử NumPad**: green-700 trên gray-100 = **4,49:1**, thiếu 0,01. Trong sai số làm tròn.
- **Hex Tailwind v3 còn ở 10 file biểu đồ** (`#16a34a`/`#ef4444`). Không sai contrast,
  nhưng lạc thời so với palette v4. Có trần trong guardrail để không phình tiếp.
- **14 chỗ `rounded` trần (4px).** Đo lại 2026-08-25: **không chỗ nào là control** — 12 chỗ
  là huy hiệu `<span>` và ô màu chú giải (4px ở đó là đúng), một `<kbd>` gợi ý phím tắt,
  và một `<Link>` mà luật cố ý không đếm. Tức món này **đã xong**; giữ dòng ở đây để lần
  sau ai đếm ra 14 thì biết là đã xét rồi.

> Hai món từng nằm ở đây đã hết: *35 chỗ `text-green-700 dark:text-green-400` cần tách
> nghĩa* → nay **0**, đã thành ban cứng; *`ActionButton` mới áp vào vài chỗ* → nay 33 nút
> chính đã qua primitive.
- **Đóng sheet 120ms.** 26 sheet đều tự dựng lớp phủ tại chỗ và tự gọi `onClose` từ vài
  chỗ bên trong. Hoạt ảnh đóng đòi phần tử sống thêm 120ms sau khi người dùng đã đóng →
  phải có primitive `<Sheet>` giữ quyền tháo lắp.
- **"Số cũ mờ đi" khi đổi kỳ.** Cần con số cũ còn trên màn trong lúc số mới đang tới, mà
  truy vấn theo kỳ không giữ dữ liệu kỳ trước. Đổi cách nạp dữ liệu là quyết định về DỮ
  LIỆU, không phải về chuyển động.
- **Tên ô chỉ được kiểm bằng tay.** Luật `<label>` mồ côi chặn ở mức nguồn, nhưng "ô không
  có nhãn nào cả" thì không — repo không có test render. Muốn tự động thì cần thêm jsdom,
  là quyết định về hạ tầng test.
