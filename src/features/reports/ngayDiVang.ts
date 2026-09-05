// Chuyến đi = một dải ngày TRỐNG trong sổ, không phải một khoản chi (spec
// 2026-09-05-chuyen-di). File này thuần: dò dải trống, và sinh tập ngày/tháng cần loại
// khỏi mốc so.
//
// Vì sao loại theo NGÀY chứ không theo THÁNG: periodCompare/forecastMonthEnd vốn làm
// việc trên mảng chi-từng-ngày ("So với trước — cùng số ngày"). Bỏ 7 ngày đi vắng, giữ
// 21 ngày thật, chính xác hơn vứt cả tháng. Riêng avg3 là số theo tháng → thangCoChuyenDi.

import { addDaysISO, daysBetween, monthKeyForDate } from '../../lib/dates'
import type { TripRow } from '../../types/database.types'
import { monthId } from './aggregate'

/**
 * Ngưỡng dùng ở HAI chỗ, cố ý là MỘT hằng số: (1) dải trống ≥ ngần này ngày mới đáng
 * hỏi "đi vắng?", (2) tháng có ≥ ngần này ngày đi vắng mới bị loại khỏi avg3.
 * 4 là phỏng đoán đầu tiên — trên dữ liệu thật nó cho đúng 1 câu hỏi trong 13 tháng.
 * Hỏi nhiều quá thì nâng số này, đừng thêm luật phụ.
 */
export const NGUONG_NGAY_VANG = 4

/** Tập ngày ISO nằm trong một chuyến đã xác nhận (dismissed = false), gồm cả hai đầu. */
export function ngayDiVang(trips: readonly TripRow[]): ReadonlySet<string> {
  const out = new Set<string>()
  for (const t of trips) {
    if (t.dismissed) continue
    for (let d = t.start_on; d <= t.end_on; d = addDaysISO(d, 1)) out.add(d)
  }
  return out
}

/** Bỏ các điểm rơi vào ngày đi vắng. Giữ nguyên thứ tự; tập rỗng thì trả bản sao y. */
export function boNgayDiVang<P extends { date: string }>(
  points: readonly P[],
  vang: ReadonlySet<string>,
): P[] {
  if (vang.size === 0) return [...points]
  return points.filter((p) => !vang.has(p.date))
}

/**
 * Tháng (khoá dạng `monthId` của aggregate — `${year}-${month}`, KHÔNG độn 0) có
 * ≥ NGUONG_NGAY_VANG ngày đi vắng. Tháng TÀI CHÍNH theo monthStartDay, không phải
 * tháng dương lịch — người dùng đặt được ngày bắt đầu tháng.
 */
export function thangCoChuyenDi(
  trips: readonly TripRow[],
  monthStartDay: number,
): ReadonlySet<string> {
  const dem = new Map<string, number>()
  for (const d of ngayDiVang(trips)) {
    const k = monthId(monthKeyForDate(d, monthStartDay))
    dem.set(k, (dem.get(k) ?? 0) + 1)
  }
  const out = new Set<string>()
  for (const [k, n] of dem) if (n >= NGUONG_NGAY_VANG) out.add(k)
  return out
}

export interface KhoangVang {
  startISO: string
  endISO: string
  soNgay: number
}

/**
 * Dò các dải ≥ NGUONG_NGAY_VANG ngày liên tiếp không có giao dịch nào, trong
 * [windowStartISO, todayISO] (đều gồm).
 *
 * Vì sao dò thay vì bắt người dùng nhớ ngày: chính người dùng nhớ chuyến Tết 2026 là
 * "tháng 12 hoặc 1" trong khi dữ liệu chỉ ra 16–22/2 — lệch ba tháng. Khoảng trống thì
 * máy đọc được, trí nhớ thì không.
 *
 * Ba luật im lặng, mỗi luật chặn một kiểu báo sai:
 * - Dải chạm `todayISO` → im: "chưa ghi kịp" khác "đã đi vắng"; phải có giao dịch
 *   TRỞ LẠI sau dải thì dải mới đóng.
 * - Dải chạm `windowStartISO` → im: không biết nó kéo dài từ trước cửa sổ không,
 *   báo là báo một dải cụt đầu.
 * - Dải GIAO với bất kỳ hàng trips nào (kể cả dismissed) → im: đã hỏi rồi.
 */
export function doKhoangVang(
  txDatesISO: readonly string[],
  windowStartISO: string,
  todayISO: string,
  trips: readonly TripRow[],
): KhoangVang[] {
  const coGiaoDich = new Set(txDatesISO)
  const daXet = (a: string, b: string) => trips.some((t) => a <= t.end_on && b >= t.start_on)

  const out: KhoangVang[] = []
  let runStart: string | null = null
  for (let d = windowStartISO; d <= todayISO; d = addDaysISO(d, 1)) {
    if (!coGiaoDich.has(d)) {
      runStart ??= d
      continue
    }
    // ngày CÓ giao dịch → dải (nếu đang mở) vừa đóng tại d − 1
    if (runStart !== null) {
      const runEnd = addDaysISO(d, -1)
      const soNgay = daysBetween(runStart, runEnd) + 1
      if (soNgay >= NGUONG_NGAY_VANG && runStart !== windowStartISO && !daXet(runStart, runEnd)) {
        out.push({ startISO: runStart, endISO: runEnd, soNgay })
      }
      runStart = null
    }
  }
  // dải còn mở khi chạm hôm nay → cố ý bỏ, xem ba luật im lặng ở trên
  return out
}
