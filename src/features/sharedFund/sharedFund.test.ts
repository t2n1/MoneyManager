import { describe, expect, it } from 'vitest'
import { fundAlerts, fundAlertsFor, mineSharePct, partOfCategory, summarizeFund, type FundSummary, type FundTx } from './sharedFund'

const FUND = 'quy'
const THANG_9 = { start: '2026-09-01', end: '2026-10-01' }
const CATS = [
  { id: 'nha', parent_id: null },
  { id: 'an', parent_id: null },
  { id: 'cho', parent_id: 'an' },
  { id: 'dien', parent_id: null },
  { id: 'khac', parent_id: null },
]

let n = 0
function tx(over: Partial<FundTx>): FundTx {
  return {
    id: `t${n++}`,
    type: 'expense',
    amount: 0,
    to_amount: null,
    category_id: null,
    account_id: FUND,
    to_account_id: null,
    occurred_on: '2026-09-10',
    owner: 'mine',
    fund_part_id: null,
    is_refund: false,
    ...over,
  }
}
const gop = (part: string, amount: number, owner: 'mine' | 'partner', on = '2026-09-01', from = 'tk') =>
  tx({ type: 'transfer', account_id: from, to_account_id: FUND, amount, fund_part_id: part, owner, occurred_on: on })
const chi = (cat: string, amount: number, on = '2026-09-10') => tx({ category_id: cat, amount, occurred_on: on })

describe('summarizeFund — ví dụ người dùng chốt', () => {
  // Bảng trong cuộc trao đổi: tiền nhà 60k/40k, ăn uống 30k/30k, điện nước ga 10k/10k.
  const txs = [
    gop('nha', 60_000, 'mine'),
    gop('nha', 40_000, 'partner'),
    gop('an', 30_000, 'mine'),
    gop('an', 30_000, 'partner'),
    gop('dien', 10_000, 'mine'),
    gop('dien', 10_000, 'partner'),
    chi('nha', 100_000),
    chi('cho', 52_300), // con của Ăn uống → vào phần Ăn uống
    chi('dien', 23_100),
  ]
  const s = summarizeFund(txs, FUND, THANG_9, CATS)
  const p = (id: string) => s.parts.find((x) => x.partId === id)!

  it('góp theo người, chi và còn lại từng phần', () => {
    expect(p('nha')).toMatchObject({ contributed: { mine: 60_000, partner: 40_000 }, spent: 100_000, balance: 0 })
    expect(p('an')).toMatchObject({ contributed: { mine: 30_000, partner: 30_000 }, spent: 52_300, balance: 7_700 })
    expect(p('dien')).toMatchObject({ spent: 23_100, balance: -3_100 })
  })

  it('tổng luỹ kế bằng tổng dòng tiền của tài khoản quỹ', () => {
    expect(s.balance).toBe(180_000 - 175_400)
    expect(s.contributed).toEqual({ mine: 100_000, partner: 80_000 })
    expect(s.spent).toBe(175_400)
  })

  it('xếp theo tiền góp, không có dòng "Chưa gán phần" khi không có gì để gán', () => {
    expect(s.parts.map((x) => x.partId)).toEqual(['nha', 'an', 'dien'])
  })
})

describe('summarizeFund — luỹ kế và kỳ', () => {
  it('còn lại cộng dồn từ các tháng trước, cột trong kỳ chỉ tính tháng này', () => {
    const txs = [gop('dien', 20_000, 'mine', '2026-08-01'), chi('dien', 12_000, '2026-08-20'), gop('dien', 20_000, 'mine'), chi('dien', 25_000)]
    const d = summarizeFund(txs, FUND, THANG_9, CATS).parts[0]
    expect(d.contributed.mine).toBe(20_000)
    expect(d.spent).toBe(25_000)
    expect(d.balance).toBe(40_000 - 37_000)
  })

  it('bỏ qua mọi thứ từ sau kỳ', () => {
    const s = summarizeFund([gop('nha', 1, 'mine', '2026-10-01')], FUND, THANG_9, CATS)
    expect(s.parts).toEqual([])
  })

  it('góp khác tiền lấy số quỹ nhận (to_amount)', () => {
    const t = { ...gop('an', 10_000, 'mine'), to_amount: 9_500 }
    expect(summarizeFund([t], FUND, THANG_9, CATS).parts[0].contributed.mine).toBe(9_500)
  })

  it('hoàn tiền trừ vào chi của phần', () => {
    const txs = [gop('an', 30_000, 'mine'), chi('an', 5_000), tx({ category_id: 'an', amount: 1_000, is_refund: true })]
    expect(summarizeFund(txs, FUND, THANG_9, CATS).parts[0].spent).toBe(4_000)
  })

  it('rút phần dư ra khỏi quỹ trừ vào đúng phần đó', () => {
    const rut = tx({ type: 'transfer', account_id: FUND, to_account_id: 'tietkiem', amount: 7_000, fund_part_id: 'an' })
    const r = summarizeFund([gop('an', 30_000, 'mine'), rut], FUND, THANG_9, CATS).parts[0]
    expect(r).toMatchObject({ withdrawn: 7_000, balance: 23_000 })
  })

  it('chi vào danh mục không phải phần nào và góp không ghi phần → "Chưa gán phần", đứng cuối', () => {
    const txs = [gop('an', 30_000, 'mine'), chi('khac', 2_000), { ...gop('an', 5_000, 'partner'), fund_part_id: null }]
    const s = summarizeFund(txs, FUND, THANG_9, CATS)
    expect(s.parts.map((x) => x.partId)).toEqual(['an', null])
    expect(s.parts[1]).toMatchObject({ contributed: { mine: 0, partner: 5_000 }, spent: 2_000, balance: 3_000 })
  })

  it('không đụng giao dịch của tài khoản khác', () => {
    const s = summarizeFund([gop('an', 1_000, 'mine'), { ...chi('an', 999), account_id: 'khac' }], FUND, THANG_9, CATS)
    expect(s.parts[0].spent).toBe(0)
  })

  it("owner 'shared' trên khoản góp tính là của mình (chỉ có mình và người kia góp)", () => {
    const s = summarizeFund([gop('an', 1_000, 'mine'), { ...gop('an', 500, 'mine'), owner: 'shared' }], FUND, THANG_9, CATS)
    expect(s.contributed).toEqual({ mine: 1_500, partner: 0 })
  })
})

