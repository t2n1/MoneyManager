// Chia các khoản chi thành từng khoảng tiền để vẽ cột phân bố.
//
// Phân vị trả lời "mức điển hình là bao nhiêu"; phân bố trả lời "các lần chi nằm rải thế
// nào" — hai câu hỏi khác nhau, permtrack để cả hai cạnh nhau ở trang lương và đó là chỗ
// thẻ "Một lần chi to cỡ nào" đang thiếu.

export interface HistogramBin {
  from: number
  to: number
  count: number
}

/**
 * Số cột tối đa 12 để trên điện thoại còn đọc được, và không bao giờ nhiều hơn số khoản
 * chi (4 khoản mà 12 cột thì nhìn như răng lược).
 */
export function spendHistogram(amounts: number[], binCount = 12): HistogramBin[] {
  if (amounts.length === 0) return []

  const min = Math.min(...amounts)
  const max = Math.max(...amounts)

  // Mọi khoản bằng nhau: chia khoảng sẽ ra bề rộng 0 rồi chia cho 0.
  if (min === max) return [{ from: min, to: max, count: amounts.length }]

  const n = Math.max(1, Math.min(binCount, amounts.length))
  const width = (max - min) / n
  const bins: HistogramBin[] = Array.from({ length: n }, (_, i) => ({
    from: min + i * width,
    to: min + (i + 1) * width,
    count: 0,
  }))
  // Biên trên của cột cuối phải là ĐÚNG max: cộng dồn `width` n lần sinh sai số dấu phẩy
  // động, và cái biên đó được in ra thành nhãn tiền.
  bins[n - 1].to = max

  for (const v of amounts) {
    // Giá trị lớn nhất rơi đúng biên trên → ép về cột cuối thay vì tràn ra ngoài mảng.
    const idx = Math.min(n - 1, Math.floor((v - min) / width))
    bins[idx].count += 1
  }

  return bins
}
