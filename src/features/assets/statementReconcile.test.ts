import { describe, expect, it } from 'vitest'
import { reconcileBatch, type LedgerTx, type ReconcileResult } from './statementReconcile'
import type { MergedStatement } from './statementBatch'
import type { LineKind, StatementLine } from './statementLine'
import { CARD_RECONCILE_NOTE } from './reconcile'

const CARD = 'card-1'
const line = (iso: string, amount: number, name = 'X', kind: LineKind = 'purchase'): StatementLine => ({
  iso, amount, billed: amount, name, kind, isAdjustment: kind === 'adjustment',
})
const tx = (iso: string, amount: number, p: Partial<LedgerTx> = {}): LedgerTx => ({
  id: `t-${iso}-${amount}-${Math.random().toString(36).slice(2, 6)}`,
  occurred_on: iso,
  amount,
  type: 'expense',
  is_refund: false,
  to_account_id: null,
  note: null,
  ...p,
})
/** Kỳ quẹt cả tháng: start = mùng 1, closeISO = cuối tháng, end = mùng 1 tháng sau. */
const period = (yyyyMM: string, lines: StatementLine[]): MergedStatement => {
  const [y, m] = yyyyMM.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return {
    range: { start: `${yyyyMM}-01`, end: next, closeISO: `${yyyyMM}-${last}`, dueISO: `${next.slice(0, 7)}-27` },
    total: lines.reduce((s, l) => s + l.billed, 0),
    parts: [],
    lines,
    dueDateMismatch: false,
  }
}
/** Một kỳ, một kết quả — cách gọi ngắn cho các ca không cần lô. */
const one = (yyyyMM: string, lines: StatementLine[], ledger: LedgerTx[]): ReconcileResult => {
  const p = period(yyyyMM, lines)
  return reconcileBatch([p], ledger, CARD).get(p.range.closeISO)!
}
const causes = (r: ReconcileResult) => r.explained.map((e) => e.cause)

describe('reconcileBatch — ghep 1-1', () => {
  it('ghep duoc thi khong ai vao danh sach lech, va co mot cap khong cause', () => {
    const r = one('2026-06', [line('2026-06-02', 4950)], [tx('2026-06-02', 4950)])
    expect(r.matchedCount).toBe(1)
    expect(r.extraInLedger).toHaveLength(0)
    expect(r.missingFromLedger).toHaveLength(0)
    expect(r.pairs).toHaveLength(1)
    expect(r.pairs[0].cause).toBeUndefined()
  })

  it('lech ngay trong 4 ngay van ghep', () => {
    expect(one('2026-06', [line('2026-06-07', 2200)], [tx('2026-06-06', 2200)]).matchedCount).toBe(1)
  })

  it('moi dong chi ghep mot lan — so co 4 lan 4950, the co 3', () => {
    const r = one(
      '2026-06',
      [line('2026-06-02', 4950), line('2026-06-08', 4950), line('2026-06-16', 4950)],
      [tx('2026-06-02', 4950), tx('2026-06-08', 4950), tx('2026-06-14', 4950), tx('2026-06-16', 4950)],
    )
    expect(r.matchedCount).toBe(3)
    expect(r.extraInLedger).toHaveLength(1)
  })

  it('vong 2: cung ky, cach xa hon 4 ngay van ghep', () => {
    expect(one('2026-06', [line('2026-06-25', 700)], [tx('2026-06-03', 700)]).matchedCount).toBe(1)
  })

  it('hoan tien trong so mang dau am (is_refund, KHONG phai income)', () => {
    const r = one('2026-03', [line('2026-03-06', -539, '調整額 · ChargeSPOT', 'adjustment')], [tx('2026-03-27', 539, { is_refund: true })])
    expect(r.matchedCount).toBe(1)
  })

  it('income tren the mang dau am, khong ghep nham voi mot khoan chi that', () => {
    const r = one('2026-06', [line('2026-06-05', 5000, 'Mot khoan chi that')], [tx('2026-06-05', 5000, { type: 'income' })])
    expect(r.matchedCount).toBe(0)
    expect(r.missingFromLedger).toHaveLength(1)
    expect(r.extraInLedger).toHaveLength(1)
  })

  it('loai tra no the va khoan Dieu chinh so no khoi ro so', () => {
    const r = one('2026-06', [], [
      tx('2026-06-05', 50000, { type: 'transfer', to_account_id: CARD }),
      tx('2026-06-06', 92158, { note: CARD_RECONCILE_NOTE }),
    ])
    expect(r.extraInLedger).toHaveLength(0)
  })

  it('dong so nam NGOAI moi ky da nap va khong ghep duoc thi bo qua, khong bao', () => {
    const r = reconcileBatch([period('2026-06', [])], [tx('2026-03-03', 999)], CARD)
    expect(r.get('2026-06-30')!.extraInLedger).toHaveLength(0)
  })
})

