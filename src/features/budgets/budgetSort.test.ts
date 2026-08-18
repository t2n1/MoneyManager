import { describe, expect, it } from 'vitest'
import type { CategoryRow } from '../../types/database.types'
import type { BudgetDisplayItem } from './budgetDisplay'
import {
  paceOf,
  pickAttention,
  remainingOf,
  sortBudgetItems,
  type BudgetSortMode,
} from './budgetSort'
import { statusOf, type BudgetLine } from './progress'

let seq = 0
function cat(p: Partial<CategoryRow> & Pick<CategoryRow, 'id'>): CategoryRow {
  seq += 1
  return {
    user_id: 'u',
    name: p.name ?? p.id,
    type: 'expense',
    icon: '📦',
    parent_id: null,
    sort_order: seq,
    is_archived: false,
    created_at: '',
    need_level: null,
    cost_type: null,
    kind: 'expense',
    ...p,
  }
}

function line(categoryId: string, budgeted: number, spent: number): BudgetLine {
  const ratio = budgeted > 0 ? spent / budgeted : 0
  return { categoryId, budgeted, carried: 0, spent, ratio, status: statusOf(ratio), isMarker: false }
}

/** Lá độc lập có hạn mức. `order` để đặt thứ tự Cài đặt cho rõ trong test. */
function leaf(
  id: string,
  budgeted: number,
  spent: number,
  p: Partial<CategoryRow> = {},
): BudgetDisplayItem {
  return { kind: 'leaf', cat: cat({ id, ...p }), line: line(id, budgeted, spent) }
}

/** Nhóm có trần ở cha; `children` là [id, chi, cost_type] của từng con. */
function group(
  id: string,
  budgeted: number,
  spent: number,
  children: [string, number, CategoryRow['cost_type']][] = [],
  p: Partial<CategoryRow> = {},
): BudgetDisplayItem {
  const ratio = budgeted > 0 ? spent / budgeted : 0
  return {
    kind: 'group',
    cat: cat({ id, ...p }),
    capped: true,
    budgeted,
    spent,
    carried: 0,
    ratio,
    status: statusOf(ratio),
    markerTotal: 0,
    children: children.map(([kid, kspent, cost_type]) => ({
      cat: cat({ id: kid, parent_id: id, cost_type }),
      spent: kspent,
      marker: null,
    })),
  }
}

const idsOf = (items: BudgetDisplayItem[]) => items.map((i) => i.cat.id)

describe('paceOf — nhịp tiêu so với phần tháng đã trôi', () => {
  it('tiêu 52% khi mới trôi 23% tháng → nhịp hơn 2 lần', () => {
    expect(paceOf(0.52, 0.23)).toBeCloseTo(2.26, 2)
  })

  it('tháng đã qua (trôi trọn) → nhịp đúng bằng phần trăm đã dùng', () => {
    expect(paceOf(0.52, 1)).toBeCloseTo(0.52, 5)
    expect(paceOf(1.06, 1)).toBeCloseTo(1.06, 5)
  })

  it('chưa trôi ngày nào → không chia cho 0, lấy thẳng phần trăm', () => {
    expect(paceOf(0.3, 0)).toBe(0.3)
  })
})

describe('remainingOf — tiền còn được tiêu', () => {
  it('chưa vượt → số dương', () => {
    expect(remainingOf(leaf('a', 119_860, 112_760))).toBe(7_100)
  })

  it('đã vượt → số âm bằng đúng phần vượt', () => {
    expect(remainingOf(leaf('b', 10_000, 10_550))).toBe(-550)
  })
})

