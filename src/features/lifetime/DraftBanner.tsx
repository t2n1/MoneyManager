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
import type { DraftChange } from './draft'
import { changeParts } from './draftText'

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
  /**
   * true = thanh này DÁN vào đầu thẻ ngay dưới nó (bo góc trên, không bo góc dưới, bỏ
   * viền dưới). Bản vẽ v5 gắn nó lên thẻ đồ thị: nó nói về chính bản chiếu ngay dưới,
   * còn để rời thì ở màn hẹp nó trôi khỏi tầm mắt đúng lúc người dùng đang vặn.
   */
  attached?: boolean
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
  attached = false,
}: Props) {
  // Cùng hàm với dòng tóm tắt ở chân trình sửa kịch bản — xem `draftText.ts`.
  const parts = changeParts(changes, currency, endBeforeMinor, endAfterMinor)

  return (
    <div
      className={`flex flex-wrap items-center gap-2.5 border border-state-warn-border bg-state-warn-bg px-3 py-2 ${
        attached ? 'rounded-t-xl border-b-0' : 'rounded-lg'
      }`}
    >
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
