// Giao dịch định kỳ — toán ngày thuần (không I/O), anchor là start_on.
// Chu kỳ dùng ngày dương lịch thuần, KHÔNG liên quan month_start_day.
// RecurringFrequency định nghĩa ở đây (database.types import lại) để lib này
// không phụ thuộc ngược vào types/database — cùng pattern CurrencyCode ở money.ts.

import { addDaysISO } from './dates'

export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly'

/** 'auto' = tới hạn tự sinh giao dịch · 'remind' = chỉ nhắc (migration 0037). */
export type RecurringMode = 'auto' | 'remind'

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

// --- Khoản cần thanh toán (mode = 'remind', migration 0037) ---

/** Phần một rule kiểu nhắc cần có để biết "đang tới hạn chưa". */
export interface BillRuleLike extends RuleSchedule {
  id: string
  mode?: RecurringMode
  remind_days_before?: number
}

export interface BillStatus {
  ruleId: string
  /** Kỳ CHƯA XÁC NHẬN sớm nhất — chính là kỳ người dùng cần ghi tiếp theo. */
  dueISO: string
  /**
   * Số ngày từ hôm nay tới `dueISO`. Âm = đã quá hạn bấy nhiêu ngày.
   * 0 = đúng hôm nay.
   */
  daysLeft: number
  /**
   * Số kỳ đã tới hạn mà chưa xác nhận. 0 = kỳ sắp tới, chưa tới ngày.
   *
   * Có riêng con số này vì "quá hạn 3 kỳ" khác hẳn "quá hạn 90 ngày": người lỡ ba
   * tháng gửi tiền về nhà cần biết là BA lần, không phải một lần cũ.
   */
  overdueCount: number
}

/** Khoảng cách ngày (b − a) theo lịch, cả hai là ISO 'YYYY-MM-DD'. */
function daysBetweenISO(aISO: string, bISO: string): number {
  const a = Date.parse(aISO + 'T00:00:00Z')
  const b = Date.parse(bISO + 'T00:00:00Z')
  return Math.round((b - a) / 86_400_000)
}

/**
 * Các khoản kiểu NHẮC đang cần để ý: đã quá hạn, tới hạn hôm nay, hoặc sắp tới hạn
 * trong `remind_days_before` ngày.
 *
 * Rule `mode` khác 'remind', đang tạm dừng, hoặc đã hết kỳ (quá `end_on`) → không có
 * dòng nào. Kết quả xếp theo `dueISO` tăng dần: cái trễ nhất lên đầu.
 */
export function billStatuses(rules: BillRuleLike[], todayISO: string): BillStatus[] {
  const out: BillStatus[] = []

  for (const rule of rules) {
    if (rule.mode !== 'remind' || rule.is_paused) continue
    // nextDueDate bỏ qua is_paused (đã lọc ở trên) và trả kỳ chưa xong sớm nhất.
    const dueISO = nextDueDate(rule)
    if (dueISO === null) continue

    const daysLeft = daysBetweenISO(todayISO, dueISO)
    // Chưa tới ngày và cũng chưa vào tầm nhắc → im.
    if (daysLeft > (rule.remind_days_before ?? 0)) continue

    out.push({
      ruleId: rule.id,
      dueISO,
      daysLeft,
      // listDueDates trả đúng các kỳ ≤ hôm nay còn chưa xong — cùng một phép đếm mà
      // engine catch-up dùng, nên hai bên không thể lệch nhau về "kỳ nào còn nợ".
      overdueCount: listDueDates(rule, todayISO).length,
    })
  }

  return out.sort((a, b) => (a.dueISO < b.dueISO ? -1 : a.dueISO > b.dueISO ? 1 : 0))
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
  /**
   * Vắng mặt = 'auto' — dữ liệu cũ (và mọi fake trong test viết trước 0037) không
   * có cột này, mà mặc định phải là hành vi CŨ, không phải im lặng ngừng sinh.
   */
  mode?: RecurringMode
  /** Hoàn tiền lặp lại (migration 0043); vắng mặt = false. Chỉ có nghĩa với CHI. */
  is_refund?: boolean
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
  /** Chép từ quy tắc (migration 0043). Luôn false với thu/chuyển khoản. */
  is_refund: boolean
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
 *
 * Rule `mode = 'remind'` bị BỎ QUA hoàn toàn — kể cả việc đẩy `last_generated_on`.
 * Đẩy con trỏ ở đây là xoá mất lời nhắc mà không ghi khoản nào: người dùng mở app
 * một cái là "gửi tiền về cho má" tự coi như xong. Con trỏ của kiểu nhắc CHỈ được
 * đẩy khi người dùng bấm xác nhận.
 */
export async function runRecurringCatchUp(repo: RecurringRepo, todayISO: string): Promise<number> {
  const rules = await repo.listRecurringRules()
  let created = 0
  for (const rule of rules) {
    if (rule.mode === 'remind') continue
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
        // DB chỉ nhận is_refund trên CHI (transactions_refund_expense_only). Quy tắc
        // thu/chuyển khoản lỡ mang cờ thì bỏ ở đây, chứ để DB từ chối là cả quy tắc
        // đó ngừng sinh mà không ai biết.
        is_refund: rule.type === 'expense' && rule.is_refund === true,
      })
      if (ok) created++
    }
    await repo.updateRecurringRule(rule.id, { last_generated_on: dues[dues.length - 1] })
  }
  return created
}
