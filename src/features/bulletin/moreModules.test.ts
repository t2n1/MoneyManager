import { describe, expect, it } from 'vitest'
import type { HealthSnapshotRow, TransactionRow } from '../../types/database.types'
import { bigExpenses, healthGlance, heatCells, heatLevel, heatSummary } from './moreModules'

let n = 0
const tx = (o: Partial<TransactionRow>): TransactionRow =>
  ({
    id: `t${n++}`,
    type: 'expense',
    amount: 1_000,
    category_id: 'an',
    account_id: 'bank',
    occurred_on: '2026-09-10',
    is_refund: false,
    is_debt_flow: false,
    exclude_from_stats: false,
    ...o,
  }) as TransactionRow

describe('bigExpenses', () => {
  const transfer = new Set(['chuyen'])
  const toBase = (t: TransactionRow) => (t.account_id === 'usd' ? null : t.amount)

  it('xếp theo tiền giảm dần, cắt đúng N khoản', () => {
    const txs = [tx({ amount: 500 }), tx({ amount: 9_000 }), tx({ amount: 3_000 })]
    expect(bigExpenses(txs, 2, toBase, transfer).items.map((i) => i.amount)).toEqual([9_000, 3_000])
  })

  it('cùng luật loại trừ với chi từng ngày: thu, chuyển khoản, hoàn tiền, nợ, bỏ thống kê', () => {
    const txs = [
      tx({ type: 'income', amount: 99_000 }),
      tx({ category_id: 'chuyen', amount: 50_000 }),
      tx({ is_refund: true, amount: 40_000 }),
      tx({ is_debt_flow: true, amount: 30_000 }),
      tx({ exclude_from_stats: true, amount: 20_000 }),
      tx({ amount: 700 }),
    ]
    expect(bigExpenses(txs, 5, toBase, transfer).items.map((i) => i.amount)).toEqual([700])
  })

  it('thiếu tỷ giá: bỏ ra và bật cờ, không quy 1:1', () => {
    const out = bigExpenses([tx({ account_id: 'usd', amount: 99_999 }), tx({ amount: 10 })], 5, toBase, transfer)
    expect(out.items.map((i) => i.amount)).toEqual([10])
    expect(out.hasMissingRate).toBe(true)
  })
})

describe('bản đồ nhiệt', () => {
  it('nấc theo mức chi thường, không theo ngày cao nhất', () => {
    expect([0, 400, 1_000, 1_900, 50_000].map((v) => heatLevel(v, 1_000))).toEqual([0, 1, 2, 3, 4])
    // chưa có mức thường (mới một ngày có chi) → nấc giữa, không phải nấc đỏ nhất
    expect(heatLevel(5_000, 0)).toBe(2)
  })

  it('ngày chưa tới không tính là "không chi"', () => {
    const days = ['2026-09-29', '2026-09-30', '2026-10-01'].map((date, i) => ({ date, total: i === 0 ? 800 : 0, top: [] }))
    const cells = heatCells(days, 800, '2026-09-30')
    expect(cells.map((c) => c.future)).toEqual([false, false, true])
    expect(heatSummary(cells)).toEqual({ spendDays: 1, zeroDays: 1 })
  })
})

describe('healthGlance', () => {
  const row = (month_on: string, score: number, coverage_bps = 10_000) =>
    ({ id: month_on, user_id: 'u', month_on, score, coverage_bps, created_at: '', updated_at: '' }) as HealthSnapshotRow

  it('chưa chấm lần nào → null', () => {
    expect(healthGlance([])).toBeNull()
  })

  it('lần mới nhất + chênh với lần trước, bất kể thứ tự đọc về', () => {
    const g = healthGlance([row('2026-09-01', 72), row('2026-07-01', 60), row('2026-08-01', 65, 5_000)])!
    expect(g).toMatchObject({ score: 72, monthOn: '2026-09-01', delta: 7, coverage: 1 })
    expect(g.history).toEqual([60, 65, 72])
  })

  it('mới một lần chấm: không có chênh lệch', () => {
    expect(healthGlance([row('2026-09-01', 50)])!.delta).toBeNull()
  })
})
