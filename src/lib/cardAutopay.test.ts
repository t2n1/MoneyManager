import { describe, expect, it } from 'vitest'
import {
  AUTOPAY_NOTE,
  dueDatesToGenerate,
  runCardAutopayCatchUp,
  statementCloseFor,
  type AccountLike,
  type CardAutopayRepo,
  type TxLike,
} from './cardAutopay'

/** Chỉ lấy ngày thực trừ tiền, cho gọn khi không cần xét ngày trên lịch. */
const dueOnly = (dueDay: number, through: string, today: string) =>
  dueDatesToGenerate(dueDay, through, today).map((p) => p.dueISO)

describe('dueDatesToGenerate', () => {
  it('sinh các kỳ hằng tháng sau con trỏ đến hết hôm nay (dời cuối tuần sang T2)', () => {
    // 10/1/2026 là Thứ 7 → dời 12/1; 10/2 và 10/3 là ngày thường → giữ nguyên
    expect(dueOnly(10, '2026-01-01', '2026-03-15')).toEqual([
      '2026-01-12',
      '2026-02-10',
      '2026-03-10',
    ])
  })

  it('loại kỳ đúng bằng con trỏ (con trỏ là ngày đã dời), dừng ở hôm nay', () => {
    expect(dueOnly(10, '2026-01-12', '2026-02-10')).toEqual(['2026-02-10'])
  })

  it('chưa tới kỳ nào → rỗng', () => {
    expect(dueDatesToGenerate(10, '2026-03-11', '2026-03-20')).toEqual([])
  })

  it('clamp ngày cuối tháng rồi dời cuối tuần', () => {
    // 31/1 (T7)→2/2; 31→28/2 (T7)→2/3; 31/3 (T3) giữ nguyên
    expect(dueOnly(31, '2026-01-01', '2026-03-31')).toEqual([
      '2026-02-02',
      '2026-03-02',
      '2026-03-31',
    ])
  })

  it('giữ cả ngày trên lịch để suy ra mốc chốt, kể cả khi dời qua tháng sau', () => {
    // Rakuten/PayPay: trả ngày 27. 27/2/2027 là Thứ 7 → thực trừ 1/3, nhưng kỳ này
    // vẫn là kỳ THÁNG 2 (sao kê chốt 31/1), không phải kỳ tháng 3.
    expect(dueDatesToGenerate(27, '2027-01-27', '2027-03-31')).toEqual([
      { baseISO: '2027-02-27', dueISO: '2027-03-01' },
      { baseISO: '2027-03-27', dueISO: '2027-03-29' },
    ])
  })
})

describe('statementCloseFor', () => {
  it('ngày chốt SAU ngày đến hạn → chốt là tháng trước', () => {
    expect(statementCloseFor('2026-02-10', 27)).toBe('2026-01-27')
  })

  it('ngày chốt TRƯỚC ngày đến hạn → chốt cùng tháng', () => {
    expect(statementCloseFor('2026-02-25', 5)).toBe('2026-02-05')
  })

  it('qua ranh năm', () => {
    expect(statementCloseFor('2026-01-10', 27)).toBe('2025-12-27')
  })

  it('chốt cuối tháng: ngày trên lịch 27/2 → chốt 31/1 (không phải 28/2)', () => {
    expect(statementCloseFor('2027-02-27', 31)).toBe('2027-01-31')
    expect(statementCloseFor('2027-03-27', 31)).toBe('2027-02-28')
  })
})

// --- Fake repo cho engine ---
type StoredTx = TxLike & { occurred_on: string; note?: string }
function makeRepo(accounts: AccountLike[], txs: StoredTx[]) {
  const store: StoredTx[] = txs.map((t) => ({ ...t }))
  const acc = new Map(accounts.map((a) => [a.id, { ...a }]))
  const created: (TxLike & { occurred_on: string; note: string })[] = []

  const repo: CardAutopayRepo = {
    async getAccounts() {
      return [...acc.values()]
    },
    async searchTransactions({ start, end, accountIds }) {
      return store.filter(
        (t) =>
          t.occurred_on >= start &&
          t.occurred_on < end &&
          (!accountIds ||
            accountIds.includes(t.account_id) ||
            (t.to_account_id != null && accountIds.includes(t.to_account_id))),
      )
    },
    async insertCardAutopay(input) {
      // Giả lập partial unique index (to_account_id, occurred_on) của Postgres:
      // thiết bị khác đã sinh kỳ này → báo trùng, KHÔNG ghi thêm dòng nào
      const dup = store.some(
        (t) =>
          t.note === AUTOPAY_NOTE &&
          t.to_account_id === input.to_account_id &&
          t.occurred_on === input.occurred_on,
      )
      if (dup) return false
      const row = { ...input, occurred_on: input.occurred_on }
      store.push(row)
      created.push(row)
      return true
    },
    async updateAccount(id, patch) {
      const a = acc.get(id)
      if (a) a.card_autopay_through = patch.card_autopay_through
      return a
    },
  }
  return { repo, created, acc }
}

const card = (p: Partial<AccountLike> = {}): AccountLike => ({
  id: 'card',
  type: 'card',
  currency: 'JPY',
  initial_balance: 0,
  is_archived: false,
  payment_account_id: 'bank',
  statement_day: 27,
  payment_due_day: 10,
  card_autopay_through: '2026-01-01',
  ...p,
})
const bank = (p: Partial<AccountLike> = {}): AccountLike => ({
  id: 'bank',
  type: 'bank',
  currency: 'JPY',
  initial_balance: 0,
  is_archived: false,
  payment_account_id: null,
  statement_day: null,
  payment_due_day: null,
  card_autopay_through: null,
  ...p,
})
const ex = (occurred_on: string, amount: number) => ({
  type: 'expense' as const,
  amount,
  to_amount: null,
  account_id: 'card',
  to_account_id: null,
  occurred_on,
})

