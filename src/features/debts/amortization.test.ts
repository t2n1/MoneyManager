import { describe, expect, it } from 'vitest'
import { addMonthsISO, buildSchedule, monthlyPayment } from './amortization'

describe('addMonthsISO', () => {
  it('cộng tháng thường', () => {
    expect(addMonthsISO('2026-01-15', 1)).toBe('2026-02-15')
    expect(addMonthsISO('2026-01-15', 12)).toBe('2027-01-15')
  })
  it('kẹp về ngày cuối tháng ngắn', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsISO('2024-01-31', 1)).toBe('2024-02-29') // năm nhuận
  })
})

describe('monthlyPayment', () => {
  it('không lãi → chia đều gốc', () => {
    expect(monthlyPayment(120000, 0, 12)).toBe(10000)
  })
  it('có lãi → theo niên kim (lớn hơn chia đều)', () => {
    // Vay 1.000.000, 12%/năm (1200 bps), 12 kỳ → ~88.849/kỳ
    const p = monthlyPayment(1000000, 1200, 12)
    expect(p).toBeGreaterThan(83333) // > chia đều không lãi
    expect(p).toBe(88849)
  })
  it('kỳ hạn 0 → 0', () => {
    expect(monthlyPayment(100000, 500, 0)).toBe(0)
  })
})

describe('buildSchedule', () => {
  it('không lãi: gốc chia đều, dư nợ về 0', () => {
    const s = buildSchedule({ principalMinor: 120000, bps: 0, termMonths: 12, startISO: '2026-01-01' })
    expect(s.rows).toHaveLength(12)
    expect(s.totalInterest).toBe(0)
    expect(s.rows[11].balance).toBe(0)
    expect(s.rows[0].dueOn).toBe('2026-01-01')
    expect(s.rows[11].dueOn).toBe('2026-12-01')
  })

  it('có lãi: dư nợ về đúng 0 ở kỳ cuối, tổng trả = gốc + lãi', () => {
    const s = buildSchedule({ principalMinor: 1000000, bps: 1200, termMonths: 12, startISO: '2026-01-01' })
    expect(s.rows).toHaveLength(12)
    expect(s.rows[11].balance).toBe(0)
    expect(s.totalInterest).toBeGreaterThan(0)
    expect(s.totalPaid).toBe(1000000 + s.totalInterest)
    // Tổng các phần gốc = gốc ban đầu
    const sumPrincipal = s.rows.reduce((a, r) => a + r.principal, 0)
    expect(sumPrincipal).toBe(1000000)
    // Tổng các phần lãi = totalInterest
    const sumInterest = s.rows.reduce((a, r) => a + r.interest, 0)
    expect(sumInterest).toBe(s.totalInterest)
  })

  it('kỳ đầu lãi nhiều hơn kỳ sau (dư nợ giảm dần)', () => {
    const s = buildSchedule({ principalMinor: 1000000, bps: 1200, termMonths: 12, startISO: '2026-01-01' })
    expect(s.rows[0].interest).toBeGreaterThan(s.rows[10].interest)
  })
})
