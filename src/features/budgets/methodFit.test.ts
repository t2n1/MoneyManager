import { describe, expect, it } from 'vitest'
import { emptyNeedByLevel, type ClassificationBreakdown } from '../reports/aggregate'
import { BUDGET_METHODS } from './budgetMethods'
import { fitBadges, methodFit } from './methodFit'

const cls = (p: Partial<ClassificationBreakdown> = {}): ClassificationBreakdown => ({
  needByLevel: emptyNeedByLevel(),
  needUnclassified: 0,
  costFixed: 0,
  costVariable: 0,
  costUnclassified: 0,
  emergencyCut: 0,
  totalExpense: 0,
  ...p,
})

// Thu 1000: thiết yếu 60%, linh hoạt 30% (bằng đúng trần 30 của 50/30/20 = ĐẠT),
// để dành 10% (< sàn 20 của mọi phương pháp).
const DATA = cls({
  needByLevel: { ...emptyNeedByLevel(), essential: 600, flexible: 300 },
  totalExpense: 900,
})

describe('methodFit', () => {
  it('không có thu nhập thì không ướm — null, không hiện số bịa', () => {
    expect(methodFit(0, cls())).toBeNull()
    expect(methodFit(-5, cls())).toBeNull()
  })

  it('mỗi phương pháp một dòng, giữ thứ tự, axis tính đúng theo phương pháp đó', () => {
    const fits = methodFit(1_000, DATA)!
    expect(fits.map((f) => f.method.id)).toEqual(BUDGET_METHODS.map((m) => m.id))

    const jars = fits.find((f) => f.method.id === 'jars')!
    // jars: thiết yếu 60% > 55, hưởng thụ 30% > 10, để dành 10% < 20 — lệch 3
    expect(jars.axis.lines.filter((l) => !l.ok).map((l) => l.label)).toEqual([
      'Thiết yếu',
      'Hưởng thụ',
      'Để dành',
    ])
  })

  it('có slices + categories thì dòng khoản xổ ra được danh mục đã góp vào', () => {
    const fits = methodFit(
      1_000,
      DATA,
      BUDGET_METHODS,
      [
        { categoryId: 'nha', amount: 600 },
        { categoryId: 'quan-ao', amount: 300 },
      ],
      [
        { id: 'nha', need_level: 'essential' } as never,
        { id: 'quan-ao', need_level: 'flexible' } as never,
      ],
    )!
    const f503020 = fits.find((f) => f.method.id === '50-30-20')!
    const essential = f503020.axis.lines.find((l) => l.key === 'essential')!
    expect(essential.slices.map((s) => s.categoryId)).toEqual(['nha'])
  })

  it('tôn trọng mốc ĐÃ CHỈNH khi phương pháp truyền vào mang bps riêng', () => {
    // Trần thiết yếu nới lên 70% thì 60% không còn lệch nữa.
    const custom503020 = {
      ...BUDGET_METHODS[0],
      buckets: BUDGET_METHODS[0].buckets.map((b) =>
        b.key === 'essential' ? { ...b, bps: 7000 } : b,
      ),
    }
    const [f] = methodFit(1_000, DATA, [custom503020])!
    expect(f.axis.lines.filter((l) => !l.ok).map((l) => l.key)).toEqual(['savings'])
  })
})

describe('fitBadges', () => {
  it('lệch thì mỗi mốc một huy hiệu warn, viết bằng lời thường kèm số', () => {
    const fits = methodFit(1_000, DATA)!
    const f503020 = fits.find((f) => f.method.id === '50-30-20')!
    expect(fitBadges(f503020.axis)).toEqual([
      { tone: 'warn', text: 'Thiết yếu 60% — quá trần 50%' },
      { tone: 'warn', text: 'giữ lại 10% — chưa tới sàn 20%' },
    ])
  })

  it('đạt hết thì đúng một huy hiệu good', () => {
    const ok = cls({
      needByLevel: { ...emptyNeedByLevel(), essential: 400, flexible: 250 },
      totalExpense: 650, // để dành 35%
    })
    const f = methodFit(1_000, ok)!.find((x) => x.method.id === '50-30-20')!
    expect(fitBadges(f.axis)).toEqual([
      { tone: 'good', text: 'hợp nếp chi hiện tại — đạt cả 3 mốc' },
    ])
  })

  it('để dành ÂM viết "Âm", không để dấu trừ trần trụi', () => {
    const over = cls({
      needByLevel: { ...emptyNeedByLevel(), essential: 1_100 },
      totalExpense: 1_100,
    })
    const f = methodFit(1_000, over)!.find((x) => x.method.id === '80-20')!
    const badges = fitBadges(f.axis)
    expect(badges.find((b) => b.text.includes('giữ lại'))!.text).toBe(
      'giữ lại Âm 10% — chưa tới sàn 20%',
    )
  })
})
