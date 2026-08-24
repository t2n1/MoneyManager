// Dải chọn khoảng thời gian của chế độ "Theo thời gian" (bản vẽ 2b).
//
// Vì sao phải có nó, và vì sao nó là DẢI CHỌN chứ không phải một cửa sổ đóng cứng:
// chế độ này trước tên là "Diễn biến" và không cắt thời gian ở đâu cả — bốn khối bên
// trong đều vẽ TRỌN lịch sử đang có. Nhãn cũ "6 tháng" từng hứa một khoảng cắt không
// tồn tại (xem AssetsPage.tsx). Bản 2b sửa theo chiều ngược lại: cho cắt thật, và
// **nói ra** khoảng đang cắt.
//
// ---- Vì sao "Từ đầu" là KHÔNG CÓ MỐC ĐẦU, không phải một ngày cụ thể --------------
//
// Bản đầu của file này nhận thêm `earliestISO` (mốc snapshot sớm nhất) để kẹp cửa sổ về
// dữ liệu thật có, rồi in ra "10-2024 → 08-2026 · 23 tháng". Nghe hợp lý, nhưng nó sai ở
// một ca có thật và đã dựng ra được: sổ CHƯA có ảnh chụp tài sản ròng nào (chúng chỉ ghi
// từ lần đầu mở chế độ này) trong khi sổ giao dịch đã dài hai năm. Lúc đó `earliestISO`
// bằng hôm nay, nên "Từ đầu" cắt đúng MỘT NGÀY — và cột "Δ từ đầu" của cả năm nhóm in ra
// "—" trong khi dữ liệu thì có sẵn.
//
// Gốc của lỗi: một mốc đầu duy nhất cho cả màn là điều không tồn tại. Ảnh chụp ròng, bản
// định giá và sổ giao dịch có ba mốc bắt đầu khác nhau, và người dùng cần biết cả ba chứ
// không phải một con số gộp. Nên:
//
//   · `startISO = null` cho "Từ đầu" — không cắt, để mỗi khối tự lấy trọn phần nó có;
//   · mỗi khối TỰ KHAI mốc đầu của mình ("từ 10-2024 · 23 mốc định giá" ở biểu đồ đầu tư);
//   · dòng chú thích ở header chỉ nói về CÁI CẮT, và khi không cắt thì nó nói đúng thế.
import { addMonthsISO } from '../../lib/dates'

export type AssetsRange = '1m' | '3m' | '12m' | 'all'

export const ASSETS_RANGES: readonly { value: AssetsRange; label: string }[] = [
  { value: '1m', label: '1 th' },
  { value: '3m', label: '3 th' },
  { value: '12m', label: '12 th' },
  { value: 'all', label: 'Từ đầu' },
] as const

/** Số tháng của mỗi lựa chọn; null = không cắt (từ đầu). */
export const RANGE_MONTHS: Record<AssetsRange, number | null> = {
  '1m': 1,
  '3m': 3,
  '12m': 12,
  all: null,
}

/** Nhãn ngắn để chêm vào tên cột / câu chú thích ("Δ 3 tháng", "Δ từ đầu"). */
export const RANGE_NOUN: Record<AssetsRange, string> = {
  '1m': '1 tháng',
  '3m': '3 tháng',
  '12m': '12 tháng',
  all: 'từ đầu',
}

/** "2024-10-07" → "10-2024" (thứ tự tháng-năm của bản vẽ 2b). */
export function monthLabel(iso: string): string {
  const [y, m] = iso.split('-')
  return `${m}-${y}`
}

export interface RangeSpan {
  /** Mốc đầu của cửa sổ; **null = không cắt** (chọn "Từ đầu"). */
  startISO: string | null
  /** Mốc cuối (hôm nay). */
  endISO: string
  /** Số tháng của cửa sổ; null khi không cắt. */
  months: number | null
}

/** Khoảng thật của một lựa chọn. Thuần: không cần biết dữ liệu có từ bao giờ. */
export function rangeSpan(range: AssetsRange, todayISO: string): RangeSpan {
  const months = RANGE_MONTHS[range]
  return {
    startISO: months == null ? null : addMonthsISO(todayISO, -months),
    endISO: todayISO,
    months,
  }
}

/**
 * Dòng chú thích cạnh dải chọn. Nó nói về CÁI CẮT, không phải về lượng dữ liệu — mỗi
 * khối bên dưới tự khai mốc đầu của mình, vì ba khối có ba mốc khác nhau.
 */
export function spanLabel(span: RangeSpan): string {
  if (span.startISO == null) return 'toàn bộ lịch sử đang có'
  return `${monthLabel(span.startISO)} → ${monthLabel(span.endISO)} · ${span.months} tháng`
}
