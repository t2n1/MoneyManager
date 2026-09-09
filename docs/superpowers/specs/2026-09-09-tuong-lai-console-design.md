# Trang Tương lai — console dòng thời gian (bản vẽ 1c)

Ngày: 2026-09-09 · Nguồn: Claude Design project `c2780ed5`, file
`Tuong lai - 1c dong thoi gian.dc.html` + README handoff (30KB).

## 1. Quyết định đã chốt

| | |
|---|---|
| Hướng | **C** — làm lại trang Tương lai TỪ ĐẦU thành console toàn màn |
| Thiết bị | **Chỉ máy tính.** Từ 1280px; dưới ngưỡng đó hiện lời nhắn mở bằng máy tính |
| Mô hình mốc | **Giữ mô hình của app**, KHÔNG port `EVTYPES` của bản vẽ (§6) |
| Phần 1–4 của design | Theo bản vẽ |

User đã chốt cả ba mục trên trong hội thoại 2026-09-09. Mục "chỉ máy tính" đồng nghĩa
**bỏ đường vào Tương lai trên điện thoại** — user biết và chấp nhận.

## 2. Vì sao "từ đầu" là khả thi

Feature `src/features/lifetime/` có 18.524 dòng, nhưng **tầng toán thuần không bị đụng**:
`project.ts`, `eventAmount.ts`, `bigExpenses.ts`, `insights.ts`, `amortization`,
`phasePercent.ts`, `homeAsset.ts`, `traSo*.ts`, `summary.ts`, `stress`, `presets.ts` và
toàn bộ `*.test.ts` của chúng giữ nguyên. Chỉ tầng UI được dựng lại.

**RÀNG BUỘC CỨNG:** `src/features/notifications/rules/lifetimeRules.ts:4-5` import
`projectLifetime`, `phaseForYear`, `YearRow` từ `lifetime/project` và `firstNegativeYear`
từ `lifetime/insights`. Đổi chữ ký của bốn thứ này thì **bắt buộc** `npm run bundle:rules`
+ commit `supabase/functions/push-notify/_rules.js` (CLAUDE.md; guard
`tests/pushBundle.test.ts`). Kế hoạch này KHÔNG đổi chúng — nếu phát sinh, dừng lại và
chạy bundle.

## 3. Blast radius (đã đo)

`impact` báo 0 caller. Đã index lại sạch (`analyze --repair-fts` rồi `analyze`; 10.580
node / 25.422 edge) và **vẫn 0**, vẫn `epistemic: lower-bound`. Lý do là thật, không phải
index cũ: `AssetsPage.tsx:23` với tới nó qua
`lazy(() => import('../lifetime/LifetimeView').then((m) => m.LifetimeView))` — import động
+ đọc thuộc tính trong callback, đúng loại tham chiếu GitNexus không ghi thành edge.
**Cả app lazy-load gần hết các trang, nên `impact` sẽ luôn báo 0 cho mọi trang.** Số dùng
được lấy bằng text search:

- **Consumer thật duy nhất:** `src/features/assets/AssetsPage.tsx:23` — lazy import
  `LifetimeView`, render ở `:232`.
- `src/backLink.test.ts:28` — tập `NOT_NAVIGATION` có
  `'features/lifetime/EventFormSheet.tsx'`; xoá file thì phải xoá dòng này.
- Mọi hit còn lại (`FilterChip.tsx:53`, `KpiRow.tsx:97`, `SpendVsBudgetCard.tsx:12`,
  `money.ts:146`, `EditTransactionSheet.tsx:79`, `lifetimeRules.ts:111`) là **chú thích
  tham chiếu tiền lệ**, không phải import — sửa chữ trong comment nếu tên file đổi.

## 4. Chỗ ở & đường vào

- Route mới `/tuong-lai` (top-level, trong `AppLayout` nên rail có sẵn).
- `NAV_ITEMS` (`src/components/navItems.ts:41-50`) thêm
  `{ to: '/tuong-lai', label: 'Tương lai', Icon: Milestone, onMobile: false }`
  (`Milestone` của lucide — chưa dùng ở rail, và khớp đúng chữ "mốc cuộc đời").
  Cờ `onMobile: false` **chính là** cách app diễn đạt "chỉ máy tính": hiện trên rail
  desktop (`hidden lg:flex`), không hiện ở `BottomNav`.
- `/assets?view=future` và `/lifetime` → redirect sang `/tuong-lai` (lối đã dùng cho
  `/transactions` → `/so`). Giữ redirect để link cũ và ghi chú cũ không chết.
