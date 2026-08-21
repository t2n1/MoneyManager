import { describe, expect, it } from 'vitest'
import type { CategoryRow } from '../../types/database.types'
import { budgetHint } from './budgetHint'

let seq = 0
const cat = (p: Partial<CategoryRow> & Pick<CategoryRow, 'id' | 'name'>): CategoryRow => ({
  user_id: 'u', type: 'expense', icon: '📦', parent_id: null, sort_order: ++seq,
  is_archived: false, created_at: '', need_level: null, cost_type: null, kind: 'expense', ...p,
})

const look = cat({ id: 'look', name: 'Ngoại hình' })
const haircut = cat({ id: 'haircut', name: 'Cắt tóc', parent_id: 'look' })
const gone = cat({ id: 'gone', name: 'Mục cũ', parent_id: 'rent', is_archived: true })
const rent = cat({ id: 'rent', name: 'Nhà' })
const cats = [look, haircut, rent, gone]

const withCap = (...ids: string[]) => (id: string) => ids.includes(id)

describe('budgetHint', () => {
  it('con của nhóm ĐÃ có trần → nói rõ đây chỉ là mốc theo dõi', () => {
    expect(budgetHint('haircut', cats, withCap('look'))).toBe(
      'Chỉ là mốc theo dõi bên trong trần của Ngoại hình — không cộng thêm vào trần đó, cũng không cộng vào tổng ngân sách.',
    )
  })

  it('con của nhóm CHƯA có trần → nói rõ nó tính vào tổng', () => {
    expect(budgetHint('haircut', cats, withCap())).toBe(
      'Ngoại hình chưa có trần chung, nên hạn mức này tính vào tổng ngân sách. Trần của nhóm = tổng hạn mức các mục con.',
    )
  })

  it('cha có con → nói rõ đây là trần chung', () => {
    expect(budgetHint('look', cats, withCap())).toBe(
      'Trần chung cho cả nhóm: tính mọi khoản chi của các mục con và chi ghi thẳng vào nhóm.',
    )
  })

  it('lá độc lập → không cần câu nào', () => {
    // 'gone' là con duy nhất của 'rent' nhưng đã lưu trữ → 'rent' vẫn là lá.
    expect(budgetHint('rent', cats, withCap())).toBeUndefined()
  })

  it('danh mục không có trong danh sách → không bịa câu', () => {
    expect(budgetHint('khong-co', cats, withCap())).toBeUndefined()
  })
})
