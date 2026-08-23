import { describe, expect, it } from 'vitest'
import {
  buildCalendarMonth,
  dayLabel,
  pickMark,
  recentPace,
  weekDelta,
  type DayMark,
  type DayMarkInput,
} from './calendarMonth'
import { monthHeatmap } from './ledgerHeat'
import type { TagColorKey } from '../tags/colors'
import type { TransactionRow } from '../../types/database.types'

const tx = (p: Partial<TransactionRow>): TransactionRow =>
  ({
    id: Math.random().toString(36).slice(2),
    type: 'expense',
    account_id: 'A',
    to_account_id: null,
    amount: 0,
    to_amount: null,
    is_refund: false,
    is_debt_flow: false,
    exclude_from_stats: false,
    occurred_on: '2026-08-10',
    category_id: null,
    ...p,
  }) as unknown as TransactionRow

/** 2026-08-01 là thứ Bảy → hàng đầu chỉ có ĐÚNG một ngày (6 ô trống trước nó). */
const heatOf = (txs: TransactionRow[], todayISO: string) =>
  monthHeatmap({
    txs,
    monthKey: { year: 2026, month: 8 },
    monthStartDay: 1,
    todayISO,
    toBase: (a) => a,
  })

const build = (
  txs: TransactionRow[],
  marks: DayMarkInput[] = [],
  todayISO = '2026-08-23',
  extra: Partial<Parameters<typeof buildCalendarMonth>[0]> = {},
) =>
  buildCalendarMonth({
    heat: heatOf(txs, todayISO),
    monthStartDay: 1,
    marks,
    todayISO,
    ...extra,
  })

const mark = (p: Partial<DayMarkInput> = {}): DayMarkInput => ({
  iso: '2026-08-25',
  kind: 'recurring',
  title: 'Điện',
  amount: 6_800,
  unknownAmount: false,
  ...p,
})

const cellOf = (iso: string, m = build([])) => m.cells.find((c) => c.iso === iso)!

describe('dayLabel', () => {
  it('kỳ bắt đầu ngày 1 thì chỉ in số ngày', () => {
    expect(dayLabel('2026-08-01', 1)).toBe('1')
    expect(dayLabel('2026-08-17', 1)).toBe('17')
  })

  // Kỳ 25/8 → 24/9 có hai ngày mang số nhỏ trong cùng một lưới; ngày 1 phải nói nó
  // thuộc tháng nào, không thì nó đọc như ngày đầu kỳ.
  it('kỳ tùy chỉnh thì ngày 1 in kèm tháng', () => {
    expect(dayLabel('2026-09-01', 25)).toBe('9/1')
    expect(dayLabel('2026-08-26', 25)).toBe('26')
  })
})

describe('pickMark', () => {
  const m = (p: Partial<DayMark>): DayMark => ({
    kind: 'recurring',
    title: 't',
    amount: 0,
    unknownAmount: false,
    ...p,
  })

  it('không có dấu nào thì null', () => {
    expect(pickMark([])).toBeNull()
  })

  it('nhiều khoản cùng ngày thì lấy khoản LỚN NHẤT', () => {
    const chosen = pickMark([
      m({ title: 'Netflix', amount: 1_490 }),
      m({ title: 'Thẻ Rakuten', amount: 42_300, kind: 'card' }),
    ])
    expect(chosen?.title).toBe('Thẻ Rakuten')
  })

  // Ngày lương không mang tiền phải trả, nên nó chỉ được ô khi ngày đó không nợ gì.
  it('khoản phải trả thắng ngày lương', () => {
    expect(
      pickMark([m({ kind: 'payday', title: 'Lương' }), m({ title: 'Điện', amount: 6_800 })])
        ?.title,
    ).toBe('Điện')
    expect(pickMark([m({ kind: 'payday', title: 'Lương' })])?.title).toBe('Lương')
  })

  // "Chưa biết bao nhiêu" vẫn là tiền sắp ra — nó phải trên ngày lương, dưới khoản có giá.
  it('khoản chưa biết giá xếp giữa ngày lương và khoản có giá', () => {
    const unknown = m({ title: 'Sửa xe', amount: 0, unknownAmount: true, kind: 'planned' })
    expect(pickMark([m({ kind: 'payday', title: 'Lương' }), unknown])?.title).toBe('Sửa xe')
    expect(pickMark([unknown, m({ title: 'Điện', amount: 6_800 })])?.title).toBe('Điện')
  })
})

describe('weekDelta', () => {
  it('so được thì trả % làm tròn', () => {
    expect(weekDelta(4_000, 10_000, true)).toBe(-60)
    expect(weekDelta(14_800, 10_000, true)).toBe(48)
  })

  it('tuần trước không chi gì thì không có % nào để nói', () => {
    expect(weekDelta(5_000, 0, true)).toBeNull()
  })

  it('tuần chưa đủ ngày (đang chạy / chưa tới) thì không so', () => {
    expect(weekDelta(4_000, 10_000, false)).toBeNull()
  })
})

