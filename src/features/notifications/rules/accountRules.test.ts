import { describe, expect, it } from 'vitest'
import { accountRules } from './accountRules'
import type { NotificationInput } from '../types'
import type { AccountBalanceRow, RecurringRuleRow } from '../../../types/database.types'

const fmt = (minor: number) => String(minor)

function account(over: Partial<AccountBalanceRow> & { id: string }): AccountBalanceRow {
  return {
    id: over.id,
    user_id: 'u',
    name: over.name ?? 'Ví',
    type: over.type ?? 'bank',
    currency: over.currency ?? 'JPY',
    asset_group: null,
    is_hidden: false,
    include_in_totals: true,
    credit_limit: over.credit_limit ?? null,
    statement_day: over.statement_day ?? null,
    payment_due_day: over.payment_due_day ?? null,
    payment_account_id: over.payment_account_id ?? null,
    is_archived: false,
    sort_order: 0,
    cost_basis: 0,
    depreciation_months: null,
    depreciation_from: null,
    salvage_value: 0,
    tax_shelter: null,
    shelter_annual_limit: null,
    last_reconciled_at: null,
    market_value: null,
    balance: over.balance ?? 0,
  }
}

function rule(over: Partial<RecurringRuleRow> & { id: string }): RecurringRuleRow {
  return {
    id: over.id,
    user_id: 'u',
    is_refund: false,
    type: over.type ?? 'expense',
    amount: over.amount ?? 0,
    to_amount: null,
    category_id: null,
    account_id: over.account_id ?? 'acc',
    to_account_id: null,
    note: over.note ?? '',
    frequency: over.frequency ?? 'monthly',
    start_on: over.start_on ?? '2026-07-30',
    end_on: null,
    is_paused: over.is_paused ?? false,
    last_generated_on: over.last_generated_on ?? '2026-06-30',
    mode: over.mode ?? 'auto',
    remind_days_before: over.remind_days_before ?? 0,
    created_at: '',
    updated_at: '',
  }
}

function input(over: Partial<NotificationInput>): NotificationInput {
  return {
    todayISO: '2026-07-28',
    monthStartDay: 1,
    base: 'JPY',
    rates: {},
    formatMoney: fmt,
    currencyOf: () => 'JPY',
    accounts: [],
    categories: [],
    debts: [],
    recurringRules: [],
    budgetReport: undefined,
    savingsGoals: [],
    networthSnapshots: [],
    recentTxs: [],
    offTypes: [],
    ...over,
  }
}

describe('account-negative', () => {
  it('ví ngân hàng âm thì báo', () => {
    const out = accountRules(input({ accounts: [account({ id: 'a', balance: -1200 })] }))
    expect(out.map((n) => n.type)).toContain('account-negative')
    expect(out.find((n) => n.type === 'account-negative')?.key).toBe('account-negative:a')
  })

  it('số dư đúng bằng 0 thì không báo', () => {
    const out = accountRules(input({ accounts: [account({ id: 'a', balance: 0 })] }))
    expect(out.filter((n) => n.type === 'account-negative')).toHaveLength(0)
  })

  it('thẻ tín dụng âm là bình thường, không báo', () => {
    const out = accountRules(
      input({ accounts: [account({ id: 'c', type: 'card', balance: -50_000 })] }),
    )
    expect(out.filter((n) => n.type === 'account-negative')).toHaveLength(0)
  })

  it('tài khoản đầu tư âm không báo (giá trị thị trường không phải tiền chi được)', () => {
    const out = accountRules(
      input({ accounts: [account({ id: 'i', type: 'investment', balance: -10 })] }),
    )
    expect(out.filter((n) => n.type === 'account-negative')).toHaveLength(0)
  })
})

