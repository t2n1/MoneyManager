// Gom dữ liệu từ các hook sẵn có → gọi bộ luật → lọc theo trạng thái đã đọc/đã tắt.
// Mọi thứ liên quan React nằm ở đây; bộ luật bên rules.ts vẫn thuần.
import { useMemo } from 'react'
import {
  useAccountBalances,
  useAccounts,
  useBudgetReport,
  useCategories,
  useDebts,
  useDismissNotification,
  useMarkNotificationsRead,
  useNetWorthSnapshots,
  useNotificationState,
  useProfile,
  useRangeTransactions,
  useRates,
  useRecurringRules,
  useSavingsGoals,
} from '../../hooks/queries'
import { addDaysISO, monthKeyForDate, toISODate } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import type { CurrencyCode } from '../../lib/money'
import { usePrivacyMode } from '../../lib/privacy'
import { buildNotifications } from './rules'
import type { AppNotification, NotificationResult, NotificationType } from './types'

/** Cửa sổ dữ liệu cho radar định kỳ và tổng kết tháng. */
const LOOKBACK_DAYS = 90

export interface UseNotificationsResult {
  actions: AppNotification[]
  infos: AppNotification[]
  hiddenCount: number
  /** Số việc-cần-làm chưa đọc — con số đỏ trên chuông. */
  unreadCount: number
  /** Mã nào đã đọc (để UI làm mờ). */
  readKeys: Set<string>
  /** MỌI mã sinh ra lượt này + mã đã lưu trạng thái — cho AppLayout dọn (mục E). */
  allKeys: string[]
  storedKeys: string[]
  isReady: boolean
  /** true nếu bộ luật vừa ném lỗi lượt này — AppLayout phải bỏ qua dọn dẹp (mục E). */
  engineFailed: boolean
  markAllRead: () => void
  dismiss: (key: string) => void
}

const EMPTY_RESULT: NotificationResult = { actions: [], infos: [], hiddenCount: 0, allKeys: [] }

export function useNotifications(): UseNotificationsResult {
  const todayISO = toISODate(new Date())
  // formatMoney đọc trạng thái riêng tư toàn cục (mục J); phải đăng ký ở đây để
  // bật/tắt riêng tư làm tính lại kết quả nhớ đệm bên dưới, không thì số tiền
  // trong thông báo bị "đứng hình" theo giá trị lúc build lần trước.
  const privacyOn = usePrivacyMode()

  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  const { data: accounts = [] } = useAccountBalances()
  const { data: accountRows = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: debts = [] } = useDebts()
  const { data: recurringRules = [] } = useRecurringRules()
  const { data: savingsGoals = [] } = useSavingsGoals()
  const { data: networthSnapshots = [] } = useNetWorthSnapshots()
  const { report: budgetReport } = useBudgetReport(monthKeyForDate(todayISO, monthStartDay))

  const range = useMemo(
    () => ({ start: addDaysISO(todayISO, -LOOKBACK_DAYS), end: addDaysISO(todayISO, 1) }),
    [todayISO],
  )
  const { data: recentTxs = [] } = useRangeTransactions(range, !!profile)

  const { data: stateRows = [], isLoading: stateLoading } = useNotificationState()
  const markRead = useMarkNotificationsRead()
  const dismissMutation = useDismissNotification()

  const currencyOf = useMemo(() => {
    const byId = new Map(accountRows.map((a) => [a.id, a.currency]))
    return (id: string): CurrencyCode => byId.get(id) ?? base
  }, [accountRows, base])

  const offTypes = (profile?.notif_off ?? []) as NotificationType[]

  // Bọc try/catch quanh bộ luật: đây là NƠI DUY NHẤT mọi lượt gọi useNotifications
  // đi qua (kể cả 2 chỗ AppLayout gọi trực tiếp cho chấm đỏ + dọn dẹp, ngoài tầm
  // của NotificationBoundary). Lỗi ở bộ luật thuần không được làm sập cả app.
  const result = useMemo<NotificationResult>(() => {
    try {
      return buildNotifications({
        todayISO,
        monthStartDay,
        base,
        rates: rates ?? {},
        formatMoney,
        currencyOf,
        accounts,
        categories,
        debts,
        recurringRules,
        budgetReport,
        savingsGoals,
        networthSnapshots,
        recentTxs,
        offTypes,
      })
    } catch (error) {
      console.error('Bộ luật thông báo lỗi, tạm ẩn thông báo:', error)
      return EMPTY_RESULT
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    todayISO,
    monthStartDay,
    base,
    rates,
    currencyOf,
    accounts,
    categories,
    debts,
    recurringRules,
    budgetReport,
    savingsGoals,
    networthSnapshots,
    recentTxs,
    profile?.notif_off,
    privacyOn,
  ])
  const engineFailed = result === EMPTY_RESULT

  const readKeys = useMemo(
    () => new Set(stateRows.filter((r) => r.read_at).map((r) => r.key)),
    [stateRows],
  )
  const dismissedKeys = useMemo(
    () => new Set(stateRows.filter((r) => r.dismissed_at).map((r) => r.key)),
    [stateRows],
  )

  // Tin-để-biết: đã tắt → biến mất hẳn; đã đọc từ lượt TRƯỚC → cũng không hiện nữa.
  // (Mở tấm trượt lần này có đánh dấu đọc thì vẫn thấy tới khi đóng — xem NotificationSheet.)
  const infos = result.infos.filter((n) => !dismissedKeys.has(n.key) && !readKeys.has(n.key))
  const unreadCount = result.actions.filter((n) => !readKeys.has(n.key)).length

  return {
    actions: result.actions,
    infos,
    hiddenCount: result.hiddenCount,
    unreadCount,
    readKeys,
    allKeys: result.allKeys,
    storedKeys: stateRows.map((r) => r.key),
    isReady: !!profile && !stateLoading,
    engineFailed,
    markAllRead: () => {
      const keys = [...result.actions, ...infos].map((n) => n.key).filter((k) => !readKeys.has(k))
      if (keys.length > 0) markRead.mutate(keys)
    },
    dismiss: (key: string) => dismissMutation.mutate(key),
  }
}
