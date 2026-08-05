import { describe, expect, it } from 'vitest'
import { brokerCash, holdingsFromTrades, portfolioValue, sessionPrices, type Trade } from './holdings'

/** Lệnh mua/bán gọn cho test — mặc định phí/thuế 0 để phép tính dễ nhẩm. */
function mua(symbol: string, quantity: number, price: number, tradedOn = '2026-01-05', fee = 0): Trade {
  return { symbol, kind: 'buy', tradedOn, quantity, price, fee, tax: 0 }
}
function ban(
  symbol: string,
  quantity: number,
  price: number,
  tradedOn = '2026-02-05',
  fee = 0,
  tax = 0,
): Trade {
  return { symbol, kind: 'sell', tradedOn, quantity, price, fee, tax }
}
function dieuChinh(symbol: string, quantity: number, tradedOn = '2026-03-05'): Trade {
  return { symbol, kind: 'adjust', tradedOn, quantity, price: 0, fee: 0, tax: 0 }
}

describe('holdingsFromTrades', () => {
  it('sổ lệnh rỗng → không giữ gì', () => {
    expect(holdingsFromTrades([])).toEqual({ holdings: [], realizedPnl: 0, oversold: [] })
  })

  it('mua một lần: giá vốn gồm cả phí', () => {
    const { holdings } = holdingsFromTrades([mua('FPT', 1_000, 70_000, '2026-01-05', 105_000)])
    expect(holdings).toEqual([
      { symbol: 'FPT', quantity: 1_000, costBasis: 70_105_000, avgCost: 70_105 },
    ])
  })

  it('mua nhiều lần cùng mã: giá vốn bình quân gia quyền', () => {
    const { holdings } = holdingsFromTrades([
      mua('HPG', 1_000, 20_000, '2026-01-05'),
      mua('HPG', 1_000, 30_000, '2026-01-20'),
    ])
    expect(holdings[0].quantity).toBe(2_000)
    expect(holdings[0].costBasis).toBe(50_000_000)
    expect(holdings[0].avgCost).toBe(25_000)
  })

  it('bán một phần: trừ theo giá vốn bình quân, lãi tính đúng', () => {
    const { holdings, realizedPnl } = holdingsFromTrades([
      mua('HPG', 2_000, 25_000, '2026-01-05'),
      ban('HPG', 500, 30_000, '2026-02-05'),
    ])
    expect(holdings[0].quantity).toBe(1_500)
    expect(holdings[0].costBasis).toBe(37_500_000)
    expect(holdings[0].avgCost).toBe(25_000)
    expect(realizedPnl).toBe(2_500_000) // 500 × (30.000 − 25.000)
  })

  it('bán hết: mã rời danh mục, không còn giá vốn lơ lửng', () => {
    const { holdings, realizedPnl } = holdingsFromTrades([
      mua('FPT', 1_000, 70_000, '2026-01-05', 105_000),
      ban('FPT', 1_000, 75_000, '2026-02-05', 112_500, 75_000),
    ])
    expect(holdings).toEqual([])
    // Con số ở mục "Kiểm chứng bằng số" của spec
    expect(realizedPnl).toBe(4_707_500)
  })

  it('cổ phiếu thưởng: số cổ tăng, giá vốn tổng không đổi, bình quân giảm', () => {
    const { holdings } = holdingsFromTrades([
      mua('VNM', 1_000, 60_000, '2026-01-05'),
      dieuChinh('VNM', 100), // thưởng 10%
    ])
    expect(holdings[0].quantity).toBe(1_100)
    expect(holdings[0].costBasis).toBe(60_000_000)
    expect(holdings[0].avgCost).toBe(54_545)
  })

  it('gộp cổ phiếu (điều chỉnh âm): số cổ giảm, giá vốn không đổi', () => {
    const { holdings } = holdingsFromTrades([
      mua('SSI', 2_000, 30_000, '2026-01-05'),
      dieuChinh('SSI', -1_000),
    ])
    expect(holdings[0].quantity).toBe(1_000)
    expect(holdings[0].costBasis).toBe(60_000_000)
    expect(holdings[0].avgCost).toBe(60_000)
  })

  it('nhập lộn xộn ngày tháng → kết quả bằng khi nhập đúng thứ tự', () => {
    const dungThuTu = holdingsFromTrades([
      mua('HPG', 1_000, 20_000, '2026-01-05'),
      mua('HPG', 1_000, 30_000, '2026-01-20'),
      ban('HPG', 1_000, 40_000, '2026-02-05'),
    ])
    const lonXon = holdingsFromTrades([
      ban('HPG', 1_000, 40_000, '2026-02-05'),
      mua('HPG', 1_000, 30_000, '2026-01-20'),
      mua('HPG', 1_000, 20_000, '2026-01-05'),
    ])
    expect(lonXon).toEqual(dungThuTu)
    expect(lonXon.realizedPnl).toBe(15_000_000) // 1.000 × (40.000 − 25.000)
  })

  it('bán quá số đang giữ → vào oversold', () => {
    const { holdings, oversold } = holdingsFromTrades([
      mua('FPT', 100, 70_000, '2026-01-05'),
      ban('FPT', 500, 75_000, '2026-02-05'),
    ])
    expect(oversold).toEqual(['FPT'])
    expect(holdings).toEqual([])
  })

  it('gộp cổ phiếu quá tay (điều chỉnh âm lớn hơn số đang giữ) → vào oversold, giữ về 0', () => {
    const { holdings, oversold } = holdingsFromTrades([
      mua('SSI', 500, 30_000, '2026-01-05'),
      dieuChinh('SSI', -1_000), // gộp 1.000 cổ trong khi chỉ đang giữ 500
    ])
    expect(oversold).toEqual(['SSI'])
    expect(holdings).toEqual([]) // quantity bị kẹp về 0, costBasis cũng về 0 nên rời khỏi danh mục
  })

  it('nhiều mã: sắp theo giá vốn giảm dần', () => {
    const { holdings } = holdingsFromTrades([
      mua('HPG', 100, 20_000, '2026-01-05'),
      mua('FPT', 100, 70_000, '2026-01-05'),
      mua('VNM', 100, 60_000, '2026-01-05'),
    ])
    expect(holdings.map((h) => h.symbol)).toEqual(['FPT', 'VNM', 'HPG'])
  })
})

