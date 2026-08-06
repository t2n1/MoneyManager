import { describe, expect, it } from 'vitest'
import type { RecurringRuleRow, TransactionRow } from '../../types/database.types'
import type { Rates } from '../../lib/rates'
import {
  detectPaydays,
  hoursOfWork,
  paretoCut,
  paydayEffect,
  spendPercentiles,
  subscriptionSummary,
  weekdayProfile,
} from './behavior'

const RATES: Rates = { JPY: 1, VND: 165 }
const currencyOf = () => 'JPY' as const

let seq = 0
function tx(
  p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount' | 'occurred_on'>,
): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    to_amount: null,
    category_id: 'c1',
    account_id: 'a1',
    to_account_id: null,
    recurring_rule_id: null,
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  }
}

describe('paretoCut', () => {
  it('đếm số danh mục ít nhất gộp đủ 80%', () => {
    const r = paretoCut([
      { categoryId: 'a', amount: 500 },
      { categoryId: 'b', amount: 300 },
      { categoryId: 'c', amount: 100 },
      { categoryId: 'd', amount: 60 },
      { categoryId: 'e', amount: 40 },
    ])
    // 500+300 = 800/1000 = 80% → vừa đủ ở danh mục thứ 2
    expect(r?.count).toBe(2)
    expect(r?.share).toBeCloseTo(0.8)
    expect(r?.categoryIds).toEqual(['a', 'b'])
    expect(r?.categoryCount).toBe(5)
  })

  it('tự sắp lại nếu đầu vào chưa theo thứ tự', () => {
    const r = paretoCut([
      { categoryId: 'nho', amount: 10 },
      { categoryId: 'to', amount: 90 },
    ])
    expect(r?.categoryIds).toEqual(['to'])
    expect(r?.count).toBe(1)
  })

  it('chi dàn đều thì cần gần hết danh mục mới đủ 80%', () => {
    const r = paretoCut(['a', 'b', 'c', 'd', 'e'].map((categoryId) => ({ categoryId, amount: 100 })))
    expect(r?.count).toBe(4)
  })

  it('bỏ danh mục ≤ 0 và trả null khi không có chi', () => {
    expect(paretoCut([{ categoryId: 'a', amount: 0 }])).toBeNull()
    expect(paretoCut([])).toBeNull()
  })

  it('ngưỡng tùy chỉnh', () => {
    const r = paretoCut(
      [
        { categoryId: 'a', amount: 500 },
        { categoryId: 'b', amount: 300 },
        { categoryId: 'c', amount: 200 },
      ],
      0.5,
    )
    expect(r?.count).toBe(1)
  })
})

describe('spendPercentiles', () => {
  const mk = (amounts: number[]) =>
    amounts.map((amount) => tx({ type: 'expense', amount, occurred_on: '2026-05-01' }))

  it('trung vị và phân vị trên dãy đơn giản', () => {
    const r = spendPercentiles(mk([100, 200, 300, 400, 500]), currencyOf, 'JPY', RATES)
    expect(r?.median).toBe(300)
    expect(r?.p90).toBeCloseTo(460)
    expect(r?.max).toBe(500)
    expect(r?.count).toBe(5)
  })

  it('p5 < trung vị < p95 — khoảng chứa 90% số lần chi', () => {
    const r = spendPercentiles(mk([100, 200, 300, 400, 500]), currencyOf, 'JPY', RATES)
    expect(r!.p5).toBeLessThan(r!.median)
    expect(r!.median).toBeLessThan(r!.p95)
    expect(r?.p5).toBeCloseTo(120)
    expect(r?.p95).toBeCloseTo(480)
  })

  it('trả kèm từng khoản đã sắp tăng dần, để dựng cột phân bố', () => {
    const r = spendPercentiles(mk([300, 100, 500]), currencyOf, 'JPY', RATES)
    expect(r?.values).toEqual([100, 300, 500])
  })

  it('một khoản khổng lồ kéo trung bình lệch khỏi trung vị', () => {
    const r = spendPercentiles(mk([100, 100, 100, 100, 10_000]), currencyOf, 'JPY', RATES)
    expect(r?.median).toBe(100)
    expect(r?.mean).toBe(2080)
  })

  it('bỏ hoàn tiền, thu nhập, dòng tiền nợ và giao dịch ngoài thống kê', () => {
    const r = spendPercentiles(
      [
        tx({ type: 'expense', amount: 100, occurred_on: '2026-05-01' }),
        tx({ type: 'expense', amount: 999, occurred_on: '2026-05-02', is_refund: true }),
        tx({ type: 'income', amount: 999, occurred_on: '2026-05-03' }),
        tx({ type: 'expense', amount: 999, occurred_on: '2026-05-04', is_debt_flow: true }),
        tx({ type: 'expense', amount: 999, occurred_on: '2026-05-05', exclude_from_stats: true }),
      ],
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r?.count).toBe(1)
    expect(r?.median).toBe(100)
  })

  it('không có khoản chi nào → null', () => {
    expect(spendPercentiles([], currencyOf, 'JPY', RATES)).toBeNull()
  })
})

