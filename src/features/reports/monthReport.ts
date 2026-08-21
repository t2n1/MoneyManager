// Phép tính cho tab "Tháng này" bản 26a — thuần, không phụ thuộc React, unit-test được.
//
// Bản trước có 18 thẻ cho 6 câu trả lời: chi theo danh mục xuất hiện BA lần, tỷ lệ giữ
// lại BỐN lần, sáu tháng gần nhất vẽ hai biểu đồ cùng một bộ số. 26a rút còn 9 thẻ trong
// 5 khối đánh số, mỗi khối trả đúng một câu. File này chứa những phép tính mà bản trước
// KHÔNG có — phần còn lại vẫn dùng aggregate.ts / insights.ts / behavior.ts như cũ.

import { addDaysISO, daysBetween, monthKeyForDate, type MonthKey } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import { applyTx } from '../assets/accountRowStats'
import { expenseSign, type CurrencyOf, type TransferIds } from './aggregate'

// ---------------------------------------------------------------------------------
// Khối 01 · Ra theo ba đường
// ---------------------------------------------------------------------------------

export interface OutflowTier {
  key: 'expense' | 'transfer' | 'kept'
  label: string
  /** Ghi chú sau nhãn; '' = không có. */
  note: string
  amount: number
  /** Phần trăm trên THU. null khi thu ≤ 0 — chia cho 0 thì thà không nói. */
  pct: number | null
}

/**
 * Thu chia làm ba đường: chi tiêu · chuyển tài sản · phần để lại.
 *
 * Vì sao ba tầng chứ không hai: xếp "gửi về VN" vào chi làm tỷ lệ giữ lại đọc ra 38% thay
 * vì 46%; ẩn nó đi thì thu − chi không khớp với biến động số dư và ¥30,000 biến mất khỏi
 * màn hình. Ba tầng cộng lại ĐÚNG bằng thu, và đó là ràng buộc phải giữ.
 *
 * `kept` có thể ÂM (chi vượt thu) — không kẹp về 0, vì đó là chuyện thật và kẹp lại là
 * xoá đúng cái tin cần biết.
 */
export function outflowTiers(
  income: number,
  expense: number,
  transfer: number,
  categoryCount: number,
): OutflowTier[] {
  const kept = income - expense - transfer
  const pct = (v: number) => (income > 0 ? Math.round((v / income) * 100) : null)
  return [
    {
      key: 'expense',
      label: 'Chi tiêu',
      note: categoryCount > 0 ? `${categoryCount} danh mục` : '',
      amount: expense,
      pct: pct(expense),
    },
    {
      key: 'transfer',
      label: 'Chuyển tài sản',
      note: 'không phải chi tiêu',
      amount: transfer,
      pct: pct(transfer),
    },
    { key: 'kept', label: 'Phần để lại', note: '', amount: kept, pct: pct(kept) },
  ]
}

// ---------------------------------------------------------------------------------
// Khối 03 · So cùng số ngày, bảng đối chiếu trực tiếp
// ---------------------------------------------------------------------------------

export interface SpendShape {
  /** Tổng chi trong cửa sổ. */
  total: number
  /** Phần chi BIẾN ĐỔI (cost_type = 'variable'). */
  variable: number
  /** Số lần chi (mỗi giao dịch một lần; hoàn tiền không đếm là một lần chi). */
  count: number
  /** Trung vị mỗi lần chi. 0 lần → null. */
  median: number | null
}

/** Trung vị của một dãy ĐÃ sắp tăng dần. Dãy rỗng → null. */
function medianOfSorted(xs: number[]): number | null {
  if (xs.length === 0) return null
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 === 1 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2)
}

/**
 * Hình dạng chi tiêu của một cửa sổ ngày `[startISO, lastISO]` (gồm cả hai đầu).
 *
 * Bốn con số này là nội dung bảng "18 ngày đầu tháng · so trực tiếp": tổng chi một mình
 * không nói được "nhiều lần hơn nhưng mỗi lần nhỏ hơn", mà đó lại là kết luận đáng nhớ
 * nhất của tháng.
 */
