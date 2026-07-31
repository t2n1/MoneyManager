import { describe, it, expect } from 'vitest'
import { reconcile, reviewMapping, reviewWallets, monthKeyOf } from './audit-lib.mjs'

const tx = (o) => ({
  occurred_on: o.date,
  type: o.type ?? 'expense',
  amount: o.amount,
  account_id: o.acc ?? 'acc-1',
  note: o.note ?? '',
})

function row(o = {}) {
  const r = Array(16).fill('')
  r[0] = o.date ?? '2024-01-02'
  r[1] = o.method ?? 'payment'
  r[2] = o.main ?? '食費'
  r[3] = o.sub ?? '昼ご飯'
  r[4] = o.from ?? 'お財布'
  r[5] = o.to ?? '-'
  r[9] = 'JPY'
  r[10] = o.income ?? '0'
  r[11] = o.expense ?? '0'
  r[15] = '常に集計に含める'
  return r
}

describe('monthKeyOf', () => {
  it('lấy YYYY-MM từ ngày', () => {
    expect(monthKeyOf('2019-03-15')).toBe('2019-03')
  })
})

describe('reconcile', () => {
  it('khớp hết -> không thiếu, không thừa', () => {
    const items = [tx({ date: '2024-01-02', amount: 500 }), tx({ date: '2024-01-03', amount: 800 })]
    const r = reconcile(items, [...items])
    expect(r.matched).toBe(2)
    expect(r.missing).toHaveLength(0)
    expect(r.extra).toHaveLength(0)
    expect(r.isComplete).toBe(true)
  })

  it('chỉ ra đúng dòng bị thiếu trong app', () => {
    const expected = [tx({ date: '2024-01-02', amount: 500 }), tx({ date: '2024-01-03', amount: 800 })]
    const r = reconcile(expected, [expected[0]])
    expect(r.matched).toBe(1)
    expect(r.missing).toHaveLength(1)
    expect(r.missing[0]).toMatchObject({ occurred_on: '2024-01-03', amount: 800 })
    expect(r.isComplete).toBe(false)
  })

  it('đếm theo BỘI: hai bữa trưa 500¥ cùng ngày mà app chỉ có một -> thiếu một', () => {
    const a = tx({ date: '2024-01-02', amount: 500 })
    const r = reconcile([a, { ...a }], [a])
    expect(r.matched).toBe(1)
    expect(r.missing).toHaveLength(1)
  })

  it('giao dịch app tự nhập (không có trong Zaim) vào mục "thừa", KHÔNG coi là lỗi', () => {
    const zaim = tx({ date: '2024-01-02', amount: 500 })
    const manual = tx({ date: '2026-07-30', amount: 999, note: 'tự nhập' })
    const r = reconcile([zaim], [zaim, manual])
    expect(r.missing).toHaveLength(0)
    expect(r.extra).toHaveLength(1)
    expect(r.isComplete).toBe(true)
  })

  it('bảng theo tháng chỉ ra tháng nào hụt và hụt bao nhiêu tiền', () => {
    const expected = [
      tx({ date: '2019-03-01', amount: 100 }),
      tx({ date: '2019-03-02', amount: 200 }),
      tx({ date: '2019-04-01', amount: 300 }),
    ]
    const r = reconcile(expected, [expected[0], expected[2]])
    const mar = r.byMonth.find((m) => m.month === '2019-03')
    expect(mar).toMatchObject({ expected: 2, found: 1, missing: 1, missingAmount: 200 })
    expect(r.byMonth.find((m) => m.month === '2019-04')).toMatchObject({ missing: 0 })
  })
})

describe('reviewMapping', () => {
  it('gắn cờ cặp rơi vào "Khác" và cặp gán vào nhóm cha', () => {
    const rows = [
      row({ main: 'その他', sub: '未分類', expense: '100' }), // -> Khác
      row({ main: '交通', sub: '自転車', expense: '200' }), // -> 'Đi lại' (nhóm cha)
      row({ main: '食費', sub: '昼ご飯', expense: '300' }), // -> lá, đã chốt
    ]
    const rv = reviewMapping(rows)
    const other = rv.find((x) => x.key === 'その他>未分類')
    const bike = rv.find((x) => x.key === '交通>自転車')
    const lunch = rv.find((x) => x.key === '食費>昼ご飯')
    expect(other.toOther).toBe(true)
    expect(bike.toParent).toBe(true)
    expect(lunch).toMatchObject({ toOther: false, toParent: false, guessed: false, count: 1, sum: 300 })
  })

  it('cặp không có trong bảng -> guessed = true (dùng mặc định của nhóm)', () => {
    const rv = reviewMapping([row({ main: '食費', sub: 'カテゴリ-lạ', expense: '100' })])
    expect(rv[0]).toMatchObject({ guessed: true, path: 'Ăn uống', toParent: true })
  })

  it('nhóm cố ý chỉ có một đích (Lương) -> KHÔNG bị coi là đoán', () => {
    const rv = reviewMapping([row({ method: 'income', main: '給与所得', sub: '', income: '5000' })])
    expect(rv[0]).toMatchObject({ path: 'Lương', guessed: false })
  })

  it('cặp bị bỏ -> skipped, và không lẫn với cặp được nạp', () => {
    const rv = reviewMapping([row({ main: '交通', sub: '会社交通費', expense: '400' })])
    expect(rv[0]).toMatchObject({ skipped: true, count: 1, sum: 400 })
  })

  it('bỏ qua dòng transfer/balance vì chúng không đi vào danh mục nào', () => {
    expect(reviewMapping([row({ method: 'transfer' }), row({ method: 'balance' })])).toHaveLength(0)
  })
})

describe('reviewWallets', () => {
  it('đếm theo ví và chỉ ra ví nào rơi vào tài khoản mặc định', () => {
    const rows = [
      row({ from: 'お財布', expense: '100' }),
      row({ from: '-', expense: '200' }),
      row({ from: 'Vãng lai', expense: '300' }),
    ]
    const rv = reviewWallets(rows)
    expect(rv.find((w) => w.wallet === 'お財布')).toMatchObject({ account: 'Ví', isDefault: false })
    expect(rv.find((w) => w.wallet === '-')).toMatchObject({ isDefault: true, sum: 200 })
    expect(rv.find((w) => w.wallet === 'Vãng lai')).toMatchObject({ isDefault: true, sum: 300 })
  })

  it('thu dùng ví 入金先, không dùng 支払元', () => {
    const rv = reviewWallets([row({ method: 'income', main: '給与所得', to: '楽天銀行', income: '5000' })])
    expect(rv).toHaveLength(1)
    expect(rv[0]).toMatchObject({ wallet: '楽天銀行', account: 'Rakuten Bank', sum: 5000 })
  })
})
