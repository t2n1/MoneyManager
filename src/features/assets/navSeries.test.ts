import { describe, expect, it } from 'vitest'
import { asTrade, type Trade } from './holdings'
import { buildPortfolio } from './portfolio'
import { navSeries, toLedger, type LedgerEntry } from './navSeries'

const mua = (over: Partial<Trade> = {}): Trade => ({
  symbol: 'HPG',
  kind: 'buy',
  tradedOn: '2026-01-05',
  quantity: 100,
  price: 20_000,
  fee: 0,
  tax: 0,
  ...over,
})

/** symbol → ngày → đồng/cổ */
const bangGia = (rows: [string, string, number][]) => {
  const m = new Map<string, Map<string, number>>()
  for (const [sym, date, price] of rows) {
    const theoNgay = m.get(sym) ?? new Map<string, number>()
    theoNgay.set(date, price)
    m.set(sym, theoNgay)
  }
  return m
}

const nap = (date: string, delta: number): LedgerEntry => ({ date, delta, external: true })

const chay = (over: Partial<Parameters<typeof navSeries>[0]> = {}) =>
  navSeries({
    sessions: ['2026-01-05'],
    trades: [],
    prices: bangGia([]),
    ledger: [],
    openingBalance: 0,
    ...over,
  })

describe('navSeries', () => {
  it('một phiên, một mã: giá trị cổ phiếu = số cổ × giá đóng cửa phiên đó', () => {
    const r = chay({
      trades: [mua()],
      prices: bangGia([['HPG', '2026-01-05', 21_000]]),
      ledger: [nap('2026-01-05', 5_000_000)],
    })
    expect(r.points).toHaveLength(1)
    expect(r.points[0].stockValue).toBe(2_100_000) // 100 × 21.000
  })

  it('tiền mặt = số dư sổ trừ tiền đã mua, tại đúng phiên đó', () => {
    const r = chay({
      trades: [mua()], // 100 × 20.000 = 2.000.000
      prices: bangGia([['HPG', '2026-01-05', 21_000]]),
      ledger: [nap('2026-01-05', 5_000_000)],
    })
    expect(r.points[0].cash).toBe(3_000_000)
    expect(r.points[0].nav).toBe(5_100_000) // 2.100.000 cổ phiếu + 3.000.000 tiền
  })

  it('phiên trước ngày mua thì mã đó chưa nằm trong giá trị', () => {
    const r = chay({
      sessions: ['2026-01-02', '2026-01-05'],
      trades: [mua()],
      prices: bangGia([
        ['HPG', '2026-01-02', 19_000],
        ['HPG', '2026-01-05', 21_000],
      ]),
      ledger: [nap('2026-01-02', 5_000_000)],
    })
    expect(r.points[0].stockValue).toBe(0)
    expect(r.points[1].stockValue).toBe(2_100_000)
  })

  it('phiên thiếu giá thì mang giá phiên trước sang, không tụt về 0', () => {
    const r = chay({
      sessions: ['2026-01-05', '2026-01-06', '2026-01-07'],
      trades: [mua()],
      prices: bangGia([
        ['HPG', '2026-01-05', 21_000],
        // 06 không có bar — mã tạm ngừng giao dịch
        ['HPG', '2026-01-07', 22_000],
      ]),
    })
    expect(r.points.map((p) => p.stockValue)).toEqual([2_100_000, 2_100_000, 2_200_000])
    expect(r.missingPrices).toEqual([])
  })

  it('mã chưa từng có giá nào thì tạm tính theo giá vốn và báo tên mã', () => {
    const r = chay({
      trades: [mua()], // giá vốn 20.000/cổ
      prices: bangGia([]),
    })
    expect(r.points[0].stockValue).toBe(2_000_000)
    expect(r.missingPrices).toEqual(['HPG'])
  })

  // Khác ca trên: mã CÓ giá, nhưng bar đầu tiên tới MUỘN hơn phiên mua. Đoạn đầu tạm
  // tính theo giá vốn (đường đi ngang) rồi mới nhập vào giá thật — và tên mã phải được
  // nêu, vì hai con số Tổng lợi nhuận / Lãi kép/năm tính cả đoạn ấy.
  it('mã có giá muộn hơn phiên mua thì đoạn đầu là giá vốn, và vẫn báo tên mã', () => {
    const r = chay({
      sessions: ['2026-01-05', '2026-01-06', '2026-01-07'],
      trades: [mua()], // mua phiên 05, giá vốn 20.000/cổ
      prices: bangGia([['HPG', '2026-01-07', 25_000]]),
    })
    expect(r.points.map((p) => p.stockValue)).toEqual([2_000_000, 2_000_000, 2_500_000])
    expect(r.missingPrices).toEqual(['HPG'])
  })

  it('chuyển khoản nạp tiền vào flow; cổ tức thì KHÔNG — cổ tức là lợi nhuận, không phải tiền mới', () => {
    const r = chay({
      sessions: ['2026-01-05', '2026-01-06'],
      ledger: [
        nap('2026-01-05', 5_000_000),
        { date: '2026-01-06', delta: 300_000, external: false }, // cổ tức
      ],
    })
    expect(r.points[0].flow).toBe(5_000_000)
    expect(r.points[1].flow).toBe(0)
    expect(r.points[1].cash).toBe(5_300_000) // cổ tức vẫn vào tiền mặt
  })

  it('mép phải TRÙNG giá trị danh mục mà khu Giá trị đang in — hai màn cạnh nhau không được lệch số', () => {
    const trades = [
      mua({ symbol: 'HPG', tradedOn: '2026-01-05', quantity: 100, price: 20_000, fee: 5_000 }),
      mua({ symbol: 'MBB', tradedOn: '2026-02-10', quantity: 200, price: 13_000, fee: 7_000 }),
    ]
    const gia = new Map([
      ['HPG', 21_700],
      ['MBB', 20_550],
    ])

    const p = buildPortfolio(
      [{ accountId: 'a1', accountName: 'CK', balance: 10_000_000, trades }],
      gia,
    )
    const r = chay({
      sessions: ['2026-01-05', '2026-02-10', '2026-09-04'],
      trades,
      prices: bangGia([
        ['HPG', '2026-09-04', 21_700],
        ['MBB', '2026-09-04', 20_550],
      ]),
      ledger: [nap('2026-01-05', 10_000_000)],
    })

    const cuoi = r.points.at(-1)!
    expect(cuoi.stockValue).toBe(p.stockValue)
    expect(cuoi.cash).toBe(p.cash)
    expect(cuoi.nav).toBe(p.marketValue)
  })

  it('không có phiên nào thì trả chuỗi rỗng, không nổ', () => {
    expect(chay({ sessions: [] }).points).toEqual([])
  })
})

