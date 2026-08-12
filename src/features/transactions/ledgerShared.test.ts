import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import { amountDisplay, sumInBase, sumPerCurrency, uncategorizedAmount } from './ledgerShared'

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

  // Hoàn tiền là chi ÂM ở MỌI module khác (expenseSign) — Sổ từng cộng dồn nên ô
  // "Chi" của Sổ cao hơn Báo cáo đúng 2 lần khoản hoàn.
  it('hoàn tiền (is_refund) TRỪ khỏi chi chứ không cộng vào', () => {
    const txs = [
      tx({ type: 'expense', amount: 1_000 }),
      tx({ type: 'expense', amount: 400, is_refund: true }),
    ]
    expect(sumInBase(txs, 'expense', currencyOf, 'JPY', RATES)?.value).toBe(600)
  })

  it('hoàn tiền không đụng vào thu', () => {
    const txs = [tx({ type: 'income', amount: 1_000 }), tx({ type: 'expense', amount: 400, is_refund: true })]
    expect(sumInBase(txs, 'income', currencyOf, 'JPY', RATES)?.value).toBe(1_000)
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

  it('hoàn tiền cũng trừ khỏi chi ở nhánh thiếu tỷ giá', () => {
    const txs = [
      tx({ type: 'expense', amount: 1_000 }),
      tx({ type: 'expense', amount: 400, is_refund: true }),
    ]
    expect(sumPerCurrency(txs, 'expense', currencyOf)).toBe('¥600')
  })
})

describe('amountDisplay', () => {
  it('khoản tính vào Thu/Chi giữ màu xanh/đỏ', () => {
    expect(amountDisplay(tx({ type: 'income', amount: 1 }))).toEqual({ sign: '+', tone: 'in' })
    expect(amountDisplay(tx({ type: 'expense', amount: 1 }))).toEqual({ sign: '-', tone: 'out' })
  })

  it('bút toán điều chỉnh số dư: xám, nhưng giữ dấu để biết tiền ra hay vào', () => {
    expect(amountDisplay(tx({ type: 'expense', amount: 1, exclude_from_stats: true }))).toEqual({
      sign: '-',
      tone: 'muted',
    })
    expect(amountDisplay(tx({ type: 'income', amount: 1, exclude_from_stats: true }))).toEqual({
      sign: '+',
      tone: 'muted',
    })
  })

  it('dòng tiền nợ/cho vay cũng xám — nó không nằm trong Thu/Chi', () => {
    expect(amountDisplay(tx({ type: 'expense', amount: 1, is_debt_flow: true }))).toEqual({
      sign: '-',
      tone: 'muted',
    })
  })

  it('chuyển khoản: xám, không dấu', () => {
    expect(amountDisplay(tx({ type: 'transfer', amount: 1 }))).toEqual({ sign: '', tone: 'muted' })
  })

  it('hoàn tiền: tiền quay LẠI ví nên dấu +', () => {
    expect(amountDisplay(tx({ type: 'expense', amount: 1, is_refund: true }))).toEqual({
      sign: '+',
      tone: 'in',
    })
  })
})

describe('uncategorizedAmount', () => {
  it('chênh lệch giữa tổng thật và tổng theo danh mục', () => {
    expect(uncategorizedAmount(98_707, 90_930)).toBe(7_777)
  })

  it('khớp nhau thì không có gì để hiện', () => {
    expect(uncategorizedAmount(90_930, 90_930)).toBe(0)
  })

  it('tổng thật nhỏ hơn (lát âm đã bị bỏ) → 0 chứ không phải số âm', () => {
    expect(uncategorizedAmount(1_000, 1_500)).toBe(0)
  })

  it('làm tròn về đồng nguyên (tổng quy đổi ngoại tệ ra số lẻ)', () => {
    expect(uncategorizedAmount(1_000.6, 500.2)).toBe(500)
  })
})
