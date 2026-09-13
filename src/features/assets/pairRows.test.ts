import { describe, expect, it } from 'vitest'
import { CAUSE_LABEL, pairRows } from './pairRows'
import { emptyResult, type Pair } from './statementReconcile'
import type { ReviewRow } from './statementReviewRows'

const led = (id: string): ReviewRow => ({ kind: 'ledger', key: `led-${id}`, amount: 1, refund: false,
  tx: { id, occurred_on: '2026-06-01', amount: 1, type: 'expense', is_refund: false, to_account_id: null, note: null } })
const pair = (cause?: Pair['cause']): Pair => ({ ledger: [], lines: [], cause, label: cause ?? 'khớp', amount: 1 })

describe('pairRows', () => {
  const r = emptyResult()
  r.pairs.push(pair(), pair('date-edge'), pair(), pair('wallet-topup'))
  it('mac dinh: lech -> giai thich duoc -> da bo qua; KHONG co cap khop', () => {
    const out = pairRows(r, [led('a')], [led('z')], false)
    expect(out.map((x) => x.kind)).toEqual(['diff', 'explained', 'explained', 'dismissed'])
  })
  it('showAll chen cap khop giua giai thich duoc va da bo qua, giu thu tu push', () => {
    const out = pairRows(r, [led('a')], [led('z')], true)
    expect(out.map((x) => x.kind)).toEqual(['diff', 'explained', 'explained', 'matched', 'matched', 'dismissed'])
  })
  it('moi cause deu co nhan tieng Viet', () => {
    for (const c of ['refund-shifted','wallet-topup','date-edge','late-posting','recalculated','merged-rows','installment','investment'] as const)
      expect(CAUSE_LABEL[c].length).toBeGreaterThan(0)
  })
  it('ket qua rong -> []', () => { expect(pairRows(emptyResult(), [], [], true)).toEqual([]) })
})
