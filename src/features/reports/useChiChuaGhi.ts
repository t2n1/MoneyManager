// Hook gom dữ liệu cho `tinhChiChuaGhi`. Một chỗ duy nhất, để màn Báo cáo và màn Ngân
// sách không bao giờ đọc ra hai con số khác nhau cho cùng một tháng.
//
// `useMonthTransactions` gọi ở đây dùng chung queryKey với mọi chỗ khác, nên không phát
// sinh thêm một lượt tải nào.

import { useMemo } from 'react'
import { useAccounts, useCategories, useMonthTransactions, useRates } from '../../hooks/queries'
import type { MonthKey } from '../../lib/dates'
import { tinhChiChuaGhi, type ChiChuaGhi } from './chiChuaGhi'

export function useChiChuaGhi(monthKey: MonthKey): ChiChuaGhi {
  const { base, rates } = useRates()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: monthTxs = [] } = useMonthTransactions(monthKey)

  return useMemo(
    () => tinhChiChuaGhi(monthTxs, categories, accounts, base, rates ?? {}),
    [monthTxs, categories, accounts, base, rates],
  )
}
