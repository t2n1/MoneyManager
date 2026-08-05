// Test chạy bằng vitest ở Node (không phải Deno): parseYahooSpark là hàm thuần, không
// gọi mạng, nên không cần runtime Deno để canh nó.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseYahooSpark } from './prices.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const sample = JSON.parse(readFileSync(join(HERE, 'testdata/yahoo-spark-sample.json'), 'utf8'))

describe('parseYahooSpark', () => {
  it('đọc được cả ba mã của file mẫu thật, đúng giá và giá tham chiếu', () => {
    const rows = parseYahooSpark(sample)
    expect(rows).toHaveLength(3)

    const fpt = rows.find((r) => r.symbol === 'FPT')
    expect(fpt).toBeDefined()
    expect(fpt!.exchange).toBe('hose')
    expect(fpt!.price).toBe(70_300)
    expect(fpt!.prior_close).toBe(71_500)
    expect(fpt!.name).toBe('')

    const vnm = rows.find((r) => r.symbol === 'VNM')
    expect(vnm!.price).toBe(58_600)
    expect(vnm!.prior_close).toBe(59_500)

    const hpg = rows.find((r) => r.symbol === 'HPG')
    expect(hpg!.price).toBe(22_000)
    expect(hpg!.prior_close).toBe(22_150)
  })

  it('bóc hậu tố .VN khỏi mã, không giữ lại trong symbol', () => {
    const rows = parseYahooSpark(sample)
    for (const r of rows) {
      expect(r.symbol).not.toMatch(/\.VN$/i)
    }
  })

  it('trading_date tính theo giờ Việt Nam, ra đúng ngày phiên của file mẫu', () => {
    const rows = parseYahooSpark(sample)
    // timestamp 1785915907/09/18 (giây) đổi sang Asia/Ho_Chi_Minh đều rơi vào 2026-08-05
    // 14:xx — cùng một phiên chiều hôm đó.
    for (const r of rows) {
      expect(r.trading_date).toBe('2026-08-05')
    }
  })

  it('timestamp cuối ngày UTC nhưng đã sang phiên mới ở Việt Nam → trading_date phải nhảy ngày, bắt lỗi nếu lỡ tính theo UTC', () => {
    // 1785951000 = 2026-08-05T17:30:00Z (UTC), nhưng Asia/Ho_Chi_Minh (UTC+7) đã là
    // 2026-08-06 00:30 — khác ngày với UTC. Nếu code lỡ dùng
    // new Date(ts * 1000).toISOString().slice(0, 10) (bỏ qua múi giờ) thì sẽ ra
    // '2026-08-05', sai phiên. Mọi timestamp khác trong file mẫu đều rơi vào buổi
    // chiều giờ Việt Nam nên không phân biệt được hai cách tính — ca này mới bắt được.
    const json = {
      'GGG.VN': {
        timestamp: [1785951000],
        close: [10_000],
        chartPreviousClose: 9_800,
      },
    }
    const rows = parseYahooSpark(json)
    expect(rows).toHaveLength(1)
    expect(rows[0].trading_date).toBe('2026-08-06')
  })

  it('close null → bỏ mã đó, không ghi giá', () => {
    const json = {
      'AAA.VN': {
        timestamp: [1785915907],
        close: [null],
        chartPreviousClose: 12_345,
      },
    }
    expect(parseYahooSpark(json)).toEqual([])
  })

  it('close = 0 → bỏ mã đó (giá 0 tệ hơn thiếu giá)', () => {
    const json = {
      'BBB.VN': {
        timestamp: [1785915907],
        close: [0],
        chartPreviousClose: 12_345,
      },
    }
    expect(parseYahooSpark(json)).toEqual([])
  })

  it('close âm → bỏ mã đó', () => {
    const json = {
      'CCC.VN': {
        timestamp: [1785915907],
        close: [-100],
        chartPreviousClose: 12_345,
      },
    }
    expect(parseYahooSpark(json)).toEqual([])
  })

  it('thiếu chartPreviousClose → prior_close null, hàng vẫn được giữ', () => {
    const json = {
      'DDD.VN': {
        timestamp: [1785915907],
        close: [10_000],
      },
    }
    const rows = parseYahooSpark(json)
    expect(rows).toHaveLength(1)
    expect(rows[0].prior_close).toBeNull()
  })

  it('chartPreviousClose hỏng (chuỗi, 0, âm) → prior_close null, không làm rớt hàng', () => {
    for (const bad of ['71500', 0, -5]) {
      const json = {
        'EEE.VN': {
          timestamp: [1785915907],
          close: [10_000],
          chartPreviousClose: bad,
        },
      }
      const rows = parseYahooSpark(json)
      expect(rows).toHaveLength(1)
      expect(rows[0].prior_close).toBeNull()
    }
  })

  it('thiếu timestamp → bỏ mã đó (không có ngày phiên thì không biết giá của hôm nào)', () => {
    const json = {
      'FFF.VN': {
        timestamp: [],
        close: [10_000],
      },
    }
    expect(parseYahooSpark(json)).toEqual([])
  })

  it('payload lạ (không phải object) → mảng rỗng, không nổ', () => {
    expect(parseYahooSpark(null)).toEqual([])
    expect(parseYahooSpark(undefined)).toEqual([])
    expect(parseYahooSpark('lỗi')).toEqual([])
    expect(parseYahooSpark(42)).toEqual([])
    expect(parseYahooSpark({})).toEqual([])
  })

  it('mã Yahoo không biết đơn giản là vắng mặt trong payload — không cần xử lý riêng', () => {
    // Mô phỏng đúng hành vi đã đo: hỏi mã bịa kèm mã thật, Yahoo chỉ trả mã thật.
    const rows = parseYahooSpark(sample)
    expect(rows.find((r) => r.symbol === 'KHONGCO')).toBeUndefined()
  })
})
