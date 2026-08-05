// Mặt tiếp xúc DUY NHẤT giữa app và edge function stock-refresh.
//
// Cùng lý do như src/features/notifications/serverBundle.ts: Deno đòi import tương đối
// có đuôi `.ts`, cả repo này viết không đuôi, nên scripts/bundle-rules.mjs gom đúng file
// này thành một file JS phẳng.
//
// Danh sách xuất ở đây = giao kèo. Chỉ xuất thứ THUẦN — không formatMoney (đọc trạng
// thái riêng tư toàn cục), không hook, không gì kéo theo React hay localStorage.

export {
  brokerCash,
  holdingsFromTrades,
  portfolioValue,
  sessionPrices,
} from './holdings'
export type { Holding, HoldingsResult, PortfolioValue, SessionPrices, Trade } from './holdings'

// Ngày tháng: bắt buộc đi qua đây, không tự cộng trừ ngày ở edge function.
export { toISODate } from '../../lib/dates'

// Danh sách mã HOSE tĩnh: edge function hút giá cho CẢ sàn (không chỉ mã đã giao dịch)
// và điền tên công ty vào stock_prices.name — xem prices.ts và docs/co-phieu-viet-nam.md.
export { HOSE_SYMBOLS } from './hoseSymbols'
