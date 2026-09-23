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

export interface CommitmentsState extends CommitmentReport {
  /**
   * Đã có đủ nguồn để tính chưa (hồ sơ, tài khoản, định kỳ, khoản sắp chi, tỷ giá).
   *
   * Vì sao phải có: định kỳ và khoản sắp chi mặc định `[]` lúc đang tải, nên cam kết ra 0
   * — "mỗi ngày còn tiêu được" loé lên CAO hơn thật, "N trần chưa phủ hết cam kết" im rồi
   * mới réo. `false` thì nơi gọi hiện "Đang tính…" và KHÔNG cảnh báo gì, cùng cách
   * BulletinPage chờ `recurringReady` / `plannedReady`.
   */
  ready: boolean
}

const EMPTY: CommitmentsState = {
  items: [],
  total: 0,
  hasMissingRate: false,
  byCategory: new Map(),
  ready: false,
}

/** Cam kết CHƯA SINH GIAO DỊCH rơi vào tháng `monthKey`. */
export function useCommitments(monthKey: MonthKey): CommitmentsState {
  const { data: profile } = useProfile()
  const { data: accounts = [], isSuccess: accountsReady } = useAccounts()
  const { data: rules = [], isSuccess: rulesReady } = useRecurringRules()
  const { data: planned = [], isSuccess: plannedReady } = usePlannedExpenses()
  // Tỷ giá: chờ HẾT TẢI chứ không chờ thành công — tỷ giá hỏng thì `collectCommitments`
  // đã có đường riêng (`hasMissingRate`, ≈), không được treo "Đang tính…" mãi.
  const { base, rates, isLoading: ratesLoading } = useRates()
  const ready = !!profile && accountsReady && rulesReady && plannedReady && !ratesLoading

  const monthStartDay = profile?.month_start_day ?? 1
  const range = useMemo(
    () => getMonthRange(monthKey, monthStartDay),
    [monthKey, monthStartDay],
  )

  return useMemo(() => {
    if (!ready) return EMPTY
    const currencyOf = (id: string): CurrencyCode =>
      accounts.find((a) => a.id === id)?.currency ?? base
    const r = rates ?? {}
    const convert = (amount: number, c: CurrencyCode) => convertToBase(amount, c, base, r)
    return { ...collectCommitments(rules, planned, range, currencyOf, convert), ready: true }
  }, [ready, rules, planned, range, accounts, base, rates])
}