describe('sortBudgetItems', () => {
  const mode = (m: BudgetSortMode) => m

  it('nhịp: mục tiêu nhanh hơn lên đầu dù phần trăm thấp hơn', () => {
    // Mới trôi 1/4 tháng. a dùng 52% (nhịp 2,08); b dùng 90% nhưng là tiền nhà
    // trả một lần — nhịp 3,6. Theo % thì b trước; theo nhịp cũng b trước.
    // Ca thật sự phân biệt: c dùng 30% (nhịp 1,2) vs d dùng 40% (nhịp 1,6).
    const items = [leaf('c', 100, 30), leaf('d', 100, 40)]
    expect(idsOf(sortBudgetItems(items, mode('pace'), 0.25))).toEqual(['d', 'c'])
  })

  it('nhịp ở tháng đã qua = sắp theo phần trăm như cũ', () => {
    const items = [leaf('lo', 100, 52), leaf('hi', 100, 106)]
    expect(idsOf(sortBudgetItems(items, mode('pace'), 1))).toEqual(['hi', 'lo'])
  })

  it('tiền: vượt ¥5.000 xếp trên vượt ¥1.000 dù phần trăm thấp hơn nhiều', () => {
    const small = leaf('small', 1_000, 2_000) // 200%, vượt 1.000
    const big = leaf('big', 100_000, 105_000) // 105%, vượt 5.000
    expect(idsOf(sortBudgetItems([small, big], mode('money'), 0.5))).toEqual(['big', 'small'])
  })

  it('tiền: chưa vượt thì mục còn ít tiền nhất lên trước', () => {
    const items = [leaf('nhieu', 50_000, 26_095), leaf('it', 119_860, 112_760)]
    expect(idsOf(sortBudgetItems(items, mode('money'), 0.5))).toEqual(['it', 'nhieu'])
  })

  it('cài đặt: giữ đúng thứ tự sort_order, chi bao nhiêu cũng không đổi chỗ', () => {
    const a = leaf('a', 100, 0, { sort_order: 1 })
    const b = leaf('b', 100, 200, { sort_order: 2 })
    const c = leaf('c', 100, 90, { sort_order: 3 })
    expect(idsOf(sortBudgetItems([c, b, a], mode('manual'), 0.5))).toEqual(['a', 'b', 'c'])
  })

  it('bằng điểm thì rơi về thứ tự Cài đặt, không xáo lung tung', () => {
    const a = leaf('a', 30_000, 0, { sort_order: 10 })
    const b = leaf('b', 30_000, 0, { sort_order: 20 })
    expect(idsOf(sortBudgetItems([b, a], mode('pace'), 0.5))).toEqual(['a', 'b'])
    expect(idsOf(sortBudgetItems([b, a], mode('money'), 0.5))).toEqual(['a', 'b'])
  })

  it('không sửa mảng gốc', () => {
    const items = [leaf('a', 100, 10), leaf('b', 100, 90)]
    const before = idsOf(items)
    sortBudgetItems(items, mode('pace'), 0.5)
    expect(idsOf(items)).toEqual(before)
  })
})

describe('pickAttention — khối "Cần để ý"', () => {
  it('mục vượt trần luôn vào khối', () => {
    const picked = pickAttention([leaf('over', 10_000, 10_550)], 0.5)
    expect(picked.map((p) => [p.item.cat.id, p.reason])).toEqual([['over', 'over']])
    expect(picked[0].over).toBe(550)
  })

  it('tiêu nhanh hơn nhịp tháng → vào khối với lý do "nhanh"', () => {
    // Trôi 1/4 tháng mà đã dùng 60% → nhịp 2,4
    const picked = pickAttention([leaf('fast', 10_000, 6_000)], 0.25)
    expect(picked.map((p) => [p.item.cat.id, p.reason])).toEqual([['fast', 'fast']])
  })

  it('đầu tháng tiêu lai rai → khối rỗng, không kêu oan', () => {
    // Ngày 2/31: dùng 10% trần. Nhịp cao nhưng mới tiêu có 1/10 → chưa đáng gọi.
    expect(pickAttention([leaf('quiet', 30_000, 3_000)], 2 / 31)).toEqual([])
  })

  it('chi cố định đã trả xong (tiền nhà 94%) KHÔNG vào khối', () => {
    const rent = leaf('rent', 119_860, 112_760, { cost_type: 'fixed' })
    expect(pickAttention([rent], 0.23)).toEqual([])
  })

  it('nhưng chi cố định VƯỢT trần thì vẫn phải biết', () => {
    const rent = leaf('rent', 100_000, 105_000, { cost_type: 'fixed' })
    expect(pickAttention([rent], 0.23).map((p) => p.reason)).toEqual(['over'])
  })

  it('nhóm mà phần lớn tiền đã chi là cố định → coi như cố định, không kêu', () => {
    // Nhà ở: 8 mục con, tiền nhà + điện nước chiếm 90% chi của nhóm.
    const nhao = group('nhao', 119_860, 112_760, [
      ['thue-nha', 95_000, 'fixed'],
      ['dien-nuoc', 6_500, 'fixed'],
      ['do-dung', 11_260, 'variable'],
    ])
    expect(pickAttention([nhao], 0.23)).toEqual([])
  })

  it('nhóm mà chi cố định chỉ chiếm phần nhỏ → vẫn kêu khi tiêu nhanh', () => {
    const anuong = group('anuong', 50_000, 30_000, [
      ['gao', 3_000, 'fixed'],
      ['an-ngoai', 27_000, 'variable'],
    ])
    expect(pickAttention([anuong], 0.25).map((p) => p.reason)).toEqual(['fast'])
  })

  it('vượt trần xếp trên tiêu nhanh; trong nhóm vượt thì vượt nhiều tiền lên trước', () => {
    const fast = leaf('fast', 10_000, 6_000)
    const overSmall = leaf('overSmall', 1_000, 1_500) // vượt 500
    const overBig = leaf('overBig', 20_000, 25_000) // vượt 5.000
    const picked = pickAttention([fast, overSmall, overBig], 0.25)
    expect(picked.map((p) => p.item.cat.id)).toEqual(['overBig', 'overSmall', 'fast'])
  })

  it('mục chưa tiêu đồng nào không bao giờ vào khối', () => {
    expect(pickAttention([leaf('zero', 30_000, 0)], 0.9)).toEqual([])
  })
})
