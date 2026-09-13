import { describe, expect, it } from 'vitest'
import { overviewRows } from './statementOverview'
import { emptyResult } from './statementReconcile'
import type { MergedStatement } from './statementBatch'
import type { CardBillRow } from '../../types/database.types'

const bill = (close: string, total: number, account_id = 'acc-1'): CardBillRow => ({
  id: `b-${close}`, user_id: 'u', account_id, close_date: close, due_date: `${close}-due`, total,
  dismissed: [], reviewed: false, created_at: '',
})
const merged = (close: string, total: number, n = 1): MergedStatement => ({
  range: { start: '', end: '', closeISO: close, dueISO: `${close}-due2` },
  total,
  parts: [{ source: '3737', sourceLabel: 'Master 3737', total }],
  lines: Array.from({ length: n }, (_, i) => ({ iso: close, amount: i + 1, billed: i + 1, name: 'x', kind: 'purchase' as const, isAdjustment: false })),
  dueDateMismatch: false,
})

describe('overviewRows', () => {
  it('ky da luu nhung chua nap: saved-only, khong co loaded', () => {
    const rows = overviewRows([bill('2026-04-30', 71015)], 'acc-1', [], new Map())
    expect(rows).toEqual([{ closeISO: '2026-04-30', dueISO: '2026-04-30-due', billTotal: 71015, loaded: null, status: 'saved-only', reviewed: false }])
  })

  it('ky vua nap thang ky da luu ve tong va ngay rut; status theo hang can xem', () => {
    const r = emptyResult()
    r.matchedCount = 3
    const rows = overviewRows(
      [bill('2026-06-30', 100)], 'acc-1', [merged('2026-06-30', 158429, 4)], new Map([['2026-06-30', r]]),
    )
    expect(rows[0]).toMatchObject({ billTotal: 158429, dueISO: '2026-06-30-due2', status: 'ok' })
    expect(rows[0].loaded).toMatchObject({ matchedCount: 3, lineCount: 4, reviewCount: 0 })
  })

  it('co hang can xem thi status review va dem dung', () => {
    const r = emptyResult()
    r.missingFromLedger.push({ iso: '2026-06-03', amount: 5, billed: 5, name: 'y', kind: 'purchase', isAdjustment: false })
    const rows = overviewRows([], 'acc-1', [merged('2026-06-30', 10)], new Map([['2026-06-30', r]]))
    expect(rows[0].status).toBe('review')
    expect(rows[0].loaded?.reviewCount).toBe(1)
  })

  it('bo bill cua the khac; sap giam dan theo closeISO', () => {
    const rows = overviewRows(
      [bill('2026-05-31', 1), bill('2026-07-31', 2), bill('2026-06-30', 3, 'acc-9')], 'acc-1', [], new Map(),
    )
    expect(rows.map((r) => r.closeISO)).toEqual(['2026-07-31', '2026-05-31'])
  })

  it('ky vua nap ma chua co ket qua ghep (dang doc so) thi loaded co reviewCount 0', () => {
    const rows = overviewRows([], 'acc-1', [merged('2026-06-30', 10)], new Map())
    expect(rows[0].loaded).toMatchObject({ matchedCount: 0, reviewCount: 0 })
    expect(rows[0].status).toBe('ok')
  })

  it('reviewCount chi dem hang MO; hang da bo qua vao dismissedCount; status theo hang mo', () => {
    const r = emptyResult()
    r.unmatchedTopups = { count: 1, total: 9, lines: [] }
    r.missingFromLedger.push({ iso: '2026-06-03', amount: 5, billed: 5, name: 'y', kind: 'purchase', isAdjustment: false })
    const b = { ...bill('2026-06-30', 1), dismissed: ['topups:2026-06-30'], reviewed: false }
    const rows = overviewRows([b], 'acc-1', [merged('2026-06-30', 10)], new Map([['2026-06-30', r]]))
    expect(rows[0].loaded).toMatchObject({ reviewCount: 1, dismissedCount: 1 })
    expect(rows[0].status).toBe('review')
  })
  it('moi hang deu da bo qua ⇒ status ok; reviewed doc tu bill da luu', () => {
    const r = emptyResult()
    r.unmatchedTopups = { count: 1, total: 9, lines: [] }
    const b = { ...bill('2026-06-30', 1), dismissed: ['topups:2026-06-30'], reviewed: true }
    const rows = overviewRows([b], 'acc-1', [merged('2026-06-30', 10)], new Map([['2026-06-30', r]]))
    expect(rows[0].status).toBe('ok')
    expect(rows[0].reviewed).toBe(true)
  })
  it('ky saved-only mang reviewed cua bill', () => {
    const rows = overviewRows([{ ...bill('2026-04-30', 5), reviewed: true }], 'acc-1', [], new Map())
    expect(rows[0]).toMatchObject({ status: 'saved-only', reviewed: true })
  })

  it('loaded co ledgerTotal, gap va explainedCount; saved-only van loaded null', () => {
    const r = emptyResult()
    r.ledgerTotal = 214439
    r.explained = [
      { cause: 'wallet-topup', label: 'topup', amount: 100 },
      { cause: 'late-posting', label: 'tre', amount: 200 },
    ]
    const rows = overviewRows(
      [bill('2026-04-30', 71015)], 'acc-1', [merged('2026-06-30', 158429)], new Map([['2026-06-30', r]]),
    )
    expect(rows[0].loaded).toMatchObject({ ledgerTotal: 214439, gap: 56010, explainedCount: 2 })
    const savedOnly = rows.find((row) => row.closeISO === '2026-04-30')
    expect(savedOnly?.loaded).toBeNull()
  })
})
