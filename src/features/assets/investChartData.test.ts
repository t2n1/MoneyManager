import { describe, expect, it } from 'vitest'
import {
  buildPriceMap,
  chartRows,
  hasUsablePrices,
  investPerformance,
  rangeFrom,
  trimLeadingEmpty,
  type ChartRange,
} from './investChartData'
import type { Trade } from './holdings'
import { navSeries } from './navSeries'

describe('rangeFrom', () => {
  it('3M lùi đúng ba tháng', () => {
    expect(rangeFrom('3M', '2026-09-06')).toBe('2026-06-06')
  })

  it('1Y lùi đúng một năm', () => {
    expect(rangeFrom('1Y', '2026-09-06')).toBe('2025-09-06')
  })

  it('5Y lùi đúng năm năm', () => {
    expect(rangeFrom('5Y', '2026-09-06')).toBe('2021-09-06')
  })

  it('"Tất cả" lùi tới trước phiên đầu tiên mà nguồn có — không phải hôm nay', () => {
    const from = rangeFrom('all', '2026-09-06')
    // dchart có VNINDEX từ 2017-08-24 và HPG từ 2016-01-04; mốc phải sớm hơn cả hai.
    expect(from < '2016-01-04').toBe(true)
  })
})

describe('buildPriceMap', () => {
  it('gom theo mã rồi theo ngày', () => {
    const m = buildPriceMap([
      { symbol: 'HPG', trading_date: '2026-01-05', close: 21_000 },
      { symbol: 'HPG', trading_date: '2026-01-06', close: 21_500 },
      { symbol: 'MBB', trading_date: '2026-01-05', close: 20_000 },
    ])
    expect(m.get('HPG')?.get('2026-01-06')).toBe(21_500)
    expect(m.get('MBB')?.get('2026-01-05')).toBe(20_000)
    expect(m.size).toBe(2)
  })

  it('rỗng ra map rỗng, không nổ', () => {
    expect(buildPriceMap([]).size).toBe(0)
  })
})

describe('trimLeadingEmpty', () => {
  it('bỏ những phiên đầu chưa có gì trong danh mục', () => {
    const r = trimLeadingEmpty([
      { date: '2026-01-05', nav: 0, flow: 0 },
      { date: '2026-01-06', nav: 0, flow: 0 },
      { date: '2026-01-07', nav: 1_000, flow: 1_000 },
    ])
    expect(r.map((p) => p.date)).toEqual(['2026-01-07'])
  })

  it('KHÔNG bỏ phiên rỗng nằm giữa — bán sạch rồi mua lại vẫn là một câu chuyện liền', () => {
    const r = trimLeadingEmpty([
      { date: '2026-01-05', nav: 1_000, flow: 0 },
      { date: '2026-01-06', nav: 0, flow: -1_000 },
      { date: '2026-01-07', nav: 500, flow: 500 },
    ])
    expect(r).toHaveLength(3)
  })

  it('chưa bao giờ có gì thì trả rỗng', () => {
    expect(trimLeadingEmpty([{ date: '2026-01-05', nav: 0, flow: 0 }])).toEqual([])
  })
})

describe('chartRows', () => {
  const chiSo = [
    { trading_date: '2026-01-05', close_x100: 100_000 },
    { trading_date: '2026-01-06', close_x100: 110_000 },
    { trading_date: '2026-01-07', close_x100: 120_000 },
  ]

  it('cả hai đường bắt đầu từ 0% tại phiên đầu CỦA DANH MỤC', () => {
    const rows = chartRows(
      [
        { date: '2026-01-06', nav: 1_000, flow: 0 },
        { date: '2026-01-07', nav: 1_100, flow: 0 },
      ],
      chiSo,
    )
    expect(rows[0]).toEqual({ date: '2026-01-06', nav: 0, index: 0 })
  })

  it('chỉ số quy về mốc riêng của khung, không phải mốc của nguồn', () => {
    // Danh mục bắt đầu ở phiên 06 (chỉ số 1.100). Tới 07 chỉ số 1.200 → +9,09%.
    const rows = chartRows(
      [
        { date: '2026-01-06', nav: 1_000, flow: 0 },
        { date: '2026-01-07', nav: 1_100, flow: 0 },
      ],
      chiSo,
    )
    expect(rows[1].index).toBeCloseTo(9.09, 2)
    expect(rows[1].nav).toBeCloseTo(10, 2)
  })

  it('phiên mà chỉ số không có bar thì bỏ trống, KHÔNG vẽ 0', () => {
    const rows = chartRows(
      [
        { date: '2026-01-06', nav: 1_000, flow: 0 },
        { date: '2026-01-08', nav: 1_100, flow: 0 },
      ],
      chiSo,
    )
    expect(rows[1].index).toBeNull()
  })

  it('không có chỉ số nào thì vẫn vẽ được đường danh mục', () => {
    const rows = chartRows([{ date: '2026-01-06', nav: 1_000, flow: 0 }], [])
    expect(rows).toEqual([{ date: '2026-01-06', nav: 0, index: null }])
  })

  it('danh mục rỗng thì không có dòng nào', () => {
    expect(chartRows([], chiSo)).toEqual([])
  })
})

