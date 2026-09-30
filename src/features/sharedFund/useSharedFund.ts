// Dữ liệu quỹ chung của MỘT kỳ — dùng chung cho màn Quỹ chung và module Quỹ chung trên
// Bản tin, để hai chỗ đọc cùng một truy vấn và cùng một bản tóm tắt (không phải hai bản
// chép tay có thể lệch nhau). Toán ở sharedFund.ts.
import { useMemo } from 'react'
import { useAccounts, useCategories, useProfile, useSearchTransactions } from '../../hooks/queries'
import { addMonths, getMonthRange, toISODate, type MonthKey } from '../../lib/dates'
import { categoryLabel, tr } from '../../i18n'
import type { CurrencyCode } from '../../lib/money'
import { partnerLabel } from './labels'
import { STREAK_MONTHS, fundAlertsFor, summarizeFund, type FundAlert } from './sharedFund'

/** Đầu sổ — mọi giao dịch của quỹ đều sau mốc này. */
const DAU_SO = '1900-01-01'

export function useSharedFund(monthKey: MonthKey) {
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const monthStartDay = profile?.month_start_day ?? 1
  const fundId = profile?.couple_mode ? (profile.shared_fund_account_id ?? null) : null
  const fund = accounts.find((a) => a.id === fundId)
  const currency: CurrencyCode = fund?.currency ?? profile?.base_currency ?? 'JPY'
  const partner = partnerLabel(profile)
  const range = useMemo(() => getMonthRange(monthKey, monthStartDay), [monthKey, monthStartDay])

  // Mọi giao dịch chạm quỹ từ đầu tới hết kỳ đang xem — cần cả quá khứ cho cột luỹ kế.
  const q = useSearchTransactions({ start: DAU_SO, end: range.end, accountIds: fundId ? [fundId] : [] }, !!fundId)
  const txs = useMemo(() => q.data ?? [], [q.data])

  const summary = useMemo(
    () => (fundId ? summarizeFund(txs, fundId, range, categories) : null),
    [txs, fundId, range, categories],
  )

  // Nhắc chỉnh mức góp: chuỗi 3 tháng chỉ nhìn các tháng ĐÃ XONG — kỳ đang xem chưa hết thì
  // lùi một tháng làm mốc. Cùng hàm với chuông/Bản tin (fundAlertsFor).
  const alerts = useMemo<FundAlert[]>(() => {
    if (!fundId) return []
    const today = toISODate(new Date())
    const lastDone = range.end <= today ? monthKey : addMonths(monthKey, -1)
    const done = Array.from({ length: STREAK_MONTHS }, (_, i) =>
      getMonthRange(addMonths(lastDone, i - (STREAK_MONTHS - 1)), monthStartDay),
    )
    return fundAlertsFor(txs, fundId, categories, range, done)
  }, [txs, fundId, monthKey, range, monthStartDay, categories])

  const catName = (id: string | null) => {
    if (id === null) return tr('Chưa gán phần')
    const c = categories.find((x) => x.id === id)
    return c ? categoryLabel(c.name) : tr('Danh mục đã xoá')
  }

  return {
    /** null = chưa bật Hai người hoặc chưa chọn tài khoản quỹ (hoặc tài khoản đã xoá). */
    fundId: fund ? fundId : null,
    currency,
    partner,
    summary,
    alerts,
    catName,
    isPending: !!fundId && q.isPending,
    isError: q.isError,
  }
}
