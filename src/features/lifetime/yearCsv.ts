// Xuất bảng năm ra CSV. Tiêu đề cột KHÔNG DẤU để Excel bản Nhật/Mỹ mở không lỗi font.
import { minorToPlain } from '../reports/csv'
import type { CurrencyCode } from '../../lib/currencies'
import type { YearRow } from './project'

// Hai cột cuối là hai BIÊN của dải, không phải hai nhánh lợi suất — nên "Bi quan" /
// "Lac quan" chứ không phải "Nhanh thap" / "Nhanh cao" (xem YearRow ở Task 3).
const HEADER = 'Nam,Tuoi,Noi o,Thu,Chi,Su kien,Tai san cuoi nam,Bi quan,Lac quan'

function cell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildYearCsv(rows: YearRow[], currency: CurrencyCode): string {
  const lines = [HEADER]
  for (const r of rows) {
    lines.push(
      [
        String(r.year),
        String(r.age),
        cell(r.country ?? r.phaseLabel),
        minorToPlain(r.incomeMinor, currency),
        minorToPlain(r.expenseMinor, currency),
        cell(r.events.map((e) => e.label).join('; ')),
        minorToPlain(r.assetsEndMinor, currency),
        minorToPlain(r.assetsPessimisticMinor, currency),
        minorToPlain(r.assetsOptimisticMinor, currency),
      ].join(','),
    )
  }
  return lines.join('\n')
}
