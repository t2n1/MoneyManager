import { describe, expect, it } from 'vitest'
import { DEFAULT_INFLATION_BPS, buildLifetimeInput, pickActive } from './buildInput'
import type { LifeEventRow, LifePhaseRow, LifeScenarioRow } from '../../types/database.types'

const TODAY = '2026-07-29'

function scenario(over: Partial<LifeScenarioRow> = {}): LifeScenarioRow {
  return {
    id: 's1',
    user_id: 'u',
    name: 'Kịch bản của tôi',
    display_currency: 'JPY',
    end_age: 90,
    real_return_bps: 200,
    band_spread_bps: 150,
    starting_assets_minor: 10_000_000,
    nominal_terms: false,
    is_primary: true,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function phase(over: Partial<LifePhaseRow> = {}): LifePhaseRow {
  return {
    id: 'p1',
    user_id: 'u',
    scenario_id: 's1',
    start_year: 2026,
    label: 'Nhật',
    country: 'JP',
    currency: 'JPY',
    annual_income_minor: 6_000_000,
    annual_expense_minor: 4_000_000,
    fx_to_display: 1,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function event(over: Partial<LifeEventRow> = {}): LifeEventRow {
  return {
    id: 'e1',
    user_id: 'u',
    scenario_id: 's1',
    start_year: 2060,
    end_year: null,
    kind: 'income',
    amount_minor: 1_800_000,
    currency: 'JPY',
    label: 'Lương hưu',
    note: '',
    fx_to_display: 1,
    inflate: false,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

/** Bộ đối số đầy đủ, hợp lệ. Từng phép thử chỉ đổi đúng mảnh nó quan tâm. */
function args(over: Partial<Parameters<typeof buildLifetimeInput>[0]> = {}) {
  return {
    scenarios: [scenario()],
    phases: [phase()],
    events: [event()],
    birthYear: 1994,
    annualInflationBps: 200,
    todayISO: TODAY,
    ...over,
  }
}

// `pickActive` được EXPORT vì `useLifetime.ts` (tầng UI) phải dùng đúng nó chứ không
// phải bản riêng `find(is_primary) ?? scenarios[0]`. Canh trực tiếp theo TÊN, không chỉ
// gián tiếp qua buildLifetimeInput: hợp đồng ở đây là "hai chỗ cùng một luật", nên phép
// thử phải gãy nếu ai đó đổi luật cho một bên.
describe('pickActive — luật dùng chung với useLifetime', () => {
  it('is_primary thắng, dù sort_order lớn hơn', () => {
    const chosen = pickActive([
      scenario({ id: 'phu', is_primary: false, sort_order: 0 }),
      scenario({ id: 'chinh', is_primary: true, sort_order: 9 }),
    ])
    expect(chosen?.id).toBe('chinh')
  })

  it('không bản nào is_primary → sort_order nhỏ nhất, KHÔNG phải phần tử đầu mảng', () => {
    const chosen = pickActive([
      scenario({ id: 'sau', is_primary: false, sort_order: 5 }),
      scenario({ id: 'truoc', is_primary: false, sort_order: 1 }),
    ])
    expect(chosen?.id).toBe('truoc')
  })

  it('nhiều bản cùng is_primary → sort_order nhỏ nhất TRONG SỐ ĐÓ', () => {
    const chosen = pickActive([
      scenario({ id: 'a', is_primary: true, sort_order: 4 }),
      scenario({ id: 'b', is_primary: true, sort_order: 2 }),
      scenario({ id: 'c', is_primary: false, sort_order: 0 }),
    ])
    expect(chosen?.id).toBe('b')
  })

  it('mảng rỗng → undefined', () => {
    expect(pickActive([])).toBeUndefined()
  })

  it('không sắp lại mảng đầu vào (không có tác dụng lề)', () => {
    const input = [
      scenario({ id: 'sau', is_primary: false, sort_order: 5 }),
      scenario({ id: 'truoc', is_primary: false, sort_order: 1 }),
    ]
    pickActive(input)
    expect(input.map((s) => s.id)).toEqual(['sau', 'truoc'])
  })
})

describe('buildLifetimeInput — luật chọn kịch bản', () => {
  it('is_primary thắng, dù sort_order lớn hơn', () => {
    const out = buildLifetimeInput(
      args({
        scenarios: [
          scenario({ id: 'phu', is_primary: false, sort_order: 0, end_age: 70 }),
          scenario({ id: 'chinh', is_primary: true, sort_order: 9, end_age: 95 }),
        ],
        phases: [phase({ scenario_id: 'chinh' }), phase({ id: 'p2', scenario_id: 'phu' })],
      }),
    )
    // `end_age` là dấu vân tay: 95 = đã chọn 'chinh'.
    expect(out?.endAge).toBe(95)
    expect(out?.phases).toHaveLength(1)
  })

  it('không kịch bản nào is_primary → sort_order NHỎ NHẤT', () => {
    const out = buildLifetimeInput(
      args({
        // Cố ý xếp SAI thứ tự trong mảng: hàm phải tự sắp, không tin vào `order by`
        // của tầng dữ liệu (demoRepo không có `order by` nào cả).
        scenarios: [
          scenario({ id: 'sau', is_primary: false, sort_order: 5, end_age: 70 }),
          scenario({ id: 'truoc', is_primary: false, sort_order: 1, end_age: 88 }),
        ],
        phases: [phase({ scenario_id: 'truoc' }), phase({ id: 'p2', scenario_id: 'sau' })],
      }),
    )
    expect(out?.endAge).toBe(88)
  })

  it('nhiều kịch bản cùng is_primary → sort_order NHỎ NHẤT trong số đó', () => {
    const out = buildLifetimeInput(
      args({
        scenarios: [
          scenario({ id: 'a', is_primary: true, sort_order: 4, end_age: 70 }),
          scenario({ id: 'b', is_primary: true, sort_order: 2, end_age: 81 }),
          // sort_order nhỏ nhất TOÀN BỘ nhưng không phải primary → không được chọn.
          scenario({ id: 'c', is_primary: false, sort_order: 0, end_age: 60 }),
        ],
        phases: [
          phase({ scenario_id: 'a' }),
          phase({ id: 'p2', scenario_id: 'b' }),
          phase({ id: 'p3', scenario_id: 'c' }),
        ],
      }),
    )
    expect(out?.endAge).toBe(81)
  })

  it('hoà cả sort_order → giữ thứ tự mảng đầu vào', () => {
    const out = buildLifetimeInput(
      args({
        scenarios: [
          scenario({ id: 'dau', sort_order: 3, end_age: 77 }),
          scenario({ id: 'sau', sort_order: 3, end_age: 66 }),
        ],
        phases: [phase({ scenario_id: 'dau' }), phase({ id: 'p2', scenario_id: 'sau' })],
      }),
    )
    expect(out?.endAge).toBe(77)
  })
})

describe('buildLifetimeInput — undefined khi thiếu mảnh', () => {
  it('chưa khai năm sinh', () => {
    expect(buildLifetimeInput(args({ birthYear: null }))).toBeUndefined()
    expect(buildLifetimeInput(args({ birthYear: undefined }))).toBeUndefined()
    // Năm sinh 0 cũng vô nghĩa (dữ liệu cũ hơn migration 0031).
    expect(buildLifetimeInput(args({ birthYear: 0 }))).toBeUndefined()
  })

  it('query kịch bản / chặng / sự kiện chưa về', () => {
    expect(buildLifetimeInput(args({ scenarios: undefined }))).toBeUndefined()
    expect(buildLifetimeInput(args({ phases: undefined }))).toBeUndefined()
    // Sự kiện RỖNG là hợp lệ, nhưng CHƯA VỀ thì không: bản chiếu thiếu hẳn lương hưu
    // sẽ báo một mốc âm sai.
    expect(buildLifetimeInput(args({ events: undefined }))).toBeUndefined()
    expect(buildLifetimeInput(args({ events: [] }))).toBeDefined()
  })

  it('chưa có kịch bản nào', () => {
    expect(buildLifetimeInput(args({ scenarios: [] }))).toBeUndefined()
  })

  it('kịch bản chính chưa có chặng nào', () => {
    // Có chặng trong DB nhưng thuộc kịch bản KHÁC → vẫn là "không có chặng".
    expect(
      buildLifetimeInput(args({ phases: [phase({ scenario_id: 'khac' })] })),
    ).toBeUndefined()
    expect(buildLifetimeInput(args({ phases: [] }))).toBeUndefined()
  })
})

describe('buildLifetimeInput — ánh xạ trường', () => {
  it('đổ đủ mọi trường của kịch bản, chặng và sự kiện', () => {
    const out = buildLifetimeInput(
      args({
        scenarios: [
          scenario({
            display_currency: 'USD',
            end_age: 92,
            real_return_bps: 350,
            band_spread_bps: 120,
            starting_assets_minor: 123_456_789,
            nominal_terms: true,
          }),
        ],
        phases: [
          phase({
            start_year: 2029,
            label: 'Mỹ',
            country: 'US',
            currency: 'USD',
            annual_income_minor: 14_000_000,
            annual_expense_minor: 9_300_000,
            fx_to_display: 0.0067,
          }),
        ],
        events: [
          event({
            id: 'nenkin',
            start_year: 2060,
            end_year: 2084,
            kind: 'income',
            amount_minor: 1_800_000,
            currency: 'JPY',
            label: '年金',
            fx_to_display: 0.0067,
            inflate: true,
          }),
        ],
        annualInflationBps: 250,
      }),
    )
    expect(out).toEqual({
      currentYear: 2026,
      birthYear: 1994,
      endAge: 92,
      displayCurrency: 'USD',
      startingAssetsMinor: 123_456_789,
      realReturnBps: 350,
      bandSpreadBps: 120,
      inflationBps: 250,
      nominalTerms: true,
      phases: [
        {
          startYear: 2029,
          label: 'Mỹ',
          country: 'US',
          currency: 'USD',
          annualIncomeMinor: 14_000_000,
          annualExpenseMinor: 9_300_000,
          fxToDisplay: 0.0067,
        },
      ],
      events: [
        {
          id: 'nenkin',
          startYear: 2060,
          endYear: 2084,
          kind: 'income',
          amountMinor: 1_800_000,
          currency: 'JPY',
          label: '年金',
          fxToDisplay: 0.0067,
          inflate: true,
        },
      ],
    })
  })

  it('năm hiện tại suy từ todayISO, không từ đồng hồ hệ thống', () => {
    expect(buildLifetimeInput(args({ todayISO: '2031-01-01' }))?.currentYear).toBe(2031)
  })

  it('country null của chặng đi qua nguyên vẹn — chặng không buộc theo quốc gia', () => {
    const out = buildLifetimeInput(args({ phases: [phase({ country: null })] }))
    expect(out?.phases[0].country).toBeNull()
  })

  it('end_year null của sự kiện đi qua nguyên vẹn — null = đến hết đời', () => {
    const out = buildLifetimeInput(args({ events: [event({ end_year: null })] }))
    expect(out?.events[0].endYear).toBeNull()
  })

  it('thiếu annual_inflation_bps thì về mặc định, không về 0', () => {
    // Về 0 nghĩa là "không có lạm phát" — ở chế độ giá danh nghĩa đó là một bản chiếu
    // khác hẳn, chứ không phải một giá trị trống vô hại.
    expect(buildLifetimeInput(args({ annualInflationBps: null }))?.inflationBps).toBe(
      DEFAULT_INFLATION_BPS,
    )
    expect(buildLifetimeInput(args({ annualInflationBps: undefined }))?.inflationBps).toBe(
      DEFAULT_INFLATION_BPS,
    )
    // 0 do người dùng KHAI THẬT thì phải giữ nguyên là 0.
    expect(buildLifetimeInput(args({ annualInflationBps: 0 }))?.inflationBps).toBe(0)
  })

  it('lọc chặng và sự kiện theo scenario_id của kịch bản đã chọn', () => {
    const out = buildLifetimeInput(
      args({
        phases: [phase(), phase({ id: 'p-khac', scenario_id: 'khac', label: 'Của kịch bản khác' })],
        events: [event(), event({ id: 'e-khac', scenario_id: 'khac' })],
      }),
    )
    expect(out?.phases.map((p) => p.label)).toEqual(['Nhật'])
    expect(out?.events.map((e) => e.id)).toEqual(['e1'])
  })
})
