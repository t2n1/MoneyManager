// Dữ liệu cho tab Quỹ Nhật của trang Đầu tư — gom mọi tài khoản đầu tư JPY vào một danh mục.
//
// Chỉ nhận tài khoản `investment` + JPY: 基準価額 là yên trên 10.000 口 (migration 0045),
// tài khoản VND dùng chung khu này sẽ ra số vô nghĩa. Cùng điều kiện mà trang chi tiết tài
// khoản dùng để quyết định hiện khu quỹ hay khu cổ phiếu.
import { useMemo } from 'react'
import { useAccounts, useFundPrices, useFunds, useFundTrades } from '../../hooks/queries'
import type { AccountRow, FundTradeRow } from '../../types/database.types'
import { asFundTrade, fundHoldingsFromTrades, sessionNavs } from './fundHoldings'
import { buildFundPortfolio, type FundAccountTrades, type FundPortfolio } from './fundPortfolio'

export interface FundInvestData {
  /** Tài khoản đầu tư JPY đang mở (chưa lưu trữ). */
  accounts: AccountRow[]
  /** Tập đang được TÍNH — xem chú thích cùng tên ở useInvestData. */
  filtered: AccountRow[]
  /** Tập số liệu thật sự tính trên đó — xem chú thích cùng tên ở useInvestData. */
  shown: AccountRow[]
  /** Sổ lệnh của `filtered`, mới nhất trước. */
  trades: FundTradeRow[]
  portfolio: FundPortfolio
  /** Ngày phiên của các quỹ ĐANG GIỮ; null = chưa có giá. */
  session: string | null
  /** Quỹ đang giữ mà giá còn kẹt ở phiên cũ hơn `session`. */
  staleHeld: string[]
  accountName: (id: string) => string
  /** 協会コード → tên quỹ; trả lại chính mã khi danh bạ chưa có. */
  fundName: (assocFundCd: string) => string
  isLoading: boolean
}

export function useFundInvestData(accountId?: string | null): FundInvestData {
  const { data: accountRows = [], isLoading: accLoading } = useAccounts()
  const { data: allTrades = [], isLoading: tradesLoading } = useFundTrades()
  const { data: navRows = [] } = useFundPrices()
  const { data: funds = [] } = useFunds()

  const accounts = useMemo(
    () =>
      accountRows.filter(
        (a) => a.type === 'investment' && a.currency === 'JPY' && !a.is_archived,
      ),
    [accountRows],
  )

  const filtered = useMemo(
    () => (accountId ? accounts.filter((a) => a.id === accountId) : accounts),
    [accounts, accountId],
  )
  const shown = useMemo(
    () => (filtered.length > 0 ? filtered : accounts),
    [filtered, accounts],
  )

  const input: FundAccountTrades[] = useMemo(
    () =>
      shown.map((a) => ({
        accountId: a.id,
        accountName: a.name,
        trades: allTrades.filter((t) => t.account_id === a.id).map(asFundTrade),
      })),
    [shown, allTrades],
  )

  // Ngày phiên tính TRÊN QUỸ ĐANG GIỮ, không trên cả bảng giá: `fund_prices` chứa cả danh
  // bạ 8 quỹ, và một quỹ KHÔNG AI GIỮ đi trước một phiên sẽ làm mọi quỹ đang giữ trông
  // như "giá cũ", mỗi ngày, mãi mãi. Xem sessionNavs().
  //
  // "ĐANG GIỮ", KHÔNG phải "từng giao dịch": mã của một quỹ đã bán sạch nằm lại trong sổ
  // lệnh vĩnh viễn, nên duyệt thẳng `acc.trades` là đưa nó trở lại tập — đúng cái lỗi
  // sessionNavs sinh ra để chặn, chỉ đổi nguồn quỹ-không-ai-giữ từ danh bạ sang sổ lệnh.
  // Cộng dồn từng tài khoản rồi mới hợp, cùng khuôn buildFundPortfolio.
  const heldCds = useMemo(() => {
    const set = new Set<string>()
    for (const acc of input)
      for (const h of fundHoldingsFromTrades(acc.trades).holdings) set.add(h.assocFundCd)
    return [...set]
  }, [input])

  const { session, navByFund, staleFunds } = useMemo(
    () => sessionNavs(navRows, heldCds),
    [navRows, heldCds],
  )

  const portfolio = useMemo(() => buildFundPortfolio(input, navByFund), [input, navByFund])

  const trades = useMemo(() => {
    const ids = new Set(shown.map((a) => a.id))
    return allTrades
      .filter((t) => ids.has(t.account_id))
      .slice()
      .sort(
        (a, b) =>
          b.traded_on.localeCompare(a.traded_on) || b.created_at.localeCompare(a.created_at),
      )
  }, [allTrades, shown])

  // Quỹ có giá hợp lệ nhưng giá đó cũ hơn phiên chung. Loại quỹ đã nằm trong missingNavs:
  // một quỹ chỉ nên bị nêu MỘT lần, và "chưa có giá" đã nói đủ.
  const staleHeld = useMemo(
    () =>
      portfolio.positions
        .filter((p) => staleFunds.has(p.assocFundCd) && p.nav !== null)
        .map((p) => p.assocFundCd),
    [portfolio.positions, staleFunds],
  )

  const nameById = useMemo(() => new Map(accountRows.map((a) => [a.id, a.name])), [accountRows])
  const tenQuy = useMemo(() => new Map(funds.map((f) => [f.assoc_fund_cd, f.name])), [funds])

  return {
    accounts,
    filtered,
    shown,
    trades,
    portfolio,
    session,
    staleHeld,
    accountName: (id) => nameById.get(id) ?? '—',
    fundName: (cd) => tenQuy.get(cd) || cd,
    isLoading: accLoading || tradesLoading,
  }
}
