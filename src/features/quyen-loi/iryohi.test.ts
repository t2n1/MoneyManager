import { describe, expect, it } from 'vitest'
import type { CategoryRow, TransactionRow } from '../../types/database.types'
import { IRYOHI_CATEGORY_NAMES, tinhIryohi, type IryohiInput } from './iryohi'
import { tienTietKiem } from './marginalRate'
import { fmtYen } from './quyenLoi'
import { LUAT_2026 } from './rules/2026'

let seq = 0
const tx = (categoryId: string, amount: number, occurredOn: string, p: Partial<TransactionRow> = {}): TransactionRow => ({
  id: `t${seq++}`, user_id: 'u', type: 'expense', amount, to_amount: null, category_id: categoryId, account_id: 'a',
  to_account_id: null, recurring_rule_id: null, occurred_on: occurredOn, note: '', created_at: '', updated_at: '', ...p,
})
const cat = (id: string, name: string): CategoryRow => ({
  id, user_id: 'u', name, type: 'expense', icon: '', parent_id: null, sort_order: 0, is_archived: false,
  created_at: '', need_level: null, cost_type: null, kind: 'expense',
})
const CATS = [cat('thuoc', 'Thuốc'), cat('bv', 'Bệnh viện'), cat('an', 'Cơm ngoài')]

const chay = (txs: TransactionRow[], p: Partial<IryohiInput> = {}) =>
  tinhIryohi({
    year: 2026, todayISO: '2026-09-05', categories: CATS, txs,
    suatBien: 0.1, deXuatKhaiThue: true, fmt: fmtYen, ...p,
  })

describe('tinhIryohi — hai tên danh mục cố định', () => {
  it('IRYOHI_CATEGORY_NAMES đúng hai tên trong sổ', () => {
    expect(IRYOHI_CATEGORY_NAMES).toEqual(['Thuốc', 'Bệnh viện'])
  })
})

describe('tinhIryohi — nhánh chính', () => {
  it('dưới ngưỡng cả hai nhánh → du, khấu trừ 0, vẫn báo tiến độ trong chi_y', () => {
    // Bệnh viện (không phải Thuốc) để nhánh self không dính vào ca này
    const r = chay([tx('bv', 30_000, '2026-02-01')])
    expect(r.chi_y).toBe(30_000)
    expect(r.khau_tru).toBe(0)
    expect(r.nhanh).toBeNull()
    expect(r.ketLuan.trang_thai).toBe('du')
    expect(r.ketLuan.tiet_kiem_uoc).toBeNull()
  })

  it('vượt ngưỡng → thieu, khấu trừ = chi − 100k, hạn 15/3 năm sau, tiết kiệm đúng công thức chung', () => {
    // Thuốc để THẤP (10k < ngưỡng self 12k) cho nhánh self đứng ngoài ca này
    const r = chay([tx('thuoc', 10_000, '2026-02-01'), tx('bv', 120_000, '2026-03-01')])
    expect(r.chi_y).toBe(130_000)
    expect(r.khau_tru_chinh).toBe(30_000)
    expect(r.nhanh).toBe('chinh')
    expect(r.ketLuan.trang_thai).toBe('thieu')
    expect(r.ketLuan.han).toBe('2027-03-15')
    expect(r.ketLuan.tiet_kiem_uoc).toBe(tienTietKiem(30_000, 30_000, 0.1, LUAT_2026))
  })

  it('trần 2M: chi 3M → khấu trừ kẹp 2M', () => {
    const r = chay([tx('bv', 3_000_000, '2026-01-15')])
    expect(r.khau_tru_chinh).toBe(2_000_000)
  })
})

describe('tinhIryohi — nhánh self-med', () => {
  it('ca hỗn hợp thuốc 70k + viện 60k: self (58k) THẮNG chính (30k) — đúng công thức, không phải bug', () => {
    const r = chay([tx('thuoc', 70_000, '2026-02-01'), tx('bv', 60_000, '2026-03-01')])
    expect(r.khau_tru_chinh).toBe(30_000)
    expect(r.khau_tru_self).toBe(58_000)
    expect(r.nhanh).toBe('self')
  })

  it('tổng dưới 100k mà thuốc cao: thuốc 60k → self 48k thắng, chính 0', () => {
    const r = chay([tx('thuoc', 60_000, '2026-02-01')])
    expect(r.khau_tru_chinh).toBe(0)
    expect(r.khau_tru_self).toBe(48_000)
    expect(r.nhanh).toBe('self')
  })

  it('self chỉ đếm Thuốc — thêm bệnh viện không đổi khau_tru_self', () => {
    const r = chay([tx('thuoc', 60_000, '2026-02-01'), tx('bv', 20_000, '2026-03-01')])
    expect(r.khau_tru_self).toBe(48_000)
    expect(r.chi_y).toBe(80_000)
  })

  it('self trần 88k: thuốc 120k một mình → self 88k > chính 20k → self thắng', () => {
    const r = chay([tx('thuoc', 120_000, '2026-02-01')])
    expect(r.khau_tru_self).toBe(88_000)
    expect(r.khau_tru_chinh).toBe(20_000)
    expect(r.nhanh).toBe('self')
  })

  it('năm 2027 self-med hết hạn → nhánh self = 0', () => {
    const r = chay([tx('thuoc', 60_000, '2027-02-01')], { year: 2027, todayISO: '2027-09-05' })
    expect(r.khau_tru_self).toBe(0)
    expect(r.nhanh).toBeNull()
  })
})

describe('tinhIryohi — phạm vi đếm và ca biên', () => {
  it('hoàn tiền trừ ra; ranh giới năm dương lịch; danh mục khác không đếm', () => {
    const r = chay([
      tx('thuoc', 50_000, '2026-12-31'),
      tx('thuoc', 10_000, '2026-06-01', { is_refund: true }),
      tx('thuoc', 99_999, '2027-01-01'),
      tx('an', 88_888, '2026-06-15'),
    ])
    expect(r.chi_y).toBe(40_000)
  })

  it('suatBien null → tiet_kiem_uoc null nhưng khấu trừ vẫn có, ly_do nói thiếu gì', () => {
    const r = chay([tx('bv', 200_000, '2026-02-01')], { suatBien: null })
    expect(r.khau_tru).toBe(100_000)
    expect(r.ketLuan.tiet_kiem_uoc).toBeNull()
    expect(r.ketLuan.ly_do.join(' ')).toContain('phiếu lương')
  })

  it('năm cũ có khấu trừ → het-han, không thành việc-cần-làm', () => {
    const r = chay([tx('bv', 200_000, '2025-02-01')], { year: 2025 })
    expect(r.ketLuan.trang_thai).toBe('het-han')
  })

  it('không có danh mục y tế nào → co_danh_muc false, ly_do nói ra', () => {
    const r = tinhIryohi({
      year: 2026, todayISO: '2026-09-05', categories: [cat('an', 'Cơm ngoài')],
      txs: [], suatBien: 0.1, deXuatKhaiThue: false, fmt: fmtYen,
    })
    expect(r.co_danh_muc).toBe(false)
    expect(r.ketLuan.ly_do.join(' ')).toContain('danh mục')
  })

  it('ly_do luôn nói rõ ba méo mó của phép ước (cận dưới)', () => {
    const r = chay([tx('bv', 200_000, '2026-02-01')])
    const lyDo = r.ketLuan.ly_do.join(' ')
    expect(lyDo).toContain('bảo hiểm')
  })
})
