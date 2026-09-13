import { describe, expect, it } from 'vitest'
import { prefillFromLine, reviewRows } from './statementReviewRows'
import { emptyResult, type LedgerTx } from './statementReconcile'
import type { StatementLine } from './statementLine'

const line = (iso: string, amount: number, name = 'X'): StatementLine => ({
  iso, amount, billed: amount, name, kind: 'purchase', isAdjustment: false,
})
const tx = (iso: string, amount: number, p: Partial<LedgerTx> = {}): LedgerTx => ({
  id: `t-${iso}-${amount}`, occurred_on: iso, amount, type: 'expense', is_refund: false,
  to_account_id: null, note: null, ...p,
})

describe('reviewRows', () => {
  it('thu tu: so-thua, the-thieu, cum nap vi, roi hoan tien', () => {
    const r = emptyResult()
    r.extraInLedger.push({ tx: tx('2026-06-10', 23000), amount: 23000 })
    r.missingFromLedger.push(line('2026-07-03', 5060, 'UNIQLO'))
    r.unmatchedTopups = { count: 2, total: 3376, lines: [line('2026-06-24', 1000), line('2026-06-20', 2376)] }
    r.refundDiffs.push({ source: 'ledger', label: 'Uniqlo hoan', iso: '2026-01-28', amount: -6990 })
    r.refundDiffs.push({ source: 'statement', label: '調整額 · 極楽茶屋', iso: '2026-01-03', amount: -7951 })
    const rows = reviewRows(r, '2026-06-30')
    expect(rows.map((x) => x.kind)).toEqual(['ledger', 'statement', 'topups', 'ledger', 'statement'])
    expect(rows[2]).toMatchObject({ kind: 'topups', count: 2, amount: 3376, key: 'topups-2026-06-30' })
    expect(rows[3]).toMatchObject({ kind: 'ledger', refund: true, amount: -6990 })
    expect(rows[4]).toMatchObject({ kind: 'statement', refund: true, amount: -7951 })
  })

  it('khoa duy nhat: hai dong the cung ngay cung tien van khac key', () => {
    const r = emptyResult()
    r.missingFromLedger.push(line('2026-06-16', 4950, 'CBTS'), line('2026-06-16', 4950, 'CBTS'))
    const keys = reviewRows(r, '2026-06-30').map((x) => x.key)
    expect(new Set(keys).size).toBe(2)
  })

  it('hoan tien statement trong refundDiffs mang line de Them vao so duoc', () => {
    const r = emptyResult()
    r.refundDiffs.push({ source: 'statement', label: '調整額 · A', iso: '2026-01-03', amount: -500 })
    const row = reviewRows(r, '2026-01-31')[0]
    expect(row.kind).toBe('statement')
    if (row.kind === 'statement') {
      expect(row.line).toMatchObject({ iso: '2026-01-03', amount: -500, name: '調整額 · A', kind: 'adjustment' })
    }
  })

  it('ket qua rong thi khong hang nao', () => {
    expect(reviewRows(emptyResult(), '2026-06-30')).toEqual([])
  })
})

describe('prefillFromLine', () => {
  it('dong the duong -> khoan chi, dien ngay/tien/the/ghi chu, id rong', () => {
    const row = prefillFromLine(line('2026-07-03', 5060, 'UNIQLO'), 'card-1')
    expect(row).toMatchObject({
      id: '', type: 'expense', amount: 5060, is_refund: false, account_id: 'card-1',
      to_account_id: null, occurred_on: '2026-07-03', note: 'UNIQLO', category_id: null,
    })
  })
  it('dong the am -> khoan hoan: amount duong, is_refund true', () => {
    const row = prefillFromLine(line('2026-01-03', -7951, '調整額 · 極楽茶屋'), 'card-1')
    expect(row.amount).toBe(7951)
    expect(row.is_refund).toBe(true)
    expect(row.type).toBe('expense')
  })
})
