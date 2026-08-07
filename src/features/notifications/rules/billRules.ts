// Luật "khoản cần thanh toán" (quy tắc định kỳ kiểu NHẮC, migration 0037) — THUẦN.
//
// Khác hẳn `recurring-suggestion` ở rhythmRules: tin kia nói "hình như bạn có khoản
// lặp lại, tạo quy tắc đi". Tin này nói "khoản bạn đã khai là phải tự tay làm, tới
// hạn rồi" — và nó BÁM cho tới khi người dùng xác nhận đã ghi, vì không ai khác ghi
// hộ được.
import { billStatuses } from '../../../lib/recurring'
import type { AppNotification, NotificationInput } from '../types'

export function billRules(input: NotificationInput): AppNotification[] {
  const ruleById = new Map(input.recurringRules.map((r) => [r.id, r]))
  const out: AppNotification[] = []

  for (const b of billStatuses(input.recurringRules, input.todayISO)) {
    const rule = ruleById.get(b.ruleId)
    if (!rule) continue

    const money = input.formatMoney(rule.amount, input.currencyOf(rule.account_id))
    // Tên khoản: ghi chú của người dùng là thứ họ tự đặt nên ưu tiên. Không có thì
    // rơi về một chữ chung — chứ không để tiêu đề cụt lủn "chưa ghi ¥30.000".
    const ten = rule.note.trim() || 'Khoản định kỳ'

    out.push({
      // dueISO trong mã: xác nhận xong kỳ này thì kỳ sau là một tin MỚI, không bị
      // "đã đọc" của kỳ trước làm im.
      key: `bill-due:${b.ruleId}:${b.dueISO}`,
      kind: 'action',
      type: 'bill-due',
      // Quá hạn là mức đỏ: nó nổi lên cả dải nhắc ở đầu Sổ, vì quên gửi tiền về nhà
      // không phải thứ chờ tới lúc mở chuông mới biết.
      severity: b.daysLeft < 0 ? 'high' : b.daysLeft === 0 ? 'medium' : 'low',
      title:
        b.daysLeft < 0
          ? `Chưa ghi "${ten}" ${money}`
          : b.daysLeft === 0
            ? `Hôm nay tới hạn "${ten}" ${money}`
            : `${b.daysLeft} ngày nữa tới hạn "${ten}" ${money}`,
      detail: detailOf(b.daysLeft, b.overdueCount),
      onISO: b.dueISO,
      // Mở thẳng form đã điền sẵn theo quy tắc + đúng kỳ đang nợ. Dẫn về danh sách
      // quy tắc thì người dùng còn phải tự tìm lại đúng dòng vừa được nhắc.
      to: `/entry?rule=${b.ruleId}&on=${b.dueISO}`,
    })
  }

  return out
}

/** Câu phụ: nói rõ đang nợ mấy kỳ, vì "quá hạn 92 ngày" và "lỡ 4 lần" khác nhau. */
function detailOf(daysLeft: number, overdueCount: number): string {
  if (daysLeft > 0) return 'Ghi trước cũng được — bấm để mở form đã điền sẵn.'
  if (overdueCount > 1) return `Đang nợ ${overdueCount} kỳ chưa ghi. Bấm để ghi kỳ cũ nhất.`
  if (daysLeft === 0) return 'Bấm để mở form đã điền sẵn, sửa số tiền rồi lưu.'
  return `Quá hạn ${-daysLeft} ngày. Bấm để mở form đã điền sẵn.`
}
