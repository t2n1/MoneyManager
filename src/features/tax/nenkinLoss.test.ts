import { describe, expect, it } from 'vitest'
import { annualPensionLoss, HOSHU_HIREI_COEF } from './nenkinLoss'

describe('annualPensionLoss', () => {
  /**
   * Bài test quan trọng nhất của file: dựng lại đúng con số ¥1.315 mà 基金 tự in trên
   * sheet mô phỏng cá nhân (プラン①, ¥20.000/tháng). Tụt 1 bậc quanh mức lương chủ app là
   * ¥20.000 標準報酬月額, một năm tham gia là 12 tháng.
   *
   * `20.000 × 5,481/1000 × 12 = ¥1.315,44`. Khớp tới từng yên nghĩa là hệ số 5,481/1000
   * dùng đúng — không phải tự bịa một hệ số nghe hợp lý.
   */
  it('dựng lại đúng ¥1.315/năm của sheet 基金', () => {
    expect(annualPensionLoss(20_000, 12)).toBe(1_315)
  })

  it('tuyến tính theo số tháng tham gia', () => {
    expect(annualPensionLoss(20_000, 360)).toBe(Math.round(20_000 * HOSHU_HIREI_COEF * 360))
    expect(annualPensionLoss(20_000, 0)).toBe(0)
  })

  it('không tụt bậc thì không mất gì', () => {
    expect(annualPensionLoss(0, 360)).toBe(0)
  })

  /**
   * Số âm ở đây nghĩa là "được THÊM lương hưu nhờ đóng 掛金" — điều không xảy ra. Trả 0
   * thay vì để một con số ngược dấu chảy ra màn hình.
   */
  it('đầu vào âm hoặc không hữu hạn → 0, không trả số ngược dấu', () => {
    expect(annualPensionLoss(-20_000, 12)).toBe(0)
    expect(annualPensionLoss(20_000, -12)).toBe(0)
    expect(annualPensionLoss(Number.NaN, 12)).toBe(0)
    expect(annualPensionLoss(20_000, Number.POSITIVE_INFINITY)).toBe(0)
  })
})
