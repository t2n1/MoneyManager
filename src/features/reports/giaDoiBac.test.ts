import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { RecurringRuleRow, TransactionRow } from '../../types/database.types'
import { doBacGia } from './giaDoiBac'

const RATES: Rates = { JPY: 1, VND: 165 }
const currencyOf = (id: string): CurrencyCode => (id === 'vnd' ? 'VND' : 'JPY')
const CATS = [{ id: 'nha', icon: '🔑' }]

let seq = 0
function tx(
  p: Partial<TransactionRow> & Pick<TransactionRow, 'amount' | 'occurred_on'>,
): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    type: 'expense',
    to_amount: null,
    category_id: 'nha',
    account_id: 'jpy',
    to_account_id: null,
    recurring_rule_id: null,
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  } as TransactionRow
}

function rule(p: Partial<RecurringRuleRow> = {}): RecurringRuleRow {
  return { ...baseRule(), ...p }
}

function baseRule(): RecurringRuleRow {
  return {
    id: 'r1',
    user_id: 'u',
    type: 'expense',
    amount: 112_760,
    to_amount: null,
    category_id: 'nha',
    account_id: 'jpy',
    to_account_id: null,
    note: 'Tiền nhà',
    frequency: 'monthly',
    start_on: '2025-09-01',
    end_on: null,
    is_paused: false,
    is_refund: false,
  } as RecurringRuleRow
}

/** Chuỗi tiền nhà thật: 62.760 × 6 tháng rồi 112.760 từ 2026-03. */
function tienNha(): TransactionRow[] {
  const out: TransactionRow[] = []
  for (const m of ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02'])
    out.push(tx({ amount: 62_760, occurred_on: `${m}-01`, recurring_rule_id: 'r1' }))
  for (const m of ['2026-03', '2026-04', '2026-05'])
    out.push(tx({ amount: 112_760, occurred_on: `${m}-01`, recurring_rule_id: 'r1' }))
  return out
}

const chay = (txs: TransactionRow[], rules: RecurringRuleRow[] = [rule()]) =>
  doBacGia(txs, rules, CATS, currencyOf, 'JPY', RATES)

describe('doBacGia — nguồn 1: theo quy tắc', () => {
  it('ca tiền nhà thật: 6×62.760 rồi 3×112.760 → một bậc đúng số', () => {
    const r = chay(tienNha())
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      nhan: 'Tiền nhà',
      icon: '🔑',
      currency: 'JPY',
      giaCu: 62_760,
      giaMoi: 112_760,
      tuNgayISO: '2026-03-01',
      soLanGiaMoi: 3,
      chenhMoiNam: 600_000,
    })
  })

  it('giá mới chỉ 1 lần → CHƯA báo (chưa đủ mặt phẳng)', () => {
    const txs = tienNha().filter((t) => t.occurred_on < '2026-04')
    expect(chay(txs)).toHaveLength(0)
  })

  it('giá cũ chỉ 1 lần → không báo', () => {
    const txs = [
      tx({ amount: 62_760, occurred_on: '2026-01-01', recurring_rule_id: 'r1' }),
      tx({ amount: 112_760, occurred_on: '2026-02-01', recurring_rule_id: 'r1' }),
      tx({ amount: 112_760, occurred_on: '2026-03-01', recurring_rule_id: 'r1' }),
    ]
    expect(chay(txs)).toHaveLength(0)
  })

  it('mỗi kỳ một số (tiền điện) → không báo', () => {
    const txs = [61_000, 74_000, 58_000, 69_000].map((a, i) =>
      tx({ amount: a, occurred_on: `2026-0${i + 1}-01`, recurring_rule_id: 'r1' }),
    )
    expect(chay(txs)).toHaveLength(0)
  })

  it('A→B→A: lấy bậc gần nhất (B→A)', () => {
    const amounts = [1_000, 1_000, 1_500, 1_500, 1_000, 1_000]
    const txs = amounts.map((a, i) =>
      tx({ amount: a, occurred_on: `2026-0${i + 1}-01`, recurring_rule_id: 'r1' }),
    )
    const r = chay(txs)
    expect(r).toHaveLength(1)
    expect(r[0].giaCu).toBe(1_500)
    expect(r[0].giaMoi).toBe(1_000)
    expect(r[0].tuNgayISO).toBe('2026-05-01')
  })

  it('giảm giá → chenhMoiNam âm, vẫn báo', () => {
    const txs = [2_000, 2_000, 1_500, 1_500].map((a, i) =>
      tx({ amount: a, occurred_on: `2026-0${i + 1}-01`, recurring_rule_id: 'r1' }),
    )
    const r = chay(txs)
    expect(r).toHaveLength(1)
    expect(r[0].chenhMoiNam).toBe(-6_000)
  })

  it('quy tắc theo NĂM → chênh × 1', () => {
    const txs = [10_000, 10_000, 12_000, 12_000].map((a, i) =>
      tx({ amount: a, occurred_on: `${2023 + i}-01-01`, recurring_rule_id: 'r1' }),
    )
    const r = chay(txs, [rule({ frequency: 'yearly' })])
    expect(r).toHaveLength(1)
    expect(r[0].chenhMoiNam).toBe(2_000)
  })

  it('một lần lệch chen giữa (A A x B B) → cố ý KHÔNG báo', () => {
    const amounts = [1_000, 1_000, 1_234, 1_500, 1_500]
    const txs = amounts.map((a, i) =>
      tx({ amount: a, occurred_on: `2026-0${i + 1}-01`, recurring_rule_id: 'r1' }),
    )
    expect(chay(txs)).toHaveLength(0)
  })
})

