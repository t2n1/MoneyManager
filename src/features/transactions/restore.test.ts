import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import { CACH_CHEP, toDuplicateTransaction, toNewTransaction } from './restore'

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

  // Rơi cột này thì hoàn tác sau khi xóa một lần gửi trả về giao dịch CHƯA gán người
  // nhận — khấu trừ người phụ thuộc lại tính thiếu dù người dùng chưa đổi gì.
  it('giữ người nhận của lần gửi tiền', () => {
    const r = toNewTransaction(tx({ is_remittance: true, remit_recipient_id: 'me' }))
    expect(r.remit_recipient_id).toBe('me')
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

  // Lý do của bảng CACH_CHEP: cột mới thêm vào TransactionRow mà quên khai cách chép là
  // hoàn tác ra một giao dịch khác cái vừa xoá. tsc đỏ trước (bảng khai theo keyof), test
  // này đỏ sau nếu có ai nới kiểu của bảng.
  it('mọi cột của giao dịch đều có cách chép được khai', () => {
    const full: Required<TransactionRow> = {
      id: 't1', user_id: 'u', type: 'expense', amount: 1, to_amount: null, category_id: 'c1',
      account_id: 'a1', to_account_id: null, recurring_rule_id: null, occurred_on: '2026-08-12',
      note: '', is_remittance: false, remit_service: null, remit_fee_jpy: null,
      remit_received_vnd: null, remit_recipient_id: null, is_debt_flow: false,
      exclude_from_stats: false, adjust_is_spend: false, adjust_kind: null, is_refund: false,
      owner: 'mine', stock_trade_id: null, stock_symbol: null, created_at: '', updated_at: '',
    }
    expect(Object.keys(CACH_CHEP).sort()).toEqual(Object.keys(full).sort())
  })

  // Khoản bù dựng lại mà mất dấu thì người dùng sửa ghi chú là nó bị tính thành tiền quẹt.
  it('hoàn tác giữ ĐỦ mọi trường, kể cả dấu hệ thống', () => {
    const r = toNewTransaction(
      tx({
        adjust_kind: 'balance',
        adjust_is_spend: true,
        owner: 'partner',
        stock_trade_id: 'st1',
        stock_symbol: 'VNM',
        recurring_rule_id: 'rr1',
      }),
    )
    expect(r).toMatchObject({
      adjust_kind: 'balance',
      adjust_is_spend: true,
      owner: 'partner',
      stock_trade_id: 'st1',
      stock_symbol: 'VNM',
      recurring_rule_id: 'rr1',
    })
    for (const k of ['id', 'user_id', 'created_at', 'updated_at']) expect(k in r).toBe(false)
  })

  // DB chưa có cột thì dòng đọc về không có khoá đó — gửi khoá lên (dù undefined) là mời
  // lỗi thiếu cột. Dòng gốc không có thì bản dựng lại cũng không có.
  it('không đẻ ra khoá cho trường dòng gốc không có', () => {
    const r = toNewTransaction(tx())
    expect('adjust_kind' in r).toBe(false)
    expect('owner' in r).toBe(false)
  })
})

describe('toDuplicateTransaction', () => {
  it('bản sao bỏ dấu hệ thống: khoản bù, lệnh cổ phiếu, quy tắc định kỳ', () => {
    const r = toDuplicateTransaction(
      tx({ adjust_kind: 'statement_month', stock_trade_id: 'st1', recurring_rule_id: 'rr1' }),
    )
    expect('adjust_kind' in r).toBe(false)
    expect('stock_trade_id' in r).toBe(false)
    expect('recurring_rule_id' in r).toBe(false)
  })

  it('bản sao giữ những gì người dùng tự chọn', () => {
    const r = toDuplicateTransaction(
      tx({
        owner: 'partner',
        is_refund: true,
        exclude_from_stats: true,
        adjust_is_spend: true,
        stock_symbol: 'VNM',
        is_remittance: true,
        remit_recipient_id: 'me',
      }),
      ['tg1'],
    )
    expect(r).toMatchObject({
      owner: 'partner',
      is_refund: true,
      exclude_from_stats: true,
      adjust_is_spend: true,
      stock_symbol: 'VNM',
      is_remittance: true,
      remit_recipient_id: 'me',
      tag_ids: ['tg1'],
      amount: 1_000,
      note: 'Cơm trưa',
    })
  })
})
