// Đường xu hướng tí hon đặt ngay trong một dòng — mượn cách permtrack nhét đồ thị nhỏ
// vào từng bước của dòng thời gian, kèm một con số delta bên cạnh.
//
// Không có trục, không nhãn, không tooltip: nó chỉ trả lời "đang đi lên hay đi xuống",
// còn con số chính xác đã nằm ngay cạnh nó trong cùng dòng.
// Tên file logic là `sparklinePath.ts`, KHÔNG phải `sparkline.ts`: trên Windows tên file
// chỉ khác hoa/thường bị coi là cùng một file, nên `sparkline.ts` sẽ đụng `Sparkline.tsx`.
import { sparklinePath } from './sparklinePath'

interface Props {
  values: number[]
  /** Mô tả cho trình đọc màn hình — hình này không tự nói được nó vẽ cái gì. */
  label?: string
  className?: string
}

export function Sparkline({ values, label = 'Xu hướng gần đây', className = '' }: Props) {
  const W = 60
  const H = 20
  const d = sparklinePath(values, W, H)
  // Chưa đủ hai điểm thì tự ẩn — nơi gọi không phải tự kiểm tra.
  if (!d) return null

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className={`shrink-0 overflow-visible ${className}`.trim()}
      role="img"
      aria-label={label}
    >
      {/* sky-600 chứ không sky-500: nét đồ thị cần tương phản 3:1 (WCAG 1.4.11), mà
          sky-500 chỉ đạt 2,77:1 trên nền trắng — designSystem.test.ts cấm cứng. */}
      <path
        d={d}
        fill="none"
        stroke="var(--color-sky-600)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
