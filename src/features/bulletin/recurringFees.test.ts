import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import { detectRecurringFees } from './recurringFees'

const TODAY = '2026-09-06'
const BASE = 'JPY' as const
const rates = { VND: 163 }
const noTransfers: ReadonlySet<string> = new Set()

let seq = 0
function tx(p: Partial<TransactionRow>): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    type: 'expense',
    amount: 0,
    to_amount: null,
    category_id: 'c-sub',
    account_id: 'a',
    to_account_id: null,
    recurring_rule_id: null,
    occurred_on: '2026-01-15',
    note: '',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    is_remittance: false,
    remit_service: null,
    remit_fee_jpy: null,
    remit_received_vnd: null,
    remit_recipient_id: null,
    is_debt_flow: false,
    exclude_from_stats: false,
    stock_trade_id: null,
    is_refund: false,
    ...p,
  } as TransactionRow
}

/** Một khoản `amount` vào ngày 15 mỗi tháng trong `months` ('YYYY-MM'). */
const chuoi = (amount: number, months: string[], over: Partial<TransactionRow> = {}) =>
  months.map((m) => tx({ amount, occurred_on: `${m}-15`, ...over }))

const args = (txs: TransactionRow[], over: Record<string, unknown> = {}) => ({
  txs,
  currencyOf: () => BASE,
  base: BASE,
  rates,
  todayISO: TODAY,
  transferIds: noTransfers,
  ...over,
})

describe('detectRecurringFees', () => {
  it('4 lần cùng tiền cùng danh mục nhịp tháng → một chuỗi, ghi chú hay gặp nhất', () => {
    const txs = chuoi(1480, ['2026-05', '2026-06', '2026-07', '2026-08'], { note: 'Netflix' })
    txs[2] = { ...txs[2], note: '' } // một tháng quên ghi chú vẫn là cùng chuỗi
    const r = detectRecurringFees(args(txs))
    expect(r).not.toBeNull()
    expect(r!.items).toHaveLength(1)
    expect(r!.items[0]).toMatchObject({ perMonthMinor: 1480, hits: 4, note: 'Netflix' })
    expect(r!.totalPerMonthMinor).toBe(1480)
  })

  it('khoản đã có lệnh định kỳ / mới 2 lần / nhịp tuần → im lặng', () => {
    const daKhai = chuoi(980, ['2026-06', '2026-07', '2026-08'], { recurring_rule_id: 'r1' })
    const moi2 = chuoi(500, ['2026-07', '2026-08'])
    const tuan = [1, 8, 15, 22, 29].map((d) =>
      tx({ amount: 700, occurred_on: `2026-08-${String(d).padStart(2, '0')}` }),
    )
    expect(detectRecurringFees(args([...daKhai, ...moi2, ...tuan]))).toBeNull()
  })

  it('chuỗi đã dứt (lần cuối quá 45 ngày) → không nhắc nữa', () => {
    const txs = chuoi(1480, ['2026-03', '2026-04', '2026-05', '2026-06'])
    expect(detectRecurringFees(args(txs))).toBeNull()
  })

  it('hụt một kỳ vẫn là chuỗi; đứt hơn hai tháng thì không', () => {
    const hutMot = chuoi(2200, ['2026-04', '2026-05', '2026-07', '2026-08'])
    expect(detectRecurringFees(args(hutMot))!.items).toHaveLength(1)
    const dutDai = chuoi(2200, ['2026-01', '2026-02', '2026-07', '2026-08'])
    expect(detectRecurringFees(args(dutDai))).toBeNull()
  })

  it('danh mục transfer (gửi tiền về VN) không phải phí', () => {
    const txs = chuoi(30_000, ['2026-06', '2026-07', '2026-08'], { category_id: 'c-remit' })
    expect(detectRecurringFees(args(txs, { transferIds: new Set(['c-remit']) }))).toBeNull()
  })

  it('thiếu tỷ giá → loại chuỗi + cờ approx; chuỗi còn lại vẫn ra', () => {
    const vnd = chuoi(120_000_00, ['2026-06', '2026-07', '2026-08'], {
      account_id: 'vn',
      category_id: 'c-vn',
    })
    const jpy = chuoi(1480, ['2026-06', '2026-07', '2026-08'])
    const r = detectRecurringFees(
      args([...vnd, ...jpy], {
        currencyOf: (id: string) => (id === 'vn' ? 'USD' : BASE), // USD không có trong rates
      }),
    )
    expect(r).not.toBeNull()
    expect(r!.items).toHaveLength(1)
    expect(r!.approx).toBe(true)
  })

  it('hai chuỗi xếp theo tiền/tháng giảm dần, tổng cộng đúng', () => {
    const r = detectRecurringFees(
      args([
        ...chuoi(980, ['2026-06', '2026-07', '2026-08'], { category_id: 'c1' }),
        ...chuoi(2980, ['2026-06', '2026-07', '2026-08'], { category_id: 'c2' }),
      ]),
    )
    expect(r!.items.map((i) => i.perMonthMinor)).toEqual([2980, 980])
    expect(r!.totalPerMonthMinor).toBe(3960)
  })
})
