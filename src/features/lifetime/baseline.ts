// Sinh giả định thu/chi nền từ giao dịch THẬT. THUẦN.
// Chỉ nhận giao dịch CÙNG MỘT loại tiền — caller lọc trước. Trộn tiền ở đây thì
// phải kéo Rates vào, mà giả định của chặng vốn dĩ theo tiền bản địa.
import { daysBetween } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/currencies'
import type { CategoryRow, TransactionRow } from '../../types/database.types'

export interface BaselineCategoryLine {
  categoryId: string
  name: string
  /** Chi của danh mục này, đã quy năm hoá. */
  annualMinor: number
  /** Tỷ trọng trong tổng chi, 0..1. */
  share: number
}

export interface BaselineSuggestion {
  annualIncomeMinor: number
  annualExpenseMinor: number
  /** Số tháng dữ liệu thật đã dùng, 1..12. Hiện ra để người dùng biết số đáng tin cỡ nào. */
  monthsCovered: number
  /** Chi theo danh mục, giảm dần. Đây là phần "số này ở đâu ra". */
  byCategory: BaselineCategoryLine[]
}

const MAX_MONTHS = 12

/**
 * `TransactionRow` thật (xem `types/database.types.ts`, khớp `0001_init.sql`)
 * KHÔNG có cột `currency` — tiền của một giao dịch suy ra từ tài khoản nguồn
 * (`currencyOf(account_id)`), đúng như comment "minor units theo currency của tài
 * khoản nguồn". Caller (màn Lifetime) phải tự lọc `txs` theo tài khoản trước khi
 * gọi hàm này — tham số `currency` ở đây chỉ để đối chiếu PHÒNG HỜ, không phải
 * nguồn sự thật. Khai kiểu mở rộng optional để đọc được field này nếu ai đó gắn
 * vào (test, hoặc tương lai) mà không nói dối kiểu dữ liệu thật.
 */
type MaybeTaggedCurrency = TransactionRow & { currency?: CurrencyCode }

export function suggestBaseline(
  txs: TransactionRow[],
  categories: CategoryRow[],
  currency: CurrencyCode,
  todayISO: string,
): BaselineSuggestion {
  const kept = txs.filter((t) => {
    const row = t as MaybeTaggedCurrency
    return (
      // Không có cột currency thật (dữ liệu Supabase/demo) → coi như đã đúng tiền,
      // tin caller đã lọc. Có gắn (test) mà khác thì loại — đúng ý "chỉ nhận cùng
      // một loại tiền".
      (row.currency === undefined || row.currency === currency) &&
      !t.exclude_from_stats &&
      // Chuyển khoản không phải thu cũng không phải chi — cộng vào là đếm hai lần.
      (t.type === 'income' || t.type === 'expense') &&
      daysBetween(t.occurred_on, todayISO) <= MAX_MONTHS * 31
    )
  })

  if (kept.length === 0) {
    return { annualIncomeMinor: 0, annualExpenseMinor: 0, monthsCovered: MAX_MONTHS, byCategory: [] }
  }

  // Quy năm hoá theo số tháng THỰC CÓ, không phải cứng 12: người mới dùng app 3
  // tháng mà chia cho 12 thì giả định chi phí thấp đi 4 lần.
  const oldest = kept.reduce((m, t) => (t.occurred_on < m ? t.occurred_on : m), kept[0].occurred_on)
  const spanMonths = Math.max(1, Math.round(daysBetween(oldest, todayISO) / 30.44))
  const monthsCovered = Math.min(MAX_MONTHS, spanMonths)
  const factor = 12 / monthsCovered

  const incomeSum = kept
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + Math.abs(t.amount), 0)
  const expenses = kept.filter((t) => t.type === 'expense')
  const expenseSum = expenses.reduce((s, t) => s + Math.abs(t.amount), 0)

  const nameOf = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? 'Danh mục đã xóa'

  const byCat = new Map<string, number>()
  for (const t of expenses) {
    const key = t.category_id ?? 'khong-danh-muc'
    byCat.set(key, (byCat.get(key) ?? 0) + Math.abs(t.amount))
  }

  const byCategory: BaselineCategoryLine[] = [...byCat.entries()]
    .map(([categoryId, sum]) => ({
      categoryId,
      name: nameOf(categoryId),
      annualMinor: Math.round(sum * factor),
      share: expenseSum > 0 ? sum / expenseSum : 0,
    }))
    .sort((a, b) => b.annualMinor - a.annualMinor)

  return {
    annualIncomeMinor: Math.round(incomeSum * factor),
    annualExpenseMinor: Math.round(expenseSum * factor),
    monthsCovered,
    byCategory,
  }
}
