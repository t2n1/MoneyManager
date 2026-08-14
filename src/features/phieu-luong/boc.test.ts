import { describe, expect, it } from 'vitest'
import { bocPhieu, ghep, type OChu } from './boc'

/**
 * Hàng khấu trừ của một phiếu 2022: SÁU nhãn, NĂM số, `厚生年金基金` bỏ trống.
 * Toạ độ `x` là số ĐO THẬT; số tiền là số minh hoạ.
 *
 * Số canh PHẢI, nhãn canh TRÁI → độ lệch thay đổi theo độ rộng số:
 * `333` (ba chữ số) lệch 43,8pt khỏi nhãn của nó, còn `11,111` chỉ lệch 25,8pt.
 * Ngưỡng quá chặt là rơi nhãn `雇用保険料` trong im lặng.
 */
const HANG_TRU: OChu[] = [
  { text: '11,111', x: 95.2, y: 309.5 },
  { text: '22,222', x: 168.9, y: 309.5 },
  { text: '333', x: 335.7, y: 309.5 },
  { text: '4,444', x: 395.5, y: 309.5 },
  { text: '5,555', x: 469.2, y: 309.5 },
  { text: '健康保険料', x: 69.4, y: 283.3 },
  { text: '厚生年金保険', x: 138.1, y: 283.3 },
  { text: '厚生年金基金', x: 211.8, y: 283.3 },
  { text: '雇用保険料', x: 291.9, y: 283.3 },
  { text: '所得税', x: 375.6, y: 283.3 },
  { text: '住民税', x: 447.9, y: 283.3 },
]

describe('ghep — luật nhãn gần nhất về phía trái', () => {
  it('ghép đúng cả năm số, kể cả số ba chữ số lệch 43,8pt', () => {
    expect(ghep(HANG_TRU)).toEqual({
      健康保険料: 11111,
      厚生年金保険: 22222,
      雇用保険料: 333,
      所得税: 4444,
      住民税: 5555,
    })
  })

  it('nhãn bỏ trống không nhận gì', () => {
    expect('厚生年金基金' in ghep(HANG_TRU)).toBe(false)
  })

  /**
   * Chữ khối dựng dọc ở lề trái (`控` ở x≈42) cách số cột đầu (x=95.2) đúng 53,2pt
   * — TRONG ngưỡng 72pt — nên nếu không loại trước khi ghép, nó GIÀNH mất số của
   * `健康保険料` rồi vòng lặp dừng. Lỗi này từng nằm sẵn và bị một lỗi khác che.
   */
  it('chữ khối dựng dọc không giành được số', () => {
    const co控: OChu[] = [...HANG_TRU, { text: '控', x: 42.1, y: 296.0 }]
    expect(ghep(co控).健康保険料).toBe(11111)
    expect('控' in ghep(co控)).toBe(false)
  })

  /**
   * Layout từ 2026/06 chèn một hàng mục con giữa hàng số và hàng nhãn tổng, nên
   * phải duyệt NHIỀU hàng nhãn bên dưới. Hàng cách nhau ~26pt, hai hàng ~52pt,
   * vẫn trong YMAX=64.
   */
  it('nhãn trải hai dòng: bỏ qua hàng không có nhãn ở tầm, xuống hàng tiếp', () => {
    const haiHang: OChu[] = [
      { text: '77,777', x: 300.0, y: 364.1 },
      { text: '一般保険料', x: 60.0, y: 338.0 },
      { text: '子育支援金', x: 130.0, y: 338.0 },
      { text: '総支給金額', x: 290.0, y: 312.0 },
    ]
    expect(ghep(haiHang)).toEqual({ 総支給金額: 77777 })
  })

  it('bỏ giờ và ngày công, chỉ lấy tiền', () => {
    const conCham: OChu[] = [
      { text: '176:50', x: 95.2, y: 309.5 },
      { text: '22.0', x: 168.9, y: 309.5 },
      { text: '出勤時間', x: 69.4, y: 283.3 },
      { text: '出勤日数', x: 138.1, y: 283.3 },
    ]
    expect(ghep(conCham)).toEqual({})
  })

  it('số âm vẫn ghép được (DB掛金, 過不足税額)', () => {
    const am: OChu[] = [
      { text: '-10,000', x: 95.2, y: 309.5 },
      { text: 'DB掛金', x: 69.4, y: 283.3 },
    ]
    expect(ghep(am)).toEqual({ 'DB掛金': -10000 })
  })

  /**
   * Hai nhãn CÙNG lọt ngưỡng [-XSLACK, XMAX] của một số: 200−140=60 và 200−195=5,
   * cả hai ≤ 72. Luật là "gần nhất về phía TRÁI" nên nhãn x=195 thắng.
   *
   * Không có ca này thì đổi `reduce` sang chọn x NHỎ nhất vẫn xanh cả bộ — đã đo.
   * Đây đúng lớp lỗi lịch sử: ghép theo "gần tâm nhất" thay vì "gần trái".
   */
  it('hai nhãn cùng trong ngưỡng: nhãn gần nhất về phía trái thắng', () => {
    const haiUngVien: OChu[] = [
      { text: '8,888', x: 200.0, y: 309.5 },
      { text: '所得税', x: 140.0, y: 283.3 },
      { text: '住民税', x: 195.0, y: 283.3 },
    ]
    expect(ghep(haiUngVien)).toEqual({ 住民税: 8888 })
  })
})

