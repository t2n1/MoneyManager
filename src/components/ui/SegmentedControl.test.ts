import { describe, expect, it } from 'vitest'
import { SIZE, stretchClasses, type SegmentedSize } from './SegmentedControl'

describe('bang co cua SegmentedControl', () => {
  it('lg dung py-3 → 46px (vua qua 44px floor) — co cho control CHINH cua mot man', () => {
    // 46px = py-3 (12px×2) + text-sm line-height (20px) + border (1px×2)
    // (button có border border-transparent trên+dưới)
    expect(SIZE.lg.item).toContain('py-3')
  })

  it('md GIU py-2.5 — 11 file khac dang dung, doi la doi chieu cao 11 man', () => {
    expect(SIZE.md.item).toContain('py-2.5')
  })

  it('ba co, khong hon', () => {
    expect(Object.keys(SIZE).sort()).toEqual(['lg', 'md', 'sm'] satisfies SegmentedSize[])
  })
})

describe('be ngang cua SegmentedControl', () => {
  it('co theo chu thi track w-fit — khong de vien keo het hang', () => {
    // Đây là cái sửa được /so và /reports ở 1920px: thiếu w-fit thì mục co lại
    // xong, còn hộp viền vẫn dài hết hàng và bọc quanh một dải trống.
    expect(stretchClasses(false).track).toBe('w-fit')
    expect(stretchClasses(false).item).toContain('shrink-0')
  })

  it('gian thi item flex-1 va track KHONG chot be ngang', () => {
    expect(stretchClasses(true).item).toContain('flex-1')
    expect(stretchClasses(true).track).toBe('')
  })

  it('lg: gian o dien thoai, co tu desktop — che do cua dai tab cap trang', () => {
    // Bốn tab của Báo cáo co theo chữ đo được 326px; nhân cỡ chữ 1.25 ra ~408px, quá
    // 296px còn lại của màn 320px. Nên mobile PHẢI giãn, chỉ lg mới co.
    const lg = stretchClasses('lg')
    expect(lg.item).toContain('flex-1')
    expect(lg.item).toContain('lg:flex-none')
    expect(lg.track).toBe('lg:w-fit')
  })

  it('co theo chu thi padding ngang RONG hon — luc do padding la thu duy nhat tach hai nhan', () => {
    expect(stretchClasses(false).item).toContain('px-3')
    expect(stretchClasses(true).item).toContain('px-1')
  })

  it('bang SIZE khong con padding ngang — no thuoc cach gian, khong thuoc co', () => {
    // Nếu cả hai chỗ đều đặt px-* thì thứ tự trong file CSS sinh ra quyết định cái
    // nào thắng — một cuộc tranh chấp im lặng. Chỉ một chỗ được đặt.
    for (const size of Object.keys(SIZE) as SegmentedSize[]) {
      expect(SIZE[size].item).not.toContain('px-')
    }
  })
})
