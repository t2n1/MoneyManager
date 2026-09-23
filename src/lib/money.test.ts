import { afterEach, describe, expect, it } from 'vitest'
import { CURRENCIES, formatCompact, formatMoney, parseMoney } from './money'
import { setPrivacyEnabled } from './privacy'
import { getCompactStyle, setCompactStyle } from './compactStyle'

// Tiền lưu ở ĐƠN VỊ NHỎ NHẤT (minor units): JPY = yên, VND = đồng, USD = cent.

describe('formatMoney', () => {
  it('JPY: prefix ¥, không thập phân, nhóm nghìn bằng dấu phẩy (chuẩn Nhật)', () => {
    expect(formatMoney(0, 'JPY')).toBe('¥0')
    expect(formatMoney(1234, 'JPY')).toBe('¥1,234')
    expect(formatMoney(120000, 'JPY')).toBe('¥120,000')
    expect(formatMoney(1255910, 'JPY')).toBe('¥1,255,910')
  })

  it('VND: suffix ₫, không thập phân', () => {
    expect(formatMoney(1234000, 'VND')).toBe('1.234.000 ₫')
    expect(formatMoney(0, 'VND')).toBe('0 ₫')
  })

  // Chuẩn MỸ (phẩy hàng nghìn, chấm thập phân), không phải kiểu Việt — đổi 2026-08-11.
  // Lý do ở src/lib/currencies.ts: JPY và USD hiện cạnh nhau trong cùng danh sách, để
  // USD kiểu Việt thì dấu ',' vừa là hàng nghìn vừa là thập phân trên một màn hình.
  it('USD: prefix $, 2 số thập phân kiểu Mỹ (chấm)', () => {
    expect(formatMoney(123456, 'USD')).toBe('$1,234.56')
    expect(formatMoney(50, 'USD')).toBe('$0.50')
    expect(formatMoney(0, 'USD')).toBe('$0.00')
    // Mốc phân biệt rõ nhất với kiểu cũ: bốn chữ số + phần lẻ khác 0.
    expect(formatMoney(200000, 'USD')).toBe('$2,000.00')
  })

  it('số âm: dấu trừ đứng trước tất cả', () => {
    expect(formatMoney(-1234, 'JPY')).toBe('-¥1,234')
    expect(formatMoney(-50000, 'VND')).toBe('-50.000 ₫')
    expect(formatMoney(-123456, 'USD')).toBe('-$1,234.56')
  })

  it('giá trị rất lớn', () => {
    expect(formatMoney(999999999999, 'VND')).toBe('999.999.999.999 ₫')
  })
})

describe('parseMoney', () => {
  it('chỉ giữ chữ số — kết quả là minor units (kiểu ATM)', () => {
    expect(parseMoney('1.234.000 ₫')).toBe(1234000)
    // Cả hai kiểu dấu đều ra cùng số: parseMoney chỉ giữ chữ số, nên đổi quy ước
    // hiển thị USD không làm lệch ô nhập.
    expect(parseMoney('$1,234.56')).toBe(123456)
    expect(parseMoney('$1.234,56')).toBe(123456)
    expect(parseMoney('¥120.000')).toBe(120000)
    expect(parseMoney('')).toBe(0)
    expect(parseMoney('abc')).toBe(0)
  })

  it('round-trip với formatMoney cho cả 3 loại tiền', () => {
    for (const c of ['JPY', 'VND', 'USD'] as const) {
      expect(parseMoney(formatMoney(987654321, c))).toBe(987654321)
    }
  })
})

describe('CURRENCIES', () => {
  it('đủ 3 loại tiền với decimals đúng', () => {
    expect(CURRENCIES.JPY.decimals).toBe(0)
    expect(CURRENCIES.VND.decimals).toBe(0)
    expect(CURRENCIES.USD.decimals).toBe(2)
  })
})

