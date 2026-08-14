import { describe, expect, it } from 'vitest'
import type {
  AccountBalanceRow,
  CategoryRow,
  DebtPaymentRow,
  DebtRow,
  TransactionRow,
} from '../../types/database.types'
import type { Rates } from '../../lib/rates'
import { buildHealthSnapshot, type SnapshotInput } from './snapshot'

// base = JPY: 1 ¥ = 165 ₫
const RATES: Rates = { JPY: 1, VND: 165 }

let seq = 0
function bal(p: Partial<AccountBalanceRow> & Pick<AccountBalanceRow, 'balance'>): AccountBalanceRow {
  return {
    id: `a${seq++}`,
    user_id: 'u',
    name: 'TK',
    type: 'bank',
    currency: 'JPY',
    asset_group: null,
    is_hidden: false,
    include_in_totals: true,
    credit_limit: null,
    statement_day: null,
    payment_due_day: null,
    payment_account_id: null,
    is_archived: false,
    sort_order: 0,
    cost_basis: 0,
    depreciation_months: null,
    depreciation_from: null,
    salvage_value: 0,
    tax_shelter: null,
    shelter_annual_limit: null,
    market_value: null,
    ...p,
  }
}

function tx(p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount' | 'occurred_on'>): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    to_amount: null,
    category_id: 'cat-an',
    account_id: 'acc',
    to_account_id: null,
    recurring_rule_id: null,
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  }
}

const cat = (id: string, cost_type: CategoryRow['cost_type']): CategoryRow => ({
  id,
  user_id: 'u',
  name: id,
  type: 'expense',
  icon: '📦',
  parent_id: null,
  sort_order: 0,
  is_archived: false,
  created_at: '',
  need_level: null,
  cost_type,
})

const MONTHS = [
  { year: 2026, month: 4 },
  { year: 2026, month: 5 },
  { year: 2026, month: 6 },
]

function build(over: Partial<SnapshotInput> = {}) {
  return buildHealthSnapshot({
    balances: [],
    debts: [],
    debtPayments: [],
    txs: [],
    categories: [],
    months: MONTHS,
    monthStartDay: 1,
    currencyOf: () => 'JPY',
    base: 'JPY',
    rates: RATES,
    today: '2026-07-15',
    ...over,
  })
}

describe('buildHealthSnapshot — bảng cân đối', () => {
  it('chỉ cộng tài khoản LỎNG vào tài sản lỏng', () => {
    const s = build({
      balances: [
        bal({ type: 'cash', balance: 30_000 }),
        bal({ type: 'bank', balance: 500_000 }),
        bal({ type: 'ic', balance: 3_000 }),
        bal({ type: 'ewallet', balance: 7_000 }),
        bal({ type: 'investment', balance: 2_000_000 }), // phải bán mới tiêu được
        bal({ type: 'fixed', balance: 1_500_000 }), // xe cộ, không lỏng
      ],
    })
    expect(s.liquidAssets).toBe(540_000)
  })

  it('bỏ tài khoản đã lưu trữ / bị ẩn / không tính vào tổng', () => {
    const s = build({
      balances: [
        bal({ balance: 100_000 }),
        bal({ balance: 999_999, is_archived: true }),
        bal({ balance: 999_999, is_hidden: true }),
        bal({ balance: 999_999, include_in_totals: false }),
      ],
    })
    expect(s.liquidAssets).toBe(100_000)
  })

  it('quy đổi tài khoản ngoại tệ về base', () => {
    const s = build({
      balances: [bal({ currency: 'VND', balance: 1_650_000 })], // = ¥10.000
    })
    expect(s.liquidAssets).toBe(10_000)
    expect(s.hasMissingRate).toBe(false)
  })

  it('thiếu tỷ giá → đánh dấu, không cộng bừa', () => {
    const s = build({
      balances: [bal({ currency: 'USD', balance: 100 })],
      rates: { JPY: 1 },
    })
    expect(s.liquidAssets).toBe(0)
    expect(s.hasMissingRate).toBe(true)
  })

  it('số dư thẻ âm là nợ; thẻ trả dư không thành tài sản lỏng', () => {
    const s = build({
      balances: [
        bal({ type: 'card', balance: -80_000 }),
        bal({ type: 'card', balance: 5_000 }),
        bal({ balance: 200_000 }),
      ],
    })
    expect(s.cardDebt).toBe(80_000)
    expect(s.liquidAssets).toBe(200_000)
    expect(s.totalDebt).toBe(80_000)
  })
})

