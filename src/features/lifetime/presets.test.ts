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
    // Trợ cấp 児童手当 SAU CẢI CÁCH 10/2024: thu, tới hết cấp ba (18 tuổi), KHÔNG theo lạm phát
    const tro = r.events.find((e) => e.kind === 'income')!
    expect(tro.end_year).toBe(2029 + 18)
    expect(tro.inflate).toBe(false)
    // Đại học: 4 năm, theo lạm phát
    const dh = r.events.find((e) => e.label.includes('đại học'))!
    expect(dh.end_year! - dh.start_year).toBe(3)
    expect(dh.inflate).toBe(true)
  })

  it('các bậc nuôi con không chồng lấn và không hở năm nào giữa các mốc tuổi', () => {
    const r = preset('sinh-con').build(ctx)
    // Chỉ xét các sự kiện CHI theo bậc tuổi (loại trợ cấp thu ra, nó chạy song song
    // chứ không phải một bậc tuổi nối tiếp bậc khác).
    const bands = r.events.filter((e) => e.kind === 'expense').sort((a, b) => a.start_year - b.start_year)
    expect(bands.length).toBeGreaterThanOrEqual(4)
    for (let i = 0; i < bands.length - 1; i++) {
      // Bậc sau phải bắt đầu ĐÚNG một năm sau khi bậc trước kết thúc: không chồng lấn
      // (bằng hoặc nhỏ hơn end_year của bậc trước) và không hở (lớn hơn end_year + 1).
      expect(bands[i + 1].start_year).toBe(bands[i].end_year! + 1)
    }
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

  // Kỳ vọng ĐỔI CÓ Ý ĐỊNH (trước là `toBe('USD')` — "giữ nguyên tiền của ngữ cảnh"):
  // độ lớn 2.500.000 của chi phí chuyển được viết theo YÊN, nên rơi về ctx.currency là
  // ra ₫2.500.000 (~100 đô) cho cả một lần chuyển nước ở chặng VND. Xem QUY ƯỚC ĐƠN VỊ
  // ở đầu presets.ts: số mặc định phải mang đúng đơn vị mà độ lớn của nó viết cho.
  it('chuyển nước ép cứng JPY cho chi phí chuyển — độ lớn viết theo yên', () => {
    const r = preset('chuyen-nuoc').build({ ...ctx, currency: 'USD' })
    expect(r.events[0].currency).toBe('JPY')
    // Chặng thì vẫn theo ctx.currency: nó mang thu/chi nền của chính chặng đó.
    expect(r.phases[0].currency).toBe('USD')
  })

  // Canh QUY ƯỚC ĐƠN VỊ cho CẢ BỘ mẫu, không chỉ một mẫu: mọi sự kiện phải ép cứng
  // currency, không dòng nào rơi về ctx.currency. Không có phép thử này thì mẫu thêm sau
  // lại lặng lẽ lấy tiền của chặng cho một độ lớn viết theo yên.
  it('không sự kiện nào của mẫu rơi về ctx.currency — mọi độ lớn tự mang đơn vị', () => {
    // Chặng dùng USD — khác cả JPY lẫn VND, tức khác mọi đơn vị mà các số mặc định
    // được viết cho. Dòng nào rơi về ctx.currency sẽ lộ ra là 'USD'.
    const usdCtx: PresetContext = { ...ctx, currency: 'USD', displayCurrency: 'USD' }
    for (const p of LIFE_PRESETS) {
      for (const e of p.build(usdCtx).events) {
        expect(['JPY', 'VND'], `${p.id} · ${e.label}`).toContain(e.currency)
      }
    }
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
