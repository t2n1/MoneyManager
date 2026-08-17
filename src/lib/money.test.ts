import { afterEach, describe, expect, it } from 'vitest'
import { CURRENCIES, formatCompact, formatMoney, parseMoney } from './money'
import { setPrivacyEnabled } from './privacy'

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

// ---------------------------------------------------------------- chế độ che số (20c)
//
// Yêu cầu §4.8: ô che rộng ĐÚNG BẰNG con số thật. Trước đây che bằng bốn chấm cố định
// nên bật/tắt là cả cột số xê dịch — ở bảng hai chục dòng thì cả bảng nhảy, đúng lúc
// người dùng đang ở chỗ đông người và không muốn màn hình động đậy.
describe('che số: ô che rộng đúng bằng số thật', () => {
  afterEach(() => setPrivacyEnabled(false))

  it('JPY — số ký tự khớp chuỗi thật ở mọi độ dài', () => {
    for (const minor of [0, 1234, 120000, 1255910, 987654321]) {
      const that = formatMoney(minor, 'JPY')
      setPrivacyEnabled(true)
      const che = formatMoney(minor, 'JPY')
      setPrivacyEnabled(false)
      expect(che.length, `che "${che}" phải dài bằng thật "${that}"`).toBe(that.length)
      expect(che.startsWith('¥')).toBe(true)
      expect(che).not.toMatch(/\d/)
    }
  })

  it('VND (ký hiệu đứng sau) giữ đúng vị trí ký hiệu', () => {
    const that = formatMoney(1234000, 'VND')
    setPrivacyEnabled(true)
    const che = formatMoney(1234000, 'VND')
    expect(che.length).toBe(that.length)
    expect(che.endsWith(' ₫')).toBe(true)
    expect(che).not.toMatch(/\d/)
  })

  it('USD có phần thập phân cũng khớp bề rộng', () => {
    const that = formatMoney(123456, 'USD')
    setPrivacyEnabled(true)
    expect(formatMoney(123456, 'USD').length).toBe(that.length)
  })

  // Dấu âm nói CHIỀU, không nói số tiền — giữ lại thì bề rộng vẫn khớp chuỗi thật.
  it('giữ dấu âm', () => {
    const that = formatMoney(-5000, 'JPY')
    setPrivacyEnabled(true)
    const che = formatMoney(-5000, 'JPY')
    expect(che.length).toBe(that.length)
    expect(che.startsWith('-')).toBe(true)
  })

  // Che cả dấu phân cách: "¥•,•••,•••" vẫn vẽ ra đúng cấu trúc hàng triệu.
  it('không để lộ dấu phân cách nghìn', () => {
    setPrivacyEnabled(true)
    expect(formatMoney(1255910, 'JPY')).toBe('¥•••••••••')
  })

  it('nhãn rút gọn cũng khớp bề rộng', () => {
    for (const minor of [500, 300000, 12000000, 250000000000]) {
      const that = formatCompact(minor, 'JPY')
      setPrivacyEnabled(true)
      const che = formatCompact(minor, 'JPY')
      setPrivacyEnabled(false)
      expect(che.length, `"${che}" vs "${that}"`).toBe(that.length)
      expect(che).not.toMatch(/[\dkMB]/)
    }
  })
})
