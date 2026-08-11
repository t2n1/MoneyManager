import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import { accountMonthlyGrowth, goalForecast, monthlyNeeded } from './goals'

let seq = 0
function tx(
  p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount' | 'occurred_on'>,
): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    to_amount: null,
    category_id: 'c1',
    account_id: 'other',
    to_account_id: null,
    recurring_rule_id: null,
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  }
}

const MONTHS = [
  { year: 2026, month: 4 },
  { year: 2026, month: 5 },
  { year: 2026, month: 6 },
]
const SAVE = 'save-acc'

describe('accountMonthlyGrowth', () => {
  it('cộng chuyển khoản vào, trừ chi trực tiếp', () => {
    const g = accountMonthlyGrowth(
      SAVE,
      [
        tx({ type: 'transfer', amount: 90_000, occurred_on: '2026-04-25', to_account_id: SAVE, category_id: null }),
        tx({ type: 'transfer', amount: 90_000, occurred_on: '2026-05-25', to_account_id: SAVE, category_id: null }),
        tx({ type: 'transfer', amount: 120_000, occurred_on: '2026-06-25', to_account_id: SAVE, category_id: null }),
        tx({ type: 'expense', amount: 30_000, occurred_on: '2026-06-26', account_id: SAVE }),
      ],
      MONTHS,
      1,
    )
    expect(g).toBe(90_000) // (90 + 90 + 120 − 30) / 3
  })

  it('chuyển khoản RA khỏi tài khoản làm giảm tốc độ', () => {
    const g = accountMonthlyGrowth(
      SAVE,
      [
        tx({ type: 'transfer', amount: 300_000, occurred_on: '2026-04-01', to_account_id: SAVE, category_id: null }),
        tx({ type: 'transfer', amount: 300_000, occurred_on: '2026-05-01', account_id: SAVE, to_account_id: 'bank', category_id: null }),
      ],
      MONTHS,
      1,
    )
    expect(g).toBe(0)
  })

  it('hoàn tiền cộng lại vào số dư', () => {
    const g = accountMonthlyGrowth(
      SAVE,
      [tx({ type: 'expense', amount: 30_000, occurred_on: '2026-05-05', account_id: SAVE, is_refund: true })],
      MONTHS,
      1,
    )
    expect(g).toBe(10_000)
  })

  it('chuyển xuyên tệ lấy số thực nhận', () => {
    const g = accountMonthlyGrowth(
      SAVE,
      [
        tx({
          type: 'transfer',
          amount: 1_000_000,
          to_amount: 6_000,
          occurred_on: '2026-05-01',
          to_account_id: SAVE,
          category_id: null,
        }),
      ],
      MONTHS,
      1,
    )
    expect(g).toBe(2_000)
  })

  it('bỏ giao dịch của tài khoản khác và ngoài kỳ', () => {
    const g = accountMonthlyGrowth(
      SAVE,
      [
        tx({ type: 'income', amount: 999_000, occurred_on: '2026-05-01', account_id: 'other' }),
        tx({ type: 'income', amount: 999_000, occurred_on: '2020-05-01', account_id: SAVE }),
      ],
      MONTHS,
      1,
    )
    expect(g).toBe(0)
  })

  it('không có tháng nào → null', () => {
    expect(accountMonthlyGrowth(SAVE, [], [], 1)).toBeNull()
  })
})

describe('goalForecast', () => {
  const now = { year: 2026, month: 7 }

  it('dự báo tháng đạt đích theo tốc độ hiện tại', () => {
    const f = goalForecast(400_000, 1_000_000, 100_000, now, null, 1)
    expect(f.remaining).toBe(600_000)
    expect(f.monthsLeft).toBe(6)
    expect(f.etaMonth).toEqual({ year: 2027, month: 1 })
    expect(f.ratio).toBeCloseTo(0.4)
  })

  it('đã đạt đích → xong ngay, không dự báo nữa', () => {
    const f = goalForecast(1_200_000, 1_000_000, 50_000, now, null, 1)
    expect(f.done).toBe(true)
    expect(f.monthsLeft).toBe(0)
    expect(f.ratio).toBe(1)
  })

  it('số dư đứng yên hoặc đang tụt → không bịa ra ngày đạt', () => {
    expect(goalForecast(100_000, 1_000_000, 0, now, null, 1).etaMonth).toBeNull()
    expect(goalForecast(100_000, 1_000_000, -20_000, now, null, 1).monthsLeft).toBeNull()
  })

  it('so với hạn tự đặt: kịp hay trễ', () => {
    const ahead = goalForecast(400_000, 1_000_000, 100_000, now, '2027-06-01', 1)
    expect(ahead.vsDeadline).toBe('ahead')
    const behind = goalForecast(400_000, 1_000_000, 100_000, now, '2026-09-01', 1)
    expect(behind.vsDeadline).toBe('behind')
  })

  it('đạt đúng tháng hạn vẫn tính là kịp', () => {
    const f = goalForecast(400_000, 1_000_000, 100_000, now, '2027-01-20', 1)
    expect(f.vsDeadline).toBe('ahead')
  })

  it('tốc độ quá chậm (hơn 50 năm) → không hiện ngày cho đỡ vô nghĩa', () => {
    const f = goalForecast(0, 100_000_000, 1_000, now, null, 1)
    expect(f.monthsLeft).toBeNull()
  })

  it('chưa có tốc độ (null) → coi như đứng yên', () => {
    const f = goalForecast(100_000, 1_000_000, null, now, null, 1)
    expect(f.monthlyGrowth).toBe(0)
    expect(f.etaMonth).toBeNull()
  })
})

describe('monthlyNeeded', () => {
  const thang9 = { year: 2026, month: 9 }

  it('chia đều số còn thiếu cho các tháng còn lại, tính cả tháng đến hạn', () => {
    // 9,10,11,12 = 4 tháng → 300.000 mỗi tháng.
    expect(monthlyNeeded(1_200_000, '2026-12-20', thang9, 1)).toBe(300_000)
  })

  it('hạn ngay trong tháng đang lập → phải đủ luôn trong tháng này', () => {
    expect(monthlyNeeded(500_000, '2026-09-30', thang9, 1)).toBe(500_000)
  })

  it('làm tròn LÊN — hụt một đồng cũng là không kịp', () => {
    expect(monthlyNeeded(1000, '2026-11-01', thang9, 1)).toBe(334)
  })

  it('không đặt hạn thì không có gì để chia', () => {
    expect(monthlyNeeded(1_000_000, null, thang9, 1)).toBeNull()
  })

  it('đã đủ rồi thì thôi', () => {
    expect(monthlyNeeded(0, '2026-12-20', thang9, 1)).toBeNull()
    expect(monthlyNeeded(-5, '2026-12-20', thang9, 1)).toBeNull()
  })

  it('hạn đã trôi qua → null, vì "mỗi tháng bao nhiêu" hết nghĩa', () => {
    expect(monthlyNeeded(1_000_000, '2026-08-01', thang9, 1)).toBeNull()
  })
})