// ------------------------------------------------------- nhãn rút gọn: JPY theo hệ Nhật
//
// K/M/B nhóm BA chữ số một lần, 万/億 nhóm BỐN. Sổ này đọc bằng yên ở Nhật, nơi giá
// niêm yết, bảng lương và sao kê ngân hàng đều tính theo 万 — "¥300k" bắt người xem
// tự đổi trong đầu, "30万" thì đọc thẳng ra. Test canh đúng mốc chuyển bậc, vì lệch
// một bậc ở đây không phải nhầm nhãn mà là nhầm mười lần số tiền.
describe('formatCompact — JPY dùng hệ 万/億', () => {
  it('bậc 万 = 10⁴', () => {
    expect(formatCompact(10_000, 'JPY')).toBe('1万')
    expect(formatCompact(300_000, 'JPY')).toBe('30万')
    expect(formatCompact(999_000, 'JPY')).toBe('99.9万')
    expect(formatCompact(12_000_000, 'JPY')).toBe('1200万')
    // Sát mốc dưới của 億 — chuỗi 万 dài nhất có thể, vẫn chưa được lên bậc.
    expect(formatCompact(99_990_000, 'JPY')).toBe('9999万')
  })

  it('bậc 億 = 10⁸', () => {
    expect(formatCompact(100_000_000, 'JPY')).toBe('1億')
    expect(formatCompact(250_000_000, 'JPY')).toBe('2.5億')
  })

  // Trục tung đóng cứng width={44} ở cả ba biểu đồ dùng nhãn này. Đo trên trình
  // duyệt (IBM Plex Sans 11px, font thật của app): "1234.6万" rộng 47px — TRÀN sang
  // vùng vẽ; "1235万" 37px, vừa. Nên từ ba chữ số là bỏ phần lẻ.
  it('từ ba chữ số thì bỏ phần lẻ — nhãn phải vừa trục 44px', () => {
    expect(formatCompact(1_255_910, 'JPY')).toBe('126万')
    expect(formatCompact(12_346_000, 'JPY')).toBe('1235万')
    expect(formatCompact(12_345_678_901, 'JPY')).toBe('123億')
    // Dưới ba chữ số thì phần lẻ vẫn còn — nó là 1% giá trị, không phải nhiễu.
    expect(formatCompact(995_000, 'JPY')).toBe('99.5万')
    expect(formatCompact(9_950_000_000, 'JPY')).toBe('99.5億')
    // Làm tròn lên chạm 100 thì đuôi ".0" cũng phải rụng, không ra "100.0万".
    expect(formatCompact(999_600, 'JPY')).toBe('100万')
    // Số âm cũng làm tròn về đúng phía.
    expect(formatCompact(-1_255_910, 'JPY')).toBe('-126万')
  })

  // 万 là bậc rút gọn ĐẦU TIÊN, dưới nó không có bậc nào để rơi vào — in nguyên chữ
  // số. Ghép "8千" là trộn hai hệ đếm trên cùng một trục, mà 千 thì người Nhật cũng
  // không dùng để nói tiền.
  it('dưới 1万 in nguyên chữ số, KHÔNG còn bậc k', () => {
    expect(formatCompact(0, 'JPY')).toBe('0')
    expect(formatCompact(500, 'JPY')).toBe('500')
    expect(formatCompact(8_000, 'JPY')).toBe('8,000')
    expect(formatCompact(9_999, 'JPY')).toBe('9,999')
  })

  // Nhãn này đứng cạnh những con số đi qua `formatMoney`, mà bên đó nhóm từ đầu. Một cột
  // ghi "1200" nằm ngay dưới một dòng ghi "¥25,862" đọc ra như hai hệ chữ số khác nhau.
  it('nhánh nguyên chữ số vẫn có dấu phân cách nghìn, đúng ký tự của loại tiền', () => {
    expect(formatCompact(1_200, 'JPY')).toBe('1,200')
    expect(formatCompact(-1_800, 'JPY')).toBe('-1,800')
    // VND nhóm bằng dấu chấm, và dưới 1.000 thì không có gì để nhóm.
    expect(formatCompact(999, 'VND')).toBe('999')
  })

  it('bỏ đuôi ".0" khi chẵn, y như bậc M/B', () => {
    expect(formatCompact(200_000, 'JPY')).toBe('20万')
    expect(formatCompact(500_000_000, 'JPY')).toBe('5億')
  })

  // Bản chiếu Lifetime chạm số âm khi tiền cạn, nên nhãn trục âm là chuyện thường.
  it('giữ dấu âm ở cả ba bậc', () => {
    expect(formatCompact(-300_000, 'JPY')).toBe('-30万')
    expect(formatCompact(-250_000_000, 'JPY')).toBe('-2.5億')
    expect(formatCompact(-8_000, 'JPY')).toBe('-8,000')
  })

  // 万/億 là quy ước đọc số của tiếng Nhật, gắn vào ĐỒNG YÊN chứ không vào cái trục
  // biểu đồ — trục VND vẫn phải là k/M/B.
  it('VND và USD không đổi, vẫn k/M/B', () => {
    expect(formatCompact(300_000, 'VND')).toBe('300k')
    expect(formatCompact(1_500_000, 'VND')).toBe('1.5M')
    expect(formatCompact(110_000_000_000, 'VND')).toBe('110B')
    // USD có 2 chữ số thập phân: 300000 cent = 3000 đô → "3k".
    expect(formatCompact(300_000, 'USD')).toBe('3k')
  })
})

