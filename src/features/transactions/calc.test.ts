import { describe, expect, it } from 'vitest'
import { evalExpression } from './calc'

describe('evalExpression', () => {
  it('biểu thức trống → 0', () => {
    expect(evalExpression('')).toBe(0)
  })

  it('một số đơn → chính nó', () => {
    expect(evalExpression('1200')).toBe(1200)
  })

  it('cộng, trừ, nhân, chia cơ bản', () => {
    expect(evalExpression('1200+800')).toBe(2000)
    expect(evalExpression('2000−500')).toBe(1500)
    expect(evalExpression('500×3')).toBe(1500)
    expect(evalExpression('1000÷4')).toBe(250)
  })

  it('chia lẻ → làm tròn số học', () => {
    expect(evalExpression('1000÷3')).toBe(333)
    expect(evalExpression('100÷8')).toBe(13) // 12,5 làm tròn lên
  })

  it('tính lần lượt trái sang phải, không ưu tiên nhân chia', () => {
    expect(evalExpression('1200+800×2')).toBe(4000) // (1200+800)×2
  })

  it('bỏ dấu phép tính thừa ở cuối', () => {
    expect(evalExpression('1200+')).toBe(1200)
    expect(evalExpression('1200+800+')).toBe(2000)
  })

  it('chia cho 0 → null', () => {
    expect(evalExpression('100÷0')).toBe(null)
  })

  it('chỉ có dấu → 0', () => {
    expect(evalExpression('+')).toBe(0)
    expect(evalExpression('×')).toBe(0)
  })

  it('cho phép kết quả âm', () => {
    expect(evalExpression('100−500')).toBe(-400)
  })
})
