import { describe, expect, it } from 'vitest'
import type { FundTrade } from './fundHoldings'
import {
  buildFundPortfolio,
  fundTabTotal,
  type FundAccountTrades,
  type FundBalanceAccount,
} from './fundPortfolio'

// Mã thật của hai quỹ chủ app đang giữ — để bài test đọc được như sao kê.
const SP500 = '9I31223A'
const NDX = '9I314241'

const mua = (
  assocFundCd: string,
  units: number,
  nav: number,
  amount: number,
  tradedOn = '2026-04-09',
): FundTrade => ({ assocFundCd, kind: 'buy', tradedOn, units, nav, amount })

const ban = (
  assocFundCd: string,
  units: number,
  nav: number,
  amount: number,
  tradedOn = '2026-06-09',
): FundTrade => ({ assocFundCd, kind: 'sell', tradedOn, units, nav, amount })

const tk = (
  accountId: string,
  trades: FundTrade[],
  accountName = `TK ${accountId}`,
): FundAccountTrades => ({ accountId, accountName, trades })

describe('buildFundPortfolio', () => {
  it('không tài khoản nào → mọi số bằng 0, không có quỹ nào', () => {
    const p = buildFundPortfolio([], new Map())
    expect(p.positions).toEqual([])
    expect(p.fundValue).toBe(0)
    expect(p.fundCost).toBe(0)
    expect(p.marketValue).toBe(0)
  })

  it('gộp cùng một quỹ ở hai tài khoản thành một dòng, cộng 口数 và giá vốn', () => {
    const p = buildFundPortfolio(
      [
        tk('a', [mua(SP500, 100_000, 20_000, 200_000)], 'NISA'),
        tk('b', [mua(SP500, 50_000, 24_000, 120_000)], 'Tokutei'),
      ],
      new Map([[SP500, 25_000]]),
    )
    expect(p.positions).toHaveLength(1)
    expect(p.positions[0].units).toBe(150_000)
    expect(p.positions[0].costBasis).toBe(320_000)
    expect(p.positions[0].accountNames).toEqual(['NISA', 'Tokutei'])
    // 取得単価 gộp: 320.000 ¥ / 150.000 口 × 10.000 = 21.333 ¥/1万口
    expect(p.positions[0].avgNav).toBe(21_333)
  })

  it('làm tròn TỪNG cặp (tài khoản, quỹ) rồi mới cộng — tổng bằng tổng hai trang chi tiết', () => {
    // 3 口 × 15.000 ÷ 10.000 = 4,5 → làm tròn 5 ở MỖI tài khoản ⇒ 10.
    // Cộng 口数 trước (6 口) rồi mới chia thì ra 9. Bất biến "tổng ở tab = tổng các trang
    // cộng lại" đòi con số 10.
    const p = buildFundPortfolio(
      [tk('a', [mua(SP500, 3, 15_000, 5)]), tk('b', [mua(SP500, 3, 15_000, 5)])],
      new Map([[SP500, 15_000]]),
    )
    expect(p.positions[0].value).toBe(10)
    expect(p.fundValue).toBe(10)
  })

  it('lãi đã chốt cộng từ TỪNG tài khoản, không hoà vốn bình quân chung', () => {
    // Mua 100.000 口 giá vốn 200.000 ¥ ở A; mua cùng số 口 giá vốn 300.000 ¥ ở B;
    // rồi bán sạch ở A thu về 250.000 ¥. Tính riêng: A lãi 50.000 ¥.
    // Đổ chung sổ lệnh thì giá vốn bình quân là 250.000 ¥ ⇒ lệnh đó hoà vốn, tức SAI.
    const p = buildFundPortfolio(
      [
        tk('a', [mua(SP500, 100_000, 20_000, 200_000), ban(SP500, 100_000, 25_000, 250_000)]),
        tk('b', [mua(SP500, 100_000, 30_000, 300_000)]),
      ],
      new Map([[SP500, 30_000]]),
    )
    expect(p.realizedPnl).toBe(50_000)
    expect(p.positions).toHaveLength(1)
    expect(p.positions[0].units).toBe(100_000)
  })

  it('thiếu giá một quỹ → quỹ đó tạm tính theo giá vốn, tên vào missingNavs', () => {
    const p = buildFundPortfolio(
      [tk('a', [mua(SP500, 100_000, 20_000, 200_000), mua(NDX, 100_000, 30_000, 300_000)])],
      new Map([[SP500, 25_000]]),
    )
    expect(p.missingNavs).toEqual([NDX])
    const ndx = p.positions.find((x) => x.assocFundCd === NDX)
    expect(ndx?.value).toBe(300_000)
    expect(ndx?.nav).toBeNull()
    expect(ndx?.pnl).toBe(0)
    // 100.000 口 × 25.000 ÷ 10.000 = 250.000
    expect(p.fundValue).toBe(550_000)
    expect(p.marketValue).toBe(550_000)
  })

  it('thiếu giá MỌI quỹ → marketValue null, vì tổng lúc đó chỉ bằng giá vốn', () => {
    const p = buildFundPortfolio(
      [tk('a', [mua(SP500, 100_000, 20_000, 200_000)])],
      new Map(),
    )
    expect(p.marketValue).toBeNull()
    expect(p.fundValue).toBe(200_000)
  })

  it('bán quá số đang giữ ở một tài khoản → tên quỹ vào oversold', () => {
    const p = buildFundPortfolio(
      [
        tk('a', [mua(SP500, 100_000, 20_000, 200_000), ban(SP500, 150_000, 25_000, 375_000)]),
        tk('b', [mua(NDX, 100_000, 30_000, 300_000)]),
      ],
      new Map([
        [SP500, 25_000],
        [NDX, 30_000],
      ]),
    )
    expect(p.oversold).toEqual([SP500])
  })

  it('tỷ trọng cộng lại bằng 1 khi còn giữ quỹ', () => {
    const p = buildFundPortfolio(
      [tk('a', [mua(SP500, 100_000, 20_000, 200_000), mua(NDX, 100_000, 30_000, 300_000)])],
      new Map([
        [SP500, 20_000],
        [NDX, 30_000],
      ]),
    )
    const tong = p.positions.reduce((s, x) => s + x.weight, 0)
    expect(tong).toBeCloseTo(1, 10)
  })

  it('xếp quỹ theo giá trị giảm dần', () => {
    const p = buildFundPortfolio(
      [tk('a', [mua(SP500, 100_000, 10_000, 100_000), mua(NDX, 100_000, 30_000, 300_000)])],
      new Map([
        [SP500, 10_000],
        [NDX, 30_000],
      ]),
    )
    expect(p.positions.map((x) => x.assocFundCd)).toEqual([NDX, SP500])
  })

  it('bán sạch mọi quỹ → không còn dòng nào, marketValue bằng 0 chứ không null', () => {
    const p = buildFundPortfolio(
      [tk('a', [mua(SP500, 100_000, 20_000, 200_000), ban(SP500, 100_000, 25_000, 250_000)])],
      new Map([[SP500, 25_000]]),
    )
    expect(p.positions).toEqual([])
    expect(p.marketValue).toBe(0)
    expect(p.realizedPnl).toBe(50_000)
  })
})

