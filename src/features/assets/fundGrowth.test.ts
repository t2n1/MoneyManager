import { describe, expect, it } from 'vitest'
import { fundGrowth, type GrowthTrade } from './fundGrowth'

// TIỀN lấy từ `amount` (yên THẬT đã trừ/nhận), KHÔNG suy từ `units × nav ÷ 10.000`.
// Lý do ghi ở đầu fundHoldings.ts: Rakuten tính 口数 TỪ số tiền, nên suy ngược lại là lấy
// đầu ra dựng lại đầu vào — đo trên sao kê thật lệch 0,93 ¥ mỗi lệnh, và 136 lệnh thì trôi
// thấy được. `units` chỉ dùng để biết đang giữ bao nhiêu 口.
const mua = (on: string, units: number, amount: number): GrowthTrade => ({
  kind: 'buy',
  tradedOn: on,
  units,
  amount,
})
const ban = (on: string, units: number, amount: number): GrowthTrade => ({
  kind: 'sell',
  tradedOn: on,
  units,
  amount,
})

/** ngày → 基準価額 (¥/1万口) */
const gia = (rows: [string, number][]) => new Map(rows)

const p2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100)

describe('fundGrowth', () => {
  it('đường "quỹ tự chạy" là 基準価額 chuẩn hoá về mốc đầu, không dính gì tới sổ lệnh', () => {
    const r = fundGrowth({
      trades: [mua('2026-01-05', 10_000, 10_000)],
      navByDate: gia([
        ['2026-01-05', 10_000],
        ['2026-01-06', 11_000],
        ['2026-01-07', 12_000],
      ]),
    })
    expect(r.points.map((x) => p2(x.fund))).toEqual([0, 10, 20])
  })

  it('mua một lần rồi giữ: "tiền của bạn" trùng "quỹ tự chạy"', () => {
    const r = fundGrowth({
      trades: [mua('2026-01-05', 10_000, 10_000)],
      navByDate: gia([
        ['2026-01-05', 10_000],
        ['2026-01-06', 11_000],
      ]),
    })
    expect(p2(r.points.at(-1)!.mine)).toBe(p2(r.points.at(-1)!.fund))
  })

  it('mua thêm lúc giá CAO thì "tiền của bạn" tụt dưới "quỹ tự chạy" — cả lý do có biểu đồ này', () => {
    const r = fundGrowth({
      // 10.000 ¥ ở nav 10.000 → 10.000 口; rồi 20.000 ¥ ở nav 20.000 → 10.000 口
      trades: [mua('2026-01-05', 10_000, 10_000), mua('2026-01-07', 10_000, 20_000)],
      navByDate: gia([
        ['2026-01-05', 10_000],
        ['2026-01-06', 15_000],
        ['2026-01-07', 20_000],
      ]),
    })
    const cuoi = r.points.at(-1)!
    expect(p2(cuoi.fund)).toBe(100)
    // Bỏ ra 30.000, đang giữ 20.000 口 × 20.000 ÷ 10.000 = 40.000 → +33,33%
    expect(p2(cuoi.mine)).toBe(33.33)
    expect(cuoi.mine!).toBeLessThan(cuoi.fund)
  })

  it('BÁN BỚT không làm tỷ lệ phụt lên: tiền đã thu về vẫn nằm trong tử số', () => {
    const r = fundGrowth({
      trades: [mua('2026-01-05', 10_000, 10_000), ban('2026-01-07', 10_000, 20_000)],
      navByDate: gia([
        ['2026-01-05', 10_000],
        ['2026-01-06', 15_000],
        ['2026-01-07', 20_000],
        ['2026-01-08', 30_000],
      ]),
    })
    const cuoi = r.points.at(-1)!
    // Thu về 20.000 trên 10.000 bỏ ra = +100%, và KHÔNG đổi nữa dù quỹ tiếp tục chạy.
    expect(p2(cuoi.mine)).toBe(100)
    // Quỹ thì vẫn chạy tới +200% — khoảng cách chính là phần bán sớm bỏ lỡ.
    expect(p2(cuoi.fund)).toBe(200)
  })

  it('mẫu số chỉ TĂNG — bán sạch rồi vẫn không có phép chia cho số bé', () => {
    const r = fundGrowth({
      trades: [mua('2026-01-05', 10_000, 10_000), ban('2026-01-06', 10_000, 10_000)],
      navByDate: gia([
        ['2026-01-05', 10_000],
        ['2026-01-06', 10_000],
        ['2026-01-07', 10_000],
      ]),
    })
    expect(r.points.every((x) => x.mine !== null && Number.isFinite(x.mine))).toBe(true)
    expect(p2(r.points.at(-1)!.mine)).toBe(0)
  })

  it('"máy mua đều" rải CÙNG tổng tiền qua ĐÚNG các ngày đã mua', () => {
    // Thật: 10.000 ¥ ở nav 10.000, rồi 20.000 ¥ ở nav 20.000 → tổng 30.000.
    // Máy:  15.000 ở nav 10.000 (15.000 口) + 15.000 ở nav 20.000 (7.500 口) = 22.500 口
    //       giá trị cuối 22.500 × 20.000 ÷ 10.000 = 45.000 trên 30.000 → +50%.
    const r = fundGrowth({
      trades: [mua('2026-01-05', 10_000, 10_000), mua('2026-01-07', 10_000, 20_000)],
      navByDate: gia([
        ['2026-01-05', 10_000],
        ['2026-01-07', 20_000],
      ]),
    })
    expect(p2(r.points.at(-1)!.dca)).toBe(50)
  })

  it('máy mua đều KHÔNG bán, dù sổ thật có bán — đó là ý nghĩa của phép so', () => {
    const r = fundGrowth({
      trades: [mua('2026-01-05', 10_000, 10_000), ban('2026-01-07', 10_000, 20_000)],
      navByDate: gia([
        ['2026-01-05', 10_000],
        ['2026-01-07', 20_000],
        ['2026-01-08', 30_000],
      ]),
    })
    // Chỉ MỘT ngày mua → không dựng được máy mua đều.
    expect(r.hasDca).toBe(false)
    expect(r.points.every((x) => x.dca === null)).toBe(true)
  })

  it('máy mua đều giữ tới cuối kỳ dù sổ thật đã bán, khi có đủ hai ngày mua', () => {
    const r = fundGrowth({
      trades: [
        mua('2026-01-05', 10_000, 10_000),
        mua('2026-01-06', 6_666, 10_000),
        ban('2026-01-07', 16_666, 33_332),
      ],
      navByDate: gia([
        ['2026-01-05', 10_000],
        ['2026-01-06', 15_000],
        ['2026-01-07', 20_000],
      ]),
    })
    // Máy: 10.000 ở nav 10.000 (10.000 口) + 10.000 ở nav 15.000 (6.666,67 口) = 16.666,67 口
    //      cuối kỳ 16.666,67 × 20.000 ÷ 10.000 = 33.333 trên 20.000 → +66,67%
    expect(p2(r.points.at(-1)!.dca)).toBe(66.67)
    expect(r.hasDca).toBe(true)
  })

  it('chỉ có MỘT ngày mua thì trả null, không trả 0', () => {
    const r = fundGrowth({
      trades: [mua('2026-01-05', 10_000, 10_000)],
      navByDate: gia([['2026-01-05', 10_000], ['2026-01-06', 11_000]]),
    })
    expect(r.points.every((x) => x.dca === null)).toBe(true)
    expect(r.hasDca).toBe(false)
  })

  it('cắt từ ngày lệnh ĐẦU TIÊN của quỹ, không lấy cả lịch sử từ ngày lập quỹ', () => {
    const r = fundGrowth({
      trades: [mua('2026-01-07', 10_000, 20_000)],
      navByDate: gia([
        ['2026-01-05', 10_000],
        ['2026-01-06', 15_000],
        ['2026-01-07', 20_000],
        ['2026-01-08', 22_000],
      ]),
    })
    expect(r.points.map((x) => x.date)).toEqual(['2026-01-07', '2026-01-08'])
    expect(p2(r.points[0].fund)).toBe(0)
  })

  it('phiên không có 基準価額 thì KHÔNG có điểm — không nội suy', () => {
    const r = fundGrowth({
      trades: [mua('2026-01-05', 10_000, 10_000)],
      navByDate: gia([['2026-01-05', 10_000], ['2026-01-08', 12_000]]),
    })
    expect(r.points.map((x) => x.date)).toEqual(['2026-01-05', '2026-01-08'])
  })

  it('chưa có lệnh nào, hoặc chưa có giá nào, thì chuỗi rỗng', () => {
    expect(fundGrowth({ trades: [], navByDate: gia([['2026-01-05', 10_000]]) }).points).toEqual([])
    expect(fundGrowth({ trades: [mua('2026-01-05', 1, 1)], navByDate: gia([]) }).points).toEqual([])
  })

  it('mọi đường bắt đầu từ 0% ở mốc đầu — điều kiện để đọc khoảng cách giữa chúng', () => {
    const r = fundGrowth({
      trades: [mua('2026-01-05', 10_000, 10_000), mua('2026-01-07', 4_166, 5_000)],
      navByDate: gia([
        ['2026-01-05', 10_000],
        ['2026-01-07', 12_000],
      ]),
    })
    expect([r.points[0].fund, r.points[0].mine, r.points[0].dca].map(p2)).toEqual([0, 0, 0])
  })

  it('lệnh "adjust" đổi số 口 nhưng KHÔNG phải tiền vào — mẫu số không đổi', () => {
    const r = fundGrowth({
      trades: [
        mua('2026-01-05', 10_000, 10_000),
        { kind: 'adjust', tradedOn: '2026-01-06', units: 1_000, amount: 0 },
      ],
      navByDate: gia([
        ['2026-01-05', 10_000],
        ['2026-01-06', 10_000],
      ]),
    })
    // 11.000 口 × 10.000 ÷ 10.000 = 11.000 trên 10.000 bỏ ra → +10%
    expect(p2(r.points.at(-1)!.mine)).toBe(10)
  })
})
