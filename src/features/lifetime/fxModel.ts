// Mô hình tiền tệ của bản chiếu Tương lai — THUẦN, không React, không mạng.
//
// LUẬT (bản vẽ v5, chốt 2026-08-24): **tiền nằm trên CHẶNG, không nằm trên mốc.**
// Mỗi chặng khai bằng tiền của nước đó; một mốc cuộc đời tính bằng tiền của chặng chứa
// năm nó bắt đầu; và mọi phép quy đổi dùng TỶ GIÁ HÔM NAY của app, coi như giữ nguyên
// suốt bản chiếu.
//
// ĐỔI GÌ SO VỚI TRƯỚC. Trước bản này mỗi dòng (chặng lẫn mốc) tự khai `currency` VÀ một
// `fx_to_display` — một tỷ giá GIẢ ĐỊNH dài hạn người dùng gõ tay. Ý tưởng hay nhưng
// đắt: mỗi lần thêm một mốc ngoại tệ là một ô tỷ giá phải khai, khai sai (gõ 150 thay
// vì 0,0067) thì sai hàng chục nghìn lần và chỉ có một dòng xem trước bắt được, còn để
// nguyên 1 thì hai đồng tiền khác nhau bị coi là bằng nhau. v5 bỏ hẳn ô đó.
//
// KHÔNG XOÁ DỮ LIỆU CŨ, KHÔNG CÓ MIGRATION MÙ. Cột `life_events.currency` và cả hai cột
// `fx_to_display` vẫn còn nguyên dưới DB. Chuẩn hoá xảy ra lúc ĐỌC: một mốc còn mang
// tiền khác chặng của nó được quy về tiền của chặng ngay tại đây, và chỉ khi người dùng
// SỬA dòng đó thì bản ghi mới được viết lại theo mô hình mới. Lý do không viết một lệnh
// UPDATE hàng loạt: nó phải nhét một tỷ giá cứng vào file SQL rồi ghi đè số tiền thật
// của người dùng, không hoàn tác được, trong khi cách này cho ra ĐÚNG cùng con số trên
// màn hình mà không đụng một dòng nào cho tới lúc chính người dùng sửa nó.
import type { CurrencyCode } from '../../lib/currencies'
import { convertLifetimeMinor, phaseForYear } from './project'
import type { LifetimeEvent, LifetimePhase } from './project'

/**
 * Tỷ giá MAJOR-sang-MAJOR hôm nay: 1 đơn vị `from` bằng bao nhiêu đơn vị `to`.
 * `null` = chưa tra được (mất mạng, chưa có cache) — chỗ gọi phải xử lý, KHÔNG được
 * coi như 1:1. Quy ước `hasMissingRate` của cả repo: thà thiếu còn hơn bịa.
 */
export type FxOf = (from: CurrencyCode, to: CurrencyCode) => number | null

/**
 * Tiền của chặng phủ `year` — tiền mà một mốc bắt đầu năm đó được tính bằng.
 *
 * Dùng `phaseForYear` của engine chứ không tự dò lại: chặng nào "đang hiệu lực" là một
 * khái niệm của bản chiếu, và hai bản chép của nó sẽ trôi lệch (JSDoc ở đó đã ghi rõ,
 * hàm được export ra chính vì từng có bản chép thứ ba).
 *
 * Không có chặng nào thì rơi về `fallback` — thường là tiền hiển thị của kịch bản.
 */
export function currencyAt(
  phases: LifetimePhase[],
  year: number,
  fallback: CurrencyCode,
): CurrencyCode {
  const sorted = [...phases].sort((a, b) => a.startYear - b.startYear)
  // Mốc nằm TRƯỚC chặng đầu tiên vẫn phải có một đơn vị: lấy chặng sớm nhất. Rơi về
  // tiền hiển thị ở đó là nói rằng một khoản chi năm 2020 tính bằng đơn vị khác hẳn
  // khoản chi năm 2026 của cùng một chặng.
  if (sorted.length > 0 && year < sorted[0].startYear) return sorted[0].currency
  return phaseForYear(sorted, year)?.currency ?? fallback
}

