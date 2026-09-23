import { describe, expect, it } from 'vitest'
import type { Rates } from '../../lib/rates'
import type {
  DebtPaymentRow,
  DebtRow,
  SavingsGoalRow,
  TransactionRow,
} from '../../types/database.types'
import { goalForecast } from '../assets/goals'
import {
  debtBreakdown,
  goalProgress,
  keptFlow,
  monthsToClose,
  outsideTransfersIn,
  shortMonth,
  sortLevers,
  type LeverRow,
} from './decide'

const RATES: Rates = { JPY: 1, VND: 165 }

describe('keptFlow', () => {
  const flow = keptFlow({
    kept: 1_732_260,
    cashGrowth: 312_260,
    investGrowth: 1_080_000,
    remitTotal: 340_000,
    months: 12,
  })

  it('nói ra phần KHÔNG rút được ngay — lý do khối này tồn tại', () => {
    expect(flow.illiquidPct).toBe(82)
  })

  it('RÀNG BUỘC: ba tầng cộng lại đúng bằng phần giữ lại, không tầng nào vượt 100%', () => {
    // Bản đầu tính `kept = thu − chi − chuyển tài sản` rồi vẫn in "gửi về VN" làm một tầng
    // CỦA phần giữ lại — ba tầng cộng lại ra 126% + 37% + 54% kèm một dòng bù −117%.
    // Ở đây `kept` phải là thu − CHI THẬT, và gửi về VN là một trong những chỗ nó đi.
    const f = keptFlow({
      kept: 1_180_000,
      cashGrowth: 270_000,
      investGrowth: 540_000,
      remitTotal: 370_000,
      months: 12,
    })
    expect(f.tiers.some((t) => t.key === 'other')).toBe(false)
    expect(f.tiers.reduce((s, t) => s + t.amount, 0)).toBe(1_180_000)
    expect(f.tiers.every((t) => t.pct !== null && t.pct <= 100)).toBe(true)
    expect(f.tiers.reduce((s, t) => s + (t.pct ?? 0), 0)).toBe(100)
  })

  it('mỗi tầng khai rõ rút được ngay hay không', () => {
    const byKey = new Map(flow.tiers.map((t) => [t.key, t]))
    expect(byKey.get('invest')?.liquid).toBe('sell')
    expect(byKey.get('remit')?.liquid).toBe('gone')
    expect(byKey.get('cash')?.liquid).toBe('now')
  })

  it('phần không khớp ba tầng được IN RA, không bỏ đi', () => {
    const f = keptFlow({
      kept: 1_000_000,
      cashGrowth: 100_000,
      investGrowth: 200_000,
      remitTotal: 0,
      months: 12,
    })
    const other = f.tiers.find((t) => t.key === 'other')
    expect(other?.amount).toBe(700_000)
    // Bốn tầng cộng lại đúng bằng phần giữ lại.
    expect(f.tiers.reduce((s, t) => s + t.amount, 0)).toBe(1_000_000)
  })

  it('không gửi tiền / không đầu tư thì tầng đó không hiện', () => {
    const f = keptFlow({ kept: 100, cashGrowth: 100, investGrowth: 0, remitTotal: 0, months: 1 })
    expect(f.tiers.map((t) => t.key)).toEqual(['cash'])
  })

  it('giữ lại ≤ 0 → không in phần trăm nào', () => {
    const f = keptFlow({ kept: 0, cashGrowth: -5_000, investGrowth: 0, remitTotal: 0, months: 6 })
    expect(f.illiquidPct).toBeNull()
    expect(f.tiers.every((t) => t.pct === null)).toBe(true)
  })

  it('nhịp mỗi tháng là SỐ, không phải chuỗi đã định dạng', () => {
    // Trả chuỗi thì nơi gọi in ra "273300/tháng" — không ký hiệu tiền, không phân cách
    // nghìn, và không đi qua chế độ che số.
    expect(flow.tiers.find((t) => t.key === 'cash')?.perMonth).toBe(26_022)
    expect(flow.tiers.find((t) => t.key === 'cash')?.note).toBe('')
  })

  it('tiền mặt dày thêm NHIỀU HƠN phần giữ lại → 0%, không phải số âm', () => {
    // Xảy ra thật: bán tài sản, rút đầu tư, hoặc chỉ là lệch làm tròn giữa hai nguồn đo.
    const f = keptFlow({
      kept: 271_500,
      cashGrowth: 273_300,
      investGrowth: 0,
      remitTotal: 0,
      months: 1,
    })
    expect(f.illiquidPct).toBe(0)
  })
})

