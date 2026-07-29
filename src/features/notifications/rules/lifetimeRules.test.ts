import { describe, expect, it } from 'vitest'
import { lifetimeRules } from './lifetimeRules'
import type { NotificationInput } from '../types'
import type { LifetimeInput } from '../../lifetime/project'
import type { TransactionRow } from '../../../types/database.types'

const lifetime: LifetimeInput = {
  currentYear: 2026,
  birthYear: 1994,
  endAge: 90,
  displayCurrency: 'JPY',
  startingAssetsMinor: 10_000_000,
  realReturnBps: 200,
  bandSpreadBps: 0,
  inflationBps: 200,
  nominalTerms: false,
  phases: [
    {
      startYear: 2026,
      label: 'Nhật',
      country: 'JP',
      currency: 'JPY',
      annualIncomeMinor: 6_000_000,
      annualExpenseMinor: 4_000_000,
      fxToDisplay: 1,
    },
  ],
  events: [],
}

// KHÔNG có trường `currency` ở đây: `TransactionRow` không có cột đó. Loại tiền của một
// giao dịch là loại tiền của TÀI KHOẢN nó thuộc về, tra qua `input.currencyOf`.
function tx(amount: number, occurred_on: string): TransactionRow {
  return {
    id: `t-${occurred_on}-${amount}`,
    user_id: 'u',
    occurred_on,
    type: 'expense',
    amount,
    account_id: 'a1',
    category_id: 'c1',
    note: '',
    exclude_from_stats: false,
    is_refund: false,
    is_debt_flow: false,
  } as TransactionRow
}

function input(over: Partial<NotificationInput> = {}): NotificationInput {
  return {
    todayISO: '2026-07-29',
    monthStartDay: 1,
    base: 'JPY',
    rates: {},
    formatMoney: (m) => String(m),
    currencyOf: () => 'JPY',
    accounts: [],
    categories: [],
    debts: [],
    recurringRules: [],
    savingsGoals: [],
    networthSnapshots: [],
    recentTxs: [],
    offTypes: [],
    lifetime,
    ...over,
  }
}

