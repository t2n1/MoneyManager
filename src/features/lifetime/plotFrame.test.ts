import { describe, expect, it } from 'vitest'
import { makeXScale } from './chartGeom'
import {
  PIN_W,
  PLOT_LEFT,
  laneBlocks,
  magnetToPhaseStart,
  pinEndX,
  pinRowCount,
  pinRowsOf,
  pinSpanWidth,
  plotRightOf,
  viewRange,
} from './plotFrame'

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

describe('viewRange', () => {
  it('cả đời = từ năm hiện tại tới năm cuối bản chiếu', () => {
    expect(viewRange(2026, 2064, 'all')).toEqual([2026, 2064])
  })

  it('zoom 10/20 cắt ở năm hiện tại + n', () => {
    expect(viewRange(2026, 2064, 10)).toEqual([2026, 2036])
    expect(viewRange(2026, 2064, 20)).toEqual([2026, 2046])
  })

  it('bản chiếu ngắn hơn khung zoom thì dừng ở năm cuối bản chiếu', () => {
    expect(viewRange(2026, 2030, 20)).toEqual([2026, 2030])
  })

  it('bản chiếu một năm vẫn ra một khoảng có bề rộng (không chia cho 0)', () => {
    expect(viewRange(2026, 2026, 'all')).toEqual([2026, 2027])
  })
})

describe('pinSpanWidth', () => {
  it('mốc một năm vẫn chiếm sàn 52px — icon 24px cộng chỗ cho nhãn kề bên', () => {
    expect(pinSpanWidth(300, 300)).toBe(52)
  })

  it('mốc dài thì chiếm đúng khoảng của nó cộng 42px cho chốt và khoảng thở', () => {
    expect(pinSpanWidth(300, 500)).toBe(242)
  })
})

describe('pinRowsOf', () => {
  const X0 = 2026
  const X1 = 2064
  const xs = makeXScale(X0, X1, PLOT_LEFT, plotRightOf(1200))

  it('mốc rời nhau thì cùng một hàng', () => {
    const rows = pinRowsOf(
      [
        { startYear: 2029, endYear: 2029 },
        { startYear: 2050, endYear: 2050 },
      ],
      xs,
      X1,
    )
    expect(rows).toEqual([0, 0])
  })

  it('mốc DÀI đẩy mốc bắt đầu trong khoảng của nó xuống hàng dưới', () => {
    // "Nuôi con 2031–2053" trùm gần hết trục; "Mua nhà 2034" phải xuống hàng.
    const rows = pinRowsOf(
      [
        { startYear: 2031, endYear: 2053 },
        { startYear: 2034, endYear: 2038 },
      ],
      xs,
      X1,
    )
    expect(rows).toEqual([0, 1])
  })

  it('mốc tới hết đời chiếm chỗ tới hết trục', () => {
    const rows = pinRowsOf(
      [
        { startYear: 2029, endYear: null },
        { startYear: 2059, endYear: 2059 },
      ],
      xs,
      X1,
    )
    expect(rows).toEqual([0, 1])
  })

  it('mép trái tính từ GIỮA icon, không từ điểm năm', () => {
    // Hai mốc cách nhau đúng bằng bề rộng chỗ: mốc sau vẫn phải xuống hàng vì icon của
    // mốc trước lấn sang trái nửa bề rộng của nó.
    const gan = makeXScale(2026, 2028, 0, 100)
    const rows = pinRowsOf(
      [
        { startYear: 2026, endYear: 2026 },
        { startYear: 2027, endYear: 2027 },
      ],
      gan,
      2028,
    )
    expect(rows).toEqual([0, 1])
    expect(pinSpanWidth(gan(2026), gan(2026))).toBeGreaterThan(PIN_W)
  })
})

describe('pinRowCount', () => {
  it('không có mốc nào vẫn chừa một hàng', () => {
    expect(pinRowCount([])).toBe(1)
  })

  it('đếm theo hàng CAO NHẤT, không theo số mốc', () => {
    expect(pinRowCount([0, 1, 0, 2])).toBe(3)
  })
})

describe('pinEndX', () => {
  it('đẩy chốt ra tối thiểu 30px khỏi icon — mốc 1 năm không bị chốt che', () => {
    expect(pinEndX(200, 205, 1000)).toBe(230)
  })

  it('mốc dài thì chốt đứng đúng năm kết thúc', () => {
    expect(pinEndX(200, 500, 1000)).toBe(500)
  })

  it('kẹp trong mép phải: mốc kết thúc NGOÀI khung nhìn không đẩy chốt ra khỏi vùng vẽ', () => {
    expect(pinEndX(200, 4000, 1000)).toBe(1000)
  })

  it('mép phải thắng cả sàn khoảng hở khi mốc bắt đầu sát mép', () => {
    expect(pinEndX(990, 995, 1000)).toBe(1000)
  })
})