export interface NormalizedScenario {
  phases: LifetimePhase[]
  events: LifetimeEvent[]
  /**
   * true khi có ít nhất một dòng KHÔNG quy đổi được vì thiếu tỷ giá, nên nó vẫn đang
   * mang đơn vị và tỷ giá CŨ. Chỗ gọi hiện `≈` / một dòng cảnh báo — cùng quy ước với
   * `hasMissingRate` ở mọi màn khác.
   */
  hasMissingRate: boolean
}

/**
 * Đưa một kịch bản về mô hình v5 trước khi chiếu.
 *
 * Hai việc:
 *   1. `fxToDisplay` của CHẶNG lấy theo tỷ giá hôm nay, không lấy con số người dùng
 *      từng gõ. Đây là điểm mấu chốt của v5 — người dùng không còn phải khai tỷ giá.
 *   2. Mốc mang tiền khác chặng của nó được QUY VỀ tiền của chặng, rồi mang luôn tỷ
 *      giá của chặng.
 *
 * Thiếu tỷ giá thì để NGUYÊN dòng đó (giữ đơn vị cũ và `fx_to_display` đã lưu) và bật
 * `hasMissingRate`. Rơi về 1:1 ở đây là biến ₫4.200.000 thành ¥4.200.000 — sai 172 lần,
 * ngay giữa bản chiếu, không có gì nói ra.
 *
 * KHÔNG đụng chữ ký `LifetimeInput` và không đụng `projectLifetime`: engine vẫn nhận
 * `currency` + `fxToDisplay` từng dòng như cũ. Đây là ràng buộc BẮT BUỘC chứ không phải
 * tiện tay — `projectLifetime` được gói vào `supabase/functions/push-notify/_rules.js`,
 * nên đổi chữ ký của nó là đổi cả chuông báo phía server.
 */
export function normalizeToPhaseCurrency(
  phases: LifetimePhase[],
  events: LifetimeEvent[],
  displayCurrency: CurrencyCode,
  fxOf: FxOf,
): NormalizedScenario {
  let hasMissingRate = false

  const outPhases = phases.map((p): LifetimePhase => {
    const fx = fxOf(p.currency, displayCurrency)
    if (fx === null) {
      hasMissingRate = true
      return p
    }
    return { ...p, fxToDisplay: fx }
  })

  const outEvents = events.map((e): LifetimeEvent => {
    const target = currencyAt(outPhases, e.startYear, displayCurrency)
    const targetFx = fxOf(target, displayCurrency)
    if (targetFx === null) {
      hasMissingRate = true
      return e
    }
    if (e.currency === target) return { ...e, fxToDisplay: targetFx }

    const toTarget = fxOf(e.currency, target)
    if (toTarget === null) {
      hasMissingRate = true
      return e
    }
    return {
      ...e,
      amountMinor: convertLifetimeMinor(e.amountMinor, e.currency, target, toTarget),
      currency: target,
      fxToDisplay: targetFx,
    }
  })

  return { phases: outPhases, events: outEvents, hasMissingRate }
}

/**
 * `FxOf` dựng từ một bảng `Rates` đã tải cho `base`.
 *
 * `Rates` là chiều NGƯỢC ("1 base đổi được rates[X] đơn vị X"), nên đi từ `from` sang
 * `to` là `rates[to] / rates[from]`. Viết một lần ở đây thay vì mỗi chỗ gọi tự nghịch
 * đảo — đó đúng là chỗ `fx_to_display` từng bị gõ ngược chiều.
 */
export function fxOfRates(base: CurrencyCode, rates: Record<string, number | undefined>): FxOf {
  const rateOf = (c: CurrencyCode): number | null => {
    if (c === base) return 1
    const r = rates[c]
    return typeof r === 'number' && r > 0 ? r : null
  }
  return (from, to) => {
    if (from === to) return 1
    const rf = rateOf(from)
    const rt = rateOf(to)
    if (rf === null || rt === null) return null
    return rt / rf
  }
}