export function spendShape(
  txs: readonly TransactionRow[],
  startISO: string,
  lastISO: string,
  isVariable: (categoryId: string | null) => boolean,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  transferIds: TransferIds,
): SpendShape {
  let total = 0
  let variable = 0
  const amounts: number[] = []
  for (const t of txs) {
    if (t.type !== 'expense' || t.is_debt_flow || t.exclude_from_stats) continue
    if (t.category_id !== null && transferIds.has(t.category_id)) continue
    if (t.occurred_on < startISO || t.occurred_on > lastISO) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) continue
    total += v * expenseSign(t)
    if (isVariable(t.category_id)) variable += v * expenseSign(t)
    // Hoàn tiền KHÔNG đếm là "một lần chi": nó là lần chi cũ bị huỷ, và đếm nó vào làm
    // "số lần chi" tăng đúng lúc tiền quay về ví — hai câu trái nhau.
    if (!t.is_refund) amounts.push(v)
  }
  amounts.sort((a, b) => a - b)
  return { total, variable, count: amounts.length, median: medianOfSorted(amounts) }
}

// ---------------------------------------------------------------------------------
// Khối 04 · Phần không tiêu đã đi đâu
// ---------------------------------------------------------------------------------

export interface KeptDestination {
  accountId: string
  /** Đổi bao nhiêu trong kỳ, ĐƠN VỊ GỐC của tài khoản (không quy đổi). */
  delta: number
  currency: CurrencyCode
  /** Quy đổi về base; null = thiếu tỷ giá. */
  deltaBase: number | null
  /**
   * Phần trăm trên tổng phần TĂNG (chỉ các tài khoản TĂNG và có tính-vào-tổng).
   * null khi tổng ≤ 0, khi dòng này giảm, hoặc khi tài khoản đứng ngoài tổng.
   */
  pct: number | null
  includeInTotals: boolean
}

export interface KeptDestinations {
  rows: KeptDestination[]
  /** Tổng phần TĂNG quy đổi base, KHÔNG gồm tài khoản ngoài tổng — mẫu số của `pct`. */
  totalGrowth: number
  hasMissingRate: boolean
}

/**
 * Số dư từng tài khoản tăng/giảm bao nhiêu trong kỳ.
 *
 * Vì sao khối này cần thiết: "giữ lại 46%" không nói tiền đang ở ĐÂU. Giữ lại ¥187,015 mà
 * ¥91,015 vẫn nằm ở tài khoản tiêu dùng thì tháng sau nó nằm cùng chỗ với tiền tiêu — đó
 * là lý do một tab nói "tháng tốt nhất" và một tab nói "rủi ro thanh khoản" cùng lúc, và
 * cả hai đều đúng.
 *
 * Dùng `applyTx` của accountRowStats (bản chép đúng năm nhánh của view `account_balances`)
 * nên chiều dấu của từng loại giao dịch ở đây không tự đặt lại lần nữa.
 *
 * ---- CÙNG RỔ GIAO DỊCH VỚI KHỐI 01, và cái giá của nó -----------------------------
 *
 * Lọc `is_debt_flow` + `exclude_from_stats`, ĐÚNG như `sumIncomeExpense` (aggregate.ts) và
 * `sumInBase` (ledgerShared.ts). Bản đầu không lọc, lấy lý do "để khớp cột số dư ở màn Tài
 * sản" — và đó là chỗ nó sai: khối 01 nói phần để lại ¥385.000, bảng này cộng ra
 * ¥1.996.218, mà dòng to nhất của bảng lại là một BÚT TOÁN ĐIỀU CHỈNH SỐ DƯ ¥1.661.218,
 * tức đúng cái KHÔNG phải "tiền không tiêu đã đi đâu". Bút toán điều chỉnh là sai số theo
 * dõi được ghi nhận, không phải tiền vào; dòng tiền nợ/cho vay là tiền của người khác đi
 * qua ví. Cả hai làm mẫu số phần trăm phồng lên và bóp mọi dòng thật.
 *
 * Cái giá: các dòng ở đây KHÔNG còn cộng đúng bằng Δ của cột số dư màn Tài sản khi kỳ có
 * bút toán điều chỉnh. Đổi một lời hứa lấy một lời hứa, và lời hứa giữ lại là cái khối này
 * tồn tại để nói: **tổng RÒNG mọi dòng = phần để lại của khối 01** (chuyển khoản nội bộ
 * triệt tiêu nên vẫn được tính — nó cho biết tiền đang ở đâu mà không đổi tổng). Phép thử
 * giữ ràng buộc: monthReport.test.ts "tổng ròng mọi dòng = phần để lại của khối 01".
 *
 * In ĐƠN VỊ GỐC: một dòng "+₫4,590,000" nói đúng cái đã xảy ra; quy đổi ra "≈ ¥30,000"
 * rồi in cạnh các dòng ¥ khác là trộn hai loại chính xác vào một cột.
 */
