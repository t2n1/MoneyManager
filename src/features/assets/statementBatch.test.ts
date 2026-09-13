import { describe, expect, it } from 'vitest'
import { billRowsFor, mergeStatements } from './statementBatch'
import type { ParsedStatement } from './statementLine'

const st = (closeISO: string, source: string, total = 0): ParsedStatement => ({
  range: { start: '', end: '', closeISO, dueISO: `${closeISO}-due` },
  dueDateFromFile: '',
  total,
  lines: [{ iso: closeISO, amount: total, billed: total, name: source, kind: 'purchase', isAdjustment: false }],
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
})

describe('billRowsFor', () => {
  it('moi ky mot dong, total la tong da gop', () => {
    const rows = billRowsFor('acc-1', mergeStatements([
      st('2026-06-30', '3737', 165429), st('2026-06-30', '2565', 880), st('2026-05-31', '3737', 50),
    ]))
    expect(rows).toEqual([
      { account_id: 'acc-1', close_date: '2026-05-31', due_date: '2026-05-31-due', total: 50 },
      { account_id: 'acc-1', close_date: '2026-06-30', due_date: '2026-06-30-due', total: 166309 },
    ])
  })
})
