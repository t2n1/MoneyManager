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
  /**
   * Mệnh đề thứ ba của bản vẽ 23a: "…và đang trên đà kết thúc tháng dưới ngân sách".
   *
   * Vì sao nó phải có ở đây chứ không để người đọc tự ghép: hai vế của câu này đo HAI
   * TRỤC KHÁC NHAU và có thể ngược nhau. `ratePct` là tỷ lệ giữ lại (đo trên thu nhập),
   * còn ngân sách là trần CHI. Đo trên dữ liệu demo: giữ lại 65% — rất tốt theo trục thứ
   * nhất — trong khi dự báo cuối tháng ¥126k trên tổng hạn mức ¥68k, tức trên đà vượt
   * 85%. Câu cũ chỉ nói vế đầu nên nó phán "Tốt" ngay cạnh một ô báo vượt gần gấp đôi.
   *
   * Bỏ trống (hoặc `budgeted <= 0`) = không nói gì. Chưa đặt hạn mức thì không có trần
   * nào để "trên đà vượt", và bịa ra một kết luận từ mẫu số 0 là cách nhanh nhất để câu
   * tổng mất tín nhiệm.
   */
  pace?: { forecast: number; budgeted: number } | null
}

export interface Headline {
  tone: 'good' | 'warn' | 'bad' | 'info'
  /** Phần trăm thu nhập giữ lại được. null khi không có thu. */
  ratePct: number | null
  /** Chi hơn/kém kỳ trước bao nhiêu phần trăm. null khi không so được. */
  deltaPct: number | null
  text: string
  /**
   * Bản vài chữ cho chế độ Gọn (src/lib/density.ts) — giữ đúng con số quyết định, bỏ
   * mọi mệnh đề giải thích. Ở đây chứ không ở component vì `text` cũng ở đây: hai bản
   * của cùng một kết luận mà nằm hai file thì sớm muộn nói lệch nhau.
   */
  short: string
}

/** Trả null khi kỳ chưa có gì để nói (không thu, không chi). */
export function headlineOf(input: HeadlineInput): Headline | null {
  const { income, expense, priorExpense, periodNoun, pace } = input
  if (income === 0 && expense === 0) return null

  const ratePct = income > 0 ? Math.round(((income - expense) / income) * 100) : null
  // Kỳ trước bằng 0 thì mọi mức chi đều là "tăng vô hạn" — không nói gì còn hơn nói sai.
  const deltaPct =
    priorExpense !== null && priorExpense > 0
      ? Math.round(((expense - priorExpense) / priorExpense) * 100)
      : null

  // Trên đà vượt trần chi hay không — null = không có trần để so.
  const overPct =
    pace && pace.budgeted > 0
      ? Math.round(((pace.forecast - pace.budgeted) / pace.budgeted) * 100)
      : null
  const overBudget = overPct !== null && overPct > 0

  let tone: Headline['tone'] =
    ratePct === null ? 'info' : ratePct < 0 ? 'bad' : ratePct >= 20 ? 'good' : 'warn'
  // TRẦN 'warn' khi đang trên đà vượt ngân sách: giữ lại nhiều mà vẫn tiêu quá trần là
  // chuyện có thật (thu tăng đột biến, hoặc trần đặt quá chặt), nhưng gắn nhãn "Tốt" cho
  // nó là nói một nửa. Không hạ xuống 'bad' — tiền vẫn đang dư, chưa có gì cháy.
  if (overBudget && tone === 'good') tone = 'warn'

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

  // Mệnh đề NHÌN VỀ PHÍA TRƯỚC (23a). Hai vế trước nói chuyện đã rồi; vế này nói kỳ sẽ
  // kết thúc thế nào — và nó là vế duy nhất so với TRẦN CHI.
  if (overPct !== null) {
    parts.push(
      overBudget
        ? `và đang trên đà vượt ngân sách ${overPct}%`
        : `và đang trên đà kết thúc ${periodNoun} dưới ngân sách`,
    )
  }

  const shortRate =
    ratePct === null
      ? 'Chưa có thu'
      : ratePct < 0
        ? `Chi vượt thu ${Math.abs(ratePct)}%`
        : `Giữ lại ${ratePct}%`
  // Bản ngắn ưu tiên mệnh đề VƯỢT TRẦN hơn mệnh đề so-với-kỳ-trước: chế độ Gọn là mặc
  // định của app, nên nếu chip chỉ mang "Giữ lại 65% · chi gấp 11,9 lần" thì phần lớn
  // người dùng không bao giờ thấy lời cảnh báo — tức việc thêm nó vào `text` thành vô ích.
  // Chỉ nhường chỗ khi KHÔNG vượt: lúc đó "dưới ngân sách" là tin tốt, không gấp.
  const short = overBudget
    ? `${shortRate} · trên đà vượt trần ${overPct}%`
    : deltaPct !== null && deltaPct !== 0
      ? `${shortRate} · chi ${shortCompare(deltaPct)}`
      : shortRate

  return { tone, ratePct, deltaPct, text: `${parts.join(', ')}.`, short }
}

/**
 * Bản ngắn của `compareClause` cho chip ở chế độ Gọn: bỏ tên kỳ, chỉ còn chiều và số.
 *
 * Giữ nguyên mốc 200% → đọc theo SỐ LẦN của `compareClause`, vì lý do không đổi khi câu
 * ngắn lại: "+970%" vẫn là con số não không quy ra được cái gì. Dấu dùng ASCII `+`/`-`
 * cho khớp `formatMoney`, không dùng U+2212 — hai glyph lệch bề rộng.
 */
export function shortCompare(deltaPct: number): string {
  if (deltaPct >= 200) {
    const times = (1 + deltaPct / 100).toFixed(1).replace('.', ',')
    return `gấp ${times} lần`
  }
  return `${deltaPct > 0 ? '+' : '-'}${Math.abs(deltaPct)}%`
}

/**
 * Từ 200% trở lên thì đọc theo SỐ LẦN, không theo phần trăm.
 *
 * Lý do: kỳ trước chi ít thì phần trăm phình ra thành những con số như "nhiều hơn 970%"
 * — đúng về số học nhưng não không quy được ra cái gì. "gấp 10,7 lần" thì hình dung được
 * ngay. Mốc 200% vì dưới đó phần trăm vẫn còn dễ đọc ("nhiều hơn 80%").
 *
 * Export vì tab Thấu hiểu (buildInsights) nói CÙNG một phép so sánh — hai chỗ mà hai
 * cách đọc ("+970%" vs "gấp 10,7 lần") thì người dùng tưởng là hai con số khác nhau.
 * `noun` để chỗ so theo tháng nói "tháng trước" thay vì "kỳ trước".
 */
export function compareClause(deltaPct: number, noun = 'kỳ trước'): string {
  if (deltaPct >= 200) {
    const times = (1 + deltaPct / 100).toFixed(1).replace('.', ',')
    return `gấp ${times} lần ${noun}`
  }
  return `${deltaPct > 0 ? 'nhiều hơn' : 'ít hơn'} ${noun} ${Math.abs(deltaPct)}%`
}
