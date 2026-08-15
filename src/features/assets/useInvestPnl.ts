// Lời/lỗ CHƯA BÁN của từng tài khoản đầu tư, cho DÒNG tài khoản trên trang Tài sản.
//
// Vì sao tồn tại: dòng danh sách từng hiện `giá thị trường − số dư sổ`, tức lãi/lỗ TOÀN
// ĐỜI (gồm cả phần đã bán) — cùng con số mà khối xanh phía trên đã ghi rõ nhãn "gồm đã
// bán". Nhưng dòng đó không có nhãn nào, nên nó đọc như "tài khoản này đang lời bấy
// nhiêu" và mâu thuẫn với trang chi tiết cùng tài khoản (chỉ tính phần chưa bán). Hai
// màn nói hai số về một tài khoản là lỗi, dù cả hai phép tính đều đúng theo định nghĩa
// riêng.
//
// Không có phép tính nào ở đây: `accountPortfolioSummary` (trang chi tiết cũng gọi) làm
// hết. File này chỉ lo phần "cho MỌI tài khoản một lượt" và phần nối dây react-query.
import { useMemo } from 'react'
import {
  useAccountBalances,
  useAccounts,
  useFundPrices,
  useFundTrades,
  useStockPrices,
  useStockTrades,
} from '../../hooks/queries'
import type { AccountRow } from '../../types/database.types'
import type { AssetAccount } from './aggregate'
import {
  accountPortfolioSummary,
  type AccountPortfolioSummary,
  type PortfolioSource,
} from './useAccountPortfolio'

/** Số dư sổ theo tài khoản — chỉ hai cột này, để test không phải dựng cả hàng view. */
export interface BalanceOf {
  id: string
  balance: number
}

/**
 * Tài khoản nào tính được danh mục thì có mục, tài khoản nào không thì KHÔNG có mục.
 *
 * Vắng mặt và "có mục nhưng `marketValue` null" là hai chuyện khác nhau, và nơi gọi cần
 * phân biệt: vắng mặt = app không có bảng giá nào cho tài khoản này (vàng, crypto, tài
 * khoản chỉ định giá nhập tay) nên không tách nổi phần chưa bán khỏi phần đã bán; có mục
 * mà null = có sổ lệnh nhưng lượt định giá này không đáng tin. Cả hai đều dẫn tới "không
 * in số", nhưng gộp chúng lại thì sau này không nói được hai câu khác nhau.
 */
export function investPnlByAccount(
  accounts: AccountRow[],
  balances: BalanceOf[],
  src: Omit<PortfolioSource, 'balance'>,
): Map<string, AccountPortfolioSummary> {
  const balanceById = new Map(balances.map((b) => [b.id, b.balance]))
  const out = new Map<string, AccountPortfolioSummary>()
  for (const a of accounts) {
    if (a.type !== 'investment') continue
    const s = accountPortfolioSummary(a, {
      ...src,
      balance: balanceById.get(a.id) ?? 0,
    })
    if (s) out.set(a.id, s)
  }
  return out
}

/**
 * Con số nhỏ cạnh tên tài khoản trên trang Tài sản; `null` = dòng đó không in gì.
 *
 * Hai loại tài sản, hai câu hỏi khác nhau — và đó là lý do hàm này tồn tại thay vì một
 * biểu thức trong JSX:
 *
 * - **Đầu tư** → lời/lỗ CHƯA BÁN, đúng con số trang chi tiết in. Không tính được (chưa
 *   có sổ lệnh, hoặc có mà lượt định giá không đáng tin) thì im lặng: `giá thị trường −
 *   số dư sổ` là lãi/lỗ toàn đời gồm cả phần đã bán, in nó ở đây mà không nhãn là mời
 *   người đọc hiểu nhầm thành phần chưa bán — đúng lỗi mà đợt này sửa.
 * - **Tài sản cố định** → giữ nguyên nếp cũ: giá trị hiện tại − giá mua, tức phần đã mất
 *   giá. Ở đó không có khái niệm "đã bán" nên không có gì để lẫn.
 */
export function accountRowPnl(
  account: Pick<AssetAccount, 'type' | 'marketValue' | 'balance'>,
  summary: AccountPortfolioSummary | undefined,
): number | null {
  if (account.type === 'investment') {
    if (!summary || summary.marketValue === null || summary.unrealizedPnl === 0) return null
    return summary.unrealizedPnl
  }
  if (account.marketValue === null || account.marketValue === account.balance) return null
  return account.marketValue - account.balance
}

/**
 * Bốn bảng thô, chỉ kéo khi thật sự có tài khoản đầu tư.
 *
 * `useStockPrices` đã được `useDataFreshness` (chân trang, mọi trang) kéo sẵn nên thực tế
 * chỉ thêm ba truy vấn, và react-query dùng chung cache với trang Đầu tư — mở /invest sau
 * đó không tốn thêm lượt nào.
 */
export function useInvestPnlByAccount(): Map<string, AccountPortfolioSummary> {
  const { data: accounts = [] } = useAccounts()
  const { data: balances = [] } = useAccountBalances()
  const coDauTu = accounts.some((a) => a.type === 'investment' && !a.is_archived)
  const { data: stockTrades = [] } = useStockTrades(coDauTu)
  const { data: stockPrices = [] } = useStockPrices(coDauTu)
  const { data: fundTrades = [] } = useFundTrades(coDauTu)
  const { data: fundPrices = [] } = useFundPrices(coDauTu)

  return useMemo(
    () =>
      investPnlByAccount(accounts, balances, {
        stockTrades,
        stockPrices,
        fundTrades,
        fundPrices,
      }),
    [accounts, balances, stockTrades, stockPrices, fundTrades, fundPrices],
  )
}
