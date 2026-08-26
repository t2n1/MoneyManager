// Dữ liệu cho tab Quỹ Nhật của trang Đầu tư — gom mọi tài khoản đầu tư JPY vào một danh mục.
//
// Chỉ nhận tài khoản `investment` + JPY: 基準価額 là yên trên 10.000 口 (migration 0045),
// tài khoản VND dùng chung khu này sẽ ra số vô nghĩa. Cùng điều kiện mà trang chi tiết tài
// khoản dùng để quyết định hiện khu quỹ hay khu cổ phiếu.
import { useMemo } from 'react'
import {
  useAccountBalances,
  useAccounts,
  useFundPrices,
  useFunds,
  useFundTrades,
  useLifePhases,
  useProfile,
  useRangeTransactions,
} from '../../hooks/queries'
import {
  addMonths,
  getMonthRange,
  monthKeyForDate,
  monthKeyString,
  toISODate,
} from '../../lib/dates'
import type { AccountRow, FundTradeRow } from '../../types/database.types'
import {
  measureMonthlyContribution,
  projectBalance,
  type BalanceProjection,
  type MonthlyContribution,
} from './balanceAccrual'
import { asFundTrade, fundHoldingsFromTrades, sessionNavs } from './fundHoldings'
import {
  buildFundPortfolio,
  fundTabTotal,
  type FundAccountTrades,
  type FundBalanceAccount,
  type FundPortfolio,
  type FundTabTotal,
} from './fundPortfolio'

/** Một tài khoản tính theo số dư, kèm nhịp đóng đo từ sổ và con số chiếu tới lúc nghỉ. */
export interface FundBalanceAccountView extends FundBalanceAccount {
  /** Mức đóng đều đo từ 12 tháng gần nhất; `minorPerMonth = 0` = không đo được. */
  contribution: MonthlyContribution
  /**
   * Chiếu tới đầu năm `toYear` — năm chặng CUỐI của trang Tương lai bắt đầu. `phaseLabel`
   * là tên chặng đó, hiện ra kèm con số để nó không tự nhận là "năm nghỉ hưu" khi chặng
   * cuối của người dùng tên là gì khác. null = chưa đặt chặng nào, hoặc không đo được nhịp.
   */
  projection: (BalanceProjection & { toYear: number; phaseLabel: string }) | null
}

export interface FundInvestData {
  /** Tài khoản đầu tư JPY đang mở (chưa lưu trữ). */
  accounts: AccountRow[]
  /** Trong `accounts`: những tài khoản CÓ sổ lệnh quỹ — phần tính theo 基準価額. */
  fundAccounts: AccountRow[]
  /** Trong `accounts`: những tài khoản KHÔNG có sổ lệnh — tính theo số dư. */
  balanceAccounts: FundBalanceAccountView[]
  /** Tập đang được TÍNH — xem chú thích cùng tên ở useInvestData. */
  filtered: AccountRow[]
  /** Tập số liệu thật sự tính trên đó — xem chú thích cùng tên ở useInvestData. */
  shown: AccountRow[]
  /** Sổ lệnh của `filtered`, mới nhất trước. */
  trades: FundTradeRow[]
  portfolio: FundPortfolio
  /** Con số ở đầu tab: `portfolio` + số dư `balanceAccounts`. */
  total: FundTabTotal
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
  const { data: balanceRows = [], isLoading: balLoading } = useAccountBalances()

  const accounts = useMemo(
    () =>
      accountRows.filter(
        (a) => a.type === 'investment' && a.currency === 'JPY' && !a.is_archived,
      ),
    [accountRows],
  )

  // Chia hai theo ĐÚNG MỘT dấu hiệu: có sổ lệnh quỹ hay không — xem `FundBalanceAccount`.
  // Không lọc theo tên, không thêm cờ mới trong DB: một tài khoản Rakuten vừa mở cũng
  // chưa có lệnh nào, và nó phải tự sang bên quỹ ngay khi lệnh đầu tiên được ghi.
  const idsCoLenh = useMemo(() => new Set(allTrades.map((t) => t.account_id)), [allTrades])
  const fundAccounts = useMemo(
    () => accounts.filter((a) => idsCoLenh.has(a.id)),
    [accounts, idsCoLenh],
  )
  const soDuAccounts = useMemo(
    () => accounts.filter((a) => !idsCoLenh.has(a.id)),
    [accounts, idsCoLenh],
  )

