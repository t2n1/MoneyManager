// Nối dữ liệu thật vào `freshnessSummary` (lib/freshness.ts).
//
// Tách hai hook thay vì một hook có cờ bật/tắt: trang Báo cáo chỉ có tỷ giá, gọi thêm
// useStockPrices/useAccountValuations ở đó là hai request cho dữ liệu nó không dùng.
// Ở trang Tài sản thì hai query đó đã được HoldingsSection gọi rồi, nên dùng chung cache
// của react-query, không phát sinh request mới.
import { useMemo } from 'react'
import { toISODate } from '../lib/dates'
import { freshnessSummary, type FreshnessSummary } from '../lib/freshness'
import type { CurrencyCode } from '../lib/currencies'
import { readRatesMeta } from '../lib/rates'
import { sessionPrices } from '../features/assets/holdings'
import { useAccountValuations, useRates, useStockPrices } from './queries'

/**
 * Tuổi của con số tỷ giá đang dùng.
 *
 * Ưu tiên `sourceUpdatedAt` (lúc NGUỒN cập nhật tỷ giá) hơn `fetchedAt` (lúc mình tải
 * về): hai mốc này khác nhau, và cảnh báo "tỷ giá đã cũ" ở trang Cài đặt đo theo mốc
 * đầu. Dùng khác mốc thì trang Tài sản có thể báo "vừa xong" trong khi Cài đặt báo "đã
 * cũ" — cùng một con số mà hai chỗ nói ngược nhau.
 *
 * Cố ý KHÔNG dùng `dataUpdatedAt` của react-query: khi mạng lỗi, `fetchRates` lùi về tỷ
 * giá cũ trong cache mà react-query vẫn ghi nhận "vừa lấy xong" — đúng cái trường hợp
 * dòng nhãn này sinh ra để lộ.
 */
function readRatesFetchedAt(base: CurrencyCode): number | null {
  const meta = readRatesMeta(base)
  if (!meta) return null
  // fetchedAt = 0 là bản ghi cũ chưa có mốc — coi như không biết tuổi còn hơn báo
  // "56 năm trước" (0 là mốc thời gian Unix).
  return meta.sourceUpdatedAt ?? (meta.fetchedAt > 0 ? meta.fetchedAt : null)
}

/** Chỉ nguồn tỷ giá — cho trang Báo cáo. */
export function useRatesFreshness(): FreshnessSummary | null {
  const { base, rates } = useRates()
  return useMemo(
    () =>
      freshnessSummary({
        ratesFetchedAt: readRatesFetchedAt(base),
        priceSession: null,
        staleSymbolCount: 0,
        lastValuationOn: null,
        nowMs: Date.now(),
        todayISO: toISODate(new Date()),
      }),
    // `rates` nằm trong danh sách phụ thuộc để ĐỌC LẠI cache: lần vẽ đầu tỷ giá thường
    // chưa về, cache còn mốc của phiên trước. Thiếu nó thì nhãn đứng ở mốc cũ suốt cả
    // lượt xem dù tỷ giá mới đã lấy xong ngay sau đó.
    [base, rates],
  )
}

/** Cả ba nguồn — cho trang Tài sản. */
export function useAssetsFreshness(): FreshnessSummary | null {
  const { base, rates } = useRates()
  const { data: prices = [] } = useStockPrices()
  const { data: valuations = [] } = useAccountValuations()

  const { session, staleSymbols } = useMemo(() => sessionPrices(prices), [prices])

  // Chỉ tính bản tự khai: bản 'auto' do cron stock-refresh ghi, gộp vào đây thì nhãn
  // "giá trị tự khai" sẽ luôn trông như mới trong khi con số người dùng gõ tay đã cũ.
  const lastValuationOn = useMemo(() => {
    const manual = valuations.filter((v) => v.source === 'manual')
    if (manual.length === 0) return null
    return manual.reduce((max, v) => (v.valued_on > max ? v.valued_on : max), manual[0].valued_on)
  }, [valuations])

  return useMemo(
    () =>
      freshnessSummary({
        ratesFetchedAt: readRatesFetchedAt(base),
        priceSession: session,
        staleSymbolCount: staleSymbols.size,
        lastValuationOn,
        nowMs: Date.now(),
        todayISO: toISODate(new Date()),
      }),
    [base, rates, session, staleSymbols, lastValuationOn],
  )
}
