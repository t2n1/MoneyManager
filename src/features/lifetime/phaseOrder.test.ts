// Đổi chỗ chặng đời (`phaseOrder.ts`). Ba thứ được canh ở đây, theo đúng thứ tự quan trọng:
//
//   1. BA BẤT BIẾN của bố cục: tổng số năm không đổi · chặng sớm nhất giữ nguyên năm neo ·
//      không có hai chặng trùng năm. Đây là thứ nếu vỡ thì lệnh Lưu nổ ở Postgres
//      (`unique (scenario_id, start_year)`, migration 0031) hoặc trục bị hở, cả hai đều ở
//      rất xa cử chỉ gây ra.
//   2. LUẬT CHỌN CHỖ theo mép trái, kèm CA SỐ HỌC dựng lại đúng lý do đã bỏ luật "theo tâm
//      khối" — không phải khẩu vị, hai luật cho hai con số khác nhau trên cùng dữ liệu.
//   3. `setPhaseStarts` chỉ ghi khi ĐỦ BỘ — chỗ chặn cho ca ảnh chụp đã cũ.
import { describe, expect, it } from 'vitest'
import { draftFromRows, type ScenarioDraft } from './draft'
import { phaseDropIndex, phaseSpans, reorderPhaseStarts, setPhaseStarts } from './phaseOrder'
import type { PhaseYearSlot } from './phaseYear'
import type { LifePhaseRow, LifeScenarioRow } from '../../types/database.types'

/** Bố cục của chính ví dụ đã đưa cho người dùng chọn (2026-09-10), giữ nguyên con số:
 *  Đi làm 2026–2035 (10 năm) · Cưới 2036–2040 (5) · Mỹ 2041–2065 (25), hết đời 2065. */
const HET_DOI = 2065
const chang: PhaseYearSlot[] = [
  { id: 'lam', startYear: 2026 },
  { id: 'cuoi', startYear: 2036 },
  { id: 'my', startYear: 2041 },
]

describe('phaseSpans', () => {
  it('số năm suy ra từ chặng kế tiếp; chặng CUỐI đọc tới hết bản chiếu', () => {
    expect(phaseSpans(chang, HET_DOI)).toEqual([
      { id: 'lam', startYear: 2026, years: 10 },
      { id: 'cuoi', startYear: 2036, years: 5 },
      { id: 'my', startYear: 2041, years: 25 },
    ])
  })

  it('sắp theo năm, không theo thứ tự mảng vào', () => {
    expect(phaseSpans([chang[2], chang[0], chang[1]], HET_DOI).map((s) => s.id)).toEqual([
      'lam',
      'cuoi',
      'my',
    ])
  })

  it('chặng bắt đầu SAU hết đời (dữ liệu méo) vẫn ra số năm ≥ 1 — Bất biến 3', () => {
    // Số năm 0 hay âm sẽ cho hai chặng trùng `start_year` ở bước cộng dồn, tức lệnh Lưu nổ
    // ở Postgres xa chỗ bấm. Sàn 1 năm cho một bố cục hợp lệ trên dữ liệu không hợp lệ.
    const spans = phaseSpans([{ id: 'a', startYear: 2026 }, { id: 'b', startYear: 2100 }], HET_DOI)
    expect(spans[1].years).toBe(1)
  })

  it('một chặng duy nhất chiếm trọn bản chiếu', () => {
    expect(phaseSpans([{ id: 'a', startYear: 2026 }], HET_DOI)).toEqual([
      { id: 'a', startYear: 2026, years: 40 },
    ])
  })
})

