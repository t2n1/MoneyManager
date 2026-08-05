import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import { sumInBase, sumPerCurrency } from './ledgerShared'

// base = JPY: 1 ¥ = 165 ₫
const RATES: Rates = { JPY: 1, VND: 165 }

// account 'jpy' dùng JPY, 'vnd' dùng VND
const currencyOf = (id: string): CurrencyCode => (id === 'vnd' ? 'VND' : 'JPY')

let seq = 0
function tx(p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount'>): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    category_id: null,
    account_id: 'jpy',
    to_account_id: null,
    to_amount: null,
    recurring_rule_id: null,
    occurred_on: '2026-08-05',
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  }
}

describe('sumInBase', () => {
  it('bỏ giao dịch có exclude_from_stats (bút toán điều chỉnh số dư)', () => {
    const txs = [
      tx({ type: 'income', amount: 1_000 }),
      tx({ type: 'income', amount: 1_661_218, exclude_from_stats: true }),
      tx({ type: 'expense', amount: 500 }),
      tx({ type: 'expense', amount: 20_846_401, exclude_from_stats: true }),
    ]
    expect(sumInBase(txs, 'income', currencyOf, 'JPY', RATES)?.value).toBe(1_000)
    expect(sumInBase(txs, 'expense', currencyOf, 'JPY', RATES)?.value).toBe(500)
  })

  it('vẫn bỏ dòng tiền nợ/cho vay (is_debt_flow)', () => {
    const txs = [tx({ type: 'expense', amount: 700 }), tx({ type: 'expense', amount: 900, is_debt_flow: true })]
    expect(sumInBase(txs, 'expense', currencyOf, 'JPY', RATES)?.value).toBe(700)
  })
})

describe('sumPerCurrency', () => {
  it('bỏ giao dịch có exclude_from_stats', () => {
    const txs = [
      tx({ type: 'expense', amount: 300 }),
      tx({ type: 'expense', amount: 20_846_401, exclude_from_stats: true }),
      tx({ type: 'expense', amount: 165_000, account_id: 'vnd', exclude_from_stats: true }),
    ]
    expect(sumPerCurrency(txs, 'expense', currencyOf)).toBe('¥300')
  })
})
