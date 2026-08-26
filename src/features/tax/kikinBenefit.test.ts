import { describe, expect, it } from 'vitest'
import { benefitAt, SHEET_2025_08 } from './kikinBenefit'

describe('SHEET_2025_08', () => {
  it('ba điểm, đúng số trên sheet của 基金', () => {
    expect(SHEET_2025_08).toEqual([
      { monthlyContribution: 0, socialInsuranceAnnual: 630_456, taxAnnual: 308_280 },
      { monthlyContribution: 20_000, socialInsuranceAnnual: 595_464, taxAnnual: 280_200 },
      { monthlyContribution: 73_000, socialInsuranceAnnual: 524_616, taxAnnual: 220_440 },
    ])
  })
})

describe('benefitAt', () => {
  /**
   * GROUND TRUTH của cả file. Sheet của 基金 tự in "軽減効果額" ¥63.072 và ¥193.680. Model
   * nào không dựng lại đúng hai con số đó thì không được dùng — đây là chốt kiểm duy nhất
   * chống lại việc tự bịa một công thức thuế nghe hợp lý (spec đã thử ba cách từ luật,
   * lệch cả ba).
   */
  it('dựng lại đúng hai con số 軽減効果額 của sheet', () => {
    expect(benefitAt(20_000, SHEET_2025_08)?.savedAnnual).toBe(63_072)
    expect(benefitAt(73_000, SHEET_2025_08)?.savedAnnual).toBe(193_680)
  })

  it('mức ¥0 thì không tiết kiệm gì', () => {
    expect(benefitAt(0, SHEET_2025_08)?.savedAnnual).toBe(0)
  })

  it('đúng tại điểm neo thì trả nguyên số của sheet, không nội suy', () => {
    const b = benefitAt(20_000, SHEET_2025_08)!
    expect(b.socialInsuranceAnnual).toBe(595_464)
    expect(b.taxAnnual).toBe(280_200)
    expect(b.withinCalibration).toBe(true)
  })

  /** Mức chủ app đang đóng — nằm GIỮA hai điểm neo đầu, nên là nội suy. */
  it('¥10.000 nội suy giữa ¥0 và ¥20.000', () => {
    const b = benefitAt(10_000, SHEET_2025_08)!
    expect(b.socialInsuranceAnnual).toBe(612_960)
    expect(b.taxAnnual).toBe(294_240)
    expect(b.savedAnnual).toBe(31_536)
    expect(b.withinCalibration).toBe(true)
  })

  it('nội suy giữa hai điểm neo sau', () => {
    // Giữa ¥20.000 và ¥73.000: t = (46.500 − 20.000) / 53.000 = 0,5
    expect(benefitAt(46_500, SHEET_2025_08)!.socialInsuranceAnnual).toBe(560_040)
  })

  /**
   * Ngoài khoảng neo thì KHÔNG ngoại suy — sheet chỉ đo ba điểm, tới ¥73.000 là mức MAX
   * của chế độ, và phần 社会保険料 là bậc thang nên ngoại suy thẳng ra số vô nghĩa. Kẹp về
   * điểm neo gần nhất và hạ cờ `withinCalibration` để màn hình nói ra.
   */
  it('trên ¥73.000 thì kẹp về điểm neo cuối và hạ cờ', () => {
    const b = benefitAt(100_000, SHEET_2025_08)!
    expect(b.socialInsuranceAnnual).toBe(524_616)
    expect(b.savedAnnual).toBe(193_680)
    expect(b.withinCalibration).toBe(false)
  })

  it('mức âm hoặc không hữu hạn → null', () => {
    expect(benefitAt(-1, SHEET_2025_08)).toBeNull()
    expect(benefitAt(Number.NaN, SHEET_2025_08)).toBeNull()
  })

  it('ít hơn hai điểm neo → null, không nội suy từ một điểm', () => {
    expect(benefitAt(10_000, [SHEET_2025_08[0]])).toBeNull()
    expect(benefitAt(10_000, [])).toBeNull()
  })

  it('điểm neo đưa vào lộn xộn thứ tự vẫn ra đúng', () => {
    const daoNguoc = [...SHEET_2025_08].reverse()
    expect(benefitAt(20_000, daoNguoc)?.savedAnnual).toBe(63_072)
  })
})
