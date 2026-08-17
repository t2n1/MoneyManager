import { describe, expect, it } from 'vitest'
import {
  ACTION_SCORE_MAX,
  weakestAction,
  type WeakestActionSnap,
} from './weakestAction'

// Định dạng tiền giả, dễ đọc trong kỳ vọng test: 38600 → "¥38,600".
const fmt = (v: number) => `¥${v.toLocaleString('en-US')}`

const SNAP: WeakestActionSnap = {
  liquidAssets: 380_000,
  monthlyFixedExpense: 139_533,
  debtDueWithin12m: 152_800,
  totalDebt: 168_420,
  annualIncome: 3_360_000,
  monthlyIncome: 280_000,
  monthlyExpense: 244_700,
}

const call = (p: {
  key: string
  score?: number
  weight?: number
  heaviest?: boolean
  snap?: Partial<WeakestActionSnap>
}) =>
  weakestAction({
    key: p.key,
    score: p.score ?? 34,
    weight: p.weight ?? 25,
    heaviest: p.heaviest ?? false,
    snap: { ...SNAP, ...p.snap },
    base: 'JPY',
    formatMoney: fmt,
  })

describe('weakestAction — im khi không có việc', () => {
  it('chỉ số đã ở vùng tốt thì không phán việc gì', () => {
    expect(call({ key: 'fund', score: ACTION_SCORE_MAX })).toBeNull()
    expect(call({ key: 'fund', score: 88 })).toBeNull()
  })

  it('loại chỉ số không biết thì trả null, không đoán', () => {
    expect(call({ key: 'khong-ton-tai' })).toBeNull()
  })

  it('quỹ đã vượt mốc cao nhất → hết mốc để với', () => {
    // 6 tháng chi cố định = 837.198; để tiền lỏng cao hơn hẳn.
    expect(call({ key: 'fund', snap: { liquidAssets: 2_000_000 } })).toBeNull()
  })
})

describe('weakestAction — quỹ dự phòng', () => {
  it('ra ĐÚNG số tiền còn thiếu để chạm mốc 3 tháng', () => {
    const a = call({ key: 'fund' })
    // 3 × 139.533 = 418.599 − 380.000 = 38.599
    expect(a?.amount).toBe(38_599)
    expect(a?.text).toContain('¥38,599')
    expect(a?.text).toContain('mốc 3 tháng chi cố định')
  })

  it('nhịp để dành = thu − chi, và eta làm tròn LÊN', () => {
    const a = call({ key: 'fund' })
    expect(a?.pace).toBe(35_300) // 280.000 − 244.700
    expect(a?.etaMonths).toBe(2) // ceil(38.599 / 35.300) = 2
    expect(a?.text).toContain('¥35,300/tháng')
  })

  it('đã qua mốc 3 thì với lên mốc 6, không dừng lại', () => {
    // 4 tháng quỹ: 4 × 139.533 = 558.132
    const a = call({ key: 'fund', snap: { liquidAssets: 558_132 } })
    expect(a?.text).toContain('mốc 6 tháng')
    expect(a?.amount).toBe(6 * 139_533 - 558_132)
  })
})

// Nếu không dư đồng nào thì "0 tháng nữa là tới" là câu vô nghĩa, và "Infinity tháng"
// thì còn tệ hơn. Phải nói ra rằng chưa có đường tới mốc.
describe('weakestAction — không dư đồng nào', () => {
  it('nhịp ≤ 0 → eta null và nói thẳng phải bớt chi trước', () => {
    const a = call({ key: 'fund', snap: { monthlyExpense: 300_000 } })
    expect(a?.etaMonths).toBeNull()
    expect(a?.pace).toBeLessThan(0)
    expect(a?.text).toContain('chưa dư đồng nào')
    expect(a?.text).toContain('bớt chi trước')
    expect(a?.text).not.toContain('Infinity')
    expect(a?.text).not.toContain('NaN')
  })

  it('nhịp đúng bằng 0 cũng vậy', () => {
    const a = call({ key: 'fund', snap: { monthlyExpense: 280_000 } })
    expect(a?.etaMonths).toBeNull()
  })
})

