import { describe, expect, it } from 'vitest'
import { buildLifetimeCostMap } from './lifetimeCost'
import { STRESS_ILLNESS_EVENT_ID, type YearEvent, type YearRow } from './project'

/** YearRow chỉ với những trường bản đồ này đọc; phần còn lại để 0 cho gọn. */
function row(year: number, phaseLabel: string, expenseMinor: number, events: YearEvent[] = []): YearRow {
  return {
    year,
    age: year - 1994,
    country: 'JP',
    phaseLabel,
    incomeMinor: 0,
    expenseMinor,
    events,
    netFlowMinor: 0,
    assetsEndMinor: 0,
    assetsPessimisticMinor: 0,
    assetsOptimisticMinor: 0,
    ownedAssetsMinor: 0,
    loanBalanceMinor: 0,
    netWorthMinor: 0,
  }
}

const ev = (id: string, label: string, amountDisplayMinor: number, kind: YearEvent['kind'] = 'expense'): YearEvent => ({
  id,
  label,
  kind,
  amountDisplayMinor,
})

function find(items: ReturnType<typeof buildLifetimeCostMap>['items'], label: string) {
  const it = items.find((x) => x.label === label)
  if (!it) throw new Error(`Không có dòng "${label}" — có: ${items.map((x) => x.label).join(', ')}`)
  return it
}

// ĐO TRÊN APP 10/09/2026: thêm hơn hai chục mốc từ bộ mẫu, bảng chỉ hiện MỘT dòng mốc
// mang ¥185.855.462 — tổng của tất cả, dán nhãn của cái đầu tiên gặp. Nguyên nhân: id của
// một dòng CHƯA LƯU là `nhap:e3` (`NEW_ID_PREFIX`), và cắt ở ':' ĐẦU TIÊN cho ra `nhap`
// cho mọi dòng chưa lưu. Lời ghi cũ ở đây ("id thật là uuid, không chứa ':'") chỉ đúng cho
// dòng ĐÃ LƯU — mà bảng này chạy trên BẢN NHÁP, nơi phần lớn dòng mới còn mang tiền tố đó.
describe('buildLifetimeCostMap — id của dòng chưa lưu', () => {
  it('hai mốc CHƯA LƯU khác nhau là hai dòng, không gộp theo tiền tố "nhap:"', () => {
    const map = buildLifetimeCostMap({
      rows: [
        row(2030, 'Đi làm ở Nhật', 0, [
          ev('nhap:e1', 'Cưới', 3_000_000),
          ev('nhap:e2', 'Du lịch', 500_000),
        ]),
      ],
    })
    expect(map.items.map((x) => x.label).sort()).toEqual(['Cưới', 'Du lịch'])
    expect(find(map.items, 'Cưới').totalMinor).toBe(3_000_000)
    expect(find(map.items, 'Du lịch').totalMinor).toBe(500_000)
  })

  it('vẫn gộp ba dòng cơ chế của một mốc chưa lưu', () => {
    const map = buildLifetimeCostMap({
      rows: [
        row(2034, 'Đi làm ở Nhật', 0, [
          ev('nhap:e1', 'Mua nhà', 658_000),
          ev('nhap:e1:tratruoc', 'Mua nhà — trả trước', 9_400_000),
          ev('nhap:e1:trano', 'Mua nhà — trả nợ', 1_300_000),
        ]),
      ],
    })
    expect(map.items).toHaveLength(1)
    expect(find(map.items, 'Mua nhà').totalMinor).toBe(658_000 + 9_400_000 + 1_300_000)
  })
})

