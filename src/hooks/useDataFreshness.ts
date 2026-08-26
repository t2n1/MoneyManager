// Nối dữ liệu thật vào `freshnessSummary` (lib/freshness.ts).
//
// Hai hook, hai vai:
//
// `useDataFreshness` đủ cả hai nguồn — cho chân trang, tức là cho MỌI trang. Nó tự gọi
// useStockPrices chứ không đợi component con nào gọi trước, nên app tải bảng giá ngay từ
// trang đầu kể cả người không bao giờ mở Tài sản. Cái giá đó là CỐ Ý và đã cân: react-query
// dùng chung cache theo query key nên chỉ tốn một request mỗi phiên, không phải mỗi trang;
// đổi lại chân trang nói cùng một câu ở khắp nơi thay vì mỗi trang biết một phần.
//
// Nguồn thứ ba — nhãn "Giá trị tự khai", tức ngày định giá nhập tay gần nhất — ĐÃ BỎ. Bỏ
// nó thì `useAccountValuations` cũng rời khỏi mọi trang: bảng đó giờ chỉ tải khi thật sự
// mở Tài sản. Đừng thêm lại nguồn nào vào hook này mà không tính lại cái giá đó.
//
// `useRatesFreshness` chỉ tỷ giá — còn đúng một nơi dùng: trang Cài đặt cần biết tỷ giá
// có cũ không để bật khối cảnh báo kèm nút "Thử lấy lại".
import { useIsFetching } from '@tanstack/react-query'
import { useMemo } from 'react'
import { toISODate } from '../lib/dates'
import { freshnessSummary, type FreshnessSummary } from '../lib/freshness'
import type { CurrencyCode } from '../lib/currencies'
import { readRatesMeta } from '../lib/rates'
import { sessionPrices } from '../features/assets/holdings'
import { useRates, useStockPrices } from './queries'

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

/**
 * Số lượt fetch tỷ giá đang chạy — dùng làm TÍN HIỆU "vừa lấy xong, đọc lại cache đi",
 * không phải để tính ra kết quả.
 *
 * Cần riêng nó vì react-query giữ NGUYÊN tham chiếu `data` khi số mới trùng số cũ. Tỷ giá
 * thì hay trùng (nguồn chỉ đổi 1 lần/ngày), nên chỉ dựa vào `rates` là bấm "Thử lấy lại"
 * xong mốc thời gian không được đọc lại — màn hình vẫn nói "6 ngày trước" dù vừa lấy được
 * số mới. Con số này đổi 0 → 1 → 0 quanh mỗi lượt lấy nên lượt nào xong cũng có render.
 */
function useRatesRefetchTick(): number {
  return useIsFetching({ queryKey: ['rates'] })
}

/** Chỉ nguồn tỷ giá — cho trang Cài đặt. */
export function useRatesFreshness(): FreshnessSummary | null {
  const { base, rates } = useRates()
  const fetchTick = useRatesRefetchTick()
  return useMemo(
    () => {
      // `void` để oxlint(exhaustive-deps) thấy biến CÓ được tham chiếu trong thân hàm,
      // khỏi báo "unnecessary dependency" — xem giải thích ở useRatesRefetchTick.
      void fetchTick
      return freshnessSummary({
        ratesFetchedAt: readRatesFetchedAt(base),
        priceSession: null,
        staleSymbolCount: 0,
        nowMs: Date.now(),
        todayISO: toISODate(new Date()),
      })
    },
    // `rates` nằm trong danh sách phụ thuộc để ĐỌC LẠI cache: lần vẽ đầu tỷ giá thường
    // chưa về, cache còn mốc của phiên trước. Thiếu nó thì nhãn đứng ở mốc cũ suốt cả
    // lượt xem dù tỷ giá mới đã lấy xong ngay sau đó.
    [base, rates, fetchTick],
  )
}

/** Cả ba nguồn — cho chân trang, hiện ở mọi trang. */
export function useDataFreshness(): FreshnessSummary | null {
  const { base, rates } = useRates()
  const fetchTick = useRatesRefetchTick()
  const { data: prices = [] } = useStockPrices()

  const { session, staleSymbols } = useMemo(() => sessionPrices(prices), [prices])

  return useMemo(
    () => {
      void fetchTick
      return freshnessSummary({
        ratesFetchedAt: readRatesFetchedAt(base),
        priceSession: session,
        staleSymbolCount: staleSymbols.size,
        nowMs: Date.now(),
        todayISO: toISODate(new Date()),
      })
    },
    [base, rates, fetchTick, session, staleSymbols],
  )
}
