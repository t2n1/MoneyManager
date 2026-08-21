import { describe, expect, it } from 'vitest'
import type { AccountRow, AccountType } from '../../types/database.types'
import { ACCOUNT_TYPE_LABELS } from '../assets/aggregate'
import { groupAccountsByType, groupOptionsByType } from './groupByType'

let seq = 0
/** Tạo AccountRow tối giản cho test — chỉ khai báo field cần, phần còn lại mặc định. */
function acc(p: Partial<AccountRow> & Pick<AccountRow, 'type'>): AccountRow {
  seq += 1
  return {
    id: `a${seq}`,
    user_id: 'u',
    name: `acc${seq}`,
    is_liquid: null,
    currency: 'JPY',
    initial_balance: 0,
    asset_group: null,
    is_hidden: false,
    include_in_totals: true,
    credit_limit: null,
    statement_day: null,
    payment_due_day: null,
    payment_account_id: null,
    card_autopay_through: null,
    depreciation_months: null,
    depreciation_from: null,
    salvage_value: 0,
    tax_shelter: null,
    shelter_annual_limit: null,
    last_reconciled_at: null,
    sort_order: seq,
    is_archived: false,
    created_at: '',
    ...p,
  }
}

/** balanceOf từ map id → số dư (thiếu = 0). */
const balancesFrom = (m: Record<string, number>) => (id: string) => m[id] ?? 0

describe('groupAccountsByType', () => {
  it('gom theo loại và giữ đúng thứ tự loại cố định', () => {
    const bank = acc({ id: 'b1', type: 'bank' })
    const cash = acc({ id: 'c1', type: 'cash' })
    const card = acc({ id: 'k1', type: 'card' })
    // Truyền lộn xộn thứ tự loại
    const groups = groupAccountsByType([bank, card, cash], balancesFrom({}))
    expect(groups.map((g) => g.type)).toEqual(['cash', 'bank', 'card'])
  })

  it('bỏ qua loại không có tài khoản', () => {
    const groups = groupAccountsByType([acc({ type: 'bank' })], balancesFrom({}))
    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('bank')
  })

  it('giữ nguyên thứ tự tài khoản trong cùng loại theo thứ tự truyền vào', () => {
    const a1 = acc({ id: 'x1', type: 'bank', name: 'Yucho' })
    const a2 = acc({ id: 'x2', type: 'bank', name: 'Rakuten' })
    const groups = groupAccountsByType([a1, a2], balancesFrom({}))
    expect(groups[0].accounts.map((a) => a.id)).toEqual(['x1', 'x2'])
  })

  it('cộng tổng theo loại tiền khi cùng một loại tiền', () => {
    const a1 = acc({ id: 'x1', type: 'bank', currency: 'JPY' })
    const a2 = acc({ id: 'x2', type: 'bank', currency: 'JPY' })
    const groups = groupAccountsByType([a1, a2], balancesFrom({ x1: 198031, x2: 347829 }))
    expect(groups[0].totalsByCurrency).toEqual([{ currency: 'JPY', total: 198031 + 347829 }])
  })

  it('tách tổng theo từng loại tiền khi một loại lẫn nhiều loại tiền', () => {
    const a1 = acc({ id: 'x1', type: 'bank', currency: 'JPY' })
    const a2 = acc({ id: 'x2', type: 'bank', currency: 'VND' })
    const groups = groupAccountsByType([a1, a2], balancesFrom({ x1: 1000, x2: 5000 }))
    expect(groups[0].totalsByCurrency).toEqual([
      { currency: 'JPY', total: 1000 },
      { currency: 'VND', total: 5000 },
    ])
  })

  it('số dư thẻ âm cộng ra tổng âm', () => {
    const card = acc({ id: 'k1', type: 'card', currency: 'JPY' })
    const groups = groupAccountsByType([card], balancesFrom({ k1: -500 }))
    expect(groups[0].totalsByCurrency).toEqual([{ currency: 'JPY', total: -500 }])
  })
})

describe('groupOptionsByType', () => {
  const opt = (id: string, type: AccountType) => ({ id, type })

  it('gom theo loại, giữ thứ tự TYPE_ORDER và thứ tự trong từng loại', () => {
    const r = groupOptionsByType([
      opt('card1', 'card'),
      opt('cash1', 'cash'),
      opt('bank1', 'bank'),
      opt('bank2', 'bank'),
    ])
    expect(r.map((g) => g.type)).toEqual(['cash', 'bank', 'card'])
    expect(r[1].items.map((x) => x.id)).toEqual(['bank1', 'bank2'])
  })

  it('có nhãn tiếng Việt cho từng khối', () => {
    expect(groupOptionsByType([opt('a', 'cash')])[0].label).toBe(ACCOUNT_TYPE_LABELS.cash)
  })

  // Bộ chọn đánh rơi một tài khoản = không nhập được giao dịch cho nó.
  it('loại không có trong TYPE_ORDER (fixed) vẫn ra, xếp cuối', () => {
    const r = groupOptionsByType([opt('f1', 'fixed'), opt('c1', 'cash')])
    expect(r.map((g) => g.type)).toEqual(['cash', 'fixed'])
    expect(r.flatMap((g) => g.items.map((x) => x.id))).toEqual(['c1', 'f1'])
  })

  it('danh sách rỗng → không khối nào', () => {
    expect(groupOptionsByType([])).toEqual([])
  })
})

// Form thêm tài khoản có mục "Tài sản cố định", nhưng TYPE_ORDER từng thiếu 'fixed'
// nên tạo xong nó không hiện ở trang Tài khoản nữa — tạo được mà không thấy đâu.
describe('groupAccountsByType — tài sản cố định', () => {
  it('khối "Tài sản cố định" có ra, xếp cuối, kèm tổng của nó', () => {
    const xe = acc({ type: 'fixed', name: 'Xe máy', currency: 'JPY' })
    const vi = acc({ type: 'cash', name: 'Tiền mặt', currency: 'JPY' })
    const r = groupAccountsByType([xe, vi], (id) => (id === xe.id ? 150_000 : 3_000))
    expect(r.map((g) => g.type)).toEqual(['cash', 'fixed'])
    const cuoi = r[1]
    expect(cuoi.label).toBe(ACCOUNT_TYPE_LABELS.fixed)
    expect(cuoi.accounts.map((a) => a.name)).toEqual(['Xe máy'])
    expect(cuoi.totalsByCurrency).toEqual([{ currency: 'JPY', total: 150_000 }])
  })
})
