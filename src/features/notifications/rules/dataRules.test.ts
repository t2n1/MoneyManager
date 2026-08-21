import { describe, expect, it } from 'vitest'
import { reconcileStaleRule, uncategorizedRule, UNCATEGORIZED_MIN } from './dataRules'
import { ADJUST_CATEGORY_NAME } from '../../categories/flowCategories'
import type { NotificationInput } from '../types'
import type {
  AccountBalanceRow,
  CategoryRow,
  TransactionRow,
} from '../../../types/database.types'

const tx = (p: Partial<TransactionRow>): TransactionRow =>
  ({
    id: Math.random().toString(36),
    type: 'expense',
    amount: 1000,
    account_id: 'a1',
    category_id: null,
    occurred_on: '2026-08-10',
    ...p,
  }) as TransactionRow

const acc = (p: Partial<AccountBalanceRow>): AccountBalanceRow =>
  ({
    id: 'a1',
    name: 'Ví',
    type: 'cash',
    currency: 'JPY',
    is_archived: false,
    is_hidden: false,
    include_in_totals: true,
    ...p,
  }) as AccountBalanceRow

const input = (p: Partial<NotificationInput>): NotificationInput =>
  ({
    todayISO: '2026-08-17',
    monthStartDay: 1,
    base: 'JPY',
    rates: {},
    formatMoney: (m: number) => String(m),
    currencyOf: () => 'JPY',
    accounts: [],
    categories: [],
    debts: [],
    recurringRules: [],
    savingsGoals: [],
    networthSnapshots: [],
    recentTxs: [],
    offTypes: [],
    ...p,
  }) as NotificationInput

describe('uncategorizedRule', () => {
  it('im khi dưới ngưỡng chống nhiễu', () => {
    const txs = Array.from({ length: UNCATEGORIZED_MIN - 1 }, () => tx({}))
    expect(uncategorizedRule(input({ recentTxs: txs }))).toEqual([])
  })

  it('một dòng GỘP cho tất cả, kèm số lượng trong tiêu đề', () => {
    const txs = Array.from({ length: 7 }, () => tx({}))
    const out = uncategorizedRule(input({ recentTxs: txs }))
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('7 giao dịch chưa gắn danh mục')
    expect(out[0].to).toBe('/so')
  })

  // Chuyển khoản KHÔNG BAO GIỜ có danh mục — đếm nó vào là dựng ra một danh sách việc
  // không thể làm xong, và số ở đây sẽ lệch với dòng cảnh báo ở Sổ.
  it('chuyển khoản không tính', () => {
    const txs = [
      tx({ type: 'transfer' }),
      tx({ type: 'transfer' }),
      tx({ type: 'transfer' }),
      tx({ type: 'transfer' }),
    ]
    expect(uncategorizedRule(input({ recentTxs: txs }))).toEqual([])
  })

  it('khoản đã loại khỏi thống kê cũng không tính', () => {
    const txs = Array.from({ length: 5 }, () => tx({ exclude_from_stats: true }))
    expect(uncategorizedRule(input({ recentTxs: txs }))).toEqual([])
  })

  // Mã phải ỔN ĐỊNH: thêm một khoản nữa mà mã đổi thì việc này "mới" trở lại và trạng
  // thái đã đọc/đã ẩn mất tác dụng — đúng lỗi R5 cảnh báo.
  it('mã không đổi theo số lượng', () => {
    const a = uncategorizedRule(input({ recentTxs: Array.from({ length: 3 }, () => tx({})) }))
    const b = uncategorizedRule(input({ recentTxs: Array.from({ length: 9 }, () => tx({})) }))
    expect(a[0].key).toBe(b[0].key)
  })
})

