import { describe, expect, it } from 'vitest'
import type { Rates } from '../../lib/rates'
import type { DebtPaymentRow, DebtRow, SavingsGoalRow } from '../../types/database.types'
import {
  debtBreakdown,
  goalProgress,
  keptFlow,
  monthsToClose,
  monthYearLabel,
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
  it('tiến độ + mốc theo nhịp hiện tại', () => {
    const g = goal({ name: 'Đủ 1× trả nợ', target_amount: 649_898 })
    const [line] = goalProgress([g], () => 389_939, 26_022, '2026-08-18')
    expect(Math.round(line.ratio * 100)).toBe(60)
    expect(line.done).toBe(false)
    expect(monthYearLabel(line.etaISO!)).toBe('06/2027')
  })

  it('đã đạt → done, không in mốc tương lai', () => {
    const g = goal({ name: 'Xong', target_amount: 100_000 })
    const [line] = goalProgress([g], () => 150_000, 10_000, '2026-08-18')
    expect(line.done).toBe(true)
    expect(line.ratio).toBe(1)
    expect(line.etaISO).toBeNull()
  })

  it('nhịp = 0 → không bịa ra mốc', () => {
    const g = goal({ name: 'Xa', target_amount: 1_000_000 })
    expect(goalProgress([g], () => 0, 0, '2026-08-18')[0].etaISO).toBeNull()
  })

  it('CHƯA đặt mục tiêu nào → mảng rỗng (chỗ hiển thị mời đặt, không dựng chuẩn sách vở)', () => {
    expect(goalProgress([], () => 100, 100, '2026-08-18')).toEqual([])
  })

  it('tài khoản không tìm được số dư → coi là 0, không nổ', () => {
    const g = goal({ name: 'X', target_amount: 100 })
    expect(goalProgress([g], () => null, 10, '2026-08-18')[0].current).toBe(0)
  })

  it('xếp theo tiến độ giảm dần', () => {
    const rows = goalProgress(
      [
        goal({ name: 'Ít', target_amount: 1_000, account_id: 'a' }),
        goal({ name: 'Nhiều', target_amount: 100, account_id: 'b' }),
      ],
      (id) => (id === 'a' ? 100 : 90),
      10,
      '2026-08-18',
    )
    expect(rows.map((r) => r.name)).toEqual(['Nhiều', 'Ít'])
  })
})
