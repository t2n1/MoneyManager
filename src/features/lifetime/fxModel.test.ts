import { describe, expect, it } from 'vitest'
import { convertMinorToday, currencyAt, fxOfRates, normalizeToPhaseCurrency } from './fxModel'
import type { LifetimeEvent, LifetimePhase } from './project'

const phase = (over: Partial<LifetimePhase> & Pick<LifetimePhase, 'startYear'>): LifetimePhase => ({
  label: 'Ở Nhật',
  country: 'JP',
  currency: 'JPY',
  annualIncomeMinor: 6_800_000,
  annualExpenseMinor: 4_300_000,
  fxToDisplay: 1,
  ...over,
})

const event = (over: Partial<LifetimeEvent> & Pick<LifetimeEvent, 'id' | 'startYear'>): LifetimeEvent => ({
  endYear: null,
  kind: 'expense',
  amountMinor: 1_000_000,
  currency: 'JPY',
  label: 'Mốc',
  fxToDisplay: 1,
  inflate: true,
  ...over,
})

/** 1¥ = 172₫, 1$ = 147¥ — cùng bộ số với ghi chú tỷ giá trong bản vẽ v5. */
const RATES = { JPY: 1, VND: 172, USD: 1 / 147 }
const fx = fxOfRates('JPY', RATES)

describe('fxOfRates', () => {
  it('cùng một đồng tiền thì luôn là 1, không cần tra bảng', () => {
    expect(fx('VND', 'VND')).toBe(1)
    expect(fxOfRates('JPY', {})('USD', 'USD')).toBe(1)
  })

  it('đi từ base ra và từ ngoài về base', () => {
    expect(fx('JPY', 'VND')).toBe(172)
    expect(fx('VND', 'JPY')).toBeCloseTo(1 / 172, 10)
  })

  it('đi giữa hai đồng KHÔNG phải base', () => {
    // 1$ = 147¥ = 147×172₫
    expect(fx('USD', 'VND')).toBeCloseTo(147 * 172, 6)
  })

  it('thiếu tỷ giá thì trả null, KHÔNG rơi về 1', () => {
    const partial = fxOfRates('JPY', { VND: 172 })
    expect(partial('USD', 'JPY')).toBeNull()
    expect(partial('JPY', 'USD')).toBeNull()
  })

  it('tỷ giá 0 hoặc âm coi như thiếu', () => {
    expect(fxOfRates('JPY', { VND: 0 })('VND', 'JPY')).toBeNull()
  })
})

describe('currencyAt', () => {
  const phases = [
    phase({ startYear: 2024, currency: 'JPY' }),
    phase({ startYear: 2040, currency: 'VND' }),
  ]

  it('lấy tiền của chặng đang phủ năm đó', () => {
    expect(currencyAt(phases, 2030, 'USD')).toBe('JPY')
    expect(currencyAt(phases, 2040, 'USD')).toBe('VND')
    expect(currencyAt(phases, 2099, 'USD')).toBe('VND')
  })

  it('năm nằm TRƯỚC chặng đầu tiên thì lấy chặng sớm nhất, không rơi về tiền hiển thị', () => {
    expect(currencyAt(phases, 2000, 'USD')).toBe('JPY')
  })

  it('không có chặng nào thì mới rơi về tiền hiển thị', () => {
    expect(currencyAt([], 2030, 'USD')).toBe('USD')
  })

  it('không phụ thuộc thứ tự mảng đầu vào', () => {
    expect(currencyAt([...phases].reverse(), 2041, 'USD')).toBe('VND')
  })
})

