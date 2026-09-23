import { describe, expect, it } from 'vitest'
import { benefitAt, BUILTIN_SHEETS, SHEET_2025_08, sheetCaveat, sheetForPeriod, type BuiltinSheet } from './kikinBenefit'

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

describe('sheetForPeriod — chọn bảng mới nhất có hiệu lực tại kỳ đang tính', () => {
  const pts = SHEET_2025_08
  const A: BuiltinSheet = { dated: '2025-08', effectiveFrom: '2025-08', points: pts, includesKodomoShienkin: false }
  const B: BuiltinSheet = { dated: '2026-08', effectiveFrom: '2026-09', points: pts, includesKodomoShienkin: true }

  it('danh sách dựng sẵn hiện chỉ có bảng 2025-08', () => {
    expect(BUILTIN_SHEETS.map((s) => s.dated)).toEqual(['2025-08'])
    expect(sheetForPeriod('2026-09')?.dated).toBe('2025-08')
  })
  it('chọn bảng mới nhất có effectiveFrom ≤ kỳ, không phụ thuộc thứ tự danh sách', () => {
    expect(sheetForPeriod('2026-08', [B, A])?.dated).toBe('2025-08')
    expect(sheetForPeriod('2026-09', [B, A])?.dated).toBe('2026-08')
    expect(sheetForPeriod('2027-01', [A, B])?.dated).toBe('2026-08')
  })
  it('kỳ trước mọi bảng → null (không dùng bảng chưa có hiệu lực)', () => {
    expect(sheetForPeriod('2025-07', [A, B])).toBeNull()
    expect(sheetForPeriod('2026-09', [])).toBeNull()
  })
})

describe('sheetCaveat — một dòng giới hạn đặt ngay cạnh con số', () => {
  it('bảng 2025-08 ở kỳ từ 4/2026 → nói chưa tính 子ども・子育て支援金 nên số tiết kiệm hơi cao', () => {
    expect(sheetCaveat({ dated: '2025-08', includesKodomoShienkin: false }, '2026-09')).toBe(
      'Ước tính theo bảng 2025-08 · chưa tính 子ども・子育て支援金 từ 4/2026 nên số tiết kiệm hơi cao',
    )
  })
  it('kỳ trước 4/2026 → chỉ nói bảng nào', () => {
    expect(sheetCaveat({ dated: '2025-08', includesKodomoShienkin: false }, '2026-03')).toBe('Ước tính theo bảng 2025-08')
  })
  it('bảng đã tính khoản đó → chỉ nói bảng nào', () => {
    expect(sheetCaveat({ dated: '2026-08', includesKodomoShienkin: true }, '2026-09')).toBe('Ước tính theo bảng 2026-08')
  })
  it('bảng người dùng khai (không có cờ): coi là đã tính nếu in từ 4/2026', () => {
    expect(sheetCaveat({ dated: '2026-05' }, '2026-09')).toBe('Ước tính theo bảng 2026-05')
    expect(sheetCaveat({ dated: '2025-10' }, '2026-09')).toMatch(/chưa tính 子ども・子育て支援金/)
  })
})
