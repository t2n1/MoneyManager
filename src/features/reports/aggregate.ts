// Tổng hợp số liệu cho báo cáo — thuần, không phụ thuộc React, để unit-test được.
// Mọi số tiền quy đổi về base currency qua convertToBase; thiếu tỷ giá → hasMissingRate.

import {
  addDaysISO,
  addMonths,
  daysBetween,
  getMonthRange,
  monthKeyForDate,
  type MonthKey,
} from '../../lib/dates'
import { periodCompare, type PeriodCompare } from './periodCompare'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { CategoryRow, NeedLevel, TransactionRow } from '../../types/database.types'
import { NO_TRANSFER_CATEGORIES } from '../categories/kind'

export type CurrencyOf = (accountId: string) => CurrencyCode

/**
 * Id của những danh mục `kind = 'transfer'` — CHUYỂN TÀI SẢN, không phải tiêu.
 *
 * Vì sao mọi hàm ở file này đều nhận nó: "Gửi tiền về VN" ¥30,000 là tiền vẫn của mình,
 * chỉ đứng ở tài khoản khác. Xếp vào chi thì tỷ lệ giữ lại đọc ra 38% thay vì 46%, và
 * mọi tỷ trọng danh mục bị phồng mẫu số.
 *
 * Mặc định TẬP RỖNG = hành vi cũ, để mọi test hiện có vẫn đúng. Nhưng mọi màn trong
 * `src/features/**` PHẢI truyền vào — hai màn truyền khác nhau thì chi tháng 8 ra hai
 * con số, đúng cái lỗi cột `kind` được thêm để chấm dứt. `tests/categoryKind.test.ts`
 * canh chỗ này.
 */
export type TransferIds = ReadonlySet<string>

/** Giao dịch này là chuyển tài sản (theo danh mục của nó) chứ không phải chi tiêu? */
const isTransfer = (t: Pick<TransactionRow, 'category_id'>, ids: TransferIds): boolean =>
  t.category_id !== null && ids.has(t.category_id)

/**
 * Dấu của một giao dịch CHI: hoàn tiền (trả hàng, hủy vé) là chi ÂM — tiền quay
 * về ví nhưng không phải thu nhập, nên phải trừ khỏi chi của chính danh mục đó
 * thay vì cộng vào thu. Mọi nơi cộng chi đều phải nhân với hệ số này.
 */
export const expenseSign = (t: Pick<TransactionRow, 'is_refund'>): 1 | -1 =>
  t.is_refund ? -1 : 1

export interface CategorySlice {
  categoryId: string
  /** minor units theo base currency */
  amount: number
}

export interface Breakdown {
  slices: CategorySlice[]
  total: number
  hasForeign: boolean
  hasMissingRate: boolean
}

