import { describe, expect, it } from 'vitest'
import { tr } from './index'

// Môi trường test không có localStorage 'sct-lang' → chế độ Việt: tr() trả lại đúng câu gốc.
describe('tr() ở chế độ Việt', () => {
  it('trả nguyên câu gốc', () => {
    expect(tr('Lưu')).toBe('Lưu')
  })

  it('thế biến {…}', () => {
    expect(tr('còn {n} ngày', { n: 8 })).toBe('còn 8 ngày')
    expect(tr('{a} · {b}', { a: 'x', b: 2 })).toBe('x · 2')
  })

  it('biến không truyền thì để nguyên', () => {
    expect(tr('còn {n} ngày')).toBe('còn {n} ngày')
  })
})
