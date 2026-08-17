// Nút gạt phân đoạn — hiện đang được viết lại bằng tay ở 6 chỗ (Sổ GD, Báo cáo ×2,
// Cơ cấu danh mục, Tổng hợp, Tài sản, Dữ liệu), mỗi chỗ lệch nhau một ít về a11y và
// trạng thái hover.
//
// Hai thứ bản gộp này sửa được mà bản chép tay không:
//   1. a11y đúng: role="tablist" + aria-selected. ReportsPage đang dùng
//      aria-current="page" cho bộ đổi CÁCH XEM — sai nghĩa, đó không phải điều hướng
//      trang, và trình đọc màn hình sẽ đọc thành "trang hiện tại".
//   2. Nhãn mục không hoạt động dùng --fg-on-track (gray-600), không phải gray-500:
//      track là nền gray-100, ở đó gray-500 chỉ đạt 4,39:1 → trượt AA.
//
// Bản 1a ĐẢO hai bề mặt: track thành trong suốt có viền, còn ô ĐANG CHỌN mới là ô có
// nền (--surface-sunken) và viền đậm hơn. Trước đây ô đang chọn nổi lên bằng shadow —
// 1a bỏ hẳn shadow nên tín hiệu "đang chọn" phải là nền + viền.
//
// Điều đó cũng gỡ luôn lý do tồn tại của lưu ý (2) Ở ĐÂY: track không còn nền gray-100
// của riêng nó, nhãn mục không hoạt động nằm thẳng trên nền thẻ/trang, nên --fg-muted
// đủ AA (4,84:1 trên trắng · 4,63:1 trên gray-50). Lưu ý (2) vẫn đúng cho mọi chỗ
// KHÁC còn có track có nền — đừng đọc thành "gray-500 lúc nào cũng được".
import type { ReactNode } from 'react'

export interface SegmentedItem<T extends string> {
  value: T
  label: ReactNode
  /** Lớp màu chữ khi mục này đang chọn. Mặc định là màu chữ chính. */
  activeClassName?: string
}

export type SegmentedSize = 'sm' | 'md'

const SIZE: Record<SegmentedSize, { track: string; item: string }> = {
  sm: { track: 'text-xs', item: 'px-3 py-2.5' },
  md: { track: 'text-sm', item: 'px-1 py-2.5' },
}

interface Props<T extends string> {
  items: readonly SegmentedItem<T>[]
  value: T
  onChange: (value: T) => void
  /** Bắt buộc: trình đọc màn hình cần biết bộ nút này để chọn CÁI GÌ. */
  label: string
  size?: SegmentedSize
  /** false khi bộ nút nằm cạnh nội dung khác thay vì chiếm hết bề ngang. */
  stretch?: boolean
  className?: string
}

export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  label,
  size = 'md',
  stretch = true,
  className = '',
}: Props<T>) {
  const s = SIZE[size]
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`flex rounded-lg border border-border-panel bg-transparent p-0.5 font-medium ${s.track} ${className}`.trim()}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            // Viền có ở CẢ hai trạng thái, chỉ đổi màu: cho riêng ô đang chọn một viền
            // thì mỗi lần bấm tab, chữ của mọi ô xê 1px — thấy rõ trên dải 4 tab của Sổ.
            className={`rounded-md border transition ${s.item} ${stretch ? 'flex-1' : 'shrink-0'} ${
              active
                ? `border-border-strong bg-surface-sunken ${item.activeClassName ?? 'text-fg-primary'}`
                : 'border-transparent text-fg-muted hover:text-fg-primary'
            }`}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
