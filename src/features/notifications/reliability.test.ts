import { describe, expect, it } from 'vitest'
import {
  HISTORY_TARGET_MONTHS,
  historyCoverage,
  monthSpansLabel,
  reliability,
  type ReliabilityInput,
} from './reliability'
import { ADJUST_CATEGORY_NAME } from '../categories/flowCategories'
import type { CategoryRow, TransactionRow } from '../../types/database.types'

const tx = (p: Partial<TransactionRow>): TransactionRow =>
  ({
    id: Math.random().toString(36),
    type: 'expense',
    amount: 100,
    account_id: 'a1',
    category_id: 'an',
    occurred_on: '2026-08-10',
    ...p,
  }) as TransactionRow

const CATS = [
  { id: 'an', name: 'Ăn uống' },
  { id: 'dc', name: ADJUST_CATEGORY_NAME },
] as CategoryRow[]

const input = (p: Partial<ReliabilityInput>): ReliabilityInput => ({
  todayISO: '2026-08-17',
  recentTxs: [],
  categories: CATS,
  accounts: [],
  monthsWithData: HISTORY_TARGET_MONTHS,
  blankAssumptions: 0,
  ...p,
})

describe('reliability', () => {
  // Sổ trống KHÔNG phải sổ sai: phạt người mới cài app là chỉ số nói sai ngay từ đầu.
  it('sổ trống ra 100% chứ không phải 0%', () => {
    expect(reliability(input({})).pct).toBe(100)
  })

  it('một nửa chưa phân loại thì phần đó còn một nửa', () => {
    const r = reliability(
      input({ recentTxs: [tx({}), tx({ category_id: null })] }),
    )
    const p = r.parts.find((x) => x.key === 'categorized')!
    expect(p.score).toBe(0.5)
    expect(p.gap).toBe('1 giao dịch chưa gắn danh mục')
    // 0,5×0,4 + 1×0,3 + 1×0,2 + 1×0,1 = 0,8
    expect(r.pct).toBe(80)
  })

  it('chuyển khoản không kéo tỷ lệ phân loại xuống', () => {
    const r = reliability(input({ recentTxs: [tx({}), tx({ type: 'transfer', category_id: null })] }))
    expect(r.parts.find((x) => x.key === 'categorized')!.score).toBe(1)
  })

  it('tài khoản mới đối chiếu trong 30 ngày mới được tính', () => {
    const r = reliability(
      input({
        accounts: [{ id: 'a1' }, { id: 'a2' }],
        recentTxs: [
          tx({ account_id: 'a1', category_id: 'dc', occurred_on: '2026-08-01' }),
          // Quá 30 ngày → không tính
          tx({ account_id: 'a2', category_id: 'dc', occurred_on: '2026-06-01' }),
        ],
      }),
    )
    const p = r.parts.find((x) => x.key === 'reconciled')!
    expect(p.score).toBe(0.5)
    expect(p.gap).toBe('1 tài khoản chưa đối chiếu trong 30 ngày')
  })

  // Ca đẻ ra migration 0050: đối chiếu thấy KHỚP thì không sinh giao dịch bù nào, nên
  // trước đó nó vô hình với chỉ số — sổ đúng bị chấm điểm y như sổ chưa ai sờ tới.
  it('đối chiếu thấy khớp vẫn được tính, dù không có giao dịch bù nào', () => {
    const r = reliability(
      input({ accounts: [{ id: 'a1', last_reconciled_at: '2026-08-16T02:00:00Z' }] }),
    )
    const p = r.parts.find((x) => x.key === 'reconciled')!
    expect(p.score).toBe(1)
    expect(p.gap).toBe('')
  })

  it('mốc đối chiếu quá 30 ngày thì hết tính', () => {
    const r = reliability(
      input({ accounts: [{ id: 'a1', last_reconciled_at: '2026-06-01T02:00:00Z' }] }),
    )
    expect(r.parts.find((x) => x.key === 'reconciled')!.score).toBe(0)
  })

  it('lịch sử kẹp ở 1 — ghi 20 tháng không cho điểm cao hơn 12 tháng', () => {
    const a = reliability(input({ monthsWithData: 12 }))
    const b = reliability(input({ monthsWithData: 20 }))
    expect(a.pct).toBe(b.pct)
    expect(b.parts.find((x) => x.key === 'history')!.score).toBe(1)
  })

  it('giả định trống kéo điểm xuống và nói ra số còn thiếu', () => {
    const r = reliability(input({ blankAssumptions: 3 }))
    const p = r.parts.find((x) => x.key === 'assumptions')!
    expect(p.score).toBe(0)
    expect(p.gap).toBe('3 giả định còn trống')
    expect(r.pct).toBe(90)
  })

  it('trọng số cộng lại đúng 1 — nếu không thì 100% không bao giờ đạt được', () => {
    const tong = reliability(input({})).parts.reduce((a, p) => a + p.weight, 0)
    expect(tong).toBeCloseTo(1, 10)
  })

  it('mọi thành phần rỗng hết thì ra 0%', () => {
    const r = reliability(
      input({
        recentTxs: [tx({ category_id: null })],
        accounts: [{ id: 'a1' }],
        monthsWithData: 0,
        blankAssumptions: 3,
      }),
    )
    expect(r.pct).toBe(0)
  })
})

