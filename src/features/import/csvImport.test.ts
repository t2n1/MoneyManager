import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import {
  buildImportPreview,
  detectColumnMapping,
  detectInternalTransfers,
  parseAmountToMinor,
  parseCsvText,
  parseDateToISO,
  type ImportItem,
  type ImportOptions,
} from './csvImport'

/**
 * Tự đoán cột theo NỘI DUNG: cột ngày = nhiều ô đọc ra ngày nhất, cột tiền =
 * cột số đầu tiên còn lại, cột ghi chú = cột chữ nhiều nhất. Trước đây mặc định
 * cứng 0/1/2 nên với sao kê thật (PayPay tiền ở cột 6, Rakuten cột 5) luôn sai,
 * người dùng lần nào cũng phải tự trỏ lại.
 */
describe('detectColumnMapping', () => {
  it('kiểu Rakuten: ngày cột 0, chữ ở giữa, tiền ở cột 4', () => {
    const rows = [
      ['利用日', '利用店名', '利用者', '支払方法', '利用金額'],
      ['2026/07/01', 'コンビニ', '本人', '1回', '580'],
      ['2026/07/02', 'スーパー', '本人', '1回', '1,230'],
      ['2026/07/03', '駅売店', '本人', '1回', '210'],
    ]
    expect(detectColumnMapping(rows, true)).toEqual({ date: 0, amount: 4, note: 1 })
  })

  it('tiền nằm giữa hai cột chữ vẫn tìm ra', () => {
    const rows = [
      ['日付', '金額', '内容'],
      ['2026/07/01', '580', 'コンビニ'],
      ['2026/07/02', '210', '電車'],
    ]
    expect(detectColumnMapping(rows, true)).toEqual({ date: 0, amount: 1, note: 2 })
  })

  it('hai cột số (tiền + số dư): lấy cột số ĐẦU TIÊN sau khi loại cột ngày', () => {
    const rows = [
      ['日付', '内容', '金額', '残高'],
      ['2026/07/01', 'ATM', '-10000', '90000'],
      ['2026/07/02', '給料', '280000', '370000'],
    ]
    expect(detectColumnMapping(rows, true)).toEqual({ date: 0, amount: 2, note: 1 })
  })

  it('không có cột ngày nào đọc được → null (giữ mặc định cũ)', () => {
    const rows = [
      ['a', 'b'],
      ['xin chào', 'thế giới'],
      ['không', 'ngày tháng'],
    ]
    expect(detectColumnMapping(rows, true)).toBeNull()
  })

  it('không có tiêu đề: hasHeader=false vẫn đoán được', () => {
    const rows = [
      ['2026/07/01', '580', 'コンビニ'],
      ['2026/07/02', '210', '電車'],
    ]
    expect(detectColumnMapping(rows, false)).toEqual({ date: 0, amount: 1, note: 2 })
  })

  it('chỉ có ngày + tiền (2 cột): ghi chú trỏ về cột tiền, không nổ', () => {
    const rows = [
      ['日付', '金額'],
      ['2026/07/01', '580'],
      ['2026/07/02', '210'],
    ]
    expect(detectColumnMapping(rows, true)).toEqual({ date: 0, amount: 1, note: 1 })
  })
})

describe('parseCsvText', () => {
  it('bóc tách trường bọc nháy có phẩy bên trong', () => {
    const rows = parseCsvText('a,b,c\r\n"x,y",2,"say ""hi"""\n')
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x,y', '2', 'say "hi"'],
    ])
  })
  it('bỏ BOM đầu file + dòng trống', () => {
    const rows = parseCsvText('﻿a,b\n\n1,2\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('parseDateToISO', () => {
  it('ymd và dmy', () => {
    expect(parseDateToISO('2026/07/20', 'ymd')).toBe('2026-07-20')
    expect(parseDateToISO('20/07/2026', 'dmy')).toBe('2026-07-20')
    expect(parseDateToISO('07/20/2026', 'mdy')).toBe('2026-07-20')
  })
  it('năm 2 chữ số + ngày sai → null', () => {
    expect(parseDateToISO('26-07-20', 'ymd')).toBe('2026-07-20')
    expect(parseDateToISO('linh tinh', 'ymd')).toBeNull()
    expect(parseDateToISO('2026/13/40', 'ymd')).toBeNull()
  })
  it('ngày không tồn tại trong tháng → null', () => {
    expect(parseDateToISO('2026/02/30', 'ymd')).toBeNull()
    expect(parseDateToISO('2026/04/31', 'ymd')).toBeNull()
    expect(parseDateToISO('2024/02/29', 'ymd')).toBe('2024-02-29') // năm nhuận
  })
})

describe('parseAmountToMinor', () => {
  it('JPY nguyên có phân cách nghìn', () => {
    expect(parseAmountToMinor('1,234', 'JPY')).toBe(1234)
    expect(parseAmountToMinor('¥ 12,000', 'JPY')).toBe(12000)
    expect(parseAmountToMinor('-3,500', 'JPY')).toBe(-3500)
  })
  it('USD 2 số lẻ, phân biệt dấu thập phân', () => {
    expect(parseAmountToMinor('1,234.56', 'USD')).toBe(123456)
    expect(parseAmountToMinor('1.234,56', 'USD')).toBe(123456)
  })
  it('rỗng → null', () => {
    expect(parseAmountToMinor('', 'JPY')).toBeNull()
  })
})

describe('buildImportPreview', () => {
  const opts: ImportOptions = {
    mapping: { date: 0, amount: 1, note: 2 },
    dateOrder: 'ymd',
    hasHeader: true,
    negativeIsExpense: true,
    currency: 'JPY',
  }
  it('chuẩn hóa dấu → type, bỏ dòng lỗi', () => {
    const rows = [
      ['Ngày', 'Số tiền', 'Ghi chú'],
      ['2026-07-01', '-850', 'Cơm trưa'],
      ['2026-07-02', '280000', 'Lương'],
      ['sai', 'x', 'lỗi'],
      ['2026-07-03', '0', 'không tính'],
    ]
    const { items, errorCount } = buildImportPreview(rows, opts)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ amount: 850, type: 'expense', note: 'Cơm trưa' })
    expect(items[1]).toMatchObject({ amount: 280000, type: 'income' })
    expect(errorCount).toBe(2) // 'sai' + amount 0
  })
})

