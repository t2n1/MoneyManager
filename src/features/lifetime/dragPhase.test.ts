// Phát hiện review CUỐI NHÁNH 2026-09-09, Finding 1 (CRITICAL): đường ghi của một cú KÉO
// trên dải chặng đời đi qua HAI phép chặn, và phép thứ hai giành lấy kết quả.
//
// `PhaseLane` chặn đúng (`blockPhaseStartYearAtNeighbours`), rồi `TuongLaiPage` chặn LẠI
// bằng `clampPhaseStartYear` — hàm viết cho Ô NĂM GÕ TAY của dock, thứ DÒ năm trống gần
// nhất và mang theo hai bất biến mà một cú kéo không hề xin. Hai hệ quả đo được bằng số học
// (không phải phỏng đoán), cả hai đều dựng lại trong file này:
//
//   1. Kéo mép trái SANG TRÁI lại đẩy chặng SANG PHẢI, vượt qua hàng xóm — đúng cú đổi thứ
//      tự mà `blockPhaseStartYearAtNeighbours` được thêm vào để chặn.
//   2. Kéo GIỮA khối chặng ĐẦU ghi lại năm của nó mà KHÔNG kiểm trùng (nhánh `i === 0` của
//      `clampPhaseStartYear` trả nguyên `currentYear`), sinh hai chặng cùng `start_year` →
//      Lưu nổ `unique (scenario_id, start_year)` (migration 0031) ở rất xa cử chỉ gây ra.
//
// Chỉ vô hại khi `phases[0].startYear === currentYear` — mà `PlanDockPhase` ghi rõ một chặng
// đầu ở TƯƠNG LAI là dữ liệu thật, console không được lặng lẽ ghi đè.
import { describe, expect, it } from 'vitest'
import { draftFromRows, type ScenarioDraft } from './draft'
import { dragPhaseStart } from './dragPhase'
import { blockPhaseStartYearAtNeighbours, clampPhaseStartYear } from './phaseYear'
import type { LifePhaseRow, LifeScenarioRow } from '../../types/database.types'

/** Năm "hiện tại" của mọi ca dưới đây — cố định để phép thử không phụ thuộc đồng hồ. */
const NAY = 2026

const scenario: LifeScenarioRow = {
  id: 'sc1',
  user_id: 'u1',
  name: 'Hiện tại',
  display_currency: 'JPY',
  end_age: 90,
  real_return_bps: 200,
  band_spread_bps: 150,
  starting_assets_minor: 0,
  nominal_terms: false,
  is_primary: true,
  sort_order: 0,
  created_at: '2026-01-01',
}

const phaseRow = (id: string, startYear: number): LifePhaseRow => ({
  id,
  start_year: startYear,
  user_id: 'u1',
  scenario_id: 'sc1',
  label: `Chặng ${id}`,
  country: 'JP',
  currency: 'JPY',
  annual_income_minor: 6_000_000,
  annual_expense_minor: 4_000_000,
  income_pct_of_prev: null,
  expense_pct_of_prev: null,
  color: '',
  icon: '',
  fx_to_display: 1,
  created_at: '2026-01-01',
})

const draftOf = (...years: [string, number][]): ScenarioDraft =>
  draftFromRows(scenario, years.map(([id, y]) => phaseRow(id, y)), [])

/** Năm bắt đầu của một chặng trong nháp. */
const yearOf = (d: ScenarioDraft, id: string): number | undefined =>
  d.phases.find((p) => p.id === id)?.startYear

/**
 * ĐƯỜNG CŨ, dựng lại đúng như nhánh này từng ship: `PhaseLane` chặn tại hàng xóm rồi
 * `movePhaseStart` chặn LẠI bằng `clampPhaseStartYear`. Giữ trong phép thử (không trong
 * mã nguồn) để hai kết quả đứng cạnh nhau — nếu chỉ khẳng định con số ĐÚNG thì không có gì
 * nói rằng con số SAI từng ra khác.
 */
