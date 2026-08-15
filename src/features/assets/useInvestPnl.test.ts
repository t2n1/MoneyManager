import { describe, expect, it } from 'vitest'
import type {
  AccountRow,
  FundTradeRow,
  StockPriceRow,
  StockTradeRow,
} from '../../types/database.types'
import type { AssetAccount } from './aggregate'
import type { AccountPortfolioSummary } from './useAccountPortfolio'
import { accountRowPnl, investPnlByAccount } from './useInvestPnl'

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
    account_id: 'a2',
    assoc_fund_cd: '9I31223A',
    kind: 'buy',
    traded_on: '2026-01-05',
    units: 28_429,
    nav: 17_588,
    amount: 50_000,
    ...over,
  }) as FundTradeRow

describe('investPnlByAccount', () => {
  it('mỗi tài khoản một mục, tính bằng ĐÚNG số dư của chính nó', () => {
    const map = investPnlByAccount(
      [taiKhoan(), taiKhoan({ id: 'a2', name: 'NISA', currency: 'JPY' })],
      [
        { id: 'a1', balance: 5_000_000 },
        { id: 'a2', balance: 80_000 },
      ],
      {
        stockTrades: [lenhCP()],
        stockPrices: [giaCP('VNM', 60_000)],
        fundTrades: [lenhQuy()],
        fundPrices: [],
      },
    )
    expect(map.get('a1')?.unrealizedPnl).toBe(1_000_000)
    expect(map.get('a1')?.cash).toBe(0)
    // Thiếu giá quỹ → không định giá được, nhưng vẫn có mục để nơi gọi biết là "chưa
    // tính được" chứ không phải "tài khoản này không có danh mục".
    expect(map.get('a2')?.marketValue).toBeNull()
  })

  it('tài khoản không có danh mục tính được → không có mục nào', () => {
    const map = investPnlByAccount(
      [taiKhoan({ id: 'v1', name: 'Vàng miếng' }), taiKhoan({ id: 'b1', type: 'bank' })],
      [{ id: 'v1', balance: 1_000_000 }],
      { stockTrades: [], stockPrices: [], fundTrades: [], fundPrices: [] },
    )
    expect(map.size).toBe(0)
  })

  it('thiếu hàng số dư → coi như 0, và sổ lệnh mua rồi thì tiền chưa mua ra âm', () => {
    const map = investPnlByAccount([taiKhoan()], [], {
      stockTrades: [lenhCP()],
      stockPrices: [giaCP('VNM', 60_000)],
      fundTrades: [],
      fundPrices: [],
    })
    expect(map.get('a1')?.cash).toBe(-5_000_000)
    expect(map.get('a1')?.marketValue).toBeNull()
  })
})

const dong = (over: Partial<AssetAccount> = {}): AssetAccount =>
  ({ type: 'investment', balance: 213_116_863, marketValue: 340_252_318, ...over }) as AssetAccount

const danhMuc = (over: Partial<AccountPortfolioSummary> = {}): AccountPortfolioSummary =>
  ({
    kind: 'stocks',
    marketValue: 340_252_318,
    cost: 294_600_000,
    unrealizedPnl: 37_705_702,
    unrealizedPercent: 0.128,
    count: 4,
    session: '2026-08-14',
    cash: 8_000_000,
    ...over,
  }) as AccountPortfolioSummary

describe('accountRowPnl', () => {
  it('đầu tư có danh mục → lời CHƯA BÁN, không phải hiệu giá thị trường − số dư sổ', () => {
    expect(accountRowPnl(dong(), danhMuc())).toBe(37_705_702)
  })

  it('đầu tư chỉ có định giá nhập tay (không sổ lệnh) → không in số', () => {
    expect(accountRowPnl(dong(), undefined)).toBeNull()
  })

  it('đầu tư có sổ lệnh nhưng chưa định giá được → không in số', () => {
    expect(accountRowPnl(dong(), danhMuc({ marketValue: null }))).toBeNull()
  })

  it('lời chưa bán đúng bằng 0 → không in số', () => {
    expect(accountRowPnl(dong(), danhMuc({ unrealizedPnl: 0 }))).toBeNull()
  })

  it('tài sản cố định giữ nguyên nếp cũ: hiệu giá trị hiện tại − giá mua (khấu hao)', () => {
    expect(
      accountRowPnl(dong({ type: 'fixed', balance: 30_000_000, marketValue: 22_000_000 }), undefined),
    ).toBe(-8_000_000)
  })

  it('tài khoản thường không có định giá → không in số', () => {
    expect(accountRowPnl(dong({ type: 'bank', marketValue: null }), undefined)).toBeNull()
  })
})