/** Tổng thu (hoặc chi) theo danh mục, đã quy đổi base, sắp xếp giảm dần. */
export function categoryBreakdown(
  txs: TransactionRow[],
  kind: 'expense' | 'income',
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  transferIds: TransferIds = NO_TRANSFER_CATEGORIES,
): Breakdown {
  const map = new Map<string, number>()
  let total = 0
  let hasForeign = false
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type !== kind || !t.category_id || t.is_debt_flow || t.exclude_from_stats) continue
    // Danh mục chuyển tài sản không phải một lát của cơ cấu CHI: để nó trong đây thì
    // "Gửi về VN" thành một lát bánh cạnh Ăn uống, và mẫu số phồng lên làm mọi tỷ trọng
    // khác nhỏ đi (đo được: Tiền nhà 51% → 45%). Bên `income` không cần lọc — cột `kind`
    // chỉ đặt trên danh mục Chi.
    if (kind === 'expense' && isTransfer(t, transferIds)) continue
    const cur = currencyOf(t.account_id)
    if (cur !== base) hasForeign = true
    const raw = convertToBase(t.amount, cur, base, rates)
    if (raw === null) {
      hasMissingRate = true
      continue
    }
    const v = kind === 'expense' ? raw * expenseSign(t) : raw
    map.set(t.category_id, (map.get(t.category_id) ?? 0) + v)
    total += v
  }
  // Hoàn tiền có thể kéo một danh mục xuống ≤ 0 (trả lại nhiều hơn đã mua trong
  // kỳ) — bỏ khỏi cơ cấu vì không vẽ được lát bánh âm.
  const slices = [...map.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .filter((s) => s.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  return { slices, total, hasForeign, hasMissingRate }
}

export interface ParentGroup {
  parentId: string
  /** base minor: trực tiếp + tổng con */
  total: number
  /** base minor: giao dịch gán thẳng vào cha (>= 0) */
  direct: number
  /** con có số tiền > 0, xếp giảm dần */
  children: CategorySlice[]
}

/**
 * Gom slices phẳng thành nhóm theo cha (1 cấp).
 * - Con (parent_id != null) cộng vào children của cha.
 * - Cha (parent_id == null) hoặc danh mục mồ côi (không có trong categories)
 *   → cộng vào `direct` của chính nó, coi là một cha đứng riêng.
 * Cha xếp theo total giảm dần; con xếp theo amount giảm dần; bỏ cha total = 0.
 */
export function groupByParent(slices: CategorySlice[], categories: CategoryRow[]): ParentGroup[] {
  const catById = new Map(categories.map((c) => [c.id, c]))
  const groups = new Map<string, ParentGroup>()
  const ensure = (parentId: string): ParentGroup => {
    let g = groups.get(parentId)
    if (!g) {
      g = { parentId, total: 0, direct: 0, children: [] }
      groups.set(parentId, g)
    }
    return g
  }
  for (const s of slices) {
    const cat = catById.get(s.categoryId)
    if (cat && cat.parent_id) {
      const g = ensure(cat.parent_id)
      g.children.push({ categoryId: s.categoryId, amount: s.amount })
      g.total += s.amount
    } else {
      const g = ensure(s.categoryId)
      g.direct += s.amount
      g.total += s.amount
    }
  }
  const result = [...groups.values()].filter((g) => g.total > 0)
  for (const g of result) g.children.sort((a, b) => b.amount - a.amount)
  result.sort((a, b) => b.total - a.total)
  return result
}

export interface MonthlyPoint {
  key: MonthKey
  income: number
  /** CHI THẬT — danh mục `kind = 'transfer'` không nằm trong đây. */
  expense: number
  /** Chuyển tài sản của tháng (gửi về VN…). Tầng riêng, xem `IncomeExpenseSum.transfer`. */
  transfer: number
}

export interface MonthlySeries {
  points: MonthlyPoint[]
  hasMissingRate: boolean
}

// export cho ngayDiVang.ts: tập "tháng có chuyến đi" phải dùng ĐÚNG định dạng khoá này —
// hai nơi tự chế hai định dạng ('2026-2' vs '2026-02') là loại lỗi so sánh im lặng.
export const monthId = (k: MonthKey) => `${k.year}-${k.month}`

/**
 * Chuỗi thu/chi theo từng tháng trong danh sách `months` (đã quy đổi base).
 * Chuyển khoản KHÔNG tính (quyết định thiết kế #2).
 */
export function monthlySeries(
  txs: TransactionRow[],
  months: MonthKey[],
  monthStartDay: number,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  transferIds: TransferIds = NO_TRANSFER_CATEGORIES,
): MonthlySeries {
  const income = new Map<string, number>()
  const expense = new Map<string, number>()
  const transfer = new Map<string, number>()
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type === 'transfer' || t.is_debt_flow || t.exclude_from_stats) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    const id = monthId(monthKeyForDate(t.occurred_on, monthStartDay))
    if (t.type === 'income') income.set(id, (income.get(id) ?? 0) + v)
    else if (isTransfer(t, transferIds))
      transfer.set(id, (transfer.get(id) ?? 0) + v * expenseSign(t))
    else expense.set(id, (expense.get(id) ?? 0) + v * expenseSign(t))
  }
  const points = months.map((key) => ({
    key,
    income: income.get(monthId(key)) ?? 0,
    expense: expense.get(monthId(key)) ?? 0,
    transfer: transfer.get(monthId(key)) ?? 0,
  }))
  return { points, hasMissingRate }
}

export interface NetFlowPoint {
  key: MonthKey
  /** base minor: thu − chi trong tháng, âm là tháng thâm hụt */
  net: number
  /** base minor: net dồn từ tháng đầu chuỗi tới tháng này */
  cumulative: number
}

/**
 * Dòng tiền ròng từng tháng (thu − chi) + đường dồn tích, dẫn xuất từ MonthlySeries
 * nên không cần fetch thêm và thừa hưởng đúng bộ lọc của monthlySeries (bỏ chuyển
 * khoản, dòng tiền nợ/cho vay, giao dịch loại khỏi thống kê).
 */
