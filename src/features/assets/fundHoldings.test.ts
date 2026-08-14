import { describe, expect, it } from 'vitest'
import {
  fundHoldingsFromTrades,
  fundLineValue,
  fundValue,
  planFundBackfill,
  sessionNavs,
  type FundTrade,
} from './fundHoldings'

// Hai quỹ chủ app đang giữ — dùng mã thật để bài test đọc được như sao kê.
const SP500 = '9I31223A'
const NDX = '9I314241'
/** Quỹ CÓ trong danh bạ 8 quỹ nhưng chủ app đã bán sạch từ lâu — không ai giữ. */
const KHONG_GIU = '03311187'

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

  describe('trùng 約定日 — chốt phụ "cùng ngày thì mua trước bán"', () => {
    // 約定日 chỉ tới NGÀY, không tới giờ, nên một cặp mua+bán cùng ngày cùng quỹ KHÔNG có
    // thứ tự thật để dựa vào. Không có chốt phụ thì sort ổn định của JS giữ thứ tự đầu vào
    // — mà hai nơi gọi hàm này đưa vào hai thứ tự KHÁC nhau: script nhập sao kê theo thứ
    // tự file CSV (mới nhất trước), còn fund-refresh theo `order('id')` tức uuid NGẪU
    // NHIÊN. Cùng một sổ lệnh mà cho ra hai kết luận `oversold` khác nhau: một bên bỏ qua
    // tài khoản vĩnh viễn (cron KHÔNG trả 400 — nó đếm `boQua: {so-lenh-co-lo-hong: 1}`
    // rồi đi tiếp, cả lượt vẫn 200; dấu hiệu thật là `daGhi` đứng yên), bên kia chặn oan
    // kèm lời khuyên "fund_aliases còn thiếu một dòng" — chỉ sai người.
    //
    // Ca này CÓ THẬT ở dạng lệch một ngày (2026-04-13/14: bán sạch rồi mua lại), nhưng
    // không gì bảo đảm lần sau cũng lệch.

    it('bán đứng TRƯỚC mua trong mảng, cùng ngày → KHÔNG oversold', () => {
      const { holdings, oversold } = fundHoldingsFromTrades([
        ban(SP500, 10_000, 12_000, 12_000, '2026-04-13'),
        mua(SP500, 10_000, 10_000, 10_000, '2026-04-13'),
      ])
      expect(oversold).toEqual([])
      expect(holdings).toEqual([])
    })

    it('đảo thứ tự mảng KHÔNG đổi kết quả — cả oversold, 口数 lẫn giá vốn', () => {
      const b = ban(SP500, 6_000, 12_000, 7_200, '2026-04-13')
      const m1 = mua(SP500, 10_000, 10_000, 10_000, '2026-04-13')
      const m2 = mua(SP500, 5_000, 11_000, 5_500, '2026-05-01')
      const xuoi = fundHoldingsFromTrades([m1, b, m2])
      const nguoc = fundHoldingsFromTrades([m2, b, m1])
      expect(nguoc).toEqual(xuoi)
      expect(xuoi.oversold).toEqual([])
      // 10.000 口 mua trước, bán 6.000 (giá vốn 6.000, thu 7.200 ⇒ lãi 1.200), còn 4.000
      // 口 giá vốn 4.000; mua thêm 5.000 口 giá 5.500 ⇒ 9.000 口, vốn 9.500.
      expect(xuoi.holdings).toEqual([
        { assocFundCd: SP500, units: 9_000, costBasis: 9_500, avgNav: 10_556 },
      ])
      expect(xuoi.realizedPnl).toBe(1_200)
    })

    it('vẫn bắt được bán quá tay THẬT trong cùng một ngày', () => {
      // Chốt phụ chỉ dời ĐIỂM THẤP NHẤT giữa đường lên cao nhất có thể; một lệnh bán vượt
      // số đang giữ ở thứ tự này thì vượt ở MỌI thứ tự trong ngày. Nên chốt xoá cờ OAN mà
      // không xoá ca thật.
      const { oversold } = fundHoldingsFromTrades([
        ban(SP500, 30_000, 12_000, 36_000, '2026-04-13'),
        mua(SP500, 10_000, 10_000, 10_000, '2026-04-13'),
      ])
      expect(oversold).toEqual([SP500])
    })

    it('adjust cùng ngày được cộng vào TRƯỚC lệnh bán', () => {
      // 分配金再投資 làm TĂNG 口数 mà không tốn tiền. Xử lý nó sau lệnh bán thì lệnh bán
      // thấy số dư nhỏ hơn thực tế và bị gắn oversold oan.
      const { holdings, oversold } = fundHoldingsFromTrades([
        ban(SP500, 11_000, 12_000, 13_200, '2026-05-01'),
        taiDauTu(SP500, 1_000, '2026-05-01'),
        mua(SP500, 10_000, 10_000, 10_000, '2026-01-05'),
      ])
      expect(oversold).toEqual([])
      expect(holdings).toEqual([])
    })
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

describe('fundLineValue', () => {
  // Đây là phép chia 10.000 DUY NHẤT của cả tính năng — mọi nơi cần giá trị dòng quỹ
  // (FundTradeFormSheet, trang Đầu tư) gọi lại đúng hàm này thay vì viết lại công thức.
  // Hai con số dưới khớp từng yên với ảnh chụp app Rakuten ngày 2026-08-12
  // (xem describe('fundValue')).
  it('28.429 口 ở 基準価額 20.053 → 57.009 ¥', () => {
    expect(fundLineValue(28_429, 20_053)).toBe(57_009)
  })

  it('12.595 口 ở 基準価額 18.855 → 23.748 ¥', () => {
    expect(fundLineValue(12_595, 18_855)).toBe(23_748)
  })
})

describe('sessionNavs', () => {
  it('bảng giá rỗng → session null', () => {
    expect(sessionNavs([], [])).toEqual({
      session: null,
      navByFund: new Map(),
      staleFunds: new Set(),
    })
  })

  it('session là nav_date LỚN NHẤT của quỹ đang giữ; quỹ ở phiên cũ hơn bị nêu tên', () => {
    const r = sessionNavs(
      [
        { assoc_fund_cd: SP500, nav: 20_053, nav_date: '2026-08-10' },
        { assoc_fund_cd: NDX, nav: 18_712, nav_date: '2026-08-07' },
      ],
      [SP500, NDX],
    )
    expect(r.session).toBe('2026-08-10')
    expect(r.navByFund.get(SP500)).toBe(20_053)
    expect(r.navByFund.get(NDX)).toBe(18_712)
    expect([...r.staleFunds]).toEqual([NDX])
  })

  it('nav <= 0 không vào bảng tra (cột có check nav > 0, nhưng đừng tin mù)', () => {
    const r = sessionNavs(
      [
        { assoc_fund_cd: SP500, nav: 20_053, nav_date: '2026-08-10' },
        { assoc_fund_cd: NDX, nav: 0, nav_date: '2026-08-10' },
      ],
      [SP500, NDX],
    )
    expect(r.navByFund.has(NDX)).toBe(false)
    expect(r.navByFund.get(SP500)).toBe(20_053)
  })

  it('quỹ KHÔNG AI GIỮ đi trước một phiên KHÔNG làm quỹ đang giữ thành "giá cũ"', () => {
    // Lỗi thật của nhánh này: `fund_prices` chứa CẢ danh bạ 8 quỹ (loadFundRegistry cố ý
    // hút cả danh bạ), nhưng chủ app chỉ giữ 2. Quỹ tài sản trong nước công bố 基準価額
    // sớm hơn quỹ tài sản nước ngoài đúng một ngày, nên nếu session lấy ngày lớn nhất của
    // CẢ bảng thì CẢ HAI quỹ đang giữ đều bị đánh staleFunds ⇒ cron bỏ qua tài khoản,
    // daGhi = 0, boQua {gia-le-phien-cu: 1}, HTTP 200 — mỗi ngày, không bao giờ tự khỏi.
    const r = sessionNavs(
      [
        { assoc_fund_cd: SP500, nav: 20_053, nav_date: '2026-08-10' },
        { assoc_fund_cd: NDX, nav: 18_855, nav_date: '2026-08-10' },
        { assoc_fund_cd: KHONG_GIU, nav: 12_345, nav_date: '2026-08-11' },
      ],
      [SP500, NDX],
    )
    expect(r.session).toBe('2026-08-10')
    expect([...r.staleFunds]).toEqual([])
    // `navByFund` vẫn là cả bảng: nơi gọi chỉ tra theo quỹ nó đang giữ, lọc thêm ở đây
    // không mua được gì.
    expect(r.navByFund.get(KHONG_GIU)).toBe(12_345)
  })

  it('KHÔNG giữ quỹ nào → session rơi về ngày của cả bảng giá, để còn đóng dấu ảnh chụp 0 ¥', () => {
    // Tài khoản đã bán sạch vẫn được ghi snapshot giá trị 0 (xem fundValue). Không có quỹ
    // nào để lấy ngày phiên, mà cũng không có quỹ nào để nêu là "giá cũ".
    const r = sessionNavs(
      [
        { assoc_fund_cd: SP500, nav: 20_053, nav_date: '2026-08-10' },
        { assoc_fund_cd: KHONG_GIU, nav: 12_345, nav_date: '2026-08-11' },
      ],
      [],
    )
    expect(r.session).toBe('2026-08-11')
    expect([...r.staleFunds]).toEqual([])
  })

  it('gọi THIẾU heldFundCds → NÉM LỖI, không im lặng rơi về cả bảng giá', () => {
    // Vì sao chốt này phải sống LÚC CHẠY chứ không dựa vào `tsc`: edge function nhập hàm này
    // từ `_funds.js` (bản gói JS, không kiểu) và `tsconfig.app.json` chỉ `include: ["src"]`
    // ⇒ `npx tsc -b` KHÔNG soi lời gọi ở `fund-refresh/index.ts`. Bỏ trống tham số ở đó thì
    // `new Set(undefined)` ra Set rỗng ⇒ rơi về cả bảng ⇒ quỹ KHÔNG AI GIỮ đi trước một phiên
    // lại đánh 'gia-le-phien-cu' cho cả hai quỹ đang giữ, mỗi ngày, không bao giờ tự khỏi.
    const bang = [{ assoc_fund_cd: SP500, nav: 20_053, nav_date: '2026-08-10' }]
    // @ts-expect-error cố ý gọi thiếu tham số — đúng cái `tsc` không chặn được ở edge function
    expect(() => sessionNavs(bang)).toThrow(/heldFundCds/)
    // @ts-expect-error cố ý truyền null — `loadHeldFundCodes` lỗi có thể trả về đúng thứ này
    expect(() => sessionNavs(bang, null)).toThrow(/heldFundCds/)
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

describe('planFundBackfill', () => {
  /** `{ mã: { ngày: nav } }` → đúng shape `navHistory` mà edge function dựng từ CSV. */
  const lichSu = (theoMa: Record<string, Record<string, number>>) =>
    new Map(
      Object.entries(theoMa).map(([ma, theoNgay]) => [ma, new Map(Object.entries(theoNgay))]),
    )

  const SO_LENH = [
    mua(SP500, 28_429, 17_588, 50_000, '2026-08-07'),
    mua(NDX, 12_595, 15_879, 20_000, '2026-08-07'),
  ]
  const DU_GIA = lichSu({
    [SP500]: { '2026-08-07': 17_588, '2026-08-10': 20_053 },
    [NDX]: { '2026-08-07': 15_879, '2026-08-10': 18_855 },
  })
  const so = { trades: SO_LENH, coCaSoLenhCoPhieu: false }

  it('lấp đúng từng yên cho mọi phiên có đủ giá cả hai quỹ', () => {
    const ke = planFundBackfill(so, DU_GIA, new Set(), 1_500)
    if (!ke.ok) throw new Error(`đáng lẽ lấp được, nhận ${ke.reason}`)
    // 2026-08-07: 50.001 + 20.000 = 70.001 (KHÔNG bằng giá vốn 70.000 — nếu bài này ra
    // đúng 70.000 thì nghĩa là đang cộng giá vốn chứ không cộng 基準価額).
    // 2026-08-10: 57.009 + 23.748 = 80.757, ba con số đích của cả tính năng.
    expect(ke.days).toEqual([
      { valuedOn: '2026-08-07', marketValue: 70_001 },
      { valuedOn: '2026-08-10', marketValue: 80_757 },
    ])
    expect(ke.skipped).toEqual([])
  })

  it('một quỹ ĐANG GIỮ không có lịch sử giá → DỪNG cả lượt, không ghi hàng nào', () => {
    // Lỗi đắt nhất của tính năng. Vòng hút lịch sử bắt lỗi từng quỹ rồi ĐI TIẾP, nên một
    // quỹ hút hỏng chỉ vắng mặt trong `navHistory`. `fundValue` thì tạm tính quỹ thiếu giá
    // theo GIÁ VỐN và VẪN TRẢ SỐ (chỉ trả null khi thiếu giá MỌI quỹ), nên chốt duy nhất
    // `marketValue === null` không bắt được gì: lượt lấp ghi tới 1.500 hàng mang
    // source 'auto' và ghi chú "Lấp lại theo 基準価額 phiên X", trông y như số đúng.
    // Ở phiên 2026-08-10 nó sẽ ghi 57.009 + 20.000 = 77.009 thay vì 80.757.
    const ke = planFundBackfill(
      so,
      lichSu({ [SP500]: { '2026-08-07': 17_588, '2026-08-10': 20_053 } }),
      new Set(),
      1_500,
    )
    expect(ke).toEqual({ ok: false, reason: 'thieu-lich-su-gia', funds: [NDX] })
  })

  it('lịch sử RỖNG (hút được nhưng file không có dòng hợp lệ nào) cũng là THIẾU', () => {
    // parseNavHistory trả mảng rỗng cho file không phải CSV giá, và nơi gọi vẫn `set()`
    // một Map rỗng — nên "có khoá trong navHistory" KHÔNG đủ để nói là có lịch sử.
    const ke = planFundBackfill(
      so,
      lichSu({ [SP500]: { '2026-08-10': 20_053 }, [NDX]: {} }),
      new Set(),
      1_500,
    )
    expect(ke).toEqual({ ok: false, reason: 'thieu-lich-su-gia', funds: [NDX] })
  })

  it('nguồn thiếu ĐÚNG một phiên của một quỹ → BỎ ngày đó, không tạm tính theo giá vốn', () => {
    // Chốt thứ hai, khác chốt trên: quỹ CÓ lịch sử nhưng thiếu đúng phiên 2026-08-10 (ngày
    // nghỉ lệch nhau giữa hai quỹ, một dòng hỏng). Ghi ngày đó là ghi 77.009 thay vì
    // 80.757 — lệch 3.748 ¥ mà không có dấu hiệu nào.
    const ke = planFundBackfill(
      so,
      lichSu({
        [SP500]: { '2026-08-07': 17_588, '2026-08-10': 20_053 },
        [NDX]: { '2026-08-07': 15_879 },
      }),
      new Set(),
      1_500,
    )
    if (!ke.ok) throw new Error(`đáng lẽ lấp được, nhận ${ke.reason}`)
    expect(ke.days).toEqual([{ valuedOn: '2026-08-07', marketValue: 70_001 }])
    expect(ke.skipped).toEqual(['2026-08-10'])
  })

  it('tài khoản có CẢ sổ lệnh cổ phiếu → DỪNG, cùng bất biến mà cron đã chặn', () => {
    // Cộng 口数 của quỹ với số cổ của cổ phiếu là trộn hai hệ đơn vị. Cron bỏ qua tài khoản
    // này ('tron-hai-loai-so-lenh'); nếu lấp lịch sử KHÔNG chặn thì nó ghi giá trị chỉ có
    // phần quỹ cho hàng trăm ngày, rồi cron từ đó về sau từ chối chạm vào — số thiếu ở lại
    // vĩnh viễn.
    expect(planFundBackfill({ ...so, coCaSoLenhCoPhieu: true }, DU_GIA, new Set(), 1_500)).toEqual({
      ok: false,
      reason: 'tron-hai-loai-so-lenh',
      funds: [],
    })
  })

  it('sổ lệnh có lỗ hổng → DỪNG và nêu tên quỹ (thường là thiếu một dòng fund_aliases)', () => {
    const ke = planFundBackfill(
      {
        trades: [
          mua(SP500, 10_000, 10_000, 10_000, '2026-08-07'),
          ban(SP500, 30_000, 20_053, 60_159, '2026-08-10'),
        ],
        coCaSoLenhCoPhieu: false,
      },
      DU_GIA,
      new Set(),
      1_500,
    )
    expect(ke).toEqual({ ok: false, reason: 'so-lenh-co-lo-hong', funds: [SP500] })
  })

  it('ngày đã có hàng bị trừ TRƯỚC khi cắt trần, nên chạy lại lấp tiếp được', () => {
    // Trần 1 ngày, phiên 2026-08-07 đã có hàng. Cắt trần TRƯỚC rồi mới trừ thì lượt này
    // nhận đúng ngày 08-07, thấy đã có hàng, ghi 0 — và 08-10 không bao giờ được lấp.
    const ke = planFundBackfill(so, DU_GIA, new Set(['2026-08-07']), 1)
    if (!ke.ok) throw new Error(`đáng lẽ lấp được, nhận ${ke.reason}`)
    expect(ke.days).toEqual([{ valuedOn: '2026-08-10', marketValue: 80_757 }])
  })

  it('ngày đã bán sạch: không có hàng cho ngày đó, và KHÔNG bị coi là thiếu giá', () => {
    // Ca CÓ THẬT: tài khoản trống từ 2025-04-14 tới 2025-08-28. Khác hẳn "thiếu giá" —
    // không có gì để chụp, nên nó không được vào `skipped`.
    const ke = planFundBackfill(
      {
        trades: [
          mua(SP500, 10_000, 17_588, 17_588, '2026-08-07'),
          ban(SP500, 10_000, 20_053, 20_053, '2026-08-10'),
        ],
        coCaSoLenhCoPhieu: false,
      },
      DU_GIA,
      new Set(),
      1_500,
    )
    if (!ke.ok) throw new Error(`đáng lẽ lấp được, nhận ${ke.reason}`)
    expect(ke.days).toEqual([{ valuedOn: '2026-08-07', marketValue: 17_588 }])
    expect(ke.skipped).toEqual([])
  })

  it('sổ lệnh rỗng → không có ngày nào, không nổ', () => {
    expect(planFundBackfill({ trades: [], coCaSoLenhCoPhieu: false }, DU_GIA, new Set(), 1_500))
      .toEqual({ ok: true, days: [], skipped: [] })
  })

  it('phiên của quỹ KHÔNG AI GIỮ không được vào tập ngày — kẻo biểu đồ rỗ VĨNH VIỄN', () => {
    // Lỗi tốn nhất của chế độ lấp lịch sử. `navHistory` mang CẢ danh bạ 8 quỹ (lượt lấp hút
    // cả danh bạ vì sáu quỹ đã bán sạch vẫn có mặt trong các phiên quá khứ). Quỹ tài sản
    // TRONG NƯỚC công bố 基準価額 sớm hơn quỹ tài sản nước ngoài đúng một ngày, nên nếu tập
    // ngày lấy hợp của CẢ danh bạ thì phiên 2026-08-11 dưới đây vào tập, hai quỹ đang giữ
    // chưa có giá phiên đó, chốt ③b bỏ ngày — và lượt sau nguồn VẪN thiếu đúng phiên đó, nên
    // ngày đó trống vĩnh viễn. Đo trên lịch phiên thật của 楽天・プラス・S&P500: 48/679 phiên.
    const ke = planFundBackfill(
      so,
      lichSu({
        [SP500]: { '2026-08-07': 17_588, '2026-08-10': 20_053 },
        [NDX]: { '2026-08-07': 15_879, '2026-08-10': 18_855 },
        [KHONG_GIU]: { '2026-08-07': 30_000, '2026-08-10': 30_100, '2026-08-11': 30_200 },
      }),
      new Set(),
      1_500,
    )
    if (!ke.ok) throw new Error(`đáng lẽ lấp được, nhận ${ke.reason}`)
    expect(ke.skipped).toEqual([])
    expect(ke.days).toEqual([
      { valuedOn: '2026-08-07', marketValue: 70_001 },
      { valuedOn: '2026-08-10', marketValue: 80_757 },
    ])
  })

  it('quỹ ĐÃ BÁN SẠCH vẫn góp ngày phiên cho quãng nó còn được giữ', () => {
    // "Từng giao dịch", KHÔNG phải "đang giữ hôm nay". KHONG_GIU ở bài này là quỹ tài khoản
    // MUA RỒI BÁN — lịch sử giá của nó là nguồn ngày phiên DUY NHẤT của 2026-08-06, ngày mà
    // nó vẫn đang được giữ. Lọc theo "đang giữ hôm nay" là mất luôn ngày đó.
    const ke = planFundBackfill(
      {
        trades: [
          mua(KHONG_GIU, 10_000, 30_000, 30_000, '2026-08-06'),
          ban(KHONG_GIU, 10_000, 30_100, 30_100, '2026-08-07'),
          mua(SP500, 28_429, 17_588, 50_000, '2026-08-07'),
        ],
        coCaSoLenhCoPhieu: false,
      },
      lichSu({
        [SP500]: { '2026-08-07': 17_588, '2026-08-10': 20_053 },
        [KHONG_GIU]: { '2026-08-06': 30_000, '2026-08-07': 30_100 },
      }),
      new Set(),
      1_500,
    )
    if (!ke.ok) throw new Error(`đáng lẽ lấp được, nhận ${ke.reason}`)
    expect(ke.days).toEqual([
      { valuedOn: '2026-08-06', marketValue: 30_000 },
      { valuedOn: '2026-08-07', marketValue: 50_001 },
      { valuedOn: '2026-08-10', marketValue: 57_009 },
    ])
    expect(ke.skipped).toEqual([])
  })

  it('chốt ③a: hút hỏng MỌI quỹ tài khoản từng giao dịch → DỪNG, không trả daGhi 0 im lặng', () => {
    // Từ khi tập ngày chỉ lấy từ quỹ tài khoản từng giao dịch, ca này không còn ngày nào để
    // chốt ③ soi — trước đó nó bị bắt TÌNH CỜ nhờ ngày phiên của quỹ không ai giữ. Không có
    // chốt ③a thì lượt lấp trả `{ok: true, days: [], skipped: []}` ⇒ `daGhi: 0`, trông y như
    // "đã lấp xong từ trước", trong khi thật ra cả hai quỹ đều hút hỏng.
    const ke = planFundBackfill(so, lichSu({ [KHONG_GIU]: { '2026-08-10': 30_000 } }), new Set(), 1_500)
    expect(ke).toEqual({ ok: false, reason: 'thieu-lich-su-gia', funds: [SP500, NDX].sort() })
  })
})