- `AssetsPage` bỏ tab con "Tương lai" (còn 2 tab con).
- Cập nhật `docs/information-architecture.md` §2.3 (đang ghi Tương lai là tab con thứ 3).

## 5. Khung màn hình

Rail (có sẵn, dáng thu gọn `w-14` = 3,5rem) · vùng vẽ **giãn** · dock **24,5rem cố định**.

Dock giữ bề rộng cố định kể cả khi không chọn gì — bản vẽ nói rõ đây là quyết định có chủ
đích để đồ thị không co giãn mỗi lần chọn/bỏ chọn. Không "tối ưu" mất.

**KHÔNG dựng khung cứng 1920×1080.** Repo bắt buộc `rem` (Cài đặt → Cỡ chữ phóng theo
`font-size` của `<html>`; test chặn px ≥ 16). Ở đúng 1920 layout trông y bản vẽ; ở 1280 và
2560 nó vẫn dùng được.

Quy đổi hình học từ bản vẽ:

| Bản vẽ | Dùng |
|---|---|
| DOCK 392px | `24.5rem` |
| chiều cao vùng vẽ 560px | `35rem` |
| lề trái vùng vẽ 52px | `3.25rem` |
| khối chặng 46px | `2.875rem` |
| icon mốc 24px / chốt 18px | `1.5rem` / `1.125rem` |
| khoảng cách hàng icon 26px | `1.625rem` |
| ngưỡng phân biệt bấm/kéo 6px | **giữ px** — đây là khoảng cách con trỏ, không phải cỡ layout |

Dọc: khối trên (dải thống kê + đồ thị + hàng chặng) vừa một màn; phần dưới (vặn nhanh,
stress, bảng theo năm / bản đồ) cuộn.

## 6. Mô hình mốc — chỗ cố tình lệch bản vẽ

README dặn "port `EVTYPES` nguyên văn". **Không làm.** Hai bên mô hình khác hẳn và app
đúng hơn:

| | Bản vẽ | App (`LifeEventRow`, `database.types.ts:756-815`) |
|---|---|---|
| Cách mô hình | 8 loại đóng, tham số riêng từng loại | một hình chung, các núm ghép lại |
| `type` nằm ở đâu | trong `eventFlow` lúc TÍNH → load-bearing mãi mãi | chỉ ở lúc nhập |
| Mua nhà | `price`·`downPct`·`ratePct`·`termYears`·`taxPct`·`sellYear`·`sellPct` | `asset_value_minor` + `loan_minor` + `asset_change_bps` (0068) |
| Dòng tiền biến thiên | mỗi loại tự lo | `amount_shape` per_year/total/ramp/growth + `growth_bps` + `repeat_every_years` (0066) |
| Chống đếm hai lần | **KHÔNG CÓ** | `replaces_minor` / `replaces_label` (0067) |
| Tắt tạm | không | `enabled` (0063) |

Bản vẽ thiếu `replaces` nên mốc "Mua nhà" của nó **đếm hai lần tiền thuê nhà** — đúng lỗi
app đã chữa ở 0067. Chuyển sang mô hình bản vẽ = bỏ 0067 + 0068 + một loạt migration.

`presets.ts:1-23` đã ghi triết lý đối lập, có lý do: *"Mẫu chỉ là TIỆN TAY LÚC NHẬP…
engine không biết dòng nào từ mẫu mà ra. Nên không có đường nào để mẫu làm sai kết quả một
cách âm thầm."*

**Cách dựng hàng "Loại mốc" của bản vẽ:** nó là **bộ mẫu**, không phải một cột `type`.
`presets.ts` có 6 mẫu (`cuoi`, `sinh-con`, `mua-nha`, `nghi-huu`, `chuyen-nuoc`,
`ho-tro-bo-me`); thêm `mua-xe`, `du-lich`, `hoc-them` cho đủ ý bản vẽ. Mọi số mặc định
theo đúng quy ước sẵn có của file: hậu tố `_JPY`/`_VND` trên tên hằng, ép cứng `currency`,
kèm nguồn + ngày tra, UI dán nhãn "số mặc định, kiểm tra lại".

**Hệ quả nhìn thấy được:** lưới trường trong dock KHÔNG khớp pixel theo từng loại như bản
vẽ, vì tên và số ô khác. User đã đồng ý.

## 7. Migration cần thiết — 0069

