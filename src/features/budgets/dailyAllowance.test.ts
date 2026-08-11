import { describe, expect, it } from 'vitest'
import { dailyAllowance } from './dailyAllowance'

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
