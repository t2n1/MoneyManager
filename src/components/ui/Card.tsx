// Thẻ — gom idiom `rounded-xl` + nền thẻ + `p-3 shadow-sm` xuất hiện
// ~70 lần (27× kèm p-3, 11× p-4, 9× không padding, 5× text-center...).
//
// `elevation` là lý do chính component này tồn tại: hiện 29 thẻ trong features/reports
// dùng ĐÚNG một kiểu, nên màn Báo cáo xếp 5 thẻ dọc mà "Cơ cấu chi tiêu" đọc to y như
// "Theo thẻ" — không có phân cấp. Có prop thì hạ thẻ phụ xuống 'flat' được mà không
// phải đụng layout.
import type { ElementType, ReactNode } from 'react'

/** 'raised' = nổi (thẻ chính) · 'flat' = viền, không đổ bóng (thẻ phụ)
 *  'panel'  = khung của bản 1a: bán kính 8px, viền --border-panel, KHÔNG bóng */
export type CardElevation = 'raised' | 'flat' | 'panel'
export type CardPadding = 'none' | 'sm' | 'md' | 'lg' | 'panel'

// Bán kính nằm TRONG bảng này, không ở BASE. Không phải để cho gọn: 'panel' là 8px
// (rounded-lg) còn hai dáng kia là 12px (rounded-xl), mà hai lớp bán kính cùng hạng
// thì Tailwind quyết theo THỨ TỰ TRONG CSS chứ không theo thứ tự trong chuỗi class —
// rounded-xl sinh ra sau rounded-lg nên nó luôn thắng. Để chung ở BASE thì 'panel'
// lặng lẽ vẫn 12px và không có gì báo sai.
//
// 'raised' ở dark bỏ shadow và thay bằng viền panel: 1a bỏ hẳn đổ bóng, phân cấp bằng
// nền + viền. Bóng trên nền #0e1014 gần như vô hình nên nó chỉ còn là một vệt tối bẩn
// quanh thẻ. Cố ý dùng `dark:` chứ không đổi cả hai chế độ — light giữ nguyên diện mạo
// (và giữ nguyên cả hình học: viền chỉ mọc thêm ở dark, nơi cả thang bề mặt đã đổi).
const ELEVATION: Record<CardElevation, string> = {
  raised: 'rounded-xl shadow-sm dark:border dark:border-border-panel dark:shadow-none',
  flat: 'rounded-xl border border-border-subtle',
  panel: 'rounded-lg border border-border-panel',
}

const PADDING: Record<CardPadding, string> = {
  none: '',
  sm: 'p-2.5',
  md: 'p-3',
  lg: 'p-4',
  // 16px ngang / 14px dọc — mật độ panel của 1a (§1.4: padding trong panel 12–16px).
  panel: 'px-4 py-3.5',
}

interface Props {
  children: ReactNode
  elevation?: CardElevation
  padding?: CardPadding
  /** Đổi thẻ bọc — dùng 'section' khi thẻ là một khối nội dung có tiêu đề. */
  as?: ElementType
  className?: string
}

export function Card({
  children,
  elevation = 'raised',
  padding = 'md',
  as: Tag = 'div',
  className = '',
}: Props) {
  return (
    <Tag
      className={`bg-surface ${ELEVATION[elevation]} ${PADDING[padding]} ${className}`.trim()}
    >
      {children}
    </Tag>
  )
}
