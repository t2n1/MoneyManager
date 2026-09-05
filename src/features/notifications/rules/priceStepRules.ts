// Khoản lặp đều vừa đổi giá (spec 2026-09-05-gia-doi-bac §5.2).
//
// kind 'info' CHÍNH LÀ cơ chế "báo một lần": key gắn vào ngày đổi bậc, tin đọc là mất,
// cùng bậc không bao giờ sinh key thứ hai — không cần bảng nhớ nào.
//
// Cửa sổ recentTxs (90 ngày) phải chứa đủ 2+2 lần quanh bậc → chỉ bậc MỚI (~2 tháng
// gần nhất) mới nổ tin; bậc cũ nằm ở thẻ tab Dài hạn, không làm phiền Bản tin.
import { doBacGia } from '../../reports/giaDoiBac'
import type { AppNotification, NotificationInput } from '../types'

export function priceStepRules(input: NotificationInput): AppNotification[] {
  const { recentTxs, recurringRules, categories, currencyOf, base, rates, formatMoney } = input
  const bacs = doBacGia(recentTxs, recurringRules, categories, currencyOf, base, rates)
  return bacs.map((b) => ({
    key: `price-step:${b.nhan}:${b.tuNgayISO}`,
    kind: 'info' as const,
    type: 'price-step' as const,
    severity: 'low' as const,
    title: `${b.nhan} đổi giá: ${formatMoney(b.giaCu, b.currency)} → ${formatMoney(b.giaMoi, b.currency)}`,
    detail: `${b.chenhMoiNam > 0 ? 'Nặng thêm' : 'Nhẹ đi'} ${formatMoney(Math.abs(b.chenhMoiNam), b.currency)}/năm nếu giữ giá này.`,
    onISO: b.tuNgayISO,
    to: '/reports?view=long',
  }))
}
