import { describe, expect, it } from 'vitest'
import { decomposeFxReturn, type FxDayRates, type FxDecomposePoint } from './fxDecompose'

// Ca thật 06/08→20/08/2026 (iDragon): ₫ −2,21%, tỷ giá +1,81%, ¥ −0,44%.
const REAL_POINTS: FxDecomposePoint[] = [
  { on: '2026-08-06', valueMinor: 347_952_768 },
  { on: '2026-08-20', valueMinor: 340_270_268 },
]
const REAL_FX: FxDayRates[] = [
  { on_date: '2026-08-06', rates: { VND: 165.432222, USD: 0.006345 } },
  { on_date: '2026-08-20', rates: { VND: 162.490686, USD: 0.006307 } },
]

describe('decomposeFxReturn', () => {
  it('ca thật iDragon: (1+rAsset)(1+rFx) = 1+rBase, đúng dấu từng phần', () => {
    const d = decomposeFxReturn({
      points: REAL_POINTS,
      currency: 'VND',
      base: 'JPY',
      fxDays: REAL_FX,
    })
    expect(d).not.toBeNull()
    expect(d!.rAsset).toBeCloseTo(-0.02208, 4)
    expect(d!.rFx).toBeCloseTo(0.0181, 3)
    expect(d!.rBase).toBeCloseTo(-0.00438, 4)
    expect((1 + d!.rAsset) * (1 + d!.rFx)).toBeCloseTo(1 + d!.rBase, 10)
  })

  it('cùng tiền với base thì không có gì để tách', () => {
    expect(
      decomposeFxReturn({ points: REAL_POINTS, currency: 'JPY', base: 'JPY', fxDays: REAL_FX }),
    ).toBeNull()
  })

  it('tỷ giá lệch quá maxGapDays quanh mốc định giá → null, không đoán', () => {
    const d = decomposeFxReturn({
      points: REAL_POINTS,
      currency: 'VND',
      base: 'JPY',
      fxDays: [{ on_date: '2026-08-12', rates: { VND: 163 } }], // cách cả hai mốc >3 ngày
    })
    expect(d).toBeNull()
  })

  it('chọn dòng tỷ giá gần mốc nhất trong ±3 ngày (bảng có lỗ là bình thường)', () => {
    const d = decomposeFxReturn({
      points: REAL_POINTS,
      currency: 'VND',
      base: 'JPY',
      fxDays: [
        { on_date: '2026-08-04', rates: { VND: 165.861397 } }, // cách 06/08 hai ngày
        { on_date: '2026-08-19', rates: { VND: 162.997251 } }, // cách 20/08 một ngày
      ],
    })
    expect(d).not.toBeNull()
    expect(d!.rFx).toBeCloseTo(165.861397 / 162.997251 - 1, 6)
  })

  it('mốc đầu kỳ là dòng GẦN (cuối − windowDays) nhất, không phải dòng cũ nhất', () => {
    const points: FxDecomposePoint[] = [
      { on: '2026-05-01', valueMinor: 300_000_000 }, // quá xa — không được chọn
      { on: '2026-07-22', valueMinor: 350_000_000 }, // gần mốc 30 ngày nhất
      { on: '2026-08-20', valueMinor: 340_270_268 },
    ]
    const fx: FxDayRates[] = [
      { on_date: '2026-05-01', rates: { VND: 170 } },
      { on_date: '2026-07-22', rates: { VND: 165 } },
      { on_date: '2026-08-20', rates: { VND: 162.490686 } },
    ]
    const d = decomposeFxReturn({ points, currency: 'VND', base: 'JPY', fxDays: fx })
    expect(d!.from).toBe('2026-07-22')
    expect(d!.rAsset).toBeCloseTo(340_270_268 / 350_000_000 - 1, 6)
  })

  it('hai mốc sát nhau dưới 7 ngày → null (phần trăm chỉ là nhiễu)', () => {
    const d = decomposeFxReturn({
      points: [
        { on: '2026-08-18', valueMinor: 338_039_068 },
        { on: '2026-08-20', valueMinor: 340_270_268 },
      ],
      currency: 'VND',
      base: 'JPY',
      fxDays: REAL_FX,
    })
    expect(d).toBeNull()
  })
})