describe('buildHealthSnapshot — nợ vay', () => {
  const debt = (p: Partial<DebtRow> & Pick<DebtRow, 'id' | 'principal'>): DebtRow => ({
    user_id: 'u',
    counterparty: 'A',
    direction: 'i_owe',
    currency: 'JPY',
    due_on: null,
    status: 'open',
    note: '',
    interest_bps: null,
    term_months: null,
    disbursement_transaction_id: null,
    created_at: '',
    updated_at: '',
    ...p,
  })

  it('cộng nợ mình vay, bỏ khoản người ta nợ mình', () => {
    const s = build({
      debts: [
        debt({ id: 'd1', principal: 300_000 }),
        debt({ id: 'd2', principal: 500_000, direction: 'owed_to_me' }),
      ],
    })
    expect(s.totalDebt).toBe(300_000)
  })

  it('trừ phần đã trả và bỏ khoản đã tất toán', () => {
    const payments: DebtPaymentRow[] = [
      { id: 'p1', user_id: 'u', debt_id: 'd1', amount: 100_000, paid_on: '2026-05-10', transaction_id: null, note: '', created_at: '' },
    ]
    const s = build({
      debts: [debt({ id: 'd1', principal: 300_000 }), debt({ id: 'd3', principal: 900_000, status: 'settled' })],
      debtPayments: payments,
    })
    expect(s.totalDebt).toBe(200_000)
  })

  it('nợ đến hạn sau 12 tháng không tính vào nợ ngắn hạn', () => {
    const s = build({
      debts: [
        debt({ id: 'd1', principal: 100_000, due_on: '2026-12-01' }), // trong 12 tháng
        debt({ id: 'd2', principal: 700_000, due_on: '2030-01-01' }), // dài hạn
        debt({ id: 'd3', principal: 50_000 }), // không hạn → coi là ngắn hạn
      ],
    })
    expect(s.totalDebt).toBe(850_000)
    expect(s.debtDueWithin12m).toBe(150_000)
  })

  it('tiền trả nợ trung bình tháng chỉ tính lần trả dương trong kỳ', () => {
    const payments: DebtPaymentRow[] = [
      { id: 'p1', user_id: 'u', debt_id: 'd1', amount: 30_000, paid_on: '2026-04-10', transaction_id: null, note: '', created_at: '' },
      { id: 'p2', user_id: 'u', debt_id: 'd1', amount: 60_000, paid_on: '2026-06-10', transaction_id: null, note: '', created_at: '' },
      { id: 'p3', user_id: 'u', debt_id: 'd1', amount: -50_000, paid_on: '2026-05-10', transaction_id: null, note: '', created_at: '' }, // vay thêm
      { id: 'p4', user_id: 'u', debt_id: 'd1', amount: 99_000, paid_on: '2025-01-10', transaction_id: null, note: '', created_at: '' }, // ngoài kỳ
    ]
    const s = build({ debts: [debt({ id: 'd1', principal: 300_000 })], debtPayments: payments })
    expect(s.monthlyDebtPayment).toBe(30_000) // (30k + 60k) / 3 tháng
  })
})

