// "Kỳ chưa trọn" — tháng đang chạy dở, số của nó chưa so được với các tháng đã xong.
// Thuần, không phụ thuộc React, để unit-test được.
//
// VÌ SAO CÓ FILE NÀY: biểu đồ 6 tháng vẽ cột cuối ngang hàng với năm cột kia, trong khi
// cột đó mới có 7/30 ngày. Người đọc kết luận "tháng này tiêu ít hẳn" — sai, mà là kiểu
// sai KHÔNG có cách nào tự phát hiện: không con số nào trên màn hình mâu thuẫn với nó.
//
// Phần khó không phải "biết tháng nào đang dở" mà là TÁCH ĐƯỜNG làm hai chuỗi để đoạn
// cuối vẽ nét đứt: Recharts nhận `strokeDasharray` cho cả một `<Line>`, không cho từng
// đoạn. Chỗ dễ sai nằm ở điểm giáp ranh — xem `splitOpenSeries`.

import { monthId, type MonthlyPoint } from './aggregate'
import type { MonthKey } from '../../lib/dates'

/** Điểm cuối của chuỗi có phải kỳ đang chạy dở không. */
export function hasOpenPeriod(
  points: readonly Pick<MonthlyPoint, 'key'>[],
  currentKey: MonthKey | null,
): boolean {
  if (currentKey === null || points.length === 0) return false
  return monthId(points[points.length - 1].key) === monthId(currentKey)
}

export interface OpenSeries {
  /** Chuỗi NÉT LIỀN: mọi kỳ đã trọn. `null` ở kỳ dở để đường dừng lại đó. */
  solid: (number | null)[]
  /** Chuỗi NÉT ĐỨT: chỉ hai điểm cuối. `null` ở mọi chỗ khác. */
  open: (number | null)[]
  /** Bản ĐỦ — nuôi bảng chú giải, không vẽ. */
  all: (number | null)[]
}

/**
 * Tách một chuỗi giá trị làm hai để vẽ đoạn cuối bằng nét đứt.
 *
 * BA CHỖ DỄ SAI, cả ba đã thành phép thử:
 *
 * 1. Chuỗi nét đứt phải có giá trị ở CẢ HAI đầu (điểm giáp ranh và điểm cuối). Chỉ đặt
 *    ở điểm cuối thì không có gì để nối và đoạn nét đứt không hiện ra.
 * 2. Vì thế điểm giáp ranh có mặt trong CẢ HAI chuỗi — nơi gọi phải tắt chú giải của
 *    một trong hai, không thì tháng đó in "Giữ lại" hai lần.
 * 3. Cắt `solid` ở điểm cuối cũng cắt luôn giá trị khỏi chú giải của đúng tháng người
 *    ta xem nhiều nhất. Vì vậy có `all`: một chuỗi vô hình chỉ để chú giải đọc.
 *
 * `open` toàn `null` khi kỳ cuối đã trọn (hoặc chuỗi chỉ có một điểm) — lúc đó `solid`
 * bằng đúng `all` và nơi gọi không cần vẽ gì thêm.
 */
export function splitOpenSeries(
  values: readonly (number | null)[],
  isOpen: boolean,
): OpenSeries {
  const all = [...values]
  const last = values.length - 1
  if (!isOpen || last < 1) {
    return { solid: all, open: values.map(() => null), all }
  }
  return {
    solid: values.map((v, i) => (i === last ? null : v)),
    open: values.map((v, i) => (i === last || i === last - 1 ? v : null)),
    all,
  }
}
