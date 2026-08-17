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
//
// §12 "Chuyển động": nền ô đang chọn TRƯỢT trong track 120ms, nội dung đổi tức thì.
// Nền đó là MỘT phần tử duy nhất nằm sau các nút (không phải nền của từng nút), vì chỉ
// một phần tử di chuyển thì mới có cái gì để nội suy — tô/xoá nền của hai nút khác nhau
// thì trình duyệt không có đường nào nối hai hình chữ nhật đó lại.
//
// Vị trí nền ĐO từ nút đang chọn thay vì tính `100%/n`: bộ nút có `stretch={false}` (3
// chỗ ở Tài sản) để các mục co theo chữ, nên chia đều là lệch. Đo cũng là cách duy nhất
// đúng khi người dùng phóng cỡ chữ (--app-font-scale) hoặc đổi bề rộng cửa sổ — nên có
// ResizeObserver trên track.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

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
  const trackRef = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  // Đo sau khi bày (useLayoutEffect) chứ không sau khi vẽ: đo bằng useEffect thì có một
  // khung hình nền nằm sai chỗ, và ở lần bấm đầu tiên nó trượt từ vị trí cũ về chỗ mới
  // hai lần liền.
  // CỐ Ý không có mảng phụ thuộc: chạy lại sau MỌI lượt bày. Bề rộng nút không chỉ đổi
  // khi `value`/`items` đổi — nó đổi cả khi trang thu hẹp cột, khi nhãn tab đổi chữ, khi
  // font vừa nạp xong. Chốt an toàn nằm ở `setPill` bên dưới: nó trả về CHÍNH object cũ
  // khi số đo không đổi, nên không có vòng lặp bày-lại nào.
  useLayoutEffect(() => {
    const track = trackRef.current
    const el = track?.querySelector<HTMLElement>('[data-seg-active="true"]')
    if (!track || !el) return
    const measure = () => {
      const left = el.offsetLeft
      const width = el.offsetWidth
      setPill((cur) => (cur && cur.left === left && cur.width === width ? cur : { left, width }))
    }
    measure()
    // ResizeObserver cho những lần đổi KHÔNG đi qua React: kéo cạnh cửa sổ, phóng cỡ chữ
    // ở Cài đặt, font vừa nạp xong. Không có nó thì nền nằm lệch cho tới lần bấm sau.
    const ro = new ResizeObserver(measure)
    ro.observe(track)
    return () => ro.disconnect()
  })

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label={label}
      className={`relative flex rounded-lg border border-border-panel bg-transparent p-0.5 font-medium ${s.track} ${className}`.trim()}
    >
      {/* Nền ô đang chọn. Chỉ vẽ sau lần đo đầu: vẽ trước khi biết chỗ thì nó xuất hiện
          ở mép trái rồi trượt sang — một chuyển động lúc MỞ MÀN, đúng thứ "console
          không trôi" cấm. Phần tử mới chèn vào không chạy transition, nên lần đo đầu
          không tạo hoạt ảnh nào. */}
      {pill && (
        <span
          aria-hidden
          // `left-0` KHÔNG dư: thiếu nó thì mốc ngang của nền là "vị trí tĩnh" của một
          // phần tử flex, tức mép CONTENT box (đã trừ padding p-0.5 của track), trong khi
          // `offsetLeft` đo từ mép PADDING box — cộng hai thứ vào nhau là đếm padding hai
          // lần và nền lệch phải đúng 2px. Đo được trên /so trước khi thêm.
          className="pointer-events-none absolute inset-y-0.5 left-0 rounded-md border border-border-strong bg-surface-sunken motion-segment"
          style={{ width: pill.width, transform: `translateX(${pill.left}px)` }}
        />
      )}
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-seg-active={active ? 'true' : undefined}
            onClick={() => onChange(item.value)}
            // `relative` để chữ nằm TRÊN nền tuyệt đối ở trên. Viền trong suốt ở cả hai
            // trạng thái (nền mới là thứ mang viền đậm): cho riêng ô đang chọn một viền
            // thì mỗi lần bấm tab, chữ của mọi ô xê 1px — thấy rõ trên dải 4 tab của Sổ.
            className={`relative rounded-md border border-transparent ${s.item} ${
              stretch ? 'flex-1' : 'shrink-0'
            } ${active ? (item.activeClassName ?? 'text-fg-primary') : 'text-fg-muted hover:text-fg-primary'}`}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
