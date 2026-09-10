import { describe, expect, it } from 'vitest'
import { billForRange } from './billForRange'
import type { CardBillRow } from '../../types/database.types'

const bill = (account_id: string, close_date: string, total: number): CardBillRow => ({
  id: `${account_id}-${close_date}`,
  user_id: 'u',
  account_id,
  close_date,
  due_date: '2026-07-27',
  total,
  created_at: '',
})
const range = (closeISO: string) => ({ start: '', end: '', closeISO, dueISO: '' })

describe('billForRange', () => {
  it('tra dung hoa don cua ky dang xem', () => {
    const bills = [bill('c1', '2026-05-31', 104380), bill('c1', '2026-06-30', 158429)]
    expect(billForRange(bills, 'c1', range('2026-06-30'))!.total).toBe(158429)
  })

  it('khong lay nham hoa don cua the khac', () => {
    const bills = [bill('c2', '2026-06-30', 999)]
    expect(billForRange(bills, 'c1', range('2026-06-30'))).toBeNull()
  })

  it('ky chua nap sao ke tra null', () => {
    expect(billForRange([bill('c1', '2026-05-31', 1)], 'c1', range('2026-06-30'))).toBeNull()
  })

  it('the chua khai ngay chot (range null) tra null', () => {
    expect(billForRange([bill('c1', '2026-06-30', 1)], 'c1', null)).toBeNull()
  })
})