`LifePhaseRow` (`database.types.ts:733-754`) **không có `color`, không có `icon`**. Khối
chặng của bản vẽ cần cả hai.

- Migration `0069_life_phases_color_icon.sql`: thêm `color text not null default ''`,
  `icon text not null default ''`.
- **Cùng commit** sửa `src/types/database.types.ts` (viết tay, không codegen — CLAUDE.md).
- **Cùng commit** cả hai bản `Repo`: `supabaseRepo` và `demoRepo` (thiếu một bên là lỗi
  biên dịch, nhưng đừng để phát hiện muộn).
- `''` = tô theo thứ tự chặng như hiện nay → dữ liệu cũ hiển thị y cũ.

## 8. Màu

Thang dark của bản vẽ **trùng khít** `src/index.css` — dịch bằng tên token, không chọn sắc
độ mới:

| Bản vẽ | Token |
|---|---|
| `#0b0d0c` | `--surface-page` |
| `#0e110f` | `--surface-chrome` |
| `#121613` | `--surface` |
| `#1a201c` | `--surface-sunken` |
| `#1b211d` | `--border-subtle` |
| `#232a25` | `--border-panel` |
| `#2e372f` | `--border-strong` |
| `#eef2ec` / `#cdd5cc` / `#9aa69b` | `--fg-primary` / `--fg-secondary` / `--fg-muted` |
| `#46d97e` / `#5ce08a` | `--accent` / `--accent-hover` (= `--fg-accent`, `--money-in`) |
| `#ff7a76` | `--money-out` |
| `#ffc84d` | `--fg-warn` |

**Bốn sắc chưa có tên** — `#151a16` (hover hàng bảng), `#171d18` (kẻ hàng / nền thanh tỉ
lệ), `#1b2a20` (hàng trùng năm đang hover), `#39423a` (viền mờ). Đặt tên trong
`src/index.css` TRƯỚC KHI DÙNG, **kèm bản light tương ứng** — chêm hex vào JSX là đúng cái
guardrail cấm.

**Hai dải màu EVCOLORS (10) / PHCOLORS (6):** không dựng được nguyên bản. `color` trong DB
là **khoá** vào bảng 7 màu dùng chung toàn app (`src/features/tags/colors.ts`: gray, red,
amber, green, sky, indigo, pink) — mở rộng bảng này là đụng tag + danh mục toàn app.

