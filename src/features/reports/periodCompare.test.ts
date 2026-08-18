import { describe, expect, it } from 'vitest'
import { elapsedDays, periodCompare, periodDaysLabel, prorate } from './periodCompare'

describe('periodCompare', () => {
  /** Tháng 8: 18 ngày đầu chi 12 mỗi ngày. Tháng 7: 31 ngày, mỗi ngày chi 10. */
  const thang8 = [...Array<number>(18).fill(12), ...Array<number>(13).fill(0)]
  const thang7 = Array<number>(31).fill(10)

  it('CẮT kỳ trước về cùng số ngày — dấu không được đảo', () => {
    const r = periodCompare({ current: thang8, prior: thang7, daysElapsed: 18, daysInPeriod: 31 })
    // 18 ngày: 216 vs 180 → +20%. So với TRỌN tháng 7 (310) sẽ ra −30%: ngược dấu.
    expect(r?.spent).toBe(216)
    expect(r?.priorSameDays).toBe(180)
    expect(r?.deltaPct).toBe(20)
  })

  it('trọn kỳ trước vẫn trả về, nhưng KHÔNG phải mẫu số', () => {
    const r = periodCompare({ current: thang8, prior: thang7, daysElapsed: 18, daysInPeriod: 31 })
    expect(r?.priorFull).toBe(310)
    // Nếu ai đó lỡ dùng priorFull làm mẫu số thì sẽ ra số này — phải KHÁC deltaPct.
    expect(Math.round(((216 - 310) / 310) * 100)).not.toBe(r?.deltaPct)
  })

  it('kỳ đã xong: phép cắt thành phép không cắt', () => {
    const r = periodCompare({ current: thang7, prior: thang7, daysElapsed: 31, daysInPeriod: 31 })
    expect(r?.partial).toBe(false)
    expect(r?.spent).toBe(310)
    expect(r?.priorSameDays).toBe(310)
    expect(r?.deltaPct).toBe(0)
    expect(r?.daysLeft).toBe(0)
  })

  it('kỳ trước dài hơn kỳ này (31 → 30 ngày) vẫn cắt theo số ngày ĐÃ TRÔI', () => {
    const r = periodCompare({
      current: Array<number>(30).fill(10),
      prior: Array<number>(31).fill(10),
      daysElapsed: 5,
      daysInPeriod: 30,
    })
    expect(r?.spent).toBe(50)
    expect(r?.priorSameDays).toBe(50)
    expect(r?.deltaPct).toBe(0)
  })

  it('kỳ trước không chi gì trong mấy ngày đó → null, không phải một con số vô hạn', () => {
    const r = periodCompare({
      current: [100, 100],
      prior: [0, 0, 50, 50],
      daysElapsed: 2,
      daysInPeriod: 30,
    })
    expect(r?.priorSameDays).toBe(0)
    expect(r?.deltaPct).toBeNull()
  })

  it('không có kỳ trước → null', () => {
    expect(periodCompare({ current: [10], prior: [], daysElapsed: 1, daysInPeriod: 31 })).toBeNull()
  })

  it('ngày 1 của kỳ: so đúng ngày 1 của kỳ trước', () => {
    const r = periodCompare({
      current: [40, 0, 0],
      prior: [10, 500, 500],
      daysElapsed: 1,
      daysInPeriod: 31,
    })
    expect(r?.deltaPct).toBe(300)
    expect(r?.daysLeft).toBe(30)
  })

  it('daysElapsed quá tổng số ngày bị cắt về tổng số ngày', () => {
    const r = periodCompare({ current: thang8, prior: thang7, daysElapsed: 99, daysInPeriod: 31 })
    expect(r?.daysElapsed).toBe(31)
    expect(r?.partial).toBe(false)
  })

  it('daysElapsed = 0 → chưa có ngày nào để so', () => {
    const r = periodCompare({ current: thang8, prior: thang7, daysElapsed: 0, daysInPeriod: 31 })
    expect(r?.spent).toBe(0)
    expect(r?.priorSameDays).toBe(0)
    expect(r?.deltaPct).toBeNull()
  })
})

describe('elapsedDays', () => {
  it('cắt về [0, tổng]', () => {
    expect(elapsedDays(18, 31)).toBe(18)
    expect(elapsedDays(0, 31)).toBe(0)
    expect(elapsedDays(-3, 31)).toBe(0)
    expect(elapsedDays(40, 31)).toBe(31)
    expect(elapsedDays(18.9, 31)).toBe(18)
  })
})

describe('periodDaysLabel', () => {
  it('kỳ đang dở in cả phần còn lại', () => {
    expect(periodDaysLabel({ daysElapsed: 18, daysInPeriod: 31, daysLeft: 13 })).toBe(
      '18/31 ngày · còn 13',
    )
  })

  it('kỳ đã xong không in "còn 0"', () => {
    expect(periodDaysLabel({ daysElapsed: 31, daysInPeriod: 31, daysLeft: 0 })).toBe('31 ngày')
  })
})

describe('prorate', () => {
  it('cắt theo tỷ lệ đều', () => {
    expect(prorate(310, 18, 31)).toBe(180)
  })

  it('kỳ đã xong → giữ nguyên', () => {
    expect(prorate(310, 31, 31)).toBe(310)
  })

  it('mẫu số 0 → 0, không NaN', () => {
    expect(prorate(310, 5, 0)).toBe(0)
  })
})
