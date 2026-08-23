import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import { formatCompact } from '../../lib/money'
import {
  axisCeiling,
  dailySpendSeries,
  daysWorthAsking,
  labelThreshold,
  type DaySpend,
} from './dailySpike'

// base = JPY: 1 ¥ = 165 ₫
const RATES: Rates = { JPY: 1, VND: 165 }
const currencyOf = (id: string): CurrencyCode => (id === 'vnd' ? 'VND' : 'JPY')

let seq = 0
function tx(p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount'>): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    category_id: null,
    account_id: 'jpy',
    to_account_id: null,
    to_amount: null,
    recurring_rule_id: null,
    occurred_on: '2026-08-01',
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  }
}

/** Chuỗi ngày của một tháng ngắn cho gọn: 01/08 → 05/08. */
const series = (txs: TransactionRow[], transferIds: ReadonlySet<string> = new Set()) =>
  dailySpendSeries(txs, '2026-08-01', '2026-08-05', currencyOf, 'JPY', RATES, transferIds)

describe('dailySpendSeries — chuỗi ngày', () => {
  it('trả đủ mọi ngày trong khoảng, ngày không chi là 0', () => {
    const r = series([tx({ type: 'expense', amount: 1_000, occurred_on: '2026-08-03' })])
    expect(r.days.map((d) => d.date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ])
    expect(r.days.map((d) => d.total)).toEqual([0, 0, 1_000, 0, 0])
  })

  it('cộng nhiều khoản trong cùng một ngày', () => {
    const r = series([
      tx({ type: 'expense', amount: 1_000, occurred_on: '2026-08-02' }),
      tx({ type: 'expense', amount: 2_500, occurred_on: '2026-08-02' }),
    ])
    expect(r.days[1].total).toBe(3_500)
  })

  it('quy đổi ngoại tệ về base', () => {
    const r = series([
      tx({ type: 'expense', amount: 165_000, account_id: 'vnd', occurred_on: '2026-08-01' }),
    ])
    expect(r.days[0].total).toBe(1_000)
  })

  it('thu nhập không vào chuỗi chi', () => {
    const r = series([tx({ type: 'income', amount: 300_000, occurred_on: '2026-08-01' })])
    expect(r.days[0].total).toBe(0)
  })
})

describe('dailySpendSeries — cùng luật loại trừ với aggregate', () => {
  it('bỏ dòng tiền nợ/cho vay và giao dịch không tính vào thống kê', () => {
    const r = series([
      tx({ type: 'expense', amount: 5_000, occurred_on: '2026-08-01', is_debt_flow: true }),
      tx({ type: 'expense', amount: 7_000, occurred_on: '2026-08-01', exclude_from_stats: true }),
      tx({ type: 'expense', amount: 900, occurred_on: '2026-08-01' }),
    ])
    expect(r.days[0].total).toBe(900)
  })

  it('bỏ danh mục chuyển tài sản', () => {
    const r = series(
      [
        tx({ type: 'expense', amount: 30_000, category_id: 'gui-ve-vn', occurred_on: '2026-08-01' }),
        tx({ type: 'expense', amount: 800, category_id: 'food', occurred_on: '2026-08-01' }),
      ],
      new Set(['gui-ve-vn']),
    )
    expect(r.days[0].total).toBe(800)
  })

  it('hoàn tiền là chi ÂM, trừ khỏi tổng của chính ngày đó', () => {
    const r = series([
      tx({ type: 'expense', amount: 4_000, occurred_on: '2026-08-02' }),
      tx({ type: 'expense', amount: 1_500, occurred_on: '2026-08-02', is_refund: true }),
    ])
    expect(r.days[1].total).toBe(2_500)
  })

  it('thiếu tỷ giá thì loại khoản đó và bật cờ, KHÔNG quy 1:1', () => {
    const r = dailySpendSeries(
      [
        tx({ type: 'expense', amount: 999, account_id: 'usd', occurred_on: '2026-08-01' }),
        tx({ type: 'expense', amount: 600, occurred_on: '2026-08-01' }),
      ],
      '2026-08-01',
      '2026-08-05',
      (id) => (id === 'usd' ? 'USD' : 'JPY'),
      'JPY',
      RATES, // không có USD
      new Set(),
    )
    expect(r.hasMissingRate).toBe(true)
    expect(r.days[0].total).toBe(600)
  })
})

