import { describe, expect, it } from 'vitest'
import { convertToBase } from './rates'

// rates: 1 đơn vị base đổi được bao nhiêu đơn vị ngoại tệ (major units),
// đúng format của open.er-api.com với base = JPY.
const RATES = { JPY: 1, VND: 165, USD: 0.0065 }

describe('convertToBase (base = JPY)', () => {
  it('JPY → JPY giữ nguyên', () => {
    expect(convertToBase(1234, 'JPY', 'JPY', RATES)).toBe(1234)
  })

  it('VND → JPY (minor VND / rate)', () => {
    // 1.650.000 ₫ / 165 = ¥10.000
    expect(convertToBase(1650000, 'VND', 'JPY', RATES)).toBe(10000)
  })

  it('USD → JPY (cent → major → chia rate)', () => {
    // $65,00 = 6500 cents → 65 / 0.0065 = ¥10.000
    expect(convertToBase(6500, 'USD', 'JPY', RATES)).toBe(10000)
  })

  it('làm tròn về số nguyên minor units của base', () => {
    // 100 ₫ / 165 = 0.606... → ¥1
    expect(convertToBase(100, 'VND', 'JPY', RATES)).toBe(1)
  })

  it('thiếu rate → null (UI fallback tách loại tiền)', () => {
    expect(convertToBase(100, 'VND', 'JPY', { JPY: 1 })).toBeNull()
  })
})
