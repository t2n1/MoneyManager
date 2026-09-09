import { describe, expect, it } from 'vitest'
import { LIFE_PRESETS, type PresetContext } from './presets'
import { applySpanToResult, middleSpanYear } from './quickAddApply'
import { applySpanToPreset, type YearSpan } from './quickAddRange'

// Cùng bộ ngữ cảnh với `presetWeight.test.ts` — hai file kiểm hai mặt của CÙNG một mẫu
// đã dựng, nên chúng phải dựng từ cùng một điểm khởi đầu.
const ctx = (year: number): PresetContext => ({
  scenarioId: 's1',
  year,
  birthYear: 1994,
  currency: 'JPY',
  country: 'JP',
  currentIncomeMinor: 6_000_000,
  currentExpenseMinor: 4_000_000,
  fxToDisplay: 1,
  displayCurrency: 'JPY',
  fxOf: (c) => (c === 'VND' ? 1 / 172 : 1),
})

/** Đường ĐẦY ĐỦ của bảng chọn nhanh: khoảng → tham số → mẫu đã dựng → mẫu đã hấp thu. */
function fromSpan(id: string, span: YearSpan) {
  const preset = LIFE_PRESETS.find((p) => p.id === id)
  if (!preset) throw new Error(`Không có mẫu ${id}`)
  const apply = applySpanToPreset(id, span)
  return applySpanToResult(preset.build(ctx(apply.year)), apply)
}

/** `label → [start_year, end_year]` cho dễ đọc phần khẳng định. */
function ranges(events: readonly { label: string; start_year: number; end_year: number | null }[]) {
  return events.map((e) => [e.label, e.start_year, e.end_year] as const)
}

describe('middleSpanYear', () => {
  it('năm giữa trục — nút "Chọn mốc từ mẫu" của trạng thái rỗng mở bảng ở đây', () => {
    expect(middleSpanYear(2026, 2064)).toBe(2045)
  })
  it('khoảng lẻ vẫn ra một năm NGUYÊN (cột start_year là int)', () => {
    expect(middleSpanYear(2026, 2027)).toBe(2027)
    expect(Number.isInteger(middleSpanYear(2026, 2065))).toBe(true)
  })
})

describe('applySpanToResult — mẫu vay lấy khoảng làm KỲ HẠN', () => {
  it('mua-nha: khoản trả vay dài đúng số năm đã kéo, khoản trả trước KHÔNG dài ra', () => {
    const r = fromSpan('mua-nha', { startYear: 2034, endYear: 2053 }) // 20 năm
    expect(ranges(r.events)).toEqual([
      ['Trả trước mua nhà', 2034, 2034],
      ['Trả vay mua nhà', 2034, 2053],
    ])
  })

  it('mua-nha: kéo đúng 35 năm cho lại chính mặc định của mẫu', () => {
    const r = fromSpan('mua-nha', { startYear: 2034, endYear: 2068 })
    expect(r.events[1].end_year).toBe(2034 + 34)
  })

  it('mua-xe: khoảng vào `loan_years`, KHÔNG biến "tới hết đời" thành có hạn', () => {
    const r = fromSpan('mua-xe', { startYear: 2038, endYear: 2044 }) // 7 năm
    expect(r.events).toHaveLength(1)
    expect(r.events[0].loan_years).toBe(7)
    // Chi phí giữ xe chạy tới hết bản chiếu — xem lời ghi ở chính mẫu 'mua-xe'.
    expect(r.events[0].end_year).toBeNull()
  })
})

