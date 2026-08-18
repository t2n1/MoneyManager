import { describe, expect, it } from 'vitest'
import type { ClassificationBreakdown } from '../reports/aggregate'
import type { CategoryRow } from '../../types/database.types'
import {
  AXIS_LABEL,
  type AxisKey,
  type AxisLine,
  axisMissSummary,
  axisProgress,
  axisSlices,
  baselineIncome,
  DEFAULT_AXIS_TARGETS,
  shareLabel,
  sharePct,
} from './axisTargets'

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

const cls = (p: Partial<ClassificationBreakdown> = {}): ClassificationBreakdown => ({
  needEssential: 0,
  needFlexible: 0,
  needUnclassified: 0,
  costFixed: 0,
  costVariable: 0,
  costUnclassified: 0,
  emergencyCut: 0,
  totalExpense: 0,
  ...p,
})

describe('axisProgress', () => {
  it('không có thu nhập thì không có mẫu số → null', () => {
    expect(axisProgress(0, cls({ needEssential: 100 }), DEFAULT_AXIS_TARGETS)).toBeNull()
    expect(axisProgress(-5, cls(), DEFAULT_AXIS_TARGETS)).toBeNull()
  })

  it('đúng 50/30/20 thì cả ba dòng đều đạt', () => {
    const r = axisProgress(
      1_000_000,
      cls({ needEssential: 500_000, needFlexible: 300_000, totalExpense: 800_000 }),
      DEFAULT_AXIS_TARGETS,
    )!
    expect(r.lines.map((l) => [l.key, l.actual, l.target, l.ok])).toEqual([
      ['essential', 500_000, 500_000, true],
      ['flexible', 300_000, 300_000, true],
      ['savings', 200_000, 200_000, true],
    ])
  })

  it('chi vượt trần → dòng đó không đạt, các dòng khác không bị ảnh hưởng', () => {
    const r = axisProgress(
      1_000_000,
      cls({ needEssential: 400_000, needFlexible: 450_000, totalExpense: 850_000 }),
      DEFAULT_AXIS_TARGETS,
    )!
    const by = Object.fromEntries(r.lines.map((l) => [l.key, l]))
    expect(by.essential.ok).toBe(true)
    expect(by.flexible.ok).toBe(false)
    expect(by.flexible.share).toBeCloseTo(0.45)
  })

  it('tiết kiệm là SÀN: bằng mốc là đạt, dưới mốc là không', () => {
    const at = axisProgress(1_000_000, cls({ totalExpense: 800_000 }), DEFAULT_AXIS_TARGETS)!
    expect(at.lines[2].direction).toBe('floor')
    expect(at.lines[2].ok).toBe(true)

    const below = axisProgress(1_000_000, cls({ totalExpense: 850_000 }), DEFAULT_AXIS_TARGETS)!
    expect(below.lines[2].ok).toBe(false)
  })

  it('chi nhiều hơn thu → tiết kiệm âm, vẫn tính được (không kẹp về 0)', () => {
    const r = axisProgress(500_000, cls({ totalExpense: 700_000 }), DEFAULT_AXIS_TARGETS)!
    expect(r.lines[2].actual).toBe(-200_000)
    expect(r.lines[2].ok).toBe(false)
  })

  it('phần chưa phân loại được báo riêng, không nhét vào thiết yếu hay linh hoạt', () => {
    const r = axisProgress(
      1_000_000,
      cls({ needEssential: 300_000, needUnclassified: 200_000, totalExpense: 500_000 }),
      DEFAULT_AXIS_TARGETS,
    )!
    expect(r.unclassified).toBe(200_000)
    expect(r.lines[0].actual).toBe(300_000)
    expect(r.lines[1].actual).toBe(0)
    // Tiết kiệm vẫn tính trên TỔNG chi, nên không bị thổi phồng bởi phần chưa gán
    expect(r.lines[2].actual).toBe(500_000)
  })

  it('mốc tự đặt được, không cứng 50/30/20', () => {
    const r = axisProgress(
      1_000_000,
      cls({ needFlexible: 250_000, totalExpense: 250_000 }),
      { essentialBps: 6000, flexibleBps: 2000, savingsBps: 2000 },
    )!
    expect(r.lines[1].target).toBe(200_000)
    expect(r.lines[1].ok).toBe(false)
  })

  it('mốc 0% nghĩa là không cho phép đồng nào', () => {
    const r = axisProgress(1_000_000, cls({ needFlexible: 1, totalExpense: 1 }), {
      essentialBps: 8000,
      flexibleBps: 0,
      savingsBps: 2000,
    })!
    expect(r.lines[1].target).toBe(0)
    expect(r.lines[1].ok).toBe(false)
  })

  it('không truyền nền thì thu thực tế vừa là mẫu số vừa là số đã nhận', () => {
    const r = axisProgress(1_000_000, cls({ totalExpense: 800_000 }), DEFAULT_AXIS_TARGETS)!
    expect(r.estimated).toBe(false)
    expect(r.income).toBe(1_000_000)
    expect(r.actualIncome).toBe(1_000_000)
  })

  it('chưa tới ngày lương: thu = 0 nhưng có nền thì vẫn tính, và đánh dấu ước tính', () => {
    const r = axisProgress(
      0,
      cls({ needEssential: 200_000, totalExpense: 200_000 }),
      DEFAULT_AXIS_TARGETS,
      1_000_000,
    )!
    expect(r.estimated).toBe(true)
    expect(r.income).toBe(1_000_000)
    // Số đã thực nhận vẫn là 0 — khối phải nói được là chưa có đồng nào về
    expect(r.actualIncome).toBe(0)
    expect(r.lines[0].share).toBeCloseTo(0.2)
    expect(r.lines[0].target).toBe(500_000)
    // Tiết kiệm dự kiến tính trên nền, không phải trên 0
    expect(r.lines[2].actual).toBe(800_000)
  })

  it('lương đã về cao hơn nền thì dùng số thật, không ước tính nữa', () => {
    const r = axisProgress(
      1_200_000,
      cls({ totalExpense: 600_000 }),
      DEFAULT_AXIS_TARGETS,
      1_000_000,
    )!
    expect(r.estimated).toBe(false)
    expect(r.income).toBe(1_200_000)
    expect(r.lines[2].actual).toBe(600_000)
  })

  it('nền cũng bằng 0 (chưa có gì để dựa vào) thì vẫn không hiện', () => {
    expect(axisProgress(0, cls(), DEFAULT_AXIS_TARGETS, 0)).toBeNull()
    expect(axisProgress(0, cls(), DEFAULT_AXIS_TARGETS, null)).toBeNull()
  })

  it('không truyền danh mục thì mỗi dòng có slices rỗng, không phải undefined', () => {
    const r = axisProgress(1_000_000, cls({ needEssential: 100 }), DEFAULT_AXIS_TARGETS)!
    // Chỗ gọi nào cũng .length được — không phải thêm `?.` rải rác
    expect(r.lines.map((l) => l.slices)).toEqual([[], [], []])
  })

  it('slices về đúng dòng của nó', () => {
    const parts = axisSlices(
      [
        { categoryId: 'rent', amount: 300 },
        { categoryId: 'fun', amount: 50 },
      ],
      [cat({ id: 'rent', need_level: 'essential' }), cat({ id: 'fun', need_level: 'flexible' })],
    )
    const r = axisProgress(
      1_000_000,
      cls({ needEssential: 300, needFlexible: 50, totalExpense: 350 }),
      DEFAULT_AXIS_TARGETS,
      null,
      parts,
    )!
    expect(r.lines[0].slices).toEqual([{ categoryId: 'rent', amount: 300 }])
    expect(r.lines[1].slices).toEqual([{ categoryId: 'fun', amount: 50 }])
    expect(r.lines[2].slices).toEqual([])
  })
})

