import { describe, expect, it } from 'vitest'
import { asTrade, type Trade } from './holdings'
import { buildPortfolio } from './portfolio'
import { navSeries, toLedger, type LedgerEntry } from './navSeries'

const mua = (over: Partial<Trade> = {}): Trade => ({
  symbol: 'HPG',
  kind: 'buy',
  tradedOn: '2026-01-05',
  quantity: 100,
  price: 20_000,
  fee: 0,
  tax: 0,
  ...over,
})

/** symbol → ngày → đồng/cổ */
const bangGia = (rows: [string, string, number][]) => {
  const m = new Map<string, Map<string, number>>()
  for (const [sym, date, price] of rows) {
    const theoNgay = m.get(sym) ?? new Map<string, number>()
    theoNgay.set(date, price)
    m.set(sym, theoNgay)
  }
  return m
}

const nap = (date: string, delta: number): LedgerEntry => ({ date, delta, external: true })

const chay = (over: Partial<Parameters<typeof navSeries>[0]> = {}) =>
  navSeries({
    sessions: ['2026-01-05'],
    trades: [],
    prices: bangGia([]),
    ledger: [],
    openingBalance: 0,
    ...over,
  })

describe('navSeries', () => {
  it('một phiên, một mã: giá trị cổ phiếu = số cổ × giá đóng cửa phiên đó', () => {
    const r = chay({
      trades: [mua()],
      prices: bangGia([['HPG', '2026-01-05', 21_000]]),
      ledger: [nap('2026-01-05', 5_000_000)],
    })
    expect(r.points).toHaveLength(1)
    expect(r.points[0].stockValue).toBe(2_100_000) // 100 × 21.000
  })

  it('tiền mặt = số dư sổ trừ tiền đã mua, tại đúng phiên đó', () => {
    const r = chay({
      trades: [mua()], // 100 × 20.000 = 2.000.000
      prices: bangGia([['HPG', '2026-01-05', 21_000]]),
      ledger: [nap('2026-01-05', 5_000_000)],
    })
    expect(r.points[0].cash).toBe(3_000_000)
    expect(r.points[0].nav).toBe(5_100_000) // 2.100.000 cổ phiếu + 3.000.000 tiền
  })

  it('phiên trước ngày mua thì mã đó chưa nằm trong giá trị', () => {
    const r = chay({
      sessions: ['2026-01-02', '2026-01-05'],
      trades: [mua()],
      prices: bangGia([
        ['HPG', '2026-01-02', 19_000],
        ['HPG', '2026-01-05', 21_000],
      ]),
      ledger: [nap('2026-01-02', 5_000_000)],
    })
    expect(r.points[0].stockValue).toBe(0)
    expect(r.points[1].stockValue).toBe(2_100_000)
  })

  it('phiên thiếu giá thì mang giá phiên trước sang, không tụt về 0', () => {
    const r = chay({
      sessions: ['2026-01-05', '2026-01-06', '2026-01-07'],
      trades: [mua()],
      prices: bangGia([
        ['HPG', '2026-01-05', 21_000],
        // 06 không có bar — mã tạm ngừng giao dịch
        ['HPG', '2026-01-07', 22_000],
      ]),
    })
    expect(r.points.map((p) => p.stockValue)).toEqual([2_100_000, 2_100_000, 2_200_000])
    expect(r.missingPrices).toEqual([])
  })

  it('mã chưa từng có giá nào thì tạm tính theo giá vốn và báo tên mã', () => {
    const r = chay({
      trades: [mua()], // giá vốn 20.000/cổ
      prices: bangGia([]),
    })
    expect(r.points[0].stockValue).toBe(2_000_000)
    expect(r.missingPrices).toEqual(['HPG'])
  })

  // Khác ca trên: mã CÓ giá, nhưng bar đầu tiên tới MUỘN hơn phiên mua. Đoạn đầu tạm
  // tính theo giá vốn (đường đi ngang) rồi mới nhập vào giá thật — và tên mã phải được
  // nêu, vì hai con số Tổng lợi nhuận / Lãi kép/năm tính cả đoạn ấy.
  it('mã có giá muộn hơn phiên mua thì đoạn đầu là giá vốn, và vẫn báo tên mã', () => {
    const r = chay({
      sessions: ['2026-01-05', '2026-01-06', '2026-01-07'],
      trades: [mua()], // mua phiên 05, giá vốn 20.000/cổ
      prices: bangGia([['HPG', '2026-01-07', 25_000]]),
    })
    expect(r.points.map((p) => p.stockValue)).toEqual([2_000_000, 2_000_000, 2_500_000])
    expect(r.missingPrices).toEqual(['HPG'])
  })

  it('chuyển khoản nạp tiền vào flow; cổ tức thì KHÔNG — cổ tức là lợi nhuận, không phải tiền mới', () => {
    const r = chay({
      sessions: ['2026-01-05', '2026-01-06'],
      ledger: [
        nap('2026-01-05', 5_000_000),
        { date: '2026-01-06', delta: 300_000, external: false }, // cổ tức
      ],
    })
    expect(r.points[0].flow).toBe(5_000_000)
    expect(r.points[1].flow).toBe(0)
    expect(r.points[1].cash).toBe(5_300_000) // cổ tức vẫn vào tiền mặt
  })

  it('mép phải TRÙNG giá trị danh mục mà khu Giá trị đang in — hai màn cạnh nhau không được lệch số', () => {
    const trades = [
      mua({ symbol: 'HPG', tradedOn: '2026-01-05', quantity: 100, price: 20_000, fee: 5_000 }),
      mua({ symbol: 'MBB', tradedOn: '2026-02-10', quantity: 200, price: 13_000, fee: 7_000 }),
    ]
    const gia = new Map([
      ['HPG', 21_700],
      ['MBB', 20_550],
    ])

    const p = buildPortfolio(
      [{ accountId: 'a1', accountName: 'CK', balance: 10_000_000, trades }],
      gia,
    )
    const r = chay({
      sessions: ['2026-01-05', '2026-02-10', '2026-09-04'],
      trades,
      prices: bangGia([
        ['HPG', '2026-09-04', 21_700],
        ['MBB', '2026-09-04', 20_550],
      ]),
      ledger: [nap('2026-01-05', 10_000_000)],
    })

    const cuoi = r.points.at(-1)!
    expect(cuoi.stockValue).toBe(p.stockValue)
    expect(cuoi.cash).toBe(p.cash)
    expect(cuoi.nav).toBe(p.marketValue)
  })

  it('không có phiên nào thì trả chuỗi rỗng, không nổ', () => {
    expect(chay({ sessions: [] }).points).toEqual([])
  })
})

