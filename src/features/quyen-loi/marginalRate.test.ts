import { describe, expect, it } from 'vitest'
import { LUAT_2026 } from './rules/2026'
import { suatBienTuThue, thueTheoBac, tienTietKiem } from './marginalRate'

describe('thueTheoBac — 速算表', () => {
  it('bậc 5%: 1.000.000 → 50.000', () => expect(thueTheoBac(1_000_000, LUAT_2026)).toBe(50_000))
  it('bậc 10%: 3.000.000 → 300.000 − 97.500', () => expect(thueTheoBac(3_000_000, LUAT_2026)).toBe(202_500))
  it('bậc 20%: 5.000.000 → 572.500', () => expect(thueTheoBac(5_000_000, LUAT_2026)).toBe(572_500))
  it('≤ 0 → 0', () => expect(thueTheoBac(0, LUAT_2026)).toBe(0))
})

describe('suatBienTuThue — đảo bảng từ Σ所得税 cả năm (đã gồm 2,1%)', () => {
  it('thuế 50.000 × 1,021 → bậc 5%', () => {
    expect(suatBienTuThue(Math.round(50_000 * 1.021), LUAT_2026)).toBe(0.05)
  })
  it('thuế của 課税所得 5.000.000 → bậc 20%', () => {
    expect(suatBienTuThue(Math.round(572_500 * 1.021), LUAT_2026)).toBe(0.2)
  })
  it('đúng biên: thuế tại 1.949.000 vẫn là 5%, tại 1.950.000 là 10%', () => {
    expect(suatBienTuThue(Math.round(thueTheoBac(1_949_000, LUAT_2026) * 1.021), LUAT_2026)).toBe(0.05)
    expect(suatBienTuThue(Math.round(thueTheoBac(1_950_000, LUAT_2026) * 1.021), LUAT_2026)).toBe(0.1)
  })
  it('không nộp thuế (≤ 0) → null, không đoán', () => {
    expect(suatBienTuThue(0, LUAT_2026)).toBeNull()
    expect(suatBienTuThue(-3_000, LUAT_2026)).toBeNull()
  })
})

describe('tienTietKiem', () => {
  it('38万 所得税 ở bậc 10% + 33万 住民税 10%', () => {
    // 380.000 × 0,10 × 1,021 = 38.798 ; 330.000 × 0,10 = 33.000 → 71.798
    expect(tienTietKiem(380_000, 330_000, 0.1, LUAT_2026)).toBe(71_798)
  })
})