export function keptDestinations(
  txs: readonly TransactionRow[],
  accounts: readonly { id: string; currency: CurrencyCode; include_in_totals?: boolean }[],
  startISO: string,
  lastISO: string,
  base: CurrencyCode,
  rates: Rates,
): KeptDestinations {
  const inWindow = txs.filter(
    (t) =>
      t.occurred_on >= startISO &&
      t.occurred_on <= lastISO &&
      !t.is_debt_flow &&
      !t.exclude_from_stats,
  )
  const rows: KeptDestination[] = []
  let totalGrowth = 0
  let hasMissingRate = false

  for (const a of accounts) {
    let delta = 0
    for (const t of inWindow) delta += applyTx(t, a.id)
    if (delta === 0) continue
    const includeInTotals = a.include_in_totals !== false
    const deltaBase = convertToBase(delta, a.currency, base, rates)
    if (deltaBase === null) hasMissingRate = true
    // Tài khoản ĐỨNG NGOÀI TỔNG đứng ngoài mọi tổng — cùng luật với `assetBreakdown`. Cho
    // nó vào mẫu số thì một dòng vừa in nhãn "ngoài tổng" vừa chiếm 23% của tổng, và nó
    // bóp phần trăm của mọi dòng còn lại (đo được: 41% đọc thành 31%).
    else if (deltaBase > 0 && includeInTotals) totalGrowth += deltaBase
    rows.push({
      accountId: a.id,
      delta,
      currency: a.currency,
      deltaBase,
      pct: null,
      includeInTotals,
    })
  }

  for (const r of rows) {
    r.pct =
      totalGrowth > 0 && r.includeInTotals && r.deltaBase !== null && r.deltaBase > 0
        ? Math.round((r.deltaBase / totalGrowth) * 100)
        : null
  }
  // Tăng nhiều nhất lên đầu; các dòng GIẢM xuống cuối (chúng là thông tin khác loại).
  rows.sort((a, b) => (b.deltaBase ?? 0) - (a.deltaBase ?? 0))
  return { rows, totalGrowth, hasMissingRate }
}

// ---------------------------------------------------------------------------------
// Khối 04 · Mấy ngày còn lại của kỳ
// ---------------------------------------------------------------------------------

export interface RemainingPlan {
  daysLeft: number
  /** Ngày cuối kỳ (ISO) — trong app này cũng là ngày lương. */
  lastISO: string
  /** Khoản định kỳ trong kỳ mà CHƯA bị trừ. */
  committed: number
  /** Nhịp chi mỗi ngày suy từ phần đã trôi. */
  dailyPace: number
  /** dailyPace × daysLeft. */
  expected: number
  /**
   * Tiền còn tự do = (thu − chi tới giờ) − cam kết − nhịp dự kiến.
   * Có thể ÂM: nghĩa là theo nhịp này thì kỳ sẽ hụt.
   */
  free: number
}

/**
 * Kế hoạch cho phần còn lại của kỳ.
 *
 * `spentSoFar` / `incomeSoFar` là số ĐÃ xảy ra; `committed` là khoản định kỳ đã biết mà
 * chưa bị trừ. Trả null khi kỳ đã xong — "còn tự do bao nhiêu" của một kỳ đã kết thúc là
 * một câu không có nghĩa.
 */
export function remainingPlan(input: {
  incomeSoFar: number
  spentSoFar: number
  committed: number
  daysElapsed: number
  daysInPeriod: number
  periodStartISO: string
}): RemainingPlan | null {
  const { incomeSoFar, spentSoFar, committed, daysElapsed, daysInPeriod, periodStartISO } = input
  const daysLeft = daysInPeriod - daysElapsed
  if (daysLeft <= 0 || daysElapsed <= 0) return null
  const dailyPace = Math.round(spentSoFar / daysElapsed)
  const expected = dailyPace * daysLeft
  return {
    daysLeft,
    lastISO: addDaysISO(periodStartISO, daysInPeriod - 1),
    committed,
    dailyPace,
    expected,
    free: incomeSoFar - spentSoFar - committed - expected,
  }
}

