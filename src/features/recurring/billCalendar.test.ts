import { describe, expect, it } from 'vitest'
import {
  billCalendar,
  dueDatesBetween,
  monthGrid,
  summarizeBills,
  type BillCalRule,
  type BillCalTx,
} from './billCalendar'

const T9 = { start: '2026-09-01', end: '2026-10-01' }
const HOM_NAY = '2026-09-15'

const rule = (over: Partial<BillCalRule> = {}): BillCalRule => ({
  id: 'r1',
  note: 'Tiền nhà',
  type: 'expense',
  amount: 68_000,
  frequency: 'monthly',
  start_on: '2026-01-06',
  end_on: null,
  is_paused: false,
  mode: 'auto',
  ...over,
})

const tx = (over: Partial<BillCalTx> = {}): BillCalTx => ({
  id: 't1',
  recurring_rule_id: 'r1',
  occurred_on: '2026-09-06',
  amount: 68_000,
  ...over,
})

describe('dueDatesBetween', () => {
  it('hàng tháng: đúng một kỳ trong tháng, đúng ngày neo', () => {
    expect(dueDatesBetween(rule(), T9.start, T9.end)).toEqual(['2026-09-06'])
  })

  it('hàng tuần: mọi kỳ rơi trong tháng', () => {
    const r = rule({ frequency: 'weekly', start_on: '2026-09-02' })
    expect(dueDatesBetween(r, T9.start, T9.end)).toEqual([
      '2026-09-02',
      '2026-09-09',
      '2026-09-16',
      '2026-09-23',
      '2026-09-30',
    ])
  })

  it('mép phải LOẠI TRỪ — kỳ ngày 1 tháng sau không lọt vào tháng này', () => {
    const r = rule({ start_on: '2026-01-01' })
    expect(dueDatesBetween(r, T9.start, T9.end)).toEqual(['2026-09-01'])
  })

  it('quy tắc đang tạm dừng không có kỳ nào', () => {
    expect(dueDatesBetween(rule({ is_paused: true }), T9.start, T9.end)).toEqual([])
  })

  it('cắt tại end_on', () => {
    expect(dueDatesBetween(rule({ end_on: '2026-08-31' }), T9.start, T9.end)).toEqual([])
  })

  it('quy tắc bắt đầu SAU tháng đang xem thì chưa có kỳ nào', () => {
    expect(dueDatesBetween(rule({ start_on: '2026-11-06' }), T9.start, T9.end)).toEqual([])
  })

  it('ngày neo 31 kẹp về cuối tháng ngắn, kỳ sau vẫn quay lại 31', () => {
    const r = rule({ start_on: '2026-01-31' })
    expect(dueDatesBetween(r, '2026-02-01', '2026-04-01')).toEqual(['2026-02-28', '2026-03-31'])
  })
})

describe('billCalendar — bốn trạng thái', () => {
  it('có giao dịch đúng số → đã trả', () => {
    const [c] = billCalendar([rule()], [tx()], T9, HOM_NAY)
    expect(c.status).toBe('da-tra')
    expect(c.paid).toBe(68_000)
  })

  it('có giao dịch nhưng số khác → lệch số, giữ CẢ hai con số', () => {
    const [c] = billCalendar([rule()], [tx({ amount: 71_500 })], T9, HOM_NAY)
    expect(c.status).toBe('lech-so')
    expect(c.amount).toBe(68_000)
    expect(c.paid).toBe(71_500)
  })

  it('đã qua ngày mà không có giao dịch → lỡ mất', () => {
    const [c] = billCalendar([rule()], [], T9, HOM_NAY)
    expect(c.status).toBe('lo-mat')
    expect(c.paid).toBeNull()
  })

  it('chưa tới ngày → sắp tới', () => {
    const [c] = billCalendar([rule({ start_on: '2026-01-25' })], [], T9, HOM_NAY)
    expect(c.dueISO).toBe('2026-09-25')
    expect(c.status).toBe('sap-toi')
  })

  it('ĐÚNG hôm nay vẫn là "sắp tới", chưa phải lỡ', () => {
    const [c] = billCalendar([rule({ start_on: '2026-01-15' })], [], T9, HOM_NAY)
    expect(c.dueISO).toBe(HOM_NAY)
    expect(c.status).toBe('sap-toi')
  })
})

describe('billCalendar — ghép giao dịch với kỳ', () => {
  const hangTuan = rule({ frequency: 'weekly', start_on: '2026-09-02' })

  it('trả trễ vài ngày vẫn về ĐÚNG kỳ của nó, không tạo ra một kỳ lỡ', () => {
    const cells = billCalendar([hangTuan], [tx({ occurred_on: '2026-09-04' })], T9, '2026-09-08')
    const byDue = new Map(cells.map((c) => [c.dueISO, c]))
    expect(byDue.get('2026-09-02')!.status).toBe('da-tra')
  })

  it('một giao dịch KHÔNG khớp vào hai kỳ', () => {
    const cells = billCalendar([hangTuan], [tx({ occurred_on: '2026-09-05' })], T9, '2026-09-30')
    expect(cells.filter((c) => c.paid !== null)).toHaveLength(1)
  })

  it('hai giao dịch cùng một kỳ: cái SÁT ngày hơn thắng, không cộng dồn', () => {
    const cells = billCalendar(
      [rule()],
      [
        tx({ id: 'xa', occurred_on: '2026-09-09', amount: 1 }),
        tx({ id: 'gan', occurred_on: '2026-09-06', amount: 68_000 }),
      ],
      T9,
      HOM_NAY,
    )
    expect(cells[0].paid).toBe(68_000)
    expect(cells[0].status).toBe('da-tra')
  })

  it('giao dịch của quy tắc KHÁC không lẫn sang', () => {
    const cells = billCalendar([rule()], [tx({ recurring_rule_id: 'r2' })], T9, HOM_NAY)
    expect(cells[0].status).toBe('lo-mat')
  })

  it('giao dịch ghi tay (không gắn quy tắc) bị bỏ qua', () => {
    const cells = billCalendar([rule()], [tx({ recurring_rule_id: null })], T9, HOM_NAY)
    expect(cells[0].status).toBe('lo-mat')
  })

  it('khoản trả SỚM vắt qua mép tháng về kỳ của tháng sau, không ép vào kỳ tháng này', () => {
    // Kỳ 6/9 và 6/10; giao dịch ngày 4/10 gần kỳ 6/10 hơn hẳn.
    const cells = billCalendar([rule()], [tx({ occurred_on: '2026-10-04' })], T9, HOM_NAY)
    expect(cells[0].dueISO).toBe('2026-09-06')
    expect(cells[0].paid).toBeNull()
  })
})

