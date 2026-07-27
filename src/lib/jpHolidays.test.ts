import { describe, expect, it } from 'vitest'
import { isJpBankHoliday, isJpPublicHoliday } from './jpHolidays'

/** Mọi ngày lễ của một năm, để so với lịch Nhật công bố. */
function holidaysOf(year: number): string[] {
  const out: string[] = []
  for (let m = 1; m <= 12; m++) {
    const last = new Date(year, m, 0).getDate()
    for (let d = 1; d <= last; d++) {
      const iso = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (isJpPublicHoliday(iso)) out.push(iso)
    }
  }
  return out
}

describe('isJpPublicHoliday', () => {
  it('đúng danh sách 18 ngày lễ năm 2026 theo lịch Nhật', () => {
    expect(holidaysOf(2026)).toEqual([
      '2026-01-01', // 元日
      '2026-01-12', // 成人の日 (T2 tuần 2)
      '2026-02-11', // 建国記念の日
      '2026-02-23', // 天皇誕生日
      '2026-03-20', // 春分の日
      '2026-04-29', // 昭和の日
      '2026-05-03', // 憲法記念日 (CN)
      '2026-05-04', // みどりの日
      '2026-05-05', // こどもの日
      '2026-05-06', // 振替休日 vì 3/5 rơi Chủ nhật
      '2026-07-20', // 海の日 (T2 tuần 3)
      '2026-08-11', // 山の日
      '2026-09-21', // 敬老の日 (T2 tuần 3)
      '2026-09-22', // 国民の休日 (kẹp giữa hai ngày lễ)
      '2026-09-23', // 秋分の日
      '2026-10-12', // スポーツの日 (T2 tuần 2)
      '2026-11-03', // 文化の日
      '2026-11-23', // 勤労感謝の日
    ])
  })

  it('đúng danh sách 2024 — năm có tới 4 ngày nghỉ bù', () => {
    expect(holidaysOf(2024)).toEqual([
      '2024-01-01',
      '2024-01-08', // 成人の日
      '2024-02-11', // 建国記念の日 rơi Chủ nhật
      '2024-02-12', // → nghỉ bù
      '2024-02-23',
      '2024-03-20', // 春分の日
      '2024-04-29',
      '2024-05-03',
      '2024-05-04',
      '2024-05-05', // こどもの日 rơi Chủ nhật
      '2024-05-06', // → nghỉ bù
      '2024-07-15', // 海の日
      '2024-08-11', // 山の日 rơi Chủ nhật
      '2024-08-12', // → nghỉ bù
      '2024-09-16', // 敬老の日
      '2024-09-22', // 秋分の日 rơi Chủ nhật
      '2024-09-23', // → nghỉ bù
      '2024-10-14', // スポーツの日
      '2024-11-03', // 文化の日 rơi Chủ nhật
      '2024-11-04', // → nghỉ bù
      '2024-11-23',
    ])
  })

  it('ngày lễ rơi Chủ nhật thì nghỉ bù ngày làm việc kế tiếp', () => {
    // 23/2/2025 là Chủ nhật → 24/2 nghỉ bù
    expect(isJpPublicHoliday('2025-02-23')).toBe(true)
    expect(isJpPublicHoliday('2025-02-24')).toBe(true)
    expect(isJpPublicHoliday('2025-02-25')).toBe(false)
  })

  it('ngày thường thì không phải lễ', () => {
    expect(isJpPublicHoliday('2026-06-27')).toBe(false) // Thứ 7 nhưng không phải lễ
    expect(isJpPublicHoliday('2026-04-30')).toBe(false)
    expect(isJpPublicHoliday('2026-07-27')).toBe(false)
  })

  it('xuân phân / thu phân chạy theo năm', () => {
    expect(isJpPublicHoliday('2025-03-20')).toBe(true)
    expect(isJpPublicHoliday('2024-03-20')).toBe(true)
    expect(isJpPublicHoliday('2027-03-21')).toBe(true)
    expect(isJpPublicHoliday('2027-03-20')).toBe(false)
  })
})

describe('isJpBankHoliday', () => {
  it('cuối tuần và ngày lễ đều là ngày ngân hàng nghỉ', () => {
    expect(isJpBankHoliday('2026-06-27')).toBe(true) // Thứ 7
    expect(isJpBankHoliday('2026-06-28')).toBe(true) // Chủ nhật
    expect(isJpBankHoliday('2026-04-29')).toBe(true) // 昭和の日
    expect(isJpBankHoliday('2026-06-29')).toBe(false) // Thứ 2 thường
  })

  it('kỳ nghỉ Tết 31/12–3/1 ngân hàng đóng dù không phải ngày lễ', () => {
    expect(isJpBankHoliday('2026-12-31')).toBe(true)
    expect(isJpBankHoliday('2027-01-02')).toBe(true)
    expect(isJpBankHoliday('2027-01-03')).toBe(true)
    expect(isJpBankHoliday('2027-01-04')).toBe(false) // Thứ 2, mở lại
  })
})
