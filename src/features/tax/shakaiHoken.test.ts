import { describe, expect, it } from 'vitest'
import {
  gradeOf,
  standardMonthlyFromPension,
  standardMonthlyOf,
  KOSEI_NENKIN_LADDER,
  KOSEI_NENKIN_EMPLOYEE_RATE,
} from './shakaiHoken'

describe('KOSEI_NENKIN_LADDER', () => {
  it('có đúng 32 bậc, đầu ¥88.000 cuối ¥650.000', () => {
    expect(KOSEI_NENKIN_LADDER).toHaveLength(32)
    expect(KOSEI_NENKIN_LADDER[0]).toBe(88_000)
    expect(KOSEI_NENKIN_LADDER[31]).toBe(650_000)
  })

  /**
   * Đối chiếu với PDF gốc của 日本年金機構 (令和8年度) qua CỘT TIỀN PHÍ: mỗi mức nhân
   * 18,3% phải ra đúng số 全額 in trên bảng, và một nửa của nó là 折半額. Đây là cách
   * bảng được kiểm lúc viết spec — không đọc mắt.
   */
  it('mỗi mức nhân 18,3% ra số tròn đồng, và nửa của nó là phần người lao động', () => {
    for (const std of KOSEI_NENKIN_LADDER) {
      const full = std * 0.183
      expect(Math.abs(full - Math.round(full * 100) / 100)).toBeLessThan(0.001)
      expect(std * KOSEI_NENKIN_EMPLOYEE_RATE * 2).toBeCloseTo(full, 6)
    }
  })

  it('tăng đơn điệu, mọi mức tròn nghìn', () => {
    for (let i = 1; i < KOSEI_NENKIN_LADDER.length; i++) {
      expect(KOSEI_NENKIN_LADDER[i]).toBeGreaterThan(KOSEI_NENKIN_LADDER[i - 1])
    }
    expect(KOSEI_NENKIN_LADDER.every((v) => v % 1000 === 0)).toBe(true)
  })
})

describe('gradeOf', () => {
  /** Biên là TRUNG ĐIỂM hai mức liền nhau — đã kiểm 31/31 biên khớp PDF. */
  it('bậc 19 (¥300.000) trải từ ¥290.000 tới dưới ¥310.000', () => {
    expect(gradeOf(290_000)).toBe(19)
    expect(gradeOf(300_000)).toBe(19)
    expect(gradeOf(309_999)).toBe(19)
    expect(gradeOf(310_000)).toBe(20)
    expect(gradeOf(289_999)).toBe(18)
  })

  it('bậc 2 (¥98.000) trải từ ¥93.000 tới dưới ¥101.000', () => {
    expect(gradeOf(93_000)).toBe(2)
    expect(gradeOf(100_999)).toBe(2)
    expect(gradeOf(101_000)).toBe(3)
  })

  /**
   * Hai đầu thang HỞ: bậc 1 là `93.000円未満`, bậc 32 là `635.000円以上`. Luật trung
   * điểm không áp được ở đó, và spec chốt trả `null` chứ không kẹp — kẹp là lặng lẽ
   * trả lời sai cho một mức lương app chưa hề kiểm (健康保険 còn bậc ngoài thang này).
   */
  it('ngoài khoảng đã kiểm thì trả null, KHÔNG kẹp về hai đầu', () => {
    expect(gradeOf(87_999)).toBeNull()
    expect(gradeOf(650_001)).toBeNull()
    expect(gradeOf(0)).toBeNull()
    expect(gradeOf(-1)).toBeNull()
    expect(gradeOf(Number.NaN)).toBeNull()
  })

  it('đúng biên dưới ¥88.000 và biên trên ¥650.000 vẫn nhận', () => {
    expect(gradeOf(88_000)).toBe(1)
    expect(gradeOf(650_000)).toBe(32)
  })
})

describe('standardMonthlyOf', () => {
  it('bậc 19 là ¥300.000; bậc ngoài 1..32 là null', () => {
    expect(standardMonthlyOf(19)).toBe(300_000)
    expect(standardMonthlyOf(1)).toBe(88_000)
    expect(standardMonthlyOf(32)).toBe(650_000)
    expect(standardMonthlyOf(0)).toBeNull()
    expect(standardMonthlyOf(33)).toBeNull()
  })
})

describe('standardMonthlyFromPension', () => {
  it('¥27.450 phí → 標準報酬月額 ¥300.000', () => {
    // 300.000 × 9,15% = 27.450 đúng bằng số 折半額 in trên bảng ở bậc 19.
    expect(standardMonthlyFromPension(27_450, false)).toBe(300_000)
  })

  it('sai số làm tròn đồng của phiếu vẫn về đúng bậc', () => {
    expect(standardMonthlyFromPension(27_449, false)).toBe(300_000)
    expect(standardMonthlyFromPension(27_451, false)).toBe(300_000)
  })

  /**
   * R1 của spec. 厚生年金基金加入員 đóng 13,300%–15,900% theo 免除保険料率 chứ không
   * 18,300%, nên phép chia cho 0,0915 ra một con số 標準報酬月額 SAI — và sai đó chảy vào
   * cả khối "đã giảm được" lẫn khối lương hưu. Thà không nói còn hơn nói sai.
   */
  it('phiếu có dòng 厚生年金基金 → null, không đoán', () => {
    expect(standardMonthlyFromPension(27_450, true)).toBeNull()
  })

  it('phí bằng 0 hoặc âm → null', () => {
    expect(standardMonthlyFromPension(0, false)).toBeNull()
    expect(standardMonthlyFromPension(-100, false)).toBeNull()
  })

  it('phí ứng với mức ngoài thang → null', () => {
    expect(standardMonthlyFromPension(80_000, false)).toBeNull()
  })
})