describe('phaseDropIndex — MÉP DẪN ĐẦU vượt qua TÂM chặng bên cạnh', () => {
  const spans = phaseSpans(chang, HET_DOI)
  // Tâm: Đi làm 2031 · Cưới 2038,5 · Mỹ 2053,5.

  it('chưa dời thì vẫn là chỗ đang đứng (không có gì đổi)', () => {
    expect(phaseDropIndex(spans, 'my', 0)).toBe(2)
    expect(phaseDropIndex(spans, 'lam', 0)).toBe(0)
    expect(phaseDropIndex(spans, 'cuoi', 0)).toBe(1)
  })

  it('kéo "Mỹ" sang trái: chưa qua tâm "Cưới" thì đứng yên, qua rồi mới tráo', () => {
    // Mép trái 2041 + d phải vượt qua tâm Cưới 2038,5 → cần d ≤ −3, tức NỬA bề rộng của
    // Cưới (5 năm) cộng khoảng cách hai mép — không phải cả bề rộng của Mỹ.
    expect(phaseDropIndex(spans, 'my', -1)).toBe(2)
    expect(phaseDropIndex(spans, 'my', -2)).toBe(2)
    expect(phaseDropIndex(spans, 'my', -3)).toBe(1)
    expect(phaseDropIndex(spans, 'my', -10)).toBe(1)
  })

  it('kéo tiếp qua tâm "Đi làm" thì mới lên đầu', () => {
    expect(phaseDropIndex(spans, 'my', -11)).toBe(0)
    expect(phaseDropIndex(spans, 'my', -50)).toBe(0)
  })

  it('HAI CHIỀU CÙNG GIÁ — đây là cái mà luật "mép trái" đã ship rồi bỏ không làm được', () => {
    // Cưới rộng 5 năm, tâm 2038,5. Kéo Mỹ qua nó:
    //   sang TRÁI: mép trái 2041 + d < 2038,5  → d = −3
    //   sang PHẢI: (Mỹ là chặng cuối nên lấy Cưới làm chủ thể cho phép đo đối xứng)
    // Đo bằng Cưới đi qua Mỹ (tâm 2053,5): mép phải 2040 + d > 2053,5 → d = +14, đúng
    // nửa bề rộng của Mỹ (12,5) — cùng một quy luật "nửa bề rộng hàng xóm", không phụ
    // thuộc chiều kéo.
    expect(phaseDropIndex(spans, 'my', -3)).toBe(1)
    expect(phaseDropIndex(spans, 'cuoi', 13)).toBe(1)
    expect(phaseDropIndex(spans, 'cuoi', 14)).toBe(2)
    // Luật CŨ (mép trái cho cả hai chiều) đòi mép trái Cưới rơi vào ô năm 2041–2065 của
    // Mỹ, tức d ≥ +5 — rẻ hơn hẳn một chiều và đắt hơn hẳn chiều kia:
    expect(spans[2].startYear - spans[1].startYear).toBe(5)
  })

  it('kéo "Đi làm" sang phải: qua tâm Cưới rồi qua tâm Mỹ', () => {
    // Mép phải 2035 + d > tâm Cưới 2038,5 → d ≥ 4; > tâm Mỹ 2053,5 → d ≥ 19.
    expect(phaseDropIndex(spans, 'lam', 3)).toBe(0)
    expect(phaseDropIndex(spans, 'lam', 4)).toBe(1)
    expect(phaseDropIndex(spans, 'lam', 18)).toBe(1)
    expect(phaseDropIndex(spans, 'lam', 19)).toBe(2)
  })

  it('kéo quá tay ra ngoài hai đầu trục thì dừng ở chặng đầu / chặng cuối, không thành "không làm gì"', () => {
    expect(phaseDropIndex(spans, 'my', -999)).toBe(0)
    expect(phaseDropIndex(spans, 'lam', 999)).toBe(2)
  })

  it('chặng không còn trong ảnh chụp (vừa bị xoá giữa lượt kéo) → -1, chỗ gọi không ghi gì', () => {
    expect(phaseDropIndex(spans, 'khong-co', -3)).toBe(-1)
    expect(phaseDropIndex([], 'my', -3)).toBe(-1)
  })

  it('độ lệch không phải số (khung hình lỗi) thì đứng yên, không nhảy về đầu trục', () => {
    expect(phaseDropIndex(spans, 'my', Number.NaN)).toBe(2)
  })

  it('một chặng duy nhất thì kéo đi đâu cũng đứng yên', () => {
    const mot = phaseSpans([{ id: 'a', startYear: 2026 }], HET_DOI)
    expect(phaseDropIndex(mot, 'a', -30)).toBe(0)
    expect(phaseDropIndex(mot, 'a', 30)).toBe(0)
  })
})