describe('dailySpendSeries — mức chi thường ngày', () => {
  it('là TRUNG VỊ của những ngày CÓ chi, không phải trung bình cả tháng', () => {
    // 1 ngày ¥100.000 + 4 ngày ¥1.000: trung bình 20.800, trung vị 1.000.
    const r = series([
      tx({ type: 'expense', amount: 100_000, occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 1_000, occurred_on: '2026-08-02' }),
      tx({ type: 'expense', amount: 1_000, occurred_on: '2026-08-03' }),
      tx({ type: 'expense', amount: 1_000, occurred_on: '2026-08-04' }),
      tx({ type: 'expense', amount: 1_000, occurred_on: '2026-08-05' }),
    ])
    expect(r.typical).toBe(1_000)
  })

  it('không tính ngày không chi vào trung vị', () => {
    // chỉ 2 ngày có chi: 1.000 và 3.000 → trung vị 2.000, không phải 800 (chia cho 5 ngày)
    const r = series([
      tx({ type: 'expense', amount: 1_000, occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 3_000, occurred_on: '2026-08-05' }),
    ])
    expect(r.typical).toBe(2_000)
  })

  it('cả tháng không chi thì bằng 0', () => {
    expect(series([]).typical).toBe(0)
  })
})

describe('dailySpendSeries — ngày đỉnh', () => {
  it('chỉ đúng ngày chi cao nhất', () => {
    const r = series([
      tx({ type: 'expense', amount: 1_000, occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 9_000, occurred_on: '2026-08-04' }),
      tx({ type: 'expense', amount: 2_000, occurred_on: '2026-08-05' }),
    ])
    expect(r.peakIndex).toBe(3)
    expect(r.days[r.peakIndex].date).toBe('2026-08-04')
  })

  it('hai ngày bằng nhau thì lấy ngày SỚM hơn', () => {
    const r = series([
      tx({ type: 'expense', amount: 5_000, occurred_on: '2026-08-02' }),
      tx({ type: 'expense', amount: 5_000, occurred_on: '2026-08-04' }),
    ])
    expect(r.peakIndex).toBe(1)
  })

  it('cả tháng không chi thì không có đỉnh', () => {
    expect(series([]).peakIndex).toBe(-1)
  })
})

describe('dailySpendSeries — mấy khoản lớn nhất trong ngày', () => {
  it('xếp giảm dần và cắt ở 3 khoản', () => {
    const r = series([
      tx({ type: 'expense', amount: 100, occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 4_000, occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 900, occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 2_000, occurred_on: '2026-08-01' }),
    ])
    expect(r.days[0].top.map((t) => t.amount)).toEqual([4_000, 2_000, 900])
  })

  it('trả id danh mục và ghi chú thô, KHÔNG trả tên danh mục', () => {
    const r = series([
      tx({
        type: 'expense',
        amount: 84_200,
        category_id: 'nha',
        note: 'tiền nhà tháng 8',
        occurred_on: '2026-08-03',
      }),
    ])
    expect(r.days[2].top).toEqual([
      { categoryId: 'nha', note: 'tiền nhà tháng 8', amount: 84_200 },
    ])
  })

  it('khoản hoàn tiền không nằm trong mấy khoản lớn nhất', () => {
    // Nó là chi âm — xếp nó vào "khoản lớn nhất trong ngày" là đọc ngược.
    const r = series([
      tx({ type: 'expense', amount: 4_000, occurred_on: '2026-08-02', is_refund: true }),
      tx({ type: 'expense', amount: 900, occurred_on: '2026-08-02' }),
    ])
    expect(r.days[1].top.map((t) => t.amount)).toEqual([900])
  })

  it('ngày không chi thì rỗng', () => {
    expect(series([]).days[0].top).toEqual([])
  })
})

