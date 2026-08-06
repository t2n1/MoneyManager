import { describe, expect, it } from 'vitest'
import {
  cardBillingRange,
  cardMonthCharge,
  cardMonthReconcileNet,
  monthAdjustDate,
  monthAdjustPlan,
  type MonthChargeTx,
} from './cardMonthCharge'
import { CARD_RECONCILE_NOTE } from './reconcile'

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

  it('bỏ qua khoản "Điều chỉnh số nợ" — nó không phải tiền quẹt', () => {
    // Khoản bù tổng nợ (ReconcileSheet) ghi lùi về ngày chốt sẽ rơi vào kỳ;
    // cộng nó vào thì tổng "Quẹt" ra số âm không có trên sao kê thật nào.
    const txs = [
      ex(112_760),
      ex(1_312_870, { type: 'income', note: CARD_RECONCILE_NOTE }),
    ]
    expect(cardMonthCharge('card', txs)).toBe(112_760)
  })

  it('vẫn tính khoản bù của "Chỉnh cho khớp" (ghi chú khác)', () => {
    // Không tính thì chỉnh xong tổng tháng vẫn lệch y như cũ
    const txs = [ex(112_760), ex(3_000, { note: 'Điều chỉnh sao kê tháng 8/2026' })]
    expect(cardMonthCharge('card', txs)).toBe(115_760)
  })
})

describe('cardMonthReconcileNet', () => {
  it('cộng ảnh hưởng của các khoản "Điều chỉnh số nợ" trong rổ (dương = bớt nợ)', () => {
    const txs = [
      ex(112_760),
      ex(1_312_870, { type: 'income', note: CARD_RECONCILE_NOTE }),
    ]
    expect(cardMonthReconcileNet('card', txs)).toBe(1_312_870)
  })

  it('khoản bù chiều CHI (nợ thật nhiều hơn sổ) ra số âm', () => {
    expect(cardMonthReconcileNet('card', [ex(5_000, { note: CARD_RECONCILE_NOTE })])).toBe(-5_000)
  })

  it('không có khoản bù nào thì bằng 0', () => {
    expect(cardMonthReconcileNet('card', [ex(112_760)])).toBe(0)
  })

  it('bỏ qua khoản bù của tài khoản khác', () => {
    const txs = [ex(9_999, { account_id: 'other', note: CARD_RECONCILE_NOTE })]
    expect(cardMonthReconcileNet('card', txs)).toBe(0)
  })
})

describe('cardBillingRange', () => {
  const sep = { year: 2026, month: 9 }

  it('PayPay/Rakuten (chốt cuối tháng, trả 27): tháng 9 = tiền quẹt tháng 8', () => {
    // Đúng thứ người dùng thấy khi bấm "9月" trong app thẻ
    expect(cardBillingRange({ monthKey: sep, statementDay: 31, paymentDueDay: 27 })).toEqual({
      start: '2026-08-01',
      end: '2026-09-01',
      closeISO: '2026-08-31',
      dueISO: '2026-09-28', // 27/9 rơi CN → dời T2
    })
  })

  it('thẻ chốt giữa tháng: kỳ vắt qua hai tháng lịch', () => {
    // Chốt 15, trả 10 → kỳ bị rút 10/9 là tiền quẹt 16/7–15/8
    expect(cardBillingRange({ monthKey: sep, statementDay: 15, paymentDueDay: 10 })).toEqual({
      start: '2026-07-16',
      end: '2026-08-16',
      closeISO: '2026-08-15',
      dueISO: '2026-09-10',
    })
  })

  it('chốt TRƯỚC ngày trả trong cùng tháng thì kỳ nằm ngay tháng đó', () => {
    // Chốt 5, trả 27 → kỳ bị rút 27/9 là tiền quẹt 6/8–5/9
    expect(cardBillingRange({ monthKey: sep, statementDay: 5, paymentDueDay: 27 })).toEqual({
      start: '2026-08-06',
      end: '2026-09-06',
      closeISO: '2026-09-05',
      dueISO: '2026-09-28',
    })
  })

  it('tháng ngắn: chốt 31 kẹp về ngày cuối tháng 2', () => {
    const r = cardBillingRange({ monthKey: { year: 2027, month: 3 }, statementDay: 31, paymentDueDay: 27 })
    expect(r?.closeISO).toBe('2027-02-28')
    expect(r?.start).toBe('2027-02-01')
  })

  it('ngày trả rơi cuối tuần: kỳ vẫn tính theo ngày CHƯA dời', () => {
    // 27/6/2026 là T7 → rút 29/6, nhưng mốc chốt vẫn suy từ 27/6 nên kỳ là tháng 5
    const r = cardBillingRange({ monthKey: { year: 2026, month: 6 }, statementDay: 31, paymentDueDay: 27 })
    expect(r).toEqual({
      start: '2026-05-01',
      end: '2026-06-01',
      closeISO: '2026-05-31',
      dueISO: '2026-06-29',
    })
  })

  it('thiếu ngày chốt hoặc ngày trả → null', () => {
    expect(cardBillingRange({ monthKey: sep, statementDay: null, paymentDueDay: 27 })).toBe(null)
    expect(cardBillingRange({ monthKey: sep, statementDay: 31, paymentDueDay: null })).toBe(null)
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
