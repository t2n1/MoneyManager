import { describe, expect, it } from 'vitest'
import type { Rates } from '../../lib/rates'
import type { AccountBalanceRow } from '../../types/database.types'
import {
  assetBreakdown,
  assetTypeGroups,
  UNGROUPED_LABEL,
  type AssetGroupSetting,
} from './aggregate'

const setting = (
  name: string,
  p: Partial<Omit<AssetGroupSetting, 'name'>> = {},
): AssetGroupSetting => ({
  name,
  sortOrder: 0,
  includeInTotals: true,
  hidden: false,
  ...p,
})

// base = JPY: 1 ¥ = 165 ₫ = 0.0065 $
const RATES: Rates = { JPY: 1, VND: 165, USD: 0.0065 }

let seq = 0
function acc(p: Partial<AccountBalanceRow> & Pick<AccountBalanceRow, 'balance'>): AccountBalanceRow {
  return {
    id: `a${seq++}`,
    user_id: 'u',
    name: 'Tài khoản',
    type: 'bank',
    currency: 'JPY',
    asset_group: null,
    is_hidden: false,
    include_in_totals: true,
    credit_limit: null,
    payment_account_id: null,
    is_archived: false,
    sort_order: 0,
    ...p,
  }
}

describe('assetBreakdown (base = JPY)', () => {
  it('gộp số dư theo nhóm, quy đổi base, tính tỷ trọng', () => {
    const balances = [
      acc({ balance: 30_000, asset_group: 'Tiêu dùng' }),
      acc({ balance: 70_000, asset_group: 'Tiêu dùng' }),
      acc({ balance: 1_650_000, currency: 'VND', asset_group: 'Đầu tư' }), // → ¥10.000
    ]
    const r = assetBreakdown(balances, 'JPY', RATES)
    expect(r.total).toBe(110_000)
    expect(r.hasForeign).toBe(true)
    expect(r.hasMissingRate).toBe(false)
    expect(r.groups.map((g) => [g.name, g.total])).toEqual([
      ['Tiêu dùng', 100_000],
      ['Đầu tư', 10_000],
    ])
    expect(r.groups[0].share).toBeCloseTo(100_000 / 110_000)
  })

  it('tài khoản không có nhóm gộp vào "Chưa phân nhóm" và xếp cuối', () => {
    const balances = [
      acc({ balance: 5_000 }), // null → chưa phân nhóm
      acc({ balance: 100_000, asset_group: 'Đầu tư' }),
      acc({ balance: 1_000, asset_group: '  ' }), // chuỗi trắng → chưa phân nhóm
    ]
    const r = assetBreakdown(balances, 'JPY', RATES)
    expect(r.groups[0].name).toBe('Đầu tư')
    expect(r.groups[r.groups.length - 1].name).toBe(UNGROUPED_LABEL)
    expect(r.groups.find((g) => g.name === UNGROUPED_LABEL)?.total).toBe(6_000)
  })

  it('bỏ qua tài khoản đã lưu trữ', () => {
    const balances = [
      acc({ balance: 50_000, asset_group: 'Tiêu dùng' }),
      acc({ balance: 99_999, asset_group: 'Tiêu dùng', is_archived: true }),
    ]
    const r = assetBreakdown(balances, 'JPY', RATES)
    expect(r.total).toBe(50_000)
  })

  it('thiếu tỷ giá → đánh dấu hasMissingRate, không cộng vào tổng', () => {
    const balances = [
      acc({ balance: 30_000, asset_group: 'Tiêu dùng' }),
      acc({ balance: 200_000, currency: 'USD', asset_group: 'Dự phòng' }), // thiếu USD
    ]
    const r = assetBreakdown(balances, 'JPY', { JPY: 1, VND: 165 })
    expect(r.hasMissingRate).toBe(true)
    expect(r.total).toBe(30_000)
    const duPhong = r.groups.find((g) => g.name === 'Dự phòng')!
    expect(duPhong.total).toBe(0)
    expect(duPhong.hasMissingRate).toBe(true)
    expect(duPhong.accounts[0].baseValue).toBeNull()
  })

  it('nhóm includeInTotals=false: hiện riêng nhưng không cộng vào tổng', () => {
    const balances = [
      acc({ balance: 100_000, asset_group: 'Tiêu dùng' }),
      acc({ balance: 40_000, asset_group: 'Cho vay' }),
    ]
    const r = assetBreakdown(balances, 'JPY', RATES, [setting('Cho vay', { includeInTotals: false })])
    expect(r.total).toBe(100_000) // Cho vay bị loại
    const choVay = r.groups.find((g) => g.name === 'Cho vay')!
    expect(choVay.total).toBe(40_000) // vẫn có subtotal riêng
    expect(choVay.includeInTotals).toBe(false)
    expect(choVay.share).toBe(0)
  })

  it('nhóm hidden=true: vẫn trả về (để trang quản lý thấy) nhưng loại khỏi tổng', () => {
    const balances = [
      acc({ balance: 100_000, asset_group: 'Tiêu dùng' }),
      acc({ balance: 999_999, currency: 'USD', asset_group: 'Bí mật' }),
    ]
    // USD thiếu tỷ giá nhưng nhóm ẩn → KHÔNG được đánh dấu hasMissingRate cho tổng
    const r = assetBreakdown(balances, 'JPY', { JPY: 1, VND: 165 }, [setting('Bí mật', { hidden: true })])
    expect(r.total).toBe(100_000)
    expect(r.hasMissingRate).toBe(false)
    expect(r.hasForeign).toBe(false)
    expect(r.groups.find((g) => g.name === 'Bí mật')?.hidden).toBe(true)
  })

  it('tài khoản include_in_totals=false: không cộng vào tổng nhóm lẫn tổng chung', () => {
    const balances = [
      acc({ balance: 100_000, asset_group: 'Tiêu dùng' }),
      acc({ balance: 40_000, asset_group: 'Tiêu dùng', include_in_totals: false }),
    ]
    const r = assetBreakdown(balances, 'JPY', RATES)
    expect(r.total).toBe(100_000)
    const g = r.groups.find((x) => x.name === 'Tiêu dùng')!
    expect(g.total).toBe(100_000) // tài khoản ngoài-tổng bị loại khỏi total nhóm
    expect(g.accounts).toHaveLength(2) // nhưng vẫn có trong danh sách để hiển thị
  })

  it('tài khoản is_hidden=true: loại khỏi tổng, không đánh dấu thiếu tỷ giá', () => {
    const balances = [
      acc({ balance: 100_000, asset_group: 'Tiêu dùng' }),
      acc({ balance: 999_999, currency: 'USD', asset_group: 'Tiêu dùng', is_hidden: true }),
    ]
    const r = assetBreakdown(balances, 'JPY', { JPY: 1, VND: 165 }) // thiếu USD
    expect(r.total).toBe(100_000)
    expect(r.hasMissingRate).toBe(false)
    expect(r.hasForeign).toBe(false)
    const hidden = r.groups[0].accounts.find((a) => a.hidden)
    expect(hidden?.hidden).toBe(true)
  })

  it('tôn trọng thứ tự tùy chỉnh (sortOrder), Chưa phân nhóm vẫn cuối', () => {
    const balances = [
      acc({ balance: 10_000, asset_group: 'A' }),
      acc({ balance: 90_000, asset_group: 'B' }), // giá trị lớn hơn nhưng order sau
      acc({ balance: 5_000 }), // chưa phân nhóm
    ]
    const r = assetBreakdown(balances, 'JPY', RATES, [
      setting('A', { sortOrder: 0 }),
      setting('B', { sortOrder: 1 }),
    ])
    expect(r.groups.map((g) => g.name)).toEqual(['A', 'B', UNGROUPED_LABEL])
  })
})

