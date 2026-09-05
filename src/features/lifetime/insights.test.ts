import { describe, expect, it } from 'vitest'
import {
  assetsAtAge,
  coastAssetsMinor,
  compareAtEnd,
  fireYear,
  firstNegativeYear,
  extraSavingsForFire,
  minimumReturnBps,
} from './insights'
import { projectLifetime, type LifetimeInput, type YearRow } from './project'

function rowsOf(over: Partial<LifetimeInput> = {}): YearRow[] {
  return projectLifetime({
    currentYear: 2026,
    birthYear: 1994,
    endAge: 90,
    displayCurrency: 'JPY',
    startingAssetsMinor: 10_000_000,
    realReturnBps: 200,
    bandSpreadBps: 150,
    inflationBps: 200,
    nominalTerms: false,
    phases: [
      {
        startYear: 2026,
        label: 'Nhật',
        country: 'JP',
        currency: 'JPY',
        annualIncomeMinor: 6_000_000,
        annualExpenseMinor: 4_000_000,
        fxToDisplay: 1,
      },
    ],
    events: [],
    ...over,
  })
}

describe('firstNegativeYear', () => {
  it('trả null khi không năm nào âm', () => {
    expect(firstNegativeYear(rowsOf(), 'center')).toBeNull()
  })

  it('trả năm đầu tiên tài sản xuống dưới 0', () => {
    const rows = rowsOf({
      startingAssetsMinor: 0,
      realReturnBps: 0,
      bandSpreadBps: 0,
      phases: [
        {
          startYear: 2026,
          label: 'Nhật',
          country: 'JP',
          currency: 'JPY',
          annualIncomeMinor: 1_000_000,
          annualExpenseMinor: 2_000_000,
          fxToDisplay: 1,
        },
      ],
    })
    expect(firstNegativeYear(rows, 'center')).toBe(2026)
  })

  it('biên dưới của dải âm sớm hơn nhánh trung tâm', () => {
    // Nghỉ hưu ngay: không thu, chi đều, tài sản tụt dần. Biên dưới tụt nhanh hơn.
    const rows = rowsOf({
      startingAssetsMinor: 50_000_000,
      realReturnBps: 200,
      bandSpreadBps: 400,
      phases: [
        {
          startYear: 2026,
          label: 'Nghỉ',
          country: 'JP',
          currency: 'JPY',
          annualIncomeMinor: 0,
          annualExpenseMinor: 3_000_000,
          fxToDisplay: 1,
        },
      ],
    })
    const low = firstNegativeYear(rows, 'low')
    const center = firstNegativeYear(rows, 'center')
    expect(low).not.toBeNull()
    expect(center).not.toBeNull()
    expect(low!).toBeLessThan(center!)
  })
})

describe('fireYear', () => {
  it('trả năm đầu tiên tài sản × 4% đủ trả chi phí năm', () => {
    // chi 4.000.000/năm → cần 100.000.000 tài sản
    const rows = rowsOf()
    const y = fireYear(rows)
    expect(y).not.toBeNull()
    const row = rows.find((r) => r.year === y)!
    expect(row.assetsEndMinor * 0.04).toBeGreaterThanOrEqual(row.expenseMinor)
    const prev = rows.find((r) => r.year === y! - 1)
    if (prev) expect(prev.assetsEndMinor * 0.04).toBeLessThan(prev.expenseMinor)
  })

  it('trả null khi không bao giờ đạt', () => {
    const rows = rowsOf({
      startingAssetsMinor: 0,
      realReturnBps: 0,
      bandSpreadBps: 0,
      phases: [
        {
          startYear: 2026,
          label: 'Nhật',
          country: 'JP',
          currency: 'JPY',
          annualIncomeMinor: 4_000_000,
          annualExpenseMinor: 4_000_000,
          fxToDisplay: 1,
        },
      ],
    })
    expect(fireYear(rows)).toBeNull()
  })
})

describe('assetsAtAge', () => {
  it('trả cả ba nhánh tại đúng tuổi', () => {
    const rows = rowsOf()
    const at65 = assetsAtAge(rows, 65)
    expect(at65).not.toBeNull()
    expect(at65!.low).toBeLessThan(at65!.center)
    expect(at65!.center).toBeLessThan(at65!.high)
  })

  it('trả null khi tuổi nằm ngoài bản chiếu', () => {
    expect(assetsAtAge(rowsOf(), 200)).toBeNull()
  })
})

