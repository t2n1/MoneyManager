import { describe, expect, it } from 'vitest'
import { convertLifetimeMinor, projectLifetime, type LifetimeInput } from './project'

/** Kịch bản trần: 1 chặng, không sự kiện, lợi suất 0. */
function baseInput(over: Partial<LifetimeInput> = {}): LifetimeInput {
  return {
    currentYear: 2026,
    birthYear: 1994,
    // Tuổi kết thúc phải LỚN HƠN tuổi hiện tại (32 vào 2026), không thì bản chiếu rỗng.
    endAge: 40,
    displayCurrency: 'JPY',
    startingAssetsMinor: 1_000_000,
    realReturnBps: 0,
    bandSpreadBps: 0,
    inflationBps: 200,
    nominalTerms: false,
    phases: [
      {
        startYear: 2026,
        label: 'Nhật',
        country: 'JP',
        currency: 'JPY',
        annualIncomeMinor: 5_000_000,
        annualExpenseMinor: 4_000_000,
        fxToDisplay: 1,
      },
    ],
    events: [],
    ...over,
  }
}

describe('convertLifetimeMinor', () => {
  it('quy đổi đúng khi hai loại tiền khác số chữ số thập phân', () => {
    // $95.000 = 9.500.000 minor USD. Tỷ giá ¥150/$ → ¥14.250.000 = 14.250.000 minor JPY.
    // Nhân thẳng minor × 150 sẽ ra 1.425.000.000 — sai 100 lần. Đây là cái bẫy.
    expect(convertLifetimeMinor(9_500_000, 'USD', 'JPY', 150)).toBe(14_250_000)
  })

  it('cùng loại tiền thì trả nguyên, không nhân tỷ giá', () => {
    expect(convertLifetimeMinor(1234, 'JPY', 'JPY', 999)).toBe(1234)
  })

  it('quy đổi ngược lại cũng đúng', () => {
    // ¥15.000 với tỷ giá 1¥ = 0,0067$ → $100,50 = 10050 minor USD
    expect(convertLifetimeMinor(15_000, 'JPY', 'USD', 0.0067)).toBe(10_050)
  })
})