describe('billCalendar — sắp xếp và lọc', () => {
  it('sắp theo ngày, cùng ngày thì theo nhãn', () => {
    const cells = billCalendar(
      [
        rule({ id: 'b', note: 'Zalo', start_on: '2026-01-10' }),
        rule({ id: 'a', note: 'Anytime', start_on: '2026-01-10' }),
        rule({ id: 'c', note: 'Điện', start_on: '2026-01-03' }),
      ],
      [],
      T9,
      HOM_NAY,
    )
    expect(cells.map((c) => c.label)).toEqual(['Điện', 'Anytime', 'Zalo'])
  })

  it('quy tắc tạm dừng không lên lịch', () => {
    expect(billCalendar([rule({ is_paused: true })], [], T9, HOM_NAY)).toEqual([])
  })

  it('tháng không có kỳ nào thì không sinh ô rỗng', () => {
    expect(billCalendar([rule({ start_on: '2027-01-06' })], [], T9, HOM_NAY)).toEqual([])
  })
})

describe('summarizeBills', () => {
  const cells = billCalendar(
    [
      rule({ id: 'nha', note: 'Tiền nhà', start_on: '2026-01-06' }),
      rule({ id: 'dien', note: 'Điện', amount: 12_000, start_on: '2026-01-18' }),
      rule({ id: 'luong', note: 'Lương', type: 'income', amount: 280_000, start_on: '2026-01-25' }),
    ],
    [tx({ recurring_rule_id: 'nha', occurred_on: '2026-09-06', amount: 71_500 })],
    T9,
    HOM_NAY,
  )

  it('chỉ cộng CHI — thu là câu hỏi khác, trộn vào thì "còn phải trả" ra số âm', () => {
    expect(summarizeBills(cells).expected).toBe(68_000 + 12_000)
  })

  it('phần đã trả lấy số THẬT, không lấy số của quy tắc', () => {
    expect(summarizeBills(cells).paid).toBe(71_500)
  })

  it('đếm được số khoản lỡ và số khoản lệch', () => {
    const s = summarizeBills(cells)
    expect(s.lechSo).toBe(1)
    expect(s.loMat).toBe(0) // Điện ngày 18 chưa tới hạn ở ngày 15
  })

  it('lịch rỗng ra toàn số 0, không NaN', () => {
    expect(summarizeBills([])).toEqual({ expected: 0, paid: 0, loMat: 0, lechSo: 0 })
  })
})

describe('monthGrid', () => {
  it('mỗi hàng đúng 7 ô', () => {
    for (const w of monthGrid(T9.start, T9.end)) expect(w).toHaveLength(7)
  })

  it('phủ đúng mọi ngày của kỳ, không thừa không thiếu', () => {
    const days = monthGrid(T9.start, T9.end).flat().filter((d): d is string => d !== null)
    expect(days[0]).toBe('2026-09-01')
    expect(days[days.length - 1]).toBe('2026-09-30')
    expect(days).toHaveLength(30)
  })

  it('ngày ngoài kỳ là null để các cột thẳng hàng', () => {
    // 1/9/2026 là Thứ Ba → ô đầu (Thứ Hai 31/8) phải rỗng.
    expect(monthGrid(T9.start, T9.end)[0][0]).toBeNull()
    expect(monthGrid(T9.start, T9.end)[0][1]).toBe('2026-09-01')
  })

  it('tuần bắt đầu THỨ HAI', () => {
    const dau = monthGrid('2026-09-01', '2026-10-01').flat().find((d) => d !== null)!
    const grid = monthGrid('2026-09-07', '2026-10-01')
    expect(dau).toBe('2026-09-01')
    // 7/9 là Thứ Hai → nằm ngay ô đầu tiên.
    expect(grid[0][0]).toBe('2026-09-07')
  })

  it('kỳ bắt đầu ngày 25 (month_start_day) vẫn phủ đủ và vắt qua hai tháng dương lịch', () => {
    const days = monthGrid('2026-09-25', '2026-10-25').flat().filter((d) => d !== null)
    expect(days[0]).toBe('2026-09-25')
    expect(days[days.length - 1]).toBe('2026-10-24')
    expect(days).toHaveLength(30)
  })

  it('không sinh hàng thừa sau khi hết kỳ', () => {
    const g = monthGrid('2026-02-01', '2026-03-01')
    expect(g[g.length - 1].some((d) => d !== null)).toBe(true)
  })
})