describe('toLedger', () => {
  const gd = (over: Record<string, unknown> = {}) =>
    ({
      type: 'transfer',
      amount: 1_000_000,
      to_amount: null,
      account_id: 'vi',
      to_account_id: 'a1',
      occurred_on: '2026-01-05',
      ...over,
    }) as Parameters<typeof toLedger>[0][number]

  it('chuyển khoản vào tài khoản là dòng tiền NGOÀI', () => {
    expect(toLedger([gd()], new Set(['a1']))).toEqual([
      { date: '2026-01-05', delta: 1_000_000, external: true },
    ])
  })

  it('chuyển khoản xuyên tệ lấy to_amount, không lấy amount', () => {
    const r = toLedger([gd({ amount: 50_000, to_amount: 8_250_000 })], new Set(['a1']))
    expect(r[0].delta).toBe(8_250_000)
  })

  // Khoan bu cua ReconcileSheet mang `exclude_from_stats: true` — no la loi thu nhan
  // "so ghi sai", khong phai mot khoan lai/lo. Quy no thanh loi suat la do loi so sach
  // len thanh tich dau tu: so that 10/09/2026 bu 9.059.506 d (co tuc da dung mua co
  // phieu ma mo hinh khong dien ta duoc) va khu Hieu qua in ngay "1 tuan −2,9%" cho mot
  // phien chang co gi xay ra.
  it('khoan bu so du la tien vao/ra, KHONG phai lai lo', () => {
    const r = toLedger(
      [gd({ type: 'expense', account_id: 'a1', to_account_id: null, exclude_from_stats: true })],
      new Set(['a1']),
    )
    expect(r[0]).toEqual({ date: '2026-01-05', delta: -1_000_000, external: true })
  })

  it('phi luu ky ghi binh thuong VAN la lo — chi khoan bu moi duoc boc ra', () => {
    const r = toLedger(
      [gd({ type: 'expense', account_id: 'a1', to_account_id: null })],
      new Set(['a1']),
    )
    expect(r[0].external).toBe(false)
  })

  it('rút tiền khỏi tài khoản là dòng tiền ngoài, dấu âm', () => {
    const r = toLedger([gd({ account_id: 'a1', to_account_id: 'vi' })], new Set(['a1']))
    expect(r[0]).toEqual({ date: '2026-01-05', delta: -1_000_000, external: true })
  })

  it('cổ tức (khoản thu) KHÔNG phải dòng tiền ngoài', () => {
    const r = toLedger(
      [gd({ type: 'income', account_id: 'a1', to_account_id: null, amount: 300_000 })],
      new Set(['a1']),
    )
    expect(r[0]).toEqual({ date: '2026-01-05', delta: 300_000, external: false })
  })

  it('phí lưu ký (khoản chi) KHÔNG phải dòng tiền ngoài', () => {
    const r = toLedger(
      [gd({ type: 'expense', account_id: 'a1', to_account_id: null, amount: 20_000 })],
      new Set(['a1']),
    )
    expect(r[0]).toEqual({ date: '2026-01-05', delta: -20_000, external: false })
  })

  it('giao dịch không liên quan tài khoản nào trong danh mục thì bỏ qua', () => {
    expect(toLedger([gd({ account_id: 'x', to_account_id: 'y' })], new Set(['a1']))).toEqual([])
  })

  it('chuyển khoản GIỮA hai tài khoản trong danh mục không phải tiền mới — hai chân triệt tiêu', () => {
    const r = toLedger([gd({ account_id: 'a1', to_account_id: 'a2' })], new Set(['a1', 'a2']))
    expect(r.reduce((s, e) => s + e.delta, 0)).toBe(0)
    expect(r.every((e) => e.external === false)).toBe(true)
  })
})