describe('projectLifetime', () => {
  it('trả một dòng cho mỗi năm từ năm hiện tại tới tuổi kết thúc', () => {
    const rows = projectLifetime(baseInput())
    // 1994 + 40 = 2034 là năm cuối; 2034 − 2026 + 1 = 9 dòng
    expect(rows).toHaveLength(9)
    expect(rows[0].year).toBe(2026)
    expect(rows[0].age).toBe(32)
    expect(rows[rows.length - 1].year).toBe(2034)
    expect(rows[rows.length - 1].age).toBe(40)
  })

  it('trả rỗng khi tuổi kết thúc đã ở quá khứ', () => {
    expect(projectLifetime(baseInput({ endAge: 20 }))).toEqual([])
  })

  it('cộng dồn thặng dư hằng năm khi lợi suất bằng 0', () => {
    const rows = projectLifetime(baseInput({ endAge: 34 }))
    // dư 1.000.000/năm, khởi điểm 1.000.000
    expect(rows[0].assetsEndMinor).toBe(2_000_000)
    expect(rows[1].assetsEndMinor).toBe(3_000_000)
    expect(rows[2].assetsEndMinor).toBe(4_000_000)
  })

  it('áp lợi suất lên tài sản đầu năm trước khi cộng dòng tiền', () => {
    const rows = projectLifetime(baseInput({ endAge: 33, realReturnBps: 1000 }))
    // 1.000.000 × 1,1 = 1.100.000, cộng dư 1.000.000 → 2.100.000
    expect(rows[0].assetsEndMinor).toBe(2_100_000)
  })

  it('chặng sau ghi đè chặng trước từ năm bắt đầu của nó', () => {
    const rows = projectLifetime(
      baseInput({
        endAge: 34,
        phases: [
          {
            startYear: 2026,
            label: 'Nhật',
            country: 'JP',
            currency: 'JPY',
            annualIncomeMinor: 5_000_000,
            annualExpenseMinor: 4_000_000,
            fxToDisplay: 1,
          },
          {
            startYear: 2028,
            label: 'Mỹ',
            country: 'US',
            currency: 'USD',
            annualIncomeMinor: 9_500_000,
            annualExpenseMinor: 6_200_000,
            fxToDisplay: 150,
          },
        ],
      }),
    )
    expect(rows[0].country).toBe('JP')
    expect(rows[0].incomeMinor).toBe(5_000_000)
    // 2028: $95.000 → ¥14.250.000 ; $62.000 → ¥9.300.000
    const y2028 = rows.find((r) => r.year === 2028)!
    expect(y2028.country).toBe('US')
    expect(y2028.incomeMinor).toBe(14_250_000)
    expect(y2028.expenseMinor).toBe(9_300_000)
  })

  it('sự kiện chỉ tính trong khoảng start_year..end_year, bao gồm hai đầu', () => {
    const rows = projectLifetime(
      baseInput({
        endAge: 35,
        events: [
          {
            id: 'e1',
            startYear: 2027,
            endYear: 2028,
            kind: 'expense',
            amountMinor: 500_000,
            currency: 'JPY',
            label: 'Học phí',
            inflate: false,
          },
        ],
      }),
    )
    expect(rows.find((r) => r.year === 2026)!.events).toHaveLength(0)
    expect(rows.find((r) => r.year === 2027)!.events).toHaveLength(1)
    expect(rows.find((r) => r.year === 2028)!.events).toHaveLength(1)
    expect(rows.find((r) => r.year === 2029)!.events).toHaveLength(0)
    expect(rows.find((r) => r.year === 2027)!.netFlowMinor).toBe(500_000)
  })

  it('sự kiện end_year null thì chạy tới hết đời', () => {
    const rows = projectLifetime(
      baseInput({
        // endAge 45 → năm cuối 2039. Sự kiện bắt đầu 2030 phải NẰM TRONG bản chiếu,
        // không thì nó không bao giờ hiệu lực và test không kiểm được gì.
        endAge: 45,
        events: [
          {
            id: 'e1',
            startYear: 2030,
            endYear: null,
            kind: 'income',
            amountMinor: 1_100_000,
            currency: 'JPY',
            label: '年金',
            inflate: false,
          },
        ],
      }),
    )
    expect(rows[rows.length - 1].events).toHaveLength(1)
    expect(rows[rows.length - 1].events[0].label).toBe('年金')
  })

  it('inflate=true thì sự kiện tăng theo lạm phát, false thì đứng yên', () => {
    const withInflate = projectLifetime(
      baseInput({
        endAge: 34,
        nominalTerms: true,
        inflationBps: 1000,
        events: [
          {
            id: 'e1',
            startYear: 2026,
            endYear: null,
            kind: 'expense',
            amountMinor: 1_000_000,
            currency: 'JPY',
            label: 'Học phí',
            inflate: true,
          },
        ],
      }),
    )
    // 2028 là năm thứ 2 sau gốc → ×1,1² = 1.210.000
    expect(withInflate.find((r) => r.year === 2028)!.events[0].amountDisplayMinor).toBe(1_210_000)

    const noInflate = projectLifetime(
      baseInput({
        endAge: 34,
        nominalTerms: true,
        inflationBps: 1000,
        events: [
          {
            id: 'e1',
            startYear: 2026,
            endYear: null,
            kind: 'expense',
            amountMinor: 1_000_000,
            currency: 'JPY',
            label: '年金',
            inflate: false,
          },
        ],
      }),
    )
    expect(noInflate.find((r) => r.year === 2028)!.events[0].amountDisplayMinor).toBe(1_000_000)
  })

  it('giá hôm nay (nominalTerms=false) thì lạm phát không làm phồng số', () => {
    const rows = projectLifetime(baseInput({ endAge: 40, inflationBps: 1000 }))
    for (const r of rows) expect(r.expenseMinor).toBe(4_000_000)
  })

  it('dải dao động: nhánh cao ≥ trung tâm ≥ nhánh thấp', () => {
    const rows = projectLifetime(baseInput({ endAge: 60, realReturnBps: 300, bandSpreadBps: 150 }))
    const last = rows[rows.length - 1]
    expect(last.assetsHighMinor).toBeGreaterThan(last.assetsEndMinor)
    expect(last.assetsEndMinor).toBeGreaterThan(last.assetsLowMinor)
  })

  it('tài sản âm được, không bị kẹp về 0', () => {
    const rows = projectLifetime(
      baseInput({
        endAge: 36,
        startingAssetsMinor: 0,
        phases: [
          {
            startYear: 2026,
            label: 'Nhật',
            country: 'JP',
            currency: 'JPY',
            annualIncomeMinor: 1_000_000,
            annualExpenseMinor: 4_000_000,
            fxToDisplay: 1,
          },
        ],
      }),
    )
    expect(rows[0].assetsEndMinor).toBe(-3_000_000)
    expect(rows[1].assetsEndMinor).toBe(-6_000_000)
  })

  it('không có chặng nào thì trả mảng rỗng, không nổ', () => {
    expect(projectLifetime(baseInput({ phases: [] }))).toEqual([])
  })

  it('năm trước chặng đầu tiên thì dùng chặng đầu tiên', () => {
    const rows = projectLifetime(
      baseInput({
        endAge: 33,
        phases: [
          {
            startYear: 2030,
            label: 'Muộn',
            country: 'JP',
            currency: 'JPY',
            annualIncomeMinor: 5_000_000,
            annualExpenseMinor: 4_000_000,
            fxToDisplay: 1,
          },
        ],
      }),
    )
    expect(rows[0].phaseLabel).toBe('Muộn')
  })
})
