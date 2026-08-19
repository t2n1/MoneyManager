import { describe, expect, it } from 'vitest'
import { deriveReceived, effectiveRate, rateAgeLabel } from './remitDerive'

describe('suy so VND tu ty gia', () => {
  it('tru phi roi moi nhan ty gia — nguoi nhan chi nhan phan con lai', () => {
    // ¥30,000 gui, phi ¥800 → ¥29,200 × 153,0 = ₫4,467,600
    expect(deriveReceived(30_000, 800, 153)).toBe(4_467_600)
  })

  it('chua co ty gia thi tra null, khong doan bua', () => {
    expect(deriveReceived(30_000, 800, null)).toBeNull()
  })

  it('chua nhap so gui thi khong suy gi', () => {
    expect(deriveReceived(0, 0, 153)).toBeNull()
  })

  it('phi lon hon so gui thi tra null, khong ra so am', () => {
    expect(deriveReceived(500, 800, 153)).toBeNull()
  })

  it('phi bang so gui thi tra null, khong co gi nhan', () => {
    expect(deriveReceived(500, 500, 153)).toBeNull()
  })

  it('rate am thi tra null (guard tu convertFromBase)', () => {
    expect(deriveReceived(1000, 100, -153)).toBeNull()
  })

  it('sau tru phi, con so le thi lam tron theo Math.round', () => {
    // ¥100 gui, phi ¥5 → ¥95 × 1.005 = ₫95.475 → lam tron thanh 95
    // (nho: 95.475 -> 95 theo Math.round, nhung can kiem tra)
    const received = deriveReceived(100, 5, 1.005)
    expect(received).toBe(95) // 95 * 1.005 = 95.475, Math.round -> 95
  })

  it('ty gia thuc te tinh tren TONG BI TRU, ke ca phi', () => {
    // Nguoi dung nhin so bank tru (da gom phi) nen ty gia thuc phai chia tong do.
    expect(effectiveRate(30_000, 800, 4_467_600)).toBeCloseTo(145.05, 1)
  })
})

describe('rateAgeLabel', () => {
  it('sap xep theo tuoi tu gia', () => {
    const now = 1000_000 // ms
    const oneHourAgo = now - 3_600_000
    const result = rateAgeLabel(oneHourAgo, now)
    expect(result).toBe('1 giờ trước')
  })

  it('mot ngay truoc', () => {
    const now = 1000_000
    const yesterday = now - 86_400_000
    const result = rateAgeLabel(yesterday, now)
    expect(result).toBe('hôm qua')
  })

  it('vua xong neu tuoi < 1 phut', () => {
    const now = 1000_000
    const justNow = now - 30_000 // 30 giây
    const result = rateAgeLabel(justNow, now)
    expect(result).toBe('vừa xong')
  })
})
