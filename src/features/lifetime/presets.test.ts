import { describe, expect, it } from 'vitest'
import { LIFE_PRESETS, type PresetContext } from './presets'

const ctx: PresetContext = {
  scenarioId: 's1',
  year: 2029,
  currency: 'JPY',
  country: 'JP',
  currentIncomeMinor: 6_000_000,
  currentExpenseMinor: 4_000_000,
  fxToDisplay: 1,
  displayCurrency: 'JPY',
  fxOf: () => 1,
}

function preset(id: string) {
  const p = LIFE_PRESETS.find((x) => x.id === id)
  if (!p) throw new Error(`Không có mẫu ${id}`)
  return p
}

describe('LIFE_PRESETS', () => {
  it('có đúng 6 mẫu', () => {
    expect(LIFE_PRESETS.map((p) => p.id).sort()).toEqual(
      ['chuyen-nuoc', 'cuoi', 'ho-tro-bo-me', 'mua-nha', 'nghi-huu', 'sinh-con'].sort(),
    )
  })

  it('mọi bản ghi sinh ra đều gắn đúng scenario_id', () => {
    for (const p of LIFE_PRESETS) {
      const r = p.build(ctx)
      for (const x of [...r.phases, ...r.events]) expect(x.scenario_id).toBe('s1')
    }
  })

  it('cưới sinh 1 chặng và 1 sự kiện chi một lần', () => {
    const r = preset('cuoi').build(ctx)
    expect(r.phases).toHaveLength(1)
    expect(r.phases[0].start_year).toBe(2029)
    expect(r.events).toHaveLength(1)
    expect(r.events[0].kind).toBe('expense')
    expect(r.events[0].end_year).toBe(2029)
  })

  it('sinh con sinh chùm sự kiện theo mốc tuổi con, không sinh chặng', () => {
    const r = preset('sinh-con').build({ ...ctx, year: 2029 })
    expect(r.phases).toHaveLength(0)
    expect(r.events.length).toBeGreaterThanOrEqual(4)
    // Trợ cấp 児童手当: thu, tới năm con 15 tuổi, KHÔNG theo lạm phát
    const tro = r.events.find((e) => e.kind === 'income')!
    expect(tro.end_year).toBe(2029 + 15)
    expect(tro.inflate).toBe(false)
    // Đại học: 4 năm, theo lạm phát
    const dh = r.events.find((e) => e.label.includes('đại học'))!
    expect(dh.end_year! - dh.start_year).toBe(3)
    expect(dh.inflate).toBe(true)
  })

  it('mọi khoảng sự kiện đều hợp lệ: end_year null hoặc >= start_year', () => {
    for (const p of LIFE_PRESETS) {
      for (const e of p.build(ctx).events) {
        if (e.end_year !== null) expect(e.end_year).toBeGreaterThanOrEqual(e.start_year)
      }
    }
  })

  it('nghỉ hưu sinh chặng thu nền 0 và sự kiện lương hưu chạy tới hết đời', () => {
    const r = preset('nghi-huu').build(ctx)
    expect(r.phases[0].annual_income_minor).toBe(0)
    const luong = r.events.find((e) => e.kind === 'income')!
    expect(luong.end_year).toBeNull()
    expect(luong.inflate).toBe(false)
  })

  it('chuyển nước giữ nguyên tiền của ngữ cảnh cho sự kiện chi phí chuyển', () => {
    const r = preset('chuyen-nuoc').build({ ...ctx, currency: 'USD' })
    expect(r.events[0].currency).toBe('USD')
  })

  it('mua nhà sinh chi một lần và khoản trả vay có hạn', () => {
    const r = preset('mua-nha').build(ctx)
    expect(r.events).toHaveLength(2)
    const vay = r.events.find((e) => e.label.includes('vay'))!
    expect(vay.end_year).not.toBeNull()
    expect(vay.end_year!).toBeGreaterThan(vay.start_year)
  })

  it('hỗ trợ bố mẹ mặc định tiền VND', () => {
    const r = preset('ho-tro-bo-me').build(ctx)
    expect(r.events[0].currency).toBe('VND')
  })

  it('sự kiện tiền khác ctx.currency lấy fx_to_display từ fxOf, KHÔNG lấy ctx.fxToDisplay', () => {
    const usdCtx: PresetContext = {
      ...ctx,
      currency: 'USD',
      displayCurrency: 'USD',
      // Sentinel cố tình khác biệt: nếu code lỡ dùng nhầm ctx.fxToDisplay thay vì
      // fxOf(tiền sự kiện) thì assertion dưới sẽ lộ ra ngay (999 không khớp gì cả).
      fxToDisplay: 999,
      fxOf: (currency) => {
        if (currency === 'VND') return 0.000041
        if (currency === 'JPY') return 0.0067
        return null
      },
    }

    const ho = preset('ho-tro-bo-me').build(usdCtx)
    expect(ho.events[0].currency).toBe('VND')
    expect(ho.events[0].fx_to_display).toBe(0.000041)
    expect(ho.events[0].fx_to_display).not.toBe(999)

    const hu = preset('nghi-huu').build(usdCtx)
    const luong = hu.events.find((e) => e.kind === 'income')!
    expect(luong.currency).toBe('JPY')
    expect(luong.fx_to_display).toBe(0.0067)
    expect(luong.fx_to_display).not.toBe(999)
  })

  it('fxOf không tra được (null) thì fx_to_display là 1 — giá trị cố ý, banner phát hiện được', () => {
    const noRateCtx: PresetContext = {
      ...ctx,
      currency: 'USD',
      displayCurrency: 'USD',
      // Sentinel khác 1: nếu code lỡ giữ nguyên ctx.fxToDisplay thay vì fallback về 1
      // khi fxOf() trả null, assertion dưới sẽ lộ ra (444 không khớp 1).
      fxToDisplay: 444,
      fxOf: () => null,
    }
    const r = preset('ho-tro-bo-me').build(noRateCtx)
    expect(r.events[0].currency).toBe('VND')
    expect(r.events[0].fx_to_display).toBe(1)
  })

  it('tiền sự kiện trùng displayCurrency thì fx_to_display là 1 (fxOf bị bỏ qua)', () => {
    const jpyCtx: PresetContext = {
      ...ctx,
      currency: 'JPY',
      displayCurrency: 'JPY',
      // Sentinel khác 1: nếu code lỡ dùng ctx.fxToDisplay thay vì short-circuit 1 khi
      // currency trùng displayCurrency, assertion dưới sẽ lộ ra (500 không khớp 1).
      fxToDisplay: 500,
      // Trả một số khác 1 để chứng minh nó KHÔNG được dùng khi tiền đã trùng display.
      fxOf: () => 42,
    }
    const r = preset('nghi-huu').build(jpyCtx)
    const luong = r.events.find((e) => e.kind === 'income')!
    expect(luong.currency).toBe('JPY')
    expect(luong.fx_to_display).toBe(1)
  })
})
