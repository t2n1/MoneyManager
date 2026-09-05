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

export type SegmentedSize = 'sm' | 'md' | 'lg'

// Export để test được bằng hàm thuần: repo không render component trong test
// (0 file *.test.tsx, không có @testing-library), nên bảng tra phải tự kiểm được.
export const SIZE: Record<SegmentedSize, { track: string; item: string }> = {
  sm: { track: 'text-sm', item: 'py-2.5' },
  md: { track: 'text-sm', item: 'py-2.5' },
  // 46px: py-3 (12px×2) + line-height 20px + border 2px (mỗi button có border
  // border-transparent 1px trên + dưới). Trên mặt yêu cầu 44px (vùng chạm), 46px
  // vượt quá 2px. Dành cho control CHÍNH của một màn — màn Nhập, nơi ô segmented
  // không nằm trong danh sách miễn trừ vùng chạm.
  // KHÔNG sửa `md` để đạt 44px: 11 file khác đang dùng nó (Tài sản, Đầu tư, Báo cáo,
  // Sổ, RecurringFormSheet, roleFields…), đổi là đổi chiều cao ở cả 11 màn.
  lg: { track: 'text-sm', item: 'py-3' },
}

/**
 * Bề ngang: GIÃN đầy hàng, hay CO theo chữ. Hàm thuần vì repo không render component
 * trong test — cùng lý do với bảng SIZE ở trên.
 *
 * Padding NGANG đi cùng cách giãn, không đi cùng cỡ — nên nó ở đây chứ không ở SIZE:
 *   · giãn → mục `flex-1`, ở đó `px-1` gần như vô nghĩa (bề rộng do flex chia, không
 *            do padding). Track không cần chốt bề ngang: một flex container mức khối
 *            vốn đã đầy hàng.
 *   · co   → mục `shrink-0` + `px-3`: lúc này padding LÀ thứ duy nhất tách hai nhãn,
 *            `px-1` (4px) làm chúng gần như chạm nhau. Và track phải `w-fit`, chứ không
 *            thì trong một cha mức khối (hoặc `flex-col`) nó vẫn kéo viền hết hàng: mục
 *            co lại xong, còn cái hộp viền dài 1800px bọc quanh chỗ trống — đúng cái
 *            nhìn thấy trên /so và /reports ở màn 1920px.
 *
 * 'lg' là chế độ của DẢI TAB CẤP TRANG (Sổ, Báo cáo, Phạm vi, Đầu tư): điện thoại
 * giãn, từ lg mới co. Không cho nó co ở mọi cỡ, và đây là số đo chứ không phải e dè:
 * bốn tab "Tháng · Dài hạn · Sức khỏe · Quyết định" co theo chữ đo được 326px, nhân
 * cỡ chữ "Rất lớn" (`--app-font-scale` 1.25) ra ~408px, trong khi màn 320px chỉ còn
 * 296px. Mục `shrink-0` thì tràn ra ngoài track — và tràn ngang ở màn Sổ là bệnh đã
 * biết (vuốt dọc bị lệch ngang, xem chú thích hàng header của LedgerPage). Giãn thì
 * mục tự co, chữ xuống dòng, không tràn.
 *
 * `false` vẫn là "co ở MỌI cỡ" — dành cho dải nằm CẠNH control khác trong một hàng
 * flex (Tài sản, cơ cấu danh mục), nơi giãn không có nghĩa gì.
 */
export type SegmentedStretch = boolean | 'lg'

export function stretchClasses(stretch: SegmentedStretch): { track: string; item: string } {
  if (stretch === 'lg')
    return { track: 'lg:w-fit', item: 'flex-1 px-1 lg:flex-none lg:shrink-0 lg:px-3' }
  return stretch
    ? { track: '', item: 'flex-1 px-1' }
    : { track: 'w-fit', item: 'shrink-0 px-3' }
}

interface Props<T extends string> {
  items: readonly SegmentedItem<T>[]
  value: T
  onChange: (value: T) => void
  /** Bắt buộc: trình đọc màn hình cần biết bộ nút này để chọn CÁI GÌ. */
  label: string
  size?: SegmentedSize
  /**
   * 'lg' cho dải tab cấp trang (giãn ở điện thoại, co theo chữ từ desktop);
   * 'false' khi bộ nút nằm cạnh nội dung khác trong một hàng flex.
   */
  stretch?: SegmentedStretch
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
  const w = stretchClasses(stretch)
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
      // Pill track của redesign 2: nền chrome (lùi sau nội dung) + viền panel, bo tròn
      // hết cỡ. font-semibold cho MỌI mục — active không được đổi độ đậm riêng, không
      // thì bề rộng nhãn đổi theo và nền trượt phải đo lại giữa chừng.
      className={`relative flex rounded-full border border-border-panel bg-surface-chrome p-0.5 font-semibold ${s.track} ${w.track} ${className}`.trim()}
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
          // Ô đang chọn của redesign 2: nền accent pha loãng + ring TRONG (box-shadow,
          // không chiếm chỗ nên không có chuyện chữ xê 1px khi đổi tab).
          className="pointer-events-none absolute inset-y-0.5 left-0 rounded-full bg-accent-soft ring-1 ring-accent-soft-ring ring-inset motion-segment"
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
            className={`relative rounded-full border border-transparent ${s.item} ${w.item} ${active ? (item.activeClassName ?? 'text-fg-accent-on-track') : 'text-fg-muted hover:text-fg-primary'}`}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
