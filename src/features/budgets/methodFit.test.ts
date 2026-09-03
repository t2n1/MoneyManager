import { describe, expect, it } from 'vitest'
import { emptyNeedByLevel, type ClassificationBreakdown } from '../reports/aggregate'
import { BUDGET_METHODS } from './budgetMethods'
import { fitPhrase, methodFit } from './methodFit'

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

describe('methodFit', () => {
  it('không có thu nhập thì không ướm — null, không hiện số bịa', () => {
    expect(methodFit(0, cls())).toBeNull()
    expect(methodFit(-5, cls())).toBeNull()
  })

  it('đếm đúng mốc lệch cho từng phương pháp trên cùng một cơ cấu', () => {
    // Thu 1000: thiết yếu 60% (quá trần 50 của 50/30/20, quá 55 của jars),
    // linh hoạt 30% (bằng đúng trần 30 = ĐẠT), để dành 10% (< sàn 20 mọi phương pháp).
    const data = cls({
      needByLevel: { ...emptyNeedByLevel(), essential: 600, flexible: 300 },
      totalExpense: 900,
    })
    const fits = methodFit(1_000, data)!
    const by = (id: string) => fits.find((f) => f.method.id === id)!

    const f503020 = by('50-30-20')
    expect(f503020.total).toBe(3)
    expect(f503020.missed).toEqual(['Thiết yếu', 'Để dành'])

    // 80/20: tổng chi 90% > trần 80, để dành hụt — lệch cả 2.
    expect(by('80-20').missed).toEqual(['Chi tiêu', 'Để dành'])

    // jars: thiết yếu 60% > 55; hưởng thụ 30% > 10; giáo dục/cho đi 0% dưới trần = đạt.
    expect(by('jars').missed).toEqual(['Thiết yếu', 'Hưởng thụ', 'Để dành'])
    expect(by('jars').total).toBe(5)
  })

  it('mỗi phương pháp trong danh sách truyền vào ra đúng một dòng, giữ thứ tự', () => {
    const fits = methodFit(1_000, cls({ totalExpense: 100 }))!
    expect(fits.map((f) => f.method.id)).toEqual(BUDGET_METHODS.map((m) => m.id))
  })

  it('tôn trọng mốc ĐÃ CHỈNH khi phương pháp truyền vào mang bps riêng', () => {
    // Trần thiết yếu nới lên 70% thì 60% không còn lệch nữa.
    const custom503020 = {
      ...BUDGET_METHODS[0],
      buckets: BUDGET_METHODS[0].buckets.map((b) =>
        b.key === 'essential' ? { ...b, bps: 7000 } : b,
      ),
    }
    const data = cls({
      needByLevel: { ...emptyNeedByLevel(), essential: 600, flexible: 300 },
      totalExpense: 900,
    })
    const [f] = methodFit(1_000, data, [custom503020])!
    expect(f.missed).toEqual(['Để dành'])
  })
})

describe('fitPhrase', () => {
  it('đạt hết thì nói đạt, lệch thì đếm kèm TÊN mốc', () => {
    const data = cls({
      needByLevel: { ...emptyNeedByLevel(), essential: 400, flexible: 250 },
      totalExpense: 650, // để dành 35% — 50/30/20 đạt cả ba
    })
    const fits = methodFit(1_000, data)!
    const ok = fits.find((f) => f.method.id === '50-30-20')!
    expect(fitPhrase(ok)).toBe('đạt cả 3 mốc')

    const jars = fits.find((f) => f.method.id === 'jars')!
    // hưởng thụ 25% > 10 — chỉ lệch một mốc chi, để dành 35% vượt sàn
    expect(fitPhrase(jars)).toBe('lệch 1/5 mốc — Hưởng thụ')
  })
})
