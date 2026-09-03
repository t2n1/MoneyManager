import { describe, expect, it } from 'vitest'
import type { BudgetRow, CategoryRow } from '../../types/database.types'
import { axisProgress, axisSlices } from './axisTargets'
import { BUDGET_METHODS, type BudgetMethod } from './budgetMethods'
import { buildBudgetDisplay } from './budgetDisplay'
import { coverageGaps } from './commitments'
import { planGroups } from './planGroups'
import { plannedSlices } from './planning'
import { buildBudgetReport } from './progress'
import { classificationBreakdown } from '../reports/aggregate'

const M503020 = BUDGET_METHODS.find((m) => m.id === '50-30-20')!

function cat(p: Partial<CategoryRow> & Pick<CategoryRow, 'id'>): CategoryRow {
  return {
    id: p.id,
    user_id: 'u',
    name: p.name ?? p.id,
    type: p.type ?? 'expense',
    icon: p.icon ?? '📦',
    parent_id: p.parent_id ?? null,
    sort_order: p.sort_order ?? 0,
    is_archived: p.is_archived ?? false,
    created_at: '',
    need_level: p.need_level ?? null,
    cost_type: p.cost_type ?? null,
    kind: p.kind ?? 'expense',
  }
}

function bud(categoryId: string, amount: number): BudgetRow {
  return {
    id: `b-${categoryId}`,
    user_id: 'u',
    category_id: categoryId,
    month_key: '2026-09',
    amount,
    rollover: false,
    created_at: '',
    updated_at: '',
  }
}

const CATS = [
  // Nhóm CÓ trần cha + hai mục con, một con mang mốc riêng.
  cat({ id: 'nhao', name: 'Nhà ở', sort_order: 1 }),
  cat({ id: 'tiennha', name: 'Tiền nhà', parent_id: 'nhao', need_level: 'essential', sort_order: 2 }),
  cat({ id: 'dodung', name: 'Đồ dùng', parent_id: 'nhao', need_level: 'flexible', sort_order: 3 }),
  // Nhóm CHƯA có trần cha, các con tự có hạn mức.
  cat({ id: 'ngoaihinh', name: 'Ngoại hình', sort_order: 4 }),
  cat({ id: 'cattoc', name: 'Cắt tóc', parent_id: 'ngoaihinh', need_level: 'flexible', sort_order: 5 }),
  cat({ id: 'quanao', name: 'Quần áo', parent_id: 'ngoaihinh', need_level: 'flexible', sort_order: 6 }),
  // Lá độc lập.
  cat({ id: 'dien', name: 'Điện', need_level: 'essential', sort_order: 7 }),
  cat({ id: 'gas', name: 'Gas', need_level: 'essential', sort_order: 8 }),
  cat({ id: 'comngoai', name: 'Cơm ngoài', sort_order: 9 }),
  // Nhãn `giving` — chỉ JARS/70-20-10/Kakeibo mới có khoản riêng cho nó.
  cat({ id: 'quatang', name: 'Quà tặng', need_level: 'giving', sort_order: 10 }),
]

const parentOf = (id: string) => CATS.find((c) => c.id === id)?.parent_id ?? null

/** Dựng đúng chuỗi mà `usePlanning` dùng: báo cáo spent = 0 → cây hiển thị → khối. */
function build(
  budgets: BudgetRow[],
  committed = new Map<string, number>(),
  pinned: { categoryId: string; limit: number } | null = null,
  method: BudgetMethod = M503020,
) {
  const report = buildBudgetReport(budgets, [], () => 'JPY', 'JPY', {}, parentOf)
  const items = buildBudgetDisplay(
    [...CATS].sort((a, b) => a.sort_order - b.sort_order),
    report,
  ).items
  const slices = plannedSlices(budgets, parentOf)
  const budgetedByCat = new Map(budgets.map((b) => [b.category_id, b.amount]))
  const axis = axisProgress(
    290_000,
    classificationBreakdown(slices.counted, CATS),
    method,
    null,
    axisSlices(slices.counted, CATS, method),
  )
  const gaps = coverageGaps(committed, budgetedByCat, parentOf)
  return {
    groups: planGroups({
      items,
      categories: CATS,
      suggestions: new Map(),
      committedByCat: committed,
      gaps,
      axis,
      markerSlices: slices.markers,
      pinned,
      method,
    }),
    axis,
    gaps,
  }
}

/** Mọi dòng in ra, kể cả trong đuôi gấp và mốc con lồng bên trong nhóm. */
const everyId = (groups: ReturnType<typeof build>['groups']): string[] =>
  groups.blocks.flatMap((b) =>
    [...b.rows, ...b.tail].flatMap((r) => [r.cat.id, ...r.markers.map((m) => m.cat.id)]),
  )