Giữ đúng *ý* của bản vẽ ("hai dải phải khác nhau rõ rệt — đó là cách người dùng phân biệt
chặng với mốc chỉ bằng mắt") bằng **hai cách TÔ từ cùng 7 khoá**: mốc tô tươi, chặng tô
trầm/nhạt. Không đổi dữ liệu, không đụng feature khác.

## 9. Chữ

| Bản vẽ | Dùng |
|---|---|
| 10px | `text-3xs` (sàn dưới) |
| 11px | `text-2xs` |
| 12px | `text-xs` |
| **13px** | **`text-sm`** — xem cảnh báo dưới |
| 14px | `text-sm` |
| 15–17px | `text-base` / `text-lg` |
| 16px (tiêu đề drawer) | `text-base` |

**Cấm `text-[0.8125rem]`.** 13px không có bậc tên; chính giá trị này từng mọc lên 91 chỗ ở
28 file. Snap về `text-sm`. Nếu thật sự cần một bậc 13px thì đặt tên ở `src/index.css`
trước, không chêm giá trị tuỳ ý.

Font: `Be Vietnam Pro` (chữ) + `JetBrains Mono` (số) — đã có trong app. Mọi số tiền, năm,
tuổi, % đi qua `<Money>` (tiền) hoặc `<Num>` (đếm/%/số năm).

## 10. Thành phần

**Mới**
| File | Việc |
|---|---|
| `TuongLaiPage.tsx` | vỏ trang: cổng ≥1280px, cổng năm sinh, khung 3 vùng |
| `PlanDock.tsx` | cột phải 24,5rem, 3 trạng thái: tóm tắt / chặng / mốc |
| `PlanDockPhase.tsx` · `PlanDockEvent.tsx` | thân hai trạng thái sửa |
| `TimelinePlot.tsx` | SVG + mọi lớp phủ; nhãn trục là HTML phủ lên, KHÔNG `<text>` |
| `PhaseLane.tsx` | hàng khối chặng 2,875rem, kéo được, 2 mép |
| `EventPins.tsx` | icon mốc trên đường + chốt kết thúc + xếp hàng chống va chạm |
| `QuickAddBoard.tsx` | bảng chọn nhanh khi bấm/kéo nền đồ thị |
| `PlanListDrawer.tsx` | phiếu trượt "danh sách đầy đủ" |
| `quickAddRange.ts` | **thuần** — khoảng năm đã chọn → tham số mẫu |
| `undoStack.ts` | **thuần** — chụp/hoàn tác một bậc cho việc xoá |

Hai thứ tôi tưởng phải viết mới, kiểm ra thì KHÁC:

- **Xếp hàng chống va chạm đã có** — `chartGeom.ts:145 packRows(items, gap)`. Dùng lại,
  không viết `pinLayout.ts`. Chỉ cần bơm bề rộng theo công thức bản vẽ
  `max(52, xs(endYear) − xs(startYear) + 42)`.
- **Đường cong thì CHƯA có** — `chartGeom.ts:160 linePath` là đường GẤP KHÚC (toàn `L`).
  Bản vẽ đòi Catmull-Rom → cubic Bézier có chặn vượt biên. Thêm `curvePath()` vào
  `chartGeom.ts` (hàm thuần, test được).

**Dùng lại, không đụng:** `project.ts`, `eventAmount.ts`, `bigExpenses.ts`, `insights.ts`,
`phasePercent.ts`, `homeAsset.ts`, `traSo*.ts`, `summary.ts`, `presets.ts`, `draft.ts`,
`chartGeom.ts`, `chartSeries.ts`, `fxModel.ts`, `useLifetime.ts`, `eventIcons.tsx`.

**Đổi chỗ ở:** `YearTableView`, `BigExpenseMapSection`, `StressPanel`, `InsightCards`,
`CompareStrip`, `DraftBanner`, `TraSoSheet` (thành sheet lồng, mở từ dock).

**Nghỉ:** `LifetimeView.tsx`, `LifetimeChartCard.tsx`, `ScenarioWorkbench.tsx`,
`EventFormSheet.tsx`, `PhaseFormSheet.tsx`, `PresetPanel.tsx`.

Chú ý đọc kỹ: **`PresetPanel.tsx` (giao diện) nghỉ, `presets.ts` (dữ liệu mẫu) THÌ Ở LẠI**
và còn được thêm mẫu (§6). Bảng chọn nhanh mới đọc cùng `presets.ts` đó.

## 11. Tương tác

Bấm icon mốc → dock mốc · kéo icon → dời năm bắt đầu (nam châm ±1 năm vào ranh giới chặng)
· kéo chốt → đổi năm kết thúc · bấm khối chặng → dock chặng · kéo giữa → dời cả chặng · kéo
mép → dài/ngắn (mép phải dời `startYear` của chặng KẾ TIẾP) · bấm nền → thêm mốc ở năm đó ·
kéo ngang nền → chọn khoảng rồi mở bảng mẫu · rê chuột → vạch dọc + chấm + chip đọc số, nối
hai chiều với bảng theo năm.

Bàn phím: `Esc` đóng · `Delete`/`Backspace` xoá (có hoàn tác) · `⌘Z`/`Ctrl+Z` hoàn tác ·
`←`/`→` dời 1 năm · `Tab` qua mọi chip/nút. Không bắt phím khi con trỏ trong `input`/
`textarea`/contenteditable — trừ `⌘Z`.

Hoàn tác: **chỉ cho việc xoá**, toast 9 giây ở đáy đồ thị. App hiện không có hoàn tác nào.

Kéo: `stopPropagation` ở mép (không thì khối ngoài giành mất) + `setPointerCapture` (kéo ra
ngoài không rớt) + tắt transition lúc kéo. Throttle `hover` và kéo chọn vùng bằng
`requestAnimationFrame`.

`prefers-reduced-motion: reduce` → tắt toàn bộ transition/animation.

## 12. Giữ nguyên bản nháp và lưu

Bản nháp là ý chính của màn hiện tại và **giữ**: vặn tới đâu đồ thị đổi tới đó, không gì
ghi vào Supabase cho tới khi bấm Lưu (`draft.ts`, `saveDraft.ts`). Bản vẽ không có persist
("Chưa có lưu trữ bền" — README tự ghi là hạn chế của prototype), nên đây là chỗ app đi
trước bản vẽ, không phải chỗ thiếu.

## 13. Không được để mất

README dặn: mock là ảnh chụp, không phải lệnh bỏ tính năng thật.

Tra hộ · đối chiếu chi tiêu thật (`realityCheck.ts`) · lịch sử kết luận
(`verdictHistory.ts`, `useLifetimeVerdictSnapshots`) · mua nhà sinh tài sản + khoản nợ
(0068) · chặng khai bằng % chặng trước (0067) · mốc tắt tạm (0063) · `amount_shape` (0066)
· thử nghỉ hưu (`tryRetire.ts`) · so sánh kịch bản · tỷ giá theo từng dòng + cờ
`hasMissingRate` (thiếu rate thì LOẠI RA, hiện `≈`, không quy 1:1).

## 14. Guardrail phải tôn trọng

- `<PageHeader>` / `<SectionTitle>` / `<Select>` / `<ActionButton>` — không tự viết `<h1>`,
  `<h2>`, `<select>`, nút nền xanh.
- Bán kính panel trên `<button>` bị ban cứng → bản vẽ vẽ nút bo 6–8px thì dùng
  `rounded-full`; ô nhập vẫn `rounded-md`.
- **Không tự chế focus style** (`tests/designSystem.test.ts:683`) — bản vẽ ghi
  `outline: 2px solid #46d97e` nhưng ring toàn cục đã lo.
- **Chữ trong đồ thị dùng token, không hex** (`:764`).
- Không chêm giá trị tuỳ ý: màu, cỡ chữ, bán kính, giãn chữ, thời lượng đều đã có tên.
- Đọc `docs/design-system.md` Phần I trước khi dựng màn.

## 15. Cách kiểm

**Đơn vị (thuần, TDD):** `pinLayout.ts` (xếp hàng, mốc ngoài khung nhìn bị loại),
`quickAddRange.ts` (khoảng → `termYears`/`untilAge`/`startYear`–`endYear`), `undoStack.ts`.
Mẫu mới trong `presets.ts` nối vào `presets.test.ts` đã có.

**Guardrail:** `npm test` (bao gồm `designSystem.test.ts`, `pushBundle.test.ts`,
`mcpBundle.test.ts`) và `tsc -b` — **không** `tsc --noEmit`, lệnh đó xanh giả ở repo này.

**Phải mở app xem — `npm test` không thấy ba thứ này:**
1. Chế độ **Sáng** (mặc định phiên xem là Tối).
2. Cỡ chữ **1,25×**.
3. Biểu thức JSX bị biến thành chuỗi (`title="{e.label}"`) — hợp kiểu nên tsc xanh.
   Sau mỗi đợt sửa hàng loạt: `grep -rn '="{[^"]*}"' src/`.

Render kiểm ở **1280 / 1920 / 2560** bằng `preview_start so-chi-tieu-demo`. Bản demo mặc
định KHÔNG có dữ liệu Lifetime — phải vá `localStorage['sct-demo-db-v18']` đủ **bốn** thứ
(`profile.birth_year`, một `lifeScenarios` `is_primary`, **ít nhất một** `lifePhases`,
rồi `lifeEvents`), xong `localStorage.removeItem('sct-query-cache')` + reload.

## 16. Không làm (nêu rõ để không nhầm là thiếu sót)

- **Điện thoại và tablet < 1280px**: chỉ lời nhắn. Bản chỉ-đọc cho điện thoại (xem đồ thị
  + kết luận, không sửa) là việc riêng, làm sau nếu user muốn.
  Hệ quả phải nói rõ: điện thoại mở link cũ `/assets?view=future` sẽ bị redirect sang
  `/tuong-lai` rồi gặp đúng lời nhắn đó — tức **màn Tương lai trên điện thoại biến mất**,
  không phải hỏng. Đây là lựa chọn đã chốt ở §1, không phải sót.
- **Rail trái của bản vẽ**: không dựng mới. Rail của app (`AppRail.tsx`) đã là đúng thứ đó
  ở dáng thu gọn; các mục khác trong rail bản vẽ là đồ giả của prototype.
- **Khung cứng 1920×1080**: không dựng (§5).
- **`EVTYPES` 8 loại đóng**: không port (§6).
- **Mở rộng bảng 7 màu**: không (§8).
- Thuế thu nhập và lương hưu nhà nước: bản vẽ cũng chưa có; ngoài phạm vi lần này.
- Xuất ảnh đồ thị / CSV bảng theo năm: ngoài phạm vi.
- Hoàn tác cho việc *sửa* và *kéo*: chỉ xoá có hoàn tác, đúng như bản vẽ.
