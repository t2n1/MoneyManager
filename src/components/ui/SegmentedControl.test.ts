import { describe, expect, it } from 'vitest'
import { SIZE, type SegmentedSize } from './SegmentedControl'

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
