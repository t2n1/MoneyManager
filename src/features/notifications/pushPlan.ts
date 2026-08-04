// Chọn tin nào được đẩy ra ngoài app — THUẦN. Không React, không window, không
// Date.now(). File này chạy cả trên trình duyệt (để test) và trên Deno (edge function
// push-notify gọi nó sau buildNotifications).
//
// Ranh giới với bộ luật: `rules.ts` quyết định CÓ việc gì cần để ý; file này quyết
// định việc đó có ĐÁNG GÕ CỬA người dùng lúc này không.
import type { AppNotification, NotificationSeverity } from './types'
import type { NotificationStateRow } from '../../types/database.types'

/** Kể tối đa bao nhiêu việc trong nội dung thông báo gộp trước khi chuyển sang đếm. */
export const PUSH_BODY_ITEMS = 3

/**
 * Tag của thông báo hệ thống. CỐ ĐỊNH một chuỗi là có ý: mỗi lượt gửi THAY thông báo
 * cũ trên khoá màn hình thay vì xếp thêm một cái nữa. Người dùng chỉ cần thấy tình
 * hình hôm nay, không cần chồng bảy thông báo của bảy ngày chưa xử lý.
 */
export const PUSH_TAG = 'sct-viec-can-lam'

/** Đường dẫn mở tấm trượt chuông — dùng khi gộp nhiều việc, không nhảy vào việc lẻ. */
export const PUSH_LIST_ROUTE = '/?notif=1'

/** Một lượt gửi: đúng MỘT thông báo hệ thống, dù gom bao nhiêu việc. */
export interface PushPayload {
  title: string
  body: string
  /** Bấm vào thông báo thì mở đường dẫn này. */
  to: string
  /** Mức cao nhất trong nhóm — service worker dùng để quyết định có rung/giữ lại không. */
  severity: NotificationSeverity
  tag: string
  /**
   * MỌI mã được lượt này đại diện, kể cả việc bị cắt khỏi nội dung. Nơi gọi phải ghi
   * `pushed_at` cho đủ danh sách này: việc chỉ được đếm trong "và N việc nữa" vẫn là
   * việc đã báo, đẩy lại ngày mai là nhắc hai lần cùng một chuyện.
   */
  keys: string[]
}

const SEVERITY_RANK: Record<NotificationSeverity, number> = { high: 0, medium: 1, low: 2 }

/**
 * Quyết định lượt gửi push từ danh sách việc-cần-làm và trạng thái đã lưu.
 *
 * @param actions Nhóm việc-cần-làm ĐẦY ĐỦ do `buildNotifications` trả ra
 *   (`result.actionsAll`). Loại người dùng đã tắt trong Cài đặt KHÔNG cần lọc lại ở
 *   đây — `arrangeNotifications` đã bỏ chúng trước khi tới đây, lọc lần hai là dựng
 *   hai chỗ phải giữ đồng bộ với nhau mà không ai bắt được khi chúng lệch.
 * @param stateRows Toàn bộ `notification_state` của user.
 * @returns Một lượt gửi, hoặc null nếu không có gì mới để báo.
 */
export function planPush(
  actions: AppNotification[],
  stateRows: NotificationStateRow[],
): PushPayload | null {
  const pushed = new Set(stateRows.filter((r) => r.pushed_at).map((r) => r.key))

  // Chỉ 'action'. Tin-để-biết ở lại trong chuông: nguyên tắc mục A của spec là chỉ
  // báo việc người dùng làm được gì đó.
  //
  // KHÔNG lọc theo read_at. Đọc trong app và nhận push là hai việc khác nhau — mở app
  // lúc 7 giờ thấy dòng đó rồi lướt qua không có nghĩa là 8 giờ khỏi cần nhắc. Chỉ
  // `pushed_at` mới chặn đẩy, và nó chỉ mất khi tình huống hết (vòng đời mục E).
  const fresh = actions.filter((n) => n.kind === 'action' && !pushed.has(n.key))
  if (fresh.length === 0) return null

  const severity = fresh.reduce<NotificationSeverity>(
    (worst, n) => (SEVERITY_RANK[n.severity] < SEVERITY_RANK[worst] ? n.severity : worst),
    'low',
  )
  const keys = fresh.map((n) => n.key)

  // Một việc: nói thẳng việc đó và bấm vào là tới đúng chỗ sửa.
  if (fresh.length === 1) {
    const only = fresh[0]
    return {
      title: only.title,
      body: only.detail ?? '',
      to: only.to,
      severity,
      tag: PUSH_TAG,
      keys,
    }
  }

  // Nhiều việc: gộp thành MỘT thông báo. Gửi mỗi việc một push là biến app thành thứ
  // người ta tắt thông báo, và trên iOS mỗi push là một dòng riêng trên khoá màn hình.
  const named = fresh.slice(0, PUSH_BODY_ITEMS).map((n) => n.title)
  const rest = fresh.length - named.length
  const parts = rest > 0 ? [...named, `và ${rest} việc nữa`] : named

  return {
    title: `${fresh.length} việc cần để ý`,
    body: parts.join(' · '),
    to: PUSH_LIST_ROUTE,
    severity,
    tag: PUSH_TAG,
    keys,
  }
}
