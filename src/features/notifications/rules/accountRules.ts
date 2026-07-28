// Luật tài khoản (mục 1, 2 của spec) — THUẦN.
// Mục 1 dùng lại cardFunding() của trang Tài sản để chuông và trang Tài sản
// luôn nói cùng một con số, và để xử lý đúng ca nhiều thẻ chung một nguồn.
import { cardFunding, type CardLiability, type CardSourceLike } from '../../assets/aggregate'
import { addDaysISO, nextCardDueDate } from '../../../lib/dates'
import { nthDueDate } from '../../../lib/recurring'
import type { CurrencyCode } from '../../../lib/money'
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

/**
 * So sánh "phải trả owedBase + định kỳ" với "có sẵn balance + định kỳ thu"; nếu thiếu
 * thì đẩy một thông báo account-shortfall vào `out`. Dùng chung cho hai trường hợp:
 * tài khoản có thẻ trỏ tới (owedBase = tổng nợ thẻ) và tài khoản chỉ có định kỳ chi
 * (owedBase = 0) — cùng một công thức thiếu/đủ, chỉ khác nguồn của owedBase và nhãn thêm.
 */
function pushShortfallIfNeeded(
  out: AppNotification[],
  input: NotificationInput,
  account: { id: string; name: string; currency: CurrencyCode; balance: number },
  owedBase: number,
  extraLabels: string[],
  untilISO: string,
): void {
  const impact = recurringImpact(input, account.id, untilISO)
  const owe = owedBase + impact.outgoing
  const have = account.balance + impact.incoming
  if (have >= owe) return

  out.push({
    key: `account-shortfall:${account.id}`,
    kind: 'action',
    type: 'account-shortfall',
    severity: 'high',
    title: `${account.name} thiếu ${input.formatMoney(owe - have, account.currency)}`,
    detail: `${SHORTFALL_HORIZON_DAYS} ngày tới phải trả ${input.formatMoney(owe, account.currency)} · ${[...extraLabels, ...impact.labels].join(' · ')}`,
    onISO: untilISO,
    to: `/assets/${account.id}`,
  })
}

export function accountRules(input: NotificationInput): AppNotification[] {
  const out: AppNotification[] = []

  // --- Mục 2: tài khoản đang âm ---
  // Ghi lại tài khoản nào ĐÃ có dòng "đang âm" để mục 1 khỏi nói lại về nó (spec C.4:
  // một dòng cho mỗi tài khoản). Dùng tập id thật chứ không phải `balance < 0`: mục 2
  // chỉ báo loại ví tiêu được, nên một tài khoản đầu tư/cố định âm mà lại là nguồn trả
  // thẻ thì KHÔNG có dòng nào của mục 2 — chặn theo số dư sẽ làm nó im hẳn.
  const negativeReported = new Set<string>()
  for (const a of input.accounts) {
    if (a.is_archived || !SPENDABLE_TYPES.has(a.type)) continue
    if (a.balance >= 0) continue
    negativeReported.add(a.id)
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
    // `sourcesSeen.add` phải đứng TRƯỚC continue: đã có dòng cho nguồn này rồi thì
    // nhánh định kỳ bên dưới cũng không được nhặt nó lên lần nữa.
    sourcesSeen.add(g.sourceId)
    // Đã có dòng "đang âm" cho nguồn này thì thôi — cùng một cái ví, cùng một số tiền.
    // Giữ dòng "đang âm" (chứ không giữ "thiếu tiền") vì đó là gốc của vấn đề: số dư
    // âm trên ví tiêu được thường là ghi nhầm hoặc quên ghi một khoản thu, và chừng nào
    // chưa sửa thì con số "thiếu bao nhiêu" cũng chưa đáng tin. Đây cũng đúng thứ tự ưu
    // tiên mà nhánh định kỳ bên dưới đã áp ("đã có mục 2 lo") — một luật, một chỗ.
    if (negativeReported.has(g.sourceId)) continue
    // Lọc thêm theo currency giống hệt cardFunding() (aggregate.ts): thẻ khác loại tiền
    // với nguồn bị cardFunding loại khỏi totalOwed, nên cũng không được nêu tên ở đây —
    // nếu không, chi tiết sẽ nhắc tới một thẻ mà số tiền không hề gồm nợ của nó.
    const cardNames = cards
      .filter((c) => c.paymentAccountId === g.sourceId && c.currency === g.currency)
      .map((c) => `${c.name} ${input.formatMoney(c.balance < 0 ? -c.balance : 0, c.currency)}`)

    pushShortfallIfNeeded(
      out,
      input,
      { id: g.sourceId, name: g.sourceName, currency: g.currency, balance: g.sourceBalance },
      g.totalOwed,
      cardNames,
      untilISO,
    )
  }

  // Tài khoản không có thẻ nào trỏ tới, nhưng có định kỳ chi vượt số dư.
  for (const a of input.accounts) {
    if (a.is_archived || !SPENDABLE_TYPES.has(a.type)) continue
    if (sourcesSeen.has(a.id)) continue
    if (negativeReported.has(a.id)) continue // đã có mục 2 lo

    pushShortfallIfNeeded(out, input, a, 0, [], untilISO)
  }

  return out
}
