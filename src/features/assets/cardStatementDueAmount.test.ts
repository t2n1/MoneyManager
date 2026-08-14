// Bất biến của panel sao kê: con số in cạnh chữ "Bị rút" PHẢI đúng bằng số mà
// `runCardAutopayCatchUp` ghi vào ngày đến hạn. Trước đây panel chỉ in tổng QUẸT
// của kỳ rồi để dòng "Bị rút ngày …" ngay dưới, nên với thẻ còn nợ kỳ trước hoặc
// có khoản "Điều chỉnh số nợ" thì người đọc nối ngày với số quẹt và tưởng đó là
// số sắp bị trừ — lệch có thể tới cả trăm nghìn yên mà không dòng nào nói ra.
//
// Kịch bản dựng lại từ một sổ thật (thẻ chốt 31 / trả 27, tháng 8/2026): quẹt
// trong kỳ 16.810 nhưng ngày 27/8 bị rút 170.465.

import { describe, expect, it } from 'vitest'
import {
  runCardAutopayCatchUp,
  type AccountLike,
  type CardAutopayRepo,
  type TxLike,
} from '../../lib/cardAutopay'
import { cardStatementSplit } from './cardStatement'
import {
  cardBillingRange,
  cardMonthCharge,
  cardMonthReconcileNet,
  carriedDebt,
  statementDueAmount,
} from './cardMonthCharge'
import { CARD_RECONCILE_NOTE } from './reconcile'

const CARD = 'card'
const BANK = 'bank'
const TODAY = '2026-08-14'

type Tx = TxLike & { occurred_on: string; note?: string | null }

const spend = (occurred_on: string, amount: number, note?: string): Tx => ({
  type: 'expense',
  amount,
  to_amount: null,
  account_id: CARD,
  to_account_id: null,
  occurred_on,
  note: note ?? null,
})
const credit = (occurred_on: string, amount: number, note?: string): Tx => ({
  type: 'income',
  amount,
  to_amount: null,
  account_id: CARD,
  to_account_id: null,
  occurred_on,
  note: note ?? null,
})
const autopay = (occurred_on: string, amount: number): Tx => ({
  type: 'transfer',
  amount,
  to_amount: null,
  account_id: BANK,
  to_account_id: CARD,
  occurred_on,
  note: 'Tự động trả thẻ',
})

const txs: Tx[] = [
  // Nợ mang sang từ các kỳ trước, gộp một dòng tại ngày chốt 30/6
  spend('2026-06-30', 1_394_975),
  // Kỳ 1/7 – 31/7
  credit('2026-07-31', 1_252_866, CARD_RECONCILE_NOTE),
  spend('2026-07-30', 2_900),
  spend('2026-07-28', 169_975, CARD_RECONCILE_NOTE),
  autopay('2026-07-27', 158_429),
  spend('2026-07-26', 4_400),
  spend('2026-07-26', 4_240),
  spend('2026-07-25', 850),
  spend('2026-07-08', 1_200),
  spend('2026-07-01', 220),
  spend('2026-07-01', 3_000),
  // Quẹt sau ngày chốt — kỳ sau mới đòi
  spend('2026-08-05', 118_543),
]

const balance = txs.reduce((b, t) => {
  if (t.account_id === CARD) return b + (t.type === 'income' ? t.amount : -t.amount)
  if (t.to_account_id === CARD) return b + (t.to_amount ?? t.amount)
  return b
}, 0)

const CARD_DAYS = { statementDay: 31, paymentDueDay: 27 }
const billing = cardBillingRange({ monthKey: { year: 2026, month: 8 }, ...CARD_DAYS })!
const inRange = txs.filter((t) => t.occurred_on >= billing.start && t.occurred_on < billing.end)
const split = cardStatementSplit({ cardId: CARD, balance, ...CARD_DAYS, todayISO: TODAY, txs })

