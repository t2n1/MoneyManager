// Luật tài khoản (mục 1, 2 của spec) — THUẦN.
// Mục 1 dùng lại cardFunding() của trang Tài sản để chuông và trang Tài sản
// luôn nói cùng một con số, và để xử lý đúng ca nhiều thẻ chung một nguồn.
import { cardFunding, type CardLiability, type CardSourceLike } from '../../assets/aggregate'
import { addDaysISO, nextCardDueDate } from '../../../lib/dates'
import { nthDueDate } from '../../../lib/recurring'
import type { AppNotification, NotificationInput } from '../types'

/** Nhìn trước bao nhiêu ngày cho mục "tài khoản sắp không đủ tiền". */
export const SHORTFALL_HORIZON_DAYS = 14

/** Loại tài khoản chứa tiền tiêu được — chỉ những loại này mới có nghĩa khi âm. */
const SPENDABLE_TYPES = new Set(['cash', 'bank', 'ic', 'ewallet'])

/** Tổng tiền một quy tắc định kỳ sẽ cộng/trừ vào `accountId` từ mai đến hết `untilISO`. */
function recurringImpact(
  input: NotificationInput,
  accountId: string,
  untilISO: string,
): { outgoing: number; incoming: number; labels: string[] } {
  let outgoing = 0
  let incoming = 0
  const labels: string[] = []

  for (const r of input.recurringRules) {
    if (r.is_paused) continue
    if (r.type === 'transfer') continue // chuyển khoản không đổi tổng tiền của chính ví này
    if (r.account_id !== accountId) continue

    // Đếm các kỳ rơi vào (todayISO, untilISO]. nthDueDate luôn tính từ anchor start_on
    // nên không trôi dần; dừng khi vượt untilISO hoặc quá end_on.
    let hits = 0
    for (let n = 0; ; n++) {
      const due = nthDueDate(r.start_on, r.frequency, n)
      if (due > untilISO) break
      if (r.end_on && due > r.end_on) break
      if (due <= input.todayISO) continue
      hits++
      if (hits > 60) break // chặn vòng lặp với quy tắc tuần + khoảng dài
    }
    if (hits === 0) continue

    if (r.type === 'expense') {
      outgoing += r.amount * hits
      if (r.note) labels.push(`${r.note} ${input.formatMoney(r.amount * hits, input.currencyOf(accountId))}`)
    } else {
      incoming += r.amount * hits
    }
  }

  return { outgoing, incoming, labels }
}

export function accountRules(input: NotificationInput): AppNotification[] {
  const out: AppNotification[] = []

  // --- Mục 2: tài khoản đang âm ---
  for (const a of input.accounts) {
    if (a.is_archived || !SPENDABLE_TYPES.has(a.type)) continue
    if (a.balance >= 0) continue
    out.push({
      key: `account-negative:${a.id}`,
      kind: 'action',
      type: 'account-negative',
      severity: 'high',
      title: `${a.name} đang âm ${input.formatMoney(-a.balance, a.currency)}`,
      detail: 'Thường là ghi nhầm hoặc quên ghi một khoản thu.',
      to: `/assets/${a.id}`,
    })
  }

  // --- Mục 1: tài khoản sắp không đủ tiền ---
  const untilISO = addDaysISO(input.todayISO, SHORTFALL_HORIZON_DAYS)

  // Chỉ tính thẻ có ngày trả kế tiếp nằm trong tầm nhìn.
  const cards: CardLiability[] = input.accounts
    .filter((a) => a.type === 'card' && !a.is_archived && a.payment_due_day != null)
    .filter((a) => nextCardDueDate(a.payment_due_day as number, input.todayISO) <= untilISO)
    .map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
      balance: a.balance,
      baseValue: null,
      creditLimit: a.credit_limit,
      paymentDueDay: a.payment_due_day,
      paymentAccountId: a.payment_account_id,
      includeInTotals: a.include_in_totals,
      hidden: a.is_hidden,
    }))

  const sourceById = new Map<string, CardSourceLike>(
    input.accounts
      .filter((a) => !a.is_archived && a.type !== 'card')
      .map((a) => [a.id, { id: a.id, name: a.name, currency: a.currency, balance: a.balance }]),
  )

  const { groups } = cardFunding(cards, sourceById)

  // Mỗi tài khoản nguồn có thẻ đến hạn → một dòng. Cộng thêm định kỳ chi, trừ định kỳ thu.
  const sourcesSeen = new Set<string>()
  for (const g of groups) {
    sourcesSeen.add(g.sourceId)
    const impact = recurringImpact(input, g.sourceId, untilISO)
    const owe = g.totalOwed + impact.outgoing
    const have = g.sourceBalance + impact.incoming
    if (have >= owe) continue

    const cardNames = cards
      .filter((c) => c.paymentAccountId === g.sourceId)
      .map((c) => `${c.name} ${input.formatMoney(c.balance < 0 ? -c.balance : 0, c.currency)}`)

    out.push({
      key: `account-shortfall:${g.sourceId}`,
      kind: 'action',
      type: 'account-shortfall',
      severity: 'high',
      title: `${g.sourceName} thiếu ${input.formatMoney(owe - have, g.currency)}`,
      detail: `${SHORTFALL_HORIZON_DAYS} ngày tới phải trả ${input.formatMoney(owe, g.currency)} · ${[...cardNames, ...impact.labels].join(' · ')}`,
      onISO: untilISO,
      to: `/assets/${g.sourceId}`,
    })
  }

  // Tài khoản không có thẻ nào trỏ tới, nhưng có định kỳ chi vượt số dư.
  for (const a of input.accounts) {
    if (a.is_archived || !SPENDABLE_TYPES.has(a.type)) continue
    if (sourcesSeen.has(a.id)) continue
    if (a.balance < 0) continue // đã có mục 2 lo
    const impact = recurringImpact(input, a.id, untilISO)
    if (impact.outgoing === 0) continue
    const have = a.balance + impact.incoming
    if (have >= impact.outgoing) continue
    out.push({
      key: `account-shortfall:${a.id}`,
      kind: 'action',
      type: 'account-shortfall',
      severity: 'high',
      title: `${a.name} thiếu ${input.formatMoney(impact.outgoing - have, a.currency)}`,
      detail: `${SHORTFALL_HORIZON_DAYS} ngày tới phải trả ${input.formatMoney(impact.outgoing, a.currency)} · ${impact.labels.join(' · ')}`,
      onISO: untilISO,
      to: `/assets/${a.id}`,
    })
  }

  return out
}
