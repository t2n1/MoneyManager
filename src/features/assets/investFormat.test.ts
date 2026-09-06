import { describe, expect, it } from 'vitest'
import { heSo, pct, share, sliceColor, SLICE_COLORS, SLICE_NEUTRAL } from './investFormat'

describe('heSo', () => {
  it('hai chữ số thập phân, dấu thập phân kiểu Việt', () => {
    expect(heSo(1.372)).toBe('1,37')
    expect(heSo(2)).toBe('2,00')
  })

  it('dùng dấu ÂM THẬT (U+2212), không phải hyphen', () => {
    // Trong dãy chữ mono, hyphen ngắn hơn dấu cộng nên hai dòng liền nhau đọc ra lệch
    // nhau — cùng lý do đã ghi ở src/components/ui/Num.tsx.
    expect(heSo(-4.1)).toBe('−4,10')
    expect(heSo(-4.1).includes('-')).toBe(false)
  })

  it('0 không mang dấu', () => {
    expect(heSo(0)).toBe('0,00')
    expect(heSo(-0.001)).toBe('0,00')
  })

  it('null ra gạch ngang — "chưa đo được" không phải 0', () => {
    expect(heSo(null)).toBe('—')
  })

  it('đổi được số chữ số thập phân', () => {
    expect(heSo(1.372, 1)).toBe('1,4')
    expect(heSo(-1.372, 0)).toBe('−1')
  })
})

describe('pct / share — giữ nguyên hành vi đã có', () => {
  it('pct mang dấu, share thì không', () => {
    expect(pct(0.085)).toBe('+8,5%')
    expect(pct(-0.085)).toBe('−8,5%')
    expect(share(0.637)).toBe('63,7%')
  })
})

describe('sliceColor', () => {
  it('trong dải thì trả đúng bậc của dải', () => {
    expect(sliceColor(0)).toBe(SLICE_COLORS[0])
    expect(sliceColor(4)).toBe(SLICE_COLORS[4])
  })

  it('quá dải thì về màu trung tính, không quay vòng lại bậc 1', () => {
    // Quay vòng sẽ làm mã thứ 6 mang đúng màu mã thứ 1 — hai lát cùng màu trong một donut.
    expect(sliceColor(5)).toBe(SLICE_NEUTRAL)
    expect(sliceColor(99)).toBe(SLICE_NEUTRAL)
  })
})
