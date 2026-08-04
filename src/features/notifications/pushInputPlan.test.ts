import { describe, expect, it } from 'vitest'
import { earliestNeededDate, missingRateCurrencies, splitTxWindows } from './pushInputPlan'

describe('missingRateCurrencies', () => {
  it('chỉ có tiền gốc thì không cần tỷ giá nào', () => {
    expect(missingRateCurrencies(['JPY', 'JPY'], 'JPY', {})).toEqual([])
  })

  it('có ngoại tệ mà không có tỷ giá thì kể ra', () => {
    expect(missingRateCurrencies(['JPY', 'VND', 'USD'], 'JPY', {})).toEqual(['USD', 'VND'])
  })

  it('có đủ tỷ giá thì rỗng', () => {
    expect(missingRateCurrencies(['JPY', 'VND'], 'JPY', { VND: 170 })).toEqual([])
  })

  it('thiếu một trong nhiều loại thì chỉ kể loại thiếu', () => {
    expect(missingRateCurrencies(['JPY', 'VND', 'USD'], 'JPY', { VND: 170 })).toEqual(['USD'])
  })

  it('tỷ giá 0 vẫn tính là CÓ (0 là số, không phải thiếu dữ liệu)', () => {
    expect(missingRateCurrencies(['JPY', 'USD'], 'JPY', { USD: 0 })).toEqual([])
  })

  it('tỷ giá là null/NaN/chuỗi thì tính là THIẾU', () => {
    // JSON từ Postgres có thể trả null; `typeof null !== 'number'` nhưng
    // `rates[c] != null` thì lại lọt — nên phải dùng Number.isFinite.
    const rates = { USD: null, EUR: NaN, GBP: '1.2' } as unknown as Record<string, number>
    expect(missingRateCurrencies(['JPY', 'USD', 'EUR', 'GBP'], 'JPY', rates)).toEqual([
      'EUR',
      'GBP',
      'USD',
    ])
  })

  it('tiền gốc không có trong danh sách tỷ giá cũng không sao', () => {
    expect(missingRateCurrencies(['USD'], 'USD', {})).toEqual([])
  })
})

describe('earliestNeededDate', () => {
  it('kỳ bắt đầu ngày 1: cửa sổ 90 ngày sớm hơn đầu tháng trước', () => {
    // 90 ngày trước 2026-08-05 là 2026-05-07, sớm hơn 2026-07-01.
    expect(earliestNeededDate('2026-08-05', 1, 90)).toBe('2026-05-07')
  })

  it('cửa sổ ngắn thì đầu tháng trước mới là mốc sớm nhất', () => {
    expect(earliestNeededDate('2026-08-05', 1, 10)).toBe('2026-07-01')
  })

  it('kỳ bắt đầu ngày 25: mốc sớm nhất là ngày 25, SỚM HƠN ngày 01', () => {
    // Đây là ca mà ghép chuỗi '<YYYY-MM>-01' làm sai: hôm nay 05/08 với kỳ bắt đầu ngày
    // 25 thì "tháng này" là 25/07–24/08, "tháng trước" là 25/06–24/07. Mốc phải là
    // 2026-06-25, không phải 2026-07-01 — ghép chuỗi là đọc thiếu 6 ngày cuối tháng 6.
    expect(earliestNeededDate('2026-08-05', 25, 10)).toBe('2026-06-25')
  })

  it('ngày hôm nay TRƯỚC mốc bắt đầu kỳ thì vẫn lùi đúng hai kỳ', () => {
    // 05/08 với kỳ bắt đầu ngày 25 → hôm nay thuộc kỳ tháng 7. Kỳ trước là tháng 6.
    expect(earliestNeededDate('2026-08-20', 25, 5)).toBe('2026-06-25')
  })

  it('bắc qua đầu năm', () => {
    expect(earliestNeededDate('2027-01-03', 1, 5)).toBe('2026-12-01')
  })
})

describe('splitTxWindows', () => {
  const tx = (occurred_on: string) => ({ occurred_on })

  it('cắt đúng ba cửa sổ với kỳ bắt đầu ngày 1', () => {
    const out = splitTxWindows(
      [
        tx('2026-08-05'), // tháng này
        tx('2026-08-01'), // tháng này
        tx('2026-07-15'), // tháng trước
        tx('2026-06-30'), // không thuộc hai tháng, nhưng trong 90 ngày
        tx('2026-01-01'), // ngoài hết
      ],
      '2026-08-05',
      1,
      90,
    )
    expect(out.monthTxs.map((t) => t.occurred_on)).toEqual(['2026-08-05', '2026-08-01'])
    expect(out.prevMonthTxs.map((t) => t.occurred_on)).toEqual(['2026-07-15'])
    expect(out.recentTxs.map((t) => t.occurred_on)).toEqual([
      '2026-08-05',
      '2026-08-01',
      '2026-07-15',
      '2026-06-30',
    ])
  })

  it('recentTxs CHỒNG LÊN hai cửa sổ kia, không phải phần còn lại', () => {
    // Nếu viết else-if cho recentTxs thì giao dịch hôm nay biến mất khỏi recentTxs, và
    // mọi luật nhịp (lâu chưa ghi sổ, gợi ý định kỳ) đọc thiếu dữ liệu mới nhất.
    const out = splitTxWindows([tx('2026-08-05')], '2026-08-05', 1, 90)
    expect(out.monthTxs).toHaveLength(1)
    expect(out.recentTxs).toHaveLength(1)
  })

  it('kỳ bắt đầu ngày 25: ngày 05/08 thuộc kỳ tháng 7, không phải tháng 8', () => {
    const out = splitTxWindows(
      [
        tx('2026-08-05'), // kỳ 25/07–24/08 = "tháng này"
        tx('2026-07-20'), // kỳ 25/06–24/07 = "tháng trước"
        tx('2026-07-26'), // cũng là "tháng này"
      ],
      '2026-08-05',
      25,
      90,
    )
    expect(out.monthTxs.map((t) => t.occurred_on)).toEqual(['2026-08-05', '2026-07-26'])
    expect(out.prevMonthTxs.map((t) => t.occurred_on)).toEqual(['2026-07-20'])
  })

  it('giao dịch tương lai (định kỳ đã sinh trước) vẫn vào tháng này nếu cùng kỳ', () => {
    const out = splitTxWindows([tx('2026-08-20')], '2026-08-05', 1, 90)
    expect(out.monthTxs).toHaveLength(1)
    // Nhưng KHÔNG vào recentTxs theo mốc dưới — recentTxs chỉ chặn phía quá khứ.
    expect(out.recentTxs).toHaveLength(1)
  })

  it('đúng biên cửa sổ gần đây thì vẫn tính (>= chứ không >)', () => {
    const out = splitTxWindows([tx('2026-05-07')], '2026-08-05', 1, 90)
    expect(out.recentTxs).toHaveLength(1)
  })

  it('sớm hơn biên một ngày thì bị loại', () => {
    const out = splitTxWindows([tx('2026-05-06')], '2026-08-05', 1, 90)
    expect(out.recentTxs).toHaveLength(0)
  })

  it('mẻ rỗng ra ba mảng rỗng, không nổ', () => {
    expect(splitTxWindows([], '2026-08-05', 1, 90)).toEqual({
      monthTxs: [],
      prevMonthTxs: [],
      recentTxs: [],
    })
  })
})
