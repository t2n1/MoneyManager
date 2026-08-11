import { describe, expect, it } from 'vitest'
import { headlineOf, shortCompare } from './headline'

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

// Bản ngắn dùng cho chip ở chế độ Gọn. Kiểm cả cái nó PHẢI CÓ (con số) và cái nó
// KHÔNG được có (mệnh đề giải thích) — nếu chỉ kiểm "ngắn hơn text" thì một chuỗi
// cứng như "Cần chú ý" cũng qua, mà đó đúng là cái chip này tồn tại để tránh.
describe('headlineOf → short', () => {
  const base = { income: 400_000, expense: 300_000, priorExpense: 250_000, periodNoun: 'tháng này' }

  it('giữ lại được thì nói tỷ lệ giữ lại kèm chiều chi so kỳ trước', () => {
    expect(headlineOf(base)?.short).toBe('Giữ lại 25% · chi +20%')
  })

  it('chi vượt thu thì nói ngay điều đó', () => {
    expect(headlineOf({ ...base, expense: 500_000 })?.short).toContain('Chi vượt thu 25%')
  })

  it('không có thu → không bịa ra tỷ lệ', () => {
    const r = headlineOf({ ...base, income: 0 })
    expect(r?.short).toBe('Chưa có thu · chi +20%')
  })

  it('không so được kỳ trước thì bỏ hẳn mệnh đề so sánh', () => {
    expect(headlineOf({ ...base, priorExpense: null })?.short).toBe('Giữ lại 25%')
    expect(headlineOf({ ...base, priorExpense: 300_000 })?.short).toBe('Giữ lại 25%')
  })

  it('luôn ngắn hơn câu đầy đủ và không mang mệnh đề giải thích', () => {
    for (const input of [
      base,
      { ...base, expense: 500_000 },
      { ...base, income: 0 },
      { ...base, priorExpense: 25_000 },
    ]) {
      const r = headlineOf(input)!
      expect(r.short.length).toBeLessThan(r.text.length)
      expect(r.short).not.toContain('thu nhập')
      expect(r.short).not.toContain('kỳ trước')
      expect(r.short).not.toContain('rút vào tiền cũ')
    }
  })

  it('vẫn đọc theo SỐ LẦN khi vượt mốc 200%', () => {
    expect(headlineOf({ ...base, priorExpense: 25_000 })?.short).toBe('Giữ lại 25% · chi gấp 12,0 lần')
  })
})

describe('shortCompare', () => {
  it('dùng dấu ASCII, không dùng dấu trừ Unicode (lệch bề rộng dù đã tabular-nums)', () => {
    expect(shortCompare(20)).toBe('+20%')
    expect(shortCompare(-20)).toBe('-20%')
    expect(shortCompare(-20)).not.toContain('−')
  })

  it('từ 200% trở lên đọc theo số lần', () => {
    expect(shortCompare(199)).toBe('+199%')
    expect(shortCompare(200)).toBe('gấp 3,0 lần')
    expect(shortCompare(1100)).toBe('gấp 12,0 lần')
  })
})
