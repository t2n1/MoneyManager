import { describe, expect, it } from 'vitest'
import { headlineOf } from './headline'

describe('headlineOf', () => {
  const base = { income: 400_000, expense: 300_000, priorExpense: 250_000, periodNoun: 'tháng này' }

  it('chưa có thu lẫn chi → null', () => {
    expect(headlineOf({ ...base, income: 0, expense: 0 })).toBeNull()
  })

  it('giữ lại được 25% → đạt mốc 20%, tone good', () => {
    const r = headlineOf(base)
    expect(r?.ratePct).toBe(25)
    expect(r?.tone).toBe('good')
  })

  it('chi vượt thu → tone bad', () => {
    const r = headlineOf({ ...base, expense: 500_000 })
    expect(r?.tone).toBe('bad')
    expect(r?.ratePct).toBe(-25)
  })

  it('giữ lại dưới 20% → tone warn', () => {
    const r = headlineOf({ ...base, expense: 360_000 })
    expect(r?.ratePct).toBe(10)
    expect(r?.tone).toBe('warn')
  })

  it('không có thu → không tính được tỷ lệ, tone info', () => {
    const r = headlineOf({ ...base, income: 0 })
    expect(r?.ratePct).toBeNull()
    expect(r?.tone).toBe('info')
  })

  it('so với kỳ trước: chi nhiều hơn 20%', () => {
    expect(headlineOf(base)?.deltaPct).toBe(20)
  })

  it('không có kỳ trước → deltaPct null, câu chữ không nhắc so sánh', () => {
    const r = headlineOf({ ...base, priorExpense: null })
    expect(r?.deltaPct).toBeNull()
    expect(r?.text).not.toContain('kỳ trước')
  })

  it('kỳ trước bằng 0 → không chia cho 0', () => {
    expect(headlineOf({ ...base, priorExpense: 0 })?.deltaPct).toBeNull()
  })

  it('chi y hệt kỳ trước → không nhắc so sánh trong câu', () => {
    const r = headlineOf({ ...base, priorExpense: 300_000 })
    expect(r?.deltaPct).toBe(0)
    expect(r?.text).not.toContain('kỳ trước')
  })

  it('câu chữ luôn kết thúc bằng dấu chấm', () => {
    expect(headlineOf(base)?.text.endsWith('.')).toBe(true)
  })

  it('không nhắc mốc 50/30/20 — thẻ ngay dưới đã nói câu đó', () => {
    expect(headlineOf(base)?.text).not.toContain('50/30/20')
  })

  it('chi gấp nhiều lần kỳ trước → đọc theo SỐ LẦN, không theo phần trăm', () => {
    // kỳ trước 25.000, kỳ này 300.000 → +1100%, đọc thành "gấp 12,0 lần"
    const r = headlineOf({ ...base, priorExpense: 25_000 })
    expect(r?.deltaPct).toBe(1100)
    expect(r?.text).toContain('gấp 12,0 lần kỳ trước')
    expect(r?.text).not.toContain('1100%')
  })

  it('ngay dưới mốc 200% thì vẫn đọc theo phần trăm', () => {
    // kỳ trước 120.000, kỳ này 300.000 → +150%
    const r = headlineOf({ ...base, priorExpense: 120_000 })
    expect(r?.deltaPct).toBe(150)
    expect(r?.text).toContain('nhiều hơn kỳ trước 150%')
  })
})
