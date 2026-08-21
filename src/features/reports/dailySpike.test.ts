import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import { dailySpendSeries } from './dailySpike'

// base = JPY: 1 ¥ = 165 ₫
const RATES: Rates = { JPY: 1, VND: 165 }
const currencyOf = (id: string): CurrencyCode => (id === 'vnd' ? 'VND' : 'JPY')

let seq = 0
function tx(p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount'>): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    category_id: null,
    account_id: 'jpy',
    to_account_id: null,
    to_amount: null,
    recurring_rule_id: null,
    occurred_on: '2026-08-01',
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  }
}

/** Chuỗi ngày của một tháng ngắn cho gọn: 01/08 → 05/08. */
const series = (txs: TransactionRow[], transferIds: ReadonlySet<string> = new Set()) =>
  dailySpendSeries(txs, '2026-08-01', '2026-08-05', currencyOf, 'JPY', RATES, transferIds)

describe('dailySpendSeries — chuỗi ngày', () => {
  it('trả đủ mọi ngày trong khoảng, ngày không chi là 0', () => {
    const r = series([tx({ type: 'expense', amount: 1_000, occurred_on: '2026-08-03' })])
    expect(r.days.map((d) => d.date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ])
    expect(r.days.map((d) => d.total)).toEqual([0, 0, 1_000, 0, 0])
  })

  it('cộng nhiều khoản trong cùng một ngày', () => {
    const r = series([
      tx({ type: 'expense', amount: 1_000, occurred_on: '2026-08-02' }),
      tx({ type: 'expense', amount: 2_500, occurred_on: '2026-08-02' }),
    ])
    expect(r.days[1].total).toBe(3_500)
  })

  it('quy đổi ngoại tệ về base', () => {
    const r = series([
      tx({ type: 'expense', amount: 165_000, account_id: 'vnd', occurred_on: '2026-08-01' }),
    ])
    expect(r.days[0].total).toBe(1_000)
  })

  it('thu nhập không vào chuỗi chi', () => {
    const r = series([tx({ type: 'income', amount: 300_000, occurred_on: '2026-08-01' })])
    expect(r.days[0].total).toBe(0)
  })
})

describe('dailySpendSeries — cùng luật loại trừ với aggregate', () => {
  it('bỏ dòng tiền nợ/cho vay và giao dịch không tính vào thống kê', () => {
    const r = series([
      tx({ type: 'expense', amount: 5_000, occurred_on: '2026-08-01', is_debt_flow: true }),
      tx({ type: 'expense', amount: 7_000, occurred_on: '2026-08-01', exclude_from_stats: true }),
      tx({ type: 'expense', amount: 900, occurred_on: '2026-08-01' }),
    ])
    expect(r.days[0].total).toBe(900)
  })

  it('bỏ danh mục chuyển tài sản', () => {
    const r = series(
      [
        tx({ type: 'expense', amount: 30_000, category_id: 'gui-ve-vn', occurred_on: '2026-08-01' }),
        tx({ type: 'expense', amount: 800, category_id: 'food', occurred_on: '2026-08-01' }),
      ],
      new Set(['gui-ve-vn']),
    )
    expect(r.days[0].total).toBe(800)
  })

  it('hoàn tiền là chi ÂM, trừ khỏi tổng của chính ngày đó', () => {
    const r = series([
      tx({ type: 'expense', amount: 4_000, occurred_on: '2026-08-02' }),
      tx({ type: 'expense', amount: 1_500, occurred_on: '2026-08-02', is_refund: true }),
    ])
    expect(r.days[1].total).toBe(2_500)
  })

  it('thiếu tỷ giá thì loại khoản đó và bật cờ, KHÔNG quy 1:1', () => {
    const r = dailySpendSeries(
      [
        tx({ type: 'expense', amount: 999, account_id: 'usd', occurred_on: '2026-08-01' }),
        tx({ type: 'expense', amount: 600, occurred_on: '2026-08-01' }),
      ],
      '2026-08-01',
      '2026-08-05',
      (id) => (id === 'usd' ? 'USD' : 'JPY'),
      'JPY',
      RATES, // không có USD
      new Set(),
    )
    expect(r.hasMissingRate).toBe(true)
    expect(r.days[0].total).toBe(600)
  })
})

