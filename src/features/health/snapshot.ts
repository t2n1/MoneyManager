// Gom dữ liệu thô (số dư, nợ, giao dịch 12 tháng) thành một "ảnh chụp" các con
// số nền cho trang Sức khỏe tài chính. Thuần, không phụ thuộc React.
// Mọi số tiền đã quy đổi về BASE currency (minor units).

import { monthKeyForDate, type MonthKey } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type {
  AccountBalanceRow,
  AccountType,
  CategoryRow,
  DebtPaymentRow,
  DebtRow,
  TransactionRow,
} from '../../types/database.types'
import { remainingOf } from '../debts/aggregate'
import { expenseSign, type CurrencyOf } from '../reports/aggregate'

/** Tài sản "lỏng" = rút ra tiêu được ngay. Đầu tư (phải bán) và tài sản cố định KHÔNG tính. */
export const LIQUID_TYPES: AccountType[] = ['cash', 'bank', 'ic', 'ewallet']

export interface HealthSnapshot {
  /** tiền mặt + ngân hàng + IC + ví điện tử, quy đổi base */
  liquidAssets: number
  /** dư nợ thẻ tín dụng (số dương) */
  cardDebt: number
  /** tổng mình đang nợ (thẻ + khoản vay) */
  totalDebt: number
  /** phần nợ phải trả trong 12 tháng tới */
  debtDueWithin12m: number
  /** chi cố định trung bình mỗi tháng (theo cost_type = 'fixed') */
  monthlyFixedExpense: number
  /** tổng chi trung bình mỗi tháng */
  monthlyExpense: number
  /** thu nhập trung bình mỗi tháng */
  monthlyIncome: number
  /** tổng thu nhập cả kỳ (12 tháng) */
  annualIncome: number
  /** tiền trả nợ trung bình mỗi tháng */
  monthlyDebtPayment: number
  /** dòng tiền ròng từng tháng đã hoàn tất (đầu vào cho Monte Carlo) */
  netFlows: number[]
  /** thu nhập theo danh mục (cho chỉ số tập trung thu nhập) */
  incomeSlices: { key: string; amount: number }[]
  /** tổng thuế + bảo hiểm xã hội đã nộp trong kỳ (nhóm danh mục Thuế & An sinh) */
  taxAndSocial: number
  /** số tháng ĐÃ HOÀN TẤT có trong kỳ — mẫu số của mọi số "trung bình tháng" */
  monthsCounted: number
  /** true = có danh mục chi chưa gán cost_type → chi cố định có thể thiếu */
  hasUnclassifiedExpense: boolean
  /** thiếu tỷ giá ở đâu đó → các số là ước lượng thiếu */
  hasMissingRate: boolean
}

export interface SnapshotInput {
  balances: AccountBalanceRow[]
  debts: DebtRow[]
  debtPayments: DebtPaymentRow[]
  /** giao dịch trong toàn bộ kỳ xét (thường 12 tháng gần nhất) */
  txs: TransactionRow[]
  categories: CategoryRow[]
  /** các tháng ĐÃ HOÀN TẤT trong kỳ, cũ → mới (không gồm tháng đang chạy dở) */
  months: MonthKey[]
  monthStartDay: number
  currencyOf: CurrencyOf
  base: CurrencyCode
  rates: Rates
  /** hôm nay (ISO) — để biết khoản nợ nào đến hạn trong 12 tháng tới */
  today: string
  /** id danh mục thuộc nhóm Thuế & An sinh; bỏ trống = không tách khoản này */
  taxCategoryIds?: Set<string>
}

const monthId = (k: MonthKey) => `${k.year}-${k.month}`

/** Ngày ISO cộng thêm n tháng (dùng để chốt mốc "12 tháng tới"). */
function addMonthsISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + n, d))
  return dt.toISOString().slice(0, 10)
}

