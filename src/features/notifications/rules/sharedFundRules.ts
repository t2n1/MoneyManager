// Lời nhắc quỹ chung (migration 0073). Luật CỐ Ý ngu, cùng khuôn benefitRules: quyết định
// phần nào thiếu/dư nằm ở `fundAlertsFor` (sharedFund.ts), ở đây chỉ chép sang hình dạng
// AppNotification — nhờ vậy màn Quỹ chung, chuông và push nói cùng một câu.
//
// THUẦN: chỉ import type + i18n. purity.test.ts canh.
import { categoryLabel, tr } from '../../../i18n'
import type { AppNotification, NotificationInput } from '../types'

const TO = '/quy-chung'

export function sharedFundRules(input: NotificationInput): AppNotification[] {
  const f = input.sharedFund
  if (!f) return []
  const name = (id: string) => {
    const c = input.categories.find((x) => x.id === id)
    return c ? categoryLabel(c.name) : tr('Danh mục đã xoá')
  }
  return f.alerts.map((a): AppNotification => {
    const amount = input.formatMoney(Math.abs(a.balance), f.currency)
    if (a.kind === 'surplus-streak')
      return {
        // Tin để biết, kèm kỳ = số dư: dư tiếp tăng thì là tin mới, còn đọc rồi thì thôi.
        key: `fund-part-surplus:${a.partId}:${a.balance}`,
        kind: 'info',
        type: 'fund-part-surplus',
        severity: 'low',
        title: tr('{name} dư {amount}', { name: name(a.partId), amount }),
        detail: tr('3 tháng liền góp dư. Có thể giảm mức góp hoặc chuyển phần dư sang tiết kiệm chung.'),
        to: TO,
      }
    return {
      // Việc cần làm: mã theo phần + loại, không kèm kỳ — hết thiếu thì mã biến mất và
      // trạng thái được dọn; thiếu lại thì đỏ như mới.
      key: `fund-part-short:${a.partId}:${a.kind}`,
      kind: 'action',
      type: 'fund-part-short',
      severity: a.kind === 'negative' ? 'medium' : 'low',
      title:
        a.kind === 'negative'
          ? tr('{name} thiếu {amount}', { name: name(a.partId), amount })
          : tr('{name}: nên tăng mức góp', { name: name(a.partId) }),
      detail:
        a.kind === 'negative'
          ? tr('Quỹ đang lấy tiền phần khác bù. Góp thêm cho phần này.')
          : tr('3 tháng liền chi nhiều hơn góp. Nên tăng mức góp hằng tháng.'),
      to: TO,
    }
  })
}