function duongCu(d: ScenarioDraft, id: string, wanted: number): number {
  const chanOPhaseLane = blockPhaseStartYearAtNeighbours(d.phases, id, wanted)
  return clampPhaseStartYear(d.phases, id, chanOPhaseLane, NAY)
}

describe('dragPhaseStart — Finding 1: kéo chỉ đi qua MỘT phép chặn', () => {
  it('kéo mép trái chặng 2026 SANG TRÁI thì đứng lại ở 2026, KHÔNG bị đẩy sang 2027 (vượt qua hàng xóm)', () => {
    // Ca đúng như finding: năm hiện tại 2026, hai chặng ở 2025 và 2026 (chặng đầu ở QUÁ
    // KHỨ — hình dạng dữ liệu mà `PlanDockPhase` nói là thật và không được ghi đè).
    const d = draftOf(['p1', 2025], ['p2', 2026])

    // Đường CŨ: chặn ở dải cho 2026, rồi `clampPhaseStartYear` tính
    // san = max(2026, 2025) + 1 = 2027 và trả 2027 — chặng đi NGƯỢC hướng kéo.
    expect(duongCu(d, 'p2', 2025)).toBe(2027)
    expect(duongCu(d, 'p2', 2025)).toBeGreaterThan(2026)

    // Đường MỚI: một phép chặn duy nhất, đứng yên tại 2026.
    expect(yearOf(dragPhaseStart(d, 'p2', 2025), 'p2')).toBe(2026)
  })

  it('có một chặng NẰM GIỮA thì đường cũ đẩy hẳn qua nó — đổi thứ tự (2025 · 2026 · 2027, kéo mép trái p2 sang trái)', () => {
    // Ba chặng liền năm. Đường CŨ: dải chặn cho 2026 (đúng), rồi `clampPhaseStartYear`
    // lấy sàn 2027, thấy 2027 đã là của p3, DÒ tiếp sang 2028 — p2 xếp SAU p3. Đúng cú
    // đổi thứ tự mà `blockPhaseStartYearAtNeighbours` sinh ra để chặn.
    const d = draftOf(['p1', 2025], ['p2', 2026], ['p3', 2027])
    expect(duongCu(d, 'p2', 2020)).toBe(2028)
    expect(duongCu(d, 'p2', 2020)).toBeGreaterThan(2027) // vượt qua p3

    // Đường MỚI: đứng yên tại 2026, thứ tự ba chặng không đổi.
    const sau = dragPhaseStart(d, 'p2', 2020)
    expect(yearOf(sau, 'p2')).toBe(2026)
    expect(sau.phases.map((p) => p.id)).toEqual(['p1', 'p2', 'p3'])
  })

  it('kéo GIỮA khối chặng ĐẦU không bao giờ sinh hai chặng cùng năm (nhánh i === 0 của clampPhaseStartYear không kiểm trùng)', () => {
    const d = draftOf(['p1', 2025], ['p2', 2026])

    // Đường CŨ: dải chặn trả nguyên 2025 (chặng đầu không dời), rồi `clampPhaseStartYear`
    // rơi vào Bất biến 1 và trả `currentYear` = 2026 — ĐÚNG năm p2 đang giữ.
    expect(duongCu(d, 'p1', 2025)).toBe(2026)
    expect(duongCu(d, 'p1', 2025)).toBe(yearOf(d, 'p2'))

    // Đường MỚI: chặng đầu đứng yên, và không có hai chặng nào trùng năm.
    const sau = dragPhaseStart(d, 'p1', 2025)
    expect(yearOf(sau, 'p1')).toBe(2025)
    const nam = sau.phases.map((p) => p.startYear)
    expect(new Set(nam).size).toBe(nam.length)
  })

  it('kéo giữa khối chặng ĐẦU ở mọi hướng đều giữ nguyên năm và giữ nguyên tính duy nhất', () => {
    const d = draftOf(['p1', 2025], ['p2', 2026], ['p3', 2030])
    for (const wanted of [1900, 2024, 2026, 2030, 2200]) {
      const sau = dragPhaseStart(d, 'p1', wanted)
      expect(yearOf(sau, 'p1')).toBe(2025)
      const nam = sau.phases.map((p) => p.startYear)
      expect(new Set(nam).size).toBe(nam.length)
    }
  })

  it('kéo bình thường vẫn chặn ĐÚNG tại hàng xóm — không hỏng đường đã sửa ở vòng review trước', () => {
    const d = draftOf(['p1', 2026], ['p2', 2035], ['p3', 2059])
    expect(yearOf(dragPhaseStart(d, 'p2', 2070), 'p2')).toBe(2058) // chặn bởi p3
    expect(yearOf(dragPhaseStart(d, 'p2', 1990), 'p2')).toBe(2027) // chặn bởi p1
    expect(yearOf(dragPhaseStart(d, 'p2', 2040), 'p2')).toBe(2040) // trong khoảng: đi đúng
  })

  it('chặn theo mảng chặng CỦA CHÍNH BẢN NHÁP truyền vào, nên hai lượt kéo liên tiếp không dựa trên một mảng cũ', () => {
    // Đây là nửa thứ hai của finding: `movePhaseStart` chặn trong mutator theo `d.phases`
    // đúng vì lượt kéo gộp theo nhịp khung hình. Ghi lại thành phép thử: kéo p2 tới sát p3
    // rồi kéo TIẾP trên KẾT QUẢ vừa ra — lượt sau phải đọc năm mới của p2, không phải năm cũ.
    const d1 = dragPhaseStart(draftOf(['p1', 2026], ['p2', 2035], ['p3', 2059]), 'p2', 2058)
    expect(yearOf(d1, 'p2')).toBe(2058)
    const d2 = dragPhaseStart(d1, 'p3', 2058)
    expect(yearOf(d2, 'p3')).toBe(2059) // đứng yên: 2058 đã là của p2, khoảng mở rỗng
    expect(new Set(d2.phases.map((p) => p.startYear)).size).toBe(3)
  })

  it('id không có trong nháp thì trả nguyên bản nháp, không ném lỗi', () => {
    const d = draftOf(['p1', 2026], ['p2', 2035])
    expect(dragPhaseStart(d, 'khong-co', 2040)).toBe(d)
  })

  it('năm gõ dở / không phải số (NaN) thì giữ năm đang có', () => {
    const d = draftOf(['p1', 2026], ['p2', 2035])
    expect(yearOf(dragPhaseStart(d, 'p2', Number.NaN), 'p2')).toBe(2035)
  })
})

