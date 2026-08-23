// Khối "Ngân sách theo nhãn" ở tab Ngân sách.
//
// Dùng chung khuôn với danh sách hạn mức danh mục ngay bên dưới (tên · % · thanh
// tiến độ · số tiền / trần) để mắt không phải học lại cách đọc — chỉ khác một chữ
// nhỏ nói kỳ của trần, vì đó mới là thứ phân biệt hai khối.
import { Link } from 'react-router-dom'
import { Guide } from '../../components/Guide'
import { Card } from '../../components/ui'
import type { CurrencyCode } from '../../lib/money'
import type { TagBudgetReport } from './budget'
import { TagBudgetLines } from './TagBudgetLines'

interface Props {
  data: TagBudgetReport
  base: CurrencyCode
}

export function TagBudgetsCard({ data, base }: Props) {
  if (data.lines.length === 0) return null

  return (
    <Card as="section">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg-muted">Ngân sách theo nhãn</h2>
        {/* -my-3 để vùng chạm 44px không đẩy hàng tiêu đề giãn ra — cùng mẹo với
            "Đổi mốc" ở AxisTargetsCard. Để trần thì đo được 41×16, không bấm nổi. */}
        <Link
          to="/settings/tags"
          className="-my-3 inline-flex min-h-11 shrink-0 items-center text-2xs font-medium text-fg-accent"
        >
          Đổi trần
        </Link>
      </div>

      <TagBudgetLines lines={data.lines} base={base} />

      {data.hasMissingRate && (
        <p className="mt-2 text-2xs text-fg-muted">
          Thiếu tỷ giá cho vài khoản ngoại tệ nên tổng đang tính thiếu.
        </p>
      )}

      {/* Nhãn chồng nhau được: một khoản mang hai nhãn thì cả hai đều tính đủ khoản
          đó. Không nói ra thì người dùng cộng các dòng lại rồi thấy nhiều hơn tổng
          chi và tưởng app sai. */}
      <Guide className="mt-2 text-2xs text-fg-muted">
        Một khoản mang nhiều nhãn được tính đủ cho từng nhãn, nên các dòng ở đây cộng
        lại có thể lớn hơn tổng chi.
      </Guide>
    </Card>
  )
}
