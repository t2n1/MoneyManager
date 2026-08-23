import { describe, expect, it } from 'vitest'
import { dailyAllowance, spendableSegments } from './dailyAllowance'

describe('dailyAllowance', () => {
  it('đếm cả hôm nay vào số ngày còn lại', () => {
    // Ngày 20 của tháng 31 ngày: hôm nay vẫn tiêu được → 12 ngày, không phải 11.
    expect(dailyAllowance(12000, 20, 31)?.daysLeft).toBe(12)
  })

  it('ngày đầu tháng thì còn nguyên cả tháng', () => {
    expect(dailyAllowance(3100, 1, 31)?.daysLeft).toBe(31)
  })

  it('ngày cuối tháng còn đúng 1 ngày', () => {
    expect(dailyAllowance(5000, 31, 31)).toEqual({ remaining: 5000, daysLeft: 1, perDay: 5000 })
  })

  it('chia đều số tiền còn lại cho số ngày còn lại', () => {
    expect(dailyAllowance(12000, 20, 31)?.perDay).toBe(1000)
  })

  it('làm tròn XUỐNG, không lên', () => {
    // 999 / 10 = 99,9 → 99. Nói 100 thì 10 ngày sau vượt trần 1 đồng.
    expect(dailyAllowance(999, 22, 31)?.perDay).toBe(99)
  })

  it('trả null khi đã tiêu vừa hết trần', () => {
    expect(dailyAllowance(0, 10, 31)).toBeNull()
  })

  it('trả null khi đã vượt trần', () => {
    expect(dailyAllowance(-5000, 10, 31)).toBeNull()
  })

  it('trả null khi không còn ngày nào để chia', () => {
    // daysElapsed vượt quá số ngày trong tháng (tháng đã qua) → không có gì để nói.
    expect(dailyAllowance(12000, 32, 31)).toBeNull()
  })
})

describe('spendableSegments', () => {
  it('chưa đặt trần thì không có thanh nào', () => {
    expect(spendableSegments(0, 5_000, 0)).toBeNull()
  })

  it('ba đoạn cộng lại đúng bằng cả thanh', () => {
    const s = spendableSegments(350_000, 270_311, 62_590)!
    expect(s.spent + s.committed + s.free).toBeCloseTo(1, 10)
    expect(Math.round(s.spent * 1000) / 10).toBe(77.2)
    expect(s.freeAmount).toBe(17_099)
  })

  // Mẫu số là TRẦN, nên vượt trần là thanh đầy — không phải một thanh dài hơn khung.
  it('vượt trần thì đoạn đã chi chiếm cả thanh', () => {
    const s = spendableSegments(100_000, 120_000, 5_000)!
    expect(s.spent).toBe(1)
    expect(s.committed).toBe(0)
    expect(s.free).toBe(0)
    expect(s.freeAmount).toBe(-25_000)
  })

  // B36.2: còn tiền trong trần mà đã hứa hết là tin PHẢI nói ra, nên freeAmount giữ dấu âm.
  it('hứa quá phần còn lại thì đoạn tự do hết chỗ nhưng số tiền vẫn âm', () => {
    const s = spendableSegments(100_000, 80_000, 32_000)!
    expect(s.free).toBe(0)
    expect(s.committed).toBeCloseTo(0.2, 10)
    expect(s.freeAmount).toBe(-12_000)
  })

  it('cam kết âm (dữ liệu lạ) không kéo đoạn nào ra ngoài', () => {
    const s = spendableSegments(100_000, 20_000, -5_000)!
    expect(s.committed).toBe(0)
    expect(s.freeAmount).toBe(80_000)
  })
})