describe('doBacGia — nguồn 2: theo ghi chú sao kê', () => {
  const ghiChu = (amounts: number[], note = 'NETFLIX.COM') =>
    amounts.map((a, i) =>
      tx({
        amount: a,
        occurred_on: `2026-0${i + 1}-15`,
        note,
        recurring_rule_id: null,
      }),
    )

  it('cùng ghi chú, nhịp ~30 ngày, có bậc → báo với nhãn là ghi chú', () => {
    const r = chay(ghiChu([990, 990, 1_290, 1_290]), [])
    expect(r).toHaveLength(1)
    expect(r[0].nhan).toBe('NETFLIX.COM')
    expect(r[0].chenhMoiNam).toBe(3_600)
  })

  it('nhịp thất thường (không ~tháng) → im', () => {
    const txs = [
      tx({ amount: 990, occurred_on: '2026-01-02', note: 'X' }),
      tx({ amount: 990, occurred_on: '2026-01-09', note: 'X' }),
      tx({ amount: 1_290, occurred_on: '2026-05-01', note: 'X' }),
      tx({ amount: 1_290, occurred_on: '2026-05-03', note: 'X' }),
    ]
    expect(chay(txs, [])).toHaveLength(0)
  })

  it('ghi chú rỗng → không gom, im', () => {
    expect(chay(ghiChu([990, 990, 1_290, 1_290], ''), [])).toHaveLength(0)
  })

  it('giao dịch có rule_id KHÔNG lọt vào nhóm ghi chú (không đếm hai lần)', () => {
    const txs = ghiChu([990, 990, 1_290, 1_290]).map((t) => ({
      ...t,
      recurring_rule_id: 'r1',
      note: 'Tiền nhà',
    }))
    // nguồn 1 sẽ báo (đúng), nhưng chỉ MỘT kết quả — không có bản sao từ nguồn 2
    expect(chay(txs)).toHaveLength(1)
  })
})

describe('doBacGia — lọc và sắp', () => {
  it('bỏ dòng exclude_from_stats', () => {
    const txs = tienNha().map((t) => ({ ...t, exclude_from_stats: true }))
    expect(chay(txs)).toHaveLength(0)
  })

  it('bỏ dòng is_debt_flow và hoàn tiền', () => {
    const no = tienNha().map((t) => ({ ...t, is_debt_flow: true }))
    expect(chay(no)).toHaveLength(0)
    const hoan = tienNha().map((t) => ({ ...t, is_refund: true }))
    expect(chay(hoan)).toHaveLength(0)
  })

  it('bậc nặng hơn (quy về base) đứng trước', () => {
    const nho = [500, 500, 600, 600].map((a, i) =>
      tx({ amount: a, occurred_on: `2026-0${i + 1}-03`, note: 'NHO', recurring_rule_id: null }),
    )
    const r = chay([...tienNha(), ...nho])
    expect(r).toHaveLength(2)
    expect(r[0].nhan).toBe('Tiền nhà')
    expect(r[1].nhan).toBe('NHO')
  })
})
