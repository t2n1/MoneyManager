import { describe, expect, it } from 'vitest'
import { initialPlannedDraftForEntry } from './plannedDraftDefaults'
import { firstOfMonth, plannedFromEntry } from './plannedFromEntry'

describe('gieo dueOn = hom nay — khong de trong nhu initialPlannedDraft', () => {
  it('dueOn la ngay duoc truyen vao, khong phai rong', () => {
    const d = initialPlannedDraftForEntry('JPY', '2026-08-19')
    expect(d.dueOn).toBe('2026-08-19')
    expect(d.dueOn).not.toBe('')
  })

  it('cac field khac giong initialPlannedDraft — chi dueOn doi', () => {
    const d = initialPlannedDraftForEntry('VND', '2026-08-19')
    expect(d.title).toBe('')
    expect(d.precision).toBe('day')
    expect(d.remind).toBe(true)
    expect(d.remindDays).toBe('0')
    expect(d.currency).toBe('VND')
  })

  it('lo hong da dong: bam Luu ngay luc vua bat "Khoang thang" khong con ra due_on "-01"', () => {
    // Truoc khi qua ham nay, initialPlannedDraft('JPY').dueOn === '' nen
    // firstOfMonth('') === '-01' — mot ngay ISO khong hop le. Sau khi gieo hom nay,
    // due_on luon la mot ngay thuc du nguoi dung chua tung cham vao o ngay.
    const draft = {
      ...initialPlannedDraftForEntry('JPY', '2026-08-19'),
      precision: 'month' as const,
      title: 'Sửa nhà',
    }
    const out = plannedFromEntry(draft)
    expect(out.due_on).toBe(firstOfMonth('2026-08-19'))
    expect(out.due_on).not.toBe('-01')
  })

  it('precision "day" cung khong con due_on rong', () => {
    const draft = { ...initialPlannedDraftForEntry('JPY', '2026-08-19'), title: 'x' }
    expect(plannedFromEntry(draft).due_on).toBe('2026-08-19')
  })
})
