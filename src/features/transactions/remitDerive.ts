// Suy số VND người nhận được từ SỐ GỬI và tỷ giá. KHÔNG trừ phí ở đây.
//
// Ô "Số gửi" của form giữ số RÒNG, không phải số bị trừ khỏi ví: `roleSave.ts`
// (`const amount = base.amount + v.fee`, "amount = số gửi + phí") cộng phí vào rồi mới
// ghi, nên `base.amount` CHÍNH LÀ số gửi. Chiều ngược lại cũng vậy —
// `remittance/aggregate.ts` lấy lại số gửi bằng `amount − fee`, và bản demo ghi
// `amount: 30_000`, `remit_fee_jpy: 500`, `remit_received_vnd: 29_500 × 166` (demoRepo.ts).
// Quan hệ chốt của cả sổ vì vậy là: **received = số gửi × rate**.
//
// Trừ phí thêm một lần ở đây là trừ HAI LẦN: người nhận bị hụt đúng `fee × rate`, và ở
// dạng "Tài khoản tôi ở VN" thì `saveRemit` ghi `to_amount: v.received` nên chính ví VND
// bị ghi thiếu — sai sổ, không phải sai chỗ hiển thị.

import { convertFromBase, type Rates } from '../../lib/rates'

/**
 * Suy số VND mà người nhận được: `sent × rate`.
 * Đi qua convertFromBase để dùng chung cơ chế rounding + guard rate của màn Tài sản.
 * Trả null nếu không có tỷ giá, chưa nhập số gửi, hoặc rate <= 0.
 */
export function deriveReceived(sent: number, rate: number | null): number | null {
  // Chưa có tỷ giá
  if (rate == null) return null
  // Chưa nhập số gửi
  if (sent <= 0) return null

  // convertFromBase xử lý rounding, guard rate <= 0
  const rates: Rates = { VND: rate }
  return convertFromBase(sent, 'JPY', 'VND', rates)
}

/**
 * Số TIẾP THEO cho ô "Số nhận" khi sent/rate đổi.
 *
 * Ca khó: số bên nhận báo lại là SỰ THẬT, tỷ giá chỉ là ƯỚC LƯỢNG. Một khi người dùng
 * đã gõ tay ô này, KHÔNG lần đổi sent/rate nào được đạp lên số đó nữa — mất số họ gõ thì
 * phải hỏi lại người nhận, cái giá đó lớn hơn nhiều so với việc ô hiện tạm sai một nhịp.
 * Đây là lý do có cờ `touched` riêng, không suy nó từ `current !== 0`.
 *
 * KHÔNG nhận `fee`: số nhận không phụ thuộc phí (xem đầu file), nên cầm theo một tham số
 * không đọc là mời người sau nối lại phép trừ hai lần.
 */
export function nextReceived(args: {
  /** Số đang có trong ô "Số nhận". */
  current: number
  /** true = người dùng đã gõ tay ô này ít nhất một lần — không được ghi đè nữa. */
  touched: boolean
  sent: number
  rate: number | null
}): number {
  const { current, touched, sent, rate } = args
  if (touched) return current
  // Chưa gõ tay: tỷ giá suy ra số mới; suy không được (chưa có tỷ giá, chưa nhập số
  // gửi…) thì GIỮ NGUYÊN số hiện tại — không xoá về 0 chỉ vì thiếu dữ liệu tạm thời.
  return deriveReceived(sent, rate) ?? current
}
