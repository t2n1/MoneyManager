// Mẫu CHẶNG ĐỜI — mức sống nền của một quãng thời gian. THUẦN, không React.
//
// Khác hẳn `presets.ts` (LIFE_PRESETS): thứ đó sinh một CHÙM MỐC ("Sinh con" ra bốn bậc
// chi + trợ cấp), còn đây chỉ là một cặp thu/chi nền + quốc gia + đồng tiền. Bản vẽ tách
// hai thứ thành hai nút riêng ở hàng 8 ("+ Chặng từ mẫu" và "+ Mốc từ mẫu") vì hai khái
// niệm này là xương sống của cả màn: CHẶNG đặt mức nền, MỐC cộng thêm dòng tiền và không
// bao giờ sửa nền (dsg-handoff/README.md, bảng đầu tài liệu).
//
// QUY ƯỚC ĐƠN VỊ — cùng luật với đầu `presets.ts`, và ở đây có một cái bẫy riêng:
// `annualIncomeMinor`/`annualExpenseMinor` là MINOR UNITS. JPY và VND có 0 số lẻ nên minor
// bằng major, nhưng USD có 2 số lẻ — bản vẽ ghi `income: 26000` với `cur: 'USD'` nghĩa là
// $26.000/năm, tức 2.600.000 minor. Copy thẳng 26000 vào là khai $260/năm: sai 100 lần và
// sai âm thầm, vì $260 vẫn là một con số hợp lệ.
//
// MỌI SỐ DƯỚI ĐÂY LÀ CỦA BẢN VẼ, không phải số tra riêng: nguồn là PHASEPRESETS trong
// `dsg-handoff/Tuong lai - 1c dong thoi gian.dc.html` (tra 2026-09-10). Chúng là giả định
// mức sống để người dùng khỏi gõ từ số không — UI phải dán nhãn "kiểm tra lại", y như mẫu
// mốc.
import type { CurrencyCode } from '../../lib/currencies'
import type { DraftPhase } from './draft'

export interface PhasePreset {
  key: string
  label: string
  /** Ghi chú gọn đứng cạnh nhãn trên chip — "470/295万". */
  note: string
  currency: CurrencyCode
  /** Mã ngắn, đúng thứ ô "Quốc gia" của dock nhận (placeholder "JP, US, VN…"). Nhãn đầy
   *  đủ của bản vẽ ("Nhật Bản") là chữ để ĐỌC, không phải giá trị lưu. */
  country: string
  annualIncomeMinor: number
  annualExpenseMinor: number
}

const USD = 100 // 2 số lẻ — xem QUY ƯỚC ĐƠN VỊ ở đầu file.

export const PHASE_PRESETS: PhasePreset[] = [
  { key: 'jp1', label: 'Nhật · độc thân', note: '470/295万', currency: 'JPY', country: 'JP', annualIncomeMinor: 4_700_000, annualExpenseMinor: 2_950_000 },
  { key: 'jp2', label: 'Nhật · hai vợ chồng', note: '800/440万', currency: 'JPY', country: 'JP', annualIncomeMinor: 8_000_000, annualExpenseMinor: 4_400_000 },
  { key: 'jp3', label: 'Nhật · có con nhỏ', note: '800/560万', currency: 'JPY', country: 'JP', annualIncomeMinor: 8_000_000, annualExpenseMinor: 5_600_000 },
  { key: 'us1', label: 'Mỹ · tech', note: '$26k/$15k', currency: 'USD', country: 'US', annualIncomeMinor: 26_000 * USD, annualExpenseMinor: 15_000 * USD },
  { key: 'us2', label: 'Mỹ · có con', note: '$26k/$19k', currency: 'USD', country: 'US', annualIncomeMinor: 26_000 * USD, annualExpenseMinor: 19_000 * USD },
  { key: 'vn1', label: 'Việt Nam', note: '480/240 tr₫', currency: 'VND', country: 'VN', annualIncomeMinor: 480_000_000, annualExpenseMinor: 240_000_000 },
  { key: 'fl', label: 'Freelance', note: '360/290万', currency: 'JPY', country: 'JP', annualIncomeMinor: 3_600_000, annualExpenseMinor: 2_900_000 },
  // CHI > THU là chủ ý của bản vẽ, không phải số gõ sai: một quãng đời rút vào tiền tiết
  // kiệm (nghỉ chăm con) là tình huống thật và bản chiếu phải vẽ được nó.
  { key: 'care', label: 'Nghỉ chăm con', note: '100/300万', currency: 'JPY', country: 'JP', annualIncomeMinor: 1_000_000, annualExpenseMinor: 3_000_000 },
  { key: 'ret', label: 'Nghỉ hưu', note: '110/240万', currency: 'JPY', country: 'JP', annualIncomeMinor: 1_100_000, annualExpenseMinor: 2_400_000 },
]

/**
 * Mẫu → một chặng nháp ở năm `startYear`.
 *
 * `fxToDisplay` do CHỖ GỌI truyền: file này thuần, không tra tỷ giá. Mặc định 1 chỉ đúng
 * khi chặng cùng đồng tiền với tiền hiển thị của kịch bản.
 */
export function phasePresetToDraft(
  p: PhasePreset,
  startYear: number,
  fxToDisplay = 1,
): Omit<DraftPhase, 'id'> {
  return {
    startYear,
    label: p.label,
    country: p.country,
    currency: p.currency,
    annualIncomeMinor: p.annualIncomeMinor,
    annualExpenseMinor: p.annualExpenseMinor,
    // Mẫu cho hẳn hai con số tuyệt đối, nên KHÔNG khai theo % chặng trước (0067) — để
    // `undefined` thì `resolvePhasePercents` bỏ qua, nhưng `null` là ý rõ ràng hơn.
    incomePctOfPrev: null,
    expensePctOfPrev: null,
    fxToDisplay,
    // BẮT BUỘC chuỗi rỗng, không phải undefined: `draftChanges` so bằng `!==` nên
    // `undefined !== ''` làm nháp đọc ra "khác bản đã lưu" mãi mãi và nút Lưu không bao
    // giờ tắt. Lý do đầy đủ ở JSDoc của `DraftPhase`.
    color: '',
    icon: '',
  }
}