describe('reconcileStaleRule', () => {
  const adjustCat = { id: 'dc', name: ADJUST_CATEGORY_NAME } as CategoryRow

  it('im khi mọi tài khoản vừa đối chiếu trong 30 ngày', () => {
    const out = reconcileStaleRule(
      input({
        accounts: [acc({ id: 'a1' })],
        categories: [adjustCat],
        recentTxs: [tx({ account_id: 'a1', category_id: 'dc', occurred_on: '2026-08-01' })],
      }),
    )
    expect(out).toEqual([])
  })

  it('báo khi lần đối chiếu gần nhất đã quá 30 ngày', () => {
    const out = reconcileStaleRule(
      input({
        accounts: [acc({ id: 'a1', name: 'Ngân hàng' })],
        categories: [adjustCat],
        recentTxs: [tx({ account_id: 'a1', category_id: 'dc', occurred_on: '2026-06-01' })],
      }),
    )
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Ngân hàng chưa đối chiếu quá 30 ngày')
  })

  // Ca đẻ ra migration 0050: mở sheet, thấy số dư ĐÃ KHỚP → không có giao dịch bù nào,
  // nên phép suy cũ vẫn kêu "chưa đối chiếu" ngay sau khi người dùng vừa kiểm xong.
  it('im khi cột last_reconciled_at còn mới, dù không có giao dịch bù nào', () => {
    const out = reconcileStaleRule(
      input({
        accounts: [acc({ id: 'a1', last_reconciled_at: '2026-08-16T02:00:00Z' })],
        categories: [adjustCat],
      }),
    )
    expect(out).toEqual([])
  })

  it('cột quá 30 ngày vẫn báo', () => {
    const out = reconcileStaleRule(
      input({
        accounts: [acc({ id: 'a1', name: 'Ví', last_reconciled_at: '2026-06-01T02:00:00Z' })],
        categories: [adjustCat],
      }),
    )
    expect(out).toHaveLength(1)
  })

  // Cột nullable và không backfill — dữ liệu trước 0050 phải vẫn đọc ra đúng.
  it('cột null thì rơi về phép suy từ giao dịch bù', () => {
    const out = reconcileStaleRule(
      input({
        accounts: [acc({ id: 'a1', last_reconciled_at: null })],
        categories: [adjustCat],
        recentTxs: [tx({ account_id: 'a1', category_id: 'dc', occurred_on: '2026-08-01' })],
      }),
    )
    expect(out).toEqual([])
  })

  it('chưa đối chiếu bao giờ cũng tính là quá hạn', () => {
    const out = reconcileStaleRule(
      input({ accounts: [acc({ id: 'a1' })], categories: [adjustCat] }),
    )
    expect(out).toHaveLength(1)
  })

  // §4.9: "gộp mọi tài khoản vào một việc" — năm dòng nhắc đối chiếu là năm dòng bị bỏ qua.
  it('gộp nhiều tài khoản vào MỘT việc', () => {
    const out = reconcileStaleRule(
      input({
        accounts: [acc({ id: 'a1' }), acc({ id: 'a2', name: 'Thẻ' }), acc({ id: 'a3', name: 'Ví 2' })],
        categories: [adjustCat],
      }),
    )
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('3 tài khoản chưa đối chiếu quá 30 ngày')
  })

  // Tài khoản ẩn / không tính vào tổng thì lệch số dư cũng không ảnh hưởng con số nào
  // trên màn — nhắc đối chiếu chúng là tạo việc không có tác dụng.
  it('bỏ qua tài khoản ẩn, đã lưu trữ, hoặc không tính vào tổng', () => {
    const out = reconcileStaleRule(
      input({
        accounts: [
          acc({ id: 'a1', is_hidden: true }),
          acc({ id: 'a2', is_archived: true }),
          acc({ id: 'a3', include_in_totals: false }),
        ],
        categories: [adjustCat],
      }),
    )
    expect(out).toEqual([])
  })

  it('giao dịch thường của tài khoản KHÔNG tính là một lần đối chiếu', () => {
    const out = reconcileStaleRule(
      input({
        accounts: [acc({ id: 'a1' })],
        categories: [adjustCat, { id: 'an', name: 'Ăn uống' } as CategoryRow],
        recentTxs: [tx({ account_id: 'a1', category_id: 'an', occurred_on: '2026-08-16' })],
      }),
    )
    expect(out).toHaveLength(1)
  })
})
