import { describe, expect, it } from 'vitest'
import { latY } from './docPdfWeb'

/**
 * pdf.js đo y từ ĐỈNH trang, boc.ts làm việc trong hệ của pypdf (y tăng lên trên).
 * Đo thật trên một phiếu 2022: nhãn y=283.3 (pypdf) ⇄ y=311.7 (pdf.js), số
 * y=309.5 ⇄ y=285.5. Cả hai cặp cộng lại đúng 595 = chiều cao trang.
 */
describe('latY', () => {
  it('lật đúng theo chiều cao trang', () => {
    expect(latY(311.7, 595)).toBeCloseTo(283.3, 1)
    expect(latY(285.5, 595)).toBeCloseTo(309.5, 1)
  })

  it('sau khi lật, số nằm TRÊN nhãn (y lớn hơn)', () => {
    const yNhan = latY(311.7, 595)
    const ySo = latY(285.5, 595)
    expect(ySo).toBeGreaterThan(yNhan)
  })
})
