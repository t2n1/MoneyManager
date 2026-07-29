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

`src/designSystem.test.ts`, chạy trong `npm test`. Hai loại luật:

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

## Cách đo contrast cho đúng

Ba cái bẫy đã làm mình đọc sai số, ghi lại để khỏi mất thời gian lần nữa:

**1. Đừng bật class `.dark` bằng JS rồi đo ngay.** Chrome cập nhật `background-color` nhưng **chưa** cập nhật biến CSS thừa kế trong cùng một task, nên ra những số vô nghĩa (gray-600 trên gray-800 = 1,94). Phải **tải trang thật** với `localStorage.theme = 'dark'`. Muốn quét nhiều route thì tải một lần ở dark rồi điều hướng bằng `history.pushState` + `PopStateEvent` — class giữ nguyên, DOM được style lại từ đầu.

**2. Gradient không nằm ở `background-color`.** `bg-gradient-to-br` đặt `background-image`, nên hàm leo cây tìm nền sẽ bỏ qua nó và rơi về trắng → ra tỉ số 1,0 giả. Phải đọc các chặng màu từ `backgroundImage` và tính với chặng **sáng nhất** (ca xấu nhất cho chữ trắng).

**3. Ngưỡng AA không phải luôn 4,5.** Chữ ≥24px, hoặc ≥18,66px mà bold, chỉ cần **3:1**. Bỏ qua điều này sẽ báo sai các con số lớn — ví dụ `≈ ¥1,973,890` ở 32px bold trên thẻ hero.

Ngoài ra: bỏ emoji khỏi phép đo. Emoji tự mang màu, `color` thừa kế của chúng vô nghĩa.

## Chưa làm

- **Trạng thái rỗng dùng gray-300** (`TransactionForm` `¥0`, `MonthlyView` tháng trống, `roleFields`) — 1,47:1 ở light, 2,35:1 ở dark. Đây là **de-emphasize cố ý**: tháng trống gần như biến mất khỏi bảng để mắt quét nhanh. Sửa cho đạt AA sẽ đổi cách đọc bảng → là quyết định thẩm mỹ, không phải dọn dẹp.
- **Toán tử NumPad**: green-700 trên nền gray-100 = **4,49:1**, thiếu 0,01. Nằm trong sai số làm tròn. Muốn sạch tuyệt đối thì dùng green-800 cho light.
- **29 chỗ `text-green-700 dark:text-green-400` cần tách nghĩa** thành `fg-accent` (link, hành động — đa số) hoặc `money-in` (giá trị tiền — vài chỗ). Việc **xét từng chỗ**, không quét máy móc được: link không phải thu nhập. Không gấp — 4,95:1 đã đạt AA.
- **Hex v3 còn ở 12+ file biểu đồ** (`#16a34a`/`#ef4444` trong `CategoryBreakdownCard` `PALETTE`, `SummaryView`, `AssetsPage`, `LifetimeChartCard`…). Không sai contrast, nhưng lạc thời so với palette v4.
- **Chưa có primitive `Button`.** `IconButton` chỉ lo nút icon; 94 chỗ `active:scale-95` còn lại phần lớn là nút CÓ CHỮ. Đây là primitive giá trị nhất còn thiếu.
- Đã áp primitive vào `LedgerPage`, `ReportsPage`, `AccountDetailPage`, `AssetsPage`, `AssetGroupsPage`. Các màn còn lại đã đổi sang token màu nhưng thẻ/nút vẫn viết tay — ngưỡng trong guardrail là số nợ còn lại.
