import { describe, expect, it } from 'vitest'
import type { AccountRow, RelativeRow, TransactionRow } from '../../types/database.types'
import { tinhFuyo, type FuyoInput } from './fuyo'

let seq = 0
function tx(p: Partial<TransactionRow>): TransactionRow {
  return {
    id: `t${seq++}`, user_id: 'u', type: 'expense', amount: 0, to_amount: null, category_id: null,
    account_id: 'jpy', to_account_id: null, recurring_rule_id: null, occurred_on: '2026-03-01',
    note: '', created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
    is_remittance: true, remit_fee_jpy: 500, ...p,
  }
}
function nguoi(p: Partial<RelativeRow> = {}): RelativeRow {
  return {
    id: 'me', user_id: 'u', name: 'Mẹ', birth_year: 1958, relationship: 'parent', country: 'VN',
    is_archived: false, sort_order: 0, created_at: '2026-01-01T00:00:00Z', ...p,
  }
}
const accounts = [
  { id: 'jpy', currency: 'JPY' },
  { id: 'vnd', currency: 'VND' },
] as Pick<AccountRow, 'id' | 'currency'>[]

function input(p: Partial<FuyoInput>): FuyoInput {
  return {
    year: 2026, todayISO: '2026-09-03', relatives: [], txs: [], accounts, base: 'JPY', rates: {},
    suatBien: 0.1, ...p,
  }
}

describe('tinhFuyo — nhóm tuổi tại 31/12', () => {
  it('70+: không ngưỡng, khấu trừ 老人 48万/38万, đủ ngay khi có một lần gửi', () => {
    const r = tinhFuyo(input({
      relatives: [nguoi({ birth_year: 1956 })], // 70 tuổi năm 2026
      txs: [tx({ amount: 30_500, remit_recipient_id: 'me' })],
    }))
    expect(r.nguoi[0]).toMatchObject({ nhom: '70+', da_gui: 30_000, nguong: 0, con_thieu: 0, du: true })
    expect(r.nguoi[0].khau_tru_shotoku).toBe(480_000)
    // 480.000 × 0,10 × 1,021 + 380.000 × 0,10 = 49.008 + 38.000
    expect(r.nguoi[0].tiet_kiem_uoc).toBe(87_008)
    expect(r.ketLuan.trang_thai).toBe('du')
  })

  it('30–69: thiếu dưới 38万 → thieu, còn 3 tháng (tháng 9)', () => {
    const r = tinhFuyo(input({
      relatives: [nguoi({ id: 'em', name: 'Em', birth_year: 1995 })],
      txs: [tx({ amount: 100_500, remit_recipient_id: 'em' }), tx({ amount: 100_500, remit_recipient_id: 'em' })],
    }))
    const em = r.nguoi[0]
    expect(em).toMatchObject({ nhom: '30-69', da_gui: 200_000, nguong: 380_000, con_thieu: 180_000, du: false })
    expect(em.khau_tru_shotoku).toBe(0)
    expect(r.thang_con_lai).toBe(3)
    expect(r.ketLuan.trang_thai).toBe('thieu')
    expect(r.ketLuan.muc).toBe('medium')
    expect(r.ketLuan.viec).toContain('180.000')
    expect(r.ketLuan.han).toBe('2026-12-31')
  })

  it('≤ 2 tháng còn lại → muc high; tháng 12 → 0 tháng', () => {
    const r = tinhFuyo(input({ todayISO: '2026-12-10', relatives: [nguoi({ id: 'em', birth_year: 1995 })] }))
    expect(r.thang_con_lai).toBe(0)
    expect(r.ketLuan.muc).toBe('high')
  })

  it('biên tuổi: sinh 1997 → 29 tuổi năm 2026 là 16-29 (không ngưỡng); 1996 → 30', () => {
    const r = tinhFuyo(input({ relatives: [nguoi({ id: 'a', birth_year: 1997 }), nguoi({ id: 'b', birth_year: 1996 })] }))
    expect(r.nguoi[0].nhom).toBe('16-29')
    expect(r.nguoi[1].nhom).toBe('30-69')
  })

  it('dưới 16 → không được khấu trừ, không tính thiếu', () => {
    const r = tinhFuyo(input({ relatives: [nguoi({ id: 'c', birth_year: 2015 })] }))
    expect(r.nguoi[0]).toMatchObject({ nhom: '<16', khau_tru_shotoku: 0, con_thieu: 0 })
  })

  it('country JP → bỏ qua, nói rõ', () => {
    const r = tinhFuyo(input({ relatives: [nguoi({ country: 'JP' })] }))
    expect(r.nguoi).toHaveLength(0)
    expect(r.ketLuan.trang_thai).toBe('thieu-du-lieu')
    expect(r.ketLuan.ly_do.join(' ')).toMatch(/cư trú ở Nhật/)
  })
})

