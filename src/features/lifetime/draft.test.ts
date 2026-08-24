import { describe, expect, it } from 'vitest'
import {
  applyPreset,
  draftChanges,
  draftFromRows,
  draftIsDirty,
  draftPhaseIndex,
  draftToInput,
  isNewId,
  NEW_ID_PREFIX,
  patchDraftEvent,
  planDraftSave,
  removeDraftEvent,
  savePlanIsEmpty,
  type ScenarioDraft,
} from './draft'
import type { LifetimeInput } from './project'
import type { LifeEventRow, LifePhaseRow, LifeScenarioRow } from '../../types/database.types'

const scenario: LifeScenarioRow = {
  id: 'sc1',
  user_id: 'u1',
  name: 'Hiện tại',
  display_currency: 'JPY',
  end_age: 90,
  real_return_bps: 200,
  band_spread_bps: 150,
  starting_assets_minor: 14_200_000,
  nominal_terms: false,
  is_primary: true,
  sort_order: 0,
  created_at: '2026-01-01',
}

const phaseRow = (over: Partial<LifePhaseRow> & Pick<LifePhaseRow, 'id' | 'start_year'>): LifePhaseRow => ({
  user_id: 'u1',
  scenario_id: 'sc1',
  label: 'Đi làm ở Nhật',
  country: 'JP',
  currency: 'JPY',
  annual_income_minor: 6_800_000,
  annual_expense_minor: 4_300_000,
  fx_to_display: 1,
  created_at: '2026-01-01',
  ...over,
})

const eventRow = (over: Partial<LifeEventRow> & Pick<LifeEventRow, 'id' | 'start_year'>): LifeEventRow => ({
  user_id: 'u1',
  scenario_id: 'sc1',
  end_year: null,
  kind: 'expense',
  amount_minor: 2_500_000,
  currency: 'JPY',
  label: 'Cưới',
  note: '',
  fx_to_display: 1,
  inflate: true,
  created_at: '2026-01-01',
  ...over,
})

const phaseRows = [
  phaseRow({ id: 'p1', start_year: 2024 }),
  phaseRow({ id: 'p2', start_year: 2059, label: 'Nghỉ hưu', annual_income_minor: 1_900_000, annual_expense_minor: 3_400_000 }),
]
const eventRows = [
  eventRow({ id: 'e1', start_year: 2028, end_year: 2028 }),
  eventRow({ id: 'e2', start_year: 2031, end_year: 2052, amount_minor: 650_000, label: 'Nuôi con' }),
]

const base = () => draftFromRows(scenario, phaseRows, eventRows)

/** Nháp đã sửa một chỗ — sao chép sâu để không đụng bản `saved` của phép thử. */
function edit(mut: (d: ScenarioDraft) => void): ScenarioDraft {
  const d: ScenarioDraft = JSON.parse(JSON.stringify(base()))
  mut(d)
  return d
}