describe('brokerCash', () => {
  it('nạp rồi mua: còn lại đúng phần chưa đầu tư', () => {
    const cash = brokerCash(100_000_000, [mua('FPT', 1_000, 70_000, '2026-01-05', 105_000)])
    expect(cash).toBe(29_895_000)
  })

  it('bán ra thì tiền quay lại, đã trừ phí và thuế', () => {
    const cash = brokerCash(100_000_000, [
      mua('FPT', 1_000, 70_000, '2026-01-05', 105_000),
      ban('FPT', 1_000, 75_000, '2026-02-05', 112_500, 75_000),
    ])
    expect(cash).toBe(104_707_500)
  })

  it('điều chỉnh không tốn tiền', () => {
    expect(brokerCash(10_000_000, [dieuChinh('VNM', 100)])).toBe(10_000_000)
  })

  it('mua nhiều hơn tiền đã nạp → âm, KHÔNG kẹp về 0', () => {
    expect(brokerCash(1_000_000, [mua('FPT', 1_000, 70_000, '2026-01-05')])).toBe(-69_000_000)
  })
})

describe('portfolioValue', () => {
  const holdings = [{ symbol: 'FPT', quantity: 1_000, costBasis: 70_105_000, avgCost: 70_105 }]

  it('đủ giá: cổ phiếu theo giá hôm nay + tiền chưa đầu tư', () => {
    const v = portfolioValue(holdings, new Map([['FPT', 75_000]]), 29_895_000)
    expect(v.stockValue).toBe(75_000_000)
    expect(v.marketValue).toBe(104_895_000)
    expect(v.missingPrices).toEqual([])
  })

  it('thiếu giá một phần: mã đó tạm tính theo giá vốn và bị nêu tên', () => {
    const hai = [...holdings, { symbol: 'XYZ', quantity: 10, costBasis: 1_000_000, avgCost: 100_000 }]
    const v = portfolioValue(hai, new Map([['FPT', 75_000]]), 0)
    expect(v.missingPrices).toEqual(['XYZ'])
    expect(v.stockValue).toBe(76_000_000)
    expect(v.marketValue).toBe(76_000_000)
  })

  it('thiếu giá MỌI mã → null, vì kết quả chỉ bằng đúng số dư sổ', () => {
    const v = portfolioValue(holdings, new Map(), 29_895_000)
    expect(v.marketValue).toBeNull()
  })

  it('tiền chưa đầu tư âm → null, thà giữ số cũ hơn ghi số sai', () => {
    const v = portfolioValue(holdings, new Map([['FPT', 75_000]]), -1)
    expect(v.marketValue).toBeNull()
  })

  it('bán sạch: không còn mã nào, giá trị = tiền chưa đầu tư', () => {
    const v = portfolioValue([], new Map(), 104_707_500)
    expect(v.marketValue).toBe(104_707_500)
    expect(v.stockValue).toBe(0)
  })

  it('giá bằng 0 hoặc âm coi như thiếu giá', () => {
    const v = portfolioValue(holdings, new Map([['FPT', 0]]), 1_000)
    expect(v.missingPrices).toEqual(['FPT'])
  })
})

