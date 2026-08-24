// Dải kết quả sống của trình sửa kịch bản — ba con số (tự do tài chính · âm từ · cuối
// đời) kèm delta so với bản ĐÃ LƯU, và hai đường sparkline chồng nhau.
//
// VÌ SAO ĐỨNG RIÊNG (quy ước "toán thuần nằm ngoài React"): cái khó ở đây toàn là
// NHÁNH BIÊN, không phải cách vẽ. "Trước không đạt, giờ đạt" và "trước đạt, giờ không"
// là hai câu chữ khác nhau và hai màu khác nhau; "muộn hơn" là TỐT cho năm âm nhưng
// XẤU cho năm FIRE; hai đường sparkline phải chung một thang y, nếu không thì đường
// xám nằm dưới đường xanh chỉ vì nó được chuẩn hoá riêng. Nhìn một component render
// xong thì không kiểm được nhánh nào đã chạy.
//
// KHÔNG format tiền ở đây: `formatCompact` biết bậc thập phân của từng loại tiền và
// còn phải tôn trọng chế độ riêng tư. Hàm này trả về HIỆU dạng số, component lo chữ.
// Cùng lý do đã ghi ở `LifetimeVerdict` (summary.ts) và `DraftChange` (draft.ts).

/** Tốt hơn / xấu hơn / không đổi — chỗ gọi tra ra màu. */
export type DeltaTone = 'good' | 'bad' | 'same'

export interface YearDelta {
  /** Chữ hiện dưới con số. Rỗng = chưa có bản nháp, không có gì để so. */
  text: string
  tone: DeltaTone
}

/**
 * Delta của một cột mốc tính bằng NĂM (năm đạt tự do tài chính, năm đầu tiên âm).
 *
 * `null` nghĩa là "không có năm nào" — và nó mang hai nghĩa NGƯỢC nhau tuỳ cột: không
 * đạt FIRE là tin xấu, không năm nào âm là tin tốt. Nên hướng tốt/xấu phải do chỗ gọi
 * khai (`laterIsBetter`), không suy được từ con số.
 *
 * @param now       năm ở bản nháp; null = không có
 * @param before    năm ở bản đã lưu; null = không có; `undefined` = chưa có nháp
 * @param nullLabel chữ tả ca `before === null` ("không đạt" / "không âm")
 */
export function yearDelta(
  now: number | null,
  before: number | null | undefined,
  nullLabel: string,
  laterIsBetter: boolean,
): YearDelta {
  if (before === undefined) return { text: '', tone: 'same' }
  if (now === before) return { text: 'không đổi', tone: 'same' }

  // Một trong hai bên không có năm nào: hiệu số vô nghĩa, nên nói thẳng bên KIA là gì.
  // Tốt/xấu lúc này KHÔNG hỏi `laterIsBetter` mà hỏi "phía nào là phía có năm":
  //   · cột FIRE — từ "không đạt" sang có năm là tốt lên;
  //   · cột Âm từ — từ "không âm" sang có năm là xấu đi.
  // Đúng một câu quy về `laterIsBetter`: có năm ⇔ tốt khi `laterIsBetter === false`.
  const gainingAYearIsGood = !laterIsBetter
  if (before === null) return { text: `trước: ${nullLabel}`, tone: gainingAYearIsGood ? 'good' : 'bad' }
  if (now === null) return { text: `trước: ${before}`, tone: gainingAYearIsGood ? 'bad' : 'good' }

  const diff = now - before
  const better = laterIsBetter ? diff > 0 : diff < 0
  return {
    text: `${diff > 0 ? '+' : '−'}${Math.abs(diff)} năm`,
    tone: better ? 'good' : 'bad',
  }
}

export interface MoneyDelta {
  /** Hiệu (nháp − đã lưu), minor units. `null` = chưa có nháp hoặc không đổi. */
  diffMinor: number | null
  /** true khi không có nháp — chỗ gọi vẫn phải giữ chỗ cho dòng delta. */
  absent: boolean
  tone: DeltaTone
}

/** Delta của cột tài sản cuối đời. Nhiều tiền hơn là tốt hơn, không có ca `null` nào. */
export function moneyDelta(nowMinor: number, beforeMinor: number | null | undefined): MoneyDelta {
  if (beforeMinor === undefined || beforeMinor === null) {
    return { diffMinor: null, absent: true, tone: 'same' }
  }
  if (nowMinor === beforeMinor) return { diffMinor: null, absent: false, tone: 'same' }
  const diff = nowMinor - beforeMinor
  return { diffMinor: diff, absent: false, tone: diff > 0 ? 'good' : 'bad' }
}

export interface StripSpark {
  /** Đường của bản nháp / bản đang xem. */
  draft: string
  /** Đường của bản ĐÃ LƯU — null khi chưa có nháp (không có gì để so). */
  saved: string | null
  /** Toạ độ y của mốc 0. */
  zeroY: number
}

/** Bề ngang khung vẽ — cùng con số với `viewBox="0 0 200 44"` trong bản vẽ. */
export const SPARK_W = 200
/** Chiều cao khung vẽ. Nét chừa 2px trên/dưới để không bị cắt ở mép viewBox. */
export const SPARK_H = 44
const SPARK_TOP = 2
const SPARK_BOTTOM = 42

/**
 * Hai đường sparkline CHUNG một thang y, luôn có mốc 0 trong khung.
 *
 * Chung thang là điều kiện để đặt cạnh nhau có nghĩa: chuẩn hoá riêng từng đường thì
 * một kịch bản cạn tiền và một kịch bản dư tiền vẽ ra hai đường y hệt nhau.
 *
 * Ép 0 vào thang (khởi tạo lo/hi bằng 0 chứ không bằng giá trị đầu) vì mốc 0 là ranh
 * giới "còn tiền / hết tiền" — cả dải kết quả xoay quanh nó, mà một đường toàn số
 * dương sẽ đẩy nó ra ngoài khung nếu không ép.
 *
 * Ít hơn hai điểm thì không có đường nào để nối: trả về chuỗi rỗng, chỗ gọi tự ẩn.
 */
export function stripSpark(draftValues: number[], savedValues: number[] | null): StripSpark {
  let lo = 0
  let hi = 0
  for (const v of draftValues) {
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  if (savedValues) {
    for (const v of savedValues) {
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
  }
  const span = Math.max(1, hi - lo)
  const sy = (v: number) =>
    Math.round((SPARK_BOTTOM - ((v - lo) / span) * (SPARK_BOTTOM - SPARK_TOP)) * 10) / 10

  const pathOf = (values: number[]) => {
    if (values.length < 2) return ''
    const stepX = SPARK_W / (values.length - 1)
    return values
      .map((v, i) => {
        const x = Math.round(i * stepX * 10) / 10
        return `${i === 0 ? 'M' : 'L'}${x} ${sy(v)}`
      })
      .join(' ')
  }

  return {
    draft: pathOf(draftValues),
    saved: savedValues ? pathOf(savedValues) || null : null,
    zeroY: sy(0),
  }
}
