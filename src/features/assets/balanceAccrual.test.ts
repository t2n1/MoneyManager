import { describe, expect, it } from 'vitest'
import { monthKeyForDate } from '../../lib/dates'
import {
  measureMonthlyContribution,
  projectBalance,
  KIKIN_GIVE_RATE_BPS_2025,
  type ContributionRow,
} from './balanceAccrual'

const r = (monthKey: string, minor: number): ContributionRow => ({ monthKey, minor })

/** Sổ thật của chủ app tính tới 2026-08: tháng 5 vào ¥20.000 (bù tháng 4), rồi ¥10.000/tháng. */
const THAT = [r('2026-05', 20_000), r('2026-06', 10_000), r('2026-07', 10_000), r('2026-08', 10_000)]

describe('measureMonthlyContribution', () => {
  it('không có dòng nào → không đo được', () => {
    expect(measureMonthlyContribution([])).toEqual({ minorPerMonth: 0, monthsObserved: 0 })
  })

  /**
   * Đây là lý do hàm này dùng TRUNG VỊ. Trung bình bốn tháng thật ra ¥12.500 — một mức
   * đóng không tồn tại trên hợp đồng nào — và sai số đó được nhân lên vài trăm lần ở con
   * số chiếu tới lúc nghỉ.
   */
  it('tháng bù không kéo mức đóng lên: ¥10.000, không phải ¥12.500', () => {
    expect(measureMonthlyContribution(THAT)).toEqual({
      minorPerMonth: 10_000,
      monthsObserved: 4,
    })
  })

  it('cộng nhiều dòng trong CÙNG một tháng thành một tháng', () => {
    const c = measureMonthlyContribution([r('2026-07', 4_000), r('2026-07', 6_000), r('2026-08', 10_000)])
    expect(c).toEqual({ minorPerMonth: 10_000, monthsObserved: 2 })
  })

  it('số tháng chẵn → trung vị là bình quân hai giá trị giữa', () => {
    const c = measureMonthlyContribution([r('a', 10_000), r('b', 20_000)])
    expect(c.minorPerMonth).toBe(15_000)
  })

  it('tháng KHÔNG có dòng nào thì không đếm — thiếu phiếu chưa phải là ngừng đóng', () => {
    // Ba tháng có đóng, tháng 6 chưa nhập phiếu. Nếu đếm tháng rỗng là 0 thì trung vị
    // tụt xuống ¥5.000 và con số chiếu tới hụt một nửa.
    const c = measureMonthlyContribution([r('2026-05', 10_000), r('2026-07', 10_000), r('2026-08', 10_000)])
    expect(c).toEqual({ minorPerMonth: 10_000, monthsObserved: 3 })
  })
})

describe('projectBalance', () => {
  /** Tháng theo cách người dùng chia tháng — xem chú thích ở projectBalance. */
  const NAY = { year: 2026, month: 8 }
  const DEU = { minorPerMonth: 10_000, monthsObserved: 4 }

  it('đếm đúng số tháng còn đóng tới đầu năm đích', () => {
    // 2026-09..2026-12 là 4 tháng, cộng 29 năm trọn 2027..2055 = 348 → 352.
    const p = projectBalance(50_000, DEU, 2056, NAY)
    expect(p).toEqual({ months: 352, minor: 50_000 + 352 * 10_000, minorAtRate: null })
  })

  it('mốc gần: nghỉ đầu năm sau thì chỉ còn mấy tháng cuối năm nay', () => {
    expect(projectBalance(50_000, DEU, 2027, NAY)).toEqual({
      months: 4,
      minor: 90_000,
      minorAtRate: null,
    })
  })

  it('năm đích đã qua hoặc là năm nay → không chiếu', () => {
    expect(projectBalance(50_000, DEU, 2026, NAY)).toBeNull()
    expect(projectBalance(50_000, DEU, 2020, NAY)).toBeNull()
  })

  it('không đo được mức đóng → không chiếu, không lặng lẽ trả về chính số dư', () => {
    expect(projectBalance(50_000, { minorPerMonth: 0, monthsObserved: 0 }, 2056, NAY)).toBeNull()
  })

  it('nhập vào tháng 12 thì hết năm nay không còn tháng nào', () => {
    expect(projectBalance(0, DEU, 2027, { year: 2026, month: 12 })).toEqual({
      months: 0,
      minor: 0,
      minorAtRate: null,
    })
  })

  /**
   * Khoá lại lỗi đã có thật: bản đầu của `projectBalance` tự cắt `todayISO.slice(5,7)` ra
   * lấy tháng, nên luôn ra tháng DƯƠNG LỊCH và bỏ qua `month_start_day` — trong khi nửa
   * còn lại của cùng tính năng (`measureMonthlyContribution`) thì tôn trọng cài đặt đó.
   * Cùng một ngày, hai cách chia tháng, hai số tháng còn đóng khác nhau.
   */
  it('tháng phải do tầng gọi tính theo monthStartDay, không cắt từ chuỗi ngày', () => {
    const ngay = '2026-08-26'
    expect(projectBalance(0, DEU, 2027, monthKeyForDate(ngay, 1))?.months).toBe(4)
    // Ngày 26 chưa qua mốc 28 → vẫn thuộc "tháng 7" của người dùng → còn thêm một tháng.
    expect(projectBalance(0, DEU, 2027, monthKeyForDate(ngay, 28))?.months).toBe(5)
  })
})

