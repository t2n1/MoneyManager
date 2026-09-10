import { describe, expect, it } from 'vitest'
import { BAR_MIN_PCT, MAP_TOP_N, costRowLook, costRowViews } from './costItemView'
import type { LifetimeCostItem, LifetimeCostMap } from './lifetimeCost'
import type { DraftEvent, DraftPhase } from './draft'
import { TAG_HEX } from '../tags/colors'
import { phaseColorKey } from './planColors'

const item = (
  over: Partial<LifetimeCostItem> & Pick<LifetimeCostItem, 'id'>,
): LifetimeCostItem => ({
  kind: 'event',
  label: 'Mua xe',
  totalMinor: 1_200_000,
  years: 1,
  startYear: 2030,
  endYear: 2030,
  ...over,
})

const map = (items: LifetimeCostItem[]): LifetimeCostMap => ({
  items: [...items].sort((a, b) => Math.abs(b.totalMinor) - Math.abs(a.totalMinor)),
  totalSpendMinor: items.reduce((s, i) => s + (i.totalMinor > 0 ? i.totalMinor : 0), 0),
})

describe('costRowViews — ≈/tháng', () => {
  it('rải trên QUÃNG, không trên số năm chạm', () => {
    // ¥6.000.000 mua xe ở 2030 và 2038 = quãng 9 năm = 108 tháng → ¥55.556/tháng.
    // Chia cho số năm CHẠM (2 năm = 24 tháng) ra ¥250.000 — sai gấp 4,5 lần.
    const { rows } = costRowViews(
      map([item({ id: 'xe', totalMinor: 6_000_000, years: 2, startYear: 2030, endYear: 2038 })]),
      { showAll: true },
    )
    expect(rows[0].monthlyMinor).toBe(Math.round(6_000_000 / 108))
  })

  it('mốc một năm vẫn chia cho 12 tháng, không chia cho 0', () => {
    const { rows } = costRowViews(
      map([item({ id: 'cuoi', totalMinor: 3_000_000, startYear: 2029, endYear: 2029 })]),
      { showAll: true },
    )
    expect(rows[0].monthlyMinor).toBe(250_000)
  })

  it('lấy ĐỘ LỚN: dòng thu cũng ra số dương', () => {
    const { rows } = costRowViews(
      map([item({ id: 'huu', totalMinor: -1_200_000, startYear: 2060, endYear: 2060 })]),
      { showAll: true },
    )
    expect(rows[0].monthlyMinor).toBe(100_000)
  })
})

describe('costRowViews — % tổng chi', () => {
  it('phần của mỗi khoản trong tổng CHI', () => {
    const { rows } = costRowViews(
      map([item({ id: 'a', totalMinor: 3_000_000 }), item({ id: 'b', totalMinor: 1_000_000 })]),
      { showAll: true },
    )
    expect(rows[0].sharePct).toBe(75)
    expect(rows[1].sharePct).toBe(25)
  })

  // Dòng THU không có phần nào trong tổng chi — in "25%" cho lương hưu là nói rằng nó
  // ngốn một phần tư số tiền bạn chi ra. Bản vẽ ghi chữ "thu vào" ở cột đó.
  it('dòng THU trả null, không trả 0 hay số âm', () => {
    const { rows } = costRowViews(
      map([item({ id: 'a', totalMinor: 3_000_000 }), item({ id: 'huu', totalMinor: -1_000_000 })]),
      { showAll: true },
    )
    expect(rows.find((r) => r.item.id === 'huu')?.sharePct).toBeNull()
  })

  it('kế hoạch chỉ có thu (tổng chi 0) thì không chia cho 0', () => {
    const { rows } = costRowViews(map([item({ id: 'huu', totalMinor: -1_000_000 })]), {
      showAll: true,
    })
    expect(rows[0].sharePct).toBeNull()
  })
})

describe('costRowViews — thanh tỉ lệ', () => {
  it('khoản lớn nhất là 100%', () => {
    const { rows } = costRowViews(
      map([item({ id: 'a', totalMinor: 4_000_000 }), item({ id: 'b', totalMinor: 1_000_000 })]),
      { showAll: true },
    )
    expect(rows[0].barPct).toBe(100)
    expect(rows[1].barPct).toBe(25)
  })

  it('khoản tí xíu vẫn có một vạch thấy được (sàn)', () => {
    const { rows } = costRowViews(
      map([item({ id: 'a', totalMinor: 100_000_000 }), item({ id: 'b', totalMinor: 1_000 })]),
      { showAll: true },
    )
    // 0,001% → sàn.
    expect(rows[1].barPct).toBe(BAR_MIN_PCT)
  })

  it('bảng rỗng thì không NaN', () => {
    expect(costRowViews(map([]), { showAll: true })).toEqual({ rows: [], hiddenCount: 0 })
  })
})