describe('assetBreakdown — thẻ tín dụng (type=card)', () => {
  it('thẻ không lọt vào nhóm tài sản, không cộng vào Tổng tài sản', () => {
    const balances = [
      acc({ balance: 100_000, asset_group: 'Tiêu dùng' }),
      acc({ balance: -45_000, type: 'card', asset_group: null, credit_limit: 500_000 }),
    ]
    const r = assetBreakdown(balances, 'JPY', RATES)
    expect(r.total).toBe(100_000) // thẻ không kéo tụt Tổng tài sản
    expect(r.groups).toHaveLength(1)
    expect(r.cards).toHaveLength(1)
    expect(r.cardDebt).toBe(-45_000) // âm = đang nợ, để trừ vào Tài sản ròng
    expect(r.cards[0].creditLimit).toBe(500_000)
  })

  it('cộng dồn nhiều thẻ, quy đổi base; thẻ ngoại tệ thiếu tỷ giá → cardHasMissingRate', () => {
    const balances = [
      acc({ balance: -45_000, type: 'card' }), // JPY
      acc({ balance: -1_650_000, type: 'card', currency: 'VND' }), // → −¥10.000
      acc({ balance: -20_000, type: 'card', currency: 'USD' }), // thiếu tỷ giá
    ]
    const r = assetBreakdown(balances, 'JPY', { JPY: 1, VND: 165 })
    expect(r.cardDebt).toBe(-55_000) // −45.000 + −10.000; USD bỏ qua
    expect(r.cardHasMissingRate).toBe(true)
    expect(r.cards).toHaveLength(3)
  })

  it('thẻ ẩn hoặc ngoài-tổng: không trừ vào Tài sản ròng', () => {
    const balances = [
      acc({ balance: -30_000, type: 'card', is_hidden: true }),
      acc({ balance: -20_000, type: 'card', include_in_totals: false }),
      acc({ balance: -10_000, type: 'card' }),
    ]
    const r = assetBreakdown(balances, 'JPY', RATES)
    expect(r.cardDebt).toBe(-10_000) // chỉ thẻ thứ 3 được tính
    expect(r.cards).toHaveLength(3) // nhưng vẫn trả về đủ để hiển thị
  })

  it('bỏ qua thẻ đã lưu trữ', () => {
    const balances = [
      acc({ balance: -10_000, type: 'card' }),
      acc({ balance: -99_999, type: 'card', is_archived: true }),
    ]
    const r = assetBreakdown(balances, 'JPY', RATES)
    expect(r.cards).toHaveLength(1)
    expect(r.cardDebt).toBe(-10_000)
  })

  it('giữ tài khoản nguồn trả thẻ (paymentAccountId) trong CardLiability', () => {
    const balances = [
      acc({ balance: 800_000, id: 'bank1' }),
      acc({ balance: -45_000, type: 'card', payment_account_id: 'bank1' }),
    ]
    const r = assetBreakdown(balances, 'JPY', RATES)
    expect(r.cards[0].paymentAccountId).toBe('bank1')
  })
})