describe('reorderPhaseStarts — bố cục mới', () => {
  const spans = phaseSpans(chang, HET_DOI)

  it('ĐÚNG ví dụ đã chốt với người dùng: kéo "Mỹ" lên trước "Cưới" — mỗi chặng giữ số năm của mình', () => {
    expect(reorderPhaseStarts(spans, 'my', 1)).toEqual([
      { id: 'lam', startYear: 2026 }, // 10 năm, không đổi
      { id: 'my', startYear: 2036 }, // giữ 25 năm → 2036–2060
      { id: 'cuoi', startYear: 2061 }, // giữ 5 năm → 2061–2065, dồn ra cuối
    ])
  })

  it('Bất biến 1: tổng số năm không đổi, nên chặng cuối của thứ tự MỚI kết thúc đúng ở hết đời', () => {
    const moi = reorderPhaseStarts(spans, 'my', 1)
    const soNam = new Map(spans.map((s) => [s.id, s.years]))
    const cuoi = moi[moi.length - 1]
    expect(cuoi.startYear + (soNam.get(cuoi.id) ?? 0) - 1).toBe(HET_DOI)
  })

  it('Bất biến 2: chặng SỚM NHẤT của thứ tự mới nhận đúng năm neo, kể cả khi chặng đầu bị đẩy ra sau', () => {
    const moi = reorderPhaseStarts(spans, 'lam', 2)
    expect(moi.map((s) => s.id)).toEqual(['cuoi', 'my', 'lam'])
    expect(moi[0].startYear).toBe(2026)
    // Cưới 5 năm (2026–2030) · Mỹ 25 năm (2031–2055) · Đi làm 10 năm (2056–2065).
    expect(moi).toEqual([
      { id: 'cuoi', startYear: 2026 },
      { id: 'my', startYear: 2031 },
      { id: 'lam', startYear: 2056 },
    ])
  })

  it('Bất biến 3: không có hai năm bắt đầu trùng nhau, ở mọi hoán vị của một dãy chặng LIỀN NĂM', () => {
    // Dãy sát nhau nhất có thể (mỗi chặng 1 năm) — ca dễ sinh trùng nhất.
    const sat = phaseSpans(
      [
        { id: 'a', startYear: 2026 },
        { id: 'b', startYear: 2027 },
        { id: 'c', startYear: 2028 },
      ],
      HET_DOI,
    )
    for (const id of ['a', 'b', 'c']) {
      for (let to = 0; to < 3; to++) {
        const moi = reorderPhaseStarts(sat, id, to)
        if (moi.length === 0) continue
        expect(new Set(moi.map((s) => s.startYear)).size).toBe(moi.length)
      }
    }
  })

  it('khớp với `phaseDropIndex`: rút C chèn ở 1 ra A·C·B, rút A chèn ở 1 ra B·A·C', () => {
    expect(reorderPhaseStarts(spans, 'my', 1).map((s) => s.id)).toEqual(['lam', 'my', 'cuoi'])
    expect(reorderPhaseStarts(spans, 'lam', 1).map((s) => s.id)).toEqual(['cuoi', 'lam', 'my'])
  })

  it('KÉO VỀ chỗ cũ trả về bố cục GỐC, không phải mảng rỗng — lỗi đo được trên trình duyệt 2026-09-10', () => {
    // Bản đầu trả rỗng ở đây, chỗ ghi hiểu rỗng là "đừng ghi", nên kéo đi rồi kéo VỀ lại
    // đứng ở bố cục của khung hình trước. Đó là đường thoát duy nhất của một cú lỡ tay.
    expect(reorderPhaseStarts(spans, 'my', 2)).toEqual([
      { id: 'lam', startYear: 2026 },
      { id: 'cuoi', startYear: 2036 },
      { id: 'my', startYear: 2041 },
    ])
    // Và bố cục gốc đó bằng ĐÚNG năm đang có của ảnh chụp — ghi lại là một phép ghi vô hại.
    expect(reorderPhaseStarts(spans, 'my', 2)).toEqual(
      spans.map((s) => ({ id: s.id, startYear: s.startYear })),
    )
  })

  it('mảng RỖNG chỉ còn nghĩa "không có gì để tính"', () => {
    expect(reorderPhaseStarts(spans, 'khong-co', 0)).toEqual([])
    expect(reorderPhaseStarts(phaseSpans([chang[0]], HET_DOI), 'lam', 0)).toEqual([])
  })

  it('vị trí ngoài khoảng thì kẹp, không ném lỗi', () => {
    expect(reorderPhaseStarts(spans, 'my', -5).map((s) => s.id)).toEqual(['my', 'lam', 'cuoi'])
    expect(reorderPhaseStarts(spans, 'lam', 99).map((s) => s.id)).toEqual(['cuoi', 'my', 'lam'])
  })
})

