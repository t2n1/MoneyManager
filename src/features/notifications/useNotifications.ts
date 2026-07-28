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
import { unreadActionCount, visibleInfos } from './state'
import type { AppNotification, NotificationResult, NotificationType } from './types'

/** Cửa sổ dữ liệu cho radar định kỳ và tổng kết tháng. */
const LOOKBACK_DAYS = 90

// Một mảng rỗng DÙNG CHUNG cho mọi query chưa có dữ liệu. Viết `data ?? []` tại chỗ
// sẽ tạo mảng mới mỗi lần render, làm useMemo bên dưới tính lại liên tục.
const EMPTY: never[] = []

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
  /** Đủ để HIỆN chuông (có profile + đã biết trạng thái đã đọc). */
  isReady: boolean
  /**
   * Đủ để DỌN trạng thái (mục E) — nghĩa là MỌI nguồn dữ liệu bộ luật đọc đã về.
   * Khác hẳn `isReady`: `isReady` chỉ chờ 2 query, còn `allKeys` do 13 luật trên 8
   * query khác sinh ra. Dọn khi mới có 2 query = xóa oan trạng thái đã đọc của mọi
   * loại chưa kịp tải (chắc chắn xảy ra với budget-*, vì useMonthTransactions còn
   * chưa được phép chạy tới khi có profile).
   */
  inputsReady: boolean
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
  // Giữ nguyên object query (không destructure `data` ra ngay) vì `inputsReady` cần
  // biết từng query đã THÀNH CÔNG hay chưa, không chỉ "đã hết loading".
  const balancesQ = useAccountBalances()
  const accountRowsQ = useAccounts()
  const categoriesQ = useCategories()
  const debtsQ = useDebts()
  const rulesQ = useRecurringRules()
  const goalsQ = useSavingsGoals()
  const snapshotsQ = useNetWorthSnapshots()
  const accounts = balancesQ.data ?? EMPTY
  const accountRows = accountRowsQ.data ?? EMPTY
  const categories = categoriesQ.data ?? EMPTY
  const debts = debtsQ.data ?? EMPTY
  const recurringRules = rulesQ.data ?? EMPTY
  const savingsGoals = goalsQ.data ?? EMPTY
  const networthSnapshots = snapshotsQ.data ?? EMPTY
  const { report: budgetReport } = useBudgetReport(monthKeyForDate(todayISO, monthStartDay))

  const range = useMemo(
    () => ({ start: addDaysISO(todayISO, -LOOKBACK_DAYS), end: addDaysISO(todayISO, 1) }),
    [todayISO],
  )
  const txsQ = useRangeTransactions(range, !!profile)
  const recentTxs = txsQ.data ?? EMPTY

  const stateQ = useNotificationState()
  const stateRows = stateQ.data ?? EMPTY
  const stateLoading = stateQ.isLoading
  const markRead = useMarkNotificationsRead()
  const dismissMutation = useDismissNotification()

  const currencyOf = useMemo(() => {
    const byId = new Map(accountRows.map((a) => [a.id, a.currency]))
    return (id: string): CurrencyCode => byId.get(id) ?? base
  }, [accountRows, base])

  // Nhớ đệm để mảng giữ nguyên tham chiếu giữa các lần render — nếu không, memo
  // bên dưới tính lại mỗi render và mảng phụ thuộc không thể trung thực được.
  const notifOff = profile?.notif_off
  const offTypes = useMemo(() => (notifOff ?? []) as NotificationType[], [notifOff])

  // Bọc try/catch quanh bộ luật: đây là NƠI DUY NHẤT mọi lượt gọi useNotifications
  // đi qua (kể cả 2 chỗ AppLayout gọi trực tiếp cho chấm đỏ + dọn dẹp, ngoài tầm
  // của NotificationBoundary). Lỗi ở bộ luật thuần không được làm sập cả app.
  const result = useMemo<NotificationResult>(() => {
    // Nhắc `privacyOn` ngay trong thân memo là CỐ Ý, không phải rác: `formatMoney`
    // đọc cờ riêng tư từ một store NGOÀI React, nên bật/tắt riêng tư không làm đổi
    // bất kỳ đối số nào bên dưới — mà mọi chuỗi tiền trong thông báo vẫn phải được
    // tính lại. Nhờ dòng này, `privacyOn` là phụ thuộc THẬT của memo và mảng phụ
    // thuộc không cần eslint-disable nữa.
    void privacyOn
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
    // Mảng phụ thuộc ĐẦY ĐỦ, đúng bằng những gì thân memo đọc (formatMoney là import
    // cấp module nên không cần). Trước đây chỗ này có eslint-disable phủ cả 16 mục,
    // tức là không ai biết mảng có đúng hay không — nay bỏ được vì `privacyOn` đã
    // được đọc thật ở trên.
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
    offTypes,
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
  // Hai phép lọc là hàm thuần ở state.ts nên test được cả vòng đời (mục I).
  const infos = visibleInfos(result.infos, readKeys, dismissedKeys)
  const unreadCount = unreadActionCount(result.actions, readKeys)

  // Đủ để DỌN: mọi query mà 13 luật đọc đều đã THÀNH CÔNG, và budgetReport đã có
  // (nó chỉ khác undefined khi cả budgets lẫn giao dịch tháng đã về). Query lỗi cũng
  // chặn dọn — đúng ý: hướng an toàn là không xóa gì (xem planNotificationCleanup).
  const inputsReady =
    !!profile &&
    stateQ.isSuccess &&
    budgetReport !== undefined &&
    balancesQ.isSuccess &&
    accountRowsQ.isSuccess &&
    categoriesQ.isSuccess &&
    debtsQ.isSuccess &&
    rulesQ.isSuccess &&
    goalsQ.isSuccess &&
    snapshotsQ.isSuccess &&
    txsQ.isSuccess

  return {
    actions: result.actions,
    infos,
    hiddenCount: result.hiddenCount,
    unreadCount,
    readKeys,
    allKeys: result.allKeys,
    storedKeys: stateRows.map((r) => r.key),
    isReady: !!profile && !stateLoading,
    inputsReady,
    engineFailed,
    markAllRead: () => {
      const keys = [...result.actions, ...infos].map((n) => n.key).filter((k) => !readKeys.has(k))
      if (keys.length > 0) markRead.mutate(keys)
    },
    dismiss: (key: string) => dismissMutation.mutate(key),
  }
}
