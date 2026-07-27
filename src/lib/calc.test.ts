import { describe, expect, it } from 'vitest'
import { appendKey, evalExpression } from './calc'

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

  it('tich qua lon (vuot nguong an toan) → null', () => {
    expect(evalExpression('999999999999×999999999999')).toBe(null)
  })
})

describe('appendKey', () => {
  it('không cho bắt đầu bằng dấu phép tính', () => {
    expect(appendKey('', '+')).toBe('')
    expect(appendKey('', '×')).toBe('')
  })

  it('gõ chữ số nối vào số hiện tại', () => {
    expect(appendKey('', '5')).toBe('5')
    expect(appendKey('5', '0')).toBe('50')
    expect(appendKey('12', '000')).toBe('12000')
  })

  it('nút 00 và 000 khi trống → một số 0', () => {
    expect(appendKey('', '00')).toBe('0')
    expect(appendKey('', '000')).toBe('0')
  })

  it('bỏ số 0 vô nghĩa ở đầu mỗi số', () => {
    expect(appendKey('0', '5')).toBe('5')
    expect(appendKey('5+0', '3')).toBe('5+3')
  })

  it('bấm dấu sau số → nối dấu', () => {
    expect(appendKey('5', '+')).toBe('5+')
    expect(appendKey('5+', '3')).toBe('5+3')
  })

  it('bấm 2 dấu liền nhau → thay dấu cuối', () => {
    expect(appendKey('5+', '×')).toBe('5×')
  })

  it('xóa lùi 1 ký tự (số hoặc dấu)', () => {
    expect(appendKey('5+3', '⌫')).toBe('5+')
    expect(appendKey('5+', '⌫')).toBe('5')
    expect(appendKey('5', '⌫')).toBe('')
  })

  it('chặn vượt 12 chữ số cho một số', () => {
    expect(appendKey('123456789012', '3')).toBe('123456789012')
  })

  it('chặn vượt độ dài tối đa của biểu thức', () => {
    const long = '9'.repeat(40)
    expect(appendKey(long, '1')).toBe(long)
  })
})
