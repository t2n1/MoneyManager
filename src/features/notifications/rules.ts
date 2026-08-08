// Bộ luật thông báo — THUẦN. Không React, không window, không Date.now().
// Ngày hôm nay đến từ input.todayISO. Xem mục A và C của spec.
import {
  NOTIFICATION_TYPES,
  type AppNotification,
  type NotificationInput,
  type NotificationResult,
  type NotificationSeverity,
  type NotificationType,
} from './types'
import { accountRules } from './rules/accountRules'
import { debtRules } from './rules/debtRules'
import { billRules } from './rules/billRules'
import { plannedRules } from './rules/plannedRules'
import { budgetRules } from './rules/budgetRules'
import { tagRules } from './rules/tagRules'
import { cardRules } from './rules/cardRules'
import { rhythmRules } from './rules/rhythmRules'
import { lifetimeRules } from './rules/lifetimeRules'

/**
 * Trần của phần ĐANG HIỆN lúc còn thu gọn (mục C.4). KHÔNG phải trần cứng và
 * KHÔNG được áp ở đây: bộ luật không biết tin nào đã đọc / đã tắt, nên cắt trần
 * trước khi lọc là cắt mất tin chưa ai xem. Việc cắt nằm ở useNotifications, ngay
 * sau phép lọc.
 */
export const ACTION_LIMIT = 5
export const INFO_LIMIT = 3

const SEVERITY_RANK: Record<NotificationSeverity, number> = { high: 0, medium: 1, low: 2 }
// Tra thứ tự một lần thay vì gọi indexOf() mỗi lần so sánh trong sort().
const TYPE_RANK = new Map(NOTIFICATION_TYPES.map((t, i) => [t, i]))

/**
 * Lọc loại đã tắt, xếp thứ tự (mức cao trước; cùng mức thì theo NOTIFICATION_TYPES),
 * tách hai nhóm. Tách riêng khỏi buildNotifications để test được mà không cần dựng
 * cả cục dữ liệu đầu vào.
 *
 * Trả về danh sách ĐẦY ĐỦ, KHÔNG cắt trần — xem ACTION_LIMIT ở trên.
 */
export function arrangeNotifications(
  list: AppNotification[],
  offTypes: NotificationType[],
): NotificationResult {
  const off = new Set(offTypes)

  const sorted = [...list].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (bySeverity !== 0) return bySeverity
    return TYPE_RANK.get(a.type)! - TYPE_RANK.get(b.type)!
  })

  const kept = sorted.filter((n) => !off.has(n.type))

  const actions = kept.filter((n) => n.kind === 'action')
  const infos = kept.filter((n) => n.kind === 'info')

  return {
    actionsAll: actions,
    infosAll: infos,
    // Lấy từ `sorted`, tức TRƯỚC khi lọc loại đã tắt — CỐ Ý. Dọn dẹp ở AppLayout coi
    // "mã đã lưu mà không có trong allKeys" là việc đã xong và XÓA dòng trạng thái.
    // Nếu allKeys lấy từ `kept` thì tắt "Vượt ngân sách tháng" trong cài đặt sẽ xóa
    // sạch trạng thái đã đọc của budget-over:*, và bật lại là mọi mục đỏ như mới dù
    // người dùng đã đọc từ lâu. Tắt một loại KHÔNG phải là đã xử lý xong việc đó.
    allKeys: sorted.map((n) => n.key),
  }
}

/** Gom mọi nhóm luật rồi sắp xếp. Đủ cả sáu nhóm luật (Task 3–7 + luật lệch Lifetime). */
export function buildNotifications(input: NotificationInput): NotificationResult {
  const all: AppNotification[] = [
    ...accountRules(input),
    ...debtRules(input),
    ...billRules(input),
    ...plannedRules(input),
    ...budgetRules(input),
    ...tagRules(input),
    ...cardRules(input),
    ...rhythmRules(input),
    ...lifetimeRules(input),
  ]
  return arrangeNotifications(all, input.offTypes)
}
