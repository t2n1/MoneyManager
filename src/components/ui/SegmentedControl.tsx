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
      className={`flex rounded-lg bg-surface-sunken p-0.5 font-medium ${s.track} ${className}`.trim()}
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
            className={`rounded-md transition ${s.item} ${stretch ? 'flex-1' : 'shrink-0'} ${
              active
                ? `bg-surface shadow-sm ${item.activeClassName ?? 'text-fg-primary'}`
                : 'text-fg-on-track hover:text-fg-primary'
            }`}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
