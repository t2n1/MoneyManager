import { describe, expect, it } from 'vitest'
import { pickActive, type SectionTop } from './sectionActive'

/**
 * Sáu khối cao 500px, mục lục dính cao 48px → vạch ở 56 (48 + 8 đệm).
 * `scroll` là số px đã cuộn: mép trên khối i = i*500 − scroll.
 */
const CUTOFF = 56
const at = (scroll: number): SectionTop[] =>
  ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ id, top: i * 500 - scroll }))

describe('pickActive', () => {
  it('chưa cuộn → khối đầu', () => {
    expect(pickActive(at(0), CUTOFF)).toBe('a')
  })

  it('cuộn qua vạch của khối 2 thì mới nhảy sang khối 2', () => {
    // Khối b ở mép trên 500 − scroll; chạm vạch khi scroll = 444
    expect(pickActive(at(443), CUTOFF)).toBe('a')
    expect(pickActive(at(444), CUTOFF)).toBe('b')
  })

  it('khối kế tiếp vừa nhô lên ở đáy KHÔNG cướp mục đang xem', () => {
    // Đang đọc giữa khối c (scroll 1100): d ở top 400 — đã nhìn thấy nhưng chưa qua vạch
    const tops = at(1100)
    expect(tops.find((t) => t.id === 'd')!.top).toBe(400)
    expect(pickActive(tops, CUTOFF)).toBe('c')
  })

  it('cuộn xuống đáy → khối cuối', () => {
    expect(pickActive(at(2600), CUTOFF)).toBe('f')
  })

  it('cuộn ngược lên trả lại đúng khối trước đó', () => {
    expect(pickActive(at(2600), CUTOFF)).toBe('f')
    expect(pickActive(at(900), CUTOFF)).toBe('b')
    expect(pickActive(at(0), CUTOFF)).toBe('a')
  })

  it('khối trên vạch nhưng đã cuộn qua hẳn vẫn không được chọn thay khối sau', () => {
    // scroll 1600: a,b,c đều âm (đã cuộn qua), d ở −100 → chọn d, không phải a
    expect(pickActive(at(1600), CUTOFF)).toBe('d')
  })

  it('danh sách rỗng → null, không nổ', () => {
    expect(pickActive([], CUTOFF)).toBeNull()
  })

  it('một khối duy nhất luôn là khối đang xem', () => {
    expect(pickActive([{ id: 'x', top: 9999 }], CUTOFF)).toBe('x')
  })
})
