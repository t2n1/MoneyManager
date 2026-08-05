// Test chạy bằng vitest ở Node (không phải Deno): parseYahooSpark, chunkSymbols,
// buildFetchOrder đều là hàm thuần, không gọi mạng, nên không cần runtime Deno để canh.
// fetchYahooPrices (phần ngân sách thời gian) là ngoại lệ duy nhất cần fetch giả lập —
// KHÔNG gọi Yahoo thật, xem describe riêng cuối file.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFetchOrder, chunkSymbols, fetchYahooPrices, parseYahooSpark } from './prices.ts'

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
    // name điền từ HOSE_SYMBOLS (danh sách tĩnh), không còn rỗng như hồi Yahoo là nguồn
    // giá duy nhất — FPT chắc chắn có trong danh sách 403 mã HOSE.
    expect(fpt!.name).toBe('Công ty Cổ phần FPT')

    const vnm = rows.find((r) => r.symbol === 'VNM')
    expect(vnm!.price).toBe(58_600)
    expect(vnm!.prior_close).toBe(59_500)
    expect(vnm!.name).toBe('Công ty Cổ phần Sữa Việt Nam')

    const hpg = rows.find((r) => r.symbol === 'HPG')
    expect(hpg!.price).toBe(22_000)
    expect(hpg!.prior_close).toBe(22_150)
    expect(hpg!.name).toBe('Công ty Cổ phần Tập đoàn Hòa Phát')
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

  it('mã có giá từ Yahoo nhưng KHÔNG có trong danh sách tĩnh HOSE_SYMBOLS → name rỗng, không nổ', () => {
    // Có thật ngoài đời: mã mới lên sàn sau lần hút danh sách gần nhất, hoặc gõ nhầm
    // trong sổ lệnh. Yahoo vẫn có thể trả giá (nếu mã đó thật) — vẫn phải giữ hàng giá,
    // chỉ riêng tên là không biết.
    const json = {
      'ZZZKHONGCO.VN': {
        timestamp: [1785915907],
        close: [10_000],
        chartPreviousClose: 9_800,
      },
    }
    const rows = parseYahooSpark(json)
    expect(rows).toHaveLength(1)
    expect(rows[0].price).toBe(10_000)
    expect(rows[0].name).toBe('')
  })
})

describe('chunkSymbols', () => {
  // Bài test canh chống lại đúng lỗi đã đo ngày 2026-08-06: CHUNK_SIZE=40 (lô cũ) khiến
  // MỌI lô hơn 20 mã bị Yahoo trả 400 "Number of symbols needs to be less than or equal
  // to 20". Test này phải đỏ nếu ai đó chỉnh CHUNK_SIZE lên trên 20 — không chỉ kiểm có
  // chia lô hay không, mà kiểm ĐÚNG ranh giới 20.
  it('đúng 20 mã thì vẫn một lô, chưa cần chia (ranh giới dưới)', () => {
    const symbols = Array.from({ length: 20 }, (_, i) => `S${i}`)
    expect(chunkSymbols(symbols)).toEqual([symbols])
  })

  it('21 mã đã phải chia — lô đầu đúng 20, lô sau chỉ 1 (ranh giới trên)', () => {
    const symbols = Array.from({ length: 21 }, (_, i) => `S${i}`)
    const chunks = chunkSymbols(symbols)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(20)
    expect(chunks[1]).toHaveLength(1)
  })

  it('45 mã chia thành 20 + 20 + 5, không lô nào vượt 20 và không mất mã nào', () => {
    const symbols = Array.from({ length: 45 }, (_, i) => `S${i}`)
    const chunks = chunkSymbols(symbols)
    expect(chunks.map((c) => c.length)).toEqual([20, 20, 5])
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(20)
    expect(chunks.flat()).toEqual(symbols)
  })

  it('danh sách rỗng → không lô nào', () => {
    expect(chunkSymbols([])).toEqual([])
  })
})

describe('buildFetchOrder', () => {
  it('mã đang giữ luôn đứng trước mã không giữ, dù universe xếp theo thứ tự khác', () => {
    const held = ['VNM', 'FPT']
    const universe = ['AAA', 'FPT', 'BBB', 'VNM', 'CCC']
    expect(buildFetchOrder(held, universe)).toEqual(['VNM', 'FPT', 'AAA', 'BBB', 'CCC'])
  })

  it('mã đang giữ nhưng không có trong universe (hủy niêm yết, gõ sai) vẫn đứng đầu, không bị rớt', () => {
    const order = buildFetchOrder(['XYZ'], ['AAA', 'BBB'])
    expect(order).toEqual(['XYZ', 'AAA', 'BBB'])
  })

  it('mã vừa giữ vừa có trong universe chỉ xuất hiện một lần, không lặp', () => {
    const order = buildFetchOrder(['FPT'], ['FPT', 'AAA'])
    expect(order.filter((s) => s === 'FPT')).toHaveLength(1)
    expect(order).toEqual(['FPT', 'AAA'])
  })

  it('không giữ mã nào → thứ tự đúng bằng universe', () => {
    expect(buildFetchOrder([], ['AAA', 'BBB'])).toEqual(['AAA', 'BBB'])
  })

  it('chữ hoa/thường và khoảng trắng thừa được chuẩn hoá trước khi so trùng', () => {
    const order = buildFetchOrder([' fpt '], ['FPT', 'AAA'])
    expect(order).toEqual(['FPT', 'AAA'])
  })
})

describe('fetchYahooPrices — ngân sách thời gian (fetch giả lập, KHÔNG gọi Yahoo thật)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hết ngân sách giữa chừng thì dừng sạch và báo RIÊNG với lỗi lô — không lẫn vào nhau', async () => {
    const fakeFetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response)
    vi.stubGlobal('fetch', fakeFetch)

    // 60 mã = 3 lô 20 mã. Đồng hồ giả: mỗi lần gọi now() nhảy 40s. Lô 1 và 2 còn trong
    // ngân sách 90s (40s, 80s), lô 3 thì kiểm tra ở mốc 120s → vượt, dừng trước khi gọi.
    const symbols = Array.from({ length: 60 }, (_, i) => `S${i}`)
    let t = 0
    const now = () => {
      t += 40_000
      return t
    }

    const result = await fetchYahooPrices(symbols, { now, budgetMs: 90_000 })

    expect(fakeFetch).toHaveBeenCalledTimes(2)
    expect(result.hetNganSach).toBe(true)
    expect(result.errors.some((e) => e.includes('ngân sách'))).toBe(true)
    // Thông điệp hết ngân sách không được lẫn với thông điệp lỗi HTTP của một lô —
    // đây là chỗ index.ts/log dựa vào để phân biệt hai tình huống.
    expect(result.errors.some((e) => e.includes('HTTP'))).toBe(false)
  })

  it('lô lỗi HTTP (không phải hết ngân sách) vẫn báo lỗi bình thường, hetNganSach vẫn false', async () => {
    const fakeFetch = vi.fn(
      async () => ({ ok: false, status: 400, json: async () => ({}) }) as unknown as Response,
    )
    vi.stubGlobal('fetch', fakeFetch)

    const symbols = Array.from({ length: 20 }, (_, i) => `S${i}`)
    const result = await fetchYahooPrices(symbols, { now: () => 0, budgetMs: 90_000 })

    expect(fakeFetch).toHaveBeenCalledTimes(1)
    expect(result.hetNganSach).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('HTTP')
    expect(result.errors[0]).not.toContain('ngân sách')
  })
})
