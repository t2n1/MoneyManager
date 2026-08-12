import { describe, expect, it } from 'vitest'
import { parseSignedIntText, sanitizeSignedIntText, signedIntToText } from './signedInt'

/**
 * Mô phỏng ĐÚNG thứ tự gõ thật vào một input dùng `sanitizeSignedIntText`: mỗi lần gõ
 * thêm một ký tự vào CUỐI chuỗi đang có trong ô (không gán thẳng chuỗi đích), giống
 * chuỗi state cộng dồn từng keystroke thật trên bàn phím.
 */
function goTungKytu(keys: string): string {
  let text = ''
  for (const k of keys) text = sanitizeSignedIntText(text + k)
  return text
}

describe('sanitizeSignedIntText + parseSignedIntText — ô 口数/số cổ có dấu âm', () => {
  it('gõ "-500" theo thứ tự tự nhiên (dấu trừ trước) ra đúng -500', () => {
    const text = goTungKytu('-500')
    expect(text).toBe('-500')
    expect(parseSignedIntText(text)).toBe(-500)
  })

  it('từng bước gõ dở dang không bị rơi mất dấu trừ', () => {
    // Đúng các bước trung gian mà người soát đã đo bằng keystroke thật.
    expect(goTungKytu('-')).toBe('-')
    expect(goTungKytu('-5')).toBe('-5')
    expect(goTungKytu('-50')).toBe('-50')
    expect(goTungKytu('-500')).toBe('-500')
  })

  it('"-" đơn lẻ (đang gõ dở, chưa ra số) đọc thành 0, không phải NaN', () => {
    expect(parseSignedIntText('-')).toBe(0)
  })

  it('chuỗi rỗng đọc thành 0', () => {
    expect(parseSignedIntText('')).toBe(0)
  })

  it('gõ số dương bình thường vẫn ra đúng số', () => {
    expect(parseSignedIntText(goTungKytu('28429'))).toBe(28429)
  })

  it('lọc bỏ ký tự không phải số/dấu trừ đầu (dán nhầm, gõ chữ)', () => {
    expect(sanitizeSignedIntText('12a3')).toBe('12')
    expect(sanitizeSignedIntText('5-00')).toBe('5') // dấu trừ chỉ hợp lệ ở ĐẦU
  })

  it('signedIntToText là chiều ngược: 0 → rỗng, số khác → chuỗi của nó', () => {
    expect(signedIntToText(0)).toBe('')
    expect(signedIntToText(-500)).toBe('-500')
    expect(signedIntToText(500)).toBe('500')
  })
})
