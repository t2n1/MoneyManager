import { describe, expect, it } from 'vitest'
import { CURRENCIES, formatMoney, parseMoney } from './money'

// Tiền lưu ở ĐƠN VỊ NHỎ NHẤT (minor units): JPY = yên, VND = đồng, USD = cent.

describe('formatMoney', () => {
  it('JPY: prefix ¥, không thập phân, nhóm nghìn bằng dấu chấm', () => {
    expect(formatMoney(0, 'JPY')).toBe('¥0')
    expect(formatMoney(1234, 'JPY')).toBe('¥1.234')
    expect(formatMoney(120000, 'JPY')).toBe('¥120.000')
  })

  it('VND: suffix ₫, không thập phân', () => {
    expect(formatMoney(1234000, 'VND')).toBe('1.234.000 ₫')
    expect(formatMoney(0, 'VND')).toBe('0 ₫')
  })

  it('USD: prefix $, 2 số thập phân kiểu Việt (phẩy)', () => {
    expect(formatMoney(123456, 'USD')).toBe('$1.234,56')
    expect(formatMoney(50, 'USD')).toBe('$0,50')
    expect(formatMoney(0, 'USD')).toBe('$0,00')
  })

  it('số âm: dấu trừ đứng trước tất cả', () => {
    expect(formatMoney(-1234, 'JPY')).toBe('-¥1.234')
    expect(formatMoney(-50000, 'VND')).toBe('-50.000 ₫')
    expect(formatMoney(-123456, 'USD')).toBe('-$1.234,56')
  })

  it('giá trị rất lớn', () => {
    expect(formatMoney(999999999999, 'VND')).toBe('999.999.999.999 ₫')
  })
})

describe('parseMoney', () => {
  it('chỉ giữ chữ số — kết quả là minor units (kiểu ATM)', () => {
    expect(parseMoney('1.234.000 ₫')).toBe(1234000)
    expect(parseMoney('$1.234,56')).toBe(123456)
    expect(parseMoney('¥120.000')).toBe(120000)
    expect(parseMoney('')).toBe(0)
    expect(parseMoney('abc')).toBe(0)
  })

  it('round-trip với formatMoney cho cả 3 loại tiền', () => {
    for (const c of ['JPY', 'VND', 'USD'] as const) {
      expect(parseMoney(formatMoney(987654321, c))).toBe(987654321)
    }
  })
})

describe('CURRENCIES', () => {
  it('đủ 3 loại tiền với decimals đúng', () => {
    expect(CURRENCIES.JPY.decimals).toBe(0)
    expect(CURRENCIES.VND.decimals).toBe(0)
    expect(CURRENCIES.USD.decimals).toBe(2)
  })
})
