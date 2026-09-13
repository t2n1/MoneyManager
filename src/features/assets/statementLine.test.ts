import { describe, expect, it } from 'vitest'
import { sourceFromFileName, sourceLabelFor } from './statementLine'

describe('sourceFromFileName', () => {
  it('lay 4 so trong ngoac cua ten file nha the', () => {
    expect(sourceFromFileName('enavi202607(3737) (1).csv')).toBe('3737')
    expect(sourceFromFileName('detail202607(4342).csv')).toBe('4342')
  })
  it('khong co ngoac thi dung ten file bo duoi', () => {
    expect(sourceFromFileName('sao-ke-thang-7.csv')).toBe('sao-ke-thang-7')
  })
  it('ten rong thi tra chuoi rong, khong vo', () => {
    expect(sourceFromFileName('')).toBe('')
  })
})

describe('sourceLabelFor', () => {
  it('ba duoi da biet co ten rieng', () => {
    expect(sourceLabelFor('3737')).toBe('Master 3737')
    expect(sourceLabelFor('2565')).toBe('Visa 2565')
    expect(sourceLabelFor('4342')).toBe('PayPay 4342')
  })
  it('duoi 4 so la thi ghi The ····NNNN', () => {
    expect(sourceLabelFor('9999')).toBe('Thẻ ····9999')
  })
  it('khong phai 4 so thi giu nguyen', () => {
    expect(sourceLabelFor('sao-ke-thang-7')).toBe('sao-ke-thang-7')
  })
})
