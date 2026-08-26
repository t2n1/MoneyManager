// Vạch gợi ý trên thanh trượt hạn mức, và thang của chính thanh đó — thuần, test được.
//
// Vì sao cần: `suggest.ts` đã có gợi ý theo LỊCH SỬ ("ba tháng qua danh mục này tốn bao
// nhiêu"), nhưng đó là quá khứ. Câu hỏi khác hẳn ở mặt lập kế hoạch là "đặt bao nhiêu thì
// cơ cấu 50/30/20 mới về đúng chuẩn" — con số đó app chưa từng tính, nên người dùng phải
// tự cộng nhẩm 14 dòng rồi tự chia.
//
// Nguồn duy nhất là `AxisProgress` đã tính sẵn: mỗi dòng trục mang `actual` (đang chia bao
// nhiêu), `target` (trần quy ra tiền) và `slices` (danh mục nào góp vào). Không tự gom lại
// lần thứ hai — gom hai lần là hai con số cạnh nhau lệch nhau, đúng bệnh B30.4.

import type { AxisProgress } from './axisTargets'

/**
 * Hạn mức gợi ý cho từng danh mục để trục về ĐÚNG trần.
 *
 * Chỉ trả về entry cho danh mục thuộc trục ĐANG VƯỢT trần. Trục còn trong trần thì không
 * có gì phải đạt, và vẽ một vạch ở trên mức hiện tại là app đang gợi ý người dùng tiêu
 * thêm. Trục 'floor' (Để dành) không bao giờ có vạch: nó là HIỆU của thu trừ chi, không
 * phải tổng của danh mục nào, nên co một hạn mức không "đạt" nó trực tiếp.
 *
 * Phép chia dùng LARGEST REMAINDER, không phải làm tròn từng dòng: tổng các vạch phải
 * bằng đúng `target`. Làm tròn độc lập thì bảy dòng lệch tới vài đồng, và dòng trục sẽ
 * còn hiện "vượt ¥2" sau khi người dùng đã kéo hết mọi thanh về vạch — tức app bảo làm
 * một việc rồi không công nhận là đã làm.
 */
export function axisSuggestions(axis: AxisProgress | null): Map<string, number> {
  const out = new Map<string, number>()
  if (!axis) return out

  for (const line of axis.lines) {
    if (line.direction !== 'cap') continue
    if (line.actual <= line.target) continue
    if (line.actual <= 0 || line.slices.length === 0) continue

    const scale = line.target / line.actual
    const exact = line.slices.map((s) => s.amount * scale)
    const floors = exact.map((v) => Math.floor(v))
    let rest = line.target - floors.reduce((s, v) => s + v, 0)
    // Phần dư đi vào những dòng có phần thập phân lớn nhất. `rest` luôn nhỏ hơn số dòng
    // nên vòng lặp này không bao giờ cộng hai lần vào cùng một dòng.
    const byFrac = exact
      .map((v, i) => ({ i, frac: v - floors[i] }))
      .sort((a, b) => b.frac - a.frac)
    for (const { i } of byFrac) {
      if (rest <= 0) break
      floors[i] += 1
      rest -= 1
    }
    line.slices.forEach((s, i) => out.set(s.categoryId, floors[i]))
  }
  return out
}

/** Thang của một thanh trượt hạn mức. `min` luôn là 0 nên không trả về. */
export interface SliderScale {
  /** mép phải (base minor) */
  max: number
  /** bước kéo (base minor); luôn chia hết `max` */
  step: number
}

/** Số "tròn" nhỏ nhất không nhỏ hơn `v` — 1 / 2 / 5 nhân lũy thừa 10. */
function niceCeil(v: number): number {
  if (v <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(v))
  for (const n of [1, 2, 5]) if (v <= n * pow) return n * pow
  return 10 * pow
}

/** Số "tròn" lớn nhất không lớn hơn `v`, tối thiểu 1. */
function niceFloor(v: number): number {
  if (v <= 1) return 1
  const pow = 10 ** Math.floor(Math.log10(v))
  for (const n of [5, 2, 1]) if (v >= n * pow) return n * pow
  return pow
}

/** Bao nhiêu bước từ 0 tới mép phải. ~200 bước là đủ mượt mà không ra bước lẻ. */
const STEPS = 200

/**
 * Thang riêng cho MỖI dòng, không dùng chung một thang toàn màn: Nhà ở ¥132.760 và
 * Cây & Cá ¥37 trên cùng một thang thì cái thứ hai không kéo được — cả dải của nó nằm
 * trong một pixel đầu tiên.
 *
 * Mép phải lấy số lớn nhất trong `hạn mức đang đặt / vạch gợi ý / tháng cao nhất` rồi
 * cộng 25% và làm tròn lên số tròn. Cộng thêm 25% vì giá trị hiện tại DÍNH MÉP là một
 * thanh không nâng lên được nữa, còn phủ cả `historyMax` vì kéo lên tới tháng tốn nhất
 * là một việc người dùng thật sự làm ("tháng 9 có cưới, cho Quà tặng lên bằng đỉnh cũ").
 */
export function sliderScale(
  limit: number,
  suggest: number | null,
  historyMax: number,
): SliderScale {
  const ceiling = Math.max(limit, suggest ?? 0, historyMax, 1)
  const max = niceCeil(ceiling * 1.25)
  return { max, step: niceFloor(max / STEPS) }
}