describe('monthsToClose', () => {
  it('lấp khoảng theo nhịp, làm tròn lên tới 0,1', () => {
    expect(monthsToClose(259_959, 26_022)).toBeCloseTo(10, 1)
  })

  it('đã đủ → 0', () => {
    expect(monthsToClose(0, 26_022)).toBe(0)
    expect(monthsToClose(-5_000, 26_022)).toBe(0)
  })

  it('nhịp ≤ 0 → null, KHÔNG phải một con số lớn', () => {
    expect(monthsToClose(100_000, 0)).toBeNull()
    expect(monthsToClose(100_000, -3_000)).toBeNull()
  })
})

describe('sortLevers', () => {
  const rows: LeverRow[] = [
    { key: 'sell', label: 'Bán đầu tư', cashPerMonth: null, monthsAfter: 0, tradeoff: 'chốt lãi sớm' },
    { key: 'nisa', label: 'Hạ nhịp NISA', cashPerMonth: 45_000, monthsAfter: 3.7, tradeoff: 'đầu tư ít đi' },
    { key: 'remit', label: 'Tạm dừng gửi về VN', cashPerMonth: 90_000, monthsAfter: 6.5, tradeoff: 'gián đoạn chuỗi' },
    { key: 'food', label: 'Cơm ngoài về TB', cashPerMonth: 1_514, monthsAfter: 9.5, tradeoff: 'gần như không đổi gì' },
    { key: 'never', label: 'Không đủ', cashPerMonth: 10, monthsAfter: null, tradeoff: 'x' },
  ]

  it('xếp theo TÁC ĐỘNG: rút ngắn nhiều nhất lên đầu', () => {
    expect(sortLevers(rows).map((x) => x.key)).toEqual(['sell', 'nisa', 'remit', 'food', 'never'])
  })

  it('mục tiêu thật đổi thứ tự — "tạm dừng gửi về VN" tụt xuống cuối', () => {
    expect(sortLevers(rows, ['remit']).map((x) => x.key)).toEqual([
      'sell',
      'nisa',
      'food',
      'never',
      'remit',
    ])
  })

  it('MỌI dòng đều phải có cột Đánh đổi', () => {
    expect(rows.every((x) => x.tradeoff.trim().length > 0)).toBe(true)
  })

  it('không sửa mảng gốc', () => {
    const before = rows.map((x) => x.key)
    sortLevers(rows, ['remit'])
    expect(rows.map((x) => x.key)).toEqual(before)
  })
})

// ---------------------------------------------------------------------------------

let seq = 0
function debt(p: Partial<DebtRow> & Pick<DebtRow, 'counterparty' | 'principal'>): DebtRow {
  return {
    id: `d${seq++}`,
    user_id: 'u',
    direction: 'i_owe',
    currency: 'JPY',
    due_on: '2026-09-01',
    status: 'open',
    note: '',
    interest_bps: null,
    term_months: null,
    disbursement_transaction_id: null,
    created_at: '',
    updated_at: '',
    ...p,
  } as DebtRow
}

