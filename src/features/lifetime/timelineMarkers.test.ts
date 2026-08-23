// Thứ tự các chip trên dải "Mốc cuộc đời". Luật ngắn nhưng KHÔNG hiển nhiên: hai loại
// mốc khác bảng, khác kiểu, và luật hoà khi trùng năm là thứ đọc code không đoán ra.
import { describe, expect, it } from 'vitest'
import type { LifeEventRow, LifePhaseRow } from '../../types/database.types'
import { buildMarkers } from './timelineMarkers'

const SCENARIO = 's1'

function phase(startYear: number, label: string): LifePhaseRow {
  return {
    id: `p-${label}`,
    user_id: 'u1',
    created_at: '2026-01-01T00:00:00Z',
    scenario_id: SCENARIO,
    start_year: startYear,
    label,
    country: null,
    currency: 'JPY',
    annual_income_minor: 0,
    annual_expense_minor: 0,
    fx_to_display: 1,
  }
}

function event(startYear: number, label: string): LifeEventRow {
  return {
    id: `e-${label}`,
    user_id: 'u1',
    created_at: '2026-01-01T00:00:00Z',
    scenario_id: SCENARIO,
    start_year: startYear,
    end_year: null,
    kind: 'expense',
    amount_minor: 0,
    currency: 'JPY',
    label,
    note: '',
    fx_to_display: 1,
    inflate: true,
  }
}

describe('buildMarkers', () => {
  it('sắp theo năm, gộp cả hai loại', () => {
    const m = buildMarkers([phase(2026, 'Hiện tại'), phase(2040, 'Nghỉ hưu')], [
      event(2030, 'Cưới'),
      event(2034, 'Sinh con'),
    ])
    expect(m.map((x) => x.year)).toEqual([2026, 2030, 2034, 2040])
  })

  it('trùng năm thì chặng đứng trước sự kiện', () => {
    // Chặng là thứ BẮT ĐẦU năm đó (chuyển nước), sự kiện là khoản tiền trong lòng nó —
    // đọc ngược lại thì dải kể chuyện sai thứ tự.
    const m = buildMarkers([phase(2030, 'Sang Mỹ')], [event(2030, 'Phí chuyển nhà')])
    expect(m.map((x) => x.kind)).toEqual(['phase', 'event'])
  })

  it('không sắp theo thứ tự mảng đầu vào', () => {
    // `getLifePhases()`/`getLifeEvents()` không hứa thứ tự nào, và demoRepo không có
    // `order by` — dải phải tự sắp, không mượn thứ tự của tầng dữ liệu.
    const m = buildMarkers([phase(2045, 'Sau'), phase(2026, 'Trước')], [])
    expect(m.map((x) => x.year)).toEqual([2026, 2045])
  })

  it('rỗng cả hai đầu vào thì rỗng', () => {
    expect(buildMarkers([], [])).toEqual([])
  })
})
