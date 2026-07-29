import { describe, expect, it } from 'vitest'
import { buildChartData, chartSeriesPlan } from './chartSeries'
import type { YearRow } from './project'
import type { NetWorthSnapshotRow } from '../../types/database.types'

function row(year: number, end: number): YearRow {
  return {
    year,
    age: year - 1994,
    country: 'JP',
    phaseLabel: 'Hiện tại',
    incomeMinor: 6_000_000,
    expenseMinor: 4_000_000,
    events: [],
    netFlowMinor: 2_000_000,
    assetsEndMinor: end,
    assetsPessimisticMinor: end - 1_000_000,
    assetsOptimisticMinor: end + 1_000_000,
  }
}

function snapshot(on: string, netWorth: number): NetWorthSnapshotRow {
  return {
    id: on,
    user_id: 'u1',
    snapshot_on: on,
    net_worth: netWorth,
    created_at: `${on}T00:00:00Z`,
  }
}

describe('chartSeriesPlan', () => {
  it('cùng đơn vị tiền: vẽ cả lịch sử lẫn đường so sánh, không câu rào nào', () => {
    const plan = chartSeriesPlan({
      currency: 'JPY',
      historyCurrency: 'JPY',
      compareCurrency: 'JPY',
      compareRows: [row(2026, 7_000_000)],
    })
    expect(plan.showHistory).toBe(true)
    expect(plan.showCompare).toBe(true)
    expect(plan.historyHiddenNote).toBeNull()
    expect(plan.compareHiddenNote).toBeNull()
  })

  // ĐÂY là ca lỗi thật: kịch bản JPY so với bản sao USD. Trước khi có câu rào này,
  // <Line dataKey="compare"> vẫn được vẽ — một chuỗi số USD trên trục ¥.
  it('kịch bản so sánh khác đơn vị tiền: ẨN đường so sánh và nói ra lý do', () => {
    const plan = chartSeriesPlan({
      currency: 'JPY',
      historyCurrency: 'JPY',
      compareCurrency: 'USD',
      compareRows: [row(2026, 7_000_000)],
    })
    expect(plan.showCompare).toBe(false)
    expect(plan.compareHiddenNote).not.toBeNull()
    // Câu rào phải gọi TÊN cả hai đơn vị, không chỉ nói "khác đơn vị" chung chung.
    expect(plan.compareHiddenNote).toContain('USD')
    expect(plan.compareHiddenNote).toContain('JPY')
  })

  // Dải dao động bị ẩn là để hai dải khỏi chồng nhau. Đường so sánh đã ẩn thì chỉ còn
  // một kịch bản trên đồ thị, không có gì chồng — dải phải hiện lại, và `minY` (vùng
  // âm đỏ) tính theo nó chứ không theo một chuỗi số ngoại tệ.
  it('ẩn đường so sánh vì lệch tiền thì DẢI DAO ĐỘNG hiện lại', () => {
    const mismatch = chartSeriesPlan({
      currency: 'JPY',
      historyCurrency: 'JPY',
      compareCurrency: 'USD',
      compareRows: [row(2026, 7_000_000)],
    })
    expect(mismatch.showBand).toBe(true)

    const sameCurrency = chartSeriesPlan({
      currency: 'JPY',
      historyCurrency: 'JPY',
      compareCurrency: 'JPY',
      compareRows: [row(2026, 7_000_000)],
    })
    expect(sameCurrency.showBand).toBe(false)
  })

  it('chưa bật so sánh: không vẽ đường so sánh, không câu rào, dải vẫn hiện', () => {
    const plan = chartSeriesPlan({
      currency: 'JPY',
      historyCurrency: 'JPY',
      compareCurrency: null,
      compareRows: null,
    })
    expect(plan.showCompare).toBe(false)
    expect(plan.showBand).toBe(true)
    // Chưa bật so sánh thì KHÔNG được hiện câu "đường so sánh đang ẩn" — không có
    // đường nào để mà ẩn, câu đó sẽ nói về một thứ người dùng chưa hề bật.
    expect(plan.compareHiddenNote).toBeNull()
  })

  it('lịch sử khác đơn vị tiền: ẩn lịch sử, độc lập với chuyện so sánh', () => {
    const plan = chartSeriesPlan({
      currency: 'USD',
      historyCurrency: 'JPY',
      compareCurrency: 'USD',
      compareRows: [row(2026, 7_000_000)],
    })
    expect(plan.showHistory).toBe(false)
    expect(plan.historyHiddenNote).toContain('JPY')
    // Bản so sánh cùng USD với đồ thị → vẫn vẽ được, chuyện lịch sử không liên quan.
    expect(plan.showCompare).toBe(true)
    expect(plan.compareHiddenNote).toBeNull()
  })

  // ĐÂY là ca lỗi thật thứ hai của chuỗi so sánh: `projectScenario` trả `[]` cho một
  // kịch bản đã bị XOÁ (compareId còn trỏ vào nó) hoặc cho một kịch bản không có chặng
  // nào — mà `[]` khác `null`, nên bản trước coi là "đang so sánh" và TẮT dải dao động.
  // Mất dải là mất cả chú giải của nó VÀ số hạng biên dưới trong `minY`, tức vùng âm đỏ
  // co lại hoặc biến mất: cảnh báo nhánh bi quan tắt mà không câu nào nói ra.
  it('bản chiếu so sánh RỖNG: không tính là so sánh, DẢI DAO ĐỘNG vẫn hiện', () => {
    const plan = chartSeriesPlan({
      currency: 'JPY',
      historyCurrency: 'JPY',
      compareCurrency: 'JPY',
      compareRows: [],
    })
    expect(plan.showCompare).toBe(false)
    expect(plan.showBand).toBe(true)
    // Phải NÓI RA lý do, và nói đúng lý do: rỗng, không phải lệch đơn vị tiền.
    expect(plan.compareEmptyNote).not.toBeNull()
    expect(plan.compareHiddenNote).toBeNull()
  })

  // Rỗng VÀ lệch đơn vị cùng lúc (so với một kịch bản USD chưa có chặng nào): chỉ được
  // nói một câu, và phải là câu rỗng — câu "khác đơn vị tiền" đẩy người dùng đi khai tỷ
  // giá trong khi việc phải làm là thêm chặng đời cho kịch bản kia.
  it('rỗng thì KHÔNG báo lý do lệch đơn vị tiền, dù đơn vị có lệch thật', () => {
    const plan = chartSeriesPlan({
      currency: 'JPY',
      historyCurrency: 'JPY',
      compareCurrency: 'USD',
      compareRows: [],
    })
    expect(plan.compareHiddenNote).toBeNull()
    expect(plan.compareEmptyNote).not.toBeNull()
    expect(plan.showBand).toBe(true)
  })

  it('chưa bật so sánh thì KHÔNG có câu "rỗng" — không có gì để mà rỗng', () => {
    const plan = chartSeriesPlan({
      currency: 'JPY',
      historyCurrency: 'JPY',
      compareCurrency: null,
      compareRows: null,
    })
    expect(plan.compareEmptyNote).toBeNull()
  })

  it('thiếu compareCurrency (không biết đơn vị) thì vẫn vẽ — chưa biết khác với biết là lệch', () => {
    const plan = chartSeriesPlan({
      currency: 'JPY',
      historyCurrency: 'JPY',
      compareCurrency: undefined,
      compareRows: [row(2026, 7_000_000)],
    })
    expect(plan.showCompare).toBe(true)
    expect(plan.compareHiddenNote).toBeNull()
  })
})