export function buildHealthSnapshot(input: SnapshotInput): HealthSnapshot {
  const { balances, debts, debtPayments, txs, categories, months, monthStartDay } = input
  const { currencyOf, base, rates, today } = input
  let hasMissingRate = false

  // --- Bảng cân đối: tài sản lỏng & công nợ ---
  let liquidAssets = 0
  let cardDebt = 0
  for (const b of balances) {
    if (b.is_archived || b.is_hidden || !b.include_in_totals) continue
    if (b.type === 'card') {
      // Số dư thẻ âm = đang nợ; dương (trả dư) không tính là tài sản lỏng.
      if (b.balance >= 0) continue
      const v = convertToBase(-b.balance, b.currency, base, rates)
      if (v === null) hasMissingRate = true
      else cardDebt += v
      continue
    }
    if (!LIQUID_TYPES.includes(b.type)) continue
    const v = convertToBase(b.balance, b.currency, base, rates)
    if (v === null) hasMissingRate = true
    else liquidAssets += v
  }

  // Nợ vay: chỉ khoản đang mở và còn dư. Nợ đến hạn > 12 tháng nữa không tính
  // vào ngắn hạn; nợ KHÔNG ghi hạn coi như ngắn hạn (có thể bị đòi bất cứ lúc nào).
  const horizon = addMonthsISO(today, 12)
  let loanDebt = 0
  let loanDueSoon = 0
  for (const d of debts) {
    if (d.status !== 'open' || d.direction !== 'i_owe') continue
    const remaining = remainingOf(d, debtPayments)
    if (remaining <= 0) continue
    const v = convertToBase(remaining, d.currency, base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    loanDebt += v
    if (!d.due_on || d.due_on <= horizon) loanDueSoon += v
  }

  // --- Dòng tiền theo tháng ---
  const monthIds = new Set(months.map(monthId))
  const income = new Map<string, number>()
  const expense = new Map<string, number>()
  const fixedExpense = new Map<string, number>()
  const incomeByCategory = new Map<string, number>()
  const costTypeOf = new Map(categories.map((c) => [c.id, c.cost_type]))
  const taxIds = input.taxCategoryIds ?? new Set<string>()
  let taxAndSocial = 0
  let hasUnclassifiedExpense = false

  for (const t of txs) {
    if (t.type === 'transfer' || t.is_debt_flow || t.exclude_from_stats) continue
    const id = monthId(monthKeyForDate(t.occurred_on, monthStartDay))
    if (!monthIds.has(id)) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    if (t.type === 'income') {
      income.set(id, (income.get(id) ?? 0) + v)
      const key = t.category_id ?? 'khac'
      incomeByCategory.set(key, (incomeByCategory.get(key) ?? 0) + v)
      continue
    }
    // Chi: hoàn tiền mang dấu âm để không thổi phồng mức chi
    const signed = v * expenseSign(t)
    expense.set(id, (expense.get(id) ?? 0) + signed)
    const cost = t.category_id ? costTypeOf.get(t.category_id) : null
    if (cost === 'fixed') fixedExpense.set(id, (fixedExpense.get(id) ?? 0) + signed)
    else if (!cost) hasUnclassifiedExpense = true
    if (t.category_id && taxIds.has(t.category_id)) taxAndSocial += signed
  }

  // --- Tiền trả nợ mỗi tháng (chỉ lần trả DƯƠNG; lần âm là giải ngân thêm) ---
  const currencyOfDebt = new Map(debts.map((d) => [d.id, d.currency]))
  let debtPaid = 0
  for (const p of debtPayments) {
    if (p.amount <= 0) continue
    const id = monthId(monthKeyForDate(p.paid_on, monthStartDay))
    if (!monthIds.has(id)) continue
    const cur = currencyOfDebt.get(p.debt_id)
    if (!cur) continue
    const v = convertToBase(p.amount, cur, base, rates)
    if (v === null) hasMissingRate = true
    else debtPaid += v
  }

  const monthsCounted = months.length
  const netFlows = months.map((k) => {
    const id = monthId(k)
    return (income.get(id) ?? 0) - (expense.get(id) ?? 0)
  })
  const sum = (m: Map<string, number>) => [...m.values()].reduce((s, x) => s + x, 0)
  const avg = (total: number) => (monthsCounted > 0 ? total / monthsCounted : 0)
  const annualIncome = sum(income)

  return {
    liquidAssets,
    cardDebt,
    totalDebt: cardDebt + loanDebt,
    debtDueWithin12m: cardDebt + loanDueSoon,
    monthlyFixedExpense: avg(sum(fixedExpense)),
    monthlyExpense: avg(sum(expense)),
    monthlyIncome: avg(annualIncome),
    annualIncome,
    monthlyDebtPayment: avg(debtPaid),
    netFlows,
    incomeSlices: [...incomeByCategory.entries()].map(([key, amount]) => ({ key, amount })),
    taxAndSocial,
    monthsCounted,
    hasUnclassifiedExpense,
    hasMissingRate,
  }
}
