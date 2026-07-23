import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { DebtDirection, DebtPaymentRow, DebtRow, DebtStatus } from '../../types/database.types'
import { debtSummary, disbursedOf, paidOf, remainingOf, repaidOf } from './aggregate'

let seq = 0
function debt(
  partial: Partial<DebtRow> & {
    id: string
    direction: DebtDirection
    currency: CurrencyCode
    principal: number
  },
): DebtRow {
  return {
    user_id: 'u',
    counterparty: 'X',
    due_on: null,
    status: 'open' as DebtStatus,
    note: '',
    interest_bps: null,
    term_months: null,
    disbursement_transaction_id: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...partial,
  }
}

function payment(debtId: string, amount: number): DebtPaymentRow {
  return {
    id: `p${seq++}`,
    user_id: 'u',
    debt_id: debtId,
    amount,
    paid_on: '2026-07-10',
    transaction_id: null,
    note: '',
    created_at: '2026-07-10T00:00:00Z',
  }
}

// base = JPY; 1 JPY = 0.01 USD (→ $1 = ¥100); 1 JPY = 170 VND
const RATES: Rates = { USD: 0.01, VND: 170 }
const BASE: CurrencyCode = 'JPY'

describe('paidOf / remainingOf', () => {
  it('cộng đúng các lần trả của đúng khoản nợ', () => {
    const d = debt({ id: 'd1', direction: 'owed_to_me', currency: 'JPY', principal: 50_000 })
    const payments = [payment('d1', 20_000), payment('d1', 5_000), payment('other', 9_999)]
    expect(paidOf('d1', payments)).toBe(25_000)
    expect(remainingOf(d, payments)).toBe(25_000)
  })

  it('còn lại có thể bằng 0 khi trả đủ', () => {
    const d = debt({ id: 'd1', direction: 'i_owe', currency: 'JPY', principal: 10_000 })
    expect(remainingOf(d, [payment('d1', 10_000)])).toBe(0)
  })
})

describe('cộng dồn — giải ngân thêm (payment âm)', () => {
  it('lần trả âm là cho vay thêm → tăng gốc & số còn lại, không tính vào đã trả', () => {
    const d = debt({ id: 'd1', direction: 'owed_to_me', currency: 'JPY', principal: 50_000 })
    // cho vay thêm 30.000 (âm) rồi thu lại 20.000 (dương)
    const payments = [payment('d1', -30_000), payment('d1', 20_000)]
    expect(disbursedOf(d, payments)).toBe(80_000) // 50.000 gốc + 30.000 giải ngân thêm
    expect(repaidOf('d1', payments)).toBe(20_000) // chỉ lần trả dương
    expect(remainingOf(d, payments)).toBe(60_000) // 80.000 − 20.000
  })

  it('debtSummary cộng đúng số còn lại đã bao gồm giải ngân thêm', () => {
    const debts = [debt({ id: 'd1', direction: 'owed_to_me', currency: 'JPY', principal: 40_000 })]
    const s = debtSummary(debts, [payment('d1', -10_000)], BASE, RATES)
    expect(s.owedToMe).toBe(50_000)
  })
})

describe('debtSummary', () => {
  it('quy đổi đa tệ về base và tính net', () => {
    const debts = [
      // Người ta nợ mình ¥50.000, đã trả ¥20.000 → còn ¥30.000
      debt({ id: 'd1', direction: 'owed_to_me', currency: 'JPY', principal: 50_000 }),
      // Mình nợ $500 (50.000 cent) → ¥50.000
      debt({ id: 'd2', direction: 'i_owe', currency: 'USD', principal: 50_000 }),
    ]
    const payments = [payment('d1', 20_000)]
    const s = debtSummary(debts, payments, BASE, RATES)
    expect(s.owedToMe).toBe(30_000)
    expect(s.iOwe).toBe(50_000)
    expect(s.net).toBe(-20_000)
    expect(s.hasMissingRate).toBe(false)
    expect(s.hasOpen).toBe(true)
  })

  it('bỏ qua khoản settled và khoản đã trả hết', () => {
    const debts = [
      debt({ id: 'd1', direction: 'i_owe', currency: 'JPY', principal: 10_000, status: 'settled' }),
      debt({ id: 'd2', direction: 'owed_to_me', currency: 'JPY', principal: 8_000 }),
    ]
    const s = debtSummary(debts, [payment('d2', 8_000)], BASE, RATES)
    expect(s.iOwe).toBe(0)
    expect(s.owedToMe).toBe(0)
    expect(s.hasOpen).toBe(false)
  })

  it('thiếu tỷ giá → đánh dấu hasMissingRate, không cộng khoản đó', () => {
    const debts = [
      debt({ id: 'd1', direction: 'i_owe', currency: 'VND', principal: 1_700_000 }), // ¥10.000
      debt({ id: 'd2', direction: 'i_owe', currency: 'USD', principal: 20_000 }),
    ]
    const s = debtSummary(debts, [], BASE, {}) // không có tỷ giá nào
    // VND & USD đều thiếu tỷ giá → iOwe = 0 nhưng hasMissingRate = true
    expect(s.iOwe).toBe(0)
    expect(s.hasMissingRate).toBe(true)
    expect(s.hasOpen).toBe(true)
  })

  it('quy đổi VND sang JPY đúng', () => {
    const debts = [debt({ id: 'd1', direction: 'owed_to_me', currency: 'VND', principal: 1_700_000 })]
    const s = debtSummary(debts, [], BASE, RATES)
    expect(s.owedToMe).toBe(10_000) // 1.700.000 / 170
  })
})
