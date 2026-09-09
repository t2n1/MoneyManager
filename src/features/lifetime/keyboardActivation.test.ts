import { describe, expect, it } from 'vitest'
import { isActivationKey } from './keyboardActivation'

describe('isActivationKey', () => {
  it('Enter và phím cách (giá trị `key` của Space là chuỗi một dấu cách) là phím kích hoạt', () => {
    expect(isActivationKey('Enter')).toBe(true)
    expect(isActivationKey(' ')).toBe(true)
  })

  it('←/→ và các phím khác không phải phím kích hoạt — chúng có nhánh riêng (dời năm)', () => {
    expect(isActivationKey('ArrowLeft')).toBe(false)
    expect(isActivationKey('ArrowRight')).toBe(false)
    expect(isActivationKey('Tab')).toBe(false)
    expect(isActivationKey('Escape')).toBe(false)
    expect(isActivationKey('a')).toBe(false)
    expect(isActivationKey('')).toBe(false)
  })

  it('phân biệt hoa/thường và không khớp mờ — "spacebar" (tên cũ, một số trình duyệt cổ) không được coi là kích hoạt', () => {
    expect(isActivationKey('Spacebar')).toBe(false)
    expect(isActivationKey('enter')).toBe(false)
  })
})
