import { describe, expect, it } from 'vitest'
import {
  eventAmountInYear,
  eventHitsYear,
  eventSpanNote,
  eventTotalMinor,
  eventYears,
  shapeOf,
  type EventShape,
} from './eventAmount'
import type { LifetimeEvent } from './project'

function shape(over: Partial<EventShape> = {}): EventShape {
  return {
    startYear: 2030,
    endYear: 2030,
    amountMinor: 1_000_000,
    amountShape: 'per_year',
    endAmountMinor: null,
    growthBps: 0,
    repeatEveryYears: null,
    ...over,
  }
}

describe('eventHitsYear', () => {
  it('trong khoảng thì rơi vào, ngoài thì không', () => {
    const e = shape({ startYear: 2030, endYear: 2032 })
    expect(eventHitsYear(e, 2029)).toBe(false)
    expect(eventHitsYear(e, 2030)).toBe(true)
    expect(eventHitsYear(e, 2032)).toBe(true)
    expect(eventHitsYear(e, 2033)).toBe(false)
  })

  it('endYear null = đến hết đời', () => {
    const e = shape({ startYear: 2030, endYear: null })
    expect(eventHitsYear(e, 2029)).toBe(false)
    expect(eventHitsYear(e, 2200)).toBe(true)
  })

  it('nhịp lặp: chỉ rơi vào năm đúng nhịp, tính TỪ năm bắt đầu', () => {
    const e = shape({ startYear: 2030, endYear: 2050, repeatEveryYears: 8 })
    expect([2030, 2038, 2046].every((y) => eventHitsYear(e, y))).toBe(true)
    expect([2031, 2037, 2039, 2050].some((y) => eventHitsYear(e, y))).toBe(false)
  })

  it('nhịp lặp 1 và null như nhau — mọi năm', () => {
    const a = shape({ endYear: 2033, repeatEveryYears: 1 })
    const b = shape({ endYear: 2033, repeatEveryYears: null })
    for (const y of [2030, 2031, 2032, 2033]) {
      expect(eventHitsYear(a, y)).toBe(eventHitsYear(b, y))
    }
  })
})

describe('eventYears', () => {
  it('đến hết đời trả null, KHÔNG trả mảng rỗng', () => {
    // Rỗng nghĩa "không năm nào", null nghĩa "vô hạn năm" — lẫn hai thứ này là cách
    // để một mốc vĩnh viễn có tổng bằng 0.
    expect(eventYears(shape({ endYear: null }))).toBeNull()
    expect(eventYears(shape({ startYear: 2030, endYear: 2029 }))).toEqual([])
  })

  it('nhịp lặp thưa ra danh sách đúng', () => {
    expect(eventYears(shape({ startYear: 2030, endYear: 2040, repeatEveryYears: 5 }))).toEqual([
      2030, 2035, 2040,
    ])
  })
})

describe("amountShape 'per_year'", () => {
  it('mỗi năm đúng con số đã khai', () => {
    const e = shape({ startYear: 2030, endYear: 2032 })
    expect([2030, 2031, 2032].map((y) => eventAmountInYear(e, y))).toEqual([
      1_000_000, 1_000_000, 1_000_000,
    ])
  })
})