describe('projectBalance — phần lãi hiệu chuẩn', () => {
  const NAY = { year: 2026, month: 8 }
  /**
   * Ba mốc neo là 36 / 108 / 180 tháng, đều chia hết cho 12. Với `month = 8` thì số tháng
   * đạt được luôn `≡ 4 (mod 12)` nên KHÔNG mốc nào tới được; phải đứng ở tháng 12, lúc đó
   * `months = 12 × (toYear − 2027)` và ba mốc ứng với 2030 / 2036 / 2042.
   */
  const CUOI_NAM = { year: 2026, month: 12 }
  const DEU_10K = { minorPerMonth: 10_000, monthsObserved: 4 }
  const DEU_20K = { minorPerMonth: 20_000, monthsObserved: 12 }

  it('không truyền suất lãi → minorAtRate là null, số sàn không đổi', () => {
    const p = projectBalance(50_000, DEU_10K, 2056, NAY)!
    expect(p.minor).toBe(3_570_000)
    expect(p.minorAtRate).toBeNull()
  })

  /**
   * GROUND TRUTH. Đồ thị trên sheet 基金 (プラン①, ¥20.000/tháng, 年利0,3%) in ba con số
   * lãi: ¥4.328 / ¥32.660 / ¥87.622 ở mốc 3 / 9 / 15 năm.
   *
   * Ghép lãi tháng thuần ở 0,3%/12 cho ra ¥3.159 / ¥29.147 / ¥81.758 — thấp hơn 基金 lần
   * lượt 37% / 12% / 7%, và tỷ lệ đó GIẢM DẦN theo số tháng nên không có MỘT suất nào
   * khớp cả ba. Không rõ 月次再評価率 của họ cộng theo quy tắc gì, nên spec chốt hiệu chuẩn
   * theo chính ba điểm đó (Q2).
   */
  it.each([
    [2030, 36, 4_328],
    [2036, 108, 32_660],
    [2042, 180, 87_622],
  ])('dựng lại đúng lãi của đồ thị 基金: %i → %i tháng → ¥%i', (toYear, months, expected) => {
    const p = projectBalance(0, DEU_20K, toYear, CUOI_NAM, KIKIN_GIVE_RATE_BPS_2025)!
    expect(p.months).toBe(months)
    expect(p.minorAtRate! - p.minor).toBe(expected)
  })

  it('suất 0 bps → minorAtRate bằng đúng số sàn, không âm không NaN', () => {
    const p = projectBalance(50_000, DEU_20K, 2056, NAY, 0)!
    expect(p.minorAtRate).toBe(p.minor)
  })

  it('lãi luôn ≥ 0 và tăng theo suất', () => {
    const a = projectBalance(50_000, DEU_20K, 2056, NAY, 30)!
    const b = projectBalance(50_000, DEU_20K, 2056, NAY, 100)!
    expect(a.minorAtRate!).toBeGreaterThan(a.minor)
    expect(b.minorAtRate!).toBeGreaterThan(a.minorAtRate!)
  })

  /** Con số thật của chủ app hôm nay: ¥50.000 + ¥10.000/tháng tới 2056 ở 0,3%. */
  it('chiếu của chủ app tới 2056 ra ¥3.745.050', () => {
    const p = projectBalance(50_000, DEU_10K, 2056, NAY, KIKIN_GIVE_RATE_BPS_2025)!
    expect(p.minor).toBe(3_570_000)
    expect(p.minorAtRate).toBe(3_745_050)
  })
})