describe('asTrade — dùng lại, không chép tay', () => {
  it('ánh xạ hàng stock_trades sang Trade', () => {
    const t = asTrade({
      symbol: 'HPG',
      kind: 'buy',
      traded_on: '2026-01-05',
      quantity: 100,
      price: 20_000,
      fee: 5_000,
      tax: 0,
    })
    expect(t.tradedOn).toBe('2026-01-05')
  })
})

// Chuỗi giá lịch sử của dchart ĐÃ ĐIỀU CHỈNH cổ tức/chia tách (dchart.ts nói thẳng, cột
// `stock_price_history.close` cũng có comment đó), còn sổ lệnh ghi GIÁ THẬT đã trả và SỐ
// CỔ THẬT lúc đó. Trộn hai thang là cái đã làm khu Hiệu quả in "Tổng lợi nhuận −77,5%"
// cho một danh mục đang lời (sổ thật 10/09/2026): mỗi lệnh mua bơm tiền mặt theo giá
// thật nhưng cổ phiếu vào sổ theo giá đã điều chỉnh (thấp hơn), và TWR đọc khoảng chênh
// đó thành lỗ — hai mươi lệnh mua thì lỗ giả nhân lên.
describe('navSeries — dòng tiền của lệnh đo cùng thang với giá', () => {
  it('mua: flow là giá trị cổ phiếu THEO CHUỖI, không phải tiền đã trả', () => {
    const r = chay({
      sessions: ['2026-01-05', '2026-01-06'],
      trades: [
        mua({ tradedOn: '2026-01-05', quantity: 100, price: 8_000 }),
        mua({ tradedOn: '2026-01-06', quantity: 100, price: 10_000 }),
      ],
      prices: bangGia([
        ['HPG', '2026-01-05', 8_000],
        ['HPG', '2026-01-06', 8_000],
      ]),
      ledger: [nap('2026-01-05', 800_000), nap('2026-01-06', 1_000_000)],
    })
    expect(r.points[1].nav).toBe(1_600_000)
    expect(r.points[1].flow).toBe(800_000)
    // Hệ quả là điều duy nhất người dùng thấy: một phiên chỉ có lệnh mua thì lợi suất = 0.
    expect((r.points[1].nav - r.points[1].flow) / r.points[0].nav).toBe(1)
  })

  it('cổ phiếu thưởng: số cổ tăng mà chuỗi giá KHÔNG rơi ngày chốt → phải bóc ra, không thì lãi hai lần', () => {
    const r = chay({
      sessions: ['2026-01-05', '2026-01-06'],
      trades: [
        mua({ tradedOn: '2026-01-05', quantity: 100, price: 10_000 }),
        mua({ tradedOn: '2026-01-06', kind: 'adjust', quantity: 10, price: 0 }),
      ],
      prices: bangGia([
        ['HPG', '2026-01-05', 10_000],
        ['HPG', '2026-01-06', 10_000],
      ]),
      ledger: [nap('2026-01-05', 1_000_000)],
    })
    expect(r.points[1].nav).toBe(1_100_000)
    expect(r.points[1].flow).toBe(100_000)
  })

  it('bán trên giá đóng cửa: phần chênh là may rủi khớp lệnh, không phải lợi suất danh mục', () => {
    const r = chay({
      sessions: ['2026-01-05', '2026-01-06'],
      trades: [
        mua({ tradedOn: '2026-01-05', quantity: 100, price: 10_000 }),
        mua({ tradedOn: '2026-01-06', kind: 'sell', quantity: 100, price: 12_000 }),
      ],
      prices: bangGia([
        ['HPG', '2026-01-05', 10_000],
        ['HPG', '2026-01-06', 10_000],
      ]),
      ledger: [nap('2026-01-05', 1_000_000)],
    })
    expect(r.points[1].nav).toBe(1_200_000) // đã bán sạch, tất cả về tiền mặt
    expect(r.points[1].flow).toBe(200_000)
  })

  it('mã chưa có giá: đang tạm tính theo giá vốn nên lệnh mua vẫn không sinh lợi suất', () => {
    const r = chay({
      sessions: ['2026-01-05', '2026-01-06'],
      trades: [
        mua({ tradedOn: '2026-01-05', quantity: 100, price: 10_000 }),
        mua({ symbol: 'MBB', tradedOn: '2026-01-06', quantity: 100, price: 13_000 }),
      ],
      prices: bangGia([
        ['HPG', '2026-01-05', 10_000],
        ['HPG', '2026-01-06', 10_000],
      ]),
      ledger: [nap('2026-01-05', 1_000_000), nap('2026-01-06', 1_300_000)],
    })
    expect(r.points[1].nav).toBe(2_300_000) // 1.000.000 HPG + 1.300.000 giá vốn MBB
    expect(r.points[1].flow).toBe(1_300_000)
  })
})
