// Nhập giao dịch từ CSV sao kê (mục Y). Thuần, không phụ thuộc DOM → test được.
import type { CurrencyCode } from '../../lib/money'
import type { TransactionRow, TransactionType } from '../../types/database.types'

/** Bóc tách CSV thành mảng 2 chiều: hỗ trợ trường bọc nháy kép, phẩy & xuống dòng bên trong. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  // Bỏ BOM đầu file nếu có
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field)
      field = ''
      // Bỏ dòng trống hoàn toàn
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }
  return rows
}

export type DateOrder = 'ymd' | 'dmy' | 'mdy'

/** Chuỗi ngày → ISO 'YYYY-MM-DD' theo thứ tự đã chọn; null nếu không đọc được. */
export function parseDateToISO(input: string, order: DateOrder = 'ymd'): string | null {
  const parts = input.trim().match(/(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})/)
  if (!parts) return null
  let y: number, m: number, d: number
  const [, a, b, c] = parts.map((x) => x) as unknown as [string, string, string, string]
  const na = Number(a)
  const nb = Number(b)
  const nc = Number(c)
  if (order === 'ymd') {
    y = na
    m = nb
    d = nc
  } else if (order === 'dmy') {
    d = na
    m = nb
    y = nc
  } else {
    m = na
    d = nb
    y = nc
  }
  if (y < 100) y += 2000
  if (m < 1 || m > 12 || d < 1) return null
  // Ngày phải có thật trong tháng đó (chặn 30/02, 31/04…): new Date(y, m, 0) = ngày cuối tháng m.
  const lastDay = new Date(y, m, 0).getDate()
  if (d > lastDay) return null
  return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`
}

/** Chuỗi số tiền (có thể kèm ký hiệu, phân cách nghìn) → minor units theo currency; null nếu rỗng/sai. */
export function parseAmountToMinor(input: string, currency: CurrencyCode): number | null {
  const decimals = currency === 'USD' ? 2 : 0
  let s = input.trim().replace(/[^\d.,-]/g, '')
  if (s === '' || s === '-') return null
  const neg = s.startsWith('-')
  s = s.replace(/-/g, '')

  let intPart = s
  let fracPart = ''
  if (decimals > 0) {
    // Dấu thập phân = dấu '.' hoặc ',' cuối cùng NẾU theo sau là 1–2 chữ số;
    // ngược lại mọi dấu đều là phân cách nghìn.
    const m = s.match(/[.,](\d{1,2})$/)
    if (m) {
      const idx = s.length - m[0].length
      intPart = s.slice(0, idx)
      fracPart = m[1]
    }
  }
  intPart = intPart.replace(/[.,]/g, '')
  if (intPart === '' && fracPart === '') return null
  const major = Number(`${intPart || '0'}.${fracPart || '0'}`)
  if (Number.isNaN(major)) return null
  const minor = Math.round(major * 10 ** decimals)
  return neg ? -minor : minor
}

export interface ColumnMapping {
  date: number
  amount: number
  note: number
}

export interface ImportOptions {
  mapping: ColumnMapping
  dateOrder: DateOrder
  hasHeader: boolean
  /** true = số âm là chi tiêu, số dương là thu nhập. */
  negativeIsExpense: boolean
  currency: CurrencyCode
}

export interface ImportItem {
  occurred_on: string
  /** minor units, luôn dương (dấu quyết định type) */
  amount: number
  type: Extract<TransactionType, 'expense' | 'income'>
  note: string
  /** khóa chống trùng: ngày|amount có dấu|note */
  key: string
}

export interface ImportPreview {
  items: ImportItem[]
  /** số dòng bỏ qua vì lỗi (ngày/số tiền không đọc được) */
  errorCount: number
}

export interface TransferCandidate {
  /** khóa của dòng CSV bị nghi là chuyển khoản nội bộ */
  key: string
  /** giao dịch đã có trong app khớp với nó */
  matchedTxId: string
  matchedAccountId: string
  /** lệch bao nhiêu ngày giữa hai bên (0 = cùng ngày) */
  dayGap: number
}

export interface TransferDetectOptions {
  /** tài khoản đang nhập file sao kê */
  importingAccountId: string
  /** tài khoản có thể là đầu bên kia (phải CÙNG loại tiền để so số khớp) */
  candidateAccountIds: Set<string>
  /** cửa sổ ngày cho phép lệch (ngân hàng ghi nhận trễ) */
  windowDays?: number
}

const dayDiff = (a: string, b: string) =>
  Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000))

/**
 * Tìm những dòng trong file sao kê thực chất là CHUYỂN TIỀN GIỮA VÍ CỦA MÌNH
 * (trả thẻ, chuyển sang tài khoản tiết kiệm) chứ không phải chi tiêu thật.
 * Nhập nguyên xi những dòng này vào sẽ thổi phồng cả Chi lẫn Thu.
 *
 * Dấu hiệu: có sẵn một giao dịch NGƯỢC CHIỀU, CÙNG SỐ TIỀN, ở một tài khoản khác
 * cùng loại tiền, trong vòng `windowDays` ngày.
 *
 * Mỗi giao dịch đã có chỉ khớp tối đa một dòng CSV (ưu tiên lệch ngày ít nhất),
 * để hai lần chuyển giống hệt nhau không cùng khớp vào một giao dịch.
 */
export function detectInternalTransfers(
  items: ImportItem[],
  existing: TransactionRow[],
  opts: TransferDetectOptions,
): TransferCandidate[] {
  const windowDays = opts.windowDays ?? 3
  // Giao dịch ứng viên: nằm ở tài khoản KHÁC, cùng loại tiền, không phải chính
  // tài khoản đang nhập.
  const pool = existing.filter(
    (t) =>
      t.account_id !== opts.importingAccountId &&
      opts.candidateAccountIds.has(t.account_id) &&
      (t.type === 'expense' || t.type === 'income' || t.type === 'transfer'),
  )
  const used = new Set<string>()
  const out: TransferCandidate[] = []

  for (const item of items) {
    let best: { tx: TransactionRow; gap: number } | null = null
    for (const t of pool) {
      if (used.has(t.id)) continue
      if (t.amount !== item.amount) continue
      // Chi ở file ⇄ tiền vào ở nơi khác, và ngược lại. Chuyển khoản khớp cả hai chiều.
      const opposite =
        t.type === 'transfer' ||
        (item.type === 'expense' && t.type === 'income') ||
        (item.type === 'income' && t.type === 'expense')
      if (!opposite) continue
      const gap = dayDiff(item.occurred_on, t.occurred_on)
      if (gap > windowDays) continue
      if (!best || gap < best.gap) best = { tx: t, gap }
    }
    if (!best) continue
    used.add(best.tx.id)
    out.push({
      key: item.key,
      matchedTxId: best.tx.id,
      matchedAccountId: best.tx.account_id,
      dayGap: best.gap,
    })
  }
  return out
}

/** Dựng danh sách giao dịch chuẩn hóa từ các dòng CSV theo cấu hình ánh xạ. */
export function buildImportPreview(rows: string[][], opts: ImportOptions): ImportPreview {
  const dataRows = opts.hasHeader ? rows.slice(1) : rows
  const items: ImportItem[] = []
  let errorCount = 0
  for (const r of dataRows) {
    const iso = parseDateToISO(r[opts.mapping.date] ?? '', opts.dateOrder)
    const rawAmount = parseAmountToMinor(r[opts.mapping.amount] ?? '', opts.currency)
    if (!iso || rawAmount === null || rawAmount === 0) {
      errorCount++
      continue
    }
    const note = (r[opts.mapping.note] ?? '').trim()
    const isExpense = opts.negativeIsExpense ? rawAmount < 0 : rawAmount > 0
    const amount = Math.abs(rawAmount)
    const type = isExpense ? 'expense' : 'income'
    items.push({
      occurred_on: iso,
      amount,
      type,
      note,
      key: `${iso}|${isExpense ? '-' : '+'}${amount}|${note}`,
    })
  }
  return { items, errorCount }
}
