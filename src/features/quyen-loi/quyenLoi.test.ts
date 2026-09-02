import { describe, expect, it } from 'vitest'
import type { AccountRow, CategoryRow, RelativeRow, TransactionRow } from '../../types/database.types'
import { remittanceStats } from '../remittance/aggregate'
import { tinhQuyenLoi, type QuyenLoiInput } from './quyenLoi'

let seq = 0
const tx = (p: Partial<TransactionRow>): TransactionRow => ({
  id: `t${seq++}`, user_id: 'u', type: 'expense', amount: 30_500, to_amount: null, category_id: null, account_id: 'jpy',
  to_account_id: null, recurring_rule_id: null, occurred_on: '2026-03-01', note: '', created_at: '', updated_at: '',
  is_remittance: true, remit_fee_jpy: 500, ...p,
})
const me: RelativeRow = { id: 'me', user_id: 'u', name: 'Mẹ', birth_year: 1956, relationship: 'parent', country: 'VN', is_archived: false, sort_order: 0, created_at: '' }
const accounts = [{ id: 'jpy', name: 'Bank', currency: 'JPY', tax_shelter: null, shelter_annual_limit: null, is_archived: false }] as AccountRow[]
const categories: CategoryRow[] = []
function input(p: Partial<QuyenLoiInput>): QuyenLoiInput {
  return { year: 2026, todayISO: '2026-09-03', relatives: [me], txs: [], categories, accounts, base: 'JPY', rates: {}, fuyoClaimedYears: [], ...p }
}

describe('tinhQuyenLoi', () => {
  it('trả 5 kết luận theo thứ tự fuyo, remit-unassigned, refund, furusato, shelter', () => {
    const r = tinhQuyenLoi(input({}))
    expect(r.ketLuan.map((k) => k.id)).toEqual(['fuyo', 'remit-unassigned', 'refund', 'furusato', 'shelter'])
  })
  it('remit-unassigned: thieu khi có lần chưa gán trong năm, du khi không', () => {
    expect(tinhQuyenLoi(input({ txs: [tx({})] })).ketLuan[1].trang_thai).toBe('thieu')
    expect(tinhQuyenLoi(input({ txs: [tx({ remit_recipient_id: 'me' })] })).ketLuan[1].trang_thai).toBe('du')
  })
  it('BẤT BIẾN: Σ đã gửi theo người + tổng chưa gán = totalSentJpy của remittance/aggregate (cùng năm)', () => {
    const txs = [tx({ remit_recipient_id: 'me' }), tx({ amount: 50_500 }), tx({ remit_recipient_id: 'me', amount: 20_000, remit_fee_jpy: 0 })]
    const r = tinhQuyenLoi(input({ txs }))
    const tongTheoApp = r.fuyo.nguoi.reduce((s, n) => s + n.da_gui, 0) + r.fuyo.chua_gan.tong
    expect(tongTheoApp).toBe(remittanceStats(txs).totalSentJpy)
  })
  it('suatBien suy từ Σ所得税 12 tháng; thiếu thì null và fuyo không có tiền', () => {
    const r = tinhQuyenLoi(input({ txs: [tx({ remit_recipient_id: 'me' })] }))
    expect(r.suatBien).toBeNull()
    expect(r.fuyo.ketLuan.tiet_kiem_uoc).toBeNull()
  })
  it('furusato nhận deXuatKhaiThue khi refund có năm', () => {
    const r = tinhQuyenLoi(input({ txs: [tx({ remit_recipient_id: 'me', occurred_on: '2024-05-01' })] }))
    // mẹ 68 tuổi năm 2024 → cần 38万 → không đủ → refund rỗng → không đề xuất
    expect(r.refund.nam).toHaveLength(0)
    expect(r.furusato.onestop_rui_ro).toBe(false)
  })
})