describe('account-shortfall', () => {
  const source = account({ id: 'src', name: 'Rakuten Bank', balance: 40_000 })
  // Thẻ nợ 45.000, trả ngày 27 hằng tháng → ngày trả kế tiếp 2026-08-27 (còn 30 ngày)
  const farCard = account({
    id: 'card1',
    name: 'Thẻ Rakuten',
    type: 'card',
    balance: -45_000,
    payment_due_day: 27,
    payment_account_id: 'src',
  })
  // Thẻ trả ngày 5 → ngày trả kế tiếp 2026-08-05 (còn 8 ngày, trong tầm 14 ngày)
  const nearCard = account({
    id: 'card2',
    name: 'Thẻ PayPay',
    type: 'card',
    balance: -45_000,
    payment_due_day: 5,
    payment_account_id: 'src',
  })

  it('thẻ đến hạn trong 14 ngày mà nguồn không đủ thì báo', () => {
    const out = accountRules(input({ accounts: [source, nearCard] }))
    const hit = out.find((n) => n.type === 'account-shortfall')
    expect(hit?.key).toBe('account-shortfall:src')
    expect(hit?.title).toContain('Rakuten Bank')
  })

  it('thẻ đến hạn ngoài 14 ngày thì chưa báo', () => {
    const out = accountRules(input({ accounts: [source, farCard] }))
    expect(out.filter((n) => n.type === 'account-shortfall')).toHaveLength(0)
  })

  it('nguồn đủ tiền thì không báo', () => {
    const rich = account({ id: 'src', name: 'Rakuten Bank', balance: 90_000 })
    const out = accountRules(input({ accounts: [rich, nearCard] }))
    expect(out.filter((n) => n.type === 'account-shortfall')).toHaveLength(0)
  })

  it('đủ sát nút (thiếu 0đ) thì không báo', () => {
    const exact = account({ id: 'src', name: 'Rakuten Bank', balance: 45_000 })
    const out = accountRules(input({ accounts: [exact, nearCard] }))
    expect(out.filter((n) => n.type === 'account-shortfall')).toHaveLength(0)
  })

  it('cộng quy tắc định kỳ CHI trong 14 ngày vào phần phải trả', () => {
    const rich = account({ id: 'src', name: 'Rakuten Bank', balance: 50_000 })
    const rent = rule({
      id: 'r1',
      type: 'expense',
      amount: 17_000,
      account_id: 'src',
      note: 'Tiền nhà',
      start_on: '2026-08-01',
      last_generated_on: '2026-07-01',
    })
    const out = accountRules(input({ accounts: [rich, nearCard], recurringRules: [rent] }))
    const hit = out.find((n) => n.type === 'account-shortfall')
    expect(hit).toBeDefined()
    expect(hit?.detail).toContain('Tiền nhà')
  })

  it('trừ quy tắc định kỳ THU trong 14 ngày (không báo động giả trước kỳ lương)', () => {
    const salary = rule({
      id: 'r2',
      type: 'income',
      amount: 280_000,
      account_id: 'src',
      note: 'Lương',
      start_on: '2026-08-01',
      last_generated_on: '2026-07-01',
    })
    const out = accountRules(input({ accounts: [source, nearCard], recurringRules: [salary] }))
    expect(out.filter((n) => n.type === 'account-shortfall')).toHaveLength(0)
  })

  it('quy tắc đang tạm dừng thì không tính', () => {
    const rich = account({ id: 'src', name: 'Rakuten Bank', balance: 50_000 })
    const paused = rule({
      id: 'r3',
      type: 'expense',
      amount: 17_000,
      account_id: 'src',
      is_paused: true,
      start_on: '2026-08-01',
      last_generated_on: '2026-07-01',
    })
    const out = accountRules(input({ accounts: [rich, nearCard], recurringRules: [paused] }))
    expect(out.filter((n) => n.type === 'account-shortfall')).toHaveLength(0)
  })

  it('mã ổn định qua hai lần gọi', () => {
    const a = accountRules(input({ accounts: [source, nearCard] })).map((n) => n.key)
    const b = accountRules(input({ accounts: [source, nearCard] })).map((n) => n.key)
    expect(a).toEqual(b)
  })

  // Biên 14 ngày: todayISO 2026-07-28 + 14 ngày = 2026-08-11 (tháng 7 có 31 ngày,
  // 28 + 14 = 42, 42 - 31 = 11 → ngày 11 tháng 8). Dùng nguồn riêng, số dư cố tình
  // thấp hơn nợ thẻ để sự có/không của thông báo lộ ra việc thẻ có được tính hay không.
  const lowSrc = account({ id: 'srcB', name: 'Nguồn biên', balance: 10_000 })

  it('thẻ đến hạn đúng ngày thứ 14 thì được tính (biên trên, dùng dấu <=)', () => {
    // Mốc riêng cho ca này: today 2026-07-27 + 14 = 2026-08-10 (Thứ 2, không lễ).
    // payment_due_day=10: ngày 10/07 đã qua nên nhảy sang tháng sau → đúng bằng
    // untilISO. (Không mượn mốc 2026-08-11 của các ca khác được: đó là 山の日,
    // ngân hàng đóng cửa nên không ngày đến hạn nào rơi đúng vào đấy.)
    const boundaryCard = account({
      id: 'cardB1',
      name: 'Thẻ đúng biên',
      type: 'card',
      balance: -20_000,
      payment_due_day: 10,
      payment_account_id: 'srcB',
    })
    const out = accountRules(input({ todayISO: '2026-07-27', accounts: [lowSrc, boundaryCard] }))
    const hit = out.find((n) => n.type === 'account-shortfall')
    expect(hit?.key).toBe('account-shortfall:srcB')
  })

  it('thẻ đến hạn ngày thứ 15 thì CHƯA được tính (ngoài biên)', () => {
    // payment_due_day=12: ngày kế tiếp là 2026-08-12 (Thứ Tư, không bị dời),
    // tức 15 ngày kể từ hôm nay — vượt untilISO đúng 1 ngày.
    const afterCard = account({
      id: 'cardB2',
      name: 'Thẻ ngoài biên',
      type: 'card',
      balance: -20_000,
      payment_due_day: 12,
      payment_account_id: 'srcB',
    })
    const out = accountRules(input({ accounts: [lowSrc, afterCard] }))
    expect(out.filter((n) => n.type === 'account-shortfall')).toHaveLength(0)
  })

  it('nhiều thẻ chung nguồn khác currency: thẻ khác tiền không bị nêu tên trong detail', () => {
    // cardFunding() (aggregate.ts) chỉ gộp thẻ CÙNG currency với nguồn vào totalOwed;
    // detail phải nêu tên đúng những thẻ đã góp vào con số đó, không hơn không kém.
    const srcJPY = account({ id: 'srcC', name: 'Nguồn JPY', balance: 0 })
    const cardJPY = account({
      id: 'cardC1',
      name: 'Thẻ Yên',
      type: 'card',
      currency: 'JPY',
      balance: -30_000,
      payment_due_day: 5,
      payment_account_id: 'srcC',
    })
    const cardUSD = account({
      id: 'cardC2',
      name: 'Thẻ Đô',
      type: 'card',
      currency: 'USD',
      balance: -100,
      payment_due_day: 5,
      payment_account_id: 'srcC',
    })
    const out = accountRules(input({ accounts: [srcJPY, cardJPY, cardUSD] }))
    const hit = out.find((n) => n.type === 'account-shortfall')
    expect(hit?.detail).toContain('Thẻ Yên')
    expect(hit?.detail).not.toContain('Thẻ Đô')
  })

  // Một ví vừa đang âm vừa là nguồn trả thẻ = MỘT tình huống, phải ra MỘT dòng
  // (spec C.4). Số "thiếu 46.200" đã gồm luôn số dư âm 1.200 bên trong `have`, nên
  // hai dòng là nói hai lần cùng một chỗ tiền và ngốn 2/5 chỗ việc-cần-làm.
  it('ví đang âm mà cũng là nguồn trả thẻ thì chỉ ra MỘT dòng (giữ "đang âm")', () => {
    const negSrc = account({ id: 'srcN', name: 'Rakuten Bank', balance: -1_200 })
    const dueCard = account({
      id: 'cardN',
      name: 'Rakuten Card',
      type: 'card',
      balance: -45_000,
      payment_due_day: 5,
      payment_account_id: 'srcN',
    })
    const out = accountRules(input({ accounts: [negSrc, dueCard] }))
    expect(out.filter((n) => n.key.endsWith(':srcN'))).toHaveLength(1)
    expect(out.map((n) => n.type)).toEqual(['account-negative'])
  })

  // Nguồn thuộc loại KHÔNG được mục 2 xét (đầu tư/cố định): chặn theo `sourceBalance < 0`
  // sẽ làm cả hai mục im. Phải còn đúng dòng "thiếu tiền".
  it('nguồn là tài khoản đầu tư đang âm thì vẫn báo thiếu tiền (mục 2 không xét loại này)', () => {
    const invSrc = account({ id: 'srcI', name: 'Quỹ đầu tư', type: 'investment', balance: -1_200 })
    const dueCard = account({
      id: 'cardI',
      name: 'Thẻ nối quỹ',
      type: 'card',
      balance: -45_000,
      payment_due_day: 5,
      payment_account_id: 'srcI',
    })
    const out = accountRules(input({ accounts: [invSrc, dueCard] }))
    expect(out.map((n) => n.type)).toEqual(['account-shortfall'])
    expect(out[0].key).toBe('account-shortfall:srcI')
  })
})

