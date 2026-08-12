import { describe, expect, it } from 'vitest'
import { isAutoAssignedCategory, isFlowCategory, pickableCategories } from './flowCategories'

const cat = (id: string, name: string, type: 'expense' | 'income' = 'expense') => ({
  id,
  name,
  type,
  is_archived: false,
})

describe('isFlowCategory', () => {
  it('nhận đủ 4 danh mục dòng nợ + điều chỉnh số dư', () => {
    for (const n of ['Cho vay', 'Đi vay', 'Thu nợ', 'Trả nợ', 'Điều chỉnh số dư']) {
      expect(isFlowCategory({ name: n })).toBe(true)
    }
  })

  it('danh mục thường thì không', () => {
    for (const n of ['Ăn uống', 'Gửi tiền về VN', 'Phí chuyển tiền', 'Khác']) {
      expect(isFlowCategory({ name: n })).toBe(false)
    }
  })
})

describe('isAutoAssignedCategory', () => {
  // "Gửi tiền về VN" KHÁC dòng chảy: tiền đi thật, có vào báo cáo và ngân sách.
  // Chỉ giống ở chỗ app tự gán khi lưu nên không cần bày ra lưới chọn tay.
  it('gồm cả dòng chảy lẫn Gửi tiền về VN', () => {
    expect(isAutoAssignedCategory({ name: 'Cho vay' })).toBe(true)
    expect(isAutoAssignedCategory({ name: 'Gửi tiền về VN' })).toBe(true)
    expect(isAutoAssignedCategory({ name: 'Ăn uống' })).toBe(false)
  })
})

describe('pickableCategories', () => {
  const all = [
    cat('food', 'Ăn uống'),
    cat('lend', 'Cho vay'),
    cat('remit', 'Gửi tiền về VN'),
    cat('adjust', 'Điều chỉnh số dư'),
    cat('salary', 'Lương', 'income'),
    cat('borrow', 'Đi vay', 'income'),
  ]

  it('lưới Chi bỏ hết danh mục tự gán', () => {
    expect(pickableCategories(all, 'expense', null).map((c) => c.id)).toEqual(['food'])
  })

  it('lưới Thu cũng bỏ (Đi vay / Thu nợ)', () => {
    expect(pickableCategories(all, 'income', null).map((c) => c.id)).toEqual(['salary'])
  })

  it('bỏ danh mục đã lưu trữ', () => {
    const list = [...all, { ...cat('old', 'Cũ'), is_archived: true }]
    expect(pickableCategories(list, 'expense', null).map((c) => c.id)).toEqual(['food'])
  })

  it('giữ lại danh mục của giao dịch đang sửa, dù là tự gán', () => {
    expect(pickableCategories(all, 'expense', 'lend').map((c) => c.id)).toEqual(['food', 'lend'])
  })

  it('không nhân đôi khi danh mục đang sửa vốn đã hiện', () => {
    expect(pickableCategories(all, 'expense', 'food').map((c) => c.id)).toEqual(['food'])
  })

  it('bỏ qua keepId khác loại — lưới Chi không kéo danh mục Thu vào', () => {
    expect(pickableCategories(all, 'expense', 'borrow').map((c) => c.id)).toEqual(['food'])
  })
})
