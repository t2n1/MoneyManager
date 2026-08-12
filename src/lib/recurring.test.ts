import { describe, expect, it } from 'vitest'
import { billStatuses, listDueDates, nextDueDate, nthDueDate, runRecurringCatchUp } from './recurring'
import type {
  BillRuleLike,
  RecurringOccurrenceInput,
  RecurringRepo,
  RecurringRuleLike,
} from './recurring'

describe('nthDueDate', () => {
  it('weekly: cộng đúng 7 ngày mỗi kỳ', () => {
    expect(nthDueDate('2026-07-06', 'weekly', 0)).toBe('2026-07-06')
    expect(nthDueDate('2026-07-06', 'weekly', 1)).toBe('2026-07-13')
    expect(nthDueDate('2026-07-06', 'weekly', 4)).toBe('2026-08-03')
  })

  it('monthly: giữ ngày anchor, cuộn qua năm mới', () => {
    expect(nthDueDate('2026-01-15', 'monthly', 1)).toBe('2026-02-15')
    expect(nthDueDate('2026-11-15', 'monthly', 2)).toBe('2027-01-15')
  })

  it('monthly: anchor 31 clamp về cuối tháng ngắn rồi quay lại 31 (không trôi dần)', () => {
    expect(nthDueDate('2026-01-31', 'monthly', 1)).toBe('2026-02-28')
    expect(nthDueDate('2026-01-31', 'monthly', 2)).toBe('2026-03-31')
    expect(nthDueDate('2026-01-31', 'monthly', 3)).toBe('2026-04-30')
  })

  it('monthly: tháng 2 năm nhuận nhận ngày 29', () => {
    expect(nthDueDate('2028-01-31', 'monthly', 1)).toBe('2028-02-29')
  })

  it('yearly: anchor 29/2 clamp 28/2 năm thường, trở lại 29/2 năm nhuận', () => {
    expect(nthDueDate('2028-02-29', 'yearly', 1)).toBe('2029-02-28')
    expect(nthDueDate('2028-02-29', 'yearly', 4)).toBe('2032-02-29')
  })
})

describe('listDueDates', () => {
  const rule = {
    frequency: 'monthly' as const,
    start_on: '2026-04-25',
    end_on: null,
    is_paused: false,
    last_generated_on: null,
  }

  it('chưa sinh lần nào: sinh từ start_on đến hôm nay', () => {
    expect(listDueDates(rule, '2026-07-19')).toEqual(['2026-04-25', '2026-05-25', '2026-06-25'])
  })

  it('kỳ đúng hôm nay vẫn sinh (inclusive)', () => {
    expect(listDueDates(rule, '2026-05-25')).toEqual(['2026-04-25', '2026-05-25'])
  })

  it('đã sinh tới last_generated_on: chỉ sinh phần sau', () => {
    expect(listDueDates({ ...rule, last_generated_on: '2026-05-25' }, '2026-07-19')).toEqual([
      '2026-06-25',
    ])
  })

  it('cắt tại end_on', () => {
    expect(listDueDates({ ...rule, end_on: '2026-05-31' }, '2026-07-19')).toEqual([
      '2026-04-25',
      '2026-05-25',
    ])
  })

  it('tạm dừng → rỗng', () => {
    expect(listDueDates({ ...rule, is_paused: true }, '2026-07-19')).toEqual([])
  })

  it('start_on tương lai → rỗng', () => {
    expect(listDueDates(rule, '2026-04-01')).toEqual([])
  })
})

describe('nextDueDate', () => {
  it('chưa sinh: kỳ tới là start_on', () => {
    expect(
      nextDueDate({ frequency: 'weekly', start_on: '2026-08-01', end_on: null, last_generated_on: null }),
    ).toBe('2026-08-01')
  })

  it('đã sinh: kỳ kế tiếp sau last_generated_on (kể cả kỳ trước bị clamp)', () => {
    expect(
      nextDueDate({ frequency: 'monthly', start_on: '2026-01-31', end_on: null, last_generated_on: '2026-02-28' }),
    ).toBe('2026-03-31')
  })

  it('quá end_on → null', () => {
    expect(
      nextDueDate({ frequency: 'monthly', start_on: '2026-01-15', end_on: '2026-02-20', last_generated_on: '2026-02-15' }),
    ).toBe(null)
  })
})