describe('axisSlices', () => {
  const cats = [
    cat({ id: 'rent', need_level: 'essential' }),
    cat({ id: 'food', need_level: 'essential' }),
    cat({ id: 'fun', need_level: 'flexible' }),
    cat({ id: 'misc' }), // chưa phân loại
  ]

  it('chia danh mục về đúng trục, mỗi trục xếp giảm dần', () => {
    const r = axisSlices(
      [
        { categoryId: 'food', amount: 200 },
        { categoryId: 'rent', amount: 900 },
        { categoryId: 'fun', amount: 50 },
      ],
      cats,
    )
    expect(r.essential.map((s) => s.categoryId)).toEqual(['rent', 'food'])
    expect(r.flexible.map((s) => s.categoryId)).toEqual(['fun'])
  })

  it('tổng mỗi trục khớp đúng số của dòng trục', () => {
    const slices = [
      { categoryId: 'rent', amount: 900 },
      { categoryId: 'food', amount: 200 },
      { categoryId: 'fun', amount: 50 },
      { categoryId: 'misc', amount: 77 },
    ]
    const r = axisSlices(slices, cats)
    const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0)
    expect(sum(r.essential)).toBe(1100)
    expect(sum(r.flexible)).toBe(50)
  })

  it('danh mục chưa phân loại không lọt vào trục nào', () => {
    const r = axisSlices([{ categoryId: 'misc', amount: 77 }], cats)
    expect(r.essential).toEqual([])
    expect(r.flexible).toEqual([])
  })

  it('danh mục không còn trong danh sách (đã xoá) cũng không lọt vào đâu', () => {
    const r = axisSlices([{ categoryId: 'ghost', amount: 10 }], cats)
    expect(r.essential).toEqual([])
    expect(r.flexible).toEqual([])
  })

  it('tiết kiệm luôn rỗng — nó là hiệu, không phải tổng của danh mục nào', () => {
    const r = axisSlices([{ categoryId: 'rent', amount: 900 }], cats)
    expect(r.savings).toEqual([])
  })
})

