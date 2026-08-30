import { describe, expect, it } from 'vitest'
import { missingTradeTransfers, stockTradeCashFlow } from './stockTradePosting'
import type { StockTradeRow } from '../../types/database.types'

const CK = 'tk-chung-khoan'
const NH = 'tk-ngan-hang'

function lenh(over: Partial<StockTradeRow> = {}): StockTradeRow {
  return {
    id: 'l1',
    user_id: 'u',
    account_id: CK,
    symbol: 'VNM',
    kind: 'buy',
    traded_on: '2026-08-20',
    quantity: 100,
    price: 50_000,
    fee: 7_500,
    tax: 0,
    note: '',
    created_at: '2026-08-20T00:00:00Z',
    updated_at: '2026-08-20T00:00:00Z',
    ...over,
  }
}

describe('stockTradeCashFlow', () => {
  it('mua: tiền đi TỪ ví ngân hàng SANG tài khoản chứng khoán, đã gồm phí', () => {
    expect(stockTradeCashFlow(lenh(), CK, NH)).toEqual({
      type: 'transfer',
      amount: 5_007_500,
      to_amount: null,
      category_id: null,
      account_id: NH,
      to_account_id: CK,
      occurred_on: '2026-08-20',
      note: 'Mua 100 VNM',
    })
  })

  it('bán: tiền đi NGƯỢC lại, đã trừ phí và thuế', () => {
    const tx = stockTradeCashFlow(
      lenh({ kind: 'sell', quantity: 100, price: 60_000, fee: 9_000, tax: 6_000 }),
      CK,
      NH,
    )
    expect(tx?.account_id).toBe(CK)
    expect(tx?.to_account_id).toBe(NH)
    expect(tx?.amount).toBe(6_000_000 - 9_000 - 6_000)
    expect(tx?.note).toBe('Bán 100 VNM')
  })

  it('điều chỉnh (gộp/tách cổ phiếu) không có tiền → không ghi gì', () => {
    expect(stockTradeCashFlow(lenh({ kind: 'adjust', price: 0, quantity: 10 }), CK, NH)).toBeNull()
  })

  it('chưa khai ví → không ghi gì, giữ nguyên hành vi cũ', () => {
    expect(stockTradeCashFlow(lenh(), CK, null)).toBeNull()
    expect(stockTradeCashFlow(lenh(), CK, undefined)).toBeNull()
    expect(stockTradeCashFlow(lenh(), CK, '')).toBeNull()
  })

  it('ví trỏ về chính tài khoản đó → không ghi gì (chuyển khoản về chính nó là vô nghĩa)', () => {
    expect(stockTradeCashFlow(lenh(), CK, CK)).toBeNull()
  })

  it('bán mà phí + thuế nuốt hết tiền về → không ghi gì, không ghi số 0 hay số âm', () => {
    const hoa = stockTradeCashFlow(
      lenh({ kind: 'sell', quantity: 1, price: 1_000, fee: 1_000, tax: 0 }),
      CK,
      NH,
    )
    expect(hoa).toBeNull()
    const am = stockTradeCashFlow(
      lenh({ kind: 'sell', quantity: 1, price: 1_000, fee: 900, tax: 200 }),
      CK,
      NH,
    )
    expect(am).toBeNull()
  })
})

describe('missingTradeTransfers', () => {
  const viDaKhai = [{ id: CK, cash_account_id: NH }]

  it('lệnh chưa có dòng tiền thì được nêu tên, kèm sẵn giao dịch để ghi', () => {
    const ra = missingTradeTransfers(viDaKhai, [lenh({ id: 'l1' })], new Set())
    expect(ra).toHaveLength(1)
    expect(ra[0].tradeId).toBe('l1')
    expect(ra[0].tx.amount).toBe(5_007_500)
  })

  it('lệnh đã có dòng tiền thì bỏ qua — chạy hai lần không đẻ dòng thứ hai', () => {
    expect(missingTradeTransfers(viDaKhai, [lenh({ id: 'l1' })], new Set(['l1']))).toEqual([])
  })

  it('lệnh của tài khoản CHƯA khai ví thì không tính là thiếu', () => {
    expect(
      missingTradeTransfers([{ id: CK, cash_account_id: null }], [lenh({ id: 'l1' })], new Set()),
    ).toEqual([])
  })

  it('lệnh điều chỉnh không tính là thiếu — nó vốn không sinh dòng tiền nào', () => {
    expect(
      missingTradeTransfers(
        viDaKhai,
        [lenh({ id: 'l1', kind: 'adjust', price: 0, quantity: 5 })],
        new Set(),
      ),
    ).toEqual([])
  })

  it('lệnh của tài khoản không nằm trong danh sách thì bỏ qua', () => {
    expect(
      missingTradeTransfers(viDaKhai, [lenh({ id: 'l1', account_id: 'tk-khac' })], new Set()),
    ).toEqual([])
  })
})