// --- setPhaseStarts: ghi vào nháp ------------------------------------------------------

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
  draftFromRows(
    scenario,
    years.map(([id, y]) => phaseRow(id, y)),
    [],
  )

describe('setPhaseStarts', () => {
  it('ghi cả bố cục một lần và SẮP LẠI theo năm — thứ tự mới là thứ người dùng vừa đổi', () => {
    const d = draftOf(['lam', 2026], ['cuoi', 2036], ['my', 2041])
    const sau = setPhaseStarts(d, reorderPhaseStarts(phaseSpans(d.phases, HET_DOI), 'my', 1))
    expect(sau.phases.map((p) => [p.id, p.startYear])).toEqual([
      ['lam', 2026],
      ['my', 2036],
      ['cuoi', 2061],
    ])
  })

  it('THIẾU một chặng (ảnh chụp cũ hơn danh sách) → trả nguyên bản nháp, không ghi nửa bố cục', () => {
    const d = draftOf(['lam', 2026], ['cuoi', 2036], ['my', 2041])
    expect(setPhaseStarts(d, [{ id: 'lam', startYear: 2026 }, { id: 'my', startYear: 2036 }])).toBe(d)
  })

  it('THỪA một chặng lạ (ảnh chụp mới hơn danh sách) → trả nguyên bản nháp', () => {
    const d = draftOf(['lam', 2026], ['cuoi', 2036])
    expect(
      setPhaseStarts(d, [
        { id: 'lam', startYear: 2026 },
        { id: 'cuoi', startYear: 2036 },
        { id: 'da-xoa', startYear: 2041 },
      ]),
    ).toBe(d)
  })

  it('cùng một id hai lần → trả nguyên bản nháp (đủ số lượng nhưng không phủ đủ chặng)', () => {
    const d = draftOf(['lam', 2026], ['cuoi', 2036])
    expect(
      setPhaseStarts(d, [
        { id: 'lam', startYear: 2026 },
        { id: 'lam', startYear: 2036 },
      ]),
    ).toBe(d)
  })

  it('mảng rỗng (không có gì để tính) → trả nguyên bản nháp', () => {
    const d = draftOf(['lam', 2026], ['cuoi', 2036])
    expect(setPhaseStarts(d, [])).toBe(d)
  })

  it('bố cục ĐÚNG BẰNG năm đang có → trả CHÍNH bản nháp, không phải bản sao', () => {
    // Một lượt kéo gọi hàm này mỗi khung hình; trả bản sao là dựng lại cả cây suốt lượt kéo.
    const d = draftOf(['lam', 2026], ['cuoi', 2036], ['my', 2041])
    const goc = reorderPhaseStarts(phaseSpans(d.phases, HET_DOI), 'my', 2)
    expect(setPhaseStarts(d, goc)).toBe(d)
  })

  it('kéo đi rồi KÉO VỀ: bố cục trở lại đúng như trước lượt kéo', () => {
    const d = draftOf(['lam', 2026], ['cuoi', 2036], ['my', 2041])
    const anh = phaseSpans(d.phases, HET_DOI) // ảnh chụp lúc nhấn, giữ nguyên cả lượt kéo
    const daKeo = setPhaseStarts(d, reorderPhaseStarts(anh, 'my', 1))
    expect(daKeo.phases.map((p) => p.id)).toEqual(['lam', 'my', 'cuoi'])
    const veCho = setPhaseStarts(daKeo, reorderPhaseStarts(anh, 'my', 2))
    expect(veCho.phases.map((p) => [p.id, p.startYear])).toEqual([
      ['lam', 2026],
      ['cuoi', 2036],
      ['my', 2041],
    ])
  })
})