describe('Ô NĂM trong dock giữ nguyên hành vi DÒ-NĂM-TRỐNG (quyết định đã chốt, không gộp với đường kéo)', () => {
  // Phần này KHÔNG được đổi theo bản sửa Finding 1: gõ một năm cụ thể vào ô là hành động
  // rõ ràng, có chủ đích, và người dùng thấy ngay số mới trong ô — nên nó được phép nhảy
  // tới năm trống gần nhất. Chỉ cú KÉO là bị chặn tại hàng xóm.
  const chang = [
    { id: 'p1', startYear: 2026 },
    { id: 'p2', startYear: 2035 },
    { id: 'p3', startYear: 2036 },
  ]

  it('gõ 2070 vào ô năm của p2 vẫn nhận 2070 (nhảy qua p3), khác hẳn đường kéo', () => {
    expect(clampPhaseStartYear(chang, 'p2', 2070, NAY)).toBe(2070)
    expect(blockPhaseStartYearAtNeighbours(chang, 'p2', 2070)).toBe(2035)
  })

  it('gõ đúng năm hàng xóm (2036) vào ô năm của p2 vẫn DÒ sang 2037, không đứng yên', () => {
    expect(clampPhaseStartYear(chang, 'p2', 2036, NAY)).toBe(2037)
  })

  it('ô năm của chặng ĐẦU vẫn khoá ở năm hiện tại — dock hiện nó thành chữ tĩnh, không ô nhập', () => {
    expect(clampPhaseStartYear(chang, 'p1', 2040, NAY)).toBe(NAY)
  })
})