describe('account-shortfall — nhánh 2 (không thẻ nào trỏ tới, chỉ định kỳ chi)', () => {
  it('định kỳ chi vượt số dư, không có thẻ nào trỏ tới thì báo', () => {
    const acc = account({ id: 'plain', name: 'Ví chi tiêu', balance: 10_000 })
    const bill = rule({
      id: 'r10',
      type: 'expense',
      amount: 15_000,
      account_id: 'plain',
      note: 'Hóa đơn điện',
      start_on: '2026-08-01',
      last_generated_on: '2026-07-01',
    })
    const out = accountRules(input({ accounts: [acc], recurringRules: [bill] }))
    const hit = out.find((n) => n.type === 'account-shortfall')
    expect(hit?.key).toBe('account-shortfall:plain')
    expect(hit?.detail).toContain('Hóa đơn điện')
  })

  it('số dư đủ trả định kỳ chi thì không báo', () => {
    const acc = account({ id: 'plain', balance: 20_000 })
    const bill = rule({
      id: 'r11',
      type: 'expense',
      amount: 15_000,
      account_id: 'plain',
      start_on: '2026-08-01',
      last_generated_on: '2026-07-01',
    })
    const out = accountRules(input({ accounts: [acc], recurringRules: [bill] }))
    expect(out.filter((n) => n.type === 'account-shortfall')).toHaveLength(0)
  })

  it('định kỳ thu bù định kỳ chi (không báo động giả trước kỳ lương)', () => {
    const acc = account({ id: 'plain', balance: 5_000 })
    const bill = rule({
      id: 'r12',
      type: 'expense',
      amount: 15_000,
      account_id: 'plain',
      start_on: '2026-08-01',
      last_generated_on: '2026-07-01',
    })
    const salary = rule({
      id: 'r13',
      type: 'income',
      amount: 10_000,
      account_id: 'plain',
      start_on: '2026-08-01',
      last_generated_on: '2026-07-01',
    })
    const out = accountRules(input({ accounts: [acc], recurringRules: [bill, salary] }))
    expect(out.filter((n) => n.type === 'account-shortfall')).toHaveLength(0)
  })

  it('tài khoản đã được nhánh thẻ xử lý thì không bị nhánh định kỳ xử lý lần hai', () => {
    // Số dư cố tình thấp và có thêm định kỳ chi ngay trên 'src': nếu thiếu chặn
    // sourcesSeen, riêng định kỳ chi (bỏ qua nợ thẻ) cũng đủ để nhánh 2 tự bắn thêm
    // một thông báo trùng key — nhờ vậy phép thử này thật sự bắt được lỗi thiếu chặn.
    const source = account({ id: 'src', name: 'Rakuten Bank', balance: 5_000 })
    const nearCard = account({
      id: 'card2',
      name: 'Thẻ PayPay',
      type: 'card',
      balance: -45_000,
      payment_due_day: 5,
      payment_account_id: 'src',
    })
    const rent = rule({
      id: 'r14',
      type: 'expense',
      amount: 10_000,
      account_id: 'src',
      note: 'Tiền nhà',
      start_on: '2026-08-01',
      last_generated_on: '2026-07-01',
    })
    const out = accountRules(input({ accounts: [source, nearCard], recurringRules: [rent] }))
    expect(out.filter((n) => n.key === 'account-shortfall:src')).toHaveLength(1)
  })
})

