import { describe, expect, it } from 'vitest'
import { detectStatementFormat } from './statementFormat'

const PAYPAY_HEADER = [
  '利用日/キャンセル日',
  '利用店名・商品名',
  '利用者',
  '決済方法',
  '支払区分',
  '利用金額',
  '手数料',
  '支払総額',
]

describe('detectStatementFormat', () => {
  it('nhận ra sao kê PayPay từ dòng tiêu đề', () => {
    const f = detectStatementFormat([PAYPAY_HEADER, ['2025/8/1', '串かつ　でんがな', '本人*', 'PayPayクレジット', '1回', '7373']])
    expect(f?.id).toBe('paypay')
  })

  it('PayPay ghi khoản MUA là số dương — chiều tiền phải đặt ngược mặc định', () => {
    expect(detectStatementFormat([PAYPAY_HEADER])?.negativeIsExpense).toBe(false)
  })

  it('file lạ thì không nhận, giữ nguyên lựa chọn của người dùng', () => {
    const f = detectStatementFormat([['日付', '摘要', 'お引出し', 'お預入れ', '残高']])
    expect(f).toBeNull()
  })

  it('file rỗng không làm vỡ', () => {
    expect(detectStatementFormat([])).toBeNull()
  })

  const RAKUTEN_HEADER = [
    '﻿利用日', '利用店名・商品名', '利用者', '支払方法', '利用金額',
    '手数料/利息', '支払総額', '7月支払金額', '当月請求額', '8月繰越残高', '新規サイン',
  ]

  it('nhận ra sao kê Rakuten e-NAVI từ dòng tiêu đề, khoản mua là số dương', () => {
    const f = detectStatementFormat([RAKUTEN_HEADER])
    expect(f?.id).toBe('rakuten')
    expect(f?.negativeIsExpense).toBe(false)
  })

  it('Rakuten và PayPay không nhận nhầm nhau', () => {
    expect(detectStatementFormat([PAYPAY_HEADER])?.id).toBe('paypay')
    expect(detectStatementFormat([RAKUTEN_HEADER])?.id).not.toBe('paypay')
  })

  /** Header 12 cột như enavi202609(3737): không có 新規サイン (đã bị thay bằng 支払月 / N月以降請求額). */
  const RAKUTEN_HEADER_12 = [
    '﻿利用日', '利用店名・商品名', '利用者', '支払方法', '利用金額',
    '手数料/利息', '支払総額', '支払月', '9月支払金額', '当月請求額', '10月繰越残高', '10月以降請求額',
  ]

  it('nhận ra header 12 cột không có 新規サイン là Rakuten', () => {
    expect(detectStatementFormat([RAKUTEN_HEADER_12])?.id).toBe('rakuten')
  })
})