export function netFlowSeries(series: MonthlySeries): NetFlowPoint[] {
  let cumulative = 0
  return series.points.map((p) => {
    const net = p.income - p.expense
    cumulative += net
    return { key: p.key, net, cumulative }
  })
}

export interface NetFlowSummary {
  /** base minor: tổng ròng cả chuỗi */
  total: number
  /** base minor: ròng trung bình mỗi tháng (làm tròn) */
  avg: number
  negativeMonths: number
  /** tháng ròng thấp nhất; null nếu chuỗi rỗng */
  worst: NetFlowPoint | null
}

/** Vài số tổng kết cho thẻ dòng tiền ròng. Chuỗi rỗng → toàn 0, worst null. */
export function netFlowSummary(points: NetFlowPoint[]): NetFlowSummary {
  if (points.length === 0) return { total: 0, avg: 0, negativeMonths: 0, worst: null }
  const total = points[points.length - 1].cumulative
  let worst = points[0]
  let negativeMonths = 0
  for (const p of points) {
    if (p.net < 0) negativeMonths++
    if (p.net < worst.net) worst = p
  }
  return { total, avg: Math.round(total / points.length), negativeMonths, worst }
}

export interface CategoryMonthlyPoint {
  key: MonthKey
  /** base minor */
  amount: number
}

export interface CategoryMonthlySeries {
  points: CategoryMonthlyPoint[]
  hasMissingRate: boolean
}

/**
 * Số tiền (quy đổi base) theo từng tháng trong `months`, chỉ cho giao dịch có
 * category_id thuộc `ids` và type === kind. Dùng vẽ đường xu hướng một danh mục.
 * Bỏ is_debt_flow / exclude_from_stats. Tháng trống = 0.
 */
export function categoryMonthlySeries(
  txs: TransactionRow[],
  months: MonthKey[],
  kind: 'expense' | 'income',
  ids: Set<string>,
  monthStartDay: number,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): CategoryMonthlySeries {
  const byMonth = new Map<string, number>()
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type !== kind || !t.category_id || t.is_debt_flow || t.exclude_from_stats) continue
    if (!ids.has(t.category_id)) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    const id = monthId(monthKeyForDate(t.occurred_on, monthStartDay))
    byMonth.set(id, (byMonth.get(id) ?? 0) + (kind === 'expense' ? v * expenseSign(t) : v))
  }
  const points = months.map((key) => ({ key, amount: byMonth.get(monthId(key)) ?? 0 }))
  return { points, hasMissingRate }
}

export interface IncomeExpenseSum {
  /** minor units theo base currency */
  income: number
  /** CHI THẬT — đã trừ danh mục `kind = 'transfer'`. */
  expense: number
  /**
   * Chuyển tài sản trong kỳ (gửi về VN, điều chỉnh số dư): tiền RỜI ví nhưng vẫn là của
   * mình. Tách ra thành tầng riêng thay vì trộn vào `expense`, và thay vì ẩn đi — ẩn thì
   * thu − chi không khớp với biến động số dư và người đọc không biết ¥30,000 đi đâu.
   */
  transfer: number
  hasForeign: boolean
  hasMissingRate: boolean
}

/**
 * Tổng thu + tổng chi (đã quy đổi base). Chuyển khoản & dòng tiền nợ/cho vay
 * (is_debt_flow) KHÔNG tính. Danh mục `kind = 'transfer'` tách sang `transfer`.
 */
export function sumIncomeExpense(
  txs: TransactionRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  transferIds: TransferIds = NO_TRANSFER_CATEGORIES,
): IncomeExpenseSum {
  let income = 0
  let expense = 0
  let transfer = 0
  let hasForeign = false
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type === 'transfer' || t.is_debt_flow || t.exclude_from_stats) continue
    const cur = currencyOf(t.account_id)
    if (cur !== base) hasForeign = true
    const v = convertToBase(t.amount, cur, base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    if (t.type === 'income') income += v
    else if (isTransfer(t, transferIds)) transfer += v * expenseSign(t)
    else expense += v * expenseSign(t)
  }
  return { income, expense, transfer, hasForeign, hasMissingRate }
}