describe('tinhFuyo — dữ liệu', () => {
  it('lần gửi chưa gán át trạng thái du → thieu-du-lieu, đếm số lần và tổng', () => {
    const r = tinhFuyo(input({
      relatives: [nguoi({ birth_year: 1956 })],
      txs: [tx({ amount: 30_500, remit_recipient_id: 'me' }), tx({ amount: 20_500 }), tx({ amount: 10_500 })],
    }))
    expect(r.chua_gan).toEqual({ so_lan: 2, tong: 30_000 })
    expect(r.ketLuan.trang_thai).toBe('thieu-du-lieu')
    expect(r.ketLuan.viec).toMatch(/2 lần gửi/)
  })

  it('chỉ đếm năm đang xét và chỉ is_remittance', () => {
    const r = tinhFuyo(input({
      relatives: [nguoi()],
      txs: [
        tx({ amount: 30_500, remit_recipient_id: 'me', occurred_on: '2025-12-31' }),
        tx({ amount: 30_500, remit_recipient_id: 'me', occurred_on: '2026-01-01' }),
        tx({ amount: 99_000, remit_recipient_id: 'me', is_remittance: false }),
      ],
    }))
    expect(r.nguoi[0].da_gui).toBe(30_000)
  })

  it('tài khoản VND thiếu tỷ giá → loại + cờ thieu_ty_gia', () => {
    const r = tinhFuyo(input({
      relatives: [nguoi()],
      txs: [tx({ amount: 5_000_000, account_id: 'vnd', remit_fee_jpy: 0, remit_recipient_id: 'me' })],
    }))
    expect(r.nguoi[0].da_gui).toBe(0)
    expect(r.thieu_ty_gia).toBe(true)
  })

  it('tài khoản VND có tỷ giá → quy về yên', () => {
    const r = tinhFuyo(input({
      relatives: [nguoi()],
      rates: { VND: 166 }, // 1 JPY = 166 VND
      txs: [tx({ amount: 1_660_000, account_id: 'vnd', remit_fee_jpy: 0, remit_recipient_id: 'me' })],
    }))
    expect(r.nguoi[0].da_gui).toBe(10_000)
  })

  it('suatBien null → tiet_kiem_uoc null, có lý do', () => {
    const r = tinhFuyo(input({ suatBien: null, relatives: [nguoi()], txs: [tx({ amount: 30_500, remit_recipient_id: 'me' })] }))
    expect(r.nguoi[0].tiet_kiem_uoc).toBeNull()
    expect(r.ketLuan.tiet_kiem_uoc).toBeNull()
    expect(r.ketLuan.ly_do.join(' ')).toMatch(/phiếu lương/)
  })

  it('năm ≤ 2022 dùng luật không ngưỡng: 30–69 đủ chỉ với một lần gửi', () => {
    const r = tinhFuyo(input({ year: 2022, relatives: [nguoi({ id: 'em', birth_year: 1990 })], txs: [tx({ amount: 30_500, remit_recipient_id: 'em', occurred_on: '2022-05-01' })] }))
    expect(r.nguoi[0]).toMatchObject({ nguong: 0, du: true, khau_tru_shotoku: 380_000 })
  })

  it('không có người thân → thieu-du-lieu, việc là thêm người', () => {
    const r = tinhFuyo(input({}))
    expect(r.ketLuan.trang_thai).toBe('thieu-du-lieu')
    expect(r.ketLuan.viec).toMatch(/Thêm người thân/)
  })

  it('năm cũ đủ → du nhưng câu việc không bảo nộp giấy cho nenmatsu-chosei', () => {
    const txs = Array.from({ length: 13 }, (_, i) => tx({ amount: 30_500, remit_recipient_id: 'me', occurred_on: `2024-${String(i + 1).padStart(2, '0')}-01` }))
    const r = tinhFuyo(input({
      year: 2024,
      todayISO: '2026-09-03',
      relatives: [nguoi({ birth_year: 1956 })], // 68 tuổi năm 2024 = 30-69
      txs,
    }))
    expect(r.nguoi[0]).toMatchObject({ nhom: '30-69', da_gui: 390_000, du: true })
    expect(r.ketLuan.trang_thai).toBe('du')
    expect(r.ketLuan.viec).toMatch(/Đòi lại năm cũ/)
    expect(r.ketLuan.viec).not.toMatch(/年末調整/)
  })
})
