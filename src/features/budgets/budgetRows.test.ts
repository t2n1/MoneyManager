import { describe, expect, it } from 'vitest'
import type { CategoryRow } from '../../types/database.types'
import { buildBudgetDisplay, type BudgetChildRow } from './budgetDisplay'
import { applyDraftLimit, childState, splitQuiet } from './budgetRows'
import { statusOf, type BudgetLine, type BudgetReport } from './progress'

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

function line(
  categoryId: string,
  budgeted: number,
  spent: number,
  opts: { isMarker?: boolean; carried?: number } = {},
): BudgetLine {
  const ratio = budgeted > 0 ? spent / budgeted : 0
  return {
    categoryId,
    budgeted,
    carried: opts.carried ?? 0,
    spent,
    ratio,
    status: statusOf(ratio),
    isMarker: opts.isMarker ?? false,
  }
}

function report(lines: BudgetLine[], spent: Record<string, number> = {}): BudgetReport {
  return {
    lines,
    totalBudgeted: 0,
    totalSpent: 0,
    totalStatus: 'ok',
    overCount: 0,
    warnCount: 0,
    hasMissingRate: false,
    spentByCategory: new Map(Object.entries(spent)),
  }
}

// Cây theo ca thật tháng 9/2026: Nhà ở (trần nhóm) → Tiền nhà, Điện, Nước, Giặt là
const house = cat({ id: 'house', name: 'Nhà ở' })
const rent = cat({ id: 'rent', name: 'Tiền nhà', parent_id: 'house', cost_type: 'fixed' })
const power = cat({ id: 'power', name: 'Điện', parent_id: 'house', cost_type: 'variable' })
const water = cat({ id: 'water', name: 'Nước', parent_id: 'house' })
const laundry = cat({ id: 'laundry', name: 'Giặt là', parent_id: 'house' })
const food = cat({ id: 'food', name: 'Ăn uống' })
const gift = cat({ id: 'gift', name: 'Quà tặng' })
const health = cat({ id: 'health', name: 'Sức khỏe' })
const cats = [house, rent, power, water, laundry, food, gift, health]

describe('splitQuiet — gấp mục chưa chi gì', () => {
  const items = buildBudgetDisplay(
    cats,
    report(
      [
        line('house', 133_000, 112_760),
        line('food', 60_000, 3_880),
        line('gift', 30_000, 0),
        line('health', 5_000, 0),
      ],
      { house: 112_760, food: 3_880 },
    ),
  ).items

  it('mục chưa chi một đồng nào rơi vào quiet, tổng hạn mức cộng đúng', () => {
    const r = splitQuiet(items, new Set())
    expect(r.shown.map((i) => i.cat.id)).toEqual(['house', 'food'])
    expect(r.quiet.map((i) => i.cat.id).sort()).toEqual(['gift', 'health'])
    expect(r.quietBudgeted).toBe(35_000)
  })

  it('chỉ một mục yên thì không gấp — gấp cũng tốn đúng một dòng', () => {
    const one = items.filter((i) => i.cat.id !== 'health')
    const r = splitQuiet(one, new Set())
    expect(r.quiet).toEqual([])
    expect(r.shown).toHaveLength(3)
    expect(r.quietBudgeted).toBe(0)
  })

  it('mục trong danh sách cần để ý không bao giờ bị gấp', () => {
    // minFold = 1 để phép thử nhìn vào đúng một luật: bỏ `gift` khỏi quiet vì nó được giữ,
    // không phải vì còn quá ít mục để gấp.
    const r = splitQuiet(items, new Set(['gift']), 1)
    expect(r.quiet.map((i) => i.cat.id)).toEqual(['health'])
    expect(r.shown.map((i) => i.cat.id)).toContain('gift')
  })

  it('giữ thứ tự đầu vào ở cả hai bên', () => {
    const sorted = [...items].sort((a, b) => a.cat.sort_order - b.cat.sort_order)
    const r = splitQuiet(sorted, new Set())
    expect(r.shown.map((i) => i.cat.id)).toEqual(['house', 'food'])
    expect(r.quiet.map((i) => i.cat.id)).toEqual(['gift', 'health'])
  })
})

