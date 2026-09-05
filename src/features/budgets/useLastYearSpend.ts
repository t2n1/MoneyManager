// Nguồn dữ liệu cho `lastYearAmounts`: chi theo danh mục của CÙNG THÁNG NĂM NGOÁI so
// với tháng đang xem. Cùng khuôn useSuggestions — toán ở file thuần, hook chỉ nối ống.
//
// Tải qua `useMonthTransactions` để "một tháng" của năm ngoái cũng đi qua `getMonthRange`
// (tôn trọng ngày bắt đầu tháng tùy chỉnh) — đúng đường mà chế độ "So năm ngoái" của
// Bản tin đang đi; react-query giữ cache nên hai chỗ không thành hai lượt tải.
import { useMemo } from 'react'
import {
  useAccounts,
  useCategories,
  useMonthTransactions,
  useRates,
  useTransferCategoryIds,
} from '../../hooks/queries'
import { formatMonthLabel, type MonthKey } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { categoryBreakdown } from '../reports/aggregate'
import { lastYearAmounts } from './lastYearSpend'

export interface LastYearSpend {
  /** danh mục → tổng chi cùng tháng năm ngoái (base minor), đã gộp con lên cha */
  amounts: Map<string, number>
  /** Năm ngoái tháng đó KHÔNG ghi khoản nào (sổ chưa có) → giấu dòng tham chiếu. */
  hasData: boolean
  /** Có khoản thiếu tỷ giá → số là ước chừng, UI hiện ≈. */
  hasMissingRate: boolean
  /** Nhãn "2025/09" — cùng khuôn formatMonthLabel của cả app. */
  label: string
}

export function useLastYearSpend(monthKey: MonthKey): LastYearSpend {
  const priorKey = { year: monthKey.year - 1, month: monthKey.month }
  const { data: txs = [] } = useMonthTransactions(priorKey)
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { base, rates } = useRates()
  const transferIds = useTransferCategoryIds()

  return useMemo(() => {
    const currencyOf = (id: string): CurrencyCode =>
      accounts.find((a) => a.id === id)?.currency ?? base
    const breakdown = categoryBreakdown(txs, 'expense', currencyOf, base, rates ?? {}, transferIds)
    const parentOf = (id: string) => categories.find((c) => c.id === id)?.parent_id ?? null
    return {
      amounts: lastYearAmounts(breakdown.slices, parentOf),
      hasData: txs.length > 0,
      hasMissingRate: breakdown.hasMissingRate,
      label: formatMonthLabel(priorKey),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, accounts, categories, base, rates, transferIds, priorKey.year, priorKey.month])
}
