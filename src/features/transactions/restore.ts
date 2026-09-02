// Dựng lại một giao dịch vừa bị xóa, cho nút "Hoàn tác".
//
// Tách riêng vì hai chỗ xóa đều cần: xóa lẻ trong sheet Sửa giao dịch, và xóa
// hàng loạt ở Sổ. Và vì bỏ sót một cờ ở đây thì hoàn tác ra một giao dịch KHÁC
// cái vừa xóa — bản cũ chép tay trong sheet đã đánh rơi `is_refund` và
// `exclude_from_stats`, nên hoàn tác một khoản hoàn tiền là nó quay lại thành
// khoản chi thường, cộng thêm tiền vào Chi của tháng đó.
//
// `recurring_rule_id` KHÔNG dựng lại được (NewTransaction không có cột đó): giao
// dịch do quy tắc định kỳ sinh ra mà hoàn tác thì mất liên kết với quy tắc, chỉ
// còn là một giao dịch thường.
import type { NewTransaction } from '../../data'
import type { TransactionRow } from '../../types/database.types'

export function toNewTransaction(t: TransactionRow, tagIds: string[] = []): NewTransaction {
  return {
    type: t.type,
    amount: t.amount,
    to_amount: t.to_amount,
    category_id: t.category_id,
    account_id: t.account_id,
    to_account_id: t.to_account_id,
    occurred_on: t.occurred_on,
    note: t.note,
    is_remittance: t.is_remittance,
    remit_service: t.remit_service,
    remit_fee_jpy: t.remit_fee_jpy,
    remit_received_vnd: t.remit_received_vnd,
    remit_recipient_id: t.remit_recipient_id ?? null,
    is_debt_flow: t.is_debt_flow,
    exclude_from_stats: t.exclude_from_stats,
    is_refund: t.is_refund,
    // Chỉ gắn khi có: `tag_ids` rỗng vẫn là "ghi đè bằng danh sách rỗng", không
    // sai ở đây nhưng để trống thì payload gọn và ý cũng rõ hơn.
    ...(tagIds.length > 0 ? { tag_ids: tagIds } : {}),
  }
}
