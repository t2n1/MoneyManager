// Lọc tại chỗ + dòng cảnh báo "chưa phân loại" — hai bổ sung của 10a (§4.2 mục 2 và 3)
// đứng cạnh nhau vì chúng là MỘT thao tác: dòng cảnh báo bấm vào là bật đúng cái chip
// bên trên nó, rồi người dùng sửa ngay tại danh sách.
//
// Vì sao chip chứ không phải sheet lọc riêng (bản cũ đẩy sang trang Tìm kiếm): lọc ở đây
// là "thu hẹp cái đang nhìn", không phải "đi tìm một khoản". Mở một sheet để làm việc đó
// là bắt rời màn rồi quay lại — và lúc quay lại thì mất chỗ đang cuộn.
import { Money } from '../../components/ui'
import type { CurrencyCode } from '../../lib/money'
import type { TransactionRow } from '../../types/database.types'
import type { LedgerFilter, UncategorizedSummary } from './ledgerView'
import { isFilterActive } from './ledgerView'

const TYPES: { value: TransactionRow['type']; label: string }[] = [
  { value: 'expense', label: 'Chi' },
  { value: 'income', label: 'Thu' },
  { value: 'transfer', label: 'Chuyển khoản' },
]

/** Chip pill 20px (§1.3). Bật = bề mặt trạng thái accent, tắt = viền control. */
function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-medium transition ${
        on
          ? 'border-state-good-border bg-state-good-bg text-state-good-fg'
          : 'border-border-strong text-fg-muted hover:text-fg-primary'
      }`}
    >
      {children}
    </button>
  )
}

interface Props {
  value: LedgerFilter
  onChange: (next: LedgerFilter) => void
  uncategorized: UncategorizedSummary
  base: CurrencyCode
  /** Số khoản còn lại sau khi lọc — để nói ra khi bộ lọc đang giấu bớt. */
  shownCount: number
  totalCount: number
}

export function LedgerFilterBar({
  value,
  onChange,
  uncategorized,
  base,
  shownCount,
  totalCount,
}: Props) {
  const active = isFilterActive(value)
  return (
    <div className="flex flex-col gap-2">
      {/* Hàng chip cuộn ngang: ở 320px bốn chip + nhãn không xếp nổi một hàng, mà xuống
          dòng thì thanh lọc cao gấp đôi và đẩy danh sách xuống dưới nếp gấp. */}
      <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1">
        {TYPES.map((t) => (
          <Chip
            key={t.value}
            on={value.type === t.value}
            onClick={() => onChange({ ...value, type: value.type === t.value ? null : t.value })}
          >
            {t.label}
          </Chip>
        ))}
        {/* Chỉ hiện chip "Chưa phân loại" khi CÓ khoản chưa phân loại: một bộ lọc chắc
            chắn trả về danh sách rỗng là một cái nút bẫy người bấm. */}
        {uncategorized.count > 0 && (
          <Chip
            on={value.uncategorized}
            onClick={() => onChange({ ...value, uncategorized: !value.uncategorized })}
          >
            Chưa phân loại
          </Chip>
        )}
        {active && (
          <button
            type="button"
            onClick={() => onChange({ type: null, uncategorized: false })}
            className="ml-auto min-h-11 shrink-0 px-2 text-xs font-medium text-fg-accent"
          >
            Bỏ lọc
          </button>
        )}
      </div>

      {active && (
        <p className="px-1 font-mono text-2xs text-fg-muted" aria-live="polite">
          {shownCount}/{totalCount} khoản
        </p>
      )}

      {/* MỘT dòng gộp cho mọi khoản chưa phân loại (§4.2 mục 3) — không phải một cảnh
          báo trên mỗi dòng. Bấm vào là lọc ngay tại chỗ, tức "dẫn thẳng sang thao tác
          gắn nhóm" mà không rời màn. Đang lọc rồi thì ẩn: lúc đó danh sách bên dưới
          CHÍNH LÀ nội dung của dòng này. */}
      {uncategorized.count > 0 && !value.uncategorized && (
        <button
          type="button"
          onClick={() => onChange({ ...value, uncategorized: true })}
          className="flex min-h-11 items-center gap-2 rounded-md border border-state-warn-border bg-state-warn-bg px-3 py-2 text-left text-[0.8125rem] text-state-warn-fg transition"
        >
          <span className="min-w-0 flex-1">
            {uncategorized.count} khoản chưa gắn danh mục —{' '}
            <Money
              amount={uncategorized.amount}
              currency={base}
              tone="neutral"
              approx={uncategorized.hasMissingRate}
              className="text-state-warn-fg"
            />{' '}
            không vào được báo cáo hay ngân sách
          </span>
          <span className="shrink-0 text-xs font-semibold">Xem →</span>
        </button>
      )}
    </div>
  )
}