describe('detectPaydays', () => {
  it('nhận các khoản thu lớn là ngày lương, bỏ khoản lặt vặt', () => {
    const days = detectPaydays(
      [
        tx({ type: 'income', amount: 300_000, occurred_on: '2026-05-25' }),
        tx({ type: 'income', amount: 300_000, occurred_on: '2026-06-25' }),
        tx({ type: 'income', amount: 5_000, occurred_on: '2026-06-10' }), // tiền lẻ
        tx({ type: 'expense', amount: 900_000, occurred_on: '2026-06-11' }),
      ],
      currencyOf,
      'JPY',
      RATES,
    )
    expect(days).toEqual(['2026-05-25', '2026-06-25'])
  })

  it('không có khoản thu → mảng rỗng', () => {
    expect(detectPaydays([], currencyOf, 'JPY', RATES)).toEqual([])
  })
})

describe('paydayEffect', () => {
  const daily = [
    { date: '2026-05-25', expense: 9_000 },
    { date: '2026-05-26', expense: 9_000 },
    { date: '2026-05-27', expense: 9_000 },
    { date: '2026-05-28', expense: 3_000 },
    { date: '2026-05-29', expense: 3_000 },
    { date: '2026-05-30', expense: 3_000 },
  ]

  it('so chi mỗi ngày trong 3 ngày sau lương với ngày thường', () => {
    const r = paydayEffect(daily, ['2026-05-25'], 3)
    expect(r?.afterPayday).toBe(9_000)
    expect(r?.otherDays).toBe(3_000)
    expect(r?.ratio).toBe(3)
    expect(r?.daysInWindow).toBe(3)
    expect(r?.daysOutside).toBe(3)
  })

  it('cửa sổ phủ hết kỳ → null (không còn ngày thường để so)', () => {
    expect(paydayEffect(daily, ['2026-05-25'], 30)).toBeNull()
  })

  it('không có ngày lương → null', () => {
    expect(paydayEffect(daily, [], 3)).toBeNull()
  })
})

describe('weekdayProfile', () => {
  it('gom theo thứ và tính trung bình mỗi ngày', () => {
    // 2026-05-02 và 2026-05-09 là thứ Bảy; 2026-05-04 là thứ Hai
    const r = weekdayProfile([
      { date: '2026-05-02', expense: 10_000 },
      { date: '2026-05-09', expense: 20_000 },
      { date: '2026-05-04', expense: 1_000 },
    ])
    const sat = r[6]
    const mon = r[1]
    expect(sat.days).toBe(2)
    expect(sat.total).toBe(30_000)
    expect(sat.avg).toBe(15_000)
    expect(mon.avg).toBe(1_000)
    expect(r[0].avg).toBe(0) // chủ nhật không có ngày nào
  })

  it('luôn trả đủ 7 nhóm', () => {
    expect(weekdayProfile([])).toHaveLength(7)
  })
})

describe('subscriptionSummary', () => {
  const rule = (
    p: Partial<RecurringRuleRow> & Pick<RecurringRuleRow, 'id' | 'amount' | 'frequency'>,
  ): RecurringRuleRow => ({
    user_id: 'u',
    type: 'expense',
    to_amount: null,
    category_id: 'c1',
    account_id: 'a1',
    to_account_id: null,
    note: 'gói',
    start_on: '2026-01-01',
    end_on: null,
    is_paused: false,
    last_generated_on: null,
    created_at: '',
    updated_at: '',
    ...p,
  })

  it('quy mọi tần suất về mỗi tháng', () => {
    const r = subscriptionSummary(
      [
        rule({ id: 'r1', amount: 1_000, frequency: 'monthly' }),
        rule({ id: 'r2', amount: 12_000, frequency: 'yearly' }),
        rule({ id: 'r3', amount: 1_200, frequency: 'weekly' }),
      ],
      '2026-07-01',
      currencyOf,
      'JPY',
      RATES,
    )
    // 1000 + 1000 + 1200×52/12 = 7200
    expect(Math.round(r.monthly)).toBe(7_200)
    expect(Math.round(r.yearly)).toBe(86_400)
    expect(r.count).toBe(3)
    expect(r.items[0].id).toBe('r3') // hàng tuần tốn nhất
  })

  it('bỏ rule đã tạm dừng, đã hết hạn, và rule THU', () => {
    const r = subscriptionSummary(
      [
        rule({ id: 'r1', amount: 1_000, frequency: 'monthly' }),
        rule({ id: 'r2', amount: 9_000, frequency: 'monthly', is_paused: true }),
        rule({ id: 'r3', amount: 9_000, frequency: 'monthly', end_on: '2026-01-31' }),
        rule({ id: 'r4', amount: 9_000, frequency: 'monthly', type: 'income' }),
      ],
      '2026-07-01',
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r.monthly).toBe(1_000)
    expect(r.count).toBe(1)
  })

  it('thiếu tỷ giá → đánh dấu và không cộng bừa', () => {
    const r = subscriptionSummary(
      [rule({ id: 'r1', amount: 1_000, frequency: 'monthly' })],
      '2026-07-01',
      () => 'USD',
      'JPY',
      { JPY: 1 },
    )
    expect(r.monthly).toBe(0)
    expect(r.hasMissingRate).toBe(true)
  })
})

describe('hoursOfWork', () => {
  it('chia số tiền cho lương giờ', () => {
    expect(hoursOfWork(6_000, 1_500)).toBe(4)
  })

  it('chưa khai lương giờ hoặc số tiền ≤ 0 → null', () => {
    expect(hoursOfWork(6_000, null)).toBeNull()
    expect(hoursOfWork(6_000, 0)).toBeNull()
    expect(hoursOfWork(0, 1_500)).toBeNull()
  })
})