function makeRule(over: Partial<RecurringRuleLike> = {}): RecurringRuleLike {
  return {
    id: 'r1',
    type: 'expense',
    amount: 1000,
    to_amount: null,
    category_id: 'c1',
    account_id: 'a1',
    to_account_id: null,
    note: 'tien nha',
    frequency: 'monthly',
    start_on: '2026-05-01',
    end_on: null,
    is_paused: false,
    last_generated_on: null,
    ...over,
  }
}

/** Repo giả in-memory: ghi lại các kỳ đã sinh + patch last_generated_on. */
function makeFakeRepo(rules: RecurringRuleLike[], dupKeys: string[] = []) {
  const inserted: RecurringOccurrenceInput[] = []
  const patches: Record<string, string> = {}
  const dups = new Set(dupKeys)
  const repo: RecurringRepo = {
    async listRecurringRules() {
      return rules
    },
    async insertRecurringOccurrence(input) {
      if (dups.has(`${input.recurring_rule_id}|${input.occurred_on}`)) return false
      inserted.push(input)
      return true
    },
    async updateRecurringRule(id, patch) {
      patches[id] = patch.last_generated_on
      return {}
    },
  }
  return { repo, inserted, patches }
}

describe('runRecurringCatchUp — cờ hoàn tiền (migration 0043)', () => {
  // Quy tắc hoàn tiền lặp (hoàn thuế nhà hằng tháng, cashback) mà rơi cờ thì mỗi kỳ
  // thành một khoản chi thường: tháng nào cũng CỘNG thêm tiền vào Chi thay vì trừ ra.
  it('kỳ sinh ra mang cờ is_refund của quy tắc', async () => {
    const f = makeFakeRepo([makeRule({ is_refund: true })])
    await runRecurringCatchUp(f.repo, '2026-07-19')
    expect(f.inserted.length).toBeGreaterThan(0)
    expect(f.inserted.every((i) => i.is_refund === true)).toBe(true)
  })

  it('quy tắc thường thì kỳ nào cũng là chi thường', async () => {
    const f = makeFakeRepo([makeRule()])
    await runRecurringCatchUp(f.repo, '2026-07-19')
    expect(f.inserted.every((i) => i.is_refund === false)).toBe(true)
  })

  // DB chỉ nhận is_refund trên CHI (transactions_refund_expense_only). Dữ liệu cũ lỡ
  // có cờ trên quy tắc thu/chuyển khoản thì engine phải bỏ, không thì mọi kỳ của quy
  // tắc đó bị DB từ chối và nó ngừng sinh mà không ai biết.
  it('cờ trên quy tắc THU/chuyển khoản bị bỏ (DB chỉ nhận trên chi)', async () => {
    const f = makeFakeRepo([makeRule({ type: 'income', is_refund: true })])
    await runRecurringCatchUp(f.repo, '2026-07-19')
    expect(f.inserted.every((i) => i.is_refund === false)).toBe(true)
  })
})

