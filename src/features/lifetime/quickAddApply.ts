// Phần THUẦN của bảng chọn nhanh (`QuickAddBoard.tsx`): năm giữa trục, và cách một mẫu
// đã dựng HẤP THU khoảng năm người dùng vừa kéo.
//
// VÌ SAO TÁCH KHỎI `quickAddRange.ts`. File đó trả lời câu hỏi thứ nhất — "mẫu này đọc
// khoảng theo nghĩa gì" (`applySpanToPreset`: `mua-nha` đọc thành kỳ hạn vay, `sinh-con`
// đọc thành tuổi nuôi tới, còn lại đọc thành hai đầu năm). Nó KHÔNG trả lời câu hỏi thứ
// hai: một `PresetResult` đã dựng thì phải sửa TRƯỜNG NÀO để mang đúng nghĩa đó. Hai câu
// hỏi ở hai file vì câu thứ nhất là một BẢNG (mẫu nào → nghĩa nào) còn câu thứ hai là một
// PHÉP BIẾN ĐỔI trên dữ liệu mốc; gộp lại thì thêm một mẫu mới phải sửa cả phép biến đổi.
//
// Không import React, không import repo — mọi luật ở đây test được bằng số.
import type { NewLifeEvent } from '../../data/repo'
import type { PresetResult } from './presets'
import type { SpanApply } from './quickAddRange'

/**
 * Năm GIỮA trục thời gian — nơi trạng thái rỗng mở bảng mẫu (README, "Trạng thái rỗng").
 *
 * Làm tròn về số nguyên vì đây là một NĂM, không phải một toạ độ: `2045,5` đi vào
 * `PresetContext.year` sẽ sinh ra `start_year` lẻ, mà cột đó là `int` trong DB.
 */
export function middleSpanYear(x0: number, x1: number): number {
  return Math.round((x0 + x1) / 2)
}

/**
 * Áp khoảng năm (đã dịch qua `applySpanToPreset`) lên một mẫu ĐÃ DỰNG.
 *
 * Chỗ gọi phải dựng mẫu ở `apply.year` TRƯỚC (`preset.build(ctx(apply.year))`), rồi đưa
 * kết quả qua đây — hàm này không dựng lại, nó chỉ sửa các trường mà khoảng nói tới.
 *
 * BA LUẬT, và cả ba đều là "đừng bịa thêm nghĩa":
 *
 * 1. `termYears` (mẫu vay: `mua-nha`, `mua-xe`) đi vào KỲ HẠN, không đi vào `end_year`
 *    của mọi mốc. Mốc mang `loan_years` (migration 0068 — xe là tài sản có vay) nhận
 *    thẳng số năm; mốc trả vay khai bằng một khoảng nhiều năm nhận `end_year =
 *    start_year + n − 1`. Khoản TRẢ TRƯỚC (`end_year === start_year`) không đổi: nó là
 *    một lần, kéo dài nó ra 35 năm là biến tiền cọc thành tiền trả góp thứ hai.
 *
 * 2. `untilAge` / `endYear` cùng đi về MỘT giới hạn năm, và giới hạn đó chỉ CẮT, không
 *    kéo dài mọi thứ: mốc bắt đầu sau giới hạn bị bỏ, mốc kết thúc sau giới hạn bị cắt
 *    về đúng đó. Chỉ mốc VỐN ĐÃ trải nhiều năm (`end_year > start_year`) và kết thúc
 *    muộn nhất mới được KÉO tới đúng giới hạn — nhờ vậy kéo một khoảng trên "Cưới" (một
 *    khoản chi một lần) không biến nó thành chi phí cưới mỗi năm suốt khoảng đó. Bằng
 *    nhau ở năm cuối thì CẢ NHÓM được kéo, không chỉ cái đầu tiên: mẫu `hoc-them` có
 *    hai mốc chạy song song đúng cùng khoảng (học phí và phần thu nhập hụt), và kéo một
 *    cái mà bỏ cái kia là học phí 10 năm với 2 năm hụt thu.
 *
 * 3. `end_year === null` ("tới hết đời": lương hưu, chi phí giữ xe) Ở LẠI `null`. Đặt một
 *    năm cho nó là lặng lẽ biến "đến hết đời" thành một khoảng có hạn — cùng quyết định
 *    đã ghi ở `EventPins` (mốc hết đời không có chốt) và ở `moveEventStart`.
 *
 * Bấm một chỗ (khoảng một năm) thì `applySpanToPreset` chỉ trả `{ year }`, nên hàm này
 * trả về chính `result`: một cú bấm không nói gì về kỳ hạn hay độ dài.
 */
export function applySpanToResult(result: PresetResult, apply: SpanApply): PresetResult {
  if (apply.termYears !== undefined) {
    return { phases: result.phases, events: result.events.map((e) => withTerm(e, apply.termYears as number)) }
  }
  const limit = apply.untilAge !== undefined ? apply.year + apply.untilAge : apply.endYear
  if (limit === undefined) return result
  return { phases: result.phases, events: withLimit(result.events, limit) }
}

/** Luật 1 — xem JSDoc `applySpanToResult`. */
function withTerm(e: NewLifeEvent, years: number): NewLifeEvent {
  if ((e.loan_years ?? 0) > 0) return { ...e, loan_years: years }
  if (e.end_year !== null && e.end_year > e.start_year) {
    return { ...e, end_year: e.start_year + years - 1 }
  }
  return e
}

/** Luật 2 + 3 — xem JSDoc `applySpanToResult`. */
function withLimit(events: readonly NewLifeEvent[], limit: number): NewLifeEvent[] {
  const kept = events.filter((e) => e.start_year <= limit)
  // Năm kết thúc muộn nhất trong các mốc VỐN trải nhiều năm. Tính TRƯỚC khi cắt: sau khi
  // cắt thì mọi mốc vượt giới hạn đều bằng nhau và không còn phân biệt được cái nào là
  // cái dài nhất của mẫu.
  let latest = -Infinity
  for (const e of kept) {
    if (e.end_year !== null && e.end_year > e.start_year) latest = Math.max(latest, e.end_year)
  }
  return kept.map((e) => {
    if (e.end_year === null) return e
    // `> start_year` nhắc lại ở đây, không chỉ ở vòng tính `latest`: một mốc MỘT NĂM
    // tình cờ rơi đúng năm cuối của mốc dài nhất vẫn là một mốc một lần.
    if (e.end_year > e.start_year && e.end_year === latest) return { ...e, end_year: limit }
    return e.end_year > limit ? { ...e, end_year: limit } : e
  })
}
