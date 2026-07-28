// Vòng đời trạng thái thông báo (mục E của spec) — THUẦN, test được.
import { NOTIFICATION_META, type NotificationType } from './types'

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
