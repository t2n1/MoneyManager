import { describe, expect, it } from 'vitest'
import {
  addDraftPhase,
  applyPreset,
  draftChanges,
  draftFromRows,
  draftIsDirty,
  draftPhaseIndex,
  draftToInput,
  isNewId,
  NEW_ID_PREFIX,
  patchDraftEvent,
  patchDraftPhase,
  planDraftSave,
  removeDraftEvent,
  removeDraftPhase,
  savePlanIsEmpty,
  setDraftCurrency,
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
    expect(draftChanges(base(), base())).toEqual([])
    expect(draftIsDirty(base(), base())).toBe(false)
  })

  it('bắt thu/chi của chặng đang chạy, kèm tên chặng', () => {
    const d = edit((x) => { x.phases[0].annualExpenseMinor = 3_800_000 })
    expect(draftChanges(base(), d)).toEqual([
      { kind: 'expense', label: 'Đi làm ở Nhật', currency: 'JPY', fromMinor: 4_300_000, toMinor: 3_800_000 },
    ])
  })

  // Bản trước CỐ Ý bỏ qua chặng chưa tới (đường vặn duy nhất là hai thanh trượt của
  // panel Giả định, vốn chỉ chạm chặng đang chạy). Trình sửa kịch bản có ô thu/chi cho
  // TỪNG chặng, nên bỏ qua ở đây là để nút Lưu tắt ngóm trên một thay đổi có thật.
  it('bắt CẢ thu/chi của chặng chưa tới', () => {
    const d = edit((x) => { x.phases[1].annualExpenseMinor = 1 })
    expect(draftChanges(base(), d)).toEqual([
      { kind: 'expense', label: 'Nghỉ hưu', currency: 'JPY', fromMinor: 3_400_000, toMinor: 1 },
    ])
  })

  it('bắt lợi suất, tuổi chiếu tới, và năm bắt đầu chặng', () => {
    const d = edit((x) => {
      x.realReturnBps = 350
      x.endAge = 95
      x.phases[1].startYear = 2049
    })
    expect(draftChanges(base(), d)).toEqual([
      { kind: 'return', fromBps: 200, toBps: 350 },
      { kind: 'endAge', from: 90, to: 95 },
      { kind: 'phaseYear', label: 'Nghỉ hưu', from: 2059, to: 2049 },
    ])
  })

  it('bắt tên kịch bản, tiền hiển thị, tài sản khởi điểm, dải dao động', () => {
    const d = edit((x) => {
      x.name = 'Về VN sớm'
      x.displayCurrency = 'VND'
      x.startingAssetsMinor = -3_000_000
      x.bandSpreadBps = 250
    })
    expect(draftChanges(base(), d)).toEqual([
      { kind: 'name', from: 'Hiện tại', to: 'Về VN sớm' },
      { kind: 'currency', from: 'JPY', to: 'VND' },
      // Hai đầu mang hai đơn vị KHÁC nhau — cột này lưu theo `display_currency`, mà
      // bản nháp vừa đổi nó. In cả hai bằng một đơn vị là bịa ra một mức tăng/giảm.
      {
        kind: 'startingAssets',
        fromCurrency: 'JPY',
        fromMinor: 14_200_000,
        toCurrency: 'VND',
        toMinor: -3_000_000,
      },
      { kind: 'bandSpread', fromBps: 150, toBps: 250 },
    ])
  })

  // Ba trường của sheet "⋯" — hồi quy: thiếu chúng thì nút Lưu tắt trên một thay đổi
  // đã nằm trong nháp và đã đổi cả bản chiếu (bắt được khi chạy app thật, 2026-08-24).
  it('bắt tiền, tỷ giá và quốc gia của chặng', () => {
    const d = patchDraftPhase(base(), 'p2', {
      currency: 'VND',
      fxToDisplay: 0.0057,
      country: 'VN',
    })
    expect(draftChanges(base(), d)).toEqual([
      { kind: 'phaseCurrency', label: 'Nghỉ hưu', from: 'JPY', to: 'VND' },
      { kind: 'phaseFx', label: 'Nghỉ hưu', from: 1, to: 0.0057 },
      { kind: 'phaseCountry', label: 'Nghỉ hưu', to: 'VN' },
    ])
    expect(draftIsDirty(base(), d)).toBe(true)
  })

  it('bắt sửa riêng ghi chú của một mốc', () => {
    const d = patchDraftEvent(base(), 'e1', { note: 'nhà gái lo phần rạp' })
    expect(draftChanges(base(), d)).toEqual([{ kind: 'eventsEdited', count: 1 }])
    expect(planDraftSave(base(), d).eventPatches).toEqual([
      { id: 'e1', patch: { note: 'nhà gái lo phần rạp' } },
    ])
  })

  it('bắt đổi tên chặng và đếm chặng bị xoá', () => {
    const d = removeDraftPhase(
      patchDraftPhase(base(), 'p1', { label: 'Ở Nhật' }),
      'p2',
    )
    expect(draftChanges(base(), d)).toEqual([
      { kind: 'phaseLabel', from: 'Đi làm ở Nhật', to: 'Ở Nhật' },
      { kind: 'phasesRemoved', count: 1 },
    ])
  })

  it('đếm mốc thêm / bớt / sửa riêng từng loại', () => {
    const d = edit((x) => {
      x.events = [
        { ...x.events[0], amountMinor: 3_000_000 },
        { ...x.events[1], id: `${NEW_ID_PREFIX}1`, label: 'Mua nhà' },
      ]
    })
    expect(draftChanges(base(), d)).toEqual([
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
    expect(draftChanges(base(), d)).toEqual([
      { kind: 'phasesAdded', count: 1 },
      { kind: 'eventsAdded', count: 1 },
    ])
  })
})

