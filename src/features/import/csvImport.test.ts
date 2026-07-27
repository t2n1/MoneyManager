import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import {
  buildImportPreview,
  detectInternalTransfers,
  parseAmountToMinor,
  parseCsvText,
  parseDateToISO,
  type ImportItem,
  type ImportOptions,
} from './csvImport'

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
    const { items, skipped } = buildImportPreview(rows, opts)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ amount: 850, type: 'expense', note: 'Cơm trưa' })
    expect(items[1]).toMatchObject({ amount: 280000, type: 'income' })
    expect(skipped).toHaveLength(2) // 'sai' + amount 0
  })

  it('dòng chỉ có ghi chú được nối vào dòng trên, không tính là lỗi', () => {
    // Rakuten tách mỗi khoản ETC làm hai dòng: dòng trên có ngày + tiền, dòng dưới
    // chỉ có tên tuyến đường.
    const rows = [
      ['Ngày', 'Số tiền', 'Ghi chú'],
      ['2026-05-17', '-2040', 'ＥＴＣカード売上'],
      ['', '', 'ﾀｶｲﾄﾞﾎﾝｾﾝ  ｶﾜｸﾞﾁｺ'],
    ]
    const { items, skipped } = buildImportPreview(rows, opts)
    expect(skipped).toEqual([])
    expect(items).toHaveLength(1)
    expect(items[0].note).toBe('ＥＴＣカード売上 ﾀｶｲﾄﾞﾎﾝｾﾝ ｶﾜｸﾞﾁｺ')
  })

  it('hai khoản ETC cùng tiền khác tuyến đường → khoá nội dung khác nhau', () => {
    const rows = [
      ['Ngày', 'Số tiền', 'Ghi chú'],
      ['2026-03-14', '-260', 'ＥＴＣカード売上'],
      ['', '', 'ｵﾀﾞﾜﾗﾎﾝｾﾝ'],
      ['2026-03-14', '-260', 'ＥＴＣカード売上'],
      ['', '', 'ﾋﾗﾂｶﾎﾝｾﾝ'],
    ]
    const { items } = buildImportPreview(rows, opts)
    expect(items).toHaveLength(2)
    expect(items[0].key).not.toBe(items[1].key)
  })

  it('dòng trống hoàn toàn không phải lỗi', () => {
    const { items, skipped } = buildImportPreview(
      [['Ngày', 'Số tiền', 'Ghi chú'], ['2026-07-01', '-850', 'Cơm'], ['', '', '']],
      opts,
    )
    expect(items).toHaveLength(1)
    expect(skipped).toEqual([])
  })

  it('dòng chỉ có ghi chú mà chưa có dòng nào trước → vẫn là lỗi', () => {
    const { skipped } = buildImportPreview(
      [['Ngày', 'Số tiền', 'Ghi chú'], ['', '', 'lơ lửng']],
      opts,
    )
    expect(skipped).toEqual([{ line: 2, reason: 'date', label: 'lơ lửng' }])
  })

  it('ghi chú trống thì cảnh báo lấy nội dung ô ngày để nhận ra dòng', () => {
    // Khối "■ご利用キャンセルなど" của Rakuten nằm ở ô ngày, ô ghi chú trống
    const rows = [
      ['Ngày', 'Số tiền', 'Ghi chú'],
      ['2026-05-04', '-600', 'Amazon'],
      ['■ご利用キャンセルなど', '', ''],
    ]
    const { items, skipped } = buildImportPreview(rows, opts)
    expect(items).toHaveLength(1)
    expect(skipped).toEqual([{ line: 3, reason: 'date', label: '■ご利用キャンセルなど' }])
  })

  it('dòng bị bỏ được kể rõ: số dòng trong file, lý do, ghi chú', () => {
    const rows = [
      ['Ngày', 'Số tiền', 'Ghi chú'],
      ['2026-07-01', '-850', 'Cơm trưa'],
      ['', '3476', 'ＴＥＭＵ（再計算）'], // sao kê PayPay có dòng trống ô ngày
      ['2026-07-03', '', 'thiếu số tiền'],
      ['2026-07-04', '0', 'bằng không'],
    ]
    const { items, skipped } = buildImportPreview(rows, opts)
    expect(items).toHaveLength(1)
    // line = số dòng trong file (tính cả dòng tiêu đề) để người dùng mở file ra soi
    expect(skipped).toEqual([
      { line: 3, reason: 'date', label: 'ＴＥＭＵ（再計算）' },
      { line: 4, reason: 'amount', label: 'thiếu số tiền' },
      { line: 5, reason: 'zero', label: 'bằng không' },
    ])
  })

  it('không có dòng tiêu đề thì số dòng đếm từ 1', () => {
    const { skipped } = buildImportPreview([['', '100', 'X']], { ...opts, hasHeader: false })
    expect(skipped).toEqual([{ line: 1, reason: 'date', label: 'X' }])
  })

  it('hai dòng giống hệt nhau: cùng khoá nội dung nhưng khác rowId', () => {
    const rows = [
      ['Ngày', 'Số tiền', 'Ghi chú'],
      ['2026-06-29', '-10659', 'プレミアムバンダイ'],
      ['2026-06-29', '-10659', 'プレミアムバンダイ'],
    ]
    const { items } = buildImportPreview(rows, opts)
    expect(items).toHaveLength(2)
    // key theo nội dung → vẫn nhận ra khoản đã có trong sổ
    expect(items[0].key).toBe(items[1].key)
    // rowId theo dòng → tick và danh mục của hai dòng không dính nhau
    expect(items[0].rowId).not.toBe(items[1].rowId)
  })
})

