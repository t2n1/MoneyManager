import { describe, expect, it } from 'vitest'
import { tien } from './format'

describe('tien', () => {
  it('JPY: ký hiệu đứng trước, dấu phẩy hàng nghìn, không phần thập phân', () => {
    expect(tien(12_400, 'JPY')).toEqual({ don_vi: 'JPY', so: 12_400, hien: '¥12,400' })
  })

  it('VND: ký hiệu đứng sau, dấu chấm hàng nghìn', () => {
    expect(tien(4_590_000, 'VND')).toEqual({
      don_vi: 'VND',
      so: 4_590_000,
      hien: '4.590.000 ₫',
    })
  })

  it('USD: hai chữ số thập phân từ minor units', () => {
    expect(tien(200_000, 'USD')).toEqual({ don_vi: 'USD', so: 200_000, hien: '$2,000.00' })
  })

  it('số âm giữ dấu trừ trước ký hiệu', () => {
    expect(tien(-500, 'JPY').hien).toBe('-¥500')
  })

  it('giữ `so` là số nguyên minor units, không đổi sang major', () => {
    expect(tien(1, 'USD')).toEqual({ don_vi: 'USD', so: 1, hien: '$0.01' })
  })
})
