import { describe, expect, it } from 'vitest'
import { SIZE, type SegmentedSize } from './SegmentedControl'

describe('bang co cua SegmentedControl', () => {
  it('lg dung py-3 = 44px — co cho control CHINH cua mot man', () => {
    expect(SIZE.lg.item).toContain('py-3')
    expect(SIZE.lg.item).not.toContain('py-2.5')
  })

  it('md GIU py-2.5 — 11 file khac dang dung, doi la doi chieu cao 11 man', () => {
    expect(SIZE.md.item).toContain('py-2.5')
  })

  it('ba co, khong hon', () => {
    expect(Object.keys(SIZE).sort()).toEqual(['lg', 'md', 'sm'] satisfies SegmentedSize[])
  })
})
