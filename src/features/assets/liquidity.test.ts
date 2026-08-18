import { describe, expect, it } from 'vitest'
import {
  LIQUID_BY_TYPE,
  inferredCount,
  isLiquidAccount,
  isLiquidityInferred,
  needsLiquidityAnswer,
} from './liquidity'

describe('isLiquidAccount', () => {
  it('chưa đặt cờ → suy từ loại, giữ ĐÚNG danh sách cũ', () => {
    expect(LIQUID_BY_TYPE).toEqual(['cash', 'bank', 'ic', 'ewallet'])
    for (const type of LIQUID_BY_TYPE) {
      expect(isLiquidAccount({ type })).toBe(true)
    }
    expect(isLiquidAccount({ type: 'investment' })).toBe(false)
    expect(isLiquidAccount({ type: 'fixed' })).toBe(false)
    expect(isLiquidAccount({ type: 'card' })).toBe(false)
  })

  it('ca thật cột này được thêm để sửa: tiền gửi CÓ KỲ HẠN là bank nhưng không rút ngay', () => {
    expect(isLiquidAccount({ type: 'bank' })).toBe(true) // phép suy nói có
    expect(isLiquidAccount({ type: 'bank', is_liquid: false })).toBe(false) // người dùng nói không
  })

  it('cờ thắng phép suy ở CẢ HAI chiều', () => {
    // Ví chứng khoán rút T+0: loại là investment nhưng thật sự rút được.
    expect(isLiquidAccount({ type: 'investment', is_liquid: true })).toBe(true)
  })

  it('null và undefined đều là "chưa đặt", không phải false', () => {
    expect(isLiquidAccount({ type: 'bank', is_liquid: null })).toBe(true)
    expect(isLiquidAccount({ type: 'bank', is_liquid: undefined })).toBe(true)
  })
})

describe('isLiquidityInferred', () => {
  it('phân biệt được ĐANG ĐOÁN với ĐÃ BIẾT — kể cả khi hai bên ra cùng kết quả', () => {
    // Cùng trả về true, nhưng một cái là phép suy còn một cái là người dùng xác nhận.
    expect(isLiquidAccount({ type: 'bank' })).toBe(isLiquidAccount({ type: 'bank', is_liquid: true }))
    expect(isLiquidityInferred({ type: 'bank' })).toBe(true)
    expect(isLiquidityInferred({ type: 'bank', is_liquid: true })).toBe(false)
  })

  it('đặt `false` cũng là đã biết', () => {
    expect(isLiquidityInferred({ type: 'bank', is_liquid: false })).toBe(false)
  })
})

describe('inferredCount', () => {
  it('đếm số tài khoản còn để app suy hộ', () => {
    expect(
      inferredCount([
        { type: 'bank' },
        { type: 'bank', is_liquid: false },
        { type: 'cash' },
        { type: 'investment', is_liquid: true },
      ]),
    ).toBe(2)
  })

  it('mọi tài khoản đã xác nhận → 0', () => {
    expect(inferredCount([{ type: 'bank', is_liquid: true }])).toBe(0)
  })

  it('danh sách rỗng → 0', () => {
    expect(inferredCount([])).toBe(0)
  })

  it('KHÔNG đếm thẻ tín dụng — form không hỏi nên đếm vào là lời nhắc không tắt được', () => {
    // Thẻ là nợ, không nằm trong LIQUID_BY_TYPE, nên cờ của nó không đổi con số nào. Đếm nó
    // thì người dùng khai hết mọi chỗ khai được mà cảnh báo vẫn đứng ở 1.
    expect(inferredCount([{ type: 'card' }])).toBe(0)
    expect(inferredCount([{ type: 'card' }, { type: 'bank' }])).toBe(1)
  })
})

describe('needsLiquidityAnswer', () => {
  it('chưa khai + không phải thẻ → cần trả lời', () => {
    expect(needsLiquidityAnswer({ type: 'bank' })).toBe(true)
    expect(needsLiquidityAnswer({ type: 'investment' })).toBe(true)
    expect(needsLiquidityAnswer({ type: 'fixed' })).toBe(true)
  })

  it('đã khai → không cần, cả hai chiều', () => {
    expect(needsLiquidityAnswer({ type: 'bank', is_liquid: true })).toBe(false)
    expect(needsLiquidityAnswer({ type: 'bank', is_liquid: false })).toBe(false)
  })

  it('thẻ tín dụng thì chưa khai cũng KHÔNG cần', () => {
    expect(needsLiquidityAnswer({ type: 'card' })).toBe(false)
    // Vẫn là "đang đoán" theo nghĩa nguyên văn — hai phép hỏi khác nhau, giữ riêng.
    expect(isLiquidityInferred({ type: 'card' })).toBe(true)
  })
})
