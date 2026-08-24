import { describe, expect, it } from 'vitest'
import { moneyDelta, stripSpark, yearDelta } from './editorStrip'

describe('yearDelta', () => {
  it('chưa có nháp thì không có chữ nào', () => {
    expect(yearDelta(2059, undefined, 'không đạt', false)).toEqual({ text: '', tone: 'same' })
  })

  it('y hệt bản lưu thì "không đổi", màu trung tính', () => {
    expect(yearDelta(2059, 2059, 'không đạt', false)).toEqual({ text: 'không đổi', tone: 'same' })
    expect(yearDelta(null, null, 'không âm', true)).toEqual({ text: 'không đổi', tone: 'same' })
  })

  // Cột FIRE: sớm hơn là tốt hơn.
  it('FIRE sớm hơn là tốt, muộn hơn là xấu', () => {
    expect(yearDelta(2056, 2059, 'không đạt', false)).toEqual({ text: '−3 năm', tone: 'good' })
    expect(yearDelta(2064, 2059, 'không đạt', false)).toEqual({ text: '+5 năm', tone: 'bad' })
  })

  // Cột Âm từ: muộn hơn là tốt hơn — ngược hẳn cột trên, cùng một hàm.
  it('năm âm muộn hơn là tốt, sớm hơn là xấu', () => {
    expect(yearDelta(2070, 2062, 'không âm', true)).toEqual({ text: '+8 năm', tone: 'good' })
    expect(yearDelta(2055, 2062, 'không âm', true)).toEqual({ text: '−7 năm', tone: 'bad' })
  })

  it('từ "không đạt" sang có năm FIRE là tin tốt', () => {
    expect(yearDelta(2061, null, 'không đạt', false)).toEqual({
      text: 'trước: không đạt',
      tone: 'good',
    })
  })

  it('từ có năm FIRE sang "không đạt" là tin xấu', () => {
    expect(yearDelta(null, 2059, 'không đạt', false)).toEqual({ text: 'trước: 2059', tone: 'bad' })
  })

  it('từ "không âm" sang CÓ năm âm là tin xấu', () => {
    expect(yearDelta(2058, null, 'không âm', true)).toEqual({
      text: 'trước: không âm',
      tone: 'bad',
    })
  })

  it('từ có năm âm sang "không âm" là tin tốt', () => {
    expect(yearDelta(null, 2058, 'không âm', true)).toEqual({ text: 'trước: 2058', tone: 'good' })
  })
})

describe('moneyDelta', () => {
  it('chưa có nháp thì giữ chỗ, không có hiệu', () => {
    expect(moneyDelta(1_000, undefined)).toEqual({ diffMinor: null, absent: true, tone: 'same' })
  })

  it('không đổi thì có so nhưng không có hiệu', () => {
    expect(moneyDelta(1_000, 1_000)).toEqual({ diffMinor: null, absent: false, tone: 'same' })
  })

  it('nhiều tiền hơn là tốt, ít hơn là xấu — kể cả khi cả hai đều âm', () => {
    expect(moneyDelta(1_500, 1_000)).toEqual({ diffMinor: 500, absent: false, tone: 'good' })
    expect(moneyDelta(-2_000, -1_000)).toEqual({ diffMinor: -1_000, absent: false, tone: 'bad' })
  })
})

describe('stripSpark', () => {
  it('mốc 0 luôn nằm trong khung, kể cả khi mọi giá trị đều dương', () => {
    const s = stripSpark([100, 200, 300], null)
    expect(s.zeroY).toBeGreaterThanOrEqual(2)
    expect(s.zeroY).toBeLessThanOrEqual(42)
    // Toàn số dương thì 0 là đáy thang → nằm ở mép dưới.
    expect(s.zeroY).toBe(42)
  })

  it('hai đường dùng CHUNG một thang: đường thấp hơn nằm dưới', () => {
    const s = stripSpark([100, 100], [300, 300])
    const yDraft = Number(s.draft.split(' ')[1])
    const ySaved = Number(s.saved!.split(' ')[1])
    // y của SVG hướng xuống: giá trị nhỏ hơn → y LỚN hơn.
    expect(yDraft).toBeGreaterThan(ySaved)
  })

  it('không có bản đã lưu thì không có đường xám', () => {
    expect(stripSpark([1, 2], null).saved).toBeNull()
  })

  it('ít hơn hai điểm thì không vẽ được đường nào', () => {
    expect(stripSpark([5], null).draft).toBe('')
    expect(stripSpark([], null).draft).toBe('')
  })

  it('đường phủ đúng bề ngang khung', () => {
    const s = stripSpark([0, 10, 20], null)
    expect(s.draft.startsWith('M0 ')).toBe(true)
    expect(s.draft).toContain('L200 ')
  })

  it('mọi giá trị bằng nhau thì không chia cho 0', () => {
    const s = stripSpark([0, 0, 0], null)
    expect(s.draft).not.toContain('NaN')
    expect(Number.isFinite(s.zeroY)).toBe(true)
  })
})
