// So kỳ đang DỞ với kỳ trước — luôn cắt về CÙNG SỐ NGÀY.
//
// Vì sao phải có file này: bản trước so chi 18 ngày của tháng 8 với TRỌN tháng 7 rồi
// kết luận "giảm 13%". Cắt tháng 7 về 18 ngày thì tháng 8 **tăng 23%**. Dấu đảo hẳn —
// đó không phải sai số, đó là câu nói ngược sự thật, và nó nằm ở dòng đầu tiên của cả
// trang Báo cáo lẫn Bản tin.
//
// Cùng nguyên tắc với `weekPace.ts` (so tuần đang dở), chỉ khác đơn vị kỳ. Chỗ khác
// biệt duy nhất đáng kể: "ngày thứ N của tháng" phải tính theo THÁNG TÀI CHÍNH, vì
// người dùng đặt được `monthStartDay` (tháng bắt đầu ngày 25 chẳng hạn). Nên hàm ở đây
// nhận số ngày đã trôi, không tự đọc `new Date().getDate()`.
//
// Số của TRỌN kỳ trước vẫn được trả về (`priorFull`) nhưng chỉ để in làm ngữ cảnh —
// KHÔNG BAO GIỜ dùng nó làm mẫu số của phần trăm.

/** Số ngày đã trôi trong kỳ, đếm từ 1. Cắt về [0, tổng số ngày]. */
export function elapsedDays(daysElapsed: number, daysInPeriod: number): number {
  if (!Number.isFinite(daysElapsed) || daysElapsed <= 0) return 0
  return Math.min(Math.floor(daysElapsed), Math.max(0, Math.floor(daysInPeriod)))
}

export interface PeriodCompareInput {
  /** Chi từng ngày của kỳ này, phần tử 0 là ngày đầu kỳ. */
  current: readonly number[]
  /** Chi từng ngày của kỳ liền trước, đủ cả kỳ. */
  prior: readonly number[]
  /**
   * Đang ở ngày thứ mấy của kỳ này (1..n). Kỳ đã xong thì truyền đúng `current.length`
   * — lúc đó phép cắt thành phép không cắt và không có nhánh riêng nào phải nhớ.
   */
  daysElapsed: number
  /** Tổng số ngày của kỳ này. */
  daysInPeriod: number
}

export interface PeriodCompare {
  /** Chi của kỳ này tính tới `daysElapsed`. */
  spent: number
  /** Chi của kỳ TRƯỚC tính tới ĐÚNG `daysElapsed` ngày đầu — mẫu số của `deltaPct`. */
  priorSameDays: number
  /** Chi TRỌN kỳ trước. Chỉ để in làm ngữ cảnh, không dùng để tính %. */
  priorFull: number
  /** (spent − priorSameDays) / priorSameDays × 100. null khi kỳ trước 0 ngày đó không chi. */
  deltaPct: number | null
  /** true khi kỳ chưa xong — chỗ hiển thị dùng nó để quyết định có in nhãn kỳ hay không. */
  partial: boolean
  daysElapsed: number
  daysInPeriod: number
  /** Số ngày còn lại của kỳ. */
  daysLeft: number
}

const sum = (xs: readonly number[], n: number) => {
  let s = 0
  for (let i = 0; i < Math.min(n, xs.length); i++) s += xs[i]
  return s
}

/**
 * Trả null khi không có kỳ trước để so. Nếu có, `deltaPct` LUÔN được tính trên cùng số
 * ngày — không có tham số nào bật/tắt được điều đó.
 */
export function periodCompare(input: PeriodCompareInput): PeriodCompare | null {
  const { current, prior, daysInPeriod } = input
  if (prior.length === 0) return null

  const days = elapsedDays(input.daysElapsed, daysInPeriod)
  const spent = sum(current, days)
  const priorSameDays = sum(prior, days)
  const priorFull = sum(prior, prior.length)

  // Kỳ trước không chi gì trong đúng mấy ngày đó thì mọi mức chi kỳ này đều là "tăng vô
  // hạn" — không nói gì còn hơn nói một con số vô nghĩa.
  const deltaPct =
    priorSameDays > 0 ? Math.round(((spent - priorSameDays) / priorSameDays) * 100) : null

  return {
    spent,
    priorSameDays,
    priorFull,
    deltaPct,
    partial: days < daysInPeriod,
    daysElapsed: days,
    daysInPeriod,
    daysLeft: Math.max(0, daysInPeriod - days),
  }
}

/**
 * Nhãn kỳ cho header: `18/31 ngày · còn 13`. Kỳ đã xong thì chỉ còn `31 ngày` — không
 * in "còn 0", vì "còn 0 ngày" đọc như một cảnh báo chứ không như một sự thật hiển nhiên.
 */
export function periodDaysLabel(c: Pick<PeriodCompare, 'daysElapsed' | 'daysInPeriod' | 'daysLeft'>): string {
  if (c.daysLeft <= 0) return `${c.daysInPeriod} ngày`
  return `${c.daysElapsed}/${c.daysInPeriod} ngày · còn ${c.daysLeft}`
}

/**
 * Cắt một con số của TRỌN kỳ trước về `daysElapsed` ngày theo tỷ lệ đều.
 *
 * Dùng cho những chỗ chỉ có tổng kỳ, không có chi từng ngày — cụ thể là cột "TB 3
 * tháng" của bảng danh mục. Nói rõ đây là XẤP XỈ: nó giả định chi rải đều trong tháng,
 * điều không đúng với tiền nhà (dồn một ngày). Chỗ nào có dữ liệu ngày thì phải dùng
 * `periodCompare`, đừng dùng hàm này cho tiện.
 */
export function prorate(fullPeriodTotal: number, daysElapsed: number, daysInPeriod: number): number {
  if (daysInPeriod <= 0) return 0
  const days = elapsedDays(daysElapsed, daysInPeriod)
  return Math.round((fullPeriodTotal * days) / daysInPeriod)
}
