// TWR vs MWRR vs "máy mua đều" cho quỹ Nhật — THUẦN, có test. Bài học giáo trình đã
// đối chiếu (09/2026, bonus + C8): ba con số trả lời ba câu KHÁC nhau về cùng một quỹ:
//
// · TWR (time-weighted): CHÍNH QUỸ chạy thế nào — 基準価額 đầu kỳ so cuối kỳ, không quan
//   tâm bạn bỏ tiền lúc nào. Với quỹ không chia 分配金 (dòng 楽天・プラス), đường 基準価額
//   đã trừ phí là toàn bộ câu chuyện, nên TWR tính thẳng từ nav đầu → nav cuối.
// · MWRR (money-weighted, = IRR dòng tiền thật): TIỀN CỦA BẠN sinh lời bao nhiêu — mua
//   nhiều lúc giá cao thì MWRR tụt dưới TWR dù quỹ vẫn thế. Khoảng chênh chính là giá
//   của THỜI ĐIỂM vào tiền.
// · Máy mua đều: cùng tổng tiền, rải ĐỀU qua đúng các ngày bạn đã mua — cái máy không
//   biết sợ cũng không biết hưng phấn. So MWRR thật với nó là "behavior gap" đo trên
//   chính sổ lệnh của mình, không phải trên lý thuyết.
//
// Mốc giá lấy từ nav CÓ THẬT: mỗi lệnh mang 基準価額 ngày khớp, mốc cuối là giá mới nhất
// (fund_prices). Không nội suy thêm mốc nào.
import { fundHoldingsFromTrades, fundLineValue, NAV_UNITS, type FundTrade } from './fundHoldings'

/** Cần ít nhất chừng này ngày dữ liệu mới nói chuyện %/năm — ngắn hơn thì annualize là thổi số. */
export const RETURN_MIN_SPAN_DAYS = 365
/** Cần ít nhất chừng này ngày mua mới dựng được kịch bản "máy mua đều". */
export const DCA_MIN_BUYS = 3
/** |MWRR − TWR| dưới mức này (điểm %/năm) coi như tiền vào theo kịp quỹ. */
export const GAP_NOISE_PP = 1

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export interface CashFlow {
  on: string
  /** minor JPY; âm = tiền RA khỏi túi (mua), dương = tiền VỀ túi (bán / giá trị cuối). */
  amount: number
}

/**
 * IRR năm của một dãy dòng tiền (nghiệm r của NPV = 0, chiết khấu theo năm 365,25 ngày).
 * Bisection trên (−99%, +1000%); null khi không đủ dòng tiền hai chiều hoặc không hội tụ.
 */
export function irr(flows: CashFlow[]): number | null {
  const co = flows.filter((f) => f.amount !== 0)
  if (co.length < 2) return null
  if (!co.some((f) => f.amount > 0) || !co.some((f) => f.amount < 0)) return null
  const t0 = co.map((f) => f.on).sort()[0]
  const nam = co.map((f) => ({ t: daysBetween(t0, f.on) / 365.25, v: f.amount }))

  const npv = (r: number) => nam.reduce((s, f) => s + f.v / Math.pow(1 + r, f.t), 0)

  let lo = -0.99
  let hi = 10
  let fLo = npv(lo)
  const fHi = npv(hi)
  if (fLo === 0) return lo
  if (fHi === 0) return hi
  if (fLo * fHi > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const fMid = npv(mid)
    if (fMid === 0) return mid
    if (fLo * fMid < 0) hi = mid
    else {
      lo = mid
      fLo = fMid
    }
  }
  return (lo + hi) / 2
}

export interface FundReturnRow {
  assocFundCd: string
  /** Ngày dữ liệu từ lệnh đầu tới mốc giá cuối. */
  spanDays: number
  fromISO: string
  /** %/năm của CHÍNH QUỸ (nav đầu → nav cuối, annualized). */
  twrPct: number
  /** %/năm của TIỀN BẠN (IRR dòng tiền thật + giá trị đang giữ); null = không hội tụ. */
  mwrrPct: number | null
  /** %/năm nếu cùng tổng tiền mua được rải đều qua đúng các ngày đã mua; null = dưới DCA_MIN_BUYS ngày mua. */
  dcaPct: number | null
}

/**
 * Ba con số cho MỘT quỹ. null khi chưa nói được gì tử tế: thiếu mốc giá cuối, sổ lệnh
 * không có nav, hay dữ liệu chưa đủ RETURN_MIN_SPAN_DAYS (annualize quãng ngắn là thổi số).
 */
export function fundReturnRow(args: {
  /** Sổ lệnh CỦA ĐÚNG quỹ này. */
  trades: FundTrade[]
  /** 基準価額 mới nhất; null = chưa có. */
  latestNav: number | null
  latestNavDate: string | null
}): FundReturnRow | null {
  const { trades, latestNav, latestNavDate } = args
  if (latestNav === null || latestNav <= 0 || latestNavDate === null) return null

  const inOrder = trades.slice().sort((a, b) => a.tradedOn.localeCompare(b.tradedOn))
  const dauCoNav = inOrder.find((t) => t.nav > 0)
  if (dauCoNav === undefined) return null
  const fromISO = dauCoNav.tradedOn
  const spanDays = daysBetween(fromISO, latestNavDate)
  if (spanDays < RETURN_MIN_SPAN_DAYS) return null

  const annualize = (cum: number) => (Math.pow(1 + cum, 365.25 / spanDays) - 1) * 100

  // TWR: đường 基準価額 tự nó — quỹ không chia 分配金 thì đây là toàn bộ lợi suất quỹ.
  const twrPct = annualize(latestNav / dauCoNav.nav - 1)

  // MWRR: dòng tiền thật. adjust không có tiền qua tay → không phải dòng tiền.
  const { holdings } = fundHoldingsFromTrades(inOrder)
  const unitsNow = holdings.find((h) => h.assocFundCd === inOrder[0].assocFundCd)?.units ?? 0
  const flows: CashFlow[] = inOrder
    .filter((t) => t.kind !== 'adjust' && t.amount > 0)
    .map((t) => ({ on: t.tradedOn, amount: t.kind === 'buy' ? -t.amount : t.amount }))
  if (unitsNow > 0) flows.push({ on: latestNavDate, amount: fundLineValue(unitsNow, latestNav) })
  const mwrr = irr(flows)
  const mwrrPct = mwrr === null ? null : mwrr * 100

  // Máy mua đều: cùng tổng tiền mua, chia đều cho đúng các ngày đã mua (có nav), giữ tới
  // mốc cuối — KHÔNG mô phỏng lệnh bán: cái máy này chỉ trả lời "vào tiền đều thì sao".
  const buys = inOrder.filter((t) => t.kind === 'buy' && t.nav > 0 && t.amount > 0)
  const buyDays = [...new Map(buys.map((t) => [t.tradedOn, t.nav])).entries()]
  let dcaPct: number | null = null
  if (buyDays.length >= DCA_MIN_BUYS) {
    const tong = buys.reduce((s, t) => s + t.amount, 0)
    const moiKy = tong / buyDays.length
    let units = 0
    const dcaFlows: CashFlow[] = buyDays.map(([on, nav]) => {
      units += (moiKy / nav) * NAV_UNITS
      return { on, amount: -moiKy }
    })
    dcaFlows.push({ on: latestNavDate, amount: fundLineValue(units, latestNav) })
    const r = irr(dcaFlows)
    dcaPct = r === null ? null : r * 100
  }

  return { assocFundCd: inOrder[0].assocFundCd, spanDays, fromISO, twrPct, mwrrPct, dcaPct }
}