describe('assetTypeGroups (gom theo loại tài khoản)', () => {
  it('gom lại theo loại, xuyên nhóm mục đích, tổng lát == Tổng tài sản', () => {
    const balances = [
      acc({ balance: 30_000, type: 'bank', asset_group: 'Tiêu dùng' }),
      acc({ balance: 20_000, type: 'cash', asset_group: 'Tiêu dùng' }),
      acc({ balance: 50_000, type: 'bank', asset_group: 'Đầu tư' }),
    ]
    const r = assetBreakdown(balances, 'JPY', RATES)
    const t = assetTypeGroups(r)
    expect(t.map((g) => [g.name, g.total])).toEqual([
      ['Ngân hàng', 80_000], // 30.000 + 50.000, gộp hai nhóm mục đích
      ['Tiền mặt', 20_000],
    ])
    expect(t.reduce((s, g) => s + g.total, 0)).toBe(r.total)
    expect(t[0].share).toBeCloseTo(80_000 / 100_000)
  })

  it('thẻ tín dụng không xuất hiện (là công nợ, đã tách sang cards)', () => {
    const balances = [
      acc({ balance: 100_000, type: 'bank', asset_group: 'Tiêu dùng' }),
      acc({ balance: -45_000, type: 'card' }),
    ]
    const t = assetTypeGroups(assetBreakdown(balances, 'JPY', RATES))
    expect(t.map((g) => g.name)).toEqual(['Ngân hàng'])
  })

  it('loại tài khoản ẩn / ngoài-tổng / nhóm ngoài-tổng khỏi cơ cấu', () => {
    const balances = [
      acc({ balance: 100_000, type: 'bank', asset_group: 'Tiêu dùng' }),
      acc({ balance: 40_000, type: 'cash', asset_group: 'Tiêu dùng', is_hidden: true }),
      acc({ balance: 30_000, type: 'cash', asset_group: 'Tiêu dùng', include_in_totals: false }),
      acc({ balance: 999_000, type: 'bank', asset_group: 'Cho vay' }),
    ]
    const r = assetBreakdown(balances, 'JPY', RATES, [
      setting('Cho vay', { includeInTotals: false }),
    ])
    const t = assetTypeGroups(r)
    // chỉ còn 1 tài khoản ngân hàng 100.000 được tính
    expect(t.map((g) => [g.name, g.total])).toEqual([['Ngân hàng', 100_000]])
  })

  it('gom loại IC và Ví điện tử thành nhóm loại riêng', () => {
    const balances = [
      acc({ balance: 100_000, type: 'bank', asset_group: 'Tiêu dùng' }),
      acc({ balance: 3_000, type: 'ic', asset_group: 'Tiêu dùng' }),
      acc({ balance: 5_000, type: 'ewallet', asset_group: 'Tiêu dùng' }),
    ]
    const t = assetTypeGroups(assetBreakdown(balances, 'JPY', RATES))
    expect(t.map((g) => g.name).sort()).toEqual(['IC giao thông', 'Ngân hàng', 'Ví điện tử'])
    expect(t.find((g) => g.name === 'IC giao thông')!.total).toBe(3_000)
    expect(t.find((g) => g.name === 'Ví điện tử')!.total).toBe(5_000)
  })
})