// MỤC 15: "mới 8/12 tháng có dữ liệu" không bao giờ hết — Bản tin đếm trên chuỗi 8 tháng
// của biểu đồ trong khi mục tiêu là 12. Giờ đếm đúng 12 tháng gần nhất và nói tháng nào thiếu.
describe('historyCoverage — 12 tháng gần nhất', () => {
  const cur = { year: 2026, month: 9 }
  /** Một khoản chi mỗi tháng từ `from` tới 2026/09. */
  const monthly = (from: { year: number; month: number }) => {
    const out: TransactionRow[] = []
    let y = from.year
    let m = from.month
    while (y < 2026 || (y === 2026 && m <= 9)) {
      out.push(tx({ occurred_on: `${y}-${String(m).padStart(2, '0')}-10` }))
      m++
      if (m > 12) {
        m = 1
        y++
      }
    }
    return out
  }

  it('sổ ghi đều từ 06/2025 → đủ 12/12, không còn tháng nào thiếu', () => {
    const r = historyCoverage(monthly({ year: 2025, month: 6 }), cur, 1)
    expect(r.withData).toBe(12)
    expect(r.missing).toEqual([])
  })

  it('đủ 12 thì phần Lịch sử của chỉ số hết báo thiếu', () => {
    const cov = historyCoverage(monthly({ year: 2025, month: 6 }), cur, 1)
    const p = reliability(input({ monthsWithData: cov.withData, missingMonths: cov.missing })).parts.find(
      (x) => x.key === 'history',
    )!
    expect(p.gap).toBe('')
    expect(p.score).toBe(1)
  })

  it('sổ mới từ 03/2026 → 7/12, liệt kê đúng những tháng thiếu', () => {
    const r = historyCoverage(monthly({ year: 2026, month: 3 }), cur, 1)
    expect(r.withData).toBe(7)
    expect(r.missing).toEqual([
      { year: 2025, month: 10 },
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ])
  })

  it('chuyển khoản và bút toán loại khỏi thống kê không tính là có dữ liệu', () => {
    const r = historyCoverage(
      [
        tx({ occurred_on: '2026-09-02', type: 'transfer' }),
        tx({ occurred_on: '2026-08-02', exclude_from_stats: true }),
        tx({ occurred_on: '2026-07-02' }),
      ],
      cur,
      1,
    )
    expect(r.withData).toBe(1)
  })

  it('theo ngày bắt đầu tháng: 20/9 với monthStartDay 25 thuộc tháng 8', () => {
    const r = historyCoverage([tx({ occurred_on: '2026-09-20' })], cur, 25)
    expect(r.missing).toContainEqual({ year: 2026, month: 9 })
    expect(r.missing).not.toContainEqual({ year: 2026, month: 8 })
  })

  it('câu thiếu nêu tên tháng, gộp tháng liền nhau thành khoảng', () => {
    const r = reliability(
      input({
        monthsWithData: 9,
        missingMonths: [
          { year: 2025, month: 10 },
          { year: 2025, month: 11 },
          { year: 2026, month: 4 },
        ],
      }),
    )
    expect(r.parts.find((x) => x.key === 'history')!.gap).toBe(
      'mới 9/12 tháng có dữ liệu — thiếu 2025/10–2025/11, 2026/04',
    )
  })
})

describe('monthSpansLabel', () => {
  it('một tháng lẻ, một dải, và dải vắt qua năm', () => {
    expect(monthSpansLabel([{ year: 2026, month: 4 }])).toBe('2026/04')
    expect(
      monthSpansLabel([
        { year: 2025, month: 12 },
        { year: 2026, month: 1 },
        { year: 2026, month: 2 },
      ]),
    ).toBe('2025/12–2026/02')
  })
})
