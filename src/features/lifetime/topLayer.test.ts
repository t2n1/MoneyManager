import { describe, expect, it } from 'vitest'
import { topLayer, type LayerState } from './topLayer'

/** Cả năm lớp TẮT — điểm khởi đầu cho mỗi ca, chỉ bật đúng lớp đang thử. */
const NONE: LayerState = { quick: false, pick: false, hints: false, drawer: false, sel: false }

describe('topLayer', () => {
  it('không lớp nào mở → none', () => {
    expect(topLayer(NONE)).toBe('none')
  })

  // Một ca mỗi lớp — khoá rằng MỖI lớp, đứng MỘT MÌNH, được nhận ra đúng tên.
  it('chỉ quick mở → quick', () => {
    expect(topLayer({ ...NONE, quick: true })).toBe('quick')
  })

  it('chỉ pick mở → pick', () => {
    expect(topLayer({ ...NONE, pick: true })).toBe('pick')
  })

  it('chỉ hints mở → hints', () => {
    expect(topLayer({ ...NONE, hints: true })).toBe('hints')
  })

  it('chỉ drawer mở → drawer', () => {
    expect(topLayer({ ...NONE, drawer: true })).toBe('drawer')
  })

  it('chỉ sel mở → sel', () => {
    expect(topLayer({ ...NONE, sel: true })).toBe('sel')
  })

  // Thứ tự ưu tiên — mỗi ca bật MỘT CẶP để khoá ai thắng ai, đúng bảng ở JSDoc `topLayer`.
  it('quick thắng mọi lớp khác — bảng chọn nhanh phủ cả trang', () => {
    expect(topLayer({ quick: true, pick: true, hints: true, drawer: true, sel: true })).toBe(
      'quick',
    )
  })

  // Đúng bug của Finding 3 (review 2026-09-09): đóng popover (pick) không được kéo theo
  // đóng cả panel (sel) — pick phải thắng sel khi cả hai cùng mở.
  it('pick thắng hints, drawer, sel — popover lồng trong panel phải đóng TRƯỚC panel', () => {
    expect(topLayer({ quick: false, pick: true, hints: true, drawer: true, sel: true })).toBe(
      'pick',
    )
  })

  it('hints thắng drawer và sel', () => {
    expect(topLayer({ quick: false, pick: false, hints: true, drawer: true, sel: true })).toBe(
      'hints',
    )
  })

  it('drawer thắng sel', () => {
    expect(topLayer({ quick: false, pick: false, hints: false, drawer: true, sel: true })).toBe(
      'drawer',
    )
  })

  it('sel chỉ thắng khi không còn lớp phủ nào khác — ưu tiên thấp nhất', () => {
    expect(topLayer({ quick: false, pick: false, hints: false, drawer: false, sel: true })).toBe(
      'sel',
    )
  })
})
