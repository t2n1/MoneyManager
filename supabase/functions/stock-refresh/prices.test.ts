// Test chạy bằng vitest ở Node (không phải Deno): parseBoard là hàm thuần, không gọi
// mạng, nên không cần runtime Deno để canh nó.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseBoard } from './prices.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const sample = JSON.parse(readFileSync(join(HERE, 'testdata/hose-sample.json'), 'utf8'))

describe('parseBoard', () => {
  it('đọc được mã, giá, ngày phiên từ bảng giá thật của SSI', () => {
    const rows = parseBoard('hose', sample)
    const fpt = rows.find((r) => r.symbol === 'FPT')
    expect(fpt).toBeDefined()
    expect(fpt!.exchange).toBe('hose')
    expect(fpt!.price).toBeGreaterThan(0)
    expect(fpt!.name).toContain('FPT')
    // tradingDate của SSI là 'YYYYMMDD' → phải đổi sang ISO cho cột date
    expect(fpt!.trading_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('matchedPrice = 0 (ngoài giờ) → rơi về priorClosePrice', () => {
    const json = {
      data: [
        {
          stockSymbol: 'AAA',
          companyNameVi: 'Cty AAA',
          matchedPrice: 0,
          priorClosePrice: 12_345,
          refPrice: 99_999,
          tradingDate: '20260805',
        },
      ],
    }
    expect(parseBoard('hose', json)[0].price).toBe(12_345)
  })

  it('thiếu cả matchedPrice và priorClose → rơi về refPrice', () => {
    const json = {
      data: [
        {
          stockSymbol: 'BBB',
          companyNameVi: 'Cty BBB',
          matchedPrice: 0,
          priorClosePrice: 0,
          refPrice: 7_777,
          tradingDate: '20260805',
        },
      ],
    }
    expect(parseBoard('hose', json)[0].price).toBe(7_777)
  })

  it('không có giá nào dùng được → bỏ mã đó, không ghi giá 0', () => {
    const json = {
      data: [
        {
          stockSymbol: 'CCC',
          companyNameVi: 'Cty CCC',
          matchedPrice: 0,
          priorClosePrice: 0,
          refPrice: 0,
          tradingDate: '20260805',
        },
      ],
    }
    expect(parseBoard('hose', json)).toEqual([])
  })

  it('payload lạ (data không phải mảng) → mảng rỗng, không nổ', () => {
    expect(parseBoard('hose', { data: null })).toEqual([])
    expect(parseBoard('hose', {})).toEqual([])
    expect(parseBoard('hose', null)).toEqual([])
  })

  it('thiếu tradingDate → bỏ mã đó (không có ngày phiên thì không biết giá của hôm nào)', () => {
    const json = {
      data: [{ stockSymbol: 'DDD', companyNameVi: 'D', matchedPrice: 1_000, tradingDate: '' }],
    }
    expect(parseBoard('hose', json)).toEqual([])
  })
})
