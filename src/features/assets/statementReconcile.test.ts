import { describe, expect, it } from 'vitest'
import { reconcileStatement, type LedgerTx } from './statementReconcile'
import type { StatementLine } from './paypayStatement'
import { CARD_RECONCILE_NOTE } from './reconcile'

const CARD = 'card-1'
const line = (iso: string, amount: number, name = 'X', isAdjustment = false): StatementLine => ({
  iso, amount, name, isAdjustment,
})
const tx = (iso: string, amount: number, p: Partial<LedgerTx> = {}): LedgerTx => ({
  id: `t-${iso}-${amount}`,
  occurred_on: iso,
  amount,
  type: 'expense',
  is_refund: false,
  to_account_id: null,
  note: null,
  ...p,
})

describe('reconcileStatement', () => {
  it('ghep duoc thi khong ai vao danh sach lech', () => {
    const r = reconcileStatement([line('2026-06-02', 4950)], [tx('2026-06-02', 4950)], CARD, [])
    expect(r.matchedCount).toBe(1)
    expect(r.extraInLedger).toHaveLength(0)
    expect(r.missingFromLedger).toHaveLength(0)
  })

  it('lech ngay trong 4 ngay van ghep', () => {
    const r = reconcileStatement([line('2026-06-07', 2200)], [tx('2026-06-06', 2200)], CARD, [])
    expect(r.matchedCount).toBe(1)
  })

  it('moi dong chi ghep mot lan — so co 4 lan 4950, the co 3', () => {
    const lines = [line('2026-06-02', 4950), line('2026-06-08', 4950), line('2026-06-16', 4950)]
    const led = [
      tx('2026-06-02', 4950), tx('2026-06-08', 4950),
      tx('2026-06-14', 4950), tx('2026-06-16', 4950),
    ]
    const r = reconcileStatement(lines, led, CARD, [])
    expect(r.matchedCount).toBe(3)
    expect(r.extraInLedger).toHaveLength(1)
  })

  it('hoan tien trong so mang dau am (is_refund, KHONG phai income)', () => {
    const r = reconcileStatement(
      [line('2026-03-06', -539, '調整額 · ChargeSPOT', true)],
      [tx('2026-03-27', 539, { is_refund: true })],
      CARD, [],
    )
    expect(r.matchedCount).toBe(1)
  })

  it('loai tra no the va khoan Dieu chinh so no khoi ro so', () => {
    const led = [
      tx('2026-06-05', 50000, { type: 'transfer', to_account_id: CARD }),
      tx('2026-06-06', 92158, { note: CARD_RECONCILE_NOTE }),
    ]
    const r = reconcileStatement([], led, CARD, [])
    expect(r.extraInLedger).toHaveLength(0)
  })

  it('nhan ra hoan tien lech ky: khop mot 調整額 o ky lien ke', () => {
    const r = reconcileStatement(
      [], [tx('2026-02-03', 961, { is_refund: true })], CARD,
      [{ lines: [line('2026-01-03', -961, '調整額 · 極楽茶屋', true)] }],
    )
    expect(r.extraInLedger).toHaveLength(0)
    expect(r.explained.map((e) => e.cause)).toEqual(['refund-shifted'])
  })

  it('nhan ra nap vi PayPay', () => {
    const r = reconcileStatement([line('2026-01-08', 4000, 'チャージ')], [], CARD, [])
    expect(r.missingFromLedger).toHaveLength(0)
    expect(r.explained.map((e) => e.cause)).toEqual(['wallet-topup'])
  })

  it('nhan ra lech ranh gioi ngay: khop mot dong the o ky lien ke', () => {
    const r = reconcileStatement(
      [], [tx('2026-06-30', 5060)], CARD,
      [{ lines: [line('2026-07-03', 5060, 'ユニクロオンラインストア')] }],
    )
    expect(r.extraInLedger).toHaveLength(0)
    expect(r.explained.map((e) => e.cause)).toEqual(['date-edge'])
  })

  it('nhan ra dong 再計算', () => {
    const r = reconcileStatement([line('2026-05-31', 3476, 'ＴＥＭＵ（再計算）')], [], CARD, [])
    expect(r.missingFromLedger).toHaveLength(0)
    expect(r.explained.map((e) => e.cause)).toEqual(['recalculated'])
  })

  it('ten chi CHUA chu チャージ thi KHONG duoc coi la nap vi', () => {
    const r = reconcileStatement([line('2026-01-08', 4000, 'モバイルＳｕｉｃａチャージ')], [], CARD, [])
    expect(r.explained).toHaveLength(0)
    expect(r.missingFromLedger).toHaveLength(1)
  })

  it('（再計算） phai la HAU TO moi tinh', () => {
    const r = reconcileStatement([line('2026-05-31', 3476, '（再計算）ＴＥＭＵ')], [], CARD, [])
    expect(r.explained).toHaveLength(0)
    expect(r.missingFromLedger).toHaveLength(1)
  })

  it('date-edge phai gan nhau ve thoi gian, khong khop bua theo so tien', () => {
    const r = reconcileStatement(
      [], [tx('2026-06-01', 5060)], CARD,
      [{ lines: [line('2026-07-28', 5060, 'ユニクロオンラインストア')] }],
    )
    expect(r.explained).toHaveLength(0)
    expect(r.extraInLedger).toHaveLength(1)
  })
})
