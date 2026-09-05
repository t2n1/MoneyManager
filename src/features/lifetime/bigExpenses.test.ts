import { describe, expect, it } from 'vitest'
import { buildBigExpenseMap, type GoalLikeInput, type PlannedLikeInput } from './bigExpenses'
import type { LifetimeEvent } from './project'
import type { FxOf } from './fxModel'

const TODAY = '2026-09-06'

const fxJpyOnly: FxOf = (from, to) => {
  if (from === to) return 1
  // 1 VND = 1/163 JPY (chiều major); thiếu USD để test nhánh ≈.
  if (from === 'VND' && to === 'JPY') return 1 / 163
  if (from === 'JPY' && to === 'VND') return 163
  return null
}

const ev = (over: Partial<LifetimeEvent>): LifetimeEvent => ({
  id: 'e1',
  startYear: 2027,
  endYear: 2027,
  kind: 'expense',
  amountMinor: 3_000_000,
  currency: 'JPY',
  label: 'Cưới',
  fxToDisplay: 1,
  inflate: false,
  ...over,
})

describe('buildBigExpenseMap', () => {
  it('sự kiện một lần: chia tới THÁNG 1 của năm đến hạn', () => {
    const map = buildBigExpenseMap({
      todayISO: TODAY,
      displayCurrency: 'JPY',
      events: [ev({})],
      planned: [],
      goals: [],
      fxOf: fxJpyOnly,
    })
    // 09/2026 → 01/2027 = 4 tháng
    expect(map.items).toHaveLength(1)
    expect(map.items[0].monthsLeft).toBe(4)
    expect(map.items[0].monthlyNeedMinor).toBe(750_000)
    expect(map.totalMonthlyNeedMinor).toBe(750_000)
  })

  it('khoản chi dự kiến có ngày: chia đúng số tháng, tối thiểu 1', () => {
    const planned: PlannedLikeInput[] = [
      { id: 'p1', title: 'Tiền nhà mới', amount: 300_000, currency: 'JPY', due_on: '2026-10-01' },
      { id: 'p2', title: 'Đã trễ hạn', amount: 50_000, currency: 'JPY', due_on: '2026-09-01' },
    ]
    const map = buildBigExpenseMap({
      todayISO: TODAY,
      displayCurrency: 'JPY',
      events: [],
      planned,
      goals: [],
      fxOf: fxJpyOnly,
    })
    const nha = map.items.find((i) => i.id === 'p1')!
    const tre = map.items.find((i) => i.id === 'p2')!
    expect(nha.monthsLeft).toBe(1)
    expect(nha.monthlyNeedMinor).toBe(300_000)
    expect(tre.monthsLeft).toBe(1) // kẹp sàn 1, không chia 0
  })

  it('mục tiêu: trừ phần đã dành, đã đạt thì rời bản đồ, không hạn thì không vào', () => {
    const goals: GoalLikeInput[] = [
      {
        id: 'g1',
        name: 'EB-3',
        targetMinor: 900_000,
        progressMinor: 80_000,
        currency: 'JPY',
        targetDate: '2027-07-31',
      },
      {
        id: 'g2',
        name: 'Đã xong',
        targetMinor: 100_000,
        progressMinor: 120_000,
        currency: 'JPY',
        targetDate: '2027-01-01',
      },
      {
        id: 'g3',
        name: 'Không hạn',
        targetMinor: 500_000,
        progressMinor: 0,
        currency: 'JPY',
        targetDate: null,
      },
    ]
    const map = buildBigExpenseMap({
      todayISO: TODAY,
      displayCurrency: 'JPY',
      events: [],
      planned: [],
      goals,
      fxOf: fxJpyOnly,
    })
    expect(map.items.map((i) => i.id)).toEqual(['g1'])
    // 09/2026 → 07/2027 = 10 tháng; (900k − 80k) ÷ 10 = 82k
    expect(map.items[0].monthsLeft).toBe(10)
    expect(map.items[0].monthlyNeedMinor).toBe(82_000)
  })

  it('sự kiện lặp nhiều năm: cần/tháng = số năm ÷ 12, đổ vào từng năm của chân trời', () => {
    const map = buildBigExpenseMap({
      todayISO: TODAY,
      displayCurrency: 'JPY',
      events: [ev({ id: 'bo-me', label: 'Hỗ trợ bố mẹ', startYear: 2026, endYear: 2050, amountMinor: 360_000 })],
      planned: [],
      goals: [],
      fxOf: fxJpyOnly,
    })
    expect(map.items[0].recurring).toBe(true)
    expect(map.items[0].monthlyNeedMinor).toBe(30_000)
    // Chân trời 10 năm: 2026..2035 đều mang 360k
    expect(map.yearPressure).toHaveLength(10)
    expect(map.yearPressure[0]).toEqual({ year: 2026, totalMinor: 360_000, onceCount: 0 })
  })

  it('năm nặng = năm có ≥2 khoản MỘT LẦN; khoản lặp không tính vào đếm', () => {
    const map = buildBigExpenseMap({
      todayISO: TODAY,
      displayCurrency: 'JPY',
      events: [
        ev({ id: 'cuoi', startYear: 2027, endYear: 2027 }),
        ev({ id: 'bo-me', startYear: 2026, endYear: 2050, amountMinor: 360_000 }),
      ],
      planned: [],
      goals: [
        {
          id: 'g1',
          name: 'EB-3',
          targetMinor: 900_000,
          progressMinor: 0,
          currency: 'JPY',
          targetDate: '2027-07-31',
        },
      ],
      fxOf: fxJpyOnly,
    })
    expect(map.heavyYears).toEqual([2027])
    const y2027 = map.yearPressure.find((y) => y.year === 2027)!
    expect(y2027.onceCount).toBe(2)
    expect(y2027.totalMinor).toBe(3_000_000 + 900_000 + 360_000)
  })

  it('thiếu tỷ giá: dòng vẫn hiện nhưng không cộng vào tổng, bật cờ ≈', () => {
    const planned: PlannedLikeInput[] = [
      { id: 'p1', title: 'Học phí Mỹ', amount: 200_000, currency: 'USD', due_on: '2027-08-01' },
      { id: 'p2', title: 'Vé về VN', amount: 8_000_000_00, currency: 'VND', due_on: '2027-01-15' },
    ]
    const map = buildBigExpenseMap({
      todayISO: TODAY,
      displayCurrency: 'JPY',
      events: [],
      planned,
      goals: [],
      fxOf: fxJpyOnly,
    })
    const usd = map.items.find((i) => i.id === 'p1')!
    expect(usd.remainingMinor).toBeNull()
    expect(usd.monthlyNeedMinor).toBeNull()
    expect(map.hasMissingFx).toBe(true)
    const vnd = map.items.find((i) => i.id === 'p2')!
    expect(vnd.remainingMinor).not.toBeNull()
    expect(map.totalMonthlyNeedMinor).toBe(vnd.monthlyNeedMinor)
    // Dòng thiếu tỷ giá không được lọt vào áp lực năm
    expect(map.yearPressure.every((y) => y.totalMinor > 0)).toBe(true)
  })

  it('sự kiện quá khứ và thu nhập không vào bản đồ', () => {
    const map = buildBigExpenseMap({
      todayISO: TODAY,
      displayCurrency: 'JPY',
      events: [
        ev({ id: 'qua-khu', startYear: 2024, endYear: 2024 }),
        ev({ id: 'thu-nhap', kind: 'income' }),
      ],
      planned: [],
      goals: [],
      fxOf: fxJpyOnly,
    })
    expect(map.items).toHaveLength(0)
  })

  it('sắp xếp: một lần trước khoản lặp, gần hạn trước, cùng năm thì nặng tay trước', () => {
    const map = buildBigExpenseMap({
      todayISO: TODAY,
      displayCurrency: 'JPY',
      events: [
        ev({ id: 'bo-me', label: 'Hỗ trợ bố mẹ', startYear: 2026, endYear: null, amountMinor: 360_000 }),
        ev({ id: 'cuoi', startYear: 2027, endYear: 2027 }),
      ],
      planned: [
        { id: 'nha', title: 'Tiền nhà mới', amount: 300_000, currency: 'JPY', due_on: '2026-10-01' },
      ],
      goals: [
        {
          id: 'eb3',
          name: 'EB-3',
          targetMinor: 900_000,
          progressMinor: 0,
          currency: 'JPY',
          targetDate: '2027-07-31',
        },
      ],
      fxOf: fxJpyOnly,
    })
    expect(map.items.map((i) => i.id)).toEqual(['nha', 'cuoi', 'eb3', 'bo-me'])
  })
})