describe('planGroups · trần nhóm phải có dòng (B30.6)', () => {
  it('nhóm có trần cha ra MỘT dòng, không biến mất', () => {
    // Bản trước lọc `!categories.some(k => k.parent_id === c.id)` — chỉ lá — nên cảnh báo
    // "Trần nhóm Nhà ở đang ¥0" trỏ tới một cái tên không có dòng nào trong danh sách.
    const { groups } = build([bud('nhao', 120_000)])
    const rows = groups.blocks.flatMap((b) => [...b.rows, ...b.tail])
    expect(rows.filter((r) => r.cat.id === 'nhao')).toHaveLength(1)
    expect(rows.find((r) => r.cat.id === 'nhao')).toMatchObject({
      groupCap: true,
      childCount: 2,
      limit: 120_000,
    })
  })

  it('mốc con nằm BÊN TRONG dòng cha, không đứng riêng ở khối Mốc con', () => {
    const { groups } = build([bud('nhao', 120_000), bud('tiennha', 112_760)])
    const nhao = groups.blocks
      .flatMap((b) => [...b.rows, ...b.tail])
      .find((r) => r.cat.id === 'nhao')!
    expect(nhao.markers.map((m) => m.cat.id)).toEqual(['tiennha'])
    expect(groups.blocks.some((b) => b.key === 'markers')).toBe(false)
    // Và phần lệch được nói ra thành con số, không im lặng.
    expect(groups.markerTotal).toBe(112_760)
    expect(groups.lineTotal).toBe(120_000 + 112_760)
  })

  it('BẤT BIẾN: mọi danh mục có gap đều tìm thấy trong danh sách', () => {
    // Cảnh báo trỏ tới thứ danh sách không biết là có = người dùng không sửa được nó.
    const { groups, gaps } = build(
      [bud('nhao', 120_000), bud('dien', 3_000)],
      new Map([['dodung', 200_000], ['dien', 13_070]]),
    )
    expect(gaps.length).toBeGreaterThan(0)
    const ids = everyId(groups)
    for (const g of gaps) expect(ids).toContain(g.categoryId)
  })
})

describe('planGroups · khối theo trục', () => {
  it('tiểu tổng mỗi khối KHỚP dòng trục cùng tên', () => {
    // Đây là ràng buộc quan trọng nhất: header khối in `∑ / trần` mà trần lấy từ
    // axisProgress. Lệch một đồng là hai con số cạnh nhau đọc ra như lỗi tính.
    const { groups, axis } = build([
      bud('tiennha', 112_760),
      bud('dien', 3_000),
      bud('cattoc', 1_800),
      bud('quanao', 5_243),
    ])
    for (const key of ['essential', 'flexible'] as const) {
      const block = groups.blocks.find((b) => b.key === key)
      const line = axis!.lines.find((l) => l.key === key)!
      expect(block?.total ?? 0).toBe(Math.round(line.actual))
      expect(block?.target).toBe(line.target)
    }
  })

  it('nhóm TỔNG-CON nở ra thành từng dòng con, không gộp thành một dòng cha', () => {
    // Các con của nhóm chưa có trần KHÔNG phải mốc con — mỗi đứa là một ràng buộc riêng và
    // `plannedSlices` đếm chúng riêng. Gộp thành dòng cha là để tiểu tổng khối lệch trục.
    const { groups } = build([bud('cattoc', 1_800), bud('quanao', 5_243)])
    const ids = everyId(groups)
    expect(ids).toContain('cattoc')
    expect(ids).toContain('quanao')
    expect(ids).not.toContain('ngoaihinh')
  })

  it('danh mục chưa gắn need_level vào khối Chưa phân loại, khối đó KHÔNG có trần', () => {
    const { groups } = build([bud('comngoai', 50_000)])
    const b = groups.blocks.find((x) => x.key === 'unclassified')!
    expect(b.total).toBe(50_000)
    expect(b.target).toBeNull()
    expect(b.remaining).toBeNull()
  })

  it('KHÔNG có khối Để dành: nó là HIỆU, không phải tổng của danh mục nào', () => {
    const { groups } = build([bud('tiennha', 112_760)])
    expect(groups.blocks.map((b) => b.key)).not.toContain('savings')
  })

  it('khối rỗng bị loại hẳn, thứ tự khối còn lại vẫn cố định', () => {
    const { groups } = build([bud('cattoc', 1_800), bud('comngoai', 50_000)])
    expect(groups.blocks.map((b) => b.key)).toEqual(['flexible', 'unclassified'])
  })
})

