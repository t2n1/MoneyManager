import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { AccountType, TransactionRow } from '../../types/database.types'
import { ADJUST_CATEGORY_NAME } from '../categories/flowCategories'
import { dongChiChuaGhi, tinhChiChuaGhi, tongChiCoPhanChuaGhi } from './chiChuaGhi'

// base = JPY: 1 ¥ = 165 ₫
const RATES: Rates = { JPY: 1, VND: 165, USD: 0.0065 }

// Hai danh mục bù (mỗi chiều một cái, đúng như findAdjustCategory tạo ra) + một danh mục thật
const CATS = [
  { id: 'adjust-out', name: ADJUST_CATEGORY_NAME },
  { id: 'adjust-in', name: ADJUST_CATEGORY_NAME },
  { id: 'food', name: 'Cơm ngoài' },
]

const ACCS: { id: string; type: AccountType; currency: CurrencyCode }[] = [
  { id: 'vi', type: 'cash', currency: 'JPY' },
  { id: 'nh', type: 'bank', currency: 'JPY' },
  { id: 'the', type: 'card', currency: 'JPY' },
  { id: 'dt', type: 'investment', currency: 'JPY' },
  { id: 'vnd', type: 'cash', currency: 'VND' },
]

let seq = 0
function tx(p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount'>): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    category_id: null,
    account_id: 'vi',
    to_account_id: null,
    to_amount: null,
    recurring_rule_id: null,
    occurred_on: '2026-08-20',
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  }
}

/** Khoản bù chuẩn: exclude_from_stats + danh mục "Điều chỉnh số dư" đúng chiều. */
function bu(p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount'>): TransactionRow {
  return tx({
    exclude_from_stats: true,
    category_id: p.type === 'income' ? 'adjust-in' : 'adjust-out',
    ...p,
  })
}

const tinh = (txs: TransactionRow[]) => tinhChiChuaGhi(txs, CATS, ACCS, 'JPY', RATES)

describe('tinhChiChuaGhi', () => {
  it('ví tiền mặt, bù chiều chi → chưa ghi', () => {
    const r = tinh([bu({ type: 'expense', amount: 18_000 })])
    expect(r.net).toBe(18_000)
    expect(r.huong).toBe('chua_ghi')
    expect(r.soLanDoiChieu).toBe(1)
    expect(r.lanCuoiISO).toBe('2026-08-20')
  })

  it('bù chiều thu → ghi thừa, net âm', () => {
    const r = tinh([bu({ type: 'income', amount: 5_000 })])
    expect(r.net).toBe(-5_000)
    expect(r.huong).toBe('ghi_thua')
  })

  it('hai lần ngược chiều trong tháng thì bù trừ', () => {
    const r = tinh([
      bu({ type: 'expense', amount: 18_000, occurred_on: '2026-08-10' }),
      bu({ type: 'income', amount: 5_000, occurred_on: '2026-08-25' }),
    ])
    expect(r.net).toBe(13_000)
    expect(r.soLanDoiChieu).toBe(2)
    expect(r.lanCuoiISO).toBe('2026-08-25')
  })

  it('tài khoản ngân hàng cũng tính', () => {
    const r = tinh([bu({ type: 'expense', amount: 3_000, account_id: 'nh' })])
    expect(r.soLanDoiChieu).toBe(1)
    expect(r.net).toBe(3_000)
  })

  it('bù trên thẻ tín dụng bị loại — đó là lệch sao kê, không phải tiền mặt quên ghi', () => {
    const r = tinh([bu({ type: 'expense', amount: 40_000, account_id: 'the' })])
    expect(r.soLanDoiChieu).toBe(0)
    expect(r.net).toBe(0)
  })

  it('bù trên tài khoản đầu tư bị loại', () => {
    const r = tinh([bu({ type: 'expense', amount: 40_000, account_id: 'dt' })])
    expect(r.soLanDoiChieu).toBe(0)
  })

  it('exclude_from_stats nhưng danh mục khác thì KHÔNG tính', () => {
    const r = tinh([
      tx({ type: 'expense', amount: 9_999, category_id: 'food', exclude_from_stats: true }),
    ])
    expect(r.soLanDoiChieu).toBe(0)
    expect(r.net).toBe(0)
  })

  it('danh mục Điều chỉnh nhưng KHÔNG exclude_from_stats thì không tính', () => {
    const r = tinh([tx({ type: 'expense', amount: 7_000, category_id: 'adjust-out' })])
    expect(r.soLanDoiChieu).toBe(0)
  })

  it('thiếu tỷ giá → loại dòng, bật hasMissingRate, KHÔNG quy 1:1', () => {
    const r = tinhChiChuaGhi(
      [bu({ type: 'expense', amount: 1_000_000, account_id: 'vnd' })],
      CATS,
      ACCS,
      'JPY',
      { JPY: 1 } as Rates,
    )
    expect(r.net).toBe(0)
    expect(r.hasMissingRate).toBe(true)
    expect(r.soLanDoiChieu).toBe(0)
  })

  it('quy đổi ngoại tệ khi có tỷ giá', () => {
    const r = tinh([bu({ type: 'expense', amount: 1_650_000, account_id: 'vnd' })])
    expect(r.net).toBe(10_000)
    expect(r.hasMissingRate).toBe(false)
  })

  it('tháng trống', () => {
    const r = tinh([])
    expect(r.net).toBe(0)
    expect(r.huong).toBeNull()
    expect(r.soLanDoiChieu).toBe(0)
    expect(r.lanCuoiISO).toBeNull()
  })
})

describe('tongChiCoPhanChuaGhi', () => {
  it('không đối chiếu lần nào thì giữ nguyên tổng — "không biết" khác "bằng không"', () => {
    const r = tinh([])
    expect(tongChiCoPhanChuaGhi(303_936, r)).toBe(303_936)
  })

  it('có phần chưa ghi thì cộng vào', () => {
    const r = tinh([bu({ type: 'expense', amount: 18_000 })])
    expect(tongChiCoPhanChuaGhi(303_936, r)).toBe(321_936)
  })

  it('ghi thừa thì trừ ra', () => {
    const r = tinh([bu({ type: 'income', amount: 5_000 })])
    expect(tongChiCoPhanChuaGhi(303_936, r)).toBe(298_936)
  })
})

describe('dongChiChuaGhi', () => {
  it('không đối chiếu lần nào → null', () => {
    expect(dongChiChuaGhi(tinh([]))).toBeNull()
  })

  it('net bằng 0 dù có đối chiếu → null', () => {
    const r = tinh([bu({ type: 'expense', amount: 5_000 }), bu({ type: 'income', amount: 5_000 })])
    expect(r.soLanDoiChieu).toBe(2)
    expect(dongChiChuaGhi(r)).toBeNull()
  })

  it('chưa ghi → nhãn "Chưa ghi rõ", số dương', () => {
    expect(dongChiChuaGhi(tinh([bu({ type: 'expense', amount: 18_000 })]))).toEqual({
      nhan: 'Chưa ghi rõ',
      soTien: 18_000,
    })
  })

  it('ghi thừa → nhãn "Ghi thừa", số âm', () => {
    expect(dongChiChuaGhi(tinh([bu({ type: 'income', amount: 5_000 })]))).toEqual({
      nhan: 'Ghi thừa',
      soTien: -5_000,
    })
  })
})
