import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import { toNewTransaction } from './restore'

function tx(p: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 't1',
    user_id: 'u',
    type: 'expense',
    amount: 1_000,
    to_amount: null,
    category_id: 'c1',
    account_id: 'a1',
    to_account_id: null,
    occurred_on: '2026-08-12',
    note: 'Cơm trưa',
    recurring_rule_id: null,
    created_at: '',
    updated_at: '',
    ...p,
  } as TransactionRow
}

describe('toNewTransaction', () => {
  it('giữ nguyên các trường cơ bản', () => {
    const r = toNewTransaction(tx())
    expect(r).toMatchObject({
      type: 'expense',
      amount: 1_000,
      category_id: 'c1',
      account_id: 'a1',
      occurred_on: '2026-08-12',
      note: 'Cơm trưa',
    })
  })

  // Đây là lý do hàm này tồn tại: hoàn tác phải ra ĐÚNG giao dịch vừa xóa. Rơi
  // is_refund thì khoản hoàn tiền quay lại thành khoản chi thường, rơi
  // exclude_from_stats thì bút toán điều chỉnh số dư nhảy vào Thu/Chi.
  it('giữ cả ba cờ đổi cách tính tiền', () => {
    const r = toNewTransaction(
      tx({ is_refund: true, exclude_from_stats: true, is_debt_flow: true }),
    )
    expect(r.is_refund).toBe(true)
    expect(r.exclude_from_stats).toBe(true)
    expect(r.is_debt_flow).toBe(true)
  })

  it('giữ thông tin gửi tiền về VN', () => {
    const r = toNewTransaction(
      tx({
        is_remittance: true,
        remit_service: 'Wise',
        remit_fee_jpy: 2_000,
        remit_received_vnd: 16_000_000,
      }),
    )
    expect(r).toMatchObject({
      is_remittance: true,
      remit_service: 'Wise',
      remit_fee_jpy: 2_000,
      remit_received_vnd: 16_000_000,
    })
  })

  it('giữ chuyển khoản xuyên tệ (tài khoản đích + số tiền đích)', () => {
    const r = toNewTransaction(
      tx({ type: 'transfer', to_account_id: 'a2', to_amount: 8_250_000 }),
    )
    expect(r).toMatchObject({ type: 'transfer', to_account_id: 'a2', to_amount: 8_250_000 })
  })

  it('gắn lại nhãn khi được truyền vào, không có thì bỏ trống', () => {
    expect(toNewTransaction(tx(), ['tg1', 'tg2']).tag_ids).toEqual(['tg1', 'tg2'])
    expect('tag_ids' in toNewTransaction(tx())).toBe(false)
  })
})
