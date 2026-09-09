// "Mẫu này nặng cỡ nào" — con số trên chip thư viện mẫu. THUẦN.
//
// Bản cũ cộng `amount_minor` của MỌI mốc trong mẫu, bất kể mốc đó chạy mấy năm: "Sinh
// con 436万" là 60万 + 90万 + 120万 + 180万 − 14,4万 (bốn bậc chi mỗi năm cộng lại), không
// phải tổng nuôi một đứa con (~1.916万 trong 22 năm), cũng không phải số của năm đầu.
// Người đọc không có cách nào biết con số đó nghĩa là gì (bắt được trên app 2026-09-02).
//
// Luật ở đây, BA nhánh:
//   1. Mẫu có mốc MUA TÀI SẢN (migration 0068) → tiền RA thật suốt kỳ hạn vay: trả trước
//      + trả nợ mỗi năm + chi phí giữ mỗi năm, số năm = kỳ hạn. Xét TRƯỚC nhánh 2, vì mốc
//      tài sản mang `end_year: null` do cấu trúc chứ không phải vì "chạy tới hết đời".
//   2. Mẫu có mốc chạy tới hết đời (lương hưu) → không có tổng hữu hạn, nói số MỖI NĂM.
//   3. Còn lại → TỔNG cả đời mẫu kèm số năm.
// Dấu: chi dương, thu âm.
import type { CurrencyCode } from '../../lib/currencies'
import type { PresetResult } from './presets'
import { yearlyLoanPayment } from './homeAsset'
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

  // MẪU MUA TÀI SẢN (migration 0068) là ca riêng, xét TRƯỚC luật "hết đời → mỗi năm".
  //
  // Mốc mua tài sản mang `end_year: null` vì vòng tài sản ở project.ts không có biên trên
  // (xem lời ghi ở mẫu 'mua-xe'), nên nếu để nó rơi vào nhánh `open` thì con số trên chip
  // là ĐÚNG chi phí giữ hằng năm và cả món hàng biến mất: "Mua nhà 65,8万/năm" cho một căn
  // 4.700万, "Mua xe 30万/năm" cho một chiếc 300万. Đó chính là lớp lỗi mà đầu file này mô
  // tả, chỉ ở hình dạng mới.
  //
  // Với mốc có tài sản, tổng là TIỀN RA THẬT suốt kỳ hạn — trả trước (giá − phần vay) +
  // trả nợ mỗi năm + chi phí giữ mỗi năm — và số năm là kỳ hạn vay. Dùng
  // `yearlyLoanPayment` của homeAsset.ts, đúng hàm engine dùng, để chip và bản chiếu
  // không nói hai số khác nhau. KHÔNG trừ giá trị căn nhà nhận được: chip trả lời "mẫu
  // này nặng cỡ nào", tức tiền phải bỏ ra, không phải lãi/lỗ ròng.
  const assets = events.filter((e) => (e.asset_value_minor ?? 0) > 0)
  // `open` chỉ xét mốc KHÔNG mua tài sản: `end_year: null` của mốc tài sản là cấu trúc,
  // không phải "chạy tới hết đời" theo nghĩa của luật cũ.
  const open = events.filter((e) => e.end_year === null && (e.asset_value_minor ?? 0) <= 0)
  if (open.length > 0) {
    return { kind: 'perYear', amountMinor: Math.round(open.reduce((s, e) => s + signed(e), 0)) }
  }

  if (assets.length > 0) {
    // Quy đổi một số minor bất kỳ theo tiền của CHÍNH mốc — cùng đường với `inDisplay`,
    // không nhân thẳng minor × fx (JPY 0 lẻ, USD 2 lẻ).
    const conv = (minor: number, e: PresetResult['events'][number]) =>
      convertLifetimeMinor(minor, e.currency as CurrencyCode, currency, e.fx_to_display)
    let cashOut = 0
    let years = 0
    for (const e of assets) {
      const loanYears = e.loan_years ?? 0
      const pay = yearlyLoanPayment({
        startYear: e.start_year,
        assetValueMinor: e.asset_value_minor ?? 0,
        assetChangeBps: e.asset_change_bps ?? 0,
        loanMinor: e.loan_minor ?? 0,
        loanRateBps: e.loan_rate_bps ?? 0,
        loanYears,
      })
      const down = (e.asset_value_minor ?? 0) - (e.loan_minor ?? 0)
      cashOut += conv(down, e) + (conv(pay, e) + signed(e)) * loanYears
      years = Math.max(years, loanYears)
    }
    // Mốc hữu hạn KHÔNG mua tài sản trong cùng mẫu vẫn cộng theo luật cũ. Hiện chưa mẫu
    // nào trộn hai loại; để đây cho một mẫu sau này trộn thì con số vẫn có nghĩa.
    for (const e of events) {
      if ((e.asset_value_minor ?? 0) > 0) continue
      const end = e.end_year as number
      cashOut += signed(e) * Math.max(1, end - e.start_year + 1)
    }
    return { kind: 'total', amountMinor: Math.round(cashOut), years: Math.max(1, years) }
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
