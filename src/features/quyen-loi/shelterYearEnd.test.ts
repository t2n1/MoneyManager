import { describe, expect, it } from 'vitest'
import type { AccountRow, TransactionRow } from '../../types/database.types'
import { tinhShelterYearEnd } from './shelterYearEnd'

const acc = (p: Partial<AccountRow>): AccountRow =>
  ({ id: 'n', name: 'NISA', type: 'investment', currency: 'JPY', tax_shelter: 'nisa_tsumitate', shelter_annual_limit: 1_200_000, is_archived: false, ...p }) as AccountRow
const nap = (amount: number, on: string): TransactionRow =>
  ({ id: on, user_id: 'u', type: 'transfer', amount, to_amount: null, category_id: null, account_id: 'bank', to_account_id: 'n', recurring_rule_id: null, occurred_on: on, note: '', created_at: '', updated_at: '' }) as TransactionRow

describe('tinhShelterYearEnd', () => {
  it('trước 1/10 im (du), vẫn trả từng tài khoản', () => {
    const r = tinhShelterYearEnd({ year: 2026, todayISO: '2026-09-03', accounts: [acc({})], txs: [nap(100_000, '2026-02-01')] })
    expect(r.tai_khoan[0]).toMatchObject({ used: 100_000, remaining: 1_100_000 })
    expect(r.ketLuan.trang_thai).toBe('du')
  })
  it('từ 1/10 còn hạn mức → thieu, câu có tổng còn lại', () => {
    const r = tinhShelterYearEnd({ year: 2026, todayISO: '2026-10-01', accounts: [acc({}), acc({ id: 'g', name: 'Growth', tax_shelter: 'nisa_growth', shelter_annual_limit: 2_400_000 })], txs: [nap(100_000, '2026-02-01')] })
    expect(r.ketLuan.trang_thai).toBe('thieu')
    expect(r.con_lai).toBe(1_100_000 + 2_400_000)
    expect(r.ketLuan.viec).toContain('3.500.000')
  })
  it('không tài khoản NISA/iDeCo → thieu-du-lieu', () => {
    const r = tinhShelterYearEnd({ year: 2026, todayISO: '2026-10-01', accounts: [acc({ tax_shelter: null })], txs: [] })
    expect(r.ketLuan.trang_thai).toBe('thieu-du-lieu')
  })
  it('chưa đặt hạn mức → remaining null, không cộng vào con_lai, có lý do', () => {
    const r = tinhShelterYearEnd({ year: 2026, todayISO: '2026-10-01', accounts: [acc({ shelter_annual_limit: null })], txs: [] })
    expect(r.tai_khoan[0].remaining).toBeNull()
    expect(r.ketLuan.ly_do.join(' ')).toMatch(/hạn mức/)
  })
})