describe('fundTabTotal', () => {
  const soDu = (accountId: string, accountName: string, value: number): FundBalanceAccount => ({
    accountId,
    accountName,
    value,
  })

  it('không có tài khoản số dư nào → trả y nguyên marketValue, kể cả null', () => {
    const p = buildFundPortfolio([tk('a', [mua(SP500, 100_000, 20_000, 200_000)])], new Map())
    expect(p.marketValue).toBeNull()
    expect(fundTabTotal(p, [])).toEqual({ value: null, balanceTotal: 0 })
  })

  /**
   * Ca thật của chủ app: 退職金 (DB掛金 — hưu trí doanh nghiệp) là tài khoản `investment`
   * + JPY nên bị hút vào tab này, mà sổ lệnh quỹ của nó rỗng VĨNH VIỄN — không có
   * 協会コード, không có 基準価額. Trước khi có khu "tính theo số dư", tab hiện ¥0 cho
   * một tài khoản đang giữ ¥50.000.
   */
  it('退職金 ¥50.000 mà không giữ quỹ nào → tổng là ¥50.000, không phải ¥0', () => {
    const p = buildFundPortfolio([], new Map())
    expect(fundTabTotal(p, [soDu('c', '退職金', 50_000)])).toEqual({
      value: 50_000,
      balanceTotal: 50_000,
    })
  })

  it('cộng số dư vào giá trị quỹ', () => {
    const p = buildFundPortfolio(
      [tk('a', [mua(SP500, 100_000, 20_000, 200_000)])],
      new Map([[SP500, 25_000]]),
    )
    expect(p.fundValue).toBe(250_000)
    expect(fundTabTotal(p, [soDu('c', '退職金', 50_000)]).value).toBe(300_000)
  })

  it('thiếu giá MỌI quỹ đang giữ nhưng có số dư → vẫn ra số, không nuốt phần đã biết', () => {
    const p = buildFundPortfolio([tk('a', [mua(SP500, 100_000, 20_000, 200_000)])], new Map())
    expect(p.marketValue).toBeNull()
    // 200.000 (quỹ tạm tính theo giá vốn, `missingNavs` đã bật dấu ước tính) + 50.000
    expect(fundTabTotal(p, [soDu('c', '退職金', 50_000)]).value).toBe(250_000)
  })

  it('cộng nhiều tài khoản số dư, kể cả tài khoản đang rỗng', () => {
    const p = buildFundPortfolio([], new Map())
    const t = fundTabTotal(p, [soDu('c', '退職金', 50_000), soDu('d', '楽天証券', 0)])
    expect(t).toEqual({ value: 50_000, balanceTotal: 50_000 })
  })
})
