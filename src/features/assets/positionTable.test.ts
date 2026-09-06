import { describe, expect, it } from 'vitest'
import type { PortfolioPosition } from './portfolio'
import { dividendsBySymbol, positionTable, taggableCashflows } from './positionTable'

const vt = (over: Partial<PortfolioPosition> = {}): PortfolioPosition => ({
  symbol: 'HPG',
  quantity: 100,
  costBasis: 2_000_000,
  avgCost: 20_000,
  price: 21_700,
  value: 2_170_000,
  pnl: 170_000,
  pnlPercent: 8.5,
  weight: 1,
  accountNames: ['CK'],
  ...over,
})

const gd = (over: Record<string, unknown> = {}) =>
  ({
    type: 'income',
    amount: 300_000,
    account_id: 'a1',
    stock_symbol: 'HPG',
    ...over,
  }) as Parameters<typeof dividendsBySymbol>[0][number]

describe('dividendsBySymbol', () => {
  it('khoản THU gắn mã thì cộng vào mã đó', () => {
    const m = dividendsBySymbol([gd()], new Set(['a1']))
    expect(m.get('HPG')).toBe(300_000)
  })

  it('khoản CHI gắn mã thì trừ ra — phí lưu ký ăn vào phần đã nhận', () => {
    const m = dividendsBySymbol([gd(), gd({ type: 'expense', amount: 20_000 })], new Set(['a1']))
    expect(m.get('HPG')).toBe(280_000)
  })

  it('nhiều lần cổ tức của cùng một mã thì cộng dồn', () => {
    const m = dividendsBySymbol([gd(), gd({ amount: 150_000 })], new Set(['a1']))
    expect(m.get('HPG')).toBe(450_000)
  })

  it('chưa gắn mã thì không vào đâu cả — KHÔNG đoán mã từ ghi chú', () => {
    expect(dividendsBySymbol([gd({ stock_symbol: null })], new Set(['a1'])).size).toBe(0)
    expect(dividendsBySymbol([gd({ stock_symbol: '' })], new Set(['a1'])).size).toBe(0)
  })

  it('tài khoản ngoài danh mục thì bỏ qua', () => {
    expect(dividendsBySymbol([gd({ account_id: 'x' })], new Set(['a1'])).size).toBe(0)
  })

  it('CHUYỂN KHOẢN gắn mã cũng bỏ qua — chuyển tiền không phải cổ tức', () => {
    expect(dividendsBySymbol([gd({ type: 'transfer' })], new Set(['a1'])).size).toBe(0)
  })

  it('mã viết thường vẫn về đúng một mã', () => {
    const m = dividendsBySymbol([gd(), gd({ stock_symbol: 'hpg' })], new Set(['a1']))
    expect(m.get('HPG')).toBe(600_000)
    expect(m.size).toBe(1)
  })
})

