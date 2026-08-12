import { describe, expect, it } from 'vitest'
import {
  fundHoldingsFromTrades,
  fundValue,
  sessionNavs,
  type FundTrade,
} from './fundHoldings'

// Hai quỹ chủ app đang giữ — dùng mã thật để bài test đọc được như sao kê.
const SP500 = '9I31223A'
const NDX = '9I314241'

/**
 * Lệnh mua gọn cho test. `amount` là số tiền THẬT, cố tình KHÔNG bằng
 * units × nav ÷ 10.000 ở mấy ca lấy từ sao kê thật — đó chính là chuyện cần canh.
 */
function mua(
  assocFundCd: string,
  units: number,
  nav: number,
  amount: number,
  tradedOn = '2026-04-09',
): FundTrade {
  return { assocFundCd, kind: 'buy', tradedOn, units, nav, amount }
}
function ban(
  assocFundCd: string,
  units: number,
  nav: number,
  amount: number,
  tradedOn = '2026-04-08',
): FundTrade {
  return { assocFundCd, kind: 'sell', tradedOn, units, nav, amount }
}
function taiDauTu(assocFundCd: string, units: number, tradedOn = '2026-05-01'): FundTrade {
  return { assocFundCd, kind: 'adjust', tradedOn, units, nav: 0, amount: 0 }
}