describe("amountShape 'total'", () => {
  it('¥3M cưới kéo 2 năm là ¥3M, không phải ¥6M', () => {
    // Đúng cái bẫy eventSpan.ts sinh ra để cảnh báo (bắt được trên app 2026-09-02).
    const e = shape({ startYear: 2029, endYear: 2030, amountMinor: 3_000_000, amountShape: 'total' })
    expect(eventAmountInYear(e, 2029)).toBe(1_500_000)
    expect(eventAmountInYear(e, 2030)).toBe(1_500_000)
    expect(eventTotalMinor(e)).toBe(3_000_000)
  })

  it('chia lẻ vẫn cộng lại ĐÚNG bằng tổng đã khai — không mất đồng nào', () => {
    // round(1000/3)*3 = 999. Đây là lý do phép phân bổ dùng hiệu hai floor tích luỹ.
    for (const amountMinor of [1000, 1001, 999_999, 7, 1]) {
      for (const years of [2, 3, 7, 22]) {
        const e = shape({
          startYear: 2030,
          endYear: 2030 + years - 1,
          amountMinor,
          amountShape: 'total',
        })
        expect(eventTotalMinor(e)).toBe(amountMinor)
      }
    }
  })

  it('phần lẻ dồn về các năm CUỐI', () => {
    const e = shape({ startYear: 2030, endYear: 2032, amountMinor: 1000, amountShape: 'total' })
    expect([2030, 2031, 2032].map((y) => eventAmountInYear(e, y))).toEqual([333, 333, 334])
  })

  it('chia theo LẦN RƠI, không theo số năm, khi có nhịp lặp', () => {
    const e = shape({
      startYear: 2030,
      endYear: 2040,
      amountMinor: 900,
      amountShape: 'total',
      repeatEveryYears: 5,
    })
    // 3 lần rơi (2030, 2035, 2040) → 300 mỗi lần, không phải 900/11.
    expect(eventAmountInYear(e, 2030)).toBe(300)
    expect(eventAmountInYear(e, 2031)).toBe(0)
    expect(eventTotalMinor(e)).toBe(900)
  })

  it('đến hết đời thì rơi về per_year, không chia cho vô hạn', () => {
    const e = shape({ endYear: null, amountMinor: 500, amountShape: 'total' })
    expect(eventAmountInYear(e, 2030)).toBe(500)
    expect(eventAmountInYear(e, 2100)).toBe(500)
    expect(eventTotalMinor(e)).toBeNull()
  })
})

describe("amountShape 'growth'", () => {
  it('nhân dồn từ NĂM BẮT ĐẦU', () => {
    const e = shape({
      startYear: 2030,
      endYear: 2033,
      amountMinor: 1_000_000,
      amountShape: 'growth',
      growthBps: 300,
    })
    expect(eventAmountInYear(e, 2030)).toBe(1_000_000)
    expect(eventAmountInYear(e, 2031)).toBe(1_030_000)
    expect(eventAmountInYear(e, 2032)).toBe(1_060_900)
  })

  it('bps âm = số teo dần', () => {
    const e = shape({
      startYear: 2030,
      endYear: 2032,
      amountMinor: 1_000_000,
      amountShape: 'growth',
      growthBps: -1000,
    })
    expect(eventAmountInYear(e, 2031)).toBe(900_000)
    expect(eventAmountInYear(e, 2032)).toBe(810_000)
  })

  it('bps 0 = đứng yên, y hệt per_year', () => {
    const e = shape({ endYear: 2040, amountShape: 'growth', growthBps: 0 })
    expect(eventAmountInYear(e, 2035)).toBe(eventAmountInYear(shape({ endYear: 2040 }), 2035))
  })
})

describe("amountShape 'ramp'", () => {
  it('đi từ số đầu tới số cuối, tuyến tính theo năm', () => {
    const e = shape({
      startYear: 2030,
      endYear: 2040,
      amountMinor: 1_000_000,
      amountShape: 'ramp',
      endAmountMinor: 5_000_000,
    })
    expect(eventAmountInYear(e, 2030)).toBe(1_000_000)
    expect(eventAmountInYear(e, 2035)).toBe(3_000_000)
    expect(eventAmountInYear(e, 2040)).toBe(5_000_000)
  })

  it('đi xuống được (số cuối nhỏ hơn số đầu)', () => {
    const e = shape({
      startYear: 2030,
      endYear: 2032,
      amountMinor: 400,
      amountShape: 'ramp',
      endAmountMinor: 200,
    })
    expect([2030, 2031, 2032].map((y) => eventAmountInYear(e, y))).toEqual([400, 300, 200])
  })

  it('nội suy theo NĂM, không theo lần rơi', () => {
    // Đổi nhịp lặp là đổi "năm nào", không được làm con số của một năm cụ thể nhảy.
    const base = {
      startYear: 2030,
      endYear: 2040,
      amountMinor: 0,
      amountShape: 'ramp' as const,
      endAmountMinor: 1000,
    }
    const moiNam = shape({ ...base })
    const nhipNam = shape({ ...base, repeatEveryYears: 5 })
    expect(eventAmountInYear(nhipNam, 2035)).toBe(eventAmountInYear(moiNam, 2035))
  })

  it('thiếu số cuối thì rơi về per_year — con số KHÔNG biến mất', () => {
    // Dòng DB cũ hơn 0066, hoặc người dùng đang gõ dở. Trả 0 ở đây nghĩa là cả khoản
    // chi bốc hơi khỏi bản chiếu mà không có gì trên màn hình nói ra.
    const e = shape({ endYear: 2040, amountShape: 'ramp', endAmountMinor: null })
    expect(eventAmountInYear(e, 2035)).toBe(1_000_000)
  })

  it('mốc một năm thì chỉ có số đầu', () => {
    const e = shape({
      startYear: 2030,
      endYear: 2030,
      amountShape: 'ramp',
      endAmountMinor: 9_000_000,
    })
    expect(eventAmountInYear(e, 2030)).toBe(1_000_000)
  })
})

