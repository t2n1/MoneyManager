import { describe, expect, it } from 'vitest'
import {
  concentrationVerdict,
  TOP_HEAVY,
  TOP_TWO_HEAVY,
  type WeighedPosition,
} from './concentration'

const p = (symbol: string, weight: number, price: number | null = 1000): WeighedPosition => ({
  symbol,
  weight,
  price,
})

describe('concentrationVerdict', () => {
  it('không giữ mã nào → không phán gì', () => {
    expect(concentrationVerdict([])).toBeNull()
  })

  // Cái bẫy chính: một mã thì tỷ trọng luôn 100%, và "một mã chiếm 100%, đáng biết
  // trước khi mua thêm" là nói lại điều người ta vừa làm.
  it('chỉ một mã thì KHÔNG cảnh báo tập trung', () => {
    const v = concentrationVerdict([p('FPT', 1)])
    expect(v?.level).toBe('single')
    expect(v?.text).not.toMatch(/đáng biết/)
  })

  it('một mã nặng → câu của 21a', () => {
    const v = concentrationVerdict([p('FPT', 0.46), p('MWG', 0.34), p('VNM', 0.2)])
    expect(v?.level).toBe('top-heavy')
    expect(v?.text).toContain('FPT')
    expect(v?.text).toContain('46,0%')
    expect(v?.text).toContain('đáng biết trước khi mua thêm')
  })

  it('không mã nào áp đảo nhưng hai mã đầu gánh gần hết', () => {
    const v = concentrationVerdict([p('FPT', 0.38), p('MWG', 0.36), p('VNM', 0.26)])
    expect(v?.level).toBe('two-heavy')
    expect(v?.text).toContain('FPT và MWG')
    expect(v?.text).toContain('74,0%')
  })

  it('chia rộng → chỉ nói mã nặng nhất', () => {
    const v = concentrationVerdict([p('A', 0.3), p('B', 0.25), p('C', 0.25), p('D', 0.2)])
    expect(v?.level).toBe('spread')
    expect(v?.text).toContain('4 mã')
    expect(v?.text).not.toMatch(/đáng biết/)
  })

  it('đúng bằng ngưỡng là ĐÃ tính', () => {
    expect(concentrationVerdict([p('A', TOP_HEAVY), p('B', 1 - TOP_HEAVY)])?.level).toBe(
      'top-heavy',
    )
    // Hai mã dưới ngưỡng một-mã nhưng cộng lại đúng ngưỡng hai-mã.
    const a = TOP_TWO_HEAVY / 2
    expect(concentrationVerdict([p('A', a), p('B', a), p('C', 1 - TOP_TWO_HEAVY)])?.level).toBe(
      'two-heavy',
    )
  })

  it('sắp lại theo tỷ trọng, không tin thứ tự người gọi đưa vào', () => {
    const v = concentrationVerdict([p('NHO', 0.2), p('TO', 0.5), p('VUA', 0.3)])
    expect(v?.text).toContain('TO một mình')
  })

  // Thiếu giá thì buildPortfolio tạm định giá bằng giá vốn — tỷ trọng vẫn tính được
  // nhưng là số hỗn hợp, và nơi hiển thị phải gắn dấu ước tính.
  it('mã thiếu giá → cờ estimated, câu phán vẫn ra', () => {
    const v = concentrationVerdict([p('FPT', 0.6), p('HPG', 0.4, null)])
    expect(v?.estimated).toBe(true)
    expect(v?.level).toBe('top-heavy')
  })

  it('đủ giá mọi mã → không phải số ước tính', () => {
    expect(concentrationVerdict([p('A', 0.6), p('B', 0.4)])?.estimated).toBe(false)
  })
})
