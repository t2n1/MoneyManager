import { describe, expect, it } from 'vitest'
import { limitBarParts, splitGrow } from './limitBarParts'

describe('limitBarParts', () => {
  it('chưa vượt → một khối tô đúng phần trăm', () => {
    expect(limitBarParts(0.42)).toEqual({ kind: 'fill', pct: 42 })
  })

  it('chạm đúng trần → thanh đầy, KHÔNG có phần vượt', () => {
    expect(limitBarParts(1)).toEqual({ kind: 'fill', pct: 100 })
  })

  it('vượt → phần trong trần = trần / đã chi, phần vượt là phần còn lại', () => {
    // Bản vẽ Bản tin: 33,2万 / 28万
    const p = limitBarParts(332 / 280)
    expect(p.kind).toBe('split')
    if (p.kind !== 'split') return
    expect(p.solid).toBeCloseTo(280 / 332, 6)
    expect(p.solid + p.rest).toBeCloseTo(1, 9)
  })

  it('vượt gấp đôi → nửa đặc, nửa sọc', () => {
    expect(limitBarParts(2)).toEqual({ kind: 'split', solid: 0.5, rest: 0.5 })
  })

  it('0, âm, NaN → thanh rỗng', () => {
    expect(limitBarParts(0)).toEqual({ kind: 'fill', pct: 0 })
    expect(limitBarParts(-0.3)).toEqual({ kind: 'fill', pct: 0 })
    expect(limitBarParts(Number.NaN)).toEqual({ kind: 'fill', pct: 0 })
  })

  it('vô cực (trần 0 mà đã chi) → toàn bộ là phần vượt', () => {
    expect(limitBarParts(Infinity)).toEqual({ kind: 'split', solid: 0, rest: 1 })
  })
})

describe('splitGrow', () => {
  it('giữ đúng tỷ lệ giữa hai phần', () => {
    const g = splitGrow(0.84, 0.16)
    expect(g.solid / g.rest).toBeCloseTo(0.84 / 0.16, 9)
  })

  it('cả hai hệ số ≥ 1 — phần đứng một mình (Sáng/Tối ẩn phần vượt) luôn đầy thanh', () => {
    for (const [s, r] of [[0.84, 0.16], [0.5, 0.5], [0.001, 0.999], [0.999, 0.001]]) {
      const g = splitGrow(s, r)
      expect(Math.min(g.solid, g.rest)).toBeCloseTo(1, 9)
    }
  })

  it('một phần bằng 0 (trần 0) → không chia cho 0', () => {
    expect(splitGrow(0, 1)).toEqual({ solid: 0, rest: 1 })
  })
})
