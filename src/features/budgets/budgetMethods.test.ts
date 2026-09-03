import { describe, expect, it } from 'vitest'
import { BUDGET_METHODS, bucketForNeed, clampBps, resolveMethod } from './budgetMethods'
import type { NeedLevel } from '../../types/database.types'

const NEED_LEVELS: readonly NeedLevel[] = ['essential', 'flexible', 'education', 'giving', 'buffer']
const profile = (budget_method: string, budget_targets: Record<string, number> = {}) =>
  ({ budget_method, budget_targets })

describe('BUDGET_METHODS — bất biến cấu trúc', () => {
  it('có đúng 6 phương pháp, id không trùng', () => {
    expect(BUDGET_METHODS).toHaveLength(6)
    expect(new Set(BUDGET_METHODS.map((m) => m.id)).size).toBe(6)
  })

  for (const m of BUDGET_METHODS) {
    describe(m.id, () => {
      it('có đúng một khoản Để dành: residual, floor, key savings', () => {
        const residuals = m.buckets.filter((b) => b.source.kind === 'residual')
        expect(residuals).toHaveLength(1)
        expect(residuals[0].direction).toBe('floor')
        expect(residuals[0].key).toBe('savings')
      })

      it('khoá khoản không trùng nhau', () => {
        const keys = m.buckets.map((b) => b.key)
        expect(new Set(keys).size).toBe(keys.length)
      })

      // Bất biến quan trọng nhất (spec: "Luật xương sống"): thiếu một nhãn là tiền
      // biến mất lặng lẽ, nhãn ở hai khoản là tiền đếm hai lần.
      it('mỗi nhãn có nhà ở ĐÚNG MỘT khoản', () => {
        const hasAll = m.buckets.some((b) => b.source.kind === 'allExpense')
        for (const level of NEED_LEVELS) {
          const homes = m.buckets.filter(
            (b) => b.source.kind === 'needs' && b.source.levels.includes(level),
          )
          expect(homes.length, `${m.id} / ${level}`).toBe(hasAll ? 0 : 1)
        }
        // allExpense phải là khoản chi DUY NHẤT — đặt một khoản needs cạnh nó là
        // đếm phần tiền đó hai lần.
        if (hasAll) {
          expect(m.buckets.filter((b) => b.source.kind !== 'residual')).toHaveLength(1)
        }
      })

      it('tổng bps mặc định = 100%', () => {
        expect(m.buckets.reduce((s, b) => s + b.bps, 0)).toBe(10_000)
      })

      it('khoản chi là cap, khoản dư là floor', () => {
        for (const b of m.buckets)
          expect(b.direction).toBe(b.source.kind === 'residual' ? 'floor' : 'cap')
      })
    })
  }
})

describe('resolveMethod', () => {
  it('id lạ / null / undefined → 50-30-20 nguyên mặc định', () => {
    for (const p of [profile('phuong-phap-tu-che'), null, undefined]) {
      const m = resolveMethod(p)
      expect(m.id).toBe('50-30-20')
      expect(m.buckets.map((b) => b.bps)).toEqual([5000, 3000, 2000])
    }
  })

  it('chỉ đè khoá có trong budget_targets, khoá còn lại giữ mặc định', () => {
    const m = resolveMethod(profile('jars', { essential: 6000 }))
    expect(m.buckets.find((b) => b.key === 'essential')!.bps).toBe(6000)
    expect(m.buckets.find((b) => b.key === 'flexible')!.bps).toBe(1000)
  })

  it('giá trị ngoài khoảng bị kẹp 0..10000, giá trị không phải số bị bỏ', () => {
    const m = resolveMethod(
      profile('50-30-20', { essential: 99_999, flexible: -5, savings: 'hai mươi' } as never),
    )
    expect(m.buckets.find((b) => b.key === 'essential')!.bps).toBe(10_000)
    expect(m.buckets.find((b) => b.key === 'flexible')!.bps).toBe(0)
    expect(m.buckets.find((b) => b.key === 'savings')!.bps).toBe(2000)
  })

  it('budget_targets không phải object (jsonb hỏng) → mặc định', () => {
    const m = resolveMethod({ budget_method: '80-20', budget_targets: [1, 2] as never })
    expect(m.buckets.find((b) => b.key === 'allSpend')!.bps).toBe(8000)
  })
})

describe('bucketForNeed', () => {
  const by = (id: string) => BUDGET_METHODS.find((m) => m.id === id)!

  it('kakeibo: giving về khoản Hưởng thụ (key flexible)', () => {
    expect(bucketForNeed(by('kakeibo'), 'giving')!.key).toBe('flexible')
  })

  it('80-20: mọi nhãn, kể cả null, đều về allSpend — chi nào cũng đã được đếm', () => {
    expect(bucketForNeed(by('80-20'), 'essential')!.key).toBe('allSpend')
    expect(bucketForNeed(by('80-20'), null)!.key).toBe('allSpend')
  })

  it('nhãn null ở phương pháp needs → null (chưa phân loại)', () => {
    expect(bucketForNeed(by('jars'), null)).toBeNull()
  })
})

describe('clampBps', () => {
  it('null → fallback; ngoài khoảng → kẹp', () => {
    expect(clampBps(null, 5000)).toBe(5000)
    expect(clampBps(20_000, 5000)).toBe(10_000)
    expect(clampBps(-1, 5000)).toBe(0)
  })
})