describe('planGroups · khối theo PHƯƠNG PHÁP (không cứng essential/flexible)', () => {
  it('jars: danh mục nhãn giving vào khối Cho đi, không vào Linh hoạt', () => {
    const jars = BUDGET_METHODS.find((m) => m.id === 'jars')!
    const { groups } = build([bud('quatang', 5_000)], new Map(), null, jars)
    expect(groups.blocks.map((b) => b.key)).toContain('giving')
    const giving = groups.blocks.find((b) => b.key === 'giving')!
    expect(giving.rows.map((r) => r.cat.id)).toEqual(['quatang'])
  })

  it('80-20: mọi dòng (kể cả chưa gắn nhãn) vào MỘT khối Chi tiêu, không còn khối chưa-phân-loại', () => {
    const m8020 = BUDGET_METHODS.find((m) => m.id === '80-20')!
    const { groups } = build(
      [bud('dien', 3_000), bud('comngoai', 50_000), bud('quatang', 5_000)],
      new Map(),
      null,
      m8020,
    )
    const keys = groups.blocks.map((b) => b.key)
    expect(keys.filter((k) => k !== 'markers')).toEqual(['allSpend'])
  })
})

describe('planGroups · đuôi dài', () => {
  it('dòng dưới ngưỡng vào `tail`, tiểu tổng khối vẫn tính cả chúng', () => {
    const { groups } = build([bud('dien', 13_070), bud('gas', 500)])
    const b = groups.blocks.find((x) => x.key === 'essential')!
    expect(b.rows.map((r) => r.cat.id)).toEqual(['dien'])
    expect(b.tail.map((r) => r.cat.id)).toEqual(['gas'])
    expect(b.tailTotal).toBe(500)
    // Gấp lại KHÔNG được làm mất một đồng nào khỏi tổng.
    expect(b.total).toBe(13_570)
  })

  it('dòng trần nhóm KHÔNG bị gấp dù nhỏ — gấp là chôn luôn nhánh mốc con', () => {
    const { groups } = build([bud('nhao', 800), bud('tiennha', 700)])
    const b = groups.blocks.find((x) => x.key === 'unclassified')!
    expect(b.rows.map((r) => r.cat.id)).toEqual(['nhao'])
    expect(b.tail).toEqual([])
  })

  it('trong mỗi khối, sắp giảm dần theo hạn mức (không theo spent — tháng chưa bắt đầu)', () => {
    const { groups } = build([bud('dien', 3_000), bud('gas', 13_070)])
    const b = groups.blocks.find((x) => x.key === 'essential')!
    expect(b.rows.map((r) => r.cat.id)).toEqual(['gas', 'dien'])
  })
})

describe('ghim dòng đang kéo (thanh trượt)', () => {
  // `dien` và `gas` cùng khối Thiết yếu, cùng là lá độc lập — hai dòng sạch để so thứ tự.
  const keo = (dienDangKeo: number) => [bud('dien', dienDangKeo), bud('gas', 3_000)]
  const idsOf = (g: ReturnType<typeof build>['groups']) =>
    g.blocks.find((b) => b.key === 'essential')!.rows.map((r) => r.cat.id)

  it('không ghim thì kéo xuống dưới dòng khác là ĐỔI CHỖ giữa lúc kéo', () => {
    // Đây là hành vi phải chặn: trên điện thoại dòng chạy ra khỏi ngón tay đang kéo.
    expect(idsOf(build([bud('dien', 5_000), bud('gas', 3_000)]).groups)).toEqual(['dien', 'gas'])
    expect(idsOf(build(keo(1_000)).groups)).toEqual(['gas', 'dien'])
  })

  it('ghim theo hạn mức ĐÃ LƯU thì dòng giữ nguyên chỗ dù số đang kéo nhỏ hơn', () => {
    const g = build(keo(1_000), new Map(), { categoryId: 'dien', limit: 5_000 }).groups
    expect(idsOf(g)).toEqual(['dien', 'gas'])
  })

  it('số HIỆN và tổng khối vẫn theo số đang kéo, không theo số ghim', () => {
    const g = build(keo(1_000), new Map(), { categoryId: 'dien', limit: 5_000 }).groups
    const block = g.blocks.find((b) => b.key === 'essential')!
    expect(block.rows.find((r) => r.cat.id === 'dien')!.limit).toBe(1_000)
    expect(block.total).toBe(4_000)
  })

  it('ghim giữ dòng ở ngoài ĐUÔI GẤP — kéo xuống dưới ngưỡng không làm thanh biến mất', () => {
    const chuaGhim = build(keo(500)).groups.blocks.find((b) => b.key === 'essential')!
    expect(chuaGhim.tail.map((r) => r.cat.id)).toEqual(['dien'])

    const daGhim = build(keo(500), new Map(), { categoryId: 'dien', limit: 5_000 }).groups.blocks.find(
      (b) => b.key === 'essential',
    )!
    expect(daGhim.rows.map((r) => r.cat.id)).toEqual(['dien', 'gas'])
    expect(daGhim.tail).toEqual([])
  })

  it('ghim một danh mục không có dòng nào thì không ảnh hưởng gì', () => {
    const g = build(keo(1_000), new Map(), { categoryId: 'khong-ton-tai', limit: 9_000 }).groups
    expect(idsOf(g)).toEqual(['gas', 'dien'])
  })
})
