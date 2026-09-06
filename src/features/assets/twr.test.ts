import { describe, expect, it } from 'vitest'
import { periodReturns, twrSeries, type NavFlow } from './twr'

/** Chuỗi phiên liền nhau từ 2026-01-05, mỗi phần tử là [nav, flow]. */
const chuoi = (from: string, rows: [number, number][]): NavFlow[] => {
  const d = new Date(`${from}T00:00:00Z`)
  return rows.map(([nav, flow], i) => {
    const x = new Date(d)
    x.setUTCDate(x.getUTCDate() + i)
    return { date: x.toISOString().slice(0, 10), nav, flow }
  })
}

/** Làm tròn về 2 số lẻ để so sánh phần trăm cho khỏi vướng sai số dấu phẩy động. */
const p2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100)

describe('twrSeries', () => {
  it('phiên đầu luôn ở 0%', () => {
    const r = twrSeries(chuoi('2026-01-05', [[1_000, 0], [1_100, 0]]))
    expect(r[0].percent).toBe(0)
    expect(r[0].index).toBe(1)
  })

  it('không có dòng tiền: lợi nhuận bằng đúng thay đổi giá trị', () => {
    const r = twrSeries(chuoi('2026-01-05', [[1_000, 0], [1_100, 0]]))
    expect(p2(r[1].percent)).toBe(10)
  })

  it('NẠP tiền giữa kỳ không đổi lợi nhuận — đây là cả lý do file này tồn tại', () => {
    // Không nạp: 1.000 → 1.100 → 1.210, tức +10% rồi +10% = +21%
    const khongNap = twrSeries(chuoi('2026-01-05', [[1_000, 0], [1_100, 0], [1_210, 0]]))
    // Nạp 1.000 ở phiên 2, rồi cả rổ 2.100 tăng 10% thành 2.310
    const coNap = twrSeries(chuoi('2026-01-05', [[1_000, 0], [2_100, 1_000], [2_310, 0]]))

    expect(p2(khongNap.at(-1)!.percent)).toBe(21)
    expect(p2(coNap.at(-1)!.percent)).toBe(21)
  })

  it('RÚT tiền giữa kỳ cũng không đổi lợi nhuận', () => {
    // 1.000 → +10% = 1.100 → rút 500 còn 600 → +10% = 660
    const r = twrSeries(chuoi('2026-01-05', [[1_000, 0], [600, -500], [660, 0]]))
    expect(p2(r.at(-1)!.percent)).toBe(21)
  })

  it('danh mục còn rỗng thì đứng ở 0%, không chia cho 0', () => {
    const r = twrSeries(chuoi('2026-01-05', [[0, 0], [0, 0], [1_000, 1_000], [1_100, 0]]))
    expect(r.map((x) => p2(x.percent))).toEqual([0, 0, 0, 10])
  })

  it('bán sạch rồi thì lợi nhuận đứng lại, không nhảy số', () => {
    const r = twrSeries(chuoi('2026-01-05', [[1_000, 0], [1_100, 0], [0, -1_100], [0, 0]]))
    expect(p2(r.at(-1)!.percent)).toBe(10)
  })

  it('chuỗi rỗng trả rỗng', () => {
    expect(twrSeries([])).toEqual([])
  })
})

describe('periodReturns', () => {
  /** Hai năm phiên ngày-liền-ngày, tăng đều để tổng đúng +21%. */
  const haiNam = (): NavFlow[] => {
    const out: NavFlow[] = []
    const n = 731 // 2025-01-01 .. 2026-12-31 (2026 nhuận? không — đủ để test)
    for (let i = 0; i < n; i++) {
      const d = new Date('2025-01-01T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + i)
      out.push({
        date: d.toISOString().slice(0, 10),
        nav: 1_000 * 1.21 ** (i / (n - 1)),
        flow: 0,
      })
    }
    return out
  }

  it('tổng bằng đúng % của phiên cuối trong chuỗi', () => {
    const s = chuoi('2026-01-05', [[1_000, 0], [1_100, 0]])
    expect(p2(periodReturns(s).total)).toBe(10)
  })

  it('một tuần lấy mốc phiên gần nhất cách 7 ngày', () => {
    // 9 phiên liền nhau 05→13; mốc "1 tuần" là 06 (13 − 7 ngày)
    const navs: [number, number][] = Array.from({ length: 9 }, (_, i) => [1_000 + i * 10, 0])
    const s = chuoi('2026-01-05', navs)
    // 1.080 / 1.010 − 1 = 6,93%
    expect(p2(periodReturns(s).week)).toBe(6.93)
  })

  it('chuỗi ngắn hơn một tuần thì trả null chứ không lấy phiên đầu', () => {
    const s = chuoi('2026-01-05', [[1_000, 0], [1_100, 0]])
    expect(periodReturns(s).week).toBeNull()
  })

  it('từ đầu năm lấy mốc phiên CUỐI của năm trước', () => {
    const s: NavFlow[] = [
      { date: '2025-12-30', nav: 1_000, flow: 0 },
      { date: '2025-12-31', nav: 1_050, flow: 0 },
      { date: '2026-01-05', nav: 1_155, flow: 0 },
    ]
    // 1.155 / 1.050 − 1 = 10%
    expect(p2(periodReturns(s).ytd)).toBe(10)
  })

  it('danh mục mở giữa năm thì từ đầu năm tính từ phiên đầu tiên có thật', () => {
    const s = chuoi('2026-03-02', [[1_000, 0], [1_100, 0]])
    expect(p2(periodReturns(s).ytd)).toBe(10)
  })

  // Hai ca dưới dùng `toBeCloseTo`: mốc "một năm trước" là PHIÊN GẦN NHẤT trước ngày đó,
  // và lịch không chia tròn thành nửa chuỗi, nên con số thật là 10,03% chứ không phải 10%
  // chằn. Ép về 10 chằn thì phải bẻ luật chọn mốc — luật quan trọng hơn số tròn.
  it('một năm: chuỗi hai năm tăng 21% thì một năm gần nhất ra ~10%', () => {
    expect(periodReturns(haiNam()).year).toBeCloseTo(10, 1)
  })

  it('lãi kép bình quân: hai năm +21% ra ~10%/năm', () => {
    expect(periodReturns(haiNam()).cagr).toBeCloseTo(10, 1)
  })

  it('khung ngắn hơn một năm thì lãi kép trả null — năm hoá một tháng là bịa', () => {
    const s = chuoi('2026-01-05', [[1_000, 0], [1_100, 0]])
    expect(periodReturns(s).cagr).toBeNull()
  })

  it('chuỗi rỗng thì mọi con số là null, không phải 0', () => {
    expect(periodReturns([])).toEqual({ total: null, week: null, ytd: null, year: null, cagr: null })
  })
})
