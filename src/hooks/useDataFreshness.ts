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
import { sessionPrices } from '../features/assets/holdings'
import { useAccountValuations, useRates, useStockPrices } from './queries'

/**
 * Mốc lấy tỷ giá THẬT gần nhất, đọc từ cache của lib/rates.ts.
 *
 * Cố ý KHÔNG dùng `dataUpdatedAt` của react-query: khi mạng lỗi, `fetchRates` lùi về
 * tỷ giá cũ trong localStorage và react-query vẫn ghi nhận "vừa lấy xong" — đúng cái
 * trường hợp mà dòng nhãn này sinh ra để lộ. `fetchedAt` chỉ được ghi khi gọi mạng
 * thành công thật.
 *
 * Khi `readRatesMeta` của lib/rates.ts về nhánh chính thì thay cả thân hàm này bằng
 * `readRatesMeta(base)?.fetchedAt ?? null`.
 */
function readRatesFetchedAt(base: CurrencyCode): number | null {
  try {
    const raw = localStorage.getItem(`sct-rates-${base}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { fetchedAt?: unknown }
    return typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : null
  } catch {
    // localStorage bị chặn, hoặc JSON hỏng → coi như chưa biết tuổi, không làm sập trang.
    return null
  }
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
