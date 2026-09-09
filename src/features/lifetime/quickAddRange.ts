// Khoảng năm chọn được bằng cách kéo ngang trên nền đồ thị → tham số cho mẫu.
//
// Mỗi mẫu HẤP THU khoảng theo nghĩa riêng của nó, không phải cùng một chỗ: kéo 35 năm
// trên "Mua nhà" nghĩa là vay 35 năm, còn trên "Sinh con" nghĩa là nuôi tới 22 tuổi.
// Nhét khoảng vào `end_year` cho tất cả thì "Mua nhà" thành một khoản chi trải 35 năm
// mà không có khoản trả trước, tức là sai hẳn hình dạng dòng tiền.
//
// Thuần, không import React và không import repo — mọi luật ở đây test được bằng số.

/** Khoảng năm đã chuẩn hoá: `startYear <= endYear`. */
export interface YearSpan {
  startYear: number
  endYear: number
}

/** Tham số áp lên `PresetContext` khi sinh mẫu từ một khoảng. */
export interface SpanApply {
  year: number
  termYears?: number
  untilAge?: number
  endYear?: number
}

/** Hai đầu kéo (thứ tự bất kỳ) → khoảng đúng chiều. */
export function normalizeSpan(a: number, b: number): YearSpan {
  return a <= b ? { startYear: a, endYear: b } : { startYear: b, endYear: a }
}

/** Số năm của khoảng, ĐẾM CẢ HAI ĐẦU: 2027–2031 là 5 năm. */
export function spanYears(s: YearSpan): number {
  return s.endYear - s.startYear + 1
}

/** Mẫu vay: khoảng = thời hạn vay. */
const THEO_THOI_HAN = new Set(['mua-nha', 'mua-xe'])
/** Mẫu nuôi con: khoảng = nuôi tới bao nhiêu tuổi. */
const THEO_TUOI = new Set(['sinh-con'])

export function applySpanToPreset(presetId: string, s: YearSpan): SpanApply {
  const n = spanYears(s)
  // Bấm một chỗ không phải là một khoảng: nó chỉ nói năm. Áp `termYears: 1` vào đây là
  // bịa ra "vay 1 năm" từ một cú bấm.
  if (n <= 1) return { year: s.startYear }
  if (THEO_THOI_HAN.has(presetId)) return { year: s.startYear, termYears: n }
  if (THEO_TUOI.has(presetId)) return { year: s.startYear, untilAge: n - 1 }
  return { year: s.startYear, endYear: s.endYear }
}
