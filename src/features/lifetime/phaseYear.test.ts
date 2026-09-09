import { describe, expect, it } from 'vitest'
import {
  MAX_PHASE_YEAR,
  blockPhaseStartYearAtNeighbours,
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

describe('blockPhaseStartYearAtNeighbours', () => {
  // Cùng bộ ba chặng với describe('clampPhaseStartYear') ở trên, khai riêng để không phụ
  // thuộc thứ tự chạy test.
  const chang: PhaseYearSlot[] = [
    { id: 'p1', startYear: 2026 },
    { id: 'p2', startYear: 2035 },
    { id: 'p3', startYear: 2059 },
  ]

  // Phát hiện review 2026-09-09 (finding "Important"): kéo mép chặng VƯỢT QUA chặng bên
  // cạnh dùng `clampPhaseStartYear` (dò năm TRỐNG gần nhất) sẽ ĐỔI THỨ TỰ hai chặng thay vì
  // dừng lại ở ranh giới — PhaseLane từng gọi thẳng đường đó (qua `onMoveStart` →
  // `movePhaseStart` ở TuongLaiPage). Test này đối chiếu TRỰC TIẾP hai hàm trên cùng một đầu
  // vào để đường CŨ (vẫn còn sống, ô năm trong dock đang dùng nó) và đường MỚI không bị nhầm
  // là tương đương.
  it('so với clampPhaseStartYear (đường ô năm trong dock, PhaseLane từng gọi thẳng khi kéo): kéo mép trái p2 vượt qua p3 — đường ĐÓ đổi thứ tự (p2 nhảy qua sau p3), đường CHẶN mới dừng lại trước p3', () => {
    const wanted = 2070 // vượt xa p3 (2059)
    // Đường CŨ: 2070 đang trống nên `clampPhaseStartYear` trả thẳng 2070 — LỚN HƠN
    // p3.startYear (2059), tức nếu ghi giá trị này thì p2 xếp SAU p3: hai chặng đổi thứ tự.
    const duongCu = clampPhaseStartYear(chang, 'p2', wanted, NAY)
    expect(duongCu).toBe(2070)
    expect(duongCu).toBeGreaterThan(chang[2].startYear) // xác nhận đây đúng là một cú đổi thứ tự

    // Đường MỚI: dừng lại một năm TRƯỚC p3, không bao giờ chạm hay vượt qua nó.
    const duongMoi = blockPhaseStartYearAtNeighbours(chang, 'p2', wanted)
    expect(duongMoi).toBe(2058)
    expect(duongMoi).toBeLessThan(chang[2].startYear)
  })

  it('kéo mép trái về phía chặng TRƯỚC thì dừng đúng một năm SAU nó, không chạm hay vượt qua', () => {
    expect(blockPhaseStartYearAtNeighbours(chang, 'p2', 2020)).toBe(2027) // p1.startYear + 1
    expect(blockPhaseStartYearAtNeighbours(chang, 'p2', 1900)).toBe(2027) // kéo cực xa vẫn dừng ở đó
  })

  it('kéo mép trái về phía chặng SAU thì dừng đúng một năm TRƯỚC nó, không chạm hay vượt qua', () => {
    expect(blockPhaseStartYearAtNeighbours(chang, 'p2', 2070)).toBe(2058) // p3.startYear - 1
    expect(blockPhaseStartYearAtNeighbours(chang, 'p2', 2200)).toBe(2058) // kéo cực xa vẫn dừng ở đó
  })

  it('chặng rộng đúng MỘT năm không thể bị ép về 0 hay âm — cả hai đầu kéo đều dừng tại đúng năm đang có', () => {
    // p2 chỉ rộng 1 năm (2027..2027): p1 = 2026, p2 = 2027, p3 = 2028 — không còn năm nào
    // trống ở giữa để nhích.
    const hep: PhaseYearSlot[] = [
      { id: 'p1', startYear: 2026 },
      { id: 'p2', startYear: 2027 },
      { id: 'p3', startYear: 2028 },
    ]
    expect(blockPhaseStartYearAtNeighbours(hep, 'p2', 2000)).toBe(2027) // kéo về p1: đứng yên
    expect(blockPhaseStartYearAtNeighbours(hep, 'p2', 2100)).toBe(2027) // kéo về p3: đứng yên
  })

  it('mép phải dời chặng KẾ TIẾP — khoảng chặn đọc theo hàng xóm của CHÍNH chặng kế đó, không phải của chặng đang cầm hay của chặng xa hơn', () => {
    const bon: PhaseYearSlot[] = [
      { id: 'p1', startYear: 2026 },
      { id: 'p2', startYear: 2035 },
      { id: 'p3', startYear: 2059 },
      { id: 'p4', startYear: 2080 },
    ]
    // Kéo mép PHẢI của p1 nghĩa là gọi hàm này cho id='p2' (chặng kế) — hàng xóm của p2 là
    // p1 (trước) và p3 (sau), KHÔNG phải p4.
    expect(blockPhaseStartYearAtNeighbours(bon, 'p2', 2070)).toBe(2058) // chặn bởi p3, không phải p4
    expect(blockPhaseStartYearAtNeighbours(bon, 'p2', 1990)).toBe(2027) // chặn bởi p1
  })

  it('chặng ĐẦU không dời được qua hàm này — mép trái của nó không tồn tại (khoá ở currentYear, xem clampPhaseStartYear)', () => {
    expect(blockPhaseStartYearAtNeighbours(chang, 'p1', 1990)).toBe(2026)
    expect(blockPhaseStartYearAtNeighbours(chang, 'p1', 3000)).toBe(2026)
  })

  it('chặng CUỐI vẫn kéo được bằng mép trái/kéo giữa của chính nó — chỉ MÉP PHẢI của nó là không tồn tại (chặn ở PhaseLane.tsx, không ở đây)', () => {
    // Không có chặng sau p3 nên biên trên là MAX_PHASE_YEAR, không phải "không cho di
    // chuyển" — khác hẳn ca chặng đầu ở trên.
    expect(blockPhaseStartYearAtNeighbours(chang, 'p3', 4000)).toBe(MAX_PHASE_YEAR)
    expect(blockPhaseStartYearAtNeighbours(chang, 'p3', 2030)).toBe(2036) // p2.startYear + 1
  })

  it('kéo GIỮA một chặng RỘNG tới sát chặng bên cạnh thì dừng lại, không co chặng đó về 0 hay đổi thứ tự', () => {
    // p2 rộng 30 năm (2030..2059) — kéo giữa với độ lệch đẩy startYear muốn tới quá xa
    // (2075), vượt hẳn qua p3 (2060).
    const rong: PhaseYearSlot[] = [
      { id: 'p1', startYear: 2026 },
      { id: 'p2', startYear: 2030 },
      { id: 'p3', startYear: 2060 },
    ]
    const ketQua = blockPhaseStartYearAtNeighbours(rong, 'p2', 2075)
    expect(ketQua).toBe(2059) // p3.startYear - 1
    expect(ketQua).toBeLessThan(rong[2].startYear) // không đổi thứ tự với p3
    expect(ketQua).toBeGreaterThan(rong[0].startYear) // và vẫn rộng hơn 0 so với p1
  })

  it('năm gõ dở (NaN) thì giữ năm đang có, không kéo về currentYear hay biên nào khác', () => {
    expect(blockPhaseStartYearAtNeighbours(chang, 'p2', Number.NaN)).toBe(2035)
  })

  it('chặng không có trong danh sách vẫn trả một năm dùng được, không ném lỗi', () => {
    expect(blockPhaseStartYearAtNeighbours(chang, 'khong-co', 2044)).toBe(2044)
  })
})
