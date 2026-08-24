// Form sửa mốc TẠI CHỖ — nổi lên ngay dưới đồ thị, cạnh chip vừa bấm.
//
// Trước bản này, sửa số tiền của một mốc phải mở trình sửa kịch bản (một sheet toàn màn
// che mất đồ thị), tìm mốc trong danh sách, sửa, lưu, đóng sheet — rồi mới thấy đường
// đổi. Ở đây đồ thị vẫn nằm nguyên trên màn và đổi theo từng ký tự gõ, vì mọi thứ sửa
// vào BẢN NHÁP chứ không vào DB.
//
// Chỉ bốn ô (tên, hai năm, số tiền). Tỷ giá, ghi chú, cờ lạm phát vẫn thuộc trình sửa
// đầy đủ: chúng không phải thứ người ta vặn khi đang nhìn đường đồ thị chạy.
import { X } from 'lucide-react'
import { ActionButton, IconButton, actionButtonClass } from '../../components/ui'
import type { CurrencyCode } from '../../lib/currencies'
import { CURRENCIES } from '../../lib/currencies'
import type { DraftEvent } from './draft'

interface Props {
  event: DraftEvent
  /** Toạ độ x (pixel, trong vùng vẽ) của chip — form nép cạnh nó. */
  anchorX: number
  /** Bề ngang vùng vẽ, để form không tràn ra ngoài thẻ. */
  plotWidth: number
  /** Mép trên của form, tính từ đỉnh vùng vẽ. */
  top: number
  minYear: number
  maxYear: number
  onPatch: (patch: Partial<Omit<DraftEvent, 'id'>>) => void
  onDelete: () => void
  onClose: () => void
}

const WIDTH = 268

const FIELD =
  'mt-0.5 block w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg-primary'

/** Số tiền nhập theo đơn vị LỚN (¥, ₫) rồi quy về minor — người dùng không gõ "cent". */
function toMinor(major: string, currency: CurrencyCode): number {
  const n = Number(major.replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 10 ** CURRENCIES[currency].decimals)
}
function toMajor(minor: number, currency: CurrencyCode): string {
  return String(minor / 10 ** CURRENCIES[currency].decimals)
}

export function EventEditorPopover({
  event,
  anchorX,
  plotWidth,
  top,
  minYear,
  maxYear,
  onPatch,
  onDelete,
  onClose,
}: Props) {
  // Nép cạnh chip nhưng không tràn: kẹp cả hai mép. Ở màn hẹp hơn chính form thì nó
  // dán về 0 và chiếm trọn bề ngang — vẫn đọc được, chỉ không còn "cạnh chip".
  const left = Math.max(0, Math.min(anchorX - WIDTH / 2, Math.max(0, plotWidth - WIDTH)))

  return (
    <div
      className="absolute z-30 rounded-lg border border-border-strong bg-surface p-3 shadow-lg"
      style={{ left, top, width: WIDTH }}
      // Bấm trong form không được coi là bấm lên đồ thị (sẽ ghim/bỏ ghim một năm).
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs uppercase tracking-label text-fg-muted">Sửa mốc</p>
        <IconButton
          variant="ghost"
          onClick={onClose}
          aria-label="Đóng form sửa mốc"
          className="px-2"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </IconButton>
      </div>

      <label className="mt-1.5 block text-2xs text-fg-muted">
        Tên
        <input
          value={event.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          className={FIELD}
        />
      </label>

      <div className="mt-1.5 flex gap-2">
        <label className="flex-1 text-2xs text-fg-muted">
          Từ năm
          <input
            type="number"
            value={event.startYear}
            min={minYear}
            max={maxYear}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (!Number.isFinite(v) || v < minYear || v > maxYear) return
              // Kéo năm bắt đầu thì năm kết thúc đi theo, giữ nguyên ĐỘ DÀI: "nuôi con
              // 22 năm" dời sang 2033 vẫn phải là 22 năm, không phải co lại còn 19.
              const span = event.endYear !== null ? event.endYear - event.startYear : null
              onPatch({ startYear: v, ...(span !== null && { endYear: v + span }) })
            }}
            className={`${FIELD} tabular-nums`}
          />
        </label>
        <label className="flex-1 text-2xs text-fg-muted">
          Đến năm
          <input
            type="number"
            // `endYear` null = kéo tới hết đời. Hiện tuổi cuối thay vì để ô trống —
            // một ô trống đọc như "chưa khai", trong khi đây là một lựa chọn có nghĩa.
            value={event.endYear ?? maxYear}
            min={event.startYear}
            max={maxYear}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (!Number.isFinite(v) || v < event.startYear || v > maxYear) return
              onPatch({ endYear: v })
            }}
            className={`${FIELD} tabular-nums`}
          />
        </label>
      </div>

      <label className="mt-1.5 block text-2xs text-fg-muted">
        Số tiền mỗi năm ({event.currency})
        <input
          inputMode="decimal"
          defaultValue={toMajor(event.amountMinor, event.currency)}
          onChange={(e) => onPatch({ amountMinor: toMinor(e.target.value, event.currency) })}
          className={`${FIELD} tabular-nums`}
        />
      </label>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onDelete}
          className={actionButtonClass('danger')}
        >
          Xoá mốc
        </button>
        <ActionButton variant="primary" onClick={onClose}>
          Xong
        </ActionButton>
      </div>
    </div>
  )
}