describe('lifetimeRules', () => {
  it('im khi chưa có bản chiếu', () => {
    expect(lifetimeRules(input({ lifetime: undefined }))).toEqual([])
  })

  it('im khi chưa có giao dịch trong 3 tháng gần đây', () => {
    expect(lifetimeRules(input({ recentTxs: [] }))).toEqual([])
  })

  it('im khi chi thực tế sát giả định', () => {
    // Cửa sổ 2026-05-15 → 2026-07-29 là 75 ngày. Giả định 4.000.000/năm ⇒ cần tổng
    // ≈ 4.000.000 × 75/365 = 821.918. Ba khoản 275.000 = 825.000 → lệch 0,4%.
    const txs = [tx(275_000, '2026-05-15'), tx(275_000, '2026-06-15'), tx(275_000, '2026-07-15')]
    expect(lifetimeRules(input({ recentTxs: txs }))).toEqual([])
  })

  it('báo khi chi thực tế cao hơn giả định quá ngưỡng', () => {
    const txs = [tx(500_000, '2026-05-15'), tx(500_000, '2026-06-15'), tx(500_000, '2026-07-15')]
    const out = lifetimeRules(input({ recentTxs: txs }))
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('lifetime-drift')
    expect(out[0].kind).toBe('action')
    expect(out[0].to).toBe('/lifetime')
  })

  it('báo cả khi chi thực tế thấp hơn giả định quá ngưỡng', () => {
    const txs = [tx(100_000, '2026-05-15'), tx(100_000, '2026-06-15'), tx(100_000, '2026-07-15')]
    expect(lifetimeRules(input({ recentTxs: txs }))).toHaveLength(1)
  })

  it('bỏ giao dịch cũ hơn 3 tháng khi tính chi thực tế', () => {
    // Khoản 2025-01-15 cách 560 ngày → bị loại. Cửa sổ còn 2026-06-15 → 44 ngày,
    // cần tổng ≈ 4.000.000 × 44/365 = 482.192. Hai khoản 241.000 = 482.000.
    const txs = [tx(9_000_000, '2025-01-15'), tx(241_000, '2026-06-15'), tx(241_000, '2026-07-15')]
    expect(lifetimeRules(input({ recentTxs: txs }))).toEqual([])
  })

  it('bỏ chuyển khoản và exclude_from_stats', () => {
    // Chỉ còn khoản 2026-07-15 → cửa sổ 14 ngày, cần ≈ 4.000.000 × 14/365 = 153.425.
    const txs = [
      { ...tx(9_000_000, '2026-06-15'), type: 'transfer' } as TransactionRow,
      { ...tx(9_000_000, '2026-06-16'), exclude_from_stats: true } as TransactionRow,
      tx(153_000, '2026-07-15'),
    ]
    expect(lifetimeRules(input({ recentTxs: txs }))).toEqual([])
  })

  it('so với chặng đang hiệu lực HÔM NAY, không phải chặng cuối danh sách', () => {
    // Kịch bản có chặng Mỹ 2029 với chi nền gấp hơn hai lần. Hôm nay là 2026, nên luật
    // phải so với chặng Nhật (4.000.000) — so với chặng Mỹ thì 825.000 sẽ thành
    // "thấp hơn 57%" và báo oan.
    // Chú kiểu là BẮT BUỘC: không có nó thì `currency: 'JPY'` trong object literal dưới
    // đây nới thành `string` và `tsc -b` (npm run build) đỏ, dù vitest vẫn xanh vì nó
    // không kiểm kiểu.
    const twoPhases: LifetimeInput = {
      ...lifetime,
      phases: [
        lifetime.phases[0],
        {
          startYear: 2029,
          label: 'Mỹ',
          country: 'US',
          currency: 'JPY',
          annualIncomeMinor: 14_000_000,
          annualExpenseMinor: 9_300_000,
          fxToDisplay: 1,
        },
      ],
    }
    const txs = [tx(275_000, '2026-05-15'), tx(275_000, '2026-06-15'), tx(275_000, '2026-07-15')]
    expect(lifetimeRules(input({ recentTxs: txs, lifetime: twoPhases }))).toEqual([])
  })

  it('hoàn tiền là chi ÂM, trừ ra chứ không cộng vào', () => {
    // Chi 300.000 rồi trả hàng lấy lại 147.000 → chi thật 153.000 trong 14 ngày
    // ⇒ 3.989.143/năm, lệch 0,3% so với 4.000.000 → im.
    // Nếu lấy Math.abs thẳng: 447.000 → 11.653.929/năm → báo "cao hơn 191%" oan.
    const txs = [
      tx(300_000, '2026-07-15'),
      { ...tx(147_000, '2026-07-15'), id: 'refund', is_refund: true } as TransactionRow,
    ]
    expect(lifetimeRules(input({ recentTxs: txs }))).toEqual([])
  })

  it('bỏ dòng tiền nợ: cho vay không phải chi tiêu', () => {
    // Cho vay 9.000.000 (is_debt_flow) + chi thật 153.000 trong 14 ngày → vẫn im.
    const txs = [
      { ...tx(9_000_000, '2026-07-15'), id: 'loan', is_debt_flow: true } as TransactionRow,
      tx(153_000, '2026-07-15'),
    ]
    expect(lifetimeRules(input({ recentTxs: txs }))).toEqual([])
  })

  it('bỏ giao dịch ghi ngày tương lai', () => {
    // Khoản 2026-08-15 nằm SAU todayISO. Không chặn biên dưới thì nó vừa lọt vào tổng
    // (vì days âm vẫn <= 92), vừa làm mẫu số sai theo.
    const txs = [tx(9_000_000, '2026-08-15'), tx(153_000, '2026-07-15')]
    expect(lifetimeRules(input({ recentTxs: txs }))).toEqual([])
  })

  it('loại tiền tra theo TÀI KHOẢN, không theo giao dịch', () => {
    // Hai khẳng định trong một test, vì mỗi cái một mình đều không đủ:
    // (a) chi trên tài khoản JPY PHẢI được tính — nếu lọc theo `t.currency` (cột không
    //     tồn tại ⇒ undefined) thì cửa sổ rỗng và luật im, ca này bắt được điều đó;
    // (b) thêm một khoản khổng lồ trên tài khoản VND KHÔNG được làm đổi con số — nếu chỉ
    //     kiểm (b) bằng `toEqual([])` thì code sai cũng ra [] và test đậu oan.
    const jpyOnly = [tx(500_000, '2026-05-15'), tx(500_000, '2026-06-15'), tx(500_000, '2026-07-15')]
    const currencyOf = (id: string) => (id === 'a2' ? ('VND' as const) : ('JPY' as const))
    const a = lifetimeRules(input({ recentTxs: jpyOnly, currencyOf }))
    expect(a).toHaveLength(1)

    const withVnd = [
      ...jpyOnly,
      { ...tx(900_000_000, '2026-06-01'), id: 'vnd', account_id: 'a2' } as TransactionRow,
    ]
    const b = lifetimeRules(input({ recentTxs: withVnd, currencyOf }))
    expect(b).toHaveLength(1)
    expect(b[0].title).toBe(a[0].title)
  })

  it('mã ổn định để một việc chỉ báo một lần', () => {
    const txs = [tx(500_000, '2026-05-15'), tx(500_000, '2026-06-15'), tx(500_000, '2026-07-15')]
    const a = lifetimeRules(input({ recentTxs: txs }))
    const b = lifetimeRules(input({ recentTxs: txs, todayISO: '2026-07-30' }))
    expect(a[0].key).toBe(b[0].key)
  })

  it('nói rõ hệ quả: mốc âm dịch đi bao nhiêu', () => {
    // Chi gấp ~3 lần giả định → mốc âm phải xuất hiện hoặc dịch sớm lại.
    const txs = [tx(1_000_000, '2026-05-15'), tx(1_000_000, '2026-06-15'), tx(1_000_000, '2026-07-15')]
    const out = lifetimeRules(input({ recentTxs: txs }))
    expect(out[0].detail).toMatch(/âm/)
  })
})