describe('positionTable', () => {
  const chay = (over: Partial<Parameters<typeof positionTable>[0]> = {}) =>
    positionTable({
      positions: [vt()],
      dividends: new Map(),
      priorClose: new Map(),
      ...over,
    })

  it('lãi/lỗ = chênh lệch giá CỘNG cổ tức', () => {
    const { rows } = chay({ dividends: new Map([['HPG', 300_000]]) })
    expect(rows[0].pricePnl).toBe(170_000)
    expect(rows[0].dividend).toBe(300_000)
    expect(rows[0].totalPnl).toBe(470_000)
  })

  it('mọi tỷ lệ tính trên SỐ TIỀN MUA, không phải trên giá trị hôm nay', () => {
    const { rows } = chay({ dividends: new Map([['HPG', 300_000]]) })
    // vốn 2.000.000: chênh lệch giá 8,5%, cổ tức 15%, tổng 23,5%
    expect(rows[0].pricePnlPercent).toBeCloseTo(8.5, 6)
    expect(rows[0].dividendPercent).toBeCloseTo(15, 6)
    expect(rows[0].totalPnlPercent).toBeCloseTo(23.5, 6)
  })

  it('biến động trong phiên lấy từ giá tham chiếu phiên trước', () => {
    const { rows } = chay({ priorClose: new Map([['HPG', 21_000]]) })
    // 21.700 / 21.000 − 1 = 3,33%
    expect(rows[0].dayChange).toBeCloseTo(3.333, 3)
  })

  it('không có giá tham chiếu thì biến động là null, KHÔNG phải 0%', () => {
    expect(chay().rows[0].dayChange).toBeNull()
  })

  it('mã chưa có giá thì biến động cũng null', () => {
    const { rows } = chay({
      positions: [vt({ price: null })],
      priorClose: new Map([['HPG', 21_000]]),
    })
    expect(rows[0].dayChange).toBeNull()
  })

  it('vốn bằng 0 thì mọi tỷ lệ là null chứ không chia cho 0', () => {
    const { rows } = chay({
      positions: [vt({ costBasis: 0, pnlPercent: null })],
      dividends: new Map([['HPG', 300_000]]),
    })
    expect([rows[0].pricePnlPercent, rows[0].dividendPercent, rows[0].totalPnlPercent]).toEqual([
      null,
      null,
      null,
    ])
  })

  it('dòng TỔNG bằng đúng tổng các dòng — bảng phải tự cộng đúng', () => {
    const { rows, totals } = chay({
      positions: [
        vt({ symbol: 'HPG', costBasis: 2_000_000, value: 2_170_000, pnl: 170_000 }),
        vt({ symbol: 'MBB', costBasis: 3_000_000, value: 2_800_000, pnl: -200_000 }),
      ],
      dividends: new Map([['HPG', 300_000]]),
    })
    expect(totals.value).toBe(rows.reduce((s, r) => s + r.value, 0))
    expect(totals.cost).toBe(5_000_000)
    expect(totals.pricePnl).toBe(-30_000)
    expect(totals.dividend).toBe(300_000)
    expect(totals.totalPnl).toBe(270_000)
    expect(totals.totalPnlPercent).toBeCloseTo(5.4, 6)
  })

  it('tỷ trọng cộng lại bằng 100%', () => {
    const { rows } = chay({
      positions: [
        vt({ symbol: 'HPG', value: 2_170_000, weight: 0 }),
        vt({ symbol: 'MBB', value: 2_800_000, weight: 0 }),
      ],
    })
    expect(rows.reduce((s, r) => s + r.weight, 0)).toBeCloseTo(1, 10)
  })

  it('tổng giá trị bằng 0 thì tỷ trọng là 0, không phải NaN', () => {
    const { rows } = chay({ positions: [vt({ value: 0 })] })
    expect(rows[0].weight).toBe(0)
  })

  it('cổ tức của mã ĐÃ BÁN không lẫn vào dòng nào, nhưng cũng không biến mất', () => {
    const r = chay({ dividends: new Map([['HPG', 300_000], ['FPT', 90_000]]) })
    expect(r.rows).toHaveLength(1)
    expect(r.totals.dividend).toBe(300_000)
    expect(r.soldDividend).toBe(90_000)
  })

  it('giữ nguyên tên tài khoản — dòng phải nói được mã này nằm ở đâu', () => {
    const { rows } = chay({ positions: [vt({ accountNames: ['CK', 'Đầu tư VN'] })] })
    expect(rows[0].accountNames).toEqual(['CK', 'Đầu tư VN'])
  })

  it('danh mục rỗng ra bảng rỗng và tổng bằng 0', () => {
    const r = chay({ positions: [] })
    expect(r.rows).toEqual([])
    expect(r.totals.value).toBe(0)
    expect(r.totals.totalPnlPercent).toBeNull()
  })

  it('sắp theo giá trị GIẢM DẦN — mã nặng nhất đứng đầu', () => {
    const { rows } = chay({
      positions: [vt({ symbol: 'MBB', value: 1_000 }), vt({ symbol: 'HPG', value: 9_000 })],
    })
    expect(rows.map((r) => r.symbol)).toEqual(['HPG', 'MBB'])
  })
})


describe('taggableCashflows', () => {
  const tx = (over: Record<string, unknown> = {}) =>
    ({
      id: 't1',
      type: 'income',
      amount: 300_000,
      account_id: 'a1',
      occurred_on: '2026-08-06',
      note: 'Cổ tức HPG',
      stock_symbol: null,
      ...over,
    }) as Parameters<typeof taggableCashflows>[0][number]

  it('lấy khoản THU và CHI của tài khoản trong danh mục', () => {
    const r = taggableCashflows(
      [tx(), tx({ id: 't2', type: 'expense', amount: 20_000 })],
      new Set(['a1']),
    )
    expect(r.map((x) => x.id)).toEqual(['t1', 't2'])
  })

  it('bỏ CHUYỂN KHOẢN — nạp/rút tiền không phải cổ tức', () => {
    expect(taggableCashflows([tx({ type: 'transfer' })], new Set(['a1']))).toEqual([])
  })

  it('bỏ dòng tiền do chính lệnh cổ phiếu sinh ra (migration 0054)', () => {
    expect(taggableCashflows([tx({ stock_trade_id: 'lenh-1' })], new Set(['a1']))).toEqual([])
  })

  it('bỏ tài khoản ngoài danh mục', () => {
    expect(taggableCashflows([tx({ account_id: 'x' })], new Set(['a1']))).toEqual([])
  })

  it('MỚI NHẤT trước — khoản vừa ghi là khoản người dùng muốn gắn', () => {
    const r = taggableCashflows(
      [tx({ id: 'cu', occurred_on: '2026-01-01' }), tx({ id: 'moi', occurred_on: '2026-08-06' })],
      new Set(['a1']),
    )
    expect(r.map((x) => x.id)).toEqual(['moi', 'cu'])
  })

  it('giữ cả khoản ĐÃ gắn mã — để còn đổi hoặc bỏ gắn được', () => {
    const r = taggableCashflows([tx({ stock_symbol: 'HPG' })], new Set(['a1']))
    expect(r[0].symbol).toBe('HPG')
  })

  it('mã viết thường được chuẩn hoá về chữ HOA', () => {
    const r = taggableCashflows([tx({ stock_symbol: 'hpg' })], new Set(['a1']))
    expect(r[0].symbol).toBe('HPG')
  })

  it('chưa gắn thì symbol là chuỗi rỗng, không phải null — ô chọn cần một giá trị', () => {
    expect(taggableCashflows([tx()], new Set(['a1']))[0].symbol).toBe('')
  })
})
