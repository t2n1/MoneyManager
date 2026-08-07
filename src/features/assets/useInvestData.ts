// Dữ liệu cho trang Đầu tư — gom mọi tài khoản chứng khoán vào một danh mục.
//
// Chỉ nhận tài khoản `investment` + VND: bảng giá là đồng/cổ (migration 0035), tài
// khoản đầu tư JPY dùng chung khu này sẽ ra số vô nghĩa. Cùng điều kiện mà trang chi
// tiết tài khoản dùng để quyết định có hiện khu "Danh mục" hay không.
import { useMemo } from 'react'
import {
  useAccountBalances,
  useAccounts,
  useStockPrices,
  useStockTrades,
} from '../../hooks/queries'
import type { AccountRow, StockTradeRow } from '../../types/database.types'
import type { Trade } from './holdings'
import { sessionPrices } from './holdings'
import { buildPortfolio, type AccountTrades, type Portfolio } from './portfolio'

export interface InvestData {
  /** Tài khoản chứng khoán VND đang mở (chưa lưu trữ). */
  accounts: AccountRow[]
  /** Toàn bộ sổ lệnh của những tài khoản đó, mới nhất trước. */
  trades: StockTradeRow[]
  portfolio: Portfolio
  /** Ngày phiên của bảng giá; null = chưa có giá nào. */
  session: string | null
  /** Mã đang giữ mà giá còn kẹt ở phiên cũ hơn `session`. */
  staleHeld: string[]
  /** Tên tài khoản theo id — dùng để in trên từng dòng lệnh. */
  accountName: (id: string) => string
  isLoading: boolean
}

export function useInvestData(): InvestData {
  const { data: accountRows = [], isLoading: accLoading } = useAccounts()
  const { data: balances = [] } = useAccountBalances()
  const { data: allTrades = [], isLoading: tradesLoading } = useStockTrades()
  const { data: prices = [] } = useStockPrices()

  const accounts = useMemo(
    () =>
      accountRows.filter(
        (a) => a.type === 'investment' && a.currency === 'VND' && !a.is_archived,
      ),
    [accountRows],
  )

  const { session, priceBySymbol, staleSymbols } = useMemo(
    () => sessionPrices(prices),
    [prices],
  )

  const trades = useMemo(() => {
    const ids = new Set(accounts.map((a) => a.id))
    return allTrades
      .filter((t) => ids.has(t.account_id))
      .slice()
      .sort((a, b) => b.traded_on.localeCompare(a.traded_on) || b.created_at.localeCompare(a.created_at))
  }, [allTrades, accounts])

  const portfolio = useMemo(() => {
    const balanceById = new Map(balances.map((b) => [b.id, b.balance]))
    const input: AccountTrades[] = accounts.map((a) => ({
      accountId: a.id,
      accountName: a.name,
      balance: balanceById.get(a.id) ?? 0,
      trades: allTrades
        .filter((t) => t.account_id === a.id)
        .map(
          (t): Trade => ({
            symbol: t.symbol,
            kind: t.kind,
            tradedOn: t.traded_on,
            quantity: t.quantity,
            price: t.price,
            fee: t.fee,
            tax: t.tax,
          }),
        ),
    }))
    return buildPortfolio(input, priceBySymbol)
  }, [accounts, balances, allTrades, priceBySymbol])

  // Mã có giá hợp lệ nhưng giá đó cũ hơn phiên chung. Loại mã đã nằm trong
  // missingPrices: một mã chỉ nên bị nêu MỘT lần, và "chưa có giá" đã nói đủ.
  const staleHeld = useMemo(
    () =>
      portfolio.positions
        .filter((p) => staleSymbols.has(p.symbol) && p.price !== null)
        .map((p) => p.symbol),
    [portfolio.positions, staleSymbols],
  )

  const nameById = useMemo(() => new Map(accountRows.map((a) => [a.id, a.name])), [accountRows])

  return {
    accounts,
    trades,
    portfolio,
    session,
    staleHeld,
    accountName: (id) => nameById.get(id) ?? '—',
    isLoading: accLoading || tradesLoading,
  }
}