describe('account-shortfall — dòng phụ phải đọc được và cộng lại đúng', () => {
  it('một quy tắc định kỳ CHƯA ĐẶT TÊN thì không để dấu phân cách cụt ở cuối', () => {
    const acc = account({ id: 'plain', name: 'Ví chi tiêu', balance: 0 })
    const bill = rule({
      id: 'r20',
      type: 'expense',
      amount: 50_000,
      account_id: 'plain',
      note: '', // người dùng không ghi ghi chú — rất thường gặp
      start_on: '2026-08-01',
      last_generated_on: '2026-07-01',
    })
    const hit = accountRules(input({ accounts: [acc], recurringRules: [bill] })).find(
      (n) => n.type === 'account-shortfall',
    )
    // Trước khi sửa: '14 ngày tới phải trả 50000 · ' — treo lơ lửng.
    expect(hit?.detail).toBe('14 ngày tới phải trả 50000 · Khoản định kỳ 50000')
    expect(hit?.detail?.endsWith(' · ')).toBe(false)
  })

  it('các khoản liệt kê cộng lại ĐÚNG bằng tổng phải trả đã nêu', () => {
    const acc = account({ id: 'plain', name: 'Ví chi tiêu', balance: 0 })
    const named = rule({
      id: 'r21',
      type: 'expense',
      amount: 17_000,
      account_id: 'plain',
      note: 'Tiền nhà',
      start_on: '2026-08-01',
      last_generated_on: '2026-07-01',
    })
    const unnamed = rule({
      id: 'r22',
      type: 'expense',
      amount: 3_000,
      account_id: 'plain',
      note: '',
      start_on: '2026-08-02',
      last_generated_on: '2026-07-02',
    })
    const hit = accountRules(input({ accounts: [acc], recurringRules: [named, unnamed] })).find(
      (n) => n.type === 'account-shortfall',
    )
    expect(hit?.detail).toBe('14 ngày tới phải trả 20000 · Tiền nhà 17000 · Khoản định kỳ 3000')
    // Đọc lại số từ chính dòng phụ rồi cộng: phải khớp tổng đã in ra, nếu không thì
    // người dùng không có cách nào đối chiếu con số họ đang nhìn.
    const [head, ...listed] = (hit?.detail ?? '').split(' · ')
    const total = Number(head.match(/(\d+)$/)?.[1])
    const sum = listed.reduce((s, part) => s + Number(part.match(/(\d+)$/)?.[1]), 0)
    expect(sum).toBe(total)
  })
})
