import { describe, expect, it } from 'vitest'
import { lastYearAmounts } from './lastYearSpend'

// Cây thử: cha `an` có hai con `com` và `cafe`; `nha` đứng một mình.
const parentOf = (id: string): string | null =>
  id === 'com' || id === 'cafe' ? 'an' : null

describe('lastYearAmounts', () => {
  it('mục lá giữ nguyên số của nó', () => {
    const m = lastYearAmounts([{ categoryId: 'nha', amount: 68_000 }], parentOf)
    expect(m.get('nha')).toBe(68_000)
  })

  it('cha nhận tổng các con — trần nhóm cũng phải có số năm ngoái', () => {
    const m = lastYearAmounts(
      [
        { categoryId: 'com', amount: 30_000 },
        { categoryId: 'cafe', amount: 5_000 },
      ],
      parentOf,
    )
    expect(m.get('an')).toBe(35_000)
    expect(m.get('com')).toBe(30_000)
  })

  it('cha có chi ghi thẳng thì cộng cả phần đó lẫn phần của con', () => {
    const m = lastYearAmounts(
      [
        { categoryId: 'an', amount: 2_000 },
        { categoryId: 'com', amount: 30_000 },
      ],
      parentOf,
    )
    expect(m.get('an')).toBe(32_000)
  })

  it('không có gì thì trả map rỗng', () => {
    expect(lastYearAmounts([], parentOf).size).toBe(0)
  })
})
