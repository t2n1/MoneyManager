import { describe, expect, it } from 'vitest'
import type { ClassificationBreakdown } from '../reports/aggregate'
import { axisProgress, DEFAULT_AXIS_TARGETS } from './axisTargets'

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
})
