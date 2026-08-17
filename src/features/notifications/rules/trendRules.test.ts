import { describe, expect, it } from 'vitest'
import {
  LEVEL_SHIFT_MIN_MONTHS,
  LEVEL_SHIFT_MIN_PCT,
  LEVEL_SHIFT_MIN_SEGMENT,
  levelShiftRule,
} from './trendRules'
import type { MonthlyExpensePoint, NotificationInput } from '../types'

/** Chuỗi tháng từ một mảng số, nhãn 2026-01 trở đi. */
const chuoi = (vals: number[]): MonthlyExpensePoint[] =>
  vals.map((value, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    value,
  }))

const inp = (
  monthlyExpense: MonthlyExpensePoint[] | undefined,
  totalBudgeted?: number,
): NotificationInput =>
  ({
    todayISO: '2026-12-20',
    monthStartDay: 1,
    base: 'JPY',
    rates: {},
    formatMoney: (m: number) => `¥${m.toLocaleString('en-US')}`,
    currencyOf: () => 'JPY',
    accounts: [],
    categories: [],
    debts: [],
    recurringRules: [],
    savingsGoals: [],
    networthSnapshots: [],
    recentTxs: [],
    monthlyExpense,
    budgetReport: totalBudgeted == null ? undefined : ({ totalBudgeted } as never),
    offTypes: [],
  }) as unknown as NotificationInput

// Sáu tháng ¥200k rồi sáu tháng ¥300k = +50%, mỗi đoạn 6 tháng.
const GAY = chuoi([200, 200, 210, 195, 205, 200, 300, 305, 295, 300, 310, 300].map((v) => v * 1000))

describe('levelShiftRule', () => {
  it('bắt được cú gãy và nói đúng tháng, đúng chiều, đúng %', () => {
    const [n] = levelShiftRule(inp(GAY))
    expect(n.type).toBe('trend-level-shift')
    expect(n.key).toBe('trend-level-shift:2026-07')
    expect(n.title).toContain('2026-07')
    expect(n.title).toContain('tăng')
    // TB 301.667 so với 201.667 = +49,59% → làm tròn 50.
    expect(n.title).toContain('50%')
    expect(n.to).toBe('/budget')
  })

  it('không bao giờ là mức gấp — nó không có hạn chót', () => {
    expect(levelShiftRule(inp(GAY))[0].severity).toBe('medium')
  })

  // §4.9: "→ đề nghị sửa hạn mức". Có trần thì phải so với trần.
  it('có ngân sách và mức mới vượt trần → nói ra cái trần', () => {
    const [n] = levelShiftRule(inp(GAY, 220_000))
    expect(n.detail).toContain('hạn mức')
    expect(n.detail).toContain('¥220,000')
  })

  it('chưa có ngân sách → vẫn báo, nhưng không bịa ra cái trần để so', () => {
    const [n] = levelShiftRule(inp(GAY))
    expect(n.detail).not.toContain('hạn mức')
    expect(n.detail).toContain('Trung bình')
  })

  it('mức mới KHÔNG vượt trần thì không nói chuyện trần', () => {
    const [n] = levelShiftRule(inp(GAY, 900_000))
    expect(n.detail).not.toContain('hạn mức')
  })
})

describe('levelShiftRule im lặng khi', () => {
  it('chưa tải xong chuỗi', () => {
    expect(levelShiftRule(inp(undefined))).toEqual([])
  })

  it('chuỗi ngắn hơn ngưỡng — dưới 12 tháng thì mọi dao động đều thành "gãy"', () => {
    expect(levelShiftRule(inp(GAY.slice(0, LEVEL_SHIFT_MIN_MONTHS - 1)))).toEqual([])
  })

  it('mức chi phẳng', () => {
    expect(levelShiftRule(inp(chuoi(Array(12).fill(200_000))))).toEqual([])
  })

  // Đây là ca quan trọng nhất: chắc chắn về THỐNG KÊ nhưng nhỏ về TIỀN.
  it('cú gãy rất chắc nhưng dưới ngưỡng phần trăm', () => {
    const deu = [200, 200, 200, 200, 200, 200, 208, 208, 208, 208, 208, 208]
    const r = levelShiftRule(inp(chuoi(deu.map((v) => v * 1000))))
    expect(Math.round((208 / 200 - 1) * 100)).toBeLessThan(LEVEL_SHIFT_MIN_PCT)
    expect(r).toEqual([])
  })

  // Ca này từng LỌT trước khi có điều kiện "ở yên": minSegment 4 buộc chỗ cắt lùi về
  // tháng 9, nên đoạn sau thành [200, 400, 400, 400] — trung bình 350, t rất cao, và
  // luật báo "đổi hẳn từ tháng 9" trong khi tháng 9 vẫn y như cũ.
  it('bậc cao chỉ kéo dài 3 tháng — một chuyến đi, không phải một nếp', () => {
    const chuyenDi = [200, 200, 200, 200, 200, 200, 200, 200, 200, 400, 400, 400]
    expect(levelShiftRule(inp(chuoi(chuyenDi.map((v) => v * 1000))))).toEqual([])
  })

  it('vọt hai tháng cuối cũng không đủ', () => {
    const vot = [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 400, 400]
    expect(levelShiftRule(inp(chuoi(vot.map((v) => v * 1000))))).toEqual([])
  })

  it('nửa đầu bằng 0 (mới nhập dữ liệu) không phải nếp sống đổi', () => {
    const moiNhap = [0, 0, 0, 0, 0, 0, 200, 210, 205, 200, 195, 200]
    expect(levelShiftRule(inp(chuoi(moiNhap.map((v) => v * 1000))))).toEqual([])
  })
})

describe('hằng số', () => {
  it('minSegment 4 cần ít nhất 8 tháng, và ngưỡng chuỗi rộng hơn thế', () => {
    expect(LEVEL_SHIFT_MIN_MONTHS).toBeGreaterThan(LEVEL_SHIFT_MIN_SEGMENT * 2)
  })
})
