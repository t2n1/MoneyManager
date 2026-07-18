import { describe, expect, it } from 'vitest'
import { listDueDates, nextDueDate, nthDueDate } from './recurring'

describe('nthDueDate', () => {
  it('weekly: cộng đúng 7 ngày mỗi kỳ', () => {
    expect(nthDueDate('2026-07-06', 'weekly', 0)).toBe('2026-07-06')
    expect(nthDueDate('2026-07-06', 'weekly', 1)).toBe('2026-07-13')
    expect(nthDueDate('2026-07-06', 'weekly', 4)).toBe('2026-08-03')
  })

  it('monthly: giữ ngày anchor, cuộn qua năm mới', () => {
    expect(nthDueDate('2026-01-15', 'monthly', 1)).toBe('2026-02-15')
    expect(nthDueDate('2026-11-15', 'monthly', 2)).toBe('2027-01-15')
  })

  it('monthly: anchor 31 clamp về cuối tháng ngắn rồi quay lại 31 (không trôi dần)', () => {
    expect(nthDueDate('2026-01-31', 'monthly', 1)).toBe('2026-02-28')
    expect(nthDueDate('2026-01-31', 'monthly', 2)).toBe('2026-03-31')
    expect(nthDueDate('2026-01-31', 'monthly', 3)).toBe('2026-04-30')
  })

  it('monthly: tháng 2 năm nhuận nhận ngày 29', () => {
    expect(nthDueDate('2028-01-31', 'monthly', 1)).toBe('2028-02-29')
  })

  it('yearly: anchor 29/2 clamp 28/2 năm thường, trở lại 29/2 năm nhuận', () => {
    expect(nthDueDate('2028-02-29', 'yearly', 1)).toBe('2029-02-28')
    expect(nthDueDate('2028-02-29', 'yearly', 4)).toBe('2032-02-29')
  })
})

describe('listDueDates', () => {
  const rule = {
    frequency: 'monthly' as const,
    start_on: '2026-04-25',
    end_on: null,
    is_paused: false,
    last_generated_on: null,
  }

  it('chưa sinh lần nào: sinh từ start_on đến hôm nay', () => {
    expect(listDueDates(rule, '2026-07-19')).toEqual(['2026-04-25', '2026-05-25', '2026-06-25'])
  })

  it('kỳ đúng hôm nay vẫn sinh (inclusive)', () => {
    expect(listDueDates(rule, '2026-05-25')).toEqual(['2026-04-25', '2026-05-25'])
  })

  it('đã sinh tới last_generated_on: chỉ sinh phần sau', () => {
    expect(listDueDates({ ...rule, last_generated_on: '2026-05-25' }, '2026-07-19')).toEqual([
      '2026-06-25',
    ])
  })

  it('cắt tại end_on', () => {
    expect(listDueDates({ ...rule, end_on: '2026-05-31' }, '2026-07-19')).toEqual([
      '2026-04-25',
      '2026-05-25',
    ])
  })

  it('tạm dừng → rỗng', () => {
    expect(listDueDates({ ...rule, is_paused: true }, '2026-07-19')).toEqual([])
  })

  it('start_on tương lai → rỗng', () => {
    expect(listDueDates(rule, '2026-04-01')).toEqual([])
  })
})

describe('nextDueDate', () => {
  it('chưa sinh: kỳ tới là start_on', () => {
    expect(
      nextDueDate({ frequency: 'weekly', start_on: '2026-08-01', end_on: null, last_generated_on: null }),
    ).toBe('2026-08-01')
  })

  it('đã sinh: kỳ kế tiếp sau last_generated_on (kể cả kỳ trước bị clamp)', () => {
    expect(
      nextDueDate({ frequency: 'monthly', start_on: '2026-01-31', end_on: null, last_generated_on: '2026-02-28' }),
    ).toBe('2026-03-31')
  })

  it('quá end_on → null', () => {
    expect(
      nextDueDate({ frequency: 'monthly', start_on: '2026-01-15', end_on: '2026-02-20', last_generated_on: '2026-02-15' }),
    ).toBe(null)
  })
})
