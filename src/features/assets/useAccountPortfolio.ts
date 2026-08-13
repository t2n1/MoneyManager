// Số tóm tắt danh mục cho TRANG CHI TIẾT một tài khoản.
//
// Điểm chính của cả đợt này: ở đây KHÔNG có phép tính nào. Nó gọi đúng hàm mà trang Đầu tư
// gọi, chỉ với mảng một phần tử — nên "trang tài khoản lệch trang Đầu tư" trở thành chuyện
// không biểu diễn được, thay vì chuyện phải nhớ đồng bộ. Trước đợt này hai màn vẽ cùng bộ
// số bằng hai đoạn JSX riêng, với bốn cái nhãn khác nhau.
import { useMemo } from 'react'
import {
  useAccountBalances,
  useFundPrices,
  useFundTrades,
  useStockPrices,
  useStockTrades,
} from '../../hooks/queries'
import type { AccountRow } from '../../types/database.types'
import { sessionNavs, type FundTrade } from './fundHoldings'
import { buildFundPortfolio } from './fundPortfolio'
import { sessionPrices, type Trade } from './holdings'
import { buildPortfolio } from './portfolio'

export type PortfolioKind = 'stocks' | 'funds'

export interface AccountPortfolioSummary {
  kind: PortfolioKind
  /** null = không đáng tin (tiền chưa mua âm, hoặc thiếu giá mọi mã/quỹ). */
  marketValue: number | null
  /** Giá vốn của số đang giữ — mốc chia phần trăm. Quyết định 1 của spec. */
  cost: number
  unrealizedPnl: number
  unrealizedPercent: number | null
  /** Số mã / số quỹ đang giữ. */
  count: number
  session: string | null
}

/**
 * Engine nào cho tài khoản này, hay không engine nào.
 *
 * Thuần, tách riêng để test được không cần React. `null` nghĩa là trang chi tiết rơi về
 * đường cũ: định giá nhập tay + nút "Cập nhật giá trị" + khu "Lịch sử giá trị". Đó là
 * đường duy nhất còn lại cho tài khoản đầu tư mà app không có bảng giá nào cho nó.
 *
 * Lưu trữ cũng trả `null`: hai tab của trang Đầu tư đều lọc `!is_archived`, nên nếu ở đây
 * vẫn hiện tóm tắt thì link "Xem danh mục" sẽ dẫn tới một tab lặng lẽ bỏ qua bộ lọc và
 * hiện danh mục của tài khoản KHÁC.
 */
export function portfolioKindOf(
  account: Pick<AccountRow, 'type' | 'currency' | 'is_archived'> | undefined,
  soLenh: number,
): PortfolioKind | null {
  if (!account || account.type !== 'investment' || account.is_archived) return null
  if (soLenh === 0) return null
  if (account.currency === 'VND') return 'stocks'
  if (account.currency === 'JPY') return 'funds'
  return null
}

export function useAccountPortfolio(
  account: AccountRow | undefined,
): AccountPortfolioSummary | null {
  const { data: balances = [] } = useAccountBalances()
  const { data: stockTrades = [] } = useStockTrades()
  const { data: prices = [] } = useStockPrices()
  const { data: fundTrades = [] } = useFundTrades()
  const { data: navRows = [] } = useFundPrices()

  const soLenhCoPhieu = useMemo(
    () => (account ? stockTrades.filter((t) => t.account_id === account.id) : []),
    [stockTrades, account],
  )
  const soLenhQuy = useMemo(
    () => (account ? fundTrades.filter((t) => t.account_id === account.id) : []),
    [fundTrades, account],
  )

  const kind = portfolioKindOf(
    account,
    account?.currency === 'JPY' ? soLenhQuy.length : soLenhCoPhieu.length,
  )

  const stocks = useMemo(() => {
    if (kind !== 'stocks' || !account) return null
    const { session, priceBySymbol } = sessionPrices(prices)
    // Số dư sổ là tham số brokerCash cần để ra "tiền chưa mua" — hook tự đọc, không bắt
    // trang gọi truyền vào như component Danh mục cổ phiếu cũ (đã xoá).
    const balance = balances.find((b) => b.id === account.id)?.balance ?? 0
    const trades: Trade[] = soLenhCoPhieu.map((t) => ({
      symbol: t.symbol,
      kind: t.kind,
      tradedOn: t.traded_on,
      quantity: t.quantity,
      price: t.price,
      fee: t.fee,
      tax: t.tax,
    }))
    const p = buildPortfolio(
      [{ accountId: account.id, accountName: account.name, balance, trades }],
      priceBySymbol,
    )
    return {
      kind: 'stocks' as const,
      marketValue: p.marketValue,
      cost: p.stockCost,
      unrealizedPnl: p.unrealizedPnl,
      unrealizedPercent: p.unrealizedPercent,
      count: p.positions.length,
      session,
    }
  }, [kind, account, prices, balances, soLenhCoPhieu])

  const funds = useMemo(() => {
    if (kind !== 'funds' || !account) return null
    const trades: FundTrade[] = soLenhQuy.map((t) => ({
      assocFundCd: t.assoc_fund_cd,
      kind: t.kind,
      tradedOn: t.traded_on,
      units: t.units,
      nav: t.nav,
      amount: t.amount,
    }))
    const { session, navByFund } = sessionNavs(
      navRows,
      trades.map((t) => t.assocFundCd),
    )
    const p = buildFundPortfolio(
      [{ accountId: account.id, accountName: account.name, trades }],
      navByFund,
    )
    return {
      kind: 'funds' as const,
      marketValue: p.marketValue,
      cost: p.fundCost,
      unrealizedPnl: p.unrealizedPnl,
      unrealizedPercent: p.unrealizedPercent,
      count: p.positions.length,
      session,
    }
  }, [kind, account, navRows, soLenhQuy])

  return stocks ?? funds
}
