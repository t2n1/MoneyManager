// Panel Ngân sách của Bản tin (§4.1, cột phải 380px). Bản RÚT GỌN có chủ đích: nó trả
// lời đúng một câu — "tháng này còn bao nhiêu, có mục nào đang vượt không" — rồi dẫn
// sang trang Ngân sách. Mọi thứ khác (xếp theo nhịp/tiền/cài đặt, trần nhóm, dải trục)
// ở lại trang đó.
//
// Đọc `useBudgetReport` chứ không tự cộng: cùng một con số "đã tiêu" mà hai chỗ tự tính
// thì sớm muộn lệch — trần nhóm cha, hạn mức dồn và giao dịch thiếu tỷ giá đều là những
// chỗ dễ tính khác đi.
import { Link } from 'react-router-dom'
import { Card, Money, SectionTitle, StatusDot } from '../../components/ui'
import type { BudgetReport } from '../budgets/progress'
import type { CurrencyCode } from '../../lib/money'

interface Props {
  report: BudgetReport | undefined
  isLoading: boolean
  base: CurrencyCode
  /** Tên danh mục — panel không tự tra bảng danh mục. */
  nameOf: (categoryId: string) => string
}

/** Số dòng "đang căng" hiện tối đa. Panel là chỗ LIẾC, không phải chỗ đọc danh sách. */
const MAX_LINES = 3

export function BudgetPanel({ report, isLoading, base, nameOf }: Props) {
  const remaining = report ? report.totalBudgeted - report.totalSpent : 0
  // Chỉ những dòng đáng nhìn: đã vượt, hoặc sắp vượt. Dòng đúng nhịp không có tin gì.
  const attention = (report?.lines ?? [])
    .filter((l) => !l.isMarker && (l.status === 'over' || l.status === 'warn'))
    .slice(0, MAX_LINES)

  return (
    <Card
      elevation="panel"
      padding="panel"
      as="section"
      // `basis-full xl:basis-0`: xem chú thích ở CashflowPanel — cặp panel phải DỌC ở
      // dưới xl, mà `flex-1` một mình thì chỉ co lại chứ không xuống dòng.
      className="min-w-0 flex-1 basis-full xl:max-w-[23.75rem] xl:basis-0"
    >
      <div className="flex items-baseline justify-between gap-2">
        <SectionTitle>Ngân sách</SectionTitle>
        <Link to="/budget" className="-my-2 py-2 text-2xs font-medium text-fg-accent hover:underline">
          Xem cả tháng →
        </Link>
      </div>

      {isLoading ? (
        <p className="mt-3 text-sm text-fg-muted">Đang tải…</p>
      ) : !report || report.totalBudgeted === 0 ? (
        // Trạng thái rỗng: một câu + MỘT hành động (§5.0), không vẽ minh hoạ.
        <p className="mt-3 text-sm text-fg-muted">
          Chưa đặt hạn mức nào tháng này.{' '}
          <Link to="/budget" className="font-medium text-fg-accent hover:underline">
            Đặt hạn mức
          </Link>
        </p>
      ) : (
        <>
          {/* Không thêm `tabular-nums` ở đây: <Money> đã tự bật, và viết lại là nhân
              bản đúng quyết định mà primitive đó sinh ra để giữ một chỗ. */}
          <p className="mt-2.5 font-mono text-kpi font-medium tracking-number">
            <Money
              amount={remaining}
              currency={base}
              tone={remaining < 0 ? 'out' : 'neutral'}
              approx={report.hasMissingRate}
            />
          </p>
          <p className="mt-1.5 text-2xs text-fg-muted">
            {remaining < 0 ? 'đã vượt tổng hạn mức' : 'còn lại trên tổng hạn mức'} ·{' '}
            <span className="font-mono">
              <Money amount={report.totalSpent} currency={base} tone="neutral" compact /> /{' '}
              <Money amount={report.totalBudgeted} currency={base} tone="neutral" compact />
            </span>
          </p>

          {attention.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1.5 border-t border-border-subtle pt-3">
              {attention.map((l) => (
                <li key={l.categoryId} className="flex items-center gap-2 text-sm">
                  <StatusDot
                    tone={l.status === 'over' ? 'bad' : 'warn'}
                    label={l.status === 'over' ? 'Đã vượt hạn mức' : 'Sắp vượt hạn mức'}
                  />
                  <span className="min-w-0 flex-1 truncate text-fg-secondary">
                    {nameOf(l.categoryId)}
                  </span>
                  <span className="shrink-0 font-mono text-sm text-fg-muted">
                    {Math.round(l.ratio * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 border-t border-border-subtle pt-3 text-sm text-fg-muted">
              Chưa mục nào chạm ngưỡng 80%.
            </p>
          )}
        </>
      )}
    </Card>
  )
}
