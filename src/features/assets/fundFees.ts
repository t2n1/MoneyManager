// Phí quỹ (信託報酬) đã trả — THUẦN, có test. Bài học Chặng 5 (giáo trình đối chiếu
// 09/2026): phí bị trừ ÂM THẦM vào 基準価額 mỗi ngày, không hiện trên bất kỳ sao kê nào,
// nên người giữ quỹ không bao giờ thấy mình đã trả bao nhiêu. Hàm này dựng lại con số đó
// từ sổ lệnh.
//
// ƯỚC LƯỢNG, và nói rõ là ước lượng: giá trị nắm giữ giữa hai mốc được nội suy hình thang
// từ 基準価額 tại các mốc CÓ THẬT (mỗi lệnh mua/bán mang nav của ngày khớp; mốc cuối là
// giá mới nhất trong bảng fund_prices). Quỹ mua định kỳ hằng tháng thì mốc dày — sai số
// nhỏ hơn nhiều so với con số 0 mà mọi màn hình khác đang nói.
import { fundLineValue, type FundTrade } from './fundHoldings'

export interface FundFeeEstimate {
  /** yên, đã làm tròn. */
  feeMinor: number
  fromISO: string
  toISO: string
}

/** Ngày giữa hai ISO date (b − a). Thuần, không Date.now(). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** Cùng thứ tự trong-ngày với fundHoldingsFromTrades: mua → adjust → bán. */
function kindOrder(t: FundTrade): number {
  return t.kind === 'buy' ? 0 : t.kind === 'adjust' ? 1 : 2
}

/**
 * Phí đã trả cho MỘT quỹ, từ lệnh đầu tiên tới `latestNavDate`.
 * null khi không ước được: chưa khai phí, dưới hai mốc thời gian, hay chưa từng có nav.
 */
export function fundFeePaid(args: {
  /** Sổ lệnh CỦA ĐÚNG quỹ này (đã lọc theo assoc_fund_cd). */
  trades: FundTrade[]
  /** 信託報酬, ppm/năm (FundRow.expense_ratio_ppm). */
  erPpm: number
  /** 基準価額 mới nhất (fund_prices); null = chưa có. */
  latestNav: number | null
  latestNavDate: string | null
}): FundFeeEstimate | null {
  const { trades, erPpm, latestNav, latestNavDate } = args
  if (erPpm <= 0 || trades.length === 0) return null

  const inOrder = trades
    .slice()
    .sort((a, b) => a.tradedOn.localeCompare(b.tradedOn) || kindOrder(a) - kindOrder(b))

  const erNam = erPpm / 1_000_000
  let fee = 0
  let fromISO: string | null = null
  // Trạng thái đoạn đang mở: giá trị SAU các lệnh của mốc trước.
  let prevOn: string | null = null
  let prevValue = 0
  let units = 0
  let lastNav = 0

  /** Đóng đoạn [prevOn, on]: đầu đoạn là prevValue, cuối đoạn là giá trị TRƯỚC lệnh của
   * `on` tính theo nav của chính ngày đó — kẻo một lệnh bán sạch xoá luôn phí của cả
   * đoạn nó vừa kết thúc. */
  const closeSegment = (on: string, navAtOn: number) => {
    if (prevOn === null) return
    const ngay = daysBetween(prevOn, on)
    if (ngay <= 0) return
    const endValue = navAtOn > 0 ? fundLineValue(units, navAtOn) : prevValue
    fee += ((prevValue + endValue) / 2) * erNam * (ngay / 365.25)
  }

  for (let i = 0; i < inOrder.length; i++) {
    const t = inOrder[i]
    const navToday = t.nav > 0 ? t.nav : lastNav
    if (i === 0 || inOrder[i - 1].tradedOn !== t.tradedOn) closeSegment(t.tradedOn, navToday)
    if (t.kind === 'buy') units += t.units
    else if (t.kind === 'sell') units = Math.max(0, units - t.units)
    else units = Math.max(0, units + t.units)
    if (t.nav > 0) lastNav = t.nav
    const cuoiNgay = i === inOrder.length - 1 || inOrder[i + 1].tradedOn !== t.tradedOn
    if (cuoiNgay && lastNav > 0) {
      prevValue = fundLineValue(units, lastNav)
      prevOn = t.tradedOn
      fromISO ??= t.tradedOn
    }
  }

  let toISO = prevOn
  if (latestNav !== null && latestNav > 0 && latestNavDate !== null && prevOn !== null) {
    if (latestNavDate > prevOn) {
      closeSegment(latestNavDate, latestNav)
      toISO = latestNavDate
    }
  }

  if (fee <= 0 || fromISO === null || toISO === null || toISO === fromISO) return null
  return { feeMinor: Math.round(fee), fromISO, toISO }
}

/**
 * Ô nhập %/năm → ppm: '0,077' / '0.077' → 770; chuỗi rỗng → null (xoá về "chưa khai");
 * không parse được hoặc ngoài [0, 3]% → undefined (chỗ gọi giữ nguyên giá trị cũ).
 */
export function parsePercentToPpm(raw: string): number | null | undefined {
  const s = raw.trim().replace(',', '.')
  if (s === '') return null
  const pct = Number(s)
  if (!Number.isFinite(pct) || pct < 0 || pct > 3) return undefined
  return Math.round(pct * 10_000)
}

/**
 * Giữ thêm `years` năm thì phí lấy đi khoảng bao nhiêu PHẦN của số cuối: 1 − (1−f)^n.
 * Gần đúng và CỐ Ý không cần giả định lợi suất — phần phụ thuộc lợi suất nhỏ (với
 * f=0,5%/năm, 20 năm: 9,5% ở lợi suất 0% so với 9,1% ở 5%), còn một giả định lợi suất
 * bịa ra thì sai kiểu khác: nó trông như một lời hứa.
 */
export function feeShareAfterYears(erPpm: number, years: number): number {
  if (erPpm <= 0 || years <= 0) return 0
  return 1 - Math.pow(1 - erPpm / 1_000_000, years)
}
