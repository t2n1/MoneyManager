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
})
