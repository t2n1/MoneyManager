import { describe, expect, it } from 'vitest'
import type { AccountValuationRow, TransactionRow } from '../../types/database.types'
import { investHistory, investTxRange, type InvestHistoryAccount } from './investHistory'

const tk = (over: Partial<InvestHistoryAccount> = {}): InvestHistoryAccount => ({
  id: 'a1',
  currency: 'JPY',
  initialBalance: 0,
  ...over,
})

const dg = (
  account_id: string,
  valued_on: string,
  market_value: number,
): Pick<AccountValuationRow, 'account_id' | 'valued_on' | 'market_value'> => ({
  account_id,
  valued_on,
  market_value,
})

const gd = (over: Partial<TransactionRow> = {}): TransactionRow =>
  ({
    id: 't1',
    type: 'transfer',
    amount: 100_000,
    to_amount: null,
    account_id: 'vi',
    to_account_id: 'a1',
    occurred_on: '2026-08-01',
    ...over,
  }) as TransactionRow

const chay = (over: Partial<Parameters<typeof investHistory>[0]> = {}) =>
  investHistory({
    accounts: [tk()],
    valuations: [],
    transactions: [],
    base: 'JPY',
    rates: {},
    ...over,
  })

describe('investTxRange', () => {
  it('trải 10 năm lùi tới hết năm sau — cùng một khoảng cho mọi khu đầu tư, nên hai khu dùng chung một lượt đọc', () => {
    expect(investTxRange('2026-08-15')).toEqual({ start: '2016-01-01', end: '2027-01-01' })
  })
})

describe('investHistory', () => {
  it('mỗi ngày có định giá là một mốc: giá trị thị trường và tiền đã bỏ vào tới ngày đó', () => {
    const { points } = chay({
      valuations: [dg('a1', '2026-08-05', 105_000), dg('a1', '2026-08-10', 112_000)],
      transactions: [gd()],
    })
    expect(points).toEqual([
      { date: '2026-08-05', value: 105_000, cost: 100_000 },
      { date: '2026-08-10', value: 112_000, cost: 100_000 },
    ])
  })

  it('giao dịch SAU mốc không được tính vào tiền đã bỏ vào của mốc đó', () => {
    const { points } = chay({
      valuations: [dg('a1', '2026-08-05', 105_000)],
      transactions: [gd(), gd({ id: 't2', occurred_on: '2026-08-09', amount: 50_000 })],
    })
    expect(points[0].cost).toBe(100_000)
  })

  it('chuyển tiền RA khỏi tài khoản đầu tư làm tiền đã bỏ vào giảm', () => {
    const { points } = chay({
      valuations: [dg('a1', '2026-08-10', 60_000)],
      transactions: [
        gd(),
        gd({ id: 't2', account_id: 'a1', to_account_id: 'vi', amount: 40_000, occurred_on: '2026-08-08' }),
      ],
    })
    expect(points[0].cost).toBe(60_000)
  })

  it('số dư mở tài khoản (tiền bỏ vào trước khi dùng app) nằm trong tiền đã bỏ vào', () => {
    const { points } = chay({
      accounts: [tk({ initialBalance: 500_000 })],
      valuations: [dg('a1', '2026-08-05', 520_000)],
    })
    expect(points[0].cost).toBe(500_000)
  })

  it('tài khoản chưa có định giá nào tới mốc đó → bị loại khỏi CẢ HAI đường, không tạo lỗ giả', () => {
    const { points } = chay({
      accounts: [tk(), tk({ id: 'a2' })],
      valuations: [dg('a1', '2026-08-05', 105_000), dg('a2', '2026-08-10', 30_000)],
      transactions: [
        gd(),
        gd({ id: 't2', to_account_id: 'a2', amount: 28_000, occurred_on: '2026-07-01' }),
      ],
    })
    // Mốc 05: chỉ a1 (a2 chưa có định giá) → 28.000 tiền của a2 KHÔNG được cộng vào cost
    expect(points[0]).toEqual({ date: '2026-08-05', value: 105_000, cost: 100_000 })
    expect(points[1]).toEqual({ date: '2026-08-10', value: 135_000, cost: 128_000 })
  })

  it('mốc không có định giá mới của một tài khoản → dùng định giá gần nhất trước đó', () => {
    const { points } = chay({
      accounts: [tk(), tk({ id: 'a2' })],
      valuations: [
        dg('a1', '2026-08-05', 100_000),
        dg('a2', '2026-08-05', 10_000),
        dg('a2', '2026-08-10', 12_000),
      ],
    })
    expect(points[1]).toEqual({ date: '2026-08-10', value: 112_000, cost: 0 })
  })

  it('quy đổi ngoại tệ về base bằng tỷ giá hôm nay', () => {
    const { points, hasMissingRate } = chay({
      accounts: [tk({ currency: 'VND' })],
      valuations: [dg('a1', '2026-08-05', 34_000)],
      rates: { VND: 170 },
    })
    expect(points[0].value).toBe(200)
    expect(hasMissingRate).toBe(false)
  })

  it('thiếu tỷ giá → bỏ tài khoản đó khỏi mốc và báo cờ, thay vì cộng số sai', () => {
    const { points, hasMissingRate } = chay({
      accounts: [tk(), tk({ id: 'a2', currency: 'VND' })],
      valuations: [dg('a1', '2026-08-05', 100_000), dg('a2', '2026-08-05', 34_000)],
      rates: {},
    })
    expect(points[0].value).toBe(100_000)
    expect(hasMissingRate).toBe(true)
  })

  it('chưa có định giá nào → không mốc nào', () => {
    expect(chay().points).toEqual([])
  })

  it('bỏ qua định giá của tài khoản không nằm trong danh sách (ví dụ tài sản cố định)', () => {
    const { points } = chay({
      valuations: [dg('xe', '2026-08-05', 9_000_000), dg('a1', '2026-08-06', 100_000)],
    })
    expect(points).toEqual([{ date: '2026-08-06', value: 100_000, cost: 0 }])
  })
})