// ---------------------------------------------------------------------------------
// Khối 02 · Bảng danh mục — sắp xếp
// ---------------------------------------------------------------------------------

export type MonthTableSort = 'amount' | 'delta' | 'name'

export interface MonthTableRow {
  categoryId: string
  name: string
  icon: string
  thisMonth: number
  /** Phần trăm trên tổng chi của kỳ. */
  pct: number
  avg3: number
  deltaPct: number | null
  isNew: boolean
  /** Chi 6 tháng gần nhất, cũ → mới, cho đường tí hon. */
  spark: number[]
  /** Hạn mức của danh mục; null = chưa đặt. */
  budgeted: number | null
  /** Danh mục cố định (cost_type = 'fixed') — cột Hạn mức ghi "cố định" thay vì %. */
  fixed: boolean
}

/**
 * Sắp bảng danh mục. Mặc định theo TIỀN giảm dần, không theo Δ: mở bảng ra thì câu đầu
 * tiên cần trả lời là "tiền đi đâu nhiều nhất", còn "đổi nhiều nhất" là câu thứ hai.
 *
 * `delta` đẩy dòng KHÔNG so được (danh mục mới, tháng trước = 0) xuống cuối chứ không coi
 * chúng là 0: một danh mục mới không "đi ngang", nó chỉ chưa có mốc để so.
 */
export function sortMonthTable(
  rows: readonly MonthTableRow[],
  sort: MonthTableSort,
): MonthTableRow[] {
  const out = [...rows]
  if (sort === 'name') return out.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  if (sort === 'amount') return out.sort((a, b) => b.thisMonth - a.thisMonth)
  return out.sort((a, b) => {
    if (a.deltaPct === null && b.deltaPct === null) return b.thisMonth - a.thisMonth
    if (a.deltaPct === null) return 1
    if (b.deltaPct === null) return -1
    return b.deltaPct - a.deltaPct
  })
}

/**
 * Bao nhiêu danh mục ĐẦU BẢNG gộp lại vượt `share` phần tổng chi, và chúng chiếm đúng
 * bao nhiêu phần trăm.
 *
 * Thay hẳn thẻ "Ít danh mục, nhiều tiền" của bản trước: nó vẽ lại chính mấy dòng đầu của
 * bảng này ở một thẻ riêng cách đó nửa màn hình. Ở đây nó là MỘT DÒNG trong tiêu đề bảng.
 */
export function concentration(
  rows: readonly MonthTableRow[],
  share = 0.8,
): { count: number; pct: number } | null {
  const total = rows.reduce((s, r) => s + Math.max(r.thisMonth, 0), 0)
  if (total <= 0) return null
  const sorted = [...rows].sort((a, b) => b.thisMonth - a.thisMonth)
  let acc = 0
  for (let i = 0; i < sorted.length; i++) {
    acc += Math.max(sorted[i].thisMonth, 0)
    if (acc / total >= share) return { count: i + 1, pct: Math.round((acc / total) * 100) }
  }
  return { count: sorted.length, pct: 100 }
}

