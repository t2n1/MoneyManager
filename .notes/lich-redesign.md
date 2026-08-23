# Redesign tab Lịch (gói `design_handoff_so_lich`, phương án 1a "Nhịp tháng")

Gói: `~/Downloads/Redesign trang Lịch.zip` → `design_handoff_so_lich/`
Bản giải nén đang ở scratchpad của session.

## Nguồn dữ liệu đã tra được (không cần dựng phép tính mới)

| Cần gì | Dùng cái có sẵn |
|---|---|
| thu/chi theo ngày + mức nhiệt | `monthHeatmap` (`ledgerHeat.ts`) — đã có `level`, `future`, `netIn` |
| "Còn được tiêu / ngày" | `useBudgetReport` + `useMonthPace` + `useCommitments` + `dailyAllowance` + `spendableRemaining` (đúng chuỗi BudgetView 274-300) |
| chip cam kết + khối "Sắp tới" | `useCommitments(monthKey)` → `CommitmentReport.items` (có `dueISO`, `kind`, `amount`, `unknownAmount`), `classifyCommitments` |
| trần nhãn | `useTagBudgets(monthKey)` + khuôn `TagBudgetsCard` |
| chấm/chip nhãn | `tagsByTransaction` (đã dựng ở `LedgerPage`), `TAG_HEX`, `TAG_CHIP_CLASS`, `tagColor` |
| ngày lương | `detectPaydays(txs, currencyOf, base, rates)` (`features/reports/behavior.ts`) — suy từ thu lớn, không cần khai báo |
| thẻ tới hạn | `useAccountBalances()` lọc `type==='card'` → `useCardStatements(cards, todayISO)` → `.dueISO` + `.billed` |

## Quyết định

- Cột phụ tab Lịch KHÔNG dùng lại `LedgerAside` (lưới nhiệt + top danh mục + bộ lọc là của
  tab Ngày). Dựng `CalendarAside.tsx` riêng, cùng khuôn `Card elevation="panel" padding="panel"`.
- Phép tính thuần tách ra `calendarMonth.ts` (ô ngày, tuần, cam kết theo ngày) + test.
- `tagFilter` là state cục bộ của `CalendarView`, không đi vào `LedgerFilter`.

## Đã dựng (2026-08-24) — 3103/3103 test xanh, build sạch

**File mới**
- `src/features/transactions/calendarMonth.ts` (+ 32 test) — phép tính thuần: ô ngày,
  vạch nhiệt, dấu cam kết, cột Tuần, nhịp 7 ngày.
- `src/features/transactions/useCalendarMarks.ts` — gộp 3 nguồn dấu (cam kết / thẻ / lương).
- `src/features/transactions/CalendarPanels.tsx` — 4 khối, MỘT bản dùng cho cả hai cỡ màn.
- `src/features/tags/TagBudgetLines.tsx` — tách từ `TagBudgetsCard` để hai màn dùng chung.

**File sửa**: `CalendarView.tsx` (dựng lại), `LedgerPage.tsx` (hàng tab + tổng kỳ, truyền
`heat`/`tags`/`tagLinks`/`transferIds`), `ledgerHeat.ts` (+`netExpense`),
`dailyAllowance.ts` (+`spendableSegments`), `TagBudgetsCard.tsx`, `designSystem.test.ts`
(PROSE_MAX 75→77, có ghi lý do).

## Bốn chỗ cố ý LỆCH bản vẽ (đo trên app đang chạy, không phải suy)

1. **`opacity-45` cho ngày bị lọc ra KHÔNG dùng được.** Preflight của Tailwind v4 đặt
   `opacity: 1` cho `button` ở layer `base`, và rule đó THẮNG `.opacity-45` ở layer
   `utilities` — đo trực tiếp: class có mặt, `getComputedStyle` vẫn trả 1. Ô ngày là
   `<button>`. Thay bằng RỖNG ô (bỏ số, chip, chấm, vạch; giữ số ngày ở nguyên độ tương
   phản) — cũng tránh luôn việc mờ 45% kéo `--fg-muted` xuống ~2,4:1.
2. **Đoạn "đã cam kết" của thanh dùng `STATUS_FILL.warn`, không `--state-warn-border`.**
   Token đó là màu VIỀN (light #f2e3c2 / dark #4e3d1e), trên track `--surface-sunken` chỉ
   ~1,6:1. Một đoạn thanh mang tin là đồ hoạ → WCAG 1.4.11 đòi 3:1.
3. **Dòng phụ cột Tuần 10px (`text-3xs`), không 9px** — 9px dưới sàn §C.2, và bảng token
   của chính gói này ghi 10px là sàn không ngoại lệ. Bỏ ▲/▼, dùng `signedPct`+`deltaTone`.
4. **Nút "+ Thêm giao dịch" KHÔNG mang ngày** (`/entry`, không `/entry?date=`). Cần thêm
   một prop cho `TransactionForm`, mà `impact` trả **CRITICAL** (10 symbol, 5 process:
   Nhập, tấm Sửa, Bản tin, Chi tiết danh mục, Chi tiết tài khoản). Thuộc gói ENTRY.

## Ba lỗi TỰ TÌM RA khi đọc màn thật (không phải từ bản vẽ)

- `report.totalSpent` chỉ tính mục ĐÃ ĐẶT HẠN MỨC → "đã chi ¥9.330" đứng cạnh "Chi
  ¥120.930" của hàng tab. Sửa nhãn thành **"đã chi trong trần"**.
- "nhịp 7 ngày qua" ban đầu tính trên MỌI danh mục → ¥12.990/ngày cạnh mức cho phép
  ¥7.333/ngày, hai phạm vi khác nhau. Chuyển sang `pace.budgetDaily`, ra ¥1.333/ngày.
- Chân khối "Sắp tới" từng in "Cam kết còn lại ¥0" ngay dưới một dòng thẻ ¥45.000. Tách
  thành hai dòng (`Cam kết còn lại` / `Thẻ tới hạn`), mỗi dòng chỉ hiện khi > 0.

## Luật quan trọng nhất của đợt này

**Kỳ thẻ tới hạn KHÔNG phải một khoản tiêu mới** — nó là chuyển khoản (thẻ → ngân hàng),
mỗi lần quẹt đã là một giao dịch chi từ lúc nó xảy ra. Nên `owedOf` (`calendarMonth.ts`)
chỉ cộng `recurring` + `planned`: thẻ có CHIP trong ô nhưng không vào vạch nhiệt, không
vào "+¥X lịch" của cột Tuần, không vào "đã cam kết" của thanh. Cộng vào là đếm hai lần và
làm số của màn Lịch lệch số của màn Ngân sách.

## Còn lại của gói redesign
`ENTRY_REDESIGN.md` (B22–B29) → `REPORTS_REDESIGN.md` (B14–B21) → `CLAUDE_CODE_TASKS.md`
(B1–B13). Xem [[goi-ban-giao-redesign]].
