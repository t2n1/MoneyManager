import { describe, expect, it } from 'vitest'
import { isBankClosed, isJapaneseHoliday, shiftToBusinessDay } from './jpHolidays'

describe('isJapaneseHoliday', () => {
  it('ngày lễ cố định', () => {
    expect(isJapaneseHoliday('2026-01-01')).toBe(true) // 元日
    expect(isJapaneseHoliday('2026-02-11')).toBe(true) // 建国記念の日
    expect(isJapaneseHoliday('2026-02-23')).toBe(true) // 天皇誕生日
    expect(isJapaneseHoliday('2026-04-29')).toBe(true) // 昭和の日
    expect(isJapaneseHoliday('2026-08-11')).toBe(true) // 山の日
    expect(isJapaneseHoliday('2026-11-03')).toBe(true) // 文化の日
    expect(isJapaneseHoliday('2026-11-23')).toBe(true) // 勤労感謝の日
  })

  it('lễ rơi vào Thứ 2 tuần thứ N', () => {
    expect(isJapaneseHoliday('2026-01-12')).toBe(true) // 成人の日, T2 tuần 2
    expect(isJapaneseHoliday('2026-07-20')).toBe(true) // 海の日, T2 tuần 3
    expect(isJapaneseHoliday('2026-09-21')).toBe(true) // 敬老の日, T2 tuần 3
    expect(isJapaneseHoliday('2026-10-12')).toBe(true) // スポーツの日, T2 tuần 2
  })

  it('xuân phân / thu phân trôi theo năm', () => {
    expect(isJapaneseHoliday('2026-03-20')).toBe(true)
    expect(isJapaneseHoliday('2026-09-23')).toBe(true)
    expect(isJapaneseHoliday('2027-03-21')).toBe(true)
    expect(isJapaneseHoliday('2027-09-23')).toBe(true)
  })

  it('lễ rơi Chủ nhật → nghỉ bù ngày thường kế tiếp', () => {
    // 3/5/2026 (憲法記念日) là CN; 4/5 và 5/5 cũng là lễ nên bù dồn sang 6/5
    expect(isJapaneseHoliday('2026-05-03')).toBe(true)
    expect(isJapaneseHoliday('2026-05-06')).toBe(true)
  })

  it('ngày thường kẹp giữa hai ngày lễ cũng nghỉ', () => {
    // 21/9/2026 敬老の日, 23/9 秋分の日 → 22/9 là 国民の休日
    expect(isJapaneseHoliday('2026-09-22')).toBe(true)
  })

  it('ngày thường không phải lễ', () => {
    expect(isJapaneseHoliday('2026-08-27')).toBe(false)
    expect(isJapaneseHoliday('2026-07-27')).toBe(false)
    expect(isJapaneseHoliday('2026-05-07')).toBe(false)
  })
})

describe('isBankClosed', () => {
  it('cuối tuần', () => {
    expect(isBankClosed('2026-06-27')).toBe(true) // T7
    expect(isBankClosed('2026-09-27')).toBe(true) // CN
  })

  it('kỳ nghỉ Tết dương 31/12 – 3/1', () => {
    expect(isBankClosed('2026-12-31')).toBe(true)
    expect(isBankClosed('2027-01-01')).toBe(true)
    expect(isBankClosed('2027-01-02')).toBe(true)
    expect(isBankClosed('2027-01-03')).toBe(true)
    expect(isBankClosed('2026-12-30')).toBe(false) // T4 thường, ngân hàng mở
  })

  it('ngày làm việc bình thường', () => {
    expect(isBankClosed('2026-08-27')).toBe(false)
  })
})

describe('shiftToBusinessDay', () => {
  it('ngày làm việc giữ nguyên', () => {
    expect(shiftToBusinessDay('2026-08-27')).toBe('2026-08-27')
  })

  it('Thứ 7 → Thứ 2', () => {
    expect(shiftToBusinessDay('2026-06-27')).toBe('2026-06-29')
  })

  it('Chủ nhật → Thứ 2', () => {
    expect(shiftToBusinessDay('2026-09-27')).toBe('2026-09-28')
  })

  it('nhảy qua cả cuối tuần lẫn ngày lễ', () => {
    // 25/4/2026 T7 → 26 CN → 27,28 T2/T3 mở cửa; nhưng 29/4 昭和の日:
    // ngày 29 phải nhảy sang 30/4 (T5)
    expect(shiftToBusinessDay('2026-04-29')).toBe('2026-04-30')
    // 2/5/2026 là T7, rồi 3/5 CN(lễ), 4/5 và 5/5 lễ, 6/5 nghỉ bù → 7/5 (T5)
    expect(shiftToBusinessDay('2026-05-02')).toBe('2026-05-07')
  })

  it('nhảy qua kỳ nghỉ Tết dương', () => {
    // 31/12/2026 (T5) đóng, 1–3/1/2027 đóng, 4/1 là T2 → mở
    expect(shiftToBusinessDay('2026-12-31')).toBe('2027-01-04')
  })
})