/** Chuỗi ngày trần cho ba hàm hình học — không cần dựng giao dịch để thử một phép clamp. */
const day = (date: string, total: number): DaySpend => ({ date, total, top: [] })

describe('axisCeiling — cắt trục (B42)', () => {
  it('MỘT ngày dị thường thì mức cắt bám ngày CAO THỨ HAI', () => {
    // Ca thật tháng 8/2026: tiền nhà ¥124.696 ngày 1, ngày cao nhì ¥31.000, trung vị ¥4.850.
    const days = [
      day('2026-08-01', 124_696),
      day('2026-08-02', 31_000),
      day('2026-08-03', 5_000),
      day('2026-08-04', 4_850),
    ]
    // 31.000 × 1,05 = 32.550, lớn hơn sàn 4.850 × 4 = 19.400 → cắt ở 32.550, không phải 124.696.
    expect(axisCeiling(days, 4_850)).toBe(32_550)
  })

  it('mọi ngày đều nhau thì KHÔNG cắt — trả về max', () => {
    // Không có luật này thì tháng nào cũng đều sẽ bị nén vào một dải chật, nơi mọi cột cao
    // bằng nhau và biểu đồ không nói được gì.
    const days = [day('2026-08-01', 5_000), day('2026-08-02', 5_000), day('2026-08-03', 5_000)]
    expect(axisCeiling(days, 5_000)).toBe(5_000)
  })

  it('chỉ một ngày có chi thì không cắt và không chia cho 0', () => {
    const days = [day('2026-08-01', 10_000), day('2026-08-02', 0)]
    expect(axisCeiling(days, 10_000)).toBe(10_000)
  })

  it('cả khoảng không chi thì trả 0, không phải NaN', () => {
    expect(axisCeiling([day('2026-08-01', 0)], 0)).toBe(0)
  })

  it('ngày ÂM không kéo mức cắt xuống — nó có dải riêng dưới đường 0', () => {
    const days = [day('2026-08-01', 8_000), day('2026-08-02', -1_800), day('2026-08-03', 6_000)]
    expect(axisCeiling(days, 7_000)).toBe(8_000)
  })
})

describe('labelThreshold — nhãn số theo BỀ RỘNG cột (B43)', () => {
  it('cột rộng ≥ 34px thì mọi cột đều có nhãn', () => {
    // Thẻ chiếm hết chiều ngang Bản tin (~1.560px trên máy người dùng) → mỗi cột ~44px.
    expect(labelThreshold(44, 4_850)).toEqual({ mode: 'all', min: 0 })
  })

  it('cột 20–34px chỉ in cột ≥ gấp đôi ngày thường', () => {
    // Không có luật này thì 31 số cùng độ đậm và mắt không biết đọc số nào.
    expect(labelThreshold(26, 4_850)).toEqual({ mode: 'big', min: 9_700 })
  })

  it('cột < 20px thì không nhãn nào — chữ lo phần này', () => {
    // Ở 375px mỗi cột rộng 8px thật; danh sách "ba ngày đáng hỏi" thay nhãn số.
    expect(labelThreshold(8, 4_850).mode).toBe('none')
  })

  it('万 bắt đầu đúng ở 10.000, dưới đó in nguyên chữ số (B43.1)', () => {
    // Dùng lại formatCompact chứ không viết bản thứ hai: nó đã theo đúng luật này.
    // "0.1万" xoá hết chữ số có nghĩa của ¥980; "31,000" thì rộng gấp đôi "3.1万".
    expect(formatCompact(9_999, 'JPY')).toBe('9999')
    expect(formatCompact(10_000, 'JPY')).toBe('1万')
    expect(formatCompact(31_000, 'JPY')).toBe('3.1万')
  })
})

