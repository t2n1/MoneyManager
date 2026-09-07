// Một mốc cuộc đời tốn (hoặc mang lại) bao nhiêu TRONG MỘT NĂM CỤ THỂ — THUẦN.
//
// Trước file này, câu trả lời là một dòng trong vòng năm của `project.ts`: nằm trong
// khoảng thì lấy `amountMinor`, ngoài thì bỏ. Tức mọi mốc đều là "số này, mỗi năm, đều
// tăm tắp" — và bốn thứ người ta thật sự muốn khai đều không nói được:
//
//   - "Cưới tốn ¥3.000.000" kéo 2029–2030 → bản chiếu trừ ¥6M. Cái bẫy này đã bắt được
//     trên app 2026-09-02; `eventSpan.ts` sinh ra hồi đó chỉ để CẢNH BÁO nó, vì không
//     có cách nào khai cho đúng. File này khai được đúng, nên file kia đã xoá và
//     `eventSpanNote` ở cuối đây thay chỗ nó.
//   - "Đổi xe mỗi 8 năm" → phải tạo 5 mốc rời, sửa số là sửa cả 5.
//   - "Học phí tăng nhanh hơn giá chung" → chỉ có bật/tắt lạm phát, không có mức riêng.
//   - "Nuôi con 22 năm" → tốn ít lúc bé, vọt lúc đại học; một số phẳng nói sai cả hai đầu.
//
// VÌ SAO MỘT ENUM CHỨ KHÔNG BA CỜ. `total`, `ramp`, `growth` đều trả lời CÙNG một câu
// hỏi: "con số này biến thiên thế nào dọc khoảng". Để chúng là ba cờ độc lập thì có
// 8 tổ hợp, 5 trong số đó vô nghĩa ("tổng cả khoảng" mà lại "tăng 3%/năm" là gì?), và
// mỗi tổ hợp vô nghĩa là một chỗ để một luật ưu tiên ngầm quyết định hộ người dùng.
// Một enum thì bốn ca, ca nào cũng đọc ra được thành một câu tiếng Việt.
//
// `repeatEveryYears` thì TRỰC GIAO thật: nó chọn NĂM NÀO mốc rơi vào, không nói gì về
// BAO NHIÊU. Nên nó là trường riêng và ghép được với cả bốn hình.
import type { LifetimeEvent } from './project'

/** Con số của mốc biến thiên thế nào dọc khoảng [startYear, endYear]. */
export type AmountShape =
  /** Số này MỖI NĂM (mặc định, và là toàn bộ hành vi trước migration 0066). */
  | 'per_year'
  /** Số này là TỔNG cả khoảng, chia đều cho các năm mốc rơi vào. */
  | 'total'
  /** Đổi dần từ `amountMinor` ở năm đầu tới `endAmountMinor` ở năm cuối. */
  | 'ramp'
  /** Nhân dồn `growthBps` mỗi năm kể từ năm đầu. */
  | 'growth'

export const AMOUNT_SHAPES: readonly AmountShape[] = ['per_year', 'total', 'ramp', 'growth']

export function isAmountShape(v: string): v is AmountShape {
  return (AMOUNT_SHAPES as readonly string[]).includes(v)
}

/**
 * Phần hình dạng của một mốc. Tách khỏi `LifetimeEvent` để hàm dưới đây gọi được từ
 * chỗ chỉ có mấy trường này (ô xem trước trong form sửa, chưa dựng nổi một mốc đủ).
 */
export interface EventShape {
  startYear: number
  /** null = đến hết đời. */
  endYear: number | null
  /** Theo minor units của CHÍNH mốc (chưa quy đổi, chưa lạm phát). */
  amountMinor: number
  amountShape: AmountShape
  /** Chỉ đọc khi `amountShape === 'ramp'`. */
  endAmountMinor: number | null
  /** Chỉ đọc khi `amountShape === 'growth'`. Âm được (số teo dần). */
  growthBps: number
  /** null hoặc 1 = mọi năm trong khoảng. */
  repeatEveryYears: number | null
}

/** Trần cho `repeatEveryYears`, khớp `check (repeat_every_years between 1 and 100)`. */
export const MAX_REPEAT_YEARS = 100

/**
 * Mốc có rơi vào năm này không — chỉ xét KHOẢNG và NHỊP LẶP, không xét số tiền.
 *
 * Tách riêng vì đồ thị cần đúng câu hỏi này để vẽ dấu ở những năm mốc rơi vào, mà
 * không cần biết mỗi năm bao nhiêu.
 */