// ---------------------------------------------------------------- chế độ che số (20c)
//
// Yêu cầu §4.8: ô che rộng ĐÚNG BẰNG con số thật. Trước đây che bằng bốn chấm cố định
// nên bật/tắt là cả cột số xê dịch — ở bảng hai chục dòng thì cả bảng nhảy, đúng lúc
// người dùng đang ở chỗ đông người và không muốn màn hình động đậy.
describe('che số: ô che rộng đúng bằng số thật', () => {
  afterEach(() => setPrivacyEnabled(false))

  it('JPY — số ký tự khớp chuỗi thật ở mọi độ dài', () => {
    for (const minor of [0, 1234, 120000, 1255910, 987654321]) {
      const that = formatMoney(minor, 'JPY')
      setPrivacyEnabled(true)
      const che = formatMoney(minor, 'JPY')
      setPrivacyEnabled(false)
      expect(che.length, `che "${che}" phải dài bằng thật "${that}"`).toBe(that.length)
      expect(che.startsWith('¥')).toBe(true)
      expect(che).not.toMatch(/\d/)
    }
  })

  it('VND (ký hiệu đứng sau) giữ đúng vị trí ký hiệu', () => {
    const that = formatMoney(1234000, 'VND')
    setPrivacyEnabled(true)
    const che = formatMoney(1234000, 'VND')
    expect(che.length).toBe(that.length)
    expect(che.endsWith(' ₫')).toBe(true)
    expect(che).not.toMatch(/\d/)
  })

  it('USD có phần thập phân cũng khớp bề rộng', () => {
    const that = formatMoney(123456, 'USD')
    setPrivacyEnabled(true)
    expect(formatMoney(123456, 'USD').length).toBe(that.length)
  })

  // Dấu âm nói CHIỀU, không nói số tiền — giữ lại thì bề rộng vẫn khớp chuỗi thật.
  it('giữ dấu âm', () => {
    const that = formatMoney(-5000, 'JPY')
    setPrivacyEnabled(true)
    const che = formatMoney(-5000, 'JPY')
    expect(che.length).toBe(that.length)
    expect(che.startsWith('-')).toBe(true)
  })

  // Che cả dấu phân cách: "¥•,•••,•••" vẫn vẽ ra đúng cấu trúc hàng triệu.
  it('không để lộ dấu phân cách nghìn', () => {
    setPrivacyEnabled(true)
    expect(formatMoney(1255910, 'JPY')).toBe('¥•••••••••')
  })

  // Khớp SỐ KÝ TỰ, và với nhãn JPY thì chỉ còn là số ký tự: 万/億 là glyph CJK nên
  // font vẽ nó rộng bằng HAI ô đơn cách, còn "•" chỉ một ô — "30万" thật rộng 4 ô mà
  // bản che "•••" chỉ 3. Lệch một ô trên nhãn trục thì vùng vẽ nhích nhẹ, không phải
  // cả cột số xê dịch như ở bảng (chỗ maskDigits sinh ra để chữa), nên chấp nhận.
  it('nhãn rút gọn cũng khớp bề rộng', () => {
    for (const minor of [500, 300000, 12000000, 250000000000]) {
      const that = formatCompact(minor, 'JPY')
      setPrivacyEnabled(true)
      const che = formatCompact(minor, 'JPY')
      setPrivacyEnabled(false)
      expect(che.length, `"${che}" vs "${that}"`).toBe(that.length)
      expect(che).not.toMatch(/[\dkMB万億]/)
    }
  })
})