describe('reconcileBatch — cap ghep khac ky', () => {
  it('date-edge: so 30/06, the 03/07 (ky 7) — ky 6 khong con so thua, ky 7 co hang date-edge', () => {
    const r = reconcileBatch(
      [period('2026-06', []), period('2026-07', [line('2026-07-03', 5060, 'ユニクロオンラインストア')])],
      [tx('2026-06-30', 5060)],
      CARD,
    )
    expect(r.get('2026-06-30')!.extraInLedger).toHaveLength(0)
    expect(causes(r.get('2026-07-31')!)).toEqual(['date-edge'])
    expect(r.get('2026-07-31')!.missingFromLedger).toHaveLength(0)
  })

  it('date-edge phai gan ranh gioi, khong khop bua theo so tien qua vong 1 (>4 ngay, khac ky)', () => {
    const r = reconcileBatch(
      [period('2026-06', []), period('2026-07', [line('2026-07-28', 5060, 'ユニクロ')])],
      [tx('2026-06-01', 5060)],
      CARD,
    )
    expect(r.get('2026-06-30')!.extraInLedger).toHaveLength(1)
    expect(r.get('2026-07-31')!.missingFromLedger).toHaveLength(1)
  })

  it('late-posting: ETC quet 17/05 nam trong hoa don ky 6 (quet thang 6), so co dong 17/05', () => {
    const r = reconcileBatch(
      [period('2026-05', []), period('2026-06', [line('2026-05-17', 300, 'ＥＴＣカード売上')])],
      [tx('2026-05-17', 300, { note: 'ETC 利用料' })],
      CARD,
    )
    expect(r.get('2026-05-31')!.extraInLedger).toHaveLength(0)
    expect(causes(r.get('2026-06-30')!)).toEqual(['late-posting'])
  })

  it('late-posting khi so nam ngoai moi ky da nap van ghep duoc', () => {
    const r = reconcileBatch(
      [period('2026-06', [line('2026-05-17', 300, 'ＥＴＣカード売上')])],
      [tx('2026-05-17', 300)],
      CARD,
    )
    expect(causes(r.get('2026-06-30')!)).toEqual(['late-posting'])
  })

  it('mot dong so khong bao gio ghep hai dong the o hai ky', () => {
    const r = reconcileBatch(
      [period('2026-06', [line('2026-06-30', 1000)]), period('2026-07', [line('2026-07-01', 1000)])],
      [tx('2026-06-30', 1000)],
      CARD,
    )
    const matched = r.get('2026-06-30')!.matchedCount + r.get('2026-07-31')!.matchedCount
    expect(matched).toBe(1)
    expect(r.get('2026-06-30')!.missingFromLedger.length + r.get('2026-07-31')!.missingFromLedger.length).toBe(1)
    expect(r.get('2026-06-30')!.matchedCount).toBe(1)
  })

  it('vong 1 chon gap nho nhat TOAN CUC, khong an theo thu tu mang ledger', () => {
    // the ky6 (06-20) va the ky7 (07-01), cung 1000. So co hai dong: A 06-28 (gap toi
    // the ky7 = 3 ngay), B 07-01 (gap toi the ky7 = 0 ngay). Xu ly theo thu tu mang ledger
    // (A truoc B) se khien A "cuop" dong the ky7 truoc — dung ra B moi la dong khop that.
    const r = reconcileBatch(
      [period('2026-06', [line('2026-06-20', 1000)]), period('2026-07', [line('2026-07-01', 1000)])],
      [tx('2026-06-28', 1000), tx('2026-07-01', 1000)],
      CARD,
    )
    // B (gap 0, dung ky) phai thang A (gap 3), du A dung truoc trong mang ledger.
    expect(r.get('2026-07-31')!.matchedCount).toBe(1)
    expect(causes(r.get('2026-07-31')!)).toEqual([])
    expect(r.get('2026-07-31')!.pairs[0].ledger[0].occurred_on).toBe('2026-07-01')
    // A khong con "cuop" duoc dong the ky 7 nua; vong 2 ghep tiep A voi dong so CUNG KY no
    // (06-20) — dung theo luat "cung ky, khong gioi han ngay" von co san, khong phai ro.
    expect(r.get('2026-06-30')!.matchedCount).toBe(1)
    expect(r.get('2026-06-30')!.missingFromLedger).toHaveLength(0)
    expect(r.get('2026-06-30')!.extraInLedger).toHaveLength(0)
    expect(causes(r.get('2026-06-30')!)).not.toContain('date-edge')
    expect(causes(r.get('2026-07-31')!)).not.toContain('date-edge')
  })
})

