import { describe, expect, it } from 'vitest'
import { lastReconciledMap } from './reconciledAt'
import { ADJUST_CATEGORY_NAME } from '../categories/flowCategories'
import type { CategoryRow, TransactionRow } from '../../types/database.types'

const CATS = [
  { id: 'an', name: 'Ăn uống' },
  { id: 'dc', name: ADJUST_CATEGORY_NAME },
] as CategoryRow[]

const tx = (p: Partial<TransactionRow>): TransactionRow =>
  ({
    id: Math.random().toString(36),
    type: 'expense',
    amount: 100,
    account_id: 'a1',
    category_id: 'dc',
    occurred_on: '2026-08-10',
    ...p,
  }) as TransactionRow

describe('lastReconciledMap', () => {
  it('chưa có nguồn nào thì không có mục nào', () => {
    expect(lastReconciledMap([{ id: 'a1' }], [], CATS).size).toBe(0)
  })

  // Đây là ca đẻ ra cả migration 0050: đối chiếu thấy KHỚP nên không có giao dịch bù,
  // phép suy cũ mù hoàn toàn.
  it('đọc được cột last_reconciled_at khi không có giao dịch bù nào', () => {
    const m = lastReconciledMap([{ id: 'a1', last_reconciled_at: '2026-08-20T09:12:00Z' }], [], CATS)
    expect(m.get('a1')).toBe('2026-08-20')
  })

  // Cột nullable và KHÔNG backfill, nên người dùng cũ phải vẫn đọc được từ giao dịch bù.
  it('vẫn suy được từ giao dịch bù khi cột còn null', () => {
    const m = lastReconciledMap([{ id: 'a1', last_reconciled_at: null }], [tx({})], CATS)
    expect(m.get('a1')).toBe('2026-08-10')
  })

  it('giao dịch khác danh mục không tính là đối chiếu', () => {
    const m = lastReconciledMap([{ id: 'a1' }], [tx({ category_id: 'an' })], CATS)
    expect(m.size).toBe(0)
  })

  it('hai nguồn thì lấy cái muộn hơn — cột mới hơn', () => {
    const m = lastReconciledMap(
      [{ id: 'a1', last_reconciled_at: '2026-08-20T09:12:00Z' }],
      [tx({ occurred_on: '2026-07-01' })],
      CATS,
    )
    expect(m.get('a1')).toBe('2026-08-20')
  })

  // Bù tay thẳng trong Sổ cũng là một lần so sổ — không được để mốc cột cũ đè lên nó.
  it('hai nguồn thì lấy cái muộn hơn — giao dịch mới hơn', () => {
    const m = lastReconciledMap(
      [{ id: 'a1', last_reconciled_at: '2026-07-01T09:12:00Z' }],
      [tx({ occurred_on: '2026-08-10' })],
      CATS,
    )
    expect(m.get('a1')).toBe('2026-08-10')
  })

  it('nhiều giao dịch bù thì lấy ngày muộn nhất', () => {
    const m = lastReconciledMap(
      [{ id: 'a1' }],
      [tx({ occurred_on: '2026-06-01' }), tx({ occurred_on: '2026-08-10' }), tx({ occurred_on: '2026-07-01' })],
      CATS,
    )
    expect(m.get('a1')).toBe('2026-08-10')
  })

  it('mỗi tài khoản một mốc riêng', () => {
    const m = lastReconciledMap(
      [{ id: 'a1', last_reconciled_at: '2026-08-20T09:12:00Z' }, { id: 'a2' }],
      [tx({ account_id: 'a2', occurred_on: '2026-06-01' })],
      CATS,
    )
    expect(m.get('a1')).toBe('2026-08-20')
    expect(m.get('a2')).toBe('2026-06-01')
  })
})
