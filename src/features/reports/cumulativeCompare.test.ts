import { describe, expect, it } from 'vitest'
import type { DaySpend } from './dailySpike'
import { cumulativeCompare } from './cumulativeCompare'

function day(date: string, total: number): DaySpend {
  return { date, total, top: [] }
}

/** Dựng tháng 9/2026 từ dãy tổng ngày — ngày 1 là phần tử đầu. */
function nay(totals: number[]): DaySpend[] {
  return totals.map((t, i) => day(`2026-09-${String(i + 1).padStart(2, '0')}`, t))
}

/** Cùng tháng năm ngoái (9/2025). */
function ngoai(totals: number[]): DaySpend[] {
  return totals.map((t, i) => day(`2025-09-${String(i + 1).padStart(2, '0')}`, t))
}

describe('cumulativeCompare', () => {
  it('cộng dồn từng ngày, ngày trống giữ nguyên mức cũ', () => {
    const r = cumulativeCompare(nay([100, 0, 50]), '2026-09-03', ngoai([10, 20, 30]))
    expect(r?.current).toEqual([100, 100, 150])
  })

  it('đường năm nay dừng ở cutoff, không vẽ ngày chưa xảy ra', () => {
    const r = cumulativeCompare(nay([100, 0, 50, 999, 999]), '2026-09-03', ngoai([10, 20, 30]))
    expect(r?.current).toEqual([100, 100, 150])
  })

  it('đường năm ngoái là lũy kế TRỌN tháng, không bị cutoff cắt', () => {
    const r = cumulativeCompare(nay([100]), '2026-09-01', ngoai([10, 20, 30]))
    expect(r?.prior).toEqual([10, 30, 60])
    expect(r?.priorTotal).toBe(60)
  })

  it('ngày hoàn tiền âm kéo lũy kế tụt xuống', () => {
    const r = cumulativeCompare(nay([100, -30]), '2026-09-02', ngoai([10, 20]))
    expect(r?.current).toEqual([100, 70])
  })

  it('priorAtSameDay là lũy kế năm ngoái tại đúng ngày-thứ-mấy hiện tại', () => {
    const r = cumulativeCompare(nay([100, 0, 50]), '2026-09-03', ngoai([10, 20, 30, 40]))
    expect(r?.priorAtSameDay).toBe(60)
  })

  it('tháng năm ngoái ngắn hơn thì priorAtSameDay dừng ở ngày cuối của nó', () => {
    const r = cumulativeCompare(nay([10, 10, 10]), '2026-09-03', ngoai([5, 5]))
    expect(r?.priorAtSameDay).toBe(10)
  })

  it('deltaPct so tại ngày hiện tại: (150 − 60) / 60 = +150%', () => {
    const r = cumulativeCompare(nay([100, 0, 50]), '2026-09-03', ngoai([10, 20, 30]))
    expect(r?.deltaPct).toBeCloseTo(150)
  })

  it('deltaPct là null khi năm ngoái tới ngày đó chưa chi đồng nào', () => {
    const r = cumulativeCompare(nay([100]), '2026-09-01', ngoai([0, 20]))
    expect(r?.deltaPct).toBeNull()
  })

  it('không có dữ liệu năm ngoái thì trả null — người gọi giấu biểu đồ', () => {
    expect(cumulativeCompare(nay([100]), '2026-09-01', [])).toBeNull()
  })
})
