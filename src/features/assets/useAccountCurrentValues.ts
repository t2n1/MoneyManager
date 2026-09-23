// Giá trị hiện tại của MỌI tài khoản một lượt — cho các DANH SÁCH (Cài đặt › Tài khoản,
// Mục tiêu tiết kiệm, tab Quyết định). Trang chi tiết một tài khoản gọi thẳng
// `accountCurrentValue` với `useAccountPortfolio`; ở đây dùng `useInvestPnlByAccount`
// (cùng hàm `accountPortfolioSummary`, cùng cache react-query với trang Tài sản) nên
// không có phép định giá thứ hai nào.
import { useMemo } from 'react'
import { useAccountBalances, useAccounts } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { accountCurrentValue, type AccountCurrentValue } from './currentValue'
import { useInvestPnlByAccount } from './useInvestPnl'

export function useAccountCurrentValues(): Map<string, AccountCurrentValue> {
  const { data: accounts = [] } = useAccounts()
  const { data: balances = [] } = useAccountBalances()
  const portfolios = useInvestPnlByAccount()
  const todayISO = toISODate(new Date())

  return useMemo(() => {
    const balanceById = new Map(balances.map((b) => [b.id, b]))
    const out = new Map<string, AccountCurrentValue>()
    for (const a of accounts) {
      const b = balanceById.get(a.id)
      out.set(
        a.id,
        accountCurrentValue(
          a,
          b?.balance ?? 0,
          b?.market_value ?? null,
          // Vắng mặt trong map = không có sổ lệnh (hoặc chưa tải xong): cả hai đều rơi về
          // lần định giá gần nhất — y như trang chi tiết.
          portfolios.get(a.id) ?? null,
          todayISO,
        ),
      )
    }
    return out
  }, [accounts, balances, portfolios, todayISO])
}
