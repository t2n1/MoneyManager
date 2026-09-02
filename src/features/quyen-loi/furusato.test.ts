import { describe, expect, it } from 'vitest'
import type { CategoryRow, TransactionRow } from '../../types/database.types'
import { FURUSATO_CATEGORY_NAME, tinhFurusato, tranFurusato } from './furusato'
import { LUAT_2026 } from './rules/2026'

let seq = 0
const tx = (p: Partial<TransactionRow>): TransactionRow => ({
  id: `t${seq++}`, user_id: 'u', type: 'expense', amount: 0, to_amount: null, category_id: null, account_id: 'a',
  to_account_id: null, recurring_rule_id: null, occurred_on: '2026-03-25', note: '', created_at: '', updated_at: '', ...p,
})
const cat = (id: string, name: string): CategoryRow => ({
  id, user_id: 'u', name, type: 'expense', icon: '', parent_id: null, sort_order: 0, is_archived: false,
  created_at: '', need_level: null, cost_type: null, kind: 'expense',
})
const categories = [cat('sho', 'Thuế thu nhập (所得税)'), cat('ju', 'Thuế cư trú (住民税)'), cat('fu', FURUSATO_CATEGORY_NAME)]
/** 12 tháng 住民税 12.000 + 所得税 6.000, từ 9/2025 tới 8/2026. */
function phieu12(): TransactionRow[] {
  const out: TransactionRow[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(2025, 8 + i, 25))
    const iso = d.toISOString().slice(0, 10)
    out.push(tx({ category_id: 'ju', amount: 12_000, occurred_on: iso, exclude_from_stats: true }))
    out.push(tx({ category_id: 'sho', amount: 6_000, occurred_on: iso, exclude_from_stats: true }))
  }
  return out
}
const base = { year: 2026, todayISO: '2026-09-03', categories, deXuatKhaiThue: false }

describe('tranFurusato — công thức NTA No.1155', () => {
  it('所得割 139.000, bậc 5%: 139.000 × 20% ÷ (90% − 5%×1,021) + 2.000 = 34.746', () => {
    // 27.800 ÷ 0,84895 = 32.746,3 → floor 32.746 + 2.000
    expect(tranFurusato(139_000, 0.05, LUAT_2026)).toBe(34_746)
  })
})

describe('tinhFurusato', () => {
  it('住民税 12 tháng 144.000 − 5.000 = 所得割 139.000; đã gửi 30.000 → còn 4.746 (bậc 5%)', () => {
    const r = tinhFurusato({ ...base, txs: [...phieu12(), tx({ category_id: 'fu', amount: 30_000 })], suatBien: 0.05 })
    expect(r.shotoku_wari).toBe(139_000)
    expect(r.tran).toBe(34_746)
    expect(r.da_gui).toBe(30_000)
    expect(r.con_lai).toBe(4_746)
    expect(r.ketLuan.trang_thai).toBe('du') // trước 1/10 và còn < 10.000 → không nhắc
  })
  it('từ 1/10 và còn ≥ 10.000 → thieu, hạn 31/12', () => {
    const r = tinhFurusato({ ...base, todayISO: '2026-10-02', txs: phieu12(), suatBien: 0.05 })
    expect(r.ketLuan.trang_thai).toBe('thieu')
    expect(r.ketLuan.han).toBe('2026-12-31')
  })
  it('thiếu 住民税 → thieu-du-lieu; thiếu suatBien → tran null', () => {
    expect(tinhFurusato({ ...base, txs: [], suatBien: 0.05 }).ketLuan.trang_thai).toBe('thieu-du-lieu')
    expect(tinhFurusato({ ...base, txs: phieu12(), suatBien: null }).tran).toBeNull()
  })
  it('chưa có danh mục furusato → co_danh_muc false, vẫn tính trần', () => {
    const r = tinhFurusato({ ...base, categories: categories.slice(0, 2), txs: phieu12(), suatBien: 0.05 })
    expect(r.co_danh_muc).toBe(false)
    expect(r.tran).toBe(34_746)
    expect(r.ketLuan.ly_do.join(' ')).toMatch(/danh mục/)
  })
  it('hoàn 住民税 (is_refund) trừ khỏi tổng', () => {
    const r = tinhFurusato({ ...base, txs: [...phieu12(), tx({ category_id: 'ju', amount: 24_000, is_refund: true, occurred_on: '2026-06-25' })], suatBien: 0.05 })
    expect(r.shotoku_wari).toBe(115_000)
  })
  it('đề xuất khai thuế cùng năm → onestop_rui_ro và câu việc đổi', () => {
    const r = tinhFurusato({ ...base, txs: [...phieu12(), tx({ category_id: 'fu', amount: 30_000 })], suatBien: 0.05, deXuatKhaiThue: true })
    expect(r.onestop_rui_ro).toBe(true)
    expect(r.ketLuan.viec).toMatch(/ワンストップ/)
  })
  it('năm cũ dùng 住民税 của chính năm đó', () => {
    const r = tinhFurusato({ ...base, year: 2025, txs: phieu12(), suatBien: 0.05 })
    expect(r.shotoku_wari).toBe(4 * 12_000 - 5_000) // 9..12/2025 = 4 tháng
  })
})
