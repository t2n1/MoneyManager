import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import { filterTransactions, matchesFilter, normalizeText } from './filter'

let seq = 0
function tx(p: Partial<TransactionRow> & Pick<TransactionRow, 'type'>): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    amount: 1000,
    to_amount: null,
    category_id: null,
    account_id: 'a1',
    to_account_id: null,
    recurring_rule_id: null,
    occurred_on: '2026-07-10',
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  }
}

const RANGE = { start: '2026-01-01', end: '2027-01-01' }

describe('normalizeText', () => {
  it('bỏ dấu, đ→d, viết thường', () => {
    expect(normalizeText('Ăn Uống')).toBe('an uong')
    expect(normalizeText('Đầu tư')).toBe('dau tu')
  })

  it('chữ Latin kiểu rộng của sao kê Nhật khớp với chữ gõ thường', () => {
    // Sao kê PayPay ghi "ＴＥＭＵ", "Ｎｅｔｆｌｉｘ" kiểu rộng
    expect(normalizeText('ＴＥＭＵ')).toBe('temu')
    expect(normalizeText('Ｎｅｔｆｌｉｘ')).toBe('netflix')
    expect(normalizeText('ＡＭＡＺＯＮ．ＣＯ．ＪＰ')).toBe('amazon.co.jp')
  })

  it('katakana nửa rộng của Rakuten khớp với katakana thường', () => {
    // Rakuten ghi "ﾎﾃﾙ" nửa rộng, người dùng gõ "ホテル" kiểu thường
    expect(normalizeText('ﾎﾃﾙ')).toBe(normalizeText('ホテル'))
    expect(normalizeText('ﾄｳｷﾖｳﾃﾞﾝﾘﾖｸ')).toBe(normalizeText('トウキヨウデンリヨク'))
    expect(normalizeText('ｾﾌﾞﾝｲﾚﾌﾞﾝ')).toBe(normalizeText('セブンイレブン'))
  })

  it('dấu gạch ngang kiểu rộng thành gạch ngang thường', () => {
    // "セブン－イレブン" (Rakuten) vs "セブン-イレブン" (gõ tay)
    expect(normalizeText('セブン－イレブン')).toBe(normalizeText('セブン-イレブン'))
  })
})

describe('matchesFilter', () => {
  it('tìm text không phân biệt dấu', () => {
    const t = tx({ type: 'expense', note: 'Cơm trưa văn phòng' })
    expect(matchesFilter(t, { ...RANGE, text: 'com trua' })).toBe(true)
    expect(matchesFilter(t, { ...RANGE, text: 'tối' })).toBe(false)
  })

  it('lọc theo loại, danh mục, tài khoản (kể cả to_account_id)', () => {
    const t = tx({ type: 'transfer', account_id: 'a1', to_account_id: 'a2' })
    expect(matchesFilter(t, { ...RANGE, types: ['expense'] })).toBe(false)
    expect(matchesFilter(t, { ...RANGE, types: ['transfer'] })).toBe(true)
    expect(matchesFilter(t, { ...RANGE, accountIds: ['a2'] })).toBe(true)
    expect(matchesFilter(t, { ...RANGE, accountIds: ['a3'] })).toBe(false)
    const e = tx({ type: 'expense', category_id: 'food' })
    expect(matchesFilter(e, { ...RANGE, categoryIds: ['food'] })).toBe(true)
    expect(matchesFilter(e, { ...RANGE, categoryIds: ['shop'] })).toBe(false)
  })

  it('bộ lọc rỗng khớp tất cả', () => {
    expect(matchesFilter(tx({ type: 'income' }), RANGE)).toBe(true)
  })

  it('lọc theo khoảng số tiền (AL)', () => {
    const t = tx({ type: 'expense', amount: 10_000 })
    expect(matchesFilter(t, { ...RANGE, amountMin: 5_000 })).toBe(true)
    expect(matchesFilter(t, { ...RANGE, amountMin: 15_000 })).toBe(false)
    expect(matchesFilter(t, { ...RANGE, amountMax: 15_000 })).toBe(true)
    expect(matchesFilter(t, { ...RANGE, amountMax: 8_000 })).toBe(false)
    expect(matchesFilter(t, { ...RANGE, amountMin: 5_000, amountMax: 15_000 })).toBe(true)
  })
})

describe('lọc chưa gắn danh mục', () => {
  it('uncategorized=true chỉ giữ giao dịch không có danh mục', () => {
    const txs = [
      tx({ type: 'expense', note: 'chua gan', category_id: null }),
      tx({ type: 'expense', note: 'da gan', category_id: 'c1' }),
    ]
    const r = filterTransactions(txs, { ...RANGE, uncategorized: true })
    expect(r.map((t) => t.note)).toEqual(['chua gan'])
  })

  it('không đặt uncategorized thì giữ nguyên mọi giao dịch', () => {
    const txs = [
      tx({ type: 'expense', category_id: null }),
      tx({ type: 'expense', category_id: 'c1' }),
    ]
    expect(filterTransactions(txs, RANGE)).toHaveLength(2)
  })

  it('loại chuyển khoản — nó vốn không có danh mục, để lại thì thành việc không thể làm', () => {
    const txs = [
      tx({ type: 'expense', note: 'chi chua gan', category_id: null }),
      tx({ type: 'transfer', note: 'chuyen khoan', category_id: null }),
    ]
    const r = filterTransactions(txs, { ...RANGE, uncategorized: true })
    expect(r.map((t) => t.note)).toEqual(['chi chua gan'])
  })

  it('uncategorized=false cũng không lọc gì — chỉ true mới bật', () => {
    const txs = [
      tx({ type: 'expense', category_id: null }),
      tx({ type: 'expense', category_id: 'c1' }),
    ]
    expect(filterTransactions(txs, { ...RANGE, uncategorized: false })).toHaveLength(2)
  })
})

describe('filterTransactions', () => {
  it('loại ngoài khoảng ngày, sắp xếp giảm dần', () => {
    const txs = [
      tx({ type: 'expense', occurred_on: '2026-07-01', note: 'a' }),
      tx({ type: 'expense', occurred_on: '2026-07-20', note: 'b' }),
      tx({ type: 'expense', occurred_on: '2025-12-31', note: 'ngoài' }),
    ]
    const r = filterTransactions(txs, { start: '2026-07-01', end: '2026-08-01' })
    expect(r.map((t) => t.note)).toEqual(['b', 'a'])
  })
})
