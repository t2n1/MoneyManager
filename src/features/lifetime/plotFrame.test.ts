import { describe, expect, it } from 'vitest'
import { makeXScale } from './chartGeom'
import { PLOT_LEFT, laneBlocks, magnetToPhaseStart, plotRightOf } from './plotFrame'

/** Thang thật của màn: 2026–2064 trên một hộp rộng 1200px. */
const X0 = 2026
const X1 = 2064
const RIGHT = plotRightOf(1200)
const xs = makeXScale(X0, X1, PLOT_LEFT, RIGHT)

/** Ba chặng của bản demo (đi làm ở Nhật / về Việt Nam / nghỉ hưu). */
const BA_CHANG = [
  { id: 'a', startYear: 2026 },
  { id: 'b', startYear: 2040 },
  { id: 'c', startYear: 2056 },
]

describe('laneBlocks', () => {
  it('kín trục: khối đầu bắt ở mép trái, khối cuối kết ở mép phải', () => {
    const b = laneBlocks(BA_CHANG, X0, X1, xs)
    expect(b).toHaveLength(3)
    expect(b[0].left).toBeCloseTo(PLOT_LEFT, 6)
    expect(b[2].left + b[2].width).toBeCloseTo(RIGHT, 6)
  })

  it('không hở, không chồng: mép phải khối này ĐÚNG BẰNG mép trái khối kế', () => {
    const b = laneBlocks(BA_CHANG, X0, X1, xs)
    for (let i = 0; i + 1 < b.length; i++) {
      expect(b[i].left + b[i].width).toBeCloseTo(b[i + 1].left, 6)
    }
  })

  it('giữ nguyên bất biến khi hai chặng chỉ cách nhau MỘT năm', () => {
    // Đây là ca mà sàn `max(56, …)` của bản vẽ làm hai khối chồng nhau 40px.
    const b = laneBlocks(
      [
        { id: 'a', startYear: 2026 },
        { id: 'b', startYear: 2027 },
        { id: 'c', startYear: 2056 },
      ],
      X0,
      X1,
      xs,
    )
    expect(b[0].left + b[0].width).toBeCloseTo(b[1].left, 6)
    expect(b[0].width).toBeLessThan(56)
  })

  it('tự sắp theo năm nên chặng đầu/cuối không phụ thuộc thứ tự mảng', () => {
    const b = laneBlocks([BA_CHANG[2], BA_CHANG[0], BA_CHANG[1]], X0, X1, xs)
    expect(b.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(b[0].first).toBe(true)
    expect(b[0].last).toBe(false)
    expect(b[2].last).toBe(true)
  })

  it('năm kết thúc = năm bắt đầu của chặng kế trừ 1; chặng cuối chạy tới hết bản chiếu', () => {
    const b = laneBlocks(BA_CHANG, X0, X1, xs)
    expect(b.map((x) => x.endYear)).toEqual([2039, 2055, X1])
  })

  it('chặng bắt đầu TRƯỚC khung nhìn vẫn phủ khung nhìn, cắt ở x0', () => {
    const b = laneBlocks([{ id: 'a', startYear: 2010 }, BA_CHANG[1]], X0, X1, xs)
    expect(b[0].left).toBeCloseTo(PLOT_LEFT, 6)
    // Năm bắt đầu THẬT giữ nguyên — nó là dữ liệu, chỉ hình bị cắt.
    expect(b[0].startYear).toBe(2010)
  })

  it('chặng ngoài khung nhìn bị loại khỏi dải', () => {
    // Zoom 10 năm: 2040 và 2056 nằm ngoài [2026, 2036].
    const hep = makeXScale(X0, X0 + 10, PLOT_LEFT, RIGHT)
    const b = laneBlocks(BA_CHANG, X0, X0 + 10, hep)
    expect(b.map((x) => x.id)).toEqual(['a'])
    expect(b[0].width).toBeCloseTo(RIGHT - PLOT_LEFT, 6)
  })

  it('không có chặng nào thì không có khối nào', () => {
    expect(laneBlocks([], X0, X1, xs)).toEqual([])
  })
})

describe('magnetToPhaseStart', () => {
  const starts = [2026, 2040, 2056]

  it('bám vào ranh giới khi cách 1 năm', () => {
    expect(magnetToPhaseStart(2039, starts)).toBe(2040)
    expect(magnetToPhaseStart(2041, starts)).toBe(2040)
    expect(magnetToPhaseStart(2040, starts)).toBe(2040)
  })

  it('cách 2 năm thì để nguyên — nam châm chỉ ±1', () => {
    expect(magnetToPhaseStart(2038, starts)).toBe(2038)
    expect(magnetToPhaseStart(2042, starts)).toBe(2042)
  })

  it('chọn ranh giới GẦN NHẤT, không phải cái đầu tiên trong mảng', () => {
    // 2032 gần 2033 hơn 2035, dù 2035 đứng trước trong mảng.
    expect(magnetToPhaseStart(2033, [2035, 2032], 2)).toBe(2032)
  })

  it('cách đều hai ranh giới thì giữ cái ĐỨNG TRƯỚC trong danh sách (đã sắp = năm sớm hơn)', () => {
    expect(magnetToPhaseStart(2031, [2030, 2032])).toBe(2030)
  })

  it('không có chặng nào thì không bám vào đâu', () => {
    expect(magnetToPhaseStart(2035, [])).toBe(2035)
  })
})
