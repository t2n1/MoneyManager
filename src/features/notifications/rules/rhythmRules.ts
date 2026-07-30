// Luật nhịp và cột mốc (mục 9–13 của spec) — THUẦN.
import { addMonths, daysBetween, getMonthRange, monthKeyForDate, monthKeyString } from '../../../lib/dates'
import { convertToBase } from '../../../lib/rates'
import { detectRecurring, ruleKey } from '../../../lib/recurringRadar'
// expenseSign lấy từ chính module mà trang Báo cáo dùng (sumIncomeExpense) — hai chỗ
// phải ra CÙNG một con số, nên phải dùng CÙNG một hàm. reports/aggregate chỉ import
// giá trị từ lib/dates và lib/rates, cả hai đã nằm trong đồ thị thuần (purity.test.ts).
import { expenseSign } from '../../reports/aggregate'
import type { AppNotification, NotificationInput } from '../types'

/** Bao nhiêu ngày không ghi thì nhắc. */
export const STALE_DAYS = 3
/** Các mốc phần trăm của mục tiêu tiết kiệm. */
export const MILESTONES = [25, 50, 75, 100]
/** Cần ít nhất bấy nhiêu bản chụp mới dám nói "kỷ lục". */
export const RECORD_MIN_SNAPSHOTS = 3

/** 'YYYY-Www' theo tuần ISO — để mã "lâu chưa ghi" chỉ đổi mỗi tuần một lần. */
function isoWeekKey(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  // Thứ 5 của tuần hiện tại quyết định năm ISO.
  const day = (d.getUTCDay() + 6) % 7 // 0 = Thứ 2
  d.setUTCDate(d.getUTCDate() - day + 3)
  const isoYear = d.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4))
  const firstDay = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3)
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

