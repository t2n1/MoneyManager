import type { MonthKey } from '../../lib/dates'

/** Tên file CSV theo kỳ, giữ quy ước cũ: so-chi-tieu-2026-07.csv | so-chi-tieu-2026.csv */
export function exportCsvFilename(
  period: 'month' | 'year',
  monthKey: MonthKey,
  year: number,
): string {
  const suffix =
    period === 'year'
      ? String(year)
      : `${monthKey.year}-${String(monthKey.month).padStart(2, '0')}`
  return `so-chi-tieu-${suffix}.csv`
}
