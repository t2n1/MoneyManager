// Nguồn DUY NHẤT của tiến độ trần nhãn — dùng cho cả khối ở tab Ngân sách và
// (sau này) bất kỳ chỗ nào khác muốn hiện cùng con số.
import { useMemo } from 'react'
import { useAccounts, useProfile, useRates, useTags, useTagSpend } from '../../hooks/queries'
import { getMonthRange, type MonthKey } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { buildTagBudgetReport, type TagBudgetReport } from './budget'

const EMPTY: TagBudgetReport = { lines: [], hasMissingRate: false }

/**
 * Tiến độ mọi nhãn có đặt trần, ở tháng `monthKey` (chỉ ảnh hưởng nhãn kỳ 'monthly').
 *
 * Truy vấn chi cả đời nhãn CHỈ chạy khi thật sự có nhãn đặt trần: người chưa dùng
 * tính năng này không phải trả giá một lượt tải thêm ở mỗi lần mở tab Ngân sách.
 */
export function useTagBudgets(monthKey: MonthKey): TagBudgetReport {
  const { data: profile } = useProfile()
  const { data: tags = [] } = useTags()
  const { data: accounts = [] } = useAccounts()
  const { base, rates } = useRates()

  const hasBudget = tags.some((t) => t.budget_amount != null && t.budget_amount > 0)
  const { data: rows = [] } = useTagSpend(hasBudget)

  const monthStartDay = profile?.month_start_day ?? 1
  const range = useMemo(
    () => getMonthRange(monthKey, monthStartDay),
    [monthKey, monthStartDay],
  )

  return useMemo(() => {
    if (!hasBudget) return EMPTY
    const currencyOf = (id: string): CurrencyCode =>
      accounts.find((a) => a.id === id)?.currency ?? base
    return buildTagBudgetReport({
      tags,
      rows,
      currencyOf,
      base,
      rates: rates ?? {},
      monthStart: range.start,
      monthEnd: range.end,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBudget, tags, rows, accounts, base, rates, range])
}
