// Xuất giao dịch ra CSV (mục H). Thuần, không phụ thuộc DOM → test được.
// File luôn kèm BOM UTF-8 để Excel mở đúng dấu tiếng Việt; xuống dòng CRLF.
import { CURRENCIES, type CurrencyCode } from '../../lib/money'
import type { TransactionRow } from '../../types/database.types'

const TYPE_LABEL: Record<TransactionRow['type'], string> = {
  expense: 'Chi',
  income: 'Thu',
  transfer: 'Chuyển khoản',
}

/** minor units → chuỗi số thập phân dấu chấm (Excel hiểu là số): 1234 · 12.34 */
export function minorToPlain(minor: number, currency: CurrencyCode): string {
  const d = CURRENCIES[currency].decimals
  if (d === 0) return String(minor)
  const neg = minor < 0 ? '-' : ''
  const abs = Math.abs(minor).toString().padStart(d + 1, '0')
  return `${neg}${abs.slice(0, -d)}.${abs.slice(-d)}`
}

/** Bọc trong dấu nháy kép nếu chứa , " hoặc xuống dòng; nhân đôi dấu nháy bên trong.
 * Export ra ngoài để `features/lifetime/yearCsv.ts` dùng chung — hai module xuất CSV
 * trong repo phải theo đúng MỘT luật escape, không viết lại luật thứ hai rồi lệch dần. */
export function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export interface CsvLookups {
  categoryName: (id: string | null) => string
  accountName: (id: string | null) => string
  currencyOf: (id: string) => CurrencyCode
}

const HEADER = [
  'Ngày',
  'Loại',
  'Danh mục',
  'Tài khoản',
  'Tài khoản đích',
  'Số tiền',
  'Loại tiền',
  'Số tiền đích',
  'Loại tiền đích',
  'Ghi chú',
]

/** Dựng nội dung CSV từ danh sách giao dịch (giữ nguyên thứ tự đầu vào). */
export function buildTransactionsCsv(txs: TransactionRow[], lk: CsvLookups): string {
  const rows = txs.map((t) => {
    const cur = lk.currencyOf(t.account_id)
    const toCur = t.to_account_id ? lk.currencyOf(t.to_account_id) : null
    const cells = [
      t.occurred_on,
      TYPE_LABEL[t.type],
      lk.categoryName(t.category_id),
      lk.accountName(t.account_id),
      t.to_account_id ? lk.accountName(t.to_account_id) : '',
      minorToPlain(t.amount, cur),
      cur,
      t.to_amount != null && toCur ? minorToPlain(t.to_amount, toCur) : '',
      toCur ?? '',
      t.note ?? '',
    ]
    return cells.map((c) => escapeCsv(String(c))).join(',')
  })
  return '﻿' + [HEADER.join(','), ...rows].join('\r\n')
}
