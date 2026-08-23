// Cam kết chưa ra của một tháng — MỘT đường cho cả hai mặt của tab Ngân sách.
//
// Vì sao tách ra khỏi `usePlanning` (B36): mặt theo dõi chia `totalRemaining` cho số ngày
// còn lại để ra "mỗi ngày còn tiêu được bao nhiêu", nhưng `totalRemaining` gồm cả hạn mức
// của những khoản chắc chắn phải trả mà chưa tới ngày. `collectCommitments()` trả về đúng
// thứ cần trừ — và mặt theo dõi tới nay không gọi hàm này một lần nào.
import { useMemo } from 'react'
import {
  useAccounts,
  usePlannedExpenses,
  useProfile,
  useRates,
  useRecurringRules,
} from '../../hooks/queries'
import { getMonthRange, type MonthKey } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase } from '../../lib/rates'
import { collectCommitments, type CommitmentReport } from './commitments'

const EMPTY: CommitmentReport = {
  items: [],
  total: 0,
  hasMissingRate: false,
  byCategory: new Map(),
}

/** Cam kết CHƯA SINH GIAO DỊCH rơi vào tháng `monthKey`. */
export function useCommitments(monthKey: MonthKey): CommitmentReport {
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const { data: rules = [] } = useRecurringRules()
  const { data: planned = [] } = usePlannedExpenses()
  const { base, rates } = useRates()

  const monthStartDay = profile?.month_start_day ?? 1
  const range = useMemo(
    () => getMonthRange(monthKey, monthStartDay),
    [monthKey, monthStartDay],
  )

  return useMemo(() => {
    if (!profile) return EMPTY
    const currencyOf = (id: string): CurrencyCode =>
      accounts.find((a) => a.id === id)?.currency ?? base
    const r = rates ?? {}
    const convert = (amount: number, c: CurrencyCode) => convertToBase(amount, c, base, r)
    return collectCommitments(rules, planned, range, currencyOf, convert)
  }, [profile, rules, planned, range, accounts, base, rates])
}
