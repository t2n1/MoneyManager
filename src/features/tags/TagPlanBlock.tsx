// Khối "Trần theo nhãn" — khối THỨ NĂM trong panel hạn mức của mặt lập kế hoạch.
//
// Trước đây là một Card riêng lơ lửng dưới đáy cột phải (`TagPlanCard`). B35.1 đưa nó vào
// cùng thẻ với bốn khối nhóm, và đứng CUỐI: nó là một loại trần khác — cắt ngang danh mục
// — nên đọc sau khi đã biết tiền được chia theo danh mục thế nào. Một thẻ riêng nói cùng
// một việc ở một khung riêng thì người đọc phải tự nối hai khung lại.
//
// Khác hẳn TagBudgetsCard của mặt theo dõi: ở đó câu hỏi là "đã tiêu tới đâu", vẽ bằng
// thanh tiến độ. Tháng chưa bắt đầu thì chưa tiêu đồng nào, nên thanh tiến độ của trần
// THÁNG luôn rỗng — vẽ ra chỉ là ba cái khung trắng. Câu hỏi ở đây là "tháng tới còn tiêu
// được bao nhiêu trong trần này", và chỉ trần CẢ ĐỢT mới có tiến độ đáng vẽ.
import { Link } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { Guide } from '../../components/Guide'
import { Money, STATUS_FILL, SectionTitle } from '../../components/ui'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { TagPlanLine } from './budget'
import { TAG_CHIP_CLASS, tagColor } from './colors'

interface Props {
  lines: TagPlanLine[]
  base: CurrencyCode
  hasMissingRate: boolean
}

export function TagPlanBlock({ lines, base, hasMissingRate }: Props) {
  if (lines.length === 0) return null

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-panel bg-surface-chrome px-4 py-2.5">
        <SectionTitle as="h3">Trần theo nhãn</SectionTitle>
        <span className="text-2xs text-fg-muted">
          cắt ngang danh mục · {lines.length} nhãn
        </span>
        {/* -my-3 để vùng chạm 44px không đẩy hàng header giãn ra — cùng mẹo với "Đổi mốc"
            ở AxisTargetsCard. Để trần thì đo được 41×16, không bấm nổi. */}
        <Link
          to="/settings/tags"
          className="-my-3 ml-auto inline-flex min-h-11 shrink-0 items-center text-2xs font-medium text-fg-accent"
        >
          Đổi trần
        </Link>
      </div>

      {/* Cùng lý do với khối "Đã cam kết": nhãn CẮT NGANG danh mục, nên tiền của nó đã
          nằm sẵn trong các hạn mức danh mục. Cộng vào phần đã chia là đếm hai lần. */}
      <Guide className="border-t border-border-subtle px-4 py-2 text-2xs text-fg-muted">
        Trần cắt ngang danh mục, nên số ở đây không cộng vào phần đã chia — nó là ràng
        buộc thứ hai đè lên cùng số tiền đó.
      </Guide>

      <ul>
        {lines.map((l) => {
          const laDot = l.period === 'total'
          const pct = l.budget > 0 ? Math.min(100, Math.round((l.spent / l.budget) * 100)) : 0
          return (
            <li key={l.tagId} className="border-t border-border-subtle px-4 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium ${TAG_CHIP_CLASS[tagColor(l.color)]}`}
                  >
                    {l.name}
                  </span>
                  {/* Số danh mục đang phủ (B35.1): không có nó thì `#❤️ ¥50,000` không nói
                      được nó chồng lên những hạn mức nào — mà đó chính là câu hỏi duy nhất
                      một trần cắt ngang đặt ra. */}
                  <span className="min-w-0 truncate text-2xs text-fg-muted">
                    {laDot ? 'cả đợt' : 'mỗi tháng'}
                    {l.categoryCount > 0
                      ? ` · đang phủ ${l.categoryCount} danh mục`
                      : ' · chưa gắn giao dịch nào'}
                  </span>
                </span>
                {l.exhausted ? (
                  <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-money-out">
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                    đã cạn
                  </span>
                ) : (
                  <span className="shrink-0 text-sm">
                    <Money
                      amount={Math.round(l.available)}
                      currency={base}
                      tone="neutral"
                      className="font-semibold"
                    />
                    <span className="ml-1 text-2xs text-fg-muted">còn dùng được</span>
                  </span>
                )}
              </div>

              {/* Chỉ trần CẢ ĐỢT mới có tiến độ: trần tháng reset đầu kỳ nên tháng chưa
                  tới lúc nào cũng đầy 100%, vẽ ra không nói được gì. */}
              {laDot && (
                <>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className={`h-full rounded-full ${l.exhausted ? STATUS_FILL.bad : STATUS_FILL.info}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-0.5 flex justify-between gap-2 text-2xs text-fg-muted">
                    <span>
                      đã tiêu {formatMoney(Math.round(l.spent), base)} /{' '}
                      {formatMoney(l.budget, base)}
                    </span>
                    {l.exhausted && l.spent > l.budget && (
                      <span className="text-money-out">
                        vượt {formatMoney(Math.round(l.spent - l.budget), base)}
                      </span>
                    )}
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ul>

      {hasMissingRate && (
        <p className="border-t border-border-subtle px-4 py-2 text-2xs text-fg-muted">
          Thiếu tỷ giá cho vài khoản ngoại tệ nên phần đã tiêu đang tính thiếu.
        </p>
      )}

      {/* Con số của trần CẢ ĐỢT là mức TRẦN, không phải mức chắc chắn: từ giờ tới lúc
          tháng đó bắt đầu vẫn còn ngày để tiêu, và mỗi đồng tiêu thêm ăn vào đúng nó. */}
      {lines.some((l) => l.period === 'total' && !l.exhausted) && (
        <Guide className="border-t border-border-subtle px-4 py-2 text-2xs text-fg-muted">
          Phần còn dùng được của trần cả đợt có thể hụt thêm: những ngày còn lại của
          tháng này vẫn tiêu vào cùng một túi.
        </Guide>
      )}
    </>
  )
}
