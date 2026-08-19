import { describe, expect, it } from 'vitest'
import {
  firstOfMonth, initialPlannedDraft, plannedFromEntry, plannedMissing,
} from './plannedFromEntry'

const draft = (over = {}) => ({ ...initialPlannedDraft('JPY'), title: 'Sửa nhà', ...over })

describe('neo ngay 1 khi do chac chan la "khoang thang"', () => {
  it('firstOfMonth giu nam-thang, ep ngay ve 01', () => {
    expect(firstOfMonth('2026-10-17')).toBe('2026-10-01')
    expect(firstOfMonth('2026-10-01')).toBe('2026-10-01')
  })

  it('precision month thi due_on ra ngay 1 du nguoi dung da chon ngay 17', () => {
    // Ca nay chinh la ly do phai neo o CA HAI cho: chon "Dung ngay" 17/10 roi doi
    // sang "Khoang thang" thi dueOn con nguyen 2026-10-17 trong state.
    const out = plannedFromEntry(draft({ dueOn: '2026-10-17', precision: 'month' }))
    expect(out.due_on).toBe('2026-10-01')
    expect(out.due_precision).toBe('month')
  })

  it('precision day thi giu nguyen ngay', () => {
    expect(plannedFromEntry(draft({ dueOn: '2026-08-20', precision: 'day' })).due_on)
      .toBe('2026-08-20')
  })
})

describe('nhac la TUY CHON cua khoan sap chi, khong phai ban chat', () => {
  it('mac dinh cua form moi: BAT nhac, 0 ngay', () => {
    const d = initialPlannedDraft('JPY')
    expect(d.remind).toBe(true)
    expect(d.remindDays).toBe('0')
    expect(plannedFromEntry({ ...d, title: 'x' }).remind_days_before).toBe(0)
  })

  it('tat nhac thi remind_days_before = null, khong phai 0', () => {
    // null = chi nam trong danh sach cho nho, khong keu. 0 = keu dung ngay den han.
    expect(plannedFromEntry(draft({ remind: false })).remind_days_before).toBeNull()
  })

  it('so ngay chi nhan 0-99 (rang buoc DB)', () => {
    expect(plannedFromEntry(draft({ remindDays: '150' })).remind_days_before).toBe(99)
    expect(plannedFromEntry(draft({ remindDays: '-5' })).remind_days_before).toBe(0)
    expect(plannedFromEntry(draft({ remindDays: '' })).remind_days_before).toBe(0)
    expect(plannedFromEntry(draft({ remindDays: 'abc' })).remind_days_before).toBe(0)
  })
})

describe('dieu kien luu: CHI CAN co ten', () => {
  it('co ten la luu duoc, so tien va danh muc de trong duoc', () => {
    expect(plannedMissing(draft({ amount: 0, categoryId: null }))).toBeNull()
  })

  it('khong ten thi khong luu duoc, va cau thieu dung chu cua form that', () => {
    expect(plannedMissing(draft({ title: '   ' }))).toBe('Còn thiếu: chi cái gì.')
  })
})

describe('KHONG co o tai khoan', () => {
  it('payload khong mang account_id — chua tru tien thi chua can biet tru tu dau', () => {
    expect('account_id' in plannedFromEntry(draft())).toBe(false)
  })

  it('payload dung bang 9 khoa cua form that', () => {
    expect(Object.keys(plannedFromEntry(draft())).sort()).toEqual([
      'amount', 'category_id', 'currency', 'due_on', 'due_precision',
      'note', 'remind_days_before', 'tag_ids', 'title',
    ])
  })
})