/** Nhãn cột Hạn mức. Cùng quy ước với `restLabel` của BudgetView — đúng bằng trần ≠ vượt. */
export function budgetCellLabel(row: Pick<MonthTableRow, 'budgeted' | 'thisMonth' | 'fixed'>): {
  text: string
  tone: 'over' | 'warn' | 'ok' | 'muted'
} {
  if (row.fixed) return { text: 'cố định', tone: 'muted' }
  if (row.budgeted === null || row.budgeted <= 0) return { text: '—', tone: 'muted' }
  const ratio = row.thisMonth / row.budgeted
  const pct = Math.round(ratio * 100)
  if (pct === 100) return { text: 'vừa hết', tone: 'warn' }
  return { text: `${pct}%`, tone: ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok' }
}

/** Số ngày của một cửa sổ ISO gồm cả hai đầu. */
export const windowDays = (startISO: string, lastISO: string) =>
  daysBetween(startISO, lastISO) + 1

/** Nhãn kỳ ngắn cho tiêu đề bảng: "Tháng 8". */
export const monthWordLabel = (k: MonthKey) => `Tháng ${k.month}`

// ---------------------------------------------------------------------------------
// Khối 02 · Đường tí hon từng danh mục
// ---------------------------------------------------------------------------------

/**
 * Chi theo tháng của TỪNG danh mục trong `ids` — một Map, mỗi giá trị là một dãy dài
 * bằng `months`, cũ → mới.
 *
 * Vì sao không dùng `categoryMonthlySeries` của aggregate.ts: hàm đó gộp CẢ TẬP ids thành
 * MỘT dãy (nó vẽ đường xu hướng của một danh mục và các con của nó). Gọi nó 12 lần cho 12
 * danh mục là quét lại toàn bộ giao dịch 12 lượt; ở đây quét một lượt.
 */
export function categorySparks(
  txs: readonly TransactionRow[],
  months: readonly MonthKey[],
  monthStartDay: number,
  ids: ReadonlySet<string>,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  transferIds: TransferIds,
): Map<string, number[]> {
  const index = new Map<string, number>()
  months.forEach((m, i) => index.set(`${m.year}-${m.month}`, i))

  const out = new Map<string, number[]>()
  for (const t of txs) {
    if (t.type !== 'expense' || !t.category_id || t.is_debt_flow || t.exclude_from_stats) continue
    if (!ids.has(t.category_id)) continue
    if (transferIds.has(t.category_id)) continue
    const i = index.get(monthIdOf(t.occurred_on, monthStartDay))
    if (i === undefined) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) continue
    const arr = out.get(t.category_id) ?? Array<number>(months.length).fill(0)
    arr[i] += v * expenseSign(t)
    out.set(t.category_id, arr)
  }
  return out
}

const monthIdOf = (iso: string, monthStartDay: number) => {
  const k = monthKeyForDate(iso, monthStartDay)
  return `${k.year}-${k.month}`
}

// ---------------------------------------------------------------------------------
// Khối 01 · Thu định kỳ vs thu một lần
// ---------------------------------------------------------------------------------

export interface IncomeSplit {
  /** Thu gắn với một quy tắc định kỳ đã khai. */
  recurring: number
  /** Thu không gắn quy tắc nào. */
  oneOff: number
  /** Phần trăm định kỳ trên tổng thu; null khi thu ≤ 0. */
  recurringPct: number | null
  /**
   * Tỷ lệ giữ lại nếu BỎ phần thu một lần ra khỏi mẫu số.
   *
   * Đây là con số đáng biết nhất của khối: giữ lại 46% mà 20% thu là thưởng hè thì tỷ lệ
   * "theo lương định kỳ" chỉ còn 32% — và 32% mới là con số sẽ lặp lại tháng sau.
   * null khi chưa có thu định kỳ nào để chia.
   */
  keptOnRecurringPct: number | null
  /** Không có khoản thu nào gắn quy tắc → khối nên ẨN, vì nó không nói được gì. */
  hasSignal: boolean
}

/**
 * Tách thu thành ĐỊNH KỲ và MỘT LẦN theo `recurring_rule_id`.
 *
 * Bản vẽ 26a đòi cờ này và ghi rõ "không suy từ số tiền". Cờ dùng ở đây là liên kết tới
 * một quy tắc định kỳ mà chính người dùng đã khai — cột `transactions.recurring_rule_id`
 * (migration 0008), được EntryPage ghi khi form mở từ `?rule=`.
 *
 * GIỚI HẠN, và chỗ hiển thị phải nói ra: lương ghi TAY (không qua lời nhắc định kỳ) sẽ nằm
 * ở cột "một lần". Thà thiếu như vậy còn hơn đoán theo số tiền — đoán sẽ sai đúng vào tháng
 * có lương tháng 13, tức đúng tháng con số này quan trọng nhất.
 */
export function incomeSplit(
  txs: readonly TransactionRow[],
  expense: number,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): IncomeSplit {
  let recurring = 0
  let oneOff = 0
  for (const t of txs) {
    if (t.type !== 'income' || t.is_debt_flow || t.exclude_from_stats) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) continue
    if (t.recurring_rule_id !== null) recurring += v
    else oneOff += v
  }
  const total = recurring + oneOff
  return {
    recurring,
    oneOff,
    recurringPct: total > 0 ? Math.round((recurring / total) * 100) : null,
    keptOnRecurringPct:
      recurring > 0 ? Math.round(((recurring - expense) / recurring) * 100) : null,
    hasSignal: recurring > 0,
  }
}
