import { describe, expect, it } from 'vitest'
import { HISTORY_TARGET_MONTHS, reliability, type ReliabilityInput } from './reliability'
import { ADJUST_CATEGORY_NAME } from '../categories/flowCategories'
import type { CategoryRow, TransactionRow } from '../../types/database.types'

const tx = (p: Partial<TransactionRow>): TransactionRow =>
  ({
    id: Math.random().toString(36),
    type: 'expense',
    amount: 100,
    account_id: 'a1',
    category_id: 'an',
    occurred_on: '2026-08-10',
    ...p,
  }) as TransactionRow

const CATS = [
  { id: 'an', name: 'Ăn uống' },
  { id: 'dc', name: ADJUST_CATEGORY_NAME },
] as CategoryRow[]

const input = (p: Partial<ReliabilityInput>): ReliabilityInput => ({
  todayISO: '2026-08-17',
  recentTxs: [],
  categories: CATS,
  accountIds: [],
  monthsWithData: HISTORY_TARGET_MONTHS,
  blankAssumptions: 0,
  ...p,
})

describe('reliability', () => {
  // Sổ trống KHÔNG phải sổ sai: phạt người mới cài app là chỉ số nói sai ngay từ đầu.
  it('sổ trống ra 100% chứ không phải 0%', () => {
    expect(reliability(input({})).pct).toBe(100)
  })

  it('một nửa chưa phân loại thì phần đó còn một nửa', () => {
    const r = reliability(
      input({ recentTxs: [tx({}), tx({ category_id: null })] }),
    )
    const p = r.parts.find((x) => x.key === 'categorized')!
    expect(p.score).toBe(0.5)
    expect(p.gap).toBe('1 giao dịch chưa gắn danh mục')
    // 0,5×0,4 + 1×0,3 + 1×0,2 + 1×0,1 = 0,8
    expect(r.pct).toBe(80)
  })

  it('chuyển khoản không kéo tỷ lệ phân loại xuống', () => {
    const r = reliability(input({ recentTxs: [tx({}), tx({ type: 'transfer', category_id: null })] }))
    expect(r.parts.find((x) => x.key === 'categorized')!.score).toBe(1)
  })

  it('tài khoản mới đối chiếu trong 30 ngày mới được tính', () => {
    const r = reliability(
      input({
        accountIds: ['a1', 'a2'],
        recentTxs: [
          tx({ account_id: 'a1', category_id: 'dc', occurred_on: '2026-08-01' }),
          // Quá 30 ngày → không tính
          tx({ account_id: 'a2', category_id: 'dc', occurred_on: '2026-06-01' }),
        ],
      }),
    )
    const p = r.parts.find((x) => x.key === 'reconciled')!
    expect(p.score).toBe(0.5)
    expect(p.gap).toBe('1 tài khoản chưa đối chiếu trong 30 ngày')
  })

  it('lịch sử kẹp ở 1 — ghi 20 tháng không cho điểm cao hơn 12 tháng', () => {
    const a = reliability(input({ monthsWithData: 12 }))
    const b = reliability(input({ monthsWithData: 20 }))
    expect(a.pct).toBe(b.pct)
    expect(b.parts.find((x) => x.key === 'history')!.score).toBe(1)
  })

  it('giả định trống kéo điểm xuống và nói ra số còn thiếu', () => {
    const r = reliability(input({ blankAssumptions: 3 }))
    const p = r.parts.find((x) => x.key === 'assumptions')!
    expect(p.score).toBe(0)
    expect(p.gap).toBe('3 giả định còn trống')
    expect(r.pct).toBe(90)
  })

  it('trọng số cộng lại đúng 1 — nếu không thì 100% không bao giờ đạt được', () => {
    const tong = reliability(input({})).parts.reduce((a, p) => a + p.weight, 0)
    expect(tong).toBeCloseTo(1, 10)
  })

  it('mọi thành phần rỗng hết thì ra 0%', () => {
    const r = reliability(
      input({
        recentTxs: [tx({ category_id: null })],
        accountIds: ['a1'],
        monthsWithData: 0,
        blankAssumptions: 3,
      }),
    )
    expect(r.pct).toBe(0)
  })
})
