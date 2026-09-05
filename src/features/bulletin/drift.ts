// "Lối sống lạm phát" & "cửa sổ sau tăng lương" — THUẦN, có test.
//
// Hai bài học từ giáo trình đã đối chiếu (09/2026):
// · C7/C21: thu nhập tăng mà tài sản không tăng theo = mức sống đã nuốt phần tăng.
//   Đo bằng hai cửa sổ 6 THÁNG HOÀN TẤT liền nhau: thu đổi bao nhiêu %, chi đổi bao
//   nhiêu %, tỷ lệ để dành đổi mấy điểm.
// · C11 (thiên kiến hiện tại): vài tuần đầu sau tăng lương là lúc DUY NHẤT nâng mức để
//   dành không thấy đau — qua cửa sổ đó thì mức sống đã dâng theo. App phát hiện mức
//   LƯƠNG ĐỊNH KỲ vừa nhảy bậc và chỉ nhắc trong 3 tháng đầu.
//
// Quy đổi tiền: convertToBase; khoản thiếu tỷ giá bị LOẠI và bật cờ approx — đúng luật
// chung của repo, không bao giờ quy 1:1.
import { addMonths, getMonthRange, monthKeyForDate, type MonthKey } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'

export const DRIFT_WINDOW_MONTHS = 6
/** Chi phải dâng nhanh hơn thu ít nhất chừng này (điểm %) mới đáng kêu. */
export const DRIFT_GAP_PCT = 5
/** Tỷ lệ để dành tụt ít nhất chừng này (điểm %) giữa hai cửa sổ mới đáng kêu. */
export const SAVED_DROP_PCT = 5
/** Lương định kỳ phải nhảy ít nhất chừng này (%) mới tính là một lần tăng. */
export const RAISE_MIN_PCT = 3
/** Chỉ nhắc "cửa sổ vàng" trong chừng này tháng sau khi lương nhảy. */
export const RAISE_WINDOW_MONTHS = 3

interface CommonArgs {
  txs: TransactionRow[]
  /** Tiền của tài khoản một giao dịch — dựng bằng makeCurrencyOf hoặc tương đương. */
  currencyOf: (accountId: string) => CurrencyCode
  base: CurrencyCode
  rates: Rates
  todayISO: string
  monthStartDay: number
}

/** Tổng thu/chi (minor, base) của một dãy tháng; loại nợ/loại-khỏi-thống-kê/chuyển. */
function sumWindow(
  args: CommonArgs,
  keys: MonthKey[],
): { incomeMinor: number; expenseMinor: number; approx: boolean } {
  const ranges = keys.map((k) => getMonthRange(k, args.monthStartDay))
  let income = 0
  let expense = 0
  let approx = false
  for (const t of args.txs) {
    if (t.type === 'transfer' || t.is_debt_flow || t.exclude_from_stats) continue
    if (!ranges.some((r) => t.occurred_on >= r.start && t.occurred_on < r.end)) continue
    const v = convertToBase(t.amount, args.currencyOf(t.account_id), args.base, args.rates)
    if (v === null) {
      approx = true
      continue
    }
    if (t.type === 'income') income += v
    // Hoàn tiền là CHI mang dấu âm — cộng thẳng là đúng chiều.
    else expense += v
  }
  return { incomeMinor: income, expenseMinor: expense, approx }
}

/** Các tháng ĐÃ HOÀN TẤT, mới → cũ: tháng hiện tại (đang chạy dở) không có mặt. */
export function completedMonthKeys(todayISO: string, monthStartDay: number, n: number): MonthKey[] {
  const current = monthKeyForDate(todayISO, monthStartDay)
  return Array.from({ length: n }, (_, i) => addMonths(current, -(i + 1)))
}

export interface DriftResult {
  /** % thay đổi của thu giữa hai cửa sổ; null nếu cửa sổ trước không có thu. */
  incomePct: number | null
  expensePct: number | null
  /** Tỷ lệ để dành (%) của từng cửa sổ; null nếu không có thu. */
  savedPctRecent: number | null
  savedPctPrior: number | null
  approx: boolean
  /** null = không có gì đáng kêu — panel im lặng. */
  verdict: 'chi-dang-theo-thu' | 'ty-le-de-danh-tut' | null
}

