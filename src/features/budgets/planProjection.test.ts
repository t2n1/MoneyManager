import { describe, expect, it } from 'vitest'
import type { CoverageGap } from './commitments'
import type { PlanSummary } from './planning'
import { distributeHeadroom, planProjection } from './planProjection'
import type { Suggestion } from './suggest'

const sug = (categoryId: string, average: number): Suggestion => ({
  categoryId,
  average,
  max: average * 3,
  months: [],
})

const summary = (over: Partial<PlanSummary> = {}): PlanSummary => ({
  income: 290_000,
  incomeSource: 'declared',
  allocated: 226_138,
  unallocated: 290_000 - 226_138,
  axis: null,
  ...over,
})

const gap = (categoryId: string, short: number): CoverageGap => ({
  categoryId,
  committed: short,
  budgeted: 0,
  short,
})

const run = (
  over: {
    summary?: PlanSummary
    suggestions?: Map<string, Suggestion>
    budgetedByCat?: Map<string, number>
    gaps?: CoverageGap[]
    savingsBps?: number
    markers?: string[]
    notBudgetable?: string[]
  } = {},
) =>
  planProjection({
    summary: over.summary ?? summary(),
    suggestions: over.suggestions ?? new Map(),
    budgetedByCat: over.budgetedByCat ?? new Map(),
    gaps: over.gaps ?? [],
    savingsBps: over.savingsBps ?? 2000,
    isMarker: (id) => (over.markers ?? []).includes(id),
    isBudgetable: (id) => !(over.notBudgetable ?? []).includes(id),
  })

describe('planProjection', () => {
  it('chưa biết thu nhập → null (cùng luật với planVerdict)', () => {
    expect(run({ summary: summary({ incomeSource: 'unknown', income: 0 }) })).toBeNull()
    expect(run({ summary: summary({ income: 0 }) })).toBeNull()
  })

  it('không có danh mục chưa đặt → ifSuggested bằng allocated', () => {
    const r = run({
      suggestions: new Map([['rent', sug('rent', 50_000)]]),
      budgetedByCat: new Map([['rent', 3_000]]),
    })!
    expect(r.suggestedTotal).toBe(0)
    expect(r.unsetCount).toBe(0)
    expect(r.ifSuggested).toBe(226_138)
  })

  it('danh mục đã đặt THẤP hơn trung bình KHÔNG được chiếu lên trung bình', () => {
    // Ca thật: Điện đặt ¥3,000 trong khi TB ¥13,070. Người dùng đã CỐ Ý đặt thấp, mà
    // "chiếu" nghĩa là dự đoán họ sẽ bấm gợi ý, không phải đoán họ đặt sai.
    const r = run({
      suggestions: new Map([['dien', sug('dien', 13_070)]]),
      budgetedByCat: new Map([['dien', 3_000]]),
    })!
    expect(r.suggestedTotal).toBe(0)
  })

  it('mốc con có gợi ý thì KHÔNG vào suggestedTotal', () => {
    // Cùng lý do plannedSlices loại chúng: mốc con nằm trong trần cha nên nhận gợi ý ở
    // đó không làm tổng kế hoạch tăng.
    const r = run({
      suggestions: new Map([
        ['taxi', sug('taxi', 6_000)],
        ['qua', sug('qua', 2_869)],
      ]),
      markers: ['taxi'],
    })!
    expect(r.suggestedTotal).toBe(2_869)
    expect(r.unsetCount).toBe(1)
  })

  it('danh mục không đặt được trần (dòng chảy / chuyển tài sản) bị loại', () => {
    const r = run({
      suggestions: new Map([['gui-ve-vn', sug('gui-ve-vn', 30_000)]]),
      notBudgetable: ['gui-ve-vn'],
    })!
    expect(r.unsetCount).toBe(0)
  })

  it('headroom ÂM khi đã chia quá phần giữ được sàn', () => {
    const r = run({ summary: summary({ allocated: 240_000 }) })!
    // 290.000 − sàn 58.000 − 240.000 = −8.000
    expect(r.headroom).toBe(-8_000)
  })

  it('ca thật tháng 8/2026 ra đúng bốn con số', () => {
    // 7 gợi ý cộng lại ¥47,070 · 2 cam kết còn hụt ¥22,400.
    const suggestions = new Map([
      ['a', sug('a', 16_360)],
      ['b', sug('b', 15_182)],
      ['c', sug('c', 4_173)],
      ['d', sug('d', 3_300)],
      ['e', sug('e', 3_263)],
      ['f', sug('f', 2_869)],
      ['g', sug('g', 1_923)],
    ])
    const r = run({ suggestions, gaps: [gap('svc', 2_400), gap('house', 20_000)] })!
    expect(r.suggestedTotal).toBe(47_070)
    expect(r.ifSuggested).toBe(273_208)
    expect(r.savingsIfSuggested).toBe(16_792)
    expect(r.ifCovered).toBe(295_608)
    expect(r.savingsIfCovered).toBe(-5_608)
    expect(r.savingsFloor).toBe(58_000)
    // Con số dùng được: gợi ý muốn ¥47,070 mà chỉ còn ¥5,862 nếu phải giữ sàn.
    expect(r.headroom).toBe(5_862)
    expect(r.gapCount).toBe(2)
  })
})

describe('distributeHeadroom', () => {
  it('tổng chia ra ĐÚNG BẰNG headroom — phần lẻ không bốc hơi', () => {
    const out = distributeHeadroom(5_862, [
      { categoryId: 'a', average: 16_360 },
      { categoryId: 'b', average: 15_182 },
      { categoryId: 'c', average: 4_173 },
    ])
    expect([...out.values()].reduce((s, v) => s + v, 0)).toBe(5_862)
    // Phần lẻ dồn vào mục có trung bình lớn nhất.
    expect(out.get('a')! % 100).not.toBe(0)
  })

  it('headroom = 0 → map rỗng, không chia số âm', () => {
    expect(distributeHeadroom(0, [{ categoryId: 'a', average: 100 }]).size).toBe(0)
    expect(distributeHeadroom(-5_000, [{ categoryId: 'a', average: 100 }]).size).toBe(0)
  })

  it('một danh mục duy nhất thì nhận hết', () => {
    const out = distributeHeadroom(5_862, [{ categoryId: 'a', average: 16_360 }])
    expect(out.get('a')).toBe(5_862)
  })

  it('mọi trung bình bằng 0 → chia ĐỀU, không chia cho 0', () => {
    const out = distributeHeadroom(3_000, [
      { categoryId: 'a', average: 0 },
      { categoryId: 'b', average: 0 },
      { categoryId: 'c', average: 0 },
    ])
    expect([...out.values()].reduce((s, v) => s + v, 0)).toBe(3_000)
    expect(out.get('b')).toBe(1_000)
    expect(out.get('c')).toBe(1_000)
  })
})
