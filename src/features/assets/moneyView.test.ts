import { describe, expect, it } from 'vitest'
import { makeMoneyView } from './moneyView'

// 1 yên = 165 đồng = 0,0065 đô — cùng bộ số với rates.test.ts cho dễ dò.
const RATES = { JPY: 1, VND: 165, USD: 0.0065 }

describe('makeMoneyView — xem bằng tiền gốc (JPY)', () => {
  const mv = makeMoneyView('JPY', 'JPY', RATES)

  it('không quy đổi gì: số base giữ nguyên', () => {
    expect(mv.converted).toBe(false)
    expect(mv.view(10000)).toEqual({ amount: 10000, currency: 'JPY', approx: false })
  })

  it('dòng tài khoản ngoại tệ vẫn hiện tiền riêng của nó', () => {
    expect(mv.view(1650000, 'VND')).toEqual({ amount: 1650000, currency: 'VND', approx: false })
  })

  it('fmt không có ≈, trừ khi extraApprox (tổng gộp ngoại tệ)', () => {
    expect(mv.fmt(10000)).toBe('¥10,000')
    expect(mv.fmt(10000, 'JPY', true)).toBe('≈ ¥10,000')
  })
})

describe('makeMoneyView — xem thử bằng VND (base JPY)', () => {
  const mv = makeMoneyView('JPY', 'VND', RATES)

  it('số base quy đổi sang VND, kèm approx', () => {
    expect(mv.converted).toBe(true)
    expect(mv.view(10000)).toEqual({ amount: 1650000, currency: 'VND', approx: true })
  })

  it('tài khoản USD cũng quy về VND (đi qua base)', () => {
    expect(mv.view(6500, 'USD')).toEqual({ amount: 1650000, currency: 'VND', approx: true })
  })

  it('tài khoản vốn là VND giữ nguyên — số thật, không ≈', () => {
    expect(mv.view(1650000, 'VND')).toEqual({ amount: 1650000, currency: 'VND', approx: false })
  })

  it('fmt tự kèm ≈ khi có quy đổi', () => {
    expect(mv.fmt(10000)).toBe('≈ 1.650.000 ₫')
    expect(mv.fmt(1650000, 'VND')).toBe('1.650.000 ₫')
  })

  it('thiếu tỷ giá → giữ nguyên tiền cũ, không ≈', () => {
    const thieu = makeMoneyView('JPY', 'VND', { VND: 165 })
    expect(thieu.view(6500, 'USD')).toEqual({ amount: 6500, currency: 'USD', approx: false })
  })
})