export function eventHitsYear(e: EventShape, year: number): boolean {
  if (year < e.startYear) return false
  if (e.endYear !== null && year > e.endYear) return false
  const n = e.repeatEveryYears
  if (n !== null && n > 1 && (year - e.startYear) % n !== 0) return false
  return true
}

/**
 * Các năm mốc rơi vào, tăng dần. Rỗng khi mốc không có năm nào (khoảng gõ dở).
 *
 * `endYear === null` (đến hết đời) thì không có danh sách hữu hạn — trả `null`, và
 * chỗ gọi phải xử lý. KHÔNG trả mảng rỗng cho ca này: rỗng nghĩa là "không năm nào",
 * còn đây là "vô hạn năm", hai thứ trái ngược nhau mà cùng một giá trị thì sớm muộn
 * có người cộng tổng của một mốc vĩnh viễn và ra 0.
 */
export function eventYears(e: EventShape): number[] | null {
  if (e.endYear === null) return null
  if (e.endYear < e.startYear) return []
  const n = e.repeatEveryYears !== null && e.repeatEveryYears > 1 ? e.repeatEveryYears : 1
  const out: number[] = []
  for (let y = e.startYear; y <= e.endYear; y += n) out.push(y)
  return out
}

/**
 * Số tiền của mốc trong năm `year`, theo minor units của CHÍNH mốc — chưa quy đổi,
 * chưa áp lạm phát. Trả 0 khi năm đó mốc không rơi vào.
 *
 * NGUYÊN TẮC KHI DỮ LIỆU KHÔNG ĐỦ CHO HÌNH ĐÃ CHỌN: rơi về `per_year`, không trả 0 và
 * không trả NaN. Một mốc `ramp` thiếu `endAmountMinor` (dòng DB cũ, hoặc người dùng
 * đang gõ dở) mà trả 0 thì cả khoản chi biến mất khỏi bản chiếu mà không có gì trên
 * màn hình nói ra — đúng lớp lỗi "sai âm thầm" mà `presets.ts` đã phải cẩn thận với
 * đơn vị tiền. Rơi về `per_year` thì con số còn đó, sai nhiều nhất bằng chính con số
 * người dùng đã gõ.
 */
export function eventAmountInYear(e: EventShape, year: number): number {
  if (!eventHitsYear(e, year)) return 0

  switch (e.amountShape) {
    case 'per_year':
      return e.amountMinor

    case 'growth': {
      if (e.growthBps === 0) return e.amountMinor
      const g = e.growthBps / 10_000
      return Math.round(e.amountMinor * (1 + g) ** (year - e.startYear))
    }

    case 'ramp': {
      // Hết đời hoặc mốc một năm thì không có "năm cuối" để đi tới.
      if (e.endAmountMinor === null || e.endYear === null || e.endYear <= e.startYear) {
        return e.amountMinor
      }
      // Nội suy theo NĂM chứ không theo thứ tự lần rơi: với nhịp lặp, "từ ¥1M năm 2030
      // tới ¥5M năm 2040" thì một lần rơi ở 2035 phải là ¥3M vì nó ở giữa THỜI GIAN —
      // đếm theo lần rơi sẽ cho ra số khác khi người dùng chỉ đổi nhịp lặp, tức đổi
      // một thứ không liên quan mà số tiền nhảy.
      const t = (year - e.startYear) / (e.endYear - e.startYear)
      return Math.round(e.amountMinor + (e.endAmountMinor - e.amountMinor) * t)
    }

    case 'total': {
      const years = eventYears(e)
      // Đến hết đời thì "tổng cả khoảng" không có nghĩa — không chia được cho vô hạn.
      if (years === null || years.length === 0) return e.amountMinor
      const m = years.length
      if (m === 1) return e.amountMinor
      const k = years.indexOf(year)
      if (k === -1) return 0
      // Phân bổ bằng HIỆU HAI FLOOR TÍCH LUỸ, không phải `round(A/m)`: với A=¥1.000
      // và m=3, `round` cho 333×3 = ¥999 — mất một đồng, và mất một đồng khác nhau
      // tuỳ A nên không có cách nào kiểm bằng mắt. Cách này cộng lại ĐÚNG bằng A với
      // mọi A và mọi m; phần lẻ dồn vào các năm cuối.
      return (
        Math.floor(((k + 1) * e.amountMinor) / m) - Math.floor((k * e.amountMinor) / m)
      )
    }
  }
}

