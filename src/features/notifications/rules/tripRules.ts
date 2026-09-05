// Dải ngày trống dài → hỏi "đi vắng?" (spec 2026-09-05-chuyen-di §5.1).
//
// Vì sao DÒ thay vì bắt người dùng nhớ ngày: chính người dùng nhớ chuyến Tết 2026 là
// "tháng 12 hoặc 1" trong khi dữ liệu chỉ ra 16–22/2 — lệch ba tháng. Khoảng trống thì
// máy đọc được, trí nhớ thì không.
//
// Luật này chỉ nhìn recentTxs (RECENT_TXS_DAYS ngày) — dải cũ hơn do TripGapCard ở tab
// Dài hạn lo, nơi cả năm giao dịch đã nằm sẵn trong tay, không tốn truy vấn mới nào.
// Cửa sổ dò lùi thêm 1 ngày so với cửa sổ dữ liệu: doKhoangVang cố ý im với dải chạm
// mép đầu (không biết nó dài từ trước không), nên mép phải nằm NGOÀI vùng dữ liệu thật.
import { addDaysISO } from '../../../lib/dates'
import { doKhoangVang, nhanNgayVang } from '../../reports/ngayDiVang'
import { RECENT_TXS_DAYS, type AppNotification, type NotificationInput } from '../types'

export function tripRules(input: NotificationInput): AppNotification[] {
  const { trips, recentTxs, todayISO } = input
  // undefined = query chưa về — im, không đoán. Cùng mẫu với tagBudgets.
  if (!trips) return []
  const windowStart = addDaysISO(todayISO, -RECENT_TXS_DAYS)
  const gaps = doKhoangVang(
    recentTxs.map((t) => t.occurred_on),
    windowStart,
    todayISO,
    trips,
  )
  return gaps.map((g) => ({
    key: `trip-gap:${g.startISO}`,
    kind: 'action' as const,
    type: 'trip-gap' as const,
    severity: 'low' as const,
    title: `${g.soNgay} ngày không có giao dịch nào (${nhanNgayVang(g.startISO)} → ${nhanNgayVang(g.endISO)}) — đi vắng?`,
    detail: 'Đánh dấu là chuyến đi thì các phép so sánh bỏ những ngày này ra.',
    onISO: g.startISO,
    to: '/reports?view=long',
  }))
}
