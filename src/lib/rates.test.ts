import { beforeEach, describe, expect, it } from 'vitest'
import {
  convertBetween,
  convertFromBase,
  convertToBase,
  formatRateLine,
  readRatesMeta,
  STALE_RATE_DAYS,
} from './rates'

// rates: 1 đơn vị base đổi được bao nhiêu đơn vị ngoại tệ (major units),
// đúng format của open.er-api.com với base = JPY.
const RATES = { JPY: 1, VND: 165, USD: 0.0065 }

describe('convertToBase (base = JPY)', () => {
  it('JPY → JPY giữ nguyên', () => {
    expect(convertToBase(1234, 'JPY', 'JPY', RATES)).toBe(1234)
  })

  it('VND → JPY (minor VND / rate)', () => {
    // 1.650.000 ₫ / 165 = ¥10.000
    expect(convertToBase(1650000, 'VND', 'JPY', RATES)).toBe(10000)
  })

  it('USD → JPY (cent → major → chia rate)', () => {
    // $65,00 = 6500 cents → 65 / 0.0065 = ¥10.000
    expect(convertToBase(6500, 'USD', 'JPY', RATES)).toBe(10000)
  })

  it('làm tròn về số nguyên minor units của base', () => {
    // 100 ₫ / 165 = 0.606... → ¥1
    expect(convertToBase(100, 'VND', 'JPY', RATES)).toBe(1)
  })

  it('thiếu rate → null (UI fallback tách loại tiền)', () => {
    expect(convertToBase(100, 'VND', 'JPY', { JPY: 1 })).toBeNull()
  })
})

describe('convertFromBase (base = JPY)', () => {
  it('cùng loại tiền → giữ nguyên', () => {
    expect(convertFromBase(1234, 'JPY', 'JPY', RATES)).toBe(1234)
  })

  it('JPY → VND (major × rate)', () => {
    // ¥10.000 × 165 = 1.650.000 ₫
    expect(convertFromBase(10000, 'JPY', 'VND', RATES)).toBe(1650000)
  })

  it('JPY → USD (major × rate → cent)', () => {
    // ¥10.000 × 0.0065 = $65,00 = 6500 cents
    expect(convertFromBase(10000, 'JPY', 'USD', RATES)).toBe(6500)
  })

  it('làm tròn về số nguyên minor units của tiền đích', () => {
    // ¥1 × 0.0065 = $0,0065 = 0,65 cent → 1 cent
    expect(convertFromBase(1, 'JPY', 'USD', RATES)).toBe(1)
  })

  it('số âm quy đổi giữ dấu (nợ thẻ, lãi/lỗ)', () => {
    expect(convertFromBase(-10000, 'JPY', 'VND', RATES)).toBe(-1650000)
  })

  it('thiếu rate → null', () => {
    expect(convertFromBase(100, 'JPY', 'VND', { JPY: 1 })).toBeNull()
  })

  it('rate rác (0, âm, NaN) → null, không ra Infinity', () => {
    expect(convertFromBase(100, 'JPY', 'VND', { VND: 0 })).toBeNull()
    expect(convertFromBase(100, 'JPY', 'VND', { VND: -5 })).toBeNull()
    expect(convertFromBase(100, 'JPY', 'VND', { VND: Number.NaN })).toBeNull()
  })
})

describe('convertBetween (base = JPY)', () => {
  it('cùng loại tiền → giữ nguyên, không đi qua base', () => {
    expect(convertBetween(1234, 'VND', 'VND', 'JPY', RATES)).toBe(1234)
  })

  it('từ base đi ra = convertFromBase', () => {
    expect(convertBetween(10000, 'JPY', 'VND', 'JPY', RATES)).toBe(1650000)
  })

  it('về base = convertToBase', () => {
    expect(convertBetween(1650000, 'VND', 'JPY', 'JPY', RATES)).toBe(10000)
  })

  it('hai tiền ngoại đi qua base: USD → VND', () => {
    // $65,00 → ¥10.000 → 1.650.000 ₫
    expect(convertBetween(6500, 'USD', 'VND', 'JPY', RATES)).toBe(1650000)
  })

  it('thiếu tỷ giá ở một trong hai chặng → null', () => {
    expect(convertBetween(6500, 'USD', 'VND', 'JPY', { USD: 0.0065 })).toBeNull()
    expect(convertBetween(6500, 'USD', 'VND', 'JPY', { VND: 165 })).toBeNull()
  })
})

// Phép thử `rateAgeDays` đã bỏ cùng với hàm đó — tuổi tỷ giá nay đo ở lib/freshness.ts
// (xem freshness.test.ts). Giữ lại đúng con số ngưỡng, vì nó là thứ hai file cùng đọc.
describe('ngưỡng tỷ giá cũ', () => {
  it('là 3 ngày', () => {
    expect(STALE_RATE_DAYS).toBe(3)
  })
})

