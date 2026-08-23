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
