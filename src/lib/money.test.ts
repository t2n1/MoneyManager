import { describe, expect, it } from 'vitest'
import { formatVND, parseVND } from './money'

describe('formatVND', () => {
  it('định dạng số 0', () => {
    expect(formatVND(0)).toBe('0 ₫')
  })

  it('nhóm hàng nghìn bằng dấu chấm', () => {
    expect(formatVND(1234000)).toBe('1.234.000 ₫')
    expect(formatVND(50000)).toBe('50.000 ₫')
    expect(formatVND(999)).toBe('999 ₫')
  })

  it('xử lý giá trị rất lớn (gần 1 nghìn tỷ)', () => {
    expect(formatVND(999999999999)).toBe('999.999.999.999 ₫')
  })

  it('xử lý số âm (chênh lệch tháng)', () => {
    expect(formatVND(-50000)).toBe('-50.000 ₫')
  })
})

describe('parseVND', () => {
  it('bỏ qua dấu phân cách và ký hiệu tiền', () => {
    expect(parseVND('1.234.000 ₫')).toBe(1234000)
    expect(parseVND('1,234,000')).toBe(1234000)
  })

  it('chuỗi rỗng hoặc không có chữ số → 0', () => {
    expect(parseVND('')).toBe(0)
    expect(parseVND('abc')).toBe(0)
  })

  it('chỉ giữ chữ số', () => {
    expect(parseVND('12a3')).toBe(123)
  })

  it('round-trip với formatVND', () => {
    expect(parseVND(formatVND(999999999999))).toBe(999999999999)
  })
})
