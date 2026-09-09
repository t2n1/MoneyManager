import { describe, expect, it } from 'vitest'
import { MAX_PHASE_YEAR, clampPhaseStartYear, type PhaseYearSlot } from './phaseYear'

const NAY = 2026

const chang: PhaseYearSlot[] = [
  { id: 'p1', startYear: 2026 },
  { id: 'p2', startYear: 2035 },
  { id: 'p3', startYear: 2059 },
]

describe('clampPhaseStartYear', () => {
  it('chặng đầu luôn về năm hiện tại, gõ gì cũng vậy', () => {
    expect(clampPhaseStartYear(chang, 'p1', 2040, NAY)).toBe(NAY)
    expect(clampPhaseStartYear(chang, 'p1', 1990, NAY)).toBe(NAY)
  })

  it('chặng sau nhận đúng năm gõ khi năm đó trống', () => {
    expect(clampPhaseStartYear(chang, 'p2', 2038, NAY)).toBe(2038)
  })

  it('không lùi được về quá khứ hay về đúng năm hiện tại', () => {
    // Sàn là NĂM SAU hôm nay: chặng đang chạy là chặng đầu, một chặng thứ hai trùng
    // năm hiện tại sẽ giành chỗ của nó.
    expect(clampPhaseStartYear(chang, 'p2', 2010, NAY)).toBe(NAY + 1)
    expect(clampPhaseStartYear(chang, 'p2', NAY, NAY)).toBe(NAY + 1)
  })

  it('trùng năm chặng khác thì nhích LÊN một năm, không ném lỗi', () => {
    // `unique (scenario_id, start_year)` — trả về năm trùng là để lệnh Lưu nổ ở Postgres.
    expect(clampPhaseStartYear(chang, 'p2', 2059, NAY)).toBe(2060)
  })

  it('kẹt giữa một dãy chặng liền năm thì dò tiếp, và hoà thì chọn phía TĂNG', () => {
    const day: PhaseYearSlot[] = [
      { id: 'p1', startYear: 2026 },
      { id: 'p2', startYear: 2028 },
      { id: 'p3', startYear: 2030 },
      { id: 'p4', startYear: 2031 },
      { id: 'p5', startYear: 2032 },
    ]
    // 2031 đã có chặng; 2030 và 2032 cũng vậy. Hai năm trống gần nhất cách đều nhau
    // (2029 và 2033) — chọn 2033, vì gõ trùng một chặng gần như luôn là ý "sau chặng đó".
    expect(clampPhaseStartYear(day, 'p2', 2031, NAY)).toBe(2033)
  })

  it('trùng nhưng năm CỦA CHÍNH NÓ còn trống thì lùi về đúng năm đó', () => {
    // Năm đang có của chính chặng không nằm trong tập "đang dùng", nên nó là ứng viên
    // hợp lệ và gần nhất — tức gõ trùng chặng liền sau thì chặng đứng yên, không nhảy.
    const day: PhaseYearSlot[] = [
      { id: 'p1', startYear: 2026 },
      { id: 'p2', startYear: 2030 },
      { id: 'p3', startYear: 2031 },
      { id: 'p4', startYear: 2032 },
    ]
    expect(clampPhaseStartYear(day, 'p2', 2031, NAY)).toBe(2030)
  })

  it('sát trần thì dò XUỐNG, không vượt 2200', () => {
    const tran: PhaseYearSlot[] = [
      { id: 'p1', startYear: 2026 },
      { id: 'p2', startYear: 2100 },
      { id: 'p3', startYear: MAX_PHASE_YEAR },
    ]
    expect(clampPhaseStartYear(tran, 'p2', 3000, NAY)).toBe(MAX_PHASE_YEAR - 1)
  })

  it('gõ dở (NaN) thì giữ năm đang có, không kéo về hôm nay', () => {
    expect(clampPhaseStartYear(chang, 'p3', Number.NaN, NAY)).toBe(2059)
  })

  it('chặng không có trong danh sách vẫn trả một năm dùng được', () => {
    expect(clampPhaseStartYear(chang, 'khong-co', 2044, NAY)).toBe(2044)
  })

  it('làm tròn năm lẻ', () => {
    expect(clampPhaseStartYear(chang, 'p2', 2038.6, NAY)).toBe(2039)
  })
})