describe('buildLifetimeCostMap — quãng năm của mỗi mục', () => {
  // `startYear` là thứ duy nhất nối một dòng CHẶNG về lại chặng thật: id của nó là
  // `phase:${label}:${runStart}` (tổng hợp), vì `YearRow` không mang id chặng — và
  // `YearRow` bị gói vào `_rules.js` của edge function nên thêm trường vào đó là đổi cả
  // phía server. Có `startYear` thì `phaseForYear(phases, startYear)` cho lại đúng chặng
  // đã sinh ra quãng đó, không phải dò theo tên (hai chặng trùng tên là chuyện hợp lệ).
  it('chặng: quãng liền nhau cho ra năm đầu và năm cuối của chính quãng đó', () => {
    const map = buildLifetimeCostMap({
      rows: [
        row(2026, 'Đi làm ở Nhật', 100),
        row(2027, 'Đi làm ở Nhật', 100),
        row(2028, 'Về Việt Nam', 100),
      ],
    })
    const nhat = find(map.items, 'Đi làm ở Nhật')
    expect([nhat.startYear, nhat.endYear]).toEqual([2026, 2027])
    const vn = find(map.items, 'Về Việt Nam')
    expect([vn.startYear, vn.endYear]).toEqual([2028, 2028])
  })

  // Hai chặng TRÙNG TÊN là hai quãng khác nhau (đã có phép kiểm riêng ở dưới) — nên quãng
  // năm phải theo từng quãng, không gộp về một khoảng bao trùm cả hai.
  it('hai quãng trùng tên giữ hai quãng năm riêng', () => {
    const map = buildLifetimeCostMap({
      rows: [
        row(2026, 'Đi làm ở Nhật', 100),
        row(2027, 'Nghỉ một năm', 100),
        row(2028, 'Đi làm ở Nhật', 100),
      ],
    })
    const hai = map.items.filter((x) => x.label === 'Đi làm ở Nhật')
    expect(hai).toHaveLength(2)
    expect(hai.map((x) => [x.startYear, x.endYear]).sort()).toEqual([[2026, 2026], [2028, 2028]])
  })

  // Mốc lặp (mua xe mỗi 8 năm) chạm những năm RỜI NHAU. `years` là số năm chạm, còn
  // `startYear`/`endYear` là năm đầu và năm cuối — ba con số khác nhau, và dòng phụ đề
  // "2030–2054 · 4 năm" cần cả ba.
  it('mốc lặp: năm đầu và năm cuối, dù các năm chạm không liền nhau', () => {
    const map = buildLifetimeCostMap({
      rows: [
        row(2030, 'Đi làm ở Nhật', 0, [ev('xe', 'Mua xe', 3_000_000)]),
        row(2031, 'Đi làm ở Nhật', 0),
        row(2038, 'Đi làm ở Nhật', 0, [ev('xe', 'Mua xe', 3_000_000)]),
      ],
    })
    const xe = find(map.items, 'Mua xe')
    expect([xe.startYear, xe.endYear, xe.years]).toEqual([2030, 2038, 2])
  })

  // Ba dòng của một mốc mua tài sản gộp về một mục, nên quãng năm phải là quãng của CẢ
  // ba: trả trước ở năm mua, trả nợ kéo dài nhiều năm sau.
  it('mốc mua tài sản: quãng năm trải hết cả ba dòng cơ chế', () => {
    const map = buildLifetimeCostMap({
      rows: [
        row(2034, 'Đi làm ở Nhật', 0, [ev('nha:tratruoc', 'Mua nhà — trả trước', 9_400_000)]),
        row(2035, 'Đi làm ở Nhật', 0, [ev('nha:trano', 'Mua nhà — trả nợ', 1_300_000)]),
        row(2036, 'Đi làm ở Nhật', 0, [ev('nha', 'Mua nhà', 658_000)]),
      ],
    })
    const nha = find(map.items, 'Mua nhà')
    expect([nha.startYear, nha.endYear]).toEqual([2034, 2036])
  })
})