describe('daysWorthAsking — ba ngày đáng hỏi (B48)', () => {
  it('ngày ÂM luôn có mặt dù không phải ngày to nhất (B48.2)', () => {
    // Một ngày hoàn tiền nhiều hơn chi là chuyện lạ, mà ở 375px cột 8px màu xanh mọc xuống
    // thì dễ bị bỏ qua nhất.
    const days = [
      day('2026-08-01', 124_696),
      day('2026-08-02', 31_000),
      day('2026-08-03', 29_000),
      day('2026-08-04', -1_800),
    ]
    expect(daysWorthAsking(days, '2026-08-31').map((d) => d.date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-04',
    ])
  })

  it('xếp theo NGÀY, không theo tiền — nó đứng cạnh một biểu đồ có trục ngày', () => {
    const days = [day('2026-08-01', 1_000), day('2026-08-02', 90_000), day('2026-08-03', 5_000)]
    expect(daysWorthAsking(days, '2026-08-31').map((d) => d.date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ])
  })

  it('bỏ ngày chưa tới và ngày không tiêu gì', () => {
    const days = [day('2026-08-01', 1_000), day('2026-08-02', 0), day('2026-08-03', 5_000)]
    expect(daysWorthAsking(days, '2026-08-02').map((d) => d.date)).toEqual(['2026-08-01'])
  })
})

describe('dailySpendSeries — công tắc bỏ khoản cố định (B46)', () => {
  const nha = tx({
    type: 'expense',
    amount: 112_760,
    category_id: 'nha',
    occurred_on: '2026-08-01',
  })
  const an = [
    tx({ type: 'expense', amount: 3_000, category_id: 'an', occurred_on: '2026-08-02' }),
    tx({ type: 'expense', amount: 4_000, category_id: 'an', occurred_on: '2026-08-03' }),
    tx({ type: 'expense', amount: 5_000, category_id: 'an', occurred_on: '2026-08-04' }),
  ]
  const build = (exclude: ReadonlySet<string>) =>
    dailySpendSeries(
      [nha, ...an],
      '2026-08-01',
      '2026-08-05',
      currencyOf,
      'JPY',
      RATES,
      new Set(),
      exclude,
    )

  it('tập rỗng cho kết quả Y HỆT bản chưa có tham số này', () => {
    const cu = dailySpendSeries([nha, ...an], '2026-08-01', '2026-08-05', currencyOf, 'JPY', RATES, new Set())
    expect(build(new Set())).toEqual(cu)
  })

  it('lọc rồi thì typical VÀ peakIndex đều tính trên tập đã lọc', () => {
    // Giữ trung vị cũ là so ngày thường của một tập với đường của tập khác (B46.3).
    // Chưa lọc: 4 ngày có chi [3.000 · 4.000 · 5.000 · 112.760] → trung vị 4.500.
    const cu = build(new Set())
    expect(cu.typical).toBe(4_500)
    expect(cu.peakIndex).toBe(0)

    // Bỏ tiền nhà: còn 3 ngày → trung vị 4.000. Con số ĐỔI, đúng như B46.3 đòi.
    const moi = build(new Set(['nha']))
    expect(moi.typical).toBe(4_000)
    // Đỉnh chuyển sang ngày 04 (¥5.000), không còn là ngày tiền nhà.
    expect(moi.peakIndex).toBe(3)
    expect(moi.days[0].total).toBe(0)
  })

  it('txCount đếm theo tập ĐÃ lọc — mẫu số của dòng "chưa gắn nhãn"', () => {
    expect(build(new Set()).txCount).toBe(4)
    expect(build(new Set(['nha'])).txCount).toBe(3)
  })
})
