import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import type { ImportItem } from './csvImport'
import { classifyDuplicates, mergeStatementFiles } from './dedupe'

let seq = 0
const etx = (
  p: Partial<TransactionRow> &
    Pick<TransactionRow, 'type' | 'amount' | 'occurred_on' | 'account_id'>,
): TransactionRow => ({
  id: `e${seq++}`,
  user_id: 'u',
  to_amount: null,
  category_id: 'c1',
  to_account_id: null,
  recurring_rule_id: null,
  note: '',
  created_at: '',
  updated_at: '',
  ...p,
})

const item = (occurred_on: string, amount: number, note = '', type: 'expense' | 'income' = 'expense'): ImportItem => ({
  occurred_on,
  amount,
  type,
  note,
  key: `${occurred_on}|${type === 'expense' ? '-' : '+'}${amount}|${note}`,
})

const opts = { accountId: 'card' }

describe('classifyDuplicates', () => {
  it('khớp cả ngày, tiền lẫn ghi chú → trùng chắc chắn', () => {
    const out = classifyDuplicates(
      [item('2026-02-10', 1_200, 'セブンイレブン')],
      [etx({ type: 'expense', amount: 1_200, occurred_on: '2026-02-10', account_id: 'card', note: 'セブンイレブン' })],
      opts,
    )
    expect(out[0]?.level).toBe('exact')
    expect(out[0]?.dayGap).toBe(0)
  })

  it('cùng tiền, lệch trong 3 ngày, ghi chú khác → NGHI trùng (luật cũ bỏ sót)', () => {
    const out = classifyDuplicates(
      [item('2026-02-12', 1_200, 'セブンイレブン')],
      [etx({ type: 'expense', amount: 1_200, occurred_on: '2026-02-10', account_id: 'card', note: 'Đi chợ' })],
      opts,
    )
    expect(out[0]?.level).toBe('likely')
    expect(out[0]?.dayGap).toBe(2)
    expect(out[0]?.matchedNote).toBe('Đi chợ')
  })

  it('cùng ngày cùng tiền nhưng ghi chú khác vẫn chỉ là NGHI, không phải chắc chắn', () => {
    const out = classifyDuplicates(
      [item('2026-02-10', 1_200, 'セブンイレブン')],
      [etx({ type: 'expense', amount: 1_200, occurred_on: '2026-02-10', account_id: 'card', note: 'Đi chợ' })],
      opts,
    )
    expect(out[0]?.level).toBe('likely')
    expect(out[0]?.dayGap).toBe(0)
  })

  it('quá cửa sổ ngày thì coi như khoản mới', () => {
    const out = classifyDuplicates(
      [item('2026-02-20', 1_200, 'x')],
      [etx({ type: 'expense', amount: 1_200, occurred_on: '2026-02-10', account_id: 'card' })],
      opts,
    )
    expect(out[0]).toBeNull()
  })

  it('bỏ qua giao dịch của tài khoản khác', () => {
    const out = classifyDuplicates(
      [item('2026-02-10', 1_200, 'x')],
      [etx({ type: 'expense', amount: 1_200, occurred_on: '2026-02-10', account_id: 'bank', note: 'x' })],
      opts,
    )
    expect(out[0]).toBeNull()
  })

  it('chi không khớp với thu cùng số tiền', () => {
    const out = classifyDuplicates(
      [item('2026-02-10', 1_200, 'x')],
      [etx({ type: 'income', amount: 1_200, occurred_on: '2026-02-10', account_id: 'card', note: 'x' })],
      opts,
    )
    expect(out[0]).toBeNull()
  })

  it('mỗi giao dịch đã có chỉ khớp MỘT dòng — mua hai lần giống nhau thì dòng sau vẫn là mới', () => {
    const out = classifyDuplicates(
      [item('2026-02-10', 480, 'カフェ'), item('2026-02-11', 480, 'カフェ')],
      [etx({ type: 'expense', amount: 480, occurred_on: '2026-02-10', account_id: 'card', note: 'カフェ' })],
      opts,
    )
    expect(out[0]?.level).toBe('exact')
    expect(out[1]).toBeNull()
  })

  it('lượt trùng-chắc-chắn chạy trước, không để dòng nghi-trùng chiếm mất giao dịch', () => {
    // Dòng nghi (10/2, ghi chú khác) đứng TRƯỚC dòng khớp y hệt (11/2). Nếu xét
    // tuần tự từng dòng thì dòng đầu chiếm mất giao dịch duy nhất, đẩy dòng khớp
    // chính xác thành "mới" — đúng khoản sẽ bị nhập lại lần hai.
    const out = classifyDuplicates(
      [item('2026-02-10', 900, 'ａ'), item('2026-02-11', 900, 'ｂ')],
      [etx({ type: 'expense', amount: 900, occurred_on: '2026-02-11', account_id: 'card', note: 'ｂ' })],
      opts,
    )
    expect(out[1]?.level).toBe('exact')
    expect(out[0]).toBeNull()
  })
})

describe('mergeStatementFiles', () => {
  it('phần chồng lấn giữa hai sao kê chỉ còn một lần', () => {
    const a = [item('2026-01-30', 500, 'x'), item('2026-01-31', 700, 'y')]
    const b = [item('2026-01-31', 700, 'y'), item('2026-02-01', 900, 'z')]
    const out = mergeStatementFiles([a, b])
    expect(out).toHaveLength(3)
    expect(out.map((i) => i.amount)).toEqual([500, 700, 900])
  })

  it('mua hai lần giống hệt nhau trong CÙNG một file thì giữ đủ hai', () => {
    const a = [item('2026-01-05', 480, 'カフェ'), item('2026-01-05', 480, 'カフェ')]
    const b = [item('2026-01-05', 480, 'カフェ')]
    const out = mergeStatementFiles([a, b])
    expect(out).toHaveLength(2)
  })

  it('xếp lại theo ngày', () => {
    const out = mergeStatementFiles([[item('2026-03-01', 1, 'a')], [item('2026-01-01', 2, 'b')]])
    expect(out.map((i) => i.occurred_on)).toEqual(['2026-01-01', '2026-03-01'])
  })
})
