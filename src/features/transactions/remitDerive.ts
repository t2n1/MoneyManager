// Suy số tiền nhận và tỷ giá thực từ số tiền gửi, phí, tỷ giá có sẵn.
// Phí TRỪ TRƯỚC rồi mới áp tỷ giá: người nhận chỉ nhận phần còn lại.

import { convertFromBase, type Rates } from '../../lib/rates'

/**
 * Suy số VND mà người nhận được.
 * Phí trừ trước: (sent - fee) × rate, rồi áp convertFromBase để tính vòng tròn,
 * guard rate hợp lệ, và dùng chung cơ chế rounding với assets screen.
 * Trả null nếu không có tỷ giá, chưa nhập số gửi, phí >= số gửi, hoặc rate <= 0.
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

  // Phí TRỨ trước khi quy đổi: convertFromBase xử lý rounding, guard rate <= 0
  const afterFee = sent - fee
  const rates: Rates = { VND: rate }
  return convertFromBase(afterFee, 'JPY', 'VND', rates)
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
 * Số TIẾP THEO cho ô "Số nhận" khi sent/fee/rate đổi.
 *
 * Ca khó: số bên nhận báo lại là SỰ THẬT, tỷ giá chỉ là ƯỚC LƯỢNG. Một khi người dùng
 * đã gõ tay ô này, KHÔNG lần đổi sent/fee/rate nào được đạp lên số đó nữa — mất số họ
 * gõ thì phải hỏi lại người nhận, cái giá đó lớn hơn nhiều so với việc ô hiện tạm sai
 * một nhịp. Đây là lý do có cờ `touched` riêng, không suy nó từ `current !== 0`.
 */
export function nextReceived(args: {
  /** Số đang có trong ô "Số nhận". */
  current: number
  /** true = người dùng đã gõ tay ô này ít nhất một lần — không được ghi đè nữa. */
  touched: boolean
  sent: number
  fee: number
  rate: number | null
}): number {
  const { current, touched, sent, fee, rate } = args
  if (touched) return current
  // Chưa gõ tay: tỷ giá suy ra số mới; suy không được (chưa có tỷ giá, chưa nhập số
  // gửi…) thì GIỮ NGUYÊN số hiện tại — không xoá về 0 chỉ vì thiếu dữ liệu tạm thời.
  return deriveReceived(sent, fee, rate) ?? current
}
