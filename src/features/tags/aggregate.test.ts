import { describe, expect, it } from 'vitest'
import type { TagRow, TransactionRow, TransactionTagRow } from '../../types/database.types'
import type { Rates } from '../../lib/rates'
import { tagBreakdown } from './aggregate'

const RATES: Rates = { JPY: 1, VND: 165 }
const currencyOf = () => 'JPY' as const

const tag = (id: string, name: string): TagRow => ({
  id,
  user_id: 'u',
  name,
  color: 'sky',
  sort_order: 0,
  created_at: '',
})

let seq = 0
function tx(
  p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount'>,
): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    to_amount: null,
    category_id: 'c1',
    account_id: 'a1',
    to_account_id: null,
    recurring_rule_id: null,
    occurred_on: '2026-05-01',
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  }
}

const link = (transaction_id: string, tag_id: string): TransactionTagRow => ({
  transaction_id,
  tag_id,
  user_id: 'u',
})

const TAGS = [tag('ve-vn', 'Về VN 2026'), tag('qua', 'Quà cáp')]

describe('tagBreakdown', () => {
  it('cộng chi theo từng nhãn, sắp giảm dần', () => {
    const a = tx({ id: 'a', type: 'expense', amount: 30_000 })
    const b = tx({ id: 'b', type: 'expense', amount: 50_000 })
    const r = tagBreakdown(
      [a, b],
      [link('a', 've-vn'), link('b', 'qua')],
      TAGS,
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r.slices.map((s) => [s.name, s.amount])).toEqual([
      ['Quà cáp', 50_000],
      ['Về VN 2026', 30_000],
    ])
  })

  it('giao dịch 2 nhãn cộng đủ vào cả hai, nhưng taggedTotal chỉ đếm một lần', () => {
    const a = tx({ id: 'a', type: 'expense', amount: 40_000 })
    const r = tagBreakdown(
      [a],
      [link('a', 've-vn'), link('a', 'qua')],
      TAGS,
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r.slices.map((s) => s.amount)).toEqual([40_000, 40_000])
    expect(r.taggedTotal).toBe(40_000)
    expect(r.total).toBe(40_000)
  })

  it('total gồm cả giao dịch chưa gắn nhãn', () => {
    const a = tx({ id: 'a', type: 'expense', amount: 40_000 })
    const b = tx({ id: 'b', type: 'expense', amount: 60_000 })
    const r = tagBreakdown([a, b], [link('a', 've-vn')], TAGS, currencyOf, 'JPY', RATES)
    expect(r.taggedTotal).toBe(40_000)
    expect(r.total).toBe(100_000)
  })

  it('hoàn tiền trừ khỏi nhãn', () => {
    const a = tx({ id: 'a', type: 'expense', amount: 50_000 })
    const b = tx({ id: 'b', type: 'expense', amount: 20_000, is_refund: true })
    const r = tagBreakdown(
      [a, b],
      [link('a', 've-vn'), link('b', 've-vn')],
      TAGS,
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r.slices[0].amount).toBe(30_000)
  })

  it('bỏ thu nhập, chuyển khoản, dòng tiền nợ, giao dịch ngoài thống kê', () => {
    const rows = [
      tx({ id: 'a', type: 'income', amount: 99_000 }),
      tx({ id: 'b', type: 'transfer', amount: 99_000, category_id: null, to_account_id: 'a2' }),
      tx({ id: 'c', type: 'expense', amount: 99_000, is_debt_flow: true }),
      tx({ id: 'd', type: 'expense', amount: 99_000, exclude_from_stats: true }),
      tx({ id: 'e', type: 'expense', amount: 10_000 }),
    ]
    const r = tagBreakdown(
      rows,
      rows.map((t) => link(t.id, 've-vn')),
      TAGS,
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r.slices[0].amount).toBe(10_000)
    expect(r.total).toBe(10_000)
  })

  it('nhãn đã bị xóa (còn liên kết mồ côi) không tạo lát rác', () => {
    const a = tx({ id: 'a', type: 'expense', amount: 10_000 })
    const r = tagBreakdown([a], [link('a', 'da-xoa')], TAGS, currencyOf, 'JPY', RATES)
    expect(r.slices).toEqual([])
    expect(r.taggedTotal).toBe(10_000)
  })

  it('quy đổi ngoại tệ; thiếu tỷ giá thì đánh dấu', () => {
    const a = tx({ id: 'a', type: 'expense', amount: 1_650_000 })
    const ok = tagBreakdown([a], [link('a', 've-vn')], TAGS, () => 'VND', 'JPY', RATES)
    expect(ok.slices[0].amount).toBe(10_000)

    const missing = tagBreakdown([a], [link('a', 've-vn')], TAGS, () => 'USD', 'JPY', { JPY: 1 })
    expect(missing.hasMissingRate).toBe(true)
    expect(missing.slices).toEqual([])
  })
})