describe('partOfCategory', () => {
  const parentOf = new Map(CATS.map((c) => [c.id, c.parent_id]))
  it('chính nó, rồi tổ tiên gần nhất', () => {
    expect(partOfCategory('cho', new Set(['an']), parentOf)).toBe('an')
    expect(partOfCategory('cho', new Set(['cho', 'an']), parentOf)).toBe('cho')
    expect(partOfCategory('khac', new Set(['an']), parentOf)).toBeNull()
  })
  it('dữ liệu tự trỏ vòng không treo', () => {
    expect(partOfCategory('x', new Set(['an']), new Map([['x', 'y'], ['y', 'x']]))).toBeNull()
  })
})

describe('mineSharePct', () => {
  it('hai bên luôn cộng đủ 100', () => {
    expect(mineSharePct({ mine: 100_000, partner: 80_000 })).toBe(56)
    expect(mineSharePct({ mine: 1, partner: 2 })).toBe(33)
    expect(mineSharePct({ mine: 0, partner: 0 })).toBeNull()
  })
})

describe('fundAlerts', () => {
  const thang = (contrib: number, spent: number, balance: number): FundSummary => ({
    parts: [{ partId: 'dien', contributed: { mine: contrib, partner: 0 }, spent, withdrawn: 0, otherIn: 0, balance }],
    contributed: { mine: contrib, partner: 0 },
    spent,
    balance,
  })

  it('âm luỹ kế thì nhắc ngay, không chờ 3 tháng', () => {
    expect(fundAlerts([thang(20_000, 23_100, -3_100)])).toEqual([{ partId: 'dien', kind: 'negative', balance: -3_100 }])
  })

  it('3 tháng liền chi > góp (dù luỹ kế còn dương) → nhắc tăng', () => {
    const m = [thang(20_000, 22_000, 8_000), thang(20_000, 21_000, 7_000), thang(20_000, 24_000, 3_000)]
    expect(fundAlerts(m).map((a) => a.kind)).toEqual(['short-streak'])
  })

  it('mới 2 tháng thiếu thì chưa nhắc', () => {
    expect(fundAlerts([thang(20_000, 22_000, 8_000), thang(20_000, 24_000, 4_000)])).toEqual([])
  })

  it('3 tháng liền dư và dư đã vượt một tháng góp → gợi ý giảm', () => {
    const m = [thang(20_000, 15_000, 15_000), thang(20_000, 14_000, 21_000), thang(20_000, 16_000, 25_000)]
    expect(fundAlerts(m).map((a) => a.kind)).toEqual(['surplus-streak'])
  })

  it('dư liền 3 tháng nhưng dư còn nhỏ hơn một tháng góp → không nhắc (đệm mùa đông)', () => {
    const m = [thang(20_000, 19_000, 1_000), thang(20_000, 19_000, 2_000), thang(20_000, 19_000, 3_000)]
    expect(fundAlerts(m)).toEqual([])
  })
})

describe('fundAlertsFor', () => {
  const THANG = (m: string) => ({ start: `2026-${m}-01`, end: `2026-${String(Number(m) + 1).padStart(2, '0')}-01` })
  const done = [THANG('06'), THANG('07'), THANG('08')]

  it('âm luỹ kế ở kỳ đang chạy thì nói ngay, và chỉ một lời nhắc cho một phần', () => {
    const txs = ['06', '07', '08', '09'].flatMap((m) => [gop('dien', 20_000, 'mine', `2026-${m}-01`), chi('dien', 23_000, `2026-${m}-20`)])
    const a = fundAlertsFor(txs, FUND, CATS, THANG_9, done)
    expect(a).toEqual([{ partId: 'dien', kind: 'negative', balance: -12_000 }])
  })

  it('không âm nhưng 3 tháng xong liền thiếu → short-streak', () => {
    const txs = [gop('dien', 50_000, 'mine', '2026-05-01'), ...['06', '07', '08'].flatMap((m) => [gop('dien', 20_000, 'mine', `2026-${m}-01`), chi('dien', 22_000, `2026-${m}-20`)])]
    expect(fundAlertsFor(txs, FUND, CATS, THANG_9, done).map((x) => x.kind)).toEqual(['short-streak'])
  })

  it('quỹ ổn thì im', () => {
    const txs = ['06', '07', '08'].flatMap((m) => [gop('dien', 20_000, 'mine', `2026-${m}-01`), chi('dien', 20_000, `2026-${m}-20`)])
    expect(fundAlertsFor(txs, FUND, CATS, THANG_9, done)).toEqual([])
  })
})
