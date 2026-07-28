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
  it('dòng đầu là tiêu đề cột', () => {
    const csv = buildYearCsv([row], 'JPY')
    expect(csv.split('\n')[0]).toBe(
      'Nam,Tuoi,Noi o,Thu,Chi,Su kien,Tai san cuoi nam,Bi quan,Lac quan',
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
    expect(csv.split('\n')[1].split(',')[5]).toBe('')
  })
})
