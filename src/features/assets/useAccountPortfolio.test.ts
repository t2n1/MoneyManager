import { describe, expect, it } from 'vitest'
import type {
  AccountRow,
  FundPriceRow,
  FundTradeRow,
  StockPriceRow,
  StockTradeRow,
} from '../../types/database.types'
import { accountPortfolioSummary, portfolioKindOf } from './useAccountPortfolio'

const tk = (
  type: string,
  currency: string,
  is_archived = false,
): Parameters<typeof portfolioKindOf>[0] =>
  ({ type, currency, is_archived }) as Parameters<typeof portfolioKindOf>[0]

describe('portfolioKindOf', () => {
  it('đầu tư VND có sổ lệnh → engine cổ phiếu', () => {
    expect(portfolioKindOf(tk('investment', 'VND'), 3)).toBe('stocks')
  })

  it('đầu tư JPY có sổ lệnh → engine quỹ', () => {
    expect(portfolioKindOf(tk('investment', 'JPY'), 3)).toBe('funds')
  })

  it('đầu tư loại tiền khác → null, vì không có bảng giá nào cho nó', () => {
    expect(portfolioKindOf(tk('investment', 'USD'), 3)).toBeNull()
  })

  it('chưa có lệnh nào → null, để trang rơi về định giá nhập tay', () => {
    expect(portfolioKindOf(tk('investment', 'VND'), 0)).toBeNull()
  })

  it('không phải tài khoản đầu tư → null', () => {
    expect(portfolioKindOf(tk('bank', 'JPY'), 3)).toBeNull()
    expect(portfolioKindOf(tk('fixed', 'JPY'), 3)).toBeNull()
  })

  it('đã lưu trữ → null: hai tab của trang Đầu tư không nhận tài khoản lưu trữ, nên link "Xem" sẽ dẫn tới một bộ lọc bị bỏ qua', () => {
    expect(portfolioKindOf(tk('investment', 'VND', true), 3)).toBeNull()
  })

  it('không có tài khoản (đang tải) → null', () => {
    expect(portfolioKindOf(undefined, 3)).toBeNull()
  })
})

const taiKhoan = (over: Partial<AccountRow> = {}): AccountRow =>
  ({
    id: 'a1',
    name: 'iDragon',
    type: 'investment',
    currency: 'VND',
    is_archived: false,
    ...over,
  }) as AccountRow

const lenhCP = (over: Partial<StockTradeRow> = {}): StockTradeRow =>
  ({
    id: 't1',
    account_id: 'a1',
    symbol: 'VNM',
    kind: 'buy',
    traded_on: '2026-01-05',
    quantity: 100,
    price: 50_000,
    fee: 0,
    tax: 0,
    ...over,
  }) as StockTradeRow

const giaCP = (symbol: string, price: number): StockPriceRow =>
  ({ symbol, price, trading_date: '2026-08-14' }) as StockPriceRow

const lenhQuy = (over: Partial<FundTradeRow> = {}): FundTradeRow =>
  ({
    id: 'f1',
    account_id: 'a1',
    assoc_fund_cd: '9I31223A',
    kind: 'buy',
    traded_on: '2026-01-05',
    units: 28_429,
    nav: 17_588,
    amount: 50_000,
    ...over,
  }) as FundTradeRow

const giaQuy = (assoc_fund_cd: string, nav: number): FundPriceRow =>
  ({ assoc_fund_cd, nav, nav_date: '2026-08-14' }) as FundPriceRow

const nguon = (over: Partial<Parameters<typeof accountPortfolioSummary>[1]> = {}) => ({
  balance: 5_000_000,
  stockTrades: [],
  stockPrices: [],
  fundTrades: [],
  fundPrices: [],
  ...over,
})

describe('accountPortfolioSummary', () => {
  it('đầu tư VND: lời chưa bán = giá trị đang giữ − giá vốn đang giữ', () => {
    const s = accountPortfolioSummary(
      taiKhoan(),
      nguon({ stockTrades: [lenhCP()], stockPrices: [giaCP('VNM', 60_000)] }),
    )
    expect(s?.kind).toBe('stocks')
    expect(s?.cost).toBe(5_000_000)
    expect(s?.unrealizedPnl).toBe(1_000_000)
    expect(s?.marketValue).toBe(6_000_000)
  })

  it('chỉ tính sổ lệnh của ĐÚNG tài khoản đó — lệnh tài khoản khác không được kéo vào giá vốn', () => {
    const s = accountPortfolioSummary(
      taiKhoan(),
      nguon({
        stockTrades: [
          lenhCP(),
          lenhCP({ id: 't2', account_id: 'a2', quantity: 100, price: 10_000 }),
        ],
        stockPrices: [giaCP('VNM', 60_000)],
      }),
    )
    expect(s?.cost).toBe(5_000_000)
    expect(s?.unrealizedPnl).toBe(1_000_000)
  })

  it('thiếu giá mọi mã đang giữ → marketValue null, không phải lời bằng 0', () => {
    const s = accountPortfolioSummary(taiKhoan(), nguon({ stockTrades: [lenhCP()] }))
    expect(s?.marketValue).toBeNull()
  })

  it('sổ lệnh mua nhiều hơn tiền đã nạp → marketValue null và cash âm', () => {
    const s = accountPortfolioSummary(
      taiKhoan(),
      nguon({
        balance: 1_000_000,
        stockTrades: [lenhCP()],
        stockPrices: [giaCP('VNM', 60_000)],
      }),
    )
    expect(s?.marketValue).toBeNull()
    expect(s?.cash).toBe(-4_000_000)
  })

  it('đầu tư JPY: dùng engine quỹ, tiền chưa mua là null', () => {
    const s = accountPortfolioSummary(
      taiKhoan({ currency: 'JPY', name: 'NISA' }),
      nguon({
        fundTrades: [lenhQuy()],
        fundPrices: [giaQuy('9I31223A', 20_000)],
      }),
    )
    expect(s?.kind).toBe('funds')
    expect(s?.cost).toBe(50_000)
    expect(s?.marketValue).toBe(56_858)
    expect(s?.cash).toBeNull()
  })

  it('không phải tài khoản đầu tư, hoặc không có sổ lệnh → null', () => {
    expect(accountPortfolioSummary(taiKhoan({ type: 'bank' }), nguon())).toBeNull()
    expect(accountPortfolioSummary(taiKhoan(), nguon())).toBeNull()
    expect(accountPortfolioSummary(undefined, nguon())).toBeNull()
  })
})
