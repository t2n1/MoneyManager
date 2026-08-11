import { describe, expect, it } from 'vitest'
import {
  addDaysISO,
  addMonths,
  clampMonthStartDay,
  daysBetween,
  dueDateLabel,
  dueRelativeLabel,
  formatMonthLabel,
  formatYearLabel,
  getMonthRange,
  getYearRange,
  monthKeyForDate,
  monthKeyString,
  nextCardDueDate,
  parseMonthKey,
  toISODate,
} from './dates'

describe('getMonthRange', () => {
  it('tháng dương lịch chuẩn (monthStartDay = 1)', () => {
    expect(getMonthRange({ year: 2026, month: 7 }, 1)).toEqual({
      start: '2026-07-01',
      end: '2026-08-01',
    })
  })

  it('cuộn sang năm mới ở tháng 12', () => {
    expect(getMonthRange({ year: 2026, month: 12 }, 1)).toEqual({
      start: '2026-12-01',
      end: '2027-01-01',
    })
  })

  it('tháng bắt đầu từ ngày 25', () => {
    expect(getMonthRange({ year: 2026, month: 7 }, 25)).toEqual({
      start: '2026-07-25',
      end: '2026-08-25',
    })
  })

  it('monthStartDay = 28 hợp lệ cả tháng 2 (không nhuận)', () => {
    expect(getMonthRange({ year: 2026, month: 2 }, 28)).toEqual({
      start: '2026-02-28',
      end: '2026-03-28',
    })
  })

  it('monthStartDay = 28 hợp lệ cả tháng 2 (nhuận)', () => {
    expect(getMonthRange({ year: 2028, month: 2 }, 28)).toEqual({
      start: '2028-02-28',
      end: '2028-03-28',
    })
  })
})

describe('monthKeyForDate', () => {
  it('monthStartDay = 1: tháng = tháng dương lịch', () => {
    expect(monthKeyForDate('2026-07-14', 1)).toEqual({ year: 2026, month: 7 })
  })

  it('trước ngày bắt đầu → thuộc tháng trước', () => {
    expect(monthKeyForDate('2026-07-24', 25)).toEqual({ year: 2026, month: 6 })
  })

  it('đúng ngày bắt đầu → thuộc tháng hiện tại', () => {
    expect(monthKeyForDate('2026-07-25', 25)).toEqual({ year: 2026, month: 7 })
  })

  it('đầu tháng 1 với monthStartDay = 25 → tháng 12 năm trước', () => {
    expect(monthKeyForDate('2026-01-01', 25)).toEqual({ year: 2025, month: 12 })
  })
})

describe('addMonths', () => {
  it('tiến/lùi trong năm', () => {
    expect(addMonths({ year: 2026, month: 7 }, 1)).toEqual({ year: 2026, month: 8 })
    expect(addMonths({ year: 2026, month: 7 }, -1)).toEqual({ year: 2026, month: 6 })
  })

  it('cuộn qua ranh giới năm', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
  })
})

