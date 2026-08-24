# Redesign "Sửa kịch bản" (drawer) — notes

Bản vẽ: Claude Design project `00ddb792`, `design_handoff_scenario_editor/`
(`README.md` + `Tuong Lai - Redesign.dc.html`, drawer ở `<aside role="dialog">` cuối
template, logic ở block `// ---- scenario editor drawer ----`).

## Bản vẽ dùng token LIGHT (khác memory "ban-ve-claude-design-dung-dung-token")
| hex bản vẽ | token |
|---|---|
| `#f2f3f5` | `--surface-page` |
| `#ffffff` | `--surface` |
| `#fbfbfc` | `--surface-chrome` |
| `#e8ebef` | `--surface-sunken` |
| `#eceef2` | `--border-subtle` |
| `#e2e5ea` | `--border-panel` |
| `#d1d5dc` | `--border-strong` (gray-300) |
| `#1a1d23` | `--fg-primary` |
| `#4a5565` | `--fg-secondary` (gray-600) |
| `#626a77` | `--fg-muted` |
| `#99a1af` | `--fg-disabled` (gray-400) |
| `#008236` | `--accent` (green-700) |
| `#016630` | `--money-in` (green-800) |
| `#007a33` | `--fg-accent` |
| `#c10007` | `--money-out` (red-700) |
| `#eefaf1` / `#c9ecd4` | `--state-good-bg` / `-border` |
| `#fdf6e9` / `#f2e3c2` / `#a16207` | `--state-warn-bg` / `-border` / `--fg-warn` |
| `#f7f8f9` (nền drawer) | KHÔNG có token — gần `--surface-page` |
| `#d7dbe0` / `#8b93a0` (nút disabled) | KHÔNG có token |
| `#c3c8d0` (icon tắt) | KHÔNG có token |

## Khoảng cách bản vẽ ↔ repo (phải quyết)
1. `ScenarioDraft` (draft.ts) CỐ Ý không mang `name`, `displayCurrency`,
   `startingAssetsMinor`, `isPrimary`, và không có `bandSpreadBps`. Drawer sửa hết →
   phải mở rộng draft + `planDraftSave` + `draftChanges`.
2. `planDraftSave` KHÔNG có `phaseDeletes`. Drawer xoá được chặng → phải thêm.
3. `birth_year` nằm ở `profile`, không thuộc kịch bản. Drawer sửa nó ở Nâng cao.
4. Đổi `display_currency` ở bản cũ kéo theo: quy đổi tài sản khởi điểm theo tỷ giá
   hôm nay (`assetsCurrency`/`assetsStale`/dòng amber) + RESET `fx_to_display = 1`
   cho mọi chặng/mốc khác tiền mới + `resetNotice`. Bản vẽ không nhắc gì.
5. Chặng/mốc trong DB có `currency`, `fx_to_display`, `note`, `country`, `inflate`.
   Hàng inline của bản vẽ chỉ có năm/tên/thu/chi (chặng) và loại/tên/từ/đến/tiền
   (mốc). Bỏ `PhaseFormSheet`/`EventFormSheet` = mất đường khai 5 trường đó.
6. Thanh trượt bản vẽ: lợi suất −2%…10% step .25; dải ±0…5% step .25. Ràng buộc DB
   rộng hơn (−5…20 / 0…10).
7. Select tiền của bản vẽ chỉ JPY/VND/USD.

## Đã làm (tầng thuần)
- `draft.ts`: `ScenarioDraft` nay mang `name`, `displayCurrency`, `startingAssetsMinor`,
  `bandSpreadBps`. Thêm `setDraftCurrency` (reset `fxToDisplay` mọi dòng lệch tiền),
  `patchDraftPhase`/`removeDraftPhase`/`addDraftPhase`/`addDraftEvent`.
  `planDraftSave` thêm `phaseDeletes` + patch `label/country/currency/fx_to_display`.
  `draftChanges` bỏ tham số `currentYear`, soi MỌI chặng, thêm 6 loại thay đổi.
- `saveDraft.ts`: chạy `phaseDeletes`; `saveDraftAsNewScenario` lấy tiền/tài sản/dải
  từ NHÁP thay vì từ `source`.
- `editorStrip.ts` + test (17): `yearDelta`, `moneyDelta`, `stripSpark`.
- `draftText.ts`: `describeChange`/`changeParts` — dùng chung DraftBanner + chân drawer.

