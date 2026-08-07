// Gom dữ liệu từ các hook sẵn có → gọi bộ luật → lọc theo trạng thái đã đọc/đã tắt.
// Mọi thứ liên quan React nằm ở đây; bộ luật bên rules.ts vẫn thuần.
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { repo } from '../../data'
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
import { useTagBudgets } from '../tags/useTagBudgets'
import { formatMoney } from '../../lib/money'
import type { CurrencyCode } from '../../lib/money'
import { usePrivacyMode } from '../../lib/privacy'
import { buildLifetimeInput } from '../lifetime/buildInput'
import { ACTION_LIMIT, INFO_LIMIT, buildNotifications } from './rules'
import {
  lifetimeQueriesSettled,
  notificationInputsReady,
  unreadActionCount,
  visibleInfoLists,
} from './state'
import { RECENT_TXS_DAYS } from './types'
import type { AppNotification, NotificationResult, NotificationType } from './types'

// Một mảng rỗng DÙNG CHUNG cho mọi query chưa có dữ liệu. Viết `data ?? []` tại chỗ
// sẽ tạo mảng mới mỗi lần render, làm useMemo bên dưới tính lại liên tục.
const EMPTY: never[] = []

export interface UseNotificationsResult {
  /** Việc cần làm phần THU GỌN (tối đa ACTION_LIMIT). */
  actions: AppNotification[]
  /** Tin để biết phần THU GỌN (tối đa INFO_LIMIT), đã bỏ tin đã đọc/đã tắt. */
  infos: AppNotification[]
  /** Việc cần làm ĐẦY ĐỦ — tấm trượt cần để xổ phần thừa (mục C.4). */
  actionsAll: AppNotification[]
  /** Tin để biết ĐẦY ĐỦ, cũng đã bỏ tin đã đọc/đã tắt. `infos` là đoạn đầu của nó. */
  infosAll: AppNotification[]
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
  /**
   * Đánh dấu đã đọc một nhóm mã cụ thể. Dùng khi người dùng bấm xổ phần bị cắt trần:
   * lúc đó họ mới THẬT SỰ nhìn thấy mấy tin đó, nên mới được tính là đã đọc.
   */
  markRead: (keys: string[]) => void
  dismiss: (key: string) => void
}

const EMPTY_RESULT: NotificationResult = {
  actionsAll: [],
  infosAll: [],
  allKeys: [],
}

