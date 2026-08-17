// Phép tính của ba bổ sung 10a nằm ở tầng hiển thị của Sổ: lọc tại chỗ, dòng cảnh báo
// "chưa phân loại", và số dư chạy ở header mỗi nhóm ngày.
//
// Thuần, không React — cả ba đều là loại lỗi chỉ lộ ra ở ca biên (chuyển khoản không bao
// giờ có danh mục; ngày không có giao dịch vẫn phải có số dư), mà ca biên thì phải test
// được chứ không phải mở app ra nhìn.
import type { CashflowPoint } from '../reports/aggregate'
import { convertToBase, type Rates } from '../../lib/rates'
import type { CurrencyCode } from '../../lib/money'
import type { TransactionRow } from '../../types/database.types'
import { expenseSign } from '../reports/aggregate'
import type { CurrencyOf } from './ledgerShared'

/** Bộ lọc tại chỗ của Sổ (§4.2 mục 2). `null` ở `type` = không lọc theo loại. */
export interface LedgerFilter {
  type: TransactionRow['type'] | null
  /** true = chỉ khoản CHƯA gắn danh mục. */
  uncategorized: boolean
}

export const EMPTY_LEDGER_FILTER: LedgerFilter = { type: null, uncategorized: false }

export const isFilterActive = (f: LedgerFilter): boolean => f.type !== null || f.uncategorized

/**
 * Một giao dịch có CẦN gắn danh mục không.
 *
 * Chuyển khoản KHÔNG tính: nó không bao giờ có danh mục, nên đếm nó vào là dựng ra một
 * danh sách việc không thể làm xong. Cùng luật với `matchesFilter` ở filter.ts và với
 * bảng `uncategorized.ts` bên Báo cáo — ba chỗ trả lời cùng một câu hỏi thì phải cùng
 * một định nghĩa, không thì hai màn hiện hai con số.
 */
export function needsCategory(t: TransactionRow): boolean {
  return t.category_id == null && t.type !== 'transfer'
}

/** Lọc tại chỗ. Lọc trên danh sách ĐÃ TẢI của tháng, không gọi thêm mạng. */
export function applyLedgerFilter(txs: TransactionRow[], f: LedgerFilter): TransactionRow[] {
  if (!isFilterActive(f)) return txs
  return txs.filter((t) => {
    if (f.type !== null && t.type !== f.type) return false
    if (f.uncategorized && !needsCategory(t)) return false
    return true
  })
}

export interface UncategorizedSummary {
  count: number
  /** Tổng tiền đã quy đổi base. */
  amount: number
  /** Có khoản không quy đổi được → `amount` chỉ là một phần. */
  hasMissingRate: boolean
}

/**
 * Dòng gộp "còn N khoản chưa gắn danh mục" (§4.2 mục 3).
 *
 * Cộng theo TRỊ TUYỆT ĐỐI: khoản hoàn tiền là chi mang dấu âm, mà ở đây câu hỏi là
 * "bao nhiêu tiền đang không biết xếp vào đâu" — một khoản hoàn tiền chưa phân loại vẫn
 * là một việc phải làm, trừ nó đi thì tổng co lại và dòng cảnh báo nói nhẹ đi so với
 * lượng việc thật.
 */
export function uncategorizedSummary(
  txs: TransactionRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): UncategorizedSummary {
  let count = 0
  let amount = 0
  let hasMissingRate = false
  for (const t of txs) {
    if (!needsCategory(t)) continue
    count++
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) hasMissingRate = true
    else amount += Math.abs(v * expenseSign(t))
  }
  return { count, amount, hasMissingRate }
}

/**
 * Tra số dư chạy theo ngày (§4.2 mục 1) từ chuỗi của `cumulativeDailyBalance`.
 *
 * Trả về Map chứ không mảng: header nhóm ngày cần tra theo ISO, mà chuỗi kia có ĐỦ mọi
 * ngày trong kỳ (kể cả ngày trống) nên đánh chỉ số theo vị trí là sai ngay khi có một
 * ngày không giao dịch.
 */
export function balanceByDay(points: CashflowPoint[]): Map<string, number> {
  return new Map(points.map((p) => [p.date, p.balance]))
}
