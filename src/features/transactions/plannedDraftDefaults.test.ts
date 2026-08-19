import { describe, expect, it } from 'vitest'
import { anchoredDueOn, initialPlannedDraftForEntry } from './plannedDraftDefaults'
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

describe('anchoredDueOn — mot co che neo dung o CA HAI noi cua PlannedFields', () => {
  it('day -> month voi ngay giua thang: neo ve ngay 1', () => {
    expect(anchoredDueOn('month', '2026-10-17', '2026-10-17')).toBe('2026-10-01')
  })

  it('idempotent: neo mot ngay DA neo van ra dung no', () => {
    expect(anchoredDueOn('month', '2026-10-01', '2026-10-01')).toBe('2026-10-01')
  })

  it('precision "day" khong neo gi ca, giu nguyen raw', () => {
    expect(anchoredDueOn('day', '2026-08-20', '2026-08-20')).toBe('2026-08-20')
  })

  it('raw rong o precision "day" — roi ve previous, KHONG ra chuoi rong', () => {
    // Mo phong: da chon 19/8, nguoi dung XOA TRANG o ngay (backspace / nut xoa cua
    // trinh duyet) -> e.target.value === ''.
    expect(anchoredDueOn('day', '', '2026-08-19')).toBe('2026-08-19')
  })

  it('raw rong o precision "month" — roi ve previous roi VAN neo, KHONG ra "-01"', () => {
    expect(anchoredDueOn('month', '', '2026-10-01')).toBe('2026-10-01')
    expect(anchoredDueOn('month', '', '2026-10-01')).not.toBe('-01')
    // previous chua tung duoc neo (vd do nguoi goi truyen sai) van phai ra dung:
    // firstOfMonth khong quan tam ngay cu la bao nhieu.
    expect(anchoredDueOn('month', '', '2026-10-17')).toBe('2026-10-01')
  })

  it('ca raw va previous deu rong: khong co gi de neo (chi truoc lan gieo dau)', () => {
    expect(anchoredDueOn('day', '', '')).toBe('')
    expect(anchoredDueOn('month', '', '')).toBe('')
  })

  it('duong xoa-trang-roi-luu: ket qua di qua plannedFromEntry khong bao gio la due_on rong hoac "-01"', () => {
    // Da chon 17/10 (precision 'day'), xoa trang o ngay, roi bam Luu ngay —
    // KHONG doi sang "Khoang thang". Truoc fix: due_on se la ''.
    const afterClearDay = anchoredDueOn('day', '', '2026-10-17')
    const draftDay = {
      ...initialPlannedDraftForEntry('JPY', '2026-08-19'),
      dueOn: afterClearDay,
      title: 'x',
    }
    expect(plannedFromEntry(draftDay).due_on).toBe('2026-10-17')
    expect(plannedFromEntry(draftDay).due_on).not.toBe('')

    // Dang o "Khoang thang" (da neo ve 2026-10-01), xoa trang o ngay, bam Luu ngay.
    // Truoc fix: due_on se la '-01'.
    const afterClearMonth = anchoredDueOn('month', '', '2026-10-01')
    const draftMonth = {
      ...initialPlannedDraftForEntry('JPY', '2026-08-19'),
      dueOn: afterClearMonth,
      precision: 'month' as const,
      title: 'x',
    }
    expect(plannedFromEntry(draftMonth).due_on).toBe('2026-10-01')
    expect(plannedFromEntry(draftMonth).due_on).not.toBe('-01')
  })
})
