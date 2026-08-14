// Gom dữ liệu thô (số dư, nợ, giao dịch 12 tháng) thành một "ảnh chụp" các con
// số nền cho trang Sức khỏe tài chính. Thuần, không phụ thuộc React.
// Mọi số tiền đã quy đổi về BASE currency (minor units).

import { addMonthsISO, monthKeyForDate, type MonthKey } from '../../lib/dates'
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
  /** chi LINH HOẠT trung bình mỗi tháng — phần về lý thuyết cắt được khi túng */
  monthlyFlexibleExpense: number
  /** thu nhập trung bình mỗi tháng */
  monthlyIncome: number
  /** tổng thu nhập cả kỳ (12 tháng) */
  annualIncome: number
  /** tiền trả nợ trung bình mỗi tháng */
  monthlyDebtPayment: number
  /** dòng tiền ròng từng tháng đã hoàn tất (đầu vào cho Monte Carlo) */
  netFlows: number[]
  /**
   * Như `netFlows` nhưng đã bỏ hết chi mang need_level='flexible' — kịch bản
   * "thắt lưng buộc bụng". Danh mục CHƯA phân loại vẫn tính là thiết yếu để
   * không hứa hão rằng cắt được thứ mình chưa hề gắn nhãn.
   */
  essentialNetFlows: number[]
  /** thu nhập theo danh mục (cho chỉ số tập trung thu nhập) */
  incomeSlices: { key: string; amount: number }[]
  /**
   * Tổng thuế + bảo hiểm xã hội đã nộp trong kỳ (nhóm danh mục Thuế & An sinh).
   * Đếm CẢ giao dịch mang `exclude_from_stats` — xem ghi chú trong vòng lặp.
   * Cũng chính là "phần bị giữ lại", nên `annualIncome + taxAndSocial` = thu GỘP.
   */
  taxAndSocial: number
  /** số tháng ĐÃ HOÀN TẤT có trong kỳ — mẫu số của mọi số "trung bình tháng" */
  monthsCounted: number
  /** true = có danh mục chi chưa gán cost_type → chi cố định có thể thiếu */
  hasUnclassifiedExpense: boolean
  /** true = có khoản chi chưa gán need_level → kịch bản cắt chi đang bảo thủ */
  hasUnclassifiedNeed: boolean
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
// addMonthsISO: dùng bản chung của lib/dates (kẹp cuối tháng). Bản chép tay cũ ở đây
// dùng Date.UTC nên bị tràn (31/1 + 1 tháng = 3/3) — lệch với lịch trả góp.


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
  const flexExpense = new Map<string, number>()
  const incomeByCategory = new Map<string, number>()
  const costTypeOf = new Map(categories.map((c) => [c.id, c.cost_type]))
  const needLevelOf = new Map(categories.map((c) => [c.id, c.need_level]))
  const taxIds = input.taxCategoryIds ?? new Set<string>()
  let taxAndSocial = 0
  let hasUnclassifiedExpense = false
  let hasUnclassifiedNeed = false

  for (const t of txs) {
    if (t.type === 'transfer' || t.is_debt_flow) continue
    const id = monthId(monthKeyForDate(t.occurred_on, monthStartDay))
    if (!monthIds.has(id)) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }

    /**
     * Thuế & an sinh đếm KỂ CẢ khi mang `exclude_from_stats` — cố ý, và là chỗ DUY
     * NHẤT trong hàm này bỏ qua cờ đó.
     *
     * Vì sao: thuế bị trừ tại nguồn không phải khoản chi tuỳ ý. Cộng nó vào ô Chi
     * làm con số đó mất nghĩa như tín hiệu tiêu tiền — mỗi tháng Chi phồng thêm
     * gần trăm nghìn yên mà chủ sổ không hề tiêu. Nên khoản thuế nhập từ phiếu
     * lương mang `exclude_from_stats` (đứng ngoài Thu/Chi, số dư vẫn tính), còn chỉ
     * số gánh nặng thuế vẫn cần đếm chúng.
     *
     * Kéo theo: `annualIncome` giờ là thu nhập RÒNG. Gộp = ròng + phần bị giữ lại,
     * mà phần bị giữ lại BẰNG ĐÚNG `taxAndSocial` theo cấu tạo của bút toán nhập
     * (dòng thu "phần bị giữ lại" = tổng mục thuế + 過不足税額, và `taxAndSocial`
     * cũng chính là tổng đó vì hoàn thuế là chi ÂM). Nên HealthView suy gộp ra
     * bằng `annualIncome + taxAndSocial`, không cần trường mới và không phải đoán
     * dòng thu nào là "phần bị giữ lại" — điều đó sẽ lẫn với bút toán
     * "Điều chỉnh số dư", cũng là thu và cũng mang `exclude_from_stats`.
     */
    if (t.type === 'expense' && t.category_id && taxIds.has(t.category_id)) {
      taxAndSocial += v * expenseSign(t)
    }

    if (t.exclude_from_stats) continue
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
    // Chỉ cắt thứ ĐƯỢC GẮN RÕ là linh hoạt; chưa gắn thì coi như không cắt được
    const need = t.category_id ? needLevelOf.get(t.category_id) : null
    if (need === 'flexible') flexExpense.set(id, (flexExpense.get(id) ?? 0) + signed)
    else if (!need) hasUnclassifiedNeed = true
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
  // Cùng công thức nhưng cộng lại phần chi linh hoạt đã cắt
  const essentialNetFlows = months.map((k, i) => netFlows[i] + (flexExpense.get(monthId(k)) ?? 0))
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
    monthlyFlexibleExpense: avg(sum(flexExpense)),
    monthlyIncome: avg(annualIncome),
    annualIncome,
    monthlyDebtPayment: avg(debtPaid),
    netFlows,
    essentialNetFlows,
    incomeSlices: [...incomeByCategory.entries()].map(([key, amount]) => ({ key, amount })),
    taxAndSocial,
    monthsCounted,
    hasUnclassifiedExpense,
    hasUnclassifiedNeed,
    hasMissingRate,
  }
}
