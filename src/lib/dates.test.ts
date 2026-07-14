import { describe, expect, it } from 'vitest'
import {
  addMonths,
  formatMonthLabel,
  getMonthRange,
  monthKeyForDate,
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

  it('formatMonthLabel tiếng Việt', () => {
    expect(formatMonthLabel({ year: 2026, month: 7 })).toBe('Tháng 7/2026')
  })
})
