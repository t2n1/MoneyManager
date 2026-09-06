import { describe, expect, it } from 'vitest'
import { CHUA_RO, parseIndustries, sectorWeights } from './sectors'

/** Hình dạng thật của phản hồi VNDirect (đã gọi tay 06/09/2026). */
const dong = (level: string, name: string, codes: string) => ({
  industryLevel: level,
  vietnameseName: name,
  codeList: codes,
})

describe('parseIndustries', () => {
  it('lấy CẤP 3 — đủ mịn để tách ngân hàng với chứng khoán, đủ gộp để donut đọc được', () => {
    const m = parseIndustries({
      data: [
        dong('4', 'Thép', 'HPG,HSG,NKG'),
        dong('3', 'Kim loại công nghiệp', 'HPG,HSG'),
        dong('1', 'Vật liệu cơ bản', 'HPG'),
      ],
    })
    expect(m.get('HPG')).toBe('Kim loại công nghiệp')
    expect(m.get('HSG')).toBe('Kim loại công nghiệp')
  })

  it('không có cấp 3 thì lấy cấp cụ thể nhất còn lại', () => {
    const m = parseIndustries({ data: [dong('4', 'Dịch vụ đầu tư', 'VND'), dong('1', 'Tài chính', 'VND')] })
    expect(m.get('VND')).toBe('Dịch vụ đầu tư')
  })

  it('chỉ có cấp 1 thì vẫn dùng, hơn là bỏ trống', () => {
    const m = parseIndustries({ data: [dong('1', 'Tài chính', 'MBB')] })
    expect(m.get('MBB')).toBe('Tài chính')
  })

  it('mã viết thường trong codeList vẫn về chữ HOA', () => {
    const m = parseIndustries({ data: [dong('3', 'Ngân hàng', 'mbb, ACB')] })
    expect(m.get('MBB')).toBe('Ngân hàng')
    expect(m.get('ACB')).toBe('Ngân hàng')
  })

  it('bỏ dòng thiếu tên hoặc thiếu danh sách mã', () => {
    const m = parseIndustries({
      data: [dong('3', '', 'HPG'), dong('3', 'Ngân hàng', ''), { industryLevel: '3' }],
    })
    expect(m.size).toBe(0)
  })

  it('phản hồi không đúng hình dạng thì ra map rỗng, không nổ', () => {
    expect(parseIndustries(null).size).toBe(0)
    expect(parseIndustries({}).size).toBe(0)
    expect(parseIndustries({ data: 'lỗi' }).size).toBe(0)
    expect(parseIndustries('lỗi').size).toBe(0)
  })
})

describe('sectorWeights', () => {
  const vt = (symbol: string, value: number) => ({ symbol, value })

  it('gộp các mã cùng ngành thành một lát', () => {
    const r = sectorWeights(
      [vt('HPG', 60), vt('HSG', 20), vt('MBB', 20)],
      new Map([
        ['HPG', 'Kim loại công nghiệp'],
        ['HSG', 'Kim loại công nghiệp'],
        ['MBB', 'Ngân hàng'],
      ]),
    )
    expect(r).toEqual([
      { name: 'Kim loại công nghiệp', value: 80, weight: 0.8 },
      { name: 'Ngân hàng', value: 20, weight: 0.2 },
    ])
  })

  it('sắp theo giá trị GIẢM DẦN', () => {
    const r = sectorWeights(
      [vt('A', 10), vt('B', 90)],
      new Map([['A', 'Ngành A'], ['B', 'Ngành B']]),
    )
    expect(r.map((x) => x.name)).toEqual(['Ngành B', 'Ngành A'])
  })

  it('mã chưa tra được ngành vào "Chưa rõ" và VẪN nằm trong tổng', () => {
    const r = sectorWeights([vt('HPG', 50), vt('XYZ', 50)], new Map([['HPG', 'Thép']]))
    expect(r.find((x) => x.name === CHUA_RO)?.weight).toBe(0.5)
    expect(r.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 10)
  })

  it('"Chưa rõ" luôn xuống CUỐI, dù nó to nhất — nó không phải một ngành', () => {
    const r = sectorWeights([vt('XYZ', 90), vt('HPG', 10)], new Map([['HPG', 'Thép']]))
    expect(r.map((x) => x.name)).toEqual(['Thép', CHUA_RO])
  })

  it('ngành rỗng hoặc chỉ có khoảng trắng cũng coi là chưa rõ', () => {
    const r = sectorWeights([vt('HPG', 10)], new Map([['HPG', '   ']]))
    expect(r[0].name).toBe(CHUA_RO)
  })

  it('bỏ mã có giá trị ≤ 0 — một lát âm không vẽ được', () => {
    expect(sectorWeights([vt('A', 0), vt('B', -5)], new Map())).toEqual([])
  })

  it('danh mục rỗng ra danh sách rỗng', () => {
    expect(sectorWeights([], new Map())).toEqual([])
  })
})
