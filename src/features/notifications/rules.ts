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
import { budgetRules } from './rules/budgetRules'
import { cardRules } from './rules/cardRules'
import { rhythmRules } from './rules/rhythmRules'

export const ACTION_LIMIT = 5
export const INFO_LIMIT = 3

const SEVERITY_RANK: Record<NotificationSeverity, number> = { high: 0, medium: 1, low: 2 }

/**
 * Lọc loại đã tắt, xếp thứ tự (mức cao trước; cùng mức thì theo NOTIFICATION_TYPES),
 * tách hai nhóm và cắt trần. Tách riêng khỏi buildNotifications để test được mà
 * không cần dựng cả cục dữ liệu đầu vào.
 */
export function arrangeNotifications(
  list: AppNotification[],
  offTypes: NotificationType[],
): NotificationResult {
  const off = new Set(offTypes)
  const kept = list.filter((n) => !off.has(n.type))

  kept.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (bySeverity !== 0) return bySeverity
    return NOTIFICATION_TYPES.indexOf(a.type) - NOTIFICATION_TYPES.indexOf(b.type)
  })

  const actions = kept.filter((n) => n.kind === 'action')
  const infos = kept.filter((n) => n.kind === 'info')

  return {
    actions: actions.slice(0, ACTION_LIMIT),
    infos: infos.slice(0, INFO_LIMIT),
    hiddenCount:
      Math.max(0, actions.length - ACTION_LIMIT) + Math.max(0, infos.length - INFO_LIMIT),
    allKeys: kept.map((n) => n.key),
  }
}

/** Gom mọi nhóm luật rồi sắp xếp. Đủ cả năm nhóm luật (Task 3–7). */
export function buildNotifications(input: NotificationInput): NotificationResult {
  const all: AppNotification[] = [
    ...accountRules(input),
    ...debtRules(input),
    ...budgetRules(input),
    ...cardRules(input),
    ...rhythmRules(input),
  ]
  return arrangeNotifications(all, input.offTypes)
}