describe('childState — trạng thái một mục con', () => {
  const child = (c: CategoryRow, marker: BudgetLine | null, spent = 0): BudgetChildRow => ({
    cat: c,
    spent,
    marker,
  })

  it('cố định, chi đúng bằng mốc → đã trả', () => {
    expect(childState(child(rent, line('rent', 112_760, 112_760, { isMarker: true })))).toBe(
      'paid',
    )
  })

  it('biến đổi chi đúng bằng mốc → vẫn là mốc (vừa hết hạn mức, không phải việc đã xong)', () => {
    expect(childState(child(power, line('power', 3_000, 3_000, { isMarker: true })))).toBe(
      'marker',
    )
  })

  it('cố định nhưng chi QUÁ mốc → mốc, để người dùng thấy số vượt', () => {
    expect(childState(child(rent, line('rent', 112_760, 120_000, { isMarker: true })))).toBe(
      'marker',
    )
  })

  it('cố định còn chưa trả → mốc', () => {
    expect(childState(child(rent, line('rent', 112_760, 0, { isMarker: true })))).toBe('marker')
  })

  it('chưa đặt mốc → unset, kể cả khi đã có chi', () => {
    expect(childState(child(laundry, null, 1_200))).toBe('unset')
  })
})

describe('applyDraftLimit — số nhìn thấy trong lúc kéo', () => {
  const base = report(
    [
      line('house', 133_000, 112_760),
      line('rent', 112_760, 112_760, { isMarker: true }),
      line('power', 3_000, 0, { isMarker: true }),
      line('water', 2_600, 0, { isMarker: true, carried: 1_300 }),
      line('food', 60_000, 3_880),
    ],
    { house: 112_760, rent: 112_760, food: 3_880 },
  )
  const lineOf = (r: BudgetReport, id: string) => r.lines.find((l) => l.categoryId === id)!

  it('kéo một lá độc lập: chỉ dòng đó đổi, ratio và status tính lại', () => {
    const r = applyDraftLimit(base, cats, 'food', 4_000)
    const l = lineOf(r, 'food')
    expect(l.budgeted).toBe(4_000)
    expect(l.ratio).toBeCloseTo(0.97)
    expect(l.status).toBe('warn')
    expect(lineOf(r, 'house')).toEqual(lineOf(base, 'house'))
  })

  it('kéo mốc con: trần cha thành TỔNG các con — đúng việc parentsToResync sẽ làm lúc ghi', () => {
    // Trần cha đang 133.000 mà các con chỉ cộng được 112.760 + 3.000 + 1.300 = 117.060.
    // Kéo Điện lên 5.000 thì lúc ghi cha sẽ thành 119.060 — số kéo phải nói y thế.
    const r = applyDraftLimit(base, cats, 'power', 5_000)
    expect(lineOf(r, 'power').budgeted).toBe(5_000)
    expect(lineOf(r, 'house').budgeted).toBe(112_760 + 5_000 + 1_300)
    expect(lineOf(r, 'house').ratio).toBeCloseTo(112_760 / 119_060)
  })

  it('số đặt tay không gồm phần dồn: kéo Nước thì dồn +1.300 vẫn cộng lên trên số kéo', () => {
    const r = applyDraftLimit(base, cats, 'water', 2_000)
    expect(lineOf(r, 'water').budgeted).toBe(3_300)
    expect(lineOf(r, 'water').carried).toBe(1_300)
    // Cha cộng số ĐẶT TAY của con (2.000), không cộng số đã dồn (3.300).
    expect(lineOf(r, 'house').budgeted).toBe(112_760 + 3_000 + 2_000)
  })

  it('phần dồn của CHA cũng được giữ khi tính lại trần cha', () => {
    const withCarry = report(
      [line('house', 134_000, 0, { carried: 1_000 }), line('rent', 100_000, 0, { isMarker: true })],
    )
    const r = applyDraftLimit(withCarry, cats, 'rent', 120_000)
    expect(lineOf(r, 'house').budgeted).toBe(120_000 + 1_000)
  })

  it('kéo trần nhóm: chỉ cha đổi, mốc con đứng yên', () => {
    const r = applyDraftLimit(base, cats, 'house', 120_000)
    expect(lineOf(r, 'house').budgeted).toBe(120_000)
    expect(lineOf(r, 'power')).toEqual(lineOf(base, 'power'))
  })

  it('cha KHÔNG có trần riêng (nhóm tổng-con) thì không đẻ dòng cho cha', () => {
    const noCap = report([line('power', 3_000, 0), line('water', 1_300, 0)])
    const r = applyDraftLimit(noCap, cats, 'power', 5_000)
    expect(r.lines.map((l) => l.categoryId).sort()).toEqual(['power', 'water'])
  })

  it('danh mục chưa có dòng hạn mức → trả nguyên báo cáo', () => {
    expect(applyDraftLimit(base, cats, 'laundry', 5_000)).toBe(base)
  })

  it('không đụng tổng của thẻ trên và không sửa báo cáo gốc', () => {
    const before = JSON.stringify(base.lines)
    const r = applyDraftLimit(base, cats, 'power', 9_000)
    expect(r.totalBudgeted).toBe(base.totalBudgeted)
    expect(JSON.stringify(base.lines)).toBe(before)
  })
})
