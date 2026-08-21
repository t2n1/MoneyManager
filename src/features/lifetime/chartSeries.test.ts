import { describe, expect, it } from 'vitest'
import { buildChartData, capTicks, chartSeriesPlan, yearAxisTicks } from './chartSeries'
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

describe('yearAxisTicks', () => {
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i)

  it('39 năm → mỗi 5 năm, kèm mốc đầu và cuối', () => {
    expect(yearAxisTicks(range(2026, 2064))).toEqual([
      2026, 2030, 2035, 2040, 2045, 2050, 2055, 2060, 2064,
    ])
  })

  it('bỏ mốc chẵn đứng sát mốc đầu/cuối (nhãn chồng nhau ở hai đầu)', () => {
    // 2025 là bội của 5 và cũng là mốc đầu → không lặp lại; 2031 sát 2030 nên 2030 rơi.
    expect(yearAxisTicks(range(2025, 2031))).toEqual([2025, 2031])
    // Cách đủ nửa bước thì giữ: 2030 cách 2028 hai năm… vẫn dưới 2.5 → rơi.
    expect(yearAxisTicks(range(2028, 2041))).toEqual([2028, 2035, 2041])
  })

  it('chuỗi rất dài (>45 năm) đổi sang bước 10', () => {
    const t = yearAxisTicks(range(2026, 2086))
    expect(t[0]).toBe(2026)
    expect(t[t.length - 1]).toBe(2086)
    // 2030 rơi vì chỉ cách mốc đầu 4 năm — dưới nửa bước (5) nên hai nhãn sẽ chạm nhau.
    expect(t.slice(1, -1)).toEqual([2040, 2050, 2060, 2070, 2080])
  })

  it('chuỗi rỗng hoặc một năm', () => {
    expect(yearAxisTicks([])).toEqual([])
    expect(yearAxisTicks([2026])).toEqual([2026])
  })
})

describe('capTicks', () => {
  it('bộ đã đủ thưa thì trả nguyên', () => {
    expect(capTicks([2026, 2030, 2040], 5)).toEqual([2026, 2030, 2040])
  })

  it('luôn giữ mốc đầu và mốc cuối', () => {
    const out = capTicks([2026, 2030, 2040, 2050, 2060, 2070, 2080, 2084], 5)
    expect(out[0]).toBe(2026)
    expect(out[out.length - 1]).toBe(2084)
  })

  it('không vượt quá số nhãn cho phép', () => {
    const ticks = Array.from({ length: 40 }, (_, i) => 2026 + i)
    expect(capTicks(ticks, 5).length).toBeLessThanOrEqual(5)
  })

  it('giữ đúng thứ tự tăng và không lặp mốc', () => {
    const out = capTicks([2026, 2030, 2040, 2050, 2060, 2070, 2080, 2084], 5)
    expect(out).toEqual([...out].sort((a, b) => a - b))
    expect(new Set(out).size).toBe(out.length)
  })

  it('max nhỏ hơn 2 thì không thưa (không có bộ nào giữ được cả hai đầu)', () => {
    expect(capTicks([2026, 2040, 2080], 1)).toEqual([2026, 2040, 2080])
  })
})