describe('runCardAutopayCatchUp', () => {
  it('trả đúng dư nợ tại ngày chốt sao kê, không double qua các kỳ', async () => {
    const { repo, created, acc } = makeRepo(
      [card(), bank()],
      [ex('2025-12-20', 30_000), ex('2026-01-05', 20_000)],
    )
    const n = await runCardAutopayCatchUp(repo, '2026-03-15')
    // Kỳ 10/1 (T7→dời 12/1) trả nợ chốt 27/12 = 30.000; kỳ 10/2 trả nợ chốt 27/1 =
    // 20.000 (đã trừ lần trả 12/1); kỳ 10/3 chốt 27/2 nợ = 0 → bỏ qua
    expect(n).toBe(2)
    expect(created.map((c) => [c.occurred_on, c.amount])).toEqual([
      ['2026-01-12', 30_000],
      ['2026-02-10', 20_000],
    ])
    // Chuyển khoản nguồn→thẻ, ghi chú tự trả
    expect(created[0].account_id).toBe('bank')
    expect(created[0].to_account_id).toBe('card')
    expect(created[0].note).toBe(AUTOPAY_NOTE)
    // Con trỏ tiến tới kỳ cuối
    expect(acc.get('card')!.card_autopay_through).toBe('2026-03-10')
  })

  it('owed ≤ 0 vẫn tiến con trỏ, không tạo giao dịch', async () => {
    const { repo, created, acc } = makeRepo([card(), bank()], []) // thẻ không nợ
    const n = await runCardAutopayCatchUp(repo, '2026-03-15')
    expect(n).toBe(0)
    expect(created).toHaveLength(0)
    expect(acc.get('card')!.card_autopay_through).toBe('2026-03-10')
  })

  it('con trỏ null (mới bật) → neo hôm nay, không sinh bù quá khứ', async () => {
    const { repo, created, acc } = makeRepo(
      [card({ card_autopay_through: null }), bank()],
      [ex('2025-12-20', 30_000)],
    )
    const n = await runCardAutopayCatchUp(repo, '2026-03-15')
    expect(n).toBe(0)
    expect(created).toHaveLength(0)
    expect(acc.get('card')!.card_autopay_through).toBe('2026-03-15')
  })

  it('kiểu Rakuten/PayPay (chốt cuối tháng, trả 27): ngày trả dời qua tháng sau không trả trùng', async () => {
    // 27/2/2027 là Thứ 7 → thực trừ 1/3. Kỳ này thanh toán sao kê chốt 31/1 =
    // 10.000; kỳ 27/3 (T7 → 29/3) thanh toán sao kê chốt 28/2 = 20.000. Nếu lấy mốc
    // chốt theo ngày ĐÃ DỜI thì cả hai kỳ đều tính vào sao kê 28/2 → trừ tiền 2 lần.
    const rakuten = card({
      statement_day: 31,
      payment_due_day: 27,
      card_autopay_through: '2027-01-27',
    })
    const { repo, created, acc } = makeRepo(
      [rakuten, bank()],
      [ex('2027-01-15', 10_000), ex('2027-02-10', 20_000)],
    )
    const n = await runCardAutopayCatchUp(repo, '2027-03-31')
    expect(n).toBe(2)
    expect(created.map((c) => [c.occurred_on, c.amount])).toEqual([
      ['2027-03-01', 10_000],
      ['2027-03-29', 20_000],
    ])
    expect(acc.get('card')!.card_autopay_through).toBe('2027-03-29')
  })

  it('bỏ qua thẻ thiếu tài khoản nguồn hoặc thiếu ngày', async () => {
    const noSource = card({ id: 'c1', payment_account_id: null })
    const noDays = card({ id: 'c2', statement_day: null })
    const { repo, created } = makeRepo([noSource, noDays, bank()], [ex('2025-12-20', 30_000)])
    const n = await runCardAutopayCatchUp(repo, '2026-03-15')
    expect(n).toBe(0)
    expect(created).toHaveLength(0)
  })

  it('2 thiết bị catch-up cùng lúc → chỉ 1 giao dịch cho mỗi kỳ', async () => {
    // Cả hai lượt đọc con trỏ CŨ trước khi lượt nào kịp ghi con trỏ mới (đúng
    // tình huống mở app ở 2 tab/2 máy gần như đồng thời).
    const { repo, created, acc } = makeRepo([card(), bank()], [ex('2025-12-20', 30_000)])
    const [a, b] = await Promise.all([
      runCardAutopayCatchUp(repo, '2026-01-15'),
      runCardAutopayCatchUp(repo, '2026-01-15'),
    ])
    expect(created.map((c) => [c.occurred_on, c.amount])).toEqual([['2026-01-12', 30_000]])
    expect(a + b).toBe(1)
    expect(acc.get('card')!.card_autopay_through).toBe('2026-01-12')
  })

  it('bỏ qua khi tài khoản nguồn đã lưu trữ', async () => {
    const { repo, created } = makeRepo(
      [card(), bank({ is_archived: true })],
      [ex('2025-12-20', 30_000)],
    )
    const n = await runCardAutopayCatchUp(repo, '2026-03-15')
    expect(n).toBe(0)
    expect(created).toHaveLength(0)
  })
})
