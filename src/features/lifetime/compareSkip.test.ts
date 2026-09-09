import { describe, expect, it } from 'vitest'
import { countCompareSkipped } from './compareSkip'

describe('countCompareSkipped', () => {
  it('không có kịch bản nào bị ẩn → cả hai bộ đếm bằng 0', () => {
    expect(countCompareSkipped([])).toEqual({ currencyMismatch: 0, zeroYears: 0 })
    // Kịch bản đúng đơn vị tiền và chiếu ra dòng → không bị đếm vào đâu cả.
    expect(countCompareSkipped([{ currencyMismatch: false, rowCount: 12 }])).toEqual({
      currencyMismatch: 0,
      zeroYears: 0,
    })
  })

  it('một kịch bản chiếu ra 0 năm (đúng đơn vị tiền) → đếm vào zeroYears', () => {
    expect(countCompareSkipped([{ currencyMismatch: false, rowCount: 0 }])).toEqual({
      currencyMismatch: 0,
      zeroYears: 1,
    })
  })

  it('một kịch bản lệch đơn vị tiền → đếm vào currencyMismatch, KHÔNG vào zeroYears', () => {
    // rowCount: 0 cố tình để khẳng định currencyMismatch được kiểm TRƯỚC — một kịch bản
    // lệch tiền không được chiếu (xem TuongLaiPage.tsx), nên rowCount của nó luôn là 0
    // trong thực tế, và điều đó KHÔNG được lọt sang bộ đếm zeroYears.
    expect(countCompareSkipped([{ currencyMismatch: true, rowCount: 0 }])).toEqual({
      currencyMismatch: 1,
      zeroYears: 0,
    })
  })

  it('cả hai loại cùng lúc, nhiều kịch bản mỗi loại → hai bộ đếm tách biệt', () => {
    expect(
      countCompareSkipped([
        { currencyMismatch: true, rowCount: 0 },
        { currencyMismatch: false, rowCount: 0 },
        { currencyMismatch: true, rowCount: 0 },
        { currencyMismatch: false, rowCount: 30 },
        { currencyMismatch: false, rowCount: 0 },
      ]),
    ).toEqual({ currencyMismatch: 2, zeroYears: 2 })
  })
})
