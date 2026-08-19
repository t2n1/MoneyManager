import { ArrowDown, ArrowUp, ArrowLeftRight, type LucideIcon } from 'lucide-react'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import {
  DIRECTION_LABEL, chipAriaLabel, defaultKindOf, directionOf, kindsOf, shapeOf,
  type Direction, type EntryKind,
} from './entryShape'

const DIR_ICON: Record<Direction, LucideIcon> = {
  out: ArrowDown,
  in: ArrowUp,
  move: ArrowLeftRight,
}

const DIRS: Direction[] = ['out', 'in', 'move']

/**
 * MỘT control chọn loại, hai cấp: segmented cho hướng, chip cho dạng.
 *
 * Không dùng lưới thẻ (trùng hình dạng với lưới danh mục cách đó ~150px nên đọc sai
 * cấp), không cuộn ngang (dạng cuối ra ngoài màn — đúng bệnh của "Đặc biệt"), không
 * ba mục + nút "khác" (dựng lại hai tầng).
 */
export function DirectionTabs({
  kind,
  onChange,
}: {
  kind: EntryKind
  onChange: (kind: EntryKind) => void
}) {
  const direction = directionOf(kind)
  const kinds = kindsOf(direction)

  return (
    <div className="flex flex-col gap-1.5">
      <SegmentedControl
        // size lg: ô 46px, trên sàn vùng chạm 44px. Đây là control chính của màn, không nằm trong danh
        // sách miễn trừ vùng chạm.
        size="lg"
        label="Hướng tiền"
        value={direction}
        onChange={(d) => onChange(defaultKindOf(d))}
        items={DIRS.map((d) => {
          const Icon = DIR_ICON[d]
          return {
            value: d,
            label: (
              <span className="flex items-center justify-center gap-1 whitespace-nowrap">
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {DIRECTION_LABEL[d]}
              </span>
            ),
          }
        })}
      />
      {/* Hàng Dạng ẩn hẳn khi hướng chỉ có một dạng — quy tắc cho phép, và một bộ
          chọn một-lựa-chọn là một bộ chọn giả. Hiện cả ba hướng đều ≥2 dạng nên
          nhánh này chưa chạy, nhưng để đây thì thêm/bớt dạng không sinh màn lạ. */}
      {kinds.length > 1 && (
        <div
          role="radiogroup"
          aria-label="Dạng giao dịch"
          // flex-wrap: tiền ra có 5 chip = 376px ở font 12px, chỗ có 336px → xuống
          // 2 dòng. KHÔNG rút nhãn để ép một dòng.
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="shrink-0 px-1 text-xs text-fg-muted">Dạng</span>
          {kinds.map((k) => {
            const s = shapeOf(k)
            const on = k === kind
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                // Chữ phụ vào tên đọc được, không chỉ vào mắt: hai dạng gửi về VN là
                // CÙNG một hành động vật lý với tác động tài sản TRÁI NHAU, nên hệ quả
                // phải đọc được trước khi chọn, không phải sau. (Hàm thuần để test được.)
                aria-label={chipAriaLabel(k)}
                onClick={() => onChange(k)}
                // 32px là miễn trừ vùng chạm có chủ ý (lựa chọn cấp hai, luôn có ít
                // nhất một chip đang bật) — giống chip danh mục con.
                // whitespace-nowrap: thiếu nó thì chip bị co và nhãn vỡ GIỮA TỪ bên
                // trong viên pill ("Chi / thường") ngay khi bật Cỡ chữ lớn.
                className={`flex min-h-8 items-center whitespace-nowrap rounded-full border px-2.5 text-xs font-medium transition active:scale-95 ${
                  on
                    ? 'border-accent bg-state-good-bg text-state-good-fg'
                    : 'border-border-strong bg-surface text-fg-secondary'
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