describe('buildCalendarMonth — ô ngày', () => {
  it('một ô mỗi ngày của kỳ, giữ số ô trống của lưới nhiệt', () => {
    const m = build([])
    expect(m.cells).toHaveLength(31)
    expect(m.leadingBlanks).toBe(6)
  })

  it('vạch nhiệt chia theo ngày chi nhiều nhất của kỳ', () => {
    const m = build([
      tx({ occurred_on: '2026-08-05', amount: 10_000 }),
      tx({ occurred_on: '2026-08-06', amount: 5_000 }),
    ])
    expect(m.maxExpense).toBe(10_000)
    expect(cellOf('2026-08-05', m).heat).toBe(1)
    expect(cellOf('2026-08-06', m).heat).toBe(0.5)
  })

  // Sàn 6%: ngày tiêu ¥100 trong tháng có ngày ¥300.000 vẫn phải thấy được một vạch,
  // không thì nó đọc như ngày không tiêu đồng nào.
  it('ngày có tiêu không bao giờ ra vạch bằng 0', () => {
    const m = build([
      tx({ occurred_on: '2026-08-05', amount: 300_000 }),
      tx({ occurred_on: '2026-08-06', amount: 100 }),
    ])
    expect(cellOf('2026-08-06', m).heat).toBe(0.06)
    expect(cellOf('2026-08-07', m).heat).toBe(0)
  })

  it('kỳ chưa chi đồng nào thì không ô nào có vạch', () => {
    expect(build([]).cells.every((c) => c.heat === 0)).toBe(true)
  })

  it('ngày chưa tới có cam kết thì vẽ vạch theo cam kết', () => {
    const m = build([tx({ occurred_on: '2026-08-05', amount: 10_000 })], [mark({ amount: 5_000 })])
    const c = cellOf('2026-08-25', m)
    expect(c.heat).toBe(0.5)
    expect(c.heatFromMark).toBe(true)
  })

  // Cam kết lớn hơn mọi ngày đã chi thì vạch chạm 100% và DỪNG — không tràn khỏi ô.
  it('cam kết lớn hơn mẫu số thì kẹp ở 100%', () => {
    const m = build([tx({ occurred_on: '2026-08-05', amount: 1_000 })], [mark({ amount: 99_000 })])
    expect(cellOf('2026-08-25', m).heat).toBe(1)
  })

  // Một khoản định kỳ tới hạn ngày 10 mà hôm nay 23 vẫn còn trong `commitments` (chưa
  // sinh giao dịch). Ngày đó ĐÃ có chi thật thì vạch phải nói về tiền đã ra.
  it('ngày đã có chi thật thì cái đã xảy ra thắng cái được hẹn', () => {
    const m = build(
      [tx({ occurred_on: '2026-08-10', amount: 8_000 })],
      [mark({ iso: '2026-08-10', amount: 6_800 })],
    )
    const c = cellOf('2026-08-10', m)
    expect(c.heatFromMark).toBe(false)
    expect(c.heat).toBe(1)
    // Chip vẫn còn: "tới hạn rồi mà chưa ghi" là tin riêng, không phải hệ quả của vạch.
    expect(c.mark?.title).toBe('Điện')
  })

  // Hoàn tiền nhiều hơn chi → `expense` âm. Ô in con số đó (màu tiền vào), nhưng mức
  // nhiệt vẫn 0: một ngày "chi âm" không thể đậm hơn ngày trắng.
  it('ngày hoàn tiền ròng giữ số âm nhưng không có vạch', () => {
    const m = build([
      tx({ occurred_on: '2026-08-05', amount: 3_000, is_refund: true }),
      tx({ occurred_on: '2026-08-06', amount: 10_000 }),
    ])
    const c = cellOf('2026-08-05', m)
    expect(c.expense).toBe(-3_000)
    expect(c.heat).toBe(0)
  })

  it('cắt chấm nhãn theo maxTagDots', () => {
    const tags = new Map<string, TagColorKey[]>([
      ['2026-08-05', ['red', 'amber', 'green', 'sky']],
    ])
    const m = build([], [], '2026-08-23', { tagColorsByDay: tags, maxTagDots: 2 })
    expect(cellOf('2026-08-05', m).tagColors).toEqual(['red', 'amber'])
  })

  it('không lọc nhãn thì mọi ngày đều trong bộ lọc', () => {
    expect(build([]).cells.every((c) => c.inFilter)).toBe(true)
  })

  it('lọc nhãn thì chỉ ngày có nhãn đó nằm trong bộ lọc', () => {
    const m = build([], [], '2026-08-23', { filterDays: new Set(['2026-08-05']) })
    expect(cellOf('2026-08-05', m).inFilter).toBe(true)
    expect(cellOf('2026-08-06', m).inFilter).toBe(false)
  })

  it('đếm đủ số dấu của ngày dù chip chỉ vẽ một', () => {
    const m = build([], [mark({ amount: 1_000 }), mark({ title: 'Netflix', amount: 1_490 })])
    const c = cellOf('2026-08-25', m)
    expect(c.markCount).toBe(2)
    expect(c.mark?.title).toBe('Netflix')
  })
})