describe('debtBreakdown', () => {
  it('xếp theo TIỀN LÃI, không theo dư nợ', () => {
    const the = debt({
      counterparty: 'Thẻ tín dụng trả góp',
      principal: 318_400,
      interest_bps: 1_500,
      term_months: 11,
    })
    const vay = debt({
      counterparty: 'Vay tiêu dùng',
      principal: 400_000, // dư nợ LỚN HƠN…
      interest_bps: 100, // …nhưng lãi thấp hơn nhiều
      term_months: 18,
    })
    const r = debtBreakdown([vay, the], [], 'JPY', RATES, '2026-08-18')
    expect(r.lines.map((l) => l.label)).toEqual(['Thẻ tín dụng trả góp', 'Vay tiêu dùng'])
    expect(r.lines[0].interestLeft!).toBeGreaterThan(r.lines[1].interestLeft!)
  })

  it('lãi 0% → tiền lãi bằng 0, KHÁC hẳn "chưa biết lãi"', () => {
    const thue = debt({
      counterparty: 'Thuế cư trú trả sau',
      principal: 91_498,
      interest_bps: 0,
      term_months: 4,
    })
    const r = debtBreakdown([thue], [], 'JPY', RATES, '2026-08-18')
    expect(r.lines[0].interestLeft).toBe(0)
    expect(r.lines[0].ratePct).toBe(0)
    expect(r.hasIncomplete).toBe(false)
  })

  it('KHÔNG đoán lãi suất: thiếu interest_bps → interestLeft null và bật cờ', () => {
    const d = debt({ counterparty: 'Nợ bạn', principal: 50_000, term_months: 5 })
    const r = debtBreakdown([d], [], 'JPY', RATES, '2026-08-18')
    expect(r.lines[0].interestLeft).toBeNull()
    expect(r.lines[0].ratePct).toBeNull()
    expect(r.hasIncomplete).toBe(true)
    // Vẫn tính được tiền mỗi kỳ (chia đều gốc) — đó là số ĐÚNG, khác với lãi.
    expect(r.lines[0].perPeriod).toBe(10_000)
  })

  it('khoản chưa biết lãi xếp CUỐI, không bị coi là lãi 0', () => {
    const biet = debt({ counterparty: 'Biết lãi', principal: 100_000, interest_bps: 500, term_months: 12 })
    const chua = debt({ counterparty: 'Chưa biết', principal: 900_000, term_months: 12 })
    const r = debtBreakdown([chua, biet], [], 'JPY', RATES, '2026-08-18')
    expect(r.lines.map((l) => l.label)).toEqual(['Biết lãi', 'Chưa biết'])
  })

  it('trừ số kỳ đã trả khỏi số kỳ còn lại', () => {
    const d = debt({ counterparty: 'X', principal: 100_000, interest_bps: 500, term_months: 12 })
    const pays: DebtPaymentRow[] = [1, 2, 3].map((i) => ({
      id: `p${i}`,
      user_id: 'u',
      debt_id: d.id,
      amount: 0,
      paid_on: '2026-0' + i + '-01',
      transaction_id: null,
      note: '',
      created_at: '',
    }))
    expect(debtBreakdown([d], pays, 'JPY', RATES, '2026-08-18').lines[0].termsLeft).toBe(9)
  })

  it('bỏ khoản đã tất toán, khoản NGƯỜI TA nợ mình, và khoản đã trả hết', () => {
    const rows = [
      debt({ counterparty: 'Đã xong', principal: 10_000, status: 'settled' }),
      debt({ counterparty: 'Cho vay', principal: 10_000, direction: 'owed_to_me' }),
    ]
    expect(debtBreakdown(rows, [], 'JPY', RATES, '2026-08-18').lines).toEqual([])
  })

  it('thiếu tỷ giá → cờ, dư nợ gốc vẫn in được', () => {
    const d = debt({ counterparty: 'Nợ VND', principal: 1_000_000, currency: 'VND' })
    const r = debtBreakdown([d], [], 'JPY', { JPY: 1 }, '2026-08-18')
    expect(r.hasMissingRate).toBe(true)
    expect(r.lines[0].remaining).toBe(1_000_000)
    expect(r.lines[0].remainingBase).toBeNull()
  })
})

// ---------------------------------------------------------------------------------

