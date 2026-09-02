import { describe, expect, it } from 'vitest'
import type { RelativeRow, TransactionRow } from '../../types/database.types'
import { fmtYen } from './quyenLoi'
import { tinhRefund } from './refund'

let seq = 0
const tx = (p: Partial<TransactionRow>): TransactionRow => ({
  id: `t${seq++}`, user_id: 'u', type: 'expense', amount: 30_500, to_amount: null, category_id: null,
  account_id: 'jpy', to_account_id: null, recurring_rule_id: null, occurred_on: '2024-03-01', note: '',
  created_at: '', updated_at: '', is_remittance: true, remit_fee_jpy: 500, remit_recipient_id: 'me', ...p,
})
const me: RelativeRow = { id: 'me', user_id: 'u', name: 'Mẹ', birth_year: 1958, relationship: 'parent', country: 'VN', is_archived: false, sort_order: 0, created_at: '' }
const base = { todayISO: '2026-09-03', relatives: [me], accounts: [{ id: 'jpy', currency: 'JPY' as const }], base: 'JPY' as const, rates: {}, suatBien: 0.1, fuyoClaimedYears: [] as number[], fmt: fmtYen }

describe('tinhRefund — cửa sổ 5 năm', () => {
  it('9/2026 soát 2021..2025; năm nào có người đủ thì vào danh sách với hạn 31/12/(y+5)', () => {
    // 2021: mẹ 63 tuổi, luật không ngưỡng → một lần 30.000 là đủ.
    // 2024: mẹ 66 tuổi, cần 38万 → gửi 400.000 mới đủ.
    const r = tinhRefund({ ...base, txs: [tx({ occurred_on: '2021-06-01' }), tx({ occurred_on: '2024-06-01', amount: 400_500 })] })
    expect(r.nam.map((n) => n.year)).toEqual([2021, 2024])
    expect(r.nam[0].han).toBe('2026-12-31')
    expect(r.nam[1].han).toBe('2029-12-31')
    expect(r.ketLuan.trang_thai).toBe('thieu')
    expect(r.ketLuan.muc).toBe('high') // có năm hết hạn ngay năm nay
    expect(r.ketLuan.han).toBe('2026-12-31')
  })
  it('2021 dùng luật không ngưỡng: người 30–69 đủ chỉ với một lần gửi', () => {
    const em = { ...me, id: 'em', birth_year: 1990 }
    const r = tinhRefund({ ...base, relatives: [em], txs: [tx({ occurred_on: '2021-06-01', remit_recipient_id: 'em' })] })
    expect(r.nam.map((n) => n.year)).toEqual([2021])
  })
  it('năm đã đánh dấu đã khai thì bỏ', () => {
    const r = tinhRefund({ ...base, fuyoClaimedYears: [2024], txs: [tx({ occurred_on: '2024-06-01', amount: 400_500 })] })
    expect(r.nam).toHaveLength(0)
    expect(r.ketLuan.trang_thai).toBe('du')
    expect(r.ketLuan.muc).toBe('low')
  })
  it('có năm đủ nhưng chưa năm nào hết hạn năm nay → muc medium', () => {
    const r = tinhRefund({ ...base, txs: [tx({ occurred_on: '2024-06-01', amount: 400_500 })] })
    expect(r.nam.map((n) => n.year)).toEqual([2024])
    expect(r.ketLuan.muc).toBe('medium')
  })
  it('30–69 với dưới 38万 ở năm ≥ 2023 → không đủ, không vào danh sách', () => {
    const r = tinhRefund({ ...base, txs: [tx({ occurred_on: '2024-06-01' }), tx({ occurred_on: '2025-06-01' })] })
    // mẹ 66/67 tuổi với 30.000 < 38万 → rỗng
    expect(r.nam).toHaveLength(0)
  })
  it('mẹ 70+ từ 2028 mới đủ không ngưỡng; năm 2025 (67 tuổi) cần 38万', () => {
    const r = tinhRefund({ ...base, txs: Array.from({ length: 13 }, () => tx({ occurred_on: '2025-06-01' })) })
    expect(r.nam.map((n) => n.year)).toEqual([2025]) // 13 × 30.000 = 390.000 ≥ 38万
    expect(r.nam[0].tiet_kiem_uoc).toBe(71_798) // 38万×10%×1,021 + 33万×10%
    expect(r.ketLuan.tiet_kiem_uoc).toBe(71_798)
  })
  it('co_nguong theo luật năm, không theo người', () => {
    // Em sinh 1996 → 28 tuổi năm 2024 (nhóm 16–29, không ngưỡng), 25 tuổi năm 2021.
    const em = { ...me, id: 'em', birth_year: 1996 }
    const r2024 = tinhRefund({ ...base, relatives: [em], txs: [tx({ occurred_on: '2024-06-01', remit_recipient_id: 'em' })] })
    expect(r2024.nam.map((n) => n.year)).toEqual([2024])
    expect(r2024.nam[0].co_nguong).toBe(true) // luật 2024 CÓ ngưỡng 38万, dù người đủ thuộc nhóm không ngưỡng
    const r2021 = tinhRefund({ ...base, relatives: [em], txs: [tx({ occurred_on: '2021-06-01', remit_recipient_id: 'em' })] })
    expect(r2021.nam.map((n) => n.year)).toEqual([2021])
    expect(r2021.nam[0].co_nguong).toBe(false) // luật 2021 chưa có ngưỡng
  })
})

