// Kết luận của tab Tương lai đã trôi thế nào so với vài tháng trước — THUẦN, không React.
//
// Hộp kết luận chỉ nói HÔM NAY: "FIRE 2045". Người dùng không có cách nào biết ba tháng
// trước nó là 2044 và vì sao lùi. Migration 0055 ghi mỗi tháng một dòng kết luận đã tính;
// file này đọc dòng cũ nhất trong cửa sổ so sánh và trả về HIỆU dạng số. Component lo
// chữ và định dạng tiền (cùng lý do `LifetimeVerdict` ở summary.ts không format).

/** Một dòng lịch sử — đúng các cột cần so, không kéo cả Row của DB vào module thuần. */
export interface VerdictPoint {
  /** Ngày đầu tháng tài chính, ISO `YYYY-MM-DD`. */
  month_on: string
  fire_year: number | null
  negative_year: number | null
  end_age: number
  assets_end_minor: number
  display_currency: string
}

export interface VerdictDrift {
  /** Số tháng giữa mốc so và tháng này, ≥ 1. */
  monthsAgo: number
  thenMonthOn: string
  fireThen: number | null
  fireNow: number | null
  negativeThen: number | null
  negativeNow: number | null
  assetsThen: number
  assetsNow: number
  endAge: number
  /** Có ít nhất một trong ba thứ đổi (FIRE, năm âm, tài sản cuối ≥ ngưỡng). */
  changed: boolean
}

/** So với mốc cũ nhất trong 6 tháng — cùng cửa sổ với xu hướng điểm sức khỏe. */
export const DRIFT_WINDOW_MONTHS = 6
/** Tài sản cuối đổi dưới 1% thì coi là không đổi: làm tròn tỷ giá cũng đủ tạo ra 0,3%. */
export const ASSETS_CHANGE_THRESHOLD = 0.01

/** Số tháng từ `a` tới `b` (ISO), tính theo lịch, bỏ ngày. */
export function monthsBetween(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}

/**
 * Mốc so là dòng CŨ NHẤT trong cửa sổ, không phải dòng liền trước: một tháng lẻ đi
 * xuống không nên xoá cả xu hướng. Chỉ so dòng CÙNG tuổi chiếu và CÙNG tiền hiển thị
 * — hai dòng khác một trong hai thứ đó là hai thước khác nhau, hiệu số của chúng
 * không phải xu hướng.
 *
 * `null` = không có gì để so (tháng đầu, hoặc mọi dòng cũ đều khác thước).
 */
export function verdictDrift(
  history: VerdictPoint[],
  thisMonthOn: string,
  now: VerdictPoint,
  windowMonths = DRIFT_WINDOW_MONTHS,
): VerdictDrift | null {
  const candidates = history
    .filter((h) => h.month_on < thisMonthOn)
    .filter((h) => {
      const ago = monthsBetween(h.month_on, thisMonthOn)
      return ago >= 1 && ago <= windowMonths
    })
    .filter((h) => h.end_age === now.end_age && h.display_currency === now.display_currency)
    .sort((a, b) => a.month_on.localeCompare(b.month_on))
  const then = candidates[0]
  if (!then) return null

  const fireChanged = then.fire_year !== now.fire_year
  const negativeChanged = then.negative_year !== now.negative_year
  const base = Math.abs(then.assets_end_minor)
  const delta = Math.abs(now.assets_end_minor - then.assets_end_minor)
  const assetsChanged = base === 0 ? delta > 0 : delta / base >= ASSETS_CHANGE_THRESHOLD

  return {
    monthsAgo: monthsBetween(then.month_on, thisMonthOn),
    thenMonthOn: then.month_on,
    fireThen: then.fire_year,
    fireNow: now.fire_year,
    negativeThen: then.negative_year,
    negativeNow: now.negative_year,
    assetsThen: then.assets_end_minor,
    assetsNow: now.assets_end_minor,
    endAge: now.end_age,
    changed: fireChanged || negativeChanged || assetsChanged,
  }
}
