// Tính tiến độ ngân sách — thuần, không phụ thuộc React, để unit-test được.
// Hạn mức và spent đều ở base currency (minor units); spent quy đổi qua convertToBase.

import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { BudgetRow, TransactionRow } from '../../types/database.types'
import { expenseSign, type CurrencyOf } from '../reports/aggregate'
import { NO_TRANSFER_CATEGORIES } from '../categories/kind'

export type BudgetStatus = 'ok' | 'warn' | 'over' // <80% / ≥80% / ≥100%

export function statusOf(ratio: number): BudgetStatus {
  if (ratio >= 1) return 'over'
  if (ratio >= 0.8) return 'warn'
  return 'ok'
}

export interface BudgetLine {
  categoryId: string
  budgeted: number // minor units base (đã gồm phần dồn nếu có)
  /** phần hạn mức dồn từ tháng trước (mục AH); 0 nếu không bật rollover */
  carried: number
  spent: number // minor units base (đã quy đổi)
  ratio: number // spent / budgeted (0 nếu budgeted = 0)
  status: BudgetStatus
  /** true = con của một nhóm đã có trần cha; chỉ là mốc theo dõi, KHÔNG cộng vào
   *  tổng và không tính vào đếm sắp vượt/vượt. spent của marker chỉ là chi riêng
   *  của con đó. */
  isMarker: boolean
}

export interface BudgetReport {
  lines: BudgetLine[] // sắp theo ratio giảm dần
  totalBudgeted: number
  totalSpent: number
  totalStatus: BudgetStatus
  overCount: number
  /** số danh mục ở ngưỡng cảnh báo ≥80% & <100% (mục AH) */
  warnCount: number
  hasMissingRate: boolean
  /** Chi (base, đã quy đổi) theo từng danh mục có phát sinh — để UI hiện chi của
   *  con ngay cả khi con chưa đặt hạn mức. Không gộp lên cha. */
  spentByCategory: Map<string, number>
}

