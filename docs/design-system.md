# Design system

Ba tầng: **nguyên thuỷ** (palette Tailwind v4) → **ngữ nghĩa** (`src/index.css`) → **component** (`src/components/ui`).

Ràng buộc được kiểm tự động bằng `src/designSystem.test.ts` — không phải tài liệu để đọc rồi quên.

---

## Nguyên tắc: đặt tên cho cái đã có, đừng phát minh scale mới

Trước khi dựng tầng này, app đã có một hệ thống **ngầm và khá nhất quán**. Đo trên 92 file `.tsx`:

| Trục | Thực tế đang dùng | Kết luận |
|---|---|---|
| Bán kính | `rounded-lg` 278 · `rounded-xl` 130 · `rounded-full` 78 | 3 tầng rõ: control / thẻ / pill. `rounded-2xl` (31) và `rounded-md` (16) là lạc |
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

Dùng qua tiện ích Tailwind: `text-fg-muted`, `bg-surface`, `border-border-subtle`.

### Ba cái bẫy đã đo, đừng đạp lại

**1. Chiều màu ở dark mode bị đảo.** `text-gray-400 dark:text-gray-500` là **sai** — nền tối thì chữ phụ phải *sáng* hơn. Chiều đúng: `text-gray-500 dark:text-gray-400`. Đã dọn 64 chỗ.

**2. `fg-muted` không đủ khi nền là gray-100.** gray-500 đạt 4,84:1 trên trắng nhưng chỉ **4,39:1** trên `surface-sunken` → trượt AA. Nhãn nằm trên track phải dùng `fg-on-track`.

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

`src/designSystem.test.ts`, chạy trong `npm test`. Hai loại luật:

**Ban cứng — phải bằng 0.** Dành cho thứ đã dọn sạch; tái xuất hiện là hồi quy.

- `text-gray-400 dark:text-gray-500` (sai chiều)
- `text-green-600 dark:text-green-400`, `text-red-600 dark:text-red-400` (trượt AA)
- `text-[0.5625rem]` (dưới sàn đọc được)

**Ngưỡng — chỉ được giảm.** Idiom còn nhiều chỗ chưa gộp. Đặt về 0 ngay thì phải refactor 92 file trong một lần, mà repo **không có test UI nào** (54 file test đều là logic thuần, không có `@testing-library`). Ngưỡng cho phép gộp dần mà vẫn chặn thêm mới.

**Gộp bớt được chỗ nào thì hạ số trong file test xuống.** Để nguyên thì ngưỡng thành chỗ trú cho nợ kỹ thuật.

---

## Chưa làm

- **Nút chính `bg-green-600` + `text-white` = 3,22:1**, trượt AA. ~59 chỗ. Sửa là đổi diện mạo mọi nút chính → cần quyết định riêng.
- **`text-red-500` dùng cho số chi** ở `MonthlyView`, `CalendarView`, `ImportCsvPage`, `CategoryCompareBarsCard` (3,81:1) — thiếu cặp `dark:` nên phải xét từng chỗ.
- **Màu nét biểu đồ** (`CategoryBreakdownCard` `lineColor`, `PALETTE`) vẫn là hex cứng, chưa vào token. Chữ chú giải trỏ tới nét vẽ nên phải đổi cùng lúc, không thì lệch màu.
- Đã áp primitive vào `LedgerPage` + `ReportsPage`. 14 màn còn lại vẫn viết tay — ngưỡng trong guardrail chính là số nợ còn lại.
