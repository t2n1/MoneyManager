import { tr } from '../i18n'
// Một nguồn dữ liệu đang ở đâu: đã về, còn chờ, hay đã hỏng hẳn.
//
// Vì sao có file này: nguyên tắc chung của app là KHÔNG in số tạm như số thật khi đang
// tải — chỗ đó nói "Đang tính…". Nhưng nếu chỉ phân hai trạng thái (có / chưa có) thì một
// truy vấn LỖI hẳn cũng là "chưa có", và màn hình kẹt ở "Đang tính…" mãi mãi. Ba trạng
// thái tách được hai ca đó: chờ thì nói đang tính, lỗi thì nói không tải được và cho thử
// lại. Cả hai ca đều không in số.
//
// Thuần, không React: nhận đúng ba trường của một kết quả react-query.

export type LoadStatus = 'ready' | 'pending' | 'failed'

/**
 * - Có dữ liệu → `ready`, kể cả khi lượt tải lại sau đó lỗi: react-query giữ bản cũ, và
 *   bản cũ vẫn là số thật.
 * - Không có dữ liệu mà đã lỗi và KHÔNG còn đang thử lại → `failed`.
 * - Còn lại → `pending`. Đang thử lại sau lỗi cũng là pending: người vừa bấm "Thử lại"
 *   phải thấy app đang làm, không phải câu báo lỗi đứng yên.
 *
 * Truy vấn bị tắt (`enabled: false`) không có dữ liệu cũng không lỗi → pending. Nơi gọi
 * tự quyết định ca đó có nghĩa gì với mình.
 */
export function loadStatus(q: { data: unknown; isError: boolean; isFetching: boolean }): LoadStatus {
  if (q.data !== undefined) return 'ready'
  if (q.isError && !q.isFetching) return 'failed'
  return 'pending'
}

/**
 * Gộp nhiều nguồn cho một con số cần tất cả. `failed` thắng `pending`: chờ thêm một nguồn
 * khác trong khi một nguồn đã chết thì vẫn không bao giờ ra số.
 */
export function mergeLoad(...all: LoadStatus[]): LoadStatus {
  if (all.includes('failed')) return 'failed'
  if (all.includes('pending')) return 'pending'
  return 'ready'
}

/** Chữ đứng thay con số khi nguồn chưa sẵn sàng. */
export function pendingText(s: Exclude<LoadStatus, 'ready'>): string {
  return s === 'failed' ? tr('Chưa tải được') : tr('Đang tính…')
}