export function useNotifications(): UseNotificationsResult {
  const todayISO = toISODate(new Date())
  // formatMoney đọc trạng thái riêng tư toàn cục (mục J); phải đăng ký ở đây để
  // bật/tắt riêng tư làm tính lại kết quả nhớ đệm bên dưới, không thì số tiền
  // trong thông báo bị "đứng hình" theo giá trị lúc build lần trước.
  const privacyOn = usePrivacyMode()

  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates, isSuccess: ratesOk } = useRates()
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
  const { report: budgetReport, isComplete: budgetReportComplete } = useBudgetReport(
    monthKeyForDate(todayISO, monthStartDay),
  )
  // Trần theo nhãn — cùng kỳ tháng với ngân sách danh mục. Không nhãn nào đặt trần
  // thì `lines` rỗng và luật nhãn im, không tốn truy vấn nào (xem useTagBudgets).
  const tagBudgets = useTagBudgets(monthKeyForDate(todayISO, monthStartDay))

  // `RECENT_TXS_DAYS` (types.ts) là hằng số DUY NHẤT cho cửa sổ này: bộ luật đọc CHÍNH
  // NÓ để biết `input.recentTxs` chứa bao nhiêu ngày. Trước đây chỗ này giữ 90 còn
  // lifetimeRules.ts giữ 92, nên luật hứa một cửa sổ dài hơn dữ liệu thật sự có.
  const range = useMemo(
    () => ({ start: addDaysISO(todayISO, -RECENT_TXS_DAYS), end: addDaysISO(todayISO, 1) }),
    [todayISO],
  )
  const txsQ = useRangeTransactions(range, !!profile)
  const recentTxs = txsQ.data ?? EMPTY

  // Kịch bản Lifetime cho luật lệch. Dùng ĐÚNG ba queryKey của useLifetime.ts nên hai
  // nơi chia CHUNG một bộ nhớ đệm — mở /lifetime rồi mở trang khác không gọi lại mạng.
  // `enabled: !!profile` giống `useRangeTransactions(range, !!profile)` ở trên: chưa có
  // profile thì chưa biết người dùng là ai, gọi ba lần mạng để rồi bỏ đi là vô ích.
  const scenariosQ = useQuery({
    queryKey: ['lifeScenarios'],
    queryFn: () => repo.getLifeScenarios(),
    enabled: !!profile,
  })
  const phasesQ = useQuery({
    queryKey: ['lifePhases'],
    queryFn: () => repo.getLifePhases(),
    enabled: !!profile,
  })
  const eventsQ = useQuery({
    queryKey: ['lifeEvents'],
    queryFn: () => repo.getLifeEvents(),
    enabled: !!profile,
  })

  const stateQ = useNotificationState()
  const stateRows = stateQ.data ?? EMPTY
  const stateLoading = stateQ.isLoading
  const markRead = useMarkNotificationsRead()
  const dismissMutation = useDismissNotification()

  const currencyOf = useMemo(() => {
    const byId = new Map(accountRows.map((a) => [a.id, a.currency]))
    return (id: string): CurrencyCode => byId.get(id) ?? base
  }, [accountRows, base])

  /**
   * `LifetimeInput` của kịch bản CHÍNH, hoặc undefined.
   *
   * Phép ráp là hàm THUẦN `buildLifetimeInput` (features/lifetime/buildInput.ts) — 16
   * phép ánh xạ trường cộng luật chọn kịch bản chính, trước đây nằm ngay trong memo
   * này mà không có phép thử nào (cơ sở dữ liệu demo không có kịch bản Lifetime nên
   * nhánh code đó chưa từng chạy lúc xem trước). Ở đây chỉ còn phần React.
   *
   * Đồng hồ truyền vào qua `todayISO` (đã đọc một lần ở đầu hook) chứ không đọc lần
   * nữa — hai lần đọc trong cùng một hook có thể rơi hai bên nửa đêm và ra hai năm.
   */
  const lifetime = useMemo(
    () =>
      buildLifetimeInput({
        scenarios: scenariosQ.data,
        phases: phasesQ.data,
        events: eventsQ.data,
        birthYear: profile?.birth_year,
        annualInflationBps: profile?.annual_inflation_bps,
        todayISO,
      }),
    [profile, scenariosQ.data, phasesQ.data, eventsQ.data, todayISO],
  )

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
        tagBudgets: tagBudgets.lines,
        savingsGoals,
        networthSnapshots,
        recentTxs,
        lifetime,
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
    tagBudgets,
    savingsGoals,
    networthSnapshots,
    recentTxs,
    lifetime,
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
  //
  // LỌC TRƯỚC, CẮT TRẦN SAU (lỗi I4-R) — thứ tự nằm trong visibleInfoLists để có
  // phép thử canh, chứ không phải hai dòng rời ở đây.
  const { infosAll, infos } = visibleInfoLists(
    result.infosAll,
    readKeys,
    dismissedKeys,
    INFO_LIMIT,
  )
  // Việc-cần-làm KHÔNG lọc theo đã đọc (đã đọc chỉ mờ đi chứ không mất) và không có
  // nút ✕, nên ở nhóm này cắt trước hay sau đều ra một kết quả — vẫn cắt ở đây cho
  // cùng một chỗ với nhóm kia.
  const actions = result.actionsAll.slice(0, ACTION_LIMIT)
  // Đếm trên bản ĐẦY ĐỦ, không phải phần thu gọn: có 7 việc mà chuông báo 5 là nói
  // dối, và chính tấm trượt cũng đang in "7 việc cần làm" ở tiêu đề. Bấm mở rồi bấm
  // "Xem thêm" vẫn tắt hết được số đỏ, chỉ thêm một cái chạm.
  const unreadCount = unreadActionCount(result.actionsAll, readKeys)

  // Đủ để DỌN: MỌI nguồn dữ liệu bộ luật đọc đã về. Quyết định là hàm thuần
  // notificationInputsReady (state.ts) — đúng chỗ lỗi C1 trốn được hai lượt sửa.
  // Query lỗi cũng chặn dọn: hướng an toàn là không xóa gì (planNotificationCleanup).
  const inputsReady = notificationInputsReady({
    profileLoaded: !!profile,
    ratesOk,
    accountRowsOk: accountRowsQ.isSuccess,
    balancesOk: balancesQ.isSuccess,
    categoriesOk: categoriesQ.isSuccess,
    debtsOk: debtsQ.isSuccess,
    recurringRulesOk: rulesQ.isSuccess,
    budgetReportComplete,
    savingsGoalsOk: goalsQ.isSuccess,
    networthSnapshotsOk: snapshotsQ.isSuccess,
    recentTxsOk: txsQ.isSuccess,
    // Cả BA query phải ĐÃ NGÃ NGŨ — thành công HOẶC lỗi hẳn, không phải chỉ thành
    // công. Quyết định là hàm thuần `lifetimeQueriesSettled` (state.ts) để có phép thử
    // canh; JSDoc của nó nói vì sao "lỗi hẳn" cũng phải tính là sẵn sàng.
    lifetimeOk: lifetimeQueriesSettled([scenariosQ, phasesQ, eventsQ]),
    notificationStateOk: stateQ.isSuccess,
  })

  // Đánh dấu đã đọc, bỏ sẵn mã đã đọc rồi để khỏi gọi mạng vô ích.
  const markReadKeys = (keys: string[]) => {
    const fresh = keys.filter((k) => !readKeys.has(k))
    if (fresh.length > 0) markRead.mutate(fresh)
  }

  return {
    actions,
    infos,
    actionsAll: result.actionsAll,
    infosAll,
    unreadCount,
    readKeys,
    allKeys: result.allKeys,
    storedKeys: stateRows.map((r) => r.key),
    isReady: !!profile && !stateLoading,
    inputsReady,
    engineFailed,
    // CHỈ đánh dấu phần ĐANG HIỆN (thu gọn). Phần bị cắt trần người dùng chưa nhìn
    // thấy nên chưa được coi là đã đọc — nếu đánh dấu luôn thì một tin-để-biết bị cắt
    // sẽ mất vĩnh viễn mà chủ nó chưa từng thấy. Nó chỉ được đánh dấu khi người dùng
    // bấm xổ ra (markRead ở NotificationSheet).
    markAllRead: () => markReadKeys([...actions, ...infos].map((n) => n.key)),
    markRead: markReadKeys,
    dismiss: (key: string) => dismissMutation.mutate(key),
  }
}