describe('buildLifetimeCostMap', () => {
  // Engine sinh BA dòng cho một mốc mua nhà: chi phí giữ (`id`), trả trước
  // (`id:tratruoc`) và trả nợ (`id:trano`) — xem project.ts. Xếp hạng "cả đời cái gì ngốn
  // nhiều tiền nhất" phải gộp lại thành MỘT căn nhà, không thì một căn bị chẻ ba và không
  // dòng nào nói đúng nó tốn bao nhiêu.
  it('gộp ba dòng của một mốc mua tài sản về một mục', () => {
    const map = buildLifetimeCostMap({
      rows: [
        row(2034, 'Đi làm', 0, [
          ev('nha', 'Mua nhà', 658_000),
          ev('nha:tratruoc', 'Mua nhà — trả trước', 9_400_000),
          ev('nha:trano', 'Mua nhà — trả nợ', 1_337_728),
        ]),
        row(2035, 'Đi làm', 0, [
          ev('nha', 'Mua nhà', 658_000),
          ev('nha:trano', 'Mua nhà — trả nợ', 1_337_728),
        ]),
      ],
    })
    const nha = map.items.filter((i) => i.kind === 'event')
    expect(nha).toHaveLength(1)
    expect(nha[0].id).toBe('nha')
    // 2×658.000 + 9.400.000 + 2×1.337.728
    expect(nha[0].totalMinor).toBe(2 * 658_000 + 9_400_000 + 2 * 1_337_728)
    expect(nha[0].years).toBe(2)
  })

  // Nhãn lấy từ dòng KHÔNG có hậu tố, không phải dòng đầu tiên gặp: "Mua nhà — trả nợ"
  // là tên một nửa cơ chế, không phải tên cái mốc.
  it('lấy nhãn của mốc, không lấy nhãn của nửa cơ chế', () => {
    const map = buildLifetimeCostMap({
      rows: [row(2034, 'Đi làm', 0, [ev('nha:trano', 'Mua nhà — trả nợ', 100), ev('nha', 'Mua nhà', 50)])],
    })
    expect(map.items[0].label).toBe('Mua nhà')
  })

  // Stress test là "nếu như", không phải một khoản trong kế hoạch. Để nó vào là bật một
  // cú sốc lên làm đổi luôn thứ hạng của kế hoạch.
  it('bỏ sự kiện của stress test ra ngoài xếp hạng', () => {
    const map = buildLifetimeCostMap({
      rows: [
        row(2040, 'Đi làm', 0, [
          ev('cuoi', 'Cưới', 3_000_000),
          ev(STRESS_ILLNESS_EVENT_ID, 'Bệnh nặng (stress test)', 50_000_000),
        ]),
      ],
    })
    expect(map.items.map((i) => i.label)).toEqual(['Cưới'])
  })

  // Bản vẽ: bản đồ gộp CẢ sinh hoạt từng chặng LẪN từng mốc — không thì "cái gì ngốn
  // nhiều tiền nhất" bỏ qua đúng thứ ngốn nhiều nhất ở phần lớn kế hoạch.
  it('mỗi chặng thành một mục, cộng chi nền suốt các năm của chặng đó', () => {
    const map = buildLifetimeCostMap({
      rows: [
        row(2026, 'Đi làm ở Nhật', 3_600_000),
        row(2027, 'Đi làm ở Nhật', 3_600_000),
        row(2028, 'Về Việt Nam', 2_400_000),
      ],
    })
    expect(find(map.items, 'Đi làm ở Nhật')).toMatchObject({ kind: 'phase', totalMinor: 7_200_000, years: 2 })
    expect(find(map.items, 'Về Việt Nam')).toMatchObject({ kind: 'phase', totalMinor: 2_400_000, years: 1 })
  })

  // Hai chặng TRÙNG TÊN vẫn là hai chặng. Gộp theo tên thì hai quãng đời khác nhau nhập
  // vào một dòng; gộp theo QUÃNG LIỀN NHAU thì đúng, vì chặng lấp kín trục không hở.
  it('hai chặng trùng tên nhưng rời nhau vẫn là hai mục', () => {
    const map = buildLifetimeCostMap({
      rows: [
        row(2026, 'Ở Nhật', 1_000_000),
        row(2027, 'Về VN', 500_000),
        row(2028, 'Ở Nhật', 2_000_000),
      ],
    })
    const oNhat = map.items.filter((i) => i.kind === 'phase' && i.label === 'Ở Nhật')
    expect(oNhat).toHaveLength(2)
    expect(oNhat.map((i) => i.totalMinor).sort((a, b) => a - b)).toEqual([1_000_000, 2_000_000])
  })

  // Lương hưu là THU: nó bù vào, không ngốn. Dấu âm để nó rơi xuống cuối bảng thay vì
  // trèo lên đầu như một khoản chi lớn.
  it('mốc thu ra số âm', () => {
    const map = buildLifetimeCostMap({
      rows: [row(2059, 'Nghỉ hưu', 0, [ev('luong-huu', 'Lương hưu', 900_000, 'income')])],
    })
    expect(find(map.items, 'Lương hưu').totalMinor).toBe(-900_000)
  })

  it('xếp theo ĐỘ LỚN giảm dần, thu lẫn chi cùng một thang', () => {
    const map = buildLifetimeCostMap({
      rows: [
        row(2030, 'Chặng', 1_000_000, [
          ev('nho', 'Nhỏ', 100_000),
          ev('to', 'To', 5_000_000),
          ev('thu', 'Thu lớn', 3_000_000, 'income'),
        ]),
      ],
    })
    expect(map.items.map((i) => i.label)).toEqual(['To', 'Thu lớn', 'Chặng', 'Nhỏ'])
  })

  // Mẫu số của cột "% tổng chi" chỉ gồm khoản RA. Cộng cả thu vào mẫu số thì một kế hoạch
  // có lương hưu lớn sẽ thấy mọi phần trăm phình lên.
  it('tổng chi làm mẫu số chỉ cộng khoản ra, không trừ thu', () => {
    const map = buildLifetimeCostMap({
      rows: [
        row(2030, 'Chặng', 1_000_000, [
          ev('chi', 'Chi', 2_000_000),
          ev('thu', 'Thu', 500_000, 'income'),
        ]),
      ],
    })
    expect(map.totalSpendMinor).toBe(3_000_000)
  })

  // Ca có thật: vòng chi phí giữ ở project.ts `continue` khi chi phí giữ bằng 0, nên một
  // mốc "vay mua nhà, không khai chi phí giữ" chỉ sinh hai dòng có hậu tố — nhãn gốc
  // KHÔNG xuất hiện ở đâu cả. Không có đường lùi thì dòng trong bảng đọc là
  // "Mua nhà — trả trước", tức tên một nửa cơ chế đứng làm tên cái mốc.
  it('mốc chỉ có nửa cơ chế vẫn lấy lại được tên mốc', () => {
    const map = buildLifetimeCostMap({
      rows: [
        row(2034, 'Đi làm', 0, [
          ev('nha:tratruoc', 'Mua nhà — trả trước', 9_400_000),
          ev('nha:trano', 'Mua nhà — trả nợ', 1_337_728),
        ]),
      ],
    })
    expect(map.items).toHaveLength(1)
    expect(map.items[0].label).toBe('Mua nhà')
    expect(map.items[0].id).toBe('nha')
  })

  it('không có dòng nào thì bản đồ rỗng, không nổ', () => {
    expect(buildLifetimeCostMap({ rows: [] })).toEqual({ items: [], totalSpendMinor: 0 })
  })

  // Chặng không tiêu gì (chi nền 0) không đáng một dòng trong bảng xếp hạng.
  it('bỏ mục có tổng bằng 0', () => {
    const map = buildLifetimeCostMap({ rows: [row(2030, 'Chặng rỗng', 0)] })
    expect(map.items).toEqual([])
  })
})
