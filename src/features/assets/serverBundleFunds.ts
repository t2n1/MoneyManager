// Mặt tiếp xúc DUY NHẤT giữa app và edge function fund-refresh.
//
// File RIÊNG, không dùng chung serverBundle.ts của stock-refresh: bundle đó kéo theo
// HOSE_SYMBOLS (403 mã, ~20 KB) mà fund-refresh không bao giờ dùng. Hai mặt tiếp xúc
// riêng cũng làm giao kèo của từng function rõ ra — đọc file này là biết fund-refresh
// được phép gọi những gì.
//
// Cùng lý do như serverBundle.ts: Deno đòi import tương đối có đuôi `.ts`, cả repo này
// viết không đuôi, nên scripts/bundle-rules.mjs gom file này thành một file JS phẳng.
//
// Danh sách xuất ở đây = giao kèo. Chỉ xuất thứ THUẦN — không formatMoney (đọc trạng thái
// riêng tư toàn cục), không hook, không gì kéo theo React hay localStorage.

export {
  fundHoldingsFromTrades,
  fundValue,
  planFundBackfill,
  sessionNavs,
  NAV_UNITS,
} from './fundHoldings'
export type {
  FundBackfillAccount,
  FundBackfillDay,
  FundBackfillPlan,
  FundHolding,
  FundHoldingsResult,
  FundTrade,
  FundValue,
  SessionNavs,
} from './fundHoldings'

// Ngày tháng: bắt buộc đi qua đây, không tự cộng trừ ngày ở edge function.
export { toISODate } from '../../lib/dates'
