import { describe, expect, it } from 'vitest'
import { portfolioKindOf } from './useAccountPortfolio'

const tk = (
  type: string,
  currency: string,
  is_archived = false,
): Parameters<typeof portfolioKindOf>[0] =>
  ({ type, currency, is_archived }) as Parameters<typeof portfolioKindOf>[0]

describe('portfolioKindOf', () => {
  it('đầu tư VND có sổ lệnh → engine cổ phiếu', () => {
    expect(portfolioKindOf(tk('investment', 'VND'), 3)).toBe('stocks')
  })

  it('đầu tư JPY có sổ lệnh → engine quỹ', () => {
    expect(portfolioKindOf(tk('investment', 'JPY'), 3)).toBe('funds')
  })

  it('đầu tư loại tiền khác → null, vì không có bảng giá nào cho nó', () => {
    expect(portfolioKindOf(tk('investment', 'USD'), 3)).toBeNull()
  })

  it('chưa có lệnh nào → null, để trang rơi về định giá nhập tay', () => {
    expect(portfolioKindOf(tk('investment', 'VND'), 0)).toBeNull()
  })

  it('không phải tài khoản đầu tư → null', () => {
    expect(portfolioKindOf(tk('bank', 'JPY'), 3)).toBeNull()
    expect(portfolioKindOf(tk('fixed', 'JPY'), 3)).toBeNull()
  })

  it('đã lưu trữ → null: hai tab của trang Đầu tư không nhận tài khoản lưu trữ, nên link "Xem" sẽ dẫn tới một bộ lọc bị bỏ qua', () => {
    expect(portfolioKindOf(tk('investment', 'VND', true), 3)).toBeNull()
  })

  it('không có tài khoản (đang tải) → null', () => {
    expect(portfolioKindOf(undefined, 3)).toBeNull()
  })
})