/**
 * Tổng cả khoảng, theo minor units của mốc — chưa quy đổi, chưa lạm phát. `null` khi
 * mốc chạy đến hết đời (không có tổng hữu hạn).
 *
 * Đây là con số để HIỆN RA cạnh mốc: bốn hình ở trên làm cho "¥3.000.000" trên một
 * hàng mốc không còn tự nói được nó nghĩa là gì, nên chỗ nào hiện số cũng phải hiện
 * kèm tổng.
 */
export function eventTotalMinor(e: EventShape): number | null {
  const years = eventYears(e)
  if (years === null) return null
  let s = 0
  for (const y of years) s += eventAmountInYear(e, y)
  return s
}

/**
 * Phần hình dạng của một `LifetimeEvent`, với mặc định cho mọi trường mới.
 *
 * Tồn tại để KHÔNG chỗ nào phải tự nhớ bốn mặc định. Mốc dựng ở chỗ khác (bộ luật
 * thông báo, dữ liệu demo cũ, test viết trước 0066) thiếu cả bốn trường vẫn phải
 * chạy y như trước, và cách chắc chắn nhất là chỉ có MỘT chỗ biết mặc định là gì.
 */
export function shapeOf(e: LifetimeEvent): EventShape {
  return {
    startYear: e.startYear,
    endYear: e.endYear,
    amountMinor: e.amountMinor,
    amountShape: e.amountShape ?? 'per_year',
    endAmountMinor: e.endAmountMinor ?? null,
    growthBps: e.growthBps ?? 0,
    repeatEveryYears: e.repeatEveryYears ?? null,
  }
}

/**
 * Câu giải thích cho một hàng mốc: "¥3.000.000" một mình không nói được nó là số mỗi
 * năm, tổng cả khoảng, hay điểm đầu của một đoạn dốc.
 *
 * THAY CHO `eventSpan.ts` (đã xoá). File đó tính `amountMinor × số năm`, đúng khi mọi
 * mốc đều là 'per_year' — nhưng với 'total' thì nhân lên là sai gấp N lần, đúng cái sai
 * mà chính nó sinh ra để cảnh báo. Một hàm biết hình dạng thì không có ca nào nói sai.
 *
 * `null` = không có gì để nói thêm: mốc đúng một năm, hoặc khoảng đang gõ dở
 * (`endYear < startYear`). Giữ nguyên hành vi cũ của `eventSpan` ở hai ca đó.
 */
export interface EventSpanNote {
  shape: AmountShape
  /** Số NĂM trong khoảng. null = đến hết đời. */
  years: number | null
  /** Số LẦN mốc rơi vào (khác `years` khi có nhịp lặp). null = đến hết đời. */
  hits: number | null
  /** Tổng cả khoảng. null = đến hết đời (không có tổng hữu hạn). */
  totalMinor: number | null
  /** Số của lần rơi ĐẦU TIÊN — đã tính hình dạng. */
  firstMinor: number
  /** Số của lần rơi CUỐI. null = đến hết đời. */
  lastMinor: number | null
  /** null hoặc 1 = mọi năm trong khoảng. */
  repeatEveryYears: number | null
  growthBps: number
}

export function eventSpanNote(e: EventShape): EventSpanNote | null {
  const n = e.repeatEveryYears !== null && e.repeatEveryYears > 1 ? e.repeatEveryYears : null

  if (e.endYear === null) {
    return {
      shape: e.amountShape,
      years: null,
      hits: null,
      totalMinor: null,
      firstMinor: eventAmountInYear(e, e.startYear),
      lastMinor: null,
      repeatEveryYears: n,
      growthBps: e.growthBps,
    }
  }

  const years = e.endYear - e.startYear + 1
  if (years < 2) return null

  const hitYears = eventYears(e) ?? []
  if (hitYears.length === 0) return null

  return {
    shape: e.amountShape,
    years,
    hits: hitYears.length,
    totalMinor: eventTotalMinor(e),
    firstMinor: eventAmountInYear(e, hitYears[0]),
    lastMinor: eventAmountInYear(e, hitYears[hitYears.length - 1]),
    repeatEveryYears: n,
    growthBps: e.growthBps,
  }
}