// Finding 1 (soát tổng thể): migration 0056 không backfill, nên năm cũ có thể TOÀN lần
// gửi chưa gán — soát chỉ `r.nguoi` (đã gán) thì bỏ sót và báo nhầm "không có gì để đòi".
describe('tinhRefund — lần gửi chưa gán ở năm cũ (Finding 1)', () => {
  it('chỉ có lần gửi CHƯA gán → thieu-du-lieu, không phải du; chua_gan liệt kê năm và số lần', () => {
    const r = tinhRefund({ ...base, txs: [tx({ occurred_on: '2021-06-01', remit_recipient_id: null })] })
    expect(r.nam).toHaveLength(0)
    expect(r.chua_gan).toEqual([{ year: 2021, so_lan: 1, tong: 30_000 }])
    expect(r.ketLuan.trang_thai).toBe('thieu-du-lieu')
    expect(r.ketLuan.muc).toBe('medium')
    expect(r.ketLuan.han).toBeNull()
    expect(r.ketLuan.viec).toMatch(/chưa gán/)
  })

  it('nhiều năm chỉ có lần chưa gán → viec gộp khoảng năm đầu–cuối', () => {
    const r = tinhRefund({
      ...base,
      txs: [
        tx({ occurred_on: '2021-06-01', remit_recipient_id: null }),
        tx({ occurred_on: '2023-06-01', remit_recipient_id: null }),
      ],
    })
    expect(r.nam).toHaveLength(0)
    expect(r.chua_gan.map((c) => c.year)).toEqual([2021, 2023])
    expect(r.ketLuan.trang_thai).toBe('thieu-du-lieu')
    expect(r.ketLuan.viec).toMatch(/2021–2023/)
  })

  it('có năm đủ điều kiện LẪN năm khác còn lần chưa gán → vẫn thieu, ly_do có thêm dòng "cao hơn"', () => {
    const r = tinhRefund({
      ...base,
      txs: [
        tx({ occurred_on: '2024-06-01', amount: 400_500 }), // mẹ 66 tuổi, đủ 38万
        tx({ occurred_on: '2022-06-01', remit_recipient_id: null }), // năm khác, chưa gán
      ],
    })
    expect(r.nam.map((n) => n.year)).toEqual([2024])
    expect(r.chua_gan).toEqual([{ year: 2022, so_lan: 1, tong: 30_000 }])
    expect(r.ketLuan.trang_thai).toBe('thieu')
    expect(r.ketLuan.ly_do.join(' ')).toMatch(/chưa gán/)
    expect(r.ketLuan.ly_do.join(' ')).toMatch(/cao hơn/)
  })
})
