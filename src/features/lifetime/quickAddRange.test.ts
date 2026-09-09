import { describe, expect, it } from 'vitest'
import { applySpanToPreset, normalizeSpan, spanYears } from './quickAddRange'

describe('normalizeSpan', () => {
  it('kéo ngược từ phải sang trái vẫn ra khoảng đúng chiều', () => {
    expect(normalizeSpan(2035, 2028)).toEqual({ startYear: 2028, endYear: 2035 })
  })
  it('bấm một chỗ (hai đầu trùng) là khoảng một năm', () => {
    expect(normalizeSpan(2030, 2030)).toEqual({ startYear: 2030, endYear: 2030 })
  })
})

describe('spanYears', () => {
  it('đếm CẢ HAI đầu — 2027–2031 là 5 năm, không phải 4', () => {
    expect(spanYears({ startYear: 2027, endYear: 2031 })).toBe(5)
  })
})

describe('applySpanToPreset', () => {
  const s = { startYear: 2030, endYear: 2064 }

  it('mua-nha lấy khoảng làm SỐ NĂM VAY', () => {
    expect(applySpanToPreset('mua-nha', s)).toEqual({ year: 2030, termYears: 35 })
  })
  it('mua-xe cũng lấy khoảng làm số năm vay', () => {
    expect(applySpanToPreset('mua-xe', { startYear: 2030, endYear: 2034 })).toEqual({
      year: 2030,
      termYears: 5,
    })
  })
  it('sinh-con lấy khoảng làm TUỔI NUÔI TỚI', () => {
    // 21, không phải 22: `syncEnd` của bản vẽ là
    // `endYear = min(X1, startYear + round(untilAge))`, nên 2030 + 21 = 2051 khép đúng
    // khoảng. Lấy 22 thì kéo một khoảng rồi mở lại mốc là năm kết thúc tự nhảy thêm một.
    expect(applySpanToPreset('sinh-con', { startYear: 2030, endYear: 2051 })).toEqual({
      year: 2030,
      untilAge: 21,
    })
  })
  it('mẫu còn lại lấy nguyên hai đầu làm năm bắt đầu và năm kết thúc', () => {
    expect(applySpanToPreset('du-lich', { startYear: 2030, endYear: 2040 })).toEqual({
      year: 2030,
      endYear: 2040,
    })
  })
  it('bấm một chỗ thì KHÔNG áp khoảng — chỉ có năm', () => {
    // Một năm không nói gì về thời hạn vay; áp vào là bịa ra "vay 1 năm".
    expect(applySpanToPreset('mua-nha', { startYear: 2030, endYear: 2030 })).toEqual({
      year: 2030,
    })
  })
})