  // Nhịp đóng và năm ngừng làm CHỈ cần khi có tài khoản tính theo số dư — `enabled` để
  // mở tab này với một tài khoản quỹ thường không phải kéo về cả năm giao dịch.
  const { data: profile } = useProfile()
  const { data: phases = [] } = useLifePhases()
  const monthStartDay = profile?.month_start_day ?? 1
  const todayISO = toISODate(new Date())
  /** Tháng hiện tại THEO CÁCH NGƯỜI DÙNG CHIA THÁNG — dùng cho cả khoảng đọc và phép chiếu. */
  const thangNay = useMemo(
    () => monthKeyForDate(todayISO, monthStartDay),
    [todayISO, monthStartDay],
  )
  const range = useMemo(
    () => ({
      start: getMonthRange(addMonths(thangNay, -11), monthStartDay).start,
      end: getMonthRange(thangNay, monthStartDay).end,
    }),
    [thangNay, monthStartDay],
  )
  const { data: namQua = [] } = useRangeTransactions(range, soDuAccounts.length > 0 && !!profile)

  /**
   * Chặng CUỐI của trang Tương lai — chỗ duy nhất trong app có năm người dùng dự tính
   * ngừng làm (`draft.ts`: "dời tuổi nghỉ hưu = ghi start_year của chặng cuối"). Tên
   * chặng đi kèm con số ra tới màn hình, để nếu chặng cuối của họ tên là "Về VN" thì
   * dòng chữ nói đúng "tới 2060 (chặng Về VN)" chứ không tự phong là năm nghỉ hưu.
   */
  const changCuoi = useMemo(
    () => (phases.length === 0 ? null : phases.reduce((a, b) => (b.start_year > a.start_year ? b : a))),
    [phases],
  )

  const balanceAccounts = useMemo<FundBalanceAccountView[]>(
    () =>
      soDuAccounts.map((a) => {
        const b = balanceRows.find((r) => r.id === a.id)
        // market_value trước, số dư sau — đúng thứ tự `investmentStats()` dùng ở trang
        // chi tiết tài khoản, để hai màn không nói hai số. 退職金 không có ảnh chụp giá
        // nào nên nó rơi về số dư sổ.
        const value = b?.market_value ?? b?.balance ?? 0
        // Chỉ khoản THU vào chính tài khoản này: đó là hình dạng của một lần đóng —
        // `nhap.ts` ghi DB掛金 thành một dòng thu thẳng vào 退職金, Yucho không đổi.
        const contribution = measureMonthlyContribution(
          namQua
            .filter((t) => t.type === 'income' && t.account_id === a.id)
            .map((t) => ({
              monthKey: monthKeyString(monthKeyForDate(t.occurred_on, monthStartDay)),
              minor: t.amount,
            })),
        )
        const p = changCuoi
          ? projectBalance(value, contribution, changCuoi.start_year, thangNay)
          : null
        return {
          accountId: a.id,
          accountName: a.name,
          value,
          contribution,
          projection:
            p && changCuoi
              ? { ...p, toYear: changCuoi.start_year, phaseLabel: changCuoi.label }
              : null,
        }
      }),
    [soDuAccounts, balanceRows, namQua, monthStartDay, changCuoi, thangNay],
  )

  // Lọc/tính CHỈ trên `fundAccounts`: chip tài khoản và mọi con số 基準価額 bên dưới đều
  // chỉ có nghĩa với tài khoản có sổ lệnh. `accounts` (cả hai loại) vẫn giữ để làm màn
  // rỗng và để hộp "Ghi lệnh vào tài khoản nào" còn với tới tài khoản quỹ vừa mở.
  const filtered = useMemo(
    () => (accountId ? fundAccounts.filter((a) => a.id === accountId) : fundAccounts),
    [fundAccounts, accountId],
  )
  const shown = useMemo(
    () => (filtered.length > 0 ? filtered : fundAccounts),
    [filtered, fundAccounts],
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

  const total = useMemo(
    () => fundTabTotal(portfolio, balanceAccounts),
    [portfolio, balanceAccounts],
  )

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
    fundAccounts,
    balanceAccounts,
    filtered,
    shown,
    trades,
    portfolio,
    total,
    session,
    staleHeld,
    accountName: (id) => nameById.get(id) ?? '—',
    fundName: (cd) => tenQuy.get(cd) || cd,
    // balLoading cũng tính: số dư về muộn thì `balanceAccounts` tạm ¥0, và một con số
    // tổng nhấp từ ¥0 sang số thật là thứ người đọc kịp thấy và kịp tin.
    isLoading: accLoading || tradesLoading || balLoading,
  }
}