describe('toISODate / formatMonthLabel', () => {
  it('toISODate dùng giờ địa phương, pad 2 chữ số', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('formatMonthLabel năm/tháng', () => {
    expect(formatMonthLabel({ year: 2026, month: 7 })).toBe('2026/07')
  })
})

describe('monthKeyString / parseMonthKey', () => {
  it('monthKeyString đệm 0 cho tháng < 10', () => {
    expect(monthKeyString({ year: 2026, month: 7 })).toBe('2026-07')
    expect(monthKeyString({ year: 2026, month: 12 })).toBe('2026-12')
  })

  it('parseMonthKey đảo ngược monthKeyString', () => {
    expect(parseMonthKey('2026-07')).toEqual({ year: 2026, month: 7 })
    expect(parseMonthKey(monthKeyString({ year: 2025, month: 1 }))).toEqual({
      year: 2025,
      month: 1,
    })
  })
})

describe('daysBetween', () => {
  it('cùng ngày = 0', () => expect(daysBetween('2026-07-10', '2026-07-10')).toBe(0))
  it('cách 1 ngày = 1', () => expect(daysBetween('2026-07-10', '2026-07-11')).toBe(1))
  it('qua ranh giới tháng', () => expect(daysBetween('2026-07-31', '2026-08-01')).toBe(1))
  it('cả tháng 7 = 31 ngày', () => expect(daysBetween('2026-07-01', '2026-08-01')).toBe(31))
  it('âm khi b trước a', () => expect(daysBetween('2026-07-11', '2026-07-10')).toBe(-1))
})

describe('addDaysISO', () => {
  it('cộng 1 ngày', () => expect(addDaysISO('2026-07-10', 1)).toBe('2026-07-11'))
  it('trừ 1 ngày qua ranh giới tháng', () => expect(addDaysISO('2026-08-01', -1)).toBe('2026-07-31'))
  it('delta 0 giữ nguyên', () => expect(addDaysISO('2026-07-10', 0)).toBe('2026-07-10'))
})

describe('clampMonthStartDay', () => {
  it('giữ nguyên giá trị hợp lệ', () => {
    expect(clampMonthStartDay(1)).toBe(1)
    expect(clampMonthStartDay(15)).toBe(15)
    expect(clampMonthStartDay(28)).toBe(28)
  })
  it('kẹp về biên', () => {
    expect(clampMonthStartDay(0)).toBe(1)
    expect(clampMonthStartDay(-5)).toBe(1)
    expect(clampMonthStartDay(29)).toBe(28)
    expect(clampMonthStartDay(31)).toBe(28)
  })
  it('làm tròn số thập phân', () => {
    expect(clampMonthStartDay(15.6)).toBe(16)
  })
  it('giá trị không hữu hạn → 1', () => {
    expect(clampMonthStartDay(NaN)).toBe(1)
  })
})

describe('getYearRange', () => {
  it('năm dương lịch chuẩn (monthStartDay = 1)', () => {
    expect(getYearRange(2026, 1)).toEqual({
      start: '2026-01-01',
      end: '2027-01-01',
    })
  })

  it('năm tài chính bắt đầu ngày 25 (lệch sang năm sau)', () => {
    expect(getYearRange(2026, 25)).toEqual({
      start: '2026-01-25',
      end: '2027-01-25',
    })
  })

  it('mặc định monthStartDay = 1', () => {
    expect(getYearRange(2030)).toEqual({
      start: '2030-01-01',
      end: '2031-01-01',
    })
  })
})

describe('formatYearLabel', () => {
  it('nhãn năm tiếng Việt', () => {
    expect(formatYearLabel(2026)).toBe('Năm 2026')
  })
})

describe('dueDateLabel / dueRelativeLabel', () => {
  it('gắn thứ trong tuần vào ngày đến hạn', () => {
    expect(dueDateLabel('2026-08-27')).toBe('T5, 8/27') // 2026/8/27 là Thứ 5
    expect(dueDateLabel('2026-06-29')).toBe('T2, 6/29') // đã dời từ T7 6/27
  })

  it('đếm ngược theo mốc hôm nay', () => {
    expect(dueRelativeLabel('2026-08-27', '2026-08-27')).toBe('hôm nay')
    expect(dueRelativeLabel('2026-08-26', '2026-08-27')).toBe('ngày mai')
    expect(dueRelativeLabel('2026-08-04', '2026-08-27')).toBe('còn 23 ngày')
  })

  it('hạn đã qua vẫn đọc là "hôm nay", không ra số âm', () => {
    expect(dueRelativeLabel('2026-08-28', '2026-08-27')).toBe('hôm nay')
  })
})

describe('nextCardDueDate', () => {
  it('ngày trả tháng này còn ở phía trước', () => {
    expect(nextCardDueDate(27, '2026-07-20')).toBe('2026-07-27')
  })

  it('đã qua ngày trả → sang tháng sau', () => {
    expect(nextCardDueDate(27, '2026-07-28')).toBe('2026-08-27')
  })

  it('rơi vào Thứ 7 → dời sang Thứ 2', () => {
    expect(nextCardDueDate(27, '2026-06-01')).toBe('2026-06-29')
  })

  it('rơi vào Chủ nhật → dời sang Thứ 2', () => {
    expect(nextCardDueDate(27, '2026-09-01')).toBe('2026-09-28')
  })

  it('ngày trả (đã dời) đúng bằng hôm nay → vẫn là kỳ tới', () => {
    expect(nextCardDueDate(27, '2026-06-29')).toBe('2026-06-29')
  })

  it('kẹp về cuối tháng ngắn; cuối tháng rơi cuối tuần vẫn dời sang Thứ 2', () => {
    // 31 → 28/02/2026 (Thứ 7) → 02/03/2026 (Thứ 2)
    expect(nextCardDueDate(31, '2026-02-01')).toBe('2026-03-02')
  })

  it('dời qua cả ngày lễ Nhật, không chỉ cuối tuần', () => {
    // 27/4/2030 là T7 → 29/4 nhưng đó là 昭和の日 → 30/4 (T3)
    expect(nextCardDueDate(27, '2030-04-01')).toBe('2030-04-30')
    // 20/9/2026 là CN → 21/9 敬老の日, 22/9 国民の休日, 23/9 秋分の日 → 24/9 (T5)
    expect(nextCardDueDate(20, '2026-09-01')).toBe('2026-09-24')
  })

  it('dời qua kỳ nghỉ Tết dương sang năm mới', () => {
    // 31/12/2026 ngân hàng đóng, 1–3/1/2027 cũng đóng → 4/1/2027 (T2)
    expect(nextCardDueDate(31, '2026-12-01')).toBe('2027-01-04')
  })
})