describe('toLedger', () => {
  const gd = (over: Record<string, unknown> = {}) =>
    ({
      type: 'transfer',
      amount: 1_000_000,
      to_amount: null,
      account_id: 'vi',
      to_account_id: 'a1',
      occurred_on: '2026-01-05',
      ...over,
    }) as Parameters<typeof toLedger>[0][number]

  it('chuyển khoản vào tài khoản là dòng tiền NGOÀI', () => {
    expect(toLedger([gd()], new Set(['a1']))).toEqual([
      { date: '2026-01-05', delta: 1_000_000, external: true },
    ])
  })

  it('chuyển khoản xuyên tệ lấy to_amount, không lấy amount', () => {
    const r = toLedger([gd({ amount: 50_000, to_amount: 8_250_000 })], new Set(['a1']))
    expect(r[0].delta).toBe(8_250_000)
  })

  it('rút tiền khỏi tài khoản là dòng tiền ngoài, dấu âm', () => {
    const r = toLedger([gd({ account_id: 'a1', to_account_id: 'vi' })], new Set(['a1']))
    expect(r[0]).toEqual({ date: '2026-01-05', delta: -1_000_000, external: true })
  })

  it('cổ tức (khoản thu) KHÔNG phải dòng tiền ngoài', () => {
    const r = toLedger(
      [gd({ type: 'income', account_id: 'a1', to_account_id: null, amount: 300_000 })],
      new Set(['a1']),
    )
    expect(r[0]).toEqual({ date: '2026-01-05', delta: 300_000, external: false })
  })

  it('phí lưu ký (khoản chi) KHÔNG phải dòng tiền ngoài', () => {
    const r = toLedger(
      [gd({ type: 'expense', account_id: 'a1', to_account_id: null, amount: 20_000 })],
      new Set(['a1']),
    )
    expect(r[0]).toEqual({ date: '2026-01-05', delta: -20_000, external: false })
  })

  it('giao dịch không liên quan tài khoản nào trong danh mục thì bỏ qua', () => {
    expect(toLedger([gd({ account_id: 'x', to_account_id: 'y' })], new Set(['a1']))).toEqual([])
  })

  it('chuyển khoản GIỮA hai tài khoản trong danh mục không phải tiền mới — hai chân triệt tiêu', () => {
    const r = toLedger([gd({ account_id: 'a1', to_account_id: 'a2' })], new Set(['a1', 'a2']))
    expect(r.reduce((s, e) => s + e.delta, 0)).toBe(0)
    expect(r.every((e) => e.external === false)).toBe(true)
  })
})

describe('asTrade — dùng lại, không chép tay', () => {
  it('ánh xạ hàng stock_trades sang Trade', () => {
    const t = asTrade({
      symbol: 'HPG',
      kind: 'buy',
      traded_on: '2026-01-05',
      quantity: 100,
      price: 20_000,
      fee: 5_000,
      tax: 0,
    })
    expect(t.tradedOn).toBe('2026-01-05')
  })
})
