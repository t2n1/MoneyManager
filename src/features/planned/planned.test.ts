import { describe, expect, it } from 'vitest'
import type { Rates } from '../../lib/rates'
import type { PlannedExpenseRow } from '../../types/database.types'
import { daysUntil, groupPlannedByMonth, plannedDue, plannedOutlook } from './planned'

const TODAY = '2026-08-10'
// Rates = "1 base đổi được bao nhiêu đơn vị tiền kia" → 1.000.000 ₫ = ¥6.000
const RATES: Rates = { VND: 1_000_000 / 6_000 }

const plan = (over: Partial<PlannedExpenseRow> & { id: string }): PlannedExpenseRow => ({
  user_id: 'u',
  title: `Khoản ${over.id}`,
  amount: 10_000,
  currency: 'JPY',
  due_on: '2026-08-20',
  due_precision: 'day',
  remind_days_before: null,
  category_id: null,
  account_id: null,
  status: 'planned',
  transaction_id: null,
  note: '',
  created_at: '',
  updated_at: '',
  ...over,
})

describe('daysUntil', () => {
  it('đếm đúng cả khi qua tháng và qua năm', () => {
    expect(daysUntil('2026-08-10', '2026-08-20')).toBe(10)
    expect(daysUntil('2026-08-10', '2026-08-10')).toBe(0)
    expect(daysUntil('2026-08-20', '2026-08-10')).toBe(-10)
    expect(daysUntil('2026-12-31', '2027-01-01')).toBe(1)
  })
})

describe('plannedDue', () => {
  it('không bật nhắc thì không bao giờ kêu, dù đã quá hạn', () => {
    const r = plan({ id: 'a', due_on: '2026-07-01', remind_days_before: null })
    expect(plannedDue([r], TODAY)).toEqual([])
  })

  it('nhắc đúng ngày (0) chỉ kêu từ ngày đến hạn trở đi', () => {
    const r = plan({ id: 'a', due_on: '2026-08-11', remind_days_before: 0 })
    expect(plannedDue([r], TODAY)).toEqual([])
    expect(plannedDue([r], '2026-08-11')).toHaveLength(1)
  })

  it('nhắc trước N ngày mở tầm đúng bấy nhiêu', () => {
    const r = plan({ id: 'a', due_on: '2026-08-20', remind_days_before: 10 })
    expect(plannedDue([r], TODAY)[0].daysLeft).toBe(10)
    expect(plannedDue([r], '2026-08-09')).toEqual([])
  })

  it('quá hạn KHÔNG tự tắt — việc chưa chi vẫn là việc chưa chi', () => {
    const r = plan({ id: 'a', due_on: '2026-06-01', remind_days_before: 0 })
    const out = plannedDue([r], TODAY)
    expect(out).toHaveLength(1)
    expect(out[0].daysLeft).toBe(-70)
  })

  it('đã chi hoặc đã bỏ thì thôi kêu', () => {
    const done = plan({ id: 'a', due_on: '2026-06-01', remind_days_before: 0, status: 'done', transaction_id: 't' })
    const dropped = plan({ id: 'b', due_on: '2026-06-01', remind_days_before: 0, status: 'dropped' })
    expect(plannedDue([done, dropped], TODAY)).toEqual([])
  })

  it('trễ nhất lên đầu', () => {
    const sau = plan({ id: 'sau', due_on: '2026-08-15', remind_days_before: 30 })
    const truoc = plan({ id: 'truoc', due_on: '2026-07-15', remind_days_before: 30 })
    expect(plannedDue([sau, truoc], TODAY).map((x) => x.id)).toEqual(['truoc', 'sau'])
  })
})

