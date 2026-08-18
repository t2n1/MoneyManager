import { describe, expect, it } from 'vitest'
import type { MonthKey } from '../../lib/dates'
import {
  ALL_SCOPE_MIN_MONTHS,
  baselineLevel,
  findRegime,
  longScopeOptions,
  longTable,
  monthAverages,
  regimeSplitsComparison,
  remitStrip,
  type RangePoint,
} from './longRange'

/** Chuỗi tháng liên tục bắt đầu từ `start`, chi lấy từ `expenses`. */
function seq(start: MonthKey, expenses: number[], income = 400_000): RangePoint[] {
  return expenses.map((expense, i) => {
    const m0 = start.month - 1 + i
    return {
      key: { year: start.year + Math.floor(m0 / 12), month: (m0 % 12) + 1 },
      income,
      expense,
    }
  })
}

describe('baselineLevel', () => {
  it('TRUNG VỊ, không phải trung bình — một chuyến đi không được kéo mức nền lên', () => {
    const thang = [200, 210, 205, 195, 900]
    expect(baselineLevel(thang)).toBe(205)
    const mean = thang.reduce((a, b) => a + b, 0) / thang.length
    expect(mean).toBeGreaterThan(340) // trung bình sẽ nói sai
  })

  it('số chẵn phần tử = trung bình hai giữa', () => {
    expect(baselineLevel([100, 200, 300, 400])).toBe(250)
  })

  it('dãy rỗng → 0', () => {
    expect(baselineLevel([])).toBe(0)
  })
})

describe('findRegime', () => {
  /** 10 tháng ~500k rồi 14 tháng ~245k — đúng hình dạng dữ liệu thật. */
  const points = seq({ year: 2024, month: 9 }, [
    510_000, 505_000, 515_000,
    // 2024/12 đổi nếp
    246_000, 240_000, 250_000, 245_000, 248_000, 244_000, 400_000, 245_000, 243_000,
    247_000, 246_000, 249_000, 242_000, 250_000,
  ])

  it('tìm ra cú đổi nếp và mức nền kể từ đó', () => {
    const r = findRegime(points)
    expect(r).not.toBeNull()
    expect(r!.key).toEqual({ year: 2024, month: 12 })
    expect(r!.changePct).toBeLessThan(-40)
    // Mức nền là TRUNG VỊ đoạn sau, nên tháng 400k không kéo nó lên.
    expect(r!.baseline).toBeGreaterThan(240_000)
    expect(r!.baseline).toBeLessThan(250_000)
  })

  it('dưới 8 tháng → null (không đủ để gọi là đổi nếp)', () => {
    expect(findRegime(seq({ year: 2026, month: 1 }, [100, 100, 500, 500]))).toBeNull()
  })

  it('mức chi ổn định → null, không bịa ra một cú đổi', () => {
    expect(
      findRegime(seq({ year: 2025, month: 1 }, Array<number>(14).fill(250_000))),
    ).toBeNull()
  })
})

describe('longScopeOptions', () => {
  const p24 = seq({ year: 2024, month: 9 }, Array<number>(24).fill(250_000))

  it('24 tháng dữ liệu → KHÔNG có mốc "Tất cả" (nó trùng "3 năm")', () => {
    const opts = longScopeOptions(p24, null)
    expect(opts.map((o) => o.key)).toEqual(['12m'])
  })

  it('vượt 36 tháng mới thêm mốc "Tất cả"', () => {
    const p40 = seq({ year: 2023, month: 1 }, Array<number>(40).fill(250_000))
    expect(longScopeOptions(p40, null).map((o) => o.key)).toEqual(['12m', 'all'])
    expect(ALL_SCOPE_MIN_MONTHS).toBe(36)
  })

  it('mốc "Từ khi đổi nếp" mang đúng tháng đổi vào nhãn', () => {
    const opts = longScopeOptions(p24, 3) // 21 tháng kể từ cú đổi
    expect(opts.map((o) => o.key)).toEqual(['12m', 'regime'])
    expect(opts[1].label).toContain('2024/12')
    expect(opts[1].months).toBe(21)
  })

  it('cú đổi cách đây ~12 tháng → KHÔNG thêm mốc (hai nút sẽ trùng nhau)', () => {
    const opts = longScopeOptions(p24, 12) // đúng 12 tháng kể từ cú đổi
    expect(opts.map((o) => o.key)).toEqual(['12m'])
  })

  it('cú đổi quá gần (dưới 6 tháng) → không thêm mốc', () => {
    expect(longScopeOptions(p24, 20).map((o) => o.key)).toEqual(['12m'])
  })

  it('ít hơn 12 tháng dữ liệu thì mốc 12 tháng chỉ lấy những gì có', () => {
    const p5 = seq({ year: 2026, month: 4 }, [1, 2, 3, 4, 5])
    expect(longScopeOptions(p5, null)[0].months).toBe(5)
  })
})

