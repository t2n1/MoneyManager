// Lần đầu mở app, chưa có tài khoản nào (§4.8 / bản vẽ 20b).
//
// Thay bức tường thẻ trống bằng MỘT việc duy nhất. Bản tin có sáu khối; chưa có tài
// khoản thì cả sáu đều rỗng, và sáu cái thẻ ghi "chưa có gì" xếp dọc không nói được
// việc cần làm là gì — nó chỉ nói app đang trống, thứ người dùng đã biết.
//
// Ba thứ khối này nói, theo đúng thứ tự người ta cần:
//   1. việc phải làm (một, không phải sáu);
//   2. làm xong thì ĐƯỢC GÌ — không có câu này thì "thêm tài khoản" chỉ là thủ tục;
//   3. màn nào còn cần gì nữa mới dùng được, ghi RÕ RA thay vì để họ bấm vào rồi gặp
//      một màn trống thứ hai.
import { Link } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import { actionButtonClass, Card } from '../../components/ui'

interface Props {
  /** Đã khai năm sinh chưa — tab Tương lai cần nó để đổi năm ↔ tuổi. */
  hasBirthYear: boolean
}

export function FirstRunPanel({ hasBirthYear }: Props) {
  return (
    <Card elevation="panel" padding="panel" as="section">
      <h2 className="text-[0.8125rem] font-semibold text-fg-primary">Bắt đầu ở đây</h2>

      <p className="mt-1.5 text-[0.8125rem] text-fg-secondary">
        Thêm tài khoản đầu tiên — một cái ví tiền mặt cũng được. Có nó rồi thì mỗi khoản
        ghi vào sẽ tự trừ đúng chỗ, và Bản tin bắt đầu nói được tháng này bạn giữ lại bao
        nhiêu.
      </p>

      <Link
        to="/settings/accounts"
        // actionButtonClass() chứ không viết tay: <Link> là thẻ <a> nên không dùng
        // được <ActionButton>, và đây đúng là lý do hàm đó tồn tại.
        className={actionButtonClass('primary', 'mt-3')}
      >
        <Wallet className="h-4 w-4" strokeWidth={2.2} />
        Thêm tài khoản đầu tiên
      </Link>

      {/* Nói TRƯỚC màn nào còn thiếu gì. Bản vẽ 20b muốn tab chưa dùng được thì mờ và
          không bấm; ở đây làm nhẹ hơn một bậc — liệt kê điều kiện — vì khoá tab lại thì
          người dùng không xem trước được app có gì, mà lần đầu mở thì tò mò là chính
          đáng. Điều kiện ghi ra vẫn đủ để họ không bấm vào rồi gặp màn trống. */}
      <ul className="mt-3 flex flex-col gap-1 border-t border-border-subtle pt-2.5 text-2xs text-fg-muted">
        <li>Ngân sách · Báo cáo — cần ít nhất một tháng đã ghi chép</li>
        <li>Tài sản, chế độ Diễn biến — cần ít nhất 2 mốc tài sản ròng</li>
        <li>
          Tài sản · Tương lai — cần năm sinh{hasBirthYear ? ' (đã có)' : ' (chưa khai)'} và
          một kịch bản
        </li>
      </ul>
    </Card>
  )
}
