import { describe, expect, it } from 'vitest'
import { deriveReceived, nextReceived } from './remitDerive'

describe('suy so VND tu ty gia', () => {
  it('received = SO GUI x ty gia — phi KHONG tru them lan nao', () => {
    // ¥30,000 gui × 153,0 = ₫4,590,000. Phi ¥800 da bi cong vao `amount` luc luu
    // (roleSave: amount = so gui + phi) nen tru them o day la tru HAI LAN.
    expect(deriveReceived(30_000, 153)).toBe(4_590_000)
    // So cu, sai: (30.000 − 800) × 153. Chot lai de khong ai noi lai phep tru do.
    expect(deriveReceived(30_000, 153)).not.toBe(4_467_600)
  })

  it('khop dung quan he cua so: ban demo ghi 29.500 x 166', () => {
    // demoRepo.ts: amount 30.000, remit_fee_jpy 500, remit_received_vnd = 29.500 × 166.
    // 29.500 = amount − phi = SO GUI, tuc `sent` ma form chuyen vao day.
    expect(deriveReceived(29_500, 166)).toBe(29_500 * 166)
  })

  it('chua co ty gia thi tra null, khong doan bua', () => {
    expect(deriveReceived(30_000, null)).toBeNull()
  })

  it('chua nhap so gui thi khong suy gi', () => {
    expect(deriveReceived(0, 153)).toBeNull()
  })

  it('rate am thi tra null (guard tu convertFromBase)', () => {
    expect(deriveReceived(1000, -153)).toBeNull()
  })

  it('con so le thi lam tron theo Math.round', () => {
    // ¥95 × 1.005 = ₫95.475 → 95
    expect(deriveReceived(95, 1.005)).toBe(95)
  })
})

describe('nextReceived — khi nao duoc ghi de o "So nhan"', () => {
  it('chua go tay thi ty gia dien vao', () => {
    expect(nextReceived({ current: 0, touched: false, sent: 30_000, rate: 153 }))
      .toBe(4_590_000)
  })

  it('DA go tay thi KHONG dap len — so ben nhan bao la su that, ty gia chi la uoc', () => {
    expect(nextReceived({ current: 4_400_000, touched: true, sent: 30_000, rate: 153 }))
      .toBe(4_400_000)
  })

  it('doi so gui sau khi da go tay thi VAN giu so da go', () => {
    // Neu khong, sua so gui mot chu so la mat so ben nhan da bao.
    expect(nextReceived({ current: 4_400_000, touched: true, sent: 31_000, rate: 153 }))
      .toBe(4_400_000)
  })

  it('chua co ty gia thi giu nguyen so hien tai, khong xoa ve 0', () => {
    expect(nextReceived({ current: 4_400_000, touched: false, sent: 30_000, rate: null }))
      .toBe(4_400_000)
  })
})
