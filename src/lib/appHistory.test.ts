import { describe, expect, it } from 'vitest'
import { hasAppHistory } from './appHistory'

describe('hasAppHistory', () => {
  it('đã đi qua ít nhất một trang trong app → lùi được', () => {
    expect(hasAppHistory({ idx: 1, key: 'abc' })).toBe(true)
    expect(hasAppHistory({ idx: 7 })).toBe(true)
  })

  it('mục đầu tiên của tab → lùi là ra khỏi app', () => {
    expect(hasAppHistory({ idx: 0, key: 'default' })).toBe(false)
  })

  it('không có history state (mở thẳng link, trình duyệt cũ) → không lùi', () => {
    expect(hasAppHistory(null)).toBe(false)
    expect(hasAppHistory(undefined)).toBe(false)
    expect(hasAppHistory({})).toBe(false)
  })

  it('state của người khác đặt vào → không đoán bừa', () => {
    // Trang ngoài (hoặc thư viện khác) cũng ghi được history.state. `idx` không phải
    // số thì coi như không biết gì, và "không biết" phải rơi về đường cứng — đi nhầm
    // sang trang cha còn đỡ hơn văng khỏi app.
    expect(hasAppHistory({ idx: '3' })).toBe(false)
    expect(hasAppHistory({ idx: true })).toBe(false)
    expect(hasAppHistory('idx=3')).toBe(false)
  })

  it('idx âm (không nên có) → không lùi', () => {
    expect(hasAppHistory({ idx: -1 })).toBe(false)
  })
})
