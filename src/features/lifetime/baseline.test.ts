import { describe, expect, it } from 'vitest'
import { suggestBaseline } from './baseline'
import type { CurrencyOf } from '../reports/aggregate'
import type { CategoryRow, TransactionRow } from '../../types/database.types'

const cats = [
  { id: 'c-nha', name: 'Nhà ở', parent_id: null },
  { id: 'c-an', name: 'Ăn uống', parent_id: null },
] as CategoryRow[]

// Tài khoản a1 = JPY (mặc định của tx()), a2 = USD — dùng cho ca cố ý trộn tiền.
const currencyOf: CurrencyOf = (accountId) => (accountId === 'a2' ? 'USD' : 'JPY')

function tx(over: Partial<TransactionRow>): TransactionRow {
  return {
    id: 'x',
    user_id: 'u',
    // Cách hôm nay (2026-07-29) khoảng 12 tháng → monthsCovered = 12 → hệ số quy năm
    // hoá bằng 1, nên số kỳ vọng trong test là số cộng thẳng. Đổi ngày này là đổi hết
    // các con số bên dưới.
    occurred_on: '2025-08-01',
    type: 'expense',
    amount: 100_000,
    account_id: 'a1',
    category_id: 'c-an',
    note: '',
    exclude_from_stats: false,
    ...over,
  } as TransactionRow
}

describe('suggestBaseline', () => {
  it('quy năm hoá thu và chi trong 12 tháng gần nhất', () => {
    const txs = [
      tx({ id: '1', type: 'income', amount: 500_000 }),
      tx({ id: '2', type: 'income', amount: 500_000, occurred_on: '2026-07-10' }),
      tx({ id: '3', type: 'expense', amount: 300_000, occurred_on: '2026-02-10' }),
    ]
    const s = suggestBaseline(txs, cats, currencyOf, 'JPY', '2026-07-29')
    expect(s.monthsCovered).toBe(12)
    expect(s.annualIncomeMinor).toBe(1_000_000)
    expect(s.annualExpenseMinor).toBe(300_000)
  })

  it('bỏ chuyển khoản', () => {
    const txs = [
      tx({ id: '1', type: 'transfer', amount: 900_000 }),
      tx({ id: '2', type: 'expense', amount: 100_000 }),
    ]
    const s = suggestBaseline(txs, cats, currencyOf, 'JPY', '2026-07-29')
    expect(s.annualExpenseMinor).toBe(100_000)
  })

  it('bỏ giao dịch exclude_from_stats', () => {
    const txs = [
      tx({ id: '1', amount: 900_000, exclude_from_stats: true }),
      tx({ id: '2', amount: 100_000 }),
    ]
    const s = suggestBaseline(txs, cats, currencyOf, 'JPY', '2026-07-29')
    expect(s.annualExpenseMinor).toBe(100_000)
  })

  it('bỏ giao dịch khác loại tiền (tài khoản khác qua currencyOf)', () => {
    const txs = [
      // a2 tra ra USD qua currencyOf — khác 'JPY' đang xét, phải bị loại.
      tx({ id: '1', amount: 900_000, account_id: 'a2' }),
      // a1 tra ra JPY — đúng loại tiền, được tính.
      tx({ id: '2', amount: 100_000, account_id: 'a1' }),
    ]
    const s = suggestBaseline(txs, cats, currencyOf, 'JPY', '2026-07-29')
    expect(s.annualExpenseMinor).toBe(100_000)
  })

  it('bỏ giao dịch cũ hơn 12 tháng', () => {
    const txs = [
      tx({ id: '1', amount: 900_000, occurred_on: '2024-01-01' }),
      tx({ id: '2', amount: 100_000, occurred_on: '2026-06-01' }),
    ]
    const s = suggestBaseline(txs, cats, currencyOf, 'JPY', '2026-07-29')
    // Khoản 2024 bị loại, nên khoảng phủ chỉ tính từ 2026-06-01 → 2 tháng, hệ số 6.
    // Điểm cần kiểm: 900.000 không lọt vào kết quả dưới bất kỳ dạng nào.
    expect(s.monthsCovered).toBe(2)
    expect(s.annualExpenseMinor).toBe(600_000)
  })

  it('quy năm hoá theo số tháng thực có khi dữ liệu chưa đủ 12 tháng', () => {
    // Giao dịch cũ nhất cách hôm nay 6 tháng → nhân 2 để ra số năm.
    const txs = [tx({ id: '1', amount: 300_000, occurred_on: '2026-02-01' })]
    const s = suggestBaseline(txs, cats, currencyOf, 'JPY', '2026-07-29')
    expect(s.monthsCovered).toBe(6)
    expect(s.annualExpenseMinor).toBe(600_000)
  })

  it('không có giao dịch nào thì trả 0, không chia cho 0', () => {
    const s = suggestBaseline([], cats, currencyOf, 'JPY', '2026-07-29')
    expect(s.annualIncomeMinor).toBe(0)
    expect(s.annualExpenseMinor).toBe(0)
    expect(s.byCategory).toEqual([])
  })

  it('breakdown xếp giảm dần và share cộng lại bằng 1', () => {
    const txs = [
      tx({ id: '1', amount: 300_000, category_id: 'c-nha' }),
      tx({ id: '2', amount: 100_000, category_id: 'c-an' }),
    ]
    const s = suggestBaseline(txs, cats, currencyOf, 'JPY', '2026-07-29')
    expect(s.byCategory[0].name).toBe('Nhà ở')
    expect(s.byCategory[0].share).toBeCloseTo(0.75)
    expect(s.byCategory.reduce((a, b) => a + b.share, 0)).toBeCloseTo(1)
  })

  it('danh mục đã xóa vẫn hiện, gắn nhãn rõ ràng', () => {
    const txs = [tx({ id: '1', amount: 100_000, category_id: 'khong-ton-tai' })]
    const s = suggestBaseline(txs, cats, currencyOf, 'JPY', '2026-07-29')
    expect(s.byCategory[0].name).toBe('Danh mục đã xóa')
  })

  it('hoàn tiền (is_refund) trừ khỏi chi, không cộng dồn theo Math.abs', () => {
    const txs = [
      // Mua 300.000, cùng danh mục.
      tx({ id: '1', amount: 300_000, category_id: 'c-an' }),
      // Hoàn 100.000 của đúng khoản trên — is_refund là chi ÂM.
      tx({ id: '2', amount: 100_000, category_id: 'c-an', is_refund: true }),
    ]
    const s = suggestBaseline(txs, cats, currencyOf, 'JPY', '2026-07-29')
    // Tính tay: 300.000 − 100.000 = 200.000 (HIỆU, không phải 400.000 tổng).
    expect(s.annualExpenseMinor).toBe(200_000)
    expect(s.byCategory[0].categoryId).toBe('c-an')
    expect(s.byCategory[0].annualMinor).toBe(200_000)
    expect(s.byCategory[0].share).toBeCloseTo(1)
  })
})