describe('setDraftCurrency', () => {
  it('đặt lại tỷ giá của mọi dòng KHÔNG còn khớp tiền hiển thị mới', () => {
    const d0 = edit((x) => {
      x.phases[1].currency = 'VND'
      x.phases[1].fxToDisplay = 0.0057
      x.events[0].currency = 'VND'
      x.events[0].fxToDisplay = 0.0057
    })
    const d = setDraftCurrency(d0, 'VND')
    expect(d.displayCurrency).toBe('VND')
    // Dòng VND nay TRÙNG tiền hiển thị → giữ nguyên tỷ giá người dùng đã khai…
    expect(d.phases[1].fxToDisplay).toBe(0.0057)
    expect(d.events[0].fxToDisplay).toBe(0.0057)
    // …còn dòng JPY thì tỷ giá cũ (1) nay trả lời một câu hỏi khác → đặt lại về 1.
    expect(d.phases[0].fxToDisplay).toBe(1)
  })

  it('KHÔNG đụng tài sản khởi điểm (quy đổi cần tỷ giá hôm nay, file này thuần)', () => {
    const d = setDraftCurrency(base(), 'USD')
    expect(d.startingAssetsMinor).toBe(14_200_000)
  })

  it('đổi sang chính tiền đang có thì trả về nguyên bản nháp', () => {
    const b = base()
    expect(setDraftCurrency(b, 'JPY')).toBe(b)
  })
})

describe('patchDraftPhase / removeDraftPhase / addDraftPhase', () => {
  it('sửa năm bắt đầu thì sắp lại thứ tự chặng ngay', () => {
    const d = patchDraftPhase(base(), 'p2', { startYear: 2020 })
    expect(d.phases.map((p) => p.id)).toEqual(['p2', 'p1'])
  })

  it('chặng không còn thì trả về chính bản nháp', () => {
    const b = base()
    expect(patchDraftPhase(b, 'khong-co', { label: 'x' })).toBe(b)
  })

  it('chặng vừa thêm mang id nháp và nằm đúng chỗ theo năm', () => {
    const d = addDraftPhase(
      base(),
      {
        startYear: 2040,
        label: 'Chặng mới',
        country: 'JP',
        currency: 'JPY',
        annualIncomeMinor: 0,
        annualExpenseMinor: 0,
        fxToDisplay: 1,
      },
      7,
    )
    expect(d.phases.map((p) => p.startYear)).toEqual([2024, 2040, 2059])
    expect(isNewId(d.phases[1].id)).toBe(true)
  })

  it('chặng vừa thêm rồi xoá ngay KHÔNG sinh lệnh xoá (chưa từng có dòng DB)', () => {
    const added = addDraftPhase(
      base(),
      {
        startYear: 2040,
        label: 'Chặng mới',
        country: null,
        currency: 'JPY',
        annualIncomeMinor: 0,
        annualExpenseMinor: 0,
        fxToDisplay: 1,
      },
      7,
    )
    const id = added.phases.find((p) => isNewId(p.id))!.id
    const plan = planDraftSave(base(), removeDraftPhase(added, id))
    expect(plan.phaseDeletes).toEqual([])
    expect(savePlanIsEmpty(plan)).toBe(true)
  })

  it('xoá chặng có thật thành lệnh XOÁ', () => {
    const plan = planDraftSave(base(), removeDraftPhase(base(), 'p2'))
    expect(plan.phaseDeletes).toEqual(['p2'])
    expect(plan.phasePatches).toEqual([])
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
