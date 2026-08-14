import { describe, expect, it } from 'vitest'
import { ghep, type OChu } from './boc'

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