export function lifestyleDrift(args: CommonArgs): DriftResult | null {
  const keys = completedMonthKeys(args.todayISO, args.monthStartDay, DRIFT_WINDOW_MONTHS * 2)
  const recent = sumWindow(args, keys.slice(0, DRIFT_WINDOW_MONTHS))
  const prior = sumWindow(args, keys.slice(DRIFT_WINDOW_MONTHS))
  // Cửa sổ trước không có cả thu lẫn chi = sổ chưa đủ 12 tháng — không so được.
  if (prior.incomeMinor <= 0 && prior.expenseMinor <= 0) return null

  const pct = (now: number, before: number) =>
    before > 0 ? ((now - before) / before) * 100 : null
  const saved = (w: { incomeMinor: number; expenseMinor: number }) =>
    w.incomeMinor > 0 ? ((w.incomeMinor - w.expenseMinor) / w.incomeMinor) * 100 : null

  const incomePct = pct(recent.incomeMinor, prior.incomeMinor)
  const expensePct = pct(recent.expenseMinor, prior.expenseMinor)
  const savedPctRecent = saved(recent)
  const savedPctPrior = saved(prior)

  let verdict: DriftResult['verdict'] = null
  if (
    incomePct !== null &&
    expensePct !== null &&
    incomePct >= 0 &&
    expensePct - incomePct >= DRIFT_GAP_PCT
  )
    verdict = 'chi-dang-theo-thu'
  else if (
    savedPctRecent !== null &&
    savedPctPrior !== null &&
    savedPctPrior - savedPctRecent >= SAVED_DROP_PCT
  )
    verdict = 'ty-le-de-danh-tut'

  return {
    incomePct,
    expensePct,
    savedPctRecent,
    savedPctPrior,
    approx: recent.approx || prior.approx,
    verdict,
  }
}

export interface RaiseInfo {
  /** Tháng đầu tiên lương đứng ở mức mới. */
  fromKey: MonthKey
  /** Mức nhảy (%), so trung vị 6 tháng nền trước đó. */
  pct: number
  /** 1 = tháng vừa xong. Chỉ trả về khi ≤ RAISE_WINDOW_MONTHS. */
  monthsAgo: number
}

/**
 * Phát hiện LƯƠNG ĐỊNH KỲ vừa nhảy bậc — chỉ đọc giao dịch thu có `recurring_rule_id`
 * (cờ THẬT do người dùng khai quy tắc, không đoán từ số tiền). null = không có gì mới:
 * chưa đủ dữ liệu, không nhảy đủ RAISE_MIN_PCT, hay đã quá cửa sổ nhắc.
 */
export function detectRaise(args: CommonArgs): RaiseInfo | null {
  const keys = completedMonthKeys(args.todayISO, args.monthStartDay, RAISE_WINDOW_MONTHS + 6)
  const perMonth = keys.map((k) => {
    const r = getMonthRange(k, args.monthStartDay)
    let total = 0
    for (const t of args.txs) {
      if (t.type !== 'income' || !t.recurring_rule_id) continue
      if (t.is_debt_flow || t.exclude_from_stats) continue
      if (t.occurred_on < r.start || t.occurred_on >= r.end) continue
      total += convertToBase(t.amount, args.currencyOf(t.account_id), args.base, args.rates) ?? 0
    }
    return { key: k, total }
  })

  // Chỉ xét tháng CÓ lương định kỳ — một tháng nghỉ không lương không được kéo nền
  // xuống thành "tăng lương" giả, cũng không được cắt đôi chuỗi mức mới.
  const co = perMonth.filter((m) => m.total > 0)

  // Dò ĐỘ DÀI chuỗi tháng đứng ở mức mới (L = 1..cửa sổ nhắc): nền là trung vị 6 tháng
  // có lương NGAY TRƯỚC chuỗi, và tháng liền trước chuỗi phải còn ở mức cũ — không thì
  // chuỗi thật dài hơn L, thử L+1; dài quá cửa sổ nhắc thì coi như chuyện cũ, im lặng.
  for (let L = 1; L <= RAISE_WINDOW_MONTHS; L++) {
    const nenArr = co
      .slice(L, L + 6)
      .map((m) => m.total)
      .sort((a, b) => a - b)
    if (nenArr.length < 3) return null
    const median =
      nenArr.length % 2 === 1
        ? nenArr[(nenArr.length - 1) / 2]
        : (nenArr[nenArr.length / 2 - 1] + nenArr[nenArr.length / 2]) / 2
    if (median <= 0) return null
    const nguong = median * (1 + RAISE_MIN_PCT / 100)
    if (!co.slice(0, L).every((m) => m.total >= nguong)) continue
    const truocChuoi = co[L]
    if (truocChuoi !== undefined && truocChuoi.total >= nguong) continue
    const dauChuoi = co[L - 1]
    const avg = co.slice(0, L).reduce((s, m) => s + m.total, 0) / L
    return {
      fromKey: dauChuoi.key,
      pct: (avg / median - 1) * 100,
      monthsAgo: perMonth.indexOf(dauChuoi) + 1,
    }
  }
  return null
}
