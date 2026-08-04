import { describe, expect, it } from 'vitest'
import {
  ADJUST_CATEGORY_NAME,
  cardDebt,
  defaultAdjustDate,
  findAdjustCategory,
  reconcilePlan,
} from './reconcile'

describe('reconcilePlan — ví/tài khoản thường', () => {
  it('số thật nhiều hơn sổ → giao dịch thu bù phần thiếu', () => {
    expect(reconcilePlan({ isCard: false, currentBalance: 80_000, entered: 100_000 })).toEqual({
      target: 100_000,
      diff: 20_000,
      type: 'income',
    })
  })

  it('số thật ít hơn sổ → giao dịch chi', () => {
    expect(reconcilePlan({ isCard: false, currentBalance: 100_000, entered: 80_000 })).toEqual({
      target: 80_000,
      diff: -20_000,
      type: 'expense',
    })
  })
})

describe('reconcilePlan — thẻ tín dụng (ô nhập là số ĐANG NỢ)', () => {
  it('nợ thật nhiều hơn sổ → chi trên thẻ (số dư giảm = nợ tăng)', () => {
    // Sổ ghi nợ 100.000 (số dư −100.000), sao kê thật 120.000
    expect(reconcilePlan({ isCard: true, currentBalance: -100_000, entered: 120_000 })).toEqual({
      target: -120_000,
      diff: -20_000,
      type: 'expense',
    })
  })

  it('nợ thật ít hơn sổ → thu trên thẻ (nợ giảm)', () => {
    expect(reconcilePlan({ isCard: true, currentBalance: -100_000, entered: 80_000 })).toEqual({
      target: -80_000,
      diff: 20_000,
      type: 'income',
    })
  })

  it('nhập số âm vẫn hiểu là số nợ', () => {
    expect(reconcilePlan({ isCard: true, currentBalance: -100_000, entered: -120_000 }).target).toBe(
      -120_000,
    )
  })

  it('hết nợ → thu đúng bằng phần còn lại', () => {
    expect(reconcilePlan({ isCard: true, currentBalance: -50_000, entered: 0 })).toEqual({
      target: 0,
      diff: 50_000,
      type: 'income',
    })
  })

  it('khớp rồi → không chênh', () => {
    expect(reconcilePlan({ isCard: true, currentBalance: -50_000, entered: 50_000 }).diff).toBe(0)
  })
})

describe('findAdjustCategory', () => {
  const cat = (over: Partial<Parameters<typeof findAdjustCategory>[0][number]> = {}) => ({
    id: 'c1',
    name: ADJUST_CATEGORY_NAME,
    type: 'expense' as const,
    is_archived: false,
    ...over,
  })

  it('chưa có danh mục bù → null (caller phải tạo)', () => {
    expect(findAdjustCategory([cat({ name: 'Ăn uống' })], 'expense')).toBeNull()
  })

  it('tìm đúng theo tên + chiều', () => {
    expect(findAdjustCategory([cat({ id: 'x' })], 'expense')?.id).toBe('x')
  })

  it('không lẫn chiều: danh mục Chi không dùng cho giao dịch Thu', () => {
    expect(findAdjustCategory([cat({ type: 'expense' })], 'income')).toBeNull()
  })

  it('bỏ qua danh mục đã lưu trữ', () => {
    expect(findAdjustCategory([cat({ is_archived: true })], 'expense')).toBeNull()
  })
})

describe('cardDebt', () => {
  it('số dư âm → nợ dương', () => {
    expect(cardDebt(-112_760)).toBe(112_760)
  })

  it('trả dư (số dư dương) → coi như hết nợ', () => {
    expect(cardDebt(5_000)).toBe(0)
  })
})

describe('defaultAdjustDate', () => {
  it('ví/tài khoản thường → hôm nay', () => {
    expect(
      defaultAdjustDate({
        isCard: false,
        statementDay: 31,
        paymentDueDay: 27,
        todayISO: '2026-08-04',
      }),
    ).toBe('2026-08-04')
  })

  it('thẻ → lùi về ngày chốt của kỳ đến hạn kế tiếp', () => {
    // Đến hạn 27/8 → chốt 31/7. Bù ghi 31/7 thì engine tự-trả nhìn thấy.
    expect(
      defaultAdjustDate({
        isCard: true,
        statementDay: 31,
        paymentDueDay: 27,
        todayISO: '2026-08-04',
      }),
    ).toBe('2026-07-31')
  })

  it('ngày chốt còn ở phía trước → kẹp về hôm nay, không ghi ngày tương lai', () => {
    // Chốt ngày 5, đến hạn 25, hôm nay mùng 2: chốt 5/8 chưa tới. Giao dịch hôm
    // nay vẫn nằm trước mốc chốt nên engine đã tính đúng.
    expect(
      defaultAdjustDate({
        isCard: true,
        statementDay: 5,
        paymentDueDay: 25,
        todayISO: '2026-08-02',
      }),
    ).toBe('2026-08-02')
  })

  it('thẻ thiếu ngày chốt hoặc ngày trả → hôm nay', () => {
    const today = '2026-08-04'
    expect(
      defaultAdjustDate({ isCard: true, statementDay: null, paymentDueDay: 27, todayISO: today }),
    ).toBe(today)
    expect(
      defaultAdjustDate({ isCard: true, statementDay: 31, paymentDueDay: null, todayISO: today }),
    ).toBe(today)
  })

  it('ngày đến hạn dời cuối tuần vẫn ra đúng mốc chốt', () => {
    // 27/6/2026 là T7 → dời 29/6; chốt gần nhất trước đó = 31/5
    expect(
      defaultAdjustDate({
        isCard: true,
        statementDay: 31,
        paymentDueDay: 27,
        todayISO: '2026-06-01',
      }),
    ).toBe('2026-05-31')
  })
})