describe('buildHealthSnapshot — dòng tiền', () => {
  it('tách chi cố định theo cost_type và chia trung bình theo số tháng', () => {
    const s = build({
      categories: [cat('cat-nha', 'fixed'), cat('cat-an', 'variable')],
      txs: [
        tx({ type: 'expense', amount: 90_000, occurred_on: '2026-04-05', category_id: 'cat-nha' }),
        tx({ type: 'expense', amount: 90_000, occurred_on: '2026-05-05', category_id: 'cat-nha' }),
        tx({ type: 'expense', amount: 90_000, occurred_on: '2026-06-05', category_id: 'cat-nha' }),
        tx({ type: 'expense', amount: 30_000, occurred_on: '2026-06-06', category_id: 'cat-an' }),
      ],
    })
    expect(s.monthlyFixedExpense).toBe(90_000)
    expect(s.monthlyExpense).toBe(100_000) // 300k/3
    expect(s.hasUnclassifiedExpense).toBe(false)
  })

  it('danh mục chưa gán cost_type → bật cờ cảnh báo', () => {
    const s = build({
      categories: [cat('cat-an', null)],
      txs: [tx({ type: 'expense', amount: 10_000, occurred_on: '2026-05-05' })],
    })
    expect(s.hasUnclassifiedExpense).toBe(true)
  })

  it('hoàn tiền trừ vào chi, không cộng vào thu', () => {
    const s = build({
      categories: [cat('cat-an', 'variable')],
      txs: [
        tx({ type: 'expense', amount: 50_000, occurred_on: '2026-05-05' }),
        tx({ type: 'expense', amount: 20_000, occurred_on: '2026-05-06', is_refund: true }),
      ],
    })
    expect(s.monthlyExpense).toBe(10_000) // (50k − 20k) / 3
    expect(s.annualIncome).toBe(0)
  })

  it('bỏ chuyển khoản, dòng tiền nợ và giao dịch loại khỏi thống kê', () => {
    const s = build({
      txs: [
        tx({ type: 'transfer', amount: 500_000, occurred_on: '2026-05-01', category_id: null, to_account_id: 'b' }),
        tx({ type: 'expense', amount: 500_000, occurred_on: '2026-05-02', is_debt_flow: true }),
        tx({ type: 'expense', amount: 500_000, occurred_on: '2026-05-03', exclude_from_stats: true }),
        tx({ type: 'expense', amount: 30_000, occurred_on: '2026-05-04' }),
      ],
    })
    expect(s.monthlyExpense).toBe(10_000)
  })

  it('dòng tiền ròng trả về đúng một phần tử mỗi tháng, theo thứ tự', () => {
    const s = build({
      txs: [
        tx({ type: 'income', amount: 300_000, occurred_on: '2026-04-25', category_id: 'luong' }),
        tx({ type: 'expense', amount: 100_000, occurred_on: '2026-04-26' }),
        tx({ type: 'expense', amount: 50_000, occurred_on: '2026-06-01' }),
      ],
    })
    expect(s.netFlows).toEqual([200_000, 0, -50_000])
    expect(s.monthsCounted).toBe(3)
  })

  it('gom thu nhập theo danh mục cho chỉ số tập trung thu nhập', () => {
    const s = build({
      txs: [
        tx({ type: 'income', amount: 300_000, occurred_on: '2026-04-25', category_id: 'luong' }),
        tx({ type: 'income', amount: 100_000, occurred_on: '2026-05-25', category_id: 'luong' }),
        tx({ type: 'income', amount: 40_000, occurred_on: '2026-05-26', category_id: 'thuong' }),
      ],
    })
    expect(s.incomeSlices.sort((a, b) => b.amount - a.amount)).toEqual([
      { key: 'luong', amount: 400_000 },
      { key: 'thuong', amount: 40_000 },
    ])
    expect(s.annualIncome).toBe(440_000)
    expect(s.monthlyIncome).toBeCloseTo(146_666.67, 1)
  })

  it('giao dịch ngoài danh sách tháng không lọt vào trung bình', () => {
    const s = build({
      txs: [
        tx({ type: 'expense', amount: 999_000, occurred_on: '2026-07-05' }), // tháng đang chạy dở
        tx({ type: 'expense', amount: 30_000, occurred_on: '2026-06-05' }),
      ],
    })
    expect(s.monthlyExpense).toBe(10_000)
  })
})

describe('buildHealthSnapshot — dòng tiền chỉ-chi-thiết-yếu', () => {
  // Danh mục có cả hai trục: need_level quyết định cắt được hay không
  const need = (id: string, need_level: CategoryRow['need_level']): CategoryRow => ({
    ...cat(id, null),
    need_level,
  })
  const CATS = [need('thiet-yeu', 'essential'), need('linh-hoat', 'flexible'), need('chua-gan', null)]

  it('cắt đúng phần linh hoạt, giữ lại thiết yếu', () => {
    const s = build({
      categories: CATS,
      txs: [
        tx({ type: 'income', amount: 300_000, occurred_on: '2026-05-10', category_id: 'luong' }),
        tx({ type: 'expense', amount: 200_000, occurred_on: '2026-05-11', category_id: 'thiet-yeu' }),
        tx({ type: 'expense', amount: 150_000, occurred_on: '2026-05-12', category_id: 'linh-hoat' }),
      ],
    })
    const may = s.netFlows[1]
    const mayEssential = s.essentialNetFlows[1]
    expect(may).toBe(-50_000) // 300k thu − 350k chi
    expect(mayEssential).toBe(100_000) // 300k thu − 200k chi thiết yếu
  })

  it('danh mục CHƯA phân loại được coi là thiết yếu — không hứa hão là cắt được', () => {
    const s = build({
      categories: CATS,
      txs: [
        tx({ type: 'income', amount: 100_000, occurred_on: '2026-05-10', category_id: 'luong' }),
        tx({ type: 'expense', amount: 80_000, occurred_on: '2026-05-11', category_id: 'chua-gan' }),
      ],
    })
    expect(s.essentialNetFlows[1]).toBe(20_000)
    expect(s.hasUnclassifiedNeed).toBe(true)
  })

  it('không có danh mục nào bị gắn linh hoạt → hai kịch bản trùng nhau', () => {
    const s = build({
      categories: [need('thiet-yeu', 'essential')],
      txs: [
        tx({ type: 'income', amount: 100_000, occurred_on: '2026-05-10', category_id: 'luong' }),
        tx({ type: 'expense', amount: 40_000, occurred_on: '2026-05-11', category_id: 'thiet-yeu' }),
      ],
    })
    expect(s.essentialNetFlows).toEqual(s.netFlows)
    expect(s.monthlyFlexibleExpense).toBe(0)
  })

  it('hoàn tiền khoản linh hoạt không làm phồng phần cắt được', () => {
    const s = build({
      categories: CATS,
      txs: [
        tx({ type: 'expense', amount: 50_000, occurred_on: '2026-05-11', category_id: 'linh-hoat' }),
        tx({
          type: 'expense',
          amount: 20_000,
          occurred_on: '2026-05-12',
          category_id: 'linh-hoat',
          is_refund: true,
        }),
      ],
    })
    // chi linh hoạt ròng = 30k, chia đều 3 tháng
    expect(s.monthlyFlexibleExpense).toBe(10_000)
    expect(s.essentialNetFlows[1]).toBe(0)
  })

  it('mỗi tháng một phần tử, đúng thứ tự cũ → mới', () => {
    const s = build({ categories: CATS })
    expect(s.essentialNetFlows).toHaveLength(MONTHS.length)
  })
})