describe('groupPlannedByMonth', () => {
  it('gom theo tháng đến hạn, tháng gần nhất trước', () => {
    const g = groupPlannedByMonth(
      [
        plan({ id: 'a', due_on: '2026-10-01', due_precision: 'month' }),
        plan({ id: 'b', due_on: '2026-08-20' }),
        plan({ id: 'c', due_on: '2026-08-05' }),
      ],
      'JPY',
      RATES,
    )
    expect(g.map((m) => m.monthKey)).toEqual(['2026-08', '2026-10'])
    // Trong tháng: hạn sớm trước
    expect(g[0].items.map((i) => i.id)).toEqual(['c', 'b'])
  })

  it('cộng tổng theo tháng, quy đổi ngoại tệ về base', () => {
    const g = groupPlannedByMonth(
      [
        plan({ id: 'a', amount: 10_000, currency: 'JPY' }),
        plan({ id: 'b', amount: 1_000_000, currency: 'VND' }),
      ],
      'JPY',
      RATES,
    )
    expect(g[0].totalBase).toBe(16_000)
    expect(g[0].hasMissingRate).toBe(false)
  })

  it('thiếu tỷ giá thì bỏ khoản đó khỏi tổng VÀ nói ra', () => {
    const g = groupPlannedByMonth(
      [
        plan({ id: 'a', amount: 10_000, currency: 'JPY' }),
        plan({ id: 'b', amount: 1_000_000, currency: 'VND' }),
      ],
      'JPY',
      {},
    )
    expect(g[0].totalBase).toBe(10_000)
    expect(g[0].hasMissingRate).toBe(true)
  })

  it('khoản đã chi / đã bỏ không nằm trong danh sách còn phải lo', () => {
    const g = groupPlannedByMonth(
      [
        plan({ id: 'a', status: 'done', transaction_id: 't' }),
        plan({ id: 'b', status: 'dropped' }),
      ],
      'JPY',
      RATES,
    )
    expect(g).toEqual([])
  })

  it('số tiền 0 (chưa biết bao nhiêu) vẫn có dòng, chỉ không cộng gì', () => {
    const g = groupPlannedByMonth([plan({ id: 'a', amount: 0 })], 'JPY', RATES)
    expect(g[0].items).toHaveLength(1)
    expect(g[0].totalBase).toBe(0)
  })
})

describe('plannedOutlook', () => {
  it('cộng các khoản tới hết N tháng nữa', () => {
    const rows = [
      plan({ id: 'nay', due_on: '2026-08-20', amount: 10_000 }),
      plan({ id: 'thang9', due_on: '2026-09-05', amount: 20_000 }),
      plan({ id: 'thang11', due_on: '2026-11-05', amount: 40_000 }),
    ]
    // 2 tháng nữa = hết tháng 10 → không gồm khoản tháng 11
    const r = plannedOutlook(rows, TODAY, 2, 'JPY', RATES)
    expect(r.totalBase).toBe(30_000)
    expect(r.count).toBe(2)
  })

  it('khoản QUÁ HẠN chưa chi vẫn được cộng — vẫn là tiền chưa trả', () => {
    const rows = [plan({ id: 'cu', due_on: '2026-05-01', amount: 50_000 })]
    expect(plannedOutlook(rows, TODAY, 3, 'JPY', RATES).totalBase).toBe(50_000)
  })

  it('cửa sổ chạy đúng qua ranh giới năm', () => {
    const rows = [
      plan({ id: 'thang1', due_on: '2027-01-10', amount: 10_000 }),
      plan({ id: 'thang2', due_on: '2027-02-10', amount: 20_000 }),
    ]
    // Từ 8/2026, 5 tháng nữa = hết 1/2027
    const r = plannedOutlook(rows, TODAY, 5, 'JPY', RATES)
    expect(r.count).toBe(1)
    expect(r.totalBase).toBe(10_000)
  })

  it('đã chi rồi thì không còn phải lo', () => {
    const rows = [plan({ id: 'a', status: 'done', transaction_id: 't', amount: 99_000 })]
    expect(plannedOutlook(rows, TODAY, 3, 'JPY', RATES).count).toBe(0)
  })
})