describe('weakestAction — nợ ngắn hạn', () => {
  it('tính theo số nợ phải trả trong 12 tháng', () => {
    // Tiền lỏng 100.000 so với nợ 152.800 → chưa tới 1×
    const a = call({ key: 'liq', snap: { liquidAssets: 100_000 } })
    expect(a?.amount).toBe(52_800)
    expect(a?.text).toContain('gấp 1× nợ')
  })

  it('không có nợ ngắn hạn thì không có việc gì', () => {
    expect(call({ key: 'liq', snap: { debtDueWithin12m: 0 } })).toBeNull()
  })
})

describe('weakestAction — nợ trên thu nhập', () => {
  // Chỉ số CÀNG THẤP CÀNG TỐT: câu phải là "trả bớt", không phải "cần thêm".
  it('nói TRẢ BỚT, không nói cần thêm', () => {
    const a = call({ key: 'dti', snap: { totalDebt: 3_000_000 } })
    expect(a?.text).toContain('trả bớt')
    expect(a?.text).not.toContain('Cần thêm')
    // 3.000.000 − 0,5 × 3.360.000 = 1.320.000
    expect(a?.amount).toBe(1_320_000)
    expect(a?.text).toContain('về 50%')
  })

  it('nợ rất nặng thì với mốc 150% trước, không nhảy thẳng về 50%', () => {
    const a = call({ key: 'dti', snap: { totalDebt: 8_000_000 } })
    expect(a?.text).toContain('về 150%')
    expect(a?.amount).toBe(8_000_000 - 1.5 * 3_360_000)
  })

  it('không nợ, hoặc chưa có thu nhập → không phán', () => {
    expect(call({ key: 'dti', snap: { totalDebt: 0 } })).toBeNull()
    expect(call({ key: 'dti', snap: { annualIncome: 0 } })).toBeNull()
  })
})

// Chốt quan trọng nhất của cả file: ba chỉ số này KHÔNG được bịa ra số tiền.
describe('weakestAction — ba chỉ số không đo bằng tiền', () => {
  it('Nếu mất việc: không có số tiền, và nói rõ vì sao', () => {
    const a = call({ key: 'runway' })
    expect(a?.amount).toBeNull()
    expect(a?.etaMonths).toBeNull()
    expect(a?.text).toContain('2.000 kịch bản')
    expect(a?.text).toContain('cắt hết chi linh hoạt')
  })

  it('Phụ thuộc một nguồn thu: chữa bằng nguồn thu thứ hai', () => {
    const a = call({ key: 'conc' })
    expect(a?.amount).toBeNull()
    expect(a?.text).toContain('nguồn thu thứ hai')
  })

  it('Thuế & an sinh: chỉ còn đường khấu trừ', () => {
    const a = call({ key: 'burden' })
    expect(a?.amount).toBeNull()
    expect(a?.text).toContain('khấu trừ')
  })

  it('không ca nào in ra một con số tiền giả', () => {
    for (const key of ['runway', 'conc', 'burden']) {
      const a = call({ key })
      expect(a?.text, key).not.toMatch(/¥[\d,]+/)
    }
  })
})

describe('weakestAction — "nặng ký nhất"', () => {
  it('chỉ nói khi đúng là nặng nhất', () => {
    expect(call({ key: 'fund', heaviest: true, weight: 25 })?.text).toContain(
      'nặng ký nhất (25%)',
    )
    expect(call({ key: 'fund', heaviest: false })?.text).not.toContain('nặng ký nhất')
  })
})

// Chip của chế độ Gọn dùng `amountText`. Nếu nó lệch với con số trong `text` thì hai chế
// độ mật độ in ra hai số tiền khác nhau cho cùng một việc.
describe('weakestAction — amountText', () => {
  it('có tiền thì amountText khớp đúng con số trong câu dài', () => {
    const a = call({ key: 'fund' })
    expect(a?.amountText).toBe('¥38,599')
    expect(a?.text).toContain(a!.amountText!)
  })

  it('nhánh trả bớt nợ cũng có amountText', () => {
    const a = call({ key: 'dti', snap: { totalDebt: 3_000_000 } })
    expect(a?.amountText).toBe('¥1,320,000')
    expect(a?.text).toContain(a!.amountText!)
  })

  it('ba chỉ số không đo bằng tiền thì amountText là null', () => {
    for (const key of ['runway', 'conc', 'burden']) {
      expect(call({ key })?.amountText, key).toBeNull()
    }
  })
})