describe('buildHealthSnapshot — thuế & an sinh đứng ngoài Thu/Chi', () => {
  const TAX = 'cat-thue'
  const taxIds = new Set([TAX])

  /**
   * Vì sao khoản thuế mang `exclude_from_stats`: thuế trừ TẠI NGUỒN không phải chi
   * tuỳ ý. Cộng vào ô Chi làm con số đó mất nghĩa như tín hiệu tiêu tiền — Chi
   * phồng thêm gần trăm nghìn yên mỗi tháng mà chủ sổ không hề tiêu.
   *
   * Nhưng chỉ số gánh nặng thuế vẫn phải đếm chúng, nên đây là chỗ DUY NHẤT trong
   * buildHealthSnapshot bỏ qua cờ đó.
   */
  it('đếm vào taxAndSocial nhưng KHÔNG vào monthlyExpense', () => {
    const s = build({
      categories: [cat(TAX, 'fixed')],
      taxCategoryIds: taxIds,
      txs: [
        tx({ type: 'expense', amount: 90_000, occurred_on: '2026-05-10',
             category_id: TAX, exclude_from_stats: true }),
        tx({ type: 'expense', amount: 30_000, occurred_on: '2026-05-11',
             category_id: 'cat-an' }),
      ],
    })
    expect(s.taxAndSocial).toBe(90_000)
    // 90.000 KHÔNG được lọt vào chi: chỉ còn 30.000 chia 3 tháng
    expect(s.monthlyExpense).toBe(10_000)
    expect(s.monthlyFixedExpense).toBe(0)
  })

  it('dòng thu "phần bị giữ lại" cũng đứng ngoài, nên annualIncome là số RÒNG', () => {
    const s = build({
      categories: [cat(TAX, 'fixed')],
      taxCategoryIds: taxIds,
      txs: [
        tx({ type: 'income', amount: 300_000, occurred_on: '2026-05-10' }),
        tx({ type: 'income', amount: 90_000, occurred_on: '2026-05-10',
             exclude_from_stats: true }),
        tx({ type: 'expense', amount: 90_000, occurred_on: '2026-05-10',
             category_id: TAX, exclude_from_stats: true }),
      ],
    })
    expect(s.annualIncome).toBe(300_000)
    expect(s.taxAndSocial).toBe(90_000)
    // Gộp suy ra được: HealthView dùng annualIncome + taxAndSocial
    expect(s.annualIncome + s.taxAndSocial).toBe(390_000)
  })

  it('hoàn thuế là chi ÂM nên trừ khỏi taxAndSocial', () => {
    const s = build({
      categories: [cat(TAX, 'fixed')],
      taxCategoryIds: taxIds,
      txs: [
        tx({ type: 'expense', amount: 90_000, occurred_on: '2026-05-10',
             category_id: TAX, exclude_from_stats: true }),
        tx({ type: 'expense', amount: 20_000, occurred_on: '2026-05-10',
             category_id: TAX, exclude_from_stats: true, is_refund: true }),
      ],
    })
    expect(s.taxAndSocial).toBe(70_000)
  })

  it('dòng nợ/cho vay vẫn bị bỏ, kể cả khi thuộc danh mục thuế', () => {
    const s = build({
      categories: [cat(TAX, 'fixed')],
      taxCategoryIds: taxIds,
      txs: [
        tx({ type: 'expense', amount: 50_000, occurred_on: '2026-05-10',
             category_id: TAX, is_debt_flow: true }),
      ],
    })
    expect(s.taxAndSocial).toBe(0)
  })
})