describe('fundHoldingsFromTrades', () => {
  it('sổ lệnh rỗng → không giữ gì', () => {
    expect(fundHoldingsFromTrades([])).toEqual({
      holdings: [],
      realizedPnl: 0,
      oversold: [],
    })
  })

  it('giá vốn lấy từ `amount`, KHÔNG suy từ units × nav ÷ 10.000', () => {
    // Lệnh thật trên sao kê Rakuten 2026-04-09: 28.429 口 ở 基準価額 17.588, trừ 50.000 ¥.
    // 28.429 × 17.588 ÷ 10.000 = 50.000,93 trong khi số tiền bị trừ là 50.000 — lệch chưa
    // tới 1 yên. Suy giá vốn từ `units × nav` là LẤY ĐẦU RA ĐỂ DỰNG LẠI ĐẦU VÀO: Rakuten
    // tính 口数 TỪ số tiền, không phải ngược lại. `amount` mới là số gốc thật; `units` là
    // số dẫn xuất. Sai số dưới 1 yên mỗi lệnh, nhưng 136 lệnh thì trôi thấy được.
    // avgNav tính lại từ amount ÷ units: 50.000 ÷ 28.429 × 10.000 = 17.587,67 → 17.588.
    const { holdings } = fundHoldingsFromTrades([mua(SP500, 28_429, 17_588, 50_000)])
    expect(holdings).toEqual([
      { assocFundCd: SP500, units: 28_429, costBasis: 50_000, avgNav: 17_588 },
    ])
  })

  it('mua nhiều lần: 口数 và giá vốn cộng dồn, 取得単価 là bình quân gia quyền', () => {
    const { holdings } = fundHoldingsFromTrades([
      mua(SP500, 28_429, 17_588, 50_000, '2026-04-09'),
      mua(SP500, 28_611, 17_476, 50_000, '2026-03-10'),
    ])
    expect(holdings[0].units).toBe(57_040)
    expect(holdings[0].costBasis).toBe(100_000)
    // 100.000 ÷ 57.040 × 10.000 = 17.531,6 → 17.532
    expect(holdings[0].avgNav).toBe(17_532)
  })

  it('bán một phần: trừ giá vốn theo bình quân trên 口, lãi tính đúng', () => {
    const { holdings, realizedPnl } = fundHoldingsFromTrades([
      mua(NDX, 20_000, 10_000, 20_000, '2026-01-05'),
      ban(NDX, 5_000, 12_000, 6_000, '2026-02-05'),
    ])
    // Bán 1/4 số 口 → trừ 1/4 giá vốn = 5.000; thu về 6.000 ⇒ lãi 1.000.
    expect(holdings[0].units).toBe(15_000)
    expect(holdings[0].costBasis).toBe(15_000)
    expect(realizedPnl).toBe(1_000)
  })

  it('bán sạch rồi mua lại hôm sau: giá vốn KHÔNG còn dư của vị thế cũ', () => {
    // Ca thật, xảy ra ngày 2026-04-13/14: bán hết rồi mua lại ngay hôm sau. Thiếu bước
    // xoá phần dư chia lẻ thì lần mua sau tính bình quân sai vĩnh viễn.
    const { holdings, realizedPnl } = fundHoldingsFromTrades([
      mua(SP500, 172_887, 13_893, 260_000, '2026-03-10'),
      ban(SP500, 172_887, 17_128, 296_121, '2026-04-08'),
      mua(SP500, 28_429, 17_588, 50_000, '2026-04-09'),
    ])
    expect(holdings).toEqual([
      { assocFundCd: SP500, units: 28_429, costBasis: 50_000, avgNav: 17_588 },
    ])
    expect(realizedPnl).toBe(36_121)
  })

  it('bán quá số đang giữ → nêu tên quỹ, kẹp về số thực, không sinh lãi khổng lồ', () => {
    // Đây là chữ ký của việc THIẾU MỘT DÒNG BÍ DANH: quỹ đổi tên, nửa lịch sử ghép vào
    // tên này còn nửa kia vào tên khác, nên phía có lệnh bán bị âm.
    const { holdings, oversold, realizedPnl } = fundHoldingsFromTrades([
      mua(SP500, 10_000, 10_000, 10_000, '2026-01-05'),
      ban(SP500, 30_000, 12_000, 36_000, '2026-02-05'),
    ])
    expect(oversold).toEqual([SP500])
    expect(holdings).toEqual([])
    // Chỉ 10.000 口 thực sự được bán: thu về theo tỷ lệ 10.000/30.000 của 36.000 = 12.000,
    // trừ giá vốn 10.000 ⇒ 2.000. Không phải 36.000 − 10.000.
    expect(realizedPnl).toBe(2_000)
  })

  it('adjust (分配金再投資): 口数 tăng, giá vốn KHÔNG đổi → 取得単価 tự giảm', () => {
    const { holdings } = fundHoldingsFromTrades([
      mua(NDX, 10_000, 10_000, 10_000, '2026-01-05'),
      taiDauTu(NDX, 1_000),
    ])
    expect(holdings[0].units).toBe(11_000)
    expect(holdings[0].costBasis).toBe(10_000)
    // 10.000 ÷ 11.000 × 10.000 = 9.090,9 → 9.091
    expect(holdings[0].avgNav).toBe(9_091)
  })

  it('adjust âm quá số đang giữ → nêu tên quỹ, không để 口数 âm', () => {
    const { holdings, oversold } = fundHoldingsFromTrades([
      mua(NDX, 1_000, 10_000, 1_000, '2026-01-05'),
      taiDauTu(NDX, -2_000),
    ])
    expect(oversold).toEqual([NDX])
    expect(holdings).toEqual([])
  })

  it('xếp theo giá vốn giảm dần, quỹ bán sạch không xuất hiện', () => {
    const { holdings } = fundHoldingsFromTrades([
      mua(NDX, 12_595, 15_879, 20_000, '2026-04-09'),
      mua(SP500, 28_429, 17_588, 50_000, '2026-04-09'),
    ])
    expect(holdings.map((h) => h.assocFundCd)).toEqual([SP500, NDX])
  })

  it('thứ tự cộng dồn theo 約定日, không theo thứ tự trong mảng', () => {
    // Sao kê Rakuten xếp mới nhất TRƯỚC. Nếu hàm cộng dồn theo thứ tự mảng thì lệnh bán
    // sẽ được xử lý trước lệnh mua và mọi thứ đều `oversold`.
    const { holdings, oversold } = fundHoldingsFromTrades([
      ban(SP500, 10_000, 12_000, 12_000, '2026-02-05'),
      mua(SP500, 10_000, 10_000, 10_000, '2026-01-05'),
    ])
    expect(oversold).toEqual([])
    expect(holdings).toEqual([])
  })
})

describe('sessionNavs', () => {
  it('bảng giá rỗng → session null', () => {
    expect(sessionNavs([])).toEqual({
      session: null,
      navByFund: new Map(),
      staleFunds: new Set(),
    })
  })

  it('session là nav_date LỚN NHẤT; quỹ ở phiên cũ hơn bị nêu tên', () => {
    const r = sessionNavs([
      { assoc_fund_cd: SP500, nav: 20_053, nav_date: '2026-08-10' },
      { assoc_fund_cd: NDX, nav: 18_712, nav_date: '2026-08-07' },
    ])
    expect(r.session).toBe('2026-08-10')
    expect(r.navByFund.get(SP500)).toBe(20_053)
    expect(r.navByFund.get(NDX)).toBe(18_712)
    expect([...r.staleFunds]).toEqual([NDX])
  })

  it('nav <= 0 không vào bảng tra (cột có check nav > 0, nhưng đừng tin mù)', () => {
    const r = sessionNavs([
      { assoc_fund_cd: SP500, nav: 20_053, nav_date: '2026-08-10' },
      { assoc_fund_cd: NDX, nav: 0, nav_date: '2026-08-10' },
    ])
    expect(r.navByFund.has(NDX)).toBe(false)
    expect(r.navByFund.get(SP500)).toBe(20_053)
  })
})

