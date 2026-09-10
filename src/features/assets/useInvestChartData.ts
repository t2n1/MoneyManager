// MỘT lượt tải và MỘT lượt dựng chuỗi cho cả khu Hiệu quả và khu Rủi ro.
//
// Vì sao là hook chung chứ không để mỗi khu tự gọi: hai khu cần đúng cùng một thứ — lịch
// sử giá, chỉ số, và chuỗi NAV dựng lại từ sổ lệnh. Hai lượt đọc thì TanStack Query đã gộp
// (trùng khoá cache), nhưng `navSeries` thì KHÔNG: nó gọi lại `holdingsFromTrades` trên
// từng tiền tố sổ lệnh qua ~2.600 phiên, và chạy hai lần là trả giá đó hai lần cho cùng
// một kết quả.
//
// Hook chỉ nối dây. Mọi phép tính ở navSeries.ts / twr.ts / investChartData.ts.
import { useMemo } from 'react'
import { useIndexPrices, useRangeTransactions, useStockPriceHistory } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import type { AccountRow, IndexPriceRow, StockTradeRow } from '../../types/database.types'
import { asTrade } from './holdings'
import {
  buildPriceMap,
  hasUsablePrices,
  rangeFrom,
  trimLeadingEmpty,
} from './investChartData'
import { investTxRange } from './investHistory'
import { navSeries, toLedger } from './navSeries'
import { dailyReturnsOf, periodReturns, type NavFlow, type PeriodReturns } from './twr'

export interface InvestChartData {
  isLoading: boolean
  /**
   * true = chưa có giá cho mã nào trong sổ lệnh. Lúc đó `points`, `returns` và
   * `dailyReturns` đều RỖNG — rỗng chứ không phải "bằng 0", xem `hasUsablePrices`.
   */
  noPrices: boolean
  /**
   * Mã phải tạm tính theo GIÁ VỐN ở những phiên đầu vì bar giá tới muộn hơn lệnh mua.
   * Rỗng khi `noPrices` — lúc đó câu "chưa có lịch sử giá" đã nói đủ, nêu thêm tên mã
   * chỉ là nói hai lần cùng một chuyện.
   */
  missingPrices: string[]
  /** Chuỗi NAV theo phiên, ĐÃ cắt những phiên đầu mà danh mục còn rỗng. */
  points: NavFlow[]
  /** Hàng chỉ số thô — cũng chính là LỊCH PHIÊN mà mọi thứ khác bám theo. */
  indexRows: IndexPriceRow[]
  /** ngày → điểm×100 */
  indexByDate: Map<string, number>
  /** mã → { ngày → đồng/cổ } */
  priceMap: Map<string, Map<string, number>>
  /** Lịch phiên, tăng dần. */
  sessions: string[]
  /** Năm con số của cả danh mục (không phải của một khung nhìn). */
  returns: PeriodReturns
  /** Lợi suất từng phiên của danh mục — nguyên liệu của biến động và Sharpe. */
  dailyReturns: number[]
}

export function useInvestChartData(
  accounts: AccountRow[],
  trades: StockTradeRow[],
): InvestChartData {
  const todayISO = toISODate(new Date())
  // TRỌN lịch sử, không theo khung nhìn — xem lời giải thích ở InvestPerformanceSection.
  const from = rangeFrom('all', todayISO)

  // MỌI mã từng giao dịch, không chỉ mã đang giữ: quá khứ của danh mục có cả mã đã bán.
  const symbols = useMemo(() => [...new Set(trades.map((t) => t.symbol))].sort(), [trades])
  const accountIds = useMemo(() => new Set(accounts.map((a) => a.id)), [accounts])

  const { data: history = [], isLoading: dangTaiGia } = useStockPriceHistory(symbols, from)
  const { data: indexRows = [], isLoading: dangTaiChiSo } = useIndexPrices(from)
  // Sổ giao dịch đọc TRỌN lịch sử: số dư tại phiên đầu phụ thuộc mọi lần nạp/rút trước đó.
  // Dùng đúng `investTxRange` mà các khu đầu tư khác dùng → chung một lượt đọc.
  const { data: txs = [] } = useRangeTransactions(investTxRange(todayISO), accountIds.size > 0)

  return useMemo(() => {
    const sessions = indexRows.map((r) => r.trading_date)
    // MỘT bản `priceMap`: `navSeries` và khu Rủi ro dùng đúng cùng một Map.
    const priceMap = buildPriceMap(history)
    const { points, missingPrices } = navSeries({
      sessions,
      trades: trades.map(asTrade),
      prices: priceMap,
      ledger: toLedger(txs, accountIds),
      openingBalance: accounts.reduce((s, a) => s + a.initial_balance, 0),
    })
    // Thiếu giá TOÀN BỘ thì trả RỖNG, không trả chuỗi giá-vốn — lý lẽ ở `hasUsablePrices`.
    // Chặn ở ĐÂY, cửa duy nhất, chứ không gác ở từng khu: gác từng khu là mời một khu thứ
    // ba mọc lên mà không ai gác, và năm con số ở khu Hiệu quả cũng phải im theo biểu đồ.
    const coGia = hasUsablePrices(priceMap, symbols)
    const catDau = coGia ? trimLeadingEmpty(points) : []

    return {
      isLoading: dangTaiGia || dangTaiChiSo,
      noPrices: !coGia,
      missingPrices: coGia ? missingPrices : [],
      points: catDau,
      indexRows,
      indexByDate: new Map(indexRows.map((r) => [r.trading_date, r.close_x100])),
      priceMap,
      sessions,
      returns: periodReturns(catDau),
      dailyReturns: dailyReturnsOf(catDau),
    }
  }, [
    indexRows,
    trades,
    history,
    txs,
    accountIds,
    accounts,
    symbols,
    dangTaiGia,
    dangTaiChiSo,
  ])
}
