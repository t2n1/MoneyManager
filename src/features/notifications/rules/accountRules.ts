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
      // Quy tắc chưa đặt tên vẫn phải có nhãn: số tiền của nó ĐÃ cộng vào tổng, nên bỏ
      // nhãn là người dùng không cộng lại được các khoản liệt kê thành con số đang đọc.
      labels.push(
        `${r.note || 'Khoản định kỳ'} ${input.formatMoney(r.amount * hits, input.currencyOf(accountId))}`,
      )
    } else {
      incoming += r.amount * hits
    }
  }

  return { outgoing, incoming, labels }
}

interface AccountLike {
  id: string
  name: string
  currency: CurrencyCode
  balance: number
}

/** Số liệu của một ca thiếu tiền. `null` = không thiếu, không có gì phải nói. */
interface ShortfallFacts {
  /** Tổng phải trả trong tầm nhìn (theo loại tiền của ví). */
  owe: number
  /** Tổng có sẵn (số dư + định kỳ thu). */
  have: number
  /** Câu chi tiết đã dựng xong: "14 ngày tới phải trả X · <liệt kê>". */
  detail: string
}

/**
 * So sánh "phải trả owedBase + định kỳ" với "có sẵn balance + định kỳ thu". Dùng chung
 * cho hai trường hợp: tài khoản có thẻ trỏ tới (owedBase = tổng nợ thẻ) và tài khoản chỉ
 * có định kỳ chi (owedBase = 0) — cùng một công thức thiếu/đủ, chỉ khác nguồn của
 * owedBase và nhãn thêm.
 *
 * Tách khỏi việc ĐẨY thông báo vì có ca cần con số mà không cần dòng riêng: ví đang âm
 * đã có dòng của mục 2, nhưng nghĩa vụ 14 ngày tới của nó vẫn phải được nói ra.
 */
function shortfallFacts(
  input: NotificationInput,
  account: AccountLike,
  owedBase: number,
  extraLabels: string[],
  untilISO: string,
): ShortfallFacts | null {
  const impact = recurringImpact(input, account.id, untilISO)
  const owe = owedBase + impact.outgoing
  const have = account.balance + impact.incoming
  if (have >= owe) return null

  // Dựng mảng phần liệt kê TRƯỚC rồi mới nối: nhánh 2 (chỉ có định kỳ, không thẻ) đi
  // với extraLabels rỗng, nên nối cứng " · " là ra câu treo lơ lửng
  // "14 ngày tới phải trả ¥50.000 · " với dấu phân cách cụt ở cuối.
  const parts = [...extraLabels, ...impact.labels]
  const listed = parts.length > 0 ? ` · ${parts.join(' · ')}` : ''

  return {
    owe,
    have,
    detail: `${SHORTFALL_HORIZON_DAYS} ngày tới phải trả ${input.formatMoney(owe, account.currency)}${listed}`,
  }
}

/** Thiếu tiền thì đẩy một dòng account-shortfall vào `out`. */
function pushShortfallIfNeeded(
  out: AppNotification[],
  input: NotificationInput,
  account: AccountLike,
  owedBase: number,
  extraLabels: string[],
  untilISO: string,
): void {
  const facts = shortfallFacts(input, account, owedBase, extraLabels, untilISO)
  if (!facts) return

  out.push({
    key: `account-shortfall:${account.id}`,
    kind: 'action',
    type: 'account-shortfall',
    severity: 'high',
    title: `${account.name} thiếu ${input.formatMoney(facts.owe - facts.have, account.currency)}`,
    detail: facts.detail,
    onISO: untilISO,
    to: `/assets/account/${account.id}`,
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
      to: `/assets/account/${a.id}`,
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
      statementDay: a.statement_day,
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
    // Lọc thêm theo currency giống hệt cardFunding() (aggregate.ts): thẻ khác loại tiền
    // với nguồn bị cardFunding loại khỏi totalOwed, nên cũng không được nêu tên ở đây —
    // nếu không, chi tiết sẽ nhắc tới một thẻ mà số tiền không hề gồm nợ của nó.
    const cardNames = cards
      .filter((c) => c.paymentAccountId === g.sourceId && c.currency === g.currency)
      .map((c) => `${c.name} ${input.formatMoney(c.balance < 0 ? -c.balance : 0, c.currency)}`)
    const source: AccountLike = {
      id: g.sourceId,
      name: g.sourceName,
      currency: g.currency,
      balance: g.sourceBalance,
    }

    // Đã có dòng "đang âm" cho nguồn này thì KHÔNG thêm dòng thứ hai — cùng một cái ví,
    // cùng một số tiền. Giữ dòng "đang âm" (chứ không giữ "thiếu tiền") vì đó là gốc của
    // vấn đề: số dư âm trên ví tiêu được thường là ghi nhầm hoặc quên ghi một khoản thu,
    // và chừng nào chưa sửa thì con số "thiếu bao nhiêu" cũng chưa đáng tin. Đây cũng
    // đúng thứ tự ưu tiên mà nhánh định kỳ bên dưới đã áp ("đã có mục 2 lo").
    //
    // NHƯNG gộp dòng không được làm mất THÔNG TIN: câu "thiếu tiền" là chỗ duy nhất
    // trong cả app nói ra "14 ngày tới phải trả ¥45.000 · Rakuten Card ¥45.000". Nên
    // nối câu đó vào phần chi tiết của dòng "đang âm" thay vì bỏ đi.
    if (negativeReported.has(g.sourceId)) {
      const facts = shortfallFacts(input, source, g.totalOwed, cardNames, untilISO)
      if (facts) {
        const row = out.find((n) => n.key === `account-negative:${g.sourceId}`)
        if (row) row.detail = `${facts.detail} · ${row.detail}`
      }
      continue
    }

    pushShortfallIfNeeded(out, input, source, g.totalOwed, cardNames, untilISO)
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
