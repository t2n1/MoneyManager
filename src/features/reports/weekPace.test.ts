import { describe, expect, it } from 'vitest'
import { weekPace } from './weekPace'

describe('weekPace', () => {
  const lastWeek = [100, 100, 100, 100, 100, 100, 100]

  it('so ĐÚNG số ngày đã trôi, không so với cả tuần trước', () => {
    // 4 ngày, mỗi ngày 100 → bằng đúng nhịp 4 ngày đầu tuần trước (400), không phải 700
    const r = weekPace({ thisWeek: [100, 100, 100, 100], lastWeek, dayOfWeek: 4 })
    expect(r?.priorSameDays).toBe(400)
    expect(r?.deltaPct).toBe(0)
  })

  it('tiêu nhanh hơn → tone warn', () => {
    const r = weekPace({ thisWeek: [200, 200, 200, 200], lastWeek, dayOfWeek: 4 })
    expect(r?.deltaPct).toBe(100)
    expect(r?.tone).toBe('warn')
  })

  it('tiêu chậm hơn → tone good', () => {
    const r = weekPace({ thisWeek: [50, 50, 50, 50], lastWeek, dayOfWeek: 4 })
    expect(r?.deltaPct).toBe(-50)
    expect(r?.tone).toBe('good')
  })

  it('tuần trước không chi gì → không chia cho 0, tone info', () => {
    const r = weekPace({ thisWeek: [100], lastWeek: [0, 0, 0, 0, 0, 0, 0], dayOfWeek: 1 })
    expect(r?.deltaPct).toBeNull()
    expect(r?.tone).toBe('info')
  })

  it('chưa có tuần trước → null', () => {
    expect(weekPace({ thisWeek: [100], lastWeek: [], dayOfWeek: 1 })).toBeNull()
  })

  it('tuần này chưa chi gì → vẫn trả kết quả (0 là thông tin thật)', () => {
    const r = weekPace({ thisWeek: [0, 0], lastWeek, dayOfWeek: 2 })
    expect(r?.spent).toBe(0)
    expect(r?.deltaPct).toBe(-100)
  })

  it('ngày trong tuần vượt số phần tử có → chỉ cộng những ngày thật có', () => {
    const r = weekPace({ thisWeek: [100, 100], lastWeek, dayOfWeek: 5 })
    expect(r?.spent).toBe(200)
    expect(r?.priorSameDays).toBe(500)
  })

  it('đi ngang thì tone info, không khen cũng không cảnh báo', () => {
    const r = weekPace({ thisWeek: [100, 100], lastWeek, dayOfWeek: 2 })
    expect(r?.deltaPct).toBe(0)
    expect(r?.tone).toBe('info')
  })
})