describe('baselineIncome', () => {
  it('trung bình thu của các tháng có dữ liệu', () => {
    expect(
      baselineIncome([
        { income: 300_000, expense: 200_000 },
        { income: 300_000, expense: 200_000 },
        { income: 600_000, expense: 200_000 },
      ]),
    ).toBe(400_000)
  })

  it('tháng trống trơn là KHÔNG CÓ DỮ LIỆU, không phải thu = 0', () => {
    // Mới cài app tháng trước: hai tháng đầu rỗng. Nếu cộng chúng vào, nền tụt
    // xuống 100k và khối sẽ báo chi vượt trần trong khi người ta chẳng tiêu gì lạ.
    expect(
      baselineIncome([
        { income: 0, expense: 0 },
        { income: 0, expense: 0 },
        { income: 300_000, expense: 200_000 },
      ]),
    ).toBe(300_000)
  })

  it('tháng có chi mà không có thu VẪN tính — nghỉ không lương là thu = 0 thật', () => {
    expect(
      baselineIncome([
        { income: 0, expense: 150_000 },
        { income: 400_000, expense: 200_000 },
      ]),
    ).toBe(200_000)
  })

  it('không tháng nào có dữ liệu → null', () => {
    expect(baselineIncome([])).toBeNull()
    expect(baselineIncome([{ income: 0, expense: 0 }])).toBeNull()
  })
})

describe('shareLabel', () => {
  it('tỷ lệ dương: làm tròn về phần trăm', () => {
    expect(shareLabel(0.384)).toBe('38%')
    expect(shareLabel(0)).toBe('0%')
    expect(shareLabel(1.2)).toBe('120%')
  })

  // Chi vượt thu → tiết kiệm âm. Dấu trừ ở cỡ chữ 12px rất dễ trượt mắt, mà đọc
  // "12%" thành "gần đạt mốc 20%" thì hiểu ngược hẳn tình hình.
  it('tỷ lệ âm: viết chữ "Âm" thay cho dấu trừ', () => {
    expect(shareLabel(-0.12)).toBe('Âm 12%')
    expect(shareLabel(-1.5)).toBe('Âm 150%')
  })

  it('số âm bé xíu vẫn làm tròn về 0%, không ra "Âm 0%"', () => {
    expect(shareLabel(-0.002)).toBe('0%')
  })
})

describe('sharePct', () => {
  // Chỗ hiển thị dựa vào hàm này để quyết có in "/mốc" hay không, nên nó phải
  // làm tròn y hệt shareLabel: -0,2% ra 0 thì cả hai đều coi là không âm.
  it('làm tròn khớp với shareLabel', () => {
    expect(sharePct(-0.002)).toBe(0)
    expect(shareLabel(-0.002)).toBe('0%')
    expect(sharePct(-0.18)).toBe(-18)
    expect(shareLabel(-0.18)).toBe('Âm 18%')
  })
})

// `axisMissSummary` — mệnh đề dùng CHUNG cho tiêu đề thẻ Cơ cấu (mặt theo dõi) và câu
// kết luận (mặt lập kế hoạch). Trước khi gộp, mỗi mặt giữ một bản riêng.
describe('axisMissSummary', () => {
  const line = (key: AxisKey, ok: boolean): AxisLine => ({
    key,
    actual: 0,
    target: 0,
    share: 0,
    targetShare: 0,
    direction: key === 'savings' ? 'floor' : 'cap',
    ok,
    slices: [],
  })

  it('chưa dựng được cơ cấu → không phán', () => {
    expect(axisMissSummary([])).toBeNull()
  })

  it('đạt hết thì đếm theo SỐ DÒNG THẬT, không viết cứng "cả ba"', () => {
    expect(axisMissSummary([line('essential', true), line('flexible', true)])?.phrase).toBe(
      'đạt cả 2 mốc',
    )
    expect(
      axisMissSummary([line('essential', true), line('flexible', true), line('savings', true)])
        ?.phrase,
    ).toBe('đạt cả 3 mốc')
  })

  it('lệch MỘT mốc thì gọi tên mốc đó', () => {
    const s = axisMissSummary([
      line('essential', true),
      line('flexible', false),
      line('savings', true),
    ])
    expect(s?.phrase).toBe('chưa đạt mốc Linh hoạt')
    expect(s?.missed).toHaveLength(1)
  })

  it('lệch NHIỀU mốc thì đếm, không liệt kê tên', () => {
    const s = axisMissSummary([
      line('essential', false),
      line('flexible', false),
      line('savings', true),
    ])
    expect(s?.phrase).toBe('lệch 2 mốc')
    expect(s?.phrase).not.toContain('Thiết yếu')
  })

  it('trục thứ ba gọi là "Để dành" ở mọi màn — một bảng tên duy nhất', () => {
    expect(axisMissSummary([line('savings', false)])?.phrase).toBe('chưa đạt mốc Để dành')
    expect(AXIS_LABEL.savings).toBe('Để dành')
  })
})
