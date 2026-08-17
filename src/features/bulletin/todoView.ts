// Phần THUẦN của khối Việc cần làm (bản vẽ 16a / 17a).
//
// 16a bày mỗi việc thành ba tầng thông tin, không phải một dòng chữ:
//   [4 NGÀY]  Nạp ¥12,300 vào Rakuten Bank trước 27/08
//             Từ Tài sản · thẻ tín dụng — kỳ này 2 thẻ rút ¥152,800, số dư đang ¥140,500
// Nhãn bên trái cho mắt phân loại cả danh sách trước khi đọc câu nào; dòng "Từ …" trả
// lại NGỮ CẢNH mà việc gom-về-một-chỗ đã lấy đi. Cả hai suy được từ `AppNotification`
// nên chúng ở đây, thuần và test được, không nằm rải trong JSX.
import { daysBetween } from '../../lib/dates'
import { NOTIFICATION_META, type AppNotification } from '../notifications/types'

export interface TodoBadge {
  text: string
  /** Trong vòng một tuần (hoặc đã qua hạn) — tô theo tông cảnh báo. */
  urgent: boolean
}

/** Trong bao nhiêu ngày thì coi là "có hạn trong tuần". */
export const SOON_DAYS = 7

/**
 * Nhãn ngắn đứng đầu một việc.
 *
 * CÓ ngày → khoảng cách tới ngày đó. Đó là thứ quyết định thứ tự làm, và nó đọc được
 * nhanh hơn một ngày cụ thể ("27/08" bắt người ta tự trừ nhẩm).
 * KHÔNG có ngày → nhãn LOẠI từ `NOTIFICATION_META.badge`.
 *
 * Không lấy con số từ tiêu đề (mock có "14 MỤC"): muốn vậy phải regex trên văn xuôi do
 * 20 luật viết ra, mỗi luật một cách — sai một luật là nhãn nói một số không có thật.
 */
export function todoBadge(n: AppNotification, todayISO: string): TodoBadge {
  if (n.onISO) {
    const d = daysBetween(todayISO, n.onISO)
    if (d < 0) return { text: 'QUÁ HẠN', urgent: true }
    if (d === 0) return { text: 'HÔM NAY', urgent: true }
    return { text: `${d} NGÀY`, urgent: d <= SOON_DAYS }
  }
  return { text: NOTIFICATION_META[n.type].badge, urgent: false }
}

/** "Từ Tài sản · thẻ tín dụng" — màn đã sinh ra việc này. */
export function todoSource(n: AppNotification): string {
  return NOTIFICATION_META[n.type].source
}

/**
 * Bao nhiêu việc có hạn trong `SOON_DAYS` ngày — mệnh đề thứ hai của tiêu đề khối
 * ("4 việc · 1 có hạn trong tuần").
 *
 * Vì sao đáng in ra: trần 5 việc nghĩa là danh sách lúc nào cũng gần đầy, nên "4 việc"
 * một mình không nói được hôm nay có gì gấp hay không. Con số này thì nói.
 */
export function dueSoonCount(items: AppNotification[], todayISO: string): number {
  return items.filter((n) => n.onISO != null && daysBetween(todayISO, n.onISO) <= SOON_DAYS).length
}
