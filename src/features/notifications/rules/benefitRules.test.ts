import { describe, expect, it } from 'vitest'
import type { KetLuan } from '../../quyen-loi/ketLuan'
import type { NotificationInput } from '../types'
import { benefitRules } from './benefitRules'

const k = (p: Partial<KetLuan>): KetLuan => ({
  id: 'fuyo', year: 2026, trang_thai: 'thieu', muc: 'medium', tiet_kiem_uoc: null, han: '2026-12-31',
  viec: 'Còn ¥180.000 để Em đủ 38万 · 3 tháng nữa', ly_do: ['Tiền ước'], ...p,
})
const input = (benefits?: KetLuan[]) => ({ todayISO: '2026-10-05', benefits }) as unknown as NotificationInput

describe('benefitRules', () => {
  it('benefits undefined → im (chưa tải, không đoán)', () => {
    expect(benefitRules(input(undefined))).toEqual([])
  })
  it('fuyo thieu → benefit-fuyo-shortfall, severity = muc, key không kèm kỳ', () => {
    const [n] = benefitRules(input([k({ muc: 'high' })]))
    expect(n).toMatchObject({ type: 'benefit-fuyo-shortfall', kind: 'action', severity: 'high', key: 'benefit-fuyo-shortfall:all', to: '/quyen-loi', onISO: '2026-12-31' })
    expect(n.title).toBe('Còn ¥180.000 để Em đủ 38万 · 3 tháng nữa')
  })
  it('fuyo du / thieu-du-lieu → không sinh shortfall', () => {
    expect(benefitRules(input([k({ trang_thai: 'du' })]))).toEqual([])
    expect(benefitRules(input([k({ trang_thai: 'thieu-du-lieu' })]))).toEqual([])
  })
  it('remit-unassigned thieu → action low', () => {
    const [n] = benefitRules(input([k({ id: 'remit-unassigned', muc: 'low', han: null, viec: '3 lần gửi tiền chưa gán người nhận' })]))
    expect(n).toMatchObject({ type: 'benefit-remit-unassigned', severity: 'low', key: 'benefit-remit-unassigned:all' })
  })
  it('refund thieu → benefit-refund-years với hạn', () => {
    const [n] = benefitRules(input([k({ id: 'refund', muc: 'high', han: '2026-12-31', viec: '2 năm cũ đủ điều kiện' })]))
    expect(n).toMatchObject({ type: 'benefit-refund-years', severity: 'high', onISO: '2026-12-31' })
  })
  it('furusato + shelter thieu → MỘT tin để biết gộp, key có năm', () => {
    const out = benefitRules(input([
      k({ id: 'furusato', viec: 'Còn ≈ ¥40.000 furusato chưa dùng · hết 31/12' }),
      k({ id: 'shelter', viec: 'Còn ¥1.100.000 hạn mức NISA/iDeCo chưa dùng · hết 31/12' }),
    ]))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ type: 'benefit-year-end', kind: 'info', key: 'benefit-year-end:2026' })
    expect(out[0].title).toContain('furusato')
    expect(out[0].detail).toContain('NISA')
  })
  it('furusato onestop (muc high) vẫn đi qua year-end với severity high', () => {
    const [n] = benefitRules(input([k({ id: 'furusato', muc: 'high', viec: 'Nếu nộp 確定申告 … ワンストップ sẽ vô hiệu' })]))
    expect(n.severity).toBe('high')
  })
})