describe('ChartRange — mọi lựa chọn đều có mốc lùi', () => {
  const tatCa: ChartRange[] = ['3M', '6M', '1Y', '3Y', '5Y', 'all']
  it.each(tatCa)('%s ra một ngày sớm hơn hôm nay', (r) => {
    expect(rangeFrom(r, '2026-09-06') < '2026-09-06').toBe(true)
  })
})


describe('investPerformance', () => {
  const chiSo = [
    { trading_date: '2026-01-05', close_x100: 100_000 },
    { trading_date: '2026-01-06', close_x100: 110_000 },
  ]

  // Ca này ra đời từ một lỗi THẬT, thấy khi mở app: khu Hiệu quả in "Tổng lợi nhuận
  // −348,7%" trong khi chú giải ngay dưới nói "Danh mục +6,7%". Nguyên nhân là chuỗi %
  // bị truyền vào phép tính lợi nhuận như thể nó là chuỗi TIỀN — phiên đầu bằng 0 nên
  // mọi phép chia sau đó vô nghĩa. Gộp hai thứ vào một hàm để không còn hai đường vào.
  it('tổng lợi nhuận TRÙNG % của đường danh mục ở phiên cuối', () => {
    const { rows, returns } = investPerformance(
      [
        { date: '2026-01-05', nav: 1_000, flow: 0 },
        { date: '2026-01-06', nav: 1_100, flow: 0 },
      ],
      chiSo,
    )
    expect(returns.total).toBeCloseTo(rows.at(-1)!.nav, 10)
    expect(returns.total).toBeCloseTo(10, 10)
  })

  it('bỏ phiên rỗng ở đầu rồi mới tính, nên mốc 0% là phiên đầu CÓ THẬT', () => {
    const { rows } = investPerformance(
      [
        { date: '2026-01-05', nav: 0, flow: 0 },
        { date: '2026-01-06', nav: 1_000, flow: 1_000 },
      ],
      chiSo,
    )
    expect(rows.map((r) => r.date)).toEqual(['2026-01-06'])
  })

  it('chuỗi rỗng ra không dòng nào và mọi con số null', () => {
    const { rows, returns } = investPerformance([], chiSo)
    expect(rows).toEqual([])
    expect(returns.total).toBeNull()
  })
})

describe('hasUsablePrices — cửa chặn chuỗi "giá vốn" đi ra biểu đồ', () => {
  const gia = buildPriceMap([{ symbol: 'HPG', trading_date: '2026-01-05', close: 21_000 }])

  it('có giá thì đi qua', () => {
    expect(hasUsablePrices(gia, ['HPG'])).toBe(true)
  })

  it('THIẾU HẾT giá thì chặn — dù sổ lệnh đầy', () => {
    expect(hasUsablePrices(new Map(), ['HPG', 'MBB'])).toBe(false)
  })

  it('chưa có mã nào thì không chặn: không có gì để thiếu giá', () => {
    expect(hasUsablePrices(new Map(), [])).toBe(true)
  })

  // Vì sao phải chặn, nói bằng số: cùng một sổ lệnh, chỉ bỏ bảng giá đi.
  it('thiếu hết giá thì chuỗi NAV chỉ còn bậc thang những lần ĐÃ thực hiện', () => {
    const sessions = [
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
      '2026-01-12',
    ]
    const trades: Trade[] = [
      {
        symbol: 'HPG',
        kind: 'buy',
        tradedOn: '2026-01-05',
        quantity: 100,
        price: 20_000,
        fee: 0,
        tax: 0,
      },
      {
        symbol: 'HPG',
        kind: 'sell',
        tradedOn: '2026-01-08',
        quantity: 50,
        price: 30_000,
        fee: 0,
        tax: 0,
      },
    ]
    const ledger = [{ date: '2026-01-05', delta: 2_000_000, external: true }]
    const chay = (prices: Map<string, Map<string, number>>) =>
      navSeries({ sessions, trades, prices, ledger, openingBalance: 0 })

    const coGia = chay(
      buildPriceMap(
        sessions.map((d, i) => ({ symbol: 'HPG', trading_date: d, close: 20_000 + i * 2_000 })),
      ),
    )
    const khongGia = chay(new Map())

    // Có giá: mỗi phiên một mức giá trị khác nhau — đó là một danh mục thật.
    expect(new Set(coGia.points.map((p) => p.nav)).size).toBe(sessions.length)
    // Không giá: giá vốn và tiền mặt triệt tiêu nhau nên chỉ còn ĐÚNG hai mức — trước và
    // sau lần bán chốt lời. Đó là đường "phẳng, một bậc dựng đứng, phẳng" đã thấy trên app.
    expect(new Set(khongGia.points.map((p) => p.nav)).size).toBe(2)
    expect(khongGia.missingPrices).toEqual(['HPG'])
  })
})
