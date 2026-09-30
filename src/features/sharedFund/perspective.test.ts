import { describe, expect, it } from 'vitest'
import { applyPerspective, contributionsOf, parsePerspective, realRow } from './perspective'

const FUND = 'quy'
type R = Parameters<typeof applyPerspective>[0][number] & { id: string; amount: number }
let n = 0
const r = (o: Partial<R>): R => ({
  id: `t${n++}`,
  type: 'expense',
  amount: 1_000,
  owner: 'mine',
  account_id: 'bank',
  to_account_id: null,
  fund_part_id: null,
  category_id: 'an',
  to_amount: null,
  is_refund: false,
  ...o,
})

const luongMinh = r({ type: 'income', category_id: 'luong' })
const luongHanh = r({ type: 'income', category_id: 'luong', owner: 'partner', account_id: 'hanh' })
const chiMinh = r({})
const chiHanh = r({ owner: 'partner', account_id: 'hanh' })
const chiChung = r({ owner: 'shared' })
const gopMinh = r({ type: 'transfer', category_id: null, to_account_id: FUND, fund_part_id: 'nha', amount: 60_000 })
const gopHanh = r({ type: 'transfer', category_id: null, to_account_id: FUND, fund_part_id: 'nha', amount: 40_000, owner: 'partner', account_id: 'hanh' })
const gopKhongPhan = r({ type: 'transfer', category_id: null, to_account_id: FUND, amount: 5_000 })
const quyChi = r({ account_id: FUND, category_id: 'nha', amount: 100_000 })
const chuyenTaiKhoan = r({ type: 'transfer', category_id: null, to_account_id: 'tietkiem' })
const ALL = [luongMinh, luongHanh, chiMinh, chiHanh, chiChung, gopMinh, gopHanh, gopKhongPhan, quyChi, chuyenTaiKhoan]

describe('applyPerspective', () => {
  it('Cả nhà: nguyên sổ', () => {
    expect(applyPerspective(ALL, 'all', FUND)).toBe(ALL)
  })

  it('Mình: thu/chi của mình, khoản góp có phần thành chi vào danh mục của phần', () => {
    const v = applyPerspective(ALL, 'mine', FUND)
    expect(v.map((t) => t.id)).toEqual([luongMinh.id, chiMinh.id, gopMinh.id, gopKhongPhan.id, chuyenTaiKhoan.id])
    const gop = v.find((t) => t.id === gopMinh.id)!
    expect(gop).toMatchObject({ type: 'expense', category_id: 'nha', to_account_id: null, amount: 60_000, account_id: 'bank' })
    // góp không ghi phần: giữ là chuyển khoản — không bịa danh mục
    expect(v.find((t) => t.id === gopKhongPhan.id)!.type).toBe('transfer')
  })

  it('Người kia: chỉ phần của họ; khoản chung và dòng tiền của quỹ không vào góc riêng', () => {
    const v = applyPerspective(ALL, 'partner', FUND)
    expect(v.map((t) => t.id)).toEqual([luongHanh.id, chiHanh.id, gopHanh.id])
    expect(v[2]).toMatchObject({ type: 'expense', category_id: 'nha', amount: 40_000 })
  })

  it('dòng dựng trỏ về đúng dòng gốc để form sửa không sửa nhầm', () => {
    const dung = applyPerspective(ALL, 'mine', FUND).find((t) => t.id === gopMinh.id)!
    expect(realRow(dung)).toBe(gopMinh)
    expect(realRow(chiMinh)).toBe(chiMinh)
  })

  it('không đụng vào dòng gốc (hàm thuần)', () => {
    applyPerspective(ALL, 'mine', FUND)
    expect(gopMinh.type).toBe('transfer')
  })

  it('chế độ Sổ: khoản góp giữ nguyên là chuyển khoản', () => {
    const v = applyPerspective(ALL, 'mine', FUND, 'ledger')
    expect(v.find((t) => t.id === gopMinh.id)).toBe(gopMinh)
  })

  it('chưa đặt quỹ: chỉ lọc theo người', () => {
    const v = applyPerspective(ALL, 'mine', null)
    expect(v.every((t) => (t.owner ?? 'mine') === 'mine')).toBe(true)
    expect(v.find((t) => t.id === quyChi.id)).toBeDefined()
    expect(v.find((t) => t.id === gopMinh.id)!.type).toBe('transfer')
  })

  it('dòng cũ không có owner là của mình', () => {
    const cu = { ...chiMinh, id: 'cu', owner: undefined }
    expect(applyPerspective([cu], 'mine', FUND)).toHaveLength(1)
    expect(applyPerspective([cu], 'partner', FUND)).toHaveLength(0)
  })

  // Tổng chi góc Mình + góc người kia + phần riêng của cả nhà (quỹ chi, chung) phải là
  // cách chia sổ không trùng không sót: không dòng nào vào cả hai góc riêng.
  it('hai góc riêng không trùng dòng nào', () => {
    const a = new Set(applyPerspective(ALL, 'mine', FUND).map((t) => t.id))
    const b = applyPerspective(ALL, 'partner', FUND).map((t) => t.id)
    expect(b.filter((id) => a.has(id))).toEqual([])
  })
})

describe('contributionsOf', () => {
  it('chỉ chuyển khoản vào quỹ', () => {
    expect(contributionsOf(ALL, FUND).map((t) => t.id)).toEqual([gopMinh.id, gopHanh.id, gopKhongPhan.id])
    expect(contributionsOf(ALL, null)).toEqual([])
  })
})

describe('parsePerspective', () => {
  it('giá trị lạ về Cả nhà', () => {
    expect(parsePerspective('mine')).toBe('mine')
    expect(parsePerspective('x')).toBe('all')
    expect(parsePerspective(null)).toBe('all')
  })
})