describe('costRowViews — cắt bớt', () => {
  const nhieu = map(
    Array.from({ length: 14 }, (_, i) => item({ id: `e${i}`, totalMinor: (14 - i) * 100_000 })),
  )

  it(`mặc định giữ ${MAP_TOP_N} khoản lớn nhất và NÓI RA còn bao nhiêu`, () => {
    const { rows, hiddenCount } = costRowViews(nhieu, { showAll: false })
    expect(rows).toHaveLength(MAP_TOP_N)
    expect(hiddenCount).toBe(5)
    // Giữ đúng những khoản LỚN nhất, không phải chín khoản đầu bảng chưa xếp.
    expect(rows[0].item.totalMinor).toBe(1_400_000)
    expect(rows[MAP_TOP_N - 1].item.totalMinor).toBe(600_000)
  })

  it('mở hết thì không còn gì bị giấu', () => {
    const { rows, hiddenCount } = costRowViews(nhieu, { showAll: true })
    expect(rows).toHaveLength(14)
    expect(hiddenCount).toBe(0)
  })

  it('ít hơn ngưỡng thì không có gì bị giấu, kể cả lúc chưa mở hết', () => {
    const { hiddenCount } = costRowViews(
      map([item({ id: 'a' }), item({ id: 'b', totalMinor: 900_000 })]),
      { showAll: false },
    )
    expect(hiddenCount).toBe(0)
  })

  // Thanh tỉ lệ phải đo theo khoản lớn nhất của CẢ bảng, không của phần đang hiện: gập
  // lại rồi mở ra mà mấy thanh đầu đổi bề rộng thì bảng trông như số liệu vừa đổi.
  it('bề rộng thanh không đổi khi gập/mở', () => {
    const gap = costRowViews(nhieu, { showAll: false }).rows
    const mo = costRowViews(nhieu, { showAll: true }).rows
    expect(gap.map((r) => r.barPct)).toEqual(mo.slice(0, MAP_TOP_N).map((r) => r.barPct))
  })
})

const phase = (over: Partial<DraftPhase> & Pick<DraftPhase, 'id' | 'startYear'>): DraftPhase => ({
  label: 'Đi làm ở Nhật',
  country: 'JP',
  currency: 'JPY',
  annualIncomeMinor: 0,
  annualExpenseMinor: 0,
  incomePctOfPrev: null,
  expensePctOfPrev: null,
  color: '',
  icon: '',
  fxToDisplay: 1,
  ...over,
})

const event = (over: Partial<DraftEvent> & Pick<DraftEvent, 'id'>): DraftEvent => ({
  startYear: 2030,
  endYear: null,
  kind: 'expense',
  amountMinor: 0,
  currency: 'JPY',
  label: 'Mua xe',
  note: '',
  fxToDisplay: 1,
  inflate: true,
  enabled: true,
  amountShape: 'total',
  endAmountMinor: null,
  growthBps: 0,
  repeatEveryYears: null,
  icon: 'car',
  replacesMinor: 0,
  replacesLabel: '',
  color: '',
  assetValueMinor: 0,
  assetChangeBps: 0,
  loanMinor: 0,
  loanRateBps: 0,
  loanYears: 0,
  ...over,
})

describe('costRowLook', () => {
  it('mốc: lấy icon và màu của chính mốc đó', () => {
    const look = costRowLook(item({ id: 'xe' }), [], [event({ id: 'xe', color: 'sky' })])
    expect(look.icon).toBe('car')
    expect(look.color).toBe(TAG_HEX.sky)
    expect(look.kind).toBe('expense')
  })

  it('mốc chưa chọn màu: rơi về màu Thu/Chi của cả app, không phải một sắc mới', () => {
    const chi = costRowLook(item({ id: 'xe' }), [], [event({ id: 'xe' })])
    expect(chi.color).toBe('var(--money-out)')
    const thu = costRowLook(item({ id: 'huu' }), [], [event({ id: 'huu', kind: 'income' })])
    expect(thu.color).toBe('var(--money-in)')
  })

  // Nối chặng qua NĂM, không qua id — id của dòng chặng là tổng hợp (xem
  // `LifetimeCostItem.startYear`). Năm nằm GIỮA quãng cũng phải ra đúng chặng đó.
  it('chặng: nối qua năm, kể cả năm nằm giữa quãng', () => {
    const phases = [
      phase({ id: 'p1', startYear: 2026 }),
      phase({ id: 'p2', startYear: 2040, icon: 'palm' }),
    ]
    const look = costRowLook(
      item({ kind: 'phase', id: 'phase:Về Việt Nam:2045', startYear: 2045 }),
      phases,
      [],
    )
    expect(look.icon).toBe('palm')
    expect(look.kind).toBeNull()
  })

  // Chặng chưa chọn màu được tô theo THỨ HẠNG theo năm — cùng `phaseColorKey` mà dải
  // chặng dùng, nên một dòng trong bảng và khối chặng trên trục là CÙNG màu.
  it('chặng chưa chọn màu: màu xoay theo thứ hạng, khớp dải chặng', () => {
    // `phases` truyền vào KHÔNG theo thứ tự năm — thứ hạng phải tính sau khi sắp, nên
    // chặng 2040 là hạng 1, không phải hạng 0.
    const phases = [phase({ id: 'p2', startYear: 2040 }), phase({ id: 'p1', startYear: 2026 })]
    const hai = costRowLook(item({ kind: 'phase', id: 'x', startYear: 2041 }), phases, [])
    expect(hai.color).toBe(TAG_HEX[phaseColorKey('', 1)])
    expect(hai.color).not.toBe(TAG_HEX[phaseColorKey('', 0)])
  })

  it('chặng có màu riêng thì màu riêng thắng', () => {
    const phases = [phase({ id: 'p1', startYear: 2026, color: 'pink' })]
    expect(costRowLook(item({ kind: 'phase', id: 'x', startYear: 2030 }), phases, []).color).toBe(
      TAG_HEX.pink,
    )
  })

  it('không nối được thì xám và không icon, không đoán một màu nào', () => {
    expect(costRowLook(item({ id: 'da-xoa' }), [], [])).toEqual({
      icon: '',
      color: 'var(--fg-muted)',
      kind: null,
    })
    expect(costRowLook(item({ kind: 'phase', id: 'x', startYear: 2030 }), [], []).icon).toBe('')
  })
})
