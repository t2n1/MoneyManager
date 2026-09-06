import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import { personalInflation } from './personalInflation'

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
    category_id: 'c-an',
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

/** Một khoản chi `amount` ngày 10 của từng tháng 'YYYY-MM'. */
const chi = (amount: number, months: string[], over: Partial<TransactionRow> = {}) =>
  months.map((m) => tx({ amount, occurred_on: `${m}-10`, ...over }))

const args = (txs: TransactionRow[], over: Record<string, unknown> = {}) => ({
  txs,
  currencyOf: () => BASE,
  base: BASE,
  rates,
  todayISO: TODAY,
  monthStartDay: 1,
  transferIds: noTransfers,
  ...over,
})

describe('personalInflation', () => {
  it('3 cặp tháng, giỏ đắt lên 10% → pct 10, nêu đúng nhóm kéo mạnh nhất', () => {
    const txs = [
      // Năm ngoái: ăn 50.000 + nhà 50.000 mỗi tháng 06-08/2025.
      ...chi(50_000, ['2025-06', '2025-07', '2025-08'], { category_id: 'c-an' }),
      ...chi(50_000, ['2025-06', '2025-07', '2025-08'], { category_id: 'c-nha' }),
      // Năm nay: ăn lên 60.000 (+20%), nhà giữ nguyên → giỏ +10%.
      ...chi(60_000, ['2026-06', '2026-07', '2026-08'], { category_id: 'c-an' }),
      ...chi(50_000, ['2026-06', '2026-07', '2026-08'], { category_id: 'c-nha' }),
    ]
    const r = personalInflation(args(txs))
    expect(r).not.toBeNull()
    expect(r!.pct).toBeCloseTo(10, 6)
    expect(r!.pairKeys).toHaveLength(3)
    expect(r!.pairKeys[0]).toEqual({ year: 2026, month: 6 })
    expect(r!.topCategory).toMatchObject({ categoryId: 'c-an' })
    expect(r!.topCategory!.pct).toBeCloseTo(20, 6)
  })

  it('chỉ 2 cặp tháng chung → chưa đủ, im lặng', () => {
    const txs = [
      ...chi(50_000, ['2025-07', '2025-08']),
      ...chi(60_000, ['2026-06', '2026-07', '2026-08']),
    ]
    expect(personalInflation(args(txs))).toBeNull()
  })

  it('danh mục nhỏ (<5% giỏ) tăng vọt không được nêu tên thay cả giỏ', () => {
    const txs = [
      ...chi(100_000, ['2025-06', '2025-07', '2025-08'], { category_id: 'c-an' }),
      ...chi(1_000, ['2025-06', '2025-07', '2025-08'], { category_id: 'c-le' }),
      ...chi(100_000, ['2026-06', '2026-07', '2026-08'], { category_id: 'c-an' }),
      ...chi(5_000, ['2026-06', '2026-07', '2026-08'], { category_id: 'c-le' }), // +400%
    ]
    const r = personalInflation(args(txs))
    // c-le chỉ ~1% giỏ năm ngoái → bị loại; c-an 0% là nhóm lớn duy nhất.
    expect(r!.topCategory).toMatchObject({ categoryId: 'c-an' })
  })

  it('chuyển khoản (transfer + danh mục transfer) và khoản loại-khỏi-thống-kê không vào giỏ', () => {
    const txs = [
      ...chi(50_000, ['2025-06', '2025-07', '2025-08']),
      ...chi(50_000, ['2026-06', '2026-07', '2026-08']),
      ...chi(999_999, ['2026-06'], { category_id: 'c-remit' }),
      ...chi(888_888, ['2026-07'], { exclude_from_stats: true }),
    ]
    const r = personalInflation(args(txs, { transferIds: new Set(['c-remit']) }))
    expect(r!.pct).toBeCloseTo(0, 6)
  })

  it('khoản thiếu tỷ giá bị loại + approx, tháng đó vẫn tính là có sổ', () => {
    const txs = [
      ...chi(50_000, ['2025-06', '2025-07', '2025-08']),
      ...chi(55_000, ['2026-06', '2026-07', '2026-08']),
      tx({ amount: 100, account_id: 'usd', occurred_on: '2026-06-20' }),
    ]
    const r = personalInflation(
      args(txs, { currencyOf: (id: string) => (id === 'usd' ? 'USD' : BASE) }),
    )
    expect(r!.approx).toBe(true)
    expect(r!.pct).toBeCloseTo(10, 6)
  })
})
