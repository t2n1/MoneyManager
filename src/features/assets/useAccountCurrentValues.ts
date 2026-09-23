// Giá trị hiện tại của MỌI tài khoản một lượt — cho các DANH SÁCH (Cài đặt › Tài khoản,
// Mục tiêu tiết kiệm, tab Quyết định). Trang chi tiết một tài khoản gọi thẳng
// `accountCurrentValue` với `useAccountPortfolio`; ở đây dùng `useInvestPnlByAccount`
// (cùng hàm `accountPortfolioSummary`, cùng cache react-query với trang Tài sản) nên
// không có phép định giá thứ hai nào.
import { useMemo } from 'react'
import { useAccountBalances, useAccounts } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { accountCurrentValue, type AccountCurrentValue } from './currentValue'
import { useInvestPnlByAccountState } from './useInvestPnl'

export function useAccountCurrentValues(): Map<string, AccountCurrentValue> {
  return useAccountCurrentValuesState().values
}

/**
 * Như `useAccountCurrentValues`, kèm cờ `loading` (tài khoản / số dư / sổ lệnh / giá còn
 * đang tải). Lúc đang tải, tài khoản đầu tư rơi về lần định giá gần nhất — số thật nhưng
 * CŨ, sẽ đổi khi sổ lệnh về. Nơi không được in hay ghi số tạm (tổng tài sản ròng, ảnh chụp
 * lịch sử) chờ cờ này tắt.
 */
export function useAccountCurrentValuesState(): {
  values: Map<string, AccountCurrentValue>
  loading: boolean
} {
  const { data: accounts = [], isLoading: l1 } = useAccounts()
  const { data: balances = [], isLoading: l2 } = useAccountBalances()
  const { map: portfolios, loading: l3 } = useInvestPnlByAccountState()
  const todayISO = toISODate(new Date())
  const loading = l1 || l2 || l3

  const values = useMemo(() => {
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
  return { values, loading }
}
