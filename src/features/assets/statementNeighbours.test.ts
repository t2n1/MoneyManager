import { describe, expect, it } from 'vitest'
import { billRowsFor, dedupeByPeriod, withNeighbours } from './statementNeighbours'
import type { ParsedStatement } from './paypayStatement'

const st = (closeISO: string, total = 0): ParsedStatement => ({
  range: { start: '', end: '', closeISO, dueISO: `${closeISO}-due` },
  dueDateFromFile: '',
  total,
  lines: [{ iso: closeISO, amount: 1, name: closeISO, isAdjustment: false }],
  dueDateMismatch: false,
})

describe('withNeighbours', () => {
  it('sap theo ky va gan hai hang xom', () => {
    const out = withNeighbours([st('2026-06-30'), st('2026-04-30'), st('2026-05-31')])
    expect(out.map((o) => o.parsed.range.closeISO)).toEqual([
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ])
    expect(out[1].neighbours.map((n) => n.lines[0].name)).toEqual(['2026-04-30', '2026-06-30'])
  })

  it('ky dau va ky cuoi chi co mot hang xom', () => {
    const out = withNeighbours([st('2026-05-31'), st('2026-06-30')])
    expect(out[0].neighbours).toHaveLength(1)
    expect(out[1].neighbours).toHaveLength(1)
  })

  it('mot file le thi khong co hang xom nao', () => {
    expect(withNeighbours([st('2026-06-30')])[0].neighbours).toEqual([])
  })

  // Chon nham cung mot file hai lan: neu khong gop thi ky do thanh hang xom cua chinh
  // no, va moi dong cua no tu "giai thich" duoc lan nhau — phan lech that bien mat.
  it('nap trung mot ky hai lan thi chi con mot ky, khong tu lam hang xom', () => {
    const out = withNeighbours([st('2026-06-30'), st('2026-06-30')])
    expect(out).toHaveLength(1)
    expect(out[0].neighbours).toEqual([])
  })
})

describe('dedupeByPeriod', () => {
  it('cung mot ngay chot thi ban NAP SAU thang', () => {
    const out = dedupeByPeriod([st('2026-06-30', 100), st('2026-06-30', 200)])
    expect(out).toHaveLength(1)
    expect(out[0].total).toBe(200)
  })

  it('ky khac nhau thi giu het', () => {
    expect(dedupeByPeriod([st('2026-05-31'), st('2026-06-30')])).toHaveLength(2)
  })
})

describe('billRowsFor', () => {
  it('nap trung mot ky hai lan chi luu MOT dong', () => {
    const rows = billRowsFor('acc-1', [st('2026-06-30', 100), st('2026-06-30', 200)])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      account_id: 'acc-1',
      close_date: '2026-06-30',
      due_date: '2026-06-30-due',
      total: 200,
    })
  })

  it('moi ky mot dong, dung ngay chot va ngay rut cua chinh ky do', () => {
    const rows = billRowsFor('acc-1', [st('2026-06-30', 100), st('2026-05-31', 50)])
    expect(rows.map((r) => r.close_date).sort()).toEqual(['2026-05-31', '2026-06-30'])
    expect(rows.every((r) => r.account_id === 'acc-1')).toBe(true)
  })
})
