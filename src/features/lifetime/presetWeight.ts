// "Mẫu này nặng cỡ nào" — con số trên chip thư viện mẫu. THUẦN.
//
// Bản cũ cộng `amount_minor` của MỌI mốc trong mẫu, bất kể mốc đó chạy mấy năm: "Sinh
// con 436万" là 60万 + 90万 + 120万 + 180万 − 14,4万 (bốn bậc chi mỗi năm cộng lại), không
// phải tổng nuôi một đứa con (~1.916万 trong 22 năm), cũng không phải số của năm đầu.
// "Mua nhà 620万" là trả trước 500万 + MỘT năm trả vay — tổng thật là 4.700万. Người đọc
// không có cách nào biết con số đó nghĩa là gì (bắt được trên app 2026-09-02).
//
// Luật ở đây: mẫu có mốc hữu hạn → TỔNG cả đời mẫu kèm số năm; mẫu có mốc chạy tới hết
// đời (lương hưu) → không có tổng hữu hạn, nói số MỖI NĂM. Dấu: chi dương, thu âm.
import type { CurrencyCode } from '../../lib/currencies'
import type { PresetResult } from './presets'
import { convertLifetimeMinor } from './project'

export type PresetWeight =
  /** Tổng ròng cả mẫu theo tiền hiển thị (chi > 0, thu < 0) và số năm mẫu trải ra. */
  | { kind: 'total'; amountMinor: number; years: number }
  /** Có mốc chạy hết đời: ròng MỖI NĂM của các mốc đó (chi > 0, thu < 0). */
  | { kind: 'perYear'; amountMinor: number }

export function presetWeight(result: PresetResult, currency: CurrencyCode): PresetWeight | null {
  const events = result.events
  if (events.length === 0) return null

  // Đi qua `convertLifetimeMinor`, không nhân thẳng minor × fx_to_display: JPY 0 lẻ,
  // USD 2 lẻ — nhân thẳng sai 100 lần (cùng lỗi với dòng "≈" của thẻ chặng).
  const inDisplay = (e: PresetResult['events'][number]) =>
    convertLifetimeMinor(e.amount_minor, e.currency as CurrencyCode, currency, e.fx_to_display)
  const signed = (e: PresetResult['events'][number]) => (e.kind === 'income' ? -1 : 1) * inDisplay(e)

  const open = events.filter((e) => e.end_year === null)
  if (open.length > 0) {
    return { kind: 'perYear', amountMinor: Math.round(open.reduce((s, e) => s + signed(e), 0)) }
  }

  let total = 0
  let first = Infinity
  let last = -Infinity
  for (const e of events) {
    const end = e.end_year as number
    const years = Math.max(1, end - e.start_year + 1)
    total += signed(e) * years
    first = Math.min(first, e.start_year)
    last = Math.max(last, end)
  }
  return { kind: 'total', amountMinor: Math.round(total), years: last - first + 1 }
}
