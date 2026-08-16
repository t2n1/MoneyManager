import { describe, expect, it } from 'vitest'
import {
  applyLedgerFilter,
  balanceByDay,
  EMPTY_LEDGER_FILTER,
  isFilterActive,
  needsCategory,
  uncategorizedSummary,
} from './ledgerView'
import type { TransactionRow } from '../../types/database.types'

const tx = (p: Partial<TransactionRow>): TransactionRow =>
  ({
    id: 'x',
    type: 'expense',
    amount: 1000,
    account_id: 'jpy',
    category_id: 'cat',
    occurred_on: '2026-08-05',
    ...p,
  }) as TransactionRow

const currencyOf = (id: string) => (id === 'vnd' ? 'VND' : 'JPY') as 'JPY' | 'VND'
// Quy ước của lib/rates: `rates[from]` là số đơn vị `from` cho MỘT đơn vị base, và
// convertToBase CHIA cho nó. 170 ₫ / ¥1 — cùng bậc với tỷ giá thật.
const RATES = { VND: 170 }
/** Đổi VND (minor = đồng) sang JPY minor, theo đúng công thức của convertToBase. */
const vndToJpy = (dong: number) => Math.round(dong / 170)

describe('needsCategory', () => {
  it('khoản chi/thu chưa gắn danh mục thì cần', () => {
    expect(needsCategory(tx({ category_id: null }))).toBe(true)
    expect(needsCategory(tx({ category_id: null, type: 'income' }))).toBe(true)
  })

  it('đã gắn rồi thì thôi', () => {
    expect(needsCategory(tx({ category_id: 'an-uong' }))).toBe(false)
  })

  // Chuyển khoản KHÔNG BAO GIỜ có danh mục — đếm nó vào là dựng ra một danh sách việc
  // không thể làm xong, và số ở Sổ sẽ lệch với bảng uncategorized.ts bên Báo cáo.
  it('chuyển khoản không tính, dù category_id rỗng', () => {
    expect(needsCategory(tx({ category_id: null, type: 'transfer' }))).toBe(false)
  })
})

describe('applyLedgerFilter', () => {
  const list = [
    tx({ id: 'chi', type: 'expense' }),
    tx({ id: 'thu', type: 'income' }),
    tx({ id: 'ck', type: 'transfer', category_id: null }),
    tx({ id: 'chi-trong', type: 'expense', category_id: null }),
  ]

  it('bộ lọc rỗng trả về CHÍNH mảng gốc — không tạo mảng mới mỗi lần render', () => {
    expect(applyLedgerFilter(list, EMPTY_LEDGER_FILTER)).toBe(list)
  })

  it('lọc theo loại', () => {
    expect(applyLedgerFilter(list, { type: 'expense', uncategorized: false }).map((t) => t.id)).toEqual([
      'chi',
      'chi-trong',
    ])
  })

  it('lọc chưa phân loại — chuyển khoản không lọt vào', () => {
    expect(applyLedgerFilter(list, { type: null, uncategorized: true }).map((t) => t.id)).toEqual([
      'chi-trong',
    ])
  })

  it('hai điều kiện cùng lúc là VÀ, không phải HOẶC', () => {
    expect(
      applyLedgerFilter(list, { type: 'income', uncategorized: true }).map((t) => t.id),
    ).toEqual([])
  })

  it('isFilterActive', () => {
    expect(isFilterActive(EMPTY_LEDGER_FILTER)).toBe(false)
    expect(isFilterActive({ type: 'income', uncategorized: false })).toBe(true)
    expect(isFilterActive({ type: null, uncategorized: true })).toBe(true)
  })
})

describe('uncategorizedSummary', () => {
  it('đếm và cộng khoản chưa gắn danh mục, đã quy đổi', () => {
    const r = uncategorizedSummary(
      [
        tx({ id: 'a', category_id: null, amount: 1000 }),
        tx({ id: 'b', category_id: null, amount: 200000, account_id: 'vnd' }),
        tx({ id: 'c', category_id: 'co' }),
      ],
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r.count).toBe(2)
    expect(r.amount).toBe(1000 + vndToJpy(200000))
    expect(r.hasMissingRate).toBe(false)
  })

  // Hoàn tiền là CHI mang dấu âm. Câu hỏi ở đây là "bao nhiêu tiền chưa biết xếp vào
  // đâu", nên trừ nó đi là dòng cảnh báo nói nhẹ hơn lượng việc thật.
  it('khoản hoàn tiền cộng theo trị tuyệt đối, không trừ vào tổng', () => {
    const r = uncategorizedSummary(
      [
        tx({ id: 'a', category_id: null, amount: 1000 }),
        tx({ id: 'b', category_id: null, amount: 400, is_refund: true }),
      ],
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r.count).toBe(2)
    expect(r.amount).toBe(1400)
  })

  it('thiếu tỷ giá thì nói ra, và vẫn đếm được số khoản', () => {
    const r = uncategorizedSummary(
      [tx({ id: 'a', category_id: null, amount: 500, account_id: 'usd' })],
      (id) => (id === 'usd' ? 'USD' : 'JPY'),
      'JPY',
      {},
    )
    expect(r.count).toBe(1)
    expect(r.amount).toBe(0)
    expect(r.hasMissingRate).toBe(true)
  })

  it('không có khoản nào thì tổng bằng 0 và không báo thiếu tỷ giá', () => {
    const r = uncategorizedSummary([tx({ category_id: 'co' })], currencyOf, 'JPY', RATES)
    expect(r).toEqual({ count: 0, amount: 0, hasMissingRate: false })
  })
})

describe('balanceByDay', () => {
  it('tra được theo ISO, kể cả ngày không có giao dịch', () => {
    const m = balanceByDay([
      { date: '2026-08-01', balance: 100 },
      { date: '2026-08-02', balance: 100 }, // ngày trống giữ nguyên số dư
      { date: '2026-08-03', balance: -50 },
    ])
    expect(m.get('2026-08-01')).toBe(100)
    expect(m.get('2026-08-02')).toBe(100)
    expect(m.get('2026-08-03')).toBe(-50)
    expect(m.get('2026-08-04')).toBeUndefined()
  })
})