describe('buildChartData', () => {
  it('gộp lịch sử và bản chiếu theo năm, giữ cả năm chỉ có lịch sử', () => {
    const data = buildChartData(
      [row(2026, 11_000_000), row(2027, 13_000_000)],
      [snapshot('2024-06-30', 9_000_000)],
      null,
    )
    expect(data.map((d) => d.year)).toEqual([2024, 2026, 2027])
    expect(data[0].actual).toBe(9_000_000)
    expect(data[0].projected).toBeNull()
    expect(data[1].projected).toBe(11_000_000)
    expect(data[1].band).toEqual([10_000_000, 12_000_000])
    expect(data[1].compare).toBeNull()
  })

  it('nhiều snapshot cùng năm thì giữ bản MỚI NHẤT trong năm đó', () => {
    const data = buildChartData(
      [row(2026, 11_000_000)],
      [snapshot('2026-01-31', 1_000_000), snapshot('2026-12-31', 2_000_000)],
      null,
    )
    expect(data).toHaveLength(1)
    expect(data[0].actual).toBe(2_000_000)
  })

  it('có bản so sánh thì điền cột compare theo năm khớp', () => {
    const data = buildChartData([row(2026, 11_000_000)], [], [row(2026, 7_000_000)])
    expect(data[0].compare).toBe(7_000_000)
  })
})