describe('longTable', () => {
  // 24 tháng: 12 tháng đầu 300k, 12 tháng sau 200k.
  const points = seq(
    { year: 2025, month: 9 },
    [...Array<number>(12).fill(300_000), ...Array<number>(12).fill(200_000)],
  )

  it('in ĐỦ 12 dòng, mới nhất lên đầu', () => {
    const t = longTable(points, 12, 200_000)
    expect(t.rows).toHaveLength(12)
    expect(t.rows[0].key).toEqual({ year: 2027, month: 8 })
    expect(t.rows[11].key).toEqual({ year: 2026, month: 9 })
  })

  it('cột "năm ngoái" lấy đúng cùng tháng, kể cả khi tháng đó NGOÀI phạm vi', () => {
    const t = longTable(points, 12, null)
    expect(t.rows[0].yearAgo).toBe(300_000)
    expect(t.rows[0].deltaPct).toBeCloseTo(-33.33, 1)
  })

  it('tổng + Δ tổng', () => {
    const t = longTable(points, 12, null)
    expect(t.total).toBe(2_400_000)
    expect(t.yearAgoTotal).toBe(3_600_000)
    expect(t.totalDeltaPct).toBeCloseTo(-33.33, 1)
  })

  it('thiếu dữ liệu năm ngoái ở BẤT KỲ dòng nào → tổng năm ngoái = null, không cộng một phần', () => {
    const p = seq({ year: 2026, month: 1 }, Array<number>(12).fill(200_000))
    const t = longTable(p, 12, null)
    expect(t.rows.every((row) => row.yearAgo === null)).toBe(true)
    expect(t.yearAgoTotal).toBeNull()
    expect(t.totalDeltaPct).toBeNull()
  })

  it('cột "So mức nền" và số tháng vượt nền', () => {
    const p = seq({ year: 2026, month: 1 }, [100, 300, 200, 400, 150, 250])
    const t = longTable(p, 6, 200)
    expect(t.overCount).toBe(3) // 300, 400, 250
    expect(t.rows[0].vsBaseline).toBeCloseTo(1.25) // 250/200, dòng mới nhất
  })

  it('chưa có mức nền → cột đó null, không phải 0 (thanh sẽ tự ẩn)', () => {
    const t = longTable(points, 12, null)
    expect(t.rows.every((row) => row.vsBaseline === null)).toBe(true)
    expect(t.overCount).toBe(0)
  })
})

describe('regimeSplitsComparison', () => {
  const points = seq({ year: 2024, month: 9 }, Array<number>(24).fill(250_000))

  it('cú đổi nằm trong đoạn "năm ngoái" → có cắt ngang, phải nói ra', () => {
    // 24 tháng, phạm vi 12 → đoạn năm ngoái là index 0..11. Cú đổi ở index 3.
    expect(regimeSplitsComparison(points, 3, 12)).toBe(true)
  })

  it('cú đổi nằm TRONG phạm vi đang xem → không cắt ngang phép so', () => {
    expect(regimeSplitsComparison(points, 18, 12)).toBe(false)
  })

  it('không có cú đổi → false', () => {
    expect(regimeSplitsComparison(points, null, 12)).toBe(false)
  })
})

describe('monthAverages', () => {
  it('TB theo tháng dương lịch, tìm ra tháng nặng nhất', () => {
    // Hai năm: mọi tháng 100, riêng tháng 10 là 400.
    const expenses: number[] = []
    for (let y = 0; y < 2; y++) for (let m = 1; m <= 12; m++) expenses.push(m === 10 ? 400 : 100)
    const r = monthAverages(seq({ year: 2025, month: 1 }, expenses))
    expect(r.heaviest?.month).toBe(10)
    expect(r.heaviest?.avg).toBe(400)
    expect(r.heaviest?.occurrences).toBe(2)
    expect(r.months[9].heavierPct).toBeGreaterThan(200)
  })

  it('tháng chưa có dữ liệu: occurrences 0 và heavierPct null — KHÁC "tháng đó chi 0đ"', () => {
    const r = monthAverages(seq({ year: 2026, month: 1 }, [100, 200, 300]))
    expect(r.months[0].occurrences).toBe(1)
    expect(r.months[5].occurrences).toBe(0)
    expect(r.months[5].heavierPct).toBeNull()
    expect(r.months[5].avg).toBe(0)
  })

  it('chuỗi rỗng → không có tháng nặng nhất', () => {
    const r = monthAverages([])
    expect(r.heaviest).toBeNull()
    expect(r.overall).toBe(0)
  })
})

describe('remitStrip', () => {
  const keys: MonthKey[] = Array.from({ length: 12 }, (_, i) => ({
    year: 2026,
    month: i + 1,
  }))

  it('tổng · số lần gửi · mức thường lệ · tháng bỏ', () => {
    const amounts = new Map(keys.map((k) => [k.month, 30_000]))
    amounts.set(2, 0) // bỏ một lần
    amounts.set(4, 40_000) // gửi nhiều hơn
    const r = remitStrip(keys, (k) => amounts.get(k.month) ?? 0)
    expect(r.total).toBe(10 * 30_000 + 40_000)
    expect(r.sent).toBe(11)
    expect(r.usual).toBe(30_000)
    expect(r.skippedMonths.map((m) => m.key.month)).toEqual([2])
    expect(r.unusual.map((m) => m.key.month)).toEqual([4])
  })

  it('chưa gửi lần nào → tổng 0, mức thường lệ 0, mọi tháng là "bỏ"', () => {
    const r = remitStrip(keys, () => 0)
    expect(r.total).toBe(0)
    expect(r.sent).toBe(0)
    expect(r.usual).toBe(0)
    expect(r.skippedMonths).toHaveLength(12)
  })
})
