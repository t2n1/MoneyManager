import { describe, expect, it } from 'vitest'
import type { ImportItem } from './csvImport'
import {
  groupByMerchant,
  guessCategoryForMerchants,
  isTopUp,
  normalizeMerchant,
  type CategoryLike,
  type HistoryTx,
} from './merchantCategory'

const item = (note: string, amount = 100): ImportItem => ({
  occurred_on: '2026-02-10',
  amount,
  type: 'expense',
  note,
  key: `2026-02-10|-${amount}|${note}`,
})

describe('normalizeMerchant', () => {
  it('quy chữ rộng về chữ hẹp', () => {
    expect(normalizeMerchant('ＴＥＭＵ')).toBe('temu')
  })

  it('hai cách viết セブン-イレブン / セブンーイレブン về cùng một chuỗi', () => {
    expect(normalizeMerchant('セブン-イレブン')).toBe(normalizeMerchant('セブンーイレブン'))
  })

  it('bỏ khoảng trắng rộng giữa tên quán', () => {
    expect(normalizeMerchant('串かつ　でんがな')).toBe('串かつでんがな')
  })
})

describe('groupByMerchant', () => {
  it('gom dòng cùng quán, nhóm nhiều dòng nhất lên đầu', () => {
    const groups = groupByMerchant([
      item('ＴＥＭＵ', 1_000),
      item('セブン-イレブン', 500),
      item('ＴＥＭＵ', 2_000),
      item('セブンーイレブン', 300),
      item('ＴＥＭＵ', 3_000),
    ])
    expect(groups[0].merchant).toBe('ＴＥＭＵ')
    expect(groups[0].count).toBe(3)
    expect(groups[0].total).toBe(6_000)
    expect(groups[0].indexes).toEqual([0, 2, 4])
    // Hai cách viết セブン rơi vào cùng một nhóm.
    expect(groups[1].count).toBe(2)
    expect(groups[1].total).toBe(800)
  })
})

describe('isTopUp', () => {
  it('チャージ là nạp ví, không phải tiêu tiền', () => {
    expect(isTopUp('チャージ')).toBe(true)
  })

  it('ChargeSPOT là thuê pin, KHÔNG phải nạp ví', () => {
    expect(isTopUp('ＣｈａｒｇｅＳＰＯＴ　（ミ')).toBe(false)
  })
})

describe('guessCategoryForMerchants', () => {
  const cats: CategoryLike[] = [
    { id: 'com', name: 'Cơm ngoài' },
    { id: 'cho', name: 'Đi chợ' },
    { id: 'gas', name: 'Gas' },
    { id: 'xe', name: 'Thuê xe & đỗ xe' },
    { id: 'muasam', name: 'Mua sắm' },
  ]
  const tx = (note: string, category_id: string | null): HistoryTx => ({
    note,
    category_id,
    type: 'expense',
  })

  it('bảng dựng sẵn: セブンイレブン → Đi chợ', () => {
    const g = guessCategoryForMerchants(['セブン-イレブン'], [], cats)
    expect(g.get('セブン-イレブン')).toEqual({ categoryId: 'cho', source: 'builtin' })
  })

  it('từ khóa DÀI thắng từ khóa ngắn: ガスト là quán ăn, không phải tiền ga', () => {
    const g = guessCategoryForMerchants(['ガスト', '東京ガス'], [], cats)
    expect(g.get('ガスト')?.categoryId).toBe('com')
    expect(g.get('東京ガス')?.categoryId).toBe('gas')
  })

  it('lấy danh mục ứng viên tiếp theo khi người dùng không có cái đầu tiên', () => {
    // Không có "Ăn vặt & Cafe" → rơi xuống "Cơm ngoài".
    const g = guessCategoryForMerchants(['スターバックス'], [], cats)
    expect(g.get('スターバックス')?.categoryId).toBe('com')
  })

  it('sổ của người dùng THẮNG bảng dựng sẵn', () => {
    const g = guessCategoryForMerchants(
      ['セブン-イレブン'],
      [tx('セブンーイレブン', 'com'), tx('セブンーイレブン', 'com')],
      cats,
    )
    expect(g.get('セブン-イレブン')).toEqual({ categoryId: 'com', source: 'history' })
  })

  it('học được quán lạ từ sổ — đây là cách lần nhập sau tự điền', () => {
    const g = guessCategoryForMerchants(['ＴＥＭＵ'], [tx('ＴＥＭＵ', 'muasam')], cats)
    expect(g.get('ＴＥＭＵ')).toEqual({ categoryId: 'muasam', source: 'history' })
  })

  it('quán bán đủ thứ, chưa có trong sổ → KHÔNG đoán bừa', () => {
    const g = guessCategoryForMerchants(['ＴＥＭＵ'], [], cats)
    expect(g.has('ＴＥＭＵ')).toBe(false)
  })

  it('bỏ qua khoản cũ chưa gắn danh mục', () => {
    const g = guessCategoryForMerchants(['謎の店'], [tx('謎の店', null)], cats)
    expect(g.has('謎の店')).toBe(false)
  })

  it('bỏ qua danh mục đã bị xóa khỏi sổ', () => {
    const g = guessCategoryForMerchants(['謎の店'], [tx('謎の店', 'da-xoa')], cats)
    expect(g.has('謎の店')).toBe(false)
  })

  it('danh mục hay dùng nhất cho quán đó thắng', () => {
    const g = guessCategoryForMerchants(
      ['謎の店'],
      [tx('謎の店', 'com'), tx('謎の店', 'cho'), tx('謎の店', 'cho')],
      cats,
    )
    expect(g.get('謎の店')?.categoryId).toBe('cho')
  })
})
