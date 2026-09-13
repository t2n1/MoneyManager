import { describe, expect, it } from 'vitest'
import { billRowsFor, mergeStatements } from './statementBatch'
import { emptyResult, type ReconcileResult } from './statementReconcile'
import type { ParsedStatement } from './statementLine'
import type { CardBillRow } from '../../types/database.types'

const st = (closeISO: string, source: string, total = 0): ParsedStatement => ({
  range: { start: '', end: '', closeISO, dueISO: `${closeISO}-due` },
  dueDateFromFile: '',
  total,
  lines: [{ iso: closeISO, amount: total, billed: total, name: source, kind: 'purchase' }],
  dueDateMismatch: false,
  source,
  sourceLabel: `Thẻ ${source}`,
})

describe('mergeStatements', () => {
  it('hai NGUON khac nhau cung ky thi CONG lai, giu tung phan', () => {
    const out = mergeStatements([st('2026-06-30', '3737', 165429), st('2026-06-30', '2565', 880)])
    expect(out).toHaveLength(1)
    expect(out[0].total).toBe(166309)
    expect(out[0].parts).toEqual([
      { source: '2565', sourceLabel: 'Thẻ 2565', total: 880 },
      { source: '3737', sourceLabel: 'Thẻ 3737', total: 165429 },
    ])
    expect(out[0].lines.map((l) => l.name).sort()).toEqual(['2565', '3737'])
  })

  it('CUNG nguon cung ky (chon nham mot file hai lan) thi ban sau thang, khong cong doi', () => {
    const out = mergeStatements([st('2026-06-30', '3737', 100), st('2026-06-30', '3737', 200)])
    expect(out).toHaveLength(1)
    expect(out[0].total).toBe(200)
    expect(out[0].parts).toHaveLength(1)
  })

  it('sap theo closeISO tang dan', () => {
    const out = mergeStatements([st('2026-06-30', 'a'), st('2026-04-30', 'a'), st('2026-05-31', 'a')])
    expect(out.map((m) => m.range.closeISO)).toEqual(['2026-04-30', '2026-05-31', '2026-06-30'])
  })

  it('mot nguon lech ngay thi ca ky bi danh dau lech', () => {
    const ok = st('2026-06-30', 'a')
    const bad = { ...st('2026-06-30', 'b'), dueDateMismatch: true }
    expect(mergeStatements([ok, bad])[0].dueDateMismatch).toBe(true)
  })

  it('rong thi rong', () => {
    expect(mergeStatements([])).toEqual([])
  })

  it('hai nguon mot ky thi moi dong ghep gan dung source cua phan no den tu', () => {
    const out = mergeStatements([st('2026-06-30', '3737', 165429), st('2026-06-30', '2565', 880)])
    expect(out[0].lines.every((l) => l.source === l.name)).toBe(true)
    expect(out[0].lines.find((l) => l.name === '3737')!.source).toBe('3737')
    expect(out[0].lines.find((l) => l.name === '2565')!.source).toBe('2565')
  })

  it('hai file cung ky khong duoi (source rong) thi COI LA CUNG NGUON, ban sau thang', () => {
    const out = mergeStatements([st('2026-06-30', '', 100), st('2026-06-30', '', 200)])
    expect(out).toHaveLength(1)
    expect(out[0].total).toBe(200)
    expect(out[0].parts).toHaveLength(1)
  })
})

describe('billRowsFor', () => {
  const ctx0 = { existing: [] as CardBillRow[], results: new Map<string, ReconcileResult>() }
  it('moi ky mot dong, total gop; chua co bill va chua co ket qua ⇒ dismissed [] reviewed false', () => {
    const rows = billRowsFor('acc-1', mergeStatements([st('2026-06-30', '3737', 165429), st('2026-06-30', '2565', 880), st('2026-05-31', '3737', 50)]), ctx0)
    expect(rows).toEqual([
      { account_id: 'acc-1', close_date: '2026-05-31', due_date: '2026-05-31-due', total: 50, dismissed: [], reviewed: false },
      { account_id: 'acc-1', close_date: '2026-06-30', due_date: '2026-06-30-due', total: 166309, dismissed: [], reviewed: false },
    ])
  })
  it('giu dismissed cua bill da luu cung ky, va tinh reviewed tu ket qua ghep', () => {
    const existing: CardBillRow = { id: 'b', user_id: 'u', account_id: 'acc-1', close_date: '2026-06-30', due_date: 'x', total: 1, created_at: '', dismissed: ['topups:2026-06-30'], reviewed: false }
    const r = emptyResult()
    r.unmatchedTopups = { count: 1, total: 1000, lines: [] }
    const rows = billRowsFor('acc-1', mergeStatements([st('2026-06-30', '3737', 100)]), { existing: [existing], results: new Map([['2026-06-30', r]]) })
    expect(rows[0].dismissed).toEqual(['topups:2026-06-30'])
    expect(rows[0].reviewed).toBe(true)   // hàng duy nhất (cụm nạp ví) đã bỏ qua
  })
  it('bill cua the KHAC cung ky khong duoc lay nham', () => {
    const other: CardBillRow = { id: 'b', user_id: 'u', account_id: 'acc-9', close_date: '2026-06-30', due_date: 'x', total: 1, created_at: '', dismissed: ['tx:z'], reviewed: true }
    const rows = billRowsFor('acc-1', mergeStatements([st('2026-06-30', '3737', 100)]), { existing: [other], results: new Map() })
    expect(rows[0].dismissed).toEqual([])
  })
  it('ket qua co hang mo thi reviewed false du dismissed co khoa khac', () => {
    const r = emptyResult()
    r.missingFromLedger.push({ iso: '2026-06-03', amount: 5, billed: 5, name: 'y', kind: 'purchase' })
    const rows = billRowsFor('acc-1', mergeStatements([st('2026-06-30', '3737', 100)]), { existing: [], results: new Map([['2026-06-30', r]]) })
    expect(rows[0].reviewed).toBe(false)
  })
})
