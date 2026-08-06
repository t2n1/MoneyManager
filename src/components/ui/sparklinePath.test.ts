import { describe, expect, it } from 'vitest'
import { sparklinePath } from './sparklinePath'

describe('sparklinePath', () => {
  it('dưới hai điểm → null (một điểm không thành đường)', () => {
    expect(sparklinePath([5], 60, 20)).toBeNull()
    expect(sparklinePath([], 60, 20)).toBeNull()
  })

  it('điểm đầu ở mép trái, điểm cuối ở mép phải', () => {
    const d = sparklinePath([0, 10], 60, 20)
    expect(d).toMatch(/^M0,/)
    expect(d).toContain('L60,')
  })

  it('giá trị lớn nhất nằm trên đỉnh (y = 0)', () => {
    expect(sparklinePath([0, 10], 60, 20)).toContain('L60,0')
  })

  it('giá trị nhỏ nhất nằm dưới đáy (y = chiều cao)', () => {
    expect(sparklinePath([0, 10], 60, 20)).toContain('M0,20')
  })

  it('mọi giá trị bằng nhau → đường nằm giữa, không chia cho 0', () => {
    expect(sparklinePath([5, 5, 5], 60, 20)).toBe('M0,10 L30,10 L60,10')
  })

  it('số âm vẫn vẽ được — tài sản ròng có thể âm', () => {
    const d = sparklinePath([-100, 0, 100], 60, 20)
    expect(d).toBe('M0,20 L30,10 L60,0')
  })
})