function goal(p: Partial<SavingsGoalRow> & Pick<SavingsGoalRow, 'name' | 'target_amount'>): SavingsGoalRow {
  return {
    id: `g${seq++}`,
    user_id: 'u',
    account_id: 'acc',
    target_date: null,
    note: '',
    sort_order: 0,
    created_at: '',
    ...p,
  } as SavingsGoalRow
}

describe('goalProgress', () => {
  const AUG = { year: 2026, month: 8 }
  const input =
    (current: number | null, monthlyGrowth: number | null, currency: 'JPY' | 'VND' = 'JPY') =>
    () => ({ current, monthlyGrowth, currency })

  it('tiến độ + mốc theo nhịp CỦA TÀI KHOẢN gắn mục tiêu', () => {
    const g = goal({ name: 'Đủ 1× trả nợ', target_amount: 649_898 })
    const [line] = goalProgress([g], input(389_939, 26_022), AUG, 1)
    expect(Math.round(line.ratio * 100)).toBe(60)
    expect(line.done).toBe(false)
    expect(shortMonth(line.etaMonth!)).toBe('06/2027')
  })

  it('CÙNG số với khu Mục tiêu của trang Tài sản — cùng hàm goalForecast', () => {
    const g = goal({ name: 'EB-3', target_amount: 2_000_000, target_date: '2027-03-01' })
    const [line] = goalProgress([g], input(1_200_000, 90_000), AUG, 25)
    const f = goalForecast(1_200_000, 2_000_000, 90_000, AUG, '2027-03-01', 25)
    expect(line.etaMonth).toEqual(f.etaMonth)
    expect(line.vsDeadline).toBe(f.vsDeadline)
    expect(line.ratio).toBe(f.ratio)
  })

  it('không đo được nhịp (null) → KHÔNG hứa ngày nào, như trang Tài sản', () => {
    // Bản trước dùng nhịp tiền mặt CHUNG của mọi tài khoản nên vẫn hứa "đạt 11/2026" cho
    // một mục tiêu mà trang Tài sản nói "chưa đo được tốc độ tích lũy".
    const g = goal({ name: 'EB-3', target_amount: 1_000_000 })
    const [line] = goalProgress([g], input(100_000, null), AUG, 1)
    expect(line.etaMonth).toBeNull()
    expect(line.monthlyGrowth).toBe(0)
  })

  it('số dư đang giảm → không có mốc, nhịp âm được giữ để nói ra', () => {
    const g = goal({ name: 'X', target_amount: 1_000_000 })
    const [line] = goalProgress([g], input(100_000, -5_000), AUG, 1)
    expect(line.etaMonth).toBeNull()
    expect(line.monthlyGrowth).toBe(-5_000)
  })

  it('đã đạt → done', () => {
    const g = goal({ name: 'Xong', target_amount: 100_000 })
    const [line] = goalProgress([g], input(150_000, 10_000), AUG, 1)
    expect(line.done).toBe(true)
    expect(line.ratio).toBe(1)
  })

  it('giữ loại tiền CỦA TÀI KHOẢN — số đích nhập theo tiền tài khoản, không phải base', () => {
    const g = goal({ name: 'VN', target_amount: 500_000_000 })
    expect(goalProgress([g], input(100_000_000, 1, 'VND'), AUG, 1)[0].currency).toBe('VND')
  })

  it('CHƯA đặt mục tiêu nào → mảng rỗng (chỗ hiển thị mời đặt, không dựng chuẩn sách vở)', () => {
    expect(goalProgress([], input(100, 100), AUG, 1)).toEqual([])
  })

  it('tài khoản không tìm được số dư → coi là 0, không nổ', () => {
    const g = goal({ name: 'X', target_amount: 100 })
    expect(goalProgress([g], input(null, 10), AUG, 1)[0].current).toBe(0)
  })

  it('xếp theo tiến độ giảm dần', () => {
    const rows = goalProgress(
      [
        goal({ name: 'Ít', target_amount: 1_000, account_id: 'a' }),
        goal({ name: 'Nhiều', target_amount: 100, account_id: 'b' }),
      ],
      (g) => ({ current: g.account_id === 'a' ? 100 : 90, monthlyGrowth: 10, currency: 'JPY' }),
      AUG,
      1,
    )
    expect(rows.map((r) => r.name)).toEqual(['Nhiều', 'Ít'])
  })
})

