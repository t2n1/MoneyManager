import { describe, expect, it } from 'vitest'
import { exportCsvFilename } from './exportFilename'

describe('exportCsvFilename', () => {
  it('chế độ tháng: đệm 0 cho tháng', () => {
    expect(exportCsvFilename('month', { year: 2026, month: 7 }, 2026)).toBe('so-chi-tieu-2026-07.csv')
  })
  it('chế độ tháng: tháng 2 chữ số', () => {
    expect(exportCsvFilename('month', { year: 2026, month: 12 }, 2026)).toBe('so-chi-tieu-2026-12.csv')
  })
  it('chế độ năm: chỉ có năm', () => {
    expect(exportCsvFilename('year', { year: 2026, month: 7 }, 2025)).toBe('so-chi-tieu-2025.csv')
  })
})
