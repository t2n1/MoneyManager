import { describe, expect, it } from 'vitest'
import { parseNl, type NlParseInput } from './parseNl'

// Hôm nay cố định = Thứ 2, 2026-07-20 (để test ngày tương đối/thứ trong tuần).
const TODAY = '2026-07-20'

const CATS: NlParseInput['categories'] = [
  { id: 'an', name: 'Ăn uống', type: 'expense', parent_id: null },
  { id: 'cafe', name: 'Cà phê', type: 'expense', parent_id: 'an' },
  { id: 'dilai', name: 'Đi lại', type: 'expense', parent_id: null },
  { id: 'muasam', name: 'Mua sắm', type: 'expense', parent_id: null },
  { id: 'nhacua', name: 'Nhà cửa', type: 'expense', parent_id: null },
  { id: 'quatang', name: 'Quà tặng', type: 'expense', parent_id: null },
  { id: 'qua', name: 'Quà', type: 'expense', parent_id: 'quatang' },
  { id: 'luong', name: 'Lương', type: 'income', parent_id: null },
]

function run(text: string, currency: NlParseInput['currency'] = 'JPY') {
  return parseNl({ text, categories: CATS, currency, todayISO: TODAY })
}

describe('parseNl — số tiền', () => {
  it('số + "yên" → minor units JPY', () => {
    expect(run('trưa 850 yên').amountMinor).toBe(850)
  })

  it('hậu tố man/万 = ×10.000', () => {
    expect(run('lương 25man').amountMinor).toBe(250_000)
    expect(run('25万 tiền nhà').amountMinor).toBe(250_000)
  })

  it('hậu tố k = ×1.000, tr/triệu = ×1.000.000', () => {
    expect(run('grab 50k').amountMinor).toBe(50_000)
    expect(run('gửi về 5tr').amountMinor).toBe(5_000_000)
    expect(run('quà 2 triệu').amountMinor).toBe(2_000_000)
  })

  it('ưu tiên số đi kèm đơn vị hơn số trần', () => {
    // "2 người" là số trần, "850 yên" có đơn vị → chọn 850
    expect(run('ăn 2 người 850 yên').amountMinor).toBe(850)
  })

  it('USD: dấu thập phân → cents', () => {
    expect(run('cafe 8.5 usd', 'USD').amountMinor).toBe(850)
  })

  it('không có số → null', () => {
    expect(run('ăn trưa').amountMinor).toBe(null)
  })
})

describe('parseNl — ngày', () => {
  it('hôm nay / hôm qua / hôm kia', () => {
    expect(run('ăn 500 hôm nay').dateISO).toBe('2026-07-20')
    expect(run('ăn 500 hôm qua').dateISO).toBe('2026-07-19')
    expect(run('ăn 500 hôm kia').dateISO).toBe('2026-07-18')
  })

  it('"tối qua" = hôm qua', () => {
    expect(run('nhậu tối qua 3000').dateISO).toBe('2026-07-19')
  })

  it('ngày tường minh dd/mm và dd/mm/yyyy', () => {
    expect(run('mua sắm 20/7 hết 1200').dateISO).toBe('2026-07-20')
    expect(run('vé tàu 3/12/2025 hết 5000').dateISO).toBe('2025-12-03')
  })

  it('thứ trong tuần → lần gần nhất trong quá khứ (gồm hôm nay)', () => {
    // Hôm nay là Thứ 2 → "thứ 2" = hôm nay
    expect(run('họp 0 thứ 2').dateISO).toBe('2026-07-20')
    // Chủ nhật gần nhất = hôm qua
    expect(run('ăn chủ nhật 800').dateISO).toBe('2026-07-19')
    // Thứ 6 gần nhất = 2026-07-17
    expect(run('lương thứ 6 100').dateISO).toBe('2026-07-17')
  })

  it('không nhắc ngày → null (form giữ mặc định hôm nay)', () => {
    expect(run('ăn trưa 850').dateISO).toBe(null)
  })

  it('ngày không nuốt số tiền', () => {
    // "20/7" không được đọc thành số tiền 20
    expect(run('mua sắm 20/7 hết 1200').amountMinor).toBe(1200)
  })
})

describe('parseNl — danh mục & loại', () => {
  it('khớp trực tiếp tên danh mục', () => {
    const r = run('mua sắm 1200')
    expect(r.categoryId).toBe('muasam')
    expect(r.type).toBe('expense')
  })

  it('từ đồng nghĩa → danh mục (trưa → Ăn uống)', () => {
    expect(run('trưa 850 yên').categoryId).toBe('an')
  })

  it('con cụ thể ưu tiên hơn cha (cà phê → Cà phê)', () => {
    expect(run('cà phê 500').categoryId).toBe('cafe')
  })

  it('taxi/grab/tàu → Đi lại', () => {
    expect(run('grab 50k').categoryId).toBe('dilai')
    expect(run('vé tàu 320').categoryId).toBe('dilai')
  })

  it('lương → danh mục thu, loại income', () => {
    const r = run('lương 25man')
    expect(r.categoryId).toBe('luong')
    expect(r.type).toBe('income')
  })

  it('"hôm qua" không khớp nhầm danh mục "Quà"', () => {
    // "qua" trong "hôm qua" từng lọt vào danh mục con "Quà" — phải là Đi lại (grab)
    const r = run('grab 50k hôm qua')
    expect(r.categoryId).toBe('dilai')
    expect(r.dateISO).toBe('2026-07-19')
  })

  it('không khớp danh mục → categoryId null, loại null', () => {
    const r = run('abcxyz 500')
    expect(r.categoryId).toBe(null)
    expect(r.type).toBe(null)
  })
})

describe('parseNl — ghi chú', () => {
  it('bóc số tiền + ngày khỏi ghi chú, giữ phần mô tả', () => {
    // "500 yen" và "hom qua" bị bóc, còn lại mô tả
    const r = run('starbucks 500 yen hôm qua')
    expect(r.note).toBe('starbucks')
  })

  it('câu rỗng → mọi trường trống', () => {
    const r = run('')
    expect(r).toEqual({
      type: null,
      amountMinor: null,
      categoryId: null,
      dateISO: null,
      note: '',
      matchedCategoryName: null,
    })
  })
})