describe('sessionPrices', () => {
  it('bảng giá rỗng → session null, không giá, không mã cũ', () => {
    expect(sessionPrices([])).toEqual({
      session: null,
      priceBySymbol: new Map(),
      staleSymbols: new Set(),
    })
  })

  it('mọi mã cùng một phiên → không mã nào bị coi là cũ', () => {
    const r = sessionPrices([
      { symbol: 'FPT', price: 70_000, trading_date: '2026-08-05' },
      { symbol: 'HPG', price: 20_000, trading_date: '2026-08-05' },
    ])
    expect(r.session).toBe('2026-08-05')
    expect(r.priceBySymbol).toEqual(
      new Map([
        ['FPT', 70_000],
        ['HPG', 20_000],
      ]),
    )
    expect(r.staleSymbols).toEqual(new Set())
  })

  it('một sàn hụt phiên: mã của sàn đó vào staleSymbols, session vẫn lấy theo sàn mới', () => {
    const r = sessionPrices([
      { symbol: 'FPT', price: 70_000, trading_date: '2026-08-05' }, // HOSE, phiên mới
      { symbol: 'PVS', price: 15_000, trading_date: '2026-08-04' }, // HNX, hút hụt hôm nay
    ])
    expect(r.session).toBe('2026-08-05')
    expect(r.staleSymbols).toEqual(new Set(['PVS']))
    // Giá cũ vẫn có trong priceBySymbol — chỉ đánh dấu cũ, không xoá giá.
    expect(r.priceBySymbol.get('PVS')).toBe(15_000)
  })

  it('giá 0 hoặc âm bị loại khỏi priceBySymbol dù đúng phiên mới nhất', () => {
    const r = sessionPrices([
      { symbol: 'FPT', price: 0, trading_date: '2026-08-05' },
      { symbol: 'HPG', price: -1, trading_date: '2026-08-05' },
    ])
    expect(r.session).toBe('2026-08-05')
    expect(r.priceBySymbol).toEqual(new Map())
    expect(r.staleSymbols).toEqual(new Set())
  })

  it('session là ngày LỚN NHẤT, không phải dòng gặp đầu hay cuối', () => {
    const r = sessionPrices([
      { symbol: 'A', price: 1_000, trading_date: '2026-08-03' },
      { symbol: 'B', price: 2_000, trading_date: '2026-08-05' },
      { symbol: 'C', price: 3_000, trading_date: '2026-08-01' },
    ])
    expect(r.session).toBe('2026-08-05')
    expect(r.staleSymbols).toEqual(new Set(['A', 'C']))
  })
})
