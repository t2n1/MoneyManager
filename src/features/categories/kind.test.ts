import { describe, expect, it } from 'vitest'
import type { CategoryRow } from '../../types/database.types'
import { NO_TRANSFER_CATEGORIES, isBudgetableCategory, transferCategoryIds } from './kind'

const cat = (id: string, kind: CategoryRow['kind']) => ({ id, kind })

describe('transferCategoryIds', () => {
  it('chỉ lấy kind = transfer', () => {
    const ids = transferCategoryIds([
      cat('an', 'expense'),
      cat('gui-vn', 'transfer'),
      cat('dieu-chinh', 'transfer'),
    ])
    expect([...ids].sort()).toEqual(['dieu-chinh', 'gui-vn'])
  })

  it('không có danh mục transfer → trả về ĐÚNG hằng số rỗng dùng chung', () => {
    // Cùng tham chiếu, không phải Set mới: nơi gọi đưa nó vào mảng phụ thuộc của
    // useMemo, và một Set mới mỗi render làm mọi memo phía dưới tính lại.
    expect(transferCategoryIds([cat('an', 'expense')])).toBe(NO_TRANSFER_CATEGORIES)
    expect(transferCategoryIds([])).toBe(NO_TRANSFER_CATEGORIES)
  })
})

describe('isBudgetableCategory', () => {
  it('danh mục chuyển tài sản KHÔNG đặt được hạn mức', () => {
    expect(isBudgetableCategory(cat('gui-vn', 'transfer'))).toBe(false)
    expect(isBudgetableCategory(cat('an', 'expense'))).toBe(true)
  })
})
