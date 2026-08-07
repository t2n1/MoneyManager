import { describe, expect, it } from 'vitest'
import type { Trade } from './holdings'
import { buildPortfolio, type AccountTrades } from './portfolio'

const buy = (symbol: string, quantity: number, price: number, tradedOn = '2026-01-05'): Trade => ({
  symbol,
  kind: 'buy',
  tradedOn,
  quantity,
  price,
  fee: 0,
  tax: 0,
})

const sell = (symbol: string, quantity: number, price: number, tradedOn = '2026-06-05'): Trade => ({
  symbol,
  kind: 'sell',
  tradedOn,
  quantity,
  price,
  fee: 0,
  tax: 0,
})

const acc = (
  accountId: string,
  balance: number,
  trades: Trade[],
  accountName = `TK ${accountId}`,
): AccountTrades => ({ accountId, accountName, balance, trades })

describe('buildPortfolio', () => {
  it('không tài khoản nào → mọi số bằng 0, không có mã nào', () => {
    const p = buildPortfolio([], new Map())
    expect(p.positions).toEqual([])
    expect(p.stockValue).toBe(0)
    expect(p.marketValue).toBe(0)
  })

  it('gộp cùng một mã ở hai tài khoản thành một dòng, cộng số cổ và giá vốn', () => {
    const p = buildPortfolio(
      [
        acc('a', 5_000_000, [buy('VNM', 100, 50_000)], 'VPS'),
        acc('b', 7_000_000, [buy('VNM', 100, 70_000)], 'SSI'),
      ],
      new Map([['VNM', 60_000]]),
    )
    expect(p.positions).toHaveLength(1)
    expect(p.positions[0].quantity).toBe(200)
    expect(p.positions[0].costBasis).toBe(12_000_000)
    expect(p.positions[0].avgCost).toBe(60_000)
    expect(p.positions[0].accountNames).toEqual(['VPS', 'SSI'])
  })

  it('lãi đã thực hiện tính RIÊNG từng tài khoản, không hoà vốn bình quân chung', () => {
    // Mua 100 giá 50 ở A, 100 giá 70 ở B, rồi bán 100 giá 60 ở A.
    // Tính riêng: A lãi (60 − 50) × 100 = 1.000.000.
    // Đổ chung sổ lệnh thì vốn bình quân là 60 → lệnh đó hoà vốn, tức SAI.
    const p = buildPortfolio(
      [
        acc('a', 0, [buy('VNM', 100, 50_000), sell('VNM', 100, 60_000)]),
        acc('b', 0, [buy('VNM', 100, 70_000)]),
      ],
      new Map([['VNM', 60_000]]),
    )
    expect(p.realizedPnl).toBe(1_000_000)
    // Còn lại đúng 100 cổ của B, giá vốn của B
    expect(p.positions[0].quantity).toBe(100)
    expect(p.positions[0].avgCost).toBe(70_000)
  })

  it('lời/lỗ chưa thực hiện và % tính trên giá vốn đang giữ', () => {
    const p = buildPortfolio(
      [acc('a', 10_000_000, [buy('VNM', 100, 50_000)])],
      new Map([['VNM', 60_000]]),
    )
    expect(p.stockCost).toBe(5_000_000)
    expect(p.stockValue).toBe(6_000_000)
    expect(p.unrealizedPnl).toBe(1_000_000)
    expect(p.unrealizedPercent).toBeCloseTo(0.2)
  })

  it('tỷ trọng cộng lại bằng 1', () => {
    const p = buildPortfolio(
      [acc('a', 20_000_000, [buy('VNM', 100, 50_000), buy('HPG', 100, 30_000)])],
      new Map([
        ['VNM', 60_000],
        ['HPG', 40_000],
      ]),
    )
    const total = p.positions.reduce((s, x) => s + x.weight, 0)
    expect(total).toBeCloseTo(1)
    // Giá trị lớn hơn lên đầu
    expect(p.positions.map((x) => x.symbol)).toEqual(['VNM', 'HPG'])
  })

  it('mã thiếu giá tạm tính theo giá vốn VÀ được nêu tên', () => {
    const p = buildPortfolio(
      [acc('a', 10_000_000, [buy('VNM', 100, 50_000), buy('XYZ', 100, 20_000)])],
      new Map([['VNM', 60_000]]),
    )
    const xyz = p.positions.find((x) => x.symbol === 'XYZ')!
    expect(xyz.price).toBeNull()
    expect(xyz.value).toBe(2_000_000)
    expect(xyz.pnl).toBe(0)
    expect(p.missingPrices).toEqual(['XYZ'])
    // Vẫn ra tổng: thiếu MỘT PHẦN thì kèm cảnh báo chứ không câm
    expect(p.marketValue).not.toBeNull()
  })

  it('thiếu giá MỌI mã → không dám ra tổng', () => {
    const p = buildPortfolio([acc('a', 10_000_000, [buy('VNM', 100, 50_000)])], new Map())
    expect(p.marketValue).toBeNull()
  })

  it('giá 0 hoặc âm coi như chưa có giá', () => {
    const p = buildPortfolio(
      [acc('a', 10_000_000, [buy('VNM', 100, 50_000)])],
      new Map([['VNM', 0]]),
    )
    expect(p.positions[0].price).toBeNull()
    expect(p.missingPrices).toEqual(['VNM'])
  })

  it('tiền chưa đầu tư cộng từ mọi tài khoản', () => {
    const p = buildPortfolio(
      [
        acc('a', 10_000_000, [buy('VNM', 100, 50_000)]), // còn 5.000.000
        acc('b', 3_000_000, []), // còn 3.000.000
      ],
      new Map([['VNM', 60_000]]),
    )
    expect(p.cash).toBe(8_000_000)
    expect(p.marketValue).toBe(6_000_000 + 8_000_000)
  })

  it('tiền mặt ÂM (thiếu lần nạp) → tổng không đáng tin', () => {
    // Ghi lệnh mua 5 triệu mà tài khoản chỉ có 1 triệu
    const p = buildPortfolio(
      [acc('a', 1_000_000, [buy('VNM', 100, 50_000)])],
      new Map([['VNM', 60_000]]),
    )
    expect(p.cash).toBe(-4_000_000)
    expect(p.marketValue).toBeNull()
  })

  it('bán quá số đang giữ được nêu tên', () => {
    const p = buildPortfolio(
      [acc('a', 0, [buy('VNM', 100, 50_000), sell('VNM', 150, 60_000)])],
      new Map([['VNM', 60_000]]),
    )
    expect(p.oversold).toEqual(['VNM'])
  })

  it('mã bán sạch không còn dòng nào', () => {
    const p = buildPortfolio(
      [acc('a', 0, [buy('VNM', 100, 50_000), sell('VNM', 100, 60_000)])],
      new Map([['VNM', 60_000]]),
    )
    expect(p.positions).toEqual([])
    expect(p.realizedPnl).toBe(1_000_000)
  })

  it('giá vốn 0 (toàn cổ phiếu thưởng) → không chia được %, trả null', () => {
    const thuong: Trade = {
      symbol: 'VNM',
      kind: 'adjust',
      tradedOn: '2026-02-01',
      quantity: 50,
      price: 0,
      fee: 0,
      tax: 0,
    }
    const p = buildPortfolio([acc('a', 0, [thuong])], new Map([['VNM', 60_000]]))
    expect(p.positions[0].quantity).toBe(50)
    expect(p.positions[0].pnlPercent).toBeNull()
  })
})
