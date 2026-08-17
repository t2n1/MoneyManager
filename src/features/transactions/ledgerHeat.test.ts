import { describe, expect, it } from 'vitest'
import { HEAT_LEVELS, monthHeatmap } from './ledgerHeat'
import type { TransactionRow } from '../../types/database.types'

const tx = (p: Partial<TransactionRow>): TransactionRow =>
  ({
    id: Math.random().toString(36).slice(2),
    type: 'expense',
    account_id: 'A',
    to_account_id: null,
    amount: 0,
    to_amount: null,
    is_refund: false,
    is_debt_flow: false,
    exclude_from_stats: false,
    occurred_on: '2026-08-10',
    category_id: null,
    ...p,
  }) as unknown as TransactionRow

const run = (txs: TransactionRow[], todayISO = '2026-08-31') =>
  monthHeatmap({
    txs,
    monthKey: { year: 2026, month: 8 },
    monthStartDay: 1,
    todayISO,
    toBase: (a) => a,
  })

describe('monthHeatmap', () => {
  it('một ô mỗi ngày của kỳ', () => {
    expect(run([]).cells).toHaveLength(31)
    expect(run([]).cells[0].iso).toBe('2026-08-01')
    expect(run([]).cells[30].iso).toBe('2026-08-31')
  })

  // 01/08/2026 là thứ Bảy → 6 ô trống trước nó khi CN đứng đầu hàng.
  it('chèn đúng số ô trống để cột thẳng với hàng thứ', () => {
    expect(run([]).leadingBlanks).toBe(6)
  })

  it('mức đậm chia theo ngày chi nhiều nhất trong CHÍNH kỳ đó', () => {
    const r = run([
      tx({ occurred_on: '2026-08-05', amount: 100 }),
      tx({ occurred_on: '2026-08-06', amount: 50 }),
      tx({ occurred_on: '2026-08-07', amount: 25 }),
    ])
    const at = (d: string) => r.cells.find((c) => c.iso === d)!
    expect(at('2026-08-05').level).toBe(HEAT_LEVELS)
    expect(at('2026-08-06').level).toBe(2)
    expect(at('2026-08-07').level).toBe(1)
    expect(at('2026-08-08').level).toBe(0)
  })

  // Ngày có tiêu KHÔNG được trông giống ngày trắng, dù tiêu rất ít.
  it('chi rất nhỏ vẫn có mức 1, không phải 0', () => {
    const r = run([
      tx({ occurred_on: '2026-08-05', amount: 300_000 }),
      tx({ occurred_on: '2026-08-06', amount: 100 }),
    ])
    expect(r.cells.find((c) => c.iso === '2026-08-06')!.level).toBe(1)
  })

  it('kỳ không chi gì thì mọi mức là 0, không chia cho 0', () => {
    const r = run([tx({ type: 'income', amount: 500, occurred_on: '2026-08-05' })])
    expect(r.cells.every((c) => c.level === 0)).toBe(true)
  })

  it('chuyển khoản và dòng tiền nợ không tính là chi', () => {
    const r = run([
      tx({ type: 'transfer', amount: 300_000, occurred_on: '2026-08-05' }),
      tx({ is_debt_flow: true, amount: 300_000, occurred_on: '2026-08-06' }),
      tx({ exclude_from_stats: true, amount: 300_000, occurred_on: '2026-08-07' }),
    ])
    expect(r.cells.every((c) => c.expense === 0)).toBe(true)
  })

  it('hoàn tiền TRỪ khỏi chi, không cộng vào thu', () => {
    const r = run([
      tx({ occurred_on: '2026-08-05', amount: 1000 }),
      tx({ occurred_on: '2026-08-05', amount: 400, is_refund: true }),
    ])
    const c = r.cells.find((x) => x.iso === '2026-08-05')!
    expect(c.expense).toBe(600)
    expect(c.income).toBe(0)
  })

  it('ngày thu > chi thì đánh dấu netIn', () => {
    const r = run([
      tx({ type: 'income', amount: 500_000, occurred_on: '2026-08-10' }),
      tx({ amount: 1_000, occurred_on: '2026-08-10' }),
    ])
    expect(r.cells.find((c) => c.iso === '2026-08-10')!.netIn).toBe(true)
  })

  // Ô trống ở tương lai không phải "ngày không chi", nó là "chưa tới".
  it('phân biệt ngày sắp tới với ngày không chi', () => {
    const r = run([], '2026-08-15')
    expect(r.cells.find((c) => c.iso === '2026-08-14')!.future).toBe(false)
    expect(r.cells.find((c) => c.iso === '2026-08-15')!.future).toBe(false)
    expect(r.cells.find((c) => c.iso === '2026-08-16')!.future).toBe(true)
  })

  it('bỏ giao dịch ngoài kỳ', () => {
    const r = run([
      tx({ occurred_on: '2026-07-31', amount: 999 }),
      tx({ occurred_on: '2026-09-01', amount: 999 }),
    ])
    expect(r.cells.every((c) => c.expense === 0)).toBe(true)
  })

  it('thiếu tỷ giá thì bỏ khoản đó, không coi là 0 rồi cộng vào', () => {
    const r = monthHeatmap({
      txs: [tx({ occurred_on: '2026-08-05', amount: 1000, account_id: 'VN' })],
      monthKey: { year: 2026, month: 8 },
      monthStartDay: 1,
      todayISO: '2026-08-31',
      toBase: (_a, acc) => (acc === 'VN' ? null : _a),
    })
    expect(r.cells.find((c) => c.iso === '2026-08-05')!.expense).toBe(0)
  })

  it('kỳ tuỳ chỉnh: month_start_day = 25', () => {
    const r = monthHeatmap({
      txs: [],
      monthKey: { year: 2026, month: 8 },
      monthStartDay: 25,
      todayISO: '2026-08-31',
      toBase: (a) => a,
    })
    expect(r.cells[0].iso).toBe('2026-08-25')
    expect(r.cells[r.cells.length - 1].iso).toBe('2026-09-24')
  })
})
