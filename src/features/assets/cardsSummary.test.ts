import { describe, expect, it } from 'vitest'
import type { CardFundingResult, CardLiability } from './aggregate'
import type { CardStatementSplit } from './cardStatement'
import { cardsSummary } from './cardsSummary'

function card(over: Partial<CardLiability> & { id: string }): CardLiability {
  return {
    name: `Thẻ ${over.id}`,
    currency: 'JPY',
    balance: 0,
    baseValue: 0,
    creditLimit: null,
    paymentDueDay: 27,
    statementDay: 31,
    paymentAccountId: null,
    includeInTotals: true,
    hidden: false,
    ...over,
  }
}

function split(over: Partial<CardStatementSplit>): CardStatementSplit {
  return { totalOwed: 0, dueISO: null, closeISO: null, billed: null, unbilled: null, ...over }
}

/** funding rỗng = không thẻ nào có nguồn trả hợp lệ → không badge thiếu tiền */
const NO_FUNDING: CardFundingResult = { byCard: new Map(), groups: [] }

function fundingOf(entries: [string, { enough: boolean; shortfall: number }][]): CardFundingResult {
  return {
    byCard: new Map(
      entries.map(([id, f]) => [
        id,
        {
          sourceId: 'src',
          sourceName: 'Nguồn',
          currency: 'JPY' as const,
          sourceBalance: 0,
          owed: 0,
          shared: false,
          enough: f.enough,
          shortfall: f.shortfall,
        },
      ]),
    ),
    groups: [],
  }
}

describe('cardsSummary', () => {
  it('một thẻ cùng base currency: lấy đúng billed, không cần dấu ≈', () => {
    const cards = [card({ id: 'a', currency: 'JPY' })]
    const statements = new Map([
      ['a', split({ totalOwed: 120_000, billed: 82_000, dueISO: '2026-08-27' })],
    ])

    const s = cardsSummary(cards, statements, NO_FUNDING, 'JPY', {})

    expect(s.billedBase).toBe(82_000)
    expect(s.approx).toBe(false)
    expect(s.nextDueISO).toBe('2026-08-27')
  })

  it('hai thẻ khác loại tiền: cộng sau khi quy đổi và bật dấu ≈', () => {
    // ¥1 = 170₫ → 340.000₫ = ¥2.000
    const cards = [card({ id: 'a', currency: 'JPY' }), card({ id: 'b', currency: 'VND' })]
    const statements = new Map([
      ['a', split({ totalOwed: 10_000, billed: 10_000, dueISO: '2026-08-27' })],
      ['b', split({ totalOwed: 340_000, billed: 340_000, dueISO: '2026-09-05' })],
    ])

    const s = cardsSummary(cards, statements, NO_FUNDING, 'JPY', { VND: 170 })

    expect(s.billedBase).toBe(12_000)
    expect(s.approx).toBe(true)
  })

  it('thiếu tỷ giá: bật ≈ và không cộng thẻ đó vào tổng', () => {
    const cards = [card({ id: 'a', currency: 'JPY' }), card({ id: 'b', currency: 'VND' })]
    const statements = new Map([
      ['a', split({ totalOwed: 10_000, billed: 10_000, dueISO: '2026-08-27' })],
      ['b', split({ totalOwed: 340_000, billed: 340_000, dueISO: '2026-09-05' })],
    ])

    const s = cardsSummary(cards, statements, NO_FUNDING, 'JPY', {})

    expect(s.billedBase).toBe(10_000)
    expect(s.approx).toBe(true)
  })

  it('thẻ chưa đặt ngày chốt (billed null): rơi về toàn bộ dư nợ', () => {
    const cards = [card({ id: 'a', statementDay: null })]
    const statements = new Map([
      ['a', split({ totalOwed: 55_000, billed: null, dueISO: '2026-08-27' })],
    ])

    const s = cardsSummary(cards, statements, NO_FUNDING, 'JPY', {})

    expect(s.billedBase).toBe(55_000)
  })

  it('không thẻ nào đang nợ: billedBase và nextDueISO đều null', () => {
    const cards = [card({ id: 'a' }), card({ id: 'b' })]
    const statements = new Map([
      ['a', split({ totalOwed: 0, billed: 0, dueISO: '2026-08-27' })],
      ['b', split({ totalOwed: 0, billed: 0, dueISO: '2026-09-05' })],
    ])

    const s = cardsSummary(cards, statements, NO_FUNDING, 'JPY', {})

    expect(s.billedBase).toBeNull()
    expect(s.nextDueISO).toBeNull()
  })

  it('nextDueISO là ngày sớm nhất, bỏ qua thẻ không nợ', () => {
    const cards = [card({ id: 'a' }), card({ id: 'b' }), card({ id: 'c' })]
    const statements = new Map([
      // thẻ hết nợ tuy có ngày sớm nhất → không được tính
      ['a', split({ totalOwed: 0, billed: 0, dueISO: '2026-08-10' })],
      ['b', split({ totalOwed: 1_000, billed: 1_000, dueISO: '2026-09-05' })],
      ['c', split({ totalOwed: 2_000, billed: 2_000, dueISO: '2026-08-27' })],
    ])

    const s = cardsSummary(cards, statements, NO_FUNDING, 'JPY', {})

    expect(s.nextDueISO).toBe('2026-08-27')
    expect(s.billedBase).toBe(3_000)
  })

  it('đúng một thẻ thiếu tiền: trả số thiếu kèm loại tiền của thẻ đó', () => {
    const cards = [card({ id: 'a' }), card({ id: 'b' })]
    const statements = new Map([
      ['a', split({ totalOwed: 20_000, billed: 20_000, dueISO: '2026-08-27' })],
      ['b', split({ totalOwed: 5_000, billed: 5_000, dueISO: '2026-08-27' })],
    ])
    const funding = fundingOf([
      ['a', { enough: false, shortfall: 12_000 }],
      ['b', { enough: true, shortfall: 0 }],
    ])

    const s = cardsSummary(cards, statements, funding, 'JPY', {})

    expect(s.shortCount).toBe(1)
    expect(s.singleShortfall).toEqual({ amount: 12_000, currency: 'JPY' })
  })

  it('từ hai thẻ thiếu tiền trở lên: singleShortfall null vì có thể khác loại tiền', () => {
    const cards = [card({ id: 'a' }), card({ id: 'b', currency: 'VND' })]
    const statements = new Map([
      ['a', split({ totalOwed: 20_000, billed: 20_000, dueISO: '2026-08-27' })],
      ['b', split({ totalOwed: 340_000, billed: 340_000, dueISO: '2026-08-27' })],
    ])
    const funding = fundingOf([
      ['a', { enough: false, shortfall: 12_000 }],
      ['b', { enough: false, shortfall: 170_000 }],
    ])

    const s = cardsSummary(cards, statements, funding, 'JPY', { VND: 170 })

    expect(s.shortCount).toBe(2)
    expect(s.singleShortfall).toBeNull()
  })

  it('thẻ hết nợ thì không tính là thiếu tiền dù funding báo không đủ', () => {
    const cards = [card({ id: 'a' })]
    const statements = new Map([['a', split({ totalOwed: 0, billed: 0, dueISO: '2026-08-27' })]])
    const funding = fundingOf([['a', { enough: false, shortfall: 999 }]])

    const s = cardsSummary(cards, statements, funding, 'JPY', {})

    expect(s.shortCount).toBe(0)
    expect(s.singleShortfall).toBeNull()
  })
})
