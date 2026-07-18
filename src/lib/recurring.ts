// Giao dịch định kỳ — toán ngày thuần (không I/O), anchor là start_on.
// Chu kỳ dùng ngày dương lịch thuần, KHÔNG liên quan month_start_day.
// RecurringFrequency định nghĩa ở đây (database.types import lại) để lib này
// không phụ thuộc ngược vào types/database — cùng pattern CurrencyCode ở money.ts.

import { addDaysISO } from './dates'

export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly'

/** Phần lịch của một rule — subset của RecurringRuleRow, đủ cho toán ngày. */
export interface RuleSchedule {
  frequency: RecurringFrequency
  start_on: string
  end_on: string | null
  is_paused: boolean
  last_generated_on: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Số ngày của tháng (month: 1–12). */
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate()

/**
 * Kỳ đến hạn thứ n (0-based) tính từ anchor start_on.
 * monthly/yearly: giữ ngày của anchor, clamp về cuối tháng khi tháng ngắn hơn;
 * kỳ sau vẫn quay về ngày anchor (luôn tính từ anchor, không trôi dần).
 */
export function nthDueDate(startISO: string, frequency: RecurringFrequency, n: number): string {
  const [y, m, d] = startISO.split('-').map(Number)
  if (frequency === 'weekly') return addDaysISO(startISO, 7 * n)
  if (frequency === 'monthly') {
    const total = m - 1 + n
    const year = y + Math.floor(total / 12)
    const month = (total % 12) + 1
    return `${year}-${pad(month)}-${pad(Math.min(d, daysInMonth(year, month)))}`
  }
  const year = y + n
  return `${year}-${pad(m)}-${pad(Math.min(d, daysInMonth(year, m)))}`
}

/**
 * Các kỳ đến hạn CẦN SINH: sau last_generated_on (hoặc từ start_on nếu chưa
 * sinh lần nào), đến hết todayISO (inclusive), cắt tại end_on.
 * Rule tạm dừng → mảng rỗng.
 */
export function listDueDates(rule: RuleSchedule, todayISO: string): string[] {
  if (rule.is_paused) return []
  const out: string[] = []
  for (let n = 0; ; n++) {
    const due = nthDueDate(rule.start_on, rule.frequency, n)
    if (due > todayISO) break
    if (rule.end_on && due > rule.end_on) break
    if (rule.last_generated_on && due <= rule.last_generated_on) continue
    out.push(due)
  }
  return out
}

/** Kỳ tới sẽ sinh (cho UI danh sách rule); null = không còn kỳ nào (quá end_on). */
export function nextDueDate(rule: Omit<RuleSchedule, 'is_paused'>): string | null {
  for (let n = 0; ; n++) {
    const due = nthDueDate(rule.start_on, rule.frequency, n)
    if (rule.end_on && due > rule.end_on) return null
    if (rule.last_generated_on && due <= rule.last_generated_on) continue
    return due
  }
}

// --- Engine catch-up ---
// Types cấu trúc (không import data/repo hay database.types để tránh vòng
// import); Repo thật của app thỏa RecurringRepo về mặt cấu trúc.

/** Rule đầy đủ nội dung để sinh giao dịch (RecurringRuleRow thỏa type này). */
export interface RecurringRuleLike extends RuleSchedule {
  id: string
  type: 'expense' | 'income' | 'transfer'
  amount: number
  to_amount: number | null
  category_id: string | null
  account_id: string
  to_account_id: string | null
  note: string
}

/** Giao dịch 1 kỳ cần sinh (NewRecurringOccurrence của repo thỏa type này). */
export interface RecurringOccurrenceInput {
  type: 'expense' | 'income' | 'transfer'
  amount: number
  to_amount: number | null
  category_id: string | null
  account_id: string
  to_account_id: string | null
  occurred_on: string
  note: string
  recurring_rule_id: string
}

/** Subset của Repo mà engine cần — test dùng fake, app truyền repo thật. */
export interface RecurringRepo {
  listRecurringRules(): Promise<RecurringRuleLike[]>
  insertRecurringOccurrence(input: RecurringOccurrenceInput): Promise<boolean>
  updateRecurringRule(id: string, patch: { last_generated_on: string }): Promise<unknown>
}

/**
 * Catch-up khi mở app: sinh giao dịch cho MỌI kỳ đến hạn của mọi rule active
 * (sinh bù tất cả kỳ lỡ, occurred_on = đúng ngày đến hạn quá khứ), kỳ trùng
 * do thiết bị khác đã sinh thì bỏ qua. Trả về số giao dịch đã tạo.
 */
export async function runRecurringCatchUp(repo: RecurringRepo, todayISO: string): Promise<number> {
  const rules = await repo.listRecurringRules()
  let created = 0
  for (const rule of rules) {
    const dues = listDueDates(rule, todayISO)
    if (dues.length === 0) continue
    for (const due of dues) {
      const ok = await repo.insertRecurringOccurrence({
        type: rule.type,
        amount: rule.amount,
        to_amount: rule.to_amount,
        category_id: rule.category_id,
        account_id: rule.account_id,
        to_account_id: rule.to_account_id,
        occurred_on: due,
        note: rule.note,
        recurring_rule_id: rule.id,
      })
      if (ok) created++
    }
    await repo.updateRecurringRule(rule.id, { last_generated_on: dues[dues.length - 1] })
  }
  return created
}
