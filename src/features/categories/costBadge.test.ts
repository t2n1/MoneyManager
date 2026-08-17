import { describe, expect, it } from 'vitest'
import { categoryCounts, costBadge, missingCostCount } from './costBadge'

describe('costBadge', () => {
  it('gắn rồi thì nói đúng cái đã gắn', () => {
    expect(costBadge({ type: 'expense', costType: 'fixed', isFlow: false })).toEqual({
      text: 'CỐ ĐỊNH',
      missing: false,
    })
    expect(costBadge({ type: 'expense', costType: 'variable', isFlow: false })).toEqual({
      text: 'BIẾN ĐỔI',
      missing: false,
    })
  })

  it('chưa gắn thì nói ra, và đánh dấu là việc cần làm', () => {
    const b = costBadge({ type: 'expense', costType: null, isFlow: false })
    expect(b).toEqual({ text: 'CHƯA GẮN', missing: true })
  })

  // Hai ca dưới đây là lý do hàm này tồn tại thay vì một ternary trong JSX: nếu vẽ nhãn
  // cho mọi dòng thì danh sách đầy "CHƯA GẮN" ở những chỗ vốn không cần gắn, và một nhãn
  // vàng xuất hiện khắp nơi thì nhanh chóng thành nhãn để bỏ qua.
  it('danh mục THU không có nhãn — câu hỏi cố-định-hay-biến-đổi không áp vào lương', () => {
    expect(costBadge({ type: 'income', costType: null, isFlow: false })).toBeNull()
    expect(costBadge({ type: 'income', costType: 'fixed', isFlow: false })).toBeNull()
  })

  it('danh mục DÒNG CHẢY không có nhãn — 22e ghi rõ chúng không phải chi tiêu', () => {
    expect(costBadge({ type: 'expense', costType: null, isFlow: true })).toBeNull()
    expect(costBadge({ type: 'expense', costType: 'variable', isFlow: true })).toBeNull()
  })
})

describe('categoryCounts', () => {
  const c = (type: string, parent_id: string | null = null) => ({ type, parent_id })

  it('đếm danh mục CHA, không đếm con', () => {
    expect(
      categoryCounts([
        c('expense'),
        c('expense', 'p1'),
        c('expense', 'p1'),
        c('expense'),
        c('income'),
      ]),
    ).toEqual({ expense: 2, income: 1 })
  })

  it('danh sách rỗng → 0/0, không phải NaN', () => {
    expect(categoryCounts([])).toEqual({ expense: 0, income: 0 })
  })

  it('chỉ có con mồ côi thì không đếm nhầm thành cha', () => {
    expect(categoryCounts([c('expense', 'mat-cha')])).toEqual({ expense: 0, income: 0 })
  })
})

describe('missingCostCount', () => {
  const isFlow = (c: { name: string }) => c.name === 'Trả nợ'
  const c = (name: string, type: string, cost_type: 'fixed' | 'variable' | null) => ({
    name,
    type,
    cost_type,
  })

  it('đếm đúng những dòng CẦN gắn mà chưa gắn', () => {
    expect(
      missingCostCount(
        [
          c('Tiền nhà', 'expense', 'fixed'),
          c('Đồ bếp', 'expense', null),
          c('Gas', 'expense', null),
          c('Lương', 'income', null), // thu — không cần gắn
          c('Trả nợ', 'expense', null), // dòng chảy — không cần gắn
        ],
        isFlow,
      ),
    ).toBe(2)
  })

  it('gắn hết rồi → 0, tức dòng cảnh báo tự tắt', () => {
    expect(
      missingCostCount([c('a', 'expense', 'fixed'), c('b', 'expense', 'variable')], isFlow),
    ).toBe(0)
  })
})