export interface CategoryComparisonRow {
  categoryId: string
  thisMonth: number // base minor
  prevMonth: number // base minor
  avg3: number // TB tổng chi của M-1, M-2, M-3 (tháng thiếu tính 0)
  deltaPct: number | null // (thisMonth - prevMonth)/prevMonth * 100; null nếu prevMonth = 0
  isNew: boolean // prevMonth = 0 && thisMonth > 0
}

export interface CategoryComparison {
  rows: CategoryComparisonRow[] // sắp theo thisMonth giảm dần
  hasMissingRate: boolean
}

/**
 * So sánh chi theo danh mục: tháng đang xem vs tháng trước vs TB 3 tháng trước.
 * Chỉ tính expense có category_id; ▲▼% so tháng trước; avg3 là cột tham chiếu.
 *
 * `cutoffDay` = số ngày đã trôi của tháng đang xem (1..n), hoặc null khi tháng đã xong.
 * Có giá trị thì MỌI tháng trong bảng đều bị cắt về đúng số ngày đó — nếu không, cột Δ
 * so 18 ngày của tháng này với trọn 31 ngày tháng trước và mọi dòng đều đọc ra "▼",
 * kể cả những dòng đang tiêu nhanh hơn hẳn.
 */
export function categoryComparison(
  txs: TransactionRow[],
  activeMonth: MonthKey,
  monthStartDay: number,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  cutoffDay: number | null = null,
  transferIds: TransferIds = NO_TRANSFER_CATEGORIES,
): CategoryComparison {
  const m0 = monthId(activeMonth)
  const m1 = monthId(addMonths(activeMonth, -1))
  const m2 = monthId(addMonths(activeMonth, -2))
  const m3 = monthId(addMonths(activeMonth, -3))
  // Ngày đầu của mỗi tháng tài chính, để suy ra "giao dịch này là ngày thứ mấy của
  // tháng nó". Cắt theo ngày-trong-tháng-tài-chính, không theo ngày dương lịch: người
  // dùng đặt được `month_start_day`, và tháng bắt đầu ngày 25 thì ngày 26 là ngày thứ 2.
  const startOf = new Map<string, string>()
  for (const k of [activeMonth, addMonths(activeMonth, -1), addMonths(activeMonth, -2), addMonths(activeMonth, -3)]) {
    startOf.set(monthId(k), getMonthRange(k, monthStartDay).start)
  }
  const byCat = new Map<string, Map<string, number>>()
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type !== 'expense' || !t.category_id || t.is_debt_flow || t.exclude_from_stats) continue
    if (isTransfer(t, transferIds)) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    const mid = monthId(monthKeyForDate(t.occurred_on, monthStartDay))
    if (mid !== m0 && mid !== m1 && mid !== m2 && mid !== m3) continue
    if (cutoffDay !== null) {
      const start = startOf.get(mid)
      if (start !== undefined && daysBetween(start, t.occurred_on) + 1 > cutoffDay) continue
    }
    const inner = byCat.get(t.category_id) ?? new Map<string, number>()
    inner.set(mid, (inner.get(mid) ?? 0) + v * expenseSign(t))
    byCat.set(t.category_id, inner)
  }
  const rows: CategoryComparisonRow[] = []
  for (const [categoryId, inner] of byCat) {
    const thisMonth = inner.get(m0) ?? 0
    const prevMonth = inner.get(m1) ?? 0
    const avg3 = Math.round(((inner.get(m1) ?? 0) + (inner.get(m2) ?? 0) + (inner.get(m3) ?? 0)) / 3)
    if (thisMonth === 0 && prevMonth === 0 && avg3 === 0) continue
    const deltaPct = prevMonth > 0 ? Math.round(((thisMonth - prevMonth) / prevMonth) * 100) : null
    const isNew = prevMonth === 0 && thisMonth > 0
    rows.push({ categoryId, thisMonth, prevMonth, avg3, deltaPct, isNew })
  }
  rows.sort((a, b) => b.thisMonth - a.thisMonth)
  return { rows, hasMissingRate }
}

export interface CashflowPoint {
  date: string
  balance: number // base minor, tích lũy
}

export interface CumulativeCashflow {
  points: CashflowPoint[]
  hasMissingRate: boolean
}

/**
 * Số dư chạy theo ngày (thu +, chi −, bắt đầu từ 0) từ startISO tới lastISO (đều gồm).
 * Chuyển khoản & dòng tiền nợ/cho vay (is_debt_flow) KHÔNG tính. Ngày không có giao dịch giữ nguyên số dư.
 */
