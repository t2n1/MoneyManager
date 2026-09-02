import { describe, expect, it } from 'vitest'
import { monthsBetween, verdictDrift, type VerdictPoint } from './verdictHistory'

const pt = (over: Partial<VerdictPoint> & Pick<VerdictPoint, 'month_on'>): VerdictPoint => ({
  fire_year: 2044,
  negative_year: null,
  end_age: 70,
  assets_end_minor: 230_000_000,
  display_currency: 'JPY',
  ...over,
})

const NOW = pt({ month_on: '2026-09-01', fire_year: 2045, assets_end_minor: 221_880_000 })

describe('monthsBetween', () => {
  it('đếm theo lịch, bỏ ngày', () => {
    expect(monthsBetween('2026-06-01', '2026-09-01')).toBe(3)
    expect(monthsBetween('2025-11-25', '2026-01-25')).toBe(2)
    expect(monthsBetween('2026-09-01', '2026-09-01')).toBe(0)
  })
})

describe('verdictDrift', () => {
  it('so với dòng CŨ NHẤT trong 6 tháng, không phải dòng liền trước', () => {
    const d = verdictDrift(
      [pt({ month_on: '2026-08-01', fire_year: 2045 }), pt({ month_on: '2026-06-01', fire_year: 2044 })],
      '2026-09-01',
      NOW,
    )
    expect(d?.monthsAgo).toBe(3)
    expect(d?.thenMonthOn).toBe('2026-06-01')
    expect(d?.fireThen).toBe(2044)
    expect(d?.fireNow).toBe(2045)
    expect(d?.changed).toBe(true)
  })

  it('dòng quá 6 tháng và dòng của chính tháng này đều không được chọn', () => {
    expect(
      verdictDrift([pt({ month_on: '2026-02-01' }), pt({ month_on: '2026-09-01' })], '2026-09-01', NOW),
    ).toBeNull()
    // Đúng 6 tháng thì còn trong cửa sổ.
    expect(verdictDrift([pt({ month_on: '2026-03-01' })], '2026-09-01', NOW)?.monthsAgo).toBe(6)
  })

  it('khác tuổi chiếu hoặc khác tiền hiển thị là khác thước — bỏ qua dòng đó', () => {
    const d = verdictDrift(
      [
        pt({ month_on: '2026-06-01', end_age: 90 }),
        pt({ month_on: '2026-07-01', display_currency: 'USD' }),
        pt({ month_on: '2026-08-01' }),
      ],
      '2026-09-01',
      NOW,
    )
    expect(d?.thenMonthOn).toBe('2026-08-01')
  })

  it('không đổi gì thì changed = false: tài sản lệch dưới 1% coi như không đổi', () => {
    const d = verdictDrift(
      [pt({ month_on: '2026-08-01', fire_year: 2045, assets_end_minor: 221_000_000 })],
      '2026-09-01',
      NOW, // 221.880.000 — lệch 0,4%
    )
    expect(d?.changed).toBe(false)
  })

  it('tài sản lệch từ 1% là đổi, dù FIRE giữ nguyên', () => {
    const d = verdictDrift(
      [pt({ month_on: '2026-08-01', fire_year: 2045, assets_end_minor: 230_000_000 })],
      '2026-09-01',
      NOW, // −3,5%
    )
    expect(d?.changed).toBe(true)
  })

  it('FIRE từ không đạt sang đạt, hay năm âm xuất hiện, đều là đổi', () => {
    expect(
      verdictDrift([pt({ month_on: '2026-08-01', fire_year: null, assets_end_minor: 221_880_000 })], '2026-09-01', NOW)
        ?.changed,
    ).toBe(true)
    expect(
      verdictDrift(
        [pt({ month_on: '2026-08-01', fire_year: 2045, assets_end_minor: 221_880_000 })],
        '2026-09-01',
        { ...NOW, negative_year: 2061 },
      )?.changed,
    ).toBe(true)
  })

  it('không có lịch sử thì null', () => {
    expect(verdictDrift([], '2026-09-01', NOW)).toBeNull()
  })
})