export function rhythmRules(input: NotificationInput): AppNotification[] {
  const out: AppNotification[] = []

  // --- Mục 10: lâu chưa ghi sổ ---
  if (input.recentTxs.length > 0) {
    const lastISO = input.recentTxs.reduce(
      (m, t) => (t.occurred_on > m ? t.occurred_on : m),
      input.recentTxs[0].occurred_on,
    )
    const idle = daysBetween(lastISO, input.todayISO)
    if (idle >= STALE_DAYS) {
      out.push({
        key: `stale-entry:${isoWeekKey(input.todayISO)}`,
        kind: 'info',
        type: 'stale-entry',
        severity: 'low',
        title: `Đã ${idle} ngày chưa ghi giao dịch nào`,
        to: '/entry',
      })
    }
  }

  // --- Mục 9: gợi ý tạo quy tắc định kỳ ---
  const existingKeys = new Set(
    input.recurringRules.map((r) => ruleKey(r.type, r.account_id, r.category_id, r.amount)),
  )
  for (const s of detectRecurring(input.recentTxs, existingKeys, input.todayISO)) {
    out.push({
      key: `recurring-suggestion:${s.key}`,
      kind: 'info',
      type: 'recurring-suggestion',
      severity: 'low',
      title: `Thấy ${input.formatMoney(s.amount, input.currencyOf(s.account_id))} trả đều ${s.frequency === 'weekly' ? 'mỗi tuần' : 'mỗi tháng'}${s.note ? ` cho "${s.note}"` : ''}`,
      detail: 'Tạo quy tắc định kỳ để khỏi phải ghi tay mỗi kỳ?',
      to: '/recurring',
    })
  }

  // --- Mục 11: mục tiêu tiết kiệm chạm mốc ---
  const balanceOf = new Map(input.accounts.map((a) => [a.id, a.balance]))
  for (const g of input.savingsGoals) {
    if (g.target_amount <= 0) continue
    const have = balanceOf.get(g.account_id) ?? 0
    const pct = (have / g.target_amount) * 100
    const reached = MILESTONES.filter((m) => pct >= m)
    if (reached.length === 0) continue
    const top = reached[reached.length - 1]
    out.push({
      key: `savings-milestone:${g.id}:${top}`,
      kind: 'info',
      type: 'savings-milestone',
      severity: 'low',
      title: `${g.name} đã đạt ${top}% mục tiêu`,
      detail: `${input.formatMoney(have, input.currencyOf(g.account_id))} / ${input.formatMoney(g.target_amount, input.currencyOf(g.account_id))}`,
      to: '/assets',
    })
  }

  // --- Mục 12: tài sản ròng lập kỷ lục ---
  if (input.networthSnapshots.length >= RECORD_MIN_SNAPSHOTS) {
    const sorted = [...input.networthSnapshots].sort((a, b) =>
      a.snapshot_on.localeCompare(b.snapshot_on),
    )
    const latest = sorted[sorted.length - 1]
    const isRecord = sorted.slice(0, -1).every((s) => s.net_worth < latest.net_worth)
    if (isRecord) {
      const key = monthKeyString(monthKeyForDate(latest.snapshot_on, input.monthStartDay))
      out.push({
        key: `networth-record:${key}`,
        kind: 'info',
        type: 'networth-record',
        severity: 'low',
        title: `Tài sản ròng cao nhất từ trước tới nay: ${input.formatMoney(latest.net_worth, input.base)}`,
        to: '/assets',
      })
    }
  }

  // --- Mục 13: tổng kết tháng, chỉ vào ngày đầu kỳ mới ---
  const thisMonth = monthKeyForDate(input.todayISO, input.monthStartDay)
  const thisRange = getMonthRange(thisMonth, input.monthStartDay)
  if (thisRange.start === input.todayISO) {
    const prev = addMonths(thisMonth, -1)
    const prevRange = getMonthRange(prev, input.monthStartDay)
    let spent = 0
    let earned = 0
    let missingRate = false
    // Quy đổi từng giao dịch về base trước khi cộng (t.amount là minor units của
    // loại tiền tài khoản nguồn) — giống buildBudgetReport/assetBreakdown. Không quy
    // đổi thì một khoản ₫ cộng thẳng vào ¥ ra một con số vô nghĩa mang ký hiệu ¥,
    // và số ở đây sẽ vênh với trang Báo cáo.
    for (const t of input.recentTxs) {
      if (t.occurred_on < prevRange.start || t.occurred_on >= prevRange.end) continue
      if (t.exclude_from_stats || t.is_debt_flow) continue
      if (t.type !== 'expense' && t.type !== 'income') continue
      const v = convertToBase(t.amount, input.currencyOf(t.account_id), input.base, input.rates)
      if (v === null) {
        missingRate = true
        break
      }
      // Hoàn tiền (trả hàng, hủy vé) là chi ÂM — y như sumIncomeExpense ở trang Báo
      // cáo, buildBudgetReport, health/snapshot và tags/aggregate. Bỏ hệ số này thì
      // một cái áo ¥28.000 mua rồi trả lại làm câu tổng kết lệch 2× số hoàn tiền
      // (chi ¥56.000) so với đúng trang /reports mà nó dẫn tới.
      if (t.type === 'expense') spent += v * expenseSign(t)
      else earned += v
    }
    // Thiếu tỷ giá thì IM, không đăng tổng sai (mục H của spec: thiếu dữ liệu thì im).
    // Khác với trang Tài sản/Ngân sách — ở đó còn tách được theo loại tiền, còn tin
    // này chỉ có một dòng chữ nên đúng-một-phần cũng là sai.
    if (!missingRate) {
      out.push({
        key: `monthly-summary:${monthKeyString(prev)}`,
        kind: 'info',
        type: 'monthly-summary',
        severity: 'low',
        title: `Tháng ${prev.month}: chi ${input.formatMoney(spent, input.base)}, thu ${input.formatMoney(earned, input.base)}`,
        detail: `Để dành ${input.formatMoney(earned - spent, input.base)}`,
        to: '/reports',
      })
    }
  }

  return out
}
