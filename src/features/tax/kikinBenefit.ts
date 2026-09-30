import { tr } from '../../i18n'
// Đóng 掛金 vào はぐくみ企業年金 thì 社会保険料 + thuế giảm bao nhiêu — THUẦN, không React.
//
// KHÔNG dựng từ luật, mà NỘI SUY theo các điểm 基金 tự đo và in trên sheet mô phỏng cá
// nhân. Lý do đã chứng minh trong spec: ba cách tính từ luật đều lệch (¥36.000 / ¥30.751 /
// ¥23.551 so với ¥28.080 in trên giấy), vì số thật phụ thuộc 扶養 và các 控除 riêng của
// người dùng — app không có và không nên đoán.
//
// Nội suy tuyến tính là XẤP XỈ. Phần thuế biến đổi khá trơn theo thu nhập nên còn được;
// phần 社会保険料 thật ra là BẬC THANG (xem shakaiHoken.ts) nên giữa hai điểm neo nó chỉ là
// một đường thẳng vẽ qua hai điểm đúng. Vì vậy mọi số ra từ đây là số ƯỚC, phải mang dấu
// `≈` trên màn hình.

/** Một điểm 基金 đã đo: đóng bấy nhiêu thì cả năm trả bấy nhiêu 社会保険料 và thuế. */
export interface CalibrationPoint {
  /** 掛金 mỗi tháng (yên). */
  monthlyContribution: number
  /** 社会保険料 cả năm (yên). */
  socialInsuranceAnnual: number
  /** 所得税 + 住民税 cả năm (yên). */
  taxAnnual: number
}

/**
 * Sheet mô phỏng cá nhân của chủ app, in 2025-08.
 *
 * `プラン①` và `プラン②` trên sheet cùng mức ¥20.000 và cùng mọi con số — khác nhau chỉ ở
 * mức CHẮC CHẮN tụt bậc (① ghi `△ 残業代により変化`, ② ghi `○ 確実に1等級下がる`), nên ở đây
 * chỉ cần một điểm.
 *
 * **Sheet KHÔNG tính `子ども・子育て支援金`** (0,23%, 施行 2026年4月) — chính giấy ghi vậy.
 * Nên phần 社会保険料 dưới đây thấp hơn số thật kể từ tháng 4/2026, và "tiết kiệm được" hơi
 * lạc quan. App không tự cộng bù (không biết suất tỉnh nào áp cho người dùng); màn hình
 * phải nói ra.
 */
export const SHEET_2025_08: readonly CalibrationPoint[] = [
  { monthlyContribution: 0, socialInsuranceAnnual: 630_456, taxAnnual: 308_280 },
  { monthlyContribution: 20_000, socialInsuranceAnnual: 595_464, taxAnnual: 280_200 },
  { monthlyContribution: 73_000, socialInsuranceAnnual: 524_616, taxAnnual: 220_440 },
]

/** Tháng (`YYYY-MM`) 子ども・子育て支援金 bắt đầu thu (0,23%, 施行 2026年4月). */
export const KODOMO_SHIENKIN_FROM = '2026-04'

/** Một bảng hiệu chuẩn dựng sẵn, kèm tháng bắt đầu có hiệu lực. */
export interface BuiltinSheet {
  /** Tháng in trên sheet (`YYYY-MM`). */
  dated: string
  /** Từ kỳ (`YYYY-MM`) nào bảng này là bảng đúng để dùng. */
  effectiveFrom: string
  points: readonly CalibrationPoint[]
  /** Sheet đã tính 子ども・子育て支援金 chưa. */
  includesKodomoShienkin: boolean
}

/**
 * Mọi bảng dựng sẵn. Có sheet mới của 基金 thì THÊM một dòng (đừng sửa dòng cũ) — kỳ cũ vẫn
 * phải tính bằng bảng cũ. Hiện chỉ có một bảng; không bịa số cho bảng chưa có.
 */
export const BUILTIN_SHEETS: readonly BuiltinSheet[] = [
  { dated: '2025-08', effectiveFrom: '2025-08', points: SHEET_2025_08, includesKodomoShienkin: false },
]

