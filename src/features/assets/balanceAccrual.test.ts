import { describe, expect, it } from 'vitest'
import { monthKeyForDate } from '../../lib/dates'
import {
  measureMonthlyContribution,
  projectBalance,
  type ContributionRow,
} from './balanceAccrual'

const r = (monthKey: string, minor: number): ContributionRow => ({ monthKey, minor })

/** Sổ thật của chủ app tính tới 2026-08: tháng 5 vào ¥20.000 (bù tháng 4), rồi ¥10.000/tháng. */
const THAT = [r('2026-05', 20_000), r('2026-06', 10_000), r('2026-07', 10_000), r('2026-08', 10_000)]

describe('measureMonthlyContribution', () => {
  it('không có dòng nào → không đo được', () => {
    expect(measureMonthlyContribution([])).toEqual({ minorPerMonth: 0, monthsObserved: 0 })
  })

  /**
   * Đây là lý do hàm này dùng TRUNG VỊ. Trung bình bốn tháng thật ra ¥12.500 — một mức
   * đóng không tồn tại trên hợp đồng nào — và sai số đó được nhân lên vài trăm lần ở con
   * số chiếu tới lúc nghỉ.
   */
  it('tháng bù không kéo mức đóng lên: ¥10.000, không phải ¥12.500', () => {
    expect(measureMonthlyContribution(THAT)).toEqual({
      minorPerMonth: 10_000,
      monthsObserved: 4,
    })
  })

  it('cộng nhiều dòng trong CÙNG một tháng thành một tháng', () => {
    const c = measureMonthlyContribution([r('2026-07', 4_000), r('2026-07', 6_000), r('2026-08', 10_000)])
    expect(c).toEqual({ minorPerMonth: 10_000, monthsObserved: 2 })
  })

  it('số tháng chẵn → trung vị là bình quân hai giá trị giữa', () => {
    const c = measureMonthlyContribution([r('a', 10_000), r('b', 20_000)])
    expect(c.minorPerMonth).toBe(15_000)
  })

  it('tháng KHÔNG có dòng nào thì không đếm — thiếu phiếu chưa phải là ngừng đóng', () => {
    // Ba tháng có đóng, tháng 6 chưa nhập phiếu. Nếu đếm tháng rỗng là 0 thì trung vị
    // tụt xuống ¥5.000 và con số chiếu tới hụt một nửa.
    const c = measureMonthlyContribution([r('2026-05', 10_000), r('2026-07', 10_000), r('2026-08', 10_000)])
    expect(c).toEqual({ minorPerMonth: 10_000, monthsObserved: 3 })
  })
})

describe('projectBalance', () => {
  /** Tháng theo cách người dùng chia tháng — xem chú thích ở projectBalance. */
  const NAY = { year: 2026, month: 8 }
  const DEU = { minorPerMonth: 10_000, monthsObserved: 4 }

  it('đếm đúng số tháng còn đóng tới đầu năm đích', () => {
    // 2026-09..2026-12 là 4 tháng, cộng 29 năm trọn 2027..2055 = 348 → 352.
    const p = projectBalance(50_000, DEU, 2056, NAY)
    expect(p).toEqual({ months: 352, minor: 50_000 + 352 * 10_000 })
  })

  it('mốc gần: nghỉ đầu năm sau thì chỉ còn mấy tháng cuối năm nay', () => {
    expect(projectBalance(50_000, DEU, 2027, NAY)).toEqual({
      months: 4,
      minor: 90_000,
    })
  })

  it('năm đích đã qua hoặc là năm nay → không chiếu', () => {
    expect(projectBalance(50_000, DEU, 2026, NAY)).toBeNull()
    expect(projectBalance(50_000, DEU, 2020, NAY)).toBeNull()
  })

  it('không đo được mức đóng → không chiếu, không lặng lẽ trả về chính số dư', () => {
    expect(projectBalance(50_000, { minorPerMonth: 0, monthsObserved: 0 }, 2056, NAY)).toBeNull()
  })

  it('nhập vào tháng 12 thì hết năm nay không còn tháng nào', () => {
    expect(projectBalance(0, DEU, 2027, { year: 2026, month: 12 })).toEqual({ months: 0, minor: 0 })
  })

  /**
   * Khoá lại lỗi đã có thật: bản đầu của `projectBalance` tự cắt `todayISO.slice(5,7)` ra
   * lấy tháng, nên luôn ra tháng DƯƠNG LỊCH và bỏ qua `month_start_day` — trong khi nửa
   * còn lại của cùng tính năng (`measureMonthlyContribution`) thì tôn trọng cài đặt đó.
   * Cùng một ngày, hai cách chia tháng, hai số tháng còn đóng khác nhau.
   */
  it('tháng phải do tầng gọi tính theo monthStartDay, không cắt từ chuỗi ngày', () => {
    const ngay = '2026-08-26'
    expect(projectBalance(0, DEU, 2027, monthKeyForDate(ngay, 1))?.months).toBe(4)
    // Ngày 26 chưa qua mốc 28 → vẫn thuộc "tháng 7" của người dùng → còn thêm một tháng.
    expect(projectBalance(0, DEU, 2027, monthKeyForDate(ngay, 28))?.months).toBe(5)
  })
})
