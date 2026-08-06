// Câu tổng cho cả trang Báo cáo: ba số to rồi MỘT câu nối chúng lại.
//
// App đã có câu kết luận ở từng thẻ (VerdictNote), nhưng chưa có câu nào trả lời "kỳ này
// rốt cuộc thế nào" trước khi người đọc cuộn qua sáu cái thẻ. Mượn cách permtrack mở đầu
// trang: ba con số lớn, rồi một câu văn nối chúng thành một kết luận.
//
// Trả về `text` là CHUỖI, không phải JSX: để test bằng chuỗi được, và để câu chữ nằm một
// chỗ thay vì rải trong cây thẻ.

export interface HeadlineInput {
  income: number
  expense: number
  /** Chi của kỳ liền trước, để so. null = không có kỳ trước để so. */
  priorExpense: number | null
  /** "tháng này" / "năm này" — ghép thẳng vào câu. */
  periodNoun: string
}

export interface Headline {
  tone: 'good' | 'warn' | 'bad' | 'info'
  /** Phần trăm thu nhập giữ lại được. null khi không có thu. */
  ratePct: number | null
  /** Chi hơn/kém kỳ trước bao nhiêu phần trăm. null khi không so được. */
  deltaPct: number | null
  text: string
}

/** Trả null khi kỳ chưa có gì để nói (không thu, không chi). */
export function headlineOf(input: HeadlineInput): Headline | null {
  const { income, expense, priorExpense, periodNoun } = input
  if (income === 0 && expense === 0) return null

  const ratePct = income > 0 ? Math.round(((income - expense) / income) * 100) : null
  // Kỳ trước bằng 0 thì mọi mức chi đều là "tăng vô hạn" — không nói gì còn hơn nói sai.
  const deltaPct =
    priorExpense !== null && priorExpense > 0
      ? Math.round(((expense - priorExpense) / priorExpense) * 100)
      : null

  const tone: Headline['tone'] =
    ratePct === null ? 'info' : ratePct < 0 ? 'bad' : ratePct >= 20 ? 'good' : 'warn'

  const parts: string[] = []
  // Cố ý KHÔNG nhắc mốc 20% của quy tắc 50/30/20 ở đây: thẻ "Giữ lại được bao nhiêu"
  // ngay bên dưới đã nói đúng câu đó. Câu tổng chỉ giữ phần mà không thẻ nào khác nói —
  // con số của kỳ và so sánh với kỳ trước.
  if (ratePct === null) {
    parts.push(`Chưa ghi khoản thu nào ${periodNoun}`)
  } else if (ratePct < 0) {
    parts.push(`Chi vượt thu ${Math.abs(ratePct)}% ${periodNoun} — đang phải rút vào tiền cũ`)
  } else {
    parts.push(`Giữ lại được ${ratePct}% thu nhập ${periodNoun}`)
  }

  // Đi ngang thì bỏ hẳn mệnh đề so sánh: "chi nhiều hơn kỳ trước 0%" là câu vô nghĩa.
  if (deltaPct !== null && deltaPct !== 0) {
    parts.push(`chi ${compareClause(deltaPct)}`)
  }

  return { tone, ratePct, deltaPct, text: `${parts.join(', ')}.` }
}

/**
 * Từ 200% trở lên thì đọc theo SỐ LẦN, không theo phần trăm.
 *
 * Lý do: kỳ trước chi ít thì phần trăm phình ra thành những con số như "nhiều hơn 970%"
 * — đúng về số học nhưng não không quy được ra cái gì. "gấp 10,7 lần" thì hình dung được
 * ngay. Mốc 200% vì dưới đó phần trăm vẫn còn dễ đọc ("nhiều hơn 80%").
 */
function compareClause(deltaPct: number): string {
  if (deltaPct >= 200) {
    const times = (1 + deltaPct / 100).toFixed(1).replace('.', ',')
    return `gấp ${times} lần kỳ trước`
  }
  return `${deltaPct > 0 ? 'nhiều hơn' : 'ít hơn'} kỳ trước ${Math.abs(deltaPct)}%`
}
