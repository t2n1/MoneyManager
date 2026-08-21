import { describe, expect, it } from 'vitest'
import type { Rates } from '../../lib/rates'
import type { AccountBalanceRow } from '../../types/database.types'
import {
  assetBreakdown,
  assetTypeGroups,
  cardFunding,
  UNGROUPED_LABEL,
  type AssetGroupSetting,
  type CardLiability,
  type CardSourceLike,
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
    statement_day: null,
    payment_due_day: null,
    payment_account_id: null,
    is_archived: false,
    sort_order: 0,
    cost_basis: 0,
    depreciation_months: null,
    depreciation_from: null,
    salvage_value: 0,
    tax_shelter: null,
    shelter_annual_limit: null,
    last_reconciled_at: null,
    market_value: null,
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

describe('assetBreakdown — tài khoản đầu tư (type=investment)', () => {
  it('chưa cập nhật giá: tính theo vốn gốc, lãi/lỗ = 0', () => {
    const balances = [
      acc({ balance: 100_000, asset_group: 'Tiêu dùng' }),
      acc({ balance: 1_000_000, type: 'investment', asset_group: 'Đầu tư' }), // market_value null
    ]
    const r = assetBreakdown(balances, 'JPY', RATES)
    expect(r.total).toBe(1_100_000) // đầu tư tính bằng vốn gốc khi chưa có giá
    expect(r.totalPnl).toBe(0)
    expect(r.pnlHasMissingRate).toBe(false)
    const inv = r.groups.find((g) => g.name === 'Đầu tư')!.accounts[0]
    expect(inv.value).toBe(1_000_000)
    expect(inv.marketValue).toBeNull()
    expect(inv.totalPnlBase).toBeNull()
  })

  it('đã cập nhật giá: Tổng tài sản dùng giá thị trường, lãi/lỗ = giá − vốn gốc', () => {
    const balances = [
      acc({ balance: 100_000, asset_group: 'Tiêu dùng' }),
      acc({ balance: 1_000_000, market_value: 1_250_000, type: 'investment', asset_group: 'Đầu tư' }),
    ]
    const r = assetBreakdown(balances, 'JPY', RATES)
    expect(r.total).toBe(1_350_000) // 100.000 + 1.250.000 (giá thị trường)
    expect(r.totalPnl).toBe(250_000)
    const inv = r.groups.find((g) => g.name === 'Đầu tư')!.accounts[0]
    expect(inv.value).toBe(1_250_000)
    expect(inv.marketValue).toBe(1_250_000)
    expect(inv.totalPnlBase).toBe(250_000)
  })

  it('lỗ chưa thực hiện: giá thị trường < vốn gốc', () => {
    const balances = [
      acc({ balance: 1_000_000, market_value: 900_000, type: 'investment', asset_group: 'Đầu tư' }),
    ]
    const r = assetBreakdown(balances, 'JPY', RATES)
    expect(r.total).toBe(900_000)
    expect(r.totalPnl).toBe(-100_000)
  })

  it('đầu tư ngoại tệ: quy đổi cả giá & vốn gốc về base rồi tính lãi/lỗ', () => {
    // VND: 1 ¥ = 165 ₫. Vốn gốc 1.650.000 ₫ → ¥10.000; giá 1.980.000 ₫ → ¥12.000
    const balances = [
      acc({ balance: 1_650_000, market_value: 1_980_000, currency: 'VND', type: 'investment', asset_group: 'Đầu tư' }),
    ]
    const r = assetBreakdown(balances, 'JPY', RATES)
    expect(r.total).toBe(12_000)
    expect(r.totalPnl).toBe(2_000)
    expect(r.hasForeign).toBe(true)
  })

  it('đầu tư có snapshot nhưng thiếu tỷ giá → pnlHasMissingRate, không cộng lãi/lỗ', () => {
    const balances = [
      acc({ balance: 100_000, asset_group: 'Tiêu dùng' }),
      acc({ balance: 200_000, market_value: 250_000, currency: 'USD', type: 'investment', asset_group: 'Đầu tư' }),
    ]
    const r = assetBreakdown(balances, 'JPY', { JPY: 1, VND: 165 }) // thiếu USD
    expect(r.total).toBe(100_000) // đầu tư USD không quy đổi được → không cộng
    expect(r.hasMissingRate).toBe(true)
    expect(r.pnlHasMissingRate).toBe(true)
    expect(r.totalPnl).toBe(0)
  })

  it('đầu tư ẩn: không cộng vào tổng lẫn lãi/lỗ', () => {
    const balances = [
      acc({ balance: 100_000, asset_group: 'Tiêu dùng' }),
      acc({ balance: 1_000_000, market_value: 1_300_000, type: 'investment', asset_group: 'Đầu tư', is_hidden: true }),
    ]
    const r = assetBreakdown(balances, 'JPY', RATES)
    expect(r.total).toBe(100_000)
    expect(r.totalPnl).toBe(0)
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

describe('cardFunding (nhiều thẻ chung một nguồn)', () => {
  const src = (p: Partial<CardSourceLike> & Pick<CardSourceLike, 'id' | 'balance'>): CardSourceLike => ({
    name: 'Ngân hàng',
    currency: 'JPY',
    ...p,
  })
  const card = (
    p: Partial<CardLiability> & Pick<CardLiability, 'id' | 'balance'>,
  ): CardLiability => ({
    name: 'Thẻ',
    currency: 'JPY',
    baseValue: p.balance,
    creditLimit: null,
    paymentDueDay: null,
    statementDay: null,
    paymentAccountId: null,
    includeInTotals: true,
    hidden: false,
    ...p,
  })

  it('2 thẻ chung 1 nguồn: mỗi thẻ riêng lẻ đều "đủ" nhưng cộng lại thiếu', () => {
    const sources = new Map([['bank', src({ id: 'bank', balance: 80_000 })]])
    const cards = [
      card({ id: 'c1', balance: -50_000, paymentAccountId: 'bank' }),
      card({ id: 'c2', balance: -60_000, paymentAccountId: 'bank' }),
    ]
    const { byCard, groups } = cardFunding(cards, sources)

    // c1 ăn trước → đủ; c2 chỉ còn 30k → thiếu 30k
    expect(byCard.get('c1')).toMatchObject({ enough: true, shortfall: 0, shared: true })
    expect(byCard.get('c2')).toMatchObject({ enough: false, shortfall: 30_000, shared: true })

    // Tổng thiếu từng thẻ == thiếu gộp của nguồn
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      totalOwed: 110_000,
      sourceBalance: 80_000,
      shortfall: 30_000,
      enough: false,
      cardCount: 2,
      owingCount: 2,
    })
    const perCardShortfall = [...byCard.values()].reduce((s, f) => s + f.shortfall, 0)
    expect(perCardShortfall).toBe(groups[0].shortfall)
  })

  it('đủ tiền cho cả hai thẻ → cả hai "đủ", nguồn đủ', () => {
    const sources = new Map([['bank', src({ id: 'bank', balance: 200_000 })]])
    const cards = [
      card({ id: 'c1', balance: -50_000, paymentAccountId: 'bank' }),
      card({ id: 'c2', balance: -60_000, paymentAccountId: 'bank' }),
    ]
    const { byCard, groups } = cardFunding(cards, sources)
    expect(byCard.get('c1')!.enough).toBe(true)
    expect(byCard.get('c2')!.enough).toBe(true)
    expect(groups[0].enough).toBe(true)
    expect(groups[0].shortfall).toBe(0)
  })

  it('một thẻ một nguồn: shared=false, badge như cũ', () => {
    const sources = new Map([['bank', src({ id: 'bank', balance: 40_000 })]])
    const cards = [card({ id: 'c1', balance: -50_000, paymentAccountId: 'bank' })]
    const { byCard, groups } = cardFunding(cards, sources)
    expect(byCard.get('c1')).toMatchObject({ shared: false, enough: false, shortfall: 10_000 })
    expect(groups[0].cardCount).toBe(1)
  })

  it('bỏ qua thẻ không có nguồn hoặc nguồn khác currency', () => {
    const sources = new Map([['bank', src({ id: 'bank', currency: 'JPY', balance: 100_000 })]])
    const cards = [
      card({ id: 'c1', balance: -10_000, paymentAccountId: null }), // không nguồn
      card({ id: 'c2', balance: -10_000, currency: 'VND', paymentAccountId: 'bank' }), // lệch currency
      card({ id: 'c3', balance: -10_000, paymentAccountId: 'missing' }), // nguồn không tồn tại
    ]
    const { byCard, groups } = cardFunding(cards, sources)
    expect(byCard.size).toBe(0)
    expect(groups).toHaveLength(0)
  })
})

// Nhóm ĐỨNG NGOÀI TỔNG: `total` bỏ qua tài khoản không tính-vào-tổng nên nó bằng 0,
// trong khi nhóm vẫn giữ tiền thật. Đầu nhóm phải in được số thật (AssetsNowView đọc
// `nativeTotal`/`rawTotal`), nếu không thì một khối vừa hiện "¥0" vừa liệt kê mấy trăm
// triệu — hai câu trái nhau, và người đọc không biết tin dòng nào.
describe('tổng của nhóm đứng ngoài tổng', () => {
  it('total = 0 nhưng rawTotal giữ số thật, nativeTotal in bằng tiền gốc', () => {
    const balances = [
      acc({ balance: 199_554_545, currency: 'VND', asset_group: 'Ngân hàng VN', include_in_totals: false }),
      acc({ balance: 100_000, asset_group: 'Tiêu dùng' }),
    ]
    const b = assetBreakdown(balances, 'JPY', RATES, [
      setting('Ngân hàng VN', { includeInTotals: false }),
    ])
    const vn = b.groups.find((g) => g.name === 'Ngân hàng VN')!
    expect(vn.total, 'không cộng vào tổng → 0').toBe(0)
    expect(vn.rawTotal, 'tổng thô quy đổi base').toBeCloseTo(199_554_545 / 165, 0)
    expect(vn.nativeCurrency).toBe('VND')
    expect(vn.nativeTotal).toBe(199_554_545)
    // Tổng tài sản KHÔNG được đổi vì nhóm này đứng ngoài — đây là điều kiện để cái
    // trên là bản sửa cách HIỂN THỊ, không phải sửa phép cộng.
    expect(b.total).toBe(100_000)
  })

  it('nhóm nhiều loại tiền → không có số gốc nào để in (nativeTotal null)', () => {
    const b = assetBreakdown(
      [
        acc({ balance: 165_000, currency: 'VND', asset_group: 'Hỗn hợp', include_in_totals: false }),
        acc({ balance: 2_000, asset_group: 'Hỗn hợp', include_in_totals: false }),
      ],
      'JPY',
      RATES,
      [setting('Hỗn hợp', { includeInTotals: false })],
    )
    const g = b.groups.find((x) => x.name === 'Hỗn hợp')!
    expect(g.nativeCurrency).toBeNull()
    expect(g.nativeTotal).toBeNull()
    expect(g.rawTotal, 'vẫn cộng được sau khi quy đổi').toBe(3_000)
  })

  it('tài khoản ẩn không lọt vào rawTotal', () => {
    const b = assetBreakdown(
      [
        acc({ balance: 5_000, asset_group: 'Ngoài', include_in_totals: false }),
        acc({ balance: 9_000, asset_group: 'Ngoài', include_in_totals: false, is_hidden: true }),
      ],
      'JPY',
      RATES,
      [setting('Ngoài', { includeInTotals: false })],
    )
    const g = b.groups.find((x) => x.name === 'Ngoài')!
    expect(g.rawTotal).toBe(5_000)
    expect(g.nativeTotal).toBe(5_000)
  })
})

describe('nhóm ĐỨNG NGOÀI TỔNG — không được in ¥0 cạnh một delta khác 0 (B5)', () => {
  const outside = (name: string) => setting(name, { includeInTotals: false })

  it('thiếu tỷ giá: rawTotal collapse về 0 nhưng nativeTotals vẫn giữ SỐ GỐC', () => {
    const balances = [
      acc({ balance: 199_554_545, currency: 'VND', asset_group: 'Ngân hàng VN' }),
    ]
    // KHÔNG có tỷ giá VND → baseValue null.
    const r = assetBreakdown(balances, 'JPY', { JPY: 1 }, [outside('Ngân hàng VN')])
    const g = r.groups.find((x) => x.name === 'Ngân hàng VN')!
    expect(g.rawTotal).toBe(0) // đây chính là con số đã in ra "¥0"
    expect(g.rawHasMissingRate).toBe(true)
    expect(g.nativeTotals).toEqual([{ currency: 'VND', amount: 199_554_545 }])
  })

  it('nhóm NHIỀU loại tiền: nativeTotal null nhưng nativeTotals có đủ từng loại', () => {
    const balances = [
      acc({ balance: 199_554_545, currency: 'VND', asset_group: 'Ngoài tổng' }),
      acc({ balance: 50_000, currency: 'JPY', asset_group: 'Ngoài tổng' }),
    ]
    const r = assetBreakdown(balances, 'JPY', RATES, [outside('Ngoài tổng')])
    const g = r.groups.find((x) => x.name === 'Ngoài tổng')!
    expect(g.nativeCurrency).toBeNull()
    expect(g.nativeTotal).toBeNull()
    // Sắp giảm dần theo giá trị tuyệt đối của SỐ GỐC.
    expect(g.nativeTotals).toEqual([
      { currency: 'VND', amount: 199_554_545 },
      { currency: 'JPY', amount: 50_000 },
    ])
  })

  it('nhóm một loại tiền vẫn khớp nativeTotal cũ', () => {
    const balances = [
      acc({ balance: 100_000, currency: 'VND', asset_group: 'VN' }),
      acc({ balance: 50_000, currency: 'VND', asset_group: 'VN' }),
    ]
    const g = assetBreakdown(balances, 'JPY', RATES, [outside('VN')]).groups.find(
      (x) => x.name === 'VN',
    )!
    expect(g.nativeCurrency).toBe('VND')
    expect(g.nativeTotal).toBe(150_000)
    expect(g.nativeTotals).toEqual([{ currency: 'VND', amount: 150_000 }])
  })

  it('tài khoản ẩn không vào nativeTotals (cùng bộ lọc với rawTotal)', () => {
    const balances = [
      acc({ balance: 100_000, currency: 'VND', asset_group: 'VN' }),
      acc({ balance: 900_000, currency: 'VND', asset_group: 'VN', is_hidden: true }),
    ]
    const g = assetBreakdown(balances, 'JPY', RATES, [outside('VN')]).groups.find(
      (x) => x.name === 'VN',
    )!
    expect(g.nativeTotals).toEqual([{ currency: 'VND', amount: 100_000 }])
  })
})