/** Phiếu minh hoạ: gộp 400.000 − trừ 78.000 = ròng 322.000. */
function phieuDu(): OChu[] {
  return [
    { text: '2026年', x: 598.1, y: 87.3 },
    { text: '8月分', x: 632.3, y: 87.3 },
    { text: '給与', x: 661.5, y: 87.3 },
    // hàng số của khối 控除
    { text: '20,000', x: 95.2, y: 309.5 },
    { text: '36,000', x: 168.9, y: 309.5 },
    { text: '2,000', x: 335.7, y: 309.5 },
    { text: '4,000', x: 395.5, y: 309.5 },
    { text: '16,000', x: 469.2, y: 309.5 },
    { text: '健康保険料', x: 69.4, y: 283.3 },
    { text: '厚生年金保険', x: 138.1, y: 283.3 },
    { text: '雇用保険料', x: 291.9, y: 283.3 },
    { text: '所得税', x: 375.6, y: 283.3 },
    { text: '住民税', x: 447.9, y: 283.3 },
    // hàng tổng
    { text: '400,000', x: 220.0, y: 364.1 },
    { text: '78,000', x: 295.0, y: 364.1 },
    { text: '322,000', x: 370.0, y: 364.1 },
    { text: '322,000', x: 440.0, y: 364.1 },
    { text: '総支給金額', x: 217.0, y: 338.0 },
    { text: '控除合計額', x: 292.0, y: 338.0 },
    { text: '差引支給額', x: 366.0, y: 338.0 },
    { text: '銀行１振込額', x: 433.0, y: 338.0 },
  ]
}

describe('bocPhieu', () => {
  it('phiếu đủ thì không lỗi, đọc kỳ từ nội dung', () => {
    const p = bocPhieu(phieuDu(), '(0101)202608K.pdf')
    expect(p.loi).toEqual([])
    expect(p.period).toBe('202608')
    expect(p.kind).toBe('K')
    expect(p.nguonKy).toBe('noi-dung')
    expect(p.empno).toBe('0101')
    expect(p.gross).toBe(400000)
    expect(p.deductTotal).toBe(78000)
    expect(p.net).toBe(322000)
    expect(p.tru).toEqual({
      健康保険料: 20000, 厚生年金保険: 36000, 雇用保険料: 2000,
      所得税: 4000, 住民税: 16000,
    })
  })

  it('bắt lệch khi tổng mục trừ != 控除合計額', () => {
    const xau = phieuDu().map((o) => (o.text === '16,000' ? { ...o, text: '15,000' } : o))
    const p = bocPhieu(xau, '(0101)202608K.pdf')
    expect(p.loi.join(' ')).toMatch(/tổng mục trừ/)
  })

  it('bắt lệch khi gộp − trừ − 過不足 != ròng', () => {
    const xau = phieuDu().map((o) => (o.text === '400,000' ? { ...o, text: '401,000' } : o))
    const p = bocPhieu(xau, '(0101)202608K.pdf')
    expect(p.loi.join(' ')).toMatch(/差引支給/)
  })

  /**
   * 過不足税額 KHÔNG nằm trong 控除合計額 nhưng VẪN đổi tiền thật. Đẳng thức đúng là
   * gộp − 控除合計額 − 過不足税額 = ròng. Bỏ nó là mất khoản hoàn/nộp thêm cuối năm.
   */
  it('過不足税額 nằm ngoài tổng khấu trừ mà vẫn vào đẳng thức', () => {
    const t12: OChu[] = [
      ...phieuDu().filter((o) => o.text !== '322,000'),
      { text: '342,000', x: 370.0, y: 364.1 },
      { text: '342,000', x: 440.0, y: 364.1 },
      { text: '-20,000', x: 95.2, y: 340.0 },
      { text: '過不足税額', x: 69.4, y: 314.0 },
    ]
    const p = bocPhieu(t12, '(0101)202612K.pdf')
    expect(p.ngoaiTong).toEqual({ 過不足税額: -20000 })
    expect(p.loi).toEqual([])
  })

  it('nhãn lạ thì từ chối cả file và gọi tên nhãn đó ra', () => {
    const la = [...phieuDu(), { text: '9,999', x: 95.2, y: 250.0 }, { text: '謎の控除', x: 69.4, y: 224.0 }]
    const p = bocPhieu(la, '(0101)202608K.pdf')
    expect(p.nhanLa).toContain('謎の控除')
    expect(p.loi.join(' ')).toMatch(/謎の控除/)
  })

  /**
   * Ca thật: (0004)202209S.pdf tên ghi 202209 nhưng nội dung ghi 2022年7月分賞与.
   * Nội dung thắng, và phải BÁO.
   */
  it('tên file lệch nội dung: lấy nội dung và báo', () => {
    const p = bocPhieu(phieuDu(), '(0004)202209K.pdf')
    expect(p.period).toBe('202608')
    expect(p.canhBao.join(' ')).toMatch(/lệch/)
  })

  /** Hai file thật không đọc được kỳ từ nội dung → rơi về tên file. */
  it('không đọc được kỳ từ nội dung thì rơi về tên file', () => {
    const khongNgay = phieuDu().filter((o) => !o.text.includes('年') && !o.text.includes('月分'))
    const p = bocPhieu(khongNgay, '(0004)202308S.pdf')
    expect(p.period).toBe('202308')
    expect(p.kind).toBe('S')
    expect(p.nguonKy).toBe('ten-file')
  })
})