// ---------------------------------------------------------------------------------
// Khối 01 khi tiền mặt dày thêm NHIỀU HƠN phần giữ lại
// ---------------------------------------------------------------------------------

describe('keptFlow — tiền vào từ ngoài, không kết luận bừa', () => {
  // Số thật: giữ lại ¥241.891, tiền mặt dày thêm ¥5.894.972, "chỗ khác" −¥5.653.081 — mà
  // trang vẫn kết luận "phần giữ lại nằm hết ở tiền mặt" (tỷ lệ kẹp về 0%).
  const REAL = { kept: 241_891, cashGrowth: 5_894_972, investGrowth: 0, remitTotal: 0, months: 12 }

  it('chưa tách được nguồn → KHÔNG kết luận, và "chỗ khác" nói đúng chiều (tiền VÀO)', () => {
    const f = keptFlow(REAL)
    expect(f.verdict).toBe('unclear')
    expect(f.illiquidPct).toBeNull()
    const other = f.tiers.find((t) => t.key === 'other')!
    expect(other.amount).toBe(-5_653_081)
    expect(other.note).not.toContain('trả nợ')
    expect(other.pct).toBeNull()
  })

  it('tách tầng "Chuyển vào từ tài khoản ngoài tổng" — tầng cộng đúng bằng phần giữ lại', () => {
    const f = keptFlow({ ...REAL, outsideIn: 5_653_081 })
    const outside = f.tiers.find((t) => t.key === 'outside')!
    expect(outside.label).toBe('Chuyển vào từ tài khoản ngoài tổng')
    expect(outside.amount).toBe(-5_653_081)
    expect(f.tiers.some((t) => t.key === 'other')).toBe(false)
    expect(f.tiers.reduce((s, t) => s + t.amount, 0)).toBe(241_891)
    // Tiền mặt vẫn dày hơn phần giữ lại nhiều lần → vẫn không nói phần giữ lại nằm ở đâu.
    expect(f.verdict).toBe('unclear')
  })

  it('chuyển RA tài khoản ngoài tổng → tầng mang dấu dương, nhãn đổi chiều', () => {
    const f = keptFlow({ kept: 500_000, cashGrowth: 300_000, investGrowth: 0, remitTotal: 0, months: 12, outsideIn: -200_000 })
    const outside = f.tiers.find((t) => t.key === 'outside')!
    expect(outside.label).toBe('Chuyển ra tài khoản ngoài tổng')
    expect(outside.amount).toBe(200_000)
    expect(f.tiers.reduce((s, t) => s + t.amount, 0)).toBe(500_000)
    expect(f.verdict).toBe('ok')
  })

  it('đầu tư GIẢM → tầng "Rút từ đầu tư" (số âm), không lặng lẽ rơi vào "chỗ khác"', () => {
    const f = keptFlow({ kept: 200_000, cashGrowth: 500_000, investGrowth: -300_000, remitTotal: 0, months: 12 })
    expect(f.tiers.some((t) => t.key === 'invest')).toBe(false)
    const out = f.tiers.find((t) => t.key === 'investOut')!
    expect(out.label).toBe('Rút từ đầu tư')
    expect(out.amount).toBe(-300_000)
    expect(out.pct).toBeNull()
    expect(f.tiers.some((t) => t.key === 'other')).toBe(false)
    expect(f.verdict).toBe('unclear')
  })

  it('"chỗ khác" dương vẫn là trả nợ / tài sản cố định', () => {
    const f = keptFlow({ kept: 1_000_000, cashGrowth: 100_000, investGrowth: 200_000, remitTotal: 0, months: 12 })
    expect(f.tiers.find((t) => t.key === 'other')!.note).toContain('trả nợ')
    expect(f.verdict).toBe('ok')
  })

  it('"chỗ khác" lớn hơn cả phần giữ lại → không kết luận', () => {
    const f = keptFlow({ kept: 100_000, cashGrowth: 0, investGrowth: 0, remitTotal: 0, months: 12, outsideIn: 0 })
    expect(f.verdict).toBe('ok')
    const g = keptFlow({ kept: 100_000, cashGrowth: 50_000, investGrowth: 300_000, remitTotal: 0, months: 12 })
    expect(g.tiers.find((t) => t.key === 'other')!.amount).toBe(-250_000)
    expect(g.verdict).toBe('unclear')
  })

  it('giữ lại ≤ 0 → verdict none', () => {
    expect(keptFlow({ kept: 0, cashGrowth: 1, investGrowth: 0, remitTotal: 0, months: 1 }).verdict).toBe('none')
  })
})

