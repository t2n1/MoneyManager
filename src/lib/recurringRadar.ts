// Radar khoản định kỳ (mục T): quét lịch sử tìm giao dịch lặp đều để gợi ý tạo
// quy tắc định kỳ. Thuần, không phụ thuộc React → test được.
import type { RecurringFrequency } from './recurring'
import type { TransactionRow } from '../types/database.types'

export interface RecurringSuggestion {
  /** khóa ổn định (type|account|category|amount) để React key + chống trùng */
  key: string
  type: 'expense' | 'income'
  account_id: string
  category_id: string | null
  amount: number
  note: string
  frequency: Extract<RecurringFrequency, 'weekly' | 'monthly'>
  occurrences: number
  lastDate: string
}

/** Chữ ký của một quy tắc/giao dịch để so khớp "đã có rule chưa". */
export function ruleKey(
  type: string,
  accountId: string,
  categoryId: string | null,
  amount: number,
): string {
  return `${type}|${accountId}|${categoryId ?? ''}|${amount}`
}

function median(sorted: number[]): number {
  const n = sorted.length
  if (n === 0) return 0
  const mid = Math.floor(n / 2)
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

/** Ghi chú xuất hiện nhiều nhất trong nhóm (rỗng nếu tất cả trống). */
function commonNote(notes: string[]): string {
  const count = new Map<string, number>()
  for (const n of notes) {
    const t = n.trim()
    if (t) count.set(t, (count.get(t) ?? 0) + 1)
  }
  let best = ''
  let bestN = 0
  for (const [n, c] of count) if (c > bestN) ((best = n), (bestN = c))
  return best
}

export interface RadarOptions {
  /** số lần tối thiểu để coi là định kỳ */
  minOccurrences?: number
  /** chỉ gợi ý nếu lần gần nhất trong vòng N ngày (khoản còn "sống") */
  activeWithinDays?: number
}

/**
 * Phát hiện các khoản lặp đều theo (loại + tài khoản + danh mục + số tiền).
 * Gom ≥ minOccurrences lần, khoảng cách trung vị ~tháng (25–35 ngày) hoặc ~tuần
 * (6–8 ngày). Bỏ qua nhóm đã có quy tắc (existingKeys) hoặc lần cuối quá cũ.
 */
export function detectRecurring(
  txs: TransactionRow[],
  existingKeys: Set<string>,
  todayISO: string,
  opts: RadarOptions = {},
): RecurringSuggestion[] {
  const minOccurrences = opts.minOccurrences ?? 3
  const activeWithinDays = opts.activeWithinDays ?? 45
  const groups = new Map<string, TransactionRow[]>()
  for (const t of txs) {
    if (t.type !== 'expense' && t.type !== 'income') continue
    if (t.is_debt_flow || t.exclude_from_stats || t.recurring_rule_id) continue
    const key = ruleKey(t.type, t.account_id, t.category_id, t.amount)
    const arr = groups.get(key) ?? []
    arr.push(t)
    groups.set(key, arr)
  }

  const out: RecurringSuggestion[] = []
  for (const [key, arr] of groups) {
    if (arr.length < minOccurrences || existingKeys.has(key)) continue
    const dates = arr.map((t) => t.occurred_on).sort()
    const lastDate = dates[dates.length - 1]
    if (daysBetween(lastDate, todayISO) > activeWithinDays) continue
    const gaps: number[] = []
    for (let i = 1; i < dates.length; i++) gaps.push(daysBetween(dates[i - 1], dates[i]))
    const med = median([...gaps].sort((a, b) => a - b))
    let frequency: 'weekly' | 'monthly' | null = null
    if (med >= 25 && med <= 35) frequency = 'monthly'
    else if (med >= 6 && med <= 8) frequency = 'weekly'
    if (!frequency) continue
    const first = arr[0]
    out.push({
      key,
      type: first.type as 'expense' | 'income',
      account_id: first.account_id,
      category_id: first.category_id,
      amount: first.amount,
      note: commonNote(arr.map((t) => t.note)),
      frequency,
      occurrences: arr.length,
      lastDate,
    })
  }
  // Nhiều lần lặp nhất lên trước
  out.sort((a, b) => b.occurrences - a.occurrences)
  return out
}
