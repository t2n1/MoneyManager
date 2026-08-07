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

/** Khoản THU trên cùng tài khoản JPY — đối trọng của `tx` (chi). */
function txIn(amount: number, occurred_on: string): TransactionRow {
  return { ...tx(amount, occurred_on), id: `i-${occurred_on}-${amount}`, type: 'income' } as TransactionRow
}

/** Ba khoản chi 275.000 (05-15 → 07-15, cửa sổ 75 ngày) ⇒ 4.014.500/năm — lệch 0,4%
 *  so với giả định 4.000.000 nên luật CHI im. Dùng làm nền cho các phép thử về THU:
 *  vừa neo cửa sổ đủ 30 ngày, vừa bảo đảm thông báo duy nhất (nếu có) là về thu. */
const quietExpenses = [tx(275_000, '2026-05-15'), tx(275_000, '2026-06-15'), tx(275_000, '2026-07-15')]

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
    expect(out[0].to).toBe('/assets?view=future')
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
    // Hai khoản CÒN LẠI cách nhau đủ xa để cửa sổ trải 44 ngày (2026-06-15 → hôm nay),
    // tức qua được `MIN_WINDOW_DAYS`. Chốt này là BẮT BUỘC: nếu chỉ để lại một khoản
    // 2026-07-15 (cửa sổ 14 ngày) thì luật im vì THIẾU DỮ LIỆU, và phép thử sẽ xanh
    // ngay cả khi hai điều kiện loại trừ nó sinh ra để canh bị xóa sạch.
    // Cần ≈ 4.000.000 × 44/365 = 482.192; hai khoản 241.000 = 482.000 ⇒ 3.998.409/năm,
    // lệch 0,04% → im. Kéo một trong hai dòng 9.000.000 vào thì thành 78.657.500/năm.
    const txs = [
      { ...tx(9_000_000, '2026-06-15'), id: 'transfer', type: 'transfer' } as TransactionRow,
      { ...tx(9_000_000, '2026-06-16'), id: 'excluded', exclude_from_stats: true } as TransactionRow,
      tx(241_000, '2026-06-15'),
      tx(241_000, '2026-07-15'),
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
    // Chi 800.000 (2026-06-15) rồi trả hàng lấy lại 318.000 → chi thật 482.000 trên
    // cửa sổ 44 ngày ⇒ 3.998.409/năm, lệch 0,04% so với 4.000.000 → im.
    // Nếu KHÔNG áp expenseSign (cộng dồn 1.118.000): 9.274.318/năm → "cao hơn 132%" oan.
    // Khoản chi phải nằm ở 2026-06-15 để cửa sổ trải đủ `MIN_WINDOW_DAYS` — cả hai
    // khoản cùng ở 2026-07-15 thì luật im vì thiếu dữ liệu và phép thử vô nghĩa.
    const txs = [
      tx(800_000, '2026-06-15'),
      { ...tx(318_000, '2026-07-15'), id: 'refund', is_refund: true } as TransactionRow,
    ]
    expect(lifetimeRules(input({ recentTxs: txs }))).toEqual([])
  })

  it('bỏ dòng tiền nợ: cho vay không phải chi tiêu', () => {
    // Cho vay 9.000.000 (is_debt_flow) + chi thật 482.000 trên cửa sổ 44 ngày → im.
    // Tính cả khoản cho vay thì thành 78.657.500/năm. Hai khoản chi cách nhau một tháng
    // là để cửa sổ qua được `MIN_WINDOW_DAYS`, xem ghi chú ở phép thử chuyển khoản.
    const txs = [
      { ...tx(9_000_000, '2026-06-15'), id: 'loan', is_debt_flow: true } as TransactionRow,
      tx(241_000, '2026-06-15'),
      tx(241_000, '2026-07-15'),
    ]
    expect(lifetimeRules(input({ recentTxs: txs }))).toEqual([])
  })

  it('bỏ giao dịch ghi ngày tương lai', () => {
    // Khoản 2026-08-15 nằm SAU todayISO: không chặn biên dưới thì nó lọt vào tổng (days
    // âm vẫn <= WINDOW_DAYS) và 482.000 thành 9.482.000 ⇒ 78.657.500/năm.
    // Nửa còn lại của lỗi cũ — khoản tương lai làm `oldest` rồi kéo mẫu số xuống âm —
    // nay do `MIN_WINDOW_DAYS` chặn (days âm thì < 30 nên luật im). Ca này canh nửa
    // "lọt vào tổng", và cửa sổ vẫn phải trải 44 ngày để không im vì thiếu dữ liệu.
    const txs = [tx(9_000_000, '2026-08-15'), tx(241_000, '2026-06-15'), tx(241_000, '2026-07-15')]
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
    // Chi gấp ~3,65 lần giả định (3.000.000 trong 75 ngày ⇒ 14.600.000/năm) → mốc âm
    // phải xuất hiện hoặc dịch sớm lại.
    const txs = [tx(1_000_000, '2026-05-15'), tx(1_000_000, '2026-06-15'), tx(1_000_000, '2026-07-15')]
    const out = lifetimeRules(input({ recentTxs: txs }))
    expect(out[0].detail).toMatch(/âm/)
  })

  it('im khi cửa sổ dữ liệu chưa trải đủ 30 ngày', () => {
    // Một suất cơm ¥20.000 ghi HÔM NAY. Với sàn mẫu số 1 ngày của bản cũ:
    // 20.000 × 365 = 7.300.000/năm → "Chi thực tế cao hơn kế hoạch 83%" kèm một cái
    // năm âm rất cụ thể, dựng lên từ đúng một giao dịch.
    expect(lifetimeRules(input({ recentTxs: [tx(20_000, '2026-07-29')] }))).toEqual([])

    // Biên của ngưỡng. Cùng MỘT số tiền, chỉ khác ngày: 2026-07-01 là 28 ngày → im;
    // 2026-06-29 là 30 ngày → nói. Cả hai đều vượt ngưỡng lệch 15% (13.035.714/năm và
    // 12.166.667/năm so với 4.000.000), nên thứ DUY NHẤT phân biệt hai ca là số ngày.
    expect(lifetimeRules(input({ recentTxs: [tx(1_000_000, '2026-07-01')] }))).toEqual([])
    expect(lifetimeRules(input({ recentTxs: [tx(1_000_000, '2026-06-29')] }))).toHaveLength(1)
  })

  it('im khi hoàn tiền nhiều hơn chi: tổng cửa sổ ÂM thì không có gì để nói', () => {
    // Mua TRƯỚC cửa sổ, trả hàng TRONG cửa sổ → tổng −300.000 trên 44 ngày.
    // Không chặn thì ra −2.488.636/năm, tức "thấp hơn kế hoạch 162%" — mức giảm quá
    // 100% là bất khả về số học, thông báo tự nói ngược chính nó. Tệ hơn: số chi ÂM đi
    // vào projectLifetime biến chặng đó thành NGUỒN THU 2,5 triệu/năm, nên câu hệ quả
    // cũng lộn ngược. Không kẹp về 0 vì "cả quý không chi gì" cũng là một câu sai.
    const txs = [
      tx(100_000, '2026-06-15'),
      { ...tx(400_000, '2026-07-15'), id: 'refund', is_refund: true } as TransactionRow,
    ]
    expect(lifetimeRules(input({ recentTxs: txs }))).toEqual([])
  })

  it("đọc biên DƯỚI của dải ('low'), cùng nhánh với màn hình nó dẫn tới", () => {
    // `bandSpreadBps: 0` của fixture chung làm hai nhánh trùng nhau, nên mọi phép thử
    // khác đều KHÔNG thấy được sự khác biệt này. Ở đây dùng đúng mặc định của migration
    // 0031 (band_spread_bps = 150).
    const banded: LifetimeInput = {
      ...lifetime,
      bandSpreadBps: 150,
      startingAssetsMinor: 100_000_000,
    }
    // Cửa sổ 2026-05-17 → 2026-07-29 là 73 ngày, và 365/73 = 5 chẵn: 1.600.000 × 5 =
    // 8.000.000/năm đúng tròn, gấp đôi giả định 4.000.000 → vượt ngưỡng.
    // Với chi 8.000.000: nhánh TRUNG TÂM không năm nào âm, còn biên DƯỚI âm từ 2083.
    // Kế hoạch (4.000.000) thì cả hai nhánh đều không âm.
    const txs = [tx(800_000, '2026-05-17'), tx(800_000, '2026-07-15')]
    const out = lifetimeRules(input({ recentTxs: txs, lifetime: banded }))
    expect(out).toHaveLength(1)
    // Đọc 'center' thì câu này thành "Bản chiếu vẫn không năm nào âm." — trong khi
    // tab Tương lai của Tài sản và InsightCards đều đang tô đỏ năm 2083.
    expect(out[0].detail).toContain('âm từ 2083')
  })

  it('nói được ca đáng nói nhất: mốc âm của kế hoạch BIẾN MẤT', () => {
    const overspending: LifetimeInput = {
      ...lifetime,
      phases: [{ ...lifetime.phases[0], annualExpenseMinor: 10_000_000 }],
    }
    // Kế hoạch: thu 6.000.000 − chi 10.000.000 = thiếu 4.000.000/năm; 10.000.000 vốn
    // ban đầu (lợi suất 2%) đi 6.200.000 → 2.324.000 → −1.629.520, tức âm từ 2028.
    // Chi thật: 1.200.000 trong 73 ngày ⇒ 6.000.000/năm, bằng đúng thu → không năm nào âm.
    const txs = [tx(600_000, '2026-05-17'), tx(600_000, '2026-07-15')]
    const out = lifetimeRules(input({ recentTxs: txs, lifetime: overspending }))
    expect(out).toHaveLength(1)
    // Hỏi `actualNeg === null` TRƯỚC `planNeg` thì câu này là "Bản chiếu vẫn không năm
    // nào âm." — phủ nhận đúng cái tin tốt vừa xảy ra.
    expect(out[0].detail).toContain('Mốc âm 2028 biến mất.')
  })

  it('báo khi thu thực tế thấp hơn kế hoạch quá ngưỡng', () => {
    // Thu 3 × 200.000 = 600.000 trên cửa sổ 75 ngày ⇒ 2.920.000/năm so với kế hoạch
    // 6.000.000 → thấp hơn 51%. Chi giữ ở mức im (xem `quietExpenses`) nên thông báo
    // duy nhất phải là về THU.
    const txs = [...quietExpenses, txIn(200_000, '2026-05-15'), txIn(200_000, '2026-06-15'), txIn(200_000, '2026-07-15')]
    const out = lifetimeRules(input({ recentTxs: txs }))
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe('lifetime-drift:income')
    expect(out[0].type).toBe('lifetime-drift')
    expect(out[0].title).toBe('Thu thực tế thấp hơn kế hoạch 51%')
    expect(out[0].to).toBe('/assets?view=future')
  })

  it('báo khi thu thực tế cao hơn kế hoạch quá ngưỡng', () => {
    // 3 × 700.000 = 2.100.000 trên 75 ngày ⇒ 10.220.000/năm → cao hơn 70%.
    const txs = [...quietExpenses, txIn(700_000, '2026-05-15'), txIn(700_000, '2026-06-15'), txIn(700_000, '2026-07-15')]
    const out = lifetimeRules(input({ recentTxs: txs }))
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Thu thực tế cao hơn kế hoạch 70%')
  })

  it('im về thu khi sổ KHÔNG có khoản thu nào — thiếu dữ liệu là im, không đoán "mất thu nhập"', () => {
    // Kế hoạch thu 6.000.000 nhưng sổ chỉ có chi: rất nhiều người không ghi lương vào
    // app. Suy "thu thực tế = 0" từ chỗ trống rồi báo "thấp hơn kế hoạch 100%" là báo
    // oan vĩnh viễn cho họ (mục H của spec: thiếu dữ liệu thì im).
    expect(lifetimeRules(input({ recentTxs: quietExpenses }))).toEqual([])
  })

  it('báo khi kế hoạch để thu 0 mà sổ CÓ thu nhập đáng kể', () => {
    // Đúng ca người dùng gặp thật (2026-08): kịch bản đầu tiên chép thu = 0 từ sổ chưa
    // ghi lương, sau đó lương ĐÃ được ghi mà kế hoạch vẫn 0 — bản chiếu âm oan toàn bộ.
    // Thu 3 × 411.000 = 1.233.000 trên 75 ngày ⇒ 5.999.400/năm.
    const zeroIncome: LifetimeInput = {
      ...lifetime,
      phases: [{ ...lifetime.phases[0], annualIncomeMinor: 0 }],
    }
    const txs = [...quietExpenses, txIn(411_000, '2026-05-15'), txIn(411_000, '2026-06-15'), txIn(411_000, '2026-07-15')]
    const out = lifetimeRules(input({ recentTxs: txs, lifetime: zeroIncome }))
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe('lifetime-drift:income')
    expect(out[0].title).toBe('Sổ có thu nhập, kế hoạch đang để thu 0')
    // Kế hoạch (thu 0, chi 4M, vốn 10M) âm trong vài năm; thu thật ~6M > chi → hết âm.
    // Câu hệ quả phải nói được tin tốt đó.
    expect(out[0].detail).toMatch(/biến mất/)
  })

  it('im khi kế hoạch thu 0 và thu trong sổ chỉ lặt vặt', () => {
    // 30.000 trên 75 ngày ⇒ 146.000/năm — dưới 15% của chi kế hoạch (600.000). Vài
    // khoản bán đồ cũ không phải "thu nhập bị bỏ quên", báo là nhiễu.
    const zeroIncome: LifetimeInput = {
      ...lifetime,
      phases: [{ ...lifetime.phases[0], annualIncomeMinor: 0 }],
    }
    const txs = [...quietExpenses, txIn(30_000, '2026-06-15')]
    expect(lifetimeRules(input({ recentTxs: txs, lifetime: zeroIncome }))).toEqual([])
  })

  it('mã của thông báo thu ổn định để một việc chỉ báo một lần', () => {
    const txs = [...quietExpenses, txIn(200_000, '2026-05-15'), txIn(200_000, '2026-06-15'), txIn(200_000, '2026-07-15')]
    const a = lifetimeRules(input({ recentTxs: txs }))
    const b = lifetimeRules(input({ recentTxs: txs, todayISO: '2026-07-30' }))
    expect(a[0].key).toBe(b[0].key)
  })

  it('chi và thu cùng lệch thì ra HAI thông báo, chi đứng trước', () => {
    // Chi 3 × 500.000 ⇒ 7.300.000/năm (cao hơn 83%); thu 3 × 200.000 ⇒ 2.920.000/năm
    // (thấp hơn 51%) — hai chuyện khác nhau, mỗi cái một thông báo với mã riêng.
    const txs = [
      tx(500_000, '2026-05-15'), tx(500_000, '2026-06-15'), tx(500_000, '2026-07-15'),
      txIn(200_000, '2026-05-15'), txIn(200_000, '2026-06-15'), txIn(200_000, '2026-07-15'),
    ]
    const out = lifetimeRules(input({ recentTxs: txs }))
    expect(out).toHaveLength(2)
    expect(out[0].key).toBe('lifetime-drift:current')
    expect(out[1].key).toBe('lifetime-drift:income')
  })

  it('nói ra con số đã suy và cửa sổ đã dùng, để người dùng kiểm lại được', () => {
    // 1.600.000 trong 73 ngày ⇒ 8.000.000/năm (365/73 = 5 chẵn) → "cao hơn 100%".
    const txs = [tx(800_000, '2026-05-17'), tx(800_000, '2026-07-15')]
    const out = lifetimeRules(input({ recentTxs: txs, formatMoney: (m, c) => `${m} ${c}` }))
    expect(out[0].title).toBe('Chi thực tế cao hơn kế hoạch 100%')
    // Tiền in theo loại tiền CỦA CHẶNG, không phải `base` — chặng Mỹ dùng USD thì con
    // số phải là USD.
    expect(out[0].detail).toContain('8000000 JPY')
    expect(out[0].detail).toContain('73 ngày')
  })
})