describe('reconcileBatch — UNMATCHABLE', () => {
  it('dong topup khong duoc ghep vong 1/2, nhung duoc luat nap vi giai thich thay vi vao can xem', () => {
    const r = one(
      '2026-06',
      [line('2026-06-15', 1485, '楽天キャッシュ　チャージ', 'topup')],
      [tx('2026-06-15', 1485)],
    )
    expect(r.matchedCount).toBe(0)
    expect(causes(r)).toEqual(['wallet-topup'])
    expect(r.extraInLedger).toHaveLength(0)
    expect(r.missingFromLedger).toHaveLength(0)
    expect(r.unmatchedTopups.count).toBe(0)
  })

  it('dong installment-later khong duoc ghep, danh cho tra gop lan sau', () => {
    const r = one(
      '2026-06',
      [line('2026-06-15', 3000, 'The Gioi Di Dong (tra gop 2/3)', 'installment-later')],
      [tx('2026-06-15', 3000)],
    )
    expect(r.matchedCount).toBe(0)
    expect(r.extraInLedger).toHaveLength(1)
  })
})

describe('reconcileBatch — luat giai thich duoc (PayPay)', () => {
  it('refund-shifted: hoan tien so ky 2, nha the can 調整額 ky 1', () => {
    const r = reconcileBatch(
      [period('2026-01', [line('2026-01-03', -961, '調整額 · 極楽茶屋', 'adjustment')]), period('2026-02', [])],
      [tx('2026-02-03', 961, { is_refund: true })],
      CARD,
    )
    expect(r.get('2026-02-28')!.extraInLedger).toHaveLength(0)
    expect(r.get('2026-02-28')!.refundDiffs).toHaveLength(0)
    expect(causes(r.get('2026-01-31')!)).toEqual(['refund-shifted'])
  })

  it('refund-shifted KHONG ghep voi dong income, chi is_refund moi duoc', () => {
    const r = reconcileBatch(
      [period('2026-01', [line('2026-01-03', -961, '調整額 · X', 'adjustment')]), period('2026-02', [])],
      [tx('2026-02-03', 961, { type: 'income' })],
      CARD,
    )
    expect(causes(r.get('2026-01-31')!)).toEqual([])
    expect(causes(r.get('2026-02-28')!)).toEqual([])
    expect(r.get('2026-02-28')!.extraInLedger).toHaveLength(1)
    expect(r.get('2026-02-28')!.extraInLedger[0].amount).toBe(-961)
    expect(r.get('2026-01-31')!.refundDiffs).toEqual([
      { source: 'statement', label: '調整額 · X', iso: '2026-01-03', amount: -961 },
    ])
  })

  it('recalculated: dong （再計算） khong co trong so', () => {
    const r = one('2026-05', [line('2026-05-31', 3476, 'ＴＥＭＵ（再計算）', 'recalculated')], [])
    expect(r.missingFromLedger).toHaveLength(0)
    expect(causes(r)).toEqual(['recalculated'])
  })

  it('dong 調整額 khong khop di vao nhom hoan tien rieng, khong vao "can xem"', () => {
    const r = one('2026-01', [line('2026-01-03', -7951, '調整額 · 極楽茶屋', 'adjustment')], [])
    expect(r.missingFromLedger).toHaveLength(0)
    expect(r.refundDiffs).toEqual([{ source: 'statement', label: '調整額 · 極楽茶屋', iso: '2026-01-03', amount: -7951 }])
  })

  it('dong hoan tien trong so khong khop di vao nhom hoan tien rieng', () => {
    const r = one('2026-01', [], [tx('2026-01-28', 6990, { is_refund: true, note: 'Uniqlo hoan' })])
    expect(r.extraInLedger).toHaveLength(0)
    expect(r.refundDiffs[0]).toMatchObject({ source: 'ledger', amount: -6990 })
  })

  it('merged-rows: so ghi gop mot dong, the tach hai dong cung ngay', () => {
    const r = one('2026-06', [line('2026-06-18', 5148, 'ＴＥＭＵ'), line('2026-06-18', 732, 'ＴＥＭＵ')], [tx('2026-06-18', 5880)])
    expect(r.extraInLedger).toHaveLength(0)
    expect(r.missingFromLedger).toHaveLength(0)
    expect(causes(r)).toContain('merged-rows')
    const p = r.pairs.find((p) => p.cause === 'merged-rows')!
    expect(p.lines).toHaveLength(2)
    expect(p.ledger).toHaveLength(1)
  })

  it('tong khop nhung KHAC NGAY thi KHONG duoc gop', () => {
    const r = one('2026-06', [line('2026-06-18', 5148, 'ＴＥＭＵ'), line('2026-06-20', 732, 'ＴＥＭＵ')], [tx('2026-06-18', 5880)])
    expect(causes(r)).not.toContain('merged-rows')
    expect(r.extraInLedger).toHaveLength(1)
  })

  it('merged-rows khong duoc tron dau: 3000 + (-2000) khong duoc "giai thich" mot khoan 1000', () => {
    const r = one(
      '2026-06',
      [line('2026-06-18', 3000, 'ＴＥＭＵ'), line('2026-06-18', -2000, 'ＴＥＭＵ hoan')],
      [tx('2026-06-18', 1000)],
    )
    expect(causes(r)).not.toContain('merged-rows')
    expect(r.extraInLedger).toHaveLength(1)
  })
})

