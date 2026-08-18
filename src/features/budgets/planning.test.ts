import { describe, expect, it } from 'vitest'
import type { BudgetRow, CategoryRow } from '../../types/database.types'
import { DEFAULT_AXIS_TARGETS } from './axisTargets'
import { isPlanningMonth, planSummary, plannedSlices } from './planning'

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

function bud(categoryId: string, amount: number, rollover = false): BudgetRow {
  return {
    id: `b-${categoryId}`,
    user_id: 'u',
    category_id: categoryId,
    month_key: '2026-09',
    amount,
    rollover,
    created_at: '',
    updated_at: '',
  }
}

const CATS = [
  cat({ id: 'rent', need_level: 'essential' }),
  cat({ id: 'food', need_level: 'essential' }),
  cat({ id: 'fun', need_level: 'flexible' }),
  cat({ id: 'misc' }),
  cat({ id: 'transport', need_level: 'essential' }),
  cat({ id: 'taxi', parent_id: 'transport', need_level: 'essential' }),
]
const parentOf = (id: string) => CATS.find((c) => c.id === id)?.parent_id ?? null

describe('isPlanningMonth', () => {
  it('tháng chưa bắt đầu → mặt lập kế hoạch', () => {
    expect(isPlanningMonth('2026-09-01', '2026-08-12')).toBe(true)
  })

  it('tháng đang chạy → mặt theo dõi, kể cả ngày đầu tiên', () => {
    expect(isPlanningMonth('2026-08-01', '2026-08-01')).toBe(false)
    expect(isPlanningMonth('2026-08-01', '2026-08-12')).toBe(false)
  })

  it('tháng đã qua → mặt theo dõi', () => {
    expect(isPlanningMonth('2026-07-01', '2026-08-12')).toBe(false)
  })

  it('month_start_day ≠ 1: so theo NGÀY BẮT ĐẦU KỲ, không phải mùng 1', () => {
    // Đặt ngày bắt đầu kỳ là 25 thì "tháng 9" khởi động từ 25/8. Hôm 26/8 mà còn bày
    // mặt lập kế hoạch là lập kế hoạch cho một tháng đang tiêu dở.
    expect(isPlanningMonth('2026-08-25', '2026-08-24')).toBe(true)
    expect(isPlanningMonth('2026-08-25', '2026-08-26')).toBe(false)
  })
})

describe('plannedSlices', () => {
  it('mỗi hạn mức là một lát', () => {
    expect(plannedSlices([bud('rent', 200), bud('fun', 50)])).toEqual([
      { categoryId: 'rent', amount: 200 },
      { categoryId: 'fun', amount: 50 },
    ])
  })

  it('mốc con (cha đã có trần) KHÔNG vào tổng — không đếm một đồng hai lần', () => {
    const r = plannedSlices([bud('transport', 300), bud('taxi', 120)], parentOf)
    expect(r).toEqual([{ categoryId: 'transport', amount: 300 }])
  })

  it('con của nhóm CHƯA có trần thì vẫn tính vào tổng', () => {
    const r = plannedSlices([bud('taxi', 120)], parentOf)
    expect(r).toEqual([{ categoryId: 'taxi', amount: 120 }])
  })

  it('dùng số GỐC, không cộng phần dồn của tháng trước', () => {
    // rollover = true nhưng plannedSlices không biết gì về carry — đó là chủ ý:
    // tháng trước còn dở thì phần dồn chưa chốt được.
    expect(plannedSlices([bud('rent', 200, true)])[0].amount).toBe(200)
  })
})

