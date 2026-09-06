// Ba đường của MỘT quỹ Nhật: quỹ tự chạy · tiền của bạn · máy mua đều — thuần, có test.
//
// Đây là bản CÓ HÌNH của ba con số ở `fundReturns.ts`. Ba con số đó nói khoảng cách BAO
// NHIÊU; ba đường nói nó MỞ RA Ở ĐÂU — và với một sổ lệnh có lần bán lớn giữa đường, chỗ
// mở ra chính là toàn bộ câu chuyện.
//
// KHÁC ĐƠN VỊ với fundReturns.ts, và phải nói ra ở chỗ vẽ: ba con số kia là **%/năm**
// (TWR/MWRR/DCA đã năm hoá), ba đường ở đây là **% tích luỹ**. Năm hoá tại từng điểm thì
// gần mốc đầu phải chia cho một khoảng thời gian bé xíu, ra những con số điên loạn — đúng
// lý do `periodReturns` từ chối trả lãi kép khi khung chưa đủ một năm. Nên mép phải của
// biểu đồ KHÔNG bằng ba con số bên trên, và đó không phải lỗi.
//
// TIỀN luôn lấy từ `amount` (yên THẬT đã trừ/nhận), KHÔNG suy từ `units × nav ÷ 10.000`.
// Lý lẽ đầy đủ ở đầu `fundHoldings.ts`: Rakuten tính 口数 TỪ số tiền, nên suy ngược lại là
// lấy đầu ra dựng lại đầu vào — đo trên sao kê thật lệch 0,93 ¥ một lệnh, mà sổ có 136 lệnh.
import { NAV_UNITS } from './fundHoldings'

export interface GrowthTrade {
  kind: 'buy' | 'sell' | 'adjust'
  /** 約定日 (ISO) */
  tradedOn: string
  /** 口数; âm chỉ hợp lệ với 'adjust' */
  units: number
  /** yên THẬT đã trừ (mua) / nhận (bán); 0 với 'adjust' */
  amount: number
}

export interface GrowthPoint {
  date: string
  /** % — 基準価額 so với phiên đầu của khung */
  fund: number
  /** % — mỗi yên đã bỏ vào thành mấy (gồm cả tiền đã bán thu về) */
  mine: number | null
  /** % — cùng tổng tiền nhưng rải đều qua đúng các ngày đã mua; null = không dựng được */
  dca: number | null
}

export interface FundGrowthResult {
  points: GrowthPoint[]
  /** false = dưới hai ngày mua, không có kịch bản máy mua đều để so. */
  hasDca: boolean
}

/** Cần ít nhất chừng này NGÀY MUA khác nhau mới dựng được "máy mua đều". */
const DCA_MIN_BUY_DAYS = 2

const giaTri = (units: number, nav: number) => (units * nav) / NAV_UNITS

/**
 * Vì sao "tiền của bạn" là (giá trị đang giữ + tiền đã bán) / tổng tiền đã mua:
 *
 * Mẫu số CHỈ TĂNG. Lấy "giá trị / vốn còn lại" thì mỗi lần bán bớt làm mẫu số co lại và tỷ
 * lệ phụt lên vô nghĩa — đúng con số +4128% mà khu "vốn bỏ vào so với giá trị" ở trang Tài
 * sản đang in ra sau những lần rút. Còn tử số gồm cả tiền đã thu về nên bán sớm không bị
 * xoá khỏi thành tích: nó đóng băng ở đúng mức đã chốt, và khoảng cách với đường quỹ chính
 * là phần bỏ lỡ.
 */
export function fundGrowth(input: {
  trades: GrowthTrade[]
  /** ngày → 基準価額 (¥/1万口). Chỉ phiên CÓ giá. */
  navByDate: Map<string, number>
}): FundGrowthResult {
  const { trades, navByDate } = input
  if (trades.length === 0 || navByDate.size === 0) return { points: [], hasDca: false }

  const theoNgay = trades.slice().sort((a, b) => a.tradedOn.localeCompare(b.tradedOn))
  const dauTien = theoNgay[0].tradedOn

  // Phiên nào KHÔNG có 基準価額 thì không có điểm — không nội suy. Một phiên bịa ra là một
  // điểm mà cả ba đường đều dựa trên một con số không ai công bố.
  const phien = [...navByDate.keys()].filter((d) => d >= dauTien).sort()
  if (phien.length === 0) return { points: [], hasDca: false }

  const navGoc = navByDate.get(phien[0])!

  // --- Kịch bản "máy mua đều": cùng TỔNG tiền mua, rải đều qua đúng các NGÀY đã mua ---
  const ngayMua = [...new Set(theoNgay.filter((t) => t.kind === 'buy').map((t) => t.tradedOn))]
  const tongMua = theoNgay.reduce((s, t) => (t.kind === 'buy' ? s + t.amount : s), 0)
  const hasDca = ngayMua.length >= DCA_MIN_BUY_DAYS && tongMua > 0
  const moiLan = hasDca ? tongMua / ngayMua.length : 0
  // Máy chỉ mua được ở ngày CÓ giá; ngày mua trùng phiên không có giá thì bỏ tranche đó
  // (thà máy nhỏ hơn còn hơn quy cho nó một cái giá không tồn tại).
  const mayTheoNgay = new Map<string, number>()
  if (hasDca) for (const d of ngayMua) if (navByDate.has(d)) mayTheoNgay.set(d, moiLan)

  let iLenh = 0
  let units = 0
  let daMua = 0
  let daBan = 0
  let mayUnits = 0
  let mayTien = 0

  const points: GrowthPoint[] = phien.map((date) => {
    while (iLenh < theoNgay.length && theoNgay[iLenh].tradedOn <= date) {
      const t = theoNgay[iLenh++]
      if (t.kind === 'buy') {
        units += t.units
        daMua += t.amount
      } else if (t.kind === 'sell') {
        units -= t.units
        daBan += t.amount
      } else {
        // 'adjust' đổi số 口 (chia tách / gộp) nhưng KHÔNG phải tiền vào — mẫu số không đổi.
        units += t.units
      }
    }

    const tienMay = mayTheoNgay.get(date)
    if (tienMay != null) {
      mayUnits += (tienMay * NAV_UNITS) / navByDate.get(date)!
      mayTien += tienMay
    }

    const nav = navByDate.get(date)!
    return {
      date,
      fund: (nav / navGoc - 1) * 100,
      mine: daMua > 0 ? ((giaTri(units, nav) + daBan) / daMua - 1) * 100 : null,
      dca: hasDca && mayTien > 0 ? (giaTri(mayUnits, nav) / mayTien - 1) * 100 : null,
    }
  })

  return { points, hasDca }
}
