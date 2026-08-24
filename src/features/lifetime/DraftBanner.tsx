// Thanh "đang thử trên bản nháp" — đứng ĐẦU trang Tương lai khi có thay đổi chưa lưu.
//
// VÌ SAO ĐẦU TRANG chứ không nằm trong panel Giả định (chỗ nút Lưu cũ đứng): bản nháp
// nay gom cả mốc kéo trên đồ thị và mẫu thêm từ thư viện, tức người dùng có thể tạo ra
// thay đổi chưa lưu mà KHÔNG hề chạm vào panel Giả định — và lúc đó một nút Lưu nằm
// khuất trong panel ấy (dưới cùng ở màn hẹp) là một thay đổi không có chỗ nào nói ra.
//
// Ba nút chứ không một: "Lưu vào kịch bản" ghi đè bản gốc, nhưng phần lớn lượt vặn thử
// là để SO — "nếu về VN thì sao" không nên phải hy sinh kịch bản "ở lại Nhật". "Lưu
// thành kịch bản mới" giữ cả hai, và "Bỏ" là đường ra không mất gì.
import { AlertTriangle } from 'lucide-react'
import { ActionButton } from '../../components/ui'
import type { CurrencyCode } from '../../lib/currencies'
import { formatCompact } from '../../lib/money'
import type { DraftChange } from './draft'

interface Props {
  /** Tên kịch bản GỐC — câu banner nói rõ bản gốc chưa bị đụng. */
  scenarioName: string
  changes: DraftChange[]
  /** Tài sản cuối đời trước và sau khi vặn; `null` khi một bên chưa chiếu được. */
  endBeforeMinor: number | null
  endAfterMinor: number | null
  currency: CurrencyCode
  onCommit: () => void
  onSaveAsNew: () => void
  onDiscard: () => void
  saving: boolean
}

/** Một thay đổi → một mẩu chữ. Số tiền đi qua `formatCompact` để câu không dài quá. */
function describe(c: DraftChange, currency: CurrencyCode): string {
  switch (c.kind) {
    case 'income':
      return `thu ${formatCompact(c.fromMinor, c.currency)} → ${formatCompact(c.toMinor, c.currency)}`
    case 'expense':
      return `chi ${formatCompact(c.fromMinor, c.currency)} → ${formatCompact(c.toMinor, c.currency)}`
    case 'return':
      return `lợi suất ${c.fromBps / 100}% → ${c.toBps / 100}%`
    case 'endAge':
      return `chiếu đến tuổi ${c.from} → ${c.to}`
    case 'phaseYear':
      return `"${c.label}" dời ${c.from} → ${c.to}`
    case 'phasesAdded':
      return `thêm ${c.count} chặng`
    case 'eventsAdded':
      return `thêm ${c.count} mốc`
    case 'eventsRemoved':
      return `bớt ${c.count} mốc`
    case 'eventsEdited':
      return `sửa ${c.count} mốc`
    default:
      // `currency` chỉ dùng ở nhánh cuối đời bên dưới; giữ tham số để chữ ký ổn định
      // nếu sau này có loại thay đổi tính theo tiền HIỂN THỊ chứ không theo tiền chặng.
      return String(currency)
  }
}

export function DraftBanner({
  scenarioName,
  changes,
  endBeforeMinor,
  endAfterMinor,
  currency,
  onCommit,
  onSaveAsNew,
  onDiscard,
  saving,
}: Props) {
  const parts = changes.map((c) => describe(c, currency))
  // Hiệu cuối đời là kết luận của cả cú vặn — nó trả lời "vặn thế này thì được gì",
  // câu duy nhất người dùng thật sự muốn biết trước khi bấm Lưu. Đứng CUỐI danh sách
  // vì nó là hệ quả, không phải một thay đổi họ vừa làm.
  if (endBeforeMinor !== null && endAfterMinor !== null && endBeforeMinor !== endAfterMinor) {
    const d = endAfterMinor - endBeforeMinor
    parts.push(
      `cuối đời ${formatCompact(endBeforeMinor, currency)} → ${formatCompact(endAfterMinor, currency)} (${d >= 0 ? '+' : '−'}${formatCompact(Math.abs(d), currency)})`,
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-state-warn-border bg-state-warn-bg px-3 py-2">
      <AlertTriangle className="h-4 w-4 shrink-0 text-state-warn-fg" aria-hidden="true" />
      <p className="min-w-[12rem] flex-1 text-[0.8125rem] text-state-warn-fg">
        <b>Đang thử trên bản nháp</b> — kịch bản "{scenarioName}" gốc chưa bị đụng.
        {parts.length > 0 && ` Đang đổi: ${parts.join(' · ')}.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <ActionButton variant="primary" onClick={onCommit} disabled={saving}>
          {saving ? 'Đang lưu…' : 'Lưu vào kịch bản'}
        </ActionButton>
        <ActionButton onClick={onSaveAsNew} disabled={saving} className="bg-surface">
          Lưu thành kịch bản mới
        </ActionButton>
        <ActionButton onClick={onDiscard} disabled={saving}>
          Bỏ
        </ActionButton>
      </div>
    </div>
  )
}
