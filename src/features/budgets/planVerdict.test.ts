import { describe, expect, it } from 'vitest'
import { planVerdict } from './planVerdict'
import type { AxisKey, AxisLine, AxisProgress } from './axisTargets'
import type { PlanSummary } from './planning'

const line = (key: AxisKey, ok: boolean): AxisLine => ({
  key,
  actual: 0,
  target: 0,
  share: 0,
  targetShare: 0,
  direction: key === 'savings' ? 'floor' : 'cap',
  ok,
  slices: [],
})

const axis = (...oks: [AxisKey, boolean][]): AxisProgress => ({
  lines: oks.map(([k, ok]) => line(k, ok)),
  income: 480_000,
  actualIncome: 480_000,
  estimated: false,
  unclassified: 0,
})

const BA_MOC_DAT = axis(['essential', true], ['flexible', true], ['savings', true])

const sum = (p: Partial<PlanSummary> = {}): PlanSummary => ({
  income: 480_000,
  incomeSource: 'baseline',
  allocated: 326_000,
  unallocated: 154_000,
  axis: BA_MOC_DAT,
  ...p,
})

describe('planVerdict — im đúng chỗ', () => {
  it('chưa biết thu nhập thì không phán', () => {
    expect(planVerdict({ summary: sum({ incomeSource: 'unknown', income: 0 }), gapCount: 0 })).toBeNull()
  })

  // Mẫu số 0 mà nguồn lại là 'baseline' — chia cho 0 ra Infinity, câu phán thành
  // "giữ lại Infinity%".
  it('thu nhập 0 cũng không phán, kể cả khi có nguồn', () => {
    expect(planVerdict({ summary: sum({ income: 0 }), gapCount: 0 })).toBeNull()
  })

  // Bắt được khi chạy thật: tháng chưa đặt hạn mức nào thì cả ba mốc đều đạt một cách
  // rỗng, và bản đầu khen "Tốt: giữ lại 100% thu nhập".
  it('chưa chia đồng nào thì KHÔNG khen', () => {
    const v = planVerdict({
      summary: sum({ allocated: 0, unallocated: 480_000 }),
      gapCount: 0,
    })
    expect(v?.tone).toBe('info')
    expect(v?.text).toContain('Chưa đặt hạn mức nào')
    expect(v?.text).not.toContain('giữ lại')
  })

  it('chia rồi thì phán bình thường, kể cả một đồng', () => {
    expect(planVerdict({ summary: sum({ allocated: 1, unallocated: 479_999 }), gapCount: 0 })?.tone)
      .toBe('good')
  })

  it('chưa dựng được cơ cấu thì bỏ mệnh đề trục, không bịa', () => {
    const v = planVerdict({ summary: sum({ axis: null }), gapCount: 0 })
    expect(v?.text).toBe('Kế hoạch này giữ lại 32% thu nhập.')
  })
})

describe('planVerdict — câu của 18a', () => {
  it('ba mốc đạt + 2 danh mục hụt cam kết', () => {
    const v = planVerdict({ summary: sum(), gapCount: 2 })
    expect(v?.text).toBe(
      'Kế hoạch này giữ lại 32% thu nhập và đạt cả 3 mốc — nhưng 2 danh mục chưa phủ hết khoản đã cam kết.',
    )
    expect(v?.tone).toBe('warn')
  })

  it('phủ hết và đạt hết → good', () => {
    const v = planVerdict({ summary: sum(), gapCount: 0 })
    expect(v?.text).toBe('Kế hoạch này giữ lại 32% thu nhập và đạt cả 3 mốc.')
    expect(v?.tone).toBe('good')
  })

  it('lệch MỘT mốc thì gọi tên mốc đó', () => {
    const v = planVerdict({
      summary: sum({ axis: axis(['essential', true], ['flexible', false], ['savings', true]) }),
      gapCount: 0,
    })
    expect(v?.text).toContain('nhưng chưa đạt mốc Linh hoạt')
    expect(v?.tone).toBe('warn')
  })

  it('lệch NHIỀU mốc thì đếm, không liệt kê', () => {
    const v = planVerdict({
      summary: sum({ axis: axis(['essential', false], ['flexible', false], ['savings', true]) }),
      gapCount: 0,
    })
    expect(v?.text).toContain('nhưng lệch 2 mốc')
    expect(v?.text).not.toContain('Thiết yếu')
  })
})

// Lỗi ngữ pháp dễ mắc nhất khi ghép ba mệnh đề bằng chuỗi.
describe('planVerdict — không hai chữ "nhưng" trong một câu', () => {
  it('lệch mốc VÀ hụt cam kết thì mệnh đề sau đổi liên từ', () => {
    const v = planVerdict({
      summary: sum({ axis: axis(['essential', true], ['flexible', false], ['savings', true]) }),
      gapCount: 3,
    })
    expect(v?.text).toBe(
      'Kế hoạch này giữ lại 32% thu nhập nhưng chưa đạt mốc Linh hoạt, và 3 danh mục chưa phủ hết khoản đã cam kết.',
    )
    expect(v!.text.match(/nhưng/g)).toHaveLength(1)
  })
})

describe('planVerdict — chia quá tay', () => {
  it('nói NGƯỢC lại, không phải "giữ lại số âm"', () => {
    const v = planVerdict({
      summary: sum({ allocated: 540_000, unallocated: -60_000 }),
      gapCount: 0,
    })
    expect(v?.text).toContain('chia quá tay 13% thu nhập')
    expect(v?.text).not.toContain('giữ lại')
    expect(v?.text).not.toContain('Âm')
    expect(v?.tone).toBe('bad')
  })

  it('nặng hơn cả hụt cam kết — bản ngắn nói chia quá tay', () => {
    const v = planVerdict({
      summary: sum({ allocated: 540_000, unallocated: -60_000 }),
      gapCount: 4,
    })
    expect(v?.short).toBe('Chia quá tay 13% thu nhập.')
  })
})

describe('planVerdict — bản ngắn cho chế độ Gọn', () => {
  it('có cam kết hụt thì đó mới là mệnh đề quyết định', () => {
    expect(planVerdict({ summary: sum(), gapCount: 2 })?.short).toBe(
      '2 danh mục chưa phủ hết khoản đã cam kết.',
    )
  })

  it('không có gì hụt thì rơi về mệnh đề tỷ lệ', () => {
    expect(planVerdict({ summary: sum(), gapCount: 0 })?.short).toBe(
      'Kế hoạch này giữ lại 32% thu nhập.',
    )
  })

  it('bản ngắn luôn ngắn hơn bản đầy đủ', () => {
    for (const gapCount of [0, 1, 5]) {
      const v = planVerdict({ summary: sum(), gapCount })!
      expect(v.short.length, `gapCount=${gapCount}`).toBeLessThanOrEqual(v.text.length)
    }
  })
})