export function cumulativeDailyBalance(
  txs: TransactionRow[],
  startISO: string,
  lastISO: string,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): CumulativeCashflow {
  const netByDay = new Map<string, number>()
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type === 'transfer' || t.is_debt_flow || t.exclude_from_stats) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    const signed = t.type === 'income' ? v : -v * expenseSign(t)
    netByDay.set(t.occurred_on, (netByDay.get(t.occurred_on) ?? 0) + signed)
  }
  const points: CashflowPoint[] = []
  let balance = 0
  const cur = new Date(startISO + 'T00:00:00Z')
  const last = new Date(lastISO + 'T00:00:00Z')
  while (cur <= last) {
    const iso = cur.toISOString().slice(0, 10)
    balance += netByDay.get(iso) ?? 0
    points.push({ date: iso, balance })
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return { points, hasMissingRate }
}

export interface DailyExpensePoint {
  date: string
  expense: number // base minor, chi trong ngày (>= 0)
}

export interface DailyExpense {
  points: DailyExpensePoint[]
  hasMissingRate: boolean
}

/**
 * Tổng chi theo từng ngày (base minor) từ startISO tới lastISO (đều gồm), 0 cho ngày trống.
 * Chuyển khoản & dòng tiền nợ/cho vay KHÔNG tính. Nền cho heatmap và chi tích lũy vs ngân sách.
 */
export function dailyExpenseTotals(
  txs: TransactionRow[],
  startISO: string,
  lastISO: string,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  transferIds: TransferIds = NO_TRANSFER_CATEGORIES,
): DailyExpense {
  const byDay = new Map<string, number>()
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type !== 'expense' || t.is_debt_flow || t.exclude_from_stats) continue
    if (isTransfer(t, transferIds)) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    byDay.set(t.occurred_on, (byDay.get(t.occurred_on) ?? 0) + v * expenseSign(t))
  }
  const points: DailyExpensePoint[] = []
  const cur = new Date(startISO + 'T00:00:00Z')
  const last = new Date(lastISO + 'T00:00:00Z')
  while (cur <= last) {
    const iso = cur.toISOString().slice(0, 10)
    points.push({ date: iso, expense: byDay.get(iso) ?? 0 })
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return { points, hasMissingRate }
}

export interface ClassificationBreakdown {
  /** chi theo TỪNG nhãn nhu cầu — đủ 5 khoá, nhãn chưa gắn nằm ở needUnclassified */
  needByLevel: Record<NeedLevel, number>
  needUnclassified: number
  costFixed: number
  costVariable: number
  costUnclassified: number
  /** chi vừa flexible vừa variable — "van xả khẩn cấp" */
  emergencyCut: number
  totalExpense: number
}

/** Đủ 5 khoá từ đầu — chỗ đọc không phải `?? 0`, và thiếu nhãn là lỗi biên dịch. */
export const emptyNeedByLevel = (): Record<NeedLevel, number> => ({
  essential: 0, flexible: 0, education: 0, giving: 0, buffer: 0,
})

/**
 * Gom chi theo 2 trục độc lập từ slices (đã quy đổi base).
 * Nhãn đọc trực tiếp từ danh mục của slice; thiếu nhãn → Unclassified.
 */
export function classificationBreakdown(
  slices: CategorySlice[],
  categories: CategoryRow[],
): ClassificationBreakdown {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const r: ClassificationBreakdown = {
    needByLevel: emptyNeedByLevel(), needUnclassified: 0,
    costFixed: 0, costVariable: 0, costUnclassified: 0,
    emergencyCut: 0, totalExpense: 0,
  }
  for (const s of slices) {
    const c = byId.get(s.categoryId)
    const need = c?.need_level ?? null
    const cost = c?.cost_type ?? null
    r.totalExpense += s.amount
    if (need !== null) r.needByLevel[need] += s.amount
    else r.needUnclassified += s.amount
    if (cost === 'fixed') r.costFixed += s.amount
    else if (cost === 'variable') r.costVariable += s.amount
    else r.costUnclassified += s.amount
    if (need === 'flexible' && cost === 'variable') r.emergencyCut += s.amount
  }
  return r
}