export function buildBudgetReport(
  allBudgets: BudgetRow[],
  monthTxs: TransactionRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  /** Cho biết danh mục CHA của một danh mục (null nếu là danh mục gốc). Dùng để
   *  tính trần nhóm: hạn mức đặt ở CHA là trần chung, spent = tổng chi của cha +
   *  mọi con. Hạn mức đặt ở CON của một nhóm đã có trần chỉ là mốc theo dõi
   *  (isMarker), không cộng vào tổng. Mặc định: mọi danh mục là gốc → mỗi hạn
   *  mức là một dòng độc lập (tương thích ngược). */
  parentOf: (categoryId: string) => string | null = () => null,
  /** Phần hạn mức chưa tiêu tháng trước, theo danh mục (mục AH). Chỉ cộng cho
   *  hạn mức bật rollover. Mặc định rỗng → không dồn. */
  carryByCat: Map<string, number> = new Map(),
  /** Danh mục `kind = 'transfer'`: KHÔNG đặt được trần, KHÔNG vào chi đã tiêu.
   *  Trần cho một khoản chuyển tài sản là một câu vô nghĩa — tiền vẫn của mình,
   *  "vượt trần gửi về VN" không nói được điều gì làm được. */
  transferIds: ReadonlySet<string> = NO_TRANSFER_CATEGORIES,
): BudgetReport {
  const spentByCat = new Map<string, number>()
  let hasMissingRate = false
  for (const t of monthTxs) {
    if (t.type !== 'expense' || !t.category_id || t.exclude_from_stats) continue
    if (transferIds.has(t.category_id)) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    // Hoàn tiền trả lại hạn mức đã tiêu của chính danh mục đó
    spentByCat.set(t.category_id, (spentByCat.get(t.category_id) ?? 0) + v * expenseSign(t))
  }

  // Chi của cả nhóm = chi trực tiếp trên danh mục + chi của mọi con trực tiếp.
  // (Danh mục chỉ tối đa 2 cấp nên không cần đệ quy sâu hơn.)
  const groupSpent = (catId: string): number => {
    let s = spentByCat.get(catId) ?? 0
    for (const [cat, v] of spentByCat) if (parentOf(cat) === catId) s += v
    return s
  }
  // Hạn mức đã đặt cho một danh mục sau đó bị đánh dấu `transfer` thì bỏ khỏi báo cáo:
  // giữ lại là in một dòng "0 / ¥30,000" mãi mãi, vì chi của nó không còn được cộng.
  const budgets = allBudgets.filter((b) => !transferIds.has(b.category_id))
  const budgetedIds = new Set(budgets.map((b) => b.category_id))

  let totalBudgeted = 0
  let totalSpent = 0
  let overCount = 0
  let warnCount = 0
  const lines: BudgetLine[] = []
  for (const b of budgets) {
    const parent = parentOf(b.category_id)
    // Con của một nhóm đã có trần cha → chỉ là mốc theo dõi, không vào tổng.
    const isMarker = parent != null && budgetedIds.has(parent)
    const carried = b.rollover ? Math.max(0, carryByCat.get(b.category_id) ?? 0) : 0
    const budgeted = b.amount + carried
    // Marker: chỉ tính chi riêng của con. Dòng tính-vào-tổng: cả nhóm (cha + con).
    const spent = isMarker ? (spentByCat.get(b.category_id) ?? 0) : groupSpent(b.category_id)
    // Hạn mức ¥0 là hạn mức THẬT, không phải "chưa đặt": người dùng chủ ý khai tháng này
    // không tiêu ở đây. Nên tiêu một đồng vào đó là VƯỢT — đây là hạn mức duy nhất không
    // thể tuân thủ nếu đã tiêu. Bản trước cho `ratio = 0` nên `statusOf` trả 'ok' và app
    // báo xanh dù tiêu bao nhiêu, tức cái hạn mức đó không làm gì cả.
    //
    // Quy về 1 chứ KHÔNG phải Infinity: bốn chỗ in `Math.round(ratio * 100)%` (BudgetView
    // ×2, BudgetPanel, DayTagStrip) sẽ ra "Infinity%". Con số thật của dòng nằm ở "vượt ¥X"
    // lấy từ `spent − budgeted`, không lấy từ tỷ lệ.
    const ratio = budgeted > 0 ? spent / budgeted : spent > 0 ? 1 : 0
    const status = statusOf(ratio)
    if (!isMarker) {
      if (status === 'over') overCount++
      else if (status === 'warn') warnCount++
      totalBudgeted += budgeted
      totalSpent += spent
    }
    lines.push({ categoryId: b.category_id, budgeted, carried, spent, ratio, status, isMarker })
  }
  lines.sort((a, b) => b.ratio - a.ratio)

  const totalRatio = totalBudgeted > 0 ? totalSpent / totalBudgeted : 0
  const totalStatus = statusOf(totalRatio)
  return {
    lines,
    totalBudgeted,
    totalSpent,
    totalStatus,
    overCount,
    warnCount,
    hasMissingRate,
    spentByCategory: spentByCat,
  }
}

/**
 * Phần hạn mức CHƯA TIÊU của tháng trước theo danh mục (để dồn sang tháng sau).
 * leftover = max(0, hạn mức tháng trước − đã chi tháng trước). Chỉ cần cho danh mục
 * bật rollover ở tháng hiện tại, nhưng tính hết cho gọn.
 */
export function carryFromPreviousMonth(
  prevBudgets: BudgetRow[],
  prevMonthTxs: TransactionRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  parentOf: (categoryId: string) => string | null = () => null,
  transferIds: ReadonlySet<string> = NO_TRANSFER_CATEGORIES,
): Map<string, number> {
  const prev = buildBudgetReport(
    prevBudgets,
    prevMonthTxs,
    currencyOf,
    base,
    rates,
    parentOf,
    new Map(),
    transferIds,
  )
  const carry = new Map<string, number>()
  for (const line of prev.lines) {
    carry.set(line.categoryId, Math.max(0, line.budgeted - line.spent))
  }
  return carry
}
