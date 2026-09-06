import { describe, expect, it } from 'vitest'
import type { FundTrade } from './fundHoldings'
import { fundReturnRow, irr } from './fundReturns'

const trade = (
  kind: FundTrade['kind'],
  on: string,
  units: number,
  nav: number,
  amount: number,
): FundTrade => ({ assocFundCd: 'X', kind, tradedOn: on, units, nav, amount })

describe('irr', () => {
  it('−100 hôm nay, +121 sau đúng 2 năm → 10%/năm', () => {
    const r = irr([
      { on: '2024-01-01', amount: -100_000 },
      { on: '2026-01-01', amount: 121_000 },
    ])
    // 2 năm dương lịch = 731 ngày ≈ 2,0014 năm chiết khấu → lệch 10% một chút xíu.
    expect(r).not.toBeNull()
    expect(r! * 100).toBeCloseTo(10, 1)
  })

  it('toàn dòng tiền một chiều → null (không có nghiệm)', () => {
    expect(
      irr([
        { on: '2024-01-01', amount: -100 },
        { on: '2025-01-01', amount: -100 },
      ]),
    ).toBeNull()
  })
})

describe('fundReturnRow', () => {
  it('một lệnh mua, nav ×2 sau đúng 366 ngày (2024 nhuận): TWR ≈ MWRR ≈ 100%/năm', () => {
    const r = fundReturnRow({
      trades: [trade('buy', '2024-01-01', 10_000, 10_000, 10_000)],
      latestNav: 20_000,
      latestNavDate: '2025-01-01',
    })
    expect(r).not.toBeNull()
    expect(r!.twrPct).toBeCloseTo((Math.pow(2, 365.25 / 366) - 1) * 100, 6)
    expect(r!.mwrrPct).toBeCloseTo(r!.twrPct, 0)
    expect(r!.dcaPct).toBeNull() // mới 1 ngày mua — chưa dựng được máy mua đều
  })

  it('dồn phần lớn tiền vào lúc giá đã lên đỉnh → MWRR tụt dưới TWR', () => {
    // Nav ×2 trong năm đầu rồi đứng im cả năm sau. Tiền nhỏ hưởng trọn đà tăng,
    // tiền to vào đúng đỉnh và không sinh gì — quỹ vẫn "×2 sau 2 năm" nhưng tiền
    // của người này thì gần như dậm chân.
    const r = fundReturnRow({
      trades: [
        trade('buy', '2024-01-01', 10_000, 10_000, 10_000),
        trade('buy', '2025-01-01', 45_000, 20_000, 90_000),
      ],
      latestNav: 20_000,
      latestNavDate: '2026-01-01',
    })
    expect(r).not.toBeNull()
    expect(r!.mwrrPct).not.toBeNull()
    expect(r!.mwrrPct!).toBeLessThan(r!.twrPct - 10)
  })

  it('mua đều tay sẵn rồi thì máy mua đều ra đúng con số của mình (gap ~0)', () => {
    const trades = [
      trade('buy', '2024-01-10', 10_000, 10_000, 10_000),
      trade('buy', '2024-05-10', 8_000, 12_500, 10_000),
      trade('buy', '2024-09-10', 6_666, 15_000, 10_000),
    ]
    const r = fundReturnRow({ trades, latestNav: 16_000, latestNavDate: '2025-01-10' })
    expect(r).not.toBeNull()
    expect(r!.dcaPct).not.toBeNull()
    expect(r!.dcaPct!).toBeCloseTo(r!.mwrrPct!, 1)
  })

  it('bán sạch: MWRR vẫn tính được từ tiền đã về, không có giá trị cuối', () => {
    const r = fundReturnRow({
      trades: [
        trade('buy', '2024-01-01', 10_000, 10_000, 100_000),
        trade('sell', '2025-01-01', 10_000, 11_000, 110_000),
      ],
      latestNav: 12_000,
      latestNavDate: '2025-06-01',
    })
    expect(r).not.toBeNull()
    // Tiền của bạn: +10% trong ~1 năm rồi đứng ngoài.
    expect(r!.mwrrPct!).toBeCloseTo(10, 0)
    // Quỹ thì vẫn chạy tới 12.000 — TWR đo cả quãng đứng ngoài.
    expect(r!.twrPct).toBeGreaterThan(r!.mwrrPct!)
  })

  it('chưa đủ một năm dữ liệu / thiếu giá cuối → null, không thổi số', () => {
    const t = [trade('buy', '2026-05-01', 1_000, 10_000, 1_000)]
    expect(fundReturnRow({ trades: t, latestNav: 11_000, latestNavDate: '2026-09-01' })).toBeNull()
    expect(fundReturnRow({ trades: t, latestNav: null, latestNavDate: null })).toBeNull()
  })
})