describe('readRatesMeta', () => {
  // Vitest chạy môi trường node → không có localStorage. Cài bản giả trong bộ nhớ
  // (giống demoRepo.test.ts, backupImport.test.ts).
  beforeEach(() => {
    const store = new Map<string, string>()
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size
      },
    } as Storage
  })

  it('chưa có cache → null', () => {
    expect(readRatesMeta('JPY')).toBeNull()
  })

  it('JSON hỏng → null, không ném lỗi', () => {
    localStorage.setItem('sct-rates-JPY', '{khong-phai-json')
    expect(readRatesMeta('JPY')).toBeNull()
  })

  it('thiếu trường rates → null', () => {
    localStorage.setItem('sct-rates-JPY', JSON.stringify({ fetchedAt: 1 }))
    expect(readRatesMeta('JPY')).toBeNull()
  })

  it('cache cũ (ghi trước bản này) → đọc được, sourceUpdatedAt undefined', () => {
    localStorage.setItem(
      'sct-rates-JPY',
      JSON.stringify({ rates: { VND: 165 }, fetchedAt: 111 }),
    )
    const meta = readRatesMeta('JPY')
    expect(meta?.fetchedAt).toBe(111)
    expect(meta?.sourceUpdatedAt).toBeUndefined()
  })

  it('cache mới → đọc đủ cả ba trường', () => {
    localStorage.setItem(
      'sct-rates-JPY',
      JSON.stringify({ rates: { VND: 165 }, fetchedAt: 111, sourceUpdatedAt: 222 }),
    )
    const meta = readRatesMeta('JPY')
    expect(meta?.rates.VND).toBe(165)
    expect(meta?.sourceUpdatedAt).toBe(222)
  })

  it('rates là mảng (JSON hỏng dạng khác) → {} chứ không crash', () => {
    localStorage.setItem('sct-rates-JPY', JSON.stringify({ rates: [1, 2, 3], fetchedAt: 1 }))
    const meta = readRatesMeta('JPY')
    expect(meta?.rates).toEqual({})
  })

  it('khoá lạ không phải mã tiền → bị loại, khoá hợp lệ vẫn giữ', () => {
    localStorage.setItem(
      'sct-rates-JPY',
      JSON.stringify({ rates: { EUR: 0.006, VND: 165 }, fetchedAt: 1 }),
    )
    const meta = readRatesMeta('JPY')
    expect(meta?.rates).toEqual({ VND: 165 })
  })

  it('mỗi base có khoá riêng', () => {
    localStorage.setItem(
      'sct-rates-VND',
      JSON.stringify({ rates: { JPY: 0.006 }, fetchedAt: 1, sourceUpdatedAt: 2 }),
    )
    expect(readRatesMeta('JPY')).toBeNull()
    expect(readRatesMeta('VND')?.sourceUpdatedAt).toBe(2)
  })
})

describe('formatRateLine', () => {
  it('tỷ giá >= 1 → viết xuôi, làm tròn theo decimals của tiền đích', () => {
    // 1 yên đổi được 165,43 đồng; VND không có số lẻ
    expect(formatRateLine('JPY', 'VND', 165.432222)).toBe('¥1 = 165 ₫')
  })

  it('tỷ giá < 1 → lật ngược cho khỏi ra 0,00xx', () => {
    // 1 yên = 0,006345 đô → lật thành 1 đô = 157,6 yên
    expect(formatRateLine('JPY', 'USD', 0.006345)).toBe('$1 = ¥158')
  })

  it('nhóm hàng nghìn theo đúng dấu của từng loại tiền', () => {
    // VND dùng dấu chấm ngăn nghìn, không có số lẻ
    expect(formatRateLine('JPY', 'VND', 1234.4)).toBe('¥1 = 1.234 ₫')
    // Nhánh lật ngược cũng phải nhóm nghìn: 1/0,0000379 ≈ 26.385
    expect(formatRateLine('VND', 'USD', 0.0000379)).toBe('$1 = 26.385 ₫')
  })

  it('USD ở vế giá trị → 2 số lẻ, dấu CHẤM thập phân (chuẩn Mỹ)', () => {
    // Con số không có thật ngoài đời, ở đây chỉ để soi nhánh decimals = 2
    expect(formatRateLine('VND', 'USD', 2.5)).toBe('1 ₫ = $2.50')
    // Có cả hàng nghìn thì thấy rõ hai dấu khác nhau trong một chuỗi
    expect(formatRateLine('VND', 'USD', 1234.5)).toBe('1 ₫ = $1,234.50')
  })

  it('cùng loại tiền → null (không có gì để nói)', () => {
    expect(formatRateLine('JPY', 'JPY', 1)).toBeNull()
  })

  it('số rác từ nguồn → null, không ra Infinity', () => {
    expect(formatRateLine('JPY', 'VND', 0)).toBeNull()
    expect(formatRateLine('JPY', 'VND', -5)).toBeNull()
    expect(formatRateLine('JPY', 'VND', Number.NaN)).toBeNull()
    expect(formatRateLine('JPY', 'VND', Number.POSITIVE_INFINITY)).toBeNull()
  })
})
