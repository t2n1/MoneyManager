import { describe, expect, it } from 'vitest'
import {
  MAX_PHASE_YEAR,
  clampPhaseStartYear,
  freePhaseStartYear,
  type PhaseYearSlot,
} from './phaseYear'

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

  // Phát hiện review 2026-09-09 #3: sàn của chặng SAU phải tính theo chặng ĐẦU THẬT
  // (`sorted[0].startYear`), không chỉ `currentYear + 1`. `PhaseFormSheet` (sheet cũ,
  // sống tới Task 16) không ép "chặng đầu luôn = currentYear", nên dữ liệu chặng đầu ở
  // TƯƠNG LAI (so với `currentYear`) là một hình dạng có thật, không phải giả định lý
  // thuyết. Không có test này thì sàn cũ (`currentYear + 1`) có thể thấp hơn năm chặng
  // đầu đang giữ, và một chặng SAU gõ năm ở khoảng hở đó sẽ SẮP XẾP LÊN TRƯỚC chặng đầu
  // ngay giữa lúc gõ — `laChangDau` lật, `<YearBox>` đang được gõ unmount dưới con trỏ.
  it('sàn của chặng SAU tính theo chặng ĐẦU THẬT, không chỉ currentYear — chặng đầu ở tương lai (dữ liệu bất thường, sheet cũ không ép luật) không bị chặng sau vượt mặt', () => {
    const changDauOTuongLai: PhaseYearSlot[] = [
      { id: 'p1', startYear: 2030 }, // đáng lẽ = NAY (2026), nhưng dữ liệu cũ/hỏng để nó ở tương lai
      { id: 'p2', startYear: 2035 },
    ]
    // Sàn CŨ (currentYear + 1 = 2027) sẽ chấp nhận thẳng năm gõ (2027) — DƯỚI năm chặng
    // đầu (2030), tức p2 sắp xếp lên TRƯỚC p1. Sàn MỚI phải là max(NAY, 2030) + 1 = 2031.
    expect(clampPhaseStartYear(changDauOTuongLai, 'p2', 2027, NAY)).toBe(2031)
  })
})

describe('freePhaseStartYear', () => {
  const chang: PhaseYearSlot[] = [
    { id: 'p1', startYear: 2026 },
    { id: 'p2', startYear: 2035 },
    { id: 'p3', startYear: 2059 },
  ]
  const LAST = 2090

  // Phát hiện review 2026-09-09 #1 và #2 — gốc rễ chung: một chặng MỚI (chưa có id, chưa
  // nằm trong `phases`) cần một câu trả lời riêng, không mượn `clampPhaseStartYear`.

  it('năm gõ đã có chặng khác giữ thì dò năm trống gần nhất (hoà thì chọn phía TĂNG)', () => {
    // 2035 = năm của p2 — trùng thẳng.
    expect(freePhaseStartYear(chang, 2035, NAY, LAST)).toBe(2036)
  })

  it('năm gõ THẤP HƠN MỌI chặng đang có (kể cả chặng đầu) vẫn không được trùng chặng đầu — đúng ca Finding 1: mốc bị gõ tay xuống dưới currentYear', () => {
    // Cách gọi CŨ (đã sửa) mô phỏng lại đúng lỗi: nhét chặng giả vào mảng rồi gọi
    // `clampPhaseStartYear` — chặng giả (id 'moi', năm 2020) sắp xếp thành chặng ĐẦU
    // (2020 < mọi năm khác), nên rơi vào Bất biến 1 và trả nguyên `currentYear` — TRÙNG
    // hệt năm chặng đầu thật (p1 cũng ở NAY). `clampPhaseStartYear` không đổi hành vi này
    // (nó vẫn đúng nhiệm vụ của nó — chặn một chặng ĐÃ CÓ); cái sai là dùng nó cho việc
    // này.
    const gia = clampPhaseStartYear([...chang, { id: 'moi', startYear: 2020 }], 'moi', 2020, NAY)
    expect(gia).toBe(NAY) // = 2026 — trùng thẳng p1.startYear, đây chính là lỗi.

    // `freePhaseStartYear` không đi qua Bất biến 1 (nó không có khái niệm "chặng đầu"),
    // nên nó không trùng.
    const dung = freePhaseStartYear(chang, 2020, NAY, LAST)
    expect(dung).not.toBe(NAY)
    expect(chang.some((p) => p.startYear === dung)).toBe(false)
    // Kẹp về sàn (currentYear + 1) vì 2020 dưới sàn, và sàn đó đang trống.
    expect(dung).toBe(NAY + 1)
  })

  it('hai lần thêm liên tiếp (bấm "Cưới" hai lần) ra hai năm khác nhau, lần hai nhích lên', () => {
    // Cả hai lần đều gõ đúng `currentYear + 2` — công thức cố định của `onAddPreset` và
    // ba mẫu sinh chặng (`cuoi`/`nghi-huu`/`chuyen-nuoc`).
    const wanted = NAY + 2
    const lanMot = freePhaseStartYear(chang, wanted, NAY, LAST)
    expect(lanMot).toBe(wanted) // 2028 — trống, nhận thẳng.

    const sauLanMot: PhaseYearSlot[] = [...chang, { id: 'p-lan-1', startYear: lanMot }]
    const lanHai = freePhaseStartYear(sauLanMot, wanted, NAY, LAST)
    expect(lanHai).not.toBe(lanMot)
    expect(lanHai).toBe(wanted + 1) // nhích lên — hoà thì chọn phía tăng.
  })

  it('kiệt cả khoảng đang chiếu quanh lastYear thì dò tiếp ra ngoài, không dừng lại ở lastYear', () => {
    // Đặc kín 11 năm liền, DÀN ĐỀU quanh `LAST` (2085..2095) — mô phỏng một bản chiếu đã
    // dày đặc chặng gần cuối đời. Năm trống gần nhất phải nằm NGOÀI dải đặc kín, không bị
    // chặn lại ở đúng `lastYear` (một cách cài sai hợp lý: tưởng `lastYear` là trần).
    const dayDac: PhaseYearSlot[] = Array.from({ length: 11 }, (_, i) => ({
      id: `p${i}`,
      startYear: 2085 + i,
    }))
    expect(freePhaseStartYear(dayDac, LAST, NAY, LAST)).toBe(2096)
  })

  it('kiệt tới tận MAX_PHASE_YEAR (lý thuyết thuần tuý) thì trả năm ngay sau lastYear làm phao, không ném lỗi', () => {
    const san = NAY + 1
    const dacKinToiTran: PhaseYearSlot[] = Array.from(
      { length: MAX_PHASE_YEAR - san + 1 },
      (_, i) => ({ id: `p${i}`, startYear: san + i }),
    )
    expect(freePhaseStartYear(dacKinToiTran, san, NAY, LAST)).toBe(LAST + 1)
  })
})
