// Gợi ý hạn mức + thu nền — MỘT đường cho cả hai mặt của tab Ngân sách.
//
// Vì sao tách ra khỏi `usePlanning` (B39): `BudgetEditSheet` nhận prop `suggestion`, mặt
// lập kế hoạch truyền vào, mặt theo dõi KHÔNG truyền gì cả. Nên sửa hạn mức giữa tháng là
// gõ số từ trí nhớ — đúng cái việc `suggest.ts` được viết ra để bỏ. Mà mặt theo dõi không
// thể gọi `usePlanning`: hook đó kéo thêm cam kết, trần nhãn và cả `month_plans`.
//
// Cửa sổ là SUGGEST_MONTHS (6) tháng đã đóng sổ tính từ HÔM NAY, không phụ thuộc tháng
// đang xem. Dùng `BASELINE_MONTHS` (3) ở đây là hai mặt của cùng một trang gợi ý hai số
// khác nhau cho cùng một danh mục (B39.3).
import { useMemo } from 'react'
import {
  useAccounts,
  useProfile,
  useRangeTransactions,
  useRates,
  useTransferCategoryIds,
} from '../../hooks/queries'
import {
  addMonths,
  getMonthRange,
  monthKeyForDate,
  monthKeyString,
  toISODate,
} from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { categoryBreakdown, monthlySeries } from '../reports/aggregate'
import { baselineIncome, BASELINE_MONTHS } from './axisTargets'
import { suggestLimits, type MonthSlices, type Suggestion } from './suggest'

/** Cửa sổ lịch sử cho GỢI Ý HẠN MỨC (§4.3: TB 6 tháng). Khác `BASELINE_MONTHS`. */
export const SUGGEST_MONTHS = 6

export interface SuggestionsData {
  suggestions: Map<string, Suggestion>
  /** trung bình thu của các tháng đã đóng sổ; null = chưa đủ dữ liệu */
  baseline: number | null
  /** chi theo danh mục của từng tháng lịch sử — nền của mọi gợi ý */
  months: MonthSlices[]
}

const EMPTY: SuggestionsData = { suggestions: new Map(), baseline: null, months: [] }

/**
 * Gợi ý hạn mức từ 6 tháng đã đóng sổ, kèm thu nền từ 3 tháng cuối của cùng cửa sổ.
 *
 * Hai người dùng chuỗi này cần hai cửa sổ khác nhau, và trước đây bị ép chung một:
 *   · Thu NỀN — 3 tháng gần nhất. Thu nhập đổi thì phải bám cái mới; kéo dài cửa sổ là
 *     một lần tăng lương mất nửa năm mới hiện ra trong mẫu số.
 *   · Gợi ý HẠN MỨC — 6 tháng. Chi có nhịp quý (bảo hiểm, sửa xe, quà Tết); ba tháng thì
 *     một khoản ba-tháng-một-lần hoặc phình gấp ba hoặc biến mất hẳn khỏi gợi ý.
 * Lấy 6 tháng cho CẢ chuỗi rồi cắt 3 tháng cuối cho thu nền: một lần fetch.
 */
export function useSuggestions(): SuggestionsData {
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const { base, rates } = useRates()
  const transferIds = useTransferCategoryIds()

  const monthStartDay = profile?.month_start_day ?? 1
  const currentKey = monthKeyForDate(toISODate(new Date()), monthStartDay)

  const histMonths = useMemo(
    () => Array.from({ length: SUGGEST_MONTHS }, (_, i) => addMonths(currentKey, i - SUGGEST_MONTHS)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentKey.year, currentKey.month],
  )
  const histRange = useMemo(
    () => ({
      start: getMonthRange(histMonths[0], monthStartDay).start,
      end: getMonthRange(histMonths[histMonths.length - 1], monthStartDay).end,
    }),
    [histMonths, monthStartDay],
  )
  // Cùng khoá truy vấn với mọi nơi gọi khác → react-query trả bản đã có trong bộ nhớ,
  // nên hai mặt cùng dùng hook này không thành hai lượt tải.
  const { data: histTxs = [] } = useRangeTransactions(histRange, !!profile)

  return useMemo(() => {
    if (!profile) return EMPTY
    const currencyOf = (id: string): CurrencyCode =>
      accounts.find((a) => a.id === id)?.currency ?? base
    const r = rates ?? {}

    const baseline = baselineIncome(
      monthlySeries(
        histTxs,
        histMonths.slice(-BASELINE_MONTHS),
        monthStartDay,
        currencyOf,
        base,
        r,
        transferIds,
      ).points,
    )

    const months = histMonths.map((mk) => {
      const rng = getMonthRange(mk, monthStartDay)
      const txs = histTxs.filter((t) => t.occurred_on >= rng.start && t.occurred_on < rng.end)
      return {
        monthKey: monthKeyString(mk),
        slices: categoryBreakdown(txs, 'expense', currencyOf, base, r, transferIds).slices,
      }
    })

    return { suggestions: suggestLimits(months), baseline, months }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, histTxs, histMonths, monthStartDay, accounts, base, rates, transferIds])
}
