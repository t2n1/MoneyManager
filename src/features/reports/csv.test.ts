import { describe, expect, it } from 'vitest'
import { buildTransactionsCsv, minorToPlain, type CsvLookups } from './csv'
import type { TransactionRow } from '../../types/database.types'

const lk: CsvLookups = {
  categoryName: (id) => (id === 'c1' ? 'Ăn uống' : ''),
  accountName: (id) => (id === 'a1' ? 'Tiền mặt' : id === 'a2' ? 'Ngân hàng' : ''),
  currencyOf: (id) => (id === 'a3' ? 'USD' : 'JPY'),
}

const tx = (p: Partial<TransactionRow>): TransactionRow => ({
  id: 'x',
  user_id: 'u',
  type: 'expense',
  amount: 0,
  to_amount: null,
  category_id: null,
  account_id: 'a1',
  to_account_id: null,
  recurring_rule_id: null,
  occurred_on: '2026-07-01',
  note: '',
  created_at: '',
  updated_at: '',
  ...p,
})

describe('minorToPlain', () => {
  it('JPY (0 số lẻ) giữ nguyên số nguyên', () => {
    expect(minorToPlain(1234, 'JPY')).toBe('1234')
  })
  it('USD (2 số lẻ) thành thập phân dấu chấm', () => {
    expect(minorToPlain(1234, 'USD')).toBe('12.34')
    expect(minorToPlain(5, 'USD')).toBe('0.05')
    expect(minorToPlain(-1200, 'USD')).toBe('-12.00')
  })
})

describe('buildTransactionsCsv', () => {
  it('có BOM + header + đúng số dòng', () => {
    const csv = buildTransactionsCsv(
      [tx({ amount: 850, category_id: 'c1', note: 'Cơm trưa' })],
      lk,
    )
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.slice(1).split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('Ngày')
    expect(lines[1]).toContain('Chi')
    expect(lines[1]).toContain('Ăn uống')
    expect(lines[1]).toContain('850')
    expect(lines[1]).toContain('JPY')
  })

  it('bọc dấu nháy khi ghi chú có dấu phẩy', () => {
    const csv = buildTransactionsCsv([tx({ note: 'cà phê, bánh' })], lk)
    expect(csv).toContain('"cà phê, bánh"')
  })

  it('chuyển khoản xuyên tệ ghi cả số tiền đích + loại tiền đích', () => {
    const csv = buildTransactionsCsv(
      [tx({ type: 'transfer', amount: 50_000, to_amount: 200_000, account_id: 'a2', to_account_id: 'a3' })],
      lk,
    )
    const row = csv.slice(1).split('\r\n')[1]
    expect(row).toContain('Chuyển khoản')
    expect(row).toContain('2000.00') // 200000 cent USD
    expect(row).toContain('USD')
  })
})