describe('planSummary', () => {
  it('chưa khai, không có nền → chưa lập kế hoạch được', () => {
    const r = planSummary(null, null, [], CATS, DEFAULT_AXIS_TARGETS)
    expect(r.incomeSource).toBe('unknown')
    expect(r.income).toBe(0)
    expect(r.axis).toBeNull()
  })

  it('chưa khai thì rơi về nền', () => {
    const r = planSummary(null, 400_000, [bud('rent', 100_000)], CATS, DEFAULT_AXIS_TARGETS)
    expect(r.incomeSource).toBe('baseline')
    expect(r.income).toBe(400_000)
    expect(r.unallocated).toBe(300_000)
  })

  it('số khai tay thắng nền', () => {
    const r = planSummary(900_000, 400_000, [], CATS, DEFAULT_AXIS_TARGETS)
    expect(r.incomeSource).toBe('declared')
    expect(r.income).toBe(900_000)
  })

  it('khai 0 là số THẬT (nghỉ không lương), không phải "chưa khai"', () => {
    // Cái bẫy: `declared ?? baseline` với declared = 0 thì vẫn ra 0, nhưng viết
    // `declared || baseline` là rơi về nền và cả kế hoạch sai mẫu số.
    const r = planSummary(0, 400_000, [bud('rent', 100_000)], CATS, DEFAULT_AXIS_TARGETS)
    expect(r.incomeSource).toBe('declared')
    expect(r.income).toBe(0)
    expect(r.unallocated).toBe(-100_000)
    // Mẫu số 0 thì mọi tỷ lệ vô nghĩa — thà không hiện còn hơn hiện số sai.
    expect(r.axis).toBeNull()
  })

  it('đã phân bổ = tổng hạn mức tính-vào-tổng', () => {
    const r = planSummary(
      500_000,
      null,
      [bud('transport', 300), bud('taxi', 120), bud('fun', 700)],
      CATS,
      DEFAULT_AXIS_TARGETS,
      parentOf,
    )
    expect(r.allocated).toBe(1000)
    expect(r.unallocated).toBe(499_000)
  })

  it('chia quá tay → chưa phân bổ ÂM, không kẹp về 0', () => {
    const r = planSummary(100_000, null, [bud('rent', 150_000)], CATS, DEFAULT_AXIS_TARGETS)
    expect(r.unallocated).toBe(-50_000)
  })

  it('CHỐT: dòng "Để dành" của cơ cấu bằng đúng phần chưa phân bổ', () => {
    // Đây là điểm khoá cả thiết kế. Nếu hai số này rời nhau thì người dùng nâng một
    // hạn mức sẽ thấy con số trên đầu tụt mà thanh Để dành đứng yên — và không ai
    // biết nên tin số nào.
    const r = planSummary(
      420_000,
      null,
      [bud('rent', 200_000), bud('fun', 110_000)],
      CATS,
      DEFAULT_AXIS_TARGETS,
    )
    const savings = r.axis!.lines.find((l) => l.key === 'savings')!
    expect(savings.actual).toBe(r.unallocated)
    expect(savings.actual).toBe(110_000)
  })

  it('cơ cấu tính trên HẠN MỨC, không phải chi thực tế', () => {
    const r = planSummary(
      1_000_000,
      null,
      [bud('rent', 400_000), bud('fun', 200_000)],
      CATS,
      DEFAULT_AXIS_TARGETS,
    )
    const by = Object.fromEntries(r.axis!.lines.map((l) => [l.key, l]))
    expect(by.essential.actual).toBe(400_000)
    expect(by.flexible.actual).toBe(200_000)
    expect(by.essential.share).toBeCloseTo(0.4)
    expect(by.essential.ok).toBe(true)
  })

  it('kế hoạch vượt mốc thì dòng đó báo không đạt NGAY LÚC LẬP', () => {
    const r = planSummary(
      1_000_000,
      null,
      [bud('rent', 600_000), bud('fun', 300_000)],
      CATS,
      DEFAULT_AXIS_TARGETS,
    )
    const by = Object.fromEntries(r.axis!.lines.map((l) => [l.key, l]))
    expect(by.essential.ok).toBe(false)
    // Chia hết 900.000 thì chỉ còn 100.000 = 10%, dưới sàn 20%.
    expect(by.savings.actual).toBe(100_000)
    expect(by.savings.ok).toBe(false)
  })

  it('hạn mức của danh mục chưa phân loại rơi vào "chưa phân loại", không lọt vào trục', () => {
    const r = planSummary(
      1_000_000,
      null,
      [bud('misc', 300_000)],
      CATS,
      DEFAULT_AXIS_TARGETS,
    )
    expect(r.axis!.unclassified).toBe(300_000)
    expect(r.axis!.lines[0].actual).toBe(0)
    expect(r.axis!.lines[1].actual).toBe(0)
    // Nhưng nó VẪN chiếm chỗ của phần để dành — tiền đã hứa đi thì đi thật.
    expect(r.axis!.lines[2].actual).toBe(700_000)
    expect(r.unallocated).toBe(700_000)
  })

  it('xổ ra được danh mục của từng trục', () => {
    const r = planSummary(
      1_000_000,
      null,
      [bud('rent', 300_000), bud('food', 100_000), bud('fun', 50_000)],
      CATS,
      DEFAULT_AXIS_TARGETS,
    )
    const by = Object.fromEntries(r.axis!.lines.map((l) => [l.key, l]))
    expect(by.essential.slices.map((s) => s.categoryId)).toEqual(['rent', 'food'])
    expect(by.flexible.slices.map((s) => s.categoryId)).toEqual(['fun'])
    expect(by.savings.slices).toEqual([])
  })

  it('mốc tự đặt được, không cứng 50/30/20', () => {
    const r = planSummary(1_000_000, null, [bud('rent', 550_000)], CATS, {
      essentialBps: 5000,
      flexibleBps: 3000,
      savingsBps: 2000,
    })
    expect(r.axis!.lines[0].ok).toBe(false)

    const nhieuHon = planSummary(1_000_000, null, [bud('rent', 550_000)], CATS, {
      essentialBps: 6000,
      flexibleBps: 2000,
      savingsBps: 2000,
    })
    expect(nhieuHon.axis!.lines[0].ok).toBe(true)
  })

  it('chưa đặt hạn mức nào thì cả thu nhập là phần chưa phân bổ', () => {
    const r = planSummary(420_000, null, [], CATS, DEFAULT_AXIS_TARGETS)
    expect(r.allocated).toBe(0)
    expect(r.unallocated).toBe(420_000)
    expect(r.axis!.lines[2].actual).toBe(420_000)
  })
})
