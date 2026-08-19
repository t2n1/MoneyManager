// Suy số tiền nhận và tỷ giá thực từ số tiền gửi, phí, tỷ giá có sẵn.
// Phí TRỪ TRƯỚC rồi mới áp tỷ giá: người nhận chỉ nhận phần còn lại.

import { ageLabel } from '../../lib/freshness'

/**
 * Suy số VND mà người nhận được.
 * Phí trừ trước: (sent - fee) × rate.
 * Trả null nếu không có tỷ giá, chưa nhập số gửi, hoặc phí >= số gửi.
 */
export function deriveReceived(
  sent: number,
  fee: number,
  rate: number | null,
): number | null {
  // Chưa có tỷ giá
  if (rate == null) return null
  // Chưa nhập số gửi
  if (sent <= 0) return null
  // Phí lớn hơn hoặc bằng số gửi — không thể có số âm
  if (fee >= sent) return null

  const received = (sent - fee) * rate
  return Math.round(received)
}

/**
 * Tỷ giá thực tế mà người dùng đạt được.
 * Người dùng thấy số bank bị trừ = sent + fee, nên tỷ giá thực chia cho tổng đó.
 * Trả null nếu không thể tính.
 */
export function effectiveRate(
  sent: number,
  fee: number,
  received: number | null,
): number | null {
  if (received == null) return null
  if (sent <= 0) return null
  // Tổng bị trừ từ account = sent + fee
  const totalDeducted = sent + fee
  if (totalDeducted <= 0) return null
  return received / totalDeducted
}

/**
 * Mô tả tuổi của tỷ giá được lấy.
 * @param fetchedAt Mốc lấy tỷ giá (ms)
 * @param now Thời điểm hiện tại (ms)
 */
export function rateAgeLabel(fetchedAt: number, now: number): string {
  const age = now - fetchedAt
  return ageLabel(age)
}