describe('detectInternalTransfers', () => {
  let seq = 0
  const etx = (
    p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount' | 'occurred_on' | 'account_id'>,
  ): TransactionRow => ({
    id: `e${seq++}`,
    user_id: 'u',
    to_amount: null,
    category_id: 'c1',
    to_account_id: null,
    recurring_rule_id: null,
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  })

  const item = (
    occurred_on: string,
    amount: number,
    type: 'expense' | 'income',
  ): ImportItem => ({
    occurred_on,
    amount,
    type,
    note: '',
    key: `${occurred_on}|${type === 'expense' ? '-' : '+'}${amount}`,
  })

  const opts = {
    importingAccountId: 'bank',
    candidateAccountIds: new Set(['card', 'save']),
  }

  it('chi ở sao kê khớp với khoản thu cùng số tiền ở tài khoản khác', () => {
    const found = detectInternalTransfers(
      [item('2026-05-10', 50_000, 'expense')],
      [etx({ id: 'x', type: 'income', amount: 50_000, occurred_on: '2026-05-10', account_id: 'save' })],
      opts,
    )
    expect(found).toHaveLength(1)
    expect(found[0].matchedTxId).toBe('x')
    expect(found[0].dayGap).toBe(0)
  })

  it('chấp nhận lệch vài ngày nhưng không quá cửa sổ', () => {
    const near = detectInternalTransfers(
      [item('2026-05-13', 50_000, 'expense')],
      [etx({ type: 'income', amount: 50_000, occurred_on: '2026-05-10', account_id: 'save' })],
      opts,
    )
    expect(near).toHaveLength(1)

    const far = detectInternalTransfers(
      [item('2026-05-20', 50_000, 'expense')],
      [etx({ type: 'income', amount: 50_000, occurred_on: '2026-05-10', account_id: 'save' })],
      opts,
    )
    expect(far).toEqual([])
  })

  it('cùng chiều (chi ⇄ chi) không phải chuyển khoản', () => {
    const found = detectInternalTransfers(
      [item('2026-05-10', 50_000, 'expense')],
      [etx({ type: 'expense', amount: 50_000, occurred_on: '2026-05-10', account_id: 'save' })],
      opts,
    )
    expect(found).toEqual([])
  })

  it('giao dịch loại chuyển khoản khớp cả hai chiều', () => {
    const found = detectInternalTransfers(
      [item('2026-05-10', 50_000, 'income')],
      [
        etx({
          type: 'transfer',
          amount: 50_000,
          occurred_on: '2026-05-10',
          account_id: 'save',
          category_id: null,
          to_account_id: 'bank',
        }),
      ],
      opts,
    )
    expect(found).toHaveLength(1)
  })

  it('bỏ qua tài khoản không nằm trong danh sách ứng viên (khác loại tiền)', () => {
    const found = detectInternalTransfers(
      [item('2026-05-10', 50_000, 'expense')],
      [etx({ type: 'income', amount: 50_000, occurred_on: '2026-05-10', account_id: 'usd-acc' })],
      opts,
    )
    expect(found).toEqual([])
  })

  it('bỏ qua chính tài khoản đang nhập (tránh tự khớp với chính mình)', () => {
    const found = detectInternalTransfers(
      [item('2026-05-10', 50_000, 'expense')],
      [etx({ type: 'income', amount: 50_000, occurred_on: '2026-05-10', account_id: 'bank' })],
      { ...opts, candidateAccountIds: new Set(['bank', 'save']) },
    )
    expect(found).toEqual([])
  })

  it('một giao dịch chỉ khớp một dòng, ưu tiên lệch ngày ít nhất', () => {
    const found = detectInternalTransfers(
      [item('2026-05-12', 50_000, 'expense'), item('2026-05-10', 50_000, 'expense')],
      [etx({ id: 'only', type: 'income', amount: 50_000, occurred_on: '2026-05-10', account_id: 'save' })],
      opts,
    )
    expect(found).toHaveLength(1)
    // Dòng 12/5 xét trước và lệch 2 ngày, nhưng đã dùng hết giao dịch nên dòng 10/5 không còn
    expect(found[0].key).toBe('2026-05-12|-50000')
  })

  it('số tiền khác nhau thì không khớp', () => {
    const found = detectInternalTransfers(
      [item('2026-05-10', 50_000, 'expense')],
      [etx({ type: 'income', amount: 49_999, occurred_on: '2026-05-10', account_id: 'save' })],
      opts,
    )
    expect(found).toEqual([])
  })
})
