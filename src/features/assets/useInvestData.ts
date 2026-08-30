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
import { asTrade, sessionPrices } from './holdings'
import { buildPortfolio, type AccountTrades, type Portfolio } from './portfolio'

export interface InvestData {
  /** Tài khoản chứng khoán VND đang mở (chưa lưu trữ). */
  accounts: AccountRow[]
  /**
   * Tập tài khoản đang được TÍNH. Bằng `accounts` khi không lọc; bằng một phần tử khi
   * trang gọi kèm `?account=`. Giữ riêng khỏi `accounts` vì `accounts` còn dùng để dựng
   * chip chọn và để biết có nên hiện trạng thái rỗng hay không — lọc mất nó thì chip tự
   * biến mất ngay khi bấm vào một chip.
   */
  filtered: AccountRow[]
  /**
   * Tập tài khoản mà mọi con số bên dưới THẬT SỰ được tính trên đó: bằng `filtered`, trừ
   * khi `filtered` rỗng (`?account=` trỏ tài khoản đã xoá/lưu trữ) thì rơi về `accounts`.
   *
   * Trả ra ngoài chứ không giữ riêng trong hook: nhãn tên tài khoản trên từng dòng lệnh
   * và câu hỏi "ghi lệnh vào tài khoản nào" phải khoá theo ĐÚNG tập này. Khoá theo
   * `filtered` thì với một `?account=` cũ, sổ lệnh trải mọi tài khoản mà không dòng nào
   * nói mình thuộc tài khoản nào, còn nút Ghi lệnh thì mở thẳng vào một tài khoản người
   * dùng không hề chọn.
   */
  shown: AccountRow[]
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

export function useInvestData(accountId?: string | null): InvestData {
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

  // `accountId` không khớp tài khoản nào của tab (bookmark cũ, tài khoản đã xoá hoặc đã
  // lưu trữ) → bỏ qua, hiện tất cả. Người dùng vào đây để xem danh mục, không để nghe
  // về một id.
  const filtered = useMemo(
    () => (accountId ? accounts.filter((a) => a.id === accountId) : accounts),
    [accounts, accountId],
  )
  const shown = useMemo(
    () => (filtered.length > 0 ? filtered : accounts),
    [filtered, accounts],
  )

  const { session, priceBySymbol, staleSymbols } = useMemo(
    () => sessionPrices(prices),
    [prices],
  )

  const trades = useMemo(() => {
    const ids = new Set(shown.map((a) => a.id))
    return allTrades
      .filter((t) => ids.has(t.account_id))
      .slice()
      .sort((a, b) => b.traded_on.localeCompare(a.traded_on) || b.created_at.localeCompare(a.created_at))
  }, [allTrades, shown])

  const portfolio = useMemo(() => {
    const balanceById = new Map(balances.map((b) => [b.id, b.balance]))
    const input: AccountTrades[] = shown.map((a) => ({
      accountId: a.id,
      accountName: a.name,
      balance: balanceById.get(a.id) ?? 0,
      trades: allTrades.filter((t) => t.account_id === a.id).map(asTrade),
    }))
    // Ví của các tài khoản đang xét, mỗi ví đếm ĐÚNG MỘT LẦN: hai tài khoản chứng khoán
    // trỏ chung một ngân hàng là chuyện bình thường, cộng hai lần là bịa ra tiền.
    const viIds = new Set(shown.map((a) => a.cash_account_id).filter((id): id is string => !!id))
    const walletCash =
      viIds.size === 0 ? null : [...viIds].reduce((s, id) => s + (balanceById.get(id) ?? 0), 0)
    return buildPortfolio(input, priceBySymbol, walletCash)
  }, [shown, balances, allTrades, priceBySymbol])

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
    filtered,
    shown,
    trades,
    portfolio,
    session,
    staleHeld,
    accountName: (id) => nameById.get(id) ?? '—',
    isLoading: accLoading || tradesLoading,
  }
}
