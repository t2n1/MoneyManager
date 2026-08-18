import { describe, expect, it } from 'vitest'
import { deltaTone, signedPct } from './Num'

describe('signedPct', () => {
  it('dấu ÂM là dấu trừ THẬT (U+2212), không phải hyphen', () => {
    expect(signedPct(-14)).toBe('−' + '14%')
    // Hyphen là ký tự khác, và trong dãy mono nó ngắn hơn dấu cộng nên hai dòng liền
    // nhau đọc ra lệch nhau.
    expect(signedPct(-14)).not.toBe('-14%')
  })

  it('dấu THẬP PHÂN kiểu Việt (phẩy) — `${-37.3}` của JS ra "-37.3"', () => {
    expect(signedPct(-37.3)).toBe('−' + '37,3%')
    expect(signedPct(37.3)).toBe('+37,3%')
    expect(String(-37.3)).toBe('-37.3') // đúng cái phải tránh
  })

  it('số nguyên không thêm phần thập phân', () => {
    expect(signedPct(23)).toBe('+23%')
    expect(signedPct(100)).toBe('+100%')
  })

  it('đi ngang in "±0%", KHÔNG in "+0%"', () => {
    expect(signedPct(0)).toBe('±0%')
  })

  it('không so được in "—", KHÔNG in "0%"', () => {
    // Một danh mục mới không "đi ngang" — nó chưa có mốc nào để so.
    expect(signedPct(null)).toBe('—')
  })
})

describe('deltaTone', () => {
  it('TĂNG chi là tông chi, GIẢM chi là tông thu', () => {
    expect(deltaTone(23)).toBe('out')
    expect(deltaTone(-23)).toBe('in')
  })

  it('đi ngang và không-so-được đều mờ', () => {
    expect(deltaTone(0)).toBe('muted')
    expect(deltaTone(null)).toBe('muted')
  })
})
