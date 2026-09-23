import { describe, expect, it } from 'vitest'
import { accountCurrentValue, valueBasisLabel, type CurrentValueAccount } from './currentValue'
import type { AccountPortfolioSummary } from './useAccountPortfolio'

const TODAY = '2026-09-23'

const acc = (p: Partial<CurrentValueAccount> = {}): CurrentValueAccount => ({
  type: 'investment',
  initial_balance: 0,
  salvage_value: 0,
  depreciation_months: null,
  depreciation_from: null,
  ...p,
})

const summary = (marketValue: number | null): AccountPortfolioSummary => ({
  kind: 'funds',
  marketValue,
  cost: 80_809,
  unrealizedPnl: 0,
  unrealizedPercent: null,
  count: 1,
  session: '2026-09-22',
  cash: null,
})

describe('accountCurrentValue — một số cho cả ba màn', () => {
  it('NISA có sổ lệnh: giá thị trường, không phải số dư sổ (ví dụ thật ¥78.913 / ¥80.809)', () => {
    // Trang chi tiết in ¥78.913; Cài đặt và Mục tiêu từng in ¥80.809. Nay cùng một số.
    expect(accountCurrentValue(acc(), 80_809, 80_100, summary(78_913), TODAY)).toEqual({
      value: 78_913,
      basis: 'market',
    })
  })

  it('có sổ lệnh mà không định giá được → số dư sổ, KHÔNG rơi về ảnh chụp cũ', () => {
    expect(accountCurrentValue(acc(), 80_809, 80_100, summary(null), TODAY)).toEqual({
      value: 80_809,
      basis: 'ledger',
    })
  })

  it('không có sổ lệnh (hoặc còn đang tải) → lần định giá gần nhất', () => {
    for (const p of [null, undefined]) {
      expect(accountCurrentValue(acc(), 80_809, 81_000, p, TODAY)).toEqual({
        value: 81_000,
        basis: 'valuation',
      })
    }
  })

  it('đầu tư chưa có giá nào → số dư sổ', () => {
    expect(accountCurrentValue(acc(), 80_809, null, null, TODAY)).toEqual({
      value: 80_809,
      basis: 'ledger',
    })
  })

  it('tài sản cố định: định giá tay thắng khấu hao, khấu hao thắng số dư sổ', () => {
    const car = acc({
      type: 'fixed',
      initial_balance: 1_200_000,
      depreciation_months: 12,
      depreciation_from: '2026-03-23',
    })
    expect(accountCurrentValue(car, 1_200_000, 900_000, null, TODAY).basis).toBe('valuation')
    const dep = accountCurrentValue(car, 1_200_000, null, null, TODAY)
    expect(dep.basis).toBe('depreciation')
    expect(dep.value).toBeLessThan(1_200_000)
    expect(accountCurrentValue(acc({ type: 'fixed' }), 5_000, null, null, TODAY)).toEqual({
      value: 5_000,
      basis: 'ledger',
    })
  })

  it('tài khoản thường: số dư, bỏ qua mọi nguồn khác', () => {
    expect(accountCurrentValue(acc({ type: 'bank' }), 5_000, 9_999, summary(1), TODAY)).toEqual({
      value: 5_000,
      basis: 'balance',
    })
  })
})

describe('valueBasisLabel', () => {
  it('chỉ in nhãn cho tài khoản đầu tư', () => {
    expect(valueBasisLabel('investment', 'market')).toBe('giá thị trường')
    expect(valueBasisLabel('investment', 'ledger')).toBe('số dư sổ')
    expect(valueBasisLabel('investment', 'valuation')).toBe('giá cập nhật gần nhất')
    expect(valueBasisLabel('bank', 'balance')).toBeNull()
    expect(valueBasisLabel('fixed', 'depreciation')).toBeNull()
  })
})