/** Số engine THẬT SỰ ghi vào ngày đến hạn, chạy trên đúng rổ giao dịch trên. */
async function autopayAmounts(todayISO: string) {
  const accounts: AccountLike[] = [
    {
      id: CARD,
      type: 'card',
      currency: 'JPY',
      initial_balance: 0,
      is_archived: false,
      payment_account_id: BANK,
      card_autopay_through: '2026-07-27',
      statement_day: CARD_DAYS.statementDay,
      payment_due_day: CARD_DAYS.paymentDueDay,
    },
    {
      id: BANK,
      type: 'bank',
      currency: 'JPY',
      initial_balance: 0,
      is_archived: false,
      payment_account_id: null,
      statement_day: null,
      payment_due_day: null,
      card_autopay_through: null,
    },
  ]
  const created: { amount: number; occurred_on: string }[] = []
  const repo: CardAutopayRepo = {
    getAccounts: async () => accounts,
    searchTransactions: async (f) =>
      txs.filter((t) => t.occurred_on >= f.start && t.occurred_on < f.end),
    insertCardAutopay: async (i) => {
      created.push({ amount: i.amount, occurred_on: i.occurred_on })
      return true
    },
    updateAccount: async () => undefined,
  }
  await runCardAutopayCatchUp(repo, todayISO)
  return created
}

describe('panel sao kê: số bị rút', () => {
  it('sổ dựng đúng kịch bản', () => {
    expect(balance).toBe(-289_008)
    expect(inRange).toHaveLength(10)
  })

  it('tổng quẹt của kỳ KHÔNG phải số bị rút', () => {
    expect(cardMonthCharge(CARD, inRange)).toBe(16_810)
    expect(cardMonthReconcileNet(CARD, inRange)).toBe(1_082_891)
    expect(split.billed).toBe(170_465)
    expect(split.unbilled).toBe(118_543)
  })

  it('số panel in ra bằng đúng số engine tự-trả sẽ rút', async () => {
    const dueAmount = statementDueAmount(billing, split)
    expect(dueAmount).toBe(170_465)
    expect(await autopayAmounts('2026-08-28')).toEqual([
      { amount: dueAmount, occurred_on: billing.dueISO },
    ])
  })

  it('xem kỳ khác thì panel không đoán số bị rút', () => {
    for (const month of [7, 9]) {
      const other = cardBillingRange({ monthKey: { year: 2026, month }, ...CARD_DAYS })
      expect(statementDueAmount(other, split)).toBeNull()
    }
  })
})

// Panel phải TỰ KIỂM được: ba dòng tiền trên màn hình cộng đúng ra số bị rút.
// Trước đây panel chỉ khẳng định "gồm cả nợ kỳ trước" mà không nói bao nhiêu, nên
// người đọc không cộng tay ra được con số đang bị trừ khỏi tài khoản nguồn.
describe('carriedDebt — nợ cũ chưa trả hết', () => {
  const charged = 16_810
  const reconcileNet = 1_082_891
  const dueAmount = 170_465

  it('bóc ra đúng phần nợ dồn từ các kỳ trước', () => {
    expect(carriedDebt({ dueAmount, charged, reconcileNet })).toBe(1_236_546)
  })

  it('ba dòng trên panel cộng đúng ra số bị rút', () => {
    // Bất biến thật sự của thiết kế — chốt bằng phép tính, không bằng số cứng.
    const carried = carriedDebt({ dueAmount, charged, reconcileNet })!
    expect(charged - reconcileNet + carried).toBe(dueAmount)
  })

  it('thẻ trả sạch mỗi kỳ → 0, dòng này tự ẩn', () => {
    expect(carriedDebt({ dueAmount: 45_000, charged: 45_000, reconcileNet: 0 })).toBe(0)
  })

  it('trả dư kỳ trước → âm, KHÔNG kẹp về 0', () => {
    // Kẹp là giấu mất một trạng thái có thật và phá luôn bất biến cộng-đúng.
    expect(carriedDebt({ dueAmount: 5_000, charged: 10_000, reconcileNet: 0 })).toBe(-5_000)
  })

  it('đang xem kỳ khác (chưa biết số bị rút) → null', () => {
    expect(carriedDebt({ dueAmount: null, charged, reconcileNet })).toBeNull()
  })
})
