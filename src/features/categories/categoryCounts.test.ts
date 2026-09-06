import { describe, expect, it } from 'vitest'
import { categoryCounts } from './categoryCounts'

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
