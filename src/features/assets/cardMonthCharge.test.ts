import { describe, expect, it } from 'vitest'
import {
  cardMonthCharge,
  monthAdjustDate,
  monthAdjustPlan,
  monthDueDate,
  type MonthChargeTx,
} from './cardMonthCharge'

const ex = (amount: number, p: Partial<MonthChargeTx> = {}): MonthChargeTx => ({
  type: 'expense',
  amount,
  to_amount: null,
  account_id: 'card',
  to_account_id: null,
  ...p,
})

describe('cardMonthCharge', () => {
  it('cộng các khoản quẹt trên thẻ', () => {
    expect(cardMonthCharge('card', [ex(1_200), ex(800)])).toBe(2_000)
  })

  it('trừ hoàn tiền và thu trên thẻ', () => {
    const txs = [ex(1_200), ex(200, { is_refund: true }), ex(100, { type: 'income' })]
    expect(cardMonthCharge('card', txs)).toBe(900)
  })

  it('KHÔNG trừ khoản trả nợ thẻ (chuyển tiền vào thẻ)', () => {
    // Sao kê PayPay đọc "tháng này quẹt bao nhiêu", không quan tâm đã trả chưa
    const txs = [
      ex(1_200),
      ex(50_000, { type: 'transfer', account_id: 'bank', to_account_id: 'card' }),
    ]
    expect(cardMonthCharge('card', txs)).toBe(1_200)
  })

  it('cộng khoản chuyển tiền RA KHỎI thẻ (rút tiền mặt)', () => {
    const txs = [ex(9_000, { type: 'transfer', to_account_id: 'bank' })]
    expect(cardMonthCharge('card', txs)).toBe(9_000)
  })

  it('bỏ qua giao dịch của tài khoản khác', () => {
    const txs = [ex(1_200), ex(7_000, { account_id: 'other', to_account_id: 'other2' })]
    expect(cardMonthCharge('card', txs)).toBe(1_200)
  })

  it('không có giao dịch nào thì bằng 0', () => {
    expect(cardMonthCharge('card', [])).toBe(0)
  })
})

describe('monthDueDate', () => {
  // rangeEnd là ngày đầu tháng kế (loại trừ) — tháng 6/2026 → '2026-07-01'
  it('kỳ chốt cuối tháng 6, trả ngày 27 → 27/7', () => {
    expect(monthDueDate({ rangeEndISO: '2026-07-01', statementDay: 31, paymentDueDay: 27 })).toBe(
      '2026-07-27',
    )
  })

  it('dời ngày trả rơi vào cuối tuần sang Thứ 2', () => {
    // 27/6/2026 là Thứ 7 → 29/6 (T2)
    expect(monthDueDate({ rangeEndISO: '2026-06-01', statementDay: 31, paymentDueDay: 27 })).toBe(
      '2026-06-29',
    )
  })

  it('chưa đặt ngày trả → null', () => {
    expect(monthDueDate({ rangeEndISO: '2026-07-01', statementDay: 31, paymentDueDay: null })).toBe(
      null,
    )
  })

  it('thẻ chốt giữa tháng → null (kỳ không trùng tháng lịch)', () => {
    expect(monthDueDate({ rangeEndISO: '2026-07-01', statementDay: 15, paymentDueDay: 27 })).toBe(
      null,
    )
  })

  it('chưa đặt ngày chốt vẫn suy ra được ngày trả', () => {
    expect(monthDueDate({ rangeEndISO: '2026-07-01', statementDay: null, paymentDueDay: 27 })).toBe(
      '2026-07-27',
    )
  })
})

describe('monthAdjustDate', () => {
  it('tháng đã qua → ngày cuối tháng đó', () => {
    expect(
      monthAdjustDate({
        rangeStartISO: '2026-06-01',
        rangeEndISO: '2026-07-01',
        todayISO: '2026-08-06',
      }),
    ).toBe('2026-06-30')
  })

  it('tháng đang xem là tháng này → hôm nay', () => {
    expect(
      monthAdjustDate({
        rangeStartISO: '2026-08-01',
        rangeEndISO: '2026-09-01',
        todayISO: '2026-08-06',
      }),
    ).toBe('2026-08-06')
  })

  it('tháng chưa tới → ngày cuối tháng ĐÓ, không tụt về hôm nay', () => {
    expect(
      monthAdjustDate({
        rangeStartISO: '2026-09-01',
        rangeEndISO: '2026-10-01',
        todayISO: '2026-08-06',
      }),
    ).toBe('2026-09-30')
  })

  it('ngày đầu và ngày cuối kỳ vẫn coi là trong kỳ', () => {
    const range = { rangeStartISO: '2026-08-01', rangeEndISO: '2026-09-01' }
    expect(monthAdjustDate({ ...range, todayISO: '2026-08-01' })).toBe('2026-08-01')
    expect(monthAdjustDate({ ...range, todayISO: '2026-08-31' })).toBe('2026-08-31')
  })
})

describe('monthAdjustPlan', () => {
  it('sao kê nhiều hơn app → tạo giao dịch chi bù phần thiếu', () => {
    expect(monthAdjustPlan({ charged: 120_000, entered: 123_456 })).toEqual({
      diff: 3_456,
      type: 'expense',
    })
  })

  it('sao kê ít hơn app → tạo giao dịch thu', () => {
    expect(monthAdjustPlan({ charged: 120_000, entered: 118_000 })).toEqual({
      diff: -2_000,
      type: 'income',
    })
  })

  it('khớp rồi → chênh lệch 0', () => {
    expect(monthAdjustPlan({ charged: 120_000, entered: 120_000 }).diff).toBe(0)
  })
})
