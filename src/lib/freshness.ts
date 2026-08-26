// Tuổi của dữ liệu lấy từ ngoài (tỷ giá, giá cổ phiếu).
//
// Vì sao có file này: app trộn nhiều loại số có tuổi rất khác nhau trong cùng một màn —
// số dư sổ (luôn đúng), tỷ giá (vài giờ), giá cổ phiếu (theo phiên). Nhìn vào không có gì
// phân biệt, nên người đọc mặc định coi tất cả đều mới.
//
// Module này KHÔNG tự đọc cache tỷ giá: nó nhận mốc thời gian qua tham số, nên test được
// mà không cần localStorage, và nơi gọi (hooks/useDataFreshness.ts) tự chọn nguồn mốc.
import { STALE_RATE_DAYS } from './rates'

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

// Ngưỡng "tỷ giá đã cũ" lấy thẳng từ lib/rates.ts, không khai lại: cảnh báo ở trang Cài
// đặt dùng cùng con số này, hai bản sao sẽ trôi khỏi nhau lúc nào không biết.
export { STALE_RATE_DAYS }

/** "3 giờ trước" / "hôm qua" / "5 ngày trước". Mốc ở tương lai → "vừa xong". */
export function ageLabel(ms: number): string {
  if (ms < MIN) return 'vừa xong'
  if (ms < HOUR) return `${Math.floor(ms / MIN)} phút trước`
  if (ms < DAY) return `${Math.floor(ms / HOUR)} giờ trước`
  const days = Math.floor(ms / DAY)
  if (days === 1) return 'hôm qua'
  return `${days} ngày trước`
}

export interface FreshnessInput {
  /** Mốc lấy tỷ giá gần nhất (ms). null = chưa từng lấy được. */
  ratesFetchedAt: number | null
  /** Ngày phiên giá cổ phiếu gần nhất (ISO). null = không giữ cổ phiếu. */
  priceSession: string | null
  /** Số mã còn kẹt ở giá của phiên cũ hơn. */
  staleSymbolCount: number
  nowMs: number
  todayISO: string
}

export interface FreshnessDetail {
  label: string
  age: string
  tone: 'ok' | 'warn'
}

export interface FreshnessSummary {
  /** Gộp của cả nhóm — dùng cho chấm màu đứng đầu dòng. */
  tone: 'ok' | 'warn'
  /**
   * Từng nguồn, theo thứ tự hiện. Cố ý KHÔNG kèm sẵn một chuỗi `line` đã nối:
   * nối trước thì nơi hiện chỉ tô được một màu cho cả dòng, mà tone của mỗi nguồn
   * một khác — người đọc thấy "Tỷ giá" nằm trong dòng hổ phách sẽ tưởng tỷ giá có
   * vấn đề trong khi thủ phạm là nguồn khác.
   */
  details: FreshnessDetail[]
}

/** Số ngày giữa hai ngày ISO, không âm. */
function daysSinceISO(fromISO: string, todayISO: string): number {
  const ms = Date.parse(todayISO) - Date.parse(fromISO)
  return ms <= 0 ? 0 : Math.floor(ms / DAY)
}

/**
 * Gom tuổi của các nguồn thành một dòng đọc được.
 * Trả null khi KHÔNG có nguồn nào — để nơi gọi khỏi hiện một dòng rỗng.
 */
export function freshnessSummary(input: FreshnessInput): FreshnessSummary | null {
  const details: FreshnessDetail[] = []

  if (input.ratesFetchedAt !== null) {
    const ms = input.nowMs - input.ratesFetchedAt
    details.push({
      label: 'Tỷ giá',
      age: ageLabel(ms),
      tone: ms > STALE_RATE_DAYS * DAY ? 'warn' : 'ok',
    })
  }

  if (input.priceSession !== null) {
    const days = daysSinceISO(input.priceSession, input.todayISO)
    details.push({
      label: 'Giá cổ phiếu',
      age: days === 0 ? 'hôm nay' : ageLabel(days * DAY),
      // Mã kẹt giá cũ là tín hiệu mạnh hơn tuổi của phiên: phiên có thể mới mà vài mã
      // vẫn chưa có giá, và đó mới là lúc tổng tài sản bị tính hụt.
      tone: input.staleSymbolCount > 0 ? 'warn' : 'ok',
    })
  }

  if (details.length === 0) return null

  return {
    tone: details.some((d) => d.tone === 'warn') ? 'warn' : 'ok',
    details,
  }
}
