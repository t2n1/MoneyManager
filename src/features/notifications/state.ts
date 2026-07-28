// Vòng đời trạng thái thông báo (mục E của spec) — THUẦN, test được.
import { NOTIFICATION_META, type AppNotification, type NotificationType } from './types'

/** Phần đầu của mã chính là `type`. Mã lạ → null (không xóa nhầm). */
function typeOf(key: string): NotificationType | null {
  const head = key.split(':')[0] as NotificationType
  return head in NOTIFICATION_META ? head : null
}

/**
 * Mã việc-cần-làm đã lưu trạng thái nhưng lượt tính này KHÔNG sinh ra nữa → việc
 * đã xong, xóa trạng thái đi. Nhờ vậy nếu tình huống tái diễn thì nó lại đỏ như
 * mới, chứ không bị coi là "đã đọc từ đời nào".
 *
 * Trạng thái của tin-để-biết KHÔNG bao giờ bị xóa theo cách này — đã tắt gợi ý
 * nào thì phải tắt vĩnh viễn.
 */
export function splitStaleActionKeys(storedKeys: string[], liveKeys: string[]): string[] {
  const live = new Set(liveKeys)
  return storedKeys.filter((key) => {
    if (live.has(key)) return false
    const type = typeOf(key)
    return type !== null && NOTIFICATION_META[type].kind === 'action'
  })
}

/**
 * Tin-để-biết còn được hiện: đã tắt → mất hẳn; đã đọc từ lượt TRƯỚC → cũng thôi.
 * Tách khỏi useNotifications để test được cả vòng đời (mục I của spec).
 */
export function visibleInfos(
  infos: AppNotification[],
  readKeys: Set<string>,
  dismissedKeys: Set<string>,
): AppNotification[] {
  return infos.filter((n) => !dismissedKeys.has(n.key) && !readKeys.has(n.key))
}

/** Con số đỏ trên chuông = việc-cần-làm CHƯA đọc (mục D.1). */
export function unreadActionCount(actions: AppNotification[], readKeys: Set<string>): number {
  return actions.filter((n) => !readKeys.has(n.key)).length
}

export interface CleanupInput {
  /** Đã dọn trong lần mở app này rồi (chốt cấp module ở AppLayout). */
  alreadyDone: boolean
  /**
   * MỌI nguồn dữ liệu mà bộ luật đọc đã tải xong. Thiếu DÙ MỘT nguồn cũng phải là
   * false: `allKeys` lúc đó khuyết mã của nguồn chưa về, mà dọn dẹp lại XÓA theo
   * "không thấy trong allKeys thì coi như xong" — nên chưa đủ dữ liệu là xóa oan.
   */
  inputsReady: boolean
  /** Bộ luật vừa ném lỗi lượt này → allKeys rỗng vì lỗi, không phải vì đã xong. */
  engineFailed: boolean
  /** Mã đang có dòng trạng thái trong DB. */
  storedKeys: string[]
  /** MỌI mã bộ luật sinh ra lượt này (kể cả tin bị cắt trần). */
  allKeys: string[]
}

/** Việc cần làm của một lượt dọn. `null` = LƯỢT NÀY ĐỪNG DỌN. */
export interface CleanupPlan {
  /** Mã việc-cần-làm cần xóa vì tình huống đã xong. */
  staleKeys: string[]
}

/**
 * Quyết định lượt dọn — THUẦN, để phần dễ sai nhất của mục E test được mà không
 * cần dựng component.
 *
 * Trả `null` khi chưa đủ điều kiện, và AppLayout chỉ được chốt "đã dọn" khi hàm
 * này trả về khác null. Hướng an toàn là KHÔNG DỌN: dòng cũ nằm lại thì tối đa
 * 12 tháng sau bị prune, còn xóa oan là mất vĩnh viễn trạng thái đã đọc — người
 * dùng thấy thông báo đã đọc đỏ lại như mới mỗi lần mở app.
 */
export function planNotificationCleanup(input: CleanupInput): CleanupPlan | null {
  if (input.alreadyDone) return null
  if (!input.inputsReady) return null
  if (input.engineFailed) return null
  return { staleKeys: splitStaleActionKeys(input.storedKeys, input.allKeys) }
}
