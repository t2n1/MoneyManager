import { describe, expect, it } from 'vitest'
import { LUAT_2026 } from './2026'
import { LUAT_2022 } from './2022'
import { luatChoNam } from './luat'

describe('LUAT_2026 — số đúng như nguồn NTA (tra 2026-09-02)', () => {
  it('扶養控除: ngưỡng 38万 cho 30–69; mức 38万/48万 (所得税), 33万/38万 (住民税)', () => {
    expect(LUAT_2026.fuyo.nguong30_69).toBe(380_000)
    expect(LUAT_2026.fuyo.khauTruShotoku).toEqual({ thuong: 380_000, laoNhan: 480_000 })
    expect(LUAT_2026.fuyo.khauTruJumin).toEqual({ thuong: 330_000, laoNhan: 380_000 })
    expect(LUAT_2026.fuyo.thuNhapToiDa).toBe(580_000)
  })
  it('住民税: 均等割 5.000 (gồm 森林環境税 1.000), 所得割 10%', () => {
    expect(LUAT_2026.jumin).toEqual({ kinhToDan: 5_000, suatShotokuWari: 0.1 })
  })
  it('速算表 7 bậc (NTA No.2260) + 復興特別所得税 2,1%', () => {
    expect(LUAT_2026.phucHung).toBe(1.021)
    expect(LUAT_2026.shotokuBac).toEqual([
      { toiDa: 1_949_000, suat: 0.05, tru: 0 },
      { toiDa: 3_299_000, suat: 0.1, tru: 97_500 },
      { toiDa: 6_949_000, suat: 0.2, tru: 427_500 },
      { toiDa: 8_999_000, suat: 0.23, tru: 636_000 },
      { toiDa: 17_999_000, suat: 0.33, tru: 1_536_000 },
      { toiDa: 39_999_000, suat: 0.4, tru: 2_796_000 },
      { toiDa: Infinity, suat: 0.45, tru: 4_796_000 },
    ])
  })
  it('ふるさと納税: tự chịu 2.000, 20% 所得割; NISA 120万/240万/1.800万', () => {
    expect(LUAT_2026.furusato).toEqual({ tuChiu: 2_000, tyLeShotokuWari: 0.2 })
    expect(LUAT_2026.nisa).toEqual({ tsumitate: 1_200_000, growth: 2_400_000, tongDoi: 18_000_000 })
  })
  it('mỗi bộ luật có ít nhất một URL nguồn', () => {
    expect(LUAT_2026.nguon.length).toBeGreaterThan(0)
    expect(LUAT_2022.nguon.length).toBeGreaterThan(0)
  })
})

describe('luatChoNam', () => {
  it('≤ 2022 không có ngưỡng 38万 (trước 令和5年分)', () => {
    expect(luatChoNam(2022).fuyo.nguong30_69).toBeNull()
    expect(luatChoNam(2021)).toBe(LUAT_2022)
  })
  it('2023 trở đi dùng bộ 2026', () => {
    expect(luatChoNam(2023)).toBe(LUAT_2026)
    expect(luatChoNam(2026)).toBe(LUAT_2026)
    expect(luatChoNam(2030)).toBe(LUAT_2026) // chưa có file năm đó → bộ gần nhất
  })
})