describe('fundValue', () => {
  it('tái tạo ĐÚNG TỪNG YÊN ba con số của app Rakuten ngày 2026-08-12', () => {
    // Đây là bài test đích của cả tính năng. Ba con số dưới đọc được trên ảnh chụp app
    // Rakuten; NAV là phiên 2026-08-10 lấy từ nguồn 投資信託協会.
    const { holdings } = fundHoldingsFromTrades([
      mua(NDX, 12_595, 15_879, 20_000, '2026-04-09'),
      mua(SP500, 28_429, 17_588, 50_000, '2026-04-09'),
    ])
    const navByFund = new Map([
      [SP500, 20_053],
      [NDX, 18_855],
    ])
    const v = fundValue(holdings, navByFund)

    // 28.429 × 20.053 ÷ 10.000 = 57.008,67 → 57.009
    // 12.595 × 18.855 ÷ 10.000 = 23.747,87 → 23.748
    expect(v.marketValue).toBe(80_757)
    expect(v.missingNavs).toEqual([])

    const giaVon = holdings.reduce((s, h) => s + h.costBasis, 0)
    expect(giaVon).toBe(70_000)
    expect((v.marketValue ?? 0) - giaVon).toBe(10_757)
  })

  it('làm tròn TỪNG quỹ rồi mới cộng, không làm tròn ở cuối', () => {
    // Hai quỹ mà mỗi cái lẻ 0,5: làm tròn từng cái ra 2 đơn vị lẻ, làm tròn tổng ra 1.
    // Con số 5 口 ở nav 1 cho phần lẻ đúng 0,0005 × 10.000 → dựng số cho dễ nhẩm:
    // 15.000 口 × 10.003 ÷ 10.000 = 15.004,5 → 15.005 (mỗi quỹ)
    const holdings = [
      { assocFundCd: 'A', units: 15_000, costBasis: 15_000, avgNav: 10_000 },
      { assocFundCd: 'B', units: 15_000, costBasis: 15_000, avgNav: 10_000 },
    ]
    const navs = new Map([
      ['A', 10_003],
      ['B', 10_003],
    ])
    // Làm tròn từng quỹ: 15.005 + 15.005 = 30.010.
    // Làm tròn ở cuối:   30.009 (vì 15.004,5 + 15.004,5 = 30.009).
    expect(fundValue(holdings, navs).marketValue).toBe(30_010)
  })

  it('thiếu giá MỘT quỹ: vẫn ra số, quỹ đó tạm tính theo giá vốn và bị nêu tên', () => {
    const holdings = [
      { assocFundCd: SP500, units: 28_429, costBasis: 50_000, avgNav: 17_588 },
      { assocFundCd: NDX, units: 12_595, costBasis: 20_000, avgNav: 15_880 },
    ]
    const v = fundValue(holdings, new Map([[SP500, 20_053]]))
    expect(v.marketValue).toBe(57_009 + 20_000)
    expect(v.missingNavs).toEqual([NDX])
  })

  it('thiếu giá MỌI quỹ → marketValue null (đừng ghi một con số bằng đúng giá vốn)', () => {
    const holdings = [
      { assocFundCd: SP500, units: 28_429, costBasis: 50_000, avgNav: 17_588 },
    ]
    const v = fundValue(holdings, new Map())
    expect(v.marketValue).toBeNull()
    expect(v.missingNavs).toEqual([SP500])
  })

  it('không giữ gì → marketValue 0, không phải null', () => {
    // Khác "thiếu giá mọi quỹ": ở đây KHÔNG có gì để thiếu giá. 0 là con số đúng và
    // ghi được — tài khoản đã bán sạch thì giá trị bằng 0.
    expect(fundValue([], new Map())).toEqual({ marketValue: 0, missingNavs: [] })
  })
})