describe('runRecurringCatchUp', () => {
  it('sinh đủ các kỳ lỡ với đúng ngày quá khứ + cập nhật last_generated_on', async () => {
    const f = makeFakeRepo([makeRule()])
    const created = await runRecurringCatchUp(f.repo, '2026-07-19')
    expect(created).toBe(3)
    expect(f.inserted.map((i) => i.occurred_on)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01'])
    expect(f.patches['r1']).toBe('2026-07-01')
  })

  it('kỳ trùng (thiết bị khác đã sinh) bỏ qua nhưng vẫn tiến last_generated_on', async () => {
    const f = makeFakeRepo([makeRule()], ['r1|2026-05-01', 'r1|2026-06-01'])
    const created = await runRecurringCatchUp(f.repo, '2026-07-19')
    expect(created).toBe(1)
    expect(f.inserted.map((i) => i.occurred_on)).toEqual(['2026-07-01'])
    expect(f.patches['r1']).toBe('2026-07-01')
  })

  it('rule paused / start tương lai / quá end_on: không sinh, không patch', async () => {
    const f = makeFakeRepo([
      makeRule({ id: 'p', is_paused: true }),
      makeRule({ id: 'f', start_on: '2026-08-01' }),
      makeRule({ id: 'e', end_on: '2026-04-30' }),
    ])
    const created = await runRecurringCatchUp(f.repo, '2026-07-19')
    expect(created).toBe(0)
    expect(f.patches).toEqual({})
  })

  it('chép đúng nội dung rule vào giao dịch sinh ra', async () => {
    const f = makeFakeRepo([makeRule({ frequency: 'weekly', start_on: '2026-07-13' })])
    await runRecurringCatchUp(f.repo, '2026-07-19')
    expect(f.inserted[0]).toEqual({
      type: 'expense',
      amount: 1000,
      to_amount: null,
      category_id: 'c1',
      account_id: 'a1',
      to_account_id: null,
      occurred_on: '2026-07-13',
      note: 'tien nha',
      recurring_rule_id: 'r1',
      is_refund: false,
    })
  })
})

// --- Khoản cần thanh toán (mode = 'remind', migration 0037) ---

function makeBill(over: Partial<BillRuleLike> = {}): BillRuleLike {
  return {
    id: 'b1',
    mode: 'remind',
    remind_days_before: 0,
    frequency: 'monthly',
    start_on: '2026-05-10',
    end_on: null,
    is_paused: false,
    last_generated_on: null,
    ...over,
  }
}

describe('billStatuses', () => {
  it('chỉ tính rule kiểu nhắc — rule tự sinh không phải việc phải làm tay', () => {
    const auto = makeBill({ id: 'a', mode: 'auto' })
    const khongKhai = makeBill({ id: 'k', mode: undefined })
    expect(billStatuses([auto, khongKhai], '2026-08-10')).toEqual([])
  })

  it('quá hạn: daysLeft âm và đếm ĐỦ số kỳ còn nợ', () => {
    // Kỳ 10/5, 10/6, 10/7, 10/8 đều chưa xác nhận
    const r = billStatuses([makeBill()], '2026-08-10')
    expect(r).toHaveLength(1)
    expect(r[0].dueISO).toBe('2026-05-10')
    expect(r[0].daysLeft).toBe(-92)
    expect(r[0].overdueCount).toBe(4)
  })

  it('đúng ngày đến hạn thì báo, daysLeft = 0', () => {
    const r = billStatuses([makeBill({ last_generated_on: '2026-07-10' })], '2026-08-10')
    expect(r[0].dueISO).toBe('2026-08-10')
    expect(r[0].daysLeft).toBe(0)
    expect(r[0].overdueCount).toBe(1)
  })

  it('chưa tới ngày và chưa vào tầm nhắc → im', () => {
    const bill = makeBill({ last_generated_on: '2026-07-10' })
    expect(billStatuses([bill], '2026-08-07')).toEqual([])
  })

  it('remind_days_before mở tầm nhắc ra đúng bấy nhiêu ngày', () => {
    const bill = makeBill({ last_generated_on: '2026-07-10', remind_days_before: 3 })
    // 7/8 cách hạn 3 ngày → vào tầm; 6/8 cách 4 ngày → chưa
    expect(billStatuses([bill], '2026-08-07')).toHaveLength(1)
    expect(billStatuses([bill], '2026-08-07')[0].daysLeft).toBe(3)
    expect(billStatuses([bill], '2026-08-06')).toEqual([])
  })

  it('sắp tới hạn (chưa quá) thì overdueCount = 0', () => {
    const bill = makeBill({ last_generated_on: '2026-07-10', remind_days_before: 5 })
    expect(billStatuses([bill], '2026-08-08')[0].overdueCount).toBe(0)
  })

  it('đã xác nhận hết tới kỳ gần nhất → im cho tới kỳ sau', () => {
    const bill = makeBill({ last_generated_on: '2026-08-10' })
    expect(billStatuses([bill], '2026-08-10')).toEqual([])
  })

  it('tạm dừng thì không nhắc', () => {
    expect(billStatuses([makeBill({ is_paused: true })], '2026-08-10')).toEqual([])
  })

  it('quá end_on thì hết nhắc hẳn', () => {
    const bill = makeBill({ last_generated_on: '2026-06-10', end_on: '2026-06-30' })
    expect(billStatuses([bill], '2026-08-10')).toEqual([])
  })

  it('nhiều khoản: trễ nhất lên đầu', () => {
    const cu = makeBill({ id: 'cu', start_on: '2026-05-10' })
    const moi = makeBill({ id: 'moi', start_on: '2026-08-01' })
    expect(billStatuses([moi, cu], '2026-08-10').map((b) => b.ruleId)).toEqual(['cu', 'moi'])
  })

  it('catch-up KHÔNG đụng tới rule kiểu nhắc — không sinh, cũng không đẩy con trỏ', async () => {
    const f = makeFakeRepo([makeRule({ id: 'r1', mode: 'remind' })])
    const created = await runRecurringCatchUp(f.repo, '2026-07-19')
    expect(created).toBe(0)
    // Đẩy con trỏ ở đây là xoá lời nhắc mà không ghi khoản nào
    expect(f.patches).toEqual({})
  })
})