describe('outsideTransfersIn — chuyển khoản có một đầu là tài khoản không được đếm', () => {
  const COUNTED = new Set(['bank', 'nisa'])
  const cur = (id: string) => (id === 'vn' ? 'VND' : 'JPY') as 'JPY' | 'VND'
  const t = (p: Partial<TransactionRow>): TransactionRow =>
    ({
      id: `x${seq++}`,
      type: 'transfer',
      amount: 0,
      to_amount: null,
      account_id: 'bank',
      to_account_id: 'nisa',
      occurred_on: '2026-05-10',
      is_debt_flow: false,
      exclude_from_stats: false,
      ...p,
    }) as TransactionRow

  it('ngoài → trong là dương, trong → ngoài là âm, trong ↔ trong không tính', () => {
    const r = outsideTransfersIn(
      [
        t({ account_id: 'hidden', to_account_id: 'bank', amount: 5_653_081 }),
        t({ account_id: 'bank', to_account_id: 'hidden', amount: 1_000 }),
        t({ account_id: 'bank', to_account_id: 'nisa', amount: 45_000 }),
      ],
      COUNTED,
      '2026-01-01',
      '2026-12-31',
      cur,
      'JPY',
      RATES,
    )
    expect(r).toEqual({ net: 5_652_081, hasMissingRate: false })
  })

  it('đầu nhận dùng to_amount theo tiền của nó, rồi quy đổi base', () => {
    const r = outsideTransfersIn(
      [t({ account_id: 'vn', to_account_id: 'bank', amount: 1_650_000, to_amount: 10_000 })],
      COUNTED,
      '2026-01-01',
      '2026-12-31',
      cur,
      'JPY',
      RATES,
    )
    expect(r.net).toBe(10_000)
  })

  it('cùng rổ với keptDestinations: bỏ is_debt_flow, exclude_from_stats, ngoài cửa sổ', () => {
    const r = outsideTransfersIn(
      [
        t({ account_id: 'hidden', to_account_id: 'bank', amount: 1, is_debt_flow: true }),
        t({ account_id: 'hidden', to_account_id: 'bank', amount: 2, exclude_from_stats: true }),
        t({ account_id: 'hidden', to_account_id: 'bank', amount: 4, occurred_on: '2027-01-01' }),
        t({ type: 'income', account_id: 'bank', to_account_id: null, amount: 8 }),
      ],
      COUNTED,
      '2026-01-01',
      '2026-12-31',
      cur,
      'JPY',
      RATES,
    )
    expect(r.net).toBe(0)
  })

  it('thiếu tỷ giá → loại ra và bật cờ, không coi 1:1', () => {
    const r = outsideTransfersIn(
      [t({ account_id: 'hidden', to_account_id: 'bank', amount: 100 })],
      COUNTED,
      '2026-01-01',
      '2026-12-31',
      () => 'USD',
      'JPY',
      RATES,
    )
    expect(r).toEqual({ net: 0, hasMissingRate: true })
  })
})