// ---------------------------------------------------------------- "Số rút gọn" (Cài đặt)
//
// Người dùng chọn giữa 万/億 (mặc định) và nghìn/triệu cho nhãn rút gọn của YÊN. Bảng mẫu
// dưới đây là bảng user ĐÃ DUYỆT — sửa một ô là đổi thứ user đã chọn, phải hỏi lại.
describe('formatCompact — JPY kiểu nghìn/triệu', () => {
  afterEach(() => {
    setCompactStyle('ja')
    setPrivacyEnabled(false)
  })

  it('mặc định vẫn là 万/億 — hành vi cũ không đổi', () => {
    expect(getCompactStyle()).toBe('ja')
    expect(formatCompact(241_891, 'JPY')).toBe('24.2万')
  })

  it('khớp đúng bảng mẫu user đã duyệt', () => {
    setCompactStyle('vi')
    const BANG: [number, string][] = [
      [460, '460'],
      [20_000, '20k'],
      [91_811, '91,8k'],
      [241_891, '242k'],
      [1_312_870, '1,3tr'],
      [5_894_972, '5,9tr'],
      [123_456_789, '123tr'],
    ]
    for (const [minor, nhan] of BANG) expect(formatCompact(minor, 'JPY'), String(minor)).toBe(nhan)
  })

  it('bậc tỷ theo cùng luật, không có dấu cách (trục tung chỉ rộng 44px)', () => {
    setCompactStyle('vi')
    expect(formatCompact(1_200_000_000, 'JPY')).toBe('1,2tỷ')
    expect(formatCompact(5_000_000_000, 'JPY')).toBe('5tỷ')
    expect(formatCompact(123_400_000_000, 'JPY')).toBe('123tỷ')
  })

  it('làm tròn chạm mốc thì lên bậc, không ra "1000k" hay "1000tr"', () => {
    setCompactStyle('vi')
    expect(formatCompact(999_600, 'JPY')).toBe('1tr')
    expect(formatCompact(999_600_000, 'JPY')).toBe('1tỷ')
    expect(formatCompact(99_960, 'JPY')).toBe('100k')
    expect(formatCompact(999, 'JPY')).toBe('999')
    expect(formatCompact(1_000, 'JPY')).toBe('1k')
  })

  it('giữ dấu âm ở mọi bậc', () => {
    setCompactStyle('vi')
    expect(formatCompact(-460, 'JPY')).toBe('-460')
    expect(formatCompact(-91_811, 'JPY')).toBe('-91,8k')
    expect(formatCompact(-1_312_870, 'JPY')).toBe('-1,3tr')
    expect(formatCompact(-1_200_000_000, 'JPY')).toBe('-1,2tỷ')
  })

  it('chỉ đổi YÊN — VND và USD vẫn k/M/B, formatMoney không đổi', () => {
    setCompactStyle('vi')
    expect(formatCompact(1_500_000, 'VND')).toBe('1.5M')
    expect(formatCompact(300_000, 'USD')).toBe('3k')
    expect(formatMoney(241_891, 'JPY')).toBe('¥241,891')
  })

  it('chế độ che số vẫn che, rộng đúng bằng nhãn thật', () => {
    setCompactStyle('vi')
    for (const minor of [460, 91_811, 1_312_870, -1_200_000_000]) {
      const that = formatCompact(minor, 'JPY')
      setPrivacyEnabled(true)
      const che = formatCompact(minor, 'JPY')
      setPrivacyEnabled(false)
      expect(che.length).toBe(that.length)
      expect(che).not.toMatch(/d/)
    }
  })
})