/** Bảng MỚI NHẤT có hiệu lực tại kỳ `periodYM` (`YYYY-MM`); null = chưa bảng nào có hiệu lực. */
export function sheetForPeriod(
  periodYM: string,
  sheets: readonly BuiltinSheet[] = BUILTIN_SHEETS,
): BuiltinSheet | null {
  let chon: BuiltinSheet | null = null
  for (const s of sheets) {
    if (s.effectiveFrom > periodYM) continue
    if (chon === null || s.effectiveFrom > chon.effectiveFrom) chon = s
  }
  return chon
}

/**
 * Một dòng giới hạn của phép ước, để đặt NGAY CẠNH con số kết quả. Sheet không có cờ
 * (người dùng tự khai) thì coi là đã tính 子ども・子育て支援金 nếu in từ 4/2026.
 */
export function sheetCaveat(
  sheet: { dated: string; includesKodomoShienkin?: boolean },
  periodYM: string,
): string {
  const daTinh = sheet.includesKodomoShienkin ?? sheet.dated >= KODOMO_SHIENKIN_FROM
  const base = tr('Ước tính theo bảng {date}', { date: sheet.dated })
  if (daTinh || periodYM < KODOMO_SHIENKIN_FROM) return base
  return tr('{base} · chưa tính 子ども・子育て支援金 từ 4/2026 nên số tiết kiệm hơi cao', { base })
}

export interface KikinBenefit {
  socialInsuranceAnnual: number
  taxAnnual: number
  /** Tiết kiệm cả năm so với mức đóng ¥0 — đúng cái sheet gọi là 軽減効果額. */
  savedAnnual: number
  /** false = mức đóng nằm ngoài khoảng sheet đã đo, số đã bị kẹp về điểm neo gần nhất. */
  withinCalibration: boolean
}

/**
 * Nội suy tuyến tính giữa các điểm neo.
 *
 * Ngoài khoảng neo thì **kẹp**, không ngoại suy: sheet chỉ đo tới ¥73.000 (プラン③, mức MAX
 * của chế độ), và ngoại suy một hàm bậc thang ra ngoài dữ liệu là bịa.
 * `withinCalibration = false` để màn hình nói ra thay vì im.
 *
 * `points` được sắp lại bên trong nên tầng gọi đưa vào thứ tự nào cũng được — dữ liệu này
 * có thể đến từ `profile.kikin_sheet` do người dùng gõ.
 */
export function benefitAt(
  monthlyContribution: number,
  points: readonly CalibrationPoint[],
): KikinBenefit | null {
  if (!Number.isFinite(monthlyContribution) || monthlyContribution < 0) return null
  if (points.length < 2) return null

  const sorted = [...points].sort((a, b) => a.monthlyContribution - b.monthlyContribution)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const base = first.socialInsuranceAnnual + first.taxAnnual

  const done = (
    p: { socialInsuranceAnnual: number; taxAnnual: number },
    withinCalibration: boolean,
  ): KikinBenefit => ({
    socialInsuranceAnnual: p.socialInsuranceAnnual,
    taxAnnual: p.taxAnnual,
    savedAnnual: base - p.socialInsuranceAnnual - p.taxAnnual,
    withinCalibration,
  })

  if (monthlyContribution <= first.monthlyContribution) return done(first, true)
  if (monthlyContribution > last.monthlyContribution) return done(last, false)

  for (let i = 1; i < sorted.length; i++) {
    const lo = sorted[i - 1]
    const hi = sorted[i]
    if (monthlyContribution > hi.monthlyContribution) continue
    const span = hi.monthlyContribution - lo.monthlyContribution
    const t = span === 0 ? 0 : (monthlyContribution - lo.monthlyContribution) / span
    const mix = (a: number, b: number) => Math.round(a + (b - a) * t)
    return done(
      {
        socialInsuranceAnnual: mix(lo.socialInsuranceAnnual, hi.socialInsuranceAnnual),
        taxAnnual: mix(lo.taxAnnual, hi.taxAnnual),
      },
      true,
    )
  }
  return done(last, false)
}