describe('shapeOf', () => {
  it('mốc dựng trước 0066 (thiếu cả bốn trường) chạy y như per_year', () => {
    const cu: LifetimeEvent = {
      id: 'e1',
      startYear: 2030,
      endYear: 2032,
      kind: 'expense',
      amountMinor: 777,
      currency: 'JPY',
      label: 'Mốc cũ',
      fxToDisplay: 1,
      inflate: false,
    }
    const s = shapeOf(cu)
    expect(s.amountShape).toBe('per_year')
    expect(s.endAmountMinor).toBeNull()
    expect(s.growthBps).toBe(0)
    expect(s.repeatEveryYears).toBeNull()
    expect([2030, 2031, 2032].map((y) => eventAmountInYear(s, y))).toEqual([777, 777, 777])
  })
})

describe('eventSpanNote', () => {
  it('mốc một năm không có gì để nói thêm', () => {
    expect(eventSpanNote(shape({ startYear: 2029, endYear: 2029 }))).toBeNull()
  })

  it('khoảng gõ dở (năm cuối < năm đầu) cũng không nói gì', () => {
    expect(eventSpanNote(shape({ startYear: 2029, endYear: 2027 }))).toBeNull()
  })

  it('per_year: tổng là số × số năm', () => {
    const n = eventSpanNote(
      shape({ startYear: 2029, endYear: 2030, amountMinor: 3_000_000 }),
    )
    expect(n).toMatchObject({ shape: 'per_year', years: 2, hits: 2, totalMinor: 6_000_000 })
  })

  it('total: tổng ĐÚNG bằng số đã khai, không nhân lên', () => {
    // Đây là lớp lỗi mà eventSpan.ts cũ sinh ra để cảnh báo — giờ nó không xảy ra nữa.
    const n = eventSpanNote(
      shape({ startYear: 2029, endYear: 2030, amountMinor: 3_000_000, amountShape: 'total' }),
    )
    expect(n).toMatchObject({ totalMinor: 3_000_000, firstMinor: 1_500_000 })
  })

  it('ramp: mang cả hai đầu để câu giải thích nói được "từ … tới …"', () => {
    const n = eventSpanNote(
      shape({
        startYear: 2030,
        endYear: 2032,
        amountMinor: 400,
        amountShape: 'ramp',
        endAmountMinor: 200,
      }),
    )
    expect(n).toMatchObject({ firstMinor: 400, lastMinor: 200, totalMinor: 900 })
  })

  it('đến hết đời: không có tổng, nhưng có số của năm đầu', () => {
    const n = eventSpanNote(shape({ endYear: null, amountMinor: 1_100_000 }))
    expect(n).toMatchObject({ years: null, hits: null, totalMinor: null, firstMinor: 1_100_000 })
  })

  it('nhịp lặp: đếm LẦN RƠI, không đếm năm', () => {
    const n = eventSpanNote(
      shape({ startYear: 2030, endYear: 2050, amountMinor: 100, repeatEveryYears: 8 }),
    )
    expect(n).toMatchObject({ years: 21, hits: 3, repeatEveryYears: 8, totalMinor: 300 })
  })
})