## Quyết định
- User chọn: giữ `PhaseFormSheet`/`EventFormSheet` sau nút "⋯" mỗi dòng (2026-08-24).
  → hai sheet đó phải ghi vào NHÁP, không ghi thẳng DB (prop `onApply`/`onRemove`),
  nếu không thì "Bỏ thay đổi" hoàn tác được một nửa và `planDraftSave` ghi đè lại.
- Đổi tiền hiển thị: quy đổi tài sản khởi điểm NGAY lúc đổi bằng tỷ giá hôm nay;
  thiếu tỷ giá thì KHÔNG cho đổi (thay cho cơ chế `assetsStale` + dòng amber cũ).
- Thanh trượt lợi suất/dải: theo bản vẽ (−2…10% / 0…5%), nhưng nới biên nếu giá trị
  đã lưu nằm ngoài — không để kéo một lần là âm thầm kẹp mất số của người dùng.

## Đã làm (UI) — 2026-08-24
- `ScenarioEditorDrawer.tsx` MỚI thay `ScenarioEditorSheet.tsx` (đã xoá): drawer phải
  620px (`max-w-[38.75rem]`), 4 khối dọc, dải kết quả sống + sparkline hai đường,
  dải tỉ lệ chặng, thẻ chặng sửa inline, hàng mốc sửa inline, menu "⋮", chân sticky.
- `PhaseFormSheet` / `EventFormSheet` viết lại ở chế độ NHÁP (`onApply`/`onRemove`),
  bỏ hẳn repo/mutation và đường "Chọn mẫu" (mẫu nay chỉ vào qua `PresetPanel`).
- `PresetPanel` thêm `variant="inline"` để drawer dùng chung dải chip.
- `LifetimeView`: nút "Sửa kịch bản" vào hàng hành động; `EditorInitialSheet` →
  `focusEventId`; `handleCommit` trả `boolean` để drawer chỉ đóng khi lưu THÀNH CÔNG.

## Bốn lỗi bắt được khi chạy app thật (không phải từ test)
1. Sửa tiền/tỷ giá/quốc gia của chặng qua sheet "⋯" KHÔNG làm nháp dirty → nút Lưu tắt
   trên một thay đổi đã nằm trong nháp. `draftChanges` thiếu ba trường đó. Sửa + test.
   Cùng lớp: `sameEvent` thiếu `note`, và `planDraftSave` không ghi `note` của mốc.
2. Bấm "Lưu thay đổi" không đóng drawer (bản vẽ nói phải đóng).
3. Đổi tiền hiển thị xong, chân drawer in "tài sản khởi điểm 17k → 11k" và "cuối đời
   3M → 299M" — so số tính bằng yên với số tính bằng đô. Nay `startingAssets` mang CẢ
   HAI đơn vị, và mọi phép so theo TIỀN (delta cuối đời, đường xám sparkline, mẩu
   "cuối đời") tắt khi tiền hiển thị đổi; phép so theo NĂM vẫn giữ.
4. Ở 375px, sparkline 132px bóp ba ô số còn 55px (nhãn + số đều cụt). Nay ẩn dưới `sm`.

## Cố ý lệch bản vẽ
- Nút "⋯" thêm trên mỗi dòng chặng/mốc (bản vẽ không có) — user chốt 2026-08-24: giữ
  hai sheet cũ cho 5 trường mà hàng inline không chứa nổi.
- Thu/chi trong câu tóm tắt có KÈM tên chặng (`thu "Ở Nhật" 680万 → 320万`): bản vẽ ghi
  trần vì lúc vẽ chỉ chặng đang chạy vặn được, nay mọi chặng vặn được.
- Đổi tiền hiển thị mà thiếu tỷ giá thì CHẶN, không cho đổi (bản cũ cho đổi rồi treo
  dòng amber). Một trạng thái thay vì ba, và không có ca nào con số sai kịp lên màn.
- Xoá kịch bản vẫn có `confirmDialog` (bản vẽ ghi "nên có confirm ở app thật").
- Sparkline ẩn dưới `sm`; cỡ chữ 13px→`text-sm`, 17px→`text-lg` (bậc đã đặt tên);
  620px/132px/74px… quy về `rem` (designSystem.test.ts chặn px ≥ 16 cho bề rộng).