/**
 * Gộp phần chi KHÔNG có category_id (vd hàng nhập CSV thiếu danh mục) vào cả 2
 * bucket "Chưa phân loại" của `data`, để tổng mỗi trục khớp `realExpense` (tổng
 * chi thật từ sumIncomeExpense) thay vì chỉ khớp `data.totalExpense` (tổng chi
 * CÓ danh mục — do categoryBreakdown bỏ giao dịch thiếu category_id).
 * `realExpense` nhỏ hơn `data.totalExpense` (không nên xảy ra) → không trừ, giữ nguyên `data`.
 */
export function foldUncategorized(
  data: ClassificationBreakdown,
  realExpense: number,
): ClassificationBreakdown {
  const totalExpense = Math.max(realExpense, data.totalExpense)
  const noCategory = totalExpense - data.totalExpense
  if (noCategory <= 0) return data
  return {
    ...data,
    // Bản sao — classificationBreakdown vừa dựng object này bằng cách cộng dồn tại
    // chỗ, trả alias là mời một chỗ khác sửa lây.
    needByLevel: { ...data.needByLevel },
    needUnclassified: data.needUnclassified + noCategory,
    costUnclassified: data.costUnclassified + noCategory,
    totalExpense,
  }
}

// ---------------------------------------------------------------------------------
// So tháng đang dở với tháng trước — MỘT hàm cho cả Báo cáo lẫn Bản tin
//
// Trước đây hai trang tự lấy `series.points.at(-2).expense` (trọn tháng trước) làm mẫu
// số. Hai trang, một lỗi giống nhau, và nó nằm ở câu đầu tiên của cả hai. Gom về một
// hàm để không còn chỗ nào có thể so lệch kỳ nữa.
// ---------------------------------------------------------------------------------

/**
 * Chi của tháng đang xem vs tháng liền trước, cắt về cùng số ngày.
 *
 * `txs` phải phủ CẢ HAI tháng (tháng đang xem + tháng liền trước). Trang nào chỉ tải
 * một tháng thì truyền dữ liệu nhiều tháng đã có sẵn cho biểu đồ — đừng gọi thêm mạng.
 *
 * `todayISO` quyết định số ngày đã trôi. Tháng đang xem đã kết thúc trước hôm nay thì
 * số ngày đã trôi = trọn tháng, và phép cắt tự thành phép không cắt.
 */
export function monthExpenseCompare(
  txs: TransactionRow[],
  activeMonth: MonthKey,
  monthStartDay: number,
  todayISO: string,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  transferIds: TransferIds = NO_TRANSFER_CATEGORIES,
): PeriodCompare | null {
  const cur = getMonthRange(activeMonth, monthStartDay)
  const prev = getMonthRange(addMonths(activeMonth, -1), monthStartDay)
  const { daysElapsed, daysInPeriod } = monthDaysElapsed(activeMonth, monthStartDay, todayISO)

  // `MonthRange.end` là mốc LOẠI TRỪ (repo truy vấn `.gte(start).lt(end)`), nên ngày
  // cuối thật của kỳ là end − 1. Lấy đúng `end` sẽ nhặt thêm ngày đầu của tháng sau vào
  // tổng của tháng này.
  const dailyOf = (r: { start: string; end: string }) => {
    const lastISO = addDaysISO(r.end, -1)
    return dailyExpenseTotals(
      txs.filter((t) => t.occurred_on >= r.start && t.occurred_on < r.end),
      r.start,
      lastISO,
      currencyOf,
      base,
      rates,
      transferIds,
    ).points.map((p) => p.expense)
  }

  return periodCompare({
    current: dailyOf(cur),
    prior: dailyOf(prev),
    daysElapsed,
    daysInPeriod,
  })
}

/**
 * Số ngày đã trôi của tháng tài chính đang xem (1..n) và tổng số ngày của nó.
 * Tháng đã xong → đã trôi = trọn tháng; tháng chưa bắt đầu → 0.
 *
 * `MonthRange.end` loại trừ, nên tổng số ngày là `daysBetween(start, end)` KHÔNG cộng 1.
 */
export function monthDaysElapsed(
  activeMonth: MonthKey,
  monthStartDay: number,
  todayISO: string,
): { daysElapsed: number; daysInPeriod: number } {
  const cur = getMonthRange(activeMonth, monthStartDay)
  const daysInPeriod = daysBetween(cur.start, cur.end)
  if (todayISO >= cur.end) return { daysElapsed: daysInPeriod, daysInPeriod }
  if (todayISO < cur.start) return { daysElapsed: 0, daysInPeriod }
  return { daysElapsed: daysBetween(cur.start, todayISO) + 1, daysInPeriod }
}