describe('minimumReturnBps', () => {
  it('trả 0 khi kịch bản không âm dù lợi suất bằng 0', () => {
    const input: LifetimeInput = {
      currentYear: 2026,
      birthYear: 1994,
      endAge: 90,
      displayCurrency: 'JPY',
      startingAssetsMinor: 10_000_000,
      realReturnBps: 200,
      bandSpreadBps: 0,
      inflationBps: 200,
      nominalTerms: false,
      phases: [
        {
          startYear: 2026,
          label: 'Nhật',
          country: 'JP',
          currency: 'JPY',
          annualIncomeMinor: 6_000_000,
          annualExpenseMinor: 4_000_000,
          fxToDisplay: 1,
        },
      ],
      events: [],
    }
    expect(minimumReturnBps(input)).toBe(0)
  })

  it('trả null khi lợi suất cao nhất cũng không cứu được', () => {
    const input: LifetimeInput = {
      currentYear: 2026,
      birthYear: 1994,
      endAge: 90,
      displayCurrency: 'JPY',
      startingAssetsMinor: 0,
      realReturnBps: 200,
      bandSpreadBps: 0,
      inflationBps: 200,
      nominalTerms: false,
      phases: [
        {
          startYear: 2026,
          label: 'Nhật',
          country: 'JP',
          currency: 'JPY',
          annualIncomeMinor: 0,
          annualExpenseMinor: 4_000_000,
          fxToDisplay: 1,
        },
      ],
      events: [],
    }
    // Tài sản khởi điểm 0 thì nhân bao nhiêu cũng bằng 0 → năm đầu đã âm.
    expect(minimumReturnBps(input)).toBeNull()
  })
})

describe('compareAtEnd', () => {
  it('trả hiệu tài sản cuối của hai bản chiếu', () => {
    const a = rowsOf()
    const b = rowsOf({ startingAssetsMinor: 20_000_000 })
    const diff = compareAtEnd(a, b)
    expect(diff).not.toBeNull()
    expect(diff!).toBeLessThan(0)
  })

  it('trả null nếu một bên rỗng', () => {
    expect(compareAtEnd(rowsOf(), [])).toBeNull()
  })
})

describe('extraSavingsForFire', () => {
  /** Kịch bản NỀN: chi 4tr/năm, thu 6tr, lợi suất 3% — FIRE ở một mốc xa. */
  const base: LifetimeInput = {
    currentYear: 2026,
    birthYear: 1994,
    endAge: 90,
    displayCurrency: 'JPY',
    startingAssetsMinor: 10_000_000,
    realReturnBps: 300,
    bandSpreadBps: 100,
    inflationBps: 200,
    nominalTerms: false,
    phases: [
      {
        startYear: 2026,
        label: 'Nhật',
        country: 'JP',
        currency: 'JPY',
        annualIncomeMinor: 6_000_000,
        annualExpenseMinor: 4_000_000,
        fxToDisplay: 1,
      },
    ],
    events: [],
  }

  it('trả 0 khi mốc đã đạt sẵn, không cần để dành thêm', () => {
    const dat = fireYear(projectLifetime(base))
    expect(dat).not.toBeNull()
    expect(extraSavingsForFire(base, dat as number)).toBe(0)
  })

  it('số trả về ĐỦ để tới mốc, và bớt đi một chút là hụt', () => {
    const dat = fireYear(projectLifetime(base)) as number
    const target = dat - 5
    const extra = extraSavingsForFire(base, target)
    expect(extra).not.toBeNull()
    const chieu = (bot: number) =>
      fireYear(
        projectLifetime({
          ...base,
          phases: base.phases.map((p) => ({
            ...p,
            annualExpenseMinor: p.annualExpenseMinor - bot,
          })),
        }),
      )
    expect(chieu(extra as number)).toBeLessThanOrEqual(target)
    // Đây là điều kiện "nhỏ nhất": lùi một đồng là trượt mốc.
    const thieu = chieu((extra as number) - 1)
    expect(thieu === null || thieu > target).toBe(true)
  })

  it('trả null khi mốc quá gần — cắt tới đâu cũng không tới', () => {
    expect(extraSavingsForFire({ ...base, startingAssetsMinor: 0 }, 2026)).toBeNull()
  })

  it('trả null khi mọi chặng đều chi 0 (không còn gì để cắt)', () => {
    const khongChi = {
      ...base,
      phases: base.phases.map((p) => ({ ...p, annualExpenseMinor: 0 })),
    }
    expect(extraSavingsForFire(khongChi, 2027)).toBeNull()
  })

  it('cắt theo TIỀN HIỂN THỊ, quy ngược đúng về tiền của từng chặng', () => {
    // Chặng ₫ với tỷ giá 1₫ = 0,006¥. Cắt 600.000¥ hiển thị phải bằng cắt 100.000.000₫
    // ở chặng — nếu quy đổi sai chiều thì con số ra sẽ lệch ~28.000 lần.
    const haiTien: LifetimeInput = {
      ...base,
      phases: [
        {
          startYear: 2026,
          label: 'Việt Nam',
          country: 'VN',
          currency: 'VND',
          annualIncomeMinor: 1_000_000_000,
          annualExpenseMinor: 700_000_000,
          fxToDisplay: 0.006,
        },
      ],
    }
    const dat = fireYear(projectLifetime(haiTien)) as number
    const extra = extraSavingsForFire(haiTien, dat - 3)
    expect(extra).not.toBeNull()
    // Cắt hết chi của chặng = 700.000.000₫ × 0,006 = 4.200.000¥ hiển thị. Con số trả
    // về phải nằm trong khoảng đó, không phải một số lớn hơn hàng nghìn lần.
    expect(extra as number).toBeGreaterThan(0)
    expect(extra as number).toBeLessThanOrEqual(4_200_000)
  })
})