describe('applySpanToResult — sinh-con lấy khoảng làm TUỔI NUÔI TỚI', () => {
  it('kéo đúng 22 năm cho lại nguyên chùm mặc định', () => {
    const mac = LIFE_PRESETS.find((p) => p.id === 'sinh-con')!.build(ctx(2031))
    const r = fromSpan('sinh-con', { startYear: 2031, endYear: 2052 }) // untilAge 21
    expect(ranges(r.events)).toEqual(ranges(mac.events))
  })

  it('kéo ngắn hơn: mốc bắt đầu sau giới hạn bị BỎ, mốc vượt giới hạn bị CẮT', () => {
    const r = fromSpan('sinh-con', { startYear: 2031, endYear: 2041 }) // untilAge 10
    expect(ranges(r.events)).toEqual([
      // Trợ cấp trẻ em (2031–2049) cắt về 2041.
      ['Trợ cấp trẻ em (児童手当)', 2031, 2041],
      ['Nuôi con 0–6 tuổi', 2031, 2037],
      // Bậc 7–15 vốn tới 2046, cắt về 2041 — và nó là mốc dài nhất nên nó KÉO tới đúng đó.
      ['Nuôi con 7–15 tuổi', 2038, 2041],
    ])
    // Hai bậc bắt đầu 2047 và 2049 nằm sau giới hạn → không còn trong chùm.
    expect(r.events.some((e) => e.label === 'Con vào đại học')).toBe(false)
  })

  it('kéo dài hơn: bậc CUỐI kéo tới đúng năm đã kéo, các bậc trước đứng yên', () => {
    const r = fromSpan('sinh-con', { startYear: 2031, endYear: 2061 }) // untilAge 30
    const dh = r.events.find((e) => e.label === 'Con vào đại học')
    expect(dh?.end_year).toBe(2061)
    expect(r.events.find((e) => e.label === 'Nuôi con 0–6 tuổi')?.end_year).toBe(2037)
  })
})

describe('applySpanToResult — mẫu còn lại lấy nguyên hai đầu năm', () => {
  it('du-lich: mốc lặp kết thúc đúng năm đã kéo', () => {
    const r = fromSpan('du-lich', { startYear: 2030, endYear: 2036 })
    expect(ranges(r.events)).toEqual([['Du lịch', 2030, 2036]])
  })

  it('hoc-them: HAI mốc chạy song song cùng được kéo, không lệch nhau', () => {
    const r = fromSpan('hoc-them', { startYear: 2030, endYear: 2035 })
    expect(r.events.map((e) => e.end_year)).toEqual([2035, 2035])
  })

  it('cuoi: một khoản chi MỘT LẦN không bị kéo thành chi mỗi năm', () => {
    const r = fromSpan('cuoi', { startYear: 2029, endYear: 2039 })
    for (const e of r.events) expect(e.end_year).toBe(e.start_year)
    // Mẫu này còn sinh một CHẶNG — khoảng năm không đụng tới chặng.
    expect(r.phases).toHaveLength(1)
    expect(r.phases[0].start_year).toBe(2029)
  })

  it('nghi-huu: lương hưu "tới hết đời" ở lại null', () => {
    const r = fromSpan('nghi-huu', { startYear: 2056, endYear: 2064 })
    expect(r.events.every((e) => e.end_year === null)).toBe(true)
  })

  it('ho-tro-bo-me: khoảng ghi đè thời hạn 20 năm mặc định', () => {
    const r = fromSpan('ho-tro-bo-me', { startYear: 2030, endYear: 2040 })
    expect(r.events[0].end_year).toBe(2040)
  })
})

describe('applySpanToResult — bấm một chỗ (khoảng một năm)', () => {
  it('không áp kỳ hạn, không áp độ dài: mẫu ra đúng như mặc định', () => {
    const mac = LIFE_PRESETS.find((p) => p.id === 'mua-nha')!.build(ctx(2034))
    const r = fromSpan('mua-nha', { startYear: 2034, endYear: 2034 })
    expect(ranges(r.events)).toEqual(ranges(mac.events))
  })

  it('trả về CHÍNH đối tượng vào — không dựng lại mảng khi không có gì để áp', () => {
    const built = LIFE_PRESETS.find((p) => p.id === 'du-lich')!.build(ctx(2030))
    expect(applySpanToResult(built, { year: 2030 })).toBe(built)
  })
})
