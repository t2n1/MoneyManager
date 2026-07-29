import { describe, expect, it } from 'vitest'
import { buildYearCsv } from './yearCsv'
import type { YearRow } from './project'

const row: YearRow = {
  year: 2029,
  age: 35,
  country: 'US',
  phaseLabel: 'Mỹ',
  incomeMinor: 14_250_000,
  expenseMinor: 9_300_000,
  events: [
    { id: 'e1', label: 'Sang Mỹ', kind: 'expense', amountDisplayMinor: 2_500_000 },
    { id: 'e2', label: '年金', kind: 'income', amountDisplayMinor: 1_100_000 },
  ],
  netFlowMinor: 3_550_000,
  assetsEndMinor: 21_000_000,
  assetsPessimisticMinor: 20_000_000,
  assetsOptimisticMinor: 22_000_000,
}

describe('buildYearCsv', () => {
  // BOM + CRLF là bắt buộc (giống reports/csv.ts): tiêu đề cột không dấu nhưng THÂN
  // file vẫn có dấu (nhãn sự kiện, tên chặng), thiếu BOM thì Excel vẫn hỏng font ở thân.
  it('có BOM UTF-8, xuống dòng CRLF, dòng đầu là tiêu đề cột KHÔNG DẤU', () => {
    const csv = buildYearCsv([row], 'JPY')
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe(
      'Nam,Tuoi,Noi o,Thu,Chi,Su kien,Tai san cuoi nam,Bi quan,Lac quan,Loai tien',
    )
  })

  it('gộp nhiều sự kiện trong một ô, phân cách bằng dấu chấm phẩy', () => {
    const csv = buildYearCsv([row], 'JPY')
    expect(csv).toContain('Sang Mỹ; 年金')
  })

  it('bọc ô có dấu phẩy trong ngoặc kép', () => {
    const withComma: YearRow = {
      ...row,
      events: [{ id: 'e1', label: 'Mua nhà, trả trước', kind: 'expense', amountDisplayMinor: 1 }],
    }
    const csv = buildYearCsv([withComma], 'JPY')
    expect(csv).toContain('"Mua nhà, trả trước"')
  })

  it('không có sự kiện thì ô sự kiện rỗng', () => {
    const csv = buildYearCsv([{ ...row, events: [] }], 'JPY')
    const lines = csv.slice(1).split('\r\n')
    expect(lines[1].split(',')[5]).toBe('')
  })

  // Không có cột này thì hai kịch bản khác đơn vị tiền xuất ra hai file giống nhau
  // hoàn toàn về cấu trúc, toàn số nguyên trần, và tên file cũng không mang đơn vị.
  it('mỗi dòng mang mã loại tiền ở cột cuối', () => {
    const csv = buildYearCsv([{ ...row, events: [] }], 'JPY')
    const cells = csv.slice(1).split('\r\n')[1].split(',')
    expect(cells[cells.length - 1]).toBe('JPY')
  })

  it('đổi loại tiền thì CẢ số tiền lẫn mã tiền trong file đổi theo', () => {
    // Cùng một `YearRow` (14.250.000 minor units) đọc theo hai đơn vị: JPY 0 chữ số
    // thập phân → "14250000"; USD 2 chữ số → "142500.00". Đây đúng là chỗ mà một file
    // KHÔNG có cột loại tiền trở thành mơ hồ: 14250000 là ¥14 triệu hay $142.500?
    const jpy = buildYearCsv([{ ...row, events: [] }], 'JPY').slice(1).split('\r\n')[1].split(',')
    const usd = buildYearCsv([{ ...row, events: [] }], 'USD').slice(1).split('\r\n')[1].split(',')
    expect(jpy[3]).toBe('14250000')
    expect(usd[3]).toBe('142500.00')
    expect(jpy[jpy.length - 1]).toBe('JPY')
    expect(usd[usd.length - 1]).toBe('USD')
  })
})