describe('normalizeToPhaseCurrency', () => {
  const phases = [
    phase({ startYear: 2024, currency: 'JPY' }),
    phase({ startYear: 2040, currency: 'VND', annualIncomeMinor: 0, annualExpenseMinor: 0 }),
  ]

  it('tỷ giá của chặng lấy theo HÔM NAY, bỏ con số đã lưu', () => {
    const saved = [phase({ startYear: 2024, currency: 'VND', fxToDisplay: 0.0057 })]
    const out = normalizeToPhaseCurrency(saved, [], 'JPY', fx)
    // 1₫ = 1/172 ¥ ≈ 0,005814 — KHÁC 0,0057 người dùng từng gõ.
    expect(out.phases[0].fxToDisplay).toBeCloseTo(1 / 172, 10)
    expect(out.hasMissingRate).toBe(false)
  })

  it('mốc mang tiền khác chặng thì quy về tiền của chặng', () => {
    // ₫4.200.000 trong một chặng ¥ → ¥24.418
    const out = normalizeToPhaseCurrency(
      phases,
      [event({ id: 'e1', startYear: 2026, currency: 'VND', amountMinor: 4_200_000 })],
      'JPY',
      fx,
    )
    expect(out.events[0].currency).toBe('JPY')
    expect(out.events[0].amountMinor).toBe(Math.round(4_200_000 / 172))
    expect(out.events[0].fxToDisplay).toBe(1)
    expect(out.hasMissingRate).toBe(false)
  })

  it('mốc rơi vào chặng VND thì tính bằng VND, kể cả khi đang lưu bằng JPY', () => {
    const out = normalizeToPhaseCurrency(
      phases,
      [event({ id: 'e1', startYear: 2045, currency: 'JPY', amountMinor: 1_000_000 })],
      'JPY',
      fx,
    )
    expect(out.events[0].currency).toBe('VND')
    expect(out.events[0].amountMinor).toBe(1_000_000 * 172)
    expect(out.events[0].fxToDisplay).toBeCloseTo(1 / 172, 10)
  })

  it('mốc đã đúng tiền của chặng thì giữ nguyên số, chỉ làm mới tỷ giá', () => {
    const out = normalizeToPhaseCurrency(
      phases,
      [event({ id: 'e1', startYear: 2026, currency: 'JPY', amountMinor: 999 })],
      'JPY',
      fx,
    )
    expect(out.events[0].amountMinor).toBe(999)
    expect(out.events[0].currency).toBe('JPY')
  })

  // Đây là chốt quan trọng nhất của file: rơi về 1:1 khi thiếu tỷ giá là biến
  // ₫4.200.000 thành ¥4.200.000 — sai 172 lần, ngay giữa bản chiếu.
  it('thiếu tỷ giá thì GIỮ NGUYÊN dòng và bật cờ, không quy 1:1', () => {
    const noRates = fxOfRates('JPY', {})
    const out = normalizeToPhaseCurrency(
      [phase({ startYear: 2024, currency: 'VND', fxToDisplay: 0.0057 })],
      [event({ id: 'e1', startYear: 2026, currency: 'USD', amountMinor: 500_00 })],
      'JPY',
      noRates,
    )
    expect(out.hasMissingRate).toBe(true)
    expect(out.phases[0].fxToDisplay).toBe(0.0057)
    expect(out.events[0].currency).toBe('USD')
    expect(out.events[0].amountMinor).toBe(500_00)
  })

  it('không có chặng nào thì mốc rơi về tiền hiển thị', () => {
    const out = normalizeToPhaseCurrency(
      [],
      [event({ id: 'e1', startYear: 2026, currency: 'JPY', amountMinor: 10 })],
      'JPY',
      fx,
    )
    expect(out.events[0].currency).toBe('JPY')
    expect(out.hasMissingRate).toBe(false)
  })

  it('không sửa mảng đầu vào', () => {
    const src = [event({ id: 'e1', startYear: 2045, currency: 'JPY', amountMinor: 1_000 })]
    normalizeToPhaseCurrency(phases, src, 'JPY', fx)
    expect(src[0].currency).toBe('JPY')
    expect(src[0].amountMinor).toBe(1_000)
  })
})

describe('convertMinorToday', () => {
  // Lỗi thật bắt được trên app 2026-09-02: dòng "≈ … theo JPY" của chặng Mỹ nhân THẲNG
  // số cent với tỷ giá, ra "1.8億/năm" cho một khoản 11.000 $/năm (đúng là ~162万).
  // USD có 2 chữ số lẻ, JPY có 0 — không đi qua major units là sai 100 lần.
  it('USD → JPY đi qua major units, không nhân thẳng minor với tỷ giá', () => {
    expect(convertMinorToday(11_000_00, 'USD', 'JPY', fx)).toBe(1_617_000)
    expect(convertMinorToday(11_000_00, 'USD', 'JPY', fx)).not.toBe(161_700_000)
  })

  it('JPY → VND (0 lẻ sang 0 lẻ) nhân đúng một lần', () => {
    expect(convertMinorToday(1_000, 'JPY', 'VND', fx)).toBe(172_000)
  })

  it('thiếu tỷ giá thì trả null, không quy 1:1', () => {
    expect(convertMinorToday(500_00, 'USD', 'JPY', fxOfRates('JPY', {}))).toBeNull()
  })
})
