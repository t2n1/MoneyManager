import { describe, expect, it } from 'vitest'
import {
  buildImportPreview,
  parseAmountToMinor,
  parseCsvText,
  parseDateToISO,
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