describe('danh mục cho dòng CSV', () => {
  const cats = [
    { id: 'food', name: 'Ăn uống', type: 'expense' as const, is_archived: false },
    { id: 'traffic', name: 'Đi lại', type: 'expense' as const, is_archived: false },
    { id: 'salary', name: 'Lương', type: 'income' as const, is_archived: false },
    { id: 'old', name: 'Cũ rồi', type: 'expense' as const, is_archived: true },
    { id: 'khac-chi', name: 'Khác', type: 'expense' as const, is_archived: false },
    { id: 'khac-thu', name: 'Khác', type: 'income' as const, is_archived: false },
  ]
  const opts = (over: Partial<ImportOptions> = {}): ImportOptions => ({
    mapping: { date: 0, amount: 1, note: 2, category: 3 },
    dateOrder: 'ymd',
    hasHeader: true,
    negativeIsExpense: true,
    currency: 'JPY',
    categories: cats,
    fallback: { expense: 'khac-chi', income: 'khac-thu' },
    ...over,
  })
  const head = ['Ngày', 'Số tiền', 'Ghi chú', 'Danh mục']

  it('ghép tên trong file, bỏ qua hoa/thường và dấu', () => {
    const rows = [
      head,
      ['2026-07-01', '-850', 'Cơm trưa', 'ăn uống'],
      ['2026-07-02', '-300', 'Tàu', ' DI LAI '],
      ['2026-07-03', '280000', 'Tháng 7', 'Lương'],
    ]
    const { items } = buildImportPreview(rows, opts())
    expect(items.map((i) => i.category_id)).toEqual(['food', 'traffic', 'salary'])
    expect(items.every((i) => i.categorySource === 'file')).toBe(true)
  })

  it('tên lạ, ô trống, hoặc file không có cột danh mục → dùng danh mục mặc định', () => {
    const rows = [head, ['2026-07-01', '-850', 'Cơm', 'Linh tinh'], ['2026-07-02', '-100', 'X', '']]
    const withCol = buildImportPreview(rows, opts())
    expect(withCol.items.map((i) => i.category_id)).toEqual(['khac-chi', 'khac-chi'])
    expect(withCol.items.every((i) => i.categorySource === 'fallback')).toBe(true)

    const noCol = buildImportPreview(rows, opts({ mapping: { date: 0, amount: 1, note: 2 } }))
    expect(noCol.items.map((i) => i.category_id)).toEqual(['khac-chi', 'khac-chi'])
  })

  it('danh mục khớp tên nhưng sai chiều Chi/Thu → về mặc định', () => {
    // 'Lương' là danh mục Thu, dòng này là Chi → không được gắn
    const rows = [head, ['2026-07-01', '-850', 'Cơm', 'Lương']]
    const { items } = buildImportPreview(rows, opts())
    expect(items[0]).toMatchObject({ category_id: 'khac-chi', categorySource: 'fallback' })
  })

  it('danh mục đã lưu trữ không được dùng', () => {
    const rows = [head, ['2026-07-01', '-850', 'Cơm', 'Cũ rồi']]
    const { items } = buildImportPreview(rows, opts())
    expect(items[0].category_id).toBe('khac-chi')
  })

  it('file không có cột danh mục: đoán theo lịch sử rồi tới từ khoá', () => {
    const rows = [
      ['Ngày', 'Số tiền', 'Ghi chú'],
      ['2026-07-01', '-850', 'Family Mart'], // đã từng ghi → theo lịch sử
      ['2026-07-02', '-300', 'JR Suica charge'], // từ khoá 'suica' của Đi lại
      ['2026-07-03', '-500', 'Cửa hàng lạ'], // không nguồn nào → mặc định
    ]
    const { items } = buildImportPreview(
      rows,
      opts({
        mapping: { date: 0, amount: 1, note: 2 },
        categories: cats.map((c) =>
          c.id === 'traffic' ? { ...c, import_keywords: ['suica'] } : c,
        ),
        noteHistory: new Map([['expense|family mart', 'food']]),
      }),
    )
    expect(items.map((i) => [i.category_id, i.categorySource])).toEqual([
      ['food', 'history'],
      ['traffic', 'keyword'],
      ['khac-chi', 'fallback'],
    ])
  })

  it('chưa chọn danh mục mặc định → category_id null để UI chặn nhập', () => {
    const rows = [head, ['2026-07-01', '-850', 'Cơm', 'Linh tinh'], ['2026-07-02', '9000', 'Thu', '']]
    const { items } = buildImportPreview(rows, opts({ fallback: { expense: null, income: null } }))
    expect(items.map((i) => i.category_id)).toEqual([null, null])
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

  let row = 0
  const item = (
    occurred_on: string,
    amount: number,
    type: 'expense' | 'income',
  ): ImportItem => ({
    occurred_on,
    amount,
    type,
    note: '',
    category_id: 'c1',
    categorySource: 'fallback',
    key: `${occurred_on}|${type === 'expense' ? '-' : '+'}${amount}`,
    rowId: `r${row++}`,
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
    const som = item('2026-05-12', 50_000, 'expense')
    const found = detectInternalTransfers(
      [som, item('2026-05-10', 50_000, 'expense')],
      [etx({ id: 'only', type: 'income', amount: 50_000, occurred_on: '2026-05-10', account_id: 'save' })],
      opts,
    )
    expect(found).toHaveLength(1)
    // Dòng 12/5 xét trước và lệch 2 ngày, nhưng đã dùng hết giao dịch nên dòng 10/5 không còn
    expect(found[0].rowId).toBe(som.rowId)
  })

  it('hai dòng giống hệt nhau được kể riêng theo rowId', () => {
    const a = item('2026-05-10', 50_000, 'expense')
    const b = item('2026-05-10', 50_000, 'expense')
    const found = detectInternalTransfers(
      [a, b],
      [
        etx({ type: 'income', amount: 50_000, occurred_on: '2026-05-10', account_id: 'save' }),
        etx({ type: 'income', amount: 50_000, occurred_on: '2026-05-10', account_id: 'card' }),
      ],
      opts,
    )
    expect(found.map((f) => f.rowId)).toEqual([a.rowId, b.rowId])
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