describe('coastAssetsMinor', () => {
  const inputOf = (over: Partial<LifetimeInput> = {}): LifetimeInput => ({
    currentYear: 2026,
    birthYear: 1994,
    endAge: 70,
    displayCurrency: 'JPY',
    startingAssetsMinor: 2_500_000,
    realReturnBps: 200,
    bandSpreadBps: 0,
    inflationBps: 200,
    nominalTerms: false,
    phases: [
      {
        startYear: 2026,
        label: 'Nhật',
        country: 'JP',
        currency: 'JPY',
        annualIncomeMinor: 4_800_000,
        annualExpenseMinor: 3_000_000,
        fxToDisplay: 1,
      },
    ],
    events: [],
    ...over,
  })

  it('đóng dạng: chi cuối × 25 chia lãi kép số năm còn lại', () => {
    // Đích = 3tr × 25 = 75tr; còn 1994+70−2026 = 38 năm; 75tr ÷ 1,02^38
    const coast = coastAssetsMinor(inputOf()) as number
    expect(coast).toBe(Math.round(75_000_000 / Math.pow(1.02, 38)))
  })

  it('tự nhất quán với fireYear: có đúng số Coast, không góp thêm, vẫn đạt trước tuổi cuối', () => {
    const coast = coastAssetsMinor(inputOf()) as number
    // "Không góp thêm" = thu bằng chi từ nay về sau.
    const khongGop = inputOf({
      startingAssetsMinor: coast,
      bandSpreadBps: 0,
      phases: [
        {
          startYear: 2026,
          label: 'Nhật',
          country: 'JP',
          currency: 'JPY',
          annualIncomeMinor: 3_000_000,
          annualExpenseMinor: 3_000_000,
          fxToDisplay: 1,
        },
      ],
    })
    const dat = fireYear(projectLifetime(khongGop))
    expect(dat).not.toBeNull()
    expect(dat as number).toBeLessThanOrEqual(1994 + 70)
    // Thiếu 20% so với Coast thì KHÔNG kịp — mốc không phải con số tuỳ hứng.
    const thieu = fireYear(
      projectLifetime({ ...khongGop, startingAssetsMinor: Math.round(coast * 0.8) }),
    )
    expect(thieu).toBeNull()
  })

  it('dùng chi của CHẶNG CUỐI, quy về tiền hiển thị', () => {
    const coast = coastAssetsMinor(
      inputOf({
        phases: [
          {
            startYear: 2026,
            label: 'Nhật',
            country: 'JP',
            currency: 'JPY',
            annualIncomeMinor: 4_800_000,
            annualExpenseMinor: 3_000_000,
            fxToDisplay: 1,
          },
          {
            startYear: 2040,
            label: 'VN',
            country: 'VN',
            currency: 'VND',
            annualIncomeMinor: 0,
            annualExpenseMinor: 400_000_000,
            fxToDisplay: 0.006,
          },
        ],
      }),
    ) as number
    // Chi cuối hiển thị = 400tr₫ × 0,006 = 2,4tr¥ → đích 60tr¥
    expect(coast).toBe(Math.round(60_000_000 / Math.pow(1.02, 38)))
  })

  it('null khi hết năm để lớn hoặc chi ≤ 0', () => {
    expect(coastAssetsMinor(inputOf({ endAge: 32 }))).toBeNull()
    expect(
      coastAssetsMinor(
        inputOf({
          phases: [
            {
              startYear: 2026,
              label: 'Nhật',
              country: 'JP',
              currency: 'JPY',
              annualIncomeMinor: 1,
              annualExpenseMinor: 0,
              fxToDisplay: 1,
            },
          ],
        }),
      ),
    ).toBeNull()
  })
})
