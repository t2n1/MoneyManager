import { describe, expect, it } from 'vitest'
import type { DebtPaymentRow, DebtRow, TransactionRow } from '../../types/database.types'
import type { Commitment } from '../budgets/commitments'
import { debtRows, lastEntryByAccount, remittanceMonths, remittanceYear, upcomingRows } from './boardPanels'

const c = (key: string, dueISO: string, amount: number, duePrecision: 'day' | 'month' = 'day') =>
  ({ key, dueISO, amount, duePrecision }) as Commitment

describe('upcomingRows', () => {
  it('gần nhất trước; cùng ngày thì khoản có ngày trước khoản chỉ-biết-tháng, rồi to trước', () => {
    const out = upcomingRows([
      c('muon', '2026-10-20', 100),
      c('thang', '2026-10-01', 900, 'month'),
      c('nho', '2026-10-01', 50),
      c('to', '2026-10-01', 500),
    ])
    expect(out.map((x) => x.key)).toEqual(['to', 'nho', 'thang', 'muon'])
  })
})

describe('debtRows', () => {
  const debt = (id: string, extra: Partial<DebtRow> = {}) =>
    ({ id, counterparty: id, direction: 'i_owe', currency: 'JPY', principal: 1000, due_on: null, status: 'open', ...extra }) as DebtRow
  const pay = (debt_id: string, amount: number) => ({ debt_id, amount }) as DebtPaymentRow

  it('bỏ khoản đã tất toán và khoản đã trả hết', () => {
    const out = debtRows(
      [debt('mo'), debt('xong', { status: 'settled' }), debt('het')],
      [pay('het', 1000)],
    )
    expect(out.map((d) => d.id)).toEqual(['mo'])
  })

  it('tỷ lệ đã trả tính trên tổng đã giải ngân, không đếm lần vay thêm là đã trả', () => {
    const [d] = debtRows([debt('a')], [pay('a', 300), pay('a', -1000)])
    // gốc 1000 + vay thêm 1000 = 2000; trả thực 300
    expect(d.paidRatio).toBeCloseTo(0.15)
    expect(d.remaining).toBe(1700)
  })

  it('hạn gần nhất trước, khoản không hạn xuống cuối', () => {
    const out = debtRows(
      [debt('khong-han'), debt('muon', { due_on: '2026-12-01' }), debt('som', { due_on: '2026-10-01' })],
      [],
    )
    expect(out.map((d) => d.id)).toEqual(['som', 'muon', 'khong-han'])
  })
})

describe('gửi tiền về nhà', () => {
  const tx = (occurred_on: string, amount: number, fee = 0, extra: Partial<TransactionRow> = {}) =>
    ({ occurred_on, amount, remit_fee_jpy: fee, remit_received_vnd: 0, is_remittance: true, ...extra }) as TransactionRow

  it('mỗi tháng một hàng, tháng không gửi là 0; giao dịch thường không tính', () => {
    const rows = remittanceMonths(
      [tx('2026-08-05', 50000, 1000), tx('2026-08-20', 30000), tx('2026-08-21', 999, 0, { is_remittance: false })],
      [
        { year: 2026, month: 7 },
        { year: 2026, month: 8 },
      ],
      1,
    )
    expect(rows).toEqual([
      { label: '7/26', sent: 0, fee: 0, count: 0 },
      { label: '8/26', sent: 79000, fee: 1000, count: 2 },
    ])
  })

  it('tổng năm theo năm DƯƠNG LỊCH', () => {
    const s = remittanceYear([tx('2025-12-31', 10000), tx('2026-01-01', 20000)], 2026)
    expect(s.totalSentJpy).toBe(20000)
    expect(s.count).toBe(1)
  })
})

describe('lastEntryByAccount', () => {
  it('ngày mới nhất theo từng tài khoản', () => {
    const t = (account_id: string, occurred_on: string) => ({ account_id, occurred_on }) as TransactionRow
    const m = lastEntryByAccount([t('a', '2026-08-01'), t('a', '2026-09-03'), t('b', '2026-07-10'), t('a', '2026-08-20')])
    expect(m.get('a')).toBe('2026-09-03')
    expect(m.get('b')).toBe('2026-07-10')
    expect(m.has('c')).toBe(false)
  })
})
