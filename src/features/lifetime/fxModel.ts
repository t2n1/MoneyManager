// Mô hình tiền tệ của bản chiếu Tương lai — THUẦN, không React, không mạng.
//
// LUẬT (bản vẽ v5, chốt 2026-08-24; sửa 2026-09-10): **tiền của một CHẶNG là đơn vị MẶC
// ĐỊNH của mọi mốc rơi vào nó — và mốc khai được đơn vị riêng.** Mỗi chặng khai bằng tiền
// của nước đó; một mốc mới sinh ra mang tiền của chặng chứa năm nó bắt đầu nhưng đổi được
// ngay ở bảng sửa mốc; và mọi phép quy đổi dùng TỶ GIÁ HÔM NAY của app, coi như giữ nguyên
// suốt bản chiếu.
//
// VÌ SAO MỞ LẠI ĐƠN VỊ RIÊNG CHO MỐC (2026-09-10, người dùng yêu cầu: "phần mốc cuộc đời
// tôi có thể chọn Số tiền mỗi năm là yen, đô, và vnđ"). v5 bỏ đơn vị riêng của mốc CÙNG
// LÚC với ô `fx_to_display` gõ tay, nhưng cái đắt nằm ở ô tỷ giá đó — gõ 150 thay vì
// 0,0067 là sai hàng chục nghìn lần. Ô ấy đã chết hẳn: tỷ giá nay lấy tự động (`fxOf`).
// Còn thứ bị bỏ theo thì có giá thật: ở chặng Nhật mà vẫn "gửi bố mẹ ở VN ₫100tr/năm" hay
// "học phí Mỹ $50k/năm" là chuyện thường, và buộc khai bằng ¥ là buộc người dùng tự nhân
// tỷ giá bằng tay — đúng loại việc app này tồn tại để khỏi phải làm.
//
// HỆ QUẢ, chỗ nào cũng phải theo: số THÔ của một mốc hiện ra bằng `event.currency`, không
// phải bằng tiền của chặng hay tiền hiển thị (`PlanDockEvent`, `PlanListDrawer`). Phần
// dưới bản chiếu không đổi gì — mỗi dòng vẫn mang cặp (`currency`, `fxToDisplay`) và mọi
// phép tính vẫn đi qua `convertLifetimeMinor` với cặp đó.
//
// ĐỔI GÌ SO VỚI TRƯỚC. Trước bản này mỗi dòng (chặng lẫn mốc) tự khai `currency` VÀ một
// `fx_to_display` — một tỷ giá GIẢ ĐỊNH dài hạn người dùng gõ tay. Ý tưởng hay nhưng
// đắt: mỗi lần thêm một mốc ngoại tệ là một ô tỷ giá phải khai, khai sai (gõ 150 thay
// vì 0,0067) thì sai hàng chục nghìn lần và chỉ có một dòng xem trước bắt được, còn để
// nguyên 1 thì hai đồng tiền khác nhau bị coi là bằng nhau. v5 bỏ hẳn ô đó.
//
// DỮ LIỆU CŨ TỰ ĐÚNG, KHÔNG CÓ MIGRATION NÀO. Cột `life_events.currency` chưa bao giờ bị
// xoá, nên một mốc khai từ trước v5 bằng ₫ trong chặng ¥ nay đọc ra đúng ₫ — trước bản
// này nó bị quy về ¥ ngay lúc đọc (cùng số tiền, khác nhãn) trong khi dock lại hiện chữ
// số ₫ thô cạnh ký hiệu của chặng, tức sai nhãn. Hai cột `fx_to_display` vẫn còn nhưng
// chỉ là dấu vết: giá trị nào cũng bị đè ở đây bằng tỷ giá hôm nay.
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
 * Tiền của chặng phủ `year` — đơn vị MẶC ĐỊNH cho một mốc MỚI bắt đầu năm đó.
 *
 * Không phải câu trả lời cho "mốc này đang tính bằng gì": mốc đã có thì đọc
 * `event.currency` của chính nó (sửa 2026-09-10, xem đầu file). Hàm này dùng lúc SINH ra
 * một mốc — bấm nền bảng thêm nhanh, thêm từ mẫu — và lúc đổi tiền của cả chặng.
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
 * MỘT việc, cho cả chặng lẫn mốc: `fxToDisplay` lấy theo tỷ giá HÔM NAY, không lấy con
 * số người dùng từng gõ. Đây là điểm mấu chốt của v5 — không còn ô tỷ giá nào phải khai.
 *
 * KHÔNG quy đổi số tiền của mốc nữa (đổi 2026-09-10 — xem đầu file). Trước đây mốc mang
 * đơn vị khác chặng bị quy về đơn vị của chặng ngay tại đây; nay đơn vị của mốc là thứ
 * người dùng CHỌN, nên quy đổi nó là ghi đè lựa chọn đó. Tiền trên bản chiếu không xê
 * dịch vì việc này: quy ₫ về ¥ rồi nhân tỷ giá ¥→hiển thị cho ra cùng con số với nhân
 * thẳng ₫→hiển thị, chỉ khác phần làm tròn — và bỏ một lần làm tròn là bớt một lần lệch.
 *
 * Thiếu tỷ giá thì để NGUYÊN dòng đó (giữ `fx_to_display` đã lưu) và bật
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

  // Mốc giữ ĐƠN VỊ CỦA CHÍNH NÓ — ở đây chỉ làm mới tỷ giá, đúng một việc như với chặng.
  //
  // Nhờ thế mọi số tiền khác của cùng dòng (`endAmountMinor` của hình 'ramp',
  // `assetValueMinor`/`loanMinor` của mốc mua tài sản, `replacesMinor` của ô chống đếm
  // hai lần) không cần quy đổi gì: chúng vốn cùng một đơn vị với `amountMinor`, và đơn vị
  // đó nay không bị đổi dưới chân chúng. Bản cũ phải quy đổi TỪNG số một, và `endAmountMinor`
  // đã từng bị bỏ sót — một mốc "từ ¥1M tới ¥5M" đọc ra "từ ₫165tr tới ₫5tr", bản chiếu đi
  // xuống trong khi lẽ ra đi lên.
  const outEvents = events.map((e): LifetimeEvent => {
    const fx = fxOf(e.currency, displayCurrency)
    if (fx === null) {
      hasMissingRate = true
      return e
    }
    return { ...e, fxToDisplay: fx }
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

/**
 * Minor units của `from` → minor units của `to` theo tỷ giá HÔM NAY (`fxOf`).
 * `null` khi thiếu tỷ giá — chỗ gọi tự chọn chữ, không quy 1:1.
 *
 * Tồn tại để KHÔNG ai nhân thẳng `minor * fxOf(...)` nữa: USD có 2 chữ số lẻ, JPY có 0,
 * nên phép nhân thẳng sai 100 lần — dòng "≈ … theo JPY" của thẻ chặng từng nói "1.8億/năm"
 * cho một khoản 11.000 $/năm đúng vì thế (bắt được trên app 2026-09-02).
 */
export function convertMinorToday(
  minor: number,
  from: CurrencyCode,
  to: CurrencyCode,
  fxOf: FxOf,
): number | null {
  const fx = fxOf(from, to)
  if (fx === null) return null
  return convertLifetimeMinor(minor, from, to, fx)
}
