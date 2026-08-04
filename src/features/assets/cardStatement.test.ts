import { describe, expect, it } from 'vitest'
import { cardStatementSplit, type CardStatementTx } from './cardStatement'

// Mốc chung: hôm nay 4/8/2026, thẻ chốt ngày 31, trả ngày 27.
// → kỳ đến hạn kế tiếp 27/8/2026 (T5, không dời), chốt 31/7/2026.
const TODAY = '2026-08-04'
const base = {
  cardId: 'card',
  statementDay: 31,
  paymentDueDay: 27,
  todayISO: TODAY,
}

const ex = (occurred_on: string, amount: number, p: Partial<CardStatementTx> = {}) => ({
  type: 'expense' as const,
  amount,
  to_amount: null,
  account_id: 'card',
  to_account_id: null,
  occurred_on,
  ...p,
})

describe('cardStatementSplit', () => {
  it('tách nợ đã chốt và phần quẹt sau ngày chốt', () => {
    // Nợ sổ 191.925 = 1.540 chốt tại 31/7 + 190.385 quẹt trong tháng 8
    const r = cardStatementSplit({
      ...base,
      balance: -191_925,
      txs: [ex('2026-08-02', 190_385)],
    })
    expect(r.dueISO).toBe('2026-08-27')
    expect(r.closeISO).toBe('2026-07-31')
    expect(r.totalOwed).toBe(191_925)
    expect(r.billed).toBe(1_540)
    expect(r.unbilled).toBe(190_385)
  })

  it('giao dịch ĐÚNG ngày chốt thuộc kỳ này, hôm sau thuộc kỳ sau', () => {
    const r = cardStatementSplit({
      ...base,
      balance: -3_000,
      txs: [ex('2026-07-31', 1_000), ex('2026-08-01', 2_000)],
    })
    expect(r.billed).toBe(1_000)
    expect(r.unbilled).toBe(2_000)
  })

  it('giao dịch ghi ngày TƯƠNG LAI vẫn nằm ở phần chưa chốt', () => {
    // view account_balances cộng mọi giao dịch bất kể ngày → balance đã gồm khoản 20/9
    const r = cardStatementSplit({
      ...base,
      balance: -6_000,
      txs: [ex('2026-09-20', 5_000)],
    })
    expect(r.billed).toBe(1_000)
    expect(r.unbilled).toBe(5_000)
  })

  it('hoàn tiền sau ngày chốt làm GIẢM phần chưa chốt', () => {
    // chi 5.000 rồi hoàn 2.000 trong tháng 8, nợ chốt 1.000 → sổ −4.000
    const r = cardStatementSplit({
      ...base,
      balance: -4_000,
      txs: [ex('2026-08-02', 5_000), ex('2026-08-10', 2_000, { is_refund: true })],
    })
    expect(r.billed).toBe(1_000)
    expect(r.unbilled).toBe(3_000)
  })

  it('trả tay sau ngày chốt: kỳ này co lại, không đẩy phần chưa chốt xuống âm', () => {
    // Nợ chốt 10.000, trả tay 8.000 ngày 3/8, chưa quẹt gì thêm → sổ −2.000
    const pay: CardStatementTx = {
      type: 'transfer',
      amount: 8_000,
      to_amount: null,
      account_id: 'bank',
      to_account_id: 'card',
      occurred_on: '2026-08-03',
    }
    const r = cardStatementSplit({ ...base, balance: -2_000, txs: [pay] })
    expect(r.totalOwed).toBe(2_000)
    expect(r.billed).toBe(2_000)
    expect(r.unbilled).toBe(0)
  })

  it('giao dịch của thẻ khác không lọt vào phép chia', () => {
    const other = ex('2026-08-02', 99_000, { account_id: 'card-khac' })
    const r = cardStatementSplit({ ...base, balance: -1_540, txs: [other] })
    expect(r.billed).toBe(1_540)
    expect(r.unbilled).toBe(0)
  })

  it('thẻ không nợ → mọi số bằng 0', () => {
    const r = cardStatementSplit({ ...base, balance: 0, txs: [] })
    expect(r.totalOwed).toBe(0)
    expect(r.billed).toBe(0)
    expect(r.unbilled).toBe(0)
  })

  it('thiếu ngày chốt → không chia kỳ, chỉ còn tổng nợ', () => {
    const r = cardStatementSplit({
      ...base,
      statementDay: null,
      balance: -191_925,
      txs: [ex('2026-08-02', 190_385)],
    })
    expect(r.totalOwed).toBe(191_925)
    expect(r.billed).toBeNull()
    expect(r.unbilled).toBeNull()
    expect(r.closeISO).toBeNull()
    expect(r.dueISO).toBe('2026-08-27') // vẫn còn ngày đến hạn để hiển thị
  })

  it('thiếu ngày trả → không có cả ngày đến hạn lẫn phép chia', () => {
    const r = cardStatementSplit({ ...base, paymentDueDay: null, balance: -1_000, txs: [] })
    expect(r.dueISO).toBeNull()
    expect(r.billed).toBeNull()
  })

  it('ngày đến hạn rơi cuối tuần thì dời, ngày chốt tính theo ngày đã dời', () => {
    // 27/6/2026 là T7 → dời 29/6; chốt gần nhất trước đó = 31/5
    const r = cardStatementSplit({
      ...base,
      todayISO: '2026-06-01',
      balance: -3_000,
      txs: [ex('2026-06-10', 2_000)],
    })
    expect(r.dueISO).toBe('2026-06-29')
    expect(r.closeISO).toBe('2026-05-31')
    expect(r.billed).toBe(1_000)
  })
})