describe('dailySpendSeries — mức chi thường ngày', () => {
  it('là TRUNG VỊ của những ngày CÓ chi, không phải trung bình cả tháng', () => {
    // 1 ngày ¥100.000 + 4 ngày ¥1.000: trung bình 20.800, trung vị 1.000.
    const r = series([
      tx({ type: 'expense', amount: 100_000, occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 1_000, occurred_on: '2026-08-02' }),
      tx({ type: 'expense', amount: 1_000, occurred_on: '2026-08-03' }),
      tx({ type: 'expense', amount: 1_000, occurred_on: '2026-08-04' }),
      tx({ type: 'expense', amount: 1_000, occurred_on: '2026-08-05' }),
    ])
    expect(r.typical).toBe(1_000)
  })

  it('không tính ngày không chi vào trung vị', () => {
    // chỉ 2 ngày có chi: 1.000 và 3.000 → trung vị 2.000, không phải 800 (chia cho 5 ngày)
    const r = series([
      tx({ type: 'expense', amount: 1_000, occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 3_000, occurred_on: '2026-08-05' }),
    ])
    expect(r.typical).toBe(2_000)
  })

  it('cả tháng không chi thì bằng 0', () => {
    expect(series([]).typical).toBe(0)
  })
})

describe('dailySpendSeries — ngày đỉnh', () => {
  it('chỉ đúng ngày chi cao nhất', () => {
    const r = series([
      tx({ type: 'expense', amount: 1_000, occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 9_000, occurred_on: '2026-08-04' }),
      tx({ type: 'expense', amount: 2_000, occurred_on: '2026-08-05' }),
    ])
    expect(r.peakIndex).toBe(3)
    expect(r.days[r.peakIndex].date).toBe('2026-08-04')
  })

  it('hai ngày bằng nhau thì lấy ngày SỚM hơn', () => {
    const r = series([
      tx({ type: 'expense', amount: 5_000, occurred_on: '2026-08-02' }),
      tx({ type: 'expense', amount: 5_000, occurred_on: '2026-08-04' }),
    ])
    expect(r.peakIndex).toBe(1)
  })

  it('cả tháng không chi thì không có đỉnh', () => {
    expect(series([]).peakIndex).toBe(-1)
  })
})

describe('dailySpendSeries — mấy khoản lớn nhất trong ngày', () => {
  it('xếp giảm dần và cắt ở 3 khoản', () => {
    const r = series([
      tx({ type: 'expense', amount: 100, occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 4_000, occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 900, occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 2_000, occurred_on: '2026-08-01' }),
    ])
    expect(r.days[0].top.map((t) => t.amount)).toEqual([4_000, 2_000, 900])
  })

  it('trả id danh mục và ghi chú thô, KHÔNG trả tên danh mục', () => {
    const r = series([
      tx({
        type: 'expense',
        amount: 84_200,
        category_id: 'nha',
        note: 'tiền nhà tháng 8',
        occurred_on: '2026-08-03',
      }),
    ])
    expect(r.days[2].top).toEqual([
      { categoryId: 'nha', note: 'tiền nhà tháng 8', amount: 84_200 },
    ])
  })

  it('khoản hoàn tiền không nằm trong mấy khoản lớn nhất', () => {
    // Nó là chi âm — xếp nó vào "khoản lớn nhất trong ngày" là đọc ngược.
    const r = series([
      tx({ type: 'expense', amount: 4_000, occurred_on: '2026-08-02', is_refund: true }),
      tx({ type: 'expense', amount: 900, occurred_on: '2026-08-02' }),
    ])
    expect(r.days[1].top.map((t) => t.amount)).toEqual([900])
  })

  it('ngày không chi thì rỗng', () => {
    expect(series([]).days[0].top).toEqual([])
  })
})