describe('reconcileBatch — luat Rakuten', () => {
  const topup = (iso: string, amount: number) => line(iso, amount, '楽天キャッシュ　チャージ', 'topup')

  it('wallet-topup: nap ngay D = tong 2 mon so ngay D-1 chua ghep (2376 = 1051 + 1325)', () => {
    const r = one('2026-06', [topup('2026-06-22', 2376)], [tx('2026-06-21', 1051), tx('2026-06-21', 1325)])
    expect(r.extraInLedger).toHaveLength(0)
    expect(r.missingFromLedger).toHaveLength(0)
    expect(r.unmatchedTopups.count).toBe(0)
    const p = r.pairs.find((p) => p.cause === 'wallet-topup')!
    expect(p.ledger).toHaveLength(2)
    expect(p.lines).toHaveLength(1)
    expect(p.label).toBe('Nạp ví Rakuten Pay = 2 món sổ ngày 21/06')
  })

  it('wallet-topup chi dung mon CHUA ghep: quet thang the 40680 da ghep, con 1485 moi la nap vi', () => {
    const r = one(
      '2026-06',
      [line('2026-06-22', 40680, 'ﾄｷｳﾞﾃﾂ'), topup('2026-06-23', 1485)],
      [tx('2026-06-22', 40680), tx('2026-06-22', 1485)],
    )
    expect(r.matchedCount).toBe(1)
    expect(causes(r)).toEqual(['wallet-topup'])
    expect(r.extraInLedger).toHaveLength(0)
  })

  it('wallet-topup: khong thay nhom ngay D-1 thi thu CUNG ngay D; nap vi KHONG di qua vong 1', () => {
    const r = one('2026-06', [topup('2026-06-15', 1230)], [tx('2026-06-15', 1230)])
    expect(r.matchedCount).toBe(0)
    expect(causes(r)).toEqual(['wallet-topup'])
    expect(r.extraInLedger).toHaveLength(0)
    expect(r.unmatchedTopups.count).toBe(0)
  })

  it('nap vi 1485 KHONG an nham khoan chi 1485 cung ngay khi ngay hom truoc co nhom khop', () => {
    const r = one('2026-06', [topup('2026-06-23', 1485)], [tx('2026-06-22', 1485), tx('2026-06-23', 1485)])
    const p = r.pairs.find((p) => p.cause === 'wallet-topup')!
    expect(p.ledger[0].occurred_on).toBe('2026-06-22')
    expect(r.extraInLedger.map((e) => e.tx.occurred_on)).toEqual(['2026-06-23'])
  })

  it('wallet-topup: mon so la hoan tien thi KHONG duoc dua vao nhom', () => {
    const r = one('2026-06', [topup('2026-06-22', 1000)], [tx('2026-06-21', 1000, { is_refund: true })])
    expect(r.unmatchedTopups.count).toBe(1)
  })

  it('nap vi khong tim duoc nhom thi vao cum unmatchedTopups, KHONG vao missingFromLedger', () => {
    const r = one('2026-06', [topup('2026-06-24', 1000), topup('2026-06-20', 2258)], [tx('2026-06-23', 278)])
    expect(r.missingFromLedger).toHaveLength(0)
    expect(r.unmatchedTopups).toMatchObject({ count: 2, total: 3258 })
    expect(r.extraInLedger).toHaveLength(1) // 278 vẫn là "sổ có, thẻ không"
  })

  it('PayPay チャージ cung theo luat nay: co transfer ra vi trong so thi ghep, khong thi vao cum', () => {
    const r1 = one('2026-01', [line('2026-01-08', 4000, 'チャージ', 'topup')], [tx('2026-01-08', 4000, { type: 'transfer', to_account_id: 'wallet' })])
    expect(causes(r1)).toEqual(['wallet-topup'])
    expect(r1.extraInLedger).toHaveLength(0)
    expect(r1.unmatchedTopups.count).toBe(0)
    expect(r1.pairs.find((p) => p.cause === 'wallet-topup')!.label.startsWith('Nạp ví PayPay')).toBe(true)
    const r2 = one('2026-01', [line('2026-01-08', 4000, 'チャージ', 'topup')], [])
    expect(r2.missingFromLedger).toHaveLength(0)
    expect(r2.unmatchedTopups.count).toBe(1)
  })

  it('installment: dong tra gop lan 2 giai thich duoc, khong ghep voi ai', () => {
    const r = one('2026-03', [line('2026-02-09', 4734, 'AMAZON.CO.JP', 'installment-later')], [tx('2026-02-09', 4734)])
    expect(causes(r)).toEqual(['installment'])
    expect(r.explained[0].label).toBe('AMAZON.CO.JP — trả góp lần sau, sổ đã ghi cả món')
    expect(r.matchedCount).toBe(0)
  })

  it('investment: 楽天証券 giai thich duoc', () => {
    const r = one('2026-06', [line('2026-06-01', 68000, '楽天証券投信積立', 'investment')], [])
    expect(causes(r)).toEqual(['investment'])
    expect(r.explained[0].label).toBe('楽天証券投信積立 — mua quỹ, theo dõi riêng')
  })
})