describe('buildCalendarMonth — cột Tuần', () => {
  // Hàng lưới, KHÔNG phải tuần ISO: 01/08 là thứ Bảy nên hàng đầu có đúng một ngày.
  // Cột Tuần đứng cạnh lưới và mắt đọc nó theo hàng, nên nó phải chia y như lưới.
  it('chia theo hàng của lưới, không theo tuần lịch', () => {
    const m = build([])
    expect(m.weeks).toHaveLength(6)
    expect(m.weeks[0].startISO).toBe('2026-08-01')
    expect(m.weeks[1].startISO).toBe('2026-08-02')
    expect(m.weeks[5].startISO).toBe('2026-08-30')
  })

  it('cộng chi của các ngày trong hàng', () => {
    const m = build([
      tx({ occurred_on: '2026-08-02', amount: 3_000 }),
      tx({ occurred_on: '2026-08-08', amount: 1_000 }),
    ])
    expect(m.weeks[1].expense).toBe(4_000)
  })

  it('% lệch so hàng trước, chỉ ở hàng đã đủ ngày và đã qua', () => {
    const m = build(
      [
        tx({ occurred_on: '2026-08-02', amount: 10_000 }),
        tx({ occurred_on: '2026-08-09', amount: 4_000 }),
      ],
      [],
      '2026-08-23',
    )
    expect(m.weeks[2].deltaPct).toBe(-60)
    // Hàng chứa hôm nay (23–29) đang dở, không so.
    expect(m.weeks[4].deltaPct).toBeNull()
    // Hàng chưa tới (30–31) cũng không.
    expect(m.weeks[5].deltaPct).toBeNull()
  })

  it('cộng cam kết chưa ra của hàng, không cộng ngày đã có chi thật', () => {
    const m = build(
      [tx({ occurred_on: '2026-08-24', amount: 500 })],
      [
        mark({ iso: '2026-08-24', amount: 6_800 }),
        mark({ iso: '2026-08-26', title: 'Tàu tháng', amount: 12_000 }),
      ],
    )
    expect(m.weeks[4].marked).toBe(12_000)
  })
})

describe('recentPace', () => {
  /** Điểm chi theo ngày, dạng `dailyExpenseTotals` trả về (ngày trống vẫn có mặt, = 0). */
  const points = (spend: Record<string, number>, fromDay = 1, toDay = 31) =>
    Array.from({ length: toDay - fromDay + 1 }, (_, i) => {
      const d = String(fromDay + i).padStart(2, '0')
      return { date: `2026-08-${d}`, expense: spend[d] ?? 0 }
    })

  it('chia cho số NGÀY trong cửa sổ, không cho số ngày có chi', () => {
    // 7 ngày 17…23, tổng ¥14.000 → ¥2.000/ngày
    expect(recentPace(points({ '20': 7_000, '23': 7_000 }), '2026-08-23')).toBe(2_000)
  })

  it('không tính ngày chưa tới', () => {
    expect(recentPace(points({ '30': 70_000 }), '2026-08-23')).toBe(0)
  })

  it('đầu kỳ thì cửa sổ ngắn hơn 7 ngày', () => {
    expect(recentPace(points({ '02': 4_000 }, 1, 2), '2026-08-02')).toBe(2_000)
  })

  it('chưa có ngày nào trong kỳ thì null', () => {
    expect(recentPace(points({}), '2026-07-31')).toBeNull()
  })
})

describe('buildCalendarMonth — kỳ thẻ tới hạn', () => {
  // Ngày rút thẻ là chuyển khoản: mỗi lần quẹt đã là một khoản chi trong sổ từ lúc nó
  // xảy ra. Chip phải có (lịch là màn của ngày), nhưng nó không được vào phép tính nào.
  const m = () =>
    build(
      [tx({ occurred_on: '2026-08-05', amount: 10_000 })],
      [mark({ iso: '2026-08-27', kind: 'card', title: 'Thẻ Rakuten', amount: 42_300 })],
    )

  it('vẫn hiện chip trong ô', () => {
    expect(cellOf('2026-08-27', m()).mark?.title).toBe('Thẻ Rakuten')
  })

  it('không vẽ vạch nhiệt', () => {
    expect(cellOf('2026-08-27', m()).heat).toBe(0)
  })

  it('không cộng vào cam kết của tuần', () => {
    expect(m().weeks[4].marked).toBe(0)
  })
})
