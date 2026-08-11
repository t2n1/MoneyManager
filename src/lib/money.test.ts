import { describe, expect, it } from 'vitest'
import { CURRENCIES, formatMoney, parseMoney } from './money'

// Tiền lưu ở ĐƠN VỊ NHỎ NHẤT (minor units): JPY = yên, VND = đồng, USD = cent.

describe('formatMoney', () => {
  it('JPY: prefix ¥, không thập phân, nhóm nghìn bằng dấu phẩy (chuẩn Nhật)', () => {
    expect(formatMoney(0, 'JPY')).toBe('¥0')
    expect(formatMoney(1234, 'JPY')).toBe('¥1,234')
    expect(formatMoney(120000, 'JPY')).toBe('¥120,000')
    expect(formatMoney(1255910, 'JPY')).toBe('¥1,255,910')
  })

  it('VND: suffix ₫, không thập phân', () => {
    expect(formatMoney(1234000, 'VND')).toBe('1.234.000 ₫')
    expect(formatMoney(0, 'VND')).toBe('0 ₫')
  })

  // Chuẩn MỸ (phẩy hàng nghìn, chấm thập phân), không phải kiểu Việt — đổi 2026-08-11.
  // Lý do ở src/lib/currencies.ts: JPY và USD hiện cạnh nhau trong cùng danh sách, để
  // USD kiểu Việt thì dấu ',' vừa là hàng nghìn vừa là thập phân trên một màn hình.
  it('USD: prefix $, 2 số thập phân kiểu Mỹ (chấm)', () => {
    expect(formatMoney(123456, 'USD')).toBe('$1,234.56')
    expect(formatMoney(50, 'USD')).toBe('$0.50')
    expect(formatMoney(0, 'USD')).toBe('$0.00')
    // Mốc phân biệt rõ nhất với kiểu cũ: bốn chữ số + phần lẻ khác 0.
    expect(formatMoney(200000, 'USD')).toBe('$2,000.00')
  })

  it('số âm: dấu trừ đứng trước tất cả', () => {
    expect(formatMoney(-1234, 'JPY')).toBe('-¥1,234')
    expect(formatMoney(-50000, 'VND')).toBe('-50.000 ₫')
    expect(formatMoney(-123456, 'USD')).toBe('-$1,234.56')
  })

  it('giá trị rất lớn', () => {
    expect(formatMoney(999999999999, 'VND')).toBe('999.999.999.999 ₫')
  })
})

describe('parseMoney', () => {
  it('chỉ giữ chữ số — kết quả là minor units (kiểu ATM)', () => {
    expect(parseMoney('1.234.000 ₫')).toBe(1234000)
    // Cả hai kiểu dấu đều ra cùng số: parseMoney chỉ giữ chữ số, nên đổi quy ước
    // hiển thị USD không làm lệch ô nhập.
    expect(parseMoney('$1,234.56')).toBe(123456)
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