describe('draftFromRows', () => {
  it('lọc đúng kịch bản, sắp chặng và mốc theo năm', () => {
    const lac = draftFromRows(
      scenario,
      [...phaseRows, phaseRow({ id: 'px', start_year: 2030, scenario_id: 'sc-khac' })],
      [...eventRows, eventRow({ id: 'ex', start_year: 2030, scenario_id: 'sc-khac' })],
    )
    expect(lac.phases.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(lac.events.map((e) => e.id)).toEqual(['e1', 'e2'])
  })

  it('mang theo `note` của mốc dù màn Tương lai không sửa nó', () => {
    const d = draftFromRows(scenario, phaseRows, [
      eventRow({ id: 'e1', start_year: 2028, note: 'ghi chú cũ' }),
    ])
    expect(d.events[0].note).toBe('ghi chú cũ')
  })
})

describe('draftPhaseIndex', () => {
  it('lấy chặng muộn nhất đã bắt đầu', () => {
    expect(draftPhaseIndex(base(), 2026)).toBe(0)
    expect(draftPhaseIndex(base(), 2060)).toBe(1)
  })

  it('mọi chặng còn ở tương lai thì lấy chặng sớm nhất', () => {
    expect(draftPhaseIndex(base(), 2000)).toBe(0)
  })

  it('không có chặng nào thì -1', () => {
    expect(draftPhaseIndex({ ...base(), phases: [] }, 2026)).toBe(-1)
  })
})

describe('draftToInput', () => {
  const khung: LifetimeInput = {
    currentYear: 2026,
    birthYear: 1994,
    endAge: 90,
    displayCurrency: 'JPY',
    startingAssetsMinor: 14_200_000,
    realReturnBps: 200,
    bandSpreadBps: 150,
    inflationBps: 200,
    nominalTerms: false,
    phases: [],
    events: [],
  }

  it('giữ nguyên phần khung, chỉ đè thứ nháp vặn được', () => {
    const inp = draftToInput(khung, edit((d) => { d.endAge = 95; d.realReturnBps = 400 }))
    expect(inp.currentYear).toBe(2026)
    expect(inp.birthYear).toBe(1994)
    expect(inp.startingAssetsMinor).toBe(14_200_000)
    expect(inp.bandSpreadBps).toBe(150)
    expect(inp.endAge).toBe(95)
    expect(inp.realReturnBps).toBe(400)
    expect(inp.phases).toHaveLength(2)
    expect(inp.events).toHaveLength(2)
  })
})

describe('draftChanges', () => {
  it('nháp y hệt bản lưu thì không có thay đổi nào', () => {
    expect(draftChanges(base(), base(), 2026)).toEqual([])
    expect(draftIsDirty(base(), base(), 2026)).toBe(false)
  })

  it('bắt thu/chi của ĐÚNG chặng đang chạy', () => {
    const d = edit((x) => { x.phases[0].annualExpenseMinor = 3_800_000 })
    expect(draftChanges(base(), d, 2026)).toEqual([
      { kind: 'expense', currency: 'JPY', fromMinor: 4_300_000, toMinor: 3_800_000 },
    ])
  })

  it('KHÔNG bắt thu/chi của chặng chưa tới', () => {
    const d = edit((x) => { x.phases[1].annualExpenseMinor = 1 })
    expect(draftChanges(base(), d, 2026)).toEqual([])
  })

  it('bắt lợi suất, tuổi chiếu tới, và năm bắt đầu chặng', () => {
    const d = edit((x) => {
      x.realReturnBps = 350
      x.endAge = 95
      x.phases[1].startYear = 2049
    })
    expect(draftChanges(base(), d, 2026)).toEqual([
      { kind: 'return', fromBps: 200, toBps: 350 },
      { kind: 'endAge', from: 90, to: 95 },
      { kind: 'phaseYear', label: 'Nghỉ hưu', from: 2059, to: 2049 },
    ])
  })

  it('đếm mốc thêm / bớt / sửa riêng từng loại', () => {
    const d = edit((x) => {
      x.events = [
        { ...x.events[0], amountMinor: 3_000_000 },
        { ...x.events[1], id: `${NEW_ID_PREFIX}1`, label: 'Mua nhà' },
      ]
    })
    expect(draftChanges(base(), d, 2026)).toEqual([
      { kind: 'eventsAdded', count: 1 },
      { kind: 'eventsRemoved', count: 1 },
      { kind: 'eventsEdited', count: 1 },
    ])
  })
})

describe('isNewId', () => {
  it('phân biệt mốc chưa có dòng DB', () => {
    expect(isNewId(`${NEW_ID_PREFIX}7`)).toBe(true)
    expect(isNewId('0f0a1b2c-dead-beef-0000-000000000000')).toBe(false)
  })
})

describe('planDraftSave', () => {
  it('không đổi gì thì kế hoạch rỗng', () => {
    const plan = planDraftSave(base(), base())
    expect(savePlanIsEmpty(plan)).toBe(true)
  })

  it('chỉ ghi CỘT đã đổi, không ghi đè cả dòng', () => {
    const d = edit((x) => {
      x.realReturnBps = 350
      x.phases[0].annualExpenseMinor = 3_800_000
    })
    const plan = planDraftSave(base(), d)
    expect(plan.scenarioPatch).toEqual({ real_return_bps: 350 })
    expect(plan.phaseInserts).toEqual([])
    expect(plan.phasePatches).toEqual([{ id: 'p1', patch: { annual_expense_minor: 3_800_000 } }])
    expect(plan.eventPatches).toEqual([])
  })

  it('mốc mới thành lệnh THÊM, mang đủ scenario_id và note', () => {
    const d = edit((x) => {
      x.events.push({
        id: `${NEW_ID_PREFIX}9`,
        startYear: 2034,
        endYear: 2034,
        kind: 'expense',
        amountMinor: 12_000_000,
        currency: 'JPY',
        label: 'Mua nhà',
        note: '',
        fxToDisplay: 1,
        inflate: true,
      })
    })
    const plan = planDraftSave(base(), d)
    expect(plan.eventInserts).toEqual([
      {
        scenario_id: 'sc1',
        start_year: 2034,
        end_year: 2034,
        kind: 'expense',
        amount_minor: 12_000_000,
        currency: 'JPY',
        label: 'Mua nhà',
        note: '',
        fx_to_display: 1,
        inflate: true,
      },
    ])
    expect(plan.eventDeletes).toEqual([])
  })

  it('mốc bị bỏ khỏi nháp thành lệnh XOÁ', () => {
    const d = edit((x) => { x.events = x.events.filter((e) => e.id !== 'e2') })
    expect(planDraftSave(base(), d).eventDeletes).toEqual(['e2'])
  })

  it('mốc thêm rồi xoá ngay trong cùng phiên KHÔNG sinh lệnh nào', () => {
    // Ca này là lý do `eventDeletes` phải lọc `isNewId`: id "nhap:…" chưa từng
    // được ghi, gửi lệnh xoá cho nó là gửi một id không tồn tại dưới DB.
    const saved = edit((x) => {
      x.events.push({
        id: `${NEW_ID_PREFIX}9`, startYear: 2034, endYear: 2034, kind: 'expense',
        amountMinor: 1, currency: 'JPY', label: 'Tạm', note: '', fxToDisplay: 1, inflate: true,
      })
    })
    const d = edit(() => {})
    expect(planDraftSave(saved, d).eventDeletes).toEqual([])
  })

  it('kéo mốc sang năm khác chỉ ghi hai cột năm', () => {
    const d = edit((x) => {
      x.events[1].startYear = 2035
      x.events[1].endYear = 2056
    })
    expect(planDraftSave(base(), d).eventPatches).toEqual([
      { id: 'e2', patch: { start_year: 2035, end_year: 2056 } },
    ])
  })

  it('dời tuổi nghỉ hưu = ghi start_year của chặng cuối', () => {
    const d = edit((x) => { x.phases[1].startYear = 2049 })
    expect(planDraftSave(base(), d).phasePatches).toEqual([
      { id: 'p2', patch: { start_year: 2049 } },
    ])
  })
})

describe('applyPreset', () => {
  /** Mẫu "Cưới" thu nhỏ: một chặng mới + một khoản chi. */
  const ketQuaMau = {
    phases: [
      {
        scenario_id: 'sc1',
        start_year: 2030,
        label: 'Cưới',
        country: 'JP',
        currency: 'JPY',
        annual_income_minor: 11_560_000,
        annual_expense_minor: 6_450_000,
        fx_to_display: 1,
      },
    ],
    events: [
      {
        scenario_id: 'sc1',
        start_year: 2030,
        end_year: 2030,
        kind: 'expense' as const,
        amount_minor: 3_000_000,
        currency: 'JPY',
        label: 'Chi phí cưới',
        note: 'Số mặc định, kiểm tra lại',
        fx_to_display: 1,
        inflate: true,
      },
    ],
  }

  it('thêm chặng và mốc vào nháp, giữ thứ tự theo năm', () => {
    const d = applyPreset(base(), ketQuaMau, 1)
    expect(d.phases.map((p) => p.startYear)).toEqual([2024, 2030, 2059])
    expect(d.events.map((e) => e.startYear)).toEqual([2028, 2030, 2031])
  })

  it('id mới mang tiền tố nháp, và hai lần gọi không đụng id nhau', () => {
    const d = applyPreset(applyPreset(base(), ketQuaMau, 1), ketQuaMau, 2)
    const ids = [...d.phases.map((p) => p.id), ...d.events.map((e) => e.id)]
    expect(new Set(ids).size).toBe(ids.length)
    expect(d.phases.filter((p) => isNewId(p.id))).toHaveLength(2)
  })

  it('chặng mới thành lệnh THÊM chứ không phải lệnh sửa', () => {
    const plan = planDraftSave(base(), applyPreset(base(), ketQuaMau, 1))
    expect(plan.phasePatches).toEqual([])
    expect(plan.phaseInserts).toEqual([ketQuaMau.phases[0]])
    expect(plan.eventInserts).toEqual([ketQuaMau.events[0]])
  })

  it('tóm tắt đếm được chặng vừa thêm', () => {
    const d = applyPreset(base(), ketQuaMau, 1)
    expect(draftChanges(base(), d, 2026)).toEqual([
      { kind: 'phasesAdded', count: 1 },
      { kind: 'eventsAdded', count: 1 },
    ])
  })
})

describe('patchDraftEvent / removeDraftEvent', () => {
  it('sửa đúng một mốc, không đụng mốc khác', () => {
    const d = patchDraftEvent(base(), 'e1', { amountMinor: 9_000_000, label: 'Cưới to' })
    expect(d.events.find((e) => e.id === 'e1')?.amountMinor).toBe(9_000_000)
    expect(d.events.find((e) => e.id === 'e2')?.amountMinor).toBe(650_000)
  })

  it('mốc không còn thì trả về chính bản nháp cũ', () => {
    const b = base()
    expect(patchDraftEvent(b, 'khong-co', { label: 'x' })).toBe(b)
  })

  it('bỏ mốc', () => {
    expect(removeDraftEvent(base(), 'e1').events.map((e) => e.id)).toEqual(['e2'])
  })
})
