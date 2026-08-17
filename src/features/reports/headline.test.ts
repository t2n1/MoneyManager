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

// Mệnh đề thứ ba của bản vẽ 23a. Nó tồn tại vì hai vế của câu đo HAI TRỤC khác nhau và
// có thể ngược nhau — đo trên demo: giữ lại 65% (tốt theo trục thu nhập) trong khi dự báo
// ¥126k trên trần ¥68k (vượt 85%). Câu cũ phán "Tốt" ngay cạnh ô báo vượt gần gấp đôi.
describe('headlineOf — mệnh đề trên-đà so với ngân sách', () => {
  const base = { income: 289_161, expense: 101_482, priorExpense: 90_000, periodNoun: 'tháng này' }

  it('không truyền pace thì KHÔNG nói gì về ngân sách', () => {
    const h = headlineOf(base)!
    expect(h.text).not.toContain('ngân sách')
  })

  it('chưa đặt hạn mức (budgeted = 0) cũng im — không có trần nào để vượt', () => {
    const h = headlineOf({ ...base, pace: { forecast: 126_000, budgeted: 0 } })!
    expect(h.text).not.toContain('ngân sách')
  })

  it('trên đà dưới trần → nói ra, và giữ tông tốt', () => {
    const h = headlineOf({ ...base, pace: { forecast: 60_000, budgeted: 68_000 } })!
    expect(h.text).toContain('đang trên đà kết thúc tháng này dưới ngân sách')
    expect(h.tone).toBe('good')
  })

  it('trên đà vượt trần → nói % vượt, và HẠ tông từ good xuống warn', () => {
    const h = headlineOf({ ...base, pace: { forecast: 126_000, budgeted: 68_000 } })!
    expect(h.text).toContain('đang trên đà vượt ngân sách 85%')
    expect(h.tone).toBe('warn')
  })

  it('đúng bằng trần thì KHÔNG phải vượt', () => {
    const h = headlineOf({ ...base, pace: { forecast: 68_000, budgeted: 68_000 } })!
    expect(h.text).toContain('dưới ngân sách')
    expect(h.tone).toBe('good')
  })

  // Chi vượt thu vốn đã là 'bad'; vượt trần nữa thì không được NÂNG lên warn.
  it('không nâng tông đang xấu lên', () => {
    const h = headlineOf({
      income: 100_000,
      expense: 150_000,
      priorExpense: 90_000,
      periodNoun: 'tháng này',
      pace: { forecast: 200_000, budgeted: 68_000 },
    })!
    expect(h.tone).toBe('bad')
  })

  it('bản ngắn mang mệnh đề vượt trần — chế độ Gọn là mặc định', () => {
    const h = headlineOf({ ...base, pace: { forecast: 126_000, budgeted: 68_000 } })!
    expect(h.short).toContain('trên đà vượt trần 85%')
    expect(h.short).not.toContain('chi ')
  })

  it('không vượt thì bản ngắn nhường chỗ cho so-với-kỳ-trước', () => {
    const h = headlineOf({ ...base, pace: { forecast: 60_000, budgeted: 68_000 } })!
    expect(h.short).toContain('chi ')
    expect(h.short).not.toContain('trên đà')
  })
})
