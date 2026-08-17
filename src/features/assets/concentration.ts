// Kết luận về MỨC TẬP TRUNG của danh mục cổ phiếu (bản vẽ 21a).
//
// 21a có một khối "Tỷ trọng" kết thúc bằng đúng một câu: "Một mã chiếm gần một nửa danh
// mục. Không phải lỗi — nhưng đáng biết trước khi mua thêm." Đó là toàn bộ giá trị của
// khối: bốn con số phần trăm thì bảng bên trên đã có rồi, thứ nó thêm vào là CÂU PHÁN.
//
// Vì sao là một file thuần chứ không phải mấy dòng ternary trong JSX: ngưỡng ở đây là
// quyết định, không phải trang trí — và có hai cái bẫy chỉ thấy khi viết test:
//
//   · Giữ ĐÚNG MỘT mã thì tỷ trọng luôn 100%. Cảnh báo "một mã chiếm 100% danh mục,
//     đáng biết trước khi mua thêm" là nói lại điều người ta vừa làm, không phải phát
//     hiện gì. Ca này phải im.
//   · Mã THIẾU GIÁ được `buildPortfolio` tạm định giá bằng giá vốn, nên tỷ trọng lúc đó
//     là hỗn hợp giá-thị-trường/giá-vốn. Câu phán vẫn nói được, nhưng phải nói kèm rằng
//     nó đang tính trên số tạm.
import { share } from './investFormat'

/** Tỷ trọng của mã nặng nhất từ mức này là ĐÁNG NÓI. */
export const TOP_HEAVY = 0.4
/** Hai mã đầu cộng lại từ mức này thì danh mục coi như dựa vào hai chân. */
export const TOP_TWO_HEAVY = 0.7

export type ConcentrationLevel =
  /** Một mã đủ nặng để đáng nhắc trước khi mua thêm. */
  | 'top-heavy'
  /** Không mã nào áp đảo, nhưng hai mã đầu gánh gần hết. */
  | 'two-heavy'
  /** Chia đủ rộng — chỉ nói mã nặng nhất là bao nhiêu. */
  | 'spread'
  /** Chỉ giữ một mã: tỷ trọng không nói thêm được gì. */
  | 'single'

export interface ConcentrationVerdict {
  level: ConcentrationLevel
  /** Câu phán, đã dựng xong. */
  text: string
  /** true = có mã thiếu giá nên tỷ trọng đang tính một phần theo giá vốn. */
  estimated: boolean
}

/** Một dòng đầu vào — đúng phần `PortfolioPosition` mà phép này cần. */
export interface WeighedPosition {
  symbol: string
  /** value / tổng giá trị cổ phiếu (0..1) — `PortfolioPosition.weight`. */
  weight: number
  /** null = chưa có giá, đang tạm tính theo giá vốn. */
  price: number | null
}

/**
 * Câu phán về mức tập trung. `null` = không giữ mã nào, không có gì để phán.
 *
 * Mẫu số là TỔNG GIÁ TRỊ CỔ PHIẾU (đúng `weight` của `buildPortfolio`), không phải cả
 * danh mục gồm tiền chưa mua. Mock của 21a xếp "Tiền chưa mua 3%" chung một danh sách
 * với các mã, nhưng câu hỏi ở đây là "tôi có dồn hết vào một mã không" — trộn tiền nhàn
 * rỗi vào mẫu số làm chính con số ấy nhỏ đi đúng lúc nó cần được nghe, và tệ hơn: nạp
 * thêm tiền vào tài khoản mà chưa mua gì sẽ tự "chữa" một danh mục vẫn đang dồn một mã.
 */
export function concentrationVerdict(
  positions: WeighedPosition[],
): ConcentrationVerdict | null {
  if (positions.length === 0) return null

  // Không tin thứ tự người gọi đưa vào — `buildPortfolio` có sắp giảm dần, nhưng hàm
  // thuần thì phải tự đứng được.
  const sorted = [...positions].sort((a, b) => b.weight - a.weight)
  const estimated = positions.some((p) => p.price === null)
  const top = sorted[0]
  const topPct = share(top.weight)

  if (sorted.length === 1) {
    return {
      level: 'single',
      text: `Chỉ giữ ${top.symbol} nên tỷ trọng chưa nói được gì.`,
      estimated,
    }
  }

  if (top.weight >= TOP_HEAVY) {
    return {
      level: 'top-heavy',
      // "Không phải lỗi" là chữ của 21a và nó đáng giữ nguyên: dồn vào một mã là một
      // lựa chọn, không phải một sai sót cần sửa. Câu này báo tin, không ra lệnh.
      text: `${top.symbol} một mình chiếm ${topPct} phần cổ phiếu. Không phải lỗi — nhưng đáng biết trước khi mua thêm.`,
      estimated,
    }
  }

  const topTwo = top.weight + sorted[1].weight
  if (topTwo >= TOP_TWO_HEAVY) {
    return {
      level: 'two-heavy',
      text: `${top.symbol} và ${sorted[1].symbol} cộng lại chiếm ${share(topTwo)} phần cổ phiếu — danh mục đang dựa vào hai mã.`,
      estimated,
    }
  }

  return {
    level: 'spread',
    text: `Nặng nhất là ${top.symbol} với ${topPct} — ${sorted.length} mã, không mã nào áp đảo.`,
    estimated,
  }
}
